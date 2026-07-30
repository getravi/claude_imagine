// energy.js — the pond's books, in the one currency everything here is made of.
//
// Every rule in this world is ultimately a statement about energy. A creature
// pays it to exist, pays more to move, hands half of it to a child, and takes
// it from pellets and from each other. For twenty-eight versions the simulation
// moved that quantity around correctly and nobody added it up, so the most basic
// question you can ask of an ecology — *where does the power come from, and
// where does it go?* — had no answer here at all.
//
// It has one now, and the answer is uncomfortable in an interesting way: this
// pond is not a closed system and never has been. A pellet is a position, not a
// battery; it holds no energy until something eats it, and the `foodEnergy`
// units that arrive at that moment are **minted**, not moved. So the ledger is
// not a conservation law — it is a record of how much this world creates from
// nothing and what becomes of it afterwards.
//
// What it *does* enforce is an accounting identity: every unit created is either
// still standing in a living body or a corpse, or it went somewhere this ledger
// names. `created − destroyed === standing`, exactly, at every tick. That is a
// far stronger check than any of the statistics this project keeps, because a
// bug anywhere in the energy paths — a bite that credits more than it debits, a
// clamp that quietly swallows a gain — breaks it immediately.
//
// Nothing here draws a random number, reads a random number, or is read by the
// simulation. It is bookkeeping written alongside events that were happening
// anyway, so a world with these books is bit-for-bit the world without them —
// `test/energy.test.js` pins that by stepping one world with a ledger that
// records nothing and comparing every creature.

/**
 * Where energy comes from, in the order the panel reports them. Every entry is
 * a place this world creates energy that did not previously exist.
 */
export const ENERGY_SOURCES = Object.freeze(["crop", "carrion", "founders"]);

/**
 * Where it goes. `metabolism` is the cost of being alive; the other three are
 * the ways energy leaves the pond without ever having been spent on anything.
 */
export const ENERGY_SINKS = Object.freeze(["metabolism", "waste", "buried"]);

/**
 * The eight fields the ledger actually *stores* — the ones carried into every
 * history point, the archive and both CSV scopes. `created`, `destroyed` and
 * `waste` are getters over these and are never recorded: a derived total is a
 * column that can disagree with its own inputs.
 *
 * Every one of them is cumulative and extensive, which is the whole reason this
 * is cheap. By the v1.26 rule, differencing two samples of a cumulative counter
 * returns exactly what happened between them however many samples the archive
 * threw away in the middle, so the books need no min/max envelope and no
 * per-interval column — they need only to be written down.
 */
export const LEDGER_FIELDS = Object.freeze([
  "crop",
  "carrion",
  "founders",
  "metabolism",
  "digested",
  "spilled",
  "rotted",
  "buried",
]);

/**
 * The history-point field and CSV column name for one ledger quantity, so the
 * buffer and the file can never drift apart — the same trick `deathField()`
 * plays for the mortality counters.
 * @param {string} name a `LEDGER_FIELDS` entry, or `"standing"` / `"residual"`
 */
export function energyField(name) {
  return `energy_${name}`;
}

/**
 * The three sinks as fractions of everything spent, from any object carrying
 * `metabolism`, `waste` and `buried` — a ledger, or one interval's flows.
 *
 * `buried` can be very slightly negative before anything has died of old age,
 * because a starving creature pays its final bill in full and finishes below
 * zero. Clamping and renormalising keeps a bar from inverting over an amount
 * smaller than a single pellet; the raw fields are still there for anyone who
 * wants the signed truth. Returns null until something has been spent, so
 * nothing has to render a bar of three zeroes.
 * @param {Record<string, number>} spent
 */
export function spendShares(spent) {
  const parts = ENERGY_SINKS.map((k) => Math.max(0, spent[k] ?? 0));
  const sum = parts.reduce((a, b) => a + b, 0);
  if (sum <= 0) return null;
  /** @type {Record<string, number>} */
  const out = {};
  ENERGY_SINKS.forEach((k, i) => (out[k] = parts[i] / sum));
  return out;
}

/**
 * Read the books as a *rate*: one interval per adjacent pair of history points,
 * carrying energy per tick for every ledger field and for the three totals.
 *
 * This is the reason for recording the ledger at all. The panel has shown the
 * run-to-date shares since v1.29, and a run-to-date anything stops moving after
 * a few thousand ticks — the v1.22 complaint about readouts that look live and
 * are not. The same books differenced between two samples say what the pond was
 * doing *then*, which turns out to swing by most of an order of magnitude over
 * a single run while the cumulative bar sits still.
 *
 * Differences are signed and unclamped, unlike `mortalitySeries()`. A death
 * count going backwards is a broken input; `buried` going backwards is the
 * world working correctly, and `spilled` arrives at −2e−16 often enough that
 * clamping it would be pretending to a precision the sum does not have.
 *
 * Pure and read-only. Returns an empty series for fewer than two points.
 * @param {Array<object>} hist history points, oldest first
 * @returns {{intervals: Array<object>, peak: number}}
 */
export function energySeries(hist) {
  const intervals = [];
  let peak = 0;
  for (let i = 1; i < hist.length; i++) {
    const a = hist[i - 1];
    const b = hist[i];
    const dt = b.tick - a.tick;
    if (dt <= 0) continue;
    /** @type {Record<string, number>} */
    const rates = {};
    for (const f of LEDGER_FIELDS) {
      rates[f] = ((b[energyField(f)] ?? 0) - (a[energyField(f)] ?? 0)) / dt;
    }
    rates.waste = rates.digested + rates.spilled + rates.rotted;
    const power = ENERGY_SOURCES.reduce((s, k) => s + rates[k], 0);
    const spend = ENERGY_SINKS.reduce((s, k) => s + rates[k], 0);
    if (power > peak) peak = power;
    // `index` is the position of the *later* sample, matching `mortalitySeries`
    // so the two can be plotted against the same x positions.
    intervals.push({
      index: i,
      from: a.tick,
      to: b.tick,
      dt,
      rates,
      power,
      spend,
      shares: spendShares(rates),
    });
  }
  return { intervals, peak };
}

export class EnergyLedger {
  constructor() {
    // --- created ---
    // Grazing. Counted as *offered*, not as absorbed: a pellet's worth is minted
    // the moment it is eaten whether or not the eater had room for it, and the
    // part that did not fit shows up under `waste` below. Counting only what
    // fit would hide the pond's most avoidable loss.
    this.crop = 0;
    // Meat conjured into a corpse at the moment of death (scavenging only). It
    // is not the dead creature's remaining energy — that is buried separately —
    // but a fresh amount computed from body size, so a corpse is minting too.
    this.carrion = 0;
    // The `energyStart` handed to every creature the world makes from scratch:
    // the founding population, auto-reseeds after a crash, and the "seed life"
    // button. A creature born of a parent is not here — reproduction moves
    // energy, it does not make it.
    this.founders = 0;

    // --- destroyed ---
    // The metabolic bill: base upkeep, movement, diet, fever, voice. This is the
    // only sink that buys anything.
    this.metabolism = 0;
    // Energy that left the pond without being spent on anything. Kept as its
    // three separate causes because they answer different questions and they
    // turn out to differ by two orders of magnitude — see docs/SCIENCE.md.
    this.digested = 0; // the share of a bite that never reaches the biter
    this.spilled = 0; // a gain discarded because the eater was already full
    this.rotted = 0; // meat that rotted out of a corpse nothing ate
    // What a body still held when it died. Slightly negative contributions are
    // normal and correct: a creature pays its last tick's bill in full and can
    // finish a hair below zero, and that overdraft belongs here, against the
    // metabolism it was counted as paying.
    this.buried = 0;
  }

  /** Total energy this world has created from nothing. */
  get created() {
    return this.crop + this.carrion + this.founders;
  }

  /** The three leaks, together — the segment the panel draws. */
  get waste() {
    return this.digested + this.spilled + this.rotted;
  }

  /** Total energy that has left the world. */
  get destroyed() {
    return this.metabolism + this.waste + this.buried;
  }

  /**
   * A pellet eaten. `offered` is the gain the pellet was worth to this eater
   * (plants feed a carnivore poorly); `absorbed` is how much of it actually fit.
   */
  graze(offered, absorbed) {
    this.crop += offered;
    this.spilled += offered - absorbed;
  }

  /**
   * A bite of flesh, live or dead. `taken` leaves the prey or the corpse,
   * `offered` is what survives the conversion into the eater's own flesh, and
   * `absorbed` is how much of that it had room for. Creates nothing: this is the
   * one feeding path in the world that moves energy rather than making it.
   */
  bite(taken, offered, absorbed) {
    this.digested += taken - offered;
    this.spilled += offered - absorbed;
  }

  /** A creature the world made from scratch, with its starting energy. */
  found(energy) {
    this.founders += energy;
  }

  /** Meat minted into a fresh corpse. */
  butcher(energy) {
    this.carrion += energy;
  }

  /** One tick's metabolic bill for one creature. */
  burn(cost) {
    this.metabolism += cost;
  }

  /** What a creature still held as it died. May be a small negative. */
  bury(energy) {
    this.buried += energy;
  }

  /** Meat lost from a corpse to rot, never eaten. */
  rot(energy) {
    this.rotted += energy;
  }

  /**
   * The energy standing in the world right now: every living body plus every
   * corpse. The right-hand side of the identity — see `audit()`.
   * @param {import('./world.js').World} world
   */
  static standing(world) {
    let total = 0;
    for (const c of world.creatures) total += c.energy;
    for (const k of world.corpses) total += k.energy;
    return total;
  }

  /**
   * Check the books against the world they describe: created − destroyed must
   * equal what is standing in it. Returns the two sides and their difference,
   * so a caller (or a test) can decide what tolerance it wants. Floating-point
   * addition is not associative, so this is exact in intent and drifts in the
   * last few digits over a long run; the residual stays far below one pellet.
   * @param {import('./world.js').World} world
   */
  audit(world) {
    const standing = EnergyLedger.standing(world);
    const expected = this.created - this.destroyed;
    return { standing, expected, residual: expected - standing };
  }

  /**
   * The books as one flat history point: the eight stored fields, the standing
   * stock, and the residual of the identity at this exact tick.
   *
   * The residual is here because of what it makes possible for the first time.
   * `audit()` can only ever ask "do the books balance *now*", so a bug that
   * broke them at tick 4,000 is indistinguishable from one that broke them a
   * moment ago — the identity could be checked but never *dated*. Recorded per
   * sample it becomes a time series with a zero line in it, and the tick a
   * break began is legible from the exported file. It is instantaneous rather
   * than cumulative, so it is one of the two fields here that earns a min/max
   * envelope in the archive: a break in the books is a transient, and a
   * transient is exactly what decimation eats.
   * @param {import('./world.js').World} world
   */
  snapshot(world) {
    /** @type {Record<string, number>} */
    const out = {};
    for (const f of LEDGER_FIELDS) out[energyField(f)] = this[f];
    const standing = EnergyLedger.standing(world);
    out[energyField("standing")] = standing;
    out[energyField("residual")] = this.created - this.destroyed - standing;
    return out;
  }

  /**
   * The three sinks as fractions of everything that has *left* the pond — the
   * question the panel asks, which is "of the energy this world has spent, what
   * did it go on?" Shares of everything created would be the more obvious
   * choice and would be nearly the same three numbers plus a fourth that is
   * always a rounding error: at any moment the standing stock is well under 1%
   * of the run's throughput, which is itself worth knowing and is a separate
   * readout rather than a segment too thin to see.
   *
   * Run-to-date, and so motionless after a few thousand ticks. For the same
   * three shares over a *window* — which do move, and which is where the cost
   * of a predation burst hides — difference two history points and hand the
   * result to `spendShares()`, as `energySeries()` does.
   */
  shares() {
    return spendShares(this);
  }
}
