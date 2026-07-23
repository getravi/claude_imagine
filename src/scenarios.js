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
