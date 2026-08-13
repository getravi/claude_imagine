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
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // A fixed simulation resolution (the canvas is CSS-stretched to fill the
  // hero), with food and population density scaled to its area so it looks lush
  // at this size. Predators on for warm/cool colour variety; a gentle biome
  // drift keeps the whole field slowly breathing.
  const SW = 1280;
  const SH = 760;
  const area = (SW * SH) / (900 * 620);
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
