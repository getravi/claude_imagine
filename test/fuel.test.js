// fuel.test.js — the bar under the water, and the arithmetic behind it.
//
// Five groups of claims.
//
// **The meal is this animal's meal.** The count under the bar divides a gap by
// the size of a mouthful, and the tempting mouthful is `config.foodEnergy` —
// which is the right number for a grazer and wrong for everything that hunts. A
// pellet is worth less to a carnivore and a bite is worth nothing to anything
// under `carnivoreThreshold` or in a world with predation switched off. So
// `mealFor` is pinned against `world.js`'s own two lines rather than against a
// restatement of them, in worlds where each of the three gates is open and shut.
//
// **The bands cover the bar.** A fullness is a number between nothing and
// everything and every one of them has to land somewhere, including the two
// ends and the line itself. A band table with a hole in it would show a panel
// with no word in it at the one moment somebody is watching.
//
// **The count is a floor and says so.** It never promises fewer meals than the
// gap needs, it is never zero below the line, and it refuses to give a number
// at all to an animal that has nothing it can eat — a pure carnivore in a pond
// with no hunting in it is not four meals from anything.
//
// **The ink is the water's ink.** The whole reason this panel exists in colour
// is that it is a ruler for a rule `key.js` states in words: brighter is
// fuller. That is only true while the bar and the body are drawn off one
// formula, so the formula is asserted to be one function and the renderer is
// asserted to call it.
//
// **The two registers and the jargon sweep**, which every worded surface here
// gets, plus the pure-observer fingerprint every panel here gets.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { stateFingerprint } from "../src/fingerprint.js";
import { POINTER, TOUCH } from "../src/hand.js";
import { bodyFill, bodyLightness, BODY_SATURATION } from "../src/palette.js";
import {
  BANDS,
  READY,
  INVITE_ICON,
  fuelBand,
  fuelInvite,
  fuelLine,
  fuelOf,
  fuelSay,
  mealFor,
  mealWord,
  plantMealFor,
} from "../src/fuel.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

/** A pond stepped far enough to have animals of every shape in it. */
function pond(over = {}, steps = 300) {
  const w = new World(makeConfig({ seed: 314, ...over }));
  for (let i = 0; i < steps; i++) w.step();
  return w;
}

/** A stand-in for one animal: the three fields this module ever reads. */
function animal(energy, carnivory = 0.2, hue = 120) {
  return { energy, carnivory, hue };
}

// ---------------------------------------------------------------------------
// The meal is this animal's meal
// ---------------------------------------------------------------------------

test("a grazer's meal is the pellet, less what its diet gene forgoes", () => {
  const cfg = makeConfig({});
  const plain = mealFor(animal(100, 0), cfg);
  assert.equal(plain, cfg.foodEnergy, "a pure grazer eats the whole pellet");
  const tinged = mealFor(animal(100, 0.3), cfg);
  assert.equal(tinged, cfg.foodEnergy * (1 - cfg.plantPenaltyFromDiet * 0.3));
  assert.ok(tinged < plain, "a taste for meat costs a grazer part of its pellet");
});

test("a hunter's meal is the bite, and only where it may hunt", () => {
  const on = makeConfig({ predation: true });
  const hunter = animal(100, 0.9);
  const bite = on.biteEnergy * on.meatEfficiency * 0.9;
  assert.equal(mealFor(hunter, on), bite, "a licensed hunter is fed by prey");
  assert.ok(bite > mealFor(hunter, on) * 0, "a bite is worth something");
  // Two gates, and each one on its own has to close the flesh route.
  const off = makeConfig({ predation: false });
  assert.equal(
    mealFor(hunter, off),
    off.foodEnergy * (1 - off.plantPenaltyFromDiet * 0.9),
    "with nothing to hunt, even a carnivore is back on pellets"
  );
  const cub = animal(100, on.carnivoreThreshold - 0.01);
  assert.equal(
    mealFor(cub, on),
    on.foodEnergy * (1 - on.plantPenaltyFromDiet * cub.carnivory),
    "a body under the threshold is refused prey, so its meal is the pellet"
  );
});

test("the licence that waives the plant penalty is the one creature.js charges", () => {
  // `licensedDietCost` refuses prey to a body under the threshold *and* stops
  // charging it for the gene — including, here, the part of the pellet it would
  // otherwise forgo. The two have to agree or the panel prices a meal the world
  // does not.
  const cfg = makeConfig({ licensedDietCost: true, predation: false });
  const dabbler = animal(100, 0.3);
  assert.equal(mealFor(dabbler, cfg), cfg.foodEnergy, "an unlicensed gene costs it nothing");
  const hunter = animal(100, 0.9);
  assert.equal(
    mealFor(hunter, cfg),
    cfg.foodEnergy * (1 - cfg.plantPenaltyFromDiet * 0.9),
    "a licensed one pays in full"
  );
});

test("the grazing half stands on its own, and the whole is built from it", () => {
  // `plantMealFor` is the pellet's line, split out in v1.179 because a second
  // surface asks a different question of it: the bar asks how far this animal is
  // from having young (the best meal it can get), and the button under the bar
  // asks whether a handful of pellets is worth offering at all (the pellet line,
  // whatever the bite is worth). Two copies would be two prices for one pellet.
  const cfg = makeConfig({ predation: true });
  assert.equal(plantMealFor(animal(100, 0), cfg), cfg.foodEnergy);
  const hunter = animal(100, 0.9);
  const pellet = cfg.foodEnergy * (1 - cfg.plantPenaltyFromDiet * 0.9);
  assert.equal(plantMealFor(hunter, cfg), pellet, "a hunter's pellet is still worth a hunter's pellet");
  assert.ok(mealFor(hunter, cfg) > pellet, "the whole meal is the better of the two routes");
  assert.equal(mealFor(animal(100, 0), cfg), plantMealFor(animal(100, 0), cfg));
  // Never negative, on the side a hunter's own gate cannot reach.
  assert.equal(plantMealFor(animal(100, 1), makeConfig({ plantPenaltyFromDiet: 1.2 })), 0);
});

test("nothing to eat is zero rather than a negative meal", () => {
  // `plantPenaltyFromDiet: 1.2` is not a world this project ships, and it is
  // exactly the shape that would hand the bar a negative divisor and a count of
  // minus two meals.
  const cfg = makeConfig({ plantPenaltyFromDiet: 1.2, predation: false });
  assert.equal(mealFor(animal(100, 1), cfg), 0);
});

// ---------------------------------------------------------------------------
// The bands cover the bar
// ---------------------------------------------------------------------------

test("every fullness lands in exactly one band", () => {
  const line = 0.727;
  for (let i = 0; i <= 1000; i++) {
    const frac = i / 1000;
    const band = fuelBand(frac, line);
    assert.ok(band && band.word, `nothing said about ${frac}`);
    assert.ok(band.icon, `no mark for ${frac}`);
    if (frac >= line) assert.equal(band, READY, `${frac} is over the line`);
    else assert.notEqual(band, READY, `${frac} is under the line`);
  }
});

test("the table is ordered, so the first match is the right one", () => {
  for (let i = 1; i < BANDS.length; i++) {
    assert.ok(BANDS[i].from < BANDS[i - 1].from, "bands must descend");
  }
  assert.equal(BANDS[BANDS.length - 1].from, 0, "the floor must be zero");
  const keys = new Set(BANDS.map((b) => b.key));
  assert.equal(keys.size, BANDS.length, "two bands share a key");
  assert.ok(!keys.has(READY.key), "the ready band is not in the table");
});

test("the starving band wears the mark the obituary opens with", () => {
  // The bottom of this bar and the commonest first line of the card underneath
  // it are the same event, and a reader who watches one become the other should
  // meet one character rather than two.
  const bottom = BANDS[BANDS.length - 1];
  const obituary = readFileSync(join(ROOT, "src/obituary.js"), "utf8");
  const starved = obituary.match(/starvation:\s*\{\s*icon:\s*"([^"]+)"/);
  assert.ok(starved, "obituary.js no longer names a starvation mark");
  assert.equal(bottom.icon, starved[1]);
});

// ---------------------------------------------------------------------------
// The count is a floor, and says so
// ---------------------------------------------------------------------------

test("the count is never fewer meals than the gap needs", () => {
  const cfg = makeConfig({});
  for (let e = 1; e < cfg.reproduceThreshold; e += 1) {
    const c = animal(e, 0.2);
    const f = fuelOf(c, cfg);
    assert.ok(f.meals >= 1, `a gap of ${cfg.reproduceThreshold - e} wants at least one meal`);
    const meal = mealFor(c, cfg);
    assert.ok(
      e + f.meals * meal >= cfg.reproduceThreshold,
      `${f.meals} meals do not close a gap of ${cfg.reproduceThreshold - e}`
    );
    assert.ok(
      e + (f.meals - 1) * meal < cfg.reproduceThreshold,
      `${f.meals} meals is one more than it takes`
    );
  }
});

test("over the line there is no count, and the sentence says why", () => {
  const cfg = makeConfig({});
  const f = fuelOf(animal(cfg.reproduceThreshold + 1), cfg);
  assert.equal(f.band, READY);
  assert.equal(f.meals, null);
  assert.match(f.line, /young/);
  assert.doesNotMatch(f.line, /\bmeal/, "nothing is owed at the top of the bar");
});

test("an animal with nothing it can eat is given no route out", () => {
  const cfg = makeConfig({ plantPenaltyFromDiet: 1, predation: false });
  const f = fuelOf(animal(60, 1), cfg);
  assert.equal(f.meals, null);
  assert.doesNotMatch(f.line, /Another/, "there is no *another* when there is no meal");
  assert.match(f.line, /nothing/);
});

test("the bar is a share of the pond's own full, clamped at both ends", () => {
  const cfg = makeConfig({});
  assert.equal(fuelOf(animal(0), cfg).frac, 0);
  assert.equal(fuelOf(animal(-5), cfg).frac, 0, "a bill paid past zero is still empty");
  assert.equal(fuelOf(animal(cfg.energyMax * 2), cfg).frac, 1);
  assert.equal(fuelOf(animal(cfg.energyMax / 2), cfg).frac, 0.5);
  const f = fuelOf(animal(95), cfg);
  assert.equal(f.lineFrac, cfg.reproduceThreshold / cfg.energyMax);
  assert.ok(f.lineFrac < 1, "the line must be somewhere a reader can see it");
});

test("a pond that splits at its own brim still draws a line, not an edge", () => {
  // Not a world this project ships, and the arithmetic must not produce a
  // `lineFrac` above 1 — a mark positioned off the end of its own track.
  const cfg = makeConfig({ reproduceThreshold: 400, energyMax: 220 });
  assert.equal(fuelOf(animal(100), cfg).lineFrac, 1);
});

// ---------------------------------------------------------------------------
// The ink is the water's ink
// ---------------------------------------------------------------------------

test("the fill is the colour the water draws that animal", () => {
  const cfg = makeConfig({});
  const c = animal(110, 0.2, 200);
  const f = fuelOf(c, cfg);
  assert.equal(f.fill, bodyFill(200, 110 / cfg.energyMax));
  assert.equal(f.fill, `hsl(200, ${BODY_SATURATION}%, ${bodyLightness(0.5)}%)`);
});

test("the lightness ramp is the one the renderer has always used", () => {
  for (let i = 0; i <= 100; i++) {
    const frac = i / 100;
    assert.equal(bodyLightness(frac), 30 + frac * 45);
  }
  assert.equal(bodyLightness(-1), 30, "an overdrawn animal is drawn at the floor");
  assert.equal(bodyLightness(2), 75, "and a full one at the ceiling");
  assert.equal(bodyLightness(NaN), 30, "and a number that is not one does not paint black");
});

test("the renderer draws its bodies with that function rather than its own sum", () => {
  // The claim this panel rests on is that the bar and the dart are one value in
  // one ink. A renderer that went back to an inline `30 + frac * 45` would pass
  // every other test in this suite and quietly break the only reason the bar is
  // coloured at all.
  const src = readFileSync(join(ROOT, "src/render.js"), "utf8");
  assert.match(src, /bodyLightness\(energyFrac\)/, "render.js must call the shared ramp");
  assert.ok(
    !/30 \+ energyFrac \* 45/.test(src),
    "render.js is still carrying its own copy of the ramp"
  );
});

// ---------------------------------------------------------------------------
// The words
// ---------------------------------------------------------------------------

const JARGON =
  /\b(energy|metabolis\w*|carnivor\w*|herbivor\w*|lineage|genome|threshold|tick|ticks|px|pixels?|fitness|RNG|seed|config)\b/i;

test("every sentence this panel can say is plain, and none of them is empty", () => {
  const cfg = makeConfig({});
  const said = new Set();
  for (let e = -10; e <= cfg.energyMax + 10; e += 1) {
    for (const carnivory of [0, 0.3, 0.9]) {
      const f = fuelOf(animal(e, carnivory), cfg);
      assert.ok(f.line.length > 0, `nothing said at ${e}`);
      said.add(f.line);
    }
  }
  for (const line of said) {
    assert.doesNotMatch(line, JARGON, `"${line}" reaches for a word this page has not taught`);
    assert.match(line, /[.!]$/, `"${line}" is not a finished sentence`);
    assert.doesNotMatch(line, /^\d/, `"${line}" opens with a numeral`);
  }
  // Every band the default pond can reach has said something of its own.
  assert.ok(said.size >= BANDS.length, `only ${said.size} sentences over the whole bar`);
});

test("the counts are words, in the register of a sentence rather than a tile", () => {
  assert.equal(mealWord(1), "meal", "one meal is not *one meals*");
  assert.equal(mealWord(2), "two meals");
  assert.equal(mealWord(10), "ten meals");
  // Past the end of the vocabulary it degrades to a numeral rather than to
  // nothing — a bar in a world with a tiny pellet still owes a reader an answer.
  assert.equal(mealWord(14), "14 meals");
  const cfg = makeConfig({});
  assert.match(fuelOf(animal(cfg.reproduceThreshold - 1), cfg).line, /Another meal and/);
});

test("the bottom band answers the question the bar is actually asking", () => {
  // A starving animal is four meals from having young and that is not what is
  // happening to it. The count is dropped in that band on purpose — and it is
  // also what keeps the longest sentence here inside the two lines `.f-line`
  // reserves at 390 px.
  const cfg = makeConfig({});
  const f = fuelOf(animal(10), cfg);
  assert.equal(f.band.key, "starving");
  assert.ok(f.meals >= 1, "the count is still computed, it is simply not said");
  assert.doesNotMatch(f.line, /meals\b/, "a starving animal is not told about its young");
  assert.match(f.line, /starve/);
  assert.ok(f.line.length < 70, `"${f.line}" is longer than two lines of this column`);
});

test("the spoken label carries the value the ink carries", () => {
  const cfg = makeConfig({});
  for (const e of [5, 60, 120, 200]) {
    const f = fuelOf(animal(e), cfg);
    assert.ok(f.say.startsWith(f.band.word), `"${f.say}" does not open with its own state`);
    assert.ok(f.say.includes(f.line), "the label must carry the sentence beside it");
  }
  assert.equal(fuelSay(READY, null), `${READY.word}. ${fuelLine(READY, null)}`);
});

test("the invitation is written in both registers, and neither names the other's hand", () => {
  const mouse = fuelInvite(POINTER);
  const thumb = fuelInvite(TOUCH);
  assert.ok(mouse.length > 0 && thumb.length > 0);
  assert.match(mouse, /click/i);
  assert.match(thumb, /[Tt]ap/);
  assert.doesNotMatch(thumb, /click/i, "a phone is not told to click");
  assert.doesNotMatch(thumb, /<kbd>/, "a phone is not told about a key");
  assert.equal(fuelInvite(), mouse, "the pointer copy is the default");
  assert.ok(INVITE_ICON.length > 0, "the invitation needs its own mark");
});

// ---------------------------------------------------------------------------
// Against a real pond
// ---------------------------------------------------------------------------

test("nothing in a living pond falls outside what this panel can draw", () => {
  const w = pond({}, 900);
  let seen = 0;
  for (const c of w.creatures) {
    if (c.dead) continue;
    const f = fuelOf(c, w.config);
    assert.ok(f.frac >= 0 && f.frac <= 1, `${f.frac} is off the track`);
    assert.ok(f.line.length > 0 && f.say.length > 0);
    assert.match(f.fill, /^hsl\(/, "the fill must be a colour the page can use");
    seen++;
  }
  assert.ok(seen > 10, "the pond should have had animals in it");
});

/** Every animal-instant over the line across a run, and the pond's high water. */
function overTheLine(over = {}, steps = 3000) {
  const w = new World(makeConfig({ seed: 909, ...over }));
  let count = 0;
  let peak = 0;
  for (let i = 0; i < steps; i++) {
    w.step();
    peak = Math.max(peak, w.creatures.length);
    for (const c of w.creatures) {
      if (!c.dead && c.energy >= w.config.reproduceThreshold) count++;
    }
  }
  return { count, peak, cap: w.config.populationMax };
}

test("the top of the bar is a place a pond with room never reaches", () => {
  // `doing.js` found that *ready to breed* fires on 0.0% of sampled animals,
  // because crossing the line **is** the split. This is that finding held as a
  // property of the bar: in a pond that never fills up, the fill is never once
  // past the mark, in three thousand steps of every animal in it.
  const roomy = overTheLine();
  assert.ok(roomy.peak < roomy.cap, "this pond filled up, so it is the wrong witness");
  assert.equal(roomy.count, 0, `${roomy.count} animals sat over the line with room to split`);
});

test("and the one place it does reach it is a pond that is full", () => {
  // Which is why the `ready` band is not dead code: `world.js` refuses a birth
  // at `populationMax`, and an animal in a full pond sits over the line with
  // nowhere to put a child. The default pond's cap is 650 and its seeds settle
  // far below it, so the witness is a small pond rather than a long run.
  const full = overTheLine({ populationMax: 40 });
  assert.equal(full.peak, full.cap, "this pond never reached its cap");
  assert.ok(full.count > 0, "a full pond should have had somebody waiting");
});

// ---------------------------------------------------------------------------
// Pure observer
// ---------------------------------------------------------------------------

test("a pond somebody is reading is bit for bit a pond nobody is", () => {
  const watched = new World(makeConfig({ seed: 909 }));
  const alone = new World(makeConfig({ seed: 909 }));
  for (let i = 0; i < 600; i++) {
    watched.step();
    const subject = watched.creatures[i % Math.max(1, watched.creatures.length)] || null;
    if (subject && !subject.dead) fuelOf(subject, watched.config);
    alone.step();
  }
  assert.equal(stateFingerprint(watched), stateFingerprint(alone));
});

test("reading an animal leaves the animal exactly as it was", () => {
  const w = pond({}, 200);
  const c = w.creatures.find((x) => !x.dead);
  const before = { energy: c.energy, carnivory: c.carnivory, hue: c.hue, age: c.age };
  fuelOf(c, w.config);
  assert.deepEqual({ energy: c.energy, carnivory: c.carnivory, hue: c.hue, age: c.age }, before);
});

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

test("the panel's own markup is on the page, under the trio and over the card", () => {
  const html = readFileSync(join(ROOT, "app/index.html"), "utf8");
  const at = (id) => html.indexOf(`id="${id}"`);
  assert.ok(at("fuel") > 0, "the panel should be in the page");
  assert.ok(at("fuel") > at("decide"), "it belongs under the three panels about a mind");
  assert.ok(at("fuel") < at("obituary"), "and over the card that ends the story");
  const panel = html.slice(at("fuel"), at("obituary"));
  for (const id of ["fuel-h", "fuel-gauge", "fuel-fill", "fuel-mark", "fuel-line"]) {
    assert.ok(panel.includes(`id="${id}"`), `#${id} is missing from the panel`);
  }
  // A picture rather than an instrument, for `#eyeview`'s and `#decide`'s
  // reason: the switch every visit starts on the quiet side of must not hide
  // the one surface that says what an animal is spending its life on.
  assert.ok(!panel.includes("data-expert"), "this panel is not an instrument");
  // Labelled by its own heading rather than by a typed second copy of it.
  const open = html.match(/<section[^>]*\bid="fuel"[^>]*>/)[0];
  assert.match(open, /aria-labelledby="fuel-h"/);
  assert.ok(!/aria-label=/.test(open), "a heading and a copy of one say two things");
});

test("the bar's colour comes from the module, never from the stylesheet", () => {
  // The fill is the animal's own colour; a literal in the sheet would make the
  // bar a decoration that happens to move, and no test could see it.
  const css = readFileSync(join(ROOT, "style.css"), "utf8");
  const rule = css.slice(css.indexOf(".f-fill {"), css.indexOf(".f-mark {"));
  assert.ok(rule.length > 0, ".f-fill has left the stylesheet");
  assert.match(rule, /var\(--fuel-ink/, "the fill must read the colour it is handed");
  assert.ok(
    !/#[0-9a-f]{3,8}|hsl\(|rgb\(/i.test(rule),
    "the fill names a colour of its own, so it is no longer the water's"
  );
});
