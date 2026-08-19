// inspectorview.js — the inspector's markup, and the half of a brain it drew.
//
// v1.97 took the stat tiles out of `main.js` and v1.98 the two bars, and both
// found the same kind of thing once a test could read them: text that had
// disagreed with the world it describes for dozens of releases, in the one
// module `node --test` cannot run. v1.98 closed by naming what was left —
// "`main.js` is down to the inspector and the chronicle feed, both `innerHTML`
// with *structure* in them, and a table of `{id, kind, read}` is not the shape
// for that and I do not yet know what is". This is the inspector, and the shape
// turned out to be the obvious one after all: these four functions never
// touched the DOM. They build strings. `main.js` was holding them only because
// that is where they were written.
//
// So the carve is mechanical and the finding is what reading them found, which
// is a `Math.min`:
//
//     const n = Math.min(w.length, 120);
//
// A creature's inherited brain is `16 → 12 → 3`, which `nn.js` lays out as
// 192 input weights, 12 hidden biases, 36 output weights and 3 output biases —
// **243 numbers**. The strip drew the first 120 of them. Not a sample and not a
// summary: the first 120 in memory, which is seven and a half hidden neurons'
// worth of input weights and **none of the biases and none of the motor half at
// all**. The figure a visitor has been told since v1.0 is "a visual fingerprint
// of the brain" has never once contained the output layer.
//
// The accessible name is the part that makes it a false statement rather than a
// partial picture. It was assembled from `n`, so on the default pond it said
// *"Brain: 120 weights, 54 excitatory and 66 inhibitory, strongest 2.48."* about
// an animal whose brain is *"243 weights, 125 excitatory and 118 inhibitory,
// strongest 2.56"* — a complete-sounding sentence about a prefix, with the count
// wrong by a factor of two and the majority sign inverted. Over twelve seeds,
// 6,000 ticks, sampled every 500 — 22,885 creature-frames — **the true strongest
// weight lies outside the drawn half on 58.6% of them**. The strip named the
// wrong weight more often than the right one.
//
// The excitatory share is the control and the more interesting half. As a
// *number* it survives the cut almost intact — median error 1.5 points, worst
// 10.6 — which is what a ratio does when an unordered array is truncated. As a
// *statement* it does not: the true split sits within a few points of a half,
// so on **21.2%** of those frames the prefix and the brain disagree about
// whether the animal is mostly excitatory or mostly inhibitory. The lesson is
// therefore not "a ratio is robust and a count is not". It is that a robust
// estimate of a quantity sitting on a threshold is not a robust answer to the
// question the reader is asking.
//
// The strip draws every weight it is handed now, and the sentence counts what
// it drew. This is v1.106's lesson one file over — `cover`, `clamp`,
// `Math.min` are instructions to discard a quantity rather than report it, and
// each is a place a mismatch nobody measures can live indefinitely — arriving
// at the absorber that had the best hiding place of them all, inside the module
// with no tests.
//
// Determinism: nothing here reads or writes the simulation and nothing draws a
// random number. It is a rendering of a creature, exactly like `inspect.js`'s
// rows and `describe.js`'s sentence, and like them it is a pure observer.

import { NEAT_IO } from "./neat.js";
import {
  brainEdge,
  brainNodeColours,
  inspectorSwatch,
  inspectorTrack,
  rgbCss,
  weightMark,
} from "./palette.js";

/** The panel before anything is selected. */
export const EMPTY_HINT =
  '<div class="hint">Click a creature to inspect its brain and lineage.</div>';

/**
 * When the panel's *structure* has to be rebuilt rather than patched.
 *
 * A different creature, an ancestry chain that gained a link or lost a lineage,
 * or a toggle that adds a row. It used to name the one toggle that did that by
 * hand; `inspect.js` owns the row set, so the key is read off the rows
 * themselves and a future row cannot be forgotten here.
 *
 * @param {object} c the selected creature
 * @param {Array<{id: number}>} chain its ancestry, founder first
 * @param {Array<{key: string}>} facts the rows `inspect.js` would show
 */
export function inspectorKey(c, chain, facts) {
  return c.id + "|" + chain.map((s) => s.id).join(",") + "|" + facts.map((f) => f.key).join(",");
}

/**
 * The whole panel for one creature.
 *
 * The rows come from `inspect.js` — their wording, their order, which of them a
 * switched-off mechanic removes, and which of them tick. This function's job is
 * the part that is markup: the heading, the swatch, the two figures, and the
 * ancestry, none of which is a fact about a field.
 */
export function inspectorHTML(c, chain, facts) {
  const rows = facts
    .map(
      (f) =>
        `<div${f.wide ? ' class="insp-wide"' : ""}><dt>${f.term}</dt>` +
        `<dd id="insp-${f.key}">${f.value}</dd></div>`
    )
    .join("\n      ");
  // The swatch carries its own `color`, exactly as the species legend's dot has
  // since v1.46, and for a reason that took until v1.79 to measure: the
  // stylesheet glows it with `currentColor`, and a span with a background and
  // no colour of its own inherits the paragraph's ink. The halo was near-white
  // for all 360 hues, it is the surface the mark is actually read against, and
  // 15.3% of lineage hues were under the bar against it. `palette.js` has the
  // numbers and the two bands.
  const sw = inspectorSwatch(c.hue);
  return `
    <div class="insp-row"><span class="swatch" style="background:${sw.fill};color:${sw.glow}"></span>
      <strong>Creature #${c.id}</strong></div>
    <dl class="insp-grid">
      ${rows}
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
export const ANCESTRY_SHOWN = 6;
export function ancestryRow(c, chain) {
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
  // Two counts in one row, and until v1.108 one of them was pluralised and the
  // other was not: a seven-deep chain hid one ancestor behind a "…" whose
  // tooltip read "1 older ancestors". The guard is four characters and it is
  // the same four already sitting on `branchings` one line up.
  return `<div class="insp-wide"><dt>Ancestry — ${branchings} branching${
    branchings === 1 ? "" : "s"
  } deep</dt>
    <dd class="ancestry">${
      elided
        ? `<span class="anc-arrow" title="${elided} older ancestor${
            elided === 1 ? "" : "s"
          }">…</span>`
        : ""
    }${pips}</dd></div>`;
}

/**
 * A weight vector as a tiny bar strip — a visual "fingerprint" of the brain.
 *
 * Positive weights are blue bars standing on the floor of their cell, negative
 * ones red bars hanging from the ceiling, and the height is the magnitude.
 * Colours and heights both come from `weightMark()`; see the note there for why
 * the magnitude stopped being an opacity in v1.49. With plasticity on, showing
 * this for both the inherited and current weights makes within-lifetime
 * learning visible as the strip shifts.
 *
 * **Every** weight, since v1.108 — see the header. The cap that used to sit
 * here drew the first 120 of 243 and then described 120 as the number there is.
 */
export function sparkFromWeights(w, name = "Brain") {
  const n = w.length;
  const track = rgbCss(inspectorTrack());
  // A figure made of unnamed spans says nothing at all to a screen reader, so
  // it gets a name — and a name that reports the picture rather than merely
  // announcing that a picture is here. The shape of a brain, in one sentence:
  // how many weights, how they split by sign, and how strong the strongest is.
  // All three are now counted over the same array the strip draws, which is
  // what makes the sentence a description of the figure rather than of a
  // prefix of it.
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

/**
 * A NEAT genome as an actual network diagram: inputs on the left, evolved
 * hidden neurons in the middle, motor outputs on the right, connections
 * coloured by weight (blue positive, red negative). Makes evolved topology
 * legible at a glance — you can watch structure differ between creatures and
 * grow over generations. Built as an inline SVG string since the inspector is
 * re-rendered from innerHTML each frame.
 *
 * The two counts come from `NEAT_IO` rather than from two literals here. They
 * agreed with it until v1.108 and the agreement was luck: node ids are laid out
 * as `[0 .. inputs-1]` then `[inputs .. inputs+outputs-1]`, so a seventeenth
 * sense would have drawn an input on the motor rail, left the last output
 * unplaced, and dropped every edge touching it — silently, since a missing
 * position is a `continue`. v1.102 added a sense to the *other* brain three
 * releases ago; this is the same comment-that-quantifies-over-the-future the
 * playbook found on `groundSway`, wearing a number.
 */
export function brainGraphSVG(genome) {
  const W = 288;
  const H = 150;
  const nIn = NEAT_IO.inputs;
  const nOut = NEAT_IO.outputs;
  const pad = 12;
  const pos = new Map();
  const place = (id, x, y) => pos.set(id, [x, y]);
  const spread = (count, i) => pad + (H - 2 * pad) * (count === 1 ? 0.5 : i / (count - 1));
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
