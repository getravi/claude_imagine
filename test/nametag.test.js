// nametag.test.js — the names on the water (v1.126).
//
// The feature is one plate over each animal this page already names in a panel,
// so the claims worth pinning are about *agreement* and about *type*:
//
//  1. **A tag is the board, on the water.** Same animals, same marks, same
//     names — because they come from `castRoles` and `ROLE_MARK` rather than
//     from a second opinion. The one you picked leads, wearing their role's
//     mark if they hold one, and never twice.
//  2. **Only the living wear a name.** A tag over a corpse is a caption for
//     something that is no longer there.
//  3. **The letters are readable, and that is a different sum.** Every other
//     mark in this project is measured with ΔE. Type is a luminance task, so
//     this is WCAG's ratio against 4.5 — and it is a *fact* rather than a hope
//     only because the plate is opaque. There is a test for the opacity, since
//     that is the property the whole measurement rests on.
//  4. **A name does not grow with the lens, and does not shrink with the
//     window.** The tags live on a layer the camera is never applied to, so a
//     name is the same size at 1× and at 4× — sixteen releases of overlay
//     geometry scale with the zoom and this one is the exception. The other half
//     is the phone: the pond is 900 canvas pixels wide and a narrow column shows
//     it at 346, which would render an 11 px name at 4.2, so the tag divides
//     that scale back out and there is a test that it does.
//  5. **Reading the pond does not move it.** The purity claim this project makes
//     of every observer: a fingerprint either side, and a count of the random
//     numbers drawn.
//  6. **A name is a button (v1.127).** The word is where the drawing put it —
//     after the lift, after the nudge away from the edge — because a hit test
//     that recomputes a layout is a second opinion about where a thing is. A
//     plate that was not drawn cannot be pressed, an emptied list leaves nothing
//     pressable behind it, and the plate and the board hand a visitor to the
//     same animal by the same function.
//  7. **A plate says what its animal is doing (v1.150).** The claims are about
//     *one list and one clock*: the words come from `doing.js`, the plate over a
//     dart and the strip under the pond read one `DoingCrowd` so they cannot say
//     two things about one animal in one frame, nobody is watched after they
//     stop wearing a plate, and a pond handed no watch paints exactly the frame
//     it painted in v1.149.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { makeConfig } from "../src/config.js";
import { World } from "../src/world.js";
import { nameSpecies } from "../src/speciesnames.js";
import { stateFingerprint, trajectoryFingerprint, observationFingerprint } from "../src/fingerprint.js";
import { castRoles, givenName } from "../src/cast.js";
import { ROLE_MARK, castRows } from "../src/whoswho.js";
import {
  MAX_TAGS,
  STACK_GAP,
  STACK_STEPS,
  TAG_SEP,
  TAG_TOUCH_PAD,
  nameTags,
  stackY,
  tagAt,
  tagDoing,
  tagFullText,
  tagSignature,
  tagText,
} from "../src/nametag.js";
import { DOINGS, DoingCrowd, doingWord } from "../src/doing.js";
import { contrastRatio, nameTag, nameTagFont, nameTagTones, WCAG_AA_TEXT } from "../src/palette.js";
import { MARKS } from "../src/key.js";
import { renderOps } from "../src/rendershot.js";

/** A pond stepped far enough to have a cast, with its family names. */
function stepped(seed, ticks, over = {}) {
  const config = makeConfig({ seed, ...over });
  const world = new World(config);
  for (let i = 0; i < ticks; i++) world.step();
  return { world, config, names: nameSpecies(world.phylogeny.species) };
}

/** A creature-shaped object with the fields `castRoles` and a tag both read. */
function beast(over = {}) {
  return {
    id: 1,
    dead: false,
    speciesId: 0,
    age: 100,
    energy: 50,
    children: 0,
    radius: 5,
    carnivory: 0.1,
    generation: 0,
    hue: 200,
    x: 100,
    y: 100,
    ...over,
  };
}
const pond = (creatures) => ({ creatures, phylogeny: { byId: new Map() } });

// ---- 1. the board, on the water ----

test("every tag is an animal the board has a reason to point at", () => {
  for (const seed of [7, 42, 314]) {
    for (const ticks of [200, 1500, 4000]) {
      const { world, config, names } = stepped(seed, ticks);
      const roles = castRoles(world, config, names);
      const tags = nameTags(world, config, names, null);
      assert.deepEqual(
        tags.map((t) => t.id),
        roles.slice(0, MAX_TAGS).map((r) => r.creature.id),
        `seed ${seed} at ${ticks}: the water names somebody the board does not`,
      );
      for (let i = 0; i < tags.length; i++) {
        assert.equal(tags[i].mark, ROLE_MARK[roles[i].rank], "a tag wears a mark the board does not");
      }
    }
  }
});

test("a tag's name is the name the board prints", () => {
  const { world, config, names } = stepped(314, 2000);
  const rows = castRows(world, config, names);
  const tags = nameTags(world, config, names, null);
  assert.ok(tags.length > 0, "no cast to compare");
  for (let i = 0; i < tags.length; i++) {
    assert.ok(
      rows[i].label.startsWith(tags[i].name),
      `the water calls them "${tags[i].name}" and the board "${rows[i].label}"`,
    );
    assert.equal(tags[i].name, givenName(tags[i].id));
  }
});

test("the one you picked leads, keeps their mark, and is never named twice", () => {
  const { world, config, names } = stepped(42, 2500);
  const roles = castRoles(world, config, names);
  assert.ok(roles.length > 0, "no cast to pick from");

  // Somebody the board already points at: they lead, and their row does not
  // come round a second time lower down.
  const star = roles[roles.length - 1].creature;
  const withStar = nameTags(world, config, names, star);
  assert.equal(withStar[0].id, star.id, "the animal you picked is not first");
  assert.equal(withStar[0].chosen, true);
  assert.equal(withStar[0].mark, ROLE_MARK[roles[roles.length - 1].rank], "the pick lost its mark");
  assert.equal(withStar.filter((t) => t.id === star.id).length, 1, "one animal, two plates");

  // Somebody the board does not: they lead with no mark, and the board's own
  // rows follow in their own order.
  const nobody = world.creatures.find((c) => !c.dead && !roles.some((r) => r.creature.id === c.id));
  const withNobody = nameTags(world, config, names, nobody);
  assert.equal(withNobody[0].id, nobody.id);
  assert.equal(withNobody[0].mark, "", "an animal with no story was given somebody else's mark");
  assert.equal(tagText(withNobody[0]), givenName(nobody.id), "a nameless mark left a space in the text");
});

test("no pond ever wears more than the cap", () => {
  for (const seed of [7, 42, 128, 256, 314, 999]) {
    for (const ticks of [50, 600, 3000]) {
      const { world, config, names } = stepped(seed, ticks);
      const tags = nameTags(world, config, names, world.creatures.find((c) => !c.dead));
      assert.ok(tags.length <= MAX_TAGS, `${tags.length} plates over seed ${seed}`);
      assert.equal(new Set(tags.map((t) => t.id)).size, tags.length, "the same animal twice");
    }
  }
});

// ---- 2. only the living ----

test("the dead wear no name", () => {
  const dead = beast({ id: 2, dead: true, children: 40 });
  const alive = beast({ id: 3, children: 9 });
  const config = makeConfig({ seed: 1, predation: false });
  const tags = nameTags(pond([dead, alive]), config, null, dead);
  assert.deepEqual(
    tags.map((t) => t.id),
    [3],
    "a corpse was given a caption",
  );
});

test("an empty pond is an empty set of plates, not an empty plate", () => {
  const config = makeConfig({ seed: 1 });
  assert.deepEqual(nameTags(pond([]), config, null, null), []);
});

// ---- 3. the letters ----

test("the ink clears the bar for reading, on the plate it is printed on", () => {
  const { ink, plate } = nameTagTones();
  const ratio = contrastRatio(ink, plate);
  assert.ok(
    ratio >= WCAG_AA_TEXT,
    `a name reads at ${ratio.toFixed(2)}:1 against its plate, under the ${WCAG_AA_TEXT} bar for text`,
  );
});

test("the plate is opaque, which is what makes that ratio a fact", () => {
  // The measurement above is a two-colour sum. It is only *about the pond* if
  // nothing of the pond shows through the plate — a translucent one would make
  // every tag's contrast a property of whatever water it happened to be over,
  // which is the failure this design exists to avoid.
  const t = nameTag();
  for (const [name, css] of [["plate", t.plate], ["ink", t.ink]]) {
    assert.doesNotMatch(css, /hsla|rgba/, `the ${name} is translucent, so its contrast is not measurable`);
  }
});

// ---- 4. a name is not part of the picture's scale ----

test("a name is the same size however far in you are looking", () => {
  const { world, config, names } = stepped(314, 1200);
  const tags = nameTags(world, config, names, null);
  assert.ok(tags.length > 0, "nothing to draw");
  const textAt = (zoom) => {
    const ops = renderOps(world, null, (r) => {
      r.nameTags = tags;
      r.camera.setZoom(zoom);
    });
    return ops.filter((o) => o[1] === "fillText");
  };
  const near = textAt(4);
  const far = textAt(1);
  assert.ok(far.length > 0, "no name reached the canvas");
  const fonts = (zoom) =>
    renderOps(world, null, (r) => {
      r.nameTags = tags;
      r.camera.setZoom(zoom);
    })
      .filter((o) => o[1] === "set:font")
      .map((o) => o[2]);
  assert.deepEqual(fonts(4), fonts(1), "the type changed size with the lens");
  assert.deepEqual(fonts(1), [nameTagFont()], "the tags are not drawn in the palette's own type");
});

test("a name grows back to readable on a canvas the page has shrunk", () => {
  // The phone case, which is the one a measurement in canvas pixels gets wrong:
  // at 390 px of viewport this page shows the 900 px pond at about 346, and an
  // unscaled name would come out at 4.2 px of type. The plate is drawn larger in
  // the canvas's own units so that it lands at the same size on the glass.
  const { world, config, names } = stepped(314, 1200);
  const tags = nameTags(world, config, names, null);
  const fontAt = (shown) =>
    renderOps(world, null, (r) => {
      r.nameTags = tags;
      if (shown) r.canvas.clientWidth = shown;
    })
      .filter((o) => o[1] === "set:font")
      .map((o) => o[2])[0];
  const wide = fontAt(null);
  const phone = fontAt(346);
  const size = (f) => Number(/(\d+(?:\.\d+)?)px/.exec(f)[1]);
  assert.equal(wide, nameTagFont(), "a canvas shown at its own size did not use the palette's type");
  assert.ok(
    size(phone) > size(wide) * 2,
    `a pond shown at 346 px drew its names at ${size(phone)}, against ${size(wide)} at full width`,
  );
  // And the enlargement is bounded: a canvas shown at a twentieth of its size
  // must not get a plate a third of the pond wide.
  assert.ok(size(fontAt(45)) <= size(wide) * 3.01, "the scale has no ceiling");
});

test("the names on the canvas are the names in the list", () => {
  const { world, config, names } = stepped(42, 2000);
  const tags = nameTags(world, config, names, null);
  const ops = renderOps(world, null, (r) => {
    r.nameTags = tags;
  });
  const drawn = ops.filter((o) => o[1] === "fillText").map((o) => o[2]);
  assert.deepEqual(drawn, tags.map(tagText), "the water says something the list does not");
  const t = nameTag();
  const fills = ops.filter((o) => o[1] === "set:fillStyle").map((o) => o[2]);
  assert.ok(fills.includes(t.plate), "no plate was laid down");
  assert.ok(fills.includes(t.ink), "the ink never reached the canvas");
});

test("a pond nobody has tagged draws exactly the picture it always drew", () => {
  // The tags are the last thing painted and the only thing this release adds,
  // so a frame with an empty list has to be the frame v1.125 drew.
  const { world } = stepped(128, 800);
  const bare = renderOps(world);
  const tagged = renderOps(world, null, (r) => {
    r.nameTags = [];
  });
  assert.deepEqual(tagged, bare);
  assert.equal(bare.filter((o) => o[1] === "fillText").length, 0, "an untagged pond drew a word");
});

test("a name over water nobody is looking at is not drawn", () => {
  const { world, config, names } = stepped(314, 1200);
  const tags = nameTags(world, config, names, null);
  const here = renderOps(world, null, (r) => {
    r.nameTags = tags;
    r.camera.setZoom(8);
    r.camera.moveTo(tags[0].x, tags[0].y);
  }).filter((o) => o[1] === "fillText");
  const away = renderOps(world, null, (r) => {
    r.nameTags = tags;
    r.camera.setZoom(8);
    // Half a world away, which on a torus is as far as anything gets.
    r.camera.moveTo(tags[0].x + world.config.width / 2, tags[0].y + world.config.height / 2);
  }).filter((o) => o[1] === "fillText");
  assert.ok(here.length >= 1, "a tag under the lens was not drawn");
  assert.ok(away.length < here.length, "a tag off the edge of the view was drawn anyway");
});

// ---- 5. reading the pond does not move it ----

test("naming the pond changes nothing about it", () => {
  const { world, config, names } = stepped(7, 900);
  const before = [stateFingerprint(world), trajectoryFingerprint(world), observationFingerprint(world)];
  const first = tagSignature(nameTags(world, config, names, world.creatures[0]));
  const after = [stateFingerprint(world), trajectoryFingerprint(world), observationFingerprint(world)];
  assert.deepEqual(after, before, "reading the names moved the pond");
  assert.equal(tagSignature(nameTags(world, config, names, world.creatures[0])), first, "two reads, two answers");
});

test("naming the pond draws no random numbers", () => {
  const { world, config, names } = stepped(42, 600);
  let draws = 0;
  const real = world.rng.next;
  world.rng.next = () => {
    draws++;
    return real();
  };
  nameTags(world, config, names, world.creatures[0]);
  world.rng.next = real;
  assert.equal(draws, 0, `naming drew ${draws} random numbers`);
});

// ---- 6. a name is a button (v1.127) ----

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

/** Draw one frame with these tags on it and hand back the renderer that drew it. */
function drawnWith(world, tags, tune = null) {
  let renderer = null;
  const ops = renderOps(world, null, (r) => {
    renderer = r;
    r.nameTags = tags;
    if (tune) tune(r);
  });
  return { renderer, ops };
}

/** The plates as the recorder saw them: the wide `fillRect` of each tag. */
function platesDrawn(ops, height = nameTag().height) {
  return ops
    .filter((o) => o[0] === "names" && o[1] === "fillRect" && o[5] === height && o[4] > height)
    .map((o) => ({ x: o[2], y: o[3], w: o[4], h: o[5] }));
}

test("a press lands on the plate the drawing actually laid down", () => {
  const { world, config, names } = stepped(314, 1500);
  const tags = nameTags(world, config, names, null);
  assert.ok(tags.length > 0, "nothing was named");
  const { renderer, ops } = drawnWith(world, tags);
  const plates = platesDrawn(ops);

  assert.equal(renderer.nameTagBoxes.length, plates.length, "the boxes and the plates are different lists");
  for (let i = 0; i < plates.length; i++) {
    const box = renderer.nameTagBoxes[i];
    assert.deepEqual({ x: box.x, y: box.y, w: box.w, h: box.h }, plates[i], "a box is not where its plate is");
    // The word's own middle, which is where a visitor aims.
    assert.equal(renderer.tagAt(box.x + box.w / 2, box.y + box.h / 2).id, box.id);
    // And the animal it hands over is the animal wearing the name.
    assert.ok(
      tags.some((t) => t.id === box.id),
      "a press found somebody the list never named",
    );
  }
});

test("open water is not a button", () => {
  const { world, config, names } = stepped(42, 1500);
  const tags = nameTags(world, config, names, null);
  const { renderer } = drawnWith(world, tags);
  const box = renderer.nameTagBoxes[0];
  assert.ok(box, "nothing was drawn to miss");
  // Far enough outside the plate that no slack could reach: a whole plate away.
  assert.equal(renderer.tagAt(box.x + box.w + box.w, box.y), null, "water to the right of a name was pressable");
  assert.equal(renderer.tagAt(box.x, box.y - box.h * 3), null, "water above a name was pressable");
});

test("a thumb gets slack the picture does not", () => {
  // The pad grows the target without growing the mark: a press just off the
  // plate is a press on it, and the plate is drawn exactly where it was.
  const { world, config, names } = stepped(42, 1500);
  const tags = nameTags(world, config, names, null);
  const { renderer } = drawnWith(world, tags);
  const box = renderer.nameTagBoxes[0];
  assert.ok(TAG_TOUCH_PAD > 0, "there is no slack at all");
  assert.equal(renderer.tagAt(box.x - TAG_TOUCH_PAD + 0.5, box.y + box.h / 2)?.id, box.id, "a near miss missed");
  assert.equal(renderer.tagAt(box.x - TAG_TOUCH_PAD - 1, box.y + box.h / 2), null, "the slack has no edge");
  // And it stays smaller than the gap between a plate and its animal, so a name
  // can never swallow a press aimed at the body under it.
  assert.ok(TAG_TOUCH_PAD < nameTag().lift, "the slack reaches down onto the animal");
});

test("the slack grows with the plate on a canvas the page has shrunk", () => {
  // Same trick as the type: four canvas pixels on a phone is a pixel and a half
  // of glass, so the pad rides the scale the plate is drawn at. Asked as a
  // press rather than as a number, because the press is the feature.
  const { world, config, names } = stepped(314, 1200);
  const tags = nameTags(world, config, names, null);
  const wide = drawnWith(world, tags).renderer;
  const phone = drawnWith(world, tags, (r) => {
    r.canvas.clientWidth = 346;
  }).renderer;
  const off = (r) => {
    const b = r.nameTagBoxes[0];
    return r.tagAt(b.x - TAG_TOUCH_PAD * 2, b.y + b.h / 2);
  };
  assert.equal(off(wide), null, "a full-width pond gave a press more slack than it was drawn");
  assert.ok(off(phone), "a shrunk pond kept the full-width slack, which is a third of a finger");
});

test("a name that was not drawn cannot be pressed", () => {
  // The off-screen case: an animal on the far side of a magnified pond gets no
  // plate, and a box left over from the frame where it did have one would be a
  // press landing on empty water.
  const { world, config, names } = stepped(314, 1200);
  const tags = nameTags(world, config, names, null);
  const near = drawnWith(world, tags, (r) => {
    r.camera.setZoom(8);
    r.camera.moveTo(tags[0].x, tags[0].y);
  }).renderer;
  assert.ok(near.nameTagBoxes.length >= 1, "a tag under the lens was not recorded");
  const away = drawnWith(world, tags, (r) => {
    r.camera.setZoom(8);
    r.camera.moveTo(tags[0].x + world.config.width / 2, tags[0].y + world.config.height / 2);
  }).renderer;
  assert.ok(away.nameTagBoxes.length < near.nameTagBoxes.length, "a tag off the edge of the view stayed pressable");
});

test("an emptied list leaves nothing pressable behind it", () => {
  const { world, config, names } = stepped(128, 900);
  const tags = nameTags(world, config, names, null);
  let renderer = null;
  renderOps(world, null, (r) => {
    renderer = r;
    r.nameTags = tags;
  });
  assert.ok(renderer.nameTagBoxes.length > 0, "nothing was recorded to clear");
  const where = renderer.nameTagBoxes[0];
  renderer.nameTags = [];
  renderer._drawNameTags();
  assert.deepEqual(renderer.nameTagBoxes, [], "the last frame's names are still pressable");
  assert.equal(renderer.tagAt(where.x + 1, where.y + 1), null, "a dead name kept its button");
});

test("a pond with no name layer has no names to press", () => {
  // The landing page's hero attaches none, and neither does anything embedding
  // this renderer without one. It must not answer a press with somebody.
  const { world, config, names } = stepped(7, 900);
  const tags = nameTags(world, config, names, null);
  let renderer = null;
  renderOps(world, null, (r) => {
    renderer = r;
  });
  renderer.attachNameLayer(null);
  renderer.nameTags = tags;
  renderer._drawNameTags();
  assert.deepEqual(renderer.nameTagBoxes, []);
  assert.equal(renderer.tagAt(10, 10), null);
});

test("the topmost plate wins, the way two overlapping labels do", () => {
  const boxes = [
    { id: 1, x: 0, y: 0, w: 40, h: 16 },
    { id: 2, x: 20, y: 0, w: 40, h: 16 },
  ];
  assert.equal(tagAt(boxes, 30, 8, 0).id, 2, "the plate underneath took the press");
  assert.equal(tagAt(boxes, 5, 8, 0).id, 1);
  assert.equal(tagAt(boxes, 70, 8, 0), null);
  assert.equal(tagAt([], 5, 5), null, "an empty pond answered a press");
  assert.equal(tagAt(null, 5, 5), null, "no list at all answered a press");
});

test("the water and the board hand a visitor to the same animal", () => {
  // Two surfaces, one list (`nameTags` draws what `castRows` prints), so one
  // function has to serve both presses — the failure this project keeps finding
  // is two places deciding the same question.
  const main = read("src/main.js");
  const fn = main.match(/function watchNamed\(id\) \{[\s\S]*?\n\}/);
  assert.ok(fn, "main.js has no shared handler for a press on a name");
  assert.ok(fn[0].includes("watchCreature("), "pressing a name does not select and follow");
  assert.ok(/They are gone/.test(fn[0]), "a name whose owner has died says nothing");
  const calls = main.match(/watchNamed\(/g) || [];
  assert.ok(calls.length >= 3, `only ${calls.length - 1} surface(s) press a name`);
  // The plate is consulted before the water, and through the renderer's own
  // record of what it drew.
  const lift = main.match(/const lift = \(e, cancelled\) => \{[\s\S]*?\n  \};/);
  assert.ok(lift, "main.js no longer has one adapter for a tap");
  assert.ok(
    lift[0].indexOf("renderer.tagAt(") < lift[0].indexOf("pickAt("),
    "a press on a word is answered by whatever is swimming behind it",
  );
  assert.ok(/style\.cursor/.test(main), "a pressable word does not look like one");
});

test("the placard says the names can be pressed", () => {
  // A control nobody is told about is a control nobody uses — and the placard is
  // the one surface on this page whose whole job is saying what a mark means.
  const row = MARKS.find((m) => m.id === "named");
  assert.ok(row, "the placard no longer has a row for a name");
  assert.match(row.line, /[Pp]ress/, "the key describes the plate and not the button");
});

// ---- 7. what the animal is doing, on the plate (v1.150) ----

test("a pond handed no watch wears the plate it wore in v1.149", () => {
  const { world, config, names } = stepped(314, 1200);
  const tags = nameTags(world, config, names, world.creatures[0]);
  assert.ok(tags.length > 0, "nothing to draw");
  for (const tag of tags) {
    assert.equal(tag.doing, null, "a verb arrived without a watch to hold it");
    assert.equal(tagDoing(tag), "", "a plate grew a tail nobody asked for");
    assert.equal(tagFullText(tag), tagText(tag));
  }
  const ops = renderOps(world, null, (r) => {
    r.nameTags = tags;
  });
  const drawn = ops.filter((o) => o[1] === "fillText").map((o) => o[2]);
  assert.deepEqual(drawn, tags.map(tagText), "the water said something the names alone do not");
  assert.ok(
    !ops.filter((o) => o[1] === "set:fillStyle").map((o) => o[2]).includes(nameTag().dim),
    "the quiet ink reached a canvas with nothing to say in it",
  );
});

test("a plate wears the verb its animal is doing, out of doing.js's own list", () => {
  const { world, config, names } = stepped(314, 1200);
  const crowd = new DoingCrowd();
  const tags = nameTags(world, config, names, world.creatures[0], crowd, 0);
  assert.ok(tags.length > 0, "nothing to draw");
  for (const tag of tags) {
    assert.ok(tag.doing in DOINGS, `a plate is holding "${tag.doing}", which is not a state`);
    assert.equal(tagDoing(tag), `${TAG_SEP}${doingWord(tag.doing)}`, "the plate wrote its own word");
    assert.equal(tagFullText(tag), `${tagText(tag)}${TAG_SEP}${doingWord(tag.doing)}`);
  }
  // Two plates on the same animal in the same frame say the same thing, and the
  // signature can tell one verb from another — a memo that could not would hold
  // the wrong picture.
  const other = new DoingCrowd();
  const same = nameTags(world, config, names, world.creatures[0], other, 0);
  assert.equal(tagSignature(same), tagSignature(tags));
  assert.notEqual(tagSignature(tags), tagSignature(tags.map((t) => ({ ...t, doing: "sick" }))));
});

test("the plate and the strip read one watch, so they cannot disagree", () => {
  // The failure this design exists to avoid, and the one it would have shipped:
  // two watches with independent holds land on different states most of the
  // time, and the page would say one thing over a dart and another under it.
  const { world, config, names } = stepped(42, 1500);
  const crowd = new DoingCrowd();
  // Re-picked every frame from the living, because the point is the agreement
  // and not the subject: a pond run for two hundred frames buries whoever was
  // first when it started, and an assertion that quietly stopped having a
  // subject would pass forever.
  const second = new DoingCrowd();
  let disagreed = 0;
  let frames = 0;
  for (let frame = 0; frame < 200; frame++) {
    const chosen = world.creatures.find((c) => !c.dead);
    if (!chosen) break;
    const tags = nameTags(world, config, names, chosen, crowd, frame * 16);
    assert.equal(tags[0].id, chosen.id, "the one you picked is not the first plate");
    // What `main.js#updateDoing` reads: the answer the plate pass already made.
    assert.equal(crowd.keyOf(chosen.id), tags[0].doing, "the strip and the plate parted company");
    // What a second watch would have said instead. It is started late rather
    // than merely offset, because a constant offset is not a second opinion: a
    // hold measures elapsed time, so two watches begun together stay together
    // however their clocks are labelled. Two watches begun at *different
    // moments* fall out of phase, which is the real case — the strip's watch
    // would have been made when the page loaded and a plate's when its animal
    // joined the cast.
    if (frame >= 37 && second.look(chosen, config, frame * 16) !== tags[0].doing) disagreed++;
    frames++;
    world.step();
  }
  assert.ok(frames > 150, `only ${frames} frames had anybody in them`);
  assert.ok(disagreed > 0, "two independent holds agreed on every frame, so this test proves nothing");
});

test("nobody is watched after they stop wearing a plate", () => {
  const { world, config, names } = stepped(7, 900);
  const crowd = new DoingCrowd();
  for (let frame = 0; frame < 60; frame++) {
    const tags = nameTags(world, config, names, world.creatures[frame % world.creatures.length], crowd, frame * 16);
    assert.equal(crowd.size, tags.length, "the crowd is holding somebody who is not on the water");
    world.step();
  }
  assert.ok(crowd.size <= MAX_TAGS, "the map grew past the number of plates that can exist");
});

test("the verb is drawn after the name, in the quieter of two inks", () => {
  const { world, config, names } = stepped(42, 2000);
  const crowd = new DoingCrowd();
  const tags = nameTags(world, config, names, null, crowd, 0);
  const ops = renderOps(world, null, (r) => {
    r.nameTags = tags;
  });
  const words = ops.filter((o) => o[1] === "fillText");
  assert.equal(words.length, tags.length * 2, "a plate did not draw both halves of itself");
  assert.deepEqual(
    words.map((o) => o[2]),
    tags.flatMap((t) => [tagText(t), tagDoing(t)]),
    "the water says something the list does not",
  );
  // The verb starts where the name ends, on the same baseline.
  for (let i = 0; i < tags.length; i++) {
    const [name, said] = [words[i * 2], words[i * 2 + 1]];
    assert.ok(said[3] > name[3], "the verb was not laid down after the name");
    assert.equal(said[4], name[4], "the two halves are not on one line");
  }
  const t = nameTag();
  const fills = ops.filter((o) => o[1] === "set:fillStyle").map((o) => o[2]);
  assert.ok(fills.includes(t.ink), "the name's ink never reached the canvas");
  assert.ok(fills.includes(t.dim), "the verb's ink never reached the canvas");
});

test("a plate carrying a verb is wider than the same plate without one", () => {
  const { world, config, names } = stepped(42, 2000);
  const crowd = new DoingCrowd();
  // The name layer only — the pond's own surface fills rectangles too.
  const plateW = (tags) =>
    renderOps(world, null, (r) => {
      r.nameTags = tags;
    })
      .filter((o) => o[0] === "names" && o[1] === "fillRect")
      .map((o) => o[4])[0];
  const bare = plateW(nameTags(world, config, names, null));
  const said = plateW(nameTags(world, config, names, null, crowd, 0));
  assert.ok(said > bare, `a verb was drawn on a plate that did not grow for it (${said} vs ${bare})`);
});

test("the verb's ink clears the bar it is printed against, and is quieter than the name", () => {
  const { ink, dim, plate } = nameTagTones();
  const ratio = contrastRatio(dim, plate);
  assert.ok(
    ratio >= WCAG_AA_TEXT,
    `a verb reads at ${ratio.toFixed(2)}:1 against its plate, under the ${WCAG_AA_TEXT} bar for text`,
  );
  assert.ok(
    contrastRatio(ink, plate) > ratio,
    "the verb is not quieter than the name, so the plate is a phrase rather than a label",
  );
  assert.doesNotMatch(nameTag().dim, /hsla|rgba/, "the verb's ink is translucent, so its contrast is not measurable");
});

test("naming the pond with verbs on it still changes nothing about it", () => {
  const { world, config, names } = stepped(7, 900);
  const crowd = new DoingCrowd();
  const before = [stateFingerprint(world), trajectoryFingerprint(world), observationFingerprint(world)];
  let draws = 0;
  const real = world.rng.next;
  world.rng.next = function counted() {
    draws++;
    return real.call(this);
  };
  nameTags(world, config, names, world.creatures[0], crowd, 0);
  world.rng.next = real;
  const after = [stateFingerprint(world), trajectoryFingerprint(world), observationFingerprint(world)];
  assert.deepEqual(after, before, "holding a verb over the water moved the pond");
  assert.equal(draws, 0, "a verb drew a random number");
});

test("two plates over one patch of water stack instead of piling up", () => {
  // The arithmetic, on boxes chosen to make every branch fire.
  const h = 16;
  const gap = STACK_GAP;
  const laid = [{ x: 100, y: 200, w: 80, h }];
  assert.equal(stackY(laid, 300, 200, 80, h, gap, 620), 200, "a plate nobody is near was moved");
  assert.equal(stackY(laid, 100, 200, 80, h, gap, 620), 200 - (h + gap), "a plate landed on another one");
  // Two in the way: the first free row above them both.
  const two = [...laid, { x: 100, y: 200 - (h + gap), w: 80, h }];
  assert.equal(stackY(two, 100, 200, 80, h, gap, 620), 200 - 2 * (h + gap));
  // No room above, so it goes below instead.
  const top = [{ x: 0, y: 0, w: 80, h }];
  assert.equal(stackY(top, 0, 0, 80, h, gap, 620), h + gap);
  // Nowhere at all clears: the plate keeps its own spot rather than being
  // flung somewhere it does not belong. An honest overlap beats a label over
  // the wrong animal.
  const walled = [];
  for (const step of STACK_STEPS) walled.push({ x: 0, y: 100 + step * (h + gap), w: 80, h });
  assert.equal(stackY(walled, 0, 100, 80, h, gap, 620), 100);
});

test("the plates a real pond draws do not land on each other", () => {
  // The cost a browser walk found and `node --test` had blessed: a plate that
  // carries a verb is two and a half times as wide, and on a phone two of them
  // came down on one patch of water on 21.0% of frames before this stacked.
  const config = makeConfig({ seed: 314 });
  const world = new World(config);
  for (let i = 0; i < 400; i++) world.step();
  const crowd = new DoingCrowd();
  let frames = 0;
  let collisions = 0;
  for (let s = 0; s < 40; s++) {
    for (let i = 0; i < 25; i++) world.step();
    const names = nameSpecies(world.phylogeny.species);
    const tags = nameTags(world, config, names, world.creatures.find((c) => !c.dead), crowd, s * 400);
    // The phone, which is where a plate is widest against its pond.
    const boxes = renderOps(world, null, (r) => {
      r.nameTags = tags;
      r.canvas.clientWidth = 346;
    })
      .filter((o) => o[0] === "names" && o[1] === "fillRect")
      .filter((_, i) => i % 2 === 0)
      .map((o) => ({ x: o[2], y: o[3], w: o[4], h: o[5] }));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]];
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) collisions++;
      }
    }
    frames++;
  }
  assert.ok(frames === 40, "the sweep lost its pond");
  assert.equal(collisions, 0, `${collisions} pairs of plates were drawn on top of each other`);
});

test("a stacked plate is pressable where it was stacked to", () => {
  // The property the whole recorded-box design exists for: moving a plate
  // moves its target with it, because there is one geometry and the renderer
  // wrote it down.
  const config = makeConfig({ seed: 314 });
  const world = new World(config);
  for (let i = 0; i < 900; i++) world.step();
  const crowd = new DoingCrowd();
  const names = nameSpecies(world.phylogeny.species);
  const tags = nameTags(world, config, names, world.creatures.find((c) => !c.dead), crowd, 0);
  // The renderer itself, kept from the tune callback, because the boxes it
  // recorded are the thing under test rather than the ops it emitted.
  let r = null;
  renderOps(world, null, (rr) => {
    r = rr;
    rr.nameTags = tags;
    rr.canvas.clientWidth = 346;
  });
  assert.ok(r.nameTagBoxes.length > 1, "one plate cannot stack");
  for (const box of r.nameTagBoxes) {
    const hit = r.tagAt(box.x + box.w / 2, box.y + box.h / 2);
    assert.ok(hit, "a plate that was drawn could not be pressed");
    assert.equal(hit.id, box.id, "a press landed on somebody else's plate");
  }
});
