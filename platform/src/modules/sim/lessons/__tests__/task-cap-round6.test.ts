/**
 * THE TASK CEILING, ROUND 6 — the lesson engine.
 *
 * FOUNDER RULING 4 (2026-09-26, «Bill the arrival»), IN THE INTEGRATOR'S
 * READING (binding for round 6): EVERY capped objective has a mark, so the
 * arrival event applies to EVERY blown cap — not only the zone-default ones.
 * It is one act with any sustained over-cap stretch that follows on the named
 * feature, and with any kin breach in the same continuous act: one act, one
 * bill.
 *
 * Round 5 billed the arrival only where the task named nothing beyond its own
 * mark. The round-5 verifier (F1, F2) measured what that left: four short named
 * features on the founder's list of 61 — `sc-acbi-deck` («Стигни края на
 * хлъзгавото…», an arrival by its own title), `sc-ovb-patience`,
 * `sc-lnom-round`, `sc-rbg-past-east` — whose stretches are shorter than the
 * task code's 3 s sustain, so a blow there produced a breach row and no bill at
 * any realistic speed; and `sc-prs-row`, which round 5 had made a named row, and
 * which at the demo mistake's 50 km/h is crossed in 2.95 s. Both findings are
 * ported below as tests, together with the census that proves every blown cap
 * on every practice rung now bills exactly once.
 *
 * ONE ACT, ONE BILL — what it means here, stated so it can be checked: an act
 * has ONE first bill (the card the first time the topic is met, a point on a
 * repeat) and at most ONE charge-carrying re-grade, the charge the free first
 * card consumed (`rules/engine.ts` „THE KIN LEDGER", unchanged since round 2).
 * A blow and every over-cap stretch that follows it on the stretch that blow
 * fixed — however the student hovers, corrects, or leaves the graded road in
 * between — is one act (`rules/engine.ts` `taskArrival`). A NEW blow (the same
 * mark on a fresh approach, the next capped mark) is a new act: the repeat.
 *
 * Also here (round-5 verifier F5): on L1 a lower-class teach card (TASK, any
 * второстепенна) must never take the teach-pause slot from a later dangerous or
 * charged fault. The five legs the verifier named get their dangerous pause
 * card back.
 *
 * Every case was run RED on round 5 (`scratchpad/cap/r6f/red-on-r5-list.txt`)
 * except the ones marked GUARD or PIN. A PIN held on round 5 too — round 5 billed
 * no arrival on a named feature, so its curtain had one card either way — and
 * is there for the arrival WITHOUT its act: every PIN goes red when the held act
 * is never resumed (mutant O2, `scratchpad/cap/r6f/`).
 *
 * ROUND 14 — RETIRED HERE: 4 tests (founder ruling 2026-10-03, «Cap adds, never removes. The task cap
 * is an extra rule on top. Its bill stands on its own; the bend/weather bills are charged exactly as they would be in a
 * lesson with no cap. Blowing the cap can only add, never lower the score, and order never matters.»). Each pinned a
 * reading the ruling supersedes — a task-cap bill absorbing, or absorbed by, a weather, bend or SPEEDING_* bill, the kin
 * ledger's owners, lapses, surfaced cards and hand-overs, one bill per M-16 act — or read the state that carried them.
 * Their titles are in the round-14 hand-off log (`scratchpad/cap/r14/retired.txt`); what replaced them is the two-ledger
 * property (`rules/__tests__/taskCapTwoLedgers.ts`, `task-cap-property-census`), the two-ledger reference
 * (`task-cap-two-sided-census`), the lesson censuses and `task-cap-round14`. The tests left here pin readings the ruling
 * keeps (the cap ledger's own rules, the stretch of ruling 2, the card copy).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { LessonSpec } from "../../contracts";
import type { SimTick, SimTickEvent } from "../../rules";
import { recordScAcBridgeIceDrive } from "../../traces/scAcBridgeIce";
import { recordScAcIceDrive } from "../../traces/scAcIce";
import { recordScMergeBusPulloutDrive } from "../../traces/scMergeBusPullout";
import { recordScPeParkedRowScanDrive } from "../../traces/scPeParkedRowScan";
import { recordScSigFlashAmberPedDrive } from "../../traces/scSigFlashAmberPed";
import { shownObjectiveCapKmh } from "../advisor";
import { applyTick, buildLessonResult, createLessonSession, finishSession, type LessonStepResult } from "../engine";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { ScenarioLevel } from "../scenario/types";
import type { LessonSessionState, TeachMoment } from "../types";
import { makeTick } from "./fixtures";

const TASK = "TASK_SPEED_CAP_EXCEEDED";
const COND = "SPEED_TOO_FAST_FOR_CONDITIONS";
const TASK_TITLE = "Скорост над тавана на задачата";
const ARRIVAL_COPY = "Мина точката на задачата с";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

const spec = (id: string) => {
  const s = SCENARIO_TEMPLATES.find((x) => x.id === id);
  if (s === undefined) throw new Error(`no template ${id}`);
  return s;
};
const districts = new Map<string, unknown>();
function district(id: string): unknown {
  if (!districts.has(id)) {
    districts.set(id, JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8")));
  }
  return districts.get(id);
}

// ---------------------------------------------------------------------------
// The round-5 verifier's attack harness (`verify5/probes/zz-v5-attack.test.ts`),
// kept: the real compiled lesson along its committed shadow route, every
// objective honoured except the target, whose speed the case chooses.
// ---------------------------------------------------------------------------

type Edge = { maxspeed: number; geometry: number[][] };
const edgeCache = new Map<string, Edge[]>();
function postedFn(districtId: string): (x: number, y: number) => number {
  if (!edgeCache.has(districtId)) {
    const d = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${districtId}.json`), "utf-8"));
    edgeCache.set(districtId, d.roads.edges);
  }
  const edges = edgeCache.get(districtId)!;
  return (x, y) => {
    let best = Infinity;
    let sp = 50;
    for (const e of edges)
      for (let i = 0; i + 1 < e.geometry.length; i++) {
        const a = e.geometry[i];
        const b = e.geometry[i + 1];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const L2 = dx * dx + dy * dy;
        const u = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2));
        const dd = Math.hypot(x - (a[0] + u * dx), y - (a[1] + u * dy));
        if (dd < best) {
          best = dd;
          sp = e.maxspeed;
        }
      }
    return sp;
  };
}
const shadowCache = new Map<string, Array<[number, number]> | null>();
function shadowPts(id: string): Array<[number, number]> | null {
  if (!shadowCache.has(id)) {
    const f = path.join(REPO_ROOT, "content", "traces", id, "shadow-correct.trace.json");
    if (!existsSync(f)) shadowCache.set(id, null);
    else {
      const samples = JSON.parse(readFileSync(f, "utf-8")).samples as Array<{ x: number; y: number }>;
      const out: Array<[number, number]> = [];
      for (const p of samples) {
        const l = out[out.length - 1];
        if (!l || Math.hypot(p.x - l[0], p.y - l[1]) > 0.3) out.push([p.x, p.y]);
      }
      shadowCache.set(id, out);
    }
  }
  return shadowCache.get(id)!;
}

interface Ctx {
  x: number;
  y: number;
  t: number;
  s: LessonSessionState;
}
/** Honour every objective except the target: under its cap near its mark, stop on a halt mark, else 25. */
function lawful(c: Ctx): number {
  const cur = c.s.objectives[c.s.currentObjectiveIndex];
  const p = cur?.params as { kind?: string; x?: number; y?: number; radiusM?: number; maxSpeedKmh?: number } | undefined;
  if (!p || p.kind !== "reachZone" || p.x === undefined || p.y === undefined) return 25;
  const dist = Math.hypot(c.x - p.x, c.y - p.y);
  if (p.maxSpeedKmh !== undefined && p.maxSpeedKmh <= 8) return dist <= (p.radiusM ?? 4) * 0.5 ? 0 : dist < 25 ? 8 : 25;
  if (p.maxSpeedKmh !== undefined) return dist < (p.radiusM ?? 5) + 40 ? Math.min(25, p.maxSpeedKmh - 3) : 25;
  return 25;
}

interface Drive {
  blownAt: number | null;
  /**
   * On the frame the lesson latched the target's blow: was the cap GRADED there
   * (the figure the student read strictly under the posted limit)? Where it is
   * not, the sign is the stricter ceiling and SPEEDING_* grades the arrival
   * (`lessons/engine.ts stepTaskCapLatch`, «strictly UNDER the posted limit»,
   * since round 2) — the arrival bill's own condition, read independently.
   */
  gradedAtLatch?: boolean;
  /** TASK rows the student was SHOWN without a charge (card or toast). */
  coachedTask: Array<{ t: number }>;
  /** TASK events that reached the scored ledger. */
  chargedTask: Array<{ t: number; regrade: boolean }>;
  /** Every card and toast text for the TASK code. */
  taskText: string[];
  breaches: number;
  teach: TeachMoment[];
  hud: LessonStepResult["hudEvents"];
  ended: LessonSessionState;
}

function summarize(ended: LessonSessionState, teach: TeachMoment[], hud: LessonStepResult["hudEvents"], blownAt: number | null): Drive {
  const res = buildLessonResult(ended);
  return {
    blownAt,
    coachedTask: (ended.coachedMistakes ?? []).filter((c) => c.code === TASK).map((c) => ({ t: c.t })),
    chargedTask: ended.events
      .filter((e) => e.kind === "violation" && e.code === TASK)
      .map((e) => ({ t: e.t, regrade: (e as { regrade?: boolean }).regrade === true })),
    taskText: [
      ...teach.filter((m) => m.code === TASK).map((m) => m.explanationBg),
      ...hud.filter((h) => (h.kind === "lesson" || h.kind === "violation") && h.titleBg === TASK_TITLE).map((h) => (h as { explanationBg: string }).explanationBg),
    ],
    breaches: (res.taskCapBreaches ?? []).length,
    teach,
    hud,
    ended,
  };
}

/**
 * Drive `lesson` along its shadow; the target objective `k` (by index) gets
 * `speedAtTarget`, every other objective `lawful`. The accel/decel defaults are
 * the verifier's (20 m/s², so a profile's speed is reached at once).
 */
function shadowDrive(
  id: string,
  lv: ScenarioLevel,
  k: number | ((s: LessonSessionState) => boolean),
  speedAtTarget: (c: Ctx & { blownAt: number | null }) => number,
  o: { accel?: number; decel?: number; maxT?: number } = {},
): Drive {
  const sp = spec(id);
  const lesson = compileScenario(sp, lv);
  const pts = shadowPts(id)!;
  const posted = postedFn(sp.map.districtId);
  let s = createLessonSession(lesson);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1];
  const at = (d: number): [number, number, number] => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const f = (d - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
    return [
      pts[i - 1][0] + f * (pts[i][0] - pts[i - 1][0]),
      pts[i - 1][1] + f * (pts[i][1] - pts[i - 1][1]),
      (Math.atan2(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) * 180) / Math.PI,
    ];
  };
  const isTarget = typeof k === "number" ? (st: LessonSessionState) => st.currentObjectiveIndex === k : k;
  const targetIdx = (): number => (typeof k === "number" ? k : s.currentObjectiveIndex);
  let d = 0;
  let v = 0;
  let t = 0;
  let blownAt: number | null = null;
  let targetK: number | null = typeof k === "number" ? k : null;
  let gradedAtLatch: boolean | undefined;
  const teach: TeachMoment[] = [];
  const hud: LessonStepResult["hudEvents"] = [];
  while (d < total && t < (o.maxT ?? 300) && s.phase === "driving") {
    t = Math.round((t + 0.1) * 100) / 100;
    const [x0, y0] = at(d);
    const onTarget = isTarget(s);
    if (onTarget && targetK === null) targetK = s.currentObjectiveIndex;
    const target = (onTarget ? speedAtTarget({ x: x0, y: y0, t, s, blownAt }) : lawful({ x: x0, y: y0, t, s })) / 3.6;
    const acc = o.accel ?? 20;
    const dec = o.decel ?? 20;
    v = v < target ? Math.min(target, v + acc * 0.1) : Math.max(target, v - dec * 0.1);
    d = Math.min(total, d + v * 0.1);
    const [x, y, h] = at(d);
    const hadLatch = s.taskCapLatch?.blownAtSec;
    const tick = makeTick({ t, speedKmh: v * 3.6, maxSpeedKmh: posted(x, y), position: { x, y }, headingDeg: h });
    const r = applyTick(s, tick);
    s = r.state;
    teach.push(...(r.teachMoments ?? []));
    hud.push(...r.hudEvents);
    const tk = targetK ?? targetIdx();
    const la = s.taskCapLatch;
    if (gradedAtLatch === undefined && la !== undefined && la.objectiveIndex === tk && la.blownAtSec !== hadLatch) {
      const o = s.objectives[tk];
      const cap = (o.params as { maxSpeedKmh?: number }).maxSpeedKmh as number;
      gradedAtLatch = shownObjectiveCapKmh(o.spec, cap, lesson.postedLimitKmh) < tick.maxSpeedKmh;
    }
    const st = s.evalStates[tk] as { approachCap?: string } | undefined;
    if (blownAt === null && st?.approachCap === "blown") blownAt = t;
  }
  const ended = s.phase !== "driving" ? s : finishSession(s, t);
  return { ...summarize(ended, teach, hud, blownAt), gradedAtLatch };
}
const byId = (objectiveId: string) => (s: LessonSessionState) =>
  s.objectives[s.currentObjectiveIndex]?.spec.id === objectiveId;

// ---------------------------------------------------------------------------
// A · Ruling 4 on EVERY capped objective
// ---------------------------------------------------------------------------

/** The founder's 61 — the capped objectives ruling 2 left unbillable (round-4 verifier F5; `cap/r5/verifier-61.json`, `never`). */
const FOUNDERS_61 = [
  "sc-p45-position", "sc-ppx-out", "sc-za-approach", "sc-jrhr-approach", "sc-jstop-approach", "sc-sig-approach",
  "sc-jscan-approach", "sc-jgap-approach", "sc-jblind-approach", "sc-jleft-approach", "sc-sdead-approach",
  "sc-sflash-approach", "sc-shes-approach", "sc-sctrl-approach", "sc-clp-approach", "sc-scr-approach",
  "sc-crs-approach", "sc-drt-approach", "sc-bsh-approach", "sc-cbl-approach", "sc-wcn-approach", "sc-jay-approach",
  "sc-rn-adapted", "sc-rn-finish", "sc-ftg-ease", "sc-ovow-mouth", "sc-ovc-approach", "sc-ovb-patience",
  "sc-mwe-pass", "sc-ova-abort", "sc-vu-approach", "sc-vuej-approach", "sc-vup-pass", "sc-acr-lit",
  "sc-acw-approach", "sc-acf-adapted", "sc-acs-approach", "sc-obs-approach", "sc-rxti-approach",
  "sc-jxeq-approach", "sc-sfap-approach", "sc-sctl-read", "sc-sctp-read", "sc-ovn-wait", "sc-ovbo-hold",
  "sc-lnom-round", "sc-pnu-approach", "sc-pzl-exit", "sc-prs-row", "sc-prs-approach", "sc-rbg-past-east",
  "sc-mgb-ease", "sc-edsa-planned-approach", "sc-vubs-let-pass", "sc-vbl-approach", "sc-rts-approach",
  "sc-acbi-deck", "sc-acw-pass", "sc-hzbp-approach", "sc-ecoc-coast", "sc-lndc-wait",
];

interface CensusRow {
  id: string;
  lv: number;
  obj: string;
  prof: "p20" | "hold" | "lawful";
  d: Drive;
}
/**
 * Every capped flow objective (cap above the halt band) of every practice rung
 * of every template with a committed shadow, three ways: cap + 20 through the
 * mark until the evaluator blows it (`p20`), cap + 20 held for 12 s after the
 * blow (`hold`), and lawful (`lawful`).
 */
function census(): CensusRow[] {
  const rows: CensusRow[] = [];
  for (const sp of SCENARIO_TEMPLATES) {
    if (shadowPts(sp.id) === null) continue;
    for (const lvObj of sp.levels) {
      const lv = lvObj.level as ScenarioLevel;
      const lesson: LessonSpec = compileScenario(sp, lv);
      if (lesson.examMode) continue;
      lesson.objectives.forEach((o, k) => {
        const cap = (o.params as { maxSpeedKmh?: number }).maxSpeedKmh;
        if (o.kind !== "reachZone" || cap === undefined || cap <= 8) return;
        for (const prof of ["p20", "hold", "lawful"] as const) {
          const d = shadowDrive(
            sp.id,
            lv,
            k,
            (c) => {
              if (prof === "lawful") return lawful(c);
              if (prof === "hold") return c.blownAt === null || c.t - c.blownAt <= 12 ? cap + 20 : lawful(c);
              return c.blownAt === null ? cap + 20 : lawful(c);
            },
          );
          rows.push({ id: sp.id, lv, obj: o.id, prof, d });
        }
      });
    }
  }
  return rows;
}

describe("A · ruling 4 — the arrival is billed at EVERY blown cap (the integrator's reading)", () => {
  const rows = census();
  const blown = (r: CensusRow) => r.d.blownAt !== null && r.d.gradedAtLatch === true;

  it("every capped objective of every practice rung, blown at a graded cap: EXACTLY ONE TASK bill, taught with the arrival copy — named features included", () => {
    const p20 = rows.filter((r) => r.prof === "p20" && blown(r));
    // Not vacuous: 329 blown-at-a-graded-cap rows on the committed content.
    expect(p20.length).toBeGreaterThanOrEqual(320);
    const bad = p20.filter(
      (r) =>
        r.d.coachedTask.length !== 1 ||
        r.d.chargedTask.length !== 0 ||
        !r.d.taskText.some((x) => x.startsWith(ARRIVAL_COPY)) ||
        // …and the bill lands AT the blow (the arrival), not seconds later.
        Math.abs(r.d.coachedTask[0].t - (r.d.blownAt as number)) > 0.25,
    );
    expect(bad.map((r) => `${r.id}|L${r.lv}|${r.obj} coached=${r.d.coachedTask.length} charged=${r.d.chargedTask.length}`)).toEqual([]);
  });

  // ROUND 7: a blow where the sign is not above the cap is billed too now — as ONE act
  // with the speeding the car is in (`task-cap-round7.test.ts`, «THE SIGN-BOUND
  // ARRIVAL»). On these rows the speeding has already billed that act at cap + 20,
  // so the arrival is absorbed into it and no TASK bill lands at the blow.
  it("GUARD — a mark blown where the sign is NOT above the cap (the sign is the stricter ceiling there), at cap + 20: the speeding already bills that act, the arrival is absorbed into it — no TASK bill at the blow", () => {
    const ungraded = rows.filter((r) => r.prof === "p20" && r.d.blownAt !== null && r.d.gradedAtLatch === false);
    // Not vacuous: sc-pzl-zone (the living zone posted 20) and sc-sple-hold-to-junction.
    expect(ungraded.length).toBeGreaterThan(0);
    const near = (t: number, b: number) => t >= b - 0.01 && t <= b + 0.25;
    const bad = ungraded.filter(
      (r) =>
        r.d.coachedTask.some((c) => near(c.t, r.d.blownAt as number)) ||
        r.d.chargedTask.some((c) => near(c.t, r.d.blownAt as number)),
    );
    expect(bad.map((r) => `${r.id}|L${r.lv}|${r.obj}`)).toEqual([]);
  });

  it("the founder's 61, each blown at L3: every one produces a TASK card (round-5 verifier F1 — the four short features and sc-prs-row included)", () => {
    const got = new Map<string, CensusRow>();
    for (const r of rows) if (r.prof === "p20" && r.lv === 3 && blown(r) && FOUNDERS_61.includes(r.obj)) got.set(r.obj, r);
    expect([...got.keys()].sort()).toEqual([...FOUNDERS_61].sort());
    const unbilled = [...got.values()].filter((r) => r.d.coachedTask.length + r.d.chargedTask.length !== 1).map((r) => r.obj);
    expect(unbilled).toEqual([]);
  });

  it("held over the cap for 12 s after the blow, on every row: ONE TASK card, never a second first bill, and any charge is the act's one re-grade", () => {
    const hold = rows.filter((r) => r.prof === "hold" && blown(r));
    expect(hold.length).toBeGreaterThanOrEqual(320);
    const bad = hold.filter(
      (r) =>
        r.d.coachedTask.length !== 1 ||
        r.d.chargedTask.length > 1 ||
        r.d.chargedTask.some((c) => !c.regrade),
    );
    expect(bad.map((r) => `${r.id}|L${r.lv}|${r.obj} coached=${r.d.coachedTask.length} charged=${JSON.stringify(r.d.chargedTask)}`)).toEqual([]);
    // …and the long named features DO reach their charge: the ruling-2 half
    // still grades a breach held along the feature.
    expect(hold.filter((r) => r.d.chargedTask.length === 1).length).toBeGreaterThan(0);
  });

  it("GUARD — a lawful drive (under every cap near its mark) blows nothing and bills nothing, on every row", () => {
    const law = rows.filter((r) => r.prof === "lawful");
    expect(law.length).toBeGreaterThanOrEqual(500);
    const bad = law.filter((r) => r.d.blownAt !== null || r.d.breaches > 0 || r.d.coachedTask.length + r.d.chargedTask.length > 0);
    expect(bad.map((r) => `${r.id}|L${r.lv}|${r.obj}`)).toEqual([]);
  });
});

describe("A · the round-5 verifier's F1 and F2, ported verbatim (its harness, its speeds)", () => {
  const cases: Array<[string, string, string, number[]]> = [
    // F1 — the four short named features the round-5 report left as a founder question.
    ["acbi-deck", "sc-ac-bridge-ice", "sc-acbi-deck", [36, 40, 45]],
    ["ovb-patience", "sc-ov-ban-overtake", "sc-ovb-patience", [41, 45]],
    ["lnom-round", "sc-ln-obstacle-meeting", "sc-lnom-round", [36, 40]],
    ["rbg-past-east", "sc-rb-busy-gap", "sc-rbg-past-east", [30, 35]],
    // F2 — sc-prs-row held along the row; 50 is the demo mistake's speed.
    ["prs-row held", "sc-pe-parked-row-scan", "sc-prs-row", [38, 39, 42, 45, 50]],
  ];
  for (const [label, id, obj, speeds] of cases) {
    for (const v of speeds) {
      it(`${label} at ${v} (L3): one TASK bill, with the arrival copy`, () => {
        const d = shadowDrive(id, 3, byId(obj), () => v);
        expect(d.blownAt).not.toBeNull();
        expect(d.breaches).toBeGreaterThanOrEqual(1);
        expect(d.coachedTask.length + d.chargedTask.length).toBe(1);
        expect(d.taskText.some((x) => x.startsWith(ARRIVAL_COPY))).toBe(true);
      });
    }
  }
  it("prs-row blown at 45 then 30 (L3): one TASK bill", () => {
    const d = shadowDrive("sc-pe-parked-row-scan", 3, byId("sc-prs-row"), (c) => (c.y < 38 ? 45 : 30));
    expect(d.coachedTask.length + d.chargedTask.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// A · One act, one bill on a LONG named feature: sc-ac-truck-spray, the ≤80
// curtain from the mark at y 450 to the next goal at y 860 (posted 140).
// ---------------------------------------------------------------------------

interface RoadOpts {
  lv: ScenarioLevel;
  /** Target speed; `blown` is true from the frame after the evaluator blew the mark. */
  speed: (c: { y: number; t: number; blown: boolean; sinceBlow: number }) => number;
  posted?: (c: { y: number; t: number; sinceBlow: number }) => number;
  rain?: boolean;
  seatbeltOffFrom?: number;
  /** Events for the frame; return them ONCE (the harness does not dedupe). */
  events?: (c: { y: number; t: number; sinceBlow: number; frame: number }) => SimTickEvent[];
  accel?: number;
  decel?: number;
  endY?: number;
}
function spray(o: RoadOpts): Drive & { blowFrameT: number | null } {
  const lesson = compileScenario(spec("sc-ac-truck-spray"), o.lv);
  let s = createLessonSession(lesson);
  let y = 15;
  let v = 0;
  let t = 0;
  let blownAt: number | null = null;
  let frame = 0;
  const teach: TeachMoment[] = [];
  const hud: LessonStepResult["hudEvents"] = [];
  while (s.phase === "driving" && y < (o.endY ?? 900) && t < 200) {
    t = Math.round((t + 0.1) * 10) / 10;
    frame++;
    const sinceBlow = blownAt === null ? -1 : t - blownAt;
    const target = o.speed({ y, t, blown: blownAt !== null, sinceBlow }) / 3.6;
    const acc = o.accel ?? 6;
    const dec = o.decel ?? 1000;
    v = v < target ? Math.min(target, v + acc * 0.1) : Math.max(target, v - dec * 0.1);
    y += v * 0.1;
    const tick: SimTick = makeTick({
      t,
      speedKmh: v * 3.6,
      maxSpeedKmh: o.posted?.({ y, t, sinceBlow }) ?? 140,
      position: { x: 0, y },
      headingDeg: 0,
      rain: o.rain === true,
      seatbeltOn: !(o.seatbeltOffFrom !== undefined && t >= o.seatbeltOffFrom),
      events: o.events?.({ y, t, sinceBlow, frame }) ?? [],
    });
    const r = applyTick(s, tick);
    s = r.state;
    teach.push(...(r.teachMoments ?? []));
    hud.push(...r.hudEvents);
    const st = s.evalStates[0] as { approachCap?: string } | undefined;
    if (blownAt === null && st?.approachCap === "blown") blownAt = t;
  }
  const ended = s.phase !== "driving" ? s : finishSession(s, t);
  return { ...summarize(ended, teach, hud, blownAt), blowFrameT: blownAt };
}

describe("A · one act, one bill on a long named feature (the spray curtain, ≤80, L3)", () => {
  it("116 through the mark and 110 held over the curtain: ONE card at the blow (the arrival copy, 116), then the act's ONE charge at its re-grade — never a second card", () => {
    const d = spray({ lv: 3, speed: (c) => (c.y < 800 ? (c.blown ? 110 : 116) : 78) });
    expect(d.blownAt).not.toBeNull();
    expect(d.coachedTask.length).toBe(1);
    expect(Math.abs(d.coachedTask[0].t - (d.blownAt as number))).toBeLessThanOrEqual(0.15);
    expect(d.taskText[0]).toMatch(/^Мина точката на задачата с 116 км\/ч при таван на задачата 80 км\/ч/u);
    expect(d.chargedTask).toHaveLength(1);
    expect(d.chargedTask[0].regrade).toBe(true);
    expect(d.chargedTask[0].t).toBeGreaterThan((d.blownAt as number) + 8);
  });

  it("the frame after the blow already in the grace band (83, never over the bill line on a stamped frame), then 100 for 5 s: ONE card, no charge", () => {
    const d = spray({
      lv: 3,
      speed: (c) => (!c.blown ? 116 : c.sinceBlow < 2 ? 83 : c.sinceBlow < 7 ? 100 : 78),
    });
    expect(d.coachedTask.length + d.chargedTask.length).toBe(1);
    expect(d.coachedTask.length).toBe(1);
    expect(d.taskText[0]).toMatch(new RegExp(`^${ARRIVAL_COPY}`, "u"));
  });

  it("PIN — a correction HELD (75 for 6 s) and then 100 for 5 s on the same curtain: still ONE act — one card, no charge", () => {
    const d = spray({
      lv: 3,
      speed: (c) => (!c.blown ? 116 : c.sinceBlow < 6 ? 75 : c.sinceBlow < 11 ? 100 : 78),
    });
    expect(d.coachedTask.length + d.chargedTask.length).toBe(1);
    expect(d.coachedTask.length).toBe(1);
  });

  it("PIN — …and a charge already landed stays the act's only one: 110 held 12 s, 75 for 6 s, 110 for 12 s again — one card, ONE charge", () => {
    const d = spray({
      lv: 3,
      speed: (c) => (!c.blown ? 116 : c.sinceBlow < 12 ? 110 : c.sinceBlow < 18 ? 75 : c.sinceBlow < 30 ? 110 : 78),
      endY: 1000,
    });
    expect(d.coachedTask.length).toBe(1);
    expect(d.chargedTask).toHaveLength(1);
  });

  it("PIN — a stretch where the sign is not above the cap (posted 80 for 6 s — the task is not graded there) and then 100 on the curtain again: ONE TASK bill", () => {
    const d = spray({
      lv: 3,
      speed: (c) => (!c.blown ? 116 : c.sinceBlow < 12 ? 100 : 78),
      posted: (c) => (c.sinceBlow >= 1 && c.sinceBlow < 7 ? 80 : 140),
    });
    expect(d.coachedTask.length + d.chargedTask.length).toBe(1);
    expect(d.coachedTask.length).toBe(1);
  });

  it("the card prints the speed the mark was passed at to the tenth: 116.4 → «с 116,4 км/ч»", () => {
    const d = spray({ lv: 3, speed: (c) => (c.y < 800 ? 116.4 : 78) });
    expect(d.taskText[0]).toMatch(/^Мина точката на задачата с 116,4 км\/ч при таван на задачата 80 км\/ч/u);
  });

  it("GUARD — a correct leg: 78 through the mark and along the curtain blows nothing and bills nothing", () => {
    const d = spray({ lv: 3, speed: () => 78 });
    expect(d.blownAt).toBeNull();
    expect(d.breaches).toBe(0);
    expect(d.coachedTask.length + d.chargedTask.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// C · The teach-pause slot (round-5 verifier F5)
// ---------------------------------------------------------------------------

type Recorder = (district: unknown, name: string, extra: { onTick: (t: SimTick) => void }) => unknown;
function recordedL1(id: string, rec: Recorder, name: string): { teach: TeachMoment[]; ended: LessonSessionState } {
  const sp = spec(id);
  let s = createLessonSession(compileScenario(sp, 1));
  const teach: TeachMoment[] = [];
  rec(district(sp.map.districtId), name, {
    onTick: (tick) => {
      if (s.phase !== "driving" && s.phase !== "preDrive") return;
      const r = applyTick(s, tick);
      s = r.state;
      teach.push(...(r.teachMoments ?? []));
    },
  });
  return { teach, ended: s };
}

describe("C · on L1 a lower-class teach card never takes the pause slot from a later dangerous, charged fault", () => {
  // The five legs the round-5 verifier named, with the dangerous card base paused.
  const LEGS: Array<[string, Recorder, string, string, number]> = [
    ["sc-sig-flash-amber-ped", recordScSigFlashAmberPedDrive as unknown as Recorder, "mistake-hot-approach", "PEDESTRIAN_CROSSING_TOO_FAST", 12.18],
    ["sc-pe-parked-row-scan", recordScPeParkedRowScanDrive as unknown as Recorder, "mistake-fast-row", "PEDESTRIAN_CROSSING_TOO_FAST", 7.53],
    ["sc-merge-bus-pullout", recordScMergeBusPulloutDrive as unknown as Recorder, "mistake-force-past", "COLLISION", 16.32],
    ["sc-ac-ice", recordScAcIceDrive as unknown as Recorder, "mistake-brake-on-ice", "COLLISION", 23.08],
    ["sc-ac-bridge-ice", recordScAcBridgeIceDrive as unknown as Recorder, "mistake-brake-on-deck", "COLLISION", 23.3],
  ];
  for (const [id, rec, name, code, t] of LEGS) {
    it(`${id} L1 ${name}: the ${code} card at ${t} s PAUSES (charged), and the TASK card is still shown`, () => {
      const { teach, ended } = recordedL1(id, rec, name);
      const danger = teach.filter((m) => m.code === code && Math.abs(m.t - t) < 0.06);
      expect(danger).toHaveLength(1);
      expect(danger[0].charged).toBe(true);
      if (id === "sc-pe-parked-row-scan") {
        // The collision 0.6 s after the pedestrian card keeps its TOAST, as on
        // base: the pedestrian pause was heavy, and the lesson's own first card
        // that pauses 0.04 s after it (ADR-009, a lower card) does not re-open
        // the slot.
        expect(teach.filter((m) => m.code === "COLLISION")).toEqual([]);
      }
      // The TASK bill is still taught — as the pause it took or its toast.
      expect((ended.coachedMistakes ?? []).filter((c) => c.code === TASK)).toHaveLength(1);
    });
  }

  const RED: SimTickEvent[] = [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "red" }];
  /** A red-light crossing on the FIRST frame `when` holds, and never again. */
  const redOnce = (when: (c: { y: number; t: number; sinceBlow: number }) => boolean) => {
    let fired = false;
    return (c: { y: number; t: number; sinceBlow: number }): SimTickEvent[] => {
      if (fired || !when(c)) return [];
      fired = true;
      return RED;
    };
  };
  const blowAt116 = (c: { blown: boolean; y: number }) => (c.y > 700 ? 78 : c.blown ? 100 : 116);

  it("synthetic (spray L1): the TASK arrival card pauses at the blow, a red light 2 s later still PAUSES (charged)", () => {
    const d = spray({
      lv: 1,
      speed: blowAt116,
      events: redOnce((c) => c.sinceBlow >= 2),
    });
    const task = d.teach.filter((m) => m.code === TASK);
    const red = d.teach.filter((m) => m.code === "RED_LIGHT_CROSSED");
    expect(task).toHaveLength(1);
    expect(red).toHaveLength(1);
    expect(red[0].charged).toBe(true);
    expect(red[0].t - task[0].t).toBeGreaterThan(1.5);
  });

  it("GUARD — the exemption is for LOWER-class cards only: an основна teach (the belt) 2 s before a red light keeps the slot, and the red light is a toast", () => {
    // Pass 1 finds when the belt card lands; pass 2 crosses a red light 2 s later.
    const run = (red?: number) =>
      spray({
        lv: 1,
        speed: () => 60,
        seatbeltOffFrom: 2,
        endY: 400,
        events: red === undefined ? undefined : redOnce((c) => c.t >= red),
      });
    const belt = run().teach.find((m) => m.code === "SEATBELT_OFF_WHILE_MOVING");
    expect(belt).toBeDefined();
    const d = run(Math.round(((belt as TeachMoment).t + 2) * 10) / 10);
    expect(d.teach.filter((m) => m.code === "SEATBELT_OFF_WHILE_MOVING")).toHaveLength(1);
    expect(d.teach.filter((m) => m.code === "RED_LIGHT_CROSSED")).toHaveLength(0);
    expect(d.ended.events.some((e) => e.kind === "violation" && e.code === "RED_LIGHT_CROSSED")).toBe(true);
  });

  it("the same frame: the TASK arrival and a red light merge into one pause, the dangerous card FIRST (the reducer bills tick events before the kin ledger, so this frame arrives in that order)", () => {
    const second = redOnce((c) => c.sinceBlow >= 3);
    const first = redOnce((c) => c.sinceBlow > 0.05);
    const d = spray({
      lv: 1,
      speed: blowAt116,
      // The arrival is billed on the frame AFTER the evaluator's blow; a second
      // red light 3 s later finds the slot closed by the charged card.
      events: (c) => [...first(c), ...second(c)],
    });
    const i = d.teach.findIndex((m) => m.code === "RED_LIGHT_CROSSED");
    const j = d.teach.findIndex((m) => m.code === TASK);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(j).toBeGreaterThanOrEqual(0);
    expect(d.teach[i].t).toBe(d.teach[j].t);
    expect(i).toBeLessThan(j);
    // The merged pause held a charged card, so it is not a lower-class pause:
    // the second red light, 3 s later, is a toast.
    expect(d.teach.filter((m) => m.code === "RED_LIGHT_CROSSED")).toHaveLength(1);
    expect(d.ended.events.filter((e) => e.kind === "violation" && e.code === "RED_LIGHT_CROSSED")).toHaveLength(2);
  });

  it("the same frame, in the order the reducer EMITS it (the task before the crossing): the dangerous crossing card is queued FIRST — the lower card yields", () => {
    // The red-light case above is already in that order when it lands: tick
    // events (red light, collision) are billed early in `reduceTick`, before the
    // kin ledger. PEDESTRIAN_CROSSING_TOO_FAST (опасна, always charged) is billed
    // AFTER it, so on a frame where both land the lesson receives the task's
    // arrival first — the frame `orderTeachMoments` exists for (without it the
    // lower card would open the pause: mutant C5, `scratchpad/cap/r6f/`).
    // Pass 1 finds the blow; pass 2 enters a crossing with a pedestrian on it
    // exactly 1 s (crossingTooFastSustainSec) before the arrival frame, at a
    // constant 116 — so the crossing fault falls due on the arrival's frame.
    const speed = (c: { y: number; blown: boolean; sinceBlow: number }) =>
      c.y > 700 ? 78 : !c.blown || c.sinceBlow < 1.5 ? 116 : 100;
    const probe = spray({ lv: 1, speed });
    expect(probe.blowFrameT).not.toBeNull();
    const arrivalT = Math.round(((probe.blowFrameT as number) + 0.1) * 10) / 10;
    const enterT = Math.round((arrivalT - 1) * 10) / 10;
    let entered = false;
    const d = spray({
      lv: 1,
      speed,
      events: (c) => {
        if (entered || Math.abs(c.t - enterT) > 0.01) return [];
        entered = true;
        return [{ kind: "crossingZoneEntered", crossingId: "r6-x", pedestrianOnCrossing: true }];
      },
    });
    expect(entered).toBe(true);
    expect(d.blowFrameT).toBe(probe.blowFrameT);
    const i = d.teach.findIndex((m) => m.code === "PEDESTRIAN_CROSSING_TOO_FAST");
    const j = d.teach.findIndex((m) => m.code === TASK);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(j).toBeGreaterThanOrEqual(0);
    expect(d.teach[i].t).toBe(arrivalT);
    expect(d.teach[j].t).toBe(arrivalT);
    expect(d.teach[i].charged).toBe(true);
    expect(d.teach[j].charged).not.toBe(true);
    expect(i).toBeLessThan(j);
  });
});
