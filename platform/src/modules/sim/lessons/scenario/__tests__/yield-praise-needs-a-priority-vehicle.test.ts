/**
 * A YIELD COMMENDATION NEEDS A VEHICLE THAT HAD PRIORITY — measured on the
 * BUILT world, for every staged priority car in the catalogue (audit
 * `sc-jx-priority-confidence:9c987e7b`, the commendation clause).
 *
 * THE CLASS. `PriorityFromRightRunner` pushes `{prioritySituation, give-way,
 * yielded}` itself whenever its spec's `junctionControl` is "stopLine" (the
 * default) and the student waited while its car crossed. The reducer turns
 * that into «✓ Правилно отстъпено предимство — Пропусна превозното средство с
 * предимство…». Nothing in that chain asks whether the car HAD priority: the
 * runner trusts the author's key. On `sc-jx-priority-confidence` the author's
 * key was wrong twice — the waiter until 2026-09-13, the L5 creeper until this
 * change — and both times the product praised a student on the priority road
 * for giving way to a car standing behind its own Б2.
 *
 * THE RULE, read off `createWorldRuntime(district).debugStopLines()` — the
 * same derived lines the rule engine grades and the world builder posts signs
 * on (audit C-4) — never off the template's prose:
 *
 *   a spec whose runner MAY commend a yield («stopLine»)
 *     · its car's own approach to the junction carries NO Б2 / Б1 line, and
 *     · some OTHER approach to that junction does — somebody owes it way.
 *
 *   a spec whose car approaches BEHIND its own Б2 / Б1
 *     · is never «stopLine»: that car is the one obliged to give way, so a
 *       student who waits for it has not yielded a priority it never had.
 *
 * A12: this withholds praise only on positive evidence — a sign line on the
 * car's own approach. Where the world gives no such line the runner is left
 * exactly as it was.
 *
 * A MATCHER MUST REPORT WHAT IT CANNOT READ. A spec whose approach edge cannot
 * be resolved against the district is `unresolved` and fails the census — it
 * is never counted as «no line found».
 */

import { describe, expect, it } from "vitest";
import { lessonDistrictId, type PriorityFromRightSpec } from "../../../contracts";
import { createWorldRuntime } from "../../../runtime";
import { EXAM_SHELLS } from "../../examBankData";
import { EXAM_LESSON, LESSONS, POLIGON_LESSONS } from "../../specs";
import { compileScenario, resolveScenarioComplication } from "../compile";
import { SCENARIO_TEMPLATES } from "../templates";
import { SC_JX_PRIO_CREEPER, SC_JX_PRIO_WAITING_CAR } from "../templates-junctions3";
import type { ScenarioSpec } from "../types";
import { loadDistrict } from "./witnessLiveRung";

interface DistrictRoads {
  roads: { edges: Array<{ id: string; from: string; to: string }> };
}

type SignControl = "stopSign" | "giveWay";

interface Reading {
  /** `<template>/<spec id>` — one row per spec, whatever rungs stage it. */
  key: string;
  templateId: string;
  specId: string;
  mayCommend: boolean;
  /** null = the approach edge could not be resolved (reported, never skipped). */
  ownApproachSigns: SignControl[] | null;
  otherApproachSigns: SignControl[];
}

const runtimeCache = new Map<string, ReturnType<typeof createWorldRuntime>>();
function builtStopLines(districtId: string) {
  let rt = runtimeCache.get(districtId);
  if (rt === undefined) {
    rt = createWorldRuntime(loadDistrict(districtId));
    runtimeCache.set(districtId, rt);
  }
  return rt.debugStopLines();
}

/** Read one staged priority car against the built world of its district. */
function read(templateId: string, districtId: string, s: PriorityFromRightSpec): Reading {
  const edges = (loadDistrict(districtId) as DistrictRoads).roads.edges;
  const j = s.junctionNodeIndex;
  const before = s.actor.pathNodes[j - 1];
  const at = s.actor.pathNodes[j];
  const own = new Set<number>();
  edges.forEach((e, i) => {
    if ((e.from === before && e.to === at) || (e.from === at && e.to === before)) own.add(i);
  });
  const signed = builtStopLines(districtId).filter(
    (l): l is typeof l & { control: SignControl } =>
      l.junctionNodeId === s.junction.nodeId && (l.control === "stopSign" || l.control === "giveWay"),
  );
  const resolved = before !== undefined && at === s.junction.nodeId && own.size > 0;
  return {
    key: `${templateId}/${s.id}`,
    templateId,
    specId: s.id,
    mayCommend: (s.junctionControl ?? "stopLine") === "stopLine",
    ownApproachSigns: resolved ? signed.filter((l) => own.has(l.edgeIdx)).map((l) => l.control) : null,
    otherApproachSigns: signed.filter((l) => !own.has(l.edgeIdx)).map((l) => l.control),
  };
}

/** Every priorityFromRight spec any rung of any template compiles, once each. */
function census(templates: readonly ScenarioSpec[]): { readings: Reading[]; conflicting: string[] } {
  const seen = new Map<string, Reading>();
  const conflicting: string[] = [];
  for (const t of templates) {
    for (const rung of t.levels) {
      const cast = compileScenario(t, rung.level).stagedEvents ?? [];
      for (const s of cast) {
        if (s.kind !== "priorityFromRight") continue;
        const r = read(t.id, t.map.districtId, s);
        const prev = seen.get(r.key);
        // One spec id, one reading: a rung that restaged the same id with a
        // different control would be two rows the census must not merge.
        if (prev !== undefined && JSON.stringify(prev) !== JSON.stringify(r)) {
          conflicting.push(`${r.key}@L${rung.level}`);
        }
        seen.set(r.key, r);
      }
    }
  }
  return { readings: [...seen.values()], conflicting };
}

const { readings: ALL, conflicting: CONFLICTING } = census(SCENARIO_TEMPLATES);

/**
 * THE OTHER AUTHORS. Templates are not the only place a priority car is
 * staged: the curriculum lessons and the practical-exam route bank stage
 * theirs as plain data (`lessons/specs.ts`, `lessons/examBankData.ts`), and a
 * census that read only the templates would be reporting on what it happened
 * to open. Same reading, same rule.
 */
function censusOfPlainLessons(): Reading[] {
  const seen = new Map<string, Reading>();
  for (const lesson of [...LESSONS, EXAM_LESSON, ...POLIGON_LESSONS]) {
    for (const s of lesson.stagedEvents ?? []) {
      if (s.kind !== "priorityFromRight") continue;
      const r = read(lesson.id, lessonDistrictId(lesson), s);
      seen.set(r.key, r);
    }
  }
  for (const shell of EXAM_SHELLS) {
    for (const slot of shell.slots) {
      for (const option of slot.options) {
        if (option.build === null) continue;
        const s = option.build(slot.id);
        if (s.kind !== "priorityFromRight") continue;
        // The bank's routes all run on the default district (examBankData.ts).
        const r = read(`exam-bank-${shell.code}`, lessonDistrictId({}), s);
        // Tiers of one slot differ only in `leadSec`; one reading per slot.
        seen.set(`${r.key}`, r);
      }
    }
  }
  return [...seen.values()];
}

const PLAIN = censusOfPlainLessons();

/** What that census read on 2026-10-04 — pinned so a new author is added on purpose. */
const PLAIN_PINNED: string[] = [
  "exam-bank-A/xA-priority may commend own=[] other=[giveWay]",
  "exam-bank-B/xB-rhr never commends own=[] other=[]",
  "exam-bank-D/xD-priority may commend own=[] other=[giveWay]",
  "exam-bank-D/xD-rhr never commends own=[] other=[]",
  "exam-bank-E/xE-rhr never commends own=[] other=[]",
  "exam-bank-G/xG-rhr never commends own=[] other=[]",
  "exam-bank-H/xH-priority may commend own=[] other=[giveWay]",
  "exam-bank-I/xI-rhr never commends own=[] other=[]",
  "l2-intersections/l2-priority-from-right may commend own=[] other=[giveWay]",
  "lex-exam-1/ex-priority-from-right may commend own=[] other=[giveWay]",
];

describe("every staged priority car is read against the built world", () => {
  it("nothing is unresolved — a spec the census cannot read fails it", () => {
    expect(ALL.filter((r) => r.ownApproachSigns === null).map((r) => r.key)).toEqual([]);
    expect(CONFLICTING, "one spec id read two ways on two rungs").toEqual([]);
    // The census sees the catalogue: 17 specs on 14 templates today.
    expect(ALL.length).toBeGreaterThanOrEqual(17);
  });

  it("a runner that may commend a yield stages a car that HAS priority: no Б2/Б1 on its approach, one on another", () => {
    const minting = ALL.filter((r) => r.mayCommend);
    for (const r of minting) {
      expect(r.ownApproachSigns, `${r.key}: its car approaches behind its own sign`).toEqual([]);
      expect(
        r.otherApproachSigns.length,
        `${r.key}: no other approach to the junction owes this car way`,
      ).toBeGreaterThan(0);
    }
  });

  it("…and the list of runners that may commend is pinned — a new one is added on purpose", () => {
    expect(ALL.filter((r) => r.mayCommend).map((r) => r.key).sort()).toEqual([
      "sc-junction-gap/sc-jgap-conflict",
      "sc-junction-left/sc-jleft-conflict",
      "sc-junction-scan/sc-jscan-conflict",
      "sc-jx-giveway-b1/sc-jxgb-conflict",
    ]);
  });

  it("a car behind its own Б2/Б1 never commends a yield — today that is this lesson's two stem cars, and only they", () => {
    const behind = ALL.filter((r) => (r.ownApproachSigns ?? []).length > 0);
    expect(behind.map((r) => r.key).sort()).toEqual([
      "sc-jx-priority-confidence/sc-jxpc-creeper",
      "sc-jx-priority-confidence/sc-jxpc-waiter",
    ]);
    for (const r of behind) {
      expect(r.ownApproachSigns, r.key).toEqual(["stopSign"]);
      expect(r.mayCommend, `${r.key}: would praise yielding to a car obliged to stop`).toBe(false);
    }
  });
});

describe("…and so is every priority car staged OUTSIDE the templates (curriculum lessons, the exam bank)", () => {
  it("the census found them, and none is unresolved", () => {
    expect(PLAIN.filter((r) => r.ownApproachSigns === null).map((r) => r.key)).toEqual([]);
    expect(
      PLAIN.map((r) => `${r.key} ${r.mayCommend ? "may commend" : "never commends"} own=[${r.ownApproachSigns}] other=[${r.otherApproachSigns}]`).sort(),
    ).toEqual(PLAIN_PINNED);
  });

  it("the same rule holds: may commend ⇒ no sign on its own approach, one on another; behind its own sign ⇒ never commends", () => {
    for (const r of PLAIN) {
      if (r.mayCommend) {
        expect(r.ownApproachSigns, `${r.key}: its car approaches behind its own sign`).toEqual([]);
        expect(r.otherApproachSigns.length, `${r.key}: nobody owes this car way`).toBeGreaterThan(0);
      }
      if ((r.ownApproachSigns ?? []).length > 0) {
        expect(r.mayCommend, `${r.key}: would praise yielding to a car obliged to give way`).toBe(false);
      }
    }
  });
});

describe("the census has teeth — measured against synthetic specs, not against itself", () => {
  const TEMPLATE = "sc-jx-priority-confidence";
  const DISTRICT = "tj-stop-v1";

  it("the creeper as it shipped before this change is the violation the rule describes", () => {
    const before = read(TEMPLATE, DISTRICT, { ...SC_JX_PRIO_CREEPER, junctionControl: "stopLine" });
    expect(before.mayCommend).toBe(true);
    expect(before.ownApproachSigns).toEqual(["stopSign"]);
    // tj-n-c carries exactly one sign line, and it is on the stem this car drives.
    expect(before.otherApproachSigns).toEqual([]);
  });

  it("the default (absent key) is read as «stopLine», the runner's own default", () => {
    const { junctionControl: _dropped, ...noKey } = SC_JX_PRIO_WAITING_CAR;
    void _dropped;
    expect(read(TEMPLATE, DISTRICT, noKey as PriorityFromRightSpec).mayCommend).toBe(true);
  });

  it("the same stem car driven the OTHER way along the main road is a priority car", () => {
    const main = read(TEMPLATE, DISTRICT, {
      ...SC_JX_PRIO_WAITING_CAR,
      junctionControl: "stopLine",
      actor: { ...SC_JX_PRIO_WAITING_CAR.actor, pathNodes: ["tj-n-e", "tj-n-c", "tj-n-w"] },
    });
    expect(main.ownApproachSigns).toEqual([]);
    expect(main.otherApproachSigns).toEqual(["stopSign"]);
  });

  it("a path the district does not have is UNRESOLVED, not «no sign found»", () => {
    const lost = read(TEMPLATE, DISTRICT, {
      ...SC_JX_PRIO_WAITING_CAR,
      actor: { ...SC_JX_PRIO_WAITING_CAR.actor, pathNodes: ["tj-n-nowhere", "tj-n-c", "tj-n-w"] },
    });
    expect(lost.ownApproachSigns).toBeNull();
    const wrongNode = read(TEMPLATE, DISTRICT, { ...SC_JX_PRIO_WAITING_CAR, junctionNodeIndex: 2 });
    expect(wrongNode.ownApproachSigns).toBeNull();
  });
});

describe("the briefing never calls a car «с предимство» when the world says it is not", () => {
  it("every rung whose complication says «която има предимство» adds a car with no sign on its own approach", () => {
    const said: string[] = [];
    for (const t of SCENARIO_TEMPLATES) {
      for (let i = 0; i < t.levels.length; i++) {
        const rung = t.levels[i]!;
        const line = resolveScenarioComplication(t, rung.level)?.coachBg ?? "";
        if (!line.includes("която има предимство")) continue;
        said.push(`${t.id}@L${rung.level}`);
        const added = (rung.stagedAdd ?? []).filter(
          (s): s is PriorityFromRightSpec => s.kind === "priorityFromRight",
        );
        expect(added.length, `${t.id}@L${rung.level}: says it, adds no such car`).toBeGreaterThan(0);
        for (const s of added) {
          const r = read(t.id, t.map.districtId, s);
          expect(r.ownApproachSigns, `${r.key}@L${rung.level}`).toEqual([]);
        }
      }
    }
    // Measured 2026-10-04: the ladder's phrase reached exactly ONE rung in the
    // whole catalogue — this lesson's L5 — and was false there. It reaches none now.
    expect(said).toEqual([]);
  });
});
