// main.js — boots the Vivarium, runs the animation loop, and wires the UI.
//
// This is the only module that touches the DOM directly (besides render.js's
// canvas). It keeps a single World, steps it a configurable number of times per
// animation frame, draws it, and refreshes the HUD. Everything the buttons and
// sliders do ultimately just reads or nudges the World or its config.

import { makeConfig } from "./config.js";
import { World } from "./world.js";
import { Renderer } from "./render.js";
import { RNG } from "./rng.js";

const $ = (id) => document.getElementById(id);

// ---- Shareable permalinks ----
// The world's identity (seed) and a few key parameters live in the URL hash, so
// a fascinating world is one copied link away. On load we read them; whenever
// they change we rewrite the hash (without adding history entries).
function parseHash() {
  const h = location.hash.replace(/^#/, "");
  if (!h) return {};
  const p = new URLSearchParams(h);
  const o = {};
  const num = (k, key, parse) => {
    if (p.has(k)) {
      const v = parse(p.get(k));
      if (Number.isFinite(v)) o[key] = v;
    }
  };
  num("seed", "seed", (v) => parseInt(v, 10));
  num("food", "foodSpawnRate", parseFloat);
  num("metab", "metabolicBase", parseFloat);
  num("mut", "mutationRate", parseFloat);
  if (p.has("pred")) o.predation = p.get("pred") === "1";
  if (p.has("sex")) o.sexualReproduction = p.get("sex") === "1";
  return o;
}

function syncHash() {
  const p = new URLSearchParams();
  p.set("seed", config.seed);
  p.set("food", config.foodSpawnRate.toFixed(2));
  p.set("metab", config.metabolicBase);
  p.set("mut", config.mutationRate);
  p.set("pred", config.predation ? "1" : "0");
  p.set("sex", config.sexualReproduction ? "1" : "0");
  history.replaceState(null, "", "#" + p.toString());
}

// ---- State ----
let config = makeConfig(parseHash());
let world = new World(config);
let renderer;
let running = true;
let speed = 1; // simulation steps per frame
const uiRng = new RNG(12345); // separate RNG for UI-side sampling (diversity)

// Track FPS for the HUD.
let lastFrame = performance.now();
let fpsSmooth = 60;

function boot() {
  const canvas = $("world");
  renderer = new Renderer(canvas, config);

  wireControls();
  wireCanvas(canvas);
  syncHash();
  requestAnimationFrame(loop);
}

function loop(now) {
  const dt = now - lastFrame;
  lastFrame = now;
  fpsSmooth += ((1000 / Math.max(dt, 1)) - fpsSmooth) * 0.1;

  if (running) {
    for (let i = 0; i < speed; i++) world.step();
  }

  renderer.draw(world);
  drawChart(world);
  updateHUD();
  updateInspector();

  requestAnimationFrame(loop);
}

// ---- HUD ----
function updateHUD() {
  const s = world.stats;
  $("stat-pop").textContent = world.creatures.length;
  $("stat-food").textContent = world.food.items.length;
  $("stat-gen").textContent = s.currentMaxGeneration;
  $("stat-tick").textContent = world.tick.toLocaleString();
  $("stat-births").textContent = s.births.toLocaleString();
  $("stat-deaths").textContent = s.deaths.toLocaleString();
  $("stat-fps").textContent = Math.round(fpsSmooth);
  const div = s.diversity(world, uiRng);
  $("stat-div").textContent = div.toFixed(3);
  // Carnivores: count and share of the population.
  const pop = world.creatures.length;
  const carn = s.carnivoreCount || 0;
  const pct = pop > 0 ? Math.round((carn / pop) * 100) : 0;
  $("stat-carn").textContent = `${carn} (${pct}%)`;
  $("stat-kills").textContent = s.kills.toLocaleString();
}

// ---- Live population chart ----
let chartCtx = null;
function drawChart(world) {
  if (!chartCtx) {
    const c = $("chart");
    chartCtx = c.getContext("2d");
    chartCtx._w = c.width;
    chartCtx._h = c.height;
  }
  const ctx = chartCtx;
  const W = ctx._w;
  const H = ctx._h;
  const hist = world.stats.popHistory;
  ctx.clearRect(0, 0, W, H);
  if (hist.length < 2) return;

  const maxPop = Math.max(10, world.stats.maxPopEver);
  const maxFood = Math.max(10, config.foodMax);

  // Food line (dim green).
  drawSeries(ctx, hist, W, H, (h) => h.food / maxFood, "rgba(90, 200, 140, 0.5)");
  // Population line (bright).
  drawSeries(ctx, hist, W, H, (h) => h.pop / maxPop, "rgba(120, 190, 255, 0.95)");
}

function drawSeries(ctx, hist, W, H, valueOf, stroke) {
  ctx.beginPath();
  for (let i = 0; i < hist.length; i++) {
    const x = (i / (hist.length - 1)) * W;
    const y = H - valueOf(hist[i]) * (H - 4) - 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// ---- Inspector (selected creature) ----
function updateInspector() {
  const panel = $("inspector");
  const c = renderer.selected;
  if (!c || c.dead) {
    panel.classList.add("empty");
    panel.innerHTML =
      '<div class="hint">Click a creature to inspect its brain and lineage.</div>';
    if (c && c.dead) renderer.selected = null;
    return;
  }
  panel.classList.remove("empty");
  const energyPct = Math.round((c.energy / config.energyMax) * 100);
  const isPred = c.carnivory >= config.carnivoreThreshold;
  const dietLabel = isPred
    ? `🔺 carnivore ${c.carnivory.toFixed(2)}`
    : c.carnivory < 0.25
    ? `🌿 herbivore ${c.carnivory.toFixed(2)}`
    : `◦ omnivore ${c.carnivory.toFixed(2)}`;
  panel.innerHTML = `
    <div class="insp-row"><span class="swatch" style="background:hsl(${c.hue},70%,55%)"></span>
      <strong>Creature #${c.id}</strong></div>
    <div class="insp-grid">
      <div><label>Generation</label><b>${c.generation}</b></div>
      <div><label>Age</label><b>${c.age}</b></div>
      <div><label>Energy</label><b>${energyPct}%</b></div>
      <div><label>Children</label><b>${c.children}</b></div>
      <div><label>Size</label><b>${c.radius.toFixed(1)}</b></div>
      <div><label>Metabolism</label><b>${c.metabolismScale.toFixed(2)}×</b></div>
      <div class="insp-wide"><label>Diet</label><b>${dietLabel}</b></div>
    </div>
    <div class="brainwrap"><label>Brain weights</label>${brainSparkline(c)}</div>
  `;
}

// Render the genome as a tiny colour strip — a visual "fingerprint" of the brain.
function brainSparkline(c) {
  const w = c.genome.brainWeights;
  const n = Math.min(w.length, 120);
  let html = '<div class="genome">';
  for (let i = 0; i < n; i++) {
    const v = Math.max(-2, Math.min(2, w[i]));
    const hue = v >= 0 ? 200 : 10; // positive blue, negative red
    const a = Math.min(1, Math.abs(v) / 2);
    html += `<span style="background:hsla(${hue},80%,55%,${a.toFixed(2)})"></span>`;
  }
  html += "</div>";
  return html;
}

// ---- Controls ----
function wireControls() {
  $("btn-pause").addEventListener("click", () => {
    running = !running;
    $("btn-pause").textContent = running ? "⏸ Pause" : "▶ Play";
  });

  $("btn-reset").addEventListener("click", () => resetWorld(config.seed));

  $("btn-randomseed").addEventListener("click", () => {
    const seed = Math.floor(Math.random() * 1e9);
    $("seed-input").value = seed;
    resetWorld(seed);
  });

  $("seed-input").value = config.seed;
  $("seed-input").addEventListener("change", (e) => {
    const v = parseInt(e.target.value, 10);
    if (!Number.isNaN(v)) resetWorld(v);
  });

  $("btn-feed").addEventListener("click", () => world.addFood(60));
  $("btn-seedlife").addEventListener("click", () => world.addRandomCreatures(12));

  // Speed control.
  const speedInput = $("speed");
  speedInput.addEventListener("input", (e) => {
    speed = parseInt(e.target.value, 10);
    $("speed-label").textContent = speed + "×";
  });

  // Live parameter sliders (each nudges the config and updates the permalink).
  bindSlider("foodSpawnRate", "food-rate", (v) => v.toFixed(1));
  bindSlider("metabolicBase", "metabolism", (v) => v.toFixed(3));
  bindSlider("mutationRate", "mutation", (v) => v.toFixed(2));

  // Toggles.
  $("toggle-vision").addEventListener("change", (e) => {
    renderer.showVision = e.target.checked;
  });
  $("toggle-predation").checked = config.predation;
  $("toggle-predation").addEventListener("change", (e) => {
    config.predation = e.target.checked;
    syncHash();
  });
  $("toggle-sexual").checked = config.sexualReproduction;
  $("toggle-sexual").addEventListener("change", (e) => {
    config.sexualReproduction = e.target.checked;
    syncHash();
  });

  // Save / load / share.
  $("btn-save").addEventListener("click", saveWorld);
  $("btn-load").addEventListener("click", loadWorld);
  $("btn-share").addEventListener("click", shareLink);
}

function bindSlider(configKey, elId, fmt) {
  const el = $(elId);
  if (!el) return;
  el.value = config[configKey];
  const label = $(elId + "-label");
  if (label) label.textContent = fmt(config[configKey]);
  el.addEventListener("input", (e) => {
    const v = parseFloat(e.target.value);
    config[configKey] = v;
    if (label) label.textContent = fmt(v);
    syncHash();
  });
}

function resetWorld(seed) {
  // Preserve any live-tuned parameters, just change the seed and rebuild.
  config = makeConfig({ ...config, seed });
  world = new World(config);
  renderer.config = config;
  renderer.selected = null;
  syncHash();
}

// Copy the current permalink to the clipboard (falls back gracefully).
function shareLink() {
  syncHash();
  const url = location.href;
  const done = () => flash("Link copied — share this world!");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(done, () => flash(url));
  } else {
    flash(url);
  }
}

function wireCanvas(canvas) {
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (config.width / rect.width);
    const y = (e.clientY - rect.top) * (config.height / rect.height);
    renderer.selected = renderer.pick(world, x, y);
  });
}

// ---- Persistence ----
function saveWorld() {
  const data = JSON.stringify(world.toJSON());
  localStorage.setItem("vivarium.save", data);
  flash("World saved to your browser.");
}

function loadWorld() {
  const data = localStorage.getItem("vivarium.save");
  if (!data) return flash("No saved world found.");
  try {
    const obj = JSON.parse(data);
    config = makeConfig({ ...config, seed: obj.seed });
    world = new World(config);
    world.loadJSON(obj);
    renderer.config = config;
    renderer.selected = null;
    $("seed-input").value = config.seed;
    syncHash();
    flash("World loaded.");
  } catch (err) {
    flash("Could not load world.");
  }
}

let flashTimer = null;
function flash(msg) {
  const el = $("flash");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

boot();
