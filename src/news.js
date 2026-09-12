// news.js — the Chronicle's biggest moments, over the water.
//
// The Chronicle has been the best writing on this page since v1.3 and it lives
// in the sixteenth panel. Everything dramatic this pond does — a family taking
// the whole water, a new family splitting off, the hunters dying out, a
// sickness burning itself out — is written down four thousand pixels below the
// animal it happened to, in a feed a visitor reaches by scrolling past
// everything else. v1.132 gave the page a way to say a thing out loud over the
// water and gave it to exactly one source: the six-rung ladder. Its own leaving
// note said so — *only the ladder gets a fuss; the Chronicle narrates
// extinctions, crashes and takeovers and none of them makes the page do
// anything, and which of those lines deserves the water is a real design
// question.* Nine releases later, this is that question answered.
//
// **The answer is not "all of them", and the number says so.** Twenty-eight
// runs — the default pond and all thirteen worlds, two seeds each, six thousand
// steps — write a mean of **23.6 lines**, and at the speed the page opens six
// thousand steps is **100 seconds**. That is a line every 4.2 seconds into a
// banner that stays up for 5.2. Piped straight through, the Chronicle would
// cover the pond it is about and never come off. **The feed has no budget and
// the water has one**, and that single fact is what this module is: a table of
// which moments are worth the only surface a visitor is already looking at.
//
// **A sentence written for the feed cannot be lifted onto the water.** The
// feed's reader has scrolled to the sixteenth panel and is reading a history;
// the water's reader has scrolled nowhere and is watching animals. So every
// line here is written again from scratch rather than quoted — the Chronicle
// keeps *An epidemic — 34 creatures are sick (21% of the pond)* and the water
// gets *The sickness has taken hold, and much of this pond is ill.* Same
// moment, different reader, and the number stays in the panel that can afford
// one.
//
// **What was on the water's vocabulary bar, and what was missing from it.**
// v1.132's test holds every banner to a list of words a first-time visitor
// would not know. Run that list over all thirty-three of the Chronicle's lines
// and only **two** fail it — and the feed is nonetheless full of *pathogen*,
// *herd immunity*, *selective sweep*, *hidden neurons*, *scavengers* and
// *detritus*. The bar was never a readability measure: it is a list of the
// words this project has already been caught using, which is a different thing
// and a much shorter one. `WATER_JARGON` below is that list widened by
// everything the Chronicle taught me, and it now guards the ladder's sentences
// too.
//
// Determinism: PURE OBSERVER. This module is handed events that have already
// been written and returns strings. It never sees a world, never touches a
// creature and never draws a random number — the same standing this project
// gives `cheer.js`, `feed.js` and `chronicle.js` itself.

import { eventWho } from "./chronicle.js";

/**
 * Words the water may not use, whoever is speaking.
 *
 * The first half is v1.132's list, moved here from the test that held it so
 * that the two surfaces which speak over the pond — the ladder's fuss and this
 * — are held to one bar rather than to two that can drift apart. The second
 * half is what reading the Chronicle end to end added: every one of these
 * appears in a line the feed writes today, and not one of them is taught
 * anywhere on this page.
 *
 * `generation` is deliberately **not** here, and it is the interesting
 * omission: the ladder's sixth rung is *ten generations deep* and the panel
 * teaches the word in the row above where it uses it. A word this page teaches
 * is a word the water may say. That is the whole test for membership.
 */
export const WATER_JARGON =
  /\b(carnivor\w*|herbivor\w*|lineage|genome|genotype|allele|tick|ticks|px|pixels?|predation|neuroevolution|fitness|phenotype|RNG|seed|species|pathogen|epidemic|immunity|neurons?|detritus|phylogen\w*|plasticity|scavenger\w*|topology|metabolism|nutrients?|cohort)\b/i;

/** The longest a banner may be: v1.132's bar, and the reason is unchanged. */
export const WATER_MAX = 140;

/**
 * How stale a moment may be before it stops being news, in steps of the pond's
 * own clock.
 *
 * A hundred and twenty steps is two seconds of pond at the speed the page
 * opens, and the case it exists for is not slowness — it is `⏩ Skip ahead`,
 * which steps a pond two and a half thousand times inside one frame. Every
 * line those steps wrote arrives here at once, and a banner announcing a family
 * that took the pond forty seconds of pond-time ago is not a moment, it is a
 * history lesson delivered as an interruption. The feed keeps all of them; the
 * water takes only what just happened.
 *
 * It is deliberately a pond clock rather than a wall clock, for `SETTLE_STEPS`'
 * reason one module over: at 20× two seconds is twelve hundred steps, and the
 * question this constant asks is how long ago the *pond* thinks it was.
 */
export const STALE_STEPS = 120;

/**
 * A key for one kind of Chronicle line: its category and its icon.
 *
 * Not a field on the event, and that is a decision rather than an oversight.
 * The obvious build is to give `_push` a machine-readable `kind` — but an
 * event's fields are hashed (`EVENT_HASHED`), the recorded fingerprints of the
 * default pond are what directive 0 protects, and a new hashed field would move
 * every one of them for a narration that is word-for-word identical. The pair
 * that already exists is unique across all thirty-three of the Chronicle's
 * lines — `test/news.test.js` reads them out of the source and proves it — so
 * the key was there to be used and cost nothing.
 */
export function newsKey(e) {
  return `${e.cat}/${e.icon}`;
}

/**
 * The moments that are worth the water, and what the water says about them.
 *
 * Three questions decided membership, and each of the three threw something
 * out:
 *
 *  1. **Could a visitor have watched this happen?** A family taking the pond
 *     is a change in what the water looks like. *Starvation is now the leading
 *     cause of death — 62% of the last 40* is a change in a running average.
 *  2. **Does anything else on this page already say it?** The ladder makes a
 *     fuss about the first birth, the first kill, the first family, the first
 *     dynasty, twice as full and ten generations. Six of the Chronicle's lines
 *     are those same six events seen from the feed, and a page that says a
 *     thing twice in one place has said it once and lied once.
 *  3. **Can it be said in the water's words?** See `WATER_JARGON`.
 *
 * `rank` breaks ties when two moments land inside one quiet stretch: the water
 * holds the better of them and forgets the other, because a moment reported
 * twenty seconds late is not a moment. It runs 1 (worth saying) to 9 (the pond
 * has changed).
 *
 * `subject` marks the lines that are about somebody rather than about the pond:
 * `who` for an animal, `sp` for a family. Those are the lines that can be
 * pressed.
 *
 * `role` is a separate and narrower thing, and the distinction cost me a
 * measurement to find. A line may speak twice only if its subject is a **role
 * somebody holds** — the pond's best parent, the family that holds the water —
 * because the news is the *change of hands*. A line whose subject is new by
 * construction is not a role: every family that splits off has a species id no
 * family has ever had, so keyed on its subject *a new family has appeared*
 * would be news every single time it fired. Over eighteen thousand steps of the
 * default pond that is **twelve of the fourteen** things the water says, the
 * same sentence with a different name in it every seventeen seconds — which is
 * exactly the stutter `streak.js` was written to fix in the panel, arriving on
 * the surface that can least afford it. Everything without a `role` speaks once
 * per pond.
 */
export const WATER = new Map([
  // --- The pond, in trouble and out of it ---
  [
    "crash/💀",
    { rank: 9, line: () => "The pond is crashing — half of everything in this water has died." },
  ],
  ["recover/🌱", { rank: 6, line: () => "The water is filling again after the crash." }],
  [
    "death/🦴",
    { rank: 8, line: () => "So many have died at once that the living are feeding on the dead." },
  ],

  // --- Hunting ---
  [
    "predation/🩸",
    { rank: 7, line: () => "Hunting is spreading — more of this pond eats its neighbours now." },
  ],
  [
    "predation/👪",
    { rank: 8, line: () => "A hunter has turned away from its own family rather than eat them." },
  ],
  [
    "predation/🔒",
    { rank: 6, line: () => "Most of this pond has grown too big for anything here to eat." },
  ],
  [
    "predation/🕊️",
    { rank: 7, line: () => "The hunters are gone. Nothing in this water eats its neighbours now." },
  ],

  // --- Families ---
  [
    "lineage/👑",
    {
      rank: 8,
      subject: "sp",
      role: true, // the family that holds the water, and it can change hands
      line: (ctx) => `One family holds most of this pond now: the ${ctx.family}.`,
    },
  ],
  [
    "lineage/🌿",
    {
      rank: 9,
      subject: "sp",
      line: (ctx) => `A new family has appeared — the ${ctx.family}, and this pond grew them itself.`,
    },
  ],
  [
    "lineage/⚰️",
    {
      rank: 8,
      subject: "sp",
      line: (ctx) => `A whole family is gone: the ${ctx.family}, down to the last one.`,
    },
  ],

  // --- One animal ---
  [
    "record/👶",
    {
      rank: 7,
      subject: "who",
      role: true, // the pond's best parent, and it can change hands
      line: (ctx) => `Nobody in this pond has raised more young than ${ctx.name}.`,
    },
  ],

  // --- Night, in the worlds that have one ---
  [
    "night/🌙",
    { rank: 8, line: () => "Night falls, and until it lifts nothing here can see very far." },
  ],
  ["night/🌑", { rank: 9, line: () => "Something in this water has learned to hunt in the dark." }],

  // --- Sickness, in the worlds that have one ---
  ["disease/🦠", { rank: 8, line: () => "Something in this water has fallen sick." }],
  ["disease/🤒", { rank: 8, line: () => "The sickness has taken hold, and much of this pond is ill." }],
  [
    "disease/🛡️",
    { rank: 7, line: () => "Half the pond has beaten the sickness, and they cannot catch it again." },
  ],
  ["disease/🧫", { rank: 7, line: () => "The sickness has run out of animals to catch, and is gone." }],

  // --- The crop, in the worlds where it can be ruined ---
  [
    "regrowth/🍂",
    { rank: 8, line: () => "The pond has been grazed bare — there is almost nothing green left." },
  ],
  ["regrowth/🌾", { rank: 6, line: () => "The green is coming back." }],
  ["detritus/🍂", { rank: 7, line: () => "The green is growing out of the dead now." }],

  // --- Minds ---
  [
    "learning/🧠",
    { rank: 9, line: () => "The animals here have started learning things inside their own lives." },
  ],
  ["brain/🕸️", { rank: 7, line: () => "A brain in this water has grown a piece its parents never had." }],
]);

/**
 * Every other line the Chronicle writes, and why it stays in the panel.
 *
 * This half is the point of the exercise. A table of what a feature *does* is
 * an implementation; a table of what it deliberately does not do is a design,
 * and `test/news.test.js` holds the two together — every `_push` in
 * `chronicle.js` is in exactly one of these maps, so a Chronicle line added
 * later cannot quietly arrive in a third state where nobody has asked the
 * question.
 */
export const KEPT_BACK = new Map([
  [
    "pop/🌊",
    "how full the water is, at a round number. The ladder already makes a fuss " +
      "when the pond doubles, and a crowd is the one thing on this list a " +
      "visitor can see without being told anything.",
  ],
  ["record/🌊", "the same reading as `pop/🌊`, at its all-time high rather than at a round number."],
  ["predation/🔺", "the first kill, which is the ladder's second rung and is already said out loud."],
  [
    "lineage/🧬",
    "a generation count crossing 10, 25, 50, 100 or 200. The ladder's sixth " +
      "rung is ten generations deep and says it in the words this page teaches.",
  ],
  [
    "death/⚰️",
    "which cause of death is leading. A change in a running average over the " +
      "last forty bodies is not a moment, and the panel that owns it says it " +
      "better than a banner could.",
  ],
  [
    "diversity/🎯",
    "a selective sweep. The event is real and the sentence is unreadable " +
      "without the word — see `WATER_JARGON` — and what a visitor would see is " +
      "the pond going one colour, which the water already shows them.",
  ],
  ["diversity/🌈", "the same reading, coming back the other way."],
  [
    "disease/💪",
    "one animal shaking off an illness. The pond passing half immune is a " +
      "state of the water; one recovery is a state of one body, and the water " +
      "cannot show which body.",
  ],
  [
    "night/🌅",
    "dawn. The first nightfall earns a sentence because a pond that has gone " +
      "dim looks broken; the light coming back explains itself.",
  ],
  [
    "longevity/⏳",
    "a new oldest animal. It is a number that only goes up, it fires again " +
      "every time it does, and every firing is the same sentence with a bigger " +
      "number in it.",
  ],
  [
    "terrain/⛰️",
    "the living having settled onto smoother ground, in percent. True, " +
      "measured, and nothing anybody could watch happen.",
  ],
]);

/**
 * What the water is told about one moment, or `null` if that moment is not one
 * of the water's.
 *
 * @param {{cat:string, icon:string, who?:number, sp?:number}} e a Chronicle event
 * @param {{familyName:(sp:number)=>string}} names how to spell a family
 * @returns {{key:string, rank:number, line:string, who:number, sp:number, whoIs:string}|null}
 */
export function waterLine(e, names) {
  const key = newsKey(e);
  const say = WATER.get(key);
  if (!say) return null;
  const who = e.who ?? -1;
  const sp = e.sp ?? -1;
  // A line about a family cannot be written without the family's name, and a
  // line about an animal cannot be written without theirs. Neither is a case
  // that should ever arrive — the Chronicle sets `sp` on every family line and
  // `who` on every animal one — but a banner reading "the undefined" is the
  // shape of failure this page must never show, so an unnamed subject is a
  // moment the water skips rather than a sentence it guesses at.
  if (say.subject === "sp" && sp < 0) return null;
  if (say.subject === "who" && who < 0) return null;
  const words = say.line({ family: say.subject === "sp" ? names.familyName(sp) : "", name: eventWho(e) });
  // Whoever holds the role this line is about, or -1 on a line that may only be
  // said once. The watch compares this and nothing else, so a line's repeat
  // rule is a property of the line rather than of the loop that reads it.
  const holder = say.role ? (say.subject === "who" ? who : sp) : -1;
  // The Chronicle's own icon, in front of the Chronicle's own words rewritten.
  // Every banner this page has ever raised opens with one, and this one is not
  // decoration: it is the same mark the line wears in the panel that lights up
  // behind it, which is the only thing connecting the sentence over the water
  // to the place a visitor can go and read the rest of the story.
  return { key, rank: say.rank, line: `${e.icon} ${words}`, who, sp, holder, whoIs: eventWho(e) };
}

/**
 * What this pond has already said over its own water.
 *
 * One watch per pond, held in the page's world-scoped state for `cheerWatch`'s
 * reason: a watch carried across a reset would leave a new pond silent about
 * everything the last one had already announced.
 *
 * **The repeat rule, and it is one sentence.** A key speaks once per pond,
 * unless the line is about a *role* — see `WATER` — in which case it speaks
 * again when the role changes hands.
 *
 * That rule is doing real work rather than being tidy. The young record is
 * **9.39 lines a run**, the most talkative thing in the whole feed, and eight
 * of every nine are one champion beating their own number — `streak.js` folds
 * exactly the same run in the panel, one surface over. Keyed on the holder, the
 * water says it two or three times a run, on the days the record changes hands,
 * which is the only day it is news.
 *
 * And the correction that came from measuring five minutes instead of two: the
 * rule was first written as *again for a new subject*, which is no rule at all
 * on a line whose subject is new by construction. Over eighteen thousand steps
 * that shipped *a new family has appeared* twelve times in fourteen banners.
 * A repeat rule keyed on a subject only means anything where the subject can
 * repeat, and the horizon I first measured over was too short to show it.
 */
export class NewsWatch {
  constructor() {
    /** @type {Map<string, number>} key → who held it when it was last said (-1: said, once, ever). */
    this._said = new Map();
  }

  /**
   * Read a stretch of new Chronicle lines and return the best moment in it, or
   * `null` if there is nothing the water wants.
   *
   * **The best, not the first, and not all of them.** The caller shows one
   * banner and then goes quiet for long enough to read it; whatever else
   * happened in that stretch has to be dropped, because a queue would make the
   * banner a delayed feed rather than a moment. So the choice is made here,
   * over the whole stretch, by `rank` — and a tie goes to the *newer* line,
   * because two moments of equal weight are best represented by the one still
   * on screen.
   *
   * @param {Array<{tick:number, cat:string, icon:string, who?:number, sp?:number}>} fresh
   * @param {number} tick the pond's clock now
   * @param {{familyName:(sp:number)=>string}} names
   */
  best(fresh, tick, names) {
    let pick = null;
    for (const e of fresh) {
      if (tick - e.tick > STALE_STEPS) continue; // history, not news
      const said = waterLine(e, names);
      if (!said) continue;
      // The repeat rule. A line with no role remembers `-1` and is therefore
      // never equal to anything but itself again; a line with one remembers
      // whoever held it, so a change of hands is news and the same holder twice
      // is not.
      if (this._said.has(said.key) && this._said.get(said.key) === said.holder) continue;
      if (!pick || said.rank >= pick.rank) pick = said;
    }
    if (pick) this._said.set(pick.key, pick.holder);
    return pick;
  }
}
