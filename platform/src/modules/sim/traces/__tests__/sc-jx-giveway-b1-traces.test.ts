/**
 * Trace gate — „Б1 не значи спри винаги" (sc-jx-giveway-b1 on jxg-giveway-v1,
 * JU-02), the give-way CAPABILITY's shipped lesson and the 150th template.
 * doc 76 §5/§9 stages 3+5. The give-way drill enables the config-gated
 * JUNCTION_SCAN_INCOMPLETE detector via the recorder's ruleConfig, so the gate
 * replays with the drill ON:
 *
 *   1. SHADOW: ROLL through the CLEAR mouth 1 at a yield pace with a full
 *      ляво-дясно scan (NO full stop — the crux, Б1 ≠ „спри винаги") + WAIT at
 *      the CONFLICTED mouth 2 for the staged priority car → ZERO violations,
 *      YIELDED_TO_PRIORITY earned. If a clear rolling Б1 pass ever graded a
 *      full-stop demand, THIS is the gate that catches it.
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs:
 *      - „Навлизане пред колата по главния" → FAILED_TO_YIELD (detail give-way);
 *      - „Излизане без пълен оглед" → JUNCTION_SCAN_INCOMPLETE (never a
 *        full-stop demand — Б1 asks for none).
 *   3. COMMITTED FILES under content/traces/sc-jx-giveway-b1/ ARE the
 *      recordings, byte-for-byte, with identical public copies.
 *
 * RE-RECORD (after ANY change to the scripts, the recorder, the district, the
 * overrides or the rule engine, then commit the JSON):
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-jx-giveway-b1-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SimTickEvent } from "../../rules";
import { SC_JX_GIVEWAY_B1 } from "../../lessons/scenario/templates-junctions";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScJxGivewayB1Drive,
  scJxGivewayB1TraceNames,
  SC_JX_GIVEWAY_B1_DISTRICT_ID,
  type ScJxGivewayB1TraceName,
} from "../scJxGivewayB1";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";

const TEMPLATE_ID = "sc-jx-giveway-b1";

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}

type PrioEvent = Extract<SimTickEvent, { kind: "prioritySituation" }>;

interface DriveWithTicks {
  drive: RecordedDrive;
  /** Every priority adjudication of the drive, in order. */
  prio: PrioEvent[];
}

function record(districtRaw: unknown, name: ScJxGivewayB1TraceName): DriveWithTicks {
  const prio: PrioEvent[] = [];
  const drive = recordScJxGivewayB1Drive(districtRaw, name, {
    onTick: (tick) => {
      for (const e of tick.events) {
        if (e.kind === "prioritySituation") prio.push(e);
      }
    },
  });
  return { drive, prio };
}

function violationCodes(drive: RecordedDrive): string[] {
  return drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(drive: RecordedDrive): string[] {
  return drive.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict(SC_JX_GIVEWAY_B1_DISTRICT_ID);
const drives = new Map<ScJxGivewayB1TraceName, DriveWithTicks>(
  scJxGivewayB1TraceNames().map((n) => [n, record(district, n)]),
);

describe("sc-jx-giveway-b1 — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations (a clear rolling Б1 pass demands no full stop)", () => {
    expect(violationCodes(shadow.drive)).toEqual([]);
  });

  it("crosses BOTH Б1 mouths but earns exactly ONE yield proof — at the conflicted mouth 2", () => {
    // The whole subject: mouth 1 is clear (rolled, nothing to yield to), mouth 2
    // has the priority car (yielded). One YIELDED_TO_PRIORITY, no violation.
    expect(commendationCodes(shadow.drive)).toContain("YIELDED_TO_PRIORITY");
    const situations = shadow.prio.map((e) => `${e.situation}:${String(e.yielded)}`);
    expect(situations).toEqual(["give-way:true"]);
    expect(shadow.prio.every((e) => e.violated === false)).toBe(true);
    // The staged conflict resolved 'yielded' through its runner.
    const conflict = shadow.drive.outcomes.find((o) => o.eventId === "sc-jxgb-conflict");
    expect(conflict?.success).toBe(true);
    expect(conflict?.detail).toBe("yielded");
  });

  it("THE CRUX: rolls through mouth 1 — never comes to rest before it", () => {
    // Between spawn and mouth 1 (y = −27.725) the car must never stop: a full
    // stop here would still grade zero, but it would teach „спри винаги" — the
    // exact myth this template kills. The recorded ghost proves the roll.
    const rolled = shadow.drive.trace.samples.filter(
      (s) => s.y > -60 && s.y < -20 && Math.abs(s.speedKmh) < 0.5,
    );
    expect(rolled.length).toBe(0);
  });

  it("actually WAITS at mouth 2 — at rest short of its Б1 line (y = 122.275)", () => {
    const resting = shadow.drive.trace.samples.filter(
      (s) => Math.abs(s.speedKmh) < 0.5 && s.y > 112 && s.y < 122,
    );
    // A real, deliberate hold for the priority car (> 6 s at 20 Hz).
    expect(resting.length).toBeGreaterThan(20 * 6);
  });

  it("demonstrates the ritual: look left and right + annotations, straight through (no turn signal)", () => {
    const kinds = shadow.drive.trace.events.map((e) => e.kind);
    expect(kinds).toContain("glance-left");
    expect(kinds).toContain("glance-right");
    // Going straight through both mouths — no indicator is used.
    expect(shadow.drive.trace.events.some((e) => e.kind === "signal-on")).toBe(false);
    const annotations = shadow.drive.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });

  it("ends at rest northbound past mouth 2, and inside the authored par time", () => {
    const last = shadow.drive.trace.samples[shadow.drive.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(178);
    expect(Math.abs(last.speedKmh)).toBeLessThan(0.5);
    expect(shadow.drive.trace.meta.durationSec).toBeLessThan(SC_JX_GIVEWAY_B1.rubric!.parTimeSec!);
  });
});

describe("sc-jx-giveway-b1 — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Навлизане пред колата по главния“: exactly FAILED_TO_YIELD, detail give-way", () => {
    const { drive, prio } = drives.get("mistake-barge-priority")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_JX_GIVEWAY_B1.mistakes[0].codeRefs].sort());
    const failed = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "FAILED_TO_YIELD")!;
    expect(failed.kind === "violation" ? failed.detail : undefined).toBe("give-way");
    // The scan WAS done (the demo isolates the yield failure) — so no
    // scan-incomplete rides along, and there is no full-stop demand at a Б1.
    expect(codes).not.toContain("JUNCTION_SCAN_INCOMPLETE");
    expect(codes).not.toContain("STOP_SIGN_NO_FULL_STOP");
    expect(prio.some((e) => e.situation === "give-way" && e.violated)).toBe(true);
    expect(drive.outcomes.find((o) => o.eventId === "sc-jxgb-conflict")?.detail).toBe("violation");
  });

  it("„Излизане без пълен оглед“: exactly JUNCTION_SCAN_INCOMPLETE, no full-stop demand, no yield fault", () => {
    const { drive, prio } = drives.get("mistake-no-scan")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_JX_GIVEWAY_B1.mistakes[1].codeRefs].sort());
    // Б1 never demands a full stop; and the drive ends before mouth 2, so the
    // priority runner never arms — nothing else can grade.
    expect(codes).not.toContain("STOP_SIGN_NO_FULL_STOP");
    expect(codes).not.toContain("FAILED_TO_YIELD");
    expect(prio.length).toBe(0);
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", TEMPLATE_ID);
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", TEMPLATE_ID);

  for (const name of scJxGivewayB1TraceNames()) {
    it(`${TEMPLATE_ID}/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
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
      expect(parsed!.meta.scenarioId).toBe(TEMPLATE_ID);
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    for (const name of scJxGivewayB1TraceNames()) {
      const again = recordScJxGivewayB1Drive(district, name);
      expect(serializeScenarioTrace(again.trace), name).toBe(
        serializeScenarioTrace(drives.get(name)!.drive.trace),
      );
    }
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_JX_GIVEWAY_B1.shadow, ...SC_JX_GIVEWAY_B1.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${TEMPLATE_ID}/`)).toBe(true);
    }
    const expected = scJxGivewayB1TraceNames().map((n) => `content/traces/${TEMPLATE_ID}/${n}.trace.json`);
    expect([SC_JX_GIVEWAY_B1.shadow.path, ...SC_JX_GIVEWAY_B1.mistakes.map((m) => m.traceRef.path)]).toEqual(
      expected,
    );
  });
});
