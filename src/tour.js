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
//      in it, here is how to read it, here is one animal to care about, here is
//      the proof it is evolving, now go change the world.* The last stop is a
//      call to action, because the visitor most likely to stay is the one who
//      pressed something.
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
 * The stops, in the order they are shown.
 *
 * `target` is the `id` of the element the ring is drawn around; it is checked
 * against the shipped page by the tests. `prefer` is where the card would like
 * to sit relative to that ring — the adapter in `main.js` overrides it when
 * there is no room, so this is a preference and not a promise.
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
      id: "changed",
      target: "evolved-list",
      icon: "🧬",
      title: "Proof that it is evolving",
      line:
        "Not one of the animals this pond started with is still alive; everything you can see is " +
        "a descendant. This board says in plain numbers how far their bodies, their appetites and " +
        "their diet have drifted from the ones at the beginning.",
      prefer: "above",
    },
    {
      id: "worlds",
      target: "scenario-chips",
      icon: "🌍",
      title: "Now go change the world",
      line:
        "An island. A drought. A pond with hunters in it. Every world here runs on the same handful " +
        "of rules — change one, press play, and see what the animals turn into. That is the whole game.",
      prefer: "below",
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
 * fixed, so there is no scroll offset to carry). Two rules, and the second is
 * the one that matters on a phone:
 *
 *   **Below unless there is no below.** The card goes where the stop asked for
 *   it, and flips only when the side it asked for cannot hold it. A card that
 *   flips on preference alone jumps about as a visitor steps through.
 *
 *   **It never leaves the window.** Horizontal placement is centred on the ring
 *   and then clamped to the margins, so a ring at the very edge of a narrow
 *   screen — the scenario chips, on a 320 px phone — still gets a fully visible
 *   card. v1.115's rule: the axis a thumb misses in is the one nobody measured.
 */
export function cardPlacement(ring, view, card, prefer = "below", gap = 14, margin = 10) {
  const below = ring.top + ring.height + gap;
  const above = ring.top - gap - card.height;
  const fitsBelow = below + card.height <= view.height - margin;
  const fitsAbove = above >= margin;
  let side = prefer === "above" ? "above" : "below";
  if (side === "below" && !fitsBelow && fitsAbove) side = "above";
  else if (side === "above" && !fitsAbove && fitsBelow) side = "below";
  // Neither side fits: sit under the ring anyway and let the clamp below pull
  // the card back into the window. Something readable and slightly overlapping
  // beats something correct and off-screen.
  const rawTop = side === "above" ? above : below;
  const top = Math.min(Math.max(margin, rawTop), Math.max(margin, view.height - card.height - margin));
  const centred = ring.left + ring.width / 2 - card.width / 2;
  const left = Math.min(Math.max(margin, centred), Math.max(margin, view.width - card.width - margin));
  return { left, top, side };
}
