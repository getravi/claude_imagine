// postcard.test.js — the pond as a thing you can paste (v1.140).
//
// Eight claims. Three are about the shape of the card — how long it is, what it
// leaves out, and where the link goes — and are the ones a future release will
// break by adding a line to it, which is the point of pinning them. Three are
// about states this project has learned to check by hand: the pond too young to
// have a history, the pond with no history left, and the seed the plate
// normalises. One is directive 2. The last stands in a real run rather than at
// the end of one, for the reason `here.test.js` states and paid for: **the end
// of a run is the most biased instant there is**, and a card composed there is
// a card about a pond that has already had every chance to lose its champion.

import test from "node:test";
import assert from "node:assert/strict";

import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { nameSpecies } from "../src/speciesnames.js";
import { drawStream } from "../src/fingerprint.js";
import { pondName } from "../src/pondname.js";
import { ENDED_LINE, POSTCARD_RECORDS, postcard, postcardText } from "../src/postcard.js";

const URL = "https://getravi.github.io/claude_imagine/app/#seed=314";

/** A pond, run on. */
function pond(seed, ticks) {
  const world = new World(makeConfig({ seed }));
  for (let i = 0; i < ticks; i++) world.step();
  return world;
}

/** The card, with the lineage names the app would hand it. */
function cardFor(world) {
  return postcard(world, world.config, nameSpecies(world.phylogeny.species));
}

/**
 * A run, sampled. Every fiftieth step from the first hundred on, so the claims
 * below stand where a visitor stands — which is anywhere — rather than at the
 * one instant a test is cheapest to write.
 */
function* sampled(seed, ticks = 4000, every = 50) {
  const world = new World(makeConfig({ seed }));
  for (let i = 0; i < ticks; i++) {
    world.step();
    if (i >= 100 && i % every === 0) yield world;
  }
}

test("a card is a hook and not a report", () => {
  // The cap that keeps this postable. Two records at most out of the three the
  // board keeps, and the whole card short enough to read in a chat window
  // without scrolling: where it stands, what it has been through, two bests,
  // and what is happening now.
  for (const world of sampled(314)) {
    const lines = cardFor(world).lines;
    assert.ok(lines.length <= 3 + POSTCARD_RECORDS, `${lines.length} lines`);
    const records = lines.filter((l) => /^[👶🌊🌿] /u.test(l));
    assert.ok(records.length <= POSTCARD_RECORDS, `${records.length} record lines`);
  }
});

test("a pond too young to have a history does not list what it has not done", () => {
  // Rule 3. The card of a brand-new pond is two lines — where it stands and
  // what is happening — because nothing has been born, nothing has died and no
  // record has been set. A card that padded itself with zeroes would be
  // describing a pond that had done nothing by enumerating it.
  const lines = cardFor(pond(314, 0)).lines;
  assert.equal(lines.length, 2);
  assert.ok(/^0 steps in, 40 creatures are alive here/.test(lines[0]), lines[0]);
  assert.ok(/still the 40 this pond began with\.$/.test(lines[0]), lines[0]);
  assert.ok(!lines.some((l) => /\b0 (have been born|of them eaten)/.test(l)), lines.join(" | "));
});

test("the standing line says the animals are not the ones that were put there", () => {
  // The clause the whole line is worth its space for. A population count is a
  // reading off a dial; the generation count is the only sentence on the card
  // that says this pond has *turned over*.
  const first = cardFor(pond(314, 1200)).lines[0];
  assert.match(first, /1,200 steps in/);
  assert.match(first, /\d+ generations on from the 40 this pond began with\.$/);
});

test("an empty pond is not told to press Reset", () => {
  // Rule 2, and the reason this module does not simply post the headline. The
  // sentence over the water for a pond with nothing in it is *Everything here
  // has died. Press ↻ Reset to start the pond over* — advice for somebody
  // holding the keyboard, which is exactly who is not reading a postcard.
  const world = pond(314, 600);
  for (const c of world.creatures) c.dead = true;
  world.creatures.length = 0;
  const card = cardFor(world);
  assert.equal(card.lines[card.lines.length - 1], ENDED_LINE);
  assert.ok(!card.lines.some((l) => /Press /.test(l)), card.lines.join(" | "));
  assert.match(card.lines[0], /and the water is empty\.$/);
});

test("the link goes last and alone", () => {
  // Half the places this gets pasted will linkify a bare URL and the other half
  // will not, and a reader who wanted the address rather than the story should
  // be able to take one line off the bottom without picking it out of a
  // sentence. Nothing above it carries a URL.
  const text = postcardText(cardFor(pond(314, 1200)), URL);
  const lines = text.split("\n");
  assert.equal(lines[lines.length - 1], `Watch it grow: ${URL}`);
  assert.equal(lines[lines.length - 2], "");
  assert.ok(!lines.slice(0, -1).some((l) => l.includes("http")), text);
  // And a card with nowhere to point still says everything else.
  assert.ok(!postcardText(cardFor(pond(314, 1200)), "").includes("Watch it grow"));
});

test("the card names the pond the plate names, on the seed the plate shows", () => {
  // v1.134's rule: `RNG` narrows its seed on the first line of its constructor,
  // so seed −1 and seed 4,294,967,295 are one world and every surface that
  // prints the number has to agree with the one that uses it. The card is the
  // first of those a stranger sees, and it is the only one they can check
  // against nothing.
  for (const seed of [314, 0, 1, -1, 4294967295]) {
    const world = pond(seed, 200);
    const card = cardFor(world);
    const { name, seed: normalised } = pondName(seed);
    assert.equal(card.title, `📮 ${name}`);
    assert.equal(card.sub, `A pond in Vivarium, grown from seed ${normalised}.`);
  }
});

test("every line is a sentence, and none of it is markup", () => {
  // The card is built out of text nodes on the page and pasted as plain text
  // everywhere else, so a line that carried a tag would be a bug in exactly one
  // of the two and invisible in the other. A lineage name is a string the
  // simulation composed; a full stop is what makes a line a sentence rather
  // than a field.
  for (const world of sampled(80808)) {
    for (const line of cardFor(world).lines) {
      assert.ok(line.length > 0, "an empty line");
      assert.ok(!/[<>]/.test(line), line);
      assert.match(line, /[.!]$/);
    }
  }
});

test("composing a card draws no random numbers", () => {
  // Directive 2, in its cheapest form. Nothing here may reach into the world's
  // generator, or `🔗 Share` would be a control that moves the pond — and a
  // seed that reproduced a different world depending on whether anybody had
  // told a friend about it is the worst version of that bug there is.
  const world = pond(314, 800);
  const draws = drawStream(world.rng);
  for (let i = 0; i < 20; i++) postcardText(cardFor(world), URL);
  assert.equal(draws.count, 0);
});
