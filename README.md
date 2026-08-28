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

And in some worlds it goes further: a lineage evolves to stop grazing and start
*hunting* other creatures, and a whole **predator–prey arms race** ignites —
warm-glowing hunters chasing shoals of cool-coloured prey. Nobody programmed the
predators either.

Under the water there is a **key** to it, the way a tank is labelled: what an
arrowhead is, why two creatures are the same colour, what a fading one is short
of, what the long-nosed ones do. It lists only the marks the pond you are
looking at can actually draw, so switching a rule on adds its row.

A live **Tree of Life** below the pond tracks the whole thing as a phylogeny —
you can watch species branch, sweep to dominance, and go extinct in real time,
and click any lineage to spotlight it. A **Chronicle** narrates the pond's
natural history as it unfolds — first blood, population crashes, a species rising
to dominance and later going extinct. The world even has **seasons** (food booms
in summer, bottlenecks in winter) and **biomes** (fertile patches where food
concentrates), so *when* and *where* a creature lives both matter.

No install, no build step, no dependencies. Just open it in a browser.

New here? The **Scenarios** strip at the top offers thirteen one-click worlds — from
a calm herbivore *Genesis* to a full-blown *Savanna* food web to *The Plague*, where
a pathogen sweeps the pond in waves, to *The Commons*, where a herd can eat the pond
bare, to *The Lay of the Land*, where the ground itself decides where life can be —
each a hand-picked doorway into what the simulation can do.

> ### ▶ **[Launch the live demo](https://getravi.github.io/claude_imagine/)**

![The Vivarium interface: a teeming pond of glowing creatures with a live stats panel](docs/screenshots/vivarium.png)

---

## What am I looking at?

| Before evolution (tick ~300) | After evolution (tick ~6000) |
| :---: | :---: |
| ![Sparse founders](docs/screenshots/early.png) | ![Teeming pond](docs/screenshots/pond.png) |
| ~45 random founders drift aimlessly among abundant food. Most will starve. | The descendants of the few competent foragers now fill the pond — cool-coloured grazers with warm-glowing predators hunting among them. |

- **The line above the pond says what is happening, right now, in one
  sentence.** It is the one thing on the page you can read without knowing
  anything: *"They hunt each other now: 34 of the 190 live on meat, and 512 have
  been eaten."* It picks the most urgent true thing — a crash outranks a
  takeover, four survivors outrank everything — and holds it long enough to
  read.
- **The side panel opens with six numbers, not thirty.** *Alive, Food, Born,
  Died, Generations, Eaten* — the ones you can read without being told what
  they mean. The other twenty-four are one tap away under **More numbers**,
  sorted into *Hunting*, *Bodies and brains*, *Energy*, *Rules in play* and
  *This run*, each with a plain sentence saying what its numbers are for. They
  also got their real names there: the tile that said `Web 🕸️` says
  *Hunters' reach*.
- **The animals have names, and one button hands you one.** Press **👋 Meet
  somebody** (or <kbd>M</kbd>) and the pond picks the creature with the best
  story in it right now — the last of a family, the parent of half the pond,
  the biggest hunter in the water — selects it, follows it, and introduces it:
  *"👋 Meet Robin of the Shale Sprigs — parent to more of this pond than anyone
  else. They graze on plants, have raised 8 young, and were here when the pond
  began."* Every creature has a name now, in the panel and on the follow badge,
  instead of `Creature #147`.
- **Each glowing chevron is a creature.** Its colour is an inherited trait, so
  a lineage shares a colour family — you can watch one lineage's colour take
  over the pond as it out-competes the others.
- **Dagger-shaped creatures with an amber eye are carnivores.** The eye — a
  bright disc inside a dark rim, growing with how carnivorous they are — is the
  clearest mark in the pond, and it is a *luminance* mark, so it reads with any
  colour vision (see the colour audit in [SCIENCE.md](docs/SCIENCE.md)). They
  hunt smaller creatures instead of grazing, and flash when they land a bite.
  Plain chevrons are herbivores. This is the diet gene, and it *evolves*.
- **The green motes are food.** Grazing restores energy; moving and merely
  existing cost energy. Run out and you die. Food concentrates in **biomes**
  (faint fertile glows), so creatures cluster there.
- **A season badge** (top-left of the pond) tracks the year: food blooms in
  summer and grows scarce in winter, and the background tints cool or warm to
  match.
- **Brighter creatures have more energy.** Dim ones are starving.
- **The mortality bar** (in the side panel) says what the pond is actually dying
  of — starved, aged out, or hunted — over the last 120 deaths, next to the mean
  lifespan. Most worlds are ~80% starvation; the predator/prey drama the pond is
  famous for is usually a tenth of it.
- **No creature has a goal, a score, or a reward.** They just run inherited
  neural networks. Foraging, fleeing, hunting, and loitering in food-rich
  patches are *emergent* — selection, not code.

### The Tree of Life

Below the pond, a live **Muller plot** groups creatures into species by genetic
similarity and stacks each species' *share of the pond* over time — every column
is exactly full, so a band's thickness is a fraction and never a headcount:

![The Tree of Life: a Muller plot of species rising and falling over time](docs/screenshots/phylogeny.png)

A band **widening** is a lineage sweeping to dominance — of the pond, not
necessarily in numbers, which is a distinction worth holding on to; a band
**pinching into existence** is a new species branching off as a lineage drifts;
a band **pinching shut** is an extinction. The **x-axis under the plot** marks
the ticks, so an event has a time you can read off rather than estimate. Click any species (in the legend, or via a
creature's inspector) to **spotlight** it — the whole pond dims except that
lineage, so you can see where it lives and how far it has spread.

Every lineage has a **name**, and the name is two words whose first is the
family: the *Shale Fins* and the *Shale Skimmers* both branched off the *Shale
Sprigs*, and *Dusk Spindle* is nobody's relation. So the legend reads as a
family tree at a glance, and the Chronicle can tell you that *"the Shale
Skimmers have split away from the Shale Sprigs"* rather than that species 41
branched off species 0. Names come from the tree alone, so the same seed always
gives back the same cast, and each one keeps its number in its tooltip.

Each band also wears a **hatch** — plain, `/`, `\`, `|`, `—`, `×` or `+` — and
so does its chip in the legend, because the colour alone was never enough to
name a lineage. A species' hue is its founder's and hue is inherited, so a
daughter species is drawn in its parent's colour: the default pond puts four of
its eleven bands at the same hue, and one seed puts six of nineteen there. The
hue still tells you *which family a lineage came from*, which is true and
useful; the hatch tells you *which band you are looking at*. See
[SCIENCE.md](docs/SCIENCE.md) for the measurement, including why no palette
could have fixed it.

## Controls

| Control | What it does |
| --- | --- |
| **Scenarios** (top strip) | One-click curated worlds — a seed + feature combo chosen to showcase a particular character (Genesis, The Savanna, Nomad's Land, The Long Night, The Plague, The Commons, The Lay of the Land, The Four Rooms, Earshot, One Big Family, The Thinking Pond, Augmented Minds, The Whole World). |
| **Pause / Play** | Freeze or resume time (you can still click to inspect while paused). |
| **Reset** | Rebuild the world from the current seed. |
| **Feed** | Scatter a burst of extra food. |
| **Seed life** | Drop in fresh random creatures (handy after a crash). |
| **Seed** | The number that determines the entire history of a world. Same seed → same world, every time. Share a seed to share a world. 🎲 picks a random one. |
| **Speed** | Simulation steps per frame (1×–20×). Crank it up to fast-forward evolution. |
| **Rules & settings** | Tune food rate, metabolism, and mutation rate *while it runs* and watch the ecosystem respond, then work down the thirty-one switches under them. Sectioned since v1.120, and the last section is the one worth knowing about: six of those switches change only the *picture* — the trail, the reach, the vision cone, the refuge line, follow and reduced motion — and leave the pond running bit for bit as it would have. Everything above them rewrites the world. |
| **Predation** | Toggle whether carnivores can hunt. On by default — turn it off for a pure-herbivore world. |
| **Scavenging** | Toggle whether dead creatures leave corpses that carnivores can feed on — a nutrient cycle and a scavenger niche. Off by default. |
| **Licensed diet cost 🧾** | Toggle whether the bill for carnivory follows the *licence* to hunt. Both prices of the diet gene — the metabolic upkeep and the share of every pellet a carnivore gives up — have been charged in proportion to the gene since v1.1, while `carnivoreThreshold` refuses to admit a body below 0.55 to the hunting rule at all: the licence is a step and the bill is a ramp, and a median **60.7%** of the upkeep is paid below the line by animals that will never once be allowed to hunt. Switch this on and an unlicensed body pays nothing and keeps its whole pellet, while every licensed body pays exactly what it always did. What it does is not what removing a cost is supposed to do: the pond gets richer (population up on **eleven of twelve** seeds, median +30%) and *less* carnivorous (the carnivore share falls on seven of twelve, median 45.5% → 11.5%, with five ponds holding no carnivore at all), because the gate turns the threshold into a **cliff** — the whole licensed bill now arrives in the single mutation that crosses it. Where a lineage does cross, the bigger pond feeds it: kills rise on nine of twelve. Off by default. The twelve-seed measurement is in [SCIENCE.md](docs/SCIENCE.md). Watch the *Cost of meat 🧾* stat. |
| **Seasons** | Toggle the yearly food cycle. On by default — turn it off for a constant climate. Watch the *Lag* stat: how far behind the year the pond itself is running, measured against the season's own sine wave rather than by averaging halves of it. It reads `off` without a year to be behind and `…` until the run spans three years past its opening transient, because a phase estimate needs whole cycles and a number the record cannot support is worse than no number. |
| **Biomes** | Toggle whether food concentrates in fertile patches. On by default — turn it off for evenly-scattered food. Watch the *Biome* stat — how much more fertile the ground under the living is than this pond's own average, and exactly `off` when nothing is sowing into the patches. The pond sits at about **+0.089** there on twelve seeds of twelve, which is almost exactly the bias a pellet is *sown* with (+0.092) — while the crop still standing reads +0.024, inside the noise of the same pellets scattered at random on ten of the twelve. Fertile ground is not where food piles up; it is where a pellet is eaten fastest. The three-arm measurement is in [SCIENCE.md](docs/SCIENCE.md). |
| **Drifting biomes** | Toggle whether the fertile patches slowly roam, so the food landscape keeps shifting and creatures must migrate to follow it. Off by default. |
| **Regrowth** | Toggle food that grows from food: most new pellets are seeded next to an existing one, and the crop grows fastest when there is most of it. A herd can strip a patch bare and then has to wait for it to grow back, so the pond swings through boom-and-bust cycles. Off by default. Watch the *Food* stat. |
| **Contagion** | Toggle a pathogen that spreads by proximity: the sick burn extra energy for a while, survivors are immune for life, and newborns are susceptible again — so the epidemic returns in waves. Every case draws its *reach* — a blue disc of `infectionRadius`, in the pond and on the minimap, which stacks where cases overlap at exactly the rate the per-tick risk does. Off by default. Watch the *Sick*, *Immune* and *Contagious* stats — the last being the share of the water inside somebody's catching distance — and click a creature for its *Health* row, which names where that one is in the epidemic and counts down its recovery. |
| **Signalling** | Toggle whether creatures can *hear* one another. Every brain has always emitted a "colour signal" that nothing could perceive; switch this on and the loudest call within earshot becomes a sense, wired in through evolved ear genes, and calling costs a little energy. Off by default. Watch the *Heard* stat, and click a creature for its *Voice* row: what it is saying, and the loudest thing reaching it. |
| **Terrain** | Toggle a landscape. The ground stops being uniform: a static, seed-derived roughness field makes rough ground both expensive to cross and reluctant to grow food, so the pond gathers into its basins. Drawn as contour lines under the world. Off by default. Watch the *Ground* stat — how much flatter than average the ground under the living is, and exactly `off` when there is no landscape to measure against. |
| **Barriers** | Toggle rock. Four seed-derived walls — two north-south, two east-west, wrapping like everything else here — cut the pond into four rooms joined by 44-pixel gates, and a creature that meets one loses the half of its velocity that pointed into the rock and slides along it until a gate turns up. Nothing perceives a wall, and by default only *bodies* are stopped — see **Opaque rock** for the other half. This is terrain's unfinished business — v1.23 found that a movement cost buys no spatial structure in a well-mixed world, and rock is the remedy that attacks the mixing rather than the cost. It works: room changes fall three- to six-fold, and creatures either side of a wall end up about 18% further apart genetically than creatures on the same side, a signal that nearly vanishes if you measure it against lines drawn half a room over. Off by default. Watch the *Walled* stat — how often rock is turning somebody back, per hundred ticks. |
| **Opaque rock** | Toggle whether the walls block *information* as well as bodies (needs **Barriers**). With it on, sight, earshot, a mate search and the pathogen all stop at rock: a room becomes somewhere to hide as well as somewhere to be stuck, and a predator can no longer track something it cannot see. Teeth needed no rule of their own — a hunter bites what it homed in on, and it can no longer home in through a wall. Select a creature and turn the vision overlay on to watch it: the sight circle stops being a circle and becomes the shape sight actually takes, with the walls' shadows cut out of it. Off by default. |
| **Detritus** | Toggle whether the ground remembers its dead. A body leaves nutrient in the ground under it, the nutrient rots away over a few hundred ticks, and about a quarter of the pond's new food grows out of it — so the crop stops being a rate and becomes an inheritance. Drawn as warm ochre stains under the water and on the minimap. Off by default. Watch the *Soil* stat: the share of new food currently growing where something died, and exactly `off` when nothing is being remembered. |
| **Ground sense** | Toggle whether creatures can feel the roughness of the ground they are standing on — one more number into every brain, wired in through evolved foot genes. A creature is told what is under it and never which direction is smoother, which is the information a bacterium has and enough, in principle, to concentrate a population in the good places. It does not: the wire really does reach the motor commands, and selection is indifferent to it, because terrain's movement cost is too small to be worth avoiding. That null result — with the scrambled-input control that produced it — is written up in [SCIENCE.md](docs/SCIENCE.md). Off by default. Click a creature and watch its *Underfoot* reading. |
| **Whisker** | Toggle whether creatures can feel the rock in front of them (needs **Barriers** to have anything to feel) — one more number into every brain, wired in through evolved whisker genes, reading `1` with rock against the nose and `0` at sixty pixels and beyond. v1.48 and v1.50 both closed with the same sentence — *nothing perceives the rock* — and it stood for fifty-three releases. It is perceived now, and selection is indifferent to it: against a scrambled control reading the rock ninety degrees to the left, refused moves fall on eight seeds of twelve, which is what a coin gives. The reason is the interesting part and it is not v1.33's — the pressure is real (rock cuts room changes three- to six-fold) but a creature that meets a wall already slides along it until a gate turns up, so the physics performs the only policy a forward-facing scalar could teach. The three-arm measurement, and the rule it leaves behind, are in [SCIENCE.md](docs/SCIENCE.md). Off by default. Click a creature and watch its *Whisker* row. |
| **Exact vision** | Toggle whether a creature can really see as far as `visionRadius` says. What it has actually searched since v1.0 is the 3x3 block of spatial-index cells around it — a guaranteed **18 px** of the configured 168, reaching further only in whichever directions its position inside its cell happens to favour, so sight was grid-aligned and 1.5% of glances at food landed on the wrong nearest pellet. (Eighteen, not the 126 of one cell: the cell size does not divide the world, so the last column is an 18-px stub and the block can only promise the narrowest neighbouring cell — see [SCIENCE.md](docs/SCIENCE.md), where v1.76 audits every rule in the pond against that number.) Switch this on and every sense query covers the radius it asks for. Off by default, because it is a correction rather than a rule: it moves every world off the trajectory earlier versions recorded. Turn on **Show vision** and the overlay draws the region actually searched, not just the circle. |
| **Death is final** | Toggle whether a dead creature stops acting *immediately*. Since v1.0 the update loop has had no `dead` check on the creature it is updating: death is marked at the top of a creature's turn and the body is not swept until the end of the tick, so grazing, biting and reproduction all happen in between. The dead therefore eat (7–13 pellets per 20,000 ticks), steer and pay metabolism (7–302 turns), and very occasionally reproduce (once in twelve runs). Every *other* `dead` check in the simulation already exists — a corpse is skipped as prey, as a neighbour, as a mate, as an infection source — so the only one who disagreed was the corpse. Off by default, because like **Exact vision** it is a correction rather than a rule and it deals every world a different hand. What it fixes for certain is the books: with it on, `energy_buried_predation` is exactly `0.00` on every seed. The twelve-seed measurement is in [SCIENCE.md](docs/SCIENCE.md). |
| **Shuffled turn order** | Toggle whether being *old* stops paying. The simulation sweeps its population array one creature at a time, and that array is birth order — survivors keep their places, newborns are appended — so a founder sits near the front for life and every contest inside a tick is settled by seniority: two creatures on one pellet, the earlier index eats. That happens to **4.5% of every meal the pond takes** (2.4–8.0% across twelve seeds). Switch this on and a fresh random order is drawn each tick, which is the *control* for a rule this project has always had and never wrote down — there is no "off", because somebody has to go first. What it is worth in aggregate: nothing measurable. Off by default (drawing a permutation moves every world). The three-arm measurement is in [SCIENCE.md](docs/SCIENCE.md). |
| **Solid bodies** | Toggle whether two creatures can occupy the same point. Space is the last thing this world handed out for free: food gathers in biomes, rough ground costs more to cross, rock refuses a step — and nobody has ever been *in the way*. With this on, any two bodies that overlap are pushed apart along the line between them, each giving up half the overlap, in a single pass computed from one instant and applied all at once (the only exactly simultaneous rule in the tick). It is a relaxation rather than a solver: a pond of ~220 shoves about **32 pairs a tick** and still ends every tick holding 0.82 overlapping pairs for each one it just separated. What it is worth: standing overlap falls **69.7%** on twelve of twelve seeds, and the pond's deepest intrusion drops from 13 px to under 2 — but an arm that displaces the same pairs the same distance *at right angles*, separating nothing, takes back three-quarters of the first, all of the extra spacing, all of the recovered meals and all of the reduction in pile depth. What exclusion turns out to own is a *depth*, not a spacing. Off by default. The three-arm measurement is in [SCIENCE.md](docs/SCIENCE.md). |
| **Mass-weighted shove** | Toggle *who* has to leave. Solid bodies split every overlap down the middle, whatever the two creatures weigh; with this on the split is inverse to body mass (area, `r²`), so the smaller body gives up most of the ground — up to 84/16 at the extremes the config allows. It hands the size gene a third job, on top of the metabolic bill it already pays and the predation threshold it already clears. What it is worth: **nothing, and for a reason worth reading.** The median overlapping pair in this pond has a mass ratio of **1.021** — a 50.5/49.5 split — because body radius has converged to 7.4–7.75 ± 0.09–0.45 out of a possible 3.5–8.0. `preySizeRatio` (1.1) and `bodyRadiusMax` (8.0) put an absolute predation refuge at **7.273 px**, and a mean of **75.7%** of the pond has evolved past it. Mean body radius over 20,000 ticks is higher with the rule on seven seeds of twelve, which is a coin toss. Selection cannot act on a difference the population no longer contains. Off by default, and inert unless **Solid bodies** is on too. The measurement is in [SCIENCE.md](docs/SCIENCE.md). |
| **Sexual reproduction** | Toggle crossover: reproducing creatures mix genomes with a nearby partner instead of cloning. Off by default. |
| **Neural plasticity** | Toggle within-lifetime learning: brains adapt as they live, and lineages can *evolve to learn*. Off by default (turning it on steps into a different regime — see below). |
| **Evolvable brains (NEAT)** | Toggle evolvable topology: brains start minimal and grow their own structure over generations. Off by default; flipping it restarts the world with graph-based brains. |
| **Chart history** (<kbd>H</kbd>, or the pill on the chart) | Flip the population chart between the **recent** window — the last 1,920 ticks, as it has always shown — and the **whole run** from tick 0. The long view halves its own resolution as it fills, but a translucent band behind each line carries the exact range each thinned point stands for, so no boom or crash is ever quietly smoothed flat. **Export CSV** follows the chart, and the whole-run file carries those min/max columns. Both files also carry the pond's **energy books** and every counter it keeps — births, kills, scavenging bites, deaths by cause — cumulatively, so subtracting one row from the next gives exactly what happened in between however far the archive has thinned. |
| **The chart's y-axis** | The population line has been drawn against the run's own record since v1.0 — so the same height meant a different number an hour later, and every new high-water mark silently rescaled the history already on screen. It now has a **round ceiling and labelled gridlines**: a scale that only moves in visible steps, and says so when it does. Food keeps its own fixed scale (`0–520` in the legend), because a scale that never moves needs no marks. |
| **Death strip** (under the chart) | The same stretch of time as the chart above it, stacked by cause: pale gold starved, slate aged, crimson hunted. The mortality bar answers what is killing them *now*; this one keeps its shape, so a trough in the population line has a colour underneath it — and on the whole-run scope the totals stay exact however far the archive has thinned. |
| **Power strip** (under the death strip) | The pond's books as two lines on the chart's own clock: what it **mints** per tick, solid, and what it **spends**, dashed. Both are 120-tick trailing means — the same window the live *Power* readout uses, so the right-hand end of the line is that number — and the band between them is the energy standing in the pond rising or falling, exactly, because `created − destroyed = standing` holds at every tick. |
| **How big they are 📏** (under the chart stack) | The pond's bodies counted into bars 0.15 px wide, grazers in the chart's blue and carnivores in the death strip's crimson, with two rules over them: the refuge line where it falls, and the pond's mean body radius drawn dashed in the same ink. Every other figure on this page has time, space or descent along the bottom; this one has **a property of a creature**, and its axis is the whole range a genome can express rather than the range this pond happens to occupy, so the picture means the same thing from one minute to the next. It is worth watching because the pond turns out not to be a spread at all: over twelve seeds at 6,000 ticks a median of **7.5 of the thirty bars** hold anybody, one 0.15 px bar holds a third to four fifths of the population, and on two of those twelve there is **no body within a fifth of a pixel of the pond's own average size**. The caption carries that number — the mean, and how far the nearest creature is from it — and says `nobody in its bar` when the mean's rule stands in an empty one, which is 18.0% of the instants measured. The measurement is in [SCIENCE.md](docs/SCIENCE.md). |
| **Too big to eat 🔒** | What share of the pond nothing here can eat, and where that line is. `preySizeRatio` (1.1) and `bodyRadiusMax` (8.0) have sat beside each other in the config since v1.0, and their quotient is a rule nobody wrote: a body at or above **7.273 px** — the top 16% of a size range that starts at 3.5 — is beyond the largest hunter this world is capable of growing. The default pond passes half by **tick 600** and spends the rest of a long run between 88% and 100%. What that does *not* mean is an arms race won: on twelve seed-matched pairs, a pond with `predation` switched off grows into the refuge just as readily (higher on six seeds, lower on five). What predators own is a **floor** — every pond with hunters ends above 6.4 px average body radius, and four of twelve without them settle below 5.5. Reads `off` where nothing hunts. The measurement is in [SCIENCE.md](docs/SCIENCE.md). |
| **Safe from hunters 🛟** | The same question asked of the pond instead of the config: the largest body in the water whose diet gene clears the carnivore threshold sets a line at `hunterCeiling / preySizeRatio`, and this is the share of the living beyond **that**. The tile above quotes a predator at 8.0 px, which most ponds never grow — so the two disagree by a mean of **43.1 points** of the population over twelve seeds at 6,000 ticks, and never in the other direction, because a living hunter cannot be bigger than the biggest this world allows. Three seeds read under 1% on **Too big to eat** while more than nine tenths of the pond is out of reach of everything alive; two hold no hunter at all, where this reads `all — no hunter` rather than a percentage against a line nobody draws. The gap is not about hunting — a pond with `predation` off shows the same 43.8 points — it is the distance between the predator the config permits and the one the genes express. Reads `off` where nothing hunts. The measurement is in [SCIENCE.md](docs/SCIENCE.md). |
| **Show the refuge line 🔒** | Draw the tile above as a picture. Every body the size rule can still reach gets the 7.273 px circle around it, and a body past the line gets nothing — so the pond's size structure is one glance rather than a percentage, and the mark's *absence* is what it says. It is the only thing here drawn at a radius that does not depend on what it is drawn around, which makes every ring the same circle and turns "how big is this one" into "how much of its ring does it fill". Watch the default pond empty out: 80% of bodies ringed at tick 0, 17% by tick 1,000, 1% by 6,000. That is not an arms race being won — see the row above, and [SCIENCE.md](docs/SCIENCE.md) for what a picture of a line can and cannot be used to say. Off by default; needs **Predation**, since a pond where nothing hunts has no refuge to be inside of. |
| **Show the trail 🧭** | Draw where the selected creature has been: its last 300 ticks as one line ending under its body. Every other picture on this page draws where things *are*, and a position is the one thing a creature carries whose meaning is a history — (400, 300) says nothing, and four hundred ticks spent inside forty pixels of it says the animal is working a patch. 300 ticks is a little under one crossing of the pond, so a forager loops visibly inside a biome and a hunter's charge is a straight line. The world is a torus and the line knows it: a creature that crosses the seam gets one path running off the edge of the canvas, not a jump across the pond. Ticking the box also says the path out loud for anyone listening — how far it swam, how far that got it, and which of the three it was. Off by default; needs somebody selected. |
| **Show the reach 📏** | Draw how close something has to be before the selected creature's rules fire. Everything else in this list is a *sense* — how far it can see, where it has been, which side of the size rule it is on; this is the other half, and the rings are much smaller than the sight circle around them (11–16 px against 168). A rule that reads one body — eating a pellet — fires at one distance and gets one solid ring. A rule that reads two, like a bite, has no single distance at all: the solid ring is what it reaches against the *smallest* body this world grows and the dashed one what it reaches against the largest body it is allowed to eat, and which applies depends on what it meets. That band is 18% of the reach and **30% of the moments a hunter is in contact range** of something it may eat fall inside it, so a single circle would be the wrong picture a third of the time. A creature under 3.85 px gets no bite ring, because there is nothing in the pond small enough for it to eat — the mark's absence again. Ticking the box says the distances out loud for anyone listening; the rings themselves carry no numbers. Off by default; needs somebody selected, and best seen zoomed in. |
| **Cost of meat 🧾** | What the diet gene costs, against the meals it actually buys. Carnivory is charged twice and neither charge asks whether there is anything to eat: `carnivoreMetabolicCost` drains every tick in proportion to the gene, and `plantPenaltyFromDiet` shrinks every pellet the same way. **The licence to hunt is a step at 0.55 and the bill for it is a ramp from zero**, so a grazer carrying a diet gene of 0.3 pays three tenths of both prices for a rule that will never admit it. The tile shows the pond's upkeep per tick and how much of it is going to bodies with an empty eligible set: over twelve seeds at 6,000 ticks that share runs **40% to 100%, median 96%**, and on four of the twelve — including the pond on the landing page — it is exactly 100. The bill itself is a median **24% of what those same bodies pay simply to be alive**. It is the only tile here that says anything in a world with **Predation** switched off, and what it says is that the pond keeps paying: the toll with hunting off is a median 0.86× the toll with it on, and on two seeds it is *higher*. The measurement is in [SCIENCE.md](docs/SCIENCE.md). |
| **Family spared 👪** | Meals declined for being family, and how fast they are being declined now. Kin recognition has been a toggle since v1.10 — a predator whose target is within `kinRecognitionDistance` (0.05) of its own genome lets it go — and until v1.80 nothing on this page said whether it had ever happened. It usually has not: on twelve seeds run 20,000 ticks with the flag on, **nine never spare a single relative**, and in those ponds the world with the rule on is *bit-for-bit* the world without it. The three that do are emphatic — seed 512 spares 8,800, seed 23 spares 19,598 and peaks at 798 per hundred ticks — because they evolve a largely clonal pond that eats itself, while the rest split into predator and prey lineages that were never related in the first place. The pond on the landing page (seed 314) is one of the nine, and seed 512 is the *One Big Family* scenario, which exists so that this tile has a door of its own. A total of **0** is this tile's most interesting reading, which is why it shows a total and not only a rate. Reads `off` where nothing hunts. The measurement is in [SCIENCE.md](docs/SCIENCE.md). |
| **Size at death** (under the mortality bar) | What size of body each way out of this world takes, against the pond that survived the tick it took it — signed, in pixels, run-to-date. Two of the three columns are the control and they are supposed to read zero: over twelve seeds and 20,000 ticks hunger takes a body **−0.008 px** from the pond around it and old age **+0.019**, while predation takes one **−1.448 px** smaller, negative on twelve seeds of twelve. It is the mechanism under the floor predation puts beneath body size — and the second control says the whole of it is `preySizeRatio` arithmetic rather than anything about the chase: measured against the mean of each hunter's own *eligible set*, a victim sits **−0.092 px** away, on 2,807 kills. Hunters take the nearest body they are allowed to eat, and are no better at catching a small one than a large one. The measurement is in [SCIENCE.md](docs/SCIENCE.md). |
| **Save / Load** | Snapshot the whole world to your browser's local storage and restore it later. |
| **Share 🔗** | Copy a permalink that encodes the seed and parameters — hand someone the exact world you're watching. |
| **👋 Meet somebody** (<kbd>M</kbd>) | Hands you an animal instead of asking you to find one. The pond is ranked by how much of a story each creature has — the last surviving member of a family that was once several, the parent of more of the pond than anyone else, the biggest hunter, a giant, the oldest, and, when nobody has a story, whoever is best fed — and the winner is selected, followed and introduced by name in one plain sentence. The choice is arithmetic, not a coin: the same pond gives back the same animal. |
| **🏅 Worth watching** (under the pond) | The shortlist **👋 Meet somebody** picks off, on the page — one row per stand-out, in the pond's own order of interest, each a button that selects that animal and sends the camera after it. The board's first row *is* what the button would have handed over: both read one list, so they cannot disagree. A row is a claim, so a row that is not true is not drawn — on a young pond where nobody has yet outgrown, outlived or outbred anybody, the board says so in one line rather than naming five arbitrary animals. And one animal never appears twice: over twelve ponds sampled to 6,000 ticks, **18.2% of instants have somebody holding two roles**, usually *parent* and *oldest*, which in a settled pond are nearly the same claim. |
| **🏆 Pond records** (under the pond) | The one surface here that does not forget an animal when it sinks. Three all-time bests, kept from the first tick: the most young anybody has raised, the fullest the water has ever been, and the largest family it has grown. **57% of the time the young record names somebody already dead** — everywhere else on this page a name is a living animal you can go and look at; here it is usually somebody the pond buried and has not beaten since. The two records you would expect and will not find are the finding: the longest life lands on **4,199 of a possible 4,200 on six seeds of six** — it climbs by one every tick until it hits `maxAge` and then never moves — and the biggest body is within 0.2 px of its final value **by tick ten**, because body size is drawn at birth. Both are facts about `config.js` rather than about this pond, so the board spends those rows on the pond itself, where the numbers have no ceiling to walk into. |
| **Click a creature** | Open the inspector: its name (*Pip of the Amber Whorls* — the number is the tooltip), one plain sentence saying what kind of animal it is, its generation, age, energy, offspring count, diet, **species**, body traits, a colour "fingerprint" of its brain weights, **what it steers by** — every sense ranked by how far it moves this animal's motors right now — and, where those mechanics are switched on, what it is standing on, where it is in the epidemic, and what it is saying. |
| **Choose one with the keyboard** | <kbd>Tab</kbd> to the pond, then <kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd>: the first press selects whatever the view is on, and each one after it steps to the nearest creature in that direction — across the seam, because the world is a torus. <kbd>Enter</kbd> follows the selection, <kbd>Esc</kbd> clears it, and every step is spoken for a screen reader. The whole pond is reachable this way: on twelve seeds, every living creature is at most thirteen presses from where you start. |
| **Zoom & pan** | Scroll to zoom about the cursor (up to 8×), drag to move around, <kbd>0</kbd> for the whole pond again. The world is a torus, so the view can roam forever without meeting an edge. |
| **Follow a creature 🎯** | Double-click a creature (or tick *Follow selected creature*) and the camera rides along with it — the closest you can get to watching one life from the inside. It lets go when the creature dies, or when you take the view back by hand. |
| **Minimap** | The moment the view stops being the whole pond, a minimap appears in the corner: the terrain in banded contours, the rock (when there is any) in solid slate, the enriched ground where things have died, biomes, food, the dead (with scavenging on — a pale square around a dark one, the hunter's badge inverted), creatures (predators wearing the same bright-in-dark badge they wear in the pond) and a bright rectangle showing where you are looking. Click or drag it to move the view — or focus it and nudge the view with the arrow keys — and with terrain on, you can pick the next basin over before you travel to it. At zoom 4 the pond view holds about 7% of the standing corpses, which is what this corner is for. |
| **When they die** (in the inspector) | The panel does not blank — it writes a short life. Who they were, how they died, whether that was soon by this pond's standards, what they ate, and what they left behind, with a button that hands you somebody new. Nothing in it carries a unit: a life is said as a comparison with the middle of the pond's recent dead rather than as a number of ticks, which is both plainer and the more informative of the two. |
| **Ancestry chain** (in the inspector) | The line of species a creature descends from, founder first — dashed pips are ancestors with no living members. Click any pip to spotlight that lineage in the pond. |
| **Tree of Life legend** | Click a species chip (or a creature's "spotlight lineage" link) to highlight that lineage in the pond; click again or **Clear highlight** to reset. Each chip carries its band's hatch as well as its colour, so two lineages that inherited the same hue are still tellable apart. |

## Things to try

- **Start a fresh world and just wait.** For the first ~30 seconds the pond
  looks like it's dying. Then it blooms. That moment — evolution "getting it" —
  is the whole point.
- **Watch for predators.** The default world grows a visible predator/prey mix.
  Keep an eye on the *Carnivores* and *Kills* stats: they rise and fall in
  waves as predators boom, over-hunt, and crash — a live Lotka–Volterra cycle.
  Hit 🎲 a few times; most worlds stay peaceful herbivores, but some ignite a
  full arms race.
- **Turn predation off**, reset, and compare: a calmer, more crowded pond of
  pure grazers. Watch the mortality bar as you do — the orange *hunted* segment
  goes to exactly nothing, the *aged* slice grows, and mean lifespan climbs by a
  couple of hundred ticks.
- **Watch what kills them change.** In a world that grows hunters the bar starts
  orange and turns amber as the prey learn to run; the chronicle marks the
  handover. Turn on *Regrowth* for the bleakest version — dying of old age
  practically stops happening once a herd can strip its own pasture.
- **Ride the seasons.** Since v1.74 the chart says where the year is: the lean
  half is shaded behind the lines. Watch the green food line fall into the
  shading — that much is measured, a 40% thinner standing crop in winter on
  twelve seeds of twelve. The blue line follows it, **late**: v1.78 measured the
  population peaking a median of 632 ticks after the year does, on twelve seeds
  of twelve, which is very nearly a quarter of a 2,600-tick year and is why the
  half-year averages v1.74 ran could not see it at all. v1.86 says why it is a
  quarter: the *birth rate* is in phase with the year, and a population is the
  running total of its births — a stock that responds instantly still peaks a
  quarter of a year late. The *Lag ⏳* stat is
  that number, live, once a run is long enough to have one. Toggle *Seasons* off
  to see the difference a constant climate makes — the shading goes with it, and
  so does the lag.
- **Watch the biomes.** Creatures pile into the fertile glowing patches and
  leave the barren stretches empty; the emptiness becomes a risky crossing.
- **Turn on Drifting biomes** and watch the fertile patches slide across the
  world — the shoals of creatures follow the food, migrating to track it. The
  pond can never settle into a fixed pattern.
- **Turn on Scavenging with Seasons** and watch a winter: as creatures starve, a
  glut of corpses appears — pale bone rings around dark centres, shrinking as
  they rot — and carnivores converge to feed on the dead. Death feeds life.
- **Turn on Contagion** (or hit the *Plague* scenario) and watch the pond wear its
  epidemic: sick creatures pulse with a sulphur halo, survivors keep a dashed blue
  ring for the immunity they earned, and the water inside catching distance of a
  case goes blue — at the peak of a wave, about a sixth of the pond. The *Sick*
  count climbs, crests, and collapses
  as the pathogen runs out of hosts — then climbs again once enough susceptible
  newborns have accumulated. Immunity is never inherited, so the waves never stop.
- **Turn on Regrowth** (or hit the *Commons* scenario) and watch the food become a
  population: pellets thicken into blooms where the crop survived and vanish from
  the ground a herd has worked over. The *Food* stat and the population then
  oscillate against each other — every grazer boom is followed by a bare pond and
  a die-back, because the plants were eaten faster than they could breed.
- **Turn on Signalling** (or hit the *Earshot* scenario) and watch the pond split
  into warm and cool rings — two different things to say, each lineage settling on
  its own. The *Heard* stat is the traffic on the channel: it swells as creatures
  crowd into fertile ground and collapses when the population does. Whether any of
  it ever comes to *mean* anything is genuinely open — see
  [the Science page](docs/SCIENCE.md#signalling-a-channel-that-nobody-could-hear)
  for a control experiment suggesting the pond has not got there yet.
- **Turn on Terrain** (or hit the *Lay of the Land* scenario, which pairs it with
  detritus on a seed whose landscape has real relief) and watch the contour map
  appear under the pond, then watch the *Ground* stat drift negative over the next few thousand ticks as life
  collects in the basins. It is worth knowing *why* it drifts: not because
  anything can see the ground — nothing can — but because the crop grows badly on
  the ridges. Building this turned up a clean negative result, that a movement
  cost alone moves the population by essentially nothing, which is written up
  with the control and the sweep on
  [the Science page](docs/SCIENCE.md#terrain-why-a-cost-is-not-a-landscape).
- **Turn on Barriers** (or hit the *Four Rooms* scenario, which pairs them with
  opaque rock on a seed whose lineages visibly come apart) and watch the pond
  stop being one pond. Four walls appear, the creatures nearest them stop dead
  and start sliding, and within a few hundred ticks each room is running its own
  little economy. It is worth watching
  the *Walled* number rather than the walls: it says how much the layout is
  actually costing, which the picture never will. This is the follow-through on
  terrain's negative result — a spatial pressure needs somewhere to accumulate,
  and a room is somewhere — and the measurement, including the control that
  partitions the very same pond along lines that do not follow the rock, is on
  [the Science page](docs/SCIENCE.md#rock-giving-a-spatial-pressure-somewhere-to-accumulate-v148).
- **Turn on Opaque rock too**, select a creature and press `V`. The vision
  overlay stops being a circle: the walls throw shadows across it, and walking
  the creature's neighbourhood shows sight opening and closing as gates line up.
  It is the same geometry the rule uses, plotted — not a drawing about it.
- **Turn on Detritus** and watch warm patches bloom under the water wherever the
  pond has been losing creatures — then watch pellets start appearing in them. It
  closes the last of this world's unconditional gifts: food used to arrive from
  nowhere at a fixed rate, and a death used to have no consequence at all for the
  place it happened in. The *Soil* stat is the share of the crop currently growing
  out of the dead, and it climbs sharply just after a crash, which is when the
  ground is richest. With *Scavenging* on as well the two nutrient loops compete:
  a corpse a carnivore strips never reaches the soil. What it does to the
  population — and the placement control that says why the obvious explanation is
  wrong — is on
  [the Science page](docs/SCIENCE.md#detritus-a-pond-that-feeds-on-its-own-dead).
- **Starve them.** Drag *Food rate* to zero. Watch the population crash, then
  slowly recover as lean, efficient lineages survive the famine. (Scarcer food
  also makes hunting more attractive — predators often surge in a famine.)
- **Crank mutation to the max.** Evolution gets frantic and unstable — lineages
  can't hold onto good behaviour because their children are too different.
- **Set mutation to zero.** Evolution freezes. Whatever's alive is all you get;
  no new strategies can appear.
- **Watch the colours.** Genetic diversity (top-right stat) starts high — every
  founder is a different colour — and collapses as one lineage wins, then rises
  again as mutations diversify the winners.
- **Read the Tree of Life.** Find a wide band and click it — watch its members
  light up in the pond while everything else fades. Then look for a thin band
  that appears partway across: that's a new species being born from an older one.
- **Follow the Chronicle.** Below the pond, the natural-history feed narrates the
  drama as it happens — leave it running and read the pond's story unfold: first
  blood, booms and crashes, dynasties rising and falling.
- **Switch on Neural plasticity and watch the Learning stat.** Brains start
  fully innate (plasticity is zero in every genome), but if lineages that adapt
  within their lifetime do better, evolution *discovers* learning — the stat
  climbs from zero. Click a creature to see its *inherited* vs *current
  (learned)* brain fingerprints diverge. (This is the [Baldwin effect](https://en.wikipedia.org/wiki/Baldwin_effect).)
- **Switch on Evolvable brains (NEAT)** and click creatures to inspect their
  networks. Founders have no hidden neurons — just direct sense→motor wiring —
  but over generations some lineages grow hidden structure (watch the Brain stat
  and look for the extra node in the graph). Most stay simple, because simple is
  enough: complexity only survives where it earns its keep.
- **Watch where the energy goes.** Under the death toll, the pond keeps books:
  how much energy it has made from nothing, and what became of it. Between 94%
  and 98% of it goes on simply being alive, and the amount standing in the pond
  at any moment is under 2% of what has passed through it — this world doesn't
  store energy, it runs it through.
- **Read the two bars against each other, and notice they disagree.** Under the
  death mix is what each of those deaths *costs* the pond, and it is nothing
  like the mix above it: a creature that starves is buried holding about
  0.03 energy, and one that grows old is buried holding 70. Starvation is three
  quarters of the deaths and a fifth of a percent of the energy the dead take
  with them. A mix of events is not a mix of quantities — see
  [SCIENCE.md](docs/SCIENCE.md).
- **Watch the *Power* stat, which is the only number on that panel that moves.**
  Everything else there is run-to-date and settles; Power is energy minted per
  tick over the last 120 ticks, and across a single run the busiest stretch
  mints eight to twenty times as fast as the quietest. The books are in the CSV
  export too, so the whole history of the pond's throughput is a column away.
- **Find a great world and Share it.** The link encodes the seed and parameters,
  so whoever opens it watches the very same pond evolve.

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

One of them is unusual and worth knowing about if you share links: the suite
carries **recorded hashes of the default pond**, so a change that would quietly
move a world you have already shared fails the build. That trajectory has been
bit-for-bit identical since v1.3.0 — thirty-three releases — and
[docs/SCIENCE.md](docs/SCIENCE.md) shows the replay across every version, plus
how much of it survives running on an engine whose `Math.sin` returns different
bits (nearly all of it, for about twenty thousand ticks).

A second one is unusual in the other direction: the suite **moves every one of
the eighty-five constants in `config.js`** and requires each to change
something, so a constant that has quietly stopped mattering fails the build
rather than sitting in the file looking load-bearing. It has already caught one,
and the write-up is in [docs/SCIENCE.md](docs/SCIENCE.md). The count in that
sentence is itself a test: `test/prosecounts.test.js` reads it back out of this
file and compares it to the config.

## How it works (the short version)

Every creature carries a **genome**: a flat vector of numbers that are the
weights of its neural-network **brain**, plus a few genes for body traits
(size, metabolism, colour, and **diet**). Each tick, a creature:

1. **senses** — builds an input vector (direction and closeness of the nearest
   food, the nearest creature it could *eat*, and the nearest one that could eat
   *it*; its own energy, diet, size, an internal oscillator, …);
2. **thinks** — runs those inputs through its fixed-topology neural net;
3. **acts** — turns and thrusts according to the net's outputs, then pays an
   energy cost for moving, existing, and (if carnivorous) the upkeep of hunting.

Grazing feeds herbivores; biting smaller creatures feeds carnivores; the diet
gene decides which pays off, and it evolves. Cross an energy threshold and you
reproduce — a **mutated copy** of your genome (or a **crossover** with a partner,
if sexual reproduction is on). Run out of energy, or grow too old, and you
**die**. That's the entire rulebook. There is no fitness function anywhere in the
code — *fitness is just survival*. Over generations, selection quietly tunes
those weight vectors into competent foraging — and, where it pays, hunting.

The world those rules play out in isn't uniform: food concentrates in **biomes**
and rises and falls with the **seasons**, so the best strategy depends on where
and when you live — which is exactly what keeps evolution from settling on one
answer.

Optionally, brains can also **learn within a lifetime** (neural plasticity):
each connection carries an evolvable plasticity gene, and turning the feature on
lets weights adapt as a creature lives. Since plasticity starts at zero in every
genome, a lineage only *learns* if evolution finds that learning pays — the
Baldwin effect, emerging on its own.

Or turn on **evolvable brain topology** (NEAT-style): brains start as bare
graphs and *grow their own structure* — new connections and whole new neurons —
over generations. Click a creature to see its actual evolved network.

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
  nn.js             the neural network (+ optional lifetime learning)
  genome.js         heritable material: weights, plasticity, mutation, crossover
  neat.js           optional evolvable-topology brains (graph genome)
  creature.js       a single agent: sense → think → act → metabolism
  food.js           the world's energy source
  grid.js           spatial hash grid for fast neighbour queries
  environment.js    biomes (fertile patches) and seasons
  energy.js         the pond's books: every unit made, spent, wasted or buried
  stats.js          rolling population/lineage measurements, and what kills them
  archive.js        the whole run at falling resolution, extremes kept exact
  seasonlag.js      how far behind one of its clocks the pond runs (observation only)
  phylogeny.js      groups creatures into species (observation only)
  chronicle.js      narrates notable events into a timeline (observation only)
  headline.js       the pond in one plain sentence, ranked by urgency
  cast.js           what each animal is called, and which one is worth watching
  key.js            the key to the water: what every mark in the pond means
  whoswho.js        the cast list: who is worth watching, and one click to watch them
  records.js        the book of records: the best this pond has ever done, all-time
  world.js          the simulation: steps everything forward
  camera.js         the viewer's lens: zoom, pan, follow one creature
  minimap.js        the whole pond in a corner, with the viewport on it
  render.js         canvas drawing
  rendershot.js     a canvas that records instead of painting, so drawing is testable
  mullerplot.js     the "Tree of Life" stacked-area chart
  sizeplot.js       the pond's bodies on an axis: a histogram of body radius
  dietcost.js       what carnivory costs, against the meals it actually buys
  config.js         every tunable "physics constant" in one place
  barriers.js       optional rock: wrapped slabs with gates, cutting the pond into rooms
  scenarios.js      curated one-click world presets
  hud.js            the panel's stat tiles as data: id, section, gate, and how to read one
  bars.js           the death-mix and energy bars as data, empty state included
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
