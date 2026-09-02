// tour.test.js — the guide, and the four ways a guide goes wrong.
//
// A tour is the one feature on this page whose subject is the page itself, and
// that is the whole of its risk. Everything else here is checked against the
// world: a headline is wrong if the pond disagrees with it, a record is wrong if
// the animals disagree with it. A tour is wrong if the *document* disagrees with
// it, and the document is edited by hand, so nothing but a test can notice.
//
// Four failures, in the order they are likely:
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

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  STOPS,
  TOUR_ACTS,
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
  // one animal, then other worlds, then a year going past in three seconds. The
  // last stop is the call to action and is the reason anybody stays.
  assert.deepEqual(
    STOPS.map((s) => s.id),
    ["pond", "now", "read", "meet", "worlds", "skip"],
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
