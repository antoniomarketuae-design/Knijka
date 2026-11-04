/**
 * THE BRAKE CHECK THE LEDGER SAW AND DID NOT BILL, THROUGH THE LIVE RUNG CHAIN
 * (2026-11-01 · `sc-follow-tailgater:63c0c28c` [critical] and the QUESTION 10 /
 * B3 product owed by `e47a45c1`; founder QUESTIONS 4 and 10 as ruled
 * 2026-10-19 and delegated; the integrator's P1–P12). The reducer half is
 * `rules/__tests__/unbilled-brake-check.test.ts`.
 *
 * WHAT THE RIG PHOTOGRAPHED (rig-w3e, 65be020, PC and phone L3): PUMP245 — at
 * the лепка, glued 4.79 m behind, 24.43 км/ч on the speedometer, the pad's
 * brake 1.00 for 12 grid points, 0 for 6, 1.00 to rest. No bill — rightly: no
 * burst held the CONTINUOUS 0.4 s at emergency grade (QUESTION 4). But
 * «ИЗДЪРЖАН» ★★★, «Похвали ✓ Чисто и спокойно каране 0:38», «…Точно това иска
 * да види изпитващият.» and «Какво се получи добре: • Чисто и спокойно каране».
 *
 * BASE, ESTABLISHED ON THE EN TREE (230c7b8) BY THIS FILE'S FIRST RUN, through
 * the rig's own per-grid-point poses (`follow-tailgater-rig-w3e.fixture.json`):
 * L3 and L4, the PC grid and the phone's own frame cadence — no violation, the
 * student's ledger 0.200 s then 0.300 s of credit (anchor 26.333 onset 23.87,
 * released 26.567; anchor 26.633 onset 17.17, re-anchored 27.217, released
 * 27.383), no floored frame, no follower report, the route completed, and
 * CLEAN_DRIVING at 38.550 s (PC) / 40.333 s (phone) with the headline and the
 * bullet above. TASF348 (pc + phone L1, the pass already under way — ADR-016
 * Update E2 (i)) FLOORED at base: 52 floored grid points from 34.16 км/ч, no
 * praise (brakeledger), and «…задръж това ниво.» — P9 is therefore in force.
 *
 * NOW: the pump is ONE pumped record, the floored stop ONE floored record; no
 * CLEAN_DRIVING is minted from a window holding either; the debrief NAMES the
 * brake once with the catalogue's own why / right action / rule, reserves the
 * headline and prints neither «Какво се получи добре» fallback. No bill, point,
 * verdict, star or objective moves.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveLawRef } from "@/lib/content/law";
import { compileScenario } from "../compile";
import { SC_FOLLOW_TAILGATER } from "../templates-following";
import { SC_SP_HARSH_BRAKE } from "../templates-sp";
import type { ScenarioLevel } from "../types";
import { liveChainReplay, type LiveReplayOutcome } from "./liveChainReplay";
import { stabTape } from "./brakeLedgerTapes";
import { DEFAULT_RULE_CONFIG, VIOLATIONS, parseRuleLawRef } from "../../../rules";
import type { LessonSpec, StagedEventSpec } from "../../../contracts";
import type { ScenarioTrace, TraceSample } from "../../../traces/types";
import { recordScriptedDrive, type DriveScript } from "../../../traces/recorder";
import { abortSession, buildLessonResult } from "../../engine";
import { buildDebrief } from "../../debrief";
import type { LessonResult } from "../../types";

const REPO_ROOT = path.join(process.cwd(), "..");
const LN = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", "ln-v1.json"), "utf-8"));
const SP = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", "sp-creep-v1.json"), "utf-8"));
const RIG = JSON.parse(readFileSync(path.join(__dirname, "follow-tailgater-rig-w3e.fixture.json"), "utf-8")) as {
  drives: Record<
    string,
    {
      level: number;
      rows: number[][];
      looks: Array<{ t: number; kind: string }>;
      phoneFrames?: number[];
      rigRuleEvents: Array<{ t: number; kind: string; code: string | null }>;
    }
  >;
};
const CFG = DEFAULT_RULE_CONFIG;
const CLEAN = "Чисто и спокойно каране";
const SUPERLATIVE = "Точно това иска да види изпитващият.";
/** The task-cap tests' own regex for unscoped praise (task-cap-photographed and its rounds). */
const UNSCOPED_PRAISE = /чисто каране без нито едно нарушение|задръж това ниво|чисто каране по изпитния лист|карането беше чисто по изпитния лист/u;
const HEADING_ONE = "Рязко спиране, което не влезе в точките:";
const TITLE = VIOLATIONS.HARSH_BRAKING_NO_CAUSE.titleBg;
const RESERVATION = "имаше рязко спиране, за което симулаторът не видя причина — то не влезе в точките";
const TRIPLET = [
  `  → Защо е важно: ${VIOLATIONS.HARSH_BRAKING_NO_CAUSE.peekBg}`,
  `  → Правилното действие: ${VIOLATIONS.HARSH_BRAKING_NO_CAUSE.correctiveBg}`,
  `  → Правило: ${VIOLATIONS.HARSH_BRAKING_NO_CAUSE.lawRef}`,
];
const TIMEOUT = 900_000;

/** The rig drive as a pose tape: at rest on the spawn at t 0, then the rig's own grid points. */
function rigTape(cell: string): ScenarioTrace {
  const d = RIG.drives[cell]!;
  const at = (r: number[], t: number, v: number): TraceSample => ({
    tSec: t,
    x: r[1]!,
    y: r[2]!,
    headingDeg: r[3]!,
    steerRad: 0,
    speedKmh: v,
    gear: r[5]!,
    indicator: "off",
    brakeOn: false,
    throttleOn: false,
  });
  const samples: TraceSample[] = [at(d.rows[0]!, 0, 0)];
  for (const r of d.rows) if (r[0]! > samples[samples.length - 1]!.tSec + 1e-9) samples.push(at(r, r[0]!, r[4]!));
  return {
    meta: { scenarioId: SC_FOLLOW_TAILGATER.id, kind: "attempt", version: 1, durationSec: samples[samples.length - 1]!.tSec },
    samples,
    events: d.looks.map((l) => ({ tSec: l.t, kind: l.kind as never })),
  };
}

interface Drive {
  out: LiveReplayOutcome;
  harsh: number[];
  floored: number[];
  pumped: number[];
  reports: number[];
  maxQ: number;
  /** The student's credit at each release of an application (the first is the first burst's). */
  qAtRelease: number[];
  clean: number[];
  debrief: string;
}

function replay(lesson: LessonSpec, raw: unknown, trace: ScenarioTrace, frameDeltas?: readonly number[]): Drive {
  const floored: number[] = [];
  const pumped: number[] = [];
  const reports: number[] = [];
  const qAtRelease: number[] = [];
  let maxQ = 0;
  let lastQ = 0;
  let open = false;
  const out = liveChainReplay({
    lesson,
    districtRaw: raw,
    trace,
    ...(frameDeltas ? { frameDeltas } : {}),
    afterApply: ({ t, tick, step }) => {
      for (const e of tick.events) if (e.kind === "followerBraked") reports.push(t);
      const hb = step.state.rules.harshBrake;
      if (hb.flooredAt === t) floored.push(t);
      if (hb.appPumpedAt === t) pumped.push(t);
      maxQ = Math.max(maxQ, hb.qualifiedSec);
      if (hb.appOpen) {
        open = true;
        lastQ = Math.max(lastQ, hb.qualifiedSec);
      } else if (open) {
        qAtRelease.push(lastQ);
        open = false;
        lastQ = 0;
      }
    },
  });
  return {
    out,
    harsh: [
      ...out.session.events
        .filter((e) => e.kind === "violation" && (e as { code: string }).code === "HARSH_BRAKING_NO_CAUSE")
        .map((e) => (e as { t: number }).t),
      ...(out.result.coachedMistakes ?? []).filter((c) => c.code === "HARSH_BRAKING_NO_CAUSE").map((c) => c.t),
    ],
    floored,
    pumped,
    reports,
    maxQ,
    qAtRelease,
    clean: out.session.events
      .filter((e) => e.kind === "commendation" && (e as { code: string }).code === "CLEAN_DRIVING")
      .map((e) => (e as { t: number }).t),
    debrief: out.debrief,
  };
}

function tailgater(L: ScenarioLevel, noFollower = false, ruleConfig?: LessonSpec["ruleConfig"]): LessonSpec {
  const lesson = compileScenario(SC_FOLLOW_TAILGATER, L);
  const staged = noFollower
    ? ((lesson.stagedEvents ?? []) as StagedEventSpec[]).filter((s) => s.kind !== "rearTailgater")
    : lesson.stagedEvents;
  return { ...lesson, stagedEvents: staged, ...(ruleConfig ? { ruleConfig: { ...lesson.ruleConfig, ...ruleConfig } } : {}) } as LessonSpec;
}

/** How many times `needle` occurs in `hay`. */
const count = (hay: string, needle: string) => hay.split(needle).length - 1;

/** The named block's bullets, in order. */
function namedBullets(debrief: string): string[] {
  return debrief.split("\n").filter((l) => l.startsWith(`• ${TITLE} — `));
}

/** Every assertion the named block owes on a drive carrying ONE record. */
function assertNamedOnce(d: Drive, form: "floored" | "pumped"): void {
  const recs = d.out.result.unbilledHardBrakes ?? [];
  expect(recs.map((r) => r.form)).toEqual([form]);
  expect(count(d.debrief, HEADING_ONE)).toBe(1);
  expect(namedBullets(d.debrief).length).toBe(1);
  for (const line of TRIPLET) expect(count(d.debrief, line)).toBe(1);
  // the catalogue's explanation is NOT printed (it says the examiners mark it — false of an unbilled brake)
  expect(d.debrief).not.toContain(VIOLATIONS.HARSH_BRAKING_NO_CAUSE.explanationBg);
  expect(d.debrief).not.toMatch(UNSCOPED_PRAISE);
  expect(d.debrief).not.toContain(SUPERLATIVE);
  expect(d.debrief).toContain(RESERVATION);
  // not inside «Учебни моменти», whose closing sentence is false for it
  const teach = d.debrief.indexOf("Учебни моменти");
  if (teach >= 0) expect(d.debrief.indexOf(HEADING_ONE)).toBeLessThan(teach);
}

// ─── FACT 1 — PUMP245 ─────────────────────────────────────────────────────────
describe("FACT 1 — rig-w3e PUMP245 (12 grid points full, 6 off, full to rest from 24.43 км/ч, the лепка glued)", () => {
  const CELLS: Array<{ cell: string; L: ScenarioLevel; cad: "grid" | "phone"; pump: [number, number]; baseClean: string }> = [];
  for (const L of [3, 4] as ScenarioLevel[]) {
    CELLS.push({ cell: "pc-L3-PUMP245", L, cad: "grid", pump: [26.85, 26.9167], baseClean: "38.550" });
    CELLS.push({ cell: "phone-L3-PUMP245", L, cad: "grid", pump: [28.6333, 28.7], baseClean: "40.333" });
    CELLS.push({ cell: "phone-L3-PUMP245", L, cad: "phone", pump: [28.6333, 28.7], baseClean: "40.333" });
  }
  for (const c of CELLS) {
    it(
      `${c.cell} L${c.L} (${c.cad} cadence): unbilled, ONE pumped record, no CLEAN_DRIVING over it, named «при 24 км/ч» with the rule, the headline reserved (base: CLEAN_DRIVING ${c.baseClean} s, «${SUPERLATIVE}»)`,
      () => {
        const d = replay(
          tailgater(c.L),
          LN,
          rigTape(c.cell),
          c.cad === "phone" ? RIG.drives[c.cell]!.phoneFrames!.map((n) => n / 60) : undefined,
        );
        // the ledger, as at base: nothing billed, the bursts each under the sustain
        expect(d.out.violationCodes).toEqual([]);
        expect(d.harsh).toEqual([]);
        expect(d.floored).toEqual([]);
        expect(d.reports).toEqual([]);
        expect(d.maxQ).toBeCloseTo(0.3, 9);
        expect(d.qAtRelease[0]).toBeCloseTo(0.2, 9);
        expect(d.out.result.completedAll).toBe(true);
        expect(d.out.session.phase).toBe("completed");
        expect(d.out.result.passed).toBe(true);
        expect(d.out.result.score).toBe(0);
        // pumped on the bursts' last qualifying frames
        expect(d.pumped.length).toBe(5);
        expect(d.pumped[0]).toBeCloseTo(c.pump[0], 3);
        expect(d.pumped[d.pumped.length - 1]).toBeCloseTo(c.pump[1], 3);
        // no praise whose 250 m holds the pump (the drive has no other 250 m)
        expect(d.clean).toEqual([]);
        expect(d.out.commendationCodes).not.toContain("CLEAN_DRIVING");
        // the record
        const rec = d.out.result.unbilledHardBrakes![0]!;
        expect(rec.form).toBe("pumped");
        expect(Math.floor(rec.shownKmh)).toBe(24);
        expect(rec.onsetKmh).toBeLessThan(CFG.harshBrakeMinSpeedKmh);
        expect(rec.sustainSec).toBe(CFG.harshBrakeSustainSec);
        expect(rec.floorKmh).toBe(CFG.harshBrakeMinSpeedKmh);
        // the debrief
        assertNamedOnce(d, "pumped");
        expect(d.debrief).not.toContain(CLEAN);
        expect(namedBullets(d.debrief)[0]).toBe(
          `• ${TITLE} — при 24 км/ч натисна спирачката рязко на тласъци, а симулаторът не видя пред теб причина за това. ` +
            "Нито един тласък поотделно не задържа рязкото спиране 0,4 s, затова никой от тях не се брои за рязко спиране — " +
            "но заедно те отнеха скоростта толкова рязко, колкото едно рязко спиране. Под 35 км/ч дори рязко спиране, " +
            "задържано 0,4 s, влиза в точките само ако симулаторът отчете, че кола точно зад теб е трябвало да спре рязко заради него.",
        );
        expect(d.debrief.split("\n")[0]).toBe(
          `Урокът „${d.out.lesson.titleBg}“ е издържан: 0 наказателни точки от изпитния лист при допустими 9. ` +
            `Но „издържан“ не значи „чисто“: ${RESERVATION}. Изпитващият гледа цялото каране, а не само дали запасът е ` +
            "стигнал — прочети рязкото спиране по-долу и повтори урока с него наум.",
        );
      },
      TIMEOUT,
    );
  }

  it("the rule chip is RETRIEVED and resolves in content/law (ЗДвП чл. 20, ал. 1)", () => {
    const lawRef = VIOLATIONS.HARSH_BRAKING_NO_CAUSE.lawRef;
    const parsed = parseRuleLawRef(lawRef);
    expect(parsed).not.toBeNull();
    const found = resolveLawRef({ act: parsed!.act, ref: parsed!.ref });
    expect(found.found).toBe(true);
    expect(lawRef).toBe("ЗДвП чл. 20, ал. 1");
    // and debrief.ts holds no law string of its own: the chip on the page is the catalogue's
    const src = readFileSync(path.join(__dirname, "..", "..", "debrief.ts"), "utf-8");
    expect(src).not.toMatch(/Правило: ЗДвП|"ЗДвП чл\. 2[04]/u);
  });
});

// ─── P9 — TASF348 ─────────────────────────────────────────────────────────────
describe("P9 — rig-w3e TASF348 (34.19 км/ч full pedal, the лепка's pass already under way, L1): floored at base, now NAMED, still unbilled", () => {
  for (const [cell, cad] of [
    ["pc-L1-TASF348", "grid"],
    ["phone-L1-TASF348", "grid"],
    ["phone-L1-TASF348", "phone"],
  ] as const) {
    it(`${cell} (${cad}): 52 floored grid points, onset 34.16, ONE floored record «при 34 км/ч», no fallback (base: «…задръж това ниво.»)`, () => {
      const d = replay(tailgater(1), LN, rigTape(cell), cad === "phone" ? RIG.drives[cell]!.phoneFrames!.map((n) => n / 60) : undefined);
      expect(d.out.violationCodes).toEqual([]);
      expect(d.harsh).toEqual([]);
      expect(d.reports).toEqual([]);
      expect(d.floored.length).toBe(52);
      expect(d.maxQ).toBeCloseTo(0.8167, 3);
      expect(d.clean).toEqual([]);
      expect(d.out.result.passed).toBe(true);
      expect(d.out.result.completedAll).toBe(true);
      const rec = d.out.result.unbilledHardBrakes![0]!;
      expect(rec.onsetKmh).toBeCloseTo(34.16, 1);
      assertNamedOnce(d, "floored");
      expect(namedBullets(d.debrief)[0]).toBe(
        `• ${TITLE} — при 34 км/ч натисна спирачката рязко, а симулаторът не видя пред теб причина за това. Под 35 км/ч ` +
          "симулаторът таксува такова спиране само ако отчете, че кола точно зад теб е трябвало да спре рязко заради него; " +
          "този път не отчете такава, затова то не влезе в точките.",
      );
    }, TIMEOUT);
  }
});

// ─── CONTROLS FROM THE RIG ────────────────────────────────────────────────────
describe("CONTROLS — the rig-w3e drives the floor-lift BILLS, and the careful drives, keep base to the frame", () => {
  for (const [cell, L, harshAt] of [
    ["pc-L3-TTF245-r1", 3, 26.5333],
    ["pc-L3-TTF245-r2", 3, 26.9667],
    ["phone-L3-TTF245-r1", 3, 28.5667],
    ["pc-L1-TPRE245", 1, 24.55],
    ["phone-L1-TPRE245", 1, 26.0],
    ["pc-L3-PROBE", 3, 21.2833],
    ["phone-L3-PROBE", 3, 21.8],
  ] as const) {
    it(`${cell}: billed on the report (${harshAt} s) — no record, no named block, no new reservation`, () => {
      const d = replay(tailgater(L), LN, rigTape(cell));
      expect(d.harsh.map((t) => t.toFixed(3))).toEqual([harshAt.toFixed(3)]);
      expect(d.out.result.unbilledHardBrakes).toBeUndefined();
      expect(d.debrief).not.toContain(HEADING_ONE);
      expect(d.debrief).not.toContain(RESERVATION);
      expect(d.debrief).not.toContain("рязкото спиране по-долу");
    }, TIMEOUT);
  }
  for (const [cell, L, clean] of [
    ["pc-L1-C", 1, "35.900"],
    ["pc-L3-CAL245", 3, "36.117"],
  ] as const) {
    it(`${cell}: no brake check — CLEAN_DRIVING at ${clean} s as at base, the superlative and the bullet unscoped`, () => {
      const d = replay(tailgater(L), LN, rigTape(cell));
      expect(d.clean.map((t) => t.toFixed(3))).toEqual([clean]);
      expect(d.out.result.unbilledHardBrakes).toBeUndefined();
      expect(d.debrief).toContain(SUPERLATIVE);
      expect(d.debrief).toContain(`Какво се получи добре:\n• ${CLEAN}`);
    }, TIMEOUT);
  }
});

// ─── THE FLOORED STOPS (brakeledger's drives) ──────────────────────────────────
const STEADY = () => 9.3;
describe("FLOORED — brakeledger's case A and sc-sp-harsh-brake's own phantom slams are named once, the fallback withheld", () => {
  it("case A: sc-follow-tailgater L4 with no follower, a 30 км/ч full-pedal stab to rest at y 160 — ONE floored record, named, no fallback (base: «…задръж това ниво.»)", () => {
    const d = replay(tailgater(4, true), LN, stabTape(30, null, STEADY, 160));
    expect(d.floored.length).toBeGreaterThan(0);
    expect(d.clean).toEqual([]);
    assertNamedOnce(d, "floored");
    // the pedal lands while the ease to 30 is still under way: the speedometer shows what it showed then
    const x = Math.floor(d.out.result.unbilledHardBrakes![0]!.shownKmh);
    expect(x).toBeLessThan(CFG.harshBrakeMinSpeedKmh);
    expect(namedBullets(d.debrief)[0]).toBe(
      `• ${TITLE} — при ${x} км/ч натисна спирачката рязко, а симулаторът не видя пред теб причина за това. Под 35 км/ч ` +
        "симулаторът таксува такова спиране само ако отчете, че кола точно зад теб е трябвало да спре рязко заради него; " +
        "този път не отчете такава, затова то не влезе в точките.",
    );
  }, TIMEOUT);

  const X = 4.06;
  const phantom = (kmh: number, decel: number, slams = 1): DriveScript => ({
    steps: [
      { kind: "glance", mirror: "rear" },
      ...Array.from({ length: slams }, (_, i) => [
        {
          kind: "drive" as const,
          points: [
            [X, i === 0 ? 15 : 181 - (slams - i) * 60],
            [X, 181 - (slams - 1 - i) * 60],
          ] as Array<[number, number]>,
          targetKmh: kmh,
          maxDecelMps2: decel,
        },
        { kind: "pause" as const, sec: 1.2, brake: true },
      ]).flat(),
      { kind: "drive", points: [[X, 181], [X, 345]], targetKmh: 45 },
      { kind: "pause", sec: 1.5, brake: true },
    ],
  });
  const record = (kmh: number, decel: number, slams = 1) =>
    recordScriptedDrive(SP, phantom(kmh, decel, slams), {
      scenarioId: SC_SP_HARSH_BRAKE.id,
      kind: "attempt" as never,
      seed: 7,
      stagedEvents: [...(SC_SP_HARSH_BRAKE.staged ?? [])] as StagedEventSpec[],
    }).trace;
  for (const kmh of [25, 30, 33]) {
    it(`sc-sp-harsh-brake, its phantom slam from ${kmh} км/ч (12 m/s² envelope), L1–L5: one floored record, named once, «при ${kmh}…», no fallback`, () => {
      const tr = record(kmh, 12);
      for (const L of [1, 2, 3, 4, 5] as ScenarioLevel[]) {
        const d = replay(compileScenario(SC_SP_HARSH_BRAKE, L), SP, tr);
        expect(d.out.violationCodes, `L${L}`).toEqual([]);
        expect(d.floored.length, `L${L}`).toBeGreaterThan(0);
        assertNamedOnce(d, "floored");
        expect(Math.floor(d.out.result.unbilledHardBrakes![0]!.shownKmh)).toBeLessThan(CFG.harshBrakeMinSpeedKmh);
      }
    }, TIMEOUT);
  }
  it("sc-sp-harsh-brake, TWO slams from 30 км/ч, 60 m apart: two floored records, two bullets, the why / right action / rule printed ONCE", () => {
    const d = replay(compileScenario(SC_SP_HARSH_BRAKE, 3), SP, record(30, 12, 2));
    const recs = d.out.result.unbilledHardBrakes ?? [];
    expect(recs.map((r) => r.form)).toEqual(["floored", "floored"]);
    expect(count(d.debrief, "Рязки спирания, които не влязоха в точките:")).toBe(1);
    expect(namedBullets(d.debrief).length).toBe(2);
    for (const line of TRIPLET) expect(count(d.debrief, line)).toBe(1);
    expect(d.debrief).toContain("имаше 2 рязки спирания, за които симулаторът не видя причина — те не влязоха в точките");
    expect(d.debrief).not.toMatch(UNSCOPED_PRAISE);
  }, TIMEOUT);
  it("CONTROL — the same stop from 30 км/ч at the recorder's 4.6 m/s² envelope: no record, CLEAN_DRIVING at 33.867 s and the bullet unscoped, as at base", () => {
    const d = replay(compileScenario(SC_SP_HARSH_BRAKE, 3), SP, record(30, 4.6));
    expect(d.out.result.unbilledHardBrakes).toBeUndefined();
    expect(d.clean.map((t) => t.toFixed(3))).toEqual(["33.867"]);
    expect(d.debrief).not.toContain(HEADING_ONE);
  }, TIMEOUT);
});

// ─── {X}, {F}, {S} ────────────────────────────────────────────────────────────
describe("THE NUMBERS ON THE BULLET — {X} is what the speedometer showed, never at or over the floor beside «Под {F}»; {S} / {F} are the lesson's", () => {
  it("a 35.3 км/ч stab whose anchor reads 34.8: floored, printed «при 34 км/ч», never «при 35 км/ч»", () => {
    const d = replay(tailgater(4, true), LN, stabTape(35.3, null, STEADY, 160));
    const rec = d.out.result.unbilledHardBrakes![0]!;
    expect(rec.form).toBe("floored");
    expect(rec.shownKmh).toBeGreaterThanOrEqual(35);
    expect(rec.onsetKmh).toBeLessThan(35);
    expect(namedBullets(d.debrief)[0]).toContain("— при 34 км/ч натисна");
    expect(d.debrief).not.toContain("при 35 км/ч");
  }, TIMEOUT);

  it("the A3 band: a gentle 3 m/s² brake from 40 км/ч that turns into a full-pedal stop at 30 — ONE floored record, {X} under the floor", () => {
    const law = (s: number) => (s < (10 / 3.6) / 3 ? 3 : 9.3);
    const d = replay(tailgater(4, true), LN, stabTape(40, null, law, 160));
    const recs = d.out.result.unbilledHardBrakes ?? [];
    expect(recs.map((r) => r.form)).toEqual(["floored"]);
    expect(Math.floor(recs[0]!.shownKmh)).toBeLessThan(CFG.harshBrakeMinSpeedKmh);
    assertNamedOnce(d, "floored");
  }, TIMEOUT);

  it("a pump from 60 км/ч to rest (0.25 s bursts, 0.1 s releases): unbilled, pumped, over the floor — the bullet carries NO floor clause", () => {
    const law = (s: number) => (s % 0.35 < 0.25 ? 9 : 0);
    const d = replay(tailgater(4, true), LN, stabTape(45.9, null, law, 160));
    expect(d.harsh).toEqual([]);
    const rec = d.out.result.unbilledHardBrakes![0]!;
    expect(rec.form).toBe("pumped");
    expect(rec.onsetKmh).toBeGreaterThanOrEqual(35);
    expect(namedBullets(d.debrief)[0]).not.toContain("Под 35 км/ч");
    assertNamedOnce(d, "pumped");
  }, TIMEOUT);

  it("a config-override lesson (harshBrakeMinSpeedKmh 30, harshBrakeSustainSec 0.5) prints {F} = 30 and {S} = 0,5", () => {
    const cfg = { harshBrakeMinSpeedKmh: 30, harshBrakeSustainSec: 0.5 };
    const fl = replay(tailgater(4, true, cfg), LN, stabTape(28, null, STEADY, 200));
    expect(namedBullets(fl.debrief)[0]).toContain("Под 30 км/ч симулаторът таксува");
    const pump = (s: number) => (s % 0.42 < 0.32 ? 9 : 0);
    const pu = replay(tailgater(4, true, cfg), LN, stabTape(28, null, pump, 200));
    expect(pu.out.result.unbilledHardBrakes![0]!.form).toBe("pumped");
    expect(namedBullets(pu.debrief)[0]).toContain("рязкото спиране 0,5 s");
    expect(namedBullets(pu.debrief)[0]).toContain("Под 30 км/ч дори рязко спиране, задържано 0,5 s");
  }, TIMEOUT);
});

// ─── THE PRAISE BEFORE THE BRAKE ───────────────────────────────────────────────
describe("T1 — a window paid BEFORE the brake check stands, and is scoped on the bullet", () => {
  it("case A's drive with the pump at y 300: CLEAN_DRIVING at 28.583 s stands (base's frame), its bullet carries the brake-check rider", () => {
    const pump = (s: number) => (s % 0.35 < 0.25 ? 9 : 0);
    const d = replay(tailgater(4, true), LN, stabTape(30, null, pump, 300));
    expect(d.clean.map((t) => t.toFixed(3))).toEqual(["28.583"]);
    expect(d.out.result.unbilledHardBrakes!.map((r) => r.form)).toEqual(["pumped"]);
    expect(d.debrief).toContain(
      `Какво се получи добре:\n• ${CLEAN} — но само на отделни отсечки от маршрута: в същия урок имаше рязко спиране, ` +
        "за което симулаторът не видя причина. Похвалата е за отсечките без него, не за урока — „чисто каране“ се брои " +
        "чак когато ЦЯЛОТО каране е такова.",
    );
    expect(d.debrief).not.toMatch(UNSCOPED_PRAISE);
  }, TIMEOUT);
});

// ─── UNFINISHED, ABORTED, STORED ───────────────────────────────────────────────
function cut(trace: ScenarioTrace, untilY: number): ScenarioTrace {
  const samples = trace.samples.filter((s) => s.y <= untilY);
  const last = samples[samples.length - 1]!;
  for (let j = 1; j <= 30; j++) samples.push({ ...last, tSec: last.tSec + j / 60, speedKmh: 0 });
  return { ...trace, samples, meta: { ...trace.meta, durationSec: samples[samples.length - 1]!.tSec } };
}

describe("the second verdict branch — an unfinished and an aborted floored drive name the brake, and print no task-cap text", () => {
  it("unfinished: the case-A stab, the route left at y 250 — reserved with its own pointer, no «Какво да промениш, е в края на разбора.», no clean claim", () => {
    const d = replay(tailgater(4, true), LN, cut(stabTape(30, null, STEADY, 160), 250));
    expect(d.out.result.completedAll).toBe(false);
    expect(d.out.result.unbilledHardBrakes!.map((r) => r.form)).toEqual(["floored"]);
    expect(d.debrief).toContain(
      "По изпитния лист нямаш нито една наказателна точка (0 при допустими 9) — оценката е за незавършения маршрут. " +
        `Но чистият лист не значи чисто каране: ${RESERVATION}. Прочети рязкото спиране по-долу и повтори урока с него наум.`,
    );
    expect(d.debrief).not.toContain("Какво да промениш, е в края на разбора.");
    expect(d.debrief).not.toContain("мини точката на задачата");
    expect(d.debrief).not.toMatch(UNSCOPED_PRAISE);
    expect(d.debrief).toContain(
      "Какво да упражниш: повтори урока и завърши всички задачи от маршрута — правилното действие при рязкото спиране е по-горе.",
    );
    expect(count(d.debrief, HEADING_ONE)).toBe(1);
    // Two records on the same unfinished drive: the practice line agrees with the block's plural heading.
    const one = d.out.result.unbilledHardBrakes![0]!;
    const two: LessonResult = {
      ...d.out.result,
      unbilledHardBrakes: [one, { ...one, sinceSec: one.sinceSec + 5, atSec: one.atSec + 5 }],
    };
    const twoText = buildDebrief(d.out.lesson, two, { coachedMistakes: two.coachedMistakes }).text;
    expect(count(twoText, "Рязки спирания, които не влязоха в точките:")).toBe(1);
    expect(twoText).toContain(
      "Какво да упражниш: повтори урока и завърши всички задачи от маршрута — правилното действие при рязките спирания е по-горе.",
    );
    expect(twoText).not.toContain("правилното действие при рязкото спиране е по-горе");
    expect(twoText).toContain("Прочети рязките спирания по-долу и повтори урока с тях наум.");
    expect(twoText).not.toMatch(UNSCOPED_PRAISE);
  }, TIMEOUT);

  it("aborted: the same drive stopped with «Прекрати урока» — reserved, named, no task-cap practice line", () => {
    const d = replay(tailgater(4, true), LN, cut(stabTape(30, null, STEADY, 160), 250));
    const aborted = abortSession(d.out.session, d.out.session.lastT);
    const result = buildLessonResult(aborted);
    expect(result.aborted).toBe(true);
    const text = buildDebrief(d.out.lesson, result, { coachedMistakes: result.coachedMistakes }).text;
    expect(text).toContain("оценката е за прекъснатия урок. Но чистият лист не значи чисто каране: " + RESERVATION);
    expect(text).not.toContain("Повтори урока и мини точката на задачата");
    expect(count(text, HEADING_ONE)).toBe(1);
    expect(text).not.toMatch(UNSCOPED_PRAISE);
  }, TIMEOUT);

  it("a STORED result without the field (a row from before this lane) reads exactly as base: TASF348's base debrief, byte for byte", () => {
    const d = replay(tailgater(1), LN, rigTape("pc-L1-TASF348"));
    const stored: LessonResult = { ...d.out.result };
    delete stored.unbilledHardBrakes;
    const text = buildDebrief(d.out.lesson, stored, { coachedMistakes: stored.coachedMistakes }).text;
    // base (230c7b8), measured by this file's first run on the en tree
    expect(text.split("\n")[0]).toBe(
      "Урокът „Лепка отзад · Ниво 1 — Пълна помощ“ е издържан: 0 наказателни точки от изпитния лист при допустими 9. " +
        SUPERLATIVE,
    );
    expect(text).toContain("Какво се получи добре: чисто каране без нито едно нарушение по изпитния лист — задръж това ниво.");
    expect(text).not.toContain(HEADING_ONE);
  }, TIMEOUT);
});
