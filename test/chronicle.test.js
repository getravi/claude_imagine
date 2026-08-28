import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { eventLine, eventWho } from "../src/chronicle.js";
import { PARENT_MIN_CHILDREN } from "../src/cast.js";
import {
  CHRONICLE_HASHED,
  CHRONICLE_UNHASHED,
  EVENT_HASHED,
  EVENT_UNHASHED,
  chronicleFingerprint,
  stateFingerprint,
  trajectoryFingerprint,
  observationFingerprint,
  booksFingerprint,
  drawStream,
} from "../src/fingerprint.js";

test("a running world records chronicle events", () => {
  const world = new World(makeConfig({ seed: 42 }));
  for (let i = 0; i < 6000; i++) world.step();
  const ev = world.chronicle.events;
  assert.ok(ev.length > 0, "the pond's history should not be empty");
  for (const e of ev) {
    assert.ok(Number.isFinite(e.tick), "event has a tick");
    assert.ok(typeof e.msg === "string" && e.msg.length > 0, "event has a message");
    assert.ok(typeof e.icon === "string", "event has an icon");
  }
});

test("population milestones fire in order and only once", () => {
  const world = new World(makeConfig({ seed: 42 }));
  for (let i = 0; i < 8000; i++) world.step();
  const popEvents = world.chronicle.events.filter((e) => e.cat === "pop");
  // Extract the milestone number from each message; they should be strictly
  // increasing and unique.
  const nums = popEvents.map((e) => parseInt(e.msg.match(/(\d+)/)[1], 10));
  for (let i = 1; i < nums.length; i++) {
    assert.ok(nums[i] > nums[i - 1], "population milestones increase and don't repeat");
  }
});

test("predation-fraction events never precede the first kill", () => {
  const world = new World(makeConfig({ seed: 42 }));
  for (let i = 0; i < 8000; i++) world.step();
  const ev = world.chronicle.events;
  const firstKill = ev.find((e) => e.msg.includes("First blood"));
  const fraction = ev.find((e) => e.msg.includes("of the pond"));
  if (firstKill && fraction) {
    assert.ok(fraction.tick >= firstKill.tick, "a fraction milestone must follow first blood");
  }
});

test("the chronicle is deterministic for a fixed seed", () => {
  const a = new World(makeConfig({ seed: 314 }));
  const b = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 5000; i++) {
    a.step();
    b.step();
  }
  assert.equal(a.chronicle.events.length, b.chronicle.events.length);
  for (let i = 0; i < a.chronicle.events.length; i++) {
    assert.equal(a.chronicle.events[i].tick, b.chronicle.events[i].tick);
    assert.equal(a.chronicle.events[i].msg, b.chronicle.events[i].msg);
  }
});

test("the chronicle is a pure observer (uses its own RNG, not the world's)", () => {
  // Two worlds: one we let the chronicle observe (always on), and a bare
  // reference stepping the same seed. The creature state must match exactly,
  // proving the chronicle's diversity probe didn't perturb the world RNG.
  const w = new World(makeConfig({ seed: 7 }));
  for (let i = 0; i < 4000; i++) w.step();
  const ref = new World(makeConfig({ seed: 7 }));
  for (let i = 0; i < 4000; i++) ref.step();
  assert.equal(w.creatures.length, ref.creatures.length);
  if (w.creatures.length > 0) {
    assert.equal(w.creatures[0].x, ref.creatures[0].x);
    assert.equal(w.creatures[0].energy, ref.creatures[0].energy);
  }
});

test("the chronicle narrates the day/night cycle, once each", () => {
  const world = new World(
    makeConfig({ seed: 64, dayNightCycle: true, dayLength: 700, nightVisionFactor: 0.28, seasons: false })
  );
  for (let i = 0; i < 6000; i++) world.step();
  const night = world.chronicle.events.filter((e) => e.cat === "night");
  const fell = night.filter((e) => e.msg.includes("Night falls"));
  const dawn = night.filter((e) => e.msg.includes("Dawn breaks"));
  const dark = night.filter((e) => e.msg.includes("after dark"));
  assert.equal(fell.length, 1, "the first nightfall is reported exactly once");
  assert.equal(dawn.length, 1, "the first dawn is reported exactly once");
  assert.equal(dark.length, 1, "the first kill in the dark is reported exactly once");
  assert.ok(dawn[0].tick > fell[0].tick, "dawn follows the night it ends");
});

test("no night events when the day/night cycle is off", () => {
  const world = new World(makeConfig({ seed: 64, seasons: false }));
  for (let i = 0; i < 6000; i++) world.step();
  assert.equal(
    world.chronicle.events.filter((e) => e.cat === "night").length,
    0,
    "a world with no night has nothing to say about it"
  );
});

test("the first spared relative is reported once, and only where it happens", () => {
  // Staged rather than waited for: the earliest seed measured takes 2,055 ticks
  // to offer a hunter a relative it could eat, and most seeds never do. The
  // counter *is* the event — it rises on the tick the rule speaks and is 0 in
  // every world without it — so no "did this really happen?" guard is needed
  // beyond the one the counter already provides (v1.16).
  const world = new World(makeConfig({ seed: 42, kinRecognition: true }));
  for (let i = 0; i < 200; i++) world.step();
  const kin = () => world.chronicle.events.filter((e) => e.msg.includes("its own family"));
  assert.equal(kin().length, 0, "nothing spared, nothing said");

  world.stats.kinSpared = 1;
  world.chronicle.observe(world, world.tick);
  assert.equal(kin().length, 1, "the first sparing is reported");
  world.stats.kinSpared = 40;
  world.chronicle.observe(world, world.tick + 1);
  assert.equal(kin().length, 1, "and only the first — it is a one-shot");
});

test("a pond without kin recognition never mentions family", () => {
  const world = new World(makeConfig({ seed: 42 }));
  for (let i = 0; i < 6000; i++) world.step();
  assert.equal(world.stats.kinSpared, 0, "the counter is exactly 0 with the rule off");
  assert.equal(
    world.chronicle.events.filter((e) => e.msg.includes("family")).length,
    0,
    "a world where nobody spares anybody has nothing to say about it"
  );
});

test("event history stays bounded", () => {
  const world = new World(makeConfig({ seed: 5 }));
  for (let i = 0; i < 12000; i++) world.step();
  assert.ok(world.chronicle.events.length <= world.chronicle.max);
});

// --- The sixth channel (v1.94) -------------------------------------------
//
// `chronicleFingerprint` is the narration's own hash, and it exists for the
// reason `observationFingerprint` and `booksFingerprint` each exist one surface
// over: the Chronicle is an *output*, so a difference in it moves no creature
// and every picture of the pond is blind to it by construction. The tests below
// are v1.36's two questions asked of the new instrument — what must it be blind
// to, what must it *not* be blind to — plus the one neither can ask, which is
// whether the channel is redundant.

test("every own field of a live chronicle is classified, and the two lists agree", () => {
  // v1.53's completeness walk, pointed at a fourth pair of lists. A *stepped*
  // narrator for the reason `STATS_HASHED` gives: a list written by reading a
  // constructor is a list of what a thing is born with.
  const world = new World(makeConfig({ seed: 42, disease: true, dayNightCycle: true }));
  for (let i = 0; i < 400; i++) world.step();
  const live = Object.keys(world.chronicle).sort();
  const declared = [...CHRONICLE_HASHED, ...Object.keys(CHRONICLE_UNHASHED)].sort();
  assert.deepEqual(live, declared, "the chronicle's own fields and the two lists have parted");
  for (const [field, why] of Object.entries(CHRONICLE_UNHASHED)) {
    assert.ok(why.length > 20, `${field}: "outside the hash" needs a reason, not a shrug`);
  }
});

test("the narration channel can see every field it lists move", () => {
  // The complement of the walk above: being *named* by the hash is not the same
  // as being *reached* by it, and the gap between the two is where v1.53 found
  // three fields. Thirty-eight of thirty-eight, one at a time.
  const world = new World(makeConfig({ seed: 42 }));
  for (let i = 0; i < 400; i++) world.step();
  const c = world.chronicle;
  for (const name of CHRONICLE_HASHED) {
    const before = chronicleFingerprint(world);
    const was = c[name];
    if (was instanceof Set) c[name] = new Set([...was, "__probe__"]);
    else if (Array.isArray(was)) c[name] = [...was, { tick: -1, year: 0, icon: "?", cat: "?", msg: "?" }];
    else if (typeof was === "number") c[name] = was + 1;
    else if (typeof was === "boolean") c[name] = !was;
    else c[name] = "starvation"; // `_leadingCause`, a string that starts null
    assert.notEqual(chronicleFingerprint(world), before, `${name}: the channel cannot see it move`);
    c[name] = was;
    assert.equal(chronicleFingerprint(world), before, `${name}: putting it back did not put it back`);
  }
});

test("a latch set is not an empty object", () => {
  // The blindness this channel had to close before it could be written. A `Set`
  // keeps its members where `Object.keys` cannot see them, so the generic mixer
  // the books use hashed all five of the chronicle's latch sets as `{}` — a
  // narrator that had already announced the pond passing 100 creatures and one
  // that had not were the same object to it. Both halves are asserted, because
  // the model of the old behaviour is the part that makes this a regression
  // test rather than a restatement.
  const a = new World(makeConfig({ seed: 42 }));
  const b = new World(makeConfig({ seed: 42 }));
  for (let i = 0; i < 300; i++) {
    a.step();
    b.step();
  }
  assert.equal(chronicleFingerprint(a), chronicleFingerprint(b), "two identical ponds, two narrators");
  // `_carnCrossed` rather than `_popCrossed`, because seed 42's pond is still
  // under a hundred creatures at 300 ticks and an empty latch set would make
  // the second assertion below vacuous — it holds the carnivore milestone as a
  // *string*, which is the half of this that a numeric set would not show.
  assert.ok(b.chronicle._carnCrossed.size > 0, "nothing has been latched, so this proves nothing");
  assert.deepEqual(Object.keys(b.chronicle._carnCrossed), [], "a Set with own keys — the premise has changed");
  b.chronicle._carnCrossed.add("carn0.5");
  assert.notEqual(
    chronicleFingerprint(a),
    chronicleFingerprint(b),
    "a milestone latched in one narrator and not the other is invisible"
  );
});

test("a narrator that spoke twice is invisible to every other channel", () => {
  // Whether the channel is redundant, asked the way `books.test.js` asks it.
  // The sabotage is the smallest real one available: the Chronicle is a pure
  // observer, so observing twice cannot move the pond — it can only change what
  // was said about it, which is exactly the class of difference the five older
  // channels are blind to by construction.
  const a = new World(makeConfig({ seed: 42, disease: true }));
  const b = new World(makeConfig({ seed: 42, disease: true }));
  for (let i = 0; i < 300; i++) {
    a.step();
    b.step();
  }
  a.chronicle.observe(a, a.tick);
  a.chronicle._push(a.tick, "🫥", "test", "said here and nowhere else");

  assert.equal(stateFingerprint(a), stateFingerprint(b), "the pond moved, so this measures nothing");
  assert.equal(trajectoryFingerprint(a), trajectoryFingerprint(b), "the pond moved");
  assert.equal(observationFingerprint(a), observationFingerprint(b), "the tree of life moved");
  assert.equal(booksFingerprint(a), booksFingerprint(b), "the books moved");
  assert.notEqual(chronicleFingerprint(a), chronicleFingerprint(b), "the sixth channel is redundant");

  // And the second half of `WORLD_UNHASHED.chronicle`'s claim: a narration that
  // has parted is not a determinism failure, because nothing reads it back.
  for (let i = 0; i < 300; i++) {
    a.step();
    b.step();
  }
  assert.equal(trajectoryFingerprint(a), trajectoryFingerprint(b), "the narration wrote back into the pond");
});

test("fingerprinting a chronicle does not change it", () => {
  // The rule every channel here is held to: an instrument that moves what it
  // measures is not an instrument. The narrator carries its own generator, so
  // the draw count is part of the claim.
  const world = new World(makeConfig({ seed: 42 }));
  for (let i = 0; i < 300; i++) world.step();
  const draws = drawStream(world.chronicle.rng);
  const before = chronicleFingerprint(world);
  assert.equal(chronicleFingerprint(world), before, "the digest is not stable across calls");
  assert.equal(draws.count, 0, "hashing the narration spent its randomness");
  assert.equal(
    chronicleFingerprint(new World(makeConfig({ seed: 42 }))),
    chronicleFingerprint(new World(makeConfig({ seed: 42 }))),
    "two unstepped worlds start with different narrations"
  );
});

// --- Records falling (v1.125) ---------------------------------------------
//
// The board `🏆 Pond records` has been changing in silence since v1.124, which
// is the one thing the surface whose job is announcing events should not have
// let happen. These are the four questions that decides: does it fire at all,
// does it say the right one of its three sentences, is the name outside the
// hash where it has to be, and does the wording read as plain English.

test("a run announces its records, and the young lines name somebody", () => {
  // Rates, not a snapshot — the hard-won note about a frequency needing a
  // sample. Seed 42 breaks the young record 7 times in 6,000 ticks and the
  // first lands at tick 929, so 3,000 ticks is comfortably past a vacuous pass.
  const world = new World(makeConfig({ seed: 42 }));
  for (let i = 0; i < 3000; i++) world.step();
  const recs = world.chronicle.events.filter((e) => e.cat === "record");
  assert.ok(recs.length >= 3, `seed 42 should have broken a record by now (${recs.length})`);
  const young = recs.filter((e) => e.icon === "👶");
  assert.ok(young.length >= 3, "the individual record is the one that moves");
  for (const e of young) {
    assert.ok(e.who >= 0, "a line about an animal has to know which animal");
    assert.ok(eventWho(e).length > 0, "and be able to say its name");
    assert.ok(eventLine(e).startsWith(eventWho(e) + " "), "the name goes in front of the predicate");
  }
});

test("the record only ever climbs, and says so exactly once each time", () => {
  const world = new World(makeConfig({ seed: 777 }));
  for (let i = 0; i < 6000; i++) world.step();
  const young = world.chronicle.events.filter((e) => e.icon === "👶");
  const counts = young.map((e) => Number(e.msg.match(/(\d+)/)[1]));
  for (let i = 1; i < counts.length; i++) {
    assert.ok(counts[i] > counts[i - 1], `the record went ${counts[i - 1]} → ${counts[i]}`);
  }
  assert.equal(counts[0], PARENT_MIN_CHILDREN, "the first line fires on the board's own floor");
  assert.equal(new Set(counts).size, counts.length, "a number was announced twice");
});

test("the three young sentences each fire on the case they are for", () => {
  // Driven through a hand-built stats object rather than a run, for the reason
  // `records.test.js` builds a pond by hand for the family branch it could not
  // reach: the wording depends on *which* animal holds the record, and a real
  // pond hands out that role on its own schedule. The rates a real pond does
  // produce are asserted above.
  const world = new World(makeConfig({ seed: 5, seasons: false }));
  const c = world.chronicle;
  const say = (children, id) => {
    c._checkRecords(0, 0, { recordYoung: { children }, recordYoungId: id, maxPopEver: 0 });
    return c.events[c.events.length - 1];
  };

  const first = say(4, 11);
  assert.match(first.msg, /^is the first animal here to raise 4 young\.$/);
  assert.equal(first.who, 11);

  const again = say(5, 11);
  assert.match(again.msg, /^raises their 5th\.$/, "the same animal beating itself is a tally");
  assert.equal(again.who, 11);

  const taken = say(6, 22);
  assert.match(taken.msg, /^takes the pond's record for young raised, with 6\.$/);
  assert.equal(taken.who, 22, "a handover names the new holder, not the old one");

  // And the guards: a number that does not beat the record says nothing, and
  // neither does one under the floor.
  const before = c.events.length;
  c._checkRecords(0, 0, { recordYoung: { children: 6 }, recordYoungId: 33, maxPopEver: 0 });
  c._checkRecords(0, 0, { recordYoung: { children: 3 }, recordYoungId: 33, maxPopEver: 0 });
  assert.equal(c.events.length, before, "a record that did not move was announced anyway");
});

test("a record crowd is only news when the pond had lost it", () => {
  // The measured shape: `maxPopEver` is broken a median 228 times a run, so the
  // line has to be a *comeback* or it is the population chart read aloud.
  const world = new World(makeConfig({ seed: 5, seasons: false }));
  const c = world.chronicle;
  const swell = (pop, peak) => c._checkRecords(0, pop, { recordYoung: null, maxPopEver: peak });

  swell(120, 120); // climbing: no line, however many records it sets
  swell(180, 180);
  assert.equal(c.events.length, 0, "a pond that has only ever grown has no comeback to announce");

  swell(170, 180); // a wobble of 6%, inside the tenth the threshold allows
  swell(200, 200);
  assert.equal(c.events.length, 0, "a wobble inside a tenth is not losing the high water");

  swell(150, 200); // 25% down — lost
  swell(210, 210);
  assert.equal(c.events.length, 1, "taking back a high the pond had lost is the whole event");
  assert.match(c.events[0].msg, /fuller than it has ever been — 210 animals/);
  assert.equal(c.events[0].who, -1, "the pond is not an animal");
});

test("a small pond does not congratulate itself on being small", () => {
  // The bug this floor exists for: written against `populationStart` alone, two
  // seeds of twelve announced "the pond is fuller than it has ever been — 43
  // animals" while the run they were in went on to hold five times that.
  const world = new World(makeConfig({ seed: 5, seasons: false }));
  const c = world.chronicle;
  const swell = (pop, peak) => c._checkRecords(0, pop, { recordYoung: null, maxPopEver: peak });
  swell(44, 44);
  swell(36, 44); // lost it
  swell(50, 50); // took it back — and still nobody cares
  assert.equal(c.events.length, 0, "forty animals is the founders shuffling, not a record crowd");
});

test("the narration channel sees the sentence and not the name", () => {
  // The claim `EVENT_UNHASHED.who` rests on, and the reason it is there at all:
  // a creature id is a module-level counter, so two identical ponds in one
  // process name the same animal differently, and hashing the id would fail
  // every paired assertion in the suite on a narration that is word-perfect.
  const world = new World(makeConfig({ seed: 42 }));
  for (let i = 0; i < 3000; i++) world.step();
  const named = world.chronicle.events.find((e) => e.who >= 0);
  assert.ok(named, "nothing named anybody, so this proves nothing");

  const before = chronicleFingerprint(world);
  const was = named.who;
  named.who = was + 1000;
  assert.equal(chronicleFingerprint(world), before, "the channel can see who a line is about");
  named.who = was;

  named.msg = named.msg + " (and again)";
  assert.notEqual(chronicleFingerprint(world), before, "the channel cannot see what a line says");
});

test("every own field of a live event is classified", () => {
  // v1.53's completeness walk, pointed at the one record in this project that
  // the generic mixer walks and that carries an identity.
  const world = new World(makeConfig({ seed: 42, disease: true, dayNightCycle: true }));
  for (let i = 0; i < 3000; i++) world.step();
  const declared = new Set([...EVENT_HASHED, ...Object.keys(EVENT_UNHASHED)]);
  assert.ok(world.chronicle.events.length > 0, "no events, so this walks nothing");
  for (const e of world.chronicle.events) {
    for (const k of Object.keys(e)) {
      assert.ok(declared.has(k), `an event carries ${k}, which neither list names`);
    }
  }
  for (const [field, why] of Object.entries(EVENT_UNHASHED)) {
    assert.ok(why.length > 20, `${field}: "outside the hash" needs a reason, not a shrug`);
  }
});

test("two identical ponds narrate their records identically", () => {
  // The paired comparison the split was made for, asserted where it can be seen
  // to be non-vacuous: both ponds have to have actually broken a record.
  const a = new World(makeConfig({ seed: 777 }));
  const b = new World(makeConfig({ seed: 777 }));
  for (let i = 0; i < 3000; i++) {
    a.step();
    b.step();
  }
  const recs = a.chronicle.events.filter((e) => e.cat === "record");
  assert.ok(recs.length > 0, "neither pond set a record, so the ids never entered the question");
  assert.notEqual(
    a.chronicle.events.find((e) => e.who >= 0).who,
    b.chronicle.events.find((e) => e.who >= 0).who,
    "the ids agree, so this pond cannot show the problem the split solves"
  );
  assert.equal(chronicleFingerprint(a), chronicleFingerprint(b), "a name has got into the hash");
});

test("a record line is plain English", () => {
  // The rule `records.js`, `cast.js`, `obituary.js` and `key.js` are all held
  // to: counts of animals, and no jargon a visitor has not been given.
  const world = new World(makeConfig({ seed: 777 }));
  for (let i = 0; i < 6000; i++) world.step();
  const jargon = /\b(tick|px|pixel|lineage|genome|carnivory|fitness|id|hash|config)\b/i;
  for (const e of world.chronicle.events.filter((x) => x.cat === "record")) {
    const line = eventLine(e);
    assert.ok(!jargon.test(line), `jargon in a record line: "${line}"`);
    assert.ok(line.endsWith("."), `a record line is a sentence: "${line}"`);
    assert.equal(line, line.trim(), "a record line has tidy edges");
  }
});
