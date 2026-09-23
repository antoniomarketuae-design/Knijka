/**
 * WHY THE KERB AT A BUS STOP IS KEPT CLEAR — the ground the scene's comments
 * give for it must be a clause the law bank actually holds.
 *
 * Founder rulings 2026-09-22 («Convict under чл. 69», «Teach чл. 69 as
 * written», row sc-pk-busstop-ban:b103c282). `scenarioSceneryProps.ts` grounds
 * RULE 2 / RULE 2b (no decorative car parked at an authored bus stop) in the
 * act, and it used to say «ЗДвП чл. 98, ал. 1, т. 4 — спиране и престой на
 * спирка … е забранено» and «(ЗДвП чл. 98, ал. 1 — спиране и престой на спирка
 * е забранено)». Retrieved, ал. 1 names no spirka (т. 4 is the rails), and a
 * decorative body is a PARKED car — whose ban at a stop is ал. 2, т. 3.
 *
 * This is a source guard, and it says so: it cannot prove the kerb rule runs
 * (bus-stop-kerb.test.ts drives `computeParkedCars` for that). What it pins is
 * the one thing no execution can — that the file stops attributing the
 * bus-stop ban to a clause that does not contain it — and it checks the words
 * the file quotes against the RETRIEVED unit rather than against a string held
 * here (ADR-002).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveLawRef } from "@/lib/content/law";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.resolve(HERE, "..", "scenarioSceneryProps.ts"), "utf-8");
/** The comment text with the `//` / ` * ` gutters folded, so a clause split
 *  across lines reads as one sentence. */
const PROSE = SRC.replace(/\n\s*(\/\/|\*)\s?/g, " ").replace(/\s+/g, " ");

describe("scenarioSceneryProps — the bus-stop kerb rule cites the act's parking clause", () => {
  it("no comment ASSERTS the old miscitation any more", () => {
    // Both historic claims, as claims (the corrective notes quote them inside
    // «…» after «used to cite», which this pattern does not match).
    expect(PROSE).not.toMatch(/ЗДвП чл\. 98, ал\. 1, т\. 4 — спиране и престой на спирка/);
    expect(PROSE).not.toMatch(/\(ЗДвП чл\. 98, ал\. 1 — спиране и престой на спирка е забранено\)/);
    expect(PROSE).not.toMatch(/ЗДвП чл\. 98 bans stopping AT the spirka/);
  });

  it("each of the three bus-stop grounds names чл. 98, ал. 2, т. 3", () => {
    expect(PROSE.split("чл. 98, ал. 2, т. 3").length - 1).toBeGreaterThanOrEqual(3);
  });

  it("the words it quotes for that clause are the RETRIEVED act's", () => {
    const art98 = resolveLawRef({ act: "ЗДвП", ref: "чл. 98" });
    expect(art98.found).toBe(true);
    if (!art98.found) return;
    // „…“ and «…» are matched as PAIRS — a mixed class would run from one
    // style's opener to the other's closer across whole paragraphs.
    const quoted = [
      ...PROSE.matchAll(/„([^„“]*спирките[^„“]*)“|«([^«»]*спирките[^«»]*)»/g),
    ].map((m) => (m[1] ?? m[2])!.replace(/\s*…\s*/g, "…"));
    expect(quoted.length).toBeGreaterThanOrEqual(2);
    for (const q of quoted) {
      // An elided quote («A … B») must hold each fragment, in order.
      let from = 0;
      for (const frag of q.split("…").map((f) => f.trim()).filter(Boolean)) {
        const at = art98.unit.textBg.indexOf(frag, from);
        expect(at, `«${frag}» not in the retrieved чл. 98`).toBeGreaterThanOrEqual(0);
        from = at + frag.length;
      }
    }
  });
});
