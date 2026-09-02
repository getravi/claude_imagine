// movie.js — the pond, moving, as a file you can send somebody.
//
// v1.141 shipped `📸 Take a picture` and its devlog entry ended on the thing
// that press cannot do: **a still of this page is a still of some dots.**
// Everything Vivarium is actually about happens over time — a dart turning
// toward food, a hunter cutting a line through a shoal, the crowd thinning as
// winter arrives. A photograph carries none of it, and neither does a
// paragraph. The pond has to *move* in the thing that leaves the page, or the
// person on the other end is being asked to take the interesting part on trust.
//
// So: `🎞 Make a GIF`. Two seconds of this pond, looping, in a file that plays
// itself in every chat window, feed and phone gallery on earth without anybody
// choosing to press play. `src/gif.js` is the encoder — written from nothing,
// because the house rule is zero dependencies — and this module is the part
// that knows it is a pond: how long a recording runs, what the poster around it
// says, and what to call the file.
//
// **Three decisions worth writing down.**
//
// 1. **The recording drives its own stepping.** A GIF made by sampling
//    whatever the page happened to draw would be a different length of pond on
//    a fast machine than on a slow one, and a *nothing* on a paused one. So a
//    recording steps the world itself — `MOVIE_STEPS_PER_FRAME` a frame,
//    `MOVIE_FRAMES` frames — exactly as `⏩ Skip ahead` does, for exactly the
//    same reason: **a press should go the same distance for everybody.**
//
// 2. **It records what is on screen, not a tidy version of it.** Same camera,
//    same zoom, same follow, same name plates. If the visitor is watching one
//    creature at 4×, that is what the file shows. A share that quietly pulled
//    back to a wide shot would hand a stranger a picture of somewhere the
//    sender has not been — `picture.js`'s rule, and it matters more here,
//    because a recording is longer and the reframing would be more obviously
//    not theirs.
//
// 3. **The poster is the still picture's, shrunk.** A name in large type, the
//    numbers under it, the project and its address beneath the water. Same
//    words from `pictureCaption`, same tones, so the two files this page can
//    hand out are recognisably from the same place. The story sentence is the
//    one thing left off: a caption that describes the pond is a claim about an
//    instant, and this file is two seconds long.
//
// Determinism: PURE OBSERVER, like every module in this corner. The words are
// functions of a world, the layout is arithmetic, and nothing here draws a
// random number. Stepping the pond during a recording is the pond's own
// stepping — the same one the play button does — so a recorded pond and a
// watched one are bit-for-bit the same pond.

import { pictureCard, pictureCardTones } from "./palette.js";
import { PICTURE_CREDIT, pictureFont } from "./picture.js";
import { pondName } from "./pondname.js";

/** The mark the moving picture wears wherever it is offered. */
export const MOVIE_MARK = "🎞";

/**
 * How wide the file is, in pixels.
 *
 * The still picture is the pond's own width — 900 px and not one pixel
 * resampled — because a photograph that softened on its way out would be the
 * one defect nobody could unsee. A GIF cannot afford that: every pixel is paid
 * for `MOVIE_FRAMES` times over, and 900 px of pond across forty frames is a
 * file measured in tens of megabytes, which is not a thing anybody sends
 * anybody. 480 is the width a phone shows at full size in a chat thread, and
 * it is a bit over half the pond's, so the darts stay darts.
 */
export const MOVIE_WIDTH = 480;

/** How many frames a recording captures. */
export const MOVIE_FRAMES = 48;

/**
 * Hundredths of a second each frame is held: the format's own unit.
 *
 * 4 is 25 frames a second, which is the fastest a GIF is reliably played —
 * browsers famously clamp anything under 2, and several clamp 1 to 10. So the
 * loop is `MOVIE_FRAMES × 4 / 100` seconds long, just under two.
 */
export const MOVIE_DELAY_CS = 4;

/**
 * How far the pond moves between captured frames.
 *
 * At 25 frames a second, two steps a frame is fifty steps of pond a second
 * against the sixty a watcher sees at 1× — near enough that the file looks
 * like the page, which is the whole requirement. It also makes a recording
 * `MOVIE_FRAMES × 2` steps of pond time: a fixed distance, the same on every
 * machine.
 */
export const MOVIE_STEPS_PER_FRAME = 2;

/**
 * How many colours the file's one shared table holds.
 *
 * **Measured through the button itself, six times, on seed 314.** The finished
 * file comes to 1.36 MB at 32 colours, 1.67 at 64, 1.89 at 96, 2.02 at 128,
 * 2.15 at 192 and 2.23 at 256. The curve flattens as it climbs — the last
 * doubling of the table costs 10% more file — so the question is only how far
 * down it is safe to go, and that is answered by looking at the pictures rather
 * than at the numbers: **at 32 every animal in the pond is grey.** Hue is the
 * family badge in this water, a table that small spends its entries on the
 * biome, and a recording in which two lineages are the same colour has lost the
 * one thing the pond uses colour to say. 64 holds the hues and 128 is where I
 * stopped being able to see the difference, so 128 it is, at two megabytes —
 * which is an ordinary size for a thing people send each other.
 *
 * Encoding time is flat across all six, because the nearest-colour search is
 * answered from a cache and a wider table only makes the misses slower.
 */
export const MOVIE_COLORS = 128;

/**
 * The tones the poster's words are printed in, reserved in the colour table
 * before the census gets a vote.
 *
 * Three: the name's ink, the dim grey of the numbers under it, and the plate
 * both are printed on — which is here because the antialiased edge of every
 * glyph is a blend between an ink and that plate, and a table holding one end
 * of that blend and not the other renders type with a halo.
 *
 * **This is insurance rather than a repair, and the distinction is worth
 * keeping straight.** It was written in a hurry because a colour sweep appeared
 * to show the caption vanishing below 128 — and the caption was missing from
 * those pictures because *the sweep did not draw one*. A harness that
 * re-implements the thing it is measuring measures the re-implementation; the
 * numbers above come from pressing the actual button. What the scare did leave
 * behind is a real property: the pond's name is a few hundred pale pixels in a
 * frame of two hundred thousand, a palette chosen by population is precisely
 * the algorithm that discards the rare, and nothing but this guarantees the
 * words survive a pond busier than any I sampled.
 */
export function movieInks() {
  const t = pictureCardTones();
  return [
    [t.ink.r, t.ink.g, t.ink.b],
    [t.dim.r, t.dim.g, t.dim.b],
    [t.plate.r, t.plate.g, t.plate.b],
  ];
}

/**
 * Sample every nth pixel when building the palette.
 *
 * The palette is a summary of about ten million pixels; a seventh of them is
 * the same summary. Every bucket that earns a table entry has thousands of
 * members and none of them is lost to a stride this size.
 *
 * **Seven, not six, and the difference is not taste.** A frame is a row-major
 * buffer, so a stride is a step across *columns* — and if it divides the width
 * it lands in the same columns on every row of every frame. Six divides 480
 * exactly: the census would have seen 80 columns of the pond, the same 80,
 * forty-eight times, and built a palette with no opinion at all about the other
 * four hundred. Seven is coprime with the width, so the sample walks across the
 * picture. `test/gif.test.js` holds that failure still, and
 * `test/movie.test.js` asserts the two numbers stay coprime — because the day
 * somebody widens the file is the day a stride quietly starts dividing it.
 */
export const MOVIE_SAMPLE_STRIDE = 7;

/**
 * The poster's type, in the file's own pixels — smaller than the still
 * picture's because the file is smaller. The name still dominates: in a feed,
 * a caption is one word loud enough to read and a paragraph nobody read.
 */
export const MOVIE_TYPE = Object.freeze({ title: 18, meta: 10, link: 9 });

/** The poster's spacing, in the same units. */
export const MOVIE_FRAME_BOX = Object.freeze({ pad: 12, titleGap: 6, rule: 1 });

/** How long the finished loop runs, in seconds. */
export const MOVIE_SECONDS = (MOVIE_FRAMES * MOVIE_DELAY_CS) / 100;

/** How many steps of pond a recording covers. */
export const MOVIE_STEPS = MOVIE_FRAMES * MOVIE_STEPS_PER_FRAME;

/**
 * Where everything goes, given the live canvas the water is copied from.
 *
 * The width is fixed and the pond's height follows its aspect ratio, so a
 * recording of a tall phone window and a wide desktop one both come out
 * `MOVIE_WIDTH` across and neither is stretched.
 *
 * @param {{width:number, height:number}} pond the live canvas
 * @returns {{width:number, height:number, pondY:number, pondW:number,
 *            pondH:number, footY:number}}
 */
export function movieLayout(pond) {
  const f = MOVIE_FRAME_BOX;
  const pondW = MOVIE_WIDTH;
  const ratio = pond && pond.width > 0 ? pond.height / pond.width : 620 / 900;
  const pondH = Math.max(1, Math.round(pondW * ratio));
  const head = f.pad + MOVIE_TYPE.title + f.titleGap + MOVIE_TYPE.meta + f.pad;
  const foot = f.pad + MOVIE_TYPE.link + f.pad;
  return {
    width: pondW,
    height: head + pondH + foot,
    pondY: head,
    pondW,
    pondH,
    footY: head + pondH,
  };
}

/**
 * Paint one frame of the poster onto a context sized to `layout`.
 *
 * Called once per captured frame, which is the reason the bands are redrawn
 * rather than composited from a cached strip: text is cheap to draw and a
 * second canvas to keep in step is not. The order is `picture.js`'s — plate,
 * water, names, rules, words — so the water goes down before the hairlines and
 * a rule sits *on* the pond's edge.
 *
 * @param {object} ctx the destination 2D context
 * @param {{pond:object, names:object|null}} layers the live canvases
 * @param {{title:string, meta:string}} caption from `pictureCaption`
 * @param {string} credit from `pictureCredit`
 * @param {object} layout from `movieLayout`
 */
export function paintMovieFrame(ctx, layers, caption, credit, layout) {
  const card = pictureCard();
  const f = MOVIE_FRAME_BOX;

  ctx.fillStyle = card.plate;
  ctx.fillRect(0, 0, layout.width, layout.height);

  // The one place this file resamples: the pond arrives at whatever size the
  // visitor's window made it and leaves at `MOVIE_WIDTH`.
  ctx.drawImage(layers.pond, 0, layout.pondY, layout.pondW, layout.pondH);
  if (layers.names) ctx.drawImage(layers.names, 0, layout.pondY, layout.pondW, layout.pondH);

  ctx.fillStyle = card.rule;
  ctx.fillRect(0, layout.pondY - f.rule, layout.width, f.rule);
  ctx.fillRect(0, layout.footY, layout.width, f.rule);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = card.ink;
  ctx.font = pictureFont(MOVIE_TYPE.title, 1, 700);
  ctx.fillText(caption.title, f.pad, f.pad + MOVIE_TYPE.title * 0.8);

  ctx.fillStyle = card.dim;
  ctx.font = pictureFont(MOVIE_TYPE.meta, 1);
  ctx.fillText(caption.meta, f.pad, f.pad + MOVIE_TYPE.title + f.titleGap + MOVIE_TYPE.meta * 0.8);

  ctx.font = pictureFont(MOVIE_TYPE.link, 1);
  ctx.fillText(credit, f.pad, layout.footY + f.pad + MOVIE_TYPE.link * 0.8);
}

/**
 * A filename a person can find again — `picture.js`'s, with a different
 * extension and the same reasoning: the pond's *name* leads, because that is
 * what the visitor will remember, and the step count tells two recordings of
 * one pond apart in a downloads folder.
 */
export function movieFilename(config, world) {
  const slug = pondName(config.seed)
    .name.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `vivarium-${slug || "pond"}-${world.tick}-steps.gif`;
}

/**
 * The button's label while a recording is running.
 *
 * A percentage rather than a spinner, for `skipProgress`'s reason: this press
 * takes a couple of seconds and a control that only says *working* is a
 * control a visitor presses again.
 */
export function movieProgress(done, total) {
  const pct = total > 0 ? Math.round((Math.min(done, total) / total) * 100) : 0;
  return `${MOVIE_MARK} Recording… ${pct}%`;
}

/** The label while the frames are being turned into a file. */
export function movieSaving(done, total) {
  const pct = total > 0 ? Math.round((Math.min(done, total) / total) * 100) : 0;
  return `${MOVIE_MARK} Saving… ${pct}%`;
}

/** The label at rest. */
export const MOVIE_LABEL = `${MOVIE_MARK} Make a GIF`;

/**
 * A file size a person reads rather than parses: `1.8 MB`, `840 KB`.
 *
 * It is on the receipt because a GIF is the largest thing this page has ever
 * handed anybody, and somebody about to send it to a friend on a train has a
 * right to know that before they do.
 */
export function fileSize(bytes) {
  if (!(bytes > 0)) return "0 KB";
  if (bytes < 1000 * 1000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/**
 * The receipt.
 *
 * It names the pond rather than the file, for the postcard's and the picture's
 * reason: this is a press whose whole effect lands somewhere the visitor
 * cannot see, and *saved* on its own is a claim they have to take on faith.
 */
export function movieReceipt(seed, bytes) {
  const { name } = pondName(seed);
  return `${MOVIE_MARK} Saved ${MOVIE_SECONDS.toFixed(1)}s of ${name} (${fileSize(bytes)}).`;
}

/** What the file is called in a sentence, for the guide and the placard. */
export const MOVIE_CREDIT = PICTURE_CREDIT;
