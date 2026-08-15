// bars.test.js — the mortality bar, the energy bar, and the state neither of
// them had ever written.
//
// `src/bars.js` is the second half of v1.97's carve: the tiles came out of
// `main.js` and these two panels were the sentence left behind. The tiles'
// finding was about the *markup* — eleven of twenty-eight placeholders
// disagreed with the world the page boots. This file asks the same question and
// gets a different answer, because these two panels are not the same shape as a
// tile.
//
// **A tile is overwritten on the first frame. These bars are not.** Both
// updaters returned early when there was no subject — no deaths yet, nothing
// spent yet — so for as long as that state lasted the shipped text *was* the
// readout. Two things follow, and this file holds both.
//
//   1. The empty state had no owner in code. `Nothing has died yet.`,
//      `rolling window` and `Nothing has been eaten yet.` existed only in
//      `app/index.html`; nothing produced them and nothing could check them.
//      That is the playbook's oldest lesson (a default needs an owner, and the
//      owner has to be provably alive) landing on a readout.
//   2. **The early return carried the previous pond into the new one.** A
//      scenario chip replaces `world`; with no deaths in the new pond,
//      `updateMortality` set one aria-label and returned, leaving the old
//      world's percentages, caption, window count, cost line, size line and
//      three segment widths on screen — 17 to 598 ticks depending on the
//      scenario, 244 on the default seed. This is v1.23's Ground readout,
//      whose lesson ("zero out the cheap case unconditionally") was written
//      about the panel one box up.
//
// The domain, stated because a sweep that does not name what it excludes
// quietly annexes it (v1.51): the row table in `src/bars.js` and the two
// `.mortality` blocks in `app/index.html`. The `width` rows are excluded from
// the markup comparison because a width is not text — but the exclusion is
// *checked* rather than asserted, by reading the stylesheet rule that renders
// an unwritten segment and confirming it agrees with what the empty state says
// (`.mort-bar i { width: 0 }`). Not the tiles above these bars, which
// `test/hud.test.js` holds; not the colours of the segments, which
// `test/palette.test.js` measures; not `index.html`, which is the splash and
// has neither bar.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { SCENARIOS } from "../src/scenarios.js";
import { stateFingerprint } from "../src/fingerprint.js";
import { BARS, EMPTY, barRows } from "../src/bars.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "app/index.html";
const html = readFileSync(join(root, PAGE), "utf8");
const css = readFileSync(join(root, "style.css"), "utf8");

/** The text and accessible names the shipped page carries for the two bars. */
function shipped() {
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const m of html.matchAll(/id="((?:mort|nrg)-[a-z]+)">([^<]*)</g)) out.set(m[1], m[2]);
  for (const m of html.matchAll(/id="((?:mort|nrg)-bar)"[^>]*aria-label="([^"]*)"/g)) {
    out.set(`${m[1]}@aria`, m[2]);
  }
  return out;
}

/** Every id the page defines inside the two `.mortality` blocks. */
function pageIds() {
  return [...html.matchAll(/id="((?:mort|nrg)-[a-z]+)"/g)].map((m) => m[1]);
}

const fresh = (over = {}) => new World(makeConfig(over));

function ran(over = {}, ticks = 600) {
  const world = fresh(over);
  for (let i = 0; i < ticks; i++) world.step();
  return world;
}

test("the table and the page agree about which elements exist", () => {
  // Both directions. A row the module writes and the page lacks throws on the
  // first frame (`$(id)` is null); an element the page carries and no row
  // writes sits at its markup forever, which is the failure this file is about
  // and is silent.
  assert.deepEqual(
    BARS.map((r) => r.id),
    pageIds(),
    "the row table and the two bars in the page must hold the same ids, in the same order"
  );
});

test("no element is written twice, and every row declares a known kind", () => {
  const ids = BARS.map((r) => `${r.id}:${r.kind}`);
  assert.equal(new Set(ids).size, ids.length);
  for (const row of BARS) {
    assert.ok(["text", "width", "aria"].includes(row.kind), `${row.id}: kind "${row.kind}"`);
    assert.ok(["mortality", "energy"].includes(row.bar), `${row.id}: bar "${row.bar}"`);
  }
});

test("the page's opening text is what the bars would say about the world it boots", () => {
  // The v1.97 claim, on the second panel. `main.js` with no hash builds
  // `new World(makeConfig({}))`, so the text the markup ships is what these
  // bars read at tick 0 — or it is wrong, and here it stays wrong for as long
  // as the pond takes to kill something.
  const world = fresh();
  const page = shipped();
  const wrong = [];
  for (const { id, kind, text } of barRows(world)) {
    if (kind === "width") continue; // see the domain note, and the test below
    const key = kind === "aria" ? `${id}@aria` : id;
    if (page.get(key) !== text) {
      wrong.push(`${key}: page says "${page.get(key)}", the world says "${text}"`);
    }
  }
  assert.deepEqual(wrong, [], `${PAGE} carries what each bar shows before the first frame`);
});

test("an unwritten segment renders the width the empty state claims", () => {
  // The one exclusion this file makes, closed rather than declared. Widths are
  // not text and cannot be compared to the markup, so the page's opening bar is
  // whatever the stylesheet gives an `<i>` with no inline width — and the empty
  // state says every segment is `0%`.
  assert.match(
    css,
    /\.mort-bar i \{[^}]*\bwidth: 0\b/,
    "style.css must render an unwritten bar segment at zero width"
  );
  for (const { kind, text } of barRows(fresh())) {
    if (kind === "width") assert.equal(text, "0%");
  }
});

test("every row reads a string in a world with no subject at all", () => {
  // The bug in one assertion. Before this release six of these eight mortality
  // rows were simply not written when `mortality()` returned null, so "what
  // does this bar say about a pond that has not killed anything?" had no answer
  // in code — only in the markup, and only until some other pond wrote over it.
  const world = fresh();
  assert.equal(world.stats.mortality(), null, "a fresh pond has no deaths");
  assert.equal(world.energy.shares(), null, "a fresh pond has spent nothing");
  for (const { id, kind, text } of barRows(world)) {
    assert.equal(typeof text, "string", `${id} did not read a string`);
    assert.ok(!/undefined|NaN/.test(text), `${id} reads "${text}"`);
    if (kind === "width") assert.match(text, /^\d+%$/, `${id} reads "${text}"`);
  }
  const byId = new Map(barRows(world).map((r) => [r.id, r.text]));
  assert.equal(byId.get("mort-legend"), EMPTY.mortalityLegend);
  assert.equal(byId.get("mort-window"), EMPTY.mortalityWindow);
  assert.equal(byId.get("mort-bar"), EMPTY.mortalityAria);
  assert.equal(byId.get("nrg-legend"), EMPTY.energy);
  assert.equal(byId.get("nrg-bar"), EMPTY.energy);
  // The two run-to-date lines stay blank rather than printing a zero mix: a
  // delta out of nothing invites being read as "no selection" (v1.64).
  assert.equal(byId.get("mort-cost"), "");
  assert.equal(byId.get("mort-size"), "");
});

// Pin the failure, not only the fix (v1.24). The stale bar is the finding, and
// the shape of the bug was "a new world reads like the old one".
test("a new pond overwrites every element the pond before it wrote", () => {
  // A visitor pressing a scenario chip is exactly this: the same elements, a
  // different world. The adapter in `main.js` is one loop over `barRows`, so
  // standing in for it here is a Map — and the claim is that after the second
  // world is written, nothing in it is left over from the first.
  /** @type {Map<string, string>} */
  const dom = new Map();
  const write = (world) => {
    for (const { id, kind, text } of barRows(world)) dom.set(`${id}:${kind}`, text);
  };

  const old = ran({}, 3000);
  write(old);
  assert.notEqual(dom.get("mort-legend:text"), EMPTY.mortalityLegend, "nothing died in 3,000 ticks");
  const stale = new Map(dom);

  const next = fresh(SCENARIOS[0].over);
  assert.equal(next.stats.mortality(), null, "the pond that replaces it has killed nothing yet");
  write(next);

  const expected = new Map(barRows(next).map((r) => [`${r.id}:${r.kind}`, r.text]));
  assert.deepEqual([...dom].sort(), [...expected].sort(), "an element survived the world it described");
  // And the two ponds really did disagree, or the assertion above proves
  // nothing. Eleven of the fourteen do; the three that coincide are all segment
  // widths that are honestly `0%` in both worlds (old age in a 3,000-tick pond,
  // and the two thin energy sinks), which is a collision rather than a leak.
  const moved = [...expected].filter(([k, v]) => stale.get(k) !== v);
  assert.ok(moved.length >= 11, `only ${moved.length} of ${expected.size} rows differ between the ponds`);
});

test("the empty state lasts long enough to be seen", () => {
  // The size of the bug, kept as a number so it cannot quietly become "an
  // instant". At one step per frame these are 0.3 to 10 seconds of a bar that
  // looks live. A scenario whose first death came on tick 0 would make the
  // regression untestable, which is the reason to assert the floor.
  const delays = SCENARIOS.map((s) => {
    const world = fresh(s.over);
    let t = 0;
    while (world.stats.mortality() === null && t < 2000) {
      world.step();
      t++;
    }
    return t;
  });
  assert.ok(Math.min(...delays) >= 10, `earliest first death: tick ${Math.min(...delays)}`);
  assert.ok(Math.max(...delays) >= 300, `latest first death: tick ${Math.max(...delays)}`);
});

test("the bars are a pure reading of the world", () => {
  // Directive 2. Neither bar samples, so this is weaker than the tiles' version
  // — which is the point: it should be exactly zero, and a row that ever drew a
  // random number would show up here on the first read.
  const world = ran({}, 200);
  const before = stateFingerprint(world);
  for (let i = 0; i < 10; i++) barRows(world);
  assert.equal(stateFingerprint(world), before, "reading the bars perturbed the world");
  assert.deepEqual(barRows(world), barRows(world), "two reads of one world disagree");
});

test("every row reads a non-empty string in a pond that has been running", () => {
  // Except the two that are allowed to be blank, and only while their cause has
  // no bodies in it. A formatter that threw or returned undefined here would
  // print "undefined" into the panel and nothing would fail.
  const world = ran({ predation: true, scavenging: true }, 900);
  for (const { id, text } of barRows(world)) {
    assert.equal(typeof text, "string", `${id} did not read a string`);
    assert.ok(!/undefined|NaN/.test(text), `${id} reads "${text}"`);
    if (id !== "mort-cost" && id !== "mort-size") assert.ok(text.length > 0, `${id} read empty`);
  }
});

test("the bar and its caption are drawn from the same integers, and they sum to 100", () => {
  // v1.26's rule, which matters more on these two bars than anywhere else on
  // the page: one segment is normally around 90% and the eye has nothing else
  // to check the arithmetic against. Assert it on both bars, in every world
  // that has a mix at all.
  for (const seed of [1, 42, 314, 2024]) {
    const world = ran({ seed }, 800);
    const rows = new Map(barRows(world).map((r) => [`${r.id}:${r.kind}`, r.text]));
    for (const [bar, segments, caption] of [
      ["mort", ["mort-starve", "mort-age", "mort-pred"], "mort-legend"],
      ["nrg", ["nrg-metabolism", "nrg-waste", "nrg-buried"], "nrg-legend"],
    ]) {
      const widths = segments.map((id) => parseInt(rows.get(`${id}:width`), 10));
      assert.equal(widths.reduce((a, b) => a + b, 0), 100, `${bar} widths sum (seed ${seed})`);
      const spoken = [...rows.get(`${caption}:text`).matchAll(/(\d+)%/g)].map((m) => +m[1]);
      assert.deepEqual(spoken, widths, `${bar} caption and widths disagree (seed ${seed})`);
    }
  }
});
