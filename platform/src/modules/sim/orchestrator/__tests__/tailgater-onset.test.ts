/**
 * FR-56 — „the car behind that is sticking to the user car is sticking very
 * late, IT MUST BE STICKING MUCH EARLIER" (founder, item 44).
 *
 * The лепка was never broken; it was arithmetic. The actor is held DORMANT at
 * the kerb and released once the player is `releaseGapM` ahead, at which point
 * it has to (a) accelerate from 0 and (b) close the gap that opened while it
 * accelerated — at a closing speed of only `maxMatchSpeedMps − playerSpeed`.
 * Measured on the shipped spec with a constant-speed player on ln-v1:
 *
 *   glued at  7.4 s @ 30 km/h · 9.1 s @ 40 · 13.7 s @ 50
 *
 * A car that only starts pressing you at the half-minute mark is not the
 * lesson — by then the drive is nearly over. The fix is the `seedSpeedMps`
 * rolling start on the matchPlayer command: the actor arrives in the mirror
 * ALREADY TRAVELLING at the player's speed, which is what a real tailgater
 * does. Same measurement after: 3.1–3.4 s at every speed.
 *
 * This file pins the onset, and pins that the pose it reaches is the лепка the
 * spec asks for rather than a car merely somewhere behind.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RearTailgaterSpec, StagedEventSpec } from "../../contracts";
import type { SimTickEvent } from "../../rules";
import { SCENARIO_TEMPLATES } from "../../lessons/scenario/templates";
import type { ScenarioSpec } from "../../lessons/scenario/types";
import { createTrafficSystem } from "../../traffic/system";
import type { TrafficDistrict } from "../../traffic/types";
import { RearTailgaterRunner } from "../runners";
import type { DirectorInput, StagedTrafficPort } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const DT = 1 / 30;
/**
 * The ceiling this test defends. Well inside the measured 3.1–3.4 s, and far
 * below the 7.4–13.7 s that made him write the sentence.
 */
const MAX_ONSET_SEC = 5;

interface SpawnPt { id: string; x: number; y: number; heading: number }

function district(id: string): TrafficDistrict {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as TrafficDistrict;
}

/** Fixed jitter draw — every probe replays bit-identically. */
const rng = () => 0.5;

const SPEC = (SCENARIO_TEMPLATES as ScenarioSpec[]).find((s) => s.id === "sc-follow-tailgater")!;
const TAILGATER = [
  ...(SPEC.staged ?? []),
  ...SPEC.levels.flatMap((l) => l.stagedAdd ?? []),
].find((s: StagedEventSpec) => s.kind === "rearTailgater") as RearTailgaterSpec;

interface Run {
  /** First time the actor sits inside the glued band behind the player, s. */
  gluedAtSec: number | null;
  /** Seconds the actor spent inside that band before the pass. */
  gluedSec: number;
  /** Tightest gap it ever held behind the player, m. */
  tightestM: number;
  /** Fastest the actor was ever published at, m/s. */
  topSpeedMps: number;
}

function drive(speedKmh: number): Run {
  const d = district(SPEC.map.districtId) as unknown as { spawnPoints?: SpawnPt[] };
  const sp =
    (d.spawnPoints ?? []).find((p) => p.id === SPEC.start?.spawnPointId) ?? (d.spawnPoints ?? [])[0];
  const tr = createTrafficSystem(district(SPEC.map.districtId), {
    seed: 7,
    vehicleCount: 0,
    pedestrianCount: 0,
  });
  const runner = new RearTailgaterRunner(TAILGATER);
  runner.stage(tr as unknown as StagedTrafficPort, rng, true);

  const rad = (sp.heading * Math.PI) / 180;
  const dirX = Math.sin(rad);
  const dirY = Math.cos(rad);
  const mps = speedKmh / 3.6;
  let px = sp.x;
  let py = sp.y;
  const out: SimTickEvent[] = [];
  const run: Run = { gluedAtSec: null, gluedSec: 0, tightestM: Infinity, topSpeedMps: 0 };
  const band = TAILGATER.followBehindM + 4; // the runner's own latch slack

  for (let i = 0; i < 40 * 30; i++) {
    const t = (i + 1) * DT;
    px += dirX * mps * DT;
    py += dirY * mps * DT;
    tr.update(DT, {
      signalPhase: () => "green",
      playerPos: { x: px, y: py },
      playerSpeedKmh: speedKmh,
      playerHeadingDeg: sp.heading,
    });
    runner.step(
      tr as unknown as StagedTrafficPort,
      {
        tSec: t,
        dtSec: DT,
        x: px,
        y: py,
        speedKmh,
        headingDeg: sp.heading,
        brakePedal: 0,
        tickEvents: [],
      } satisfies DirectorInput,
      out,
    );
    const a = tr.staged(TAILGATER.id);
    if (!a) continue;
    if (a.speedMps > run.topSpeedMps) run.topSpeedMps = a.speedMps;
    const behindM = -((a.x - px) * dirX + (a.y - py) * dirY);
    if (behindM > 0 && behindM <= band) {
      if (run.gluedAtSec === null) run.gluedAtSec = t;
      run.gluedSec += DT;
      if (behindM < run.tightestM) run.tightestM = behindM;
    }
  }
  return run;
}

describe("FR-56 — the лепка arrives early, at every pace the student might drive", () => {
  for (const kmh of [30, 40, 50]) {
    it(`${kmh} km/h: glued within ${MAX_ONSET_SEC} s and holds the pose`, () => {
      const r = drive(kmh);
      expect(r.gluedAtSec, `${kmh} km/h: it never glued at all`).not.toBeNull();
      expect(r.gluedAtSec!, `${kmh} km/h onset`).toBeLessThanOrEqual(MAX_ONSET_SEC);
      // It is PRESSURE, not a fly-past: the spec asks for `pressureSec` of it.
      expect(r.gluedSec, `${kmh} km/h: time spent glued`).toBeGreaterThanOrEqual(
        TAILGATER.pressureSec * 0.75,
      );
      // …and the pose really is the лепка (~9 m of centres ≈ 5 m of bumpers),
      // not a polite 13 m that merely lands inside the latch band.
      expect(r.tightestM, `${kmh} km/h: tightest gap held`).toBeLessThanOrEqual(
        TAILGATER.followBehindM + 1.5,
      );
    });
  }

  it("the rolling start is clamped by the spec's own cap — no teleporting", () => {
    // `seedSpeedMps` is `min(seed, maxSpeedMps)` in staged.ts, so a student
    // doing 90 km/h cannot conjure a 90 km/h tailgater out of a spec that
    // authored 18 m/s (~65 km/h). At that pace the actor CANNOT hold station,
    // and the honest outcome is that it is left behind — which is also the
    // right lesson: nobody tailgates you at 90 in a 50 zone, the speeding
    // detector does.
    const fast = drive(90);
    expect(fast.topSpeedMps).toBeLessThanOrEqual(TAILGATER.maxMatchSpeedMps + 1e-6);
    expect(fast.gluedAtSec, "it must not pretend to keep up at 90 km/h").toBeNull();
    // And at a lawful pace the same clamp leaves it plenty of authority.
    const lawful = drive(45);
    expect(lawful.topSpeedMps).toBeLessThanOrEqual(TAILGATER.maxMatchSpeedMps + 1e-6);
    expect(lawful.gluedAtSec!).toBeLessThanOrEqual(MAX_ONSET_SEC);
  });
});
