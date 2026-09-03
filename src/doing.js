// doing.js — what the animal you are watching is doing, right now, in one line.
//
// Everything this page says about one creature is an **attribute**. The
// inspector's grid: generation 14, 61% fed, size 4.2, metabolism 1.03×. The
// spoken sentence: *Creature 812, generation 14, a grazer, 61% fed, on ground
// 12% rough, calling 0.31, hearing nothing, in the north-west of the pond.*
// Twenty-four releases of naming, ranking, charting and narrating, and not one
// of them has ever used a **verb**. A visitor picks an animal out of three
// hundred darts, and the page hands them a specification.
//
// A person watching an animal wants to know what it is doing. That is the whole
// of this module: one short sentence, in the present tense, with the animal's
// name at the front of it — *Iris is heading for food.* — under the water, live,
// changing as the animal's situation does.
//
// **It is read off the animal's own senses, not off the pond.** `Creature#sense`
// already writes, every tick, the input vector the brain is about to be run on:
// how near the closest pellet is and whether it lies ahead, the same for the
// nearest thing this animal could eat and the nearest thing that could eat it,
// and how fast it is going. That vector is the animal's *point of view*, and it
// is the honest thing to build a verb out of — "heading for food" should mean
// food this creature can see, not food a god's-eye query found. It is also free:
// the numbers are computed for the brain whether anybody reads them or not.
//
// **A meal is a rise in energy, and nothing else in this world raises energy.**
// There are exactly three lines in `world.js` that add to `creature.energy` and
// all three are somebody eating (a pellet, a bite of prey, a mouthful of
// carrion); everything else — metabolism, the cost of a child, a bite taken out
// of you — subtracts. So an observer that remembers what an animal's energy was
// a frame ago can say *has just eaten* without the simulation recording
// anything, without a field being added to a creature, and without this file
// being anywhere near the code that feeds them.
//
// ## Two of the states I wrote do not exist
//
// The first draft had ten. Twelve seeds, four subjects each, three thousand
// ticks after a four-hundred-tick warm-up — 52,841 sampled animal-instants:
//
//   - **`feeding` — "right on top of a pellet" — fired on 0.0% of them.** A
//     creature within `eatRadius` of food is a creature that ate it on that same
//     tick, so the state is entered and left inside one step and can never be
//     sampled.
//   - **`ready to breed` — "energy past `reproduceThreshold`" — fired on 0.0%
//     of them**, for exactly the same reason: crossing the threshold *is* the
//     split, and the energy is gone in the same tick it arrived.
//
// Both are states defined by a threshold the world **acts on immediately**, and
// a state like that is not rare — it is unobservable, and no amount of watching
// will show it. That is a shape worth carrying to every future panel here: a
// condition the simulation resolves on the tick it becomes true cannot be put on
// a screen a human reads at 60 Hz. `ate` is the repair, and it is the opposite
// construction — not the instant, but the *wake* of the instant.
//
// ## The hold, and why this file needs one where `nametag.js` did not
//
// v1.126 measured the cast and found it stable — a change every 146 ticks —
// and built no hold, because every cast role is an extremum over a slow
// quantity (age, young raised, a body radius that never moves at all). Every
// input *here* is a live proximity, and the measurement comes out the other way
// round: the raw state changes **every 14.5 ticks**, 91.9% of runs are shorter
// than 30 ticks, and the median run is **10**. At 1× that is a caption
// rewriting itself four to five times a second, which is not a sentence — it is
// a flicker with words in it.
//
// So the line is held. Candidate holds against the same 52,841 instants, in
// captions per 1,000 ticks and in the share of time the shown line is not the
// current truth:
//
// | hold (ticks) |   0  |  15  |  30  |  60  |  90  | 120  | 180  |
// | captions     | 78.6 | 42.4 | 24.6 | 14.2 |  9.9 |  7.7 |  5.5 |
// | stale        |  0%  |  24% |  36% |  41% |  44% |  47% |  49% |
//
// The trade turns over at 90: 30→60 buys 10.4 fewer captions for 5.2 points of
// staleness, 60→90 buys 4.3 for 2.8, and 90→120 buys only 2.2 for 3.2 — past
// there you are paying more in lying than you get back in legibility.
//
// **The hold is in milliseconds, not ticks, and that is the point.** Every other
// constant in this project that could be either is in ticks, because the pond's
// clock is a fact about the animals and a second is a fact about the speed
// slider. This one is the exception and for the reason that makes it one: what
// the hold protects is not a property of the pond but of a **reader's eye**, and
// a reader's eye runs at the same speed whether the slider says 1× or 20×. Held
// in ticks, a 90-tick line would be 75 ms at 20× and the flicker would be back.
// 90 ticks at 1× on a 60 Hz frame is 1,500 ms, so that is the number.
//
// **Letting the exciting states jump the hold makes both numbers worse.** The
// obvious refinement is to let `fleeing`, `hunting` and `ate` preempt a line
// that has not served its time — they are the moments somebody is watching for.
// Measured, that is 13.8 captions per 1,000 instead of 9.9 **and** 53.3% stale
// instead of 44.2%: worse on both axes at once, because the dramatic states are
// the *briefest* ones, so preempting parks a stale "running from something
// bigger" on the page after the chase has ended. There is no preemption. One
// rule, no exceptions, and the numbers are better for it.
//
// And the hold turns out to do the amplifying by itself. `ate` is 0.6% of the
// truth and **5.6% of what is shown** — a meal, once it latches, holds the line
// for its full second and a half, so the rarest and best moment gets nine times
// its share of the page for free. Every other state is shown within about three
// points of its true frequency, so the hold does not otherwise distort the
// picture it is steadying.
//
// Determinism: PURE OBSERVER. It reads a creature's fields and the input buffer
// the brain was already given, writes nothing to the world, adds no field to
// anything, and draws no random number. A pond somebody is watching an animal in
// is bit for bit a pond nobody is. There is a test.

/**
 * Where the three bearings this file reads live in `Creature#_in`.
 *
 * The layout is declared in `Creature#sense` and these are the four slots of it
 * that describe *the world around this animal*: how near the nearest pellet is
 * and whether it lies ahead (`cos` of the relative bearing is positive in front
 * and negative behind), and the same pair for prey and for a threat. The
 * proximities are 1 at the nose and 0 at the edge of sight.
 *
 * A comment cannot keep two files in step, so `test/doing.test.js` runs
 * `sense()` on a creature with a known pellet, a known prey and a known threat
 * and asserts that these indices hold what they are named for. If the input
 * vector is ever reordered, that test fails here rather than this module
 * quietly describing the wrong sense.
 */
export const SENSE = Object.freeze({
  foodCos: 3,
  foodProx: 4,
  preyCos: 6,
  preyProx: 7,
  threatCos: 9,
  threatProx: 10,
});

/**
 * How near counts as near, as a fraction of the animal's own sight.
 *
 * Half. This one is **stated rather than measured**, and the sweep is the reason
 * it is allowed to be: taken from 0.25 to 0.5 the shares slide smoothly —
 * `stalked` 25.4% → 15.9%, `fleeing` 6.2% → 3.6% — with no knee anywhere in the
 * range, so there is no number in the pond here to find. What there is, is a
 * sentence a visitor can be told and check: *near means inside half of what it
 * can see.* When a constant is a framing rather than a finding, the honest thing
 * is to say so and pick the one that is easy to explain.
 */
export const NEAR = 0.5;

/** Moving at all, as a fraction of `maxSpeed` — the floor under "is chasing". */
export const STIR = 0.1;

/** Barely moving, as a fraction of `maxSpeed` — the ceiling on "is drifting". */
export const STILL = 0.05;

/** Running out, as a fraction of `energyMax`. Below this an animal is in trouble. */
export const LOW = 0.2;

/**
 * How long a line stays up before it may be replaced, in milliseconds of wall
 * clock. See the header: 90 ticks at 1× on a 60 Hz frame, held in the unit the
 * constraint is actually in, so the line is as readable at 20× as at 1×.
 */
export const MIN_SHOW_MS = 1500;

/**
 * The states, in the order they are tested, each with its mark and the words
 * that follow a name.
 *
 * Order is priority: the first one that is true is the one that is said, and the
 * rule that sets it is **an action outranks the circumstance it is a response
 * to**. An animal that is hungry and has food in sight is `foraging`, not
 * `starving`; one with something bigger behind it and its foot down is
 * `fleeing`, not `stalked`; one chasing a meal with a threat in the water beside
 * it is `hunting`, because what it is *doing* is the chase. The circumstances —
 * `stalked`, `starving`, `sick` — are what is left when the animal is not
 * visibly doing anything about them, which is exactly when they are worth
 * saying. Predation's three sit above food's two throughout, because getting
 * eaten and eating an animal are this pond's rare and decisive events, and
 * because a sentence about lunch under a sentence about being lunch would be
 * the wrong one on screen.
 *
 * **The three predation states are gated on the flag, and I wrote them ungated
 * first.** The reasoning that produced the bug is worth keeping because it is
 * so nearly right: without predation nothing gets eaten, so surely nothing is
 * anybody's prey or threat and the states cannot fire. They fire on every tick
 * of such a pond. `World#step` fills the prey and threat slots from
 * `Creature#canEat`, which asks about diet and body size and **never asks
 * whether predation is on**; only the *bite*, sixty lines further down, consults
 * the flag. That is deliberate and load-bearing — an input vector that changed
 * shape with the flag would put two otherwise identical worlds on different
 * draw streams — and its consequence is that **an animal's senses do not know
 * the mechanic is switched off**. A brain never needs to; an observer writing
 * English about what it can see does. `test/doing.test.js` runs a predation-free
 * pond for 1,200 ticks and fails if any of the three is ever said.
 *
 * `sick` needs no gate, because an infection is a thing that has actually
 * happened to a body rather than a thing that has been perceived.
 */
export const DOINGS = Object.freeze({
  ate: { icon: "🍽", phrase: "has just eaten." },
  fleeing: { icon: "💨", phrase: "is running from something bigger." },
  hunting: { icon: "🎯", phrase: "is chasing something smaller." },
  stalked: { icon: "⚠️", phrase: "is close to something big enough to eat them." },
  foraging: { icon: "🌿", phrase: "is heading for food." },
  starving: { icon: "🪫", phrase: "is running out of energy." },
  sick: { icon: "🤒", phrase: "is sick." },
  resting: { icon: "💤", phrase: "is drifting, going nowhere in particular." },
  searching: { icon: "👀", phrase: "is looking for food, with none in sight." },
});

/** The states in test order — the object's own key order, named so a test can hold it. */
export const DOING_ORDER = Object.freeze(Object.keys(DOINGS));

/**
 * What this animal is doing, as one of `DOINGS`' keys.
 *
 * @param {object} c a living creature
 * @param {object} config needs `maxSpeed`, `energyMax`
 * @param {boolean} [ate] did its energy go up since the last look? See
 *   `DoingWatch`, which is the only thing that can answer that — a single frame
 *   cannot.
 * @returns {string} a key of `DOINGS`
 */
export function doingOf(c, config, ate = false) {
  if (ate) return "ate";
  const s = c._in;
  const speed = Math.hypot(c.vx, c.vy) / config.maxSpeed;
  const moving = speed > STIR;
  if (config.predation) {
    // Away from a threat that is close: the bearing's cosine is negative when
    // the thing that could eat you is behind you, which — with the animal
    // moving — is the only reading of "running away" available from the
    // animal's own senses.
    if (s[SENSE.threatProx] >= NEAR && moving && s[SENSE.threatCos] < 0) return "fleeing";
    // Ahead of it and closing. With scavenging on, the slot this reads may hold
    // a corpse rather than a living animal — the world puts whichever is nearer
    // there, so that hunters and scavengers share one behaviour — and the
    // sentence survives it: a corpse is smaller, and the animal is going for it.
    if (s[SENSE.preyProx] >= NEAR && moving && s[SENSE.preyCos] > 0) return "hunting";
    // A threat this near that it is not running from. The page does not claim
    // the animal has failed to notice — it says where the danger is, which is
    // all the senses support and quite alarming enough.
    if (s[SENSE.threatProx] >= NEAR) return "stalked";
  }
  if (s[SENSE.foodProx] >= NEAR && s[SENSE.foodCos] > 0) return "foraging";
  if (c.energy / config.energyMax <= LOW) return "starving";
  if (c.infected) return "sick";
  if (speed <= STILL) return "resting";
  return "searching";
}

/**
 * The line, composed: a name, a space, and the words for a state.
 *
 * Here rather than in the renderer for the reason `chronicle.js` and
 * `nametag.js` both give for composing their own: the words are the feature and
 * the drawing is not, so the sentence has to be somewhere `node --test` can read
 * it without a canvas.
 *
 * @param {string} name the animal's given name
 * @param {string} key a key of `DOINGS`
 * @returns {string}
 */
export function doingLine(name, key) {
  const d = DOINGS[key];
  return d ? `${name} ${d.phrase}` : "";
}

/** The mark for a state, or an empty string for one this file does not know. */
export function doingIcon(key) {
  return DOINGS[key]?.icon ?? "";
}

/**
 * The same line as markup, with the name picked out.
 *
 * The name is the half of this sentence a visitor is scanning for — it is the
 * word that ties the card to a dart in the water and to a row on the `🏅 Worth
 * watching` board — so it is the half that carries weight. Composed here beside
 * the plain line, so the two cannot say different things.
 *
 * **The outer span is not decoration.** The card centres its line vertically,
 * which makes the paragraph a flex container, and a flex container turns each
 * run of bare text between its element children into an anonymous item **with
 * the whitespace at its ends stripped**. Handed `<b>Nim</b> is heading…`, the
 * page renders *Nimis heading for food.* — which is what the first browser walk
 * of this feature came back with, on a phone-width viewport, in a sentence
 * `node --test` had already passed as correct. So the sentence goes over as one
 * element, and the layout never sees a gap it can eat.
 *
 * Names come from `cast.js#givenName`, which is a lookup into a fixed word list
 * keyed by an integer id: there is no path by which a visitor's input reaches
 * this string.
 *
 * @param {string} name
 * @param {string} key a key of `DOINGS`
 */
export function doingHTML(name, key) {
  const d = DOINGS[key];
  return d ? `<span class="d-said"><b class="d-name">${name}</b> ${d.phrase}</span>` : "";
}

/**
 * What the strip says when nobody has been picked.
 *
 * The one place on this page that is allowed to be an instruction, because it is
 * the only surface whose entire content is *the thing you have not done yet*. It
 * names both ways in, since the keyboard route is otherwise written down only in
 * a screen-reader paragraph nobody sighted will ever read.
 */
export const DOING_INVITE = "Pick an animal — click one, or press M — and this line will follow it.";

/** The mark beside the invitation. A hand, because the invitation is to point. */
export const INVITE_ICON = "👆";

/**
 * A steady line about one animal, across frames.
 *
 * Holds three things and nothing else: who is being watched, what the line
 * currently says and when it started saying it, and what that animal's energy
 * was at the previous look — which is the whole of the meal detector. Handing it
 * a different creature, a dead one, or nothing at all resets it, so a line never
 * carries over from one animal to the next (v1.142's roster lesson: a field
 * inherited across subjects is the kind of stale that is *dangerous* rather than
 * merely wrong — here it would credit one animal with another's dinner).
 *
 * The clock is passed in rather than read, so a test can run a year of this in a
 * millisecond and the page can hand it `performance.now()`.
 */
export class DoingWatch {
  /** @param {number} [minShowMs] how long a line is held — see `MIN_SHOW_MS` */
  constructor(minShowMs = MIN_SHOW_MS) {
    this.minShowMs = minShowMs;
    /** @type {number|null} whose line this is */
    this.id = null;
    /** @type {string|null} the key currently on screen */
    this.key = null;
    /** When the current key went up, on the caller's clock. */
    this.since = 0;
    /** That animal's energy at the previous look. */
    this.energy = 0;
  }

  /** Forget everything. Called when the subject changes, dies, or goes away. */
  reset() {
    this.id = null;
    this.key = null;
    this.since = 0;
    this.energy = 0;
  }

  /**
   * Look at the watched animal and return the key that should be on screen.
   *
   * The first look at a new animal never reports `ate`: there is no previous
   * energy to compare against, and a made-up one would announce a meal on the
   * frame somebody was picked, which is the one frame a visitor is certain to be
   * looking at.
   *
   * @param {object|null} c the selected creature, or null
   * @param {object} config
   * @param {number} now a monotonically rising clock, in milliseconds
   * @returns {string|null} a key of `DOINGS`, or null when nobody is watched
   */
  look(c, config, now) {
    if (!c || c.dead) {
      this.reset();
      return null;
    }
    let ate = false;
    if (c.id !== this.id) {
      this.id = c.id;
      this.key = null;
    } else {
      ate = c.energy > this.energy;
    }
    this.energy = c.energy;
    const truth = doingOf(c, config, ate);
    if (this.key === null || now - this.since >= this.minShowMs) {
      if (truth !== this.key) {
        this.key = truth;
        this.since = now;
      }
    }
    return this.key;
  }
}
