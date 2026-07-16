/**
 * FO-pair trace gate — „Лепка отзад" (sc-follow-tailgater on ln-v1, doc 72
 * FO-07, learn-only policy), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays through the production stack with ZERO violations and
 *      earns CLEAN_DRIVING: the tailgater is PRESSURE SCENERY (its runner
 *      emits zero events), the taught response is the player's own ease-off —
 *      the FRONT gap visibly grows through the corridor.
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs through SHIPPED
 *      detectors: the brake-check → HARSH_BRAKING_NO_CAUSE (the rear car is
 *      NOT a forward cause — the ledger reads only the forward leadGap
 *      channel, and the front lead sits ~90 m out), guilty speeding →
 *      SPEEDING_OVER_LIMIT.
 *   3. COMMITTED FILES under content/traces/sc-follow-tailgater/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-follow-tailgater-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_FOLLOW_TAILGATER } from "../../lessons/scenario/templates-following";
import type { SimTick } from "../../rules";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScFollowTailgaterDrive,
  type ScFollowTailgaterTraceName,
} from "../scFollowTailgater";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-follow-tailgater";
const NAMES: ScFollowTailgaterTraceName[] = [
  "shadow-correct",
  "mistake-brake-check",
  "mistake-speed-up",
];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("ln-v1");
const ticksByName = new Map<ScFollowTailgaterTraceName, SimTick[]>(NAMES.map((n) => [n, []]));
const drives = new Map<ScFollowTailgaterTraceName, RecordedDrive>(
  NAMES.map((n) => [
    n,
    recordScFollowTailgaterDrive(district, n, { onTick: (t) => ticksByName.get(n)!.push(t) }),
  ]),
);
const shadowTicks = ticksByName.get("shadow-correct")!;

describe("sc-follow-tailgater — the shadow gate (doc 76 §5): learn-only pressure", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("the tailgater latched, saw the ease-off, passed and resolved 'yielded'", () => {
    const tail = shadow.outcomes.find((o) => o.eventId === "sc-ftg-tail");
    expect(tail).toBeDefined();
    expect(tail!.success).toBe(true);
    expect(tail!.detail).toBe("yielded");
  });

  it("the taught response is on the telemetry: the FRONT gap grows through the ease", () => {
    // Front-gap-increase check (doc 72 FO-07) off the existing leadGap
    // channel: compare the gap entering the ease leg with the gap near its
    // end — the constant-speed lead makes the player's lift visible here.
    const gapNear = (tSec: number): number => {
      const tick = shadowTicks.find((t) => t.t >= tSec);
      return tick?.leadGapM !== undefined && Number.isFinite(tick.leadGapM)
        ? (tick.leadGapM as number)
        : Infinity;
    };
    const before = gapNear(14); // cruising at ~42 km/h behind the lead
    const after = gapNear(25); // deep in the ease-off
    expect(Number.isFinite(before)).toBe(true);
    expect(Number.isFinite(after)).toBe(true);
    expect(after).toBeGreaterThan(before + 15); // the cushion visibly grew
  });
});

describe("sc-follow-tailgater — the learn-only law (doc 72 FO-07, A12)", () => {
  it("the tailgater emits ZERO SimTick events across every drive — pressure scenery only", () => {
    // Ambient traffic is zero and the front lead never slams, so any
    // prioritySituation/collision in any tick could only come from the
    // rearTailgater runner — there must be none, even under the brake-check.
    for (const name of NAMES) {
      for (const tick of ticksByName.get(name)!) {
        for (const e of tick.events) {
          expect(
            e.kind === "prioritySituation" || e.kind === "collision",
            `${name}: unexpected staged event ${e.kind} at t=${tick.t.toFixed(1)}`,
          ).toBe(false);
        }
      }
    }
  });
});

describe("sc-follow-tailgater — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Спирачен удар“: exactly HARSH_BRAKING_NO_CAUSE — the rear car is not a forward cause", () => {
    const drive = drives.get("mistake-brake-check")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_FOLLOW_TAILGATER.mistakes[0].codeRefs].sort());
  });

  it("„Гузно ускоряване“: exactly SPEEDING_OVER_LIMIT (minor band, not dangerous)", () => {
    const drive = drives.get("mistake-speed-up")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_FOLLOW_TAILGATER.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("SPEEDING_DANGEROUS");
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
    const again = recordScFollowTailgaterDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_FOLLOW_TAILGATER.shadow, ...SC_FOLLOW_TAILGATER.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_FOLLOW_TAILGATER.shadow.path, ...SC_FOLLOW_TAILGATER.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
