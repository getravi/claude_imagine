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
   * The three sinks as fractions of everything that has *left* the pond — the
   * question the panel asks, which is "of the energy this world has spent, what
   * did it go on?" Shares of everything created would be the more obvious
   * choice and would be nearly the same three numbers plus a fourth that is
   * always a rounding error: at any moment the standing stock is well under 1%
   * of the run's throughput, which is itself worth knowing and is a separate
   * readout rather than a segment too thin to see.
   *
   * `buried` can be very slightly negative before anything has died of old age,
   * because a starving creature pays its final bill in full and finishes below
   * zero. Clamping and renormalising keeps the bar from inverting over an
   * amount smaller than a single pellet; the raw fields are still there for
   * anyone who wants the signed truth.
   *
   * Returns null until something has actually been spent, so nothing has to
   * render a bar of three zeroes on tick 0.
   */
  shares() {
    const parts = ENERGY_SINKS.map((k) => Math.max(0, this[k]));
    const sum = parts.reduce((a, b) => a + b, 0);
    if (sum <= 0) return null;
    /** @type {Record<string, number>} */
    const out = {};
    ENERGY_SINKS.forEach((k, i) => (out[k] = parts[i] / sum));
    return out;
  }
}
