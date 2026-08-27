// switches.js — the thirty-one switches in the panel, as data.
//
// v1.118 did this to the stat tiles and the entry that shipped it nominated
// this surface as the next job. v1.119 nominated it again, and wrote down that
// a thing named twice is a thing to do or stop writing about. So: the switches.
//
// What a visitor met until now was one undivided column of thirty-one
// checkboxes in the order I happened to add them across a hundred and nineteen
// releases — `Licensed diet cost (only hunters pay for carnivory) 🧾` sitting
// between `Scavenging` and `Kin recognition`, `Reduce motion` two rows under
// `Evolvable brains`. Every row the same size, the same colour, the same
// weight, with nothing anywhere saying which of them rewrites the pond and
// which of them only redraws it.
//
// **That last part is the finding, and it is not a matter of taste.** Six of
// these thirty-one — the trail, the reach, the vision cone, the refuge line,
// follow, reduced motion — never touch the water at all. They are settings on
// the *picture*: switch one and the pond goes on exactly as it would have,
// bit for bit. The other twenty-five world rules change the pond, and several
// of them change it so much that the one you were watching is gone in a minute.
// A page that draws both kinds identically is telling a first-time visitor
// that ticking `Show the trail 🧭` is the same size of decision as ticking
// `Predation 🔺`. It is not. `src/levers.js` has had the vocabulary for this
// since v1.40 — it calls them *channels*, and sweeps every constant in
// `config.js` for which one it moves — and the page a person actually uses
// had never been told.
//
// So the switches have sections now, and the last section is the six that
// change nothing in the water and says so in its heading.
//
// **I tried to order the rows inside each section by measurement and there is
// nothing there to measure.** v1.118 and v1.119 both closed by admitting an
// ordering was a judgement no instrument here could check, so this cycle built
// the instrument: flip one rule, run it against its own control, six seeds,
// 1,500 ticks. Twice, because the first answer was wrong in a way worth writing
// down. Measuring the *distance* between control and flipped ranked `barriers`
// first and `predation` eighth — which is not an effect size, it is chaos: this
// pond is deterministic and sensitive, so any rule that bites at all sends the
// world onto a different trajectory and the distance after 1,500 ticks says
// only *that* it bit. The second sweep measured the paired, signed change in
// the numbers a visitor actually reads, which cancels for a rule with no
// systematic effect — and then **the direction disagreed across seeds for all
// but one rule.** Only `seasons` moves the population the same way on six ponds
// out of six.
//
// So the order inside a section is a judgement, said out loud as one. What the
// two sweeps *do* agree on, and what `SWEEP` below records, is the thing they
// were never pointed at: which rules do anything at all.
//
// **Two of them do not.** `kinRecognition` and `deathIsFinal` leave the world
// **bit for bit identical** on all six seeds — not merely similar, the same
// state hash for 1,500 ticks. Both were already known one at a time
// (`src/levers.js` on the first, v1.45 on the second) and neither fact had ever
// reached the page, so a visitor could tick either box and watch nothing happen
// forever with nothing to tell them why. They say so now, once, when switched
// on — the courtesy the refuge line has had since it learned to notice that
// predation was off.
//
// **The closure that came free.** Once every switch declares the config flag it
// writes, the page can be compared against `config.js` in both directions:
// every boolean rule this world has is either reachable from the panel or named
// in `UNEXPOSED` with a reason. There is exactly one of the latter, and finding
// out that there was exactly one — rather than believing it — is the point.
//
// PURE DATA. No DOM, no world, no random numbers. `test/switches.test.js` reads
// the shipped page back and fails if a switch is drawn under a heading this
// table does not put it under, or if a row in the last section turns out to
// write into the config after all.

/**
 * The seven sections, in the order the page lays them out.
 *
 * `title` is the heading and `hint` is the one plain sentence under it, which
 * is the only place on this page that gets to say what a group of switches is
 * *for* before the switches say what they are. The hints clear
 * `src/headline.js`'s vocabulary bar — no *carnivore*, *lineage*, *genome*,
 * *tick*, *px*, *predation* — for that module's reason: every readout here
 * became technical one honest, correct word at a time, and a heading is
 * exactly where that starts again.
 *
 * The order is a judgement and the header says why it could not be anything
 * else. *Who eats whom* first because it is the thing a visitor came to see and
 * the one rule whose effect is unmistakable within seconds — switch predation
 * off and the kill counter stops, on every seed, permanently. *What you see*
 * last because it is the one section that cannot break anything.
 *
 * @type {Array<{key: string, title: string, hint: string}>}
 */
export const SWITCH_GROUPS = [
  {
    key: "hunting",
    title: "🔺 Who eats whom",
    hint: "whether anything hunts, what a taste for meat costs, and who gets spared",
  },
  {
    key: "food",
    title: "🌱 What there is to eat",
    hint: "where the food is, whether it grows back, and how the year turns",
  },
  {
    key: "place",
    title: "🏞 The place they live",
    hint: "the ground, the rock, the dark and the illness that runs through it",
  },
  {
    key: "senses",
    title: "👀 What they can sense",
    hint: "how much of the world reaches a creature before it has to guess",
  },
  {
    key: "change",
    title: "🧠 How they change",
    hint: "what a parent hands on, and what a life can learn on its own",
  },
  {
    key: "physics",
    title: "⚖️ The fine print",
    hint: "small rules about bodies and turns; each one is a fair test of itself",
  },
  {
    key: "view",
    title: "👁 What you see",
    hint: "these change the picture only — the pond runs exactly the same either way",
  },
];

/** Every group key, for the membership check a switch's `group` has to pass. */
const GROUP_KEYS = new Set(SWITCH_GROUPS.map((g) => g.key));

/**
 * The one section whose switches may not touch the world. Named here rather
 * than left as a convention, because `test/switches.test.js` reads `main.js`
 * and holds every row in it to the claim its heading makes.
 */
export const VIEW_GROUP = "view";

/**
 * Every switch on the page: the checkbox's `id`, the section it belongs to, the
 * `config` key it writes (`null` for the six that write none), and the caption
 * the page shows.
 *
 * This array **is** the page's order — `switchOrder()` groups it and the markup
 * follows — so a switch moves between sections by editing one word here, and
 * `test/switches.test.js` fails if the page and this table disagree about which
 * heading a row sits under.
 *
 * The captions keep the short name the README's rule table uses and rewrite the
 * gloss after it, which is where the jargon was: *"only hunters pay for
 * carnivory"*, *"sight the index can't clip"*, *"crossover"*, *"seniority stops
 * paying"* — each one a correct sentence written for somebody who already knew
 * the answer.
 *
 * @type {Array<{id: string, group: string, flag: string|null, label: string}>}
 */
export const SWITCHES = [
  // --- Who eats whom ---
  { id: "toggle-predation", group: "hunting", flag: "predation", label: "Predation (some of them hunt the others) 🔺" },
  { id: "toggle-licensed", group: "hunting", flag: "licensedDietCost", label: "Licensed diet cost (only real hunters pay the meat bill) 🧾" },
  { id: "toggle-scavenging", group: "hunting", flag: "scavenging", label: "Scavenging (the dead can be eaten too) 🦴" },
  // The switch and its readout carry the same mark from v1.120: the panel has
  // said `Family spared 👪` since v1.118 and this row said 🧬, which is also
  // the evolvable-brain row's mark. Two rules sharing an emoji is a small lie
  // about which readout answers which switch.
  {
    id: "toggle-kin",
    group: "hunting",
    flag: "kinRecognition",
    label: "Kin recognition (hunters spare close family) 👪",
    quiet: "Kin recognition is on — but in every pond measured, no hunter ever meets a close relative, so nothing changes. Try another seed.",
  },

  // --- What there is to eat ---
  { id: "toggle-regrowth", group: "food", flag: "foodRegrowth", label: "Regrowth (plants breed; a herd can strip the pond) 🌾" },
  { id: "toggle-patches", group: "food", flag: "foodPatches", label: "Biomes (food clumps instead of spreading evenly) 🌿" },
  { id: "toggle-seasons", group: "food", flag: "seasons", label: "Seasons (the food swings with the year) ☀︎❄︎" },
  { id: "toggle-drift", group: "food", flag: "biomeDrift", label: "Drifting biomes (the good places move) 🧭" },

  // --- The place they live ---
  { id: "toggle-barriers", group: "place", flag: "barriers", label: "Barriers (rock the pond has to walk around) 🧱" },
  { id: "toggle-terrain", group: "place", flag: "terrain", label: "Terrain (rough ground costs more to cross) ⛰️" },
  { id: "toggle-daynight", group: "place", flag: "dayNightCycle", label: "Day/night cycle (they see less at night) 🌙" },
  { id: "toggle-disease", group: "place", flag: "disease", label: "Contagion (illness spreads; survivors are immune) 🦠" },
  { id: "toggle-detritus", group: "place", flag: "detritus", label: "Detritus (the ground remembers its dead) 🍂" },
  { id: "toggle-occlusion", group: "place", flag: "barrierOcclusion", label: "Opaque rock (walls block sight, sound and illness) 🌒" },

  // --- What they can sense ---
  { id: "toggle-signalling", group: "senses", flag: "signalling", label: "Signalling (they hear each other's calls) 📣" },
  { id: "toggle-groundsense", group: "senses", flag: "groundSense", label: "Ground sense (they feel the ground underfoot) 👣" },
  { id: "toggle-whisker", group: "senses", flag: "wallSense", label: "Whisker (they feel the rock ahead) 📡" },
  { id: "toggle-exactvision", group: "senses", flag: "exactVision", label: "Exact vision (nothing slips past the edge of sight) 👁️" },

  // --- How they change ---
  { id: "toggle-sexual", group: "change", flag: "sexualReproduction", label: "Sexual reproduction (young mix two parents) 👫" },
  { id: "toggle-neat", group: "change", flag: "evolvableTopology", label: "Evolvable brains (a brain can grow new parts) 🧬" },
  { id: "toggle-plasticity", group: "change", flag: "plasticity", label: "Neural plasticity (they learn during their own lives) 🧠" },

  // --- The fine print ---
  { id: "toggle-bodies", group: "physics", flag: "bodyCollision", label: "Solid bodies (two can't share a spot) ↔️" },
  { id: "toggle-mass", group: "physics", flag: "massWeightedShove", label: "Mass-weighted shove (the smaller body yields) ⚖️" },
  {
    id: "toggle-deathfinal",
    group: "physics",
    flag: "deathIsFinal",
    label: "Death is final (the dead take no further turn) ⚰️",
    quiet: "Death is final is on — but in every pond measured, nobody ever acts after dying anyway, so nothing changes.",
  },
  { id: "toggle-turnorder", group: "physics", flag: "shuffleTurnOrder", label: "Shuffled turn order (being born early stops paying) 🔀" },

  // --- What you see ---
  { id: "toggle-follow", group: "view", flag: null, label: "Follow selected creature 🎯" },
  { id: "toggle-trail", group: "view", flag: null, label: "Show the trail (where the selected one has been) 🧭" },
  { id: "toggle-vision", group: "view", flag: null, label: "Show vision (what the selected one can really see)" },
  { id: "toggle-reach", group: "view", flag: null, label: "Show the reach (how close the selected one has to be to touch something) 📏" },
  { id: "toggle-refuge", group: "view", flag: null, label: "Show the refuge line (who is still big enough to eat) 🔒" },
  { id: "toggle-motion", group: "view", flag: null, label: "Reduce motion (no comet trails) 🎞️" },
];

/**
 * The rules in `config.js` that have no switch, and why not. One entry, and the
 * value of the list is that it is one: until this table existed, "is every rule
 * on the page?" was a question nobody could answer without reading two files
 * side by side, and the answer would have been out of date by the next release.
 */
export const UNEXPOSED = Object.freeze({
  autoReseed:
    "the rescue that refills a pond after total extinction. Switching it off from the panel " +
    "would hand a visitor a world that can end while they are looking away and never come back, " +
    "which is not a rule about this ecology — it is a way to lose the page.",
});

/**
 * What the second sweep found, kept here rather than only in the diary for the
 * reason `src/targetsize.js` and `src/legibility.js` keep their walks: a
 * measurement nobody can re-read is a memory, and the next cycle that wants to
 * know whether a rule is worth a visitor's attention should not have to run it
 * again to find out.
 *
 * Each row is one rule flipped against its own control on seeds 42, 128, 256,
 * 314, 777 and 2026, run 1,500 ticks, with the population and food averaged
 * over the last 500 so a single crowded instant does not decide it. `alive` is
 * the mean signed change in the population and `agree` is **how many of the six
 * ponds moved the same way** — which is the column that matters and the column
 * that makes this table honest. A rule at 3/6 has no direction; its `alive`
 * number is an average of ponds that disagreed, and quoting it as an effect
 * would be the same error as quoting the first sweep's distances.
 *
 * `inert` is the one verdict here that is not a matter of degree, and it is not
 * a memory either: `test/switches.test.js` re-runs it every build against the
 * state hash, so a release that gives one of these two rules something to do is
 * a failing test rather than a stale comment.
 *
 * Two dependencies are recorded because the first sweep got one of them wrong
 * and called a live rule dead — `massWeightedShove` decides who yields in a
 * collision and is mute in a world where nothing collides. Same shape as
 * `src/levers.js`'s `SPECIAL`, learned again the hard way.
 *
 * @type {Object<string, {alive: number, agree: number, food: number, needs?: string, inert?: boolean}>}
 */
export const SWEEP = Object.freeze({
  barrierOcclusion: { alive: 0.68, agree: 4, food: -0.007, needs: "barriers" },
  signalling: { alive: -0.511, agree: 5, food: 1.185 },
  wallSense: { alive: 0.417, agree: 5, food: -0.011, needs: "barriers" },
  evolvableTopology: { alive: -0.307, agree: 4, food: 1.151 },
  barriers: { alive: -0.303, agree: 5, food: 1.185 },
  seasons: { alive: -0.201, agree: 6, food: 0.04 },
  bodyCollision: { alive: 0.198, agree: 3, food: 0.017 },
  sexualReproduction: { alive: -0.182, agree: 5, food: 0.14 },
  foodPatches: { alive: 0.139, agree: 3, food: 1.083 },
  detritus: { alive: -0.131, agree: 4, food: 0.004 },
  massWeightedShove: { alive: -0.117, agree: 3, food: 0.043, needs: "bodyCollision" },
  groundSense: { alive: 0.116, agree: 2, food: 1.146 },
  dayNightCycle: { alive: 0.109, agree: 3, food: 0.055 },
  foodRegrowth: { alive: -0.099, agree: 4, food: -0.211 },
  shuffleTurnOrder: { alive: -0.096, agree: 3, food: -0.032 },
  biomeDrift: { alive: -0.09, agree: 4, food: 0.072 },
  plasticity: { alive: -0.072, agree: 4, food: 0.069 },
  terrain: { alive: 0.068, agree: 2, food: 0.97 },
  scavenging: { alive: 0.065, agree: 4, food: -0.011 },
  licensedDietCost: { alive: 0.056, agree: 4, food: 0.026 },
  exactVision: { alive: -0.028, agree: 3, food: 0.112 },
  // The one rule whose effect needs no statistics: switching predation off
  // takes the kill count to zero on every seed. The population barely moves,
  // which is the interesting half and is `docs/SCIENCE.md`'s territory.
  predation: { alive: -0.027, agree: 4, food: 0.038 },
  disease: { alive: -0.019, agree: 4, food: -0.025 },
  kinRecognition: { alive: 0, agree: 6, food: 0, inert: true },
  deathIsFinal: { alive: 0, agree: 6, food: 0, inert: true },
});

/** How many of the six ponds have to move the same way to call it a direction. */
export const AGREE_BAR = 5;

/** The rules that leave the pond bit-for-bit identical, with what the page says. */
export function quietSwitches() {
  return SWITCHES.filter((s) => s.quiet);
}

/** The switches in one section, in table order. */
export function switchesIn(group) {
  return SWITCHES.filter((s) => s.group === group);
}

/** Every switch, grouped: the page's layout, derived rather than typed twice. */
export function switchOrder() {
  return SWITCH_GROUPS.flatMap((g) => switchesIn(g.key));
}

/** The twenty-five that write into the config. */
export function worldSwitches() {
  return SWITCHES.filter((s) => s.flag !== null);
}

/** The six that write into the renderer and the camera, and nowhere else. */
export function viewSwitches() {
  return SWITCHES.filter((s) => s.flag === null);
}

/** Every group a switch claims that `SWITCH_GROUPS` does not declare. */
export function unknownGroups() {
  return SWITCHES.filter((s) => !GROUP_KEYS.has(s.group)).map((s) => s.id);
}
