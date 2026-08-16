# The science behind Vivarium

Vivarium is a toy, but it isn't a fake. The creatures really do evolve, by a
real evolutionary process, and the behaviours you watch emerge are not scripted
anywhere. This document explains what's actually happening and points to the
ideas and literature it draws on.

## Artificial life

**Artificial life** (often "ALife") is the study of life-like processes through
synthetic systems — software, hardware, biochemistry — rather than by
dissecting existing organisms. Where biology asks "how does *this* life work?",
ALife asks "what is *life-as-it-could-be*?": what are the general principles
that make something adaptive, self-maintaining, evolvable?

Vivarium sits in a long tradition of software worlds where digital organisms
live, compete, and evolve. A few landmarks worth knowing:

- **Conway's Game of Life (1970)** — not evolution, but the founding
  demonstration that fantastically complex, life-like behaviour can emerge from
  a handful of trivial local rules.
- **Tierra (Thomas Ray, 1991)** — self-replicating programs competing for CPU
  time and memory, which spontaneously evolved parasites, immunity, and
  cheaters.
- **Avida (1993– )** — a scientific ALife platform still used in real research
  on the evolution of complexity.
- **PolyWorld (Larry Yaeger, 1994)** — arguably Vivarium's closest ancestor:
  creatures with neural-network brains and vision, living, foraging, fighting,
  and mating in a 2D world, their brains shaped purely by who survives.
- **Framsticks, Evolve 4.0, and a whole genre of browser "evolving creature"
  toys** — the lineage Vivarium most directly belongs to.

Vivarium deliberately picks the smallest slice of that space that still produces
the magic: neural-network brains + energy economy + mutation + selection.

## Evolution without a fitness function

The heart of Vivarium — and the thing most worth understanding — is that
**there is no fitness function.**

In most "genetic algorithm" tutorials you write an explicit scoring function
("reward getting close to the target") and the algorithm optimises it. That is
*directed* evolution: you already know what good looks like and you're just
searching for it.

Vivarium does something closer to what nature does. Nobody scores a creature.
The only thing that happens is:

- a creature that gathers enough energy **reproduces** (its genome, mutated,
  gets another copy in the world);
- a creature that runs out of energy **dies** (its genome stops being copied).

That's it. "Fitness" is not a number the code computes — it is simply the
**realised rate at which a lineage's genes get copied into the future**, which
falls out of the physics of the world. This is *natural* selection rather than
*artificial* selection, and it's why the behaviours feel discovered rather than
designed. No line of code says "move toward food." That behaviour exists because
brains that produce it leave more descendants.

## Neuroevolution

Each creature's brain is a small **artificial neural network**, and the
network's weights are its heritable genome. Evolving neural networks this way —
rather than training them with gradient descent / backpropagation — is called
**neuroevolution**.

Vivarium uses the simplest useful variant: a **fixed topology** (the number of
neurons and connections never changes) with only the weights under selection.
Reproduction copies the weight vector and adds Gaussian noise to some of the
weights. Good weight vectors survive; bad ones don't.

Key properties of this choice:

- **No learning within a lifetime.** A creature's brain never changes while it's
  alive — no backprop, no reward signal, no experience. All adaptation is
  *across* generations. (Adding within-lifetime learning, à la Hebbian
  plasticity, is a tempting future direction — see the devlog.)
- **The genome is directly the phenotype's controller.** There's no complex
  development step between genes and brain; the weights *are* the brain. This
  keeps the causal chain from mutation to behaviour short and legible.

The more famous cousin of this approach is **NEAT** (NeuroEvolution of
Augmenting Topologies, Stanley & Miikkulainen, 2002), which evolves the network
*structure* as well as the weights, growing brains from minimal to complex.
Vivarium ships a trimmed-down NEAT as an optional mode — see the next section.

## Evolving the brain's structure (NEAT)

By default the brain's *shape* is fixed and only its weights evolve. Turn on
evolvable topology and Vivarium instead uses a graph genome in the spirit of
**NEAT**: brains start **minimal** — a few direct sense→motor connections and no
hidden neurons — and *complexify* over generations through two structural
mutations:

- **add connection**: wire together two previously-unconnected neurons;
- **add node**: splice a new neuron into an existing connection (the old link is
  disabled and replaced by two, so behaviour is preserved at first and free to
  diverge after).

The reason this is interesting rather than just "bigger networks" is that
complexity has to **pay for itself**. A new neuron only persists if the creatures
carrying it out-reproduce the ones without it. In Vivarium's world, foraging is a
nearly-linear problem, so a minimal network already does it well — and so, most of
the time, brains *stay* minimal, and only a few lineages evolve hidden structure
where it happens to help. That distribution isn't imposed; it's selection's
verdict on how much brain the problem is worth. It's the same principle behind the
"start minimal, add only what earns its keep" philosophy that makes NEAT famous:
evolution is a stingy engineer.

Two honest simplifications relative to canonical NEAT: Vivarium identifies
connections by their endpoint node ids rather than global *innovation numbers*,
so crossover can't perfectly align hidden neurons that arose independently in
different lineages (the "competing conventions" problem — a non-issue for the
default asexual reproduction, where structure only grows within a lineage); and
it uses a lightweight structural+weight distance rather than NEAT's full
compatibility metric. The essential idea — heritable, selectable, growing
topology — is faithfully present.

## Within-lifetime learning and the Baldwin effect

By default a Vivarium brain is frozen at birth: evolution tunes the weights, but
no individual ever changes. That is *phylogenetic* adaptation — change across
generations. Real nervous systems also do *ontogenetic* adaptation — they change
within a single lifetime, through learning. Vivarium can model that too, via an
optional **neural plasticity** feature.

Each connection carries a second heritable number, a **plasticity coefficient**,
alongside its weight. When plasticity is enabled, a creature's weights update
every tick by a **Hebbian** rule — Donald Hebb's 1949 principle, often summarised
as *"neurons that fire together, wire together"*: a connection strengthens in
proportion to the co-activation of the neurons it joins, gated by its evolved
plasticity coefficient. A decay term continually pulls each weight back toward
the value it was born with, which keeps learning **bounded and reversible** (a
working memory rather than runaway drift) and is the biologically-flavoured
cousin of weight regularisation.

The scientifically interesting part is what happens when you let this *evolve*.
Every genome starts with **zero** plasticity — brains are born fully innate — so
learning is not handed to the creatures; it has to be *discovered*. If a lineage
that can adjust within its lifetime tends to survive and reproduce more, then
mutations that raise plasticity are selected, and the population evolves the
*capacity to learn* from nothing. This is the **Baldwin effect** (James Mark
Baldwin, 1896): learning and evolution interacting, where the ability to learn a
useful behaviour during life can guide and accelerate its genetic assimilation.
Turn plasticity on in Vivarium and you can watch it happen — the plasticity genes
climb from zero and the Learning stat rises off the floor.

Vivarium's plasticity is deliberately the simplest useful form (a single
coefficient per connection, a fixed Hebbian-plus-decay rule). Richer schemes
exist — the full **ABCD / "neuromodulated" plasticity** rules of Soltoggio and
others give each connection several evolvable coefficients and a modulatory
signal — and would be a natural extension.

## The creature's senses

A brain is only as good as its inputs. Each tick a creature perceives (all
normalised to roughly `[-1, 1]`):

| Input | Meaning |
| --- | --- |
| bias | a constant `1`, letting the net learn an offset |
| energy | how full its energy tank is |
| food bearing (sin, cos) | direction to the nearest visible food, *relative to its own heading* |
| food proximity | how close that food is |
| prey bearing (sin, cos) | direction to the nearest creature it *could eat*, relative to heading |
| prey proximity | how close that prey is |
| threat bearing (sin, cos) | direction to the nearest creature that *could eat it*, relative to heading |
| threat proximity | how close that threat is |
| speed | how fast it's currently moving |
| oscillator | `sin` of an internal clock, enabling rhythmic behaviour |
| age | a sense of how far through its lifespan it is |
| own diet | how carnivorous it is (so behaviour can depend on being predator or prey) |
| own size | how big it is |
| heard call | *(signalling only)* the loudest call reaching it, faded by distance |

The last row is the only optional one: with signalling off the sense does not
exist, and the network is arithmetically the one it has always been.

Splitting "nearest creature" into separate **prey** and **threat** channels is
what lets the same brain architecture produce both hunting ("turn toward prey")
and fleeing ("turn away from the threat") — and feeding a creature its *own* diet
and size means a single evolved genome can express a hunter's strategy or a
prey's strategy depending on the body it develops.

Two design details matter a lot here:

1. **Bearings are relative to the creature's own heading**, encoded as
   `(sin, cos)` of the angle. This means a brain can learn "turn toward food"
   as a single rule that works regardless of which compass direction the food is
   in — the representation does the heavy lifting so evolution doesn't have to
   rediscover rotation for every direction. Using `(sin, cos)` instead of the
   raw angle also avoids the discontinuity where the angle wraps from +π to −π.
2. **The internal oscillator** gives brains a source of time-varying input, so
   behaviours like "sweep back and forth while searching" become reachable
   without any memory or recurrence in the network.

## The energy economy

Everything in Vivarium is ultimately about energy, because energy is what
selection acts through:

- **Existing** costs a small amount of energy per tick (scaled by body size and
  a metabolism gene).
- **Moving** costs extra, proportional to thrust — so laziness is cheap and
  sprinting is expensive.
- **Grazing** a food pellet adds energy — but less the more carnivorous you are.
- **Hunting** a bite of a smaller creature adds energy — but more the more
  carnivorous you are, and being carnivorous carries an ongoing metabolic cost.
- **Reproducing** hands half your energy to your child.

This creates genuine trade-offs that selection can explore. A bigger body might
help you hunt but costs more to run. A high-metabolism creature burns energy
faster but... there has to be a compensating advantage for that gene to survive,
and if there isn't, it won't. These trade-offs are what keep the design from
collapsing into a single optimal strategy.

## The books: where the pond's energy actually comes from, and goes

The section above describes the energy economy as a set of rules. From v1.29 the
simulation also *adds it up* — [`src/energy.js`](../src/energy.js) is a ledger of
every unit this world creates and destroys, and the panel reports it live. The
first thing it establishes is uncomfortable, and was true from v1.0:

**This pond is not a closed system, and never was.** A food pellet is a
*position*, not a battery. It holds no energy at all; the `foodEnergy` units
appear at the moment something eats it, sized to the eater's diet. Energy is
minted at ingestion. With scavenging on, a corpse mints again — its meat is
computed from body size, not from what the creature had left. So the ledger is
not a conservation law. It is a record of how much this world creates from
nothing, and what becomes of it afterwards.

What it *does* enforce is an accounting identity:

```
created − destroyed === standing in living bodies and corpses
```

That holds to a relative 1e-9 (floating-point noise, twelve orders of magnitude
below one pellet) at every tick, in a default world, in a world with every
mechanic switched on at once, through a pond that starves out and reseeds
repeatedly, across a save/load round trip, and at the population cap.
`test/energy.test.js` checks all of them. It is a far stronger invariant than
any other statistic here keeps, because it fails on the tick a bug happens
rather than looking slightly wrong later.

### Where it goes

Over 30,000 ticks, default configuration, five seeds:

| seed | metabolism | buried with the dead | leaked | standing | turnover |
|------|-----------:|---------------------:|-------:|---------:|---------:|
| 314    | 96.9% | 3.1% | 0.04% | 20,677 | 547 ticks |
| 7      | 97.0% | 1.9% | 1.09% | 16,699 | 542 ticks |
| 55     | 96.3% | 3.4% | 0.23% | 14,528 | 490 ticks |
| 2024   | 94.1% | 4.1% | 1.79% | 15,535 | 545 ticks |
| 12321  | 98.5% | 1.5% | 0.04% | 27,534 | 715 ticks |

Two things stand out. **Almost everything goes on simply being alive** —
94–98.5% of every unit the pond has ever spent, against 1.5–4.1% carried into
the ground by bodies that still had energy in them. And **the standing stock is
a rounding error**: at seed 314 the pond holds about 20,700 units against
1.15 million minted over the run, and it turns over its entire energy content
roughly every 500 ticks — an eighth of a maximum lifespan. This world does not
store energy. It runs it straight through.

The leak column is the smallest and the most interesting, because it is made of
three different things that the ledger keeps apart: energy lost converting flesh
into a predator (`digested`), meat rotting out of a corpse nobody ate
(`rotted`), and gains discarded because the eater was already full (`spilled`).

### `energyMax` is a clamp that never fires

`spilled` reads **exactly zero** in a default world. Not "negligible" — zero, to
the last bit that differencing an energy against itself can produce.

The reason is a two-line interaction nobody had looked at. `energyMax` is 220
and `reproduceThreshold` is 160, so a creature always splits before it can fill
up, and the ceiling is unreachable. Every world this project has shipped, every
screenshot, every scenario, has carried a clamp that has never once fired.

> **Correction (v1.38).** This section used to be headed "a parameter that does
> nothing" and ended "you could set `energyMax` to 10,000 or delete it and
> nothing would move." The first half is true of the clamp and the second half
> is false of the constant, which the [constant sweep](#is-every-number-in-configjs-a-lever)
> caught by moving it and watching the pond move on tick one. `creature.js`
> feeds the brain `(energy / energyMax) * 2 - 1`: the number is also the
> *divisor of a creature's sense of its own energy*, and `render.js` shades a
> body by the same fraction. Delete it and every brain in the pond reads a
> different world. What that is worth is measured
> [below](#what-the-live-half-of-energymax-is-worth).

Unless reproduction is blocked — which is exactly what `populationMax` does. At
the cap a creature cannot split, its energy climbs to the ceiling, and every
mouthful afterwards is minted and destroyed in the same instant:

| population cap | final population | of all energy made, spilled at the ceiling |
|---------------:|-----------------:|-------------------------------------------:|
| 650 (the default) | 244 | 0.0% |
| 300 | 230 | 0.0% |
| 200 | 200 | 4.3% |
| 120 | 120 | 37.0% |

The cap is documented in `config.js` as "a safety cap so the sim can't explode".
Nothing said that reaching it converts a third of the pond's entire energy budget
into nothing, and that a world at its cap is running a wholly different energy
economy from one below it. Both halves — zero when reproduction is reachable,
dominant when it is not — are pinned in `test/energy.test.js`, because a negative
result that isn't held by a test quietly stops being true.

### What scavenging does to the books

Switching scavenging on adds the second mint. Corpse meat accounts for
8–9% of everything the pond creates — death becomes a *source* of energy
rather than only a sink — and most of it is never eaten: a quarter to four-fifths, depending heavily on the seed and on how carnivorous that pond's lineages got, of all meat
minted rots away, which is why the leak column jumps by an order of magnitude the
moment the feature is on. The nutrient a corpse leaves in the ground (detritus,
v1.27) is deliberately *not* in these books: it is a different currency. Detritus
moves where the crop grows, and a pellet grown on enriched ground mints its own
units like any other. The two recycling loops in this world do not share a unit,
which is worth knowing before reading either as "energy returning to the system".

## Predation and the evolution of a food web

The diet gene (0 = pure herbivore, 1 = pure carnivore) turns the energy economy
into an ecosystem. A carnivorous creature that is meaningfully bigger than a
neighbour can bite it, draining the victim's energy and gaining some in return,
scaled by how carnivorous it is. Because plant nutrition *falls* as carnivory
rises, herbivory and carnivory are genuinely alternative niches rather than one
strictly dominating.

The interesting scientific point is that **predators are never scripted into
existence** — they have to be selected for, and that only happens under the right
ecological conditions. In a food-rich world, herbivory is so easy that the diet
gene is nearly neutral and no predators evolve; carnivores appear only when plant
food is *contested* enough that the untapped biomass of grazers becomes a
worthwhile resource to exploit. This mirrors reality: predation is a response to
competition, not a free lunch.

When predators do evolve, the system exhibits the hallmark of predator–prey
ecology: **oscillation**. Predators boom when prey are plentiful, over-hunt,
crash the prey, then crash themselves, letting prey recover — the
[Lotka–Volterra](https://en.wikipedia.org/wiki/Lotka%E2%80%93Volterra_equations)
cycle, emerging here from individual agents rather than differential equations.
Left unchecked this can drive a world extinct, so Vivarium includes the same
kinds of stabilisers that keep real food webs from collapsing:

- a **handling time** (bite cooldown) capping how fast one predator can kill —
  the discrete analogue of a Holling type II functional response;
- a required **size refuge** (predators must be clearly bigger than prey), so not
  every creature is edible by every other;
- an **intrinsic cost** of carnivory, so predators can't persist where hunting
  doesn't pay; and
- a **grazing fallback**, so a predator whose prey has crashed can limp along on
  plants rather than mass-starving.

Tuned together (see the [devlog](DEVLOG.md) for the full, four-attempt story),
these keep predator/prey dynamics oscillating instead of collapsing.

Optionally, the food web can also close its loop through **scavenging**. Normally
a creature's energy leaves the world when it dies; with scavenging on, its body
becomes a corpse — a pool of meat that carnivores can feed on before it rots.
This models the ecological role of **decomposers and scavengers**, who recycle
dead biomass back into the living system rather than letting it disappear. Its
most visible effect is temporal: a seasonal die-off, which is normally just a
population crash, becomes a pulse of carrion that briefly rewards anything able
to eat the dead — the same way a harsh winter in the wild leaves a spring feast
for scavengers. Vivarium treats scavenging as *opportunistic* (a carnivore homes
in on a nearby corpse exactly as it would on easy prey) rather than a separately
evolved strategy, which is a fair first approximation of how many real carnivores
actually behave.

## Environmental heterogeneity: biomes and seasons

A perfectly uniform, unchanging environment is evolution's least interesting
case: there is one best strategy, everything converges on it, and diversity
collapses. Real environments vary in **space** and **time**, and that variation
is a major engine of biodiversity. Vivarium models both.

**Biomes (spatial heterogeneity).** Food concentrates in fertile patches rather
than spreading evenly, so *where* a creature lives matters. This does two things
of scientific interest. First, it rewards different behaviours in different
places (loiter in a rich patch vs. range widely between poor ones). Second, and
more subtly, it can seed **allopatric speciation** — geographically separated
sub-populations experience slightly different pressures and drift apart, the same
way a mountain range or an island splits a species in the wild. Watch the Tree of
Life while biomes are on and you may catch lineages diverging by region.

Biomes can optionally **drift**, each roaming in a different direction. A moving
habitat is a standing source of directional selection: the environment a lineage
adapted to is always sliding out from under it, so foraging strategies that track
the food (rather than parking in one spot) are continually favoured. Shifting
habitats are, in the real world, a major driver of both migration and speciation —
a static optimum lets a population converge and stop; a moving one keeps evolution
in motion.

**Seasons (temporal heterogeneity).** Food supply rises and falls on a yearly
cycle, so *when* a creature lives matters. Seasonality selects for strategies
that a constant climate never would: riding out lean winters, exploiting summer
booms, timing reproduction. It also drives **population cycles** — the pond
blooms and crashes with the year — and those recurring bottlenecks are
evolutionarily potent, because a bottleneck is a moment of intense selection and
a loss of genetic diversity (a founder effect in miniature) every single winter.

Combine seasons with predation and you get the full drama: a hard winter can
crash the prey, which crashes the predators, which lets the survivors rebuild —
boom-and-bust ecology playing out from individual agents, not equations. (Tuning
this so it stays dramatic without simply dying out is a story in the
[devlog](DEVLOG.md).)

### Does the pond actually follow the year? (v1.74)

The chart shades the lean half of the year now, and a shaded figure invites a
sentence — *the crashes are winters* — which is exactly the kind of claim this
project has learned to measure before writing (v1.20's alarm call, v1.27's
scrambled arm). So: twelve seeds, 12,000 ticks each, the first year discarded as
the pond's opening transient, and the winter-half mean of a quantity against its
summer-half mean. The control is the same pond with `seasons: false`, partitioned
by the same calendar — where the two halves are two arbitrary sets of ticks.

| | seasons on | control (`seasons: false`) |
| --- | ---: | ---: |
| standing crop, winter − summer | **−57.7 pellets** | −6.7 |
| seeds where the crop is lower in winter | **12 / 12** | 9 / 12 |
| as a share of each pond's own mean crop | **−40.4%** | −4.8% |
| population, winter − summer | +0.9 | +0.0 |
| seeds where the population is lower in winter | **7 / 12** | 8 / 12 |
| as a share of each pond's own mean | +0.7% | −0.3% |

**The crop follows the calendar and the head-count does not — at this
statistic.** The first row is about as clean as anything measured here: every
seed, in the same direction, at eight times the control's magnitude, on a
quantity that is 40% thinner in the shaded half. The control being −4.8% rather
than 0 is worth keeping: a pond has slow dynamics of its own, and any fixed
partition of a run will catch some of them.

The population rows are **not** a null result, and calling them one would be the
mistake this page exists to avoid. A half-year mean cancels a quarter-year lag
*exactly*: a consumer tracking a resource that winters is the textbook case of a
delayed response, and a delayed response is invisible to this design by
construction. What the table licenses is the caption the chart actually ships —
the shaded half is where the crop is thin — and what it leaves open is whether
the blue line lags the shading, which wants a cross-correlation over lag rather
than a two-bucket split.

**Closed in v1.78, and the lag is real: 632 ticks, 12 seeds of 12.** See *The
pond runs a quarter of a year behind*, below, which also puts a null on the
table above — one seasonless seed reads −21.8% on the crop row and +9.2% on the
population row, so the control here is noisier than its two averages suggest.

### Reproducing it

```js
// node this from the repo root: does the pond follow the season, or is that the
// shading talking? The control is the same clock over a world with no seasons.
import { World } from "./src/world.js";
import { makeConfig } from "./src/config.js";

for (const seasons of [true, false]) {
  for (const seed of [314, 77, 51, 13, 7, 23, 45, 99, 128, 256, 512, 1024]) {
    const config = makeConfig({ seed, seasons });
    const w = new World(config);
    let winter = 0, nW = 0, summer = 0, nS = 0;
    for (let t = 0; t < 12000; t++) {
      w.step();
      if (t < config.seasonLength || t % 10) continue; // skip the opening transient
      const lean = Math.sin((2 * Math.PI * t) / config.seasonLength) < 0;
      if (lean) { winter += w.food.items.length; nW++; }
      else { summer += w.food.items.length; nS++; }
    }
    console.log(seasons ? "on " : "off", seed, (winter / nW - summer / nS).toFixed(1));
  }
}
```

## Contagion: epidemics, acquired immunity, and the cost of crowding

Predation is not the only way one creature's existence can be bad for another's.
Vivarium's optional **contagion** adds a pathogen with no genome, no brain, and no
interest in anything but proximity: a susceptible creature within
`infectionRadius` of an infected one catches the illness with a fixed per-tick
probability, stays sick for `diseaseDuration` ticks while paying an extra
metabolic cost (a fever is expensive), and then — if it survives — is **immune for
the rest of its life**.

That is a textbook **SIR model** (susceptible → infected → recovered), with two
differences that matter. First, it is *individual-based and spatial*: there is no
well-mixed population and no differential equation, only creatures that happen to
be near each other, so the epidemic spreads as a front through whatever crowd the
food has assembled. Second, and more interesting, **immunity is acquired but never
inherited.** Every newborn is susceptible again. Births therefore continuously
replenish the susceptible pool, which is exactly the condition under which a real
epidemic stops being a single burn-through event and becomes **recurring waves** —
the mechanism behind the historical periodicity of childhood diseases like measles.
Watch the *Sick* and *Immune* stats in a plague world and you can see the cycle:
cases climb, the pond passes herd immunity, the pathogen runs out of hosts and
vanishes, susceptibles accumulate with each generation, and the next arrival
ignites another wave.

The evolutionary consequence is a **density-dependent cost**. Every other pressure
in Vivarium pushes creatures *together*: food concentrates in biomes, so the best
place to be is where everyone else already is. A contact-transmitted pathogen is
the first pressure that punishes exactly that — it makes the crowd itself
dangerous, and it is the same trade-off that shapes real herding, colonial nesting,
and schooling behaviour. Contagion is deliberately *not* given an evolvable
resistance gene, because the interesting question is whether a lineage's
**behaviour** — how tightly it packs, how far it ranges — shifts under a pressure
that only tight packing creates.

## Regrowth: a renewable resource, and the tragedy of the commons

For seventeen versions the food in Vivarium was not a population — it was a
supply. Pellets appeared out of nowhere at a fixed rate, so grazing had no lasting
consequence: a biome stripped to nothing refilled exactly as fast as one nobody
had touched. That is a *donor-controlled* resource, and it quietly rules out an
entire class of ecology.

The optional **regrowth** rule makes the crop reproduce like everything else in
the pond. Two things follow from that one idea:

- **Growth is density-dependent.** New pellets can only come from standing ones,
  so the spawn rate scales with how much crop is left (down to a floor that keeps
  a stripped world recoverable rather than dead). This is the logistic-growth term
  of a **consumer–resource model** — the same `rN(1 − N/K)` that underlies
  Lotka–Volterra — arrived at from the agent's side rather than written down as an
  equation.
- **Growth is local.** Most seeds land within `regrowthRadius` of their parent and
  take with a probability equal to the local fertility, so plants recolonise from
  the edges of what survived. Wipe an area completely and it stays bare until
  something spreads back into it — spatial **recruitment limitation**, which is why
  real overgrazed ground recovers from its margins inward.

What you see is the classic **boom-and-bust cycle**, and it is genuinely new to
this world: the standing crop climbs to the cap, a herd builds on the surplus,
the herd eats faster than the plants can breed, crop and grazers crash in that
order, and the survivors wait out a slow green recovery. Population and food
oscillate *out of phase* — a peak in one sitting in the trough of the other —
which is the signature of consumer–resource coupling rather than of weather.
Seasons already gave the pond an externally-imposed rhythm; regrowth gives it an
**endogenous** one, generated by the creatures themselves.

It also puts the pond's first genuine **commons** on the table. Any individual is
better off eating the pellet in front of it, and a population that all do so can
destroy the resource that feeds them — the classic tragedy. Vivarium offers no
mechanism for restraint (a creature cannot see the standing crop, only the nearest
pellet), so the answer, if there is one, has to be behavioural and spatial: ranging
further, dispersing rather than herding, or simply dying back to a level the crop
can sustain. Watching *which* of those the pond finds is the point.

## Signalling: a channel that nobody could hear

From v1.0 to v1.19 every creature's brain had three motor outputs: turn, thrust,
and a third that the code called a "colour signal". It shifted the body's
saturation on screen by a few percent and did nothing else. No creature could
perceive it. That is a strange object to leave in an evolutionary model, because
selection cannot act on a trait that has no consequence: the third output was
free to wander wherever mutation took it, and it did, drifting into saturation
because a `tanh` of a random-walking sum is almost always near ±1. Nineteen
versions of creatures were flashing at each other in a world with no eyes for it.

**Signalling** (opt-in) gives the channel receivers. A creature now senses the
loudest call reaching it — the strongest `|signal|` among neighbours within
`signalRadius`, faded linearly with distance — through a small block of **ear
genes**, one weight per hidden neuron, that mutate and cross over like any other
part of the brain. Three details are deliberate:

- **A one-tick delay.** Creatures are updated in sequence, so reading a
  neighbour's *live* signal would mean the first creature in the array hears
  yesterday and the last hears today. Each creature therefore broadcasts the
  signal it emitted on the previous tick, frozen before anything moves. What you
  hear cannot depend on the update order.
- **Calling costs energy**, `signalCost` per tick per unit of loudness. A free
  signal is unphysical, and in signalling theory cost is what keeps a signal
  honest — a call that anyone can make for nothing can be made by a liar too.
- **Earshot ignores the dark.** Vision shrinks toward `nightVisionFactor` when
  the day/night cycle is on; hearing does not. A voice carries at midnight, which
  is exactly when a creature that cannot see would most want one.

### What actually happened: two negative results

Neither of the things this mechanic was built to produce showed up in the sweeps,
and both are worth recording.

**Volume does not evolve.** The cost was meant to select for silence, so that any
noise that survived would be noise worth making. It doesn't: sweeping
`signalCost` from 0 to 0.25 — five times base metabolism, enough to visibly
depress the population — moved mean loudness only from about 0.85 to about 0.72
across seeds. The reason is the `tanh`. Reaching *quiet* means holding the third
output's pre-activation near zero across every sensory state a creature meets,
which is a vanishingly thin region of weight space; mutation cannot find it and
selection is not strong enough to drag anything there. Cost turns out to be a
lever on *who survives*, not on *how loud they are*.

**A promising signal-meaning statistic turned out to be an artifact.** The
natural question about a signal is not how loud it is but whether it is *about*
anything, so the obvious measurement is the gap between what creatures say while
something that could eat them is in sight and what they say when it isn't. That
gap is real and often large — in one 12,000-tick run it settled at 0.31 and held
the same sign for 74% of the second half of the run, which looks a great deal
like an alarm call.

It is not one. The control is to measure the same gap in worlds where
**signalling is switched off** — where the signal still exists and still depends
on the threat sense, but no creature can hear it and no ear gene is ever drawn.
The gap is just as big:

| hearing | mean \|gap\| across predator-bearing worlds |
| --- | --- |
| on | 0.17 |
| off | 0.35 |

The strongest "alarm call" in the whole experiment (0.58, sign-stable in 88% of
samples) came from a world where nobody could hear anything at all. The
explanation is mundane: a pond usually ends up dominated by a few related
lineages, and if their shared brain happens to couple the threat inputs to the
third output — which costs nothing, so nothing stops it — then the whole
population "says" the same thing in danger, having inherited it rather than
agreed it. A population-level correlation measures common ancestry at least as
readily as it measures communication.

You can reproduce the control in a few lines:

```js
import { World } from "./src/world.js";
import { makeConfig } from "./src/config.js";
import { INPUT_THREAT_PROX } from "./src/creature.js";

const gap = (w) => {
  let d = 0, nd = 0, e = 0, ne = 0;
  for (const c of w.creatures) {
    if (c._in[INPUT_THREAT_PROX] > 0) { d += c.signal; nd++; } else { e += c.signal; ne++; }
  }
  return nd >= 5 && ne > 0 ? d / nd - e / ne : null;
};

for (const signalling of [true, false]) {
  const w = new World(makeConfig({ seed: 888, signalling, predation: true }));
  const late = [];
  for (let t = 1; t <= 12000; t++) {
    w.step();
    if (t > 7200) { const g = gap(w); if (g !== null) late.push(g); }
  }
  const m = late.reduce((a, b) => a + b, 0) / late.length;
  console.log(signalling ? "hearing on " : "hearing off", m.toFixed(3));
}
```

So what the app reports is the honest quantity: **Heard**, the mean strength of
the call actually reaching a creature. It is exactly zero where nobody can hear,
and it moves with the ecology rather than with wishful thinking — it swells as
survivors pack into fertile ground and collapses with the population in a crash.

What is genuinely true is narrower, and still worth having: a channel exists
where none did, an action can now depend on what a neighbour is doing several
body-lengths away, and there is a heritable, evolvable, costed pathway from one
creature's state to another's behaviour. Whether 12,000 ticks of a 40-creature
founding population is anywhere near enough for a convention to *emerge* on that
pathway is an open question, and the honest answer from these sweeps is: not yet,
and not detectably. Communication is thought to be hard to evolve for exactly the
reason the model makes vivid — a signal is only worth making if others respond,
and responding is only worth doing if the signal is informative, so each half of
the arrangement is useless until the other exists.

## What the pond dies of

Vivarium has counted its dead since v1.0 and never once recorded what of. That
makes the single most dramatic thing the model produces — a population halving —
unreadable, because a crash caused by a hard winter and a crash caused by a
predator boom look identical from the outside. Both are a line going down.

Every death now names its cause at the moment it is decided, so nothing has to be
inferred afterwards from a body at zero energy:

- **starvation** — energy reached zero, whether spent on metabolism, movement,
  the upkeep of carnivory, a fever, or a call;
- **age** — the creature reached `maxAge` with energy to spare;
- **predation** — a bite emptied it, recorded by the predator that landed it.

The three are exhaustive and exclusive: the causes always sum to the death count,
and the predation tally is checked against the entirely separate kill counter the
world has kept since v1.1. The app shows the mix over the last 120 deaths rather
than the whole run, because a cumulative share stops moving after a few thousand
ticks and the interesting thing about mortality is that it *changes*.

### Hunger does nearly all the editing

Eight seeds, 12,000 ticks each, default configuration:

| world | starvation | old age | predation | mean lifespan | mean population |
| --- | --- | --- | --- | --- | --- |
| default | 78% | 11% | 11% | 2013 | 197 |
| predation off | 84% | 16% | **0%** | 2247 | 227 |
| contagion on | 78% | 12% | 10% | 1929 | 192 |
| scavenging on | 76% | 13% | 11% | 1995 | 200 |
| regrowth on | 90% | 1% | 9% | 1212 | 79 |

The headline mechanic of this world — the predator/prey arms race that the
default seed was chosen to display, that the README opens with and that most of
the rendering code exists to draw — accounts for about a **tenth** of the deaths
in it. It is wildly seed-dependent (2% to 40% across the eight), and it is never
the main event. Selection here is done overwhelmingly by hunger. That is worth
knowing before reading any claim about what evolved and why: the visible drama
and the actual selection pressure are not the same thing.

The control is the row with predation off, where the predation share reads
**exactly** 0.000 on all eight seeds — not a small number, zero. A cause that
cannot happen must report none, or the readout is measuring something other than
what it says. (This is the same discipline the v1.20 signalling statistics had to
pass, and for the same reason.)

### Old age is the sensitive indicator

The smallest slice moves the most. Dying of old age means the world let you
finish: you found enough food, for long enough, to run out of time rather than
energy. Removing predators raises it from 11% to 16% and adds ~230 ticks to the
mean life. Switching on **regrowth**, where the crop is a population that a herd
can strip, all but abolishes it — 11% to 1.4% — while cutting mean lifespan by
40% and the standing population by 60%. Regrowth is the harshest thing in the
config file, and the death mix says so much more clearly than the population
chart does.

### Contagion hides inside starvation, and that is honest

Switching on the disease barely touches the mix (78.1% starvation against 77.9%
without it) and costs about 4% of mean lifespan. This is not the accounting
failing; it is the accounting being literal. The pathogen has no lethal step —
it drains `diseaseMetabolicCost` extra energy per tick, and what actually kills
its host is running out. "Died of disease" would be an interpretation, and a
tempting one, so the readout doesn't offer it. The place to read the epidemic is
the Sick/Immune counters and the chronicle, and the honest summary of its
mortality effect is that a fever here kills by starving you slightly sooner.

Reproduce any row with a dozen lines:

```js
import { World } from "./src/world.js";
import { makeConfig } from "./src/config.js";
const w = new World(makeConfig({ seed: 314 }));       // add { predation: false } etc.
for (let i = 0; i < 12000; i++) w.step();
const b = w.stats.deathsBy;
const total = b.starvation + b.age + b.predation;
console.log(b, "of", total, "deaths");
console.log("mean lifespan", (w.stats.lifespanSum / w.stats.deaths).toFixed(0));
```

### Putting the causes on the clock, without losing any of them

The 120-death window is the right thing to *watch* and the wrong thing to
*remember*. By the time a crash has scrolled far enough back to be a visible
shape on the population chart, the window that could have explained it has
turned over several times. Since v1.26 each history sample carries the death
toll alongside the population and the food, so the mix is on the chart's own
axis: a strip under the chart, stacked by cause, on whichever scope the chart
is showing.

The interesting part is which number gets stored. The archive behind the
whole-run view keeps a fixed number of rows and halves its resolution every time
it fills, and v1.22 established what that costs: a thinned series loses exactly
the peaks and troughs a chart exists to show, which is why every retained point
carries an exact min/max envelope of the samples it absorbed.

None of that machinery is needed here, because the counters are **cumulative**
rather than per-interval. A running total is monotone, and any two samples —
however many were discarded between them — partition the ticks between them with
no gap and no overlap, so their difference is the exact number of deaths in that
stretch. The chart's time resolution degrades; its arithmetic does not, at any
capacity, for any length of run. It is worth stating the general form, because
the temptation runs the other way: *an extensive quantity recorded cumulatively
is lossless under decimation, in a way an instantaneous one can never be.*

Storing deaths-per-interval instead would have looked identical on a fresh run
and silently under-reported from the first halving onward, so
`test/mortalityHistory.test.js` asserts both halves — that the cumulative form
gives the same totals through archives of capacity 4 and 512, and that the naive
form loses more than 80% of the deaths at capacity 4. Seeing it is four lines:

```js
import { World } from "./src/world.js";
import { makeConfig } from "./src/config.js";
import { mortalitySeries } from "./src/stats.js";
const w = new World(makeConfig({ seed: 42 }));
for (let i = 0; i < 20000; i++) w.step();
const s = mortalitySeries(w.stats.runHistory.series());
// The archive has halved several times by now; this still equals the ledger.
console.log(s.total, "deaths in", s.intervals.length, "intervals");
console.log(w.stats.deathsBy);
```

Both CSV scopes carry the same three columns, cumulative for the same reason:
subtract one row from the next and you have the exact toll between them, whatever
the thinning did to the rows around them.


## Terrain: why a cost is not a landscape

Until v1.23 space was this world's last unconditional gift. Food had biomes and
time had seasons, but the *ground* was uniform: being anywhere cost exactly what
being anywhere else cost. Terrain (opt-in) replaces that with a static,
seed-derived roughness field on the torus. Nothing is blocked, and — importantly
for what follows — nothing can perceive it. There is no terrain sense, no new
brain input, no gene for preferring flat ground.

![A pond on a contour map: creatures and food gathered into the dark basins, the pale ridges nearly empty](screenshots/terrain.png)

The design had two halves, and only one of them works. That is the interesting
part.

### The half that failed

The first version made rough ground **expensive**: roughness multiplies the
movement half of the metabolic bill, up to 2.6x on the worst ridges. The
reasoning was straightforward selection. A creature that spends its life
crossing ridges burns more energy for the same travel, so it reproduces less and
dies sooner; lineages that happen to live in the basins should therefore come to
dominate, and the population should gather in the flats without a single
creature ever knowing why.

The measurement is the **ground bias**: the mean roughness under the living,
minus the mean roughness of the whole landscape. It is negative when the pond
sits on flatter-than-average ground, and — the property that makes it worth
trusting — it is exactly zero when terrain is off, because there is no field to
measure against. A statistic that is non-zero with its mechanism disabled is not
measuring the mechanism.

Ground bias for a pure movement tax, at the full 2.6x cost, is **-0.003**. That
is nothing. Six seeds run for 12,000 ticks scatter either side of zero, and the
control — the same worlds with terrain off, scored against the landscape they
*would* have had — sits at -0.005, which is to say the two are
indistinguishable.

The diagnosis is a timescale mismatch, and it is not subtle once you look for it.
A creature moves at up to 2.6 px/tick in a world 900 px across, so it crosses the
map in roughly 350 ticks. It lives for up to 4,200. Every creature therefore
samples the entire landscape a dozen times over within a single lifetime, and a
lineage samples it thousands of times. **Mixing is more than an order of
magnitude faster than selection**, so a spatially varying death rate averages
clean away before it can leave any spatial structure behind. The energy is really
being spent — creatures on ridges really do burn more — but it is spent by
*everyone, everywhere*, which makes it a tax on the population rather than a
feature of the map.

### The half that works

The fix is to make the ground affect something that does not average away: where
the food is. Ridges are now **barren** as well as expensive — a new pellet is
less likely to take the rougher the ground it lands on, up to
`terrainBarrenness`. Total food influx is unchanged (a pellet that is refused
looks again, up to four times, and is then placed regardless), so this moves the
crop rather than shrinking it, exactly the contract the biomes have kept since
v1.3.

Sweeping both knobs over four seeds at 9,000 ticks:

| movement cost | barrenness | ground bias | mean population |
| --- | --- | --- | --- |
| 2.6x | 0 | -0.003 | 171 |
| 2.6x | 0.5 | -0.011 | 248 |
| 2.6x | **0.85** | **-0.057** | **209** |
| 2.6x | 1.0 | -0.060 | 213 |
| 1.6x | 0.85 | -0.029 | 239 |
| 2.0x | 0.85 | -0.036 | 243 |
| 3.4x | 0.85 | -0.053 | 191 |
| 4.0x | 0.85 | -0.059 | 174 |

Read down the first four rows: at a fixed movement cost, the entire settling
effect is bought by barrenness. Read the rest and the movement cost does matter —
but as a *modulator*, roughly doubling the effect from 1.6x to 2.6x, on top of a
mechanism that only exists because the food moved. On its own it does nothing at
any level tested.

With the shipped defaults, six seeds at 12,000 ticks give a ground bias of
**-0.046**, against **-0.005** for the terrain-off control on the same seeds.
Every seed is negative. One caveat worth stating: on seed 314 the control itself
reads -0.034, because that seed's fertile biomes happen to sit in ground the
terrain field also calls flat. The two fields are drawn independently — biomes
come from the world RNG before terrain exists, terrain from an integer hash of
the seed — so this is coincidence rather than construction, but it is a reminder
that a single seed is not an experiment.

### Reproducing it

```js
import { World } from "./src/world.js";
import { makeConfig } from "./src/config.js";
import { groundBias } from "./src/terrain.js";

for (const barrenness of [0, 0.85]) {
  let sum = 0;
  for (const seed of [314, 7, 21, 99]) {
    const w = new World(makeConfig({ seed, terrain: true, terrainBarrenness: barrenness }));
    for (let i = 0; i < 9000; i++) w.step();
    sum += groundBias(w.terrain, w.creatures);
  }
  console.log(barrenness, (sum / 4).toFixed(4));
}
// 0    ~ -0.003   a movement tax alone: the pond does not move
// 0.85 ~ -0.057   barren ridges: the pond settles into its basins
```

Both rows pay the identical movement cost. The only difference is whether the
ground also refuses to grow anything, and that difference is the whole effect.
The comparison is pinned as a test (`test/terrain.test.js`) so it cannot quietly
stop being true.

### A seed where the control reads nothing at all

The caveat above — that seed 314's terrain-off arm already reads -0.034, because
its biomes happen to sit where the roughness field is flat — is the reason a
single seed cannot carry this claim. It also raises an obvious question: is there
a seed where the coincidence is *absent*, so that the whole of the settling is
the mechanic's doing?

A 48-seed sweep (terrain and detritus on, 9,000 ticks, scored on relief,
settling and a pond that survives) says yes, and picked the world that ships as
the **Lay of the Land** scenario. On seed 13, over 20,000 ticks:

| arm | ground bias | crop bias | mean population |
| --- | --- | --- | --- |
| shipped (2.6x cost, 0.85 barrenness) | **-0.111** | -0.048 | 131 |
| movement tax only (barrenness 0) | **-0.003** | +0.019 | 158 |

The tax-only arm is the same number the four-seed sweep produced, and here it is
not competing with any accidental alignment: this world settles because the
ridges grow nothing, full stop. It is the cleanest single-seed demonstration of
the result in the repository, which is why the scenario ships on it rather than
on a prettier world with a muddier control.

The sweep turned up one thing worth recording beyond the choice. A seed fixes
the landscape — the field is an integer hash of it, drawn before the world
exists — and across the 48, the landscape's **relief** (the standard deviation of
roughness, 0.214 median) correlates with settling at **r = -0.50**. A more
contoured world settles its pond harder, which is what the mechanic predicts and
is not something the seed choice was scored to produce. Relief does not predict
where the *crop* ends up (r = 0.05): that is set by how a particular landscape
lands against a particular set of biomes, and there the coincidence really is a
coincidence.

### What this is and isn't

The pond ending up in its basins is **not** the creatures learning to avoid
rough ground. They cannot perceive it, and the "half that failed" above is the
evidence: when the ground was the only thing that differed, they were completely
indifferent to it. What terrain does is move the resource, and the population
follows the resource the same way it always followed the biomes. The honest
one-line summary is that terrain is a second, independently placed fertility
field with an energy cost attached — and the energy cost, on its own, buys
almost nothing.

Which is a result worth having. It says something fairly general about this
class of model: **in a well-mixed world, a spatial cost does not produce spatial
structure.** To get structure you need either perception (so behaviour can
respond within a lifetime), or restricted movement (so lineages stay put long
enough for local selection to bite), or a spatially varying *resource* — and the
third is by far the cheapest to add.

## The ground sense: perception is not a pressure

The section above ends with a list of three ways to get spatial structure out of
a well-mixed world — perception, restricted movement, or a spatially varying
resource — and a note that the third is the cheapest. v1.23 shipped the third.
v1.33 went back and built the first, because "they cannot perceive it" had been
sitting in this document for ten versions as the obvious unfinished business.

The **ground sense** (opt-in, `groundSense`) gives every creature one more
scalar: the roughness of the ground it is standing on, 0 on the flattest and 1
on the roughest the config prices. Like the ear, it has its own gene block
outside the brain's weight vector, so switching it on costs zero random draws in
any world that leaves it off.

It is deliberately a *local* sense. A creature is told what is under it, never
which direction is smoother. That is not a limitation to apologise for — it is
the information a bacterium has, and run-and-tumble chemotaxis (move on while
conditions are bad, linger once they are good) concentrates a population in the
good places with nothing more. Whether evolution here finds that was the
experiment.

It does not.

### The wire is real

First, the sanity check: does the input reach the motor commands at all? For
each living creature, hold every other sense at what it actually perceived this
tick and swing the foot from 0 to 1; the mean absolute change in turn and thrust
is how much of its steering the ground decides. On the motor scale of (-1, 1):

| | founders | after 9,000 ticks |
|---|---|---|
| ground sense on | 0.257 ± 0.039 | 0.367 ± 0.109 |
| ground sense off | **0.000** | **0.000** |

Founders are born with a random foot, so 0.257 is what an unselected wire is
worth: the ground is already deciding about an eighth of the full range of both
motor commands. And the off arm is an exact zero, not a small number — the
property that makes the statistic worth quoting at all.

### But selection is indifferent to it

The climb from 0.257 to 0.367 is exactly what selection wiring up a useful sense
looks like. It is also exactly what a random walk looks like: foot genes mutate
at the same rate as everything else, and |w| grows under a random walk whether
or not anything is grading it.

So — the v1.27 rule, that a feature touching what a creature perceives needs a
*scrambled* arm and not only a disabled one — a third arm was run in which each
creature is handed the roughness of a **different, random patch of the same
landscape** every tick. Identical distribution of values, zero information about
where it actually is.

| after 9,000 ticks | sensitivity |
|---|---|
| true foot | 0.367 ± 0.109 |
| scrambled foot | 0.383 ± 0.156 |

The scrambled arm ends up marginally *higher*. The growth is drift. Nothing in
this pond is selecting on the ground sense.

### And the pond does not settle

The behavioural question, measured with the same **ground bias** as v1.23 (mean
roughness under the living, minus the mean roughness of the landscape; exactly 0
without terrain). To isolate behaviour, `terrainBarrenness` is set to 0, so the
crop does not care about the ground and any settling has to be something the
creatures did. Twelve seeds, 9,000 ticks, mean over the last 3,000:

| roughest ground costs | bias, sense off | bias, sense on | paired difference | seeds in the predicted direction |
|---|---|---|---|---|
| 2.6× (the shipped cost) | -0.0074 | -0.0032 | **+0.0042 ± 0.0164** | 2 / 12 |
| 6× | -0.0162 | -0.0218 | -0.0056 ± 0.0116 | 9 / 12 |
| 12× | -0.0153 | -0.0350 | -0.0197 ± 0.0413 | 8 / 12 |

At the cost this world actually ships, the sign is *wrong* and two seeds out of
twelve go the predicted way — which is a coin. Turn the cost up and the sign
flips to the predicted direction and stays there in eight or nine seeds out of
twelve, but the spread between seeds is two to three times the effect, and by
12× the pond is a different world anyway (37 creatures against 60, the arms
having fallen into different regimes — the v1.32 warning about seed-matched
pairs applies at full strength). The honest reading of the bottom two rows is
*a hint, in the direction the design predicted, that does not clear the noise*.

### Why: a sense is only worth what the thing it senses costs

The diagnosis was in this document before the experiment was run, one section
up, and I read past it for ten versions.

v1.23 measured the movement tax on its own at a ground bias of -0.003 — nothing
— and concluded a spatial cost cannot produce spatial structure in a well-mixed
world. I then wrote down perception as one of the three remedies, and I have
been reading that list ever since as a to-do with perception at the top. But the
same paragraph had already established that **rough ground barely costs
anything**: at 2.6× it prices only the movement half of the bill, of a creature
that thrusts intermittently, on ground it crosses in a few hundred ticks. There
was never a fitness gradient for the foot to climb.

Perception does not create a pressure. It can only exploit one. Giving a
creature a sense for a variable that hardly affects its survival buys exactly
what the theory says it should: a wire that carries a real signal into behaviour,
that behaves indistinguishably from a wire carrying noise, and a population that
sits where it always sat. The remedies on that list are not interchangeable, and
the two I have not tried — restricted movement, and a resource that varies in
space — are the two that change the *timescale* rather than the information.

That is also the shape of the standing lesson here: a proposed fix has to
address the diagnosis you already wrote down. Mine addressed a different one.

### Reproducing it

```js
import { World } from "./src/world.js";
import { makeConfig } from "./src/config.js";
import { groundBias } from "./src/terrain.js";

for (const groundSense of [false, true]) {
  let sum = 0;
  const seeds = [1, 2, 3, 5, 7, 8, 9, 11, 13, 17, 19, 23];
  for (const seed of seeds) {
    // barrenness 0 leaves the movement cost as the only thing terrain does,
    // so the crop cannot do the settling on the creatures' behalf.
    const w = new World(makeConfig({ seed, terrain: true, terrainBarrenness: 0, groundSense }));
    for (let i = 0; i < 9000; i++) w.step();
    sum += groundBias(w.terrain, w.creatures);
  }
  console.log(groundSense, (sum / seeds.length).toFixed(4));
}
// false ~ -0.007
// true  ~ -0.003   the sense does not move the pond
```

The sensitivity measurement is `groundSway()` in `src/creature.js` — the same
quantity the inspector shows for the selected creature, so a reader can watch
the number this section is about. `test/groundSense.test.js` pins the parts that
must not drift: the sense reads exactly 0 without terrain, adds exactly nothing
to a brain on flat ground, and costs no random draws while it is off.

The null itself is **not** pinned by the suite, and that is a deliberate choice
rather than an oversight. A single world's ground bias at 2,500 ticks ranges
from +0.065 to -0.041 across five seeds in either arm — a pond of five survivors
produces a number as confidently as a pond of two hundred. Any assertion cheap
enough to run in the suite would be measuring the noise, and a flaky test that
fails on an unlucky seed teaches a future reader that the result is fragile when
it is the *test* that is. Twelve seeds and 9,000 ticks is the smallest honest
version, and it lives in the script above.

### What shipped, and why it shipped at all

A null result, kept rather than deleted, on the same terms as v1.23's failed
half: the pair of arms is the experiment, and a mechanism that is present,
correct and demonstrably unselected says something a missing mechanism does not.
The sense is off by default and does nothing to any existing world. What it
leaves behind is a working perception channel for the next person — including
the next me — who wants to test it against a cost worth avoiding.

## Detritus: a pond that feeds on its own dead

Food has arrived in this world from nowhere since v1.0. v1.18 made the crop
conditional on itself (pellets seed from pellets) and v1.23 made it conditional
on the ground (ridges are barren), but nobody had questioned the *source*:
pellets appear at a rate, and a creature's death had no consequence at all for
the place it happened in. Death was the one event in this pond that the pond did
not notice.

Detritus (opt-in) closes that loop. A body leaves nutrient in the cell it died
in; the nutrient rots with a half-life of about 230 ticks; and a share of the
pellets that used to appear from nowhere instead sprout out of enriched ground,
drawing it down as they go. Nothing is created — total food influx is exactly
what it always was, because a seed the ground cannot feed simply appears the old
way. Only the *placement* changes.

![Warm ochre stains under the water where creatures have been dying, with pellets appearing in them](screenshots/detritus.png)

### The accounting

A body is worth `radius x 0.8` units of nutrient and a sprouting pellet costs
one, so a typical creature funds about four pellets and the largest possible one
about six. A cell holds eight — enough that a whole carcass is never truncated,
not enough to bank three.

Those constants put a ceiling on the mechanism, and the ceiling is the first
interesting number here. Six seeds at 9,000 ticks with the shipped defaults:

| | share of new food grown from the dead |
| --- | --- |
| detritus off | **0%** — exactly, on every seed, to every decimal place |
| detritus on | **24%** |

The pond's own dead can pay for roughly a quarter of its crop. That is less a
tuning choice than a consequence of arithmetic already in `config.js`: at ~0.1
deaths per tick and four pellets a body, the dead supply about 0.4 pellets a tick
against a food rate of 1.8. Raising `detritusPerRadius` does not help — the cell
cap throws the surplus away, which it must, or one bad winter in one biome would
own the crop for thousands of ticks afterwards. (Setting the cap to 4 instead of 8
silently truncated a third of every large carcass and cost seven points of that
share, which is how the constant got measured rather than guessed. Halving
`detritusUptake` would reach 46%, at the price of a body funding more pellets than
it plausibly ate.)

The other number worth reporting is how *localised* the ground's memory is: about
**93% of the nutrient sits in a tenth of the cells** at any moment, with a third
of cells holding anything at all. It is a genuinely patchy map, not a uniform
enrichment, which is what makes it worth drawing.

### The control: it is not the dead that move the population

A detritus pond holds more creatures than a control pond. Eight seeds at 9,000
ticks give **+8.2% ± 5.3 (sem)** — marginal on its own, and the obvious story
writes itself: the crop now grows where the creatures are, so they spend less of
their lives travelling to it.

The obvious story is wrong, and two measurements say so.

The first is direct. If food were being delivered closer to its consumers, the
mean distance from a creature to the nearest pellet would fall. It **rises**, from
42.9px to 47.4px.

The second is the control this project has learned to build before the narration.
Detritus does two things at once: it makes a share of the crop follow the dead,
*and* it takes that same share out of the biome-weighted spawn, where food had
been concentrated into four fertile patches since v1.3. So run a third arm with
the mechanism half-disabled — the same pellets sprout, the same nutrient is drawn
down, but the cell is picked **uniformly at random** instead of by nutrient:

| arm | mean population | vs control |
| --- | --- | --- |
| detritus off | 196.3 | — |
| detritus on | 211.3 | +8.2% ± 5.3 |
| shuffled placement | 207.3 | +7.6% ± 11.5 |
| | | *real vs shuffled:* **+6.1% ± 8.3** |

Scrambling the placement does not throw the effect away. The two arms are not
distinguishable from each other, and neither is cleanly distinguishable from the
control. Whatever moves the population, it is not that the food follows the dead;
it is that a quarter of the crop stopped being crowded into the biomes.

Population variability is untouched as well — cv 0.220 with detritus against 0.229
without — so the delayed feedback loop the mechanic builds (death feeds food feeds
life feeds death) does **not** make the pond swing more, which is exactly what it
was designed to do.

So the honest summary is narrower than the design: **detritus is a real,
measurable mechanism with no demonstrated population consequence.** A quarter of
the crop grows where things died, none of it does with the feature off, the map of
it is patchy and legible — and the pond is no more or less stable for it than a
pond whose food was simply scattered more evenly.

There is a general rule in that, and it is not the one this page already had. The
old rule was *a statistic that is non-zero with the mechanism off is not measuring
the mechanism* (see [Signalling](#signalling-a-channel-that-nobody-could-hear)),
and it does not catch this: the share really is 24% on and 0% off. The sharper
form is that **when a feature changes *where* something goes, the control is not
"off" — it is "somewhere else at random".** Comparing against off measures your
change plus the hole it left.

### Reproducing it

```js
import { World } from "./src/world.js";
import { makeConfig } from "./src/config.js";

for (const detritus of [false, true]) {
  for (const seed of [314, 7, 42, 1009]) {
    const w = new World(makeConfig({ seed, detritus }));
    for (let i = 0; i < 9000; i++) w.step();
    console.log(detritus, seed, w.creatures.length,
      ((w.food.sprouted / w.food.spawned) * 100).toFixed(1) + "%");
  }
}
// off: 0.0% on every seed. on: ~24%, and the ground under the pond is patchy.
```

The shuffled arm is a few more lines — override `sprout()` on `world.detritus` to
keep the accounting and return a uniformly random point — and the population
comparison takes minutes, which is why it lives here as a script rather than in
the suite. What *is* pinned as a test (`test/detritus.test.js`) is everything the
write-up rests on: that no pellet ever sprouts and no soil is ever reported with
the feature off, that the crop lands in the enriched cell when there is one, that
influx is unchanged, that the cells tile the world exactly once each, and that a
body's whole worth reaches the ground.

### Two loops, in competition

With scavenging on as well, the pond has two ways of recycling a corpse and they
are rivals. A corpse feeds the ground only as fast as it *rots*, so a carnivore
that strips one has taken it out of the soil's mouth: in the test that measures
it, a corpse eaten after five ticks delivers under a fifth of what one left to rot
delivers. Spread over a full undisturbed rot it delivers exactly the body's worth.

This is the first pair of mechanics in this project that genuinely compete for the
same resource. Every other pair has either ignored one another or agreed.

## Reading the pond: a colour audit

Every result on this page reaches a reader through pixels, and for twenty-four
versions nobody checked whether the pixels worked. Vivarium says two important
things with colour — *that one hunts* (a warm core inside a chevron) and *that
one is kin to this one* (an inherited hue) — and both of them ride on the
red–green axis, which is the axis roughly one man in twelve cannot see.

The audit is in [`src/palette.js`](../src/palette.js). It simulates dichromacy
with the Viénot, Brettel & Mollon (1999) linear model — take linear RGB into
LMS cone space, replace the missing cone's response with the best linear
prediction from the two that remain, come back — and measures how far apart two
colours are with a CIE76 ΔE in L\*a\*b\*. As calibration, ΔE ≈ 2.3 is the
just-noticeable difference and ΔE ≈ 10 is "a different colour at a glance". The
model is an idealisation: a real dichromat is not a matrix, and anomalous
trichromacy — the commoner condition — sits between it and normal vision. Read
it as a *lower bound on confusion*. Colours it merges are genuinely hard for
somebody.

### The predator mark was invisible, and not only to dichromats

The result that started this. Sweeping every creature the pond can contain —
all 360 hues, seven energy levels, five signalling states, four vision models —
the worst-case contrast between the predator's core and its own body was:

| | worst-case ΔE |
|---|---|
| v1.24 warm additive core | **2.8** |
| v1.25 two-tone mark | **40.7** |

2.8 is the just-noticeable difference. The mark that says *this one hunts* — the
headline distinction of the whole project, the thing the README opens with — was
at the edge of perceptibility in its worst case.

The cause is not colour blindness. Body lightness rises with energy (a starving
creature visibly dims), so a well-fed creature is a pale pastel, and the core
was drawn additively — `globalCompositeOperation = "lighter"`. Adding a bright
orange to a pale pastel clamps at white, which is where the body was already
heading. **The best-fed predator in the pond, the one most worth spotting, wore
the faintest mark.** Colour vision deficiency made it worse (the worst cases sit
under tritanopia and deuteranopia) but a trichromat was being shortchanged too.
The audit was aimed at one problem and found a larger one behind it.

The fix is the trick used for subtitles burned into film: a mark carrying *both*
a very light and a very dark tone cannot be swallowed by a background, because
no background is close to both. An opaque warm disc with a near-black rim.
Whichever half the body resembles, the other half stands out — and it stands out
in **luminance**, the one channel no colour vision deficiency touches. The hue
stays (amber, blood-dark) as flavour for the people who can see it, not as the
carrier. How carnivorous a creature is now moves the mark's *size* instead of
its opacity: fading a mark to express degree spends exactly the contrast the
mark exists for, while geometry is free and survives every vision model.

### The minimap was worse

The same sweep against the minimap, where a creature is a square a few pixels
across and predators were one warm orange dot among dots of every hue:

| | worst-case ΔE |
|---|---|
| v1.24 orange dot | **0.01** |
| v1.25 two-tone badge | **57.7** |

ΔE 0.01 is not "hard to tell apart". To a tritanope, a predator and a prey
creature of hue 26° were *the same colour to four decimal places*. The minimap
is the one view where a whole-pond pattern is visible at a glance, and the
pattern most worth seeing there was the one it hid. It now draws the same
two-tone badge the pond does, built from squares.

Both numbers are pinned by tests, in both directions:
[`test/palette.test.js`](../test/palette.test.js) asserts the new marks clear
ΔE 25 across the whole sweep **and** that the old colours do not. A test that
only checked the new numbers would let someone reintroduce the old ones while
the suite stayed green.

### The finding with no fix: lineage hue

Colour is also how this world says *these two are relatives* — on the canvas, on
the minimap, in the Muller plot, on every species dot. It spends the entire hue
wheel doing it. Taking twelve evenly spaced hues and measuring the closest pair:

| vision | min pairwise ΔE | closest pair |
|---|---|---|
| normal | 15.6 | 240° / 270° |
| protanopia | 1.9 | 90° / 120° |
| deuteranopia | 1.6 | 210° / 300° |
| tritanopia | 0.0 | 120° / 150° |

For a dichromat, lineage colour carries almost no information at all — two of
twelve lineages are outright identical.

The obvious fix does not work, and it is worth recording why. Remapping the
wheel onto the blue↔yellow axis a dichromat retains was implemented and
measured; it made things *worse* (min pairwise ΔE 1.3 under deuteranopia, 0.0
under tritanopia) while costing normal vision more than half its separation
(15.6 → 6.9). The reason is not a bad choice of arc. A dichromat's colour space
is two-dimensional — luminance and one chromatic axis — and this project has
already spent luminance on energy, so one axis is left. **One axis does not hold
twelve distinguishable values, and no remapping creates an axis.** The honest
ceiling is four or five lineages, which is fewer than the pond routinely has.

So this is a limitation, not a bug, and it is stated here rather than papered
over. What rescues it in practice is that lineage identity is available without
colour: click a creature and the inspector names its species, the Tree of Life
lists them, and highlighting a lineage dims every other creature — a *luminance*
distinction, which everyone can see. Colour is the convenient index here, not
the only one. The predator mark had no such fallback, which is why it was the
one worth fixing.

### The one that turned out fine — and did not

Corpses (dim maroon) sit under food (green motes) — textbook red and green, and
the pair most likely to be a second bug. Measured, they are ΔE 39 apart under
deuteranopia and 55 under protanopia: comfortably clear, because they differ in
lightness as well as hue. No change was made. An audit that only reports
problems is not an audit.

That paragraph stood for thirty releases and every number in it is still
correct. It is also the wrong question, and **v1.55 is the answer to the right
one** — the corpse was measured against the other *mark* it sits beside and
never against the *ground* it lies on, which is the one background a corpse
does not get to choose. See
[The mark that made its own background](#the-mark-that-made-its-own-background-v155).

### The audit that skipped the DOM

The v1.25 sweep measured the canvas exhaustively and never opened the
stylesheet, where the mortality bar had been saying *starved* in `#d2a13c` and
*hunted* in `#ff7a4d` since v1.21. Measured at last:

| pair | normal | protanopia | deuteranopia | tritanopia |
| --- | --- | --- | --- | --- |
| starved / hunted | 40.6 | 19.9 | **5.5** | **7.0** |
| starved / aged | 69.5 | 66.8 | 74.2 | 101.2 |
| aged / hunted | 75.4 | 48.4 | 68.7 | 106.5 |

Two gold-orange warm tones a few degrees of hue apart, which is a distinction
made entirely on the red–green axis. Starvation and predation are precisely the
pair a crash hinges on — the whole reason v1.21 exists is to answer *winter or
predators?* — and grey old age, the one cause nobody has to identify in a hurry,
was the only one safely separated. The lesson generalises past colour: an audit
scoped to one rendering surface will pass while the same claim fails on another,
and this project has now made that mistake twice (v1.23's terrain, drawn in the
pond and not the minimap; v1.25's palette, measured on the canvas and not in the
DOM).

The fix re-cuts the three along the axes a dichromat keeps. Luminance carries the
ordering — pale gold `L* 91`, mid slate `L* 58`, deep crimson `L* 43` — with
blue↔yellow taking up the rest; the worst pair now scores **37**, and each colour
clears the panel it is drawn on by more than 40, because three mutually distinct
colours that all read as "dark" is a fourth way for a small strip to fail. The
colours live in `src/palette.js` and are painted onto the DOM from there, so the
bar, the legend swatches and the chart strip cannot drift apart, and so the test
measures the colour that is actually drawn.


### The glow that named the paragraph (v1.79)

The last colour named outside `src/palette.js` was the inspector's swatch — the
14-pixel square beside *Creature #n*, and, since v1.77 wrote the panel's field
map down, the only place on the page a creature's own hue is reported. Measured
the way every mark in this audit had been measured, against the panel it sits
on, it passes on all 360 lineage hues under all four vision models, worst case
**ΔE 35.8**. That measurement is correct, and it is not a measurement of this
mark, because the swatch is not drawn on the panel.

`style.css` had glowed it with `box-shadow: 0 0 8px currentColor` since v1.0. A
zero-offset blur is the shape's silhouette faded out across the blur radius,
centred on the edge, so the pixel the eye reads the mark's boundary against sits
at **half strength** — and `currentColor` on a span that has a background and no
colour of its own is the *paragraph's* text colour, `--ink` `#dce7f2`. The
swatch's real surround was `rgb(116, 125, 135)`, a mid slate, identical for every
creature in every pond.

| the swatch, over… | normal | protanopia | deuteranopia | tritanopia |
| --- | --- | --- | --- | --- |
| the panel (what was measured) | 65.6 | 35.8 | 51.3 | 37.8 |
| its own halo (what is there) | 33.9 | **10.6** | **5.0** | **9.1** |

Under `MIN_DELTA_E` on **55 of the 360 hues — 15.3%** — in two contiguous bands,
260–268 (the blue-violets, for a tritanope) and **311–356**, the whole
magenta-to-red arc. Over twelve seeds and 32,269 creature-frames, **9.56%** of
the creatures a visitor could click on wore a failing swatch.

The control is nine hundred lines further down the same stylesheet.
`.legend .chip .dot` is the same 14-pixel chip with the same
`box-shadow: 0 0 Npx currentColor`, and `main.js` sets `color` on that span to
the lineage's own fill — so its halo *is* its mark, and it clears the panel by
35.8 or better on every hue. One idiom, two instances, and the difference is a
single declaration. The swatch does the same thing now; the colour was never the
bug, and no new colour was chosen.

The generalisation is the reason this took until v1.79. Every mark audited
before it lives on the canvas, where the background is chosen by the world: a
predator's body, a fed biome, the ground a corpse lies on. **A DOM mark can
paint its own background**, and when it does, the surface an audit reaches for
by habit is the one surface the mark is not on. The swatch's sibling four rows
below it — the ancestry pips, `hsl(var(--anc-hue), 70%, 62%)` in the stylesheet
— was swept in the same pass and clears every bar it is held to by 43 or better.
That is the control for the control: five of the six items on this list were
hiding something, and the sixth's neighbour is not.

### Running it yourself

Ten lines, no dependencies, reproducing the headline number — the v1.24 core
against a well-fed creature's body, in the four vision models:

```js
import { hslToRgb, addOver, deltaE, VISION_MODELS } from "./src/palette.js";

const body = hslToRgb(71, 85, 90);            // hue 71, full energy, signalling
const marked = addOver(body, hslToRgb(14, 100, 60), 0.72); // the old warm core
for (const v of VISION_MODELS) {
  console.log(v.padEnd(13), deltaE(marked, body, v).toFixed(1));
}
// normal 17.1 | protanopia 16.4 | deuteranopia 15.6 | tritanopia 2.8
```

Swap in the v1.25 mark's two tones (`predatorMarkTones`, scored with
`markContrast`) and the same body scores 85 or better in all four.

## Species, phylogeny, and Muller plots

Vivarium's creatures never have a species assigned to them — they are just
individuals with genomes. Species are something we *infer* by watching, the same
problem biologists face. Vivarium groups creatures using a **phenetic species
concept**: a species is a cluster of genetically similar organisms (as opposed to
the *biological* species concept of interbreeding populations, or *phylogenetic*
concepts based strictly on ancestry). Concretely, a newborn joins the nearest
living cluster within a genetic-distance threshold, or founds a new one that
branches from its parent's — so the "species" you see are a running,
distance-based clustering of the population.

This produces a genuine, if simplified, **phylogeny** — a branching tree of
descent — because each new species records the species it branched from. Over a
run you get the two fundamental macro-evolutionary motions:

- **Anagenesis** (change within a lineage): a species drifts until its
  descendants are different enough to be called a new species.
- **Cladogenesis** (splitting): the tree branches; a parent species can give rise
  to several children that coexist and compete.

The **Muller plot** used to visualise this is a real tool from experimental
evolution — famously used to show clonal dynamics in long-running microbial
experiments like the *E. coli* Long-Term Evolution Experiment. Each lineage is a
band; the band's thickness is its **share** of the population — the column is
normalised, so a band can widen while the pond shrinks — and time runs along the
horizontal axis, marked in ticks since v1.54. Reading it, you can spot:

- a **selective sweep** — a band widening as a fitter lineage displaces others;
- **speciation** — a new band pinching into existence mid-plot;
- **extinction** — a band pinching shut;
- **clonal interference** — several lineages jockeying, none fixing, because
  competing beneficial variants get in each other's way.

The plot spans the whole run, at a resolution that halves each time its record
fills — the caption underneath states both. So the left edge is always the pond
being founded, and a band far to the left is a coarser average than one at the
right: a lineage that rose and fell inside a single late-run column shows up
attenuated to its share of that column rather than at its true peak. Short
excursions read as small there, not as absent.

A caveat worth stating: because classification is by overall genetic distance to
a fixed representative, it is a *phenetic* grouping, not a perfect record of
ancestry — convergent drift could in principle place two unrelated creatures in
the same cluster. It's a faithful, legible approximation of the tree of life, not
a ground-truth genealogy. (A true ancestry-tracked genealogy is a natural future
refinement — see the roadmap.)

## The index was in the physics: what a creature could actually see

`visionRadius` is 168 pixels. It is quoted in the config, drawn as a circle by
the vision overlay, and used as the denominator of every proximity input a brain
receives. For thirty-one versions it was also, quietly, not true.

Sense queries go through a spatial hash grid ([grid.js](../src/grid.js)) — the
standard trick that keeps "what is near me?" from being O(n²). Entities are
bucketed into cells, and a query scans the asker's own cell plus the eight
around it. That 3x3 block covers a disc of one **cell** around the asker, and
the cells are `visionRadius * 0.75` = 126 px across. Everything between 126 and
168 px away was therefore visible or invisible depending on where in its cell
the creature happened to be standing.

### The shape of it

![A lattice: pale tiles where a creature can search its whole vision disc, dark seams between them, and a very dark band down one edge of the world](screenshots/sight-map.svg)

Each pale tile is a region where the block happens to contain the whole vision
disc; the dark lattice between them is where it doesn't. Measured over the whole
default pond:

| Over every standing position in the pond | |
| --- | --- |
| Mean share of the vision disc actually searched | **90.0%** |
| Worst standing spot | **51.1%** |
| Sight guaranteed in *every* direction | **19 – 189 px**, of a configured 168 |

The dark band down one side is the second half of the problem. `cellSize` does
not divide the world — 900 px in cells of 126 gives seven full columns and an
18-px stub — so the grid's wrap (modulo *cells*) and the world's wrap (modulo
*pixels*) do not agree at the seam. A creature standing a pixel past x=0 has the
18-px stub column as its left neighbour, and can see 19 px to its left.

That last part matters more than the arithmetic suggests. The world is a torus
[for a stated reason](DEVLOG.md): walls and corners are exactly what evolution
loves to exploit in boring ways, and a torus has no privileged spots. It turns
out this one did. It just kept them in the index instead of in the physics.

### How often it bites

Over a default world (seed 314), comparing the grid's answer against an
exhaustive scan of every pellet, at every 50th tick from tick 600 to 3,000:

| Glances at food | Rate |
| --- | --- |
| Nearest pellet in sight reported wrongly | 1.30% |
| Nothing seen although something was in range | 0.21% |
| **Wrong in the 20-px band just past the seam** | **6.52%** |
| Wrong everywhere else | 1.05% |

Threat queries are cleaner (0.16% blind) simply because a predator is a much
rarer thing to have inside 168 px than a pellet is.

### The fix, and what it costs

`SpatialGrid.forEachWithin(x, y, radius, fn)` walks the cells that overlap the
disc it was asked for — computing the ranges in world coordinates rather than in
cell indices, so the stub cells at the seam are handled properly — and skips
corner cells whose nearest point is out of reach. With `exactVision` on, the
same 10,000-glance census returns **0 wrong and 0 blind**.

It costs about a quarter of the simulation's throughput: 787 → 612 ticks/second
at a population of 180, in Node on this machine. The disc of radius 168 is
88,600 px² against the block's ~143,000, but the disc needs cells from a wider
span, and the per-cell reach test is not free.

The flag is **off by default**, and that is a considered choice rather than
caution: this is a correction, not a new rule, and turning it on moves every
world onto a different trajectory from the one thirty-one versions of
screenshots, permalinks and curated seeds were recorded on. With it off, the
queries are the ones v1.0 made — the code takes the same branch, in the same
order, and a default world is bit-for-bit what it was.

### The control: does clearer sight change the pond?

Barely, and not in any direction. Twelve seeds, 9,000 ticks each, both arms:

| | sight clipped | exact sight |
| --- | --- | --- |
| Mean population, 12 seeds | 211.8 | 214.8 (+1.4%) |
| Predation's share of deaths, the six predator worlds | 39.5% | 43.9% |
| Predation's share, the six herbivore worlds | 4.0% | 13.6% |

Individual worlds move enormously — seed 11 goes from 7.5% to 62.6% predation,
seed 7 from 40.4% down to 18.6%, seed 9 from a pond of six survivors to one of
124 — but they move both ways, and the aggregate barely stirs. That is what a
*trajectory* change looks like as opposed to a *pressure* change: better sight
does not push the pond anywhere, it just deals a different hand, and this world
has regimes it can fall into either side of.

There is a lesson here I nearly failed. A first pass over six seeds showed the
standing crop falling 24% under exact vision, with a tidy mechanism ready to
explain it — creatures find food sooner, so the crop is grazed harder. Twelve
seeds says the effect was two worlds flipping regime, and the sign of it is not
even stable. **In a world with attractors, a seed-matched pair is not a
replicate.** Anything short of a dozen seeds here is an anecdote about a
trajectory.

### Reproducing it

```js
// node this from the repo root: how often the index answers wrongly.
import { World } from "./src/world.js";
import { DEFAULT_CONFIG } from "./src/config.js";
import { torusDist2 } from "./src/vec.js";

for (const exactVision of [false, true]) {
  const cfg = { ...DEFAULT_CONFIG, exactVision };
  const w = new World(cfg), R2 = cfg.visionRadius ** 2;
  let q = 0, wrong = 0;
  for (let i = 0; i < 3000; i++) {
    w.step();
    if (i < 600 || i % 50) continue;
    w.foodGrid.clear();
    for (const f of w.food.items) w.foodGrid.insert(f);
    for (const c of w.creatures) {
      q++;
      let g = null, gd = R2, b = null, bd = R2;
      const near = (f) => {
        if (f.eaten) return;
        const d = torusDist2(c.x, c.y, f.x, f.y, cfg.width, cfg.height);
        if (d < gd) { gd = d; g = f; }
      };
      if (exactVision) w.foodGrid.forEachWithin(c.x, c.y, cfg.visionRadius, near);
      else w.foodGrid.forEachNear(c.x, c.y, near);
      for (const f of w.food.items) {
        if (f.eaten) continue;
        const d = torusDist2(c.x, c.y, f.x, f.y, cfg.width, cfg.height);
        if (d < bd) { bd = d; b = f; }
      }
      if (b !== g) wrong++;
    }
  }
  console.log(exactVision, (100 * wrong / q).toFixed(2) + "% of glances wrong");
}
```

The map above comes from the same public API: `grid.nearBounds(x, y)` returns
the block a query will search, as offsets from the point, and the fraction of
the disc inside it is a ray-cast away. Its colour ramp is ordered by luminance,
so it reads the same under every vision model — see the colour audit above.

## The contagious zone: is an epidemic a front or a haze?

Contagion (v1.16) has been drawn one creature at a time since the day it shipped:
a halo means *this one is sick*. What no surface has ever drawn is the distance
that actually matters, `infectionRadius` — 22 pixels, five times a creature's own
body — inside which a susceptible neighbour can catch it. So the pond has shown
you *who* is ill for eighteen versions and never *where it is dangerous to be*.

v1.34 draws it: one translucent disc per case, in the pond and on the minimap,
plus the same claim as a number (`Contagious`, the share of the water inside
somebody's reach) and as a sentence for the screen reader.

### The opacity is the risk

Alpha compositing and independent infection are the same arithmetic. Stack n
discs of opacity a and the result is 1 − (1 − a)^n opaque; stand in range of n
infected neighbours, each of which infects you with probability p per tick, and
your risk is 1 − (1 − p)^n. So the field's opacity is not a ramp that resembles
the risk, it *is* the risk under a monotone remap, and one function in
[`src/contagion.js`](../src/contagion.js) serves both.

The audited level is five overlapping cases — a 20.6% chance per tick at the
default `infectionChance`, which is water you should not be standing in. A single
case is drawn fainter than the audit bar on purpose: one disc is a hint that
something is nearby.

### The colour was decided by the food

The zone wanted to be sulphur, to match the halo on the sick creature it belongs
to. It cannot be. A sweep of the hue wheel against every ground this pond can
produce — both seasons, the whole terrain ramp with and without contour lines,
the biome glow, enriched ground at half and full richness, in the pond and in the
minimap — asked for three things at once:

1. **Visible** against all of them (ΔE ≥ 25, the project's bar).
2. **Not mistakable** for either of the two fertility claims already down there,
   the biome glow and enriched ground. A watcher who reads a plague zone as
   fertile ground learns the opposite of the truth about where to feed.
3. **Still leaving the food motes legible on top of it** — a mote is a mark drawn
   *over* this field, so the field is one of its backgrounds.

Every colour that clears all three is blue: hue 210–250, and nothing else in the
wheel. Sulphur clears the first two and fails the third at every opacity — faint
enough to leave the crop legible it disappears into the ground, strong enough to
see it swallows the crop. A mark and the field it belongs to could not share a
hue here, and the thing standing between them was the crop.

### The two marks of the epidemic had never been measured

The v1.25 audit swept the canvas, v1.26 the stylesheet. Neither looked at the
sick halo or the immune ring, and both fail:

| mark, as drawn before v1.34 | worst ΔE | where |
| --- | --- | --- |
| Immune: pale blue ring, 32% alpha | **0.2** | protanopia, over a bright glow |
| Sick: sulphur halo, additive, 35–80% | **11.0** | protanopia, over a bright glow |

This is the predator-core failure of v1.25 repeated exactly: a translucent mark
drawn over the creature's own additive glow is measured against a background it
does not control, and the glow can be any hue at any lightness — brighter still
where two bodies overlap. The immune ring was invisible. The halo was under the
"different colour at a glance" line.

Both are opaque and two-toned now — a bright ring with a dark hairline outside
it, the trick subtitles burned into film use — because a mark carrying a very
light *and* a very dark tone cannot be swallowed by any background, since no
background is close to both. Worst case over every background either can appear
on, including the new zone: **45.5** for the halo, **41.8** for the ring.

And then the finding with no colour in it. Colour cannot tell the two states
apart. An additive halo can reach almost any bright colour, and under tritanopia
bright sulphur and pale blue are the same thing — measured, **ΔE 0.0**. Both
marks need a dark tone, and every dark tone resembles every other. So the
distinction is carried by geometry, which no vision model touches: **the halo is
continuous and the immune ring is dashed.** What the dark half *does* buy is a
guarantee of a different kind — nothing additive can imitate it, because adding
light can only brighten (37.2 at worst against any halo appearance).

### Front or haze? The measurement

With the zone drawn, the whole-pond question becomes askable: does an epidemic
sweep across the water as a front, or does it hang over all of it at once?

The zone's **area per case** answers it. If transmission is local, cases sit
beside the cases that produced them, their discs overlap, and the zone is *small*
for the number of cases in it. The control is not "no disease" — by the v1.27
rule, a feature that changes *where* things are needs an arm that puts them
somewhere else at random. So: the same number of cases, sprinkled over the same
living population at random. That holds prevalence and the crowd's own clumping
fixed and removes only what transmission adds. A second arm scrambles among the
*susceptible* only, in case the pond's susceptibles are themselves clustered
(newborns do appear beside their parents).

Twelve seeds, 9,000 ticks, sampled every 100 ticks whenever at least five cases
were live:

| | area per case |
| --- | --- |
| Real epidemic | 2.02 × 10⁻³ of the pond |
| Scrambled among all the living | 2.51 × 10⁻³ |
| Scrambled among the susceptible only | 2.50 × 10⁻³ |

**Ratio 0.804 ± 0.032 (sd across seeds), below 1 in 11 of 11 seeds that produced
an epidemic.** The effect is six times the between-seed spread, and the sharper
control moves it by half a percent, so this is transmission and not the shape of
the susceptible pool. Eleven of twelve: seed 23 never reached five simultaneous
cases in 9,000 ticks, and reporting that is cheaper than pretending twelve worlds
answered.

So: **clustered, but only by a fifth — a haze with structure in it, not a front.**
And the reason is the diagnosis v1.23 already wrote down for terrain. `maxSpeed`
and `maxAge` together say a creature crosses this world about a dozen times in
its life, so nothing spatial has long to accumulate before mixing erases it. A
pathogen with a 22-pixel reach in a 900-pixel pond is a local rule in a
well-mixed world: it leaves a measurable fingerprint on where the cases are and
it cannot hold a line.

The other number worth having, because it is the one a watcher sees: at peak the
zone covers **16.2% of the water at 39% prevalence** (mean over the eleven). Two
fifths of the pond ill, and five sixths of the water still clean — which is what
the picture looks like, and is only obvious once there is a picture.

### Reproducing it

```js
// node this from the repo root: is the epidemic clustered, or is that the crowd?
import { World } from "./src/world.js";
import { makeConfig } from "./src/config.js";
import { hazardShare } from "./src/contagion.js";
import { RNG } from "./src/rng.js";

for (const seed of [1, 7, 64, 88, 101, 137, 314, 512, 777, 2024, 4242]) {
  const w = new World(makeConfig({ seed, disease: true, predation: true, seasons: true }));
  const shuffle = new RNG(seed ^ 0x5f3759df); // a stream of its own: measuring must not perturb
  let real = 0, scrambled = 0, n = 0;
  for (let t = 0; t < 9000; t++) {
    w.step();
    if (t % 100) continue;
    const cases = w.creatures.filter((c) => c.infected).length;
    if (cases < 5) continue;
    const idx = w.creatures.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(shuffle.next() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    const fake = w.creatures.map((c) => ({ x: c.x, y: c.y, infected: false }));
    for (let i = 0; i < cases; i++) fake[idx[i]].infected = true;
    real += hazardShare(w.creatures, w.config) / cases;
    scrambled += hazardShare(fake, w.config) / cases;
    n++;
  }
  console.log(seed, (real / scrambled).toFixed(3));
}
```

## The books get a clock: what a run-to-date total hides

v1.29 gave this pond an energy ledger and an identity that has to hold —
`created − destroyed === standing` — and then only ever asked it about *now*.
The panel reported that 94–98% of everything the world had ever spent went on
simply being alive, and it was true, and it was a number that had stopped
moving: after a few thousand ticks each new tick is a ten-thousandth of the
total, so the bar is frozen by construction. That is the v1.22 complaint about
readouts that look live and are not, wearing the opposite costume — not a
bounded buffer that always looks full, but an unbounded total that always looks
current.

v1.35 writes the eight fields the ledger stores into every history sample, so
they reach the whole-run archive and both CSV scopes. Nothing needed inventing
for that: every one of them is cumulative and extensive, so by the argument in
[the mortality section](#putting-the-causes-on-the-clock-without-losing-any-of-them)
differencing two samples returns exactly what happened between them however many
samples the archive threw away in the middle. The books needed a clock, not a
redesign.

### The pond's power swings by more than tenfold

Difference the three sources between adjacent archived samples and you get the
pond's **power**: energy minted per tick, at whatever resolution the archive is
currently holding. Twelve seeds, 20,000 ticks each, read back at the archive's
own 128-tick resolution:

| | across the twelve runs |
|---|---|
| busiest 128-tick window | 40.9 – 81.4 energy/tick |
| quietest 128-tick window | 0.0 – 6.8 energy/tick |
| ratio *within* one run | 7.9× – 22.6×, **median 15.4×** |

Eleven of the twelve give a finite ratio between 7.9× and 22.6×. The twelfth
(seed 23) had a 128-tick window in which the pond minted nothing whatsoever, so
its ratio is unbounded; saying that is cheaper than quietly dropping it or
pretending twelve seeds agreed on a number.

None of this is visible on the cumulative bar, and none of it is *contradicted*
by it either — which is the honest shape of the finding. The composition barely
moves in a default world (metabolism holds 89–100% of spend in almost every
window). What the run-to-date total hid was not the mix. It was the **scale**.

### Where the arms race actually shows up

Except in one place, and it is the mechanic this whole project is named for.

`digested` is the energy that leaves a prey creature and never arrives in the
predator — the gap between what a bite takes and what it delivers. Over a whole
20,000-tick run it is **0.6%** of everything the pond spends (mean over twelve
seeds), which is the sort of number that gets a mechanic filed under "rounding
error". In each run's busiest single window it is **13.6%** on average across
the twelve, and **25.4%** in the worst of them.

So a predation burst spends a quarter of the pond's entire energy budget on
trophic inefficiency, for a couple of hundred ticks, and the run-to-date bar
reports six parts in a thousand. This is the
[v1.21 lesson](#hunger-does-nearly-all-the-editing) in its second costume:
there, the arms race turned out to cause a tenth of the
deaths in a world built to showcase it. Here it is six tenths of a percent of
the energy — *on average* — and a quarter of it in the moment. A mechanic can be
negligible in the total and dominant in the event, and only one of those two
facts fits on a cumulative readout.

### Dating a break in the books

`audit()` could always ask whether the books balance. It could never ask *when*
they stopped. Each sample now carries the residual of the identity at its own
tick, which turns a yes/no into a time series with a zero line in it — and
because a break in the books is a transient, and decimation eats transients, the
residual is one of only two energy fields in the archive that carries a min/max
envelope. `test/energyHistory.test.js` pins exactly that: a single 42-unit
excursion at one sample out of 200 survives every halving in the envelope, and
is simply gone without it.

With nothing broken, the residual measures floating-point drift, and the comment
in `energy.js` claiming it "stays far below one pellet" had never actually been
run out to a long horizon. It does. On seed 314:

| ticks | energy minted | residual |
|---|---|---|
| 1,000 | 3.9 × 10⁴ | 9.8 × 10⁻¹⁰ |
| 8,000 | 3.0 × 10⁵ | 4.2 × 10⁻⁸ |
| 64,000 | 2.4 × 10⁶ | 4.9 × 10⁻⁶ |

After 64,000 ticks — eighteen minutes of watching at 60fps, and 2.4 million units
of energy through the books — the two sides of the identity disagree by two parts
in ten million of a *single pellet*. No extrapolation offered: that is the
horizon that was measured.

### Reproducing it

```js
// node this from the repo root: how much does the pond's power move?
import { World } from "./src/world.js";
import { makeConfig } from "./src/config.js";
import { energySeries } from "./src/energy.js";

for (const seed of [314, 7, 23, 99, 555, 1234, 2024, 8181, 42, 77, 101, 3141]) {
  const w = new World(makeConfig({ seed }));
  for (let t = 0; t < 20000; t++) w.step();
  // The whole run, at whatever resolution the archive has thinned itself to.
  const live = energySeries(w.stats.runHistory.series()).intervals.filter((i) => i.spend > 0);
  const power = live.map((i) => i.power);
  const digested = live.map((i) => i.rates.digested / i.spend);
  console.log(
    seed,
    `power ${Math.min(...power).toFixed(1)}..${Math.max(...power).toFixed(1)}`,
    `digested ${(w.energy.digested / w.energy.destroyed * 100).toFixed(1)}% run-to-date,`,
    `${(Math.max(...digested) * 100).toFixed(1)}% at worst`
  );
}
```

## The power strip: an exact quantity that forecasts nothing (v1.39)

The books have been on the chart's clock since v1.35 and had never been *drawn*.
v1.39 puts them under the death strip as two lines on the same x-axis — energy
minted per tick, and energy spent — and the interesting thing about that figure
is not either line. It is the band between them, because the identity
`created − destroyed = standing` means the gap is not a comparison of two
statistics: over any interval, `(minted − spent) × its length` **is** the change
in the energy standing in the pond, exactly, to the residual measured above.
`test/energyHistory.test.js` holds that at both the per-sample rate and the
120-tick mean the strip is actually drawn from.

Two things had to be decided by measurement rather than by eye.

**The window.** At the chart's native resolution an interval is four ticks, in
which a single pellet is worth six energy per tick — so a line drawn per-sample
is a picture of pellet arrivals, spiky enough that one spike sets the scale and
flattens everything else. The strip uses the same 30-sample (120-tick) trailing
mean as the live *Power* readout, which makes the right-hand end of the line
that readout's own value. Differencing a cumulative counter over a wider span is
exact, so widening costs nothing in accuracy — but it *is* a mean, and a mean
damps a peak, so the caption carries the window with the peak.

**Whether the gap says anything about what happens next.** It is tempting, and
it would have been easy to write into the Chronicle: the pond is running down,
therefore the population is about to fall. Twelve seeds, 20,000 ticks:

| | |
|---|---|
| windows where spending exceeded minting | **44%** (29–48% across seeds) |
| size of the gap, as a share of the flow | **6%** (5% on eleven seeds, 14% on seed 23) |
| sign of the gap agrees with the *next* change in population | **60%** (57–65%) |
| control: the population's own previous move agrees with the next | **86%** (78–90%) |

So the gap is a genuine leading signal in the trivial sense — 60% beats a coin —
and it is far *worse* than the free information already on the chart above it,
which is that a population that was rising a moment ago is usually still rising.
This pond is well-buffered: the standing stock moves by a few per cent of
throughput, and the population's own momentum swamps it. The strip is therefore
labelled as what it is — a stock, not a forecast — and nothing narrates it.

```js
// node this from the repo root: does the gap between the lines predict anything?
import { World } from "./src/world.js";
import { makeConfig } from "./src/config.js";
import { energySeries } from "./src/energy.js";
import { POWER_WINDOW } from "./src/stats.js";

for (const seed of [314, 7, 23, 99, 555, 1234, 2024, 8181, 42, 77, 101, 3141]) {
  const w = new World(makeConfig({ seed }));
  for (let t = 0; t < 20000; t++) w.step();
  const hist = w.stats.runHistory.series();
  const { intervals } = energySeries(hist, POWER_WINDOW);
  let down = 0, gap = 0, agree = 0, persist = 0, n = 0;
  for (let i = 1; i + 1 < intervals.length; i++) {
    const net = intervals[i].power - intervals[i].spend;
    if (net < 0) down++;
    gap += Math.abs(net) / Math.max(intervals[i].power, intervals[i].spend);
    const next = hist[intervals[i + 1].index].pop - hist[intervals[i].index].pop;
    const prev = hist[intervals[i].index].pop - hist[intervals[i - 1].index].pop;
    if (next === 0) continue;
    n++;
    if (Math.sign(next) === Math.sign(net)) agree++;
    if (Math.sign(next) === Math.sign(prev)) persist++;
  }
  const pct = (x) => `${(x * 100).toFixed(0)}%`;
  console.log(seed, `down ${pct(down / intervals.length)}`, `gap ${pct(gap / intervals.length)}`,
    `ledger predicts ${pct(agree / n)}`, `momentum predicts ${pct(persist / n)}`);
}
```

## Determinism and reproducibility

Vivarium is fully **deterministic**: a given `(seed, parameters)` pair produces
the exact same history every time, down to the position of every creature. This
is a real scientific virtue — reproducibility — and it's implemented by routing
*all* randomness through a single seeded pseudo-random generator
([mulberry32](../src/rng.js)). It's why you can share an interesting world just
by sharing its seed, and why the test suite can assert exact outcomes.

That paragraph has been in this document since v1.0 and, until v1.36, nothing
checked the half of it that matters most. See below.

## How reproducible is "reproducible"? (v1.36)

The claim above has two halves. **Within one build**, a seed reproduces a world —
that is what every determinism test in the suite asserts, by building two worlds
in the same process and comparing them. **Across builds** — the half that a
shared permalink, a screenshot, or an "earned seed" in a curated scenario
actually rests on — nothing asserted anything, because a test cannot run last
month's code. Thirty-five releases of "with this feature off, worlds are
bit-for-bit unaffected" all compared the present against the present.

So v1.36 went and measured it, by replaying the default pond under every tagged
version in the repository.

### The default pond has moved twice in its life

Each historical tree is extracted, handed today's
[`fingerprint.js`](../src/fingerprint.js), and asked for the hash of the default
world at ticks 0, 64 and 512:

| Releases | Trajectory hash at t512 | What moved it |
| --- | --- | --- |
| v1.0.0 | `87a4391e` | — |
| v1.1.0 – v1.2.0 | `b7c65b36` | Predators: extra genes drawn per founder |
| v1.3.0 – v1.35.0 | `94f52b66` | Seasons & biomes: the fertility field draws before the founders do |

**Thirty-three consecutive releases, bit-for-bit identical.** Both moves are
construction-time changes to the random stream — a founder drawing a different
number of values, or a field drawing before the founders — and both are declared
feature releases from the first fortnight of the project, before the promise was
written down in [AUTONOMOUS.md](AUTONOMOUS.md) at v1.9.2. The promise has never
been broken since it was made. It just also had no way of noticing if it were.

Now it does: `test/fingerprint.test.js` carries those hashes as recorded
constants for two seeds and four checkpoints.

### Why there are two hashes

The first version of this instrument hashed *everything* — positions, genomes,
brain weights, every per-creature field. That hash is a worse test, and the
history says so precisely: it moves at v1.4, v1.20, v1.23 and v1.33, four
releases that added a plasticity block, a `signal`, a `ground` and a set of foot
genes, while leaving the pond's future bit-for-bit untouched (an unused gene
slot draws no random numbers). A golden constant that has to be re-recorded
every time a release adds a field is not evidence of anything; it is a note
about the last time somebody re-recorded it.

So `trajectoryFingerprint` hashes where things *are* — position, motion, energy,
age, lineage counters, pellets, corpses — and is deliberately blind to how a
build represents them. `stateFingerprint` keeps everything, and is used for
comparisons inside one process, where representation should match too. Six
re-recordings avoided; the strict hash kept where it is strictly better.

### A different engine's arithmetic (the caveat that matters)

`Math.sin`, `Math.cos`, `Math.tanh`, `Math.exp`, `Math.pow` and friends are
**implementation-approximated** in ECMAScript: nothing in the standard requires
two engines, or two versions of one engine, to return the same bits. The pond
calls them about **4,900 times per tick**. (`Math.sqrt` is exempt — IEEE-754
requires it to be correctly rounded.) So a recorded hash is a statement about
this project *given* an engine's math library, which is why
`mathFingerprint()` exists and why the golden test checks the counts
unconditionally and the bit-exact hash only when the engine's math matches.

What is that caveat worth? Simulate the worst honest case — flip the last bit of
**every** implementation-defined `Math` result, which is the scale two faithful
libm implementations can disagree at — and run two ponds side by side:

| Seed | Populations at t20,000 | Worst per-creature drift | First 1-unit divergence | Populations part ways |
| --- | --- | --- | --- | --- |
| 314 | 217 / 217 | 3.0 × 10⁻¹² | t36,763 | t37,002 |
| 23 | 226 / 226 | 1.8 × 10⁻¹² | t22,785 | t22,881 |
| 7 | 152 / 152 | 3.0 × 10⁻¹² | none by t60,000 | none |
| 777 | 151 / 151 | 2.7 × 10⁻¹² | none by t60,000 | none |
| 991 | 225 / 225 | 2.3 × 10⁻¹² | none by t60,000 | none |

For the first twenty thousand ticks — five and a half minutes of watching at
60fps, longer than almost anybody looks — a pond with a different libm is the
*same pond*: identical population, identical food, creatures displaced by a few
picometres. Then, on two of five seeds, it stops being: the drift crosses the
threshold of some discrete decision (a bite that lands or doesn't, a birth that
happens a tick later) and from that moment the two worlds are merely
statistically similar. Three of five seeds had not crossed it by 60,000 ticks,
and no claim is offered past the horizon measured.

The reason the noise takes so long to matter is arithmetic, not luck. A creature
sits at x ≈ 450, where one ULP is 5.7 × 10⁻¹⁴; it moves by up to 2.6 per tick,
where one ULP is 2.2 × 10⁻¹⁶ — **256 times finer than the grid its position is
rounded onto**. Perturbing a velocity by one bit therefore changes the resulting
position only when the sum happens to straddle a rounding boundary. Flipping one
single `Math.sin` call, once, in a 20,000-tick run changes *nothing at all*,
measurably: the two worlds stay bit-identical to the end. It takes millions of
perturbed calls for a few to survive the rounding, and the survivors then
accumulate diffusively rather than exponentially — 4.5 × 10⁻¹³ at t100 growing
to 3 × 10⁻¹² at t20,000 — until one of them flips a decision.

### The flag sweep: kin recognition almost never happens

Recording a hash for every configuration is not possible, but two claims about
*all* of them are, and both are now tests. With every opt-in flag explicitly
switched off, the full state hash is identical to the default world's — for all
nineteen opt-in flags, read out of `DEFAULT_CONFIG` so a future feature is
covered the day its flag lands. And with each switched on, the world must
actually change (the v1.27 rule: sweep every lever once purely to check it *is*
a lever).

Seventeen of the nineteen change the pond within 1,000 ticks; the slowest is
disease, whose first case arrives at t901. Two do not, and neither is dead.
**Death is final** (v1.45) is rare rather than inert — the correction is
decisive when it fires and fires about ten times in 20,000 ticks, so the two
arms stay bit-identical until t3,587 on seed 314 — and is staged directly in
`test/deathIsFinal.test.js` instead. **Kin recognition** is the other, and it is
the interesting one:

| Seed | `canEat` pairs eligible by size and diet | Spared as kin | Closest eligible pair, genetically |
| --- | --- | --- | --- |
| 314 (the default pond) | 106,580 | **0** | 0.227 |
| 5 | 84,653 | **0** | 1.013 |
| 23 | 8,151,864 | 39,616 | 0.011 |

Kin recognition (v1.10) spares a target within `kinRecognitionDistance` = 0.05.
In the default pond it has fired **zero times in 20,000 ticks**, and not because
of a bug: the closest predator/prey pair the rule was ever offered there was
0.227 apart, more than four times the threshold. Seed 314 evolves a *separate*
predator lineage that hunts genetic strangers, so there is nothing for the rule
to spare. Seed 23 evolves the other thing — a largely clonal population eating
itself, where 8.2 million eligible pairs come up and half a percent of them are
family — and there the flag fires forty thousand times and changes the world at
t4,910.

So the flag is not dead; it is *ecologically conditional*, and which world you
get is decided by whether the pond splits into predator and prey lineages or
turns cannibal. One seed in five (23, 11, 42, 101, 777 tested) shows any effect
at all within 6,000 ticks. The mechanism has always had a direct unit test in
`test/kinRecognition.test.js`; what nobody had checked is how often the
mechanism gets to speak, and in the pond on the landing page the answer is
never.

### The door onto a conditional rule (v1.92)

Every other scenario in this project is a seed chosen to show a mechanic at its
best. Kin recognition cannot be presented that way, because on most seeds it has
nothing at all to show: the rule takes effect inside a hunter's senses, so a
pond where it never fires is not a muted version of one where it does — it is
the ruleless pond, hash for hash. Choosing a seed here is choosing one of the
minority of worlds in which the rule is ever offered a relative.

Sixty-four seeds, 12,000 ticks, `kinRecognition` on and everything else at its
default:

| | seeds |
| --- | --- |
| spare no relative at all | **45** |
| spare at least one | **19** |
| speak in three or more separate thousand-tick windows | 5 (23, 33, 37, 89, 512) |
| still speaking in the last quarter of the run | **2** (23, 512) |

Scoring on persistence rather than on the peak is v1.52's rule and it does the
work here: seed 128 spares 3,611 relatives and does all of it inside one
thousand-tick window, after which the pond never mentions the rule again. Of the
two that keep speaking, seed 23 is a thin cannibal pond — a mean of 95 creatures
and a dip to 5 — and is already *Earshot*'s door. Seed 512 holds a mean of
**165** creatures over 20,000 ticks, never drops below 40, kills 303 times, and
declines **8,800** meals in four episodes with long silences between them,
peaking at 300 per hundred ticks. It ships as *One Big Family*.

The control is exact rather than statistical, which is unusual for this project
and is a property of the rule rather than of the seed. Run seed 512 with the
flag on and off side by side: the two worlds are identical on all five channels
— the random stream included, because a refusal draws no numbers — through
t1,982, and part on **t1,983**, the tick the first relative is spared. v1.80
pinned one end of that statement (on seed 314 the two arms never part at all);
`test/scenarios.test.js` pins the other, and a seed that stopped firing, or
fired later, would fail it rather than quietly stop being a door.

What the scenario deliberately does not claim is that any of this changes the
pond's fate. Between t7,500 and t13,000 this world nearly stops killing — about
one kill per 500 ticks — while refusals run at 175 per hundred, and the story
tells itself. The flag-off arm has the same drought over the same window. That
is the same shape as v1.20's alarm call and v1.80's random-refusal arm: the
tile, the blurb and the Chronicle line report what the rule **did**, and this
project declines to say what it caused.

### Reproducing it

Replay history (needs a git checkout, no dependencies):

```bash
# The default pond's trajectory hash under every tagged version.
cat > /tmp/probe.mjs <<'EOF'
import { World } from "./src/world.js";
import { makeConfig } from "./src/config.js";
import { trajectoryFingerprint } from "./src/fingerprint.js";
const w = new World(makeConfig({}));
for (let i = 0; i < 512; i++) w.step();
console.log(trajectoryFingerprint(w), w.creatures.length, w.food.items.length);
EOF
for sha in $(git log --oneline --reverse | grep -E ' (Vivarium 1|v1\.)' | cut -d' ' -f1); do
  d=$(mktemp -d); git archive "$sha" | tar -x -C "$d"
  cp src/fingerprint.js "$d/src/fingerprint.js"; cp /tmp/probe.mjs "$d/"
  printf '%-40s ' "$(git show -s --format=%s "$sha" | cut -c1-38)"
  (cd "$d" && node probe.mjs); rm -rf "$d"
done
```

A pond with a different math library:

```js
import { World } from "./src/world.js";
import { makeConfig } from "./src/config.js";

const b = new ArrayBuffer(8), f = new Float64Array(b), u = new BigUint64Array(b);
const flip = (x) => (Number.isFinite(x) && x !== 0 ? ((f[0] = x), (u[0] ^= 1n), f[0]) : x);
let perturb = false;
for (const n of ["sin", "cos", "tan", "tanh", "exp", "log", "pow", "atan2", "hypot", "cbrt", "asin", "acos", "atan"]) {
  const real = Math[n];
  Math[n] = (...a) => (perturb ? flip(real(...a)) : real(...a)); // sqrt is IEEE-exact: left alone
}
const A = new World(makeConfig({ seed: 314 })), B = new World(makeConfig({ seed: 314 }));
for (let i = 0; i < 40000; i++) {
  A.step();
  perturb = true; B.step(); perturb = false;
  let worst = 0;
  for (let k = 0; k < Math.min(A.creatures.length, B.creatures.length); k++) {
    const p = A.creatures[k], q = B.creatures[k];
    worst = Math.max(worst, Math.abs(p.x - q.x) + Math.abs(p.y - q.y) + Math.abs(p.energy - q.energy));
  }
  if (worst >= 1 || A.creatures.length !== B.creatures.length) {
    console.log(`tick ${i + 1}: drift ${worst.toExponential(2)}, pop ${A.creatures.length}/${B.creatures.length}`);
    break;
  }
}
```

## Is every number in `config.js` a lever?

v1.36 asked this of the opt-in **flags** — thirteen of them at the time, and
there are nineteen opt-in flags now — and left the **numbers** unasked, which is
where both of this project's known dead
parameters came from. v1.27 found `detritusPerRadius` clipped by a cell cap that
silently discarded a third of every large carcass. v1.29 found `energyMax`
sitting above a threshold it could never be reached from. Neither was visible in
the code; both were found by moving a number and watching for a world that
didn't. So `src/levers.js` moves every one of the eighty-four constants in
`config.js`, and `test/levers.test.js` keeps doing it.

The answer is **yes, all of them** — but getting there took two corrections
to the sweep, and both are more interesting than the answer.

### A one-sided nudge measures one side

The first pass moved every constant *up* by 37% and reported fourteen dead.
Three of those are ceilings the pond never reaches, so raising them is by
definition a no-op:

| Constant | Raised | Lowered | Why |
| --- | --- | --- | --- |
| `populationMax` (650) | nothing in 700 ticks | bites at t482 | the pond peaks around 250 |
| `weightClamp` (8) | nothing in 600 ticks | bites at t1 | learned weights never approach ±8 |
| `energyMax` (220) | **bites at t1** | bites at t1 | not a ceiling problem at all — see below |

A sweep that only pushes one way will file a bound that never binds as dead. It
must push both.

### A constant is only live in a world where it can bite

The rest of the fourteen needed a world of their own, and the list is a decent
map of where this project keeps its conditionals: a parameter of an opt-in
feature needs that feature on; the disease constants cannot be measured before
patient zero arrives at t901; `reseedCount` is read only when the pond is
*completely* empty, which needs a world with no food, no trickle-rescue floor
and a short lifespan (it empties at t200); and `foodRadius` — a *drawing* radius
— turned out to set how close a scavenger must get to a corpse, so it was inert
with scavenging off. (That last one was a finding about `world.js`, not about
the constant, and the sweep had no way to say so. v1.40 gave the rule its own
`scavengeRadius` and the sweep a fourth channel — see "A sweep with no channel
for a thing calls that thing something else" below.)

`kinRecognitionDistance` is the extreme case and it extends the v1.36 finding.
That release showed the kin recognition *flag* never fires on seed 314. The
constant is worse off: at **0.5, ten times its default**, it still changes
nothing on seed 314 in 9,000 ticks, because no predator there ever meets a close
enough relative for the threshold to matter at any value. It is only live on
seed 23, where it bites at t4,910 in either direction. A number can be correct,
load-bearing and completely mute in the world everybody looks at.

### Four channels, because three of them aren't the simulation

Four constants move nothing in the pond *by design*: `speciationDistance`,
`neatCompatThreshold`, `phylogenySampleInterval` and `phylogenyHistory` are the
Tree of Life's, and `phylogeny.js` has said since v1.2 that "nothing here feeds
back into the simulation". A sweep holding only a state hash calls all four
dead. So there is a third hash — `observationFingerprint`, over the species
tree and the abundance record — and the observation-only constants are asserted
on **both** channels at once: each must move the view, and each must leave the
state bit-for-bit identical. That second half is the first test this project has
ever had of the pure-observer claim. `stepsPerFrame` gets the mirror-image
assertion: it must move neither, because how often a caller steps a world is not
a property of the world.

| Channel | Constants | The claim |
| --- | ---: | --- |
| world | 74 | moving it moves the state hash |
| observer | 4 | moves the tree of life and *not* the state hash |
| draw | 1 | moves the picture and *not* the state hash (v1.40) |
| ui | 1 | moves neither |

### The finding: `energyMax` was never only a clamp

v1.29 measured the ceiling on a creature's energy and found it unreachable — a
creature splits at `reproduceThreshold` (160) long before it can fill to 220, so
the pond spills exactly zero. That much is true, still true, and still pinned in
`test/energy.test.js`. The conclusion written on top of it was not: *"you could
set `energyMax` to 10,000 or delete it and nothing would move."*

Move it and the pond moves on tick one. `creature.js` builds the brain's input
vector with

```js
inp[1] = (this.energy / cfg.energyMax) * 2 - 1; // energy, centred
```

so `energyMax` is also the divisor of a creature's sense of its own energy — it
sets what *full* means to the thing making the decisions — and `render.js`
shades a body by the same fraction. The clamp is dead. The constant is one of
the most connected numbers in the file, and it had a comment in three places
saying it did nothing.

The general shape, and the reason this took nine releases to notice: **a
measurement of one of a constant's jobs is not a measurement of the constant.**
v1.29 went looking for the energy books to balance, found the ceiling never
fired, and wrote up the finding in the vocabulary of the instrument that found
it. The sweep has no vocabulary. It moves the number and asks whether *anything*
changed.

### What the live half of `energyMax` is worth

Twelve seeds, 6,000 ticks, population averaged over the last 2,000 — because a
seed-matched pair is one coin toss (v1.32), and this world has attractors.

| `energyMax` | mean population | sd across seeds |
| ---: | ---: | ---: |
| 160 (= `reproduceThreshold`) | 204.9 | 42.7 |
| 220 (default) | 212.3 | 77.5 |
| 301 | 241.5 | 60.3 |

Paired, 301 against 220: mean +29.2, sd **61.0**, 9 of 12 positive. The
between-seed spread is twice the effect, so this is *not* a demonstrated
direction — it is a different hand dealt, which is exactly what the tick-one
divergence says it is. Seed 23 makes the point on its own: 224 creatures at 160,
**16** at 220, 224 again at 301. That is a world falling into a different
attractor, not a dose-response curve.

One thing does change monotonically and is real: at `energyMax` = 160 the
ceiling finally coincides with the reproduction threshold, and the pond starts
spilling — up to 6% of everything it makes, against a floating-point zero at the
default. The clamp is reachable after all; it just needs the ceiling brought
down to the threshold rather than the population pushed up to the cap.

### `speciationDistance` is nearly out of road

The sweep lowers this one, and the reason is worth recording. Species counts on
the default pond after 6,000 ticks:

| `speciationDistance` | species | founded after the first tick |
| ---: | ---: | ---: |
| 0.05 | 201 | 161 |
| 0.10 | 73 | 33 |
| **0.15 (default)** | **45** | **5** |
| 0.20 | 40 | **0** |
| 0.40 | 40 | 0 |
| 1.00 | 37 | 0 |
| 1.20 | 1 | 0 |

The Tree of Life records five speciation events in 6,000 ticks of the default
pond, and the parameter that governs them sits one third below the value at
which it records **none at all** — above 0.20 the "tree" is a flat comb of the
forty founders, and stays that way across a twentyfold range. The view is not
broken and the constant is not dead, but the pond everybody looks at is being
observed from very close to the edge of the instrument's useful range, and that
was not written down anywhere.

### Reproducing it

```bash
node -e '
import("./src/levers.js").then(({ sweepLevers }) => {
  for (const r of sweepLevers()) {
    console.log(r.channel.padEnd(8), r.key.padEnd(24), `${r.from} -> ${r.to}`.padEnd(22),
                `world=${r.worldAt} observer=${r.observerAt} draw=${r.drawAt} /${r.ticks}`);
  }
});'
```

`worldAt` / `observerAt` / `drawAt` are the first tick at which that channel
disagreed with the control, or `-1` for a channel that never did (the picture is
only drawn for a constant that claims the `draw` channel, so `drawAt` is `-1` for
everything else). Every exception's reason —
which world a constant needs, which direction it has to be pushed, and why — is
in the `SPECIAL` table at the top of `src/levers.js`.

## A sweep with no channel for a thing calls that thing something else (v1.40)

The sweep above reported `foodRadius` — the radius a food mote is *drawn* at —
as a constant of the simulation that needs a scavenging world to show itself.
That was not a quirk of the constant. It was this line, in `world.js`, since
v1.8:

```js
const reach = c.radius + cfg.foodRadius + 6;  // how close a scavenger must get
```

A rule needed a corpse-sized distance; a corpse-sized number was already in the
config; so the size of a green dot on screen became a rule of the pond. Making
the motes prettier would have changed what a scavenger could reach, and the
sweep would have reported the visual tweak as a simulation change.

This is v1.38's own finding one release later, aimed at the instrument that
produced it. **An instrument only ever answers in its own vocabulary.** The
sweep watched the state and the tree of life, so when a constant moved the
state it said *simulation constant* — correctly, and without any way to say that
the constant had no business being one.

The correction is in two parts. The rule now has `scavengeRadius`, at the same
value 3 and in the same order of operations, so no scavenging world moved by a
bit. And the sweep has a fourth channel: `renderFingerprint`, over the stream of
drawing commands a frame produces. `foodRadius` is asserted on both halves of
what it now claims to be —

| Constant | world | observer | draw |
| --- | ---: | ---: | ---: |
| `foodRadius` (3 → 4) | never | never | **tick 1** |
| `scavengeRadius` (3 → 4) | **tick 396** | never | — |

— and a drawing number that starts steering the pond again is a test failure in
`test/levers.test.js`, rather than something a sweep stumbles over thirty
releases later.

The trailing `+ 6` was deliberately left out of the new constant. `(r + 3) + 6`
and `r + 9` are different doubles for **1.1%** of body radii (5M samples), and
that sum feeds the comparison deciding whether a bite lands, so folding it in
would have been a silent world change dressed as tidying up.

### Drawing is read-only, and now it is checked

`render.js` is the largest module in this project and had no tests from v1.0 to
v1.40, because it needs a canvas. It needs one to *paint*; it does not need one
to answer any question worth asking of it. `src/rendershot.js` supplies a 2D
context that records every call instead — about 3,400 operations for a pond of
300 creatures — which makes four things testable for the first time:

1. **Drawing changes nothing.** The header comment has claimed this since v1.0.
   Hash the world, draw it, hash it again, on all three world channels, and count
   the random numbers a frame draws (zero).
2. **The default view is the exact identity.** The camera's v1.17 invariant,
   asserted on an actual frame rather than on the camera's arithmetic.
3. **The audited colours are the drawn colours.** `palette.js` has measured every
   mark's contrast since v1.25 and nothing checked that the renderer strokes
   *those* tones — one surface measured, another assumed, which is how the immune
   ring spent fourteen versions at ΔE 0.2. The sick halo, the immune ring and its
   dash pattern, the predator disc and rim, and the contagious zone's tint are now
   asserted to appear in a real frame.
4. **The offscreen layers count.** Terrain and enriched ground are painted into
   offscreen canvases and blitted with identical arguments whatever they contain,
   so the recording hashes their pixels too.

The picture hash is **not** a golden constant, and that is a design decision
rather than an oversight: it moves when a colour is nudged or a mark grows a
pixel, all of which a release is allowed to do. v1.36's lesson is that an
instrument needing to be re-recorded whenever the project improves is a note
about its last re-recording. It compares two configurations drawn by the same
build.

### What a scavenger's reach is worth: nothing measurable

Having given the reach its own constant, it owed a measurement. Twelve seeds,
6,000 ticks, scavenging on, population averaged over the last 3,000.

| `scavengeRadius` | mean population | sd across seeds | paired vs. default | scavenging bites |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 228.5 | 77.8 | +0.6 (sd 29.5, 6/12 up) | 317 |
| 3 (default) | 227.9 | 60.7 | — | 290 |
| 9 | 232.2 | 70.1 | +4.3 (sd 27.9, 7/12 up) | 306 |
| 21 | 224.0 | 88.2 | −3.9 (sd 39.0, 7/12 up) | 302 |

A twentyfold range, and the paired differences are a seventh of their own
spread. The reach is a lever in the only sense the sweep claims — the pond
diverges at tick 396 — and it is not a knob with a direction.

The interesting part is the last column: even the *count of scavenging bites*
does not order itself by reach. Seed 5 takes 677 bites at a reach of 1 and 18 at
a reach of 3; seed 314 takes 184 at 3 and 506 at 9. Those are worlds falling
into different attractors, the same thing v1.32 found when six seed-matched
pairs disagreed with twelve. And it points at a mechanism: a scavenger reaches a
corpse by *homing in* on it through the same channel it hunts with, so it closes
the last few pixels either way. What limits scavenging is the approach and the
bite cooldown, not the distance at which the mouth opens. A reach is a
threshold on a journey that was going to end at the corpse anyway.

### Reproducing the reach measurement

```bash
node -e '
Promise.all([import("./src/world.js"), import("./src/config.js")]).then(([W, C]) => {
  for (const reach of [1, 3, 9, 21]) {
    let pop = 0;
    for (const seed of [314, 1, 2, 3, 5, 8, 13, 21, 23, 42, 2024, 777]) {
      const w = new W.World(C.makeConfig({ seed, scavenging: true, scavengeRadius: reach }));
      let s = 0;
      for (let i = 0; i < 6000; i++) { w.step(); if (i >= 3000) s += w.creatures.length; }
      pop += s / 3000;
    }
    console.log(reach, (pop / 12).toFixed(1));
  }
});'
```

## Two bars that were never about the same thing (v1.44)

The control panel has carried two stacked bars since v1.29, six lines apart in
the markup. One says **what they die of** — starvation, old age, predation. The
other says **where the energy goes** — metabolism, waste, buried. They are two
pictures of the same pond spending itself, they use deliberately related
colours, and for fifteen versions nobody asked whether they agree.

They do not, and the reason is structural rather than statistical.

The two ledgers touch at exactly one event: a body being swept up. The mortality
counters record *how many* died of each cause; the energy books record what the
pond lost when they did, under `buried`. Until v1.44 `buried` was a single
running total, so the question could not be asked at all. Splitting it by cause
costs one label passed to a function that was already being called one line
away — and the answer arrives immediately.

### The rarest death is nearly the whole column

Twelve seeds, 20,000 ticks each, default configuration:

| cause | share of deaths | share of buried energy | buried per body |
|---|---|---|---|
| starvation | 76.6% | 0.2% | **+0.025** |
| old age | 15.8% | **99.8%** | **+70.164** |
| predation | 7.6% | −0.0% | **−0.025** |

A creature that starves takes about **one three-thousandth** of what a creature
that grows old takes. That is not a property of this seed or this parameter set;
it is what the two deaths *are*. `die("starvation")` is the `then` branch of
`if (this.energy <= 0)` and predation kills by driving energy to zero, so both
of those bodies are empty by construction. `die("age")` is the `else` branch, so
an aged creature has something left by construction. The pond had already spent
the starved ones, tick by tick, under `metabolism` — which is 94–98% of all
spend across the twelve seeds, against `buried`'s 2.9%.

So the mortality bar is a mix of *events* and the energy bar is a mix of
*quantities*, and reading across from one to the other is a mistake. "Most of
our deaths are starvation" and "most of our losses are starvation" look like the
same sentence and only the first one is true.

### The dead still eat

The split also found something nobody was looking for, which is the usual way
round here (v1.38: *when a sweep reports something surprising, ask whether the
surprise is about the constant or about the code that reads it*).

Starvation's per-body figure is **positive**. It should not be able to be: a
starved body is at or below zero when it is marked. Between six and twelve
starved bodies per run — 0.3–0.7% of them — are buried holding a whole pellet's
worth of energy.

The mechanism is that **the update loop has no `dead` guard on the creature it
is updating**. `act()` pays the metabolic bill and marks the death at the top of
a creature's turn; grazing, biting and reproduction all happen *later in that
same turn*, and the corpse is not swept until step 5. The only `dead` checks in
`world.js` are on *other* creatures — as prey, as a neighbour, as an infection
source. Nothing checks the actor. So in the tick it dies, a creature can still:

- **eat the pellet it is standing on** (6–12 times per run), removing it from
  the pond;
- **take a bite of prey**, which is how a *predated* body comes to be buried
  holding +6.4 energy on seed 512;
- **reproduce**, if it died of old age holding more than `reproduceThreshold`.
  This is genuinely rare — 1 posthumous birth in 2,191 on seed 314, 0 in 2,015
  on seed 42 — but it is not zero.

None of this is large. All of it is real, and all of it is a rule nobody wrote:
the sweep is a *bookkeeping* step that has been quietly acting as the death
rule's clock. Fixing it would change every world on the first tick a creature
dies with a pellet under it, so by the project's own rule (v1.32, `exactVision`)
the fix would have to arrive as an opt-in flag with the measurement attached,
not as a silent correction. It arrived in v1.45 as `deathIsFinal` — see *Death
is final: what the sweep had been deciding*, below, for what the dead were
actually doing and what stopping them costs.

### Reproducing it

```bash
node -e '
Promise.all([import("./src/world.js"), import("./src/config.js"), import("./src/stats.js")])
  .then(([W, C, S]) => {
    const agg = {starvation:[0,0], age:[0,0], predation:[0,0]};
    for (const seed of [314, 7, 13, 23, 42, 99, 101, 256, 512, 777, 1234, 8181]) {
      const w = new W.World(C.makeConfig({ seed }));
      for (let i = 0; i < 20000; i++) w.step();
      const c = S.deathCosts(w.stats.deathsBy, w.energy.buriedBy);
      for (const k in agg) { agg[k][0] += c.causes[k].deaths; agg[k][1] += c.causes[k].energy; }
    }
    const n = Object.values(agg).reduce((s, a) => s + a[0], 0);
    const e = Object.values(agg).reduce((s, a) => s + a[1], 0);
    for (const k in agg)
      console.log(k.padEnd(11), (100*agg[k][0]/n).toFixed(1)+"% of deaths",
                  (100*agg[k][1]/e).toFixed(1)+"% of buried",
                  (agg[k][1]/agg[k][0]).toFixed(3)+"/body");
  });'
```

Counting the burials that should not be positive — the dead-still-eat finding —
needs only a wrapper around the ledger's own method:

```bash
node -e '
Promise.all([import("./src/world.js"), import("./src/config.js"), import("./src/energy.js")])
  .then(([W, C, E]) => {
    const tally = {};
    const orig = E.EnergyLedger.prototype.bury;
    E.EnergyLedger.prototype.bury = function (x, cause) {
      const t = (tally[cause] ??= { n: 0, positive: 0 });
      t.n++; if (x > 0) t.positive++;
      return orig.call(this, x, cause);
    };
    const w = new W.World(C.makeConfig({ seed: 314 }));
    for (let i = 0; i < 20000; i++) w.step();
    console.log(tally);
  });'
```

Both figures are in the CSV export too: every row of both scopes now carries
`energy_buried_starvation`, `energy_buried_age` and `energy_buried_predation`,
cumulative like the rest of the books, so differencing any two rows gives
exactly what each cause buried in between.

## Death is final: what the sweep had been deciding (v1.45)

v1.44 found the bug in the previous section by accident: starved bodies were
being buried holding energy they could not have had, because the update loop has
no `dead` guard on the creature it is updating. That release measured it and
deliberately did not fix it. `deathIsFinal` (off by default) is the fix, and —
as with `exactVision` in v1.32 — the measurement is the deliverable, because a
correction that deals every world a different hand is not something to apply
silently to thirty-eight releases of screenshots, permalinks and earned seeds.

The rule is one line, twice: **a creature that is dead takes no further turn.**
Once at the top of the per-creature loop, which catches a body bitten to zero by
a predator that updated earlier in the same tick, and once immediately after
`act()`, which catches a creature that has just starved or aged out paying its
own last bill. Everything downstream in that turn — grazing, biting,
reproduction — belongs to a turn it no longer has.

What is worth noticing is that this is not the pond changing its mind about
corpses. Every *other* `dead` check in `world.js` already existed: a dead
creature is skipped as prey, as a neighbour, as a mate and as an infection
source. The pond has treated a body as gone since v1.0. The only one who
disagreed was the body.

### What the dead were actually doing

Twelve seeds, 20,000 ticks each, with the flag **off** — i.e. the pond as it has
always run. Roughly four million creature-turns per seed:

| posthumous act | per run (12 seeds) |
| --- | --- |
| ate a pellet it was lying on | 7–13 (mean 8.7) |
| took a turn while already dead (steered, paid metabolism) | 7–302 (mean 88) |
| reproduced after dying | 1 across all twelve runs (seed 314) |
| bit something | **0** |

The bite never happened once in twelve runs, which is a reminder that the
plausible-sounding member of a list is not automatically the real one: a
posthumous bite needs a dead carnivore with a living target inside reach *and*
its bite cooldown expired, and that conjunction simply never came up. The
+6.4 predated burial v1.44 reported on seed 512 was a body that had been bitten
to zero and then **grazed**.

### The books close differently

The clean result is in the ledger, not in the population. `energy_buried_predation`
over 20,000 ticks, by seed:

```
off:  -2.17  -7.35  -9.65  -1.04  +6.38  -2.37  -6.49  -0.79  +29.39  -14.02  +1.55  -1.53
on:    0.00   0.00   0.00   0.00   0.00   0.00   0.00   0.00    0.00    0.00   0.00   0.00
```

Exactly zero, on every seed, and it is a theorem rather than a coincidence: a
bite takes `min(prey.energy, biteEnergy)` and only kills when that minimum was
the whole of it, so a body the pond killed is at *precisely* zero. With the flag
on, nothing can touch it afterwards. `test/deathIsFinal.test.js` asserts it.

Starvation is the same story one step less sharp. With the flag off, the
starvation column comes out **positive** on nine of twelve seeds (up to +61.5) —
bodies buried holding what they ate after dying. With it on, every seed is
negative (−31 to −162), which is the overdraft it should be: a starved creature
finishes a hair below zero because it paid its last bill in full.

### What it does to the pond: not much, and not measurably

Mean population over the last 5,000 ticks of each run, off vs on:

```
off:  206.9  240.5  181.1  263.6  189.6  249.2  209.6  244.2  232.8  169.7  235.6  144.2
on:   207.2  249.8  218.6  238.9  278.2  250.6  218.2  254.4  235.7  183.3  228.2  152.2
Δ:     +0.3   +9.2  +37.5  -24.7  +88.7   +1.4   +8.6  +10.1   +2.9  +13.6   -7.4   +8.0
```

Ten of twelve are positive and the mean is +12.3 (+5.8%), which sounds like a
result and is not one: the standard deviation across seeds is 28.0, so the
standard error on that mean is 8.1 and one seed (512, +88.7) carries a third of
it. This is exactly the v1.32 lesson — *a seed-matched pair is not a replicate
in a world with attractors* — and twelve pairs is enough to say the effect is
not large, not enough to say which way it points. Correcting the rule does not
obviously cost or buy the pond anything. What it changes for certain is that the
books stop recording things that cannot happen.

### The correction is rare, not subtle

The most surprising number here is how long it takes to matter. Because a
posthumous act happens roughly ten times in 20,000 ticks, the two arms run
**bit-for-bit identical** for thousands of ticks and then part company at the
first one:

```
seed:      77    314      7     42     21     13     23     99
diverges: 2963   3587   2970    —      —      —      —      —      (— = still identical at tick 4000)
```

Half the seeds tried had not diverged at all after 4,000 ticks. This is why
`test/fingerprint.test.js`'s "every opt-in feature is a lever when it is on"
check skips this flag alongside `kinRecognition`: its 1,000-tick budget cannot
see a difference that has not happened yet, and stretching the budget for one
flag would make the whole sweep four times slower. The mechanism is staged
directly instead, in one tick, in `test/deathIsFinal.test.js`.

### Reproducing it

```bash
node -e '
Promise.all([import("./src/world.js"), import("./src/config.js"), import("./src/creature.js")])
  .then(([W, C, Cr]) => {
    for (const deathIsFinal of [false, true]) {
      let actor = null, graze = 0, birth = 0, turnsDead = 0;
      const act = Cr.Creature.prototype.act;
      Cr.Creature.prototype.act = function (o) {
        actor = this; if (this.dead) turnsDead++; return act.call(this, o);
      };
      const rep = Cr.Creature.prototype.reproduce;
      Cr.Creature.prototype.reproduce = function (...a) {
        if (this.dead) birth++; return rep.call(this, ...a);
      };
      const w = new W.World(C.makeConfig({ seed: 314, deathIsFinal }));
      const g = w.energy.graze.bind(w.energy);
      w.energy.graze = (m, k) => { if (actor && actor.dead) graze++; g(m, k); };
      for (let i = 0; i < 20000; i++) w.step();
      Cr.Creature.prototype.act = act; Cr.Creature.prototype.reproduce = rep;
      console.log("deathIsFinal=" + deathIsFinal, { graze, birth, turnsDead,
        buriedPredation: +w.energy.buriedBy.predation.toFixed(2),
        buriedStarvation: +w.energy.buriedBy.starvation.toFixed(2) });
    }
  });'
```

## The colour that was never a name (v1.46)

The Tree of Life groups creatures into species and stacks each species' share of
the pond as a coloured band. A species' colour is its founder's hue, and hue is
an inherited gene — so a daughter species founded by a descendant of species *k*
is drawn in **very nearly species *k*'s colour**, and often in exactly it.

Nobody had measured this in forty-five releases. The colour audit added in v1.25
had reached the pond, the minimap, the mortality bar, the chart and the DOM, and
had never opened this figure, which is the one this project's headline claim is
made of.

### What the bands actually look like

Twelve seeds, 6,000 ticks each, every band the plot names, composited over the
panel background and measured with the same CIE76 ΔE the rest of the audit uses:

| seed | bands | pairs at ΔE 0 under **normal** vision |
| ---: | ----: | ------------------------------------: |
|    1 |    10 |                                    10 |
|    7 |    12 |                                     3 |
|   13 |     5 |                                     1 |
|   23 |     2 |                                     0 |
|   42 |    16 |                                    24 |
|   64 |     5 |                                     1 |
|   77 |    14 |                                    24 |
|   88 |    19 |                                    70 |
|  314 |    11 |                                    15 |
|  512 |    15 |                                    22 |
| 2024 |     7 |                                     2 |
| 9001 |    12 |                                    22 |

**Eleven of twelve seeds draw at least one pair of species in the same colour**,
and the exception has only two bands. The default pond — the one on the landing
page, the one every screenshot is of — draws **four of its eleven bands at hue
335**. The worst draws **six of nineteen at hue 106**. These are not near
misses: ΔE 0.0, the same fill string.

This is not a colour-blindness finding. It fails for everyone, and it fails
first under normal vision, which is the v1.25 lesson arriving again — an
accessibility audit is a general legibility audit that happens to have a
threshold.

### Colour cannot fix it, and that is arithmetic

The obvious repair is a better palette: hand out hues so they never collide.
Walk the hue wheel greedily, taking every hue that clears `MIN_DELTA_E` against
everything already taken, and you get an upper bound on how many lineages colour
could *ever* name at once in this figure:

| vision model | distinct lineage colours available |
| ------------ | ---------------------------------: |
| normal       |                                 16 |
| tritanopia   |                                 12 |
| protanopia   |                                  9 |
| deuteranopia |                                  7 |

The plot has drawn **19** bands at once. Colour runs out before the pond does,
under the best vision model, with a palette chosen perfectly — and the palette
is not chosen at all, it is inherited. (Same shape as v1.25's conclusion about
twelve lineage hues in a dichromat's two-dimensional space: before designing a
fix, check whether the thing you need has anywhere to live.)

### The cue is geometry

So every band wears a **hatch** — nothing, `/`, `\`, `|`, `—`, `×` or `+` — and
so does its legend chip, from one definition, because a key and the thing it
keys must not be two pieces of code. Geometry survives every vision model
(v1.34), and the assignment is a greedy colouring of the collision graph in
stacking order, costing a pair by *how many* of the four vision models cannot
separate it, so an identical-colour pair is always broken before a
dichromacy-only one.

Over the same twelve seeds and 128 bands: **194 identical-colour pairs, of which
5 still share a hatch** — ten of twelve seeds fully separated, including the
default. The residue is entirely seed 88, whose nineteen bands need eleven
hatches and get seven, plus one pair on seed 42. Seven hatches cannot separate
an arbitrary number of identical bands and the code degrades to the least-bad
clash rather than to an arbitrary one; the shortfall is stated here rather than
rounded off.

Stacking order is a safe name to hang this on, and that is worth writing down:
`displaySpecies` filters on a species' *peak* abundance, and a peak never falls,
so a band that has once been drawn is drawn forever and new ones append at the
end. A band's hatch is therefore fixed for the whole run — it cannot change
under a reader who is watching one.

Reproduce it:

```bash
node --input-type=module -e '
  const W = await import("./src/world.js"), C = await import("./src/config.js");
  const M = await import("./src/mullerplot.js");
  for (const seed of [1,7,13,23,42,64,77,88,314,512,2024,9001]) {
    const w = new W.World(C.makeConfig({ seed }));
    for (let i = 0; i < 6000; i++) w.step();
    const sh = M.mullerShares(w.phylogeny), hues = sh.shown.map(s => s.hue);
    let same = 0, unresolved = 0;
    for (let i = 0; i < hues.length; i++) for (let j = i + 1; j < hues.length; j++)
      if (M.collisionCost(hues[i], hues[j]) === 4) { same++; if (sh.texture[i] === sh.texture[j]) unresolved++; }
    console.log(seed, { bands: hues.length, same, unresolved });
  }'
```

## Who goes first: the rule that was never written down (v1.47)

Every version of this simulation has updated its population **sequentially**.
`world.step()` walks `this.creatures` one creature at a time: each senses the
pond as the creatures before it have already left it, moves, eats, and may
breed, all before the next one is reached. That is not the only way to write a
tick — a simultaneous update, where everybody senses the same frozen world and
all the consequences land at once, is the obvious alternative — and this project
has never stated which it does, let alone what the choice costs.

It costs something, because **the array is birth order**. Step 5 removes the
dead in place and appends the newborns, so a founder sits near the front of the
sweep for its entire life. Nothing here was ever designed to reward seniority.
It falls out of a `for` loop.

### The two things the order decides

Only two events in the tick are genuinely settled by it, and as of v1.47 both
are counted (`stats.contested`, `stats.crowdedOut` — free, exact, and read by
nothing in the simulation):

1. **A contested pellet.** Two creatures standing within eating reach of the
   same pellet: the earlier index takes it, and the later one arrives to find
   the pellet flagged `eaten` and goes hungry. Only a creature that ends its
   turn having eaten *nothing* is counted — losing one of two pellets you were
   standing on costs nothing, because a creature eats at most one per tick.
2. **The last place in a full pond.** Reproduction is refused once the
   population reaches `populationMax`, and which creatures get the last places
   is decided by index alone. This is the sharper of the two: a lost pellet is
   one meal, a refused split is a lineage that does not start.

Over twelve seeds at 9,000 ticks:

| | fixed order (default) |
|---|---|
| meals taken | 178,354 |
| meals lost to the order | **8,021 — 4.50%** |
| per-seed range | 2.45% (seed 512) – 8.04% (seed 1234) |
| how often | one lost meal every 7–28 ticks |
| reproductions refused | **0, on every seed** |

The second row is the finding I did not expect: one meal in twenty-two is taken
out from under somebody who was standing on it. The last row is the one worth
remembering — `populationMax` is 650, a default pond peaks around 300, and so
the *sharper* of the two mechanisms **never fires in the world anybody looks
at**. It is `kinRecognition` again (v1.36): correct, tested, and mute.

### What the order is worth: nothing measurable, and the control says so

`shuffleTurnOrder` (opt-in) draws a fresh Fisher–Yates permutation each tick.
It is not a fairness *fix* — somebody still goes first — it is the scrambled arm
the v1.27 rule demands: a feature that decides *who goes first* has no "off"
position, so its control is choosing at random instead.

Twelve seeds, 9,000 ticks, mean population over the last 3,000:

| arm | mean | median | seeds up | range |
|---|---|---|---|---|
| shuffled order | +3.2% | +4.1% | 10/12 | −47.1 … +31.3% |
| **same draws, same order** | +11.8% | +2.8% | 9/12 | −2.3 … +46.2% |
| **one wasted draw per tick** | +4.6% | +2.0% | 7/12 | −4.4 … +19.1% |

Ten seeds out of twelve rising looks like a result, and it is not one. The
second arm reorders **nothing** — it burns exactly the *n−1* draws the shuffle
would have burned and then hands back the population array untouched — and it
moved further in the same direction. The third burns a single draw per tick, an
intervention with no mechanism of any kind, and lands in the same place. All
three arms are doing one thing: dealing the pond a different hand.

(The "10/12 up" is also less than it looks. All three arms are compared against
the *same* baseline run, so the comparisons are correlated: a seed whose default
trajectory happens to sit low reads as a rise in every arm at once. This is
v1.32's rule — a seed-matched pair is exactly as clean as one coin toss — with
the pairing shared across three tests instead of one.)

The honest summary: **the turn order decides 4.5% of all meals, one at a time,
and has no aggregate consequence this instrument can see.** Both halves matter.
The mechanism is real, staged in `test/turnOrder.test.js` in one tick with two
creatures and one pellet; the effect is invisible at twelve seeds against a null
that changes nothing at all.

### What stays fixed, and why

Three things in the tick deliberately step out of the sweep's order, each
because reading *stale* state is the fairer answer:

- **Contagion** is resolved before anything moves, on the positions everyone
  held at the top of the tick, and new cases are applied only after the whole
  pass — so an infection cannot chain through three hosts in one tick.
- **A call is heard as it was emitted last tick** (`prevSignal`, frozen before
  the sweep), so what a creature hears never depends on where its speaker sits
  in the array.
- **Newborns land in `born`** and take no turn until the following tick.

Those were the three places where somebody noticed the ordering question and
answered it locally. Grazing, biting and the population cap are the places where
nobody did.

### Reproducing it

```bash
node --input-type=module -e '
  const W = await import("./src/world.js"), C = await import("./src/config.js");
  // Arm 3: fixed order, but burning the draws the shuffle would have used.
  class Burn extends W.World {
    _turnOrder() {
      for (let i = this.creatures.length - 1; i > 0; i--) this.rng.int(0, i);
      return this.creatures;
    }
  }
  const run = (Cls, seed, shuffleTurnOrder) => {
    const w = new Cls(C.makeConfig({ seed, shuffleTurnOrder }));
    let s = 0;
    for (let i = 0; i < 9000; i++) { w.step(); if (i >= 6000) s += w.creatures.length; }
    return { pop: s / 3000, lost: w.stats.contested, refused: w.stats.crowdedOut };
  };
  for (const seed of [314,7,13,21,42,77,88,101,256,512,999,1234]) {
    const a = run(W.World, seed, false), b = run(W.World, seed, true), c = run(Burn, seed, false);
    console.log(seed, a, "shuffled", (100*(b.pop-a.pop)/a.pop).toFixed(1)+"%",
                          "burned",   (100*(c.pop-a.pop)/a.pop).toFixed(1)+"%");
  }'
```

## Rock: giving a spatial pressure somewhere to accumulate (v1.48)

v1.23 built terrain in two halves — rough ground costs more to cross, and rough
ground grows less — and only the second half did anything. The write-up above
("Terrain: why a cost is not a landscape") diagnosed the failure as a
**timescale**: `maxSpeed` and `maxAge` together say a creature samples the whole
map many times over in its life, so a spatially varying *mortality* averages
clean away before selection can act on it. Three remedies were listed. v1.33
built the wrong one — perception, which changes the information and not the
timescale, and which found exactly nothing. The two that address the diagnosis
are *restrict movement* and *vary the resource*. Barriers are the first.

### What the rock is

Four walls, seed-derived by integer hash like the terrain (so switching them on
draws no random numbers): two north-south, two east-west, 14 px thick,
wrapping. On a torus one wall of an axis divides nothing — you walk around
through the seam — so two of each is the minimum that makes rooms, and it makes
**four**. Each wall carries gates 44 px wide, and it carries them **per room
border**, not per wall: one gate in every band the perpendicular walls cut it
into. Rock covers 5.7% of the pond.

Movement only. Sight, sound, teeth and the pathogen all still cross rock, and
nothing can perceive a wall — a creature meets one, loses the component of its
velocity that pointed into it, keeps the other, and runs along the rock until a
gate happens. "Finding the gate" is not a behaviour anything evolved; it is what
axis-separated collision does for free.

### The bug the invariant found before the pond did

The first version placed each wall's gate independently, and the flood fill in
`test/barriers.test.js` failed on the second seed it tried. On seed 77 both
north-south gates landed in the same east-west band, so one of the four rooms
had no door at all: 26% of the pond was an aquarium, on a layout that would have
shipped to anyone who typed that seed. Independent placement makes connectivity
a matter of luck, and a layout is drawn from a seed, so the unlucky ones ship.
Placing a gate in every band a wall crosses makes the room graph the full grid,
and the pond is one pond **by construction** rather than on the seeds I happened
to test.

### One door is a pond that dies; two are free

Twelve seeds, 9,000 ticks, mean population over the run:

| layout | mean population | seeds under 40 |
|---|---|---|
| no walls | 181.1 | 0 / 12 |
| 4 walls, **one** 44 px gate per border | 135.9 | **3 / 12** |
| 4 walls, **two** 44 px gates per border | **196.4** | 0 / 12 |
| 4 walls, one 88 px gate per border | 149.4 | 3 / 12 |

One door per border kills ponds, and the mechanism is visible in the runs: a
room that loses its population cannot be recolonised through a single 44 px
door, so the pond loses that quarter of its carrying capacity permanently. Two
44 px doors also beat one 88 px door, on both columns. What a room needs is
**routes, not aperture** — which is a statement about the graph, not about the
geometry, and I would not have guessed it.

At two gates the walls cost the pond nothing measurable. The +8% in the table is
not a claim: it is one arm against one baseline per seed, which v1.47 established
is exactly as clean as one coin toss.

### The pond really is less mixed

Room changes per 10,000 creature-turns, same imaginary room lines in both arms:

| seed | no walls | walls |
|---|---|---|
| 314 | 27.9 | **4.7** |
| 13 | 16.0 | **5.6** |
| 77 | 27.4 | **5.9** |

A three- to six-fold drop. This is the mechanism the feature is for, and it is
the one thing here that could not have been bought with a bigger number in
`terrainRoughCost`: a cost slows a crossing, a wall removes it.

Net *displacement* — how far a marked cohort gets from where it started over 600
ticks — was the first thing I measured and it is not the statistic to use. It
moved in both directions across seeds (95 → 123 px on seed 1, 95 → 106 on seed
13, 98 → 95 on seed 7), because 600 ticks does not carry a creature across a
room in either arm. A measure of mixing has to be about the *boundary* being
crossed, not about distance travelled near it.

### Isolation by distance, with the control inside the same world

If the rooms are real, lineages should diverge across them. Measured as the mean
genetic distance between creatures in *different* rooms minus the mean between
creatures in the *same* room, over the run's second half, as a fraction of the
within-room distance:

| arm | median | mean |
|---|---|---|
| walled pond, real room lines | **+0.177** | +0.219 |
| walled pond, lines shifted half a room over | +0.036 | +0.036 |
| unwalled pond, same real lines | +0.030 | +0.070 |

Two creatures either side of a wall are about 18% further apart genetically than
two on the same side. The second row is the control worth having and the reason
this claim is worth making: it is the **same run, the same trajectory, the same
creatures**, partitioned by lines that do not follow the rock — and the signal
almost vanishes (11 of 12 seeds). That control cannot inherit the shared-baseline
problem v1.47 ran into, because there is no second run for it to share anything
with. The third row is the ordinary between-arms control, and it agrees.

Note that the unwalled pond is **not** at zero (+0.030 median, and +0.472 on seed
23). This pond has always had some spatial genetic structure — offspring are born
touching their parent, and lineages pool in the biomes — so the honest claim is
that rock multiplies an existing structure roughly sixfold, not that it creates
one from nothing.

### What it does not do

Nothing perceives the rock, so nothing has learned to use it. There is no
wall-following behaviour beyond the physics, no memory of where a gate is, and a
predator standing on one side of a wall can still see, hear, infect and bite
something on the other. Those are the interesting next questions and none of them
is claimed here. (The second of them is `barrierOcclusion`, below, and what it
found is that it does not deepen this result at all.)

### Reproducing it

```bash
node --input-type=module -e '
  const W = await import("./src/world.js"), C = await import("./src/config.js");
  const B = await import("./src/barriers.js");
  const rooms = (f) => {
    const vs = f.walls.filter(w=>w.vertical).map(w=>w.pos).sort((a,b)=>a-b);
    const hs = f.walls.filter(w=>!w.vertical).map(w=>w.pos).sort((a,b)=>a-b);
    const band = (v,l) => { if (l.length<2) return 0; let k=0; for (const p of l) if (v>=p) k++; return k%l.length; };
    return (x,y) => band(x,vs)*10 + band(y,hs);
  };
  for (const seed of [314, 13, 77]) for (const on of [false, true]) {
    const w = new W.World(C.makeConfig({ seed, barriers: on }));
    const room = rooms(w.barriers ?? new B.BarrierField(C.makeConfig({ seed, barriers: true })));
    const prev = new Map(); let moves = 0, turns = 0;
    for (let i = 1; i <= 2000; i++) {
      w.step();
      if (i < 500) continue;
      for (const c of w.creatures) {
        const r = room(c.x, c.y), p = prev.get(c.id);
        if (p !== undefined) { turns++; if (p !== r) moves++; }
        prev.set(c.id, r);
      }
    }
    console.log(seed, on ? "walls" : "open ", (1e4*moves/turns).toFixed(1), "room changes per 10k turns");
  }'
```

### The door: seed 51 (v1.52)

Sixteen releases of this project have shipped a mechanic and left it behind a
checkbox. Rock now has a scenario — **The Four Rooms** — and the seed it ships
was chosen by a 64-seed sweep scored on the *control* rather than on the
headline, which is the rule the Lay of the Land's seed 13 was picked under: a
big number with a dirty control is not a demonstration of anything.

On seed 51, with `barriers` and `barrierOcclusion` on, predation and seasons:

| what is being compared | isolation |
|---|---|
| walled pond, real room lines | **+0.807** |
| walled pond, lines shifted half a room over (same run, same instant) | +0.052 |
| unwalled pond, same real lines | −0.104 |

A factor of fifteen against the control that cannot share a baseline, and a
sign flip against the one that can. The crossing rate does the usual thing —
31.7 room changes per 10,000 creature-turns open, 8.1 walled — and the pond
stays a pond while it happens: a mean of 217 creatures over 16,000 ticks, never
below 37, with 765 kills.

What made this seed the one is not the size of the first row but that it *keeps*
the signal: +0.556 over ticks 4,000–8,000 against a control of +0.074, and
+0.176 over 8,000–16,000 against +0.037. Most of the field decays to nothing
long before then, and the tempting explanation — one lineage sweeps the pond and
erases the difference the rooms spent thousands of ticks building — is wrong, or
at least is not what the Tree of Life is counting. Four seeds, read every 2,000
ticks:

| seed | isolation, t4,000 → t16,000 | mean pairwise distance | species, t16,000 |
|---|---|---|---|
| 51 | +1.017 → +0.042 | 0.84 → 0.32 | 8 |
| 13 | +0.966 → +0.022 | 0.48 → 0.20 | 16 |
| 45 | +0.240 → +0.031 | 0.79 → 0.25 | 28 |
| 32 | +0.436 → +0.020 | 0.27 → 0.19 | 7 |

The signal goes when the pond's *genetic variance* goes, and the species count
says nothing about it: seed 45 ends with twenty-eight species and no isolation
at all, while seed 51 holds the signal longest with eight. That is the phenetic
clustering doing exactly what it is documented to do — `speciationDistance` is a
fixed threshold, so a pond that has lost most of its variance still names its
remaining scraps — and it is a reminder that a count of species is not a measure
of diversity. Seed 32 is the awkward row and is left in on purpose: it is
already down to 0.27 at t4,000 and still reading +0.436, so low variance does
not *by itself* kill the signal. Filed as a lead, not a finding: four seeds, one
arm each, and no control that separates *why* the variance drains from *that*
it does.

`test/scenarios.test.js` pins the first two rows on the shipped seed with a
fifth of the measured margin. It is the first test in this project to assert the
isolation result at all; before this it lived only on this page.


## Opaque rock: a wall that stops information, and what that is worth (v1.50)

v1.48 shipped rock that stops a body and nothing else, and said so in three
places: sight, earshot, a mate search and the pathogen all crossed solid stone.
That was the right call for one release, because a wall that changes movement
*and* information cannot be attributed. `barrierOcclusion` is the second
mechanic, on its own flag, measured against the transparent walls rather than
against open water.

### The rule, and how it is drawn

One predicate. `barriers.occluded(ax, ay, bx, by)` asks whether rock stands on
the segment between two points, and every sense query asks it first: the nearest
pellet, the nearest prey, the nearest threat, the loudest voice in earshot, a
mate, and the pathogen. Teeth needed no rule of their own — a hunter bites what
it homed in on, and it can no longer home in on what it cannot see.

The geometry is exact rather than sampled. A marched ray steps straight through
fourteen pixels of rock often enough to matter, and a rule that depends on a
step size is a rule nobody can state. Every wall is axis-aligned, so a segment's
stay inside a slab is one interval of *t*, and inside that interval the question
"gate or rock?" is another interval intersection. Checked against the dumbest
possible implementation — walk the segment, ask `blocked()` eight thousand times
— on a thousand segments across two seeds, with no disagreements.

**The same function draws it.** `visibleRadii` is `firstHit` asked once per
direction, so the vision overlay stops being a circle and becomes the shape
sight actually takes, shadows and all. That is not a courtesy: v1.32 kept the
inexact-vision bug and fixed the *picture* of it, on the principle that a bug
you keep for compatibility is defensible and a view that hides it is not. A test
in `test/render.test.js` takes the path the renderer emits and asserts every
vertex is a point the rule calls visible with the point one pixel beyond it
hidden, so the picture cannot drift from the rule.

### How much the rule bites

Measured inside **one** pond at **one** instant, under both rules — so there is
no trajectory divergence to attribute anything to, and the number is exactly
zero with the feature off (the v1.20 standard). Six seeds, tick 4,000:

| quantity | value |
|---|---|
| in-range sight lines that cross rock | **32.5%** |
| creatures whose nearest pellet changes | **14.6%** |
| creatures whose nearest threat changes | **12.7%** |
| of those who could see a hunter, share who stop being able to | **15.5%** |
| creatures left with no pellet in sight at all | **0.0%** |

A third of everything a creature can see, it can no longer see. The last row is
the shape of the change: with 280 pellets in the pond, opacity almost never
*blinds* anybody, it **redirects** them — the pellet behind the wall is replaced
by a different pellet, on this side.

### It does not deepen the isolation, and that is the finding

v1.48's headline is that creatures either side of a wall are about 18% further
apart genetically than creatures on the same side. Opaque rock is the obvious
way to make that bigger, and here it is over twelve seeds at 9,000 ticks, with
v1.48's own within-run control (the same pond partitioned along lines shifted
half a room over):

| arm | isolation, median | control, median | population, median | kills/10k, median |
|---|---|---|---|---|
| no walls | +0.018 | +0.028 | 195 | 57 |
| walls, transparent | **+0.168** | +0.027 | 239 | 153 |
| walls, opaque | **+0.105** | +0.020 | 229 | 371 |

Per-seed, opaque against transparent: isolation up on **6 of 12** seeds,
population up on **6 of 12**. That is a coin toss twice over, and the median
moves the wrong way. The tempting claim — a wall that also blocks sight ought to
isolate more — is dead.

It is dead for a reason this project has already written down twice. Genetic
structure across the rooms comes from **restricted movement**: a lineage stays
where it is because crossing takes long enough for drift to act. That is a
*timescale*. Opacity changes the **information** a creature has, and information
is not a timescale — the same mismatch v1.33 found when it gave creatures a
sense for rough ground and selection was indifferent, and the same one v1.48
finally got right by attacking the mixing instead of the cost. **A remedy has to
be about the same noun as the diagnosis**, and this remedy is about a different
noun from the quantity it was expected to move. It is worth saying that this was
predictable from the file it is written in, and I did not predict it.

The one thing that did move is predation: the median rises from 153 kills per
10,000 ticks to 371. But it rises on **8 of 12** seeds, which is p ≈ 0.19 by a
sign test — not evidence — and the between-seed spread runs from 11 to 911. A
dozen seeds, or it is an anecdote about a trajectory (v1.32). The plausible
mechanism, offered as a hypothesis and not as a result, is that sight is
symmetric and fleeing is worth more to prey than spotting is to a predator: 15%
of everyone who could see a hunter stops being able to, and a prey that cannot
see a hunter does not run.

### What it costs

The tick is **3.4x** slower in a walled pond with opacity on (1,530 → 450 ticks
per second on seed 314, against an animation rate of 60), and the whole of that
is the sense queries. Two things keep it from being worse. The rule is exact and
therefore O(walls), not O(length); and the scans only ask it of a candidate that
could **change an answer** — a pellet no nearer than the best so far can never
become the nearest one, so the wall in front of it never has to be looked for.
That one reordering is worth 1.9x on its own.

### Reproducing it

The pellet half of the table above — the creature half is the same loop over
`w.creatures` with a `canEat` filter, which is why the percentage here (27.2% on
seed 314) sits a little under the 30.7% that run reports for both together.

```bash
node --input-type=module -e '
  const W = await import("./src/world.js"), C = await import("./src/config.js");
  const V = await import("./src/vec.js");
  for (const seed of [314, 13, 77]) {
    const cfg = C.makeConfig({ seed, barriers: true });
    const w = new W.World(cfg);
    for (let i = 0; i < 4000; i++) w.step();
    const R2 = cfg.visionRadius ** 2;
    let pairs = 0, hidden = 0, changed = 0;
    for (const c of w.creatures) {
      let open = null, occ = null, od = R2, cd = R2;
      for (const f of w.food.items) {
        if (f.eaten) continue;
        const d2 = V.torusDist2(c.x, c.y, f.x, f.y, cfg.width, cfg.height);
        if (d2 >= R2) continue;
        pairs++;
        const blocked = w.barriers.occluded(c.x, c.y, f.x, f.y);
        if (blocked) hidden++;
        if (d2 < od) { od = d2; open = f; }
        if (!blocked && d2 < cd) { cd = d2; occ = f; }
      }
      if (open !== occ) changed++;
    }
    console.log(seed, (100*hidden/pairs).toFixed(1) + "% of sight lines cross rock,",
                (100*changed/w.creatures.length).toFixed(1) + "% of the pond looks somewhere else");
  }'
```


## The instrument that was itself a hand-picked list (v1.53)

The second prime directive is that a `(seed, config)` pair reproduces a world
exactly, and that a feature which is switched off costs the world nothing at
all. v1.36 built the thing that enforces it — `src/fingerprint.js` — and asked
the sharp question of one of its two hashes: *what must this be blind to?*
`trajectoryFingerprint` must not see a new gene or a new per-creature field,
because almost every release adds one and a constant that gets re-recorded every
cycle is a note rather than a test. There is a test asserting that blindness.

The complementary question was never asked. `stateFingerprint` is the hash every
same-process comparison in this project runs on — the twelve per-feature "with
this off, worlds are bit-for-bit unaffected" tests, the all-flags sweep in
`test/fingerprint.test.js`, and the constant sweep in `src/levers.js`, which
decides whether a number is a lever by asking whether moving it moves this hash.
Nobody ever asked what it must **not** be blind to, and the answer was that it
hashed sixteen of the twenty-eight fields a creature carries, chosen by hand in
v1.36 and untouched for seventeen releases.

### Sweeping the state the way v1.38 swept the constants

`levers.js` moves every numeric constant in `config.js` and asks whether
*anything* changes; it has no theory, which is exactly why it caught a wrong
sentence about `energyMax` that a correct measurement had licensed. The same
move points at state: take a warmed pond, perturb one field on every creature,
and ask which instrument notices — and, separately, whether the pond's future
notices.

Seed 21, warmed 300 ticks, each field moved by 0.25 (or negated, or +1 for a
counter), then both worlds stepped 400 more:

| field | in the state hash? | does the pond care? |
|---|---|---|
| `metabolismScale` | **no** | trajectory moves at +1 tick |
| `phase` | **no** | trajectory moves at +1 tick |
| `lastBiteAge` | **no** | trajectory moves at +3 ticks |
| `world.visionFactor` | **no** | trajectory moves at +1 tick |
| `walled`, `groundFeel`, `hue`, `infectedAtAge`, `prevSignal`, `heard` | **no** | inert *today* |
| `id` | no, and must stay out | never — see below |
| `speciesId` | no, and must stay out | never — it is the observer's |
| the other sixteen | yes | yes |

Four things the strongest determinism instrument in the project could not see
change the world within three ticks. `metabolismScale` multiplies the metabolic
bill; `phase` is the internal oscillator wired to input 12; `lastBiteAge` is the
predation cooldown, which decides who may bite next tick; `visionFactor` is the
day/night multiplier on every sense. Six more are invisible only because their
readers sit behind flags that are off by default — they are holes with nothing
in them yet.

None of this was a live bug: no code writes those fields except the code that
should, so the promise the hash was checking was in fact being kept. That is
precisely the shape v1.36 warned about in a different costume — *a promise I
have always kept feels exactly like a promise that is enforced*. The hash was
not enforcing eleven of the twelve fields it skipped; it was agreeing with them.

### The two that must stay outside, and why that is not the same omission

`creature.id` comes from a module-level counter, so the second world built in a
process never agrees with the first however identical the ponds are. It is the
one field that *looks* most like identity and is the one a same-process
comparison can never use. `creature.speciesId` is written by `phylogeny.assign`
— the observer's handwriting on the observed — and it is already covered by
`observationFingerprint`; hashing it into the state would make the "observation
never feeds back" test fail for something that is not feedback.

Both are now named in `CREATURE_UNHASHED` with those reasons, and
`test/determinism.test.js` walks a live creature's own properties and fails on
any field that is in neither list. That is the durable half of this release: not
the ten fields added, but that the next release's new field cannot quietly land
outside the instrument.

### The channel no fingerprint can have

All three hashes are pictures of a world at an instant, and the canonical
violation of directive 2 does not appear in one. A feature that is switched off
and draws a random number anyway — and throws it away — leaves the pond
bit-identical at that moment. Measured on seed 21: one discarded `rng.next()` is
invisible to all three fingerprints and the trajectory parts **eight ticks
later**. A comparison made at a horizon shorter than that is a comparison of two
worlds that have already diverged.

v1.45 and v1.47 both met this and both solved it by counting draws, in one file
each. `drawStream()` hashes the values instead, which is the same idea and
strictly stronger — two streams can agree on how many numbers were taken and
disagree about which consumer took which — and it is now one of the four
channels every one of the twelve tests runs through.

### Reproducing it

```bash
node --input-type=module -e '
  const { World } = await import("./src/world.js");
  const { makeConfig } = await import("./src/config.js");
  const F = await import("./src/fingerprint.js");
  const pair = (mut) => {
    const a = new World(makeConfig({ seed: 21 })), b = new World(makeConfig({ seed: 21 }));
    for (let i = 0; i < 300; i++) { a.step(); b.step(); }
    mut(a);
    const seen = F.stateFingerprint(a) !== F.stateFingerprint(b);
    let at = -1;
    for (let i = 0; i < 400; i++) {
      a.step(); b.step();
      if (at < 0 && F.trajectoryFingerprint(a) !== F.trajectoryFingerprint(b)) at = i + 1;
    }
    return (seen ? "hash sees it" : "HASH BLIND") + ", " + (at < 0 ? "pond unchanged" : "pond moves at +" + at);
  };
  for (const f of ["metabolismScale", "phase", "lastBiteAge", "x"])
    console.log(f.padEnd(16), pair((w) => w.creatures.forEach((c) => (c[f] += 0.25))));
  console.log("visionFactor    ", pair((w) => (w.visionFactor += 0.25)));
  console.log("a stolen draw   ", pair((w) => w.rng.next()));'
```

Run against v1.52 the first four rows read `HASH BLIND`; against v1.53 only the
stolen draw does, which is the row the fourth channel exists for.


## The axis that was only ever a caption (v1.54)

The Tree of Life is the widest figure on the page and its entire horizontal
dimension is time. For fifty-three versions the only statement of that scale was
a line of text underneath it naming the two ends — *ticks 0–19,998* — so
answering "when did that lineage sweep?" meant measuring a fraction by eye
across 1,276 pixels and multiplying it by a number in the caption.

v1.41 wrote the rule this closes, gave the population chart the y-axis it had
gone forty releases without, and stated the principle in one line: **a scale
that never moves needs a word; a scale that moves needs marks.** Then it left
the axis that is *nothing but* a moving scale unmarked, one figure down the
page. That is v1.30's lesson — a rule needs a sweep of every place it applies —
missing the nearest surface, again.

### Why the marks can be a straight line of arithmetic

The plot spaces its columns evenly across the figure, and it has been tested
since v1.42 that it does. Whether they are evenly spaced *in ticks* is a
different claim, and it belongs to `phylogeny.js#_record`: the record halves its
own resolution when it fills, and a new snapshot is started only when
`snapshotsSeen % snapshotStride === 0`, so a stored window is exactly
`stride × sampleInterval` ticks wide however many halvings it has been through.
It was written in a comment in v1.30 and asserted nowhere. Measured over twelve
seeds at 20,000 ticks — after three halvings, at 417 columns of 48 ticks each —
the largest departure of any column from `from + i × resolution` is **0 ticks**,
on every seed. So the mapping from tick to position is exactly linear, one
division, and `test/mullerplot.test.js` now pins it: if a future release makes a
window that is not the width of its neighbours, the axis becomes a lie and the
suite says so before anyone reads a wrong number off the picture.

### Two ranges, and only one of them can label a coordinate

The caption's range and the axis's range are not the same numbers, and the
difference is not a rounding error — it is a question about what a *position*
means. The caption says what the record holds, and the newest raw sample can sit
up to one window past the last stored snapshot. That final, still-filling window
is drawn as the single column at `x = W`. So on the default seed at 20,000
ticks, the record reaches tick 19,998 and the right-hand edge of the picture
stands for tick **19,968** — one window, 30 ticks, apart. `mullerAxis` returns
the second, because the first cannot name a coordinate.

### The marks are text, and they are outside the paint

The chart draws its rules onto the canvas, under the data, because a line chart
has a background for furniture to sit on. A stacked-band plot has none: every
pixel is data, in a colour the pond chose rather than one this project picked.
A gridline through it is either invisible or v1.34's lottery — a mark whose
background is chosen by the world. So the axis lives below the figure, in the
DOM, which is also where v1.41 put the chart's numbers and for a second reason:
this canvas is sized from its own rendered width, so on a phone it is a third of
its desktop size, and canvas text would be stretched with it. The number of
marks follows the width — one about every 160 pixels, so a narrow figure gets
fewer rather than a collision.

### The word the y-axis needed

Marking one axis meant reading what the page said about the other, and the page
had been saying the wrong word since v1.2, the release that drew the first band.
The plot normalises every column by the pond alive in it: a band's thickness is
a **share**, and the stack is always exactly full. Three prose surfaces — the app's own caption, the README and this
document — called it *abundance*, which is the word for a headcount.

The difference is not pedantry, and it is measurable. Take every consecutive
pair of columns for every named species and ask whether the band's thickness and
the species' actual headcount moved in the same direction:

```bash
node --input-type=module -e '
  import { World } from "./src/world.js";
  import { makeConfig } from "./src/config.js";
  import { mullerShares } from "./src/mullerplot.js";
  for (const seed of [1, 2, 3, 5, 7, 8, 9, 11, 13, 17, 19, 23]) {
    const w = new World(makeConfig({ seed }));
    for (let t = 0; t < 20000; t++) w.step();
    const ph = w.phylogeny, snaps = ph.snapshots;
    let agree = 0, against = 0;
    for (const s of mullerShares(ph).shown) {
      for (let i = 1; i < snaps.length; i++) {
        const a = snaps[i - 1], b = snaps[i];
        if (!(a.total > 0) || !(b.total > 0)) continue;
        // Mean headcount over the window, and the share drawn for it.
        const dc = (b.counts.get(s.id) || 0) / b.span - (a.counts.get(s.id) || 0) / a.span;
        const df = (b.counts.get(s.id) || 0) / b.total - (a.counts.get(s.id) || 0) / a.total;
        if (!dc || !df) continue;
        Math.sign(dc) === Math.sign(df) ? agree++ : against++;
      }
    }
    console.log(seed, (100 * against / (agree + against)).toFixed(1) + "% of moves disagree");
  }'
```

Across twelve seeds, **11.3% to 19.2%** of the moves a band makes point the
opposite way to the lineage's own numbers — a median of 15.0%, and 17.8% on the
default seed 314. The band widens as the species shrinks, because everything
around it shrank faster.
That is exactly what a Muller plot is *for* — relative success is what a sweep
is — but it is not what the word *abundance* promises, and roughly one band
movement in six is actively misread by a visitor who believes the caption. The
copy now says share, says that a column is always full, and says the
consequence in the same breath: **a band can widen while the population falls.**
The population's own size is the chart's job, one figure up, where it has an
axis of its own.


## The mark that made its own background (v1.55)

Every colour audit in this project since v1.25 has asked the same question —
*does this mark stand out from what it is drawn on?* — and each one has been
wrong about the **set** of things it is drawn on rather than about the
arithmetic. v1.25 measured the canvas and skipped the stylesheet. v1.34 skipped
the contagious zone. v1.43 skipped the creature's own body, and found two marks
that were not faint but bit-identical to it. The corpse is the fourth in that
sequence and the sharpest, because its missing background is one the mark
*causes*.

### The audit had looked at it, and asked the wrong question

The v1.25 sweep did measure corpses: against the food motes, the red-and-green
pairing that looked most likely to be a second bug. They cleared it easily
(above). What nobody measured in thirty releases was the corpse against the
**ground**, and there is only one ground a corpse can be on. Detritus is minted
where things die (`world.js`, stage 5 of the tick): a body deposits nutrient at
its own position and, with scavenging on, rots into the soil directly beneath
it. Enriched ground is a warm ochre. The splotch was a warm maroon.

| corpse over enriched ground | normal | protanopia | deuteranopia | tritanopia |
| --- | --- | --- | --- | --- |
| worst, opacity 0.15 | 4.9 | **0.1** | **0.2** | **0.0** |
| worst, opacity 0.35 | 11.2 | **0.3** | **0.2** | **0.0** |
| worst, opacity 0.70 (the maximum) | 21.7 | **0.9** | **0.8** | **0.0** |

The bar is `MIN_DELTA_E` = 25. Two things are worth separating here. For a
dichromat the mark was not faint but *the same colour*, at every opacity
including the strongest it could ever reach — so this is not a case where
turning the mark up would have helped. And under normal vision it missed the bar
too, which is the general case and the reason this is filed as legibility rather
than as colour blindness (the v1.46 lesson: check the trichromat first). Over
plain water it was better in places and still poor: 2.1 under protanopia at the
low end, which is the just-noticeable difference.

### Half of every corpse ever drawn was in the faint half of the ramp

The old mark carried how much meat was left in its **opacity** —
`min(0.7, 0.15 + meat/60)` — which is the one thing v1.34 forbids by name,
because fading a mark spends exactly the contrast the mark exists for. The
question that decides whether that is a tidy-up or a finding is *what share of
the real data lands in the broken part* (v1.49). Over twelve 12,000-tick
scavenging worlds, sampling every corpse every fifth tick (n = 353,000):

| opacity | share of all corpse-frames |
| --- | --- |
| below 0.25 | 13.4% |
| below 0.35 | 27.4% |
| below 0.50 | 50.2% |
| at the 0.70 cap | 10.9–43.2% by seed |

The median corpse-frame sat at 0.50. Half of every corpse this pond has ever
drawn was in the dimmer half of a ramp that had no contrast to spend — and the
top of the ramp is a cap that a fresh corpse of average body size is already
over, so the channel was saturated at one end and invisible at the other.

### The fix, and the constraint that actually decided it

Two opaque tones and a size channel: a pale bone ring (`hsl(50, 40%, 76%)`)
around a near-black core (`hsl(350, 55%, 7%)`), drawn as two filled discs rather
than a fill and a stroke, with the remaining meat moving the radius. This is the
shape v1.25 gave the predator and v1.34 the epidemic — a mark carrying both a
very light and a very dark tone cannot be swallowed by a background, because no
background is close to both — and it is deliberately the *inverse* of the
predator's pale disc inside a dark rim, so a glance separates them without
reading either colour.

Swept over 480 grounds (both seasons, the whole terrain ramp with and without
contours, the biome glow, enriched ground at four richnesses, the contagious
zone) under all four vision models, the worst case is **ΔE 42.1**.

The interesting part is which constraint picked the ring's lightness, and it was
none of those. A food mote is drawn *over* a corpse, additively, so the corpse
is one of the mote's backgrounds — v1.43's rule, arriving from the other side.
Against a pale ring the additive green clamps and the pellet disappears. That
check scores **25.6**, a hair over the bar, and it is what rules out the
brighter cream the ground sweep alone would happily have taken:

| ring lightness | ground sweep | a mote drawn on the ring |
| --- | --- | --- |
| **76%** (shipped) | 42.1 | **25.6** |
| 80% | 43.9 | 22.2 |
| 84% | 44.2 | 17.7 |
| 88% | 44.2 | 13.4 |

The two columns pull in opposite directions, which is what makes this a
constraint rather than a taste: every step brighter *improves* the reading
against the ground and costs the pellet drawn on top of it, and the shipped
value is the last one that satisfies both.

Both halves are pinned in `test/palette.test.js`, along with the failure itself:
the old maroon is asserted to *still* collide with enriched ground, so a future
tidy-up that restores it fails loudly rather than quietly (the v1.25 rule — a
regression test that does not know what the bug looked like cannot recognise it
coming back).

### Reproducing it

```js
import { blendOver, deltaE, detritusTint, VISION_MODELS } from "./src/palette.js";
const veil = { r: 6, g: 10, b: 20 };                    // the water, midwinter
const t = detritusTint(1);
const soil = blendOver(veil, t, t.a);                   // ground a corpse lies on
const old = { r: 150, g: 55, b: 48 };                   // the splotch, v1.8–v1.54
for (const alpha of [0.15, 0.35, 0.7])
  console.log(alpha, VISION_MODELS.map((v) => deltaE(blendOver(soil, old, alpha), soil, v).toFixed(1)));
```

## Space stops being free, and the control takes most of it back (v1.56)

Every rule this pond has about *being somewhere* is a rule about resources. Food
gathers in biomes (v1.3), the ground can be expensive to cross (v1.23), rock can
refuse a step outright (v1.48). What no rule has ever said is that somebody is
*in the way*. Two creatures have been able to occupy the same point since v1.0,
for their whole lives, at no cost to either — and a fertile patch has had no
ceiling on how many bodies fit inside it. This is the last free gift on the list
in `docs/AUTONOMOUS.md`, and `bodyCollision` (opt-in) is the rule that charges
for it.

### What the rule is

After every creature has moved under its own power, any two whose bodies overlap
are pushed apart along the line between them, each giving up **half** the
overlap. Size does not enter: this is exclusion, not force. No new constant — the
distance a pair owes is `r1 + r2`, which the bodies already carry — and no random
number, in either direction, so a shoving world is still reproducible from its
seed.

It is a **relaxation**, not a solver. One pass per tick, every displacement
computed from the same instant and applied together, so no creature's shove
depends on where it sits in the update order — the only exactly simultaneous rule
in `world.step()`. What that buys, and what it costs, is visible in a chain of
three equal bodies in a row: the middle one is pushed both ways by the same
amount and does not move, so each end gives up half of what its pair owes and the
gap closes by half a tick. 9 px, 10.5, 11.25, 11.625 — geometric, converging on
the 12 it owes and never arriving. `test/bodyCollision.test.js` pins that
sequence exactly.

In a real pond the chain never gets the chance: the pass separates about **32
pairs a tick** in a population of 220 — one creature in seven is being shoved on
any given tick — and finishes each tick still holding **0.82 overlapping pairs
for every pair it just separated**. The pond does not settle. It is held down.

### The control, and why it was needed

A rule that moves things needs a control that moves them somewhere else (v1.27),
and a null arm has to be **as expensive as the treatment** (v1.47). So: the same
pairs, the same displacement, turned 90°. Every overlapping pair is displaced by
exactly the distance the real rule would have used, at right angles to the line
between them — which separates nothing, to first order, and counter-rotates the
pair about its own midpoint instead.

Twelve seeds, 9,000 ticks, measured over the last 4,500. Median change against
the same seed's default run:

| what | `bodyCollision` | same shove, turned 90° | seeds moved |
|---|---|---|---|
| standing overlapping pairs | **−69.7%** | −52.7% | 12/12 vs 11/12 down |
| mean nearest-neighbour distance | +13.5% | **+20.5%** | 12/12 vs 11/12 up |
| contested meals (`stats.contested`) | −56.9% | −52.3% | 12/12 both down |
| mean population | +2.3% | +1.6% | 10/12 vs 8/12 up |
| kills over the run | −6.4% | −15.5% | 5/12 vs 4/12 up |

Read the second column first. Four of those five rows are the control's.

- **Spacing is not the rule.** The pond does spread out — nearest neighbours are
  13.5% further apart, on every one of twelve seeds — and the arm that separates
  nothing spreads it **further**, +20.5%. Paired seed by seed the two arms differ
  by −0.6% with 6 seeds of 12 in each direction, which is a coin toss. "Solid
  bodies make the pond less crowded" is a sentence about displacement, not about
  exclusion.
- **Nor are the lost meals.** Contested pellets — a creature that had one inside
  its own reach and found it already eaten — fall by more than half, and 52 of
  those 57 points are the control's.
- **Population and predation say nothing.** Both arms are up on population
  against a shared baseline, which is exactly the correlated design v1.47 was
  burned by; kills swing from −70% to +486% across seeds.

What survives is the one thing the rule is actually about. Standing overlap falls
69.7% with the rule and 52.7% with the null, and paired seed by seed the rule
beats the null by a further **30.1%, on 11 seeds of 12**. So of the overlap the
rule removes, roughly three-quarters would have gone away under any equally
vigorous shoving — bodies that are pushed at all stop being where they were — and
the last quarter is the exclusion itself.

### Why the null does so much, and the statistic that is only the rule's

Not a flaw in the control: it is the finding. Two overlapping bodies that are
each displaced by a couple of pixels in *any* direction have a fair chance of no
longer overlapping, because most overlaps in this pond are shallow. So a
statistic that counts *how many* pairs overlap is largely a statistic about how
much anything moved.

The obvious next guess is that exclusion should own a **bound** where
displacement cannot — a ceiling on how deep a pile gets. Half of that is wrong,
and the half that is wrong is the one I would have written down without
measuring. Six seeds, 6,000 ticks, sampled every hundredth tick over the second
half:

| | default | `bodyCollision` | shove turned 90° |
|---|---|---|---|
| deepest pile (bodies within 8 px), mean | 3.4 – 5.1 | 1.0 – 2.0 | 1.0 – 1.7 |
| deepest pile, worst seen | 5 – 12 | 1 – 3 | 2 – 3 |
| **deepest overlap, mean (px)** | **12.3 – 14.1** | **0.6 – 2.3** | **4.5 – 6.8** |
| deepest overlap, worst seen (px) | 13.5 – 15.3 | 5.0 – 7.0 | 6.4 – 13.3 |

Pile *depth* is the null's as thoroughly as spacing was: shoving a heap in
circles pulls it apart about as well as pushing it outward, and both cap it at
two or three where the default pond reaches twelve. What the null cannot do is
control how far *into* each other two bodies get. The worst intrusion anywhere in
the pond, at a typical instant, is **0.6–2.3 px with the rule and 4.5–6.8 px with
the null** — three- to eightfold, on six seeds of six, with no overlap between
the two ranges. That is the statistic exclusion owns, and it is a depth rather
than a count or a spacing, which is the shape of thing the rule is: it does not
say where anybody may be, only how far in.

### The honest summary

**The rule is real, busy and almost entirely invisible in the aggregate.** It
fires 32 times a tick, it holds standing overlap at a third of its default level
and the pond's worst intrusion at a fifth of the null's, and once that null is
subtracted, nothing else this instrument measures — spacing, pile depth, lost
meals, population, predation — can be attributed to bodies excluding each other
rather than to bodies being nudged. That is the fifth time in this project that a
scrambled arm has taken back most of a result (v1.20, v1.27, v1.33, v1.47, and
now this), and the first time the treatment survived it at all: two statistics
out of six are the rule's, and both of them are about *depth* rather than about
where anybody is.

### Reproducing it

```bash
node --input-type=module -e '
  const W = await import("./src/world.js"), C = await import("./src/config.js");
  const V = await import("./src/vec.js");
  // The null: the same pairs, the same distance, turned 90 degrees.
  const perp = (w) => {
    const cfg = w.config, live = w.creatures.filter((c) => !c.dead);
    w.creatureGrid.clear(); for (const c of live) w.creatureGrid.insert(c);
    const px = new Float64Array(live.length), py = new Float64Array(live.length);
    live.forEach((c, i) => w.creatureGrid.forEachWithin(c.x, c.y, cfg.bodyRadiusMax * 2, (o) => {
      if (o === c) return;
      const dx = V.wrapDelta(c.x, o.x, cfg.width), dy = V.wrapDelta(c.y, o.y, cfg.height);
      const d2 = dx * dx + dy * dy, sum = c.radius + o.radius;
      if (d2 >= sum * sum || d2 === 0) return;
      const d = Math.sqrt(d2), s = (sum - d) * 0.5;
      px[i] += (-dy / d) * s; py[i] += (dx / d) * s;
    }));
    live.forEach((c, i) => { c.x = V.wrap(c.x + px[i], cfg.width); c.y = V.wrap(c.y + py[i], cfg.height); });
  };
  const overlaps = (w) => {
    let n = 0;
    for (let i = 0; i < w.creatures.length; i++) for (let j = i + 1; j < w.creatures.length; j++) {
      const p = w.creatures[i], q = w.creatures[j];
      const dx = V.wrapDelta(p.x, q.x, w.config.width), dy = V.wrapDelta(p.y, q.y, w.config.height);
      const s = p.radius + q.radius; if (dx * dx + dy * dy < s * s) n++;
    }
    return n;
  };
  for (const seed of [314,7,21,45,51,77,101,256,512,777,999,1234]) {
    const out = {};
    for (const arm of ["off", "on", "perp"]) {
      const w = new W.World(C.makeConfig({ seed, bodyCollision: arm !== "off" }));
      if (arm === "perp") w._separate = () => perp(w);
      let ov = 0, k = 0;
      for (let i = 0; i < 9000; i++) { w.step(); if (i >= 4500 && i % 250 === 249) { ov += overlaps(w); k++; } }
      out[arm] = { overlap: ov / k, pop: w.creatures.length, contested: w.stats.contested };
    }
    console.log(seed, out);
  }'
```

For the depth table, replace `overlaps()` with the largest `p.radius + q.radius − d`
over all pairs, and take its mean over the samples rather than its total.

## The dead, and the map that never drew them (v1.57)

The minimap is the only surface where a whole-pond pattern is visible at a
glance, and it has been catching up with the world since v1.19: terrain in
v1.24, enriched ground in v1.27, the contagious zone in v1.34, rock in v1.48.
The thing it never drew is older than all of them. Scavenging (v1.8) leaves a
corpse where a creature dies, the Chronicle announces a die-off in words the
moment forty of them are down, and for thirty-eight releases the map that
sentence was written over showed empty water.

### There is something to draw

Twelve seeds, 9,000 ticks each, `scavenging: true`, sampled every fiftieth tick.

| | median over seeds | range |
| --- | --- | --- |
| standing corpses | **7.0** | 3.6–21.2 |
| the busiest sample | 27 | 11–63 |
| samples holding at least one corpse | **93%** | 81–94% |
| samples at the Chronicle's die-off threshold (≥ 40) | 0% | 0–15% |

Two seeds of the twelve — 314, the default, and 51 — spend an eighth of their
lives past forty corpses. And the view this map exists to supplement cannot show
them: at zoom 4, the point where the minimap appears at all, **6.9%** of the
standing corpses are on screen (2.3–11.2% by seed).

### The pattern it was supposed to show is not there

The claim I would have written in the caption is that a die-off leaves a shape —
a scar the shape of wherever the pond was dying. It does not. Two controls, both
of the cheap kind that needs no second run (v1.50: one pond, two rules, one
instant):

| | corpses | the null | seeds where corpses are lower |
| --- | --- | --- | --- |
| distance to the nearest living creature | 33.2 px | **31.9 px** (a uniform random point, same frame, same query) | 6 of 12 |
| distance to the nearest other corpse | 135.6 px | **128.9 px** (the same number of random points) | 8 of 12 |

The dead are placed like scattered points: no nearer the living than chance, and
no more clustered with each other than chance, with the seed-to-seed spread far
larger than either gap (v1.32's rule — a dozen seeds, or it is an anecdote).

One statistic did look like evidence before the null arrived. Only **1.2%** of
corpses sit in a coarse 6×4 cell holding nobody alive, which reads as *the dead
lie among the living* until you notice that 200 creatures occupy nearly all
twenty-four cells, so a random point would score about the same. A statistic
with no control is a statement about the instrument (v1.20, again).

So the mark is not a pattern; it is a **count and a place**, which is what the
zoomed-in pond cannot give you, and it is the reason the size channel the pond
spends on freshness is not spent here. The little map answers *how many, and
where*. The big one answers *how fresh*.

### What the new mark found: the pellet had a private colour

The corpse's bone tone is the brightest thing the map draws, and a pellet is
drawn on top of it. That check failed at **ΔE 4.6** — and the reason was not the
corpse. The minimap's pellet was `rgba(80, 205, 140, 0.5)`, a flat wash, a
literal in `minimap.js`: the pond's mote colour typed out a second time with the
pond's *arithmetic* (an additive glow) left behind. A wash is legible on dark
water and on nothing brighter.

| pellet drawn on | flat wash (v1.19–v1.56) | additive, from `foodMote()` (v1.57) |
| --- | --- | --- |
| bare water | 39.0 | 47.4 |
| the brightest enriched ground | **10.3** | 36.8 |
| rock | **15.3** | 33.6 |
| a corpse's bone | **4.6** | 25.6 |
| grounds under `MIN_DELTA_E` = 25 | **32 of 70** | **0 of 70** |

Everything the map has learned to draw since v1.27 was a ground its own pellet
could not be seen on, for as long as it has been drawing it. The fix is to stop
keeping a private copy: the pellet is `foodMote()` now, drawn with
`globalCompositeOperation = "lighter"` exactly as the pond draws it, and the
binding case afterwards is the corpse's bone at **25.6** — the same number, to
the same tenth, that picked that lightness in the pond in v1.55. Once the little
map does the big one's arithmetic it inherits the big one's tight spot.

### Reproducing it

```js
import { blendOver, addOver, deltaE, foodMote, corpseMarkTones, VISION_MODELS } from "./src/palette.js";
const bone = corpseMarkTones().ring;            // the brightest ground on the map
const old = { r: 80, g: 205, b: 140 };          // the wash, v1.19–v1.56
const mote = foodMote();
console.log(VISION_MODELS.map((v) => deltaE(blendOver(bone, old, 0.5), bone, v).toFixed(1)));
console.log(VISION_MODELS.map((v) => deltaE(addOver(bone, mote, mote.a), bone, v).toFixed(1)));
```

```bash
# standing corpses, and how few of them a zoomed pond shows
node -e '
  import("./src/world.js").then(async ({ World }) => {
    const { makeConfig } = await import("./src/config.js");
    for (const seed of [314, 51, 8]) {
      const w = new World(makeConfig({ seed, scavenging: true }));
      let sum = 0, peak = 0, n = 0, seen = 0, shown = 0;
      for (let t = 0; t < 9000; t++) {
        w.step();
        if (t % 50) continue;
        n++; sum += w.corpses.length; peak = Math.max(peak, w.corpses.length);
        for (const k of w.corpses) {
          seen++;
          const dx = Math.abs(k.x - 450), dy = Math.abs(k.y - 310);
          if (Math.min(dx, 900 - dx) <= 112.5 && Math.min(dy, 620 - dy) <= 77.5) shown++;
        }
      }
      console.log(seed, "mean", (sum / n).toFixed(1), "peak", peak, "on screen at zoom 4", ((100 * shown) / seen).toFixed(1) + "%");
    }
  })'
```

## The books nobody was watching (v1.59)

v1.53 replaced twelve hand-rolled determinism checks with one shared assertion
over four channels: the random stream, the state, the trajectory, and the tree of
life. It also carried over, unexamined, the one thing none of those four could
say — a loop over three counters:

```js
for (const counter of ["births", "deaths", "kills"]) { ... }
```

Three of fifty-one, as the books stood at v1.59: `world.stats` carried **43**
own properties then and `world.energy` **8**, and a feature that was switched
off and wrote to any of the other forty-eight left every fingerprint in this
project bit-identical. `booksFingerprint()` is the fifth channel.

### Why a counter needs a channel and cannot borrow one

The four existing hashes are all pictures of the *pond* — where everything is,
how this build represents it, what the observer made of it, and which random
numbers were spent getting there. A counter is none of those. Incrementing
`stats.scavenged` moves no creature, so no picture of the pond can fail on it.
This is exactly the argument that produced `observationFingerprint` in v1.38, one
output surface over: the tree of life is what the observer *concluded*, the books
are what it *counted*, and both are invisible to a hash of the water.

Staged as ten arms in `test/books.test.js` — a miscounted birth, a phantom
scavenging bite, a doubled archive stride, a burial filed under the wrong cause
— every one moves the books hash and none of them moves the state, trajectory or
observation hash.

### Six fields a list written from the constructor never sees

The obvious way to enumerate `Stats` is to read its constructor. That gives
thirty-seven names and looks complete. Six more — `avgGeneration`,
`currentMaxGeneration`, `carnivoreCount`, `avgHidden`, `avgConns`, `maxHidden` —
are created by `sample()` and do not exist until the world has stepped once. So
the completeness test walks a **stepped** world, and the exclusion lists are
empty on purpose: every measurement this pond keeps, including the two
construction parameters and all three history buffers, is inside the instrument.

The archive is in there for the v1.22 reason. Its thinning state (`stride`,
`seen`, the min/max envelopes) can differ between two worlds whose every creature
agrees, and a record that quietly halved itself at a different moment is exactly
the kind of difference that looks like nothing.

### Nothing in the books feeds back into the simulation

`stats.js` has opened with *"none of this feeds back into the simulation"* since
v1.0 and `energy.js` with *"nor is read by the simulation"* since v1.29. Both are
comments, and a comment is not a measurement. Measured now: each of the 51 fields
is held wrong for **60 consecutive ticks** — re-applied before every step, so a
field that `sample()` recomputes is still wrong during the part of the tick a
reader would read it in — against an unperturbed run of the same seed.

All 51 leave the state, the trajectory and the tree of life bit-for-bit
identical. Per-field rather than all at once, because an aggregate two cancelling
errors can satisfy is not a test of either.

The related check, in the other direction: every feature-specific counter reads
**exactly 0** over 1,500 ticks with its feature off — `walled`, `walledRate`,
`jostled`, `jostledRate`, the six disease counters, `groundBias`, `soilShare`,
`avgLearning`, `avgVoice`, `avgHeard`. A statistic that is non-zero with its
mechanism off is not measuring the mechanism (v1.20).

### What it costs

On a 500-tick pond the books hash walks **6,600 numbers** and takes about 1.0 ms,
against 0.25 ms for the state hash — roughly three ticks' worth of time, twice
per paired test, twelve tests. About 93% of that walk is the two history buffers;
the counters themselves are 51 numbers. The suite is unchanged in wall clock to
within its own noise.

No config constant needs this channel: `Stats` is constructed with its own
defaults rather than from `DEFAULT_CONFIG`, so `src/levers.js` still has the four
it had. The day a history length becomes a config knob is the day the constant
sweep needs a fifth column too.

### Reproducing it

```bash
node --input-type=module -e '
  const { World } = await import("./src/world.js");
  const { makeConfig } = await import("./src/config.js");
  const F = await import("./src/fingerprint.js");
  const warm = (n) => { const w = new World(makeConfig({ seed: 21 })); for (let i = 0; i < n; i++) w.step(); return w; };
  for (const [label, miscount] of [
    ["stats.births",    (w) => (w.stats.births += 1)],
    ["stats.scavenged", (w) => (w.stats.scavenged += 1)],
    ["archive stride",  (w) => (w.stats.runHistory.stride *= 2)],
    ["energy.crop",     (w) => (w.energy.crop += 1)],
  ]) {
    const w = warm(200);
    const was = [F.stateFingerprint(w), F.trajectoryFingerprint(w), F.observationFingerprint(w), F.booksFingerprint(w)];
    miscount(w);
    const now = [F.stateFingerprint(w), F.trajectoryFingerprint(w), F.observationFingerprint(w), F.booksFingerprint(w)];
    console.log(label.padEnd(16), ["state", "traj", "tree", "books"].map((c, i) => c + "=" + (was[i] === now[i] ? "blind" : "SEES")).join(" "));
  }'
```

Every row reads `state=blind traj=blind tree=blind books=SEES`. Run the same
against v1.58 and the fourth column is gone, along with any way to notice.

## The colours the palette never owned (v1.61)

`palette.js` exists so that every colour in this project is somewhere a test can
reach. Twelve releases moved colours *into* it and none ever asked whether any
were still outside. Five modules import it; between them they name twenty
colours of their own, and the audit's own test file had grown four hand-copies
of colours those modules draw.

`test/colourliterals.test.js` is that sweep, standing. Three findings are worth
recording as measurements rather than as a changelog entry.

### The envelope bands, and what actually separates two series

The whole-run chart draws a min/max envelope per series (v1.22) — past the first
halving of the archive, the line is a sample and the band is the true extreme it
was sampled from. Both bands were literals in `chart.js`, at alphas 0.16 and
0.22, and both failed:

| pair | worst ΔE over four vision models | bar |
| --- | --- | --- |
| food band vs panel | 12.9 (deuteranopia) | 25 |
| pop band vs panel | 19.4 (normal) | 25 |
| **food band vs pop band** | **9.3 (tritanopia)** | 25 |
| food line vs pop line | 25.9 (tritanopia) | 25 |

The last row is the explanation for the third. Green against blue is a *hue*
distinction and tritanopia is the model that loses it, so the two lines clear
the bar only because their alphas differ by a factor of two — the population
line is nearly opaque and the food line half-strength, and what survives that
model is their **lightness**. Two bands drawn at 0.16 and 0.22 are two bands at
very nearly the same alpha, which spends exactly the axis that was carrying the
distinction.

So the fix is one number rather than two colours: a band is its own line at
`CHART_BAND_SCALE` (0.70) of that line's opacity, inheriting the gap by
construction. There is a window and it is narrow — below 0.65 the food band
falls under 25 against the panel, above 0.80 the pair closes again as both
approach their opaque colours.

### The "other" band: a case where no colour exists

The Muller plot stacks each species' share and puts the churn of lineages too
small to name into a grey "other" band. It is `rgba(120, 140, 160, 0.16)` and it
scores **ΔE 9.0** against the background it is drawn on — inside the [5, 10]
window this project reserves for gridlines.

How much lands in it, over twelve seeds at 12,000 ticks:

| seed | bands | "other" mean | "other" peak |
| --- | --- | --- | --- |
| 314 | 17 | 5.0% | 82.5% |
| 77 | 25 | 6.2% | 82.9% |
| 51 | 21 | 6.0% | 92.5% |
| 13 | 17 | 9.2% | 90.2% |
| 23 | 7 | **28.1%** | 97.5% |
| 45 | 21 | 9.3% | 81.4% |
| 88 | 34 | 7.7% | 82.5% |
| 512 | 23 | 6.8% | 70.0% |
| 7 | 20 | 6.1% | 72.3% |
| 101 | 22 | 7.2% | 90.0% |
| 202 | 13 | 10.3% | 90.0% |
| 999 | 18 | 7.1% | 80.0% |

Mean of means **9.1%**, and a peak above 70% on every seed tried.

The value was left alone, because there is no value. The lineage fills are
`hsl(h, 68%, 55%)` around the whole hue wheel at 0.9 over a near-black canvas:
anything dark enough to sit near the background fails the background, and
anything bright enough to clear it collides with some lineage. Swept over
neutrals from L 70 to L 100 at every opacity, the best available is **pure white
at full opacity, ΔE 23.9** from the nearest lineage band — under the bar of 25.

```js
// node --input-type=module -e "$(cat this)"
import { blendOver, deltaE, VISION_MODELS, hslToRgb } from "./src/palette.js";
const BG = { r: 0x04, g: 0x07, b: 0x0b };                    // what #muller paints
const worst = (a, b) => Math.min(...VISION_MODELS.map((v) => deltaE(a, b, v)));
for (const [L, a] of [[75, 1], [88, 1], [96, 1], [100, 1], [100, 0.85]]) {
  const o = blendOver(BG, hslToRgb(0, 0, L), a);
  let near = Infinity;
  for (let h = 0; h < 360; h++) near = Math.min(near, worst(o, blendOver(BG, hslToRgb(h, 68, 55), 0.9)));
  console.log(`L ${L}% a ${a}: ΔE ${worst(o, BG).toFixed(1)} from the water, ${near.toFixed(1)} from the nearest lineage`);
}
```

The escape is the one this figure already took in v1.46 for the same arithmetic
reason (16 separable hues, 19 bands): geometry. A hatch no lineage is ever
assigned, dimmed under a highlight like every other band.

### The stipple, and the ceiling that chose its shape (v1.62)

That hatch is `OTHER_TEXTURE` — dotted horizontal rules, `HATCH_PITCH` apart and
1-on-3-off, drawn in the band's *own* colour undiluted. Two of its three degrees
of freedom had to move at once, because it has to differ from every lineage
hatch there is:

| | a lineage band | the churn |
| --- | --- | --- |
| ink | `bandHatch()`, near-black | the band's own grey, opaque |
| lines | solid | dotted |
| in `BAND_TEXTURES` | yes, one of seven | **no** — it cannot be dealt |

A dark line was tried first and is the reason the ink is light: `bandHatch()`
works because a lineage band is always a 55%-lightness fill, and this band is
16% of a grey over a near-black canvas, so the same ink scores **ΔE 6.4** on it
and 2.9 against the canvas — invisible, twice.

Two measurements pin the light one, and the second is the one that decided the
geometry rather than the value:

- **the floor.** A dot against the band it lies on: **47.9 / 48.3 / 47.8 / 53.1**
  under normal, protan, deutan and tritan vision, against a bar of 25. Against
  the empty canvas, 56.6–64.7.
- **the ceiling.** What a reader sees over a stretch of band is its
  area-weighted mean, so a stipple is exactly as loud as its coverage. At 1/28
  the band reads **ΔE 14.3** from the canvas at its loudest model — above the 10
  that makes a thing furniture, and well under the **35.6** of the quietest
  lineage band there is. The churn must not out-shout a real species; that is
  what fixes the coverage, and therefore the pitch and the dash.

Under a highlight the stipple recedes to `BAND_DIM_SCALE` — the same factor the
lineage fills dim by, `0.35 / 0.9`, derived rather than chosen — and lands at
20.0, deliberately *under* the bar a mark must clear. `bandHatch()`'s argument
applies unchanged: a cue that survives the spotlight is undoing the spotlight.

### The background this figure is actually drawn on

Worth separating out, because it changed every number above. `#muller` sets its
own `background: #04070b`, a shade darker than the `#0c131c` panel that
`lineageBandRgb` — and every colour test in this project — reaches for. v1.61
noticed and moved on: at 0.9 opacity the difference is worth up to ΔE 4.4 and
nothing turns on it.

At **0.16** it is the whole measurement. The same band reads 9.0 against its own
canvas and 4.8 against the panel — half a complaint, on the region that is 97%
of the picture at its peak. `mullerBackground()` exists now and the stylesheet is
pinned to it, the way the minimap's water has been since v1.61.

What that leaves is a lead rather than a fix: `lineageBandRgb` still models the
panel, and moving it to the canvas changes **0.58% of the 64,620 hue pairs'**
collision costs — which is what `bandTextures` deals hatches by, so it would
redraw the key on some existing runs. Small, real, and a separate question from
the one this release is about.

### The instrument's own copies

`test/palette.test.js` held four colours by hand. Two were duplicates
(`MINIMAP_WATER`, the biome wash), and two were *wrong*:

- the minimap's **pellet**, rebuilt as `rgba(80, 205, 140, 0.5)` — the flat wash
  v1.57 removed, in favour of the pond's additive `foodMote()`, three releases
  earlier and one file over.
- the minimap's **prey dot**, as the right hue fully opaque. It is drawn at
  0.85. The difference reaches **ΔE 19.8** (hue 54), and in the direction that
  flatters: every mark required to stand out from a prey creature was scored
  against a brighter dot than the one on screen. Corrected, the corpse badge's
  worst case against a prey dot falls from 56.0 to 48.1 — still clear of 25.

v1.26's rule is that a colour a test cannot reach will drift. A test that
reaches for its own *copy* is worse: the drift happens inside the instrument and
is reported as a pass.

## A third job for a gene that had run out of room (v1.63)

v1.56 made bodies solid and split every overlap exactly down the middle, on
purpose: exclusion says two things cannot occupy one place and says nothing
about which of them is inconvenienced. The release note left one question
behind, and it was the interesting one — *a mass-weighted shove is untried, and
it is the only version of this rule that would interact with a gene.* Body size
is already selected on twice in this world: `sizeCostFactor` bills a big body
every tick, and `preySizeRatio` decides what a body is allowed to eat. Making
size decide who yields would give the same gene a third job, and this project
has been wrong before about a number with two jobs (`energyMax`, v1.38).

`massWeightedShove` is that rule. A pair splits its overlap in inverse
proportion to mass, where mass is area — the only mass this world has — so the
share a body gives up is the *other* body's `r²` over the sum of both. At the
extremes the config allows (`bodyRadiusMin` 3.5 against `bodyRadiusMax` 8.0)
that is 84% against 16%. Equal radii give exactly 0.5, to the last bit, because
`x / (x + x)` is 0.5 in IEEE-754 for every finite non-zero `x`.

### It is a redistribution, and that is measurable in one instant

The cheapest strong control here is v1.50's: one pond, two rules, one instant.
Run a pond with solid bodies *off* for 3,000 ticks so the overlaps are the ones
the world actually makes rather than a shoved pond's residue, then apply each
rule to the same frame.

Both rules see the same pairs and move the same total distance — 380.4 px
against 380.1 on seed 314, 576.5 against 575.6 on seed 13, under 0.2% apart on
all eight seeds tried. Nobody is shoved who would not have been shoved; the rule
only decides which of the two does the moving. Within a pair it does exactly
what it says: on the isolated pairs, where a body's displacement is one ask and
not a sum of several, the lighter body always gives up more and the heavier one
always gives up less. `test/massWeightedShove.test.js` asserts that directly.

What is startling is the size of it. Split each pond at its median radius and
compare what the two halves were asked to give up: on seed 314 the light half
moves 1.05× the heavy half under equal shares and 1.19× under mass weighting.
On six of the other seven seeds the shift is between 2% and 8%.

### Why: the gene had already run out of room

A rule about mass ratios can only be as strong as the mass ratios it is handed,
and this pond hands it almost none. Pooling every overlapping pair over twelve
seeds at tick 8,000 — 254 of them — the *median* pair has a mass ratio of
**1.021**. That is a 50.5 / 49.5 split. The rule advertised as "the bigger body
shoves the smaller" hands out, in the median case, v1.56's rule.

| percentile of overlapping pairs | mass ratio | split          |
| ------------------------------- | ---------- | -------------- |
| median                          | 1.021      | 50.5 / 49.5    |
| p90                             | 1.110      | 52.6 / 47.4    |
| p99                             | 1.467      | 59.5 / 40.5    |
| max (seed 512)                  | 3.137      | 75.8 / 24.2    |
| what the config allows          | 5.224      | 83.9 / 16.1    |

3.1% of pairs split worse than 55/45 and 0.8% worse than 60/40.

The reason is a distribution, not an accident. Body radius across eleven of the
twelve seeds settles at **7.4–7.75 with a standard deviation of 0.09–0.45**, in
a range that runs from 3.5 to 8.0. The pond is nearly monomorphic in the one
gene this rule reads.

And the reason for *that* is two constants sitting next to each other in
`config.js` that nobody had multiplied together. `preySizeRatio` is 1.1: a
predator must be more than 1.1× its prey's radius. `bodyRadiusMax` is 8.0. So
any body over **8.0 / 1.1 = 7.273 px** cannot be prey to anything this world is
capable of growing — it is a *refuge*, an absolute one, and it sits four fifths
of the way up the size range. Measured at 20,000 ticks over twelve seeds, a mean
of **75.7%** of the pond is above that line, seed by seed from 1.6% to 98.5%.
Most ponds here have evolved past the point where predation exists for them.

Seed 512 is the pond that has not — 1.6% in the refuge, a standing size spread
of ±1.25 px, and the widest split anywhere in the sample (3.137). It is also,
not coincidentally, the seed this project has repeatedly found interesting for
other reasons.

### And so it selects for nothing

Twelve seeds, 20,000 ticks, two arms. Mean body radius over the run is higher
with mass weighting on **seven seeds of twelve** — which is a coin toss — and
the median difference is +0.054 px on a base of 7.3, or 0.7%. The mean across
seeds is *negative*, −0.149 px, entirely because two ponds flipped regime: seed
23 fell from 7.25 to 5.55 with its population dropping from 194 to 129, and seed
512 from 5.81 to 5.21. Mean population moves −3.5%, which is the same coin toss
in another column. This is v1.32's rule doing its job — a seed-matched pair is
one coin toss, and a dozen of them is the minimum honest sample — and the answer
is that nothing here is attributable to the rule.

So the third job pays nothing, and it pays nothing for a reason that is not
about the rule at all: **the gene was already at a wall put there by its second
job.** A pressure needs somewhere to accumulate (v1.23) and a fix has to be
about the same noun as the diagnosis (v1.33); this is the version of that where
the *variance* is missing rather than the timescale. Selection cannot act on a
difference the population no longer contains.

### What is pinned, and what is only written down

Following v1.33's rule about not pinning a null with a test that can only
measure noise: the test file asserts the *exact* invariants — the staged split
arithmetic, that equal bodies are shoved bit-identically under both rules, that
the pass is still simultaneous under reversal, that it draws no random numbers,
that a world without `bodyCollision` is bit-for-bit unaffected, and the
per-pair direction on isolated pairs. The twelve-seed null and the refuge share
are *not* asserted; they are trajectories, and they are here.

### Reproducing it

```bash
# The refuge, and the size distribution that follows from it.
node --input-type=module -e '
  const W = await import("./src/world.js"), C = await import("./src/config.js");
  const REFUGE = C.DEFAULT_CONFIG.bodyRadiusMax / C.DEFAULT_CONFIG.preySizeRatio;
  console.log("refuge at", REFUGE.toFixed(3), "px");
  for (const seed of [314,77,51,13,23,45,99,512,7,101,202,808]) {
    const w = new W.World(C.makeConfig({ seed, bodyCollision: true }));
    for (let i = 0; i < 20000; i++) w.step();
    const rs = w.creatures.map((c) => c.radius);
    const m = rs.reduce((a, b) => a + b, 0) / rs.length;
    const sd = Math.sqrt(rs.reduce((t, r) => t + (r - m) ** 2, 0) / rs.length);
    console.log(seed, m.toFixed(2), "+/-", sd.toFixed(2),
      (rs.filter((r) => r > REFUGE).length / rs.length * 100).toFixed(1) + "% unpredatable");
  }'

# One pond, two rules, one instant: same pairs, same total, different bodies.
node --input-type=module -e '
  const W = await import("./src/world.js"), C = await import("./src/config.js");
  const V = await import("./src/vec.js");
  const w = new W.World(C.makeConfig({ seed: 314, bodyCollision: false }));
  for (let i = 0; i < 3000; i++) w.step();
  const snap = w.creatures.map((c) => ({ c, x: c.x, y: c.y, r: c.radius }));
  const restore = () => snap.forEach((s) => { s.c.x = s.x; s.c.y = s.y; });
  const arm = (byMass) => {
    restore();
    w.config.bodyCollision = true; w.config.massWeightedShove = byMass;
    w._separate();
    const d = snap.map((s) => V.torusDist(s.c.x, s.c.y, s.x, s.y, w.config.width, w.config.height));
    w.config.bodyCollision = false; w.config.massWeightedShove = false; restore();
    return d;
  };
  const half = arm(false), mass = arm(true);
  const tot = (a) => a.reduce((t, x) => t + x, 0);
  console.log("total displacement:", tot(half).toFixed(1), "vs", tot(mass).toFixed(1));'
```

For the two-arm null, run each seed twice with `massWeightedShove` false and
true for 20,000 ticks and average the mean body radius over 100-tick samples;
for the split table, walk every overlapping pair at one instant and record
`max(r1,r2)² / min(r1,r2)²`.

## The refuge, and what predation actually decides (v1.64)

v1.63 was measuring something else entirely — whether a mass-weighted shove
gives the size gene a third job — and found, on the way past, that two constants
which have sat beside each other in `config.js` since v1.0 have a quotient that
is a rule. `Creature.canEat` refuses a target unless the hunter is
`preySizeRatio` (1.1) times bigger than it, and `bodyRadiusMax` (8.0) is the
largest body a genome can express. So a creature at or above

    bodyRadiusMax / preySizeRatio = 8.0 / 1.1 = 7.273 px

cannot be eaten by anything this world is capable of growing. Not
disadvantaged; ineligible. The size range starts at 3.5 px, so the refuge is the
top 16% of it, and it is absolute.

`src/levers.js` sweeps the eighty-four constants in `config.js` one at a time
and cannot see
this, because what the pair decides is a *conjunction*: move either number alone
and the sweep sees a lever with the effect it expects, while the boundary the
two of them draw together is nowhere in its vocabulary. v1.38 asked whether
every number here is a lever. Which **pairs** of them are is a different
question and this is the first answer to it.

### The pond is mostly inside it, early

`Stats.refugeShare` counts the living at or above that radius. On the default
seed it passes half at **tick 600** and 80% by tick 1,000 — under a minute of
watching at 1× — and spends the rest of a 20,000-tick run between 88% and 100%.

Over twelve seeds at 20,000 ticks the share runs the whole range: two ponds end
under 3%, four end above 96%, and the mean is **52.0%** (median 48.8%). It is
one of the widest-spread statistics in this project, so a single figure for it
is a statement about a seed list — v1.63 reported a mean of 75.7% on its twelve
seeds and this page reports 52.0% on a different twelve, and both are right.
What travels is the shape: a pond is usually *decisively* inside the refuge or
decisively outside it, and the ones inside get there in the first two thousand
ticks. Five of twelve seeds hold the majority above the line unbroken from a
crossing point onward (median tick 1,100, earliest 600).

The reading this invites is that prey have evolved out of reach of predators —
an arms race, won. That sentence is what the rest of this section is about.

### The control: predation off

The measurement to trust is the one that reads zero when the mechanism is off
(v1.20). This one does not read zero, and it is not supposed to: switching
`predation` off does not change a single body's size directly, it only removes
the reason to care. So the honest control is the seed-matched pair — the same
seed, 20,000 ticks, `predation: true` against `predation: false` — asking
whether a pond with *nobody hunting in it* grows into the refuge anyway.

It does.

| seed | refuge share, predators | no predators | mean radius, predators | no predators |
|---|---|---|---|---|
| 314 | 90.8% | 69.1% | 7.581 | 7.434 |
| 77 | 100.0% | 0.0% | 7.593 | 5.416 |
| 51 | 19.7% | 95.6% | 7.237 | 7.493 |
| 13 | 98.8% | 98.0% | 7.719 | 7.757 |
| 23 | 9.7% | 93.5% | 6.469 | 7.560 |
| 45 | 16.1% | 0.0% | 7.190 | 4.917 |
| 99 | 2.7% | 5.4% | 6.893 | 6.925 |
| 128 | 44.8% | 0.0% | 7.209 | 3.893 |
| 256 | 48.8% | 81.4% | 7.179 | 7.406 |
| 512 | 0.0% | 0.0% | 6.840 | 4.937 |
| 777 | 96.2% | 1.2% | 7.686 | 6.042 |
| 1024 | 96.8% | 100.0% | 7.573 | 7.954 |
| **mean** | **52.0%** | **45.3%** | **7.264** | **6.478** |

The refuge share is higher with predators on **six** seeds, lower on **five**
and level on one, against a between-seed spread that covers the entire range
from 0% to 100%. That is a coin toss (v1.32: a seed-matched pair is exactly as
clean as one coin flip, and a dozen of them is the minimum for an opinion). So
**the refuge is not something predation drives the pond into.** Bodies grow for
their own reasons — the metabolic bill in `sizeCostFactor` against whatever
being large is worth in a scramble for pellets — and the predation threshold is
a line those bodies happen to walk past.

### What predation does own is a floor

The same table read down the radius columns says something the share columns
do not. Sign-counted, mean body radius is also 6–6 — but the magnitudes are
wildly asymmetric:

- where predation **raises** the radius it raises it by a lot: +3.316, +2.273,
  +2.177, +1.903, +1.644, +0.147 px;
- where it **lowers** it, it barely does: −1.091, −0.381, −0.256, −0.227,
  −0.038, −0.032 px.

Mean over twelve seeds: **+0.786 px**. And the tell is in the minima. With
predators, the smallest pond-average body over twelve seeds is **6.469 px**; with
no predators at all it is **3.893 px**, and four ponds of twelve settle below
5.5 px — creatures barely above the minimum the config allows.

So predation does not push the pond up into the refuge. It stops the pond going
*down*. Where a world without hunters is free to discover that small and cheap
is a living, a world with hunters is not, and the floor it puts under body size
is a fifth of the whole size range. The arms race is real; what it produces is
not an escalation but a **lower bound**, and the escalation everybody would
narrate from the same numbers is not there.

That is also the sharper reading of v1.21 and v1.63. Predation causes about a
tenth of the deaths in a world built to showcase it, and three quarters of a
typical pond is beyond its reach — which reads as "the arms race is smaller than
I thought", then as "the arms race is finished", and is really neither. It is a
constraint that binds at the bottom of the range and is invisible at the top.

### What is pinned, and what is only written down

`test/refuge.test.js` pins the arithmetic, which cannot flake: that
`inRefuge` agrees with `Creature.canEat` at *every* radius in the range when the
hunter is as large as this world can grow, that the boundary is decided by the
rule's own multiplication rather than by a division one ULP away, that the tile
and the module compute the same number on a real pond, and that the chronicle
line is one-shot, follows first blood and never fires for a pond that was never
below the line.

The twelve-seed result above is **not** in the suite, deliberately. It is a coin
toss with a spread of a hundred percentage points; an assertion on it would pin
one trajectory and teach a future reader that the finding is fragile when only
the test would be (v1.33).

### Reproducing it

```bash
# Where the refuge is, and how fast the default pond gets there.
node --input-type=module -e '
  const W = await import("./src/world.js"), C = await import("./src/config.js");
  const R = await import("./src/refuge.js");
  const cfg = C.makeConfig({ seed: 314 });
  console.log("refuge at", R.refugeRadius(cfg).toFixed(3), "px");
  const w = new W.World(cfg);
  for (let t = 1; t <= 20000; t++) {
    w.step();
    if (t % 1000 === 0 || t === 600) console.log(t, (w.stats.refugeShare * 100).toFixed(0) + "%");
  }'

# The control: the same seeds with nobody hunting.
node --input-type=module -e '
  const W = await import("./src/world.js"), C = await import("./src/config.js");
  const R = await import("./src/refuge.js");
  for (const seed of [314,77,51,13,23,45,99,128,256,512,777,1024]) {
    const out = [];
    for (const predation of [true, false]) {
      const w = new W.World(C.makeConfig({ seed, predation }));
      for (let i = 0; i < 20000; i++) w.step();
      const rs = w.creatures.map((c) => c.radius);
      out.push([(R.refugeShare(w.creatures, w.config) * 100).toFixed(1),
                (rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(3)]);
    }
    console.log(seed, "predators", out[0].join(" / "), " none", out[1].join(" / "));
  }'
```

The second script is 24 runs of 20,000 ticks and takes about ten minutes.

## How the floor works, and what the second control took back (v1.65)

The section above ends with a result and an admission. Predation puts a **floor**
under body size in this pond — every one of twelve ponds with hunters ends above
6.469 px mean radius, four of twelve without them settle below 5.5 — and nothing
had measured *how*. The obvious answer is that small creatures get eaten. That
is a plausible mechanism arriving before the search, which is the signature of
the thing this project gets wrong most often, so it needed a number.

### The instrument, and its control

Every death now records two things: the dying body's own radius, and the mean
radius of everyone who **survived the tick it died in**. The difference is the
size selection that cause of death applies. It is cumulative and run-to-date,
because this is a per-body figure and not a mix.

The control is the table itself. Starvation and old age are not supposed to care
what size a body is, so their columns are what a reading of zero looks like here
— not a second run, not a scrambled arm, not a disabled flag, just the other two
rows of the same instrument, visible on the panel at all times.

Twelve seeds, 20,000 ticks, default configuration:

| cause | deaths | mean body at death | the pond it left | **delta** |
|---|---|---|---|---|
| starvation | 15,360 | — | — | **−0.008 px** (min −0.208, max +0.202; negative on 9/12) |
| old age | 3,161 | — | — | **+0.019 px** (min −0.087, max +0.159; negative on 3/12) |
| predation | 2,807 | 5.035 px | 6.483 px | **−1.448 px** (min −0.587, max −2.944; negative on **12/12**) |

Per seed, the predation column: 314 −1.812 · 77 −0.804 · 51 −2.944 · 13 −1.324 ·
23 −1.889 · 45 −0.587 · 101 −1.951 · 202 −1.337 · 303 −0.690 · 404 −0.878 ·
512 −1.840 · 777 −1.320.

So the mechanism is real, and it is the *only* one of the three. A body that
starves is the size of the pond around it to within a fiftieth of a pixel.

### Why the pool has to be taken at the death

The cheaper baseline — compare the victims against the pond's time-average body
radius over the run — reads **−1.927 px** instead of −1.448. Predation deaths
cluster where the pond is younger and smaller-bodied, so half a pixel of the
apparent gap is a fact about *when* hunting happens rather than about who it
takes. The pool is measured at the instant, per death, for that reason.

### And then the second control takes the interesting half back

The natural next sentence is that hunting is a *chase*, and small bodies lose it.
Everything in the code invites that reading. A hunter takes the **nearest** body
it is allowed to eat, not the smallest. `maxSpeed` is the same constant for every
creature, so a small body is not slower. Metabolism scales with size, so a large
body is the *poorer* one and should be easier to finish off. The bite reach is
`hunter.radius + prey.radius + 2`, so a larger prey is easier to reach. Every one
of those pushes against the observed sign.

The control that settles it is the set the hunter was actually choosing from.
`canEat` refuses a target unless the hunter is `preySizeRatio` (1.1) times
bigger, so for each kill there is an **eligible set**: everyone alive whose
radius times 1.1 is at most the hunter's. If victims are indistinguishable from
that set, the selection is the threshold and nothing else; if they sit below it,
something about getting caught is size-dependent.

Over the same 2,807 kills, with the hunter identified for every one of them:

| | mean radius |
|---|---|
| the pond at the kill | 6.483 px |
| **the hunter's eligible set** | **5.127 px** |
| the victim | 5.035 px |

`−1.448 = −1.356 (the rule) + −0.092 (everything else)`. The residual is
positive on eight seeds of twelve; the only one past ±0.15 is seed 51, which had
exactly one kill in 20,000 ticks. A victim is a uniformly random draw from its
own hunter's eligible set, to within a tenth of a pixel.

So predation's size selectivity is entirely `preySizeRatio`. The eligible set is,
by construction, the small tail of a distribution bunched near the top of the
size range — it is 11.6%–64.5% of the pond depending on the hunter — and hunting
takes from it without preference. The floor under body size is a **threshold
effect**, not a pursuit effect, and this pond's hunters are not better at
catching small creatures than at catching large ones. They are simply not allowed
to try.

### Reproducing it

The instrument ships, so the first table is a read of the books:

```bash
node --input-type=module -e '
  import * as W from "./src/world.js"; import * as C from "./src/config.js";
  import * as S from "./src/stats.js";
  for (const seed of [314, 77, 51, 13, 23, 45, 101, 202, 303, 404, 512, 777]) {
    const w = new W.World(C.makeConfig({ seed }));
    for (let i = 0; i < 20000; i++) w.step();
    const d = S.deathSizes(w.stats.sizedBy, w.stats.radiusSumBy, w.stats.poolSumBy);
    console.log(seed, ...["starvation","age","predation"].map(
      (c) => `${c} n=${d.causes[c].n} ${d.causes[c].delta.toFixed(3)}`));
  }'
```

The eligible-set control needs the hunter, which nothing stores. It is
recoverable from `canEat`, but only if the hook keys on the **target** rather
than on the caller: `world.js` asks the question twice per neighbour, once for
prey (`c.canEat(o)`) and once for threats (`o.canEat(c)`), so a
last-caller-wins hook records the wrong creature most of the time.

```bash
node --input-type=module -e '
  import * as W from "./src/world.js"; import * as C from "./src/config.js";
  import { Creature } from "./src/creature.js";
  const canEat = Creature.prototype.canEat, die = Creature.prototype.die;
  let eater = new WeakMap(), hook = null;
  Creature.prototype.canEat = function (o) {
    const ok = canEat.call(this, o); if (ok) eater.set(o, this); return ok; };
  Creature.prototype.die = function (cause) {
    if (cause === "predation" && !this.dead && hook) hook(this, eater.get(this));
    return die.call(this, cause); };
  for (const seed of [314, 77, 51, 13, 23, 45, 101, 202, 303, 404, 512, 777]) {
    const w = new W.World(C.makeConfig({ seed })), r = w.config.preySizeRatio, k = [];
    hook = (v, h) => { if (!h) return;
      let s = 0, n = 0, es = 0, en = 0;
      for (const o of w.creatures) { if (o.dead || o === v) continue;
        s += o.radius; n++; if (o.radius * r <= h.radius) { es += o.radius; en++; } }
      if (en) k.push([v.radius, es / en, s / n]); };
    for (let i = 0; i < 20000; i++) w.step();
    const m = (j) => k.reduce((a, x) => a + x[j], 0) / k.length;
    console.log(seed, k.length, "victim", m(0).toFixed(3),
      "eligible", m(1).toFixed(3), "pond", m(2).toFixed(3),
      "| rule", (m(1) - m(2)).toFixed(3), "choice", (m(0) - m(1)).toFixed(3));
  }'
```

Each script is twelve runs of 20,000 ticks and takes about three and a half
minutes. The second one's kill count must equal `stats.deathsBy.predation` — if
it does not, the attribution is wrong, and that disagreement (2,785 against
2,807, 0.8%) is the only thing that gave away the first, broken version of it.

## The refuge the pond actually has (v1.89)

The section above is arithmetic on two constants: substitute the largest body
this world is *capable* of growing into the eating rule and the answer is that
nothing can touch a creature at or above 7.273 px. v1.65 finished by noting what
that leaves — the `Refuge` tile "says what is beyond *every* hunter, not what is
beyond the ones that exist" — and then nobody asked the second question for
twenty-four releases.

The hunters that exist are smaller. `Stats.hunterCeiling` is the largest body in
the pond whose diet gene clears `carnivoreThreshold`; the line that hunter draws
is `hunterCeiling / preySizeRatio`, and `Stats.livedRefugeShare` counts the
living beyond it. Twelve seeds, 6,000 ticks, everything else default:

| seed | hunters | biggest hunter | today's line | `Refuge` | `Safe` | gap |
|---|---|---|---|---|---|---|
| 314 | 1 | 5.467 | 4.970 | 99.2% | 100.0% | +0.8 |
| 1 | 4 | 6.562 | 5.966 | 92.1% | 98.7% | +6.6 |
| 7 | 155 | 8.000 | 7.273 | 75.1% | 75.1% | 0.0 |
| 13 | 15 | 7.725 | 7.023 | 100.0% | 100.0% | 0.0 |
| 23 | 50 | 6.821 | 6.201 | 0.0% | 10.0% | +10.0 |
| 42 | 0 | — | — | 13.4% | all | +86.6 |
| 51 | 0 | — | — | 71.3% | all | +28.7 |
| 99 | 135 | 7.387 | 6.716 | 4.0% | 99.2% | +95.2 |
| 128 | 88 | 7.707 | 7.007 | 60.3% | 63.3% | +3.0 |
| 256 | 191 | 7.226 | 6.569 | 0.0% | 91.1% | +91.1 |
| 512 | 65 | 6.983 | 6.349 | 3.2% | 98.9% | +95.8 |
| 2024 | 307 | 7.194 | 6.540 | 0.0% | 99.7% | +99.7 |

Mean gap **43.1 points** of the population, median 10.0, ten of twelve positive
and never negative — it cannot be, and that is the first thing worth stating.

**The two readings are ordered by construction.** No living hunter can be larger
than the largest this world grows, so today's line is never above 7.273 and the
share beyond it never below `refugeShare`. They are equal exactly when some
hunter has reached `bodyRadiusMax`, which is seed 7 in the table — one pond of
twelve where the older tile is telling the whole truth. Everywhere else it is a
floor, and on three seeds it is a floor at nought while more than nine tenths of
the pond stands outside the reach of every animal in the water.

**Two ponds hold no hunter at all.** On seeds 42 and 51 every carnivory gene at
tick 6,000 is under the threshold: nothing can eat anything, and the `Refuge`
tile goes on quoting 13.4% and 71.3% of the pond as the part that is safe. This
is the reading the config's refuge cannot produce, and it is why the tile prints
a word rather than a number there — "100% ≥0.0px" is three true symbols
arranged into a falsehood, because there is no line and the absence of one is
the news. It is also v1.72's audit arriving on a threshold instead of on a
count: *for every total on a panel, ask what its largest single contributor is
and whether that is the thing the label says.* The label said "the size above
which nothing here can eat them"; the number underneath was answering about a
predator this pond has never grown.

### The control: predation off

The same twelve seeds with `predation: false`, which does not change a body's
size or a diet gene directly — it removes the reason to care:

| | hunters alive | ceilings | mean gap | median | positive |
|---|---|---|---|---|---|
| predation on | 2 ponds of 12 have none | 0.00–8.00 px | +43.1 | +10.0 | 10/12 |
| predation off | 5 ponds of 12 have none | 0.00–7.28 px | +43.8 | +22.3 | 11/12 |

So the gap is **not** a fact about hunting. It is the same size in a pond where
nobody hunts, because it was never about behaviour: it is the distance between
the biggest predator the config permits and the biggest one the genes in the
water happen to express, and those genes drift whether or not they are used.
This is `refugeShare`'s own finding (v1.64) one substitution down, and the
statistic is left live with the flag off for the same reason — the surfaces gate
on `predation`, the number does not.

One thing the control does say, and it is a lead rather than a result: a pond
with hunting on keeps *more* hunters in it (two huntless against five, ceilings
reaching 8.00 against 7.28). Twelve seeds and a sign count is an anecdote about
a trajectory (v1.32), and the mechanism it suggests — meat pays, so carnivory
persists where it is allowed to be used — is the kind of plausible story this
world hands out for free.

### What is pinned, and what is only written down

`test/refuge.test.js` holds the arithmetic and the invariant: that the ceiling
reads the diet half of `Creature._edible` and not body size alone (a body at
`bodyRadiusMax` with no appetite must not set it), that `inLivedRefuge` agrees
with the pond's own biggest hunter at every radius in the range at a step of
0.001, that its boundary is decided by the rule's multiplication rather than by
a division one ULP away, that the lived line is never above the declared one and
the two agree exactly when a hunter reaches `bodyRadiusMax`, that a pond with
nothing hunting is entirely out of reach, and that the panel's three numbers are
the module's own. The twelve-seed table is not in the suite, for the reason the
v1.64 table is not.

### Reproducing it

```bash
node --input-type=module -e '
  const W = await import("./src/world.js"), C = await import("./src/config.js");
  for (const predation of [true, false]) {
    for (const seed of [314,1,7,13,23,42,51,99,128,256,512,2024]) {
      const w = new W.World(C.makeConfig({ seed, predation }));
      for (let t = 0; t < 6000; t++) w.step();
      const s = w.stats;
      console.log(predation ? "on " : "off", String(seed).padStart(4),
        "hunters", String(s.carnivoreCount).padStart(3),
        "ceiling", s.hunterCeiling.toFixed(3),
        "line", s.livedRefugeRadius.toFixed(3),
        "refuge", (s.refugeShare * 100).toFixed(1) + "%",
        "safe", (s.livedRefugeShare * 100).toFixed(1) + "%");
    }
  }'
```

Twenty-four runs of 6,000 ticks, about two minutes.

## The half of the predator mark the audit walked past (v1.66)

v1.25 found that the predator's core — a bright warm disc drawn additively over
a body that pales as it feeds — was invisible, worst case ΔE 2.8, and replaced
it with an eye: an opaque pale disc inside a blood-dark rim, with the diet gene
moved into the mark's *size* because fading a mark to express degree spends
exactly the contrast the mark exists for.

Nine lines above that eye, in the same `if (isPredator)` block, sat the other
half of the mark: the warm line around the chevron. v1.25 did not touch it, and
for forty-one releases it stayed exactly what the core had been —

```js
ctx.strokeStyle = `hsla(8, 90%, 60%, ${0.35 + 0.5 * c.carnivory})`;
```

— one translucent warm tone over a background it does not control, with the diet
gene in its opacity. `test/colourliterals.test.js` has listed it as unmeasured
since v1.61, in those words, with "which is the thing v1.34 forbids by name"
beside it. This is the measurement.

### It is invisible on half the pond

The outline straddles the edge of the body, so it has two backgrounds and one of
them is the creature's own doing (v1.55): inside, the chevron — every lineage
hue, at every energy and every signalling saturation; outside, the water with
the creature's own additive glow over it, brighter still where bodies overlap.
Scored the way every mark in this project is scored — the composited result
against the background it was drawn on, under normal vision and the three
dichromacies, at the opacities real predators actually produce:

| | share of backgrounds |
|---|---|
| below `MIN_DELTA_E` (25) | **53.5%** |
| below the just-noticeable difference (2.3) | **3.9%** |

280 of the 360 lineage hues have a body state in which the outline falls under
the bar, and 134 of them a state in which it cannot be seen at all. The worst
case is a flat **ΔE 0.00**: a warm-hued creature wearing a warm line drawn at
two-thirds opacity is, to a tritanope, one colour.

And it fails at the **opposite end of the energy axis from the core v1.25
fixed**, which is worth its own line, because I had the other sentence written
before I checked. Body lightness rises with energy. The core was drawn
additively, so a well-fed body — a pale pastel — clamped it to white and the
best-fed predator wore the faintest mark. The outline is drawn `source-over`,
so what defeats it is not the pale extreme but the *middle*: a mid-lightness
warm body is very nearly the colour the line composites to.

| body energy | worst ΔE | share of bodies under the bar |
|---|---|---|
| 0 (starving) | 0.01 | **71.9%** |
| 0.5 | 0.00 | 68.0% |
| 1 (fed) | 10.56 | 16.8% |

The same colour, on the same creature, nine lines apart in the same file, with
its failure inverted by the compositing mode. Two marks that look like one
decision are two decisions whenever they are composited differently — and the
screenshot argues for the wrong one of the two, because to normal vision a warm
line over a dark body is the case that reads *best*.

The replacement holds across the whole axis: worst ΔE 29.1 on a starving body,
71.1 on a fed one, and nothing under the bar anywhere.

### The degree it was spending that contrast on was not there

That is the ordinary half of the finding. The interesting half is what the
opacity ramp bought.

A creature is drawn as a predator when its diet gene clears
`carnivoreThreshold` (0.55), and the ramp `0.35 + 0.5 · carnivory` therefore
runs from 0.625 to 0.85 — already a narrow span. But the span a *watcher* meets
is narrower than the span the gene allows. Sampling every creature drawn as a
predator every 250 ticks over 20,000 ticks on twelve seeds — 82,697
predator-frames:

| percentile | carnivory | outline opacity |
|---|---|---|
| p0 | 0.551 | 0.626 |
| p10 | 0.598 | 0.649 |
| p50 | 0.657 | 0.679 |
| p90 | 0.785 | 0.742 |
| p100 | 1.000 | 0.850 |

94.1% of predator-frames sit below carnivory 0.80. The middle 80% of them span
an opacity of 0.649 to 0.742, and over that span the faintest outline and the
loudest differ by:

| background | whole gene range | middle 80% of frames |
|---|---|---|
| a fed warm body (hue 20) | ΔE 4.0 | **ΔE 1.7** |
| a fed cool body (hue 210) | ΔE 2.3 | ΔE 1.1 |
| glow-lit water (hue 20) | ΔE 7.8 | ΔE 3.2 |
| dark water | ΔE 12.7 | ΔE 5.3 |

Against the body — which is half of what the line is drawn on, and the half a
watcher is looking at — the difference between a marginal carnivore and a
ninetieth-percentile one is **under the just-noticeable difference**. The
channel v1.34 forbids was not merely expensive here. It was empty: the mark paid
its contrast for a signal it never sent, on top of a gene that is already
readable as the eye's radius.

### The fix, and the two constraints that pin it

The house treatment since v1.25 is two opaque tones — a very light one and a
very dark one — because no background is close to both, and luminance is the one
channel no colour vision deficiency touches. `render.js` already has the idiom
for a line (`_twoToneRing`: the dark laid down slightly wider, the bright tone
over it), so the outline becomes one call of each. The warm line keeps the width
it has always had; what is added is a dark hairline half a pixel either side of
it. The dark is the eye's own rim, read from one constant both marks share, so
the two cannot drift into two different darks.

The warm tone is not a taste. Two measurements pull against each other and
between them they admit a band ten steps wide:

- it has to clear the bar against every background, which wants it **lighter**;
- it has to stay distinguishable from the eye's pale disc, or the silhouette
  reads as a second copy of the mark it surrounds rather than an outline of it,
  which wants it **darker**.

At hue 20, saturation 90%:

| lightness | worst vs any background | vs the eye's disc |
|---|---|---|
| 39 | 24.2 ✗ | 44.6 |
| 40 | 25.2 | 42.8 |
| **45** | **28.1** | **33.8** |
| 49 | 29.8 | 26.8 |
| 50 | 30.4 | 24.9 ✗ |

`hsl(20, 90%, 45%)` is the middle of that band. Its worst case over every body
and every glow-lit patch of water is **ΔE 28.1** (protanopia, a green-lit
background), against **0.00** for the tone it replaces, and it stays below the
eye's own worst case of 40.2 — the mark that carries the sentence is still the
louder of the two on the background where each is weakest.

### Why hue 8 was the worst place to put it

The tone that failed was hue 8. So is the rim. That is the whole diagnosis, and
it is the one-number kind: a two-tone mark whose tones share a hue is separated
in **luminance alone**, so a mid-luminance background of that hue defeats both
halves at once. Pairing the old warm with the dark rim and sweeping lightness,
the warm mid-tone `rgb(79, 65, 35)` scores 24.9 against the light tone and 24.2
against the dark — neither escapes, and the admissible band at hue 8 is *one
step wide*. Moving the light tone off the dark one's hue buys the second axis
back; at hue 20 the band is ten steps.

The general form, for the next two-tone mark: check that the two tones differ in
something besides lightness, or the pair is one tone with a dimmer switch.

### Reproducing it

The opacities the ramp actually takes, over twelve seeds:

```bash
node --input-type=module -e '
  import * as W from "./src/world.js"; import * as C from "./src/config.js";
  const all = [];
  for (const seed of [314, 7, 21, 42, 51, 77, 99, 128, 256, 512, 1024, 2026]) {
    const w = new W.World(C.makeConfig({ seed })), t = w.config.carnivoreThreshold;
    for (let i = 1; i <= 20000; i++) { w.step();
      if (i % 250 === 0) for (const c of w.creatures)
        if (!c.dead && c.carnivory >= t) all.push(c.carnivory); }
  }
  all.sort((a, b) => a - b);
  const q = (p) => all[Math.floor(p * all.length)];
  for (const p of [0, 0.1, 0.5, 0.9])
    console.log(`p${p * 100}`, q(p).toFixed(3), "alpha", (0.35 + 0.5 * q(p)).toFixed(3));
  console.log("under 0.80:", (all.filter((c) => c < 0.8).length / all.length * 100).toFixed(1), "%");'
```

The contrast, old against new, on both of the outline's backgrounds:

```bash
node --input-type=module -e '
  import * as P from "./src/palette.js";
  const bgs = [];
  for (let h = 0; h < 360; h++) for (const e of [0, 0.25, 0.5, 0.75, 1])
    for (const s of [-1, 0, 1]) bgs.push(P.hslToRgb(h, 60 + 25 * s, 45 + 45 * e));
  const water = { r: 7, g: 12, b: 19 };
  for (let h = 0; h < 360; h += 5) for (const e of [0, 0.5, 1]) for (const k of [0.15, 0.33, 0.5, 0.8])
    bgs.push(P.addOver(water, P.hslToRgb(h, 70, 30 + 45 * e), k));
  const old = P.hslToRgb(8, 90, 60), t = P.predatorOutlineTones();
  let wOld = Infinity, wNew = Infinity, under = 0;
  for (const bg of bgs) {
    let o = Infinity, n = Infinity;
    for (const v of P.VISION_MODELS) {
      for (const a of [0.626, 0.679, 0.742, 0.85])
        o = Math.min(o, P.deltaE(P.blendOver(bg, old, a), bg, v));
      n = Math.min(n, P.markContrast([t.edge, t.rim], bg, v));
    }
    wOld = Math.min(wOld, o); wNew = Math.min(wNew, n); if (o < P.MIN_DELTA_E) under++;
  }
  console.log("old", wOld.toFixed(2), "new", wNew.toFixed(2),
    "old under the bar:", (under / bgs.length * 100).toFixed(1), "%");'
```

The first takes about three and a half minutes; the second is instant. Both
assertions ship as tests — `test/palette.test.js` holds the new tone to the bar
*and* holds the old one to its collision, so restoring the fading outline turns
the suite red rather than leaving it green.

## The oldest field in the pond, finally counted (v1.68)

Biomes arrived in v1.3. Four Gaussian bumps on the torus, a fertility in
`[0.15, 1]` at every point, and a rejection sampler that turns that fertility
into an acceptance probability for a new pellet: food falls where the ground is
good. Sixty-five releases later they were drawn in two views, mentioned in the
README, wired to a checkbox — and described by **no number anywhere in this
project**. Every other noun in the pond has a readout. This one had a glow.

v1.67 found the gap by inventory (list what is in the world, then ask a surface
which items it has ever heard of) and could not close it in the same cycle,
because the other three gaps it found had a statistic already computed and this
one needed one invented.

### The statistic

`patchBias(field, points)` — mean fertility under a set of points, minus the
mean fertility of the whole landscape. It is `groundBias` (v1.23) one field
over, and the shape is deliberate: both are displacements along a 0..1 scale,
so *the pond is on ground 9% more fertile than average* reads the same way as
*the pond is on ground 3% flatter than average*.

The denominator is the interesting half. `at()` takes the **max** of the bumps
rather than their sum — so that overlapping biomes cannot push fertility past 1
and break the sampler — and a max of Gaussians has no elementary integral, so
the field's own mean is estimated on a 15-pixel lattice (`patchRadius` is 135,
so the field is near-linear across a cell; a lattice eight times finer agrees to
better than 1e-4, which `test/biomes.test.js` pins). It is cached, and dropped
when drift moves the landscape — a cache in front of a moving thing being where
this project's favourite bug lives.

### Three zeroes, and only one of them is evidence

| control | what it gives | worth |
| --- | --- | --- |
| `patchFloor: 1` | bit-exact 0 | structural — a flat field makes every point the mean |
| uniform scatter of the same count | ~0 | v1.27's arm; true of any points anywhere |
| **`foodPatches: false`** | **+0.000, measured** | the real one |

The third is the one v1.67 said did not exist. It has been in the panel since
v1.3 as **Biomes (food patches)**, and in the permalink as `bio=0`. The field is
still built with it off, still has a mean, and is still measured by exactly the
same code — what is missing is any reason for the pond to be in the fertile half
of it. That is v1.20's test in its strongest available form: not a statistic
zeroed by a guard, but the same measurement of a world where the mechanism is
inert.

### What twelve seeds say

Seeds 314, 7, 21, 42, 51, 77, 99, 128, 256, 512, 1024, 2026, at 6,000 ticks. All
figures are fertility displacements against each world's own field mean (which
is itself 0.514–0.599 depending on where the four biomes landed, so the ceiling
— every point at a centre — is 0.40–0.49).

| what is being measured | patches on | patches off |
| --- | --- | --- |
| fertility where each pellet was **sown** | **+0.092** (0.077 … 0.132) | — |
| fertility under the **standing crop** | +0.024 (−0.001 … 0.059) | +0.001 |
| fertility under the **living** | **+0.089** (0.051 … 0.138) | **+0.000** (−0.032 … 0.023) |
| seeds with the living above zero | 12 of 12 | 7 of 12 |
| z against 400 uniform replicates of the same count | 3.3 … 8.6 | −2.1 … +1.5 |

Two findings, and they are the same finding from opposite ends.

**The crop's own pattern is nearly gone by the time anyone looks.** Pellets are
sown at +0.092 and the ones still standing sit at +0.024 — **26% of the sowing
bias survives** — and that residue is inside the scatter of uniformly placed
pellets on ten of the twelve seeds (z under 3, and under 1 on five of them). A
tile reading the standing crop's fertility would have been decoration: it cannot
tell the biomes from chance on most worlds.

**The living are where the pattern went.** At +0.089 the pond sits almost exactly
where the pellets were sown, on every seed, at 3.3 to 8.6 standard deviations of
its own null. The crop is not concentrated because it is *eaten* concentrated;
the fertile ground is where a pellet's life expectancy is shortest. So the
readout is about the creatures, which is the half of the claim its control
leaves standing.

That is the second time in three releases that the honest statistic was the one
the control did not take back (v1.56: exclusion owns a depth, not a spacing).

### Reproducing it

```bash
node --input-type=module -e '
import { World } from "./src/world.js";
import { DEFAULT_CONFIG } from "./src/config.js";
import { patchBias } from "./src/environment.js";
import { RNG } from "./src/rng.js";
const SEEDS = [314, 7, 21, 42, 51, 77, 99, 128, 256, 512, 1024, 2026];
for (const patches of [true, false]) {
  const pond = [], crop = [];
  for (const seed of SEEDS) {
    const w = new World({ ...DEFAULT_CONFIG, seed, foodPatches: patches });
    for (let t = 0; t < 6000; t++) w.step();
    pond.push(patchBias(w.environment, w.creatures));
    crop.push(patchBias(w.environment, w.food.items));
  }
  const m = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  console.log(`patches ${patches}: living ${m(pond).toFixed(3)}`,
    `(${pond.filter((x) => x > 0).length}/12 up), crop ${m(crop).toFixed(3)}`);
}'
```

About three minutes. The sown column needs one more line — wrap
`world.food.spawnOne` and read `world.environment.at()` at each new pellet — and
when you do, print `world.food.spawned` beside your own count: this project has
had one ad-hoc instrument miscount by 0.8% and produce a whole table of
plausible nonsense (v1.65), and the two totals agreeing to the unit (104,987) is
what says the hook caught every spawn.

## Drawing the line, and what a picture of it can be used to say (v1.69)

v1.64 found the refuge — the body size `bodyRadiusMax / preySizeRatio` puts
beyond every hunter this world is capable of growing — and put a percentage on
the panel. A percentage is a summary of a distribution, and the distribution is
the interesting object here, so this release draws it: an opt-in overlay
(**Show the refuge line**) puts the 7.273 px circle around every body still
under it.

It is the only mark in this project drawn at a radius that does not depend on
the thing it is drawn around. Every ring in the pond is the same circle, so what
varies is how much of its own ring a body fills, and a creature past the line
has no ring at all. The mark's **absence** is the statement.

### Does anybody see it? The mark's own measurement

A ring drawn at a fixed radius around a body that is nearly that radius is a
ring with nothing inside it to see. So the first number this release owes is not
about the pond, it is about whether the drawing says anything — v1.13's rule
("a mechanic is finished when a watcher can tell it is happening") asked as a
quantity. Twelve seeds, the gap `7.273 − radius` for every ringed body:

| tick | ringed share | median gap | share of rings with ≥1 px of daylight |
| ---: | ---: | ---: | ---: |
| 0 | 84.2% | 1.93 px | 71.4% |
| 500 | 78.9% | 1.68 px | 66.1% |
| 2,000 | 70.2% | 1.15 px | 43.1% |
| 6,000 | 46.9% | 0.99 px | 25.7% |

The mark is loudest exactly when there is most of it: a founder pond is a
scatter of circles at every fill, and a settled one is mostly bodies wearing
their own outline. That tightening is the honest content of the picture — the
pond does not sit anywhere in the size range, it piles up against the line.

### What the picture is *not* evidence of

On the default seed the overlay empties out: 80% of bodies ringed at tick 0,
57% at 500, 17% at 1,000, 3% at 4,000, **1% at 6,000**. Watching that happen it
is very hard not to narrate an arms race being won, and v1.64 already measured
that claim and killed it — a pond with `predation` off grows into the refuge
just as readily.

Re-run at this release's tick count, twelve seed-matched pairs at 6,000 ticks,
the ringed share is **46.9%** with hunters and **61.7%** without, and the pairs
split **9 of 12** in the same direction. A fair coin produces a 9–3 split 7.3%
of the time, and both arms range from 0% to 100% across seeds. That is a lead
and not a result, and it is written here rather than on the panel for that
reason. What is worth noting is that it is a *different* statistic from v1.64's
(the share past a fixed line at 6,000 ticks, against mean body radius at 20,000)
and it leans the other way; whether the two disagree is unmeasured.

### The colour, and why it is not warm

The ring straddles a body edge by construction, so roughly half of it lies over
an opaque chevron of some inherited hue and the rest over glow-lit water. That
is the background a single tone cannot survive — v1.25 (the predator core),
v1.34 (the halo), v1.43 (the call rings), v1.66 (the predator outline). It ships
as the house two-tone, pale cyan over near-black, hues far apart so the pair is
not separated in luminance alone; worst case over every body this pond can paint
and every glow-lit patch outside one is **ΔE 44.6**, against a bar of 25.

Cyan rather than the warm family the other predation marks use, on purpose. A
hunter's outline and eye are warm because they say *this one hunts*. This says
*this one can be hunted*, which is the complement, and one hue family for both
statements invites reading the ring as a third grade of predator.

### Reproducing it

```bash
node --input-type=module -e '
import { World } from "./src/world.js";
import { DEFAULT_CONFIG } from "./src/config.js";
import { refugeRadius, inRefuge } from "./src/refuge.js";
const SEEDS = [314, 77, 51, 13, 23, 7, 101, 512, 999, 2, 44, 8080];
const R = refugeRadius(DEFAULT_CONFIG);
for (const predation of [true, false]) {
  const shares = [];
  for (const seed of SEEDS) {
    const w = new World({ ...DEFAULT_CONFIG, seed, predation });
    for (let t = 0; t < 6000; t++) w.step();
    const live = w.creatures.filter((c) => !c.dead);
    const gaps = live.filter((c) => !inRefuge(c.radius, w.config)).map((c) => R - c.radius);
    shares.push(gaps.length / live.length);
  }
  const m = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  console.log(`predation ${predation}: ringed ${(m(shares) * 100).toFixed(1)}%`);
}'
```

About four minutes. Add the gap columns by keeping `gaps` rather than only its
length; the daylight column is `gaps.filter((g) => g >= 1).length / gaps.length`,
and 1 px is the right threshold because at zoom 1 the camera is the exact
identity, so a world pixel is a CSS pixel.

## The last translucent mark, and the filing that hid it (v1.70)

Since v1.32 the **Show vision** overlay has drawn where a creature's senses
reach, in three strengths of one pale blue: `rgba(120, 180, 255, α)` at 0.15
when the radius is the whole story, and at 0.06 and 0.18 when it is not — the
faint one the radius a sense *asks for*, the strong one the region the spatial
index really searched. That pair is the entire content of v1.32, which found the
grid returning 90% of the disc it advertised and decided that a bug you keep for
compatibility is defensible but a picture that hides it is not.

Eleven releases of colour work went past it. Every one of them was a sweep of
*marks* — badges, rings, halos, outlines — and this was filed as a **rule**, a
line saying where a radius ends. The filing is what hid it, and the filing is
wrong: a gridline is furniture on a panel whose background this project chooses,
and this is a 168-pixel circle over the pond, whose background the world
chooses. That is v1.34's lottery, and the numbers are the worst recorded here.

### Three strengths, and none of them survives the pond

Over 6,636 backgrounds — the grounds rock is audited against (season, terrain,
biomes, enriched ground, the contagious zone), the glow-lit water either
epidemiological mark sits on, and every opaque body this pond can paint — under
all four vision models:

| line | worst ΔE | share under the JND (2.3) |
| --- | ---: | ---: |
| the searched region, α 0.18 | **0.00** | 4.8% |
| the disc-only case, α 0.15 | **0.00** | 6.5% |
| the radius asked for, α 0.06 | **0.00** | 26.3% |
| **the two of them, against each other** | **0.00** | 8.5% |

The last row is the one that matters. In the default pond both lines are drawn —
`exactVision` is off, so the disc really is only an aspiration — and on a
twelfth of the backgrounds they cross, the correction and the thing it corrects
are the same line. The release that stopped this overlay telling a quiet fiction
told a second one in the same frame, and it did it by separating two *meanings*
with an alpha, which is the channel v1.34 forbids by name.

### The fix, and what it costs

Opaque, two-tone, the house treatment: `rgb(120, 180, 255)` over a near-black
rim. The alpha was doing two jobs and both move to something a background cannot
take back.

- **The distinction becomes a dash.** The region actually searched is solid; the
  radius merely asked for is dashed. Geometry survives every vision model — the
  same device that tells the immune ring from the sick halo (v1.34).
- **The subordination becomes the width.** A one-pixel hairline is quiet because
  it is thin, and thinness is a property of the mark. Translucency is a property
  of the mark *and whatever is under it*, which is the whole bug.

### The colour was never wrong; the thing that pins it is not the floor

`rgb(120, 180, 255)` is `hsl(213, 100%, 73.5%)`. Opaque over the rim it scores
**38.3** worst-case against a bar of 25 — but so does every blue from lightness
56 upward, because the rim carries the dark grounds and any blue carries the
bright ones. Nine releases of colour work here have ended in a value pinned by a
floor. This one is pinned by its **neighbours**:

| against | ΔE | fails above lightness |
| --- | ---: | ---: |
| the immune ring `hsl(205, 85%, 88%)` | 34.8 | 78 |
| the refuge line `hsl(186, 70%, 90%)` | 45.3 | 83 |

All three are pale blues, all three are drawn on or around creatures, and all
three can be on screen at once. 73.5 was already inside the band — which is the
same shape as v1.66, where the predator outline's *hue* was fine and the channel
it spent its contrast on was empty.

### The control: no single tone would have done

Every two-tone mark in this project rests on one sentence from v1.34 — *a mark
carrying a very light and a very dark tone cannot be swallowed, because no
background is close to both* — and that sentence has never been measured as a
claim about the alternative. Sweeping all of HSL against these 6,636
backgrounds, the best **single** opaque colour that exists anywhere is
`hsl(240, 100%, 15%)` at **ΔE 17.6**, against a bar of 25. There is no one-tone
answer to find; the pair is a necessity and not a house style.

### Reproducing it

```bash
node --input-type=module -e '
  import * as P from "./src/palette.js";
  import { independentAny } from "./src/contagion.js";
  const veil = (p) => ({ r: Math.round(6 + 4 * p), g: Math.round(10 + 4 * p), b: Math.round(20 - 8 * p) });
  const terr = (bg, r, c) => P.blendOver(bg, { r: 24 + 84 * r + (c ? 26 : 0), g: 42 + 76 * r + (c ? 34 : 0),
    b: 54 + 84 * r + (c ? 40 : 0) }, c ? Math.min(0.34, 0.13 + 0.13 * r) : 0.03 + 0.13 * r);
  const G = [];
  for (const p of [0, 1]) { const v = veil(p);
    for (const r of [0, 0.5, 1]) for (const c of [false, true]) {
      const g = terr(v, r, c);
      for (const b of [g, P.addOver(g, { r: 30, g: 78, b: 66 }, 0.16)]) {
        const t = P.detritusTint(1), h = P.hazardTint();
        G.push(b, P.blendOver(b, t, t.a), P.blendOver(b, h, independentAny(h.a, P.HAZARD_AUDIT_SOURCES)));
      } }
    G.push(v); }
  for (const t of Object.values(P.barrierRockTones())) G.push(t);
  const B = [...G];
  for (const g of G) for (const h of [0, 60, 120, 200, 300]) for (const k of [0.1, 0.3, 0.6, 0.9])
    B.push(P.addOver(g, P.hslToRgb(h, 80, 60), k));
  for (let h = 0; h < 360; h += 5) for (const e of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) for (const s of [-1, -0.5, 0, 0.5, 1]) {
    const c = P.hslToRgb(h, 60 + s * 25, 45 + e * 45); B.push(c, P.addOver(c, c, 0.5)); }
  const old = { r: 120, g: 180, b: 255 }, t = P.visionReachTones();
  const w = { 0.06: Infinity, 0.15: Infinity, 0.18: Infinity, pair: Infinity, now: Infinity };
  let jnd = 0;
  for (const bg of B) for (const v of P.VISION_MODELS) {
    for (const a of [0.06, 0.15, 0.18]) w[a] = Math.min(w[a], P.deltaE(P.blendOver(bg, old, a), bg, v));
    const d = P.deltaE(P.blendOver(bg, old, 0.06), bg, v); if (d < 2.3) jnd++;
    w.pair = Math.min(w.pair, P.deltaE(P.blendOver(bg, old, 0.06), P.blendOver(bg, old, 0.18), v));
    w.now = Math.min(w.now, P.markContrast([t.ring, t.rim], bg, v));
  }
  console.log(`backgrounds ${B.length}`, Object.fromEntries(Object.entries(w).map(([k, x]) => [k, +x.toFixed(2)])));
  console.log("the faint line under the JND on", (100 * jnd / (B.length * 4)).toFixed(1), "% of them");
  let best = { d: -1 };
  for (let h = 0; h < 360; h += 10) for (let s = 0; s <= 100; s += 20) for (let l = 5; l <= 95; l += 5) {
    const c = P.hslToRgb(h, s, l); let d = Infinity;
    for (const bg of B) { for (const v of P.VISION_MODELS) { d = Math.min(d, P.deltaE(c, bg, v)); if (d <= best.d) break; } if (d <= best.d) break; }
    if (d > best.d) best = { d, h, s, l }; }
  console.log("best single opaque tone anywhere:", JSON.stringify(best));'
```

About a minute, all of it in the last sweep. Every number above ships as a test:
`test/palette.test.js` holds the new pair to the bar, holds all three old
strengths *and their difference* to their collisions, and asserts the overlay
stays 25 away from the two other blue marks — so restoring the alpha, or
drifting the lightness up into the immune ring, turns the suite red.

## The constants nobody wrote down, because they are pairs (v1.71)

`src/levers.js` (v1.38) moves every number in `config.js` one at a time and asks
whether the world notices. All eighty-four are levers. That sweep is blind by
construction to what a **pair** decides, and this project already knows one
thing a pair decides that it never saw:

```
bodyRadiusMax / preySizeRatio  =  8.0 / 1.1  =  7.273 px
```

the size above which nothing this world can grow is able to eat you (v1.63).
Neither constant is that number. It sits four fifths of the way up the body-size
range, three quarters of the pond is past it at 20,000 ticks, and it turns the
headline mechanic off partway through every run. A sweep that moves one number
at a time cannot see it, because what the pair decides is a *conjunction*.

The obvious remedy — move both, 3,486 pairs, 600 ticks each — is a day of CPU
and would still only report *that* something moved. `src/dimensions.js` is the
cheap screen instead, and it never steps a world: **ask, for each pair, whether
their ratio or product has the units of something the pond can be on both sides
of.**

### Three filters

Every constant carries a unit, transcribed from what `config.js` already says in
prose ("in pixels", "per tick", "per unit of body radius"). Then:

| filter | asks | combinations left |
| --- | --- | --- |
| — | every pair, three forms each (`a/b`, `b/a`, `a*b`) | **10,458** |
| dimensional | does it land in the dimension of something the code compares? | 1,937 |
| adjacent | are both constants read by the same module? | 430 |
| reachable | is the value inside the range that quantity declares? | **218** |
| lived | inside the range the pond *occupies*? | **149** |

Nine reference classes: body radius, energy carried, age, speed, standing crop,
population, cell nutrient, a trait gene, genome distance. Every declared bound
is read out of the config (`bodyRadiusMin`..`bodyRadiusMax`, `0`..`maxAge`,
`0`..`energyMax`, …), so "inside the range" is a claim about the world rather
than about my taste.

**The screen finds the thing it was built to rediscover.** `bodyRadiusMax /
preySizeRatio` survives all four filters, and `test/dimensions.test.js` asserts
it bit-for-bit against `refugeRadius()` — an instrument that agreed to three
decimals would be a second implementation, not a check.

### A declared range is not a lived range

The first version of the last filter used the min and max each quantity reached
over twelve seeds × 6,000 ticks, and it removed almost nothing: 218 → 195. The
reason is worth more than the filter. **A min/max over a run is not the range
the pond occupies, it is the range its founders were drawn from.** Every founder
gets a size gene uniform on 0..1, `autoReseed` posts fresh ones forever, and a
`maxAge` of 4,200 means somebody is always newly born and somebody is always
about to die — so the extremes of nearly every class are touched within a few
hundred ticks and the measurement hands the config straight back.

The middle 90% instead (nearest-rank, pooled over twelve seeds, sampled every
200 ticks):

| class | declared | middle 90% |
| --- | --- | --- |
| body radius | 3.50 .. 8.00 | **4.99 .. 8.00** |
| energy carried | 0 .. 220 | 17.4 .. 139.0 |
| age | 0 .. 4,200 | 66 .. 3,032 |
| speed | 0 .. 2.60 | 0.02 .. 1.30 |
| trait gene | 0 .. 1 | 0.02 .. 0.88 |
| standing crop | 0 .. 520 | 47 .. 520 |
| population | 0 .. 650 | 18 .. 335 |
| cell nutrient | 0 .. 8.00 | 0.00 .. **0.93** |

That band takes 218 down to 149, and it is the filter that separates the two
`px` candidates worth naming:

- **`bodyRadiusMax / preySizeRatio` = 7.273 px** — inside both. The refuge.
- **`corpseEnergyBase / corpseEnergyPerRadius` = 4.375 px** — inside the
  declared range, outside the lived one. It is real arithmetic (`world.js` line
  705 builds a corpse as `corpseEnergyBase + radius * corpseEnergyPerRadius`, so
  4.375 px is exactly where a corpse's fixed meat equals its size-dependent
  meat) and the pond is essentially never below it. A threshold nothing crosses
  is v1.38's *bound that never binds*, one level up.

`cell nutrient` is the class where the band is measuring something else, and it
is flagged rather than believed: sampled over the cells that hold nutrient at
all, 95% of them hold under 0.93 of a possible 8.0 — because a cell decays at
0.997 per tick and keeps a residue for thousands of ticks after the burial that
filled it. That says nothing about whether `detritusFull` binds; v1.27 measured
that it does, at the instant of a death.

### What the screen cannot do, stated as its domain

- **The dimensionless class is excluded.** Every ratio of two same-unit
  constants lands in it, so a reference for it would admit hundreds and rank
  none. Two probabilities multiplying into a rate is exactly the kind of
  conjunction this cannot find.
- **A reference whose range is the whole world is not a filter.** The pond
  compares separations in pixels constantly and a separation on this torus runs
  0 to 546.5 px, which every pixel-valued candidate is inside. Left out for that
  reason, not because distances do not matter.
- **Three constants.** The refuge is a pair. Nothing says the next one is.
- **A survivor is a candidate, not a finding.** The body-radius class has five
  members and four of them are arithmetic about nothing (`drag * bodyRadiusMax`,
  `bodyRadiusMin / reproduceCost`, …). The screen's product is a list short
  enough to read by hand, and reading it is still the work. Five is that; 3,486
  was not.

### The one thing it found on the way in

The adjacency filter needs to know which module reads which constant, and that
scan reported that **`stepsPerFrame` is read by nothing at all**. `levers.js`
had described it since v1.38 as "read by the animation loop in `main.js`, never
by `World.step`", and its sweep asserts the negative — that the constant moves
neither the pond nor the tree. The negative held for eleven releases for the
wrong reason: `main.js` kept its own `let speed = 1` and never consulted the
config. `main.js` reads the constant now (same value, so nothing about the page
moves, and a permalink can set it), and the `levers.js` entry says what actually
happened. v1.28's rule — *a comment is not a measurement* — with the comment
sitting inside the instrument that was supposed to catch this.

The other thing the scan found is in the test that was written to say it
couldn't happen. "No module destructures the config, so a property-access scan
is complete" went red within a second of being written: `barriers.js`,
`terrain.js` and `environment.js` all pull `{width, height}` out that way, ten
times between them, and a dot-only scan called the two constants that define the
size of the world unread by anything.

### Reproducing it

```js
import { readdirSync, readFileSync } from "node:fs";
import { readersFromSources, screenPairs, latentThresholds,
         sampleQuantities, mergeSamples, bands } from "./src/dimensions.js";
import { World } from "./src/world.js";
import { makeConfig } from "./src/config.js";

const sources = Object.fromEntries(readdirSync("src")
  .filter(f => f.endsWith(".js")).map(f => [f, readFileSync(`src/${f}`, "utf8")]));
const readers = readersFromSources(sources);

let acc = {};
for (const seed of [314, 77, 51, 13, 23, 101, 202, 303, 404, 505, 606, 707]) {
  const w = new World(makeConfig({ seed, scavenging: true, detritus: true }));
  for (let t = 0; t < 6000; t++) { w.step(); if (t % 200 === 0) acc = mergeSamples(acc, sampleQuantities(w)); }
}
console.log(screenPairs({}).length,                            // 1937
            latentThresholds({ readers }).length,              // 218
            latentThresholds({ readers, ranges: bands(acc) })  // 149
              .filter(f => f.reference === "body radius"));
```

About four minutes, all of it in the twelve runs; the screen itself is
milliseconds. The instrument ships with fourteen tests
(`test/dimensions.test.js`) that pin its shape and not its output: the units
table covers every numeric constant and nothing else, the algebra cancels, the
three filters are strictly nested and each one bites, the refuge survives all of
them, and a constant no module reads fails the suite.

## Forty of the forty-five species were dealt, not evolved (v1.72)

The Tree of Life is the figure the landing page leads with, and the caption
under it has read `N species alive · M ever · K extinct` since v1.6. On twelve
seeds at 6,000 ticks, `M` is 41–50.

Forty of them are tick 0.

### Why a founder is a species by construction

`phylogeny.js` groups creatures by a single number: the mean absolute
difference between two genomes, weights and body genes together. A newborn
joins the nearest living species whose *representative* is within
`speciationDistance` (0.15), and founds a new species otherwise. So the count
of species is entirely a question of how that 0.15 compares to the distances
the pond actually produces.

There are two such distributions, and they do not overlap.

| distance | n | min | median | max |
| --- | --- | --- | --- | --- |
| founder against founder | 9,360 | **0.8709** | 1.1144 | 1.3080 |
| newborn against nearest living representative | 7,499 | 0.0039 | 0.0753 | **0.1774** |

Twelve seeds, 6,000 ticks each. Not one of the 9,360 founder pairs is within
0.15 of another — the closest is 5.8× the threshold. Forty random genomes are
forty species and would be at any threshold below 0.87, which means the plot's
band count at tick 0 is `populationStart` and is not a measurement of anything.
At the other end, 55 of 7,499 births — 0.73% — land beyond 0.15 of every living
representative, and those are the branches.

### Sweeping the threshold: a cliff and a plateau

Totals over twelve seeds × 3,000 ticks, with `speciationDistance` moved and
nothing else (the tree never feeds back, so the pond is bit-for-bit the same
world at every row — only the observer's reading of it changes):

| `speciationDistance` | founding species | evolved species |
| --- | --- | --- |
| 0.05 | 480 | 653 |
| 0.10 | 480 | 99 |
| **0.15** (default) | **480** | **13** |
| 0.18 | 480 | 1 |
| 0.20 | 480 | 0 |
| 0.40 | 480 | 0 |
| 0.80 | 480 | 0 |
| 0.90 | 478 | 1 |
| 1.00 | 402 | 14 |
| 1.20 | 19 | 2 |
| 1.40 | 12 | 0 |

This closes a lead v1.38's constant sweep left open for thirty-four releases.
That sweep found five speciation events at 0.15, zero at 0.20, and a flat
stretch across a twentyfold range above it, and concluded that *the headline
view is observed from the edge of its instrument's range*.

It is not an edge. It is a cliff with a plateau behind it, and both ends of the
plateau are in the table above. Above 0.1774 — the largest distance any birth
in this pond has ever managed — no newborn can branch at all, which is why 0.20
and 0.80 read identically. The plateau ends at 0.87, the closest two founders
have ever been, where the *deal* starts collapsing instead: 478 species at 0.90,
402 at 1.00, 19 at 1.20, and at 1.40 exactly 12 — one per seed, every founder in
the same species, which is what a threshold past the 1.3080 maximum has to mean.
(Evolved climbing back to 14 at 1.00 is the same mechanism from the other side —
once founders share a representative, a descendant can drift past one it was
never near to begin with.)

So 0.15 is not near a boundary of the instrument. It is sitting in an empty gap
between two clouds of distances, close to the top of the lower one. Everything
between 0.18 and 0.87 gives the identical answer, and the default's real
property is that it is the last value at which descent registers at all.

### What ships, and why it is a caption rather than a claim

The split is derived, not stored: `parentId` is null exactly for a genome that
came from outside a lineage, and `birthTick` separates the opening deal from a
stranger posted in later. Both fields have been on every species since the tree
existed and no surface had ever read them. The caption now says

```
45 species alive · 45 ever (40 founding, 5 evolved) · 5 extinct
```

which is v1.65's rule one view over: two of the three arms are supposed to be
the boring one, so the panel is the experiment and a reader who reads nothing
else still gets the finding. And the Chronicle says a branch out loud when one
reaches four members — the size at which the Muller plot gives a lineage a band
— so the sentence and the picture agree about what a lineage is.

**What this does not say.** That the pond does not evolve: it plainly does, and
the 55 branches are real descent. That 0.15 is wrong: a threshold in the gap is
arguably the right place for one, since it is the only region where the answer
is stable against small changes. What it says is narrower and was invisible
before the split — the *number* on the Tree of Life is a fact about
`populationStart`, and the quantity a visitor should be watching is 0–10 rather
than 41–50.

### Reproducing it

```js
import { World } from "./src/world.js";
import { DEFAULT_CONFIG } from "./src/config.js";

for (const seed of [314, 1, 7, 13, 23, 42, 51, 77, 99, 128, 512, 2024]) {
  const w = new World({ ...DEFAULT_CONFIG, seed });
  for (let i = 0; i < 6000; i++) w.step();
  console.log(seed, w.phylogeny.originTally());   // { founding: 40, arrived: 0, evolved: 5 }
}
```

About four minutes. For the two distance distributions, take
`c.genome.distance(other.genome)` over the founders at tick 0, and wrap
`phylogeny.assign` to record `min(genome.distance(s.rep))` over living species
at each birth. For the sweep, pass `speciationDistance` in the config: nothing
else changes, so the same pond can be re-read at every row.

## The two marks drawn last, and the crop that outshone them (v1.73)

The minimap paints two things after everything else: the rectangle showing where
the camera is pointed (v1.17), and the small square around the creature you
clicked. Both were single translucent near-whites — `rgba(226, 238, 255, 0.85)`
and `rgba(255, 255, 255, 0.9)` — and both were the last two entries on v1.61's
list of colours no audit had ever measured.

What kept them there was the *prose* beside them, which is v1.70's finding one
list-item earlier. The frame's entry read "a near-white stroke over anything the
little map can draw". The square's was filed under **furniture**: "the loudest
thing available … carries no distinction beyond 'this one' — there is nothing to
compare it against."

Both sentences are claims about the *mark*. Whether a near-white reads is a
claim about the *map*, and that claim — this map's brightest pixel is dark —
stopped being true in v1.57, in this project's own release notes. v1.57 gave the
minimap pellet the pond's `foodMote()` **drawn additively**, precisely so it
would survive a bright background. Additive marks stack.

### How bright the little map actually gets

Counted over twelve ponds at 6,000 ticks with every mechanic switched on, by
the number of pellets whose centres land in the same minimap pixel:

| pellets in one pixel | share of occupied pixels |
| ---: | ---: |
| 1 | 93.4% |
| 2 | 5.9% |
| 3 | 0.6% |
| 4 | 0.1% |

Four is the observed maximum, and the brightest pixel this map has been seen to
paint is **`rgb(222, 255, 255)`** — two channels clipped at the top. The old
default pond is thinner (three deep) and still reaches `rgb(250, 232, 210)`,
which is not the crop at all: it is a hunter's own badge.

### The two marks, measured

The domain is everything, because these two are drawn last: every ground, every
field over it, the contagious zone, rock, corpses, hunter badges, prey dots in
all 360 lineage hues, and the crop stacked one to four deep — 5,088 colours,
under all four vision models. At this scale the marks are each other's
backgrounds (v1.57), and the topmost mark's backgrounds are all of them.

| mark | worst ΔE | under the bar (25) | under the JND (2.3) |
| --- | ---: | ---: | ---: |
| the frame, `rgba(226, 238, 255, 0.85)` | **0.01** | 28.9% | 1.22% |
| the selection square, `rgba(255, 255, 255, 0.9)` | **0.00** | 19.8% | 1.97% |
| both, cased | **48.2** | 0% | 0% |

An enumeration weights every background equally, so it says how many colours
defeat the mark and not how often that happens. For that, the minimap's own
recorded drawing commands were rasterised into a pixel buffer, and the marks
scored against the colours actually under them:

| mark | pixels | worst ΔE | under the bar |
| --- | ---: | ---: | ---: |
| the frame (12 ponds × 3 zooms) | 15,334 | **0.14** | 0.61% |
| the selection square (every living creature, 12 ponds) | 21,710 | **3.73** | 2.08% |

Rare, total, and landing where a viewer is most likely to be looking, because a
fed biome is where the pond is.

**The square's rate is three times the frame's, and that is not noise.** A frame
is a line laid across the map wherever the camera happens to be. A selection
square is drawn *around a creature*, and creatures are where the food is — its
background is correlated with its own placement. This is v1.55's rule with the
correlation arriving from the mark's subject rather than from the mark's own
mechanic, and it is also a lesson about sample size: the first pass measured one
selected creature per pond per zoom, 36 placements, found nothing at all, and
would have shipped *"the square was fine"*.

### The fix, and the thing this surface says that the pond does not

Both marks are opaque and two-toned now: the pale line `rgb(226, 238, 255)` —
the exact colour v1.17 chose — with the house casing `hsl(232, 55%, 7%)` stroked
one pixel outside it. The colour was never the bug. Alone, that pale scores 0.02
and the casing scores 3.36; together they clear the bar by 48.2. Neither half
works and the pair does.

The casing is a *ring*, not a wider stroke under a narrower one. `render.js`
cases its rings by laying the rim down at `width + 1.1`, which leaves half a
pixel of dark either side — fine where a pixel is a fraction of a body, and
wrong on a map 180 pixels across, where half a pixel of anything composites to
exactly the grey the mark is trying not to be. Two crisp hairlines a pixel apart
is the same idea at a scale that can hold it, and it is what the hunter badge
and the corpse already do with squares.

Then the honest part. v1.70 swept all of HSL against the *pond's* backgrounds
and found the best single opaque colour anywhere scored **17.6** against a bar
of 25 — so two tones were a necessity there, and v1.34's "no background is close
to both" had a number behind it for the first time. The same sweep here says
something different:

| surface | best single opaque tone | worst-case ΔE |
| --- | --- | ---: |
| the pond (v1.70) | `hsl(240, 100%, 15%)` | 17.6 |
| the little map (v1.73) | `hsl(240, 100%, 52%)` | **56.9** |

**A single tone would have worked here.** The map's darkest ground is nearly
black and its brightest pixel is nearly white, but a saturated blue splits them
with room to spare. The pair ships anyway, on a durability argument rather than
a number: this domain has grown in v1.24 (terrain), v1.27 (enriched ground),
v1.34 (the contagious zone), v1.48 (rock) and v1.57 (corpses, and the additive
pellet that caused this bug), and a value pinned by an enumeration that keeps
growing has to be re-searched every time the map learns to draw something. A
light tone and a dark tone cannot both be swallowed by whatever arrives next.

That argument is a choice, not a measurement, and it is recorded as one — a test
asserts the single tone would have cleared, so a future me cannot mistake the
house style for a necessity on this surface.

### Reproducing it

```bash
node --input-type=module -e '
  import * as P from "./src/palette.js";
  import { terrainBandFill, TERRAIN_BANDS } from "./src/minimap.js";
  const rgbOf = (c) => { const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); return { r: +m[1], g: +m[2], b: +m[3] }; };
  const anyOf = (a, n) => 1 - (1 - a) ** n, base = [];
  const water = P.minimapWater(), grounds = [water];
  for (let b = 0; b < TERRAIN_BANDS; b++) {
    const m = terrainBandFill(b).match(/rgba?\(([^)]+)\)/)[1].split(",").map(Number);
    const g = P.blendOver(water, { r: m[0], g: m[1], b: m[2] }, m[3]), w = P.minimapBiomeWash();
    grounds.push(g, P.blendOver(g, w, w.a));
    for (const r of [0.5, 1]) { const t = P.detritusTint(r); grounds.push(P.blendOver(g, t, t.a)); } }
  const hz = P.hazardTint();
  for (const g of grounds) base.push(g, P.blendOver(g, hz, anyOf(hz.a, P.HAZARD_AUDIT_SOURCES)));
  const D = [...base, P.barrierRockTones().fill, P.barrierRockTones().edge,
    rgbOf(P.minimapCorpseMark().rim), rgbOf(P.minimapCorpseMark().core),
    ...Object.values(P.minimapPredatorTones())];
  const mote = P.foodMote();
  for (const g of base) { let c = g; for (let k = 0; k < P.MINIMAP_PELLET_STACK; k++) { c = P.addOver(c, mote, mote.a); D.push(c); } }
  for (const g of base) for (let h = 0; h < 360; h += 5) D.push(P.blendOver(g, P.hslToRgb(h, 65, 70), P.MINIMAP_PREY_ALPHA));
  const wash = (t, a) => { let w = Infinity, n = 0, j = 0;
    for (const bg of D) { let d = Infinity;
      for (const v of P.VISION_MODELS) d = Math.min(d, P.deltaE(P.blendOver(bg, t, a), bg, v));
      w = Math.min(w, d); if (d < P.MIN_DELTA_E) n++; if (d < 2.3) j++; }
    return [w.toFixed(2), (100 * n / D.length).toFixed(1) + "%", (100 * j / D.length).toFixed(2) + "%"]; };
  const pair = (tones) => { let w = Infinity;
    for (const bg of D) for (const v of P.VISION_MODELS) w = Math.min(w, P.markContrast(tones, bg, v));
    return w.toFixed(2); };
  console.log(D.length, "backgrounds");
  console.log("old frame    ", ...wash({ r: 226, g: 238, b: 255 }, 0.85));
  console.log("old selection", ...wash({ r: 255, g: 255, b: 255 }, 0.9));
  const t = P.minimapViewportTones();
  console.log("cased pair   ", pair(Object.values(t)), "| pale alone", pair([t.line]), "| casing alone", pair([t.casing]));
  let best = { d: -1 };
  for (let h = 0; h < 360; h += 6) for (let s = 0; s <= 100; s += 10) for (let l = 0; l <= 100; l += 4) {
    const c = P.hslToRgb(h, s, l); let d = Infinity;
    for (const bg of D) { for (const v of P.VISION_MODELS) { d = Math.min(d, P.deltaE(c, bg, v)); if (d <= best.d) break; } if (d <= best.d) break; }
    if (d > best.d) best = { d: +d.toFixed(2), h, s, l }; }
  console.log("best single opaque tone anywhere:", JSON.stringify(best));'
```

Under five seconds, all four tables' headline numbers. Every one of them ships
as a test in `test/palette.test.js`, including both old
collisions — a suite that only knows the new numbers stays green while somebody
restores the old ones.

## The index that is a constant, and the constant that is a world (v1.75)

Seventy-four releases and this project had never measured its own performance.
It had *described* it, twice, in prose that reads like a finding:

> the tick's time goes mostly into the two neighbour scans and the closure per
> creature per query they each allocate — `docs/AUTONOMOUS.md`

> Grids sized so each cell is about one vision radius across — that keeps the
> 3x3 query window a good match for what a creature can actually see —
> `world.js`

Both are comments, and v1.28's rule is that a comment is not a measurement.

### Work, not time

The obvious instrument is a stopwatch and it is the wrong one. A wall-clock
number is a fact about the machine that produced it: no test can assert it, no
future self can compare against it, and this file would be quoting a laptop.
What *is* a property of the world is the **work** — how many queries a tick
makes of the spatial index, and how many candidates those queries are offered.
That number is deterministic, it is what the time is being spent on, and it can
be counted *before* the tick runs, because the index is already built and the
queries are already decided.

`src/workload.js` counts it, and it counts by running the grid's own
`forEachNear` with a callback that only increments — no paraphrase of the
geometry, so no second implementation to keep in step (v1.32's accelerator rule,
pointed at a measurement). On the default pond, mean over 2,000 ticks after a
1,000-tick warm-up:

| | |
| --- | ---: |
| population | 222 |
| index queries per tick | 443 |
| candidates offered per tick | **16,978** |
| candidates per creature | 76.6 |
| the same questions with no index at all | 67,694 |
| what the index is worth | **3.99x** |

### The index is a constant factor, not a neighbourhood

The 3x3 block is nine cells of forty — **22.5% of the pond** — and that share
does not shrink as the pond fills. Sweeping `foodSpawnRate` to move the
carrying capacity, 2,000 ticks after 1,500 of warm-up:

| food rate | population | candidates/tick | per creature | creature scan alone | narrowing |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0.6 | 75 | 2,532 | 33.8 | 21.3 | 4.04x |
| 1.2 | 142 | 7,679 | 54.0 | 38.8 | 3.94x |
| **1.8** | **206** | **15,103** | **73.5** | **55.3** | **3.92x** |
| 3.0 | 344 | 37,970 | 110.3 | 90.5 | 3.95x |
| 5.0 | 551 | 91,080 | 165.2 | 144.0 | 3.92x |
| 8.0 | 650 | 125,330 | 192.9 | 162.8 | 4.02x |

Nearly nine times the population and the index is worth the same four. The
creature scan alone offers each creature 0.25–0.28 of the pond whatever the
pond's size, so its cost per creature is proportional to the population and the
tick's is proportional to its **square**. The grid does not make sensing
sub-quadratic; it divides the quadratic by four.

That is not a criticism of the grid — a 4x constant is the difference between
650 creatures at 60fps and 650 creatures at 15 — but it is a different claim
from the one the word *index* carries, and it says where the ceiling is. A pond
of 2,000 would not be four times the work of 500; it would be sixteen.

### The number that sets it is not in `config.js`

The cell is `Math.max(40, config.visionRadius * 0.75)`, written in `world.js`.
`src/levers.js` (v1.38) sweeps every number in `config.js` and asks whether the
world notices; it has never seen this one, because this one is not in the
config. And it is not a performance knob either. With `exactVision` off — the
default — `forEachNear`'s block *is* the definition of what a creature can find
(v1.32), so re-sizing the index runs a different pond. Three hundred ticks from
the default seed:

| cell | grid | block | trajectory |
| ---: | :--- | ---: | :--- |
| `vision * 0.70` = 118 | 8x6 | 18.8% | `2a04b3f7` |
| **`vision * 0.75` = 126** | **8x5** | **22.5%** | **`1054d09a`** |
| `vision * 0.80` = 134 | 7x5 | 25.7% | `b1f042ec` |

Three different worlds. The tuning parameter of the accelerator is a term in
the physics, which is v1.32's finding — the pond's sight was grid-shaped for
thirty-one versions — arriving from the other direction: the shape was fixed by
giving the *radius* a meaning, and the cell size that decides the block is
still a simulation constant that no sweep here can reach.

### The stopwatch, run once, for corroboration

Node 22 on the machine that ran this cycle, seed 314, 4,000 ticks after 200 of
warm-up. Not asserted anywhere — it is here to say whether the work count is
measuring the thing the time is spent on.

| | |
| --- | ---: |
| default pond | ~810 ticks/s |
| `--prof`: the creature scan's callback | 28.7% |
| `step()` itself | 16.5% |
| `nn.js` `forward` — the brains | 15.2% |
| `forEachNear` | 8.9% |
| the food scan's callback | 7.9% |
| **the two neighbour scans, together** | **~46%** |
| every garbage collection, of every kind | **3.6%** |

So the first half of the playbook's sentence holds — the scans are the largest
thing in the tick by a distance — and the second half is now bounded rather
than believed. *Every* allocation the tick makes, closures included, is worth
at most 3.6%, because that is the whole of the collector's time: 278
collections, 190 ms of 5,270. Eliminating the per-query closure entirely cannot
buy what the sentence implies it costs.

And the other number the same instrument gives, which is the one worth having:
`exactVision` offers **42%** more candidates (24,167 against 16,978) and costs
**18%** of the tick rate (622 ticks/s against 759, back-to-back on the same
machine). The
work count and the clock disagree in magnitude and agree in sign, which is what
a corroboration is for.

### What the census will not tell you

Two opt-in rules move the real count away from the prediction, and the module
names both rather than rounding them off:

- **`bodyCollision`** builds a *second* index halfway through the tick, out of
  positions that do not exist when the census is taken. The real count is
  higher, on every tick of a pond with two bodies in it.
- **`deathIsFinal`** cancels the whole turn of a creature killed earlier in the
  same tick, so its scans never happen. The real count is lower — on **8 ticks
  in 2,000** of the default seed, which is a second measurement of v1.45's
  finding that the dead barely act at all.

Both bounds are asserted in `test/workload.test.js`, in the strict direction:
a domain exclusion that has quietly stopped being necessary fails the suite.

### Reproducing it

```bash
node --input-type=module -e '
  import { World } from "./src/world.js";
  import { DEFAULT_CONFIG } from "./src/config.js";
  import { sensingWorkload, indexGeometry } from "./src/workload.js";
  for (const rate of [0.6, 1.2, 1.8, 3.0, 5.0, 8.0]) {
    const w = new World({ ...DEFAULT_CONFIG, foodSpawnRate: rate });
    for (let i = 0; i < 1500; i++) w.step();
    let pop = 0, visits = 0, brute = 0, cv = 0;
    for (let i = 0; i < 2000; i++) {
      const c = sensingWorkload(w);
      pop += c.creatures; visits += c.visits; brute += c.brute; cv += c.byGrid.creature.visits;
      w.step(); }
    console.log(rate, "pop", (pop / 2000).toFixed(0), "visits/t", (visits / 2000).toFixed(0),
      "per creature", (visits / pop).toFixed(1), "narrowing", (brute / visits).toFixed(2) + "x",
      "block occupancy", (cv / pop / (pop / 2000)).toFixed(3)); }
  console.log(indexGeometry(new World(DEFAULT_CONFIG).creatureGrid));'
```

About two minutes, and the dense arms are most of it. The wall-clock rows come
from `node --prof` and `node --trace-gc` over the same script with the census
removed.

## Eighteen pixels, not one hundred and twenty-six (v1.76)

Four comments in this repository stated the reach of a `forEachNear` query as
*one cell*:

> the 3x3 block covers a disc of `cellSize` around the query point, and no more
> — `grid.js`

> covers a guaranteed 126 px (one cell) of the configured 168 — `config.js`,
> beside `exactVision`

> kept under the spatial grid's cell size … so the existing 3x3 neighbour query
> already covers everything in earshot — `config.js`, beside `signalRadius`

> contact tests elsewhere … are far inside one cell, so the plain 3x3 block
> covers them exactly — `world.js`

The guarantee is not one cell. It is **18 px**.

### Why

`cellSize` is `visionRadius * 0.75` = 126, and the world is 900 x 620. Neither
divides: the grid is 8 x 5 with a **stub** column 18 px wide and a stub row of
116. A query point sitting `t` into a cell of width `W` whose neighbours are
`wL` and `wR` wide has the block reaching `t + wL` behind it and `(W − t) + wR`
ahead. At `t = 0` that first term is exactly `wL` — so the promise for the whole
axis is *the narrowest cell on it*, and it is attained rather than approached.

| | |
| --- | ---: |
| columns | 126 x 7, then **18** |
| rows | 126 x 4, then 116 |
| guaranteed reach, x | **18 px** |
| guaranteed reach, y | 116 px |
| guaranteed reach, from anywhere | **18 px** |
| reach from the luckiest standing spot | 189 px |

v1.32 knew this for *sight*: the section above on grid-shaped vision names the
18-px stub, measures the mean share of the vision disc a creature actually
searches at 90.0% and the worst standing spot at 51.1%, and draws the dark band
down one edge of the world. The comment beside the flag that fixes it says 96%
and 86%, which are neither of those numbers. **The correction shipped to the
page a reader reads and not to the file a person editing the constant reads**,
and it stood for forty-three releases. That is v1.30's lesson — a rule has
surfaces too — with the two surfaces inside a single commit.

### The question nobody asked: the contact rules

Blurred sight is an approximation with a switch. A contact rule that cannot see
its own radius is a rule that **does not fire**. There are five in the pond, and
against a promise of 18 px they read:

| rule | reach | expression | margin | query |
| --- | ---: | --- | ---: | --- |
| eating | 11.2 px | `eatRadius + radius * 0.4` | +6.8 | block |
| scavenging | 17.0 px | `radius + scavengeRadius + 6` | +1.0 | block |
| **biting** | **17.273 px** | `radius + prey.radius + 2` | **+0.727** | block |
| **infection** | **22.0 px** | `infectionRadius` | **−4.0** | block |
| shoving | 16.0 px | `radius + other.radius` | exempt | disc |

Three hold and one fails.

The biting row read **18.0 px** and a margin of **+0.0** until v1.83, and the
zero was written up here as a coincidence between two unrelated facts —
`bodyRadiusMax * 2 + 2` is 18.0 because `bodyRadiusMax` is 8.0, and the stub is
18 px because 900 is 7x126 + 18. See *[The pair the rule
forbids](#the-pair-the-rule-forbids-v183)* below: a bite cannot reach 18 px, the
margin is 0.727, and the slack is the refuge.

Shoving is exempt for a reason worth repeating: v1.56 gave `_separate` a
`forEachWithin` query on the stated grounds that *what two bodies touching means
cannot depend on a sight setting*. It is the only contact rule that took that
advice, and it stays exact at any body size.

### The rule that fails, and how much it costs

Infection is the only rule in the pond with a neighbour query of its own —
`_stepDisease` calls `forEachNear` directly rather than through `_scan` — so it
is the only one `exactVision` cannot straighten out. Eating, scavenging and
biting take their candidate from the sense scan, so that flag moves all three
onto a disc query; infection stays block-shaped in every world there is.

The hole is a strip 4 px wide at each side of the seam — 8 px of 900, **0.889%
of standing positions**. Within it only the sliver of the disc past the block is
lost, so the share of *contacts* lost is far smaller. Eight seeds, 3,000 ticks
each, contagion on, counting the neighbours the rule would actually have rolled
a die against (susceptible, not immune, not dead):

| seed | susceptible contacts | lost |
| ---: | ---: | ---: |
| 314 | 6,740 | 1 |
| 1 | 1,754 | 0 |
| 7 | 4,470 | 0 |
| 42 | 5,359 | 6 |
| 99 | 641 | 0 |
| 13 | 1,569 | 0 |
| 51 | 6,021 | 0 |
| 23 | 1 | 0 |
| **total** | **26,555** | **7** |

One roll in 3,800, on two seeds of eight. At `infectionChance` 0.045 that is
about **one infection lost per 80,000 ticks of epidemic** — real, and almost
nothing.

That number is the reason this release does not fix it. The disease query sits
inside the RNG's draw order, so covering the disc adds draws and moves every
world with contagion switched on: nine test files, a curated scenario (`over`,
seed 101), and any permalink anybody has kept. Paying that for one infection in
80,000 ticks is a trade to write down before it is a trade to make — and the
first half of writing it down is knowing the size of it, which nobody did until
now.

### What is pinned

`src/reach.js` computes the guarantee from the cell extents and reads the block
off `grid.nearBounds`, so it cannot drift from the geometry it describes
(v1.32's accelerator rule). `test/reach.test.js` checks it against the real
`forEachNear` by inserting probes rather than by re-deriving anything: a target
at exactly 18 px is found from every position tried, one at 18.5 is missed from
somewhere, and the audit's verdict for each rule is asserted with its margin.
The failing exposure is built by hand at the seam — a host two pixels into
column 0, a susceptible 21 px behind it in column 6 — and confirmed against
`forEachWithin`, so the day the disease scan is corrected, the test says which
behaviour changed.

Reproduce the audit:

```sh
node -e '
  import("./src/reach.js").then(async (R) => {
    const { DEFAULT_CONFIG } = await import("./src/config.js");
    const a = R.contactAudit({ ...DEFAULT_CONFIG, disease: true, scavenging: true });
    console.log(a.cols + "x" + a.rows, "cell", a.cellSize, a.reach);
    for (const r of a.rules) console.log(r.name, r.reach, r.query, r.covered, r.margin);
  });'
```

## A creature can only bite what it has seen (v1.81)

v1.76 asked what the spatial index guarantees and audited every rule against
it. The audit's list of query sites was hand-typed, and closing that lead — the
census is derived from the source now, nine sites, and a query added anywhere in
`src/` fails a test until somebody says which rules ride it — turned up the
thing the list itself had been hiding: **the index is not the only thing between
a rule and its candidate.**

Eating, scavenging and biting have no neighbour query of their own. v1.76 said
so, and read it as a statement about *windows*: they inherit the sense scan's
3x3 block, which `exactVision` can widen into a disc. What they also inherit is
the scan's **answer**. `world.js#step` picks a nearest pellet and a nearest prey
by walking candidates against squared distances that both start at `visionR2`,
and every contact test below runs on those selections. A pellet outside sight is
not eaten however close it is; a creature outside sight is not bitten however
far a bite reaches.

So a carried rule sits behind two constraints:

| | decides | default pond |
| --- | --- | ---: |
| the index | who is *offered* | 18 px |
| the gate | who is *chosen* | 168 px |

(A bite's own reach, the thing both of these have to cover, is 17.273 px — see
below.)

In the pond as it ships the index is far the tighter of the two, which is why
forty-eight releases never noticed the second one: a bite reaches 17.3 px and
sight reaches 168, and those two numbers had never been in the same sentence
because they do not look like the same kind of quantity. One is a rule and one
is a sense.

### Where it binds

Sight is the one radius in this world that shrinks. With the day/night cycle on
it falls to `nightVisionFactor` of itself at midnight, exactly (the cosine
reaches −1), and at that moment the gate is what every carried rule reaches:

| rule | reach | fails below a night factor of |
| --- | ---: | ---: |
| eat | 11.2 px | 0.0667 |
| scavenge | 17.0 px | 0.1012 |
| bite | 17.273 px | **0.1028** |

Nothing that ships is near it. The default is 0.35 (sight 58.8 px at midnight,
a margin of 41.5 px on the bite), and the darkest curated scenario in the
project sets 0.28 (47.0 px). The finding is not a bug; it is that the margin was
never measured, and is not made of what the audit thought it was made of.

`exactVision` does not move any of it. That flag replaces the block with a disc
covering the radius the scan asked for — and in the dark the scan asks for 8.4
px, because that is what sight is. It is a fix for the index, and this is not
the index. There is no flag for the gate, because the gate is not a mistake: it
is the pond saying a predator hunts what it can see.

### The coupling that is not there

The creature scan asks for the widest of sight, earshot and a mate search, and
earshot deliberately does not shrink at night (a voice carries in the dark).
So in a pond with signalling on, that scan offers candidates out to
`signalRadius` = 120 px at every hour of the night, against a sight of 1.68 px
at a night factor of 0.01 — a seventyfold wider offer. It reads exactly like
predation being carried through the dark by other creatures' voices, and there
was a paragraph written about it here.

The gate throws every one of those candidates away. Prey is chosen against
`visionR2` and nothing else, so the bite's coverage in that pond is 1.68 px with
voices and 1.68 px without. v1.20's rule — build the control before the
narration — arriving before the release note this time rather than after it.
The widening is real and it is not about the bite; it is pinned as a negative
result in `test/reach.test.js`.

### What is pinned

The census, both directions: every neighbour query in `src/` is declared and
every declaration is a query, with the scanner's domain (receivers, not prose)
checked on a synthetic module. Every rule rides a declared site and every site
of the pond carries a rule. The gate's floors are computed for each rule in both
arms. And the failure is staged in the pond rather than argued from arithmetic:
one carnivore, one small neighbour half a pixel inside its jaws, unbitten at
midnight and eaten at noon with nothing else changed.

```sh
node -e '
  import("./src/reach.js").then(async (R) => {
    const { makeConfig } = await import("./src/config.js");
    const cfg = makeConfig({ dayNightCycle: true, nightVisionFactor: 0.08, scavenging: true });
    for (const r of R.contactAudit(cfg).rules) {
      console.log(r.name, "reach", r.reach, "offer", r.offer, "gate", r.gateAt, "binds", r.binds, r.covered);
    }
  });'
```

## The pond runs a quarter of a year behind (v1.78)

v1.74 drew the season on the population chart and measured what it does with
the cheapest statistic available — the mean of the winter halves against the
mean of the summer halves. The crop came back 40.4% thinner in winter on twelve
seeds of twelve. The population came back lower in winter on seven of those
twelve, which reads as *the season moves the food and not the animals*, and the release note said so while
writing down, in the same paragraph, why it could not:

> a half-period mean cancels a quarter-period lag **exactly**, and a consumer
> tracking a resource that winters is the textbook delayed response.

That is not a caveat. It is a hole with a shape, and the shape says where to
look. The population of this pond peaks a **median of 632 ticks** after the
food-spawn rate does — 0.243 of a 2,600-tick year, which is a quarter period to
within one part in twenty-five, sitting in the one place the previous
instrument is blind by construction.

### The instrument

`src/seasonlag.js`. The reference is not another measured series: this world's
year is `sin(2πt / seasonLength)`, a pure function of the tick with no state and
no randomness in it, so a series can be projected straight onto it.

Fit `value ≈ intercept + slope·i + a·sin(ωt) + b·cos(ωt)` over the whole record
at the season's own frequency, and read three things off the fit:

| | |
| --- | --- |
| **lag** | `atan2(−b, a) / ω`, wrapped into ±half a year. Positive is *behind*. |
| **swing** | `hypot(a, b)` over the series' mean — how far it moves with the year. |
| **r** | Pearson between the detrended series and the season at that lag. |

Three things about it are worth stating, because each was a decision:

**The line is part of the fit, not something removed first.** Over a window
that is not a whole number of years the season is correlated with a straight
line, so subtracting the best-fit line takes a bite out of the sinusoid too.
Detrending and *then* reading the phase is out by 13 ticks on a synthetic pond
made of nothing but a season; on a pond that is also growing, at a slope of one
creature per twenty ticks, it is out by **576**. The fit is exact for a line
plus a sinusoid; the test pins both the fix and that failure.

**The closed form is checked against the search it replaces.** A grid over lags
is what a cross-correlation normally means, and the phase is a shortcut —
v1.32's rule is that a shortcut is an assertion of equivalence, and one nothing
checks is a claim nothing checks. `correlogram()` is the brute-force curve and
the two agree to within one grid step on a noisy synthetic series.

**A world with no seasons returns `null`, not a small number.** The reference is
a constant there, so the answer is not "weakly correlated", it is that the
question has no subject. That is the exact structural zero v1.20 asks for.

### Twelve seeds, 20,000 ticks

Full-resolution series (one sample per 4 ticks), first year discarded as
warm-up. `split` is v1.74's winter-half-against-summer-half statistic, in
percent, for the same run.

| seed | pop lag | pop r | pop swing | pop split | food lag | food swing | pop − food |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 314 | 499 | 0.990 | 30.8% | −12.0% | −298 | 30.7% | 797 |
| 7 | 636 | 0.958 | 27.2% | −0.3% | −217 | 46.4% | 853 |
| 21 | 885 | 0.711 | 21.5% | +18.1% | −68 | 39.0% | 953 |
| 42 | 627 | 0.942 | 21.8% | −1.3% | −201 | 34.6% | 828 |
| 51 | 583 | 0.987 | 27.8% | −4.5% | −253 | 32.9% | 837 |
| 77 | 555 | 0.985 | 31.1% | −7.4% | −256 | 43.6% | 812 |
| 99 | 679 | 0.897 | 20.6% | +2.8% | −181 | 38.0% | 860 |
| 128 | 743 | 0.620 | 21.7% | +8.8% | +24 | 39.8% | 719 |
| 256 | 576 | 0.969 | 26.1% | −5.6% | −256 | 38.6% | 831 |
| 512 | 803 | 0.798 | 25.8% | +13.5% | −38 | 44.6% | 840 |
| 1024 | 537 | 0.988 | 27.6% | −8.1% | −268 | 32.3% | 805 |
| 2026 | 798 | 0.541 | 18.0% | +9.5% | −141 | 15.9% | 939 |
| **median** | **632** | **0.950** | **26.0%** | **−0.8%** | **−209** | **38.3%** | **834** |

Read across one row and the two instruments are looking at the same run. Seed 7:
its population tracks the year at r = 0.96, swinging 27% of its own mean, and
v1.74's split calls it **−0.3%** — nothing at all. Seed 21 is worse than
nothing: the split reads **+18.1%**, *more* creatures in winter, on a pond whose
population is a clean seasonal wave 885 ticks behind the sun.

Three findings the table carries:

**The pond is behind on 12 of 12 seeds**, 499–885 ticks, and the sign test the
split cannot pass is trivial here. The half-split's own sign count on the same
runs is 7–5, which is a coin.

**The standing crop is *ahead* of the year on 11 of 12** (median −209 ticks),
and that is not a paradox. A stock rises while inflow beats outflow, so it turns
over at the crossing rather than at the inflow's peak, and the outflow — the
eating — is the thing that is late. So the population trails the standing crop
by a median of **834 ticks**, a third of a year, on 12 of 12.

**Nobody has to average over the year to see this.** The lag is the whole reason
the pond looks alive: the crop recovers first, the animals follow, and the
overshoot they arrive with is what makes the next winter bite.

### The control, and what it changed about the readout

The same twelve seeds with `seasons: false`, asked about a year they do not
have. (The module refuses this by design; the control has to reach around it
with a season-bearing config, which is the point of a control.)

| | with a year | with none |
| --- | ---: | ---: |
| pop r at 20,000 ticks | 0.54 – 0.99 | 0.11 – 0.39 |
| pop swing at 20,000 ticks | 18.0% – 31.1% | 0.7% – 6.1% |
| v1.74's pop split, range | −12.0% – +18.1% | −2.2% – +9.2% |
| v1.74's food split, range | −48.0% – −22.2% | −21.8% – +0.2% |

Two things fall out of the right-hand column, and neither was what I went
looking for.

**`r` is not the separator, and I had assumed it would be.** At the run lengths
this ships at, a pond with no seasons correlates with a year it cannot feel at
up to **r = 0.62** (seed 51, three years of record) — because the pond has oscillations of
its own and one of them lands near 2,600 ticks. What a seasonless pond cannot do
is *move*: its population swings **0.7%–8.0%** of its mean at every span the
instrument will answer at, against 18.0%–31.1% with a year in it. So the bar the
page reports through (`MIN_SWING`, 0.15) is an amplitude and `r` rides along as a
description. A correlation says how *tidy* a relationship is; only an amplitude
says whether there is one.

**v1.74's own null is not zero.** The crop being 40.4% thinner in winter is real
in the median — the seasonal arm runs −22.2% to −48.0% and the seasonless one
−21.8% to +0.2% — but one seasonless seed reads **−21.8%**, inside the seasonal
range, and a seasonless *population* reads **+9.2%**. A half-split of a pond
with internal cycles is noisy in exactly the units the finding was reported in,
and v1.74 quoted a twelve-of-twelve sign count without one. The number stands;
the confidence it was written with does not.

### When the readout can answer

The estimate needs whole years, and the panel needs to know how many before it
says anything. Measured against each seed's own 20,000-tick answer, from the
thinned whole-run archive the page actually reads:

| record spans, past the warm-up | worst error | median error |
| --- | ---: | ---: |
| 2 years | 256 ticks | 30 ticks |
| 3 years | 124 ticks | 25 ticks |
| 4 years | 45 ticks | 9 ticks |
| 5 years | 22 ticks | 4 ticks |

Three is where the curve flattens, so `minYears` is 3 and the `Lag ⏳` tile is
`…` until about tick 10,500 — a wait stated rather than filled in, because a
number the record cannot support is v1.22's always-full buffer with a clock on
it.

And the archive is enough: at 20,000 ticks its answer (one point per 128 ticks,
min/max envelopes discarded) differs from the full-resolution series by −6 to +3
ticks across the twelve seeds. The thinning that v1.22 built to protect the
peaks turns out to preserve a phase as well, which is not obvious and is
therefore a test.

### Reproducing it

```sh
node -e '
  const N = 20000;
  Promise.all([import("./src/world.js"), import("./src/config.js"),
               import("./src/seasonlag.js")]).then(([W, C, L]) => {
    for (const seed of [314, 7, 21, 42, 51, 77, 99, 128, 256, 512, 1024, 2026]) {
      const cfg = C.makeConfig({ seed });
      const w = new W.World(cfg);
      const rows = [];
      for (let t = 0; t < N; t++) {
        w.step();
        if (w.tick % 4 === 0) rows.push({ tick: w.tick, pop: w.creatures.length,
                                          food: w.food.items.length });
      }
      const p = L.seasonLag(rows, "pop", cfg), f = L.seasonLag(rows, "food", cfg);
      console.log(seed, "pop", p.lag.toFixed(0), "r", p.r.toFixed(3),
                  "swing", (p.swing * 100).toFixed(1) + "%",
                  "| food", f.lag.toFixed(0), "| behind food", (p.lag - f.lag).toFixed(0));
    }
  });'
```

Swap `seasons: false` into `makeConfig` and pass `C.makeConfig({ seasons: true })`
as the config argument to `seasonLag` for the control arm.

## Nine ponds of twelve are the same pond with the rule on (v1.80)

Kin recognition shipped in v1.10: a predator whose target is within
`kinRecognitionDistance` = 0.05 of its own genome declines to treat it as prey.
It has a unit test, a permalink parameter and a checkbox. For **sixty-nine
releases it had no readout of any kind** — no tile, no sentence, no chronicle
line, nothing on the canvas. That is not an oversight of the same size as the
others this project has closed, because of *where* the rule lives: it takes
effect inside a hunter's senses, so a spared relative is never approached, never
bitten and never marked. A pond where the rule fires constantly and a pond where
it has never once been offered a relative look identical, and until now they
also *read* identical.

v1.38 knew the second world existed — it measured 8.2 million eligible pairs on
seed 23 and zero sparings on seed 314 — and wrote it into this file as a
paragraph. A paragraph is not an instrument. `world.stats.kinSpared` is: it
rises on the tick a hunter turns down a relative it could have eaten, it is
exactly 0 in every pond that leaves the flag alone, and the `Kin 👪` tile shows
the run's total beside its rate because *has this rule ever spoken here?* and
*is it speaking now?* are different questions.

### What the counter counts

The creature scan already asks `c.canEat(o)` of every neighbour nearer than the
best prey found so far. `canEat` is now the size-and-diet test *and not kin*;
`sparesKin` is the same test *and* kin, so the two partition exactly the meals
the diet and the bodies allow, and the counter increments on the second. It is
asked only where `canEat` has already said no and only where the flag is on, so
a default pond pays one boolean test per candidate and no genome distance at
all.

It counts *candidates nearer than the best so far*, not every relative in the
block. The alternative is a genome distance against every neighbour, and what it
would buy is a tally of kin a hunter was ignoring in favour of a closer stranger
it was ignoring too.

### Twelve seeds, 20,000 ticks, both arms

| Seed | Spared | First at | Peak rate | Kills off → on | Mean pop off → on | Trajectory hash |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **0** | — | — | 30 → 30 | 198.5 → 198.5 | **identical** |
| 5 | **0** | — | — | 15 → 15 | 266.3 → 266.3 | **identical** |
| 7 | 86 | t2,055 | 57.5/100t | 298 → 197 | 181.1 → 175.7 | differs |
| 11 | **0** | — | — | 58 → 58 | 285.4 → 285.4 | **identical** |
| 13 | **0** | — | — | 16 → 16 | 244.2 → 244.2 | **identical** |
| 23 | 19,598 | t4,910 | 798.3/100t | 265 → 389 | 209.6 → 185.5 | differs |
| 42 | **0** | — | — | 122 → 122 | 240.5 → 240.5 | **identical** |
| 64 | **0** | — | — | 8 → 8 | 302.9 → 302.9 | **identical** |
| 101 | **0** | — | — | 14 → 14 | 229.0 → 229.0 | **identical** |
| 314 (the landing page) | **0** | — | — | 30 → 30 | 206.9 → 206.9 | **identical** |
| 512 | 8,800 | t1,983 | 300.0/100t | 362 → 303 | 189.6 → 173.1 | differs |
| 777 | **0** | — | — | 164 → 164 | 173.9 → 173.9 | **identical** |

Nine of twelve never spare a single relative in 20,000 ticks, and the right-hand
column is the sharper form of that: a rule that never fires draws nothing and
perturbs nothing, so those nine ponds are not *similar* to their controls, they
are the **same world, hash for hash**. The flag is not quiet in nine ponds of
twelve. It is a no-op.

Which world you get is the one v1.38 named: a pond that splits into predator and
prey lineages offers the rule nothing to spare, because the hunters were never
related to what they hunt, while a pond that stays largely clonal and eats itself
offers it a great deal. The three that fire do so hard — seed 23 spares nineteen
thousand meals and touches 798 per hundred ticks — and they start early, between
t1,983 and t4,910, so the transition is a property of the founding population's
fate rather than a slow accumulation.

`test/kinRecognition.test.js` pins seed 314's row with the shared bit-for-bit
assertion. It is a contingent fact, deliberately: if a future change makes the
landing page's pond spare so much as one relative, that test fails, and the
character of the world every screenshot is taken from will have changed.

### What the three firing seeds do *not* show

The tempting sentence is next door: sparing family lowers the kill count by a
third on seed 7. The control kills it.

Arm three declines meals at random — `canEat` says no to a fraction *p* of the
targets it would otherwise allow, drawn from a private generator so the world's
own stream is untouched — with *p* set to the kin arm's own refusal rate.

| | Kills | Diversity |
| --- | --- | --- |
| **Seed 7**, rule off | 298 | 0.293 |
| kin (86 refusals, p = 1.1 × 10⁻⁴) | 197 | 0.191 |
| random, three draws | 270 / 137 / 361 | 0.173 / 0.187 / 0.205 |
| **Seed 23**, rule off | 265 | 0.573 |
| kin (19,598 refusals, p = 2.4 × 10⁻³) | 389 | 0.409 |
| random, three draws | 15 / 120 / 518 | 0.246 / 0.178 / 0.128 |
| **Seed 512**, rule off | 362 | 0.319 |
| kin (8,800 refusals, p = 5.0 × 10⁻³) | 303 | 0.676 |
| random, three draws | 684 / 274 / 290 | 0.238 / 0.187 / 0.294 |

On all three seeds the kin arm's kill count sits **inside** the scatter of the
random arm. Eighty-six flipped decisions in three quarters of a million
reorganise seed 7 by more than the rule's own effect can be told apart from, and
on seed 23 the random arm reaches both 15 kills and 518 against a control of
265. So the tile reports what the rule **did**, and this file declines to say
what it **caused** — which is not a failure of the measurement but what a
chaotic pond does to any between-arms comparison at n = 3, and the same trap
v1.20's alarm call fell into.

**One column does not behave, and it is left as a lead.** On seed 23 and seed
512 the kin arm's diversity is higher than *all three* random draws (0.409
against 0.246 / 0.178 / 0.128; 0.676 against 0.238 / 0.187 / 0.294), and on seed
7 it is inside them. Two seeds of three, three draws each, and the two disagree
about the sign relative to their own controls — that is a lead and not a
finding, and it is worth stating only because it has a mechanism attached that
could be tested directly: an arbitrary refusal spares whoever happens to be
near, while this one spares a *family*, and a rule that systematically protects
relatives is the one perturbation of this size that is not neutral with respect
to who is related to whom. The measurement that would settle it is not more
seeds of this comparison but a within-run one — the genetic distance between a
hunter and the pond it hunts in, in both arms.

One methodological note worth keeping. The random arm is matched on the
*rate*, and the rate is the only thing that can be matched: on seed 23 the kin
arm's senses answered "edible" 8,112,248 times over the run and the random arms'
answered between 181,527 and 2,477,329, because a pond that loses its hunters
early stops generating the pairs the rate applies to. **A perturbation's size
cannot be held fixed in a world that reorganises around it** — the target
count and the delivered count differed by fifty-fold here.

### Reproducing it

```bash
node --input-type=module -e '
import { World } from "./src/world.js";
import { makeConfig } from "./src/config.js";
import { trajectoryFingerprint } from "./src/fingerprint.js";
for (const seed of [7, 23, 314, 512]) {
  const arms = [false, true].map((kin) => {
    const w = new World(makeConfig({ seed, kinRecognition: kin }));
    for (let i = 0; i < 20000; i++) w.step();
    return w;
  });
  console.log(seed, "spared", arms[1].stats.kinSpared,
    "kills", arms[0].stats.kills, "->", arms[1].stats.kills,
    trajectoryFingerprint(arms[0]) === trajectoryFingerprint(arms[1]) ? "IDENTICAL" : "differs");
}'
```

## The pair the rule forbids (v1.83)

v1.76 audited every contact rule against the spatial index's real guarantee of
18 px and reported one row that held **by exactly nothing**:

> A bite reaches `bodyRadiusMax * 2 + 2`, which is 18.0 because `bodyRadiusMax`
> is 8.0 — and the stub is 18 px because 900 is 7x126 + 18. Those two numbers
> have never been in the same sentence before this one, and the correctness of
> predation's contact test is currently resting on their coincidence.

It is not resting on a coincidence, because **a bite cannot reach 18 px**.

### Where the number came from

`radius + prey.radius + 2` is a distance between two bodies, and `contactRules`
maximised it the obvious way: put both bodies at `bodyRadiusMax`. But the line
that computes that reach lives inside a branch:

```js
if (d2 < preyD2) { if (c.canEat(o)) { preyD2 = d2; prey = o; } }   // world.js
...
} else if (cfg.predation && !preyTarget.dead) {
  const reach = c.radius + preyTarget.radius + 2;                  // world.js
```

and `canEat` (via `_edible`) requires

```js
this.radius > other.radius * this.config.preySizeRatio             // creature.js
```

— strictly. Two bodies both at 8.0 px fail that test: 8.0 is not greater than
8.0 x 1.1. The pair the audit maximised over is the exact pair predation exists
to refuse, so the number was the maximum of a set with the answer removed from
it.

### What it actually is

Maximise `self + other + 2` subject to `self > other * preySizeRatio` and both
bodies inside `[bodyRadiusMin, bodyRadiusMax]`. The expression rises in both
arguments, so the answer sits at the largest admissible pair: `self` at
`bodyRadiusMax`, and `other` approaching `bodyRadiusMax / preySizeRatio`.

| | value |
| --- | ---: |
| published by v1.76 and v1.81 | 18.0000 px |
| supremum over admissible pairs | **17.2727 px** (open) |
| largest ever offered by a pond | **17.2200 px** |
| margin against the index's 18 px | **+0.727** |

The bound is *open*: the size test is `>` and not `>=`, so a prey may approach
`bodyRadiusMax / preySizeRatio` and never be it. The third row is the empirical
check — twelve seeds, 3,000 ticks each, **36,416,658 eligible pairs**, every
living pair tested with `canEat` itself. The widest bite any of those ponds ever
offers is 17.2200 px, five hundredths under the bound and nearly eight tenths
under the number this document published.

### The slack has a name

`bodyRadiusMax - bodyRadiusMax / preySizeRatio` = 8.0 - 7.2727 = **0.7273**, and
`bodyRadiusMax / preySizeRatio` is the **refuge radius** (v1.64) — the size above
which nothing this world can grow is able to eat you. So the margin keeping
predation's contact test inside the index's promise *is* the refuge. The rule
that switches the arms race off partway up the size range is the same rule that
keeps the bite answerable, which is a real relationship between two constants
where v1.76 saw an accident between two others.

### The class, swept

The same question of all five contact rules — *is the reach maximised over a
pair the rule's own precondition admits?*

| rule | bodies read | precondition | supremum |
| --- | ---: | --- | --- |
| eating | 1 | none | attained |
| scavenging | 1 | none (a corpse's size is not in the expression) | attained |
| **biting** | **2** | **`radius > prey.radius * preySizeRatio`** | **open, 17.273** |
| infection | 0 | none | attained |
| shoving | 2 | none — `_separate` shoves whatever overlaps | attained, 16.0 |

Exactly one row was wrong. Shoving is the control that makes the point: it also
reads two bodies, it also has no query problem, and because nothing constrains
the pair its corner *is* admissible and its 16.0 px is a reach the pond really
takes.

### What is pinned

`contactRules` no longer types any reach by hand. Each rule declares the
expression `world.js` writes (`at`), how many body radii it reads (`bodies`), and
where the second one stops (`otherMax`); the supremum is derived, and `open` says
whether it is ever taken. Three tests hold it:

- **the sweep** walks a 400-step grid of radii for every contact rule, applies
  the rule's own predicate written out from `creature.js` and `world.js` rather
  than from the declaration under test, and asserts both halves — nothing
  admissible above the declared number, and something admissible within one grid
  step of it. A rule added later with a typed-in reach fails here.
- **the staged pair** builds two 8.0-px creatures, asserts their sum is the 18.0
  the old audit took, and asserts `canEat` refuses them; then walks a prey
  across `bodyRadiusMax / preySizeRatio` half a thousandth at a time and shows
  the bound is the rule rather than a rounding.
- **the pond** runs seed 314 with predation and tests every living pair with
  `canEat`, asserting none reaches the bound, that the widest comes within a
  pixel of it, and that none reaches 18.

### Reproducing the 36-million-pair sweep

```bash
node --input-type=module -e '
import { World } from "./src/world.js";
import { DEFAULT_CONFIG } from "./src/config.js";
const B = DEFAULT_CONFIG.bodyRadiusMax, P = DEFAULT_CONFIG.preySizeRatio;
let max = 0, pairs = 0;
for (const seed of [314, 77, 51, 7, 13, 23, 45, 99, 512, 1, 2, 3]) {
  const w = new World({ ...DEFAULT_CONFIG, seed });
  for (let t = 0; t < 3000; t++) {
    w.step();
    const live = w.creatures.filter((c) => !c.dead);
    for (const c of live) for (const o of live) {
      if (c !== o && c.canEat(o)) { pairs++; max = Math.max(max, c.radius + o.radius + 2); }
    }
  }
}
console.log("quoted", B * 2 + 2, "supremum", B + B / P + 2, "observed", max, "over", pairs);'
```

### The lesson

v1.64 found that the control for *who gets picked* is the hunter's eligible set
and not the pond: predation takes bodies 1.448 px smaller than the population,
and against the mean of each hunter's own legal targets the gap is −0.092. This
is the same substitution one level down, and the reason five releases of audit
walked past it is that the quantity was a **reach** rather than a statistic — a
distance reads as geometry, and geometry reads as something a precondition
cannot touch. Whenever a rule's reach is a function of two objects, ask whether
the rule lets both of them be extreme.

## The safe half of the list (v1.84)

`test/colourliterals.test.js` (v1.61) reads every colour named outside
`palette.js` and demands a reason beside each one. Its list has two halves. The
top half is *marks the audit has still never measured*, and it is empty as of
v1.79 — six entries struck off, five of which were hiding a mark that failed.
The bottom half is **furniture**: "no distinction to carry, and nowhere for one
to live". Nothing on the bottom half had ever been measured, because that is
what the heading means.

The pond's selection ring — the circle around whatever creature a watcher has
clicked — was on the bottom half, drawn in `rgba(255, 255, 255, 0.8)` since
v1.0.

### The measurement

The domain is `visionBackgrounds()`, the same 4,388 colours the vision overlay
is audited against: every ground rock can border, the glow-lit water either
epidemiological mark sits on, and every opaque body this pond can paint, each
under all four vision models.

| the selection ring | worst ΔE | under the bar (25) | under the JND (2.3) |
| --- | ---: | ---: | ---: |
| `rgba(255, 255, 255, 0.8)`, as shipped | **0.00** | 51.8% | **21.76%** |
| the same white, opaque | **0.00** | — | **21.24%** |
| white over a near-black rim, cased | **48.9** | 0% | 0% |

The failure is not a handful of unlucky grounds; it is arithmetic. A creature's
body is `hsl(hue, 60 + 25·signal, 45 + 45·energy)` and `render.js` lays the same
hue over it as an additive glow, so a well-fed creature under its own light is
very nearly white — and white over white is nothing. The second row is the one
that decides the fix: raising the opacity buys 0.5 percentage points, because
the ceiling is the colour and not its strength.

The cased pair scores higher than any other two-tone mark measured here (the
minimap's, 48.2; the refuge line's, 44.6; the vision overlay's, 38.3 — each on
its own background set). That is not craft. White and near-black are the two
ends of the one axis all four vision models agree about, so a neutral mark is
the easiest thing there is to case; every other pair in this project has to pick
a hue and live with what a dichromat does to it.

### What the finding is about

Not the colour. The entry excusing this mark read "no distinction to carry", and
the ring carries the only distinction on the canvas that is about the **watcher**
rather than about the world. Every other mark says what a creature *is* — this
one hunts, this one is ill, this one is beyond the size rule. This one says
*this is the one you asked about*.

v1.70 left the general form after the vision overlay, which was skipped for six
releases because its own list entry called it "a rule rather than a mark": the
descriptions on that list are guesses, so check the classification before
trusting what follows from it. v1.79 said the same thing about a different
noun. This is the first time the mis-filing was the *heading* rather than the
entry — and the heading is load-bearing, because it is the reason nobody looks.

### Reproducing it

```bash
node --test test/palette.test.js
```

Three tests hold it: the cased pair clears `MIN_DELTA_E` on every background,
the old white is pinned as a failure on all three rows above (so the suite goes
red if anyone puts the single tone back), and the trail's fade is asserted to be
a **width** rather than an opacity — the whole point being that a translucent
mark's legibility depends on a background it does not control, which is what the
first row measures.

## The delay is what an integral does (v1.86)

v1.78 built the phase instrument and pointed it at `pop` and `food`. Its own
closing note said so — *the instrument is pointed at exactly two series* — and
filed the rest as coverage: twenty-odd columns, two of them asked. That reading
was wrong in a way worth writing down. The rest of a history point is eighteen
cumulative counters, and a counter is not another series of the same kind. It is
a running **total**, kept that way because differencing two samples of a total is
exact under any amount of the archive's thinning (v1.22), and a total is the
*integral* of the thing it counts.

Integrating a sinusoid does two things to it. It divides the amplitude by ω —
here, by 2π/2600, so a swing that is 30% of a rate's mean becomes about 1% of the
growing total's — and it shifts the phase by a quarter period. So the instrument
did not decline to answer about the counters. It answered, and the answer was
650 ticks late with a swing under the bar, which reads on a panel as *nothing
here*.

`seasonlag.js` now classifies every column (`SERIES`) and differences a flow
before it fits, stamping each rate at the **midpoint** of the samples it came
from: a mean over a window is a boxcar, a boxcar is symmetric about its own
centre, so the archive's widest spacing costs the swing 0.4% and the phase
exactly nothing.

### The quarter period is measurable, not just derivable

Twelve seeds, 20,000 ticks, whole-run archive, first year discarded. For each
counter, the phase of its **rate** against the phase of its **running total**,
per seed, wrapped into one year:

| counter | shift, total − rate (12 seeds) | median | predicted |
| --- | ---: | ---: | ---: |
| `births` | 622 … 834 | 655 | 650 |
| `energy_crop` (what feeding mints) | 493 … 654 | 644 | 650 |
| `energy_metabolism` | 477 … 689 | 654 | 650 |
| `deaths_starvation` | 584 … 735 | 648 | 650 |

And the cost of getting it wrong is not that the number is late — it is that
there is no number. Of **152** total-readings across the eighteen counters and
twelve seeds, **8** clear the `MIN_SWING` bar; of the 208 rate-readings, 184 do.

### What follows the year, and when

Circular means across the twelve seeds (a plain mean is meaningless on a phase),
with `R` the resultant length — 1 is twelve seeds agreeing exactly, 0 is
scatter. The control column is the same statistic on twelve **seasonless** ponds
asked about a year they do not have. Positive is *behind*.

| column | kind | lag | across seeds | median r | R | control R |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `energy_crop` — feeding | flow | **+79** | 30 … 214 | 0.98 | 0.99 | 0.29 |
| `births` | flow | **−5** | −130 … 160 | 0.87 | 0.97 | 0.30 |
| `food` — standing crop | level | −182 | −299 … 35 | 0.88 | 0.97 | 0.47 |
| `energy_standing` | level | +437 | 309 … 605 | 0.98 | 0.97 | 0.19 |
| `energy_metabolism` | flow | +636 | 502 … 791 | 0.96 | 0.97 | 0.46 |
| `pop` | level | +658 | 499 … 883 | 0.95 | 0.96 | 0.38 |
| `deaths_starvation` | flow | ±1300 | antiphase | 0.81 | 0.95 | 0.39 |
| `deaths_age` | flow | −1105 | −1280 … −857 | 0.49 | 0.96 | 0.18 |
| `energy_buried` | flow | −1115 | −1285 … −827 | 0.43 | 0.96 | 0.28 |
| `kills` = `deaths_predation` | flow | +263 | −487 … 1052 | 0.16 | 0.59 | 0.30 |
| `energy_spilled` | flow | +1059 | scattered | 0.31 | 0.57 | 0.04 |

(`pop`'s circular mean is 658 where v1.78 reported 632. Same twelve numbers: 632
is their plain median, which this table cannot use because a phase near the wrap
has no median. The instrument has not moved.)

**The pond's famous delay is arithmetic, and it is the same arithmetic as the
bug above.** The birth rate is *in phase with the year* — circular mean −5
ticks, twelve seeds agreeing at R = 0.97 — and a population is the integral of
its births. Per seed, `pop` lag minus `births` lag is 612, 624, 629, 636, 651,
659, 660, 670, 677, 687, 687, 765: twelve of twelve within a fifth of a period of
**650**. v1.78 wrote "the lag is a number and not a mechanism — nothing says why
632 and not some other delay". The mechanism was in the estimator's own algebra
the whole time. Nothing in this pond waits 632 ticks to react to anything; the
animals respond immediately, and a stock that responds immediately still peaks a
quarter of a year late.

**Old age is the birth rate delayed by one lifetime.** `maxAge` is 4,200 ticks,
which is 1,600 past a whole year, so a cohort born at the year's peak should die
of age 1,600 ticks later — a predicted phase of −1,005 against a measured
**−1,105** (R = 0.96 on twelve seeds). The residual is 100 ticks, about 4% of the
year, and it has an obvious unmeasured candidate: surviving to `maxAge` is
itself seasonal, so the filter between the two rates has a phase of its own.

**Starvation is the year's other half.** Its rate peaks half a year from the
food peak on all twelve seeds — which is the one row here that anybody would
have guessed, and is worth having because it is the row that says the instrument
is pointed at the world and not at itself.

**Predation is the process with no year in it.** `kills` scatters over 1,539
ticks of the 2,600-tick year, its per-seed correlations are 0.06–0.29, and the
seasonless control's are 0.09–0.31 — the same range. Two of the twelve seeds
evolve no hunting at all and return no reading. This is the v1.21 finding in a
new instrument: the arms race the default seed was chosen to show, and that the
README opens with, is the one major process in this pond that the year does not
touch. Everything else — feeding, breeding, metabolism, starving, ageing — is on
the clock.

### The gate does not survive the crossing

v1.78's bar is a **swing**, and the reason was measured: a seasonless pond
correlates with a year it does not have at up to r = 0.62, so `r` cannot gate,
while a seasonless *population* barely moves. On a rate that reverses. Across
these twelve seasonless ponds the fitted rate swings run from 0.2% to 1,601% of
their own means — seasonless `energy_spilled` swings a median 83.0% — and the
seasonal arm's counters swing 19.9%–106.6%. The control's range contains the
treatment's, so no bar on this statistic separates them, and `readable()` now
returns `null` for a flow rather than pretending otherwise. The twelve-seed
agreement in the table above *does* separate them (R ≥ 0.95 against ≤ 0.47), and
it is not a statistic one pond can compute, which is why nothing on the page
reads a rate.

### Reproducing it

```sh
node -e '
  const N = 20000, SEEDS = [314, 7, 21, 42, 51, 77, 99, 128, 256, 512, 1024, 2026];
  Promise.all([import("./src/world.js"), import("./src/config.js"),
               import("./src/seasonlag.js")]).then(([W, C, L]) => {
    for (const seed of SEEDS) {
      const cfg = C.makeConfig({ seed });
      const w = new W.World(cfg);
      for (let t = 0; t < N; t++) w.step();
      const rows = w.stats.runHistory.series();
      const out = [];
      for (const f of ["pop", "births", "deaths_age", "kills", "energy_crop"]) {
        const r = L.seasonLag(rows, f, cfg);          // rate for a flow
        const t = L.seasonLag(rows, f, cfg, { kind: "level" }); // read as a total
        out.push(`${f} ${r ? r.lag.toFixed(0) : "-"}` +
                 (L.SERIES[f] === "flow" ? ` (total ${t.lag.toFixed(0)})` : ""));
      }
      console.log(seed, out.join("  "));
    }
  });'
```

Pass `C.makeConfig({ seed, seasons: false })` to the world and the seasonal
config to `seasonLag` for the control arm.

```bash
node --test test/seasonlag.test.js
```

Six of its tests are this release: the classification table checked against a
real history point in both directions, the quarter-period error pinned beside
its fix, the boxcar's `sinc` attenuation against a closed form, the flows that
are allowed to run backwards (a starved creature is buried holding a small
negative, so `energy_buried` walks back a few hundred times a run), the absences,
and `readable()` declining a flow.

## A reach is not a number (v1.90)

v1.83 audited the five contact rules and closed with a sentence nobody had
followed up: **three of the five reaches are circles and two are bands.** A rule
whose distance expression reads one body fires at one distance; a rule that reads
two — a bite (`radius + prey.radius + 2`), a shove (`radius + other.radius`) —
fires at a distance that depends on the animal it meets, and no single number
describes it. This release draws them, which meant first computing them, and the
computation is `ruleSupremum` with `bodyRadiusMax` replaced by *this* body:

```
inner = at(radius, bodyRadiusMin)     the reach against the smallest body there is
outer = at(radius, otherMax(radius))  the reach against the largest the rule admits
```

`otherMax` is the rule's own precondition, so for a bite it is
`min(bodyRadiusMax, radius / preySizeRatio)` — v1.83's correction, one argument
down. Both edges come from `contactRules`, which means the overlay cannot
disagree with the audit without a test failing first.

### The band is not a technicality

Twelve seeds, 3,000 ticks each, the pond sampled every tenth tick, default
config with `predation` on:

| | |
| --- | --- |
| bodies sampled | 421,843 |
| mean bite band | **2.70 px** wide — 12.32 out to 15.01 |
| as a share of the far edge | **18.0%** |
| eligible hunter–prey pairs in contact range | 1,240 |
| …of those, beyond the inner ring | **30.2%** (0%–53% by seed) |

Every figure here is pooled over bodies rather than averaged over seeds, which
matters for the last row: a pond that never grows a hunter contributes no
contacts and no opinion.

So in nearly a third of the moments when a hunter is close enough to eat
something it is allowed to eat, the answer depends on how big that something is —
a single circle drawn at the guaranteed reach would be the wrong picture a third
of the time, and one drawn at the supremum would be wrong the other two thirds.

The count is of *geometric opportunity*, not of bites: `world.js` attacks the
nearest prey it can see and chooses whether to, so a pair inside contact range is
a pair the rule could fire on rather than one it did.

### The other band, and why the arms are not comparable

The shove is the control v1.83 used and it works here too: it reads two bodies
with no predicate at all, so its band runs the full body range. With
`bodyCollision` on, **98.6% of 75,738 overlapping pairs** sit beyond its inner
ring — a rule whose reach is almost entirely inside the band.

That arm also moves the bite's number, to **56.5%** of 1,335 contacts, because
bodies that push each other apart meet at wider distances. It is the same warning
v1.80 wrote down: a perturbation's size cannot be held fixed in a world that
reorganises around it, so the two numbers are two ponds rather than one pond
measured twice.

### The reach that is empty

Below `bodyRadiusMin * preySizeRatio` = **3.85 px** a creature has no admissible
prey at all: the largest body it is allowed to eat is smaller than the smallest
body this world grows. That is not a hypothetical — **2.26%** of the
421,843 bodies sampled are, and the seeds disagree wildly about it: nine sit
under 3% and three at 9.5%, 15.1% and 15.5%, rising to 30.0% on seed 512 in the
`bodyCollision` arm. The drawing shows nothing for them, which is the
v1.69 rule (a mark's absence is its statement) and the v1.89 one (when a readout
has no subject, the honest output is a word, not a zero).

### Reproducing it

```bash
node --input-type=module -e '
import { World } from "./src/world.js";
import { makeConfig } from "./src/config.js";
import { creatureReaches } from "./src/reach.js";
import { wrapDelta } from "./src/vec.js";
let bodies = 0, empty = 0, band = 0, outer = 0, contacts = 0, inBand = 0;
for (const seed of [314, 7, 13, 23, 42, 51, 99, 128, 256, 512, 777, 2026]) {
  const w = new World(makeConfig({ seed, predation: true }));
  for (let t = 0; t < 3000; t++) {
    w.step();
    if (t % 10) continue;
    const cfg = w.config, live = w.creatures.filter((c) => !c.dead);
    for (const c of live) {
      const bite = creatureReaches(c.radius, cfg).find((r) => r.name === "bite");
      bodies++;
      if (bite.empty) { empty++; continue; }
      band += bite.outer - bite.inner; outer += bite.outer;
      for (const o of live) {
        if (c === o || !c.canEat(o)) continue;
        const d = Math.hypot(wrapDelta(c.x, o.x, cfg.width), wrapDelta(c.y, o.y, cfg.height));
        if (d > c.radius + o.radius + 2) continue;
        contacts++;
        if (d > bite.inner) inBand++;
      }
    }
  }
}
console.log("empty", (100 * empty / bodies).toFixed(2) + "%",
            "band", (100 * band / outer).toFixed(1) + "% of reach",
            "contacts in band", (100 * inBand / contacts).toFixed(1) + "%", "of", contacts);'
```

## The ramp was not the rule (v1.93)

Every mark this project has audited since v1.25 was audited as a *colour*: take
the composite, take the background it can appear on, take the ΔE, hold it to a
bar. The pond's biome glow is the first one where that question was the wrong
question and the audit's own list said so without noticing.

### The colour

The glow is additive `rgb(30, 78, 66)` at alpha 0.16 at a biome's centre. Over
the sixty-six grounds this pond can draw — two season extremes × the whole
terrain ramp with and without a contour, each with and without enriched ground
and with and without a biome under it — and all four vision models:

| | ΔE |
|---|---|
| worst | **4.42** (season 1, flat, deuteranopia) |
| loudest | **13.17** |

Over the just-noticeable difference (2.3) on every ground; under `MIN_DELTA_E`
(25) on all of them. That is where a **field** belongs, as opposed to a mark: the
contagious zone and the enriched ground are held to 25 because confusing them
teaches a watcher the opposite of the truth, while the glow has nothing to be
confused with and the marks that matter are drawn on top of it.

### The shape

`FertilityField.at()` returns `floor + (1 − floor)·exp(−r²/2σ²)` with
σ = `patchRadius`, and that Gaussian is the acceptance probability every pellet
is rejection-sampled against. From v1.3 to v1.93 the picture of it was two
straight segments over a 1.8σ disc: alpha 0.16 → 0.06 over the first 60%, then
0.06 → 0.

Sweep the composited glow outward and record where it falls under the
just-noticeable difference. That radius — not the gradient's — is the edge of
the picture as far as a watcher is concerned:

| ramp | visible edge (median) | range | fertility excess there |
|---|---|---|---|
| two segments (v1.3–v1.92) | **0.99σ** | 0.67–1.46σ | 61.3% |
| the rule's own falloff (v1.93) | **1.38σ** | 1.04–1.94σ | 38.6% |

And the same question asked of a pond rather than of a palette. Three seeds,
6,000 ticks, every standing pellet's distance to its nearest biome centre
sampled every 500 ticks — 5,256 pellets:

| within | share of the standing crop |
|---|---|
| 0.99σ (the old visible edge) | **38.4%** |
| 1.38σ (the new one) | **60.9%** |
| 1.8σ (the old drawn edge) | 83.7% |
| 2.0σ (the new one) | 90.7% |

At both visible edges the measured share tracks the bump's own mass,
`1 − exp(−k²/2)`, to within half a point (38.7% and 61.4% predicted) — the
cheapest available confirmation that the glow is drawing the rule rather than
something that resembles it. Further out the two part company in the direction
the model predicts: 80.2% and 86.5% predicted against 83.7% and 90.7% measured,
because `patchFloor` is 0.15 and a pond whose barren water still accepts pellets
has more crop outside its biomes than a pure Gaussian would.

### The edge is a measurement now

A gradient is truncated at its radius, so whatever alpha the ramp has reached
there becomes a hard step to nothing — a ring the rule has no edge at. Worst-case
ΔE of that step over the same sixty-six grounds:

| span | alpha at the cut | ΔE |
|---|---|---|
| 1.8σ | 0.0317 | **2.97** — visible |
| 1.9σ | 0.0263 | 2.48 — visible |
| **2.0σ** | 0.0217 | **2.05** — under the line everywhere |

`BIOME_GLOW_SPAN` is 2.0σ, and the test is a squeeze from both sides rather than
a number.

### What it leaves

`at()` takes the **maximum** of the bumps, so fertility can never exceed 1. The
canvas composites the four discs with `lighter`, so where biomes overlap the
picture reaches 0.412 of ink against a single centre's 0.16. A food mote still
clears its bar over that stack (ΔE 46.1), and the overlap is unchanged by this
release — but drawing the max would mean one field rather than four discs, which
is a different drawing.

### Reproducing it

```bash
node --input-type=module -e '
import { World } from "./src/world.js";
import { makeConfig } from "./src/config.js";
const cfg = makeConfig({});
const wrap = (a, b, s) => { let d = b - a; const h = s / 2; if (d > h) d -= s; else if (d < -h) d += s; return d; };
const dist = [];
for (const seed of [314, 7, 51]) {
  const w = new World(makeConfig({ seed }));
  for (let t = 0; t < 6000; t++) {
    w.step();
    if (t % 500 !== 499) continue;
    for (const p of w.food.items) {
      let best = Infinity;
      for (const c of w.environment.centres) {
        best = Math.min(best, Math.hypot(wrap(p.x, c.x, cfg.width), wrap(p.y, c.y, cfg.height)));
      }
      dist.push(best / cfg.patchRadius);
    }
  }
}
for (const k of [0.99, 1.38, 1.8, 2.0]) {
  const share = dist.filter((d) => d <= k).length / dist.length;
  console.log(k + "σ", (100 * share).toFixed(1) + "%", "analytic", (100 * (1 - Math.exp(-k * k / 2))).toFixed(1) + "%");
}'
```

## The other clock (v1.95)

v1.86 closed with a list, and the second item on it was one argument wide: *the
day/night clock and `seasonAmplitude` are untouched, both now one argument away
since the reference is the only part of this module still hard-wired to the
year.* This world keeps two periodic clocks — a 2,600-tick year on the rate food
arrives at (v1.3) and a 900-tick day on how far anything can see (v1.13) — and
the phase instrument built in v1.78 around "there is a reference signal here
that every other correlation in this project would envy" could be asked about
exactly one of them.

`seasonlag.js` now takes `opts.clock`, and `CLOCKS` is the table of them: for
each, whether the world is running it, how long a turn takes, the waveform the
*world itself* is driven by, and where that waveform's crest sits. The last
field is not bookkeeping. The fit is onto `sin`/`cos` and reports a shift in the
sine's convention; the year's crest is a quarter period into that convention and
the day's is at tick 0, high noon. Read without correcting for it, a day comes
back **exactly 225 ticks out** — not blurred, not noisy, with `r > 0.999` and
nothing downstream able to tell. It is the same failure mode as v1.86's, one
level up: an instrument that answers confidently in units nobody asked for.

### Nothing follows the day

Twelve seeds, 12,000 ticks, the default pond with `dayNightCycle: true` against
the same twelve with it off — asked, as v1.78's control was, about a clock they
do not have. Swing is the fitted amplitude as a share of the series' own mean;
the year's bar is 15%.

| series | with a day | with no day (control) |
| --- | ---: | ---: |
| `pop` | 0.3% – 2.6% (median 2.0%) | 0.1% – 2.6% (median 1.4%) |
| `food` — standing crop | 2.4% – 13.0% (median 7.9%) | 0.3% – 18.5% (median 6.5%) |
| `energy_crop` — feeding rate | 1.8% – 7.9% (median 5.0%) | 1.0% – 8.6% (median 3.1%) |
| `kills` rate | 11.9% – 194% (median 33.0%) | 13.1% – 88.7% (median 26.9%) |

The treatment's median sits a little above the control's on all four rows, the
ranges overlap on all four, and on three of them the **control's** is the wider.
**The Long Night** — the one world
here whose only periodic time is the light — reads the same: `pop` swings
0.5%–2.3% with its day and 1.1%–1.8% without one.

The fit is not what is deciding this. Folding the pond by hour of the day at
full resolution — every tick, twelve bins, no archive and no least squares —
gives the same answer, and the control is *louder* on two rows of three:

| folded by hour of the day | with a day | with no day |
| --- | ---: | ---: |
| feeding rate, peak-to-trough | 4.7% | 5.8% |
| standing crop | 7.1% | 7.6% |
| population | 2.8% | 2.9% |
| seeds feeding faster at noon than at midnight | 1 / 12 | 2 / 12 |

### The agreement across seeds is not evidence either

v1.86's separator was not the swing but `R`, the resultant length of twelve
seeds' phases: the seasonal arm agreed at R ≥ 0.95 and the seasonless control
scattered at ≤ 0.47. That statistic does not survive the crossing. Twelve
**day-less** ponds asked about the day reach R = **0.91**, which twelve
independent noisy phases essentially never do, so the seeds really are agreeing
— about something that is not the day. Slide the window and it wanders:

| window (days, after a one-day warm-up) | 10 | 10.5 | 11 | 11.5 | 12 | 12.5 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| R, day on | 0.70 | 0.94 | 0.71 | 0.73 | 0.93 | 0.73 |
| R, day off | 0.51 | 0.91 | 0.55 | 0.63 | 0.83 | 0.66 |

Doubling the warm-up drops the control to 0.14–0.66 and the treatment to
0.20–0.88, which points at the shared thing: every pond starts at tick 0 and
booms, and the default warm-up is *one turn of the clock* — a year for the year,
which was chosen because the founder transient is not a season, and 900 ticks
for the day, which does not clear that transient at all. A warm-up expressed in
the clock's own units is a different amount of pond for each clock.

### How dark it has to be

The null has a shape, and the shape is a threshold. Twelve seeds, seasons off,
predation on, sweeping `nightVisionFactor` — with the first row the control, a
pond running no cycle at all. Midnight sight is `visionRadius × nvf`, and the
reaches beside it are v1.83's audited contact rules.

| `nvf` | sight at midnight | crop swing (median) | feeding-rate swing | R (feeding) |
| ---: | ---: | ---: | ---: | ---: |
| no day | 168 px | 4.6% | 3.1% | 0.61 |
| 0.35 (default) | 58.8 px | 5.8% | 2.1% | 0.07 |
| 0.28 (The Long Night) | 47.0 px | 8.6% | 2.8% | 0.47 |
| 0.20 | 33.6 px | 6.8% | 3.9% | 0.81 |
| 0.107 | 18.0 px | 14.5% | 11.1% | 0.93 |
| 0.05 | 8.4 px | 28.4% | 25.1% | 0.99 |
| 0.01 | 1.7 px | 39.6% | 34.5% | 0.99 |

**The day is invisible because sight is enormous.** v1.81 measured the second
thing between a rule and its candidate: eating, scavenging and biting have no
query of their own and are gated by the sense that carries them, so a bite's
18 px sits inside a sense of 168, and it wrote down 0.107 as the
`nightVisionFactor` below which a hunter cannot bite what it is standing on.
That margin is the answer to this cycle's question. Dimming a 168-px sense to
59 px leaves every carried rule with an order of magnitude in hand, and a pond
whose rules all still fire has no reason to keep time. The readings turn on
between 0.20 and 0.107 — where midnight sight arrives at the bite's own reach —
and by 0.05 midnight sight (8.4 px) is under *eating's* 11.2, at which point a
creature at midnight cannot see the pellet it is touching and the crop visibly
piles up overnight. Nothing this project ships is within a factor of two of
that: the default is 0.35 and the darkest scenario is 0.28.

So `CLOCKS.day.minSwing` is `null` and `readable()` declines every day reading,
which is this release's finding rather than an omission — the same answer v1.86
gave a flow, on the same evidence, and the page still shows exactly one number.
A surface that wants to say something about the day has to come back with a
measurement.

### Reproducing it

```sh
node -e '
  const N = 12000, SEEDS = [314, 7, 21, 42, 51, 77, 99, 128, 256, 512, 1024, 2026];
  Promise.all([import("./src/world.js"), import("./src/config.js"),
               import("./src/seasonlag.js")]).then(([W, C, L]) => {
    for (const on of [true, false]) {
      for (const seed of SEEDS) {
        const cfg = C.makeConfig({ seed, dayNightCycle: on });
        const w = new W.World(cfg);
        for (let t = 0; t < N; t++) w.step();
        // the control is a world with no day, asked about the day anyway
        const ask = { ...cfg, dayNightCycle: true };
        const out = ["pop", "food", "energy_crop"].map((f) => {
          const r = L.seasonLag(w.stats.runHistory.series(), f, ask, { clock: "day" });
          return `${f} ${r ? r.lag.toFixed(0) + "t " + (100 * r.swing).toFixed(1) + "%" : "-"}`;
        });
        console.log(on ? "day    " : "control", seed, out.join("  "));
      }
    }
  });'
```

Add `nightVisionFactor` to `makeConfig` for the darkness sweep, and
`seasons: false, predation: true` to run it on the pond that table was measured
on.

```bash
node --test test/seasonlag.test.js
```

Five of its tests are this release: every clock in phase with itself (the only
honest check of a declared crest, and the one that would have caught the
quarter-day), the brute-force curve agreeing with the closed form on the new
clock, the two ways a day can be absent plus the misspelt clock that is a bug
rather than an absence, `readable()` declining a day, and The Long Night's own
archive read against the clock it actually keeps.

## Half the carnivores cannot eat anybody (v1.101)

Two readouts have counted the pond against the reach of predation, and both are
drawn against a **single** hunter: the `Refuge 🔒` tile (v1.64) substitutes the
largest body this world's constants permit into the eating rule, and `Safe 🛟`
(v1.89) substitutes the largest one actually in the water. v1.65 wrote down what
neither of them says, and it sat unbuilt for thirty-five releases:

> the eligible set is 11.6%–64.5% of the pond depending on the hunter and no
> readout plots it … the distribution over all of them is what would say whether
> a pond has an apex animal or a graded web.

`src/foodweb.js` is that distribution. For every creature it counts the bodies
the size-and-diet rule (`Creature._edible`) admits it, and reports three things:
how many animals can eat *anything*, what share of the pond the widest one
reaches, and what share the middle one does.

### A carnivore is a gene; a hunter is a carnivore with a meal

The distinction has no readout anywhere on this page, and it is not a fine one.
Twelve seeds at 6,000 ticks:

| seed | pop | carnivores | hunters | top | mid |
|---|---|---|---|---|---|
| 314 (default) | 244 | 1 | **0** | — | — |
| 1 | 227 | 4 | 1 | 1% | 1% |
| 2 | 275 | 38 | 1 | 1% | 1% |
| 7 | 169 | 155 | 97 | 25% | 21% |
| 13 | 278 | 15 | **0** | — | — |
| 42 | 277 | 0 | 0 | — | — |
| 51 | 251 | 0 | 0 | — | — |
| 99 | 251 | 135 | 15 | 1% | 1% |
| 128 | 237 | 88 | 71 | **37%** | **<1%** |
| 256 | 191 | 191 | 65 | 9% | 1% |
| 512 | 189 | 65 | 63 | 1% | 1% |
| 2718 | 283 | 14 | 14 | 24% | 24% |

**379 of the 706 carnivores in those twelve ponds — 53.7% — have an empty
eligible set.** They carry the diet gene, they pay carnivory's cost in plant
nutrition, and there is no body in the water they are big enough to bite. On
seed 256 the whole population is carnivorous and two thirds of it can eat
nothing; on seed 99 it is 120 of 135.

Two of the twelve ponds — including the default seed, the one every visitor
arrives at — hold the gene and reach nothing at all. That is a state the older
tiles cannot express: on seed 314 at 6,000 ticks the panel reads

```
Carnivores 🔺  1 (0%)      Refuge 🔒  99% ≥7.3px
Safe 🛟  100% ≥5.0px       Web 🕸️  none reach
```

`Safe` is quoting a line at 5.0 px drawn against an animal that cannot eat
anybody, because a ceiling is the biggest *gene-carrier* whether or not it has
prey. It is not wrong — 100% of the pond really is beyond every hunter in it —
but "the line is at 5.0 px" and "there is no line" are different sentences, and
until this release only the first one had a place to be said.

### Apex or graded

The two shares are the answer to v1.65's question, and the ponds split cleanly:

| shape | seeds | top ÷ mid |
|---|---|---|
| graded — everybody's reach is the same reach | 1, 2, 7, 99, 512, 2718 | 1.0–1.2× |
| apex — one animal eats a world the others cannot | 128, 256 | 87×, 8.5× |

Seed 128 is the sharp case: one hunter reaching 37% of the pond over a median
hunter reaching under 1% of it, with seventy others in between. Seed 7 is the
opposite and is the only pond here that looks like a textbook web — 97 hunters,
the widest reaching a quarter of the pond and the middle one a fifth of it.

### The default pond loses its predation and the panel goes on saying `1 (0%)`

Watched from tick 0, the default seed is a graded web that thins out:

| tick | pop | carnivores | hunters | top | mid |
|---|---|---|---|---|---|
| 0 | 40 | 21 | 18 | 82% | 38% |
| 500 | 61 | 25 | 22 | 58% | 22% |
| 1,000 | 260 | 25 | 25 | 16% | 7% |
| 2,000 | 191 | 13 | 11 | 11% | 3% |
| 4,000 | 255 | 5 | 1 | 2% | 2% |
| 6,000 | 244 | 1 | 0 | — | — |

The opening pond is the most predatory state this seed ever reaches, and it is
the tick-0 random draw rather than anything evolution did: forty genomes dealt
at random put big carnivores over small bodies, and every generation after that
grows the pond into the refuge. **The last hunter loses its prey at tick 4,200**
and never gets it back inside 6,000.

### What this is not

It is the *size-and-diet* rule, not `canEat`. Kinship is excluded, exactly as
`inRefuge` excludes it — a relative spared is spared by a hunter that could
still have eaten it — and there is a second reason here: `_isKin` compares two
genomes, so asking it of every ordered pair would put a genome distance behind a
per-frame readout.

It is also an *instantaneous* count of who could eat whom, not a count of who
does. An eligible set is an opportunity; whether the hunter ever finds that body,
sees it (v1.81: sight gates every bite) and lands the bite is the pond's business
and the kill counter's.

### Reproducing it

```bash
node -e '
  const SEEDS = [314, 1, 2, 7, 13, 42, 51, 99, 128, 256, 512, 2718];
  Promise.all([import("./src/world.js"), import("./src/config.js"),
               import("./src/foodweb.js")]).then(([W, C, F]) => {
    let carn = 0, hunt = 0;
    for (const seed of SEEDS) {
      const cfg = C.makeConfig({ seed });
      const w = new W.World(cfg);
      for (let t = 0; t < 6000; t++) w.step();
      const p = F.webProfile(w.creatures, cfg);
      carn += p.carnivores; hunt += p.hunters;
      console.log(seed, w.creatures.length, p.carnivores, p.hunters,
                  (100 * p.top).toFixed(1), (100 * p.mid).toFixed(1));
    }
    console.log("carnivores with an empty set:", carn - hunt, "of", carn);
  });'
```

```bash
node --test test/foodweb.test.js
```

Fourteen tests. The one that matters is the first: the module sorts the radii
once and binary-searches the rule, which is a rearrangement of an O(n²) question,
so it is checked against the O(n²) form running `_edible` itself — at four ages
of one pond and across the whole ±50% range `src/levers.js` can move
`preySizeRatio` through, including the sub-1.0 regime where a hunter may eat a
body its own size and the self-exclusion stops being arithmetic and becomes a
decision.

## What this model deliberately leaves out

Being honest about the boundaries:

- **Learning is optional and off by default.** With neural plasticity off, brains
  are frozen from birth and all adaptation is across generations; turn it on (see
  the Baldwin-effect section above) and brains also adapt within a lifetime.
- **Asexual by default.** Reproduction is mutated cloning. Sexual reproduction
  (uniform crossover) is implemented and can be toggled on, but it's off by
  default to keep lineages legible.
- **No genotype→phenotype development.** Genes map almost directly to traits.
- **Passive food.** Plants don't move or fight back, and they don't evolve.
  (They *do* concentrate in biomes and wax and wane with the seasons — see the
  heterogeneity section — and predators genuinely co-evolve, per the food-web
  section.)
- **Nothing communicates by default, and nothing has been shown to communicate
  yet.** Signalling (above) supplies the channel — an evolvable, costed pathway
  from one creature's state to another's behaviour — but the sweeps have not
  found evidence of an evolved convention travelling along it, and the obvious
  statistic that suggested otherwise failed its control.
- **Topology is fixed unless you ask otherwise.** By default only weights evolve;
  turn on evolvable topology (the NEAT section above) and structure evolves too.

Each of these is a door left deliberately open. See the roadmap in the
[devlog](DEVLOG.md) — over successive versions, predation, sexual reproduction,
a genealogy view, seasons and biomes, within-lifetime learning, and evolvable
topology all moved from that list into the simulation.

## Further reading

- Christoph Adami, *Introduction to Artificial Life* (1998).
- Kenneth O. Stanley & Risto Miikkulainen, "Evolving Neural Networks through
  Augmenting Topologies," *Evolutionary Computation* 10(2), 2002 (NEAT).
- Larry Yaeger, "Computational Genetics, Physiology, Metabolism, Neural Systems,
  Learning, Vision, and Behavior or PolyWorld," *Artificial Life III*, 1994.
- Thomas S. Ray, "An approach to the synthesis of life" (Tierra), 1991.
- Melanie Mitchell, *An Introduction to Genetic Algorithms* (1996).
- Karl Sims, "Evolving Virtual Creatures," SIGGRAPH 1994 — the classic that made
  a generation of people fall in love with evolved behaviour.
- Richard E. Lenski et al., the *E. coli* Long-Term Evolution Experiment
  (1988– ) — decades of real evolution whose lineage dynamics are often shown as
  Muller plots, the same visualisation Vivarium's Tree of Life uses.
