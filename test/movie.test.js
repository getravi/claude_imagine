// movie.test.js — the pond as a thing that moves when you send it (v1.144).
//
// The division is `picture.test.js`'s, because the two surfaces are a pair:
// some of these claims are about **words** — a filename an operating system
// will take, a receipt that names the pond rather than the file — and the rest
// are about a **painting**, asserted through `rendershot.js`'s context, which
// paints nothing and remembers everything.
//
// Three claims are the ones I would want a stranger to check first. The poster
// keeps the pond's shape rather than stretching it to a fixed box. The press
// draws no random number and moves nothing — this one steps the pond, which is
// the whole difference from the still picture, and stepping is the pond's own
// stepping or the promise of a reproducible seed is gone. And the sampling
// stride stays coprime with the file's width, which is the arithmetic a future
// release breaks by changing one number in the other.
//
// The claim this file cannot make is that the loop is *nice to watch*. It knows
// the water is composited at the right size under a name and over an address,
// forty-eight times, two steps apart. Whether anybody wants to send it is a
// question for a browser and a pair of eyes, and it was asked there.

import test from "node:test";
import assert from "node:assert/strict";

import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { nameSpecies } from "../src/speciesnames.js";
import { drawStream, stateFingerprint } from "../src/fingerprint.js";
import { recordingContext } from "../src/rendershot.js";
import { pondName } from "../src/pondname.js";
import { contrastRatio, pictureCardTones, WCAG_AA_TEXT } from "../src/palette.js";
import { GIF_MAX_COLORS, buildPalette, censusAdd, nearestColour, newCensus } from "../src/gif.js";
import { pictureAddress, pictureCaption, pictureCredit } from "../src/picture.js";
import {
  MOVIE_COLORS,
  MOVIE_DELAY_CS,
  MOVIE_FRAMES,
  MOVIE_FRAME_BOX,
  MOVIE_LABEL,
  MOVIE_MARK,
  MOVIE_SAMPLE_STRIDE,
  MOVIE_SECONDS,
  MOVIE_STEPS,
  MOVIE_STEPS_PER_FRAME,
  MOVIE_TYPE,
  MOVIE_WIDTH,
  fileSize,
  movieFilename,
  movieInks,
  movieLayout,
  movieProgress,
  movieReceipt,
  movieSaving,
  paintMovieFrame,
} from "../src/movie.js";

const URL = "https://getravi.github.io/claude_imagine/app/#seed=314";

/** A pond, run on. */
function pond(seed, ticks) {
  const world = new World(makeConfig({ seed }));
  for (let i = 0; i < ticks; i++) world.step();
  return world;
}

/** The two live canvases, as the recorder sees them. */
const layers = (w = 900, h = 620) => ({
  pond: { id: "pond", width: w, height: h },
  names: { id: "names", width: w, height: h },
});

const captionFor = (world) =>
  pictureCaption(world, world.config, nameSpecies(world.phylogeny.species));

/** Paint one frame and hand back what was drawn. */
function painted(world, w = 900, h = 620) {
  const { ctx, ops } = recordingContext("movie");
  const l = layers(w, h);
  const layout = movieLayout(l.pond);
  paintMovieFrame(ctx, l, captionFor(world), pictureCredit(pictureAddress(URL)), layout);
  return { ops, layout };
}

// ---- the recording ----

test("a recording is a fixed length of pond, whatever machine it is made on", () => {
  // The whole reason the recording drives its own stepping rather than sampling
  // whatever the page drew. A GIF made on a slow laptop, a fast desktop and a
  // paused pond has to be the same two seconds of water, or the file is a
  // property of the viewer's hardware.
  assert.equal(MOVIE_STEPS, MOVIE_FRAMES * MOVIE_STEPS_PER_FRAME);
  assert.equal(MOVIE_SECONDS, (MOVIE_FRAMES * MOVIE_DELAY_CS) / 100);
  // Long enough to be an animation and short enough to send: between one and
  // four seconds. A five-second GIF of a pond is a file nobody waits for.
  assert.ok(MOVIE_SECONDS >= 1 && MOVIE_SECONDS <= 4, `${MOVIE_SECONDS}s`);
});

test("the frame delay is one a browser will honour", () => {
  // Players have clamped very short delays since the 1990s — most treat 0 and 1
  // as 10 — so a file asking for 100 frames a second plays at ten. Two is the
  // floor everything respects, and this asks for four.
  assert.ok(MOVIE_DELAY_CS >= 2, `${MOVIE_DELAY_CS} would be clamped`);
});

test("the pond moves at about the speed a watcher sees it move", () => {
  // A GIF that ran at four times life would be a different pond from the one on
  // the page. At 1× the page steps once a drawn frame at about 60 a second;
  // this is `MOVIE_STEPS_PER_FRAME` every `MOVIE_DELAY_CS` hundredths.
  const stepsPerSecond = MOVIE_STEPS_PER_FRAME / (MOVIE_DELAY_CS / 100);
  assert.ok(stepsPerSecond > 30 && stepsPerSecond < 90, `${stepsPerSecond} steps a second`);
});

test("the colour table fits the format", () => {
  assert.ok(MOVIE_COLORS >= 2 && MOVIE_COLORS <= GIF_MAX_COLORS);
});

test("the sampling stride is coprime with the width", () => {
  // The defect `test/gif.test.js` holds still: a stride is a step across
  // columns, so one that divides the width samples the same columns on every
  // row of every frame and builds a palette that has never seen most of the
  // picture. This is the assertion that catches it if either number moves.
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  assert.equal(gcd(MOVIE_WIDTH, MOVIE_SAMPLE_STRIDE), 1);
});

// ---- the poster ----

test("the poster keeps the pond's shape at every window size", () => {
  // A phone in portrait and a wide desktop hand this very different canvases.
  // The file is always `MOVIE_WIDTH` across, and the water inside it is never
  // stretched — a recording of a tall window is a tall recording.
  for (const [w, h] of [[900, 620], [344, 237], [1800, 1240], [600, 900]]) {
    const layout = movieLayout({ width: w, height: h });
    assert.equal(layout.width, MOVIE_WIDTH);
    assert.equal(layout.pondW, MOVIE_WIDTH);
    const drawn = layout.pondW / layout.pondH;
    assert.ok(Math.abs(drawn - w / h) < 0.01, `${w}x${h} came out ${drawn.toFixed(3)}`);
  }
});

test("the poster's height is its bands plus its water, and its landmarks agree", () => {
  const layout = movieLayout({ width: 900, height: 620 });
  const f = MOVIE_FRAME_BOX;
  const head = f.pad + MOVIE_TYPE.title + f.titleGap + MOVIE_TYPE.meta + f.pad;
  const foot = f.pad + MOVIE_TYPE.link + f.pad;
  assert.equal(layout.pondY, head);
  assert.equal(layout.footY, head + layout.pondH);
  assert.equal(layout.height, head + layout.pondH + foot);
  // The water is the great majority of the file: bands that took a third of
  // every frame would be a caption with a pond in it.
  assert.ok(layout.pondH / layout.height > 0.7, "the bands have taken over");
});

test("a canvas with no size falls back rather than dividing by zero", () => {
  for (const pondCanvas of [null, undefined, { width: 0, height: 0 }]) {
    const layout = movieLayout(pondCanvas);
    assert.equal(layout.width, MOVIE_WIDTH);
    assert.ok(layout.pondH > 0 && Number.isFinite(layout.pondH));
  }
});

test("both layers of the pond go into every frame, at the poster's size", () => {
  // v1.141's first finding, arriving on the second surface that composites this
  // page: the water is *two* canvases, and a recording of `#world` alone is a
  // recording of some coloured darts with nobody's name on them.
  const { ops, layout } = painted(pond(314, 600));
  const images = ops.filter((op) => op[1] === "drawImage");
  assert.equal(images.length, 2);
  assert.equal(images[0][2], "pond");
  assert.equal(images[1][2], "names");
  for (const op of images) {
    assert.deepEqual(op.slice(3), [0, layout.pondY, layout.pondW, layout.pondH]);
  }
});

test("the frame is painted in the order a printer would use", () => {
  const { ops } = painted(pond(314, 600));
  const names = ops.map((op) => op[1]);
  const plate = names.indexOf("fillRect");
  const water = names.indexOf("drawImage");
  const words = names.indexOf("fillText");
  assert.ok(plate < water, "the plate goes down before the water");
  assert.ok(water < words, "the words go on last");
});

test("the poster says the pond's name, its numbers and where it came from", () => {
  const world = pond(314, 900);
  const { ops } = painted(world);
  const written = ops.filter((op) => op[1] === "fillText").map((op) => op[2]);
  assert.equal(written.length, 3, "a name, its numbers, and an address");
  assert.equal(written[0], pondName(314).name);
  assert.equal(written[1], captionFor(world).meta);
  assert.equal(written[2], pictureCredit(pictureAddress(URL)));
  // The one line that says what this *is*: an address does not contain the word
  // Vivarium, and this is the surface that travels furthest from the page.
  assert.match(written[2], /^Vivarium · /);
});

test("the story sentence is the one thing left off the poster", () => {
  // The still picture carries a sentence about the pond. This file is two
  // seconds long, and a caption describing an instant would be a claim about a
  // frame that has already gone past by the time anybody reads it.
  const world = pond(314, 900);
  const { ops } = painted(world);
  const written = ops.filter((op) => op[1] === "fillText").map((op) => op[2]);
  assert.ok(!written.includes(captionFor(world).story));
});

test("the numbers on the poster are the numbers of the frame under them", () => {
  // The poster is repainted per captured frame rather than once at the start,
  // so the population and the step count count up with the water. This is the
  // property that makes that worth doing: two instants of one pond write
  // different rows.
  const world = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 200; i++) world.step();
  const early = painted(world).ops.filter((op) => op[1] === "fillText")[1][2];
  for (let i = 0; i < 400; i++) world.step();
  const later = painted(world).ops.filter((op) => op[1] === "fillText")[1][2];
  assert.notEqual(early, later);
  assert.match(early, /200 steps in/);
  assert.match(later, /600 steps in/);
});

test("the poster's own tones are the ones the colour table reserves", () => {
  // A palette chosen by population discards the rare, and the rarest thing in a
  // frame of two hundred thousand pixels is the writing. These three are in the
  // table whatever the census thinks — the two inks, and the plate they are
  // printed on, because the antialiased edge of a glyph is a blend of the two
  // and a table holding one end and not the other draws type with a halo.
  const tones = pictureCardTones();
  const inks = movieInks();
  assert.equal(inks.length, 3);
  assert.deepEqual(inks[0], [tones.ink.r, tones.ink.g, tones.ink.b]);
  assert.deepEqual(inks[1], [tones.dim.r, tones.dim.g, tones.dim.b]);
  assert.deepEqual(inks[2], [tones.plate.r, tones.plate.g, tones.plate.b]);
  for (const ink of inks) assert.ok(ink.every((v) => v >= 0 && v <= 255));
});

test("the reserved tones survive a table built from a pond", () => {
  // The same claim from the other end: build the census the way a recording
  // does — a dark, busy frame — and the three tones still come back exactly.
  const census = newCensus();
  const px = new Uint8ClampedArray(MOVIE_WIDTH * 200 * 4);
  for (let p = 0; p < px.length / 4; p++) {
    px[p * 4] = 6 + (p % 30);
    px[p * 4 + 1] = 10 + (p % 45);
    px[p * 4 + 2] = 28 + (p % 70);
    px[p * 4 + 3] = 255;
  }
  censusAdd(census, px, MOVIE_SAMPLE_STRIDE);
  const palette = buildPalette(census, MOVIE_COLORS, movieInks());
  for (const ink of movieInks()) {
    const i = nearestColour(palette, ink[0], ink[1], ink[2]);
    assert.deepEqual([palette[i * 3], palette[i * 3 + 1], palette[i * 3 + 2]], ink);
  }
});

test("the poster's ink clears the contrast bar on the plate it is printed on", () => {
  // `picture.test.js`'s claim, and it has to be made again rather than
  // inherited: the type here is smaller, and a smaller word on the same ground
  // is the case that fails first.
  const tones = pictureCardTones();
  assert.ok(contrastRatio(tones.ink, tones.plate) >= WCAG_AA_TEXT);
  assert.ok(contrastRatio(tones.dim, tones.plate) >= WCAG_AA_TEXT);
});

// ---- the words around it ----

test("the filename is a string an operating system will take", () => {
  for (const seed of [314, 0, 4294967295, 1837465]) {
    const world = pond(seed, 120);
    const name = movieFilename(world.config, world);
    assert.match(name, /^vivarium-[a-z0-9-]+-\d+-steps\.gif$/, name);
    assert.ok(!/--/.test(name), name);
  }
});

test("two recordings of one pond are two files", () => {
  const world = pond(314, 300);
  const first = movieFilename(world.config, world);
  for (let i = 0; i < MOVIE_STEPS; i++) world.step();
  assert.notEqual(first, movieFilename(world.config, world));
});

test("the button says how far along it is rather than only that it is working", () => {
  assert.equal(movieProgress(0, 48), `${MOVIE_MARK} Recording… 0%`);
  assert.equal(movieProgress(24, 48), `${MOVIE_MARK} Recording… 50%`);
  assert.equal(movieProgress(48, 48), `${MOVIE_MARK} Recording… 100%`);
  assert.equal(movieSaving(12, 48), `${MOVIE_MARK} Saving… 25%`);
  // Past the end, and against nothing: a label is never allowed to read 4800%.
  assert.equal(movieProgress(99, 48), `${MOVIE_MARK} Recording… 100%`);
  assert.equal(movieProgress(1, 0), `${MOVIE_MARK} Recording… 0%`);
  assert.equal(MOVIE_LABEL, `${MOVIE_MARK} Make a GIF`);
});

test("a file size is a thing a person reads", () => {
  assert.equal(fileSize(0), "0 KB");
  assert.equal(fileSize(-5), "0 KB");
  assert.equal(fileSize(400), "1 KB", "nothing rounds down to nothing");
  assert.equal(fileSize(840_000), "840 KB");
  assert.equal(fileSize(1_800_000), "1.8 MB");
  assert.equal(fileSize(12_400_000), "12.4 MB");
});

test("the receipt names the pond and how big the thing it just made is", () => {
  // The picture's rule — a press whose effect lands in a downloads folder needs
  // to say so in words — plus one this file needs and the picture did not: a
  // GIF is the largest thing this page has ever handed anybody, and somebody
  // about to send it to a friend has a right to know that before they do.
  const line = movieReceipt(314, 1_800_000);
  assert.ok(line.startsWith(MOVIE_MARK));
  assert.ok(line.includes(pondName(314).name), line);
  assert.ok(line.includes("1.8 MB"), line);
  assert.ok(line.includes(MOVIE_SECONDS.toFixed(1)), line);
  assert.ok(!/\bfile\b|\.gif|download/i.test(line), line);
});

// ---- directive 2 ----

test("painting a frame draws no random number and moves nothing", () => {
  // The poster is painted forty-eight times a recording, which is forty-eight
  // chances to disturb a world. A seed that reproduced a different pond
  // depending on whether anybody had made a GIF of it would be the worst
  // version of that bug there is.
  const world = pond(314, 800);
  const before = stateFingerprint(world);
  const draws = drawStream(world.rng);
  for (const [w, h] of [[900, 620], [344, 237]]) painted(world, w, h);
  assert.equal(draws.count, 0);
  assert.equal(stateFingerprint(world), before);
});

test("a recording steps the pond the pond's own way", () => {
  // The one thing this press does that the still picture does not: it advances
  // the world. That has to be exactly the stepping the play button does, or a
  // recorded pond and a watched one diverge — so the assertion is that
  // `MOVIE_STEPS` plain steps land on the same state as any other route to the
  // same tick.
  const recorded = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 500; i++) recorded.step();
  for (let f = 0; f < MOVIE_FRAMES; f++) {
    for (let i = 0; i < MOVIE_STEPS_PER_FRAME; i++) recorded.step();
  }
  const watched = pond(314, 500 + MOVIE_STEPS);
  assert.equal(stateFingerprint(recorded), stateFingerprint(watched));
  assert.equal(recorded.tick, watched.tick);
});
