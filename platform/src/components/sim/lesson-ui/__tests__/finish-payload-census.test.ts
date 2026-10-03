/**
 * THE PAYLOAD PARITY, AS A CENSUS — round-6 verifier R1 (task-cap lane, round 7).
 *
 * `finish-payload.test.ts` proves the shell's payload parity on three synthetic
 * spray drives. The round-6 verifier measured what that leaves open: 15 of 24
 * new mutants of the payload builder (`finishLessonPayload`) and of its call
 * site (`finalizeLessonSession`) survived it and every other test that imports
 * the shell or the wire (188 files, 4,199 tests), while the server's stored
 * result differed from what the client had shown:
 *  · PB11 (only the TASK coached rows sent): 595 of 1,906 committed drives
 *    differ and the verdict FLIPS on 65 — ADR-009's «не е взет» lost on the
 *    server;
 *  · PB19 (only the first coached row): 58 drives;
 *  · PB20 (only the first escalation): sc-vu-cyclist-group L1/L3
 *    mistake-narrow, effective score 13.5 on the client and 10.5 on the server;
 *  · PB13 (coached rows sent without their act): 132 drives;
 *  · PB9 (commendations dropped): 742 server debriefs differ;
 * and PB8, PB10, PB14, PB18 and CS8–CS13 each drop or bend a channel the
 * server stores or the shell shows (objective detail, event positions,
 * near-misses, the attempt trace, the save result, the observation moments,
 * the «Виж своя дубъл» link, the rubric). None of the three synthetic drives
 * hits a lesson target, a second coached row, a second escalation, a parking
 * rubric or a recorded attempt, so each of those was invisible to it.
 *
 * So this file runs the shell's OWN finalize body over EVERY committed drive:
 * every recorded trace of every template, at EVERY rung the template has (L1
 * to L5, the exam rung included — round 8), with these endings (round 8, the
 * round-7 verifier's R1–R4 and C1; round 9, the round-8 verifier's F1–F3):
 *  · F — finished, the drive's own recording handed in as the attempt, the
 *    save succeeds;
 *  · A — ABORTED half-way, the drive's own recording as the attempt (the real
 *    shell records an aborted drive too), the save SUCCEEDS;
 *  · X — finished, no recording, and the server's answer taken in turn from
 *    EVERY value the save can produce (round 8: the failed save only);
 *  · R — aborted half-way, no recording, and the server's answer taken in turn
 *    from EVERY value the save can produce (round 9);
 *  · G — finished, the recording, the same full save domain (round 9);
 *  · B — ABORTED AT EVERY EVENT BOUNDARY of the drive — right after each
 *    violation, commendation, coached row, escalation, breach row, near-miss
 *    and completed objective the session recorded — with the recording and the
 *    full save domain (round 9);
 *  · N — the same aborts at every event boundary WITHOUT a recording (a
 *    curriculum lesson records none), with the full save domain (round 9);
 *  · S — a THEO-3 sandbox (mistake experience): nothing may be sent, and the
 *    rubric it shows is still the one its drive earned.
 * Each drive gets its own wall clocks and its own micro-quiz. For each one the
 * payload `finalizeLessonSession` sends is graded by the server's own
 * `gradeFinishWire`, and what the server would STORE and SHOW is compared with
 * what the shell SHOWED, field by field:
 *  · the grade — score, training score, verdict, official verdict, abort,
 *    completion, the exam termination, every violation (code, time, points,
 *    class, concept, title), every commendation (code, time, title), EVERY
 *    escalation, every ADR-009 lesson mistake (with its charge and act), every
 *    coached row WITH its act and title, every breach row;
 *  · the rebuilt event log — every violation AND commendation, with its act;
 *  · the stored channels — every event position, every near-miss, every
 *    objective with its measured detail, the observation moments, the attempt
 *    trace, the rubric stars the server recomputes;
 *  · the debrief the student reads (the server's) against the shell's own;
 *  · the call site's own outputs — the result it shows, «Виж своя дубъл»
 *    offered exactly when the server stored the recording, the clocks and the
 *    micro-quiz it sends, and the save result it hands the screen: the server's
 *    own answer whatever it is (a stored session, or a refusal with the
 *    server's code), SAVE_FAILED only when the save itself failed.
 *
 * ROUND 9 — THE PARITY STOP RULE (the integrator's ruling for round 9). Rounds
 * 6, 7 and 8 each ended with a few builder or call-site mutants surviving, every
 * time because this census drove only the value SHAPES the committed drives
 * happen to carry: a quiz of `correct = drives % 2` (never n of n, n ≥ 2 — the
 * round-8 verifier's Q1, 3,627 of 15,938 finalize calls), three of the server's
 * refusal codes (Q2: INVALID_INPUT and UNKNOWN_LESSON shown as SAVE_FAILED, 951
 * saves), and aborts at the FIRST event only (Q6: an aborted drive losing its
 * ×1.5 escalation, sc-vu-cyclist-hook and sc-vu-bikelane-turn, client 25 / 35
 * against server 20 / 30). So every field the payload carries is now driven over
 * its FULL DECLARED DOMAIN, derived from the source and never hand-listed:
 *  · the micro-quiz — every (correct, total) with 0 ≤ correct ≤ total over the
 *    totals the product can produce: 0 to the largest `maxPerSession` in
 *    `QUIZ_TUNING` (the shell counts one per answered quiz, the trigger stops at
 *    that cap, and a retry resets both — pinned from the shell's source below);
 *  · the save result — every code of the `FinishLessonActionResult` union
 *    `simulator/actions.ts` declares its action to return (followed through its
 *    import to `lesson-ui/types.ts`) and every refusal the action's own body
 *    returns (the test fails if either cannot be read, if the two disagree, or
 *    if they drift from the list this file names), plus a stored session (the
 *    union's `ok` shape, with and without XP and concepts — its field list read
 *    from the union too) and a rejected save — each on a FINISHED (X, G) and on
 *    an ABORTED (R, B, N) drive, each WITH (G, B) and WITHOUT (X, R, N) a
 *    recording, and on every rung;
 *  · the start clock — a number, and null (the call site then stamps its own);
 *  · near-misses — every kind the wire accepts, with and without a place,
 *    injected the way the scene reports them (`applyNearMiss`); their list
 *    length to the wire's own cap is driven in `finish-payload.test.ts`;
 *  · aborts — at every event boundary, an objective completed included (B, N).
 * The ledger below proves each value was really driven on each kind of ending.
 *
 * Every comparison is non-vacuous: the census asserts that the committed drives
 * really contain each thing a mutant would drop (a second escalation, a
 * target, a commendation, a parking rubric the attempt changes, …), so a
 * future content change that removed one would fail here instead of silently
 * weakening the guard.
 *
 * Each trace is recorded ONCE and its tick stream replayed into every rung and
 * every ending (the recorders are scripted and never read the session).
 *
 * ROUND 10 (the round-9 verifier's R3 and C1): the near-miss each drive carries
 * sends a relative speed from the DERIVED domain (`REL_SPEED_DOMAIN`: the scene
 * detector's own real-number readings and the wire's declared ends), one value per
 * near-miss sent, and the ledger requires every value on a finished AND an aborted
 * drive; the save domain gains a stored session with several concepts and 0 XP.
 *
 * ROUND 11 (the round-10 verifier's F5 and F6, under the stop rule): the
 * near-miss's CLEARANCE walks a domain DERIVED from the scene's detector
 * (`CLEARANCE_DOMAIN`: the exact 0 its overlap clamp reports, its Float32
 * readings up to just under `enterClearanceM`, and the wire's declared ends), and
 * the ledger requires every value with EVERY kind on a finished AND an aborted
 * drive; the payload's CLOCKS are `Date.now()` readings — the call the shell's
 * own call sites make (`clockCallSitesFromShell`) — at epoch scale with every
 * millisecond remainder class, on finished and aborted drives.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SCENARIO_TEMPLATES,
  abortSession,
  applyNearMiss,
  applyTick,
  buildDebrief,
  buildLessonResult,
  compileScenario,
  createLessonSession,
  finishSession,
  parkingObservationFromTrace,
  scoreRubric,
  type LessonResult,
  type LessonSessionState,
  type RubricScore,
  type ScenarioLevel,
} from "@/modules/sim/lessons";
import { gradeFinishWire, type FinishLessonWire } from "@/modules/sim/lessons/wire";
import { compactTraceForStorage, parseScenarioTrace, type ScenarioTrace } from "@/modules/sim/traces";
import type { SimTick } from "@/modules/sim/rules";
import { finalizeLessonSession } from "../LessonPlayShell";
import type { FinishLessonActionResult } from "../types";
import {
  NEAR_MISS_KINDS,
  QUIZ_DOMAIN,
  QUIZ_MAX_TOTAL,
  REFUSAL_CODES,
  REL_SPEED_DOMAIN,
  SAVE_KEYS,
  CLEARANCE_DOMAIN,
  EPOCH_ORIGIN_MS,
  EPOCH_REMAINDERS_MS,
  clearancesFromDetector,
  clockCallSitesFromShell,
  nearMissClearanceRangeFromWire,
  nearMissCapFromWire,
  nearMissKindsFromWire,
  nearMissRelSpeedRangeFromWire,
  relSpeedsFromDetector,
  okFieldsFromUnion,
  refusalCodesFromAction,
  refusalCodesFromUnion,
  refusalsInBody,
  saveDomain,
  unionSourceOfAction,
  type SaveValue,
} from "./payload-domains";

// `import.meta.glob` is Vite's compile-time transform (vitest runs it); the app's
// tsconfig carries no `vite/client` types, so the one signature used is declared here.
declare global {
  interface ImportMeta {
    glob(pattern: string, options: { eager: true }): Record<string, Record<string, unknown>>;
  }
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const PLATFORM_ROOT = path.resolve(HERE, "../../../../..");
const UNPLAYABLE = [
  "sc-sign-warning/mistake-hold-speed",
  "sc-sign-warning/mistake-no-slowdown",
  "sc-sign-warning/shadow-correct",
  "sc-driver-distraction/mistake-late-react",
  "sc-driver-distraction/mistake-no-brake",
  "sc-driver-distraction/shadow-correct",
  "sc-accident-own-conduct/mistake-clip-continue",
  "sc-accident-own-conduct/mistake-hit-and-flee",
  "sc-accident-own-conduct/shadow-correct",
  "sc-animal-hazard/mistake-cross-line",
  "sc-animal-hazard/mistake-swerve-oncoming",
  "sc-animal-hazard/shadow-correct",
  "sc-lane-control-signal/mistake-closed-lane",
  "sc-lane-control-signal/mistake-wrong-way",
  "sc-lane-control-signal/shadow-correct",
];

// ---------------------------------------------------------------------------
// ROUND 9 — THE DOMAINS, DERIVED FROM THE SOURCE
// ---------------------------------------------------------------------------

type Rec = (...a: unknown[]) => unknown;
const mods = import.meta.glob("../../../../modules/sim/traces/sc*.ts", { eager: true }) as Record<
  string,
  Record<string, unknown>
>;
const three = new Map<string, Rec>();
const four: Rec[] = [];
for (const m of Object.values(mods)) {
  for (const [name, fn] of Object.entries(m)) {
    if (typeof fn !== "function" || !/^record\w*Drive$/.test(name)) continue;
    const id = name
      .replace(/^record/, "")
      .replace(/Drive$/, "")
      .replace(/([A-Z])/g, "-$1")
      .toLowerCase()
      .replace(/^-/, "");
    if ((fn as Rec).length >= 4) four.push(fn as Rec);
    else {
      three.set(id, fn as Rec);
      three.set(id.replace(/-/g, ""), fn as Rec);
    }
  }
}
const ALIAS: Record<string, string> = {
  "sc-vu-cyclist-hook": "sc-vu-cyclist",
  "sc-vu-pass-clearance": "sc-vu-pass",
  "sc-vu-door-zone": "sc-vu-door",
  "sc-rx-tram-stop-doors": "sc-rx-tram-stop",
};
const districts = new Map<string, unknown>();
function district(id: string): unknown {
  if (!districts.has(id)) {
    districts.set(id, JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8")));
  }
  return districts.get(id);
}

/** Record a committed drive's tick stream once; null when no recorder can play it. */
function recordTicks(specId: string, districtId: string, traceName: string): SimTick[] | null {
  const ticks: SimTick[] = [];
  const onTick = (t: SimTick) => {
    ticks.push(t);
  };
  const f = three.get(specId) ?? three.get(specId.replace(/-/g, "")) ?? three.get(ALIAS[specId] ?? "");
  try {
    if (f) {
      f(district(districtId), traceName, { onTick });
      return ticks;
    }
    for (const g of four) {
      ticks.length = 0;
      try {
        g(district(districtId), specId, traceName, { onTick });
        return ticks;
      } catch {
        /* the next generic recorder */
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** EVERY field of a grade the server stores and the result screen reads. */
function gradeOf(r: LessonResult) {
  return {
    score: r.score,
    effectiveScore: r.effectiveScore,
    passed: r.passed,
    aborted: r.aborted,
    completedAll: r.completedAll,
    officialPassed: r.summary.passed,
    totalPoints: r.summary.score.totalPoints,
    terminated: r.summary.terminated,
    examTermination: r.examTermination ?? null,
    violations: r.summary.mistakes.map((m) => [m.code, m.t, m.points, m.severityClass, m.conceptId ?? null, m.titleBg]),
    commendations: r.summary.commendations.map((m) => [m.code, m.t, m.titleBg]),
    escalations: r.escalations.map((e) => [e.code, e.t, e.multiplier]),
    lessonMistakes: (r.lessonMistakes ?? []).map((m) => [m.code, m.t, m.charged, m.detail ?? null]),
    coached: (r.coachedMistakes ?? []).map((c) => [c.code, c.t, c.detail ?? null, c.titleBg]),
    breaches: (r.taskCapBreaches ?? []).map((b) => [b.objectiveId, b.t]),
    objectives: r.objectives.map((o) => [o.id, o.done, o.completedAtSec, o.detail ?? null]),
    // Round 9: the near-misses the debrief reads (`wire.ts gradeFinishWire` carries them since round 9).
    nearMisses: (r.nearMisses ?? []).map((n) => [n.tSec, n.kind, n.clearanceM, n.relSpeedMps, n.x, n.y]),
  };
}
/** The event log the server rebuilds and stores — violations AND commendations, with their act. */
function eventsOf(events: LessonSessionState["events"]) {
  return events.map((e) => [
    e.kind,
    e.code,
    e.t,
    (e.kind === "violation" ? e.detail : (e as { situation?: string }).situation) ?? null,
  ]);
}
const byKey = (a: unknown[], b: unknown[]) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1);
/** Where two JSON values first differ — so a mismatch names its field, not a truncated blob. */
function firstDiff(a: unknown, b: unknown, at = ""): string {
  if (JSON.stringify(a) === JSON.stringify(b)) return "";
  if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
    const keys = [...new Set([...Object.keys(a as object), ...Object.keys(b as object)])];
    for (const k of keys) {
      const d = firstDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${at}.${k}`);
      if (d !== "") return d;
    }
  }
  return `${at}: ${String(JSON.stringify(a)).slice(0, 160)} ≠ ${String(JSON.stringify(b)).slice(0, 160)}`;
}
/** Objectives the session has completed. */
const objectivesDone = (s: LessonSessionState) => s.objectives.filter((o) => o.status === "done").length;
/** What changes at an event boundary: every channel an abort there would carry (an objective completed included). */
const boundarySig = (s: LessonSessionState) =>
  `${s.events.length}|${s.coachedMistakes.length}|${s.penaltyEscalations.length}|${(s.taskCapBreaches ?? []).length}|${(s.nearMisses ?? []).length}|${objectivesDone(s)}`;

type Ending = "F" | "A" | "X" | "R" | "G" | "B" | "N" | "S";
const ENDINGS: Ending[] = ["F", "A", "X", "R", "G", "B", "N", "S"];
/** The endings that hand finalize the drive's own recording. */
const RECORDED: ReadonlySet<Ending> = new Set<Ending>(["F", "A", "G", "B"]);
interface Pending {
  label: string;
  saved: FinishLessonActionResult[];
  /** What the screen must be handed: nothing at all for a sandbox. */
  expectSaved: FinishLessonActionResult[];
}

describe("ROUND 9 — the domains the census drives are READ from the source (the parity stop rule)", () => {
  it("the save result: the union finishLessonAction is DECLARED to return (read from actions.ts, followed through its import) equals the refusals its body returns and the list this census drives; the stored session's fields are the union's — and nothing is unreadable", () => {
    const where = unionSourceOfAction();
    expect(where.unresolved).toBe(0);
    expect(where.file).toBe(path.join(PLATFORM_ROOT, "src", "components", "sim", "lesson-ui", "types.ts"));
    const action = refusalCodesFromAction();
    const union = refusalCodesFromUnion();
    expect(action.unresolved).toBe(0);
    expect(union.unresolved).toBe(0);
    expect(action.codes).toEqual(union.codes);
    expect(action.codes).toEqual([...REFUSAL_CODES]);
    // The action can also THROW (the entitlement gate, a non-timeout error): the rejected save is in the domain too.
    const src = readFileSync(path.join(PLATFORM_ROOT, "src", "app", "(dashboard)", "simulator", "actions.ts"), "utf-8");
    expect(src).toContain('throw new Error("finishLessonAction: no simulator entitlement")');
    expect(SAVE_KEYS).toEqual(["ok", "ok+xp", "ok+2c0xp", "reject", ...REFUSAL_CODES]);
    // The stored session: every field the union's `ok` variant declares, and nothing else, on both ok values…
    const ok = okFieldsFromUnion();
    expect(ok.unresolved).toBe(0);
    for (const v of saveDomain(1).filter((x) => x.answer !== undefined && x.answer.ok)) {
      expect(Object.keys(v.answer as object).sort(), v.key).toEqual(ok.fields);
    }
    // …with its nullable and list fields at every end they reach (xpEarned null, a number and 0 — round 10, the
    // round-9 verifier's C1; no concept, one and several).
    const oks = saveDomain(1).flatMap((x) => (x.answer !== undefined && x.answer.ok ? [x.answer] : []));
    expect(oks.map((x) => x.xpEarned)).toEqual([null, 40, 0]);
    expect(oks.map((x) => x.concepts.length)).toEqual([0, 1, 2]);
    // Near-misses: every kind the wire accepts.
    const nm = nearMissKindsFromWire();
    expect(nm.unresolved).toBe(0);
    expect(nm.kinds).toEqual([...NEAR_MISS_KINDS]);
    // …and the relative speed over its DERIVED domain (round 10, the round-9 verifier's R3): the range the wire
    // declares, read from wire.ts, and the readings the scene's own detector reports — real numbers, not integers.
    const range = nearMissRelSpeedRangeFromWire();
    expect(range).toEqual({ min: 0, max: 200 });
    const det = relSpeedsFromDetector();
    expect(det.filter((v) => !Number.isInteger(v)).length).toBeGreaterThanOrEqual(3);
    expect(REL_SPEED_DOMAIN).toEqual([...new Set([0, 200, ...det])].sort((a, b) => a - b));
    for (const v of REL_SPEED_DOMAIN) expect(v >= (range?.min ?? 1) && v <= (range?.max ?? -1), String(v)).toBe(true);
    // ROUND 11 (F5): the clearance over its DERIVED domain — the wire's declared range, and the detector's readings:
    // the EXACT 0 of its overlap clamp and Float32 readings, every one under its enter clearance.
    const cr = nearMissClearanceRangeFromWire();
    expect(cr).toEqual({ min: 0, max: 50 });
    const cd = clearancesFromDetector();
    expect(cd[0]).toBe(0);
    expect(cd.filter((v) => v > 0 && v < 0.15).length).toBeGreaterThanOrEqual(2);
    expect(cd.filter((v) => v !== Math.fround(v) || Math.round(v * 100) / 100 !== v).length).toBeGreaterThanOrEqual(5);
    expect(Math.max(...cd)).toBeLessThan(0.75);
    expect(CLEARANCE_DOMAIN).toEqual([...new Set([0, 50, ...cd])].sort((a, b) => a - b));
    // ROUND 11 (F6): the clocks — every call site the shell stamps a clock at is `Date.now()`, so the domain is Date.now()
    // readings; the origin is one, and every remainder class is walked.
    expect(clockCallSitesFromShell()).toEqual({ clock: "Date.now", starts: 2, nows: 1 });
    expect(EPOCH_ORIGIN_MS).toBeGreaterThan(1.7e12);
    expect(Number.isInteger(EPOCH_ORIGIN_MS)).toBe(true);
    // …and a whole millisecond's every residue under the second.
    expect(EPOCH_REMAINDERS_MS.length).toBe(1000);
    expect(EPOCH_REMAINDERS_MS.every((r, i) => r === i)).toBe(true);
  });
  it("the readers FAIL on what they cannot read — a refusal written another way, a union or a near-miss guard with a stray token (mutation-tested on synthetic sources)", () => {
    // The readers ARE the census's domain; a reader that silently shrank would shrink the census.
    const two = ['return { ok: false, code: "A" };', 'return { ok: false, code: "B" };'].join("\n");
    expect(refusalsInBody(two)).toEqual({ codes: ["A", "B"], unresolved: 0 });
    const odd = ['return { ok: false, code: "A" };', "const r = { ok: false, code: pick() }; return r;"].join("\n");
    expect(refusalsInBody(odd).unresolved).toBe(1);
    expect(refusalCodesFromAction("export async function other() {}\n").unresolved).toBe(1);
    const union = (alternatives: string[]) =>
      [
        "export type FinishLessonActionResult =",
        "  | { ok: true }",
        "  | {",
        "      ok: false;",
        "      code:",
        ...alternatives.map((a) => `        | ${a}`),
        "    };",
      ]
        .join("\n")
        .replace(/\n {4}\};$/, ";\n    };");
    expect(refusalCodesFromUnion(union(['"A"', '"B"']))).toEqual({ codes: ["A", "B"], unresolved: 0 });
    expect(refusalCodesFromUnion(union(['"A"', "OtherCode"])).unresolved).toBe(1);
    // A SECOND refusal variant, or a refusal that carries more than its code, is unreadable.
    const twoRefusals = union(['"A"']).replace("  | {\n      ok: false;", "  | { ok: false; code: \"Z\"; retryAfterSec: number }\n  | {\n      ok: false;");
    expect(refusalCodesFromUnion(twoRefusals).unresolved).toBe(1);
    expect(refusalCodesFromUnion(union(['"A"']).replace(";\n    };", ";\n      retryAfterSec: number;\n    };")).unresolved).toBe(1);
    // The `ok` variant's fields, comments skipped; an unreadable member is reported.
    const okUnion = (members: string[]) =>
      ["export type FinishLessonActionResult =", "  | {", "      ok: true;", ...members.map((m) => `      ${m}`), "    }", '  | { ok: false; code: "A" };'].join("\n");
    expect(okFieldsFromUnion(okUnion(["sessionId: string;", "/** a note; with a semicolon */", "xpEarned: number | null;"]))).toEqual({
      fields: ["ok", "sessionId", "xpEarned"],
      unresolved: 0,
    });
    expect(okFieldsFromUnion(okUnion(["sessionId: string;", "[k: string]: unknown;"])).unresolved).toBe(1);
    // The union's source: the action's DECLARED return type, then its import.
    const action = (ret: string, imp: string) =>
      [imp, "export async function finishLessonAction(", "  input: unknown,", `): ${ret} {`, "  return x;", "}", ""].join("\n");
    expect(unionSourceOfAction(action("Promise<FinishLessonActionResult>", 'import type { FinishLessonActionResult } from "@/a/b";'))).toEqual({
      file: path.join(PLATFORM_ROOT, "src", "a", "b.ts"),
      unresolved: 0,
    });
    expect(unionSourceOfAction(action("Promise<SomethingElse>", 'import type { FinishLessonActionResult } from "@/a/b";')).unresolved).toBe(1);
    expect(unionSourceOfAction(action("Promise<FinishLessonActionResult>", 'import type { FinishLessonActionResult } from "../x";')).unresolved).toBe(1);
    expect(nearMissCapFromWire("\nconst MAX_NEAR_MISSES = 7;\n")).toBe(7);
    expect(nearMissCapFromWire("\nconst MAX_NEAR_MISSES = cap();\n")).toBeNull();
    const guard = (cond: string) => ["function parseNearMisses(v) {", `    if (${cond}) {`].join("\n");
    expect(nearMissKindsFromWire(guard('n.kind !== "a" && n.kind !== "b"'))).toEqual({ kinds: ["a", "b"], unresolved: 0 });
    expect(nearMissKindsFromWire(guard('n.kind !== "a" && !isKind(n.kind)')).unresolved).toBe(1);
  });
  it("the micro-quiz: the totals the product can produce are 0..max(QUIZ_TUNING.maxPerSession), one per answered quiz, reset with the trigger — read from the shell's own tally", () => {
    const shell = readFileSync(path.join(PLATFORM_ROOT, "src", "components", "sim", "lesson-ui", "LessonPlayShell.tsx"), "utf-8").replace(/\r\n/g, "\n");
    // The tally's only writers: the answer (+1 total, +1 correct when right) and the retry reset.
    const writes = shell.split("quizStatsRef.current = ").length - 1;
    expect(writes).toBe(2);
    expect(shell).toContain("total: quizStatsRef.current.total + 1,\n      correct: quizStatsRef.current.correct + (correct ? 1 : 0),");
    expect(shell).toContain("quizStatsRef.current = { total: 0, correct: 0 };");
    // …and the trigger that decides how many quizzes a session shows stops at its cap.
    const trigger = readFileSync(path.join(PLATFORM_ROOT, "src", "modules", "sim", "lessons", "quiz-trigger.ts"), "utf-8");
    expect(trigger).toContain("if (state.shownCount >= tuning.maxPerSession) return { state, quiz: null };");
    expect(QUIZ_MAX_TOTAL).toBeGreaterThanOrEqual(2);
    // Every pair, n of n (n ≥ 2) and 0 of n included.
    expect(QUIZ_DOMAIN).toHaveLength(((QUIZ_MAX_TOTAL + 1) * (QUIZ_MAX_TOTAL + 2)) / 2);
    expect(QUIZ_DOMAIN).toContainEqual({ total: QUIZ_MAX_TOTAL, correct: QUIZ_MAX_TOTAL });
    expect(QUIZ_DOMAIN).toContainEqual({ total: 2, correct: 2 });
    expect(QUIZ_DOMAIN).toContainEqual({ total: 0, correct: 0 });
  });
});

it(
  "census — every committed drive at EVERY rung, with seven endings (finished; aborted with a recording and a stored save; finished with a failed save; aborted, and finished, over the whole save domain; aborted at EVERY event boundary; sandbox): what the server stores from the payload the shell SENDS equals what the shell SHOWED, on every field, over the full domain of every field, and the screen is handed the server's own answer",
  { timeout: 3_600_000 },
  async () => {
    const mismatches: string[] = [];
    const pendings: Pending[] = [];
    const unplayable: string[] = [];
    const seen = {
      drives: 0,
      finished: 0,
      aborted: 0,
      endings: { F: 0, A: 0, X: 0, R: 0, G: 0, B: 0, N: 0, S: 0 } as Record<Ending, number>,
      levels: {} as Record<string, number>,
      twoEscalations: 0,
      coachedWithAct: 0,
      coachedNonTask: 0,
      twoCoached: 0,
      commendations: 0,
      positions: 0,
      objectiveDetail: 0,
      lessonMistakes: 0,
      observationShown: 0,
      attempts: 0,
      abortedAttempts: 0,
      abortedSaved: 0,
      refused: 0,
      examCommendations: 0,
      sandboxes: 0,
      /** Round 9: every quiz pair, per ending. */
      quiz: {} as Record<string, Record<string, number>>,
      /** Round 9: every quiz pair on every rung, finished and aborted. */
      quizByRung: {} as Record<string, number>,
      /** Round 9: every save value, on finished and aborted drives, each with and without a recording (`fin|rec`, …). */
      save: {} as Record<string, Record<string, number>>,
      /** Round 9: every save value on every rung, finished and aborted. */
      saveByRung: {} as Record<string, number>,
      /** Round 9: a null start clock, on finished and on aborted drives. */
      nullStart: { finished: 0, aborted: 0 },
      /** Round 9: near-misses of each kind (with / without a place), on finished and on aborted drives. */
      nearMisses: { finished: {} as Record<string, number>, aborted: {} as Record<string, number> },
      /** Round 10: every relative speed of REL_SPEED_DOMAIN, on finished and on aborted drives. */
      relSpeed: { finished: {} as Record<string, number>, aborted: {} as Record<string, number> },
      /** Round 11 (F5): every clearance of CLEARANCE_DOMAIN with every kind, on finished and on aborted drives. */
      clearance: { finished: {} as Record<string, number>, aborted: {} as Record<string, number> },
      /** Round 11 (F6): epoch clocks — start remainder classes (non-null starts) and finish remainder classes, finished and aborted. */
      clockStart: { finished: {} as Record<string, number>, aborted: {} as Record<string, number> },
      clockFinish: { finished: {} as Record<string, number>, aborted: {} as Record<string, number> },
      /** Round 11: the walk position of each clock class (sent finishes; sent, non-null starts), per finished / aborted. */
      clockWalk: { finished: 0, aborted: 0 },
      startWalk: { finished: 0, aborted: 0 },
      /** Round 9: escalation multipliers (×1.5, ×2) on finished and on aborted drives. */
      multipliers: {} as Record<string, number>,
      /** Round 9: a parking rubric's observation sent with no moment, and with some, on finished and on aborted drives. */
      observed: {} as Record<string, number>,
      /** Round 9 (B, N): aborts right after each kind of event. */
      abortAfter: { escalation: 0, coached: 0, commendation: 0, violation: 0, lessonMistake: 0, breach: 0, nearMiss: 0, objective: 0 },
      /** Round 9 (B, N): aborted drives carrying each thing a Q6-shaped mutant would drop, with and without a recording. */
      abortedCarrying: {} as Record<string, number>,
    };
    const perEnding: Record<Ending, number> = { F: 0, A: 0, X: 0, R: 0, G: 0, B: 0, N: 0, S: 0 };
    const note = (label: string, field: string, client: unknown, server: unknown) => {
      if (mismatches.length < 60) {
        mismatches.push(
          `${label} ${field}: client ${JSON.stringify(client).slice(0, 220)} server ${JSON.stringify(server).slice(0, 220)}`,
        );
      } else mismatches.push(`${label} ${field}`);
    };
    let driveNo = 0;
    // Round 10: the near-miss's relative speed walks REL_SPEED_DOMAIN, one value per near-miss sent.
    let nmNo = 0;
    // Round 11: its clearance walks CLEARANCE_DOMAIN, each value three times in a row so the kind rotation meets it
    // with every kind.
    let clNo = 0;

    for (const spec of SCENARIO_TEMPLATES) {
      const dir = path.join(REPO_ROOT, "content", "traces", spec.id);
      if (!existsSync(dir)) continue;
      const names = readdirSync(dir)
        .filter((f) => f.endsWith(".trace.json"))
        .map((f) => f.replace(/\.trace\.json$/, ""))
        .sort();
      for (const tn of names) {
        const ticks = recordTicks(spec.id, spec.map.districtId, tn);
        if (ticks === null) {
          unplayable.push(`${spec.id}/${tn}`);
          continue;
        }
        const committed = JSON.parse(readFileSync(path.join(dir, `${tn}.trace.json`), "utf-8")) as ScenarioTrace;
        for (const rung of spec.levels) {
          const lv = rung.level as ScenarioLevel;
          const lesson = compileScenario(spec, lv);
          // The drive's own recording, handed to finalize as the attempt the shell recorded.
          const attempt = parseScenarioTrace({
            ...committed,
            meta: { ...committed.meta, kind: "attempt", scenarioId: lesson.id },
          });

          /** ONE finalize call, compared field by field. */
          const check = (ending: Ending, ended: LessonSessionState, boundaryKind?: string) => {
            const k = perEnding[ending]++;
            const label = `${spec.id}|L${lv}|${tn}|${ending}${boundaryKind !== undefined ? `@${ended.endedAtSec ?? ended.lastT}` : ""}`;
            seen.drives++;
            seen.endings[ending]++;
            seen.levels[`L${lv}`] = (seen.levels[`L${lv}`] ?? 0) + 1;
            const isAborted = ended.phase === "aborted";
            if (isAborted) seen.aborted++;
            else seen.finished++;
            const trace = RECORDED.has(ending) ? attempt : null;
            const fa = isAborted ? "aborted" : "finished";
            const bump = (rec: Record<string, number>, key: string) => {
              rec[key] = (rec[key] ?? 0) + 1;
            };
            // Each drive its own clocks and its own micro-quiz, from the WHOLE domain.
            const quiz = QUIZ_DOMAIN[k % QUIZ_DOMAIN.length];
            const qk = `${quiz.correct}/${quiz.total}`;
            bump((seen.quiz[ending] ??= {}), qk);
            if (ending !== "S") bump(seen.quizByRung, `L${lv}|${qk}|${fa}`);
            const nullStart = ending !== "S" && k % 4 === 3;
            // Round 11 (F6): Date.now() readings — the origin is one; each drive walks the remainder classes.
            // (Each class — finished / aborted, starts sent / finishes sent — walks the residues in turn, so every residue
            // reaches every class whatever the order the endings come in.)
            const sends = ending !== "S";
            const ci = sends ? seen.clockWalk[fa]++ : 0;
            const si = sends && !nullStart ? seen.startWalk[fa]++ : 0;
            const startMs = EPOCH_ORIGIN_MS - (EPOCH_ORIGIN_MS % 1000) + seen.drives * 60_000 + EPOCH_REMAINDERS_MS[si % EPOCH_REMAINDERS_MS.length];
            // …and the finish a later Date.now() reading, past the whole drive, on a remainder class of its own.
            const endMs =
              startMs - (startMs % 1000) + Math.ceil((Math.round((ended.endedAtSec ?? ended.lastT) * 1000) + 1000) / 1000) * 1000 + EPOCH_REMAINDERS_MS[(ci * 3 + 1) % EPOCH_REMAINDERS_MS.length];
            if (ending !== "S") {
              if (!nullStart) bump(seen.clockStart[fa], String(startMs % 1000));
              bump(seen.clockFinish[fa], String(endMs % 1000));
            }
            if (nullStart) seen.nullStart[fa]++;
            // The save: the whole domain on every ending but F and A (round 8's
            // stored saves, kept as they were) — so every value reaches a finished
            // AND an aborted drive, each with AND without a recording.
            const domain = saveDomain(seen.drives);
            const save: SaveValue = ending === "F" || ending === "A" ? domain[0] : domain[k % domain.length];
            if (ending !== "S") {
              bump((seen.save[`${fa}|${trace !== null ? "rec" : "norec"}`] ??= {}), save.key);
              bump(seen.saveByRung, `L${lv}|${save.key}|${fa}`);
              for (const e of ended.penaltyEscalations) bump(seen.multipliers, `x${e.multiplier}|${fa}`);
            }
            for (const n of ended.nearMisses ?? []) bump(seen.nearMisses[fa], `${n.kind}${n.x === null ? "" : "@"}`);
            for (const n of ended.nearMisses ?? []) bump(seen.relSpeed[fa], String(n.relSpeedMps));
            if (ending !== "S") for (const n of ended.nearMisses ?? []) bump(seen.clearance[fa], `${n.kind}|${n.clearanceM}`);
            const sent: FinishLessonWire[] = [];
            const saved: FinishLessonActionResult[] = [];
            let shown: LessonResult | null = null;
            let rubricShown: RubricScore | null = null;
            let uploaded: boolean | null = null;
            finalizeLessonSession(ended, {
              lessonId: ended.lesson.id,
              mistakeExperience: ending === "S",
              rubric: spec.rubric,
              startedAtMs: nullStart ? null : startMs,
              microQuiz: quiz,
              finishTrace: () => trace,
              now: () => endMs,
              setResult: (r) => {
                shown = r;
              },
              setRubric: (x) => {
                rubricShown = x;
              },
              setTraceUploaded: (u) => {
                uploaded = u;
              },
              send: (w) => {
                sent.push(w);
                return save.answer === undefined ? Promise.reject(new Error("offline")) : Promise.resolve(save.answer);
              },
              setSaveResult: (x) => {
                saved.push(x);
              },
            });
            // The screen is handed the SERVER's answer — a stored session or a refusal
            // with the server's own code — and SAVE_FAILED only when the save failed.
            pendings.push({ label: `${label}|${save.key}`, saved, expectSaved: ending === "S" ? [] : [save.expect] });
            const client = buildLessonResult(ended);
            if (shown === null) {
              note(label, "shown", "a result", null);
              return;
            }
            if (JSON.stringify(shown) !== JSON.stringify(client)) note(label, "shown result", client, shown);
            // The rubric the shell SHOWS, on every ending — a sandbox included (it is
            // scored before the sandbox returns): the score the drive's own observation gives.
            const moments = spec.rubric?.observation?.moments;
            const mapped =
              trace !== null && moments !== undefined && moments.length > 0 ? parkingObservationFromTrace(trace, moments) : null;
            if (spec.rubric !== undefined) {
              const expectShown = scoreRubric(client, spec.rubric, mapped ?? undefined);
              if (JSON.stringify(rubricShown) !== JSON.stringify(expectShown)) note(label, "rubric shown", firstDiff(rubricShown, expectShown), "");
            } else if (rubricShown !== null) note(label, "rubric", null, rubricShown);
            if (ending === "S") {
              // THEO-3: a sandbox is never persisted and never offers a stored replay.
              seen.sandboxes++;
              if (sent.length !== 0) note(label, "sandbox sent", 0, sent.length);
              if (uploaded !== null) note(label, "sandbox traceUploaded", null, uploaded);
              return;
            }
            if (sent.length !== 1) {
              note(label, "sent", 1, sent.length);
              return;
            }
            const w = sent[0];
            if (w.lessonId !== ended.lesson.id) note(label, "lessonId", ended.lesson.id, w.lessonId);
            const expectStart = nullStart ? endMs : startMs;
            if (w.startedAtMs !== expectStart) note(label, "startedAtMs", expectStart, w.startedAtMs);
            if (w.finishedAtMs !== endMs) note(label, "finishedAtMs", endMs, w.finishedAtMs);
            // The server receives JSON, exactly as the action boundary serialises it.
            const graded = gradeFinishWire(JSON.parse(JSON.stringify(w)));
            if (graded.status !== "ok") {
              note(label, "status", "ok", graded.status);
              return;
            }
            if (JSON.stringify(graded.wire.microQuiz) !== JSON.stringify(quiz)) note(label, "microQuiz", quiz, graded.wire.microQuiz);
            const shownR = shown as LessonResult;
            // 1 · the grade.
            const a = gradeOf(shownR);
            const b = gradeOf(graded.result);
            for (const key of Object.keys(a) as (keyof typeof a)[]) {
              if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) note(label, key, a[key], b[key]);
            }
            if ((graded.result.summary.passed && graded.result.completedAll && !graded.result.aborted) !== (client.summary.passed && client.completedAll && !client.aborted)) {
              note(label, "sheetRoutePassed", client.summary.passed, graded.result.summary.passed);
            }
            // 2 · the event log the server rebuilds and stores, commendations included.
            const ea = eventsOf(ended.events);
            const eb = eventsOf(graded.events);
            if (JSON.stringify(ea) !== JSON.stringify(eb)) note(label, "events", ea, eb);
            const cleanC = ended.events.filter((e) => e.kind === "commendation" && e.code === "CLEAN_DRIVING").length;
            const cleanS = graded.events.filter((e) => e.kind === "commendation" && e.code === "CLEAN_DRIVING").length;
            if (cleanC !== cleanS) note(label, "cleanDrives", cleanC, cleanS);
            // 3 · the stored channels.
            const storedPositions = graded.wire.ruleEvents
              .flatMap((e) => (e.x !== undefined && e.y !== undefined ? [[e.kind, e.code, e.t, e.x, e.y]] : []))
              .sort(byKey);
            const clientPositions = (ended.eventPositions ?? []).map((p) => [p.kind, p.code, p.t, p.x, p.y]).sort(byKey);
            if (JSON.stringify(storedPositions) !== JSON.stringify(clientPositions)) {
              note(label, "eventPositions", clientPositions, storedPositions);
            }
            const storedNear = (graded.wire.nearMisses ?? []).map((n) => [n.tSec, n.kind, n.clearanceM, n.relSpeedMps, n.x ?? null, n.y ?? null]);
            const clientNear = (ended.nearMisses ?? []).map((n) => [n.tSec, n.kind, n.clearanceM, n.relSpeedMps, n.x, n.y]);
            if (JSON.stringify(storedNear) !== JSON.stringify(clientNear)) note(label, "nearMisses", clientNear, storedNear);
            const expectIds = mapped !== null ? [...mapped.observedMomentIds] : undefined;
            if (JSON.stringify(graded.wire.observedMomentIds) !== JSON.stringify(expectIds)) {
              note(label, "observedMomentIds", expectIds, graded.wire.observedMomentIds);
            }
            if (expectIds !== undefined) bump(seen.observed, `${expectIds.length > 0 ? "some" : "none"}|${fa}`);
            const compact = trace !== null ? compactTraceForStorage(trace) : null;
            if (JSON.stringify(graded.wire.attemptTrace ?? null) !== JSON.stringify(compact)) {
              note(label, "attemptTrace", compact === null ? null : `${compact.samples.length} samples`, graded.wire.attemptTrace === undefined ? null : `${graded.wire.attemptTrace.samples.length} samples`);
            }
            // «Виж своя дубъл» is offered exactly when the server STORED the recording.
            const stored = graded.wire.attemptTrace !== undefined;
            if (uploaded !== stored) note(label, "traceUploaded", stored, uploaded);
            if (spec.rubric !== undefined) {
              const serverStars = scoreRubric(
                graded.result,
                spec.rubric,
                graded.wire.observedMomentIds !== undefined ? { observedMomentIds: graded.wire.observedMomentIds } : undefined,
              );
              // What the server STORES is the stars (`rubricStars`); what the shell SHOWS is
              // the whole score, which must be the one the drive's own observation gives.
              const shownStars = (rubricShown as RubricScore | null)?.stars ?? null;
              if (shownStars !== serverStars.stars) note(label, "rubric stars", shownStars, serverStars.stars);
              // (What the shell SHOWS was compared above, on every ending.)
              if (mapped !== null && JSON.stringify(rubricShown) !== JSON.stringify(scoreRubric(client, spec.rubric, undefined))) {
                seen.observationShown++;
              }
            }
            // 4 · the debrief the student reads (the server's) against the shell's own.
            const ct = buildDebrief(ended.lesson, client, { microQuiz: quiz, coachedMistakes: client.coachedMistakes }).text;
            const st = buildDebrief(graded.lesson, graded.result, {
              microQuiz: graded.wire.microQuiz,
              coachedMistakes: graded.result.coachedMistakes,
            }).text;
            if (ct !== st) {
              const al = ct.split("\n");
              const bl = st.split("\n");
              const i = al.findIndex((x, j) => x !== bl[j]);
              note(label, `debrief@line${i}`, al[i] ?? "", bl[i] ?? "");
            }
            // What the census really contains (the non-vacuity ledger below).
            if (client.escalations.length >= 2) seen.twoEscalations++;
            const coached = client.coachedMistakes ?? [];
            if (coached.some((c) => c.detail !== undefined)) seen.coachedWithAct++;
            if (coached.some((c) => c.code !== "TASK_SPEED_CAP_EXCEEDED")) seen.coachedNonTask++;
            if (coached.length >= 2) seen.twoCoached++;
            const hasCommendation = ended.events.some((e) => e.kind === "commendation");
            if (hasCommendation) seen.commendations++;
            if (hasCommendation && ended.lesson.examMode === true) seen.examCommendations++;
            if ((ended.eventPositions ?? []).length > 0) seen.positions++;
            if (client.objectives.some((o) => o.detail !== undefined)) seen.objectiveDetail++;
            if ((client.lessonMistakes ?? []).length > 0) seen.lessonMistakes++;
            if (compact !== null) seen.attempts++;
            if (compact !== null && isAborted) seen.abortedAttempts++;
            if (ending === "A") seen.abortedSaved++;
            if (save.answer !== undefined && save.answer.ok === false) seen.refused++;
            if (ending === "B" || ending === "N") {
              const c = seen.abortedCarrying;
              const rec = ending === "B" ? "rec" : "norec";
              if (client.escalations.length > 0) bump(c, `escalation|${rec}`);
              if (client.escalations.length >= 2) bump(c, `twoEscalations|${rec}`);
              if (coached.length > 0) bump(c, `coached|${rec}`);
              if (hasCommendation) bump(c, `commendation|${rec}`);
              if ((client.lessonMistakes ?? []).length > 0) bump(c, `lessonMistake|${rec}`);
              if ((client.taskCapBreaches ?? []).length > 0) bump(c, `breach|${rec}`);
              if ((ended.nearMisses ?? []).length > 0) bump(c, `nearMiss|${rec}`);
              if ((ended.eventPositions ?? []).length > 0) bump(c, `positions|${rec}`);
              if (client.objectives.some((o) => o.done)) bump(c, `objectiveDone|${rec}`);
              if (client.objectives.some((o) => o.done) && client.objectives.some((o) => !o.done)) bump(c, `objectivesPartly|${rec}`);
            }
          };

          let s: LessonSessionState = createLessonSession(lesson);
          let lastT = 0;
          let half: LessonSessionState | null = null;
          driveNo++;
          // Near-misses, as the running scene reports them: every kind the wire accepts,
          // with and without a place, on four drives in five.
          const nm = driveNo % 5 === 0 ? null : { kind: NEAR_MISS_KINDS[driveNo % 3], placed: driveNo % 2 === 0 };
          let nmDone = false;
          let sig = boundarySig(s);
          const boundaries: Array<{ state: LessonSessionState; kind: string }> = [];
          for (const tick of ticks) {
            if (s.phase !== "driving" && s.phase !== "preDrive") break;
            const before = s;
            s = applyTick(s, tick).state;
            lastT = tick.t;
            if (nm !== null && !nmDone && s.phase === "driving" && tick.t >= 3) {
              s = applyNearMiss(
                s,
                {
                  tSec: tick.t,
                  kind: nm.kind,
                  npcId: 1000 + driveNo,
                  clearanceM: CLEARANCE_DOMAIN[Math.floor(clNo++ / 3) % CLEARANCE_DOMAIN.length],
                  relSpeedMps: REL_SPEED_DOMAIN[nmNo++ % REL_SPEED_DOMAIN.length],
                },
                nm.placed ? { x: tick.position.x, y: tick.position.y } : null,
              );
              nmDone = true;
            }
            if (half === null && s.phase === "driving" && s.coachedMistakes.length + s.events.length > 0) {
              half = abortSession(s, tick.t);
            }
            // B / N — right after EVERY event the session recorded (an objective
            // completed included), an abort: with the recording (B) and without (N).
            const now = boundarySig(s);
            if (now !== sig && s.phase === "driving") {
              const kinds: string[] = [];
              if (s.penaltyEscalations.length > before.penaltyEscalations.length) kinds.push("escalation");
              if (s.coachedMistakes.length > before.coachedMistakes.length) kinds.push("coached");
              const newEv = s.events.slice(before.events.length);
              if (newEv.some((e) => e.kind === "commendation")) kinds.push("commendation");
              if (newEv.some((e) => e.kind === "violation")) kinds.push("violation");
              if ((s.taskCapBreaches ?? []).length > (before.taskCapBreaches ?? []).length) kinds.push("breach");
              if ((s.nearMisses ?? []).length > (before.nearMisses ?? []).length) kinds.push("nearMiss");
              if (objectivesDone(s) > objectivesDone(before)) kinds.push("objective");
              const r0 = buildLessonResult(before);
              const r1 = buildLessonResult(s);
              if ((r1.lessonMistakes ?? []).length > (r0.lessonMistakes ?? []).length) kinds.push("lessonMistake");
              boundaries.push({ state: abortSession(s, tick.t), kind: kinds.join("+") });
              for (const kk of kinds) seen.abortAfter[kk as keyof typeof seen.abortAfter]++;
            }
            sig = now;
          }
          const finished = s.phase === "driving" ? finishSession(s, lastT) : s;
          check("F", finished);
          if (half !== null) check("A", half);
          check("X", finished);
          if (half !== null) check("R", half);
          check("G", finished);
          for (const bnd of boundaries) check("B", bnd.state, bnd.kind);
          for (const bnd of boundaries) check("N", bnd.state, bnd.kind);
          check("S", finished);
        }
      }
    }
    // The save results land on the next microtasks.
    await new Promise((r) => setTimeout(r, 0));
    for (const p of pendings) {
      if (JSON.stringify(p.saved) !== JSON.stringify(p.expectSaved)) note(p.label, "saveResult", p.expectSaved, p.saved);
    }

    // The coverage ledger, written where a census run asks for it.
    if (process.env.PAYLOAD_CENSUS_OUT) writeFileSync(process.env.PAYLOAD_CENSUS_OUT, JSON.stringify({ seen, unplayable }, null, 1));
    expect(mismatches).toEqual([]);
    // Five templates whose traces no `record*Drive` in `traces/sc*.ts` can play
    // (their committed traces come from elsewhere). PINNED, so a recorder that
    // stops playing a drive shrinks nothing silently.
    expect(unplayable).toEqual(UNPLAYABLE);
    // NON-VACUOUS — the committed drives contain every thing a payload mutant
    // could drop, so dropping it shows here. The round-7 floors are the round-6
    // verifier's own figures (PB11 595 drives with a non-TASK coached row, PB19 58
    // with two, PB13 132 with an act, PB9 742 with a commendation, PB20 the 2 with
    // a second escalation). The round-8 floors are the round-7 verifier's figures
    // for the populations its surviving mutants bent — NP1 / NP12 2,057 aborted
    // drives whose recording is stored, NP2 2,057 aborted drives whose save is
    // stored, NP3 2,057 refusals, NP14 744 exam-rung drives with a commendation
    // (`scratchpad/cap/verify7/mut-run-m2-np.txt`). Measured on round 9's tree:
    // `scratchpad/cap/r9/census-seen-r9.json`.
    // INTEGRATION (2026-10-03): 2,057 → 2,056. The one drive that lost its half-way
    // abort is sc-merge-lane-end L4 mistake-push-out: since 0daca33 (founder ruling
    // 2026-09-30) the cut-in is billed as LANE_ENTRY_FORCED_BRAKING at 20.1 s, a
    // dangerous fault that ends the L4 exam on that same tick, so the drive is never
    // `driving` with an event recorded. At the lane's base it rammed (COLLISION at
    // 20.5 s, with the mirror-check violation recorded first). Measured by listing
    // every drive with no half-way abort on both trees: they differ by that one row.
    expect(Object.keys(seen.levels).sort()).toEqual(["L1", "L2", "L3", "L4", "L5"]);
    expect(seen.endings.F).toBeGreaterThanOrEqual(2_389);
    expect(seen.endings.A).toBeGreaterThanOrEqual(2_056);
    expect(seen.endings.R).toBeGreaterThanOrEqual(2_056);
    expect(seen.endings.G).toBeGreaterThanOrEqual(2_389);
    expect(seen.abortedAttempts).toBeGreaterThanOrEqual(2_056);
    expect(seen.abortedSaved).toBeGreaterThanOrEqual(2_056);
    expect(seen.refused).toBeGreaterThanOrEqual(2_056);
    expect(seen.examCommendations).toBeGreaterThanOrEqual(744);
    expect(seen.sandboxes).toBeGreaterThan(0);
    expect(seen.twoEscalations).toBeGreaterThanOrEqual(2);
    expect(seen.coachedWithAct).toBeGreaterThanOrEqual(132);
    expect(seen.coachedNonTask).toBeGreaterThanOrEqual(595);
    expect(seen.twoCoached).toBeGreaterThanOrEqual(58);
    expect(seen.commendations).toBeGreaterThanOrEqual(742);
    expect(seen.positions).toBeGreaterThanOrEqual(1_337);
    expect(seen.objectiveDetail).toBeGreaterThanOrEqual(308);
    expect(seen.lessonMistakes).toBeGreaterThanOrEqual(593);
    expect(seen.observationShown).toBeGreaterThanOrEqual(76);
    expect(seen.attempts).toBeGreaterThanOrEqual(976);
    // ROUND 9 — THE FULL DOMAINS WERE REALLY DRIVEN.
    const FA = ["finished", "aborted"] as const;
    const RUNGS = ["L1", "L2", "L3", "L4", "L5"];
    // Every quiz pair on every ending that sends a payload, and on every rung, finished and aborted.
    for (const e of ENDINGS.filter((x) => x !== "S")) {
      for (const q of QUIZ_DOMAIN) expect(seen.quiz[e]?.[`${q.correct}/${q.total}`] ?? 0, `quiz ${q.correct}/${q.total} on ${e}`).toBeGreaterThan(0);
    }
    for (const L of RUNGS) {
      for (const q of QUIZ_DOMAIN) {
        for (const fa of FA) expect(seen.quizByRung[`${L}|${q.correct}/${q.total}|${fa}`] ?? 0, `quiz ${q.correct}/${q.total} ${L} ${fa}`).toBeGreaterThan(0);
      }
    }
    // Every save value on a finished AND on an aborted drive, each with AND without a
    // recording, and on every rung.
    for (const k of SAVE_KEYS) {
      for (const cell of ["finished|rec", "finished|norec", "aborted|rec", "aborted|norec"]) {
        expect(seen.save[cell]?.[k] ?? 0, `save ${k} ${cell}`).toBeGreaterThan(0);
      }
      for (const L of RUNGS) for (const fa of FA) expect(seen.saveByRung[`${L}|${k}|${fa}`] ?? 0, `save ${k} ${L} ${fa}`).toBeGreaterThan(0);
    }
    expect(seen.nullStart.finished).toBeGreaterThan(0);
    expect(seen.nullStart.aborted).toBeGreaterThan(0);
    // Every near-miss kind, placed and not, on a finished AND on an aborted drive.
    for (const kind of NEAR_MISS_KINDS) {
      for (const nk of [kind, `${kind}@`]) {
        expect(seen.nearMisses.finished[nk] ?? 0, `near-miss ${nk} finished`).toBeGreaterThan(0);
        expect(seen.nearMisses.aborted[nk] ?? 0, `near-miss ${nk} aborted`).toBeGreaterThan(0);
      }
    }
    // Every relative speed of the derived domain, on a finished AND on an aborted drive (round 10, R3).
    for (const v of REL_SPEED_DOMAIN) {
      for (const fa of FA) expect(seen.relSpeed[fa][String(v)] ?? 0, `relSpeedMps ${v} ${fa}`).toBeGreaterThan(0);
    }
    // Every clearance of the derived domain with every kind, on a finished AND on an aborted drive (round 11, F5).
    for (const v of CLEARANCE_DOMAIN) {
      for (const kind of NEAR_MISS_KINDS) for (const fa of FA) expect(seen.clearance[fa][`${kind}|${v}`] ?? 0, `clearanceM ${v} ${kind} ${fa}`).toBeGreaterThan(0);
    }
    // Every millisecond remainder class of a Date.now() start and finish, on a finished AND on an aborted drive (F6).
    for (const rem of EPOCH_REMAINDERS_MS) {
      for (const fa of FA) {
        expect(seen.clockStart[fa][String(rem)] ?? 0, `start remainder ${rem} ${fa}`).toBeGreaterThan(0);
        expect(seen.clockFinish[fa][String(rem)] ?? 0, `finish remainder ${rem} ${fa}`).toBeGreaterThan(0);
      }
    }
    // Both escalation multipliers the policy produces (×1.5, ×2), finished AND aborted.
    for (const m of ["x1.5", "x2"]) for (const fa of FA) expect(seen.multipliers[`${m}|${fa}`] ?? 0, `${m} ${fa}`).toBeGreaterThan(0);
    // A parking observation with no moment and with some, finished AND aborted.
    for (const o of ["none", "some"]) for (const fa of FA) expect(seen.observed[`${o}|${fa}`] ?? 0, `observed ${o} ${fa}`).toBeGreaterThan(0);
    // Aborts after every kind of event (an objective completed included), and aborted
    // drives carrying every channel, with AND without a recording (the round-8
    // verifier's Q6: sc-vu-cyclist-hook and sc-vu-bikelane-turn, the ×1.5).
    for (const [kk, v] of Object.entries(seen.abortAfter)) expect(v, `aborts right after a ${kk}`).toBeGreaterThan(0);
    for (const kk of ["escalation", "twoEscalations", "coached", "commendation", "lessonMistake", "breach", "nearMiss", "positions", "objectiveDone", "objectivesPartly"]) {
      for (const rec of ["rec", "norec"]) expect(seen.abortedCarrying[`${kk}|${rec}`] ?? 0, `aborted drives carrying ${kk} (${rec})`).toBeGreaterThan(0);
    }
    expect(seen.abortedCarrying["escalation|rec"]).toBeGreaterThanOrEqual(8);
    expect(seen.abortedCarrying["escalation|norec"]).toBeGreaterThanOrEqual(8);
  },
);
