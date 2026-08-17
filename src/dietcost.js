// dietcost.js — what the diet gene costs, counted against the meal it buys.
//
// v1.101 built the eligible set and found the number this module exists for:
// **53.7% of carnivores over twelve seeds can reach nothing at all**. A
// carnivore is a gene; a hunter is a carnivore with a meal; and the release
// that drew the distinction closed by writing down what it had not asked —
//
// > nobody has asked what a carnivore with an empty set *costs*, which is half
// > of them paying carnivory's plant-nutrition penalty for a niche their pond
// > does not contain, a pressure `energy.js` already has the books to weigh.
//
// The gene is priced twice in `config.js` and both prices are unconditional.
// `carnivoreMetabolicCost` is drained every tick from every body in proportion
// to its diet gene (`creature.js`, the `dietCost` term), and
// `plantPenaltyFromDiet` shrinks every pellet the same way (`world.js`, the
// `plantGain` line). Neither term asks whether there is anything in the water
// to eat, and neither asks whether the gene is over `carnivoreThreshold` — so
// the *licence* to hunt is a step and the *bill* for it is a ramp, and a
// creature at 0.3 pays three tenths of the upkeep and gives up three tenths of
// the penalty for a rule that will never once admit it.
//
// Two ledgers, deliberately not summed. The upkeep is energy per tick; the
// plant penalty is a share of a meal, and a meal has no fixed rate — turning
// the second into the first needs a grazing history this module does not have
// and would be a guess wearing a unit. They are reported side by side with
// their clocks named, which is `energy.js`'s own habit (v1.44: one bar is a mix
// of events and the other a mix of quantities, and no arithmetic joins them).
//
// Nothing in the simulation reads anything here. This is an observer, like
// `stats.js`, `refuge.js` and `foodweb.js`, and it draws no randomness.

import { eligibleCounts } from "./foodweb.js";

/**
 * @typedef {object} DietBill
 * @property {number} toll upkeep the living pay for their diet genes, energy/tick
 * @property {number} idle the part of `toll` paid by bodies with no prey in reach
 * @property {number} unlicensed the part of `toll` paid below `carnivoreThreshold`
 * @property {number} baseline what the same bodies pay simply to exist, energy/tick
 * @property {number} plantLoss mean share of a pellet given up to the gene, 0–1
 * @property {number} idlePlantLoss the same, over the bodies with no prey in reach
 */

/**
 * The pond's carnivory bill, right now.
 *
 * "With no prey in reach" is `foodweb.js`'s eligible set — the living bodies
 * `Creature._edible` admits — and **`predation` is part of the question here**,
 * unlike in `refuge.js` and `foodweb.js`, which report the size rule and leave
 * the gating to their callers. The difference is that those two answer *how big
 * is out of reach*, which is a true fact about bodies in a pond where nobody
 * bites; this one answers *is anybody being fed for this*, and in a world with
 * the mechanic off the answer is no, for every carnivore, by construction. The
 * toll is still drained — that is the reading — so the gate belongs inside the
 * arithmetic rather than on the surface, where it would blank the one tile with
 * something to say about such a world.
 *
 * `unlicensed` is a subset of `idle` and needs no gate of its own: a body under
 * the threshold is refused by `eligibleCounts` before any size is compared, so
 * it can never hold prey however small the rest of the pond is.
 *
 * `plantLoss` is a mean over **creatures, not over meals**, and the difference
 * matters: a pure carnivore that never grazes counts as much here as a grazer
 * eating every tick, so this is what the average body gives up per pellet and
 * not what the pond's actual crop loses. Weighting it would need a per-creature
 * grazing rate, which is a history, and a history is the one thing an observer
 * of the living population does not have. The surfaces say "the average body"
 * rather than "the pond" for that reason.
 *
 * `baseline` is `metabolicBase` times the population — the same clock, so the
 * toll has a scale to be read against without two surfaces each inventing one
 * (v1.67's rule about a statistic with two registers). A full carnivore's
 * upkeep is 0.03 against 0.051 for merely being alive, so the ratio is the
 * honest way to hear a number like 4.5 energy a tick.
 *
 * @param {Array<{radius:number, carnivory:number}>} creatures
 * @param {object} config
 * @returns {DietBill}
 */
export function dietBill(creatures, config) {
  const n = creatures.length;
  const bill = {
    toll: 0,
    idle: 0,
    unlicensed: 0,
    baseline: n * config.metabolicBase,
    plantLoss: 0,
    idlePlantLoss: 0,
  };
  if (n === 0) return bill;
  const counts = eligibleCounts(creatures, config);
  const threshold = config.carnivoreThreshold;
  const hunts = config.predation;
  let idleN = 0;
  for (let i = 0; i < n; i++) {
    const diet = creatures[i].carnivory;
    const upkeep = config.carnivoreMetabolicCost * diet;
    const forgone = config.plantPenaltyFromDiet * diet;
    bill.toll += upkeep;
    bill.plantLoss += forgone;
    // Fed: the gene is over the threshold, the mechanic is on, and there is at
    // least one body in the water this creature's own size admits.
    if (!(hunts && diet >= threshold && counts[i] > 0)) {
      bill.idle += upkeep;
      bill.idlePlantLoss += forgone;
      idleN++;
    }
    if (diet < threshold) bill.unlicensed += upkeep;
  }
  bill.plantLoss /= n;
  // Over the idle bodies rather than over the pond, so the two are a mean and a
  // conditional mean of one quantity: `plantLoss` is what the average body
  // gives up per pellet, and this is what the ones getting nothing back do.
  bill.idlePlantLoss = idleN > 0 ? bill.idlePlantLoss / idleN : 0;
  return bill;
}
