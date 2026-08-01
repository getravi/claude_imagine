// deathCost.test.js — what each way out of this world costs the pond.
//
// The panel has drawn two bars side by side since v1.29: what they die of, and
// where the energy goes. They are two pictures of the same pond spending
// itself, they sit six lines apart in `app/index.html`, and nothing had ever
// asked whether they agree. The `buried` column is the one event both ledgers
// watch, and until now it was a single number, so the question could not be
// asked at all.
//
// Split by cause it answers immediately, and the answer is that the two bars
// are not comparable. Starvation and predation both end at `energy <= 0` by
// definition — those bodies are empty, and the pond had already spent them,
// tick by tick, under `metabolism`. Only old age kills a creature that still
// has something. So the rarest death is essentially the whole of the column.
//
// Nothing here changes the simulation: the ledger is handed a label it was
// already computing one line above, and no random number is drawn, read or
// reordered. `test/fingerprint.test.js` holds the pond to its v1.36 hashes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { EnergyLedger, UNATTRIBUTED, energyField, buriedField } from "../src/energy.js";
import { DEATH_CAUSES, deathCosts } from "../src/stats.js";

/**
 * Run a default pond long enough that all three causes have taken bodies,
 * recording every burial as it happens. The wrapper is around the ledger's own
 * method, so it sees exactly what the books saw, in order.
 */
function runRecordingBurials(seed, ticks) {
  const world = new World(makeConfig({ seed }));
  /** @type {Array<{energy:number, cause:string}>} */
  const burials = [];
  const bury = world.energy.bury.bind(world.energy);
  world.energy.bury = (energy, cause) => {
    burials.push({ energy, cause });
    bury(energy, cause);
  };
  for (let i = 0; i < ticks; i++) world.step();
  return { world, burials };
}

test("the buried column cannot disagree with its own causes", () => {
  const ledger = new EnergyLedger();
  assert.equal(ledger.buried, 0, "nothing buried yet");

  ledger.bury(40, "age");
  ledger.bury(-0.5, "starvation");
  ledger.bury(60, "age");
  assert.equal(ledger.buriedBy.age, 100);
  assert.equal(ledger.buriedBy.starvation, -0.5);
  assert.equal(ledger.buried, 99.5);
  // There is no second accumulator to drift: `buried` is a sum over the map, so
  // a total that disagrees with its parts is not representable rather than
  // merely untested. (The v1.29 rule about derived columns, applied to the one
  // stored field that had parts.)
  assert.equal(
    ledger.buried,
    Object.values(ledger.buriedBy).reduce((a, b) => a + b, 0)
  );
  assert.equal(ledger.destroyed, ledger.metabolism + ledger.waste + ledger.buried);
});

test("a burial with no cause lands somewhere a test can see it", () => {
  const ledger = new EnergyLedger();
  ledger.bury(7);
  assert.equal(ledger.buriedBy[UNATTRIBUTED], 7);
  assert.equal(ledger.buried, 7, "the identity does not care what the label says");
  // The columns are taken over DEATH_CAUSES, so an unattributed amount shows up
  // as the three of them failing to sum to `energy_buried` — visible, rather
  // than hidden inside a cause that did not earn it.
  const named = DEATH_CAUSES.reduce((s, c) => s + (ledger.buriedBy[c] ?? 0), 0);
  assert.equal(named, 0);
  assert.notEqual(named, ledger.buried);
});

test("the map cannot be reached by a name it was not given", () => {
  // `Object.create(null)` rather than `{}`: a cause called "constructor" or
  // "toString" would otherwise read back as a function and quietly poison the
  // arithmetic. Nothing in this world names a cause that way, which is exactly
  // why it would never be noticed.
  const ledger = new EnergyLedger();
  assert.equal(ledger.buriedBy.toString, undefined);
  assert.equal(Object.getPrototypeOf(ledger.buriedBy), null);
});

test("every burial in a real pond names a real cause", () => {
  const { world, burials } = runRecordingBurials(314, 6000);
  assert.ok(burials.length > 200, `only ${burials.length} deaths to look at`);
  for (const b of burials) {
    assert.ok(DEATH_CAUSES.includes(b.cause), `burial charged to "${b.cause}"`);
  }
  assert.equal(world.energy.buriedBy[UNATTRIBUTED], undefined);
  assert.deepEqual(
    Object.keys(world.energy.buriedBy).slice().sort(),
    DEATH_CAUSES.slice().sort(),
    "every cause in the world reached the books, and no other"
  );
});

test("an aged body always has something left; a starved one never does", () => {
  const cfg = makeConfig({ seed: 314 });
  const { world, burials } = runRecordingBurials(314, 6000);
  const byCause = (c) => burials.filter((b) => b.cause === c);
  assert.ok(byCause("age").length > 20, "not enough old age to test");
  assert.ok(byCause("starvation").length > 100, "not enough starvation to test");

  // Exact, and structural rather than statistical: `die("age")` is the `else`
  // branch of `if (this.energy <= 0)`, so a creature that reaches `maxAge` has
  // energy above zero by construction, and nothing after that point in the tick
  // can take energy away from it.
  for (const b of byCause("age")) {
    assert.ok(b.energy > 0, `an aged body buried ${b.energy}`);
  }

  // The other two end at `energy <= 0`, so the only way one of them can be
  // buried holding anything is if it fed *after* dying — which this world lets
  // it do, and which is the finding this test exists to pin (see
  // docs/SCIENCE.md). The ceiling is what one tick of feeding can be worth:
  // a dead creature gets at most one pellet and one bite before it is swept up.
  const meal = cfg.foodEnergy + cfg.biteEnergy;
  for (const b of [...byCause("starvation"), ...byCause("predation")]) {
    assert.ok(
      b.energy < meal,
      `a body that died at zero was buried holding ${b.energy}, more than a last meal`
    );
  }
});

test("the death mix and the spend mix disagree, by three orders of magnitude", () => {
  const { world } = runRecordingBurials(314, 6000);
  const cost = deathCosts(world.stats.deathsBy, world.energy.buriedBy);
  const total = DEATH_CAUSES.reduce((s, c) => s + cost.causes[c].deaths, 0);

  // Old age is a minority of the deaths and very nearly the whole of the
  // column. Measured over twelve seeds and 20,000 ticks each: 15.8% of deaths,
  // 99.8% of everything buried. The bounds here are loose on purpose — the
  // claim is a structural gap of two orders of magnitude, not a number, and a
  // test that can only measure noise teaches a future reader the wrong lesson
  // about which of the two is fragile.
  assert.ok(cost.causes.age.deaths / total < 0.4, "old age stopped being a minority");
  assert.ok(cost.causes.age.energy / cost.energy > 0.95, "old age stopped dominating the column");

  const perAged = cost.causes.age.perDeath;
  assert.ok(perAged > 20, `an aged body took only ${perAged.toFixed(2)} with it`);
  for (const c of ["starvation", "predation"]) {
    const per = Math.abs(cost.causes[c].perDeath);
    assert.ok(per < 1, `a ${c} body took ${per.toFixed(3)} with it`);
    assert.ok(perAged > per * 100, `only a ${(perAged / per).toFixed(0)}x gap on ${c}`);
  }
});

test("deathCosts: pure, and honest about an empty set", () => {
  assert.equal(deathCosts({}, {}), null, "nothing has died yet");
  assert.equal(deathCosts({ starvation: 0, age: 0, predation: 0 }, {}), null);

  const cost = deathCosts({ starvation: 4, age: 2 }, { starvation: -1, age: 100 });
  assert.equal(cost.deaths, 6);
  assert.equal(cost.energy, 99);
  assert.equal(cost.causes.starvation.perDeath, -0.25);
  assert.equal(cost.causes.age.perDeath, 50);
  // A cause nobody has died of is a true statement about an empty set, not a
  // NaN and not a dash the caller has to special-case.
  assert.equal(cost.causes.predation.deaths, 0);
  assert.equal(cost.causes.predation.energy, 0);
  assert.equal(cost.causes.predation.perDeath, 0);
  // Signed, unlike spendShares(): the overdraft is the honest number here and
  // nothing downstream of it is a bar that could invert.
  assert.ok(cost.causes.starvation.energy < 0);

  const before = { starvation: 4, age: 2 };
  deathCosts(before, { starvation: -1, age: 100 });
  assert.deepEqual(before, { starvation: 4, age: 2 }, "read-only");
});

test("the split rides the history, the archive and both CSV scopes", () => {
  const world = new World(makeConfig({ seed: 314 }));
  // Past `maxAge`, or the aged column is empty for a reason that has nothing to
  // do with the plumbing under test: nothing in this world can die of old age
  // before tick 4,200.
  for (let i = 0; i < 6000; i++) world.step();
  const hist = world.stats.popHistory;
  assert.ok(hist.length > 100);

  // Every point carries the three columns, and they are the whole of the
  // column they subdivide. Cumulative and monotone-free, exactly like the
  // ledger fields around them, so differencing two samples over any span of
  // the archive's thinning is exact.
  // A cause nothing has died of yet has no column in that point at all — the
  // books report what they were told, so a field is absent until it has a
  // value. Absent reads as zero everywhere downstream, which is the same
  // graceful case the counters have had since v1.26.
  for (const h of hist) {
    const parts = DEATH_CAUSES.reduce((s, c) => s + (h[buriedField(c)] ?? 0), 0);
    const whole = h[energyField("buried")];
    assert.ok(
      Math.abs(parts - whole) < 1e-9 * Math.max(1, Math.abs(whole)),
      `parts ${parts} vs whole ${whole} at tick ${h.tick}`
    );
  }
  const last = hist[hist.length - 1];
  assert.ok(last[buriedField("age")] > 0, "nothing has died of old age to record");

  for (const scope of ["recent", "whole"]) {
    const csv = world.stats.toCSV(scope);
    const header = csv.split("\n")[0].split(",");
    for (const c of DEATH_CAUSES) {
      assert.ok(header.includes(buriedField(c)), `${scope}: no ${buriedField(c)} column`);
    }
    // The subdivision is written after the whole of the books, so a reader who
    // only wants the ledger can stop at `energy_residual`.
    assert.ok(
      header.indexOf(buriedField(DEATH_CAUSES[0])) > header.indexOf(energyField("residual")),
      `${scope}: the split should follow the books it subdivides`
    );
    const row = csv.trim().split("\n").pop().split(",");
    assert.equal(row.length, header.length, `${scope}: ragged row`);
    const agedCol = header.indexOf(buriedField("age"));
    assert.ok(Number(row[agedCol]) > 0, `${scope}: the aged column never filled`);
  }
});
