// reveal.js — the landing page's scroll-in, and the reason the page below the
// hero is not blank.
//
// The front door hides every band it is about to animate: `[data-reveal]` is
// `opacity: 0` in `splash.css` and `splash.js` adds `.in` as each one scrolls
// into view. That is the ordinary way to write a scroll reveal and it has a
// failure mode nobody had looked for, because every audit this project has run
// — v1.28's phone, v1.51's keyboard, v1.82's ruler, v1.87's stage — was aimed
// at `app/index.html`, and this is the other page.
//
// Measured in a headless Chromium at 1,400 px: block one file, `src/world.js`,
// and the landing page keeps **53 of 53** bands hidden however far you scroll —
// 6,246 of its 6,769 characters of text, 92.3%. `splash.js` builds a live
// `World` for the hero before it wires the reveal, so a throw anywhere in the
// engine takes the module down with it, and the module is the only thing that
// can undo the stylesheet. The premise, the science, the screenshots, the
// timeline and both calls to action are still in the DOM, at opacity zero,
// under 8,355 px of empty background.
//
// So the rule this module exists to enforce: **hiding something is only safe
// while the thing that unhides it is known to be alive.** Three parties, and
// each covers a failure the others cannot see.
//
//  1. The page arms it. An inline script in `<head>` puts `js` on the root
//     element, and the stylesheet hides `[data-reveal]` only under that class.
//     Scripting off — a text browser, a locked-down corporate profile, a
//     crawler — never arms it, and the page is simply a page. It has to be
//     inline and synchronous: a module script is deferred, so gating on one
//     would hide the bands *after* they had already been painted.
//  2. The page distrusts itself. That same script starts a watchdog which
//     disarms the class after a few seconds. If `splash.js` never arrives — a
//     404, an offline reload, a syntax error in anything it imports — nothing
//     here ever runs, and the watchdog is what turns a permanently blank page
//     into a page that simply did not animate.
//  3. This module takes over. `setupReveal` wires the observer and *then*
//     cancels the watchdog, in that order, so a throw on the way leaves the
//     watchdog running. Its caller runs it before touching the simulation.
//
// Carved out of `splash.js` for the reason `describe.js` and `gestures.js` were
// carved out of `main.js`: those two files touch the DOM and the suite cannot
// reach them, so the logic worth testing has to live somewhere it can. This
// module takes its document and window as arguments and holds no state.

/** The class the page puts on `<html>` to say a script is running. */
export const ARMED_CLASS = "js";

/** Where the page parks its watchdog timer, for this module to cancel. */
export const FAILSAFE_KEY = "revealFailsafe";

/** How much of an element must be showing before it is revealed. */
const THRESHOLD = 0.12;

/**
 * Wire the scroll reveal, and take responsibility for the hidden state.
 *
 * Reveals each `[data-reveal]` element the first time it comes into view, and
 * all of them at once if the browser has no `IntersectionObserver` — an old
 * browser should get the page, not the effect. Cancelling the watchdog is the
 * last thing it does: until then the page's own timer is the guarantee.
 *
 * @param {Document} doc
 * @param {Window} win
 * @returns {number} how many elements are being watched
 */
export function setupReveal(doc, win) {
  const elements = Array.from(doc.querySelectorAll("[data-reveal]"));

  if (elements.length && typeof win.IntersectionObserver === "function") {
    const observer = new win.IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("in");
          observer.unobserve(entry.target);
        }
      },
      { threshold: THRESHOLD }
    );
    for (const el of elements) observer.observe(el);
  } else {
    for (const el of elements) el.classList.add("in");
  }

  // Everything above succeeded, so the hidden state has an owner again.
  if (win[FAILSAFE_KEY] !== undefined) {
    win.clearTimeout(win[FAILSAFE_KEY]);
    win[FAILSAFE_KEY] = undefined;
  }
  return elements.length;
}
