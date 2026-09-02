// gif.js — an animated-GIF encoder, written from nothing.
//
// v1.141 taught this page to hand a stranger a **picture**, and the entry that
// shipped it ended on the one thing the picture cannot do: the pond *moves*,
// and a photograph of a pond is a photograph of some dots. A still frame of
// this simulation is, honestly, the least interesting thing it produces. The
// darts chase, the crowd swirls, a hunter cuts through a shoal — none of that
// survives a PNG, and none of it survives a description either.
//
// So this module makes the file that carries motion and that every phone,
// every chat window and every feed on earth already knows how to play without
// being asked: a GIF. Not WebM, not APNG, not a video element — a GIF, because
// the question is never "is this format better" but "will it move when my
// friend opens it", and for that question the answer has been the same since
// 1989.
//
// **Zero dependencies is the house rule, so the encoder is the feature.** That
// sounds worse than it is. A GIF is four things stacked, and all four are
// small:
//
//   1. a **colour table** of at most 256 entries, which means the pond's
//      thousands of hues have to be reduced to a few dozen (`buildPalette`);
//   2. every pixel replaced by an **index** into that table (`indexFrame`);
//   3. those indices squeezed with **LZW** (`lzwEncode`) — the whole of the
//      compression, and about forty lines;
//   4. a handful of fixed-layout **blocks** around the result (`encodeGif`).
//
// Nothing here knows what a pond is. It takes pixels and gives back bytes,
// which is what makes it the one part of this feature that can be proved
// correct without a browser: `test/gif.test.js` decodes the encoder's own
// output with an independently written LZW decoder and asserts the pixels come
// back. An encoder tested only by "it looked right in Chrome" is an encoder
// that will one day produce a file only Chrome can read.
//
// **Determinism: PURE.** Every function here is a function of its arguments.
// No clock, no RNG, no global state — the same frames always encode to the
// same bytes, which is why the suite can hash them. Directive 2 is not even at
// risk: this module cannot draw a random number because it never asks for one.

/** Every GIF this project writes is a GIF89a — the version with animation in it. */
export const GIF_SIGNATURE = "GIF89a";

/** The format's hard ceiling on a colour table. */
export const GIF_MAX_COLORS = 256;

/** The format's hard ceiling on an LZW code. */
const LZW_MAX_CODE = 4096;

/**
 * The colour resolution the fifteen bits of `colourKey` throw away.
 *
 * Five bits a channel: 32,768 buckets, which is enough to tell two shades of
 * pond water apart and small enough that the histogram is a flat typed array
 * rather than a hash map. The exact colours are kept as running sums inside
 * each bucket, so the palette this produces is not itself quantised to 5 bits —
 * only the *grouping* is.
 */
const KEY_BITS = 5;
const KEY_SIZE = 1 << (KEY_BITS * 3);

/** The 15-bit bucket a colour falls in. */
function colourKey(r, g, b) {
  return ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
}

/**
 * An empty colour census: four flat arrays, one bucket per 15-bit colour.
 *
 * Kept open rather than computed in one pass because the caller records frames
 * over two seconds and would otherwise have to walk all forty of them again at
 * the end. A census is additive, so it can be filled as the frames arrive.
 */
export function newCensus() {
  return {
    count: new Float64Array(KEY_SIZE),
    r: new Float64Array(KEY_SIZE),
    g: new Float64Array(KEY_SIZE),
    b: new Float64Array(KEY_SIZE),
  };
}

/**
 * Add one frame's colours to a census.
 *
 * `stride` samples every nth pixel. A palette is a summary, and summarising a
 * 200,000-pixel frame from every sixth pixel gives the same answer as from all
 * of them at a sixth of the cost — the buckets that earn a table entry have
 * thousands of members, and no sampling rate this project would use loses one.
 *
 * @param {{count: Float64Array, r: Float64Array, g: Float64Array, b: Float64Array}} census
 * @param {Uint8ClampedArray|Uint8Array} px RGBA pixels
 * @param {number} stride sample every nth pixel (1 = all of them)
 */
export function censusAdd(census, px, stride = 1) {
  const step = Math.max(1, Math.floor(stride)) * 4;
  for (let i = 0; i + 3 < px.length; i += step) {
    const k = colourKey(px[i], px[i + 1], px[i + 2]);
    census.count[k]++;
    census.r[k] += px[i];
    census.g[k] += px[i + 1];
    census.b[k] += px[i + 2];
  }
  return census;
}

/** The census of a set of frames, in one call — the whole-batch convenience. */
export function colourCensus(frames, stride = 1) {
  const census = newCensus();
  for (const px of frames) censusAdd(census, px, stride);
  return census;
}

/**
 * Median cut: reduce a census to at most `maxColors` representative colours.
 *
 * The classic algorithm and, for this picture, the right one. Start with every
 * occupied bucket in a single box; repeatedly take the box holding the most
 * *pixels*, split it across its widest channel at the population median, and
 * stop when there are enough boxes. Each box then contributes the mean colour
 * of the pixels inside it.
 *
 * Splitting the **most populous** box rather than the largest one is what makes
 * this fit a pond. The water is nine tenths of every frame and occupies a
 * narrow band of blues; a volume-first split would spend its first divisions on
 * the handful of near-white specular pixels and leave the water in four flat
 * bands. Population-first spends the table where the pixels are, which is
 * exactly where banding would be visible.
 *
 * Every tie is broken by the lowest index, and the channel order on an equal
 * spread is red, then green, then blue. Not because those are better answers
 * but because a stable one makes the whole encoder a pure function — see the
 * note at the top of the file.
 *
 * **`reserved` is the counterweight, and it exists because population-first has
 * one predictable victim: whatever is *rare*.** A caption is a few hundred pale
 * pixels in a frame of two hundred thousand, and a histogram cannot tell the
 * difference between a colour that is uncommon and a colour that is the only
 * writing on the picture. A colour passed here is in the table whatever the
 * census thinks of it — which is the right way round, because the caller knows
 * which of its colours carry *meaning* and the census can only know which are
 * common.
 *
 * @param {{count: Float64Array, r: Float64Array, g: Float64Array, b: Float64Array}} census
 * @param {number} maxColors 2..256
 * @param {Array<Array<number>>} [reserved] RGB triples that must be in the table
 * @returns {Uint8Array} `3 * n` bytes of RGB, n ≤ maxColors
 */
export function buildPalette(census, maxColors = GIF_MAX_COLORS, reserved = []) {
  const cap = Math.max(2, Math.min(GIF_MAX_COLORS, Math.floor(maxColors)));
  // Reserved colours go in first, deduplicated, and never crowd out more than
  // half the table — a caller that reserved everything would be asking for a
  // palette with no opinion about the picture.
  const keep = [];
  for (const c of reserved) {
    const rgb = [c[0] & 255, c[1] & 255, c[2] & 255];
    if (keep.length >= Math.floor(cap / 2)) break;
    if (!keep.some((k) => k[0] === rgb[0] && k[1] === rgb[1] && k[2] === rgb[2])) keep.push(rgb);
  }
  const want = Math.max(1, cap - keep.length);
  // The occupied buckets, as parallel arrays: the split sorts indices into
  // this list rather than moving objects around.
  const keys = [];
  for (let k = 0; k < KEY_SIZE; k++) if (census.count[k] > 0) keys.push(k);
  if (keys.length === 0) {
    // Nothing was sampled. The reserved colours are still a table, and a table
    // of fewer than two entries is not one the format will take.
    const bare = keep.length ? keep : [[0, 0, 0]];
    while (bare.length < 2) bare.push([0, 0, 0]);
    return Uint8Array.from(bare.flat());
  }

  const mid = (k, chan) => {
    const n = census.count[k];
    return chan === 0 ? census.r[k] / n : chan === 1 ? census.g[k] / n : census.b[k] / n;
  };

  const boxOf = (items) => {
    let pixels = 0;
    const lo = [255, 255, 255];
    const hi = [0, 0, 0];
    for (const k of items) {
      pixels += census.count[k];
      for (let c = 0; c < 3; c++) {
        const v = mid(k, c);
        if (v < lo[c]) lo[c] = v;
        if (v > hi[c]) hi[c] = v;
      }
    }
    return { items, pixels, spread: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] };
  };

  let boxes = [boxOf(keys)];
  while (boxes.length < want) {
    let pick = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].items.length < 2) continue;
      if (pick < 0 || boxes[i].pixels > boxes[pick].pixels) pick = i;
    }
    if (pick < 0) break; // every box is a single bucket: nothing left to divide
    const box = boxes[pick];
    // The widest channel, red first on a tie.
    let chan = 0;
    if (box.spread[1] > box.spread[chan]) chan = 1;
    if (box.spread[2] > box.spread[chan]) chan = 2;
    const sorted = box.items
      .slice()
      .sort((a, b) => mid(a, chan) - mid(b, chan) || a - b);
    // Walk to the population median, leaving at least one bucket on each side.
    const half = box.pixels / 2;
    let carried = 0;
    let cut = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
      carried += census.count[sorted[i]];
      cut = i + 1;
      if (carried >= half) break;
    }
    boxes.splice(pick, 1, boxOf(sorted.slice(0, cut)), boxOf(sorted.slice(cut)));
  }

  const out = new Uint8Array((keep.length + boxes.length) * 3);
  keep.forEach((c, i) => out.set(c, i * 3));
  const base = keep.length * 3;
  boxes.forEach((box, i) => {
    let n = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    for (const k of box.items) {
      n += census.count[k];
      r += census.r[k];
      g += census.g[k];
      b += census.b[k];
    }
    out[base + i * 3] = Math.round(r / n);
    out[base + i * 3 + 1] = Math.round(g / n);
    out[base + i * 3 + 2] = Math.round(b / n);
  });
  return out;
}

/**
 * A lookup table from 15-bit colour bucket to palette index, built lazily.
 *
 * The naive mapping — nearest palette entry, per pixel — is 160,000 pixels
 * times 128 candidates times however many frames, which is tens of millions of
 * comparisons per second of animation and visibly hangs the page. Colours,
 * though, repeat: a pond frame draws water in a few hundred distinct shades.
 * So the search runs once per *bucket* and every later pixel of that shade is
 * an array read. The table is shared across frames, which is why it is the
 * caller's to make and pass in.
 */
export function paletteCache() {
  return new Int16Array(KEY_SIZE).fill(-1);
}

/** The palette entry closest to a colour, by squared distance in RGB. */
export function nearestColour(palette, r, g, b) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < palette.length; i += 3) {
    const dr = r - palette[i];
    const dg = g - palette[i + 1];
    const db = b - palette[i + 2];
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) {
      bestD = d;
      best = i / 3;
    }
  }
  return best;
}

/**
 * Replace every pixel of an RGBA frame with its palette index.
 *
 * @param {Uint8ClampedArray|Uint8Array} px RGBA, four bytes a pixel
 * @param {Uint8Array} palette from `buildPalette`
 * @param {Int16Array} [cache] from `paletteCache`, shared across frames
 * @returns {Uint8Array} one byte a pixel
 */
export function indexFrame(px, palette, cache = paletteCache()) {
  const out = new Uint8Array(px.length >> 2);
  for (let i = 0, p = 0; p < out.length; i += 4, p++) {
    const k = colourKey(px[i], px[i + 1], px[i + 2]);
    let idx = cache[k];
    if (idx < 0) {
      idx = nearestColour(palette, px[i], px[i + 1], px[i + 2]);
      cache[k] = idx;
    }
    out[p] = idx;
  }
  return out;
}

/**
 * LZW, in the dialect GIF speaks.
 *
 * Variable-width codes, least-significant-bit first, starting one bit wider
 * than the colour table needs. Two codes are reserved before any data: `clear`
 * resets the dictionary, `end` finishes the stream. The dictionary grows one
 * entry per emitted code and the code width steps up the moment the next
 * entry would not fit — the one line in this function with an off-by-one worth
 * losing an afternoon to, and the reason the test round-trips rather than
 * eyeballs.
 *
 * When the dictionary fills at 4,096 entries the encoder emits `clear` and
 * starts over rather than freezing the table. Freezing compresses a stationary
 * image slightly better; a pond is not stationary, and a stale dictionary on
 * a scene that has moved on is worse than a fresh one.
 *
 * @param {Uint8Array} indices one byte a pixel
 * @param {number} minCodeSize bits, 2..8 — `ceil(log2(paletteSize))`, min 2
 * @returns {Uint8Array} the raw code stream, before it is cut into sub-blocks
 */
export function lzwEncode(indices, minCodeSize) {
  const min = Math.max(2, Math.min(8, minCodeSize));
  const clear = 1 << min;
  const end = clear + 1;
  const out = [];
  let codeSize = min + 1;
  let next = end + 1;
  let dict = new Map();
  let bits = 0;
  let held = 0;

  const emit = (code) => {
    held |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      out.push(held & 0xff);
      held >>= 8;
      bits -= 8;
    }
  };

  emit(clear);
  if (indices.length === 0) {
    emit(end);
    if (bits > 0) out.push(held & 0xff);
    return Uint8Array.from(out);
  }

  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const seen = dict.get(key);
    if (seen !== undefined) {
      prefix = seen;
      continue;
    }
    emit(prefix);
    if (next < LZW_MAX_CODE) {
      // Widen **before** handing out the code that no longer fits, not after.
      // The difference is one emitted code, it is invisible to any decoder
      // written to match this encoder, and it is the whole file to every
      // decoder in the world: getting it wrong produced a GIF that Chrome read
      // the header of, painted one row from, and abandoned. See the note at the
      // top of `test/gif.test.js`.
      if (next >= 1 << codeSize && codeSize < 12) codeSize++;
      dict.set(key, next++);
    } else {
      emit(clear);
      dict = new Map();
      next = end + 1;
      codeSize = min + 1;
    }
    prefix = k;
  }
  emit(prefix);
  emit(end);
  if (bits > 0) out.push(held & 0xff);
  return Uint8Array.from(out);
}

/**
 * Cut a byte stream into GIF sub-blocks: at most 255 bytes each, every one
 * preceded by its length, the run closed by a zero.
 */
export function subBlocks(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length; i += 255) {
    const n = Math.min(255, bytes.length - i);
    out.push(n);
    for (let j = 0; j < n; j++) out.push(bytes[i + j]);
  }
  out.push(0);
  return out;
}

/** How many colour-table bits a palette of `n` entries needs: 2..256 → 1..8. */
export function tableBits(n) {
  let bits = 1;
  while (1 << bits < n) bits++;
  return Math.max(1, Math.min(8, bits));
}

/** The LZW code width a palette calls for: at least 2, the format's floor. */
export function gifMinCodeSize(palette) {
  return Math.max(2, tableBits(palette.length / 3));
}

/** The last byte of every GIF. */
export const GIF_TRAILER = 0x3b;

/**
 * Everything before the first frame: signature, screen, colour table, and the
 * instruction to loop.
 *
 * One global colour table shared by every frame, which is both smaller than a
 * table per frame and truer: a shared palette is what stops the pond's blues
 * shifting under it from frame to frame, the flicker that gives a cheaply made
 * GIF away.
 *
 * @param {object} spec
 * @param {number} spec.width
 * @param {number} spec.height
 * @param {Uint8Array} spec.palette RGB triples from `buildPalette`
 * @param {boolean} [spec.animated] whether to write the looping extension
 * @param {number} [spec.loop] 0 = forever, which is the only value used here
 * @returns {Uint8Array}
 */
export function gifPrologue({ width, height, palette, animated = true, loop = 0 }) {
  const bits = tableBits(palette.length / 3);
  const entries = 1 << bits;
  const out = [];
  const byte = (v) => out.push(v & 0xff);
  const short = (v) => {
    out.push(v & 0xff);
    out.push((v >> 8) & 0xff);
  };
  for (const ch of GIF_SIGNATURE) byte(ch.charCodeAt(0));

  // Logical screen descriptor: the canvas every frame is painted onto.
  short(width);
  short(height);
  byte(0x80 | ((bits - 1) << 4) | (bits - 1)); // global table, colour resolution, size
  byte(0); // background colour index
  byte(0); // pixel aspect ratio: none stated

  // The global colour table, padded to its power of two.
  for (let i = 0; i < entries * 3; i++) byte(i < palette.length ? palette[i] : 0);

  // The Netscape application extension: the only way to say "loop", and a 1995
  // browser vendor's extension is still how every player on earth is told.
  if (animated) {
    byte(0x21);
    byte(0xff);
    byte(11);
    for (const ch of "NETSCAPE2.0") byte(ch.charCodeAt(0));
    byte(3);
    byte(1);
    short(loop);
    byte(0);
  }
  return Uint8Array.from(out);
}

/**
 * One frame's blocks: how long it is held, where it goes, and its pixels.
 *
 * Exported on its own because the browser calls it **one frame at a time,
 * across animation frames**. Compressing two seconds of pond is a second or
 * two of arithmetic, and a page that stops answering for two seconds after a
 * press is a page a visitor reloads. Spread a frame per tick, the progress
 * label moves and the pond keeps drawing.
 *
 * @param {Uint8Array} frame one byte a pixel, `width * height` of them
 * @param {object} spec
 * @param {number} spec.width
 * @param {number} spec.height
 * @param {number} spec.minCodeSize from `gifMinCodeSize`
 * @param {number} [spec.delay] hundredths of a second this frame is held
 * @returns {Uint8Array}
 */
export function gifFrameBlocks(frame, { width, height, minCodeSize, delay = 4 }) {
  const out = [];
  const byte = (v) => out.push(v & 0xff);
  const short = (v) => {
    out.push(v & 0xff);
    out.push((v >> 8) & 0xff);
  };
  // Graphic control extension: how long this frame is held, and what happens to
  // it afterwards. Disposal 1 — leave it in place — because every frame here is
  // opaque and full-size, so there is nothing to restore.
  byte(0x21);
  byte(0xf9);
  byte(4);
  byte(1 << 2);
  short(delay);
  byte(0); // no transparent index
  byte(0);

  byte(0x2c); // image descriptor
  short(0);
  short(0);
  short(width);
  short(height);
  byte(0); // no local table, not interlaced

  byte(minCodeSize);
  for (const b of subBlocks(lzwEncode(frame, minCodeSize))) byte(b);
  return Uint8Array.from(out);
}

/** Join the pieces of a file that was assembled a frame at a time. */
export function joinBytes(parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/**
 * The whole file in one call — the convenience the suite uses, and the
 * definition the streaming path above is checked against.
 *
 * @param {object} spec
 * @param {number} spec.width
 * @param {number} spec.height
 * @param {Uint8Array} spec.palette RGB triples from `buildPalette`
 * @param {Array<Uint8Array>} spec.frames one byte a pixel, `width * height` each
 * @param {number} [spec.delay] hundredths of a second between frames
 * @param {number} [spec.loop] 0 = forever, which is the only value used here
 * @returns {Uint8Array} the whole file
 */
export function encodeGif({ width, height, palette, frames, delay = 4, loop = 0 }) {
  const minCodeSize = gifMinCodeSize(palette);
  const parts = [
    gifPrologue({ width, height, palette, animated: frames.length > 1, loop }),
  ];
  for (const frame of frames) {
    parts.push(gifFrameBlocks(frame, { width, height, minCodeSize, delay }));
  }
  parts.push(Uint8Array.of(GIF_TRAILER));
  return joinBytes(parts);
}
