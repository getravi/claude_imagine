// pondsound.test.js — the pond's pulse (v1.173)
//
// Three claims, and the first two are the ones that make this an instrument
// rather than a noise:
//
//   1. **The sound is a reading of the pond, not of the speed slider.** Every
//      gain here comes off events *per tick*, so the same world sounds the same
//      at 1× and at 20×, and only the number of beats changes.
//   2. **The beat is the browser's clock.** Whatever the frame rate, whatever
//      the tab did while it was in the background, the pond speaks once every
//      `BEAT_MS` and never plays a backlog.
//   3. **Listening changes nothing.** The module reaches for no world, no
//      config and no random number, so a pond with the sound on is bit-for-bit
//      the pond with it off.
//
// The last one is why `PondPulse` is handed a factory instead of reaching for
// `AudioContext`: the whole state machine can be driven here against a recorder
// and a clock this file owns.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  SCALE,
  ROOT_HZ,
  KEY_STEPS,
  PITCH_CEILING,
  BIRTH_LIFT,
  LOUD_RATE,
  GAIN_FLOOR,
  BIRTH_GAIN,
  DEATH_GAIN,
  BEAT_MS,
  SOUND_ICON,
  SOUND_INTRO,
  stepHz,
  keyStep,
  noteGain,
  beatNotes,
  since,
  PondPulse,
} from "../src/pondsound.js";
import { World } from "../src/world.js";
import { makeConfig, DEFAULT_CONFIG } from "../src/config.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---- a speaker that only writes things down ----

function recorder() {
  const rec = { notes: [], resumed: 0, suspended: 0, currentTime: 0 };
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime(v) {
      rec.notes[rec.notes.length - 1].peak = v;
    },
    exponentialRampToValueAtTime(_v, at) {
      rec.notes[rec.notes.length - 1].endsAt = at;
    },
  });
  rec.ctx = {
    currentTime: 0,
    destination: {},
    resume() {
      rec.resumed++;
    },
    suspend() {
      rec.suspended++;
    },
    createGain: () => ({ gain: param(), connect() {} }),
    createOscillator: () => ({
      type: "",
      frequency: {
        setValueAtTime(hz) {
          rec.notes.push({ hz });
        },
      },
      connect() {},
      start() {},
      stop() {},
    }),
  };
  return rec;
}

/** A reading of a pond, the shape `PondPulse` is fed every frame. */
const reading = (o) => ({
  births: 0,
  deaths: 0,
  tick: 0,
  population: 200,
  capacity: DEFAULT_CONFIG.populationMax,
  ...o,
});

// ---- the scale ----

test("the scale is the minor pentatonic, and five steps is exactly an octave", () => {
  assert.deepEqual([...SCALE], [0, 3, 5, 7, 10]);
  assert.equal(stepHz(0), ROOT_HZ);
  // The claim `BIRTH_LIFT` rests on: the birth note is the low note an octave
  // up, at every population, rather than nearly so.
  assert.equal(BIRTH_LIFT, SCALE.length);
  for (let s = 0; s <= KEY_STEPS; s++) {
    assert.ok(
      Math.abs(stepHz(s + SCALE.length) - stepHz(s) * 2) < 1e-9,
      `step ${s} does not double`,
    );
  }
});

test("the ladder stays inside a laptop speaker", () => {
  // Two octaves of pond and one more for the births: A2 to A5.
  assert.equal(stepHz(0), 110);
  assert.ok(Math.abs(stepHz(KEY_STEPS) - 440) < 1e-9);
  assert.ok(Math.abs(stepHz(KEY_STEPS + BIRTH_LIFT) - 880) < 1e-9);
});

test("a step below the root is still a note", () => {
  // Nothing asks for one today — `keyStep` is clamped at zero — but a negative
  // step is the one arithmetic a wrapping octave gets wrong, and it gets it
  // wrong silently.
  assert.ok(stepHz(-1) > 0 && stepHz(-1) < ROOT_HZ);
  assert.ok(Math.abs(stepHz(-SCALE.length) - ROOT_HZ / 2) < 1e-9);
});

// ---- the ladder ----

test("an empty pond is the bottom of the ladder and a full one the top", () => {
  assert.equal(keyStep(0, 650), 0);
  assert.equal(keyStep(650 * PITCH_CEILING, 650), KEY_STEPS);
  // Past the ceiling is still the top rather than a note off the end of the
  // scale — the ceiling is a measured share, not a promise the pond made.
  assert.equal(keyStep(650, 650), KEY_STEPS);
});

test("the ordinary pond sits in the middle of its range, which is what the ceiling is for", () => {
  // The measured figures the module's header rests on: over 9,000 ticks of each
  // of the fourteen worlds the median pond was near 200 of a 650 cap and the
  // highest seen anywhere was 389.
  const cap = 650;
  assert.equal(keyStep(200, cap), 5);
  assert.equal(keyStep(389, cap), 10);
  // And the reason the raw share was not good enough: drawn to the whole cap,
  // the same two ponds would be three steps apart at the bottom of the ladder.
  const raw = (p) => Math.round((p / cap) * KEY_STEPS);
  assert.equal(raw(200), 3);
  assert.equal(raw(389), 6);
});

test("a birth and a death in the same breath cannot flip the key", () => {
  // Rounding rather than flooring puts the boundaries between the populations
  // that name them, so one animal either way is never a change of note.
  const cap = DEFAULT_CONFIG.populationMax;
  for (let p = 40; p < 400; p++) {
    const step = keyStep(p, cap);
    assert.ok(
      keyStep(p + 1, cap) - step <= 1 && step - keyStep(p - 1, cap) <= 1,
      `the key jumps more than a step at ${p}`,
    );
  }
});

// ---- the envelope ----

test("nothing is silence, and anything at all is audible", () => {
  assert.equal(noteGain(0, 36, BIRTH_GAIN), 0);
  assert.equal(noteGain(4, 0, BIRTH_GAIN), 0);
  assert.ok(noteGain(1, 600, BIRTH_GAIN) >= GAIN_FLOOR);
});

test("the gain saturates at the measured busy rate and never passes it", () => {
  assert.ok(Math.abs(noteGain(LOUD_RATE * 100, 100, BIRTH_GAIN) - BIRTH_GAIN) < 1e-12);
  // A boom ten times the ninetieth percentile is as loud as the pond gets.
  assert.equal(noteGain(LOUD_RATE * 1000, 100, BIRTH_GAIN), BIRTH_GAIN);
  assert.ok(noteGain(999, 1, DEATH_GAIN) <= DEATH_GAIN);
});

test("loudness is a rate, so the speed slider is not audible", () => {
  // The same pond, sampled by a 600 ms beat at one step a frame (36 ticks) and
  // at twenty (720). Three births in the first is fifty in the second at the
  // same rate to within a rounding, and the two notes are the same note.
  const slow = beatNotes({ births: 3, deaths: 3, ticks: 36, population: 200, capacity: 650 });
  const fast = beatNotes({ births: 60, deaths: 60, ticks: 720, population: 200, capacity: 650 });
  assert.deepEqual(slow, fast);
});

// ---- the beat ----

test("a beat with nothing in it is silence rather than a quiet note", () => {
  assert.deepEqual(beatNotes({ births: 0, deaths: 0, ticks: 36, population: 200, capacity: 650 }), []);
  // A paused pond covers no ticks, so it has no rate to read and says nothing.
  assert.deepEqual(beatNotes({ births: 4, deaths: 4, ticks: 0, population: 200, capacity: 650 }), []);
});

test("a beat says only what happened: one note a kind, at most two", () => {
  const born = beatNotes({ births: 2, deaths: 0, ticks: 36, population: 200, capacity: 650 });
  assert.deepEqual(born.map((n) => n.kind), ["birth"]);
  const died = beatNotes({ births: 0, deaths: 2, ticks: 36, population: 200, capacity: 650 });
  assert.deepEqual(died.map((n) => n.kind), ["death"]);
  const both = beatNotes({ births: 2, deaths: 2, ticks: 36, population: 200, capacity: 650 });
  assert.deepEqual(both.map((n) => n.kind), ["birth", "death"]);
  assert.ok(Math.abs(both[0].hz - both[1].hz * 2) < 1e-9, "the birth is not an octave above the death");
});

test("the pond climbs as it fills and falls away as it crashes", () => {
  const at = (p) => beatNotes({ births: 1, deaths: 1, ticks: 36, population: p, capacity: 650 })[1].hz;
  const rising = [40, 120, 200, 280, 360].map(at);
  for (let i = 1; i < rising.length; i++) {
    assert.ok(rising[i] > rising[i - 1], `the pond does not climb between ${i - 1} and ${i}`);
  }
});

test("a pond that was replaced is silence, not a bang", () => {
  // Reset, a new scenario, a loaded archive: the counters go backwards, and
  // what they mean is *a different pond*, which has nothing to report yet.
  const w = since(reading({ births: 900, deaths: 880, tick: 4000 }), reading({ births: 0, deaths: 0, tick: 0 }));
  assert.deepEqual(beatNotes(w), []);
});

// ---- the pulse ----

test("nothing sounds before somebody presses something", () => {
  const rec = recorder();
  let made = 0;
  const pulse = new PondPulse(() => {
    made++;
    return rec.ctx;
  });
  for (let t = 0; t < 10000; t += 16) pulse.tick(t, reading({ births: t, tick: t }));
  assert.equal(made, 0, "a context was built without a press");
  assert.deepEqual(rec.notes, []);
});

test("the press does not play the history that came before it", () => {
  const rec = recorder();
  const pulse = new PondPulse(() => rec.ctx);
  // Four thousand ticks of pond happened while the page was silent.
  pulse.start(0, reading({ births: 1200, deaths: 1180, tick: 4000 }));
  const notes = pulse.tick(BEAT_MS, reading({ births: 1203, deaths: 1181, tick: 4036 }));
  assert.deepEqual(notes.map((n) => n.kind), ["birth", "death"]);
  // Three births over 36 ticks, not 1,203 over 4,036.
  assert.ok(notes[0].gain < BIRTH_GAIN, "the first beat is at full gain, so it heard the backlog");
});

test("the pond speaks once a beat, whatever the frame rate", () => {
  for (const frameMs of [4, 16.7, 50]) {
    const rec = recorder();
    const pulse = new PondPulse(() => rec.ctx);
    pulse.start(0, reading());
    let beats = 0;
    let tick = 0;
    for (let t = frameMs; t <= 6000; t += frameMs) {
      tick += 1;
      if (pulse.tick(t, reading({ births: tick, deaths: tick, tick })).length) beats++;
    }
    // Ten beats in six seconds, give or take the frame the last one lands on.
    assert.ok(Math.abs(beats - 10) <= 1, `${frameMs} ms frames gave ${beats} beats`);
  }
});

test("a tab that was in the background comes back with one beat, not a backlog", () => {
  const rec = recorder();
  const pulse = new PondPulse(() => rec.ctx);
  pulse.start(0, reading());
  // Thirty seconds elsewhere. Fifty beats' worth of pond happened; one is
  // worth hearing, and the schedule restarts from now rather than from then.
  const notes = pulse.tick(30000, reading({ births: 900, deaths: 880, tick: 1800 }));
  assert.equal(notes.length, 2);
  assert.deepEqual(pulse.tick(30100, reading({ births: 901, deaths: 881, tick: 1806 })), []);
  assert.equal(pulse.tick(30700, reading({ births: 902, deaths: 882, tick: 1836 })).length, 2);
});

test("switching off is silent, and switching back on costs no second context", () => {
  const rec = recorder();
  let made = 0;
  const pulse = new PondPulse(() => {
    made++;
    return rec.ctx;
  });
  pulse.start(0, reading());
  pulse.tick(BEAT_MS, reading({ births: 3, deaths: 3, tick: 36 }));
  const heard = rec.notes.length;
  pulse.stop();
  for (let t = BEAT_MS; t < 10000; t += 16) pulse.tick(t, reading({ births: t, deaths: t, tick: t }));
  assert.equal(rec.notes.length, heard, "a stopped pulse went on playing");
  assert.equal(rec.suspended, 1);
  pulse.start(10000, reading({ births: 600, deaths: 600, tick: 6000 }));
  assert.equal(made, 1, "the second press built a second audio context");
  assert.equal(rec.resumed, 2);
});

test("a context the browser has taken away is skipped, not queued", () => {
  // A tab put to sleep, or a browser that has not seen a gesture it trusts.
  // The beat still happens — the baseline and the schedule move on — but
  // nothing is scheduled, because notes queued onto a suspended clock arrive
  // all at once the moment it starts again.
  const rec = recorder();
  rec.ctx.state = "suspended";
  const pulse = new PondPulse(() => rec.ctx);
  pulse.start(0, reading());
  for (let t = BEAT_MS; t <= 6000; t += BEAT_MS) {
    pulse.tick(t, reading({ births: t, deaths: t, tick: t }));
  }
  assert.deepEqual(rec.notes, []);
  // And it picks up where it is rather than where it was: one beat's worth of
  // pond, not the ten it sat out.
  rec.ctx.state = "running";
  const notes = pulse.tick(6600, reading({ births: 6003, deaths: 6003, tick: 6036 }));
  assert.equal(notes.length, 2);
  assert.ok(notes[0].gain < BIRTH_GAIN);
});

test("every note that reaches the speaker is inside the envelope this file declares", () => {
  const rec = recorder();
  const pulse = new PondPulse(() => rec.ctx);
  pulse.start(0, reading());
  let tick = 0;
  for (let t = 16; t <= 60000; t += 16) {
    tick += 20; // the speed slider at its top
    pulse.tick(t, reading({ births: tick, deaths: tick, tick }));
  }
  assert.ok(rec.notes.length > 100, "the sweep played almost nothing");
  for (const n of rec.notes) {
    assert.ok(n.peak > 0 && n.peak <= BIRTH_GAIN, `a note peaked at ${n.peak}`);
    assert.ok(n.hz >= stepHz(0) && n.hz <= stepHz(KEY_STEPS + BIRTH_LIFT), `a note sang at ${n.hz} Hz`);
  }
});

// ---- against a real pond ----

test("the same pond sounds the same at 1× and at 20×", () => {
  // The claim the whole design rests on, run rather than reasoned: step the
  // default pond 3,600 ticks twice, once at a step a frame and once at twenty,
  // and read what the pulse played. The wall clock differs by twentyfold and
  // so does the beat count; the *sound* — which notes, how loud — does not.
  const listen = (speed) => {
    const world = new World(makeConfig({}), 314);
    const rec = recorder();
    const pulse = new PondPulse(() => rec.ctx);
    const read = () => ({
      births: world.stats.births,
      deaths: world.stats.deaths,
      tick: world.tick,
      population: world.creatures.length,
      capacity: DEFAULT_CONFIG.populationMax,
    });
    pulse.start(0, read());
    let wall = 0;
    for (let frame = 0; frame < 3600 / speed; frame++) {
      for (let i = 0; i < speed; i++) world.step();
      wall += 1000 / 60;
      pulse.tick(wall, read());
    }
    const gains = rec.notes.map((n) => n.peak);
    return {
      wall,
      beats: rec.notes.length,
      mean: gains.reduce((a, b) => a + b, 0) / Math.max(1, gains.length),
    };
  };
  const slow = listen(1);
  const fast = listen(20);
  // Sixty seconds against three: a hundred beats against five.
  assert.ok(slow.beats > 150 && slow.beats < 210, `1× played ${slow.beats} notes`);
  assert.ok(fast.beats > 5 && fast.beats < 15, `20× played ${fast.beats} notes`);
  // And the same pond, at the same loudness. The tolerance is a quarter: the
  // two runs sample the same 3,600 ticks at different resolutions, so the
  // means are of different numbers of windows over identical pond.
  assert.ok(
    Math.abs(slow.mean - fast.mean) / slow.mean < 0.25,
    `1× averaged ${slow.mean.toFixed(3)} and 20× ${fast.mean.toFixed(3)}`,
  );
});

test("a pond that has stopped is silent, and that is the reading", () => {
  // The one thing this instrument says that the page cannot: an empty pond
  // makes no sound at all, because there is nothing left to be born or to die.
  const world = new World(makeConfig({}), 314);
  const rec = recorder();
  const pulse = new PondPulse(() => rec.ctx);
  const dead = {
    births: world.stats.births,
    deaths: world.stats.deaths,
    tick: 0,
    population: 0,
    capacity: DEFAULT_CONFIG.populationMax,
  };
  pulse.start(0, dead);
  for (let t = BEAT_MS; t <= 20000; t += BEAT_MS) {
    pulse.tick(t, { ...dead, tick: t });
  }
  assert.deepEqual(rec.notes, []);
});

// ---- what listening costs the pond ----

test("nothing here can move a world", () => {
  const src = readFileSync(join(root, "src/pondsound.js"), "utf8");
  assert.ok(!/Math\.random/.test(src), "the pond's voice draws a random number");
  // A pure observer: the only thing it may import is nothing at all. An import
  // of the engine would be a module that could step a pond by accident, and a
  // sound that steps a pond is a sound that changes the pond.
  const imports = [...src.matchAll(/^import[^;]*?from\s*"([^"]+)"/gms)].map((m) => m[1]);
  assert.deepEqual(imports, []);
});

test("the words name no input device, so both hands can read them", () => {
  // `hand.js`'s rule (v1.155): a sentence that names a mouse or a key is a
  // sentence half this page's visitors cannot follow. This one describes what
  // is heard and asks for nothing.
  for (const copy of [SOUND_INTRO, ...Object.values(SOUND_ICON)]) {
    assert.ok(!/\b(click|hover|mouse|cursor|press|keyboard|tap|touch)\b/i.test(copy), copy);
  }
  assert.ok(SOUND_INTRO.length > 60 && SOUND_INTRO.length < 200);
});

test("the page holds the button the module dresses", () => {
  const page = readFileSync(join(root, "app/index.html"), "utf8");
  assert.ok(/id="btn-sound"/.test(page), "the app has no sound button");
  assert.ok(/id="sound-icon"/.test(page), "the sound button has no icon to swap");
  // The name a listener hears stays put while the state moves, which is why the
  // icon is `aria-hidden` and the state is on `aria-pressed`.
  assert.ok(/id="btn-sound"[^>]*aria-pressed="false"/s.test(page), "the button ships without a state");
});
