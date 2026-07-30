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
   * THE ONE PINNED RESIDUAL, and it is NOT in this lane's files.
   *
   * `sc-mw-discipline` names the band «около 120–130 км/ч». After this lane the
   * BOTTOM of that band is reachable on all three tiers (the hard gate above),
   * but the TOP is not, on any tier — including Напреднал, which has no cap at
   * all. The ceiling is `ENGINE_FORCE_CURVE` in `vehicle/tuning.ts`: it reaches
   * zero tractive force at 145 km/h and the drag/rolling equilibrium against it
   * lands at **129.2 km/h with a completely unshaped throttle**. No governor
   * change can move that number, and `tuning.ts` is guarded by the physics CI
   * harness and belongs to no lane in doc 86 §9 — so it is reported here with
   * the measurement rather than silently re-baselined or silently widened.
   *
   * The same ceiling has a second, larger consequence worth stating: on
   * `mw-v1` the posted limit is 140, so SPEEDING_OVER_LIMIT (limit × 1.1 = 154)
   * is **structurally uncommittable on the motorway at every tier** — the exact
   * "unfailable trap" the 2026-07-19 default-tier ruling exists to forbid.
   * Founder item 37 asks for 160–180 km/h; that is the change that delivers it.
   *
   * This test is a tripwire, not an excuse: exactly one template may be short,
   * by at most 5 km/h. A second one, or a bigger gap, is a failure.
   */
  it("band tops: exactly one pinned shortfall, owned by tuning.ts not by this lane", () => {
    const shortTemplates = [...new Set(result.bandTopShort.map((r) => r.templateId))].sort();
    expect(shortTemplates).toEqual(["sc-mw-discipline"]);
    for (const row of result.bandTopShort) {
      expect(
        row.bandTopKmh - row.topSpeedKmh,
        `${row.templateId} [${row.mode}] is ${(row.bandTopKmh - row.topSpeedKmh).toFixed(1)} km/h short`,
      ).toBeLessThanOrEqual(5);
    }
    // The uncapped tier's number IS the physics ceiling — pinned so a future
    // tuning change makes this line move rather than hide.
    expect(tierTopSpeedKmh("advanced", 140)).toBeCloseTo(129.2, 1);
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
