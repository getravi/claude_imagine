// onstage.js — the page picks somebody, so a visitor does not have to.
//
// `hand.js` holds every sentence this page says in two registers, and **three
// of them exist only to say that you have not done anything yet**:
//
//   #doing     Pick an animal — click one, or press M — and this line will
//              follow it.
//   #eyeview   Pick an animal … and this shows what that animal can see.
//   #decide    Pick an animal … and this shows what it decides to do.
//
// Three panels, one under the other, straight below the water. Measured in a
// headless Chromium at 390 × 844 — the phone this project has been sizing for
// since v1.160 — they run from 978 px to 1,528 px, which is **65% of the second
// screen of this page and the whole of what a visitor meets after the pond**.
// A stranger scrolls once and is handed three grey boxes, each asking them to
// scroll back up and press something before it will say anything at all.
//
// Every one of those three is a good panel. `#doing` narrates a life, `#eyeview`
// is the only picture here of a mind rather than a body, and `#decide` is the
// step between them. All three are switched off until the visitor guesses that
// the dots are clickable.
//
// So: **when a pond begins, the page sits somebody in the seat.** The three
// panels are alive on the first frame, and the invitation stops being the whole
// of what they say and becomes one line under a working example — *show, then
// invite*, which is the order round the right way for somebody who does not yet
// know what pressing a dot would even get them.
//
// ## Who, and why it is not `pickStar`
//
// `cast.js#pickStar` is this project's own answer to *which of these should I
// watch* and it is the wrong answer here, for a reason its own code says out
// loud: at tick zero its whole ladder is empty — nobody has young, nobody is a
// giant, nobody has outlived anybody — so it falls through to `FED`, *the
// best-fed animal in the pond right now*, a claim that is false a tick later
// and which that module deliberately keeps off the cast board for exactly that
// reason. A pond's opening pick has to be true for as long as it is on screen,
// and at tick zero the only thing that is true about any of these animals is
// **where it is**.
//
// So: the living animal nearest the middle of the water. It is honest (there is
// no merit in it and the page says so), it is stable (a position at the instant
// of the pick cannot be contradicted later), and it is the one a reader's eye is
// on anyway — the middle of the frame is where a stranger looks first, so the
// ring the page draws lands where they are already looking rather than in a
// corner they have to hunt for.
//
// ## The seat is only borrowed
//
// The page fills the seat and never argues with the visitor about it.
// `main.js` remembers who it sat down, and the moment the visitor picks anybody
// — a click, a tap, an arrow key, `M`, a row on the cast board — the selection
// is no longer that creature and the borrowed-seat line disappears for good.
// There is no flag to keep in step: *the seat is the page's* is spelled
// `renderer.selected === view.pagePick`, which cannot drift from the thing it
// describes.
//
// ## The seat empties, and until v1.177 it stayed empty
//
// v1.164 seated somebody on the first frame and never asked how long that lasts.
// The answer, over forty seeds run out to eighteen thousand steps — five minutes
// at the speed the page opens on:
//
//   the seat's animal died in            40 of 40 seeds
//   median death                          1,089 steps ≈ 18 seconds
//   the default pond, seed 314              533 steps ≈ 9 seconds
//   the earliest                            105 steps ≈ 2 seconds
//   median share of a five-minute visit
//   spent back at *Pick an animal*          94.1%   (mean 92.8%)
//
// So the fix that opened the three panels held them open for about nine seconds
// of the visit it was built for, and then handed a stranger the exact three grey
// boxes it was written to remove — with an obituary under them, which is a page
// whose subject is now a dead animal for the remaining 97%. Nobody had measured
// it because the measurement v1.164 took was of *the first frame*, and the first
// frame is the one instant in a run where a seat cannot yet be empty.
//
// ## So the seat is handed on, and the card keeps its own moment
//
// The old note said the death instant belongs to `obituary.js` — that a page
// which "quietly seated a stranger over the top of a life it had just narrated
// would be stepping on the one thing it does well". That is right about the
// *card* and it was implemented as a rule about the *panels*, which are a
// different surface with a different job: the card narrates a life that ended,
// the three panels narrate an animal that is alive. Both can be true at once,
// and from v1.177 they are — the card stays up, in full, until the visitor picks
// somebody of their own, and the panels carry on with whoever took the seat.
//
// Who takes it is the card's own answer rather than a new one: **the eldest
// living young**, which is exactly the animal `obituary.js#familyOf` offers
// behind *meet their young*, measured there to be still alive sixty steps later
// 93.0% of the time. The page does the thing its own card suggests. Where there
// is no young left, `cast.js#pickStar` — *which of these should I watch* — and
// the reason it is right here is the reason the section above gives for it being
// wrong at tick zero, read the other way round: its ladder is empty at the
// opening because nobody has young, nobody is a giant and nobody has outlived
// anybody *yet*. A thousand steps in, all three are true of somebody, so the
// answer that was a coin toss at the opening is the best answer on the page.
//
// And no camera, for v1.164's reason. The ring moves; the water does not.
//
// ## What it costs, counted before deciding not to damp it
//
// A seat that refills itself can refill itself twice in a blink, so the gaps
// between hand-overs were measured before any hold was reached for — v1.176's
// note about the five that already exist. Over fourteen seeds and six thousand
// steps, 78 hand-overs:
//
//   median gap              646 steps ≈ 11 seconds
//   inside the 4,200 ms the death's own banner is still up   25.6%
//   inside one second                                        12.8%
//   inside a quarter of a second                              2.6%
//   the shortest                                        5 steps
//
// Three quarters of them are further apart than the banner they replace, and the
// quarter that are not are the pond's crashes rather than a defect in the rule:
// the heir really did die a second after inheriting, and a page that held the
// seat back to spare a reader that news would be editing the pond rather than
// reporting it. So there is no sixth hold here. What there is instead is this
// paragraph, and the number to beat if a later cycle decides the strobe is worse
// than the silence: **2.6%**.
//
// Of the hand-overs themselves, **62.1%** go to the young — so the commonest
// thing this page now says after a death is that the line goes on.
//
// Determinism: PURE OBSERVER. This reads positions, ages and parentage, and
// returns one of the animals it was handed. It writes nothing, steps nothing,
// and draws no random number — a pond nobody is looking at and a pond with
// somebody in the seat are bit-for-bit the same pond.

import { pickStar } from "./cast.js";

/**
 * The living animal nearest the middle of the water, or `null` on an empty pond.
 *
 * Plain distance rather than the torus distance the world uses everywhere else,
 * and that is not an oversight: the target is the *centre*, and no point on this
 * rectangle is closer to the centre the long way round. `torusDist2` would
 * return the same number for every animal here and cost a wrap to do it.
 *
 * Ties go to the lowest id, `cast.js#best`'s rule and for its reason — a
 * `reduce` that keeps the first maximum makes the answer depend on the order of
 * `world.creatures`, which is birth order, which a shuffled turn order (v1.47)
 * is allowed to change. A seat that moves when a switch nobody pressed is
 * flipped is not deterministic in the sense that matters.
 *
 * @param {{creatures:Array<{x:number,y:number,id:number,dead:boolean}>,
 *          config:{width:number,height:number}}} world
 * @returns {object|null}
 */
export function openingPick(world) {
  const cx = world.config.width / 2;
  const cy = world.config.height / 2;
  let winner = null;
  let best = Infinity;
  for (const c of world.creatures) {
    if (c.dead) continue;
    const dx = c.x - cx;
    const dy = c.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < best || (d2 === best && winner && c.id < winner.id)) {
      best = d2;
      winner = c;
    }
  }
  return winner;
}

/**
 * The eldest living young of the animal whose life has just been written.
 *
 * Eldest is lowest id — ids come off a counter, so an animal born earlier is
 * numbered lower — and it is the eldest rather than the youngest because that is
 * the one `obituary.js#familyOf` already offers, on a measurement taken there:
 * over 659 deaths that left two or more young, the eldest is still in the water
 * sixty steps later 93.0% of the time and the youngest 92.3%, so there is
 * nothing to choose between them and *their eldest* is what a person means.
 *
 * Read off the pond rather than off the card's remembered list, for
 * `familyOf`'s reason: a name taken a minute ago may be a body now.
 *
 * @param {{id:number}} record a life, as `obituaryFor` wrote it
 * @param {{creatures:Array<{id:number,parentId:?number,dead:boolean}>}} world
 * @returns {object|null}
 */
export function eldestYoung(record, world) {
  if (!record) return null;
  let heir = null;
  for (const c of world.creatures) {
    if (c.dead || c.parentId !== record.id) continue;
    if (!heir || c.id < heir.id) heir = c;
  }
  return heir;
}

/** How a seat came to be filled, and therefore which sentence sits under it. */
export const SEAT_PHRASE = Object.freeze({
  opening: "seatSwap",
  heir: "seatHeir",
  next: "seatNext",
});

/**
 * Who takes the seat when the animal the page seated dies (v1.177).
 *
 * Two answers and they are in this order because the first one is a *story* and
 * the second is a ranking: the line going on is the thing a reader who has just
 * been told somebody died actually wants next, and it is only unavailable when
 * there is no line to go on with.
 *
 * Returns `null` on a pond with nobody left in it — an empty pond has no seat to
 * fill, and the panels go back to their invitation, which is then the truth.
 *
 * @param {{id:number}} record the life just written, from `obituaryFor`
 * @param {object} world the pond, this frame
 * @param {object} config
 * @param {object|null} names the tree's family names, for `pickStar`
 * @returns {{creature:object, by:"heir"|"next"}|null}
 */
export function nextSeat(record, world, config, names = null) {
  const heir = eldestYoung(record, world);
  if (heir) return { creature: heir, by: "heir" };
  const star = pickStar(world, config, names);
  const c = star && star.creature;
  return c && !c.dead ? { creature: c, by: "next" } : null;
}
