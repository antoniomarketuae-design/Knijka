/**
 * THE ENDING'S SENTENCE IS CARRIED FROM THE ENGINE TO THE END CARD — AND NO
 * FURTHER — lane endings2, item B (integrator rulings N2–N4).
 *
 *  · the engine stamps the exact ending event it pushes (`endingCopy`), on the
 *    frame that completes the drive, at every ending site;
 *  · `buildLessonResult` carries it (`LessonResult.ending`), and the shell's
 *    finalize hands THAT result to the end screen (`setResult`);
 *  · `finishLessonPayload` never sends it: it is client display metadata, not
 *    a fact the server grades or debriefs from (N3);
 *  · an ending with no sentence today (the completed run-out, the exam
 *    termination alone, an abort, `finishSession`) carries none (N4).
 *
 * Real cells: committed demo tapes through the live chain, one per ending
 * kind, chosen from the lane's census (scratch/endings2-impl).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SimTick } from "@/modules/sim/rules";
import { offNetworkEndingCopy } from "@/modules/sim/lessons/finish";
import { makeTick } from "@/modules/sim/lessons/__tests__/fixtures";
import { SC_HZ_BRAKE_DONT_SWERVE } from "@/modules/sim/lessons/scenario/templates-hazards2";
import {
  SCENARIO_TEMPLATES,
  abortSession,
  applyTick,
  buildLessonResult,
  compileScenario,
  createLessonSession,
  finishSession,
  type LessonSpec,
  type LessonResult,
  type LessonSessionState,
} from "@/modules/sim/lessons";
import type { FinishLessonWire } from "@/modules/sim/lessons";
import { parseScenarioTrace } from "@/modules/sim/traces/parse";
import { liveChainReplay } from "@/modules/sim/lessons/scenario/__tests__/liveChainReplay";
import { loadDistrict } from "@/modules/sim/lessons/scenario/__tests__/witnessLiveRung";
import { finalizeLessonSession } from "../LessonPlayShell";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

interface Run {
  session: LessonSessionState;
  pushed: Array<{ t: number; titleBg: string; explanationBg: string; lawRef?: string }>;
  /** The phase on the frame each ending was pushed. */
  phaseAtPush: string[];
  /** endingCopy before the completing frame (must be absent). */
  copyBefore: unknown[];
}

function run(id: string, file: string, L: 1 | 2 | 3 | 4 | 5): Run {
  const spec = SCENARIO_TEMPLATES.find((x) => x.id === id)!;
  const lesson = compileScenario(spec, L);
  const trace = parseScenarioTrace(JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "traces", id, file), "utf-8")))!;
  const out: Run = { session: undefined as never, pushed: [], phaseAtPush: [], copyBefore: [] };
  const o = liveChainReplay({
    lesson,
    districtRaw: loadDistrict(spec.map.districtId),
    trace,
    holdAfterSec: 30,
    afterApply: ({ t, step, session: before }) => {
      for (const e of step.hudEvents) {
        if (e.kind === "lesson" && /^Край/u.test(e.titleBg)) {
          out.pushed.push({ t, titleBg: e.titleBg, explanationBg: e.explanationBg, ...(e.lawRef !== undefined ? { lawRef: e.lawRef } : {}) });
          out.phaseAtPush.push(step.state.phase);
          out.copyBefore.push(before.endingCopy);
        }
      }
    },
  });
  out.session = o.session;
  return out;
}

/** A tick stream straight through applyTick, with the same record as `run`. */
function feed(lesson: LessonSpec, ticks: SimTick[]): Run {
  let s = createLessonSession(lesson);
  const out: Run = { session: s, pushed: [], phaseAtPush: [], copyBefore: [] };
  for (const k of ticks) {
    const before = s;
    const step = applyTick(s, k);
    s = step.state;
    for (const e of step.hudEvents) {
      if (e.kind === "lesson" && /^Край/u.test(e.titleBg)) {
        out.pushed.push({ t: k.t, titleBg: e.titleBg, explanationBg: e.explanationBg, ...(e.lawRef !== undefined ? { lawRef: e.lawRef } : {}) });
        out.phaseAtPush.push(s.phase);
        out.copyBefore.push(before.endingCopy);
      }
    }
  }
  out.session = s;
  return out;
}

/** One committed cell per ending kind (the census names each; see the lane report). */
const KINDS: Array<{ kind: string; id: string; file: string; L: 1 | 2 | 3 | 4 | 5; lawRef?: boolean }> = [
  { kind: "K1 gate-1 arrival", id: "sc-junction-stop", file: "mistake-rolling-stop.trace.json", L: 1 },
  { kind: "K1b gate-1 no-mark latch", id: "sc-sig-green-wave", file: "mistake-sprint.trace.json", L: 2 },
  { kind: "K2 stalled run-out", id: "sc-crossing-white-cane", file: "mistake-not-yielded.trace.json", L: 1 },
  { kind: "K4 gate 2, exam, inside, short of the mark", id: "sc-park-parallel-exit", file: "mistake-no-room.trace.json", L: 4 },
  { kind: "K4 gate 2, lesson, inside", id: "sc-park-perp-rev", file: "mistake-no-observation.trace.json", L: 1 },
  { kind: "K4 gate 2, lesson, outside", id: "sc-rb-exit-signal", file: "mistake-exit-no-signal.trace.json", L: 1 },
  { kind: "K6 crash pin, a person struck", id: "sc-pe-jaywalker", file: "mistake-collision.trace.json", L: 2, lawRef: true },
  { kind: "K6 crash pin, a vehicle struck", id: "sc-junction-rhr", file: "mistake-no-look.trace.json", L: 1 },
];

const NONE: Array<{ kind: string; id: string; file: string; L: 1 | 2 | 3 | 4 | 5; terminated?: boolean }> = [
  { kind: "K7 completed run-out", id: "sc-park-perp-rev", file: "shadow-correct.trace.json", L: 1 },
  { kind: "K8 exam termination at the bill", id: "sc-junction-rhr", file: "mistake-no-look.trace.json", L: 4, terminated: true },
  { kind: "K10 never ended", id: "sc-park-parallel-exit", file: "mistake-no-look.trace.json", L: 1 },
];

describe("endingCopy — stamped equal to the pushed event, on the completing frame, at every ending kind", () => {
  for (const c of KINDS) {
    it(`${c.kind}: ${c.id}/${c.file}@L${c.L}`, () => {
      const r = run(c.id, c.file, c.L);
      expect(r.pushed.length).toBe(1);
      const ev = r.pushed[0];
      expect(r.phaseAtPush).toEqual(["completed"]);
      expect(r.copyBefore).toEqual([undefined]);
      const { t: _t, ...copy } = ev;
      expect(r.session.endingCopy).toEqual(copy);
      expect(r.session.endedAtSec).toBe(ev.t);
      if (c.lawRef === true) expect(ev.lawRef).toBe("ЗДвП чл. 123, ал. 1");
      else expect(ev.lawRef).toBeUndefined();
      const result = buildLessonResult(r.session);
      expect(result.ending).toEqual(copy);
    });
  }
  for (const c of NONE) {
    it(`no sentence, no copy — ${c.kind}: ${c.id}/${c.file}@L${c.L}`, () => {
      const r = run(c.id, c.file, c.L);
      expect(r.pushed).toEqual([]);
      expect(r.session.endingCopy).toBeUndefined();
      expect(buildLessonResult(r.session).ending).toBeUndefined();
      if (c.terminated === true) expect(r.session.examTermination).toBeDefined();
    });
  }

  // No committed tape reaches these two kinds (the census counts 0 of each), so
  // they are tick streams on the lessons' own geometry, as the endings lane's
  // own pins drive them (lessons/__tests__/endings-gate1-runout.test.ts).
  it("K3 E2 standstill — sc-hz-brake-dont-swerve@L1: the block touched, the car slides 9.85 m past the mark and stands", () => {
    const lesson = compileScenario(SC_HZ_BRAKE_DONT_SWERVE, 1);
    const at = (y: number, speedKmh: number, t: number, x = 4.06, hit = false): SimTick =>
      makeTick({ t, position: { x, y }, headingDeg: 0, speedKmh, ...(hit ? { events: [{ kind: "collision" as const, withWhat: "staticObject" as const }] } : {}) });
    const ticks: SimTick[] = [];
    let t = 0;
    for (let y = 60; y <= 183; y += 3) ticks.push(at(y, 45, (t += 0.24)));
    const t0 = t;
    ticks.push(at(186.78, 30, t0 + 1 / 60, 3.03, true));
    for (let i = 1; i <= 30; i++) {
      const f = i / 30;
      ticks.push(at(186.78 + (193.098 - 186.78) * f, 30 * (1 - f) + 2, t0 + (i + 1) / 60, 3.03 + (0.28 - 3.03) * f));
    }
    const tRest = t0 + 32 / 60;
    for (let i = 0; i < 60 * 20; i++) ticks.push(at(193.098, 0, tRest + i / 60, 0.28));
    const r = feed(lesson, ticks);
    expect(r.pushed.length).toBe(1);
    expect(r.copyBefore).toEqual([undefined]);
    const { t: _t, ...copy } = r.pushed[0];
    expect(copy.explanationBg.startsWith("Оставащите задачи")).toBe(true);
    expect(r.session.routeFinishRunOut).toBeUndefined();
    expect(r.session.endingCopy).toEqual(copy);
    expect(buildLessonResult(r.session).ending).toEqual(copy);
  });

  it("K5 off-network — sc-pe-jaywalker@L2: off the authored world for OFF_NETWORK_STUCK_S", () => {
    const lesson = compileScenario(SCENARIO_TEMPLATES.find((x) => x.id === "sc-pe-jaywalker")!, 2);
    const ticks: SimTick[] = [];
    // 7 m up the approach (short of every mark), then off the authored world — still crawling, so no standstill gate is in play.
    for (let i = 0; i < 5 * 20; i++) ticks.push(makeTick({ t: i * 0.05, speedKmh: 5, headingDeg: 0, position: { x: 4.06, y: -40 + i * 0.07 } }));
    for (let i = 0; i < 80 * 20; i++) ticks.push(makeTick({ t: 5 + i * 0.05, speedKmh: 3, headingDeg: 90, position: { x: 40 + (i % 2) * 0.01, y: -30 }, edgeId: null }));
    const r = feed(lesson, ticks);
    expect(r.pushed.length).toBe(1);
    expect(r.copyBefore).toEqual([undefined]);
    const { t: _t, ...copy } = r.pushed[0];
    expect(copy).toEqual((({ kind: _k, ...rest }) => rest)(offNetworkEndingCopy(false)));
    expect(r.session.endingCopy).toEqual(copy);
    expect(buildLessonResult(r.session).ending).toEqual(copy);
  });

  it("an ABORTED drive and a FINISHED free session carry no ending", () => {
    const spec = SCENARIO_TEMPLATES.find((x) => x.id === "sc-pe-jaywalker")!;
    const lesson = compileScenario(spec, 2);
    const trace = parseScenarioTrace(JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "traces", "sc-pe-jaywalker", "shadow-correct.trace.json"), "utf-8")))!;
    let mid: LessonSessionState | null = null;
    liveChainReplay({
      lesson, districtRaw: loadDistrict(spec.map.districtId), trace,
      afterApply: ({ t, step }) => { if (mid === null && t >= 5) mid = step.state; },
    });
    expect(mid).not.toBeNull();
    const aborted = abortSession(mid!, 5.1);
    expect(aborted.endingCopy).toBeUndefined();
    expect(buildLessonResult(aborted).ending).toBeUndefined();
    const finished = finishSession(mid!, 5.1);
    expect(finished.endingCopy).toBeUndefined();
    expect(buildLessonResult(finished).ending).toBeUndefined();
  });
});

describe("the shell's finalize — the end screen gets the ending, the server never does", () => {
  it("finalizeLessonSession: setResult carries `ending`; the wire has no ending key and none of its text", () => {
    const c = KINDS.find((k) => k.lawRef === true) ?? KINDS[0];
    const r = run(c.id, c.file, c.L);
    expect(r.session.endingCopy, "the cell's ending was stamped").toEqual((({ t: _t, ...x }) => x)(r.pushed[0]));
    let shown: LessonResult | null = null;
    const sent: FinishLessonWire[] = [];
    finalizeLessonSession(r.session, {
      lessonId: r.session.lesson.id,
      mistakeExperience: false,
      rubric: undefined,
      startedAtMs: 1_000,
      microQuiz: { total: 0, correct: 0 },
      finishTrace: () => null,
      now: () => 71_000,
      setResult: (x) => { shown = x; },
      setRubric: () => {},
      setTraceUploaded: () => {},
      send: (w) => { sent.push(w); return new Promise(() => {}); },
      setSaveResult: () => {},
    });
    expect(shown).not.toBeNull();
    expect(shown!.ending).toEqual(r.session.endingCopy);
    expect(sent.length).toBe(1);
    expect(Object.keys(sent[0])).not.toContain("ending");
    const json = JSON.stringify(sent[0]);
    expect(json.includes(r.session.endingCopy!.explanationBg)).toBe(false);
    expect(json.includes(r.session.endingCopy!.titleBg)).toBe(false);
  });

  it("the shell mounts the end screen with the client result finalize set", () => {
    const shell = readFileSync(path.join(HERE, "..", "LessonPlayShell.tsx"), "utf-8");
    const at = shell.indexOf("<SessionEndScreen");
    expect(at).toBeGreaterThan(0);
    const mount = shell.slice(at, shell.indexOf("/>", at));
    expect(mount).toMatch(/\n\s*result=\{result\}\n/);
    expect(shell).toMatch(/const \[result, setResult\] = useState<LessonResult \| null>\(null\);/);
  });
});
