// hunting.test.js — the band each world declares, checked against the pond.
//
// v1.156 grouped the thirteen worlds by what their dying is made of, so that a
// stranger meeting the strip gets three headings — *Nobody hunts*, *Hunting is
// rare*, *Hunters and hunted* — instead of thirteen bare nouns. The grouping is
// only worth anything while the headings are true, and the thing that makes
// them true is a run, not a flag: `predation` is switched on in eleven of the
// thirteen, and in three of those the hunters barely eat.
//
// So this file re-runs every world and reads the share of deaths that were
// kills. It is the expensive test in the suite and it is expensive on purpose —
// a declaration nobody re-derives is a comment, and this project has shipped a
// stale count before (v1.37, sixteen releases).
//
// **Why the bars are where they are.** The measured shares at t4,000 are:
//
//   none      Genesis 0.0   The Commons 0.0
//   rare      The Plague 3.2   The Thinking Pond 5.7   Nomad's Land 8.1
//   constant  The Lay of the Land 58.1 … Earshot 79.1  (lowest: The Long Night 52.4)
//
// A forty-four point gap sits between the two populated bands, and it holds at
// 2,000, 3,000, 6,000 and 12,000 ticks as well. The bars below — 20% and 25% —
// are therefore nowhere near anything: they are placed in the middle of a hole
// so that a genuine drift fails the build and ordinary run-to-run wobble in a
// deterministic world (there is none, but a mechanic change would move these)
// does not have to be argued about.

import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENARIOS } from "../src/scenarios.js";
import { HUNTING_KEYS } from "../src/worlds.js";
import { makeConfig } from "../src/config.js";
import { World } from "../src/world.js";

/** Long enough for every world to have settled into its character. See above. */
const TICKS = 4000;

/** The share of deaths that were kills, as a percentage, after `TICKS`. */
function huntShare(scn) {
  const world = new World(makeConfig(scn.over));
  for (let i = 0; i < TICKS; i++) world.step();
  const { kills, deaths } = world.stats;
  return { kills, deaths, share: deaths ? (kills / deaths) * 100 : 0 };
}

test("every world declares a band, and it is one of the three", () => {
  for (const s of SCENARIOS) {
    assert.ok(
      HUNTING_KEYS.includes(s.hunting),
      `${s.id} declares hunting "${s.hunting}", which is not one of ${HUNTING_KEYS.join(", ")}`
    );
  }
  // A band with nothing in it would render as a heading over an empty row, and
  // a band holding everything would be a heading that says nothing. Neither is
  // a failure of the code — both are a failure of the collection, and it is
  // worth hearing about while there is still time to write a world.
  for (const key of HUNTING_KEYS) {
    const n = SCENARIOS.filter((s) => s.hunting === key).length;
    assert.ok(n > 0, `no world is in the "${key}" band, so its heading stands over nothing`);
    assert.ok(n < SCENARIOS.length, `every world is in the "${key}" band, so the grouping says nothing`);
  }
});

test("a world that says nobody hunts has no kills at all", () => {
  for (const s of SCENARIOS.filter((s) => s.hunting === "none")) {
    const { kills } = huntShare(s);
    // Exact, not a threshold: this is the one band that makes an absolute claim,
    // and "nobody hunts" is either true or it is the wrong word.
    assert.equal(kills, 0, `${s.name} says nobody hunts and killed ${kills} times`);
  }
});

test("the rare band and the constant band are what they say", () => {
  for (const s of SCENARIOS.filter((s) => s.hunting === "rare")) {
    const { share, kills, deaths } = huntShare(s);
    assert.ok(
      share < 20,
      `${s.name} is filed under rare hunting but ${kills} of ${deaths} deaths (${share.toFixed(1)}%) were kills`
    );
  }
  for (const s of SCENARIOS.filter((s) => s.hunting === "constant")) {
    const { share, kills, deaths } = huntShare(s);
    assert.ok(
      share > 25,
      `${s.name} is filed under constant hunting but only ${kills} of ${deaths} deaths (${share.toFixed(1)}%) were kills`
    );
  }
});
