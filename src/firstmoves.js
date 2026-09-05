// firstmoves.js — the three presses a stranger is offered, and where they sit.
//
// Every release since v1.123 has added a control to the panel on the right and
// argued, carefully, about where in that panel it should go. `👋 Meet somebody`
// went on its own row because "a third button squeezed beside Feed would take
// all three under the 24 px bar". `⏩ Skip ahead` went directly under it
// because "the two of them are the page's answers to the only two questions a
// visitor has in their first minute". `🧭 Show me around` went below that.
// Three good arguments, all answering the same wrong question: *where in the
// drawer of settings does the thing a stranger should press belong?*
//
// The answer a browser gives, at 390 × 844, on the page as it loads:
//
//   header.topbar        top    0   h  135
//   section.scenarios    top  135   h  376   ← twelve other worlds, first
//   .stage (the pond)    top  755   h  239
//   …eleven panels…
//   aside.panel          top 3527
//   #btn-meet            top 3692   ← of a 4,815 px document: 77% of the way down
//
// **The one button this page recommends to a first-time visitor was below
// everything else on it.** Not hidden, not unlabelled, not too small — just
// last, on the width most visitors arrive at, because a two-column desktop
// layout stacks into one column and the column holding the controls goes
// second. Nothing in the suite could see it: `node --test` cannot lay out a
// page, and every test this project has written about these three buttons asks
// whether they *exist*.
//
// So they are a row under the water now, and this module is the walk that says
// what that bought. The interesting half of the cycle is not the fix: it is
// that the defect was invisible to every instrument here and obvious in eleven
// seconds of a real browser, on the one viewport nobody had walked the *order*
// of. `targetsize.js` and `legibility.js` both walk two viewports and both ask
// about a control in isolation — how big is it, can it be read. Neither asks
// where it is in the queue.
//
// **The rule, stated so it outlives this row.** A surface that *tells* a
// visitor to press something owes that control a place in the main column. The
// tour points at `#btn-meet` and `#btn-skip`; the empty state of `#doing` says
// *pick an animal*; `simpleview.js` rule 2 already forbids pointing at a thing
// the page is hiding. Being three thousand pixels away is the quiet version of
// the same failure, and `test/firstmoves.test.js` holds the loud half: every id
// below appears in `app/index.html` before the aside opens.
//
// **And the cost, said out loud, because it is real.** At 1280 × 900 the row
// lands at 964 px and the fold is at 900, where the panel used to put
// `#btn-meet` at 341. A desktop visitor now scrolls to reach it. The reason
// that is the right trade rather than a wash: the pond itself already ends at
// 944 px at this height, so the scroll that brings the row into view is the
// scroll that brings the *water* into view, and nobody looks at this page
// without doing it. On a phone the same move is worth three thousand pixels.
//
// PURE OBSERVER. No DOM, no simulation state, no random numbers — an inventory,
// one string search and the arithmetic that compares two walks.

/**
 * The controls a stranger is offered, in the order a first minute asks for
 * them — which is the order `tour.js` already walks its stops in.
 *
 * `asks` is the visitor's question rather than the button's function, because
 * the question is what decides the order and the function is what decided the
 * old one. Two of these three were placed by an argument about their function.
 */
export const FIRST_MOVES = Object.freeze([
  Object.freeze({ id: "btn-meet", label: "👋 Meet somebody", asks: "which of these should I watch?" }),
  Object.freeze({ id: "btn-skip", label: "⏩ Skip ahead", asks: "why should I keep looking?" }),
  Object.freeze({ id: "btn-tour", label: "🧭 Show me around", asks: "what is the rest of this?" }),
]);

/** The class on the row that holds them, in `app/index.html`. */
export const ROW_CLASS = "firstmoves";

/** Where the main column stops and the drawer of settings begins. */
export const ASIDE_OPENS = '<aside class="panel">';

/**
 * The selector the row's size rule is written under, for a test that wants to
 * read the number rather than trust this file. It is the *last* of the three
 * grouped selectors in `style.css`, which is the one `targetsize.js`'s reader
 * can find: that function matches a selector immediately followed by `{`.
 */
export const ROW_RULE = ".firstmoves button.tour-open";

/**
 * WCAG 2.2 SC 2.5.5 (Target Size (Enhanced), Level AAA): 44 CSS pixels.
 *
 * `targetsize.js` holds this project to SC 2.5.8's 24 and writes down, in as
 * many words, that this page "meets it nowhere in the panel". These three are
 * the first controls here to clear the enhanced bar, and they are the right
 * three to spend it on: they are what a stranger on a phone is told to press.
 */
export const TOUCH_ENHANCED = 44;

/**
 * The walk, before and after, at the two viewports the rest of this project's
 * browser work uses. Distances are from the top of the document, in CSS pixels,
 * on the app as it loads with nothing pressed and no creature selected.
 *
 * `firstPress` is the shallowest of the three — the first moment a scrolling
 * visitor can act on anything this page recommends. `doc` is here because the
 * number that matters is the *share*: 3,692 px is most of the way down a
 * 4,815 px page and would be nothing at all down a 40,000 px one.
 *
 * The 390 px column is the release. The 1280 px column is the control, and it
 * is worth as much: on a desktop the panel is a column *beside* the pond rather
 * than a slab beneath it, and the move costs 623 px there. **The defect was
 * never in the page. It was in what the page becomes at one column** — which is
 * the width nobody had walked the order of.
 */
export const WALK = Object.freeze({
  "390x844": Object.freeze({
    before: Object.freeze({ doc: 4815, firstPress: 3692, scenarios: 376, pond: 755 }),
    after: Object.freeze({ doc: 4501, firstPress: 685, scenarios: 47, pond: 426 }),
  }),
  "1280x900": Object.freeze({
    before: Object.freeze({ doc: 2807, firstPress: 341, scenarios: 80, pond: 326 }),
    after: Object.freeze({ doc: 2871, firstPress: 964, scenarios: 80, pond: 326 }),
  }),
});

/** Just the ids, for a caller that only wants to look them up. */
export function firstMoveIds() {
  return FIRST_MOVES.map((m) => m.id);
}

/**
 * How deep into a document a control sits, as a share of the whole — the number
 * the walk above is really about.
 *
 * Returns a fraction in [0, 1], or `null` for a document with no height, which
 * is a question rather than a zero: "how far down a page of no height" has no
 * answer, and a `0` would read as "at the very top".
 */
export function depthShare(top, doc) {
  const d = Number(doc);
  const t = Number(top);
  if (!Number.isFinite(d) || !Number.isFinite(t) || d <= 0) return null;
  return Math.min(1, Math.max(0, t / d));
}

/**
 * Does `id` appear in the main column — that is, before the aside opens?
 *
 * A string search rather than a parse, deliberately, and the same choice
 * `targetsize.js` makes about `min-height`: the claim being tested is about the
 * shipped markup *as written*, and a DOM built inside a test is a second copy
 * of the page that can agree with itself while the file disagrees.
 *
 * A page with no aside answers `true` for anything it contains: there is no
 * drawer for a control to be stuck in.
 */
export function inMainColumn(html, id) {
  const at = html.indexOf(`id="${id}"`);
  if (at < 0) return false;
  const aside = html.indexOf(ASIDE_OPENS);
  return aside < 0 ? true : at < aside;
}
