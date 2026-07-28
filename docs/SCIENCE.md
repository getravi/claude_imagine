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

### `energyMax` is a parameter that does nothing

`spilled` reads **exactly zero** in a default world. Not "negligible" — zero, to
the last bit that differencing an energy against itself can produce.

The reason is a two-line interaction nobody had looked at. `energyMax` is 220
and `reproduceThreshold` is 160, so a creature always splits before it can fill
up, and the ceiling is unreachable. Every world this project has shipped, every
screenshot, every scenario, has carried a clamp that has never once fired. You
could set `energyMax` to 10,000 or delete it and nothing would move.

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

### The one that turned out fine

Corpses (dim maroon) sit under food (green motes) — textbook red and green, and
the pair most likely to be a second bug. Measured, they are ΔE 39 apart under
deuteranopia and 55 under protanopia: comfortably clear, because they differ in
lightness as well as hue. No change was made. An audit that only reports
problems is not an audit.

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
band; the band's thickness is its abundance; time runs along the horizontal axis.
Reading it, you can spot:

- a **selective sweep** — a band widening as a fitter lineage displaces others;
- **speciation** — a new band pinching into existence mid-plot;
- **extinction** — a band pinching shut;
- **clonal interference** — several lineages jockeying, none fixing, because
  competing beneficial variants get in each other's way.

A caveat worth stating: because classification is by overall genetic distance to
a fixed representative, it is a *phenetic* grouping, not a perfect record of
ancestry — convergent drift could in principle place two unrelated creatures in
the same cluster. It's a faithful, legible approximation of the tree of life, not
a ground-truth genealogy. (A true ancestry-tracked genealogy is a natural future
refinement — see the roadmap.)

## Determinism and reproducibility

Vivarium is fully **deterministic**: a given `(seed, parameters)` pair produces
the exact same history every time, down to the position of every creature. This
is a real scientific virtue — reproducibility — and it's implemented by routing
*all* randomness through a single seeded pseudo-random generator
([mulberry32](../src/rng.js)). It's why you can share an interesting world just
by sharing its seed, and why the test suite can assert exact outcomes.

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
