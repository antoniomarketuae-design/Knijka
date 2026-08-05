/**
 * SIGNAL-HEAD FORWARD VIEW — doc 87 rows B37 / B39 / B55, and the reason all
 * three of them said the same thing.
 *
 * FOUNDER, VERBATIM, about three different lessons whose whole subject is a
 * signal: „there is no traffic light at all" (18 Мигащо жълто) · „no traffic
 * light exists on the map nothing" (19 Спане на зелено) · „No traffic light
 * Exists again … there must be a traffic light for us, but also a traffic
 * light that the pedestrian follows" (29 Пешеходец на червено).
 *
 * All three maps carried heads the whole time — eight on `sx-v1`, ten on
 * `pe-jay-v1`. What they did not carry was a head A DRIVER COULD SEE. The near
 * head stands at the stop line 9 m to his RIGHT, which is azimuth 90° — out
 * the passenger window — from the moment he needs it; and the far-side
 * companion was mirrored THROUGH the node, so it landed on the far-LEFT corner
 * behind the street trees. Nothing signal-shaped was ever in the windscreen.
 * `props.ts` now mirrors the companion in the line through the node
 * PERPENDICULAR to travel, which keeps the driver's own kerb.
 *
 * THE PROPERTY THIS FILE PINS, and it is a product property, not a geometry
 * one: on every signalised approach a driver stopped at his own line must have
 * a head AHEAD of him, inside the windscreen. Counting heads cannot see this —
 * the counts were right for three review passes while the lessons were blind.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type TrafficLightPlacement } from "../types";

function load(id: string): District {
  const p = path.resolve(process.cwd(), "..", "content", "world", `${id}.json`);
  const d = JSON.parse(fs.readFileSync(p, "utf8")) as District;
  assertDistrict(d);
  return d;
}

/** World space is [x, h, -y]; district y is therefore −z. */
const districtXY = (t: TrafficLightPlacement): [number, number] => [t.position[0], -t.position[2]];

/**
 * Azimuth of `head` from a driver at `eye` travelling on `bearingDeg`
 * (compass, 0 = +y). Positive = right of the nose. Also returns the range.
 */
function fromTheSeat(
  eye: [number, number],
  bearingDeg: number,
  head: TrafficLightPlacement,
): { azDeg: number; rangeM: number } {
  const [hx, hy] = districtXY(head);
  const dx = hx - eye[0];
  const dy = hy - eye[1];
  const b = (bearingDeg * Math.PI) / 180;
  // Rotate the world offset into the driver's frame: +Y ahead, +X right.
  const ahead = dy * Math.cos(b) + dx * Math.sin(b);
  const right = dx * Math.cos(b) - dy * Math.sin(b);
  return {
    azDeg: (Math.atan2(right, ahead) * 180) / Math.PI,
    rangeM: Math.hypot(dx, dy),
  };
}

/**
 * The cockpit's usable forward cone. The lesson frames were shot at 1280×720
 * on `/dev/drive-rig`, where the head that closes these rows sits at azimuth
 * +9° from the stop line; ±30° is a deliberately conservative window — well
 * inside the windscreen aperture, and far tighter than the ±42° the frustum
 * itself admits — so a head that satisfies this really is in view rather than
 * technically on screen behind the A-pillar.
 */
const FORWARD_CONE_DEG = 30;

describe("a driver at the stop line has a signal head in his windscreen", () => {
  /**
   * The three review maps, with the pose the LESSON puts the student in:
   * the northbound lane centre at the graded stop line (sx-v1 / pe-jay-v1 both
   * derive it at y = −27.725), travelling due north.
   */
  const CASES = [
    { id: "sx-v1", rows: "B37 (18 Мигащо жълто) · B39 (19 Спане на зелено)" },
    { id: "pe-jay-v1", rows: "B55 (29 Пешеходец на червено)" },
  ] as const;

  for (const { id, rows } of CASES) {
    it(`${id} — ${rows}`, () => {
      const world = buildWorldGeometry(load(id), { seed: 7 });
      const vehicle = world.trafficLights.filter((t) => t.head !== "pedestrian");
      expect(vehicle.length).toBeGreaterThan(0);

      // Stopped AT the line, and rolling up to it — the head must be there for
      // the whole decision window, not just at one lucky sample.
      for (const y of [-60, -45, -35, -27.725, -20]) {
        const seen = vehicle
          .map((t) => ({ t, ...fromTheSeat([4.0625, y], 0, t) }))
          .filter((r) => Math.abs(r.azDeg) <= FORWARD_CONE_DEG && r.rangeM > 4);
        expect(
          seen.length,
          `${id}: no vehicle head within ±${FORWARD_CONE_DEG}° of the nose at y=${y}`,
        ).toBeGreaterThan(0);
        // …and it must be a head that ADDRESSES him — the northbound
        // approach's own axis group (travel bearing 0), never the cross
        // street's — standing on HIS SIDE of the road.
        //
        // `azDeg > 0` is the assertion with the teeth, and it is the rule
        // rather than a coincidence: on right-hand traffic the signal a driver
        // reads stands to his right. Under the shipped point-mirror the only
        // own-bearing head inside this cone was the far-LEFT one at −13…−20°,
        // so this line fails on the old geometry at every station.
        expect(
          seen.some((r) => r.t.approachBearingDeg === 0 && r.azDeg > 0),
          `${id}: no northbound head on the driver's own side at y=${y} ` +
            `(saw ${seen.map((r) => `${r.t.approachBearingDeg}°@az${r.azDeg.toFixed(0)}`).join(", ") || "nothing"})`,
        ).toBe(true);
      }
    });
  }

  it("every signalised approach gets a companion ACROSS the junction on its own kerb", () => {
    // The regression this exists for: a point reflection through the node
    // (the shipped rule until doc 87) flips the lateral side too, so the
    // companion lands on the far-LEFT corner AND coincides exactly with the
    // opposite approach's near head — eight heads on four poles.
    const world = buildWorldGeometry(load("sx-v1"), { seed: 7 });
    const spots = new Set(world.trafficLights.map((t) => districtXY(t).join(",")));
    expect(spots.size, "heads are stacked on coincident poles").toBe(world.trafficLights.length);

    for (const bearing of [0, 90, 180, 270]) {
      const pair = world.trafficLights.filter((t) => t.approachBearingDeg === bearing);
      expect(pair.length, `bearing ${bearing}`).toBe(2);
      const b = (bearing * Math.PI) / 180;
      const travel: [number, number] = [Math.sin(b), Math.cos(b)];
      const along = pair.map((t) => {
        const [x, y] = districtXY(t);
        return x * travel[0] + y * travel[1];
      });
      const lateral = pair.map((t) => {
        const [x, y] = districtXY(t);
        return x * travel[1] - y * travel[0];
      });
      // One before the node, one beyond it…
      expect(Math.min(...along)).toBeLessThan(0);
      expect(Math.max(...along)).toBeGreaterThan(0);
      // …both on the driver's RIGHT, which is the whole point.
      for (const l of lateral) expect(l).toBeGreaterThan(0);
    }
  });

  it("pe-jay-v1 carries BOTH signals founder item 29 asks for, on the same kerb", () => {
    // „there must be a traffic light for us, but also a traffic light that the
    // pedestrian follows" — the driver's far-side head and the crossing's own
    // pedestrian head must stand together where he is looking, not one of them
    // 34 m behind him.
    const world = buildWorldGeometry(load("pe-jay-v1"), { seed: 7 });
    const ped = world.trafficLights.filter((t) => t.head === "pedestrian");
    expect(ped.length).toBe(2);
    const mine = world.trafficLights.find(
      (t) => t.head !== "pedestrian" && t.approachBearingDeg === 0 && districtXY(t)[1] > 0,
    );
    expect(mine, "no northbound far-side head").toBeDefined();
    const near = ped
      .map((p) => Math.hypot(districtXY(p)[0] - districtXY(mine!)[0], districtXY(p)[1] - districtXY(mine!)[1]))
      .sort((a, b) => a - b)[0];
    expect(near).toBeLessThan(10); // same kerb, one glance apart
    // Both readable from the approach: inside the cone from the junction box.
    for (const t of [mine!, ped.find((p) => districtXY(p)[0] > 0)!]) {
      const { azDeg } = fromTheSeat([4.0625, 0], 0, t);
      expect(Math.abs(azDeg)).toBeLessThanOrEqual(FORWARD_CONE_DEG);
    }
  });
});
