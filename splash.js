// splash.js — the landing page's living hero.
//
// The background behind the headline isn't a video or a loop — it's a real
// instance of Vivarium, the same engine that powers the app, evolving live in
// your browser. It warms up in non-blocking chunks so the page paints instantly
// and the pond visibly *comes alive* as you arrive, then runs at full tilt.
// Plus a tiny scroll-reveal for the sections below.
//
// Two things about the order here, both of which used to be wrong (v1.88). The
// reveal is wired **first**, because it is what makes the rest of the page
// readable and the hero is decoration. And the engine is pulled in with a
// *dynamic* import inside a `try`, because a static one is resolved before any
// statement in this file runs: blocking `src/world.js` used to leave all 53
// bands of the page at opacity zero, forever, however far you scrolled. A
// simulation module is now allowed to fail without taking the prose with it.

import { setupReveal } from "./src/reveal.js";

// ---- Scroll reveal ----
setupReveal(document, window);

// ---- Living hero ----
const canvas = document.getElementById("hero-canvas");
if (canvas) {
  startHero(canvas).catch((err) => {
    // The hero stays dark and the page is still a page. Nothing else on it
    // depends on the simulation.
    console.warn("Vivarium: the living hero could not start.", err);
  });
}

async function startHero(canvas) {
  const { makeConfig } = await import("./src/config.js");
  const { World } = await import("./src/world.js");
  const { Renderer } = await import("./src/render.js");
  const { heroFit } = await import("./src/herofit.js");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // The simulation's resolution is the box it will be drawn into, not a pair of
  // constants (v1.106). The canvas is `object-fit: cover`, so a world whose
  // aspect ratio disagrees with the window's is *cropped* — at 1280 × 760 that
  // was 24.8%–95.0% of the pond visible across nine measured viewports, a phone
  // seeing a quarter of it and no window seeing all of it. `heroFit` gives the
  // box's own aspect ratio back, under a ceiling on the area (so the tick never
  // costs more than it does today) and a floor on the shorter side (so a sense
  // disc cannot wrap around a torus onto itself).
  //
  // Food and population density are still scaled to the area, which is the
  // whole reason the shape is free to move: those five constants were never a
  // function of the width or the height, only of the product.
  const box = canvas.getBoundingClientRect();
  const { width: SW, height: SH } = heroFit(box.width, box.height);
  const area = (SW * SH) / (900 * 620);
  // Predators on for warm/cool colour variety; a gentle biome drift keeps the
  // whole field slowly breathing.
  const config = makeConfig({
    width: SW,
    height: SH,
    seed: 2024,
    predation: true,
    scavenging: true,
    seasons: false,
    foodPatches: true,
    biomeDrift: 0.04,
    foodStart: Math.round(280 * area),
    foodMax: Math.round(520 * area),
    foodSpawnRate: 1.8 * area,
    populationStart: Math.round(40 * area),
    populationMax: Math.round(650 * area),
  });

  const world = new World(config);
  const renderer = new Renderer(canvas, config);

  let running = true;
  document.addEventListener("visibilitychange", () => {
    running = !document.hidden; // don't burn CPU on a hidden tab
  });

  const WARM = 1700;
  let warm = 0;
  function warmup() {
    const t0 = performance.now();
    while (warm < WARM && performance.now() - t0 < 11) {
      world.step();
      warm++;
    }
    renderer.draw(world);
    canvas.classList.add("ready"); // triggers the CSS fade-in
    if (warm < WARM) requestAnimationFrame(warmup);
    else if (!reduce) requestAnimationFrame(loop);
  }
  function loop() {
    if (running) world.step();
    renderer.draw(world);
    requestAnimationFrame(loop);
  }
  warmup();
}
