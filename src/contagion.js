// contagion.js — the reach of the pathogen, as a thing you can see and a number.
//
// Contagion arrived in v1.16 and has always been drawn one creature at a time: a
// sulphur halo means *this one is sick*. What the pond has never shown is the
// only question a watcher actually has, which is **where can I catch it** —
// transmission happens inside `infectionRadius` (22 px, five times a creature's
// own body) and nothing on any surface has ever drawn that distance. An epidemic
// looked like scattered glowing dots rather than like weather.
//
// This module is the shared half of the fix: the geometry and the arithmetic of
// the hazard, with the two views (`render.js`, `minimap.js`) as its two
// consumers and `stats.js` as a third. Everything here is read-only with respect
// to the simulation and draws no random numbers — the pathogen does not care
// whether anybody is watching it.
//
// The nice accident at the heart of it: alpha compositing and independent
// infection are *the same arithmetic*. Paint n translucent discs of opacity a on
// top of each other and the result is 1 − (1 − a)^n opaque; stand in range of n
// infected neighbours each of which can infect you with probability p per tick
// and your risk is 1 − (1 − p)^n. So one function serves both, and the field's
// opacity is a strictly increasing function of the real per-tick risk rather
// than a decorative ramp that merely looks like one.

import { torusDist2 } from "./vec.js";

/**
 * The chance that at least one of `n` independent events of probability `p`
 * happens. Used for the hazard field's opacity (p = the per-source alpha) and
 * for the risk it stands for (p = `config.infectionChance`).
 *
 * Clamped and defined at the edges: no sources is no chance, and a certainty
 * stays a certainty however many times it is offered.
 */
export function independentAny(p, n) {
  if (!(n > 0)) return 0;
  const q = 1 - Math.max(0, Math.min(1, p));
  return 1 - Math.pow(q, n);
}

/**
 * The per-tick chance a susceptible creature standing inside `sources`
 * overlapping infection radii catches the disease. Exactly what the field's
 * opacity is a monotone remap of.
 */
export function infectionRisk(sources, config) {
  return independentAny(config.infectionChance, sources);
}

/**
 * Cell size, in world pixels, of the grid `hazardShare` measures on. Chosen by
 * sweeping it: a lone case's measured area is within 6.9% of πr² at six pixels
 * and within 40% at fifteen, because cell-centre sampling of a disc only 22
 * pixels across leaves the error on the *perimeter*, where a coarse grid keeps
 * nearly all of its cells. Six leaves the default world at 150×102 cells, which
 * is a few thousand distance tests every fourth tick — far below what the tick
 * itself costs.
 */
export const HAZARD_CELL = 6;

/** The measurement grid for a world of this size: whole cells, tiling exactly. */
export function hazardGrid(config) {
  const cols = Math.max(1, Math.round(config.width / HAZARD_CELL));
  const rows = Math.max(1, Math.round(config.height / HAZARD_CELL));
  return { cols, rows, cw: config.width / cols, ch: config.height / rows };
}

/**
 * The share of the pond's area, 0..1, that is within `infectionRadius` of at
 * least one infected creature — the size of the contagious zone, which is the
 * scalar version of what the two views now draw.
 *
 * A cell counts when its *centre* is in range, on the torus, so the statistic
 * wraps the way the world does: a case sitting on the seam covers ground on both
 * sides of it. Exactly 0 when nothing is infected, which is every world with the
 * feature off — so the readout needs no branch of its own to stay honest.
 *
 * @param {Array<{x:number,y:number,infected:boolean}>} creatures
 * @param {object} config
 */
export function hazardShare(creatures, config) {
  const r = config.infectionRadius;
  if (!(r > 0)) return 0;
  const { cols, rows, cw, ch } = hazardGrid(config);
  const mask = new Uint8Array(cols * rows);
  const r2 = r * r;
  let covered = 0;
  for (const c of creatures) {
    if (!c.infected) continue;
    // Only the cells whose columns and rows the disc can reach, wrapped into
    // range. A radius wider than the world revisits cells, which the mask makes
    // harmless: coverage is counted on the transition, not on the visit.
    const i0 = Math.floor((c.x - r) / cw);
    const i1 = Math.floor((c.x + r) / cw);
    const j0 = Math.floor((c.y - r) / ch);
    const j1 = Math.floor((c.y + r) / ch);
    for (let jj = j0; jj <= j1; jj++) {
      const j = ((jj % rows) + rows) % rows;
      const cy = (j + 0.5) * ch;
      for (let ii = i0; ii <= i1; ii++) {
        const i = ((ii % cols) + cols) % cols;
        const k = j * cols + i;
        if (mask[k]) continue;
        const cx = (i + 0.5) * cw;
        if (torusDist2(cx, cy, c.x, c.y, config.width, config.height) <= r2) {
          mask[k] = 1;
          covered++;
        }
      }
    }
  }
  return covered / (cols * rows);
}

/**
 * The infected creatures, as the hazard sources the views draw: one disc each,
 * of `infectionRadius`. Returns an empty array whenever nothing is sick, so a
 * healthy pond — and every world with contagion switched off — draws exactly
 * what it drew before this existed.
 *
 * @param {Array<{x:number,y:number,infected:boolean}>} creatures
 */
export function hazardSources(creatures) {
  const out = [];
  for (const c of creatures) if (c.infected) out.push({ x: c.x, y: c.y });
  return out;
}
