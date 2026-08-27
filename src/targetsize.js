// targetsize.js — can a thumb hit it? The third question about this page.
//
// This project has audited its two shipped documents twice, and both audits were
// about a *sense*. v1.51 walked the app with a keyboard and asked whether every
// control can be **reached**; v1.109 walked both pages with a photometer and
// asked whether the text can be **read**. Nobody had ever asked whether a
// control can be **hit** — which is not a question about sight or focus order
// but about geometry, and which has its own published bar: WCAG 2.2 SC 2.5.8
// (Target Size (Minimum), Level AA) wants every pointer target to be at least
// 24 × 24 CSS pixels, unless spacing, inline text, or the user agent excuses it.
//
// The app is a control panel — thirty-one world rules, five sliders, a dozen
// scenario buttons, four file actions — and `gestures.js` has existed since v1.31
// precisely because a visitor arrives on a phone with no wheel and no keyboard.
// So the surface most in need of this question is the one this project built for
// the pointer it never measured.
//
// **The target is not always the control.** Every one of the thirty-one world
// toggles is a 13 × 13 native checkbox, and an instrument that measured the
// checkbox would report thirty-one failures at 13 px and be wrong about all of
// them: each sits inside a `<label class="check">`, and a click anywhere in that
// label toggles it. The target is the label. This is v1.109's composite lesson
// arriving on geometry rather than on colour — a measurement about a stack has to
// be walked all the way down before it is believed — and it is the reason
// `via: "label"` is recorded for every row that has one.
//
// **What the walk found, once the labels were credited.** The toggles are
// 316 × 19 (390 px viewport) or 290 × 19 (1280 px): enormous along the axis a
// thumb does not miss in, and five pixels short along the axis it does. They are
// stacked flush, so the spacing exemption cannot rescue them either — the nearest
// centre is 19 px away, which is the row's own height. **21 of 31 fail at
// 390 × 844 and 13 of 31 at 1280 × 900**, and the difference is the finding
// underneath the finding: the ten (and eighteen) that clear the bar do so
// because their caption is long enough to **wrap onto a second line**. Whether a
// world rule is big enough to switch was decided by how many words its name has.
// `.check { min-height: 24px }` is the whole fix, and it is one declaration
// because the failure was one declaration wide.
//
// **What this module is and is not.** It is arithmetic and an inventory, the same
// division v1.87 settled on for the stage's geometry and v1.109 reused for the
// inks: `node --test` cannot lay out a page, so the walk lives in a scratch probe
// driving a headless Chromium (v1.84's recipe) and the suite holds what the walk
// found plus the sums that judge it. The one number that is *not* a memory is the
// rule the fix rests on — `test/targetsize.test.js` resolves `min-height` live out
// of `style.css`, so deleting it is a failing build rather than a regression
// nobody meets until they are holding a phone.
//
// PURE OBSERVER. No DOM, no simulation state, no random numbers.

/**
 * WCAG 2.2 SC 2.5.8, Level AA: 24 CSS pixels on the shorter side.
 *
 * Not 44. SC 2.5.5 (Enhanced, Level AAA) asks for 44 × 44 and this page meets it
 * nowhere in the panel; 24 is the bar this project holds itself to, the same way
 * it holds 4.5 rather than 7 for contrast, and the distance to 44 is written down
 * in `docs/DEVLOG.md` rather than quietly claimed.
 */
export const TARGET_MIN = 24;

/** The shorter side of a target, which is the one the bar is about. */
export function smallestSide({ w, h }) {
  return Math.min(w, h);
}

/**
 * WCAG's spacing exemption, stated as the specification states it: an undersized
 * target passes anyway if a `TARGET_MIN`-diameter circle centred on it overlaps
 * no other target's circle. Two circles of diameter 24 overlap exactly when
 * their centres are closer than 24, so the whole rule is one comparison against
 * the nearest neighbouring centre.
 *
 * `nearestCentre` is a property of the *neighbourhood*, not of the control, which
 * is v1.104's warning in a new place: a target that passes by spacing is one
 * layout change away from failing, and nothing in its own CSS says so.
 */
export function spacedClear(nearestCentre, min = TARGET_MIN) {
  return nearestCentre >= min;
}

/**
 * Judge one measured target.
 *
 * `by` names *why* it passes, because the three reasons are not equally durable:
 * `"size"` is a property of the control, `"spacing"` of everything around it, and
 * `"inline"` of the sentence it sits in. A page whose controls all pass by size
 * is a page that stays passing.
 *
 * @param {{w:number, h:number, nearestCentre:number, inline?:boolean}} t
 */
export function verdictFor(t, min = TARGET_MIN) {
  if (smallestSide(t) >= min) return { passes: true, by: "size" };
  if (t.inline) return { passes: true, by: "inline" };
  if (spacedClear(t.nearestCentre, min)) return { passes: true, by: "spacing" };
  return { passes: false, by: null };
}

/** Every target in an inventory, judged. */
export function verdicts(controls, min = TARGET_MIN) {
  return controls.map((c) => ({ ...c, ...verdictFor(c, min) }));
}

// ---- what the walk found ----

/**
 * Every pointer target on the two shipped pages, grouped by the rule that sizes
 * it, measured in a headless Chromium at two viewports — a phone (390 × 844) and
 * the desktop the rest of this project's browser work uses (1280 × 900).
 *
 * `w`/`h` are the *effective* target: the union of the control's box and any
 * `<label>` bound to it. `own` is the control's own box, kept because the gap
 * between the two is what a naïve instrument would have reported. `nearestCentre`
 * is the distance to the closest other target's centre — the smallest in the
 * group, so a group that passes the spacing rule passes it everywhere.
 *
 * `n` is how many targets the group holds; where a group's members disagree (the
 * toggles, whose captions wrap at different widths) the row records the *worst*
 * member, and `short` says how many of them were under the bar before v1.115.
 *
 * The honest limit, said out loud the way `UNMET` says the rest: this is two
 * viewports, one pond, and the page as it loads. A control that only exists
 * while something is selected, or only in a state the walk did not put the page
 * into, is not here.
 *
 * **And one more limit, found by re-walking the page in v1.118 and worth more
 * than the row it added.** `w` and `h` are properties of a control; and
 * `nearestCentre` is a property of *everything around it*, which means it goes
 * stale for changes that never touch the control at all. Three groups have
 * moved since the v1.115 walk and none of them by anything either release did
 * to a control: `canvas#world` (155.1 → 604.9 at 390 px), `#chart-scope`
 * (774.6 → 1042.6) and `a.home-link` at 1280 px (92 → 621.8). What moved them
 * is v1.117's headline card and v1.116's lineage names, which widened the
 * legend chips these three were measured against. No verdict changes — all
 * three pass by size or by hundreds of pixels of clearance — so the numbers are
 * left as the v1.115 walk recorded them rather than half-refreshed from a walk
 * with a different number of chips in the legend. The whole table wants
 * re-recording in one stated pond state, and that is a cycle of its own.
 *
 * **v1.119's walk adds a number to that warning: the two walks disagree by
 * exactly a scrollbar.** The `#btn-meet` rows were measured in a fresh CDP probe
 * driving `headless_shell`, and at 390 px every full-width control in the panel
 * came back **301** where the v1.115 walk recorded **316** — a 15 px difference,
 * which is the classic scrollbar this build reserves and the earlier one did
 * not. At 1280 px the same probe reproduced 290 exactly. So the new rows carry
 * *their own* walk's width rather than their neighbours', and the honest reading
 * of the panel's 390 px column is 301-or-316 depending on the browser. No
 * verdict anywhere moves on it: width is the axis a thumb does not miss in, and
 * every one of these passes on its height.
 */
export const CONTROLS = Object.freeze([
  // ---- the front door (index.html, splash.css) ----
  { page: "front door", vp: "390x844", sel: "a.btn-primary", n: 2, w: 222.9, h: 58.1, own: "223x58", via: "self", nearestCentre: 58.1, inline: false, short: 0, sample: "▶ Enter the Vivarium" },
  { page: "front door", vp: "390x844", sel: "a.btn-ghost", n: 2, w: 148.1, h: 58.1, own: "148x58", via: "self", nearestCentre: 58.1, inline: false, short: 0, sample: "The story ↓" },
  { page: "front door", vp: "390x844", sel: "a.shot", n: 8, w: 350, h: 259.7, own: "350x260", via: "self", nearestCentre: 275.7, inline: false, short: 0, sample: "The pond, thriving" },
  { page: "front door", vp: "390x844", sel: "a.showcase", n: 1, w: 350, h: 313.6, own: "350x314", via: "self", nearestCentre: 3035.5, inline: false, short: 0, sample: "▶ Launch the live app" },
  { page: "front door", vp: "390x844", sel: "footer a", n: 6, w: 40.8, h: 15, own: "53x16", via: "self", nearestCentre: 36.5, inline: true, short: 6, sample: "GitHub" },
  { page: "front door", vp: "1280x900", sel: "a.btn-primary", n: 2, w: 222.9, h: 58.1, own: "223x58", via: "self", nearestCentre: 199.5, inline: false, short: 0, sample: "▶ Enter the Vivarium" },
  { page: "front door", vp: "1280x900", sel: "a.btn-ghost", n: 2, w: 148.1, h: 58.1, own: "148x58", via: "self", nearestCentre: 199.5, inline: false, short: 0, sample: "The story ↓" },
  { page: "front door", vp: "1280x900", sel: "a.shot", n: 8, w: 349.3, h: 259.7, own: "349x260", via: "self", nearestCentre: 301.3, inline: false, short: 0, sample: "The pond, thriving" },
  { page: "front door", vp: "1280x900", sel: "a.showcase", n: 1, w: 1080, h: 967.4, own: "1080x967", via: "self", nearestCentre: 2045.6, inline: false, short: 0, sample: "▶ Launch the live app" },
  { page: "front door", vp: "1280x900", sel: "footer a", n: 6, w: 40.8, h: 15, own: "53x16", via: "self", nearestCentre: 64.3, inline: true, short: 6, sample: "GitHub" },

  // ---- the app (app/index.html, style.css) ----
  { page: "app", vp: "390x844", sel: "label.check", n: 31, w: 316, h: 24, own: "13x13", via: "label", nearestCentre: 24, inline: false, short: 21, sample: "Seasons ☀︎❄︎" },
  { page: "app", vp: "390x844", sel: "label.field", n: 5, w: 316, h: 41, own: "274x33", via: "label", nearestCentre: 30, inline: false, short: 0, sample: "Speed 1×" },
  { page: "app", vp: "390x844", sel: ".scenario-chips button", n: 13, w: 95, h: 29, own: "98x29", via: "self", nearestCentre: 37, inline: false, short: 0, sample: "🌱 Genesis" },
  { page: "app", vp: "390x844", sel: "button.primary, #btn-reset", n: 2, w: 154, h: 36, own: "154x36", via: "self", nearestCentre: 47.5, inline: false, short: 0, sample: "⏸ Pause" },
  { page: "app", vp: "390x844", sel: "#btn-feed, #btn-seedlife", n: 2, w: 154, h: 35, own: "154x35", via: "self", nearestCentre: 47.5, inline: false, short: 0, sample: "✦ Feed" },
  { page: "app", vp: "390x844", sel: "#btn-meet", n: 1, w: 301, h: 35, own: "301x35", via: "self", nearestCentre: 90.4, inline: false, short: 0, sample: "👋 Meet somebody" },
  { page: "app", vp: "390x844", sel: ".btn-row button", n: 4, w: 73, h: 65, own: "73x65", via: "self", nearestCentre: 67.5, inline: false, short: 0, sample: "💾 Save" },
  { page: "app", vp: "390x844", sel: "button.chip", n: 2, w: 101.9, h: 24, own: "102x24", via: "self", nearestCentre: 111.3, inline: false, short: 0, sample: "species 0" },
  { page: "app", vp: "390x844", sel: "#chart-scope", n: 1, w: 48.6, h: 16, own: "49x16", via: "self", nearestCentre: 774.6, inline: false, short: 1, sample: "recent" },
  { page: "app", vp: "390x844", sel: "details.levers summary", n: 1, w: 316, h: 15, own: "316x15", via: "self", nearestCentre: 38, inline: false, short: 1, sample: "Live parameters" },
  { page: "app", vp: "390x844", sel: ".more-stats > summary", n: 1, w: 316, h: 24, own: "316x24", via: "self", nearestCentre: 343.1, inline: false, short: 0, sample: "More numbers ▾" },
  { page: "app", vp: "390x844", sel: "canvas#world", n: 1, w: 344, h: 237, own: "344x237", via: "self", nearestCentre: 155.1, inline: false, short: 0, sample: "the pond itself" },
  { page: "app", vp: "390x844", sel: "nav.links a", n: 3, w: 43.6, h: 17, own: "44x17", via: "self", nearestCentre: 60.4, inline: false, short: 3, sample: "Devlog" },
  { page: "app", vp: "390x844", sel: "a.home-link", n: 1, w: 191.1, h: 15, own: "191x15", via: "self", nearestCentre: 33.4, inline: false, short: 1, sample: "← Vivarium — the experiment" },
  { page: "app", vp: "390x844", sel: ".appfoot-links a", n: 5, w: 42, h: 15, own: "43x15", via: "self", nearestCentre: 7.6, inline: true, short: 4, sample: "Source" },
  { page: "app", vp: "1280x900", sel: "label.check", n: 31, w: 290, h: 24, own: "13x13", via: "label", nearestCentre: 24, inline: false, short: 15, sample: "Seasons ☀︎❄︎" },
  { page: "app", vp: "1280x900", sel: "label.field", n: 5, w: 290, h: 41, own: "248x33", via: "label", nearestCentre: 30, inline: false, short: 0, sample: "Speed 1×" },
  { page: "app", vp: "1280x900", sel: ".scenario-chips button", n: 13, w: 95, h: 29, own: "98x29", via: "self", nearestCentre: 37, inline: false, short: 0, sample: "🌱 Genesis" },
  { page: "app", vp: "1280x900", sel: "button.primary, #btn-reset", n: 2, w: 141, h: 36, own: "141x36", via: "self", nearestCentre: 47.5, inline: false, short: 0, sample: "⏸ Pause" },
  { page: "app", vp: "1280x900", sel: "#btn-feed, #btn-seedlife", n: 2, w: 141, h: 35, own: "141x35", via: "self", nearestCentre: 47.5, inline: false, short: 0, sample: "✦ Feed" },
  { page: "app", vp: "1280x900", sel: "#btn-meet", n: 1, w: 290, h: 35, own: "290x35", via: "self", nearestCentre: 88.1, inline: false, short: 0, sample: "👋 Meet somebody" },
  { page: "app", vp: "1280x900", sel: ".btn-row button", n: 4, w: 66.5, h: 65, own: "67x65", via: "self", nearestCentre: 65.6, inline: false, short: 0, sample: "💾 Save" },
  { page: "app", vp: "1280x900", sel: "button.chip", n: 2, w: 101.9, h: 24, own: "102x24", via: "self", nearestCentre: 92, inline: false, short: 0, sample: "species 0" },
  { page: "app", vp: "1280x900", sel: "#chart-scope", n: 1, w: 48.6, h: 16, own: "49x16", via: "self", nearestCentre: 796.6, inline: false, short: 1, sample: "recent" },
  { page: "app", vp: "1280x900", sel: "details.levers summary", n: 1, w: 290, h: 15, own: "290x15", via: "self", nearestCentre: 38, inline: false, short: 1, sample: "Live parameters" },
  { page: "app", vp: "1280x900", sel: ".more-stats > summary", n: 1, w: 290, h: 24, own: "290x24", via: "self", nearestCentre: 338.3, inline: false, short: 0, sample: "More numbers ▾" },
  { page: "app", vp: "1280x900", sel: "canvas#world", n: 1, w: 894, h: 615.9, own: "894x616", via: "self", nearestCentre: 345.6, inline: false, short: 0, sample: "the pond itself" },
  { page: "app", vp: "1280x900", sel: "nav.links a", n: 3, w: 43.6, h: 17, own: "44x17", via: "self", nearestCentre: 67.7, inline: false, short: 3, sample: "Devlog" },
  { page: "app", vp: "1280x900", sel: "a.home-link", n: 1, w: 191.1, h: 15, own: "191x15", via: "self", nearestCentre: 92, inline: false, short: 1, sample: "← Vivarium — the experiment" },
  { page: "app", vp: "1280x900", sel: ".appfoot-links a", n: 5, w: 42, h: 15, own: "43x15", via: "self", nearestCentre: 54.4, inline: true, short: 5, sample: "Source" },
]);

/**
 * How many distinct targets the walk found on each page, so the inventory's
 * completeness is a claim something can check rather than a habit. A group's `n`
 * sums to this per page and per viewport; a control added to either document
 * without a row here moves the walk's count and not the sum, and the test says
 * so. (Both pages hold the same controls at both viewports — what changes with
 * width is their size, which is the whole subject.)
 */
export const WALKED = Object.freeze({ "front door": 19, app: 73 });

/**
 * What the walk could not put in front of a pointer, and why. The same shape as
 * `legibility.js`'s `UNMET`: a gap named is a gap a later cycle can close, and a
 * gap unnamed is a claim of coverage nobody made on purpose.
 */
export const UNMET = Object.freeze({
  "the inspector's buttons":
    "the selected-creature panel is built from `innerHTML` when a creature is chosen, and the walk never chose one",
  "#chart-scope pressed":
    "the scope button's other state — `aria-pressed=\"true\"` — is a state the walk did not put the page into",
  "the zoom and pan gestures":
    "`gestures.js` targets are the whole canvas, which is measured here as one target rather than as the several actions it carries",
  "`.learn-*`":
    "fourteen rules of CSS no page in this repository uses — the same orphan `legibility.js` found from the ink side",
});

/**
 * The declarations the fix rests on, so the arithmetic above and the stylesheet
 * cannot part company silently. Keyed by selector, valued by the smallest
 * `min-height` that keeps its group passing **by size** rather than by spacing.
 */
export const HIT_RULES = Object.freeze({
  ".check": TARGET_MIN,
  // v1.118's disclosure, sized on arrival rather than measured short later. The
  // summary beside it (`Live parameters`) is 15 px and passes only because
  // nothing sits within 38 px of it — a pass the panel's next layout change can
  // take away — so the new one asks for the bar in its own rule instead.
  ".more-stats > summary": TARGET_MIN,
});

/**
 * The `min-height` a stylesheet declares for a selector, in pixels, or null.
 *
 * Deliberately literal: it reads the rule as written rather than resolving a
 * cascade, because the claim being tested is that *this* rule says *this*
 * number. A second rule overriding it would be found by the browser walk, which
 * is where a cascade belongs.
 */
export function declaredMinHeight(css, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[},])\\s*${esc}\\s*\\{([^}]*)\\}`, "m");
  const block = css.match(re);
  if (!block) return null;
  const m = block[2].match(/min-height\s*:\s*([\d.]+)px/);
  return m ? Number(m[1]) : null;
}
