// skip.js — the fast-forward, and the note it leaves on the fridge.
//
// The promise on the front door is **watch evolution happen**, and the honest
// small print is that evolution here happens at about a generation every four
// hundred steps. A visitor who arrives, watches for ninety seconds and leaves
// has seen a screensaver. Everything this project has built to close that gap
// so far has been a *narrator* — a headline, a chronicle, a record board, a
// board that says how far the animals have moved from their founders — and
// every one of them still asks the visitor to supply the one ingredient nobody
// browsing at eleven at night has any of, which is **time**.
//
// The speed slider has been the answer since v1.0 and it is an instrument for
// somebody who already believes there is something worth waiting for: drag it
// to 20×, keep watching, notice — eventually — that the arrowheads are bigger.
// It hands you the waiting and keeps the noticing for itself.
//
// `⏩ Skip ahead` does both halves. One press runs the pond forward 2,600 steps
// and then tells you, in five sentences and a handful of the Chronicle's own
// lines, what changed while you were gone. It is the highlights reel, and it is
// the only control here that answers *what did I miss?* rather than *what is
// happening now?*.
//
// **How far a skip goes, and why it is not a number I picked.** It is
// `config.seasonLength` — 2,600 steps, the pond's own year. Measured over 12
// seeds × 5 launch points (0, 500, 1,500, 3,000 and 5,000 steps in), 60 skips
// per length:
//
//   * At **2,600** every one of the 60 skips had at least one Chronicle line to
//     report (mean 6.83, median 5, max 19).
//   * At **1,300** — half as far — **4 of 60 came back with nothing at all**,
//     and a fast-forward that reports nothing is a button that appears broken.
//   * At **4,200** (`config.maxAge`, a full lifetime) the card says the same
//     kinds of thing for twice the wait: mean 10.48 lines, and the same three
//     rows fire at the same rates.
//
// So the shortest length that always has something to say, and it is a constant
// the pond already keeps rather than one this module invented.
//
// **Why the card is capped and says so.** The same sweep: the median skip
// produces 5 Chronicle lines and the worst 19. Three go on the card, newest
// last, and the card names the ones it left behind and points at the panel that
// has them all. Newest rather than ranked, because this project has never
// measured which kind of line matters more than which other — a ranking would
// be a judgement dressed as an order — and the newest are the ones whose
// consequences are still in the water when the card closes.
//
// **The shape of the stretch, added in v1.145.** The five sentences below
// compare two instants — the pond you left and the pond you came back to — and
// two instants cannot tell you that the crowd tripled and then lost a third of
// itself, which is the single most common thing a skip actually contains. So
// the skip now keeps a running count of the crowd as it goes, and the card
// opens on **what shape that stretch was**: a headline, a sentence with the
// turn in it, and a small line drawing of the whole thing. See `skipArc` for
// how a shape is decided and `sparkHTML` for the drawing.
//
// **Which trait rows are here, and which is deliberately not.** Body size and
// diet, at `evolved.js`'s own thresholds, which over the same 60 skips clear
// the bar on 30% and 25% of them respectively. Appetite is left out on that
// module's own finding: twelve identical ponds disagree about which way it goes,
// so a single 2,600-step window reporting it would be reporting a coin toss to
// somebody with no way to know that is what it is. A board that watches forever
// may report a directionless trait; a digest of one stretch may not.
//
// Determinism: PURE OBSERVER. Every function here reads a snapshot and a world
// and writes to neither, and draws no random number. The *skip itself* is
// `World.step` called in a loop — the same call the main loop makes every
// frame, the same number of times whichever machine runs it — so a pond that
// has been skipped is bit-for-bit the pond that was left running, and nothing
// in here can move a fingerprint.

import { pondName } from "./pondname.js";
import { stepsOver } from "./pondclock.js";
import { eventLine } from "./chronicle.js";
import { traitMeans, MOVED, DIET_MOVED } from "./evolved.js";

/** The mark the control and its card wear. */
export const SKIP_MARK = "⏩";

/** What the button says at rest. */
export const SKIP_LABEL = `${SKIP_MARK} Skip ahead`;

/**
 * How many of the Chronicle's lines get on the card.
 *
 * Three. The median skip writes five and the worst of sixty wrote nineteen, so
 * a card that showed them all would be a wall of text on the one surface here
 * whose whole job is to be read in four seconds. What is left out is counted
 * out loud — see `skipCard` — because a summary that quietly drops things is
 * the always-full-buffer bug with a friendlier face.
 */
export const SKIP_HIGHLIGHTS = 3;

/**
 * How long a frame may spend stepping while a skip is running, in milliseconds.
 *
 * A budget rather than a fixed number of steps per frame, and the difference is
 * a phone: a fixed count makes the *frame* as long as the slowest machine's
 * steps, where a budget makes every machine spend the same slice of each frame
 * and simply take more frames to get there. What neither can change is what
 * happens in the pond — the total is fixed at `skipLength` — so a skip arrives
 * at the same pond everywhere, and only the pacing of the animation adapts.
 *
 * **Forty, and it is a knee rather than a preference.** The default pond,
 * skipped from a standing start in a headless Chromium at 1280 × 900, timed
 * from the press to the card:
 *
 *     budget    wall clock    frames    frames per second
 *      12 ms      5,333 ms      160          30.0
 *      24 ms      3,965 ms       92          23.2
 *      40 ms      3,257 ms       62          19.0
 *      64 ms      3,205 ms       49          15.3
 *
 * The two costs pull opposite ways — a small budget spends the skip drawing,
 * a large one spends it not drawing — and the trade stops being a trade at 40:
 * past it the wall clock has bottomed out on the stepping itself (**52 ms
 * saved**, which is 1.6%) while the frame rate goes on falling. So the budget
 * sits at the last value that is buying anything, and the skip is three and a
 * quarter seconds of water visibly running at nineteen frames a second.
 */
export const SKIP_FRAME_MS = 40;

const n = (v) => Math.round(v).toLocaleString("en-US");
const pct = (x) => Math.round(Math.abs(x) * 100);

/**
 * How far one press goes: the pond's own year, in steps.
 *
 * @param {{seasonLength:number}} config
 * @returns {number} steps
 */
export function skipLength(config) {
  return config.seasonLength;
}

/**
 * Everything the card will need to know about the pond it is leaving.
 *
 * This is the one thing on this page that genuinely cannot be read back off the
 * world afterwards — v1.139's test, answered the other way. A mark on a
 * Chronicle row is a comparison against state the world still holds; *how many
 * were alive before you pressed the button* is gone the instant the first step
 * lands, and no amount of looking at the pond will recover it. So it is kept,
 * and it is kept by the observer rather than in the world, for the reason
 * `evolved.js` keeps its founding line there: what a watcher remembers has no
 * business in the state hash.
 *
 * @param {{tick:number, creatures:Array, stats:object}} world
 * @returns {{tick:number, pop:number, births:number, deaths:number, kills:number,
 *   generations:number, radius:number, burn:number, meat:number}}
 */
export function skipSnapshot(world) {
  const stats = world.stats || {};
  const means = traitMeans(world.creatures);
  return {
    tick: world.tick,
    pop: means.n,
    births: stats.births || 0,
    deaths: stats.deaths || 0,
    kills: stats.kills || 0,
    generations: stats.maxGeneration || 0,
    radius: means.radius,
    burn: means.burn,
    meat: means.meat,
  };
}

/** "84 creatures were alive when you pressed it, and 143 are now." */
function crowdRow(before, now) {
  if (before.pop === 0 && now.pop === 0) {
    return "The water was already empty when you pressed it, and nothing has come back.";
  }
  if (now.pop === 0) {
    return before.pop === 1
      ? "The one animal alive when you pressed it is gone, and the water is empty."
      : `All ${n(before.pop)} of the animals alive when you pressed it are gone, and the water is empty.`;
  }
  if (before.pop === 0) {
    return `The water was empty when you pressed it, and ${n(now.pop)} are alive in it now.`;
  }
  const was = before.pop === 1 ? "1 creature was" : `${n(before.pop)} creatures were`;
  return `${was} alive when you pressed it, and ${n(now.pop)} ${now.pop === 1 ? "is" : "are"} now.`;
}

/** "212 were born and 153 died in that stretch, 41 of them eaten." */
function turnoverRow(before, now) {
  const born = now.births - before.births;
  const died = now.deaths - before.deaths;
  const eaten = now.kills - before.kills;
  if (born === 0 && died === 0) return null;
  const halves = [];
  if (born > 0) halves.push(`${n(born)} ${born === 1 ? "was" : "were"} born`);
  if (died > 0) halves.push(`${n(died)} died`);
  let line = `${halves.join(" and ")} while you were away`;
  if (eaten > 0) line += `, ${n(eaten)} of them eaten`;
  return line + ".";
}

/** "2 more generations have been born — this pond is 9 deep now." */
function descentRow(before, now) {
  const deeper = now.generations - before.generations;
  if (deeper <= 0) return null;
  const many =
    deeper === 1 ? "1 more generation has been born" : `${n(deeper)} more generations have been born`;
  return `${many} — this pond is ${n(now.generations)} deep now.`;
}

/** "They are 7% bigger than they were when you pressed it." */
function bodyRow(before, now) {
  if (!before.radius || !now.radius) return null;
  const d = (now.radius - before.radius) / before.radius;
  if (Math.abs(d) < MOVED) return null;
  return `The animals here are ${pct(d)}% ${d > 0 ? "bigger" : "smaller"} than the ones you left behind.`;
}

/** "Meat has fallen from 46% of what they eat to 31%." */
function dietRow(before, now) {
  if (before.meat == null || now.meat == null) return null;
  const d = now.meat - before.meat;
  if (Math.abs(d) < DIET_MOVED) return null;
  return `Meat has ${d < 0 ? "fallen" : "risen"} from ${Math.round(before.meat * 100)}% of what they eat to ${Math.round(now.meat * 100)}%.`;
}

/**
 * What changed, as sentences — and only the ones that are true.
 *
 * `postcard.js`'s rule 3, one surface over: a line with nothing in it does not
 * appear. A pond that bred nothing gets no turnover row, a pond whose animals
 * are the same size gets no body row, and a card that padded itself out with
 * "no change" five times over would be describing a stretch in which nothing
 * happened by listing the things that did not.
 *
 * Order is the argument: how many are here, what it cost, how far down the line
 * the pond has got, and then what that has done to their bodies.
 *
 * **The crowd row gives up its slot to the arc.** v1.143's finding, one surface
 * over: when a new thing says an old thing's sentence in better words, the old
 * one goes. Every arc line names both ends of the stretch — that is a rule
 * `skipArc` keeps on purpose — and the ones with a turn in them name the turn
 * as well, which is the whole of `crowdRow` plus the part it could never see.
 * Kept for the card without an arc, which is the card this was before v1.145.
 *
 * @param {ReturnType<typeof skipSnapshot>} before
 * @param {{creatures:Array, stats:object}} world the pond as it stands now
 * @param {ReturnType<typeof skipArc>} [arc] the shape, when the card has one
 * @returns {Array<{key:string, text:string}>}
 */
export function skipRows(before, world, arc = null) {
  const now = skipSnapshot(world);
  const rows = [
    { key: "crowd", text: arc ? null : crowdRow(before, now) },
    { key: "turnover", text: turnoverRow(before, now) },
    { key: "descent", text: descentRow(before, now) },
    { key: "body", text: bodyRow(before, now) },
    { key: "diet", text: dietRow(before, now) },
  ];
  return rows.filter((r) => r.text);
}

/**
 * The Chronicle's own lines from the stretch that was skipped, newest last.
 *
 * The narrator is already written and already selective — a line only gets into
 * the Chronicle by being worth one — so this picks nothing and phrases nothing.
 * It slices.
 *
 * @param {Array<{tick:number, icon:string, msg:string, who:number}>} events
 * @param {number} since the tick the skip started from; a line lands on the card
 *   when it was written *after* that step
 * @param {number} [max]
 * @returns {{shown:Array<{icon:string, text:string}>, more:number}}
 */
export function skipHighlights(events, since, max = SKIP_HIGHLIGHTS) {
  const during = (events || []).filter((e) => e.tick > since);
  const shown = during.slice(-max).map((e) => ({ icon: e.icon, text: eventLine(e) }));
  return { shown, more: during.length - shown.length };
}

// ---- The shape of the stretch ----
//
// Everything above this line is a *difference*: the pond then against the pond
// now. A difference cannot see a middle, and the middle is where the story is.
// Of sixty measured stretches (12 seeds × 5 launch points), **thirty-one ended
// within a fifth of where they started or better and still contained a
// reversal** the card had no way to mention — the commonest of them being a
// crowd that tripled by the halfway mark and then gave a third of it back. The
// card said *84 were alive when you pressed it, and 154 are now* and left the
// boom on the floor.
//
// So the skip counts the crowd as it goes and the card leads with the shape.

/**
 * How many points the running count keeps.
 *
 * **Fifty-two, and it is a number chosen for the picture rather than for the
 * verdict** — because the verdict turned out not to care. The same sixty
 * stretches, classified off the same tracks resampled at 13, 26, 52, 104 and
 * 650 points, return **the identical shape all sixty times at every one of
 * them**. A pond year is a coarse thing: its rises and falls are hundreds of
 * steps long, and there is no reversal in this water fast enough for a
 * thirteen-point sketch to miss. That freed the count to be sized by what the
 * drawing wants instead, which is enough points that the line looks drawn
 * rather than folded, and few enough that each one is a pixel or two wide in a
 * strip the width of a dialog. At a skip's 2,600 steps this is one sample every
 * fifty.
 */
export const SKIP_TRACK_POINTS = 52;

/**
 * How far the crowd must move before the card calls it a story, as a share.
 *
 * A fifth. Both directions of getting this wrong are visible in the sweep, and
 * neither is reachable by arguing about it:
 *
 *   * **Too small and the card cries wolf.** At 0.15 the quiet verdict fires
 *     **0 times in 60** — sixty stretches and not one of them allowed to be
 *     uneventful, which cannot be true and makes every dramatic headline worth
 *     nothing.
 *   * **Too large and it contradicts its own picture.** At 0.40 the boom
 *     verdict fires **0 times in 60**: a pond that went 40 → 231 → 154 is
 *     announced as *it grew*, directly above a line drawing with a hill in it.
 *
 * Between those, a plateau. At 0.18 / 0.20 / 0.22 the counts are flat
 * (boom 22 / 22 / 20, climb 25 / 25 / 25, crash 8 / 9 / 8) and every verdict is
 * reachable; past 0.22 the boom count collapses — 20, 16, 10, 7 — while
 * "quiet" runs away with the sweep. So the threshold sits in the middle of the
 * widest band on which nothing has begun to break, which is the only part of
 * this that was measured rather than preferred.
 */
export const ARC_MOVE = 0.2;

/**
 * The smallest crowd a share is measured against.
 *
 * A guard, not a tuning knob: three animals becoming four is a 33% rise and it
 * is not a boom, and without a floor the last gasp of a dying pond produces the
 * loudest headlines on the page. Eight is **the largest value that changes
 * nothing on real data** — the sweep's verdicts are identical at 1, 4 and 8 and
 * start moving at 16 — which is what a guard should be: as wide as it can be
 * while never overriding a move that was real.
 *
 * Note what that means, though, and it is the honest half: the sweep cannot
 * *validate* this number, because the sweep almost never visits a pond small
 * enough for it to bite. It is checked in `test/skip.test.js` against tracks
 * written by hand for the purpose, which is the only place the case exists.
 */
export const ARC_FLOOR = 8;

/**
 * How many animals are alive right now.
 *
 * The same count `skipSnapshot` takes, by the same rule — the dead are swept at
 * the end of the step that kills them, so this only ever differs from
 * `creatures.length` if it is called from inside one. It exists so that the
 * running count and the card's own numbers cannot drift apart by being written
 * twice.
 *
 * @param {{creatures:Array}} world
 */
export function crowdOf(world) {
  let live = 0;
  for (const c of world.creatures) if (!c.dead) live++;
  return live;
}

/**
 * How often the running count takes a sample, in steps.
 *
 * @param {number} total how many steps the skip will take
 * @param {number} [points]
 * @returns {number} steps between samples, at least 1
 */
export function trackEvery(total, points = SKIP_TRACK_POINTS) {
  return Math.max(1, Math.round(total / points));
}

/** Where in the stretch something happened, in words. */
function whenIn(i, k) {
  const at = k > 1 ? i / (k - 1) : 0;
  if (at < 1 / 3) return "early on";
  if (at < 2 / 3) return "about halfway through";
  return "near the end";
}

/**
 * What shape a stretch was, from the crowd counted through it.
 *
 * The verdict is decided by three numbers and where they fell: the count at
 * each end, and the highest and lowest the crowd got in between. A turn only
 * counts when it is *interior* — a peak at the last sample is not a boom
 * followed by a crash, it is a climb — and when both legs of it clear
 * `ARC_MOVE`, so a hill has to be a hill on the way up and on the way down.
 *
 * `headline` is the verdict in four or five words. `line` is the same verdict
 * with the numbers in it. Both are plain sentences: this is the one surface on
 * the page where somebody who has pressed exactly one button finds out what
 * they just watched.
 *
 * @param {number[]} track the crowd, oldest first
 * @returns {{key:string, headline:string, line:string, first:number, last:number,
 *   peak:number, peakAt:number, trough:number, troughAt:number}|null}
 */
export function skipArc(track) {
  if (!Array.isArray(track) || track.length < 3) return null;
  const k = track.length;
  const first = track[0];
  const last = track[k - 1];
  let hi = 0;
  let lo = 0;
  for (let i = 1; i < k; i++) {
    if (track[i] > track[hi]) hi = i;
    if (track[i] < track[lo]) lo = i;
  }
  const peak = track[hi];
  const trough = track[lo];
  // A share of the larger end, floored — so a fall reads as steep as the rise
  // that would undo it, and a pond of four is not a percentage machine.
  const rel = (a, b) => (b - a) / Math.max(a, b, ARC_FLOOR);
  const made = (key, headline, line) => ({
    key,
    headline,
    line,
    first,
    last,
    peak,
    peakAt: hi,
    trough,
    troughAt: lo,
  });

  if (first === 0 && last === 0) {
    return made(
      "empty",
      "Still empty.",
      "The water was empty when you pressed it, and nothing has come back."
    );
  }
  if (last === 0) {
    const died = track.findIndex((v) => v === 0);
    return made(
      "gone",
      "It emptied out.",
      `${n(first)} ${first === 1 ? "animal was" : "animals were"} alive when you pressed it. ` +
        `The last of them died ${whenIn(died, k)}, and the water is empty.`
    );
  }
  if (first === 0) {
    return made(
      "arrival",
      "Life took hold.",
      `The water was empty when you pressed it. ${n(last)} ${last === 1 ? "animal is" : "animals are"} alive in it now.`
    );
  }

  const boom = hi > 0 && hi < k - 1 && rel(first, peak) >= ARC_MOVE && rel(peak, last) <= -ARC_MOVE;
  const bust =
    lo > 0 && lo < k - 1 && rel(first, trough) <= -ARC_MOVE && rel(trough, last) >= ARC_MOVE;

  if (boom && bust) {
    return made(
      "swings",
      "It never settled.",
      `The crowd started on ${n(first)}, rose and fell more than once between ` +
        `${n(trough)} and ${n(peak)}, and ended on ${n(last)}.`
    );
  }
  if (boom) {
    return made(
      "boom",
      "A boom, then a crash.",
      `The crowd swelled from ${n(first)} to ${n(peak)} ${whenIn(hi, k)}, ` +
        `then fell back to ${n(last)}.`
    );
  }
  if (bust) {
    return made(
      "crash",
      "A crash, then a comeback.",
      `The crowd thinned from ${n(first)} to ${n(trough)} ${whenIn(lo, k)}, ` +
        `then climbed back to ${n(last)}.`
    );
  }

  const drift = rel(first, last);
  if (drift >= ARC_MOVE) {
    return made(
      "climb",
      "A steady climb.",
      `The crowd grew from ${n(first)} to ${n(last)}, and never gave much of it back.`
    );
  }
  if (drift <= -ARC_MOVE) {
    return made(
      "fall",
      "A long thinning out.",
      `The crowd fell from ${n(first)} to ${n(last)}, and never quite recovered.`
    );
  }
  return made(
    "quiet",
    "A quiet stretch.",
    `The crowd started on ${n(first)} and ended on ${n(last)}, ` +
      `and never went below ${n(trough)} or above ${n(peak)}.`
  );
}

/**
 * The drawing's box, in its own coordinates.
 *
 * A `viewBox` rather than pixels: the stylesheet gives the strip whatever width
 * the dialog has and the shape scales with it, which is the only way one number
 * here works on a phone and on a monitor.
 */
export const SPARK = { w: 320, h: 56, pad: 5 };

/**
 * The crowd, as points in the drawing's box.
 *
 * The floor of the scale is zero rather than the smallest count, deliberately.
 * A line drawn between its own extremes turns any wobble into a mountain range
 * — the same lie a truncated axis tells on a news graphic — and this strip sits
 * beside a sentence that has just told you how far the crowd moved. It has to
 * agree with it.
 *
 * @param {number[]} track
 * @param {{w:number,h:number,pad:number}} [box]
 * @returns {Array<{x:number, y:number}>}
 */
export function sparkPoints(track, box = SPARK) {
  if (!Array.isArray(track) || track.length < 2) return [];
  const top = Math.max(1, ...track);
  const k = track.length;
  const spanX = box.w - box.pad * 2;
  const spanY = box.h - box.pad * 2;
  return track.map((v, i) => ({
    x: box.pad + (spanX * i) / (k - 1),
    y: box.h - box.pad - (spanY * v) / top,
  }));
}

const xy = (p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;

/**
 * The whole strip: the crowd as a filled line, with its turn marked.
 *
 * The mark is the point the sentence beside it is about — the peak of a boom,
 * the trough of a crash — and there is none on the shapes that have no turn,
 * because a dot on a straight climb would be pointing at nothing.
 *
 * The picture carries the arc's own sentence as its label rather than a
 * description of itself: a reader who cannot see it is owed *what the shape
 * was*, which is what the sentence says, and "a line chart of population" is
 * what every alt text on the web says instead.
 *
 * @param {number[]} track
 * @param {ReturnType<typeof skipArc>} arc
 */
export function sparkHTML(track, arc) {
  const pts = sparkPoints(track);
  if (pts.length < 2) return "";
  const line = pts.map(xy).join(" ");
  const floor = SPARK.h - SPARK.pad;
  const area = `${xy(pts[0])} ${line} ${pts[pts.length - 1].x.toFixed(1)},${floor} ${pts[0].x.toFixed(1)},${floor}`;
  const turn =
    arc && arc.key === "boom" ? pts[arc.peakAt] : arc && arc.key === "crash" ? pts[arc.troughAt] : null;
  const mark = turn
    ? `<circle class="spark-turn" cx="${turn.x.toFixed(1)}" cy="${turn.y.toFixed(1)}" r="3.5" />`
    : "";
  const label = arc ? arc.line : "The crowd through the stretch you skipped.";
  return (
    `<svg class="spark" viewBox="0 0 ${SPARK.w} ${SPARK.h}" preserveAspectRatio="none" ` +
    `role="img" aria-label="${label}">` +
    `<polygon class="spark-fill" points="${area}" />` +
    `<polyline class="spark-line" points="${line}" />` +
    mark +
    `</svg>`
  );
}

/**
 * The whole card: a shape, a title, a subtitle, the sentences and the highlights.
 *
 * @param {ReturnType<typeof skipSnapshot>} before
 * @param {{tick:number, creatures:Array, stats:object, chronicle:object}} world
 * @param {{seed:number}} config
 * @param {number[]} [track] the crowd counted through the skip, oldest first
 * @returns {{title:string, sub:string, arc:object|null, spark:string, rows:Array,
 *   highlights:Array, more:number, moreLine:string}}
 */
export function skipCard(before, world, config, track) {
  const { shown, more } = skipHighlights(
    world.chronicle ? world.chronicle.events : [],
    before.tick
  );
  // A skip that was interrupted, or a caller from before v1.145, has no count
  // to shape — and a card without a headline is the card this was for a
  // release, so it degrades to that rather than to a blank.
  const arc = skipArc(track);
  return {
    title: `${SKIP_MARK} ${stepsOver(world.tick - before.tick)} later`,
    sub: `What ${pondName(config.seed).name} did while you skipped ahead.`,
    arc,
    spark: arc ? sparkHTML(track, arc) : "",
    rows: skipRows(before, world, arc),
    highlights: shown,
    more,
    moreLine: moreLine(more),
  };
}

/**
 * What the card says about the lines it did not show.
 *
 * It points at the Chronicle rather than apologising, because the panel is on
 * the same page and already holds every one of them.
 */
function moreLine(more) {
  if (more <= 0) return "";
  return more === 1
    ? "1 more thing happened before those — it is in the Chronicle below."
    : `${n(more)} more things happened before those — they are in the Chronicle below.`;
}

/**
 * What the button says while a skip is running.
 *
 * A press whose result arrives two seconds later needs to say so, and it says
 * so on the control that was pressed — v1.140's finding about a press whose
 * effect lands somewhere the visitor cannot see, met before it can happen.
 *
 * @param {number} done steps taken so far
 * @param {number} total steps the skip will take
 */
export function skipProgress(done, total) {
  const share = total > 0 ? Math.min(99, Math.floor((done / total) * 100)) : 0;
  return `${SKIP_MARK} Skipping ahead… ${share}%`;
}

/** The sentences, as markup for one list container. */
export function skipHTML(rows) {
  return rows.map((r) => `<li class="skiprow" data-skip-row="${r.key}">${r.text}</li>`).join("");
}

/**
 * The highlights, as markup for one list container.
 *
 * The mark is `aria-hidden` for the reason every mark on this page is: it is
 * the Chronicle's own icon, and the sentence beside it already says what it
 * says.
 */
export function highlightHTML(highlights) {
  return highlights
    .map(
      (h) =>
        `<li class="skiphi">` +
        `<span class="skiphi-mark" aria-hidden="true">${h.icon}</span>` +
        `<span class="skiphi-text">${h.text}</span>` +
        `</li>`
    )
    .join("");
}
