/**
 * Trace gate — the 5 Half-B theory reels (templates-reels.ts), doc 76 §5/§9:
 *   1. each SHADOW replays with ZERO violations and earns CLEAN_DRIVING;
 *   2. each MISTAKE grades EXACTLY its template codeRefs (deduped) — no leaks;
 *   3. committed JSON under content/traces/<id>/ IS the recording, byte-for-byte,
 *      with an identical public copy.
 *
 * RE-RECORD (writes both content/traces and platform/public/traces):
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-reels-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { PedestrianDartOutSpec } from "../../contracts";
import { scenarioById } from "../../lessons/scenario";
import { SC_DRIVER_DISTRACTION } from "../../lessons/scenario/templates-reels";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import type { RecordedDrive } from "../recorder";
import { recordReelDrive, REELS, SIGN_WARNING_A15_Y } from "../scReels";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

// Record every reel's drives once (deterministic — same district → same bytes).
const drives = new Map<string, Map<string, RecordedDrive>>();
for (const reel of REELS) {
  const district = loadDistrict(reel.districtId);
  const byName = new Map<string, RecordedDrive>();
  for (const name of reel.names) byName.set(name, recordReelDrive(reel.id, name, district));
  drives.set(reel.id, byName);
}

for (const reel of REELS) {
  const spec = scenarioById(reel.id)!;
  const byName = drives.get(reel.id)!;
  const shadowName = reel.names[0];
  const mistakeNames = reel.names.slice(1);

  describe(`${reel.id} — trace gate`, () => {
    it("template is registered and its trace refs match the recorded names", () => {
      expect(spec, reel.id).toBeTruthy();
      const expected = reel.names.map((n) => `content/traces/${reel.id}/${n}.trace.json`);
      expect([spec.shadow.path, ...spec.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
    });

    it("SHADOW replays with ZERO violations (doc 76 §5)", () => {
      const shadow = byName.get(shadowName)!;
      // The §5 gate is zero violations. CLEAN_DRIVING is a DISTANCE-based
      // commendation (cleanDrivingDistanceM) — the ~225 m hz-obstacle shadows
      // are simply too short to accrue one, so it is not asserted here.
      expect(violationCodes(shadow), `${reel.id} shadow codes`).toEqual([]);
    });

    mistakeNames.forEach((name, i) => {
      it(`MISTAKE ${name} grades exactly ${spec.mistakes[i].codeRefs.join("+")}`, () => {
        const drive = byName.get(name)!;
        const codes = [...new Set(violationCodes(drive))].sort();
        expect(codes).toEqual([...spec.mistakes[i].codeRefs].sort());
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Founder R0 — „nothing actually happens at the fault"
// ---------------------------------------------------------------------------

describe("sc-sign-warning — the А15 post is in the fault frame", () => {
  // „just a car moving forward I couldnt understand what it tried to show …
  // nothing showing from our side for the user" (founder R0). The demo's whole
  // subject is a warning SIGN, the clip window is [fault−8, fault+4] around the
  // ENGINE fault time, and the camera is a chase cam — so a sign the ghost has
  // already passed at the conviction is a sign the viewer never sees. The old
  // staging convicted 38 m PAST the post.
  //
  // The post is placed by world/builders/zoneSigns.ts at the icePatch zone's
  // own `fromM`, so the map is the single truth for where it stands.
  const ICE_ZONE = (loadDistrict("ac-ice-v1") as {
    zones: Array<{ kind: string; fromM: number; toM: number }>;
  }).zones.find((z) => z.kind === "icePatch")!;

  it("the pinned sign line is the committed map's own ice-span start", () => {
    expect(SIGN_WARNING_A15_Y).toBe(ICE_ZONE.fromM);
  });

  for (const name of ["mistake-hold-speed", "mistake-no-slowdown"]) {
    it(`${name}: SPEED_TOO_FAST_FOR_CONDITIONS convicts AT the post, at speed`, () => {
      const drive = drives.get("sc-sign-warning")!.get(name)!;
      const fault = drive.ruleEvents.find(
        (e) => e.kind === "violation" && e.code === "SPEED_TOO_FAST_FOR_CONDITIONS",
      )!;
      expect(fault).toBeDefined();
      const pose = drive.trace.samples.reduce((best, s) =>
        Math.abs(s.tSec - fault.t) < Math.abs(best.tSec - fault.t) ? s : best,
      );
      // Within half a car-length of the post — the ❌ marker and the sign land
      // in the same frame, not 38 m apart.
      expect(Math.abs(pose.y - SIGN_WARNING_A15_Y)).toBeLessThan(3);
      // …and the car is still carrying the speed the sign warned it out of,
      // otherwise the picture argues the opposite of the lesson.
      expect(Math.abs(pose.speedKmh)).toBeGreaterThan(45);
    });
  }

  it("mistake-hold-speed: the run-off leaves the carriageway ON the ice, inside the clip window", () => {
    const drive = drives.get("sc-sign-warning")!.get("mistake-hold-speed")!;
    const fault = drive.ruleEvents.find(
      (e) => e.kind === "violation" && e.code === "SPEED_TOO_FAST_FOR_CONDITIONS",
    )!;
    const crash = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "COLLISION")!;
    expect(crash).toBeDefined();
    // The window closes at fault + CLIP_POST_FAULT_S (4 s): a crash on the last
    // frame is a crash nobody sees land.
    expect(crash.t - fault.t).toBeGreaterThan(1.5);
    expect(crash.t - fault.t).toBeLessThan(3.5);
    const pose = drive.trace.samples.reduce((best, s) =>
      Math.abs(s.tSec - crash.t) < Math.abs(best.tSec - crash.t) ? s : best,
    );
    expect(pose.x).toBeGreaterThan(8.9); // past the kerb line — off the road
    expect(pose.y).toBeGreaterThan(ICE_ZONE.fromM); // …and still on the ice
    expect(pose.y).toBeLessThan(ICE_ZONE.toM);
  });
});

describe("sc-driver-distraction — the walker is IN the car's path at the fault", () => {
  // „the driver and the car are no where near colliding, the shadow car stops
  // and 4-5 seconds after that the pedestrian moves on top of it basically
  // false" (founder R0). The demo is timed by ONE number — how far out the
  // walker is released — so the invariant is asserted on that number directly.
  const ped = (SC_DRIVER_DISTRACTION.staged ?? []).find(
    (s) => s.id === "sc-distraction-ped",
  ) as PedestrianDartOutSpec;
  /** hz-obstacle-v1's travel-lane centre — the x she has to reach. */
  const LANE_X = 4.06;
  /** The mistakes' unbraked pace, m/s (both hold 50 km/h to the dart point). */
  const MISTAKE_MPS = 50 / 3.6;

  it("is released far enough out to be ON the travel lane when the mistake arrives", () => {
    const arriveSec = ped.triggerDistM / MISTAKE_MPS;
    const xAtArrival = ped.start.x + ped.dir.x * ped.speedMps * arriveSec;
    // Within half a lane of the ego's centreline = a real meeting, which is
    // what makes the staged runner's own contact check convict instead of an
    // authored beat firing over empty asphalt. The old 34 m trigger left her
    // 8 m short here.
    expect(Math.abs(LANE_X - xAtArrival)).toBeLessThan(1.6);
  });

  it("crosses the SHADOW's lane by the time it halts — not seconds after it", () => {
    // „the shadow car stopps and 4-5 seconds after that the pedestrian moves on
    // top of it": with the old 34 m release she walked into the lane a second
    // and a half AFTER the car was already parked, so the correct demo showed a
    // car stopping at nothing too. Her arrival must lead the halt, not trail it.
    const shadow = drives.get("sc-driver-distraction")!.get("shadow-correct")!;
    const samples = shadow.trace.samples;
    // Release: the first sample within triggerDistM of the dart point.
    const releaseT = samples.find(
      (s) => Math.hypot(s.x - ped.crossing.x, s.y - ped.crossing.y) <= ped.triggerDistM,
    )!.tSec;
    // The FIRST standstill after moving off — the halt she is stopped for (the
    // last one is simply the end of the drive at the finish checkpoint).
    const haltT = samples.find((s) => s.tSec > 5 && Math.abs(s.speedKmh) < 0.5)!.tSec;
    const inLaneT = releaseT + (LANE_X - ped.start.x) / ped.speedMps;
    expect(inLaneT).toBeLessThanOrEqual(haltT + 0.5);
    // …and she is still mid-walk when the car is at rest — the wait is spent on
    // somebody, which is the whole point of the correct demonstration.
    expect(ped.speedMps * (haltT - releaseT)).toBeLessThan(ped.travelM);
  });
});

describe("sc-accident-own-conduct — the impact is a real body, and it costs time", () => {
  // „if there is an actual crash as it is stating and showing than there must
  // be at least some stoppage time because currently the shadow car is moving
  // going trough some stopped car and continuing" (founder R0).
  // The struck body is the scenery prop pinned at (6.4, 149) with a half-width
  // of ~0.9 m (scene/scenarioSceneryProps.ts, "sc-accident-own-conduct").
  const BODY = { x: 6.4, y: 149 };

  for (const name of ["mistake-hit-and-flee", "mistake-clip-continue"]) {
    it(`${name}: comes to rest flank-to-flank with the parked car, for seconds`, () => {
      const drive = drives.get("sc-accident-own-conduct")!.get(name)!;
      const collision = drive.ruleEvents.find(
        (e) => e.kind === "violation" && e.code === "COLLISION",
      )!;
      expect(collision).toBeDefined();
      const rested = drive.trace.samples.filter(
        (s) => Math.abs(s.speedKmh) < 0.5 && s.tSec >= collision.t,
      );
      // A hit that costs no time reads as no hit at all.
      expect(rested.length).toBeGreaterThanOrEqual(20 * 3); // >= 3 s at 20 Hz
      const pose = rested[0];
      // Alongside the body, not a metre inside it (that renders as driving
      // THROUGH) and not a car-length behind it (that renders as a near-miss).
      expect(Math.abs(BODY.y - pose.y)).toBeLessThan(2);
      expect(BODY.x - pose.x).toBeGreaterThan(0.8);
      expect(BODY.x - pose.x).toBeLessThan(1.8);
    });
  }
});

describe("committed reel trace files — the determinism law", () => {
  for (const reel of REELS) {
    const contentDir = path.join(REPO_ROOT, "content", "traces", reel.id);
    const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", reel.id);
    const byName = drives.get(reel.id)!;
    for (const name of reel.names) {
      it(`${reel.id}/${name}: committed JSON is exactly this recording (+ public copy)`, () => {
        const serialized = serializeScenarioTrace(byName.get(name)!.trace) + "\n";
        const contentFile = path.join(contentDir, `${name}.trace.json`);
        const publicFile = path.join(publicDir, `${name}.trace.json`);
        if (RECORD) {
          mkdirSync(contentDir, { recursive: true });
          mkdirSync(publicDir, { recursive: true });
          writeFileSync(contentFile, serialized);
          writeFileSync(publicFile, serialized);
        }
        expect(existsSync(contentFile), `${contentFile} missing — run RECORD_TRACES`).toBe(true);
        expect(existsSync(publicFile), `${publicFile} missing — run RECORD_TRACES`).toBe(true);
        expect(readFileSync(contentFile, "utf-8")).toBe(serialized);
        expect(readFileSync(publicFile, "utf-8")).toBe(readFileSync(contentFile, "utf-8"));
        const parsed = parseScenarioTrace(JSON.parse(readFileSync(contentFile, "utf-8")));
        expect(parsed!.meta.scenarioId).toBe(reel.id);
      });
    }
  }
});
