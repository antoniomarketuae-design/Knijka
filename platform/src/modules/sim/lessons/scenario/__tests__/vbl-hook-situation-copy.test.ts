/**
 * sc-vu-bikelane-turn:9141072b (lane vbltiming, integrator ruling T5(a),
 * confirmed 2026-11-02) — THE RIGHT HOOK ON A CYCLIST IS EXPLAINED AS ITSELF,
 * at every site that bills it.
 *
 * THE DEFECT (rig-w3n V2-CUT-pc-L1 debriefText, re-read at the base): the hook
 * bill FAILED_TO_YIELD «cyclist-right-hook» printed the POOLED priority card —
 * a paragraph about junctions without signals («пропускаш идващите отдясно»),
 * a corrective ending «На кръгово гледаш НАЛЯВО», «ЗДвП чл. 47; чл. 48; чл. 50,
 * ал. 1» — none of which is the duty a right-turner owes the rider going
 * straight beside him. FAILED_TO_YIELD_SITUATION_COPY held only the ring row,
 * and its row type had no corrective.
 *
 * THE ROW IS SHOWN WHEREVER THE DETAIL IS BILLED. Only CyclistRightHookRunner
 * emits «cyclist-right-hook», so the sites are exactly the authored
 * cyclistRightHook actors, censused below from the catalogue (templates,
 * levels, the lesson specs, the exam bank) — every one either a with-flow curb
 * rider (positive curb offset: the right side of the road the student drives
 * and turns toward) or the counter-flow rider of sc-vu-bikelane-turn (the
 * reversed path pushed onto the same south track, on a map whose track is
 * two-way). Each sentence of the row is checked against that census: the rider
 * goes straight, is on the right side of the road, had not yet passed the turn
 * (the runner's own arc < 8 condition); the look AHEAD-right is conditional on
 * a two-way track. And the law is retrieved, not recalled (ADR-002).
 *
 * M8: delete the row and the card falls back to the pool — the title, peek,
 * lawRef and corrective assertions below die on their text.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CyclistRightHookSpec, LessonSpec, StagedEventSpec } from "../../../contracts";
import {
  FAILED_TO_YIELD_SITUATION_COPY,
  FAILED_TO_YIELD_SITUATION_CYCLIST_RIGHT_HOOK,
  VIOLATIONS,
  violationCorrectiveBg,
  violationPeekBg,
} from "../../../rules/catalog";
import type { RuleEvent, ViolationEvent } from "../../../rules/types";
import { drive, tick } from "../../../rules/__tests__/fixtures";
import { EXAM_SHELLS } from "../../examBankData";
import { EXAM_LESSON, LESSONS, POLIGON_LESSONS } from "../../specs";
import { SCENARIO_TEMPLATES } from "../templates";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const HOOK = FAILED_TO_YIELD_SITUATION_CYCLIST_RIGHT_HOOK;

function convict(): ViolationEvent {
  const ev = drive([
    tick(0, { speedKmh: 15, events: [{ kind: "prioritySituation", situation: HOOK, violated: true }] }),
    tick(1, { speedKmh: 12 }),
  ]).events.filter((e: RuleEvent): e is ViolationEvent => e.kind === "violation" && e.code === "FAILED_TO_YIELD");
  expect(ev).toHaveLength(1);
  return ev[0];
}

interface Site {
  owner: string;
  id: string;
  offset: number;
  pathNodes: readonly string[];
  footprint: boolean;
}

function census(): Site[] {
  const out: Site[] = [];
  const take = (owner: string, specs: readonly unknown[] | undefined) => {
    for (const s of (specs ?? []) as StagedEventSpec[]) {
      if (s.kind !== "cyclistRightHook") continue;
      const c = s as CyclistRightHookSpec;
      out.push({
        owner,
        id: c.id,
        offset: c.actor.extraRightOffsetM ?? 0,
        pathNodes: c.actor.pathNodes,
        footprint: c.actor.playerGuardFootprint === true,
      });
    }
  };
  for (const t of SCENARIO_TEMPLATES) {
    take(t.id, t.staged);
    for (const l of t.levels) take(`${t.id}@L${l.level}+`, (l as { stagedAdd?: readonly unknown[] }).stagedAdd);
  }
  for (const l of [...LESSONS, EXAM_LESSON, ...POLIGON_LESSONS] as LessonSpec[]) take(l.id, l.stagedEvents);
  for (const shell of EXAM_SHELLS) {
    for (const slot of shell.slots) {
      for (const o of slot.options) {
        if (o.build) take(`exam ${shell.code}/${slot.id}/${o.key}`, [o.build(`${slot.id}-${o.key}`)]);
      }
    }
  }
  return out;
}

describe("«cyclist-right-hook» — the sites that bill it (F10's census, unchanged)", () => {
  const sites = census();

  it("every authored cyclistRightHook actor, printed; the with-flow ones ride the right curb, the one counter-flow rider rides a two-way track", () => {
    for (const s of sites) console.log(`${s.owner} · ${s.id} · offset ${s.offset} · ${s.pathNodes.join("→")}${s.footprint ? " · FOOTPRINT" : ""}`);
    const owners = [...new Set(sites.map((s) => s.owner.replace(/^exam [A-Z]\/.*$/, "exam V1 slots")))].sort();
    console.log(`owners ${JSON.stringify(owners)}`);
    expect(owners).toEqual(
      [
        "exam V1 slots",
        "lex-exam-1", // ex-cyclist-right-hook (specs.ts cyclistRightHookAtT)
        "l3-roundabout", // l3-cyclist-right-hook (specs.ts cyclistRightHookAtT)
        "sc-vu-bikelane-turn",
        "sc-vu-cyclist-group",
        "sc-vu-cyclist-hook",
        "sc-vu-pass-clearance",
      ].sort(),
    );
    const counter = sites.filter((s) => s.offset <= 0);
    // The ONE rider who does not ride the curb of the student's own direction:
    // the counter-flow rider, on the reversed path of a map whose track is
    // two-way — the case the corrective's conditional clause names.
    expect(counter.map((s) => s.id)).toEqual(["sc-vbl-rider-cf"]);
    const map = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", "vu-bikelane-v1.json"), "utf-8"));
    expect(map.meta.scenario.cycleTrack.twoWay).toBe(true);
    expect(map.meta.scenario.cycleTrack.side).toBe("south");
    // Every other rider: right of his travel, on the student's own direction.
    for (const s of sites.filter((q) => q.offset > 0)) expect(s.offset, s.id).toBeGreaterThan(2);
  });

  it("exactly one actor in the catalogue authors the footprint line guard: the with-flow rider of sc-vu-bikelane-turn", () => {
    expect(sites.filter((s) => s.footprint).map((s) => `${s.owner}:${s.id}`)).toEqual(["sc-vu-bikelane-turn:sc-vbl-rider-wf"]);
  });
});

describe("«cyclist-right-hook» — the card says what happened and why (THEO-4), from retrieved law (ADR-002)", () => {
  it("M8: the hook bill carries its own title, peek, lawRef and corrective — not the pooled priority card", () => {
    const card = convict();
    const pooled = VIOLATIONS.FAILED_TO_YIELD;
    const corrective = violationCorrectiveBg("FAILED_TO_YIELD", card.detail);
    const peek = violationPeekBg("FAILED_TO_YIELD", card.detail);
    console.log(`title ${card.titleBg}\npeek ${peek}\nexplanation ${card.explanationBg}\ncorrective ${corrective}\nlawRef ${card.lawRef}`);
    expect(card.detail).toBe(HOOK);
    expect(card.titleBg, "the hook bill printed the pooled title").toBe("Непропускане на велосипедист");
    expect(card.lawRef, "the hook bill cited the pooled articles").toBe("ЗДвП чл. 35, ал. 2; чл. 5, ал. 2, т. 1");
    expect(peek, "the hook bill's peek is the pooled one").toBe("Пусни велосипедиста пръв.");
    expect(corrective, "the hook bill's corrective is the pooled one").not.toBe(pooled.correctiveBg);
    expect(card.explanationBg).not.toBe(pooled.explanationBg);
    // Nothing about the CHARGE moves.
    expect(card.severityClass).toBe("opasna");
    expect(card.points).toBe(pooled.points);
  });

  it("every sentence is true at every site: straight on, the right side of the road, not yet past the turn; ahead-right only where the track is two-way", () => {
    const card = convict();
    const corrective = violationCorrectiveBg("FAILED_TO_YIELD", card.detail);
    // The claims the explanation makes, each one the runner's own bill
    // condition or the census above.
    expect(card.explanationBg).toMatch(/продължава направо/); // the rider's path goes THROUGH the junction (every site)
    expect(card.explanationBg).toMatch(/още не беше подминал мястото на завоя/); // arc < CYCLIST_CLEAR_ARC_M
    expect(card.explanationBg).toMatch(/от дясната ти страна — край десния бордюр или по велоалеята вдясно/); // offset > 0, or the south track
    // No claim that holds at one site only: no «отзад» in the explanation (the
    // counter-flow rider comes from ahead), no unconditional track, no ring.
    expect(card.explanationBg).not.toMatch(/отзад|насреща|кръгов|наляво/i);
    // The corrective: the rear check for the rider from behind, and the look
    // ahead-right CONDITIONAL on a two-way track.
    expect(corrective).toMatch(/дясното огледало/);
    expect(corrective).toMatch(/дясното рамо/);
    expect(corrective).toMatch(/ако велоалеята е двупосочна — и напред-надясно/);
    expect(corrective).toMatch(/Пропусни го да премине и завий едва след това/);
    expect(corrective).not.toMatch(/НАЛЯВО|кръгов|главния път/);
    // THEO-4: the WHY — whose duty, and why it matters — not a bare verdict.
    expect(card.explanationBg).toMatch(/задължава завиващия надясно да пропусне/);
    expect(card.explanationBg).toMatch(/внимателен и предпазлив/);
  });

  it("the law is the template's retrieved quotes, present in content/law (ADR-002); чл. 25, ал. 2 is not cited", () => {
    const row = FAILED_TO_YIELD_SITUATION_COPY[HOOK];
    const zdvp = JSON.stringify(JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "law", "acts", "zdvp.json"), "utf-8")));
    expect(zdvp).toContain("длъжен да пропусне пътните превозни средства, преминаващи от дясната му страна");
    expect(zdvp).toContain("да бъде внимателен и предпазлив към уязвимите участници в движението, каквито са пешеходците и водачите на двуколесни пътни превозни средства");
    const cited = [...`${row.explanationBg} ${row.lawRef} ${row.correctiveBg}`.matchAll(/чл\. \d+(, ал\. \d+)?(, т\. \d+)?/g)].map((m) => m[0]);
    expect([...new Set(cited)].sort()).toEqual(["чл. 35, ал. 2", "чл. 5, ал. 2, т. 1"]);
    expect(row.lawRef).not.toMatch(/чл\. 25/);
  });
});
