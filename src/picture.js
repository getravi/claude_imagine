// picture.js — the pond as a thing you can post, rather than a thing you can paste.
//
// v1.140 gave `🔗 Share` a postcard: the pond's story in five sentences with
// the link at the bottom, on the clipboard and on the screen. The entry I wrote
// that night ended with the thing it could not do, and it is the first line of
// this file's reason for existing:
//
//   > **The card cannot be sent as a picture.** It is text, and text is what a
//   > chat window renders — but the thing people actually share is a screenshot
//   > of a pond, and this page has never been able to hand anybody one.
//
// Everything this project has built for a visitor in twenty cycles has been
// *words*: a headline, a chronicle, a cast list, a book of records, a book of
// the dead, a postcard. They are good words and I stand behind them, and not
// one of them is what somebody drops into a group chat. The only export this
// page has ever offered is a **CSV**, which is a file for a person who already
// cares. A picture is the file for the person who does not yet.
//
// So: one press, one PNG. The pond exactly as it is on screen — same camera,
// same zoom, same name plates over the animals — with the pond's name above it
// and its own sentence and address below.
//
//     ┌──────────────────────────────────────────────┐
//     │  Western Mere                                │
//     │  seed 314 · 4,459 steps in · 194 alive       │
//     ├──────────────────────────────────────────────┤
//     │                                              │
//     │            the water, as you left it         │
//     │                                              │
//     ├──────────────────────────────────────────────┤
//     │  One family is running away with the pond.   │
//     │  Vivarium · getravi.github.io/…/app/#seed=314│
//     └──────────────────────────────────────────────┘
//
// Four rules, and every one of them is the postcard's rule arriving on a
// different medium.
//
//  1. **The picture is the pond, not a re-drawing of it.** This module composes
//     furniture around an image somebody else painted, and takes the *live*
//     canvas rather than re-rendering a tidy one. If the visitor is zoomed in on
//     one animal, the picture is of that animal — a share that silently reframed
//     to a stock wide shot would be handing them a photograph of somewhere they
//     have not been.
//  2. **The name plates come too.** The pond is drawn on two canvases (see
//     `Renderer#attachNameLayer`) and the top one holds the names. Compositing
//     only the water would drop the one mark on this page that makes a dot into
//     somebody, which is the whole reason a stranger looks twice.
//  3. **Three lines of text, and one of them is the address.** The postcard gets
//     five sentences because a chat window will render them; a picture is looked
//     at rather than read, and a caption that has to be read is a caption that
//     has lost. Name, numbers, one sentence, where to go.
//  4. **Nothing here is a control**, for `postcard.js`'s reason and more so: a
//     PNG in somebody's camera roll has no JavaScript in it, no hover, and no
//     way to ask a question. Every name is baked into a sentence.
//
// The last line is the project's name and then the address, and the address is
// written without its scheme. `https://` is eight characters of nothing to a
// reader and this is the only line competing with the pond for attention; a
// person who wants to go there types what they see, and every browser and every
// chat client resolves it. The name in front of it is there because the address
// does not contain one — *the pond has a name and the project does not*, on the
// one surface that ever leaves this page.
//
// Determinism: PURE OBSERVER. It reads the world and the config, writes to
// neither, draws no random number and creates no canvas — it is handed a
// context and paints on it. There is a test.

import { pondName } from "./pondname.js";
import { stepsIn } from "./pondclock.js";
import { pondHeadline } from "./headline.js";
import { ENDED_LINE } from "./postcard.js";
import { pictureCard } from "./palette.js";

/** The mark the picture wears wherever it is offered. */
export const PICTURE_MARK = "📸";

/**
 * The type scale, in the pond's own CSS pixels — multiplied by the picture's
 * scale when it is painted, the way `nameTagFont` divides the same factor back
 * out for a name on the water.
 *
 * `title` is deliberately far above everything else. A picture is looked at
 * from across a scrolling feed, and at that distance a caption is one word
 * loud enough to read and a paragraph nobody read: the pond's *name* is that
 * word, and the numbers under it are for whoever has already stopped.
 */
export const PICTURE_TYPE = Object.freeze({
  title: 26,
  meta: 13,
  story: 15,
  link: 12,
});

/** The frame's spacing, in the same units: margins, gaps, and the hairline. */
export const PICTURE_FRAME = Object.freeze({
  pad: 20,
  /** Between the name and the numbers under it. */
  titleGap: 9,
  /** Between the story and the address under it. */
  linkGap: 10,
  /** Leading for a wrapped story line. */
  lineHeight: 1.35,
  /** The rule that separates the bands from the water. */
  rule: 1,
});

/**
 * How many lines the story may take before it is cut.
 *
 * Three, and the cut is a real one rather than a promise the sweep keeps for
 * me: `headline.js` writes for a card that can be as tall as it likes, and a
 * caption that grew to five lines would be a paragraph under a photograph.
 */
export const PICTURE_STORY_LINES = 3;

/**
 * The caption, as text, for a world.
 *
 * Three fields and no layout. Keeping the words apart from the painting is what
 * lets the suite ask whether the sentences are right without a canvas, which is
 * the division `postcard.js` used and `targetsize.js` before it.
 *
 * @param {{tick:number, creatures:Array, stats:object, phylogeny:object}} world
 * @param {object} config the world's own config, for the seed and the headline
 * @param {Map<number, {plural:string}>|null} names lineage names, if the caller
 *   has a tree — the headline writes a family into a sentence and falls back
 *   gracefully without one
 * @returns {{title:string, meta:string, story:string}}
 */
export function pictureCaption(world, config, names = null) {
  const { name, seed } = pondName(config.seed);
  const alive = world.creatures.filter((c) => !c.dead).length;
  const gen = (world.stats && world.stats.maxGeneration) || 0;
  const parts = [`seed ${seed}`, stepsIn(world.tick)];
  // "nothing alive" rather than "0 alive". A zero in a row of counts reads as a
  // reading that failed to arrive; the pond being empty is the most important
  // thing on the picture when it is true, and it is a fact, not a gap.
  parts.push(alive === 0 ? "nothing alive" : `${alive.toLocaleString("en-US")} alive`);
  if (gen > 0) parts.push(`${gen.toLocaleString("en-US")} ${gen === 1 ? "generation" : "generations"}`);
  return {
    title: name,
    meta: parts.join(" · "),
    story: alive === 0 ? ENDED_LINE : pondHeadline(world, config, names).text,
  };
}

/**
 * The address, as it is written on the picture: no scheme, no trailing slash.
 *
 * A URL that fails to parse is left exactly as it came rather than dropped. The
 * caller hands this `location.href`, and a page opened from a file, an
 * unfamiliar host or a future scheme should still get its address on the
 * picture — a caption that silently omitted the one line telling a stranger
 * where to go would be the worst possible failure mode for this feature.
 *
 * @param {string} url
 */
export function pictureAddress(url) {
  if (!url) return "";
  return String(url).replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/\/+$/, "");
}

/** What the picture signs itself with. */
export const PICTURE_CREDIT = "Vivarium";

/**
 * The last line: what this is, then where it is.
 *
 * The name goes in front of the address because the address does not contain
 * it. A stranger looking at this picture in a feed gets *Western Mere* in large
 * letters and a `github.io` path underneath, and without these eight characters
 * there is nothing on it that says what the place they are being shown *is* —
 * the pond has a name and the project does not, which is exactly backwards for
 * the one surface that travels.
 *
 * It survives an empty address, because a pond opened from a file still came
 * from somewhere.
 */
export function pictureCredit(address) {
  return address ? `${PICTURE_CREDIT} · ${address}` : PICTURE_CREDIT;
}

/**
 * A filename a person can find again.
 *
 * `vivarium-western-mere-4459-steps.png`. The pond's *name* leads because that
 * is what the visitor will remember about it, and the step count is what tells
 * two pictures of the same pond apart in a downloads folder. Everything outside
 * `a–z 0–9` becomes a hyphen: a lineage name is a string this simulation
 * composed and a filename is a thing an operating system parses, and this
 * project's rule about strings crossing that kind of border is the postcard's.
 *
 * @param {object} config
 * @param {{tick:number}} world
 */
export function pictureFilename(config, world) {
  const slug = pondName(config.seed)
    .name.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `vivarium-${slug || "pond"}-${world.tick}-steps.png`;
}

/**
 * Break one sentence into lines that fit, measured on the context that will
 * paint them.
 *
 * Measured rather than counted, because the caption is a sentence the pond
 * composed and its width is a property of the typeface: *One family is running
 * away with the pond* and *96% of the recent dead starved* are the same number
 * of characters and not the same number of pixels. A word too long to fit on a
 * line of its own is left over the edge rather than broken — there is no such
 * word in this project's vocabulary, and a hyphenator that guessed at one would
 * be a second way to be wrong.
 *
 * **A cut says so.** The first version of this returned the lines it had and
 * dropped the rest, and a test caught it doing exactly what that produces: a
 * caption ending *…nothing else is close to*, which is not a shortened sentence
 * but a broken one. The ellipsis can push its own line a few pixels past the
 * measure, and that is the right trade — an overhang of one character is
 * invisible and a sentence that stops mid-clause is not.
 *
 * @param {object} ctx a 2D context with `font` already set
 * @param {string} text
 * @param {number} maxWidth
 * @param {number} maxLines lines after which the rest is cut
 */
export function wrapText(ctx, text, maxWidth, maxLines = PICTURE_STORY_LINES) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      if (lines.length === maxLines) {
        lines[maxLines - 1] += "…";
        return lines;
      }
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Where everything goes, given the pond's backing store and the caption.
 *
 * The picture is exactly as wide as the pond's own pixels, so the water is
 * never resampled — a share that softened the picture on its way out would be
 * the one defect nobody could unsee. Height is the pond's plus whatever the two
 * bands need, which is a function of how many lines the story wrapped onto.
 *
 * @param {object} ctx a 2D context, for measuring only — this sets `font` on it
 * @param {{width:number, height:number}} pond the live canvas
 * @param {{title:string, meta:string, story:string}} caption
 * @param {string} address the written address, or ""
 * @param {number} scale the pond's device pixel ratio: the picture is in
 *   backing-store pixels and the type scale is in CSS pixels, so this is what
 *   converts between them
 */
export function pictureLayout(ctx, pond, caption, address, scale = 1) {
  const px = (v) => v * scale;
  const f = PICTURE_FRAME;
  const width = pond.width;
  ctx.font = pictureFont(PICTURE_TYPE.story, scale);
  const story = wrapText(ctx, caption.story, width - px(f.pad) * 2);
  const head = px(f.pad) + px(PICTURE_TYPE.title) + px(f.titleGap) + px(PICTURE_TYPE.meta) + px(f.pad);
  const storyH = story.length * px(PICTURE_TYPE.story) * f.lineHeight;
  const foot = px(f.pad) + storyH + px(f.linkGap) + px(PICTURE_TYPE.link) + px(f.pad);
  return {
    scale,
    width,
    height: Math.round(head + pond.height + foot),
    headHeight: Math.round(head),
    pondY: Math.round(head),
    footY: Math.round(head + pond.height),
    story,
  };
}

/** The picture's type at a given size, as a CSS `font`. */
export function pictureFont(px, scale = 1, weight = 400) {
  return `${weight} ${(px * scale).toFixed(2)}px ${pictureCard().fontFamily}`;
}

/**
 * Paint the whole picture onto a context sized to `layout`.
 *
 * The order is the one a printer would use and the one the recorder can be
 * asserted about: ground, water, names, rules, then every word. The water goes
 * down before the hairlines so a rule sits *on* the edge of the pond rather
 * than being covered by it.
 *
 * @param {object} ctx the destination 2D context
 * @param {{pond:object, names:object|null}} layers the live canvases — `names`
 *   is optional, because a pond with no name layer attached (the landing page's
 *   hero, and every test that does not ask for one) is still a picture
 * @param {{title:string, meta:string, story:string}} caption
 * @param {string} address
 * @param {object} layout from `pictureLayout`
 */
export function paintPicture(ctx, layers, caption, address, layout) {
  const card = pictureCard();
  const s = layout.scale;
  const px = (v) => v * s;
  const f = PICTURE_FRAME;
  const left = px(f.pad);

  ctx.fillStyle = card.plate;
  ctx.fillRect(0, 0, layout.width, layout.height);

  ctx.drawImage(layers.pond, 0, layout.pondY);
  if (layers.names) ctx.drawImage(layers.names, 0, layout.pondY);

  // Two hairlines, and they are the reason the bands read as a frame rather
  // than as dead space above and below a screenshot. The plate is close enough
  // to the pond's own deep water that without them the picture has no edges.
  ctx.fillStyle = card.rule;
  ctx.fillRect(0, layout.pondY - px(f.rule), layout.width, px(f.rule));
  ctx.fillRect(0, layout.footY, layout.width, px(f.rule));

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = card.ink;
  ctx.font = pictureFont(PICTURE_TYPE.title, s, 700);
  ctx.fillText(caption.title, left, px(f.pad) + px(PICTURE_TYPE.title) * 0.8);

  ctx.fillStyle = card.dim;
  ctx.font = pictureFont(PICTURE_TYPE.meta, s);
  ctx.fillText(caption.meta, left, px(f.pad) + px(PICTURE_TYPE.title) + px(f.titleGap) + px(PICTURE_TYPE.meta) * 0.8);

  // Both baselines are absolute rather than accumulated, and they are the same
  // arithmetic `pictureLayout` measured the picture's height with. A cursor
  // walked down the band would be a second expression of one layout, which is
  // this project's standing note about two surfaces that have to agree: one of
  // them silently loses the difference.
  const storyTop = layout.footY + px(f.pad);
  const lineH = px(PICTURE_TYPE.story) * f.lineHeight;
  ctx.fillStyle = card.ink;
  ctx.font = pictureFont(PICTURE_TYPE.story, s);
  layout.story.forEach((line, i) => {
    ctx.fillText(line, left, storyTop + i * lineH + px(PICTURE_TYPE.story) * 0.8);
  });

  ctx.fillStyle = card.dim;
  ctx.font = pictureFont(PICTURE_TYPE.link, s);
  const creditY = storyTop + layout.story.length * lineH + px(f.linkGap) + px(PICTURE_TYPE.link) * 0.8;
  ctx.fillText(pictureCredit(address), left, creditY);
}
