/**
 * ED-02 trace gate — „Изпитен сегмент „Лозенец" — предимства"
 * (sc-ed-d2-priority-run on d2-v1), doc 76 §5/§9 stages 3+5:
 *
 *  1. SHADOW replays through the PRODUCTION stack with ZERO violations over
 *     ~927 m of real Лозенец, with the JU-23 junction-scan drill ENABLED — a
 *     full stop and a ляво-дясно-ляво scan at the Б2, a green pass at the
 *     n4873770118 signal, the oncoming waited out on the left turn, and the
 *     car from the right given way at the equal junction.
 *  2. THE CHAIN IS PROVEN ON THE EVENTS, not assumed: the shadow crosses
 *     exactly two stop lines — the Б2 (control "stopSign") and the signal
 *     (control "trafficLight", green) — and BOTH staged conflicts resolve
 *     "yielded", earning FULL_STOP_AT_STOP_SIGN + YIELDED_TO_PRIORITY.
 *  3. MISTAKE DEMOS grade EXACTLY their template codeRefs, and they are
 *     deliberately INVERSE faults on the SAME line: the rolling-stop clip
 *     scans properly but never stops (STOP_SIGN_NO_FULL_STOP alone); the
 *     partial-scan clip stops perfectly but half-looks (JUNCTION_SCAN_INCOMPLETE
 *     alone, alongside the full-stop commendation it has earned). Neither clip
 *     reaches the signal, so no other graded feature can contaminate them.
 *  4. COMMITTED FILES under content/traces/sc-ed-d2-priority-run/ ARE the
 *     recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD (after ANY change to the scripts, recorder, district or rules):
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ed-d2-priority-run-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SimTickEvent } from "../../rules";
import { SC_ED_D2_PRIORITY_RUN } from "../../lessons/scenario/templates-exam";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  buildScEdD2PriorityRoute,
  recordScEdD2PriorityRunDrive,
  scEdD2PriorityRouteLength,
  SC_ED_D2_PRIORITY_RUN_TRACE_NAMES,
  type ScEdD2PriorityRunTraceName,
} from "../scEdD2PriorityRun";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const NAMES = SC_ED_D2_PRIORITY_RUN_TRACE_NAMES;

type LineCrossing = Extract<SimTickEvent, { kind: "stopLineCrossed" }>;

interface DriveWithEvents {
  drive: RecordedDrive;
  lines: LineCrossing[];
}

const district = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "d2-v1.json"), "utf-8"),
);

function record(name: ScEdD2PriorityRunTraceName): DriveWithEvents {
  const lines: LineCrossing[] = [];
  const drive = recordScEdD2PriorityRunDrive(district, name, {
    onTick: (t) => {
      for (const e of t.events) if (e.kind === "stopLineCrossed") lines.push(e);
    },
  });
  return { drive, lines };
}

function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const drives = new Map<ScEdD2PriorityRunTraceName, DriveWithEvents>(NAMES.map((n) => [n, record(n)]));

describe("sc-ed-d2-priority-run — the drive line is derived from the committed map", () => {
  it("the fourteen authored legs build one ~927 m route", () => {
    const route = buildScEdD2PriorityRoute(district);
    expect(route.length).toBeGreaterThan(200);
    expect(scEdD2PriorityRouteLength(district)).toBeCloseTo(927, 0);
    for (const [x, y] of route) expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
  });

  it("it starts at the template's authored spawn pose", () => {
    // The template's start.position is a denormalized literal; the ghost must
    // actually begin there or the student and the shadow drive different runs.
    const route = buildScEdD2PriorityRoute(district);
    expect(route[0][0]).toBeCloseTo(SC_ED_D2_PRIORITY_RUN.start.position!.x, 1);
    expect(route[0][1]).toBeCloseTo(SC_ED_D2_PRIORITY_RUN.start.position!.y, 1);
  });
});

describe("sc-ed-d2-priority-run — the shadow gate (doc 76 §5)", () => {
  const { drive: shadow, lines } = drives.get("shadow-correct")!;

  it("replays with ZERO violations — with the JU-23 scan drill ENABLED", () => {
    // The drill's config is the whole point: this same drive would be innocent
    // by default, so a green sheet here means the scan actually happened.
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("earns the full-stop, the give-way and the clean-driving commendations", () => {
    const codes = commendationCodes(shadow);
    expect(codes).toContain("FULL_STOP_AT_STOP_SIGN");
    expect(codes).toContain("YIELDED_TO_PRIORITY");
    expect(codes).toContain("CLEAN_DRIVING");
  });

  it("crosses exactly TWO lines: the Б2, then the signal on GREEN", () => {
    // Exactly two stop lines exist on this route (exam-districts battery); the
    // Б2 is the drill's subject and the signal is the ramp complex's only link
    // to Стоян Михайловски — the shadow must meet both lawfully.
    expect(lines.length).toBe(2);
    expect(lines.map((l) => l.control)).toEqual(["stopSign", "trafficLight"]);
    expect(lines[1].lightState).toBe("green");
  });

  it("actually STOPPED at the Б2 line — a rest, not a slow roll", () => {
    // The commendation above already implies it, but assert the rest itself:
    // „почти спрях" is exactly what the mistake demo does, and the two drives
    // must differ on the telemetry, not on the label.
    const rested = shadow.trace.samples.filter(
      (s) => Math.abs(s.speedKmh) < 0.5 && Math.hypot(s.x + 269.79, s.y - 118.66) < 12,
    );
    expect(rested.length).toBeGreaterThanOrEqual(20); // >= ~1 s at 20 Hz
  });

  it("resolves BOTH staged priority conflicts by yielding", () => {
    const oncoming = shadow.outcomes.find((o) => o.eventId === "sc-edpr-oncoming");
    expect(oncoming).toBeDefined();
    expect(oncoming!.success).toBe(true);
    expect(oncoming!.detail).toBe("yielded");

    const right = shadow.outcomes.find((o) => o.eventId === "sc-edpr-right");
    expect(right).toBeDefined();
    expect(right!.success).toBe(true);
    expect(right!.detail).toBe("yielded");
  });

  it("meets the two conflicts ONE AT A TIME — the teach-card ladder", () => {
    // 267 m of route separates them by design (the left turn resolves long
    // before the equal junction arms). If a re-tune ever fused them, the drill
    // would stack two cards on one moment — fail here instead.
    const oncoming = shadow.outcomes.find((o) => o.eventId === "sc-edpr-oncoming")!;
    const right = shadow.outcomes.find((o) => o.eventId === "sc-edpr-right")!;
    expect(right.tSec! - oncoming.tSec!).toBeGreaterThan(20);
  });

  it("drives the whole segment and finishes on Златовръх with Bulgarian copy", () => {
    const s = shadow.trace.samples;
    let dist = 0;
    for (let i = 1; i < s.length; i++) dist += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
    expect(dist).toBeGreaterThan(900);
    const last = s[s.length - 1];
    expect(Math.hypot(last.x + 739.46, last.y + 228.84)).toBeLessThan(8);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-ed-d2-priority-run — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„търкаляне през стоп-линията“: exactly STOP_SIGN_NO_FULL_STOP — it DID scan", () => {
    const { drive, lines } = drives.get("mistake-rolling-stop")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_ED_D2_PRIORITY_RUN.mistakes[0].codeRefs].sort());
    // The demo's honesty: the scan is FRESH (both glances inside the 5 s
    // lookback at the line), so JU-23 cannot fire and the isolated fault is
    // the missing stop. This is the assert that keeps the clip surgical.
    expect(codes).not.toContain("JUNCTION_SCAN_INCOMPLETE");
    // …and it never stopped, so it cannot have earned the full-stop praise.
    expect(commendationCodes(drive)).not.toContain("FULL_STOP_AT_STOP_SIGN");
    // One line, the Б2's: the clip ends 260 m short of the signal.
    expect(lines.length).toBe(1);
    expect(lines[0].control).toBe("stopSign");
    expect(drive.outcomes).toEqual([]);
  });

  it("„незавършен оглед“: exactly JUNCTION_SCAN_INCOMPLETE — the stop was textbook", () => {
    const { drive, lines } = drives.get("mistake-partial-scan")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_ED_D2_PRIORITY_RUN.mistakes[1].codeRefs].sort());
    // The inverse of the clip above, and the reason JU-23 exists: the stop is
    // real enough to be COMMENDED on the same sheet that bills the observation.
    expect(codes).not.toContain("STOP_SIGN_NO_FULL_STOP");
    expect(commendationCodes(drive)).toContain("FULL_STOP_AT_STOP_SIGN");
    expect(lines.length).toBe(1);
    expect(lines[0].control).toBe("stopSign");
    expect(drive.outcomes).toEqual([]);
  });

  it("the two clips are the SAME approach and differ only in the driver's act", () => {
    // Same world, same line, same 130 m of slip road — one stops without
    // looking, one looks without stopping. That symmetry is the content.
    const roll = drives.get("mistake-rolling-stop")!.drive;
    const scan = drives.get("mistake-partial-scan")!.drive;
    expect(roll.trace.samples[0].x).toBeCloseTo(scan.trace.samples[0].x, 2);
    expect(roll.trace.samples[0].y).toBeCloseTo(scan.trace.samples[0].y, 2);
  });
});

describe("the JU-23 drill config is what makes this template gradeable", () => {
  it("the template propagates junctionScanObservationEnabled to the live lesson", () => {
    // The detector ships OFF (rules/types.ts). Without this line the
    // „незавършен оглед" mistake is an ungraded pass in the student's own run
    // while the committed trace still shows the fault — the exact drift this
    // assert exists to prevent.
    expect(SC_ED_D2_PRIORITY_RUN.ruleConfig?.junctionScanObservationEnabled).toBe(true);
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", "sc-ed-d2-priority-run");
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", "sc-ed-d2-priority-run");

  for (const name of NAMES) {
    it(`sc-ed-d2-priority-run/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
      const serialized = serializeScenarioTrace(drives.get(name)!.drive.trace) + "\n";
      const contentFile = path.join(contentDir, `${name}.trace.json`);
      const publicFile = path.join(publicDir, `${name}.trace.json`);
      if (RECORD) {
        mkdirSync(contentDir, { recursive: true });
        mkdirSync(publicDir, { recursive: true });
        writeFileSync(contentFile, serialized);
        writeFileSync(publicFile, serialized);
      }
      expect(existsSync(contentFile), `${contentFile} missing — run the RECORD_TRACES tool`).toBe(true);
      expect(existsSync(publicFile), `${publicFile} missing — run the RECORD_TRACES tool`).toBe(true);
      expect(readFileSync(contentFile, "utf-8")).toBe(serialized);
      expect(readFileSync(publicFile, "utf-8")).toBe(readFileSync(contentFile, "utf-8"));
      const parsed = parseScenarioTrace(JSON.parse(readFileSync(contentFile, "utf-8")));
      expect(parsed).not.toBeNull();
      expect(parsed!.meta.scenarioId).toBe("sc-ed-d2-priority-run");
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    const again = recordScEdD2PriorityRunDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.drive.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_ED_D2_PRIORITY_RUN.shadow, ...SC_ED_D2_PRIORITY_RUN.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith("content/traces/sc-ed-d2-priority-run/")).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/sc-ed-d2-priority-run/${n}.trace.json`);
    expect([
      SC_ED_D2_PRIORITY_RUN.shadow.path,
      ...SC_ED_D2_PRIORITY_RUN.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
