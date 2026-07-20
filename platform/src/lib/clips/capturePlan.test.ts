/**
 * capturePlan — the pure math behind CaptureScene v2 (doc 66):
 * window anchoring on the ENGINE fault time + the hop guard (R3/R5),
 * the five R0 keyframes, the two-keyframe control camera (R2 — continuous,
 * oriented until the pass, settled after), the honest cabin channels (R4),
 * the dash-strip model and the R1 actor-checklist matcher.
 */
import { describe, expect, it } from "vitest";
import { COCKPIT_EYE, COCKPIT_PITCH_BASE } from "@/modules/sim/vehicle";
import {
  actorSpawned,
  blinkOnAt,
  buildActorChecklist,
  cabinChannelsFor,
  CAM_BACK_M,
  CAM_UP_M,
  captureWindowFor,
  checklistSummary,
  CONTROL_BLEND_OUT_S,
  CONTROL_EXTRA_BACK_M,
  CONTROL_LEAD_S,
  controlPassTimeSec,
  controlWeightAt,
  createActorPresenceLog,
  createCaptureDashModel,
  createChaseCamPose,
  createCockpitCamPose,
  dashModelFor,
  dashModelHash,
  gearLabelFor,
  GHOST_CHASSIS_REST_Y,
  keyframesDueThrough,
  keyframeTimes,
  plannedChasePose,
  plannedCockpitPose,
  WINDOW_END_GUARD_S,
} from "./capturePlan";
import { CLIP_MIN_S } from "./trim";

describe("captureWindowFor", () => {
  it("anchors on the engine fault time — [fault−8, fault+4]", () => {
    const w = captureWindowFor(60, 30, false);
    expect(w.startSec).toBe(22);
    expect(w.endSec).toBe(34);
  });

  it("adds the control lead-in only when a positioned control exists", () => {
    const plain = captureWindowFor(60, 30, false);
    const withControl = captureWindowFor(60, 30, true);
    expect(withControl.startSec).toBe(plain.startSec - CONTROL_LEAD_S);
    expect(withControl.endSec).toBe(plain.endSec);
  });

  it("never touches the trace end (the loop-wrap hop guard, v1 №6)", () => {
    const w = captureWindowFor(40, 39, false);
    expect(w.endSec).toBeLessThanOrEqual(40 - WINDOW_END_GUARD_S);
    expect(w.endSec - w.startSec).toBeGreaterThanOrEqual(CLIP_MIN_S - 1);
  });

  it("clamps the lead-in at t=0", () => {
    const w = captureWindowFor(60, 4, true);
    expect(w.startSec).toBe(0);
  });
});

describe("keyframeTimes", () => {
  it("emits exactly the five R0 stills, clamped and non-decreasing", () => {
    const times = keyframeTimes({ startSec: 22, endSec: 34 }, 30);
    expect(times).toEqual([22, 28, 30, 32, 34]);
  });

  it("clamps fault±2 into the window and keeps 5 entries", () => {
    const times = keyframeTimes({ startSec: 0, endSec: 3 }, 2.5);
    expect(times).toHaveLength(5);
    expect(times[0]).toBe(0);
    expect(times[4]).toBe(3);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
    }
  });
});

describe("controlPassTimeSec", () => {
  // Northbound drive (heading 0): y grows, control at y=50 on the path.
  const trace = {
    samples: Array.from({ length: 101 }, (_, i) => ({
      tSec: i * 0.1,
      x: 4,
      y: i, // 1 m per 0.1 s
      headingDeg: 0,
    })),
  };

  it("returns the first sample where the control falls behind the car", () => {
    const t = controlPassTimeSec(trace, { x: 6, y: 50 }, 0, 10);
    // Behind after y > 50 → sample y=51 at t=5.1; the 6 m radius fires
    // a touch earlier (y≥45 within radius √(2²+5²)<6 → 45.. actually
    // hypot(2, 5) = 5.39 < 6 at y=45).
    expect(t).toBeGreaterThan(4);
    expect(t).toBeLessThanOrEqual(5.2);
  });

  it("falls back to the fault time when the control is never passed", () => {
    const t = controlPassTimeSec(trace, { x: 4, y: 500 }, 0, 7.5);
    expect(t).toBe(7.5);
  });

  it("respects the window start", () => {
    const t = controlPassTimeSec(trace, { x: 6, y: 20 }, 6, 10);
    expect(t).toBe(6); // already behind at the first considered sample
  });
});

describe("plannedChasePose", () => {
  const ghost = { x: 10, y: 100, headingDeg: 0 }; // northbound

  it("renders the standard chase framing without a control", () => {
    const out = plannedChasePose(5, ghost, null, createChaseCamPose());
    // Northbound: three-space forward is (0, −1) in (x, z); camera behind.
    expect(out.camX).toBeCloseTo(10, 5);
    expect(out.camY).toBeCloseTo(CAM_UP_M, 5);
    expect(out.camZ).toBeCloseTo(-100 + CAM_BACK_M, 5);
    expect(out.lookX).toBeCloseTo(10, 5);
  });

  it("widens while the control framing is active and settles after", () => {
    const framing = { passTSec: 6, x: 14, y: 120 };
    const during = plannedChasePose(5, ghost, framing, createChaseCamPose());
    const after = plannedChasePose(
      6 + CONTROL_BLEND_OUT_S + 0.01,
      ghost,
      framing,
      createChaseCamPose(),
    );
    const plain = plannedChasePose(5, ghost, null, createChaseCamPose());
    // Wider = further back while oriented.
    expect(during.camZ - plain.camZ).toBeCloseTo(CONTROL_EXTRA_BACK_M, 5);
    // Look pulled toward the control's x while oriented.
    expect(during.lookX).toBeGreaterThan(plain.lookX);
    // Fully settled to the plain chase after the blend-out.
    expect(after.camZ).toBeCloseTo(plain.camZ, 5);
    expect(after.lookX).toBeCloseTo(plain.lookX, 5);
  });

  it("is continuous through the pass (no cut)", () => {
    const framing = { passTSec: 6, x: 14, y: 120 };
    let prev = plannedChasePose(5.9, ghost, framing, createChaseCamPose());
    for (let t = 5.92; t < 7.2; t += 0.02) {
      const cur = plannedChasePose(t, ghost, framing, createChaseCamPose());
      expect(Math.abs(cur.camZ - prev.camZ)).toBeLessThan(0.2);
      expect(Math.abs(cur.lookX - prev.lookX)).toBeLessThan(0.2);
      prev = cur;
    }
  });

  it("controlWeightAt: 1 before the pass, 0 after the blend, smooth between", () => {
    expect(controlWeightAt(3, 6)).toBe(1);
    expect(controlWeightAt(6, 6)).toBe(1);
    expect(controlWeightAt(6 + CONTROL_BLEND_OUT_S, 6)).toBe(0);
    const mid = controlWeightAt(6 + CONTROL_BLEND_OUT_S / 2, 6);
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
  });
});

describe("plannedCockpitPose", () => {
  it("northbound: eye offsets map car-left → world −x, forward → −z", () => {
    // heading 0 (north) → three yaw π: cos ≈ −1, sin ≈ 0.
    const out = plannedCockpitPose({ x: 10, y: 100, headingDeg: 0 }, createCockpitCamPose());
    expect(out.camX).toBeCloseTo(10 - COCKPIT_EYE.x, 6);
    expect(out.camY).toBeCloseTo(GHOST_CHASSIS_REST_Y + COCKPIT_EYE.y, 6);
    expect(out.camZ).toBeCloseTo(-100 - COCKPIT_EYE.z, 6);
    expect(out.yawRad).toBeCloseTo(Math.PI, 6);
    expect(out.pitchRad).toBe(COCKPIT_PITCH_BASE);
  });

  it("the eye rides the drill height contract (1.20 m above the road)", () => {
    const out = plannedCockpitPose({ x: 0, y: 0, headingDeg: 90 }, createCockpitCamPose());
    expect(out.camY).toBeCloseTo(1.2, 6);
  });

  it("is pure — same pose in, same camera out", () => {
    const a = plannedCockpitPose({ x: 3, y: 4, headingDeg: 45 }, createCockpitCamPose());
    const b = plannedCockpitPose({ x: 3, y: 4, headingDeg: 45 }, createCockpitCamPose());
    expect(a).toEqual(b);
  });
});

describe("keyframesDueThrough (the R0 still scheduler)", () => {
  const times = [22, 28, 30, 30, 34]; // clamped duplicates fall due together

  it("advances through every keyframe at/behind the playhead", () => {
    expect(keyframesDueThrough(times, 0, 21.9)).toBe(0);
    expect(keyframesDueThrough(times, 0, 22)).toBe(1);
    expect(keyframesDueThrough(times, 1, 29.99)).toBe(2);
    expect(keyframesDueThrough(times, 2, 30)).toBe(4); // both duplicates
    expect(keyframesDueThrough(times, 4, 100)).toBe(5);
  });

  it("never rewinds and clamps a negative cursor", () => {
    expect(keyframesDueThrough(times, 5, 0)).toBe(5);
    expect(keyframesDueThrough(times, -3, 22)).toBe(1);
  });
});

describe("cabinChannelsFor (the honest R4 channels)", () => {
  it("recorder defaults: belt on, lights follow night", () => {
    expect(cabinChannelsFor([], false)).toEqual({ seatbeltOn: true, headlights: "off" });
    expect(cabinChannelsFor([], true)).toEqual({ seatbeltOn: true, headlights: "low" });
  });

  it("SEATBELT_OFF_* codes drop the belt", () => {
    expect(cabinChannelsFor(["SEATBELT_OFF_WHILE_MOVING"], false).seatbeltOn).toBe(false);
  });

  it("HEADLIGHTS_OFF_* codes force lights off — night and rain demos", () => {
    expect(cabinChannelsFor(["HEADLIGHTS_OFF_AT_NIGHT"], true).headlights).toBe("off");
    expect(cabinChannelsFor(["HEADLIGHTS_OFF_IN_RAIN"], false).headlights).toBe("off");
  });

  it("HIGH_BEAM_* codes force high beam", () => {
    expect(cabinChannelsFor(["HIGH_BEAM_AGAINST_LEAD"], true).headlights).toBe("high");
  });
});

describe("dash model", () => {
  it("maps the trace point through the blink clock and gear labels", () => {
    const m = dashModelFor(
      { indicator: "left", gear: -1, speedKmh: -7.2, brakeOn: true },
      { seatbeltOn: false, headlights: "low" },
      0.1, // blink ON at the start of the period
      createCaptureDashModel(),
    );
    expect(m.leftLampLit).toBe(true);
    expect(m.rightLampLit).toBe(false);
    expect(m.gearLabel).toBe("R");
    expect(m.seatbeltOn).toBe(false);
    expect(m.headlights).toBe("low");
    expect(m.brakeOn).toBe(true);
  });

  it("blinkOnAt follows the 0.75 s / 55 % duty lamp law (ShadowCar parity)", () => {
    expect(blinkOnAt(0)).toBe(true);
    expect(blinkOnAt(0.41)).toBe(true);
    expect(blinkOnAt(0.5)).toBe(false);
    expect(blinkOnAt(0.75)).toBe(true);
  });

  it("gearLabelFor covers R/N/D", () => {
    expect(gearLabelFor(-1)).toBe("R");
    expect(gearLabelFor(0)).toBe("N");
    expect(gearLabelFor(3)).toBe("D");
  });

  it("dashModelHash ignores sub-km/h jitter", () => {
    const a = createCaptureDashModel();
    const b = createCaptureDashModel();
    a.speedKmh = 30.2;
    b.speedKmh = 30.4;
    expect(dashModelHash(a)).toBe(dashModelHash(b));
    b.speedKmh = 31.6;
    expect(dashModelHash(a)).not.toBe(dashModelHash(b));
  });
});

describe("actorSpawned (the R1 checklist matcher)", () => {
  it("matches by pool and by profile", () => {
    const log = createActorPresenceLog();
    log.vehicles = 1;
    log.profiles = ["car"];
    expect(actorSpawned("vehicle", log)).toBe(true);
    expect(actorSpawned("pedestrian", log)).toBe(false);
    log.pedestrians = 1;
    expect(actorSpawned("pedestrian", log)).toBe(true);
    expect(actorSpawned("emergency", log)).toBe(false);
    log.profiles = ["car", "emergency"];
    expect(actorSpawned("emergency", log)).toBe(true);
    expect(actorSpawned("police", log)).toBe(true); // emergency covers police
  });

  it("parkedVehicle counts the occupied-bay obstacles", () => {
    const log = createActorPresenceLog();
    log.obstacleVehicles = 3;
    expect(actorSpawned("parkedVehicle", log)).toBe(true);
  });

  it("unknown kinds fail loud (false), never a silent pass", () => {
    const log = createActorPresenceLog();
    log.vehicles = 5;
    log.pedestrians = 5;
    expect(actorSpawned("ufo", log)).toBe(false);
  });

  it("buildActorChecklist + checklistSummary carry the card verbatim", () => {
    const log = createActorPresenceLog();
    log.vehicles = 1;
    log.profiles = ["car"];
    const checks = buildActorChecklist(
      [
        { kind: "vehicle", label: "Автомобил отпред в лентата (води)" },
        { kind: "pedestrian", label: "Пешеходец" },
      ],
      log,
    );
    expect(checks).toEqual([
      { kind: "vehicle", label: "Автомобил отпред в лентата (води)", present: true },
      { kind: "pedestrian", label: "Пешеходец", present: false },
    ]);
    expect(checklistSummary(checks)).toBe("1/2");
    expect(checklistSummary([])).toBe("");
  });
});
