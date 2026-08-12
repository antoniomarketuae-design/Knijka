/**
 * Signals-family trace gates — the dead/flashing-signal capability (doc 76
 * §5/§9, stages 3+5): sc-signal-dead and sc-signal-flashing, both on sx-v1 with
 * sx-n-c dialed DARK / flashing amber (the capability under test, doc 72 JU-20).
 *
 *  1. SHADOWS replay through the PRODUCTION stack (runtime + traffic + scenario
 *     director + rules) with ZERO violations, earn YIELDED_TO_PRIORITY, and
 *     resolve their staged priority car as "yielded". NO signal code ever fires
 *     (the dark/flashing cluster maps the junction to unsignalized).
 *  2. MISTAKE DEMOS grade EXACTLY FAILED_TO_YIELD — the right-hand-rule tracker
 *     convicting a barge / cut into the car from the right.
 *  3. COMMITTED FILES under content/traces/<template>/ ARE the recordings of
 *     these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD (after ANY change to the scripts, the recorder, sx-v1 or the rule
 * engine, then commit the JSON):
 *
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-signals-traces.test.ts
 *
 * Capability note: absent the signalModes dial these same drives would face
 * live lamps (RED_LIGHT_CROSSED / STOP_LINE_OVERSHOOT). The mode is additive —
 * with it, no signal code fires and the shipped RHR adjudication governs the
 * junction, exactly as doc 72 JU-20 specifies.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_SIGNAL_DEAD, SC_SIGNAL_FLASHING } from "../../lessons/scenario/templates-signals";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScSignalDrive,
  scSignalTraceNames,
  type ScSignalTemplateId,
  type ScSignalTraceName,
} from "../scSignals";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}

// B40(b): the two drills no longer share a map, so the district is read off
// the TEMPLATE rather than named here — a recorder that replays a lesson on a
// street the lesson does not use is exactly the drift this file exists to catch.
const DISTRICT_OF: Record<ScSignalTemplateId, unknown> = {
  "sc-signal-dead": loadDistrict(SC_SIGNAL_DEAD.map.districtId),
  "sc-signal-flashing": loadDistrict(SC_SIGNAL_FLASHING.map.districtId),
};

function record(templateId: ScSignalTemplateId, name: ScSignalTraceName): RecordedDrive {
  return recordScSignalDrive(DISTRICT_OF[templateId], templateId, name);
}

function violationCodes(drive: RecordedDrive): string[] {
  return drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(drive: RecordedDrive): string[] {
  return drive.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const dead = new Map<ScSignalTraceName, RecordedDrive>(
  scSignalTraceNames("sc-signal-dead").map((n) => [n, record("sc-signal-dead", n)]),
);
const flashing = new Map<ScSignalTraceName, RecordedDrive>(
  scSignalTraceNames("sc-signal-flashing").map((n) => [n, record("sc-signal-flashing", n)]),
);

describe("sc-signal-dead — the shadow gate (doc 76 §5)", () => {
  const shadow = dead.get("shadow-correct")!;

  it("replays with ZERO violations and earns the priority-yield commendation", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("YIELDED_TO_PRIORITY");
  });

  it("never fires a signal code (the dark cluster maps to unsignalized)", () => {
    const codes = violationCodes(shadow);
    for (const c of ["RED_LIGHT_CROSSED", "RED_YELLOW_CROSSED", "YELLOW_LIGHT_NOT_STOPPED", "STOP_LINE_OVERSHOOT", "HESITATION_AT_GREEN"]) {
      expect(codes).not.toContain(c);
    }
  });

  it("resolves the staged priority car as 'yielded' and turns left to the west arm at rest", () => {
    const outcome = shadow.outcomes.find((o) => o.eventId === "sc-sdead-conflict");
    expect(outcome).toBeDefined();
    expect(outcome!.success).toBe(true);
    expect(outcome!.detail).toBe("yielded");
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.x).toBeLessThan(-45);
    expect(Math.abs(last.y - 4.06)).toBeLessThan(1.5);
    expect(Math.abs(last.speedKmh)).toBeLessThan(0.5);
  });

  it("demonstrates the ritual: observation glances + Bulgarian annotations", () => {
    const kinds = shadow.trace.events.map((e) => e.kind);
    expect(kinds).toContain("glance-left");
    expect(kinds).toContain("glance-right");
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-signal-dead — mistake demos grade FAILED_TO_YIELD (doc 76 §9 stage 5)", () => {
  for (const name of ["mistake-barge", "mistake-cut"] as const) {
    it(`${name}: exactly FAILED_TO_YIELD, via the right-hand-rule tracker`, () => {
      const drive = dead.get(name)!;
      const codes = [...new Set(violationCodes(drive))].sort();
      expect(codes).toEqual(["FAILED_TO_YIELD"]);
      const rhr = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "FAILED_TO_YIELD")!;
      expect(rhr.kind === "violation" ? rhr.detail : undefined).toBe("right-hand-rule");
      expect(commendationCodes(drive)).not.toContain("YIELDED_TO_PRIORITY");
    });
  }

  it("the mistake codes match the template's authored codeRefs", () => {
    expect([...new Set(violationCodes(dead.get("mistake-barge")!))]).toEqual(SC_SIGNAL_DEAD.mistakes[0].codeRefs);
    expect([...new Set(violationCodes(dead.get("mistake-cut")!))]).toEqual(SC_SIGNAL_DEAD.mistakes[1].codeRefs);
  });
});

describe("sc-signal-flashing — the shadow gate (doc 76 §5)", () => {
  const shadow = flashing.get("shadow-correct")!;

  it("replays with ZERO violations and earns the priority-yield commendation", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("YIELDED_TO_PRIORITY");
  });

  it("never fires a signal code (the flashing-amber cluster maps to unsignalized)", () => {
    const codes = violationCodes(shadow);
    for (const c of ["RED_LIGHT_CROSSED", "RED_YELLOW_CROSSED", "YELLOW_LIGHT_NOT_STOPPED", "STOP_LINE_OVERSHOOT", "HESITATION_AT_GREEN"]) {
      expect(codes).not.toContain(c);
    }
  });

  it("resolves the staged priority car as 'yielded' and clears the junction north at rest", () => {
    const outcome = shadow.outcomes.find((o) => o.eventId === "sc-sflash-conflict");
    expect(outcome).toBeDefined();
    expect(outcome!.success).toBe(true);
    expect(outcome!.detail).toBe("yielded");
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(45);
    expect(Math.abs(last.x - 4.06)).toBeLessThan(1.5);
    expect(Math.abs(last.speedKmh)).toBeLessThan(0.5);
  });

  it("demonstrates the ritual: observation glances + Bulgarian annotations", () => {
    const kinds = shadow.trace.events.map((e) => e.kind);
    expect(kinds).toContain("glance-left");
    expect(kinds).toContain("glance-right");
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-signal-flashing — mistake demos grade FAILED_TO_YIELD (doc 76 §9 stage 5)", () => {
  // B81 — `mistake-barge` does not merely fail to give way to the car from the
  // right: it drives into it. MEASURED on the committed script through the
  // production stack, exact body geometry: first overlap t 19.35 s, 26
  // consecutive frames, deepest 1.3853 m of interpenetration, combined closing
  // speed 48.3 km/h. PriorityFromRightRunner had already retired on the
  // right-hand-rule conviction at t 17.62 — 1.7 s earlier — and `step()`
  // returns on its `phase === "resolved"` guard, so nobody was watching the
  // bodies meet. COPY DEBT (copy lane): the demo's narration and the template
  // codeRefs still say the fault is the priority alone.
  const MEASURED: Record<string, string[]> = {
    "mistake-barge": ["COLLISION", "FAILED_TO_YIELD"],
    "mistake-cut": ["FAILED_TO_YIELD"],
  };
  for (const name of ["mistake-barge", "mistake-cut"] as const) {
    it(`${name}: the right-hand-rule fault, and any crash it really ends in`, () => {
      const drive = flashing.get(name)!;
      const codes = [...new Set(violationCodes(drive))].sort();
      expect(codes).toEqual(MEASURED[name]);
      expect(commendationCodes(drive)).not.toContain("YIELDED_TO_PRIORITY");
    });
  }

  it("the authored codeRefs are the priority fault alone — the B81 copy debt", () => {
    // Pinned, not silently accepted: `mistake-barge` now grades one code more
    // than its card claims. `mistake-cut` still matches exactly.
    expect(SC_SIGNAL_FLASHING.mistakes[0].codeRefs).toEqual(["FAILED_TO_YIELD"]);
    expect([...new Set(violationCodes(flashing.get("mistake-cut")!))]).toEqual(SC_SIGNAL_FLASHING.mistakes[1].codeRefs);
  });
});

describe("committed trace files — the determinism law", () => {
  const CASES: Array<{ templateId: ScSignalTemplateId; drives: Map<ScSignalTraceName, RecordedDrive> }> = [
    { templateId: "sc-signal-dead", drives: dead },
    { templateId: "sc-signal-flashing", drives: flashing },
  ];

  for (const { templateId, drives } of CASES) {
    const contentDir = path.join(REPO_ROOT, "content", "traces", templateId);
    const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", templateId);

    for (const name of scSignalTraceNames(templateId)) {
      it(`${templateId}/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
        const serialized = serializeScenarioTrace(drives.get(name)!.trace) + "\n";
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
        expect(parsed!.meta.scenarioId).toBe(templateId);
      });
    }

    it(`${templateId}: recording is deterministic (a second run serializes identically)`, () => {
      const name = scSignalTraceNames(templateId)[0];
      const again = recordScSignalDrive(DISTRICT_OF[templateId], templateId, name);
      expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get(name)!.trace));
    });
  }

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    for (const spec of [SC_SIGNAL_DEAD, SC_SIGNAL_FLASHING]) {
      const refs = [spec.shadow, ...spec.mistakes.map((m) => m.traceRef)];
      for (const ref of refs) {
        expect(ref.pending, ref.path).not.toBe(true);
        expect(ref.path.startsWith(`content/traces/${spec.id}/`)).toBe(true);
      }
      const expected = scSignalTraceNames(spec.id as ScSignalTemplateId).map(
        (n) => `content/traces/${spec.id}/${n}.trace.json`,
      );
      expect([spec.shadow.path, ...spec.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
    }
  });
});
