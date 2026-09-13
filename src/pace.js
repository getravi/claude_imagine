// pace.js — how fast the pond runs, in words, beside the water.
//
// One hundred and seventy-five releases, and every one of them has shipped a
// pond that runs at exactly one speed unless you go and find the slider. The
// slider is `min="1" max="20"`, which is the whole of this cycle in one
// attribute: **every setting it has ever offered makes the pond harder to
// follow than the one it opens on.** There has never been a slower.
//
// And the two controls that touch the pond's pace are the deepest things on the
// page. The walk, on the app as it loads, at the two viewports the rest of this
// project's browser work uses:
//
//     390 × 844    #btn-pause   top 4,663 of a 5,724 px document   81.5%
//                               the 31st of 49 targets a thumb can reach
//                  #speed       top 5,154                          90.0%
//                               the 39th of 49 — deeper than the die v1.175 moved
//     1280 × 900   #btn-pause   top   260 of a 3,571 px document    7.3%
//                  #speed       top   750                          21.0%
//
// The desktop column is the control and it says what the phone column is really
// about: nothing is wrong with this page. It is wrong with **what this page
// becomes at one column**, which is the width most visitors arrive at, and it is
// the fourth cycle running to find its release there.
//
// After, at the same two widths: the row stands at **872 px** on the phone —
// 15.0% of the document, the 25th of 52 targets — and at 1,047 on the desktop,
// where it cost 787. The same trade v1.153 and v1.169 paid and for the same
// reason: the drawer is a column *beside* the water at 1280, so anything leaving
// it moves down, and the pond already ends below the fold at that height.
//
// The excuse in `firstmoves.js` was written in v1.169 and I still half agree
// with it: *stops the clock. A control on the run rather than on the pond, and
// the one press here a visitor finds without being offered it — the pond is the
// only thing on the page that moves.* That is a sentence about a **mechanism**
// — a clock — and about a **discovery** nobody has ever measured. It is the
// fourth sighting of v1.175's rule and the first where the act the widget is
// the only route to is not somewhere to go but something to *see*: the act is
// **hold on, let me look at that**, and on a phone there is no hint of it
// either, because the `Space` reminder lives in `.keys-only` and a coarse
// pointer never renders it.
//
// ## The number was already in this repository, in a file that drew the wrong
// ## conclusion from it
//
// `doing.js` measured the animal you are watching over 52,841 sampled instants
// and found that what it is doing changes **every 14.5 ticks**, median run 10.
// At 1× on a 60 Hz frame that is a new fact about your animal every 0.24
// seconds, which is not something a person reads — so the caption is held for
// 1,500 ms, and that file wrote down exactly why the hold is in milliseconds:
//
//   > what the hold protects is not a property of the pond but of a **reader's
//   > eye**, and a reader's eye runs at the same speed whether the slider says
//   > 1× or 20×.
//
// Both halves of that are right and the conclusion nobody drew is the other
// one. If the eye is fixed and the pond is not, then the slider is the only
// control on this page that changes how much of the pond a person can actually
// take in — and it only ever went up. Every stop it offered asked the caption to
// paper over more:
//
//     pace     1,500 ms of hold covers    the shown line is stale
//     0.25×     22.5 ticks ≈  1.6 states   about 30%
//     1×          90 ticks ≈  6.2 states   44.2%   ← where the page opens
//     4×         360 ticks ≈ 24.8 states   over 49%
//     20×      1,800 ticks ≈  124 states   —
//
// The staleness column is read off `doing.js`'s own recorded table (hold 15 →
// 24%, 30 → 36%, 90 → 44.2%, 180 → 49%), interpolated between its points; the
// last two rows run off the end of it, which is its own answer. **Nothing here
// was ever measured below 1×, because below 1× did not exist.**
//
// ## Five holds, and not one of them can slow the pond down
//
// The same defect has been solved five separate times, each time by slowing the
// *words* instead: `doing.js`'s 1,500 ms, the news banner's 5,200, the toast's
// 1,800 and 4,200, `pondsound.js`'s 600 ms beat, and `headline.js`'s 360 ticks
// — four of the five on a reader's clock rather than the pond's, each invented
// independently, each one an admission that 1× is faster than a person. A row
// of four words under the water is the version of that admission a visitor can
// act on.
//
// ## What the stops are, and why those numbers
//
// Measured over twelve seeds, 3,000 ticks each after a 400-tick warm-up —
// 5.5 million sampled displacements, wrap-arounds dropped:
//
//     stop      ticks/s   a creature covers   crosses the pond in   births+deaths
//     Slow  ¼×      15         11 px/s              79 s              2.9 /s
//     Normal 1×     60         45 px/s              20 s             11.5 /s
//     Fast   4×    240        182 px/s               5 s             45.8 /s
//
// **Slow is a quarter and not a half**, because a half changes the reading of
// none of the numbers above: 0.48 s a state against 0.24 is still quicker than
// anything a person reads, and 5.7 births and deaths a second is still a blur.
// A quarter is the first pace at which the pond produces roughly one fact a
// second, which is a speech.
//
// **Fast is four and not twenty.** A generation here is about 400 ticks: 6.7 s
// at Normal, 1.7 s at Fast, and 0.3 s at the slider's ceiling. Four is the pace
// at which evolution is a thing you watch; twenty is a pace at which it is a
// thing that has already happened, which is what `⏩ Skip ahead` is for and why
// this row does not reach for it. The slider keeps the ceiling for whoever wants
// it.
//
// ## The arithmetic, and why it cannot move a world
//
// A pace below one cannot be a loop count, so the frame carries a budget:
// `stepBudget` adds the pace to whatever was left over and spends the whole
// part of it. **At every integer pace the carry is zero on every frame**, so the
// loop runs exactly the count it ran before this file existed and the default
// pond is untouched — `test/pace.test.js` asserts that against the same integer
// sweep the fingerprint uses.
//
// It could not move a world in any case, and this is the strongest guarantee in
// the cycle rather than a hope: `stepsPerFrame` is the one constant in
// `config.js` that `levers.js` marks `channel: "ui"`, and `test/levers.test.js`
// re-derives every release that neither `World.step` nor the phylogeny ever
// reads it. How often a caller steps the world is not a property of the world.
// Pace changes how much wall time passes between two ticks and nothing else;
// the sequence of ticks is the same sequence.
//
// PURE OBSERVER. No DOM, no simulation state, no random numbers — a list of
// four stops, one accumulator and the recorded sweep behind the numbers.

/** The pace the page opens at, and the one `config.stepsPerFrame` declares. */
export const NORMAL_STEPS = 1;

/**
 * The three paces the row offers, in the order a hand reads them: slowest on
 * the left, because that is the direction every media control a visitor has
 * ever used runs in, and because the leftmost of the four is the pause.
 *
 * `label` is a bare word on purpose, and it is the one decision here I expect an
 * argument about. Every other control in the main column wears an emoji, and
 * three of them stand in the row directly below this one. These do not, for two
 * reasons: the four buttons are one question with one answer, so an icon apiece
 * would be four pictures where the group needs none; and the words *Slow*,
 * *Normal* and *Fast* are already the most-recognised trio of labels on the
 * internet. The play button beside them carries the only glyph, which is how a
 * person finds the group in the first place.
 */
export const PACE_STOPS = Object.freeze([
  Object.freeze({ key: "slow", label: "Slow", steps: 0.25, say: "quarter speed" }),
  Object.freeze({ key: "normal", label: "Normal", steps: NORMAL_STEPS, say: "normal speed" }),
  Object.freeze({ key: "fast", label: "Fast", steps: 4, say: "four times speed" }),
]);

/** The id of the row's play/pause button, and of each stop, in `app/index.html`. */
export const PLAY_ID = "btn-play";
export const stopId = (key) => `btn-pace-${key}`;

/** The class on the row that holds them. */
export const ROW_CLASS = "pacerow";

/**
 * The two faces of the play button. The *label* carries the state and nothing
 * else does — `#btn-simple`'s rule in v1.149, and the reason it applies here is
 * the same one: a button reading `▶ Play` that also announces itself as pressed
 * is telling a listener two different things about one control.
 */
export const PLAY_LABEL = "▶ Play";
export const PAUSE_LABEL = "⏸ Pause";

/** What the row is, for a listener who has no water above it to read it from. */
export const ROW_LABEL = "How fast the pond runs";

/** WCAG 2.2 SC 2.5.5 (Enhanced): the bar the row under the water is held to. */
export const TOUCH_ENHANCED = 44;

/**
 * Which stop a steps-per-frame number *is*, or `null` for one that is none of
 * them — which is every value of the slider except 1 and 4.
 *
 * Returning `null` rather than the nearest stop is the whole contract, and it
 * is v1.156's rule about labels: a row that lit *Fast* for a slider sitting at
 * 7× would be a control claiming to describe a state it does not hold. Nothing
 * lit is the honest reading of a pace this row cannot offer, and the pace is
 * still on the plate beside the slider that set it.
 */
export function stopFor(steps) {
  const n = Number(steps);
  return PACE_STOPS.find((s) => s.steps === n) || null;
}

/** The steps-per-frame a stop key asks for, or `null` for a key that is not one. */
export function stepsFor(key) {
  const s = PACE_STOPS.find((p) => p.key === key);
  return s ? s.steps : null;
}

/**
 * A pace as the slider's plate should read it: `1×`, `0.25×`, `20×`.
 *
 * Trailing zeros go, because `0.250×` is a precision this control does not have
 * and `0.25×` is the number a person would say out loud.
 */
export function paceLabel(steps) {
  const n = Number(steps);
  if (!Number.isFinite(n)) return "";
  return `${Number(n.toFixed(2))}×`;
}

/**
 * What a press on this row should announce, for the toast and for a listener.
 *
 * The sentence names the pond rather than the control — *the pond is running at
 * quarter speed*, not *speed set to 0.25* — because the row's whole claim is
 * that pace is a property of the water and not a setting on a machine.
 */
export function paceSentence(steps, running) {
  if (!running) return "The pond is paused. Nothing moves until you press play.";
  const stop = stopFor(steps);
  if (stop) return `The pond is running at ${stop.say}.`;
  return `The pond is running at ${paceLabel(steps)} speed.`;
}

/**
 * The frame's stepping budget: add `steps` to whatever the last frame left over,
 * spend the whole part, carry the rest.
 *
 * The carry is what makes a pace below one possible at all, and the reason it is
 * a function rather than two lines in the animation loop is that a test can then
 * hold it to the thing that matters: **at an integer pace the carry is zero on
 * every frame**, so this returns exactly the loop count `for (i < speed)` ran
 * before it existed. A world that steps the same number of times in the same
 * order is the same world.
 *
 * A pace of zero spends nothing and carries nothing, which is what a paused pond
 * would ask for if the loop ever routed a pause through here — it does not, and
 * the branch is here so that it cannot be the thing that breaks if one day it
 * does.
 *
 * @param {number} carry what the last frame left over, in ticks
 * @param {number} steps this frame's pace, in ticks per frame
 * @returns {{steps: number, carry: number}}
 */
export function stepBudget(carry, steps) {
  const c = Number.isFinite(carry) ? Math.max(0, carry) : 0;
  const s = Number.isFinite(steps) ? Math.max(0, steps) : 0;
  const budget = c + s;
  const whole = Math.floor(budget);
  return { steps: whole, carry: budget - whole };
}

/**
 * The recorded sweep behind every number in the header, so the prose and the
 * suite cannot part company. Twelve seeds, 3,000 ticks each after a 400-tick
 * warm-up; `px` is the mean per-tick displacement of a living creature with
 * wrap-arounds dropped, `events` the births and deaths per tick.
 *
 * Kept as the two measured quantities rather than as the nine derived ones: a
 * table of products is nine numbers that can disagree with each other, and the
 * derivations are one multiplication each. `test/pace.test.js` does them.
 */
export const SWEEP = Object.freeze({
  seeds: 12,
  ticksEach: 3000,
  warmup: 400,
  samples: 5514813,
  pxPerTick: 0.757,
  eventsPerTick: 0.191,
  pondWidth: 900,
  frameHz: 60,
  /** `doing.js`'s figure, quoted rather than re-measured: ticks between changes. */
  stateTicks: 14.5,
  /** `doing.js`'s hold, in milliseconds, for the same reason. */
  holdMs: 1500,
  /** About a generation, for the arithmetic in the header. */
  generationTicks: 400,
});

/** Ticks a second at a given pace on a 60 Hz frame. */
export const ticksPerSecond = (steps) => steps * SWEEP.frameHz;

/** How many of an animal's states a 1,500 ms caption has to paper over at a pace. */
export function statesPerHold(steps) {
  const ticks = (SWEEP.holdMs / 1000) * ticksPerSecond(steps);
  return ticks / SWEEP.stateTicks;
}

/** Seconds for a creature to cover the pond's width at a pace, at the mean speed. */
export function pondCrossing(steps) {
  const pxPerSecond = SWEEP.pxPerTick * ticksPerSecond(steps);
  return pxPerSecond > 0 ? SWEEP.pondWidth / pxPerSecond : Infinity;
}

/** Births and deaths a second at a pace. */
export const eventsPerSecond = (steps) => SWEEP.eventsPerTick * ticksPerSecond(steps);

/** Seconds a generation takes at a pace. */
export const generationSeconds = (steps) => SWEEP.generationTicks / ticksPerSecond(steps);

/**
 * The walk that moved the row, kept in the shape `firstmoves.js#AIMED_WALK`
 * uses — `top` is the first of the pace controls a scrolling visitor reaches,
 * `rank` its place in the queue of targets, `doc` the height it is a share of.
 *
 * A second record rather than an edit of that file's, for its own stated reason:
 * a recording somebody overwrites is a recording of nothing.
 */
export const PACE_WALK = Object.freeze({
  "390x844": Object.freeze({
    before: Object.freeze({ doc: 5724, top: 4663, rank: 31, targets: 49 }),
    after: Object.freeze({ doc: 5797, top: 872, rank: 25, targets: 52 }),
  }),
  "1280x900": Object.freeze({
    before: Object.freeze({ doc: 3571, top: 260, rank: 20, targets: 48 }),
    after: Object.freeze({ doc: 3645, top: 1047, rank: 36, targets: 51 }),
  }),
});

/**
 * What the row cost the button this page recommends, measured rather than
 * argued: `👋 Meet somebody` went from 862 px to 936 on the phone and from
 * 1,037 to 1,111 on the desktop — 74 px at both, which is this row's height
 * plus its gap.
 *
 * It is a separate record from `PACE_WALK` because it is the *other* side of
 * the trade and this project has a habit of stating only the winning half.
 * 74 px off the first move buys 3,791 off the pace control on a phone; the
 * ratio is the argument, and a reader who thinks it is the wrong one now has
 * both numbers rather than one.
 */
export const MEET_COST = Object.freeze({
  "390x844": Object.freeze({ before: 862, after: 936 }),
  "1280x900": Object.freeze({ before: 1037, after: 1111 }),
});
