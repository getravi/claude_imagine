// tour.test.js — the guide, and the seven ways a guide goes wrong.
//
// A tour is the one feature on this page whose subject is the page itself, and
// that is the whole of its risk. Everything else here is checked against the
// world: a headline is wrong if the pond disagrees with it, a record is wrong if
// the animals disagree with it. A tour is wrong if the *document* disagrees with
// it, and the document is edited by hand, so nothing but a test can notice.
//
// Seven failures, in the order they are likely — and the header of this file
// said *four* while listing six of them for two releases, which is the drift
// this project keeps finding in its own prose (v1.163) arriving in the file
// whose whole subject is a guide falling behind the thing it describes:
//
//   1. **It points at something that is not there.** Every stop names an `id`;
//      the page is read back and every one of them has to exist in it. A ring
//      drawn around nothing teaches a visitor that this page is broken, which is
//      the opposite of what a guide is for, and it happens the first time
//      somebody renames a panel.
//   2. **It speaks the project's own language.** Held to the bar `cast.js`,
//      `key.js` and `records.js` are held to. A tour is *only* read by people who
//      do not yet know what any of this is — it is the one surface here with no
//      expert readers at all — so a single *lineage* on it is worse than it
//      would be anywhere else on the page.
//   3. **It runs off the edge of the window.** The card is placed by arithmetic
//      (`cardPlacement`), and the arithmetic is swept over a phone, a laptop and
//      a ring in every corner, because the axis nobody measures is the one a
//      thumb misses in (v1.115).
//   4. **It moves the pond.** It must not, and the module makes that easy to
//      check by having no way to: no import of the world, no random number.
//   5. **It offers a button that does nothing** (v1.143). The last stop carries
//      an act *name*; `main.js` carries the handler. Two halves in two files is
//      one more way for a guide to lie, so both directions are checked below.
//   6. **It stands in front of what it is pointing at** (v1.159). Staying on
//      screen is not enough: a card that is fully visible and sitting on the
//      pond has hidden the one thing the stop exists to show. The sweep below
//      is the same corners-and-windows sweep as (3), asking the other question —
//      *is there a placement that hides less of this ring than the one chosen?*
//   7. **It falls behind the page** (v1.166). The five above are all failures
//      of a stop; this is a failure of the *set* of them, and it is the one
//      that actually kept happening — three releases running closed with the
//      words *this release added a panel the tour does not mention*, and no
//      test could have said so, because a guide that points at six real things
//      is not lying about the seventh. So the last test below reads every
//      headed panel out of the shipped page and requires each to be ringed by
//      a stop or named in `UNTOURED` with a reason. There is no third state a
//      new panel can arrive in.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  STOPS,
  TOUR_ACTS,
  UNTOURED,
  TOUR_LENGTH,
  TOUR_SEEN_KEY,
  cardPlacement,
  hasSeenTour,
  markTourSeen,
  nextLabel,
  stepIndex,
  stopAction,
  stopAt,
  stopCounter,
} from "../src/tour.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const page = read("app/index.html");
const main = read("src/main.js");
const sheet = read("style.css");
const source = read("src/tour.js");

/** Every `id="..."` on the shipped app page. */
const pageIds = new Set([...page.matchAll(/\bid\s*=\s*"([^"]*)"/g)].map((m) => m[1]));

test("every stop points at something that is on the page", () => {
  for (const stop of STOPS) {
    assert.ok(
      pageIds.has(stop.target),
      `stop "${stop.id}" rings #${stop.target}, which app/index.html does not have`,
    );
  }
});

test("the stops are six distinct things in a fixed order", () => {
  assert.equal(STOPS.length, TOUR_LENGTH);
  assert.ok(TOUR_LENGTH >= 4 && TOUR_LENGTH <= 8, "a tour longer than a screenful is a manual");
  const ids = new Set(STOPS.map((s) => s.id));
  assert.equal(ids.size, STOPS.length, "two stops share an id");
  const targets = new Set(STOPS.map((s) => s.target));
  assert.equal(targets.size, STOPS.length, "two stops ring the same element");
  // The story: the pond, then what is happening in it, then how to read it, then
  // one animal, then what that animal is thinking, then a year going past in
  // three seconds. The last stop is the call to action and is the reason anybody
  // stays. The fifth was *other worlds to try* until v1.166 — see rule 6 in
  // `src/tour.js`: it rang a strip that is on screen before a visitor touches
  // anything, and the two panels that say what an arrowhead is begin 313 px
  // below the fold on the phone this project sizes for.
  assert.deepEqual(
    STOPS.map((s) => s.id),
    ["pond", "now", "read", "meet", "mind", "skip"],
  );
});

test("every stop is a title, a sentence, a mark and a side", () => {
  for (const stop of STOPS) {
    assert.ok(stop.title.length > 3 && stop.title.length <= 40, `"${stop.title}" is not a title`);
    assert.doesNotMatch(stop.title, /[.!]$/, `"${stop.title}" is a heading, not a sentence`);
    assert.ok(stop.line.length > 80, `stop "${stop.id}" says too little to be worth a stop`);
    assert.ok(stop.line.length < 340, `stop "${stop.id}" is a paragraph — a card is two sentences`);
    assert.match(stop.line, /[.!]$/, `stop "${stop.id}" does not finish its sentence`);
    assert.ok(stop.icon.length > 0 && stop.icon.length <= 4, `stop "${stop.id}" has no mark`);
    assert.ok(
      stop.prefer === "above" || stop.prefer === "below",
      `stop "${stop.id}" asks for a side that is not a side`,
    );
    assert.ok(Object.isFrozen(stop), "a stop is content and should not be editable at runtime");
  }
});

test("only the last stop offers a button, and it wears its target's own mark", () => {
  // Running an act closes the guide, which is the right end to a story and a
  // stop cut short anywhere else — so the invariant is not "at most one action"
  // but "the action is last". Everything before it must be a stop a visitor can
  // walk past.
  for (let i = 0; i < TOUR_LENGTH - 1; i++) {
    assert.equal(stopAction(i), null, `stop "${stopAt(i).id}" offers a button before the end`);
  }
  const last = stopAction(TOUR_LENGTH - 1);
  assert.ok(last, "the last stop is the call to action and has nothing to press");
  assert.ok(TOUR_ACTS.includes(last.act), `"${last.act}" is not an act this guide knows`);
  assert.ok(last.label.length > 2 && last.label.length <= 24, "a button label is not a sentence");
  assert.ok(Object.isFrozen(last), "an action is content and should not be editable at runtime");
  // The card's button and the page's button are the same press, so they carry
  // the same mark. A visitor reading "⏩ Try it" inside a ring drawn around
  // "⏩ Skip ahead" is being told those two things are one thing.
  const target = page.match(new RegExp(`id="${stopAt(TOUR_LENGTH - 1).target}"[^>]*>([^<]*)<`));
  assert.ok(target, "the last stop's target has no label on the page to agree with");
  assert.ok(
    target[1].includes([...last.label][0]),
    `the card says "${last.label}" over a control the page calls "${target[1].trim()}"`,
  );
  // An unknown act, or half an action, is no action rather than a broken one.
  assert.equal(stopAction(-4), null);
  assert.equal(stopAction(999), stopAction(TOUR_LENGTH - 1), "clamped, like every other reader");
});

test("every act the guide names is an act the adapter can run", () => {
  // The two halves of the button, in two files. This is failure 5, and it is the
  // one that a browser finds by doing nothing when somebody presses.
  const block = main.match(/const TOUR_ACTIONS = \{[\s\S]*?\n\};/);
  assert.ok(block, "main.js has no table of acts");
  const handled = [...block[0].matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
  assert.deepEqual(
    [...handled].sort(),
    [...TOUR_ACTS].sort(),
    "the guide and the adapter disagree about what a stop's button can do",
  );
  assert.equal(
    (block[0].match(/closeTour\(\)/g) || []).length,
    TOUR_ACTS.length,
    "an act must close the guide before it runs — the card is over the thing it moves",
  );
  assert.match(main, /"tour-do"\)\.addEventListener\("click", runTourAction\)/, "the button is not wired");
  assert.match(main, /function runTourAction\(\)/, "main.js has no way to run an act");
});

test("a focused button in the guide is pressed rather than swallowed", () => {
  // The overlay takes Enter and Space so the page's own shortcuts cannot fire
  // from inside a dialog. It took them from buttons too, which made "← Back" go
  // forward and would have made "Try it" the one control on this page a keyboard
  // could focus and not press.
  const handler = main.match(/\$\("tour"\)\.addEventListener\("keydown"[\s\S]*?\n  \}\);/);
  assert.ok(handler, "the guide has no keyboard");
  assert.match(
    handler[0],
    /HTMLButtonElement[\s\S]*?return;/,
    "Enter and Space on a focused button must belong to the button",
  );
});

test("the guide does not speak the language of somebody already here", () => {
  // The same bar as `cast.js`, `key.js` and `records.js`, plus the words this
  // page's own panels use about themselves. The reader of this text has been on
  // the page for four seconds.
  const JARGON =
    /\b(carnivor\w*|herbivor\w*|omnivor\w*|lineage|genome|genotype|allele|mutation|neural|topology|tick|ticks|px|pixels?|predation|metabolic|metabolism|stochastic|fitness|phenotype|RNG|seed|simulation|parameter|config\w*)\b/i;
  for (const stop of STOPS) {
    assert.doesNotMatch(stop.title, JARGON, `"${stop.title}" uses a word a new visitor may not have`);
    assert.doesNotMatch(stop.line, JARGON, `stop "${stop.id}" uses a word a new visitor may not have`);
  }
});

test("stepping stays inside the tour, whatever it is handed", () => {
  assert.equal(stepIndex(0, -1), 0, "Back on the first stop must not wrap to the last");
  assert.equal(stepIndex(TOUR_LENGTH - 1, 1), TOUR_LENGTH - 1, "Next past the end must not wrap");
  assert.equal(stepIndex(0, 1), 1);
  assert.equal(stepIndex(2, -1), 1);
  assert.equal(stepIndex(999, 0), TOUR_LENGTH - 1);
  assert.equal(stepIndex(-999, 0), 0);
  assert.equal(stepIndex(NaN, 1), 1, "a lost index starts the tour rather than crashing it");
  assert.equal(stepIndex(1.7, 0), 1);
  for (let i = -3; i < TOUR_LENGTH + 3; i++) {
    assert.ok(stopAt(i), "stopAt must never hand back nothing");
    assert.ok(STOPS.includes(stopAt(i)));
  }
});

test("the counter and the forward button agree about where the end is", () => {
  assert.equal(stopCounter(0), `1 of ${TOUR_LENGTH}`);
  assert.equal(stopCounter(TOUR_LENGTH - 1), `${TOUR_LENGTH} of ${TOUR_LENGTH}`);
  assert.equal(stopCounter(500), `${TOUR_LENGTH} of ${TOUR_LENGTH}`);
  for (let i = 0; i < TOUR_LENGTH - 1; i++) {
    assert.equal(nextLabel(i), "Next →", `stop ${i} is not the last one`);
  }
  assert.equal(nextLabel(TOUR_LENGTH - 1), "Done", "the last stop must say it is the last stop");
});

test("the page's own printed counter is the tour's length", () => {
  // The card ships with "1 of 6" in the markup so the dialog is never briefly
  // blank. That is a copy of a number the module owns, and a copy nothing checks
  // is a copy that drifts (v1.26).
  const printed = page.match(/id="tour-count"[^>]*>([^<]*)</);
  assert.ok(printed, "app/index.html has no tour counter");
  assert.equal(printed[1].trim(), stopCounter(0));
});

test("a browser that has been shown around is not shown around again", () => {
  const store = new Map();
  const fake = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
  assert.equal(hasSeenTour(fake), false, "a fresh browser has not seen it");
  markTourSeen(fake);
  assert.equal(store.get(TOUR_SEEN_KEY), "1");
  assert.equal(hasSeenTour(fake), true, "having seen it must stick");
});

test("a browser that refuses to remember gets the quiet answer, not an exception", () => {
  // Reading `localStorage` throws outright where site data is blocked, and a
  // guide that cannot remember whether it has run is not a reason to take the
  // pond down with it. Both halves swallow, and the fallback is "seen" — the
  // tour stays reachable from its button and stops volunteering itself.
  const hostile = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(hasSeenTour(hostile), true);
  assert.doesNotThrow(() => markTourSeen(hostile));
  assert.equal(hasSeenTour(null), true);
  assert.doesNotThrow(() => markTourSeen(null));
});

test("the card sits where the stop asked for it when there is room", () => {
  const win = { width: 1200, height: 900 };
  const card = { width: 340, height: 160 };
  const ring = { left: 400, top: 380, width: 300, height: 200 };
  const below = cardPlacement(ring, win, card, "below");
  assert.equal(below.side, "below");
  assert.equal(below.top, ring.top + ring.height + 14);
  const above = cardPlacement(ring, win, card, "above");
  assert.equal(above.side, "above");
  assert.equal(above.top, ring.top - 14 - card.height);
  // Centred on the ring, both ways.
  assert.equal(below.left, ring.left + ring.width / 2 - card.width / 2);
});

test("the card flips to the side that has room, and only then", () => {
  const win = { width: 1200, height: 900 };
  const card = { width: 340, height: 200 };
  // A ring against the bottom of the window: below does not fit, above does.
  const low = cardPlacement({ left: 400, top: 700, width: 200, height: 160 }, win, card, "below");
  assert.equal(low.side, "above");
  // A ring against the top: above does not fit, below does.
  const high = cardPlacement({ left: 400, top: 10, width: 200, height: 60 }, win, card, "above");
  assert.equal(high.side, "below");
});

test("a target too tall to flank gets the card beside it, not on it", () => {
  // The pond as a browser reports it at 1280 × 900: the ring is 627 px tall with
  // 135 px of window above it and 138 px below, and the card is 223 px. Neither
  // side fits, and until v1.159 that meant the opening stop of the guide sat on
  // the water it was describing.
  const win = { width: 1280, height: 900 };
  const card = { width: 340, height: 223 };
  const ring = { left: 17, top: 135, width: 906, height: 627 };
  const at = cardPlacement(ring, win, card, "below");
  assert.equal(at.side, "right");
  assert.equal(hidden(ring, at, card), 0);
  // Beside means beside: clear of the ring's right edge, inside the window.
  assert.ok(at.left >= ring.left + ring.width, "the card starts left of the water");
  assert.ok(at.left + card.width <= win.width - 10, "the card runs off the right edge");
});

test("beside is a measurement, not a preference — a phone keeps its vertical card", () => {
  // The same branch, on the placard stop at 390 × 844: the ring is 438 px tall
  // and 324 px wide, so a card on either flank would cover seven times more of
  // it than the clamped vertical placement the stop already had.
  const win = { width: 390, height: 844 };
  const card = { width: 340, height: 223 };
  const ring = { left: 33, top: 203, width: 324, height: 438 };
  const at = cardPlacement(ring, win, card, "above");
  assert.ok(at.side === "above" || at.side === "below", `expected a vertical card, got ${at.side}`);
  const flank = { left: 40, top: 311 };
  assert.ok(
    hidden(ring, at, card) < hidden(ring, flank, card),
    "a flanked card would have hidden less of the placard",
  );
});

/** Square pixels of `ring` hidden by a card of `size` placed at `at`. */
function hidden(ring, at, size) {
  const w = Math.min(ring.left + ring.width, at.left + size.width) - Math.max(ring.left, at.left);
  const h = Math.min(ring.top + ring.height, at.top + size.height) - Math.max(ring.top, at.top);
  return w > 0 && h > 0 ? w * h : 0;
}

test("no placement hides more of the ring than another one available to it", () => {
  // The sweep of (6): every window, every corner, both preferences — and for each
  // one, the four placements this function chooses between. The chosen one has to
  // be the cheapest of them. A regression here is a card that has drifted back on
  // top of its subject while every other test still passes.
  const wins = [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 834, height: 1112 },
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
  ];
  const gap = 14;
  const margin = 10;
  for (const win of wins) {
    const card = { width: Math.min(340, win.width - 20), height: 210 };
    const clampL = (x) => Math.min(Math.max(margin, x), Math.max(margin, win.width - card.width - margin));
    const clampT = (y) => Math.min(Math.max(margin, y), Math.max(margin, win.height - card.height - margin));
    // Rings from a button to a whole pond, so the sweep covers both branches.
    for (const [width, height] of [
      [120, 80],
      [win.width - 40, win.height * 0.75],
      [win.width * 0.7, win.height - 120],
    ]) {
      for (const left of [0, (win.width - width) / 2, win.width - width]) {
        for (const top of [0, (win.height - height) / 2, win.height - height]) {
          for (const prefer of ["above", "below"]) {
            const ring = { left, top, width, height };
            const at = cardPlacement(ring, win, card, prefer, gap, margin);
            const cost = hidden(ring, at, card);
            const others = [
              { left: clampL(ring.left + ring.width + gap), top: clampT(ring.top + ring.height / 2 - card.height / 2) },
              { left: clampL(ring.left - gap - card.width), top: clampT(ring.top + ring.height / 2 - card.height / 2) },
              { left: clampL(ring.left + ring.width / 2 - card.width / 2), top: clampT(ring.top + ring.height + gap) },
              {
                left: clampL(ring.left + ring.width / 2 - card.width / 2),
                top: clampT(ring.top - gap - card.height),
              },
            ];
            for (const other of others) {
              assert.ok(
                cost <= hidden(ring, other, card) + 0.001,
                `${win.width}×${win.height} ring ${width}×${height} @${left},${top} (${prefer}): ` +
                  `chose ${at.side} hiding ${Math.round(cost)}, a placement hiding ${Math.round(hidden(ring, other, card))} was available`,
              );
            }
          }
        }
      }
    }
  }
});

test("the card never leaves the window, at any size or corner", () => {
  // Four windows, from a small phone to a desktop; a ring in every corner and in
  // the middle; both preferences. The card is allowed to overlap the ring when
  // the window is too short to hold both — it is never allowed to be off-screen.
  const wins = [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 834, height: 1112 },
    { width: 1440, height: 900 },
  ];
  const margin = 10;
  for (const win of wins) {
    const card = { width: Math.min(340, win.width - 20), height: 210 };
    for (const left of [0, win.width / 2 - 60, win.width - 120]) {
      for (const top of [0, win.height / 2 - 40, win.height - 80]) {
        for (const prefer of ["above", "below"]) {
          const ring = { left, top, width: 120, height: 80 };
          const at = cardPlacement(ring, win, card, prefer);
          assert.ok(at.left >= margin - 0.001, `${win.width}×${win.height}: card off the left edge`);
          assert.ok(at.top >= margin - 0.001, `${win.width}×${win.height}: card off the top edge`);
          assert.ok(
            at.left + card.width <= win.width - margin + 0.001,
            `${win.width}×${win.height}: card off the right edge`,
          );
          assert.ok(
            at.top + card.height <= win.height - margin + 0.001,
            `${win.width}×${win.height}: card off the bottom edge`,
          );
        }
      }
    }
  }
});

/**
 * A source file with its comments taken out, for the sweeps below.
 *
 * The comments in this project are prose about the code and routinely name the
 * things the code is forbidden to touch — the module below explains, in
 * English, why it does not read `window.localStorage` — so a scan that reads
 * them fails on its own documentation. Rough but sufficient: this project's
 * comments hold no `//` inside a string.
 */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

test("the guide cannot move the pond", () => {
  // Directive 2, checked the only way a module like this needs it checked: it
  // has no world to touch and no number to draw. Everything it exports is text,
  // an ordering, and arithmetic over four rectangles.
  const code = codeOnly(source);
  assert.doesNotMatch(code, /Math\.random/, "the guide must not draw a random number");
  assert.doesNotMatch(
    code,
    /^import .*(world|config|rng|creature)\.js/im,
    "the guide must not reach into the simulation",
  );
  assert.doesNotMatch(code, /\bdocument\.|\bwindow\.|getElementById/, "the words and the arithmetic hold no DOM");
});

test("the page and the adapter are wired to the same things", () => {
  // Every element the guide drives, and the two routes into it. `markup.test.js`
  // checks that everything main.js looks up exists; this checks the other
  // direction for this feature — that the page's guide is actually driven.
  for (const id of [
    "tour",
    "tour-scrim",
    "tour-ring",
    "tour-card",
    "tour-count",
    "tour-icon",
    "tour-title-text",
    "tour-line",
    "tour-skip",
    "tour-back",
    "tour-next",
    "tour-do",
    "btn-tour",
  ]) {
    assert.ok(pageIds.has(id), `app/index.html is missing #${id}`);
    assert.match(main, new RegExp(`"${id}"`), `main.js never touches #${id}`);
  }
  assert.match(page, /aria-modal="true"/, "the guide is a dialog and has to say so");
  assert.match(sheet, /\.tour-ring\s*\{/, "style.css has no ring to draw");
  // The keyboard route is only real if the page tells somebody about it.
  assert.match(main, /case "\?":/, "the ? shortcut is not wired");
  assert.match(page, /<kbd>\?<\/kbd> show me around/, "the shortcut list does not mention the guide");
});

test("every route out of the guide marks it seen", () => {
  // Skip, Done, Escape and the scrim all end in `closeTour`, and `closeTour` is
  // the only place that remembers. A route that closed the dialog without
  // marking it would reintroduce the page to the same person on their next
  // visit, which is the failure this feature is most likely to be hated for.
  const close = main.match(/function closeTour\(\)[\s\S]*?\n}/);
  assert.ok(close, "main.js has no closeTour");
  assert.match(close[0], /markTourSeen/, "closing the guide must remember that it ran");
  for (const wire of [
    /"tour-skip"\)\.addEventListener\("click", closeTour\)/,
    /"tour-scrim"\)\.addEventListener\("click", closeTour\)/,
  ]) {
    assert.match(main, wire, "a route out of the guide does not close it");
  }
  assert.match(main, /case "Escape":\n\s*closeTour\(\);/, "Escape must leave the guide");
});

// ---- the guide against the page it is a guide to (v1.166) ----

/**
 * Every `<section>` in the shipped page, as a start and end offset.
 *
 * Depth-matched rather than regex-matched, because this page nests sections
 * three deep (a `.switchgroup` inside the control panel inside the layout) and
 * the first `</section>` after an opening tag is not that tag's own.
 */
function sections(html) {
  const tags = /<(\/?)section\b[^>]*>/g;
  const open = [];
  const out = [];
  for (let m = tags.exec(html); m; m = tags.exec(html)) {
    if (m[1]) {
      const start = open.pop();
      if (start !== undefined) out.push({ start, end: m.index + m[0].length });
    } else {
      open.push(m.index);
    }
  }
  return out;
}

/**
 * The page's headed panels: one row per `<h2>` that lives in a `<section>`,
 * carrying the innermost section around it.
 *
 * The `<h2>` in a section is exactly `main.js`'s own rule for what goes in the
 * contents (`pageHeadings`), which is why the three `<h2>`s in the overlays —
 * the guide's own card, the postcard, the skip card — are not panels: they are
 * in `<div>`s. Two surfaces reading the page by the same rule is the point.
 */
function panels(html) {
  const boxes = sections(html);
  const out = [];
  for (const m of html.matchAll(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/g)) {
    const inside = boxes
      .filter((b) => m.index > b.start && m.index < b.end)
      .sort((a, b) => b.start - a.start)[0];
    if (!inside) continue;
    const id = m[1].match(/\bid\s*=\s*"([^"]*)"/);
    out.push({
      id: id ? id[1] : null,
      words: m[2].replace(/<[^>]*>/g, "").trim(),
      markup: html.slice(inside.start, inside.end),
    });
  }
  return out;
}

test("the panels of this page all name themselves", () => {
  // The handle `UNTOURED` is keyed by, and the one a screen reader reads out
  // when it lands inside the panel. Nine of eleven had it and two did not,
  // which is how a map keyed by it could have silently missed them.
  const found = panels(page);
  assert.ok(found.length >= 10, `only ${found.length} headed panels found — the reader is broken`);
  for (const p of found) {
    assert.ok(p.id, `the panel headed "${p.words}" has no id on its <h2> to be named by`);
  }
  const ids = found.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, "two panels share a heading id");
});

test("every headed panel is either toured or excused in writing", () => {
  // The failure this exists for: a release adds a panel, the guide says nothing
  // about it, and no test can tell — a guide pointing at six real things is not
  // lying about the seventh. Three cycles closed on that leave item before this
  // test existed. Now a new panel is a red build with a question attached.
  const found = panels(page);
  const toured = new Map();
  for (const stop of STOPS) {
    const home = found.find((p) => p.markup.includes(`id="${stop.target}"`));
    if (home) toured.set(home.id, stop.id);
  }

  for (const p of found) {
    const why = Object.prototype.hasOwnProperty.call(UNTOURED, p.id);
    assert.ok(
      toured.has(p.id) || why,
      `"${p.words}" (#${p.id}) is a panel the guide neither stops at nor explains ` +
        "walking past — add a stop, or a line to UNTOURED in src/tour.js saying why not",
    );
    assert.ok(
      !(toured.has(p.id) && why),
      `"${p.words}" (#${p.id}) is excused in UNTOURED and also ringed by stop "${toured.get(p.id)}"`,
    );
  }

  // The other direction: an excuse for a panel that is no longer here is a
  // sentence nobody will ever read and a decision nobody has to make again.
  const ids = new Set(found.map((p) => p.id));
  for (const id of Object.keys(UNTOURED)) {
    assert.ok(ids.has(id), `UNTOURED excuses #${id}, which is not a panel on this page`);
  }
  for (const [id, why] of Object.entries(UNTOURED)) {
    assert.ok(why.length > 24, `#${id} is excused with a label rather than a reason`);
  }
});

test("the guide spends its stops below the fold", () => {
  // Rule 6, as far as a test without a browser can hold it: the ring is on the
  // panels a thumb has to go looking for. Two stops are the exception and say so
  // — the pond and the line over it are the first screen, and a guide that
  // started somewhere else would be introducing a page by pointing off it.
  const FIRST_SCREEN = new Set(["pond", "now"]);
  const found = panels(page);
  for (const stop of STOPS) {
    if (FIRST_SCREEN.has(stop.id)) continue;
    const home = found.find((p) => p.markup.includes(`id="${stop.target}"`));
    const control = /^btn-/.test(stop.target);
    assert.ok(
      home || control,
      `stop "${stop.id}" rings #${stop.target}, which is neither a panel nor one of the buttons ` +
        "under the water — see rule 6: a stop is spent on what a visitor would not find alone",
    );
  }
});
