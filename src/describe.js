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
//
// v1.67 asked this surface the question v1.57 asked the minimap — not *what is
// this view lying about* but *what is in the world that it has never heard of*.
// The inventory is at `describePond`, along with the one item it leaves open.

// The one thing this module borrows: shares that are spoken as percentages get
// the same largest-remainder rounding the mortality caption uses, so a listener
// and a reader are never told two different totals.
import { wholePercents } from "./stats.js";
import { refugeRadius } from "./refuge.js";
import { readable } from "./seasonlag.js";

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
 * **The inventory (v1.67).** That paragraph describes what this function was
 * *aimed* at, which is not the same as what it covers, and the way to find the
 * difference is v1.57's question: list what is in the world, then ask this
 * surface which of the items it has ever heard of. Twelve nouns have a place in
 * the pond — creatures, food, corpses, biomes, terrain, enriched ground, rock,
 * the contagious zone, voices, the clock, the season and the view — and this
 * function knew eight of them. The dead have lain here since v1.8 with no tile,
 * no caption and no sentence anywhere on the page; the voices (v1.20) are rings
 * an eye can see and half a tile; the soil (v1.27) is a tile and a wash. All
 * three are spoken now, each silent where its rule is off.
 *
 * The twelfth noun — the **biomes** — took v1.68, for the reason v1.67 gave:
 * the other three had a statistic waiting and this one needed one invented.
 * `stats.patchBias` is it, and the sentence below states what it found rather
 * than what the field does. The crop is *sown* into the biomes (+0.092 mean
 * fertility over the field's own average, twelve seeds of twelve); what is
 * still standing when a watcher looks is +0.024, inside the scatter of
 * uniformly placed pellets on ten of those twelve. The living are the ones at
 * +0.089. So the sentence is about where the pond is, not about where the
 * pellets are: the crop's own pattern is eaten as fast as it appears, and the
 * creatures are what is left of it.
 *
 * v1.67 also said the biomes had no off switch to control against. They do:
 * `foodPatches`, in the panel and in the permalink since v1.3, named after what
 * it does to the food rather than after the field — which is why an inventory
 * of *nouns* walked straight past it. With it off the number reads +0.000 on
 * the same twelve seeds, so this sentence is silent there and the silence is
 * measured rather than assumed.
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
      // And who is out of reach. The refuge is the one fact about predation
      // here that no picture can carry: a body at 7.3 px looks exactly like a
      // body at 7.2, and one of them cannot be eaten by anything this world is
      // able to grow. Stated with its threshold, because the number is a
      // quotient of two config constants rather than a rule anybody wrote.
      out.push(
        `${percent(s.refugeShare)} of them have grown past ${refugeRadius(config).toFixed(1)} ` +
          "pixels, the size above which nothing here can eat them."
      );
      // And who is spared rather than out of reach. Kin recognition (v1.10) has
      // never been reported anywhere on this page: it takes effect inside a
      // hunter's senses, so a spared relative is not approached, not marked and
      // not counted — the pond simply looks like one where that hunter had
      // nothing nearby worth chasing. Both readings are worth saying out loud,
      // and the silent one most of all: a rule that has been offered no family
      // to spare is not the same as a rule switched off, and until now the two
      // sounded identical.
      //
      // Inside the `predation` block, like the refuge above but for the opposite
      // reason. The refuge is a quotient of two constants and is a true fact in
      // a pond with nobody hunting; "a meal it was able to take" is *not* true
      // there, because with the biting off no meal is ever taken. The counter
      // behind this keeps running in such a world — it measures the rule, which
      // still changes what a carnivore chases — and this sentence is the wrong
      // place for a number whose words would be false (v1.68's Biome tile).
      if (config.kinRecognition) {
        out.push(
          s.kinSpared === 0
            ? "Hunters spare their own family here, though none has yet come across " +
              "a relative it was able to eat."
            : `Hunters have passed over ${count(s.kinSpared, "relative")} they were able ` +
              `to eat, ${s.kinSparedRate.toFixed(1)} per hundred ticks lately.`
        );
      }
    }
    out.push(`The deepest lineage has reached generation ${s.currentMaxGeneration}.`);
  }

  // The dead. Corpses have lain in this pond since v1.8 and nothing on the page
  // has ever counted them — no stat tile, no caption, no sentence, only pixels
  // and (since v1.57) a mark on the minimap — so a listener could not tell a
  // scavenging world from one where a body simply vanishes. Not gated on `pop`:
  // a pond that has just died still has meat in it, and that is exactly when
  // the count is worth hearing. `world.corpses` is empty by construction with
  // the rule off, and an instant with nothing dead is not news, so this stays
  // quiet in both cases.
  if (config.scavenging && world.corpses.length > 0) {
    out.push(
      `${count(world.corpses.length, "corpse lies", "corpses lie")} where creatures died: ` +
        "meat that rots away, and that anything close enough can eat."
    );
  }
  // The voices. Signalling (v1.20) is drawn as rings around a body — a picture
  // and nothing else — and the `Heard` tile carries half of it, while the
  // volume the pond is actually speaking at has never been stated anywhere.
  // Both numbers are exactly 0 with the channel closed. The radius goes in
  // because it *is* the rule: a call that carries a tenth of the pond is a
  // different mechanic from one that carries all of it, and this is one of the
  // distances nothing here draws.
  if (config.signalling && pop > 0) {
    out.push(
      `Creatures are calling to one another across ${config.signalRadius} pixels: ` +
        `voices average ${s.avgVoice.toFixed(2)} out of 1, and the loudest call reaching ` +
        `each of them ${s.avgHeard.toFixed(2)}.`
    );
  }

  if (config.seasons) {
    const season = seasonLabel(world.tick, config);
    out.push(`${season.name} of year ${season.year}.`);
    // …and how far behind that year the pond itself is running (v1.78). The
    // clock above says where the *world* is; this says where the *animals*
    // are, which is not the same place and is the finding this release exists
    // for: a population peaks about a fifth of a year after the rate food
    // arrives at does, and a winter-half against summer-half mean cannot see it,
    // because a two-bucket split cancels a quarter-period delay exactly.
    //
    // Silent until the record can support a number and silent where the pond
    // is not keeping time — one predicate for that, shared with the tile.
    const lag = readable(s.seasonLag);
    if (lag) {
      const ticks = Math.abs(Math.round(lag.lag)).toLocaleString();
      out.push(
        lag.lag < 0
          ? `The pond runs ${ticks} ticks ahead of its year.`
          : `The pond runs ${ticks} ticks behind its year: the population peaks that long after the season's high point.`
      );
    }
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
  // The biomes. The fertility field decides where food falls and has done since
  // v1.3, and a listener has never been told it exists — nor has a reader, until
  // the tile this shares its number with. Stated as where the *pond* is rather
  // than where the pellets are, because that is the half of the claim that
  // survives its control: the standing crop's own bias sits inside the scatter
  // of uniformly placed pellets on ten seeds of twelve, and the living sit well
  // outside it on twelve of twelve. Silent with `foodPatches` off, where the
  // pond stands nowhere in particular and the number is measured noise (+0.000
  // on twelve seeds), and silent where it rounds to nothing.
  if (config.foodPatches && pop > 0) {
    const pct = Math.round(Math.abs(s.patchBias) * 100);
    if (pct > 0) {
      out.push(
        s.patchBias > 0
          ? `The living are gathered where the food grows: ground ${pct}% more fertile ` +
            "than this pond's average."
          : `The living are out in the barrens: ground ${pct}% less fertile than this ` +
            "pond's average."
      );
    }
  }
  // The ground the dead leave. `soilShare` is the share of *newly sprouted*
  // pellets that grew out of nutrient a body left, averaged over the last few
  // hundred ticks — the Soil tile's own fraction, at the percentage rounding
  // this module uses everywhere, so a reader and a listener are told the same
  // thing about the same quantity. Exactly 0 without a nutrient field, and a
  // crop that owes the dead nothing yet says nothing.
  if (config.detritus && s.soilShare > 0) {
    out.push(
      `${percent(s.soilShare)} of new food is sprouting from ground where something died.`
    );
  }
  // The rock. A wall is a fact about the shape of the world rather than a
  // quantity, so it is stated once and plainly — how many rooms there are, and
  // how hard the pond is currently finding them. The rate is exactly 0 without
  // barriers, and the sentence is skipped there, so a pond with no walls says
  // nothing about walls.
  if (world.barriers && pop > 0) {
    const rooms = world.barriers.roomCount();
    out.push(
      `Rock divides the pond into ${count(rooms, "room")}, joined by gates. ` +
        `Creatures are turned back by it ${s.walledRate.toFixed(0)} times per hundred ticks.` +
        // Opacity changes what a room *is* — somewhere to hide rather than only
        // somewhere to be stuck — and it is the one property of this feature
        // that has no picture at all unless a creature is selected. A watcher
        // who cannot see the canvas gets it in words instead.
        (config.barrierOcclusion ? " The rock is opaque: nothing sees, hears or infects through it." : "")
    );
  }
  // Solid bodies. The hardest rule in this world to *see* — a pond where
  // nobody overlaps looks very like a pond where everybody may — so the only
  // honest thing to say about it is how much shoving it is doing. Exactly 0
  // without the rule, and the sentence is skipped there.
  if (config.bodyCollision && pop > 0) {
    out.push(
      "Bodies are solid: two creatures cannot stand in the same place, and the pond " +
        `pushes ${s.jostledRate.toFixed(0)} overlapping pairs apart per hundred ticks.` +
        // Who yields is the only thing this flag changes, and it changes
        // nothing a listener could otherwise infer from the rate.
        (config.massWeightedShove
          ? " The shove is weighted by mass: of any overlapping pair, the smaller body gives up most of the ground."
          : "")
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
 * Which ninth of the pond a point is in, as a compass word. A listener stepping
 * the selection with the arrow keys is building a map in their head, and
 * "x 612, y 88" is a coordinate rather than a place — the pond's own copy talks
 * about north and south everywhere else, so this does too. The middle band on an
 * axis contributes nothing, which is what makes the centre "the middle" rather
 * than "the middle middle".
 */
export function regionOf(x, y, config) {
  const band = (v, size) => (v < size / 3 ? 0 : v < (2 * size) / 3 ? 1 : 2);
  const ns = ["north", "", "south"][band(y, config.height)];
  const ew = ["west", "", "east"][band(x, config.width)];
  if (!ns && !ew) return "the middle";
  return `the ${[ns, ew].filter(Boolean).join("-")}`;
}

/**
 * The creature the keyboard has just landed on, said out loud.
 *
 * The inspector has shown all of this since v1.15, and a listener can read it —
 * but only by leaving the pond, walking the panel, and losing the place they
 * were navigating from. An arrow key that moves a selection and says nothing is
 * v1.13's rule with the senses swapped: the mechanic obeys, and the watcher
 * cannot tell it happened.
 *
 * It is deliberately one short sentence. This goes into the same live region as
 * the Chronicle, and it fires on *every* press — the v1.31 rule that the cost of
 * saying something is the listener's time applies hardest to the thing they are
 * about to say again.
 *
 * Energy is a share of `energyMax`, which is exactly the arithmetic the
 * inspector's Energy row uses, so the number a reader sees and the number a
 * listener hears cannot drift apart. (That clamp is unreachable in practice —
 * see v1.29 — so the share is a low number by construction and not a bug.)
 *
 * @param {object|null} c - the selected creature, or null for a cleared selection
 * @param {object} config
 */
export function describeSelection(c, config) {
  if (!c) return "Selection cleared.";
  const bits = [`generation ${c.generation}`];
  // Diet only where it decides something, the same guard `describePond` uses on
  // the hunter count: the gene exists in every world and means nothing without
  // predation.
  if (config.predation) {
    bits.push(c.carnivory >= config.carnivoreThreshold ? "a hunter" : "a grazer");
  }
  bits.push(`${percent(c.energy / config.energyMax)} fed`);
  if (config.disease) {
    if (c.infected) bits.push("sick");
    else if (c.immune) bits.push("immune");
  }
  const where = `in ${regionOf(c.x, c.y, config)} of the pond`;
  return `Creature ${c.id}, ${bits.join(", ")}, ${where}.`;
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
 * v1.74 adds the season, and it is the clause a listener needs most: the shading
 * is the only thing on this figure that carries no number, so a reader can see
 * where winter is and a listener had no way to ask. It is built from the same
 * object the canvas is painted from rather than from the config, so the sentence
 * and the picture cannot come apart (v1.61 — when a fixture rebuilds what the
 * shipped code builds, ask which of the two is the source).
 *
 * @param {Array} hist the history on screen
 * @param {{top: number}} axis the population scale
 * @param {number} foodMax the food scale
 * @param {{state:string, bands:Array}} [season] `seasonBands()` for this window
 */
export function describeChart(hist, axis, foodMax, season = null) {
  if (hist.length < 2) {
    return "Population and food over time: not enough history yet.";
  }
  const last = hist[hist.length - 1];
  const from = hist[0].tick;
  return (
    `Population and food over time, ticks ${from.toLocaleString()} to ${last.tick.toLocaleString()}: ` +
    `${count(last.pop, "creature")} on a scale to ${axis.top.toLocaleString()}, ` +
    `${count(last.food, "food pellet")} of ${foodMax.toLocaleString()}.` +
    describeSeason(season, last.tick)
  );
}

/**
 * The season clause of `describeChart`. Silent when there are no seasons to
 * report — a world with them switched off says nothing about them, the same
 * rule the other eleven nouns follow here.
 */
function describeSeason(season, tick) {
  if (!season) return "";
  if (season.state === "aliased") {
    return " This window is too long to show the seasons.";
  }
  // An all-summer window has no bands and still has a season worth saying: for
  // a listener, "0% of this window is winter" is the sentence the *absence* of
  // shading gives an eye for free.
  if (season.state !== "ok") return "";
  const share = season.bands.reduce((sum, b) => sum + (b.x1 - b.x0), 0);
  const now = season.bands.some((b) => b.to >= tick);
  return (
    ` The newest tick is in ${now ? "winter, when food arrives more slowly" : "summer"}; ` +
    `${Math.round(share * 100)}% of this window is winter.`
  );
}

/**
 * The Tree of Life, said out loud (v1.42).
 *
 * The last unnarrated canvas on the page, and the one the landing copy leads
 * with. v1.31 gave the pond a name and v1.41 the chart; the Muller plot kept
 * saying the single word "muller", while the two text lines beside it — the
 * species tally and the tick range — described everything about the record
 * *except* what is in it. So the scope here is the same as `describePond`'s:
 * only the part with no text form anywhere else, which is the shape of the
 * stack. Who holds the pond now, in shares that add to a whole, and what the
 * largest lineage was worth when the record began — the one comparison a
 * whole-run plot exists to support and an eye makes for free.
 *
 * @param {ReturnType<typeof import('./mullerplot.js').mullerShares>} shares
 * @param {{from:number, to:number}|null} [span] the ticks the record covers
 */
export function describeMuller(shares, span = null) {
  const { shown, frac, other, live, n } = shares;
  if (n < 2) return "Species over time: not enough history yet.";
  const when = span
    ? `, ticks ${span.from.toLocaleString()} to ${span.to.toLocaleString()}`
    : "";
  const i = n - 1; // the newest column: what the right-hand edge shows
  // An empty window draws no bands at all since v1.42, and saying "0% of
  // nothing" would be the spoken form of the picture that release removed.
  if (!live[i]) return `Species over time${when}: nothing is alive in the newest window.`;

  const named = shown
    .map((s, k) => ({ id: s.id, now: frac[k][i], then: frac[k][0] }))
    .filter((e) => e.now > 0)
    .sort((a, b) => b.now - a.now || a.id - b.id);
  if (!named.length) {
    return (
      `Species over time${when}: no lineage has yet reached the size that earns ` +
      `a band, so the whole plot is the grey churn of small ones.`
    );
  }

  // Parts of a whole get largest-remainder rounding, so the shares a listener
  // hears add to 100 — the v1.21 caption rule, which is about arithmetic a
  // reader can check rather than about pixels.
  const pct = wholePercents([...named.map((e) => e.now), other[i]]);
  const unnamed = pct[pct.length - 1];
  const bits = named.slice(0, 3).map((e, k) => `species ${e.id} at ${pct[k]}%`);
  const rest = named.slice(3);
  if (rest.length) {
    const restPct = rest.reduce((s, _, k) => s + pct[3 + k], 0);
    bits.push(
      restPct > 0
        ? `${count(rest.length, "smaller lineage")} at ${restPct}%`
        : `${count(rest.length, "smaller lineage")} under 1% between them`
    );
  }
  if (unnamed > 0) bits.push(`${unnamed}% too small to name`);

  const lead = named[0];
  const start =
    lead.then > 0
      ? `held ${percent(lead.then)} when the record began`
      : `did not exist when the record began`;
  return (
    `Species over time${when}: ${count(shown.length, "lineage")} drawn as stacked bands, ` +
    `oldest at the bottom. Now ${bits.join(", ")}. ` +
    `The largest, species ${lead.id}, ${start}.`
  );
}

/**
 * The tally under the Tree of Life (v1.72).
 *
 * The caption said "45 species alive · 45 ever · 5 extinct" from v1.6, and
 * every one of those numbers is dominated by the opening deal: forty founders
 * are forty species by construction, so "ever" is mostly `populationStart`
 * wearing an evolutionary word. This splits it by `speciesOrigin` — the two
 * columns that are the null (dealt at the start, posted in later) beside the
 * one that is the plot's actual subject.
 *
 * Written here rather than in `main.js` for the reason the rest of the wording
 * is: a string built in the render loop is a string no test can read. It is a
 * caption rather than a spoken sentence, and `describeMuller` deliberately does
 * not repeat it — that function's stated scope is the part of the figure with
 * no text form anywhere else, and as of this release the origins have one.
 *
 * @param {{founding:number, arrived:number, evolved:number}} tally
 * @param {number} living species with members right now
 * @param {number} extinct species whose last member has died
 */
export function describeLineages(tally, living, extinct) {
  const ever = tally.founding + tally.arrived + tally.evolved;
  const parts = [`${tally.founding.toLocaleString()} founding`];
  // An arm that reads zero in the default pond is worth showing (it is the
  // control), but only once the pond has ever needed it — a permanent "0
  // arrived" is furniture, and the reseed is a safety valve most runs never
  // trip.
  if (tally.arrived > 0) parts.push(`${tally.arrived.toLocaleString()} arrived`);
  parts.push(`${tally.evolved.toLocaleString()} evolved`);
  return (
    `${living.toLocaleString()} species alive · ${ever.toLocaleString()} ever ` +
    `(${parts.join(", ")}) · ${extinct.toLocaleString()} extinct`
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
