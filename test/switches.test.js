// switches.test.js — the panel's thirty-one switches, and the one claim a
// heading makes that a heading cannot keep on its own.
//
// Most of this file is `test/hud.test.js`'s shape one surface over: the page
// and the table must agree about which switches exist, in what order, and under
// which heading — because the failure that matters is *silent*. Move a switch
// into a different section in `switches.js` and not in the markup and every id
// still lines up perfectly; the page simply tells a visitor that reduced motion
// is a rule of the ecology.
//
// Two tests here are not that shape and are the reason the file is worth its
// weight.
//
// **The last section makes a promise about behaviour.** Its heading says these
// six change the picture only and that the pond runs the same either way. That
// is a claim about `main.js` — about six event handlers — and nothing in a
// table of captions can keep it. So this file reads `main.js`, cuts each
// switch's handler out of it, and checks: a world switch writes the config key
// its row declares and calls `syncHash()`; a view switch writes no config key
// and calls no `syncHash()`, because view state is not part of a world and a
// permalink that carried it would be handing somebody else your camera.
//
// **The panel is checked against `config.js` in both directions.** Every
// boolean rule this world has is either reachable from the page or named in
// `UNEXPOSED` with a reason. Until v1.120 that question had no answer anybody
// could give without reading two files side by side, which is the definition of
// a fact that goes stale — and a rule nobody can reach is not a rule, it is
// dead weight in a config.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { World } from "../src/world.js";
import { makeConfig, DEFAULT_CONFIG } from "../src/config.js";
import { stateFingerprint } from "../src/fingerprint.js";
import {
  AGREE_BAR,
  SWEEP,
  SWITCHES,
  SWITCH_GROUPS,
  UNEXPOSED,
  VIEW_GROUP,
  quietSwitches,
  switchOrder,
  switchesIn,
  worldSwitches,
  viewSwitches,
  unknownGroups,
} from "../src/switches.js";

/** The ponds the v1.120 sweep was run on, and the ones the inert claim re-uses. */
const SEEDS = [42, 128, 256, 314, 777, 2026];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "app/index.html";
const html = readFileSync(join(root, PAGE), "utf8");
const main = readFileSync(join(root, "src/main.js"), "utf8");

/** The `toggle-*` checkboxes the shipped page defines, in document order. */
function pageSwitches() {
  return [...html.matchAll(/id="(toggle-[a-z]+)" type="checkbox"/g)].map((m) => m[1]);
}

// ---- the page and the table ----

test("the page and the table agree about which switches exist, and where", () => {
  // Both directions in one comparison, and both halves fail loudly in the
  // browser rather than silently: a switch the table declares and the page
  // lacks throws on `$(id)` at boot; a switch the page carries and the table
  // never names is a checkbox nothing has grouped, which is the wall this
  // release was about.
  assert.deepEqual(
    switchOrder().map((s) => s.id),
    pageSwitches(),
    "the switch table and the page must hold the same checkboxes, in the same order"
  );
});

test("every switch is in a section, and every section has switches in it", () => {
  const keys = SWITCH_GROUPS.map((g) => g.key);
  assert.equal(new Set(keys).size, keys.length, "two sections share a key");
  assert.deepEqual(unknownGroups(), [], "a switch claims a section that does not exist");
  for (const key of keys) {
    assert.ok(switchesIn(key).length > 0, `the "${key}" section holds no switches`);
  }
  assert.equal(switchOrder().length, SWITCHES.length, "a switch was lost or doubled on the way to the page");
  const ids = SWITCHES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "a switch is declared twice");
});

test("the page draws each switch under the heading its table puts it under", () => {
  const sections = [];
  for (const m of html.matchAll(/data-switches="([a-z]+)"([\s\S]*?)<\/section>/g)) {
    sections.push({ key: m[1], ids: [...m[2].matchAll(/id="(toggle-[a-z]+)"/g)].map((x) => x[1]) });
  }
  assert.deepEqual(
    sections.map((s) => s.key),
    SWITCH_GROUPS.map((g) => g.key),
    "the page's sections must be `SWITCH_GROUPS`, in order"
  );
  for (const section of sections) {
    assert.deepEqual(
      section.ids,
      switchesIn(section.key).map((s) => s.id),
      `the "${section.key}" section on the page must hold exactly the switches the table puts in it`
    );
  }
});

test("the page carries every heading, every sentence and every caption", () => {
  for (const g of SWITCH_GROUPS) {
    assert.ok(html.includes(`<h4>${g.title}</h4>`), `the page does not carry the heading "${g.title}"`);
    assert.ok(html.includes(g.hint), `the page does not carry the sentence under "${g.title}"`);
  }
  for (const s of SWITCHES) {
    assert.ok(html.includes(`<span>${s.label}</span>`), `${s.id}: the page does not carry "${s.label}"`);
  }
});

test("no heading or caption speaks in this project's own vocabulary", () => {
  // `src/headline.js`'s bar, applied here for that module's reason: every
  // readout on this page became technical one honest, correct word at a time,
  // and a heading is exactly where that starts again. The switch *names*
  // themselves are exempt — `Licensed diet cost`, `Neural plasticity` and
  // `Detritus` are what the README's rule table calls them and renaming them
  // here would leave the two documents describing different pages — so the bar
  // is held against the gloss in brackets, which is the half that is supposed
  // to explain the half in front of it.
  const JARGON = /\b(carnivor\w*|herbivor\w*|lineage|specie|genome|genotype|allele|neural net\w*|topology|tick|px|predator|stochastic|crossover|index)\b/i;
  for (const g of SWITCH_GROUPS) {
    assert.ok(g.hint.length <= 90, `${g.key}: the sentence is ${g.hint.length} characters`);
    assert.ok(!JARGON.test(g.hint), `${g.key}: "${g.hint}" reaches for a word a visitor may not have`);
  }
  for (const s of SWITCHES) {
    const gloss = s.label.match(/\(([^)]*)\)/);
    if (!gloss) continue;
    assert.ok(!JARGON.test(gloss[1]), `${s.id}: "(${gloss[1]})" reaches for a word a visitor may not have`);
  }
});

// ---- the table and the config ----

test("every switch that claims a config key writes one that exists", () => {
  for (const s of worldSwitches()) {
    assert.ok(s.flag in DEFAULT_CONFIG, `${s.id} writes \`${s.flag}\`, which \`config.js\` does not have`);
  }
  const flags = worldSwitches().map((s) => s.flag);
  // Worded without a number word in front of "switches" on purpose:
  // `test/prosecounts.test.js` reads this file, and a count standing in front
  // of a collection's name is a claim about that collection — which is how it
  // caught this line the first time it ran.
  assert.equal(new Set(flags).size, flags.length, "a config key is written by more than one switch");
  for (const s of viewSwitches()) {
    assert.equal(s.group, VIEW_GROUP, `${s.id} writes no config key but is not in the "${VIEW_GROUP}" section`);
  }
});

test("every rule this world has is either on the page or excused", () => {
  // The closure, and the half that matters is the second one: a rule in
  // `config.js` that no control reaches is a feature nobody can ever meet, and
  // nothing before this release would have noticed one arriving.
  const rules = Object.keys(DEFAULT_CONFIG).filter((k) => typeof DEFAULT_CONFIG[k] === "boolean");
  const onPage = new Set(worldSwitches().map((s) => s.flag));
  const unreachable = rules.filter((k) => !onPage.has(k) && !(k in UNEXPOSED));
  assert.deepEqual(unreachable, [], "a rule with no switch and no entry in `UNEXPOSED`");

  // And the other direction, because an excuse outlives what it excused: an
  // entry here for a flag that no longer exists is a reason nobody can check.
  for (const key of Object.keys(UNEXPOSED)) {
    assert.ok(key in DEFAULT_CONFIG, `\`UNEXPOSED\` excuses \`${key}\`, which \`config.js\` no longer has`);
    assert.ok(!onPage.has(key), `\`${key}\` is excused from the page and is on it`);
    assert.ok(UNEXPOSED[key].length > 40, `\`${key}\`'s excuse is too short to be a reason`);
  }
});

// ---- what the sweep found ----

test("the sweep covers every rule on the page, and nothing else", () => {
  // Both directions, for `UNEXPOSED`'s reason one test up: a row here for a
  // rule that no longer has a switch is a measurement of nothing, and a switch
  // with no row is a rule this project has an instrument for and never pointed
  // it at.
  assert.deepEqual(
    Object.keys(SWEEP).sort(),
    worldSwitches().map((s) => s.flag).sort(),
    "`SWEEP` and the world switches must be the same set of rules"
  );
  for (const [flag, row] of Object.entries(SWEEP)) {
    assert.ok(row.agree >= 0 && row.agree <= 6, `${flag}: agreement is out of ${SEEDS.length} ponds`);
    if (row.needs) {
      assert.ok(row.needs in DEFAULT_CONFIG, `${flag} is measured with \`${row.needs}\` on, which does not exist`);
    }
  }
});

test("only one rule moves six ponds of six the same way", () => {
  // The reason the ordering in `switches.js` is a judgement rather than a
  // ranking, pinned so a future cycle cannot quietly start treating the `alive`
  // column as an effect size. Twenty-four of the twenty-five rules have no
  // agreed direction across seeds; one does.
  const directed = Object.entries(SWEEP).filter(([, r]) => r.agree >= AGREE_BAR && r.alive !== 0);
  assert.deepEqual(
    directed.filter(([, r]) => r.agree === 6).map(([f]) => f),
    ["seasons"],
    "only `seasons` moved every pond the same way"
  );
});

test("the two quiet rules really do leave the pond bit-for-bit identical", () => {
  // The one claim in `SWEEP` that is *not* a memory, and the one the page now
  // states to a visitor in plain English. Everything else in that table is a
  // number from a sweep too slow to run here; this is re-derived on every
  // build, because a page that tells somebody a switch does nothing had better
  // be right about it.
  //
  // Shortened to 600 ticks and three of the six seeds — divergence is
  // monotonic, so a rule that is identical at 1,500 is identical at 600 and a
  // rule that has started to bite would show here first.
  for (const s of quietSwitches()) {
    assert.equal(SWEEP[s.flag].inert, true, `${s.id} tells a visitor it does nothing and \`SWEEP\` disagrees`);
    for (const seed of SEEDS.slice(0, 3)) {
      const control = new World(makeConfig({ seed }));
      const moved = new World(makeConfig({ seed, [s.flag]: true }));
      for (let i = 0; i < 600; i++) {
        control.step();
        moved.step();
      }
      assert.equal(
        stateFingerprint(moved),
        stateFingerprint(control),
        `\`${s.flag}\` moved seed ${seed} — the page says it changes nothing`
      );
    }
  }
  // And the other direction: a rule `SWEEP` calls inert with nothing to say
  // about it on the page is a finding that never reached anybody.
  const silent = Object.entries(SWEEP).filter(([, r]) => r.inert).map(([f]) => f);
  assert.deepEqual(
    silent.sort(),
    quietSwitches().map((s) => s.flag).sort(),
    "every rule measured inert must tell the visitor so"
  );
});

test("what a quiet rule says is a sentence, and it is not an apology", () => {
  for (const s of quietSwitches()) {
    assert.ok(s.quiet.length <= 160, `${s.id}: "${s.quiet}" is ${s.quiet.length} characters`);
    assert.match(s.quiet, /nothing changes/, `${s.id} should say plainly that nothing changes`);
    assert.match(s.quiet, /measured/, `${s.id} should say the claim was measured, not asserted`);
  }
  // The binding is one loop over the table rather than a sentence typed into
  // two handlers, so the wording and the measurement that justifies it cannot
  // drift apart.
  assert.match(main, /for \(const s of quietSwitches\(\)\)/, "main.js must bind these from the table");
});

// ---- the promise the last heading makes ----

/**
 * One switch's `change` handler, cut out of `main.js`: everything from its
 * `addEventListener` to the next switch's binding. Textual on purpose —
 * `node --test` cannot run `main.js` (it reaches for a DOM on the first line),
 * so the only way to hold this file to a claim is to read it.
 */
function handlerOf(id) {
  const at = main.indexOf(`$("${id}").addEventListener("change"`);
  assert.notEqual(at, -1, `${id} has no change handler in main.js`);
  const next = main.indexOf('$("toggle-', at + 40);
  return main.slice(at, next === -1 ? main.length : next);
}

test("a world switch writes the config key its row declares", () => {
  // The table says which key each switch moves and the page's behaviour is in
  // another file entirely. A row whose declared key is not the key its handler
  // writes would be a correct-looking table describing a page that does
  // something else — and it is the table this release's grouping, ordering and
  // closure are all computed from.
  for (const s of worldSwitches()) {
    const body = handlerOf(s.id);
    assert.match(
      body,
      new RegExp(`config\\.${s.flag}\\s*=`),
      `${s.id} is declared to write \`config.${s.flag}\` and its handler does not`
    );
    assert.match(body, /syncHash\(\)/, `${s.id} changes the world and does not put it in the permalink`);
  }
});

test("the six under “What you see” cannot change the pond", () => {
  // The claim the heading makes, kept where it is actually made. A view switch
  // that started writing into the config would leave the section's sentence —
  // *the pond runs exactly the same either way* — a lie the page states in
  // plain English to every visitor who reads that far.
  for (const s of viewSwitches()) {
    const body = handlerOf(s.id);
    assert.doesNotMatch(body, /\bconfig\.\w+\s*=/, `${s.id} is in the view section and writes into the config`);
    assert.doesNotMatch(
      body,
      /syncHash\(\)/,
      `${s.id} only changes the picture, so it has no business in the permalink`
    );
  }
});
