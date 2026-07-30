/**
 * JU-16 trace gate — „Зелено, но изходът е задръстен" (sc-jx-blocked-exit on
 * sx-v1, doc 72 JU-16 „Навлизане в задръстено кръстовище / Block-the-box"),
 * doc 76 §5/§9 stages 3+5:
 *
 *  1. SHADOW replays through the PRODUCTION stack with ZERO violations — it
 *     REFUSES a whole green in front of a blocked exit (the act JU-09's
 *     hesitation detector would bill if its clear-ahead flag could not see the
 *     column), sits out the red while the queue pulls away, and crosses on the
 *     NEXT green. The two assertions that make it a proof and not a vibe: the
 *     line crossing carries lightState "green", and the drive never bills
 *     HESITATION_AT_GREEN even though it is stationary at a green light within
 *     the detector's 12 m line window for ~7 s.
 *  2. MISTAKE DEMOS grade EXACTLY one code each — the full-box entry bills
 *     STANDSTILL_GAP_TOO_CLOSE (and NO signal code: it enters on a lawful
 *     green, which is the whole point), the impatient start bills
 *     RED_LIGHT_CROSSED (and NO standstill/following code: the column is gone
 *     and the gap is opening).
 *  3. COMMITTED FILES under content/traces/sc-jx-blocked-exit/ ARE the
 *     recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * The two determinisms that make these replayable: the ns lamp is pinned by
 * signalOffsets (wall clock), and the queue tail is a staged actor whose only
 * clock is the player's own stop (resumeAfterSec) — so each drive's column
 * rolls 24 s after THAT drive's first rest.
 *
 * RE-RECORD (after ANY change to the scripts, recorder, district or rules):
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-jx-blocked-exit-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SimTickEvent } from "../../rules";
import { SC_JX_BLOCKED_EXIT } from "../../lessons/scenario/templates-junctions4";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScJxBlockedExitDrive, type ScJxBlockedExitTraceName } from "../scJxBlockedExit";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-jx-blocked-exit";
const NAMES: ScJxBlockedExitTraceName[] = [
  "shadow-correct",
  "mistake-enter-full-box",
  "mistake-impatient-red",
];

/** sx-v1: the ns south-approach stop line and the staged column's rest pose. */
const STOP_LINE_Y = -27.73;
/**
 * T12 (ledger §2): 16 → 31. Both ribbons on sx-v1 are cut 27.125 m from
 * sx-n-c, so the junction is a 54.25 m open square and a car resting at y = 16
 * spanned 13.95 … 18.05 — 9.1 m SHORT of the far mouth, i.e. parked in the
 * middle of the intersection, in the lesson about not standing in one. At 31
 * the column spans 28.95 … 33.05: 1.23 m clear of the paint at 27.725.
 */
const QUEUE_TAIL_Y = 31;
/** Bumper-kiss rest = tail − (4.1 m of car + the 1.1 m standstill gap). */
const KISS_Y = QUEUE_TAIL_Y - 5.2;
/** The far mouth of the junction on the ns axis (stop lines sit ±27.725 m). */
const FAR_MOUTH_Y = 27.725;
/** Half a car, m — the free space test below is „less than one car fits". */
const CAR_HALF_M = 2.05;

type LineCrossing = Extract<SimTickEvent, { kind: "stopLineCrossed" }>;

interface DriveWithLines {
  drive: RecordedDrive;
  lines: LineCrossing[];
  /** Session time of each line crossing, s (the tick clock the event rode in). */
  lineTimes: number[];
}

const district = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "sx-v1.json"), "utf-8"),
);

function record(name: ScJxBlockedExitTraceName): DriveWithLines {
  const lines: LineCrossing[] = [];
  const lineTimes: number[] = [];
  const drive = recordScJxBlockedExitDrive(district, name, {
    onTick: (t) => {
      for (const e of t.events) {
        if (e.kind === "stopLineCrossed") {
          lines.push(e);
          lineTimes.push(t.t);
        }
      }
    },
  });
  return { drive, lines, lineTimes };
}

function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

const drives = new Map<ScJxBlockedExitTraceName, DriveWithLines>(NAMES.map((n) => [n, record(n)]));

describe("sc-jx-blocked-exit — the shadow gate (doc 76 §5)", () => {
  const { drive: shadow, lines, lineTimes } = drives.get("shadow-correct")!;

  it("refuses the blocked green and crosses on the NEXT one: ZERO violations", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(lines.length).toBe(1);
    expect(lines[0].control).toBe("trafficLight");
    expect(lines[0].lightState).toBe("green");
    // Not the green it arrived on: the crossing lands in the SECOND green
    // window (the ns lamp runs green [0,20) → … → green [50,70) at offset 0).
    expect(lineTimes[0]).toBeGreaterThan(50);
  });

  it("the refusal is the drill: it waits out a whole cycle SHORT of the line", () => {
    // It really stopped before the paint (never over it — the JU-15 window).
    const rest = shadow.trace.samples.find((s) => s.tSec > 5 && Math.abs(s.speedKmh) < 1)!;
    expect(rest.y).toBeLessThan(STOP_LINE_Y);
    expect(rest.tSec).toBeLessThan(20); // …while the FIRST green is still up
    // …and it holds there through green + yellow + the whole red (≥ 35 s).
    const held = shadow.trace.samples.filter(
      (s) => Math.abs(s.speedKmh) < 1 && s.y < STOP_LINE_Y && s.y > -33,
    );
    expect(held[held.length - 1].tSec - held[0].tSec).toBeGreaterThan(35);
  });

  it("waiting at a GREEN light is not billed — JU-09's clear-ahead flag sees the column", () => {
    // The load-bearing innocence of this template. The shadow is stationary at
    // a green lamp, inside the 12 m line window, indicator off, for ~7 s — the
    // hesitation detector's arming picture EXACTLY. The only thing that keeps
    // it innocent is the calibrated lead-gap exemption, so if this ever fires
    // the drill is teaching students to enter blocked junctions.
    expect(violationCodes(shadow)).not.toContain("HESITATION_AT_GREEN");
    const stationaryOnGreen = shadow.trace.samples.filter(
      (s) => Math.abs(s.speedKmh) < 1 && s.tSec < 20 && s.tSec > 13,
    );
    expect(stationaryOnGreen.length).toBeGreaterThan(0);
  });

  it("carries Bulgarian annotations for the ghost narration", () => {
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-jx-blocked-exit — mistakes grade their exact codes (doc 76 §9 stage 5)", () => {
  for (const [i, name] of (["mistake-enter-full-box", "mistake-impatient-red"] as const).entries()) {
    it(`${name}: grades EXACTLY ${SC_JX_BLOCKED_EXIT.mistakes[i].codeRefs.join(" + ")}, once`, () => {
      const { drive } = drives.get(name)!;
      const codes = [...new Set(violationCodes(drive))].sort();
      expect(codes).toEqual([...SC_JX_BLOCKED_EXIT.mistakes[i].codeRefs].sort());
      expect(violationCodes(drive)).toHaveLength(1);
    });
  }

  it("the full-box entry is billed at the BUMPER, never at the lamp — it entered on green", () => {
    const { drive, lines } = drives.get("mistake-enter-full-box")!;
    // The entry itself is lawful: green lamp, one crossing, no signal code.
    expect(lines.length).toBe(1);
    expect(lines[0].lightState).toBe("green");
    for (const code of ["RED_LIGHT_CROSSED", "RED_YELLOW_CROSSED", "YELLOW_LIGHT_NOT_STOPPED"]) {
      expect(violationCodes(drive)).not.toContain(code);
    }
    // It came to rest INSIDE the junction, past the node, straddling the far
    // mouth — the JU-16 stranding. (The honest caveat this template documents:
    // the shipped detector convicts the bumper-kiss, not the box occupancy.)
    const last = drive.trace.samples[drive.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(0);
    expect(last.y).toBeLessThan(FAR_MOUTH_Y);
    // …on the column's bumper, and it STAYED (≫ the 1.5 s standstill sustain).
    const stranded = drive.trace.samples.filter((s) => Math.abs(s.speedKmh) < 1 && s.y > 0);
    expect(stranded[stranded.length - 1].tSec - stranded[0].tSec).toBeGreaterThan(1.5);
    // …and it stopped SHORT of contact — the fault is the gap, not a crash.
    expect(violationCodes(drive)).not.toContain("COLLISION");
  });

  it("the impatient start is billed at the LAMP, never at the bumper — the column is gone", () => {
    const { drive, lines, lineTimes } = drives.get("mistake-impatient-red")!;
    expect(lines.length).toBe(1);
    expect(lines[0].lightState).toBe("red");
    // It crossed deep into the red (up since t = 23), not on a marginal flip.
    expect(lineTimes[0]).toBeGreaterThan(30);
    expect(lineTimes[0]).toBeLessThan(49);
    // The queue had already left, so no gap code can double-bill this act.
    for (const code of ["STANDSTILL_GAP_TOO_CLOSE", "FOLLOWING_TOO_CLOSE", "COLLISION"]) {
      expect(violationCodes(drive)).not.toContain(code);
    }
    // And it waited correctly FIRST — the fault is the trigger, not the wait.
    const rest = drive.trace.samples.find((s) => s.tSec > 5 && Math.abs(s.speedKmh) < 1)!;
    expect(rest.y).toBeLessThan(STOP_LINE_Y);
    expect(rest.tSec).toBeLessThan(20);
  });

  it("the two demos are two DIFFERENT faults of one lesson (the exit, not the lamp)", () => {
    // Same map, same staged column, same 24 s queue clock — the split is WHEN
    // each driver decided to move, and against WHICH signal.
    expect(violationCodes(drives.get("mistake-enter-full-box")!.drive)).not.toEqual(
      violationCodes(drives.get("mistake-impatient-red")!.drive),
    );
    // FOLLOWING_TOO_CLOSE is structurally impossible here (followMinSpeedKmh 20
    // vs the 12 km/h roll-in) — if it ever appears the approach was re-tuned.
    for (const name of NAMES) {
      expect(violationCodes(drives.get(name)!.drive)).not.toContain("FOLLOWING_TOO_CLOSE");
    }
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", SCENARIO_ID);
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", SCENARIO_ID);
  for (const name of NAMES) {
    it(`${SCENARIO_ID}/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
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
      expect(parsed!.meta.scenarioId).toBe(SCENARIO_ID);
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    for (const name of NAMES) {
      const again = recordScJxBlockedExitDrive(district, name);
      expect(serializeScenarioTrace(again.trace)).toBe(
        serializeScenarioTrace(drives.get(name)!.drive.trace),
      );
    }
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_JX_BLOCKED_EXIT.shadow, ...SC_JX_BLOCKED_EXIT.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_JX_BLOCKED_EXIT.shadow.path,
      ...SC_JX_BLOCKED_EXIT.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});

describe("pinned geometry — the template copies match the committed map", () => {
  it("the staged column rests where the template says, past the far mouth", () => {
    const tail = SC_JX_BLOCKED_EXIT.staged![0];
    expect(tail.kind).toBe("brakingLeadCar");
    if (tail.kind !== "brakingLeadCar") return;
    expect(tail.actor.hold.offsetM).toBe(QUEUE_TAIL_Y);
    /**
     * T12 — the whole design in three assertions, and the one that used to be
     * INVERTED. The old test demanded `offsetM < FAR_MOUTH_Y`, i.e. it pinned
     * the column INSIDE the junction square and called that „past the crossing
     * roadway". It is the opposite:
     *   1. the column's whole body must be PAST the far paint — it is the
     *      queue beyond the junction, not scenery parked in one (чл. 98);
     *   2. but the free space between the mouth and its bumper must be under
     *      one car length, or a driver who enters simply fits and the drill
     *      has no premise;
     *   3. so the follower's bumper-kiss rest lands INSIDE the square.
     */
    expect(tail.actor.hold.offsetM - CAR_HALF_M).toBeGreaterThan(FAR_MOUTH_Y);
    expect(tail.actor.hold.offsetM - CAR_HALF_M - FAR_MOUTH_Y).toBeLessThan(4.1);
    expect(KISS_Y + CAR_HALF_M).toBeLessThan(FAR_MOUTH_Y + CAR_HALF_M);
    expect(KISS_Y - CAR_HALF_M).toBeGreaterThan(0);
    // The "slam" IS the hold pose — the column is already stopped on arrival.
    expect(tail.slamAt).toEqual({ x: 4.06, y: tail.actor.hold.offsetM });
    // …and its path is the district's own northbound ns road, through the node.
    expect(tail.actor.pathNodes).toEqual(["sx-n-s", "sx-n-c", "sx-n-n"]);
    expect(tail.actor.hold.nodeIndex).toBe(1); // sx-n-c, the signalized node
  });

  it("sx-v1 mirrors the template recipe (the x-junction params + the spawn)", () => {
    const d = district as {
      meta: { scenario?: { params?: Record<string, number | string>; junctionNodeId?: string } };
      spawnPoints?: Array<{ id: string }>;
      roads: { nodes: Array<{ id: string }> };
    };
    expect(d.meta.scenario?.params).toEqual(SC_JX_BLOCKED_EXIT.map.params);
    expect(d.meta.scenario?.junctionNodeId).toBe("sx-n-c");
    // The spawn the template starts from really exists on the committed map…
    expect(d.spawnPoints?.some((s) => s.id === SC_JX_BLOCKED_EXIT.start.spawnPointId)).toBe(true);
    // …and so does every node the staged column's path names.
    const tail = SC_JX_BLOCKED_EXIT.staged![0];
    if (tail.kind !== "brakingLeadCar") return;
    const nodeIds = new Set(d.roads.nodes.map((n) => n.id));
    for (const id of tail.actor.pathNodes) expect(nodeIds.has(id), id).toBe(true);
  });

  it("the ruleConfig widens JU-09's flag past the pinned wait geometry, and nothing else", () => {
    // The override is scenario-scoped and single-purpose. It must cover the
    // bumper gap the column stands at while the player waits at the line
    // (tail − hold pose − 4.1 m of car), and it must NOT reach the ~130 m the
    // column is gone to by the next green — the release that re-arms JU-09.
    // T12 moved the tail 16 → 31, so the covered gap moves 41.44 → 56.4 and
    // the flag moves 48 → 63, keeping the same ~6.6 m of margin.
    const waitGapM = QUEUE_TAIL_Y - -29.5 - 4.1;
    expect(waitGapM).toBeCloseTo(56.4, 2);
    expect(SC_JX_BLOCKED_EXIT.ruleConfig).toEqual({ hesitationClearGapM: 63 });
    const flag = SC_JX_BLOCKED_EXIT.ruleConfig!.hesitationClearGapM!;
    expect(flag).toBeGreaterThan(waitGapM);
    expect(flag).toBeLessThan(waitGapM + 12);
  });
});
