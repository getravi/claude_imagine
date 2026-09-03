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
// is exact rather than an inventory of nouns: there are thirty-six fields of a
// creature today, and the panel reported 13 of the 33 there were when v1.77
// walked it. Two of the silences were mechanics with an
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

import { groundSway, wallSway } from "./creature.js";
import { creatureReaches, sightWindow } from "./reach.js";
import { steeringText } from "./senses.js";

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
 * What this creature's whisker is touching, and how much of its steering that
 * is deciding right now.
 *
 * Three states rather than two, because a distance and a miss are different
 * readings and a percentage cannot say which it is: rock at a stated distance,
 * or open water for the whole reach. The sway is `footText`'s second number one
 * sense over — a hypothetical put to this creature's own brain, not a claim
 * that the rock steers the pond.
 *
 * The last clause is `walled`, which `FIELD_SILENT` has named as unreported
 * since v1.77: rock refused this creature's last move. It belongs here because
 * it is the same subject at zero distance — the one reading the whisker cannot
 * give, since a wall it is already against is a wall it has already hit.
 * @param {object} c
 * @param {object} config
 */
export function whiskerText(c, config) {
  const sway = wallSway(c).toFixed(2);
  const where = Number.isFinite(c.rockAhead)
    ? `rock ${c.rockAhead.toFixed(1)}px ahead`
    : `open water for ${config.whiskerRange}px`;
  return `${where} — sways steering ${sway}${c.walled ? " · blocked last move" : ""}`;
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
 * The verb each contact rule is worth to a reader, and the noun it is worth to
 * a sentence about what gates it.
 *
 * Hand-written, and therefore checked in both directions:
 * `test/inspect.test.js` walks `contactRules` and fails on a rule with no entry
 * here, and on an entry naming no rule. A contact rule added to `reach.js`
 * cannot go quietly missing from the panel, which is v1.61's failure written
 * down before it happens — an instrument holding a copy of a list that has
 * moved, and printing `ok` for it.
 */
export const REACH_WORDS = {
  eat: { verb: "eats", doing: "eating" },
  scavenge: { verb: "scavenges", doing: "scavenging" },
  bite: { verb: "bites", doing: "biting" },
  infect: { verb: "infects", doing: "infecting" },
  shove: { verb: "pushes", doing: "pushing" },
};

/** A distance in the pond, at the one decimal the Size row already uses. */
const px = (n) => n.toFixed(1);

/** "eating", "eating and biting", "eating, scavenging and biting". */
function series(words) {
  if (words.length < 2) return words[0] || "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/**
 * How close this creature has to be to touch something, and what it has to do
 * before the distance matters at all.
 *
 * v1.90 drew these as rings on the pond and left the note this row closes: the
 * circles are unlabelled, the canvas draws no text, and *which circle is which*
 * was carried by `describeSelection()` and by nothing a reader can see. That is
 * v1.77's own finding arriving in v1.77's own file — a listener told something
 * a reader is not, about the same selection — and the surface with the good
 * implementation is again the evidence, which is the half of a pair sweep I
 * skip (`docs/AUTONOMOUS.md`). It is also the reading that survives zoom 1,
 * where the three rings are one smudge.
 *
 * Both halves are derived from `creatureReaches`, so the row cannot disagree
 * with the overlay or with the audit that pins the geometry; and the numbers
 * are one arithmetic away from `contactRules`, so a rule whose expression
 * changes moves the ring, the sentence and this row together.
 *
 * Two things it says in words rather than in numbers. A creature under
 * `bodyRadiusMin * preySizeRatio` admits no prey at all — 2.26% of bodies
 * pooled, 15.5% on one seed (v1.90) — and `0.0` for that is three true symbols
 * arranged into a falsehood (v1.89), so the reading is a sentence. And the
 * gate is named rather than folded into the distances: eating, scavenging and
 * biting are choices made out of what a sense scan already selected, so their
 * reach is the *second* of two tests, and a row listing 10.0 px beside a sense
 * of 168 is v1.81's whole finding in one line.
 *
 * @param {object} c
 * @param {object} config
 */
export function reachText(c, config) {
  const said = [];
  const gated = [];
  for (const reach of creatureReaches(c.radius, config)) {
    const say = REACH_WORDS[reach.name];
    if (!say) continue;
    if (reach.empty) {
      said.push(`nothing here is small enough to ${reach.name}`);
      continue;
    }
    said.push(
      reach.outer > reach.inner
        ? `${say.verb} at ${px(reach.inner)}–${px(reach.outer)}`
        : `${say.verb} at ${px(reach.inner)}`
    );
    if (reach.gate === "sight") gated.push(say.doing);
  }
  // Neither of these is reachable in a world this project ships: eating has no
  // off switch and is gated by sight, so there is always at least one entry and
  // always a clause. They are here because `reachText` reads a table rather
  // than a fixed list, and a guard is cheaper than a panel that renders the
  // word `undefined` the day that stops being true.
  if (!said.length) return "nothing here touches anything";
  if (!gated.length) return said.join(" · ");
  const sight = sightWindow(config);
  const far =
    sight.least === sight.most
      ? `${px(sight.most)} px`
      : `${px(sight.least)}–${px(sight.most)} px`;
  return `${said.join(" · ")} — ${series(gated)} ${gated.length === 1 ? "is" : "are"} gated by sight, which reaches ${far}`;
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
    // `live` although a body never grows: the sight half moves when the
    // day/night toggle does, and flipping a toggle changes no row *key*, so the
    // panel is not rebuilt and an unpatched row would keep quoting the sense a
    // world used to have. v1.86's rule about live flags is that they are
    // checked against what moves, and this one can.
    { key: "reach", term: "Reach 📏", value: reachText(c, config), wide: true, live: true },
    // The senses ranked by what each is worth to the motors right now (v1.110).
    // Ungated, unlike the two sway rows below it, because the sixteen channels
    // of the input vector are in every brain this project has ever run — the
    // count at the end of the line is what moves with the aux toggles.
    {
      key: "steering",
      term: "Steers by 🧭",
      value: steeringText(c, config),
      wide: true,
      live: true,
    },
  ];
  if (config.groundSense) {
    facts.push({ key: "foot", term: "Underfoot 👣", value: footText(c), wide: true, live: true });
  }
  if (config.wallSense) {
    facts.push({
      key: "whisker",
      term: "Whisker 📡",
      value: whiskerText(c, config),
      wide: true,
      live: true,
    });
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
 * The values name a part of the panel rather than a fact key, because some of
 * them are said by something that is not a row — see `FIELD_OFF_GRID`, which is
 * the machine-readable half of that sentence and the reason this list is now
 * checked against the words the rows actually contain rather than read.
 *
 * v1.103 corrected two entries and moved two in. The sweep in
 * `src/registers.js` moves a field and asks whether the grid's text changes;
 * `wallFeel` did not, because the Whisker row prints `rockAhead` itself and a
 * sway computed out of `_aux`, so the field named here was reported by nothing.
 * `_in` and `_aux` were the mirror image, filed as scratch in `FIELD_SILENT`
 * while both sways are functions of them.
 */
export const FIELD_REPORTS = {
  id: "the panel heading — the creature's name, a pure function of it, with the number kept in the heading's title (v1.119)",
  hue: "the swatch beside the heading",
  generation: "the Generation row",
  age: "the Age row",
  energy: "the Energy row",
  children: "the Children row",
  radius: "the Size row, and the Reach row — every contact distance is derived from it",
  metabolismScale: "the Metabolism row",
  carnivory: "the Diet row",
  groundFeel: "the Underfoot row (groundSense)",
  rockAhead: "the Whisker row (wallSense) — the distance, or the word for a miss",
  walled: "the Whisker row (wallSense) — rock refused its last move",
  speciesId: "the Species link and the ancestry pips",
  parentId: "the family line under the heading (v1.146) — the chain of names back to a founder, and the sentence about what changed down it",
  genome: "the inherited-brain figure — the strip, or the evolved network diagram",
  brain:
    "the learned-brain figure (plasticity) — and the Steers-by, Underfoot and " +
    "Whisker rows, whose sways are this brain answering a hypothetical",
  _in: "the Steers-by, Underfoot and Whisker rows — a sway holds every other sense at what this creature perceived, so every number in all three is a function of this buffer",
  _aux: "the Steers-by, Underfoot and Whisker rows — as _in, and it is the buffer an auxiliary sense is swept *in*",
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
  wallFeel:
    "rockAhead normalised and clamped, and what the brain is given. The Whisker " +
    "row prints the distance itself and a sway taken out of _aux, so no text on " +
    "the panel is a function of this field — it was filed as reported until " +
    "v1.103 swept the rows instead of reading them",
  // The one with no argument, and v1.110 narrowed rather than closed it: the
  // Steers-by row names the clock and prices what it could do to the motors, so
  // the channel is on the page now. Where in its cycle *this* animal is, is
  // still nowhere — the row sweeps `_in[12]`, which is sin(phase), between its
  // two ends, and a swept channel's own value is the one thing a sway holds
  // nothing at. `walled` was the other silence of this kind until v1.102 gave
  // the whisker a row.
  phase:
    "UNREPORTED — where in its cycle the internal oscillator is. The Steers-by " +
    "row says what the clock is worth to the motors and never what it reads",
};

/**
 * The fields `FIELD_REPORTS` names as said by something that is not a row.
 *
 * v1.77 wrote that sentence as a comment and nothing could act on it, so the
 * coverage claim above could only ever be checked for *membership* — a field
 * listed here with a reason naming a row that does not mention it passed, which
 * is how `wallFeel` stood for a release. This is the half a test can hold:
 * everything in `FIELD_REPORTS` and not in here must move the grid's text when
 * it moves, and everything in here must not.
 *
 * `brain` is deliberately absent, which is the correction. It draws a figure
 * *and* both sways are it answering a hypothetical, so it is the one field the
 * panel says in a picture and in words at once.
 */
export const FIELD_OFF_GRID = {
  id: "the panel heading, which inspectorview.js builds — a name, not a row",
  hue: "the swatch beside the heading — a colour",
  speciesId: "the Species link and the ancestry pips",
  parentId: "the family line under the heading — names and two sentences, built by inspectorview.js from lineage.js's records, never a row",
  genome: "the inherited-brain figure — a strip or a diagram, never a row",
};
