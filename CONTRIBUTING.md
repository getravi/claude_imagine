# Contributing to Vivarium

Thanks for taking an interest! Vivarium is a small, self-contained project and
contributions of all sizes are welcome — a bug fix, a new creature sense, a
whole new evolutionary mechanic, or just an interesting seed you found.

## Ground rules

- **Keep it dependency-free.** The core promise is that Vivarium runs by opening
  a page — no `npm install`, no build step, no bundler. Please don't add runtime
  dependencies. Native browser APIs and plain ES modules only.
- **Keep the simulation separable from rendering.** Everything in `src/` except
  `render.js` and `main.js` must stay free of DOM/canvas references, so it keeps
  running headless under the test suite. If your feature touches the sim, it
  should be testable with `node --test`.
- **Preserve determinism.** All randomness must flow through the world's seeded
  `RNG` (`src/rng.js`). Never call `Math.random()` in simulation code — it breaks
  reproducibility and the tests that depend on it.

## Getting set up

```bash
git clone https://github.com/getravi/claude_imagine.git
cd claude_imagine
python3 -m http.server 8000   # serve locally; then open http://localhost:8000
node --test                   # run the tests
```

That's the entire toolchain. There isn't anything else to install.

## Before you open a pull request

1. **Run the tests** (`node --test`) and make sure they pass.
2. **If you changed simulation behaviour, add or update a test.** The existing
   tests in `test/` are good models — pure-logic unit tests for math, and
   whole-world integration tests for dynamics.
3. **If you touched parameters or dynamics, sanity-check across a few seeds.**
   It's easy to tune something that's great on seed 1 and extinct on seed 2. A
   short headless sweep (see the tuning story in
   [docs/DEVLOG.md](docs/DEVLOG.md)) goes a long way.
4. **Match the surrounding style.** The code is commented to explain *why*, not
   *what*; please keep that spirit.

## Ideas looking for an owner

The [roadmap in the devlog](docs/DEVLOG.md#what-id-build-next-roadmap) lists the
bigger directions I deliberately left open — sexual reproduction, predation,
NEAT-style evolving topology, within-lifetime learning, a genealogy view,
environmental structure, and shareable permalinks. Any of them would be a great
contribution. If you want to take one on, opening an issue first to sketch the
approach is a kind thing to do for reviewers, but not required.

## Reporting bugs and sharing worlds

Open an issue. For a bug, the single most useful thing you can include is the
**seed** and any non-default parameters, since the world is deterministic and I
can reproduce it exactly. Found a beautiful or bizarre world? Share its seed —
I'd love to see it.

## Code of conduct

Be kind and assume good faith. This is a small friendly project about digital
pond scum evolving to find food; let's keep it a pleasant place.
