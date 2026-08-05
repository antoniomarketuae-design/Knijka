/**
 * THE ANNOUNCED, STATIONARY CAR — `StagedActorPathSpec.indicator`.
 *
 * `clips/whyPanelPairing.MISSING_DRILLS` #1 asks for a drill teaching ЗДвП
 * чл. 43б (ЗАОБИКАЛЯНЕ, brand new in ДВ бр. 64/2025), whose opening image is
 * «спрял на осевата с ляв мигач автомобил, който чака да завие наляво». The
 * blinker carries the law: § 6 т. 80 ДР defines заобикаляне as passing a
 * STATIONARY participant, which is precisely what чл. 41 ал. 2's „движещото
 * се" excludes — so a standing car that has ANNOUNCED why is the whole reason
 * this is a different manoeuvre from изпреварване, and three bank questions
 * (q-krastovishta-051, q-manevri-024, q-manevri-060) have no clip without it.
 *
 * The `setIndicator` channel (ledger L6) already published and rendered. What
 * was missing was an authoring surface: a scenario template cannot reach the
 * traffic port, so nothing a template could write made a parked prop blink.
 * These tests pin the seam and — the load-bearing half — pin that it is OPT-IN,
 * because `brakingLeadCar` is the most borrowed staged kind in the catalogue
 * (FR-56's four-broken-assertions precedent).
 */

import { describe, expect, it } from "vitest";
import type { BrakingLeadCarSpec } from "../../contracts";
import type { SimTickEvent } from "../../rules";
import { createTrafficSystem } from "../../traffic/system";
import type { TrafficDistrict } from "../../traffic/types";
import { BrakingLeadCarRunner } from "../runners";

const DT = 1 / 30;

function district(): TrafficDistrict {
  return {
    roads: {
      nodes: [
        { id: "n1", x: 0, y: 0 },
        { id: "n2", x: 0, y: 600 },
      ],
      edges: [
        {
          id: "e1",
          from: "n1",
          to: "n2",
          class: "residential",
          oneway: false,
          roundabout: false,
          lanes: 4,
          maxspeed: 50,
          length: 600,
          geometry: [
            [0, 0],
            [0, 600],
          ],
        },
      ],
    },
    intersections: [],
    crossings: [],
  };
}

/**
 * The prop idiom the catalogue already uses for a car that must never move
 * (`FS_QUEUE_AHEAD`): `armDistM: 3` means it would only arm on bumper contact,
 * i.e. never. Here it is a car halted on the centre line, waiting to turn left.
 */
function haltedAnnouncedCar(indicator?: "left" | "right"): BrakingLeadCarSpec {
  return {
    id: "halted",
    kind: "brakingLeadCar",
    actor: {
      pathNodes: ["n1", "n2"],
      hold: { nodeIndex: 0, offsetM: 120 },
      cruiseSpeedMps: 8,
      ...(indicator !== undefined ? { indicator } : {}),
    },
    armDistM: 3,
    followGapM: 14,
    maxMatchSpeedMps: 12,
    slamAt: { x: 0, y: 5000 },
    slamRadiusM: 2,
    slamDecelMps2: 6,
    minSlamSpeedKmh: 250,
    proximityFallbackM: 0.3,
    triggersHazard: false,
    resumeAfterSec: 3,
  };
}

/** Stage, then drive the player up the street for `seconds`. */
function run(s: BrakingLeadCarSpec, seconds: number) {
  const tr = createTrafficSystem(district(), { seed: 3, vehicleCount: 0, pedestrianCount: 0 });
  const runner = new BrakingLeadCarRunner(s);
  runner.stage(tr, () => 0.5, true);
  const view = tr.staged("halted")!;
  const out: SimTickEvent[] = [];
  let py = 20;
  let t = 0;
  for (let i = 0; i < seconds * 30; i++) {
    t += DT;
    py += 8 * DT;
    tr.update(DT, {
      signalPhase: () => "green",
      playerPos: { x: 12.1875, y: py },
      playerSpeedKmh: 28.8,
      playerHeadingDeg: 0,
    });
    runner.step(
      tr,
      { tSec: t, dtSec: DT, x: 12.1875, y: py, speedKmh: 28.8, headingDeg: 0, brakePedal: 0, tickEvents: [] },
      out,
    );
  }
  return { tr, view, runner };
}

describe("StagedActorPathSpec.indicator — the stationary car that says why", () => {
  it("the lamp is on from the frame it is staged, before anything is commanded", () => {
    const tr = createTrafficSystem(district(), { seed: 3, vehicleCount: 0, pedestrianCount: 0 });
    const runner = new BrakingLeadCarRunner(haltedAnnouncedCar("left"));
    runner.stage(tr, () => 0.5, true);
    // No update() in between — a student who spawns looking at it sees it.
    expect(tr.staged("halted")!.indicator).toBe("left");
    expect(tr.vehicles.find((v) => v.id >= 1000)?.indicator).toBe("left");
  });

  it("it stays on while the car stands still and the player drives up to it", () => {
    const { view } = run(haltedAnnouncedCar("left"), 10);
    expect(view.indicator).toBe("left");
    // …and it really is STANDING STILL: заобикаляне is defined against a
    // stationary participant (§ 6 т. 80 ДР), so a prop that crept would make
    // the drill teach изпреварване instead.
    expect(view.speedMps).toBe(0);
    expect(view.s).toBeCloseTo(120, 3);
  });

  it("a re-stage (level restart) puts the lamp back on — `reset` clears it", () => {
    const s = haltedAnnouncedCar("left");
    const tr = createTrafficSystem(district(), { seed: 3, vehicleCount: 0, pedestrianCount: 0 });
    const runner = new BrakingLeadCarRunner(s);
    runner.stage(tr, () => 0.5, true);
    runner.stage(tr, () => 0.5, false); // the retry path — `reset`, not a fresh stage
    expect(tr.staged("halted")!.indicator).toBe("left");
  });

  it("the RIGHT lamp is authorable too — the same image, pulling over", () => {
    const { view } = run(haltedAnnouncedCar("right"), 5);
    expect(view.indicator).toBe("right");
  });

  it("OPT-IN: absent, the actor is born dark and NOTHING issues a command", () => {
    // The FR-56 guarantee. Sixteen lead actors across sixteen scenarios author
    // no indicator; if this ever regressed they would all start blinking.
    const { view } = run(haltedAnnouncedCar(undefined), 10);
    expect(view.indicator).toBe("off");
  });
});
