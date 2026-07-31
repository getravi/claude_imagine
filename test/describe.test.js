// describe.test.js — the pond's text form.
//
// Two things are being protected here. The first is the same guarantee every
// observer in this project carries: describing a world must not change it. The
// second is subtler and is where a spoken interface goes wrong — saying too
// much. A description that mentions a mechanic which is switched off, or a live
// region that repeats itself, is not a small cosmetic flaw for a listener; it is
// the entire interface.

import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { Camera } from "../src/camera.js";
import {
  describePond,
  describePower,
  pendingSpeech,
  seasonLabel,
  timeOfDayLabel,
  MAX_SPOKEN,
} from "../src/describe.js";
import { energySeries, energyField } from "../src/energy.js";

const ev = (tick, msg) => ({ tick, year: 0, icon: "•", cat: "test", msg });

test("the description carries what the canvas shows", () => {
  const world = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 400; i++) world.step();
  const text = describePond(world, world.config);

  assert.match(text, /^The pond at tick 400: /);
  assert.ok(
    text.includes(`${world.creatures.length.toLocaleString()} creature`),
    `population missing from: ${text}`
  );
  assert.ok(
    text.includes(`${world.food.items.length.toLocaleString()} food pellet`),
    `food missing from: ${text}`
  );
  assert.match(text, /generation \d+\./);
});

test("a mechanic that is off is not mentioned", () => {
  // The spoken form of the rule the HUD already follows: a readout showing a
  // steady, plausible zero for something that cannot happen is worse than no
  // readout. Here it costs a listener their time, sentence by sentence.
  const world = new World(
    makeConfig({
      seed: 7,
      seasons: false,
      dayNightCycle: false,
      predation: false,
      disease: false,
    })
  );
  for (let i = 0; i < 200; i++) world.step();
  const text = describePond(world, world.config);

  assert.doesNotMatch(text, /Summer|Winter|Spring|Autumn|year/i);
  assert.doesNotMatch(text, /\b(Day|Night|Dawn|Dusk)\b/);
  assert.doesNotMatch(text, /hunt/i);
  assert.doesNotMatch(text, /sick|immune/i);
  // ...and the things that are always true are still there.
  assert.match(text, /creature/);
  assert.match(text, /food pellet/);
});

test("a mechanic that is on is mentioned", () => {
  const world = new World(
    makeConfig({ seed: 7, seasons: true, dayNightCycle: true, predation: true })
  );
  for (let i = 0; i < 200; i++) world.step();
  const text = describePond(world, world.config);

  assert.match(text, /(Summer|Winter|Spring|Autumn) of year \d+\./);
  assert.match(text, /\b(Day|Night|Dawn|Dusk)\.\s*$|\b(Day|Night|Dawn|Dusk)\. /);
  assert.match(text, /hunt/);
});

test("contagion is only described once there is a contagion", () => {
  // The v1.16 lesson in its narration form: never report the state of a thing
  // that has not begun. With a pathogen configured but no case yet, "0 sick, 0
  // immune" is a sentence about nothing.
  const world = new World(makeConfig({ seed: 7, disease: true }));
  world.step();
  world.stats.infectedCount = 0;
  world.stats.immuneCount = 0;
  assert.doesNotMatch(describePond(world, world.config), /sick|immune/);

  world.stats.infectedCount = 3;
  world.stats.immuneCount = 11;
  assert.match(describePond(world, world.config), /3 sick, 11 immune\./);
});

test("the reach of the sickness is spoken, and only while there is one", () => {
  // v1.34 drew the contagious zone in two views, both of which are available
  // only to an eye. This is the same claim in words: a listener gets the size of
  // the thing, not just the caseload.
  const world = new World(makeConfig({ seed: 7, disease: true }));
  world.step();
  world.stats.infectedCount = 4;
  world.stats.immuneCount = 2;
  world.stats.hazardShare = 0.23;
  assert.match(describePond(world, world.config), /The sickness reaches 23% of the water\./);

  // A pond of survivors with nobody currently ill has no zone to report, and
  // saying "0% of the water" to a listener is noise.
  world.stats.infectedCount = 0;
  world.stats.hazardShare = 0;
  assert.doesNotMatch(describePond(world, world.config), /reaches/);
});

test("an empty pond says so, rather than saying zero", () => {
  const world = new World(makeConfig({ seed: 314 }));
  world.creatures = [];
  const text = describePond(world, world.config);
  assert.match(text, /nothing is alive\./);
  assert.doesNotMatch(text, /0 creatures/);
  assert.doesNotMatch(text, /generation/);
});

test("a hunter is never described as none of the pond", () => {
  // One carnivore in a pond of 400 rounds to 0%, and "0% of the pond" next to a
  // hunter that is right there on the canvas is a readout contradicting itself.
  const world = new World(makeConfig({ seed: 314, predation: true }));
  world.step();
  world.stats.carnivoreCount = 1;
  const text = describePond(world, world.config);
  assert.match(text, /1 of them hunts, at (<1|\d+)% of the pond\./);
  assert.doesNotMatch(text, /at 0% of the pond/);

  world.stats.carnivoreCount = 0;
  assert.match(describePond(world, world.config), /None of them hunt\./);
});

test("the view is described only when it is not the whole pond", () => {
  // The v1.19 problem for a listener: once the camera exists it is possible to
  // be looking at a corner of the world without knowing it, and a listener has
  // no minimap to check. The sentence appears exactly when the badge does.
  const world = new World(makeConfig({ seed: 314 }));
  const cam = new Camera(world.config);
  assert.doesNotMatch(describePond(world, world.config, cam), /Zoom/);

  cam.setZoom(2.5);
  cam.moveTo(300, 210);
  const text = describePond(world, world.config, cam);
  assert.match(text, /Zoomed to 2\.5×, centred at x 300, y 210 of a 900 by 620 pond\./);

  cam.reset();
  assert.doesNotMatch(describePond(world, world.config, cam), /Zoom/);
});

test("the first look at the chronicle is silent, and primes", () => {
  // Arriving on a page mid-run must not read out the pond's entire natural
  // history. Nothing said, but the feed is marked as heard.
  const events = [ev(10, "one"), ev(20, "two")];
  const first = pendingSpeech(events, null);
  assert.equal(first.text, "");
  assert.equal(first.spoken, events[1]);

  // ...and an empty chronicle primes to nothing without throwing.
  assert.deepEqual(pendingSpeech([], null), { text: "", spoken: null });
});

test("nothing new is nothing said", () => {
  const events = [ev(10, "one")];
  let { spoken } = pendingSpeech(events, null);
  for (let i = 0; i < 5; i++) {
    const r = pendingSpeech(events, spoken);
    assert.equal(r.text, "", "a live region that repeats itself cannot be listened to");
    spoken = r.spoken;
  }
});

test("new chronicle lines are spoken once, in order", () => {
  const events = [ev(10, "The pond swells past 100 creatures.")];
  let { spoken } = pendingSpeech(events, null);

  events.push(ev(30, "First blood."));
  events.push(ev(40, "Dawn breaks."));
  const said = pendingSpeech(events, spoken);
  assert.equal(said.text, "First blood. Dawn breaks.");
  assert.equal(said.spoken, events[2]);

  // Said once: the next call has nothing left.
  assert.equal(pendingSpeech(events, said.spoken).text, "");
});

test("a burst is capped, and says how much it skipped", () => {
  // At 20× speed a pond can produce a run of events between two frames. A
  // paragraph that takes a minute to read out is out of date before it ends —
  // but silently dropping the rest is the v1.22 bug in spoken form, so the
  // count of what was skipped is itself spoken.
  const events = [ev(0, "start")];
  let { spoken } = pendingSpeech(events, null);
  for (let i = 1; i <= 7; i++) events.push(ev(i * 10, `event ${i}`));

  const said = pendingSpeech(events, spoken);
  const lines = said.text.split(" ").filter((w) => w === "event").length;
  assert.equal(lines, MAX_SPOKEN);
  assert.match(said.text, /^4 earlier events not read out\. event 5 event 6 event 7$/);
  assert.equal(said.spoken, events[events.length - 1]);
});

test("an event that fell out of the chronicle's buffer does not repeat the feed", () => {
  // `chronicle.js` shifts from the front once it is full, so the event a
  // listener last heard can leave the array. Everything still there is then
  // newer than it — and the cap keeps that from becoming a monologue.
  const heard = ev(1, "long ago");
  const events = [];
  for (let i = 1; i <= 10; i++) events.push(ev(i * 10, `line ${i}`));
  const said = pendingSpeech(events, heard);
  assert.match(said.text, /^7 earlier events not read out\. line 8 line 9 line 10$/);
});

test("the badges' labels are the ones the badges have always shown", () => {
  const cfg = makeConfig({ seed: 1, seasons: true, dayNightCycle: true });
  // Tick 0 is high noon and the start of year 1, by construction.
  assert.deepEqual(timeOfDayLabel(0, cfg), { icon: "🌞", name: "Day" });
  assert.equal(timeOfDayLabel(cfg.dayLength / 2, cfg).name, "Night");
  assert.equal(timeOfDayLabel(cfg.dayLength / 4, cfg).name, "Dusk");
  assert.equal(timeOfDayLabel((cfg.dayLength * 3) / 4, cfg).name, "Dawn");

  assert.equal(seasonLabel(0, cfg).year, 1);
  assert.equal(seasonLabel(Math.round(cfg.seasonLength * 0.25), cfg).name, "Summer");
  assert.equal(seasonLabel(Math.round(cfg.seasonLength * 0.75), cfg).name, "Winter");
  assert.equal(seasonLabel(Math.round(cfg.seasonLength * 1.1), cfg).year, 2);

  const off = makeConfig({ seed: 1, seasons: false });
  assert.deepEqual(seasonLabel(1234, off), { icon: "◷", name: "No seasons", year: null });
});

test("describing a world does not change it", () => {
  // The guarantee every observer here carries, checked the way `energy.test.js`
  // checks the ledger: one world described on every single tick, one left alone,
  // and every creature and pellet compared at the end. A description that drew
  // a random number, or touched a cached scan, would show up as a divergence.
  const cfg = () =>
    makeConfig({
      seed: 4242,
      predation: true,
      seasons: true,
      dayNightCycle: true,
      disease: true,
      scavenging: true,
    });
  const quiet = new World(cfg());
  const described = new World(cfg());
  const cam = new Camera(described.config);
  cam.setZoom(2);

  let spoken = null;
  for (let i = 0; i < 1200; i++) {
    quiet.step();
    described.step();
    describePond(described, described.config, cam);
    ({ spoken } = pendingSpeech(described.chronicle.events, spoken));
  }

  assert.equal(described.creatures.length, quiet.creatures.length);
  assert.deepEqual(
    described.creatures.map((c) => c.toJSON()),
    quiet.creatures.map((c) => c.toJSON())
  );
  assert.deepEqual(described.food.items, quiet.food.items);
  assert.deepEqual(described.corpses, quiet.corpses);
  assert.equal(described.rng.next(), quiet.rng.next());
});

// ---- the power strip's caption (v1.39) ----
//
// The strip draws two rates and then says, in words, which way the pond's
// energy is going. That sentence is the part a listener gets instead of the
// picture and the part a sighted reader will believe without checking, so it is
// held to the arithmetic here rather than trusted to `main.js`.

test("the power caption reads the whole window, not the newest interval", () => {
  const row = (tick, crop, metabolism) => ({
    tick,
    [energyField("crop")]: crop,
    [energyField("metabolism")]: metabolism,
  });
  // Four hundred ticks of minting twice what it spends, then four ticks the
  // other way — the shape that would flip a verdict read off the last point.
  const gaining = describePower(
    energySeries([row(0, 0, 0), row(400, 800, 400), row(404, 800, 420)])
  );
  assert.match(gaining.label, /gaining/);
  assert.match(gaining.label, /across the last 404 ticks/);
  assert.match(gaining.label, /made 2\.0 and spent 1\.0 energy per tick/);
  // The peak is the busiest interval on *either* line — here the four ticks of
  // spending, which is exactly why the two are drawn to one shared scale.
  assert.equal(gaining.peak, "peak 5.0/tick · 4-tick mean");

  const losing = describePower(energySeries([row(0, 0, 0), row(100, 100, 400)]));
  assert.match(losing.label, /running down/);

  // Level is a claim about the *share* of the flow, not a rounding of zero: a
  // pond minting 300 a tick and spending 299.9 is standing still for any
  // purpose a watcher has.
  const level = describePower(energySeries([row(0, 0, 0), row(100, 30000, 29990)]));
  assert.match(level.label, /level/);
});

test("the power caption says nothing it cannot support", () => {
  // The v1.16 rule: a narration of a thing happening must first check the thing
  // happened. An empty window gets a sentence saying so and no peak at all.
  const empty = describePower(energySeries([]));
  assert.equal(empty.peak, "");
  assert.match(empty.label, /no energy has moved/);
  const flat = describePower(
    energySeries([{ tick: 0 }, { tick: 4 }].map((r) => ({ ...r })))
  );
  assert.equal(flat.peak, "", "a window in which nothing was minted has no peak to report");
  assert.match(flat.label, /no energy has moved/);

  // And the case in between, which is not the same sentence: energy has moved,
  // but the averaging window has not filled, so there is nothing to draw and no
  // peak that would mean anything. Saying "no energy has moved" here would be
  // the spoken form of a readout that is quietly still warming up.
  const young = [0, 4, 8].map((tick) => ({ tick, [energyField("crop")]: tick * 3 }));
  const filling = describePower(energySeries(young, 30));
  assert.equal(filling.peak, "");
  assert.match(filling.label, /not enough history yet/);
});

test("the caption describes the same rates the strip is drawn from", () => {
  const world = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 800; i++) world.step();
  const series = energySeries(world.stats.popHistory);
  const { peak, label } = describePower(series);
  // The peak in the caption is the scale the lines are normalised to — the
  // number that makes a normalised strip mean something.
  assert.ok(series.scale > 0);
  assert.match(peak, new RegExp(`^peak ${series.scale.toFixed(1)}/tick · \\d+-tick mean$`));
  assert.match(label, /^Power over time: /);
});
