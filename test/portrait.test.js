// portrait.test.js — the family portrait (v1.130), and the sentence it had to
// correct before it was worth drawing.
//
// This figure draws two animals at one scale and claims the difference between
// them is evolution. That claim rests entirely on a fact nothing in this
// project had ever asserted: **a body is the size it was born and never
// changes**. The placard said the opposite in as many words for eight releases
// — *Big is old. Nothing is born large.* — and yesterday's guided tour copied
// it. Both are corrected, and the first test below is what keeps them
// corrected: it reads `creature.js` back and fails the day `radius` gets a
// second assignment, because on that day the placard is right again and this
// figure is a picture of two life stages.
//
// Six things are asserted here.
//
//   1. **Nothing grows.** `radius` is written once, at construction, and a real
//      run confirms it: every animal alive at the end is exactly the size it
//      was when it was first seen.
//   2. **The figure and the board share one gate.** A pond with nothing to
//      compare draws neither, and one with something to say draws both. Two
//      surfaces about one subject that can disagree about whether the subject
//      exists is `viewstate.js`'s bug class in a new place.
//   3. **The scale is shared and the picture is to it.** The ratio of the two
//      drawn radii is the ratio of the two measured ones, to the last decimal,
//      over a real run. This is the whole honesty of the figure.
//   4. **Both bodies fit the box**, at the extremes a genome can express and at
//      the diet threshold's two sides, including the case the layout is written
//      for: a hunter's nose is half again a grazer's.
//   5. **The shape follows the pond's own rule** — the nose is `render.js`'s,
//      through `key.js`, and it flips on `carnivoreThreshold` exactly.
//   6. **The margin is printed.** Every pond opens within a few points of that
//      threshold, so the silhouette is decided by a hair; the meat share under
//      each portrait is what stops the picture over-claiming, and the spoken
//      form carries the same two numbers the sighted reader gets.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { evolvedRows, foundingSnapshot } from "../src/evolved.js";
import { NOSE } from "../src/key.js";
import { WORLD_SCOPED } from "../src/viewstate.js";
import {
  PORTRAIT_BOX,
  PORTRAIT_GLOW,
  PORTRAIT_LABEL,
  PORTRAIT_NOTE,
  PORTRAIT_PAD,
  portraitHTML,
  portraitLabel,
  portraitLayout,
  portraitPair,
  portraitSignature,
} from "../src/portrait.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

/** A fresh pond, its opening line, and the config behind both. */
function opened(seed, over = {}) {
  const config = makeConfig({ seed, ...over });
  const world = new World(config);
  return { world, config, founding: foundingSnapshot(world) };
}

/** The same, stepped on. */
function stepped(seed, ticks, over = {}) {
  const o = opened(seed, over);
  for (let i = 0; i < ticks; i++) o.world.step();
  return o;
}

/** A subject as `portraitPair` builds one, without needing a pond to build it. */
const subject = (radius, meat, threshold = 0.55) => ({
  radius,
  meat,
  hunter: meat >= threshold,
});

// ---- 1. nothing grows ----

test("a body is assigned once, at birth, and never written again", () => {
  const src = read("src/creature.js");
  // Every assignment to a creature's own radius, anywhere in the file. One is
  // the constructor's; a second is the placard's old sentence coming true.
  const writes = src.match(/this\.radius\s*=[^=]/g) || [];
  assert.equal(
    writes.length,
    1,
    `\`radius\` is written ${writes.length} times in creature.js — the placard's ` +
      "\"a body is the size it was born\" is no longer true, and neither is the portrait"
  );
  assert.match(src, /this\.radius = lerp\(/, "the one write is no longer the birth deal");

  // And nowhere else, either: a module that reaches in and resizes somebody is
  // the same failure at arm's length.
  for (const file of ["world.js", "creature.js", "genome.js", "main.js"]) {
    const other = read(`src/${file}`).match(/\.radius\s*=[^=]/g) || [];
    const allowed = file === "creature.js" ? 1 : 0;
    assert.equal(other.length, allowed, `${file} writes a body's radius`);
  }
});

test("over a real run, nobody has changed size", () => {
  const { world } = opened(314);
  const first = new Map();
  for (let i = 0; i < 1200; i++) {
    world.step();
    for (const c of world.creatures) {
      if (!first.has(c.id)) first.set(c.id, c.radius);
      assert.equal(c.radius, first.get(c.id), `creature ${c.id} changed size`);
    }
  }
  assert.ok(first.size > 60, "too few animals passed through to be a test of anything");
});

test("the placard and the guide both say so, and neither says the old thing", () => {
  const key = read("src/key.js");
  const tour = read("src/tour.js");
  for (const [name, src] of [
    ["key.js", key],
    ["tour.js", tour],
  ]) {
    assert.ok(
      !/been finding food for a long time\./.test(src.replace(/\/\/.*$/gm, "")),
      `${name} still tells a visitor that a big body is an old one`
    );
  }
  assert.match(key, /term: "Big is inherited"/);
  assert.match(tour, /size is inherited here, not earned/);
});

// ---- 2. one gate, two surfaces ----

test("the figure appears exactly when the board has something to say", () => {
  for (const seed of [1234, 7, 2718]) {
    const o = opened(seed);
    for (let i = 0; i < 900; i++) {
      o.world.step();
      if (i % 25 !== 0) continue;
      const rows = evolvedRows(o.world, o.founding);
      const pair = portraitPair(o.world, o.founding, o.config);
      assert.equal(
        pair === null,
        rows.length === 0,
        `seed ${seed} tick ${o.world.tick}: the picture and the words disagree about ` +
          "whether there is anything to compare"
      );
      assert.equal(portraitHTML(pair) === "", pair === null, "an empty pair drew something");
    }
  }
});

test("a pond with no beginning to measure against draws nothing", () => {
  const { world, config } = stepped(7, 400);
  const loaded = new World(makeConfig({ seed: 7 }));
  loaded.loadJSON(world.toJSON());
  assert.equal(portraitPair(loaded, null, config), null, "a loaded pond drew a portrait");
  assert.equal(portraitHTML(null), "", "no pair still produced markup");
  assert.equal(portraitSignature(null), "-", "no pair still produced a signature");
});

// ---- 3. one scale, and the picture is to it ----

test("the two bodies are drawn in the ratio they are measured in", () => {
  const o = stepped(1234, 2500);
  const pair = portraitPair(o.world, o.founding, o.config);
  assert.ok(pair, "2,500 ticks and still nothing to draw");
  const at = portraitLayout(pair);
  const measured = pair.now.radius / pair.then.radius;
  const drawn = at.now.r / at.then.r;
  assert.ok(
    Math.abs(drawn - measured) < 1e-9,
    `the picture is at ${drawn} where the pond is at ${measured}`
  );
  assert.ok(
    Math.abs(pair.ratio - measured) < 1e-12,
    "the pair's own ratio disagrees with its two radii"
  );
});

test("the scale is the largest that fits — something is always touching an edge", () => {
  // Not *which* limit binds, which is a fact about the constants (today it is
  // the glow, top and bottom, on every case here). The property is that no room
  // is left over: a figure drawing at 90% of what fits is a figure whose two
  // animals are smaller than they need to be, and nothing else would notice.
  const halfW = PORTRAIT_BOX.w / 4;
  const cy = PORTRAIT_BOX.h / 2;
  const cases = [
    [subject(4, 0.2), subject(7, 0.2)],
    [subject(7, 0.9), subject(4, 0.9)],
    [subject(5.8, 0.5), subject(5.8, 0.5)],
  ];
  for (const [then, now] of cases) {
    const at = portraitLayout({ then, now, ratio: now.radius / then.radius });
    let slack = Infinity;
    for (const b of [at.then, at.now]) {
      slack = Math.min(slack, halfW - PORTRAIT_PAD - (b.r * (b.nose + 1)) / 2);
      slack = Math.min(slack, cy - PORTRAIT_PAD - b.r * 0.85);
      slack = Math.min(slack, halfW - b.r * (PORTRAIT_GLOW + (b.nose - 1) / 2));
      slack = Math.min(slack, cy - b.r * PORTRAIT_GLOW);
    }
    assert.ok(
      Math.abs(slack) < 1e-9,
      `${slack.toFixed(2)} units of the box go unused — the figure is drawing ` +
        "smaller than it needs to"
    );
  }
});

// ---- 4. both bodies fit the box ----

test("nothing is drawn outside the figure, at either end of what a genome can be", () => {
  const cfg = makeConfig({ seed: 1 });
  const cases = [
    ["the extremes", subject(cfg.bodyRadiusMin, 0), subject(cfg.bodyRadiusMax, 1)],
    ["a shrinking pond", subject(cfg.bodyRadiusMax, 1), subject(cfg.bodyRadiusMin, 0)],
    ["two hunters", subject(6, 0.9), subject(8, 0.95)],
    ["a pond that stopped hunting", subject(6, 0.9), subject(6.2, 0.05)],
    ["no change at all", subject(5.8, 0.5), subject(5.8, 0.5)],
  ];
  for (const [what, then, now] of cases) {
    const at = portraitLayout({ then, now, ratio: now.radius / then.radius });
    for (const [side, b] of [
      ["then", at.then],
      ["now", at.now],
    ]) {
      const nose = b.cx + b.r * b.nose;
      const tail = b.cx - b.r;
      const glowL = b.cx - b.r * PORTRAIT_GLOW;
      const glowR = b.cx + b.r * PORTRAIT_GLOW;
      assert.ok(tail >= 0 && nose <= PORTRAIT_BOX.w, `${what}: the ${side} body left the box`);
      assert.ok(
        b.r * 0.85 <= PORTRAIT_BOX.h / 2 - PORTRAIT_PAD + 1e-9,
        `${what}: the ${side} body is taller than the box`
      );
      assert.ok(
        glowL >= -1e-9 && glowR <= PORTRAIT_BOX.w + 1e-9,
        `${what}: the ${side} glow left the box`
      );
      // The one thing two cells in one box can do to each other.
      const mid = PORTRAIT_BOX.w / 2;
      if (side === "then") assert.ok(glowR <= mid + 1e-9, `${what}: the two glows overlap`);
      else assert.ok(glowL >= mid - 1e-9, `${what}: the two glows overlap`);
    }
  }
});

// ---- 5. the shape is the pond's own rule ----

test("the nose flips on the diet threshold, and on nothing else", () => {
  const cfg = makeConfig({ seed: 1 });
  const t = cfg.carnivoreThreshold;
  const layoutFor = (meat) => {
    const s = subject(6, meat, t);
    return portraitLayout({ then: s, now: s, ratio: 1 }).then.nose;
  };
  assert.equal(layoutFor(t - 0.001), NOSE.prey, "a hair under the line drew a dagger");
  assert.equal(layoutFor(t), NOSE.hunter, "the line itself drew a grazer");
  assert.equal(layoutFor(t + 0.001), NOSE.hunter);
  // And the rule is the renderer's, not a second copy of it.
  const render = read("src/render.js");
  assert.match(render, /const nose = isPredator \? 2\.1 : 1\.4;/, "the renderer's noses have moved");
  assert.equal(NOSE.hunter, 2.1);
  assert.equal(NOSE.prey, 1.4);
});

test("the pond's own means decide the two subjects", () => {
  const o = stepped(42, 1500);
  const pair = portraitPair(o.world, o.founding, o.config);
  const live = o.world.creatures.filter((c) => !c.dead);
  const mean = (f) => live.reduce((a, c) => a + f(c), 0) / live.length;
  assert.ok(Math.abs(pair.now.radius - mean((c) => c.radius)) < 1e-12);
  assert.ok(Math.abs(pair.now.meat - mean((c) => c.carnivory)) < 1e-12);
  assert.equal(pair.then.radius, o.founding.radius);
  assert.equal(pair.then.meat, o.founding.meat);
  assert.equal(pair.now.hunter, pair.now.meat >= o.config.carnivoreThreshold);
});

// ---- 6. the margin, and the reader who cannot see the picture ----

test("every pond opens close enough to the line that the number has to be printed", () => {
  // The finding this figure is designed around: the founders' plate is a coin
  // flip, so `carnivoreThreshold` decides the left-hand silhouette on a margin
  // of a point or two. Twelve seeds opened between 46% and 56% meat when this
  // was written; the assertion is the weaker claim that survives a re-deal.
  for (const seed of [1, 7, 42, 99, 137, 271, 314, 512, 1024, 2718, 4096, 9001]) {
    const { founding, config } = opened(seed);
    assert.ok(
      Math.abs(founding.meat - config.carnivoreThreshold) < 0.15,
      `seed ${seed} opened at ${founding.meat.toFixed(3)} meat, far from the line — ` +
        "the margin under the portrait is no longer the point"
    );
  }
});

test("the markup carries both plates, both labels and the note", () => {
  const o = stepped(1234, 2000);
  const pair = portraitPair(o.world, o.founding, o.config);
  const html = portraitHTML(pair);
  for (const which of ["then", "now"]) {
    assert.ok(html.includes(PORTRAIT_LABEL[which]), `the ${which} portrait has no label`);
    assert.ok(
      html.includes(`${Math.round(pair[which].meat * 100)}%`),
      `the ${which} portrait shows a shape with no margin under it`
    );
  }
  assert.ok(html.includes(PORTRAIT_NOTE), "the note that says the scale is shared is missing");
  // Two gradients, two ids. One id twice and both animals wear the first one's
  // colour — `key.js` learned this on a placard with nine swatches on it.
  const ids = html.match(/radialGradient id="([^"]+)"/g) || [];
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2, "the two glows share an id");
});

test("the spoken form is the picture's content, and nothing the picture lacks", () => {
  const cases = [
    [subject(5, 0.2), subject(6, 0.2), /grazer.*grazer.*20% bigger/s],
    [subject(6, 0.2), subject(5, 0.2), /17% smaller/],
    [subject(6, 0.2), subject(6.1, 0.2), /much the same size/],
    [subject(6, 0.9), subject(6, 0.1), /hunter.*grazer/s],
  ];
  for (const [then, now, re] of cases) {
    const label = portraitLabel({ then, now, ratio: now.radius / then.radius });
    assert.match(label, re);
    assert.match(label, /at one scale/, "the label does not say the scale is shared");
    for (const s of [then, now]) {
      assert.ok(label.includes(`${Math.round(s.meat * 100)}%`), `a plate is missing: ${label}`);
    }
  }
});

// ---- the adapter ----

test("the figure is keyed, owned and wired", () => {
  const main = read("src/main.js");
  const page = read("app/index.html");
  const styles = read("style.css");

  assert.ok(WORLD_SCOPED.includes("portraitSig"), "the figure's key has no owner");
  assert.ok(
    !/^\s*let portraitSig/m.test(main),
    "`portraitSig` has grown a private declaration in main.js again"
  );
  assert.match(main, /updatePortrait\(world\);/, "nothing calls the figure");
  assert.match(page, /<div class="portrait" id="portrait">/, "the page has nowhere to draw it");
  assert.match(styles, /\.portrait:empty \{\s*display: none;/, "an empty figure still takes room");

  // Drawn after the board it belongs to, so the panel reads top to bottom in
  // the order the frame writes it.
  assert.ok(
    main.indexOf("updateEvolved(world);") < main.indexOf("updatePortrait(world);"),
    "the picture is written before the words it sits over"
  );
});

test("the signature holds still when the drawing would not move", () => {
  const o = stepped(99, 1500);
  const pair = portraitPair(o.world, o.founding, o.config);
  const sig = portraitSignature(pair);
  assert.equal(portraitSignature(portraitPair(o.world, o.founding, o.config)), sig);
  // A hundredth of a pixel is a mark that has moved; a millionth is not.
  const nudged = { ...pair, now: { ...pair.now, radius: pair.now.radius + 1e-6 } };
  assert.equal(portraitSignature(nudged), sig, "the figure would redraw for nothing");
  const moved = { ...pair, now: { ...pair.now, radius: pair.now.radius + 0.05 } };
  assert.notEqual(portraitSignature(moved), sig, "a body moved and the figure did not");
});
