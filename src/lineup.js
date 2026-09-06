// lineup.js — the cast board's three stand-outs, drawn instead of described.
//
// v1.157 counted what is on each side of the Simple switch and found the thing
// nobody had decided: **seven panels of prose stay and all five figures go**,
// so the visitor least likely to sit and read a page is handed nothing else,
// and the visitor who can read a Muller plot gets every picture on the site. It
// shipped one answer — the pond's whole run, as a line beside the headline —
// and left the obvious next question open: *would any of the other six prose
// panels be better as a picture?*
//
// This is the one that most plainly would. `🏅 Worth watching` exists to be
// **pointed at**: its subheading says *pick one to follow*, every row is a
// button that sends the camera after an animal, and until this release each of
// those animals was represented by a 14 px rounded square. The board named the
// biggest hunter in the water and drew it exactly the size of the last
// survivor of a dying family. A reader was asked to take a name off a list and
// find its owner among three hundred moving darts, holding nothing but a
// colour.
//
// So each row now carries **the animal**, drawn the way the pond draws it: the
// same arrowhead, the same inherited colour, the hunter's long nose — and every
// row on the board at **one shared scale**, so the biggest stand-out is the
// biggest picture. A row is still a sentence; it is no longer only a sentence.
//
// **The sweep that says the figure has something to show.** Twelve seeds, six
// thousand ticks, sampled every hundred — 720 pond-instants, and the board is
// non-empty on all of them:
//
//   * **The board runs 1–4 rows, mean 2.51**, three being commonest (310 of
//     720). On **22.2%** of instants there is only one row and the shared scale
//     has nothing to compare — the picture is then a portrait rather than a
//     lineup, which is the honest thing for a board with one animal on it.
//   * **The bodies differ, and visibly.** Across the rows of a board with two
//     or more, the largest is a median **1.171×** the smallest (p10 1.048, p90
//     1.926, largest seen 2.211). A difference of 5% or more on **89.1%** of
//     those instants and 15% or more on **53.2%**. On the remaining 10.9% the
//     picture draws animals the same size, because they are.
//   * **Three boards in four hold both silhouettes.** A hunter and a grazer
//     appear together on **76.3%** of multi-row instants, which makes the nose
//     — a 40% longer body at the same radius — the loudest thing this figure
//     can say and the thing it says most often.
//   * **Colour was already doing its share**: a median of three distinct hue
//     bands per board. The swatch this replaces was not wrong, it was
//     *one channel of four*.
//
// **Why this costs nothing per frame, which is the whole reason it is
// affordable.** `castSignature` keys the board on `rank:id` and `main.js`
// rebuilds the markup only when that string changes. Everything this figure
// draws — radius, diet, hue — is written once in `creature.js`'s constructor
// from a gene and never assigned again anywhere in this project, so a key that
// is complete for the sentence is complete for the picture too. That is a
// property, not a coincidence, and `test/lineup.test.js` reads the source back
// and fails if any of the three ever becomes a variable.
//
// **The two channels this deliberately does not draw**, both of them live:
//
//   1. **Brightness.** In the water a body's lightness rises with what it has
//      eaten, so a faint animal is a hungry one. The board is redrawn when the
//      *cast* changes, which can be hundreds of ticks apart, and a portrait
//      showing an appetite from four hundred steps ago is a lie told in the
//      pond's own vocabulary. Every body here is drawn at one lightness and
//      none of them makes a claim about it.
//   2. **Heading.** Every arrowhead in the water points where it is swimming.
//      These all point right. A portrait holds still — the water is where you
//      watch it move — and a row of animals facing different ways would read as
//      four positions rather than four sizes.
//
// The nose carries the hunter alone, without the warm outline `render.js` puts
// around a predator's body. That outline exists to hold contrast against a
// bright chevron drawn additively over black water; the board's ground is a
// flat panel, the shape has the whole difference in it already, and
// `portrait.js` — this figure's sibling, drawing the same arrowhead for the
// same reason — settled on the same answer one release earlier than I asked
// the question.
//
// SVG rather than a canvas, for `key.js`'s and `portrait.js`'s reason: the
// shape is `key.js#chevron`, so the body on this board is the body in the
// placard is the body in the water, and one path serves all three.
//
// PURE OBSERVER. No DOM, no simulation state, no random numbers — four numbers
// per row, some arithmetic, and a string.

import { chevron, NOSE } from "./key.js";
import { lineageFill } from "./palette.js";

/**
 * The drawing box of one row, in its own units — the stylesheet decides how
 * many page pixels that is, and nothing here is a page pixel.
 *
 * Wider than it is tall because a hunter is: 2.1 radii of nose ahead of the
 * origin against 1 radius of tail behind it, so the longest body this board can
 * draw is 3.1 radii end to end against 1.7 radii top to bottom.
 */
export const LINEUP_BOX = Object.freeze({ w: 34, h: 26 });

/** Clear space kept inside the box, so no body touches an edge. */
export const LINEUP_PAD = 2;

/**
 * How far a body's glow reaches, in radii.
 *
 * `render.js` draws three and `portrait.js` affords them, because its box is
 * four lines of text tall. This one is barely two, and the placard hit the same
 * wall first: at three radii the halo fills the box and the row reads as a lit
 * rectangle rather than as a lit animal. `key.js#GLOW_REACH` is 2.2 for exactly
 * that reason and this is the same number, knowingly short of the water's.
 */
export const LINEUP_GLOW = 2.2;

/** The alpha a body's glow starts at, at its own centre — the renderer's own. */
const GLOW_ALPHA = 0.5;

/**
 * The line under the board.
 *
 * Three jobs, `portrait.js`'s three: say the scale is shared (without which the
 * sizes are decoration), say what the long nose means (the loudest thing the
 * picture can do), and say what the colour is (because on every other surface
 * of this page it means the same thing, and a reader who learns it here can use
 * it in the water).
 *
 * It says nothing about what is *missing* from the drawing — no sentence about
 * brightness or heading. A caption arguing its own design decisions to a
 * visitor who has not asked is what `PORTRAIT_NOTE` cut in its second draft.
 */
export const LINEUP_NOTE =
  "Drawn at one scale, so the sizes here are the sizes in the water. " +
  "A long nose is a hunter; the colour is the family.";

/** The nose a body of this diet is drawn with — `render.js`'s rule, via `key.js`. */
const noseOf = (hunter) => (hunter ? NOSE.hunter : NOSE.prey);

/**
 * Where every body on the board goes, and the one scale they share.
 *
 * The scale is the honesty of the figure, so it is computed rather than chosen:
 * four limits per row — the length of the box, its height, and the reach of the
 * glow on each axis — and the smallest number any of them asks for is the scale
 * every row is drawn at. The largest stand-out therefore fills its box and the
 * others are however much smaller they really are.
 *
 * A chevron is not symmetric about its own origin — it runs from `-r` at the
 * tail to `r · nose` at the point — so each body is placed by its *shape's*
 * midpoint rather than by that origin, which is what stops a hunter from
 * sitting visibly off-centre in a box the same width as a grazer's.
 *
 * @param {Array<{id:number, radius:number, hunter:boolean}>} rows the board
 * @returns {{scale:number, bodies:Array<{id:number, r:number, nose:number, cx:number, cy:number}>}}
 */
export function lineupLayout(rows) {
  const halfW = LINEUP_BOX.w / 2;
  const cy = LINEUP_BOX.h / 2;
  let scale = Infinity;
  for (const row of rows) {
    const r = row.radius;
    if (!(r > 0)) continue;
    const nose = noseOf(row.hunter);
    // The shape, end to end, centred in the box.
    scale = Math.min(scale, (halfW - LINEUP_PAD) / (r * ((nose + 1) / 2)));
    // The box, top to bottom.
    scale = Math.min(scale, (cy - LINEUP_PAD) / (r * 0.85));
    // The glow, which is centred on the origin rather than on the shape and so
    // reaches furthest behind a long-nosed body. Fitted with no padding: it
    // fades to nothing at its own rim, so a halo ending exactly on an edge ends
    // invisibly, where one ending past it is cut off mid-gradient — a soft
    // light with a straight side, the one thing here that would read as a
    // mistake rather than as an animal. This is the limit that binds.
    scale = Math.min(scale, halfW / (r * (LINEUP_GLOW + (nose - 1) / 2)));
    scale = Math.min(scale, cy / (r * LINEUP_GLOW));
  }
  if (!Number.isFinite(scale)) scale = 1;
  const bodies = rows.map((row) => {
    const nose = noseOf(row.hunter);
    const r = Math.max(0, row.radius) * scale;
    return { id: row.id, r, nose, cx: halfW - (r * (nose - 1)) / 2, cy };
  });
  return { scale, bodies };
}

/**
 * One body: the glow, then the arrowhead over it, in its family's colour.
 *
 * `key.js#body` and `portrait.js#bodySvg` are these same eight lines with
 * different defaults, and both are private to their module for the reason the
 * second one wrote down: exporting a drawing helper whose defaults belong to
 * one surface, so a second caller overrides all of them, is not one function
 * serving two surfaces — it is one surface's function with a lodger. The shape
 * is what is shared, and it is (`chevron`).
 *
 * `gid` is the gradient's id and has to be unique in the document, since every
 * row is inlined into one page.
 */
function bodySvg({ r, nose, cx, cy }, hue, gid) {
  const fill = lineageFill(hue, "dot");
  return (
    `<radialGradient id="${gid}">` +
    `<stop offset="0" stop-color="${fill}" stop-opacity="${GLOW_ALPHA}" />` +
    `<stop offset="1" stop-color="${fill}" stop-opacity="0" />` +
    `</radialGradient>` +
    `<circle cx="${cx.toFixed(2)}" cy="${cy}" r="${(r * LINEUP_GLOW).toFixed(2)}" ` +
    `fill="url(#${gid})" />` +
    `<path d="${chevron(r, nose, cx, cy)}" fill="${fill}" />`
  );
}

/**
 * The board's portraits, one SVG per row, in the order the rows come in.
 *
 * `aria-hidden`, and deliberately: it replaces a swatch that was already
 * silent, the row's own `aria-label` already says who this animal is and why
 * the pond is pointing at it, and `LINEUP_NOTE` — which a screen reader does
 * read — says what the drawing adds. A picture that repeated its row's sentence
 * would make every row on this board say itself twice.
 *
 * @param {Array<{id:number, radius:number, hunter:boolean, hue:number}>} rows
 * @returns {string[]} one `<svg>` per row
 */
export function lineupSvg(rows) {
  const { bodies } = lineupLayout(rows);
  return rows.map((row, i) => {
    const shapes = bodySvg(bodies[i], row.hue, `lu${row.id}`);
    return (
      `<svg class="lineup" viewBox="0 0 ${LINEUP_BOX.w} ${LINEUP_BOX.h}" ` +
      `width="${LINEUP_BOX.w}" height="${LINEUP_BOX.h}" ` +
      `aria-hidden="true" focusable="false">${shapes}</svg>`
    );
  });
}
