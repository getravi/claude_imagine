// memorial.js — the book of the dead, so every name in the story is a door.
//
// Four releases running, this project's own notes have ended with the same
// unbuilt thing:
//
//   > **the book of the dead is still not built** — 63.4% of the animal lines
//   > name somebody buried, `obituary.js` writes a life at the instant of death
//   > and throws it away, and it is the half that would make the *bottom* of
//   > the column worth pressing.
//
// This is that. v1.121 taught this page to write a life when the animal in the
// inspector dies; the card was shown once and dropped on the floor, because the
// only reader it had was the panel the body was already in. The Chronicle names
// animals too, over and over, and until now a reader who pressed one of those
// names got nothing at all once its subject was gone.
//
// **What the measurement said, and it is the cleanest number I have got out of
// one of these sweeps.** Twelve seeds, six thousand steps, sampled every fifty:
//
//   - **100.0%** of the feed's animal lines become pressable — 8,402 of 8,402.
//     Not 90-something: *all of them*, on every seed.
//   - Of those lines, **31.7%** name somebody still in the water and **68.3%**
//     somebody in this book.
//   - The feed as a whole goes from **26.2%** of its lines pressable to
//     **52.9%**, and from a mean of 3.63 controls on screen to **8.06**.
//
// The reason it is exactly 100% rather than nearly: **the Chronicle only ever
// names an animal that is alive as it writes.** Over the whole sweep, 29 named
// subjects and not one of them was already dead when their first line was
// written — so a watcher that picks up a name the moment it appears sees every
// one of those deaths happen. This panel's dead ends were never a gap in what
// could be known; they were a gap in what anybody had bothered to keep.
//
// Three rules.
//
//  1. **The book has no size of its own.** I nearly wrote a `MEMORIAL_MAX` and
//     picked a number out of the air — this project's own note says every
//     "would this be too much?" I have written is a guess dressed as restraint.
//     A card is worth keeping exactly while some line on the panel could ask
//     about it, so the book is pruned against the Chronicle's own subjects and
//     is bounded by the Chronicle's buffer, which is a constant somebody
//     already measured and tested. The observed maximum is **4** cards, over
//     six thousand steps, across every seed tried.
//  2. **The body is borrowed for one step, and what is kept is a card.**
//     `obituary.js`'s rule: a panel holding a dead creature is the one place on
//     this page keeping a dead thing alive. So `witness` hands the caller the
//     bodies that died this step and keeps none of them; the caller turns each
//     into the plain snapshot `obituaryFor` already knows how to write.
//  3. **A death is noticed per step, not per frame.** `trail.js`'s reason, and
//     the same arithmetic: at 20× a frame is twenty ticks, and an animal that
//     is named and then eaten inside one of those frames would be a name this
//     book never got — which is precisely v1.133's finding, where the first
//     press in a real browser said hello to an animal and read its obituary a
//     third of a second later.
//
// Determinism: nothing here reads the simulation's random numbers or writes
// anything back into it. It watches a list of creatures for a flag the world
// has already set, exactly like the renderer watches for a colour. A pond
// nobody is looking at is bit-for-bit a pond with a book beside it.

/**
 * What the offer says on a line about somebody buried.
 *
 * Not the `👀 Show me` the ladder and the feed's living lines wear, and the
 * exception is deliberate. v1.136's rule was *one promise, two mechanisms* —
 * both presses put the thing the sentence is about on the screen, and that one
 * moves a camera while the other lights up a lineage is an implementation
 * detail a visitor should never have to learn. This press is a different
 * promise: nothing is going to appear in the water, because the subject is not
 * in the water. A control that says *Show me* and then shows a card is a
 * control that lied, which is the same defect as a control that does nothing.
 *
 * It lives here rather than in `feed.js` because the verb belongs to the book,
 * not to the one panel that currently asks it questions — this project has a
 * habit of writing a rule into whatever module it happened to be holding and
 * then finding, four releases later, that the next surface could not import it.
 * The cast board and the record book both point at the dead too.
 */
export const STORY_LABEL = "📖 Their story";

/** Nothing died this step, which is nearly every step. Shared, so it costs nothing. */
const NOBODY = Object.freeze([]);

/**
 * The lives this pond has kept, and the watch that fills it.
 *
 * Two maps and a pair of markers. `watching` holds the named who are still in
 * the water — borrowed references, dropped the moment they die — and `book`
 * holds the cards of those who are not. An id is in at most one of them, and
 * both are pruned to what the Chronicle can still ask about.
 */
export class Memorial {
  constructor() {
    /** @type {Map<number, object>} id → the life, as `obituaryFor` wrote it. */
    this.book = new Map();
    /** @type {Map<number, object>} id → a living body this book expects to outlive. */
    this.watching = new Map();
    // What the chronicle looked like when the subjects were last read out of
    // it. The length alone is not enough: the buffer drops a line off the front
    // when it is full, so a step that writes one and loses one leaves the
    // length where it was and the contents different.
    this._len = -1;
    this._newest = null;
  }

  /**
   * Take one look at the pond: adopt any new subject, and hand back the watched
   * who have just died.
   *
   * @param {{chronicle:{events:Array<{who:number}>}, creatures:Array<object>}} world
   * @returns {Array<object>} the bodies that died since the last look, borrowed
   *   for the length of this call — the caller must copy what it wants.
   */
  witness(world) {
    const events = world.chronicle.events;
    const newest = events.length > 0 ? events[events.length - 1] : null;
    if (events.length !== this._len || newest !== this._newest) {
      this._len = events.length;
      this._newest = newest;
      this._reread(events, world.creatures);
    }
    let gone = null;
    for (const [id, body] of this.watching) {
      if (!body.dead) continue;
      this.watching.delete(id);
      (gone ??= []).push(body);
    }
    return gone ?? NOBODY;
  }

  /**
   * The panel's subjects have changed: pick up whoever is new, drop whoever the
   * panel has stopped mentioning.
   *
   * Runs only when the Chronicle moves — about fifteen times in a six-thousand
   * step run, against the six thousand calls to `witness` around it, which is
   * why the walk of the pond in here is affordable and a walk per step would
   * not be.
   */
  _reread(events, creatures) {
    const named = new Set();
    for (const e of events) if (e.who >= 0) named.add(e.who);
    for (const id of named) {
      if (this.watching.has(id) || this.book.has(id)) continue;
      // A name with no body is a subject that died before this book existed —
      // a pond loaded from an archive, or a page opened mid-run. It gets no
      // card and its lines stay sentences, which is the honest outcome: the
      // life was never written down and nothing here can invent it.
      const body = findLiving(creatures, id);
      if (body) this.watching.set(id, body);
    }
    // Rule 1: a card is worth keeping exactly while a line could ask about it.
    for (const id of this.book.keys()) if (!named.has(id)) this.book.delete(id);
    for (const id of this.watching.keys()) if (!named.has(id)) this.watching.delete(id);
  }

  /**
   * Keep a life. The card is plain data — see `obituaryFor`, which writes it.
   * @param {{id:number}} card
   */
  remember(card) {
    if (card && card.id >= 0) this.book.set(card.id, card);
  }

  /** Is there a life to read for this animal? The question the feed asks per row. */
  has(id) {
    return this.book.has(id);
  }

  /** The life, or `undefined` — a card can be pruned between a draw and a press. */
  get(id) {
    return this.book.get(id);
  }

  /** How many lives the book holds. Measured, not guessed: it stays small. */
  get size() {
    return this.book.size;
  }

  /**
   * A new pond. Every id in here belongs to the old one, and creature ids come
   * from a counter at module scope — so a card left behind would sooner or
   * later answer for somebody else entirely.
   */
  forget() {
    this.book.clear();
    this.watching.clear();
    this._len = -1;
    this._newest = null;
  }
}

/** The living body with this id, or null. */
function findLiving(creatures, id) {
  for (const c of creatures) if (c.id === id && !c.dead) return c;
  return null;
}
