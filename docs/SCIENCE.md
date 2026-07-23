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
Vivarium stays fixed-topology on purpose — it's easier to reason about and
plenty expressive for foraging — but NEAT-style structural evolution is the
natural next step for anyone who wants to fork this.

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

- **No within-lifetime learning.** Brains are frozen from birth; all adaptation
  is across generations.
- **Asexual by default.** Reproduction is mutated cloning. Sexual reproduction
  (uniform crossover) is implemented and can be toggled on, but it's off by
  default to keep lineages legible.
- **No genotype→phenotype development.** Genes map almost directly to traits.
- **Passive food.** Plants don't move or fight back, and they don't evolve.
  (They *do* concentrate in biomes and wax and wane with the seasons — see the
  heterogeneity section — and predators genuinely co-evolve, per the food-web
  section.)
- **Fixed brain topology.** Structure never evolves, only weights.

Each of these is a door left deliberately open. See the roadmap in the
[devlog](DEVLOG.md) — predation and sexual reproduction started as items on that
list and were built in v1.1.

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
