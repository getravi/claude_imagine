// reveal.test.js — the landing page's scroll reveal, and its failure modes.
//
// The reveal was six lines at the bottom of `splash.js` until v1.88 and could
// not be tested at all, which is how it went eighty-eight releases hiding 92%
// of the front door's text behind a module that builds a simulation first. The
// module takes a document and a window now, so the interesting questions are
// all askable here: does everything it watches get revealed, does an old
// browser get the page, and — the one that matters — does the watchdog survive
// a failure and get cancelled on success.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupReveal, ARMED_CLASS, FAILSAFE_KEY } from "../src/reveal.js";

/** A `[data-reveal]` element: records the classes something puts on it. */
function stubElement(name) {
  const classes = new Set();
  return { name, classes, classList: { add: (c) => classes.add(c) } };
}

/** A document holding `n` reveal elements. */
function stubDoc(n) {
  const elements = Array.from({ length: n }, (_, i) => stubElement(`band-${i}`));
  return { elements, querySelectorAll: () => elements };
}

/**
 * A window with an `IntersectionObserver` the test drives by hand, and a
 * watchdog timer parked where the page parks it.
 */
function stubWin({ observer = true, failsafe = 7 } = {}) {
  const win = { cleared: [], observed: [], unobserved: [], fire: null, options: null };
  win[FAILSAFE_KEY] = failsafe;
  win.clearTimeout = (id) => win.cleared.push(id);
  if (observer) {
    win.IntersectionObserver = class {
      constructor(cb, options) {
        win.fire = cb;
        win.options = options;
        this.observe = (el) => win.observed.push(el);
        this.unobserve = (el) => win.unobserved.push(el);
      }
    };
  }
  return win;
}

test("every element it is given is watched, and revealed when it comes into view", () => {
  const doc = stubDoc(4);
  const win = stubWin();
  assert.equal(setupReveal(doc, win), 4);
  assert.deepEqual(win.observed, doc.elements);
  for (const el of doc.elements) assert.equal(el.classes.has("in"), false, "nothing revealed yet");

  // Two scroll into view; the other two do not.
  win.fire([
    { isIntersecting: true, target: doc.elements[0] },
    { isIntersecting: false, target: doc.elements[1] },
    { isIntersecting: true, target: doc.elements[2] },
  ]);
  assert.deepEqual(
    doc.elements.map((el) => el.classes.has("in")),
    [true, false, true, false]
  );
  // And an element that has been revealed stops being watched — the reveal is a
  // one-way door, so scrolling back up must not re-run it.
  assert.deepEqual(win.unobserved, [doc.elements[0], doc.elements[2]]);
});

test("a browser with no IntersectionObserver gets the page, not the effect", () => {
  const doc = stubDoc(3);
  const win = stubWin({ observer: false });
  assert.equal(setupReveal(doc, win), 3);
  for (const el of doc.elements) assert.ok(el.classes.has("in"), "revealed immediately");
});

test("the page's watchdog is cancelled once, and only once the wiring is done", () => {
  const doc = stubDoc(2);
  const win = stubWin({ failsafe: 42 });
  setupReveal(doc, win);
  assert.deepEqual(win.cleared, [42], "the timer the page parked, cancelled");
  assert.equal(win[FAILSAFE_KEY], undefined, "and not cancellable twice");

  // A second call on the same window must not call `clearTimeout(undefined)`,
  // which would be harmless here and a lie in a test that is checking ownership.
  setupReveal(doc, win);
  assert.deepEqual(win.cleared, [42]);
});

test("a throw while wiring leaves the watchdog alone", () => {
  // The order is the whole guarantee: if this module dies half-way, the page's
  // timer is what still shows the reader the page. Simulated by an observer
  // whose constructor throws, which is the only step between entry and the
  // cancellation.
  const doc = stubDoc(2);
  const win = stubWin();
  win.IntersectionObserver = class {
    constructor() {
      throw new Error("no observer for you");
    }
  };
  assert.throws(() => setupReveal(doc, win));
  assert.deepEqual(win.cleared, [], "not cancelled");
  assert.equal(win[FAILSAFE_KEY], 7, "the page's timer is still armed");
});

test("a page with nothing to reveal still hands the watchdog back", () => {
  const win = stubWin();
  assert.equal(setupReveal({ querySelectorAll: () => [] }, win), 0);
  assert.deepEqual(win.cleared, [7]);
});

test("the observer asks for the same threshold the effect was designed around", () => {
  const win = stubWin();
  setupReveal(stubDoc(1), win);
  assert.equal(win.options.threshold, 0.12);
});

test("the names this module shares with the page are the ones the page uses", () => {
  // `ARMED_CLASS` and `FAILSAFE_KEY` are a contract with two files this module
  // cannot import — `index.html` and `splash.css`. The values are asserted here
  // and the pages are checked against them in `test/markup.test.js`, so a rename
  // in one place fails in the other.
  assert.equal(ARMED_CLASS, "js");
  assert.equal(FAILSAFE_KEY, "revealFailsafe");
});
