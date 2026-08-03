/**
 * Trace gate — „Пролука в натоварено кръгово“ (sc-rb-busy-gap on the REUSED
 * rb-mini-v1 district), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays through the production stack with ZERO violations and
 *      EARNS the YIELDED_TO_PRIORITY commendation — the platoon is waited out at
 *      the line and the ring is taken in the gap BEHIND it.
 *   2. THE PLATOON IS REAL — a rigid 26° lead/follower pair that both cross the
 *      player's mouth while the player stands there. The whole lesson rests on
 *      that, so it is asserted against the live traffic system, not assumed.
 *   3. MISTAKE DEMOS grade EXACTLY their template codeRefs — the barge grades
 *      only FAILED_TO_YIELD, and the short-gap entry grades FAILED_TO_YIELD +
 *      COLLISION and nothing else.
 *   4. THE AUTHORED COLLISION IS HONEST — the short-gap demo's `collision` beat
 *      is scripted (see the trace script's note: both runners resolve on the
 *      priority conviction 4 s earlier, so the runner's own contact branch can
 *      never reach it), and this gate proves independently that the two cars are
 *      genuinely in the same place at that clock.
 *   5. COMMITTED FILES ARE the recordings, byte-for-byte, with public copies.
 *
 * Geometry the drills depend on is asserted against the generated district in
 * world/__tests__/rb-mini-district.test.ts (the busy-gap battery).
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-rb-busy-gap-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { StagedEventSpec } from "../../contracts";
import { SC_RB_BUSY_GAP } from "../../lessons/scenario/templates-roundabout";
import { createScenarioDirector } from "../../orchestrator";
import { createWorldRuntime } from "../../runtime";
import { createTrafficSystem } from "../../traffic/system";
import type { TrafficDistrict } from "../../traffic/types";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScRbBusyGapDrive, type ScRbBusyGapTraceName } from "../scRbBusyGap";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const NAMES: ScRbBusyGapTraceName[] = ["shadow-correct", "mistake-barge-lead", "mistake-short-gap"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
/** Circulation angle of a district point, degrees CCW from the SOUTH node
 *  (φ 90 = east, 180 = north, 270 = west) — the trace scripts' own convention. */
function phiDeg(x: number, y: number): number {
  const d = (Math.atan2(x, -y) * 180) / Math.PI;
  return d < 0 ? d + 360 : d;
}

const district = loadDistrict("rb-mini-v1");
const drives = new Map<ScRbBusyGapTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScRbBusyGapDrive(district, n)]),
);

// ---------------------------------------------------------------------------
// The staged-actor twin — the ONE thing recordScriptedDrive cannot hand back
// ---------------------------------------------------------------------------

interface ActorFrame {
  tSec: number;
  /** Player pose this frame (the recorder's own, not a re-simulation). */
  px: number;
  py: number;
  lead: { x: number; y: number; phi: number };
  foll: { x: number; y: number; phi: number };
}

/**
 * Replay one authored drive with a PARALLEL production stack (same modules, same
 * seed, same specs) so the staged pair's pose is observable. RecordedDrive
 * exposes rule events and outcomes but never the actors' coordinates, and this
 * template's central claims — „the platoon crosses the mouth while you wait" and
 * „the authored crash is where the follower actually is" — are claims ABOUT those
 * coordinates. The twin is fed the recorder's own per-frame player pose through
 * onTick (the player's motion is authored and never reacts to traffic, so the
 * pose stream is ground truth, not a re-simulation), which makes the staged cars
 * here bit-identical to the ones the recording graded against.
 */
function replayWithActors(name: ScRbBusyGapTraceName): ActorFrame[] {
  const runtime = createWorldRuntime(district);
  const traffic = createTrafficSystem(district as TrafficDistrict, {
    seed: 7,
    vehicleCount: 0,
    pedestrianCount: 0,
  });
  const staged = [...(SC_RB_BUSY_GAP.staged ?? [])] as StagedEventSpec[];
  const director = createScenarioDirector(staged, traffic, { seed: 7, signals: runtime });
  const dt = 1 / 60;
  const frames: ActorFrame[] = [];
  recordScRbBusyGapDrive(district, name, {
    onTick: (tick) => {
      runtime.update(dt);
      traffic.update(dt, {
        signalPhase: (id) => runtime.signalPhase(id),
        playerPos: { x: tick.position.x, y: tick.position.y },
        playerSpeedKmh: tick.speedKmh,
        playerHeadingDeg: tick.headingDeg,
      });
      director.step({
        tSec: tick.t,
        dtSec: dt,
        x: tick.position.x,
        y: tick.position.y,
        speedKmh: tick.speedKmh,
        headingDeg: tick.headingDeg,
        brakePedal: 0,
        tickEvents: tick.events,
      });
      const a = traffic.staged("sc-rbg-lead");
      const b = traffic.staged("sc-rbg-follower");
      if (!a || !b) return;
      frames.push({
        tSec: tick.t,
        px: tick.position.x,
        py: tick.position.y,
        lead: { x: a.x, y: a.y, phi: phiDeg(a.x, a.y) },
        foll: { x: b.x, y: b.y, phi: phiDeg(b.x, b.y) },
      });
    },
  });
  return frames;
}

describe("sc-rb-busy-gap — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("EARNS the yielded commendation — the taught act, not just the absence of faults", () => {
    // The drill is „изчакай реална пролука". A drive that merely avoided a
    // conviction could have found an empty ring; this commendation only fires
    // when the runtime SAW a circulating conflict and the driver was at yield
    // speed for it (worldRuntime: rbConflictSeen && rbSlowed && !rbFired).
    expect(
      shadow.ruleEvents.some((e) => e.kind === "commendation" && e.code === "YIELDED_TO_PRIORITY"),
    ).toBe(true);
    // Both staged cars record a yielded outcome — neither was cut off.
    expect(shadow.outcomes.map((o) => `${o.eventId}:${o.detail}`).sort()).toEqual([
      "sc-rbg-follower:yielded",
      "sc-rbg-lead:yielded",
    ]);
  });

  it("really STOPS at the yield line and really waits ~10 s there", () => {
    // The drill's own gate demands ≤ 6 km/h at (4.06, −26); the shadow does the
    // honest thing and comes to rest. A rolling „yield" would be one 0.9 s
    // sustain away from a conviction with the platoon on the left.
    const atRest = shadow.trace.samples.filter(
      (s) => s.speedKmh < 0.5 && Math.abs(s.x - 4.06) < 0.5 && s.y > -28 && s.y < -27,
    );
    expect(atRest.length).toBeGreaterThan(150); // > 7.5 s of 20 Hz samples
    const waited = atRest[atRest.length - 1].tSec - atRest[0].tSec;
    expect(waited).toBeGreaterThan(9);
    expect(waited).toBeLessThan(12);
  });

  it("holds ONE ring line past the east mouth at station-keeping pace", () => {
    // The ring PROPER: between the entry chord's landing (φ = 55) and the exit
    // peel (φ = 150), joints given clearance so the blends are judged by their
    // own steps. The window spans the east mouth (φ = 90) — the spoke this drill
    // rides past.
    const onRing = shadow.trace.samples.filter((s) => {
      const p = phiDeg(s.x, s.y);
      return p >= 62 && p <= 145;
    });
    expect(onRing.length).toBeGreaterThan(20);
    for (const s of onRing) {
      // One line: inside the ring lane's centre band (POOR_LANE_KEEPING's
      // tolerance is |laneOffsetM| = 3.25 ⇒ radius 18 ± 3.25).
      expect(Math.abs(Math.hypot(s.x, s.y) - 18), `t=${s.tSec}`).toBeLessThan(3);
      // One pace: never stalled, never over the drill's own 20 km/h gate.
      expect(s.speedKmh, `t=${s.tSec}`).toBeLessThan(20);
      expect(s.speedKmh, `t=${s.tSec}`).toBeGreaterThan(4);
    }
  });

  it("signals RIGHT before the north exit, leaves by it, and cancels, with Bulgarian annotations", () => {
    const signalOn = shadow.trace.events.find((e) => e.kind === "signal-on");
    expect(signalOn).toBeDefined();
    expect(signalOn!.detail).toBe("right");
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(50); // north arm, well beyond the exit radius
    expect(Math.abs(last.x - 4.06)).toBeLessThan(1.5); // outbound north lane center
    expect(last.indicator).toBe("off"); // cancelled after the exit
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-rb-busy-gap — the platoon is real (the lesson's premise)", () => {
  const frames = replayWithActors("shadow-correct");

  it("the two cars hold a RIGID ~26° offset for the whole drill", () => {
    // The metronome clamp (minSync = maxSync = cruise) exists exactly for this:
    // the offset IS the content, so it must not rubber-band. Sampled from the
    // moment both are rolling (t > 8) to the end.
    const rolling = frames.filter((f) => f.tSec > 8);
    expect(rolling.length).toBeGreaterThan(1000);
    for (const f of rolling) {
      const gap = ((f.lead.phi - f.foll.phi) % 360 + 360) % 360;
      expect(gap, `t=${f.tSec}`).toBeGreaterThan(23);
      expect(gap, `t=${f.tSec}`).toBeLessThan(29);
    }
  });

  it("BOTH cars cross the player's mouth while the player stands at the line", () => {
    // „Пропусни ДВЕТЕ" — made checkable. The mouth is φ = 0/360; a car crosses it
    // when its φ wraps. Both wraps must happen while the driver is stopped.
    const crossed = (pick: (f: ActorFrame) => number) => {
      for (let i = 1; i < frames.length; i++) {
        if (pick(frames[i - 1]) > 300 && pick(frames[i]) < 60) return frames[i].tSec;
      }
      return null;
    };
    const leadAt = crossed((f) => f.lead.phi);
    const follAt = crossed((f) => f.foll.phi);
    expect(leadAt).not.toBeNull();
    expect(follAt).not.toBeNull();
    // The platoon's order, and its ~2.8 s spacing at the mouth.
    expect(follAt! - leadAt!).toBeGreaterThan(2.3);
    expect(follAt! - leadAt!).toBeLessThan(3.4);
    // The driver is still at rest on the line when the SECOND one goes by — so
    // the entry that follows really is the gap behind the platoon.
    const shadow = drives.get("shadow-correct")!;
    const at = shadow.trace.samples.reduce((b, s) =>
      Math.abs(s.tSec - follAt!) < Math.abs(b.tSec - follAt!) ? s : b,
    );
    expect(at.speedKmh).toBeLessThan(0.5);
    expect(at.y).toBeLessThan(-27);
  });

  it("the driver never gets within contact range of either car", () => {
    for (const f of frames) {
      expect(Math.hypot(f.lead.x - f.px, f.lead.y - f.py), `lead t=${f.tSec}`).toBeGreaterThan(3);
      expect(Math.hypot(f.foll.x - f.px, f.foll.y - f.py), `foll t=${f.tSec}`).toBeGreaterThan(3);
    }
  });
});

describe("sc-rb-busy-gap — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Нахлуване пред циркулиращата кола“: exactly FAILED_TO_YIELD", () => {
    const drive = drives.get("mistake-barge-lead")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_RB_BUSY_GAP.mistakes[0].codeRefs].sort());
    // ONE barge, one fault: the taught mistake is never double-counted.
    expect(violationCodes(drive).filter((c) => c === "FAILED_TO_YIELD")).toHaveLength(1);
    // The demo carries a right indicator, so the exit-signal fault (this
    // family's OTHER lesson) can never contaminate it.
    expect(codes).not.toContain("TURN_WITHOUT_INDICATOR");
    // It really never yields: no stop, no crawl anywhere on the approach.
    const approach = drive.trace.samples.filter((s) => s.y > -60 && s.y < -20);
    for (const s of approach) expect(s.speedKmh, `t=${s.tSec}`).toBeGreaterThan(8);
  });

  it("„Влизане в твърде къса пролука“: exactly FAILED_TO_YIELD + COLLISION", () => {
    const drive = drives.get("mistake-short-gap")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_RB_BUSY_GAP.mistakes[1].codeRefs].sort());
    // The priority fault lands BEFORE the crash it causes — that ordering is the
    // whole teach (the gap was already refused by physics 4 s before the bang),
    // and it is also why the crash has to be authored: both runners resolve on
    // the conviction, so the runner's own contact branch never runs.
    const yieldAt = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "FAILED_TO_YIELD")!;
    const hitAt = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "COLLISION")!;
    expect(yieldAt.t).toBeLessThan(hitAt.t);
    expect(hitAt.t - yieldAt.t).toBeGreaterThan(2);
    // This demo is NOT the barge: it stops at the line and lets the lead through
    // first. That is what makes it the harder mistake.
    expect(drive.trace.samples.some((s) => s.speedKmh < 0.5 && s.y > -28 && s.y < -27)).toBe(true);
  });

  it("the two demos are the two ends of ONE misjudgment, not one fault twice", () => {
    // The barge never yields at all; the short-gap demo yields once and stops
    // counting. Same rule (ЗДвП чл. 50, ал. 1), opposite failures — so their traces must
    // not be near-copies: the barge never comes to rest anywhere on the approach,
    // the short-gap one does. (Sampled past the spawn: every drive starts from
    // rest at y = −93.)
    const restingOnApproach = (d: RecordedDrive) =>
      d.trace.samples.some((s) => s.tSec > 2 && s.speedKmh < 0.5 && s.y < -20);
    expect(restingOnApproach(drives.get("mistake-barge-lead")!)).toBe(false);
    expect(restingOnApproach(drives.get("mistake-short-gap")!)).toBe(true);
  });
});

describe("sc-rb-busy-gap — the authored crash depicts real geometry (doc 76 §0 honesty)", () => {
  it("the follower is IN the driver's footprint at the authored contact clock", () => {
    const drive = drives.get("mistake-short-gap")!;
    const hitAt = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "COLLISION")!;
    const frames = replayWithActors("mistake-short-gap");
    const at = frames.reduce((b, f) => (Math.abs(f.tSec - hitAt.t) < Math.abs(b.tSec - hitAt.t) ? f : b));
    // Measured 0.12 m — the two cars are in the same square metre. The scripted
    // beat is a depiction of the production traffic system's own state, not a
    // narrative liberty; VEHICLE_CONTACT_M (the runner's own threshold, 3 m) is
    // the bar it clears more than twenty times over.
    const sep = Math.hypot(at.foll.x - at.px, at.foll.y - at.py);
    expect(sep).toBeLessThan(1);
    // …and it is the closest the two ever get: the crash is authored at the
    // apex of the geometry, not at a convenient clock.
    const minSep = Math.min(
      ...frames.filter((f) => f.tSec > 13).map((f) => Math.hypot(f.foll.x - f.px, f.foll.y - f.py)),
    );
    expect(sep - minSep).toBeLessThan(0.25);
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", "sc-rb-busy-gap");
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", "sc-rb-busy-gap");

  for (const name of NAMES) {
    it(`sc-rb-busy-gap/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
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
      expect(parsed!.meta.scenarioId).toBe("sc-rb-busy-gap");
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    for (const name of NAMES) {
      const again = recordScRbBusyGapDrive(district, name);
      expect(serializeScenarioTrace(again.trace), name).toBe(
        serializeScenarioTrace(drives.get(name)!.trace),
      );
    }
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_RB_BUSY_GAP.shadow, ...SC_RB_BUSY_GAP.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith("content/traces/sc-rb-busy-gap/")).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/sc-rb-busy-gap/${n}.trace.json`);
    expect([
      SC_RB_BUSY_GAP.shadow.path,
      ...SC_RB_BUSY_GAP.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
