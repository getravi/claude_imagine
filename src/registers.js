// registers.js — the two things this page says about one creature, compared.
//
// A selected creature is described twice. The inspector renders a fact grid
// (`inspect.js`), and the live region says a sentence (`describe.js`). They are
// two renderings of one subject, each assembled from its own hand-written list
// of clauses, each gated by its own hand-written `if (config.x)` — and until
// this release nothing had ever put the two side by side.
//
// The history says that is where the asymmetries live. v1.77 walked the
// inspector and found contagion and signalling missing from it while
// `describeSelection()` had said "sick" and "immune" about the *same* selection
// since v1.31 — a listener told something a reader was not, for forty-six
// releases. v1.102 gave the whisker a row and a clause in one cycle so the two
// could not part, and closed by naming the next one: the foot has had a row
// since v1.33 and has never had a clause. Both findings are the same shape and
// both were found by hand.
//
// So this is the instrument. It is the sweep v1.53 ran on a creature and v1.91
// ran on a world (`statesweep.js`, whose walker and perturbation this reuses
// rather than copying), pointed at *text*: move one field of one creature and
// ask which of the two renderings notices. A field that moves the grid and not
// the sentence is a fact a reader is given and a listener is not, and the other
// way round.
//
// PURE OBSERVER. It renders text and restores every field it moves; nothing in
// the simulation reads it back, and it draws no random numbers. Both renderings
// are themselves observers (`inspect.js`, `describe.js`), one of which runs a
// brain forward with learning suppressed.
//
// **What it is not.** The domain is the two renderings that are *text in a
// module* — the rows and the sentence. It excludes everything the panel says
// with a picture or an identifier: the heading, the swatch, the ancestry pips,
// the Species link and the two brain figures, all declared where they always
// were, in `FIELD_REPORTS`. So a field this sweep calls unread may still be on
// the panel; what it cannot be is *in the words*.
//
// One of the two reasons for that exclusion expired in v1.108. It used to read
// "…that `main.js` builds … `node --test` cannot reach the code that draws
// them", and the second clause was the load-bearing one and is now false:
// `inspectorview.js` builds all five and `test/inspectorview.test.js` reads
// them. What survives is the first clause, which is about *kind* rather than
// reach — a swatch is not a sentence, so a sweep that asks which of two
// renderings noticed a moved field has nothing to compare it against. The
// exclusion is a choice again instead of a limitation, which is the only state
// a declared domain should ever be in.

import { stateSites } from "./statesweep.js";
import { perturb } from "./levers.js";
import { creatureFacts } from "./inspect.js";
import { describeSelection } from "./describe.js";

/**
 * The reader's rendering: every row the inspector would show, term and value.
 *
 * Joined into one string because the question is whether the *panel* changed,
 * not which row did — a field that moves any row is a field a reader is given.
 * @param {object} c
 * @param {object} config
 */
export function readingOf(c, config) {
  return creatureFacts(c, config)
    .map((f) => `${f.key}=${f.value}`)
    .join(" · ");
}

/**
 * The listener's rendering, in its fullest form: the reach clause on, because
 * the panel's Reach row is always there and a comparison has to give each
 * register everything it is able to say. The trail clause is left out — a path
 * is not a field of a creature, so it is outside the domain this sweeps.
 * @param {object} c
 * @param {object} config
 */
export function hearingOf(c, config) {
  return describeSelection(c, config, null, true);
}

/**
 * How a site is moved.
 *
 * `levers.js`'s 37% push is the perturbation both other sweeps use and it is
 * first here, so the three agree about the ordinary case. The three after it
 * exist because these readouts are *banded* in a way a pond's arithmetic is
 * not: `regionOf` cuts the pond into ninths, `dietText` into three words,
 * `healthText` into three states. A 37% push on an x of 700 lands in the same
 * third of the same pond and reports a coordinate no sentence mentions, which
 * is v1.38's one-sided nudge and v1.102's unmovable infinity in a third
 * costume — **a perturbation is a claim that the value has somewhere to go**,
 * and a banded readout is a value with three places to be.
 */
export const LADDER = [(v) => perturb(v), (v) => -v, () => 0, () => 1];

/** Resolve a dotted path to the object holding it and the final key. */
function resolve(root, path) {
  const parts = path.split(".");
  let owner = root;
  for (let i = 0; i < parts.length - 1; i++) owner = owner[parts[i]];
  return { owner, key: parts[parts.length - 1] };
}

/**
 * Move one site every way the ladder can, render both registers each time, and
 * put the field back exactly as it was.
 *
 * @param {object} c the subject
 * @param {object} config
 * @param {{path: string, kind: string}} site
 * @returns {{read: boolean, heard: boolean, probed: boolean}}
 */
export function probeSite(c, config, site) {
  const { owner, key } = resolve(c, site.path);
  const before = { read: readingOf(c, config), heard: hearingOf(c, config) };
  const out = { read: false, heard: false, probed: false };

  const tryValue = (set, restore) => {
    set();
    out.read ||= readingOf(c, config) !== before.read;
    out.heard ||= hearingOf(c, config) !== before.heard;
    restore();
  };

  const v = owner[key];
  if (typeof v === "boolean") {
    out.probed = true;
    tryValue(
      () => (owner[key] = !v),
      () => (owner[key] = v)
    );
  } else if (typeof v === "number") {
    out.probed = true;
    for (const step of LADDER) {
      tryValue(
        () => (owner[key] = step(v)),
        () => (owner[key] = v)
      );
    }
  } else if (ArrayBuffer.isView(v) || (Array.isArray(v) && v.every((x) => typeof x === "number"))) {
    // The middle element, for `statesweep.js`'s reason: moving all of them
    // measures a different thing, and the middle is the least likely to be a
    // boundary case.
    if (v.length) {
      out.probed = true;
      const i = Math.floor(v.length / 2);
      const was = v[i];
      for (const step of LADDER) {
        tryValue(
          () => (v[i] = step(was)),
          () => (v[i] = was)
        );
      }
    }
  }
  return out;
}

/**
 * Which register each of a creature's own fields reaches, over a set of
 * subjects.
 *
 * The union over subjects is the load-bearing part, not a nicety. Half of what
 * these two renderings say is a *state*: `healthText` reads `infectedAtAge`
 * only while its subject is ill, `whiskerText` says a word rather than a number
 * where the whisker found nothing. A sweep run on one healthy creature reports
 * the countdown as a field nothing prints, which is true of that creature and
 * false of the panel — v1.97's "the audit is one world deep" one level down.
 *
 * Fields whose value no perturbation here can express (a null, an object with
 * no numbers in it) come back `probed: false` rather than as a quiet pass, so
 * that a silence the instrument could not test is visible as one.
 *
 * @param {Array<object>} subjects creatures covering the states the text can be in
 * @param {object} config
 * @returns {Object<string, {read: boolean, heard: boolean, probed: boolean}>}
 */
export function fieldRegisters(subjects, config) {
  const out = {};
  for (const c of subjects) {
    for (const field of Object.keys(c)) {
      out[field] ||= { read: false, heard: false, probed: false };
    }
    for (const site of stateSites(c)) {
      const field = site.path.split(".")[0];
      const verdict = probeSite(c, config, site);
      const e = (out[field] ||= { read: false, heard: false, probed: false });
      e.read ||= verdict.read;
      e.heard ||= verdict.heard;
      e.probed ||= verdict.probed;
    }
  }
  return out;
}

/**
 * The states a selection can be in, as subjects for the sweep.
 *
 * Clones rather than live creatures, because the sweep has to be able to place
 * its subject in a state the pond it came from may not currently contain — a
 * pond with no epidemic in it has nobody whose Health row is a countdown. Each
 * clone keeps its prototype, so `groundSway` and `wallSway` still work.
 *
 * @param {Array<object>} living creatures from a stepped world
 * @returns {Array<object>}
 */
export function registerSubjects(living) {
  const clone = (c, fields) =>
    Object.assign(Object.create(Object.getPrototypeOf(c), Object.getOwnPropertyDescriptors(c)), fields);
  const base = living[0];
  // The one subject that is not a founder (v1.146). `world.step` keeps
  // survivors in place and appends the newborns, so a slice off the front of
  // `world.creatures` is a slice of the *oldest* animals — and every field that
  // differs between a founder and its descendants is therefore constant across
  // a subject list built that way. `parentId` is the first such field this
  // project has had, and it arrived reading `null` on all four subjects, which
  // is what a field no perturbation can express looks like from the outside.
  const born = living.find((c) => c.generation > 0);
  return [
    base,
    ...(born ? [born] : []),
    clone(base, { infected: true, immune: false, infectedAtAge: Math.max(0, base.age - 10) }),
    clone(base, { infected: false, immune: true, infectedAtAge: 5 }),
    // A whisker that found nothing: the row and the clause both say a word
    // instead of a number there, which is a different reading of the same field.
    clone(base, { rockAhead: Infinity, wallFeel: 0, walled: false }),
    ...living.slice(1, 4),
  ];
}
