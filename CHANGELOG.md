# Changelog

All notable changes to Vivarium are documented here. The format is loosely based
on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [1.62.0] — 2026-08-06

v1.61 measured the "other" band — the churn of lineages too small to earn a name
along the bottom of the Tree of Life — found it was drawn as *furniture*, proved
no colour could fix it, and shipped the measurement instead of the fix. This is
the fix. It is geometry, because that is what was left, and the release's second
half is the discovery that v1.61's own number had been taken against the wrong
surface by a hair's breadth of luck.

### Added

- **The churn has a stipple, and it is the one hatch no lineage can be dealt.**
  `OTHER_TEXTURE` in `mullerplot.js` is dotted horizontal rules, `HATCH_PITCH`
  apart and 1-on-3-off, deliberately *not* a member of `BAND_TEXTURES` — so the
  greedy colouring that hands hatches to species can never produce it, and it
  names exactly one thing wherever it appears. Two of its three degrees of
  freedom had to move at once: every lineage hatch is solid, so this one is
  dotted, and every lineage hatch is near-black, which is invisible here (ΔE
  **6.4** against this band, 2.9 against the canvas) — so this one is drawn in
  the band's *own* colour undiluted. Nothing new was picked.
  - A dot reads at **47.8–53.1** across the four vision models, against a bar
    of 25.
  - The band as a whole stays the quietest thing in the figure, which is the
    constraint that actually chose the geometry: a stipple is as loud as its
    coverage, and 1/28 puts the band's area-weighted mean at **ΔE 14.3** from
    the canvas — above the 10 that makes a thing furniture, and well under the
    **35.6** of the faintest lineage band there is.
  - Under a highlight it recedes to `BAND_DIM_SCALE` (`0.35 / 0.9`, the factor
    the lineage fills already dim by, now derived instead of typed twice) and
    lands at 20.0, deliberately under the bar a mark clears. A cue that survives
    the spotlight is undoing the spotlight.
- **The legend keys it.** A `too small to name` chip, wearing the same stipple.
  The band went unkeyed for sixty releases and that was defensible while it was
  the one *plain* band; the moment it has a texture, the chip missing from the
  key reads as an omission rather than as an absence of meaning. A `span` and
  not a `button`: there is no species behind it to spotlight, and v1.51's rule
  cuts both ways.
- **`mullerBackground()`** — `#muller`'s own `#04070b`, with `style.css` pinned
  to it the way the minimap's water has been since v1.61.

### Fixed

- **The audit had been holding this band up against the wrong surface.** The
  Tree of Life's canvas paints itself a shade darker than the panel it sits in,
  and `lineageBandRgb` — with every colour test in this project — models the
  panel. v1.61 noticed and moved on, correctly: at 0.9 opacity the difference is
  worth up to ΔE 4.4 and nothing turns on it. The "other" band is drawn at
  **0.16**, where it is the entire measurement: the same band reads **9.0**
  against its own canvas and **4.8** against the panel — half a complaint, on
  the region that is 97% of the picture at its peak.
- **The band's colour, and the fill it is 16% of, are no longer the same value
  in the legend.** A lineage's chip may restate its band opaquely and land
  within a point of it, because a lineage band is 0.9 opaque. Doing that here
  would key the quietest region of the plot with a grey six times louder than
  the band, so the chip is the band **already composited**.

### Changed

- The `other` band's fill moved from a literal in `mullerplot.js` into
  `palette.js`. **Its value is untouched** — it is what the plot has drawn since
  v1.2, and `test/palette.test.js` now pins the failure as well as the fix: if
  the fill ever stops reading as a gridline, the test that says it was one
  fails.

### What this leaves

- `lineageBandRgb` still models the panel. Moving it to the canvas changes
  **0.58%** of the 64,620 hue pairs' collision costs, which is what
  `bandTextures` deals hatches by — so it would redraw the key on some existing
  runs. Measured, stated, not taken.
- The audit's open list of never-measured marks is **unchanged at four** — the
  inspector swatch, the minimap's viewport rectangle, the predator outline and
  the vision overlay's three strengths. The "other" band was the fifth and the
  only one v1.61 had already measured; the four that are left are the ones where
  the measurement itself has still not been made.

## [1.61.0] — 2026-08-06

`palette.js` exists so that no colour in this project lives somewhere a test
cannot reach it. Twelve releases of colour work went by without anyone asking
the follow-up question — *did they all go there?* They had not. Five modules
import the palette and between them name twenty colours of their own, and the
audit's own test file had quietly grown four hand-copies of colours the modules
draw. This release is the grep, as a test, plus the three fixes it turned up.

### Fixed

- **The chart's whole-run envelope bands were never in the audit, and both
  failed it.** `chart.js` held `rgba(90, 200, 140, 0.16)` and
  `rgba(120, 190, 255, 0.22)` — the two series' own RGB, retyped in a second
  module at two alphas picked by eye. Against the panel they scored ΔE **12.9**
  and **19.4**, under the 25 a mark must clear and over the 10 that makes a
  thing furniture; v1.39 had already settled the rule for a band in this column
  and this figure predated it. Against **each other** they scored **9.3** under
  tritanopia, which is the failure worth naming: green against blue is a hue
  distinction, tritanopia is the model that loses it, and the two *lines* clear
  the bar only because their alphas differ by a factor of two. Two bands drawn
  at 0.16 and 0.22 threw that away, so a reader attributing an envelope by
  colour attributed it to the wrong series. A band is now its own line at
  `CHART_BAND_SCALE` (0.70) of that line's opacity — derived, not retyped, so it
  cannot drift from the series it belongs to — and clears the panel at 27.5 and
  53.2 and the other band at 36.6.
- **The corpse audit was measuring against a pellet the minimap stopped drawing
  in v1.57.** `test/palette.test.js` rebuilt the little map's pellet as
  `rgba(80, 205, 140, 0.5)`, which is the flat wash v1.57 *deleted* in favour of
  the pond's own additive `foodMote()`. Three releases of a background that no
  longer existed.
- **The audit was measuring against a prey dot the minimap has never drawn.**
  The dot is `hsla(hue, 65%, 70%, 0.85)`; the audit compared marks against the
  same hue fully opaque. Fifteen percent of a near-black water is worth up to
  **ΔE 19.8**, and in the wrong direction — every mark that has to stand out
  from a prey creature was scored against a brighter, easier dot. Corrected, the
  corpse badge's worst case against a prey dot moves from 56.0 to 48.1, still
  clear of 25.
- **`rgb(7, 12, 19)` existed in three places** — `minimap.js`, `style.css` and a
  `MINIMAP_WATER` constant in the test file. It is `minimapWater()` now, and the
  stylesheet is pinned against it.

### Added

- **`test/colourliterals.test.js` — the sweep, as a standing check.** It reads
  the shipped sources, finds every colour named outside `palette.js`, and fails
  on any that has no entry with a reason beside it. Two further assertions carry
  the weight: an entry naming a colour the module no longer draws fails too
  (which is exactly the bug it found in the corpse audit), and a reason has to
  be a sentence rather than a label. Fixing instances fixes instances; a list
  checked on every run is what keeps the *next* colour inside the instrument.
- **`minimapWater()`, `minimapBiomeWash()`, `minimapPreyDot()`,
  `chartBands()`, `rgbaCss()`** in `palette.js`, with the measurements above in
  the doc comments.

### Measured, and deliberately not changed

- **The Muller plot's "other" band is drawn at gridline contrast and cannot be
  fixed by picking a value.** `rgba(120, 140, 160, 0.16)` scores ΔE **9.0**
  against the background it is actually drawn on — inside the [5, 10] window
  this project reserves for furniture — while holding a mean **9.1%** of the
  plot across twelve seeds and peaking at **70–97%** on every one of them. It
  cannot be repaired with a better colour: the lineage fills are
  `hsl(h, 68%, 55%)` around the whole hue wheel, so anything bright enough to
  clear the background walks into some lineage, and *pure white at full opacity*
  still only reaches 23.9 from the nearest of them. The escape is geometry — the
  hatch machinery this figure already has — and that is a design cycle, not a
  value. Written up in `docs/SCIENCE.md`.
- **`#muller` paints its own background** (`#04070b`) while the audit models the
  panel (`#0c131c`), worth up to ΔE 4.4 on an opaque band. Immaterial for the
  lineage fills at 0.9 and decisive for anything translucent.
- **A band is not "quieter than its own line" under every vision model.** It
  reads like the obvious claim and it is false: under tritanopia the population
  band sits *further* from the panel than the population line does. The relation
  that is true is the arithmetic one in the CSS, and that is what the test pins.

## [1.60.0] — 2026-08-06

v1.51 walked this page with a keyboard, fixed everything it found, and finished
with one gap it deliberately did not close: *the pond canvas and the minimap take
clicks and cannot be focused, so selecting a creature and jumping the view have
no keyboard route at all.* It was filed as a feature rather than a patch because
a `tabindex` does not answer the question underneath it — **what does Tab into
the pond select, and how do you step between three hundred creatures?** This
release answers it spatially: an arrow key moves the selection to the nearest
creature in that direction.

### Added

- **`src/pondnav.js` — the arrow keys' arithmetic.** A candidate is "east" of
  you when `dx > 0 && |dy| <= dx`, and the four quadrants tile the plane, so no
  creature can sit in a gap between the keys. Offsets are wrapped, so a step off
  the right-hand edge continues into the left-hand one exactly as the water does.
  Pure, like `describe.js` and `gestures.js`: `main.js` is the adapter that turns
  a key event into one of these calls, and `test/pondnav.test.js` is where the
  rule itself is pinned.
- **A keyboard route into the pond.** `Tab` reaches the canvas; the first arrow
  press selects whatever the *view* is already on (the camera's centre, or the
  creature it is following) rather than something from the far side of the water;
  `Enter` follows the selection, as a double-click does; `Escape` clears it. A
  step that lands off-screen while zoomed brings the view with it. Focus alone
  selects nothing — tabbing past the pond on the way to the controls must not
  move the camera.
- **`describeSelection()` — the selection, said out loud.** One short sentence
  per press into the live region the Chronicle already uses, because an arrow key
  that moves a selection silently is v1.13's rule with the senses swapped. It is
  a *state*, so a new one replaces an unspoken old one: holding a key down
  announces where you ended up, not every creature you passed. Energy is the
  inspector's own arithmetic, so the number a reader sees and the number a
  listener hears cannot drift.
- **The minimap answers the arrow keys too**, sliding the view 60 px a press —
  the keyboard form of a click on it. It is `display: none` at zoom 1, so it
  is not a tab stop in the one state every screenshot in this project depends on.

### Measured

- **Every living creature is reachable.** From the entry selection, following
  arrow steps reaches **100%** of the pond on twelve seeds, at thirteen sample
  points through a run of seed 314, in thin ponds down to two creatures, and in a
  walled, occluded pond. Worst case **13 presses**, mean 4–7. This is an
  observation and not a theorem: I could not prove it, and 200,000 randomly
  clustered layouts failed to produce a counterexample.
- **What the obvious alternative would have done.** Stepping through
  `world.creatures` — the array, in birth order — moves the selection a median
  **295.8 px** across twelve seeds, against **68.6 px** for an arrow step. The
  expected distance between two *uniformly random* points on this torus is
  296.8 px: a list-shaped keyboard route is, to within measurement, teleporting
  to a random creature. (v1.47's lesson that birth order is an accident of the
  sweep, arriving on the interface side.)
- **Rock does not block a step**, even with `barrierOcclusion` on. That is the
  decision, not an oversight: occlusion is a rule about what a *creature* can
  sense, and a watcher can plainly see over a wall.

### Changed

- `app/index.html`: both canvases carry `tabindex="0"`, the pond names its keys
  in an `sr-only` paragraph it points at with `aria-describedby`, and the visible
  shortcut bar prints them too — v1.51's rule that every affordance the prose
  promises should be findable in the markup, run in the other direction.
- `test/markup.test.js` pins both `tabindex` values and the key hint, because the
  way this breaks is an attribute deleted while tidying markup, which leaves a
  canvas that looks identical and is unreachable again.

## [1.59.0] — 2026-08-06

v1.53 replaced twelve hand-rolled determinism checks with one shared assertion
over four channels, and quietly carried the thirteenth thing forward unexamined:
a loop over three counters, because no fingerprint in this project touches a
counter. `world.stats` has **43** own properties and `world.energy` **8**. Three
of fifty-one. This release hashes the other forty-eight, and measures the claim
both books have opened with since they were written — that nothing in the
simulation reads them.

### Added

- **`booksFingerprint()` — the fifth channel.** Every counter, ledger field,
  ring and history buffer the pond keeps. It exists for the same reason
  `observationFingerprint` does, one output surface over: a counter is not a
  *place*, so incrementing one moves no picture of the world and every
  fingerprint here holds. `test/books.test.js` stages that as ten arms — a
  miscounted birth, a phantom scavenging bite, a doubled archive stride, a
  burial filed under the wrong cause — and each moves the books hash and none of
  them moves the state, trajectory or observation hash.
- **`STATS_HASHED` / `ENERGY_HASHED`, and a test that walks a live world against
  them.** v1.53's rule was to fix the instances and then make the class
  unrepresentable: a completeness walk means the *next* release's counter cannot
  land outside the instrument. Both exclusion lists are empty on purpose, and
  the shape is kept so that a field which should stay outside has somewhere to
  be written down with its reason.
- **A generic structural mixer** behind it. The three older hashes walk a fixed
  shape; the books do not — half of a history point's keys are built by
  `energyField()` and `buriedField()` from lists that grow. Object keys are
  sorted, so the digest is a statement about what an object holds rather than
  about the order some loop wrote it in, and each key is mixed *by name*, so a
  field that appears, disappears or is renamed still moves it.

### Measured

- **Nothing in the books feeds back into the simulation.** `stats.js` has said
  so since v1.0 and `energy.js` since v1.29, and both were comments. Each of the
  51 fields held wrong for **60 consecutive ticks** — re-applied before every
  step, so a field `sample()` recomputes is still wrong during the part of the
  tick a reader would read it in — leaves the state, the trajectory and the tree
  of life bit-for-bit identical. Per-field, not all at once: an aggregate two
  cancelling errors can satisfy is not a test of either.
- **Six of the 43 stats fields do not exist until the first `sample()`** —
  `avgGeneration`, `currentMaxGeneration`, `carnivoreCount`, `avgHidden`,
  `avgConns`, `maxHidden`. A list enumerated from the constructor, which is the
  obvious way to write one, gets thirty-seven names and looks complete. The
  completeness test walks a *stepped* world for exactly this reason.
- **Every feature-specific counter reads exactly 0 with its feature off** over
  1,500 ticks — the two barrier counters, the two collision counters, the six
  disease counters, `groundBias`, `soilShare`, `avgLearning`, `avgVoice`,
  `avgHeard`. The v1.20 bar, applied to the counters rather than to a claim.
- **What the channel costs:** ~1.0 ms per digest against the state hash's
  0.25 ms, walking 6,600 numbers on a 500-tick pond — about three ticks' worth,
  twice per paired test. 93% of that walk is the two history buffers; the
  counters themselves are 51 numbers. Suite wall clock unchanged within noise.

### Changed

- `test/support/paired.js` runs five channels. The three-counter loop is gone
  and everything it asserted is inside the new one — by the v1.53 rule that
  consolidating N approximations takes the union, not the strongest.
- The archive's own thinning state (`stride`, `seen`, the min/max envelopes) is
  now inside a determinism instrument. Two worlds whose every creature agrees
  can differ there, and a record that halved itself at a different moment is
  exactly the kind of difference that looks like nothing.
- `src/levers.js` still has four channels, checked rather than assumed: `Stats`
  is constructed from its own defaults and not from `DEFAULT_CONFIG`, so no
  config constant can move only the books.

## [1.58.0] — 2026-08-05

The population chart has had a caption naming two ends since v1.22, and the rule
it was written to obey — *a scale that never moves needs a word; a scale that
moves needs marks* — was written down in v1.41 while giving the same figure its
**y**-axis. Both of this chart's scales move. Only one of them was marked. This
release marks the other one, discovers that the obvious way to place a mark is
wrong on this figure and right on the one it was borrowed from, and says why.

### Added

- **An x-axis under the population chart** — round ticks in the DOM, below the
  paint, on the pattern v1.54 gave the Tree of Life. One row labels three
  figures: the chart, the death strip and the power strip all draw the same
  history at the same x positions, and it is the first thing on the page that
  makes that shared axis a statement rather than a comment in the markup. It
  sits against the bottom figure because a tick rule has to touch something.
- **`chartAxis()` and `tickFrac()` in `src/chart.js`**, and `axisMarks()`, which
  is `mullerAxis`'s mark-building lifted out and shared. The one thing the
  shared helper does not know is *where a tick sits*: that is passed in, because
  the two figures do not agree about it.

### Fixed

- **The map from tick to position is not a division, and treating it as one is
  off by a column.** The Tree of Life's columns are all the same width in ticks
  by construction, so its axis divides the span and its own test pins that this
  stays true. The chart's are not: `Archive.series()` appends the newest raw
  sample after the last representative so the right-hand edge is *now*, and that
  final column is drawn as wide as every other while standing for as little as
  one sample. `tickFrac()` walks the history instead. Pinned both ways in
  `test/chart.test.js` — the recent window reads a difference of **exactly
  zero**, and the whole-run archive reads non-zero, one-sided, and never more
  than one column.

### Measured

- **What the division would have cost:** at most **0.662%** of the figure's
  width — 6.0 px of a 900-px phone column, 1.8 px of the 268-px sidebar — over
  20,000 ticks on three seeds, every mark displaced to the *right*, never the
  left. The bound is one column: a halving leaves at least 121 of them, so the
  error can never exceed 0.83%.
- **And the number is identical on seeds 314, 77 and 51, to three decimals.** The
  archive's geometry is a property of the clock, not of the pond. This project's
  standing rule is that a dozen seeds or it is an anecdote; a claim about an
  *instrument's* arithmetic has no seed-to-seed spread to average over, and one
  seed is the whole population.
- **The recent window is exactly uniform**, because `Stats.sample` has recorded
  one point every four ticks since v1.0 — so the assertion is `=== 0` rather
  than a tolerance, and it fails loudly the day that stops being true.

### Changed

- `mullerAxis()` keeps its behaviour, its exports and its tests; it now builds
  its marks through the shared helper and passes its own linear map in.
- The x-axis stylesheet rules cover both figures from one definition.

## [1.57.0] — 2026-08-05

The minimap has been catching up with the world since v1.19 — terrain in v1.24,
enriched ground in v1.27, the contagious zone in v1.34, rock in v1.48 — and the
thing it never drew is older than all of them. Scavenging has left corpses lying
in the water since v1.8. The Chronicle announces a die-off in words the moment
forty of them are down, and for thirty-eight releases the map that sentence sits
next to showed empty water. This release draws them, finds that they make no
pattern at all, and trips over a colour on the way in.

### Added

- **The dead, on the minimap.** A pale square with a dark one inside it — the
  hunter's badge inverted, which is what tells the two apart at three pixels,
  because their pale tones sit ΔE 13.6–21.9 apart against a bar of 25 and the
  colours cannot do it. The tones are the pond's own `corpseMarkTones()`, built
  from that function rather than copied out of it. Drawn over every field and
  under everything alive, in the pond's order; a pond with scavenging off draws
  nothing and never so much as names the colour.
- **`minimapCorpseMark()` in `src/palette.js`**, audited over 68 grounds — the
  map's water, its eight terrain bands, biomes, enriched ground, the contagious
  zone, both tones of rock — every lineage hue, the pellet and the hunter's
  badge, under all four vision models. Worst case **ΔE 42.3**.
- **What the mark deliberately does not say.** The pond ramps a corpse's size
  with the meat left in it; three minimap pixels have no such range to spend, so
  the little map answers *how many and where* and leaves *how fresh* to the view
  that can draw it.

### Measured

- **There is something to draw.** Twelve seeds, 9,000 ticks, sampled every
  fiftieth tick: a median of **7.0 standing corpses** (3.6–21.2 by seed), a
  busiest sample of 27 (11–63), and at least one corpse in **93%** of samples.
  Two seeds — 314, the default, and 51 — spend an eighth of their lives past the
  Chronicle's forty-corpse die-off threshold. At zoom 4, where this map first
  appears, the pond view holds **6.9%** of them.
- **And no pattern in it, which is the finding.** The caption I would have
  written is that a die-off leaves a shape. Two controls of the cheapest strong
  kind — same frame, same query, the positions replaced by uniform random points
  — say otherwise: a corpse's nearest living neighbour is 33.2 px against the
  null's **31.9** (6 seeds of 12), and its nearest other corpse 135.6 px against
  **128.9** (8 of 12), both differences far smaller than the seed-to-seed spread.
  The dead are scattered. What the mark carries is a count and a place, not a
  shape. Full tables in [docs/SCIENCE.md](docs/SCIENCE.md).
- **The statistic that looked like evidence.** Only 1.2% of corpses sit in a
  coarse cell holding nobody alive — which reads as *the dead lie among the
  living* until you notice 200 creatures occupy nearly every cell, so a random
  point scores the same. It was a statement about the grid, not about the pond.

### Fixed

- **The minimap's pellet had a private colour, and it failed on every bright
  ground the map has.** `rgba(80, 205, 140, 0.5)` was a literal in `minimap.js`
  from v1.19: the pond's mote colour typed out again with the pond's arithmetic
  — an additive glow — left behind. A flat wash reads on dark water and on
  nothing brighter: **ΔE 10.3** on the brightest enriched ground, **15.3** on
  rock, **4.6** on a corpse's bone, and under the bar on **32 of 70** grounds.
  It is `foodMote()` now, drawn with `globalCompositeOperation = "lighter"`
  exactly as the pond draws it and restored immediately (the creatures are next,
  and the context outlives the frame): 0 of 70 grounds fail, and the binding
  case is the corpse's bone at **25.6** — the same number, to the same tenth,
  that picked that lightness in the pond in v1.55.
- The old wash is pinned as a failure in `test/palette.test.js`, so a future
  tidy-up back into one `fillStyle` string fails loudly.

### Changed

- **`test/minimap.test.js` uses the recorder now.** It had hand-rolled its own
  stub since v1.19 — five methods and `fillStyle` as a plain field — so every
  assertion here was about geometry and none could be about colour. It shares
  `recordingContext()` with the renderer's tests, which is what lets the corpse
  badge's two tones and the pellet's composite mode be checked at all. That was
  the last surface `src/rendershot.js` had not reached.

## [1.56.0] — 2026-08-05

`docs/AUTONOMOUS.md` keeps a list of things this world hands out for free, and
space has been on it since v1.18. Food gathers in biomes, rough ground costs more
to cross, rock refuses a step — and through fifty-five releases nobody has ever
been *in the way*. Two creatures could stand on the same point, for their whole
lives, at no cost to either. This is the rule that charges for it, and the
control arm that takes most of the result back.

### Added

- **`bodyCollision` (opt-in): two creatures cannot occupy the same place.** After
  every creature has moved under its own power, any two whose bodies overlap are
  pushed apart along the line between them, each giving up half the overlap. Size
  does not enter — this is exclusion, not force, and a mass-weighted version
  would be a different rule with a different claim. No new constant (the distance
  a pair owes is `r1 + r2`, which the bodies already carry) and no random draw in
  either direction, so a shoving world is still reproducible from its seed and a
  world with the flag off is bit-for-bit every earlier version's.
- **It is the first rule in `world.step()` that is exactly simultaneous.** Every
  displacement is computed from the positions everyone holds at one instant and
  none is written until all are known, so — unlike grazing, biting, reproduction
  and the population cap — the answer cannot depend on where a creature sits in
  the array. `test/bodyCollision.test.js` asserts the strong form of that:
  reverse the population array before the pass and the pond is bit-for-bit
  identical.
- **A relaxation, not a solver, and the tests say so exactly.** Three equal bodies
  in a row: the middle one's two shoves cancel, so each end gives up half of what
  its pair owes and the gap closes by half a tick — 9 px, 10.5, 11.25, 11.625,
  converging on the 12 it owes and never arriving. That sequence is pinned. In a
  real pond the pass separates **32 pairs a tick** in a population of 220 and
  ends every tick still holding 0.82 overlapping pairs for each one it just
  separated.
- **`stats.jostled` and a `Jostled` tile**, cumulative with a per-hundred-tick
  rate, on the pattern `walled` established in v1.48 and for the same reason: the
  rule is nearly impossible to *see* — a pond where nobody may overlap looks very
  like a pond where everybody may — so the readout is the only thing on the page
  that says how much shoving is behind the picture. Exactly 0 without the flag,
  so it reads `off` rather than a suspiciously steady zero, and `describe.js`
  says the same thing in words for a listener.

### Measured

- **The rule survives its control on one statistic out of six, and it is the one
  the rule is about.** The null arm is the v1.27/v1.47 shape: the same pairs, the
  same displacement, turned 90° — separating nothing, costing exactly as much.
  Twelve seeds, 9,000 ticks, median change against the same seed's default run.
  Standing overlapping pairs: **−69.7%** with the rule, −52.7% with the null, and
  paired seed by seed the rule beats the null by a further **30.1% on 11 of 12
  seeds**.
- **Everything else is the null's.** Mean nearest-neighbour distance rises 13.5%
  with the rule and **20.5%** with the null (paired difference −0.6%, 6 seeds of
  12 — a coin toss). Contested meals fall 56.9% and 52.3%. Population is +2.3%
  and +1.6% against a *shared* baseline, which is the correlated design v1.47 was
  burned by. Kills swing from −70% to +486% across seeds and say nothing.
- **And the bound I expected to be exclusion's turned out to be half the null's.**
  The deepest pile — most bodies within 8 px of one point — falls from a mean of
  3.4–5.1 to 1.0–2.0 with the rule and 1.0–1.7 with the null: shoving a heap in
  circles pulls it apart about as well as pushing it outward. What the null
  cannot do is control how far *into* each other two bodies get. The pond's
  deepest overlap at a typical instant is **0.6–2.3 px with the rule against
  4.5–6.8 px with the null** and 12.3–14.1 by default — six seeds of six, ranges
  that do not touch. Exclusion owns a *depth*, not a spacing or a count. The full
  write-up, both tables and a runnable script are in
  [docs/SCIENCE.md](docs/SCIENCE.md).

### Changed

- `Stats` grows one small private helper, `_perHundred`, and `walledRate` now
  reads through it — the ring-and-difference for a cumulative counter was about
  to exist twice.

## [1.55.0] — 2026-08-05

Every colour audit since v1.25 has been wrong about the *set* of backgrounds
rather than about the arithmetic: v1.25 skipped the stylesheet, v1.34 the
contagious zone, v1.43 the creature's own body. The corpse is the fourth and
the sharpest, because the background it was never measured against is one the
mark itself creates. Detritus is minted where things die, so a corpse lies on
enriched ground by construction — and the ground is a warm ochre while the
splotch was a warm maroon.

### Fixed

- **A corpse was the colour of the soil it rots into.** Over enriched ground the
  old `rgba(150, 55, 48, a)` scored **ΔE 0.0 under tritanopia, 0.2 under
  deuteranopia and 0.1 under protanopia** — at *every* opacity it could reach,
  including the maximum, so turning it up was never going to help — against a
  bar of 25. Under normal vision its worst ground scored 4.9–21.7, so this is a
  legibility failure that happens to be worst for dichromats, not a
  colour-blindness one (v1.46's rule: check the trichromat first). Over plain
  water it was better in places and still poor: 2.1 under protanopia.
- **And it spent opacity on degree, which is the one thing v1.34 forbids by
  name.** How much meat was left rode on the alpha, `min(0.7, 0.15 + meat/60)`.
  Over twelve 12,000-tick scavenging worlds (n = 353,000 corpse-frames)
  **27.4% sat below 0.35 and 50.2% below 0.5**, with a median of 0.50 — half of
  every corpse this pond has drawn was in the dimmer half of a ramp with no
  contrast to spend, while the top of the ramp is a cap a fresh corpse of
  average size is already over.
- **It becomes two opaque tones and a size.** A pale bone ring
  (`hsl(50, 40%, 76%)`) around a near-black core (`hsl(350, 55%, 7%)`), drawn as
  two filled discs rather than a fill and a stroke so neither tone is an
  antialiased blend of the other, with the remaining meat moving the radius.
  Deliberately the *inverse* of the predator mark's pale disc inside a dark rim:
  the two are the only pale marks in the pond, they sit ΔE 7.7 apart, and
  inverting the geometry is what separates them at a glance. Worst case over 480
  grounds under all four vision models: **ΔE 42.1**.
- **The constraint that picked the ring was the pellet drawn on top of it.** A
  food mote is additive and a corpse is one of *its* backgrounds — v1.43's rule
  arriving from the other side. Against a lighter ring the green clamps out of
  existence: the check scores **25.6** at the shipped lightness, 22.2 at 80% and
  13.4 at 88%, while the ground sweep *improves* over that range. The two
  columns pull opposite ways, and the shipped value is the last that satisfies
  both. `test/palette.test.js` pins the squeeze, and pins the old maroon as the
  collision it was so restoring it fails loudly.

### Added

- **`foodMote()` in `src/palette.js`.** The mote's colour has been a literal in
  `render.js` since v1.0 and a copy of that literal in the test file since
  v1.34 — the arrangement v1.26 wrote a rule against. It is in the palette now
  because the corpse audit needs it, and both callers read it.
- **A corpse test on the canvas side.** `test/render.test.js` stages a fresh
  corpse and a nearly-rotted one at fixed positions and asserts both tones reach
  the canvas, the old translucent maroon does not, and the two corpses are drawn
  at different radii — the palette cannot know whether `render.js` used the
  number it returned.

### Changed

- `docs/screenshots/scavenging.png` re-captured. It had shown the old splotch
  since it was taken, which is the stale-artifact failure v1.43 left behind and
  v1.46 left again.

## [1.54.0] — 2026-08-04

The Tree of Life is the widest figure on the page and its entire horizontal
dimension is time. v1.41 gave the population chart the y-axis it had gone forty
releases without and wrote down the rule — *a scale that never moves needs a
word; a scale that moves needs marks* — and then left the axis that is nothing
but a moving scale unmarked, one figure down the page, for thirteen more
versions. Its only statement of scale was a caption naming the two ends.

### Added

- **An x-axis under the Tree of Life.** Round tick numbers — one about every 160
  pixels of figure, so a phone gets fewer rather than a collision — each with a
  short rule joining it to the column it names. `mullerAxis()` is the
  arithmetic, in `src/mullerplot.js` where the suite can reach it; `main.js` is
  the adapter, as it is for the chart. The marks are DOM text below the figure
  rather than gridlines through it, for two reasons: this canvas is stretched to
  whatever the column is (canvas text would stretch with it — v1.41's reason)
  and, new here, **a stacked-band plot has no background for furniture to sit
  on**. Every pixel of it is data in a colour the pond chose, so a rule inside it
  is either invisible or v1.34's lottery.
- **The invariant the axis rests on, asserted.** The plot has spaced its columns
  evenly in *pixels* since v1.0 and has had a test saying so since v1.42.
  Whether they are evenly spaced in *ticks* is a different claim, belonging to
  `phylogeny.js#_record`, written in a comment in v1.30 and checked nowhere.
  Measured across twelve seeds at 20,000 ticks — after three halvings, 417
  columns of 48 ticks each — the largest departure of any column from
  `from + i × resolution` is **0 ticks** on every seed, so the tick-to-position
  map is exactly linear. `test/mullerplot.test.js` now pins it: the day a
  halving leaves a window that is not the width of its neighbours, the axis is
  a lie and the suite says so first.
- **A test that every id `main.js` looks up exists somewhere.** The last module
  with no test of any kind fails most easily not on logic but on `$("phylo-tick")`
  against a page that says `phylo-ticks` — which throws inside the animation loop
  and takes the whole page with it. `test/markup.test.js` reads the shipped HTML
  and the ids `main.js` writes itself, and fails on any third case.

### Fixed

- **"Abundance" was the wrong word, on three surfaces, since v1.2.** The plot
  normalises every column by the pond alive in it: a band's thickness is a
  *share*, the stack is always exactly full, and a band can widen while the
  population falls. The app's caption, the README and `SCIENCE.md` all called it
  abundance, which is the word for a headcount. Over twelve seeds, **11.3–19.2%**
  of the moves a band makes point the opposite way to the lineage's own numbers
  (a median of 15.0%, 17.8% on the default seed) — so roughly one band movement
  in six is read backwards by a visitor who believes the caption. All three now
  say share, and say the consequence in the same breath.
- **The axis names the last column, not the newest sample.** The caption's range
  and the axis's range answer different questions and are not the same number:
  the record's newest raw sample can sit up to one window past the last stored
  snapshot, and that window is drawn as the single column at the right-hand
  edge. On the default seed at 20,000 ticks the record reaches 19,998 and the
  right edge stands for **19,968**. Only the second can label a coordinate.

### Notes

- The first version of the adapter cached the marks' *positions* alongside the
  set of marks, and the two change on different clocks — which numbers are
  marked changes a few times a run, where each one sits changes with every new
  column. Reading the code did not show it; opening the page did, with a mark
  labelled 1,000 sitting over tick 1,150. v1.23's stale readout, in a figure
  whose whole subject is when things happened.

## [1.53.0] — 2026-08-03

v1.36 built this project's determinism instruments and asked the sharp question
of one of them — *what must this hash be blind to?* — and wrote a test for the
answer. The other half of that question was never asked. `stateFingerprint` is
what every same-process comparison here runs on, including the constant sweep,
and it hashed sixteen of the twenty-eight fields a creature carries, hand-picked
in v1.36 and untouched for seventeen releases.

### Fixed

- **Four pieces of live state the strongest determinism instrument could not
  see.** Sweeping the state the way `levers.js` sweeps the constants — perturb
  each field, ask whether anything notices — found `metabolismScale`, `phase`
  and `world.visionFactor` moving the pond's future at the *next tick* while the
  hash held still, and `lastBiteAge`, the predation cooldown, within three. Six
  further omissions (`walled`, `groundFeel`, `hue`, `infectedAtAge`,
  `prevSignal`, `heard`) are inert only because their readers sit behind flags
  that are off. All ten are hashed now, along with the two brain arrays that
  were outside it for the same reason — `auxW`, which carries signalling and the
  ground sense into the network, and the per-weight plasticity coefficients.
  Nothing was writing them wrongly: the hash was not enforcing those fields, it
  was agreeing with them, which is v1.36's own "a promise I have always kept
  feels exactly like a promise that is enforced" one level down.
- **The two fields that must stay outside, said out loud.** `creature.id` is a
  module-level counter, so the second world built in a process never agrees with
  the first however identical the ponds are; `creature.speciesId` is written by
  the observer and already lives in `observationFingerprint`. Both are named in
  `CREATURE_UNHASHED` with the reason attached.

### Added

- **A test that walks a live creature and fails on any field in neither list.**
  The durable half of this release is not the ten fields added but that the next
  one cannot quietly land outside the instrument. `test/determinism.test.js`
  enumerates the class rather than fixing the instances — the playbook has
  demanded that since v1.43 — and also pins the blindness, the sight, and the
  fact that each of the three consequential omissions really does move a pond.
- **`drawStream()`, the fourth channel.** The three fingerprints are pictures of
  a world at an instant, and the canonical violation of the second prime
  directive does not appear in one: a feature that is off and draws a random
  number anyway leaves the pond bit-identical and parts from it **eight ticks
  later** (measured, seed 21). v1.45 and v1.47 each met this and each solved it
  by counting draws in one file; hashing the values is the same idea and
  strictly stronger, since two streams can agree on how many numbers were taken
  and disagree about which consumer took which.
- **One assertion behind all twelve "bit-for-bit unaffected" tests.**
  `test/support/paired.js` checks four channels, the birth/death/kill counters
  (which no fingerprint covers, and which ten of the twelve were checking), and
  that the pond was still alive at the end — a guard v1.45 added to one test and
  nowhere else. The ten hand-rolled comparisons it replaces did not agree with
  each other: five never compared `y`, so moving every creature in the pond one
  ULP sideways left them green, and two compared three integers and nothing
  else.

## [1.52.0] — 2026-08-03

v1.48 gave this world rock and v1.50 made it opaque, and neither release gave a
visitor a way to find it: two of the biggest mechanics this project has ever
shipped sat behind two checkboxes near the bottom of a panel. This cycle builds
the door, and picks the seed the way the last one was picked — on the control.

### Added

- **The Four Rooms — a twelfth scenario, on seed 51.** Four walls of rock,
  opaque to every sense, cutting the pond into rooms joined by narrow gates. The
  seed was earned by a 64-seed sweep scored on v1.48's isolation-by-distance
  result *and its within-run control*: at 4,000 ticks the real room lines read
  **+0.807** and the same creatures at the same instant partitioned by lines
  shifted half a room over read **+0.052** — a factor of fifteen — while the
  ordinary between-arms control (no walls, same lines) reads **−0.104**. The
  crossing rate falls from 31.7 room changes per 10,000 creature-turns to 8.1,
  and the pond stays a pond: a mean of 217 creatures over 16,000 ticks, never
  below 37, with a working predator lineage. What made *this* seed the one is
  that it keeps the signal for a long watch (+0.556 over ticks 4,000–8,000,
  +0.176 over 8,000–16,000) where most of the field decays to nothing.
- **The first test to assert the isolation result at all.** v1.48's headline
  measurement has lived only in `SCIENCE.md` for three releases.
  `test/scenarios.test.js` now pins it and its shifted-lines control on the
  shipped seed, at a fifth of the measured margin.
- **A test that reads the README.** The size of the scenario collection is
  stated twice in prose — once as a word, once as the full list of names — and
  my own playbook has carried "anything stated as a number in prose about a
  collection in code will drift" since the count sat wrong for sixteen releases.
  Writing the rule down was not the fix. Both statements are now checked against
  the array, in order.

### Measured

- **The signal decays with the pond's genetic variance, and the species count
  does not see it.** The tempting explanation for why most seeds lose their
  isolation — one lineage sweeps and erases it — is not what the Tree of Life is
  counting. Seed 45 ends 16,000 ticks with **28 species and no isolation at
  all**; seed 51 holds the signal longest with **8**. Mean pairwise genetic
  distance tracks it far better than any count does (and seed 32 is the awkward
  exception, left in the table on purpose). Filed on the Science page as a lead,
  not a finding.
- **Opacity is on for one reason and it is not this one.** `barrierOcclusion` is
  in the scenario because a wall you can see through is not a wall. v1.50
  measured it against exactly this isolation claim and found it does not deepen
  it — 6 of 12 seeds, a coin toss — so the scenario says so in its own comment
  rather than letting the claim travel by adjacency.

## [1.51.0] — 2026-08-03

The playbook has carried "the controls panel has never been walked with a
keyboard alone" for nine releases. v1.49 proved the page can simply be *opened*
— headless Chromium is ten minutes, not an afternoon — so this cycle walked it:
61 tab stops, and then a look at what each one says.

### Fixed

- **The Tree of Life's legend chips are buttons.** That section's own prose says
  "click one to spotlight it in the pond above", and for twenty-nine versions it
  was a `div` with a click handler: not focusable, not operable by Enter or
  Space, and announcing neither that it could be pressed nor whether it was.
  They carry `aria-pressed` now, which is the state the `active` class was
  saying in a colour alone. Verified in the browser: the chips are tab stops 61
  and 62, Enter toggles the highlight, and the attribute follows it.
- **Thirty-five `<label>` elements that labelled nothing.** A `<label>` with no
  `for` and no control inside it is not a label — it is text sitting above a
  number, paired only by the layout. Twenty-two are the live stat tiles and
  thirteen more were generated by the inspector. Both are description lists now
  (`dt` the name, `dd` the value), so the accessibility tree carries 22 terms
  and 22 definitions where it used to carry 44 loose strings.
- **The two inspector figures had no accessible name at all.** v1.42 finished a
  sweep with "all six canvases on the page have accessible names" — and the
  weight strip is a row of 120 `<span>`s and the NEAT diagram is an SVG, so
  neither is a canvas and the sweep walked past both. Each names itself now, and
  names itself by reporting the picture rather than announcing that a picture is
  there: *"Inherited brain: 120 weights, 59 excitatory and 61 inhibitory,
  strongest 2.21"*, *"Evolved brain: 16 senses on the left, 0 hidden neurons in
  the middle, 3 motors on the right, wired by 8 live connections."*
- **A figure named once is named for one frame.** The learned-weights strip is
  repainted from `innerHTML` on every tick by the live-patch path, which passed
  no name — so the same figure introduced itself as "Brain as learned so far"
  when it was built and "Brain" a frame later. The v1.23 stale-readout family,
  in a caption.
- **`#btn-randomseed` was one emoji.** It announced as "game die"; it says
  "Random seed".

### Added

- **`test/markup.test.js` — the first test in this project that reads the HTML
  it ships.** Forty-two test files and every one of them looked at JavaScript,
  while the two hand-written documents a visitor actually loads had been read by
  nobody. Eight assertions: no id used twice, every `for`/`aria-labelledby`
  target exists, every label labels something, no positive `tabindex`, every
  `role="img"` has a name, every button and link has one, the legend is built
  from buttons — and no stylesheet takes the focus ring away. It is a text scan
  and says so: every rule in it is one the browser walk confirmed first, and
  anything needing layout or the accessibility tree stayed in the browser.

### Measured

- **The focus ring is fine, and that is the result.** There is no `:focus-visible`
  rule in 1,227 lines of CSS, which reads like an omission. Four controls
  photographed at 4×, focused and unfocused, say otherwise: the UA ring is an
  opaque white band with a dark one behind it — v1.34's rule for a mark whose
  background it does not control, arrived at by somebody else. So nothing was
  added, and what is pinned is the way it breaks: a future tidy-up writing
  `outline: none`.
- **Nothing else in the walk was wrong.** 61 stops in document order, no traps,
  no positive `tabindex`, no console errors, and the wrap returns to the top.
- **The panel is pixel-identical.** `<button>` inherits the global
  `button { flex: 1 }` rule, which stretched two chips to 635 px each — caught
  by measuring rather than by looking, and corrected the same way `.scope-btn`
  already was. Before and after now agree exactly: chips 102×24 and 109×24, a
  stat tile 72×32, the stats block 320×324, the whole panel 2,110 px tall.
- **Still mouse-only, and written down:** the pond canvas and the minimap both
  take clicks and neither can be focused, so *selecting a creature* and *jumping
  the view* have no keyboard route. That is the next release's problem, not a
  thing this one quietly half-did.

## [1.50.0] — 2026-08-03

v1.48 gave this world rock, and wrote into three files that only *bodies* are
stopped: sight, earshot, a mate search and the pathogen all crossed solid stone.
That was the right call for one release — a wall that changes movement and
information at once cannot be attributed — and it left a wall you can see, hear
and infect through, which is a detour rather than a wall. This is the second
mechanic, on its own flag.

### Added

- **`barrierOcclusion` (opt-in, needs `barriers`): rock you cannot see through.**
  Every sense query asks `barriers.occluded()` first — the nearest pellet, the
  nearest prey, the nearest threat, the loudest voice in earshot, a mate, and the
  pathogen. Teeth needed no rule of their own: a hunter bites what it homed in
  on, and it can no longer home in on what it cannot see. A room stops being only
  somewhere to be stuck and becomes somewhere to hide.
- **The geometry is exact, not sampled.** A marched ray steps clean through
  fourteen pixels of rock, and a rule that depends on a step size is a rule
  nobody can state. `firstHit()` intersects the segment with each wrapped slab
  and then with that wall's solid runs, so it is O(walls) rather than O(length),
  and it agrees with an eight-thousand-step walk on a thousand segments across
  two seeds with no disagreements.
- **The vision overlay stops being a circle.** `visibleRadii()` is `firstHit()`
  asked once per direction, so selecting a creature in a walled pond draws the
  shape sight actually takes, with the walls' shadows cut out of it — and it
  composes with the grid-shaped bite v1.32 drew, by clipping, because the region
  a sense reaches is the intersection of every constraint on it. A new test in
  `test/render.test.js` takes the path the renderer emits and asserts every
  vertex is a point the *rule* calls visible with the point beyond it hidden, so
  the picture cannot drift from the rule it is a picture of.
- **A toggle, a URL parameter (`dark=1`), and a sentence in the pond's
  `aria-label`** — opacity has no picture at all unless a creature is selected,
  so the one surface that cannot show it says it instead.

### Measured

- **A third of what a creature can see, it can no longer see.** Inside one pond
  at one instant, under both rules, so nothing is attributed to a diverging
  trajectory: **32.5%** of in-range sight lines cross rock, the nearest pellet
  changes for **14.6%** of the pond and the nearest threat for **12.7%**, and
  **15.5%** of everyone who could see a hunter stops being able to. The number is
  exactly 0 with the feature off.
- **It does not blind anybody — it redirects them.** Creatures left with no
  pellet in sight at all: **0.0%**. With 280 pellets in the water, the pellet
  behind the wall is replaced by a different pellet on this side.
- **It does not deepen v1.48's isolation, and that is the finding.** Twelve
  seeds, 9,000 ticks, with v1.48's within-run control: isolation-by-distance is
  up on **6 of 12** seeds and the median falls (+0.168 → +0.105); population is
  up on **6 of 12**. Genetic structure across the rooms comes from restricted
  *movement* — a timescale — and opacity changes *information*. A remedy has to
  be about the same noun as the diagnosis; this one is not, which v1.23, v1.33
  and v1.48 between them had already established and I did not predict.
- **Predation more than doubles, and it is not established.** The median rises
  from 153 kills per 10,000 ticks to 371 — on 8 of 12 seeds, p ≈ 0.19 by a sign
  test, across a between-seed spread of 11 to 911. Reported as a lead, with a
  hypothesis (sight is symmetric, and fleeing is worth more to prey than spotting
  is to a predator) and no claim.
- **It costs 3.4x of the tick** in a walled pond (1,530 → 450 ticks/second on
  seed 314, against an animation rate of 60), all of it in the sense queries.
  Half of what it would have cost is saved by asking the question only of a
  candidate that could change an answer: a pellet no nearer than the best so far
  can never become the nearest one, so the wall in front of it is never looked
  for.

### Fixed

- **The headless renderer could not draw a walled world.** `src/rendershot.js`
  has stubbed every canvas method `render.js` uses since v1.40, and `strokeRect`
  arrived in v1.48 — so `renderOps()` on a pond with rock threw instead of
  recording, and nothing noticed for two releases. A stub built from the methods
  a renderer happened to use on the day it was written goes stale the first time
  the renderer learns a new one.
- **The opt-in flag sweep can ask for a world.** `test/fingerprint.test.js`
  checks every `false` in the config is a lever by switching it on; a flag that
  needs rock to do anything would have failed. It now runs its two arms in the
  world the flag is defined in, the same device `src/levers.js` uses for
  constants — which is a better answer than adding a third entry to the skip
  list.

## [1.49.0] — 2026-08-02

The colour audit has run for twenty-four releases and never once opened the
inspector — the panel where a creature's **brain** is drawn. Both figures in it
chose their colours inline in `main.js`, and both encoded a magnitude by fading
a mark, which v1.34 wrote down as the one thing never to do.

### Fixed

- **The weight strip is a bar chart now, not a fade.** Each of the 120 cells
  drew `hsla(hue, 80%, 55%, |w| / 2)`: sign by hue, magnitude by *opacity*.
  Measured against the cell's own track, a weight of 0.1 scores **ΔE 3.7** —
  under the just-noticeable difference — and at 0.25 its sign scores **10.7** to
  a protanope, against a bar of 25. That is not the tail of the distribution: on
  three seeds at 6,000 ticks the median |w| is **0.71**, a fifth of every strip
  is under 0.25 and **a third is under 0.5**, so a third of the fingerprint was
  being drawn in tones its background could swallow. Magnitude is now a **bar
  height** and sign is **both** the colour and the direction — positive bars
  stand on the floor, negative ones hang from the ceiling — so the sign survives
  a viewer for whom the two hues are one hue. The tones are opaque and ΔE 76.1
  apart, 54.9 at worst from the track.
- **Green against orange, the two ends of the brain diagram.** Sense neurons
  were `#5adc96` and motor neurons `#ffb060`: **ΔE 17.7 under protanopia** (35.6
  deuteranopia, 77.9 normal). The reason is one number — they are the same
  lightness, L* 79.4 and 78.0 — so the whole distinction rode on the red–green
  axis. Senses are now a deep leaf green at 48% lightness and motors a pale gold
  at 78%, pulled apart in the channel no deficiency touches (ΔL* 1.4 → **15.1**).
  The near-white hidden neuron is unchanged.
- **Connections stopped fading too.** `0.15 + |w| / 3` made a weak connection
  score 9.0 against the plate and its sign 17.3 to a protanope — while *width*
  was already carrying the magnitude alongside the fade. The opacity is now the
  constant `BRAIN_EDGE_ALPHA`, and nothing the figure was saying is lost.
- **A dead colour.** `#7fd0ff`, initialised as the diagram's "hidden default"
  and overwritten on every branch of the conditional below it, has been
  unreachable since v1.5 — and is the reason this project's own audit to-do list
  said the diagram had a blue in it.

### Added

- **`src/palette.js` reaches the inspector**: `inspectorTrack()`,
  `brainGraphBackground()`, `weightMark()`, `brainEdge()`, `brainNodeColours()`
  and their `*Tones()` twins, plus `rgbCss()`. The two plates were literals in
  `style.css` (`#142130`, `#05080d`) and are now custom properties painted from
  the palette at startup — v1.26's rule on the two backgrounds every mark above
  is measured against.
- **A key under the brain diagram.** It has drawn three colours of neuron and
  two colours of connection since v1.5 without ever saying what any of them
  meant. Five chips, in the colours the figure actually draws.
- **Six tests in `test/palette.test.js`**, three of which pin the *failures* —
  the faded cell, the faded edge sign, and green-against-orange — because a
  suite that only knows the new numbers stays green while someone restores the
  old ones.

### Measured

- The diagram's worst pair over every constraint is **ΔE 30.2**: the three
  neuron roles against each other, each against the plate, and each against both
  composited edge tones. That last set is the one this cycle nearly missed — a
  node is a disc sitting on the lines it terminates, and an earlier candidate
  put an indigo hidden neuron **12.1** from a positive connection.
- The search had **419** single-role candidates clearing the fixed backgrounds
  before any pairing, so this was taste inside a large feasible set. Worth
  stating, because v1.48 caught the infeasibility reflex writing its paragraph
  first for the third time.

## [1.48.0] — 2026-08-02

Twenty-five releases since this world last got a new *rule*. v1.23 built terrain
in two halves and only one of them worked: a pure movement tax moved the
population by -0.003, and the diagnosis written down at the time was a
**timescale** — a creature samples this whole map many times in a lifetime, so a
spatially varying cost averages away before selection can act. Two remedies
address a timescale rather than a magnitude: restrict movement, or vary the
resource. This is the first of them.

### Added

- **`barriers`** (opt-in, off by default) — rock. Four seed-derived walls (two
  north-south, two east-west, 14 px, wrapping) cut the torus into **four rooms**
  joined by 44 px gates. Two of each axis is the minimum that divides a torus at
  all; one wall you simply walk around through the seam. Rock covers 5.7% of the
  pond. Hash-derived like the terrain, so switching it on draws **zero** random
  numbers.
- **Sliding, for free.** A creature that meets rock loses the component of its
  velocity pointing into it and keeps the other, so it runs along the wall until
  a gate turns up. Nothing perceives a wall; there is no map, no memory and no
  new sense. Movement only — sight, sound, teeth and the pathogen all still
  cross rock.
- **`stats.walled`** and the **Walled** tile — turns in which rock refused a
  move, cumulative and exact, shown as a rate per hundred ticks (v1.35's rule: a
  run-to-date total is a number that has already stopped). Exactly 0 with no
  walls, so the tile reads `off`.
- **`src/barriers.js`**, `test/barriers.test.js` (15 tests), a rock colour in
  `src/palette.js` with its own audit, the rock drawn in **both** views (pond and
  minimap, from the same `rects()`), a **Barriers** toggle, the `rock` permalink
  key, and a sentence in the canvas's accessible description saying how many
  rooms there are and how often the pond is being turned back.

### Measured

- **Two doors beat one, and beat one twice as wide.** Twelve seeds, 9,000 ticks:
  no walls 181.1 mean population; **one** 44 px gate per room border 135.9 with
  **three of twelve seeds under 40 creatures**; **two** 44 px gates 196.4 with
  none; one 88 px gate 149.4 with three. A room that loses its population cannot
  be recolonised through a single door. What a room needs is **routes, not
  aperture** — a fact about the graph, not the geometry. Two gates per border is
  the shipped default because of this table.
- **The pond is genuinely less mixed.** Room changes per 10,000 creature-turns:
  27.9 → **4.7** (seed 314), 16.0 → **5.6** (13), 27.4 → **5.9** (77).
- **Isolation by distance, for the first time in this project.** Creatures in
  different rooms are **+0.177** further apart genetically than creatures in the
  same room (median, twelve seeds), against **+0.036** for the *same run*
  partitioned by lines drawn half a room over from the real walls, and +0.030 for
  an unwalled pond measured against the real lines. The within-run control is the
  one that matters: it cannot inherit v1.47's shared-baseline problem, because
  there is no second run for it to share a baseline with. The unwalled figure is
  not zero — this pond has always had a little spatial structure — so rock
  multiplies an existing signal about sixfold rather than creating one.
- **Net displacement is the wrong instrument** and is reported here so nobody
  reaches for it again: over 600 ticks it moved in *both* directions across seeds
  (95→123 px on seed 1, 98→95 on seed 7), because 600 ticks does not carry a
  creature across a room in either arm.

### Fixed

- **A sealed room, found before it shipped.** Gates were first placed
  independently per wall, and the new flood-fill invariant failed on the second
  seed it tried: on seed 77 both north-south gates landed in the same east-west
  band, leaving one of the four rooms with no door and 26% of the pond an
  aquarium. Gates are now placed **per room border** — one in every band a wall
  crosses — which makes the room graph the full grid and the pond one pond by
  construction rather than by luck.

### Changed

- `src/palette.js` gains `barrierRock()`, audited at **ΔE 29.7** against every
  ground either view can draw (both seasons, biome glow, the whole terrain ramp
  with and without contours, full enriched ground, five overlapping hazard cases)
  under all four vision models, with the four-steps-darker failure pinned beside
  the pass. The note there originally claimed a warm stone was impossible; the
  search says otherwise (a pale sandstone scores 35), so the note now gives the
  reason for a cool stone as the judgement it is — the two other warm layers down
  there are both fertility claims.
- `src/levers.js` learns the four new constants, including that a *count* of
  gates needs an explicit target rather than the generic ×0.7 nudge, which would
  have rounded 1 back to 1.

## [1.47.0] — 2026-08-02

`world.step()` sweeps its population one creature at a time, and the array it
sweeps is birth order — survivors keep their places, newborns are appended. So a
founder sits near the front of the queue for its whole life, and **every contest
inside a tick is settled by seniority**. Nothing here was designed that way; it
falls out of a `for` loop, and forty-six versions of this file never said so.
v1.45 fixed one bug living inside that loop and named the general shape as the
open question. This is that question, measured.

### Added

- **`stats.contested`** — turns in which a creature had a pellet inside its own
  eating reach, found it already eaten by somebody earlier in the same tick, and
  ate nothing. Free and exact: an `eaten` pellet still in the array can only have
  been taken this tick, and the scan is walking it anyway.
- **`stats.crowdedOut`** — turns in which a creature was full enough to split and
  was refused because the pond had already reached `populationMax`. The sharper
  of the two: a lost pellet is one meal, a refused split is a lineage that never
  starts.
- **`shuffleTurnOrder`** (opt-in, off by default) — a fresh Fisher–Yates order
  each tick. Not a fairness fix, because there is no "off": somebody has to go
  first. It is the **scrambled arm** the v1.27 rule demands as the control for a
  rule that decides *who* goes first.
- **`test/turnOrder.test.js`** — ten tests, the first six staged in a single
  tick with two creatures and one pellet rather than waiting for a collision in
  a real pond.
- **The rule, written down**, at the top of `src/world.js`: the sweep is
  sequential, its order is birth order, and the three things that deliberately
  step out of it (contagion on pre-move positions, a call heard as it was
  emitted last tick, newborns waiting for the next one).

### Measured

- **4.50% of every meal the pond takes is taken out from under somebody** who
  was standing in reach and went hungry — 8,021 of 178,354 meals over twelve
  seeds at 9,000 ticks, ranging 2.45% (seed 512) to 8.04% (seed 1234), one lost
  meal every 7–28 ticks.
- **The other mechanism never fires.** `crowdedOut` is **0 on every one of the
  twelve seeds, in both arms**: `populationMax` is 650 and a default pond peaks
  near 300. The sharper of the two things the order decides is mute in the only
  world anybody looks at — `kinRecognition` (v1.36) again.
- **What the order is worth in aggregate: nothing this instrument can see.**
  Shuffling moved the mean population +3.2% (median +4.1%, 10/12 seeds up, range
  −47.1…+31.3%). A control arm that burns the same *n−1* draws and then hands
  back the **unchanged** array moved it **+11.8%** (9/12 up), and an arm burning
  one wasted draw per tick — no mechanism whatsoever — moved it +4.6% (7/12 up).
  All three arms are doing the same thing: dealing the pond a different hand.
- Shuffling does not reduce the collisions either: 668 lost meals per run with
  the fixed order, 668 shuffled. The order does not create the contests. It only
  makes sure they always go the same way.

### Changed

- The **Shuffled turn order** toggle joins the controls panel and the permalink
  (`ord`), like every opt-in before it.

## [1.46.0] — 2026-08-02

The colour audit that has run since v1.25 had never opened the Tree of Life —
the figure this project's headline claim is made of. What it found there is not
a pair of tones chosen badly. A species' colour is its founder's hue, hue is an
inherited gene, and so the plot has been drawing daughters in their parents'
colour since v1.2: the default pond puts **four of its eleven bands at hue 335**,
and seed 88 puts **six of nineteen at hue 106**. ΔE 0.0 — not nearly the same
colour, the same colour. The legend calls them different species and gives them
one dot.

### Added

- **Every Muller band wears a hatch** — plain, `/`, `\`, `|`, `—`, `×` or `+` —
  clipped to its own band, drawn as one path and one stroke however the band is
  shaped. **The legend chip wears the same one**, from the same definition, so
  the key and the thing it keys cannot drift apart.
- **`bandTextures()` in `src/mullerplot.js`**: a greedy colouring of the
  collision graph, walked in stacking order. A pair costs *how many* of the four
  vision models cannot separate it, so an identical-colour pair (cost 4) is
  always broken before a dichromacy-only one, and neighbours in the stack get a
  nudge apart even when their colours are fine. `collisionCost()` memoises the
  CIE work on the rounded hue pair, keyed on the whole of its input so there is
  nothing a stale entry could be about.
- **`lineageFill()`, `lineageBandRgb()`, `bandHatch()` and `HATCH_ALPHA` in
  `src/palette.js`**, and eight new tests across `test/mullerplot.test.js` and
  `test/palette.test.js` — including the pinned failure (two hues one degree
  apart are not a distinction under any vision model) and the pinned shortfall.

### Measured

- **Eleven of twelve seeds draw at least one pair of species in the same
  colour**, and the exception has only two bands. 128 bands over twelve seeds,
  **194 pairs at ΔE 0.0** under normal vision.
- **Colour could not have fixed it.** Walking the hue wheel greedily for hues
  that clear `MIN_DELTA_E` pairwise gives **16** usable lineage colours under
  normal vision, 12 under tritanopia, 9 under protanopia and **7** under
  deuteranopia. The plot has drawn **19** bands at once. Colour runs out before
  the pond does, with a palette chosen perfectly — and this one is inherited,
  not chosen.
- **What the hatch buys:** of those 194 identical-colour pairs, **5 still share
  a hatch** — ten of twelve seeds fully separated, including the default. The
  residue is seed 88 (nineteen bands, needs eleven hatches, gets seven) plus one
  pair on seed 42. Seven is not enough in general; the code degrades to the
  least-bad clash and the number is stated rather than rounded off.
- **The hatch reads on every hue a lineage can take:** one dark tone rather than
  the usual two, because this is the first mark audited here whose background is
  *not* chosen by the world — a band is always 55% lightness. Swept over all 360
  hues, both undimmed band styles, all four vision models: worst case **26.6**
  against a bar of 25.

### Changed

- **The legend dot's colour comes out of `palette.js`.** It had carried a
  hand-written `hsl(hue, 70%, 55%)` in `main.js` since v1.2 — one point of
  saturation away from the `68%` of the band it was a key to. The v1.26 rule (a
  colour a test cannot reach is a colour that will drift), proven on the surface
  whose job is naming lineages.
- The chip's dot is 14px rather than 12px, so a hatch has room to show a
  direction. Size costs nothing and survives every vision model.

### Notes

- Observation only: not one random draw moved, `test/fingerprint.test.js` still
  holds the default pond to its v1.36 hashes, and the plot's existing "drawing
  the Tree of Life changes nothing about the world" test now covers the hatch
  too. A dimmed band's hatch dims with it, deliberately — the spotlight exists
  to push the other bands towards the background.
- `docs/screenshots/phylogeny.png` still shows the pre-v1.46 plot; screenshots
  here are captured by hand.

## [1.45.0] — 2026-08-01

v1.44 found, by accident, that the update loop has no `dead` guard on the
creature it is updating: death is marked at the top of a creature's turn and the
body is not swept until the end of the tick, so grazing, biting and reproduction
all happen in between. It measured that and deliberately left it alone, because
correcting it deals every world a different hand. This release corrects it, as an
opt-in flag with the measurement attached — the `exactVision` shape from v1.32.

### Added

- **`deathIsFinal` (opt-in, off by default): a dead creature takes no further
  turn.** One guard at the top of the per-creature loop, catching a body bitten
  to zero by a predator that updated earlier in the same tick, and one straight
  after `act()`, catching a creature that has just starved or aged out paying its
  own last bill. Note what this *isn't*: every other `dead` check in `world.js`
  already existed — a corpse is skipped as prey, as a neighbour, as a mate and as
  an infection source. The pond has treated a body as gone since v1.0. The only
  one who disagreed was the body.
- **A "Death is final" toggle**, a `fin=1` permalink parameter, a README row and
  a twelve-seed write-up in `docs/SCIENCE.md`.
- **`test/deathIsFinal.test.js`.** The first three tests *stage* the bug in an
  empty pond — a creature starving on top of a pellet, a creature ageing out
  holding enough to split, a body marked dead before its turn — so each arm is
  one tick and neither can flake. Waiting for the real thing takes 20,000 ticks.

### Measured

- **What the dead were actually doing**, twelve seeds × 20,000 ticks, flag off:
  they ate **7–13** pellets per run, took **7–302** turns while already dead, and
  reproduced **once across all twelve runs**. They bit something **zero** times —
  the most plausible-sounding item on the list never happened once, because a
  posthumous bite needs a dead carnivore with a target in reach *and* its
  cooldown expired. The +6.4 predated burial v1.44 reported on seed 512 was a
  body that had been bitten to zero and then grazed.
- **The books close differently, and exactly.** With the flag on,
  `energy_buried_predation` is **0.00 on every one of twelve seeds** — a theorem,
  not a coincidence: a bite takes `min(prey.energy, biteEnergy)` and only kills
  when that minimum was the whole of it, so a killed body sits at precisely zero
  and nothing can touch it afterwards. Starvation goes from positive on nine of
  twelve seeds (up to +61.5, energy eaten after death) to negative on all twelve
  (−31 to −162), which is the overdraft it should be.
- **What it does to the pond: nothing measurable.** Mean population is +5.8%
  with the flag on, ten of twelve seeds positive — and the between-seed standard
  deviation is 28.0 against a mean difference of 12.3, with one seed carrying a
  third of it. Twelve pairs is enough to say the effect is not large and not
  enough to say which way it points (the v1.32 rule about seed-matched pairs).
- **The correction is rare, not subtle.** The two arms run bit-for-bit identical
  for *thousands* of ticks and then part at the first posthumous act — tick 2,963
  on seed 77, 3,587 on seed 314, and four of eight seeds tried were still
  identical at 4,000.

### Changed

- **`test/fingerprint.test.js`'s "every opt-in feature is a lever when it is on"
  sweep skips `deathIsFinal`**, alongside `kinRecognition`, for the honest
  reason: its 1,000-tick budget cannot see a difference that has not happened
  yet. The comment says so and points at the test that stages it in one tick.

### Notes

- Off by default and free when off: no branch taken, not one random draw moved,
  and `test/fingerprint.test.js` still holds the default pond to its v1.36
  hashes. The suite's whole-config sweep — "no opt-in feature costs anything
  while it is off" — picked the new flag up on its own, which is what reading the
  flag list out of the config was for.

## [1.44.0] — 2026-08-01

Two stacked bars have sat six lines apart in the control panel since v1.29 —
*what they die of*, and *where the energy goes*. They are drawn in deliberately
related colours, they are two pictures of the same pond spending itself, and
nothing had ever asked whether they agree. They cannot: one is a mix of events
and the other a mix of quantities. The column where they touch was a single
number, so the question had nowhere to be asked.

### Added

- **`energy_buried` is split by what killed the body.** The ledger's `bury()`
  takes the cause the mortality counters were just handed one line above it, so
  the two books are demonstrably reading the same corpse. Over twelve seeds and
  20,000 ticks each: starvation is **76.6% of deaths and 0.2% of the energy the
  dead take with them**; old age is **15.8% and 99.8%**. Per body that is
  **+0.025 against +70.164**, a factor of nearly three thousand. It is
  structural, not statistical — starvation and predation both end at
  `energy <= 0` by definition, so those bodies are empty and the pond had
  already spent them under `metabolism`.
- **A third line under the mortality bar**, saying what one death of each kind
  buries. The first and third round to zero, which is the finding.
- **`energy_buried_starvation`, `_age` and `_predation` in both CSV scopes**,
  cumulative like the rest of the books, so differencing any two rows gives
  exactly what each cause buried in between however far the archive has thinned.
- **`deathCosts()` in `src/stats.js`** and **`buriedField()` in
  `src/energy.js`** — the arithmetic and the column name, both pure and both
  reachable by a test, rather than a calculation living in `main.js`.
- **`test/deathCost.test.js`**, which pins the structural claim rather than the
  numbers: every burial charged to old age is strictly positive, no burial
  charged to the other two exceeds a single meal, and the per-body gap is at
  least a hundredfold. A test that can only measure noise teaches a future
  reader the wrong lesson about which of the two is fragile.

### Fixed

- **A total that could disagree with its parts is now unrepresentable.**
  `buried` is a getter over the per-cause map rather than a second running sum,
  so there is no accumulator left to drift — the v1.29 rule about derived
  columns, finally applied to the one stored field that had parts. An
  unlabelled burial lands in its own `unattributed` bucket instead of quietly
  joining a cause that did not earn it.
- **`Stats.sample` no longer reaches into the ledger's internals.** The books
  write their own columns in `snapshot()`; the recording path reads, and only
  reads. The v1.35 test that steps a world against a ledger recording nothing
  caught the first version of this, which is exactly what it is for.

### Notes

- **The dead still eat.** Starvation's per-body figure came out *positive*,
  which a body that died at zero should not be able to manage. The update loop
  has no `dead` guard on the creature it is updating: `act()` marks the death at
  the top of a creature's turn and grazing, biting and reproduction all happen
  later in that same turn, with the sweep not until step 5. So 0.3–0.7% of
  starved bodies eat the pellet they are lying on; a predated body on seed 512
  is buried holding +6.4; and a creature can reproduce posthumously (1 birth in
  2,191 on seed 314, 0 in 2,015 on seed 42). Every `dead` check in `world.js` is
  on some *other* creature — as prey, as a neighbour, as an infection source.
  Nothing checks the actor. Measured and written up in `docs/SCIENCE.md`, and
  **not fixed**: correcting it deals every world a different hand, so by the
  v1.32 rule it would have to arrive as an opt-in flag with its own measurement.
- Bookkeeping only: no new random numbers, no new dependencies, no simulation
  behaviour changed. `test/fingerprint.test.js` still holds the v1.36 hashes for
  the default pond.

## [1.43.0] — 2026-08-01

Three times now this project has found a mark drawn additively over a creature's
own body and discovered it was invisible: the predator core in v1.25 (ΔE 2.8),
the sick halo and the immune ring in v1.34 (11.0 and **0.2**). Each time I wrote
the rule down — *a translucent mark over something the simulation colours is not
a colour, it is a lottery* — and each time I measured the mark I had come for and
stopped. Two marks were still doing it, and one of them sits nine lines below the
comment explaining why the halo stopped.

### Fixed

- **The signalling rings are legible now.** Warm for a positive call, cool for a
  negative one, both single translucent tones drawn with `lighter` since v1.20.
  Over open water they were fine; on a creature's own chevron the worst case is
  **ΔE 8.1**, and where a neighbour's glow lands on that chevron the channel is
  already clamped — adding light to it changes nothing at all, **ΔE 0.0**, the
  mark bit-identical to its background. They are opaque and two-toned now, a
  bright ring over a dark hairline, worst case **43.3** and **39.5**.
- **Loudness moved from the opacity to the geometry.** The old alpha was
  `0.1 + 0.4 × loudness`, so the quietest audible call scored **15.1 even over
  open water** and missed the bar on 89% of backgrounds there: the mark spent
  exactly the contrast it needed in order to report that it was quiet. The inner
  ring is fixed and the outer one steps outward with the call, which no vision
  model can take away.
- **The attack flash is legible now.** `rgba(255, 120, 90, 0.6)`, additive, drawn
  at the nose — which is to say drawn on the *body*, not the water. Worst case
  **ΔE 5.4**, below the bar on half the bodies this pond can produce and 0.0 with
  a neighbour's glow over it. Body lightness rises with energy, so the mark for
  the single event the predator/prey story is made of was faintest on the
  predator that had just fed. Opaque and two-toned, worst case **33.1**, same
  size and same four ticks.

### Added

- **`signalRing()`, `attackFlash()` and `SIGNAL_QUIET` in `src/palette.js`**, so
  both marks are constants a test can reach rather than string literals in
  `render.js` — the v1.26 rule about colours the suite cannot see.
- **A background set the audit never had.** Every sweep since v1.25 has measured
  against the water: the seasonal veil, the hazard field, and the creature's
  additive *glow* over them. Neither of these marks is drawn there. The new set
  is the creature — the opaque chevron at every hue, energy and signal state, and
  that chevron with a neighbour's glow added over it, which is where an additive
  mark runs out of headroom. Both failures are pinned as tests, so restoring
  either colour turns the suite red.
- **`test/render.test.js` checks the drawing, not only the constants**: that both
  tones of each mark reach the canvas, that the old translucent styles do not,
  and that a louder call moves an arc rather than a colour.

### Notes

- Colour comes out the *other* way from v1.34 here, and both halves are worth
  stating. Two opaque tones I choose separate the sign of a call by **ΔE 63.4**
  under the worst vision model, where two additive ones over a shared background
  collided at 0.0 — so the sign can be a colour. Telling a call from a symptom
  cannot: the cool ring meets the immune ring at 9.6 and a creature can wear
  both. That distinction is geometry, as in v1.34 — a call is two concentric
  rings, drawn outside every other mark on the body, and every other mark is one.
- `docs/screenshots/signalling.png` still shows the pre-v1.43 rings. Screenshots
  here are captured by hand, and naming the one surface this release makes stale
  beats leaving it to be noticed.
- Rendering only: no simulation behaviour changed, no new random numbers, no new
  dependencies. `test/fingerprint.test.js` still holds the v1.36 hashes for the
  default pond.
- **The deploy workflow's own readout was lying, and one release paid for it.**
  Verifying the deploy turned up six consecutive releases where the mirror push
  to `main` produced a failed run — the `github-pages` environment only accepts
  the default branch, so that job could never succeed — and one release,
  a47f58b, where the run that *would* have deployed was cancelled two seconds
  after creation because both pushes shared a workflow-level `pages` concurrency
  group and the newer run superseded the queued one. The deploy job now skips on
  any branch that is not the default, and the concurrency group sits on the job
  instead of the workflow, so only runs that can deploy contend for it.

## [1.42.0] — 2026-08-01

The Tree of Life is the view this project leads with — the landing page's third
promise, the thing a Muller plot is *for* — and it was the last figure here with
no test of any kind and the last canvas on the page with no accessible name. It
makes one claim an eye cannot check: the bands tile each column exactly and sum
to at most the whole pond. Walking the drawing found where that stops being true.

### Fixed

- **An extinction is no longer drawn as a thriving pond.** The shares were taken
  over `Math.max(1, snapshot.total)` — a guard against dividing by zero — so a
  window in which nothing was alive produced `1 − 0` for the grey "other" band
  and filled the column floor to ceiling, which is the picture of a pond made
  entirely of lineages too small to name. A window with no pond now draws no
  band, and the stack pinches shut where the world did. Reachable with
  `autoReseed` off, which is how the headless experiments in `SCIENCE.md` run.

### Added

- **`test/mullerplot.test.js`**, the recorder from v1.40 on its third surface.
  It walks the recorded path and checks each band's own edges against the share
  its species held, column by column — the per-element form, because an
  aggregate ("the heights add up") is satisfied by a gap on one side paying for
  an overlap on the other. Plus: even spacing across the full width, that
  highlighting repaints without moving one coordinate, and that drawing the
  figure moves neither the world nor the RNG.
- **An `aria-label` on the Tree of Life**, via `describeMuller()`. The pond got
  a voice in v1.31 and the chart in v1.41; this canvas still said the word
  "muller" to a listener, while the two text lines beside it described
  everything about the record except what is in it. It names who holds the pond
  now, in shares that add to 100 by largest-remainder rounding, and what the
  largest lineage was worth when the record began — the whole-run comparison an
  eye makes for free. It says "did not exist when the record began" rather than
  "0%", and an empty window is spoken as empty.

### Changed

- **`mullerShares()`** carves the plot's arithmetic out of its drawing, the way
  `chart.js` was carved out of `main.js` one release earlier: the shares are the
  claim, and a claim wants a test. The picture and the sentence are now built
  from the same numbers, so they cannot drift apart. Shares are `Float64Array`
  rather than `Float32Array`, which is what lets the tiling be asserted exactly
  rather than to a tolerance.

### Notes

- Zero new dependencies, no simulation behaviour changed, no new random numbers:
  `test/fingerprint.test.js` still holds the v1.36 hashes for the default pond.

## [1.41.0] — 2026-07-31

v1.22 gave the population chart an x-axis caption and wrote down why: *a chart
whose x-axis silently changes meaning is worse than one with no axis at all.*
One axis over, unmentioned, the y-axis had been doing exactly that since v1.0.
The population line is normalised to the run's own record, and the record grows
— so the moment the pond sets a new high, every point already on screen drops,
retroactively, and nothing says so. A line at half height means 100 creatures
early and 150 later, and the two pictures are identical. This release gives the
figure a scale.

### Added

- **A y-axis on the population chart.** The line is drawn against a *round
  ceiling* at or just above the run's peak rather than the peak itself, with a
  labelled gridline at each step. Two things follow: the axis can be labelled
  with numbers a reader can hold, and it now moves in visible steps — a run
  climbing from 240 to 260 no longer redraws its own history, and when the
  ceiling does go 300 → 400 the labels say so.
- **`src/chart.js`**, and with it the third panel carved out of `main.js` (after
  `describe.js` and `gestures.js`) so the suite can reach it: the scale, the
  grid, the two lines and the whole-run envelopes, all pure. `test/chart.test.js`
  puts the recorder from v1.40 on a second surface and checks that the y a
  gridline is stroked at is the y its label's value maps to — the claim the whole
  release rests on — plus that drawing the figure moves neither the world nor the
  RNG.
- **An `aria-label` on the chart**, via `describeChart()`. The two strips under
  it have been spoken since the releases that built them; the figure they hang
  off — the oldest view in the project — said nothing, so a listener got the
  commentary and not the picture. It carries both current values *and* both
  scales, because "214 creatures" without a ceiling is precisely the number the
  drawing failed to give.
- **A both-sided colour bar.** `MIN_RULE_DELTA_E`/`MAX_RULE_DELTA_E`: a gridline
  is furniture, not a mark, and this is the first colour here that can fail for
  being too **loud**. It is checked as visible (above two just-noticeable
  differences from the panel), as subordinate (below "a different colour at a
  glance"), and as quieter than both lines it sits under, under every vision
  model. The axis numbers spend no new colour at all — they are the population
  line's own, which is what tells a reader which of this figure's two scales the
  marks belong to.

### Changed

- The three stacked figures share a 22-pixel **axis gutter**, so the labels sit
  beside the plot rather than over it — nothing the pond did is hidden under a
  piece of furniture — and the chart, death strip and power strip still share
  one x-axis to the pixel.
- The food line's scale is stated in the legend (`0–520`) instead of marked. It
  is `config.foodMax`, a constant: a scale that never moves needs a word, and a
  scale that moves needs marks.
- The axis labels are DOM text, not canvas text. This backing store is 300 px
  wide and stretched to the column, which on a phone is three times that —
  v1.28's lesson, paid before rather than after.

### Notes

- Zero new dependencies, no simulation behaviour changed, no new random numbers:
  `test/fingerprint.test.js` still holds the v1.36 hashes for the default pond.
- Checked at 1280 px and at 390 px.

## [1.40.0] — 2026-07-31

v1.38's constant sweep found `foodRadius` — the size of a food mote — alive in a
scavenging world, and filed it as a simulation constant that needed an unusual
world to bite in. It was telling the truth about a coupling and had no
vocabulary for what the constant *is*: `world.js` had borrowed a drawing radius
for the one rule in the pond that needed a corpse-sized distance. This release
gives the rule its own constant, gives the sweep a channel for the picture, and
in building that channel gives `render.js` — 575 lines, the whole look of the
thing — the first tests it has had since v1.0.

### Added

- **`src/rendershot.js`**: a 2D context that records instead of painting. Every
  method `render.js` calls, in order, with its arguments — including the pixels
  pushed into the offscreen terrain and soil layers, which are blitted with
  identical arguments whatever they contain. From that stream, `renderFingerprint`:
  a fourth channel next to the state, the trajectory and the observation.
  Deliberately **not** a golden constant — a render hash moves when a colour is
  nudged or a mark grows a pixel, which is v1.36's over-sensitive-instrument
  lesson, so it is for comparisons inside one run.
- **`test/render.test.js`**, and the claim it opens with is the one `render.js`
  has made in prose since v1.0: *rendering is entirely read-only.* Hash the
  world, draw it, hash it again — all three channels, plus a count of the random
  numbers drawing draws (zero). Also: the same world twice is the same picture,
  the default view is drawn through the exact identity, and — the audit that had
  never crossed the gap between `palette.js` and the canvas — **the tones the
  colour audit measures are the tones the renderer actually strokes**, the sick
  halo, the immune ring and its dashes, the predator mark, the contagious zone.
- **A `draw` channel in the constant sweep.** `foodRadius` is the whole
  category, and it is asserted in both directions: it must move the picture, and
  it must leave the pond bit-for-bit identical for the whole budget. A drawing
  number steering the simulation again is now a test failure.

### Fixed

- **A scavenger's reach was a drawing radius.** From v1.8 to v1.39,
  `world.js` set how close a scavenger must get to a corpse with
  `c.radius + cfg.foodRadius + 6` — so making the food motes prettier would have
  quietly changed what a scavenger could reach, and the constant sweep would have
  reported the visual tweak as a simulation change with no way to say why. The
  reach is `cfg.scavengeRadius` now, at the same value 3, so **every scavenging
  world is bit-for-bit what it was**. The trailing `+ 6` is deliberately not
  folded into the new constant: `(r + 3) + 6` and `r + 9` disagree in the last
  bit for 1.1% of body radii (measured, 5M samples), and this sum feeds the
  comparison that decides whether a bite lands.
- `docs/SCIENCE.md`'s account of the sweep, which described the coupling as a
  property of `foodRadius` rather than as a bug in `world.js`.

### Notes

- **A sweep with no channel for a thing calls that thing something else.** This
  is v1.38's own lesson — an instrument only ever answers in its own vocabulary —
  arriving one release later against the instrument that taught it. The sweep
  could see that `foodRadius` reached the pond and could not see that it had no
  business doing so.
- The reach is a genuine lever and a weak one: over twelve seeds at 6,000 ticks,
  tripling it changes the pond less than the spread between seeds. The
  measurement is in `docs/SCIENCE.md`.
- Zero new dependencies, no simulation behaviour changed, and the default pond is
  untouched: `test/fingerprint.test.js` still holds the v1.36 hashes.

## [1.39.0] — 2026-07-31

The energy books have been kept since v1.29 and readable as a rate since v1.35,
and in ten releases nothing ever drew them. Power had a stat tile, eight CSV
columns and a bar of run-to-date shares; the chart, the one surface in this
project where a quantity can be seen *changing*, had no line for it. This
release draws it — and then measures whether the drawing supports the claim it
invites, which it does not.

### Added

- **The power strip**, under the death strip and on the same x-axis and
  recent/whole scope: what the pond mints per tick as a continuous line, what it
  spends as a dashed one, with the band between them filled. The band is the
  point. `created − destroyed = standing` is an identity, so the gap is not a
  comparison of two statistics — over any interval it *is* the change in the
  energy standing in the pond, and `test/energyHistory.test.js` now holds that
  at both the per-sample rate and the 120-tick mean the strip is drawn from.
- **`energySeries(hist, window)`** — a trailing mean rather than a per-sample
  rate, at the default of 1 exactly the old behaviour. The strip uses
  `POWER_WINDOW`, the same 30 samples the live Power readout differences over,
  so the right-hand end of the line is that readout rather than a cousin of it.
  Also `overall`, the flat rate across the whole window on screen, which is what
  a caption needs and what overlapping intervals cannot be summed into.
- **`describePower()` in `src/describe.js`**, with tests: the peak, the window
  it is a mean over, and the sentence a screen reader gets. Three states that a
  warming-up readout usually conflates — nothing has moved, the first window has
  not filled, and here is the rate — say three different things.
- **`panelBackground()`, `chartLines()`, `powerLine()` in `src/palette.js`.**
  The new colour is measured against everything it shares a figure with — the
  panel, both chart lines composited, the three cause colours, the three sink
  colours — under all four vision models: worst case **40.0** against a bar of
  25. The two lines are *one* colour separated by dashing, the v1.34 rule
  applied before it costs anything rather than after fourteen versions of an
  invisible ring, and a test refuses a second hue.
- **docs/SCIENCE.md: "The power strip: an exact quantity that forecasts
  nothing".**

### Notes

- **The gap does not predict the population, and the control is what says so.**
  Twelve seeds, 20,000 ticks: the sign of the gap agrees with the pond's next
  move 60% of the time — better than a coin, and far worse than the free
  information already on the chart above it, since the population's own previous
  move agrees 86% of the time. The stock moves by about 6% of throughput; the
  momentum swamps it. So nothing narrates the band, and the strip is labelled as
  what it is. The Chronicle line that would have written itself here — *the pond
  is running down* — is the v1.20 alarm-call mistake waiting to be made again.
- **A mean is not free even when the arithmetic is exact.** At four ticks a
  single pellet is worth six energy per tick, so the per-sample line is a
  picture of pellet arrivals and one spike sets the scale for the whole strip.
  Widening the window costs nothing in accuracy — differencing a cumulative
  counter over any span is exact — but it damps peaks, so the caption carries
  the window with the number, and intervals shorter than a full window are not
  drawn at all rather than drawn at a different resolution from their
  neighbours.
- The two chart lines that have been drawn since v1.0 moved into `palette.js`
  unchanged, with a test that rebuilds the measured tone from the string the
  canvas actually strokes. They were the last colours in the sidebar that no
  test could reach.
- Nothing in the simulation changed: the strip reads history the world was
  already recording. All 440 tests pass, `test/fingerprint.test.js` included.

## [1.38.0] — 2026-07-31

v1.36 asked whether every opt-in *flag* in this project does anything, and left
the obvious sibling unasked: `config.js` holds seventy-nine *numbers*, and both
times one of them has turned out to be doing nothing — `detritusPerRadius`
clipped by a cell cap (v1.27), `energyMax` above an unreachable threshold
(v1.29) — it was found by accident. This release sweeps all seventy-nine, and
the sweep immediately corrected one of the two findings that motivated it.

### Added

- **`src/levers.js`**, the constant sweep: every numeric key in `DEFAULT_CONFIG`
  is moved once, in a world where it is live, and the pond must move. The key
  list is read out of the config rather than written down, so a constant added
  in a later release is swept the day it lands — and fails loudly if it needs a
  world of its own, which is the intended way to discover that.
- **A third fingerprint, `observationFingerprint`** — the species tree and the
  abundance record behind the Muller plot. Four constants (`speciationDistance`,
  `neatCompatThreshold`, `phylogenySampleInterval`, `phylogenyHistory`) are
  levers on the view and on nothing else, and a sweep watching only the state
  hash calls all four dead. They are now asserted on both channels at once: each
  must move the tree, and each must leave the pond bit-for-bit identical — the
  first test this project has had of `phylogeny.js`'s oldest claim, that
  observation never feeds back into the simulation. `stepsPerFrame` gets the
  mirror image: it must move neither.
- **`test/levers.test.js`**, and in it the exceptions pinned as claims in their
  own right: the two bounds that never bind, the clamp that fires only when the
  ceiling is brought down to the reproduction threshold, and the constant with
  no reach in the default pond at any value.
- **docs/SCIENCE.md: "Is every number in `config.js` a lever?"**

### Fixed

- **`energyMax` was never only a clamp, and three places said it was.** v1.29
  measured the energy ceiling and found it unreachable — a creature splits at
  `reproduceThreshold` (160) before it can fill to 220, so the pond spills
  exactly zero — and wrote the conclusion up as "a parameter with no effect
  whatsoever… you could set it to 10,000 or delete it and nothing would move."
  The sweep moved it and the pond moved on **tick one**: `creature.js` feeds the
  brain `(energy / energyMax) * 2 - 1`, so the constant is also the divisor of a
  creature's sense of its own energy, and `render.js` shades a body by the same
  fraction. The measurement was right and the sentence around it was wrong.
  Corrected in `config.js`, `docs/SCIENCE.md` and `test/energy.test.js`, and
  both halves are now pinned by a test that fails if either changes.

### Notes

- **A one-sided nudge measures one side.** The first pass raised every constant
  by 37% and reported fourteen dead. `populationMax` and `weightClamp` are
  bounds the pond never reaches, so raising them *cannot* do anything; lowering
  them bites at t482 and t1. The sweep pushes both ways now.
- **What the live half of `energyMax` is worth**: twelve seeds, 6,000 ticks —
  mean population 212 at the default and 242 at 301, but with a between-seed sd
  of 61 against a paired difference of 29, and seed 23 reading 224 / **16** /
  224 across the three arms. That is a different hand dealt, not a
  dose-response curve. One thing is monotone and real: at `energyMax` = 160 the
  ceiling meets the reproduction threshold and the pond finally spills, up to 6%
  of everything it makes.
- **`speciationDistance` is nearly out of road.** The default pond records five
  speciation events in 6,000 ticks at 0.15 and **zero** at 0.20 — above which
  the Tree of Life is a flat comb of the forty founders across a twentyfold
  range of the parameter. The view everybody looks at is being observed from
  close to the edge of its instrument's useful range.
- **`foodRadius` is load-bearing.** A drawing radius that also sets how close a
  scavenger must get to a corpse, which is why it looks dead in any world with
  scavenging off.
- Nothing in the simulation changed. `src/levers.js` and the new fingerprint are
  instruments — nothing in the tick loop calls them — and the only edits to
  simulation code are comments. `test/fingerprint.test.js` confirms the default
  pond against the constants recorded in v1.36.

## [1.37.0] — 2026-07-30

Terrain shipped in v1.23 and detritus in v1.27, and neither ever got a door. Ten
curated worlds, and the two mechanics about *the ground* were reachable only by
finding two checkboxes — which, on a page with thirteen of them, means most
visitors have never seen either. This release earns a seed for them.

### Added

- **🏔️ The Lay of the Land**, an eleventh curated scenario: rough ground that is
  expensive to cross and nearly barren, plus a pond whose dead enrich the hollows
  they fall in. Seed 13 was earned by a 48-seed sweep scored on the two things
  such a world needs — a landscape with visible relief and a pond that
  demonstrably settles into it. Its terrain is the most contoured of the field
  (roughness sd 0.318 against a 0.214 median, 26% above the runner-up); over
  20,000 ticks it holds a ground bias of -0.111 and a crop bias of -0.048, never
  drops below 44 creatures, evolves a working predator lineage (361 kills, 88%
  carnivore), and grows a quarter of its crop out of its own dead.
- **docs/SCIENCE.md: "A seed where the control reads nothing at all"** — why this
  seed rather than a prettier one. The terrain write-up has carried a caveat
  since v1.23: on the default seed 314 the *terrain-off* control already reads
  -0.034, because that world's biomes happen to sit in ground the roughness field
  also calls flat, so some of its settling is coincidence rather than mechanism.
  On seed 13 the movement-tax-only arm reads **-0.003** — nothing — against the
  shipped arm's -0.111. Every bit of the settling in this world is the barren
  ridges moving the crop, which makes it the cleanest single-seed demonstration
  of the v1.23 result in the repository.
- **A test that pins the claim the blurb makes**, not just the world's existence:
  the scenario's run-averaged ground bias must be at least three times the
  tax-only arm's on the same seed. A curated world whose *character* is a
  measured claim should fail out loud if the claim stops being true.

### Notes

- **The seed chooses how strong the mechanic is, not only how it looks.** Across
  the 48 sweep candidates, a landscape's relief correlates with settling at
  **r = -0.50** — a more contoured world settles its pond harder. The sweep was
  not scored for that, and it is the mechanic's own prediction falling out of a
  sample of worlds. Relief does not predict where the crop lands (r = 0.05);
  that depends on how one landscape falls against one set of biomes, which is
  exactly the coincidence the paragraph above is about.
- Nothing in the simulation changed. A scenario is data — a seed and a set of
  overrides — so every existing world is bit-for-bit what it was, and
  `test/fingerprint.test.js` says so against the recorded v1.36 constants.
- README's scenario count had been stale since Earshot shipped in v1.20: it said
  nine worlds when there were ten, and the table listed nine names with Earshot
  missing. Both fixed.

## [1.36.1] — 2026-07-30

### Changed

- **The golden test now says which tier it ran, on every run.** v1.36.0 emitted a
  diagnostic only when the engine's math *differed*, which means a run that
  silently dropped its strongest assertion still printed a bare `ok` — the
  always-full-buffer bug (v1.22) in a test runner's clothes, and worst exactly
  where I cannot check by hand: CI, the only place the suite meets an engine I did
  not choose. It now prints the engine's math fingerprint and whether the
  bit-exact hashes were checked or skipped, either way — so the answer for the
  runner the deploy uses is now in the log of every build, which is where I could
  not see it when v1.36.0 shipped.

## [1.36.0] — 2026-07-30

This project's second prime directive is that a `(seed, config)` pair reproduces
a world exactly, and that a default world stays bit-for-bit identical to every
version before it. Thirty-five releases of tests have asserted the first half —
two worlds built in the same process agree — and *nothing had ever asserted the
second*, because a test cannot run last month's code. This release records the
number, checks it against every version in the repository's history, and
measures the one thing that could still move it: the engine's own arithmetic.

### Added

- **`src/fingerprint.js`** — a bit-exact identity for a world. Two hashes, and
  the difference between them is the design: `trajectoryFingerprint` covers
  *where everything is* (position, motion, energy, age, lineage counters,
  pellets, corpses) and is deliberately blind to how a build represents it;
  `stateFingerprint` adds genomes, brain weights and feature state, for
  comparisons inside one process. Both hash the raw 64 bits of every double, so
  one ULP in one creature's position moves them — unlike the ad-hoc `(v * 1e6) |
  0` helpers already in the suite, which are blind to exactly the drift a
  recorded constant exists to catch.
- **`mathFingerprint()`**, because `Math.sin`, `Math.tanh` and `Math.exp` are
  *implementation-approximated* in ECMAScript and the pond calls them ~4,900
  times a tick. A golden world hash is only a claim about this project *given* an
  engine's libm, so the test asserts population and food counts unconditionally
  and the bit-exact hash only when the engine's math matches the recorded one.
  `Math.sqrt` is excluded on purpose: IEEE-754 pins it.
- **`test/fingerprint.test.js`** — the recorded constants for two seeds at four
  checkpoints, plus the instrument's own guarantees: it can see one ULP of every
  field it covers, it is blind to representation on purpose, it draws no random
  numbers, and it cannot alter the world it reads.
- **Two claims about every configuration, not just one.** With each of the
  thirteen opt-in flags explicitly off, the full state hash equals the default
  world's; with each on, the world must actually change. The flag list is read
  out of `DEFAULT_CONFIG`, so a feature added in a later release is covered the
  day its flag lands.
- **docs/SCIENCE.md: "How reproducible is 'reproducible'?"**

### Notes

- **The default pond has moved twice in its life, and not once since the promise
  was made.** Replaying it under all 36 tagged versions: the trajectory hash
  changed at v1.1.0 (founders drawing extra genes) and v1.3.0 (the fertility
  field drawing before the founders), then stayed **bit-for-bit identical for
  thirty-three consecutive releases**. Both moves are from the project's first
  fortnight, before the directive was written down at v1.9.2.
- **Why two hashes, measured rather than assumed.** The strict hash moves at
  v1.4, v1.20, v1.23 and v1.33 — four releases that added a plasticity block, a
  `signal`, a `ground` and foot genes while leaving the pond's future untouched,
  because an unused gene slot draws no random numbers. A golden constant that
  gets re-recorded whenever a release adds a field is not a test.
- **A pond with a different math library is the same pond for about twenty
  thousand ticks.** Flip the last bit of every implementation-defined `Math`
  result — the scale two faithful libm implementations disagree at — and five
  seeds run 20,000 ticks with *identical populations* and a worst per-creature
  drift of 3 × 10⁻¹². Then two of the five part ways (t22,785 and t36,763); three
  had not by t60,000. Flipping one single `Math.sin` call in a whole run changes
  nothing at all: a velocity's ULP is 256× finer than the grid the position it is
  added to gets rounded onto, so almost every perturbation is absorbed, and the
  survivors accumulate diffusively until one flips a discrete decision.
- **Kin recognition has never once fired in the default pond.** Not a bug — an
  ecology. The rule spares a target within 0.05 genetic distance; seed 314 put
  106,580 size-and-diet-eligible predator/prey pairs in front of it over 20,000
  ticks and the *closest* was 0.227, because that world evolves a separate
  predator lineage that hunts genetic strangers. Seed 23 evolves the other thing
  — a near-clonal population eating itself — and there the flag fires 39,616
  times and changes the world at t4,910. One seed in five shows any effect within
  6,000 ticks. It is the one flag excluded from the "every flag is a lever"
  sweep, with the measurement written down next to the exclusion.
- Nothing here touches the simulation: one new module that only reads, and tests.
  A world with these instruments is bit-for-bit the world without them — which is
  now, for the first time, a claim this project can check against its own past.

## [1.35.0] — 2026-07-30

The pond has kept books since v1.29 and has only ever been able to say what it
did *in total*. Every number on that panel is run-to-date, which means every
number on that panel stopped moving a few thousand ticks in — the v1.22
complaint about readouts that look live and are not, arriving from the other
direction. This release puts the ledger on the chart's clock: into every history
sample, the whole-run archive and both CSV files, cumulatively, so differencing
two rows gives exactly what happened between them. Then it asks the books the
question they could never answer before, which is *when*.

### Added

- **The energy books in the record and the export.** All eight stored ledger
  fields, plus the standing stock and the residual of the accounting identity, in
  every history point and both CSV scopes. They cost nothing to carry: every one
  is cumulative and extensive, so — by the v1.26 rule — they are exact under any
  amount of the archive's thinning, with no envelope and no per-interval column.
  The three counters left over from that release (`births`, `kills`,
  `scavenged`) came along on the same terms.
- **A `Power` stat**, and it is the only number on the energy panel that moves:
  energy minted per tick over the last 120 ticks, differenced out of the
  cumulative books. On the default seed a run passes through everything from
  about 5 to about 78.
- **`energySeries()` and `spendShares()`** in [`src/energy.js`](src/energy.js),
  which read a run of history points back as a *rate* — the mirror of
  `mortalitySeries()`, and the reason recording the totals was worth doing.
  `EnergyLedger.snapshot()` writes one sample; `test/energyHistory.test.js`
  pins the arithmetic, the monotonicity, the zero-draw guarantee and the
  decimation behaviour.
- **docs/SCIENCE.md: "The books get a clock: what a run-to-date total hides."**

### Changed

- **The archive keeps two more envelopes**, on the standing stock and on the
  residual, because those two are the only *instantaneous* quantities among the
  ten and instantaneous is what decimation eats. The residual's is load-bearing:
  a break in the books is by nature a transient, and the test shows a single
  42-unit excursion at one sample in 200 surviving every halving with the
  envelope and vanishing without it.
- `EnergyLedger.shares()` is now a call to the shared `spendShares()`, so the
  panel's run-to-date bar and a windowed one are the same arithmetic including
  the negative-overdraft clamp.

### Notes

- **The pond's power swings by more than tenfold and nothing had ever shown it.**
  Twelve seeds, 20,000 ticks, read at the archive's own 128-tick resolution: the
  busiest window mints 7.9× to 22.6× as fast as the quietest (median 15.4×). One
  seed had a window that minted nothing at all, so its ratio is unbounded and is
  reported that way rather than dropped. What the cumulative bar hid was not the
  *mix* — metabolism holds 89–100% of spend in nearly every window, so the bar
  was honest about composition — it was the **scale**.
- **The arms race is a rounding error on the total and a quarter of the budget in
  the moment.** `digested` — energy that leaves the prey and never reaches the
  predator — is **0.6%** of everything a run spends, and **13.6%** of spend in
  each run's busiest window (25.4% at worst). That is the v1.21 finding in a
  second costume: the mechanic this project is named for accounts for a tenth of
  its deaths and, on average, six parts in a thousand of its energy. A mechanic
  can be negligible in the total and dominant in the event.
- **The residual is now datable, and was never measured out to a long horizon.**
  The comment in `energy.js` said drift "stays far below one pellet" and had
  never been run past a few thousand ticks. On seed 314 at 64,000 ticks, with 2.4
  million units through the books, it reaches 4.9 × 10⁻⁶ — two parts in ten
  million of one pellet. No extrapolation offered beyond the horizon measured.
- Nothing here draws a random number or writes to the world: `snapshot()` reads
  state that already exists, and there is a test that wraps the generator and
  asserts zero draws. A world with these records is bit-for-bit the world
  without them, which the v1.29 silent-ledger test still holds down.

## [1.34.0] — 2026-07-30

The pond has had an epidemic since v1.16 and has never once shown you where it
is dangerous to be. Transmission happens inside `infectionRadius` — 22 pixels,
five times a creature's own body — and no surface has ever drawn that distance:
a plague looked like scattered glowing dots rather than like weather. This
release draws it, in both views, and then asks the whole-pond question the
picture makes askable. It also measures the two marks of the disease for the
first time, and finds that neither of them worked.

### Added

- **The contagious zone.** One translucent disc of `infectionRadius` per sick
  creature, drawn over the ground and under everything alive, in the pond *and*
  on the minimap — the only surface where a whole-pond pattern is visible at a
  glance. Where discs overlap the layers compound, and they compound at exactly
  the rate the risk does: n discs of opacity a come out at 1 − (1 − a)^n, n
  infectious neighbours give a risk of 1 − (1 − p)^n. The same function in the
  new [`src/contagion.js`](src/contagion.js) serves both, so the field's opacity
  is the real per-tick risk under a monotone remap rather than a ramp that
  resembles one.
- **A `Contagious` stat**, the share of the water inside somebody's reach, and
  the same claim in `describePond()` for a listener: *"The sickness reaches 23%
  of the water."* Measured on a six-pixel grid — chosen by sweeping it, since a
  coarser one misjudged a lone case's area by 40%.
- **`hazardShare()` / `hazardSources()` / `independentAny()`** in `contagion.js`,
  with `test/contagion.test.js` pinning the arithmetic, the torus wrap, the
  monotonicity, and — the v1.32 lesson — that the fast cell walk covers exactly
  the cells an exhaustive one would.
- **docs/SCIENCE.md: "The contagious zone: is an epidemic a front or a haze?"**

### Changed

- **Both epidemiological marks, because both were invisible.** Measured as they
  were actually drawn — a translucent tone over the creature's own additive glow,
  which can be any hue at any lightness and brighter still where two bodies
  overlap — the immune ring's worst case is **ΔE 0.2** and the sick halo's is
  **11.0**. That is the v1.25 predator-core failure exactly, one ring over, never
  checked. Both are opaque and two-toned now, a bright ring with a dark hairline
  outside it: worst case **45.5** for the halo and **41.8** for the ring, over
  every background either can appear on including the new zone.
- **The immune ring is dashed**, and that is load-bearing rather than decorative.
  Colour cannot separate the two states: an additive halo reaches almost any
  bright colour, under tritanopia bright sulphur and pale blue are the same thing
  (ΔE 0.0), both marks need a dark tone, and every dark tone resembles every
  other. So the distinction lives in geometry, which no vision model touches.

### Notes

- **Clustered by a fifth — a haze with structure in it, not a front.** The zone's
  area per case is 0.804 ± 0.032 (sd across seeds) of what the same number of
  cases scattered at random over the same living population would cover, below 1
  in 11 of 11 seeds that produced an epidemic; a sharper arm that scrambles among
  the *susceptible* only moves it by half a percent, so this is transmission and
  not the shape of the susceptible pool. The effect is six times the between-seed
  spread — and it is a fifth, not a wave, for the reason v1.23 wrote down about
  terrain: a creature crosses this world a dozen times per lifetime, so a local
  rule leaves a fingerprint and cannot hold a line.
- **The zone is blue because of the food.** It wanted to be sulphur, to match the
  halo it belongs to. A hue sweep against every ground this pond can draw
  demanded three things at once — visible, not mistakable for either fertility
  claim, and *still leaving the food motes legible on top of it* — and everything
  that clears all three is hue 210–250. Sulphur clears the first two and fails
  the third at every opacity. `test/palette.test.js` sweeps the opacity to pin
  that squeeze, so nobody can "unify" the palette and quietly hide the crop.
- Nothing here draws a random number or touches simulation state: a pond with
  nobody sick — which is every world with contagion off — draws exactly what it
  drew before, and `hazardShare` reads exactly 0 there. The readout is zeroed
  unconditionally and only the *scan* is throttled, so curing the pond clears it
  in the same frame (the v1.23 stale-readout lesson).
- At peak, the zone covers 16.2% of the water at 39% prevalence: two fifths of
  the pond ill and five sixths of the water still clean, which is obvious only
  once there is a picture of it.

## [1.33.0] — 2026-07-29

Terrain has priced the ground since v1.23 over a landscape nothing could
perceive, and the write-up said so plainly: the pond settles into its basins
because the *crop* moved, not because anything learned to avoid a ridge. It also
listed perception as one of three ways to get spatial structure out of a
well-mixed world. This release builds that one and measures it, and the answer
is no: the ground sense is wired, it reaches the motor commands, and selection
is completely indifferent to it.

### Added

- **The ground sense (opt-in, `groundSense`).** One more scalar into every
  brain: the roughness underfoot, 0 on the flattest ground and 1 on the roughest
  the config prices. It is deliberately *local* — a creature is told what is
  under it, never which way is smoother — because that is the information a
  bacterium has, and run-and-tumble is enough to concentrate a population
  without a gradient. Like the ear, the foot has its own gene block outside the
  brain's weight vector, so switching it on costs zero random draws in any world
  that leaves it off.
- **`groundSway()`** — how much of a creature's turn and thrust the ground under
  it is currently deciding, on the motor scale of (-1, 1). Exactly 0 without the
  sense. It is a hypothetical put to the creature's own brain, so it runs with
  learning suppressed: `NeuralNet.forward` takes a third argument for that, and
  a test asserts a plastic brain is not taught by being asked.
- **An Underfoot row in the inspector**, showing both numbers live for the
  selected creature — what it is standing on, and what that is worth to its
  steering.
- **A spoken ground readout.** `describePond()` now says where the living are
  standing relative to the landscape whenever terrain is on. The Ground tile has
  carried that number since v1.23 and it has been visible only to an eye.
- **`docs/SCIENCE.md`: "The ground sense: perception is not a pressure"** — the
  three arms, the numbers, and the diagnosis.

### Notes

- **The wire is real and the wire is unselected.** Founders steer with a
  sensitivity of 0.257 to the ground (0.000 exactly with the sense off), rising
  to 0.367 over 9,000 ticks — which looks like selection until you run the
  scrambled arm the v1.27 lesson demands. Creatures handed the roughness of a
  *random other patch* of the same landscape, carrying no information about
  where they are, reach 0.383. The growth is mutational drift.
- **And the pond does not move.** Twelve seeds, `terrainBarrenness` at 0 so the
  crop cannot settle the pond on the creatures' behalf: ground bias goes
  -0.0074 → -0.0032, the wrong sign, with 2 of 12 seeds in the predicted
  direction. At 6× and 12× the movement cost the sign flips to the predicted one
  in 9 and 8 seeds of 12, but the between-seed spread is two to three times the
  effect. A hint, not a result.
- **Why, and it was already written down.** v1.23 measured the movement tax at a
  ground bias of -0.003 — that is, rough ground barely costs anything — and then
  offered perception as a remedy. There was never a fitness gradient for the
  foot to climb. **Perception does not create a pressure; it can only exploit
  one.** The two remedies still untried, restricted movement and a
  spatially varying resource, are the ones that change the timescale rather than
  the information.
- Off by default and an exact no-op when off: on flat ground the sense reads 0
  and `w × 0` is exactly 0, so a creature that can feel the ground behaves
  bit-for-bit like one that cannot until there is ground to feel.
  `test/groundSense.test.js` pins that, the zero draw cost at every RNG site,
  and the save migration — a pre-v1.33 genome keeps its ear and gains a silent
  foot.
- The null result itself is deliberately not a suite assertion: one world's
  ground bias at 2,500 ticks ranges over ±0.06 across seeds, so any test cheap
  enough to run would be measuring noise.

## [1.32.0] — 2026-07-29

The index was in the physics. `visionRadius` says 168 pixels; the spatial grid
that answers "what can I see?" hands back the 3x3 block of cells around the
asker, and a cell is 126. Sight has therefore been grid-aligned since v1.0 —
90% of the intended disc on average, 51% from the worst standing spot, and
guaranteed in every direction only out to somewhere between 19 and 189 pixels
depending on where a creature happens to stand. An optimisation had been quietly
serving as a rule of the world, and the overlay drew a clean circle over it.

### Added

- **Exact vision (opt-in).** `SpatialGrid.forEachWithin(x, y, radius, fn)` walks
  every cell that overlaps the disc it was asked for — ranges worked out in world
  coordinates, not cell indices, so the stub column and row at the seam are
  handled properly — and skips corner cells that are out of reach. With the flag
  on, a 10,000-glance census against an exhaustive scan returns **0 wrong and 0
  blind**, against 1.5% wrong with it off. It costs about a quarter of the tick
  rate (787 → 612 ticks/s at a population of 180).
- **An overlay that stops flattering the model.** *Show vision* used to draw the
  configured radius as a circle. It now draws the region the creature can
  actually search — the disc with grid-aligned bites out of it — with the
  intended radius behind it as a faint ghost. When exact vision is on, the two
  coincide and the circle is simply true.
- **`docs/SCIENCE.md`: "The index was in the physics"** — the geometry, the
  error rates, the cost, and the ecological control.

### Notes

- **Off by default, because it is a correction and not a rule.** Turning it on
  moves every world onto a different trajectory from the one thirty-one versions
  of screenshots, permalinks and curated seeds were recorded on. With it off the
  code takes the same branch in the same order and a world is bit-for-bit what it
  was, which `test/vision.test.js` pins creature-by-creature and pellet-by-pellet
  over 1,500 ticks.
- **The torus had a seam after all.** `cellSize` doesn't divide the world (900px
  in cells of 126 leaves an 18px stub), so the grid wraps modulo *cells* while
  the world wraps modulo *pixels*. In the 20-pixel band just past x=0, 6.5% of
  glances at food find the wrong nearest pellet, against 1.05% everywhere else.
  The torus was chosen in v1.0 precisely so that no spot in the world would be
  special. One was.
- **Clearer sight does not move the pond.** Twelve seeds, 9,000 ticks, both arms:
  mean population 211.8 → 214.8. Individual worlds swing wildly and in both
  directions — one goes from 7.5% to 62.6% predation, another the other way —
  because a different trajectory can fall into a different regime. A first pass
  over six seeds showed a tidy 24% drop in the standing crop, with a mechanism
  ready to explain it; twelve seeds says that was two worlds flipping. In a world
  with attractors, a seed-matched pair is not a replicate.
- The new tests check `forEachWithin` against brute force across six awkward grid
  geometries — cell sizes that don't divide the world, a world narrower than one
  cell, a single-column grid — asserting that nothing in range is missed and
  nothing is offered twice.

## [1.31.0] — 2026-07-29

The pond, said out loud. Thirty versions went into things to look at, and the
whole headline experience is a `<canvas>` with no accessible name: a visitor
using a screen reader arrives at the most-linked page in this repo and is told,
in full, "world". Everything this world has ever done has been legible only to
an eye.

### Added

- **`src/describe.js`** — the text half of the pond. `describePond()` is the
  canvas's `aria-label`: population, hunters, food, the deepest generation, the
  season and the time of day, the sick and the immune, and — since v1.17 made it
  possible to be looking at a corner of the world without knowing it — where the
  camera is pointed. A pure observer like `phylogeny.js` and `energy.js`: it
  draws no randomness and nothing reads it back, and `test/describe.test.js`
  pins that by describing one world on every tick for 1,200 ticks and comparing
  every creature, pellet and corpse against a world left alone.
- **A spoken channel for the Chronicle.** A polite live region announces each
  new Chronicle line as it is written. The narrator is the one this project
  already had — writing since v1.5, and only ever into a feed you have to see.
  Watching a default pond at 20×, a listener now hears "Night falls for the
  first time — sight shrinks to 35% until dawn", "First blood after dark", "An
  epidemic — 58 creatures are sick", in the order they happened.
- **`role="img"` on the pond**, so the description is announced as a picture's
  alternative text rather than being skipped as an empty graphic.

### Notes

- **A live region that talks constantly cannot be listened to**, so this one is
  event-gated rather than periodic: arriving mid-run is silent (it does not read
  out a pond's entire natural history), an unchanged feed says nothing, and a
  burst — 20× speed can produce several events between two frames — is capped at
  three lines with the number skipped spoken rather than silently dropped.
  Announcements go out as blank-then-text over two frames, because rewriting a
  live region to the same string may not fire at all, and the Chronicle can
  legitimately say the same sentence twice.
- **A mechanic that is off is not mentioned.** The spoken form of the rule the
  HUD already follows: no "0 sick" in a world with no pathogen, no hunter count
  where nothing can hunt, no time of day where it is permanently noon. Six tests
  assert absence rather than presence.
- **The season and time-of-day badges moved into the same module.** They were
  private to `main.js`, which the suite cannot reach, so the badge a visitor
  reads and the sentence a listener hears now come from one tested place — the
  v1.26 rule about a colour a test cannot reach, applied to a label.
- Verified in a real browser, not only by reading the code: the page driven at
  20× speed, with a mutation observer on the live region standing in for a
  screen reader.

## [1.30.0] — 2026-07-29

The Tree of Life gets a memory. v1.22 caught the population chart quietly
dropping everything older than two minutes and gave it a record of the whole
run. The other time-series view on the same page — the one whose entire subject
is *history* — kept its sliding window for eight more versions: 520 snapshots at
one every six ticks, so the phylogeny remembered the last 3,120 ticks, under a
minute of watching, and dropped the founding of the pond with no tell.

### Changed

- **The abundance record now covers the whole run**, in the same bounded memory.
  When it fills, every second snapshot folds into the one before it and the
  stride doubles: the plot gets *coarser* as the run grows rather than shorter,
  and index 0 survives every halving, so it always starts where the run started.
  Watching for two and a half minutes, the plot reads `ticks 0–8,718 · 1 band
  per 24 ticks`; the old ring would have begun at tick 5,598, with the forty
  founders and the sweep that displaced them already gone.
- **A caption under the plot** — span and resolution — because an x-axis that
  changes meaning owes the watcher a note saying so. Same treatment, same
  wording, as the whole-run chart above it.

### Notes

- The merge is a **sum**, not `archive.js`'s min/max envelope, and that is the
  interesting part. Population is *instantaneous*, so thinning loses its peaks
  and needs an envelope. A death toll is *extensive and cumulative*, so thinning
  is lossless. A species count is a third thing: extensive *within* its window,
  so summing the counts and summing the totals gives the population-weighted
  mean share over that window. Bands still sum to at most the whole, and a
  lineage that lived for a single sample is *attenuated* to its true share of
  the window rather than deleted — which is exactly what dropping every second
  sample would have done to it. `test/phylogeny.test.js` pins that mayfly.
- Observation only, as the whole phylogeny has been since v1.2: no randomness,
  nothing read back into the world, every seed reproduces exactly as before.

## [1.29.0] — 2026-07-28

The pond's books. Every rule in this world is a statement about energy, and for
twenty-eight versions nothing added it up — so the first question you would ask
of any ecology, *where does the power come from and where does it go*, had no
answer here. It has one now, and it found a bug in its first run: a parameter
this project has carried since v1.0 does nothing at all.

### Added

- **`src/energy.js`** — a ledger of every unit this world creates and destroys,
  written alongside events that were happening anyway. It draws no randomness,
  nothing in the simulation reads it, and `test/energy.test.js` pins that by
  stepping one world with a ledger that records nothing and comparing every
  creature, pellet and corpse against a world with the real one.
- **An accounting identity, enforced.** `created − destroyed === standing`, held
  to a relative 1e-9 across a default world, a world with every mechanic on at
  once, a pond that starves out and reseeds repeatedly, a save/load round trip,
  and a world pressed against its population cap. This is a much stronger check
  than any other statistic here keeps: a bite that credits more than it debits,
  or a clamp that swallows a gain, breaks it on the tick it happens.
- **"Where the energy goes"** in the sidebar — a three-segment bar for the
  metabolism, the leaks and what is buried with the dead, plus the running total
  minted and a `Standing ⚡` tile for what is in the pond right now. The two
  numbers are worth seeing together: the standing stock is under 2% of the run's
  throughput, because this world does not store energy, it runs it through.
- **A measured palette for it** (`energyColours()`). Three colours that clear
  `MIN_DELTA_E` against each other, against the bar's track, *and* against all
  three cause colours of the mortality bar directly above — twelve constraints
  under four vision models, worst case 30.2. Two triads picked by eye failed
  first, in two different ways, and both are pinned as regression tests.

### Discovered

- **`energyMax` has never done anything.** The ceiling on a creature's energy
  (220) sits above the threshold at which it reproduces (160), so a creature
  always splits before it can fill up and the clamp is unreachable. A default
  pond spills exactly zero — not "almost none": zero, to floating-point noise
  twelve orders of magnitude below one pellet. It starts to bite only when
  reproduction is blocked, at `populationMax`, and then it is instantly the
  largest sink in the world. Both halves are now pinned by a test and noted next
  to the constant in `config.js`.
- **The pond spends 94–98% of everything it makes on staying alive**, across
  five seeds, and replaces its entire standing energy about every 500 ticks — an
  eighth of a maximum lifespan. Written up in `docs/SCIENCE.md`.

## [1.28.0] — 2026-07-28

The pond in your hands. The camera shipped in v1.17 with a wheel and a keyboard,
and every lens built on it since — the minimap, the terrain layer, the detritus
stain — inherited exactly that reach. On a phone there is no wheel and no
keyboard, so all of it was a feature you could read about and not use. Worse,
the pond itself was 900 CSS pixels wide inside a stage that clips, so a phone saw
its top-left third and nothing said so.

### Added

- **`src/gestures.js`** — one pointer state machine for tap, drag and pinch, and
  the first time any of that logic has been reachable by a test. It is
  arithmetic over pointer coordinates: no DOM, no clock of its own (callers pass
  timestamps in), no random numbers. `main.js` is left as the adapter it should
  always have been — browser events in, camera moves out — which matters because
  `main.js` is the one module the suite cannot open.
- **Pinch to zoom**, about the midpoint of the two fingers, with the midpoint's
  own drift applied as a pan. Fingers landing on the same pixel are held
  `PINCH_MIN_SPAN` apart, so a span ratio can never be `0`, `Infinity` or `NaN` —
  a zoom that jumps to a limit and cannot be undone.
- **Double-tap to follow**, replacing the `dblclick` listener entirely. One path
  now serves a mouse and a hand, because a synthesised `dblclick` is not
  something a phone can be relied on to send. Verified on both.
- **`ZOOM_SNAP`** (`src/camera.js`) — a detent at the whole-pond view. The wheel
  and the keyboard step by fixed powers of 1.25 and so always land back on
  exactly 1; a pinch is continuous and could strand the view at 1.004 — visually
  the classic pond, `isDefault()` false, badge and minimap still on screen,
  permalink no longer the one every screenshot shows. Anything within 2% of the
  bottom snaps home.
- **A touch hint** beside the mouse one (`app/index.html`), swapped on
  `@media (pointer: coarse)` — the input, not the screen width, since a small
  window on a laptop still has a wheel.

### Fixed

- **The pond was clipped on any narrow viewport.** `Renderer._resize` pinned the
  canvas to the world's exact pixel size, and an inline style beats a stylesheet,
  so the responsive rule underneath it had never once applied. The stage's
  `overflow: hidden` did the rest silently. It is now a *preferred* width with
  `max-width: 100%` and `height: auto`; where there is room for the full 900px
  nothing moves by a pixel, and at 390px the whole pond is on screen for the
  first time.
- **The browser owned every touch on the pond.** With no `touch-action`, a pinch
  zoomed the *page* and a drag scrolled it — the pointer handlers wired since
  v1.17 were never reached by a finger, whatever their comment claimed. The
  canvas now asks for `pan-y` at rest, so a one-finger swipe still scrolls the
  page past a canvas that fills a phone screen (and at zoom 1 there is nothing to
  pan anyway) while multi-touch comes to us — which is how a pinch can get out of
  zoom 1 in the first place. Once zoomed in, `main.js` swaps it for `none` so a
  drag pans in both axes. A press-and-hold no longer raises a text-selection
  loupe either.
- **Right- and middle-clicks** no longer start a drag.

### Notes

- **Determinism is untouched, by construction.** Nothing here draws a random
  number or reads world state; `Gestures` is pure arithmetic and the camera has
  been read-only with respect to the simulation since v1.17. A `(seed, config)`
  pair reproduces the same world however the viewer happens to be holding it.
- **Twenty-four new tests**, including the v1.17 invariant re-pinned on the new
  input: pinch out hard, pinch back in, and the camera is the exact identity
  again — the assertion that protects every screenshot and permalink. Driven by
  hand afterwards in headless Chromium with a real touchscreen at 390×844, and
  with a real mouse at 1280×900 to check that removing `dblclick` cost nothing.

## [1.27.0] — 2026-07-28

Detritus: the ground remembers its dead. Food has arrived in this world from
nowhere since v1.0. v1.18 made the crop conditional on itself and v1.23 on the
ground, but nobody had questioned the *source* — pellets appear at a rate, and a
creature's death had no consequence at all for the place it happened in. Death
was the one event in this pond that the pond did not notice.

### Added

- **`src/detritus.js`** — a decaying nutrient map over the torus. A body leaves
  `radius x detritusPerRadius` units of nutrient in the cell it died in; the
  ground keeps `detritusDecay` of it per tick (a half-life of about 230 ticks);
  and `sprout()` picks a cell weighted by nutrient, charges it `detritusUptake`,
  and returns a point inside it. A cell that cannot pay refuses, and the pellet
  then appears from nowhere exactly as it always would have — so **total food
  influx is unchanged**, the same contract the biomes have kept since v1.3.
  Cells tile the world exactly and wrap; a test walks them and asserts each is
  covered once.
- **The crop grows out of it** (`src/food.js`, `src/world.js`). About **24%** of
  new food sprouts from enriched ground at steady state, and the nutrient it
  draws down is the *only* thing that decides where. A sprouted pellet skips the
  terrain barrenness check on purpose: a carcass on a ridge makes rock grow,
  which is the first rule in this world that pushes back against terrain rather
  than agreeing with it.
- **Two nutrient loops, in competition.** With scavenging on, a corpse feeds the
  ground only as fast as it *rots*, so a carnivore that strips one has taken it
  out of the soil's mouth — a corpse eaten after five ticks delivers under a
  fifth of what one left to rot does. Spread over a full undisturbed rot the
  corpse delivers exactly the body's worth, which is a test.
- **Somewhere to see it.** Warm ochre stains in the pond (`src/render.js`) and on
  the minimap (`src/minimap.js`), both painted from `palette.detritusTint()` so
  they cannot drift apart. The pond writes one pixel per cell into a small
  offscreen canvas and lets the upscale blur it into a stain — a few hundred
  pixels a frame rather than a few hundred gradients — with a one-cell wrapped
  border and a per-tile clip so the torus seam neither fades nor doubles.
- **A `Soil 🍂` readout** (`src/stats.js`, `app/index.html`): the share of new
  food currently growing where something died, as an exponential mean over
  `SOIL_HORIZON` (240) ticks. It climbs sharply after a crash, which is when the
  ground is richest, and it reads `off` rather than a plausible steady zero when
  there is no field. Plus a `Detritus` toggle, a `det=` permalink parameter, and
  one chronicle line, guarded on 60 deaths and a 240-tick streak so it cannot
  narrate a pond it never watched feed itself.
- **`Camera.worldTiles()`** — where to place copies of a whole-world backdrop so
  it covers the viewport, extracted from the terrain blit so the suite can reach
  the geometry. It also drops the neighbours the viewport only *touches*, which
  makes the whole-pond view one blit instead of the nine `render.js` had been
  issuing every frame since v1.23.

### Changed

- **`docs/ARCHITECTURE.md`'s module table** now lists `terrain.js`, `palette.js`
  and `detritus.js`. The first two had been missing since v1.23 and v1.25 — a
  table that claims to list the modules should list them.

### Notes

- **The control says it is not the dead that matter.** A detritus pond holds
  about 8% more creatures than a control pond (+8.2% ± 5.3 sem over eight seeds
  at 9,000 ticks), and the obvious explanation — the crop now grows where the
  creatures are — is wrong twice over. The mean distance from a creature to the
  nearest pellet *rises*. And a third arm that sprouts the same pellets, draws
  down the same nutrient, and then places each one **uniformly at random** does
  the same thing (+7.6% ± 11.5; real vs shuffled +6.1% ± 8.3, indistinguishable).
  Whatever moves the population, it is that a quarter of the crop stopped being
  crowded into the biomes, not that it follows the dead. Population variability
  is untouched too (cv 0.220 against 0.229), so the delayed feedback loop this
  builds does not make the pond swing more, which is what it was designed to do.
  Written up with the numbers and a runnable script in `docs/SCIENCE.md`.
- **`detritusFull` is a measurement, not a taste.** At 4 it silently truncated a
  third of every large carcass and the share of the crop growing from the dead
  was 17%; at 8 — the smallest round number that holds one whole body, since the
  largest possible creature is worth 6.4 — it is 24%; at 12 it is 25% and one
  cell can bank three bodies. Halving `detritusUptake` would reach 46%, at the
  price of a body funding more pellets than it plausibly ate.
- **Determinism.** With the feature off the field does not exist, so no branch is
  taken and no random number drawn: 2,500 ticks of a default world are identical
  creature-by-creature and pellet-by-pellet, and a scavenging world is identical
  corpse-by-corpse (the `Corpse` gained a field, not a behaviour). 294 tests, all
  green (32 new). Checked by hand in headless Chromium on the real
  `app/index.html`, with and without terrain.

## [1.26.0] — 2026-07-28

The death toll gets a clock. v1.21 made every death name its cause and v1.22
gave the run a memory that survives at falling resolution; for four versions
they never met. The mix on screen is the last 120 bodies, so by the time a crash
has scrolled far enough back to be a *shape* on the chart, the window that could
have explained it has turned over several times. The most dramatic thing this
world produces was legible only while it was happening.

### Added

- **A death strip under the chart** (`src/main.js`, `app/index.html`). Deaths
  per tick, stacked by cause, on the chart's own x-axis and following its
  recent/whole scope — so a trough in the population line now has a colour
  underneath it. Heights are normalised to the busiest interval on screen and
  the caption carries the absolute peak as a count over its own interval
  ("peak 4 in 4 ticks"), because a normalised strip with no number on it looks
  the same in a massacre and in a quiet afternoon.
- **Cumulative death counters in both history buffers** (`src/stats.js`), and
  `deaths_starvation` / `deaths_age` / `deaths_predation` columns in **both** CSV
  scopes. The archive needed no change at all to carry them, which is what
  "generic over its fields" was supposed to mean.
- **`mortalitySeries()`** (`src/stats.js`) — a pure, tested function turning a
  run of samples into per-interval death rates by cause. The drawing code in
  `main.js` does no arithmetic, because nothing in `main.js` can be tested.

### Changed

- **The three cause colours** (`src/palette.js`, `style.css`). The v1.25 audit
  swept the canvas exhaustively and never opened the stylesheet. Gold `#d2a13c`
  (starved) against orange `#ff7a4d` (hunted) scores **ΔE 5.5** under
  deuteranopia and **7.0** under tritanopia — two warm tones a few degrees of hue
  apart, a distinction made entirely on the red–green axis, and it is exactly the
  pair a crash hinges on. Grey old age, the one cause nobody has to identify in a
  hurry, was the only one safely separated. Re-cut along the axes a dichromat
  keeps: pale gold (L\* 91), mid slate (L\* 58), deep crimson (L\* 43), worst
  pair **ΔE 37**, each clearing the panel behind it by more than 40. The values
  moved out of `style.css` into `src/palette.js` and are painted onto the DOM
  from there, so the bar, the legend and the strip cannot drift apart and a test
  can measure what is actually drawn.

### Notes

- **Cumulative, not per-interval, and that is the whole design.** v1.22 paid for
  min/max envelopes because thinning a history loses exactly the extremes. A
  running total needs none: it is monotone, and any two surviving samples
  partition the ticks between them with no gap and no overlap, so their
  difference is exact however many samples were discarded in between. The
  general form is worth keeping — *an extensive quantity recorded cumulatively
  is lossless under decimation, in a way an instantaneous one can never be.*
  Storing deaths-per-interval would have looked identical on a fresh run and
  under-reported from the first halving onward.
- **The control is in the suite.** `test/mortalityHistory.test.js` asserts the
  cumulative form returns identical totals through archives of capacity 4 and
  512 — resolutions differing eightfold — and that the naive per-interval form
  loses more than 80% of the deaths at capacity 4. A suite that only knew the
  right answer would stay green while someone reintroduced the bug.
- No config flag, no new RNG draw, no simulation change: the bookkeeping reads
  state that already existed. The v1.21 determinism fingerprints are untouched
  and still exact. 262 tests, all green (13 new). Checked by hand in headless
  Chromium against the real `app/index.html` on both chart scopes.

## [1.25.0] — 2026-07-27

A colour audit, and the thing it found behind the thing it was looking for. This
world says *that one hunts* with a warm core inside a chevron, which is a claim
about the red–green axis, which is the axis roughly one man in twelve cannot
see. Twenty-four versions went by without anyone measuring it.

### Added

- **`src/palette.js`** — the instrument. A dichromat simulation (Viénot,
  Brettel & Mollon 1999: into LMS cone space, substitute the missing cone's
  response, come back) for protanopia, deuteranopia and tritanopia, plus a CIE76
  ΔE in L\*a\*b\*, so "can these two be told apart?" is a number rather than an
  opinion. The project's colour decisions live here too, as pure functions, so
  the tests hold the *rendered* palette to the measurement instead of to a copy
  of it. Read-only, zero random numbers, no effect on any simulation.

### Changed

- **The predator mark** (`src/render.js`). Sweeping every creature a pond can
  contain — 360 hues × 7 energy levels × 5 signalling states × 4 vision models —
  the old warm core scored a worst-case **ΔE 2.8** against its own body. That is
  the just-noticeable difference, and the cause was not colour blindness: body
  lightness rises with energy, the core was drawn additively, and adding orange
  to a pale pastel clamps to the white it was already heading for. The best-fed
  predator in the pond wore the faintest mark. It is now an opaque amber disc
  with a near-black rim — the subtitle trick, where a mark carrying both a very
  light and a very dark tone cannot be swallowed, because no background is close
  to both. Worst case **ΔE 40.7**, and the distinction is carried by luminance,
  the one channel no deficiency touches. Carnivory moves the mark's *size* now
  rather than its opacity: fading a mark to express degree spends exactly the
  contrast the mark exists for.
- **The minimap's predator badge** (`src/minimap.js`), which was worse. One warm
  orange square among squares of every lineage hue scored a worst case of **ΔE
  0.01** — to a tritanope a predator and a prey creature of hue 26° were the same
  colour to four decimal places, on the one view where a whole-pond pattern is
  visible at a glance. Now the same two-tone badge, built from squares: **ΔE
  57.7**.

### Notes

- **Two findings ship without a fix, which is the point of writing them down.**
  Lineage hue is unreadable for a dichromat (twelve evenly spaced hues have a
  closest pair at ΔE 1.6 under deuteranopia, 0.0 under tritanopia) and remapping
  the wheel onto the blue↔yellow axis was implemented, measured, and found to
  make it *worse* while costing normal vision half its separation. A dichromat's
  colour space is two-dimensional and this project already spent luminance on
  energy, so one axis remains, and one axis does not hold twelve values. And
  corpses versus food — the pair most likely to be a second bug — measured
  fine (ΔE 39 under deuteranopia) and was left alone. Both are in
  `docs/SCIENCE.md` with the numbers.
- **The old failures are pinned by tests, not just the new successes.** A suite
  that only asserted the new numbers would stay green while someone restored the
  old colours, so `test/palette.test.js` asserts the v1.24 core scores under 5
  and the v1.24 minimap dot collides outright.
- Rendering only: no config flag, no new RNG draw, no simulation change. Every
  determinism test is untouched and still exact. 249 tests, all green (15 new).
  Checked by hand in headless Chromium against the real `app/index.html` at 1×
  and 3.8× and on the minimap: predators are now the thing you notice first.

## [1.24.0] — 2026-07-27

The minimap learns about the ground. v1.23 gave this world a landscape and drew
it only in the pond, which is the same hole the camera opened in v1.17, one
feature further down: you could see the ridge you were standing in and nothing
told you where the next basin was.

### Added

- **Terrain on the minimap** (`src/minimap.js`). `terrainBandRects()` samples
  the roughness field onto a grid of 2px cells, quantises it into the same eight
  bands `render.js` contours at, and returns the fewest rectangles that cover
  the map exactly — runs of equal band merged along each row, then a row folded
  into the one above wherever the two agree. A default landscape comes out at
  about a fifth of the 5,580 cells it is sampled from, which is what makes cells
  small enough to look like contours rather than a mosaic affordable to redraw
  every frame. Drawn first, under the biomes, exactly as the pond draws it.
- **Bands rather than a gradient**, deliberately. At a fifth of scale a smooth
  ramp is indistinguishable from the several other glows already in that corner;
  a step between one band and the next is a contour line. The band count is
  shared with the main view so the two can't disagree about where a ridge
  begins — a test samples the field under every rectangle and asserts the map
  never invents ground the simulation doesn't have.

### Notes

- The rectangles are cached against the `TerrainField` **object**, not the seed.
  Toggling terrain off drops the field and toggling it back on builds a new one,
  so a new object cannot find an old landscape's rectangles — the stale-readout
  bug this project keeps rediscovering (v1.22's chart buffer, v1.23's Ground
  stat) is unrepresentable here rather than merely fixed. There is a test that
  switches seeds and insists the map switches with them.
- Nothing here is new machinery for the simulation: the minimap remains
  read-only and draws no random numbers, and a world with terrain off produces
  byte-for-byte the draw calls it always has (`terrainBandRects` returns `[]`,
  so the call site needs no branch). The existing count assertion over a flat
  world's draw ops is unchanged and still exact.
- 234 tests, all green (8 new). Checked by hand in headless Chromium against the
  real `app/index.html`: the ground appears with the toggle, disappears with it,
  and comes back on a re-toggle; no console errors; the basins in the corner are
  the basins under the pond.

## [1.23.0] — 2026-07-27

Terrain: space was this world's last unconditional gift — for twenty-two
versions, being anywhere cost exactly what being anywhere else cost.

### Added

- **A landscape** (`src/terrain.js`, opt-in). A static roughness field over the
  torus, derived from the seed by an integer hash and five cosines. Rough ground
  costs more to cross (up to `terrainRoughCost` on the movement half of the
  metabolic bill) and grows less (`terrainBarrenness`): a pellet is less likely
  to take the rougher the ground it lands on. Nothing is blocked, and nothing can
  perceive it — the pond ends up in its basins because that is where the living
  can afford to be. Every component fits a whole number of wavelengths across the
  world, so the landscape meets itself at the seam; a world that has been a torus
  since v1.0 shouldn't grow an edge now.
- **Contours you can read.** The landscape is baked once into an offscreen canvas
  and blitted under everything — a quiet basin-to-ridge ramp with contour lines
  at fixed roughness intervals, tiled across the wrap so panning off one side of
  the world finds the ground continuing. A smooth gradient alone would have been
  one more glow in a scene already full of them; the contours are what make it
  read as *terrain*.
- **A Ground stat**, `⛰️`: how much flatter the ground under the living is than
  the landscape as a whole. It is exactly 0 without terrain, so it shows `off`
  rather than a suspiciously steady zero — a statistic that is non-zero with its
  mechanism disabled is not measuring the mechanism.
- **A chronicle line** when the pond has spent 240 consecutive samples on
  meaningfully smoother-than-average ground, and a `ter=1` permalink parameter so
  a landscape is one shared link away.

### Notes

- **A negative result, and the fix it forced.** The mechanic was designed around
  the movement cost: creatures burning more on ridges should die more on ridges,
  and the flats should fill up. They don't. A pure movement tax at the full 2.6x
  cost settles the population by **-0.003**, against -0.005 for the terrain-off
  control — indistinguishable from nothing. A creature crosses this world in ~350
  ticks and lives for 4,200, so it samples the whole map a dozen times a lifetime
  and a spatially varying death rate averages clean away. Making the ridges
  *barren* as well as expensive is what works, because where the food is does not
  average away: the same worlds settle by **-0.057**. Both halves shipped, the
  sweep behind every constant, and the general lesson — in a well-mixed world a
  spatial cost does not produce spatial structure — are written up in
  `docs/SCIENCE.md`. The comparison is pinned as a test so it can't quietly stop
  being true.
- Terrain moves the crop without shrinking it: a refused pellet looks again, up
  to four times, and is then placed regardless. Food influx is bit-for-bit the
  same as a flat world's — the contract the biomes have kept since v1.3.
- Building the landscape draws **zero** random numbers: it is hashed, not sampled.
  With terrain off there is no field at all, `terrainCostAt` returns literally
  `1`, and the four-world fingerprint — every creature's position, energy, age,
  heading and generation, plus every pellet — is unchanged after 2,500 ticks.
- 226 tests, all green (25 new). The page was driven in headless Chromium against
  the real `app/index.html`: the toggle building and dropping the landscape live,
  the Ground stat tracking it and returning to `off` in the same frame it is
  switched off, the `ter=1` permalink round-tripping through a reload, the blit
  crossing the seam under zoom and pan, 60fps, and a clean console.

## [1.22.0] — 2026-07-27

The whole run: for twenty-one versions this world could remember the last two
minutes of itself and nothing else.

### Added

- **An archive** (`src/archive.js`). The population chart has always been fed by
  a 480-sample ring — one sample per four ticks, so the last 1,920 ticks — and
  everything older was dropped. Watch a pond boom to three hundred and crash to
  forty, keep watching for two more minutes, and the boom is *gone*: not
  compressed, not summarised, gone. The archive keeps the rest in bounded memory
  by halving its own resolution each time it fills, so the record always spans
  the first sample to the newest and grows **coarser** rather than shorter.
- **Envelopes, so the thinning cannot lie.** The numbers worth having here are
  the extremes — the peak of the boom, the floor of the crash — and those are
  exactly what a decimated line loses. So a dropped sample is not discarded: its
  values widen the `min`/`max` of the representative that absorbs it. The line
  gets coarser; the envelope stays **exact**, at every capacity, for the whole
  run. An archive that silently understates a peak would be worse than no
  archive, because it would still look like data.
- **A chart you can flip** — the pill in the chart legend, or <kbd>H</kbd> —
  between *recent* and *whole run*, with a translucent band behind each line in
  the long view showing the range each thinned point stands for, and a caption
  naming the tick range and how many ticks a point now covers. The default view
  is byte-for-byte the chart every earlier version drew; an x-axis that silently
  changes meaning is worse than no axis at all.
- **Export CSV follows the chart.** The recent scope exports exactly the four
  columns it always did. The whole-run scope adds `pop_min,pop_max,food_min,
  food_max,samples`, so a peak that fell between two retained rows is still in
  the spreadsheet.
- **New tests** (`test/archive.test.js`, 14 of them): the capacity bound holds
  over 5,000 pushes at four capacities, the record always starts at the first
  sample and ends at now, ticks stay strictly increasing, every sample is
  accounted for exactly once, the stride stays a power of two — and the headline
  one, that the reported peak and floor equal the true peak and floor over every
  sample ever pushed, swept across capacities 4–100 and runs up to 5,000.

### Notes

- Pure bookkeeping: no randomness drawn, no simulation state touched, nothing
  read back into the world. The v1.21 four-world fingerprint test — every
  creature's position, energy, age, heading and generation, plus every pellet —
  passes untouched, so a world that keeps an archive is bit-for-bit the world
  that doesn't.
- 201 tests, all green. The UI was driven in headless Chromium against the real
  `app/index.html`: the pill toggling and reporting `aria-pressed`, <kbd>H</kbd>
  doing the same from the keyboard, the caption tracking the stride as it
  doubles (4 → 8 → 16 → 32 ticks per point over a 4,400-tick run), a real
  download producing the nine-column file, and a clean console.

## [1.21.0] — 2026-07-26

Mortality: the pond has counted its dead for twenty versions without once asking
what of.

### Added

- **Cause of death.** Every death now names itself at the moment it is decided —
  **starvation** (energy hit zero), **age** (reached `maxAge` with energy to
  spare), or **predation** (a bite emptied it, recorded by the predator that
  landed it). Nothing is inferred afterwards, because by the time the world
  sweeps up a body, starving and being eaten look identical: both leave a
  creature at zero. The first cause recorded wins, so a creature killed mid-tick
  is never re-filed as having starved when it finishes its own update.
- **A mortality bar** in the side panel — three segments over the last 120
  deaths, amber for starved, slate for aged out, orange for hunted — with the
  percentages beneath it and a new **Lifespan** stat giving the mean age at
  death. A rolling window rather than a running total, because a cumulative
  share stops moving after a few thousand ticks and the interesting thing about
  mortality is that it changes. The three displayed percentages are rounded by
  largest remainder so they always sum to exactly 100; three independent
  `Math.round` calls produced captions reading 101%.
- **A chronicle line** when the leading cause of death changes, guarded twice
  over: the window must be full, and the leader must hold an outright majority,
  so three causes hovering near a third each stays silent instead of
  flip-flopping every time a body lands. Over 20,000 ticks a seed fires this
  once or twice — in the predator worlds it captures a real handover, hunting
  giving way to hunger as the prey learn to run.
- **New tests** (`test/mortality.test.js`, 16 of them), including a fingerprint
  of four worlds' exact state — every creature's position, energy, age, heading
  and generation, plus every pellet — captured from the v1.20.0 sources and
  asserted here, so observation can never start costing the thing observed even
  a floating-point bit.

### Notes

- **The measurement passes its own control.** With predation switched off the
  predation share reads exactly 0.000 on all eight seeds swept — not a small
  number, zero.
- **What the sweep found** (see `docs/SCIENCE.md#what-the-pond-dies-of`): across
  eight seeds, ~78% of deaths are starvation and only ~11% are predation. The
  predator/prey arms race this world is built around, that the default seed was
  picked to display, does about a tenth of the editing. Old age turns out to be
  the sensitive indicator — 11% by default, 16% with predators gone, and 1.4%
  with regrowth on, which also cuts mean lifespan by 40%. And contagion barely
  shows up at all, correctly: the pathogen has no lethal step, so a fever kills
  by starving its host slightly sooner, and "died of disease" would be an
  interpretation rather than a measurement.
- 187 tests, all green. The UI was driven in headless Chromium against the real
  `app/index.html`: the readout empty at rest, the bar and legend live once
  deaths accumulate, the widths matching the printed percentages, the aria-label
  describing the split for a screen reader, the chronicle line appearing, and a
  clean console.

## [1.20.0] — 2026-07-26

Signalling: the brain's third output has broadcast to nobody since v1.0. This
release gives it listeners.

### Added

- **Signalling** (opt-in, `signalling`). Every creature has always emitted a
  "colour signal" — a third motor output that nudged its saturation on screen and
  did nothing else. Nothing could perceive it, which means selection could never
  do anything with it either way: nineteen versions of creatures flashing at each
  other in a world with no eyes for it. Switch this on and a creature also
  *hears* the loudest call within `signalRadius` (120px), faded linearly with
  distance, through a block of **ear genes** — one weight per hidden neuron —
  that mutate and cross over like the rest of the brain. Calling costs energy in
  proportion to its loudness (`signalCost`), because a free signal is unphysical
  and cost is what is supposed to keep a signal honest. Hearing deliberately does
  **not** shrink at night the way sight does: a voice carries in the dark, which
  is exactly when a creature that cannot see would most want one.
- **Rings you can read.** A calling creature wears two thin rings — warm for a
  positive call, cool for a negative one, opacity tracking loudness — so two
  lineages using opposite signs are visibly saying different things. A new
  **Heard** stat reports the traffic on the channel: the mean strength of the
  call actually reaching a creature, `off` where nobody can hear.
- **"Earshot" scenario** on seed 23, earned by a 28-seed sweep scored on a busy
  channel (mean heard signal 0.80, the highest of the field), predators
  persisting through 59% of the run so there is something worth calling about,
  and a pond that holds ~220 creatures and never drops below 41.
- **New tests** (`test/signalling.test.js`, 14 of them): the feature off being
  bit-for-bit inert down to each creature's energy; the ear costing zero RNG
  draws at all three draw sites (genesis, mutation, crossover); mutation and
  crossover reaching the ear only when it is live; species distance ignoring the
  ear so the tree of life is unchanged; a deaf net being arithmetically identical
  whatever it is told; a call fading with distance and the loudest winning; the
  energy cost; hearing reading last tick's pond rather than a half-updated one;
  a pre-ear save loading with a silent ear and its body genes intact; earshot
  surviving nightfall; and reproducibility from a seed.

### Notes

- **Determinism.** The ear is a new gene block, and genes are where the RNG lives,
  so every function that draws randomness takes a flag saying whether the block is
  live and skips it entirely when it isn't — the same discipline the v1.4
  plasticity genes established. Body genes are addressed from the *end* of the
  vector, so inserting the ear ahead of them moved nothing. Pre-v1.20 saves are
  migrated on load. Sexual worlds were the sharp edge here: a coin flipped per
  silent gene during crossover would have shifted the stream for every one of
  them.
- **Two negative results, recorded rather than buried** (see
  `docs/SCIENCE.md#signalling-a-channel-that-nobody-could-hear`). The energy cost
  does *not* select for silence — sweeping it from 0 to five times base
  metabolism moves mean loudness only from ~0.85 to ~0.72, because a `tanh`
  output saturates and quiet is a vanishingly thin region of weight space. And
  the statistic that looked like an evolved alarm call — creatures saying
  something measurably different when a hunter is in sight — fails its control:
  the same gap appears just as strongly in worlds where **nobody can hear**, so
  it measures shared ancestry, not communication. The strongest "alarm call" in
  the experiment came from a pond with the feature switched off. No chronicle
  line claims otherwise, and the app reports only the quantity that survives
  scrutiny.
- 171 tests, all green. The UI was driven in headless Chromium against the real
  `app/index.html`: the readout `off` at rest and live once switched on, the
  permalink carrying `sig=1`, the rings actually painted, the Earshot chip
  launching a signalling world, the readout returning to `off` on a scenario
  without it, and a clean console.

## [1.19.0] — 2026-07-26

A minimap: the whole pond in the corner, so a zoomed-in view can say *where* it
is looking.

### Added

- **Minimap** (`src/minimap.js`). v1.17 gave the pond a camera and, with it, the
  first way to get lost in a world that has no edges — at 8× you can see a
  fifteenth of the water and nothing on screen says which fifteenth. The minimap
  is the missing half: biomes as soft discs, food as green specks, creatures as
  single pixels in their lineage hue (predators warm and a pixel larger, because
  they are the thing worth spotting from across the pond), the inspected creature
  ringed in white, and the current viewport as a bright rectangle. It appears and
  disappears with the zoom badge — at zoom 1 the viewport *is* the whole world, so
  a minimap there would only be a smaller copy of what you are already looking at,
  and a first-time visitor sees the same uncluttered pond they always did.
- **Click, or drag, to go there.** A press anywhere on the minimap puts the
  centre of the view on that point, and dragging sweeps the view around. Like a
  drag in the pond itself, taking the wheel by hand releases the follow lock —
  `Camera.moveTo()` is new, and is a deliberate no-op at zoom 1 so nothing can
  nudge the identity view.
- **New tests** (`test/minimap.test.js`, 8 of them, plus one more in
  `camera.test.js`): the layout matching the world's aspect ratio exactly, the
  whole-pond viewport at zoom 1 being a single flush rectangle, viewport area
  conserved across zooms and positions, seam- and corner-straddling views coming
  back as two and four pieces, every wrapped image of a point landing on one
  pixel, the click round-trip, a stub-canvas drawing pass that emits no
  non-finite coordinate and the expected number of marks, and 600 ticks of a
  world drawn every frame staying bit-for-bit identical to one nobody watched.

### Notes

- **Determinism.** The minimap, like the camera, holds no simulation state and
  draws no random numbers — where you happen to be looking still cannot change
  what happens. The test asserts it the hard way, creature by creature, against
  an identical unobserved world.
- The torus seam is *shown* here rather than hidden. Everywhere else each thing
  is drawn at whichever wrapped image of itself is nearest the camera; on the
  minimap coordinates are wrapped into the world's bounds first, so the map has
  real edges and the viewport is split into the pieces a flat rectangle can draw.
- 157 tests, all green. The UI was driven in headless Chromium against the real
  `app/index.html`: hidden at rest, appearing on zoom, painted pixels, click and
  drag both moving the view, hiding again on <kbd>0</kbd> and on a scenario
  launch, the follow marker, and a clean console.

## [1.18.0] — 2026-07-26

Regrowth: food that grows from food, so a herd can eat the pond bare and then has
to wait for it to grow back.

### Added

- **Regrowth** (opt-in, `foodRegrowth`). Until now pellets appeared out of nowhere
  at a constant rate, which meant grazing had no lasting consequence: a stripped
  biome refilled exactly as fast as an untouched one. With regrowth on the crop
  becomes a population of its own. Growth is **density-dependent** — the spawn
  rate scales with the standing crop, down to `regrowthFloor` (0.35) when nothing
  is left — and **local**: a `regrowthSpread` (0.85) share of new pellets are
  seeded within `regrowthRadius` (30px) of a living one, and take with a
  probability equal to the local fertility, so blooms recolonise from the edges of
  what survived instead of diffusing across the pond. The result is the world's
  first *endogenous* cycle: crop climbs to the cap, a herd builds on the surplus,
  the herd out-eats the plants, both crash, and the survivors wait out a slow
  green recovery — population and food oscillating out of phase.
- **🌾 The Commons**, a new curated scenario on seed 137, earned by a 20-seed
  sweep scored on complete overgrazing cycles in a pond that survives them: the
  crop stands at the cap until the founders multiply, the pond is stripped bare
  around tick 2,100, green returns by 5,700, and the two populations oscillate
  from there without the herd ever dropping below ~28. No predators — this world
  is about what grazers do to their own food supply when nothing eats them.
- **Two chronicle lines**, `🍂 The pond is grazed bare` and `🌾 Green returns`,
  both one-shot and both guarded: "bare" requires that a real standing crop
  existed to strip, and "green returns" can only follow a stripping that was
  actually reported.
- **New tests** (`test/regrowth.test.js`, 10 of them): the bit-for-bit
  determinism invariant, a growth factor that is *exactly* 1 when the feature is
  off, seeds landing within a radius of a living pellet, a stripped pond still
  being recolonisable from nothing, the `foodMax` cap, a grazed-down crop
  recovering measurably slower than a constant-rate one, blooms staying on
  fertile ground, a regrowth world surviving 6,000 ticks with a crop that visibly
  rises and falls, and a chronicle that stays silent about overgrazing it never
  saw.

### Notes

- **Determinism.** With `foodRegrowth` off, `growthFactor()` returns exactly 1
  (multiplying by which is an exact no-op in IEEE-754) and the seeding branch is
  skipped entirely, so not one extra random number is drawn and every existing
  world is unchanged — asserted pellet-by-pellet as well as creature-by-creature.
- The opening standing crop is still sown by `spawnAnywhere()`: seeding the first
  280 pellets from each other would grow the entire crop out of a single point.
- `regrowthFloor` was set by sweeping 0.25 → 0.5 across seeds. Lower makes the
  busts brutal and the pond thin; 0.35 keeps the swings obvious while leaving a
  healthy population.
- 148 tests, all green. The UI (a toggle, the permalink key `regrow`, and the new
  scenario chip) was driven in headless Chromium against the real
  `app/index.html`: toggling, permalink round-trip on a fresh load, the scenario
  launch, and a clean console.

## [1.17.0] — 2026-07-25

A lens for the pond: zoom in, pan around a world with no edges, and follow one
creature through its life.

### Added

- **A camera** (`src/camera.js`). Scroll to zoom about the cursor (1× to 8×),
  drag to pan, <kbd>+</kbd>/<kbd>−</kbd> to step the magnification and
  <kbd>0</kbd> to return to the whole pond. The world is a torus, so the view
  never meets an edge: everything is drawn at whichever wrapped image of itself
  is nearest the camera, and panning past a seam simply arrives back where it
  started. Eighteen versions of detail — the carnivore's dagger silhouette, the
  fever halo, the immunity ring, the attack flash — were previously being drawn
  at four pixels across.
- **Follow a creature 🎯.** Double-click any creature (or tick *Follow selected
  creature*) and the camera rides along with it, so you can watch a single
  animal hunt, breed and die rather than watching a population statistic. It
  releases the moment the creature dies — a camera trained on a corpse is a bug,
  not a memorial — and the moment you take the view back by hand with a drag.
- **A view badge**, top-right of the canvas, present only while the view is
  something other than the whole pond: the current magnification, and whose life
  you are riding along in. The Follow checkbox is driven *from* the camera, so it
  admits it when the camera lets go on its own.
- **New tests** (`test/camera.test.js`, 11 of them), including the invariant that
  matters most: at zoom 1 the camera is the exact identity, so the default view
  is pixel-for-pixel the one every screenshot and permalink has always assumed —
  and zooming back out snaps home rather than leaving the world nudged sideways.
  Also: zoom clamping, anchored zoom keeping the point under the cursor fixed,
  panning by screen pixels ÷ zoom, the seam being invisible, screen↔world
  round-tripping, follow-and-release, and the canvas transform matrix agreeing
  with `worldToScreen`.

### Notes

- **Determinism is untouched by construction.** The camera reads the world and
  never writes it, draws no random numbers, and holds no simulation state, so
  where a visitor happens to be looking cannot change what happens. No existing
  test needed adjusting.
- Clicking and dragging are told apart by travel distance (4px) rather than by a
  timer, so a slow, deliberate click on a small creature still selects it. Pointer
  events throughout, so a finger pans the same way a mouse does.
- 138 tests, all green. `main.js` and `render.js` are outside `node --test`'s
  reach, so the interaction was driven in headless Chromium against the real
  `app/index.html`: wheel zoom, drag-pan, click-to-select, follow by checkbox and
  by double-click, the keyboard shortcuts, a scenario launch resetting the view,
  60fps and a clean console.

## [1.16.0] — 2026-07-25

Contagion: a pathogen that spreads by proximity, is survived once, and then comes
back in waves because immunity is never inherited.

### Added

- **Contagion (opt-in).** A disease with no genome and no brain, only proximity:
  a susceptible creature within `infectionRadius` of an infected one catches it
  with a fixed per-tick chance, stays sick for `diseaseDuration` ticks while
  paying `diseaseMetabolicCost` extra energy every tick — a fever is expensive —
  and, if it survives, is **immune for the rest of its life**. That is a spatial,
  individual-based SIR model with the one twist that matters: immunity is
  *acquired, never inherited*, so every newborn is susceptible again. Births
  refill the susceptible pool, and the epidemic stops being a single burn-through
  and becomes **recurring waves** — the same mechanism behind the historical
  periodicity of childhood diseases. It is also the first pressure in Vivarium
  that punishes crowding, which every other pressure (food in biomes above all)
  rewards.
- **🦠 The Plague** — an eighth curated scenario, and the doorway to it. Seed 101
  was earned, not guessed: a 24-seed sweep at two virulence settings scored
  candidates on recurring waves *in a pond that survives them*, and seed 101 came
  out top at both — including at the stock virulence, so the scenario ships the
  pathogen exactly as configured by default. It runs at ~150–280 creatures
  through four waves in the first 12,000 ticks, cresting near 45% sick, with herd
  immunity building past half the pond and then eroding as susceptible newborns
  accumulate.
- **The epidemic is visible, in three places at once** — the lesson from v1.13/14
  applied up front rather than a cycle later. On the canvas a sick creature wears
  a pale sulphur halo that throbs like a fever (it holds still under reduced
  motion) and a survivor keeps a thin cool-blue ring for the immunity it earned.
  In the stats panel, new **Sick 🦠** (count and share) and **Immune 🛡️** tiles
  read `off` in a world with no pathogen. And the chronicle narrates the arc in
  five one-shot lines: the first case, the wave cresting past a fifth of the pond,
  the first survivor, herd immunity, and the pathogen running out of hosts.
- **New tests** (`test/disease.test.js`, 10 of them): contagion is off by default
  and no creature is ever sick; with it off a 3,000-tick world is bit-for-bit
  identical — creature by creature, position and energy — to one built without the
  flag at all; the pathogen arrives on schedule and not a tick earlier; an
  infection lasts exactly `diseaseDuration` before conferring immunity; an immune
  creature survives certain, unlimited-range exposure un-reinfected; a sick
  creature pays exactly `diseaseMetabolicCost` more per tick than an identical
  healthy one; a plague world reproduces from its seed down to the chronicle text;
  and disease events are one-shot however many waves pass. The scenario test now
  also asserts The Plague really does come in waves and leaves a living pond.

### Notes

- **Determinism, as ever.** The whole epidemiology step is skipped when the
  feature is off, so it draws not one random number and every existing seed
  reproduces exactly the world it did before (the fever term is an exact `0`, not
  a rounding). With it on, order inside the tick is fixed: every infected host
  rolls against each susceptible neighbour it can reach, new cases land only
  after the whole pass — so an infection can't chain through three hosts in one
  tick — and recovery is resolved before them, so a creature that recovers this
  tick can't be re-infected by an exposure from the same one.
- Deliberately *no* evolvable resistance gene. The interesting question is
  whether behaviour — how tightly a lineage packs, how far it ranges — shifts
  under a pressure that only tight packing creates. A resistance gene would let
  evolution answer with biochemistry instead. See the new **Contagion** section in
  `docs/SCIENCE.md`.
- Infection state is transient and isn't serialised, like corpses: a saved world
  reloads healthy.
- 127 tests, all green. `main.js` and `render.js` sit outside `node --test`'s
  reach, so the UI was driven in headless Chromium against the real
  `app/index.html`: the `dis=1` permalink arrives with the toggle set, the Sick
  and Immune tiles track a real wave (34% of 235 creatures at the crest), the
  chronicle lines land at exactly the ticks the node run predicted, switching
  contagion off cures the pond and returns both tiles to `off`, the Plague chip
  launches seed 101 with everything synced, creatures are still clickable with
  the extra rings drawn, reduced motion stills the throb, and the console stayed
  empty.

## [1.15.0] — 2026-07-25

The genealogy of a survivor: every creature can now show you the line of species
it descends from — and the inspector holds still long enough to click it.

### Added

- **Ancestry chain in the inspector.** Click a creature and, if its lineage has
  ever branched, a new row draws the whole descent — founder first, one pip per
  species, ending in its own. Pips carry each species' inherited hue, ancestors
  with no living members are drawn hollow and dashed, and clicking any pip
  spotlights that lineage in the pond exactly as the Tree of Life legend does.
  Deep chains keep the six most recent links behind a "…" marker. Founding
  species get no row: there is no story there yet.
- `Phylogeny.ancestry(id)` — the pure function behind it. Every branched species
  already recorded its parent, so the tree could always be read *upward*; this
  walks those links back to the founder and returns the chain oldest-first, so
  `chain.length - 1` is how many times the lineage has split. Cycle-guarded and
  depth-bounded, because it runs inside the render loop.
- **New tests** (`test/phylogeny.test.js`): a founder's chain is just itself; in
  an evolved world every living creature's chain roots in a parentless founder,
  ends on its own species, and has each link the true parent of the next, born
  no later; an unknown id gives an empty chain; a deliberately cyclic tree
  terminates instead of hanging; and the chains are identical across two worlds
  built from the same seed.

### Fixed

- **The inspector no longer rebuilds itself 60 times a second.** It was
  re-rendered from `innerHTML` on every frame, which was harmless while it held
  only text but quietly broke anything clickable inside it: a human click spans
  several frames, and the element it began on was detached long before the mouse
  came up. The panel is now rebuilt only when its structure changes — a
  different creature, or an ancestry chain that gained a link — while age,
  energy, offspring count and the learned-weights strip are patched in place.
  An ancestor dying out toggles a class rather than re-rendering the chain, so a
  lineage going hollow can never eat a click. This also repairs the existing
  "spotlight lineage" link, which had the same flaw.

### Notes

- Pure observation, as the phylogeny has always been: no new randomness, nothing
  read back into the simulation, no config change. Every seed reproduces exactly
  the world it did before. 117 tests, all green.
- `main.js` sits outside `node --test`'s reach, so the row was checked in
  headless Chromium against the real `app/index.html`: the chain renders with
  the right ids and hues, its last pip is the creature's own species and matches
  the Species row, clicking a pip lights up the matching legend chip and reveals
  **Clear highlight**, the same pip node survives two seconds of frames at 20×
  speed (~9,600 ticks) instead of being replaced, age and energy keep ticking in
  place, and the console stayed empty.

## [1.14.0] — 2026-07-25

Give the night a face: a clock on the pond, a doorway to it, and a chronicle
that says when the sun went down.

### Added

- **🌙 The Long Night** — a seventh curated scenario, and the first doorway into
  the day/night cycle shipped in v1.13. No seasons at all: the only clock is the
  sun, sight collapses to 28% of its daytime reach at midnight, and predators
  and prey go blind together. Seed 64 was earned, not guessed — an 18-seed sweep
  scored candidates on surviving the dark with a genuinely *mixed* pond, and it
  came back with a world that holds ~180–300 creatures, settles at a ~55%
  carnivore share, and carries 13 living species past 6,000 ticks.
- A **time-of-day readout** on the world badge (🌞 Day · 🌆 Dusk · 🌙 Night ·
  🌅 Dawn), shown only while the cycle is running. Until now the night was
  invisible: creatures simply went short-sighted for no reason a watcher could
  see. Backed by `environment.js#dayNightPhase(tick, config)`, a pure 0..1
  daylight value that mirrors the existing `seasonPhase`.
- **Three new chronicle events**, one-shot so a repeating cycle can't flood the
  feed: the first nightfall (naming how far sight shrinks), the first dawn that
  ends it, and — the one worth waiting for — the first kill made in the dark.
- **New tests** (`test/environment.test.js`, `test/chronicle.test.js`,
  `test/scenarios.test.js`): the phase's noon/midnight/dawn/dusk values and 0..1
  range, its exact agreement with the vision factor creatures actually feel, the
  night events firing exactly once each and in order, no night events at all
  when the cycle is off, and The Long Night reaching both full daylight and true
  dark while still hunting.

### Notes

- Nothing here touches the simulation: the new phase function is display-only,
  the chronicle remains a pure observer that draws no randomness, and the night
  events are guarded on `dayNightCycle`, so a world with the cycle off writes
  exactly the chronicle it wrote before. 112 tests, all green.
- The badge and scenario chip live in `main.js`/`style.css`, outside
  `node --test`'s reach, so they were checked in headless Chromium against the
  real `app/index.html`: the chip launches seed 64 with `night=1&sea=0` in the
  permalink and every control synced, all four times of day appear on the badge
  as the clock turns, no readout appears with the cycle off, the three night
  lines land in the chronicle feed, and the console stayed clean.

## [1.13.0] — 2026-07-24

A day/night cycle: creatures go effectively night-blind on a schedule.

### Added

- **Day/night cycle** toggle (opt-in, off by default). When on, the effective
  vision radius used to find food, prey, and threats breathes on a fixed
  period — full at "noon," shrinking on a smooth cosine to
  `nightVisionFactor` (35% by default) at the deepest "midnight," and back —
  so a pond swings between confident daytime foraging/hunting and a much
  shorter-sighted, more cautious night, with no new sense or gene needed.
  `dayLength` (ticks per full cycle) and `nightVisionFactor` are tunable.
- `environment.js` gains `dayNightVisionFactor(tick, config)`, the pure
  function driving it — deterministic in `tick` alone, mirroring the existing
  `seasonalFactor`. The "show vision radius" overlay now draws the true
  shrunk radius so what you see matches what creatures can actually sense.
- A new **Day/night cycle 🌙** checkbox in the controls panel, wired through
  permalinks (`night=1`).
- **New tests** (`test/environment.test.js`, `test/world.test.js`) covering:
  a constant factor of 1 when off, the [nightVisionFactor, 1] range and noon/
  midnight extremes when on, determinism, a world surviving and staying
  reproducible with it enabled, bit-for-bit-unaffected worlds with it off,
  and `World.visionFactor` tracking the cycle tick-for-tick.

### Notes

- Off by default and draws zero randomness in either state — `dayNightVisionFactor`
  returns a constant `1` whenever the flag is off, so it can be multiplied in
  unconditionally and every existing world, including the default seed-314
  pond, stays bit-for-bit identical. 108 tests, all green.
- Touches `render.js`'s vision-overlay draw call (outside `node --test`'s
  reach, no DOM in plain Node), so I sanity-checked it in headless Chromium
  against the real `app/index.html`: the checkbox starts unchecked, toggling
  it updates the permalink hash both ways, the sim keeps ticking with it on,
  the vision-radius overlay and creature inspector still work with it
  enabled, and the console stayed clean throughout.

## [1.12.0] — 2026-07-24

Accessibility: reduce motion on request (or automatically, from the OS).

### Added

- **Reduce motion** toggle in the controls panel. When on, the renderer clears
  each frame fully instead of painting a translucent veil, so creatures no
  longer leave comet-tail smears behind them — the app's main continuous-motion
  effect.
- The toggle **defaults to the OS-level `prefers-reduced-motion` setting** on
  load, and keeps following it live if the visitor changes that OS setting
  mid-session, while still being freely overridable by hand either way.

### Notes

- Pure rendering preference: `Renderer.reducedMotion` only changes how a frame
  is painted, never simulation state, so it draws no randomness and every
  world stays bit-for-bit identical regardless of its setting. `render.js` and
  `main.js` are outside the `node --test` suite (no DOM/canvas in Node), so
  this was sanity-checked in a real headless browser (Chromium via Playwright)
  against `app/index.html`: the checkbox starts unchecked with no OS
  preference, starts checked when the OS prefers reduced motion, toggles
  cleanly by hand in both directions, and the simulation keeps ticking with it
  on — all with a clean console.

## [1.11.0] — 2026-07-24

Observation: export the live chart as CSV.

### Added

- **Export CSV** button next to Save/Load/Share. Downloads the population,
  food, and max-generation history that already drives the live chart as a
  `tick,population,food,max_generation` CSV file, named with the current seed
  and tick, so a visitor can pull the raw numbers into a spreadsheet of their
  own instead of only eyeballing the sparkline.
- `Stats.popHistory` entries now carry their `tick`, and `Stats.toCSV()` is a
  new pure, read-only formatter — it only serialises what `sample()` already
  recorded and never touches simulation state.
- **New tests** (`test/stats.test.js`) covering CSV formatting on an empty and
  a populated history, and that a real `World` run records an increasing
  `tick` on every sampled row.

### Notes

- Pure observation feature: no RNG draws, no config flag, no change to any
  simulation state, so every world remains bit-for-bit identical. Verified the
  button in a real browser (Chromium via Playwright) — it triggers a valid CSV
  download with no console errors.

## [1.10.1] — 2026-07-24

Landing page: say plainly that the site keeps evolving on its own.

### Changed

- The landing page now invites visitors back. The final call-to-action carries a
  highlighted note — *"And it's never finished. I wake up every six hours, make a
  change to this app, and deploy it — on my own. Come back again to see where we
  are."* — and the "How it grew" timeline gains a **v1.10 → ∞ · The autonomous
  era** entry marking the handover to the self-running six-hour loop.

### Notes

- Landing-copy and styling only; no simulation, RNG, or config behaviour is
  touched, so every world stays bit-for-bit identical.

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
