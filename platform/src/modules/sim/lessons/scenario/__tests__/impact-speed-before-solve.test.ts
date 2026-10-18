/**
 * l0-free-drive:ee9d9374 [critical] — A CRASH IS JUDGED AT THE SPEED IT WAS
 * STRUCK AT, NOT AT THE REBOUND THE SOLVE LEFT.
 *
 * THE DEFECT (filed 2026-10-17, evidence .audit-frames/triage-1011/
 * r3-catalogue-impact-speed-post-solve-impact.json; reproduced in this lane on
 * 1f1536d). `VehicleSim.forEachChassisContact` read the chassis' `linvel()`
 * AFTER the contact step — after rapier's solve had already stopped the car
 * and bounced it back. A head-on crash read 8–13 % of the speed it was made
 * at: 50.085 km/h into a district-v1 façade read 5.499, 69.85 read 6.429; the
 * hz block at 41.8 / 51.4 / 70.0 read 4.861 / 6.008 / 8.507. Every lesson a
 * student reaches outside the scenario rungs — the curriculum l0–l7, the
 * poligon l0p/l8, lex-exam-1 and all 18,396 exam-bank variants — keeps the
 * street tolerance (VehicleRig COLLISION_MIN_KMH, 10), so none of those
 * crashes was billed: l0-free-drive finished «passed: true, score 6» and
 * unlocked Lesson 1; lex-exam-1 and EX-A-D1-0000 were not terminated. And
 * where a crash IS billed (the scenario rungs, tolerance 0), the thump, the
 * haptic pattern, the shake and the chase cut were fed the same rebound: a
 * 50 km/h crash played thump 0.27, haptic [46,40,18], shake 0.79°.
 *
 * THE DEFINITION (VehicleSim `solveStartVel`): the impact speed of a contact
 * that step k begins is |v_chassis − v_other| with v_chassis the chassis'
 * velocity as `update()` handed it to step k's `world.step` — after the wheel
 * impulses, before the solve — and v_other the struck body's velocity over the
 * step (every body the chassis can strike is fixed or kinematic, so the solve
 * never changes it). Its magnitude, not its share along the contact normal: a
 * contact the solve does not stop (a scrape along a wall) reads what it always
 * read.
 *
 * THE TOLERANCE every reading is held to: the step record's own speed after
 * step k−1 (the car the grade saw last before the contact) is not the solve's
 * input — step k's wheel impulses lie between them. The most one step's wheel
 * impulses can change the car's speed is the full service brake for 1/60 s:
 * BRAKE_FORCE_N / CHASSIS_MASS / 60 s⁻¹ = 11000 / 1220 / 60 m/s = 0.541 km/h.
 * The product's own tuning, not a fitted number (measured: 0.024–0.033).
 *
 * WHAT IS NOT CHANGED: COLLISION_MIN_KMH, any lesson's collisionMinKmh, the
 * district-surface tolerance (`gradedContactMinKmh`), the `>=`, the bills, the
 * rules, the thump / haptic / shake / cut curves. Only the reading.
 *
 * THE CHAIN, executed: rapier → VehicleSim → PlayerStepTrackRecorder
 * .watchContacts → GradeGrid → VehicleRig.hearChassisContact → LessonScene's
 * own handleCollision (rapierContactDrive.ts), plus — for the haptic pattern —
 * VehicleRig's own ear effect cut out of its source and run under
 * @react-three/fiber's reconciler, fed the contact the drive recorded.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, useLayoutEffect, type FunctionComponent } from "react";
import { reconciler } from "@react-three/fiber";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";
import {
  impactCutView,
  impactShakeAmplitudeRad,
  IMPACT_SHAKE_MAX_RAD,
} from "@/components/sim/ImpactCut";
import { COLLISION_MIN_KMH, hearChassisContact, type ChassisContactListener } from "@/components/sim/VehicleRig";
import type { LessonSpec, VehicleSample } from "../../../contracts";
import { collisionVibrationPattern } from "../../../engine/haptics";
import * as T from "../../../vehicle/tuning";
import { EXAM_LESSON, LESSONS, examVariantById } from "../..";
import { compileScenario } from "../compile";
import { SC_HZ_BRAKE_DONT_SWERVE } from "../templates-hazards2";
import { loadDistrict } from "./witnessLiveRung";
import { driveIntoContact, initRapier, type ContactDriveOutcome, type DriveState } from "./rapierContactDrive";

beforeAll(async () => {
  await initRapier();
});

/** One step of the full service brake, km/h — see the header. */
const TOL_KMH = (T.BRAKE_FORCE_N / T.CHASSIS_MASS / 60) * 3.6;

/** district-v1, r2162798.w161464876: 140 m of run-up square onto a façade
 *  (the triage checker's start; the building trimesh, untagged). */
const FACADE = { x: -70.4415977941719, y: -448.9816804167297, headingDeg: 4.687765847628214 };
/** The hz lesson's block, from the lesson's own start. */
const BLOCK = { x: 4.06, y: 15, headingDeg: 0 };
/** 10 m short of the block — for a parking-speed touch. */
const BLOCK_NEAR = { x: 4.06, y: 175, headingDeg: 0 };

/** Hold `kmh` dead straight; from the step after a speed drop of more than
 *  `drop` km/h, the full brake. Decided from the car after the previous step. */
function cruise(kmh: number, drop = 8, gentle = false) {
  return () => {
    let prev = 0;
    let crashed = false;
    return (st: DriveState) => {
      if (prev - st.speedKmh > drop) crashed = true;
      prev = st.speedKmh;
      if (crashed) return { throttle: 0, brake: 1, steer: 0 };
      const err = kmh - st.speedKmh;
      if (gentle) return { throttle: err > 0 ? Math.min(0.6, err / 5 + 0.1) : 0, brake: err < -1 ? 0.2 : 0, steer: 0 };
      return { throttle: err > 0 ? Math.min(1, err / 5 + 0.2) : 0.12, brake: 0, steer: 0 };
    };
  };
}

interface Presented {
  contacts: unknown[];
  thumps: number[];
  cuts: number[];
}
function driveInto(
  lesson: LessonSpec,
  raw: unknown,
  start: typeof FACADE,
  kmh: number,
  opts: { gentle?: boolean; maxSteps?: number; tailSteps?: number } = {},
) {
  const p: Presented = { contacts: [], thumps: [], cuts: [] };
  const o = driveIntoContact({
    lesson,
    raw,
    start,
    control: cruise(kmh, opts.gentle ? 2 : 8, opts.gentle)(),
    deltas: [1 / 60],
    maxSteps: opts.maxSteps ?? 60 * 25,
    tailSteps: opts.tailSteps,
    presentation: {
      contact: (c) => p.contacts.push(c),
      thump: (v) => p.thumps.push(v),
      impactCut: (kmh) => p.cuts.push(kmh),
    },
  });
  return { o, p };
}

const l0 = () => LESSONS.find((l) => l.id === "l0-free-drive")!;
const district = () => loadDistrict("district-v1");
const hzStreet = () => {
  const lesson = compileScenario(SC_HZ_BRAKE_DONT_SWERVE, 3);
  lesson.collisionMinKmh = undefined; // the curriculum's default: COLLISION_MIN_KMH
  return lesson;
};
const hzRaw = () => loadDistrict(SC_HZ_BRAKE_DONT_SWERVE.map.districtId);

type Summary = { terminated: boolean; failReasons: string[]; mistakes: Array<{ code: string; severityClass: string; points: number; t: number }> };
const summaryOf = (o: ContactDriveOutcome) => (o.result as unknown as { summary: Summary }).summary;

/** The first contact the ear judged, held to the impact: read within TOL_KMH
 *  of the car after the step before it — and, for a crash, booked at the step
 *  the car's speed fell by more than 20 km/h (the harness's `impactStep`; a
 *  parking touch never falls that far). */
function firstImpact(o: ContactDriveOutcome, label: string, crash = true) {
  const first = o.judged[0];
  expect(first, `${label}: the ear judged no contact`).toBeDefined();
  if (crash) {
    expect(o.impactStep, `${label}: the car never struck anything`).toBeGreaterThan(0);
    expect(first.bookedStep, `${label}: the contact is booked at the step the car's speed fell`).toBe(o.impactStep);
  }
  const approach = o.speedAfterStep[first.bookedStep - 1];
  expect(
    Math.abs(first.impactKmh - approach),
    `${label}: the contact read ${first.impactKmh.toFixed(3)} km/h — the car struck at ${approach.toFixed(3)} km/h (tolerance ${TOL_KMH.toFixed(3)})`,
  ).toBeLessThanOrEqual(TOL_KMH);
  return { approach, first };
}

describe("a head-on crash into a building is billed on the curriculum and the exam (street tolerance 10 km/h)", () => {
  for (const [label, lesson, kmh, minApproach] of [
    ["l0-free-drive, façade at 50 km/h", l0, 50, 49],
    ["l0-free-drive, façade at 70 km/h", l0, 70, 69],
    ["lex-exam-1, façade at 50 km/h", () => EXAM_LESSON, 50, 49],
    ["exam-bank EX-A-D1-0000, façade at 50 km/h", () => examVariantById("EX-A-D1-0000")!, 50, 49],
  ] as const) {
    it(`${label}: the contact reads the impact, it is graded, the COLLISION (опасна, 10 т.) is billed and the drive cannot pass`, () => {
      const spec = lesson();
      expect(spec.collisionMinKmh, "the lesson keeps the street default").toBeUndefined();
      const { o } = driveInto(spec, district(), FACADE, kmh);
      const { approach, first } = firstImpact(o, label);
      expect(approach).toBeGreaterThan(minApproach);
      expect(first.graded, `${label}: a ${approach.toFixed(1)} km/h crash judged a nudge`).toBe(true);
      expect(first.withWhat).toBe("staticObject");
      expect(o.collisions.length, `${label}: no COLLISION billed`).toBe(1);
      expect(o.collisions[0].points).toBe(10);
      const s = summaryOf(o);
      const bill = s.mistakes.find((m) => m.code === "COLLISION");
      expect(bill?.severityClass).toBe("opasna");
      expect(bill?.t).toBeCloseTo(o.impactStep / 60, 9);
      expect(s.terminated, "a collision terminates (summary.terminated)").toBe(true);
      expect(s.failReasons).toContain("dangerous-mistake");
      expect(o.result.passed, `${label}: a crash into a building passed`).toBe(false);
      if (spec.id !== "l0-free-drive") {
        // The exam ends at the crash — its rules, unchanged.
        expect(o.endedAtPoint, `${label}: the exam was not ended by the crash`).toBe(o.impactStep);
      }
    });
  }

  for (const [label, lesson] of [
    ["lex-exam-1", () => EXAM_LESSON],
    ["exam-bank EX-A-D1-0000", () => examVariantById("EX-A-D1-0000")!],
  ] as const) {
    it(`${label}, façade at 70 km/h: the exam already ended at the SPEEDING_DANGEROUS bill before the wall — the wall is still judged at the impact by the ear`, () => {
      // the drive carries on after the session ended, into the wall
      const { o } = driveInto(lesson(), district(), FACADE, 70, { tailSteps: 60 * 10 });
      const s = summaryOf(o);
      const speeding = s.mistakes.find((m) => m.code === "SPEEDING_DANGEROUS");
      expect(speeding, "the 70 km/h drive is billed for its speed first").toBeDefined();
      expect(o.endedAtPoint).toBeGreaterThan(0);
      expect(o.endedAtPoint, "the exam ended before the wall").toBeLessThan(o.impactStep);
      // The session no longer listens; the ear still judges the wall — at 70.
      const { approach, first } = firstImpact(o, label);
      expect(approach).toBeGreaterThan(69);
      expect(first.graded).toBe(true);
    });
  }
});

describe("the hz block at the street tolerance — the reading is the impact", () => {
  for (const [kmh, approachMin] of [
    [30, 41],
    [50, 51],
    [70, 69.5],
  ] as const) {
    it(`cruising at ${kmh} km/h (approach ≈ ${approachMin}+): read within ${TOL_KMH.toFixed(3)} km/h of the impact, graded, billed`, () => {
      const { o } = driveInto(hzStreet(), hzRaw(), BLOCK, kmh, { maxSteps: 60 * 40 });
      const { approach, first } = firstImpact(o, `block ${kmh}`);
      expect(approach).toBeGreaterThan(approachMin);
      expect(first.graded).toBe(true);
      expect(o.collisions.length).toBe(1);
      expect(o.collisions[0]).toMatchObject({ points: 10, withWhat: "staticObject" });
    });
  }
});

describe("a parking-speed touch still reads its own speed — and the street tolerance still lets it go", () => {
  for (const kmh of [3, 5, 7]) {
    it(`a ${kmh} km/h touch of the block reads ≈ ${kmh}: a nudge at the street tolerance, the graded touch at a scenario rung's 0`, () => {
      const street = driveInto(hzStreet(), hzRaw(), BLOCK_NEAR, kmh, { gentle: true, maxSteps: 60 * 40 });
      const { approach, first } = firstImpact(street.o, `touch ${kmh}`, false);
      expect(Math.abs(approach - kmh), "the gentle drive held its speed").toBeLessThan(0.5);
      expect(first.impactKmh).toBeLessThan(COLLISION_MIN_KMH);
      expect(first.graded, `a ${kmh} km/h touch was graded at the street tolerance`).toBe(false);
      expect(street.o.collisions).toEqual([]);
      // the rig played the nudge, at the thump the touch's own speed gives
      expect(street.p.thumps[0]).toBeCloseTo(Math.min(1, first.impactKmh / 50 + 0.15), 12);
      expect(street.p.cuts).toEqual([]);

      const rung = compileScenario(SC_HZ_BRAKE_DONT_SWERVE, 3);
      expect(rung.collisionMinKmh).toBe(0);
      const scenario = driveInto(rung, hzRaw(), BLOCK_NEAR, kmh, { gentle: true, maxSteps: 60 * 40 });
      const s = firstImpact(scenario.o, `touch ${kmh} at 0`, false);
      expect(s.first.impactKmh).toBe(first.impactKmh);
      expect(s.first.graded).toBe(true);
      expect(scenario.o.collisions.length).toBe(1);
    });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// What the student hears and sees: VehicleRig's own ear effect, executed
// ───────────────────────────────────────────────────────────────────────────

interface EarScope {
  contactListenerRef: { current: ChassisContactListener | null } | undefined;
  collisionMinKmh: number;
  onCollision: ((impactKmh: number, withWhat: string, student: Readonly<VehicleSample>) => void) | undefined;
  audioRef: { current: { thump(volume01: number): void } | null };
  hapticsRef: { current: { collision(impactKmh: number): void; curb(): void } | null };
}
const HERE = path.dirname(fileURLToPath(import.meta.url));
/** VehicleRig's `useLayoutEffect(…)` that fills the ear, exactly as the source
 *  spells it, as a component on the five names it reads (the
 *  chassis-contact-ear.test.ts cut, repeated here so the presentation of a
 *  REAL contact runs through the rig's own statements). */
function rigEar(): FunctionComponent<EarScope> {
  const rig = readFileSync(path.resolve(HERE, "../../../../../components/sim/VehicleRig.tsx"), "utf-8").replace(/\r\n/g, "\n");
  const sf = ts.createSourceFile("VehicleRig.tsx", rig, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: ts.CallExpression[] = [];
  const walk = (n: ts.Node) => {
    if (ts.isCallExpression(n) && n.expression.getText(sf) === "useLayoutEffect" && n.arguments[0]?.getText(sf).includes("contactListenerRef.current =")) {
      found.push(n);
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  if (found.length !== 1) throw new Error(`expected one ear effect in VehicleRig, found ${found.length}`);
  const js = ts.transpileModule(
    `return function Ear({ contactListenerRef, collisionMinKmh, onCollision, audioRef, hapticsRef }) {\n${found[0].getText(sf)};\nreturn null;\n};`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
  ).outputText;
  return (new Function("useLayoutEffect", "hearChassisContact", `"use strict";\n${js}`) as (...a: unknown[]) => FunctionComponent<EarScope>)(
    useLayoutEffect,
    hearChassisContact,
  );
}
function earHeard(contact: unknown, collisionMinKmh: number) {
  const r = reconciler as unknown as {
    createContainer(...args: unknown[]): unknown;
    updateContainerSync(element: unknown, container: unknown, parent: null, callback: null): void;
    flushSyncWork(): void;
  };
  const errors: unknown[] = [];
  const onError = (e: unknown) => errors.push(e);
  const container = r.createContainer({}, 1, null, false, null, "", onError, onError, onError, null);
  const ear: { current: ChassisContactListener | null } = { current: null };
  const heard = { thumps: [] as number[], haptics: [] as number[], curbs: 0, graded: [] as number[] };
  r.updateContainerSync(
    createElement(rigEar(), {
      contactListenerRef: ear,
      collisionMinKmh,
      onCollision: (kmh) => heard.graded.push(kmh),
      audioRef: { current: { thump: (v) => heard.thumps.push(v) } },
      hapticsRef: { current: { collision: (kmh) => heard.haptics.push(kmh), curb: () => void heard.curbs++ } },
    }),
    container,
    null,
    null,
  );
  r.flushSyncWork();
  expect(errors).toEqual([]);
  ear.current!(contact as never, {} as Readonly<VehicleSample>);
  return heard;
}

describe("the crash response fires at crash strength — the 2026-09-27 ruling's flash + shake + chase cut, and the thump and haptic beside them", () => {
  it("the designed curve at 50 km/h, from the product's own functions: thump 1.0, haptic [160,40,64], shake 0.04 rad (2.29°), the chase cut on the street and in a manoeuvring drill", () => {
    expect(Math.min(1, 50 / 50 + 0.15)).toBe(1);
    expect(collisionVibrationPattern(50)).toEqual([160, 40, 64]);
    expect(impactShakeAmplitudeRad(50)).toBe(IMPACT_SHAKE_MAX_RAD);
    expect((IMPACT_SHAKE_MAX_RAD * 180) / Math.PI).toBeCloseTo(2.2918, 4);
    expect(impactCutView("cockpit", 50, false, false)).toBe("chase");
    expect(impactCutView("cockpit", 50, false, true)).toBe("chase");
  });

  it("l0-free-drive, façade at 50 km/h, through the chain: the thump, the impact cut (shake + chase cut) and the rig ear's haptic pattern all take the impact", () => {
    const { o, p } = driveInto(l0(), district(), FACADE, 50);
    const { approach } = firstImpact(o, "façade 50");
    // the rig's judge played the thump at the impact
    expect(p.thumps[0], `the thump played ${p.thumps[0]} for a ${approach.toFixed(1)} km/h crash`).toBe(1);
    // LessonScene's own handleCollision handed its impact cut the impact
    expect(p.cuts.length, "LessonScene's handleCollision never reached the impact cut").toBeGreaterThan(0);
    expect(Math.abs(p.cuts[0] - approach), `the impact cut was handed ${p.cuts[0]} km/h`).toBeLessThanOrEqual(TOL_KMH);
    expect(impactShakeAmplitudeRad(p.cuts[0]), "the shake at the cut's speed").toBe(IMPACT_SHAKE_MAX_RAD);
    expect(impactCutView("cockpit", p.cuts[0], false, false)).toBe("chase");
    expect(impactCutView("cockpit", p.cuts[0], false, true), "a 50 km/h crash in a manoeuvring drill still cuts").toBe("chase");
    // the rig's OWN ear, fed the contact the drive recorded, at the lesson's threshold
    const heard = earHeard(p.contacts[0], l0().collisionMinKmh ?? COLLISION_MIN_KMH);
    expect(heard.graded.length, "the rig's ear did not grade the recorded contact").toBe(1);
    expect(heard.thumps, "the rig's ear thump").toEqual([1]);
    expect(heard.curbs, "the rig's ear played the nudge tap").toBe(0);
    expect(heard.haptics.length).toBe(1);
    expect(collisionVibrationPattern(heard.haptics[0]), `the rig's ear vibrated for ${heard.haptics[0]} km/h`).toEqual([160, 40, 64]);
  });
});
