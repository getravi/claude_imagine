// portrait.js — the pond's family portrait: the animal it started with, beside
// the animal it has now.
//
// v1.128 gave this page five sentences about how far the animals have moved
// from the ones the pond was dealt, and v1.129 gave a first-time visitor a
// guided tour of them. Both are *words*. The one question the tagline invites —
// **have these things actually changed?** — is now answered in a paragraph on a
// page whose whole subject is a picture, and the picture has never been asked.
//
// This is the picture. Two animals side by side: the average animal this pond
// was handed on tick one, and the average animal swimming in it now, drawn with
// the pond's own arrowhead at **one shared scale**, so the difference on screen
// is the difference in the water.
//
// **The correction this figure needed first.** The placard that exists to teach
// a newcomer how to read the water has said since v1.122 that *big is old —
// nothing is born large, a big body is one that has been finding food for a
// long time* — and the guide shipped yesterday repeated it. It is false, and
// `creature.js:270` is the whole of the proof:
//
//     this.radius = lerp(config.bodyRadiusMin, config.bodyRadiusMax, genome.sizeGene);
//
// One assignment, at birth, from a gene. `radius` is never written again
// anywhere in this project — `test/portrait.test.js` reads the source back and
// fails if it ever is. Nothing here grows. A big animal is one whose parents
// were big, which makes body size the most *visible* thing under selection in
// the picture, and the placard was telling every visitor it was a biography.
// Both surfaces say so now, and this figure is what the corrected sentence
// makes worth drawing: if size were age, two portraits would be a picture of
// two life stages. Because size is inherited, they are a picture of selection.
//
// **What the sweep says the figure will show** — 12 seeds, 6,000 ticks, sampled
// every 50, 1,440 pond-instants:
//
//   * **The bodies grow, by a fifth.** Median 1.195× the founders, quartiles
//     1.025–1.240, and the whole range 0.767×–1.438×. On **20.6%** of instants
//     the two bodies are within 5% of each other and the picture honestly shows
//     two animals the same size, which is the state `MOVED` names in words one
//     panel down.
//   * **The shape changes on 27.3% of instants**, because the nose is a
//     threshold on the diet gene and the two portraits can land on opposite
//     sides of it. That is the loudest thing this figure can do, and it is the
//     half a reader sees first.
//   * **The founders' shape is decided by a hair, and that is why the number is
//     printed beside it.** Every pond starts at a coin-flip plate — the twelve
//     seeds open between **46% and 56%** meat — so `carnivoreThreshold` (0.55)
//     splits them 2 to 10, and the two ponds that draw a dagger for their
//     founders are over the line by **one point and a fraction**. A picture that
//     turns a 1-point margin into a completely different silhouette is a
//     picture that has to show its margin, so each portrait carries its own
//     🥩 share underneath. This is the cast board's old complaint (v1.123: every
//     value is an extremum and none carries a margin) answered before it was
//     made rather than after.
//
// **Three things this figure deliberately does not draw**, each of them a
// channel the water uses for something a portrait cannot honestly claim:
//
//   1. **Colour.** In the pond a hue is a family badge. These two are averages
//      over every family there is, so both wear the same one — and that is
//      also the truest thing a shared colour could say here, since everybody
//      alive now descends from everybody in the left-hand portrait.
//   2. **Brightness.** Bright is well fed. An average has no appetite, so both
//      are drawn at one lightness and neither makes a claim about it.
//   3. **A scale of its own.** Each portrait fitted to its own half would draw
//      two identical animals whatever the pond had done, which is the entire
//      point defeated. One scale for both, chosen so the *larger* of the two
//      fits — see `portraitLayout`.
//
// SVG rather than a canvas, for `key.js`'s reason and one more: the arrowhead
// path is `key.js`'s own `chevron()`, so the body in this figure is the body in
// the placard is the body in the water, by construction rather than by three
// modules agreeing. And an SVG has no drawing context to cache, no device pixel
// ratio to divide out (v1.126's four legible copies, v1.82's ruler) and nothing
// in `viewstate.js`'s page-scoped half.
//
// Determinism: nothing here touches the world or draws a random number. It
// reads two means and returns a string.

import { MOVED } from "./evolved.js";
import { NOSE, chevron } from "./key.js";
import { lineageFill } from "./palette.js";

/**
 * The figure's own coordinate box. Every number below is in these units and the
 * stylesheet decides how big they arrive; nothing here is a page pixel.
 *
 * Two cells of `w / 2`, wide enough that a hunter's nose — 2.1 radii forward
 * against a grazer's 1.4 — has somewhere to go without the two animals reaching
 * into each other's half.
 */
export const PORTRAIT_BOX = Object.freeze({ w: 128, h: 44 });

/** Clear space kept inside each cell, so no body touches an edge. */
export const PORTRAIT_PAD = 3;

/**
 * The hue both portraits wear.
 *
 * One value, not two, and the reasons are in the header: colour is a family
 * badge, an average belongs to no family, and everybody in the right-hand
 * portrait is descended from everybody in the left. Borrowed from the placard's
 * own first sample shade so the figure and the key open on the same colour.
 */
export const PORTRAIT_HUE = 190;

/**
 * How far the glow reaches, in body radii — the renderer's own three.
 *
 * `key.js` draws 2.2 because its swatch box is one line of text tall and three
 * radii of halo would fill it. This box is not, so the pond's number is
 * affordable, and it does two jobs at once. It is the honest one: a creature in
 * the water is mostly halo, and a portrait drawn at 1.9 is a portrait of a
 * different animal. And it is the one that sets the *size* of everything here,
 * because the glow is what the fit binds on (see `portraitLayout`) — at 1.9 the
 * first browser run drew two arrowheads filling their halves like a pair of
 * logos. Three radii of glow is a small bright animal in a large soft light,
 * which is what the pond looks like.
 */
export const PORTRAIT_GLOW = 3;

/** What sits under each portrait. Two words, and the same two every time. */
export const PORTRAIT_LABEL = Object.freeze({ then: "At the start", now: "Now" });

/**
 * The line under the figure.
 *
 * It has three jobs and no more: say that the scale is shared (without which
 * the picture is a decoration), say what the long nose means (the loudest thing
 * the figure can change), and say that the colour is not in the comparison
 * (because on every other surface of this page it means something).
 *
 * Kept to two lines after a browser run, where the first draft ran to three and
 * came out weighing as much as the picture it was a footnote to. What went was
 * the *explanation* of the colour — a caption arguing its own design decisions
 * to a visitor who has not asked. The clause that survived says only that the
 * colour is not evidence, which is the one thing a reader could otherwise get
 * wrong.
 */
export const PORTRAIT_NOTE =
  "One scale, and the pond's own marks — a long nose is a hunter, 🥩 is the " +
  "meat on its plate. Colour is not part of the comparison.";

/**
 * The two subjects, or `null` when there is no comparison to draw.
 *
 * The gate is `evolvedRows`', deliberately and exactly: no opening line, no
 * animals, or a pond that has not bred yet, and there is nothing to say. The
 * board one element down says so in a sentence; a figure has no sentence, so it
 * leaves rather than drawing two identical animals under a heading that
 * promises a change. `test/portrait.test.js` walks a run and fails if the two
 * surfaces ever disagree about whether there is something to show.
 *
 * @param {{creatures:Array, stats:object, config?:object}} world
 * @param {{n:number, radius:number, meat:number}|null} founding the pond's opening line
 * @param {object} [config] the rules in play, for the one threshold that decides a nose
 * @returns {{then:{radius:number, meat:number, hunter:boolean},
 *            now:{radius:number, meat:number, hunter:boolean}, ratio:number}|null}
 */
export function portraitPair(world, founding, config) {
  if (!founding || founding.n === 0) return null;
  if (((world.stats || {}).maxGeneration || 0) < 1) return null;
  const live = world.creatures.filter((c) => !c.dead);
  if (live.length === 0) return null;
  const threshold = (config || world.config || {}).carnivoreThreshold;
  let radius = 0;
  let meat = 0;
  for (const c of live) {
    radius += c.radius;
    meat += c.carnivory;
  }
  radius /= live.length;
  meat /= live.length;
  const subject = (r, m) => ({ radius: r, meat: m, hunter: m >= threshold });
  return {
    then: subject(founding.radius, founding.meat),
    now: subject(radius, meat),
    ratio: founding.radius > 0 ? radius / founding.radius : 1,
  };
}

/** The nose a body of this diet is drawn with — `render.js`'s rule, via `key.js`. */
const noseOf = (s) => (s.hunter ? NOSE.hunter : NOSE.prey);

/**
 * Where the two bodies go, and the one scale they share.
 *
 * The scale is the whole honesty of the figure, so it is computed rather than
 * chosen: four limits per subject — the width of its half, the height of the
 * box, and the reach of its glow on each axis — and the smallest number any of
 * the eight asks for is the scale both are drawn at. The larger animal
 * therefore fills its cell and the smaller one is however much smaller it
 * really is.
 *
 * A chevron is not symmetric about its own origin: it runs from `-r` at the
 * tail to `r · nose` at the point. So each body is placed by its *shape's*
 * midpoint rather than by that origin, which is what stops a hunter — 2.1 radii
 * of nose — from sitting visibly off-centre in its half.
 *
 * @param {{then:object, now:object}} pair
 */
export function portraitLayout(pair) {
  const halfW = PORTRAIT_BOX.w / 4;
  const cy = PORTRAIT_BOX.h / 2;
  let scale = Infinity;
  for (const s of [pair.then, pair.now]) {
    const nose = noseOf(s);
    const r = s.radius;
    if (r <= 0) continue;
    // The shape, centred: half its length either side of the cell's middle.
    scale = Math.min(scale, (halfW - PORTRAIT_PAD) / (r * ((nose + 1) / 2)));
    // The box, top to bottom.
    scale = Math.min(scale, (cy - PORTRAIT_PAD) / (r * 0.85));
    // The glow, which is centred on the origin rather than on the shape and so
    // reaches furthest on the tail side of a long-nosed body. Fitted on both
    // axes and with no padding: it fades to nothing at its own rim, so a halo
    // that ends exactly on an edge ends invisibly, and one that ends past it is
    // cut off mid-gradient — a soft light with a straight side, which is the
    // one thing in this figure that would read as a mistake rather than as an
    // animal. In practice this is the limit that binds — a glow reaches three
    // radii and the longest body only 1.55 — so it is what decides how big both
    // animals are drawn, and `PORTRAIT_GLOW` is the knob for that.
    scale = Math.min(scale, halfW / (r * (PORTRAIT_GLOW + (nose - 1) / 2)));
    scale = Math.min(scale, cy / (r * PORTRAIT_GLOW));
  }
  if (!Number.isFinite(scale)) scale = 1;
  const place = (s, cell) => {
    const nose = noseOf(s);
    const r = s.radius * scale;
    return { r, nose, cx: cell - (r * (nose - 1)) / 2, cy };
  };
  return { scale, cy, then: place(pair.then, halfW), now: place(pair.now, PORTRAIT_BOX.w - halfW) };
}

/**
 * One body: the glow, then the arrowhead over it.
 *
 * `key.js#body` does exactly this and is private to that module; the shape is
 * shared (`chevron`) and these eight lines are not, which is the smaller
 * duplication of the two. Exporting a drawing helper whose defaults are the
 * placard's swatch box, so a second caller has to override all four of them, is
 * not one function serving two surfaces — it is one surface's function with a
 * lodger.
 */
function bodySvg({ r, nose, cx, cy }, gid) {
  const fill = lineageFill(PORTRAIT_HUE, "dot");
  return (
    `<radialGradient id="${gid}">` +
    `<stop offset="0" stop-color="${fill}" stop-opacity="0.5" />` +
    `<stop offset="1" stop-color="${fill}" stop-opacity="0" />` +
    `</radialGradient>` +
    `<circle cx="${cx.toFixed(2)}" cy="${cy}" r="${(r * PORTRAIT_GLOW).toFixed(2)}" ` +
    `fill="url(#${gid})" />` +
    `<path d="${chevron(r, nose, cx, cy)}" fill="${fill}" />`
  );
}

/**
 * "20% bigger", said the way the 📏 row says it, off the same threshold.
 *
 * This is printed between the two portraits rather than left to them, and the
 * first browser run is why. A hunter is a *longer* shape at the same radius —
 * 2.1 radii of nose against 1.4 — so the default pond, whose founders are
 * hunters and whose animals now are not, drew a bigger body that is very
 * slightly **shorter**: 5.81 × 3.1 = 18.0 units of animal against 7.25 × 2.4 =
 * 17.4. Two changes, in opposite directions, on the one dimension the eye
 * measures a side-by-side pair on, and the picture came out saying *nothing has
 * happened* about a pond that had grown a quarter.
 *
 * The general form is worth keeping, because it is not a fact about arrowheads:
 * **when one mark encodes two quantities, the reader gets their product and
 * neither of them.** The figure keeps both marks, because both are the pond's,
 * and the number that the marks cancel is the one that gets written down.
 */
function sizePhrase(ratio) {
  const d = ratio - 1;
  if (Math.abs(d) < MOVED) return "much the same size";
  return `${Math.round(Math.abs(d) * 100)}% ${d > 0 ? "bigger" : "smaller"}`;
}

/** Whole percent of the plate that is meat. */
const meatPct = (s) => Math.round(s.meat * 100);

/**
 * The sentence a screen reader gets instead of the picture.
 *
 * Everything the figure draws and nothing it does not: two shapes, two plates
 * and the one comparison the shared scale exists to make. `aria-label` rather
 * than a caption, because the reader with eyes has the picture and the reader
 * without needs the picture's content — the same split `sizeplot.js` makes
 * between its caption and its label.
 *
 * @param {{then:object, now:object, ratio:number}} pair
 */
export function portraitLabel(pair) {
  const kind = (s) => (s.hunter ? "a hunter" : "a grazer");
  return (
    `The animal this pond started with, and the animal in it now, side by side ` +
    `at one scale. Then: ${kind(pair.then)}, ${meatPct(pair.then)}% of its food meat. ` +
    `Now: ${kind(pair.now)}, ${meatPct(pair.now)}% meat, and ${sizePhrase(pair.ratio)}.`
  );
}

/**
 * What has to change before the figure is redrawn.
 *
 * The radii to two decimals rather than the raw means: this is a picture 128
 * units wide, a hundredth of a pixel of body cannot move a mark on it, and a
 * signature that changes every frame is a signature that has stopped being one.
 * The two plates are in it because they decide the noses and the two numbers
 * printed under them.
 *
 * @param {{then:object, now:object}|null} pair
 */
export function portraitSignature(pair) {
  if (!pair) return "-";
  const of = (s) => `${s.radius.toFixed(2)}:${meatPct(s)}:${s.hunter ? "h" : "g"}`;
  return `${of(pair.then)}|${of(pair.now)}`;
}

/**
 * The whole figure, as markup for one container.
 *
 * Empty string for no pair, which is what hides it: a figure with a heading and
 * nothing in it is worse than no figure, and the panel it sits in already has a
 * sentence for the state where there is nothing to compare.
 *
 * @param {{then:object, now:object, ratio:number}|null} pair
 */
export function portraitHTML(pair) {
  if (!pair) return "";
  const at = portraitLayout(pair);
  const cell = (which) =>
    `<span class="pcell"><b>${PORTRAIT_LABEL[which]}</b>` +
    `<i><span aria-hidden="true">🥩</span> ${meatPct(pair[which])}%</i></span>`;
  return (
    `<svg class="portrait-svg" viewBox="0 0 ${PORTRAIT_BOX.w} ${PORTRAIT_BOX.h}" ` +
    `role="img" aria-label="${portraitLabel(pair)}">` +
    bodySvg(at.then, "pglow-then") +
    bodySvg(at.now, "pglow-now") +
    `</svg>` +
    `<div class="portrait-legend" aria-hidden="true">` +
    cell("then") +
    `<span class="parrow">${sizePhrase(pair.ratio)}</span>` +
    cell("now") +
    `</div>` +
    `<p class="portrait-note">${PORTRAIT_NOTE}</p>`
  );
}
