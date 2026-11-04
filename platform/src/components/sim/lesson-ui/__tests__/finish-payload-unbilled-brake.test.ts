/**
 * THE BRAKE CHECK THE LEDGER DID NOT BILL, ACROSS THE WIRE (2026-11-01 ·
 * `sc-follow-tailgater:63c0c28c`, founder QUESTION 10; the integrator's P7).
 * The debrief the student READS is the server's (`LessonPlayShell.tsx` renders
 * `saveResult.debriefText`), so the record has to reach `gradeFinishWire`: the
 * shell's payload carries it (times and speeds only), the server parses and
 * validates it, and describes it with ITS OWN recompiled lesson's sustain and
 * floor — never the client's. A payload without it (every older client, every
 * drive without one) grades exactly as base.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildDebrief } from "@/modules/sim/lessons";
import { gradeFinishWire } from "@/modules/sim/lessons/wire";
import { compileScenario } from "@/modules/sim/lessons/scenario/compile";
import { SC_FOLLOW_TAILGATER } from "@/modules/sim/lessons/scenario/templates-following";
import { liveChainReplay } from "@/modules/sim/lessons/scenario/__tests__/liveChainReplay";
import type { ScenarioTrace, TraceSample } from "@/modules/sim/traces/types";
import { finishLessonPayload } from "../LessonPlayShell";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const LN = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", "ln-v1.json"), "utf-8"));
const RIG = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "platform/src/modules/sim/lessons/scenario/__tests__/follow-tailgater-rig-w3e.fixture.json"), "utf-8"),
) as { drives: Record<string, { rows: number[][]; looks: Array<{ t: number; kind: string }> }> };
const UNSCOPED = /чисто каране без нито едно нарушение|задръж това ниво|чисто каране по изпитния лист|карането беше чисто по изпитния лист/u;

function rigTape(cell: string): ScenarioTrace {
  const d = RIG.drives[cell]!;
  const at = (r: number[], t: number, v: number): TraceSample => ({
    tSec: t, x: r[1]!, y: r[2]!, headingDeg: r[3]!, steerRad: 0, speedKmh: v, gear: r[5]!, indicator: "off", brakeOn: false, throttleOn: false,
  });
  const samples: TraceSample[] = [at(d.rows[0]!, 0, 0)];
  for (const r of d.rows) if (r[0]! > samples[samples.length - 1]!.tSec + 1e-9) samples.push(at(r, r[0]!, r[4]!));
  return {
    meta: { scenarioId: SC_FOLLOW_TAILGATER.id, kind: "attempt", version: 1, durationSec: samples[samples.length - 1]!.tSec },
    samples,
    events: d.looks.map((l) => ({ tSec: l.t, kind: l.kind as never })),
  };
}

const drive = (cell: string, L: 1 | 3) => liveChainReplay({ lesson: compileScenario(SC_FOLLOW_TAILGATER, L), districtRaw: LN, trace: rigTape(cell) });
const payloadOf = (o: ReturnType<typeof drive>) =>
  JSON.parse(
    JSON.stringify(
      finishLessonPayload({ lessonId: o.lesson.id, startedAtMs: 1_000, finishedAtMs: 51_000, state: o.session, result: o.result, microQuiz: { total: 0, correct: 0 } }),
    ),
  );

describe("the record across the wire", () => {
  const pump = drive("pc-L3-PUMP245", 3);
  const floored = drive("pc-L1-TASF348", 1);

  it("PUMP245: the payload carries the record (times and speeds only), the server keeps it and debriefs it named, with no unscoped praise", () => {
    const p = payloadOf(pump);
    expect(p.unbilledHardBrakes).toEqual([
      expect.objectContaining({ form: "pumped", sinceSec: pump.result.unbilledHardBrakes![0]!.sinceSec }),
    ]);
    expect(Object.keys(p.unbilledHardBrakes[0]).sort()).toEqual(["atSec", "form", "onsetKmh", "shownKmh", "sinceSec"]);
    const graded = gradeFinishWire(p);
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.result.unbilledHardBrakes).toEqual(pump.result.unbilledHardBrakes);
    const text = buildDebrief(graded.lesson, graded.result, { coachedMistakes: graded.result.coachedMistakes }).text;
    expect(text).toBe(pump.debrief);
    expect(text).toContain("Рязко спиране, което не влезе в точките:");
    expect(text).not.toMatch(UNSCOPED);
  });

  it("TASF348: the floored record reaches the server debrief the same way", () => {
    const graded = gradeFinishWire(payloadOf(floored));
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.result.unbilledHardBrakes?.map((r) => r.form)).toEqual(["floored"]);
    expect(buildDebrief(graded.lesson, graded.result, { coachedMistakes: graded.result.coachedMistakes }).text).toBe(floored.debrief);
  });

  it("the sustain and the floor are the SERVER's lesson config — a client's own numbers are not read", () => {
    const p = payloadOf(pump);
    p.unbilledHardBrakes[0].sustainSec = 9;
    p.unbilledHardBrakes[0].floorKmh = 99;
    const graded = gradeFinishWire(p);
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.result.unbilledHardBrakes![0]!.sustainSec).toBe(0.4);
    expect(graded.result.unbilledHardBrakes![0]!.floorKmh).toBe(35);
  });

  it("a malformed record refuses the payload (a form the product has no sentence for, a negative time)", () => {
    for (const bad of [{ form: "slammed" }, { sinceSec: -1 }, { atSec: -5 }, { shownKmh: Number.NaN }]) {
      const p = payloadOf(pump);
      Object.assign(p.unbilledHardBrakes[0], bad);
      expect(gradeFinishWire(JSON.parse(JSON.stringify(p))).status, JSON.stringify(bad)).not.toBe("ok");
    }
  });

  it("a payload WITHOUT the field (an older client) grades as base: no record on the result", () => {
    const p = payloadOf(pump);
    delete p.unbilledHardBrakes;
    const graded = gradeFinishWire(p);
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect("unbilledHardBrakes" in graded.result).toBe(false);
  });

  it("a drive without a record sends no field at all", () => {
    const careful = drive("pc-L1-C", 1);
    expect("unbilledHardBrakes" in payloadOf(careful)).toBe(false);
  });
});
