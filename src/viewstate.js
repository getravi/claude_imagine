// viewstate.js — the observer's state, and what a new pond invalidates.
//
// v1.98 fixed one panel that kept the previous world's numbers after a reseed
// and left the sweep behind: *which other surfaces are written conditionally,
// and therefore survive a world they no longer describe?* This is that sweep,
// and its answer is not the one the note expected. The early returns were not
// the seam. `main.js` held **nineteen** pieces of module state describing one
// pond when this sweep ran — `WORLD_SCOPED` is the live count and it grows
// whenever a surface does — and thirteen of them were keyed on the very string
// they write. A memo of that shape cannot outlive its world, because the frame
// after the swap recomputes the key from the new pond, finds it different, and
// writes.
// Self-correcting by construction, with nobody having arranged it.
//
// What the sweep found is the six that are keyed on nothing, and one that is
// keyed on something worse than nothing:
//
//   1. **Four of the six already had an owner, and it is the right one.**
//      `updateNarration` keys its state on the world *object* — "a new object
//      cannot find the old one's state", the v1.23 cache rule stated exactly —
//      and resets four fields whenever `world` is replaced. It has been correct
//      since v1.31 and it has never been generalised. Everything else in the
//      file was hand-reset instead, in **three** copies of a list, by the three
//      functions that build a `World`: `launchScenario` and `resetWorld` name
//      four things each, and `loadWorld` names **one**. A hand-typed list in
//      three places is a list that disagrees with itself, and this one did.
//   2. **A key can collide across worlds when it contains an id a new pond
//      re-issues.** `legendSig` is `living species ids | highlight`, and a new
//      pond deals species #1, #2, #3 exactly as the old one did — so the Tree
//      of Life's legend can match its own signature across a reseed and take
//      the cheap path, which patches counts into `chip-n-<id>` elements that
//      belong to the *previous* world's species. New numbers, old colours, old
//      hatches. That is why two of the three paths reset it by hand, and why
//      the third was wrong to skip it. Driven in a browser, `loadWorld` is the
//      visitor-facing half: spotlight a species, load a saved pond, and a
//      lineage of the *loaded* world lights up instead — an id the visitor
//      never pressed — with `✕ Clear highlight` still offering to undo a
//      choice made in a pond that is gone.
//   3. **The claim I would have shipped died in the browser, and it is the best
//      thing here.** `renderer.camera.target` is a reference into the world, no
//      list named it, and the reasoning was clean: follow a creature, press a
//      scenario chip, and the camera goes on following a body that is no longer
//      stepped, never moves and — since `Camera.update()` releases only on
//      death — never dies. Every word of that is true and the bug does not
//      happen, because `renderer.setConfig()` calls `camera.reset()` and all
//      three paths call `setConfig`. So the one piece of state that no owner
//      claimed is owned by a *fourth* function, whose name is about the config.
//      Measured, not argued: after a scenario chip the badge is hidden and the
//      Follow box has unticked itself. `adopt()` releases the target anyway —
//      a no-op today, and the difference between correct and correct-on-purpose
//      the day a path forgets `setConfig`.
//
// So this module is one owner for all of them, keyed the way the narrator was
// already keying its four. `adopt()` is the only reset there is, it runs at the
// top of the frame rather than in three event handlers, and the three lists in
// `main.js` are gone rather than reconciled — a list that cannot be typed
// cannot disagree with another copy of itself.
//
// Determinism: nothing here reads or writes the simulation, and nothing draws a
// random number. A pond whose observer resets is bit-for-bit a pond nobody is
// watching.

/**
 * Every piece of `main.js`'s module state that describes one pond, with the
 * value it holds before that pond has been drawn.
 *
 * The roster is the point: a cache that is not in here is a cache with no
 * owner, and `test/viewstate.test.js` reads the shipped `main.js` to check that
 * none of these names has grown a private declaration of its own again.
 */
const FRESH = Object.freeze({
  // The spoken pond (v1.31). Four of these were already reset on the world's
  // identity rather than by hand, and they are the only ones in the file that
  // were; `pondLabel` is content-keyed and rides `describeIn`'s throttle.
  spokenLine: null,
  pendingSay: "",
  pendingAct: null,
  pondLabel: "",
  describeIn: 0,
  // The chronicle feed. `chronLines` is the rows as they were last painted —
  // world-scoped like the key beside it, because the panel is now patched
  // against its own last state rather than rewritten, and a new pond inheriting
  // the old one's rows would try to reconcile a story against a different
  // story's lines.
  lastChronKey: "",
  chronLines: null,
  // The headline above the water (v1.117). World-scoped for the plainest of the
  // reasons on this list: it carries the tick it was chosen on, and a new pond
  // starts its clock at zero — an inherited `since` would hold the old world's
  // sentence on screen for the first six hundred ticks of the new one.
  // `nextHeadline` also treats a tick before `since` as a reset, so the two
  // agree even if this line is ever forgotten.
  headlineShown: null,
  headlineIn: 0,
  // The view badge and the ruler. Both are content-keyed and both name
  // something a new pond re-issues — the badge a creature id, the ruler
  // nothing — so the badge is the one that needed this and the ruler rides
  // along rather than being argued about a second time.
  viewSig: "",
  rulerSig: "",
  // The Tree of Life. `legendSig` is the collision above; `mullerMarks` holds
  // DOM elements owned by `mullerAxisKey`, so the two reset together or the
  // key describes a row of spans that is no longer there.
  legendSig: "",
  mullerAxisKey: "",
  mullerMarks: [],
  mullerLabel: "",
  // What the lineages are called (v1.116), and how many the map was built from.
  // World-scoped for the reason `legendSig` is: the names are a pure function of
  // one tree, and two ponds have two trees. Held as `null` rather than an empty
  // `Map` because `reset` hands out the roster's own value for anything that is
  // not an array, and a `Map` shared between two ponds is precisely the bug
  // `mullerMarks` is spelled as an array to avoid. The count is the cache key:
  // a species is appended, never renumbered, so a name once given cannot move.
  lineageNames: null,
  lineageNameCount: -1,
  // The chart stack: the population chart, the death strip, the power strip and
  // the one x-axis all three share.
  chartXKey: "",
  chartXMarks: [],
  chartAxisKey: "",
  chartLabel: "",
  deathsLabel: "",
  powerLabel: "",
  // The body-size figure (v1.104), which shares none of that axis: its x is a
  // body radius, so its marks move only when a permalink moves the two
  // constants they are derived from, and there is no element list beside the
  // key because nothing about a mark's *position* changes without its value.
  sizeAxisKey: "",
  sizeLabel: "",
  // The inspector — and, since v1.121, the life it writes when its subject dies
  // (`obituary.js`). World-scoped for the plainest of reasons: a card about an
  // animal is a card about *that pond's* animal, and a new pond has never met
  // them.
  inspKey: "",
  obitCard: null,
  // The key to the water (v1.122). Keyed on the set of marks the pond can
  // draw, which is a property of the *config* rather than of the world — so it
  // is here for the reason `rulerSig` is: it is content-keyed and therefore
  // self-correcting either way, and a pond arrives with its rules, so filing it
  // with the pond is the filing that cannot be wrong.
  keySig: "",
  // The cast list (v1.123). Keyed on the ranks and ids on the board, so it is
  // here for `legendSig`'s reason rather than `keySig`'s: a new pond re-issues
  // creature numbers from where the old one left off within a page load, but a
  // *reload* restarts the counter, and a signature naming id 41 in two ponds is
  // exactly the collision that keeps a dead animal's row on screen.
  castSig: "",
  // The book of records (v1.124). Keyed on the board's own sentences, which is
  // the strongest key any surface here uses and the only one that has to be:
  // a record's line changes when its holder dies while the record itself holds
  // still, so a key made of what is *recorded* would leave "still in the water"
  // under a name the pond has buried. Here for `castSig`'s reason as well — the
  // sentences carry a creature's given name, and a name is an id.
  recordSig: "",
  // How they have changed (v1.128), and the thing it is measured against. This
  // is the first entry on the roster that is not a cache at all: `founding` is
  // the pond's opening line — the mean body of the animals it was handed, and
  // their ids — taken on the frame this state adopts the world and never again.
  // World-scoped is not a nicety here, it is the whole correctness argument: an
  // opening line inherited across a reset would have the new pond's animals
  // measured against the old pond's founders, which is a board that is wrong in
  // a way no visitor could catch. Held as `null` rather than an empty object,
  // for `lineageNames`' reason and for one more of its own: `null` is also what
  // a *loaded* world leaves here, and the board has a sentence for it.
  founding: null,
  evolvedSig: "",
  // The family portrait over those rows (v1.130). A second key on the same two
  // means, because the board rounds them to whole percents and the picture does
  // not: the figure has to redraw for a body that has moved a hundredth of a
  // pixel, and the board must not rebuild five sentences for it. World-scoped
  // for `evolvedSig`'s reason and with the same safety net — it is a signature
  // over what is *drawn*, so a pond that inherited it would find it wrong on
  // the first frame and write.
  portraitSig: "",
  // The ladder (v1.131). World-scoped, and this one could not be anything else:
  // the panel's rows are latched *in the world*, so a reset hands the page a
  // pond whose six ticks are all −1 again. A signature inherited across that
  // reset would leave six ticked rungs on screen over a pond that has done
  // nothing — the same failure as `castSig`'s, one panel down and far more
  // visible, because a stale row here is a claim about history rather than
  // about an animal.
  milestoneSig: "",
  // The banner that ladder now raises (v1.132), in two halves. `cheerWatch` is
  // what the visitor has already been told about *this* pond and `cheerQueue`
  // is what it has not read yet. World-scoped for a reason stronger than the
  // ladder's own: a watch inherited across a reset would hold six rungs as
  // already-announced and the new pond would climb its whole ladder in silence,
  // and a queue inherited across one would congratulate a pond on something the
  // last one did. Held as `null` rather than an instance for `lineageNames`'
  // reason — one watch shared between two ponds is the bug the roster's fresh
  // arrays exist to prevent — and built on the first frame a pond is looked at,
  // which is also where it learns whether the pond arrived newborn or restored.
  cheerWatch: null,
  cheerQueue: [],
  // The fast-forward in flight (v1.142), in three parts: how many steps it
  // still owes, how far it was going, and the pond it is measuring against.
  // `skipFrom` is `founding`'s argument with a shorter horizon — a snapshot of
  // animals that are about to change, taken by a watcher — and it is the one
  // field here that would be *dangerous* to inherit rather than merely stale:
  // a card built from the old pond's population against the new pond's would
  // announce a crash that never happened. The two counters are world-scoped
  // with it because a skip that outlived its pond would go on stepping a world
  // nobody asked it to step.
  // …and a fourth since v1.145: the crowd counted through the stretch, which is
  // what the card's headline and its little line drawing are made of. It rides
  // with `skipFrom` for `skipFrom`'s own reason and one more of its own — a
  // count carried over from another pond would draw that pond's shape under
  // this pond's name, which is worse than stale, it is a picture of somewhere
  // else.
  skipLeft: 0,
  skipTotal: 0,
  skipFrom: null,
  skipTrack: null,
  // The handful of food somebody dropped in the water (v1.147), held until the
  // last of it is eaten and the page says so. World-scoped because it is a list
  // of *pellet objects*, and a pellet belongs to one pond: after a reset those
  // ten are in no world, so nothing can ever eat them and the receipt would
  // never come — the page would sit watching a handful that no longer exists
  // for as long as the tab was open. It also carries the tick it went in on,
  // and a new pond's clock starts again at zero.
  handful: null,
});

/** The names `ViewState` owns, in the order they are declared. */
export const WORLD_SCOPED = Object.freeze(Object.keys(FRESH));

/**
 * The module state in `main.js` that a new world does **not** invalidate, and
 * the reason for each.
 *
 * This half exists because of the playbook's lesson about headings: a list that
 * sorts things into "checked" and "does not need checking" is only as good as
 * the bucket nobody reads, so the second bucket is written down with reasons
 * and swept against the source too. Between them the two lists have to account
 * for every top-level binding in the file — a new one belongs to a pond or it
 * does not, and saying which is the whole of the work.
 */
export const PAGE_SCOPED = Object.freeze({
  config: "the subject, not a view of it — replaced alongside the world",
  world: "the subject itself; `adopt` is keyed on this object's identity",
  renderer: "one canvas, built once at boot and re-pointed at each new config",
  running: "a visitor's play/pause choice, which a new pond does not overrule",
  speed: "a visitor's speed choice, likewise",
  lastFrame: "wall-clock, for the frame delta",
  fpsSmooth: "wall-clock, a rolling mean of the browser's frame rate",
  miniCtx: "the little map's drawing context, sized once against the page's pixel ratio",
  mullerCtx: "the Tree of Life's drawing context, sized once against its column",
  chartCtx: "the population chart's drawing context, held so it is fetched once",
  deathsCtx: "the death strip's drawing context, which also caches the canvas's own size",
  powerCtx: "the power strip's drawing context, likewise, and cleared every frame",
  sizeCtx: "the body-size figure's drawing context, likewise, and caching its canvas's size",
  chartScope: "a visitor's choice of window, which outlives the run it was made in",
  flashTimer: "a `setTimeout` handle for the toast, measured in seconds of real time",
  cheerFree:
    "wall-clock, the moment the banner over the water is free for the next celebration",
  cheerGlow: "a `setTimeout` handle for the ladder's glow, likewise real time rather than pond time",
  pondNamed:
    "what the nameplate currently reads — a fact about the page, and deliberately not " +
    "reset with the world: it is how `syncPondName` tells arriving somewhere new from " +
    "rebuilding where you already are, and a pond adopted afresh would say hello to itself",
  handFeeding:
    "whether the water is armed to be fed by hand (v1.147) — a visitor's choice of what a " +
    "press on the pond means, and a new pond does not overrule it any more than it " +
    "overrules pause or speed",
  handHinted:
    "whether the one-line explanation of that mode has been shown yet — once per visit " +
    "rather than once per pond, because it explains the button and not the water",
  tourAt: "which stop of the guide is showing — a fact about the reader, not about the pond",
  tourReturn: "the element focus came from when the guide opened, to put it back on the way out",
  postcardReturn: "the same, for the postcard — where focus was when `🔗 Share` opened the card",
  postcardOnCard:
    "the text currently printed on the postcard, so `📋 Copy again` copies what a visitor " +
    "can see rather than recomposing a card off a pond that has moved on since they read it",
  skipReturn:
    "the same again, for the fast-forward's card — where focus was when `⏩ Skip ahead` was " +
    "pressed, so closing the card hands the keyboard back to the button that opened it",
  movie:
    "a recording in flight (v1.144) — the frames captured so far, the colour table built " +
    "from them and the bytes they have become. Deliberately not on the roster and " +
    "deliberately not reset with it: it is a machine rather than a cache, `adoptWorld` " +
    "abandons it outright because a file half made of one pond and half of another is not " +
    "a recording of anywhere, and forty megabytes of pixels should be dropped by the code " +
    "that knows they are there rather than nulled by a loop over field names",
});

/**
 * The observer's state for one pond.
 *
 * Every field named in `WORLD_SCOPED` is a property of this object, so the
 * adapter in `main.js` reads and writes `view.chartLabel` where it used to
 * declare a private `let`. That is the whole mechanism: a cache that lives on
 * an object with a `reset()` is a cache the reset cannot miss.
 */
export class ViewState {
  constructor() {
    /** The pond this state describes, by identity — never by seed or tick. */
    this.world = null;
    this.reset();
  }

  /** Back to the values held before any pond had been drawn. */
  reset() {
    for (const key of WORLD_SCOPED) {
      const fresh = FRESH[key];
      // A fresh array per reset, never the roster's own: two ponds sharing one
      // array of DOM elements is the bug this class exists to make impossible.
      this[key] = Array.isArray(fresh) ? [] : fresh;
    }
  }

  /**
   * Take up a world, resetting everything that described the last one.
   *
   * Keyed on the object rather than on a seed or a tick, because a reset, a
   * scenario and a load all build a new `World` and two of the three can leave
   * the seed alone — and because an object key is unrepresentable-beats-guarded
   * (v1.23): a new object cannot find an old one's entry.
   *
   * The renderer's own three are here rather than in the roster because they
   * live on the renderer: a selection, a species highlight and the camera's
   * target are all references *into* the world, and a reference into a pond
   * that no longer exists is the longest-lived staleness this project has
   * measured. The trail is cleared for the same reason, which makes `trail.js`'s
   * claim that "resetting the world ends the path" true by construction rather
   * than by a two-step argument about the next frame's `record(null)`.
   *
   * @param {object} world the pond as of this frame
   * @param {{selected: *, highlightSpeciesId: *, camera: {setTarget: (c: *) => void},
   *          trail?: {clear: () => void} | null}} renderer the view onto it
   * @returns {boolean} true when this is a pond the state had not seen
   */
  adopt(world, renderer) {
    if (world === this.world) return false;
    this.world = world;
    this.reset();
    renderer.selected = null;
    renderer.highlightSpeciesId = null;
    renderer.camera.setTarget(null);
    if (renderer.trail) renderer.trail.clear();
    return true;
  }
}
