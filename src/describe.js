// describe.js — the pond, said out loud.
//
// Thirty versions of this project went into things to look at. The whole
// headline experience is a canvas: `<canvas id="world">`, with no accessible
// name, no role, and no text anywhere on the page that says what is happening
// inside it. A visitor using a screen reader arrives at the most-linked page in
// this repo and is told, in full: "world". Everything the pond has ever done —
// the forty founders, the first hunter, a crash and a recovery — has been
// legible only to an eye.
//
// This module is the text half of that world. It is a PURE OBSERVER in the same
// sense as `phylogeny.js`, `chronicle.js` and `energy.js`: it reads world state,
// draws no random numbers, and nothing in the simulation reads it back, so a
// world that is being described is bit-for-bit the world that is not.
// `test/describe.test.js` pins that the same way `test/energy.test.js` does.
//
// Two surfaces, because a listener needs two different things:
//
//   `describePond()` is a *state* — what is true right now, for the canvas's
//   `aria-label`, read on demand when someone puts their cursor on the pond.
//
//   `pendingSpeech()` is an *event* — what has just changed, for a polite live
//   region. It says nothing at all unless the Chronicle has written a new line,
//   which is the point: a live region that talks every second cannot be listened
//   to, and this project already owns a narrator whose whole job is deciding
//   when something is worth reporting. The Chronicle has been writing for a
//   sighted reader since v1.5; this gives it an audience that cannot see the
//   feed it writes into.
//
// Both follow the rule the rest of the HUD follows: a mechanic that is switched
// off is not mentioned. A description that says "0 sick" in a world with no
// pathogen is the spoken form of a readout showing a steady, plausible zero.

/** How many Chronicle lines a single utterance may carry — see `pendingSpeech`. */
export const MAX_SPOKEN = 3;

/**
 * The season badge's text, as data. Lives here rather than in `main.js` so that
 * the badge a visitor sees and the sentence a listener hears cannot drift apart,
 * and so a test can reach either. Reports "No seasons" with the cycle off, which
 * is what the badge has always shown.
 * @param {number} tick
 * @param {object} config
 */
export function seasonLabel(tick, config) {
  if (!config.seasons) return { icon: "◷", name: "No seasons", year: null };
  const angle = (2 * Math.PI * tick) / config.seasonLength;
  const s = Math.sin(angle);
  const rising = Math.cos(angle) > 0; // heading toward summer
  let icon, name;
  if (s > 0.5) [icon, name] = ["☀️", "Summer"];
  else if (s < -0.5) [icon, name] = ["❄️", "Winter"];
  else if (rising) [icon, name] = ["🌱", "Spring"];
  else [icon, name] = ["🍂", "Autumn"];
  const year = Math.floor(tick / config.seasonLength) + 1;
  return { icon, name, year };
}

/**
 * The time-of-day badge's text. Only ever shown while the day/night cycle is
 * running — with it off the pond is permanently at noon, which is not worth
 * saying — but like `seasonPhase` it reports the shape of the cycle either way
 * and lets the caller decide.
 * @param {number} tick
 * @param {object} config
 */
export function timeOfDayLabel(tick, config) {
  const light = (Math.cos((2 * Math.PI * tick) / config.dayLength) + 1) / 2;
  // Daylight is a cosine, so it is climbing back toward noon while sin is negative.
  const rising = Math.sin((2 * Math.PI * tick) / config.dayLength) < 0;
  if (light > 0.75) return { icon: "🌞", name: "Day" };
  if (light < 0.25) return { icon: "🌙", name: "Night" };
  return rising ? { icon: "🌅", name: "Dawn" } : { icon: "🌆", name: "Dusk" };
}

/**
 * Everything the canvas would tell you if it could talk: the accessible name for
 * `#world`.
 *
 * Scope is deliberately *what is in the pond*, not what is in the sidebar. The
 * mortality and energy bars carry their own labels, the stats are already text,
 * and a paragraph that repeats them would bury the six numbers that matter under
 * twenty that a listener can go and read. What has no text form anywhere else is
 * the picture: how many creatures, how many hunt, how much food, how old the
 * deepest lineage is, what time of year and of day it is, and — since v1.17 made
 * it possible to be looking at a corner of the pond without knowing it — where
 * the camera is pointed.
 *
 * @param {import('./world.js').World} world
 * @param {object} config
 * @param {import('./camera.js').Camera} [camera] optional; the view, if any
 * @returns {string}
 */
export function describePond(world, config, camera = null) {
  const pop = world.creatures.length;
  const food = world.food.items.length;
  const s = world.stats;
  const out = [];

  const at = `The pond at tick ${world.tick.toLocaleString()}`;
  if (pop === 0) {
    // An empty pond is the one state where the headline number says nothing on
    // its own: "0 creatures" is a fact, "nothing is alive" is the news.
    out.push(`${at}: nothing is alive.`);
  } else {
    out.push(`${at}: ${count(pop, "creature")}, ${count(food, "food pellet")}.`);
    // Carnivores only where they can actually hunt. The diet gene exists in
    // every world, but with predation off it decides nothing, so a hunter count
    // would be describing a trait rather than a behaviour.
    if (config.predation) {
      const carn = s.carnivoreCount || 0;
      out.push(
        carn === 0
          ? "None of them hunt."
          : `${count(carn, "of them hunts", "of them hunt")}, at ${percent(carn / pop)} of the pond.`
      );
    }
    out.push(`The deepest lineage has reached generation ${s.currentMaxGeneration}.`);
  }

  if (config.seasons) {
    const season = seasonLabel(world.tick, config);
    out.push(`${season.name} of year ${season.year}.`);
  }
  if (config.dayNightCycle) out.push(`${timeOfDayLabel(world.tick, config).name}.`);
  // Contagion, and only once there is a contagion to report: a pathogen that has
  // not appeared yet is not news, and this is the shape of the v1.16 burnout bug
  // — never narrate the state of a thing that has not started.
  if (config.disease && (s.infectedCount > 0 || s.immuneCount > 0)) {
    out.push(`${s.infectedCount} sick, ${s.immuneCount} immune.`);
    // How much of the water is inside catching distance — the same claim the two
    // views make in blue, which until v1.34 no surface made at all. Exactly zero
    // with nobody sick, so a pond of survivors says nothing about a hazard.
    if (s.hazardShare > 0) {
      out.push(`The sickness reaches ${percent(s.hazardShare)} of the water.`);
    }
  }
  // The ground, where the ground has an opinion. `groundBias` is exactly 0
  // without terrain — the same guard the Ground tile uses — and it is the one
  // number on the panel that says whether the pond has settled into its flats.
  // Until v1.33 that number was visible only to an eye, which is the v1.31
  // lesson repeating itself one surface down.
  if (config.terrain && pop > 0) {
    const pct = Math.round(Math.abs(s.groundBias) * 100);
    out.push(
      pct === 0
        ? "The living are spread evenly across rough ground and smooth."
        : `The living are on ground ${pct}% ${
            s.groundBias < 0 ? "smoother" : "rougher"
          } than the landscape average.`
    );
  }
  if (camera) out.push(describeView(camera, config));

  return out.filter(Boolean).join(" ");
}

/**
 * Where the camera is looking, in words. Silent at the default view, which is
 * the whole pond and needs no explanation — and which is exactly the state
 * `isDefault()` protects, so the sentence appears at the same moment the zoom
 * badge and the minimap do.
 */
function describeView(camera, config) {
  if (camera.isDefault()) return "";
  return (
    `Zoomed to ${camera.zoom.toFixed(1)}×, centred at x ${Math.round(camera.x)}, ` +
    `y ${Math.round(camera.y)} of a ${config.width} by ${config.height} pond.`
  );
}

/**
 * What a live region should be told, given the Chronicle so far and the last
 * line the listener has already heard.
 *
 * The caller keeps the returned `spoken` and hands it back next frame. Three
 * things make this safe to call every frame:
 *
 *  - Nothing new, nothing said. `text` is `""` and a caller that only writes
 *    non-empty text never re-announces anything.
 *  - The first call is silent. Arriving on the page mid-run must not read out
 *    the entire natural history of the pond, so the first call marks the feed
 *    as heard and says nothing. (Priming is why this returns `spoken` even when
 *    it says nothing.)
 *  - At most `MAX_SPOKEN` lines per utterance. At 20× speed a pond can produce
 *    a run of events between two frames, and a paragraph that takes a minute to
 *    read out is a paragraph that is out of date before it ends. The count of
 *    what was skipped is spoken instead, so the listener knows there is more in
 *    the feed rather than silently losing it — the v1.22 rule about a readout
 *    that quietly drops what does not fit.
 *
 * @param {Array<{tick:number,msg:string}>} events `world.chronicle.events`
 * @param {object|null} spoken the last event announced, or null on the first call
 * @returns {{text: string, spoken: object|null}}
 */
export function pendingSpeech(events, spoken) {
  const newest = events.length ? events[events.length - 1] : null;
  if (!newest || spoken == null) return { text: "", spoken: newest };

  // The Chronicle's buffer is bounded and shifts from the front, so the event a
  // listener last heard can leave the array entirely. Not finding it means
  // everything still here is newer than it, which the cap below then trims.
  const i = events.indexOf(spoken);
  const fresh = i >= 0 ? events.slice(i + 1) : events.slice();
  if (fresh.length === 0) return { text: "", spoken };

  const shown = fresh.slice(-MAX_SPOKEN);
  const skipped = fresh.length - shown.length;
  const parts = shown.map((e) => e.msg);
  if (skipped > 0) parts.unshift(`${count(skipped, "earlier event")} not read out.`);
  return { text: parts.join(" "), spoken: newest };
}

/**
 * The power strip's two texts: the peak that goes under it, and the sentence a
 * listener gets instead of the picture.
 *
 * Here rather than in `main.js` for the reason `seasonLabel` is here — the words
 * under a figure and the words spoken about it must not be able to drift — and
 * because a caption saying the pond is gaining energy when it is losing it is
 * exactly the kind of claim this project makes a test hold.
 *
 * The balance is read from `overall` — the flat rate across everything on
 * screen — rather than off the newest interval. The lines are trailing means
 * and so overlap each other, which makes them the wrong thing to average, and
 * the newest one alone would flip the verdict several times a second while the
 * shape on screen said something steady.
 *
 * The peak carries its window with it, because the line is a mean and a mean
 * damps a spike: "peak 12.3 per tick over 120 ticks" is a claim a reader can
 * check, and "peak 12.3" over an unstated window is not.
 *
 * "Level" is not a rounding of zero: the pond mints and spends steadily and the
 * two sides track each other closely, so a net of a fiftieth of the throughput
 * is a stock that is, for any purpose a watcher has, standing still. The
 * threshold is a share of what is flowing rather than an absolute, because the
 * flow itself moves by an order of magnitude in a run.
 *
 * @param {{intervals: Array<object>, overall: object|null, scale: number}} series
 *   from `energySeries`
 * @returns {{peak: string, label: string}}
 */
export function describePower(series) {
  const { intervals, overall, scale } = series;
  // Energy has moved but the first averaging window has not filled, so there is
  // nothing to draw yet and nothing true to say about a peak. Not the same
  // sentence as an empty pond, which is the distinction a readout that is still
  // warming up usually fails to make.
  if (overall && !intervals.length) {
    return { peak: "", label: "Power over time: not enough history yet." };
  }
  if (!overall || scale <= 0) {
    return { peak: "", label: "Power over time: no energy has moved in this window." };
  }
  const net = overall.power - overall.spend;
  const flow = Math.max(overall.power, overall.spend);
  const verdict = Math.abs(net) < 0.02 * flow ? "level" : net > 0 ? "gaining" : "running down";
  // Every drawn interval is the same width but the last one, so the newest is
  // the honest description of the window the line is smoothed over.
  const win = intervals[intervals.length - 1].dt;
  return {
    peak: `peak ${rate(scale)}/tick · ${win.toLocaleString()}-tick mean`,
    label:
      `Power over time: across the last ${count(overall.dt, "tick")} the pond made ` +
      `${rate(overall.power)} and spent ${rate(overall.spend)} energy per tick — ${verdict}. ` +
      `Busiest ${count(win, "tick")}: ${rate(scale)} per tick.`,
  };
}

/**
 * The population chart, said out loud (v1.41).
 *
 * The two strips under this figure have had `aria-label`s since the releases
 * that built them, and the chart they hang off — the oldest view in the project
 * — had none at all: a listener got the word "chart" and the two strips'
 * commentary on a picture they could not hear described. What it has to carry
 * is the same thing the new grid carries for an eye: the two numbers, and the
 * *scales* they sit on, because a population of 214 means nothing without the
 * ceiling it is 214 of.
 *
 * @param {Array} hist the history on screen
 * @param {{top: number}} axis the population scale
 * @param {number} foodMax the food scale
 */
export function describeChart(hist, axis, foodMax) {
  if (hist.length < 2) {
    return "Population and food over time: not enough history yet.";
  }
  const last = hist[hist.length - 1];
  const from = hist[0].tick;
  return (
    `Population and food over time, ticks ${from.toLocaleString()} to ${last.tick.toLocaleString()}: ` +
    `${count(last.pop, "creature")} on a scale to ${axis.top.toLocaleString()}, ` +
    `${count(last.food, "food pellet")} of ${foodMax.toLocaleString()}.`
  );
}

/** An energy rate, at the one decimal place the strip's numbers are worth. */
function rate(n) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** "1 creature" / "2 creatures", with the thousands separators a reader wants. */
function count(n, one, many = null) {
  const word = n === 1 ? one : many || one + "s";
  return `${n.toLocaleString()} ${word}`;
}

/** A whole-number percentage, floored at 1% so a real hunter is never "0%". */
function percent(fraction) {
  const p = Math.round(fraction * 100);
  return `${p === 0 && fraction > 0 ? "<1" : p}%`;
}
