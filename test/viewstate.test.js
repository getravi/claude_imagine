// viewstate.test.js — the caches that describe one pond, and the reset that
// cannot miss one.
//
// v1.98 left the sweep: *which surfaces are written conditionally and therefore
// survive a world they no longer describe?* `src/viewstate.js` carries the
// answer in prose; what this file pins is the mechanism and, in the v1.25
// habit, the two failures it replaces.
//
// Three kinds of assertion here, and the third is the one that keeps this
// closed. The roster is walked in both directions, so a name added to one side
// cannot go missing from the other (v1.97's rule for the tiles). The reset is
// walked against a perturbed object rather than a hand-picked field or two,
// which is `statesweep.js`'s method applied to the observer instead of to the
// world. And the *page* is read: `src/main.js` is the file this module exists
// to disarm, so the test scans the shipped source for a top-level binding that
// belongs to neither list, and for any of the nineteen names growing a private
// declaration again. A roster nothing compares to the code is a second copy of
// the code.
//
// `main.js` still cannot be executed here — it wants a DOM — so a stand-in
// stands for the renderer exactly as v1.98's Map stood in for the page.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { ViewState, WORLD_SCOPED, PAGE_SCOPED } from "../src/viewstate.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAIN = readFileSync(join(ROOT, "src/main.js"), "utf8");
const MODULE = readFileSync(join(ROOT, "src/viewstate.js"), "utf8");

/** A renderer's three references into the world, plus the trail it draws. */
function stubRenderer() {
  return {
    selected: { id: 7 },
    highlightSpeciesId: 3,
    camera: {
      target: { id: 7 },
      setTarget(c) {
        this.target = c || null;
      },
    },
    trail: {
      cleared: 0,
      clear() {
        this.cleared++;
      },
    },
  };
}

/** Everything the roster names, set to something no fresh state holds. */
function scribbleOn(view) {
  for (const key of WORLD_SCOPED) view[key] = Array.isArray(view[key]) ? ["stale"] : "stale";
  return view;
}

test("the roster and the object agree in both directions", () => {
  const view = new ViewState();
  for (const key of WORLD_SCOPED) {
    assert.ok(key in view, `${key} is named in WORLD_SCOPED and is not a field`);
  }
  const owned = Object.keys(view).filter((k) => k !== "world");
  assert.deepEqual(owned.sort(), [...WORLD_SCOPED].sort());
  assert.equal(new Set(WORLD_SCOPED).size, WORLD_SCOPED.length, "no name twice");
});

test("reset restores every field, not the ones I would have thought of", () => {
  const view = scribbleOn(new ViewState());
  view.reset();
  const fresh = new ViewState();
  for (const key of WORLD_SCOPED) {
    assert.deepEqual(view[key], fresh[key], `${key} survived a reset`);
  }
});

test("an array field is a new array every time", () => {
  // Two ponds sharing one array of DOM elements is the shape this class exists
  // to make unrepresentable, so the roster's own value must never be handed out.
  const arrays = WORLD_SCOPED.filter((k) => Array.isArray(new ViewState()[k]));
  assert.ok(arrays.length >= 2, "the DOM-element caches are still arrays");
  const a = new ViewState();
  const b = new ViewState();
  for (const key of arrays) {
    assert.notEqual(a[key], b[key], `${key} is shared between two states`);
    const before = a[key];
    a.reset();
    assert.notEqual(a[key], before, `${key} is the same array after a reset`);
  }
});

test("adopt is keyed on the world's identity, not on its seed or its tick", () => {
  const view = new ViewState();
  const pond = { seed: 314, tick: 0 };
  assert.equal(view.adopt(pond, stubRenderer()), true, "a first pond is new");
  assert.equal(view.adopt(pond, stubRenderer()), false, "the same object is not");
  // A world rebuilt on the same seed is a different pond, which is exactly what
  // the seed box does — so a key made of seeds would have missed it.
  assert.equal(view.adopt({ seed: 314, tick: 0 }, stubRenderer()), true);
});

test("adopting a new pond clears every cache the old one filled", () => {
  const view = new ViewState();
  view.adopt({}, stubRenderer());
  scribbleOn(view);
  view.adopt({}, stubRenderer());
  const fresh = new ViewState();
  for (const key of WORLD_SCOPED) {
    assert.deepEqual(view[key], fresh[key], `${key} outlived its pond`);
  }
});

test("adopting a new pond releases the camera, the selection and the highlight", () => {
  // The v1.99 bug, pinned as a failure rather than as a fix (v1.25): all three
  // world-replacement paths in `main.js` cleared `selected`, and none of them
  // touched `camera.target` — so the camera went on following a body from a
  // pond that no longer existed, and since nothing steps that body it never
  // died and the camera was never released.
  const view = new ViewState();
  const renderer = stubRenderer();
  assert.equal(renderer.camera.target.id, 7, "the stub is following someone");

  view.adopt({}, renderer);
  assert.equal(renderer.selected, null);
  assert.equal(renderer.highlightSpeciesId, null);
  assert.equal(renderer.camera.target, null, "the camera outlived its pond");
  assert.equal(renderer.trail.cleared, 1, "the path spliced two lives into one line");

  // And the same pond a second time changes nothing, so a frame cannot steal a
  // selection a visitor just made.
  const pond = {};
  view.adopt(pond, renderer);
  renderer.selected = { id: 2 };
  assert.equal(view.adopt(pond, renderer), false);
  assert.deepEqual(renderer.selected, { id: 2 });
});

test("adopt survives a renderer with no trail", () => {
  const renderer = stubRenderer();
  renderer.trail = null;
  assert.doesNotThrow(() => new ViewState().adopt({}, renderer));
});

test("every top-level binding in main.js is classified, both ways", () => {
  // The domain, named because a sweep that does not say what it excludes
  // annexes it (v1.51): bindings at column zero in `src/main.js`. A `const` at
  // that indentation is either an import, a frozen constant or the view state
  // itself — none of which can go stale — so what has to be accounted for is
  // every `let`, which is the file's mutable module state.
  const declared = [...MAIN.matchAll(/^let (\w+)/gm)].map((m) => m[1]);
  assert.ok(declared.length > 5, "the scan found main.js");
  const page = Object.keys(PAGE_SCOPED);
  for (const name of declared) {
    assert.ok(page.includes(name), `main.js declares \`${name}\` and no list explains it`);
  }
  for (const name of page) {
    assert.ok(declared.includes(name), `PAGE_SCOPED names \`${name}\`, which main.js no longer has`);
  }
  for (const [name, reason] of Object.entries(PAGE_SCOPED)) {
    assert.ok(reason.length > 12, `\`${name}\` is excused by too few words to read`);
  }
});

test("no world-scoped name has a private declaration in main.js", () => {
  for (const name of WORLD_SCOPED) {
    const decl = new RegExp(`(?:let|const|var)\\s+${name}\\b`);
    assert.ok(!decl.test(MAIN), `\`${name}\` has grown a second home in main.js`);
  }
});

test("every world-scoped name in main.js is reached through the owner", () => {
  // Comments are stripped first, so a name mentioned in prose is not a failure
  // — this is a claim about the code. That is the one hole in the scan and it
  // is named here rather than left to be discovered.
  const code = MAIN.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  for (const name of WORLD_SCOPED) {
    for (const m of code.matchAll(new RegExp(`\\b${name}\\b`, "g"))) {
      const before = code.slice(Math.max(0, m.index - 5), m.index);
      assert.ok(before.endsWith("view."), `\`${name}\` is used bare at index ${m.index}`);
    }
  }
});

test("main.js has exactly one reset, and it runs before the frame", () => {
  assert.equal((MAIN.match(/view\.adopt\(/g) || []).length, 1, "one door into a new world");
  const loop = MAIN.slice(MAIN.indexOf("function loop(now)"));
  const adopt = loop.indexOf("adoptWorld()");
  const step = loop.indexOf("world.step()");
  assert.ok(adopt >= 0 && adopt < step, "the frame steps a pond before it adopts it");
});

test("the view state is a pure observer", () => {
  // No imports at all, so nothing here can reach the simulation, draw a random
  // number or move a pond. The determinism claim is structural rather than
  // measured, which is the cheapest way to hold one (v1.29's exact no-op).
  assert.equal(/^\s*import\s/m.test(MODULE), false, "viewstate.js imports something");
});
