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
