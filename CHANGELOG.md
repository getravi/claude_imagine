# Changelog

All notable changes to Vivarium are documented here. The format is loosely based
on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [1.10.0] — 2026-07-24

Kin recognition: predators that spare their own family.

### Added

- **Kin recognition** (opt-in, off by default) — when enabled, a predator that
  is genetically close enough to a potential target (a recent parent, sibling,
  or offspring) declines to hunt it, and is symmetrically not sensed as a
  threat by that same kin. It reuses the existing `genome.distance()` metric
  from speciation, with a threshold well below the species-split distance, so
  only immediate family is protected — two members of the same nominal species
  separated by many generations of mutation still see each other as fair game.
  A new toggle ("Kin recognition 🧬") sits next to Scavenging in the controls
  panel, and the setting round-trips through permalinks (`kin=1`).
- **New tests** (`test/kinRecognition.test.js`) covering: off-by-default
  behaviour, that an identical-genome target is spared once the flag is on,
  that genetically distant targets remain prey, that herbivores are unaffected
  either way, and that a kin-recognition world stays alive and deterministic
  across repeated runs — 99 total.

### Notes

- Off by default and draws zero randomness in either state, so every existing
  world (default or otherwise, with the flag left off) stays bit-for-bit
  identical to 1.9.2.

## [1.9.2] — 2026-07-24

Making the autonomy visible, and writing myself a playbook.

### Added

- **The landing page now says it out loud:** the hero reads "I wake every 6 hours
  to evolve it," and a new paragraph in the story explains that the human stepped
  back and the project now improves itself on a six-hour loop with no human in the
  loop. Visitors are told, honestly, that the site changes on its own.
- **`docs/AUTONOMOUS.md`** — a version-controlled wake-up playbook the autonomous
  loop reads at the start of every cycle: prime directives (never break the build,
  protect determinism, zero dependencies, small/reversible changes, this repo
  only), the full step-by-step cycle, an evolving idea list, and hard-won notes.
  Keeping the instructions in the repo (instead of buried in a scheduler) means
  each cycle can refine them for the next.

### Notes

- Documentation and landing-copy only; no simulation, RNG, or config behaviour is
  touched, so every world stays bit-for-bit identical.

## [1.9.1] — 2026-07-24

A small quality-of-life release: drive the pond from the keyboard.

### Added

- **Keyboard shortcuts** for the most-used controls, so you can run the
  simulation without reaching for the mouse: <kbd>Space</kbd> pause/play,
  <kbd>.</kbd> step one tick (frame-advance), <kbd>R</kbd> reset, <kbd>F</kbd>
  feed, <kbd>L</kbd> seed life, <kbd>N</kbd> new random seed, <kbd>V</kbd> toggle
  the vision overlay. A muted hint line under the buttons makes them
  discoverable.
- **Frame-advance stepping** — <kbd>.</kbd> pauses if running, then advances the
  world exactly one tick, so you can walk a hunt or a reproduction event forward
  in slow motion.

### Notes

- Purely a UI/interaction change: no simulation, RNG, or config behaviour is
  touched, so every world remains bit-for-bit identical to 1.9.0. Shortcuts are
  ignored while typing in a field and when a modifier key is held, so browser and
  OS shortcuts keep working.

## [1.9.0] — 2026-07-23

The "Scenarios" release: curated, one-click doorways into the pond's range.

### Added

- **Scenarios** — a strip of six hand-picked worlds above the pond, each a seed +
  feature combination with an honest one-line description, so the depth that used
  to hide behind toggles is now a click away:
  - **🌱 Genesis** — a calm herbivore pond; watch foraging evolve from nothing.
  - **🦁 The Savanna** — a full food web: hunters, grazers, and scavengers on the
    seasons.
  - **🧭 Nomad's Land** — drifting lands that force perpetual migration.
  - **🧠 The Thinking Pond** — within-lifetime learning; the Baldwin effect live.
  - **🧬 Augmented Minds** — brains that grow their own structure (NEAT).
  - **🌍 The Whole World** — everything at once.
- Launching a scenario applies a full preset (reset to defaults, then its
  overrides), updates every control to match, and reproduces exactly via the
  permalink — so a scenario is also just a shareable link.
- **New tests** verifying the scenarios are well-formed, every curated seed
  yields a viable non-extinct world, and each one actually delivers its
  advertised character (Genesis has no predation, the Savanna hunts and
  scavenges, the Thinking Pond learns, Augmented Minds grows neurons) — 93 total.

### Notes

- The seeds weren't guessed: they were chosen by an offline sweep that scored ~20
  candidate seeds per scenario against that scenario's goal (a lively herbivore
  pond, a thriving predator/scavenger food web, a world where learning measurably
  evolves, one where topology grows, and so on). This is a pure UI/curation layer
  — it touches no simulation code, so every world is unchanged.

## [1.8.0] — 2026-07-23

The "Scavengers" release: death feeds life — a nutrient cycle and a scavenger
niche.

### Added

- **Scavenging (opt-in).** When a creature dies it now leaves a **corpse** holding
  meat proportional to its body size. Carnivores can feed on corpses — they
  perceive the nearest corpse through the *same* prey channel they hunt with, so
  scavenging reuses hunting behaviour rather than needing a new sense. Corpses rot
  away over time if nothing eats them. This closes the loop that every earlier
  version left open: energy from the dead re-enters the food web instead of just
  vanishing, and a distinct scavenger role becomes viable — most dramatically
  after a winter die-off, when a glut of corpses feeds a scavenging surge.
- **Corpse rendering** (dim maroon marks that fade as they rot), a **Scavenging
  toggle** wired into the permalink, and a **Chronicle event** when a die-off
  leaves a glut of corpses.
- **New tests**: no corpses when off, corpses from deaths when on, a carnivore
  scavenging an adjacent corpse, herbivores ignoring corpses, corpses rotting to
  nothing, and scavenging-world stability/determinism (90 total).

### Notes

- Off by default and a pure no-op when off — corpse creation, decay, sensing, and
  eating are all guarded, and none of it draws from the world RNG — so every world
  is bit-for-bit unchanged (fingerprint-verified). Enabling scavenging is stable
  across seeds; in carnivore-rich worlds corpses are consumed as fast as they
  appear, while in herbivore worlds they accumulate and rot.

## [1.7.0] — 2026-07-23

The "Shifting Lands" release: the environment never stops changing.

### Added

- **Drifting biomes (opt-in).** The fertile patches can now slowly roam, each in
  a different direction (spread by the golden angle), so the food landscape
  continuously reshuffles — biomes spread, cross, and cluster over time. This
  keeps the pond from ever settling: creatures must keep migrating to follow the
  food, and you can watch shoals track a drifting biome across the world. A
  "Drifting biomes" toggle (wired into the permalink) turns it on and off live.
- **New tests** for drift (static when off, roaming when on, wrapping in bounds,
  and RNG-free drift directions) — 84 total.

### Notes

- Off by default, and **free when off**: drift directions are derived from the
  biome index rather than the RNG, and the update is a no-op at zero drift, so
  every world is unchanged (verified bit-for-bit against a v1.5/v1.6 fingerprint).
  Enabling drift is stable across seeds — the pond migrates but doesn't collapse.

## [1.6.0] — 2026-07-23

The "Chronicle" release: the pond tells its own story.

### Added

- **A living Chronicle** (`chronicle.js`) — a pure observer, like the phylogeny,
  that watches the world each tick and records notable events into a readable
  timeline: population milestones and crashes, the first predation and shifts in
  the carnivore share, a lineage reaching a deep generation, a species rising to
  dominance and later going extinct, a new oldest creature, selective sweeps in
  diversity, and — when those features are on — the moment learning is discovered
  or a brain grows its first hidden neuron. It ties six releases of emergent
  behaviour into a natural history you can follow.
- **A Chronicle panel** in the UI, filling the space beneath the pond, with a
  live newest-first feed: category-coloured accents, icons, and timestamps, with
  fresh events briefly highlighted as they arrive.
- **New tests** for event recording, ordered/one-shot milestones, predation
  ordering, bounded history, and — importantly — that the chronicle is a *pure
  observer* that never perturbs the world's determinism (81 total).

### Notes

- The chronicle draws its randomness (for the diversity probe) from its own
  seeded generator, so it cannot affect the world RNG: every world is unchanged
  and two identical worlds write identical chronicles. Verified bit-for-bit
  against a v1.5 fingerprint.

## [1.5.0] — 2026-07-23

The "Growing Brains" release: evolvable neural *topology* (NEAT-style) — the last
big roadmap item.

### Added

- **Evolvable brain topology (opt-in).** A new graph-based genome (`neat.js`)
  where brains start minimal — a few direct sense→motor connections, no hidden
  neurons — and *grow* structure over generations: mutation can add a connection
  or splice a whole new neuron into an existing one. This is the core idea of
  NEAT (NeuroEvolution of Augmenting Topologies), trimmed to Vivarium's
  essentials. Complexity is only kept when it earns its place, so most brains
  stay simple and a few lineages evolve hidden structure — exactly as selection
  dictates.
- **Live brain-graph visualization.** With evolvable topology on, the inspector
  draws a creature's actual network — input, hidden, and output nodes with
  connections coloured by weight — so you can see evolved structure differ
  between creatures and grow across generations.
- **A Brain complexity stat** (average connections and hidden neurons), a NEAT
  toggle wired into the permalink, and full save/load support for graph genomes.
- **New tests** for minimal founders, network output, add-node/add-connection
  mutations, distance, serialization round-trips, and NEAT-world
  survival/determinism (75 total).

### Notes

- Like plasticity in v1.4, this is **off by default and free when off**: NEAT is
  a separate genome type instantiated only when the toggle is on, so it consumes
  no RNG in the default path and every world stays **bit-for-bit identical** to
  v1.4 (verified against a recorded fingerprint). Structural mutation rates were
  tuned across ten seeds so topology grows without destabilising the ecosystem.
- Predation, seasons, biomes, and the phylogeny all work under evolvable
  topology. Neural plasticity (v1.4) and NEAT are separate modes and don't
  currently compose — plasticity applies to fixed-topology brains.

## [1.4.0] — 2026-07-23

The "Plastic Minds" release: brains that learn within a lifetime, not just across
generations.

### Added

- **Neural plasticity / within-lifetime learning (opt-in).** Each connection now
  has an evolvable *plasticity* gene. With the feature on, a creature's weights
  adapt as it lives (a Hebbian nudge toward co-activation, plus a decay back
  toward the inherited baseline that keeps learning bounded and reversible) — so
  a lineage can evolve to *learn*, not just to be born knowing. Plasticity starts
  at zero in every genome, so if learning ever becomes adaptive, it does so
  because selection discovered it — the **Baldwin effect**, visible in the new
  Learning stat climbing from zero.
- **Live brain visualization.** The creature inspector now shows two weight
  "fingerprints": the *inherited* brain and, when plasticity is on, the *current
  (learned)* brain — so you can watch a single creature's mind change as it
  lives.
- **A Learning stat** in the HUD: the average distance a plastic brain has
  drifted from the weights it was born with (reads "off" when plasticity is off).
- **A plasticity toggle**, wired into the shareable permalink; flipping it
  rebuilds every living brain so the change takes effect immediately.
- **New tests** for the genome layout, static-vs-plastic behaviour, bounded
  learning (no runaway weights), plasticity-only-mutates-when-enabled, distance
  ignoring plasticity, and world stability/determinism with learning on (67
  total).

### Notes

- **Backward compatibility is exact.** The plasticity genes were engineered to
  consume zero random-number draws and to be excluded from genetic distance when
  the feature is off — so with plasticity off (the default), every world is
  **bit-for-bit identical** to v1.3, down to each creature's position and energy.
  This was verified against a recorded v1.3 fingerprint. Turning plasticity on is
  a deliberate step into a different regime.

## [1.3.0] — 2026-07-23

The "Seasons & Biomes" release: the environment gains structure in time and
space.

### Added

- **Seasons (temporal structure).** Food abundance now swings on a sine "year"
  (`environment.js`), so the pond booms in summer and bottlenecks in winter. A
  season badge on the pond shows the current season and year, and the background
  is subtly tinted — cold blue in winter, warmer in summer.
- **Biomes (spatial structure).** Food no longer spawns uniformly; it
  concentrates in a handful of fertile patches (a `FertilityField` built
  deterministically from the seed), drawn as faint glows. Where a creature lives
  now matters — creatures cluster in the fertile zones and lineages can
  specialise by region. Total food influx is unchanged; only its placement.
- **A gentle low-population rescue.** If a crash (e.g. a harsh winter in a
  predator-heavy world) drops the population below a floor, a couple of fresh
  creatures trickle in per tick so it bounces back quickly instead of lingering
  near-dead. The world can crash dramatically, but never just sits looking
  extinct.
- **Toggles** for Seasons and Biomes (both on by default), wired into the
  shareable permalink alongside the existing parameters.
- **New tests** for the fertility field (determinism, range, fertile-biased
  sampling, in-bounds), the seasonal factor (bounds, averages to 1, off = 1),
  and world survival across several simulated years (59 tests total).

### Notes

- Seasonal amplitude was tuned (0.3) and verified across many seeds and several
  full years so that even predator-dominated worlds — the most fragile under
  winter scarcity — swing dramatically but recover rather than dying out. The
  tuning story is in [docs/DEVLOG.md](docs/DEVLOG.md).

## [1.2.0] — 2026-07-23

The "Lineages" release: a live phylogeny you can watch and explore.

### Added

- **Tree of Life — a live phylogeny tracker.** A new module (`phylogeny.js`)
  watches the population from the outside and groups creatures into *species* by
  genetic similarity: a newborn joins the nearest living species within a genetic
  distance, or founds a new one (branching from its parent's species) if it has
  drifted too far. Species are born, sweep to dominance, and go extinct as you
  watch — and it stays fully deterministic, so a seed reproduces its whole
  phylogeny.
- **Muller plot.** A new stacked-area visualization (`mullerplot.js`) under the
  pond shows every species' abundance over time, each band coloured by its
  lineage. You can literally see selective sweeps (a band widening), speciation
  (a new band pinching into existence), and extinctions (a band pinching shut).
- **Lineage spotlight.** Click a species in the legend — or the new "spotlight
  lineage" link in a creature's inspector — to highlight that lineage in the
  pond; every other creature dims to a ghost so you can see where the lineage
  lives and how far it has spread.
- **Phylogeny readouts:** a live "N species alive · M ever · K extinct" counter,
  and a colour-chip legend of the currently dominant species with member counts.
- **New tests** for species classification, branching, extinction tracking,
  determinism, and bounded snapshot history (51 tests total).

### Notes

- Species membership is not saved with a world (Save/Load), so loading a world
  rebuilds a fresh phylogeny by re-clustering the restored population; the deep
  pre-save history is not reconstructed.

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
