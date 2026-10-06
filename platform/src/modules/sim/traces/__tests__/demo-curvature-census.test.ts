/**
 * CATALOGUE CENSUS — does any committed demo turn tighter than the product car
 * can? (sc-park-bay-exit-rev:49af2940, item 4.)
 *
 * The row's root was a demo whose body-centre path turned on a 3.03 m radius
 * against a car whose tightest body-centre circle is 3.955 m (kinematic, from
 * vehicle/tuning.ts — see ./demoCurvature) and ≈ 4.17 m on the physics car. A
 * ghost that turns tighter than the car shows the student a manoeuvre no real
 * car can follow, and any steering instrument cut from it inherits an
 * infeasible target. This census measures EVERY committed demo of EVERY
 * template — shadow and mistake — with the same windowed measure the
 * sc-park-bay-exit-rev drivability pin uses, and records the ones that turn
 * tighter than the kinematic limit.
 *
 * WHAT IS PINNED, AND WHAT IS ONLY REPORTED. sc-park-bay-exit-rev's three
 * demos are PINNED clean (never in the list). Every other offender is REPORTED,
 * not repaired: the list is committed beside this file
 * (demo-curvature-census.json) and asserted exactly, so a demo that starts or
 * stops turning tighter than the car changes the census and has to be looked
 * at. The integrator files those rows; this lane changes none of them.
 *
 * WINDOW. 1 m of body-centre travel (./demoCurvature explains why a window, and
 * why 1 m). A polyline corner authored without a fillet reads as the pivot it
 * is — the ghost rotating on the spot — and is reported like any other turn.
 *
 * REGENERATE (only when a demo's geometry legitimately changes):
 *   WRITE_CURVATURE_CENSUS=1 npx vitest run src/modules/sim/traces/__tests__/demo-curvature-census.test.ts
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SCENARIO_TEMPLATES } from "../../lessons/scenario/templates";
import { parseScenarioTrace } from "../parse";
import { KINEMATIC_CENTRE_RADIUS_M, windowedMinRadius } from "./demoCurvature";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const CENSUS_FILE = path.join(HERE, "demo-curvature-census.json");
const WRITE = process.env.WRITE_CURVATURE_CENSUS === "1";

interface CensusRow {
  lesson: string;
  family: string;
  demo: string;
  /** Does the demo drive in reverse anywhere? */
  reverses: boolean;
  /** Tightest body-centre radius over 1 m of travel, m (3 decimals). */
  worstRadiusM: number;
  /** Trace time at the start of that window, s (2 decimals). */
  atSec: number;
}

interface Census {
  limitM: number;
  windowM: number;
  measured: number;
  unreadable: string[];
  offenders: CensusRow[];
}

function measureCatalogue(): { census: Census; all: CensusRow[] } {
  const all: CensusRow[] = [];
  const unreadable: string[] = [];
  for (const t of SCENARIO_TEMPLATES) {
    const refs: Array<{ demo: string; p: string; pending?: boolean }> = [
      { demo: "shadow", p: t.shadow.path, pending: t.shadow.pending },
      ...t.mistakes.map((m, i) => ({
        demo: `mistake[${i}] ${path.basename(m.traceRef.path, ".trace.json")}`,
        p: m.traceRef.path,
        pending: m.traceRef.pending,
      })),
    ];
    for (const r of refs) {
      if (r.pending === true) continue;
      const file = path.join(REPO_ROOT, r.p);
      // A matcher must report what it cannot read: a committed ref with no
      // file is listed, never silently skipped.
      if (!existsSync(file)) {
        unreadable.push(`${t.id} ${r.demo}: ${r.p}`);
        continue;
      }
      const trace = parseScenarioTrace(JSON.parse(readFileSync(file, "utf-8")));
      if (trace === null) {
        unreadable.push(`${t.id} ${r.demo}: unparseable`);
        continue;
      }
      const w = windowedMinRadius(trace.samples, 1.0);
      all.push({
        lesson: t.id,
        family: t.family,
        demo: r.demo,
        reverses: trace.samples.some((s) => s.gear < 0),
        worstRadiusM: Number.isFinite(w.radiusM) ? Math.round(w.radiusM * 1000) / 1000 : 9999,
        atSec: Math.round(w.atSec * 100) / 100,
      });
    }
  }
  const offenders = all
    .filter((r) => r.worstRadiusM < KINEMATIC_CENTRE_RADIUS_M)
    .sort((a, b) => a.lesson.localeCompare(b.lesson) || a.demo.localeCompare(b.demo));
  return {
    all,
    census: {
      limitM: Math.round(KINEMATIC_CENTRE_RADIUS_M * 1000) / 1000,
      windowM: 1.0,
      measured: all.length,
      unreadable,
      offenders,
    },
  };
}

const { census, all } = measureCatalogue();

describe("demo curvature census — every committed demo against the product car's turning limit", () => {
  it("measures the whole catalogue and can read every committed demo", () => {
    expect(census.unreadable).toEqual([]);
    // Every template ships at least its shadow; the census is not a sample.
    expect(census.measured).toBeGreaterThanOrEqual(SCENARIO_TEMPLATES.length);
  });

  it("PINNED: every sc-park-bay-exit-rev demo turns no tighter than the car can", () => {
    const rows = all.filter((r) => r.lesson === "sc-park-bay-exit-rev");
    expect(rows.map((r) => r.demo)).toEqual([
      "shadow",
      "mistake[0] mistake-blind-reverse",
      "mistake[1] mistake-swing-out",
    ]);
    for (const r of rows) expect(r.worstRadiusM, r.demo).toBeGreaterThanOrEqual(KINEMATIC_CENTRE_RADIUS_M);
    expect(census.offenders.filter((r) => r.lesson === "sc-park-bay-exit-rev")).toEqual([]);
  });

  it("REPORTED: the offenders are exactly the committed census (a change here must be looked at)", () => {
    if (WRITE) writeFileSync(CENSUS_FILE, JSON.stringify(census, null, 2) + "\n");
    const pinned = JSON.parse(readFileSync(CENSUS_FILE, "utf-8")) as Census;
    expect(census).toEqual(pinned);
  });
});
