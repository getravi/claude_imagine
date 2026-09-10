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
// The page fills the seat **once per pond** and never argues about it again.
// `main.js` remembers who it sat down, and the moment the visitor picks anybody
// — a click, a tap, an arrow key, `M`, a row on the cast board — the selection
// is no longer that creature and the borrowed-seat line disappears for good.
// There is no flag to keep in step: *the seat is the page's* is spelled
// `renderer.selected === view.pagePick`, which cannot drift from the thing it
// describes.
//
// And when the page's own animal dies, it does **not** pick again. That instant
// belongs to `obituary.js`: the card under the water is this page's best minute,
// it offers `👋 Meet somebody` and `meet their young` as its own next steps, and
// a page that quietly seated a stranger over the top of a life it had just
// narrated would be stepping on the one thing it does well.
//
// Determinism: PURE OBSERVER. This reads positions and returns one of the
// animals it was handed. It writes nothing, steps nothing, and draws no random
// number — a pond nobody is looking at and a pond with somebody in the seat are
// bit-for-bit the same pond.

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
