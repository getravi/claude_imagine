// picture.test.js — the pond as a thing you can post (v1.141).
//
// The claims divide the way the module does. Some are about the words, and are
// the ones a future release breaks by adding a clause to the headline. The rest
// are about the painting, and they exist because `render.js` had no test at all
// for its first fifty releases for exactly one reason — a canvas — which v1.50
// answered with `rendershot.js`: a context that paints nothing and remembers
// everything. Anything drawn can be asserted about without a browser, and this
// module is a hundred lines of drawing.
//
// Three of them are the ones I would want a stranger to check first: the inks
// clear the contrast bar on the ground they are actually used on, the press
// draws no random number, and the filename is a string an operating system will
// take.
//
// The claim this file cannot make is that the picture is *nice*. It knows the
// water is composited once, at the right origin, under a name and over an
// address. Whether anybody wants to post it is a question for a browser and a
// pair of eyes, and it was asked there.

import test from "node:test";
import assert from "node:assert/strict";

import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { nameSpecies } from "../src/speciesnames.js";
import { drawStream, stateFingerprint } from "../src/fingerprint.js";
import { recordingContext } from "../src/rendershot.js";
import { pondName } from "../src/pondname.js";
import { contrastRatio, pictureCardTones, WCAG_AA_TEXT } from "../src/palette.js";
import { ENDED_LINE } from "../src/postcard.js";
import {
  PICTURE_CREDIT,
  PICTURE_FRAME,
  PICTURE_STORY_LINES,
  PICTURE_TYPE,
  paintPicture,
  pictureAddress,
  pictureCaption,
  pictureCredit,
  pictureFilename,
  pictureLayout,
  wrapText,
} from "../src/picture.js";

const URL = "https://getravi.github.io/claude_imagine/app/#seed=314";

/** A pond, run on. */
function pond(seed, ticks) {
  const world = new World(makeConfig({ seed }));
  for (let i = 0; i < ticks; i++) world.step();
  return world;
}

/** The caption, with the lineage names the app would hand it. */
function captionFor(world) {
  return pictureCaption(world, world.config, nameSpecies(world.phylogeny.species));
}

/**
 * A stand-in for the two live canvases. The recorder logs a drawn image by its
 * `id`, which is all the assertions below need — the question asked of a
 * composite is *which surfaces went down, where, and in what order*, and the
 * pixels in them are somebody else's test.
 */
const layers = (scale = 1) => ({
  pond: { id: "pond", width: 900 * scale, height: 620 * scale },
  names: { id: "names", width: 900 * scale, height: 620 * scale },
});

/**
 * A run, sampled. Every fiftieth step from the first hundred on — `here.js` and
 * `postcard.js` both paid for the alternative, and the note is the same one:
 * **the end of a run is the most biased instant there is**, and a picture taken
 * there is a picture of a pond that has had every chance to lose its champion.
 */
function* sampled(seed, ticks = 3000, every = 50) {
  const world = new World(makeConfig({ seed }));
  for (let i = 0; i < ticks; i++) {
    world.step();
    if (i >= 100 && i % every === 0) yield world;
  }
}

// ---- the words ----

test("the picture names the pond the plate names, on the seed the plate shows", () => {
  // v1.134's rule, and it matters more here than anywhere: this is the one
  // surface that leaves the page, so it is the only one a reader cannot check
  // against the thing beside it.
  for (const seed of [314, 0, 1, -1, 4294967295]) {
    const caption = captionFor(pond(seed, 200));
    const { name, seed: normalised } = pondName(seed);
    assert.equal(caption.title, name);
    assert.ok(caption.meta.startsWith(`seed ${normalised} · `), caption.meta);
  }
});

test("the numbers under the name say the pond has turned over, once it has", () => {
  // The generation clause is the only thing in that row saying the animals in
  // the water are not the ones that were put there — and it is absent rather
  // than zero on a pond too young to have any, for the postcard's rule 3.
  assert.equal(captionFor(pond(314, 0)).meta, "seed 314 · 0 steps in · 40 alive");
  const grown = captionFor(pond(314, 1200)).meta;
  assert.match(grown, /^seed 314 · 1,200 steps in · [\d,]+ alive · \d+ generations$/);
});

test("an empty pond is not told to press Reset", () => {
  // The postcard's finding, arriving on a second surface: *Everything here has
  // died. Press ↻ Reset to start the pond over* is advice for somebody holding
  // a keyboard, and a keyboard is what the person looking at a PNG has least of
  // all. It says what happened instead, in the postcard's own words — one
  // sentence, one place, so the two exports cannot drift apart.
  const world = pond(314, 600);
  for (const c of world.creatures) c.dead = true;
  world.creatures.length = 0;
  const caption = captionFor(world);
  assert.equal(caption.story, ENDED_LINE);
  assert.ok(!/Press /.test(caption.story), caption.story);
  assert.match(caption.meta, / · nothing alive/);
});

test("the address loses its scheme and nothing else", () => {
  // `https://` is four characters of nothing to a reader and the only line on
  // the picture competing with the pond for attention. A URL that does not
  // parse is left exactly as it came rather than dropped: the worst possible
  // failure here is a picture with no way back to the pond on it.
  assert.equal(pictureAddress(URL), "getravi.github.io/claude_imagine/app/#seed=314");
  assert.equal(pictureAddress("http://localhost:8000/app/"), "localhost:8000/app");
  assert.equal(pictureAddress("some pond"), "some pond");
  assert.equal(pictureAddress(""), "");
});

// ---- the wrapping ----

test("a sentence is broken where it fits, not where it is convenient", () => {
  // Measured rather than counted, because the caption is a sentence the pond
  // composed: two lines of the same character count are not the same width.
  const { ctx } = recordingContext("measure");
  ctx.font = "400 15px sans-serif";
  const text = "One family is running away with the pond and nothing else is close to it";
  const lines = wrapText(ctx, text, 400);
  assert.ok(lines.length > 1, "nothing wrapped");
  for (const line of lines) assert.ok(ctx.measureText(line).width <= 400, line);
  assert.equal(lines.join(" "), text, "a word went missing or moved");
});

test("the caption is capped, and the cap is a real cut", () => {
  // `headline.js` writes for a card that can be as tall as it likes. A picture
  // is looked at rather than read, so the caption stops rather than growing —
  // and the test that matters is that a word too long for a line of its own
  // does not spin the wrapper or vanish.
  const { ctx } = recordingContext("measure");
  ctx.font = "400 15px sans-serif";
  const many = new Array(200).fill("pond").join(" ");
  const cut = wrapText(ctx, many, 200);
  assert.equal(cut.length, PICTURE_STORY_LINES);
  // And it says it was cut. The first build of this returned the lines it had
  // and dropped the rest, which reads as a sentence that broke rather than one
  // that was shortened.
  assert.ok(cut[cut.length - 1].endsWith("…"), cut[cut.length - 1]);
  const huge = "antidisestablishmentarianism";
  assert.deepEqual(wrapText(ctx, huge, 10), [huge]);
  assert.deepEqual(wrapText(ctx, "", 200), []);
});

// ---- the painting ----

test("the picture is exactly as wide as the pond's own pixels", () => {
  // The water is never resampled. A share that softened the picture on its way
  // out would be the one defect nobody could unsee, and it would be invisible
  // to every other test here.
  const { ctx } = recordingContext("picture");
  const l = layers(2);
  const caption = captionFor(pond(314, 800));
  const layout = pictureLayout(ctx, l.pond, caption, pictureAddress(URL), 2);
  assert.equal(layout.width, l.pond.width);
  assert.equal(layout.footY - layout.pondY, l.pond.height);
  assert.ok(layout.headHeight > 0 && layout.height > layout.footY, JSON.stringify(layout));
  // The bands are furniture, not the subject: on a default pond they are a
  // small fraction of the picture rather than a frame around a stamp.
  const bands = layout.height - l.pond.height;
  assert.ok(bands < l.pond.height / 2, `${bands}px of bands`);
});

test("the water and the names go down once each, at the pond's own origin", () => {
  // The composite. `#names` is a second canvas over `#world` and a picture of
  // the water alone would drop every name plate — the one mark on this page
  // that turns a dot into somebody, and the reason a stranger looks twice.
  const { ctx, ops } = recordingContext("picture");
  const l = layers();
  const caption = captionFor(pond(314, 800));
  const layout = pictureLayout(ctx, l.pond, caption, pictureAddress(URL), 1);
  paintPicture(ctx, l, caption, pictureAddress(URL), layout);
  const drawn = ops.filter((o) => o[1] === "drawImage");
  assert.deepEqual(
    drawn.map((o) => [o[2], o[3], o[4]]),
    [
      ["pond", 0, layout.pondY],
      ["names", 0, layout.pondY],
    ]
  );
});

test("a pond with no name layer is still a picture", () => {
  // The landing page's hero attaches no name layer, and neither does any test
  // that does not ask for one. An optional layer that threw would make this
  // feature a property of one page's markup.
  const { ctx, ops } = recordingContext("picture");
  const l = layers();
  const caption = captionFor(pond(314, 400));
  const layout = pictureLayout(ctx, l.pond, caption, "", 1);
  paintPicture(ctx, { pond: l.pond, names: null }, caption, "", layout);
  assert.equal(ops.filter((o) => o[1] === "drawImage").length, 1);
  // And a pond with nowhere to point still signs itself: a picture opened from
  // a file came from somewhere, and the line that says where is the only thing
  // on it naming the project at all.
  const signed = ops.filter((o) => o[1] === "fillText").map((o) => o[2]);
  assert.equal(signed[signed.length - 1], PICTURE_CREDIT);
  assert.equal(pictureCredit(pictureAddress(URL)), `${PICTURE_CREDIT} · ${pictureAddress(URL)}`);
});

test("every word lands in a band, and none of it over the water", () => {
  // The failure this is written for is the one that costs a release: a caption
  // that fits at one device pixel ratio and lies across the pond at another.
  // Both are walked, because the picture is measured in backing-store pixels
  // and the type in CSS pixels, and the whole layout is that conversion.
  for (const scale of [1, 2]) {
    const { ctx, ops } = recordingContext("picture");
    const l = layers(scale);
    const caption = captionFor(pond(80808, 900));
    const address = pictureAddress(URL);
    const layout = pictureLayout(ctx, l.pond, caption, address, scale);
    paintPicture(ctx, l, caption, address, layout);
    const words = ops.filter((o) => o[1] === "fillText");
    assert.equal(words.length, 2 + layout.story.length + 1, "a line went missing");
    const pad = PICTURE_FRAME.pad * scale;
    for (const [, , text, x, y] of words) {
      assert.equal(x, pad, `${text} is not on the margin`);
      const inHead = y > 0 && y <= layout.headHeight;
      const inFoot = y > layout.footY && y <= layout.height;
      assert.ok(inHead || inFoot, `"${text}" at y=${y} is over the water`);
      assert.ok(
        x + ctx.measureText(text).width <= layout.width - pad / 2,
        `"${text}" runs off the edge`
      );
    }
  }
});

test("the name is the loudest thing on the picture", () => {
  // A picture is read from across a scrolling feed, where a caption is one word
  // loud enough to see and a paragraph nobody saw. The pond's name is that
  // word, and the ordering is pinned here because it is the whole design and
  // one careless edit to `PICTURE_TYPE` undoes it.
  assert.ok(PICTURE_TYPE.title > PICTURE_TYPE.story, "the story out-shouts the name");
  assert.ok(PICTURE_TYPE.story > PICTURE_TYPE.meta, "the numbers out-shout the sentence");
  assert.ok(PICTURE_TYPE.meta > PICTURE_TYPE.link, "the address out-shouts the numbers");
});

// ---- the three a stranger should check first ----

test("both inks clear the contrast bar on the plate they are used on", () => {
  // v1.140's lesson, one release old: *an ink is only quiet enough on the
  // grounds it was measured on*, and the postcard's dialog found `--ink-faint`
  // at 4.45 against a 4.5 bar. This ground is new, so it inherits nothing — and
  // a picture gets resized by whoever reposts it, so the bar is cleared with
  // room rather than by a hundredth.
  const t = pictureCardTones();
  assert.ok(contrastRatio(t.ink, t.plate) >= WCAG_AA_TEXT * 2, contrastRatio(t.ink, t.plate));
  assert.ok(contrastRatio(t.dim, t.plate) >= WCAG_AA_TEXT, contrastRatio(t.dim, t.plate));
  // And the hierarchy the design depends on: the numbers are quieter than the
  // name, not merely different from it.
  assert.ok(contrastRatio(t.ink, t.plate) > contrastRatio(t.dim, t.plate));
});

test("taking a picture draws no random numbers and moves nothing", () => {
  // Directive 2. A seed that reproduced a different pond depending on whether
  // anybody had taken a photograph of it would be the worst version of that bug
  // there is — worse than the postcard's, because this press is the one a
  // visitor makes when they like what they are looking at.
  const world = pond(314, 800);
  const before = stateFingerprint(world);
  const draws = drawStream(world.rng);
  for (const scale of [1, 2]) {
    const { ctx } = recordingContext("picture");
    const l = layers(scale);
    const caption = captionFor(world);
    const layout = pictureLayout(ctx, l.pond, caption, pictureAddress(URL), scale);
    paintPicture(ctx, l, caption, pictureAddress(URL), layout);
  }
  assert.equal(draws.count, 0);
  assert.equal(stateFingerprint(world), before);
});

test("the filename is a string an operating system will take", () => {
  // A lineage name is a string this simulation composed and a filename is a
  // thing a filesystem parses. Everything outside `a-z 0-9` becomes a hyphen,
  // and the pond's name leads because that is what the visitor will remember —
  // the step count is only there so two pictures of one pond are two files.
  for (const world of sampled(314, 400, 100)) {
    const name = pictureFilename(world.config, world);
    assert.match(name, /^vivarium-[a-z0-9-]+-\d+-steps\.png$/, name);
    assert.ok(!name.includes("--"), name);
  }
  const world = pond(314, 1234);
  assert.ok(pictureFilename(world.config, world).includes(String(world.tick)));
});

// ---- and the whole thing, standing in a real run ----

test("a picture taken at any moment of a run has all four of its lines", () => {
  // The claim the module is actually for: at whatever instant a visitor likes
  // what they see, there is a name, a row of numbers, a sentence that fits, and
  // an address. Sampled rather than taken at the end, for the reason at the top.
  const { ctx } = recordingContext("picture");
  const address = pictureAddress(URL);
  for (const world of sampled(80808)) {
    const caption = captionFor(world);
    assert.ok(caption.title.length > 0 && caption.meta.length > 0);
    assert.match(caption.story, /[.!]$/);
    assert.ok(!/[<>]/.test(caption.story), caption.story);
    const layout = pictureLayout(ctx, layers(2).pond, caption, address, 2);
    assert.ok(layout.story.length >= 1 && layout.story.length <= PICTURE_STORY_LINES);
  }
});
