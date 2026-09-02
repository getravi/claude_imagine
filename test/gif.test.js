// gif.test.js — the encoder written from nothing, checked by reading it back
// (v1.144).
//
// Every other drawing surface in this project is tested by asserting on the
// commands it issues (`rendershot.js`) or on the words it composes. Neither
// works here: this module's output is a **file format**, and the only question
// that matters about a file format is whether something else can read it.
// "It looked right in Chrome" is how you ship a GIF that only Chrome can play.
//
// So the centre of this file is `decodeGif` — a GIF89a parser written from the
// specification, deliberately *not* sharing a line with the encoder, including
// its own LZW decoder with its own opinion about when the code width steps up.
//
// **And a round trip is not enough on its own, which is the finding this file
// was built by.** The first encoder here widened its codes one emitted symbol
// too late; this decoder, written to mirror it, agreed with it perfectly, and
// every test below passed. Chrome read the header, painted a single row of the
// picture, and gave up — a 2 MB file that opens as a blank grey rectangle in
// every player on earth. A round trip proves an encoder and a decoder agree; it
// cannot prove either is *right*. So the transition is checked twice: once
// here, and once in a real browser before the release ships, which is the only
// place the question is actually settled.
//
// The rule, in both directions: the encoder widens **before** handing out the
// code that would not fit, and this decoder — whose dictionary runs one entry
// behind the encoder's — widens the moment its own table reaches the same
// ceiling.
//
// The rest of the claims: the palette is a summary that keeps the colours that
// matter, the encoder is a pure function of its arguments (same frames, same
// bytes, twice), and nothing here draws a random number.

import test from "node:test";
import assert from "node:assert/strict";

import {
  GIF_MAX_COLORS,
  GIF_SIGNATURE,
  GIF_TRAILER,
  buildPalette,
  censusAdd,
  colourCensus,
  encodeGif,
  gifFrameBlocks,
  gifMinCodeSize,
  gifPrologue,
  indexFrame,
  joinBytes,
  lzwEncode,
  nearestColour,
  newCensus,
  paletteCache,
  subBlocks,
  tableBits,
} from "../src/gif.js";

// ---- An independent reader ----

/**
 * GIF-LZW, decoded.
 *
 * The dictionary is rebuilt from the code stream exactly as a player would:
 * every code after the first appends one entry, which is the prefix just
 * emitted plus the first symbol of the code now being read. The widening rule
 * is `table.length === (1 << codeSize) - 1` — one entry earlier than the
 * encoder's, because the table here is one entry behind.
 */
function lzwDecode(bytes, minCodeSize) {
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  let codeSize = minCodeSize + 1;
  let table = [];
  const reset = () => {
    table = [];
    for (let i = 0; i < clear; i++) table.push([i]);
    table.push(null, null); // the two reserved codes hold no string
    codeSize = minCodeSize + 1;
  };
  reset();
  const out = [];
  let bitPos = 0;
  const read = () => {
    let v = 0;
    for (let i = 0; i < codeSize; i++) {
      const byte = bytes[bitPos >> 3];
      if (byte === undefined) return -1;
      v |= ((byte >> (bitPos & 7)) & 1) << i;
      bitPos++;
    }
    return v;
  };
  let prev = null;
  for (;;) {
    const code = read();
    if (code < 0 || code === end) break;
    if (code === clear) {
      reset();
      prev = null;
      continue;
    }
    let entry;
    if (code < table.length && table[code]) entry = table[code];
    else if (prev) entry = prev.concat(prev[0]); // the KwKwK case
    else throw new Error(`undefined code ${code} with no prefix`);
    for (const v of entry) out.push(v);
    if (prev && table.length < 4096) {
      table.push(prev.concat(entry[0]));
      if (table.length >= 1 << codeSize && codeSize < 12) codeSize++;
    }
    prev = entry;
  }
  return out;
}

/** A whole GIF89a file, read back into its parts. */
function decodeGif(bytes) {
  let at = 0;
  const byte = () => bytes[at++];
  const short = () => {
    const v = bytes[at] | (bytes[at + 1] << 8);
    at += 2;
    return v;
  };
  const signature = String.fromCharCode(...bytes.slice(0, 6));
  at = 6;
  const width = short();
  const height = short();
  const packed = byte();
  byte(); // background index
  byte(); // aspect ratio
  const tableSize = 1 << ((packed & 7) + 1);
  const palette = bytes.slice(at, at + tableSize * 3);
  at += tableSize * 3;

  const frames = [];
  let loops = null;
  let gce = null;
  for (;;) {
    const block = byte();
    if (block === GIF_TRAILER || block === undefined) break;
    if (block === 0x21) {
      const label = byte();
      if (label === 0xf9) {
        assert.equal(byte(), 4, "a graphic control extension is four bytes");
        const flags = byte();
        const delay = short();
        const transparent = byte();
        assert.equal(byte(), 0, "the extension is terminated");
        gce = { disposal: (flags >> 2) & 7, delay, transparent, hasTransparent: (flags & 1) === 1 };
      } else if (label === 0xff) {
        const n = byte();
        const name = String.fromCharCode(...bytes.slice(at, at + n));
        at += n;
        const sub = byte();
        assert.equal(sub, 3, "the netscape block is three bytes");
        byte(); // sub-block id
        loops = short();
        assert.equal(name, "NETSCAPE2.0");
        assert.equal(byte(), 0, "the extension is terminated");
      } else {
        for (;;) {
          const n = byte();
          if (!n) break;
          at += n;
        }
      }
      continue;
    }
    assert.equal(block, 0x2c, `expected an image descriptor, saw 0x${block.toString(16)}`);
    const left = short();
    const top = short();
    const w = short();
    const h = short();
    const flags = byte();
    assert.equal(flags & 0x80, 0, "no local colour table is written");
    assert.equal(flags & 0x40, 0, "the image is not interlaced");
    const minCodeSize = byte();
    const data = [];
    for (;;) {
      const n = byte();
      if (!n) break;
      for (let i = 0; i < n; i++) data.push(bytes[at + i]);
      at += n;
    }
    frames.push({
      left,
      top,
      width: w,
      height: h,
      gce,
      pixels: lzwDecode(Uint8Array.from(data), minCodeSize),
    });
    gce = null;
  }
  return { signature, width, height, palette, frames, loops, tableSize };
}

// ---- Fixtures ----

/** A deterministic pixel source: no `Math.random` anywhere in this file. */
function noise(seed) {
  let x = seed >>> 0;
  return () => {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return (x >> 8) & 0xff;
  };
}

/** An RGBA frame of `n` pixels from a palette of a few colours. */
function frameOf(n, colours, pick) {
  const px = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const c = colours[pick(i) % colours.length];
    px[i * 4] = c[0];
    px[i * 4 + 1] = c[1];
    px[i * 4 + 2] = c[2];
    px[i * 4 + 3] = 255;
  }
  return px;
}

// ---- LZW ----

test("LZW round-trips every stream a pond can produce", () => {
  const rnd = noise(20260902);
  const cases = [
    ["empty", [], 8],
    ["a single pixel", [7], 8],
    ["one flat colour", new Array(5000).fill(3), 8],
    ["a ramp through the whole table", Array.from({ length: 5000 }, (_, i) => i % 256), 8],
    ["the KwKwK case", [1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1], 2],
    ["two bits a pixel", Array.from({ length: 40000 }, () => rnd() & 3), 2],
    ["seven bits a pixel", Array.from({ length: 60000 }, () => rnd() & 127), 7],
  ];
  for (const [what, indices, min] of cases) {
    const back = lzwDecode(lzwEncode(Uint8Array.from(indices), min), min);
    assert.deepEqual(back, indices, `${what} did not survive the round trip`);
  }
});

test("LZW survives filling its dictionary and starting over", () => {
  // 200,000 incompressible symbols is several passes through all 4,096 codes,
  // which is the branch that emits a fresh `clear` mid-stream — the one path a
  // short fixture never reaches and every real recording does.
  const rnd = noise(4096);
  const indices = Array.from({ length: 200000 }, () => rnd());
  const bytes = lzwEncode(Uint8Array.from(indices), 8);
  assert.deepEqual(lzwDecode(bytes, 8), indices);
});

test("LZW actually compresses what a pond looks like", () => {
  // Flat water with a few darts on it: the shape of every frame this makes.
  const px = Array.from({ length: 100000 }, (_, i) => (i % 977 === 0 ? 9 : 1));
  const bytes = lzwEncode(Uint8Array.from(px), 7);
  assert.ok(bytes.length < px.length / 8, `expected under an eighth, got ${bytes.length}`);
});

test("sub-blocks are at most 255 bytes and are terminated", () => {
  const blocks = subBlocks(new Uint8Array(600));
  assert.equal(blocks[0], 255);
  assert.equal(blocks[256], 255);
  assert.equal(blocks[512], 90);
  assert.equal(blocks[blocks.length - 1], 0);
  assert.equal(subBlocks(new Uint8Array(0)).length, 1, "an empty stream is still terminated");
});

test("a colour table's width is the smallest that holds it", () => {
  assert.equal(tableBits(2), 1);
  assert.equal(tableBits(3), 2);
  assert.equal(tableBits(4), 2);
  assert.equal(tableBits(5), 3);
  assert.equal(tableBits(128), 7);
  assert.equal(tableBits(129), 8);
  assert.equal(tableBits(256), 8);
});

// ---- The palette ----

test("the palette keeps the colours a picture is mostly made of", () => {
  // Ninety per cent of one blue, ten per cent spread over three others: the
  // proportions of a pond, and every one of the four has to come back.
  const wanted = [
    [20, 40, 90],
    [220, 120, 60],
    [240, 240, 240],
    [10, 10, 10],
  ];
  const px = frameOf(10000, wanted, (i) => (i % 10 === 0 ? 1 + (i % 3) : 0));
  const palette = buildPalette(colourCensus([px]), 8);
  for (const [r, g, b] of wanted) {
    const idx = nearestColour(palette, r, g, b);
    const d =
      Math.abs(palette[idx * 3] - r) +
      Math.abs(palette[idx * 3 + 1] - g) +
      Math.abs(palette[idx * 3 + 2] - b);
    assert.ok(d <= 6, `[${r},${g},${b}] came back ${d} away`);
  }
});

test("the palette never exceeds what was asked for, or the format's ceiling", () => {
  const rnd = noise(7);
  const px = frameOf(20000, Array.from({ length: 400 }, () => [rnd(), rnd(), rnd()]), (i) => i);
  const census = colourCensus([px]);
  for (const want of [2, 5, 16, 128, GIF_MAX_COLORS]) {
    const palette = buildPalette(census, want);
    assert.ok(palette.length / 3 <= want, `asked for ${want}, got ${palette.length / 3}`);
  }
  assert.ok(buildPalette(census, 4096).length / 3 <= GIF_MAX_COLORS);
});

test("a reserved colour is in the table however rare it is", () => {
  // A caption is a few hundred pale pixels in a frame of two hundred thousand,
  // and median cut counts votes. Here is that population — one pixel in a
  // thousand, against three hundred shades of water — first losing its ink to
  // the census, and then keeping it because it was reserved.
  const ink = [226, 235, 241];
  // The water: hundreds of near shades of one dark blue, which is what a pond
  // frame actually is and what makes the ink's single bucket a rounding error.
  const rnd = noise(1441);
  const water = Array.from({ length: 300 }, () => [
    8 + (rnd() % 40),
    12 + (rnd() % 40),
    30 + (rnd() % 60),
  ]);
  const px = frameOf(40000, [...water, ink], (i) =>
    i % 1000 === 0 ? water.length : rnd() % water.length
  );
  const census = colourCensus([px]);

  const unreserved = buildPalette(census, 16);
  const lost = nearestColour(unreserved, ...ink);
  assert.ok(
    Math.abs(unreserved[lost * 3] - ink[0]) > 20,
    "the fixture is meant to lose its ink without a reservation"
  );

  const palette = buildPalette(census, 16, [ink]);
  const idx = nearestColour(palette, ...ink);
  assert.deepEqual([palette[idx * 3], palette[idx * 3 + 1], palette[idx * 3 + 2]], ink);
  assert.ok(palette.length / 3 <= 16, "the reservation is inside the budget, not on top of it");
});

test("reservations are deduplicated and never take more than half the table", () => {
  const rnd = noise(3);
  const census = colourCensus([
    frameOf(9000, Array.from({ length: 30 }, () => [rnd(), rnd(), rnd()]), (i) => i),
  ]);
  const twice = buildPalette(census, 16, [[1, 2, 3], [1, 2, 3], [4, 5, 6]]);
  assert.deepEqual(Array.from(twice.slice(0, 6)), [1, 2, 3, 4, 5, 6]);
  // A caller reserving everything would be asking for a palette with no opinion
  // about the picture, so the table keeps at least half of itself back.
  const greedy = buildPalette(census, 8, Array.from({ length: 20 }, (_, i) => [i, i, i]));
  assert.ok(greedy.length / 3 <= 8);
  assert.equal(greedy[4 * 3] !== undefined, true, "the census still got half the entries");
});

test("a picture of one colour still makes a legal table", () => {
  const px = frameOf(100, [[7, 7, 7]], () => 0);
  const palette = buildPalette(colourCensus([px]), 128);
  assert.ok(palette.length >= 3);
  assert.equal(nearestColour(palette, 7, 7, 7), 0);
  // Two entries is the format's floor, and `tableBits` never returns 0.
  assert.ok(tableBits(palette.length / 3) >= 1);
});

test("a census can be filled a frame at a time or all at once", () => {
  const rnd = noise(11);
  const frames = [0, 1, 2].map(() =>
    frameOf(4000, Array.from({ length: 30 }, () => [rnd(), rnd(), rnd()]), (i) => i)
  );
  const batch = colourCensus(frames, 3);
  const running = newCensus();
  for (const f of frames) censusAdd(running, f, 3);
  assert.deepEqual(Array.from(running.count), Array.from(batch.count));
  assert.deepEqual(Array.from(running.r), Array.from(batch.r));
});

test("sampling every seventh pixel picks the same palette as sampling all of them", () => {
  // The claim `MOVIE_SAMPLE_STRIDE` rests on. A palette is a summary, and the
  // buckets that earn an entry have thousands of members.
  const rnd = noise(6);
  const colours = Array.from({ length: 20 }, () => [rnd(), rnd(), rnd()]);
  const px = frameOf(60000, colours, () => rnd());
  const all = buildPalette(colourCensus([px], 1), 20);
  const seventh = buildPalette(colourCensus([px], 7), 20);
  assert.equal(all.length, seventh.length);
  for (const [r, g, b] of colours) {
    const a = nearestColour(all, r, g, b);
    const s = nearestColour(seventh, r, g, b);
    const d =
      Math.abs(all[a * 3] - seventh[s * 3]) +
      Math.abs(all[a * 3 + 1] - seventh[s * 3 + 1]) +
      Math.abs(all[a * 3 + 2] - seventh[s * 3 + 2]);
    assert.ok(d <= 3, `stride moved [${r},${g},${b}] by ${d}`);
  }
});

test("a stride that divides the width samples the same columns forever", () => {
  // The defect this test was written by accident and then kept on purpose. A
  // frame is a row-major buffer, so a stride is a *column* step: if it divides
  // the width, the sample lands in the same handful of columns on every row of
  // every frame, and a palette built from it has never seen four fifths of the
  // picture. Here is that failure, held still — a picture whose right-hand half
  // is a colour the census cannot reach.
  const wide = 60;
  const px = new Uint8ClampedArray(wide * 40 * 4);
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < wide; x++) {
      const i = (y * wide + x) * 4;
      const left = x % 6 === 0;
      px[i] = left ? 20 : 220;
      px[i + 1] = left ? 30 : 210;
      px[i + 2] = left ? 40 : 200;
      px[i + 3] = 255;
    }
  }
  const blind = colourCensus([px], 6);
  const seeing = colourCensus([px], 7);
  const occupied = (c) => c.count.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
  assert.equal(occupied(blind), 1, "a stride of six sees one of the two colours");
  assert.equal(occupied(seeing), 2, "a stride of seven walks across the rows");
});

test("the palette cache answers exactly what the search would have", () => {
  const rnd = noise(99);
  const palette = buildPalette(
    colourCensus([frameOf(9000, Array.from({ length: 50 }, () => [rnd(), rnd(), rnd()]), (i) => i)]),
    16
  );
  const px = frameOf(3000, Array.from({ length: 70 }, () => [rnd(), rnd(), rnd()]), (i) => i);
  const cached = indexFrame(px, palette, paletteCache());
  for (let p = 0; p < cached.length; p++) {
    const i = p * 4;
    // The cache is keyed on a 15-bit bucket, so it answers for the bucket's
    // first colour. That is the one approximation in this module, and it is
    // bounded: two colours in a bucket are within eight of each other on every
    // channel, which is under the distance between two palette entries.
    const direct = nearestColour(palette, px[i], px[i + 1], px[i + 2]);
    const dc = colourDistance(palette, cached[p], px, i);
    const dd = colourDistance(palette, direct, px, i);
    assert.ok(dc <= dd + 3 * 8 * 8 * 3, "the cached answer is not meaningfully worse");
  }
});

function colourDistance(palette, idx, px, i) {
  const dr = px[i] - palette[idx * 3];
  const dg = px[i + 1] - palette[idx * 3 + 1];
  const db = px[i + 2] - palette[idx * 3 + 2];
  return dr * dr + dg * dg + db * db;
}

// ---- The file ----

test("a one-frame GIF reads back as the pixels that went in", () => {
  const colours = [
    [10, 20, 30],
    [200, 30, 40],
    [250, 250, 250],
  ];
  const px = frameOf(48 * 32, colours, (i) => (i * 13) % 3);
  const palette = buildPalette(colourCensus([px]), 8);
  const indices = indexFrame(px, palette);
  const bytes = encodeGif({ width: 48, height: 32, palette, frames: [indices] });
  const back = decodeGif(bytes);
  assert.equal(back.signature, GIF_SIGNATURE);
  assert.equal(back.width, 48);
  assert.equal(back.height, 32);
  assert.equal(back.frames.length, 1);
  assert.deepEqual(back.frames[0].pixels, Array.from(indices));
  // And the indices point at the colours they were made from.
  for (let p = 0; p < indices.length; p += 37) {
    const idx = back.frames[0].pixels[p];
    const d = colourDistance(back.palette, idx, px, p * 4);
    assert.ok(d <= 12, `pixel ${p} came back ${d} away`);
  }
});

test("an animation reads back as every frame, in order, looping forever", () => {
  const colours = [
    [12, 22, 60],
    [180, 200, 255],
    [90, 30, 20],
    [0, 0, 0],
  ];
  const frames = [0, 1, 2, 3, 4].map((n) => frameOf(40 * 25, colours, (i) => i + n));
  const census = newCensus();
  for (const f of frames) censusAdd(census, f, 1);
  const palette = buildPalette(census, 16);
  const indexed = frames.map((f) => indexFrame(f, palette, paletteCache()));
  const bytes = encodeGif({ width: 40, height: 25, palette, frames: indexed, delay: 4 });
  const back = decodeGif(bytes);
  assert.equal(back.frames.length, 5);
  assert.equal(back.loops, 0, "0 means forever, which is the only value used here");
  back.frames.forEach((frame, n) => {
    assert.equal(frame.width, 40);
    assert.equal(frame.height, 25);
    assert.equal(frame.left, 0);
    assert.equal(frame.top, 0);
    assert.equal(frame.gce.delay, 4);
    assert.equal(frame.gce.disposal, 1, "leave the frame in place: every frame is opaque");
    assert.equal(frame.gce.hasTransparent, false);
    assert.deepEqual(frame.pixels, Array.from(indexed[n]));
    assert.equal(frame.pixels.length, 40 * 25, "every pixel of the frame is present");
  });
  assert.equal(bytes[bytes.length - 1], GIF_TRAILER);
});

test("a still — one frame — is written without the looping extension", () => {
  const px = frameOf(16, [[1, 2, 3]], () => 0);
  const palette = buildPalette(colourCensus([px]), 4);
  const back = decodeGif(
    encodeGif({ width: 4, height: 4, palette, frames: [indexFrame(px, palette)] })
  );
  assert.equal(back.loops, null, "nothing to loop");
  assert.equal(back.frames.length, 1);
});

test("the streaming path and the one-call path produce identical bytes", () => {
  // The browser assembles a file a frame at a time so the page keeps answering
  // while it works. That is a second expression of one format, and this is the
  // assertion that stops the two drifting.
  const colours = [
    [5, 10, 40],
    [200, 210, 220],
  ];
  const frames = [0, 1, 2].map((n) => frameOf(20 * 12, colours, (i) => i + n));
  const palette = buildPalette(colourCensus(frames), 8);
  const indexed = frames.map((f) => indexFrame(f, palette, paletteCache()));
  const whole = encodeGif({ width: 20, height: 12, palette, frames: indexed, delay: 7 });

  const minCodeSize = gifMinCodeSize(palette);
  const parts = [gifPrologue({ width: 20, height: 12, palette, animated: true })];
  for (const frame of indexed) {
    parts.push(gifFrameBlocks(frame, { width: 20, height: 12, minCodeSize, delay: 7 }));
  }
  parts.push(Uint8Array.of(GIF_TRAILER));
  assert.deepEqual(Array.from(joinBytes(parts)), Array.from(whole));
});

test("the encoder is a pure function of its arguments", () => {
  const px = frameOf(30 * 20, [[9, 9, 9], [200, 100, 50], [30, 60, 200]], (i) => i * 5);
  const palette = buildPalette(colourCensus([px]), 8);
  const once = encodeGif({ width: 30, height: 20, palette, frames: [indexFrame(px, palette)] });
  const twice = encodeGif({ width: 30, height: 20, palette, frames: [indexFrame(px, palette)] });
  assert.deepEqual(Array.from(once), Array.from(twice));
});

test("encoding a picture draws no random number", () => {
  // Directive 2. This module never sees a world, so there is no `rng` to watch
  // the way `picture.js`'s test watches one: the only randomness it could
  // reach for is the global, and the global is taken away for the duration.
  // A quantiser that broke a tie with a coin flip would be caught here and
  // nowhere else — and it would make two recordings of one pond two files.
  const px = frameOf(24 * 24, [[1, 1, 1], [180, 40, 30], [40, 180, 30]], (i) => i * 3);
  const real = Math.random;
  Math.random = () => {
    throw new Error("the encoder reached for a random number");
  };
  try {
    const census = newCensus();
    censusAdd(census, px, 2);
    const palette = buildPalette(census, 16);
    encodeGif({
      width: 24,
      height: 24,
      palette,
      frames: [indexFrame(px, palette, paletteCache())],
    });
  } finally {
    Math.random = real;
  }
});
