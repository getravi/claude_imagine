// handfeed.js — the water, as something you can put food into with your finger.
//
// Twenty-three cycles of this project have gone into **explaining** the pond to
// the person in front of it: a headline, a ladder, a cast board, a record book,
// a Chronicle, a guide, a fast-forward, a postcard, a photograph, a film, a
// family tree. Every one of them is words about the water, and by now there are
// more surfaces here that talk about the animals than there are ways of
// touching them. A visitor can read eleven panels and still only ever have done
// three things to this world: paused it, scattered food across all of it, and
// pressed reset.
//
// The claim the whole project rests on is *nobody taught them to find food*. It
// is on the landing page in forty-point letters and it is the one claim here a
// person cannot check, because the only way to add food was `✦ Feed`, which
// puts sixty pellets everywhere at once — and food that is everywhere is not a
// test of anything. Put ten pellets in **one spot you chose** and the claim
// becomes an experiment a stranger can run in three seconds: *do they come?*
//
// They come. Twelve seeds, four launch points, forty-eight drops onto a spot
// chosen without looking at where the animals were:
//
//   - **the first pellet of a handful is taken after a median of 47 steps** —
//     under a second at 1× — and the whole handful is gone in a median of
//     **198**.
//   - **40 of 48 handfuls were cleared inside 900 steps.** The eight that were
//     not are the ponds where the drop landed in water nobody was crossing,
//     which is the honest other half of the answer and the reason nothing is
//     promised on screen until it has actually happened.
//   - Dropped on the crowd instead, the first pellet goes in a median of **1
//     step** and the handful is gone in **69**: a handful thrown into a shoal
//     lands on somebody.
//
// **The measurement that sizes a handful, and it is the one that makes the
// feature worth building.** Ten pellets inside a 20 px radius clear in a median
// of 198 steps. The *same ten pellets* scattered over the whole pond, the way
// `✦ Feed` scatters them, take **589** — three times the clock, from the same
// animals, on the same seeds, with the same amount of food. `✦ Feed` even wins
// the *first* bite (a median of 7 steps against 47), because sixty pellets
// everywhere is likelier to land on somebody than ten pellets in one place.
// It loses everything after it. What a handful demonstrates, and what a scatter
// can never show, is that these creatures **converge** — and that is a thing
// you watch happen rather than read off a panel.
//
// **A wider handful is a worse one, and not for the reason I expected.** At
// r=40 the first bite comes sooner (9 steps against 47 — more ground covered is
// more chance of falling on somebody) and the handful is cleared *later* (289
// against 198), and is cleared at all on 32 of 48 drops rather than 40. Spread
// buys the opening and sells the ending, which is the wrong way round for a
// gesture whose whole payoff is the moment the last one goes.
//
// Determinism: **not one random number.** A handful is a golden-angle spiral
// around the point you touched — arithmetic, no draws — and `FoodField.placeAt`
// puts a pellet exactly where it is told. So the mere act of hand-feeding
// cannot shift the world's draw stream out from under it, and a pond nobody
// hand-feeds is bit-for-bit the pond it always was. That is stronger than the
// guard the opt-in features get: those draw nothing *while off*, and this draws
// nothing while **on**.
//
// What it does change is the world, on purpose, exactly as `✦ Feed` and
// `✚ Seed life` do — this is a lever, not an observer, and a pond you have fed
// by hand is a pond you have altered.

import { torusDist2 } from "./vec.js";

/**
 * How many pellets one touch puts in the water.
 *
 * Ten, and the number is a legibility bound rather than an ecological one. A
 * pellet is drawn three pixels across, so a handful has to be countable at a
 * glance for "they got them all" to be a thing anybody notices; six is a
 * scatter and twenty is a stain. It is also small against the pond's standing
 * crop of 280 — a touch is a snack, not a harvest, and a visitor who taps
 * twenty times has added less than `✦ Feed` gives in four presses.
 */
export const HANDFUL = 10;

/**
 * How wide a handful spreads, in pond pixels.
 *
 * Twenty, measured rather than chosen: at r=20 a handful is cleared in a median
 * of 198 steps and on 40 of 48 drops, at r=40 in 289 and on 32. A creature eats
 * at 8 px and sees at 168, so a ring inside about an eighth of its sight is one
 * find rather than ten — which is what makes a handful behave like a handful
 * instead of like a small scatter.
 */
export const HANDFUL_RADIUS = 20;

/**
 * The golden angle. Successive spots turn by this much, which is the one
 * rotation that never lets a spiral fall into spokes — so ten pellets look
 * strewn rather than stamped, without a single random number being drawn.
 */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Wrap a coordinate onto the torus. */
const wrap = (v, span) => ((v % span) + span) % span;

/**
 * Where one handful lands: `n` points around (x, y), spiralled out to `radius`.
 *
 * `sqrt` on the radius spreads the spots evenly over the disc instead of
 * bunching them at the middle — the same correction `FoodField._seedNear` makes
 * for a seed falling near its parent, for the same reason, and it matters more
 * here because ten points are countable and their bunching would be visible.
 *
 * @param {number} x centre, in world coordinates
 * @param {number} y
 * @param {{width:number, height:number}} config
 * @param {number} [n] how many pellets
 * @param {number} [radius] how far the outermost may fall
 * @returns {Array<{x:number, y:number}>}
 */
export function handfulSpots(x, y, config, n = HANDFUL, radius = HANDFUL_RADIUS) {
  const spots = [];
  for (let i = 0; i < n; i++) {
    const d = radius * Math.sqrt((i + 0.5) / n);
    const a = i * GOLDEN_ANGLE;
    spots.push({
      x: wrap(x + Math.cos(a) * d, config.width),
      y: wrap(y + Math.sin(a) * d, config.height),
    });
  }
  return spots;
}

/**
 * Put a handful in the water and hand back something that can be asked how it
 * is getting on.
 *
 * The record holds the pellet objects themselves rather than their positions,
 * which is the whole trick that keeps this an observation and not a second
 * mechanism: a pellet is flagged `eaten` where it is eaten and compacted out of
 * the field at the end of that tick, so a reference is a *receipt*. Counting the
 * ones that have been taken needs nothing added to the simulation, nothing
 * stored in the world, and nothing in the state hash.
 *
 * @param {{food:{placeAt:Function}, tick:number}} world
 * @param {number} x where the finger went, in world coordinates
 * @param {number} y
 * @param {number} [n]
 * @param {number} [radius]
 * @returns {{pellets:Array, at:number, x:number, y:number, asked:number}}
 */
export function dropHandful(world, x, y, n = HANDFUL, radius = HANDFUL_RADIUS) {
  const pellets = [];
  for (const s of handfulSpots(x, y, world.config, n, radius)) {
    const f = world.food.placeAt(s.x, s.y);
    if (f) pellets.push(f);
  }
  return { pellets, at: world.tick, x, y, asked: n };
}

/**
 * How a handful is getting on: how many have been taken, and how long the ones
 * that have been taken took.
 *
 * @param {{pellets:Array, at:number, asked:number}} handful
 * @param {{tick:number}} world
 */
export function handfulProgress(handful, world) {
  const taken = handful.pellets.reduce((n, f) => n + (f.eaten ? 1 : 0), 0);
  return {
    taken,
    left: handful.pellets.length - taken,
    placed: handful.pellets.length,
    asked: handful.asked,
    steps: world.tick - handful.at,
    cleared: handful.pellets.length > 0 && taken === handful.pellets.length,
  };
}

/**
 * How many animals are close enough to see the spot, right now.
 *
 * The one number that turns "food appeared" into "somebody is coming", and it is
 * the pond's own reach rather than a distance I picked: `visionRadius` is how
 * far a creature can see a pellet, so an animal outside it has not declined the
 * offer — it has not been made one.
 *
 * @param {{creatures:Array, config:object}} world
 * @param {number} x
 * @param {number} y
 */
export function watchersNear(world, x, y) {
  const cfg = world.config;
  const r2 = cfg.visionRadius * cfg.visionRadius;
  let n = 0;
  for (const c of world.creatures) {
    if (c.dead) continue;
    if (torusDist2(c.x, c.y, x, y, cfg.width, cfg.height) <= r2) n++;
  }
  return n;
}

/** English for a small count, so no sentence here opens with a numeral. */
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const say = (n) => (n >= 0 && n < WORDS.length ? WORDS[n] : String(n));
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/**
 * What the page says the moment a handful goes in.
 *
 * Two sentences, and the second is the one that does the work: with somebody
 * inside sight of the spot, *they can see it* is a prediction the next three
 * seconds will keep, and with nobody there it would be a lie the visitor
 * catches immediately. A drop onto empty water says so instead, which is the
 * more interesting half anyway — food nobody can see is how every pellet of
 * this pond's own crop arrives.
 *
 * There is no sentence for a refused handful, because there is no refusal: the
 * pond's food ceiling governs how fast this world *grows* food and not what a
 * person may put in it (`food.js#placeAt`, and the same fix reached `✦ Feed`).
 * Written before that was measured, this function had such a sentence, and it
 * was the *first* thing a hand-feeder saw — the standing crop is at its ceiling
 * for the whole of a pond's first fifteen hundred steps.
 *
 * @param {{placed:number, asked:number}} drop what actually went in
 * @param {number} watchers how many animals can see the spot
 */
export function dropLine(drop, watchers) {
  const one = drop.placed === 1;
  const what = one ? "One pellet, right there." : `${cap(say(drop.placed))} pellets, right there.`;
  const them = one ? "it" : "them";
  if (watchers === 0) return `${what} Nobody can see ${them} from where they are.`;
  if (watchers === 1) return `${what} One animal is close enough to see ${them}.`;
  return `${what} ${cap(say(watchers))} animals are close enough to see ${them}.`;
}

/**
 * What the page says when the last of a handful goes.
 *
 * The number is in the pond's own unit — steps, the same unit the Chronicle
 * stamps its lines with — because the alternative is seconds, and seconds are a
 * fact about the speed slider rather than about the animals. Nobody is told a
 * handful was slow: a drop nobody finds simply never says anything, which is
 * the shape every board on this page holds itself to. A row is a claim, so a row
 * that is not true is not drawn.
 *
 * @param {{placed:number, steps:number}} progress
 */
export function clearedLine(progress) {
  const head = progress.placed === 1 ? "One pellet" : `${cap(say(progress.placed))} pellets`;
  if (progress.steps <= 1) return `${head}, gone the instant they landed.`;
  return `${head}, all found — ${progress.steps.toLocaleString("en-GB")} steps.`;
}

/** What the button says while it is off, and while it is armed. */
export const HAND_LABEL = Object.freeze({
  off: "🥣 Feed by hand",
  on: "🥣 Feeding by hand",
});

/** The sentence that explains the mode the first time somebody arms it. */
export const HAND_HINT =
  "Touch the water to drop food where you point. Press the button again to stop.";
