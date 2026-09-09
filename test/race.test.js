// race.test.js — the panel that settles the argument in front of the visitor
// (v1.162).
//
// What is worth pinning here, in the order the module could break:
//
//  1. **The lanes are fair.** Everything this panel claims rests on the two
//     little ponds being identical apart from the ten brains in them, and the
//     only honest way to test that is to race a team against *itself* and
//     require a dead heat down to the step. A lane that drew one number out of
//     order would fail this and nothing else would ever notice.
//  2. **The pond on the page is untouched.** A visitor who races and a visitor
//     who does not must be watching the same world, bit for bit — so a
//     fingerprint is taken across a full race.
//  3. **The rules a lane changes are the rules it means to change**, and the
//     five that decide the *shape* of a brain are not among them.
//  4. **The words cover every ending**, including the two that are easy to
//     forget: a pond whose animals all starved, and a dead heat.
//  5. **The markup has somewhere to draw**, for every lane the module declares.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  ARENA,
  LANES,
  LARDER,
  RACE_AGAIN,
  RACE_CAP,
  RACE_GO,
  RACE_INVITE,
  RACE_NO_LIFE,
  RACE_NO_STOCK,
  RACE_RULES,
  RACE_RUNNING,
  STEPS_PER_FRAME,
  TEAM,
  arenaConfig,
  eaten,
  foundingStock,
  laneDone,
  laneLine,
  laneProgress,
  laneSay,
  pumpRace,
  raceOver,
  raceSeed,
  raceSignature,
  raceVerdict,
  startRace,
  stockFrom,
  winner,
} from "../src/race.js";
import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { stateFingerprint } from "../src/fingerprint.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

/** A pond, run on a bit. */
function pond(seed, ticks = 0, overrides = {}) {
  const config = makeConfig({ seed, ...overrides });
  const world = new World(config);
  const founding = foundingStock(world);
  while (world.tick < ticks) world.step();
  return { config, world, founding };
}

/** Run a race to the whistle, the way the frame loop does. */
function runRace(race) {
  let frames = 0;
  while (!raceOver(race)) {
    pumpRace(race, STEPS_PER_FRAME);
    if (++frames > RACE_CAP) throw new Error("a race that will not end");
  }
  return race;
}

test("a team racing itself is a dead heat, step for step", () => {
  // The whole panel rests on this. Both lanes get the *same* ten genomes, so
  // anything that separates them is the lanes being unequal — a draw taken out
  // of order, a config the two do not share, a placement that depends on which
  // lane was built first.
  const { config, founding } = pond(314, 0);
  // Both lanes onto one stock, by racing the founders against a pond that holds
  // exactly them.
  const same = startRace(config, founding, {
    creatures: founding.map((g) => ({ dead: false, genome: g })),
  });
  assert.ok(same.sameStock, "the two lanes really are holding the same animals");
  runRace(same);
  const [then, now] = same.lanes;
  assert.equal(then.clearedAt, now.clearedAt);
  assert.equal(then.starvedAt, now.starvedAt);
  assert.equal(then.left, now.left);
  assert.equal(then.alive, now.alive);
  assert.equal(winner(same), null, "identical teams cannot separate");
  const said = raceVerdict(same);
  assert.equal(said.mark, "🤝");
  assert.match(said.verdict, /dead heat/i);
});

test("a pond nobody has run yet races itself to a draw, and the words say so", () => {
  // The state a first-time visitor can reach in one press, and the one place a
  // panel like this could look broken. It is not broken — it is the fairness of
  // the lanes proving itself — so the sentence has to point at the way out.
  const { config, world, founding } = pond(42, 0);
  const race = runRace(startRace(config, founding, world));
  assert.equal(winner(race), null);
  assert.match(raceVerdict(race).why, /Skip ahead/);
});

test("racing does not move the pond by a bit", () => {
  // The promise every other panel here makes, made by the one panel that runs
  // its own worlds: a visitor who presses this button is watching exactly the
  // world of a visitor who never finds it.
  const { config, world, founding } = pond(7, 1200);
  const before = stateFingerprint(world);
  const tick = world.tick;
  const race = runRace(startRace(config, founding, world));
  assert.ok(race.step > 0);
  assert.equal(world.tick, tick, "a race steps its own worlds and nothing else");
  assert.equal(stateFingerprint(world), before);
  // And the pond is still the same pond *going forward*, which is the stronger
  // claim: a stolen random number shows up in the next thousand steps, not in
  // the state it was stolen from.
  const raced = new World(makeConfig({ seed: 7 }));
  while (raced.tick < 1200) raced.step();
  runRace(startRace(config, founding, raced));
  const clean = new World(makeConfig({ seed: 7 }));
  while (clean.tick < 1200) clean.step();
  for (let i = 0; i < 400; i++) {
    raced.step();
    clean.step();
  }
  assert.equal(stateFingerprint(raced), stateFingerprint(clean));
});

test("the same pond races the same race twice", () => {
  const { config, world, founding } = pond(101, 800);
  const a = runRace(startRace(config, founding, world));
  const b = runRace(startRace(config, founding, world));
  assert.equal(raceSignature(a), raceSignature(b));
  assert.equal(raceVerdict(a).verdict, raceVerdict(b).verdict);
});

test("today's animals beat the pond's first animals", () => {
  // The measurement the panel exists for, held at one seed so a change that
  // quietly breaks the comparison — a lane stocked from the wrong list, an
  // arena rule that flattens the difference — fails the build. The sweep behind
  // it (12 seeds × 3 ages, 34 wins of 36) is in the module header; this is the
  // one case the suite can afford to run.
  const { config, world, founding } = pond(314, 4000);
  const race = runRace(startRace(config, founding, world));
  const won = winner(race);
  assert.ok(won, "these two are not the same animals any more");
  assert.equal(won.id, "now");
  assert.ok(won.clearedAt !== null, "and they cleared the pond outright");
});

test("a lane is always ten strong, even out of a pond that is nearly empty", () => {
  const four = { creatures: [1, 2, 3, 4].map((n) => ({ dead: false, genome: { clone: () => n } })) };
  assert.equal(stockFrom(four).length, TEAM);
  assert.equal(stockFrom({ creatures: [] }), null);
  assert.equal(stockFrom({ creatures: [{ dead: true, genome: { clone: () => 1 } }] }), null);
  // Evenly spaced, oldest first, wrapping — never the best few, which would be
  // the panel choosing its own winner.
  assert.deepEqual(stockFrom(four, 4), [1, 2, 3, 4]);
  assert.deepEqual(stockFrom(four, 2), [1, 3]);
});

test("only a newborn pond has first moments to race", () => {
  const world = new World(makeConfig({ seed: 5 }));
  assert.equal(foundingStock(world).length, TEAM);
  world.step();
  assert.equal(foundingStock(world), null, "a world restored from a file began somewhere else");
  assert.equal(foundingStock(null), null);
  assert.equal(startRace(makeConfig({ seed: 5 }), null, world), null, "and cannot be raced");
});

test("the arena changes the rules it means to and no others", () => {
  const config = makeConfig({ seed: 9, signalling: true, groundSense: true, wallSense: true });
  const cfg = arenaConfig(config, 9);
  assert.equal(cfg.foodSpawnRate, 0, "the larder is fixed — this is the race");
  assert.equal(cfg.foodMax, LARDER);
  assert.equal(cfg.autoReseed, false, "the team is the team");
  assert.equal(cfg.predation, false, "a foraging race is not settled by eating the competition");
  assert.equal(cfg.populationStart, TEAM);
  // The five that decide the shape of a brain. A lane that changed one would be
  // running today's animals on a mind with the wrong number of inputs.
  for (const flag of ["signalling", "groundSense", "wallSense", "plasticity", "evolvableTopology"]) {
    assert.equal(cfg[flag], config[flag], `${flag} decides a brain's shape and is not a lane's to change`);
    assert.ok(!(flag in ARENA), `${flag} must not appear in the arena's overrides`);
  }
  // And the lane's own crop is not the pond's first eighty specks.
  assert.notEqual(cfg.seed, config.seed);
  assert.equal(cfg.seed, raceSeed(config.seed));
  assert.ok(raceSeed(-12) >= 0, "a negative seed still names a lane");
});

test("the larder only ever goes down, and the two halves add up", () => {
  const { config, world, founding } = pond(2718, 600);
  const race = startRace(config, founding, world);
  const seen = race.lanes.map(() => LARDER);
  while (!raceOver(race)) {
    pumpRace(race, STEPS_PER_FRAME);
    race.lanes.forEach((lane, i) => {
      assert.ok(lane.left <= seen[i], "nothing grows in a lane");
      seen[i] = lane.left;
      assert.equal(eaten(lane) + lane.left, LARDER);
      assert.ok(laneProgress(lane) >= 0 && laneProgress(lane) <= 1);
    });
  }
  assert.ok(race.step <= RACE_CAP, "the whistle goes");
  for (const lane of race.lanes) {
    if (lane.clearedAt !== null) assert.equal(lane.left, 0);
    if (lane.starvedAt !== null) assert.equal(lane.alive, 0);
  }
});

test("a finished lane stops running", () => {
  // A lane that kept stepping after it cleared would show ten animals milling
  // about an empty pond under the sentence "cleared it in 248 steps".
  const { config, world, founding } = pond(314, 4000);
  const race = runRace(startRace(config, founding, world));
  const done = race.lanes.find((l) => laneDone(l));
  assert.ok(done, "somebody finished");
  const at = done.world.tick;
  pumpRace(race, 60);
  assert.equal(done.world.tick, at);
});

test("every ending has a sentence, and none of them reaches for a word a visitor may not have", () => {
  const JARGON =
    /\b(carnivor\w*|herbivor\w*|lineage|genome|genotype|allele|tick|ticks|px|pixels?|predation|neuroevolution|fitness|phenotype|forag\w*|RNG|seed)\b/i;
  const lane = (id, label, over) => ({ id, label, left: LARDER, alive: TEAM, clearedAt: null, starvedAt: null, ...over });
  const cases = [
    // both cleared, today faster; both cleared, day one faster; one cleared;
    // one starved; neither finished; a dead heat.
    [lane("then", "Day one", { clearedAt: 545, left: 0 }), lane("now", "Today", { clearedAt: 248, left: 0 })],
    [lane("then", "Day one", { clearedAt: 248, left: 0 }), lane("now", "Today", { clearedAt: 545, left: 0 })],
    [lane("then", "Day one", { left: 31 }), lane("now", "Today", { clearedAt: 248, left: 0 })],
    [lane("then", "Day one", { left: 44, alive: 0, starvedAt: 610 }), lane("now", "Today", { clearedAt: 300, left: 0 })],
    [lane("then", "Day one", { left: 51 }), lane("now", "Today", { left: 22 })],
    // the winner starved too, and still got through more
    [lane("then", "Day one", { left: 20, alive: 0, starvedAt: 700 }), lane("now", "Today", { left: 40 })],
    [lane("then", "Day one", { left: 1 }), lane("now", "Today", { left: 1 })],
  ];
  for (const lanes of cases) {
    const race = { step: RACE_CAP, lanes };
    const said = raceVerdict(race);
    assert.ok(said.verdict.length > 0 && said.why.length > 0);
    assert.match(said.mark, /\p{Emoji}/u);
    for (const s of [said.verdict, said.why, ...lanes.map(laneSay)]) {
      assert.doesNotMatch(s, JARGON, `"${s}" uses a word only somebody already here knows`);
      assert.match(s, /[.?]$/, `"${s}" is a sentence`);
    }
    // A lane's own line is a fragment by design — it sits under a picture with
    // the lane's name on it — so it is checked for the words and not the stop.
    for (const s of lanes.map(laneLine)) assert.doesNotMatch(s, JARGON);
  }
  for (const s of [RACE_INVITE, RACE_NO_STOCK, RACE_NO_LIFE, RACE_RULES]) {
    assert.doesNotMatch(s, JARGON, `"${s}" uses a word only somebody already here knows`);
  }
  // A verdict is a sentence and a lane's line is a caption, and the failure
  // that made them two functions was reusing one as the other: `Day one's
  // animals 51 specks left.`
  const stuck = raceVerdict({ step: RACE_CAP, lanes: [lane("then", "Day one", { left: 51 }), lane("now", "Today", { left: 22 })] });
  assert.match(stuck.verdict, /Today's animals got through 58 of the 80\./);
  assert.match(stuck.verdict, /Day one's got through 29\./);
  // The one number in a lane's line is a count, and a count of one loses its s.
  assert.match(laneLine(lane("now", "Today", { left: 1 })), /1 speck left/);
  assert.match(laneLine(lane("now", "Today", { left: 2 })), /2 specks left/);
});

test("the key on the panel moves when anything on it does", () => {
  const base = { step: 10, lanes: [{ id: "then", left: 40, alive: 9, clearedAt: null, starvedAt: null }] };
  const sig = raceSignature(base);
  assert.notEqual(sig, raceSignature({ ...base, step: 11 }));
  assert.notEqual(sig, raceSignature({ ...base, lanes: [{ ...base.lanes[0], left: 39 }] }));
  assert.notEqual(sig, raceSignature({ ...base, lanes: [{ ...base.lanes[0], alive: 8 }] }));
  assert.equal(raceSignature(null), "idle");
});

test("the page has somewhere to draw every lane the module declares", () => {
  const html = read("app/index.html");
  assert.equal(LANES.length, 2, "two lanes is what makes it a race");
  for (const lane of LANES) {
    for (const part of ["water", "fill", "line"]) {
      assert.ok(html.includes(`id="lane-${lane.id}-${part}"`), `lane ${lane.id} has no ${part}`);
    }
    assert.ok(html.includes(`id="lane-${lane.id}"`));
    assert.ok(html.includes(lane.label), `the page never says "${lane.label}"`);
  }
  assert.ok(html.includes('id="btn-race"'));
  // The sentence the document ships for the frames before any script runs is a
  // copy of the module's, and a copy is a stale sentence waiting to happen — so
  // the two are checked against each other rather than left to drift.
  const invite = html.match(/<p class="race-invite" id="race-invite">([\s\S]*?)<\/p>/);
  assert.ok(invite, "the panel has no opening line");
  assert.equal(invite[1].replace(/\s+/g, " ").trim(), RACE_INVITE);
  // …and the small print is *not* in the document, because it is written from
  // the constant on the frame a race starts.
  assert.ok(!html.includes(RACE_RULES), "the rules are written from the module, not typed here");
});

test("the button's three words are three different words", () => {
  const words = new Set([RACE_GO, RACE_RUNNING, RACE_AGAIN]);
  assert.equal(words.size, 3);
  for (const w of words) assert.match(w, /^🏁/, "the same mark on every state of one button");
});

test("the module draws no random numbers and touches no page", () => {
  const src = read("src/race.js");
  assert.doesNotMatch(src, /Math\.random/, "a race is reproducible or it is not a measurement");
  assert.doesNotMatch(src, /\b(document|window)\s*\./, "the adapter onto the DOM is main.js");
});
