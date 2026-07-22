# Changelog

All notable changes to Vivarium are documented here. The format is loosely based
on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [1.1.0] — 2026-07-22

The "Predators" release: an evolvable food web, sexual reproduction, and
shareable worlds.

### Added

- **Predation and an evolvable diet.** Every creature now carries a diet gene
  running from pure herbivore to pure carnivore. Carnivores that are meaningfully
  larger than a neighbour can bite it, draining its energy (and killing it if it
  hits zero) and feeding themselves in proportion to how carnivorous they are.
  Nutrition from plants shrinks as a creature becomes more carnivorous, so the
  two niches genuinely trade off. Nothing scripts predators into existence —
  they *evolve* in worlds where hunting pays, which (by design, after a 17-seed
  survey) is a minority of worlds. The default seed is chosen to grow a visible
  predator/prey mix.
- **Richer senses.** The brain grew from 11 inputs to 16: it now senses the
  nearest *prey* and nearest *threat* separately (not just "nearest creature"),
  and knows its own diet and size, so a single evolved brain can behave
  differently depending on whether it hatched a hunter or the hunted.
- **Predation stabilisers.** A bite cooldown ("handling time"), a required size
  advantage, an intrinsic metabolic cost of carnivory, and a plant-grazing
  fallback together keep predator/prey dynamics oscillating instead of
  collapsing. Verified across 17 seeds with zero extinctions.
- **Sexual reproduction (opt-in).** Toggle it on and a reproducing creature
  crosses genomes with its nearest partner instead of cloning itself.
- **Shareable permalinks.** The seed and key parameters live in the URL hash and
  update as you tweak; a **Share** button copies the link so you can hand
  someone the exact world you're looking at.
- **New readouts.** A carnivore count/percentage and a kill counter in the HUD,
  and a diet line (herbivore / omnivore / carnivore) in the creature inspector.
- **Predator visuals.** Carnivores render as sharper, dagger-like bodies with a
  warm outline and a glowing core, and flash when they land a bite — readable at
  a glance without hiding a creature's inherited lineage colour.
- **New tests** covering the diet gene, the `canEat` predicate, bite energy
  transfer, plant-nutrition scaling, predation determinism/stability, and both
  asexual and sexual reproduction.

### Changed

- Brain topology is now 16→12→3 (was 11→10→3) and genomes carry four body genes
  (added *diet*), so saved worlds from 1.0.0 are not compatible with 1.1.0.
- Food is a little scarcer by default (spawn rate 2.5 → 1.8). Contested plant
  food is what creates the ecological opening for predation to be selected; the
  full reasoning is in [docs/DEVLOG.md](docs/DEVLOG.md).

## [1.0.0] — 2026-07-22

The first release: a complete, playable artificial life simulation.

### Added

- **Simulation core.** Creatures with fixed-topology neural-network brains that
  sense, think, and act each tick; an energy economy (existing and moving cost
  energy, eating restores it); asexual reproduction with mutation; and death by
  starvation or old age. No fitness function — selection is entirely emergent.
- **Toroidal world** with wrap-around geometry, so there are no walls or corners
  for evolution to exploit.
- **Seeded determinism.** A `(seed, parameters)` pair fully determines a world's
  entire history, enabling shareable worlds and exact-outcome tests.
- **Spatial hash grid** for fast neighbour queries, keeping the sim smooth at
  hundreds of creatures.
- **Live visualisation** on canvas: glowing creatures with comet trails,
  energy-linked brightness, and inherited colour so lineages are visible.
- **Interactive UI:** pause/play, reset, feed, seed life, a seed input with a
  randomiser, a 1×–20× speed control, live sliders for food rate / metabolism /
  mutation rate, a vision-radius overlay, and save/load to local storage.
- **Inspector.** Click any creature to see its generation, age, energy,
  offspring count, body traits, and a colour "fingerprint" of its brain weights.
- **Live HUD and chart** tracking population, food, max generation, genetic
  diversity, births, deaths, tick, and FPS.
- **Genome operations:** two-scale mutation, uniform crossover (implemented,
  off by default), and a genetic-distance metric used for the diversity stat.
- **Test suite** (`node --test`, no framework): unit tests for the RNG, torus
  math, neural net, and genome; integration tests for world determinism,
  population stability, generational progress, absence of NaNs, and save/load.
- **Documentation:** README, the science background, the architecture guide, a
  first-person build devlog, and this changelog.
- **GitHub Pages deployment** via GitHub Actions.

### Notes

- Default ecosystem parameters were tuned by sweeping across six seeds to give a
  soft early game (no population "death valley"), a lively steady state of
  ~300–500 creatures that oscillates below the cap, and reliable generational
  turnover. See [docs/DEVLOG.md](docs/DEVLOG.md) for the full tuning story.
