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
import { drawMuller } from "./mullerplot.js";
import { buildBrainFor } from "./creature.js";
import { SCENARIOS } from "./scenarios.js";
import { dayNightPhase } from "./environment.js";
import { ZOOM_STEP } from "./camera.js";
import { drawMinimap, minimapLayout, minimapToWorld } from "./minimap.js";
import { wholePercents, mortalitySeries, DEATH_CAUSES } from "./stats.js";
import { mortalityColours } from "./palette.js";

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
  if (p.has("sea")) o.seasons = p.get("sea") === "1";
  if (p.has("bio")) o.foodPatches = p.get("bio") === "1";
  if (p.has("pla")) o.plasticity = p.get("pla") === "1";
  if (p.has("neat")) o.evolvableTopology = p.get("neat") === "1";
  if (p.has("drift")) o.biomeDrift = p.get("drift") === "1" ? DRIFT_SPEED : 0;
  if (p.has("scav")) o.scavenging = p.get("scav") === "1";
  if (p.has("kin")) o.kinRecognition = p.get("kin") === "1";
  if (p.has("night")) o.dayNightCycle = p.get("night") === "1";
  if (p.has("dis")) o.disease = p.get("dis") === "1";
  if (p.has("regrow")) o.foodRegrowth = p.get("regrow") === "1";
  if (p.has("sig")) o.signalling = p.get("sig") === "1";
  if (p.has("ter")) o.terrain = p.get("ter") === "1";
  return o;
}

// The biome-drift speed used when the "Drifting biomes" toggle is on.
const DRIFT_SPEED = 0.1;

function syncHash() {
  const p = new URLSearchParams();
  p.set("seed", config.seed);
  p.set("food", config.foodSpawnRate.toFixed(2));
  p.set("metab", config.metabolicBase);
  p.set("mut", config.mutationRate);
  p.set("pred", config.predation ? "1" : "0");
  p.set("sex", config.sexualReproduction ? "1" : "0");
  p.set("sea", config.seasons ? "1" : "0");
  p.set("bio", config.foodPatches ? "1" : "0");
  p.set("pla", config.plasticity ? "1" : "0");
  p.set("neat", config.evolvableTopology ? "1" : "0");
  p.set("drift", config.biomeDrift > 0 ? "1" : "0");
  p.set("scav", config.scavenging ? "1" : "0");
  p.set("kin", config.kinRecognition ? "1" : "0");
  p.set("night", config.dayNightCycle ? "1" : "0");
  p.set("dis", config.disease ? "1" : "0");
  p.set("regrow", config.foodRegrowth ? "1" : "0");
  p.set("sig", config.signalling ? "1" : "0");
  p.set("ter", config.terrain ? "1" : "0");
  history.replaceState(null, "", "#" + p.toString());
}

// Turn the world's season phase into a label + icon for the badge.
function seasonLabel(world) {
  if (!config.seasons) return { icon: "◷", name: "No seasons", year: null };
  const angle = (2 * Math.PI * world.tick) / config.seasonLength;
  const s = Math.sin(angle);
  const rising = Math.cos(angle) > 0; // heading toward summer
  let icon, name;
  if (s > 0.5) [icon, name] = ["☀️", "Summer"];
  else if (s < -0.5) [icon, name] = ["❄️", "Winter"];
  else if (rising) [icon, name] = ["🌱", "Spring"];
  else [icon, name] = ["🍂", "Autumn"];
  const year = Math.floor(world.tick / config.seasonLength) + 1;
  return { icon, name, year };
}

// Turn the world's day/night phase into a label + icon for the badge. Only ever
// shown while the cycle is switched on — with it off it is permanently noon,
// which isn't worth a readout. Nothing else on screen says what time it is, so
// without this a visitor sees creatures go strangely short-sighted for no
// visible reason.
function timeOfDayLabel(world) {
  const light = dayNightPhase(world.tick, config);
  // Daylight is a cosine, so it's climbing back toward noon while sin is negative.
  const rising = Math.sin((2 * Math.PI * world.tick) / config.dayLength) < 0;
  if (light > 0.75) return { icon: "🌞", name: "Day" };
  if (light < 0.25) return { icon: "🌙", name: "Night" };
  return rising ? { icon: "🌅", name: "Dawn" } : { icon: "🌆", name: "Dusk" };
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

// Respect the OS-level "reduce motion" preference by default (comet trails
// are the app's main continuous-motion effect); a visitor who prefers a
// calmer view can still flip it either way from the controls panel.
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

function boot() {
  const canvas = $("world");
  renderer = new Renderer(canvas, config);
  renderer.reducedMotion = motionQuery.matches;
  $("toggle-motion").checked = renderer.reducedMotion;
  motionQuery.addEventListener("change", (e) => {
    renderer.reducedMotion = e.matches;
    $("toggle-motion").checked = e.matches;
  });

  wireControls();
  wireKeyboard();
  wireCanvas(canvas);
  wireMinimap($("minimap"));
  buildScenarioChips();
  syncHash();
  requestAnimationFrame(loop);
}

// ---- Scenarios (curated one-click worlds) ----
function buildScenarioChips() {
  const box = $("scenario-chips");
  box.innerHTML = "";
  for (const scn of SCENARIOS) {
    const b = document.createElement("button");
    b.innerHTML = `<span>${scn.icon}</span> ${scn.name}`;
    b.title = scn.blurb;
    b.addEventListener("click", () => launchScenario(scn));
    box.appendChild(b);
  }
}

function launchScenario(scn) {
  // A scenario is a full preset: reset to defaults, then apply its overrides.
  config = makeConfig(scn.over);
  world = new World(config);
  renderer.setConfig(config);
  renderer.selected = null;
  renderer.highlightSpeciesId = null;
  legendSig = "";
  lastChronKey = "";
  $("btn-clear-highlight").classList.add("hidden");
  syncControlsFromConfig();
  // Mark the active chip.
  [...$("scenario-chips").children].forEach((b, i) => {
    b.classList.toggle("active", SCENARIOS[i].id === scn.id);
  });
  syncHash();
  flash(`${scn.icon} ${scn.name} — ${scn.blurb}`);
}

// Push the current config out to every control so the UI matches after a
// scenario launch (or any wholesale config change).
function syncControlsFromConfig() {
  $("seed-input").value = config.seed;
  const setSlider = (elId, key, fmt) => {
    const el = $(elId);
    if (el) el.value = config[key];
    const label = $(elId + "-label");
    if (label) label.textContent = fmt(config[key]);
  };
  setSlider("food-rate", "foodSpawnRate", (v) => v.toFixed(1));
  setSlider("metabolism", "metabolicBase", (v) => v.toFixed(3));
  setSlider("mutation", "mutationRate", (v) => v.toFixed(2));
  const setToggle = (id, on) => {
    const el = $(id);
    if (el) el.checked = on;
  };
  setToggle("toggle-seasons", config.seasons);
  setToggle("toggle-patches", config.foodPatches);
  setToggle("toggle-drift", config.biomeDrift > 0);
  setToggle("toggle-predation", config.predation);
  setToggle("toggle-scavenging", config.scavenging);
  setToggle("toggle-kin", config.kinRecognition);
  setToggle("toggle-daynight", config.dayNightCycle);
  setToggle("toggle-disease", config.disease);
  setToggle("toggle-regrowth", config.foodRegrowth);
  setToggle("toggle-signalling", config.signalling);
  setToggle("toggle-terrain", config.terrain);
  setToggle("toggle-sexual", config.sexualReproduction);
  setToggle("toggle-plasticity", config.plasticity);
  setToggle("toggle-neat", config.evolvableTopology);
}

function loop(now) {
  const dt = now - lastFrame;
  lastFrame = now;
  fpsSmooth += ((1000 / Math.max(dt, 1)) - fpsSmooth) * 0.1;

  if (running) {
    for (let i = 0; i < speed; i++) world.step();
  }

  // The camera catches up to whatever it is following before anything is drawn,
  // so a followed creature never lags a frame behind its own halo.
  renderer.camera.update();
  renderer.draw(world);
  updateViewBadge();
  updateMinimap();
  drawChart(world);
  drawDeaths(world);
  drawPhylogeny(world);
  updateHUD();
  updateSeasonBadge(world);
  updateInspector();
  updateChronicle(world);

  requestAnimationFrame(loop);
}

// ---- Chronicle feed (natural-history timeline) ----
let lastChronKey = "";
function updateChronicle(world) {
  const ev = world.chronicle.events;
  const newest = ev.length ? ev[ev.length - 1] : null;
  const key = ev.length + "|" + (newest ? newest.tick + newest.msg : "");
  if (key === lastChronKey) return; // nothing changed since last render
  lastChronKey = key;

  const feed = $("chronicle-feed");
  if (ev.length === 0) {
    feed.innerHTML = '<li class="chronicle-empty">The pond is young. Its story will appear here…</li>';
    return;
  }
  let html = "";
  for (let i = ev.length - 1; i >= 0; i--) {
    const e = ev[i];
    const when = "t" + e.tick.toLocaleString() + (e.year ? ` · yr${e.year}` : "");
    const fresh = i === ev.length - 1 ? " fresh" : "";
    html +=
      `<li class="cat-${e.cat}${fresh}"><span class="c-icon">${e.icon}</span>` +
      `<span class="c-when">${when}</span><span class="c-msg">${e.msg}</span></li>`;
  }
  feed.innerHTML = html;
}

// ---- View badge (zoom / follow) ----
// The rule from v1.14: a feature isn't finished until the screen says it is on.
// The badge appears the moment the view stops being the whole pond, names the
// magnification, and says whose shoulder you're looking over. It also keeps the
// Follow checkbox honest — the camera lets go by itself when its creature dies
// or when a drag takes the wheel, and the control has to admit that.
let viewSig = "";
function updateViewBadge() {
  const cam = renderer.camera;
  const badge = $("zoom-badge");
  const follow = $("toggle-follow");
  if (follow.checked !== !!cam.target) follow.checked = !!cam.target;

  const sig = cam.isDefault() ? "" : cam.zoom.toFixed(2) + "|" + (cam.target ? cam.target.id : "");
  if (sig === viewSig) return;
  viewSig = sig;
  // A zoomed-in view is draggable, and the cursor should say so — however the
  // zoom got there (wheel, keyboard, or following someone).
  $("world").style.cursor = cam.zoom > 1 ? "grab" : "";
  badge.classList.toggle("hidden", sig === "");
  if (sig === "") return;
  badge.innerHTML =
    `<span class="icon">🔍</span> ${cam.zoom.toFixed(1)}×` +
    (cam.target ? ` <span class="following">🎯 #${cam.target.id}</span>` : "");
}

// ---- Minimap ----
// The other half of the camera: once the view can be a fifteenth of the pond,
// something has to say *which* fifteenth. It appears and disappears with the
// zoom badge, because at zoom 1 the viewport is the whole world and a minimap
// would just be a smaller copy of what you are already looking at.
let miniCtx = null;
function updateMinimap() {
  const cam = renderer.camera;
  const canvas = $("minimap");
  const show = !cam.isDefault();
  canvas.classList.toggle("hidden", !show);
  if (!show) return;
  const layout = minimapLayout(config);
  if (!miniCtx) {
    miniCtx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = layout.width * dpr;
    canvas.height = layout.height * dpr;
    canvas.style.width = layout.width + "px";
    canvas.style.height = layout.height + "px";
    miniCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  drawMinimap(miniCtx, world, cam, { selected: renderer.selected });
}

// Click (or drag) anywhere on the minimap to put the view there. Like a drag in
// the pond itself, taking the wheel by hand releases the follow lock.
function wireMinimap(canvas) {
  const jumpTo = (e) => {
    const rect = canvas.getBoundingClientRect();
    const layout = minimapLayout(config);
    const mx = (e.clientX - rect.left) * (layout.width / rect.width);
    const my = (e.clientY - rect.top) * (layout.height / rect.height);
    const w = minimapToWorld(mx, my, layout, config);
    renderer.camera.setTarget(null);
    renderer.camera.moveTo(w.x, w.y);
  };
  let dragging = false;
  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    jumpTo(e);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (dragging) jumpTo(e);
  });
  const release = () => {
    dragging = false;
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
}

function updateSeasonBadge(world) {
  const { icon, name, year } = seasonLabel(world);
  let html =
    `<span class="icon">${icon}</span> ${name}` +
    (year ? ` <span class="yr">· year ${year}</span>` : "");
  if (config.dayNightCycle) {
    const t = timeOfDayLabel(world);
    html += ` <span class="tod"><span class="icon">${t.icon}</span> ${t.name}</span>`;
  }
  $("season-badge").innerHTML = html;
}

// ---- Tree of Life (Muller plot + legend) ----
let mullerCtx = null;
let legendSig = ""; // avoid rebuilding the legend DOM every frame
function drawPhylogeny(world) {
  const canvas = $("muller");
  if (!mullerCtx) {
    mullerCtx = canvas.getContext("2d");
    // Match the backing buffer to the displayed size once, for crisp lines.
    const w = Math.round(canvas.clientWidth) || canvas.width;
    canvas.width = w;
  }
  const ph = world.phylogeny;
  const shown = drawMuller(mullerCtx, ph, {
    width: canvas.width,
    height: canvas.height,
    highlightId: renderer.highlightSpeciesId,
  });

  $("phylo-info").textContent =
    `${ph.livingCount()} species alive · ${ph.species.length} ever · ` +
    `${ph.species.filter((s) => s.extinctTick >= 0).length} extinct`;

  // Rebuild the legend only when the set of shown species (or highlight) changes.
  const living = shown.filter((s) => s.count > 0).sort((a, b) => b.count - a.count);
  const sig = living.map((s) => s.id).join(",") + "|" + renderer.highlightSpeciesId;
  if (sig !== legendSig) {
    legendSig = sig;
    buildLegend(living);
  } else {
    // Cheap in-place count refresh.
    for (const s of living) {
      const el = document.getElementById("chip-n-" + s.id);
      if (el) el.textContent = s.count;
    }
  }
}

function buildLegend(living) {
  const box = $("species-legend");
  box.innerHTML = "";
  for (const s of living.slice(0, 16)) {
    const chip = document.createElement("div");
    chip.className = "chip" + (renderer.highlightSpeciesId === s.id ? " active" : "");
    chip.innerHTML =
      `<span class="dot" style="background:hsl(${s.hue},70%,55%);color:hsl(${s.hue},70%,55%)"></span>` +
      `species ${s.id} <span class="n" id="chip-n-${s.id}">${s.count}</span>`;
    chip.addEventListener("click", () => toggleHighlight(s.id));
    box.appendChild(chip);
  }
}

function toggleHighlight(id) {
  renderer.highlightSpeciesId = renderer.highlightSpeciesId === id ? null : id;
  legendSig = ""; // force legend refresh to update the active chip
  $("btn-clear-highlight").classList.toggle("hidden", renderer.highlightSpeciesId == null);
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
  // Contagion: the live sick / immune split (both "off" without a pathogen).
  $("stat-sick").textContent = config.disease
    ? `${s.infectedCount} (${pop > 0 ? Math.round((s.infectedCount / pop) * 100) : 0}%)`
    : "off";
  $("stat-immune").textContent = config.disease ? s.immuneCount : "off";
  $("stat-learn").textContent = config.plasticity ? s.avgLearning.toFixed(3) : "off";
  // Traffic on the signalling channel: how strong a call the average creature is
  // hearing right now. "off" where nobody can hear at all.
  $("stat-heard").textContent = config.signalling ? s.avgHeard.toFixed(2) : "off";
  // Terrain: how much smoother the ground under the living is than the
  // landscape as a whole. Negative — shown as a "flatter by" percentage — means
  // the pond has genuinely drifted into its basins rather than spreading evenly
  // over ground it cannot perceive. Reads exactly 0 without terrain, so it is
  // shown as "off" rather than as a suspiciously steady zero.
  $("stat-ground").textContent = config.terrain
    ? `${s.groundBias <= 0 ? "−" : "+"}${Math.abs(Math.round(s.groundBias * 100))}%`
    : "off";
  $("stat-brain").textContent = config.evolvableTopology
    ? `${s.avgConns.toFixed(0)}c ${s.avgHidden.toFixed(1)}h`
    : "fixed";
  updateMortality(s);
}

// The death mix: which of the three ways out of this world the pond is
// currently taking. Only widths and text change, never structure, so this is
// safe to run every frame (see the inspector's note about innerHTML).
function updateMortality(s) {
  const m = s.mortality();
  $("stat-life").textContent = m ? Math.round(m.meanLifespan).toLocaleString() : "—";
  const bar = $("mort-bar");
  if (!m) {
    bar.setAttribute("aria-label", "No deaths recorded yet.");
    return;
  }
  const [starve, aged, hunted] = wholePercents([
    m.shares.starvation,
    m.shares.age,
    m.shares.predation,
  ]);
  // Bar and caption are drawn from the same integers, so the widths on screen
  // are exactly the numbers underneath them.
  $("mort-starve").style.width = `${starve}%`;
  $("mort-age").style.width = `${aged}%`;
  $("mort-pred").style.width = `${hunted}%`;
  const text = `${starve}% starved · ${aged}% aged · ${hunted}% hunted`;
  $("mort-legend").textContent = text;
  $("mort-window").textContent = `last ${m.n}`;
  bar.setAttribute("aria-label", `Of the last ${m.n} deaths, ${text.replace(/ · /g, ", ")}.`);
}

// ---- Live population chart ----
//
// Two scopes. "recent" is the 480-point ring the chart has always drawn — the
// last 1,920 ticks, exactly as every earlier version framed it, so the default
// panel is unchanged. "whole" draws the archive: the entire run from tick 0,
// thinned to fit, with a translucent band behind each line showing the range
// the thinning covered. The band matters — without it a decimated line would
// smooth away the very peaks and crashes the chart exists to show, and it would
// do so silently.
let chartScope = "recent";
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
  const whole = chartScope === "whole";
  const hist = whole ? world.stats.runHistory.series() : world.stats.popHistory;
  ctx.clearRect(0, 0, W, H);
  updateChartRange(world, hist);
  if (hist.length < 2) return;

  const maxPop = Math.max(10, world.stats.maxPopEver);
  const maxFood = Math.max(10, config.foodMax);

  if (whole) {
    // Envelopes first, under the lines: what each thinned point stands for.
    drawBand(ctx, hist, W, H, (h) => h.min.food / maxFood, (h) => h.max.food / maxFood,
      "rgba(90, 200, 140, 0.16)");
    drawBand(ctx, hist, W, H, (h) => h.min.pop / maxPop, (h) => h.max.pop / maxPop,
      "rgba(120, 190, 255, 0.22)");
  }
  // Food line (dim green).
  drawSeries(ctx, hist, W, H, (h) => h.food / maxFood, "rgba(90, 200, 140, 0.5)");
  // Population line (bright).
  drawSeries(ctx, hist, W, H, (h) => h.pop / maxPop, "rgba(120, 190, 255, 0.95)");
}

// The caption under the chart: which stretch of time is on screen, and — in
// whole-run mode — how much each pixel of it is standing in for. A chart whose
// x-axis silently changes meaning is worse than one with no axis at all.
function updateChartRange(world, hist) {
  const el = $("chart-range");
  let text = "";
  if (chartScope === "whole") {
    const span = world.stats.runHistory.span();
    if (span) {
      const each = world.stats.runHistory.stride * 4;
      text = `ticks ${span.from.toLocaleString()}–${span.to.toLocaleString()} · 1 point per ${each} ticks`;
    }
  } else if (hist.length > 1) {
    text = `ticks ${hist[0].tick.toLocaleString()}–${hist[hist.length - 1].tick.toLocaleString()}`;
  }
  if (el.textContent !== text) el.textContent = text;
}

// ---- The death strip ----
//
// Under the chart, on the same x-axis and following the same recent/whole
// scope: deaths per tick, stacked by cause. The mortality bar in the panel
// above answers "what is killing them *now*" over the last 120 bodies, which
// means that by the time a crash has scrolled far enough back to be visible as
// a shape on the chart, the explanation for it has long since left the window.
// This is the same ledger on the chart's clock, so a trough in the population
// line has a colour underneath it.
//
// Heights are normalised to the busiest interval on screen, so this says *when*
// the dying happened and *of what*, not how it compares to another run. The
// caption carries the absolute peak, since a normalised strip with no number on
// it looks the same in a massacre and in a quiet afternoon.
let deathsCtx = null;
let deathsLabel = "";
function drawDeaths(world) {
  if (!deathsCtx) {
    const c = $("deaths");
    deathsCtx = c.getContext("2d");
    deathsCtx._w = c.width;
    deathsCtx._h = c.height;
  }
  const ctx = deathsCtx;
  const W = ctx._w;
  const H = ctx._h;
  ctx.clearRect(0, 0, W, H);

  const hist = chartScope === "whole" ? world.stats.runHistory.series() : world.stats.popHistory;
  const { intervals, peak, total } = mortalitySeries(hist);
  if (total === 0) {
    setDeathsCaption("", "Deaths over time: nothing has died in this window.");
    return;
  }

  const colours = mortalityColours();
  const totals = { starvation: 0, age: 0, predation: 0 };
  const span = Math.max(1, hist.length - 1);
  let busiest = intervals[0];
  for (const iv of intervals) {
    if (iv.rate > busiest.rate) busiest = iv;
  }
  for (const iv of intervals) {
    const x0 = ((iv.index - 1) / span) * W;
    const w = Math.max(1, W / span);
    let y = H;
    for (const c of DEATH_CAUSES) {
      totals[c] += iv.counts[c];
      if (iv.counts[c] === 0) continue;
      // Each cause's slice of this interval's bar, the whole bar being that
      // interval's death rate as a fraction of the busiest one on screen.
      const h = (iv.counts[c] / iv.dt / peak) * (H - 2);
      ctx.fillStyle = colours[c];
      ctx.fillRect(x0, y - h, w, h);
      y -= h;
    }
  }

  const [starve, aged, hunted] = wholePercents([
    totals.starvation / total,
    totals.age / total,
    totals.predation / total,
  ]);
  // The peak is given as the busiest interval's own count over its own length,
  // not extrapolated to a round number of ticks: at the recent scope an
  // interval is four ticks long, so a single death would extrapolate to "25 per
  // 100 ticks" and read as a catastrophe.
  setDeathsCaption(
    `peak ${busiest.deaths} in ${busiest.dt.toLocaleString()} ticks`,
    `Deaths over time: ${total} in view — ${starve}% starved, ${aged}% aged, ${hunted}% hunted.`
  );
}

/** Both texts under the strip, written only when they actually change. */
function setDeathsCaption(peakText, label) {
  const el = $("deaths-peak");
  if (el.textContent !== peakText) el.textContent = peakText;
  if (deathsLabel !== label) {
    deathsLabel = label;
    $("deaths").setAttribute("aria-label", label);
  }
}

/**
 * Paint the three cause colours onto the mortality bar and the strip's legend.
 * They come from `src/palette.js` rather than the stylesheet so that the swatch,
 * the bar and the chart cannot disagree, and so a test can measure the colours
 * that are actually drawn. Runs once, at startup.
 */
function applyMortalityColours() {
  const c = mortalityColours();
  const paint = (id, colour) => {
    $(id).style.background = colour;
  };
  paint("mort-starve", c.starvation);
  paint("mort-age", c.age);
  paint("mort-pred", c.predation);
  paint("dot-starve", c.starvation);
  paint("dot-age", c.age);
  paint("dot-pred", c.predation);
}

function drawBand(ctx, hist, W, H, lowOf, highOf, fill) {
  ctx.beginPath();
  for (let i = 0; i < hist.length; i++) {
    const x = (i / (hist.length - 1)) * W;
    const y = H - highOf(hist[i]) * (H - 4) - 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = hist.length - 1; i >= 0; i--) {
    const x = (i / (hist.length - 1)) * W;
    ctx.lineTo(x, H - lowOf(hist[i]) * (H - 4) - 2);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
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
// The panel used to be rebuilt from innerHTML on every frame. That was fine
// while everything in it was text, but a *button* replaced 60× a second can't
// be clicked: a human click spans several frames, and the element it started on
// is detached before the mouse comes up. So the structure is now rebuilt only
// when it actually changes — a different creature, or an ancestry chain that
// gained a link or lost a lineage — and the handful of fields that tick (age,
// energy, children, learned weights) are patched in place.
let inspKey = "";
function updateInspector() {
  const panel = $("inspector");
  const c = renderer.selected;
  if (!c || c.dead) {
    if (c && c.dead) renderer.selected = null;
    if (inspKey !== "-") {
      inspKey = "-";
      panel.classList.add("empty");
      panel.innerHTML =
        '<div class="hint">Click a creature to inspect its brain and lineage.</div>';
    }
    return;
  }

  const chain = world.phylogeny.ancestry(c.speciesId);
  const key = c.id + "|" + chain.map((s) => s.id).join(",");
  if (key !== inspKey) {
    inspKey = key;
    panel.classList.remove("empty");
    panel.innerHTML = inspectorHTML(c, chain);
    const link = document.getElementById("insp-species");
    if (link) {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        toggleHighlight(c.speciesId);
      });
    }
    for (const pip of panel.querySelectorAll(".anc")) {
      pip.addEventListener("click", () => toggleHighlight(Number(pip.dataset.id)));
    }
  }

  // Live fields, patched without disturbing anything clickable.
  $("insp-age").textContent = c.age;
  $("insp-energy").textContent = Math.round((c.energy / config.energyMax) * 100) + "%";
  $("insp-children").textContent = c.children;
  const learned = document.getElementById("insp-learned");
  if (learned) learned.innerHTML = sparkFromWeights(c.brain.w);
  // An ancestor can die out while you watch: toggle the class rather than
  // re-rendering the chain, so a lineage going hollow never eats a click.
  for (const pip of panel.querySelectorAll(".anc")) {
    const s = world.phylogeny.byId.get(Number(pip.dataset.id));
    if (s) pip.classList.toggle("gone", s.count === 0);
  }
}

function inspectorHTML(c, chain) {
  const isPred = c.carnivory >= config.carnivoreThreshold;
  const dietLabel = isPred
    ? `🔺 carnivore ${c.carnivory.toFixed(2)}`
    : c.carnivory < 0.25
    ? `🌿 herbivore ${c.carnivory.toFixed(2)}`
    : `◦ omnivore ${c.carnivory.toFixed(2)}`;
  return `
    <div class="insp-row"><span class="swatch" style="background:hsl(${c.hue},70%,55%)"></span>
      <strong>Creature #${c.id}</strong></div>
    <div class="insp-grid">
      <div><label>Generation</label><b>${c.generation}</b></div>
      <div><label>Age</label><b id="insp-age">${c.age}</b></div>
      <div><label>Energy</label><b id="insp-energy">—</b></div>
      <div><label>Children</label><b id="insp-children">${c.children}</b></div>
      <div><label>Size</label><b>${c.radius.toFixed(1)}</b></div>
      <div><label>Metabolism</label><b>${c.metabolismScale.toFixed(2)}×</b></div>
      <div class="insp-wide"><label>Diet</label><b>${dietLabel}</b></div>
      <div class="insp-wide"><label>Species</label>
        <b><a href="#" id="insp-species">${c.speciesId} — spotlight lineage ›</a></b></div>
      ${ancestryRow(c, chain)}
    </div>
    ${
      c.genome.conns // NEAT genome: show the evolved network graph
        ? `<div class="brainwrap"><label>Brain — evolved network (${
            c.genome.complexity.conns
          } connections, ${c.genome.complexity.nodes} hidden) 🧬</label>${brainGraphSVG(
            c.genome
          )}</div>`
        : `<div class="brainwrap"><label>Brain — inherited</label>${sparkFromWeights(
            c.genome.brainWeights
          )}${
            c.brain.plastic
              ? `<label class="learned-label">Brain — current (learned) 🧠</label><div id="insp-learned">${sparkFromWeights(
                  c.brain.w
                )}</div>`
              : ""
          }</div>`
    }
  `;
}

// The genealogy of a survivor: the chain of species this creature descends
// from, founder first, each one a clickable pip that spotlights that lineage.
// Extinct ancestors are drawn hollow, so you can see at a glance how much of a
// creature's family tree is already gone. Long chains keep only the most recent
// links (the deep past is a wall of pips nobody can read) behind a "…" marker.
const ANCESTRY_SHOWN = 6;
function ancestryRow(c, chain) {
  if (chain.length < 2) return ""; // a founder has no story to tell yet
  const branchings = chain.length - 1;
  const shown = chain.slice(-ANCESTRY_SHOWN);
  const elided = chain.length - shown.length;
  const pips = shown
    .map((s) => {
      const cls = "anc" + (s.count === 0 ? " gone" : "") + (s.id === c.speciesId ? " current" : "");
      const title = `Species ${s.id} — born tick ${s.birthTick}`;
      return `<button type="button" class="${cls}" data-id="${s.id}" title="${title}"
        style="--anc-hue:${s.hue}">${s.id}</button>`;
    })
    .join('<span class="anc-arrow">›</span>');
  return `<div class="insp-wide"><label>Ancestry — ${branchings} branching${
    branchings === 1 ? "" : "s"
  } deep</label>
    <div class="ancestry">${
      elided ? `<span class="anc-arrow" title="${elided} older ancestors">…</span>` : ""
    }${pips}</div></div>`;
}

// Render a weight vector as a tiny colour strip — a visual "fingerprint" of the
// brain. Positive weights read blue, negative red, intensity by magnitude. With
// plasticity on, showing this for both the inherited and current weights makes
// within-lifetime learning visible as the strip shifts.
function sparkFromWeights(w) {
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

// Render a NEAT genome as an actual network diagram: inputs on the left, evolved
// hidden neurons in the middle, motor outputs on the right, connections coloured
// by weight (blue positive, red negative). Makes evolved topology legible at a
// glance — you can watch structure differ between creatures and grow over
// generations. Built as an inline SVG string since the inspector is re-rendered
// from innerHTML each frame.
function brainGraphSVG(genome) {
  const W = 288;
  const H = 150;
  const nIn = 16;
  const nOut = 3;
  const pad = 12;
  const pos = new Map();
  const place = (id, x, y) => pos.set(id, [x, y]);
  const spread = (count, i) => pad + ((H - 2 * pad) * (count === 1 ? 0.5 : i / (count - 1)));
  for (let i = 0; i < nIn; i++) place(i, pad, spread(nIn, i));
  for (let o = 0; o < nOut; o++) place(nIn + o, W - pad, spread(nOut, o));
  const hidden = genome.nodes;
  hidden.forEach((id, i) => {
    // Stagger hidden nodes horizontally so chains are visible, not overlapping.
    const x = W * (0.36 + 0.28 * ((i % 3) / 2));
    place(id, x, spread(Math.max(hidden.length, 1), i));
  });

  let edges = "";
  for (const c of genome.conns) {
    if (!c.on) continue;
    const a = pos.get(c.from);
    const b = pos.get(c.to);
    if (!a || !b) continue;
    const hue = c.w >= 0 ? 205 : 8;
    const op = Math.min(0.85, 0.15 + Math.abs(c.w) / 3);
    const wdt = Math.min(2.4, 0.4 + Math.abs(c.w) / 2.5);
    edges += `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(
      1
    )}" y2="${b[1].toFixed(1)}" stroke="hsla(${hue},85%,60%,${op.toFixed(
      2
    )})" stroke-width="${wdt.toFixed(2)}"/>`;
  }
  let nodes = "";
  for (const [id, [x, y]] of pos) {
    let fill = "#7fd0ff"; // hidden default
    let r = 3;
    if (id < nIn) fill = "#5adc96"; // inputs (green)
    else if (id < nIn + nOut) {
      fill = "#ffb060"; // outputs (orange)
      r = 4;
    } else {
      fill = "#e0e6f0"; // evolved hidden (bright)
      r = 4;
    }
    nodes += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${fill}"/>`;
  }
  return `<svg class="braingraph" viewBox="0 0 ${W} ${H}" width="100%" height="${H}">${edges}${nodes}</svg>`;
}

// Toggle the simulation between running and paused, keeping the button label in
// sync. Shared by the Pause button and the Space keyboard shortcut.
function togglePause() {
  running = !running;
  $("btn-pause").textContent = running ? "⏸ Pause" : "▶ Play";
}

// Advance exactly one simulation step, like a video player's frame-advance.
// Pauses first if running, so repeated taps walk the world forward tick by tick
// — handy for watching a hunt or a reproduction event unfold in slow motion.
function stepOnce() {
  if (running) togglePause();
  world.step();
}

// ---- Keyboard shortcuts ----
// Single-key accelerators for the most-used controls, so you can drive the pond
// without reaching for the mouse. Ignored while typing in a field (e.g. the seed
// box) and whenever a modifier is held, so browser/OS shortcuts still work.
function wireKeyboard() {
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;

    switch (e.key) {
      case " ":
        togglePause();
        break;
      case ".":
        stepOnce();
        break;
      case "r":
      case "R":
        resetWorld(config.seed);
        break;
      case "f":
      case "F":
        world.addFood(60);
        break;
      case "l":
      case "L":
        world.addRandomCreatures(12);
        break;
      case "n":
      case "N": {
        const seed = Math.floor(Math.random() * 1e9);
        $("seed-input").value = seed;
        resetWorld(seed);
        break;
      }
      case "v":
      case "V": {
        const box = $("toggle-vision");
        box.checked = !box.checked;
        renderer.showVision = box.checked;
        break;
      }
      case "+":
      case "=":
        renderer.camera.zoomBy(ZOOM_STEP);
        break;
      case "-":
      case "_":
        renderer.camera.zoomBy(1 / ZOOM_STEP);
        if (renderer.camera.zoom === 1) renderer.camera.setTarget(null);
        break;
      case "0":
        renderer.camera.reset();
        break;
      case "h":
      case "H":
        toggleChartScope();
        break;
      default:
        return; // let every other key pass through untouched
    }
    e.preventDefault();
  });
}

// ---- Controls ----
function wireControls() {
  $("btn-pause").addEventListener("click", togglePause);

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
  $("toggle-motion").addEventListener("change", (e) => {
    renderer.reducedMotion = e.target.checked;
  });
  $("toggle-follow").addEventListener("change", (e) => {
    if (!e.target.checked) {
      renderer.camera.setTarget(null);
      return;
    }
    const c = renderer.selected;
    if (!c || c.dead) {
      e.target.checked = false;
      flash("Click a creature first, then follow it.");
      return;
    }
    renderer.camera.setTarget(c);
  });
  $("toggle-seasons").checked = config.seasons;
  $("toggle-seasons").addEventListener("change", (e) => {
    config.seasons = e.target.checked;
    syncHash();
  });
  $("toggle-patches").checked = config.foodPatches;
  $("toggle-patches").addEventListener("change", (e) => {
    config.foodPatches = e.target.checked;
    syncHash();
  });
  $("toggle-drift").checked = config.biomeDrift > 0;
  $("toggle-drift").addEventListener("change", (e) => {
    // Live-toggleable: drift directions are fixed, so this just starts/stops
    // the biomes roaming from wherever they currently are.
    config.biomeDrift = e.target.checked ? DRIFT_SPEED : 0;
    syncHash();
  });
  $("toggle-predation").checked = config.predation;
  $("toggle-predation").addEventListener("change", (e) => {
    config.predation = e.target.checked;
    syncHash();
  });
  $("toggle-scavenging").checked = config.scavenging;
  $("toggle-scavenging").addEventListener("change", (e) => {
    config.scavenging = e.target.checked;
    syncHash();
  });
  $("toggle-kin").checked = config.kinRecognition;
  $("toggle-kin").addEventListener("change", (e) => {
    config.kinRecognition = e.target.checked;
    syncHash();
  });
  $("toggle-daynight").checked = config.dayNightCycle;
  $("toggle-daynight").addEventListener("change", (e) => {
    config.dayNightCycle = e.target.checked;
    syncHash();
  });
  $("toggle-disease").checked = config.disease;
  $("toggle-disease").addEventListener("change", (e) => {
    config.disease = e.target.checked;
    // Switching it off cures the pond outright: infection state is only ever
    // read while the feature is on, so leaving creatures flagged sick would keep
    // them paying the fever's energy cost with nothing left to end it.
    if (!config.disease) {
      for (const c of world.creatures) {
        c.infected = false;
        c.immune = false;
        c.infectedAtAge = -1;
      }
    }
    syncHash();
  });
  $("toggle-regrowth").checked = config.foodRegrowth;
  $("toggle-regrowth").addEventListener("change", (e) => {
    config.foodRegrowth = e.target.checked;
    syncHash();
  });
  $("toggle-terrain").checked = config.terrain;
  $("toggle-terrain").addEventListener("change", (e) => {
    config.terrain = e.target.checked;
    // Build (or drop) the landscape right away rather than at the next reset,
    // so the toggle does something you can see in the same frame you flip it.
    world.syncTerrain();
    syncHash();
  });
  $("toggle-signalling").checked = config.signalling;
  $("toggle-signalling").addEventListener("change", (e) => {
    config.signalling = e.target.checked;
    // Rebuild every living brain so the ear is wired in (or unwired) at once —
    // the same reason the plasticity toggle does it. Newborns pick the flag up
    // from the config on their own. Switching it off also clears what everyone
    // was hearing, so no creature is left holding a call nobody can make.
    for (const c of world.creatures) {
      c.brain = buildBrainFor(c.genome, config);
      if (!config.signalling) c.heard = 0;
    }
    syncHash();
  });
  $("toggle-sexual").checked = config.sexualReproduction;
  $("toggle-sexual").addEventListener("change", (e) => {
    config.sexualReproduction = e.target.checked;
    syncHash();
  });
  $("toggle-plasticity").checked = config.plasticity;
  $("toggle-plasticity").addEventListener("change", (e) => {
    config.plasticity = e.target.checked;
    // Rebuild every living brain so the change takes effect immediately (new
    // brains start learning; turning it off freezes them at their current
    // weights). Newborns pick up the flag automatically via the config.
    for (const c of world.creatures) c.brain = buildBrainFor(c.genome, config);
    syncHash();
  });
  $("toggle-neat").checked = config.evolvableTopology;
  $("toggle-neat").addEventListener("change", (e) => {
    config.evolvableTopology = e.target.checked;
    // Fixed-topology and NEAT genomes are different data structures, so flipping
    // this restarts the world with fresh genomes of the chosen kind.
    resetWorld(config.seed);
    flash(config.evolvableTopology ? "Evolvable brains on — world restarted." : "Fixed brains restored — world restarted.");
  });

  applyMortalityColours();

  // Save / load / share.
  $("btn-save").addEventListener("click", saveWorld);
  $("btn-load").addEventListener("click", loadWorld);
  $("btn-share").addEventListener("click", shareLink);
  $("btn-export-csv").addEventListener("click", exportCSV);

  // Chart scope. This button lives in the static legend, not inside a panel
  // that gets rebuilt from innerHTML every frame, so a click that spans several
  // frames still lands on the element it started on.
  $("chart-scope").addEventListener("click", toggleChartScope);

  // Tree of Life: clear the lineage spotlight.
  $("btn-clear-highlight").addEventListener("click", () => {
    renderer.highlightSpeciesId = null;
    legendSig = "";
    $("btn-clear-highlight").classList.add("hidden");
  });
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
  renderer.setConfig(config);
  renderer.selected = null;
  renderer.highlightSpeciesId = null; // species ids don't carry across worlds
  legendSig = "";
  lastChronKey = ""; // force the chronicle feed to re-render for the new world
  $("btn-clear-highlight").classList.add("hidden");
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

// ---- Canvas interaction: select, pan, zoom, follow ----
// A press that barely moves is a click and selects a creature; a press that
// travels drags the view. Telling them apart by distance rather than by a timer
// keeps a slow, deliberate click on a small creature working. Pointer events
// (not mouse events) so a finger on a phone pans the same way.
const DRAG_SLOP = 4; // px of travel a press may make and still count as a click

function wireCanvas(canvas) {
  const cam = () => renderer.camera;
  let press = null;

  // Client pixels → canvas pixels (the canvas is laid out responsively, so the
  // two only coincide at full width).
  const toCanvas = (e) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (config.width / rect.width),
      y: (e.clientY - rect.top) * (config.height / rect.height),
    };
  };

  const pickAt = (e) => {
    const p = toCanvas(e);
    const w = cam().screenToWorld(p.x, p.y);
    return renderer.pick(world, w.x, w.y);
  };

  canvas.addEventListener("pointerdown", (e) => {
    const p = toCanvas(e);
    press = { x: p.x, y: p.y, travel: 0, id: e.pointerId };
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!press || e.pointerId !== press.id) return;
    const p = toCanvas(e);
    const dx = p.x - press.x;
    const dy = p.y - press.y;
    press.travel += Math.abs(dx) + Math.abs(dy);
    if (press.travel > DRAG_SLOP) {
      // Taking the view by hand releases the follow lock.
      cam().setTarget(null);
      cam().panByScreen(dx, dy);
    }
    press.x = p.x;
    press.y = p.y;
  });

  canvas.addEventListener("pointerup", (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (press.travel <= DRAG_SLOP) {
      renderer.selected = pickAt(e);
      // Following, then clicking someone else, hands the camera over.
      if (cam().target) cam().setTarget(renderer.selected);
    }
    press = null;
  });

  canvas.addEventListener("pointercancel", () => {
    press = null;
  });

  // Wheel zooms about the cursor, so you magnify what you were looking at.
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const p = toCanvas(e);
      cam().zoomBy(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, p.x, p.y);
      if (cam().zoom === 1) cam().setTarget(null);
    },
    { passive: false }
  );

  // Double-click a creature to ride along with it; double-click open water to
  // fall back to the whole pond.
  canvas.addEventListener("dblclick", (e) => {
    const c = pickAt(e);
    if (c) {
      renderer.selected = c;
      cam().setTarget(c);
      flash(`Following creature #${c.id} — drag, or press 0, to let go.`);
    } else {
      cam().reset();
    }
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
    renderer.setConfig(config);
    renderer.selected = null;
    $("seed-input").value = config.seed;
    syncHash();
    flash("World loaded.");
  } catch (err) {
    flash("Could not load world.");
  }
}

// Swap the chart between the recent window and the whole run. The export
// follows the chart, so what you download is what you are looking at.
function toggleChartScope() {
  chartScope = chartScope === "whole" ? "recent" : "whole";
  const btn = $("chart-scope");
  const whole = chartScope === "whole";
  btn.textContent = whole ? "whole run" : "recent";
  btn.setAttribute("aria-pressed", whole ? "true" : "false");
  flash(whole ? "Chart showing the whole run." : "Chart showing the recent window.");
}

// Download the population/food/generation chart as a CSV file, so a visitor can
// pull the raw numbers into a spreadsheet of their own. It exports whichever
// scope the chart is showing: the recent window as it always did, or the whole
// run — which also carries the min/max each thinned row stands for, so nothing
// in the file understates a peak the archive actually saw.
function exportCSV() {
  const csv = world.stats.toCSV(chartScope);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const scope = chartScope === "whole" ? "run" : "recent";
  a.download = `vivarium-seed${config.seed}-tick${world.tick}-${scope}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  flash(chartScope === "whole" ? "Whole-run data exported." : "Recent chart data exported.");
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
