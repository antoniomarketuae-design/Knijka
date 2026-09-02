/**
 * VP-06 cockpit-triage trace gate — „Червена лампа — спри сега"
 * (sc-vp-telltale-red on ln-v1, doc 72 VP-06 red/amber TRIAGE), doc 76 §5/§9
 * stages 3+5:
 *   1. SHADOW replays with ZERO violations: drives ON past the amber cue and
 *      RESTS in the curb-side RED stop zone (mirror, right indicator, eased
 *      right — the telltale runner's outcome records "yielded").
 *   2. MISTAKE DEMOS grade EXACTLY their shipped codes — the runner itself
 *      emits NOTHING (A12: no new detector, no new code):
 *      - „Каране нататък с червената лампа" → COLLISION (the ignore reflex to
 *        its end: the seized engine coasts off line into the roadside — an
 *        AUTHORED consequence, held at a lawful 45 so SPEEDING never joins);
 *      - „Паническо спиране в активната лента" → HARSH_BRAKING_NO_CAUSE (the
 *        wrong reflex: panic-slam in-lane instead of a planned pull-over — the
 *        stimulus is NOT a forward cause in the harsh-brake ledger).
 *   3. COMMITTED FILES under content/traces/sc-vp-telltale-red/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-vp-telltale-red-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_VP_TELLTALE_RED } from "../../lessons/scenario/templates-cockpit2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScVpTelltaleRedDrive, type ScVpTelltaleRedTraceName } from "../scVpTelltaleRed";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-vp-telltale-red";
const NAMES: ScVpTelltaleRedTraceName[] = ["shadow-correct", "mistake-drive-on", "mistake-panic-lane"];

/** The template's RED halt-zone contract (single truth asserted below). */
const STOP = { x: 13.9, y: 255, radiusM: 3 };
/** The amber-continue checkpoint (before the red trigger). */
const AMBER = { x: 12.19, y: 110 };

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

const district = loadDistrict("ln-v1");
const drives = new Map<ScVpTelltaleRedTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScVpTelltaleRedDrive(district, n)]),
);

describe("sc-vp-telltale-red — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("continues past the amber checkpoint while rolling, then rests in the RED stop zone, outcome 'yielded'", () => {
    // The amber verdict: the shadow was moving when it crossed the checkpoint
    // (it never panic-stopped for the amber cue).
    const atAmber = shadow.trace.samples.find(
      (s) => Math.hypot(s.x - AMBER.x, s.y - AMBER.y) < 6,
    );
    expect(atAmber).toBeDefined();
    expect(Math.abs(atAmber!.speedKmh)).toBeGreaterThan(10);
    // The red verdict: rests at the curb-side halt point past the lamp.
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(Math.hypot(last.x - STOP.x, last.y - STOP.y)).toBeLessThan(STOP.radiusM);
    expect(last.x).toBeGreaterThan(13); // pulled RIGHT of the lane center (12.19)
    expect(Math.abs(last.speedKmh)).toBeLessThan(1); // fully stopped
    // TWO staged cues since 2026-09-02 (sc-vp-telltale-red:775b58cc — the lamp
    // channel now names its colour), met in the order the lesson teaches: the
    // AMBER check-engine lamp is shown and carried past ("clear"), then the RED
    // temperature lamp is stopped for ("yielded"). Order is the assertion, not
    // an accident: red-before-amber would be a different lesson.
    expect(shadow.outcomes.map((o) => o.eventId)).toEqual([
      "sc-vptr-amber-lamp",
      "sc-vptr-lamp",
    ]);
    expect(shadow.outcomes[0]).toMatchObject({
      eventId: "sc-vptr-amber-lamp",
      kind: "telltaleStimulus",
      success: true,
      detail: "clear",
    });
    expect(shadow.outcomes[1]).toMatchObject({
      eventId: "sc-vptr-lamp",
      kind: "telltaleStimulus",
      success: true,
      detail: "yielded",
    });
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(3);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-vp-telltale-red — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Каране нататък с червената лампа“: exactly COLLISION; the ignored lamp itself convicts NOTHING", () => {
    const drive = drives.get("mistake-drive-on")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_VP_TELLTALE_RED.mistakes[0].codeRefs].sort());
    // The lawful 45 stays inside the graced band and the right lane.
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("SPEEDING_DANGEROUS");
    expect(codes).not.toContain("HARSH_BRAKING_NO_CAUSE");
    expect(codes).not.toContain("NOT_KEEPING_RIGHT");
    // BOTH cues resolve, and the pair IS the lesson: the amber one was met and
    // correctly carried past ("clear"), the red one was met and driven past
    // ("passedWithoutStopping"). That second resolution is what now emits the
    // "warning-lamp" prioritySituation and earns the основна above — before
    // 2026-09-02 the demo turned back into the roadside at y = 230, so the red
    // encounter never resolved and the card convicted only the crash.
    expect(drive.outcomes.map((o) => o.eventId)).toEqual([
      "sc-vptr-amber-lamp",
      "sc-vptr-lamp",
    ]);
    expect(drive.outcomes[0]).toMatchObject({ success: true, detail: "clear" });
    expect(drive.outcomes[1]).toMatchObject({
      success: false,
      detail: "passedWithoutStopping",
    });
    const last = drive.trace.samples[drive.trace.samples.length - 1];
    expect(Math.hypot(last.x - STOP.x, last.y - STOP.y)).toBeGreaterThan(STOP.radiusM); // never reached the halt point
  });

  it("„Паническо спиране в активната лента“: exactly HARSH_BRAKING_NO_CAUSE, rests mid-lane short of the halt point", () => {
    const drive = drives.get("mistake-panic-lane")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_VP_TELLTALE_RED.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("SPEEDING_DANGEROUS");
    expect(codes).not.toContain("COLLISION");
    // Stopped in the traffic lane, short of the halt point: the RED trigger
    // never falls ignoreBeyondM behind, so THAT encounter stays UNRESOLVED and
    // its stop zone stays unreached (the sc-vp-telltale panic precedent). The
    // amber cue upstream was carried past normally before the panic.
    expect(drive.outcomes.filter((o) => o.eventId === "sc-vptr-lamp")).toEqual([]);
    expect(drive.outcomes.map((o) => o.eventId)).toEqual(["sc-vptr-amber-lamp"]);
    const last = drive.trace.samples[drive.trace.samples.length - 1];
    expect(Math.abs(last.speedKmh)).toBeLessThan(1);
    expect(Math.abs(last.x - 12.19)).toBeLessThan(0.5); // mid-lane, never eased right
    expect(Math.hypot(last.x - STOP.x, last.y - STOP.y)).toBeGreaterThan(STOP.radiusM);
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", SCENARIO_ID);
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", SCENARIO_ID);

  for (const name of NAMES) {
    it(`${SCENARIO_ID}/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
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
      expect(parsed!.meta.scenarioId).toBe(SCENARIO_ID);
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    const again = recordScVpTelltaleRedDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_VP_TELLTALE_RED.shadow, ...SC_VP_TELLTALE_RED.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_VP_TELLTALE_RED.shadow.path, ...SC_VP_TELLTALE_RED.mistakes.map((m) => m.traceRef.path)]).toEqual(
      expected,
    );
  });
});
