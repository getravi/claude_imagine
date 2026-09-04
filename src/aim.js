// aim.js — the one panel that answers the claim on the front door.
//
// The landing page's whole pitch is nine words: *No one programmed them to
// survive. They figured it out.* Thirty releases of surfaces have been built
// under that sentence, and not one of them checks it.
//
// `evolved.js` comes closest and asks a different question. It reports what has
// **changed** — bodies 20% bigger, meat down from 50% of the plate to 31%,
// appetite going whichever way this pond happens to send it. Change is not
// skill. A pond whose animals all drifted 20% bigger and stayed exactly as
// hopeless at finding lunch would fill that board with five true rows and the
// visitor would leave believing something the pond had not earned. The record
// book keeps the bests, the ladder keeps the firsts, the Chronicle keeps the
// story — and **nothing here has ever asked whether the animals in the water
// are any good at the thing nobody taught them**.
//
// This asks. One number, and it costs nothing to take, because the answer is
// already sitting in the buffer the brain was handed:
//
//   **of the animals that can see food, how many are pointed at it?**
//
// `Creature#sense` writes the bearing to the nearest pellet as a sine and a
// cosine relative to the animal's own heading, so `foodCos > 0` is exactly *the
// food is in front of me rather than behind me* — a fact about one animal at
// one instant that a five-year-old can check by looking at the picture. The
// indices come from `doing.js#SENSE`, which is the one place they are declared
// and the one place a test pins them; this module is a second reader of that
// list, not a second opinion about it.
//
// **Why that question and not a better-sounding one.** Every population measure
// I tried first — mean lifespan, food eaten per hundred ticks, share of
// newborns that live to breed — is confounded by *crowding*: they all fall as
// the pond fills, so a pond getting better at surviving would post a graph of
// itself getting worse. Aim is per-animal and per-instant and has no such
// denominator. It is also the only one with an **arithmetic null**: a heading
// drawn at random puts the food in front of you exactly half the time, so 50 in
// 100 is not a baseline anybody had to measure. It is the number to beat, and
// it is free.
//
// ## What the sweep said — twelve seeds, six thousand steps, sampled every ten
//
//  1. **The founders are a coin toss, and they are one on every seed.** Over
//     generation-0 animals only: **47.9% – 58.7%, mean 52.0%**. Forty brains
//     dealt at random are, measurably, no better than random at the one thing
//     this world selects on. That sentence is the panel.
//  2. **Every pond beats them. Twelve of twelve.** The trailing window ends at
//     a mean of **75.2%**, a gain of 23.2 points, from 56.7% on the flattest
//     pond to 89.2% on the steepest.
//  3. **It is selection, not mutation, and I nearly said the wrong one.** With
//     `mutationRate` and `mutationScale` both at zero — no new variation, ever
//     — the pond *still* climbs, 52.3% → 64.9%, up on nine seeds of twelve.
//     The founders are dealt a spread, the ones that happen to steer well have
//     more young, and that alone buys over half the gain. Mutation roughly
//     doubles it (23.2 points against 12.6). So the sentence under the bars
//     says **the ones that happened to head the right way had more young** —
//     which is true in both worlds — rather than crediting mutation, which is
//     true in one.
//  4. **The gate I built to be careful filters almost nothing, and that is a
//     finding about the pond rather than about the gate.** Food is inside an
//     animal's sight on **99.88%** of instants at the default spawn rate — and
//     on **93.8%** with the tap turned fully off, because the standing crop
//     outlives the tap. So the number a visitor reads is very nearly *all of
//     them*, and the panel may honestly say the animals can nearly always see
//     food and the only question is where they are pointed. The gate stays for
//     the starved pond, where it is the difference between measuring aim and
//     measuring luck.
//  5. **The baseline drifts upward by a mean of 1.6 points over the founders'
//     lives** (−1 to +5 across the twelve), because the founders still alive at
//     tick 4,000 are the founders that were better at this. That is selection
//     showing up *inside* the control, and it is the harmless direction: it
//     makes the comparison read smaller than the truth, never larger.
//
// ## The three constants, each chosen against a measurement
//
//  * `SAMPLE_EVERY = 10`. A walk of the living every tenth step, inside the
//    per-step observer `main.js` already runs — `lineage.js` walks the same
//    list every step, so this is a tenth of a cost already being paid.
//  * `NOW_WINDOW = 600`. Windows of 600, 1,200 and 2,400 ticks agree within 2.1
//    points on eleven seeds and disagree by **34.5** on the twelfth (81.0 /
//    73.1 / 46.5), which is the pond that changed fastest. A window is a claim
//    about the word *now*, so it is sized against the pond that moves rather
//    than the eleven that sit still. 600 ticks is ten seconds at 1× and still
//    holds some fifteen thousand animal-instants.
//  * `MIN_SAMPLES = 400`. Both sides clear it between tick **100 and 110** on
//    all twelve seeds — under two seconds — so the panel is a live comparison
//    almost at once rather than a placeholder somebody has to wait out. Its job
//    is to stop a verdict being read off forty instants, not to stall.
//
// And the verdict must be able to say **worse**, because it happens: over 7,086
// reportable instants the trailing window sat four or more points *below* the
// founders on 0.83% of them, and sat level on 21.3%. A board that can only
// report the expected answer is a decoration — `evolved.js`'s rule, and this is
// the release that inherits it.
//
// ## What this panel deliberately does not do
//
// It does not compare *generations*. Bucketing the same samples by
// `creature.generation` and reading the newest cohort gives 40.3% on one seed
// and 90.3% on another, because the newest generation in a pond is a handful of
// animals a few hundred ticks old. The honest comparison is a fixed control
// against a wide window of everybody, not two cohorts of wildly unequal size.
//
// Determinism: PURE OBSERVER. It reads `creature._in` — the buffer the brain
// was already given this tick — and creature ids, writes nothing back, adds no
// field to anything and draws no random number. Sampling is scheduled on the
// **tick** rather than on the frame, so the number two people reading the same
// seed see is the same number: how many steps a frame buys depends on the
// machine, and a reading taken per frame would be a different reading on a
// phone (v1.145's rule, here for the first time on a *statistic* rather than on
// a shape). A pond somebody is measuring is bit for bit a pond nobody is, and
// there is a test.

import { SENSE } from "./doing.js";

/** How often the pond is looked at, in ticks. See the header. */
export const SAMPLE_EVERY = 10;

/** How far back the word "now" reaches, in ticks. See the header. */
export const NOW_WINDOW = 600;

/** Animal-instants either side needs before this panel will name a number. */
export const MIN_SAMPLES = 400;

/**
 * What turning at random gets you, as a share.
 *
 * Not measured and not measurable: a heading drawn uniformly on the circle puts
 * an arbitrary bearing in front of it exactly half the time. It is the one row
 * on this panel that is true of every pond that will ever run here, which is
 * why it is also the row a pond with no opening line of its own falls back to.
 */
export const RANDOM_SHARE = 0.5;

/**
 * How far apart two shares must be before this panel calls them different.
 *
 * Four in a hundred. Below it the two bars are within the width of their own
 * rounding and the honest word is *about the same* — which the panel spends
 * 21.3% of its reportable life saying, nearly all of it in the opening minute
 * while the animals alive now *are* the animals it started with.
 */
export const MOVED = 0.04;

/**
 * The running measurement: a fixed control, a trailing window, and a tick guard.
 *
 * Two accumulators, and the difference between them is the whole design. The
 * control counts only the animals this pond was **handed**, identified by id —
 * `evolved.js`'s rule, and for its reason: this world posts fresh
 * generation-0 animals into a pond that crashes (`autoReseed`) or that somebody
 * presses `✚ Seed life` on, so a control gathered by `generation === 0` could
 * quietly acquire new members halfway through the run and drag itself back
 * toward the coin toss. Ids cannot do that. The window counts everybody alive,
 * and drops what has aged out of `NOW_WINDOW`.
 */
export class AimWatch {
  constructor() {
    /** @type {Set<number>|null} the ids this pond opened with, or null for a pond that arrived running. */
    this.founders = null;
    this.thenN = 0;
    this.thenHit = 0;
    /** @type {Array<{tick:number, n:number, hit:number}>} the trailing window, oldest first. */
    this.recent = [];
    this.nowN = 0;
    this.nowHit = 0;
    // Which tick the last sample was taken on. A paused pond calls the
    // per-step observer once a frame with the tick standing still, and a
    // measurement that counted that would weight whatever the visitor happened
    // to pause on by however long they sat there.
    this._last = -1;
  }

  /**
   * A new pond. Called where `evolved.js`'s snapshot is taken — at the top of
   * the frame, before anything is stepped — so `tick === 0` is the whole of the
   * test "these are the animals it was handed".
   *
   * A world that arrives already running (`📂 Load` pours a saved run into a
   * fresh `World`) gets no control, and the panel says so and falls back to the
   * arithmetic null rather than inventing one. That is a better answer than the
   * empty state the other boards give a loaded pond: `RANDOM_SHARE` is not a
   * measurement this pond failed to take, it is a fact about circles.
   *
   * @param {{tick:number, creatures:Array<{id:number,dead:boolean}>}|null} world
   */
  begin(world) {
    this.founders =
      world && world.tick === 0
        ? new Set(world.creatures.filter((c) => !c.dead).map((c) => c.id))
        : null;
    this.thenN = 0;
    this.thenHit = 0;
    this.recent.length = 0;
    this.nowN = 0;
    this.nowHit = 0;
    this._last = -1;
  }

  /**
   * One look at the pond, from the per-step observer. A no-op on nine steps in
   * ten, and on any step already counted.
   *
   * @param {{tick:number, creatures:Array}} world
   */
  sample(world) {
    if (!world) return;
    const tick = world.tick;
    if (tick === this._last || tick % SAMPLE_EVERY !== 0) return;
    this._last = tick;

    let n = 0;
    let hit = 0;
    for (const c of world.creatures) {
      if (c.dead) continue;
      const s = c._in;
      // Nothing in sight to be aimed at. Rare in a fed pond (0.12% of
      // instants), and the difference between aim and luck in a starved one.
      if (!(s[SENSE.foodProx] > 0)) continue;
      const ahead = s[SENSE.foodCos] > 0;
      n++;
      if (ahead) hit++;
      if (this.founders && this.founders.has(c.id)) {
        this.thenN++;
        if (ahead) this.thenHit++;
      }
    }

    this.recent.push({ tick, n, hit });
    this.nowN += n;
    this.nowHit += hit;
    const cutoff = tick - NOW_WINDOW;
    while (this.recent.length && this.recent[0].tick < cutoff) {
      const old = this.recent.shift();
      this.nowN -= old.n;
      this.nowHit -= old.hit;
    }
  }

  /**
   * What the panel has to say, as plain data. `null` shares mean "not enough
   * yet"; a `null` `then` with a live `now` means a pond that arrived running.
   *
   * @returns {{now: number|null, then: number|null, sawStart: boolean, nowN: number, thenN: number}}
   */
  reading() {
    return {
      now: this.nowN >= MIN_SAMPLES ? this.nowHit / this.nowN : null,
      then: this.thenN >= MIN_SAMPLES ? this.thenHit / this.thenN : null,
      sawStart: this.founders !== null,
      nowN: this.nowN,
      thenN: this.thenN,
    };
  }
}

/** A share as the panel says it: whole animals out of a hundred. */
export function inHundred(share) {
  return Math.round(share * 100);
}

/**
 * The bars, top to bottom: the null, the control, the crowd.
 *
 * Read down, the three rows are the argument — this is what random looks like,
 * this is what the pond was handed, this is what is in the water now — and no
 * row needs the sentence under them to be understood. The null is a row rather
 * than a tick mark on the other two for exactly that reason: an unlabelled line
 * at 50% is a mystery mark, and a mystery mark on a panel built for a stranger
 * is worse than no mark.
 *
 * A row whose share is unknown is left out rather than drawn empty. An empty
 * bar reads as *zero of them*, which is a much stronger claim than *I have not
 * counted enough yet*.
 *
 * @param {ReturnType<AimWatch['reading']>} reading
 * @returns {Array<{key:string, what:string, share:number, lead:boolean}>}
 */
export function aimRows(reading) {
  const rows = [
    { key: "random", what: "Turning at random", share: RANDOM_SHARE, lead: false },
  ];
  if (reading.then !== null) {
    rows.push({
      key: "then",
      what: "The animals it started with",
      share: reading.then,
      lead: false,
    });
  }
  if (reading.now !== null) {
    rows.push({ key: "now", what: "Everyone alive now", share: reading.now, lead: true });
  }
  return rows;
}

/**
 * The verdict over the bars and the sentence under them.
 *
 * Five states, and the two that are easy to forget are the ones this project
 * keeps finding it needed: a pond that has **slipped back**, which happens on
 * 0.83% of reportable instants, and a pond with **no opening line**, which is
 * every pond anybody has ever loaded from a file.
 *
 * @param {ReturnType<AimWatch['reading']>} reading
 * @returns {{mark:string, verdict:string, why:string}}
 */
export function aimVerdict(reading) {
  if (reading.now === null) {
    return {
      mark: "⏳",
      verdict: "Counting",
      why: "A few hundred animal-moments and this can answer. It takes about two seconds.",
    };
  }
  const now = inHundred(reading.now);
  if (reading.then === null) {
    return {
      mark: "🎯",
      verdict: `${now} in 100 are pointed at their food`,
      why: reading.sawStart
        ? "The animals this pond started with have not been watched long enough to compare against yet."
        : "This pond arrived part-way through, so there is no opening line to hold it against — but turning at random gets you 50, and that much is arithmetic rather than a measurement.",
    };
  }
  const then = inHundred(reading.then);
  const d = reading.now - reading.then;
  if (d >= MOVED) {
    return {
      mark: "📈",
      verdict: `Yes — ${now} in 100, up from ${then}`,
      why: "Nobody told them where food is. The first ones did no better than a coin toss, and the ones that happened to head the right way had more young than the ones that did not. That is the whole mechanism.",
    };
  }
  if (d <= -MOVED) {
    return {
      mark: "📉",
      verdict: `Slipping — ${now} in 100, down from ${then}`,
      why: "This is a live measurement of a live crowd, not a score that only climbs. A pond can lose ground; on twelve I watched for six thousand steps, this row read worse on 0.8% of the moments it could speak at all.",
    };
  }
  return {
    mark: "⏱",
    verdict: `Not yet — ${now} in 100, about where they started`,
    why: "Everyone in the water is still close kin to the animals it was handed. On the ponds I have measured, this starts to move after about a thousand steps — ⏩ Skip ahead is worth two and a half of them.",
  };
}

/**
 * The rows, as markup: a label and its number on one line, the bar on its own
 * line under them.
 *
 * **This shape is the fix for the one thing `node --test` could not see and a
 * browser walk could.** The first build put all three on one line, each row its
 * own three-column grid — and a grid's first track is sized by *its own*
 * contents, so `Turning at random` and `The animals it started with` gave their
 * rows different label columns and therefore different bar tracks: 689, 645 and
 * 682 px at 1,280 wide, and 139, 95 and 132 on a 390 px phone. Three bars drawn
 * at three scales, on a panel whose entire job is that they be compared — 50%
 * of 689 px is a *longer* mark than 52% of 645. The CSS comment beside it
 * asserted the rows shared one grid, which was the intention written down
 * instead of the mechanism.
 *
 * A bar on a line of its own cannot have this bug, at any width, without
 * `subgrid` or `display: contents` and their support questions. It costs the
 * panel about fifty pixels of height and buys the phone a bar two and a half
 * times longer than it had.
 */
export function aimHTML(reading) {
  const rows = aimRows(reading);
  return rows
    .map((r) => {
      const pct = (r.share * 100).toFixed(1);
      return (
        `<li class="aimrow${r.lead ? " lead" : ""}">` +
        `<span class="aimhead">` +
        `<span class="aimwhat">${r.what}</span>` +
        `<span class="aimnum">${inHundred(r.share)} in 100</span>` +
        `</span>` +
        `<span class="aimbar" aria-hidden="true"><span style="width:${pct}%"></span></span>` +
        `</li>`
      );
    })
    .join("");
}

/**
 * What the panel depends on, as a string.
 *
 * Keyed on the **printed** numbers rather than on the shares, which is
 * `evolved.js`'s reason sharpened: the window's share moves in the fourth
 * decimal place every ten ticks and every number on this panel is a whole
 * animal out of a hundred, so a key made of the measurements would rebuild the
 * bars sixty times a second to draw the same three lines. The verdict rides
 * along because it can change while both numbers hold still — the moment a
 * four-point gap opens is a moment this panel has something new to say.
 */
export function aimSignature(reading) {
  const v = aimVerdict(reading);
  const then = reading.then === null ? "-" : inHundred(reading.then);
  const now = reading.now === null ? "-" : inHundred(reading.now);
  return `${then}|${now}|${v.verdict}`;
}
