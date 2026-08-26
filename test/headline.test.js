// headline.test.js — the sentence a stranger reads first (v1.117).
//
// The banner has one job and it is not accuracy: every number on this page is
// already accurate. Its job is to be *the right thing to say*, in words nobody
// needs a glossary for, and three properties carry that:
//
//   * **Ranked.** A pond can be crashing *and* dominated by one family. The
//     reader needs the crash. Every rule carries a rank and the picker returns
//     the lowest one that fits, so urgency is a property of the list rather
//     than of the order somebody happened to write the ifs in.
//   * **Steady.** A predicate on a live number crosses its threshold over and
//     over. Without the hold, the banner strobes — which is worse than saying
//     nothing, because a line nobody can finish reading is not a line.
//   * **Plain.** The whole point is the visitor who does not know what a Muller
//     plot is. There is a vocabulary sweep at the bottom, and it is the test
//     most likely to catch a future release quietly making this technical
//     again — the way every other readout on this page became technical, one
//     honest word at a time.
//
// And the one property this module shares with `chronicle.js` and
// `phylogeny.js`: it is a pure observer. Reading a pond may not move it.

import { test } from "node:test";
import assert from "node:assert/strict";

import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { nameSpecies } from "../src/speciesnames.js";
import { stateFingerprint } from "../src/fingerprint.js";
import {
  CALM_ROTATE,
  CRASH_MIN_PEAK,
  HEADLINE_HOLD,
  RANK,
  nextHeadline,
  pondHeadline,
} from "../src/headline.js";

/**
 * A pond-shaped object with only the fields `pondHeadline` reads. A stub rather
 * than a run, because most of these states (one creature left, sixty per cent
 * of the dead starved) take thousands of ticks and a lucky seed to reach, and a
 * test that can only assert what a seed happened to do is a test of the seed.
 * The real ponds are at the bottom.
 */
function pond(over = {}) {
  const {
    pop = 100,
    food = 200,
    tick = 5000,
    species = [],
    deaths = [],
    ...stats
  } = over;
  return {
    tick,
    creatures: new Array(pop).fill({}),
    food: { items: new Array(food).fill({}) },
    phylogeny: { species },
    stats: {
      popHistory: [{ pop }],
      recentDeaths: deaths,
      // Comfortably off its own record, so a stub reaches the calm fallback
      // unless the state it was built for says otherwise. A default equal to
      // `pop` would make every quiet pond a boom.
      maxPopEver: pop * 2,
      maxGeneration: 12,
      births: 400,
      deaths: 300,
      kills: 0,
      carnivoreFrac: 0,
      carnivoreCount: 0,
      ...stats,
    },
  };
}

const CONFIG = makeConfig({ seed: 1 });
/** Deaths of one cause, in the shape `stats.recentDeaths` holds. */
const died = (cause, n) => new Array(n).fill({ cause, age: 400 });

// ---- The ranking ----

test("an empty pond says so, and says what to do about it", () => {
  const h = pondHeadline(pond({ pop: 0 }), CONFIG);
  assert.equal(h.rank, RANK.extinct);
  assert.match(h.text, /Reset/, "the one state that needs an instruction, not an observation");
});

test("a pond down to a handful outranks every other thing true of it", () => {
  // Crashing, starving, hunted and dominated all at once — and four creatures.
  const dire = pond({
    pop: 4,
    popHistory: [{ pop: 300 }],
    deaths: died("starvation", 40),
    kills: 90,
    carnivoreFrac: 0.9,
    carnivoreCount: 3,
    species: [{ id: 0, parentId: null, count: 4 }],
  });
  const h = pondHeadline(dire, CONFIG);
  assert.equal(h.rank, RANK.fragile);
  assert.match(h.text, /4/);
  assert.match(pondHeadline(pond({ pop: 1 }), CONFIG).text, /One creature/);
});

test("a crash is measured against the peak the pond remembers", () => {
  const crashing = pond({ pop: 40, popHistory: [{ pop: 30 }, { pop: 200 }, { pop: 90 }] });
  const h = pondHeadline(crashing, CONFIG);
  assert.equal(h.rank, RANK.crash);
  assert.match(h.text, /200/, "the peak is the half of the sentence that makes it news");

  // A young pond settling from its opening deal is not a crash. Forty founders
  // dying back to fifteen is the most ordinary thing that happens here.
  const settling = pond({ pop: 9, tick: 900, popHistory: [{ pop: CRASH_MIN_PEAK - 1 }] });
  assert.notEqual(settling.rank, RANK.crash);
  assert.ok(pondHeadline(settling, CONFIG).rank > RANK.crash);
});

test("a brand-new pond gets the sentence that explains the experiment", () => {
  const h = pondHeadline(pond({ tick: 12 }), CONFIG);
  assert.equal(h.rank, RANK.young);
  assert.match(h.text, /food/, "it has to say what the creatures are doing and why it matters");
});

test("hunger is read off the mix of the recent dead", () => {
  const hungry = pond({ deaths: [...died("starvation", 30), ...died("age", 10)] });
  const h = pondHeadline(hungry, CONFIG);
  assert.equal(h.rank, RANK.starving);
  assert.match(h.text, /75%/);

  // Too few bodies to have a mix at all: three starvations is not a famine.
  const quiet = pond({ deaths: died("starvation", 3) });
  assert.ok(pondHeadline(quiet, CONFIG).rank > RANK.starving);
  // And old age taking most of them is not hunger.
  const old = pond({ deaths: [...died("age", 30), ...died("starvation", 5)] });
  assert.ok(pondHeadline(old, CONFIG).rank > RANK.starving);
});

test("hunting is a thing that has happened, not a gene somebody carries", () => {
  const armed = { carnivoreFrac: 0.6, carnivoreCount: 60 };
  // The gene, with no meal behind it — v1.101's distinction, kept.
  assert.ok(pondHeadline(pond({ ...armed, kills: 0 }), CONFIG).rank > RANK.hunting);
  // The gene in a world where hunting is switched off entirely.
  const peaceful = makeConfig({ seed: 1, predation: false });
  assert.ok(pondHeadline(pond({ ...armed, kills: 500 }), peaceful).rank > RANK.hunting);

  const h = pondHeadline(pond({ ...armed, kills: 500 }), CONFIG);
  assert.equal(h.rank, RANK.hunting);
  assert.match(h.text, /60 of the 100/);
});

test("a dominant lineage is named, not numbered", () => {
  const species = [
    { id: 0, parentId: null, count: 70 },
    { id: 1, parentId: null, count: 30 },
  ];
  const names = nameSpecies(species);
  const h = pondHeadline(pond({ species }), CONFIG, names);
  assert.equal(h.rank, RANK.dominant);
  assert.match(h.text, new RegExp(names.get(0).plural));
  assert.match(h.text, /70%/);
  // A pond too small for a share to mean anything keeps quiet about it.
  const tiny = pond({ pop: 15, species: [{ id: 0, parentId: null, count: 15 }] });
  assert.ok(pondHeadline(tiny, CONFIG).rank > RANK.dominant);
});

test("a record population is the good news it is", () => {
  const h = pondHeadline(pond({ pop: 240, maxPopEver: 240 }), CONFIG);
  assert.equal(h.rank, RANK.boom);
  assert.match(h.text, /240/);
  assert.ok(pondHeadline(pond({ pop: 120, maxPopEver: 400 }), CONFIG).rank > RANK.boom);
});

// ---- The calm pond ----

test("a calm pond rotates through four facts, on the clock and not on a coin", () => {
  const seen = new Set();
  for (let i = 0; i < 4; i++) {
    const h = pondHeadline(pond({ tick: 5000 + i * CALM_ROTATE }), CONFIG);
    assert.equal(h.rank, RANK.calm);
    seen.add(h.text);
  }
  assert.equal(seen.size, 4, "four rotations should be four different sentences");
  // It comes back around, and the same tick always gives the same line.
  const a = pondHeadline(pond({ tick: 5000 }), CONFIG);
  const b = pondHeadline(pond({ tick: 5000 + 4 * CALM_ROTATE }), CONFIG);
  assert.equal(a.text, b.text);
  assert.equal(pondHeadline(pond({ tick: 5000 }), CONFIG).text, a.text);
});

// ---- The hold ----

test("a headline keeps the banner until something more urgent arrives", () => {
  const calm = { rank: RANK.calm, icon: "🌊", text: "quiet" };
  const first = nextHeadline(null, calm, 1000);
  assert.equal(first.since, 1000);

  // Same rank, different words, inside the hold: the reader is still reading.
  const other = { rank: RANK.calm, icon: "👪", text: "also quiet" };
  assert.equal(nextHeadline(first, other, 1000 + HEADLINE_HOLD - 1), first);
  // Past it, the new line takes over and restarts the clock.
  const later = nextHeadline(first, other, 1000 + HEADLINE_HOLD);
  assert.equal(later.text, "also quiet");
  assert.equal(later.since, 1000 + HEADLINE_HOLD);

  // More urgent interrupts immediately — that is what rank is for.
  const crash = { rank: RANK.crash, icon: "📉", text: "crashing" };
  assert.equal(nextHeadline(first, crash, 1001).text, "crashing");
  // And the same sentence chosen again is the same object, so the caller's
  // identity check skips the DOM write rather than rewriting it unchanged.
  assert.equal(nextHeadline(first, { ...calm }, 9999), first);
});

test("a reset does not leave the old pond's sentence holding the slot", () => {
  const held = nextHeadline(null, { rank: RANK.calm, icon: "🌊", text: "old pond" }, 8000);
  const fresh = nextHeadline(held, { rank: RANK.young, icon: "🥚", text: "new pond" }, 3);
  assert.equal(fresh.text, "new pond");
  assert.equal(fresh.since, 3);
});

// ---- Plain words ----

/**
 * Every sentence this module can produce, from states chosen to reach each rule.
 * Collected once so the sweeps below are about the vocabulary rather than about
 * any one state.
 */
function everySentence() {
  const species = [
    { id: 0, parentId: null, count: 70 },
    { id: 1, parentId: null, count: 30 },
  ];
  const states = [
    pond({ pop: 0 }),
    pond({ pop: 1 }),
    pond({ pop: 4 }),
    pond({ pop: 40, popHistory: [{ pop: 200 }] }),
    pond({ tick: 12 }),
    pond({ deaths: died("starvation", 30) }),
    pond({ carnivoreFrac: 0.6, carnivoreCount: 60, kills: 500 }),
    pond({ species }),
    pond({ pop: 240, maxPopEver: 240 }),
    ...[0, 1, 2, 3].map((i) => pond({ tick: 5000 + i * CALM_ROTATE })),
  ];
  return states.map((s) => pondHeadline(s, CONFIG, nameSpecies(species)));
}

test("every headline is one finished sentence a stranger could read aloud", () => {
  for (const h of everySentence()) {
    assert.ok(h.icon.length > 0, "a headline carries a mark of its own");
    assert.match(h.text, /^[A-Z0-9]/, `"${h.text}" does not start like a sentence`);
    assert.match(h.text, /[.!?]$/, `"${h.text}" does not finish like one`);
    // Two lines of the banner at its narrowest. Longer than this and the card
    // grows a third line on a phone, which moves the pond down the page.
    assert.ok(h.text.length <= 160, `"${h.text}" is ${h.text.length} characters`);
  }
});

test("no headline speaks in this project's own vocabulary", () => {
  // The words this page uses everywhere else and a first-time visitor does not
  // have. The banner is the one surface that may not reach for them: a reader
  // who needs the glossary has already been handed the whole tile grid.
  const JARGON = [
    /\bcarnivor/i,
    /\bherbivor/i,
    /\blineage/i,
    /\bspecies\b/i,
    /\bgenome/i,
    /\bneural/i,
    /\bmutation/i,
    /\bfitness\b/i,
    /\bdeterminis/i,
    /\btick\b/i,
    /\bpx\b/i,
    /\bmetabolis/i,
    /\bphylogen/i,
    /\bpredation\b/i,
  ];
  for (const h of everySentence()) {
    for (const word of JARGON) {
      assert.doesNotMatch(h.text, word, `the banner should not need "${word}" to say this`);
    }
    // No decimals either: a headline is read at a glance, and "37.4%" is a
    // number somebody has to stop on.
    assert.doesNotMatch(h.text, /\d\.\d/, `"${h.text}" carries a decimal`);
  }
});

// ---- Real ponds ----

test("a real pond always has something sayable, at every stage of its life", () => {
  const world = new World(makeConfig({ seed: 42 }));
  const seen = new Set();
  for (let i = 0; i < 6000; i++) {
    world.step();
    if (i % 25 !== 0) continue;
    const h = pondHeadline(world, world.config, nameSpecies(world.phylogeny.species));
    assert.ok(h.text.length > 0 && Number.isInteger(h.rank), `nothing to say at tick ${world.tick}`);
    assert.doesNotMatch(h.text, /NaN|undefined|Infinity/, `"${h.text}" at tick ${world.tick}`);
    seen.add(h.rank);
  }
  // A 6,000-tick pond is not one situation. If this ever collapses to a single
  // rank the banner has become a slogan.
  assert.ok(seen.size >= 3, `only ${seen.size} kinds of headline in a whole run`);
  assert.ok(seen.has(RANK.young), "every pond starts new");
});

test("two ponds of one seed write the same headline at every step", () => {
  const a = new World(makeConfig({ seed: 314 }));
  const b = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 2000; i++) {
    a.step();
    b.step();
    if (i % 50 !== 0) continue;
    const ha = pondHeadline(a, a.config, nameSpecies(a.phylogeny.species));
    const hb = pondHeadline(b, b.config, nameSpecies(b.phylogeny.species));
    assert.deepEqual(ha, hb);
  }
});

test("reading a pond does not move it", () => {
  // The prime directive, in the shape a pure observer has to satisfy: the
  // watched pond and the unwatched one are the same pond, and no headline is
  // allowed to reach for a random number on the way.
  const watched = new World(makeConfig({ seed: 7 }));
  const ignored = new World(makeConfig({ seed: 7 }));
  const random = Math.random;
  Math.random = () => {
    throw new Error("the headline drew a random number");
  };
  try {
    for (let i = 0; i < 1200; i++) {
      watched.step();
      ignored.step();
      pondHeadline(watched, watched.config, nameSpecies(watched.phylogeny.species));
    }
  } finally {
    Math.random = random;
  }
  assert.equal(stateFingerprint(watched), stateFingerprint(ignored));
});
