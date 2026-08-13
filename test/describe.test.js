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
import { Corpse } from "../src/food.js";
import {
  describePond,
  describePower,
  describeSelection,
  regionOf,
  pendingSpeech,
  seasonLabel,
  timeOfDayLabel,
  MAX_SPOKEN,
  pathPhrase,
  reachPhrase,
  MIN_TRAIL_TICKS,
} from "../src/describe.js";
import { energySeries, energyField } from "../src/energy.js";
import { creatureReaches } from "../src/reach.js";

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
  // The three v1.67 additions, whose flags are all off by default. Each of the
  // quantities behind them reads exactly 0 in this world — no corpse is ever
  // pushed, `soilShare` and `avgVoice` are zeroed by `Stats` itself — so this
  // asserts the sentence is absent rather than merely harmless.
  assert.doesNotMatch(text, /corpse/i);
  assert.doesNotMatch(text, /calling/i);
  assert.doesNotMatch(text, /sprouting/i);
  // ...and the things that are always true are still there.
  assert.match(text, /creature/);
  assert.match(text, /food pellet/);
});

test("the two silences of kin recognition sound different", () => {
  // A rule that has never fired and a rule that is not there at all have said
  // exactly the same thing — nothing — since v1.10. They are different worlds,
  // and on most seeds the first one is the world you are in: the pond splits
  // into predator and prey lineages and no hunter is ever offered a relative it
  // could eat (docs/SCIENCE.md). So the sentence exists in three states, and
  // two of them are the point.
  const world = new World(makeConfig({ seed: 7, kinRecognition: true, predation: true }));
  for (let i = 0; i < 200; i++) world.step();
  assert.equal(world.stats.kinSpared, 0);
  assert.match(describePond(world, world.config), /spare their own family here, though none/);

  // Staged rather than waited for: the seeds that spare anything take thousands
  // of ticks to do it, and what is under test is the wording, not the ecology.
  world.stats.kinSpared = 1;
  world.stats.kinSparedRate = 0.4;
  assert.match(describePond(world, world.config), /passed over 1 relative they were able to eat/);
  world.stats.kinSpared = 2410;
  assert.match(describePond(world, world.config), /passed over 2,410 relatives/);

  // And with the flag off there is no sentence at all, in a pond whose hunters
  // are otherwise identical.
  const none = new World(makeConfig({ seed: 7, predation: true }));
  for (let i = 0; i < 200; i++) none.step();
  assert.equal(none.stats.kinSpared, 0);
  assert.doesNotMatch(describePond(none, none.config), /family|relative/i);
});

test("the dead are counted, and only in a world that keeps them", () => {
  // v1.8 gave the pond corpses; until v1.67 nothing on the page said how many
  // there were — no tile, no caption, only pixels. On twelve seeds a scavenging
  // pond holds a mean of 7.7 of them at once and up to 43, against the pellet
  // count the listener is told in the sentence before.
  //
  // Staged rather than waited for (the v1.45 rule): a corpse rots away in a
  // couple of hundred ticks, so whether one happens to be lying there on tick
  // 600 is a fact about this seed's death rate, not about the sentence.
  const world = new World(makeConfig({ seed: 2024, scavenging: true, predation: true }));
  for (let i = 0; i < 200; i++) world.step();
  world.corpses = [new Corpse(100, 100, 30), new Corpse(300, 220, 12)];
  assert.match(describePond(world, world.config), /\b2 corpses lie where creatures died/);

  world.corpses = [new Corpse(100, 100, 30)];
  assert.match(describePond(world, world.config), /\b1 corpse lies where creatures died/);

  // An instant with nothing dead is not news — the v1.16 rule, which the
  // contagion sentence already follows one block down.
  world.corpses = [];
  assert.doesNotMatch(describePond(world, world.config), /corpse/i);

  // And with scavenging off the count is 0 by construction: nothing in
  // `world.js` ever pushes a corpse, so there is no state in which this
  // sentence could appear in a pond where bodies simply vanish.
  const none = new World(makeConfig({ seed: 2024, scavenging: false, predation: true }));
  for (let i = 0; i < 600; i++) none.step();
  assert.equal(none.corpses.length, 0);
  assert.doesNotMatch(describePond(none, none.config), /corpse/i);
});

test("the dead are still counted in a pond with nothing alive", () => {
  // The one sentence here that is deliberately not gated on the population: a
  // pond that has just died is exactly when the meat lying in it is worth
  // hearing about, and "nothing is alive" alone would describe an empty stage.
  const world = new World(makeConfig({ seed: 2024, scavenging: true, predation: true }));
  for (let i = 0; i < 200; i++) world.step();
  world.creatures = [];
  world.corpses = [new Corpse(100, 100, 30), new Corpse(300, 220, 12)];
  const text = describePond(world, world.config);
  assert.match(text, /nothing is alive\./);
  assert.match(text, /2 corpses lie where creatures died/);
});

test("the voices are spoken with the distance they carry", () => {
  // Signalling has been drawn as rings since v1.20 — a picture, plus half of it
  // in the `Heard` tile. The volume the pond speaks at had no text form at all.
  const world = new World(makeConfig({ seed: 23, signalling: true, predation: true }));
  for (let i = 0; i < 400; i++) world.step();
  const text = describePond(world, world.config);
  assert.match(text, /Creatures are calling to one another across 120 pixels:/);
  assert.match(
    text,
    new RegExp(
      `voices average ${world.stats.avgVoice.toFixed(2)} out of 1, and the loudest call ` +
        `reaching each of them ${world.stats.avgHeard.toFixed(2)}\\.`
    )
  );

  const quiet = new World(makeConfig({ seed: 23, signalling: false, predation: true }));
  for (let i = 0; i < 400; i++) quiet.step();
  assert.equal(quiet.stats.avgVoice, 0);
  assert.equal(quiet.stats.avgHeard, 0);
  assert.doesNotMatch(describePond(quiet, quiet.config), /calling/i);
});

test("the soil is spoken as the Soil tile's own fraction", () => {
  // Two readouts of one quantity drift the moment they do their own arithmetic
  // (v1.31, in its narration form). The tile rounds `soilShare` to a whole
  // percent; so does this, through the same helper every other share here uses.
  const world = new World(makeConfig({ seed: 13, detritus: true, terrain: true }));
  for (let i = 0; i < 1500; i++) world.step();
  // Comfortably over half a percent, so the tile's rounding and this module's
  // `<1%` floor cannot disagree about which branch they are in.
  assert.ok(world.stats.soilShare > 0.02, "expected this pond's crop to owe the dead something");
  const pct = Math.round(world.stats.soilShare * 100);
  assert.match(
    describePond(world, world.config),
    new RegExp(`${pct}% of new food is sprouting from ground where something died\\.`)
  );

  const bare = new World(makeConfig({ seed: 13, detritus: false, terrain: true }));
  for (let i = 0; i < 1500; i++) bare.step();
  assert.equal(bare.stats.soilShare, 0);
  assert.doesNotMatch(describePond(bare, bare.config), /sprouting/i);
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

test("the biomes get a sentence, and a flat landscape gets silence", () => {
  // The twelfth noun (v1.68). The fertility field has decided where food falls
  // since v1.3, and until this release nothing anywhere on the page — spoken or
  // written — carried a number about it.
  //
  // The sentence is about where the *pond* is, not where the pellets are: the
  // standing crop's own bias sits inside the scatter of uniformly placed
  // pellets on ten seeds of twelve, and the living sit well outside it on
  // twelve of twelve. Saying "the food is in the biomes" would have been the
  // claim the control killed.
  const world = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 400; i++) world.step();
  assert.match(
    describePond(world, world.config),
    /The living are gathered where the food grows: ground \d+% more fertile than this pond's average\./
  );

  // A pond nothing sows into says nothing about biomes. `foodPatches` is the
  // off switch v1.67 thought this feature did not have — it is named after the
  // food rather than after the field, which is how an inventory of nouns walked
  // past it — and the field is still there and still measurable with it off, so
  // the silence is a decision about what is worth saying rather than an absence
  // of data (v1.16).
  const off = new World(makeConfig({ seed: 314, foodPatches: false }));
  for (let i = 0; i < 400; i++) off.step();
  assert.doesNotMatch(describePond(off, off.config), /fertile/i);
});

test("the rock gets a sentence, and only where there is rock", () => {
  // v1.31's rule: which sense is this claim available to? A wall is the most
  // visual thing this project has ever added, and a listener would otherwise be
  // told nothing about the shape of the world at all.
  const open = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 400; i++) open.step();
  const quiet = describePond(open, open.config);
  assert.ok(!/rock/i.test(quiet), `a pond with no walls talked about rock: ${quiet}`);

  const world = new World(makeConfig({ seed: 314, barriers: true }));
  for (let i = 0; i < 400; i++) world.step();
  const text = describePond(world, world.config);
  assert.match(text, /Rock divides the pond into 4 rooms, joined by gates\./);
  assert.match(text, /turned back by it \d+ times per hundred ticks/);
});

test("the keyboard's selection says who it landed on, and only what is decided", () => {
  // v1.60 gave the pond arrow keys. A step that moves a selection and says
  // nothing is v1.13's rule with the senses swapped — the mechanic obeys and the
  // watcher cannot tell it happened — and the inspector is no answer, because
  // reading it means leaving the pond and losing the place you were navigating
  // from.
  const config = makeConfig({ seed: 314, predation: false, disease: false });
  const c = { id: 42, generation: 3, carnivory: 0.9, energy: 110, x: 100, y: 80, infected: false, immune: false };

  const quiet = describeSelection(c, config);
  assert.match(quiet, /^Creature 42, generation 3, /);
  assert.ok(!/hunter|grazer/.test(quiet), `diet spoken in a pond with no predation: ${quiet}`);
  assert.ok(!/sick|immune/.test(quiet), `disease spoken in a pond with none: ${quiet}`);
  assert.match(quiet, /in the north-west of the pond\.$/);

  // The same creature where the gene decides something.
  const hunting = describeSelection(c, makeConfig({ seed: 314, predation: true }));
  assert.match(hunting, /a hunter/);
  const grazing = describeSelection({ ...c, carnivory: 0.1 }, makeConfig({ seed: 314, predation: true }));
  assert.match(grazing, /a grazer/);

  // Energy is the inspector's own arithmetic, so the number a reader sees and
  // the number a listener hears cannot drift apart.
  assert.ok(quiet.includes(`${Math.round((110 / config.energyMax) * 100)}% fed`), quiet);

  const ill = describeSelection({ ...c, infected: true }, makeConfig({ seed: 314, disease: true }));
  assert.match(ill, /sick/);
  const survived = describeSelection({ ...c, immune: true }, makeConfig({ seed: 314, disease: true }));
  assert.match(survived, /immune/);

  assert.equal(describeSelection(null, config), "Selection cleared.");
});

test("the path is spoken only once there is one, and says how far as well as how straight", () => {
  // The clause a reader gets as a picture (the v1.84 trail overlay) and a
  // listener gets as a sentence. Two guards, both of them the same rule from
  // v1.16: do not narrate a thing before it has happened, and do not let a
  // ratio stand in for a quantity.
  const config = makeConfig({ seed: 314, predation: false, disease: false });
  const c = { id: 42, generation: 3, carnivory: 0.9, energy: 110, x: 100, y: 80, infected: false, immune: false };
  const path = (over) => ({ ticks: 200, travelled: 400, displacement: 40, straightness: 0.1, ...over });

  assert.equal(describeSelection(c, config), describeSelection(c, config, null), "no trail, no clause");
  const young = describeSelection(c, config, path({ ticks: MIN_TRAIL_TICKS - 1 }));
  assert.ok(!/swam/.test(young), `a path of one tick got a verdict: ${young}`);

  const grazing = describeSelection(c, config, path());
  assert.match(grazing, /In the last 200 ticks it swam 400 pixels and ended 40 from where it began/);
  assert.match(grazing, /working one patch\.$/);
  assert.match(describeSelection(c, config, path({ straightness: 0.4 })), /wandering\.$/);
  assert.match(describeSelection(c, config, path({ straightness: 0.95 })), /heading somewhere\.$/);
  // The clause is added to the sentence, never instead of it.
  assert.match(grazing, /^Creature 42, generation 3, .*in the north-west of the pond\. In the last/);

  // And the distance is spoken because the word cannot carry it: a creature
  // that shuffled four pixels in a straight line and one that crossed the pond
  // score the same straightness and are not the same animal.
  const [near, far] = [40, 4000].map((d) =>
    pathPhrase({ ticks: 200, travelled: d, displacement: d, straightness: 1 })
  );
  assert.notEqual(near, far);
  assert.equal(pathPhrase(null), "");
});

test("the reach is spoken only when it is being shown, and in numbers", () => {
  // The overlay's content, said out loud (v1.90). The rings carry no text — the
  // pond canvas has none — so this is the only surface where the distances
  // appear as numbers at all, and a listener who cannot see the circles is a
  // listener who gets the whole of the feature or none of it.
  const config = makeConfig({ seed: 314, predation: true, disease: false });
  const c = { id: 42, generation: 3, carnivory: 0.9, energy: 110, x: 100, y: 80, radius: 7, infected: false, immune: false };

  // Silent unless somebody asked to see it: a description that recites geometry
  // nobody requested is a panel that will not stop talking.
  assert.equal(describeSelection(c, config), describeSelection(c, config, null, false));
  const said = describeSelection(c, config, null, true);
  assert.match(said, /^Creature 42, /, "the clause is added to the sentence, never instead of it");

  // The two shapes: eating fires at one distance, a bite at a range that
  // depends on what it meets.
  const [eat, bite] = ["eat", "bite"].map((name) =>
    creatureReaches(c.radius, config).find((r) => r.name === name)
  );
  assert.match(said, new RegExp(`eats a pellet at ${eat.inner.toFixed(1)} pixels`));
  assert.match(
    said,
    new RegExp(`bites from ${bite.inner.toFixed(1)} to ${bite.outer.toFixed(1)} pixels out, depending on the other body`)
  );

  // A rule that is switched off is not mentioned, the same as everywhere else
  // on this surface.
  const grazers = describeSelection(c, makeConfig({ seed: 314, predation: false }), null, true);
  assert.ok(!/bites/.test(grazers), `a bite spoken in a pond with no predation: ${grazers}`);
  assert.match(grazers, /eats a pellet at/);

  // And the empty case is a sentence rather than a range, because there is no
  // range: nothing in this world is small enough for the smallest body to eat,
  // and "0.0 to 0.0 pixels" would be three true symbols arranged into a
  // falsehood (v1.89).
  const tiny = describeSelection({ ...c, radius: config.bodyRadiusMin }, config, null, true);
  assert.match(tiny, /nothing here is small enough for it to bite/);
  assert.ok(!/bites from/.test(tiny), tiny);
  assert.equal(reachPhrase(config.bodyRadiusMin, makeConfig({ seed: 314, predation: false })).includes("bite"), false);
});

test("the pond is described in ninths, and the middle one has no compass word", () => {
  const config = makeConfig({ seed: 314 });
  const { width: w, height: h } = config;
  assert.equal(regionOf(w / 2, h / 2, config), "the middle");
  assert.equal(regionOf(10, 10, config), "the north-west");
  assert.equal(regionOf(w - 10, h - 10, config), "the south-east");
  assert.equal(regionOf(w / 2, 10, config), "the north");
  assert.equal(regionOf(10, h / 2, config), "the west");
  // Every point in the pond gets a name — a listener building a map in their
  // head must never be told a creature is nowhere.
  for (let x = 0; x < w; x += 7) {
    for (let y = 0; y < h; y += 7) {
      assert.match(regionOf(x, y, config), /^the (middle|north|south|west|east|north-west|north-east|south-west|south-east)$/);
    }
  }
});
