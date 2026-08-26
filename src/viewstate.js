// viewstate.js — the observer's state, and what a new pond invalidates.
//
// v1.98 fixed one panel that kept the previous world's numbers after a reseed
// and left the sweep behind: *which other surfaces are written conditionally,
// and therefore survive a world they no longer describe?* This is that sweep,
// and its answer is not the one the note expected. The early returns were not
// the seam. `main.js` holds **nineteen** pieces of module state that describe
// one pond, and thirteen of them are keyed on the very string they write — a
// memo of that shape cannot outlive its world, because the frame after the
// swap recomputes the key from the new pond, finds it different, and writes.
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
// So this module is one owner for all nineteen, keyed the way the narrator was
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
  // The chronicle feed.
  lastChronKey: "",
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
  // The inspector.
  inspKey: "",
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
