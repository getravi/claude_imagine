// eyeview.js — the pond as the animal has it, which is almost none of the pond.
//
// The front door promises *watch evolution happen* and the app has spent
// thirty-odd releases keeping that promise from the outside: what the crowd is
// doing, what has changed since tick one, who is worth watching, what they die
// of. Every one of those is a view from above. Meanwhile the sentence the
// landing page uses to sell the whole thing — *each one is steered by a tiny
// brain it was born with* — has never had a picture on the quiet side of
// v1.149's switch, and the only surface that ever showed a brain at all is the
// inspector's weight strip, which is behind that switch and is a bar chart of
// 243 numbers.
//
// This is the other way to show a mind, and I think it is the one a stranger
// actually wants:
//
//   **not what the brain is made of — what it is looking at.**
//
// A creature here does not see the water. `Creature#sense` hands it sixteen
// numbers, and only nine of them are about the world outside its own body: a
// direction and a distance to the nearest speck of food, to the nearest animal
// it could eat, and to the nearest animal that could eat it. That is the whole
// of its knowledge. The pond a visitor is looking at — hundreds of pellets, a
// season, a shoreline, forty other animals — does not reach it at all.
//
// I find that genuinely startling every time I re-read `sense()`, and nothing
// on this page has ever said it out loud. It also does a job no other panel
// does: it explains the *failures*. A visitor who watches an animal swim
// straight past a pellet concludes the simulation is broken. It is not broken —
// and the sweep says how often it looks that way. **Over twelve seeds and six
// thousand ticks each (264,780 pond-instants), 28.3% of the animals that can
// see food at all have it behind them.** More than one in four of the animals
// on screen is, at any moment, steering by a speck a visitor can see and it
// cannot get to without turning. One picture answers that, and no amount of
// prose has.
//
// The same sweep says what the panel will mostly be showing: **0.1% of instants
// have nothing in sight, 70.6% one thing, 27.6% two and 1.7% all three.** So
// the common case is a single dot and a lot of empty water, which is the point;
// and the empty disc, at one instant in a thousand, is rare enough to be worth
// waiting for and real enough to be worth writing words for.
//
// ## What is drawn, and why each mark is the mark it is
//
// A disc, the animal at the centre, **its own nose pointing up**. That last
// part is the whole design: every bearing in the input vector is relative to
// the creature's heading, so a picture with north at the top would be drawing a
// frame of reference the animal does not have. Up is *ahead*. Right of centre
// is *its right*. A blip that sits still while the animal turns would be a lie
// about what it is being told.
//
// Three marks, and every one of them is borrowed rather than invented, because
// the page already teaches this vocabulary in `🔍 What you are looking at`:
//
//   * **Food** is the pond's own mote, drawn twice like `key.js`'s swatch does,
//     because the pond composites food additively and one mote at its own
//     opacity is what a lone speck looks like.
//   * **An animal it could eat** is a body in one of `key.js`'s stand-in hues —
//     the same shades that placard uses when it has to draw a creature that is
//     nobody in particular.
//   * **An animal that could eat it** wears the predator outline, the warm line
//     that is on every hunter in every frame.
//
// And the reach itself is `visionReach()` — literally the ring `V` puts around
// a creature in the water. A visitor who has pressed `V` has already seen this
// circle; this is the same circle with the outside cut away.
//
// ## Two rules I had to decide rather than measure
//
// **1. The words say *what*; the picture says *where*. This is the second draft
// and the first one was wrong on screen.** `lifeline.js` had already settled
// the general form — *the words carry the scale, the ink carries the moment* —
// and I applied it here as *hold the sentence, redraw the disc every frame*,
// with the bearing in the sentence. A browser walk caught the result: the line
// read *a speck of food behind it on its left* beside a disc with the speck up
// and to the left. Both were correct; they were 900 ms apart. A blip moves
// every tick, so **any** held description of *where* contradicts a live picture
// of it sooner or later, and a reader who catches a caption disagreeing with
// the figure beside it stops trusting both.
//
// So the split is by *quantity*, not by refresh rate. The visible line names
// only what is in sight — which, followed across twelve seeds for six thousand
// ticks each, changes **0.36 times a second** at 1×, about once every three
// seconds — and the disc carries every bearing. Nothing the line says can go
// stale against the picture, and the hold stops being a source of disagreement
// and becomes what it should have been: a floor under churn at 20×, where the
// same quantity turns over about seven times a second and this caps it near
// one.
//
// The `aria-label` is the exception and keeps both the bearing and the
// distance, because a listener has no disc to read them off and nothing to
// catch the label out against.
//
// **2. Prey and threat are gated on `config.predation`, and the senses are
// not.** This is `doing.js`'s finding and it is worth restating because it
// surprised me twice: `World#step` fills the prey and threat slots from
// `Creature#canEat`, which never asks whether predation is switched on — only
// the bite does. So in a pond where nothing hunts, an animal is still being
// told where the nearest bigger carnivore is, and a picture that drew that mark
// would be telling a visitor about a danger their world does not have. A brain
// never needs to know the mechanic is off. An observer drawing a placard about
// it does.
//
// ## Determinism
//
// PURE OBSERVER, in `doing.js`'s and `inspect.js`'s sense. It reads the input
// buffer the brain was already handed and the creature's own fields, writes
// nothing, adds no field to anything, and draws no random number. A pond
// somebody has an animal selected in is bit for bit a pond nobody is looking
// at. `test/eyeview.test.js` runs the pair and asserts it.

import { SENSE } from "./doing.js";
import { POINTER, say } from "./hand.js";
import { SAMPLE_HUES } from "./key.js";
import { foodMote, lineageFill, predatorOutline, rgbaCss, selectionMark, visionReach } from "./palette.js";

/**
 * The three things an animal here can be told about, in the order they are
 * read out.
 *
 * Order is *food, then a meal, then a danger*, which is the order of how often
 * a mark is on the disc at all rather than a ranking of how much it matters —
 * food is in sight almost always, a threat almost never. `doing.js` ranks the
 * other way round on purpose (getting eaten outranks lunch) because it is
 * picking **one** line to say; this is listing all of them, and a list that
 * opens with the rare case reads as though the rare case were the subject.
 *
 * `needs` is the config flag the mark depends on, or `null` for one the pond
 * always has. See the header for why the two predation marks carry one and the
 * animal's own senses do not.
 *
 * The nouns are deliberately not `prey` and `predator`. Both are words a reader
 * has to have been taught, and the relation is the entire content: *an animal
 * it could eat* and *an animal that could eat it* are the same eight-word shape
 * pointing opposite ways, and a five-year-old has them on first reading.
 */
export const MARKS = Object.freeze([
  Object.freeze({
    kind: "food",
    needs: null,
    noun: "a speck of food",
    sin: SENSE.foodSin,
    cos: SENSE.foodCos,
    prox: SENSE.foodProx,
  }),
  Object.freeze({
    kind: "prey",
    needs: "predation",
    noun: "an animal it could eat",
    sin: SENSE.preySin,
    cos: SENSE.preyCos,
    prox: SENSE.preyProx,
  }),
  Object.freeze({
    kind: "threat",
    needs: "predation",
    noun: "an animal that could eat it",
    sin: SENSE.threatSin,
    cos: SENSE.threatCos,
    prox: SENSE.threatProx,
  }),
]);

/**
 * How long a worded line stays up before it may be rewritten, in milliseconds
 * of wall clock.
 *
 * Two thirds of `doing.js`'s `MIN_SHOW_MS`, and it does almost nothing at 1×.
 * What this line names turns over 0.36 times a second there (see the header),
 * so for a reader watching a pond at its own pace the hold rarely fires at all
 * — the sentence is already steady, because of what it is about rather than
 * because anything is steadying it. It earns its keep at 20×, where the same
 * quantity turns over about seven times a second and this holds it near one.
 * Held in wall clock rather than in ticks for the reason `doing.js` is: a hold
 * counted in ticks is twenty times shorter at 20× speed, which is exactly when
 * a reader needs it most.
 */
export const WORD_HOLD_MS = 900;

/**
 * The eight-point compass an animal's bearing is read out on, from dead ahead
 * round to dead behind.
 *
 * Eight and not sixteen, and not four. Four cannot separate *ahead* from *ahead
 * and a bit to the left*, which is the difference between an animal that is
 * about to reach its lunch and one that is about to miss it — the single most
 * legible thing on this disc. Sixteen needs words nobody says out loud
 * ("ahead-left-of-left"), and the picture already carries the precision: the
 * dot is drawn at the true bearing, not at the sector's centre. The words are
 * the coarse channel here on purpose.
 *
 * **No sector word may carry a comma or the word "and", and that is a measured
 * constraint rather than a style.** These phrases are joined into a list in the
 * `aria-label`, and the sweep in the header says an animal has two things in
 * sight 27.6% of the time and three 1.7% — so 29.3% of the descriptions this
 * panel ever writes are lists. My first draft said *ahead and
 * to its left* and *behind it, to the right*, and the three-item line came out
 * as "a speck of food off to its left, an animal it could eat behind it, to the
 * right and an animal that could eat it off to its right", where a listener
 * cannot tell a list comma from a bearing's. The fix is in the words, not in
 * the joiner: every phrase is one unbroken preposition.
 * `test/eyeview.test.js` holds it.
 *
 * `half` is the half-width of each sector in turns, so the whole table is
 * checkable against 1: see `test/eyeview.test.js`.
 */
const SECTORS = Object.freeze([
  Object.freeze({ half: 1 / 16, ahead: "straight ahead", left: null, right: null }),
  Object.freeze({ half: 1 / 8, ahead: null, left: "ahead on its left", right: "ahead on its right" }),
  Object.freeze({ half: 1 / 8, ahead: null, left: "off to its left", right: "off to its right" }),
  Object.freeze({ half: 1 / 8, ahead: null, left: "behind it on its left", right: "behind it on its right" }),
  Object.freeze({ half: 1 / 16, ahead: "right behind it", left: null, right: null }),
]);

/**
 * How near, in words, for the four bands the `aria-label` reads out.
 *
 * `prox` is 1 at the nose and 0 at the edge of sight, so these are quarters of
 * what the animal can see and the phrases say so in the reader's units rather
 * than in the buffer's. The bottom band is worded as an edge rather than as a
 * distance because that is the fact worth having: a speck at 0.05 is one the
 * animal is about to lose.
 */
const RANGES = Object.freeze([
  Object.freeze({ from: 0.75, word: "almost on top of it" }),
  Object.freeze({ from: 0.5, word: "close by" }),
  Object.freeze({ from: 0.25, word: "a little way off" }),
  Object.freeze({ from: 0, word: "at the far edge of what it can see" }),
]);

/** Where the disc's marks sit, as fractions of its drawable radius. */
const DISC = Object.freeze({
  // Nothing may be drawn under the animal itself. A pellet at the nose has
  // `prox` 1 and would otherwise land exactly on the chevron, which is the one
  // moment the picture most needs to be readable.
  near: 0.2,
  // Nor on the rim, which is the boundary of what it can see rather than a
  // place a thing can be.
  far: 0.9,
  /** The animal at the centre, as a fraction of the drawable radius. */
  body: 0.16,
  /** A blip, likewise. */
  blip: 0.085,
});

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * What one animal can see right now, nearest first.
 *
 * Returns `[]` for an animal that can see nothing, which is a real and common
 * answer rather than an error — see the header. `null` in, `[]` out, so every
 * caller has one shape to handle.
 *
 * @param {object|null} creature - a live creature, or null
 * @param {object} config - the world's config, for the predation gate
 * @returns {{kind: string, noun: string, sin: number, cos: number, prox: number}[]}
 */
export function eyeSight(creature, config = {}) {
  const inp = creature && creature._in;
  if (!inp) return [];
  const seen = [];
  for (const m of MARKS) {
    if (m.needs && !config[m.needs]) continue;
    const prox = inp[m.prox];
    // Exactly 0 is what `Creature#sense` writes for "there is nothing there" and
    // also what it writes for something sitting on the edge of sight, which the
    // animal is equally unable to act on. One test, both cases.
    if (!(prox > 0)) continue;
    seen.push({ kind: m.kind, noun: m.noun, sin: inp[m.sin], cos: inp[m.cos], prox: clamp01(prox) });
  }
  // Nearest first: the one it is most likely steering by leads the sentence.
  return seen.sort((a, b) => b.prox - a.prox);
}

/**
 * Which way something lies, in words, from its `(sin, cos)` bearing.
 *
 * `sin` is positive to the animal's right. That falls out of the world being
 * drawn with y increasing downward: facing along +x, a target at +y is on your
 * right, and `sense()` measures the angle in exactly that frame. The disc below
 * draws it the same way round, so the word and the dot cannot disagree.
 */
export function bearingWord(sin, cos) {
  // Turns away from dead ahead, in [0, 0.5]: 0 is the nose, 0.5 is the tail.
  const turns = Math.abs(Math.atan2(sin, cos)) / (Math.PI * 2);
  let edge = 0;
  for (const s of SECTORS) {
    edge += s.half;
    if (turns <= edge || s === SECTORS[SECTORS.length - 1]) {
      return s.ahead ?? (sin < 0 ? s.left : s.right);
    }
  }
  // Unreachable: the sectors sum to a half turn and `turns` cannot exceed it.
  return SECTORS[0].ahead;
}

/** How far away, in words, from a proximity. */
export function rangeWord(prox) {
  for (const r of RANGES) if (prox >= r.from) return r.word;
  return RANGES[RANGES.length - 1].word;
}

/** English's list comma, which every worded surface here uses. */
function list(parts) {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * The line beside the disc: **what** this animal can see, and nothing about
 * where or how far.
 *
 * Both are deliberately absent — see the header. They are the quantities that
 * move, this line is held, and a held sentence beside a live picture of the
 * same thing may not describe anything the picture is showing (v1.157's rule
 * about a live number, one band up the page, generalised by a walk that caught
 * this panel breaking it).
 *
 * The second clause is the reason the panel exists. *Nothing else in the pond
 * reaches it* is true of every animal in every world here — there are three
 * channels and no fourth — so it can be stated flatly rather than counted, and
 * it is the sentence a visitor is most likely to repeat to somebody else.
 *
 * @param {object[]} seen - from `eyeSight`
 * @param {string} name - the animal's given name
 */
export function eyeLine(seen, name) {
  if (!seen.length) {
    return `${name} can see nothing at all — no food, nobody else, water in every direction.`;
  }
  return `${name} can see ${list(seen.map((s) => s.noun))}. Nothing else in the pond reaches it.`;
}

/**
 * The same picture for somebody who cannot see it: everything the disc holds,
 * distances included.
 *
 * This is the fuller of the two on purpose, and it is the only place bearings
 * are ever put into words. A sighted reader has the disc, which carries every
 * bearing live and cannot fall out of step with itself; a listener has only
 * this, and nothing to catch it out against.
 */
export function eyeSay(seen, name) {
  if (!seen.length) {
    return `What ${name} can see: nothing at all. No food and no other animal is within its sight.`;
  }
  const parts = seen.map((s) => `${s.noun} ${bearingWord(s.sin, s.cos)}, ${rangeWord(s.prox)}`);
  return `What ${name} can see, nearest first: ${list(parts)}. Nothing else reaches it.`;
}

/**
 * What the panel says when nobody has been picked, in the register of the hand
 * reading it.
 *
 * The line is *replaced* on the way out rather than merely greyed, and that is
 * the bug this function exists to close: a browser walk found the panel holding
 * `Nim can see a speck of food ahead on its left` under a hidden disc, several
 * seconds after Nim had died. A held sentence outlives its subject unless
 * something puts it out — which is `nametag.js`'s and `whoswho.js`'s finding
 * about a lamp nobody turns off, in the one register where it reads as a fact
 * about a living animal.
 */
export function eyeInvite(hand = POINTER) {
  return say("eyeInvite", hand);
}

/**
 * The chevron `render.js` draws on the water, at the centre of the disc and
 * pointing up.
 *
 * Not a dot. The animal's *heading* is the frame this whole picture is drawn
 * in, and a shape with a nose says which way that is without a caption. Filled
 * with the selection ring's white because in the water the animal you picked is
 * the one wearing a white ring, so the reader has already been told what white
 * means here.
 */
function drawAnimal(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 1.5);
  ctx.lineTo(cx + r, cy + r);
  ctx.lineTo(cx, cy + r * 0.35);
  ctx.lineTo(cx - r, cy + r);
  ctx.closePath();
  ctx.fillStyle = selectionMark().ring;
  ctx.fill();
}

/** One blip, in the colours the pond draws that thing in. */
function drawBlip(ctx, kind, x, y, r) {
  if (kind === "food") {
    const m = foodMote();
    ctx.fillStyle = rgbaCss({ r: m.r, g: m.g, b: m.b }, m.a);
    // Twice, exactly as `key.js`'s swatch does it: the pond composites food
    // additively over a near-black deep, and a placard has no deep to add to.
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  // A stand-in body for a meal; the hunter's own warm line for a danger. Both
  // are the marks the water uses, which is why neither needs a legend.
  ctx.fillStyle = kind === "threat" ? predatorOutline().edge : lineageFill(SAMPLE_HUES[1], "dot");
  ctx.fill();
  if (kind === "threat") {
    ctx.strokeStyle = predatorOutline().rim;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/**
 * Draw the disc.
 *
 * The reach is `visionReach()`'s dashed blue ring — the same mark `V` puts in
 * the water — with a wash of it inside, so the circle reads as *the water this
 * animal has* rather than as a border round a figure.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} W
 * @param {number} H
 * @param {object[]} seen - from `eyeSight`; `[]` draws an animal alone, which is
 *   the picture that makes the point
 */
export function drawEye(ctx, W, H, seen) {
  ctx.clearRect(0, 0, W, H);
  const cx = W / 2;
  const cy = H / 2;
  const reach = visionReach();
  // Half a pixel in from the edge so the dashed ring is not clipped by the box.
  const R = Math.min(W, H) / 2 - reach.width - 0.5;
  if (R <= 0) return;

  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = reach.ring;
  ctx.fill();
  ctx.globalAlpha = 0.55;
  ctx.setLineDash(reach.dash);
  ctx.strokeStyle = reach.ring;
  ctx.lineWidth = reach.width;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // Furthest first, so a near blip is never hidden under a far one.
  for (const s of [...seen].reverse()) {
    // `prox` is 1 at the nose, so distance from the centre is its complement,
    // held off the animal and off the rim (see `DISC`).
    const t = DISC.near + (1 - clamp01(s.prox)) * (DISC.far - DISC.near);
    // `sin` and `cos` are already the unit vector of the bearing, so they *are*
    // the offset — no trigonometry here, only the sign flip that turns a world
    // whose y grows downward into a picture whose ahead is up.
    drawBlip(ctx, s.kind, cx + s.sin * R * t, cy - s.cos * R * t, R * DISC.blip);
  }

  drawAnimal(ctx, cx, cy, R * DISC.body);
}
