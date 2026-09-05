// worlds.test.js — the thirteen worlds, and whether the page says what they are.
//
// The release this file was written for (v1.154) is a wording release, so most
// of what is asserted here is about *sentences*: that every world has one, that
// it fits the line it has to fit, and that nothing about the page has quietly
// gone back to hiding them in a tooltip. The one behavioural rule is the lamp:
// which chip is lit follows from the config and not from the last press.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SCENARIOS } from "../src/scenarios.js";
import { makeConfig } from "../src/config.js";
import {
  HOOK_MAX,
  HOME_HOOK,
  CUSTOM_HOOK,
  worldsLabel,
  matchScenario,
  sameConfig,
  worldCaption,
  previewCaption,
  captionText,
} from "../src/worlds.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

test("every world has a hook, and it fits the one line it is given", () => {
  for (const s of SCENARIOS) {
    assert.ok(typeof s.hook === "string" && s.hook.length > 0, `${s.id} has no hook`);
    // The budget is a layout fact, not a taste one — see `HOOK_MAX`. A hook over
    // it wraps the caption to two lines at 390 px, and a caption that grows when
    // the pointer moves pushes the pond down the page under a moving hand.
    assert.ok(
      s.hook.length <= HOOK_MAX,
      `${s.id}'s hook is ${s.hook.length} characters, over the ${HOOK_MAX} the caption can hold: "${s.hook}"`
    );
  }
  // The two captions for a pond that is not one of the thirteen live under the
  // same roof and therefore under the same budget.
  for (const [name, hook] of [
    ["HOME_HOOK", HOME_HOOK],
    ["CUSTOM_HOOK", CUSTOM_HOOK],
  ]) {
    assert.ok(hook.length <= HOOK_MAX, `${name} is over the ${HOOK_MAX}-character budget`);
  }
});

test("a hook is a promise, not a summary of the blurb", () => {
  const seen = new Set();
  for (const s of SCENARIOS) {
    // Distinct, or two chips make the same offer and one of them is wrong.
    assert.ok(!seen.has(s.hook), `two worlds share a hook: "${s.hook}"`);
    seen.add(s.hook);
    // No full stop: this is a caption in a strip, not a sentence in a paragraph,
    // and the blurb it stands in front of is the one with the punctuation.
    assert.ok(!s.hook.endsWith("."), `${s.id}'s hook should not end in a full stop`);
    // Lower case start, for the same reason — it reads as a label beside the
    // name on the chip rather than as a second sentence competing with it.
    assert.equal(
      s.hook[0],
      s.hook[0].toLowerCase(),
      `${s.id}'s hook should begin in lower case`
    );
    // And it is not the blurb with the end chopped off. The whole point of the
    // pair is that one is written for a line and the other for a banner.
    assert.notEqual(s.hook, s.blurb.slice(0, s.hook.length), `${s.id}'s hook is a truncated blurb`);
  }
});

test("the world you are in is read off the config, not off the last press", () => {
  // Every scenario recognises itself.
  for (const s of SCENARIOS) {
    const matched = matchScenario(makeConfig(s.over));
    assert.ok(matched, `${s.id} does not recognise its own world`);
    assert.equal(matched.id, s.id, `${s.id}'s config matched ${matched.id}`);
  }
  // The pond the page opens on is none of them, and says its own thing.
  const home = worldCaption(makeConfig({}));
  assert.equal(home.id, null, "the default pond should not match a scenario");
  assert.equal(home.hook, HOME_HOOK);
  // Move one thing and you are somewhere else — this is the case the old
  // press-driven lamp got wrong, left glowing over a world it did not describe.
  const moved = worldCaption(makeConfig({ ...SCENARIOS[4].over, seed: 999 }));
  assert.equal(moved.id, null, "a scenario with a different seed is not that scenario");
  assert.equal(moved.hook, CUSTOM_HOOK);
  // But rebuilding the same world (what `↻ Reset` does) keeps the lamp on.
  const again = worldCaption(makeConfig(SCENARIOS[4].over));
  assert.equal(again.id, SCENARIOS[4].id);
});

test("sameConfig compares both directions", () => {
  // A one-sided walk of `Object.keys(a)` would call these equal, because every
  // key on the left has a matching value on the right.
  assert.equal(sameConfig({ a: 1 }, { a: 1, b: 2 }), false);
  assert.equal(sameConfig({ a: 1, b: 2 }, { a: 1 }), false);
  assert.equal(sameConfig({ a: 1, b: 2 }, { b: 2, a: 1 }), true);
});

test("the caption carries the hook alone", () => {
  const scn = SCENARIOS.find((s) => s.id === "rooms");
  const cap = previewCaption(scn);
  assert.equal(captionText(cap), scn.hook);
  // The name is deliberately not in the line: `The Four Rooms — walls split them
  // into separate worlds` is fifty-three characters and wraps at 390 px, which
  // is the shove the whole reservation exists to prevent.
  assert.ok(!captionText(cap).includes(scn.name), "the caption should not repeat the chip's name");
});

test("the strip's count is written at runtime, never typed into the page", () => {
  assert.equal(worldsLabel(13), "13 worlds to try:");
  assert.equal(worldsLabel(SCENARIOS.length), `${SCENARIOS.length} worlds to try:`);
  const page = read("app/index.html");
  // The markup ships the old words as a placeholder for the split second before
  // the module runs; what it must never ship is a number, which is the drift
  // v1.37 found sitting in this project's prose for sixteen releases.
  const label = page.slice(page.indexOf('id="scenarios-label"'));
  const text = label.slice(label.indexOf(">") + 1, label.indexOf("</span>"));
  assert.ok(
    !/\d/.test(text),
    `the label's shipped text should carry no count of its own, got "${text.trim()}"`
  );
  assert.ok(
    /id="scenarios-label"/.test(page) && /worldsLabel\(/.test(read("src/main.js")),
    "the label should be written from src/worlds.js at runtime"
  );
});

test("the caption is in the page, ahead of the pond, and not behind the switch", () => {
  const page = read("app/index.html");
  for (const id of ["scenarios-caption", "scenarios-caption-icon", "scenarios-caption-hook"]) {
    assert.ok(page.includes(`id="${id}"`), `the page should carry #${id}`);
  }
  // `simpleview.js` rule 2: nothing a visitor is pointed at may be hidden by the
  // switch. The worlds strip is the second thing on this page and the caption is
  // the only surface that says what any of the thirteen are.
  const strip = page.slice(page.indexOf('<section class="scenarios"'), page.indexOf("<main"));
  assert.ok(
    !strip.includes("data-expert"),
    "the worlds strip must not go behind the Simple/Everything switch"
  );
  // And it is above the pond in source order, which at one column is the order
  // it is read in — v1.153's finding, applied to the surface built after it.
  assert.ok(
    page.indexOf('id="scenarios-caption"') < page.indexOf('id="world"'),
    "the caption should come before the pond"
  );
});

test("the caption's line is reserved, so the pond cannot step under a pointer", () => {
  const css = read("style.css");
  const block = css.slice(css.indexOf(".scenarios-caption {"), css.indexOf(".scenarios-caption .sc-icon"));
  assert.match(block, /min-height:\s*1lh/, "the caption should reserve exactly one line box");
  assert.match(block, /min-height:\s*\d+px/, "and a px fallback for a browser without `lh`");
  assert.match(block, /white-space:\s*nowrap/, "a hook over budget should be cut, not wrapped");
  // The scroll edge on the narrow layout says the row continues. Asserted off
  // the declaration rather than off a rendered page, the way
  // `test/handfeed.test.js` asserts its contrast: this project has no browser in
  // `node --test`, and a rule nobody can see is worse than one nobody can test.
  assert.match(css, /mask-image: linear-gradient\(to right, #000 calc\(100% - 28px\), transparent\)/);
});
