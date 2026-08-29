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
// sitting on a bar. Age only ever climbs; a body grows by a fraction of a pixel
// a tick; the animal with the most young keeps them. A maximum over a quantity
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
 * @returns {Array<{id: number, x: number, y: number, radius: number, hue: number,
 *   mark: string, name: string, chosen: boolean}>}
 */
export function nameTags(world, config, names = null, selected = null) {
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
    });
  };

  if (selected) add(selected, markOf.get(selected.id) ?? "", true);
  for (const role of roles) add(role.creature, ROLE_MARK[role.rank] ?? "", false);
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
 * What the set of tags depends on, as a string — the same content-keyed memo
 * every panel on this page uses, here so a test can ask whether two frames drew
 * the same names without comparing two arrays of objects.
 */
export function tagSignature(tags) {
  return tags.map((t) => `${t.id}:${t.mark}`).join(",");
}
