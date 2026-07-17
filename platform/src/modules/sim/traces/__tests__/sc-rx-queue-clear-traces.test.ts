/**
 * Trace gate — „Не стъпвай на релсите без изход" (sc-rx-queue-clear on
 * rx-guarded-v1, doc 72 RX-03 „опашка върху прелеза"), doc 76 §5/§9
 * stages 3+5:
 *   1. SHADOW waits out BOTH gates at the stop line — the barrier's
 *      deterministic lift (down [0, 40) of every 90 s) and the staged queue
 *      tail's departure (t ≈ 51.7) — then crosses in one move → ZERO
 *      violations + CLEAN_DRIVING.
 *   2. MISTAKE DEMOS grade EXACTLY one code each: the rails freeze bills
 *      RAIL_CROSSING_VIOLATION detail "stopped-on-track" (never
 *      "entered-barred" — every entry lands in the OPEN window, which is the
 *      point: an open barrier is not an exit), the bumper kiss bills
 *      STANDSTILL_GAP_TOO_CLOSE (and no rail code — its transit never rests
 *      on the band, and чл. 52 asks no stop of a guarded-OPEN crossing).
 *   3. COMMITTED FILES under content/traces/sc-rx-queue-clear/ ARE the
 *      recordings, byte-for-byte, with identical public copies.
 *
 * The two determinisms that make these replayable: the barrier timetable is
 * WORLD DATA (same session clock → same phases), and the queue tail is a
 * staged actor whose only clock is the player's own stop (resumeAfterSec).
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-rx-queue-clear-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_RX_QUEUE_CLEAR } from "../../lessons/scenario/templates-rail2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScRxQueueClearDrive, type ScRxQueueClearTraceName } from "../scRxQueueClear";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-rx-queue-clear";
const NAMES: ScRxQueueClearTraceName[] = [
  "shadow-correct",
  "mistake-stop-on-rails",
  "mistake-bumper-kiss",
];

/** rx-guarded-v1: the authored track band + the barrier down-window. */
const BAND_FROM = 150;
const BAND_TO = 156;
const BARRIER_DOWN_TO_SEC = 40;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function violationDetails(d: RecordedDrive): Array<string | undefined> {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.detail);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}
/** First trace sample at/past an arc position (the street runs 0 → 300 on y). */
function firstAt(d: RecordedDrive, y: number) {
  return d.trace.samples.find((s) => s.y >= y);
}

const district = loadDistrict("rx-guarded-v1");
const drives = new Map<ScRxQueueClearTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScRxQueueClearDrive(district, n)]),
);

describe("sc-rx-queue-clear — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;
  it("waits for the EXIT, crosses in one move: ZERO violations + CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("the wait is the drill: it outlasts the barrier AND the queue, then crosses without ever resting on the band", () => {
    // The stop happens BEFORE the rails (the band starts at y = 150)…
    const rest = shadow.trace.samples.find((s) => s.tSec > 5 && Math.abs(s.speedKmh) < 1.5)!;
    expect(rest.y).toBeLessThan(BAND_FROM);
    // …the crossing outlasts the 40 s barred window by a wide margin (the tail
    // rolls at ~51.7 s — the QUEUE is what the shadow is really waiting for,
    // and it is the later of the two gates)…
    const entry = firstAt(shadow, BAND_FROM)!;
    expect(entry.tSec).toBeGreaterThan(BARRIER_DOWN_TO_SEC);
    expect(entry.tSec).toBeGreaterThan(rest.tSec + 30);
    // …and it is ONE move: still rolling briskly all the way across the band.
    for (const s of shadow.trace.samples) {
      if (s.y >= BAND_FROM && s.y <= BAND_TO) expect(s.speedKmh).toBeGreaterThan(5);
    }
  });

  it("carries Bulgarian annotations for the ghost narration", () => {
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-rx-queue-clear — mistakes grade their exact codes (doc 76 §9 stage 5)", () => {
  for (const [i, name] of (["mistake-stop-on-rails", "mistake-bumper-kiss"] as const).entries()) {
    it(`${name}: grades EXACTLY ${SC_RX_QUEUE_CLEAR.mistakes[i].codeRefs.join(" + ")}, once`, () => {
      const drive = drives.get(name)!;
      const codes = [...new Set(violationCodes(drive))].sort();
      expect(codes).toEqual([...SC_RX_QUEUE_CLEAR.mistakes[i].codeRefs].sort());
      expect(violationCodes(drive)).toHaveLength(1);
    });
  }

  it("the rails freeze bills the REST arm, never the barred one — the whole point of the drill", () => {
    const drive = drives.get("mistake-stop-on-rails")!;
    // detail "stopped-on-track" is the RX-03 arm. If this ever read
    // "entered-barred", the demo would be teaching RX-01's lesson instead:
    // the barrier is UP when this car enters, and it enters anyway.
    expect(violationDetails(drive)).toEqual(["stopped-on-track"]);
    const entry = firstAt(drive, BAND_FROM)!;
    expect(entry.tSec).toBeGreaterThan(BARRIER_DOWN_TO_SEC);
    // It really came to rest ON the band, and stayed (≫ the 2 s sustain).
    const onBand = drive.trace.samples.filter(
      (s) => s.y >= BAND_FROM && s.y <= BAND_TO && Math.abs(s.speedKmh) < 1.5,
    );
    expect(onBand.length).toBeGreaterThan(0);
    expect(onBand[onBand.length - 1].tSec - onBand[0].tSec).toBeGreaterThan(2);
  });

  it("the bumper kiss is CLEAR of the band — one fault, one bill (no rail double-charge)", () => {
    const drive = drives.get("mistake-bumper-kiss")!;
    const last = drive.trace.samples[drive.trace.samples.length - 1];
    // Rests past the far rail: 160.75 vs the band's 156 — so the standstill
    // code stands alone. (And it never crawls to a rest ON the band on the way.)
    expect(last.y).toBeGreaterThan(BAND_TO);
    for (const s of drive.trace.samples) {
      if (s.y >= BAND_FROM && s.y <= BAND_TO) expect(Math.abs(s.speedKmh)).toBeGreaterThan(5);
    }
    expect(violationCodes(drive)).not.toContain("RAIL_CROSSING_VIOLATION");
    // …and it stops SHORT of contact — the fault is the gap, not a crash.
    expect(violationCodes(drive)).not.toContain("COLLISION");
  });

  it("the two demos are two DIFFERENT faults of one lesson (the queue, not the train)", () => {
    // Same map, same staged tail, same lawful open-barrier entry — the split is
    // WHERE each car chose to come to rest.
    expect(violationCodes(drives.get("mistake-stop-on-rails")!)).not.toEqual(
      violationCodes(drives.get("mistake-bumper-kiss")!),
    );
    for (const name of NAMES) {
      expect(violationCodes(drives.get(name)!)).not.toContain("FOLLOWING_TOO_CLOSE");
    }
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
    for (const name of NAMES) {
      const again = recordScRxQueueClearDrive(district, name);
      expect(serializeScenarioTrace(again.trace)).toBe(
        serializeScenarioTrace(drives.get(name)!.trace),
      );
    }
  });
  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_RX_QUEUE_CLEAR.shadow, ...SC_RX_QUEUE_CLEAR.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_RX_QUEUE_CLEAR.shadow.path,
      ...SC_RX_QUEUE_CLEAR.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});

describe("pinned geometry — the template copies match the committed map", () => {
  it("the staged queue tail rests where the template says, past the far rail", () => {
    const tail = SC_RX_QUEUE_CLEAR.staged![0];
    expect(tail.kind).toBe("brakingLeadCar");
    if (tail.kind !== "brakingLeadCar") return;
    // Ten meters CLEAR of the band: close enough that following it onto the
    // rails strands you, far enough that the kiss rest lands off the band.
    expect(tail.actor.hold.offsetM).toBeGreaterThan(BAND_TO);
    expect(tail.actor.hold.offsetM).toBe(166);
    // The "slam" IS the hold pose — the queue is already stopped on arrival.
    expect(tail.slamAt).toEqual({ x: 4.06, y: tail.actor.hold.offsetM });
    // …and its path is the district's own northbound street.
    expect(tail.actor.pathNodes).toEqual(["rxg-n-start", "rxg-n-end"]);
  });

  it("rx-guarded-v1 meta.scenario mirrors the template recipe (band + barrier timetable)", () => {
    const d = district as {
      meta: {
        scenario?: {
          laneCenterRightM?: number;
          railCrossing?: {
            signRef?: string;
            fromM?: number;
            toM?: number;
            guarded?: boolean;
            stopLineY?: number;
            barrier?: { cycleSec?: number; downFromSec?: number; downToSec?: number };
          };
        };
      };
      spawnPoints?: Array<{ id: string; x: number; y: number }>;
    };
    const rail = d.meta.scenario?.railCrossing;
    expect(d.meta.scenario?.laneCenterRightM).toBe(4.06);
    expect(rail?.guarded).toBe(true);
    expect(rail?.signRef).toBe("А34");
    expect(rail?.fromM).toBe(SC_RX_QUEUE_CLEAR.map.params.crossingFromM);
    expect(rail?.toM).toBe(SC_RX_QUEUE_CLEAR.map.params.crossingToM);
    // The stop line the „sc-rxq-hold" objective is pinned to.
    expect(rail?.stopLineY).toBe(SC_RX_QUEUE_CLEAR.success[0].params.kind === "reachZone"
      ? SC_RX_QUEUE_CLEAR.success[0].params.y
      : null);
    expect(rail?.barrier?.cycleSec).toBe(SC_RX_QUEUE_CLEAR.map.params.barrierCycleSec);
    expect(rail?.barrier?.downFromSec).toBe(SC_RX_QUEUE_CLEAR.map.params.barrierDownFromSec);
    expect(rail?.barrier?.downToSec).toBe(SC_RX_QUEUE_CLEAR.map.params.barrierDownToSec);
    // The spawn the template starts from really exists on the committed map.
    expect(d.spawnPoints?.some((s) => s.id === SC_RX_QUEUE_CLEAR.start.spawnPointId)).toBe(true);
  });
});
