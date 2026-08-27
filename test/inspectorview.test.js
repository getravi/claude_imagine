// inspectorview.test.js — the panel `node --test` could not read (v1.108).
//
// The inspector's markup lived in `main.js` from v1.0 until this release, which
// meant every string in it was outside the suite: the heading, the swatch, the
// ancestry pips, the Species link and both brain figures. `registers.js` said
// so in its own exclusion note — "`node --test` cannot reach the code that
// draws them" — and that sentence was the reason, not an excuse. Nothing in
// this file needed a DOM. All four functions build strings.
//
// So this is the reading, and the rule it follows is v1.41's, which every
// carve-out since has repeated: **render the surface and compare the text to
// the claim.** Not "is the function called" and not a second copy of the
// formula — build a real pond, take a real creature, and ask whether what the
// panel says about it is true.
//
// What that found is in the module header and it is one line: the weight strip
// drew the first 120 of a brain's 243 numbers and then said "120 weights" out
// loud. Two of the tests below are that finding — one holding the fix, one
// pinning the old behaviour as a failure so it cannot come back quietly.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { makeConfig } from "../src/config.js";
import { World } from "../src/world.js";
import { creatureFacts } from "../src/inspect.js";
import { inspectorSwatch } from "../src/palette.js";
import { givenName } from "../src/cast.js";
import { NEAT_IO } from "../src/neat.js";
import {
  ANCESTRY_SHOWN,
  BRAIN_BLOCKS,
  BRAIN_BLOCK_STARTS,
  EMPTY_HINT,
  ancestryRow,
  brainGraphSVG,
  inspectorHTML,
  inspectorKey,
  sparkFromWeights,
} from "../src/inspectorview.js";
import { BRAIN } from "../src/genome.js";
import { NeuralNet } from "../src/nn.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** A pond that has run long enough to have descent in it. */
function pond(seed = 314, ticks = 1200) {
  const config = makeConfig({ seed });
  const world = new World(config);
  for (let i = 0; i < ticks; i++) world.step();
  return { world, config };
}

/** The `aria-label` of the single figure in `html`. */
function nameOf(html) {
  const m = html.match(/aria-label="([^"]*)"/);
  assert.ok(m, "the figure has no accessible name at all");
  return m[1];
}

// ---- the strip, and the half of a brain it used to be ----

test("the weight strip draws every weight it is handed", () => {
  const { world } = pond();
  const c = world.creatures[0];
  const w = c.genome.brainWeights;
  const html = sparkFromWeights(w);
  const cells = html.match(/<span /g) || [];
  assert.equal(
    cells.length,
    w.length,
    `the strip drew ${cells.length} of ${w.length} weights — the cap is back`
  );
});

test("the strip's accessible name counts what the strip drew", () => {
  const { world } = pond();
  const c = world.creatures[0];
  const w = c.genome.brainWeights;
  const html = sparkFromWeights(w);
  const cells = (html.match(/<span /g) || []).length;
  const label = nameOf(html);
  // The sentence is a description of the figure, so its numbers have to be
  // counted over the same array the figure is: the count, the four block
  // sizes, the excitatory/inhibitory split, and the extremum.
  const m = label.match(
    /^Brain: (\d+) weights in four blocks — (.+?), (\d+) excitatory and (\d+) inhibitory, strongest ([\d.]+)\.$/
  );
  assert.ok(m, `unexpected shape for the strip's name: ${label}`);
  const [, said, blocks, excit, inhib, peak] = m;
  assert.equal(Number(said), cells, "the name says a different number of weights than the strip draws");
  assert.equal(Number(excit) + Number(inhib), cells, "the split does not account for every cell");
  // The four block sizes have to sum to the total and stand in the order
  // `nn.js` lays them out, or the visible gaps in the strip and the words
  // beside them are two claims about different layouts.
  const parts = blocks.split(", ").map((s) => s.match(/^(\d+) (.+)$/));
  assert.equal(parts.length, BRAIN_BLOCKS.length, "the label does not name four blocks");
  assert.deepEqual(
    parts.map((p) => [Number(p[1]), p[2]]),
    BRAIN_BLOCKS.map((b) => [b.size, b.name]),
    "the label's blocks are not the ones the layout has"
  );
  assert.equal(
    parts.reduce((s, p) => s + Number(p[1]), 0),
    cells,
    "the four blocks do not partition the strip"
  );
  let truePeak = 0;
  let truePos = 0;
  for (const v of w) {
    if (v > 0) truePos++;
    if (Math.abs(v) > truePeak) truePeak = Math.abs(v);
  }
  assert.equal(Number(excit), truePos, "the excitatory count is not the brain's");
  assert.equal(Number(peak), Number(truePeak.toFixed(2)), "the strongest weight is not the brain's");
});

test("the strip's block boundaries match the layout `nn.js` writes", () => {
  // v1.114 gave the strip visible seams between its four regions — sensory
  // weights, hidden biases, motor weights, motor biases — so a reader can see
  // where a brain's sensory half ends. The seams have to sit at exactly the
  // offsets `nn.js` uses to walk the flat vector, or the picture and the
  // arithmetic are two different claims about the same numbers. This is
  // v1.108's lesson applied to *layout* rather than to *count*.
  const { world } = pond();
  const w = world.creatures[0].genome.brainWeights;
  assert.equal(
    BRAIN_BLOCK_STARTS[BRAIN_BLOCK_STARTS.length - 1],
    w.length,
    "the block starts must partition the whole vector"
  );
  assert.equal(
    NeuralNet.weightCount(BRAIN.inputs, BRAIN.hidden, BRAIN.outputs),
    w.length,
    "the topology `BRAIN` names is not the topology `Genome` builds"
  );
  const html = sparkFromWeights(w);
  const cellRe = /<span( class="block-start")? /g;
  const cells = [...html.matchAll(cellRe)];
  assert.equal(cells.length, w.length);
  const flagged = cells
    .map((m, i) => (m[1] ? i : -1))
    .filter((i) => i >= 0);
  // `.block-start` marks every boundary except the first cell (which is
  // already at the strip's edge — no gap is needed there).
  assert.deepEqual(flagged, BRAIN_BLOCK_STARTS.slice(1, -1));
});

test("a vector of an off-length draws as one block, unchanged", () => {
  // The strip is called for a plastic brain's learned weights too, and one day
  // it may be called for something else. When the length does not match the
  // classic topology, the strip has no structural claim about the vector — one
  // block, one clause, no `.block-start` cells and no "four blocks" mention.
  const w = new Float32Array([0.1, -0.2, 0.3, 0.4, -0.5]);
  const html = sparkFromWeights(w, "Scratch");
  const label = nameOf(html);
  assert.match(label, /^Scratch: 5 weights, 3 excitatory and 2 inhibitory, strongest 0\.50\.$/);
  assert.doesNotMatch(label, /block/);
  assert.doesNotMatch(html, /class="block-start"/);
});

test("the cap that used to sit here is pinned as a false sentence", () => {
  // v1.108's finding, held as a test rather than as a paragraph. The old code
  // was `Math.min(w.length, 120)`, and the claim is not that 120 is too few —
  // it is that a *count* and an *extremum* do not survive truncating an
  // unordered array, so the sentence built from the prefix was wrong in two of
  // its three numbers. Measured over twelve seeds it named the wrong strongest
  // weight on 58.6% of creature-frames; here one pond is enough to show that
  // the two sentences are not the same sentence.
  const { world } = pond();
  const w = world.creatures[0].genome.brainWeights;
  assert.ok(w.length > 120, `this pond's brains are ${w.length} weights; the pin needs more than 120`);
  const whole = nameOf(sparkFromWeights(w));
  const clipped = nameOf(sparkFromWeights(w.slice(0, 120)));
  assert.notEqual(clipped, whole, "the old prefix and the whole brain say the same thing");
  assert.match(whole, new RegExp(`Brain: ${w.length} weights`));
  assert.match(clipped, /Brain: 120 weights/);
  // The default pond's first creature is one of the 21.2% where the prefix and
  // the brain disagree about the *sign of the majority* — the prefix called it
  // mostly inhibitory and it is mostly excitatory. The share is only ever a
  // point or two out; it is a point or two out across a half.
  assert.match(clipped, /54 excitatory and 66 inhibitory/);
  assert.match(whole, /125 excitatory and 118 inhibitory/);
  // And the reason the prefix is not a sample: the layout in `nn.js` is
  // [input weights | hidden biases | output weights | output biases], so the
  // first 120 of 243 are seven and a half hidden neurons and no motor at all.
  let peakOutside = 0;
  let frames = 0;
  for (const c of world.creatures) {
    const ws = c.genome.brainWeights;
    let pre = 0;
    let all = 0;
    for (let i = 0; i < ws.length; i++) {
      const a = Math.abs(ws[i]);
      if (a > all) all = a;
      if (i < 120 && a > pre) pre = a;
    }
    frames++;
    if (all > pre + 1e-9) peakOutside++;
  }
  assert.ok(
    peakOutside > 0,
    `the strongest weight was inside the first 120 for all ${frames} living creatures — ` +
      "either the brain shrank or the layout moved"
  );
});

// ---- the ancestry row ----

test("a founder has no ancestry row", () => {
  const { world } = pond();
  const c = world.creatures[0];
  assert.equal(ancestryRow(c, world.phylogeny.ancestry(c.speciesId).slice(0, 1)), "");
  assert.equal(ancestryRow(c, []), "");
});

test("the pips are the chain's last six, founder-first, in the species' own hues", () => {
  const chain = Array.from({ length: 9 }, (_, i) => ({
    id: i + 1,
    hue: i * 37,
    birthTick: i * 100,
    count: i === 3 ? 0 : 5,
  }));
  const html = ancestryRow({ speciesId: 7 }, chain);
  const ids = [...html.matchAll(/data-id="(\d+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(ids, [4, 5, 6, 7, 8, 9], "the row does not show the most recent six, in order");
  assert.equal(ids.length, ANCESTRY_SHOWN);
  for (const s of chain.slice(-ANCESTRY_SHOWN)) {
    assert.match(html, new RegExp(`data-id="${s.id}"[\\s\\S]{0,80}--anc-hue:${s.hue}`));
  }
  // An extinct ancestor is hollow, and the creature's own species is marked.
  assert.match(html, /class="anc gone" data-id="4"/);
  assert.match(html, /class="anc current" data-id="7"/);
  assert.match(html, /Ancestry — 8 branchings deep/);
});

test("the elision marker counts in the singular when it hides one ancestor", () => {
  // Two counts in one row and only one of them was guarded until v1.108: a
  // seven-deep chain read "1 older ancestors". `branchings` one line above has
  // had the guard since v1.9.
  const chain = (n) =>
    Array.from({ length: n }, (_, i) => ({ id: i + 1, hue: 0, birthTick: 0, count: 1 }));
  assert.match(ancestryRow({ speciesId: 7 }, chain(7)), /title="1 older ancestor"/);
  assert.match(ancestryRow({ speciesId: 8 }, chain(8)), /title="2 older ancestors"/);
  assert.doesNotMatch(ancestryRow({ speciesId: 7 }, chain(7)), /1 older ancestors/);
  // Nothing is hidden at exactly the shown depth, so there is no marker at all.
  assert.doesNotMatch(ancestryRow({ speciesId: 6 }, chain(6)), /older ancestor/);
  assert.match(ancestryRow({ speciesId: 2 }, chain(2)), /Ancestry — 1 branching deep/);
});

// ---- the heading, the swatch and the link ----

test("the swatch is this creature's own colour, both bands from the palette", () => {
  const { world, config } = pond();
  const c = world.creatures[0];
  const chain = world.phylogeny.ancestry(c.speciesId);
  const html = inspectorHTML(c, chain, creatureFacts(c, config));
  const sw = inspectorSwatch(c.hue);
  assert.match(html, new RegExp(`background:${sw.fill.replace(/[()]/g, "\\$&")}`));
  assert.match(html, new RegExp(`color:${sw.glow.replace(/[()]/g, "\\$&")}`));
  // v1.119: the heading is the animal's name and the number is the tooltip,
  // which is exactly what v1.116 did to the species link one row down.
  assert.match(html, new RegExp(`title="creature ${c.id}">${givenName(c.id)}<`));
  // With no name map the link says what it said before v1.116 — the number,
  // twice: once as the tooltip that is now permanent and once as the text.
  assert.match(html, new RegExp(`id="insp-species" title="species ${c.speciesId}"`));
  assert.match(html, new RegExp(`>species ${c.speciesId} — spotlight`));
});

test("every row `inspect.js` names is in the panel, with the id `main.js` patches", () => {
  const { world, config } = pond();
  const c = world.creatures[0];
  const facts = creatureFacts(c, config);
  const html = inspectorHTML(c, world.phylogeny.ancestry(c.speciesId), facts);
  for (const f of facts) {
    assert.match(html, new RegExp(`id="insp-${f.key}"`), `no cell for the ${f.key} row`);
  }
  assert.match(EMPTY_HINT, /Click a creature/);
  assert.match(html, /id="insp-intro"/);
});

test("the structure key moves when the row set does, and not when a value ticks", () => {
  const { world, config } = pond();
  const c = world.creatures[0];
  const chain = world.phylogeny.ancestry(c.speciesId);
  const facts = creatureFacts(c, config);
  const key = inspectorKey(c, chain, facts);
  assert.equal(inspectorKey(c, chain, creatureFacts(c, config)), key);
  const fewer = facts.slice(0, -1);
  assert.notEqual(inspectorKey(c, chain, fewer), key, "dropping a row leaves the key alone");
  assert.notEqual(inspectorKey({ ...c, id: c.id + 1 }, chain, facts), key);
});

// ---- the evolved-brain diagram ----

test("the diagram's two rails are `NEAT_IO`, not a copy of it", () => {
  // The counts were literals until v1.108 and they agreed with `NEAT_IO` by
  // luck. Node ids are `[0 .. inputs-1]` then `[inputs .. inputs+outputs-1]`,
  // so a copy one out of date draws an input on the motor rail, leaves the last
  // output unplaced, and drops every edge touching it — silently, because a
  // missing position is a `continue`.
  const nIn = NEAT_IO.inputs;
  const nOut = NEAT_IO.outputs;
  const genome = {
    nodes: [],
    conns: [
      { from: 0, to: nIn, w: 0.5, on: true },
      { from: nIn - 1, to: nIn + nOut - 1, w: -0.5, on: true },
      { from: 1, to: nIn + 1, w: 0.2, on: false },
    ],
    complexity: { conns: 2, nodes: 0 },
  };
  const svg = brainGraphSVG(genome);
  const circles = (svg.match(/<circle /g) || []).length;
  assert.equal(circles, nIn + nOut, "the diagram placed a different number of neurons than the brain has");
  const lines = (svg.match(/<line /g) || []).length;
  assert.equal(lines, 2, "a live connection between two placed nodes was dropped");
  const label = nameOf(svg);
  assert.match(label, new RegExp(`${nIn} senses on the left`));
  assert.match(label, new RegExp(`${nOut} motors on the right`));
  assert.match(label, /0 hidden neurons in the middle/);
});

// ---- and the guard on the carve itself ----

test("`main.js` has not grown the markup back", () => {
  const src = readFileSync(join(ROOT, "src", "main.js"), "utf8");
  assert.match(src, /from "\.\/inspectorview\.js"/, "main.js no longer imports the panel it renders");
  for (const gone of ["function inspectorHTML", "function ancestryRow", "function brainGraphSVG", "function sparkFromWeights"]) {
    assert.doesNotMatch(
      src,
      new RegExp(gone.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `${gone} is back in the module the suite cannot run`
    );
  }
});
