// markup.test.js — the page itself, audited.
//
// Forty-two test files, and every one of them looks at JavaScript. The two hand
// written HTML documents this project actually ships have never been read by
// anything but me, which is the v1.25/v1.30 lesson in its usual shape: a claim
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
  // time: twenty-two stat tiles, and thirteen more the inspector generated.
  // (Both numbers have grown since; the test above is what keeps the page's own
  // count of the first one honest.)
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
  // `role="img"` promises a name. Seven canvases and two inspector figures make
  // that promise; the figures are the ones v1.42's canvas sweep walked past,
  // because a strip of spans and an SVG are not canvases.
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
