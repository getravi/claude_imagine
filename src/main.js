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
import { drawMuller, mullerShares, mullerAxis, textureCss, otherTextureCss } from "./mullerplot.js";
import { buildBrainFor } from "./creature.js";
import { creatureFacts } from "./inspect.js";
import { SCENARIOS } from "./scenarios.js";
import { MIN_ZOOM, ZOOM_STEP } from "./camera.js";
import { Gestures } from "./gestures.js";
import { Trail } from "./trail.js";
import { drawMinimap, minimapLayout, minimapToWorld } from "./minimap.js";
import { drawChart, popAxis, axisLabels, chartAxis, seasonBands } from "./chart.js";
import { drawSizes, sizeAxis, sizeProfile, sizeCaption, MEAN_DASH } from "./sizeplot.js";
import {
  wholePercents,
  mortalitySeries,
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
  weightMarkTones,
  refugeRing,
} from "./palette.js";
import {
  EMPTY_HINT,
  inspectorHTML,
  inspectorKey,
  sparkFromWeights,
} from "./inspectorview.js";
import { nameSpecies, speciesLabel } from "./speciesnames.js";
import { creatureIntro, creatureLabel, givenName, introduceStar, pickStar } from "./cast.js";
import { OBITUARY_MEET_ID, obituaryFor, obituaryHTML, obituaryLines } from "./obituary.js";
import { nextHeadline, pondHeadline } from "./headline.js";
import { ENERGY_SINKS, energySeries } from "./energy.js";
import { hudTiles, UI_RNG_SEED } from "./hud.js";
import { barRows } from "./bars.js";
import {
  describeChart,
  describeLineages,
  describeMuller,
  describePond,
  describePower,
  describeSelection,
  describeSizes,
  pendingSpeech,
  seasonLabel,
  timeOfDayLabel,
} from "./describe.js";
import { eventWho } from "./chronicle.js";
import { DIRECTION_KEYS, entrySelection, stepSelection } from "./pondnav.js";
import { scaleSpan, rulerWidth, showsRuler } from "./scalebar.js";
import { ViewState } from "./viewstate.js";
import { quietSwitches } from "./switches.js";
import { keyHTML, keySignature } from "./key.js";
import { CAST_ID_ATTR, castHTML, castRows, castSignature } from "./whoswho.js";
import { RECORD_ID_ATTR, recordRows, recordSignature, recordsHTML } from "./records.js";
import {
  MILESTONE_WHO_ATTR,
  WATCH_LABEL,
  milestoneProgress,
  milestoneRows,
  milestoneSignature,
  milestoneWho,
  milestonesHTML,
  milestonesSay,
} from "./milestones.js";
import { evolvedHTML, evolvedRows, evolvedSignature, foundingSnapshot } from "./evolved.js";
import { portraitHTML, portraitPair, portraitSignature } from "./portrait.js";
import { nameTags } from "./nametag.js";
import { CheerWatch } from "./cheer.js";
import {
  cardPlacement,
  hasSeenTour,
  markTourSeen,
  nextLabel,
  stepIndex,
  stopAt,
  stopCounter,
} from "./tour.js";
import { pondName, pondTitle, shareLine, welcomeTo } from "./pondname.js";

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
  if (p.has("lic")) o.licensedDietCost = p.get("lic") === "1";
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
  if (p.has("whisk")) o.wallSense = p.get("whisk") === "1";
  if (p.has("fin")) o.deathIsFinal = p.get("fin") === "1";
  if (p.has("ord")) o.shuffleTurnOrder = p.get("ord") === "1";
  if (p.has("body")) o.bodyCollision = p.get("body") === "1";
  if (p.has("mass")) o.massWeightedShove = p.get("mass") === "1";
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
  p.set("lic", config.licensedDietCost ? "1" : "0");
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
  p.set("whisk", config.wallSense ? "1" : "0");
  p.set("fin", config.deathIsFinal ? "1" : "0");
  p.set("ord", config.shuffleTurnOrder ? "1" : "0");
  p.set("body", config.bodyCollision ? "1" : "0");
  p.set("mass", config.massWeightedShove ? "1" : "0");
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
// Simulation steps per frame, from the constant that has claimed to be its
// default since v1.0. It wasn't: this was a literal `1` and `config.js` held a
// `stepsPerFrame` that no module in the project read, which is what v1.71's
// pair screen found the moment it asked which module reads each constant.
// Same value, so nothing about the page moves — but the number is now the one
// `config.js` says it is, and a permalink can set it.
let speed = config.stepsPerFrame;
const uiRng = new RNG(UI_RNG_SEED); // separate RNG for UI-side sampling (diversity)
// Where the selected creature has been (v1.84). Recorded whenever there is a
// selection, whether or not the overlay is drawing it, so ticking the box shows
// the path already taken rather than starting a new one — and read by the
// spoken description, which has no overlay to be switched on. A pure observer:
// it is written from this loop and never read by the simulation.
const trail = new Trail();
// Everything on this page that describes *one* pond (v1.99). Nineteen caches
// that used to be private `let`s here, reset in three hand-typed lists that
// disagreed with each other; one object keyed on the world's identity now,
// adopted at the top of the frame.
const view = new ViewState();

// Track FPS for the HUD.
let lastFrame = performance.now();
let fpsSmooth = 60;

// Respect the OS-level "reduce motion" preference by default (comet trails
// are the app's main continuous-motion effect); a visitor who prefers a
// calmer view can still flip it either way from the controls panel.
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

/**
 * Hand the current world to the view state, and do the one thing that reset
 * cannot: the DOM. `adopt` clears the species highlight, so the button that
 * clears it has nothing left to do and says so.
 */
function adoptWorld() {
  if (!view.adopt(world, renderer)) return;
  $("btn-clear-highlight").classList.add("hidden");
  // The pond's opening line, taken here and nowhere else (v1.128). This runs at
  // the top of the frame, *before* anything is stepped, so a world built since
  // the last frame is still standing exactly as it was dealt — which is what
  // makes `foundingSnapshot`'s `tick === 0` test the whole of the condition
  // "these are the animals it started with". A world that arrives already
  // running — `📂 Load` pours a saved run into a fresh `World` — has no
  // beginning here to record, gets `null`, and the board says so.
  view.founding = foundingSnapshot(world);
}

function boot() {
  const canvas = $("world");
  renderer = new Renderer(canvas, config);
  renderer.trail = trail;
  // The names get a canvas of their own over the pond — see
  // `Renderer#attachNameLayer` for why they cannot share the water's.
  renderer.attachNameLayer($("names"));
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
  wireCastList();
  wireRecordList();
  wireMilestoneList();
  wireTour();
  buildScenarioChips();
  // Before the first frame, so the tab a visitor opened in the background is
  // already a place by the time they look at it. The return is dropped: the
  // pond you arrive on is not somewhere you have *arrived* from.
  syncPondName();
  syncHash();
  requestAnimationFrame(loop);

  // The one thing on this page that introduces itself. Opened on the frame
  // after the first, so the ring is drawn around a pond that has been painted
  // rather than around an empty canvas — and only for a visitor this browser
  // has never shown it to.
  if (!hasSeenTour(tourStore())) requestAnimationFrame(() => openTour(0));
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
  // Nothing is cleared here. `view.adopt` sees the new object at the top of the
  // next frame and resets every surface at once, which is the whole of v1.99:
  // this function used to name four things, `resetWorld` named the same four,
  // and `loadWorld` named one of them.
  syncControlsFromConfig();
  // The plate follows, and the welcome does not: a scenario arrives with a
  // banner of its own that says more than a place name does, and two toasts
  // racing for one element means the second one wins by accident.
  syncPondName();
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
  setToggle("toggle-licensed", config.licensedDietCost);
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
  setToggle("toggle-whisker", config.wallSense);
  setToggle("toggle-deathfinal", config.deathIsFinal);
  setToggle("toggle-turnorder", config.shuffleTurnOrder);
  setToggle("toggle-bodies", config.bodyCollision);
  setToggle("toggle-mass", config.massWeightedShove);
  setToggle("toggle-sexual", config.sexualReproduction);
  setToggle("toggle-plasticity", config.plasticity);
  setToggle("toggle-neat", config.evolvableTopology);
}

function loop(now) {
  const dt = now - lastFrame;
  lastFrame = now;
  fpsSmooth += ((1000 / Math.max(dt, 1)) - fpsSmooth) * 0.1;

  // Before anything is stepped or drawn: if the pond has been replaced since
  // the last frame, every cache describing the old one goes, along with the
  // three references into it that the renderer holds. One place, whichever of
  // the three buttons did it.
  adoptWorld();

  if (running) {
    for (let i = 0; i < speed; i++) {
      world.step();
      // Inside the step loop, not once a frame: at 20× a frame is twenty ticks
      // and a path sampled per frame would be a fifth of the corners.
      trail.record(renderer.selected, world.tick);
    }
  } else {
    // Paused, so the tick guard makes this a no-op — except on the frame after
    // a fresh selection, where it gives the path its first point.
    trail.record(renderer.selected, world.tick);
  }

  // The camera catches up to whatever it is following before anything is drawn,
  // so a followed creature never lags a frame behind its own halo.
  renderer.camera.update();
  // Who is wearing their name over the water this frame (v1.126). Recomputed
  // per frame rather than held: `nametag.js` carries the measurement that says
  // the cast is stable enough not to need a hold, and a name held past its
  // moment is a label that has started lying.
  renderer.nameTags = nameTags(world, config, namesForTree(world.phylogeny), renderer.selected);
  renderer.draw(world);
  updateViewBadge();
  updateMinimap();
  updateScaleBar();
  // The three figures that share one x-axis, and then the axis itself — drawn
  // last because it labels all three and belongs to none of them.
  const chartHist = updateChart(world);
  drawDeaths(world);
  drawPower(world);
  updateChartXAxis(chartHist);
  updateSizes(world);
  drawPhylogeny(world);
  updateHUD();
  updateSeasonBadge(world);
  updateInspector();
  updateHeadline(world);
  updateKey();
  updateCast(world);
  updateEvolved(world);
  updatePortrait(world);
  updateMilestones(world);
  updateRecords(world);
  updateChronicle(world);
  updateNarration(world);
  // Last, and on the browser's clock: the panel pass above is what notices a
  // rung being climbed, and this is what puts the banner up and takes it down.
  pumpCheers(now);

  requestAnimationFrame(loop);
}

// ---- The spoken pond ----
//
// The canvas gets a description of what is in it, and a polite live region gets
// the Chronicle's newest line. Both come from `describe.js`, which is where the
// wording and the "should this be said at all?" rules are tested; this function
// is only the adapter onto the DOM, the same division `gestures.js` uses.
const DESCRIBE_EVERY = 15; // frames between rewrites of the canvas description
// What the keyboard has just done, waiting for the region to be free. A *state*
// rather than an event, so a new one replaces an unspoken old one: holding an
// arrow key down should announce where the selection ended up, not read out
// every creature it passed through. Nothing is lost by overwriting, because the
// Chronicle's own queue is only consulted on a frame where this is empty.

/** Say something in response to a key press, once the live region is free. */
function announce(text) {
  view.pendingAct = text;
}

function updateNarration(world) {
  // These four used to be reset here, on the world's own identity — the one
  // place in this file that got the question right. `viewstate.js` is that idea
  // generalised to every surface, so an arriving world still primes silently
  // instead of reading out the chronicle it inherited, and the priming now
  // happens for every surface rather than for this one.

  // Announcements go out over two frames — blank, then text — because a live
  // region whose content is rewritten to the same string may not fire at all,
  // and the Chronicle can legitimately say the same sentence twice (two dawns
  // are two events). A real mutation every time costs one frame and removes the
  // question.
  const say = $("pond-say");
  if (view.pendingSay) {
    say.textContent = view.pendingSay;
    view.pendingSay = "";
  } else if (view.pendingAct) {
    // A keystroke answered first: it is the only thing here a listener is
    // actively waiting for, and the Chronicle's line keeps until the next frame
    // because `view.spokenLine` has not moved.
    say.textContent = "";
    view.pendingSay = view.pendingAct;
    view.pendingAct = null;
  } else {
    const said = pendingSpeech(world.chronicle.events, view.spokenLine);
    view.spokenLine = said.spoken;
    if (said.text) {
      say.textContent = "";
      view.pendingSay = said.text;
    }
  }

  // The description is a state, not an event: nothing announces it, a listener
  // reads it when their cursor lands on the pond. Rebuilding it every frame
  // would be wasted work, and writing it unchanged would be a DOM write for
  // nothing.
  if (view.describeIn-- > 0) return;
  view.describeIn = DESCRIBE_EVERY;
  const label = describePond(world, config, renderer.camera);
  if (label === view.pondLabel) return;
  view.pondLabel = label;
  $("world").setAttribute("aria-label", label);
}

// ---- The headline (v1.117) ----
//
// The page's opening sentence. `headline.js` decides what it says and how long
// it keeps saying it; this is the adapter onto the DOM, the same division
// `describe.js` and `gestures.js` have.
//
// Two cheap guards, both the v1.15 rule about anything inside a per-frame
// render. The choice is only made every `HEADLINE_EVERY` frames — it walks the
// history window and the species list, and a sentence that changes at most
// every few hundred ticks does not need choosing sixty times a second. And the
// DOM is written only when `nextHeadline` hands back a different object, which
// it does not while the current line still holds the slot.
const HEADLINE_EVERY = 20;

function updateHeadline(world) {
  if (view.headlineIn-- > 0) return;
  view.headlineIn = HEADLINE_EVERY;
  const chosen = pondHeadline(world, config, namesForTree(world.phylogeny));
  const next = nextHeadline(view.headlineShown, chosen, world.tick);
  if (next === view.headlineShown) return;
  view.headlineShown = next;
  $("headline-icon").textContent = next.icon;
  $("headline-text").textContent = next.text;
}

// ---- The key to the water (v1.122) ----
//
// The placard under the pond that says what an arrowhead, a shade, a nose and a
// green speck mean. Content-keyed on the marks this pond can draw, so switching
// a rule on adds its row and switching it off takes the row away — a key that
// explains a mark the water cannot draw is worse than no key. `src/key.js` owns
// every word and every swatch; this is only the adapter onto the DOM.
function updateKey() {
  const sig = keySignature(config);
  if (sig === view.keySig) return;
  view.keySig = sig;
  $("key-list").innerHTML = keyHTML(config);
}

// ---- Worth watching (the cast list, v1.123) ----
//
// The shortlist "👋 Meet somebody" picks off, on the page. `whoswho.js` owns
// every word and every row; this is the adapter onto the DOM and the click.
// Content-keyed on the cast itself, so the rows are rebuilt when somebody joins
// or leaves the board and not when the pond breathes — the same memo every
// other panel here uses.
//
// The handler is one listener on the list rather than one per row, because the
// rows are replaced whenever the cast changes and a listener per row would be a
// listener per rebuild. It looks the creature up in the *living* rather than
// holding a reference: a board is a picture of the frame it was drawn in, and
// an animal named on it can be eaten before the pointer arrives.
function updateCast(world) {
  const rows = castRows(world, config, namesForTree(world.phylogeny));
  const sig = castSignature(rows);
  if (sig === view.castSig) return;
  view.castSig = sig;
  $("cast-list").innerHTML = castHTML(rows);
}

function wireCastList() {
  $("cast-list").addEventListener("click", (e) => {
    const btn = e.target.closest(`[${CAST_ID_ATTR}]`);
    if (!btn) return;
    // No reason in the toast: the row the visitor just pressed is still on
    // screen saying it, and a toast that repeats the control that opened it is
    // the same fact twice.
    watchNamed(Number(btn.getAttribute(CAST_ID_ATTR)));
  });
}

// Press a name and go and watch that animal — a row on the board, or, since
// v1.127, the plate floating over the water. One function for both, because
// they are two pictures of one list (`nametag.js` draws exactly the animals
// `whoswho.js` lists) and a visitor pressing either has asked for the same
// thing. It looks the animal up in the living rather than holding a reference:
// a name is a picture of the frame it was drawn in, and its owner can be eaten
// between the draw and the press.
function watchNamed(id) {
  const c = world.creatures.find((x) => x.id === id && !x.dead);
  if (!c) {
    flash("They are gone — the pond has moved on.");
    return;
  }
  const title = `👋 ${creatureLabel(c, namesForTree(world.phylogeny))}`;
  watchCreature(c, title, `${title}. ${creatureIntro(c, config)}`);
}

// Hand a creature over: select it, follow it, and say who it is. The tail of
// "Meet somebody", shared with the cast list so a row and the button do exactly
// the same four things and cannot drift apart. The camera rides along for
// v1.119's reason — a named animal you immediately lose in three hundred others
// is worse than no name at all.
function watchCreature(c, flashText, sayText) {
  renderer.selected = c;
  renderer.camera.setTarget(c);
  flash(flashText, MEET_FLASH_MS);
  announce(sayText);
}

// ---- How they have changed (v1.128) ----
//
// The board that answers the tagline: the animals in the water now, against the
// ones this pond was handed on its first tick. `evolved.js` owns every word;
// this is the adapter onto the DOM, and there is no click to wire because every
// row is about a population rather than about an animal anybody could go and
// press.
//
// Keyed on the sentences, as the record board is, and for a sharper version of
// its reason: the underlying means move in the sixth decimal place every time
// anybody is born, and every number the board prints is rounded to a whole
// percent or a whole animal. A key made of the measurements would rebuild this
// list sixty times a second to draw exactly the same five lines. The signature
// carries whether the opening line was seen, so that the board's two *empty*
// states are distinguishable from each other and from the state before any pond
// has been drawn — see `evolvedSignature`.
function updateEvolved(world) {
  const sawStart = view.founding !== null;
  const rows = evolvedRows(world, view.founding);
  const sig = evolvedSignature(rows, sawStart);
  if (sig === view.evolvedSig) return;
  view.evolvedSig = sig;
  $("evolved-list").innerHTML = evolvedHTML(rows, sawStart);
}

// The picture over those five rows (v1.130): the average animal this pond was
// handed, beside the average animal in it now, at one shared scale.
//
// Its own signature rather than a ride on `evolvedSig`, and the reason is the
// direction the two round in. The board prints whole percents, so its sentences
// hold still while the bodies drift; this figure draws the radii themselves, so
// a hundredth of a pixel of mean body is a mark that has moved and a whole
// percent of diet is not necessarily one. Two surfaces reading the same means
// at two resolutions need two keys — the one thing a shared key could not be is
// right for both.
function updatePortrait(world) {
  const pair = portraitPair(world, view.founding, world.config);
  const sig = portraitSignature(pair);
  if (sig === view.portraitSig) return;
  view.portraitSig = sig;
  $("portrait").innerHTML = portraitHTML(pair);
}

// ---- How far this pond has got (v1.131) ----
//
// The one panel here that points forward. `milestones.js` owns the rungs, the
// wording and the arithmetic; the latch is in `World.step`, so this is only an
// adapter onto three elements — exactly as `updateRecords` is one onto a list.
//
// Keyed on the rows' own sentences, which is the record board's key and for a
// sharper version of its reason: a pending rung carries a live counter ("the
// busiest parent so far has raised 3"), so this panel has a signature that
// moves while nothing on it has been *reached*. That is the point. The number
// creeping toward five is the reason a visitor stays to watch it get there.
function updateMilestones(world) {
  const rows = milestoneRows(world, config);
  // Before the gate, not after it. A rung climbing does move the signature, so
  // the two orders agree today — but the banner is about the pond and the gate
  // is about the DOM, and a moment that can only be noticed on a frame that
  // happens to redraw a panel is a moment waiting to be missed by the next
  // optimisation.
  watchForCheers(world, rows);
  const sig = milestoneSignature(rows);
  if (sig === view.milestoneSig) return;
  view.milestoneSig = sig;
  const progress = milestoneProgress(rows);
  $("milestone-list").innerHTML = milestonesHTML(rows);
  $("milestone-count").textContent = progress.text;
  $("milestone-say").textContent = milestonesSay(rows);
  $("milestone-fill").style.width = `${(progress.fraction * 100).toFixed(1)}%`;
}

// A rung that is about somebody leads to them (v1.133). One listener on the
// list, like the cast board's and the record board's — but this one resolves a
// *rung key* rather than an id, because a ladder row is redrawn only when its
// sentence moves and the animal behind it is replaced far more often than that.
// `milestoneWho` answers for the pond as it stands at the moment of the press,
// which is the only frame that can be right.
function wireMilestoneList() {
  $("milestone-list").addEventListener("click", (e) => {
    const btn = e.target.closest(`[${MILESTONE_WHO_ATTR}]`);
    if (!btn) return;
    watchMilestone(btn.getAttribute(MILESTONE_WHO_ATTR));
  });
}

// Go and watch whoever a rung is about. Shared by the ladder's rows and the
// banner over the water, so the two cannot come to mean different things — the
// banner is the same rung read five seconds earlier, and an animal that has
// died in between gets the same sentence either way.
function watchMilestone(key) {
  const id = milestoneWho(world, key);
  if (id < 0) {
    flash("They are gone — the pond has moved on.");
    return;
  }
  watchNamed(id);
}

// ---- The pond cheers (v1.132) ----
//
// The other half of the ladder. v1.131 taught this page to say what to wait
// for and left it silent when the waiting paid off: the row grew a tick mark
// in a panel below the fold and the moment went past unmarked, which is the
// wrong half of a progress bar to leave open.
//
// `cheer.js` owns the sentences and the rule about what counts as news; these
// two functions are the adapter, split because they answer to different clocks.
// `watchForCheers` runs on the *pond's* clock, inside the frame's panel pass —
// a rung is climbed on a step, not on a frame. `pumpCheers` runs on the
// *browser's*, because how long a banner stays up is a fact about reading
// speed. Between them sits `view.cheerQueue`, which is world-scoped: a pond
// replaced mid-celebration takes its unread banners with it rather than
// congratulating the new one on something the old one did.
function watchForCheers(world, rows) {
  if (!view.cheerWatch) view.cheerWatch = new CheerWatch(rows, world.tick);
  for (const line of view.cheerWatch.observe(rows, world.tick)) view.cheerQueue.push(line);
}

// Long enough to read a sentence and its "next", which is the meet banner's
// problem one clause longer. Two rungs landing on the same step is a measured
// 1-in-69, and this is the gap that keeps the second from erasing the first.
const CHEER_MS = 5200;
let cheerFree = 0;
let cheerGlow = null;
function pumpCheers(now) {
  if (!view.cheerQueue.length || now < cheerFree) return;
  const { key, line, whoIs } = view.cheerQueue.shift();
  cheerFree = now + CHEER_MS;
  flash(line, CHEER_MS, "cheer");
  // And, on the half of moments that are about an animal rather than about a
  // pond, a way to go and see them. The banner is the one place on this page
  // where a visitor is already looking at the water and has just been told that
  // somebody did something — the shortest distance there has ever been between
  // a sentence and the animal it is about.
  if (whoIs) offerToShow(key, whoIs);
  // Said as well as shown. A listener gets the banner through the same live
  // region a keystroke uses, so the moment is not a thing only sighted readers
  // are told about — and the ladder's own spoken sentence, which names what is
  // still ahead, is rewritten by the panel pass either way.
  announce(line);
  // And the panel it came from lights up, so a visitor who has never scrolled
  // past the water learns where this page keeps its progress. The glow goes on
  // the section, which is static markup — the list inside it is rebuilt from
  // `innerHTML` whenever a pending row's counter moves, and a class on a row
  // would be wiped by the next birth.
  const panel = $("milestones");
  panel.classList.add("cheering");
  clearTimeout(cheerGlow);
  cheerGlow = setTimeout(() => panel.classList.remove("cheering"), CHEER_MS);
}

// ---- The book of records (v1.124) ----
//
// The all-time board: the most young anybody has raised here, the fullest the
// water has ever been, the largest family it has grown. `records.js` owns every
// word; this is the adapter onto the DOM and the click, exactly as `updateCast`
// is for the cast board.
//
// Keyed on the sentences rather than on ids, for the reason this board exists:
// a record's line changes when its holder *dies* while the record itself does
// not move at all, and that is the change most worth redrawing for.
function updateRecords(world) {
  const rows = recordRows(world, config, namesForTree(world.phylogeny));
  const sig = recordSignature(rows);
  if (sig === view.recordSig) return;
  view.recordSig = sig;
  $("record-list").innerHTML = recordsHTML(rows);
}

// One listener on the list, not one per row — and only the living holder's row
// is pressable, so most of the time this handler has nothing to catch. It looks
// the creature up in the living rather than holding a reference: a record is a
// picture of the frame it was drawn in, and the animal on it can be eaten
// between the draw and the press.
function wireRecordList() {
  $("record-list").addEventListener("click", (e) => {
    const btn = e.target.closest(`[${RECORD_ID_ATTR}]`);
    if (!btn) return;
    const id = Number(btn.getAttribute(RECORD_ID_ATTR));
    const c = world.creatures.find((x) => x.id === id && !x.dead);
    if (!c) {
      flash("They are gone — the record is theirs all the same.");
      return;
    }
    const title = `🏆 ${creatureLabel(c, namesForTree(world.phylogeny))}`;
    watchCreature(c, title, `${title}. ${creatureIntro(c, config)}`);
  });
}

// ---- The guide (v1.129) ----
//
// Six stops around the page for somebody who has just arrived. `src/tour.js`
// owns the words, the order and the arithmetic; this is the adapter onto the
// DOM, which is three jobs and nothing else: put the ring over the element the
// current stop names, put the card somewhere it fits, and get out of the way.
//
// It opens itself exactly once, on a first visit. That is a deliberate piece of
// rudeness and the smallest possible amount of it: a page this dense has to
// volunteer its own front door, and a guide nobody can find is a guide for the
// people who least need one. Every route out — Skip, Done, Escape, the scrim —
// marks it seen, so a visitor who dismisses it in half a second is never shown
// it again.
let tourAt = 0;
/** Where focus was when the tour opened, so leaving puts it back (v1.51's rule). */
let tourReturn = null;

/** `localStorage`, or nothing — reading it throws outright where site data is blocked. */
function tourStore() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const tourIsOpen = () => !$("tour").classList.contains("hidden");

function openTour(at = 0) {
  tourAt = stepIndex(at, 0);
  tourReturn = document.activeElement;
  $("tour").classList.remove("hidden");
  drawTourStop();
  $("tour-card").focus();
}

function closeTour() {
  if (!tourIsOpen()) return;
  $("tour").classList.add("hidden");
  markTourSeen(tourStore());
  // Back where they were, unless where they were has gone. `focus` on a
  // detached node is a silent no-op that leaves the focus ring on `<body>`,
  // which is a keyboard visitor at the top of the page again.
  if (tourReturn && tourReturn.isConnected) tourReturn.focus();
  else $("btn-tour").focus();
  tourReturn = null;
}

function moveTour(delta) {
  const next = stepIndex(tourAt, delta);
  if (next === tourAt && delta > 0) return closeTour(); // "Done" on the last stop
  tourAt = next;
  drawTourStop();
}

/**
 * Draw the current stop: the words in the card, the thing they are about
 * brought into view, and then the ring and the card placed against it.
 *
 * The order matters. The card is written *first*, because its height depends on
 * how long the sentence is and the placement depends on its height; the target
 * is scrolled into view *before* it is measured, because a rectangle taken
 * before the scroll is a rectangle of where the element used to be.
 */
function drawTourStop() {
  const stop = stopAt(tourAt);
  $("tour-count").textContent = stopCounter(tourAt);
  $("tour-icon").textContent = stop.icon;
  $("tour-title-text").textContent = stop.title;
  $("tour-line").textContent = stop.line;
  $("tour-back").disabled = tourAt === 0;
  $("tour-next").textContent = nextLabel(tourAt);
  const target = document.getElementById(stop.target);
  if (target) target.scrollIntoView({ block: "center", inline: "nearest" });
  placeTourStop();
}

/**
 * Put the ring where the current stop's element is, and the card where it fits.
 *
 * Split from `drawTourStop` because this half has to run again on every scroll
 * and every resize — the ring is a rectangle in the window's own frame, so
 * anything that moves the window moves what it is drawn around — and the other
 * half must not: a redraw that re-scrolled the page would fight a visitor
 * trying to scroll it.
 */
function placeTourStop() {
  const stop = stopAt(tourAt);
  const target = document.getElementById(stop.target);
  const ringEl = $("tour-ring");
  const cardEl = $("tour-card");
  if (!target) {
    // Nothing to point at. Rather than ring a rectangle at the origin, hide the
    // ring and centre the card: the sentence is still true even when the thing
    // it describes has been taken off the page.
    ringEl.classList.add("hidden");
    cardEl.style.left = `${Math.max(10, (window.innerWidth - cardEl.offsetWidth) / 2)}px`;
    cardEl.style.top = `${Math.max(10, (window.innerHeight - cardEl.offsetHeight) / 2)}px`;
    return;
  }
  ringEl.classList.remove("hidden");
  const r = target.getBoundingClientRect();
  const pad = 6;
  const ring = {
    left: r.left - pad,
    top: r.top - pad,
    width: r.width + pad * 2,
    height: r.height + pad * 2,
  };
  ringEl.style.left = `${ring.left}px`;
  ringEl.style.top = `${ring.top}px`;
  ringEl.style.width = `${ring.width}px`;
  ringEl.style.height = `${ring.height}px`;

  const win = { width: window.innerWidth, height: window.innerHeight };
  const card = { width: cardEl.offsetWidth, height: cardEl.offsetHeight };
  const at = cardPlacement(ring, win, card, stop.prefer);
  cardEl.style.left = `${at.left}px`;
  cardEl.style.top = `${at.top}px`;
}

function wireTour() {
  $("btn-tour").addEventListener("click", () => openTour(0));
  $("tour-next").addEventListener("click", () => moveTour(1));
  $("tour-back").addEventListener("click", () => moveTour(-1));
  $("tour-skip").addEventListener("click", closeTour);
  $("tour-scrim").addEventListener("click", closeTour);

  // The tour's own keys, taken on the overlay before the page's shortcuts see
  // them — Space would otherwise pause the pond from inside a dialog, which is
  // a control doing something the thing under the pointer does not say.
  $("tour").addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.key) {
      case "Escape":
        closeTour();
        break;
      case "ArrowRight":
      case "Enter":
      case " ":
        moveTour(1);
        break;
      case "ArrowLeft":
        moveTour(-1);
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  });

  // The ring is a rectangle in window coordinates, so anything that moves the
  // window moves the thing it is drawn around. Re-place rather than close: a
  // visitor turning a phone sideways mid-tour has not asked to leave.
  const refit = () => {
    if (tourIsOpen()) placeTourStop();
  };
  window.addEventListener("resize", refit);
  window.addEventListener("scroll", refit, { passive: true });
}

// ---- Chronicle feed (natural-history timeline) ----
function updateChronicle(world) {
  const ev = world.chronicle.events;
  const newest = ev.length ? ev[ev.length - 1] : null;
  const key = ev.length + "|" + (newest ? newest.tick + newest.msg + newest.who : "");
  if (key === view.lastChronKey) return; // nothing changed since last render
  view.lastChronKey = key;

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
    // A line about an animal stores a predicate and gets its subject here
    // (v1.125) — the name is marked up rather than run into the sentence,
    // because the whole point of putting one in the story is that a reader can
    // find it again three lines down.
    const who = eventWho(e);
    const said = who ? `<b class="c-who">${who}</b> ${e.msg}` : e.msg;
    html +=
      `<li class="cat-${e.cat}${fresh}"><span class="c-icon">${e.icon}</span>` +
      `<span class="c-when">${when}</span><span class="c-msg">${said}</span></li>`;
  }
  feed.innerHTML = html;
}

// ---- View badge (zoom / follow) ----
// The rule from v1.14: a feature isn't finished until the screen says it is on.
// The badge appears the moment the view stops being the whole pond, names the
// magnification, and says whose shoulder you're looking over. It also keeps the
// Follow checkbox honest — the camera lets go by itself when its creature dies
// or when a drag takes the wheel, and the control has to admit that.
function updateViewBadge() {
  const cam = renderer.camera;
  const badge = $("zoom-badge");
  const follow = $("toggle-follow");
  if (follow.checked !== !!cam.target) follow.checked = !!cam.target;

  const sig = cam.isDefault() ? "" : cam.zoom.toFixed(2) + "|" + (cam.target ? cam.target.id : "");
  if (sig === view.viewSig) return;
  view.viewSig = sig;
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
    (cam.target ? ` <span class="following">🎯 ${givenName(cam.target.id)}</span>` : "");
}

// ---- Scale bar ----
// The pond's ruler (v1.82). `scalebar.js` chooses the length and the words; all
// that happens here is the DOM.
//
// Two things it does *not* do. It does not rebuild any markup — the elements
// are in the page and only a width and a string are patched, which is v1.15's
// rule about anything inside a per-frame render. And it does not skip the frame
// when the zoom has not changed, because the other input is the width the
// stylesheet is displaying the canvas at, and that moves when the *window*
// does, with no camera event to hang a refresh on. So the measurement is taken
// every frame and the DOM is written only when one of the two answers changes.
function updateScaleBar() {
  const cam = renderer.camera;
  const box = $("scale-bar");
  const show = showsRuler(cam.zoom);
  box.classList.toggle("hidden", !show);
  if (!show) return;
  const canvas = $("world");
  const span = scaleSpan(cam.zoom, config.width);
  const px = rulerWidth(span, Math.round(canvas.clientWidth) || config.width, config.width);
  // v1.82 placed this mark from here, because `right: 12px` measured from the
  // stage rather than from the water and the ruler hung 22 px off the picture
  // it measures. That was a fix to one mark of five: the stage is the
  // containing block for all of them, and v1.87 gave it `width: fit-content`
  // so it is the canvas's box in both regimes. The stylesheet's `right: 12px`
  // means what it says now, so the only thing left to write here is the ruler's
  // own length — which is what this function was always about.
  const sig = span.label + "|" + px.toFixed(2);
  if (sig === view.rulerSig) return;
  view.rulerSig = sig;
  $("scale-bar-rule").style.width = px.toFixed(2) + "px";
  $("scale-bar-label").textContent = span.label;
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

/** How far one arrow press slides the view, in pond pixels of screen. */
const MINIMAP_PAN = 60;

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

  // The keyboard equivalent of a click on the map: arrows slide the view a step
  // at a time. `panByScreen` is a no-op at zoom 1, and the map is `display:none`
  // there, so a viewer can neither reach this nor be surprised by it in the one
  // state the whole project's screenshots depend on.
  canvas.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!step) return;
    renderer.camera.setTarget(null); // taking the wheel by hand, as a click does
    renderer.camera.panByScreen(-step[0] * MINIMAP_PAN, -step[1] * MINIMAP_PAN);
    e.preventDefault();
  });
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

// What the lineages are called (v1.116). `nameSpecies` is a pure function of the
// whole tree, and the tree only ever grows: a species is appended, never
// renumbered, and a name is chosen from the ids below it — so a name once given
// never changes and the count is a sufficient key. The cache lives on `view`
// rather than in a `let` here because it describes *one pond*: two ponds that
// happen to open with the same forty founders would otherwise share a map, and
// a cache keyed on a count is exactly the kind that cannot notice.
function namesForTree(phylo) {
  if (!view.lineageNames || view.lineageNameCount !== phylo.species.length) {
    view.lineageNameCount = phylo.species.length;
    view.lineageNames = nameSpecies(phylo.species);
  }
  return view.lineageNames;
}

let mullerCtx = null;
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
  const names = namesForTree(ph);
  setMullerLabel(describeMuller(shares, ph.snapshotSpan(), names));

  // "45 ever" is mostly the opening deal, so the caption says which is which —
  // the split lives in `phylogeny.js` and the wording in `describe.js`, because
  // a number assembled here is a number no test can read.
  $("phylo-info").textContent = describeLineages(
    ph.originTally(),
    ph.livingCount(),
    ph.species.filter((s) => s.extinctTick >= 0).length
  );

  updateMullerAxis(ph, canvas.width);

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
  if (sig !== view.legendSig) {
    view.legendSig = sig;
    buildLegend(living, hatch, names);
  } else {
    // Cheap in-place count refresh.
    for (const s of living) {
      const el = document.getElementById("chip-n-" + s.id);
      if (el) el.textContent = s.count;
    }
  }
}

// The x-axis numbers, as DOM text under the plot. The arithmetic is
// `mullerAxis` (in `src/mullerplot.js`, where the suite can reach it); what is
// left here is the same adapter the chart has.
//
// Two things change on different clocks, and the first version of this conflated
// them. *Which* numbers are marked changes only when a round tick comes into
// range — a few times a run — so the elements are rebuilt on that, which is the
// v1.15 rule about not replacing elements the animation loop is redrawing.
// *Where* each one sits changes on every new column, because the axis's
// right-hand end is the run's own present, so every position is patched in
// place every frame. Caching both together left the numbers where they were
// when the set last changed, drifting up to a whole step away from the columns
// they name: v1.23's stale readout, and invisible to reading the code — only
// opening the page showed a mark labelled 1,000 sitting over tick 1,150.
function updateMullerAxis(phylo, width) {
  const axis = mullerAxis(phylo, width);
  const key = axis.marks.map((m) => m.tick).join(",");
  if (key !== view.mullerAxisKey) {
    view.mullerAxisKey = key;
    const box = $("phylo-ticks");
    box.innerHTML = "";
    view.mullerMarks = axis.marks.map((mark) => {
      const el = document.createElement("span");
      el.textContent = mark.text;
      box.appendChild(el);
      return el;
    });
  }
  for (let i = 0; i < view.mullerMarks.length; i++) {
    const el = view.mullerMarks[i];
    const mark = axis.marks[i];
    el.style.left = `${(mark.frac * 100).toFixed(4)}%`;
    // The anchor follows the position: a mark drifts in from the right-hand
    // edge as the record grows, and stops needing to be tucked inside it.
    const cls = "tick-" + mark.anchor;
    if (el.className !== cls) el.className = cls;
  }
}

/** The Tree of Life's spoken form, written only when it changes. */
function setMullerLabel(text) {
  if (text === view.mullerLabel) return;
  view.mullerLabel = text;
  $("muller").setAttribute("aria-label", text);
}

function buildLegend(living, hatch, names) {
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
    // The chip says the lineage's name since v1.116 and keeps its number in the
    // tooltip: the name is what makes the legend readable ("the Amber ones are
    // all cousins"), and the number is still the identifier `docs/SCIENCE.md`,
    // the CSV export and every other document here use.
    chip.title = `species ${s.id}`;
    chip.innerHTML =
      `<span class="dot" style="background:${textureCss(hatch.get(s.id) || 0, s.hue)};` +
      `color:${lineageFill(s.hue, "dot")}"></span>` +
      `${speciesLabel(names, s.id)} <span class="n" id="chip-n-${s.id}">${s.count}</span>`;
    chip.addEventListener("click", () => toggleHighlight(s.id));
    box.appendChild(chip);
  }
  // The band the legend has never keyed. It was defensible while "other" was
  // the one plain band — nothing to name, nothing to look up — and stopped
  // being so the moment it grew a texture of its own in v1.62: every *other*
  // hatch on the figure now has a chip, so the one without reads as an omission
  // rather than as an absence of meaning. A new capability arrives with its own
  // new absences (v1.19).
  //
  // A span, not a button: there is no species behind it to spotlight, and
  // v1.51's rule cuts both ways — a `div` with a click handler is a control the
  // page is lying about, and a `button` that does nothing when pressed is the
  // same lie from the other end.
  const rest = document.createElement("span");
  rest.className = "chip static";
  rest.innerHTML =
    `<span class="dot" style="background:${otherTextureCss()}"></span>` + "too small to name";
  box.appendChild(rest);
}

function toggleHighlight(id) {
  renderer.highlightSpeciesId = renderer.highlightSpeciesId === id ? null : id;
  view.legendSig = ""; // force legend refresh to update the active chip
  $("btn-clear-highlight").classList.toggle("hidden", renderer.highlightSpeciesId == null);
}

// ---- HUD ----
// The tiles themselves live in `src/hud.js` — one table of `{id, gate, read}`
// rows, so the suite can ask what the panel would say about a given world
// without a browser. What is left here is the adapter, which is the same
// division v1.41 made for the chart and v1.31 for the voice.
function updateHUD() {
  for (const { id, text } of hudTiles({ world, config, fps: fpsSmooth, uiRng })) {
    $(id).textContent = text;
  }
  updateBars();
}

// The two bars under the tiles: what they die of, and where the energy goes.
// Both live in `src/bars.js` now, for the reason the tiles do — and what the
// carve found is written up there. What is left here is the adapter, and it
// writes every row on every frame with no early return, because an early return
// is what left the previous pond's death mix on screen for up to ten seconds
// after a scenario chip replaced the world underneath it.
//
// Only widths, text and accessible names change, never structure, so this is
// safe to run every frame (see the inspector's note about innerHTML).
function updateBars() {
  for (const { id, kind, text } of barRows(world)) {
    const el = $(id);
    if (kind === "width") el.style.width = text;
    else if (kind === "aria") el.setAttribute("aria-label", text);
    else el.textContent = text;
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

  // Winter, behind everything (v1.74). The width handed over is the *backing*
  // store's, not the rendered one: the figure is stretched to the column, so
  // this is the narrower of the two in the sidebar and the aliasing guard is
  // conservative where it matters.
  const season = seasonBands(hist, config, W);

  drawChart(ctx, W, H, hist, { axis, foodMax, whole, season });
  updateChartAxis(axis, H, foodMax);
  updateChartRange(world, hist, season);
  setChartLabel(describeChart(hist, axis, foodMax, season));
  return hist;
}

// The x-axis numbers, in the DOM under the whole stack — the chart, the death
// strip and the power strip all draw the same history at the same x positions,
// so one row of marks labels three figures. The arithmetic is `chartAxis` (in
// `src/chart.js`, where the suite can reach it); this is the same adapter the
// Tree of Life has, and it is the same adapter for the same reason: *which*
// numbers are marked changes rarely, so the elements are rebuilt on that (the
// v1.15 rule), and *where* each one sits changes every four ticks in the recent
// scope, because that window slides, so every position is patched in place
// every frame. v1.54 conflated the two and left the numbers drifting a whole
// step from the columns they named; this axis moves faster than that one.
function updateChartXAxis(hist) {
  const box = $("chart-xticks");
  const axis = chartAxis(hist, Math.round(box.clientWidth) || 300);
  const key = axis.marks.map((m) => m.tick).join(",");
  if (key !== view.chartXKey) {
    view.chartXKey = key;
    box.innerHTML = "";
    view.chartXMarks = axis.marks.map((mark) => {
      const el = document.createElement("span");
      el.textContent = mark.text;
      box.appendChild(el);
      return el;
    });
  }
  for (let i = 0; i < view.chartXMarks.length; i++) {
    const el = view.chartXMarks[i];
    const mark = axis.marks[i];
    el.style.left = `${(mark.frac * 100).toFixed(4)}%`;
    const cls = "tick-" + mark.anchor;
    if (el.className !== cls) el.className = cls;
  }
}

// The axis numbers, as DOM text in the gutter beside the canvas. Rebuilt only
// when the ceiling actually moves — which is the point of a round ceiling, and the v1.15 rule
// about not replacing elements inside the animation loop.
function updateChartAxis(axis, H, foodMax) {
  const key = `${axis.ticks.join(",")}|${foodMax}`;
  if (key === view.chartAxisKey) return;
  view.chartAxisKey = key;
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
function setChartLabel(text) {
  if (text === view.chartLabel) return;
  view.chartLabel = text;
  $("chart").setAttribute("aria-label", text);
}

// The caption under the chart: which stretch of time is on screen, and — in
// whole-run mode — how much each pixel of it is standing in for. A chart whose
// x-axis silently changes meaning is worse than one with no axis at all.
function updateChartRange(world, hist, season) {
  const el = $("chart-range");
  const parts = [];
  if (chartScope === "whole") {
    const span = world.stats.runHistory.span();
    if (span) {
      const each = world.stats.runHistory.stride * 4;
      parts.push(`ticks ${span.from.toLocaleString()}–${span.to.toLocaleString()}`);
      parts.push(`1 point per ${each} ticks`);
    }
  } else if (hist.length > 1) {
    parts.push(`ticks ${hist[0].tick.toLocaleString()}–${hist[hist.length - 1].tick.toLocaleString()}`);
  }
  // The word for the shading (v1.74), here rather than in the legend above. Two
  // reasons, and the first is not about space: the band is furniture, measured
  // to sit *under* the bar a mark has to clear, so an 8-pixel chip of it beside
  // the two series' dots would be a legend entry nobody can see — a colour
  // quiet enough to sit below the data cannot introduce itself in the grammar
  // the data uses. The second is that one more item in that row wraps the food
  // scale onto a second line at 1,280 pixels and at 390 (measured before and
  // after, which is v1.53's rule about a markup change being a cascade change).
  //
  // It comes and goes, because the absence of shading is ambiguous: no band
  // means summer *and* means a world with no seasons in it, and the word is
  // what separates them.
  if (season && season.state === "ok") parts.push("shaded: winter");
  const text = parts.join(" · ");
  if (el.textContent !== text) el.textContent = text;
}

// ---- The body-size figure ----
//
// The one figure in this column whose x-axis is not time. Everything about it
// that could drift lives in `src/sizeplot.js` — the bins, the axis, the
// drawing, the caption — and what is left here is the same three-part adapter
// the chart has: find the canvas, put the numbers into the DOM, and set the
// spoken form.
//
// It is redrawn every frame like the rest of them, which is affordable for a
// reason worth writing down: the profile is two linear passes over the living
// and no sort, so this figure is the cheapest thing in this function, and it is
// the only one that has nothing to remember between frames. There is no history
// buffer behind it at all — a histogram of *now* is a picture the archive
// cannot reconstruct, since the archive keeps summaries and this is the shape
// those summaries are summaries of.
let sizeCtx = null;
function updateSizes(world) {
  if (!sizeCtx) {
    const c = $("sizes");
    sizeCtx = c.getContext("2d");
    sizeCtx._w = c.width;
    sizeCtx._h = c.height;
  }
  const axis = sizeAxis(world.config, Math.round($("sizes").clientWidth) || sizeCtx._w);
  const profile = sizeProfile(world.creatures, world.config, axis);
  drawSizes(sizeCtx, sizeCtx._w, sizeCtx._h, profile, { config: world.config, axis });
  updateSizeAxis(axis);
  const caption = sizeCaption(profile, world.config);
  if ($("size-legend").textContent !== caption) $("size-legend").textContent = caption;
  const label = describeSizes(profile, world.config);
  if (view.sizeLabel !== label) {
    view.sizeLabel = label;
    $("sizes").setAttribute("aria-label", label);
  }
}

// The size axis's numbers, in the DOM under the figure. Unlike the chart's x —
// which slides every four ticks, so every position is patched every frame —
// this axis is a pair of constants, so both the elements and their positions
// are rebuilt only when the marks themselves change. That is the v1.15 rule
// applied to a scale that in practice never moves at all: it can only move if
// somebody drags `bodyRadiusMin` or `bodyRadiusMax`, which no control on this
// page does and a permalink can.
function updateSizeAxis(axis) {
  const key = axis.marks.map((m) => m.tick).join(",");
  if (key === view.sizeAxisKey) return;
  view.sizeAxisKey = key;
  const box = $("size-ticks");
  box.innerHTML = "";
  for (const mark of axis.marks) {
    const el = document.createElement("span");
    el.textContent = mark.text;
    el.className = "tick-" + mark.anchor;
    el.style.left = `${(mark.frac * 100).toFixed(4)}%`;
    box.appendChild(el);
  }
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
  if (view.deathsLabel !== label) {
    view.deathsLabel = label;
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
  if (view.powerLabel !== label) {
    view.powerLabel = label;
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
  // The body-size figure's four swatches (v1.104, the fourth in v1.112). It
  // spends no new colour — the bars are the population line's and this bar's
  // own `predation`, and both rules are the pond's refuge ring — so the same
  // rule applies with more force than usual: a legend painted from the
  // stylesheet would be a fourth place for three colours to disagree.
  //
  // The mean's chip is the power strip's problem again and takes the same
  // answer: two rules of one colour, told apart by one of them being dashed, so
  // a solid chip beside the word "mean" would teach a key the figure does not
  // use. Its dash is the figure's own (`MEAN_DASH`), which is why that constant
  // is exported rather than local — a hand-typed copy here is exactly the
  // disagreement this whole function exists to prevent.
  paint("dot-grazer", chartLines().pop);
  paint("dot-carnivore", c.predation);
  const rule = refugeRing().ring;
  paint("line-refuge", rule);
  const [rOn, rOff] = MEAN_DASH;
  $("line-mean").style.background =
    `repeating-linear-gradient(to right, ${rule} 0 ${rOn}px, transparent ${rOn}px ${rOn + rOff}px)`;
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
// when it actually changes — a different creature, an ancestry chain that
// gained a link or lost a lineage, or a toggle that adds a row — and the fields
// that tick are patched in place. What the rows *are* lives in `inspect.js`,
// and since v1.108 the markup and the two figures live in `inspectorview.js` —
// so the panel's wording, its coverage of a creature's fields, its idea of what
// moves *and the strings it builds* are all reachable by `node --test`. What is
// left here is the adapter: the element lookup, the innerHTML write, the two
// click handlers and the per-frame patching.
function updateInspector() {
  const panel = $("inspector");
  const c = renderer.selected;
  if (!c || c.dead) {
    // Somebody the visitor was watching has just died. Until v1.121 the panel
    // simply blanked back to its hint, which is the one moment in a run where
    // this page had a protagonist and nothing to say about them — see
    // `obituary.js`. The record is taken here, in the frame the death is
    // noticed, because the body is off `world.creatures` by now and the window
    // it is measured against moves with every later death.
    if (c && c.dead) {
      view.obitCard = obituaryFor(c, namesForTree(world.phylogeny), world.stats.recentDeaths);
      renderer.selected = null;
      const { title, sentences } = obituaryLines(view.obitCard, config);
      flash(`${title} — ${sentences[0]}`, MEET_FLASH_MS);
      announce(`${title}. ${sentences.join(" ")}`);
    }
    // The card is structure with a button in it, so it obeys the same rule the
    // living panel does: rebuilt on a key, never on a frame.
    const key = view.obitCard ? `obit${view.obitCard.id}` : "-";
    if (view.inspKey !== key) {
      view.inspKey = key;
      panel.classList.toggle("empty", !view.obitCard);
      panel.innerHTML = view.obitCard ? obituaryHTML(view.obitCard, config) : EMPTY_HINT;
      const again = document.getElementById(OBITUARY_MEET_ID);
      if (again) again.addEventListener("click", meetSomebody);
    }
    return;
  }
  // A living subject clears the last card, so meeting somebody new never leaves
  // the panel able to flip back to an obituary the visitor has moved on from.
  view.obitCard = null;

  const chain = world.phylogeny.ancestry(c.speciesId);
  const facts = creatureFacts(c, config);
  // The key decides when the panel's *structure* is rebuilt, so anything that
  // adds or removes a row belongs in it — otherwise flipping the toggle leaves
  // a panel with no Underfoot row to patch, or one nothing updates.
  const key = inspectorKey(c, chain, facts);
  if (key !== view.inspKey) {
    view.inspKey = key;
    panel.classList.remove("empty");
    panel.innerHTML = inspectorHTML(c, chain, facts, namesForTree(world.phylogeny), config);
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

  // Live fields, patched without disturbing anything clickable. Which rows
  // those are is `inspect.js`'s answer, checked there against what actually
  // moves over 600 ticks — a row that changes and is not patched freezes at the
  // value it was built with, which is real data and the wrong number.
  for (const f of facts) {
    if (!f.live) continue;
    const cell = document.getElementById("insp-" + f.key);
    if (cell) cell.textContent = f.value;
  }
  // The introduction moves for the same reason the live rows do: a birth
  // changes its middle clause and a mutation across the licence to hunt changes
  // its first. Built once with the panel, patched every frame after that.
  const intro = document.getElementById("insp-intro");
  if (intro) intro.textContent = creatureIntro(c, config);
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

// Toggle the simulation between running and paused, keeping the button label in
// sync. Shared by the Pause button and the Space keyboard shortcut.
function togglePause() {
  running = !running;
  $("btn-pause").textContent = running ? "⏸ Pause" : "▶ Play";
}

// ---- "Meet somebody" ----
// The one control on this page that answers *"which of these should I watch?"*.
// Everything else here either changes the world or reports on all of it; picking
// an animal has always been the visitor's problem, solved by clicking a dot and
// hoping. `cast.js` ranks the living by how much of a story they have and this
// hands the winner over: selected, followed, named, and introduced in one
// sentence the panel then keeps up to date.
//
// The camera rides along because a named animal you immediately lose in three
// hundred others is worse than no name at all. Escape and 0 let go, as they
// already did for a double-tap.
function meetSomebody() {
  const names = namesForTree(world.phylogeny);
  const star = pickStar(world, config, names);
  const { title, line } = introduceStar(star, config, names);
  if (!star) {
    flash(line);
    announce(line);
    return;
  }
  watchCreature(star.creature, `${title} — ${star.why}.`, `${title}. ${line}`);
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
    // The guide is a dialog, and a dialog owns the keyboard while it is up. Its
    // own handler has already taken the keys it uses; everything else waits.
    if (tourIsOpen()) return;

    switch (e.key) {
      case "?":
        openTour(0);
        break;
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
      case "m":
      case "M":
        meetSomebody();
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
  $("btn-meet").addEventListener("click", meetSomebody);

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
  $("toggle-refuge").addEventListener("change", (e) => {
    renderer.showRefuge = e.target.checked;
    // The line is a fact about the eating rule, so with predation off there is
    // nothing for it to be a line between and the renderer draws nothing. Say
    // so once rather than leaving a ticked box with an empty pond under it.
    if (e.target.checked && !config.predation) {
      flash("The refuge line needs predation switched on — nothing hunts in this pond.");
    }
  });
  $("toggle-trail").addEventListener("change", (e) => {
    renderer.showTrail = e.target.checked;
    if (!e.target.checked) return;
    const c = renderer.selected;
    // The overlay is about one creature, so a ticked box over a pond with
    // nothing selected draws nothing at all. Say so once — the same courtesy
    // the refuge line gets when predation is off.
    if (!c || c.dead) {
      flash("Click a creature (or press an arrow key) to give the trail somebody to follow.");
      return;
    }
    // This is the one moment the spoken form of the path is worth saying: the
    // watcher has just asked to see it. Announcing it on the arrow keys instead
    // would announce nothing — a step lands on a creature whose path has not
    // been recorded yet, by construction.
    announce(describeSelection(c, config, trail.id === c.id ? trail.stats(config) : null, renderer.showReach));
  });
  $("toggle-reach").addEventListener("change", (e) => {
    renderer.showReach = e.target.checked;
    if (!e.target.checked) return;
    const c = renderer.selected;
    // One creature's rings, so the same courtesy the trail gets: a ticked box
    // over an empty selection draws nothing, and saying so beats leaving the
    // watcher looking for a mark that was never coming.
    if (!c || c.dead) {
      flash("Click a creature (or press an arrow key) to see how far its rules reach.");
      return;
    }
    // The rings carry no text — the pond canvas has none — so this is the only
    // place the distances are said in numbers, and the moment to say them is
    // the moment somebody asked to see them.
    announce(describeSelection(c, config, trail.id === c.id ? trail.stats(config) : null, true));
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
  $("toggle-licensed").checked = config.licensedDietCost;
  $("toggle-licensed").addEventListener("change", (e) => {
    config.licensedDietCost = e.target.checked;
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
  $("toggle-bodies").checked = config.bodyCollision;
  $("toggle-bodies").addEventListener("change", (e) => {
    // Nothing to rebuild: the pass is a function of where everyone is standing
    // when it runs, so switching it on takes effect on the next tick and a pond
    // that has been piling up for an hour simply unpiles over the next few.
    config.bodyCollision = e.target.checked;
    syncHash();
  });
  $("toggle-mass").checked = config.massWeightedShove;
  $("toggle-mass").addEventListener("change", (e) => {
    // Same as its parent: the split is recomputed from scratch every tick, so
    // this takes hold on the next one. It does nothing at all while
    // `toggle-bodies` is off, which the label says and the panel does not
    // enforce — every other dependent pair here (rock and its opacity) leaves
    // the inert combination reachable rather than disabling a control.
    config.massWeightedShove = e.target.checked;
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
  $("toggle-whisker").checked = config.wallSense;
  $("toggle-whisker").addEventListener("change", (e) => {
    config.wallSense = e.target.checked;
    // Rebuild every living brain so the whisker is wired in (or unwired) at
    // once, exactly as the ear and the foot are — and with the same caveat: a
    // creature born into a world without the sense carries a silent gene block,
    // so switching it on mid-run hands most of the pond a numb whisker and
    // leaves the work to their descendants' mutations.
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

  // Two of the world rules are measurably inert in the ponds anybody actually
  // watches: v1.120 flipped each rule against its own control on six seeds for
  // 1,500 ticks and found `kinRecognition` and `deathIsFinal` leaving the world
  // bit-for-bit identical — the same state hash, not merely a similar pond. A
  // control that cannot do anything is the most confusing thing a panel can
  // hold, so each says so once when it is switched on. Same courtesy the refuge
  // line has had since it learned to notice that predation was off, and bound
  // from the table rather than typed into two handlers so the sentence and the
  // measurement that justifies it live in one place.
  for (const s of quietSwitches()) {
    $(s.id).addEventListener("change", (e) => {
      if (e.target.checked) flash(s.quiet, MEET_FLASH_MS);
    });
  }

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
    view.legendSig = "";
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

// ---- The pond's name (v1.134) ----
// One function writes the plate and the browser tab, and every path that can
// move the seed calls it: Reset, the dice, the field, a scenario, a saved world
// and the permalink the page opened with. It returns whether the name *moved*,
// so the rule about saying hello lives here rather than being decided again at
// each call site: **arriving somewhere new is an event and rebuilding where you
// already are is not.** Reset on the same seed is therefore silent, which is
// v1.132's finding read from the other end — a banner that fires on every press
// of a button is a banner a reader stops seeing.
let pondNamed = null;
function syncPondName() {
  const { name } = pondName(config.seed);
  const moved = name !== pondNamed;
  pondNamed = name;
  $("pond-name").textContent = name;
  $("pond-seed").textContent = String(config.seed);
  document.title = pondTitle(config.seed);
  return moved;
}

function resetWorld(seed) {
  // Preserve any live-tuned parameters, just change the seed and rebuild.
  config = makeConfig({ ...config, seed });
  world = new World(config);
  renderer.setConfig(config);
  if (syncPondName()) flash(welcomeTo(config.seed));
  syncHash();
}

// Copy the current permalink to the clipboard (falls back gracefully).
function shareLink() {
  syncHash();
  const url = location.href;
  const done = () => flash(shareLine(config.seed));
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
    // A word you can press should look like one (v1.127). The plates are the
    // only marks on this canvas that are controls, and on a machine with a
    // cursor this is the whole of the affordance — the pond keeps its crosshair
    // everywhere else, which is the stylesheet's own rule and stays true the
    // moment the hand leaves the plate.
    canvas.style.cursor = renderer.tagAt(p.x, p.y) ? "pointer" : "";
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
    // A press on a name is a press on the animal wearing it (v1.127), and it is
    // tested before the water for two reasons. A plate is sixteen pixels tall
    // where the dart under it is four, so it is by some distance the easiest
    // target on this canvas and the one a thumb will actually find; and someone
    // aiming at a word has not aimed at whatever happens to be swimming behind
    // it. Pressing a name does what pressing the name on the board does —
    // selects them, and rides along — so the two surfaces cannot part company.
    const plate = renderer.tagAt(g.x, g.y);
    if (plate) {
      watchNamed(plate.id);
      return;
    }
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
      flash(`Following ${creatureLabel(c, namesForTree(world.phylogeny))} — drag, or press 0, to let go.`);
    } else {
      cam().reset();
    }
  };
  canvas.addEventListener("pointerup", (e) => lift(e, false));
  canvas.addEventListener("pointercancel", (e) => lift(e, true));

  // ---- The keyboard route into the pond ----
  // Everything above this line needs a pointer. `src/pondnav.js` is where the
  // "which creature is east of this one?" arithmetic lives and where the suite
  // can reach it; this is the adapter, the same division the pointer path uses.
  //
  // The first arrow press with nothing selected picks up whatever the view is
  // already on, rather than the focus landing on the canvas selecting something
  // by itself — tabbing *past* the pond on the way to the controls must not
  // move the camera or start narrating a creature nobody asked about.
  canvas.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const dir = DIRECTION_KEYS[e.key];
    if (dir) {
      const live = renderer.selected && !renderer.selected.dead ? renderer.selected : null;
      const next = live
        ? stepSelection(world.creatures, live, dir, config)
        : entrySelection(world.creatures, { x: cam().x, y: cam().y }, config);
      // Nobody that way: keep the selection. A key that cannot do anything must
      // not undo the thing a viewer has spent five presses reaching.
      if (next) {
        renderer.selected = next;
        // Following, then stepping, hands the camera over — exactly what
        // clicking somebody else while following does.
        if (cam().target) cam().setTarget(next);
        else if (cam().zoom > MIN_ZOOM) cam().moveTo(next.x, next.y);
        // The path belongs to whoever the trail is currently recording, so a
        // step onto somebody new says nothing about a path yet — `Trail.stats`
        // is read *after* the reassignment above, and `record` has already
        // cleared it by the next tick.
        announce(
          describeSelection(next, config, trail.id === next.id ? trail.stats(config) : null, renderer.showReach)
        );
      }
      e.preventDefault();
      return;
    }
    if (e.key === "Enter") {
      const c = renderer.selected;
      if (c && !c.dead) {
        cam().setTarget(c);
        const who = creatureLabel(c, namesForTree(world.phylogeny));
        flash(`Following ${who} — press Escape, or 0, to let go.`);
        announce(`Following ${who}.`);
      }
      e.preventDefault();
      return;
    }
    if (e.key === "Escape") {
      renderer.selected = null;
      cam().setTarget(null);
      announce(describeSelection(null, config));
      e.preventDefault();
    }
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
    $("seed-input").value = config.seed;
    // The name is written before the receipt names it, so the plate and the
    // banner cannot disagree for the length of a frame.
    syncPondName();
    syncHash();
    flash(`Loaded — you are back in ${pondName(config.seed).name}.`);
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
// An introduction is two clauses and a name; 1.8 seconds is a glance, which is
// enough for "Whole-run data exported." and not enough to read a sentence about
// an animal. So the banner takes a duration now, and the only caller that asks
// for a different one is the one with something to say.
const FLASH_MS = 1800;
const MEET_FLASH_MS = 4200;
/**
 * The toast over the water.
 *
 * `cheer` is the one kind this banner has, and it is a *class* rather than a
 * second element for the reason the ladder's rows are text: two overlapping
 * banners would be two things to read at once. A celebration and a receipt
 * ("World saved to your browser.") look different and queue in the same place.
 */
function flash(msg, ms = FLASH_MS, kind = "") {
  const el = $("flash");
  // Text, not markup, and it takes any offer the last banner made with it: a
  // receipt that inherited "👀 Show me" from the celebration before it would
  // send a visitor to whoever the previous rung was about.
  el.textContent = msg;
  el.classList.toggle("cheer", kind === "cheer");
  el.classList.add("show");
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    el.classList.remove("show");
    // The offer goes when the words do, rather than fading with them. An
    // invisible control is still in the keyboard walk (v1.51) and still under a
    // finger, and a banner is transparent for as long as the page is open.
    const go = el.querySelector(".flash-go");
    if (go) go.remove();
  }, ms);
}

// The banner's own control: press it and the camera goes and finds whoever the
// rung was about. Built here rather than in `cheer.js` for the reason that
// module states about itself — it is handed rows and never a world, so it can
// name a subject and cannot resolve one — and appended as an element rather
// than written into the banner's markup, because `flash` sets `textContent` and
// this page has kept its one toast free of `innerHTML` since it was written.
function offerToShow(key, whoIs) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "flash-go";
  btn.textContent = WATCH_LABEL;
  // *Show me* is two words a person says out loud and names nobody, which is
  // right on a row a reader can see and wrong read alone out of a live region.
  btn.setAttribute("aria-label", `Watch ${whoIs}`);
  btn.addEventListener("click", () => watchMilestone(key));
  $("flash").append(btn);
}

boot();
