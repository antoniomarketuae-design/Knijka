/**
 * THE LANE-8 GATE — „no lesson may declare a required speed its own tier
 * forbids" (doc 86 §9 lane 8, closing B7 and L17).
 *
 * WHY THIS IS A GATE AND NOT A UNIT TEST. Two separate authorities decide how
 * fast a student can go, and for eight months only one of them was ever
 * checked:
 *
 *   1. the GOVERNOR CAP — `governorCapKmh(tier, domain, required)`, a number in
 *      `difficulty.ts`. This is the one everybody looked at, and it is what
 *      broke `sc-sig-green-wave`: `governorCapKmh("beginner", 50) = 40` against
 *      a wave solved for exactly 50 (B7).
 *   2. the TRACTIVE EQUILIBRIUM — the tier's `throttleMul` scales engine force,
 *      so it silently acts as a SECOND top-speed governor nobody declared. This
 *      is what actually broke `sc-mw-discipline` (L17): the map's domain is 140
 *      and the caps were 130/150, both fine, while the car physically stopped
 *      at 116.7 km/h on Начинаещ against an instruction demanding 120–130.
 *
 * A gate that measured only (1) would have passed the motorway lesson on the
 * day the founder proved it unplayable. So it measures `tierTopSpeedKmh`, the
 * MINIMUM of the two, per tier, per scenario.
 *
 * WHERE „declared required speed" COMES FROM. Two structural sources, no NLP
 * guesswork about which sentence is a requirement:
 *
 *   · the district's own `meta.scenario.wave.speedKmh` — a map whose signal
 *     offsets are solved for a speed REQUIRES that speed;
 *   · an explicit RANGE in the lesson's own Bulgarian copy — «около 120–130
 *     км/ч». A posted limit is never written as a range; a range is always a
 *     target band the student is told to settle into. The lower bound is the
 *     hard requirement (you must be able to enter the band), the upper bound is
 *     reported so a tier that cannot reach the top of its own band is visible.
 *
 * The bare numbers in the copy that are NOT ranges — «ограничението е 140
 * км/ч», «под 50 км/ч» — are deliberately ignored: they are facts about the
 * road and about failure, not instructions to reach a speed.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SCENARIO_TEMPLATES } from "../lessons/scenario";
import {
  DIFFICULTY_ORDER,
  DIFFICULTY_PRESETS,
  governorCapKmh,
  tierFeasibility,
  tierTopSpeedKmh,
  type DifficultyMode,
} from "./difficulty";
import { AERO_DRAG, CHASSIS_LINEAR_DAMPING, CHASSIS_MASS, engineForceAt } from "./tuning";

// ---------------------------------------------------------------------------
// District data
// ---------------------------------------------------------------------------

function worldDir(): string {
  const candidates = [
    path.join(process.cwd(), "content", "world"),
    path.resolve(process.cwd(), "..", "content", "world"),
  ];
  for (const dir of candidates) if (fs.existsSync(dir)) return dir;
  throw new Error(`content/world not found in: ${candidates.join(", ")}`);
}

interface DistrictFacts {
  /** Max edge maxspeed — exactly what LessonScene.maxLegalSpeedOf computes. */
  domainKmh: number | undefined;
  /** meta.scenario.wave.speedKmh, when the map declares one. */
  waveKmh: number | undefined;
}

const DISTRICTS: ReadonlyMap<string, DistrictFacts> = (() => {
  const dir = worldDir();
  const out = new Map<string, DistrictFacts>();
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const doc = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as {
      roads?: { edges?: { maxspeed?: number }[] };
      meta?: { scenario?: { wave?: { speedKmh?: number } } };
    };
    let max = 0;
    for (const e of doc.roads?.edges ?? []) {
      if (typeof e.maxspeed === "number" && Number.isFinite(e.maxspeed) && e.maxspeed > max) {
        max = e.maxspeed;
      }
    }
    const wave = doc.meta?.scenario?.wave?.speedKmh;
    out.set(file.replace(/\.json$/, ""), {
      domainKmh: max > 0 ? max : undefined,
      waveKmh: typeof wave === "number" && Number.isFinite(wave) ? wave : undefined,
    });
  }
  return out;
})();

// ---------------------------------------------------------------------------
// „Declared required speed" extraction
// ---------------------------------------------------------------------------

/** «120–130 км/ч» / «120-130 км/ч» / «120 – 130 km/h» — an explicit band. */
const SPEED_BAND_RE = /(\d{2,3})\s*[–—-]\s*(\d{2,3})\s*(?:км\/ч|km\/h)/g;

interface DeclaredSpeed {
  /** The speed the student MUST be able to hold. */
  requiredKmh: number;
  /** Top of the declared band (=== requiredKmh when a single number). */
  bandTopKmh: number;
  source: string;
}

function declaredSpeedsOf(spec: (typeof SCENARIO_TEMPLATES)[number]): DeclaredSpeed[] {
  const out: DeclaredSpeed[] = [];
  const districtId = spec.map?.districtId;
  const facts = districtId ? DISTRICTS.get(districtId) : undefined;
  if (facts?.waveKmh !== undefined) {
    out.push({
      requiredKmh: facts.waveKmh,
      bandTopKmh: facts.waveKmh,
      source: `${districtId} meta.scenario.wave.speedKmh`,
    });
  }
  const copy = [spec.objectiveBg, ...spec.instructionsBg.map((i) => i.textBg)];
  for (const [index, text] of copy.entries()) {
    SPEED_BAND_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SPEED_BAND_RE.exec(text)) !== null) {
      const lo = Number(m[1]);
      const hi = Number(m[2]);
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) continue;
      out.push({
        requiredKmh: lo,
        bandTopKmh: hi,
        source: index === 0 ? "objectiveBg" : `instruction ${index}`,
      });
    }
  }
  return out;
}

interface Finding extends DeclaredSpeed {
  templateId: string;
  districtId: string | undefined;
  domainKmh: number | undefined;
  mode: DifficultyMode;
  capKmh: number | null;
  topSpeedKmh: number;
}

function sweep(): { infeasible: Finding[]; bandTopShort: Finding[]; declared: number } {
  const infeasible: Finding[] = [];
  const bandTopShort: Finding[] = [];
  let declared = 0;
  for (const spec of SCENARIO_TEMPLATES) {
    const districtId = spec.map?.districtId;
    const domainKmh = districtId ? DISTRICTS.get(districtId)?.domainKmh : undefined;
    for (const d of declaredSpeedsOf(spec)) {
      declared++;
      for (const mode of DIFFICULTY_ORDER) {
        const f = tierFeasibility(mode, d.requiredKmh, domainKmh);
        const row: Finding = {
          ...d,
          templateId: spec.id,
          districtId,
          domainKmh,
          mode,
          capKmh: f.capKmh,
          topSpeedKmh: f.topSpeedKmh,
        };
        if (!f.feasible) infeasible.push(row);
        else if (f.topSpeedKmh < d.bandTopKmh) bandTopShort.push(row);
      }
    }
  }
  return { infeasible, bandTopShort, declared };
}

function render(rows: Finding[]): string {
  return rows
    .map(
      (r) =>
        `  ${r.templateId} [${r.mode}] on ${r.districtId ?? "?"} (domain ${r.domainKmh ?? "?"}): ` +
        `needs ${r.requiredKmh}–${r.bandTopKmh} km/h (${r.source}), ` +
        `cap ${r.capKmh ?? "none"}, sustainable ${r.topSpeedKmh}`,
    )
    .join("\n");
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

describe("tier feasibility — no lesson requires a speed its own tier forbids", () => {
  const result = sweep();

  it("the sweep actually found the declarations it is supposed to police", () => {
    // Today: sig-wave-v1's wave (B7) + sc-mw-discipline's «120–130» band twice
    // (objectiveBg and instruction 2). If this drops to zero the extractor has
    // silently stopped matching and the gate below would pass vacuously.
    expect(result.declared).toBeGreaterThanOrEqual(3);
  });

  it("every tier can hold every speed its lessons require", () => {
    expect(render(result.infeasible)).toBe("");
  });

  /**
   * FR-50 / founder item 37 — „the motorway car must reach 160–180 km/h".
   *
   * THE PREVIOUS VERSION OF THIS TEST PINNED THE DEFECT AT 129.2 km/h and said
   * the fix belonged to `vehicle/tuning.ts`. It has been made, so this test
   * flips from "report the shortfall honestly" to "hold the fix in place".
   *
   * ⚠ AND THE FIRST ATTEMPT AT IT PASSED THIS TEST WITH A CAR THAT COULD NOT DO
   * IT. `tierTopSpeedKmh` said 178.5 km/h; the real rapier car, driven flat out
   * on the headless harness rig, topped out at 143.6. The solver modelled
   * `ROLLING_RESISTANCE_N` (which VehicleSim applies ONLY on the closed-throttle
   * branch, so never at full pedal) and did not model `CHASSIS_LINEAR_DAMPING`
   * (which it always applies, and which is worth 1152 N at 47 m/s — more than
   * aero). A gate and the thing it gates disagreed by 35 km/h and the gate was
   * green. Both terms are corrected in difficulty.ts; the numbers below are now
   * cross-checked against the rig rather than trusted.
   *
   * MEASURED ON THE RIG (rapier + VehicleSim, flat, full pedal, no governor):
   *   before → terminal 120.3 km/h · 0–100 11.57 s · 0–120 35.45 s · 0–130 NEVER
   *   after  → terminal 168.4 km/h · 0–100 11.57 s · 0–130 22.7 s · 0–160 50.4 s
   *   solver after → 168.3 km/h. Rig and model now agree to 0.1 km/h.
   * Acceleration at 30 / 50 / 90 km/h is 3.743 / 2.936 / 1.418 m/s² — the same
   * three numbers, to three decimals, as before the change.
   *
   * The old solver said 129.2 for that same before-car. It was never right; it
   * was 8.9 km/h optimistic on the OLD curve too, and nobody had checked.
   *
   * Second consequence, and it matters more than the number: on `mw-v1` the
   * posted limit is 140, so SPEEDING_OVER_LIMIT arms at 154 km/h. It used to be
   * STRUCTURALLY UNCOMMITTABLE at every tier — an unfailable trap, which the
   * 2026-07-19 default-tier ruling forbids. On Напреднал it is now committable.
   *
   * TWO RESIDUALS, stated rather than hidden:
   *  · `sc-mw-discipline` names «около 120–130 км/ч» and Начинаещ tops out just
   *    under 130 — but that is the GOVERNOR (cap 130, ramped down across the
   *    last 10 km/h by construction), not the engine. The beginner tier holding
   *    a beginner back is the tier's whole job. The next test makes that claim
   *    checkable: a residual shortfall must be capped, never traction-bound.
   *  · THE ROAD, NOT THE CAR, IS NOW THE LIMIT. `mw-v1` is 1006 m long and every
   *    lesson spawns at rest, so a standing-start run reaches 147.6 km/h by the
   *    end of the segment (measured). Seeing 160+ needs ~1.7 km of motorway.
   *    That is map data — content/world/mw-v1.json, generated by
   *    tools/maps/gen_motorway.mjs with lengthM: 1000 — and is NOT this file's
   *    to change. Reported, not silently absorbed.
   */
  it("FR-50 — the motorway car reaches the founder's 160–180 km/h band", () => {
    // The physics ceiling with no governor in the way. Pinned so a future
    // tuning change moves this line rather than hiding behind it.
    const uncapped = tierTopSpeedKmh("advanced", 140);
    expect(uncapped).toBeGreaterThanOrEqual(160);
    expect(uncapped).toBeLessThanOrEqual(180);
    expect(uncapped).toBeCloseTo(168.3, 1);
    // …and the motorway speeding fault is now committable, so the lesson that
    // teaches speed discipline can actually be failed by ignoring it.
    expect(uncapped).toBeGreaterThan(140 * 1.1);
  });

  /**
   * THE ASSERTION THAT WOULD HAVE CAUGHT THE FIRST ATTEMPT.
   *
   * The feasibility solver is only worth running if it describes the car the
   * student actually drives. This pins its resistance model against the FIVE
   * points measured on the headless rapier rig at full pedal (rig newtons, from
   * F − m·a): 30 → 226 · 50 → 414 · 90 → 869 · 130 → 1428 · 143.6 → 1630.
   *
   * Re-measure with the rig, not with this model, if you change AERO_DRAG,
   * CHASSIS_LINEAR_DAMPING, CHASSIS_MASS or the aero code in VehicleSim.
   */
  it("FR-50 — the solver's resistance model matches the measured rig", () => {
    const RIG_NEWTONS: ReadonlyArray<readonly [number, number]> = [
      [30, 226],
      [50, 414],
      [90, 869],
      [130, 1428],
      [143.6, 1630],
    ];
    for (const [kmh, rigN] of RIG_NEWTONS) {
      const ms = kmh / 3.6;
      const model = AERO_DRAG * ms * ms + CHASSIS_LINEAR_DAMPING * CHASSIS_MASS * ms;
      const errPct = Math.abs(model - rigN) / rigN;
      expect(errPct, `${kmh} km/h: model ${model.toFixed(0)} N vs rig ${rigN} N`).toBeLessThan(0.04);
    }
    // The term that was missing is not a rounding detail — at motorway speed it
    // is the LARGER half of the drag. If this ever stops being true the comment
    // in tuning.ts calling it "near zero" becomes right and this can go.
    const ms = 170 / 3.6;
    expect(CHASSIS_LINEAR_DAMPING * CHASSIS_MASS * ms).toBeGreaterThan(AERO_DRAG * ms * ms);
  });

  it("band tops: every residual shortfall is the governor, never the engine", () => {
    const shortTemplates = [...new Set(result.bandTopShort.map((r) => r.templateId))].sort();
    expect(shortTemplates).toEqual(["sc-mw-discipline"]);
    for (const row of result.bandTopShort) {
      // A capped tier may fall short of a band TOP — that is the ladder. It may
      // not fall short by a lot, and the uncapped tier may not fall short at all.
      expect(
        row.capKmh,
        `${row.templateId} [${row.mode}] is short with NO governor cap — that is the engine, not the ladder`,
      ).not.toBeNull();
      expect(
        row.bandTopKmh - row.topSpeedKmh,
        `${row.templateId} [${row.mode}] is ${(row.bandTopKmh - row.topSpeedKmh).toFixed(1)} km/h short`,
      ).toBeLessThanOrEqual(5);
    }
  });

  /**
   * The one thing the engine change must NOT have done: move the low-speed
   * feel every parking, crawl and urban drill is tuned against. The curve is
   * ARITHMETICALLY identical to the old one at every speed up to 100 km/h (the
   * new breakpoint sits exactly on the old 90→120 chord), so this is an
   * exact claim, not an approximation — asserted at the speeds drills live at.
   * Cross-checked on the rig: acceleration at 30 / 50 / 90 km/h measured
   * 3.743 / 2.936 / 1.418 m/s² both before and after the change.
   */
  it("FR-50 — nothing at or below 100 km/h moved", () => {
    const UNCHANGED: ReadonlyArray<readonly [number, number]> = [
      [0, 4800],
      [5, 4800],
      [15, 4800], // full-lock parking band
      [30, 4800], // end of the flat torque plateau
      [50, 4000],
      [60, 3600],
      [90, 2600], // the power peak
      [95, 2600 - 1300 / 6], // mid-chord: the new [100, 6500/3] point keeps the
      [100, 6500 / 3], // old 90→120 chord exactly, so 0–100 is unchanged
    ];
    for (const [kmh, newtons] of UNCHANGED) {
      // Exact at the curve's own breakpoints; the interpolated mid-chord point
      // agrees to ~1e-13 N (double rounding on a different chord, not a
      // different force). Both are asserted, and the tolerance is a nanonewton
      // rather than a comfortable epsilon so a REAL change cannot hide in it.
      expect(engineForceAt(kmh) - newtons, `${kmh} km/h`).toBeLessThan(1e-9);
      expect(newtons - engineForceAt(kmh), `${kmh} km/h`).toBeLessThan(1e-9);
    }
  });

  it("B7 — sc-sig-green-wave is winnable on Начинаещ", () => {
    const facts = DISTRICTS.get("sig-wave-v1");
    expect(facts?.domainKmh).toBe(50);
    expect(facts?.waveKmh).toBe(50);
    // Before this lane: cap 40, sustainable 39.1 — a 264 m block took 23.8 s
    // against the 19.01 s the lamps are solved for, so the phase slipped
    // ~4.8 s per block and the 2nd and 3rd greens were unreachable.
    expect(governorCapKmh("beginner", 50)).toBe(40);
    // After: the lesson's own required speed floors the cap.
    expect(governorCapKmh("beginner", 50, 50)).toBe(56);
    expect(tierTopSpeedKmh("beginner", 50, 50)).toBeGreaterThanOrEqual(50);
    // …with real throttle authority AT 50, not a throttle already cut to zero.
    expect(tierFeasibility("beginner", 50, 50).blockedBy).toBe("none");
  });

  it("L17 — the motorway band 120–130 is reachable on every tier", () => {
    expect(DISTRICTS.get("mw-v1")?.domainKmh).toBe(140);
    for (const mode of DIFFICULTY_ORDER) {
      expect(tierTopSpeedKmh(mode, 140)).toBeGreaterThanOrEqual(120);
    }
    // The measured regression this pins: on Начинаещ the cap was NEVER the
    // problem (130, well above the band) — the 0.5 throttle multiplier was,
    // and it stopped the car at 116.7 km/h. The multiplier now fades out above
    // the motorway band, so the governor is the only ceiling left.
    expect(governorCapKmh("beginner", 140)).toBe(130);
    expect(tierTopSpeedKmh("beginner", 140)).toBeGreaterThan(120);
  });

  it("L17 — item 5: Нормален never governs below the in-town limit", () => {
    // The four lot-* districts publish a 20 km/h domain: 20 + 10 collapsed onto
    // the old floor of 30, so Нормален and Начинаещ were BOTH 30 and the tier
    // selector did nothing. That is the „I can only go up to 30 km/h" report.
    expect(governorCapKmh("normal", 20)).toBe(50);
    expect(governorCapKmh("normal", 30)).toBe(50);
    // Начинаещ keeps its maneuvering floor — the crawl bands depend on it.
    expect(governorCapKmh("beginner", 20)).toBe(30);
    expect(governorCapKmh("beginner", 30)).toBe(30);
    // …and the tiers are distinguishable again on every low-limit map.
    expect(governorCapKmh("normal", 20)).toBeGreaterThan(governorCapKmh("beginner", 20)!);
  });

  it("the urban catalog is untouched — 60 of 90 districts are a 50 domain", () => {
    expect(governorCapKmh("normal", 50)).toBe(60);
    expect(governorCapKmh("beginner", 50)).toBe(40);
    expect(governorCapKmh("normal", 40)).toBe(50);
    expect(governorCapKmh("beginner", 40)).toBe(30);
    expect(governorCapKmh("normal", 90)).toBe(100);
    expect(governorCapKmh("beginner", 90)).toBe(80);
    // Every non-motorway domain's Нормален cap is at or below the speed where
    // the throttle-authority fade begins, so the fade cannot touch them.
    for (const domain of [20, 30, 40, 50, 70, 90]) {
      expect(governorCapKmh("normal", domain)!).toBeLessThanOrEqual(100);
    }
  });

  it("the presets still order beginner < normal < advanced everywhere", () => {
    for (const domain of [20, 30, 40, 50, 70, 90, 140]) {
      const b = tierTopSpeedKmh("beginner", domain);
      const n = tierTopSpeedKmh("normal", domain);
      const a = tierTopSpeedKmh("advanced", domain);
      expect(b).toBeLessThanOrEqual(n);
      expect(n).toBeLessThanOrEqual(a);
    }
    expect(DIFFICULTY_PRESETS.advanced.speedCapKmh).toBeNull();
  });
});
