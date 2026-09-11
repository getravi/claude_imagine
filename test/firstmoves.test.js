// firstmoves.test.js — the presses a stranger is offered (v1.153, v1.169).
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
// else: the guide, which points at two of these by id, and the stylesheet, which
// is where the 44 px lives.
//
// v1.169 added the half that was missing, and the hole was the shape of this
// file's own subject. Every test below walked `FIRST_MOVES` and asked whether
// each of *those* controls was in the main column; all of them always were, and
// `🥣 Feed by hand` sat in the drawer for sixteen releases at 4,665 px of a
// 5,678 px page with nothing here able to notice, because **a completeness check
// that iterates over its own answer cannot find what is missing from it.** The
// new test iterates over the page instead: every button in the aside must be
// named in `DRAWER` with a reason, or the build is red.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  AIMED_WALK,
  ASIDE_OPENS,
  DRAWER,
  FIRST_MOVES,
  ROW_CLASS,
  ROW_RULE,
  TOUCH_ENHANCED,
  WALK,
  depthShare,
  drawerButtons,
  firstMoveIds,
  inMainColumn,
} from "../src/firstmoves.js";
import { STOPS } from "../src/tour.js";
import { TARGET_MIN, CONTROLS, declaredMinHeight } from "../src/targetsize.js";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, "..", "app", "index.html"), "utf8");
const css = readFileSync(join(here, "..", "style.css"), "utf8");

// ---- the module ----

test("the inventory names four controls, once each, with a question apiece", () => {
  const ids = firstMoveIds();
  assert.equal(ids.length, 4);
  assert.equal(new Set(ids).size, 4, "an id listed twice");
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

// ---- the half that walks the page rather than the list (v1.169) ----

test("every control left in the drawer is named, with a reason that is not `advanced`", () => {
  const inDrawer = drawerButtons(page);
  assert.ok(inDrawer.length > 5, "the drawer scan found almost nothing — it is measuring the wrong thing");
  for (const id of inDrawer) {
    const why = DRAWER[id];
    assert.ok(
      why,
      `#${id} is in the drawer of settings and nothing says why. Either it is a first move — ` +
        `see src/firstmoves.js for what that cost the last two times — or it belongs in DRAWER ` +
        `with a sentence saying what it does.`,
    );
    assert.ok(why.length > 20, `#${id}'s reason is too short to be one`);
    // The bar from the module's own comment: a control is excused for what it
    // does, never for who it is imagined to be for. "Advanced" is the judgement
    // that filed the aimed control under the unaimed one.
    assert.doesNotMatch(
      why,
      /\b(advanced|expert|power user|nerd|for beginners)\b/i,
      `#${id} is excused for the kind of person it is for, which is not a reason`,
    );
  }
});

test("the drawer's list has nothing in it that is not in the drawer", () => {
  // The other direction, and the one that rots: a control promoted out of the
  // panel leaves its excuse behind, and an excuse for a control that is no
  // longer there reads exactly like coverage.
  const inDrawer = new Set(drawerButtons(page));
  for (const id of Object.keys(DRAWER)) {
    assert.ok(inDrawer.has(id), `DRAWER excuses #${id}, which is not in the drawer any more`);
  }
  for (const move of FIRST_MOVES) {
    assert.ok(!(move.id in DRAWER), `${move.label} is both a first move and excused from being one`);
  }
});

test("drawerButtons reads the aside and stops at the end of it", () => {
  const doc = `<main><button id="btn-main"></button></main>${ASIDE_OPENS}` +
    `<button id="btn-in">x</button><button\n  id="btn-wrapped"\n  class="mini">y</button></aside>` +
    `<button id="btn-overlay"></button>`;
  assert.deepEqual(drawerButtons(doc), ["btn-in", "btn-wrapped"]);
  assert.deepEqual(drawerButtons("<main></main>"), [], "a page with no drawer has nothing in it");
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

test("the walk agrees with the inventory about how big these are now", () => {
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

test("the aimed control's walk is a phone win bought with a desktop scroll", () => {
  const phone = AIMED_WALK["390x844"];
  const desk = AIMED_WALK["1280x900"];
  assert.ok(
    depthShare(phone.before.top, phone.before.doc) > 0.8,
    "the before-number no longer describes a button in the drawer",
  );
  assert.ok(
    depthShare(phone.after.top, phone.after.doc) < 0.2,
    "on a phone the pond's only aimed control is no longer in the first fifth of the page",
  );
  assert.ok(phone.after.rank < phone.before.rank, "it is no later in the queue than it was");
  // The cost, asserted rather than described, so a later release cannot quietly
  // decide the trade was free.
  assert.ok(desk.after.top > desk.before.top, "the desktop cost has been written out of the record");
  for (const pass of [phone, desk]) {
    for (const side of ["before", "after"]) {
      assert.ok(pass[side].top < pass[side].doc, "a control past the end of its own document");
      assert.ok(pass[side].rank > 0, "a control nothing comes before, including itself");
    }
  }
});
