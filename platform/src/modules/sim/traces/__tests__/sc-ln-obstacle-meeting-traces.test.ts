/**
 * S trace gate — „Препятствието е в твоята половина" (sc-ln-obstacle-meeting on
 * ov-narrow-v1, doc 72 OV-18 × OV-14), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns YIELDED_TO_PRIORITY (waited
 *      in its own lane for the WHOLE oncoming queue, then rounded the row).
 *   2. MISTAKE DEMOS grade EXACTLY their codes — „изнасяне" only COLLISION,
 *      „провиране" only CENTER_LINE_TOUCHED + COLLISION. In particular NEITHER
 *      leaks FAILED_TO_YIELD (sc-ov-narrow's code, for the barge INSIDE the
 *      стеснение) nor OVERTAKE_INSUFFICIENT_GAP (this is заобикаляне at 15-16
 *      km/h, not изпреварване) — see the trace-script header.
 *   3. COMMITTED FILES under content/traces/sc-ln-obstacle-meeting/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ln-obstacle-meeting-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_LN_OBSTACLE_MEETING } from "../../lessons/scenario/templates-lanes2";
import { VEHICLE_PROFILE_WIDTH_M } from "../../traffic/types";
import { CHASSIS_HALF_EXTENTS } from "../../vehicle/tuning";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScLnObstacleMeetingDrive,
  type ScLnObstacleMeetingTraceName,
} from "../scLnObstacleMeeting";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ln-obstacle-meeting";
const NAMES: ScLnObstacleMeetingTraceName[] = [
  "shadow-correct",
  "mistake-pull-out",
  "mistake-squeeze",
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

const district = loadDistrict("ov-narrow-v1");
const drives = new Map<ScLnObstacleMeetingTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScLnObstacleMeetingDrive(district, n)]),
);

describe("sc-ln-obstacle-meeting — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns YIELDED_TO_PRIORITY", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("YIELDED_TO_PRIORITY");
  });

  it("waits out the WHOLE queue — both staged oncoming cars resolve before it moves", () => {
    // The template's claim in two numbers. The stream car (#1) clears on its own
    // clock; the narrowMeeting actor (#2) is the one the runner syncs to the
    // player's arrival, and it resolves "yielded" — i.e. the runner SAW the car
    // standing in its own lane while the conflict was live. A shadow that left
    // after the first car would resolve #2 as a barge, not a yield.
    const stream = shadow.outcomes.find((o) => o.eventId === "sc-lnom-stream")!;
    const meeting = shadow.outcomes.find((o) => o.eventId === "sc-lnom-meeting")!;
    expect(stream.detail).toBe("clear");
    expect(meeting.detail).toBe("yielded");
    expect(meeting.success).toBe(true);
    // …and the wait really is a STOP in the own lane, not a crawl: the car is at
    // rest on the own-lane centre for over ten seconds before anything moves.
    const stopped = shadow.trace.samples.filter(
      (s) => s.speedKmh < 0.5 && s.y > 120 && s.y < 140 && s.x > 3.5,
    );
    expect(stopped.length).toBeGreaterThan(200); // 20 Hz ⇒ > 10 s
  });

  it("rounds the parked row and reaches the far end with Bulgarian annotations", () => {
    // The arc is a real excursion onto the opposing bank and a real return.
    expect(shadow.trace.samples.some((s) => s.x < -3.5 && s.y > 145 && s.y < 165)).toBe(true);
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(210);
    expect(last.x).toBeGreaterThan(3.5); // home, in its own lane
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-ln-obstacle-meeting — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  for (const [i, name] of (
    ["mistake-pull-out", "mistake-squeeze"] as ScLnObstacleMeetingTraceName[]
  ).entries()) {
    it(`${name}: exactly the template's codeRefs, and no neighbouring code leaks`, () => {
      const drive = drives.get(name)!;
      const codes = [...new Set(violationCodes(drive))].sort();
      expect(codes).toEqual([...SC_LN_OBSTACLE_MEETING.mistakes[i].codeRefs].sort());
      // The three codes this map could plausibly leak, each excluded by a
      // deliberate authoring decision (trace-script header):
      expect(codes).not.toContain("FAILED_TO_YIELD"); // never reaches the section
      expect(codes).not.toContain("OVERTAKE_INSUFFICIENT_GAP"); // never > 20 km/h out there
      expect(codes).not.toContain("POOR_LANE_KEEPING"); // one act, one code
    });
  }

  it("the PULL-OUT hits the staged car physically — no scripted collision beat", () => {
    // The contact is the shipped OncomingStreamRunner's own geometric check, so
    // the card's „и го удари челно" is a fact of the recording rather than a
    // story told over it. Car #2 (the narrowMeeting actor) is never reached.
    //
    // The SQUEEZE used to be in this loop and no longer is (2026-08-10). Its
    // lean line is x = −2.0 against a car on x = −4.06: 2.06 m of centres
    // between a 1.70 m body and a 1.84 m body = 0.29 m of CLEAR AIR. The old
    // 3.0 m centre-to-centre circle called that an impact; exact body geometry
    // does not, and on a carriageway PERCEPTUAL_ROAD_SCALE draws 16.25 m wide
    // it is right. Pinned below rather than deleted.
    const d = drives.get("mistake-pull-out")!;
    const stream = d.outcomes.find((o) => o.eventId === "sc-lnom-stream");
    expect(stream).toBeDefined();
    expect(stream!.detail).toBe("collision");
    expect(d.outcomes.find((o) => o.eventId === "sc-lnom-meeting")).toBeUndefined();
    // …and it happens SHORT of the стеснение — the crash is the reason the
    // player never gets there, which is the whole лекция.
    const last = d.trace.samples[d.trace.samples.length - 1];
    expect(last.y).toBeLessThan(138);
  });

  it("the SQUEEZE misses by 29 cm — and that is the honest verdict, not a lost one", () => {
    const d = drives.get("mistake-squeeze")!;
    const stream = d.outcomes.find((o) => o.eventId === "sc-lnom-stream");
    expect(stream).toBeDefined();
    expect(stream!.detail).toBe("clear");
    expect(violationCodes(d)).not.toContain("COLLISION");
    // The authored lean line, from the two numbers the map and the chassis own:
    // 2.06 m of centres, 0.85 + 0.92 of bodies.
    const LEAN_X = -2.0;
    const ONCOMING_X = -4.06;
    const air = Math.abs(LEAN_X - ONCOMING_X) - (CHASSIS_HALF_EXTENTS.x + VEHICLE_PROFILE_WIDTH_M.car / 2);
    expect(air).toBeCloseTo(0.29, 2);
    expect(air).toBeGreaterThan(0);
    // The drive still ends short of the стеснение, so FAILED_TO_YIELD still
    // cannot leak — the лекция's shape is unchanged, only its last claim.
    const last = d.trace.samples[d.trace.samples.length - 1];
    expect(last.y).toBeLessThan(138);
  });

  it("the squeeze rides the paint — the осева ride is the act it IS billed for", () => {
    const d = drives.get("mistake-squeeze")!;
    expect(
      d.ruleEvents.find((e) => e.kind === "violation" && e.code === "CENTER_LINE_TOUCHED"),
    ).toBeDefined();
    // |x| < 0.81 (the band laneOffsetM > 3.25 marks out on this 1+1) with the
    // indicator dark, sustained past the 3.5 s clock.
    const onPaint = d.trace.samples.filter((s) => Math.abs(s.x) < 0.81 && s.indicator === "off");
    expect(onPaint.length).toBeGreaterThan(70); // 20 Hz ⇒ > 3.5 s
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
      const again = recordScLnObstacleMeetingDrive(district, name);
      expect(serializeScenarioTrace(again.trace), name).toBe(
        serializeScenarioTrace(drives.get(name)!.trace),
      );
    }
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_LN_OBSTACLE_MEETING.shadow, ...SC_LN_OBSTACLE_MEETING.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_LN_OBSTACLE_MEETING.shadow.path,
      ...SC_LN_OBSTACLE_MEETING.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
