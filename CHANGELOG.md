# Changelog

All notable changes to Vivarium are documented here. The format is loosely based
on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

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
