// firstmoves.js — the presses a stranger is offered, and where they sit.
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
// ## v1.169: the list of three was not lying about the fourth
//
// Sixteen releases later, on the same page, at the same width, the same defect
// was still standing — one button wide:
//
//   #btn-hand            top 4,665   of a 5,678 px document: 82% of the way down
//                                    it, and the 28th target a thumb can reach
//
// `🥣 Feed by hand` is the only control on this page that is **aimed**. Every
// other lever changes the whole pond — sixty pellets everywhere, twelve
// strangers anywhere, a slider — and this one puts ten pellets on the square
// inch a person pointed at. The claim the whole project rests on is *nobody
// taught them to find food*, it is on the front door in forty-point letters, and
// this button is the only place on either page where a stranger can **check** it
// instead of reading it. It was filed under `✦ Feed`, because it is the same
// action aimed — which is a good argument about *which drawer*, and the wrong
// question, which is precisely what the walk above found in v1.153.
//
// **Why nothing caught it, and this is the part worth keeping.** The test that
// exists to prevent exactly this walked `FIRST_MOVES`, a hand-typed list of
// three, and asked whether each of those three was in the main column. All three
// were. A list of three real things is not lying about a fourth — the same shape
// `tour.js` found in v1.166 (a guide that points at six real panels is not lying
// about the seventh) and `levers.js` in v1.111 (a filter that returns the wrong
// set still returns a set). **A completeness check has to iterate over the
// domain, never over the answer.** So `DRAWER` below names every control left in
// the panel and why it belongs there, and the test reads the shipped page: a
// button in the aside that is in neither list fails the build. The reason each
// one had to be *typed* is the useful half, as it was for the guide: not one of
// the twelve is excused for being **advanced**. Every one of them is excused
// for acting on the *run* rather than on the pond, or for being a **second**
// press — a control that means nothing until something else has happened. Both
// are facts about this page I did not have until I was made to write them down,
// and both are things somebody who disagrees with me can check.
//
// ## v1.175: the third one, and the deepest
//
// `#btn-randomseed` at **5,050 px of a 5,709 px page** at 390 × 844 — 88.5% of
// the way down, the 34th of 45 targets — which is 385 px below where the aimed
// control had been when v1.169 called *that* the bottom of the page. It is
// excused in `DRAWER` below and the excuse is sound about a **die beside a
// field**; what it never covered is that the die was the only route to *going
// somewhere else*, which is a first move by every test this file applies. The
// door now stands on the nameplate, beside the sentence it answers, and
// `src/anotherpond.js` carries that walk and the arithmetic behind it.
//
// The pattern, three for three: **the reason a control is in the drawer is
// always a reason about the control, and the question is about the act.**
//
// PURE OBSERVER. No DOM, no simulation state, no random numbers — an inventory,
// one string search and the arithmetic that compares two walks.

/**
 * The controls a stranger is offered, in the order a first minute asks for
 * them — which is the order `tour.js` already walks its stops in.
 *
 * `asks` is the visitor's question rather than the button's function, because
 * the question is what decides the order and the function is what decided the
 * old one. Three of these four were placed by an argument about their function,
 * and the fourth by an argument about which *other* button it resembled, which
 * is the same mistake with a neighbour in it.
 */
export const FIRST_MOVES = Object.freeze([
  Object.freeze({ id: "btn-meet", label: "👋 Meet somebody", asks: "which of these should I watch?" }),
  Object.freeze({ id: "btn-skip", label: "⏩ Skip ahead", asks: "why should I keep looking?" }),
  Object.freeze({ id: "btn-tour", label: "🧭 Show me around", asks: "what is the rest of this?" }),
  // v1.169. Last because it is the only one of the four that asks the visitor to
  // *do* something to the world rather than to be shown it, and a page that
  // offers that before it has said what the world is has offered a stranger a
  // lever on a thing they cannot name. The three above are the order of a first
  // minute; this is what a first minute ends in.
  Object.freeze({ id: "btn-hand", label: "🥣 Feed by hand", asks: "can I touch it?" }),
]);

/** The class on the row that holds them, in `app/index.html`. */
export const ROW_CLASS = "firstmoves";

/** Where the main column stops and the drawer of settings begins. */
export const ASIDE_OPENS = '<aside class="panel">';

/**
 * The selector the row's size rule is written under, for a test that wants to
 * read the number rather than trust this file. It is the *last* of the grouped
 * selectors in `style.css`, which is the one `targetsize.js`'s reader can find:
 * that function matches a selector immediately followed by `{`.
 *
 * Which makes this constant a small trap, and it sprang in v1.169: adding a
 * fourth selector to that group moved the `{` off `.firstmoves button.tour-open`
 * and this line had to move with it. **A constant that names "the last member of
 * a list" is a position, not a name** — it is correct exactly until the list
 * grows, and the failure is a lookup that silently finds nothing rather than a
 * mismatch that argues. The test below reads a number back, so it fails loudly;
 * that is the only reason this is a note and not a bug.
 */
export const ROW_RULE = ".firstmoves button.hand-btn";

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

/**
 * Every control left in the drawer, and why it is not a first move (v1.169).
 *
 * The same shape as `tour.js`'s `UNTOURED` and `targetsize.js`'s `UNMET`: a gap
 * named is a gap a later cycle can close, and a gap unnamed is a claim of
 * coverage nobody made on purpose. What makes this one different from those two
 * is the direction it is read in — `UNTOURED` excuses panels a guide walks past,
 * and this excuses controls a *visitor* walks past, which is the list that was
 * missing when `🥣 Feed by hand` sat here for sixteen releases with nothing able
 * to notice.
 *
 * The bar a reason has to clear: it must say what the control does, not who it
 * is *for*. "Advanced" is not a reason — it is the same judgement that put the
 * aimed control under the unaimed one, and every entry below was written by
 * asking *would a stranger's first minute be worse without this?* rather than
 * *is this for beginners?*
 */
export const DRAWER = Object.freeze({
  "btn-pause": "stops the clock. A control on the *run* rather than on the pond, and the one press here a visitor finds without being offered it — the pond is the only thing on the page that moves",
  "btn-reset": "throws this world away and starts another. The undo for everything in this drawer, which is what makes it belong with them and not beside the water",
  "btn-feed": "sixty pellets over the whole pond. The unaimed twin of `🥣 Feed by hand`, and food that is everywhere demonstrates nothing — it is a lever for a run being steered, where the handful is a gesture for a question being asked",
  "btn-seedlife": "twelve strangers dropped in anywhere. The same lever one kingdom up, and the same reason: it changes the experiment rather than showing it",
  "btn-picture": "takes a copy home. A second press by construction — nobody photographs a pond they have not looked at yet",
  "btn-gif": "the same, moving. Second press, for the same reason, and the heavier of the two",
  "btn-randomseed": "the die beside the seed field. It is not a control in its own right but the other half of one, and a text input is not a first move — true of the die, and quietly untrue for sixteen releases of the thing the die was the only route to. **Going somewhere else** is a first move; it stood at 88.5% of a phone's page for as long as this list has existed, and since v1.175 it stands on the nameplate as `🎲 Another pond` (`src/anotherpond.js`). The die stays here, still the field's other half, and picks its seed through the same chooser now",
  "btn-save": "writes the world to a file",
  "btn-load": "reads one back. A pair with Save, and both are acts on a *file*: the first minute this row is sized for has nothing yet to keep",
  "btn-share": "copies a link to this exact pond. A second press with a person on the other end of it",
  "btn-export-csv": "hands the run's numbers to a spreadsheet. The one control on this page addressed to somebody who has left it",
  "chart-scope": "switches a figure between the whole run and its recent window. A setting on an instrument, and the instrument is on the far side of `🔬 Everything`",
});

/**
 * The v1.169 walk: what moving the aimed control out of the drawer bought, and
 * what it cost, at the two viewports the rest of this project's browser work
 * uses.
 *
 * Same shape as `WALK` above and deliberately a *second* record rather than an
 * edit of the first: that one is what v1.153 measured, and a recording somebody
 * overwrites is a recording of nothing. `depth` is the share of the document the
 * button sits down, which is the number this is really about — 4,665 px would be
 * nothing at all down a forty-thousand pixel page.
 *
 * The desktop column is the cost, and it is the same cost v1.153 paid and for
 * the same reason: the panel is a column *beside* the water at 1280 px, so
 * anything leaving it moves **down**. The pond already ends below the fold at
 * this height, so the scroll that reaches the row is the scroll that reaches the
 * water — and the phone, where the button was at 82% of the page, is the width
 * most visitors arrive at.
 */
export const AIMED_WALK = Object.freeze({
  "390x844": Object.freeze({
    before: Object.freeze({ doc: 5678, top: 4665, rank: 28 }),
    after: Object.freeze({ doc: 5677, top: 977, rank: 22 }),
  }),
  "1280x900": Object.freeze({
    before: Object.freeze({ doc: 3568, top: 363, rank: 22 }),
    after: Object.freeze({ doc: 3568, top: 1034, rank: 31 }),
  }),
});

/** Just the ids, for a caller that only wants to look them up. */
export function firstMoveIds() {
  return FIRST_MOVES.map((m) => m.id);
}

/**
 * Every `<button id="…">` in the drawer of settings, in document order.
 *
 * The domain of the completeness check, and it is deliberately read off the
 * shipped page rather than listed here: a hand-typed domain is the bug this
 * function exists to catch, one level up. A string scan for the same reason
 * `inMainColumn` is one — the claim is about the markup as written.
 *
 * The aside ends at the first `</aside>`, which is why the overlays that live
 * after it (the guide's card, the postcard, the skip card, the contents) are
 * outside this: they are fixed to the viewport, so where they sit in document
 * order says nothing at all about where a thumb finds them.
 *
 * @param {string} html the shipped page
 * @returns {string[]}
 */
export function drawerButtons(html) {
  const from = html.indexOf(ASIDE_OPENS);
  if (from < 0) return [];
  const to = html.indexOf("</aside>", from);
  const drawer = html.slice(from, to < 0 ? html.length : to);
  return [...drawer.matchAll(/<button[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
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
