// herofit.js — how big the front door's pond should be, given the window it has
// to live in.
//
// This is the third attempt to walk `index.html`. v1.87 measured the app's five
// absolutely positioned marks and found three of them placed against a container
// that is wider than the picture; it closed by noting that "the splash page has
// four absolutely positioned marks and has never been walked at all". v1.88 went
// to walk them and never arrived (the page was hiding 92% of itself). v1.100
// went again and never arrived (the page did not fit a phone). The prediction in
// `docs/AUTONOMOUS.md` was that a third walk would be interrupted too.
//
// It was, and this time the marks themselves are the null. Measured in a
// headless Chromium at nine viewports from 320×568 to 1920×1080, every mark on
// the front door sits exactly where it claims to: `#hero-canvas` and
// `.hero::before` are `inset: 0` inside a `.hero` that *is* the picture (0.00 px
// on all four sides at every width), `.showcase .overlay` is `inset: 0` inside
// an `<a>` that wraps nothing but its own `<img>` (1.00 px all round, which is
// the border), and `.scroll-cue` is centred to within 0.01 px everywhere.
// v1.87's bug cannot happen here, and the reason is structural rather than
// lucky: the app's marks live in a `.stage` that is a *container* for the pond,
// and every one of the front door's lives in a box that has no contents but the
// picture. A container that holds only the picture cannot be wider than it.
//
// What the walk was interrupted by is the picture itself. `#hero-canvas` is
// `object-fit: cover` over a simulation whose size is two constants in
// `splash.js` — `SW = 1280`, `SH = 760` — and a hero box is `100svh` tall and as
// wide as the window, so the two aspect ratios agree on no device at all. What a
// visitor sees of the pond, measured:
//
//     320×568   24.8%      1024×768    76.0%
//     360×780   27.4%      1280×800    91.4%
//     390×844   27.4%      1440×900    95.0%
//     430×932   27.4%      1920×1080   94.7%
//     768×1024  44.5%
//
// Not one viewport shows the whole thing, and a phone shows a quarter of it. The
// page's own subhead reads "the background behind these words is not a video —
// it's a real ecosystem of neural creatures, evolving in your browser as you
// read", which is true, and on the device most visitors arrive on three-quarters
// of that ecosystem is outside the window. It is also three-quarters of the
// tick's work, done every frame, on the hardware least able to pay for it.
//
// The fix is not a different `object-fit`: `contain` letterboxes a full-bleed
// hero and `fill` distorts a world whose distances this project publishes to
// three decimal places. The fix is to stop choosing the pond's aspect ratio in
// advance. `heroFit` sizes the world to the box it will be drawn into, which
// makes `cover` crop nothing, and scales it by a factor with two clamps that are
// both derived rather than picked:
//
//   - **A ceiling on the area**, `HERO_AREA` — the 1280 × 760 the hero's food and
//     population densities were tuned against, and which `splash.js` already
//     divides by to get them. Above it (a desktop) the world is scaled down to
//     fit the budget and drawn magnified; the tick never costs more than it
//     costs today.
//   - **A floor on the shorter side**, `SIGHT_DIAMETERS × visionRadius`. The
//     world is a torus, so a pond shorter than the diameter of a sense disc
//     wraps that disc onto itself and a creature sees the back of its own head.
//     At 168 px that floor is 336, and it binds on a small phone (320 px) and
//     nowhere else.
//
// Both clamps scale *uniformly*, so the aspect ratio survives them and the crop
// stays zero either way. Under the ceiling and over the floor — every phone,
// every tablet, every laptop up to about 1280 × 760 — the magnification is
// exactly 1 and a creature is drawn at the size the pond thinks it is.
//
// Pure arithmetic: no world state, no DOM, no random numbers, and nothing in the
// app imports it. The default 900 × 620 pond is untouched by construction.

/**
 * The simulated area the hero's densities were tuned at, in world px².
 *
 * `splash.js` has scaled `foodStart`, `foodMax`, `foodSpawnRate`,
 * `populationStart` and `populationMax` by `(SW × SH) / (900 × 620)` since the
 * hero existed, so the pond's *area* — not its width, and not its height — is
 * the number those five constants are a function of. Holding it as a ceiling is
 * what lets the shape move without re-tuning anything.
 */
export const HERO_AREA = 1280 * 760;

/** The aspect ratio to fall back on when the box cannot be measured. */
export const HERO_FALLBACK = Object.freeze({ width: 1280, height: 760 });

/**
 * How many vision diameters must fit across the shorter side of a torus.
 *
 * One. A sense disc of radius r spans 2r, and a world shorter than that wraps
 * the disc onto itself — the same creature answers its own query from the far
 * edge. This is a floor on the *geometry*, not a taste: below it the pond stops
 * being able to represent a distance.
 */
export const SIGHT_DIAMETERS = 1;

/**
 * The pond to simulate for a hero box of a given size.
 *
 * @param {number} boxW the canvas's laid-out width, in CSS pixels
 * @param {number} boxH the canvas's laid-out height, in CSS pixels
 * @param {{area?: number, visionRadius?: number}} [opts]
 * @returns {{width: number, height: number, magnify: number, area: number,
 *   clamp: "none"|"area"|"sight"}} the world's size in pixels, the factor
 *   `object-fit: cover` will then draw it by, its area, and which clamp (if
 *   either) decided the scale.
 */
export function heroFit(boxW, boxH, opts = {}) {
  const area = opts.area ?? HERO_AREA;
  const visionRadius = opts.visionRadius ?? 168;
  if (!Number.isFinite(boxW) || !Number.isFinite(boxH) || boxW <= 0 || boxH <= 0) {
    return {
      width: HERO_FALLBACK.width,
      height: HERO_FALLBACK.height,
      magnify: 1,
      area: HERO_FALLBACK.width * HERO_FALLBACK.height,
      clamp: "none",
    };
  }

  // Start at 1:1 — the world *is* the box — and let the two clamps move it.
  let k = 1;
  let clamp = "none";

  const budget = Math.sqrt(area / (boxW * boxH));
  if (budget < 1) {
    k = budget;
    clamp = "area";
  }

  const floor = SIGHT_DIAMETERS * 2 * visionRadius;
  const shortest = Math.min(boxW, boxH);
  if (shortest * k < floor) {
    k = floor / shortest;
    clamp = "sight";
  }

  // Rounding is the only thing between this and an exact aspect ratio, so it is
  // also the whole of the residual crop: under half a pixel on each axis, which
  // `cover` then absorbs.
  const width = Math.max(1, Math.round(boxW * k));
  const height = Math.max(1, Math.round(boxH * k));
  return { width, height, magnify: boxW / width, area: width * height, clamp };
}

/**
 * What `object-fit: cover` does with a bitmap in a box.
 *
 * The rule is one line — scale by the larger of the two ratios, centre, clip —
 * and the reason it is written down here rather than reasoned about is that it
 * was reasoned about for eighty releases and the answer was 24.8%.
 *
 * @param {number} bitmapW intrinsic width of the picture
 * @param {number} bitmapH intrinsic height of the picture
 * @param {number} boxW the element's laid-out width
 * @param {number} boxH the element's laid-out height
 * @returns {{scale: number, drawnW: number, drawnH: number, cropW: number,
 *   cropH: number, visibleW: number, visibleH: number, visibleArea: number}}
 *   the crops are in CSS pixels of picture lost; the visible shares are
 *   fractions of the bitmap that survive.
 */
export function coverCrop(bitmapW, bitmapH, boxW, boxH) {
  const scale = Math.max(boxW / bitmapW, boxH / bitmapH);
  const drawnW = bitmapW * scale;
  const drawnH = bitmapH * scale;
  return {
    scale,
    drawnW,
    drawnH,
    cropW: Math.max(0, drawnW - boxW),
    cropH: Math.max(0, drawnH - boxH),
    visibleW: Math.min(1, boxW / drawnW),
    visibleH: Math.min(1, boxH / drawnH),
    visibleArea: Math.min(1, boxW / drawnW) * Math.min(1, boxH / drawnH),
  };
}
