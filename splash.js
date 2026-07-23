// splash.js — the landing page's living hero.
//
// The background behind the headline isn't a video or a loop — it's a real
// instance of Vivarium, the same engine that powers the app, evolving live in
// your browser. It warms up in non-blocking chunks so the page paints instantly
// and the pond visibly *comes alive* as you arrive, then runs at full tilt.
// Plus a tiny scroll-reveal for the sections below.

import { makeConfig } from "./src/config.js";
import { World } from "./src/world.js";
import { Renderer } from "./src/render.js";

// ---- Living hero ----
const canvas = document.getElementById("hero-canvas");
if (canvas) {
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

// ---- Scroll reveal ----
const reveal = document.querySelectorAll("[data-reveal]");
if ("IntersectionObserver" in window && reveal.length) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      }
    },
    { threshold: 0.12 }
  );
  reveal.forEach((el) => io.observe(el));
} else {
  reveal.forEach((el) => el.classList.add("in"));
}
