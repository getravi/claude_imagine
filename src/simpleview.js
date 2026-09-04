// simpleview.js — the page with the instruments put away.
//
// `tour.js` opens with the best description of this page anybody here has
// written: *a screen holding a canvas of moving darts, six panels, three
// figures, a column of switches and a plot of species over time — all of it
// correct, all of it arriving at once, and none of it ranked.* Its answer, in
// v1.129, was to rank it — six stops, one at a time, a ring around each.
//
// That is a good answer to the wrong half of the sentence. A guide ranks a
// crowded page; it does not uncrowd it. The visitor who never presses
// `🧭 Show me around` — which is most of them, because a first-time visitor
// does not know they need a guide until they have already decided to leave —
// still meets all of it at once. Twenty-five releases have each added one more
// true thing to the same screen, and every one of them was the right call in
// isolation.
//
// So: a switch in the top bar, and a page that starts on the quiet side of it.
//
//   **Simple** is the pond, the sentence over it, the verb under it, the key to
//   the water, the ladder, the stand-outs, how they have changed, the records,
//   the Chronicle, what they die of, and the eleven buttons a person presses.
//   **Everything** is that plus the instruments: thirty-one dials, five
//   figures, a fact grid of thirty-six fields, and the Tree of Life.
//
// Four rules, and the last one is the one that took the thinking.
//
//  1. **The instruments are hidden, never removed.** `main.js` writes to those
//     nodes every frame whether they are on screen or not, so the switch costs
//     one class on `<body>` and the charts a visitor asks for after four
//     minutes already have four minutes of history in them. A view that built
//     its panels on demand would hand them an empty plot and call it the
//     instruments.
//  2. **Nothing a visitor is told to press may be behind the switch.** The six
//     stops of the tour, the shortcuts on the hint lines, the ladder, the cast
//     board — every one of them names something, and a page that points at a
//     thing it is hiding is worse than a page that never mentioned it.
//     `test/simpleview.test.js` holds this against the shipped markup for the
//     tour, which is the surface that points hardest.
//  3. **The switch says what is behind it.** A control labelled only
//     `Everything` asks a stranger to press an unmarked door. The counts on it
//     are read off the page at runtime rather than typed here — `INSTRUMENT`
//     names the surfaces, `main.js` counts what is inside them, and this module
//     words the result — so a thirty-second world rule cannot make the label a
//     lie the way a hand-typed number would.
//  4. **The preference belongs to the reader, not to the pond.** It is
//     remembered in `localStorage` and it is deliberately *not* in the
//     permalink: a link carries a world, and `#seed=1837465` arriving with
//     somebody else's idea of how much apparatus to show would be a stranger
//     rearranging your furniture. Share a pond and it opens the way *you*
//     prefer. That is also why nothing here touches the config: a view is not a
//     rule, and two visitors reading the same seed at different densities are
//     still watching the same pond, tick for tick.
//
// The one thing a switch like this can get wrong, and how this one avoids it:
// a shortcut whose control it hides. `V` (vision cones), `N` (a new seed),
// `+`/`−`/`0` (zoom) all keep working in Simple, because what they *do* is in
// the water and a person can see it happen. `H` cycles the chart between the
// recent window and the whole run, and in Simple there is no chart — so the
// fragment of the hint line that offers it is itself behind the switch. The
// rule that separates them: **a shortcut may outlive its control, but not its
// effect.**
//
// PURE OBSERVER. No DOM, no simulation state, no random numbers — words, a
// list, and two calls on a storage object that are wrapped the way `tour.js`
// wraps its own (a browser set to block site data throws on the *read*, and a
// front door that cannot remember a preference is not a reason to take the pond
// down with it).

/**
 * Where the browser remembers which side of the switch this visitor chose.
 *
 * Separate from `vivarium.tour.seen` on purpose, even though both are answers
 * to "has this person been here before": the tour's key records something that
 * *happened*, and can only be set. This one records something that was
 * *chosen*, and has to be able to say "everything" as loudly as it says
 * "simple" — a single "has chosen" flag would read a returning expert's blank
 * slot as a preference for the quiet page every time.
 */
export const SIMPLE_KEY = "vivarium.view.simple";

/** What `<body>` wears while the instruments are away; `style.css` does the rest. */
export const SIMPLE_CLASS = "simple";

/** The attribute that marks a surface as an instrument, in `app/index.html`. */
export const EXPERT_ATTR = "data-expert";

/**
 * The surfaces behind the switch, keyed by the value of their `data-expert`.
 *
 * The value is the noun a person would use, because it is what the switch's
 * tooltip is assembled from. The keys are checked against the shipped page by
 * `test/simpleview.test.js`: a surface named here that the markup does not
 * carry is a switch that hides nothing, and a `data-expert` in the markup that
 * is not named here is a surface nobody decided about.
 */
export const INSTRUMENT = Object.freeze({
  rules: "the world's rules and their dials",
  numbers: "the rest of the numbers",
  energy: "the energy books",
  charts: "the population, deaths and power figures",
  sizes: "the spread of body sizes",
  inspector: "the fact grid for one animal",
  tree: "the Tree of Life",
  "hint-charts": "the shortcut for a chart that is not there",
});

/** The order the tooltip lists them in — the order they appear down the page. */
export const INSTRUMENT_ORDER = Object.freeze([
  "rules",
  "numbers",
  "energy",
  "charts",
  "sizes",
  "inspector",
  "tree",
  "hint-charts",
]);

/**
 * Which side of the switch a visitor starts on.
 *
 * A visitor this browser has never stored anything for gets **Simple**, which
 * is the whole point of the release: the page's front is a pond, and the
 * apparatus is something you go and get. Anyone who has pressed the switch gets
 * back what they pressed, in both directions.
 *
 * Never throws. A browser that blocks site data throws on the property access
 * itself, and the fallback is the newcomer's answer rather than the expert's —
 * the reader this cannot ask is much more likely to be arriving than returning.
 *
 * @param {{getItem?: (k: string) => (string|null)}|null} storage
 */
export function prefersSimple(storage) {
  try {
    const seen = storage ? storage.getItem(SIMPLE_KEY) : null;
    return seen === null ? true : seen === "1";
  } catch {
    return true;
  }
}

/** Remember which side was chosen. Never throws — see `prefersSimple`. */
export function rememberSimple(storage, simple) {
  try {
    if (storage) storage.setItem(SIMPLE_KEY, simple ? "1" : "0");
  } catch {
    /* a browser that will not store this is a browser that starts simple every time */
  }
}

/**
 * The word on the switch: what pressing it will do, never what state you are in.
 *
 * The distinction a toggle gets wrong more often than any other control on a
 * page, and the one that decided this control's markup: a button whose label
 * changes must not also carry `aria-pressed`. They are two ways of saying the
 * same thing, and saying both says `🔬 Everything, pressed` — which of the two
 * readings of that is a listener supposed to take? The label carries the
 * promise. The page carries the state.
 */
export function switchLabel(simple) {
  return simple ? "🔬 Everything" : "🙂 Simple view";
}

/**
 * The small line under the word, which is the whole reason a stranger presses
 * it: a door marked with what is behind it.
 *
 * Both counts come from the page (see rule 3 in the header). Zero is a real
 * answer and gets a sentence rather than a "0" — a build in which the switch
 * hides nothing should say so, not advertise an empty room.
 *
 * @param {boolean} simple which side the page is on now
 * @param {{controls?: number, figures?: number}} tally what is behind the switch
 */
export function switchNote(simple, tally = {}) {
  if (!simple) return "just the pond and its story";
  const controls = Math.max(0, Math.floor(tally.controls || 0));
  const figures = Math.max(0, Math.floor(tally.figures || 0));
  const parts = [];
  if (controls) parts.push(`${controls} ${plural(controls, "dial", "dials")}`);
  if (figures) parts.push(`${figures} ${plural(figures, "figure", "figures")}`);
  return parts.length ? parts.join(" · ") : "nothing to show";
}

/**
 * The tooltip, which is the long form of the note: every surface by name.
 *
 * Assembled from `INSTRUMENT` rather than written out, so a surface added to
 * the switch appears here without anybody remembering to say so — the failure
 * `viewstate.js` names, where a hand-typed list in a second place disagrees
 * with the first.
 */
export function switchTitle(simple) {
  if (!simple) return "Put the instruments away and just watch the pond";
  const named = INSTRUMENT_ORDER.filter((k) => k !== "hint-charts").map((k) => INSTRUMENT[k]);
  return `Show the instruments: ${sentenceList(named)}`;
}

/** "a, b and c" — the Oxford-free join the rest of this project's prose uses. */
function sentenceList(items) {
  if (items.length <= 1) return items[0] || "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** One or many. */
function plural(n, one, many) {
  return n === 1 ? one : many;
}
