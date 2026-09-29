/**
 * WET-COPY TRUTH — two founder rulings of 2026-09-27, each pinned to the code
 * that decides whether the sentence is true.
 *
 * ===========================================================================
 * §A — sc-ac-truck-spray: the finish gate may not claim the curtain.
 * ===========================================================================
 *
 * Ruling 1 («The time gap»): this lesson's careless offence is the SECONDS gap
 * it teaches and bills (FOLLOWING_TOO_CLOSE_FOR_RAIN, «Суха дистанция в
 * мокрото»), not physically entering the spray. The follow-up it named: the
 * finish objective read «Стигни края на отсечката, без да си влизал в
 * пелената» — make that TRUE or reword it.
 *
 * WHAT THE GATE ACTUALLY CHECKS. `sc-acts-finish` is a plain `reachZone`
 * (x 0, y 860, r 12). `stepReachZone` is handed the car's position and speed;
 * nothing in it reads `tick.leadGapM`, the truck, or `SPRAY_NEAR_M`
 * (traffic/vehicleFleet.ts — the distance inside which the curtain reaches
 * full strength). §A1 DRIVES it: a car 3 m off the truck's tailboard, deep in
 * the curtain, collects the tick exactly like a car 58 m back. So the old
 * title handed out a certificate — «ти не влезе в пелената» — for a fact the
 * row never looked at.
 *
 * WHY REWORD AND NOT BUILD A PLUME CHECK. The rig pins the truck at 64 m of
 * centres (58.2 m of bumpers) up to 118.8 km/h (ACTS_SPRAY_TRUCK), so no
 * lawful drive of this lesson can reach 22 m of it; a plume predicate would be
 * a gate that can never fire — a dead predicate by construction — and the
 * founder ruled the curtain is not the offence anyway. The title now says only
 * what the row checks: the end of the stretch. The gap keeps its grader (the
 * FO-04 detector, opted in by `ruleConfig`), and the WHY of the curtain keeps
 * its place in the instructions (steps 3, 4, 9) and the teach card (THEO-4).
 * §A4 pins that the grading is byte-identical: the title feeds
 * `parseObjectiveParams`' demand matchers, so a reword is proved inert, not
 * assumed inert.
 *
 * ===========================================================================
 * §B — sc-follow-rain-gap: the rain copy may not promise a wet sheen the
 *       phone cannot draw.
 * ===========================================================================
 *
 * Ruling 4 («Reword on phones»): change «мокрото платно поглъща светлината» on
 * the phone tier so it matches what the phone shows (a darker road and
 * droplets); no phone sheen is built.
 *
 * RE-DERIVED FROM SOURCE, NOT FROM THE QUESTION'S WORDING: that sentence is
 * NOT in this lesson, on any tier, at any rung. Its ancestor was
 * sc-follow-distance's old step 7 («…мокрото платно гълта светлина…», landed
 * in 75dd319 and removed by the sweep-161 wave — templates-following.ts
 * carries the note), a DRY drill; the row's own prose («instructions lean on a
 * wet carriageway that swallows light») paraphrased it. The rain-gap briefing
 * as the phone shows it (sweep161 mobile-right/02-briefing.png, identical to
 * the source) says «вали», «габаритите ти тъмни в пръските» and «на мокро
 * спирачният път е около половина по-дълъг» — every one true on a phone that
 * draws a darker road, droplets on the glass and the lead car's spray.
 *
 * So there is nothing to reword, and the durable half of the ruling is a
 * GUARD: §B1 pins the premise (a touch-only device is seeded at `low`, and
 * `low` mounts no HDR environment and loads colour-only ground maps, so no
 * specular wet road can appear on it); §B2 forbids every student-facing
 * string of this lesson — every compiled rung, the template, and the
 * committed demo traces' narration — from claiming a light-swallowing,
 * reflecting, glistening or puddled road. The copy is tier-blind (one
 * briefing for every device), so it must be true on the lowest tier a device
 * can be seeded at. §B3 keeps THEO-4: the briefing must still say WHY the
 * gap grows in rain.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { seedQualityFromSignals } from "../../../environment/quality";
import { SPRAY_NEAR_M } from "../../../traffic/vehicleFleet";
import { TEXTURE_BUDGETS } from "../../../world/textures/textureBudget";
import { createEvalState, parseObjectiveParams, stepObjective } from "../../objectives";
import type { ObjectiveEvalState } from "../../types";
import { makeTick } from "../../__tests__/fixtures";
import { compileScenario } from "../compile";
import { SC_AC_TRUCK_SPRAY } from "../templates-conditions2";
import { SC_FOLLOW_RAIN_GAP } from "../templates-following";
import type { ScenarioLevel } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const LEVELS: readonly ScenarioLevel[] = [1, 2, 3, 4, 5];

// ---------------------------------------------------------------------------
// §A — sc-ac-truck-spray, the finish gate
// ---------------------------------------------------------------------------

/** The title as filed — kept here only as the negative control of §A4. */
const FILED_FINISH_TITLE = "Стигни края на отсечката, без да си влизал в пелената";

/** Words that promise the student the CURTAIN was measured. */
const CURTAIN_CLAIM = /пелен|пръск|облак/i;
/** «без да …» is an absence claim — a promise about the whole stretch. */
const ABSENCE_CLAIM = /без да/i;

function finishObjective(level: ScenarioLevel) {
  const lesson = compileScenario(SC_AC_TRUCK_SPRAY, level);
  const o = lesson.objectives.find((x) => x.id === "sc-acts-finish");
  expect(o, `sc-ac-truck-spray@L${level} has sc-acts-finish`).toBeDefined();
  return { lesson, objective: o! };
}

/** Drive the compiled finish row up the cruise lane with the truck `gapM` ahead. */
function collectsFinishAtGap(level: ScenarioLevel, gapM: number): boolean {
  const { objective } = finishObjective(level);
  const params = parseObjectiveParams(objective);
  let state: ObjectiveEvalState = createEvalState(params);
  let done = false;
  for (let i = 0; i <= 60; i++) {
    const y = 800 + i * 2; // 800 → 920, through the r-12 disc at y 860
    const r = stepObjective(
      params,
      state,
      makeTick({ t: i * 0.1, speedKmh: 64, position: { x: 0, y }, leadGapM: gapM }),
    );
    state = r.evalState;
    done = done || r.done;
  }
  return done;
}

describe("§A sc-ac-truck-spray — the finish title claims only what its gate checks", () => {
  it("§A1 the gate is blind to the curtain: 3 m off the tailboard collects it like 58 m back", () => {
    const deepInCurtain = 3;
    expect(deepInCurtain).toBeLessThan(SPRAY_NEAR_M);
    for (const level of LEVELS) {
      expect(collectsFinishAtGap(level, 58.2), `L${level} at the pinned gap`).toBe(true);
      expect(collectsFinishAtGap(level, deepInCurtain), `L${level} inside the curtain`).toBe(true);
    }
  });

  it("§A2 so the title may not promise the curtain was avoided", () => {
    for (const level of LEVELS) {
      const { objective } = finishObjective(level);
      expect(objective.titleBg, `L${level}`).not.toMatch(CURTAIN_CLAIM);
      expect(objective.titleBg, `L${level}`).not.toMatch(ABSENCE_CLAIM);
    }
  });

  it("§A3 it is still the end-of-stretch claim, and still the last gate", () => {
    for (const level of LEVELS) {
      const { lesson, objective } = finishObjective(level);
      expect(objective.titleBg).toMatch(/^Стигни края на отсечката/);
      expect(lesson.objectives[lesson.objectives.length - 1]!.id).toBe("sc-acts-finish");
    }
  });

  it("§A4 the reword grades nothing differently — the title's demand matchers are inert here", () => {
    for (const level of LEVELS) {
      const { objective } = finishObjective(level);
      const asShipped = parseObjectiveParams(objective);
      const asFiled = parseObjectiveParams({ ...objective, titleBg: FILED_FINISH_TITLE });
      expect(asShipped).toEqual(asFiled);
      // A bare disc: position and radius (the compiler widens the authored
      // 12 m per rung), and no field that could name a truck or a curtain.
      expect(Object.keys(asShipped).sort()).toEqual(["kind", "radiusM", "x", "y"]);
      expect(asShipped).toMatchObject({ kind: "reachZone", x: 0, y: 860 });
    }
  });

  it("§A5 the curtain's WHY is not lost — the briefing and teach card still carry it (THEO-4)", () => {
    const lesson = compileScenario(SC_AC_TRUCK_SPRAY, 1);
    const briefing = (lesson.briefingBg ?? []).map((s) => s.textBg).join(" ");
    expect(briefing).toMatch(/пелена от пръски/);
    expect(briefing).toMatch(/колкото по-близо си, толкова по-малко виждаш/);
    expect(SC_AC_TRUCK_SPRAY.teach.whyBg).toMatch(/Пелената изтрива погледа напред/);
  });
});

// ---------------------------------------------------------------------------
// §B — sc-follow-rain-gap, the phone's wet road
// ---------------------------------------------------------------------------

/**
 * A wet-road SHEEN claim: light swallowed, mirrored or glinting, or standing
 * water. Stems, so a new case ending cannot slip past.
 */
const WET_SHEEN_CLAIM = /поглъщ|гълт|отраз|отблясъ|блест|бляс|лъщ|гланц|локв|огледалн/i;

/** A phone as `readDeviceSignals` reports one: fingertip pointer, no mouse. */
const PHONE_SIGNALS = {
  coarsePointer: true,
  anyFinePointer: false,
  deviceMemoryGb: null,
  hardwareConcurrency: null,
  dpr: 3,
} as const;

/** Every narration line of the lesson's committed demo recordings. */
function traceNarration(scenarioId: string): string[] {
  const dir = path.join(REPO_ROOT, "content", "traces", scenarioId);
  const files = readdirSync(dir).filter((f) => f.endsWith(".trace.json"));
  expect(files.length, `${scenarioId} ships recordings`).toBeGreaterThan(0);
  const out: string[] = [];
  for (const f of files) {
    const raw = readFileSync(path.join(dir, f), "utf-8");
    for (const m of raw.matchAll(/"textBg"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) out.push(m[1]!);
  }
  return out;
}

/** Every string a student of sc-follow-rain-gap can be shown, all rungs. */
function rainGapStudentText(): string[] {
  const texts: string[] = [JSON.stringify(SC_FOLLOW_RAIN_GAP)];
  for (const level of LEVELS) texts.push(JSON.stringify(compileScenario(SC_FOLLOW_RAIN_GAP, level)));
  texts.push(...traceNarration(SC_FOLLOW_RAIN_GAP.id));
  return texts;
}

describe("§B sc-follow-rain-gap — the rain copy is true on the phone's tier", () => {
  it("§B1 the premise: a phone is seeded at `low`, and `low` can draw no specular wet road", () => {
    const tier = seedQualityFromSignals(PHONE_SIGNALS);
    expect(tier).toBe("low");
    // No <Environment> is mounted (LessonScene reads this), so the road's
    // ROAD_ENV_INTENSITY multiplies nothing, and the asphalt carries no
    // normal/roughness map for a highlight to break over. If a future tier
    // ruling gives the phone a sheen, this fails — and the copy may then
    // say more than it does today.
    expect(TEXTURE_BUDGETS[tier].hdrEnvironment).toBe(false);
    expect(TEXTURE_BUDGETS[tier].groundMaps).toBe("colorOnly");
  });

  it("§B2 no student-facing line of the lesson promises a light-swallowing, glossy or puddled road", () => {
    const texts = rainGapStudentText();
    expect(texts.length).toBeGreaterThan(LEVELS.length);
    for (const t of texts) {
      const hit = t.match(WET_SHEEN_CLAIM);
      expect(hit, hit ? `sheen claim «…${t.slice(Math.max(0, hit.index! - 40), hit.index! + 40)}…»` : "").toBeNull();
    }
  });

  it("§B2 control: the matcher catches the sentence the ruling quoted, and its dry-drill ancestor", () => {
    expect("мокрото платно поглъща светлината").toMatch(WET_SHEEN_CLAIM);
    expect("мокрото платно гълта светлина").toMatch(WET_SHEEN_CLAIM);
    expect("мокрият асфалт отразява").toMatch(WET_SHEEN_CLAIM);
    expect("в локвите").toMatch(WET_SHEEN_CLAIM);
    expect("пътят е по-тъмен, а по стъклото има капки").not.toMatch(WET_SHEEN_CLAIM);
  });

  it("§B3 THEO-4 survives: the briefing still says WHY the gap grows in rain, at every rung", () => {
    for (const level of LEVELS) {
      const briefing = (compileScenario(SC_FOLLOW_RAIN_GAP, level).briefingBg ?? [])
        .map((s) => s.textBg)
        .join(" ");
      expect(briefing, `L${level}`).toMatch(/спирачният път/);
      expect(briefing, `L${level}`).toMatch(/3 секунди/);
      expect(briefing, `L${level}`).toMatch(/вали/);
    }
  });
});
