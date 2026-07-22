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
| `genome.js` | The heritable weight vector; mutation, crossover, distance. | — |
| `creature.js` | One agent: sense → think → act → metabolism → reproduce. | — |
| `food.js` | Passive energy pellets and their spawning. | — |
| `grid.js` | Spatial hash grid for O(1)-ish neighbour queries on a torus. | — |
| `stats.js` | Rolling population/lineage/diversity measurements. | — |
| `world.js` | Owns all state; steps the whole simulation one tick. | — |
| `render.js` | Draws a world onto a 2D canvas (read-only). | canvas |
| `main.js` | Boot, the requestAnimationFrame loop, all UI wiring. | yes |

## The world and its state

A `World` (in `world.js`) owns everything mutable:

- `rng` — the single seeded generator for the entire simulation.
- `creatures` — a flat array of live `Creature`s.
- `food` — a `FoodField` holding the pellet array.
- `creatureGrid`, `foodGrid` — spatial hash grids, rebuilt each tick.
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
     torus), and subtract the metabolic cost (including the upkeep of carnivory).
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

4. **Food upkeep.** Drop eaten pellets (`compact`) and spawn new ones (`step`).

5. **Safety valves.** If the population hit zero and auto-reseed is on, sprinkle
   a few fresh random creatures so the toy never dies permanently. The
   population cap is enforced during reproduction so it can never explode.

6. **Advance the clock** and sample stats.

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

## Genome → creature

When a `Creature` is born it decodes its genome once:

- The brain weights build its `NeuralNet` (via a **copy**, so the running net
  never mutates the stored genome — there's a test for exactly this).
- Four body genes map to: **size** (radius, which affects metabolic cost and
  who it can eat / be eaten by), **metabolism** (a multiplier on base energy
  drain), **hue** (its colour, which drifts as a lineage mutates and gives you
  the visible "family tree"), and **diet** (0 = herbivore … 1 = carnivore,
  which governs grazing nutrition, hunting, and the upkeep cost of carnivory).

## Rendering is read-only

`render.js` never touches simulation state — it only reads it — so you can pause
the sim and still pan, inspect, and toggle overlays. The look leans on two cheap
tricks: a translucent dark veil each frame instead of a hard clear (so movement
leaves comet trails), and additive (`lighter`) compositing for the glow (so
dense clusters bloom). Creature lightness tracks energy, so a starving pond
visibly dims.

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
