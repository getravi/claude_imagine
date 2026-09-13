// pace.test.js — the pond's four paces, and the one thing they may never do.
//
// The headline assertion here is the determinism one and it is worth saying why
// it is a *test* rather than a comment. v1.176 replaced `for (i < speed)` in the
// animation loop with a budget, because a quarter of a tick is not a loop count.
// Every world this project has ever shipped was stepped by that loop. So the
// first test below runs the budget over the integer paces the loop used to be
// handed and asserts that the carry never once leaves zero and the counts are
// the counts — which is the whole of the claim that the default pond is
// bit-for-bit where `test/fingerprint.test.js` left it.
//
// The rest is arithmetic and inventory: the stops are the three the row offers,
// a pace the row cannot reach lights nothing, and the numbers in `pace.js`'s
// header are derivations of the two measured quantities rather than a table of
// products that can disagree with itself.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  NORMAL_STEPS,
  PACE_STOPS,
  PACE_WALK,
  PAUSE_LABEL,
  PLAY_ID,
  PLAY_LABEL,
  ROW_CLASS,
  ROW_LABEL,
  SWEEP,
  TOUCH_ENHANCED,
  eventsPerSecond,
  generationSeconds,
  paceLabel,
  paceSentence,
  pondCrossing,
  statesPerHold,
  stepBudget,
  stepsFor,
  stopFor,
  stopId,
  ticksPerSecond,
} from "../src/pace.js";
import { declaredMinHeight } from "../src/targetsize.js";
import { MIN_SHOW_MS } from "../src/doing.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(join(ROOT, "app", "index.html"), "utf8");
const css = readFileSync(join(ROOT, "style.css"), "utf8");

test("an integer pace spends every tick it is given and carries nothing, on every frame", () => {
  // The pace the page opens at, the row's fast stop, and the ceiling the slider
  // has offered since v1.0 — the three the old loop could be handed.
  for (const pace of [1, 2, 3, 4, 5, 8, 12, 20]) {
    let carry = 0;
    let total = 0;
    for (let frame = 0; frame < 600; frame++) {
      const spend = stepBudget(carry, pace);
      assert.equal(spend.steps, pace, `${pace}×: frame ${frame} stepped ${spend.steps}`);
      assert.equal(spend.carry, 0, `${pace}×: frame ${frame} left ${spend.carry} over`);
      carry = spend.carry;
      total += spend.steps;
    }
    assert.equal(total, pace * 600, `${pace}×: 600 frames is not 600 frames of it`);
  }
});

test("a quarter spends one tick every fourth frame and never drifts", () => {
  let carry = 0;
  const spent = [];
  for (let frame = 0; frame < 12; frame++) {
    const spend = stepBudget(carry, 0.25);
    carry = spend.carry;
    spent.push(spend.steps);
  }
  assert.deepEqual(spent, [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  // Over a minute of frames the budget is exact, not approximately exact: this
  // is what makes a slow pond a pond stepped less often rather than a pond
  // stepped unevenly.
  let long = 0;
  let c = 0;
  for (let frame = 0; frame < 3600; frame++) {
    const spend = stepBudget(c, 0.25);
    c = spend.carry;
    long += spend.steps;
  }
  assert.equal(long, 900);
});

test("a budget never spends what it was not given, however it is called", () => {
  assert.deepEqual(stepBudget(0, 0), { steps: 0, carry: 0 });
  assert.deepEqual(stepBudget(NaN, 1), { steps: 1, carry: 0 });
  assert.deepEqual(stepBudget(0, NaN), { steps: 0, carry: 0 });
  assert.deepEqual(stepBudget(-5, 1), { steps: 1, carry: 0 }, "a negative carry is not a debt");
  assert.deepEqual(stepBudget(0, -3), { steps: 0, carry: 0 }, "a negative pace is not a rewind");
});

test("the row offers three stops, slowest first, and one of them is where the page opens", () => {
  assert.equal(PACE_STOPS.length, 3);
  assert.deepEqual(
    PACE_STOPS.map((s) => s.key),
    ["slow", "normal", "fast"],
  );
  const steps = PACE_STOPS.map((s) => s.steps);
  assert.deepEqual([...steps].sort((a, b) => a - b), steps, "the stops are not in order");
  assert.ok(steps.includes(NORMAL_STEPS), "no stop is the pace the page opens at");
  assert.ok(steps[0] < NORMAL_STEPS, "the row has no pace slower than the one it opens at");
  for (const s of PACE_STOPS) {
    assert.ok(/^[A-Z][a-z]+$/.test(s.label), `${s.key}: the label is not a bare word`);
    assert.ok(s.say.length > 5, `${s.key}: nothing to say about it out loud`);
  }
});

test("a pace the row cannot reach lights none of it, rather than the nearest", () => {
  assert.equal(stopFor(0.25).key, "slow");
  assert.equal(stopFor(1).key, "normal");
  assert.equal(stopFor(4).key, "fast");
  for (const off of [0.5, 0.75, 2, 3, 3.75, 7, 20]) {
    assert.equal(stopFor(off), null, `${off}× rounded to a stop it is not`);
  }
  assert.equal(stepsFor("slow"), 0.25);
  assert.equal(stepsFor("nowhere"), null);
});

test("the plate says the pace a person would say out loud", () => {
  assert.equal(paceLabel(1), "1×");
  assert.equal(paceLabel(0.25), "0.25×");
  assert.equal(paceLabel(0.5), "0.5×");
  assert.equal(paceLabel(20), "20×");
  assert.equal(paceLabel(NaN), "");
});

test("the sentence is about the pond, and a paused pond says so first", () => {
  assert.match(paceSentence(1, false), /paused/);
  assert.equal(paceSentence(0.25, true), "The pond is running at quarter speed.");
  assert.equal(paceSentence(7, true), "The pond is running at 7× speed.");
  for (const s of [paceSentence(1, true), paceSentence(1, false)]) {
    assert.match(s, /^The pond /, "the sentence names the control rather than the water");
  }
});

test("the derived numbers are derivations of the two that were measured", () => {
  assert.equal(ticksPerSecond(1), 60);
  assert.equal(ticksPerSecond(0.25), 15);
  // The header's claim: a 1,500 ms caption papers over about 6 of the animal's
  // states at 1× and about 1.5 at a quarter.
  assert.equal(statesPerHold(1).toFixed(1), "6.2");
  assert.equal(statesPerHold(0.25).toFixed(1), "1.6");
  assert.equal(statesPerHold(4).toFixed(1), "24.8");
  assert.equal(Math.round(pondCrossing(1)), 20);
  assert.equal(Math.round(pondCrossing(0.25)), 79);
  assert.equal(Math.round(pondCrossing(4)), 5);
  assert.equal(eventsPerSecond(1).toFixed(1), "11.5");
  assert.equal(eventsPerSecond(0.25).toFixed(1), "2.9");
  assert.equal(generationSeconds(1).toFixed(1), "6.7");
  assert.equal(generationSeconds(4).toFixed(1), "1.7");
});

test("the hold the arithmetic rests on is the hold `doing.js` actually ships", () => {
  // The whole argument for a slow pace is that this number is fixed in
  // milliseconds while the pond's is not. If that file ever holds in ticks
  // instead, every row of the table in `pace.js`'s header is wrong.
  assert.equal(SWEEP.holdMs, MIN_SHOW_MS);
});

test("the row is on the page, under the water and above the first moves", () => {
  const row = page.indexOf(`class="${ROW_CLASS}"`);
  const stage = page.indexOf('<section class="stage">');
  const moves = page.indexOf('<section class="firstmoves"');
  assert.ok(row > -1, `no <section class="${ROW_CLASS}"> on the page`);
  assert.ok(row > stage, "the pace row is above the pond it is about");
  assert.ok(row < moves, "the pace row has fallen below the first moves");
  assert.ok(page.includes(`aria-label="${ROW_LABEL}"`), "the row is unlabelled to a listener");
  assert.ok(page.includes(`id="${PLAY_ID}"`), "no play button");
  for (const stop of PACE_STOPS) {
    assert.ok(page.includes(`id="${stopId(stop.key)}"`), `${stop.label} is not on the page`);
    assert.ok(page.includes(`>\n            ${stop.label}\n`), `${stop.label} is not its own label`);
  }
});

test("the play button carries its state in its label and nowhere else", () => {
  // v1.149's rule, and the reason it is checked rather than remembered: a
  // button reading `▶ Play` that also announces itself as pressed tells a
  // listener two different things about one control.
  const at = page.indexOf(`id="${PLAY_ID}"`);
  const tag = page.slice(page.lastIndexOf("<button", at), page.indexOf(">", at));
  assert.doesNotMatch(tag, /aria-pressed/, "the play button carries a second copy of its state");
  assert.ok(page.includes(PAUSE_LABEL), "the page never ships the paused label");
  assert.notEqual(PLAY_LABEL, PAUSE_LABEL);
});

test("exactly one stop ships pressed, and it is the pace the page opens at", () => {
  const pressed = PACE_STOPS.filter((stop) => {
    const at = page.indexOf(`id="${stopId(stop.key)}"`);
    const tag = page.slice(at, page.indexOf(">", at));
    return tag.includes('aria-pressed="true"');
  });
  assert.equal(pressed.length, 1, "the row ships with none or several lit");
  assert.equal(pressed[0].steps, NORMAL_STEPS);
});

test("the slider can name every pace the row offers", () => {
  // The row and the slider are two readings of one number, so a stop the slider
  // cannot hold would be a plate that lies the moment the row is pressed.
  const at = page.indexOf('id="speed"');
  const tag = page.slice(page.lastIndexOf("<input", at), page.indexOf(">", at));
  const attr = (name) => Number(tag.match(new RegExp(`${name}="([\\d.]+)"`))[1]);
  const [min, max, step] = [attr("min"), attr("max"), attr("step")];
  for (const stop of PACE_STOPS) {
    assert.ok(stop.steps >= min && stop.steps <= max, `${stop.label} is off the slider`);
    const offsets = Math.round((stop.steps - min) / step);
    assert.ok(
      Math.abs(min + offsets * step - stop.steps) < 1e-9,
      `${stop.label} falls between two notches of the slider`,
    );
  }
  assert.equal(min, PACE_STOPS[0].steps, "the slider's floor is not the row's slowest");
});

test("`⏸ Pause` is not on the page twice", () => {
  // The reason it left the drawer. Two buttons bound to one flag, 4,400 px
  // apart, is a state with two copies of itself.
  // The comments are excluded, and they have to be: this release argues the
  // point at length in three of them, and prose about a label is not a label.
  const ink = page.replace(/<!--[\s\S]*?-->/g, "");
  assert.equal(ink.split(PAUSE_LABEL).length - 1, 1, "the paused label ships more than once");
  assert.ok(!page.includes('id="btn-pause"'), "the drawer still holds a second pause");
});

test("the row is held to the enhanced touch target, in the stylesheet", () => {
  assert.equal(declaredMinHeight(css, ".pacerow button"), TOUCH_ENHANCED);
});

test("the walk records both viewports, and the phone is the one that moved", () => {
  const vps = Object.keys(PACE_WALK);
  assert.ok(vps.length >= 2, "a walk at one width is not a walk");
  for (const vp of vps) {
    const { before, after } = PACE_WALK[vp];
    for (const side of [before, after]) {
      assert.ok(side.doc > 0 && side.top > 0 && side.rank > 0, `${vp}: an unrecorded walk`);
      assert.ok(side.top < side.doc, `${vp}: a control below the bottom of the page`);
    }
  }
  const phone = PACE_WALK["390x844"];
  assert.ok(
    phone.after.top < phone.before.top / 4,
    "the phone's pace control did not come up the page",
  );
  // And the cost, which is the same cost v1.153 and v1.169 paid: on a desktop
  // the drawer is a column beside the water, so anything leaving it moves down.
  const desk = PACE_WALK["1280x900"];
  assert.ok(desk.after.top > desk.before.top, "the desktop cost is unrecorded, so it is unpaid");
});
