// hud.test.js — the panel's twenty-eight tiles, and the values the page ships
// with before any of them has been written.
//
// `src/hud.js` exists because of a sentence that has been in `AUTONOMOUS.md`
// since v1.40: **`main.js` remains the last module with no test of any kind**,
// and the panels are what is left. Every other figure was carved out and swept
// within a release or two of the carving — and every one of those sweeps found
// something, which is the reason to keep doing it rather than to declare the
// remaining module fine.
//
// This file asks three questions of the tiles. Two of them are the ones any
// carve-out asks: does the panel agree with the page about which tiles exist,
// and does a tile whose rule is switched off say so. The third is the one that
// could not be asked before, and it is about the *markup* rather than about the
// module.
//
// **A placeholder is a claim about the pond the visitor is about to see.** The
// twenty-eight `<dd>`s in `app/index.html` carry hand-typed text, and until this
// release nothing had ever compared it to anything. Eleven of them disagreed
// with the world the page boots, and the disagreement was not uniform: five were
// strings the tile's own formatter cannot produce (`0` for a value printed with
// three decimals, `0` for one that is always signed), three were seed-dependent
// numbers frozen at zero, and **three said `off` about a rule that is on by
// default** — Refuge and Safe under `predation`, Lag under `seasons`. That last
// group is the one worth the release. A stale number is a number; a `off` is a
// statement about the rules of the world, printed in the place a reader looks
// first, and it is false for every visitor who arrives without a permalink.
//
// The playbook's oldest lesson is the one that applies: *what does this look
// like if the script never arrives?* If the answer is "the same as if it
// arrived and did nothing", it is safe. It was not — it was a row of zeros and
// three switched-off rules. It is now the true opening still of the default
// world, derived here rather than typed there.
//
// The domain, stated because a sweep that does not name what it excludes
// quietly annexes it (v1.51): the tile table in `src/hud.js` and the `stat-*`
// definition list in `app/index.html`. Not `index.html`, which is the splash
// and has no tiles; not the mortality bar, the energy bar or the three figures,
// which are drawn rather than written and are swept by `test/chart.test.js`,
// `test/mullerplot.test.js` and `test/render.test.js`; and not the *labels* in
// the `<dt>`s, which name a tile rather than state a value.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { World } from "../src/world.js";
import { makeConfig, DEFAULT_CONFIG } from "../src/config.js";
import { RNG } from "../src/rng.js";
import { stateFingerprint } from "../src/fingerprint.js";
import { TILES, hudTiles, blankOf, isLive, UI_RNG_SEED } from "../src/hud.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "app/index.html";
const html = readFileSync(join(root, PAGE), "utf8");

/** The `stat-*` cells the shipped page defines, in document order, with their text. */
function placeholders() {
  const out = [];
  for (const m of html.matchAll(/id="(stat-[a-z]+)">([^<]*)</g)) out.push({ id: m[1], text: m[2] });
  return out;
}

/** A world exactly as `main.js` builds it with no permalink, and the panel's own stream. */
function freshPanel(overrides = {}) {
  const config = makeConfig(overrides);
  const world = new World(config);
  return { world, config, tiles: hudTiles({ world, config, fps: 0, uiRng: new RNG(UI_RNG_SEED) }) };
}

test("the panel and the page agree about which tiles exist", () => {
  // Both directions. A tile the module writes and the page lacks would throw on
  // the first frame (`$(id)` is null); a tile the page carries and the module
  // never writes would sit at its placeholder forever, which is precisely the
  // failure this file is about and is *silent*.
  assert.deepEqual(
    TILES.map((t) => t.id),
    placeholders().map((p) => p.id),
    "the tile table and the page's definition list must hold the same ids, in the same order"
  );
});

test("no tile is declared twice", () => {
  const ids = TILES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("the page's opening values are what the panel would say about the world it boots", () => {
  // The claim, and the whole reason this file exists. `main.js` with no hash
  // builds `new World(makeConfig({}))` and draws its first frame from it, so
  // the text the markup ships is a still of that world at tick 0 — or it is
  // wrong, and wrong in a way no browser tab is open long enough to show.
  const { tiles } = freshPanel();
  const page = new Map(placeholders().map((p) => [p.id, p.text]));
  const wrong = tiles.filter((t) => page.get(t.id) !== t.text);
  assert.deepEqual(
    wrong.map((t) => `${t.id}: page says "${page.get(t.id)}", the world says "${t.text}"`),
    [],
    `${PAGE} carries the value each tile shows before the first frame`
  );
});

test("a gated tile says a word, and it is the word the table declares", () => {
  // Every flag off. Each gated tile must read its blank exactly — not a zero
  // wearing a percent sign, which is v1.89's rule and the reason the blank is a
  // field rather than a formatting decision inside each reader.
  const allOff = Object.fromEntries(
    Object.keys(DEFAULT_CONFIG)
      .filter((k) => typeof DEFAULT_CONFIG[k] === "boolean")
      .map((k) => [k, false])
  );
  const { config, tiles } = freshPanel(allOff);
  const text = new Map(tiles.map((t) => [t.id, t.text]));
  for (const tile of TILES) {
    if (!tile.gate) continue;
    assert.equal(isLive(tile, config), false, `${tile.id}: every flag is off`);
    assert.equal(text.get(tile.id), blankOf(tile), `${tile.id} must read its blank word`);
  }
});

test("every gate names a flag that exists and is off by default or on by default", () => {
  // A gate on a key `DEFAULT_CONFIG` does not hold is a tile that is blank
  // forever and looks exactly like a rule nobody switched on — the silent
  // failure again, one level down.
  for (const tile of TILES) {
    for (const flag of tile.gate ?? []) {
      assert.equal(
        typeof DEFAULT_CONFIG[flag],
        "boolean",
        `${tile.id} is gated on "${flag}", which is not a boolean in DEFAULT_CONFIG`
      );
    }
  }
});

test("switching a tile's rule on takes it off its blank word", () => {
  // The other direction of the gate: a tile that reads "off" in both arms is a
  // readout of nothing, and three of the tiles here (Kin, Safe, Jostled) have a
  // reading that can legitimately be a word, so "not the blank" is the strongest
  // check that holds for all of them.
  for (const tile of TILES) {
    if (!tile.gate) continue;
    const on = Object.fromEntries(tile.gate.map((f) => [f, true]));
    const { config, tiles } = freshPanel(on);
    assert.equal(isLive(tile, config), true, `${tile.id}: its own flags are set`);
    const text = tiles.find((t) => t.id === tile.id).text;
    assert.notEqual(text, blankOf(tile), `${tile.id} still reads "${blankOf(tile)}" with its rule on`);
    assert.ok(text.length > 0, `${tile.id} reads empty`);
  }
});

test("reading the panel does not move the pond", () => {
  // Directive 2, on the one surface that samples. Diversity draws from a random
  // stream, and if that stream were the world's then opening the page would
  // change the world it shows — an observer that alters what it observes is not
  // an observer (v1.33). Ten reads, one fingerprint.
  const config = makeConfig({});
  const world = new World(config);
  for (let i = 0; i < 200; i++) world.step();
  const before = stateFingerprint(world);
  const uiRng = new RNG(UI_RNG_SEED);
  for (let i = 0; i < 10; i++) hudTiles({ world, config, fps: 60, uiRng });
  assert.equal(stateFingerprint(world), before, "reading the tiles perturbed the world");
});

test("the panel is a function of the world, the config and the stream", () => {
  // Same seed, same everything: the tiles are a pure reading, so two runs of the
  // same world give the same panel. This is what lets the page's opening values
  // be checked at all.
  const a = freshPanel();
  const b = freshPanel();
  assert.deepEqual(a.tiles, b.tiles);
});

test("every tile reads a non-empty string in a pond that has been running", () => {
  // A formatter that throws or returns undefined on a live world would show
  // "undefined" in an 80-pixel column and nothing would fail. Run all the flags
  // on, so every reader is exercised rather than only the default half.
  const flags = Object.fromEntries(
    Object.keys(DEFAULT_CONFIG)
      .filter((k) => typeof DEFAULT_CONFIG[k] === "boolean")
      .map((k) => [k, true])
  );
  const config = makeConfig(flags);
  const world = new World(config);
  for (let i = 0; i < 600; i++) world.step();
  const uiRng = new RNG(UI_RNG_SEED);
  for (const { id, text } of hudTiles({ world, config, fps: 59.4, uiRng })) {
    assert.equal(typeof text, "string", `${id} did not read a string`);
    assert.ok(text.length > 0, `${id} read empty`);
    assert.ok(!/undefined|NaN/.test(text), `${id} reads "${text}"`);
  }
});

// Pin the failure, not only the fix (v1.24). The three placeholders that said a
// rule was off while the rule was on are the finding; fed back in, they must
// come out as failures rather than as no match.
test("the drift this was written for would be caught", () => {
  const { tiles } = freshPanel();
  const text = new Map(tiles.map((t) => [t.id, t.text]));
  for (const id of ["stat-refuge", "stat-safe", "stat-lag"]) {
    assert.notEqual(text.get(id), "off", `${id} reads "off" in the world the page boots`);
  }
  // And the five whose old placeholder was a string the formatter cannot make.
  assert.match(text.get("stat-div"), /^\d+\.\d{3}$/);
  assert.match(text.get("stat-carn"), /^\d+ \(\d+%\)$/);
  assert.match(text.get("stat-power"), /^-?\d+\.\d\/t$/);
  assert.match(text.get("stat-biome"), /^[+−]\d+%$/);
  assert.equal(text.get("stat-learn"), "off");
});
