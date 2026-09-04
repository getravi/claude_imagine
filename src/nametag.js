// nametag.js — the pond's names, drawn on the pond.
//
// Six releases have been spent teaching this page to call things by name.
// v1.116 named the lineages, v1.119 gave the star a given name, v1.123 put the
// whole shortlist on a board, v1.124 wrote the record book and v1.125 taught
// the Chronicle to say *"Marlow raises their 6th"*. Every one of those names
// lives in a **panel**, and the picture they are about has never carried a
// single letter. So a visitor reads that Marlow has raised six young, looks up
// at three hundred identical darts, and has no way whatever of finding Marlow.
//
// A name nobody can point at is a caption for a photograph nobody was shown.
//
// So: the tag. A small plate over the handful of animals this page already has
// a reason to name — the one you picked, and the stand-outs on the `🏅 Worth
// watching` board — carrying the animal's given name and the mark of what makes
// it worth watching. The board under the water becomes the key to the water:
// the same five marks, in the same order, from the same list.
//
// **The same list, not a second opinion.** `cast.js#castRoles` is the one place
// the five predicates live and `whoswho.js#ROLE_MARK` the one place their marks
// do; this module imports both rather than restating either. That is v1.123's
// rule in the release that gives it a third reader: when two surfaces have to
// agree and each decides somewhere else, one of them is silently losing the
// difference.
//
// **I expected flicker and measured stability instead.** v1.117 wrote down that
// a threshold on a live number fires and unfires several times a second, and
// gave the headline a 360-tick hold to survive it — so my first design here was
// a hold, a fade, and a rule for what a tag says while it is lying. None of that
// is built, because the churn is not there. Six seeds, six thousand ticks,
// `castRoles` sampled every tick: the set changes a mean of **41 times in 6,000
// ticks**, one change every 146, and the median stretch with nobody moving is
// 38–152 ticks depending on the pond. The reason is structural rather than
// lucky, and it is worth keeping: **every cast role is an extremum over a slow
// quantity** — age, young raised, body radius — and none of them is a share
// sitting on a bar. Age only ever climbs; the animal with the most young keeps
// them; and a body does not move at all, which v1.130 had to correct here as
// well — this note said *a body grows by a fraction of a pixel a tick*, and
// `radius` is dealt at birth and never written again, so the biggest animal in
// the water changes only when the biggest animal dies. The argument holds; the
// case for it is stronger than the sentence that was making it. A maximum over a quantity
// that moves slowly is stable *because* of what it is, where a threshold on a
// live share is unstable for the same reason. The hold would have been
// machinery guarding against a problem this pond does not have — and would have
// bought it a real cost, since a tag held past its moment is a label that has
// started lying about which animal is the biggest.
//
// **What a tag says is deliberately less than what the board says.** The board
// has room for *Marlow of the Amber Whorls — parent to more of this pond than
// anyone else*; a plate floating over a swimming animal has room for a mark and
// one word. So the family and the sentence stay on the board, the given name
// and the mark go on the water, and the two are read together. Four tags at
// most: the cast runs a mean of 2.95 rows, so the cap is a guard against a pond
// I have not seen rather than a routine trim.
//
// **And a plate now says what its animal is doing (v1.150).** Twenty-four
// releases of this page could tell you *who* something was and never once *what
// it was up to*; v1.148 fixed that for the one animal a visitor had picked, and
// left the other two hundred and ninety-nine mute — which is the whole pond, for
// as long as it takes somebody to work out that the darts are clickable. These
// plates were already hanging over three or four animals nobody had to choose.
// So each one carries the short form of `doing.js`'s verb after its name —
// *🏆 Marlow · fleeing* — in a quieter ink, because the name is still the half
// that ties the plate to a row on the board and the verb is the half that
// changes. The words, the priority between them and the hold that keeps one up
// long enough to read are all `doing.js`'s, unchanged; a plate is a second
// reader of that list, not a second opinion about it.
//
// **And a name is a button (v1.127).** The release that put these plates on the
// water left them inert, which is the one thing a label with a name on it can
// never be: everybody who has ever seen a map knows that the word is the place.
// A tag is now the easiest thing on this page to press — sixteen pixels tall
// against a four-pixel dart — and pressing it does the whole job in one go:
// picks that animal, and rides along with them. `tagAt` below is that hit test.
//
// Determinism: PURE OBSERVER. It reads creatures, writes nothing, adds no field
// to anything and draws no random number — a pond with names on it is bit for
// bit a pond with none. There is a test.

import { castRoles, givenName } from "./cast.js";
import { ROLE_MARK } from "./whoswho.js";
import { doingWord } from "./doing.js";

/**
 * The most plates that may be over the water at once.
 *
 * The measurement above says the cast is 2.95 rows on average and this project
 * has never seen it run past four, so this is a ceiling and not a policy. It
 * exists because the number of rows is a property of the pond rather than of
 * the code: a world nobody has run yet is allowed to be more interesting than
 * the twelve I sweep, and a screen of overlapping labels is a worse picture
 * than a screen with no labels at all.
 */
export const MAX_TAGS = 4;

/**
 * Who is wearing a name right now, nearest thing first.
 *
 * The one you picked always leads — it is the only mark on this canvas about
 * the *watcher* rather than about the world, and burying it under an ecological
 * accident would be the page choosing for you. If they also hold a cast role
 * they wear its mark, and the role is not drawn a second time.
 *
 * @param {import('./world.js').World} world
 * @param {object} config
 * @param {Map<number, {name: string}>|null} [names] lineage names, for nothing
 *   here yet — passed through to `castRoles` so both readers see one list
 * @param {object|null} [selected] the creature the page is pointed at, if any
 * @param {import('./doing.js').DoingCrowd|null} [watch] the held verbs (v1.150).
 *   Passed in rather than made here because the hold has to survive between
 *   frames and this function does not: it is called fresh every frame and
 *   returns a snapshot. Absent, a plate is a name and nothing else, which is
 *   what every caller before v1.150 gets and what the tests that predate it
 *   still assert.
 * @param {number} [now] the caller's clock, in milliseconds — only read when
 *   `watch` is given
 * @returns {Array<{id: number, x: number, y: number, radius: number, hue: number,
 *   mark: string, name: string, chosen: boolean, doing: string|null}>}
 */
export function nameTags(world, config, names = null, selected = null, watch = null, now = 0) {
  const roles = castRoles(world, config, names);
  const markOf = new Map(roles.map((r) => [r.creature.id, ROLE_MARK[r.rank] ?? ""]));
  const out = [];
  const seen = new Set();

  const add = (c, mark, chosen) => {
    if (!c || c.dead || seen.has(c.id) || out.length >= MAX_TAGS) return;
    seen.add(c.id);
    out.push({
      id: c.id,
      x: c.x,
      y: c.y,
      radius: c.radius,
      hue: c.hue,
      mark,
      name: givenName(c.id),
      chosen,
      // The verb is looked up *here*, inside the one loop that already holds
      // the creature, rather than by a second pass that would have to find
      // each animal again by id. It is also the only reason this snapshot is
      // taken in a fixed order: the watch advances a hold when it is looked
      // at, so looking twice in a frame would age a line twice.
      doing: watch ? watch.look(c, config, now) : null,
    });
  };

  if (selected) add(selected, markOf.get(selected.id) ?? "", true);
  for (const role of roles) add(role.creature, ROLE_MARK[role.rank] ?? "", false);
  // Whoever has stopped wearing a plate stops being watched. Without this the
  // map would grow by one entry for every animal that has ever been the biggest
  // or the oldest in the pond — small, but it is also the thing that keeps a
  // dead animal's energy from being compared against a live one that inherits
  // its id.
  if (watch) watch.keep(seen);
  return out;
}

/**
 * How far outside a plate a press still counts as a press on it, in the same
 * pixels the plate is drawn in.
 *
 * v1.115 measured this page's controls against a thumb and found thirty-one
 * that a finger could not reliably hit; a plate is sixteen pixels tall, which
 * is under every guideline there is for a touch target. The pad is the cheapest
 * honest fix — it grows the *target* without growing the *mark*, so the picture
 * is unchanged and the press is easier. It is deliberately smaller than the gap
 * a tag is lifted above its animal (`nameTag().lift`), so a padded plate can
 * never swallow a press aimed at the body underneath it.
 */
export const TAG_TOUCH_PAD = 4;

/**
 * The gap left between two plates that have had to stack, in the same pixels
 * the plate is drawn in. Small: they are meant to read as a column, not as two
 * unrelated marks.
 */
export const STACK_GAP = 2;

/**
 * Where a stacked plate may go, in whole plate-heights from where it wanted to
 * be: its own spot first, then up, then down. Up before down because a plate
 * already sits *above* its animal, so moving up keeps the column on the same
 * side of the body it belongs to; down would put one label between two animals
 * with nothing to say which is which.
 *
 * Five candidates and no more. Beyond two rows the column has stopped being
 * *near* the animal it names, and an honest overlap is better than a plate
 * pointing at the wrong dart.
 */
export const STACK_STEPS = Object.freeze([0, -1, -2, 1, 2]);

/**
 * A vertical spot for a plate that clears every plate already laid down.
 *
 * **This is the fix for a cost `node --test` could not see and a browser walk
 * could (v1.150).** A plate carrying a verb is two and a half times the width
 * of a plate carrying a name — a mean of 318 canvas pixels against 131 on a
 * 346 px phone — and over twelve seeds sampled sixty times each, two plates
 * landed on top of each other on **21.0% of frames** with the verbs against
 * 8.6% without. `MAX_TAGS` has said since v1.126 that a screen of overlapping
 * labels is a worse picture than a screen with no labels at all, and the verb
 * would have tripled the rate of exactly that. Moving the second plate up a row
 * costs nothing and fixes the 8.6% the plates already had.
 *
 * Here rather than in the renderer for `tagAt`'s reason: the arithmetic is what
 * a test can check and the painting is not. The boxes handed in are the plates
 * as they were actually laid down, so the hit test and the picture keep sharing
 * one geometry — the whole point of recording them.
 *
 * @param {Array<{x: number, y: number, w: number, h: number}>} laid plates already placed
 * @param {number} x the plate's left edge, already decided
 * @param {number} y where it would go with nothing in the way
 * @param {number} w
 * @param {number} h
 * @param {number} gap see `STACK_GAP`, at the drawn scale
 * @param {number} viewH the height a plate has to stay inside
 * @returns {number} the y to draw at — `y` itself when nothing clears
 */
export function stackY(laid, x, y, w, h, gap, viewH) {
  for (const step of STACK_STEPS) {
    const ty = y + step * (h + gap);
    if (ty < 0 || ty + h > viewH) continue;
    let clear = true;
    for (const b of laid) {
      if (x < b.x + b.w && b.x < x + w && ty < b.y + b.h && b.y < ty + h) {
        clear = false;
        break;
      }
    }
    if (clear) return ty;
  }
  return y;
}

/**
 * Which plate a press landed on, or `null`.
 *
 * Last first, because the renderer draws in list order and the last plate down
 * is the one on top — the same rule a browser uses for two overlapping
 * elements, and the one a visitor's eye is already applying.
 *
 * The boxes are the renderer's own, recorded as it laid each plate down rather
 * than recomputed here: a hit test that re-derives a layout is a second opinion
 * about where a thing is, and the whole failure this project keeps finding is
 * two surfaces deciding the same question in two places. The arithmetic lives
 * here, where `node --test` can reach it without a canvas; the geometry lives
 * where the drawing does.
 *
 * @param {Array<{id: number, x: number, y: number, w: number, h: number}>} boxes
 *   the plates as drawn, in drawing order
 * @param {number} x press position, in the canvas's own pixels
 * @param {number} y
 * @param {number} [pad] slack around each plate — see `TAG_TOUCH_PAD`
 * @returns {{id: number, x: number, y: number, w: number, h: number}|null}
 */
export function tagAt(boxes, x, y, pad = TAG_TOUCH_PAD) {
  if (!boxes || !boxes.length) return null;
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) return b;
  }
  return null;
}

/**
 * What a plate reads, as one string: the mark, a space, the name.
 *
 * Composed here rather than in the renderer for the reason `chronicle.js` gives
 * for composing its own: the words are the feature and the drawing is not, so
 * the sentence has to be somewhere a test can read it without a canvas.
 */
export function tagText(tag) {
  return tag.mark ? `${tag.mark} ${tag.name}` : tag.name;
}

/**
 * What sits between the name and the verb on a plate.
 *
 * A spaced middle dot, which is this page's own separator wherever two facts
 * share a line, and a character rather than a gap because a gap is what a plate
 * looks like when a word failed to arrive.
 */
export const TAG_SEP = " · ";

/**
 * The trailing half of a plate — the separator and the verb — or an empty
 * string for an animal nobody is holding a verb for.
 *
 * Returned as one string with the separator already on it, because the renderer
 * draws this half in a second colour and therefore has to measure it: a
 * separator drawn in the name's ink and a verb drawn in the dim would be two
 * measurements to keep in step, and the dot belongs to the quiet half of the
 * sentence anyway.
 */
export function tagDoing(tag) {
  const word = tag && tag.doing ? doingWord(tag.doing) : "";
  return word ? `${TAG_SEP}${word}` : "";
}

/**
 * What a plate reads in full, name and verb — the string a test asserts against
 * and the one a screen reader would be given if this layer ever gets one.
 */
export function tagFullText(tag) {
  return `${tagText(tag)}${tagDoing(tag)}`;
}

/**
 * What the set of tags depends on, as a string — the same content-keyed memo
 * every panel on this page uses, here so a test can ask whether two frames drew
 * the same names without comparing two arrays of objects.
 *
 * The verb is part of the key from v1.150: two frames whose plates say
 * *Nim — fleeing* and *Nim — hunting* are two different pictures, and a memo
 * that could not tell them apart would be a memo that holds the wrong one.
 */
export function tagSignature(tags) {
  return tags.map((t) => `${t.id}:${t.mark}:${t.doing ?? ""}`).join(",");
}
