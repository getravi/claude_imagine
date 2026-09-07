// tour.js — the first thirty seconds, for somebody who has never seen this
// before.
//
// Every surface this project has built in the last fifteen releases explains a
// *part* of the pond: `key.js` names the marks in the water, `headline.js`
// writes the sentence over it, `whoswho.js` picks an animal worth watching,
// `evolved.js` says how far the animals have moved from the ones this world
// started with. Each of them is a good answer to a question a visitor has.
//
// Nobody has ever told them which question to ask first.
//
// What a person actually meets on `app/index.html` is a screen holding a canvas
// of moving darts, six panels, three figures, a column of switches and a plot of
// species over time — all of it correct, all of it arriving at once, and none of
// it ranked. The page has no front. A reader who already knows what this is
// finds the Muller plot in four seconds; everybody else watches the darts for
// twenty and leaves, having been shown an aquarium screensaver by a program that
// could have told them it was evolution.
//
// So: a tour. Six stops, one at a time, each one a ring drawn around a real
// thing on the page and a card of two sentences saying what it is and why a
// person should care. It is the oldest mass-market affordance there is, and this
// page — dense, technical, proud of its instruments — is exactly the kind of
// thing it was invented for.
//
// Three rules it is built to, each one paid for by a panel already here:
//
//   1. **It points at the page, not at a copy of it.** Every stop names an `id`
//      that exists in `app/index.html`, and `test/tour.test.js` reads the page
//      back and fails if one goes missing. A tour that highlights an element
//      that was renamed three releases ago is worse than no tour: it teaches a
//      visitor that the guide is lying and the page is broken.
//   2. **It speaks the visitor's language.** Held to the same vocabulary bar as
//      `cast.js`, `key.js` and `records.js` — no *lineage*, no *genome*, no
//      *tick*, no *px*. A tour written in the words of somebody already here is
//      the densest possible way to say nothing.
//   3. **It is six stops and it ends.** The stops are ordered as a story rather
//      than as a reading order — *here is the thing, here is what is happening
//      in it, here is how to read it, here is one animal to care about, here
//      are other worlds to try, now watch a year go by.* The last stop is a
//      call to action, because the visitor most likely to stay is the one who
//      pressed something.
//   4. **The last stop can be pressed** (v1.143). A call to action that is only
//      a sentence asks a visitor who has been reading for thirty seconds to now
//      go and find the thing being described, and the ring is around it but the
//      card is over it. So a stop may carry an `action`, and the guide draws a
//      button that does it. Only the last stop may: running one ends the tour,
//      which is right at the end of a story and is a stop cut short anywhere
//      else. `test/tour.test.js` holds that.
//   5. **It does not stand in front of what it is pointing at** (v1.159). The
//      first stop rings the pond and says *every arrowhead is one animal*, and
//      on every desktop window measured the card was sitting on the arrowheads.
//      See `cardPlacement`: when a target is too tall to flank, the card is
//      placed where it hides the least of it rather than under it by default.
//
// Determinism: this module holds text, an ordering and two integers of
// arithmetic. It never touches the world, never reads the config, and draws no
// random number. The tour cannot move a pond, which is the whole reason it is
// safe to open one over a running simulation.
//
// PURE OBSERVER. No DOM, no simulation state, no random numbers.

/**
 * Where the browser remembers that this visitor has been shown around.
 *
 * The tour opens itself once, on a first visit, and never again unless somebody
 * asks for it. That is the only reason this key exists — the alternative is a
 * guide that reintroduces the page to a person on their fortieth visit, which is
 * the failure mode that made every product of the 2010s tiresome.
 */
export const TOUR_SEEN_KEY = "vivarium.tour.seen";

/**
 * The things a stop's button is allowed to do.
 *
 * A name rather than a function, because this module is not allowed to know
 * what a button does — it holds words. `main.js` keeps the other half of this
 * list, one handler per name, and `test/tour.test.js` fails if the two halves
 * ever disagree: a guide that offers a visitor a button which does nothing is
 * worse than a guide that offers no button, in exactly the way rule 1 is about.
 */
export const TOUR_ACTS = Object.freeze(["skip"]);

/**
 * The stops, in the order they are shown.
 *
 * `target` is the `id` of the element the ring is drawn around; it is checked
 * against the shipped page by the tests. `prefer` is where the card would like
 * to sit relative to that ring — the adapter in `main.js` overrides it when
 * there is no room, so this is a preference and not a promise. `action`, on the
 * last stop only, is the button that does the thing the card is describing.
 */
export const STOPS = Object.freeze(
  [
    {
      id: "pond",
      target: "world",
      icon: "🌊",
      title: "This is the pond",
      line:
        "Every arrowhead is one animal, swimming for itself. Nobody programmed them to " +
        "look for food — each one is steered by a tiny brain it was born with, and the " +
        "ones that find enough to eat are the ones that leave young behind.",
      prefer: "below",
    },
    {
      id: "now",
      target: "headline-text",
      icon: "📰",
      title: "What is happening right now",
      line:
        "One line, rewritten as the water changes. It is the pond's news: who is thriving, " +
        "who is going hungry, what has just arrived. If you read nothing else here, read this.",
      prefer: "below",
    },
    {
      id: "read",
      target: "key-list",
      icon: "🔍",
      title: "How to read the water",
      line:
        // The third clause said *big means it has been finding food for a long
        // time* until v1.130, copied from the placard's own row, which was
        // wrong: a body is the size its genes were dealt at birth and never
        // changes. Two surfaces built to teach a newcomer how to read the
        // picture, both teaching the same false thing, is the reason this
        // sentence lives beside the one it paraphrases.
        "Colour is family, so relatives match. Bright means well fed and faint means hungry. " +
        "Big means it was born big — size is inherited here, not earned. This card names " +
        "every mark in the picture, and it grows and shrinks with the rules you switch on.",
      prefer: "above",
    },
    {
      id: "meet",
      target: "btn-meet",
      icon: "👋",
      title: "Pick somebody to follow",
      line:
        "Press this and the pond hands you one animal with a name. Watch it feed, raise young, " +
        "and — because everything here does — eventually die. It gets a proper send-off when it does.",
      prefer: "below",
    },
    {
      id: "worlds",
      target: "scenario-chips",
      icon: "🌍",
      title: "Other worlds to try",
      line:
        "An island. A drought. A pond with hunters in it. Every world here runs on the same handful " +
        "of rules — change one, press play, and see what the animals turn into.",
      prefer: "below",
    },
    {
      // The finale, and until v1.143 it was a board of drift figures under the
      // heading *proof that it is evolving*. The board is honest and it is the
      // wrong last word: it asks a visitor who has been here forty seconds to
      // read percentages, when the card this button brings back says the same
      // things in sentences — how much bigger they got, what they eat now — and
      // says them about a stretch the visitor watched go past. A guide should
      // end by handing somebody the thing, not the readout of the thing.
      id: "skip",
      target: "btn-skip",
      icon: "⏩",
      title: "Watch a year go by",
      line:
        "Nobody has three hours to spare, and this is a slow business — so press this and the pond " +
        "runs a whole year in about three seconds. Hundreds born, hundreds gone, ten new " +
        "generations, and then a card telling you exactly what changed while you were away.",
      prefer: "below",
      action: Object.freeze({ act: "skip", label: "⏩ Try it" }),
    },
  ].map(Object.freeze),
);

/** How many stops the tour has. One place, so the card's "3 of 6" cannot drift. */
export const TOUR_LENGTH = STOPS.length;

/**
 * Move `index` by `delta`, staying inside the tour.
 *
 * Clamping rather than wrapping, deliberately: a tour is a line with a
 * beginning and an end, and a Back button on the first stop that silently
 * teleports you to the last one is a bug that reads as a haunting. The buttons
 * are disabled at the ends by `main.js`, so this is the second line of defence
 * for the keyboard, which cannot be disabled.
 */
export function stepIndex(index, delta, length = TOUR_LENGTH) {
  const n = Math.max(1, Math.floor(length));
  const at = Number.isFinite(index) ? Math.floor(index) : 0;
  return Math.min(n - 1, Math.max(0, at + Math.floor(delta || 0)));
}

/** The stop at `index`, clamped — never `undefined`, whatever the caller did. */
export function stopAt(index) {
  return STOPS[stepIndex(index, 0)];
}

/**
 * The button this stop offers, or `null` if it offers none.
 *
 * `null` rather than `undefined` so the adapter's `if` reads as a question
 * about the stop rather than about the shape of the object, and so a stop that
 * was written without an `action` and one that was written with an empty one
 * are the same thing to everybody downstream.
 */
export function stopAction(index) {
  const action = stopAt(index).action;
  return action && action.act && action.label ? action : null;
}

/** "3 of 6" — the one thing on the card that says how long this is going to take. */
export function stopCounter(index, length = TOUR_LENGTH) {
  return `${stepIndex(index, 0, length) + 1} of ${Math.max(1, Math.floor(length))}`;
}

/** The label on the forward button: a tour that is about to end should say so. */
export function nextLabel(index, length = TOUR_LENGTH) {
  return stepIndex(index, 0, length) === Math.max(1, Math.floor(length)) - 1 ? "Done" : "Next →";
}

/**
 * Has this browser been shown around before?
 *
 * Takes the storage rather than reaching for `localStorage`, which is what makes
 * it testable — and, less obviously, what makes it safe. Reading
 * `window.localStorage` throws outright in a browser set to block site data, and
 * a guide that cannot remember whether it has run is not a reason to take the
 * pond down with it. Both halves swallow their errors and fall back to the
 * quieter answer: an unreachable store means the tour does not open itself.
 */
export function hasSeenTour(storage) {
  try {
    return storage ? storage.getItem(TOUR_SEEN_KEY) !== null : true;
  } catch {
    return true;
  }
}

/** Remember that it has run. Never throws — see `hasSeenTour`. */
export function markTourSeen(storage) {
  try {
    if (storage) storage.setItem(TOUR_SEEN_KEY, "1");
  } catch {
    /* a browser that will not store this is a browser that gets the tour twice */
  }
}

/**
 * Where the card sits, given the ring it belongs to and the window it has to
 * live in — the one piece of the layout that is arithmetic rather than CSS, and
 * therefore the one piece a test can hold.
 *
 * All four numbers are page pixels in the viewport's own frame (the overlay is
 * fixed, so there is no scroll offset to carry). Three rules, and the third one
 * was bought with a browser walk (v1.159):
 *
 *   **Below unless there is no below.** The card goes where the stop asked for
 *   it, and flips only when the side it asked for cannot hold it. A card that
 *   flips on preference alone jumps about as a visitor steps through.
 *
 *   **It never leaves the window.** Horizontal placement is centred on the ring
 *   and then clamped to the margins, so a ring at the very edge of a narrow
 *   screen — the scenario chips, on a 320 px phone — still gets a fully visible
 *   card. v1.115's rule: the axis a thumb misses in is the one nobody measured.
 *
 *   **A card that cannot get out of the way covers as little as it can.** Some
 *   targets are taller than the room around them, and the pond is the worst of
 *   them: at 1280 × 900 the ring around the water is 627 px tall with 135 above
 *   it and 138 below, and a 223 px card fits in neither. v1.129 shipped that
 *   case as *sit under the ring anyway and let the clamp pull it back*, which
 *   put the opening sentence of the guide — **"This is the pond. Every
 *   arrowhead is one animal"** — squarely on top of the arrowheads, on **six of
 *   six desktop windows measured** (1280 × 800 through 1920 × 1080). So when
 *   neither side fits, this now costs out four clamped placements — right of
 *   the ring, left of it, and the two vertical ones — and takes the one that
 *   covers the least of it. The water is 906 px wide inside a 1280 px window,
 *   which leaves 357 px of margin on the right: not enough for the 14 px gap,
 *   and plenty for the card itself. A 7 px gap and no overlap beats a 14 px gap
 *   and a third of the pond.
 *
 *   The rule is deliberately a *measurement* rather than a preference for
 *   beside-ness. On a 390 px phone the third stop rings a placard 438 px tall
 *   and 324 px wide, and there is no beside: a card pushed to either flank
 *   would cover 70,691 px² of it, against 9,720 px² for the vertical placement
 *   it already had. Costing them out picks the phone's answer and the desktop's
 *   answer with the same three lines of arithmetic, which is why there is no
 *   width in this function and no breakpoint anywhere near it.
 */
export function cardPlacement(ring, view, card, prefer = "below", gap = 14, margin = 10) {
  const clampLeft = (x) => Math.min(Math.max(margin, x), Math.max(margin, view.width - card.width - margin));
  const clampTop = (y) => Math.min(Math.max(margin, y), Math.max(margin, view.height - card.height - margin));

  const below = ring.top + ring.height + gap;
  const above = ring.top - gap - card.height;
  const fitsBelow = below + card.height <= view.height - margin;
  const fitsAbove = above >= margin;
  const centred = clampLeft(ring.left + ring.width / 2 - card.width / 2);

  let side = prefer === "above" ? "above" : "below";
  if (side === "below" && !fitsBelow && fitsAbove) side = "above";
  else if (side === "above" && !fitsAbove && fitsBelow) side = "below";
  if (fitsBelow || fitsAbove) {
    return { left: centred, top: clampTop(side === "above" ? above : below), side };
  }

  // Neither side fits. Every candidate here is clamped, so all four are fully
  // inside the window and that question is settled — the only thing left to
  // choose on is how much of the ring each one hides. The two flanks come first
  // so a tie at zero goes to a card beside the thing rather than on it, and the
  // stop's own preference orders the two vertical fallbacks behind them, so a
  // tie there still lands where the stop asked.
  const other = side === "above" ? "below" : "above";
  const middle = clampTop(ring.top + ring.height / 2 - card.height / 2);
  const candidates = [
    { side: "right", left: clampLeft(ring.left + ring.width + gap), top: middle },
    { side: "left", left: clampLeft(ring.left - gap - card.width), top: middle },
    { side, left: centred, top: clampTop(side === "above" ? above : below) },
    { side: other, left: centred, top: clampTop(other === "above" ? above : below) },
  ];
  let best = candidates[0];
  let least = Infinity;
  for (const at of candidates) {
    const cost = overlapArea(ring, { ...at, width: card.width, height: card.height });
    if (cost < least) {
      least = cost;
      best = at;
    }
  }
  return best;
}

/**
 * How many square pixels of `ring` the placed `card` hides. Zero when they miss
 * each other on either axis, which is the answer `cardPlacement` is hunting for.
 */
function overlapArea(ring, card) {
  const w = Math.min(ring.left + ring.width, card.left + card.width) - Math.max(ring.left, card.left);
  const h = Math.min(ring.top + ring.height, card.top + card.height) - Math.max(ring.top, card.top);
  return w > 0 && h > 0 ? w * h : 0;
}
