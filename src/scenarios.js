// scenarios.js — curated "worlds to try".
//
// Vivarium has accumulated a lot of depth behind toggles most people never find.
// A scenario is a one-click doorway into a particular *character* of world: a
// hand-picked seed plus a combination of features, with an honest one-line
// description of what you'll see. The seeds were chosen with an offline sweep
// (see _scenario_analysis.mjs) that scored many candidates against each
// scenario's goal — a lively herbivore pond, a thriving savanna food web, a
// world where learning actually evolves, and so on.
//
// Each `over` object is applied over the defaults (so anything it doesn't mention
// returns to its default), which means launching a scenario always gives a clean,
// reproducible world regardless of what you had switched on before.

export const SCENARIOS = [
  {
    id: "genesis",
    icon: "🌱",
    name: "Genesis",
    blurb:
      "A calm herbivore pond — no hunters, no seasons. Just watch foraging evolve from random founders.",
    over: { seed: 1, predation: false, seasons: false },
  },
  {
    id: "savanna",
    icon: "🦁",
    name: "The Savanna",
    blurb:
      "A full food web: hunters, grazers, and scavengers feeding on the fallen, all riding the seasons.",
    over: { seed: 2024, predation: true, scavenging: true, seasons: true },
  },
  {
    id: "nomad",
    icon: "🧭",
    name: "Nomad's Land",
    blurb:
      "The fertile lands drift, and life must keep migrating to follow the food. Nothing ever settles.",
    over: { seed: 88, biomeDrift: 0.1, seasons: true },
  },
  {
    id: "longnight",
    icon: "🌙",
    name: "The Long Night",
    blurb:
      "No seasons here, only sun and moon: sight collapses to a quarter at midnight, and hunters must work the dark.",
    over: {
      seed: 64,
      dayNightCycle: true,
      dayLength: 700,
      nightVisionFactor: 0.28,
      predation: true,
      seasons: false,
    },
  },
  {
    id: "plague",
    icon: "🦠",
    name: "The Plague",
    blurb:
      "A pathogen sweeps the pond in waves: the sick burn energy fast, survivors are immune for life, and every newborn is susceptible again.",
    // Seed 101 was earned by a 14-seed sweep scored on recurring epidemic waves
    // in a pond that survives them: it runs at ~150–280 creatures through three
    // full waves in the first 9,000 ticks, peaking near 45% sick, with herd
    // immunity building to about half the pond and then eroding as it fills with
    // susceptible newborns. Everything else is left at the defaults — the
    // pathogen alone is the story.
    over: { seed: 101, disease: true, predation: true, seasons: true },
  },
  {
    id: "commons",
    icon: "🌾",
    name: "The Commons",
    blurb:
      "Plants breed from plants, so a herd can eat the pond bare — and then has to wait for it to grow back. Crop and grazers rise and fall against each other.",
    // Seed 137 was earned by a 20-seed sweep scored on complete overgrazing
    // cycles in a pond that survives them: the founders leave the crop untouched
    // long enough for it to stand at the cap, the herd that builds on it strips
    // the pond bare around tick 2,100, green returns by 5,700, and from there
    // grazers and plants oscillate out of phase — a peak of one sitting in the
    // trough of the other — without the population ever dropping below ~28.
    // Hunters are left out on purpose: this world is about what the grazers do
    // to their own food supply when nothing is eating them.
    over: { seed: 137, foodRegrowth: true, predation: false, seasons: true },
  },
  {
    id: "lay",
    icon: "🏔️",
    name: "The Lay of the Land",
    blurb:
      "Ridges cost more to cross and grow almost nothing; the dead enrich the hollows they fall in. Nothing can see the landscape — the pond collects in the basins because that is where the crop is.",
    // Seed 13 was earned by a 48-seed sweep scored on the two things this world
    // is for: a landscape with visible relief, and a pond that demonstrably
    // settles into it. Its terrain is the most contoured of the field
    // (roughness sd 0.318 against a 0.214 median, 26% above the runner-up), and
    // over 20,000 ticks it holds the strongest settling of the finalists —
    // ground bias -0.111, crop bias -0.048 — while never dropping below 44
    // creatures and evolving a working predator lineage (361 kills, 88%
    // carnivore) with a quarter of its crop growing out of its own dead.
    //
    // What makes it the *honest* demonstration rather than merely the prettiest
    // one is the control. SCIENCE.md notes that on the default seed 314 the
    // terrain-off arm already reads -0.034, because that world's biomes happen
    // to sit in ground the terrain field also calls flat — settling you would
    // see with the mechanic switched off. On seed 13 the movement-tax-only arm
    // (`terrainBarrenness: 0`) reads **-0.003**: nothing. Every bit of the
    // settling here is the barren ridges moving the crop, which is exactly what
    // the blurb claims and what v1.23 measured.
    over: { seed: 13, terrain: true, detritus: true, predation: true, seasons: true },
  },
  {
    id: "rooms",
    icon: "🧱",
    name: "The Four Rooms",
    blurb:
      "Four walls of rock, opaque to every sense, cut the pond into rooms joined by narrow gates. Crossings all but stop, and the lineages either side of a wall drift apart.",
    // Seed 51 was earned by a 64-seed sweep scored on the claim this world makes
    // and, above all, on its *control*. v1.48 measured isolation by distance as
    // the mean genetic distance between creatures in different rooms minus the
    // mean within a room, as a fraction of the within-room distance — and the
    // control that makes it worth believing is the one inside the same run: the
    // same creatures at the same instant, partitioned by lines shifted half a
    // room over. At 4,000 ticks on this seed the real lines read **+0.807** and
    // the shifted ones **+0.052**, a factor of fifteen; the ordinary
    // between-arms control (no walls, same real lines) reads **-0.104**. All
    // three agree, and the seed keeps the signal for a long watch (+0.556 over
    // ticks 4,000–8,000 against a control of +0.074, +0.176 over 8,000–16,000
    // against +0.037), which most of the field does not — a lineage sweeping the
    // whole pond erases the difference it took the rooms to build.
    //
    // The mechanism is the crossing rate: 31.7 room changes per 10,000
    // creature-turns without the rock, 8.1 with it. The pond stays a pond
    // meanwhile — a mean of 217 creatures, never below 37, and a working
    // predator lineage (765 kills over 16,000 ticks).
    //
    // `barrierOcclusion` is on because a wall you can see through is not a wall,
    // and for no other reason: v1.50 measured opacity against exactly this
    // isolation claim and found it does not deepen it (6 of 12 seeds, a coin
    // toss). The drift here is what restricted *movement* does. The darkness is
    // what a creature can know.
    over: { seed: 51, barriers: true, barrierOcclusion: true, predation: true, seasons: true },
  },
  {
    id: "earshot",
    icon: "📣",
    name: "Earshot",
    blurb:
      "Every creature has always flashed a signal; here, for the first time, the others can hear it. Whether the pond ever makes anything of that is an open question — watch and see.",
    // Seed 23 was earned by a 28-seed sweep scored on what actually makes this
    // world worth watching: a busy channel (mean heard signal 0.80, the highest
    // of the field), predators persisting through 59% of the run so there is
    // something worth calling about, and a pond that holds around 220 creatures
    // and never drops below 41. 439 kills across 12,000 ticks — a working food
    // web with a crowd loud enough to hear itself.
    over: { seed: 23, signalling: true, predation: true, seasons: true },
  },
  {
    id: "kin",
    icon: "👪",
    name: "One Big Family",
    blurb:
      "Hunters here recognise their own relatives and let them go. In most ponds that rule never speaks once; in this one it turns down thousands of meals — in bursts, with long silences between them.",
    // Seed 512 was earned by a 64-seed sweep of the only door this project has
    // ever had to open onto a rule that is *ecologically conditional*. Kin
    // recognition (v1.10) is not a mechanic a seed either shows or hides; v1.80
    // measured that on nine ponds of twelve it never fires at all, and a rule
    // that never fires draws nothing and perturbs nothing, so those worlds are
    // their own controls bit-for-bit. Picking a seed here is picking one of the
    // minority of worlds where the rule has anything to say.
    //
    // Sixty-four seeds, 12,000 ticks, the flag on: **nineteen** spare a
    // relative at all and forty-five never do. Five speak in three or more
    // separate thousand-tick windows, and only two — 23 and 512 — are still
    // speaking in the last quarter of the run, which is v1.52's rule about
    // scoring on persistence rather than on the peak. Seed 23 spares the most
    // and is a thin, cannibal pond (a mean of 95 creatures, dipping to 5) that
    // is already Earshot's door. Seed 512 holds a mean of **165** creatures
    // over 20,000 ticks, never drops below 40, and kills 303 times meanwhile —
    // a working food web that also happens to be full of cousins.
    //
    // What it delivers: **8,800 declined meals** over 20,000 ticks in four
    // episodes, peaking at 300 per hundred ticks, the first at **t1,983** —
    // early enough that a visitor watching the Kin tile and the Chronicle sees
    // the rule speak rather than reading about it.
    //
    // The control is the sharpest thing here and it is exact rather than
    // statistical. Run this seed with `kinRecognition` off alongside: the two
    // ponds are identical on all four fingerprint channels through t1,982 and
    // part on t1,983, the tick of the first refusal. That is the complement of
    // v1.80's finding — there, the flag was a no-op forever; here, the world it
    // makes is the world it would have been until the exact instant the rule
    // gets its first chance to matter. `test/scenarios.test.js` holds both ends.
    //
    // What this scenario deliberately does *not* claim: that any of it changes
    // the pond's fate. From t7,500 to t13,000 this world nearly stops killing
    // (about one kill per 500 ticks) while refusals run at 175 per hundred, and
    // the story writes itself — except that the flag-off arm has the same
    // drought over the same window. The blurb says what the rule *did*, and
    // v1.80's random-refusal control is why it says nothing about what it
    // caused.
    over: { seed: 512, kinRecognition: true, predation: true, seasons: true },
  },
  {
    id: "thinking",
    icon: "🧠",
    name: "The Thinking Pond",
    blurb:
      "Brains can learn within a lifetime — watch the capacity to learn evolve from nothing (the Baldwin effect).",
    over: { seed: 314, plasticity: true },
  },
  {
    id: "augment",
    icon: "🧬",
    name: "Augmented Minds",
    blurb:
      "Brains start with almost no structure and grow their own. Click a creature to see its evolved network.",
    over: { seed: 777, evolvableTopology: true },
  },
  {
    id: "whole",
    icon: "🌍",
    name: "The Whole World",
    blurb:
      "Everything at once: predation, scavenging, seasons, drifting lands, and brains that learn.",
    over: {
      seed: 7,
      predation: true,
      scavenging: true,
      seasons: true,
      biomeDrift: 0.1,
      plasticity: true,
    },
  },
];
