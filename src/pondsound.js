// pondsound.js — the pond gets a pulse.
//
// Every release of this project so far has gone into a single sense.
// Everything a visitor can learn here arrives through the eye: the water, the
// name plates, the panels of prose, the figures. That is fine for somebody
// reading the page and useless for somebody who has put it on a second monitor,
// or handed it to a child, or left it open in a tab while they work — which is
// most of what people actually do with a thing that runs forever.
//
// So this file gives the pond a voice. Off by default, one press away, and it
// says three things a glance says badly:
//
//   * **a bright note** when anything was born since the last beat,
//   * **a lower, longer one** when anything died,
//   * and the **pitch of both** is how full the water is, so a pond that is
//     growing climbs and a pond that is crashing falls away underneath you.
//
// Nothing else. No music, no drone, no melody anybody composed: every note here
// is a reading.
//
// ## Why a beat, and not a note per animal
//
// The obvious build is a chime per birth and a knell per death, and it is
// unlistenable. Measured over 6,000 ticks of the default pond: **0.247 events a
// tick**, which at the speed the page opens on — one step a frame, sixty frames
// a second — is **fifteen notes a second**, with a busiest second of **fifty-six**.
// Across the thirteen curated worlds the quietest (`The Commons`) still runs at
// 0.103, or six a second. There is no envelope short enough to make that a
// sound rather than a texture, and the speed slider goes to 20×.
//
// A pond that is heard therefore has to be *sampled*, and the sampling rate is
// a tempo rather than a frame rate: `BEAT_MS`, on the browser's clock. What a
// beat carries was measured too, at 600 ms and one step a frame: a median of 3
// births and 3 deaths, a ninetieth percentile of 8 and 8, and **1.8% of beats
// with nothing in them at all**. So the ordinary sound of a living pond is two
// soft notes a second, and silence means something — it is what a pond sounds
// like when it has stopped.
//
// ## Why loudness is a rate and not a count
//
// Because the speed slider is not a fact about the pond. At 20× a 600 ms beat
// covers 600 ticks rather than 36, and a gain taken off the raw count would
// simply mean *the faster you watch, the louder it gets* — which is a reading
// of the slider, not of the water. Every gain here is computed from
// **events per tick**, so the same pond sounds the same at 1× and at 20×, and
// what changes with the slider is only how much pond fits inside a beat.
// `LOUD_RATE` is the ninetieth-percentile per-kind rate across all fourteen
// worlds (0.222 a tick), so an ordinary busy beat is near the top of the
// envelope and a boom saturates it.
//
// ## Why the ladder stops at three fifths
//
// Pitch is `population / (populationMax × PITCH_CEILING)`, and the ceiling is
// there because the raw share would waste most of the ladder. `populationMax`
// is 650 and no world measured here ever reaches it: over 9,000 ticks of each
// of the fourteen, the highest population seen was **389 — 59.8% of the cap** —
// and the median pond sits near 200. A ladder drawn to 650 would keep every
// pond in its bottom third and a crash would be a semitone. Drawn to 60% of the
// cap it puts the ordinary pond in the **middle** of its range, with room to
// climb and a long way to fall, which is the whole point of a pitch that means
// something.
//
// Determinism: PURE OBSERVER, and the strongest kind in this project. Every
// function here reads counters the pond keeps anyway (`stats.births`,
// `stats.deaths`, `creatures.length`) and returns numbers. Nothing here steps a
// world, touches a config, or draws a random number — there is no call to the
// browser's generator here, and `test/pondsound.test.js` greps for one on every
// run, which is why that name is spelled out nowhere in this file. A
// pond listened to and a pond watched in silence are bit-for-bit the same pond.

// ---- the scale ----

/**
 * The minor pentatonic, in semitones from the root.
 *
 * A scale rather than a chromatic ladder because this instrument has no
 * composer: the pond picks the notes, and it will pick them in any order and at
 * any distance. The minor pentatonic is the one five-note set where *every*
 * pair of degrees is consonant, so there is no population, no crash and no
 * baby-boom that can make this page play a sour interval. The cost is
 * resolution — five steps to the octave instead of twelve — and that cost is
 * paid gladly, because a pond whose pitch a listener cannot name is exactly as
 * useful as one whose pitch they can.
 */
export const SCALE = Object.freeze([0, 3, 5, 7, 10]);

/** The bottom of the ladder: A2, the note a dead pond would hold. */
export const ROOT_HZ = 110;

/**
 * How many steps of the scale the pond's fullness spans — two octaves, so the
 * low note runs A2 to A4 and the birth note an octave above that, A3 to A5.
 * Everything here stays inside the range a small laptop speaker reproduces
 * without effort, which is not true one octave further out in either direction.
 */
export const KEY_STEPS = 10;

/**
 * The share of `populationMax` at which the ladder tops out. See the header:
 * 59.8% is the highest any of the fourteen worlds reached in 9,000 ticks, so
 * three fifths is the ceiling that keeps the ordinary pond mid-ladder without
 * ever clipping the loudest world measured.
 */
export const PITCH_CEILING = 0.6;

/** How far above the key a birth sounds: five steps of a five-note scale — an octave. */
export const BIRTH_LIFT = 5;

/**
 * The frequency of a step up the scale, counting from `ROOT_HZ`.
 *
 * Steps past the end of the scale wrap into the next octave, which is what
 * makes `BIRTH_LIFT = SCALE.length` an exact doubling rather than an
 * approximate one — the birth note is always the same note as the death note,
 * an octave up, at every population.
 */
export function stepHz(step) {
  const n = Math.round(step);
  const octave = Math.floor(n / SCALE.length);
  const degree = ((n % SCALE.length) + SCALE.length) % SCALE.length;
  return ROOT_HZ * Math.pow(2, octave + SCALE[degree] / 12);
}

/**
 * Where on the ladder a pond of this size sits: an integer step in
 * `[0, KEY_STEPS]`.
 *
 * Rounded rather than floored, and that is the difference between a pond that
 * drifts and one that jitters: rounding puts the step boundaries halfway
 * between the populations that name them, so an animal born and an animal dying
 * in the same breath cannot flip the key back and forth.
 */
export function keyStep(population, capacity) {
  const ceiling = Math.max(1, capacity * PITCH_CEILING);
  const full = Math.min(1, Math.max(0, population / ceiling));
  return Math.round(full * KEY_STEPS);
}

// ---- the envelope ----

/**
 * The per-kind event rate, in events a tick, at which a note reaches full gain.
 * The ninetieth percentile across the default pond and the thirteen curated
 * worlds, each run 9,000 ticks and sampled in 36-tick beats: 0.222.
 */
export const LOUD_RATE = 0.222;

/** The quietest a note that sounds at all may be, and the loudest either kind gets. */
export const GAIN_FLOOR = 0.035;
export const BIRTH_GAIN = 0.2;
export const DEATH_GAIN = 0.16;

/** How long each kind takes to fall away, in seconds, and how long it takes to arrive. */
export const BIRTH_DECAY_S = 0.5;
export const DEATH_DECAY_S = 1.1;
export const ATTACK_S = 0.012;

/**
 * The gain for `count` events over `ticks` of pond, as a share of `peak`.
 *
 * Linear in the rate up to `LOUD_RATE` and flat above it. A rate of nothing is
 * silence — the caller never asks — and any rate at all is at least
 * `GAIN_FLOOR`, so a single birth in a quiet pond is a note you can hear rather
 * than one that is technically present.
 */
export function noteGain(count, ticks, peak) {
  if (count <= 0 || ticks <= 0) return 0;
  const rate = count / ticks;
  const share = Math.min(1, rate / LOUD_RATE);
  return GAIN_FLOOR + (peak - GAIN_FLOOR) * share;
}

// ---- the beat ----

/** How often the pond speaks, on the browser's clock. 600 ms is 100 beats a minute. */
export const BEAT_MS = 600;

/**
 * Everything one beat plays, as a list of notes.
 *
 * At most two: `births` and `deaths` are what the pond keeps, and a beat with
 * neither returns the empty list rather than a silent note, because silence
 * here is a reading and not a gap.
 */
export function beatNotes({ births = 0, deaths = 0, ticks = 0, population = 0, capacity = 1 }) {
  const notes = [];
  if (ticks <= 0) return notes;
  const key = keyStep(population, capacity);
  if (births > 0) {
    notes.push(
      Object.freeze({
        kind: "birth",
        hz: stepHz(key + BIRTH_LIFT),
        gain: noteGain(births, ticks, BIRTH_GAIN),
        decay: BIRTH_DECAY_S,
      }),
    );
  }
  if (deaths > 0) {
    notes.push(
      Object.freeze({
        kind: "death",
        hz: stepHz(key),
        gain: noteGain(deaths, ticks, DEATH_GAIN),
        decay: DEATH_DECAY_S,
      }),
    );
  }
  return notes;
}

/**
 * What the pond has done since the last beat.
 *
 * Negative deltas are the pond having been *replaced* — a reset, a new world, a
 * loaded archive — rather than anything that happened in it, and they are
 * clamped to nothing so the first beat of a new pond is silence rather than a
 * bang. `ticks` is clamped for the same reason.
 */
export function since(before, now) {
  return {
    births: Math.max(0, (now.births || 0) - (before.births || 0)),
    deaths: Math.max(0, (now.deaths || 0) - (before.deaths || 0)),
    ticks: Math.max(0, (now.tick || 0) - (before.tick || 0)),
    population: now.population || 0,
    capacity: now.capacity || 1,
  };
}

// ---- the words ----

/** What the button says. The icon carries the state; the word stays put, so the name a listener hears does not move. */
export const SOUND_ICON = Object.freeze({ off: "🔈", on: "🔊" });

/**
 * The one sentence that explains the instrument, shown in the banner over the
 * water the first time it is switched on and never again.
 *
 * In the banner rather than under the button because it is true for about eight
 * seconds and then obvious: a listener has heard a birth and a death by the
 * time it fades. A permanent caption would be this page explaining its own
 * controls, which is the failure `simpleview.js` exists to undo.
 */
export const SOUND_INTRO =
  "🔊 The pond has a pulse — a bright note for the newborn, a low one for the dead, " +
  "and the pitch of both is how full the water is.";

// ---- the voice ----

/**
 * The thing that actually makes a sound, and the only part of this file that
 * knows a browser exists.
 *
 * It is handed a factory rather than reaching for `AudioContext` itself, for
 * two reasons that happen to be the same reason. A browser will not let a page
 * make a noise before somebody has pressed something, so the context cannot be
 * built at load and has to be built on the press — and a factory is what lets
 * `test/pondsound.test.js` drive the whole state machine, beat scheduling and
 * all, against a recorder instead of a speaker.
 */
export class PondPulse {
  /** @param {() => any} makeContext builds a Web Audio context, on the press. */
  constructor(makeContext) {
    this.makeContext = makeContext;
    this.ctx = null;
    this.out = null;
    this.on = false;
    this.nextBeat = 0;
    this.before = null;
    /** Every note this pulse has played, for the tests and for nothing else. */
    this.played = [];
  }

  /**
   * Switch on, from this reading of the pond forward.
   *
   * The baseline is taken here rather than at construction, so the thousands of
   * births that happened before anybody pressed anything are not waiting in the
   * first beat.
   */
  start(nowMs, reading) {
    if (this.on) return true;
    if (!this.ctx) {
      this.ctx = this.makeContext();
      if (!this.ctx) return false;
      this.out = this.ctx.createGain();
      this.out.gain.value = 1;
      this.out.connect(this.ctx.destination);
    }
    if (this.ctx.resume) this.ctx.resume();
    this.on = true;
    this.before = reading;
    this.nextBeat = nowMs + BEAT_MS;
    return true;
  }

  /** Switch off. The context is kept: a second press should not cost another one. */
  stop() {
    this.on = false;
    this.before = null;
    if (this.ctx && this.ctx.suspend) this.ctx.suspend();
  }

  /**
   * One frame. Plays a beat if one is due, and otherwise does nothing at all.
   *
   * The catch-up clamp is what keeps a backgrounded tab from coming back and
   * playing every beat it missed: a browser that has not called us for a second
   * and a half gets **one** beat, covering the whole gap, and the schedule
   * restarts from now. The pond is a thing you listen to live; there is no
   * backlog worth hearing.
   */
  tick(nowMs, reading) {
    if (!this.on || !this.ctx) return [];
    if (nowMs < this.nextBeat) return [];
    const window = since(this.before, reading);
    this.before = reading;
    this.nextBeat =
      nowMs > this.nextBeat + BEAT_MS ? nowMs + BEAT_MS : this.nextBeat + BEAT_MS;
    // A context that is not running is one the browser has taken away — the
    // autoplay rule before a gesture, or a tab put to sleep. The beat still
    // happens, so the baseline and the schedule move on and nothing is owed;
    // what is skipped is the *sound*. Scheduling into a suspended context is
    // the one way this module could be unpleasant: every missed note would be
    // sitting on the clock waiting to arrive at once.
    if (this.ctx.state && this.ctx.state !== "running") return [];
    const notes = beatNotes(window);
    for (const note of notes) this.play(note);
    return notes;
  }

  /** One note: a sine, an attack, and a long way down. */
  play(note) {
    const ctx = this.ctx;
    const at = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(note.hz, at);
    // Exponential down rather than linear, because loudness is exponential:
    // a linear fade is heard as a note that hangs about and then stops.
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(note.gain, at + ATTACK_S);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + note.decay);
    osc.connect(gain);
    gain.connect(this.out);
    osc.start(at);
    osc.stop(at + note.decay + 0.05);
    this.played.push(note);
  }
}
