// world.js — the simulation itself: the container that steps time forward.
//
// One tick:
//   1. rebuild spatial grids for creatures and food
//   2. for each creature: find nearest food + neighbour, sense, think, act
//   3. resolve eating (creature over a pellet consumes it)
//   4. resolve reproduction (energetic creatures split)
//   4b. push overlapping bodies apart (`bodyCollision` only)
//   5. remove the dead, compact eaten food, spawn new food (and note that step
//      5 is what has always given a death its moment — see `deathIsFinal`)
//   6. safety valves: population cap, auto-reseed if life dies out
//
// Within a tick — the rule this file went forty-six versions without stating,
// which is how v1.45 came to find a bug inside it:
//
//   * Step 2 is a **sequential** sweep, not a simultaneous update. Each
//     creature senses the pond as the ones before it have already left it, so
//     it can move onto a pellet a neighbour ate a microsecond ago, or be bitten
//     to death before its own turn comes round.
//   * The sweep's order is the order of `this.creatures`, and that array is
//     birth order: step 5 keeps survivors in place and appends the newborns.
//     **Seniority therefore decides every contest inside a tick** — see
//     `shuffleTurnOrder` in config.js for the control arm, and `stats.contested`
//     and `stats.crowdedOut` for the two events it settles.
//   * Three things deliberately step out of that order, each because reading
//     stale state is the *fairer* answer: contagion (1b) judges exposure on the
//     positions everyone held before anyone moved, a call is heard as it was
//     emitted last tick (`prevSignal`), and newborns land in `born` and take no
//     turn until the tick after the one they were born in.
//   * A fourth, when this world has bodies that exclude each other: step 4b
//     reads every position after everyone has moved and applies every shove at
//     once. It is the one rule here that is exactly simultaneous — no creature's
//     displacement can depend on its index, because none of them is written
//     until all of them are computed.
//
// The world owns its own RNG, so a (seed, config) pair fully determines the
// entire future — a property the tests and the "share a seed" feature rely on.

import { RNG } from "./rng.js";
import { SpatialGrid } from "./grid.js";
import { FoodField, Food, Corpse } from "./food.js";
import { Creature } from "./creature.js";
import { Genome } from "./genome.js";
import { NeatGenome } from "./neat.js";
import { Stats } from "./stats.js";
import { Phylogeny } from "./phylogeny.js";
import { Chronicle } from "./chronicle.js";
import { FertilityField, seasonalFactor, seasonPhase, dayNightVisionFactor } from "./environment.js";
import { TerrainField } from "./terrain.js";
import { BarrierField } from "./barriers.js";
import { DetritusField } from "./detritus.js";
import { EnergyLedger } from "./energy.js";
import { torusDist2, wrapDelta, wrap } from "./vec.js";

export class World {
  constructor(config) {
    this.config = config;
    this.rng = new RNG(config.seed);
    this.tick = 0;

    // The phylogeny watches the population and groups it into species. It must
    // exist before we make the founders, so it can classify them.
    this.phylogeny = new Phylogeny(config);

    // Spatial structure: the fertility field (biomes) is built from the RNG so a
    // seed reproduces the same landscape. Food spawns preferentially in it.
    this.environment = new FertilityField(config, this.rng);
    this.seasonFactor = seasonalFactor(0, config);
    this.seasonPhase = seasonPhase(0, config);
    this.visionFactor = dayNightVisionFactor(0, config);

    // The ground itself, when this world has any. Built by hashing the seed
    // rather than by drawing from `this.rng`, so constructing it costs exactly
    // zero draws — a world with terrain off is bit-for-bit every earlier
    // version's. It is built before the food field because the crop follows it:
    // pellets are less likely to take on a ridge.
    /** @type {TerrainField|null} */
    this.terrain = null;
    this.syncTerrain();

    // What the ground remembers of its dead. Like the terrain it costs zero
    // draws to build (it starts empty — nothing has died yet), and like the
    // terrain it is null in every world without the feature.
    /** @type {DetritusField|null} */
    this.detritus = null;
    this.syncDetritus();

    // The rock, when this world has any. Hash-derived like the terrain, so it
    // costs zero draws, and built before the crop and the founders because both
    // have to be placed out of it.
    /** @type {BarrierField|null} */
    this.barriers = null;
    this.syncBarriers();

    this.food = new FoodField(
      config,
      this.rng,
      this.environment,
      this.terrain,
      this.detritus,
      this.barriers
    );

    // The books. Pure bookkeeping written alongside events that happen anyway —
    // it draws no randomness and nothing in the simulation reads it, so its
    // presence cannot move a world by a floating-point bit. Built before the
    // founders so their starting energy is on the record from tick zero.
    this.energy = new EnergyLedger();

    /** @type {Creature[]} */
    this.creatures = [];
    for (let i = 0; i < config.populationStart; i++) {
      const c = this._randomCreature();
      this.phylogeny.assign(c, 0, null); // founders have no parent species
      this.creatures.push(c);
    }

    // Grids sized so each cell is about one vision radius across — that keeps
    // the 3x3 query window a good match for what a creature can actually see.
    const cell = Math.max(40, config.visionRadius * 0.75);
    this.creatureGrid = new SpatialGrid(config.width, config.height, cell);
    this.foodGrid = new SpatialGrid(config.width, config.height, cell);
    // Corpses (scavenging). Empty and unused unless the feature is on.
    /** @type {import('./food.js').Corpse[]} */
    this.corpses = [];
    this.corpseGrid = new SpatialGrid(config.width, config.height, cell);

    this.stats = new Stats();
    this.stats.sample(this);
    this.phylogeny.sample(this, 0);

    // The chronicle narrates the world's history. Pure observer, like the
    // phylogeny — reads state, never changes it, uses its own RNG.
    this.chronicle = new Chronicle(config);
  }

  /**
   * Build or discard the terrain field to match the config. Called at birth and
   * whenever the toggle moves, so switching terrain off mid-run also puts every
   * living creature back on flat ground instead of leaving it paying a stale
   * bill forever.
   */
  syncTerrain() {
    if (this.config.terrain) {
      if (!this.terrain) this.terrain = new TerrainField(this.config);
    } else if (this.terrain) {
      this.terrain = null;
      for (const c of this.creatures) c.ground = 1;
    }
    // The crop follows the ground, so the food field needs to know about it too.
    // (Absent on the first call, which happens before the field exists.)
    if (this.food) this.food.terrain = this.terrain;
  }

  /**
   * Build or discard the nutrient field to match the config. Switching detritus
   * off drops the field outright rather than leaving it in place unread: the
   * renderers key their caches on the object, so a dropped field cannot leave a
   * stale map on screen, and switching back on starts the pond's memory from
   * whatever dies next rather than from a die-off nobody watching remembers.
   */
  syncDetritus() {
    if (this.config.detritus) {
      if (!this.detritus) this.detritus = new DetritusField(this.config);
    } else {
      this.detritus = null;
    }
    if (this.food) this.food.detritus = this.detritus;
  }

  /**
   * Build or discard the rock to match the config.
   *
   * Switching barriers on under a running pond leaves creatures and pellets
   * standing inside the new walls, so both are pushed out — the alternative is
   * a pond that spends its first hundred ticks walking out of the scenery and a
   * crop with a permanently unreachable share. Switching them off drops the
   * field outright, which also drops the renderers' caches: they key on the
   * object, so a discarded layout cannot leave a stale wall on screen.
   */
  syncBarriers() {
    if (this.config.barriers) {
      if (!this.barriers) {
        this.barriers = new BarrierField(this.config);
        // Both collections are absent on the first call, which happens in the
        // constructor before either exists — the founders and the opening crop
        // are placed out of the rock by their own paths instead.
        if (this.creatures) {
          for (const c of this.creatures) {
            const p = this.barriers.eject(c.x, c.y);
            c.x = p.x;
            c.y = p.y;
          }
        }
        if (this.food) {
          for (const f of this.food.items) {
            const p = this.barriers.eject(f.x, f.y);
            f.x = p.x;
            f.y = p.y;
          }
        }
      }
    } else if (this.barriers) {
      this.barriers = null;
      for (const c of this.creatures) c.walled = false;
    }
    if (this.food) this.food.barriers = this.barriers;
  }

  _randomCreature() {
    const cfg = this.config;
    // A fresh genome of whichever kind this world uses. When evolvableTopology is
    // off (the default), this is exactly Genome.random(this.rng) as before, so
    // the RNG stream — and thus every existing world — is unchanged.
    const genome = cfg.evolvableTopology
      ? NeatGenome.random(this.rng)
      : Genome.random(this.rng, cfg.signalling, cfg.groundSense);
    // The two draws happen either way, and the ejection that may follow costs
    // none: a founder that lands in rock is moved to the nearest open ground
    // rather than re-rolled, so the stream is identical in both kinds of world.
    const spot = this._openSpot(this.rng.range(0, cfg.width), this.rng.range(0, cfg.height));
    const c = new Creature(genome, cfg, spot.x, spot.y, this.rng, 0);
    // A creature made from scratch arrives with `energyStart` that came from
    // nowhere. Every path that conjures life — the founding population, the
    // auto-reseed after a crash, the "seed life" button — goes through here, so
    // this is the one place that has to say so.
    this.energy.found(c.energy);
    return c;
  }

  /**
   * A point, moved out of the rock if it landed in any. Exactly the point it
   * was given in every world without barriers — no field, no call, no branch
   * that could round differently.
   * @param {number} x @param {number} y
   */
  _openSpot(x, y) {
    return this.barriers ? this.barriers.eject(x, y) : { x, y };
  }

  /**
   * Offer `fn` the neighbours of (x, y) that a sense reaching `radius` may find.
   *
   * The two arms are the whole of the `exactVision` feature. Off (the default),
   * this is the 3x3 block of grid cells v1.0 asked for and `radius` is ignored
   * — the same candidates, in the same order, so a world is unchanged down to
   * the last bit. On, the query covers the disc it was given, and a creature
   * sees everything inside its vision radius rather than everything inside the
   * part of it the index happened to index.
   */
  _scan(grid, x, y, radius, fn) {
    if (this.config.exactVision) grid.forEachWithin(x, y, radius, fn);
    else grid.forEachNear(x, y, fn);
  }

  /**
   * The order step 2 takes its turns in.
   *
   * Off (the default) this returns `this.creatures` itself — the same array the
   * loop has walked since v1.0, with no copy made, no branch inside the sweep
   * and no random number drawn. On, it is a fresh Fisher–Yates permutation each
   * tick, drawn from the world RNG, so seniority stops paying.
   *
   * Note what the shuffle is *not*: it is not a simultaneous update. Somebody
   * still goes first — the point is only that who it is stops being a fact
   * about how long they have been alive.
   */
  _turnOrder() {
    if (!this.config.shuffleTurnOrder) return this.creatures;
    const order = this.creatures.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = this.rng.int(0, i);
      const t = order[i];
      order[i] = order[j];
      order[j] = t;
    }
    return order;
  }

  /**
   * Push overlapping bodies apart (step 4b, `bodyCollision` only).
   *
   * One pass, in two halves, and the split is the whole design: every
   * displacement is computed from the positions everyone holds *now*, and not
   * one of them is written until all of them are known. So the answer does not
   * depend on the order this loop happens to walk in — unlike every other rule
   * in `step()`, which is why this is the one place the tick is simultaneous.
   *
   * A pair overlapping by `o` each gives up `o / 2`, along the line between
   * them, whatever their sizes — unless `massWeightedShove` is on, in which
   * case the split is inverse to `r²` and the smaller body gives up most of it
   * (v1.63). Two things follow that are worth stating rather than discovering:
   *
   *   * A body in a crush takes the sum of what each of its neighbours asks of
   *     it, which can over- or under-shoot. This is a relaxation step, not a
   *     solver: a pile loosens over several ticks instead of resolving in one.
   *     `stats.jostled` counts what it is doing, so a pond that never unpiles
   *     says so.
   *   * Two bodies at *exactly* the same point have no line to be pushed apart
   *     along, so they are left alone for this tick. Anything at all that moves
   *     either of them gives the next tick an axis to work with, and a shove is
   *     the one thing here that cannot manufacture one out of nothing without a
   *     random number — which this pass does not have and must not take.
   *
   * The grid is rebuilt first because the one from step 1 holds pre-move
   * positions, and a contact rule read off a stale index is v1.32's bug with a
   * shorter radius. The query is `forEachWithin` directly rather than `_scan`:
   * what two bodies touching means cannot depend on a *sight* setting.
   */
  _separate() {
    const cfg = this.config;
    // The dead are excluded: they are swept up at step 5 and the rest of the
    // pond has treated them as gone since v1.0. A corpse does not hold a place.
    const live = [];
    for (const c of this.creatures) if (!c.dead) live.push(c);
    if (live.length < 2) return;

    this.creatureGrid.clear();
    for (const c of live) this.creatureGrid.insert(c);

    // The widest two bodies that could possibly touch. Nothing beyond this can
    // overlap anything, so it is the exact reach of the question.
    const reach = cfg.bodyRadiusMax * 2;
    // Who yields, and by how much. Off: half each, which is v1.56's rule and
    // the arithmetic every earlier world was built on. On: inverse to mass,
    // where mass is area — so the *other* body's `r²` is this body's share of
    // the overlap, and a heavy neighbour is a wall while a light one is not.
    const byMass = cfg.massWeightedShove;
    const n = live.length;
    const pushX = new Float64Array(n);
    const pushY = new Float64Array(n);
    let visits = 0;

    for (let i = 0; i < n; i++) {
      const c = live[i];
      this.creatureGrid.forEachWithin(c.x, c.y, reach, (o) => {
        if (o === c) return;
        const dx = wrapDelta(c.x, o.x, cfg.width);
        const dy = wrapDelta(c.y, o.y, cfg.height);
        const d2 = dx * dx + dy * dy;
        const sum = c.radius + o.radius;
        if (d2 >= sum * sum || d2 === 0) return;
        const d = Math.sqrt(d2);
        // The two sides compute this independently and their shares sum to the
        // overlap, because `mo/(mc+mo) + mc/(mc+mo)` is 1 — to within an ulp
        // when the masses differ, and exactly when they do not.
        const mine = byMass
          ? (o.radius * o.radius) / (c.radius * c.radius + o.radius * o.radius)
          : 0.5;
        const share = (sum - d) * mine;
        pushX[i] -= (dx / d) * share;
        pushY[i] -= (dy / d) * share;
        visits++;
      });
    }

    // Every overlapping pair is seen exactly twice — once from each side, on a
    // symmetric predicate — so the count of pairs is exact, not rounded.
    this.stats.jostled += visits / 2;

    for (let i = 0; i < n; i++) {
      if (pushX[i] === 0 && pushY[i] === 0) continue;
      const c = live[i];
      const nx = wrap(c.x + pushX[i], cfg.width);
      const ny = wrap(c.y + pushY[i], cfg.height);
      if (this.barriers) {
        // Rock refuses a shove exactly as it refuses a step. Velocity is left
        // alone and `walled` is not set: neither belongs to a push, which is
        // something done *to* a creature rather than by it.
        const hit = this.barriers.resolve(c.x, c.y, nx, ny);
        c.x = hit.x;
        c.y = hit.y;
      } else {
        c.x = nx;
        c.y = ny;
      }
    }
  }

  /** Advance the world by exactly one tick. */
  step() {
    const cfg = this.config;

    // 1. Spatial indexing.
    this.creatureGrid.clear();
    this.foodGrid.clear();
    for (const c of this.creatures) this.creatureGrid.insert(c);
    for (const f of this.food.items) this.foodGrid.insert(f);
    if (cfg.scavenging) {
      this.corpseGrid.clear();
      for (const k of this.corpses) this.corpseGrid.insert(k);
    }

    // 1b. Contagion, if the pathogen exists in this world at all. Runs on the
    // grid just built, before anything moves, so exposure is judged on the same
    // positions a watcher sees. Skipped entirely when the feature is off.
    if (cfg.disease) this._stepDisease();

    const born = [];

    // Effective vision radius for this tick. With the day/night cycle off,
    // visionFactor is a constant 1 and this is exactly cfg.visionRadius, so
    // sensing is unchanged unless the feature is switched on.
    const visionR2 = cfg.visionRadius * this.visionFactor * (cfg.visionRadius * this.visionFactor);

    // Earshot, when there is anything to hear. Unlike sight it does not shrink
    // at night — a voice carries in the dark, which is the whole point of having
    // one. Each creature broadcasts the signal it emitted *last* tick, frozen
    // here before anything moves, so what a creature hears never depends on
    // where it sits in the update order below.
    const earR2 = cfg.signalRadius * cfg.signalRadius;
    if (cfg.signalling) {
      for (const c of this.creatures) c.prevSignal = c.signal;
    }

    // How far the sense queries below have to reach, for a world that has asked
    // for the whole of what it configured (see `exactVision` in config.js).
    // Sight this tick, which the day/night cycle may have shrunk...
    const sightR = cfg.visionRadius * this.visionFactor;
    // ...and, for the creature scan, the widest of the three questions it
    // answers in one pass: sight, earshot — which deliberately does not shrink
    // at night, so on a dark tick it is the longest reach in the world — and a
    // mate search. Contact tests elsewhere (eating at 8px, biting, infection at
    // 22px) are far inside one cell, so the plain 3x3 block covers them exactly
    // and they are left alone.
    const nearbyR = Math.max(
      sightR,
      cfg.signalling ? cfg.signalRadius : 0,
      cfg.sexualReproduction ? cfg.mateRadius : 0
    );

    // The rock, if it is opaque in this world (v1.50). Null unless *both* flags
    // are on, so every world that has not asked for it takes one null test per
    // candidate and no branch that could move it. Every sense below asks the
    // same question of it — sight, earshot, a mate search — because a wall that
    // stops one kind of information and not another would be a rule nobody
    // could state.
    const rock = cfg.barrierOcclusion ? this.barriers : null;

    // 2. Sense, think, act, in the order `_turnOrder()` hands them over — which
    // is `this.creatures` itself unless this world has asked for a shuffle.
    for (const c of this._turnOrder()) {
      // A body killed earlier in this same tick — bitten to zero by a predator
      // that updated before it — takes no turn at all. The scans below already
      // skip `o.dead`, so the rest of the pond has treated it as gone since
      // v1.0; this is the actor finally agreeing. Exactly the sweep's job, done
      // at the moment of death instead of at the end of the tick. Skipped
      // entirely, and therefore free, in a world without the flag.
      if (cfg.deathIsFinal && c.dead) continue;

      // Nearest food within vision.
      let nf = null;
      let nfD2 = visionR2;
      // A pellet inside this creature's own reach that somebody earlier in the
      // turn order already took. `eaten` pellets are compacted out at the end of
      // every tick, so anything still flagged here was eaten *this* tick, by an
      // earlier turn — which makes this the exact record of what the order cost
      // it, and it is free: the scan is walking the pellet anyway. Counting
      // only; nothing in the simulation reads it.
      const eatR = cfg.eatRadius + c.radius * 0.4;
      const eatR2 = eatR * eatR;
      let missed = false;
      this._scan(this.foodGrid, c.x, c.y, sightR, (f) => {
        if (f.eaten) {
          if (!missed && torusDist2(c.x, c.y, f.x, f.y, cfg.width, cfg.height) <= eatR2) missed = true;
          return;
        }
        const d2 = torusDist2(c.x, c.y, f.x, f.y, cfg.width, cfg.height);
        if (d2 < nfD2) {
          // Only now, and only in a world with opaque rock: a pellet that is not
          // nearer than the best so far can never become the answer, so asking
          // whether a wall stands in front of it would be work with no reader.
          // The question is exact and it is not cheap — see barriers.js — so the
          // scan asks it of the two or three candidates that could change the
          // outcome rather than of every pellet in the block.
          if (rock && rock.occluded(c.x, c.y, f.x, f.y)) return;
          nfD2 = d2;
          nf = f;
        }
      });

      // Nearest prey (a creature c could eat) and nearest threat (a creature
      // that could eat c), found in a single scan of nearby cells.
      let prey = null;
      let preyD2 = visionR2;
      let threat = null;
      let threatD2 = visionR2;
      let mate = null; // nearest potential partner (sexual reproduction)
      let mateD2 = cfg.mateRadius * cfg.mateRadius;
      let loudest = 0; // strongest voice in earshot (signalling only)
      this._scan(this.creatureGrid, c.x, c.y, nearbyR, (o) => {
        if (o === c || o.dead) return;
        const d2 = torusDist2(c.x, c.y, o.x, o.y, cfg.width, cfg.height);
        if (rock) {
          // Same economy as the pellet scan above, over the three nearest-
          // queries and the one that is not a nearest-query: a neighbour who is
          // no nearer than the best prey, threat or mate so far and is saying
          // nothing cannot affect anything below, so the wall between them never
          // has to be looked for.
          const nearer =
            d2 < preyD2 || d2 < threatD2 || (cfg.sexualReproduction && d2 < mateD2);
          const audible = cfg.signalling && d2 < earR2 && o.prevSignal !== 0;
          if (!nearer && !audible) return;
          if (rock.occluded(c.x, c.y, o.x, o.y)) return;
        }
        // Hearing: a call fades linearly with distance, and the loudest one
        // wins — a single channel, so a creature has to be worth listening to
        // over its neighbours. Sign is preserved, so "loudest" means the largest
        // magnitude, not the most positive.
        if (cfg.signalling && d2 < earR2 && o.prevSignal !== 0) {
          const heard = o.prevSignal * (1 - Math.sqrt(d2) / cfg.signalRadius);
          if (Math.abs(heard) > Math.abs(loudest)) loudest = heard;
        }
        if (d2 < preyD2 && c.canEat(o)) {
          preyD2 = d2;
          prey = o;
        }
        if (d2 < threatD2 && o.canEat(c)) {
          threatD2 = d2;
          threat = o;
        }
        if (cfg.sexualReproduction && d2 < mateD2) {
          mateD2 = d2;
          mate = o;
        }
      });

      // Scavenging: a carnivore also perceives the nearest corpse as an edible
      // target. Whichever is nearer — a living prey or a corpse — becomes what it
      // homes in on, so scavenging reuses the very same hunting behaviour. With
      // scavenging off, no corpse is ever found, so preyTarget === prey exactly.
      let preyTarget = prey;
      let preyTargetD2 = preyD2;
      if (cfg.scavenging && c.carnivory >= cfg.carnivoreThreshold) {
        this._scan(this.corpseGrid, c.x, c.y, sightR, (k) => {
          if (k.energy <= 0) return;
          const d2 = torusDist2(c.x, c.y, k.x, k.y, cfg.width, cfg.height);
          if (d2 < preyTargetD2) {
            if (rock && rock.occluded(c.x, c.y, k.x, k.y)) return;
            preyTargetD2 = d2;
            preyTarget = k;
          }
        });
      }

      c.heard = loudest;
      // The ground it is standing on as it decides to move, read before it
      // moves so the bill doesn't depend on where in the update order it sits.
      // Untouched — and therefore exactly 1 — in a world without terrain.
      if (this.terrain) c.ground = this.terrain.costFactor(c.x, c.y);
      c.sense(
        nf,
        nf ? Math.sqrt(nfD2) : Infinity,
        preyTarget,
        preyTarget ? Math.sqrt(preyTargetD2) : Infinity,
        threat,
        threat ? Math.sqrt(threatD2) : Infinity
      );
      this.energy.burn(c.act(c.think(), this.barriers));
      // What the rock refused this turn. Exactly 0 in every world without it:
      // `walled` is only ever set from the resolver's answer.
      if (c.walled) this.stats.walled++;

      // ...and the other half of the same rule: `act()` has just paid this
      // creature's last bill and may have marked it starved or aged out. What
      // follows — a mouthful, a bite, a child — is the rest of a turn it no
      // longer has. The metabolism above is charged either way: it is the bill
      // that killed it.
      if (cfg.deathIsFinal && c.dead) continue;

      // 3a. Grazing: consume the nearest pellet if we're on top of it. Nutrition
      // from plants shrinks as a creature becomes more carnivorous, so pure
      // predators get almost nothing from grazing and must hunt.
      let grazed = false;
      if (nf && !nf.eaten) {
        if (nfD2 <= eatR2) {
          nf.eaten = true;
          grazed = true;
          const plantGain = cfg.foodEnergy * (1 - cfg.plantPenaltyFromDiet * c.carnivory);
          // A pellet is a place, not a battery: these units exist for the first
          // time here. What the eater had no room for is minted and lost in the
          // same instant, which is the only way that waste is ever visible.
          const before = c.energy;
          c.energy = Math.min(cfg.energyMax, c.energy + plantGain);
          this.energy.graze(plantGain, c.energy - before);
        }
      }
      // A meal the turn order cost it, and only that: a creature eats at most
      // one pellet a tick, so losing one of two it was standing on costs it
      // nothing. This counts the creatures that had a pellet in reach, found it
      // already taken, and went hungry.
      if (missed && !grazed) this.stats.contested++;

      // 3b. Feeding on flesh — the target is whichever the creature homed in on.
      // A corpse is scavenged; a living creature is bitten (predation). Both
      // respect the bite cooldown. With scavenging off, preyTarget is always a
      // living creature, so this is exactly the predation path as before.
      if (preyTarget && c.age - c.lastBiteAge >= cfg.biteCooldown) {
        if (preyTarget.isCorpse) {
          const reach = c.radius + cfg.scavengeRadius + 6;
          if (preyTargetD2 <= reach * reach && preyTarget.energy > 0) {
            const chunk = Math.min(preyTarget.energy, cfg.biteEnergy);
            preyTarget.energy -= chunk;
            const meal = chunk * cfg.meatEfficiency * c.carnivory;
            const before = c.energy;
            c.energy = Math.min(cfg.energyMax, c.energy + meal);
            // Flesh moves rather than appears; what the mouthful lost between
            // the corpse and the scavenger is the only new fact here.
            this.energy.bite(chunk, meal, c.energy - before);
            c.lastBiteAge = c.age;
            this.stats.scavenged++;
          }
        } else if (cfg.predation && !preyTarget.dead) {
          const reach = c.radius + preyTarget.radius + 2;
          if (preyTargetD2 <= reach * reach) {
            const amount = Math.min(preyTarget.energy, cfg.biteEnergy);
            preyTarget.energy -= amount;
            const meal = amount * cfg.meatEfficiency * c.carnivory;
            const before = c.energy;
            c.energy = Math.min(cfg.energyMax, c.energy + meal);
            this.energy.bite(amount, meal, c.energy - before);
            c.lastBiteAge = c.age; // for the rendering "flash"
            if (preyTarget.energy <= 0) {
              preyTarget.die("predation");
              this.stats.kills++;
            }
          }
        }
      }

      // 4. Reproduction (sexual if enabled and a partner is near, else asexual).
      if (c.canReproduce()) {
        if (this.creatures.length + born.length < cfg.populationMax) {
          const mateGenome = cfg.sexualReproduction && mate ? mate.genome : null;
          const child = c.reproduce(this.rng, mateGenome);
          // A child is placed behind its parent, which may be rock. Moved out
          // rather than refused: a birth denied by scenery would be a second,
          // undocumented population control living inside the walls.
          if (this.barriers) {
            const spot = this.barriers.eject(child.x, child.y);
            child.x = spot.x;
            child.y = spot.y;
          }
          // Classify the newborn: it joins its parent's species unless it has
          // drifted far enough to found a new one branching from it.
          this.phylogeny.assign(child, this.tick, c.speciesId);
          born.push(child);
          this.stats.births++;
        } else {
          // The pond is full, and which creatures get the last places was
          // settled by nothing but their index. The sharper of the two things
          // the turn order decides: a lost pellet is one meal, a refused split
          // is a whole line that does not start. Counting only — the refusal
          // itself is v1.0 behaviour and is unchanged.
          this.stats.crowdedOut++;
        }
      }
    }

    // 4b. Bodies, if this world has any that exclude each other. Runs after the
    // whole sweep, so every meal, bite and birth above was decided at the place
    // a creature reached under its own power — the shove is the pond's answer
    // to where everyone ended up, not a term in anybody's turn.
    if (cfg.bodyCollision) this._separate();

    // 5. Remove the dead; append newborns. When scavenging is on, each corpse
    // left behind holds meat proportional to the creature's body size —
    // recycling its biomass back into the food web.
    if (this.creatures.some((c) => c.dead)) {
      // The pond each of this tick's dead is about to be compared against: the
      // mean body radius of everyone who survives it. Computed once, before the
      // sweep touches anything, so every body dying this tick is measured
      // against the same pond however the loop happens to reach them — and only
      // on ticks where something died, so a quiet tick pays nothing. Null when
      // nothing survived, which is a pond with no size to have (see `sizedBy`).
      let poolSum = 0;
      let poolN = 0;
      for (const c of this.creatures) {
        if (c.dead) continue;
        poolSum += c.radius;
        poolN++;
      }
      const pool = poolN > 0 ? poolSum / poolN : null;
      const survivors = [];
      for (const c of this.creatures) {
        if (c.dead) {
          this.stats.deaths++;
          this.stats.recordDeath(c, pool);
          // Whatever it still held goes with it, charged to what killed it —
          // the same label `recordDeath` just counted, so the two ledgers are
          // reading the same body. A creature that starved finishes a hair
          // below zero — it paid its last bill in full — and that overdraft
          // belongs here as a small negative, against the metabolism it was
          // recorded as paying.
          this.energy.bury(c.energy, c.deathCause);
          // What the body is worth to the ground, if this world's ground keeps
          // anything. Computed whether or not detritus is on, because it costs
          // one multiply and it means switching the feature on mid-run doesn't
          // leave the corpses already lying about unable to rot into anything.
          const soil = c.radius * cfg.detritusPerRadius;
          if (cfg.scavenging) {
            // Meat is minted, not inherited: what a corpse is worth comes from
            // body size, not from what the creature had left. A scavenging world
            // therefore creates energy at every death as well as at every meal.
            const meat = cfg.corpseEnergyBase + c.radius * cfg.corpseEnergyPerRadius;
            this.energy.butcher(meat);
            // The body goes to the ground only as fast as it rots, so a corpse
            // stripped by scavengers reaches the soil with almost nothing left.
            // Spread over a full undisturbed rot this delivers exactly `soil`.
            this.corpses.push(new Corpse(c.x, c.y, meat, (soil * cfg.corpseDecay) / meat));
          } else if (this.detritus) {
            // No scavenging: the whole body goes straight into the ground.
            this.detritus.deposit(c.x, c.y, soil);
          }
        } else survivors.push(c);
      }
      this.creatures = survivors;
    }
    for (const b of born) this.creatures.push(b);

    // Corpses rot away over time (and shrink as they're fed on); drop the empty
    // ones. Skipped entirely when scavenging is off, so there's nothing to do.
    if (cfg.scavenging && this.corpses.length > 0) {
      let w = 0;
      for (let i = 0; i < this.corpses.length; i++) {
        const k = this.corpses[i];
        // Only what is actually there can rot: the last tick of a corpse takes
        // it below zero and it is dropped, so the bill for that tick is the
        // remainder, not the full decay rate. The nutrient it leaves in the
        // ground is *not* energy leaving by another door — detritus moves where
        // the crop grows, and a pellet grown there mints its own units like any
        // other. The two loops are in different currencies.
        this.energy.rot(Math.min(k.energy, cfg.corpseDecay));
        k.energy -= cfg.corpseDecay;
        // A rotting corpse feeds the ground under it. Note what this means when
        // both features are on: a scavenger eating a corpse is taking it out of
        // the soil's mouth. The two nutrient loops this project has built are in
        // competition, which is the most interesting thing about having both.
        if (this.detritus) this.detritus.deposit(k.x, k.y, k.soilRate);
        if (k.energy > 0) this.corpses[w++] = k;
      }
      this.corpses.length = w;
    }

    // Environment upkeep: drift the biomes, then spawn food (seasonally scaled,
    // placed by the now-updated fertility field).
    this.environment.update(cfg.biomeDrift);
    this.seasonFactor = seasonalFactor(this.tick, cfg);
    this.seasonPhase = seasonPhase(this.tick, cfg);
    this.visionFactor = dayNightVisionFactor(this.tick, cfg);
    // The ground forgets, a little, before it is asked to grow anything: this
    // tick's deaths are already in it, and what is left of older ones has faded
    // by one step. Nothing to do in a world with no memory.
    if (this.detritus) this.detritus.decay();
    this.food.compact();
    this.food.step(this.seasonFactor);

    // 6. Safety valves: don't let the toy die permanently or linger near-dead.
    // A full extinction gets a burst of founders; a near-crash gets a gentle
    // trickle so it recovers quickly rather than sitting at one or two creatures.
    if (cfg.autoReseed) {
      let reseed = 0;
      if (this.creatures.length === 0) reseed = cfg.reseedCount;
      else if (this.creatures.length < cfg.reseedFloor) reseed = 2;
      for (let i = 0; i < reseed; i++) {
        const c = this._randomCreature();
        this.phylogeny.assign(c, this.tick, null);
        this.creatures.push(c);
      }
    }

    this.tick++;
    this.stats.sample(this);
    this.phylogeny.sample(this, this.tick);
    this.chronicle.observe(this, this.tick);
  }

  /**
   * One tick of epidemiology: expose the susceptible, recover the long-sick,
   * and — if the pathogen has burned out — let a new case walk in.
   *
   * Only ever called when `config.disease` is on, so a world without the
   * feature draws not one random number here and is unchanged by its existence.
   * Order inside the tick matters for reproducibility, so it is fixed: every
   * infected host rolls against each susceptible neighbour it can reach (more
   * contacts really is more risk), the new cases are collected and applied only
   * *after* the whole pass, so an infection can't chain through three hosts
   * within a single tick, and the epidemic advances one hop at a time no matter
   * what order the creatures happen to sit in the array.
   */
  _stepDisease() {
    const cfg = this.config;
    const rock = cfg.barrierOcclusion ? this.barriers : null;
    const r2 = cfg.infectionRadius * cfg.infectionRadius;
    const caught = [];
    let sick = 0;

    for (const c of this.creatures) {
      if (!c.infected) continue;
      sick++;
      this.creatureGrid.forEachNear(c.x, c.y, (o) => {
        if (o === c || o.infected || o.immune || o.dead) return;
        const d2 = torusDist2(c.x, c.y, o.x, o.y, cfg.width, cfg.height);
        if (d2 > r2) return;
        // Opaque rock stops the pathogen too, and it stops it *before* the roll:
        // a contact the wall refused must not consume a random number, or the
        // walls would move the epidemic in every world they merely stand in.
        if (rock && rock.occluded(c.x, c.y, o.x, o.y)) return;
        if (this.rng.chance(cfg.infectionChance)) caught.push(o);
      });
    }

    // Recovery: an infection runs its course, and the survivor is immune for
    // life. Done before the new cases land so a creature that recovers this
    // tick can't be re-infected by an exposure from the same tick.
    for (const c of this.creatures) {
      if (c.infected && c.age - c.infectedAtAge >= cfg.diseaseDuration) {
        c.infected = false;
        c.immune = true;
        this.stats.recoveries++;
      }
    }

    for (const o of caught) {
      if (o.infected || o.immune) continue; // already exposed earlier in this pass
      o.infected = true;
      o.infectedAtAge = o.age;
      this.stats.infections++;
    }

    // Reintroduction: with no case left anywhere the pathogen is gone for good,
    // so one arrives on a fixed schedule — the first outbreak included. If the
    // creature it lands on happens to be immune, nothing takes hold and the
    // next window tries again.
    if (sick === 0 && caught.length === 0 && this.creatures.length > 0 && this.tick > 0) {
      if (this.tick % cfg.diseaseReintroduce === 0) {
        const host = this.creatures[this.rng.int(0, this.creatures.length - 1)];
        if (!host.immune) {
          host.infected = true;
          host.infectedAtAge = host.age;
          this.stats.infections++;
        }
      }
    }
  }

  /** Add n fresh random creatures (used by the "seed life" button). */
  addRandomCreatures(n) {
    for (let i = 0; i < n; i++) {
      if (this.creatures.length >= this.config.populationMax) break;
      const c = this._randomCreature();
      this.phylogeny.assign(c, this.tick, null);
      this.creatures.push(c);
    }
  }

  /** Scatter n food pellets (used by the "feed" button). */
  addFood(n) {
    for (let i = 0; i < n; i++) this.food.spawnOne();
  }

  /** Serialize the whole world for save/load. */
  toJSON() {
    return {
      tick: this.tick,
      seed: this.config.seed,
      creatures: this.creatures.map((c) => c.toJSON()),
      food: this.food.items.map((f) => ({ x: f.x, y: f.y })),
    };
  }

  loadJSON(obj) {
    this.tick = obj.tick || 0;
    this.creatures = obj.creatures.map((o) => Creature.fromJSON(o, this.config, this.rng));
    this.food.items = obj.food.map((f) => new Food(f.x, f.y));
    this.corpses = []; // corpses are transient; start the loaded world clean
    // The books start again with the loaded world. A save carries energy but no
    // history of where it came from, so the restored population counts as
    // founded — anything else would leave the identity in `EnergyLedger.audit`
    // permanently broken by however much the saved bodies happened to hold.
    this.energy = new EnergyLedger();
    for (const c of this.creatures) this.energy.found(c.energy);
    // The nutrient field is not serialised either, so a loaded world remembers
    // no deaths — it will start recording the ones it goes on to have.
    this.detritus = null;
    this.syncDetritus();
    // Species membership isn't serialised, so rebuild a fresh phylogeny by
    // re-clustering the restored population (each treated as a founder). The
    // deep history before the save is gone, but grouping resumes correctly.
    this.phylogeny = new Phylogeny(this.config);
    for (const c of this.creatures) this.phylogeny.assign(c, this.tick, null);
    this.phylogeny.sample(this, this.tick);
    this.chronicle = new Chronicle(this.config); // fresh history for the loaded world
  }
}
