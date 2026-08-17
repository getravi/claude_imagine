// markup.test.js — the page itself, audited.
//
// Every test file in this project looks at JavaScript — forty-two of them when
// this one was written, in v1.51, and a good many more since. The two hand
// written HTML documents this project actually ships had, before this file, never
// been read by anything but me, which is the v1.25/v1.30 lesson in its usual
// shape: a claim
// holds on the surfaces that were swept and nobody swept this one. v1.51 walked
// the app with a keyboard and found what an unswept surface always has on it —
// thirty-five `<label>` elements labelling nothing, and a control that was a
// `div`.
//
// **This is a text scan, not an HTML parser.** It cannot resolve the DOM, so it
// asks only questions that survive being asked of the source: does this `id`
// exist, does this `label` have something to label, is there a `tabindex` above
// zero. Every rule here is one a browser walk confirmed first — the scan is what
// keeps the answer true, not what found it. Anything needing layout, focus order
// or the accessibility tree stays in the browser, where it was measured.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ARMED_CLASS, FAILSAFE_KEY } from "../src/reveal.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

/** The documents a visitor loads. */
const PAGES = ["index.html", "app/index.html"];
/** Every stylesheet, for the rules that are about CSS rather than markup. */
const SHEETS = ["style.css", "splash.css"];

/** All `attr="value"` pairs for one attribute name, across a source file. */
function attrValues(src, attr) {
  const out = [];
  const re = new RegExp(`\\b${attr}\\s*=\\s*"([^"]*)"`, "g");
  for (const m of src.matchAll(re)) out.push(m[1]);
  return out;
}

test("no id is used twice in a page", () => {
  for (const page of PAGES) {
    const ids = attrValues(read(page), "id");
    const seen = new Set();
    for (const id of ids) {
      assert.ok(!seen.has(id), `${page}: duplicate id "${id}" — getElementById returns the first`);
      seen.add(id);
    }
  }
});

test("every id an attribute points at exists on the same page", () => {
  // `for`, `aria-labelledby` and `aria-describedby` are all promises that a
  // particular element is somewhere on the page. A broken one is silent: the
  // control simply has no name, and looks exactly like a control that has one.
  for (const page of PAGES) {
    const src = read(page);
    const ids = new Set(attrValues(src, "id"));
    for (const attr of ["for", "aria-labelledby", "aria-describedby"]) {
      for (const value of attrValues(src, attr)) {
        for (const id of value.split(/\s+/).filter(Boolean)) {
          assert.ok(ids.has(id), `${page}: ${attr}="${id}" points at no element`);
        }
      }
    }
  }
});

test("every label labels something", () => {
  // The v1.51 finding, pinned. A `<label>` with no `for` and no control inside
  // it is not a label at all — it is text that happens to sit above a number,
  // and the pairing exists only in the layout. There were thirty-five at the
  // time: twenty-two of them stat tiles, and thirteen more the inspector
  // generated. (Both numbers have grown since; the test above is what keeps the
  // page's own count of the first one honest — and the count in this sentence
  // is deliberately not next to its noun, which is `test/prosecounts.test.js`'s
  // rule for a number that means *then*.)
  const CONTROL = /<(input|select|textarea|button|meter|progress|output)\b/i;
  for (const file of [...PAGES, "src/main.js"]) {
    const src = read(file);
    const re = /<label\b([^>]*)>([\s\S]*?)<\/label>/gi;
    for (const m of src.matchAll(re)) {
      const hasFor = /\bfor\s*=/.test(m[1]);
      const wraps = CONTROL.test(m[2]);
      assert.ok(
        hasFor || wraps,
        `${file}: <label>${m[2].trim().slice(0, 40)}</label> has no "for" and wraps no control`
      );
    }
  }
});

test("the page's own count of its stat tiles is the number of stat tiles", () => {
  // v1.52 found the README claiming a number of scenarios that had been wrong
  // for sixteen releases, and wrote down the general form: anything stated as a
  // number in prose about a collection in code is drifting. The comment over
  // this list said "twenty-two name/value pairs" while the list held
  // twenty-five, which is the same bug on the surface the rule was written on —
  // and it is the count v1.51's `<label>` finding is quoted with, so the wrong
  // number has been travelling into other files. Read the word, count the
  // tiles, compare. It cannot drift again without failing here.
  const WORDS = {
    twenty: 20, "twenty-one": 21, "twenty-two": 22, "twenty-three": 23,
    "twenty-four": 24, "twenty-five": 25, "twenty-six": 26, "twenty-seven": 27,
    "twenty-eight": 28, "twenty-nine": 29, thirty: 30, "thirty-one": 31,
    "thirty-two": 32,
  };
  const src = read("app/index.html");
  const claim = src.match(/<!--\s*([A-Za-z-]+) name\/value pairs\./);
  assert.ok(claim, "the stats list has lost the comment that counts it");
  const said = WORDS[claim[1].toLowerCase()];
  assert.ok(said, `"${claim[1]}" is not a number this test knows how to read`);
  const actual = (src.match(/<div class="stat">/g) || []).length;
  assert.equal(said, actual, `the comment says ${claim[1]} stat tiles; there are ${actual}`);
});

test("nothing jumps the queue with a positive tabindex", () => {
  // A positive tabindex takes an element out of document order and puts it in
  // front of everything that has none, which reorders the whole page rather
  // than the one element. The walk found 61 stops in document order; this is
  // what keeps them in it.
  for (const file of [...PAGES, "src/main.js"]) {
    for (const value of attrValues(read(file), "tabindex")) {
      assert.ok(Number(value) <= 0, `${file}: tabindex="${value}" reorders the page`);
    }
  }
});

test("every graphic that claims to be a picture says what it is a picture of", () => {
  // `role="img"` promises a name. Eight canvases and two inspector figures make
  // that promise; the figures are the ones v1.42's canvas sweep walked past,
  // because a strip of spans and an SVG are not canvases. The eighth is the
  // body-size plot (v1.104), which arrived with its name written because this
  // assertion is a sweep rather than a list — the property v1.42 spent three
  // releases learning to want.
  for (const file of [...PAGES, "src/main.js"]) {
    const src = read(file);
    for (const tag of ['role="img"']) {
      let from = 0;
      for (;;) {
        const at = src.indexOf(tag, from);
        if (at < 0) break;
        from = at + tag.length;
        // The whole opening tag around this attribute.
        const open = src.lastIndexOf("<", at);
        const close = src.indexOf(">", at);
        const attrs = src.slice(open, close);
        const named =
          /aria-label\s*=\s*["'`][^"'`]*\S/.test(attrs) ||
          /aria-label\s*=\s*["'`]?\$\{/.test(attrs) ||
          /aria-labelledby\s*=/.test(attrs);
        assert.ok(named, `${file}: role="img" with no accessible name near "${attrs.slice(0, 60)}"`);
      }
    }
  }
});

test("every button and link on a page has something to announce", () => {
  // A control whose only content is markup — an icon, a span, nothing — is
  // announced by its tag name alone. `#btn-randomseed` was one emoji until
  // v1.51 and now says what it does.
  for (const page of PAGES) {
    const src = read(page);
    for (const tag of ["button", "a"]) {
      const re = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`, "gi");
      for (const m of src.matchAll(re)) {
        if (/aria-label\s*=\s*"[^"]*\S/.test(m[1])) continue;
        const text = m[2].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
        assert.ok(text.length > 0, `${page}: <${tag}${m[1]}> has no accessible name`);
      }
    }
  }
});

test("no stylesheet takes the focus ring away", () => {
  // Measured rather than assumed: the app sets no focus styles of its own, and
  // photographing four focused controls in Chromium showed the UA's ring doing
  // the job — an opaque white band with a dark one behind it, which is v1.34's
  // rule for a mark whose background it does not control, arrived at by someone
  // else. Nothing to add, then; the way this breaks is a future tidy-up writing
  // `outline: none` to make a control look neater, so that is what is pinned.
  for (const sheet of SHEETS) {
    const src = read(sheet);
    const offending = [...src.matchAll(/outline\s*:\s*(none|0)\b/gi)];
    assert.equal(
      offending.length,
      0,
      `${sheet}: removes the focus ring (${offending.map((m) => m[0]).join(", ")})`
    );
  }
});

test("the species legend is built from buttons", () => {
  // The Tree of Life's own prose says "click one to spotlight it in the pond
  // above". It was a `div` with a click handler until v1.51, so that sentence
  // was true of a mouse and of nothing else. The chip carries `aria-pressed`
  // too: the highlight is a toggle, and the `active` class said so only in a
  // colour.
  const src = read("src/main.js");
  const build = src.slice(src.indexOf("function buildLegend"));
  const body = build.slice(0, build.indexOf("\n}"));
  assert.match(body, /createElement\("button"\)/, "legend chips must be real buttons");
  assert.match(body, /aria-pressed/, "a toggle must say whether it is pressed");
});

test("every element the app looks up by id exists somewhere", () => {
  // `main.js` is the last module with no test of any kind, and its commonest
  // possible failure is not a bug in logic: it is `$("phylo-tick")` against a
  // page that spells it `phylo-ticks`, which throws on the frame that reads it
  // and takes the whole render loop with it. The scan cannot resolve a DOM, but
  // it does not need to — an id is either written into the shipped page or
  // written by `main.js` itself, and any third case is a typo.
  const src = read("src/main.js");
  const page = read("app/index.html");
  // Ids the script builds into markup of its own (the inspector's rows, mostly),
  // which are as real as the ones in the document.
  const built = new Set(attrValues(src, "id"));
  for (const m of src.matchAll(/id="([a-z0-9-]+)-\$\{/g)) built.add(m[1]); // templated: chip-n-${id}
  const inPage = new Set(attrValues(page, "id"));

  const missing = [];
  for (const m of src.matchAll(/\$\("([a-zA-Z0-9_-]+)"\)/g)) {
    const id = m[1];
    if (!inPage.has(id) && !built.has(id)) missing.push(id);
  }
  assert.deepEqual([...new Set(missing)], [], "looked up but never written");
});

test("the two canvases a visitor can click can also be focused", () => {
  // v1.51 walked the app with a keyboard and finished with a sentence: the pond
  // and the minimap take clicks and cannot be focused, so selecting a creature
  // and moving the view had no keyboard route at all. v1.60 gave them one. The
  // tell that it has been undone is the attribute, not the behaviour — a
  // `tabindex` deleted while tidying the markup leaves a canvas that looks
  // exactly the same and is unreachable again.
  const page = read("app/index.html");
  for (const id of ["world", "minimap"]) {
    const tag = page.slice(page.indexOf(`id="${id}"`));
    const el = tag.slice(0, tag.indexOf(">"));
    assert.match(el, /tabindex="0"/, `#${id} is clickable and cannot be focused`);
  }
  // And the keys it answers to are written down where a screen reader will read
  // them out: an affordance the prose does not promise is one nobody finds.
  assert.match(page, /id="pond-keys"/);
  const keys = page.slice(page.indexOf('id="pond-keys"'));
  const text = keys.slice(0, keys.indexOf("</p>"));
  for (const word of ["Arrow", "Enter", "Escape"]) {
    assert.ok(text.includes(word), `the pond's key hint never mentions ${word}`);
  }
});

// ---- The front door's hidden state (v1.88) ----
//
// The landing page hides 53 bands — 6,246 of its 6,769 characters of text — and
// hands the job of showing them again to a module that builds a live simulation
// first. Blocking `src/world.js` in Chromium left all 53 hidden however far you
// scrolled. The remedy has three parties and two of them are in files no
// JavaScript test can import, so this is where they are held: the page arms the
// rule with a class, a watchdog disarms it if the script never arrives, and
// `src/reveal.js` cancels the watchdog once it has taken over. The names are
// exported by the module so a rename cannot half-happen.

/** Every `selector { … }` rule in a stylesheet, comments and @media stripped. */
function cssRules(sheet) {
  const src = read(sheet).replace(/\/\*[\s\S]*?\*\//g, "");
  return [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1].trim().replace(/\s+/g, " "),
    body: m[2],
  }));
}

test("nothing on the front door is hidden except under the class a script arms", () => {
  // The general form, so it holds for a rule nobody has written yet: any rule
  // that decides a `[data-reveal]` element's opacity is part of this contract
  // and has to carry the class. It is also what keeps the *specificity* honest
  // — hiding under `html.js` while revealing under a bare `[data-reveal].in`
  // would make the hidden rule the heavier of the two and nothing would ever
  // appear, which is a silent, total failure of the page.
  const gate = `html.${ARMED_CLASS}`;
  const opacity = cssRules("splash.css").filter(
    (r) => r.selector.includes("[data-reveal]") && /(^|\s|;)opacity\s*:/.test(r.body)
  );
  assert.ok(opacity.length >= 2, "the reveal has lost its hidden or its revealed state");
  for (const rule of opacity) {
    assert.ok(
      rule.selector.startsWith(gate),
      `splash.css: "${rule.selector}" sets a reveal's opacity outside "${gate}"`
    );
  }
});

test("the front door arms the reveal itself, before anything is painted", () => {
  const src = read("index.html");
  const head = src.slice(0, src.indexOf("</head>"));
  const scripts = [...head.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  const inline = scripts.filter((m) => !/\bsrc\s*=/.test(m[1]));
  assert.equal(inline.length, 1, "the page arms the reveal in exactly one inline script");
  const [attrs, body] = [inline[0][1], inline[0][2]];
  // Deferred is the one thing it must not be: a module script runs after the
  // document is parsed, so a page gated on one would flash its whole contents
  // and then hide them.
  assert.doesNotMatch(attrs, /\b(type\s*=\s*"module"|defer|async)\b/, "the arming script must be synchronous");
  assert.match(body, new RegExp(`classList\\.add\\("${ARMED_CLASS}"\\)`), "it must add the class the sheet hides under");
  assert.match(body, new RegExp(`classList\\.remove\\("${ARMED_CLASS}"\\)`), "and take it back off when the watchdog fires");
  assert.match(body, new RegExp(`window\\.${FAILSAFE_KEY}\\s*=\\s*setTimeout`), "the watchdog goes where the module looks for it");
});

test("the watchdog the page starts is the one the module cancels", () => {
  // A promise between two files, like `for` and `aria-labelledby` above: the
  // page parks a timer id on the window under a name, and `src/reveal.js`
  // clears whatever it finds there. Renaming one alone is silent — the page
  // simply un-hides itself four seconds in, on every load, for everyone.
  assert.match(read("src/reveal.js"), new RegExp(`clearTimeout\\(win\\[FAILSAFE_KEY\\]\\)`));
  assert.ok(read("index.html").includes(`window.${FAILSAFE_KEY}`));
});

test("the page's script does not build a world before it shows the page", () => {
  // The order is the finding. `splash.js` used to import the engine statically,
  // which is resolved before its first statement runs, so one unreachable
  // simulation file took the prose down with it. The reveal is wired first now
  // and the engine arrives through a dynamic import inside a `try`.
  const src = read("splash.js");
  const statics = [...src.matchAll(/^import\s[\s\S]*?from\s+"([^"]+)";/gm)].map((m) => m[1]);
  assert.deepEqual(statics, ["./src/reveal.js"], "the front door statically imports the engine again");
  assert.ok(
    src.indexOf("setupReveal(document, window)") < src.indexOf("startHero(canvas)"),
    "the hero is started before the page is revealed"
  );
  assert.match(src, /startHero\(canvas\)\.catch\(/, "a hero that throws must not reach the top level");
});

// ---- The stage's marks (v1.87) ----
//
// Five things are drawn over the pond by the DOM rather than by `render.js`,
// and all five say "in the corner of the picture" by anchoring to `.stage`.
// That is a claim about a *containing block*, and it was false: the canvas
// carries `width="900"` and `max-width: 100%`, so it stops filling the column
// the moment the column is wider than 900 px, and everything anchored to the
// right or the middle of the stage is placed against 936 px of box instead.
// Measured in Chromium at a 1,400-pixel window, before the fix: the zoom badge
// sat 22 px past the right edge of the water, the flash 17 px right of its
// centre, the season badge and the minimap flush *by luck* (a canvas is a
// block, so the slack is all on the right), and the ruler correct only because
// v1.82 had caught this on that one mark and placed it from `main.js` by hand.
// `.stage { width: fit-content }` makes the containing block the canvas in both
// regimes; all five then measure 12 px from the corner they name, and the
// hand-placement came back out of `main.js`.
//
// The scan cannot lay a page out, so these are the two halves of the claim it
// *can* hold: the inventory (a sixth mark cannot arrive unclassified) and the
// arithmetic (the column really is wider than the pond, which is the condition
// the fix exists for).

/** Everything with an `id` inside `<section class="stage">`, and what it is. */
const STAGE = {
  world: { kind: "the picture itself" },
  "pond-keys": { kind: "prose for a screen reader" },
  "pond-say": { kind: "prose for a screen reader" },
  // The marks, with the edge each one names and the gap it asks for. The
  // numbers are the measured ones: 12 px from the corner, the flash centred.
  "season-badge": { kind: "mark", rule: ".season-badge", edges: { top: "12px", left: "12px" } },
  "zoom-badge": { kind: "mark", rule: ".zoom-badge", edges: { top: "12px", right: "12px" } },
  minimap: { kind: "mark", rule: ".minimap", edges: { left: "12px", bottom: "12px" } },
  "scale-bar": { kind: "mark", rule: ".scale-bar", edges: { right: "12px", bottom: "12px" } },
  flash: { kind: "mark", rule: ".flash", edges: { left: "50%", bottom: "18px" } },
  // Inside the ruler, laid out by it rather than by the stage.
  "scale-bar-rule": { kind: "part of the ruler" },
  "scale-bar-label": { kind: "part of the ruler" },
};

/** The markup of the pond's stage, from the shipped page. */
function stageMarkup() {
  const src = read("app/index.html");
  const open = src.indexOf('<section class="stage">');
  assert.ok(open >= 0, "the page has lost its stage");
  return src.slice(open, src.indexOf("</section>", open));
}

/** The declarations of one CSS rule, found by its selector on a line of its own.
 *  Comments come out first: this file's rules are heavily commented, and a
 *  comment explaining a declaration reads exactly like the declaration. */
function cssRule(sheet, selector) {
  const src = read(sheet).replace(/\/\*[\s\S]*?\*\//g, "");
  const re = new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "m");
  const m = src.match(re);
  assert.ok(m, `${sheet}: no rule for "${selector}"`);
  return m[1];
}

/** One property's value out of a rule's declarations. */
function cssValue(body, prop) {
  for (const line of body.split(";")) {
    const m = line.match(new RegExp(`^\\s*${prop}\\s*:\\s*(.+)$`));
    if (m) return m[1].trim();
  }
  return null;
}

test("every element inside the stage is one this file has classified", () => {
  // Both directions, the v1.81 pattern: a mark added over the pond fails here
  // until somebody says which edge it hangs on, and a classification for
  // something that has been deleted fails too.
  const inStage = attrValues(stageMarkup(), "id");
  assert.deepEqual(
    [...inStage].sort(),
    Object.keys(STAGE).sort(),
    "the stage's contents and this file's list of them disagree"
  );
});

test("every mark over the pond is anchored to the pond's own edges", () => {
  for (const [id, entry] of Object.entries(STAGE)) {
    if (entry.kind !== "mark") continue;
    const body = cssRule("style.css", entry.rule);
    assert.equal(
      cssValue(body, "position"),
      "absolute",
      `#${id} is placed over the pond and is not positioned`
    );
    for (const [edge, gap] of Object.entries(entry.edges)) {
      assert.equal(cssValue(body, edge), gap, `#${id}: ${edge} moved from ${gap}`);
      // A percentage is not a gap, it is a claim about the *centre*, and half a
      // mark's own width has to come back off it. The flash is the only one, and
      // the half that would leave no trace if it were dropped is the transform:
      // the mark would still be on screen, still near the middle, and wrong by
      // half of whatever it happens to say.
      if (gap.endsWith("%")) {
        assert.match(
          cssValue(body, "transform") || "",
          /translateX\(-50%\)/,
          `#${id} is placed by a percentage and never takes its own width back off`
        );
      }
    }
  }
});

test("the stage is the pond and not the column", () => {
  // The arithmetic, derived rather than quoted, so it stays true if the layout
  // moves: the widest `.left-col` the grid can produce, against the width the
  // canvas is drawn at. It comes to 936 against 900 today.
  const layout = cssRule("style.css", ".layout");
  const num = (v) => {
    const m = String(v).match(/(-?[\d.]+)px/);
    assert.ok(m, `expected a pixel length, got "${v}"`);
    return Number(m[1]);
  };
  const padding = cssValue(layout, "padding").split(/\s+/); // `20px 22px`
  const tracks = cssValue(layout, "grid-template-columns").split(/\s+/); // `minmax(0, 1fr) 320px`
  const column =
    num(cssValue(layout, "max-width")) -
    2 * num(padding[padding.length - 1]) -
    num(cssValue(layout, "gap")) -
    num(tracks[tracks.length - 1]);
  const page = read("app/index.html");
  const canvas = page.slice(page.indexOf('id="world"'));
  const drawn = Number(canvas.match(/width="(\d+)"/)[1]);

  // Pin the failure as well as the fix (v1.25): the slack is the whole bug, and
  // a layout change that removed it would make the declaration below merely
  // harmless rather than load-bearing — worth being told about either way.
  assert.ok(
    column > drawn,
    `the column (${column}px) no longer exceeds the pond (${drawn}px); the stage's width is now belt-and-braces`
  );
  assert.equal(
    cssValue(cssRule("style.css", ".stage"), "width"),
    "fit-content",
    `the stage would stretch to ${column}px around a ${drawn}px pond, and every mark anchored to its right edge or its centre would be placed against the ${column - drawn}px of slack`
  );
});
