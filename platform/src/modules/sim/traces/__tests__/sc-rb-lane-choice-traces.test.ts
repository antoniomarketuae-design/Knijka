/**
 * Trace gate — „Коя лента в двулентово кръгово“ (sc-rb-lane-choice on the NEW
 * rb-2lane-v1 district), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays through the production stack with ZERO violations and
 *      EARNS both commendations the drill is about: YIELDED_TO_PRIORITY (the
 *      entry) and SAFE_LANE_CHANGE (the announced inner→outer move before the
 *      exit).
 *   2. THE LANES ARE REAL — the shadow holds the INNER lane (r = 21.94) past
 *      both foreign mouths under a LEFT indicator, and the staged car holds the
 *      OUTER one (r = 30.06). The whole lesson rests on those two radii being
 *      what the locator and the lane graph actually produce, so they are
 *      asserted against the live systems, not assumed.
 *   3. MISTAKE DEMOS grade EXACTLY their template codeRefs — the outer-lane
 *      drag grades only POOR_LANE_KEEPING, and the cut-out grades the full
 *      чл. 25 cascade and nothing else.
 *   4. THE CRASH IS THE ENGINE'S, NOT A SCRIPT'S — mistake 2 authors no
 *      `collision` beat; the RoundaboutEntryRunner's own contact branch fires.
 *      This gate proves independently that the two cars really are in the same
 *      place at that clock.
 *   5. COMMITTED FILES ARE the recordings, byte-for-byte, with public copies.
 *
 * Geometry the drills depend on is asserted against the generated district in
 * world/__tests__/rb-2lane-district.test.ts.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-rb-lane-choice-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { actorObb, obbSeparationM, playerObb } from "../../collision";
import type { StagedEventSpec } from "../../contracts";
import { SC_RB_LANE_CHOICE } from "../../lessons/scenario/templates-roundabout";
import { createScenarioDirector } from "../../orchestrator";
import { createWorldRuntime } from "../../runtime";
import { createTrafficSystem } from "../../traffic/system";
import type { TrafficDistrict } from "../../traffic/types";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScRbLaneChoiceDrive, type ScRbLaneChoiceTraceName } from "../scRbLaneChoice";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const NAMES: ScRbLaneChoiceTraceName[] = [
  "shadow-correct",
  "mistake-outer-lane-far-exit",
  "mistake-exit-across-outer",
];

/** Ring lane centre radii — rb-2lane-v1 meta.scenario.ringLaneRadiiM. */
const LANE_OUTER_R = 30.06;
const LANE_INNER_R = 21.94;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
/** Circulation angle of a district point, degrees CCW from the SOUTH node
 *  (φ 90 = east, 180 = north, 270 = west) — the trace script's own convention. */
function phiDeg(x: number, y: number): number {
  const d = (Math.atan2(x, -y) * 180) / Math.PI;
  return d < 0 ? d + 360 : d;
}

const district = loadDistrict("rb-2lane-v1");
const drives = new Map<ScRbLaneChoiceTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScRbLaneChoiceDrive(district, n)]),
);

// ---------------------------------------------------------------------------
// The staged-actor twin — the ONE thing recordScriptedDrive cannot hand back
// ---------------------------------------------------------------------------

interface ActorFrame {
  tSec: number;
  px: number;
  py: number;
  car: { x: number; y: number; r: number; phi: number };
  /** Centre-to-centre distance, m (the historical, isotropic measure). */
  sep: number;
  /** SIGNED BODY separation, m — < 0 = the two footprints overlap. */
  bodySep: number;
}

/**
 * Replay one authored drive with a PARALLEL production stack (same modules,
 * same seed, same specs) so the staged car's pose is observable. RecordedDrive
 * exposes rule events and outcomes but never the actor's coordinates, and this
 * template's central claims — „the car holds the OUTER lane" and „the crash is
 * where the car actually is" — are claims ABOUT those coordinates. The twin is
 * fed the recorder's own per-frame player pose through onTick (the player's
 * motion is authored and never reacts to traffic, so the pose stream is ground
 * truth, not a re-simulation), which makes the staged car here bit-identical to
 * the one the recording graded against. (The sc-rb-busy-gap pattern.)
 */
function replayWithActor(name: ScRbLaneChoiceTraceName): ActorFrame[] {
  const runtime = createWorldRuntime(district);
  const traffic = createTrafficSystem(district as TrafficDistrict, {
    seed: 7,
    vehicleCount: 0,
    pedestrianCount: 0,
  });
  const staged = [...(SC_RB_LANE_CHOICE.staged ?? [])] as StagedEventSpec[];
  const director = createScenarioDirector(staged, traffic, { seed: 7, signals: runtime });
  const dt = 1 / 60;
  const frames: ActorFrame[] = [];
  recordScRbLaneChoiceDrive(district, name, {
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
      const a = traffic.staged("sc-rb2-circulating");
      if (!a) return;
      frames.push({
        tSec: tick.t,
        px: tick.position.x,
        py: tick.position.y,
        car: { x: a.x, y: a.y, r: Math.hypot(a.x, a.y), phi: phiDeg(a.x, a.y) },
        sep: Math.hypot(a.x - tick.position.x, a.y - tick.position.y),
        bodySep: obbSeparationM(
          playerObb(tick.position.x, tick.position.y, tick.headingDeg),
          actorObb(a),
        ),
      });
    },
  });
  return frames;
}

describe("sc-rb-lane-choice — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("EARNS both taught acts: the entry yield AND the announced lane change", () => {
    const codes = shadow.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
    // The drill is „избери лентата и я дръж" — but it opens on a roundabout, so
    // the entry still has to be given away properly. This commendation only
    // fires when the runtime SAW a circulating conflict and the driver was at
    // yield speed for it (worldRuntime: rbConflictSeen && rbSlowed && !rbFired).
    expect(codes).toContain("YIELDED_TO_PRIORITY");
    // …and THIS is the drill's own signature: leaving the inner lane is a lane
    // change, and an announced + mirrored one is commended rather than billed.
    // It is the exact act mistake 2 omits.
    expect(codes).toContain("SAFE_LANE_CHANGE");
    expect(shadow.outcomes.map((o) => `${o.eventId}:${o.detail}`)).toEqual(["sc-rb2-circulating:yielded"]);
  });

  it("really STOPS at the yield line and really waits ~15 s there", () => {
    const atRest = shadow.trace.samples.filter(
      (s) => s.speedKmh < 0.5 && Math.abs(s.x - 4.06) < 0.5 && s.y > -36.5 && s.y < -35,
    );
    expect(atRest.length).toBeGreaterThan(250); // > 12.5 s of 20 Hz samples
    const waited = atRest[atRest.length - 1].tSec - atRest[0].tSec;
    expect(waited).toBeGreaterThan(14);
    expect(waited).toBeLessThan(17);
  });

  it("holds the INNER lane past BOTH foreign mouths, under a LEFT indicator", () => {
    // THE LESSON, as an assertion. The ring proper between the entry chord's
    // landing (φ = 45) and the exit-announcement point (φ = 180) spans the east
    // mouth (φ = 90) — the first exit, which is not ours.
    const onRing = shadow.trace.samples.filter((s) => {
      const p = phiDeg(s.x, s.y);
      return p >= 45 && p <= 178 && Math.hypot(s.x, s.y) < 40;
    });
    expect(onRing.length).toBeGreaterThan(20);
    for (const s of onRing) {
      // The INNER lane's centre band: POOR_LANE_KEEPING's tolerance is
      // |laneOffsetM| = 3.25, so r = 21.94 ± 3.25 is the innocent band. The
      // shadow rides its middle.
      expect(Math.abs(Math.hypot(s.x, s.y) - LANE_INNER_R), `t=${s.tSec}`).toBeLessThan(2);
      // The left indicator is what makes that lane legal (чл. 25) AND innocent
      // (NOT_KEEPING_RIGHT's only exemption). Never off on the foreign mouths.
      expect(s.indicator, `t=${s.tSec}`).toBe("left");
      expect(s.speedKmh, `t=${s.tSec}`).toBeLessThan(20); // the drill's own gate
      expect(s.speedKmh, `t=${s.tSec}`).toBeGreaterThan(4);
    }
  });

  it("switches to RIGHT only after the second spoke, exits by the third, and cancels", () => {
    const signals = shadow.trace.events.filter((e) => e.kind === "signal-on");
    expect(signals.map((e) => e.detail)).toEqual(["left", "right"]); // in that order
    // The right indicator comes ON only after the north mouth (φ = 180) — the
    // last approach before ours. Announced earlier it would tell the drivers
    // waiting at north that we are leaving there.
    const rightAt = signals[1].tSec;
    const atFlip = shadow.trace.samples.reduce((b, s) =>
      Math.abs(s.tSec - rightAt) < Math.abs(b.tSec - rightAt) ? s : b,
    );
    expect(phiDeg(atFlip.x, atFlip.y)).toBeGreaterThan(175);
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.x).toBeLessThan(-60); // out on the west arm, beyond the exit radius
    expect(Math.abs(last.y - 12.19)).toBeLessThan(1.5); // the west arm's curb lane
    expect(last.indicator).toBe("off"); // cancelled after the exit
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });

  it("the staged car really rides the OUTER lane — the lane the lesson is about", () => {
    const frames = replayWithActor("shadow-correct");
    const rolling = frames.filter((f) => f.tSec > 10);
    expect(rolling.length).toBeGreaterThan(1000);
    for (const f of rolling) {
      // extraRightOffsetM is left at the graph's default, which on a `lanes: 2`
      // oneway ring IS the outer lane. If a future edit changes the lane model
      // this is the assertion that catches it.
      expect(f.car.r, `t=${f.tSec}`).toBeGreaterThan(LANE_OUTER_R - 1.5);
      expect(f.car.r, `t=${f.tSec}`).toBeLessThan(LANE_OUTER_R + 1.5);
    }
    // …and the driver never gets near it: the inner lane's 8.13 m of radial
    // separation is exactly what makes passing it on the inside lawful.
    for (const f of frames) expect(f.sep, `t=${f.tSec}`).toBeGreaterThan(3);
  });
});

describe("sc-rb-lane-choice — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Обикаляне по външната до далечния изход“: exactly POOR_LANE_KEEPING", () => {
    const drive = drives.get("mistake-outer-lane-far-exit")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_RB_LANE_CHOICE.mistakes[0].codeRefs].sort());
    // ONE wrong line, one fault: the taught mistake is never double-counted.
    expect(violationCodes(drive).filter((c) => c === "POOR_LANE_KEEPING")).toHaveLength(1);
    // The demo's entry and exit are both CLEAN — it yields at the line and
    // announces the exit — so nothing can contaminate the one taught fault.
    expect(drive.ruleEvents.some((e) => e.kind === "commendation" && e.code === "YIELDED_TO_PRIORITY")).toBe(true);
    expect(codes).not.toContain("TURN_WITHOUT_INDICATOR");
    // It really took the CURB approach lane — the arrows' near-exit lane.
    const approach = drive.trace.samples.filter((s) => s.y > -80 && s.y < -50);
    expect(approach.length).toBeGreaterThan(10);
    for (const s of approach) expect(Math.abs(s.x - 12.19), `t=${s.tSec}`).toBeLessThan(1.5);
  });

  it("„Изход направо през външната кола“: exactly the чл. 25 cascade", () => {
    const drive = drives.get("mistake-exit-across-outer")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_RB_LANE_CHOICE.mistakes[1].codeRefs].sort());
    // The ORDERING is the teach: the duties are broken BEFORE the crash they
    // cause. Give-way first, then the unchecked/unannounced move, then contact.
    const at = (code: string) => drive.ruleEvents.find((e) => e.kind === "violation" && e.code === code)!.t;
    expect(at("FAILED_TO_YIELD")).toBeLessThan(at("COLLISION"));
    expect(at("LANE_CHANGE_WITHOUT_MIRROR_CHECK")).toBeLessThan(at("COLLISION"));
    // This demo is NOT mistake 1: it takes the RIGHT lane on the approach and
    // holds the inner ring lane. Its fault is only how it leaves.
    const approach = drive.trace.samples.filter((s) => s.y > -80 && s.y < -50);
    for (const s of approach) expect(Math.abs(s.x - 4.06), `t=${s.tSec}`).toBeLessThan(1.5);
    // The left indicator is still on at the exit — that IS the missing
    // announcement the turn detector bills.
    const last = drive.trace.samples[drive.trace.samples.length - 1];
    expect(last.indicator).toBe("left");
  });

  it("the two demos are the two ends of ONE misjudgment, not one fault twice", () => {
    // Mistake 1 never reaches the inner lane; mistake 2 never leaves it. Same
    // rule (чл. 15 + чл. 25), opposite failures — so their traces must not be
    // near-copies.
    const innerRing = (d: RecordedDrive) =>
      d.trace.samples.some((s) => {
        const p = phiDeg(s.x, s.y);
        return p > 60 && p < 170 && Math.abs(Math.hypot(s.x, s.y) - LANE_INNER_R) < 2;
      });
    expect(innerRing(drives.get("mistake-outer-lane-far-exit")!)).toBe(false);
    expect(innerRing(drives.get("mistake-exit-across-outer")!)).toBe(true);
  });
});

describe("sc-rb-lane-choice — the crash is the engine's own (doc 76 §0 honesty)", () => {
  it("the staged car is IN the driver's footprint at the COLLISION clock", () => {
    const drive = drives.get("mistake-exit-across-outer")!;
    const hitAt = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "COLLISION")!;
    const frames = replayWithActor("mistake-exit-across-outer");
    const at = frames.reduce((b, f) => (Math.abs(f.tSec - hitAt.t) < Math.abs(b.tSec - hitAt.t) ? f : b));
    // The script authors NO `collision` beat — the RoundaboutEntryRunner's own
    // contact branch fires on real geometry. THE ASSERTION NOW MEASURES BODIES
    // (2026-08-10): it used to read `sep < 3`, i.e. centre-to-centre against
    // the retired VEHICLE_CONTACT_M circle, and the exact test fires EARLIER on
    // an angled approach than that circle ever did — at this clock the centres
    // are 3.06 m apart and the two footprints are already interpenetrating,
    // which is precisely the case a circle cannot express.
    expect(at.bodySep).toBeLessThanOrEqual(0);
    const minSep = Math.min(...frames.filter((f) => f.tSec > 40).map((f) => f.sep));
    expect(minSep).toBeLessThan(2.5);
    // …and it keeps getting worse after the bill: this is a crash, not a graze.
    const minBody = Math.min(...frames.filter((f) => f.tSec > 40).map((f) => f.bodySep));
    expect(minBody).toBeLessThan(-0.5);
    // …and the car is where the lesson says it is: the OUTER lane, at the mouth
    // the driver is cutting across.
    expect(at.car.r).toBeGreaterThan(LANE_OUTER_R - 1.5);
    expect(at.car.phi).toBeGreaterThan(240);
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", "sc-rb-lane-choice");
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", "sc-rb-lane-choice");

  for (const name of NAMES) {
    it(`sc-rb-lane-choice/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
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
      expect(parsed!.meta.scenarioId).toBe("sc-rb-lane-choice");
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    for (const name of NAMES) {
      const again = recordScRbLaneChoiceDrive(district, name);
      expect(serializeScenarioTrace(again.trace), name).toBe(
        serializeScenarioTrace(drives.get(name)!.trace),
      );
    }
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_RB_LANE_CHOICE.shadow, ...SC_RB_LANE_CHOICE.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith("content/traces/sc-rb-lane-choice/")).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/sc-rb-lane-choice/${n}.trace.json`);
    expect([
      SC_RB_LANE_CHOICE.shadow.path,
      ...SC_RB_LANE_CHOICE.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
