// anotherpond.test.js — the door out of this pond, and the way back (v1.175).
//
// Three things are worth pinning here and only one of them is the arithmetic.
// The first is that this module **draws nothing**: the die is handed in, so a
// feature that reaches for `Math.random` cannot appear in it by accident and
// the second prime directive stays a property of the file rather than a habit.
// The second is the rule the whole cycle is about — a door that will not hand
// a visitor a place they have already been — held against a die that is made
// to collide on purpose, because the real one collides once in 1,536 presses
// and a test that waits for that is a test that never runs. The third is the
// page: both controls are in the main column, above the water, which is the
// claim `firstmoves.js` has had to make twice before about this same drawer.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  ANOTHER_HINT,
  ANOTHER_LABEL,
  ATTEMPTS,
  BACK_HINT_BLANK,
  DOOR_WALK,
  NAME_SPACE,
  SEED_CEILING,
  SWEEP,
  backHint,
  backLabel,
  pickSeed,
  welcomeBack,
} from "../src/anotherpond.js";
import { ADJECTIVES, LANDFORMS, pondName } from "../src/pondname.js";
import { ASIDE_OPENS } from "../src/firstmoves.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

/** A die that walks a list and then repeats its last face for ever. */
function dieOf(...faces) {
  let i = 0;
  return () => faces[Math.min(i++, faces.length - 1)];
}

// ---- it draws nothing of its own ----

test("the module reaches for no randomness at all", () => {
  const src = read("src/anotherpond.js");
  const code = src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/Math\.random/.test(code), "the draw is handed in, never reached for");
});

test("the same die twice gives the same pond", () => {
  const a = pickSeed(dieOf(0.123456789));
  const b = pickSeed(dieOf(0.123456789));
  assert.equal(a, b);
});

test("a seed is a whole number inside the die's range", () => {
  for (const face of [0, 0.5, 0.999999]) {
    const seed = pickSeed(dieOf(face));
    assert.ok(Number.isInteger(seed), `${face} gave ${seed}`);
    assert.ok(seed >= 0 && seed < SEED_CEILING, `${face} gave ${seed}`);
  }
});

// ---- the rule: somewhere you have not been ----

test("a face that names a pond already visited is rejected for the next one", () => {
  const first = Math.floor(0.2 * SEED_CEILING);
  const second = Math.floor(0.7 * SEED_CEILING);
  const seen = new Set([pondName(first).name]);
  assert.equal(pickSeed(dieOf(0.2, 0.7), seen), second);
});

test("an empty log takes the first face", () => {
  assert.equal(pickSeed(dieOf(0.2, 0.7), new Set()), Math.floor(0.2 * SEED_CEILING));
});

test("a die that only ever offers a place you have been still halts", () => {
  // The visitor who has somehow seen all 1,536 names gets a repeat rather than
  // a hung page, and the loop is what says so: this die has one face and that
  // face is already in the log.
  const only = Math.floor(0.4 * SEED_CEILING);
  const seen = new Set([pondName(only).name]);
  let rolls = 0;
  const counted = () => {
    rolls++;
    return 0.4;
  };
  assert.equal(pickSeed(counted, seen), only);
  assert.equal(rolls, ATTEMPTS, "it spends its allowance and no more");
});

test("the log is read by name, not by seed — which is the whole point", () => {
  // Two seeds sharing a name is the case the die has never known about, and
  // `pondname.js` names the first pair: seed 62 is seed 34's Nameless Ford.
  assert.equal(pondName(34).name, pondName(62).name);
  const seen = new Set([pondName(34).name]);
  const collide = 62 / SEED_CEILING;
  const other = 0.77;
  assert.notEqual(pickSeed(dieOf(collide, other), seen), 62);
});

// ---- the words ----

test("the door says where it goes, in words with no jargon in them", () => {
  assert.match(ANOTHER_LABEL, /^🎲 /);
  assert.ok(/pond/i.test(ANOTHER_LABEL), ANOTHER_LABEL);
  assert.ok(ANOTHER_LABEL.split(" ").length <= 4, "a label, not a sentence");
  assert.ok(ANOTHER_HINT.length > ANOTHER_LABEL.length, "the spoken name spells the promise out");
});

test("the way back names the place rather than saying 'back'", () => {
  const label = backLabel(314);
  assert.equal(label, `↩ ${pondName(314).name}`);
  assert.ok(!/\bback\b/i.test(label), "the place is the label");
  assert.match(backHint(314), /Back to .+, seed 314$/);
});

test("a return is greeted differently from an arrival", () => {
  assert.match(welcomeBack(314), /^🪷 /);
  assert.ok(welcomeBack(314).includes(pondName(314).name));
  assert.notEqual(welcomeBack(314), `🪷 Welcome to ${pondName(314).name}.`);
});

// ---- the records ----

test("the name space is counted off the word lists, never typed", () => {
  assert.equal(NAME_SPACE, ADJECTIVES.length * LANDFORMS.length);
  assert.equal(SWEEP.namesReached, NAME_SPACE, "the sweep reached every name there is");
});

test("the sweep says the repeat gets worse the longer a visitor stays", () => {
  const presses = Object.keys(SWEEP.repeat).map(Number).sort((a, b) => a - b);
  for (let i = 1; i < presses.length; i++) {
    assert.ok(
      SWEEP.repeat[presses[i]] > SWEEP.repeat[presses[i - 1]],
      `${presses[i]} presses should repeat more often than ${presses[i - 1]}`,
    );
  }
  // One press in 1,536 lands on the name already on the plate, which is the
  // press that rebuilds the world and says nothing.
  assert.ok(Math.abs(SWEEP.silentPresses - 100 / NAME_SPACE) < 0.01);
});

test("the rejection costs about one draw, which is why it is free", () => {
  assert.ok(SWEEP.rejectCost.meanDraws < 1.05, "a press is one roll and a bit");
  assert.ok(SWEEP.rejectCost.worst < ATTEMPTS, "the worst case never reached the allowance");
  assert.equal(SWEEP.rejectCost.exhausted, 0);
});

test("the walk says the door came up the page at both widths", () => {
  for (const [vp, walk] of Object.entries(DOOR_WALK)) {
    assert.ok(walk.after.top < walk.before.top, `${vp}: it should be higher up the page`);
    assert.ok(walk.after.rank < walk.before.rank, `${vp}: it should be earlier in the queue`);
    assert.ok(walk.after.depth < 0.1, `${vp}: the first tenth of the document`);
    assert.equal(walk.after.of, walk.before.of + 1, `${vp}: one target more than before`);
    for (const side of ["before", "after"]) {
      assert.ok(
        Math.abs(walk[side].depth - walk[side].top / walk[side].doc) < 0.005,
        `${vp} ${side}: depth disagrees with top/doc`,
      );
    }
  }
});

// ---- the page ----

test("both controls stand in the main column, ahead of the drawer", () => {
  // `firstmoves.js`'s claim, made a third time about the same drawer: a control
  // a stranger is offered does not live below sixteen panels of prose.
  const page = read("app/index.html");
  const aside = page.indexOf(ASIDE_OPENS);
  assert.ok(aside > 0);
  for (const id of ["btn-another", "btn-back"]) {
    const at = page.indexOf(`id="${id}"`);
    assert.ok(at > 0, `${id} is on the page`);
    assert.ok(at < aside, `${id} is in the main column`);
  }
});

test("the door stands beside the sentence it answers", () => {
  // The plate reads *the same seed always grows the same pond*, and the whole
  // argument for this control's address is that the next thought after that
  // sentence should have somewhere to go.
  const page = read("app/index.html");
  const plate = page.indexOf('class="pondplate"');
  const end = page.indexOf("</section>", plate);
  const block = page.slice(plate, end);
  assert.match(block, /the same seed always grows the\s+same pond/);
  assert.ok(block.includes('id="btn-another"'), "the door is inside the plate");
  assert.ok(block.includes('id="btn-back"'), "and so is the way back");
});

test("the way back is hidden until there is somewhere to go back to", () => {
  const page = read("app/index.html");
  const at = page.indexOf('id="btn-back"');
  const tag = page.slice(at, page.indexOf(">", at));
  assert.ok(tag.includes("hidden"), "a stranger arrives with one new button, not two");
});

test("both announce themselves before the script has run", () => {
  // `markup.js`'s rule: a control whose whole content arrives with the script
  // is a control announced by its tag name until it does. Both ship an
  // `aria-label`, and both are pinned to the module so the copy cannot drift —
  // which is the other half of the same rule, and the half v1.172 went to the
  // front door to learn.
  const page = read("app/index.html");
  assert.ok(page.includes(`aria-label="${ANOTHER_HINT}"`), "the door's spoken name");
  assert.ok(page.includes(`aria-label="${BACK_HINT_BLANK}"`), "the way back's, before it has one");
});

test("neither label is typed into the page", () => {
  // v1.172's rule: a word that is also a constant in a module is a second copy
  // that can drift. Both buttons ship empty and are written at load.
  const page = read("app/index.html");
  assert.ok(!page.includes(ANOTHER_LABEL), "the door's words live in anotherpond.js");
  assert.ok(!page.includes("↩ "), "the way back's words do too");
});

test("both are held to the enhanced 44 px, like every other first move", () => {
  const css = read("style.css");
  const at = css.indexOf(".pondplate button.another");
  assert.ok(at > 0, "the rule exists");
  const block = css.slice(at, css.indexOf("}", at));
  assert.match(block, /min-height:\s*44px/);
});
