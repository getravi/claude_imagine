// postcard.js — the pond in five sentences, for somebody who is not looking at it.
//
// `🔗 Share` has copied a bare URL since v1.44. It works, and it asks the wrong
// thing of the person you send it to: a link with nothing attached is a request
// for forty seconds of their attention on trust. Every fact that would earn
// those forty seconds was already on the page — a pond with a name, an age, a
// champion, a record crowd and a sentence about what is happening in it right
// now — and none of it travelled.
//
// So the share carries the story and the link travels inside it. Same one
// press, same clipboard, and what lands in the chat window is this:
//
//     📮 Western Mere
//     A pond in Vivarium, grown from seed 314.
//
//     1,724 steps in, 128 creatures are alive here — 9 generations on from
//     the 40 this pond began with.
//     212 have been born here and 84 have died, 12 of them eaten.
//     👶 Most young: Tamsin has raised 13 young, and is still in the water.
//     🌊 Biggest crowd: 214 animals at once, 1,102 steps in.
//     One family is running away with the pond.
//
//     Watch it grow: https://getravi.github.io/claude_imagine/app/#seed=314
//
// Four rules, and three of them are about restraint.
//
//  1. **A hook, not a report.** This page has six boards and a chronicle, and
//     the temptation is to put a line from each of them in here. Two records at
//     most, and the first is the one about a *person*, because a stranger who
//     has never seen this pond has no reason to care that a lineage peaked at
//     88 and every reason to wonder who Tamsin is. The rest is what the link is
//     for.
//  2. **A sentence written for the person at the controls is not a sentence for
//     the person you send it to.** The headline over the water closes the card,
//     because it is already the pond in one plain line for a reader who has
//     just arrived — except in the one state where it stops being an
//     observation and becomes an instruction: an empty pond is told *press ↻
//     Reset to start the pond over*, which is advice for somebody holding the
//     keyboard, and the postcard says what happened instead. Every other
//     sentence this page writes is worth the same question before it is posted.
//  3. **A line with nothing in it does not appear.** A pond thirty steps old
//     has no records, no deaths and no generations, and a card that padded
//     itself out with zeroes would be describing a pond that had done nothing
//     by listing the things it had not done. The card is as long as the pond
//     has earned.
//  4. **Nothing here is a control.** No offer, no `👀 Show me`, no ids — the
//     whole point is that this text ends up somewhere with no JavaScript in it.
//     Every other narrator in this project composes a thing you can press
//     (v1.133, v1.136, v1.137, v1.139); this one composes a thing you can
//     paste, which is why the names are baked into the sentences rather than
//     resolved at a press.
//
// Determinism: reads the world and the config, writes to neither, and draws no
// random number. Two pure functions and a clipboard string.

import { pondName } from "./pondname.js";
import { stepsIn } from "./pondclock.js";
import { pondHeadline } from "./headline.js";
import { recordRows } from "./records.js";

/** The mark the card wears, wherever it is titled. */
export const POSTCARD_MARK = "📮";

/**
 * How many of the pond's records get on the card.
 *
 * Two, out of the three `records.js` keeps. The board is ranked already — the
 * animal first, then the crowd, then the family — and the ranking is the same
 * one this card wants, so the cap is a slice and not a second opinion.
 */
export const POSTCARD_RECORDS = 2;

/** What the last line says when the pond has no *now* left to describe. */
export const ENDED_LINE = "It is over now: everything here has died.";

const n = (v) => Math.round(v).toLocaleString("en-US");

/**
 * The pond as a card: a title, a subtitle and the few sentences it has earned.
 *
 * @param {{tick:number, creatures:Array, stats:object, phylogeny:object}} world
 * @param {object} config the world's own config, for the seed and the headline
 * @param {Map<number, {plural:string}>|null} names the lineage names, if the
 *   caller has a tree — the records board writes a family into a sentence and
 *   falls back gracefully without one
 * @returns {{title:string, sub:string, lines:string[]}}
 */
export function postcard(world, config, names = null) {
  const seed = pondName(config.seed).seed;
  const lines = [];
  const standing = standingLine(world, config);
  if (standing) lines.push(standing);
  const toll = tollLine(world);
  if (toll) lines.push(toll);
  for (const row of recordRows(world, config, names).slice(0, POSTCARD_RECORDS)) {
    lines.push(`${row.icon} ${row.what}: ${row.why}.`);
  }
  lines.push(nowLine(world, config, names));
  return {
    title: `${POSTCARD_MARK} ${pondName(config.seed).name}`,
    sub: `A pond in Vivarium, grown from seed ${seed}.`,
    lines,
  };
}

/**
 * The card as one block of text, with the link on a line of its own.
 *
 * The link goes last and alone on purpose. Half the places this gets pasted
 * will linkify the URL and the other half will not, and a reader who wanted the
 * address rather than the story can take one line off the bottom without
 * picking it out of a sentence.
 *
 * @param {{title:string, sub:string, lines:string[]}} card
 * @param {string} url the permalink to this exact pond
 */
export function postcardText(card, url) {
  const body = [`${card.title}`, card.sub, "", ...card.lines];
  if (url) body.push("", `Watch it grow: ${url}`);
  return body.join("\n");
}

/**
 * Where the pond stands: its age, who is in it, and how far from the start.
 *
 * The generation clause is the whole reason this line is worth its space. A
 * population count is a reading off a dial; *nine generations on from the forty
 * this pond began with* is the only sentence on the card that says the animals
 * being described are not the ones that were put there, which is what the thing
 * is about.
 */
function standingLine(world, config) {
  const pop = world.creatures.filter((c) => !c.dead).length;
  const gen = (world.stats && world.stats.maxGeneration) || 0;
  const start = config.populationStart;
  const age = stepsIn(world.tick);
  if (pop === 0) return `${age}, and the water is empty.`;
  const who = `${n(pop)} ${pop === 1 ? "creature is" : "creatures are"} alive here`;
  const from =
    gen > 0
      ? `${n(gen)} ${gen === 1 ? "generation" : "generations"} on from the ${n(start)} this pond began with`
      : `still the ${n(start)} this pond began with`;
  return `${age}, ${who} — ${from}.`;
}

/**
 * What the pond has been through. Skipped outright on a pond too young to have
 * done either, rather than printed as a pair of zeroes.
 */
function tollLine(world) {
  const s = world.stats || {};
  const births = s.births || 0;
  const deaths = s.deaths || 0;
  const kills = s.kills || 0;
  if (births === 0 && deaths === 0) return "";
  const eaten = kills > 0 ? `, ${n(kills)} of them eaten` : "";
  return `${n(births)} have been born here and ${n(deaths)} have died${eaten}.`;
}

/**
 * The closing line: what is happening right now, in the words the page already
 * uses over the water — except when those words stop describing and start
 * instructing. See rule 2 at the top of this file.
 */
function nowLine(world, config, names) {
  const alive = world.creatures.some((c) => !c.dead);
  if (!alive) return ENDED_LINE;
  return pondHeadline(world, config, names).text;
}
