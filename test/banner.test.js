// banner.test.js — the strip over the water, and who has to wait for whom.
//
// Four groups of claims.
//
// **The pond waits and a press does not.** The whole release is those two
// sentences, and they are the two the defect was made of: until v1.181 every
// voice on this page could erase every other one between two frames, and 32.8%
// of an unattended five-minute visit's banners were erased that way.
//
// **Nothing is ever shown late.** `news.js` refuses a queue because a queue
// turns a moment into a delayed feed, and this module agrees with it: one seat,
// the newer moment takes it, and a line that has waited longer than the longest
// banner is dropped unread rather than shown to somebody looking at a pond it
// is no longer about.
//
// **The strip never flickers.** A repost of the line already up is the same
// line standing for longer, and a `take` that has nothing to say says so — on a
// five-minute visit it says so about eighteen thousand times.
//
// **The offer rides with its line.** The bug this design had to avoid is the
// one the old code could not: a celebration that waits its turn must carry its
// own "👀 Show me" with it, or the button lands on whatever banner is still up
// and sends a visitor to the wrong animal.
//
// And one claim about `main.js`, which cannot be executed here: the strip has
// exactly one mechanism that shows it (v1.178's note — a redundant mechanism is
// two sources of truth, and the one you branch on is the one that goes stale).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { Banner, WAIT_MS } from "../src/banner.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAIN = readFileSync(join(ROOT, "src/main.js"), "utf8");

const pond = (text, ms = 5200) => ({ text, ms, press: false });
const press = (text, ms = 1800) => ({ text, ms, press: true });

/** Post and take in one breath, the way `flash` does. */
function say(b, msg, now) {
  b.post(msg, now);
  return b.take(now);
}

test("an empty strip takes the first thing it is handed, at once", () => {
  const b = new Banner();
  const act = say(b, pond("a family has grown"), 0);
  assert.ok(act && act.show, "nothing was showing, so there was nothing to wait for");
  assert.equal(act.show.text, "a family has grown");
  assert.equal(b.take(1), null, "and the frame after says nothing at all");
});

test("the pond waits for the whole of the line in front of it", () => {
  const b = new Banner();
  say(b, pond("a family has grown", 5200), 0);
  // A death, a tenth of a second later. This is the exact collision the sweep
  // found 143 of over forty visits, either way round.
  assert.equal(
    say(b, pond("Robin is dead", 4200), 100),
    null,
    "the death did not erase the celebration"
  );
  for (const t of [1000, 3000, 5199]) assert.equal(b.take(t), null, `still being read at ${t} ms`);
  const act = b.take(5200);
  assert.ok(act && act.show, "and it goes up the instant the strip is free");
  assert.equal(act.show.text, "Robin is dead");
  assert.equal(b.dropped, 0, "nothing was lost — it was only late by the length of one banner");
  // And it gets the whole of its own time, rather than what is left of somebody
  // else's.
  assert.equal(b.take(5200 + 4199), null);
  assert.deepEqual(b.take(5200 + 4200), { hide: true });
});

test("a press goes up now", () => {
  const b = new Banner();
  say(b, pond("a family has grown"), 0);
  const act = say(b, press("World saved to your browser."), 100);
  assert.ok(act && act.show, "the visitor caused this one, so they are not made to wait for it");
  assert.equal(act.show.text, "World saved to your browser.");
});

test("one seat in the waiting room, and the newer moment takes it", () => {
  const b = new Banner();
  say(b, pond("a family has grown"), 0);
  say(b, pond("Robin is dead"), 100);
  say(b, pond("Wren is dead"), 200);
  assert.equal(b.dropped, 1, "two waiting lines is a feed, so the older one goes");
  const act = b.take(5200);
  assert.equal(act.show.text, "Wren is dead", "and the one still true of the water is the one said");
});

test("a line that has waited longer than the longest banner is dropped unread", () => {
  const b = new Banner();
  say(b, pond("a family has grown"), 0);
  say(b, pond("Robin is dead"), 10);
  // Presses keep taking the strip, the way a visitor pressing things would.
  for (let t = 100; t <= WAIT_MS; t += 500) say(b, press(`receipt at ${t}`), t);
  const act = b.take(WAIT_MS + 2000);
  assert.ok(!act || !act.show || act.show.text !== "Robin is dead", "never shown late");
  assert.ok(b.dropped >= 1);
});

test("the same line reposted stands for longer rather than going up twice", () => {
  const b = new Banner();
  say(b, press("Whole-run data exported.", 1800), 0);
  assert.equal(say(b, press("Whole-run data exported.", 1800), 900), null, "no second banner");
  assert.equal(b.take(1799), null, "and the clock started again from the repost");
  assert.equal(b.take(2699), null);
  assert.deepEqual(b.take(2700), { hide: true });
});

test("the strip is taken down exactly once", () => {
  const b = new Banner();
  say(b, press("World saved to your browser.", 1800), 0);
  assert.equal(b.take(1799), null);
  assert.deepEqual(b.take(1800), { hide: true });
  for (const t of [1801, 2000, 99999]) assert.equal(b.take(t), null, `nothing to do at ${t} ms`);
});

test("a new pond takes its unread line with it, and leaves the one being read", () => {
  const b = new Banner();
  say(b, pond("a family has grown"), 0);
  say(b, pond("Robin is dead"), 100);
  b.forget();
  assert.equal(b.dropped, 1);
  assert.equal(b.showing.text, "a family has grown", "words are not taken from under a reader");
  assert.deepEqual(b.take(5200), { hide: true }, "and nothing from the old pond follows it");
});

test("the offer rides with its own line", () => {
  const b = new Banner();
  const offer = { label: "Watch Robin", onPress: () => {} };
  say(b, pond("a family has grown"), 0);
  say(b, { ...pond("Robin has raised five young"), offer }, 100);
  const act = b.take(5200);
  assert.equal(act.show.offer, offer, "the button belongs to the sentence, not to the strip");
});

test("no banner is ever cut short except by a press", () => {
  // The invariant the release is for, run over a scripted stream that mixes all
  // three of this page's voices far faster than the sweep measured — a death or
  // a celebration every second or so, with a visitor pressing things through it.
  const b = new Banner();
  const script = [];
  for (let i = 0; i < 200; i++) {
    const t = i * 700;
    if (i % 3 === 0) script.push([t, pond(`celebration ${i}`, 5200)]);
    if (i % 5 === 0) script.push([t + 90, pond(`death ${i}`, 4200)]);
    if (i % 11 === 0) script.push([t + 120, press(`receipt ${i}`, 1800)]);
  }
  let up = null;
  let cutByPond = 0;
  for (let t = 0; t <= 200 * 700 + 6000; t += 16) {
    for (const [at, msg] of script) if (at >= t - 15 && at < t + 1) b.post(msg, t);
    const act = b.take(t);
    if (!act) continue;
    if (up && t < up.until && !(act.show && act.show.press)) cutByPond++;
    up = act.show || null;
  }
  assert.equal(cutByPond, 0, "the pond never took a line off the strip before its time");
});

test("the strip has one mechanism that shows it", () => {
  // v1.178's scar: two ways to hide an element is two sources of truth. There
  // is one `classList.add("show")` on the toast in `main.js` and it is inside
  // the pump, so no caller can put words on the strip behind the policy's back.
  const shows = MAIN.match(/classList\.add\("show"\)/g) || [];
  assert.equal(shows.length, 1, "only `pumpBanner` shows the strip");
  assert.ok(!/flashTimer/.test(MAIN), "and the `setTimeout` it replaced is gone");
  // And every line the strip shows reaches the live region from the same place.
  assert.equal((MAIN.match(/if \(say\) announce\(say\)/g) || []).length, 1);
});
