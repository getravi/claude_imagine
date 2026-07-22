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
| neighbour bearing (sin, cos) | direction to the nearest other creature, relative to heading |
| neighbour proximity | how close that neighbour is |
| speed | how fast it's currently moving |
| oscillator | `sin` of an internal clock, enabling rhythmic behaviour |
| age | a sense of how far through its lifespan it is |

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
- **Eating** a food pellet adds a fixed chunk of energy (capped).
- **Reproducing** hands half your energy to your child.

This creates genuine trade-offs that selection can explore. A bigger body might
help in some interaction but costs more to run. A high-metabolism creature burns
energy faster but... there has to be a compensating advantage for that gene to
survive, and if there isn't, it won't. These trade-offs are what keep the design
from collapsing into a single optimal strategy.

## Determinism and reproducibility

Vivarium is fully **deterministic**: a given `(seed, parameters)` pair produces
the exact same history every time, down to the position of every creature. This
is a real scientific virtue — reproducibility — and it's implemented by routing
*all* randomness through a single seeded pseudo-random generator
([mulberry32](../src/rng.js)). It's why you can share an interesting world just
by sharing its seed, and why the test suite can assert exact outcomes.

## What this model deliberately leaves out

Being honest about the boundaries:

- **No within-lifetime learning.** Brains are frozen from birth.
- **No sexual reproduction by default.** Reproduction is asexual splitting.
  (Crossover is implemented in [genome.js](../src/genome.js) and can be enabled;
  it's off by default to keep lineages legible.)
- **No genotype→phenotype development.** Genes map almost directly to traits.
- **No co-evolving food or predators.** Food is passive; there are no dedicated
  predators (though nothing stops a creature from evolving to exploit others —
  the neighbour senses make that *possible* in principle).
- **Fixed brain topology.** Structure never evolves, only weights.

Each of these is a door left deliberately open. See the roadmap in the
[devlog](DEVLOG.md).

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
