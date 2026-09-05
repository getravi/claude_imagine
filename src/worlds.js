// worlds.js — the words that make thirteen worlds legible.
//
// The strip at the top of the app has offered curated worlds since v1.20, and a
// browser walk this cycle put a number on what a visitor actually gets from it:
//
//   390 × 844 (a phone)   — 2 of 13 chips fully on screen, 267 px of a 1,856 px
//                           row: **14.4%** of the strip, with nothing at the cut
//                           edge to say the row continues.
//   768 × 1024 (a tablet) — 4 of 13.
//   1280 × 800 (a desktop)— 13 of 13, and that is the *good* case.
//
// The good case is the finding. All thirteen names are on screen and **not one
// of them says what it is**: `Nomad's Land`, `The Commons`, `Earshot`, `The Lay
// of the Land`. Every one of those has a vivid, hand-written sentence behind it
// in `scenarios.js` — *a pathogen sweeps the pond in waves*, *plants breed from
// plants, so a herd can eat the pond bare* — and every one of those sentences
// was in a `title` attribute, which is a tooltip: **it does not exist on a
// phone at all, and on a desktop it costs a one-second hover on a control the
// visitor has already decided to ignore.** The probe confirms it — no blurb
// appears anywhere in the rendered text of the page. Thirteen invitations,
// written, shipped, and unreadable.
//
// So the *most immediately interesting thing this project owns* — thirteen
// different worlds, one press apart — was presented as thirteen bare nouns. The
// fix is not more machinery. It is words in the place a person's eye already is.
//
// Three parts, and each is a sentence rather than a feature:
//
//  1. **A hook per world.** Short — `HOOK_MAX` characters, which is what fits on
//     one line at 390 px — and written to be a *promise*, not a summary: "they
//     eat the pond bare, then wait", "walls split them into separate worlds".
//     The long blurb is not replaced; it moves to where there is room for it,
//     which is the banner you get after pressing. **The hook is the invitation
//     and the blurb is the receipt.**
//  2. **A caption under the strip that is always saying something.** Point at a
//     chip and it previews that world before you commit; point at nothing and it
//     names the world you are *in*. Fixed to one line by construction (see
//     `HOOK_MAX`), because a caption that grows when the pointer moves would
//     shove the pond down the page under a moving hand — v1.136's lost press
//     with a third cause.
//  3. **The count in the label, read off the array.** `13 worlds to try:` rather
//     than `Try a world:`. On a desktop that is a small boast; on a phone, where
//     two chips are visible, it is the only thing on the page that says there
//     are eleven more sideways. Read at runtime for `simpleview.js` rule 3's
//     reason: a hand-typed count is a lie waiting for the fourteenth world, and
//     this project has shipped that exact lie before (v1.37, sixteen releases).
//     Its longer words then paid for themselves in the layout too — see
//     `style.css`, where the label takes its own line below 960 px and hands the
//     row back the 104 px it was standing in.
//
// **Which world am I in, and who decides?** Not the press. The chip used to be
// lit by `launchScenario` and nothing ever put it out, so a visitor who launched
// The Plague and then typed a new seed sat in a world of their own with `🦠 The
// Plague` still glowing. The honest rule reads the *config*: a scenario is
// exactly `makeConfig(scn.over)`, so the world you are in is the scenario whose
// overrides reproduce it, and no scenario otherwise. `↻ Reset` keeps the lamp on
// (same config, same world); a new seed, a flipped switch or a loaded archive
// puts it out, and each of those genuinely is somewhere else. A press is a
// claim about what you did; a config is a fact about where you are.
//
// And the third case that fell out of asking it that way: a config that is
// neither a scenario nor the default is a world the visitor **built**, and the
// page can say so. Nothing here had ever noticed.
//
// PURE OBSERVER. No DOM, no simulation state, no random numbers — data in,
// words out. `main.js` owns the elements and the pointer.

import { SCENARIOS } from "./scenarios.js";
import { makeConfig } from "./config.js";

/**
 * The longest a hook may be.
 *
 * Not a taste rule — a layout one, and the number is a margin rather than a
 * ceiling. The caption sits above the pond at every width, and the narrowest
 * width this project designs for is 390 px, where its content box measures
 * 346 px. Measured in the browser: the longest hook here — *walls split them
 * into separate worlds*, thirty-seven characters — renders at **208 px**, so
 * the wrap point at that width is around sixty-one characters and every one of
 * the thirteen sits at 60% of it or less.
 *
 * Forty-two is therefore deliberate headroom, and it buys two things a tighter
 * budget would not. A reader who has scaled their text up still gets one line;
 * and a hook is a *promise*, which is a thing that gets worse as it gets longer,
 * so a cap that bites before the layout does is a cap doing a second job. What
 * it protects against is the wrap: a two-line caption moves the pond down the
 * page while a hand is crossing the chips. `test/worlds.test.js` holds it.
 */
export const HOOK_MAX = 42;

/** What the strip's label says, with the size of the collection in it. */
export function worldsLabel(count = SCENARIOS.length) {
  return `${count} worlds to try:`;
}

/**
 * The caption for a pond that is not one of the thirteen.
 *
 * Two of them, because "no scenario matches" covers two genuinely different
 * places to be standing. The page opens on `makeConfig({})` — the pond in every
 * screenshot, the one the seed field says 314 for — and that is not a fallback,
 * it is a world with a name. Anything else unmatched is a world the visitor made
 * by moving something, and being told so is the nicest thing this caption does.
 */
export const HOME_HOOK = "the pond everybody starts in";
export const CUSTOM_HOOK = "a world of your own making";

/**
 * Which curated world a config *is*, or `null`.
 *
 * A shallow walk of every key on both sides: `makeConfig` is a spread of one
 * flat object over another and every value in it is a number, a boolean or a
 * string, so `!==` is the whole comparison. Called when the world changes, never
 * per frame — thirteen configs of a hundred and ten fields is nothing once a
 * second and would still be nothing sixty times a second.
 */
export function matchScenario(config, scenarios = SCENARIOS) {
  if (!config) return null;
  for (const scn of scenarios) {
    if (sameConfig(config, makeConfig(scn.over))) return scn;
  }
  return null;
}

/** True when two configs would grow the same world, field for field. */
export function sameConfig(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (a[k] !== b[k]) return false;
  return true;
}

/**
 * What the caption says about the world a config describes.
 *
 * Returns the icon and the hook separately rather than one string: the icon is
 * `aria-hidden` in the markup, and a screen reader that reads "globe with
 * meridians the pond everybody starts in" has been handed a decoration as prose.
 */
export function worldCaption(config, scenarios = SCENARIOS) {
  const scn = matchScenario(config, scenarios);
  if (scn) return { id: scn.id, icon: scn.icon, name: scn.name, hook: scn.hook };
  const home = sameConfig(config, makeConfig({}));
  return {
    id: null,
    icon: home ? "🏡" : "🔧",
    name: null,
    hook: home ? HOME_HOOK : CUSTOM_HOOK,
  };
}

/**
 * The caption while the pointer is resting on a chip.
 *
 * Named apart from `worldCaption` because it answers a different question — *what
 * would happen if I pressed this* rather than *where am I* — and the two want
 * different words in front of them if this ever grows any.
 */
export function previewCaption(scn) {
  return { id: scn.id, icon: scn.icon, name: scn.name, hook: scn.hook };
}

/**
 * The caption carries the hook and **not** the name, which is the one wording
 * decision here I had to measure rather than argue. `The Four Rooms — walls
 * split them into separate worlds` is fifty-three characters and wraps to two
 * lines at 390 px, which is exactly the shove this caption exists to avoid; and
 * the name is never missing anyway — on a preview it is under the pointer, and
 * at rest it is on the lit chip. So the line is the promise alone.
 */
export function captionText(cap) {
  return cap.hook;
}
