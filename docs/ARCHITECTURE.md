# Architecture

This document explains how Vivarium is put together: the module layout, the data
that flows through a single tick, and the handful of design decisions worth
calling out. If you want the *why* of the project (and the tuning story), read
the [devlog](DEVLOG.md); if you want the *what* of the science, read
[SCIENCE.md](SCIENCE.md). This is the *how* of the code.

## Design goals

1. **Zero dependencies, zero build step.** The whole thing is native ES modules
   that a browser loads directly. `git clone`, serve the folder, done. Nothing
   to `npm install`, nothing to transpile.
2. **The simulation is separable from the rendering.** Everything in `src/`
   except `render.js` and `main.js` is pure logic with no DOM or canvas
   dependency. That's what lets the exact same code run headless in the test
   suite under `node --test`.
3. **Determinism.** All randomness flows through one seeded generator, so a
   `(seed, config)` pair fully determines the future.
4. **Legibility over cleverness.** Fixed-topology brains, asexual reproduction,
   and direct gene→trait mapping were all chosen because they keep the causal
   chain from mutation to behaviour short and understandable.

## Module map

The dependency arrows point from a module to what it imports.

```
                 config.js  (plain data; imported by almost everything)
                     │
   rng.js ──► genome.js ──► creature.js ──┐
     │           ▲   │          ▲         │
     │           │   └► nn.js   │         ├──► world.js ──► main.js
     ▼           │              │         │        │          │
   vec.js ───────┴──────────────┴── grid.js        │      render.js
     ▲                                   food.js ───┤          ▲
     └───────────────────────────────── stats.js ──┘          │
                                                          index.html / style.css
```

| Module | Responsibility | DOM? |
| --- | --- | :---: |
| `config.js` | Every tunable constant of the universe, in one frozen object. | — |
| `rng.js` | Seedable PRNG (mulberry32) + distributions (uniform, normal). | — |
| `vec.js` | 2D and **toroidal** geometry: wrap, wrapped distance, angle math. | — |
| `nn.js` | Fixed-topology feed-forward neural network + forward pass. | — |
| `genome.js` | The fixed-topology genome: weights, plasticity, mutation, crossover, distance. | — |
| `neat.js` | Optional evolvable-topology genome + network (graph brains). | — |
| `creature.js` | One agent: sense → think → act → metabolism → reproduce. | — |
| `food.js` | Passive energy pellets (and, when scavenging is on, corpses). | — |
| `grid.js` | Spatial hash grid for O(1)-ish neighbour queries on a torus. | — |
| `environment.js` | Biomes (a fertility field) and seasons (a food-rate cycle). | — |
| `terrain.js` | Optional static roughness landscape: rough ground costs more to cross and grows less. | — |
| `detritus.js` | Optional decaying nutrient map: deaths enrich the ground, and part of the crop grows out of it. | — |
| `energy.js` | The pond's books: every unit created and destroyed, holding `created − destroyed === standing` at every tick. Pure bookkeeping — no randomness, and nothing in the simulation reads it. | — |
| `palette.js` | Colour decisions as pure functions, plus the dichromat simulation and ΔE that judge them. | — |
| `stats.js` | Rolling population/lineage/diversity measurements, and the mortality ledger (what each death was caused by, carried into both history buffers as cumulative counters so differencing any two samples is exact). | — |
| `archive.js` | A bounded record of the *whole* run: halves its own resolution as it fills, keeping exact min/max envelopes so no peak is ever silently smoothed away. | — |
| `phylogeny.js` | Groups creatures into species by genetic similarity (observation only). | — |
| `chronicle.js` | Records notable events into a natural-history timeline (observation only). | — |
| `world.js` | Owns all state; steps the whole simulation one tick. | — |
| `camera.js` | The viewer's lens: zoom, pan, follow, world↔screen on a torus. | — |
| `minimap.js` | The whole pond in miniature — ground, life and the viewport (read-only). | canvas |
| `gestures.js` | Pointer arithmetic: tap vs drag vs pinch, for a mouse and a hand alike. | — |
| `render.js` | Draws a world onto a 2D canvas (read-only). | canvas |
| `mullerplot.js` | Draws the "Tree of Life" stacked-area chart (read-only). | canvas |
| `scenarios.js` | Curated one-click world presets (data only). | — |
| `main.js` | Boot, the requestAnimationFrame loop, all UI wiring. | yes |

## The world and its state

A `World` (in `world.js`) owns everything mutable:

- `rng` — the single seeded generator for the entire simulation.
- `creatures` — a flat array of live `Creature`s.
- `food` — a `FoodField` holding the pellet array.
- `creatureGrid`, `foodGrid` — spatial hash grids, rebuilt each tick.
- `terrain` — a `TerrainField`, or `null` in a world without a landscape.
- `detritus` — a `DetritusField`, or `null` in a world that keeps no record of
  its dead. Both optional fields are `null` rather than inert when their feature
  is off, which is what makes their branches unreachable and their randomness
  undrawn.
- `stats` — measurements for the HUD and chart.
- `tick` — the integer clock.

Because the `World` holds *all* state and takes its seed and parameters up
front, constructing one and stepping it N times is a pure function of
`(seed, config, N)`. The tests lean on this hard.

## One tick, start to finish

`World.step()` is the spine of the whole project. In order:

1. **Rebuild the spatial index.** Clear both grids and re-insert every creature
   and every food pellet into their cells. (We rebuild from scratch each tick
   rather than tracking moves incrementally — simpler, and cheap because
   clearing reuses the cell arrays instead of reallocating.)

1b. **Contagion** (only if `disease` is on). Using the grid just rebuilt — so
   exposure is judged on the positions a watcher can see — every infected
   creature rolls against each susceptible neighbour within `infectionRadius`;
   new cases are applied only after the whole pass, so an infection advances one
   hop per tick regardless of array order. Infections older than
   `diseaseDuration` recover into lifelong immunity, and if no case is left
   anywhere a fresh one arrives on the `diseaseReintroduce` schedule.

2. **For each creature:**
   - **Find the nearest food** within vision, by asking the food grid only for
     candidates in the 3×3 block of cells around the creature, then doing exact
     toroidal distance tests on those.
   - **Find the nearest prey and nearest threat** in a single scan of the
     creature grid — the nearest neighbour this creature *could eat*, and the
     nearest one that could eat *it* (plus a nearest *mate* if sexual
     reproduction is on).
   - **`sense(...)`** — pack those findings into the creature's input vector.
   - **`think()`** — run the brain's forward pass.
   - **`act(...)`** — apply turn/thrust, integrate position (wrapping around the
     torus), and subtract the metabolic cost (including the upkeep of carnivory
     and, when sick, the price of a fever).
     This may mark the creature dead.
   - **Graze** — if it's sitting on the nearest pellet, consume it; nutrition
     scales down with how carnivorous it is.
   - **Bite** — if predation is on and the nearest prey is touching, drain the
     prey (killing it if its energy hits zero) and feed, subject to a per-predator
     bite cooldown.
   - **Reproduce** — if it's over the energy threshold and the population cap
     isn't hit, spawn a child into a `born` buffer (a mutated clone, or a
     crossover with the nearest mate when sexual reproduction is enabled).

3. **Reap and recruit.** Remove dead creatures; append the `born` buffer.

4. **Food upkeep.** Drop eaten pellets (`compact`) and spawn new ones (`step`),
   at a rate scaled by the current **season** and placed by the **biome**
   fertility field (both from `environment.js`). With `foodRegrowth` on, the rate
   is additionally scaled by the standing crop and most new pellets are seeded
   next to an existing one, so the food is a population rather than a supply.

5. **Safety valves.** Enforce the population cap (during reproduction, so it can
   never explode); reseed a burst of founders on full extinction; and trickle in
   a couple of creatures if a crash pushes the population below a small floor, so
   a dramatic crash recovers instead of lingering near-dead.

6. **Advance the clock** and let the observers run: sample stats, update the
   phylogeny, and let the chronicle record any notable event. All three only read
   state — none can affect the simulation or its determinism.

## Why a torus?

The world wraps: walk off the right edge and you reappear on the left; top
connects to bottom. This removes walls and corners, so there are no privileged
hiding spots and no boundary artefacts for evolution to exploit or get stuck on.
The cost is that "distance" and "direction" must consider the shorter path that
may cross a seam — handled centrally in `vec.js` by `wrapDelta`, `wrap`, and
`torusDist2`. Every distance and bearing in the simulation goes through those
functions, and the spatial grid wraps its cell indices to match.

## Why a spatial grid?

The naive way to answer "what's the nearest food?" is to scan every pellet for
every creature — O(creatures × food) per tick, which falls apart past a few
hundred of each. The `SpatialGrid` buckets entities into cells roughly one
vision-radius across, so a query only inspects the 3×3 block of cells around the
asker. With entities spread out, that turns the per-query cost from "everything"
into "a small constant," and the whole tick becomes effectively linear in the
number of entities. In practice a full pond of ~450 creatures steps in well
under a millisecond.

The grid only *narrows the candidate set*; callers still do a precise toroidal
distance test on the candidates. That separation keeps the grid dumb and
correct.

## Environment: biomes and seasons

`environment.js` shapes *where* and *how fast* food appears, without touching
creatures directly.

- **Biomes** are a `FertilityField`: a few Gaussian "bumps" whose centres are
  drawn from the world RNG (so a seed reproduces the same landscape). Its `at()`
  returns a fertility in `[floor, 1]`, and `sample()` picks a spawn position by
  **rejection sampling** — propose a uniform point, accept it with probability
  equal to its fertility — so pellets concentrate in fertile areas. A bounded
  retry count means it can never spin forever, and the total food influx is
  unchanged; only its *placement* is biased.
- **Seasons** are a pure function of the tick: `seasonalFactor(tick)` is a sine
  wave in `[1 − amplitude, 1 + amplitude]` that multiplies the food spawn rate,
  so the pond booms and bottlenecks over a "year". Being a function of the tick
  (not wall-clock time) keeps it deterministic.

Both are read by `FoodField.step()` (which takes the seasonal multiplier) and
`spawnOne()` (which consults the fertility field), and both are drawn as ambient
cues by the renderer — faint biome glows and a season-tinted trail veil.

**Regrowth** (`foodRegrowth`, opt-in) lives in `food.js` rather than
`environment.js`, because it makes the crop depend on *itself* rather than on the
world. Two changes, both no-ops when the flag is off: `growthFactor()` scales the
spawn rate from `regrowthFloor` (bare pond) to 1 (full crop), and `spawnOne()`
sends a `regrowthSpread` share of new pellets to `_seedNear()`, which drops them
within `regrowthRadius` of a randomly chosen living pellet and lets the ground
refuse the seed with probability `1 − fertility` (so blooms stay in their biomes
instead of diffusing across the pond). The initial standing crop is sown with
`spawnAnywhere()` — seeding it from itself would grow all 280 pellets out of a
single point.

## The brain, concretely

A brain (`nn.js`) is one hidden layer, `tanh` throughout:

```
inputs (16) ──[weights]──► hidden (12, tanh) ──[weights]──► outputs (3, tanh)
```

The weights live in a single flat `Float32Array` laid out as:

```
[ hidden weights: 12×16 ] [ hidden biases: 12 ] [ output weights: 3×12 ] [ output biases: 3 ]
```

That flat layout is the whole point: the genome *is* this array (plus four body
genes), so mutation is just "add a little noise to some entries" and crossover is
"pick each entry from one parent or the other." The three outputs are turn,
thrust, and a "colour signal" the creature can flash (currently only used for
rendering, but available for signalling to evolve if it ever pays off).

The exact input list is defined in `Creature.sense()` and its length is asserted
to match `BRAIN.inputs` in `genome.js` — change one and you must change the
other, so they're kept adjacent in spirit and documented in both places.

**Optional within-lifetime learning.** The full genome layout is
`[ weights ][ plasticity ][ body genes ]` — a parallel plasticity vector the same
length as the weights. When the plasticity feature is on, `NeuralNet` keeps a
mutable current weight, its inherited baseline, and the plasticity coefficients,
and after each forward pass nudges every connection by a Hebbian term (gated by
its plasticity gene) plus a decay back toward the baseline. When it's off, the
net is exactly the static v1.0–v1.3 network. The plasticity genes are engineered
to cost **zero** RNG draws and to be excluded from `distance()` when the feature
is off, so every world stays bit-for-bit identical by default (there's a
fingerprint check for this) — see the devlog for why that invariant mattered.

## Genome → creature

When a `Creature` is born it decodes its genome once:

- The brain weights build its `NeuralNet` (via a **copy**, so the running net
  never mutates the stored genome — there's a test for exactly this).
- Four body genes map to: **size** (radius, which affects metabolic cost and
  who it can eat / be eaten by), **metabolism** (a multiplier on base energy
  drain), **hue** (its colour, which drifts as a lineage mutates and gives you
  the visible "family tree"), and **diet** (0 = herbivore … 1 = carnivore,
  which governs grazing nutrition, hunting, and the upkeep cost of carnivory).

## Species and the phylogeny (observation only)

`phylogeny.js` sits *outside* the simulation and watches it. The world calls it
at exactly three moments — when a founder is created, when a creature is born,
and once per tick to sample — and it never influences a single creature's
behaviour. This separation is deliberate: it means the phylogeny can be as
elaborate as we like without ever threatening determinism or the tuned dynamics.

A **species** is a cluster of genetically similar creatures. It carries a fixed
*representative* genome (its founder's), a colour, a birth tick, and a parent
species (for the tree). Classification is **online phenetic clustering**: when a
creature is born, it joins the nearest *living* species whose representative is
within `speciationDistance` (mean absolute genome difference); if none qualifies,
it founds a new species branching from its biological parent's. That's
O(living species) per birth — cheap, because only a handful coexist.

The threshold matters more than it looks. Founders start far apart in genome
space (~1.1), but a lineage drifts only slightly per generation, so the threshold
must sit well below the founder spacing for descendants to *shed* new species as
they diverge — otherwise you get winnowing of the founders but no branching. See
the devlog for that tuning story.

Every few ticks the phylogeny re-tallies each species' true membership from the
live population (correcting the incremental counts, which don't see deaths),
records a snapshot, and marks newly-extinct species. `mullerplot.js` turns those
snapshots into the stacked-area "Tree of Life" chart, and the renderer can dim
every creature outside a chosen species to spotlight one lineage in the pond.

Because every branched species records the species of its founder's parent,
the tree can also be read *upward*: `Phylogeny.ancestry(id)` walks those parent
links back to the founding species, returning the chain oldest-first. That is
what the inspector's ancestry row draws — the genealogy of whichever creature
you clicked. The walk is cycle-guarded and depth-bounded because it runs inside
the render loop.

## Two genome kinds behind one interface

As of v1.5 a creature's genome is one of two completely different data
structures: the fixed-topology `Genome` (a flat weight vector) or the
`NeatGenome` (a graph of nodes and connections), chosen by `config.evolvableTopology`.
The rest of the code never branches on which it holds, because both expose the
same surface: the body-gene getters (`sizeGene`, `dietGene`, …), `buildBrain()`,
`mutateForConfig()`, a static `crossover()`, `distance()`, `clone()`, and
`toData()`/`fromData()` for save/load. There are exactly two dispatch points —
the world picks which `random()` to call when making a creature, and reproduction
routes crossover through `this.genome.constructor.crossover`. Everything else,
including the entire phylogeny, is genome-agnostic.

Like the plasticity genes, the NEAT path is instantiated only when its toggle is
on, so it consumes no RNG in the default path and every fixed-topology world stays
bit-for-bit identical (fingerprint-verified).

## Rendering is read-only

`render.js` never touches simulation state — it only reads it — so you can pause
the sim and still pan, inspect, and toggle overlays. The look leans on two cheap
tricks: a translucent dark veil each frame instead of a hard clear (so movement
leaves comet trails), and additive (`lighter`) compositing for the glow (so
dense clusters bloom). Creature lightness tracks energy, so a starving pond
visibly dims.

The view itself lives in `camera.js` — a centre, a zoom, and an optional
creature to follow. Because the world is a torus the camera never meets an edge:
everything is drawn at whichever wrapped image of itself is nearest the centre,
so the seam is invisible however far the view roams. At zoom 1 the camera is
deliberately the exact identity (zooming back out snaps the centre home), which
keeps the default view — the one every screenshot and permalink assumes — pixel
for pixel what it has always been. It holds no simulation state and draws no
random numbers, so where you happen to be looking can never change what happens.
The one thing that continuous input adds is a **detent**: the wheel and the
keyboard step by fixed powers of 1.25 and so always land back on exactly 1, but a
pinch can stop anywhere, so `ZOOM_SNAP` pulls anything within 2% of the bottom
home rather than leaving the identity view a rounding error out of reach.

`gestures.js` is how a hand reaches any of that. It is a small state machine over
pointer coordinates — one finger that barely moves is a tap, one that travels is
a drag, two are a pinch about their midpoint — with no DOM, no clock of its own
and no random numbers, so the whole of it is testable. That is the point:
`main.js` is the only module the suite cannot run, so anything decidable lives
here and `main.js` keeps just the adapter. A mouse and a finger take the same
path, double-tap included, which is why there is no `dblclick` listener.

`minimap.js` is the other half of that lens. A camera over an edgeless world can
show you a fifteenth of the pond with nothing to say *which* fifteenth, so once
the view leaves home a small whole-pond view appears in the corner with the
viewport drawn on it. The minimap is the one place the torus seam is a real
edge rather than something to hide: coordinates are wrapped into the world's
bounds before they are scaled, and a viewport that straddles a seam is returned
by `viewportRects()` as the two (or four) pieces a flat rectangle can actually
draw. Its invariant is the camera's, restated: at zoom 1 the viewport is the
entire world in one piece, which is exactly why the minimap hides itself there.

The minimap also draws the terrain, when a world has any. `terrainBandRects()`
samples the roughness field onto a grid of 2px cells, quantises it into the same
eight bands `render.js` draws contours at, and merges equal cells into as few
rectangles as will cover the map exactly — sideways along each row, then
downward wherever a row repeats the one above it. Quantising is what makes a
fifth-scale landscape read as terrain rather than as one more glow; merging is
what makes sampling it that finely cheap enough to redraw every frame. The
rectangles are cached against the `TerrainField` object itself, so a world that
drops its landscape cannot be shown the one it used to have.

It draws the nutrient field too, when a world keeps one. `detritusCellRects()`
returns one rectangle per enriched cell, sized so the cells tile the map exactly;
there is nothing to merge and nothing to cache, because unlike the landscape this
map changes every tick. The pond draws the same field a different way —
`render.js` writes one pixel per cell into a small offscreen canvas and lets the
upscale blur it into a stain, which costs a few hundred pixels a frame instead of
a few hundred gradients. That image carries a one-cell border copied from the
opposite edge of the field, and each tile is clipped to its own world, so the
seam neither fades out nor doubles up. Both views take their colour from
`palette.detritusTint()`, so they cannot drift apart and a test can measure what
is actually drawn.

Whole-world backdrops — the baked landscape and the nutrient field — need the
world *tiled* rather than drawn at its nearest wrapped image, because at any zoom
the viewport can straddle up to four copies of it. `Camera.worldTiles()` returns
the corners to draw at, dropping the neighbours the viewport only touches
edge-on, so the whole-pond view is exactly one blit.

## Persistence

`World.toJSON()` / `loadJSON()` serialise the full state — every genome, every
position, the food, the tick — and `main.js` stashes it in `localStorage`. A
loaded world resumes exactly, because the genome carries everything needed to
rebuild a creature's brain.

## Testing strategy

- **Unit tests** cover the pure modules where a bug would be silent and
  corrosive: the RNG's determinism and distributions, the torus math, the neural
  net's forward pass (including a hand-computed reference value), and genome
  mutation/crossover invariants (length preserved, parent never mutated in
  place, body genes stay in range).
- **Integration tests** run whole worlds for thousands of ticks and assert the
  properties that make the toy *work*: determinism across two identical worlds,
  population staying within sane bounds, evolution advancing the generation
  counter, no NaNs leaking into state, and save/load round-tripping.

All of it runs under Node's built-in test runner with no framework:
`node --test`.
