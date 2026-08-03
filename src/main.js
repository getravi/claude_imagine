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
import { drawMuller, mullerShares, textureCss } from "./mullerplot.js";
import { buildBrainFor, groundSway } from "./creature.js";
import { SCENARIOS } from "./scenarios.js";
import { ZOOM_STEP } from "./camera.js";
import { Gestures } from "./gestures.js";
import { drawMinimap, minimapLayout, minimapToWorld } from "./minimap.js";
import { drawChart, popAxis, axisLabels } from "./chart.js";
import {
  wholePercents,
  mortalitySeries,
  deathCosts,
  DEATH_CAUSES,
  POWER_WINDOW,
} from "./stats.js";
import {
  mortalityColours,
  energyColours,
  chartLines,
  powerLine,
  lineageFill,
  rgbCss,
  inspectorTrack,
  brainGraphBackground,
  weightMark,
  weightMarkTones,
  brainEdge,
  brainNodeColours,
} from "./palette.js";
import { EnergyLedger, ENERGY_SINKS, energySeries } from "./energy.js";
import {
  describeChart,
  describeMuller,
  describePond,
  describePower,
  pendingSpeech,
  seasonLabel,
  timeOfDayLabel,
} from "./describe.js";

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
  if (p.has("det")) o.detritus = p.get("det") === "1";
  if (p.has("eye")) o.exactVision = p.get("eye") === "1";
  if (p.has("feel")) o.groundSense = p.get("feel") === "1";
  if (p.has("rock")) o.barriers = p.get("rock") === "1";
  if (p.has("dark")) o.barrierOcclusion = p.get("dark") === "1";
  if (p.has("fin")) o.deathIsFinal = p.get("fin") === "1";
  if (p.has("ord")) o.shuffleTurnOrder = p.get("ord") === "1";
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
  p.set("det", config.detritus ? "1" : "0");
  p.set("eye", config.exactVision ? "1" : "0");
  p.set("feel", config.groundSense ? "1" : "0");
  p.set("rock", config.barriers ? "1" : "0");
  p.set("dark", config.barrierOcclusion ? "1" : "0");
  p.set("fin", config.deathIsFinal ? "1" : "0");
  p.set("ord", config.shuffleTurnOrder ? "1" : "0");
  history.replaceState(null, "", "#" + p.toString());
}

// The season and time-of-day badges' text now lives in `describe.js`, so that
// the badge a visitor reads and the sentence a listener hears come from one
// place — and so a test can reach either. A label this file computes privately
// is a label nothing can check.

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
  setToggle("toggle-detritus", config.detritus);
  setToggle("toggle-exactvision", config.exactVision);
  setToggle("toggle-groundsense", config.groundSense);
  setToggle("toggle-barriers", config.barriers);
  setToggle("toggle-occlusion", config.barrierOcclusion);
  setToggle("toggle-deathfinal", config.deathIsFinal);
  setToggle("toggle-turnorder", config.shuffleTurnOrder);
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
  updateChart(world);
  drawDeaths(world);
  drawPower(world);
  drawPhylogeny(world);
  updateHUD();
  updateSeasonBadge(world);
  updateInspector();
  updateChronicle(world);
  updateNarration(world);

  requestAnimationFrame(loop);
}

// ---- The spoken pond ----
//
// The canvas gets a description of what is in it, and a polite live region gets
// the Chronicle's newest line. Both come from `describe.js`, which is where the
// wording and the "should this be said at all?" rules are tested; this function
// is only the adapter onto the DOM, the same division `gestures.js` uses.
const DESCRIBE_EVERY = 15; // frames between rewrites of the canvas description
let narratedWorld = null;
let spokenLine = null;
let pendingSay = "";
let pondLabel = "";
let describeIn = 0;

function updateNarration(world) {
  // Keyed on the world *object*, not on a seed or a tick: a reset, a scenario
  // and a load all build a new World, and a new object cannot find the old
  // one's state — so an arriving world always primes silently instead of
  // reading out the chronicle it inherited. Unrepresentable beats guarded.
  if (world !== narratedWorld) {
    narratedWorld = world;
    spokenLine = null;
    pendingSay = "";
    describeIn = 0;
  }

  // Announcements go out over two frames — blank, then text — because a live
  // region whose content is rewritten to the same string may not fire at all,
  // and the Chronicle can legitimately say the same sentence twice (two dawns
  // are two events). A real mutation every time costs one frame and removes the
  // question.
  const say = $("pond-say");
  if (pendingSay) {
    say.textContent = pendingSay;
    pendingSay = "";
  } else {
    const said = pendingSpeech(world.chronicle.events, spokenLine);
    spokenLine = said.spoken;
    if (said.text) {
      say.textContent = "";
      pendingSay = said.text;
    }
  }

  // The description is a state, not an event: nothing announces it, a listener
  // reads it when their cursor lands on the pond. Rebuilding it every frame
  // would be wasted work, and writing it unchanged would be a DOM write for
  // nothing.
  if (describeIn-- > 0) return;
  describeIn = DESCRIBE_EVERY;
  const label = describePond(world, config, renderer.camera);
  if (label === pondLabel) return;
  pondLabel = label;
  $("world").setAttribute("aria-label", label);
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
  // zoom got there (wheel, keyboard, or following someone). A hand needs more
  // than a cursor: the canvas has to stop conceding vertical swipes to the page
  // scroller, or half of every drag goes missing. Back to the stylesheet's
  // `pan-y` at zoom 1, where there is nothing to pan and the reader wants to
  // scroll past.
  $("world").style.cursor = cam.zoom > 1 ? "grab" : "";
  $("world").style.touchAction = cam.zoom > 1 ? "none" : "";
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
  const { icon, name, year } = seasonLabel(world.tick, config);
  let html =
    `<span class="icon">${icon}</span> ${name}` +
    (year ? ` <span class="yr">· year ${year}</span>` : "");
  if (config.dayNightCycle) {
    const t = timeOfDayLabel(world.tick, config);
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
  // The shares are computed once and used twice: the picture and its spoken
  // form are the same numbers, which is the only way they cannot drift apart.
  const shares = mullerShares(ph);
  const shown = drawMuller(mullerCtx, shares, {
    width: canvas.width,
    height: canvas.height,
    highlightId: renderer.highlightSpeciesId,
  });
  setMullerLabel(describeMuller(shares, ph.snapshotSpan()));

  $("phylo-info").textContent =
    `${ph.livingCount()} species alive · ${ph.species.length} ever · ` +
    `${ph.species.filter((s) => s.extinctTick >= 0).length} extinct`;

  // The plot's x-axis changes meaning as the record coarsens, so it says so —
  // the same caption the whole-run chart carries, for the same reason.
  const span = ph.snapshotSpan();
  const each = ph.snapshotResolution();
  const range = span
    ? `ticks ${span.from.toLocaleString()}–${span.to.toLocaleString()} · ` +
      `1 band per ${each.toLocaleString()} tick${each === 1 ? "" : "s"}`
    : "";
  const rangeEl = $("phylo-range");
  if (rangeEl.textContent !== range) rangeEl.textContent = range;

  // Rebuild the legend only when the set of shown species (or highlight) changes.
  // The chips are ordered by abundance and the bands by age, so the hatch — the
  // only part of the key that survives two lineages sharing an inherited hue —
  // travels by species id rather than by position.
  const hatch = new Map(shares.shown.map((s, k) => [s.id, shares.texture[k]]));
  const living = shown.filter((s) => s.count > 0).sort((a, b) => b.count - a.count);
  const sig = living.map((s) => s.id).join(",") + "|" + renderer.highlightSpeciesId;
  if (sig !== legendSig) {
    legendSig = sig;
    buildLegend(living, hatch);
  } else {
    // Cheap in-place count refresh.
    for (const s of living) {
      const el = document.getElementById("chip-n-" + s.id);
      if (el) el.textContent = s.count;
    }
  }
}

/** The Tree of Life's spoken form, written only when it changes. */
let mullerLabel = "";
function setMullerLabel(text) {
  if (text === mullerLabel) return;
  mullerLabel = text;
  $("muller").setAttribute("aria-label", text);
}

function buildLegend(living, hatch) {
  const box = $("species-legend");
  box.innerHTML = "";
  for (const s of living.slice(0, 16)) {
    // A button, not a div, since v1.51. The section's own prose says "click one
    // to spotlight it in the pond above" and for twenty-nine versions that was
    // true only of a mouse: a div with a click handler is not focusable, not
    // operable by Enter or Space, and announces neither that it can be pressed
    // nor whether it currently is. `aria-pressed` carries the state the `active`
    // class carries visually, which is the same toggle said twice.
    const on = renderer.highlightSpeciesId === s.id;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (on ? " active" : "");
    chip.setAttribute("aria-pressed", on ? "true" : "false");
    // The dot wears the band's hatch and the band's colour, both from the same
    // module the plot draws from — the dot had its own hand-written `70%, 55%`
    // here until v1.46, one shade off the thing it was a key to.
    chip.innerHTML =
      `<span class="dot" style="background:${textureCss(hatch.get(s.id) || 0, s.hue)};` +
      `color:${lineageFill(s.hue, "dot")}"></span>` +
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
  // How much of the water is inside catching distance of somebody sick — the
  // number the blue field in the pond and the minimap draws. Zero on its own
  // whenever nobody is ill, which is every world with no pathogen in it.
  $("stat-reach").textContent = config.disease
    ? `${Math.round(s.hazardShare * 100)}%`
    : "off";
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
  // Barriers: how often the rock is refusing a move, per hundred ticks over the
  // trailing window. The walls are visible and the detours are not, so this is
  // the number that says what the layout is actually costing — and it is a rate
  // rather than the run's total, which would stop moving by tick 3,000. Reads
  // exactly 0 with no walls in the pond, so it says "off" instead.
  $("stat-walled").textContent = config.barriers ? `${s.walledRate.toFixed(1)}/100t` : "off";
  // Detritus: what share of the crop is currently growing out of the pond's own
  // dead, averaged over the last few hundred ticks. Exactly 0 without a nutrient
  // field, so it says "off" rather than showing a steady, plausible zero.
  $("stat-soil").textContent = config.detritus
    ? `${Math.round(s.soilShare * 100)}%`
    : "off";
  $("stat-brain").textContent = config.evolvableTopology
    ? `${s.avgConns.toFixed(0)}c ${s.avgHidden.toFixed(1)}h`
    : "fixed";
  updateMortality(s);
  updateEnergy();
}

// How much energy is standing in this pond right now — every living body plus
// every corpse — and what has become of everything it ever made.
//
// The two numbers are worth putting next to each other: the standing stock is a
// rounding error beside the throughput, because this world does not store its
// energy, it runs it straight through. Nothing here is a config toggle, so
// unlike Ground or Soil there is no "off" state to report; the books are always
// open.
//
// Power is the third, and the only one on this panel that moves: energy minted
// per tick over the last 120 ticks, differenced out of the cumulative books the
// history now carries. Everything else here is run-to-date and therefore
// settles into a number that cannot change, which is the v1.22 complaint about
// readouts that look live and are not. On the default seed this runs between
// about 5 and 78 over a single run — a fifteenfold swing no previous version of
// this panel could have shown you.
let energyLabel = "";
function updateEnergy() {
  const e = world.energy;
  $("stat-standing").textContent = Math.round(EnergyLedger.standing(world)).toLocaleString();
  $("stat-power").textContent = `${world.stats.power.toFixed(1)}/t`;
  $("nrg-made").textContent = `${Math.round(e.created).toLocaleString()} minted`;

  const shares = e.shares();
  if (!shares) return;
  const pct = wholePercents(ENERGY_SINKS.map((k) => shares[k]));
  // Bar and caption come from the same integers, and the integers sum to 100 —
  // the v1.26 rule, which matters more here than anywhere else in the panel
  // because one segment is normally around 90% and the eye has nothing else to
  // check the arithmetic against.
  ENERGY_SINKS.forEach((k, i) => {
    $(`nrg-${k}`).style.width = `${pct[i]}%`;
  });
  const [burned, lost, buried] = pct;
  const text = `${burned}% burned living · ${lost}% lost · ${buried}% buried`;
  if (energyLabel === text) return;
  energyLabel = text;
  $("nrg-legend").textContent = text;
  $("nrg-bar").setAttribute(
    "aria-label",
    `Of all the energy this world has spent: ${text.replace(/ · /g, ", ")}.`
  );
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

  // And what each of them costs, which the bar above cannot say and the energy
  // bar below it cannot either. Run-to-date rather than over the death window,
  // because this is a per-body figure and not a mix: it is what one death of
  // each kind takes out of the pond, and averaging it over more bodies makes it
  // truer rather than staler. Old age is normally two to three thousand times
  // the other two — see docs/SCIENCE.md.
  const cost = deathCosts(s.deathsBy, world.energy.buriedBy);
  if (cost) {
    // Named rather than indexed, like the shares above it, so the words and the
    // causes cannot drift apart. Whole units: the interesting thing about the
    // first and third is that they round to nothing.
    const per = (c) => Math.round(cost.causes[c].perDeath);
    $("mort-cost").textContent =
      `buried with each: ${per("starvation")}⚡ starved · ` +
      `${per("age")}⚡ aged · ${per("predation")}⚡ hunted`;
  }
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
//
// The figure itself lives in `src/chart.js` — the drawing, the scale, and the
// y-axis it gained in v1.41 — so that the suite can reach all three. What is
// left here is the adapter: find the canvas, choose the scope, and put the axis
// numbers into the DOM, which is where text belongs on a canvas that gets
// stretched to three times its backing width on a phone.
let chartScope = "recent";
let chartCtx = null;
function updateChart(world) {
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
  const axis = popAxis(world.stats.maxPopEver);
  const foodMax = Math.max(10, config.foodMax);

  drawChart(ctx, W, H, hist, { axis, foodMax, whole });
  updateChartAxis(axis, H, foodMax);
  updateChartRange(world, hist);
  setChartLabel(describeChart(hist, axis, foodMax));
}

// The axis numbers, as DOM text in the gutter beside the canvas. Rebuilt only
// when the ceiling actually moves — which is the point of a round ceiling, and the v1.15 rule
// about not replacing elements inside the animation loop.
let chartAxisKey = "";
function updateChartAxis(axis, H, foodMax) {
  const key = `${axis.ticks.join(",")}|${foodMax}`;
  if (key === chartAxisKey) return;
  chartAxisKey = key;
  const box = $("chart-ticks");
  box.innerHTML = "";
  for (const label of axisLabels(axis, H)) {
    const el = document.createElement("span");
    el.textContent = label.text;
    el.style.top = `${(label.frac * 100).toFixed(3)}%`;
    // The population line's own colour: the only thing that says which of this
    // figure's two scales the numbers belong to.
    el.style.color = chartLines().pop;
    box.appendChild(el);
  }
  // Food's scale never moves, so it is stated once in words instead of marked.
  $("food-scale").textContent = `0–${foodMax.toLocaleString()}`;
}

/** The chart's spoken form, written only when it changes. */
let chartLabel = "";
function setChartLabel(text) {
  if (text === chartLabel) return;
  chartLabel = text;
  $("chart").setAttribute("aria-label", text);
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

// ---- The power strip ----
//
// Under the death strip, on the same x-axis and the same recent/whole scope:
// what the pond mints per tick, and what it spends. The books have been kept
// since v1.29 and read as a rate since v1.35, and until now the only place that
// rate appeared was a stat tile and a CSV column — a chart with no line, in a
// project whose whole argument is that a number nobody can see is a number
// nobody checks.
//
// The two lines are drawn to one shared scale, because the thing worth seeing
// is not either curve but the gap: `created − destroyed === standing`, so the
// pond's stock of energy rises exactly where the minting line is above the
// spending one. Scaling the two independently would put those crossings
// wherever the arithmetic felt like it. The band between them is filled for the
// same reason — it is the only quantity in this figure that the identity makes
// exact.
//
// Heights are normalised to the busiest interval on screen, like the death
// strip, and for the same reason: this says *when* the pond was working hard,
// not how it compares to another run. The caption carries the absolute peak.
let powerCtx = null;
let powerLabel = "";
function drawPower(world) {
  if (!powerCtx) {
    const c = $("power");
    powerCtx = c.getContext("2d");
    powerCtx._w = c.width;
    powerCtx._h = c.height;
  }
  const ctx = powerCtx;
  const W = ctx._w;
  const H = ctx._h;
  ctx.clearRect(0, 0, W, H);

  const hist = chartScope === "whole" ? world.stats.runHistory.series() : world.stats.popHistory;
  // The same window the live Power tile differences over, so the right-hand
  // end of this line is the number in that tile rather than a cousin of it.
  const series = energySeries(hist, POWER_WINDOW);
  const { intervals, scale } = series;
  const caption = describePower(series);
  setPowerCaption(caption.peak, caption.label);
  if (!intervals.length || scale <= 0) return;

  // A trailing mean belongs at the *end* of the window it covers — the same x
  // position the chart above puts that history point at, so a dip in the line
  // sits under the moment the population chart shows it happening.
  const span = Math.max(1, hist.length - 1);
  const xOf = (iv) => (iv.index / span) * W;
  const yOf = (v) => H - Math.max(0, v / scale) * (H - 3) - 1.5;
  const c = powerLine();

  // The band first, under both lines: the standing stock moving.
  ctx.beginPath();
  for (let i = 0; i < intervals.length; i++) {
    const x = xOf(intervals[i]);
    const y = yOf(intervals[i].power);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = intervals.length - 1; i >= 0; i--) {
    ctx.lineTo(xOf(intervals[i]), yOf(intervals[i].spend));
  }
  ctx.closePath();
  ctx.fillStyle = c.band;
  ctx.fill();

  // Spend under minting, so the solid line reads as the top of the figure.
  strokeIntervals(ctx, intervals, xOf, yOf, (iv) => iv.spend, c.line, c.dash);
  strokeIntervals(ctx, intervals, xOf, yOf, (iv) => iv.power, c.line, []);
}

/** One rate as a line across the strip. `dash` is what tells the two apart. */
function strokeIntervals(ctx, intervals, xOf, yOf, valueOf, stroke, dash) {
  ctx.beginPath();
  for (let i = 0; i < intervals.length; i++) {
    const x = xOf(intervals[i]);
    const y = yOf(valueOf(intervals[i]));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.setLineDash(dash);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Both texts under the power strip, written only when they change. */
function setPowerCaption(peakText, label) {
  const el = $("power-peak");
  if (el.textContent !== peakText) el.textContent = peakText;
  if (powerLabel !== label) {
    powerLabel = label;
    $("power").setAttribute("aria-label", label);
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
  // The energy bar, from the same module and for the same reason. Its colours
  // were chosen to clear the three above under every vision model — see
  // `energyColours()` — which is a guarantee that only holds while both bars
  // are painted from the file the test measures.
  const n = energyColours();
  for (const k of ENERGY_SINKS) paint(`nrg-${k}`, n[k]);
  // The power strip's two swatches. They are the same colour on purpose — what
  // separates the lines is that one of them is dashed — so the legend has to be
  // dashed too, or it teaches the wrong key to the figure below it.
  const p = powerLine();
  const [on, off] = p.dash;
  paint("line-made", p.line);
  $("line-spent").style.background =
    `repeating-linear-gradient(to right, ${p.line} 0 ${on}px, transparent ${on}px ${on + off}px)`;
}

/**
 * The inspector's two plates — the weight strip's cell track and the brain
 * diagram's background — painted from `src/palette.js` onto custom properties
 * the stylesheet reads. Both were literals in `style.css` until v1.49, which is
 * v1.26's rule exactly: a colour a test cannot reach is a colour that will
 * drift, and these two are the backgrounds every mark in the panel is measured
 * against. Runs once, at startup.
 */
function applyInspectorColours() {
  const root = document.documentElement.style;
  root.setProperty("--insp-track", rgbCss(inspectorTrack()));
  root.setProperty("--braingraph-bg", rgbCss(brainGraphBackground()));
  const t = weightMarkTones();
  root.setProperty("--weight-pos", rgbCss(t.positive));
  root.setProperty("--weight-neg", rgbCss(t.negative));
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
  // The key decides when the panel's *structure* is rebuilt, so anything that
  // adds or removes a row belongs in it — otherwise flipping the toggle leaves
  // a panel with no Underfoot row to patch, or one nothing updates.
  const key = c.id + "|" + chain.map((s) => s.id).join(",") + "|" + (config.groundSense ? "f" : "");
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
  const foot = document.getElementById("insp-foot");
  if (foot) {
    // "roughness here — how much of its turn and thrust that is worth". The
    // second number is a hypothetical put to this creature's own brain, not a
    // claim that the ground is steering the pond; docs/SCIENCE.md measures what
    // selection does with it, which is nothing.
    foot.textContent = `${Math.round(c.groundFeel * 100)}% rough — sways steering ${groundSway(
      c
    ).toFixed(2)}`;
  }
  const learned = document.getElementById("insp-learned");
  // Repainted every frame, so it needs the name every frame: a figure that is
  // named when it is built and anonymous when it is refreshed is named for one
  // tick. (It said "Brain" here and "Brain as learned so far" above it, which is
  // the same figure introducing itself twice under two names.)
  if (learned) learned.innerHTML = sparkFromWeights(c.brain.w, "Brain as learned so far");
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
    <dl class="insp-grid">
      <div><dt>Generation</dt><dd>${c.generation}</dd></div>
      <div><dt>Age</dt><dd id="insp-age">${c.age}</dd></div>
      <div><dt>Energy</dt><dd id="insp-energy">—</dd></div>
      <div><dt>Children</dt><dd id="insp-children">${c.children}</dd></div>
      <div><dt>Size</dt><dd>${c.radius.toFixed(1)}</dd></div>
      <div><dt>Metabolism</dt><dd>${c.metabolismScale.toFixed(2)}×</dd></div>
      <div class="insp-wide"><dt>Diet</dt><dd>${dietLabel}</dd></div>
      ${
        // The ground sense, per creature: what it is standing on, and how much
        // of its steering that fact is deciding right now. Both are live, so
        // they are patched rather than rebuilt (see the v1.15 lesson).
        config.groundSense
          ? `<div class="insp-wide"><dt>Underfoot 👣</dt><dd id="insp-foot">—</dd></div>`
          : ""
      }
      <div class="insp-wide"><dt>Species</dt>
        <dd><a href="#" id="insp-species">${c.speciesId} — spotlight lineage ›</a></dd></div>
      ${ancestryRow(c, chain)}
    </dl>
    ${
      // The captions used to be `<label>` too, and these two label *figures*
      // rather than values, so they are captions (`p`) and the figure carries
      // the name itself. v1.42 said every canvas on the page has an accessible
      // name; neither of these is a canvas — one is a strip of spans and the
      // other an SVG — so the sweep walked past both, and they had none at all.
      c.genome.conns // NEAT genome: show the evolved network graph
        ? `<div class="brainwrap"><p class="fig-label">Brain — evolved network (${
            c.genome.complexity.conns
          } connections, ${c.genome.complexity.nodes} hidden) 🧬</p>${brainGraphSVG(
            c.genome
          )}</div>`
        : `<div class="brainwrap"><p class="fig-label">Brain — inherited</p>${sparkFromWeights(
            c.genome.brainWeights,
            "Inherited brain"
          )}${
            c.brain.plastic
              ? `<p class="fig-label learned-label">Brain — current (learned) 🧠</p><div id="insp-learned">${sparkFromWeights(
                  c.brain.w,
                  "Brain as learned so far"
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
  return `<div class="insp-wide"><dt>Ancestry — ${branchings} branching${
    branchings === 1 ? "" : "s"
  } deep</dt>
    <dd class="ancestry">${
      elided ? `<span class="anc-arrow" title="${elided} older ancestors">…</span>` : ""
    }${pips}</dd></div>`;
}

// Render a weight vector as a tiny bar strip — a visual "fingerprint" of the
// brain. Positive weights are blue bars standing on the floor of their cell,
// negative ones red bars hanging from the ceiling, and the height is the
// magnitude. Colours and heights both come from `weightMark()`; see the note
// there for why the magnitude stopped being an opacity in v1.49. With
// plasticity on, showing this for both the inherited and current weights makes
// within-lifetime learning visible as the strip shifts.
function sparkFromWeights(w, name = "Brain") {
  const n = Math.min(w.length, 120);
  const track = rgbCss(inspectorTrack());
  // A figure made of 120 unnamed spans says nothing at all to a screen reader,
  // so it gets a name — and a name that reports the picture rather than merely
  // announcing that a picture is here. The shape of a brain, in one sentence:
  // how many weights, how they split by sign, and how strong the strongest is.
  let pos = 0;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    if (w[i] > 0) pos++;
    if (Math.abs(w[i]) > peak) peak = Math.abs(w[i]);
  }
  const label =
    `${name}: ${n} weight${n === 1 ? "" : "s"}, ${pos} excitatory and ${n - pos} inhibitory, ` +
    `strongest ${peak.toFixed(2)}.`;
  let html = `<div class="genome" role="img" aria-label="${label}">`;
  for (let i = 0; i < n; i++) {
    const m = weightMark(w[i]);
    const pct = (m.fill * 100).toFixed(0);
    // A bar and its track in one background, so a cell is still one element.
    const dir = m.sign > 0 ? "to top" : "to bottom";
    html += `<span style="background:linear-gradient(${dir},${m.colour} 0 ${pct}%,${track} ${pct}% 100%)"></span>`;
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
    // Sign by hue, magnitude by width. The opacity is constant — see
    // `BRAIN_EDGE_ALPHA` for what it used to be and what that cost.
    const e = brainEdge(c.w);
    edges += `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(
      1
    )}" y2="${b[1].toFixed(1)}" stroke="${e.colour}" stroke-width="${e.width.toFixed(2)}"/>`;
  }
  const role = brainNodeColours();
  let nodes = "";
  for (const [id, [x, y]] of pos) {
    let fill = role.hidden;
    let r = 4;
    if (id < nIn) {
      fill = role.input; // senses
      r = 3;
    } else if (id < nIn + nOut) {
      fill = role.output; // motors
    }
    nodes += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${fill}"/>`;
  }
  // The diagram has said green, white and orange since v1.5 without ever saying
  // what any of them meant; the colours are load-bearing here, so they get a key.
  const key = ["input", "hidden", "output"]
    .map(
      (k) =>
        `<span class="bg-chip"><i style="background:${role[k]}"></i>${
          { input: "senses", hidden: "hidden", output: "motors" }[k]
        }</span>`
    )
    .join("");
  // Named, like every other figure on the page: an SVG with no accessible name
  // is an unlabelled graphic, and this one is the whole point of NEAT being on.
  const label =
    `Evolved brain: ${nIn} senses on the left, ${hidden.length} hidden neuron` +
    `${hidden.length === 1 ? "" : "s"} in the middle, ${nOut} motors on the right, ` +
    `wired by ${genome.complexity.conns} live connections.`;
  return `<svg class="braingraph" role="img" aria-label="${label}" viewBox="0 0 ${W} ${H}" width="100%" height="${H}">${edges}${nodes}</svg><div class="bg-key">${key}<span class="bg-chip"><i class="bg-pos"></i>+ weight</span><span class="bg-chip"><i class="bg-neg"></i>− weight</span></div>`;
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
  $("toggle-barriers").checked = config.barriers;
  $("toggle-barriers").addEventListener("change", (e) => {
    config.barriers = e.target.checked;
    // Build (or drop) the rock in the same frame. Switching it on pushes any
    // creature or pellet standing where a wall now is out onto open ground —
    // see world.syncBarriers — so the pond does not spend its next hundred ticks
    // walking out of the scenery.
    world.syncBarriers();
    syncHash();
  });
  $("toggle-occlusion").checked = config.barrierOcclusion;
  $("toggle-occlusion").addEventListener("change", (e) => {
    config.barrierOcclusion = e.target.checked;
    // Nothing to rebuild: opacity is a property of the queries, not of the
    // layout, so the very next tick asks a different question of the same rock.
    syncHash();
  });
  $("toggle-detritus").checked = config.detritus;
  $("toggle-detritus").addEventListener("change", (e) => {
    config.detritus = e.target.checked;
    // Build (or drop) the nutrient field at once. Switching it off clears the
    // pond's memory outright rather than leaving a map nothing is maintaining.
    world.syncDetritus();
    syncHash();
  });
  $("toggle-exactvision").checked = config.exactVision;
  $("toggle-exactvision").addEventListener("change", (e) => {
    config.exactVision = e.target.checked;
    syncHash();
  });
  $("toggle-deathfinal").checked = config.deathIsFinal;
  $("toggle-deathfinal").addEventListener("change", (e) => {
    // Nothing to rebuild: the flag is read fresh at the top of every turn, so
    // switching it mid-run takes effect on the very next tick. A body already
    // lying in the pond is swept this tick either way.
    config.deathIsFinal = e.target.checked;
    syncHash();
  });
  $("toggle-turnorder").checked = config.shuffleTurnOrder;
  $("toggle-turnorder").addEventListener("change", (e) => {
    // Nothing to rebuild: the order is drawn fresh at the top of every tick, so
    // this takes effect on the next one and nothing already in the pond cares.
    config.shuffleTurnOrder = e.target.checked;
    syncHash();
  });
  $("toggle-groundsense").checked = config.groundSense;
  $("toggle-groundsense").addEventListener("change", (e) => {
    config.groundSense = e.target.checked;
    // Rebuild every living brain so the foot is wired in (or unwired) at once,
    // the same as the ear and the plasticity toggles do. What a living creature
    // cannot do is *acquire* a foot worth having: its foot genes were only ever
    // drawn if it was born into a world with the sense on, so switching it on
    // mid-run gives most of the pond a silent one and leaves the work to their
    // descendants' mutations.
    for (const c of world.creatures) c.brain = buildBrainFor(c.genome, config);
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
  applyInspectorColours();

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
// All of it goes through `Gestures`, which is where the tap-versus-drag and
// pinch arithmetic lives and where the suite can reach it. What is left here is
// the adapter: browser events in, camera moves out. One path serves a mouse and
// a hand, so a double-tap follows a creature exactly as a double-click does —
// there is no `dblclick` listener any more, because a synthesised one is not
// something a phone can be relied on to send.
function wireCanvas(canvas) {
  const cam = () => renderer.camera;
  const gestures = new Gestures();

  // Client pixels → canvas pixels (the canvas is laid out responsively, so the
  // two only coincide at full width).
  const toCanvas = (e) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (config.width / rect.width),
      y: (e.clientY - rect.top) * (config.height / rect.height),
    };
  };

  const pickAt = (x, y) => {
    const w = cam().screenToWorld(x, y);
    return renderer.pick(world, w.x, w.y);
  };

  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return; // right/middle: not ours
    const p = toCanvas(e);
    gestures.down(e.pointerId, p.x, p.y);
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    const p = toCanvas(e);
    const g = gestures.move(e.pointerId, p.x, p.y);
    if (!g) return;
    // Taking the view by hand — with one finger or two — releases the follow lock.
    cam().setTarget(null);
    // The midpoint drifting is a pan; the fingers separating is a zoom about
    // wherever that midpoint has just arrived. A one-finger drag is the first
    // half alone.
    cam().panByScreen(g.dx, g.dy);
    if (g.type === "pinch") cam().zoomBy(g.scale, g.x, g.y);
  });

  const lift = (e, cancelled) => {
    const g = cancelled ? gestures.cancel(e.pointerId) : gestures.up(e.pointerId, e.timeStamp);
    if (!g) return;
    if (g.count === 1) {
      renderer.selected = pickAt(g.x, g.y);
      // Following, then picking someone else, hands the camera over.
      if (cam().target) cam().setTarget(renderer.selected);
      return;
    }
    // Twice on a creature rides along with it; twice on open water falls back
    // to the whole pond.
    const c = pickAt(g.x, g.y);
    if (c) {
      renderer.selected = c;
      cam().setTarget(c);
      flash(`Following creature #${c.id} — drag, or press 0, to let go.`);
    } else {
      cam().reset();
    }
  };
  canvas.addEventListener("pointerup", (e) => lift(e, false));
  canvas.addEventListener("pointercancel", (e) => lift(e, true));

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
