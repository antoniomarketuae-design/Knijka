/**
 * F6 (lane staticcardcopy landing, integrator ruling 2026-11-04) — THE
 * RECORDER'S OMIT RULE.
 *
 * `SimTickEvent.onCarriageway` is a fact about the struck body, and the event
 * carries the key ONLY when that body's rect is flagged (`ObstacleRect2D
 * .onCarriageway`). On every other contact the key is OMITTED — never set to
 * `undefined` — so every `toEqual` on an old contact sees byte-identical input
 * (rules/types.ts; the same rule `actorId` keeps). The live runtime's half of
 * this rule is pinned in the chain test; the recorder twin was not, and the
 * verifier's mutant V2 (`ev.onCarriageway = c.onCarriageway` unconditionally,
 * which writes an `undefined` key) survived every gate. This pins it on the
 * stream itself, through `onTick`, on shipped drives:
 *
 *  - sc-pk-driveway's two mistake demos strike UNFLAGGED static walls (both
 *    straddle the kerb and keep the off-road copy) — no key, not even undefined;
 *  - sc-park-van's mistake strikes an unflagged VEHICLE rect — no key;
 *  - sc-park-wall's mistake strikes the FLAGGED lot wall — the key, `true`
 *    (the positive control, so this file cannot pass on a recorder that never
 *    sets the key at all).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SimTick } from "../../rules";
import { PARK_DEPTH_DRILLS, recordScParkDepthDrive } from "../scParkDepth";
import { recordScPkDrivewayDrive, type ScPkDrivewayTraceName } from "../scPkDriveway";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}

type CollisionEvent = Extract<SimTick["events"][number], { kind: "collision" }>;

/** Every collision event the recorder put on the stream, as handed to onTick. */
function collisionEvents(record: (onTick: (tick: SimTick) => void) => void): CollisionEvent[] {
  const out: CollisionEvent[] = [];
  record((tick) => {
    for (const e of tick.events) if (e.kind === "collision") out.push(e);
  });
  return out;
}

describe("F6 — the recorder omits onCarriageway on an unflagged rect", () => {
  const pk = loadDistrict("pk-drive-v1");

  for (const name of ["mistake-wide", "mistake-deep"] as ScPkDrivewayTraceName[]) {
    it(`sc-pk-driveway/${name}: the unflagged wall's contact carries NO onCarriageway key`, () => {
      const evs = collisionEvents((onTick) => recordScPkDrivewayDrive(pk, name, { onTick }));
      expect(evs.length, `${name} must strike a wall`).toBeGreaterThan(0);
      for (const e of evs) {
        expect(e.withWhat).toBe("staticObject");
        expect(
          Object.prototype.hasOwnProperty.call(e, "onCarriageway"),
          `${name}: an unflagged rect's event must carry no onCarriageway key, not even undefined`,
        ).toBe(false);
        expect(Object.keys(e).sort()).toEqual(["actorId", "kind", "withWhat"]);
      }
    });
  }

  it("sc-park-van/mistake-early-turn: the unflagged vehicle rect's contact carries NO key", () => {
    const district = loadDistrict(PARK_DEPTH_DRILLS["sc-park-van"].districtId);
    const evs = collisionEvents((onTick) =>
      recordScParkDepthDrive(district, "sc-park-van", "mistake-early-turn", { onTick }),
    );
    expect(evs.length).toBeGreaterThan(0);
    for (const e of evs) {
      expect(e.withWhat).toBe("vehicle");
      expect(
        Object.prototype.hasOwnProperty.call(e, "onCarriageway"),
        "an unflagged vehicle rect's event must carry no onCarriageway key, not even undefined",
      ).toBe(false);
    }
  });

  it("sc-park-wall/mistake-into-wall: the FLAGGED wall's contact carries onCarriageway: true", () => {
    const district = loadDistrict(PARK_DEPTH_DRILLS["sc-park-wall"].districtId);
    const evs = collisionEvents((onTick) =>
      recordScParkDepthDrive(district, "sc-park-wall", "mistake-into-wall", { onTick }),
    );
    expect(evs.length).toBeGreaterThan(0);
    for (const e of evs) {
      expect(e.withWhat).toBe("staticObject");
      expect(e.onCarriageway).toBe(true);
    }
  });
});
