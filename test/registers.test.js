// registers.test.js — the reader and the listener, held in step.
//
// A selection is described twice, by two modules, out of two hand-written lists
// of clauses gated by two hand-written sets of `if`s. Every asymmetry between
// them found so far was found by somebody looking: contagion and signalling in
// v1.77 (a listener told "sick" and "immune" since v1.31, a reader told
// nothing, for forty-six releases), the foot in v1.102, one release after the
// whisker got a row and a clause together.
//
// `src/registers.js` is the sweep that does not need somebody to look, and this
// is the test of it. Four claims:
//
//   1. **Both registers declare what they say.** `FIELD_REPORTS`/`FIELD_SILENT`
//      have partitioned a creature's own fields since v1.77; `FIELD_SPOKEN`/
//      `FIELD_UNSPOKEN` are the same pair for the sentence, which had none.
//   2. **The declarations are derived, not read.** Move a field, render both,
//      and the verdict must be what the tables say — which is how `wallFeel`
//      was found filed as reported by a row that never mentions it, and `_in`
//      and `_aux` filed as scratch while both sways are functions of them.
//   3. **A gated row implies a gated clause.** Any flag whose *set* of rows
//      changes must change the sentence too. This is the class v1.33, v1.77 and
//      v1.102 are three instances of, and it is checked against every opt-in
//      flag rather than against a list of the four that gate one today.
//   4. **The sweep is an observer.** It moves live fields and puts them back,
//      so a world that has been swept is bit-for-bit a world that has not.

import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { stateFingerprint } from "../src/fingerprint.js";
import {
  fieldRegisters,
  registerSubjects,
  readingOf,
  hearingOf,
  LADDER,
} from "../src/registers.js";
import { creatureFacts, FIELD_REPORTS, FIELD_SILENT, FIELD_OFF_GRID } from "../src/inspect.js";
import { describeSelection, FIELD_SPOKEN, FIELD_UNSPOKEN } from "../src/describe.js";

/** Every per-creature mechanic on, so both registers say everything they can. */
function loudConfig(over = {}) {
  return {
    ...DEFAULT_CONFIG,
    seed: 314,
    predation: true,
    disease: true,
    signalling: true,
    terrain: true,
    groundSense: true,
    barriers: true,
    wallSense: true,
    scavenging: true,
    bodyCollision: true,
    ...over,
  };
}

/** A stepped pond and the subjects the sweep runs on. */
function pond(config, ticks = 200) {
  const world = new World({ ...config });
  for (let i = 0; i < ticks; i++) world.step();
  return world;
}

const CONFIG = loudConfig();
const WORLD = pond(CONFIG);
const SUBJECTS = registerSubjects(WORLD.creatures);
const TABLE = fieldRegisters(SUBJECTS, CONFIG);
const FIELDS = Object.keys(SUBJECTS[0]);

test("both registers declare every field a creature carries, and nothing else", () => {
  for (const table of [
    { name: "reader", said: FIELD_REPORTS, quiet: FIELD_SILENT },
    { name: "listener", said: FIELD_SPOKEN, quiet: FIELD_UNSPOKEN },
  ]) {
    const declared = [...Object.keys(table.said), ...Object.keys(table.quiet)];
    for (const field of FIELDS) {
      assert.ok(
        declared.includes(field),
        `${table.name}: creature field "${field}" is in neither of its lists`
      );
    }
    for (const field of declared) {
      assert.ok(
        FIELDS.includes(field),
        `${table.name}: declares "${field}", which no creature carries`
      );
    }
    for (const field of Object.keys(table.said)) {
      assert.ok(!(field in table.quiet), `${table.name}: "${field}" is on both lists`);
    }
    // A silence needs a reason, which is the half of these tables that ages.
    // A reason may be a cross-reference — "as x", "as vx", "as _in" — and then
    // it has to point at a field that is itself silent here, or it is a
    // sentence that reads as an argument and contains none.
    for (const [field, why] of Object.entries(table.quiet)) {
      const ref = /^as ([A-Za-z_]+)$/.exec(why || "");
      if (ref) {
        assert.ok(
          ref[1] in table.quiet && ref[1] !== field,
          `${table.name}: "${field}" defers to "${ref[1]}", which is not a silence here`
        );
      } else {
        assert.ok(why && why.length > 20, `${table.name}: "${field}" is silent with no reason`);
      }
    }
  }
});

test("what the panel says is what the sweep finds it saying", () => {
  for (const field of FIELDS) {
    const declared = field in FIELD_REPORTS && !(field in FIELD_OFF_GRID);
    assert.equal(
      TABLE[field].read,
      declared,
      declared
        ? `"${field}" is declared as reported by a row, and moving it moves no row's text`
        : `"${field}" moves the grid's text and is not declared as a row's subject`
    );
  }
  // The off-grid list is a claim about `FIELD_REPORTS`, so it may not name a
  // field that list does not carry.
  for (const field of Object.keys(FIELD_OFF_GRID)) {
    assert.ok(field in FIELD_REPORTS, `off-grid "${field}" is not reported at all`);
  }
});

test("what the sentence says is what the sweep finds it saying", () => {
  for (const field of FIELDS) {
    assert.equal(
      TABLE[field].heard,
      field in FIELD_SPOKEN,
      field in FIELD_SPOKEN
        ? `"${field}" is declared spoken, and moving it moves no clause`
        : `"${field}" moves the sentence and is not declared spoken`
    );
  }
});

test("a field no perturbation can express is reported as one, not passed", () => {
  const unprobed = FIELDS.filter((f) => !TABLE[f].probed);
  // Both are declared silences on both sides, and both are silent for a reason
  // that has nothing to do with the instrument — a back-reference to the config,
  // and a cause of death that is null while its creature is alive. If a third
  // ever turns up, it is a coverage question rather than a pass.
  assert.deepEqual(unprobed.sort(), ["config", "deathCause"]);
  for (const field of unprobed) {
    assert.equal(TABLE[field].read, false);
    assert.equal(TABLE[field].heard, false);
    assert.ok(field in FIELD_SILENT && field in FIELD_UNSPOKEN);
  }
});

test("a flag that gates a row gates a clause", () => {
  const flags = Object.keys(DEFAULT_CONFIG).filter((k) => typeof DEFAULT_CONFIG[k] === "boolean");
  const sick = SUBJECTS[1];
  const keys = (config) =>
    creatureFacts(sick, config)
      .map((f) => f.key)
      .join(",");
  const on = loudConfig();
  let gating = 0;
  for (const flag of flags) {
    const off = loudConfig({ [flag]: false });
    if (keys(off) === keys(on)) continue;
    gating++;
    assert.notEqual(
      describeSelection(sick, off, null, true),
      describeSelection(sick, on, null, true),
      `${flag} adds a row to the inspector and nothing to the sentence`
    );
  }
  // Four of them do today — the foot, the whisker, contagion and the voice —
  // and the count is here so that a fifth arriving cannot make this test
  // vacuous by gating nothing.
  assert.equal(gating, 4, "the mechanics that gate a row");
});

test("the foot and the voice are said only where their rule is on", () => {
  const c = SUBJECTS[0];
  const both = describeSelection(c, loudConfig());
  assert.match(both, /on ground \d+% rough/);
  assert.match(both, /calling -?\d\.\d\d, hearing/);

  const quiet = describeSelection(c, loudConfig({ groundSense: false, signalling: false }));
  assert.doesNotMatch(quiet, /on ground/);
  assert.doesNotMatch(quiet, /calling/);

  // The default pond has neither rule, so neither clause: the sentence a
  // visitor actually hears is the one v1.102 left.
  assert.doesNotMatch(describeSelection(c, { ...DEFAULT_CONFIG }), /on ground|calling/);
});

test("the two registers quote the same numbers", () => {
  const c = SUBJECTS[0];
  const config = loudConfig();
  const rows = Object.fromEntries(creatureFacts(c, config).map((f) => [f.key, f.value]));
  const said = describeSelection(c, config);

  // The ground: the row's percentage and the clause's are one arithmetic.
  const rough = rows.foot.match(/^(\d+)% rough/)[1];
  assert.match(said, new RegExp(`on ground ${rough}% rough`));

  // The voice: `says n, hears m` against `calling n, hearing m`, and the same
  // word for the silence — 0 is a state on both surfaces, not a measurement.
  const [, says, hears] = rows.voice.match(/^says (-?[\d.]+), hears (nothing|-?[\d.]+)$/);
  assert.match(said, new RegExp(`calling ${says}, hearing ${hears === "nothing" ? "nothing" : hears}`));
});

test("the sweep puts back everything it moves", () => {
  const world = pond(CONFIG);
  const before = stateFingerprint(world);
  fieldRegisters(registerSubjects(world.creatures), CONFIG);
  assert.equal(stateFingerprint(world), before, "a swept world is the world it was");
});

test("the ladder reaches a band a 37% push cannot", () => {
  // The reason there are four steps rather than `levers.js`'s one. `regionOf`
  // cuts the pond into ninths, so a coordinate deep inside a band is a field
  // the sentence reads and the standard perturbation cannot move — the same
  // hole v1.102 found at infinity, in a readout rather than in a value.
  const c = SUBJECTS[0];
  const config = loudConfig();
  const before = hearingOf(c, config);
  const x = c.x;
  const moved = LADDER.map((step) => {
    c.x = step(x);
    const after = hearingOf(c, config);
    c.x = x;
    return after !== before;
  });
  assert.equal(hearingOf(c, config), before, "restored");
  assert.ok(moved.some(Boolean), "some step of the ladder moves the region");
  assert.ok(!moved.every(Boolean), "and not every step does — which is why there are four");
});

test("describing a creature is still an observation", () => {
  const world = pond(CONFIG, 60);
  const c = world.creatures[0];
  const before = stateFingerprint(world);
  readingOf(c, CONFIG);
  hearingOf(c, CONFIG);
  assert.equal(stateFingerprint(world), before);
});
