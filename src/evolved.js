// evolved.js — what this pond has actually evolved, said in words a visitor
// already has.
//
// The tagline on the front door is *watch evolution happen*. Everything this
// page has built to keep that promise is either a **picture for a specialist**
// or a **statement about right now**. The Tree of Life is a Muller plot; the
// body-size figure is a histogram with a mean dash on it; the chart stack is
// three time series sharing an axis. They are the best surfaces here and they
// are all read by the same reader — somebody who already knows what a lineage
// share is. Meanwhile the *legible* surfaces — the headline (v1.117), the cast
// board (v1.123), the record book (v1.124), the Chronicle — are about this
// minute, this animal, this crowd. Not one of them answers the question the
// tagline invites, which a visitor asks about ninety seconds in:
//
//   **have these things changed since it started, or am I watching a screensaver?**
//
// This board answers it, in four sentences, with no chart in them. It holds the
// pond's opening line — the traits of the animals it was handed on tick one —
// and says how far the animals alive now have moved from it.
//
// **The sweep that designed it: 12 seeds, 6,000 ticks, sampled every 50 —
// 1,440 pond-instants.** Three body traits are heritable here and all three
// move, but they do not move the same way, and the differences are the whole
// design:
//
//   * **Bodies grow, and mostly one way.** Bigger on 70.8% of instants, smaller
//     on 9.2%, within 5% of the founders on 20.1%. By tick 6,000 the mean body
//     is 1.20×–1.38× the founders' on eleven seeds of twelve — and **0.88× on
//     seed 2718**, which is why the row is written to say *smaller* as fluently
//     as it says *bigger*. A board that can only report the expected answer is
//     a decoration.
//   * **Diet moves furthest and it moves away from meat.** Down on 56.3% of
//     instants, up on 19.6%, level on 24.2%. The founders are dealt a diet gene
//     uniform on 0..1, so every pond starts at a coin-flip 50% carnivore and
//     ends anywhere between 17% and 92% of where it began. This is the row that
//     most often has something startling to say.
//   * **Appetite has no direction at all, and that is the finding.** Faster on
//     35.5% of instants, slower on 30.8%, level on 33.7%. Twelve ponds under
//     identical rules disagree about whether it pays to burn energy quickly.
//     I nearly cut the row for being noise and kept it for the opposite reason:
//     a trait whose answer depends on which pond you are in is the strongest
//     evidence on this page that nobody wrote the answer down in advance.
//
// The board those three rows make, measured the same way: **a mean of 4.85 rows
// of a possible 5**, five of them 84.9% of the time, and never fewer than four
// once a pond has bred — the descent row is the only one that can be missing,
// and only while the mean generation is still under one.
//
// Two more numbers the sweep settled. **Auto-reseed fired on 0 of the 12
// default ponds**, so "everybody here is descended from the animals it started
// with" is true of a default world rather than merely likely — and the row that
// says it counts the founders by *identity* rather than by generation, so a
// pond that is reseeded, or has `✚ Seed life` pressed on it, cannot quietly
// gain a founder. And **the last founder dies at tick 4,200 on eleven seeds of
// twelve**, which is `config.maxAge` exactly: the originals do not lose, they
// run out of time. That moment is the one this board exists to catch.
//
// Three rules, the ones `records.js` and `cast.js` already hold themselves to:
//
//  1. **No units and no jargon.** Percentages and counts of animals, which are
//     the two quantities everybody already has. There is no pixel, no tick, no
//     gene and no lineage in any sentence this module produces, and
//     `test/evolved.test.js` checks it the way the other boards are checked.
//  2. **A row is a claim, so a row that is not true is not drawn.** A trait
//     inside `MOVED` of where it started says *much the same*, in words, rather
//     than dressing 0.4% up as a trend.
//  3. **The comparison is against the pond's own beginning, never against a
//     constant.** `records.js` learned this the hard way: a maximum over a
//     quantity `config.js` bounds is a fact about the bound. Every number here
//     is a ratio between two measurements of the same pond.
//
// Determinism: PURE OBSERVER. It reads the living and a snapshot taken of them,
// writes nothing to any world, and draws no random number. The snapshot lives
// on the observer's `ViewState` — not in the world and not in the books —
// because a founding population is a thing a *watcher* remembers, and putting
// it in the world would put it in the state hash for no gain.

/**
 * How far a trait must move from the founders' mean before this board will call
 * it a change: five per cent, relative.
 *
 * Sized against the noise it has to clear rather than guessed. The founding mean
 * itself is a sample of forty draws, and across twelve seeds those means land
 * within about ±3% of each other on every trait — so a threshold below that
 * would be reporting the deal rather than the evolution. At 5% the three rows
 * sit level on 20.1%, 24.2% and 33.7% of instants respectively, which is a
 * board that is usually saying something and sometimes admitting it has
 * nothing.
 */
export const MOVED = 0.05;

/**
 * The same judgement for the diet row, in percentage *points* rather than
 * relative.
 *
 * Diet is a share of a menu, not a magnitude: 4% of the diet becoming 8% is a
 * doubling and is still four points of a plate. A share is read by everybody as
 * points, so it is judged in points, and the number is the same 5.
 */
export const DIET_MOVED = 0.05;

/**
 * How far down a plate has to go before this board is willing to call the pond
 * vegetarian — and, mirrored above `1 - DIET_VERDICT`, a pond of hunters.
 *
 * A quarter, because a name for what a population has *become* is a different
 * claim from a measurement of how far it has moved, and the first version of
 * this row conflated them: it read the direction and announced *"this water is
 * turning vegetarian"* over a pond sitting on 43% meat. Three quarters of a
 * plate one way is a thing a visitor can see in the water — the arrowheads stop
 * chasing each other — and half a plate is not.
 */
export const DIET_VERDICT = 0.25;

/** The mark each row wears. One per row, none of them used by another board. */
export const EVOLVED_MARK = Object.freeze({
  founders: "👥",
  descent: "🌳",
  body: "📏",
  diet: "🥣",
  burn: "🔥",
});

/** What each row is called, in the fewest words that still say it. */
export const EVOLVED_TITLE = Object.freeze({
  founders: "The first animals",
  descent: "Generations",
  body: "Bodies",
  diet: "Diet",
  burn: "Appetite",
});

/**
 * What the board says before the pond has bred even once.
 *
 * Every animal is a founder at that point, so every row would compare a
 * measurement with itself and report *much the same* four times over — four
 * true sentences that together say nothing. The wait is short: the first young
 * arrives between tick 9 and tick 120 on six seeds of six, which is a few
 * seconds of watching at 1×.
 */
export const EVOLVED_EMPTY =
  "Nothing has evolved yet — every animal in the water is one the pond " +
  "started with. Give it a minute.";

/**
 * What it says about a pond whose beginning it never saw.
 *
 * `📂 Load` rebuilds a world and then pours a saved run into it, so the first
 * frame the observer meets is somewhere in the middle of a story. The honest
 * answer is that the comparison cannot be made, and saying so is better than
 * quietly comparing today's animals against today's animals — which is what a
 * snapshot taken whenever one happens to be missing would do.
 */
export const EVOLVED_LOADED =
  "This pond was loaded from a save, so the animals it began with are not " +
  "here to measure against. Reset to start a pond from its first day.";

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Whole percent, unsigned — every number on this board is spoken with a word. */
const pct = (x) => Math.round(Math.abs(x) * 100);

/**
 * The mean body traits of a set of animals.
 *
 * Three numbers, and they are the three heritable body traits this world has:
 * how big they are, how fast they burn energy just being alive, and how much of
 * what they eat is meat. Hue is the fourth body gene and is deliberately absent
 * — it is a family badge rather than a trait under selection, and "the pond has
 * got greener" is not a sentence about survival.
 *
 * @param {Array<{dead?:boolean, radius:number, metabolismScale:number, carnivory:number}>} creatures
 * @returns {{n:number, radius:number, burn:number, meat:number}}
 */
export function traitMeans(creatures) {
  const live = creatures.filter((c) => !c.dead);
  return {
    n: live.length,
    radius: mean(live.map((c) => c.radius)),
    burn: mean(live.map((c) => c.metabolismScale)),
    meat: mean(live.map((c) => c.carnivory)),
  };
}

/**
 * The pond's opening line, or `null` if this is not a pond's first moment.
 *
 * Taken by the observer on the frame it adopts a world, which is before that
 * world has been stepped — so `tick === 0` is exactly the condition "these are
 * the animals it was handed". A world that arrives already running (a load) has
 * no beginning to record and gets `null`, which the board reports rather than
 * papers over.
 *
 * The founders' **ids** ride along with their means. Counting who is left by
 * `generation === 0` would be counting a lifecycle stage, and this world posts
 * fresh generation-0 animals into a pond that crashes (`autoReseed`) or that a
 * visitor presses `✚ Seed life` on — so a count of the originals could go *up*,
 * which is the one thing a row about the originals must never do. Ids are safe
 * here for v1.126's reason: `Creature.id` is a counter that restarts with the
 * module on every page load, and it is kept out of the state hash, so an
 * observer may hold one where the books may not.
 *
 * @param {{tick:number, creatures:Array}} world
 * @returns {{n:number, radius:number, burn:number, meat:number, ids:Set<number>}|null}
 */
export function foundingSnapshot(world) {
  if (!world || world.tick !== 0) return null;
  const live = world.creatures.filter((c) => !c.dead);
  return { ...traitMeans(live), ids: new Set(live.map((c) => c.id)) };
}

/** "24% bigger than …", "12% smaller than …", or "much the same size as …". */
function bodyWhy(then, now) {
  const d = (now - then) / then;
  if (Math.abs(d) < MOVED) return "much the same size as the animals this pond started with";
  return d > 0
    ? `${pct(d)}% bigger than the animals this pond started with`
    : `${pct(d)}% smaller than the animals this pond started with`;
}

/** The diet row, spoken as a share of a plate rather than as a ratio. */
function dietWhy(then, now) {
  const d = now - then;
  const nowPct = Math.round(now * 100);
  const thenPct = Math.round(then * 100);
  if (Math.abs(d) < DIET_MOVED) {
    return `meat is ${nowPct}% of what they eat, about what it was at the start`;
  }
  const moved = `meat has ${d < 0 ? "fallen" : "risen"} from ${thenPct}% of what they eat to ${nowPct}%`;
  // The verdict is about where the pond has *arrived*, not about which way it
  // walked, and separating the two is the difference between a caption and a
  // headline. Written the obvious way — direction alone — this row called a pond
  // sitting on 43% meat *"turning vegetarian"*, which is a sentence about a
  // seven-point move on a plate that is still nearly half meat. A move gets
  // reported always; a name for what the pond has become has to be earned by
  // crossing `DIET_VERDICT`, and on twelve seeds it is earned on 37.2% of the
  // rows this function writes — 30.3% vegetarian against 6.9% hunting, which is
  // the asymmetry the board is there to show.
  if (now <= DIET_VERDICT) return `${moved} — this water is turning vegetarian`;
  if (now >= 1 - DIET_VERDICT) return `${moved} — this pond has turned to hunting`;
  return moved;
}

/** The appetite row. The one trait twelve identical ponds disagree about. */
function burnWhy(then, now) {
  const d = (now - then) / then;
  if (Math.abs(d) < MOVED) return "they burn energy at much the same rate as the founders did";
  return d > 0
    ? `they burn energy ${pct(d)}% faster than the founders did`
    : `they burn energy ${pct(d)}% slower than the founders did`;
}

/**
 * The board's rows: plain data, oldest fact first, every one of them true.
 *
 * Order is the argument the board makes, read top to bottom: *these are the
 * originals, this is how far down the line you are now, and here is what has
 * changed on the way*. The two descent rows come first because they are what
 * make the three trait rows mean anything — a body 24% bigger is a curiosity
 * until you know it belongs to somebody's seventh-generation descendant.
 *
 * @param {{tick:number, creatures:Array, stats:object}} world
 * @param {{n:number, radius:number, burn:number, meat:number, ids:Set<number>}|null} founding
 * @returns {Array<{key:string, icon:string, what:string, why:string}>}
 */
export function evolvedRows(world, founding) {
  if (!founding || founding.n === 0) return [];
  const stats = world.stats || {};
  // Nothing to compare until the pond has bred. Read off the books rather than
  // off the living, because the first young can be born and eaten between two
  // frames and the board should not flicker back to its empty state when that
  // happens.
  if ((stats.maxGeneration || 0) < 1) return [];

  const live = world.creatures.filter((c) => !c.dead);
  if (live.length === 0) return [];
  const now = traitMeans(live);
  const rows = [];

  // 1. How many of the originals are still swimming. The countdown everybody
  //    understands without being told what it is a countdown to.
  const left = live.filter((c) => founding.ids.has(c.id)).length;
  rows.push({
    key: "founders",
    icon: EVOLVED_MARK.founders,
    what: EVOLVED_TITLE.founders,
    why:
      left === 0
        ? `not one of the ${founding.n} this pond started with is left — everybody here is a descendant`
        : left === 1
          ? `1 of the ${founding.n} this pond started with is still alive`
          : `${left} of the ${founding.n} this pond started with are still alive`,
  });

  // 2. How far down the line the water is. The mean over the living rather than
  //    the deepest anybody has reached: a single long-lived lineage can run ten
  //    generations ahead of a pond that is mostly founders, and the question
  //    this row answers is about the crowd.
  const gens = mean(live.map((c) => c.generation || 0));
  if (gens >= 1) {
    const g = Math.round(gens);
    rows.push({
      key: "descent",
      icon: EVOLVED_MARK.descent,
      what: EVOLVED_TITLE.descent,
      why:
        g === 1
          ? "the animals here now are, on average, one generation from the founders"
          : `the animals here now are, on average, ${g} generations from the founders`,
    });
  }

  // 3-5. The three heritable body traits, each against the pond's own opening
  //      line. Guarded on the founding mean being positive so a divide can
  //      never be by zero — `config.js` bounds all three above zero, so the
  //      guard is unreachable on any world this project builds and cheap enough
  //      to keep for one that is loaded from somewhere else.
  if (founding.radius > 0) {
    rows.push({
      key: "body",
      icon: EVOLVED_MARK.body,
      what: EVOLVED_TITLE.body,
      why: bodyWhy(founding.radius, now.radius),
    });
  }
  rows.push({
    key: "diet",
    icon: EVOLVED_MARK.diet,
    what: EVOLVED_TITLE.diet,
    why: dietWhy(founding.meat, now.meat),
  });
  if (founding.burn > 0) {
    rows.push({
      key: "burn",
      icon: EVOLVED_MARK.burn,
      what: EVOLVED_TITLE.burn,
      why: burnWhy(founding.burn, now.burn),
    });
  }

  return rows;
}

/**
 * What the board depends on, as a string.
 *
 * The sentences themselves, for `records.js`'s reason: every number here is
 * rounded to a whole percent or a whole animal, so the signature changes only
 * when a *word* on the page would change. A key made of the raw means would
 * rebuild this list on every frame, since a mean over two hundred animals moves
 * in the sixth decimal place whenever anybody is born.
 *
 * The leading letter is not decoration. An empty board is a state this surface
 * is genuinely in — twice, and for two different reasons — so its signature has
 * to be something rather than the empty string, which is what `ViewState` hands
 * out before any pond has been drawn. Without it, resetting a running pond
 * would leave the *previous* pond's five rows on screen for as long as the new
 * one took to breed: the memo would compare "" against "" and take the cheap
 * path. That is `viewstate.js`'s own bug class, met in the one place the roster
 * cannot catch it.
 *
 * @param {Array<{key:string, why:string}>} rows
 * @param {boolean} [sawStart] whether the observer has this pond's opening line
 */
export function evolvedSignature(rows, sawStart = true) {
  return (sawStart ? "s" : "l") + "|" + rows.map((r) => `${r.key}:${r.why}`).join("|");
}

/**
 * The whole board, as markup for one list container.
 *
 * Text, not buttons. Every other board on this page names an animal you can go
 * and press; this one is about a population and about animals that are mostly
 * dead, and v1.51's rule cuts the other way — a control that does nothing is
 * worse than no control.
 *
 * @param {Array<{key:string, icon:string, what:string, why:string}>} rows
 * @param {boolean} [sawStart] whether the observer has this pond's opening line
 */
export function evolvedHTML(rows, sawStart = true) {
  if (rows.length === 0) {
    return `<li class="evoempty">${sawStart ? EVOLVED_EMPTY : EVOLVED_LOADED}</li>`;
  }
  return rows
    .map(
      (r) =>
        `<li class="evorow"><span class="evostill">` +
        `<span class="evomark" aria-hidden="true">${r.icon}</span>` +
        `<span class="evoname">${r.what}</span>` +
        `<span class="evowhy">${r.why}</span>` +
        `</span></li>`
    )
    .join("");
}
