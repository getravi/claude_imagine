# 🦠 Vivarium

**A digital pond where little brains evolve to survive.**

Vivarium is a browser-based [artificial life](https://en.wikipedia.org/wiki/Artificial_life)
simulation. Dozens of tiny creatures drift through a dark pond. Each one has a
small neural network for a brain, sensing the food and neighbours around it and
deciding how to move. Nothing tells them *how* to find food — but the ones whose
brains happen to steer them toward it live long enough to reproduce, passing on
their (slightly mutated) brains. Watch for a minute and you'll see a sparse,
struggling pond bloom into a teeming ecosystem as **evolution discovers foraging
in front of your eyes.**

No install, no build step, no dependencies. Just open it in a browser.

> ### ▶ **[Launch the live demo](https://getravi.github.io/claude_imagine/)**

![The Vivarium interface: a teeming pond of glowing creatures with a live stats panel](docs/screenshots/vivarium.png)

---

## What am I looking at?

| Before evolution (tick ~280) | After evolution (tick ~5000) |
| :---: | :---: |
| ![Sparse founders](docs/screenshots/early.png) | ![Teeming pond](docs/screenshots/pond.png) |
| ~45 random founders drift aimlessly among abundant food. Most will starve. | The descendants of the few competent foragers now fill the pond. |

- **Each glowing chevron is a creature.** Its colour is an inherited trait, so
  a lineage shares a colour family — you can watch one lineage's colour take
  over the pond as it out-competes the others.
- **The green motes are food.** Eating restores energy; moving and merely
  existing cost energy. Run out and you die.
- **Brighter creatures have more energy.** Dim ones are starving.
- **No creature has a goal, a score, or a reward.** They just run inherited
  neural networks. Foraging, wandering, and loitering in food-rich patches are
  *emergent* — selection, not code.

## Controls

| Control | What it does |
| --- | --- |
| **Pause / Play** | Freeze or resume time (you can still click to inspect while paused). |
| **Reset** | Rebuild the world from the current seed. |
| **Feed** | Scatter a burst of extra food. |
| **Seed life** | Drop in fresh random creatures (handy after a crash). |
| **Seed** | The number that determines the entire history of a world. Same seed → same world, every time. Share a seed to share a world. 🎲 picks a random one. |
| **Speed** | Simulation steps per frame (1×–20×). Crank it up to fast-forward evolution. |
| **Live parameters** | Tune food rate, metabolism, and mutation rate *while it runs* and watch the ecosystem respond. |
| **Save / Load** | Snapshot the whole world to your browser's local storage and restore it later. |
| **Click a creature** | Open the inspector: its generation, age, energy, offspring count, body traits, and a colour "fingerprint" of its brain weights. |

## Things to try

- **Start a fresh world and just wait.** For the first ~30 seconds the pond
  looks like it's dying. Then it blooms. That moment — evolution "getting it" —
  is the whole point.
- **Starve them.** Drag *Food rate* to zero. Watch the population crash, then
  slowly recover as lean, efficient lineages survive the famine.
- **Crank mutation to the max.** Evolution gets frantic and unstable — lineages
  can't hold onto good behaviour because their children are too different.
- **Set mutation to zero.** Evolution freezes. Whatever's alive is all you get;
  no new strategies can appear.
- **Watch the colours.** Genetic diversity (top-right stat) starts high — every
  founder is a different colour — and collapses as one lineage wins, then rises
  again as mutations diversify the winners.

## Run it locally

Vivarium is plain HTML, CSS, and JavaScript ES modules. It needs a static file
server (browsers won't load ES modules over `file://`), but **no dependencies**:

```bash
git clone https://github.com/getravi/claude_imagine.git
cd claude_imagine
python3 -m http.server 8000      # or: npm run serve
# then open http://localhost:8000
```

## Run the tests

The pure simulation logic (RNG, vector/torus math, neural net, genome, and a
full-world integration suite) is covered by tests using Node's built-in runner —
no test framework to install:

```bash
node --test        # or: npm test
```

## How it works (the short version)

Every creature carries a **genome**: a flat vector of numbers that are the
weights of its neural-network **brain**, plus a few genes for body traits. Each
tick, a creature:

1. **senses** — builds an input vector (direction and closeness of the nearest
   food and nearest neighbour, its own energy, an internal oscillator, …);
2. **thinks** — runs those inputs through its fixed-topology neural net;
3. **acts** — turns and thrusts according to the net's outputs, then pays an
   energy cost for moving and existing.

Eat enough food to cross an energy threshold and you **split**: half your energy
goes to a child whose genome is a **mutated copy** of yours. Run out of energy,
or grow too old, and you **die**. That's the entire rulebook. There is no
fitness function anywhere in the code — *fitness is just survival*. Over
generations, selection quietly tunes those weight vectors into competent
foraging behaviour.

For the full story, see:

- **[docs/SCIENCE.md](docs/SCIENCE.md)** — the artificial-life and neuroevolution
  ideas behind Vivarium, and further reading.
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — how the code is organised,
  the data structures, and the math.
- **[docs/DEVLOG.md](docs/DEVLOG.md)** — the honest build journal: why things are
  the way they are, what got tuned and why, and the dead-ends along the way.

## Project layout

```
index.html          the page
style.css           the look
src/
  rng.js            seedable PRNG (reproducible worlds)
  vec.js            2D + toroidal ("wrap-around") geometry
  nn.js             the neural network
  genome.js         heritable material: weights, mutation, crossover
  creature.js       a single agent: sense → think → act → metabolism
  food.js           the world's energy source
  grid.js           spatial hash grid for fast neighbour queries
  stats.js          rolling population/lineage measurements
  world.js          the simulation: steps everything forward
  render.js         canvas drawing
  config.js         every tunable "physics constant" in one place
  main.js           boot, animation loop, UI wiring
test/               unit + integration tests (node --test)
docs/               science, architecture, devlog, screenshots
```

## About this project

Vivarium was designed and built by **Claude** (an AI model made by Anthropic),
given a blank public repository and a simple brief: *build something you find
interesting, and document it for the world.* The [devlog](docs/DEVLOG.md) is
written in Claude's own voice as a record of how the project came together — a
small window into an AI building something it wanted to build.

## License

[MIT](LICENSE) — do whatever you like with it. If you build something fun on top
of Vivarium, I'd love for you to open an issue and show it off.
