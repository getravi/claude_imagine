// rendershot.js — a headless recording of what `render.js` actually draws.
//
// `src/render.js` is the largest module in this project and, until now, the
// only substantial one with no test at all: it needs a canvas, and Node has no
// canvas. So its header comment — "rendering is entirely read-only — it never
// touches simulation state" — has been a claim nobody checked since v1.0, which
// is the v1.28 lesson (a comment is not a measurement) sitting in the biggest
// file here.
//
// A canvas is not needed to answer the questions worth asking of a renderer.
// What is needed is the *sequence of drawing commands*, and that is a hundred
// lines of stub: every method `render.js` calls, recording its name and its
// arguments instead of painting pixels. From that stream two things follow.
//
//  1. **Drawing can be shown to be read-only.** Take a state fingerprint, draw,
//     take another. Nothing else in this project has ever been able to.
//  2. **The picture gets a fingerprint of its own** — a fourth channel next to
//     the state, the trajectory and the observation, and the one that `levers.js`
//     needs to tell a *drawing* constant from a dead one. `foodRadius` sets the
//     size of a food mote and nothing else in the simulation (it set a
//     scavenger's reach too, until v1.40 gave that its own constant), so a sweep
//     watching only the pond calls it dead.
//
// **This hash is for comparisons inside one run, never for a golden constant.**
// v1.36 learned that an instrument too sensitive to be blind to representation
// is a note about its last re-recording rather than a test — and a render hash
// is *maximally* sensitive by design: it moves when a colour is nudged, when a
// mark grows a pixel, when anything is reordered. Those are all things a release
// is allowed to do. Comparing two configurations drawn by the same build is what
// it is for.

import { Renderer } from "./render.js";
import { Hash } from "./fingerprint.js";

/** FNV-1a over raw bytes — for pixel buffers, which are too big to mix one at a time. */
function byteHash(bytes) {
  let h = 0x811c9dc5 | 0;
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619) | 0;
  return h >>> 0;
}

/**
 * A 2D context that paints nothing and remembers everything: every method call
 * and every style assignment, in order, appended to a shared op log.
 *
 * Style properties are real accessors rather than plain fields because a colour
 * change *is* a change to the picture — this project has shipped three
 * invisible marks (v1.25, v1.26, v1.34) and an instrument that could not see a
 * restyled mark would be blind to exactly that family of bug.
 */
class RecordingContext {
  /**
   * @param {string} id which canvas this draws to, so offscreen work is
   *   distinguishable from the pond in one interleaved log
   * @param {Array} ops the shared log
   */
  constructor(id, ops) {
    this.id = id;
    this.ops = ops;
    this._gradients = 0;
    // `lineCap` and `lineJoin` joined the list in v1.84. They are the same kind
    // of thing as the five above — a property whose value changes the picture —
    // and `render.js` has been setting `lineJoin` since v1.48 where nothing
    // could see it, which is v1.50's warning about this module in its own
    // words: the recorder is a claim of equivalence like any other accelerator,
    // so sweep it when `render.js` learns a new call.
    // `font`, `textAlign` and `textBaseline` joined in v1.126, with `fillText`
    // and `measureText` below them: that release drew the first letters this
    // project has ever put on the water, and a recorder that could not see a
    // typeface would be blind to the whole feature — a name in the wrong size,
    // or laid out from the wrong baseline, is exactly the invisible-mark bug
    // this stub exists to catch.
    for (const prop of [
      "fillStyle",
      "strokeStyle",
      "lineWidth",
      "lineCap",
      "lineJoin",
      "globalAlpha",
      "globalCompositeOperation",
      "font",
      "textAlign",
      "textBaseline",
    ]) {
      let value = null;
      Object.defineProperty(this, prop, {
        get: () => value,
        set: (v) => {
          value = v;
          this.op("set:" + prop, v);
        },
      });
    }
  }

  /**
   * Record one operation. Anything that is not a primitive is recorded as its
   * string form — a gradient assigned to `fillStyle` is a live object, and a log
   * holding live objects is not comparable, serialisable or diffable, which are
   * the three things a recording is for.
   */
  op(name, ...args) {
    this.ops.push([this.id, name, ...args.map((a) => (a !== null && typeof a === "object" ? String(a) : a))]);
  }

  // --- Path & paint ---
  beginPath() { this.op("beginPath"); }
  closePath() { this.op("closePath"); }
  moveTo(x, y) { this.op("moveTo", x, y); }
  lineTo(x, y) { this.op("lineTo", x, y); }
  rect(x, y, w, h) { this.op("rect", x, y, w, h); }
  arc(x, y, r, a0, a1) { this.op("arc", x, y, r, a0, a1); }
  fill() { this.op("fill"); }
  stroke() { this.op("stroke"); }
  clip() { this.op("clip"); }
  fillRect(x, y, w, h) { this.op("fillRect", x, y, w, h); }
  // Added in v1.50, and its absence is the finding: `_drawBarriers` has called
  // this since v1.48, so pointing the recorder at a walled world threw rather
  // than recording. A stub built from the methods a renderer happened to use on
  // the day it was written goes stale the first time the renderer learns a new
  // one — and it fails loudly, which is the good case.
  strokeRect(x, y, w, h) { this.op("strokeRect", x, y, w, h); }
  clearRect(x, y, w, h) { this.op("clearRect", x, y, w, h); }
  setLineDash(d) { this.op("setLineDash", ...d); }

  // --- Type ---
  fillText(text, x, y) { this.op("fillText", text, x, y); }

  /**
   * A width, from the font size and the number of characters.
   *
   * There is no type engine here and there cannot be one, so this is an
   * estimate and says so: 0.55 em a character is about right for a humanist
   * sans at small sizes. What it buys is the only thing the suite needs — a
   * plate whose width grows with its text, so the layout arithmetic in
   * `render.js#_drawNameTags` runs and can be asserted about. A tag's exact
   * width on a real canvas is the browser's business.
   */
  measureText(text) {
    const px = Number((/(\d+(?:\.\d+)?)px/.exec(this.font || "") || [])[1]) || 10;
    return { width: String(text).length * px * 0.55 };
  }

  // --- State & transform ---
  save() { this.op("save"); }
  restore() { this.op("restore"); }
  translate(x, y) { this.op("translate", x, y); }
  rotate(a) { this.op("rotate", a); }
  setTransform(a, b, c, d, e, f) { this.op("setTransform", a, b, c, d, e, f); }

  /**
   * A gradient is a value, not a command, so it gets an identity: the stops are
   * logged as they are added and the object stringifies to its name, which is
   * what lands in the log when it is assigned to `fillStyle`.
   */
  createRadialGradient(x0, y0, r0, x1, y1, r1) {
    const name = `${this.id}:grad${++this._gradients}`;
    this.op("createRadialGradient", name, x0, y0, r0, x1, y1, r1);
    const ctx = this;
    return {
      addColorStop(offset, colour) { ctx.op("addColorStop", name, offset, colour); },
      toString() { return name; },
    };
  }

  createImageData(w, h) {
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  }

  /** Pixels are hashed rather than logged: the terrain bake is a quarter of a megapixel. */
  putImageData(img, x, y) {
    this.op("putImageData", x, y, img.width, img.height, byteHash(img.data));
  }

  drawImage(src, ...args) {
    this.op("drawImage", src && src.id, ...args);
  }
}

/**
 * A recording context on its own, for the figures that are handed a context
 * rather than a canvas — the chart, and eventually the minimap (which has
 * hand-rolled its own stub since v1.19) and the Muller plot (which has none).
 *
 * @param {string} [id] the surface's name in the log
 * @returns {{ctx: object, ops: Array}}
 */
export function recordingContext(id = "figure") {
  const ops = [];
  return { ctx: new RecordingContext(id, ops), ops };
}

/** A canvas that exists only to hand out a recording context. */
class RecordingCanvas {
  constructor(id, ops) {
    this.id = id;
    this.ops = ops;
    this.width = 0;
    this.height = 0;
    this.style = {};
    this._ctx = new RecordingContext(id, ops);
  }

  getContext() {
    return this._ctx;
  }
}

/**
 * Run `fn` with a `window` and a `document` that exist only for the duration of
 * the call, then put the globals back exactly as they were.
 *
 * `render.js` reaches for `window.devicePixelRatio` and
 * `document.createElement("canvas")`, and both are legitimate: it is a browser
 * module. Injecting a surface into the Renderer instead would mean changing the
 * thing under test to suit the test. Nothing but this module and the suite
 * imports it, so the shim is never installed in a browser — and it is restored
 * even if drawing throws.
 */
function withStubDom(ops, fn) {
  const had = { window: "window" in globalThis, document: "document" in globalThis };
  const prev = { window: globalThis.window, document: globalThis.document };
  let offscreen = 0;
  globalThis.window = { devicePixelRatio: 1 };
  globalThis.document = {
    createElement: () => new RecordingCanvas(`off${++offscreen}`, ops),
  };
  try {
    return fn();
  } finally {
    if (had.window) globalThis.window = prev.window;
    else delete globalThis.window;
    if (had.document) globalThis.document = prev.document;
    else delete globalThis.document;
  }
}

/**
 * Draw a world once and return the drawing commands it produced.
 *
 * @param {import('./world.js').World} world
 * @param {object} [config] the config to draw with (defaults to the world's own)
 * @param {(r: Renderer) => void} [tune] set renderer state — `showVision`,
 *   `selected`, `reducedMotion`, `highlightSpeciesId` — before the frame
 * @returns {Array} one entry per command: [canvasId, name, ...args]
 */
export function renderOps(world, config = null, tune = null) {
  const ops = [];
  withStubDom(ops, () => {
    const canvas = new RecordingCanvas("pond", ops);
    const renderer = new Renderer(canvas, config || world.config);
    // The names are drawn on a layer of their own (v1.126), so a recording made
    // without one would be blind to every word on the page — the same gap the
    // offscreen surfaces had before v1.50, one release after the feature.
    renderer.attachNameLayer(new RecordingCanvas("names", ops));
    if (tune) tune(renderer);
    renderer.draw(world);
  });
  return ops;
}

/** Mix a string in, character by character, so a restyled mark cannot hide. */
function text(h, s) {
  h.word(s.length);
  for (let i = 0; i < s.length; i++) h.word(s.charCodeAt(i));
  return h;
}

/** Hash a recorded op stream: every name, every number by its bits, every colour. */
export function hashOps(ops) {
  const h = new Hash();
  h.word(0x44524157); // domain separator: "DRAW"
  h.word(ops.length);
  for (const op of ops) {
    h.word(op.length);
    for (const arg of op) {
      if (typeof arg === "number") h.num(arg);
      else if (typeof arg === "boolean") h.flag(arg);
      else text(h, String(arg));
    }
  }
  return h.digest();
}

/**
 * What the pond *looks like* on this tick, as eight hex digits.
 *
 * The fourth channel. Two worlds with the same state can differ here (a config
 * that only changes a size or a colour), and two worlds that differ here can
 * have identical states — which is the whole reason it exists.
 *
 * @param {import('./world.js').World} world
 * @param {object} [config]
 * @param {(r: Renderer) => void} [tune]
 * @returns {string} eight hex digits
 */
export function renderFingerprint(world, config = null, tune = null) {
  return hashOps(renderOps(world, config, tune));
}
