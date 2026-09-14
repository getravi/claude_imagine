// banner.js — the page finishes its sentences.
//
// One strip of text sits over the water and **five separate features write to
// it**: the ladder's celebrations, the Chronicle's moments, the obituary of
// whoever the visitor was watching, the receipt for every press on this page,
// and the hand-feed's tally of who ate what. Until now the strip had no manners
// at all. `flash()` wrote its text, cleared the previous `setTimeout` and
// started a new one, so **whatever was being read was gone mid-word** — not
// faded, not queued, replaced between two frames.
//
// ## What that costs, over a visit rather than at the instant
//
// Replayed off the DOM, forty seeds run to eighteen thousand steps — the five
// minutes v1.177 established as the length of a visit worth measuring — with
// nobody pressing anything at all, so every banner below is one the *pond*
// raised:
//
//   banners in a five-minute visit          median 33 (1,321 over 40 seeds)
//   cut off before their own time was up    433    32.8%
//   cut off with under 2 s read             198    15.0%
//   cut off with under 1 s read             101     7.6%
//   cut off with under a quarter-second      27     2.0%
//   median time a cut banner was up         2,217 ms of the 4,200–5,200 it asked for
//
// So **a third of everything this page says to an unattended visitor is erased
// before it can be read**, and one banner in thirteen is on screen for under a
// second. The median banner is 90 characters. Nobody had seen this because no
// test can: every assertion about a banner is true of the string handed to
// `flash`, and the defect is entirely in what happens to that string *after*.
//
// And the collisions have one voice in them. **All 433 have an obituary on one
// side or the other**, and 181 have one on both — a death cut off by the next
// death, which is v1.177's hand-over chain arriving as a cost: the page seats a
// new animal when the one in the seat dies, the heir dies a few seconds later,
// and the second card wipes the first mid-sentence. The rest are the ladder cut
// by a death (81), a death cut by the ladder (62), the Chronicle cut by a death
// (58) and a death cut by the Chronicle (51). The ladder and the Chronicle have
// held each other back since v1.174; neither of them had ever held back a
// funeral, and the funeral is the commonest thing this page says — 752 of the
// 1,321.
//
// ## The rule, and why it is not a queue
//
// `news.js` argues — correctly, and about itself — that a queue would turn the
// banner into "a delayed feed rather than a moment", which is why the Chronicle
// picks the best line out of a stretch and drops the rest. That argument is
// about *what to say*. This module is about *when*, and the two answers fit
// together:
//
//   1. **The pond takes turns.** A message the world raised never interrupts.
//      It waits until the banner in front of it has had the whole of the time
//      it asked for. `cheerFree` has done exactly this for the ladder since
//      v1.132 — the bug was that it was one feature's private gate rather than
//      the strip's, so it held the ladder back from the ladder and left every
//      other voice free to trample it.
//   2. **A press goes up now.** A receipt is the answer to something the
//      visitor has just done, and a page that made somebody wait five seconds
//      to learn their world was saved would be worse than one that interrupts.
//      They caused the change, so they are not left wondering what happened to
//      the line that was there.
//   3. **One seat in the waiting room, and the newer moment takes it.**
//      `news.js`' tie rule, applied one surface along: two moments waiting is a
//      feed, and of two the newer is the one still true of the water a reader
//      is looking at.
//   4. **A message that has waited longer than the longest banner is dropped
//      unread.** Nothing here is ever shown late. `WAIT_MS` is `CHEER_MS`,
//      which is the longest this page ever holds the strip: having waited more
//      than one full turn, a line has outlived the pond it described.
//   5. **The same sentence twice is one sentence**, extended rather than
//      re-raised, so a repost cannot make the strip flicker.
//
// Replayed through those rules, the same forty recorded visits are cut short
// **zero** times. 417 lines wait, a median of 1,550 ms and never longer than
// 5,183; 120 are dropped unread, every one of them an older line that lost the
// seat to a newer moment. The trade, stated as a visitor would meet it:
//
//   sentences read from beginning to end    888 → 1,200   (+35%)
//   sentences shown as a fragment           433 → 0
//   sentences never shown at all              0 → 120
//
// Which is the right way round. A line nobody sees costs a visitor nothing; a
// line that appears and is snatched away costs them the line *and* the one that
// took it, because they were reading when it moved.
//
// The longest wait measured, 5,183 ms, is under `WAIT_MS` — so on an unattended
// visit rule 4 never fires. It is there for the visit that is *not* unattended,
// where a run of presses could hold the strip indefinitely.
//
// ## What this module is not
//
// It holds no element, no timer and no text of its own — it is handed messages
// and a clock and says what should be on screen. `main.js` owns the DOM half,
// which is a `textContent`, a class and the offer button; the reason for the
// split is that a policy about reading speed is testable and a `setTimeout` on
// a `<div>` is not. That is also why the offer button is carried *on the
// message* now rather than appended by the caller straight after its `flash`:
// a banner that waits would otherwise have its "👀 Show me" bolted onto
// whatever line was still up, pointing a visitor at the wrong animal.
//
// Determinism: nothing here touches the world and nothing draws a random
// number. Every clock in this file is the browser's.

/** How long a message may wait for the strip before it is dropped unread. */
export const WAIT_MS = 5200;

/**
 * A message, as a caller hands it over.
 *
 * @typedef {object} Message
 * @property {string} text what the strip reads
 * @property {number} ms how long it asks for
 * @property {string} [kind] `"cheer"` for a celebration, `""` for a receipt
 * @property {boolean} [press] true if a visitor's press caused it
 * @property {string} [say] the longer form for a listener, where there is one
 * @property {object} [offer] the banner's own control, carried with its line
 */

/**
 * The strip's turn-taking.
 *
 * One instance for the life of the page: a banner is a fact about the browser
 * and not about any pond, and the receipts outlive every world. What must *not*
 * outlive a world is a line still waiting to be said about it — see `forget`.
 */
export class Banner {
  constructor() {
    /** @type {(Message & {until:number})|null} what is on the strip now. */
    this.showing = null;
    /** @type {(Message & {at:number})|null} the one seat in the waiting room. */
    this.waiting = null;
    /** Lines this strip never said, for the record. */
    this.dropped = 0;
  }

  /**
   * Hand over a message. It is not shown here — `take` is what moves the strip,
   * and a caller that wants its press answered on the spot calls that next.
   *
   * @param {Message} msg
   * @param {number} now the browser's clock, in milliseconds
   */
  post(msg, now) {
    if (this.showing && this.showing.text === msg.text) {
      // Not a second banner: the same one, standing for longer. A message that
      // re-raised itself would fade the strip out and back in over unchanged
      // words, which reads as a fault rather than as news.
      this.showing.until = now + msg.ms;
      return;
    }
    if (this.waiting) this.dropped++;
    this.waiting = { ...msg, at: now };
  }

  /**
   * What the page should do to the strip this instant.
   *
   * @param {number} now
   * @returns {{show:Message & {until:number}}|{hide:true}|null} `show` replaces
   *   whatever is up, `hide` takes the strip away, `null` is *leave it alone* —
   *   which is the answer on almost every frame.
   */
  take(now) {
    const held = this.showing && now < this.showing.until;
    // A press is the one thing that does not wait. Everything else in this
    // method is about the water's own voice, which does.
    if (held && !(this.waiting && this.waiting.press)) return null;
    const next = this._due(now);
    if (next) {
      this.waiting = null;
      this.showing = { ...next, until: now + next.ms };
      return { show: this.showing };
    }
    if (this.showing) {
      this.showing = null;
      return { hide: true };
    }
    return null;
  }

  /** The waiting line, if it is still worth saying. */
  _due(now) {
    if (!this.waiting) return null;
    if (!this.waiting.press && now - this.waiting.at > WAIT_MS) {
      this.waiting = null;
      this.dropped++;
      return null;
    }
    return this.waiting;
  }

  /**
   * A new pond arrives, and anything unread goes with it.
   *
   * `viewstate.js`' rule, at the one surface that cannot live on the roster:
   * the strip carries press receipts too, so the object is page-scoped, and a
   * line still waiting to be said about a world that no longer exists is the
   * exact thing `newsHold` is world-scoped to prevent. What is already *on* the
   * strip is left alone — it has been read by now, and taking words away from
   * under a reader is the failure this whole module exists to fix.
   */
  forget() {
    if (this.waiting) this.dropped++;
    this.waiting = null;
  }
}
