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

import test from "node:test";
import assert from "node:assert/strict";

import { makeConfig } from "../src/config.js";
import { World } from "../src/world.js";
import { nameSpecies } from "../src/speciesnames.js";
import { stateFingerprint, trajectoryFingerprint, observationFingerprint } from "../src/fingerprint.js";
import { castRoles, givenName } from "../src/cast.js";
import { ROLE_MARK, castRows } from "../src/whoswho.js";
import { MAX_TAGS, nameTags, tagSignature, tagText } from "../src/nametag.js";
import { contrastRatio, nameTag, nameTagFont, nameTagTones, WCAG_AA_TEXT } from "../src/palette.js";
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
