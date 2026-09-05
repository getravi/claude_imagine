// hand.test.js — the words that depend on the hardware (v1.155).
//
// The defect this release fixed was not a bug in any of these strings. Every one
// of them was true, proofread and shipped; they were true *about a mouse*, on a
// page half its visitors open with a thumb. `node --test` cannot tell which
// device is reading a sentence, so the claims here are the ones that survive
// that: both registers exist for every entry, neither register contains a verb
// its own hardware cannot perform, and the two gates that decide which one is
// shown — this module and the stylesheet — ask the browser the same question.
//
// The last of those is the one worth the file. The registers cannot drift from
// each other, because they are in one table; the *switch* can drift from the
// stylesheet, silently, and the page it produces says `tap a creature` above a
// row of keyboard shortcuts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { KEYS_ONLY, MEDIA_QUERY, PHRASES, POINTER, TOUCH, handFor, phraseKeys, say } from "../src/hand.js";
import { DOING_INVITE, doingInvite } from "../src/doing.js";
import { EMPTY_HINT, emptyHint } from "../src/inspectorview.js";
import { MARKS, keyHTML, keySignature } from "../src/key.js";
import { SCENARIOS } from "../src/scenarios.js";
import { makeConfig } from "../src/config.js";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, "..", "app", "index.html"), "utf8");
const css = readFileSync(join(here, "..", "style.css"), "utf8");

/** Things only a mouse or a keyboard can be asked to do. */
const FINE_VERBS = /\bclicks?\b|\bclicking\b|\bdouble-click|\bscroll to zoom\b|\bhover\b|\bmouse\b|\bwheel\b/i;
/** Things only a keyboard can be asked to do. */
const KEY_VERBS = /\bpress (?:an? )?(?:[A-Z]\b|arrow|key)|\barrow keys?\b|\bkeyboard\b|<kbd>/i;
/** Things only a finger can be asked to do. */
const TOUCH_VERBS = /\btaps?\b|\btapping\b|\bpinch|\bdouble-tap|\bswipe\b|\bfinger\b/i;

// ---- the switch ----

test("the hand is the pointer's coarseness and nothing else", () => {
  assert.equal(handFor({ coarse: true }), TOUCH);
  assert.equal(handFor({ coarse: false }), POINTER);
  // A missing answer is a browser that could not be asked, and the honest
  // default is the register this page was written in for its first 154 releases.
  assert.equal(handFor({}), POINTER);
  assert.equal(handFor(), POINTER);
  assert.equal(handFor(null), POINTER);
  // Not truthiness: `matchMedia().matches` is a boolean, and anything else
  // arriving here is a caller that has passed the wrong thing.
  assert.equal(handFor({ coarse: "yes" }), POINTER);
});

test("the stylesheet and this module ask the browser the same question", () => {
  assert.equal(MEDIA_QUERY, "(pointer: coarse)");
  assert.ok(
    css.includes(`@media ${MEDIA_QUERY} {`),
    "style.css does not gate anything on the query hand.js decides the words under",
  );
});

test("the keyboard rows are hidden from a hand with no keys, and only there", () => {
  const rows = page.match(new RegExp(`class="[^"]*\\b${KEYS_ONLY}\\b`, "g")) || [];
  assert.equal(rows.length, 2, "the two paragraphs of accelerators are the whole of this class");
  const block = css.slice(css.indexOf(`@media ${MEDIA_QUERY} {`));
  assert.match(block, new RegExp(`\\.${KEYS_ONLY}\\s*\\{\\s*display:\\s*none`));
  // Hidden *inside* the query and nowhere else: a rule at the top level would
  // take the keys away from the desks that have them.
  const top = css.slice(0, css.indexOf(`@media ${MEDIA_QUERY} {`));
  assert.ok(!top.includes(`.${KEYS_ONLY}`), "keys-only is hidden outside the media query");
  // The screen-reader paragraph about the arrow keys is help rather than an
  // advertisement, and it stays at every pointer.
  assert.match(page, /Arrow keys select a creature/);
  assert.ok(
    !/class="[^"]*keys-only[^"]*"[^>]*>\s*Arrow keys/.test(page),
    "the sr-only keyboard help must not be hidden with the accelerators",
  );
});

// ---- the table ----

test("every sentence exists in both registers", () => {
  const keys = phraseKeys();
  assert.ok(keys.length >= 8, "the table has lost entries");
  for (const key of keys) {
    const pair = PHRASES[key];
    assert.ok(pair.pointer && pair.pointer.length > 10, `${key} has no pointer copy`);
    assert.ok(pair.touch && pair.touch.length > 10, `${key} has no touch copy`);
    assert.notEqual(pair.pointer, pair.touch, `${key} is the same sentence twice`);
    assert.equal(say(key, POINTER), pair.pointer);
    assert.equal(say(key, TOUCH), pair.touch);
  }
});

test("no sentence asks a hand for something it does not have", () => {
  for (const key of phraseKeys()) {
    const { pointer, touch } = PHRASES[key];
    assert.ok(!FINE_VERBS.test(touch), `${key}'s touch copy names a mouse: ${touch}`);
    assert.ok(!KEY_VERBS.test(touch), `${key}'s touch copy names a key: ${touch}`);
    assert.ok(!TOUCH_VERBS.test(pointer), `${key}'s pointer copy names a finger: ${pointer}`);
  }
});

test("every touch sentence names the gesture that replaces what it dropped", () => {
  // The failure this guards is a sentence made *safe* rather than useful — the
  // dead verbs deleted and nothing put in their place, which is how the phone
  // copy of an instruction quietly becomes a statement.
  for (const key of phraseKeys()) {
    assert.match(PHRASES[key].touch, TOUCH_VERBS, `${key}'s touch copy teaches no gesture`);
  }
});

test("the table is prose, and `<kbd>` is the only markup in it", () => {
  for (const key of phraseKeys()) {
    for (const copy of [PHRASES[key].pointer, PHRASES[key].touch]) {
      const tags = copy.match(/<\/?([a-z]+)[^>]*>/g) || [];
      for (const tag of tags) assert.match(tag, /^<\/?kbd>$/, `${key} carries ${tag}`);
      const opens = (copy.match(/<kbd>/g) || []).length;
      const closes = (copy.match(/<\/kbd>/g) || []).length;
      assert.equal(opens, closes, `${key} has an unbalanced <kbd>`);
    }
  }
});

test("an unknown phrase is an empty string rather than a thrown page", () => {
  assert.equal(say("noSuchThing", TOUCH), "");
  // An unknown *hand* falls back to the copy this page has always shipped.
  assert.equal(say("doingInvite", "elbow"), PHRASES.doingInvite.pointer);
});

// ---- the surfaces that read it ----

test("the invitation under the water changes hands", () => {
  assert.equal(DOING_INVITE, PHRASES.doingInvite.pointer, "the exported constant is the pointer copy");
  assert.equal(doingInvite(TOUCH), PHRASES.doingInvite.touch);
  assert.match(doingInvite(POINTER), /click/i);
  assert.match(doingInvite(TOUCH), /\btap\b/i);
  // The specific thing that was wrong: it named two devices a phone has not got
  // and never named the one it has.
  assert.ok(!/\bM\b/.test(doingInvite(TOUCH)), "the touch invitation still offers a key");
});

test("the inspector's empty state changes hands, and stays one hint div", () => {
  assert.equal(EMPTY_HINT, emptyHint(POINTER));
  for (const h of [POINTER, TOUCH]) {
    assert.match(emptyHint(h), /^<div class="hint">.*<\/div>$/);
  }
  assert.match(emptyHint(POINTER), /<kbd>M<\/kbd>/);
  assert.ok(!/<kbd>/.test(emptyHint(TOUCH)), "the touch hint still shows a key cap");
  // It sends a thumb to the button the key is a shortcut for, and that button
  // has to exist on the page it is being sent to.
  assert.match(emptyHint(TOUCH), /Meet somebody/);
  assert.match(page, /id="btn-meet"/);
});

test("the placard's two instructions change hands, and the rest of it does not", () => {
  const config = makeConfig({});
  const withMouse = keyHTML(config, POINTER);
  const withThumb = keyHTML(config, TOUCH);
  assert.notEqual(withMouse, withThumb);
  assert.match(withThumb, /Tap any creature/);
  assert.ok(!/Click any creature/.test(withThumb));
  // Every row still appears in both, and only the two that instruct differ.
  const rows = (html) => html.split("</li>").filter(Boolean);
  assert.equal(rows(withMouse).length, rows(withThumb).length);
  const differing = rows(withMouse).filter((r, i) => r !== rows(withThumb)[i]).length;
  assert.equal(differing, 2, "a row changed hands that was not an instruction");
  // The rows that carry a phrase carry the pointer copy as their static line, so
  // an older caller reads what it always read.
  for (const mark of MARKS) {
    if (!mark.phrase) continue;
    assert.equal(mark.line, PHRASES[mark.phrase].pointer, `${mark.id}'s line has drifted`);
  }
});

test("the placard is rebuilt when the hand changes", () => {
  const config = makeConfig({});
  assert.notEqual(keySignature(config, POINTER), keySignature(config, TOUCH));
  // …and still by the marks the pond can draw, which is what it was for.
  assert.notEqual(keySignature(makeConfig({ predation: false }), POINTER), keySignature(config, POINTER));
});

// ---- the sentences that should not need a register at all ----

test("no curated world's blurb names an input device", () => {
  // A sentence that is not teaching the gesture should use the neutral verb this
  // page already owns rather than earning an entry in the table. `The Augment`
  // said *click a creature* until v1.155, in a blurb that is read out as a
  // banner on every device.
  for (const scn of SCENARIOS) {
    for (const copy of [scn.hook, scn.blurb]) {
      assert.ok(!FINE_VERBS.test(copy), `${scn.id} names a mouse: ${copy}`);
      assert.ok(!KEY_VERBS.test(copy), `${scn.id} names a key: ${copy}`);
    }
  }
});
