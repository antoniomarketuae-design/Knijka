/**
 * Wind-truck-pass trace gate — „Страничен вятър след камиона"
 * (sc-ac-wind-truck-pass on mw-v1, the doc 72 AC-12 wind slice OVERTAKING beat),
 * doc 76 §5/§9 stages 3+5, on the world RESTAGED 2026-10-08
 * (sc-ac-wind-truck-pass:ff1d4290 — the truck holds its own 40 км/ч and is
 * really passed):
 *   1. SHADOW replays in DAY DRY with ZERO violations and earns CLEAN_DRIVING —
 *      a declared overtake (SAFE_LANE_CHANGE each way, the LEFT indicator held
 *      across the pass exempting keep-right) that REALLY passes the staged
 *      truck: the runner reports `drewLevel` then `overtaken`, and at the end
 *      the truck is behind the ghost.
 *   2. MISTAKE DEMOS grade their codes — NO new rule code: loose hands past the
 *      cab → EXACTLY POOR_LANE_KEEPING; the sharp correction in the lee →
 *      EXACTLY COLLISION, by a REAL contact with the truck's flank (the
 *      scripted `collision` seam is gone), made by a driver who has looked and
 *      signalled — so no lane-change code rides on it (round 2, F-04) — and
 *      whose wheel channel shows the correction the title names.
 *   3. EVERY CAPTION THAT NAMES THE TRUCK OR ITS LEE IS MEASURED against where
 *      the truck really is on the frame the caption is shown: the wind share at
 *      «Влизаме в завета…», the car's nose against the truck's at «Носът излезе
 *      пред кабината…», the road between the bumpers at «Целият камион е в
 *      огледалото…».
 *   4. COMMITTED FILES under content/traces/sc-ac-wind-truck-pass/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ac-wind-truck-pass-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG } from "../../rules";
import { compileScenario } from "../../lessons/scenario/compile";
import { liveChainReplay } from "../../lessons/scenario/__tests__/liveChainReplay";
import { SC_AC_WIND_TRUCK_PASS } from "../../lessons/scenario/templates-conditions2";
import { createLessonWindShelter } from "../../scene/lessonWindShelter";
import { CHASSIS_HALF_EXTENTS, WIND_SHELTER_RESIDUAL } from "../../vehicle";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScAcWindTruckPassDrive,
  scAcWindTruckPassMistakeClipTruckScript,
  type ScAcWindTruckPassTraceName,
} from "../scAcWindTruckPass";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const TRUCK_SCRIPT_SRC = readFileSync(path.join(HERE, "..", "scAcWindTruckPass.ts"), "utf-8");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ac-wind-truck-pass";
const TRUCK_ID = "sc-acw-truck";
const NAMES: ScAcWindTruckPassTraceName[] = ["shadow-correct", "mistake-blown-out", "mistake-clip-truck"];

/** Overtaking-lane (laneId 2) center of mw-v1 — the geometric center the lane
 *  detectors measure offsets from (meta.scenario.laneLeftX). */
const OVERTAKE_CENTER_X = -8.12;
/** The box rig, nose to centre, and the car's (traffic/types.ts, tuning.ts). */
const TRUCK_HALF_LEN = 3.75;
const TRUCK_HALF_WIDTH = 1.2;
const CAR_HALF_LEN = CHASSIS_HALF_EXTENTS.z;
const CAR_HALF_WIDTH = CHASSIS_HALF_EXTENTS.x;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}
/** Longest continuous stretch (s) the trace spends past `predicate`. */
function longestSustainSec(d: RecordedDrive, predicate: (x: number) => boolean): number {
  let best = 0;
  let startT: number | null = null;
  for (const s of d.trace.samples) {
    if (predicate(s.x)) {
      startT ??= s.tSec;
      best = Math.max(best, s.tSec - startT);
    } else {
      startT = null;
    }
  }
  return best;
}

const district = loadDistrict("mw-v1");
const drives = new Map<ScAcWindTruckPassTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScAcWindTruckPassDrive(district, n)]),
);

/**
 * WHERE THE TRUCK IS ON EVERY FRAME OF A RECORDED DRIVE — the staged actor of
 * the LIVE stack (`liveChainReplay`: the lesson's own director and traffic
 * system at L3), stepped along the recording's poses. `along` is the car's
 * centre ahead of the truck's, `left` the car's centre to the truck's left,
 * `share` the part of the open wind the live car would be under at that pose
 * (`scene/lessonWindShelter.ts`, the scene's own function).
 */
interface TruckFrame {
  t: number;
  along: number;
  left: number;
  share: number;
  truckKmh: number;
}
function truckTimeline(d: RecordedDrive): TruckFrame[] {
  const lesson = compileScenario(SC_AC_WIND_TRUCK_PASS, 3);
  const frames: TruckFrame[] = [];
  let shelterAt: ((x: number, y: number) => number) | null = null;
  liveChainReplay({
    lesson,
    districtRaw: district,
    trace: d.trace,
    afterApply: (ctx) => {
      const truck = ctx.traffic.staged(TRUCK_ID);
      if (!truck) return;
      shelterAt ??= createLessonWindShelter(lesson, (id) => ctx.traffic.staged(id));
      frames.push({
        t: ctx.t,
        along: ctx.tick.position.y - truck.y,
        left: truck.x - ctx.tick.position.x,
        share: shelterAt === null ? 1 : shelterAt(ctx.tick.position.x, ctx.tick.position.y),
        truckKmh: truck.speedMps * 3.6,
      });
    },
  });
  return frames;
}
function frameAt(frames: readonly TruckFrame[], tSec: number): TruckFrame {
  let best = frames[0]!;
  for (const f of frames) if (Math.abs(f.t - tSec) < Math.abs(best.t - tSec)) best = f;
  return best;
}
function captionTime(d: RecordedDrive, re: RegExp): number {
  const hit = d.trace.events.find((e) => e.kind === "annotation" && re.test(e.textBg ?? ""));
  if (hit === undefined) throw new Error(`no caption matches ${re}`);
  return hit.tSec;
}

describe("sc-ac-wind-truck-pass — geometry pins against the committed map", () => {
  it("lane, spawn and length constants match mw-v1", () => {
    const raw = district as {
      meta: { scenario: { laneCruiseX: number; laneLeftX: number; params: Record<string, number> } };
      spawnPoints: Array<{ id: string; x: number; y: number }>;
    };
    expect(raw.meta.scenario.laneCruiseX).toBe(0);
    expect(raw.meta.scenario.laneLeftX).toBe(OVERTAKE_CENTER_X);
    expect(raw.meta.scenario.params.lengthM).toBe(2600);
    expect(SC_AC_WIND_TRUCK_PASS.map.params).toEqual(raw.meta.scenario.params);
    const spawn = raw.spawnPoints.find((s) => s.id === "mw-spawn-approach")!;
    expect(spawn).toBeTruthy();
    expect(spawn.x).toBe(0);
    expect(spawn.y).toBe(15);
  });

  it("wind-story honesty: the authored drifts are pinned against the overtaking-lane band", () => {
    const band = DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM;
    expect(band).toBe(3.25);
    // Toward the median the overtaking-lane band ends at x = −11.375.
    const medianSideX = OVERTAKE_CENTER_X - band; // −11.37

    // Shadow: a VISIBLE drift toward the median past the cab (the ghost must
    // tell the wind story)…
    const shadowXs = drives.get("shadow-correct")!.trace.samples.map((s) => s.x);
    expect(Math.min(...shadowXs)).toBeLessThan(-8.5);
    // …that NEVER approaches the graded band (no violation by construction).
    expect(Math.min(...shadowXs)).toBeGreaterThan(medianSideX);

    // Mistake 1 rides the median side past the 3 s lane-keep sustain…
    const blown = drives.get("mistake-blown-out")!;
    expect(Math.min(...blown.trace.samples.map((s) => s.x))).toBeLessThan(medianSideX);
    expect(longestSustainSec(blown, (x) => x < medianSideX)).toBeGreaterThan(
      DEFAULT_RULE_CONFIG.laneKeepSustainSec,
    );
    // …but never off the carriageway (stays inside laneId 2 — basin left −12.19).
    expect(Math.min(...blown.trace.samples.map((s) => s.x))).toBeGreaterThan(-12.19);
  });
});

describe("sc-ac-wind-truck-pass — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;
  const frames = truckTimeline(shadow);

  it("replays in day dry with ZERO violations and earns CLEAN_DRIVING + SAFE_LANE_CHANGE", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
    expect(commendationCodes(shadow).filter((c) => c === "SAFE_LANE_CHANGE")).toHaveLength(2);
  });

  it("passes the whole drill in the prudent-wind band and never speeds", () => {
    const maxKmh = Math.max(...shadow.trace.samples.map((s) => Math.abs(s.speedKmh)));
    expect(maxKmh).toBeLessThanOrEqual(79); // motorway posted 140 — the drill rides 62–78
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });

  it("REALLY PASSES THE TRUCK: behind it, level with its cab in the overtaking lane, then the whole truck behind — and the runner says so", () => {
    // The truck holds its own speed, below the motorway floor, from the moment
    // it has pulled up to it.
    const cruising = frames.filter((f) => f.t > 8);
    for (const f of cruising) expect(f.truckKmh, `t=${f.t.toFixed(1)}`).toBeCloseTo(40, 0);
    // Wholly behind at the start; wholly ahead at the end.
    expect(frames[0]!.along).toBeLessThan(-70);
    const last = frames[frames.length - 1]!;
    expect(last.along - TRUCK_HALF_LEN - CAR_HALF_LEN, "road between the bumpers at the end").toBeGreaterThan(100);
    // Abeam the cab IN THE OVERTAKING LANE on the way.
    const abeam = frames.filter((f) => f.along >= 1.75 && f.along <= TRUCK_HALF_LEN + CAR_HALF_LEN);
    expect(abeam.length).toBeGreaterThan(10);
    for (const f of abeam) {
      expect(f.left, `t=${f.t.toFixed(1)}`).toBeGreaterThan(7.5);
      expect(f.left, `t=${f.t.toFixed(1)}`).toBeLessThan(8.7);
    }
    // Never nearer the truck's flank than three quarters of a lane.
    const beside = frames.filter((f) => Math.abs(f.along) <= TRUCK_HALF_LEN + CAR_HALF_LEN);
    for (const f of beside) expect(f.left - TRUCK_HALF_WIDTH - CAR_HALF_WIDTH).toBeGreaterThan(5.5);
    // The runner's two reports, in order, on the recorder's own stack.
    expect(shadow.outcomes.map((o) => o.detail)).toEqual(["drewLevel", "overtaken"]);
    expect(shadow.outcomes[0]!.approachSpeedKmh!).toBeGreaterThan(55);
    expect(shadow.outcomes[0]!.approachSpeedKmh!).toBeLessThan(70);
  });

  it("slows BEFORE the pass, as its second caption says: 74 км/ч on the approach, 62 beside the truck", () => {
    const t = captionTime(shadow, /^Намаляваме преди изпреварването/u);
    const at = (tSec: number) =>
      shadow.trace.samples.reduce((b, s) => (Math.abs(s.tSec - tSec) < Math.abs(b.tSec - tSec) ? s : b));
    expect(at(t).speedKmh).toBeGreaterThan(72);
    expect(at(t + 6).speedKmh).toBeLessThan(64);
    // …and the lane change it announces starts with three seconds of road to
    // the truck's tail (51 m at 62–74 км/ч).
    expect(-frameAt(frames, t).along - TRUCK_HALF_LEN - CAR_HALF_LEN).toBeGreaterThan(45);
  });

  it("«Влизаме в завета на камиона — вятърът отслабна»: on that frame the live car's wind is within a tenth of the full lee, in the truck's wake", () => {
    const f = frameAt(frames, captionTime(shadow, /^Влизаме в завета на камиона/u));
    expect(f.share).toBeLessThan(WIND_SHELTER_RESIDUAL + 0.1);
    expect(f.along).toBeLessThan(0);
    expect(f.left).toBeGreaterThan(7.5);
    // …and it stays in the lee until the cab caption: at least three seconds.
    const tCab = captionTime(shadow, /^Носът излезе пред кабината/u);
    expect(tCab - f.t).toBeGreaterThan(3);
    const between = frames.filter((x) => x.t > f.t + 0.5 && x.t < tCab - 0.6);
    for (const x of between) expect(x.share, `t=${x.t.toFixed(1)}`).toBeCloseTo(WIND_SHELTER_RESIDUAL, 5);
  });

  it("«Носът излезе пред кабината — заветът свърши»: the car's nose is ahead of the truck's, the wind share is climbing, and it is whole within half a second", () => {
    const t = captionTime(shadow, /^Носът излезе пред кабината/u);
    const f = frameAt(frames, t);
    expect(f.along + CAR_HALF_LEN, "car nose vs truck nose").toBeGreaterThan(TRUCK_HALF_LEN);
    expect(f.along + CAR_HALF_LEN - TRUCK_HALF_LEN).toBeLessThan(4.1); // …by less than a car length
    expect(f.share).toBeGreaterThan(WIND_SHELTER_RESIDUAL);
    expect(frameAt(frames, t + 0.5).share).toBe(1);
    // The drift the caption narrates («вятърът ни бута наляво») is in the
    // polyline right after it: 0.6–1 m toward the median, then back.
    const after = shadow.trace.samples.filter((s) => s.tSec > t && s.tSec < t + 3.5);
    const maxLeft = OVERTAKE_CENTER_X - Math.min(...after.map((s) => s.x));
    expect(maxLeft).toBeGreaterThan(0.6);
    expect(maxLeft).toBeLessThan(1);
  });

  it("«Целият камион е в огледалото»: more than the truck's own reach (10.25 m) of road between the car's tail and the truck's nose, and the return starts THERE, signalled", () => {
    const t = captionTime(shadow, /^Целият камион е в огледалото/u);
    const f = frameAt(frames, t);
    // (17.8 m on the committed recording. 10.25 is the lesson's clear gap —
    // just outside the 10.23 m at which the truck's own guard would brake for
    // a car in its lane — so the shadow's return is one the truck never
    // answers: it holds 40 км/ч on every frame after it.)
    expect(f.along - TRUCK_HALF_LEN - CAR_HALF_LEN).toBeGreaterThan(10.25);
    for (const x of frames.filter((q) => q.t > t)) expect(x.truckKmh, `t=${x.t.toFixed(1)}`).toBeCloseTo(40, 3);
    expect(f.left, "still in the overtaking lane on that frame").toBeGreaterThan(7.5);
    const signal = shadow.trace.events.filter((e) => e.kind === "signal-on").map((e) => e.tSec);
    expect(signal.some((s) => Math.abs(s - t) < 0.2)).toBe(true);
    const glance = shadow.trace.events.find((e) => e.kind === "glance-right");
    expect(Math.abs(glance!.tSec - t)).toBeLessThan(0.2);
  });

  it("«Готово: изпреварихме камиона…»: on the last frame the truck is behind, in the lane the ghost is back in", () => {
    const tEnd = captionTime(shadow, /^Готово: изпреварихме камиона/u);
    const f = frameAt(frames, tEnd);
    expect(f.along).toBeGreaterThan(100);
    expect(Math.abs(f.left)).toBeLessThan(0.5);
  });
});

describe("sc-ac-wind-truck-pass — mistake demos grade their codes (doc 76 §9 stage 5)", () => {
  it("the first demo cites exactly what it grades; the template cites no lane-change code", () => {
    expect(SC_AC_WIND_TRUCK_PASS.mistakes.map((m) => m.codeRefs)).toEqual([["POOR_LANE_KEEPING"], ["COLLISION"]]);
  });

  it("„Изненадан от порива“: exactly POOR_LANE_KEEPING — carried to the median from the frame it clears the cab", () => {
    const drive = drives.get("mistake-blown-out")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_AC_WIND_TRUCK_PASS.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("CENTER_LINE_TOUCHED"); // ONEWAY — structurally unreachable
    expect(codes).not.toContain("NOT_KEEPING_RIGHT"); // LEFT indicator held across the pass
    expect(codes).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS"); // DRY arms no envelope
    // Its caption «Пред кабината заветът свършва, вятърът се връща…» is shown
    // on a frame the car is just past the cab and the wind is nearly whole…
    const frames = truckTimeline(drive);
    const t = captionTime(drive, /^Пред кабината заветът свършва/u);
    const f = frameAt(frames, t);
    expect(f.along + CAR_HALF_LEN).toBeGreaterThan(TRUCK_HALF_LEN);
    expect(f.along).toBeLessThan(TRUCK_HALF_LEN + CAR_HALF_LEN + 1);
    expect(f.share).toBeGreaterThan(0.85);
    // …and the drift starts there, not before: in the lee the line is straight.
    const before = drive.trace.samples.filter((s) => s.tSec > t - 2 && s.tSec <= t);
    for (const s of before) expect(Math.abs(s.x - OVERTAKE_CENTER_X)).toBeLessThan(0.1);
    const after = drive.trace.samples.filter((s) => s.tSec > t + 2.5 && s.tSec < t + 6);
    for (const s of after) expect(s.x).toBeLessThan(-11.3);
  });

  it("„Рязка корекция в тясната пролука“: EXACTLY COLLISION — a REAL contact with the truck's flank beside the cab, by a driver who has looked and signalled; no other code, and the swerve is not praised", () => {
    const drive = drives.get("mistake-clip-truck")!;
    const mistake = SC_AC_WIND_TRUCK_PASS.mistakes[1];
    // The card cites the act, and the recording grades it exactly once — and
    // (round 2, the round-1 verifier's F-04) NOTHING ELSE. In round 1 the same
    // swerve also graded LANE_CHANGE_WITHOUT_INDICATOR and
    // LANE_CHANGE_WITHOUT_MIRROR_CHECK, and through the live chain the
    // universal first-fault grace was spent on the first of them, a code the
    // card never mentions (score 13 at four rungs of five).
    expect(mistake.codeRefs).toEqual(["COLLISION"]);
    expect(mistake.incidentalCodeRefs).toBeUndefined();
    expect(violationCodes(drive)).toEqual(["COLLISION"]);
    // The recorder grades through the lesson's own rule config — the forced-
    // braking rule is armed — and the truck is NOT reported as having braked
    // for this car: the bodies meet before its guard has anything to answer.
    expect(TRUCK_SCRIPT_SRC).toContain("{ ruleConfig: SC_AC_WIND_TRUCK_PASS.ruleConfig }");
    expect(SC_AC_WIND_TRUCK_PASS.ruleConfig?.laneEntryForcedBrakingEnabled).toBe(true);
    // The pull-out is praised; THE SWERVE IS NOT — a signalled, looked-for lane
    // change that ends against the truck's side is not «навреме. Отлично.».
    expect(commendationCodes(drive).filter((c) => c === "SAFE_LANE_CHANGE")).toHaveLength(1);
    const praisedAt = drive.ruleEvents.find((e) => e.kind === "commendation" && e.code === "SAFE_LANE_CHANGE")!.t;
    const tHit = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "COLLISION")!.t;
    expect(tHit - praisedAt, "the one praised lane change is the pull-out, seconds earlier").toBeGreaterThan(4);
    // No scripted collision is left in the script: the crash is the director's.
    expect(scAcWindTruckPassMistakeClipTruckScript().steps.filter((step) => step.kind === "collision")).toEqual([]);

    // HE LOOKED AND SIGNALLED before the wheel went over: right indicator and
    // right mirror on the frame of the second caption, the swerve after it.
    const tLee = captionTime(drive, /^В завета на камиона вятърът отслабва/u);
    const rightOn = drive.trace.events.filter((e) => e.kind === "signal-on" && Math.abs(e.tSec - tLee) < 0.1);
    expect(rightOn).toHaveLength(1);
    const glance = drive.trace.events.filter((e) => e.kind === "glance-right");
    expect(glance).toHaveLength(1);
    expect(Math.abs(glance[0]!.tSec - tLee)).toBeLessThan(0.1);
    const sampleAt = (tSec: number) =>
      drive.trace.samples.reduce((b, x) => (Math.abs(x.tSec - tSec) < Math.abs(b.tSec - tSec) ? x : b));
    expect(sampleAt(tLee + 0.3).indicator).toBe("right");
    expect(sampleAt(tLee - 0.3).indicator).toBe("left");

    // THE CONTACT IS GEOMETRY: on the frame of the bill the two bodies overlap
    // — the car's front-right corner inside the truck's flank, alongside it.
    const frames = truckTimeline(drive);
    const f = frameAt(frames, tHit);
    const hit = sampleAt(tHit);
    expect(Math.abs(f.along), "alongside the truck").toBeLessThan(TRUCK_HALF_LEN + CAR_HALF_LEN);
    const yaw = (hit.headingDeg * Math.PI) / 180;
    expect(hit.headingDeg, "yawed toward the truck").toBeGreaterThan(7);
    expect(hit.headingDeg).toBeLessThan(10);
    const cornerReachM = CAR_HALF_WIDTH * Math.cos(yaw) + CAR_HALF_LEN * Math.sin(yaw);
    expect(f.left - cornerReachM, "the car's corner is inside the truck's flank").toBeLessThan(TRUCK_HALF_WIDTH + 0.05);
    expect(f.left - cornerReachM).toBeGreaterThan(TRUCK_HALF_WIDTH - 0.5);
    // «…удар до кабината»: the car's nose is beside the cab (the front two
    // metres of the rig), and its centre has not yet passed the truck's — so
    // the truck's own guard, which looks ahead of its centre, had nothing to
    // brake for before the blow: its account of speed shed for him is under
    // the braking line on that frame, and it is still doing 40.
    expect(f.along + CAR_HALF_LEN, "the car's nose is at the cab").toBeGreaterThan(1.75);
    expect(f.along + CAR_HALF_LEN).toBeLessThan(TRUCK_HALF_LEN);
    expect(f.along, "the car's centre against the truck's").toBeLessThan(0.3);
    expect(f.truckKmh).toBeGreaterThan(39);
    expect(drive.ruleEvents.filter((e) => e.code === "LANE_ENTRY_FORCED_BRAKING")).toEqual([]);

    // THE PASS WAS MADE IN A NARROW GAP: three metres of air, not six — and the
    // second caption is shown where the live car's wind has begun to fall.
    const lee = frameAt(frames, tLee);
    // «В завета на камиона вятърът отслабва»: on the caption's frame the car's
    // nose is in the wake and the wind is already falling; half a second later
    // it is under half; before the blow it is at the lee's floor.
    expect(lee.share).toBeLessThan(0.8);
    expect(frameAt(frames, tLee + 0.5).share).toBeLessThan(0.5);
    expect(Math.min(...frames.filter((q) => q.t > tLee && q.t < tHit).map((q) => q.share))).toBeCloseTo(WIND_SHELTER_RESIDUAL, 6);
    expect(lee.left - TRUCK_HALF_WIDTH - CAR_HALF_WIDTH).toBeGreaterThan(2.5);
    expect(lee.left - TRUCK_HALF_WIDTH - CAR_HALF_WIDTH).toBeLessThan(3.2);
    expect(lee.along, "behind the truck's tail, in its wake").toBeLessThan(-TRUCK_HALF_LEN - CAR_HALF_LEN);
    // At road speed, all the way in: the recorder did not slow for the arc.
    for (const x of drive.trace.samples.filter((q) => q.tSec > tLee - 2 && q.tSec < tHit)) {
      expect(x.speedKmh, `t=${x.tSec.toFixed(2)}`).toBeGreaterThan(79);
    }
    // It never drew level IN THE OVERTAKING LANE, so the runner reports nothing.
    expect(drive.outcomes).toEqual([]);
  });

  it("„Рязка корекция…“ IS ON THE WHEEL: the channel holds the wind's correction on the straight, then goes over to the right — twice as far — as the wind falls, and stays there to the blow", () => {
    // Round 1 (F-04): this channel was 0 on all 384 samples and the path was a
    // straight diagonal — one 4° kink, turned in a single frame.
    const drive = drives.get("mistake-clip-truck")!;
    const s = drive.trace.samples;
    expect(s.filter((x) => x.steerRad !== 0).length, "samples with the wheel off centre").toBeGreaterThan(300);
    const tLee = captionTime(drive, /^В завета на камиона вятърът отслабва/u);
    const tHit = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "COLLISION")!.t;
    const mrad = (from: number, to: number) => s.filter((x) => x.tSec >= from && x.tSec <= to).map((x) => x.steerRad * 1000);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    // THE HELD CORRECTION, on the straight before the swerve (the car is at
    // 80 км/ч in the open wind, a narrow gap from the truck's lane): to the
    // right (negative), steady, 5–7 mrad.
    const held = mrad(tLee - 1.3, tLee - 0.5);
    expect(mean(held)).toBeLessThan(-5);
    expect(mean(held)).toBeGreaterThan(-7);
    expect(Math.max(...held) - Math.min(...held), "steady").toBeLessThan(1);
    // THE CORRECTION: within the second after the caption the wheel is at
    // least 1.8× further right than it was held — while the wind it is
    // „against" has fallen to under half (the lee) — and it does not come back
    // before the blow.
    const over = mrad(tLee + 0.3, tHit - 0.7);
    const peak = Math.min(...mrad(tLee, tHit));
    expect(peak).toBeLessThan(-10);
    expect(peak / mean(held)).toBeGreaterThan(1.8);
    for (const v of over) expect(v).toBeLessThan(mean(held) - 1);
    // The path under it is an ARC, not a kink: the heading turns toward the
    // truck steadily, a tenth of a radian a second, from the caption to the hit.
    const h0 = s.reduce((b, x) => (Math.abs(x.tSec - tLee) < Math.abs(b.tSec - tLee) ? x : b));
    const h1 = s.reduce((b, x) => (Math.abs(x.tSec - (tHit - 0.1)) < Math.abs(b.tSec - (tHit - 0.1)) ? x : b));
    const turnedDeg = h1.headingDeg - h0.headingDeg;
    expect(turnedDeg).toBeGreaterThan(7);
    expect(turnedDeg).toBeLessThan(9.5);
    const rateRad = ((turnedDeg * Math.PI) / 180) / (h1.tSec - h0.tSec);
    expect(rateRad).toBeGreaterThan(0.09);
    expect(rateRad).toBeLessThan(0.11);
    let biggestStepDeg = 0;
    const arc = s.filter((x) => x.tSec >= tLee && x.tSec <= tHit - 0.1);
    for (let i = 1; i < arc.length; i++) biggestStepDeg = Math.max(biggestStepDeg, arc[i]!.headingDeg - arc[i - 1]!.headingDeg);
    expect(biggestStepDeg, "no kink: the largest heading step between two samples").toBeLessThan(0.6);
    // THE OTHER MISTAKE DEMO DOES NOT OPT IN — a loose hand is its story.
    expect(TRUCK_SCRIPT_SRC).toContain('kind === "shadow" || name === "mistake-clip-truck"');
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
    const again = recordScAcWindTruckPassDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_AC_WIND_TRUCK_PASS.shadow, ...SC_AC_WIND_TRUCK_PASS.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_AC_WIND_TRUCK_PASS.shadow.path, ...SC_AC_WIND_TRUCK_PASS.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
