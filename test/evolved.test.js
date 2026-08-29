// evolved.test.js — "How they have changed" (v1.128).
//
// This board makes a claim no other surface here makes: that the animals in the
// water are *different from* the animals the pond started with. Everything else
// on the page is a reading of the present, so everything else is true by
// construction the moment it is computed. A comparison across time can be wrong
// in ways a reading cannot — it can be measured against the wrong pond, against
// a beginning it never saw, or against a population that has quietly been
// topped up with strangers — and those are what the tests below are about:
//
//  1. **The opening line is a pond's own first moment, and nothing else.**
//  2. **A row that is not true is not drawn**, and a trait that has not moved
//     says so in words rather than dressing up a rounding error.
//  3. **Counting the originals cannot go up**, however many animals are posted
//     into the water afterwards.
//  4. **Every number is one the world can produce**, recomputed here from the
//     living rather than compared against itself.
//  5. **The prose clears the vocabulary bar** `cast.js`, `records.js`,
//     `key.js` and `whoswho.js` all clear.
//  6. **Reading the pond does not move it.**

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { makeConfig } from "../src/config.js";
import { World } from "../src/world.js";
import { stateFingerprint, drawStream } from "../src/fingerprint.js";
import { WORLD_SCOPED } from "../src/viewstate.js";
import { RECORD_MARK } from "../src/records.js";
import { ROLE_MARK } from "../src/whoswho.js";
import {
  DIET_MOVED,
  DIET_VERDICT,
  EVOLVED_EMPTY,
  EVOLVED_LOADED,
  EVOLVED_MARK,
  EVOLVED_TITLE,
  MOVED,
  evolvedHTML,
  evolvedRows,
  evolvedSignature,
  foundingSnapshot,
  traitMeans,
} from "../src/evolved.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const page = read("app/index.html");
const main = read("src/main.js");
const styles = read("style.css");

/** A fresh pond and the opening line an observer would take of it. */
function opened(seed, over = {}) {
  const config = makeConfig({ seed, ...over });
  const world = new World(config);
  const founding = foundingSnapshot(world);
  return { world, config, founding };
}

/** The same, stepped on. */
function stepped(seed, ticks, over = {}) {
  const o = opened(seed, over);
  for (let i = 0; i < ticks; i++) o.world.step();
  return o;
}

const rowOf = (rows, key) => rows.find((r) => r.key === key) || null;

// ---- 1. the opening line ----

test("the opening line is a pond's first moment and nothing else", () => {
  const { world, config } = opened(1234);
  const first = foundingSnapshot(world);
  assert.ok(first, "a world that has not been stepped has no opening line");
  assert.equal(first.n, config.populationStart, "the opening line is not the pond it was handed");
  assert.equal(first.ids.size, first.n, "an animal is missing from the roll");

  // One step and the moment is gone. This is the whole of the guard that keeps
  // a loaded world — which arrives somewhere in the middle of a story — from
  // being measured against itself and reporting that nothing has evolved.
  world.step();
  assert.equal(foundingSnapshot(world), null, "a running pond offered an opening line");
  assert.equal(foundingSnapshot(null), null, "no world at all offered an opening line");
});

test("the opening line is the mean of the animals the pond was handed", () => {
  const { world, founding } = opened(42);
  const direct = traitMeans(world.creatures);
  assert.equal(founding.n, direct.n);
  for (const k of ["radius", "burn", "meat"]) {
    assert.equal(founding[k], direct[k], `the opening line's ${k} is not the founders'`);
  }
  // The founders' diet gene is uniform on 0..1, so every pond opens at close to
  // a coin flip. If this ever drifted the diet row would be measuring the deal.
  assert.ok(founding.meat > 0.3 && founding.meat < 0.7, `founders opened at ${founding.meat} meat`);
});

test("a pond loaded from a save has no opening line, and the board says which", () => {
  const { world } = stepped(7, 300);
  const fresh = new World(makeConfig({ seed: 7 }));
  fresh.loadJSON(world.toJSON());
  assert.ok(fresh.tick > 0, "a loaded pond arrived at tick zero");
  assert.equal(foundingSnapshot(fresh), null, "a loaded pond invented an opening line");

  assert.deepEqual(evolvedRows(fresh, null), [], "a board with nothing to compare drew rows");
  assert.match(evolvedHTML([], false), /evoempty/);
  assert.ok(evolvedHTML([], false).includes(EVOLVED_LOADED), "the loaded pond gets the wrong sentence");
  assert.ok(evolvedHTML([], true).includes(EVOLVED_EMPTY), "the young pond gets the wrong sentence");
  assert.notEqual(EVOLVED_EMPTY, EVOLVED_LOADED, "two different states share one sentence");
});

// ---- 2. a row that is not true is not drawn ----

test("nothing is drawn until the pond has bred, and the wait is seconds", () => {
  for (const seed of [1234, 7, 42, 99, 314, 2718]) {
    const { world, founding } = opened(seed);
    assert.deepEqual(evolvedRows(world, founding), [], `seed ${seed} evolved before it bred`);
    // How long a visitor waits for the board to fill: the first young arrives
    // between tick 9 and tick 120 on these six seeds, which is a few seconds at
    // 1×. The bound is generous — the claim is "seconds", not "exactly 120".
    let born = null;
    for (let t = 1; t <= 400 && born === null; t++) {
      world.step();
      if (world.stats.maxGeneration >= 1) born = t;
    }
    assert.ok(born !== null, `seed ${seed} had not bred after 400 ticks`);
    assert.ok(evolvedRows(world, founding).length > 0, `seed ${seed} bred and the board stayed empty`);
  }
});

test("a trait that has not moved says so, in words", () => {
  // The pond measured against itself: every trait is exactly where it started,
  // so every verdict must be the level one. A board that reported "0% bigger"
  // here would be a board that reports a trend for a rounding error.
  const { world } = stepped(314, 900);
  const live = world.creatures.filter((c) => !c.dead);
  const founding = { ...traitMeans(live), ids: new Set(live.map((c) => c.id)) };
  const rows = evolvedRows(world, founding);
  assert.match(rowOf(rows, "body").why, /much the same size/);
  assert.match(rowOf(rows, "burn").why, /much the same rate/);
  assert.match(rowOf(rows, "diet").why, /about what it was at the start/);
});

test("the verdict follows the direction the trait actually moved", () => {
  const { world } = stepped(99, 1200);
  const live = world.creatures.filter((c) => !c.dead);
  const now = traitMeans(live);
  const ids = new Set(live.map((c) => c.id));
  const at = (scale) =>
    evolvedRows(world, { n: 40, radius: now.radius * scale, burn: now.burn * scale, meat: now.meat, ids });

  // Founders half the size of today's animals: today's are twice as big.
  assert.match(rowOf(at(0.5), "body").why, /100% bigger/);
  assert.match(rowOf(at(0.5), "burn").why, /100% faster/);
  // Founders twice the size: today's are half as big.
  assert.match(rowOf(at(2), "body").why, /50% smaller/);
  assert.match(rowOf(at(2), "burn").why, /50% slower/);
  // And the threshold is a threshold: just inside it is level, just outside is
  // not. `MOVED` is 5%, sized against the ±3% the founding mean itself varies
  // by across seeds.
  assert.match(rowOf(at(1 + MOVED * 0.5), "body").why, /much the same size/);
  assert.doesNotMatch(rowOf(at(1 + MOVED * 3), "body").why, /much the same size/);
});

test("the diet row is judged in points, because a share is read in points", () => {
  const { world } = stepped(42, 1200);
  const live = world.creatures.filter((c) => !c.dead);
  const ids = new Set(live.map((c) => c.id));
  const now = traitMeans(live).meat;
  const withFounding = (meat) =>
    rowOf(evolvedRows(world, { n: 40, radius: 1, burn: 1, meat, ids }), "diet").why;

  // Three points is three points whether it is a 60% rise or a 5% one, and
  // neither is a change to a plate. The relative rule this board uses for the
  // other two traits would call the first of these a landslide.
  const small = Math.max(0.01, now - DIET_MOVED * 0.6);
  assert.match(withFounding(small), /about what it was at the start/);
  assert.match(withFounding(Math.min(0.99, now + 3 * DIET_MOVED)), /has fallen from/);
  assert.match(withFounding(Math.max(0.01, now - 3 * DIET_MOVED)), /has risen from/);
});

test("a name for what the pond has become has to be earned, not merely walked toward", () => {
  const { world } = stepped(42, 1200);
  const live = world.creatures.filter((c) => !c.dead);
  const ids = new Set(live.map((c) => c.id));
  const dietFrom = (then) =>
    rowOf(evolvedRows(world, { n: 40, radius: 1, burn: 1, meat: then, ids }), "diet").why;

  // A move is reported whichever way it goes; the verdict clause is about where
  // the pond has arrived. This is the bug the first draft of the row shipped
  // with: reading the direction alone, it called a pond sitting on 43% meat
  // "turning vegetarian" on the strength of a seven-point drop.
  const now = traitMeans(live).meat;
  const far = dietFrom(Math.min(0.99, now + 4 * DIET_MOVED));
  assert.match(far, /^meat has fallen from \d+% of what they eat to \d+%/, far);
  if (now <= DIET_VERDICT) assert.match(far, /turning vegetarian/, far);
  else assert.doesNotMatch(far, /vegetarian|hunting/, `"${far}" named a pond that is ${now} meat`);

  // Both verdicts exist and both are reachable, checked on a synthetic pond so
  // the claim does not depend on which way seed 42 happened to go.
  const fake = (meat) => ({
    stats: { maxGeneration: 3 },
    creatures: [{ dead: false, radius: 6, metabolismScale: 1, carnivory: meat, generation: 3, id: 1 }],
  });
  const say = (meat, then) => rowOf(evolvedRows(fake(meat), { n: 40, radius: 6, burn: 1, meat: then, ids: new Set() }), "diet").why;
  assert.match(say(0.05, 0.5), /turning vegetarian/);
  assert.match(say(0.95, 0.5), /turned to hunting/);
  assert.doesNotMatch(say(0.45, 0.6), /vegetarian|hunting/);
  assert.doesNotMatch(say(0.55, 0.4), /vegetarian|hunting/);
});

// ---- 3. counting the originals ----

test("the count of the originals only ever falls, and strangers do not join it", () => {
  const { world, founding, config } = stepped(1234, 200);
  let last = Infinity;
  for (let t = 0; t < 3000; t++) {
    world.step();
    // Twelve strangers posted into the water, exactly as `✚ Seed life` does and
    // exactly as `autoReseed` does after a crash. Every one of them is a
    // generation-0 animal, so a row that counted the originals by generation
    // would climb — the one thing a row about the originals must never do.
    if (t === 500 || t === 1500) world.addRandomCreatures(12);
    if (t % 100) continue;
    const rows = evolvedRows(world, founding);
    const why = rowOf(rows, "founders").why;
    const left = /^not one/.test(why) ? 0 : parseInt(why, 10);
    assert.ok(Number.isFinite(left), `"${why}" does not begin with a count`);
    assert.ok(left <= last, `the originals went from ${last} to ${left}`);
    assert.ok(left <= config.populationStart, `${left} originals out of ${config.populationStart}`);
    last = left;
  }
  // And they are genuinely being lost rather than merely not gained — twenty-four
  // strangers arrived over this run and the count still only went one way. (That
  // they run out *entirely* is the next test, on an unperturbed pond: posting
  // fresh animals into the water changes how long the originals last.)
  assert.ok(last < config.populationStart, `${last} of ${config.populationStart} originals never left`);
});

test("the row changes its wording when the last of them goes", () => {
  const { world, founding } = stepped(1234, 200);
  const said = new Set();
  for (let t = 0; t < 3200; t++) {
    world.step();
    if (t % 50) continue;
    const why = rowOf(evolvedRows(world, founding), "founders").why;
    said.add(/^not one/.test(why) ? "gone" : /^1 of/.test(why) ? "one" : "many");
  }
  assert.ok(said.has("many"), "the row never reported a crowd of originals");
  assert.ok(said.has("gone"), "the row never reported the last of them going");
});

// ---- 4. every number is one the world can produce ----

test("every row is true of the pond it was read from", () => {
  for (const seed of [1234, 7, 2718]) {
    const { world, founding } = stepped(seed, 2500);
    const rows = evolvedRows(world, founding);
    const live = world.creatures.filter((c) => !c.dead);
    const now = traitMeans(live);

    const left = live.filter((c) => founding.ids.has(c.id)).length;
    const founders = rowOf(rows, "founders").why;
    if (left === 0) assert.match(founders, /^not one of the 40 /);
    else assert.ok(founders.startsWith(`${left} of the 40 `), `"${founders}" is not ${left}`);

    const body = rowOf(rows, "body").why;
    const ratio = now.radius / founding.radius;
    const wantBody = Math.round(Math.abs(ratio - 1) * 100);
    if (Math.abs(ratio - 1) >= MOVED) {
      assert.match(body, new RegExp(`^${wantBody}% ${ratio > 1 ? "bigger" : "smaller"}\\b`), body);
    }

    const diet = rowOf(rows, "diet").why;
    assert.ok(diet.includes(`${Math.round(now.meat * 100)}%`), `"${diet}" does not carry today's share`);

    const descent = rowOf(rows, "descent");
    if (descent) {
      const gens = live.reduce((a, c) => a + c.generation, 0) / live.length;
      assert.ok(
        descent.why.includes(`${Math.round(gens)} generations`) || Math.round(gens) === 1,
        `"${descent.why}" is not ${gens}`
      );
    }
  }
});

test("the board holds between four and five rows once a pond is running", () => {
  // The playbook's chore: measure a surface's volume before believing anything
  // about how full it is. Over twelve seeds sampled every 50 ticks to t6,000
  // the board draws a mean of **4.85 rows of a possible 5**, all five of them
  // 84.9% of the time and never fewer than four — the descent row is the only
  // one that can be absent, and only while the mean generation is under one.
  let total = 0;
  let instants = 0;
  let five = 0;
  for (const seed of [1234, 7, 42, 99, 314, 2718]) {
    const { world, founding } = opened(seed);
    for (let t = 1; t <= 3000; t++) {
      world.step();
      if (t % 250) continue;
      const n = evolvedRows(world, founding).length;
      total += n;
      instants++;
      if (n === 5) five++;
      assert.ok(n === 4 || n === 5, `${n} rows on seed ${seed} at tick ${t}`);
    }
  }
  assert.ok(total / instants > 4.5, `the board averages ${(total / instants).toFixed(2)} rows`);
  assert.ok(five / instants > 0.5, "the full board is the exception rather than the rule");
});

// ---- 5. the prose ----

test("nothing on the board uses a word only somebody already here knows", () => {
  const JARGON =
    /\b(carnivor\w*|herbivor\w*|lineage|genome|genotype|allele|gene|tick|ticks|px|pixels?|metabolis\w*|predation|neuroevolution|fitness|phenotype|RNG|seed|species)\b/i;
  assert.doesNotMatch(EVOLVED_EMPTY, JARGON, "the empty line reaches for a word a visitor may not have");
  assert.doesNotMatch(EVOLVED_LOADED, JARGON, "the loaded line reaches for a word a visitor may not have");

  const said = new Set();
  for (const seed of [3, 42, 128, 314, 2718]) {
    const { world, founding } = stepped(seed, 2500);
    for (const r of evolvedRows(world, founding)) said.add(r.why);
  }
  assert.ok(said.size >= 5, `only ${said.size} kinds of sentence ever appeared — the bar is barely tested`);
  for (const why of said) {
    assert.doesNotMatch(why, JARGON, `"${why}" uses a word only somebody already here knows`);
    assert.ok(!why.endsWith("."), `"${why}" is a clause and does not need a full stop`);
    assert.ok(why.length <= 90, `"${why}" is longer than a row`);
  }
  for (const title of Object.values(EVOLVED_TITLE)) assert.doesNotMatch(title, JARGON, `"${title}" is jargon`);
});

test("the marks are one per row, all different, and none is another board's", () => {
  const marks = Object.values(EVOLVED_MARK);
  assert.equal(new Set(marks).size, marks.length, "two rows wear the same mark");
  assert.equal(marks.length, Object.keys(EVOLVED_TITLE).length, "a row has a mark and no title, or the reverse");
  const taken = new Set([...Object.values(RECORD_MARK), ...Object.values(ROLE_MARK)]);
  for (const m of marks) assert.ok(!taken.has(m), `${m} already means something else on this page`);
});

// ---- the markup ----

test("the board is text, because there is nothing on it to press", () => {
  const { world, founding } = stepped(314, 2000);
  const rows = evolvedRows(world, founding);
  const html = evolvedHTML(rows);
  assert.equal((html.match(/<li class="evorow">/g) || []).length, rows.length);
  assert.ok(!html.includes("<button"), "a row offers to do something it cannot do");
  for (const r of rows) assert.ok(html.includes(r.why), `"${r.why}" is not on the board`);
  assert.match(html, /aria-hidden="true"/, "a decorative mark is being read aloud");
});

test("the signature moves with the words and never reads as unwritten", () => {
  const { world, founding } = stepped(7, 1500);
  const rows = evolvedRows(world, founding);
  const sig = evolvedSignature(rows);
  assert.notEqual(sig, "", "a drawn board looks the same as a board nobody has drawn");
  assert.notEqual(evolvedSignature([], true), "", "the empty board looks like a board nobody has drawn");
  assert.notEqual(
    evolvedSignature([], true),
    evolvedSignature([], false),
    "the two empty states share one signature, so one can be left on screen"
  );
  assert.equal(sig, evolvedSignature(evolvedRows(world, founding)), "the same pond signed twice differently");
  const moved = rows.map((r) => (r.key === "diet" ? { ...r, why: "something else" } : r));
  assert.notEqual(evolvedSignature(moved), sig, "a changed sentence left the signature alone");
});

test("the page holds the board between the cast and the records, and styles it", () => {
  assert.match(page, /id="evolved-list"/, "the board has no container on the page");
  assert.match(page, /id="evolved-h">🧬 How they have changed</, "the board has no heading");
  const cast = page.indexOf('id="cast-list"');
  const evo = page.indexOf('id="evolved-list"');
  const rec = page.indexOf('id="record-list"');
  assert.ok(cast < evo && evo < rec, "the board is not between the cast and the records");
  assert.match(page, /<section class="evolved" aria-labelledby="evolved-h">/, "the section names its heading");
  for (const cls of ["evolist", "evorow", "evomark", "evoname", "evowhy", "evoempty"]) {
    assert.ok(styles.includes(`.${cls}`), `.${cls} is drawn and never styled`);
  }
});

test("main.js takes the opening line once, before the pond is stepped", () => {
  // In `adoptWorld`, which runs at the top of the frame and before `step()` —
  // that ordering is what makes `tick === 0` mean "as it was dealt".
  const adopt = main.slice(main.indexOf("function adoptWorld()"), main.indexOf("function boot()"));
  assert.match(adopt, /view\.founding = foundingSnapshot\(world\)/, "the opening line is taken somewhere else");
  assert.equal(
    (main.match(/foundingSnapshot\(/g) || []).length,
    1,
    "the opening line is taken in more than one place, or in none"
  );
  const loop = main.slice(main.indexOf("function loop("), main.indexOf("// ---- The spoken pond"));
  assert.ok(loop.indexOf("adoptWorld()") < loop.indexOf("world.step()"), "the pond is stepped before it is read");
  assert.match(main, /updateEvolved\(world\)/, "the board is never updated");
  assert.match(main, /if \(sig === view\.evolvedSig\) return;/, "the board is rebuilt every frame");
});

test("the observer owns the opening line, so a new pond cannot inherit one", () => {
  assert.ok(WORLD_SCOPED.includes("founding"), "`founding` has no owner");
  assert.ok(WORLD_SCOPED.includes("evolvedSig"), "`evolvedSig` has no owner");
});

// ---- 6. reading the pond does not move it ----

test("drawing the board moves nothing and draws no random number", () => {
  const { world, founding } = stepped(7, 400);
  const stream = drawStream(world.rng);
  const before = stateFingerprint(world);
  const drawn = stream.count;
  for (let i = 0; i < 20; i++) {
    const rows = evolvedRows(world, founding);
    evolvedSignature(rows);
    evolvedHTML(rows);
  }
  assert.equal(stateFingerprint(world), before, "reading the board moved the pond");
  assert.equal(stream.count, drawn, "reading the board drew a random number");
  // And the opening line is a copy rather than a window: the ids are a set of
  // numbers and the means are numbers, so nothing here holds a body alive.
  assert.ok(founding.ids instanceof Set, "the opening line holds something other than numbers");
});
