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
  actorInPlannedFrame,
  actorInPlannedFrameFor,
  actorInRearAwareFrame,
  actorSpawned,
  blinkOnAt,
  buildActorChecklist,
  cabinChannelsFor,
  CAM_BACK_M,
  CAM_UP_M,
  captureWindowFor,
  checklistSummary,
  CONTROL_APPROACH_S,
  CONTROL_BLEND_OUT_S,
  CONTROL_EXTRA_BACK_M,
  CONTROL_LEAD_S,
  CONTROL_MAX_PRE_FAULT_S,
  controlFrontness,
  controlPassTimeSec,
  controlWeightAt,
  createActorPresenceLog,
  createCaptureDashModel,
  createChaseCamPose,
  createCockpitCamPose,
  dashModelFor,
  dashModelHash,
  FAULT_MARKER_Y,
  faultMarkerAlphaAt,
  faultMarkerPose,
  gearLabelFor,
  GHOST_CHASSIS_REST_Y,
  keyframesDueThrough,
  KEYFRAME_MIN_DISTINCT,
  keyframeTimes,
  LANE_HIGHLIGHT_DUR_S,
  laneHighlightAlphaAt,
  markFramedKind,
  plannedChasePose,
  plannedCockpitPose,
  plannedRearAwarePose,
  REAR_CAM_AHEAD_M,
  REAR_CAM_SIDE_M,
  REAR_CAM_UP_M,
  REAR_LOOK_BACK_M,
  WINDOW_END_GUARD_S,
} from "./capturePlan";
import { CLIP_MIN_S } from "./trim";

describe("captureWindowFor", () => {
  it("anchors on the engine fault time — [fault−8, fault+4]", () => {
    const w = captureWindowFor(60, 30, null);
    expect(w.startSec).toBe(22);
    expect(w.endSec).toBe(34);
  });

  it("opens early enough that the control is ahead before its pass", () => {
    const plain = captureWindowFor(60, 30, null);
    // Pass right at the plain start: the window opens CONTROL_LEAD_S earlier.
    const withControl = captureWindowFor(60, 30, { passTSec: plain.startSec });
    expect(withControl.startSec).toBeLessThanOrEqual(plain.startSec - CONTROL_LEAD_S);
    expect(withControl.startSec).toBeLessThanOrEqual(plain.startSec - 2);
    expect(withControl.endSec).toBe(plain.endSec);
  });

  it("never touches the trace end (the loop-wrap hop guard, v1 №6)", () => {
    const w = captureWindowFor(40, 39, null);
    expect(w.endSec).toBeLessThanOrEqual(40 - WINDOW_END_GUARD_S);
    expect(w.endSec - w.startSec).toBeGreaterThanOrEqual(CLIP_MIN_S - 1);
  });

  it("clamps the lead-in at t=0", () => {
    const w = captureWindowFor(60, 4, { passTSec: 1 });
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

  // 7b hardening (pilot v2): the R0 strip must always carry at least THREE
  // distinct instants — before/at/after cannot be shown with two.
  it("guarantees ≥3 distinct instants when the fault anchor sits outside the window", () => {
    // Fault far BEFORE the window: the naive clamp would collapse onto the
    // boundaries (start ×4 + end) — the law falls back to the even spread.
    const before = keyframeTimes({ startSec: 10, endSec: 20 }, 2);
    expect(before).toEqual([10, 12.5, 15, 17.5, 20]);
    // Fault far AFTER the window: same law from the other side.
    const after = keyframeTimes({ startSec: 10, endSec: 20 }, 40);
    expect(after).toEqual([10, 12.5, 15, 17.5, 20]);
    expect(new Set(before).size).toBeGreaterThanOrEqual(KEYFRAME_MIN_DISTINCT);
  });

  it("keeps the fault-anchored strip whenever it already carries 3 distinct beats", () => {
    // The zebra case (window [0, 11.07], fault 7.07): anchored strip, untouched.
    const zebra = keyframeTimes({ startSec: 0, endSec: 11.07 }, 7.07);
    expect(zebra).toEqual([0, 5.07, 7.07, 9.07, 11.07]);
    // Fault ON the window edge still leaves {start, fault−2, end} distinct.
    const edge = keyframeTimes({ startSec: 10, endSec: 20 }, 20);
    expect(new Set(edge).size).toBeGreaterThanOrEqual(KEYFRAME_MIN_DISTINCT);
    expect(edge[0]).toBe(10);
    expect(edge[4]).toBe(20);
  });

  it("degenerate zero-length window: five copies of the same instant, no NaN", () => {
    const flat = keyframeTimes({ startSec: 5, endSec: 5 }, 5);
    expect(flat).toEqual([5, 5, 5, 5, 5]);
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

describe("actorInPlannedFrame (the R1 visibility law)", () => {
  const ghost = { x: 0, y: 0, headingDeg: 0 }; // northbound at the origin

  it("sees an actor ahead in the lane (the follow-distance lead)", () => {
    expect(actorInPlannedFrame(ghost, 0, 10.5)).toBe(true);
  });

  it("cannot see an actor behind the chase camera (the sc-lane-change pace car)", () => {
    // The blind-spot pace car match-follows ~24–39 m BEHIND the ghost in the
    // target lane — the pilot-v2 clip whose checklist lied "present".
    expect(actorInPlannedFrame(ghost, -8.125, -39)).toBe(false);
    expect(actorInPlannedFrame(ghost, -8.125, -24)).toBe(false);
  });

  it("cannot see an actor far outside the lateral frustum (the rb circulator)", () => {
    // sc-roundabout-entry m0 at the fault: circulator ~18 m to the left,
    // barely ahead — outside the 44°-vertical/16:9 cone, edge-cropped in k2.
    expect(actorInPlannedFrame({ x: 0, y: 0, headingDeg: 30 }, -17.5, 6.5)).toBe(false);
  });

  it("caps legibility distance (the d2 walker 540 m up the boulevard)", () => {
    expect(actorInPlannedFrame(ghost, 0, 539)).toBe(false);
    expect(actorInPlannedFrame(ghost, 0, 119)).toBe(true);
  });

  it("widens with depth (a control-side actor near the camera is out, far is in)", () => {
    // Same 6 m lateral offset: hidden right beside the bumper's near plane,
    // visible 20 m down the road.
    expect(actorInPlannedFrame(ghost, 6, -6)).toBe(false);
    expect(actorInPlannedFrame(ghost, 6, 20)).toBe(true);
  });
});

describe("actorSpawned (the R1 checklist matcher — framed at the fault beat)", () => {
  it("matches by framed kind and by framed profile", () => {
    const log = createActorPresenceLog();
    log.vehicles = 1; // staging truth alone is NOT presence (pilot-v2 lesson)
    log.profiles = ["car"];
    expect(actorSpawned("vehicle", log)).toBe(false);
    markFramedKind(log, "vehicle");
    expect(actorSpawned("vehicle", log)).toBe(true);
    expect(actorSpawned("pedestrian", log)).toBe(false);
    markFramedKind(log, "pedestrian");
    expect(actorSpawned("pedestrian", log)).toBe(true);
    expect(actorSpawned("emergency", log)).toBe(false);
    markFramedKind(log, "Emergency"); // normalized + deduped
    markFramedKind(log, "emergency");
    expect(log.framedKinds.filter((k) => k === "emergency")).toEqual(["emergency"]);
    expect(actorSpawned("emergency", log)).toBe(true);
    expect(actorSpawned("police", log)).toBe(true); // emergency covers police
  });

  it("a dormant staged actor (never framed) is honestly ABSENT", () => {
    // sc-ed-d2-city-run m0: the walker stays staged 540 m away for the whole
    // red-light clip — the v2 checklist said present:true; it may not again.
    const log = createActorPresenceLog();
    log.pedestrians = 1;
    expect(actorSpawned("pedestrian", log)).toBe(false);
  });

  it("parkedVehicle accepts a framed parked row or a framed vehicle", () => {
    const log = createActorPresenceLog();
    log.obstacleVehicles = 3;
    expect(actorSpawned("parkedVehicle", log)).toBe(false);
    markFramedKind(log, "parkedvehicle");
    expect(actorSpawned("parkedVehicle", log)).toBe(true);
  });

  it("unknown kinds fail loud (false), never a silent pass", () => {
    const log = createActorPresenceLog();
    markFramedKind(log, "vehicle");
    markFramedKind(log, "pedestrian");
    expect(actorSpawned("ufo", log)).toBe(false);
  });

  it("buildActorChecklist + checklistSummary carry the card verbatim", () => {
    const log = createActorPresenceLog();
    log.vehicles = 1;
    log.profiles = ["car"];
    markFramedKind(log, "vehicle");
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

describe("captureWindowFor — the pass-anchored opening (pilot v2 cause 3)", () => {
  it("opens before an EARLY control pass so the sign is ahead at k0", () => {
    // В24/В27 class: the ghost passes the sign well before fault−8−2.
    const w = captureWindowFor(60, 30, { passTSec: 17 });
    expect(w.startSec).toBeCloseTo(17 - CONTROL_APPROACH_S, 5);
    expect(w.endSec).toBe(34);
  });

  it("caps the opening at CONTROL_MAX_PRE_FAULT_S before the fault", () => {
    const w = captureWindowFor(60, 30, { passTSec: 5 });
    expect(w.startSec).toBeCloseTo(30 - CONTROL_MAX_PRE_FAULT_S, 5);
  });

  it("keeps the plain lead when the pass falls inside the base window", () => {
    // rx class: the pass happens shortly before the fault.
    const w = captureWindowFor(60, 30, { passTSec: 28 });
    expect(w.startSec).toBeCloseTo(30 - 8 - CONTROL_LEAD_S, 5);
  });
});

describe("controlFrontness (the pk-ban black-frame guard)", () => {
  const ghost = { x: 4, y: 100, headingDeg: 0 }; // northbound

  it("1 for a control well ahead, 0 for one behind", () => {
    expect(controlFrontness(ghost, { x: 8, y: 130 })).toBe(1);
    expect(controlFrontness(ghost, { x: 8, y: 70 })).toBe(0);
  });

  it("ramps continuously through abeam", () => {
    const mid = controlFrontness(ghost, { x: 8, y: 102.5 });
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it("plannedChasePose ignores a control BEHIND the ghost (no backward yank)", () => {
    // Pilot v2 sc-pk-ban-stop k0: pass at the window start left weight 1 on a
    // control 22 m behind — the look went backward through the ghost shell
    // and recorded a near-black frame. The frontness factor kills the pull.
    const behind = { passTSec: 20, x: 8.9, y: 70 }; // still "pre-pass" at t=10
    const pulled = plannedChasePose(10, ghost, behind, createChaseCamPose());
    const plain = plannedChasePose(10, ghost, null, createChaseCamPose());
    expect(pulled.lookX).toBeCloseTo(plain.lookX, 5);
    expect(pulled.lookZ).toBeCloseTo(plain.lookZ, 5);
    expect(pulled.camZ).toBeCloseTo(plain.camZ, 5);
  });
});

describe("plannedRearAwarePose (cause 2 — rear approaches)", () => {
  it("northbound: camera ahead on the kerb side, looking back past the ghost", () => {
    const ghost = { x: 12.19, y: 100, headingDeg: 0 };
    const out = plannedRearAwarePose(ghost, createChaseCamPose());
    // District right of north = east = three +x; ahead = district +y = three −z.
    expect(out.camX).toBeCloseTo(12.19 + REAR_CAM_SIDE_M, 5);
    expect(out.camY).toBeCloseTo(REAR_CAM_UP_M, 5);
    expect(out.camZ).toBeCloseTo(-(100 + REAR_CAM_AHEAD_M), 5);
    expect(out.lookX).toBeCloseTo(12.19, 5);
    expect(out.lookZ).toBeCloseTo(-(100 - REAR_LOOK_BACK_M), 5);
  });

  it("is pure — same ghost pose in, same camera out", () => {
    const a = plannedRearAwarePose({ x: 3, y: 4, headingDeg: 45 }, createChaseCamPose());
    const b = plannedRearAwarePose({ x: 3, y: 4, headingDeg: 45 }, createChaseCamPose());
    expect(a).toEqual(b);
  });
});

describe("actorInRearAwareFrame (the R1 law for rearAware clips)", () => {
  // sc-vu-emergency geometry: ghost in the right lane (x 12.19) northbound,
  // the ambulance closes in the LEFT lane (x ≈ 5.69) from behind.
  const ghost = { x: 12.19, y: 200, headingDeg: 0 };

  it("sees the whole rear approach corridor the chase cone misses", () => {
    for (const behindM of [10, 20, 40, 60]) {
      expect(actorInRearAwareFrame(ghost, 5.69, 200 - behindM)).toBe(true);
      // The chase cone (looking forward) grades the same actor absent.
      expect(actorInPlannedFrame(ghost, 5.69, 200 - behindM)).toBe(false);
    }
  });

  it("keeps the ghost itself in frame (foreground third)", () => {
    expect(actorInRearAwareFrame(ghost, ghost.x, ghost.y)).toBe(true);
  });

  it("actorInPlannedFrameFor dispatches by camera profile", () => {
    expect(actorInPlannedFrameFor("rearAware", ghost, 5.69, 160)).toBe(true);
    expect(actorInPlannedFrameFor("chase", ghost, 5.69, 160)).toBe(false);
    expect(actorInPlannedFrameFor("chase", ghost, 12.19, 230)).toBe(true);
  });
});

describe("fault readability chrome (cause 5)", () => {
  it("faultMarkerPose maps district (x, y) → three (x, ·, −y) — the ShadowCar pose law", () => {
    // Pilot v2 sc-park-perp-rev: the roof badge parallax-read as an X on the
    // grass; the ground marker anchors at the ENGINE fault position instead.
    const pose = faultMarkerPose({ x: -3.4, y: 12.8 });
    expect(pose.x).toBeCloseTo(-3.4, 6);
    expect(pose.y).toBe(FAULT_MARKER_Y);
    expect(pose.z).toBeCloseTo(-12.8, 6);
  });

  it("faultMarkerAlphaAt fades in ending AT the fault and holds", () => {
    expect(faultMarkerAlphaAt(0, 10)).toBe(0);
    expect(faultMarkerAlphaAt(9.7, 10)).toBe(0);
    expect(faultMarkerAlphaAt(10, 10)).toBe(1);
    expect(faultMarkerAlphaAt(25, 10)).toBe(1);
    const mid = faultMarkerAlphaAt(9.9, 10);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it("laneHighlightAlphaAt pulses ~2 s at the fault, soft both ends", () => {
    expect(laneHighlightAlphaAt(5, 10)).toBe(0);
    expect(laneHighlightAlphaAt(10, 10)).toBe(1);
    expect(laneHighlightAlphaAt(11, 10)).toBe(1);
    expect(laneHighlightAlphaAt(10 + LANE_HIGHLIGHT_DUR_S, 10)).toBe(0);
    expect(laneHighlightAlphaAt(30, 10)).toBe(0);
    const fallMid = laneHighlightAlphaAt(10 + LANE_HIGHLIGHT_DUR_S - 0.15, 10);
    expect(fallMid).toBeGreaterThan(0);
    expect(fallMid).toBeLessThan(1);
  });
});
