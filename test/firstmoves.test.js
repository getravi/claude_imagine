// firstmoves.test.js — the three presses a stranger is offered (v1.153).
//
// The bug this release fixed could not have failed a test in this suite, and
// that is the thing worth building a test around. `👋 Meet somebody` existed,
// was labelled, was the right colour, passed the target-size bar at both
// viewports, and was the eighteenth control a phone visitor could reach —
// 3,692 px down a 4,815 px page, below every panel, because one column puts the
// aside last. Nine tests touched that button and every one of them asked
// whether it was *there*.
//
// So this file asks a question about *order* instead, in the only form
// `node --test` can hold it: a control the page tells a visitor to press must
// appear in the shipped markup before the drawer of settings opens. That is not
// the same claim as "it is near the top" — a document order is not a layout —
// but it is the half that a browser cannot silently take away, and it is the
// half that was violated. The rest is written down as measurements in
// `firstmoves.js#WALK`, which is a recording and says so.
//
// The second half checks the two places this row is described from somewhere
// else: the guide, which points at two of these three by id, and the stylesheet,
// which is where the 44 px lives.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  ASIDE_OPENS,
  FIRST_MOVES,
  ROW_CLASS,
  ROW_RULE,
  TOUCH_ENHANCED,
  WALK,
  depthShare,
  firstMoveIds,
  inMainColumn,
} from "../src/firstmoves.js";
import { STOPS } from "../src/tour.js";
import { TARGET_MIN, CONTROLS, declaredMinHeight } from "../src/targetsize.js";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, "..", "app", "index.html"), "utf8");
const css = readFileSync(join(here, "..", "style.css"), "utf8");

// ---- the module ----

test("the inventory names three controls, once each, with a question apiece", () => {
  const ids = firstMoveIds();
  assert.equal(ids.length, 3);
  assert.equal(new Set(ids).size, 3, "an id listed twice");
  for (const move of FIRST_MOVES) {
    assert.match(move.id, /^btn-/, `${move.id} is not a button id`);
    assert.ok(move.label.length > 3, `${move.id} has no label`);
    assert.ok(move.asks.endsWith("?"), `${move.id}'s reason for being here is not a question`);
  }
});

test("depthShare is a fraction, and says nothing about a page with no height", () => {
  assert.equal(depthShare(3692, 4815).toFixed(3), "0.767");
  assert.equal(depthShare(0, 100), 0);
  assert.equal(depthShare(500, 100), 1, "past the bottom is the bottom, not more than one");
  assert.equal(depthShare(10, 0), null);
  assert.equal(depthShare(10, NaN), null);
});

test("inMainColumn reads document order, and a page with no drawer has no bad places", () => {
  const doc = `<main><button id="btn-a"></button></main>${ASIDE_OPENS}<button id="btn-b"></button></aside>`;
  assert.equal(inMainColumn(doc, "btn-a"), true);
  assert.equal(inMainColumn(doc, "btn-b"), false);
  assert.equal(inMainColumn(doc, "btn-nowhere"), false, "a control that is not there is not in the main column");
  assert.equal(inMainColumn('<button id="btn-a"></button>', "btn-a"), true);
});

// ---- the shipped page ----

test("every first move is in the main column, not in the drawer of settings", () => {
  assert.ok(page.includes(ASIDE_OPENS), "the page has no aside — this test is measuring nothing");
  for (const move of FIRST_MOVES) {
    assert.ok(page.includes(`id="${move.id}"`), `${move.label} is not on the page at all`);
    assert.ok(
      inMainColumn(page, move.id),
      `${move.label} is inside the panel again. On one column that panel is below every other ` +
        `thing on this page — see src/firstmoves.js for what that cost the last time.`,
    );
  }
});

test("they are one row, in the order a first minute asks for them", () => {
  const row = page.match(new RegExp(`<section class="${ROW_CLASS}"[^>]*>([\\s\\S]*?)</section>`));
  assert.ok(row, `no <section class="${ROW_CLASS}"> on the page`);
  const found = [...row[1].matchAll(/id="(btn-[a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(found, firstMoveIds(), "the row holds a different set, or a different order");
  assert.match(row[0], /aria-label="[^"]+"/, "the row is unlabelled in ink and unlabelled to a listener");
});

test("the row sits under the water and above the line that narrates it", () => {
  const stage = page.indexOf('<section class="stage">');
  const row = page.indexOf(`<section class="${ROW_CLASS}"`);
  const doing = page.indexOf('id="doing"');
  assert.ok(stage > -1 && row > -1 && doing > -1);
  assert.ok(row > stage, "the row is above the pond it belongs to");
  assert.ok(row < doing, "the row has come between #doing and the obituary that answers it");
});

test("the guide's stops still point at controls a phone visitor can reach", () => {
  // The reason this test is here and not in tour.test.js: the tour is the
  // surface that *tells* a visitor to press these, and v1.151's lesson was that
  // a surface pointing at another one has to be re-checked whenever the other
  // one moves. This is the standing form of that check.
  const pointed = STOPS.filter((s) => s.target.startsWith("btn-")).map((s) => s.target);
  assert.ok(pointed.length > 0, "the guide points at no control at all");
  for (const id of pointed) {
    assert.ok(inMainColumn(page, id), `the guide's stop rings #${id}, which is back in the panel`);
  }
});

// ---- the size the row is drawn at ----

test("the row's controls clear the enhanced target bar, in the stylesheet", () => {
  const declared = declaredMinHeight(css, ROW_RULE);
  assert.equal(
    declared,
    TOUCH_ENHANCED,
    `${ROW_RULE} should declare min-height: ${TOUCH_ENHANCED}px — the three presses this page ` +
      `recommends are the ones worth spending SC 2.5.5 on`,
  );
  assert.ok(TOUCH_ENHANCED > TARGET_MIN, "the enhanced bar is not above the minimum one");
});

test("the walk agrees with the inventory about how big these three are now", () => {
  for (const move of FIRST_MOVES) {
    const rows = CONTROLS.filter((c) => c.sel === `#${move.id}`);
    assert.equal(rows.length, 2, `${move.label} is not recorded at both viewports`);
    for (const r of rows) {
      assert.equal(r.h, TOUCH_ENHANCED, `${move.label} at ${r.vp} was walked at ${r.h}px, not ${TOUCH_ENHANCED}`);
    }
  }
});

test("the walk records a before and an after at both viewports, and the phone is the point", () => {
  for (const [vp, pass] of Object.entries(WALK)) {
    for (const side of ["before", "after"]) {
      assert.ok(pass[side], `${vp} has no ${side}`);
      assert.ok(pass[side].doc > 0 && pass[side].firstPress > 0, `${vp}'s ${side} is not a measurement`);
      assert.ok(
        pass[side].firstPress < pass[side].doc,
        `${vp}'s ${side} puts the first press past the end of the document`,
      );
    }
  }
  const phone = WALK["390x844"];
  assert.ok(
    depthShare(phone.after.firstPress, phone.after.doc) < 0.25,
    "on a phone the first press this page recommends is no longer in the first quarter of it",
  );
  assert.ok(
    depthShare(phone.before.firstPress, phone.before.doc) > 0.7,
    "the before-number no longer describes the page this release was written about",
  );
});
