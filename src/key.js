// key.js — the key to the water.
//
// This page has spent a hundred and twenty releases learning to *say* things.
// It has a sentence over the pond, a running chronicle under it, a card for the
// animal you picked and an obituary for them when they die. What it has never
// had is a key to the **picture** — and the picture is the first thing anybody
// sees and the last thing anybody was told about.
//
// Everything in the water means something. A body is an arrowhead pointing the
// way it swims. Its colour is inherited, so the shade is the family. Its
// lightness rises with what it has left to spend, so a fading one is starving.
// Its nose is longer if it eats its neighbours, and it wears a pale spot to say
// so. A green speck is food, a pale ring is a corpse, a sulphur glow is an
// illness, warm rings are a call. Every one of those is a *decision*, taken in
// `render.js` and measured in `palette.js` — and a visitor arriving cold saw a
// screen of drifting coloured darts with no way at all to read any of it.
//
// So: a placard under the pond, the way a museum labels a tank. One row per
// mark, a swatch drawn from the same palette the water is drawn from, and one
// plain sentence. Held to `cast.js`'s vocabulary bar — no *carnivore*, no
// *lineage*, no *px* — because a key written in the words of somebody already
// here is not a key.
//
// **It only ever explains what is actually in the water.** The illness glow,
// the corpse ring, the call rings and the hunter's nose each depend on a rule
// that can be switched off, and a key that describes a mark the pond cannot
// draw is worse than no key: it sends a reader hunting for something that is
// not there. `visibleMarks` takes the config and returns the rows that can
// appear, so the placard shrinks and grows with the switch column.
//
// Determinism: this module reads `config` and nothing else. It does not touch
// the world, it draws no random number, and every colour in it comes from
// `palette.js` — no colour is named here, which is the rule
// `test/colourliterals.test.js` enforces and the reason the swatches match the
// water rather than merely resembling it.

import {
  corpseMark,
  foodMote,
  immuneRing,
  lineageFill,
  predatorMark,
  predatorOutline,
  selectionMark,
  sickHalo,
  signalRing,
} from "./palette.js";

/**
 * The nose lengths `render.js#_drawCreature` draws, as a fraction of the body
 * radius: a hunter's is longer, and that difference *is* the mark — it is drawn
 * on every hunter in every frame, with no colour and no ring behind it.
 *
 * Duplicated from the renderer rather than imported, because the renderer holds
 * them as two inline constants inside a method and exporting them would be a
 * bigger change to the drawing code than this feature earns. The copy is not
 * left to trust: `test/key.test.js` reads `render.js` back and fails if either
 * number moves, which is the same guard `test/switches.test.js` puts on the
 * config keys the switch rows write.
 */
export const NOSE = Object.freeze({ prey: 1.4, hunter: 2.1 });

/** The hues the swatches borrow. Three shades far enough apart to read as three families. */
const SAMPLE_HUES = Object.freeze([190, 330, 95]);

/** The swatch box, in its own units. Every swatch is drawn to this and scaled by the stylesheet. */
export const SWATCH = Object.freeze({ w: 30, h: 18, cx: 13, cy: 9, r: 5 });

/**
 * The marks, in reading order.
 *
 * `needs` is the `config` flag that has to be on for the mark to appear in the
 * water at all, or `null` for a mark the pond always draws. Every one of them
 * is checked against `DEFAULT_CONFIG` in the tests, so a row cannot depend on a
 * rule that no longer exists.
 *
 * The order is a first reading of the picture and not a ranking: what a body
 * *is*, then what its colour, its brightness and its size say, then the things
 * that are not bodies, then the marks a rule adds, then the one mark the
 * visitor makes themselves.
 */
export const MARKS = Object.freeze([
  {
    id: "body",
    term: "A creature",
    line: "Every arrowhead is one animal, pointing the way it is swimming.",
    needs: null,
  },
  {
    id: "family",
    term: "Colour is family",
    line: "Shade is inherited, so relatives match. A new shade is a new branch of the family.",
    needs: null,
  },
  {
    id: "fed",
    term: "Bright is well fed",
    line: "A creature dims as it uses up what it has eaten. A faint one is going hungry.",
    needs: null,
  },
  {
    id: "grown",
    term: "Big is old",
    line: "Nothing is born large. A big body is one that has been finding food for a long time.",
    needs: null,
  },
  {
    id: "food",
    term: "Food",
    line: "The green specks. They are eaten where they fall and come back somewhere else.",
    needs: null,
  },
  {
    id: "hunter",
    term: "A hunter",
    line: "A longer nose and a pale spot: this one eats its neighbours rather than the specks.",
    needs: "predation",
  },
  {
    id: "remains",
    term: "Remains",
    line: "A pale ring is what is left of something that died. Anything passing can still eat it.",
    needs: "scavenging",
  },
  {
    id: "ill",
    term: "Ill, and over it",
    line: "A yellow glow is a sickness spreading. A cool dashed ring is somebody who had it and lived.",
    needs: "disease",
  },
  {
    id: "calling",
    term: "Calling",
    line: "Warm rings mean this one is making a noise, and the ones nearby can hear it.",
    needs: "signalling",
  },
  {
    id: "chosen",
    term: "The one you picked",
    line: "A white ring. Click any creature to be told who they are and watch what becomes of them.",
    needs: null,
  },
]);

/**
 * The marks this pond can actually draw, in order.
 *
 * @param {Record<string, unknown>} config
 */
export function visibleMarks(config) {
  return MARKS.filter((m) => m.needs === null || config[m.needs] === true);
}

/**
 * What the visible set depends on, as a string.
 *
 * The placard is rebuilt only when this changes — the same content-keyed memo
 * every other panel here uses, and the reason this costs nothing per frame.
 *
 * @param {Record<string, unknown>} config
 */
export function keySignature(config) {
  return visibleMarks(config)
    .map((m) => m.id)
    .join(",");
}

// ---- the swatches ----
//
// SVG rather than a canvas, for one reason: there are up to ten of these and
// they never change, so a canvas each would be ten contexts and a redraw path
// to keep in step with the pond. A path string is written once and the browser
// keeps it. The geometry is the renderer's own, so the arrowhead in the placard
// is the arrowhead in the water at a different size.

/**
 * The body outline `render.js` draws: a chevron with its point along the
 * heading, here pointing right.
 *
 * @param {number} r body radius
 * @param {number} nose one of `NOSE`
 * @param {number} cx
 * @param {number} cy
 */
export function chevron(r, nose, cx = SWATCH.cx, cy = SWATCH.cy) {
  const pt = (x, y) => `${(cx + x).toFixed(2)},${(cy + y).toFixed(2)}`;
  return `M${pt(r * nose, 0)}L${pt(-r, r * 0.85)}L${pt(-r * 0.5, 0)}L${pt(-r, -r * 0.85)}Z`;
}

/** A filled circle, the shape of every mark here that is not a body. */
function disc(cx, cy, r, fill, extra = "") {
  return `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(2)}" fill="${fill}"${extra} />`;
}

/** An unfilled circle: a ring around something. */
function ring(cx, cy, r, stroke, width, dash = null) {
  const d = dash ? ` stroke-dasharray="${dash.join(" ")}"` : "";
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(2)}" fill="none" ` +
    `stroke="${stroke}" stroke-width="${width}"${d} />`
  );
}

/**
 * How far a creature's glow reaches, as a multiple of its body radius.
 *
 * `render.js` draws it to three radii. This is less, and the difference is the
 * one place the swatch knowingly departs from the water: three radii of a five
 * radius body does not fit in a box a line of text is tall, and a glow that
 * fills its whole box reads as a lit rectangle rather than as a lit animal.
 */
const GLOW_REACH = 2.2;

/** The alpha the pond's glow starts at, at the body's own centre. */
const GLOW_ALPHA = 0.5;

/**
 * A body in one of the sample shades, with the prey nose unless told otherwise.
 *
 * The glow is not decoration. A creature in the water is mostly *halo* — the
 * chevron is a small hard shape inside a soft disc three times its size — so a
 * bare arrowhead in the placard would be a key to a picture this page does not
 * draw. Same structure as `render.js#_drawCreature`: a radial fade from the
 * body's own colour out to nothing, then the chevron over it.
 *
 * `gid` is the gradient's id and has to be unique on the page, since every
 * swatch is inlined into one document.
 */
function body(
  hue,
  { nose = NOSE.prey, r = SWATCH.r, cx = SWATCH.cx, cy = SWATCH.cy, opacity = 1, gid = null } = {},
) {
  const fill = lineageFill(hue, "dot");
  const o = opacity === 1 ? "" : ` opacity="${opacity}"`;
  const halo = gid
    ? `<radialGradient id="${gid}">` +
      `<stop offset="0" stop-color="${fill}" stop-opacity="${GLOW_ALPHA}" />` +
      `<stop offset="1" stop-color="${fill}" stop-opacity="0" />` +
      `</radialGradient>` +
      `<circle cx="${cx}" cy="${cy}" r="${(r * GLOW_REACH).toFixed(2)}" fill="url(#${gid})"${o} />`
    : "";
  return halo + `<path d="${chevron(r, nose, cx, cy)}" fill="${fill}"${o} />`;
}

/**
 * The marks of a single row, as SVG shapes. One function rather than a field on
 * each row, because a row is data — a table with ten drawing closures in it is
 * a table nothing can compare against anything.
 *
 * @param {string} id one of `MARKS`
 * @returns {string} SVG markup for the inside of the swatch box
 */
export function swatchShapes(id) {
  const { cx, cy, r } = SWATCH;
  const [h1, h2, h3] = SAMPLE_HUES;
  // Gradient ids, unique across the page because every swatch is inlined into
  // one document: two `<radialGradient id="glow">` elements would leave every
  // body on the placard wearing the first one's colour.
  let n = 0;
  const gid = () => `kglow-${id}-${n++}`;
  const mote = foodMote();
  // The pond composites food additively over a near-black deep; a placard has
  // no deep to add to, so the mote is drawn as the colour it comes out as.
  const moteFill = `rgba(${mote.r}, ${mote.g}, ${mote.b}, ${mote.a})`;

  switch (id) {
    case "body":
      return body(h1, { gid: gid() });
    case "family":
      // Two of one shade and one of another, as bodies rather than dots: the
      // row above has just said that a body is an animal, and the claim here is
      // about *animals* matching. Three discs would be a colour chart.
      return (
        body(h1, { cx: cx - 9, r: 3.4, gid: gid() }) +
        body(h1, { cx: cx - 1, r: 3.4, gid: gid() }) +
        body(h2, { cx: cx + 8, r: 3.4, gid: gid() })
      );
    case "fed":
      return (
        body(h3, { cx: cx - 7, r: 4.2, gid: gid() }) +
        body(h3, { cx: cx + 7, r: 4.2, opacity: 0.4, gid: gid() })
      );
    case "grown":
      return (
        body(h1, { cx: cx - 7, r: 2.6, gid: gid() }) +
        body(h1, { cx: cx + 6, r: 5.6, gid: gid() })
      );
    case "food":
      // Each speck twice. The pond draws food additively, so a mote at its own
      // opacity is what a *lone* one looks like and the glow a reader
      // recognises is where two fall together — which is what this is.
      return [
        [cx - 7, cy - 2],
        [cx + 1, cy + 3],
        [cx + 8, cy - 3],
      ]
        .map(([x, y]) => disc(x, y, 2.2, moteFill) + disc(x, y, 2.2, moteFill))
        .join("");
    case "hunter": {
      const out = predatorOutline();
      const mark = predatorMark(1);
      // The glow and the body from the same helper every other row uses, then
      // the two marks that are only ever on a hunter over the top: the warm
      // silhouette and the pale spot. Round joins because the nose is a sharp
      // vertex and a mitre on it draws a spike longer than the animal — the
      // same correction `render.js` makes for the same reason.
      return (
        body(h2, { nose: NOSE.hunter, cx: cx - 2, gid: gid() }) +
        `<path d="${chevron(r, NOSE.hunter, cx - 2)}" fill="none" ` +
        `stroke="${out.edge}" stroke-width="${out.width}" stroke-linejoin="round" />` +
        disc(cx - 2, cy, r * mark.radius, mark.disc, ` stroke="${mark.rim}" stroke-width="0.6"`)
      );
    }
    case "remains": {
      const m = corpseMark(1);
      const outer = r * m.radius * 0.9;
      return disc(cx, cy, outer, m.ring) + disc(cx, cy, outer * (1 - m.ringWidth), m.core);
    }
    case "ill": {
      const halo = sickHalo();
      const imm = immuneRing();
      return (
        body(h3, { cx: cx - 7, r: 3.4, gid: gid() }) +
        ring(cx - 7, cy, 6, halo.ring, halo.width) +
        body(h1, { cx: cx + 7, r: 3.4, gid: gid() }) +
        ring(cx + 7, cy, 6, imm.ring, imm.width, imm.dash)
      );
    }
    case "calling": {
      const call = signalRing(1);
      return (
        body(h2, { r: 3.4, gid: gid() }) +
        ring(cx, cy, 5.4, call.ring, call.width) +
        ring(cx, cy, 8, call.ring, call.width)
      );
    }
    case "chosen": {
      const sel = selectionMark();
      return body(h1, { r: 3.4, gid: gid() }) + ring(cx, cy, 7, sel.ring, sel.width);
    }
    default:
      throw new Error(`no swatch for "${id}"`);
  }
}

/**
 * One row's swatch, as a complete `<svg>`.
 *
 * `aria-hidden`, deliberately: the sentence beside it is the whole content, and
 * a screen reader that stops to announce a picture of an arrowhead before
 * reading "every arrowhead is one animal" has been told the same thing twice,
 * the second time worse.
 */
export function swatchSvg(id) {
  return (
    `<svg class="keysw" viewBox="0 0 ${SWATCH.w} ${SWATCH.h}" ` +
    `width="${SWATCH.w}" height="${SWATCH.h}" aria-hidden="true">${swatchShapes(id)}</svg>`
  );
}

/**
 * The whole placard for a pond, as markup for one container.
 *
 * @param {Record<string, unknown>} config
 */
export function keyHTML(config) {
  return visibleMarks(config)
    .map(
      (m) =>
        `<li class="keyrow">${swatchSvg(m.id)}` +
        `<span><b>${m.term}</b> ${m.line}</span></li>`,
    )
    .join("");
}
