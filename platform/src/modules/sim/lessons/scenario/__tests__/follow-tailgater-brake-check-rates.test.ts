/**
 * sc-follow-tailgater — THE BRAKE CHECK AT THE TAILGATER, DRIVEN AT EVERY RATE
 * THE PRODUCT IS FED (`sc-follow-tailgater:63c0c28c` clause C2a, critical, and
 * `sc-follow-tailgater:f42dce4f`, «same script, opposite verdicts by platform»).
 *
 * WHAT THE AUDIT PHOTOGRAPHED (w71, harness H2, HEAD 9e09e18). The wrong leg
 * delivered the act on both platforms — «ANTECEDENT HELD AS SIZED», the rear
 * badge at 7 м, the dial at 57 км/ч — and every stop had a peak 0.4 s
 * deceleration of 9.3–9.5 m/s² from ~58 км/ч. HARSH_BRAKING_NO_CAUSE, the
 * drill's own mistakes[0] «Спирачен удар „за урок“», fired on NONE of the six
 * stops. At w69 the phone (2.8 Hz) DID fire it, at w71 (4 Hz) it did not, and
 * the desktop (62.5 Hz, measured off `_audit-road.json.gz`) never has.
 *
 * WHAT ACQUITTED IT — measured here before any repair, not inferred: the FRONT
 * lead. `FTG_LEAD` cruises a constant 11.5 m/s (~41 км/ч) some 80–90 m ahead; a
 * student at 58 км/ч closes on it at ~4.6 m/s, and the cause ledger's
 * `leadClosingFast` called ANY closing of 3 m/s or more a cause «at any
 * distance». It read that closing as a per-tick difference, so on the first
 * braking frame the average mixed the cruise (4.6) with the brake: above 3 at
 * 10–120 Hz (acquitted), under it at 2.5–4 Hz when the frame happened to fall
 * late (convicted). Knocking that one term out convicted at all seven rates;
 * the tailgater BEHIND is never in the lead channel (`leadGapFor` skips
 * `fwd <= 0`), and ln-v1 has no stop line, junction, signal or crossing.
 *
 * THE CHAIN IS THE PRODUCT'S: the committed ln-v1 district through
 * createWorldRuntime + createTrafficSystem + the lesson's own compiled staged
 * pair under createScenarioDirector, wired with `wireTrafficQueries`, graded by
 * `createLessonSession` → `applyTick` (the lesson's own ruleConfig, the coach,
 * Ruling A) → `buildLessonResult` → `buildDebrief`. The student is kinematic,
 * integrated in 1 ms substeps so the brake onset falls at a different PHASE of
 * the frame at every rate — exactly what a real phone and a real desktop do —
 * and the stack is stepped at the frame rate under test.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "../../../runtime";
import { createTrafficSystem } from "../../../traffic/system";
import { vehicleHalfLengthM } from "../../../traffic/types";
import { createScenarioDirector } from "../../../orchestrator/director";
import { wireTrafficQueries } from "../../../scene/lessonWorldRecipe";
import { PLAYER_HALF_LENGTH_M } from "../../../collision";
import type { RearTailgaterSpec, StagedEventSpec } from "../../../contracts";
import { buildDebrief } from "../../debrief";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { compileScenario } from "../compile";
import { SC_FOLLOW_TAILGATER } from "../templates-following";
import { DEFAULT_RULE_CONFIG } from "../../../rules";

const REPO_ROOT = join(process.cwd(), "..");
/** ln-v1's northbound right-lane centre — the spawn's own x. */
const RIGHT = 12.19;
/** The rates the row names: w69 phone 2.8 Hz, w71 phone 4 Hz, w71 desktop 62.5 Hz, and around them. */
const RATES = [2.5, 2.8, 4, 10, 30, 60, 120] as const;
/** The hero's launch ramp the other in-process censuses use, m/s². */
const LAUNCH_MPS2 = 1.95;
const CRUISE_KMH = 58;
/** The H2 profile's own antecedent: the dial at harshBrakeMinSpeedKmh or more, the badge under REAR_CUE_WARN_M 8 m. */
const TRIGGER_MIN_KMH = 57;
const TRIGGER_MAX_REAR_M = 8;

/**
 * THE MEASURED DECELERATION PROFILES. `pc` is w71's desktop stop read off the
 * road record (9.3–9.5 m/s² down to ~13 км/ч, then a 5–6 m/s² roll to rest —
 * mean 8.3). The two others keep the measured 9.4 m/s² plateau and then ease,
 * so the WHOLE stop averages the means the judge quoted (7.6, and 6.7 — under
 * the 7 m/s² line as a whole-stop mean). The plateau lengths are the evidence's:
 * frame by frame, every phone stop in w71-h2-mob and w69-h1-mob reads 9.2–9.5
 * m/s² for 1.0–1.5 s (e.g. w71 stop 1: 9.8 · 9.2 · 9.2 · 7.4 over 0.27/0.47/
 * 0.45/0.50 s frames); the lower whole-stop means there come from the tail and
 * from the 4 Hz rest frame, not from a short peak. (A plateau shorter than the
 * sustain plus one frame — 0.6 s at 2.8 Hz — cannot be certified from speed
 * samples at all: the frame the pedal lands in averages the cruise in, and no
 * rate-free rule can see inside a frame. That floor is reported, not tested.)
 */
type Profile = { name: string; targetMean: number; decel: (sinceOnsetSec: number, vMps: number) => number };
const PROFILES: Profile[] = [
  { name: "pc-measured", targetMean: 8.3, decel: (_s, v) => (v * 3.6 > 13 ? 9.4 : 5.5) },
  { name: "mean-7.6", targetMean: 7.6, decel: (s) => (s < 0.8 ? 9.4 : 6.5) },
  { name: "mean-6.7", targetMean: 6.7, decel: (s) => (s < 1.0 ? 9.4 : 4.8) },
];
/** Reaction delays between the frame that SAW the antecedent and the pedal — four phases of the frame. */
const PHASES = [0.05, 0.137, 0.21, 0.333] as const;

interface StopRecord {
  onsetT: number;
  restT: number | null;
  onsetKmh: number;
  meanDecel: number | null;
  rearBumperM: number;
  leadGapM: number | null;
  closingMps: number | null;
}
interface DriveOut {
  stops: StopRecord[];
  graded: Array<{ code: string; t: number; charged: boolean }>;
  coached: string[];
  billed: string[];
  lessonMistakes: Array<{ code: string; charged: boolean }>;
  passed: boolean;
  debrief: string;
}

const DISTRICT = JSON.parse(readFileSync(join(REPO_ROOT, "content", "world", "ln-v1.json"), "utf-8"));

/**
 * One drive. `stops` = how many brake checks: the first at the tailgater (the
 * H2 antecedent), each later one 80 m of road after driving off a rest (w71's
 * own spacing: y ≈ 88, 168, 250). Every rest is held `restSec`.
 */
function driveBrakeChecks(hz: number, profile: Profile, phase: number, stops = 1, restSec = 8): DriveOut {
  const DT = 1 / hz;
  const lesson = compileScenario(SC_FOLLOW_TAILGATER, 1);
  const staged = (lesson.stagedEvents ?? []) as StagedEventSpec[];
  const tg = staged.find((s): s is RearTailgaterSpec => s.kind === "rearTailgater")!;
  const runtime = createWorldRuntime(DISTRICT);
  const traffic = createTrafficSystem(DISTRICT, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
  wireTrafficQueries(runtime, traffic);
  const director = createScenarioDirector(staged, traffic, { seed: 7, signals: runtime });
  let session = createLessonSession(lesson);

  // continuous student state
  let tc = 0;
  let y = 15;
  let v = 0;
  let mode: "drive" | "brake" | "rest" = "drive";
  let onsetAt: number | null = null; // pending or active brake onset (continuous time)
  let restUntil = 0;
  let nextStopY = Infinity;
  const recs: StopRecord[] = [];
  let prevLead: { t: number; g: number } | null = null;

  for (let f = 1; f * DT < 200; f++) {
    const t = f * DT;
    // ---- the student, in 1 ms substeps up to this frame ----
    while (tc < t - 1e-9) {
      const h = Math.min(0.001, t - tc);
      const v0 = v;
      if (mode === "brake" || (onsetAt !== null && tc >= onsetAt)) {
        if (mode !== "brake") {
          mode = "brake";
          recs.push({ onsetT: tc, restT: null, onsetKmh: v * 3.6, meanDecel: null, rearBumperM: NaN, leadGapM: null, closingMps: null });
        }
        v = Math.max(0, v - profile.decel(tc - onsetAt!, v) * h);
        if (v === 0) {
          const r = recs[recs.length - 1];
          r.restT = tc + h;
          r.meanDecel = r.onsetKmh / 3.6 / (r.restT - r.onsetT);
          mode = "rest";
          onsetAt = null;
          restUntil = tc + h + restSec;
        }
      } else if (mode === "rest") {
        if (tc >= restUntil) {
          mode = "drive";
          nextStopY = recs.length < stops ? y + 80 : Infinity;
        }
      } else {
        v = Math.min(CRUISE_KMH / 3.6, v + LAUNCH_MPS2 * h);
      }
      y += ((v0 + v) / 2) * h;
      tc += h;
    }
    if (recs.length >= stops && mode === "drive" && y > 330) break;

    // ---- the product's frame ----
    runtime.update(DT);
    traffic.update(DT, {
      signalPhase: (id) => runtime.signalPhase(id),
      playerPos: { x: RIGHT, y },
      playerSpeedKmh: v * 3.6,
      playerHeadingDeg: 0,
    });
    const leadGap = traffic.leadGapMeters(RIGHT, y, 0);
    const tick = runtime.sample(
      {
        position: { x: RIGHT, y },
        headingDeg: 0,
        speedKmh: v * 3.6,
        indicator: "off",
        headlights: "off",
        seatbeltOn: true,
        handbrakeOn: false,
        gear: 3,
        mirrorGlance: null,
      },
      t,
      false,
      false,
      leadGap,
    );
    const st = director.step({
      tSec: t,
      dtSec: DT,
      x: RIGHT,
      y,
      speedKmh: v * 3.6,
      headingDeg: 0,
      brakePedal: mode === "brake" ? 1 : 0,
      tickEvents: tick.events,
    });
    if (st.events.length > 0) tick.events.push(...st.events);
    session = applyTick(session, tick).state;

    // ---- what the student SEES on this frame decides the next brake ----
    const a = traffic.staged(tg.id);
    const rear = a ? y - PLAYER_HALF_LENGTH_M - (a.y + vehicleHalfLengthM(tg.actor.profile)) : Infinity;
    const lead = Number.isFinite(leadGap) ? leadGap : null;
    if (mode === "drive" && onsetAt === null && recs.length < stops) {
      const fast = v * 3.6 >= TRIGGER_MIN_KMH;
      const first = recs.length === 0;
      if (fast && (first ? rear > 0 && rear <= TRIGGER_MAX_REAR_M : y >= nextStopY)) {
        onsetAt = t + phase;
        // antecedent bookkeeping, filled at the frame the student decided
        pendingRear = rear;
        pendingLead = lead;
        pendingClosing = lead !== null && prevLead !== null ? (prevLead.g - lead) / (t - prevLead.t) : null;
      }
    }
    if (recs.length > 0 && Number.isNaN(recs[recs.length - 1].rearBumperM)) {
      const r = recs[recs.length - 1];
      r.rearBumperM = pendingRear;
      r.leadGapM = pendingLead;
      r.closingMps = pendingClosing;
    }
    prevLead = lead === null ? null : { t, g: lead };
  }
  const result = buildLessonResult(session);
  const billedEv = session.events.filter((e) => e.kind === "violation") as Array<{ code: string; t: number }>;
  const coachedEv = result.coachedMistakes ?? [];
  const graded = [
    ...coachedEv.map((c) => ({ code: c.code, t: c.t, charged: false })),
    ...billedEv.map((e) => ({ code: e.code, t: e.t, charged: true })),
  ].sort((p, q) => p.t - q.t);
  return {
    stops: recs,
    graded,
    coached: coachedEv.map((c) => c.code),
    billed: billedEv.map((e) => e.code),
    lessonMistakes: (result.lessonMistakes ?? []).map((m) => ({ code: m.code, charged: m.charged })),
    passed: result.passed,
    debrief: buildDebrief(lesson, result, { coachedMistakes: result.coachedMistakes }).text,
  };
}
let pendingRear = NaN;
let pendingLead: number | null = null;
let pendingClosing: number | null = null;

/** HARSH_BRAKING_NO_CAUSE graded (coached or charged) inside a stop's own window. */
function harshAt(out: DriveOut, s: StopRecord): { code: string; t: number; charged: boolean } | undefined {
  return out.graded.find((g) => g.code === "HARSH_BRAKING_NO_CAUSE" && g.t >= s.onsetT - 0.01 && g.t <= (s.restT ?? s.onsetT + 5) + 0.6);
}

describe("sc-follow-tailgater · the brake check at the tailgater, at every rate (63c0c28c C2a · f42dce4f)", () => {
  const grid = PROFILES.flatMap((p) => RATES.flatMap((hz) => PHASES.map((ph) => ({ p, hz, ph, out: driveBrakeChecks(hz, p, ph) }))));

  it("the antecedent is the audit's act on every drive: ~58 км/ч, the tailgater 5–7 m behind, the front lead far ahead and steady", () => {
    for (const { p, hz, ph, out } of grid) {
      const label = `${p.name} @${hz} Hz phase ${ph}`;
      expect(out.stops.length, label).toBe(1);
      const s = out.stops[0];
      expect(s.onsetKmh, label).toBeGreaterThanOrEqual(57);
      expect(s.rearBumperM, label).toBeGreaterThanOrEqual(4);
      expect(s.rearBumperM, label).toBeLessThan(TRIGGER_MAX_REAR_M);
      // The FRONT lead — the only body in the lead channel — is far outside the
      // 45 m lead window and closing only because the student is faster than it.
      expect(s.leadGapM, label).not.toBeNull();
      expect(s.leadGapM!, label).toBeGreaterThan(70);
      expect(s.closingMps!, label).toBeGreaterThan(3); // what the old term read as a cause
      expect(s.closingMps!, label).toBeLessThan(6);
      expect(s.meanDecel!, label).toBeGreaterThan(p.targetMean - 0.25);
      expect(s.meanDecel!, label).toBeLessThan(p.targetMean + 0.25);
    }
  });

  it("HARSH_BRAKING_NO_CAUSE is graded at the stop on EVERY rate, profile and phase — a car behind is never a reason to brake hard", () => {
    const missed = grid.filter(({ out }) => harshAt(out, out.stops[0]) === undefined).map(({ p, hz, ph }) => `${p.name}@${hz}Hz/ph${ph}`);
    expect(missed).toEqual([]);
  });

  it("…coached, not charged, the first time (ruling 16), and named as the lesson's own mistake (Ruling A)", () => {
    for (const { p, hz, ph, out } of grid) {
      const label = `${p.name} @${hz} Hz phase ${ph}`;
      const h = harshAt(out, out.stops[0])!;
      expect(h.charged, label).toBe(false);
      expect(out.billed, label).not.toContain("HARSH_BRAKING_NO_CAUSE");
      expect(out.lessonMistakes.find((m) => m.code === "HARSH_BRAKING_NO_CAUSE"), label).toEqual({ code: "HARSH_BRAKING_NO_CAUSE", charged: false });
      expect(out.passed, label).toBe(false);
      // THEO-4: the act is named and explained by retrieved copy, never a bare verdict.
      expect(out.debrief, label).toMatch(/Грешк(ата|ите) на този урок \(при първа поява/);
      expect(out.debrief, label).toContain("Рязко спиране без причина");
    }
  });

  it("the verdict is UNANIMOUS across the rates — the same act is no longer graded by the frame rate (f42dce4f)", () => {
    for (const p of PROFILES) {
      for (const ph of PHASES) {
        const rows = grid.filter((g) => g.p === p && g.ph === ph);
        const sig = rows.map(({ out }) => JSON.stringify({ g: out.graded.map((x) => `${x.code}:${x.charged}`), lm: out.lessonMistakes, passed: out.passed }));
        expect(new Set(sig).size, `${p.name} phase ${ph}: ${rows.map((r, i) => `${r.hz}Hz ${sig[i]}`).join(" | ")}`).toBe(1);
      }
    }
  });
});

describe("sc-follow-tailgater · the w71 wrong leg's three stops, at every rate", () => {
  const runs = RATES.map((hz) => ({ hz, out: driveBrakeChecks(hz, PROFILES[0], 0.137, 3) }));

  // ROUND 4 (integrator ruling: beyond harshBrakeSignalCauseM, base-like acquittal).
  // The first stop is THE brake check at the tailgater, with the front lead FTG_LEAD
  // 84–88 m ahead — inside the 120 m reach, where rounds 1–3 stand: graded, coached
  // (ruling 16). By the second and third stops the lead has drawn 136–138 m ahead
  // (the student rested 8 s) and he still closes on it at 4.6 m/s: beyond the reach a
  // windowed closing at harshBrakeClosingLeadMps (3 m/s) or more is base's own cause,
  // so those two stops are acquitted — identically at every rate, which is what
  // f42dce4f asks. The recorded w71/w69 replays have the same geometry (stops 2 and 3
  // with the lead 131–140 m ahead).
  //
  // ROUND 2 OF sc-follow-tailgater:63c0c28c (2026-10-09) MOVED THE THIRD STOP, and on
  // purpose. «The lead has drawn 136–138 m ahead (the student rested 8 s)» was the lead
  // MIRRORING him: matchPlayer at followGapM 150 slowed it while he stood still, so it
  // waited for him and every later stop met it again, closing. That is the defect round 2
  // repairs — the same mirroring let a 20–25 км/ч brake check at the лепка manufacture
  // its own far-lead cause — and FTG_LEAD now holds its authored constant 11.5 m/s
  // (`minMatchSpeedMps` = its cap). Measured on this drive at every rate: stop 2 meets the
  // lead 209–213 m ahead, still closing 4.61 m/s — the round-4 ruling's far closing
  // cause, still acquitted; by stop 3 the lead has run off the 400 m road and NOTHING is
  // in the lead channel (the лепка passed long ago, 227–233 m ahead of his tail). A full-
  // pedal stop from 58 км/ч with nothing ahead is the causeless brake check the drill
  // teaches against, and it is billed — charged, the lesson's own mistake having had its
  // first-fault grace at stop 1 (Ruling A / 16) — identically at all seven rates.
  it("the first stop (front lead inside the reach) is graded and coached; the second (front lead beyond the reach, closing 4.6 m/s) is acquitted; the third (nothing ahead) is charged — at every rate", () => {
    for (const { hz, out } of runs) {
      expect(out.stops.length, `${hz} Hz`).toBe(3);
      expect(out.stops[0].leadGapM!, `${hz} Hz`).toBeLessThan(DEFAULT_RULE_CONFIG.harshBrakeSignalCauseM);
      expect(out.stops[1].leadGapM!, `${hz} Hz`).toBeGreaterThan(DEFAULT_RULE_CONFIG.harshBrakeSignalCauseM);
      expect(out.stops[1].closingMps!, `${hz} Hz`).toBeGreaterThan(DEFAULT_RULE_CONFIG.harshBrakeClosingLeadMps);
      expect(out.stops[2].leadGapM, `${hz} Hz`).toBeNull();
      const h = out.stops.map((s) => harshAt(out, s));
      expect(h.map((x) => (x === undefined ? "none" : x.charged ? "charged" : "coached")), `${hz} Hz ${JSON.stringify(out.graded)}`).toEqual(["coached", "none", "charged"]);
    }
  });

  it("…and the whole drive's verdict is identical at every rate", () => {
    const sig = runs.map(({ out }) => JSON.stringify({ g: out.graded.map((x) => `${x.code}:${x.charged}`), lm: out.lessonMistakes, passed: out.passed }));
    expect(new Set(sig).size, runs.map((r, i) => `${r.hz}Hz ${sig[i]}`).join("\n")).toBe(1);
  });
});
