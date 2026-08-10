// inspect.js — what the inspector says about one creature.
//
// v1.57 asked the minimap what is in the world that it has never heard of and
// got corpses, the oldest feature in the project. v1.67 asked the spoken
// description the same thing and got corpses again. v1.72 said take the
// question one level down — for each view, list the *fields* of the objects it
// aggregates — and got `parentId`. v1.74 asked it of the chart and the answer
// was a coordinate rather than a noun. `docs/AUTONOMOUS.md` has named the
// inspector as the last unwalked surface since v1.74.
//
// The inspector is the one view whose subject is a single object, so the walk
// is exact rather than an inventory of nouns: a creature has 33 own properties
// and the panel reported 13 of them. Two of the silences were mechanics with an
// off switch, a chronicle line, a tile and a mark on the canvas — contagion
// (v1.16) and signalling (v1.20) — and the sharper half is that
// `describeSelection()` in `describe.js` has said "sick" and "immune" about the
// *same* selection since v1.31. A listener was told something a reader was not,
// on one surface, for forty-five releases.
//
// So this module owns the fact grid. Two things follow from it being a module
// rather than a template inside `main.js`:
//
//   - The rows are testable. `main.js` is still the only module `node --test`
//     cannot reach, and every value in the panel now comes from somewhere it
//     can.
//   - The list of what the panel says is *derived*. v1.76 finished by warning
//     that its audit's list of query sites was hand-typed; the coverage table
//     below is checked against a live creature's own properties on every run,
//     so a field added in a later release cannot land outside the panel without
//     failing a test (v1.53's "fix the instances, then make the class
//     unrepresentable").
//
// PURE OBSERVER, in the same sense as `describe.js` and `energy.js`: reads
// creature state, draws no random numbers, and nothing in the simulation reads
// it back. One caveat with a name — the Underfoot row asks the creature's brain
// a hypothetical (see `groundSway`), which must not teach a plastic brain
// anything; `forward()` takes a learning flag for exactly that reason and
// `test/inspect.test.js` pins it with plasticity on.

import { groundSway } from "./creature.js";

/**
 * Energy as the share of `energyMax` the panel has always shown — the same
 * arithmetic `describeSelection()` speaks, so the number a reader sees and the
 * number a listener hears cannot drift apart.
 * @param {object} c
 * @param {object} config
 */
export function energyText(c, config) {
  return Math.round((c.energy / config.energyMax) * 100) + "%";
}

/**
 * Diet, as a word and the gene behind it. The threshold is the one `world.js`
 * uses to decide who is a predator, so the label changes on the tick the
 * creature's status does.
 * @param {object} c
 * @param {object} config
 */
export function dietText(c, config) {
  if (c.carnivory >= config.carnivoreThreshold) return `🔺 carnivore ${c.carnivory.toFixed(2)}`;
  if (c.carnivory < 0.25) return `🌿 herbivore ${c.carnivory.toFixed(2)}`;
  return `◦ omnivore ${c.carnivory.toFixed(2)}`;
}

/**
 * The ground under this creature, and how much of its steering that fact is
 * deciding right now. The second number is a hypothetical put to this
 * creature's own brain, not a claim that the ground steers the pond;
 * `docs/SCIENCE.md` measures what selection does with it, which is nothing.
 * @param {object} c
 */
export function footText(c) {
  return `${Math.round(c.groundFeel * 100)}% rough — sways steering ${groundSway(c).toFixed(2)}`;
}

/**
 * Where this creature sits in the epidemic: susceptible, sick with a countdown,
 * or immune with the age it recovered at.
 *
 * The three states are the whole of contagion's model (see `disease` in
 * `config.js`), and two of them are invisible on the canvas the moment a body
 * is off screen or the overlay is a pixel wide. Immunity is acquired and never
 * inherited, so "susceptible" is the honest word for a newborn rather than
 * "healthy" — it says what will happen next rather than what is true now.
 *
 * The countdown is derived from `infectedAtAge` and `diseaseDuration`, which is
 * exactly the comparison `world._stepDisease` recovers on. The off-by-one is
 * real and is the reason the last frame gets a word instead of a number:
 * `_stepDisease` runs at the top of the tick, *before* anybody ages, so the age
 * a panel is rendered with is the age recovery will next be judged against.
 * Zero therefore does not mean "recovered", it means "recovers on the coming
 * tick" — and "0 ticks to recover" beside a creature that is still sick is the
 * kind of number a reader is right not to trust.
 * @param {object} c
 * @param {object} config
 */
export function healthText(c, config) {
  if (c.infected) {
    const left = config.diseaseDuration - (c.age - c.infectedAtAge);
    if (left <= 0) return "sick — recovering";
    return `sick — ${left} tick${left === 1 ? "" : "s"} to recover`;
  }
  if (c.immune) return `immune — recovered at age ${c.infectedAtAge + config.diseaseDuration}`;
  return "susceptible — never infected";
}

/**
 * The voice: what this creature is saying, and the loudest thing it can hear.
 *
 * `heard` is exactly 0 when nobody in earshot is calling, which is most of the
 * time and is worth a word rather than a number — "0.00" reads as a
 * measurement, silence is a state. `signal` is the brain's third motor output
 * and exists in every world (it shifts the body's saturation), but it is only
 * *read* by anything when signalling is on, which is why this row is gated on
 * the flag rather than on the value.
 * @param {object} c
 */
export function voiceText(c) {
  const said = c.signal.toFixed(2);
  return c.heard === 0 ? `says ${said}, hears nothing` : `says ${said}, hears ${c.heard.toFixed(2)}`;
}

/**
 * The inspector's fact grid, in display order.
 *
 * Each row is `{key, term, value, wide, live}`. `live` marks the ones that
 * change while you watch: `main.js` rebuilds the panel's *structure* only when
 * it changes (v1.15 — a button replaced sixty times a second cannot be clicked)
 * and patches these in place every frame. `key` is what the `<dd>` is given as
 * an id, so the two halves cannot disagree about which row is which.
 *
 * A row for a mechanic that is switched off is absent, not blank — the rule the
 * rest of the HUD follows. That makes the *set* of keys a function of the
 * config, which is why `main.js` builds its rebuild key out of them instead of
 * naming the toggles by hand.
 *
 * @param {object} c - the selected creature
 * @param {object} config
 * @returns {Array<{key:string,term:string,value:string,wide?:boolean,live?:boolean}>}
 */
export function creatureFacts(c, config) {
  const facts = [
    { key: "generation", term: "Generation", value: String(c.generation) },
    { key: "age", term: "Age", value: String(c.age), live: true },
    { key: "energy", term: "Energy", value: energyText(c, config), live: true },
    { key: "children", term: "Children", value: String(c.children), live: true },
    { key: "size", term: "Size", value: c.radius.toFixed(1) },
    { key: "metabolism", term: "Metabolism", value: `${c.metabolismScale.toFixed(2)}×` },
    { key: "diet", term: "Diet", value: dietText(c, config), wide: true },
  ];
  if (config.groundSense) {
    facts.push({ key: "foot", term: "Underfoot 👣", value: footText(c), wide: true, live: true });
  }
  if (config.disease) {
    facts.push({
      key: "health",
      term: "Health 🦠",
      value: healthText(c, config),
      wide: true,
      live: true,
    });
  }
  if (config.signalling) {
    facts.push({ key: "voice", term: "Voice 📣", value: voiceText(c), wide: true, live: true });
  }
  return facts;
}

/**
 * Every field a creature carries that the panel reports, and where it says it.
 *
 * The values name a part of the panel rather than a fact key, because four of
 * them are said by something that is not a row: the heading, the swatch, the
 * ancestry pips and the two brain figures.
 */
export const FIELD_REPORTS = {
  id: "the panel heading — Creature #n",
  hue: "the swatch beside the heading",
  generation: "the Generation row",
  age: "the Age row",
  energy: "the Energy row",
  children: "the Children row",
  radius: "the Size row",
  metabolismScale: "the Metabolism row",
  carnivory: "the Diet row",
  groundFeel: "the Underfoot row (groundSense)",
  speciesId: "the Species link and the ancestry pips",
  genome: "the inherited-brain figure — the strip, or the evolved network diagram",
  brain: "the learned-brain figure (plasticity)",
  infected: "the Health row (disease)",
  immune: "the Health row (disease)",
  infectedAtAge: "the Health row (disease) — the countdown and the recovery age",
  signal: "the Voice row (signalling)",
  heard: "the Voice row (signalling)",
};

/**
 * Every field the panel does not report, and why.
 *
 * Kept separate from the list above rather than merged into one exclusion set,
 * because the two say different things and only one of them is restful. Nine of
 * these are drawn, structural, or unreachable here; **two are silences with no
 * argument behind them** and are named as such — an unmeasured thing filed with
 * its own defect written out reads as handled, which v1.66 called the most
 * restful note there is.
 */
export const FIELD_SILENT = {
  config: "not a property of this creature — the whole page is the config's readout",
  x: "a place is a picture: the pond and the minimap draw it, and describeSelection() speaks the region",
  y: "as x",
  heading: "drawn — the body points along it",
  vx: "drawn — the body moves along it",
  vy: "as vx",
  dead: "the panel clears the moment its subject dies, so this is false in every frame it renders",
  deathCause: "null while alive, and the panel only ever renders the living (see dead)",
  ground: "the terrain cost multiplier; groundFeel is its normalised form and is what Underfoot shows",
  prevSignal: "last tick's signal, an artifact of the update order rather than a fact about the creature",
  lastBiteAge: "drawn — the attack flash on the canvas",
  _in: "scratch input buffer, reused every tick",
  _aux: "scratch buffer for the auxiliary senses",
  // The two with no argument.
  walled: "UNREPORTED — rock refused its last move (v1.48); reaches stats.walled and no per-creature surface",
  phase: "UNREPORTED — the internal oscillator, a brain input nothing on the page has ever shown",
};
