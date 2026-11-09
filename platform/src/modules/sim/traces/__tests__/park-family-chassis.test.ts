/**
 * catalogue-demo-curvature:dae908c7, family «curvpark2», round 2 — THE SIX
 * PARKING LESSONS' DEMOS, DRIVEN ON THE PRODUCT CHASSIS (integrator ruling
 * CP2-3, 2026-11-06: «drive each of the seven contact mistakes on the PRODUCT
 * CHASSIS at L1 … AND on the bicycle pose»).
 *
 * WHY. The ghost is kinematic: it stands on the authored centre point, headed
 * along the path's chord. A real car's rear axle trails its body, so on a 4.6 m
 * circle its heading lags the ghost's by up to ≈ 16° (the chord-heading crab,
 * F10 — a curvdepth precedent, reported, not repaired for the correct demos).
 * In round 1 two contact mistakes made their contact only on that crab: the
 * sc-park-45 corner-cut (bicycle pose +0.006 m from the car it «struck») and
 * the sc-park-perp-forward early turn (+0.087 m). A demo that shows a contact
 * the car cannot make teaches nothing true. Here each contact mistake is
 * driven on the product's own chassis along its committed path
 * (./parkChassisDrive.ts, the endings / npc-contact-cadence lanes' rapier
 * harness with the lesson's parked cars mounted) and must STRIKE the body its
 * explanation names — booked by the lesson's own ledger — and the real car's
 * pose on the same centre line must reach it too; and each correct demo,
 * driven the same way, must complete its lesson clean, clear of every body.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { obbSeparationM } from "../../collision";
import { compileScenario } from "../../lessons/scenario/compile";
import { scenarioById } from "../../lessons/scenario/templates";
import { initRapier } from "../../lessons/scenario/__tests__/rapierContactDrive";
import { parseScenarioTrace } from "../parse";
import type { ObstacleRect2D } from "../recorder";
import { lotObstacleRects } from "../scParkPerpRev";
import { drivewayObstacles } from "../scPkDriveway";
import type { ScenarioTrace } from "../types";
import { driveDemoOnChassis, type ChassisDriveOutcome } from "./parkChassisDrive";
import { bicycleOnPath, heroBox, lessonBoxSets, type ProductBoxSets } from "./parkDepthProduct";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

const LESSONS: Record<string, { district: string; rects: (raw: unknown) => ObstacleRect2D[] }> = {
  "sc-park-perp-rev": { district: "lot-perp-v1", rects: lotObstacleRects },
  "sc-park-narrow": { district: "lot-narrow-v1", rects: lotObstacleRects },
  "sc-park-parallel": { district: "lot-par-v1", rects: lotObstacleRects },
  "sc-park-45": { district: "lot-45-v1", rects: lotObstacleRects },
  "sc-pk-driveway": { district: "pk-drive-v1", rects: () => drivewayObstacles() },
  "sc-park-perp-forward": { district: "lot-perp-v1", rects: lotObstacleRects },
};
/** The seven contact mistakes and the body each explanation names (park-family-drivable's table). */
const CONTACTS: ReadonlyArray<[string, string, number]> = [
  ["sc-park-perp-rev", "mistake-wide-approach", 2],
  ["sc-park-narrow", "mistake-wide-swing", 2],
  ["sc-park-parallel", "mistake-far-from-lead", 1],
  ["sc-park-45", "mistake-corner-cut", 1],
  ["sc-park-perp-forward", "mistake-early-turn", 0],
  ["sc-pk-driveway", "mistake-wide", 0],
  ["sc-pk-driveway", "mistake-deep", 1],
];

const raw = new Map<string, unknown>();
const sets = new Map<string, ProductBoxSets>();
for (const [l, d] of Object.entries(LESSONS)) {
  const r = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${d.district}.json`), "utf-8"));
  raw.set(l, r);
  sets.set(l, lessonBoxSets(r, l, d.rects(r)));
}
function committed(l: string, name: string): ScenarioTrace {
  const t = parseScenarioTrace(JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "traces", l, `${name}.trace.json`), "utf-8")));
  if (t === null) throw new Error(`${l}/${name}: unparseable committed trace`);
  return t;
}
const drive = (l: string, name: string): ChassisDriveOutcome =>
  driveDemoOnChassis({ lesson: compileScenario(scenarioById(l)!, 1), raw: raw.get(l), trace: committed(l, name), parked: sets.get(l)!.live });

beforeAll(async () => {
  await initRapier();
});

describe("curvpark2 — each contact mistake's contact is one the CAR makes: the real car's pose reaches the named body, and the product chassis at L1 strikes it (CP2-3)", () => {
  for (const [l, name, body] of CONTACTS) {
    it(`${l}/${name} → ${sets.get(l)!.live[body].model}#${body}`, () => {
      const S = committed(l, name).samples;
      const bike = bicycleOnPath(S);
      const end = bike[bike.length - 1];
      const inner = sets.get(l)!.inner[body];
      // the REAL car (its rear axle rolling along its body) on the demo's centre line, at rest
      expect(obbSeparationM(heroBox(end.x, end.y, end.headingDeg), inner), `${l}/${name}: bicycle pose in the smaller box`).toBeLessThanOrEqual(-0.05);
      const ch = drive(l, name);
      expect(ch.offPath.median, "the chassis follows the demo's path").toBeLessThan(0.1);
      const live = sets.get(l)!.live;
      const named = ch.gapTo(live[body]);
      expect(named.m, `${l}/${name}: the chassis reaches ${live[body].model}#${body}`).toBeLessThanOrEqual(0.01);
      for (const b of live) if (b.index !== body) expect(ch.gapTo(b).m, `${l}/${name}: chassis vs ${b.model}#${b.index}`).toBeGreaterThan(0.1);
      // …and the lesson's own ledger books it, once, as what it struck
      expect(ch.collisions.map((c) => c.withWhat), `${l}/${name}: ledger`).toEqual([live[body].withWhat]);
      const met = ch.firstWithin(live[body], 0.01)!;
      expect(Math.abs(ch.collisions[0].t - met), `booked where the chassis met it (${met.toFixed(2)} s)`).toBeLessThan(0.5);
    });
  }
});

describe("curvpark2 — each correct demo, driven on the product chassis at L1, completes its lesson clean and clear", () => {
  for (const l of Object.keys(LESSONS)) {
    it(`${l}/shadow-correct`, () => {
      const ch = drive(l, "shadow-correct");
      const sheet = JSON.parse(ch.sheet) as { passed: boolean; score: number; completedAll: boolean };
      expect(ch.collisions, l).toEqual([]);
      expect(sheet.score, l).toBe(0);
      expect(sheet.completedAll, l).toBe(true);
      expect(sheet.passed, l).toBe(true);
      expect(ch.offPath.median).toBeLessThan(0.1);
      for (const b of sets.get(l)!.live) expect(ch.gapTo(b).m, `${l}: chassis vs ${b.model}#${b.index}`).toBeGreaterThanOrEqual(0.25);
    });
  }
});
