/**
 * Trace gate — „Автобусът потегля от спирката" (sc-merge-bus-pullout on
 * mg-busstop-v1, ЗДвП чл. 67), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns CLEAN_DRIVING — reads the
 *      halted rig early, mirrors, EASES from 45 to 28 as it comes out of the
 *      бус лента, and settles behind it at its own pace. The cut-in runner's
 *      own measurement channel independently agrees: outcome „yielded".
 *   2. MISTAKE DEMOS grade EXACTLY their authored codeRefs — once each: the
 *      forcing-past demo grades COLLISION and NOTHING else (it stays under the
 *      posted 50, and the contact lands before any following episode can
 *      sustain); the glue demo grades FOLLOWING_TOO_CLOSE and NEVER COLLISION —
 *      the fault is the held gap, not a second crash.
 *   3. THE MAP'S OWN LAW: no drive ever grades NOT_KEEPING_RIGHT or
 *      DRIVING_IN_BUS_LANE (the full-edge busLane span exempts the general
 *      lane, and the player never enters the curb lane — see gen_mg_busstop
 *      .mjs), any lane-change code (nobody changes lane: this is the merging
 *      family's one template where SOMEONE ELSE merges), HARSH_BRAKING_NO_CAUSE
 *      (the ease is a 4.6 m/s² lift) or SPEEDING (every drive stays ≤ 48).
 *   4. THE CORRIDOR LAW, on the recorded ticks: the bus in the bay is 8.125 m
 *      off the player's lane, beyond LEAD_CORRIDOR_M — so leadGapM is Infinity
 *      for the whole approach and the following duty begins at the pull-out.
 *      That is WHY the shadow's approach can never bill for closing on a
 *      stationary rig, and why the forcing demo's 1.3 s of exposure cannot.
 *   5. COMMITTED FILES under content/traces/sc-merge-bus-pullout/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public
 *      copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-merge-bus-pullout-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_MERGE_BUS_PULLOUT } from "../../lessons/scenario/templates-merging";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScMergeBusPulloutDrive, type ScMergeBusPulloutTraceName } from "../scMergeBusPullout";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-merge-bus-pullout";
const NAMES: ScMergeBusPulloutTraceName[] = [
  "shadow-correct",
  "mistake-force-past",
  "mistake-glue-behind",
];

/** mg-busstop-v1 truths (meta.scenario — pinned by mg-busstop-districts.test.ts). */
const X_GENERAL = 4.0625; // laneId 1 — the player's lane, all 400 m of it
const X_BUS = 12.1875; // laneId 0 — the бус лента; the player must never be here
const BAY_TO_Y = 176; // the bay's exit — where the rig swings into the lane

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

/** One recorded drive + the lead-gap channel of every production tick (the
 *  only place the encounter's timing is observable — TraceSample carries no
 *  gap field). */
interface Probe {
  drive: RecordedDrive;
  ticks: Array<{ t: number; y: number; speedKmh: number; leadGapM: number | null; laneId: number }>;
}

const district = loadDistrict("mg-busstop-v1");
const probes = new Map<ScMergeBusPulloutTraceName, Probe>(
  NAMES.map((n) => {
    const ticks: Probe["ticks"] = [];
    const drive = recordScMergeBusPulloutDrive(district, n, {
      onTick: (tick) => {
        ticks.push({
          t: tick.t,
          y: tick.position.y,
          speedKmh: tick.speedKmh,
          // RuleTick declares leadGapM?: number; the probe's guards below read
          // "no lead" as null, so normalize the absent case at capture.
          leadGapM: tick.leadGapM ?? null,
          laneId: tick.laneId,
        });
      },
    });
    return [n, { drive, ticks }];
  }),
);
const drives = new Map<ScMergeBusPulloutTraceName, RecordedDrive>(
  NAMES.map((n) => [n, probes.get(n)!.drive]),
);

describe("sc-merge-bus-pullout — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("the RUNNER's own channel agrees the duty was discharged: outcome „yielded", () => {
    // The cut-in runner resolves „yielded" only when it SAW the cushion rebuilt
    // (or never lost) and never saw the driver hold a stolen gap. It is an
    // independent witness to the same drive the reducer just acquitted — and,
    // since doc 72 VU-11's bus-yield adjudicator is 🔴 NEW (unshipped), it is
    // the closest thing to a „пропусна го" measurement that exists.
    expect(shadow.outcomes).toHaveLength(1);
    const o = shadow.outcomes[0];
    expect(o.kind).toBe("cutInLeadCar");
    expect(o.eventId).toBe("sc-mgb-bus");
    expect(o.success).toBe(true);
    expect(o.detail).toBe("yielded");
  });

  it("it EASES for the rig instead of racing it — a lift, never a stop", () => {
    const cruising = shadow.trace.samples.filter((s) => s.y > 60 && s.y < 96);
    const easing = shadow.trace.samples.filter((s) => s.y > 160 && s.y < 176);
    expect(easing.length).toBeGreaterThan(0);
    // „Намали" in numbers: the taught beat sheds well over 10 km/h off the
    // approach cruise, right where the bus is coming out.
    expect(Math.max(...easing.map((s) => s.speedKmh))).toBeLessThan(
      Math.max(...cruising.map((s) => s.speedKmh)) - 12,
    );
    // …and it is a LIFT: чл. 67 says „при необходимост спри", and on this
    // authored encounter it is not necessary. A drill won by halting in a
    // traffic lane would teach the wrong reflex.
    const running = shadow.trace.samples.filter((s) => s.y > 40 && s.y < 370);
    expect(Math.min(...running.map((s) => s.speedKmh))).toBeGreaterThan(20);
  });

  it("it never leaves the general lane — the бус лента is the bus's, start to finish", () => {
    for (const s of shadow.trace.samples) expect(s.x, `y=${s.y}`).toBeCloseTo(X_GENERAL, 3);
    for (const p of probes.get("shadow-correct")!.ticks) expect(p.laneId, `t=${p.t}`).toBe(1);
    // The far side of the same coin: it really did drive the whole street.
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(380);
  });

  it("THE CORRIDOR LAW on the real ticks: no lead exists until the rig pulls out", () => {
    const ticks = probes.get("shadow-correct")!.ticks;
    // The whole approach: the bus is halted 8.125 m to the right — beyond the
    // 4 m lead corridor — so no gap channel exists to bill against. „Closing on
    // a bus at a stop" is structurally innocent, which is exactly right.
    for (const p of ticks.filter((p) => p.y < 140)) {
      expect(p.leadGapM, `t=${p.t}`).toBe(Infinity);
    }
    // …and once the rig is in the lane it IS the lead, at a gap the ease built.
    const afterCut = ticks.filter((p) => p.y > BAY_TO_Y + 20);
    expect(afterCut.length).toBeGreaterThan(0);
    expect(afterCut.every((p) => p.leadGapM !== null && p.leadGapM < 60)).toBe(true);
    // The cushion the taught drive kept: never inside the fire band of the
    // 2-second rule (0.7 × 1.8 s of travel), so nothing could sustain.
    for (const p of afterCut) {
      const fireBandM = Math.max(4, (p.speedKmh / 3.6) * 1.8) * 0.7;
      expect(p.leadGapM!, `t=${p.t} v=${p.speedKmh}`).toBeGreaterThan(fireBandM);
    }
  });

  it("uses the taught observation: mirror BEFORE the lift, and narrates the drive", () => {
    const kinds = shadow.trace.events.map((e) => e.kind);
    expect(kinds.filter((k) => k === "glance-rear").length).toBeGreaterThanOrEqual(2);
    // The lift is a message to the car behind — it is sent before the pedal
    // moves, not after.
    const lastGlanceBeforeEase = shadow.trace.events
      .filter((e) => e.kind === "glance-rear")
      .map((e) => e.tSec);
    const easeStart = shadow.trace.samples.find((s) => s.y >= 138)!.tSec;
    expect(Math.min(...lastGlanceBeforeEase.map((t) => easeStart - t))).toBeGreaterThan(0);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-merge-bus-pullout — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Форсиране покрай потеглящия автобус“: exactly COLLISION, once — no speeding, no following", () => {
    const drive = drives.get("mistake-force-past")!;
    const codes = violationCodes(drive);
    expect([...new Set(codes)].sort()).toEqual([...SC_MERGE_BUS_PULLOUT.mistakes[0].codeRefs].sort());
    expect(codes.filter((c) => c === "COLLISION")).toHaveLength(1);
    // The demo's whole discipline: it is NOT a speeding demo and NOT a
    // tailgating demo. The driver breaks no number — he simply refuses a duty.
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
    // It really did put its foot down where the shadow lifts, and really did
    // stay under the posted 50 doing it.
    const pullOut = drive.trace.samples.filter((s) => s.y > 150 && s.y < BAY_TO_Y);
    expect(Math.min(...pullOut.map((s) => s.speedKmh))).toBeGreaterThan(44);
    expect(Math.max(...drive.trace.samples.map((s) => s.speedKmh))).toBeLessThan(50);
  });

  it("the forcing demo's TUNED WINDOW: contact lands before any following episode can sustain", () => {
    // The honest reason the code list above is a clean single COLLISION. The
    // rig crosses into the 4 m lead corridor ~1.3 s into its glide; the
    // authored beat lands ~1.3 s after THAT, and followSustainSec is 2 s. This
    // margin is the tuning, so it is asserted rather than hoped for: a script
    // edit that lets the driver hang there longer turns this demo into the
    // other one, and the assert says so.
    const ticks = probes.get("mistake-force-past")!.ticks;
    const exposed = ticks.filter((p) => p.leadGapM !== null && p.leadGapM !== Infinity && p.speedKmh >= 20);
    expect(exposed.length).toBeGreaterThan(0);
    const window = Math.max(...exposed.map((p) => p.t)) - Math.min(...exposed.map((p) => p.t));
    expect(window).toBeGreaterThan(0.8); // the exposure is REAL — he was right on it
    expect(window).toBeLessThan(2); // …and shorter than followSustainSec
  });

  it("„Залепване зад автобуса след вливането“: exactly FOLLOWING_TOO_CLOSE, once — and never a crash", () => {
    const drive = drives.get("mistake-glue-behind")!;
    const codes = violationCodes(drive);
    expect([...new Set(codes)].sort()).toEqual([...SC_MERGE_BUS_PULLOUT.mistakes[1].codeRefs].sort());
    // Continuous tailgating is ONE episode (stepEpisode's `reset = !tailgating`
    // contract) — a demo that lifted mid-way would bill twice and this assert
    // is what keeps the script honest about that.
    expect(codes.filter((c) => c === "FOLLOWING_TOO_CLOSE")).toHaveLength(1);
    // The demo is the GLUE, not a rear-end: the driver who crashes is the other
    // card, and conflating them would blur both lessons.
    expect(codes).not.toContain("COLLISION");
    // The irony this card is built on: he gave way CORRECTLY first. The ease is
    // in the trace, exactly like the shadow's.
    const easing = drive.trace.samples.filter((s) => s.y > 160 && s.y < BAY_TO_Y);
    expect(Math.max(...easing.map((s) => s.speedKmh))).toBeLessThan(32);
    // …and then closed the cushion he had just been handed, to a couple of car
    // lengths behind a 12 m rig.
    const ticks = probes.get("mistake-glue-behind")!.ticks;
    const finite = ticks.filter((p) => p.leadGapM !== null && p.leadGapM !== Infinity);
    expect(Math.max(...finite.map((p) => p.leadGapM!))).toBeGreaterThan(20); // handed ~23 m…
    expect(Math.min(...finite.map((p) => p.leadGapM!))).toBeLessThan(8); // …and ate it
  });

  it("the map's own law holds on every drive: no keep-right, bus-lane, lane-change or slam leakage", () => {
    for (const name of NAMES) {
      const codes = violationCodes(drives.get(name)!);
      // The full-edge busLane span is what makes a 400 m general-lane cruise
      // (~35 s — three times keepRightSustainSec) innocent (gen_mg_busstop.mjs).
      expect(codes, name).not.toContain("NOT_KEEPING_RIGHT");
      // …and the player never enters laneId 0, so the span's own code can never
      // arm either. The бус лента is scenery for the student, home for the bus.
      expect(codes, name).not.toContain("DRIVING_IN_BUS_LANE");
      for (const p of probes.get(name)!.ticks) expect(p.laneId, `${name} t=${p.t}`).toBe(1);
      // Nobody changes lane in this template — the BUS does.
      expect(codes, name).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR");
      expect(codes, name).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
      expect(codes, name).not.toContain("POOR_LANE_KEEPING");
      // The ease that lets the bus out is a 4.6 m/s² lift, under the 7 m/s²
      // harsh-brake threshold — and the rig is a forward cause anyway.
      expect(codes, name).not.toContain("HARSH_BRAKING_NO_CAUSE");
      expect(codes, name).not.toContain("SPEEDING_DANGEROUS");
      expect(codes, name).not.toContain("WRONG_WAY");
    }
  });

  it("the player never touches the бус лента on any drive — the drill's premise, proved", () => {
    for (const name of NAMES) {
      for (const s of drives.get(name)!.trace.samples) {
        expect(Math.abs(s.x - X_BUS), `${name} y=${s.y}`).toBeGreaterThan(4);
      }
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
    const again = recordScMergeBusPulloutDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_MERGE_BUS_PULLOUT.shadow, ...SC_MERGE_BUS_PULLOUT.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_MERGE_BUS_PULLOUT.shadow.path,
      ...SC_MERGE_BUS_PULLOUT.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
