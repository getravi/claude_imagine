// race.js — day one against today, in two lanes, with a finish line.
//
// This page has answered *have they actually evolved?* five times and every
// answer is a reading. `🧬 How they have changed` gives four sentences about
// means. `🎯 Are they getting better?` gives a share against a coin toss. The
// Muller plot, the size histogram and the chart stack give three pictures for
// somebody who already knows what those are. Every one of them asks the visitor
// to accept a number about a crowd they cannot see, and the honest description
// of what that feels like to a stranger is *the page told me it got better*.
//
// Nobody has to be told who won a race.
//
// So: two small ponds, side by side, running at the same time. Left lane is
// stocked with the animals **this pond was handed on its first step** — the
// genuine founders, not a re-roll, held by the page since the world was
// adopted. Right lane is stocked with the animals **in the water now**. Both
// ponds get the same seed, so the food falls in the same places and every
// animal starts on the same spot facing the same way. Neither gets a resupply:
// eighty specks go in, nothing more grows, and the question is who clears them.
// The only difference between the two worlds is what is inside the heads of the
// ten animals in each.
//
// That is the whole design, and the reason it is worth a panel is that it is
// the one claim on this page a visitor can check **without trusting me**. They
// can watch it happen. A statistic asks for belief; a race asks for two eyes.
//
// ### What it actually shows, measured
//
// Twelve seeds × three ages (1,500, 4,000 and 9,000 steps in), 36 races, with
// the constants below:
//
//   * **Today's animals won 34 of 36.**
//   * **Day one's animals cleared their pond in only 9 of those 36 races** —
//     three seeds, all three ages — and took 545 to 669 steps to do it. In the
//     other 27 the whistle went with a **median 51 of the 80 specks still
//     floating**.
//   * Across the 40 lanes that did clear, the range is 206 to 866 steps, median
//     373 — call it one to four seconds at the pace this runs on screen.
//
// The two races today's animals lost are the reason to ship the measurement
// rather than the claim. Both are seed 23, at 1,500 and 4,000 steps, and both
// are near-misses (52 left against 51, and 65 against 51) on a pond whose crowd
// is mid-crash — so the ten sampled out of it are ten survivors of a bad year
// rather than ten good foragers. By 9,000 steps the same seed wins comfortably.
// A board that can only report the flattering answer is a decoration, so the
// losing sentence is written too, and so is the dead heat — which is what a
// race between two identical teams looks like, and is exactly what this panel
// should say on a pond nobody has run yet.
//
// ### Four rules
//
//  1. **Same everything but the brains.** Both lanes are built from one seed
//     and draw from their own generator in the same order, so the food, the
//     starting spots, the headings and the internal clocks are identical
//     between them down to the bit. `test/race.test.js` proves it the only way
//     worth proving it: run a lane against *itself* and the two must agree
//     exactly.
//  2. **Nothing hunts in a lane.** Predation and scavenging are off, and the
//     panel says so. A carnivore in a race about finding food would be scoring
//     by eating the competition, and the two teams do not have the same
//     appetite for meat — `evolved.js` measures the diet moving on about three
//     pond-instants in four. The lane asks one question, so it removes the other.
//  3. **The team is the team.** No reseeding, no top-ups. Ten animals go in and
//     whatever happens to them is the result — including all ten starving,
//     which is a real ending here and has its own sentence.
//  4. **PURE OBSERVER, and this one is load-bearing.** The lanes are separate
//     `World` objects with their own generators. Not one number is drawn from
//     the pond on the page, and nothing here is ever written back to it — so a
//     visitor who races is watching, bit for bit, the same world as a visitor
//     who never presses the button. `test/race.test.js` pins that with a
//     fingerprint taken across a race.
//
// ### Why the founders are held rather than rebuilt
//
// A pond's founders are a function of its seed, so the obvious way to get them
// is `new World(config)` — and it is wrong. The generator lays down the biomes,
// the ground and the standing crop *before* it deals a single animal, so the
// number of draws taken before the first genome depends on flags a visitor can
// flip mid-run. Toggle biomes off at step 3,000, rebuild, and the "founders"
// that come back are forty animals this pond never had. So the stock is copied
// out of the world on the frame the page adopts it — the same instant, and for
// the same reason, as `evolved.js`'s opening line — and a pond restored from a
// file has none, which the panel has a sentence for.

import { Creature } from "./creature.js";
import { World } from "./world.js";
import { makeConfig } from "./config.js";
import { foodMote, lineageFill, rgbaCss } from "./palette.js";
import { NOSE } from "./key.js";

/** Animals per lane. */
export const TEAM = 10;

/** Specks of food in a lane, and no more ever. */
export const LARDER = 80;

/**
 * Steps before the whistle. From the sweep: the slowest lane that ever cleared
 * the pond took 866, so a cap here is a cap on *not finishing* rather than a
 * guillotine on a race that was about to be won.
 */
export const RACE_CAP = 900;

/**
 * Steps run per animation frame. `RACE_CAP` at this rate is 150 frames — two
 * and a half seconds at 60 fps — and a typical won race is over in about one.
 * A race is a thing you watch, so it is paced in steps per frame rather than
 * left to the speed slider: every press goes at the same pace as every other
 * one, which is `skip.js`'s rule about a fixed distance applied to a duration.
 */
export const STEPS_PER_FRAME = 6;

/**
 * What a lane changes about the pond's own rules, and nothing else. Every flag
 * here is either the fixed larder, a source of noise that would differ between
 * the lanes, or rule 2 above. Deliberately absent: `signalling`, `groundSense`,
 * `wallSense`, `plasticity` and `evolvableTopology` — those decide the *shape*
 * of a brain, and a lane that changed one would be running today's animals on
 * a mind with the wrong number of inputs.
 */
export const ARENA = Object.freeze({
  width: 360,
  height: 250,
  populationStart: TEAM,
  foodStart: LARDER,
  foodMax: LARDER,
  foodSpawnRate: 0, // the larder is fixed: this is the whole race
  foodPatches: false, // an even scatter, so neither lane is handed a pantry
  foodRegrowth: false,
  biomeDrift: 0,
  seasons: false,
  dayNightCycle: false,
  disease: false,
  barriers: false,
  terrain: false,
  predation: false, // rule 2
  scavenging: false,
  autoReseed: false, // rule 3
});

/**
 * The lanes, in the order they are drawn and read.
 *
 * Two words each and no caption under either. Each lane carried one for a
 * build — *the animals this pond was handed*, *the animals in it now* — and a
 * browser walk at 390 px found them wrapping to three lines and two, which put
 * the two ponds at different heights and cost the panel the one property that
 * makes it read as a race. They were also the panel's own subtitle said a
 * second time, an inch lower down.
 */
export const LANES = Object.freeze([
  Object.freeze({ id: "then", label: "Day one" }),
  Object.freeze({ id: "now", label: "Today" }),
]);

/**
 * A lane's seed, derived from the pond's own so a link that reproduces a world
 * reproduces its races too. A multiply-and-wrap rather than the seed itself,
 * because a lane built on `config.seed` would lay its eighty specks out in the
 * same places as the pond's first eighty — a coincidence nobody would notice
 * and nobody could explain.
 */
export function raceSeed(seed) {
  return (Math.abs(Math.trunc(seed)) * 48271) % 2147483647;
}

/** The rules a lane runs under: the pond's, with `ARENA` over the top. */
export function arenaConfig(config, seed) {
  return makeConfig({ ...config, ...ARENA, seed: raceSeed(seed) });
}

/**
 * `n` genome copies taken evenly across a list of animals, oldest first.
 *
 * Evenly spaced rather than the best `n`, which would be the panel picking its
 * own winner, and rather than a random `n`, which would need a generator and
 * would make one press disagree with the next on the same pond. If the pond
 * holds fewer than `n` animals the sample wraps around and takes some of them
 * twice — a lane must always be ten strong, because a race between six animals
 * and ten is not a race about brains.
 *
 * @param {{creatures:Array}} world
 * @param {number} n
 * @returns {Array|null} genome clones, or null if there is nobody to take
 */
export function stockFrom(world, n = TEAM) {
  const live = world ? world.creatures.filter((c) => !c.dead) : [];
  if (!live.length) return null;
  const out = [];
  for (let i = 0; i < n; i++) out.push(live[Math.floor((i * live.length) / n) % live.length].genome.clone());
  return out;
}

/**
 * The stock a pond is remembered by, or null if it did not arrive newborn.
 *
 * The `tick === 0` test is the whole of the condition, exactly as it is for
 * `evolved.js#foundingSnapshot`: the page calls this on the frame it adopts a
 * world, and a world that is already running on that frame is one restored from
 * a file, whose first step happened somewhere else.
 */
export function foundingStock(world) {
  if (!world || world.tick !== 0) return null;
  return stockFrom(world);
}

/**
 * One lane: a private world with a team installed on the spots its own
 * founders were dealt.
 *
 * The founders are built and thrown away rather than skipped, and that is the
 * mechanism rather than waste — building them is what walks this lane's
 * generator to exactly the same place the other lane's is at, so the headings
 * and internal clocks the replacements draw come out identical across lanes.
 */
export function makeLane(config, seed, genomes, meta) {
  const cfg = arenaConfig(config, seed);
  const world = new World(cfg);
  const spots = world.creatures.map((c) => ({ x: c.x, y: c.y }));
  world.creatures = genomes.map((g, i) => {
    const spot = spots[i % spots.length];
    const c = new Creature(g, cfg, spot.x, spot.y, world.rng, 0);
    world.phylogeny.assign(c, 0, null);
    return c;
  });
  return {
    ...meta,
    world,
    left: world.food.items.length,
    alive: world.creatures.length,
    clearedAt: null,
    starvedAt: null,
  };
}

/**
 * Set up a race, or return null if one cannot be run honestly.
 *
 * @param {object} config the pond's rules
 * @param {Array|null} then the founding stock, held since the world was adopted
 * @param {{creatures:Array}} world the pond as it is now
 */
export function startRace(config, then, world) {
  const now = stockFrom(world);
  if (!then || !now) return null;
  const seed = config.seed;
  return {
    step: 0,
    // Whether the two lanes are holding the same ten animals — true on a pond
    // nobody has run yet, and the difference between *a dead heat because
    // nothing separated them* and *a dead heat because they are the same
    // animals*. Asked of the stock rather than inferred from the result: two
    // different teams can finish level, and a panel that reported that as "the
    // same race, step for step" would be making something up.
    sameStock: then.length === now.length && then.every((g, i) => sameGenome(g, now[i])),
    lanes: LANES.map((meta, i) => makeLane(config, seed, i === 0 ? then : now, meta)),
  };
}

/**
 * Two genomes, compared by what a save would write of them. Exact and cheap
 * enough at ten pairs a press, and it needs no knowledge of which of the two
 * kinds of genome this world deals — which is the reason it is not a field
 * walk.
 */
function sameGenome(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A lane stops when it has cleared the pond or has nobody left to clear it. */
export function laneDone(lane) {
  return lane.clearedAt !== null || lane.starvedAt !== null;
}

/** The race is over when the whistle goes or both lanes have stopped. */
export function raceOver(race) {
  return !race || race.step >= RACE_CAP || race.lanes.every(laneDone);
}

/**
 * Run both lanes on a little. Each lane freezes the instant it finishes, so the
 * canvas of a lane that won holds the pond it cleared instead of showing ten
 * animals milling about in an empty world.
 */
export function pumpRace(race, steps = STEPS_PER_FRAME) {
  if (!race) return;
  for (let i = 0; i < steps && race.step < RACE_CAP; i++) {
    race.step++;
    for (const lane of race.lanes) {
      if (laneDone(lane)) continue;
      lane.world.step();
      lane.left = lane.world.food.items.length;
      lane.alive = lane.world.creatures.length;
      if (lane.left === 0) lane.clearedAt = race.step;
      else if (lane.alive === 0) lane.starvedAt = race.step;
    }
    if (race.lanes.every(laneDone)) break;
  }
}

/** How many specks a lane has got through. */
export function eaten(lane) {
  return LARDER - lane.left;
}

/** A lane's own line, under its picture. */
export function laneLine(lane) {
  if (lane.clearedAt !== null) return `cleared the pond in ${lane.clearedAt} steps`;
  if (lane.starvedAt !== null) {
    return lane.left === 1
      ? "every one of them starved, with 1 speck left"
      : `every one of them starved, with ${lane.left} specks left`;
  }
  return lane.left === 1 ? "1 speck left" : `${lane.left} specks left`;
}

/** A lane's progress, 0..1, for the bar under its picture. */
export function laneProgress(lane) {
  return eaten(lane) / LARDER;
}

/**
 * Which lane won, or null for a dead heat. Clearing beats not clearing; between
 * two lanes that cleared it is the faster; between two that did not it is the
 * one that got through more.
 */
export function winner(race) {
  const [then, now] = race.lanes;
  if (then.clearedAt !== null || now.clearedAt !== null) {
    if (then.clearedAt === null) return now;
    if (now.clearedAt === null) return then;
    if (then.clearedAt === now.clearedAt) return null;
    return then.clearedAt < now.clearedAt ? then : now;
  }
  if (then.left === now.left) return null;
  return then.left < now.left ? then : now;
}

/** The line under the race, once it is over. */
export function raceVerdict(race) {
  const [then, now] = race.lanes;
  const won = winner(race);
  if (!won) {
    // A dead heat, and on a young pond it is not a coincidence: the two lanes
    // are holding the same animals, so this is the fairness of the lanes
    // proving itself in front of the visitor. The way out is the button next to
    // this one.
    return {
      mark: "🤝",
      verdict: race.sameStock
        ? "A dead heat — and it had to be: the two ponds are holding the same ten animals."
        : "Too close to call — they finished level.",
      why: race.sameStock
        ? "This pond has not lived long enough to have changed yet, so both lanes are its first animals racing themselves. Press ⏩ Skip ahead to give it some time, then race them again."
        : "Same water, same food, same starting spots. Nothing separated them.",
    };
  }
  const loser = won === now ? then : now;
  // Not `laneLine`, and the difference is the reason both exist: that one is a
  // fragment that sits under a picture with the lane's name already on it, and
  // reusing it here reads *Day one's animals 51 specks left.* A sentence and a
  // caption are not the same words in a different place.
  let head;
  if (won.clearedAt !== null) head = `${won.label}'s animals cleared the pond in ${won.clearedAt} steps.`;
  else if (won.starvedAt !== null) {
    head = `${won.label}'s animals got through ${eaten(won)} of the ${LARDER} before the last of them starved.`;
  } else head = `${won.label}'s animals got through ${eaten(won)} of the ${LARDER}.`;
  let tail;
  if (loser.clearedAt !== null) tail = `${loser.label}'s took ${loser.clearedAt}.`;
  else if (loser.starvedAt !== null) tail = `${loser.label}'s starved with ${loser.left} still floating.`;
  else if (won.clearedAt !== null) tail = `${loser.label}'s never did — ${loser.left} were still floating when time ran out.`;
  else tail = `${loser.label}'s got through ${eaten(loser)}.`;
  return {
    mark: won === now ? "🏆" : "🌱",
    verdict: `${head} ${tail}`,
    why:
      won === now
        ? "Nobody wrote them a better way of looking for food. The ones that happened to find more of it left more young, and this is what that adds up to."
        : "Not this time — and the pond keeps every result, flattering or not. Give it longer and race it again.",
  };
}

/** What the button says, at rest, in flight, and afterwards. */
export const RACE_GO = "🏁 Start the race";
export const RACE_RUNNING = "🏁 Racing…";
export const RACE_AGAIN = "🏁 Race them again";

/** What the panel says before anybody has pressed anything. */
export const RACE_INVITE =
  "Ten animals from this pond's first moments, ten from right now, and eighty specks of food in each of two identical ponds. Who clears theirs first?";

/** What it says on a pond that arrived part-grown, so has no first moments. */
export const RACE_NO_STOCK =
  "This pond was opened from a saved world, so its first animals are not here to race.";

/** What it says when the pond is empty. */
export const RACE_NO_LIFE = "There is nobody in the water to race.";

/** The small print under the lanes. True of every race, so it is never rebuilt. */
export const RACE_RULES =
  "Same food, same starting spots, same rules — and nothing hunts in the lanes. The only difference is what is in their heads.";

/** A key on everything a frame of this panel draws in words. */
export function raceSignature(race) {
  if (!race) return "idle";
  return (
    `${race.step}|` +
    race.lanes.map((l) => `${l.left}:${l.alive}:${l.clearedAt}:${l.starvedAt}`).join("|") +
    `|${raceOver(race) ? "done" : "run"}`
  );
}

// ---- the lanes, drawn ----
//
// A bespoke miniature rather than `render.js` behind a second camera. The
// renderer is the pond's — a lens, a minimap, name plates, trails, six overlays
// and a season — and a lane wants none of it. What a lane wants is the two
// marks this race is about, at the size of a postage stamp, in the colours the
// water uses so the placard two panels down is already their legend.

/** The deep, at the middle of the seasonal swing `render.js` tints it across. */
const DEEP = { r: 8, g: 12, b: 16 };

/**
 * Draw one lane.
 *
 * `fresh` paints the deep opaque; every frame after it is a translucent veil,
 * which is the pond's own trick and earns more here than it does there — six
 * steps a frame, and a lane that is finding its food draws visible arcs toward
 * it while a lane that is not draws a scribble.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} W canvas width
 * @param {number} H canvas height
 * @param {object} lane
 * @param {boolean} fresh
 */
export function drawLane(ctx, W, H, lane, fresh = false) {
  const cfg = lane.world.config;
  const s = Math.min(W / cfg.width, H / cfg.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = rgbaCss(DEEP, fresh ? 1 : 0.3);
  ctx.fillRect(0, 0, W, H);

  const m = foodMote();
  ctx.fillStyle = rgbaCss({ r: m.r, g: m.g, b: m.b }, m.a);
  for (const f of lane.world.food.items) {
    if (f.eaten) continue;
    ctx.beginPath();
    ctx.arc(f.x * s, f.y * s, Math.max(1, cfg.foodRadius * s * 0.8), 0, Math.PI * 2);
    ctx.fill();
  }

  for (const c of lane.world.creatures) {
    const r = Math.max(2.2, c.radius * s);
    ctx.save();
    ctx.translate(c.x * s, c.y * s);
    ctx.rotate(c.heading);
    ctx.beginPath();
    ctx.moveTo(r * NOSE.prey, 0);
    ctx.lineTo(-r, r * 0.85);
    ctx.lineTo(-r * 0.5, 0);
    ctx.lineTo(-r, -r * 0.85);
    ctx.closePath();
    ctx.fillStyle = lineageFill(c.hue, "dot");
    ctx.fill();
    ctx.restore();
  }
}

/** What a screen reader is told about a lane's picture. */
export function laneSay(lane) {
  return `${lane.label}: ${laneLine(lane)}.`;
}
