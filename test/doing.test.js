// doing.test.js — the verb, and the hold under it (v1.148).
//
// Three groups of claims.
//
// The first is the one that keeps this module honest about *whose* senses it is
// reading. `doing.js` names six slots of `Creature#_in` by hand, and a comment
// cannot keep two files in step: the indices are asserted against a `sense()`
// run with a pellet, a prey and a threat placed where the answers are known, so
// reordering the input vector fails here rather than leaving this module quietly
// describing the wrong sense.
//
// The second is the classifier: every state reachable, the priority between them
// as declared, and — the one that matters most — that a switched-off mechanic
// silently removes its own states rather than needing a gate.
//
// The third is the hold, which is the whole reason this file is not a one-liner:
// a line is held, a line is not held past its subject, and a meal detected on one
// animal is never credited to the next. That last one is the failure v1.142 named
// as the dangerous kind of stale, and it is the only bug in here that a visitor
// would read as a fact about the pond.
//
// The sweep constants at the end are pinned as inequalities with room either
// side, the way `feed.test.js` and `here.test.js` pin theirs: what they protect
// is the finding — that the raw state churns far too fast to read and that the
// hold fixes it — and a pond where that stopped being true is one where this
// feature should be built differently.

import test from "node:test";
import assert from "node:assert/strict";

import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { stateFingerprint } from "../src/fingerprint.js";
import {
  DOINGS,
  DOING_INVITE,
  doingInvite,
  DOING_ORDER,
  DoingCrowd,
  DoingWatch,
  LOW,
  MAX_WORD_CHARS,
  MIN_SHOW_MS,
  NEAR,
  SENSE,
  STILL,
  STIR,
  doingHTML,
  doingIcon,
  doingLine,
  doingOf,
  doingWord,
} from "../src/doing.js";
import { POINTER, TOUCH } from "../src/hand.js";

const cfg = makeConfig({ seed: 1 });

/** A creature standing still at the middle of the pond, facing east, half fed. */
function subject(over = {}) {
  const world = new World(makeConfig({ seed: 4242 }));
  const c = world.creatures[0];
  c.x = cfg.width / 2;
  c.y = cfg.height / 2;
  c.heading = 0;
  c.vx = 0;
  c.vy = 0;
  c.energy = cfg.energyMax * 0.6;
  c.infected = false;
  c._in.fill(0);
  c._in[0] = 1;
  Object.assign(c, over);
  return c;
}

/** Put a sense reading straight into the buffer: how near, and ahead or behind. */
function sees(c, what, prox, ahead = true) {
  c._in[SENSE[`${what}Prox`]] = prox;
  c._in[SENSE[`${what}Cos`]] = ahead ? 1 : -1;
}

/** Moving at a given fraction of `maxSpeed`, along the x-axis. */
function moving(c, frac) {
  c.vx = frac * cfg.maxSpeed;
  c.vy = 0;
}

// ---- The senses this module reads are the senses the brain was given ----

test("the slots doing.js names are the slots sense() writes", () => {
  const config = makeConfig({ seed: 7, predation: true });
  const world = new World(config);
  const c = world.creatures[0];
  c.x = 100;
  c.y = 100;
  c.heading = 0; // facing east, so +x is straight ahead

  const R = config.visionRadius;
  // A pellet dead ahead at a quarter of sight, prey dead ahead at half of it,
  // and a threat directly behind at half. Every answer is arithmetic.
  const food = { x: 100 + R * 0.25, y: 100 };
  const prey = { x: 100 + R * 0.5, y: 100 };
  const threat = { x: 100 - R * 0.5, y: 100 };
  c.sense(food, R * 0.25, prey, R * 0.5, threat, R * 0.5);

  const near = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-5, `${why}: ${a} vs ${b}`);
  near(c._in[SENSE.foodProx], 0.75, "food proximity is 1 - d/R");
  near(c._in[SENSE.preyProx], 0.5, "prey proximity is 1 - d/R");
  near(c._in[SENSE.threatProx], 0.5, "threat proximity is 1 - d/R");
  near(c._in[SENSE.foodCos], 1, "a pellet dead ahead reads cos 1");
  near(c._in[SENSE.preyCos], 1, "prey dead ahead reads cos 1");
  near(c._in[SENSE.threatCos], -1, "a threat directly behind reads cos -1");
});

test("nothing in sight reads zero on every slot this module uses", () => {
  const world = new World(makeConfig({ seed: 7 }));
  const c = world.creatures[0];
  c.sense(null, Infinity, null, Infinity, null, Infinity);
  for (const [name, i] of Object.entries(SENSE)) {
    assert.equal(c._in[i], 0, `${name} should be 0 with nothing to sense`);
  }
});

// ---- The classifier ----

test("every declared state is reachable, and the vocabulary is complete", () => {
  assert.deepEqual(DOING_ORDER, Object.keys(DOINGS));
  for (const key of DOING_ORDER) {
    const d = DOINGS[key];
    assert.ok(d.icon.length > 0, `${key} has no mark`);
    assert.ok(d.phrase.length > 4, `${key} has no words`);
    assert.ok(d.phrase.endsWith("."), `${key} is not a sentence`);
    // A phrase follows a name, so it has to start with a verb rather than with
    // a capital: "Iris Is heading for food" is the bug this catches.
    assert.equal(d.phrase[0], d.phrase[0].toLowerCase(), `${key} starts mid-sentence`);
  }
});

test("a meal outranks everything, including a threat on top of you", () => {
  const c = subject();
  sees(c, "threat", 0.9, false);
  moving(c, 0.5);
  assert.equal(doingOf(c, cfg, false), "fleeing");
  assert.equal(doingOf(c, cfg, true), "ate");
});

test("running away is a near threat, behind, with the animal moving", () => {
  const c = subject();
  sees(c, "threat", NEAR + 0.1, false);
  moving(c, STIR + 0.05);
  assert.equal(doingOf(c, cfg), "fleeing");

  // Standing still with the same threat behind is not a flight.
  c.vx = 0;
  assert.equal(doingOf(c, cfg), "stalked");

  // Moving, but the threat is ahead — also not a flight.
  moving(c, STIR + 0.05);
  sees(c, "threat", NEAR + 0.1, true);
  assert.equal(doingOf(c, cfg), "stalked");
});

test("a chase is near prey, ahead, with the animal moving", () => {
  const c = subject();
  sees(c, "prey", NEAR + 0.1, true);
  moving(c, STIR + 0.05);
  assert.equal(doingOf(c, cfg), "hunting");

  // Prey behind is not a chase; with nothing else going on it falls through.
  sees(c, "prey", NEAR + 0.1, false);
  assert.equal(doingOf(c, cfg), "searching");
});

test("an action outranks the circumstance it is a response to", () => {
  // The one rule that sets the whole order. Chasing something with a threat in
  // the water beside you is a chase; standing still in the same water is being
  // stalked. Same three facts, and which of them is *the animal's own doing*
  // decides the sentence.
  const c = subject();
  sees(c, "prey", 0.9, true);
  sees(c, "threat", 0.9, true);
  moving(c, 0.5);
  assert.equal(doingOf(c, cfg), "hunting");
  c.vx = 0;
  assert.equal(doingOf(c, cfg), "stalked");
});

test("near is half of sight, and just outside it is not near", () => {
  const c = subject();
  sees(c, "food", NEAR, true);
  assert.equal(doingOf(c, cfg), "foraging");
  sees(c, "food", NEAR - 0.01, true);
  assert.notEqual(doingOf(c, cfg), "foraging");
});

test("doing something about being hungry outranks being hungry", () => {
  const c = subject({ energy: cfg.energyMax * (LOW - 0.05) });
  assert.equal(doingOf(c, cfg), "starving");
  sees(c, "food", NEAR + 0.2, true);
  assert.equal(doingOf(c, cfg), "foraging", "food in sight is the better description");
});

test("sickness is said only when nothing is happening to the animal", () => {
  const c = subject({ infected: true });
  moving(c, 0.5);
  assert.equal(doingOf(c, cfg), "sick");
  sees(c, "food", 0.9, true);
  assert.equal(doingOf(c, cfg), "foraging");
});

test("drifting and searching are told apart by speed alone", () => {
  const c = subject();
  moving(c, STILL - 0.01);
  assert.equal(doingOf(c, cfg), "resting");
  moving(c, STILL + 0.05);
  assert.equal(doingOf(c, cfg), "searching");
});

test("a world without predation cannot say any of the three predation states", () => {
  // Not by a config gate — there is none — but because a pond with nothing
  // hunting never writes a prey or a threat into anybody's senses. This is the
  // claim that lets `doingOf` have no `if (config.predation)` in it.
  const world = new World(makeConfig({ seed: 909, predation: false }));
  for (let i = 0; i < 1200; i++) world.step();
  const said = new Set();
  for (const c of world.creatures) {
    if (!c.dead) said.add(doingOf(c, world.config));
  }
  for (const forbidden of ["fleeing", "hunting", "stalked"]) {
    assert.ok(!said.has(forbidden), `a pond with no predators said "${forbidden}"`);
  }
  assert.ok(said.size > 1, "the classifier said only one thing about a whole pond");
});

// ---- The words ----

test("the markup hands the sentence over as one element", () => {
  // The bug the first browser walk found and this file had passed: the card
  // centres its line, which makes the paragraph a flex container, and a flex
  // container eats the whitespace at the ends of every bare-text run between its
  // element children — *Nimis heading for food.* So the assertion is structural
  // rather than about the words: whatever the sentence, the paragraph is handed
  // exactly one child.
  for (const key of DOING_ORDER) {
    const html = doingHTML("Nim", key);
    assert.match(html, /^<span class="d-said">.*<\/span>$/, `${key} is not wrapped`);
    assert.equal(html.split("</span>").length, 2, `${key} has more than one top-level element`);
    assert.match(html, /<\/b> \w/, `${key} lost the space after the name`);
  }
});

test("the line is a name and a predicate, and the markup says the same thing", () => {
  assert.equal(doingLine("Iris", "foraging"), "Iris is heading for food.");
  assert.equal(
    doingHTML("Iris", "foraging"),
    '<span class="d-said"><b class="d-name">Iris</b> is heading for food.</span>'
  );
  assert.equal(doingIcon("foraging"), DOINGS.foraging.icon);
  // A state this file does not know draws nothing rather than a broken sentence.
  assert.equal(doingLine("Iris", "brooding"), "");
  assert.equal(doingHTML("Iris", "brooding"), "");
  assert.equal(doingIcon("brooding"), "");
});

test("the invitation names both ways in — on the hardware that has both (v1.155)", () => {
  // This constant is the *pointer* copy now, and both of these claims are about
  // a mouse and a keyboard: it offers the click and the key because that reader
  // has them. The reader who has neither gets a different sentence, and
  // `test/hand.test.js` is where that pair is held to each other.
  assert.match(DOING_INVITE, /click/i);
  assert.match(DOING_INVITE, /\bM\b/);
  assert.equal(doingInvite(POINTER), DOING_INVITE);
  assert.notEqual(doingInvite(TOUCH), DOING_INVITE);
});

// ---- The hold ----

test("a line is held for its full time and then may change", () => {
  const w = new DoingWatch(1000);
  const c = subject();
  moving(c, STILL - 0.01);
  assert.equal(w.look(c, cfg, 0), "resting");

  // The truth changes immediately; the line does not.
  sees(c, "food", 0.9, true);
  moving(c, 0.5);
  assert.equal(w.look(c, cfg, 500), "resting");
  assert.equal(w.look(c, cfg, 999), "resting");
  assert.equal(w.look(c, cfg, 1000), "foraging");
});

test("nothing preempts the hold — not a chase, not a meal", () => {
  // The measurement in doing.js says preemption costs more staleness than it
  // buys legibility, so this is a rule and not an oversight.
  const w = new DoingWatch(1000);
  const c = subject();
  assert.equal(w.look(c, cfg, 0), "resting");
  sees(c, "threat", 0.9, false);
  moving(c, 0.5);
  assert.equal(w.look(c, cfg, 10), "resting");
  c.energy += 20;
  assert.equal(w.look(c, cfg, 20), "resting", "a meal does not jump the queue either");
});

test("a meal is a rise in energy, and the first look at anybody is never one", () => {
  const w = new DoingWatch(0);
  const c = subject();
  // The opening frame has nothing to compare against, and announcing a meal on
  // the frame somebody was picked is the one frame a visitor is sure to see.
  c.energy = cfg.energyMax * 0.6;
  assert.notEqual(w.look(c, cfg, 0), "ate");
  c.energy += 15;
  assert.equal(w.look(c, cfg, 1), "ate");
  // And it is the rise, not the level: the same energy next frame is not a meal.
  assert.notEqual(w.look(c, cfg, 2), "ate");
  c.energy -= 5;
  assert.notEqual(w.look(c, cfg, 3), "ate");
});

test("a new subject never inherits the last one's line or the last one's dinner", () => {
  const w = new DoingWatch(100000);
  const a = subject({ id: 1, energy: 10 });
  moving(a, STILL - 0.01);
  assert.equal(w.look(a, cfg, 0), "starving");

  // A different animal, well fed, arriving on a held line. Both the line and the
  // energy the meal detector compares against have to come with them — an
  // inherited energy of 10 would announce that this animal had just eaten.
  const b = subject({ id: 2, energy: cfg.energyMax * 0.6 });
  moving(b, STILL - 0.01);
  const said = w.look(b, cfg, 1);
  assert.equal(said, "resting", "the held line survived a change of subject");
  assert.notEqual(said, "ate", "one animal was credited with another's meal");
});

test("nobody selected, and a dead subject, both say nothing", () => {
  const w = new DoingWatch();
  const c = subject();
  assert.equal(w.look(c, cfg, 0), doingOf(c, cfg));
  assert.equal(w.look(null, cfg, 1), null);
  assert.equal(w.id, null, "the watch kept hold of somebody it is not watching");
  assert.equal(w.look(c, cfg, 2), doingOf(c, cfg));
  c.dead = true;
  assert.equal(w.look(c, cfg, 3), null);
});

test("the hold is stated in a reader's unit, not the pond's", () => {
  // 90 ticks at 1× on a 60 Hz frame. The number itself is argued in doing.js;
  // what is pinned here is that it is milliseconds and roughly a second and a
  // half, because the whole point of the constant is that it does not move when
  // the speed slider does.
  assert.ok(MIN_SHOW_MS >= 1000 && MIN_SHOW_MS <= 2500, `MIN_SHOW_MS is ${MIN_SHOW_MS}`);
});

// ---- What real ponds actually do ----

/** Follow four animals spread through the list, not four off the front (v1.146). */
function subjects(world) {
  const alive = world.creatures.filter((c) => !c.dead);
  return [0, 0.25, 0.5, 0.75].map((f) => alive[Math.floor(f * alive.length)]).filter(Boolean);
}

test("the raw state churns far faster than anybody can read, which is why there is a hold", () => {
  let samples = 0;
  let changes = 0;
  for (const seed of [42, 314, 2026]) {
    const world = new World(makeConfig({ seed }));
    for (let i = 0; i < 400; i++) world.step();
    const last = new Map();
    for (let t = 0; t < 1500; t++) {
      world.step();
      for (const c of subjects(world)) {
        if (c.dead) continue;
        const k = doingOf(c, world.config);
        if (last.has(c.id) && last.get(c.id) !== k) changes++;
        last.set(c.id, k);
        samples++;
      }
    }
  }
  const per1000 = (1000 * changes) / samples;
  // Measured at 68.9 over twelve seeds. Pinned loosely: what this protects is
  // that the raw signal is unreadable — several changes a second at 1× — and a
  // pond where it settled below about twenty would not need this module's hold.
  assert.ok(per1000 > 30, `raw churn fell to ${per1000.toFixed(1)} per 1,000 ticks`);
});

test("the hold cuts the churn by most of itself without freezing the line", () => {
  let samples = 0;
  let captions = 0;
  const seen = new Set();
  for (const seed of [42, 314, 2026]) {
    const world = new World(makeConfig({ seed }));
    for (let i = 0; i < 400; i++) world.step();
    // One watch per subject, on a clock of 1 ms per tick — a 1,500 ms hold is
    // then 1,500 ticks, so the hold is scaled to keep this test short: 90 ticks
    // of hold against a 1,500-tick run, which is the 1× ratio the constant was
    // measured at.
    const watches = new Map(subjects(world).map((c) => [c.id, new DoingWatch(90)]));
    for (let t = 0; t < 1500; t++) {
      world.step();
      for (const c of subjects(world)) {
        const w = watches.get(c.id);
        if (!w || c.dead) continue;
        const before = w.key;
        const said = w.look(c, world.config, t);
        if (said !== before) captions++;
        seen.add(said);
        samples++;
      }
    }
  }
  const per1000 = (1000 * captions) / samples;
  // Measured at 9.9 over twelve seeds against a raw 78.6 — an eighth. Pinned as
  // a band: below the floor the line would be frozen, above the ceiling it would
  // be back to flickering.
  assert.ok(per1000 > 2, `the held line stopped moving: ${per1000.toFixed(1)} per 1,000`);
  assert.ok(per1000 < 30, `the held line still flickers: ${per1000.toFixed(1)} per 1,000`);
  assert.ok(seen.size >= 4, `only ${seen.size} different things were ever said`);
});

test("the states a real pond spends its time in are the ordinary ones", () => {
  // Not a distribution test — a sanity one. If a pond spent its life in a single
  // state the panel would be a label rather than a line, and the states that
  // ought to dominate are the ones about food, because this is a pond about
  // finding food.
  const tally = new Map();
  let samples = 0;
  const world = new World(makeConfig({ seed: 137 }));
  for (let i = 0; i < 400; i++) world.step();
  for (let t = 0; t < 1500; t++) {
    world.step();
    for (const c of subjects(world)) {
      if (c.dead) continue;
      const k = doingOf(c, world.config);
      tally.set(k, (tally.get(k) ?? 0) + 1);
      samples++;
    }
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  assert.ok(tally.size >= 4, `a whole pond only ever did ${tally.size} things`);
  assert.ok(top[1] / samples < 0.8, `the pond spent ${top[1] / samples} of its life "${top[0]}"`);
});

test("a pond somebody is watching an animal in is bit for bit a pond nobody is", () => {
  // The determinism claim, made against the project's own state hash rather than
  // against a handful of fields — the whole world, every tick, watched and
  // unwatched, has to land on the same number.
  const run = (watch) => {
    const world = new World(makeConfig({ seed: 555 }));
    const w = new DoingWatch();
    for (let t = 0; t < 900; t++) {
      world.step();
      if (watch) {
        // Watch whoever is at the front, and keep changing subject as they die,
        // so the reset path is exercised as hard as the steady one.
        const c = world.creatures.find((x) => !x.dead) ?? null;
        w.look(c, world.config, t * 16);
      }
    }
    return stateFingerprint(world);
  };
  assert.equal(run(true), run(false));
});

// ---- The short form, and the crowd that wears it (v1.150) ----
//
// The words on the plates are a second surface reading one list, so what is
// worth pinning is that the list *has* a short form for everything it can say,
// that the short form stays short — the tempting edit to any of these words is
// to make it clearer, and clearer is longer — and that a plate and the strip
// under the pond are one sentence rather than two that agree today.

test("every state this file can say has a short word, and none of them runs long", () => {
  for (const key of DOING_ORDER) {
    const word = doingWord(key);
    assert.ok(word, `${key} has no short form, so a plate would show a bare name for it`);
    assert.ok(
      word.length <= MAX_WORD_CHARS,
      `"${word}" is ${word.length} characters, past the ${MAX_WORD_CHARS} a plate has room for`,
    );
    assert.equal(word, word.trim(), `"${word}" carries whitespace into a measured layout`);
  }
  assert.equal(new Set(DOING_ORDER.map(doingWord)).size, DOING_ORDER.length, "two states share a word");
  assert.equal(doingWord("no such state"), "", "an unknown state produced a word");
});

test("the short form is its own writing, not the sentence cut off", () => {
  // The point of holding a second column rather than deriving one: the two
  // shortest-tempered states share no wording at all with their sentences.
  assert.equal(doingWord("stalked"), "in danger");
  assert.ok(!DOINGS.stalked.phrase.includes("danger"), "the sentence already said it, so this proves nothing");
});

test("a crowd holds one line per animal, and they do not run together", () => {
  const a = subject({ id: 1 });
  const b = subject({ id: 2 });
  moving(a, 0.5);
  sees(a, "food", NEAR + 0.2);
  b.vx = 0;
  b.vy = 0;
  const crowd = new DoingCrowd();
  assert.equal(crowd.look(a, cfg, 0), "foraging");
  assert.equal(crowd.look(b, cfg, 0), "resting");
  assert.equal(crowd.size, 2);
  // Read back without looking again — the strip's route. It must not advance
  // anything: the same answers a moment later, off the same holds.
  assert.equal(crowd.keyOf(1), "foraging");
  assert.equal(crowd.keyOf(2), "resting");
  assert.equal(crowd.keyOf(999), null, "an unwatched id answered");
  // One animal's line changing does not disturb the other's.
  a._in.fill(0);
  a._in[0] = 1;
  assert.equal(crowd.look(a, cfg, MIN_SHOW_MS + 1), "searching");
  assert.equal(crowd.keyOf(2), "resting");
});

test("a crowd forgets whoever stops wearing a plate", () => {
  const a = subject({ id: 1 });
  const b = subject({ id: 2 });
  const crowd = new DoingCrowd();
  crowd.look(a, cfg, 0);
  crowd.look(b, cfg, 0);
  crowd.keep(new Set([1]));
  assert.equal(crowd.size, 1, "the map keeps everybody who has ever been in it");
  assert.equal(crowd.keyOf(2), null);
  crowd.reset();
  assert.equal(crowd.size, 0);
  assert.equal(crowd.look(null, cfg, 0), null, "nobody was given a line");
  assert.equal(crowd.look({ id: 3, dead: true }, cfg, 0), null, "the dead were given a line");
});

test("a new pond's creature is not the old one's, however its id falls", () => {
  // The failure a crowd can have and a single watch cannot: ids come back. Two
  // different animals, both id 1, the second with more energy than the first —
  // credited with a meal it did not eat, on the first frame of its own world.
  const crowd = new DoingCrowd();
  const before = subject({ id: 1, energy: cfg.energyMax * 0.5 });
  assert.equal(crowd.look(before, cfg, 0), "resting");
  const after = subject({ id: 1, energy: cfg.energyMax * 0.9 });
  assert.equal(
    crowd.look(after, cfg, MIN_SHOW_MS + 1),
    "resting",
    "a new animal inherited the last one's energy and was credited with its dinner",
  );
  assert.equal(crowd.size, 1, "the replaced animal's watch was kept as well as the new one's");
});

test("a crowd's hold is a watch's hold, because it is one", () => {
  const c = subject({ id: 7 });
  const crowd = new DoingCrowd();
  assert.equal(crowd.look(c, cfg, 0), "resting");
  moving(c, 0.5);
  sees(c, "food", NEAR + 0.2);
  assert.equal(crowd.look(c, cfg, MIN_SHOW_MS - 1), "resting", "the line changed before its time was up");
  assert.equal(crowd.look(c, cfg, MIN_SHOW_MS), "foraging", "the line never changed");
});
