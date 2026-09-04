// simpleview.test.js — the switch that decides how much page there is (v1.149).
//
// Two halves, and the second is the one that will catch something.
//
// The first is the module: a preference that has to survive a storage which
// throws, a label that has to say what pressing it does rather than what state
// it is in, and a note assembled from two counts it does not hold. Small, and
// checkable exhaustively.
//
// The second is the shipped page, read back as text the way `markup.test.js`
// and `tour.test.js` read it. A switch is a promise about a document, and every
// way this feature can be wrong is a disagreement between the two: a surface
// named here that the page does not carry, a `data-expert` in the page that
// nobody decided about, and — the one that would actually hurt a visitor — a
// tour stop ringing something the switch has hidden. That last one is not
// hypothetical arithmetic: the guide opens itself on a first visit, a first
// visit is the visit that starts Simple, and a ring drawn around a
// `display: none` element is a ring at the top-left corner of the window
// pointing at nothing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  EXPERT_ATTR,
  INSTRUMENT,
  INSTRUMENT_ORDER,
  SIMPLE_CLASS,
  SIMPLE_KEY,
  prefersSimple,
  rememberSimple,
  switchLabel,
  switchNote,
  switchTitle,
} from "../src/simpleview.js";
import { STOPS } from "../src/tour.js";
import { HIT_RULES, TARGET_MIN, declaredMinHeight } from "../src/targetsize.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const page = read("app/index.html");
const css = read("style.css");

/** A `localStorage` stand-in; `blind` is the browser that blocks site data. */
function store(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    seen: map,
  };
}
const blind = {
  getItem() {
    throw new Error("site data blocked");
  },
  setItem() {
    throw new Error("site data blocked");
  },
};

/**
 * The source of one `data-expert` region, by tag depth.
 *
 * A scanner rather than a parser, for `markup.test.js`'s stated reason: this
 * suite has no DOM. It is exact enough for the only question asked of it —
 * *what is inside this box* — because every region here is opened by a single
 * tag whose name the scanner then balances.
 */
function region(key) {
  const open = new RegExp(`<(\\w+)[^>]*\\b${EXPERT_ATTR}="${key}"[^>]*>`);
  const m = page.match(open);
  if (!m) return null;
  const tag = m[1];
  const re = new RegExp(`</?${tag}\\b`, "g");
  re.lastIndex = m.index + m[0].length;
  let depth = 1;
  for (let x = re.exec(page); x; x = re.exec(page)) {
    depth += x[0][1] === "/" ? -1 : 1;
    if (depth === 0) return page.slice(m.index, x.index);
  }
  return null;
}

// ---- the preference ----

test("a visitor this browser has never met starts on the quiet page", () => {
  assert.equal(prefersSimple(store()), true, "no stored answer is a newcomer");
  assert.equal(prefersSimple(null), true, "no storage at all is a newcomer");
  assert.equal(prefersSimple(blind), true, "a store that throws is a newcomer");
});

test("a visitor who pressed the switch gets back what they pressed, both ways", () => {
  const s = store();
  rememberSimple(s, false);
  assert.equal(prefersSimple(s), false, "chose the instruments");
  rememberSimple(s, true);
  assert.equal(prefersSimple(s), true, "chose the pond");
});

test("the key records a choice, not an event — so it must be able to say 'no'", () => {
  // The reason this is not `vivarium.tour.seen`'s shape. A flag that can only be
  // set would read a returning expert's blank slot as a preference every time.
  const s = store();
  rememberSimple(s, false);
  assert.equal(s.seen.get(SIMPLE_KEY), "0");
  rememberSimple(s, true);
  assert.equal(s.seen.get(SIMPLE_KEY), "1");
});

test("neither half throws on a browser that blocks site data", () => {
  assert.doesNotThrow(() => rememberSimple(blind, true));
  assert.doesNotThrow(() => prefersSimple(blind));
  assert.doesNotThrow(() => rememberSimple(null, false));
});

// ---- the words ----

test("the label says what pressing it will do, never which side you are on", () => {
  assert.match(switchLabel(true), /Everything/);
  assert.match(switchLabel(false), /Simple/);
  assert.notEqual(switchLabel(true), switchLabel(false));
});

test("the note under the label counts what is behind the door", () => {
  assert.equal(switchNote(true, { controls: 34, figures: 5 }), "34 dials · 5 figures");
  assert.equal(switchNote(true, { controls: 1, figures: 1 }), "1 dial · 1 figure");
  assert.equal(switchNote(true, { controls: 4, figures: 0 }), "4 dials");
  // Zero behind the door is a sentence, not an advertisement for an empty room.
  assert.equal(switchNote(true, { controls: 0, figures: 0 }), "nothing to show");
  assert.equal(switchNote(true), "nothing to show", "a missing tally is not a crash");
});

test("the other side of the switch describes the page rather than counting it", () => {
  assert.doesNotMatch(switchNote(false, { controls: 34, figures: 5 }), /\d/);
});

test("the tooltip is assembled from the list, so a new surface cannot be left out of it", () => {
  const title = switchTitle(true);
  for (const key of INSTRUMENT_ORDER) {
    if (key === "hint-charts") continue; // a fragment of a hint line, not a surface
    assert.ok(title.includes(INSTRUMENT[key]), `the tooltip never names ${key}`);
  }
  assert.match(switchTitle(false), /pond/);
});

// ---- the page ----

test("every surface the switch names is on the page exactly once", () => {
  for (const key of INSTRUMENT_ORDER) {
    const hits = [...page.matchAll(new RegExp(`\\b${EXPERT_ATTR}="${key}"`, "g"))];
    assert.equal(hits.length, 1, `${EXPERT_ATTR}="${key}" appears ${hits.length} times`);
  }
});

test("every marked surface on the page is one somebody decided about", () => {
  const marked = [...page.matchAll(new RegExp(`\\b${EXPERT_ATTR}="([^"]*)"`, "g"))].map(
    (m) => m[1]
  );
  assert.ok(marked.length > 0, "the page carries no instruments at all");
  for (const key of marked) {
    assert.ok(key in INSTRUMENT, `the page hides "${key}", which simpleview.js has never heard of`);
  }
  assert.deepEqual(
    [...marked].sort(),
    [...INSTRUMENT_ORDER].sort(),
    "the list and the page disagree about what is behind the switch"
  );
});

test("the list and the order are the same set", () => {
  assert.deepEqual(Object.keys(INSTRUMENT).sort(), [...INSTRUMENT_ORDER].sort());
  for (const [key, what] of Object.entries(INSTRUMENT)) {
    assert.ok(what.length > 8, `${key}: a description, not a label`);
  }
});

test("no tour stop rings something the switch has hidden", () => {
  // The guide opens itself on a first visit; a first visit is a Simple one.
  const boxes = INSTRUMENT_ORDER.map((k) => region(k)).filter(Boolean);
  assert.equal(boxes.length, INSTRUMENT_ORDER.length, "a region would not close");
  for (const stop of STOPS) {
    for (const box of boxes) {
      assert.ok(
        !box.includes(`id="${stop.target}"`),
        `tour stop "${stop.id}" rings #${stop.target}, which Simple view hides`
      );
    }
  }
});

test("the stylesheet actually folds the marked surfaces away", () => {
  assert.match(
    css,
    new RegExp(`body\\.${SIMPLE_CLASS}\\s*\\[${EXPERT_ATTR}\\]\\s*\\{[^}]*display:\\s*none`),
    "style.css has no rule that hides an instrument"
  );
});

test("the switch clears the thumb bar by size rather than by luck", () => {
  assert.equal(HIT_RULES[".viewswitch"], TARGET_MIN);
  assert.ok(declaredMinHeight(css, ".viewswitch") >= TARGET_MIN);
});

test("the switch's own controls are on the page and are not behind it", () => {
  for (const id of ["btn-simple", "simple-label", "simple-note"]) {
    assert.ok(page.includes(`id="${id}"`), `app/index.html is missing #${id}`);
  }
  for (const key of INSTRUMENT_ORDER) {
    assert.ok(!region(key).includes('id="btn-simple"'), "the switch cannot hide itself");
  }
});

test("a shortcut may outlive its control, but not its effect", () => {
  // `H` cycles a chart between the recent window and the whole run. In Simple
  // there is no chart, so the fragment offering it goes with them — while `V`,
  // `N` and the zoom keys stay, because what they do happens in the water.
  const hint = region("hint-charts");
  assert.ok(hint, "the hint fragment is not marked");
  assert.match(hint, /<kbd>H<\/kbd>/);
  const rest = page.replace(hint, "");
  for (const key of ["V", "N", "0"]) {
    assert.ok(rest.includes(`<kbd>${key}</kbd>`), `the ${key} shortcut went behind the switch`);
  }
});

test("the module is a pure observer — no DOM, no world, no random numbers", () => {
  const src = read("src/simpleview.js");
  assert.doesNotMatch(src, /\b(document|window)\s*\./, "the words do not need a page");
  assert.doesNotMatch(src, /^import /m, "words and a list, nothing else");
  assert.doesNotMatch(src, /Math\.random|new Rng|rng\./, "an observer draws no random numbers");
});
