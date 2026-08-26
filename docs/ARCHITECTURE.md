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
   suite under `node --test`. `rendershot.js` is the exception that proves it:
   it fabricates just enough canvas to run the renderer under Node, which is how
   `render.js` came to be tested at all.
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
| `creature.js` | One agent: sense → think → act → metabolism → reproduce. `thrustCommand` is `act()`'s own clamp under a name (v1.113), so an observer pricing a motor and the body obeying it cannot hold two opinions about what a thrust is. | — |
| `food.js` | Passive energy pellets (and, when scavenging is on, corpses). | — |
| `grid.js` | Spatial hash grid for O(1)-ish neighbour queries on a torus. | — |
| `environment.js` | Biomes (a fertility field) and seasons (a food-rate cycle). | — |
| `terrain.js` | Optional static roughness landscape: rough ground costs more to cross and grows less. | — |
| `detritus.js` | Optional decaying nutrient map: deaths enrich the ground, and part of the crop grows out of it. | — |
| `barriers.js` | Optional rock: wrapped slabs with gates in them, cutting the torus into rooms. Movement only — sight, sound, teeth and the pathogen all still cross it. Hash-derived like the terrain, so building it draws nothing; `blocked()` is the whole rule and both views and the audit ask it rather than rebuilding the geometry. | — |
| `energy.js` | The pond's books: every unit created and destroyed, holding `created − destroyed === standing` at every tick. `snapshot()` writes them into a history point and `energySeries()` reads a run of those back as a *rate*, which is the only way the panel's run-to-date totals can be made to move. Pure bookkeeping — no randomness, and nothing in the simulation reads it. | — |
| `contagion.js` | The reach of the pathogen: the risk arithmetic both views draw with, and the share of the water inside somebody's catching distance (observation only). | — |
| `fingerprint.js` | The bit-exact identity of a world, so the promise that a seed reproduces a world can be checked *across releases* and not only within one process. Two hashes: `trajectoryFingerprint` (where everything is — the cross-version constant, blind to representation on purpose) and `stateFingerprint` (that plus genomes, brains and *every* other field a creature carries bar two named ones, plus — since v1.91 — the pond's *shape*: the biome field, the roughness grid, every wall and the geometry of all three spatial indices, which for twenty-one releases were the half of a world a hash written by watching one run never covered. `WORLD_HASHED`/`WORLD_UNHASHED` are the world-level equivalent of the creature lists, and a test walks a live world against them. For comparisons inside one process). `mathFingerprint` identifies the engine's implementation-defined `Math`, which is what lets a mismatch tell a regression from a different libm. `drawStream` is the fourth channel and the one no snapshot can be: the random sequence itself, which is where a feature that is off and draws a number anyway shows up eight ticks before the pond does. `booksFingerprint` is the fifth: `world.stats`' fifty-six own properties and `world.energy`'s eight, every counter, ledger field and history buffer this pond keeps — an *output*, so a miscount moves it and no picture of the water. Read-only, draws nothing. | — |
| `palette.js` | Colour decisions as pure functions, plus the dichromat simulation and ΔE that judge them — and, since v1.109, the WCAG contrast ratio, which is the *other* colour question. | — |
| `legibility.js` | Can the text be read? Every colour audit here since v1.24 asked whether two things can be told apart (ΔE 25, three dichromacies) and the subject was always a mark. Reading small type is carried by luminance alone, so it has its own formula and its own bar — and the two disagree: `--ink-faint` measured 3.60:1 against the app's panel, under WCAG AA's 4.5, while scoring **ΔE 41.1 against a bar of 25**. It went a hundred and eight releases unasked because the inks are custom properties in `style.css` and `splash.css`, which v1.106 noted were in no sweep's domain at all. Holds the parser for a stylesheet's `color:` declarations, the inventory of 39 (ink, ground, size) triples a headless walk of both shipped pages composited out, the `UNMET`/`GRADIENT_INKS` lists that say what the walk could not see, and `liftToBar` — the smallest uniform sRGB brightening that clears a bar, which is where both pages' new `--ink-faint` came from. Pure arithmetic: no DOM, no world, no RNG. | — |
| `targetsize.js` | Can a thumb hit it? The third audit of these two documents, after v1.51's keyboard walk (can it be *reached*?) and v1.109's photometer (can it be *read*?) — both audits of a sense, neither about geometry. The bar is WCAG 2.2 SC 2.5.8, Level AA: 24 CSS px on the **shorter** side, with a spacing exemption (a 24 px circle on each centre, no overlap) and an inline one. The subject is not always the control: every world toggle is a 13 × 13 checkbox inside a `<label class="check">` that activates it, so the target is the label — and crediting the control alone would have reported thirty-one failures that are not there (v1.109's composite lesson, arriving on activation instead of on paint). Once credited, the toggles measured **316 × 19** on a phone and **290 × 19** on a desktop — enormous along the axis a thumb does not miss in, five short along the axis it does, stacked flush so the spacing exemption could not rescue them: 21 of 31 failing at 390 × 844 and 13 of 31 at 1280 × 900, with the survivors passing only because their caption wrapped to a second line. Holds the arithmetic (`verdictFor` names *why* a target passes, because `size` is a property of the control and `spacing`/`inline` are properties of its surroundings), the inventory of 36 groups covering all 90 targets, `WALKED`, `UNMET`, and `declaredMinHeight`, which is what keeps `.check { min-height: 24px }` a live claim. Pure arithmetic: no DOM, no world, no RNG. | — |
| `stats.js` | Rolling population/lineage/diversity measurements, the mortality ledger (what each death was caused by), and the energy books — all carried into both history buffers as cumulative counters, so differencing any two samples is exact however far the archive has thinned. The two quantities that are *not* cumulative, the standing stock and the residual of the energy identity, get min/max envelopes instead. | — |
| `archive.js` | A bounded record of the *whole* run: halves its own resolution as it fills, keeping exact min/max envelopes so no peak is ever silently smoothed away. | — |
| `phylogeny.js` | Groups creatures into species by genetic similarity (observation only). | — |
| `chronicle.js` | Records notable events into a natural-history timeline (observation only). | — |
| `describe.js` | The pond in words: the canvas's `aria-label`, the badges' labels, and what a live region should be told (observation only). `FIELD_SPOKEN`/`FIELD_UNSPOKEN` are the selection sentence's coverage table — since v1.103 the listener declares what it says about a creature, the way the reader has since v1.77, and `registers.js` derives the same verdict rather than trusting the list. | — |
| `world.js` | Owns all state; steps the whole simulation one tick. | — |
| `camera.js` | The viewer's lens: zoom, pan, follow, world↔screen on a torus. | — |
| `chart.js` | The population/food figure: both axes (a round ceiling and its labels; round ticks along time, placed by walking the history rather than dividing its span), the grid, the lines and the whole-run envelopes. Pure — it takes a context and draws, and the labels come back as data for the DOM. Also owns the mark-building the Tree of Life's x-axis uses. | canvas |
| `sizeplot.js` | The pond's bodies on an axis: how many creatures fall in each 0.15 px band of body radius, cut by the diet gene, with the refuge threshold drawn as a rule and the pond's mean drawn as a dashed one in the same ink (v1.112: two rules, one colour, told apart by continuity — the power strip's answer, so no fourth colour). The first figure here whose x is a property of a *creature* rather than a time, a place or a line of descent — the gap v1.101 named. Its axis is `bodyRadiusMin`..`bodyRadiusMax`, declared rather than fitted, so the picture means the same thing from one frame to the next and the bound is exact (`radius` is a lerp of the two over a clamped gene). Answers the question the three existing size readouts — a share, a maximum and a mean — cannot: whether the pond has a middle at all. Spends no new colour; pure observer, no RNG. | canvas |
| `minimap.js` | The whole pond in miniature — ground, life and the viewport (read-only). | canvas |
| `gestures.js` | Pointer arithmetic: tap vs drag vs pinch, for a mouse and a hand alike. | — |
| `scalebar.js` | The pond's ruler: a round 1–2–5 distance that fits the viewport, its drawn length, and its label. On screen only while the view is magnified — at zoom 1 the picture is the world at 1:1 and the scale is the constant in `config.js`. `rulerWidth` converts into the width the canvas is actually *displayed* at, which is what keeps it true on a viewport narrower than the pond, where every stated distance on the page is not. Arithmetic: it reads no world and draws nothing. | — |
| `herofit.js` | How big the front door's pond should be. `index.html`'s hero canvas is `object-fit: cover` over a simulation that was two constants in `splash.js`, and a hero box is as wide as the window and `100svh` tall, so the two aspect ratios agreed on no device: 24.8%–95.0% of the pond visible over nine measured viewports, a phone seeing a quarter of it, no window seeing all of it. `heroFit` gives the box its own aspect ratio back — so `cover` crops under a pixel — under two clamps that are derived rather than picked: a **ceiling on the area** (`HERO_AREA`, the 1280 × 760 the hero's five density constants are already a function of, so a desktop never costs more than it costs today) and a **floor on the shorter side** (one sense diameter, `2 × visionRadius`, below which a torus wraps a vision disc onto itself). Both scale uniformly, so the aspect survives them; under the ceiling and over the floor the magnification is exactly 1. `coverCrop` is the CSS rule written down. Arithmetic: no imports, no DOM, no RNG, and nothing in the app reaches it. | — |
| `reveal.js` | The front door's scroll reveal, and the three parties that keep it honest (v1.88): the page arms `[data-reveal] { opacity: 0 }` with a class an inline script adds, a 4-second watchdog disarms it if `splash.js` never arrives, and the module cancels the watchdog only after the observer is wired. A *default* of hidden is a bet that later code will run, and nothing in CSS can check the bet. | yes |
| `trail.js` | Where the selected creature has been: a ring buffer of one creature's last 300 ticks, keyed to its id so a new subject, a death or a reset ends the path rather than splicing two lives into one line. Owns the torus — `offsets()` accumulates each tick's *shortest* toroidal step backwards from the newest point, so the caller gets a continuous line anchored under the body and the seam disappears (the pond canvas's convention, not the minimap's), and `stats()` measures net displacement along that unwrapped line, because at `maxSpeed` a straight swimmer is nearly a lap and the crow-flies reading would call it wandering. Pure observer: written from the animation loop, read by the renderer and by `describe.js`, invisible to the pond on all five fingerprint channels. | — |
| `render.js` | Draws a world onto a 2D canvas (read-only). | canvas |
| `rendershot.js` | A canvas that records instead of painting, so the renderer can be tested headlessly: the stream of drawing commands a frame produces, and `renderFingerprint` over it. The fourth channel — what the pond *looks like* — which is how `levers.js` tells a drawing constant from a dead one, and how "rendering is read-only" finally became a test rather than a comment. Comparisons within one run only; a golden render hash would move on every deliberate visual change. | — |
| `levers.js` | The constant sweep: move every number in `config.js`, in a world where it can bite, and check something moves. Reads the key list out of the config, so a constant added later is swept the day it lands. | — |
| `dimensions.js` | The *pair* screen, and `levers.js`'s blind spot: a sweep that moves one number at a time cannot see what a conjunction decides, and `bodyRadiusMax / preySizeRatio` = 7.273 px is the refuge. Every constant carries a unit, and a pair is a candidate when its ratio or product lands in the dimension of something the pond can be on both sides of. Three filters — dimensional, both-read-by-one-module, inside the range the quantity declares — take 10,458 combinations to 218, and the range the pond *occupies* (`sampleQuantities` + `quantileBand`, read-only) to 149. Arithmetic: it never steps a world. | — |
| `foodweb.js` | Who can eat whom, counted for everybody at once — the other end of `refuge.js`. For each creature it counts the *eligible set* the size-and-diet rule (`Creature._edible`) admits it, by sorting the radii once and binary-searching **the rule itself** (O(n log n) rather than the O(n²) the question is written in; the predicate is `_edible`'s comparison character for character, so a body on the boundary is decided by the same float test the bite is). `webProfile` reports the shape: how many carry the diet gene, how many of those have anything to eat, and the widest and median reaches — a pair 87× apart on seed 128 (an apex animal) and 1.0× apart on six other seeds (a graded web). Pure observer, no RNG. Kinship excluded, like `inRefuge`. | — |
| `dietcost.js` | What the diet gene costs, against the meal it buys — the price on the reach `refuge.js` and `foodweb.js` measure. Both of `config.js`'s charges for carnivory are unconditional: `carnivoreMetabolicCost` drains every tick in proportion to the gene, and `plantPenaltyFromDiet` shrinks every pellet the same way, neither asking whether there is anything in the water to eat or whether the gene clears `carnivoreThreshold`. So the licence to hunt is a step and the bill for it is a ramp. `dietBill` reports the toll (energy/tick), the part of it paid by bodies with an empty eligible set, the part paid below the threshold, and the mean share of a pellet given up — the two clocks kept apart rather than summed. Unlike its two neighbours it folds `config.predation` into the arithmetic, which makes it the one readout with something to say about a world where nothing may bite: 40%–100% idle with hunting on, median near 90%, and 100% on every seed with it off. Pure observer, no RNG. | — |
| `workload.js` | The work census: how many index queries a tick makes and how many candidates they are offered, counted *before* the tick from an index built the way step 1 builds it. Counts by running `forEachNear`/`forEachWithin` with an incrementing callback, so it cannot drift from the geometry it measures. Work rather than time, because a stopwatch measures the machine and no test can hold its answer. Its `brute` arm — the same questions asked of everything — is what turns the count into a factor: the index narrows by ~4x at every population, so sensing is quadratic. Read-only, draws nothing, and its two exclusions (`bodyCollision`, `deathIsFinal`) are stated and tested. | — |
| `statesweep.js` | The state sweep: `levers.js`'s question asked of a live *world* rather than of `config.js`. Enumerates every perturbable field a `World` carries (from the object, not the constructors — a list written from source misses the six `Stats` grows at the first sample), moves each one the way the constant sweep moves a number, and asks two things: does any fingerprint channel notice, and does the pond's future part. 166 sites, 23 the pond depends on, and **17 of those seen by nothing** before v1.91. `STATE_OWNERS` names the channel watching each of the world's twenty fields and `SITE_SILENT` the five exclusions, both checked against a live world both ways. Two worlds per site, so the coverage half (which needs no ticks) is swept on every run and the divergence half is pinned. | — |
| `onset.js` | **When** a rule first reaches the pond, and whether the flag flip that asks is a controlled question. `levers.js` and `test/fingerprint.test.js` have both computed the first tick two arms disagree since v1.36/v1.38 and both read it as a boolean. Here it is the subject: every boolean in `config.js` — including the four that ship *on*, which neither older sweep could see, since both read their inventory as "every key whose value is false" — flipped away from its default and followed on two hashes. Four verdicts. `resampled` is the one that mattered: switching a sense on draws its gene block, so the arms are two *samples* rather than one world with a rule added, and seven flags are in that position — the founders move as far as they do between unrelated seeds. `blockOnset` is the honest replacement, `statesweep.js`'s device pointed at the genome: build one pond twice, scramble the genes the flag added on one copy, watch. Pure observer, and deliberately so twice over — reading a pond's RNG to check stream alignment is itself a draw, so that probe runs on throwaway worlds. | — |
| `reach.js` | What the 3x3 block *guarantees*, and which rules ask for more. Four comments in this repo said the guarantee was one cell; `cellSize` does not divide the world, so the promise from anywhere is the narrowest neighbouring cell — 18 px in the default pond, against a cell of 126. Reads the block off `grid.nearBounds` rather than re-deriving it. Audits every contact and sense radius: eating (11.2), scavenging (17.0) and biting (**17.273, a margin of +0.727** — v1.83's correction: `canEat` forbids both bodies being the largest, so 18.0 was a maximum over a pair the rule does not admit) clear it, and infection (22) does not — the one rule with a neighbour query of its own, and so the one `exactVision` cannot straighten. v1.81 derives the site list from the source (`QUERY_SITES` vs `scanQuerySites`, nine queries, checked both ways) and adds the constraint the audit had missed: a carried rule inherits the scan's *answer*, so sight gates every contact test (`binds: "gate"`) and a bite stops firing below a `nightVisionFactor` of 0.107. Arithmetic: it never steps a world — and as of v1.90 it is no longer only an instrument: `creatureReaches` is the same derivation with the largest body replaced by *this* body, which is what `render.js` draws around the selected creature and what `describe.js` says out loud, so the picture of a rule's reach cannot drift from the audit of it. | — |
| `seasonlag.js` | How far behind one of its clocks the pond is running. The reference is not another measured series — this world's year is `sin(2πt / seasonLength)` and its day is a cosine on `dayLength`, both pure functions of the tick — so a history column is fitted against the one `opts.clock` names (`CLOCKS`, which also carries where each waveform's crest sits, since a lag means *after this clock's own crest* and the two crests are a quarter period apart): `intercept + slope·i + a·sin(ωt) + b·cos(ωt)`, all four terms at once, and the phase of `(a, b)` is the shift. The line has to be *inside* the fit rather than removed first, or the season is charged for the trend and the answer moves by a quarter of a year. Reports a `swing` beside the lag because a correlation is not the separator here: a seasonless pond can track a year it does not have at r = 0.62, and what it cannot do is move. That bar is the year's: the day's arms do not separate on it or on anything else measured (v1.95), so `CLOCKS.day.minSwing` is `null` and `readable()` declines every day reading the way it declines a flow. `correlogram()` is the brute-force curve the closed form is checked against. Arithmetic: it never steps a world, and with the chosen clock not running it returns `null` rather than the phase of noise. | — |
| `senses.js` | What each of a brain's inputs is worth to its motors. `auxSway` has priced one channel at a time since v1.33 — hold every other sense at what this creature perceived, walk one from its floor to its ceiling, report the mean absolute change in turn and thrust — and it had only ever been pointed at the two senses that arrived with an off switch. `INPUT_CHANNELS` is the input vector as data (a name and the range each channel is *written* to occupy, which is what makes the declared-against-occupied check possible at all), `channelSway` is that generalised over it, and `senseSways` ranks every sense a world gives a creature; the `Steers by 🧭` row takes the head of the ranking. Since v1.113 the walk is also reported **before** the average — `channelSwayParts` returns the two commands separately and `motorTilt` says which of them a sense is talking to, which the row prints as `turns`, `drives` or `both`. That split found the older half of the same line: `act()` applies `thrustCommand(out[1])`, so the whole negative half of the thrust output is a body standing still and eighty releases of sways had been differencing a number the pond does not obey. Two channels cannot reach the ceilings they declare, both for arithmetic reasons: terminal speed under full thrust is `thrustAccel·drag/(1−drag)` = 51.98% of `maxSpeed`, so the *speed* clamp in `act()` is dead in every world this code can build — the thrust clamp two lines above it is the opposite, and eats 42.6% of all thrust movement — and a creature splits at `reproduceThreshold` before it can fill. Pure observer: it works on a copy of the input buffer, runs the brain with learning suppressed, and draws no random numbers. | — |
| `inspect.js` | What the inspector says about one creature: the fact grid's rows, their wording, which of them a switched-off mechanic removes, and which of them tick (`main.js` patches those in place and rebuilds the rest only when the *set* changes). Also the coverage table — every one of the thirty-five fields of a creature is either reported here or named as a silence with its reason, checked against a live creature on every run, so a field added later cannot land outside the panel unnoticed. `FIELD_OFF_GRID` is the part of that claim a test can hold: the fields the panel says with a picture, a link or a heading rather than with a row, so everything else on the list has to move the grid's own text when it moves. Pure observer; the Underfoot row's hypothetical runs the brain with learning suppressed. | — |
| `registers.js` | The two things this page says about one creature, compared. A selection is rendered twice — the inspector's rows and the live region's sentence — out of two hand-written lists of clauses with two hand-written sets of gates, and every asymmetry between them until v1.103 was found by somebody looking. This is `statesweep.js` pointed at text: move one field, render both, and see which notices. `FIELD_SPOKEN`/`FIELD_UNSPOKEN` in `describe.js` are the sentence's coverage table, the pair the panel has had since v1.77; the sweep derives both and a test holds derivation and declaration in step. Pure observer — it restores every field it moves, and a swept world hashes the same. | — |
| `inspectorview.js` | The inspector's *markup*: the heading and its swatch, the ancestry pips, the Species link, the weight strip and the evolved-brain diagram. Four string builders that never touched the DOM and lived in `main.js` anyway, so nothing could read them until v1.108 — which is how the weight strip came to draw the first 120 of a brain's 243 numbers (no biases, no motor layer at all) under an accessible name that said "120 weights, 54 excitatory and 66 inhibitory, strongest 2.48" about a default-pond creature whose brain is "243 weights, 125 excitatory and 118 inhibitory, strongest 2.56". Over twelve seeds the true strongest weight is outside the drawn half on **58.6%** of creature-frames, and the excitatory share — accurate to a median 1.5 points, so the control passed — disagrees with the brain about the *sign of the majority* on **21.2%**, because the split sits within a few points of a half. The strip draws every weight it is handed now and the sentence counts what it drew; the diagram's two rails read `NEAT_IO` instead of a copy of it. Since v1.114 the strip also *shows* its four blocks — 192 sensory, 12 hidden biases, 36 motor, 3 motor biases — with a wider gap on each `.block-start` cell at the boundaries `BRAIN_BLOCK_STARTS` names, and the label names them in the same order the picture draws them, so a reader can see where the sensory half of a mind ends. A vector of an off-length draws as one block, unchanged. Pure strings, no DOM, no RNG. | — |
| `mullerplot.js` | The "Tree of Life": `mullerShares()` turns snapshots into stacked shares (pure), `drawMuller()` paints them (read-only). | canvas |
| `speciesnames.js` | What the lineages are called. A number is the right identifier and the wrong name: nothing distinguishes 7 from 9, you cannot tell a friend about species 7 an hour later, and — worst for the figure it labels — it carries no family, so the plot draws descent in inherited hue while the words beside it throw it away. A name here is two words and the first one is the family: a branch keeps its parent's stem (`Amber Ripple` → `Amber Whorl`) and a founder starts a new one, so one glance at the legend says which bands are cousins. Uniqueness is built rather than hoped for — `pickFree` probes forward from where the hash points, because 40 founders drawing from 64 stems collide with probability ~1. Names are a pure function of the tree's ids and parent links, so the same seed gives back the same Amber Ripple tomorrow; a name once given never changes, since a species is appended and never renumbered. No field is added to a species, so no fingerprint can see this module. | — |
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
cues by the renderer — faint biome glows and a season-tinted trail veil. The one
piece of the *water* that is drawn from live state is the contagious zone: a disc
of `infectionRadius` per sick creature, stacked, whose opacity compounds at
exactly the rate the per-tick infection risk does (`contagion.js`).

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

**Optional extra senses.** Two scalars live outside the input vector entirely,
each with one weight per hidden neuron: the **ear** (v1.20 — the loudest call
within earshot, when signalling is on) and the **foot** (v1.33 — the roughness
of the ground underfoot, when the ground sense is on). So the full layout is
`[ weights ][ plasticity ][ ear: 12 ][ foot: 12 ][ body: 4 ]`, with the body
genes always addressed from the *end* so appending a sense moves nothing. Each
block is drawn, mutated and crossed only when its feature is on, which is what
keeps a default world's RNG stream exactly what it was in v1.0; `NeuralNet`
takes the enabled blocks concatenated in that order and adds their contribution
to the hidden layer after the ordinary weight block, so a net with no aux sense
performs bit-for-bit the arithmetic it always has. `migrateGenomeData()` lifts
an older save into the current layout, leaving whatever senses it predates
silent.

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
The shares are computed once (`mullerShares()`) and used twice — by the drawing
and by the canvas's `aria-label` — so the picture and its spoken form cannot
disagree. A window in which nothing was alive contributes no share to any band,
so an extinction pinches the stack shut instead of filling it (v1.42).

That snapshot record covers the **whole run** in bounded memory, the same
promise `archive.js` makes for the population chart: when it fills, every second
snapshot folds into the one before it and the stride doubles, so the plot gets
coarser rather than shorter and always starts where the run started. The merge
is a *sum* of counts and totals rather than `archive.js`'s min/max envelope,
because a species count is extensive within its window — summing gives the
population-weighted mean share, keeps the bands summing to at most the whole,
and cannot erase a lineage that only ever lived inside a merged window.

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
the sim and still pan, inspect, and toggle overlays. That sentence was a comment
and nothing else from v1.0 to v1.40; it is now a test. `rendershot.js` supplies a
2D context that records every drawing command instead of painting it, so a frame
can be drawn under `node --test`, and the assertion is the direct one: hash the
world, draw it, hash it again. The same recording gives the picture a
fingerprint of its own, which is what lets a *drawing* constant prove it is one.

The look leans on two cheap tricks: a translucent dark veil each frame instead
of a hard clear (so movement leaves comet trails), and additive (`lighter`)
compositing for the glow (so dense clusters bloom). Creature lightness tracks energy, so a starving pond
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

That principle has been eating `main.js` one surface at a time — the panels in
v1.97 and v1.98, the observer's own state in v1.99, and the inspector's markup
in v1.108 (`inspectorview.js`). Every one of them found something wrong the day
a test could finally read it, which is the argument for finishing the job: what
is left in `main.js` is the boot, the loop, the event wiring and the chronicle
feed.

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
