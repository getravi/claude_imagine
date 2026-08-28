// whoswho.js — the pond's cast list: who is worth watching, by name, and one
// click to go and watch them.
//
// v1.119 gave this page a button that hands a newcomer one animal with a story.
// It is the best control here and it has a shape a first-time visitor keeps
// bumping into: **it decides for you.** Press it and you get Pip; press it
// again on a paused pond and you get Pip again, because the pick is a total
// order and the head of a total order does not move. Everything the pond had a
// reason to point at *other* than Pip — the biggest hunter in the water, the
// last of a dying family, the animal that has parented a fifth of the pond —
// was computed inside `pickStar`, compared, and thrown away, four times a
// press, for four releases.
//
// So: the shortlist, on the page. One row per stand-out, in the order the pond
// ranks them, each a button that selects that animal and sends the camera after
// them. The button still hands over its pick for a visitor who does not want to
// choose; this is for the one who does.
//
// **It is the same list, not a second opinion.** `cast.js#castRoles` is now the
// one place the five predicates live and this module renders what it returns —
// so the board's first row *is* what "👋 Meet somebody" would give you, by
// construction rather than by a test that hopes so. This project's own hard-won
// note: when two surfaces have to agree and each decides somewhere else, one of
// them is silently losing the difference.
//
// Three rules, each of them a thing the first build got wrong.
//
//  1. **A row is a claim, so a row that is not true is not drawn.** No role has
//     a floor of "whoever is biggest": every one of them carries a threshold
//     from `cast.js`, and where nobody has outgrown, outlived or outbred
//     anybody, the board says so in one line rather than naming five arbitrary
//     animals. An empty board is a fact about the pond — and a fact a visitor to
//     the default world never meets, because the hunter row fires on tick one.
//     See `CAST_EMPTY`, which carries the measurement.
//  2. **One animal, one row.** Twelve ponds sampled every hundred ticks to six
//     thousand: **18.2% of instants have an animal holding two roles**, and the
//     commonest pair is not the one I expected. It is *parent* and *elder* — 83
//     of the 137 doubled rows — because the animal that has raised the most
//     young is usually just the one that has been alive longest to do it, which
//     makes those two roles nearly the same claim about a settled pond. *Hunter*
//     and *giant* is second at 32, and that pair is the one the ecology
//     explains. A board that listed either twice under two headings would read
//     as broken, because a reader counts rows and not roles. The higher-ranked
//     reason wins, which is the more newsworthy of the two by the same ordering
//     the button uses. Boards run 1–4 rows over that sweep, three being the
//     commonest.
//  3. **No unit appears in it.** The bar `headline.js`, `cast.js`, `obituary.js`
//     and `key.js` hold themselves to, checked here the same way. A visitor
//     reads *the oldest animal in the pond*, never *age 3,140*.
//
// Determinism: PURE OBSERVER. It reads creatures, writes nothing, and draws no
// random number — a pond with this board on screen is bit-for-bit a pond
// nobody is watching. There is a test.

import { castRoles, creatureLabel, STAR } from "./cast.js";
import { inspectorSwatch } from "./palette.js";

/**
 * The mark each role wears, keyed by `cast.js`'s rank.
 *
 * Emoji rather than a word, because the sentence beside it already says which
 * role this is — *the oldest animal in the pond* needs no heading called "The
 * elder" in front of it, and a row with both is the same fact printed twice.
 * The mark is there so the eye can find a row again after it has read it.
 *
 * `STAR.FED` is deliberately absent: it never reaches this board. See
 * `castRoles`.
 */
export const ROLE_MARK = Object.freeze({
  [STAR.LAST]: "🍂",
  [STAR.PARENT]: "👶",
  [STAR.HUNTER]: "🔺",
  [STAR.GIANT]: "🐋",
  [STAR.ELDER]: "⏳",
});

/**
 * What the board says when nobody in the pond stands out.
 *
 * It is not an error and it is not "no data" — it is a fact about the pond, and
 * the line says which fact. **A visitor arriving at the default world will never
 * see it.** Twelve default ponds sampled from tick 1: the board is empty on
 * **0 of 1,044 instants**, because a hunter is on it from the very first tick.
 * Switch hunting off and it is the ordinary early state — empty on 67.2% of the
 * first three hundred ticks and 7.0% after, with four of the twelve ponds taking
 * nine hundred to fourteen hundred ticks before anybody stands out at all.
 */
export const CAST_EMPTY =
  "Nobody stands out just now — nobody here has outgrown, outlived or " +
  "outbred the rest. Watch for a moment, or press 👋 Meet somebody and " +
  "one will be picked for you.";

/** The attribute a row carries its creature's number in, for the click handler. */
export const CAST_ID_ATTR = "data-cast-id";

/**
 * The board's rows: plain data, one per animal, best story first.
 *
 * Nothing here refers back to a creature — a row holds a number, a name and two
 * strings — so a row that outlives its animal by a frame names a body the world
 * has already buried rather than holding it alive. `main.js` looks the number
 * up in the living when a row is pressed, and shrugs if it is gone.
 *
 * @param {{creatures:Array}} world
 * @param {object} config
 * @param {Map<number, {plural:string}>|null} [names] the tree's family names
 * @returns {Array<{id:number, rank:number, icon:string, label:string, why:string, hue:number}>}
 */
export function castRows(world, config, names = null) {
  const seen = new Set();
  const rows = [];
  for (const role of castRoles(world, config, names)) {
    const c = role.creature;
    if (seen.has(c.id)) continue; // rule 2: one animal, one row
    seen.add(c.id);
    rows.push({
      id: c.id,
      rank: role.rank,
      icon: ROLE_MARK[role.rank],
      label: creatureLabel(c, names),
      why: role.why,
      hue: c.hue,
    });
  }
  return rows;
}

/**
 * What the board depends on, as a string.
 *
 * Rank and id, because those are what a row *is*: a name is a pure function of
 * the id, and a reason is a pure function of the rank and the family, which a
 * species cannot change once it has one. So the markup is rebuilt when the cast
 * changes and not when the pond breathes — the same content-keyed memo every
 * other panel on this page uses, and the reason a board recomputed every frame
 * costs no DOM.
 *
 * @param {Array<{id:number, rank:number}>} rows
 */
export function castSignature(rows) {
  return rows.map((r) => `${r.rank}:${r.id}`).join(",");
}

/**
 * The whole board, as markup for one list container.
 *
 * A row is a `<button>` and not a link with a click handler on it, for v1.51's
 * reason: it is a control, so it should be a control — reachable by tab,
 * pressed by Enter and by Space, and announced as something that does
 * something. The mark is `aria-hidden` and the button carries its own label,
 * because "🍂 Pip of the Amber Whorls the last of the Amber Whorls" is what
 * reading the row aloud in source order gives, and *Watch Pip of the Amber
 * Whorls — the last of the Amber Whorls* is what a listener needs.
 *
 * @param {Array<{id:number, icon:string, label:string, why:string, hue:number}>} rows
 */
export function castHTML(rows) {
  if (rows.length === 0) return `<li class="castempty">${CAST_EMPTY}</li>`;
  return rows
    .map((r) => {
      // The same swatch the inspector puts beside a living creature's name and
      // the obituary keeps beside a dead one's, carrying its own colour: it is
      // how a reader takes a name off this board and finds the animal in the
      // water, which is the whole point of the row.
      const sw = inspectorSwatch(r.hue);
      return (
        `<li class="castrow"><button type="button" ${CAST_ID_ATTR}="${r.id}" ` +
        `aria-label="Watch ${r.label} — ${r.why}" title="creature ${r.id}">` +
        `<span class="swatch" style="background:${sw.fill};color:${sw.glow}"></span>` +
        `<span class="castmark" aria-hidden="true">${r.icon}</span>` +
        `<span class="castname">${r.label}</span>` +
        `<span class="castwhy">${r.why}</span>` +
        `</button></li>`
      );
    })
    .join("");
}
