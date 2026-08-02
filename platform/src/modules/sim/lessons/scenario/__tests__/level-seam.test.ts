/**
 * THE LEVEL SEAM — doc 86 L13 + D7, lane 12.
 *
 * The founder played 50 of the 155 shipped scenarios and wrote „L2 L3 L4 L5
 * They have Nothing More" and „L5 is completely dead". Measured against the
 * tree on 2026-07-30, before this lane: **146 of 155 templates compiled two
 * rungs to a byte-identical LessonSpec** — L1≡L2 on 146, L2≡L3 on 145, L1≡L3
 * on 145 — because an empty rung `{ level: n }` contributed nothing but the
 * aid table, and only 21 of 669 rungs authored a `toleranceScale`.
 *
 * This file is the proof that the seam holds, and — just as important — that
 * it holds WITHOUT making a single lesson harder to finish. Doc 86's B3/B5
 * band is 50 terminal radii already below the 8.125 m lane pitch and 127
 * scenarios carrying an unrecoverable speed-capped waypoint; a difficulty
 * ladder that shrank those would have added to that pile. So every assertion
 * below about the ladder has a matching assertion that the ladder only ever
 * gives the student MORE room, never less.
 */
import { describe, expect, it } from "vitest";
import { parseObjectiveParams, REACH_ZONE_GRACE_M, REACH_ZONE_HALT_CAP_KMH } from "../../objectives";
import {
  DEFAULT_LEVEL_PAR_TIME_SCALE,
  DEFAULT_LEVEL_TOLERANCE,
  DEFAULT_LEVEL_TRAFFIC_SCALE,
  SCENARIO_FAMILY_TRAFFIC_BASELINE,
  ScenarioCompileError,
  compileScenario,
  resolveScenarioRubric,
} from "../compile";
import { SPEED_CAP_GRACE_KMH_PER_TOLERANCE } from "../params";
import { SCENARIO_TEMPLATES } from "../templates";
import { SC_PARK_PERP_REV } from "../templates";
import type { ScenarioLevel, ScenarioSpec } from "../types";

const clone = (): ScenarioSpec => JSON.parse(JSON.stringify(SC_PARK_PERP_REV)) as ScenarioSpec;

/** The compiled lesson stripped of the three fields doc 86 S4 excludes: a
 *  ladder made of ids, titles and AIDS is exactly the ladder he complained
 *  about, so none of them may count as a rung difference. */
const S4_IGNORED = new Set(["id", "titleBg", "aids"]);
function fingerprint(spec: ScenarioSpec, level: ScenarioLevel): string {
  const lesson = compileScenario(spec, level) as unknown as Record<string, unknown>;
  const graded: Record<string, unknown> = {};
  for (const k of Object.keys(lesson).sort()) if (!S4_IGNORED.has(k)) graded[k] = lesson[k];
  return JSON.stringify(graded);
}

/**
 * Rungs that still collide, with the lane that owns the file. Doc 86 §9 gives
 * per-family rung authoring to lane 13 (`templates-rail.ts` among them) —
 * lane 12 owns the SEAM, not the content poured into it. The entry names the
 * exact defect so the owning lane can delete this line in the same commit
 * that fixes it.
 */
const S4_ALLOWLIST = new Map<string, string>([
  [
    "sc-rx-barrier-drop",
    "templates-rail.ts:443 authors a bare `{ level: 5 }` next to a bare " +
      "`{ level: 3 }` — a dead L5 with no complication at all (doc 86 L13, " +
      "lane 13 owns templates-rail.ts)",
  ],
]);

type Waypoint = { x: number; y: number; radiusM: number; maxSpeedKmh?: number };

const authoredWaypoints = (spec: ScenarioSpec): Array<Waypoint | null> =>
  spec.success.map((o) =>
    o.params.kind === "reachZone"
      ? { x: o.params.x, y: o.params.y, radiusM: o.params.radiusM, maxSpeedKmh: o.params.maxSpeedKmh }
      : o.params.kind === "passSignal"
        ? { x: o.params.x, y: o.params.y, radiusM: o.params.radiusM }
        : null,
  );

const compiledWaypoints = (spec: ScenarioSpec, level: ScenarioLevel): Array<Waypoint | null> =>
  compileScenario(spec, level).objectives.map((o) =>
    o.kind === "reachZone" || o.kind === "passSignal"
      ? {
          x: o.params.x as number,
          y: o.params.y as number,
          radiusM: o.params.radiusM as number,
          maxSpeedKmh: o.params.maxSpeedKmh as number | undefined,
        }
      : null,
  );

// ---------------------------------------------------------------------------
// S4 — a rung must MEAN something
// ---------------------------------------------------------------------------

describe("S4 rung distinctness — the founder's „L2 L3 L4 L5 have nothing more\"", () => {
  it("no two authored rungs of a template compile to the same lesson", () => {
    const colliding: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      const prints = spec.levels.map((l) => ({ level: l.level, f: fingerprint(spec, l.level) }));
      for (let i = 0; i < prints.length; i += 1) {
        for (let j = i + 1; j < prints.length; j += 1) {
          if (prints[i].f === prints[j].f) {
            colliding.push(`${spec.id} L${prints[i].level}≡L${prints[j].level}`);
          }
        }
      }
    }
    const undocumented = colliding.filter((c) => !S4_ALLOWLIST.has(c.split(" ")[0]));
    expect(undocumented, undocumented.join("\n")).toEqual([]);
    // The allowlist is the whole residual: 1 colliding pair, down from 439
    // pairs across 146 scenarios (L1≡L2 ×146, L1≡L3 ×145, L2≡L3 ×145, plus
    // three L5 duplicates) measured on the same tree before the ladder landed.
    expect(colliding.length).toBeLessThanOrEqual(S4_ALLOWLIST.size);
  });

  it("L1, L2 and L3 are three different lessons on EVERY template — the exact complaint", () => {
    const same: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      const rungs = spec.levels.map((l) => l.level).filter((l) => l <= 3);
      for (let i = 0; i < rungs.length; i += 1) {
        for (let j = i + 1; j < rungs.length; j += 1) {
          if (fingerprint(spec, rungs[i]) === fingerprint(spec, rungs[j])) {
            same.push(`${spec.id} L${rungs[i]}≡L${rungs[j]}`);
          }
        }
      }
    }
    expect(same, same.join("\n")).toEqual([]);
  });

  it("the ladder is the difference — not the aid table", () => {
    // Strip the tolerance ladder back to a flat 1.0 and the collapse returns:
    // proof that what makes the rungs distinct is a graded parameter, not the
    // shadow car and the ribbon.
    const flat = clone();
    for (const l of flat.levels) l.toleranceScale = 1;
    expect(fingerprint(flat, 1)).toBe(fingerprint(flat, 2));
    expect(fingerprint(SC_PARK_PERP_REV, 1)).not.toBe(fingerprint(SC_PARK_PERP_REV, 2));
  });
});

// ---------------------------------------------------------------------------
// WIDEN-ONLY — a harder rung is harder to drive well, never harder to finish
// ---------------------------------------------------------------------------

describe("the ladder never shrinks a waypoint (doc 86 B3/B4/B5)", () => {
  it("every compiled radius and speed cap is >= the authored one, on every rung", () => {
    const shrunk: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      const authored = authoredWaypoints(spec);
      for (const rung of spec.levels) {
        const built = compiledWaypoints(spec, rung.level);
        for (let i = 0; i < authored.length; i += 1) {
          const a = authored[i];
          const b = built[i];
          if (!a || !b) continue;
          if (b.radiusM < a.radiusM - 1e-9) {
            shrunk.push(`${spec.id}@L${rung.level} obj${i}: radius ${a.radiusM} → ${b.radiusM}`);
          }
          if (a.maxSpeedKmh !== undefined && (b.maxSpeedKmh ?? 0) < a.maxSpeedKmh - 1e-9) {
            shrunk.push(`${spec.id}@L${rung.level} obj${i}: cap ${a.maxSpeedKmh} → ${b.maxSpeedKmh}`);
          }
        }
      }
    }
    expect(shrunk, shrunk.join("\n")).toEqual([]);
  });

  it("the widening is bounded by the grace the evaluator already grants", () => {
    const over: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      const authored = authoredWaypoints(spec);
      for (const rung of spec.levels) {
        const built = compiledWaypoints(spec, rung.level);
        for (let i = 0; i < authored.length; i += 1) {
          const a = authored[i];
          const b = built[i];
          if (!a || !b) continue;
          if (b.radiusM - a.radiusM > REACH_ZONE_GRACE_M + 1e-9) {
            over.push(`${spec.id}@L${rung.level} obj${i}: +${(b.radiusM - a.radiusM).toFixed(2)} m`);
          }
          if (a.maxSpeedKmh !== undefined) {
            const grace = (b.maxSpeedKmh ?? 0) - a.maxSpeedKmh;
            // 10 km/h per unit of tolerance, and the richest rung is 1.5 →
            // never more than the engine's own speedingGraceMaxKmh of 5.
            if (grace > SPEED_CAP_GRACE_KMH_PER_TOLERANCE * 0.5 + 1e-9) {
              over.push(`${spec.id}@L${rung.level} obj${i}: +${grace.toFixed(1)} km/h`);
            }
          }
        }
      }
    }
    expect(over, over.join("\n")).toEqual([]);
  });

  it("«спри» means спри on every rung — a halt demand is never widened", () => {
    const loosened: string[] = [];
    let haltGates = 0;
    for (const spec of SCENARIO_TEMPLATES) {
      const authored = authoredWaypoints(spec);
      for (let i = 0; i < authored.length; i += 1) {
        const a = authored[i];
        if (!a || a.maxSpeedKmh === undefined || a.maxSpeedKmh > REACH_ZONE_HALT_CAP_KMH) continue;
        haltGates += 1;
        for (const rung of spec.levels) {
          const b = compiledWaypoints(spec, rung.level)[i]!;
          if (b.maxSpeedKmh !== a.maxSpeedKmh) {
            loosened.push(`${spec.id}@L${rung.level} obj${i}: ${a.maxSpeedKmh} → ${b.maxSpeedKmh}`);
          }
        }
      }
    }
    expect(loosened, loosened.join("\n")).toEqual([]);
    // 42 halt gates in the catalog; every one of them reads the same at L1 as
    // at L4, so widening can never strip stepReachZone's approach capsule.
    expect(haltGates).toBeGreaterThanOrEqual(40);
  });

  it("a forgiving rung never merges two consecutive gates into one", () => {
    // Objectives are strictly sequential: a zone that already contains the car
    // when its predecessor completes is a graded gate the student never drove.
    const merged: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (let i = 0; i + 1 < spec.success.length; i += 1) {
        const pa = spec.success[i].params;
        const pb = spec.success[i + 1].params;
        if (pa.kind !== "reachZone" || pb.kind !== "reachZone") continue;
        const d = Math.hypot(pb.x - pa.x, pb.y - pa.y);
        if (d - pa.radiusM - pb.radiusM < 0) continue; // already overlapping as authored
        for (const rung of spec.levels) {
          const built = compiledWaypoints(spec, rung.level);
          const ra = built[i]!.radiusM;
          const rb = built[i + 1]!.radiusM;
          if (d - ra - rb < -1e-9) {
            merged.push(
              `${spec.id}@L${rung.level} ${spec.success[i].id}(r${ra}) + ` +
                `${spec.success[i + 1].id}(r${rb}) overlap at d=${d.toFixed(2)} m`,
            );
          }
        }
      }
    }
    expect(merged, merged.join("\n")).toEqual([]);
  });

  it("every compiled objective still round-trips the real parser, on every rung", () => {
    const bad: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (const rung of spec.levels) {
        for (const o of compileScenario(spec, rung.level).objectives) {
          try {
            parseObjectiveParams(o);
          } catch (e) {
            bad.push(`${spec.id}@L${rung.level} ${o.id}: ${(e as Error).message}`);
          }
        }
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The ladder tables themselves
// ---------------------------------------------------------------------------

describe("DEFAULT_LEVEL_TOLERANCE", () => {
  it("matches the convention the hand-authored rungs already use", () => {
    expect(DEFAULT_LEVEL_TOLERANCE).toEqual({ 1: 1.5, 2: 1.25, 3: 1, 4: 1, 5: 1 });
    // sc-park-perp-rev authored 1.5/1.25 by hand long before the ladder; the
    // ladder must reproduce it exactly or the 21 authored rungs would move.
    expect(compileScenario(SC_PARK_PERP_REV, 1).objectives[1].params.centerTolM).toBe(0.75);
    expect(compileScenario(SC_PARK_PERP_REV, 3).objectives[1].params.centerTolM).toBe(0.5);
  });

  it("an authored toleranceScale still wins over the ladder", () => {
    const s = clone();
    s.levels[0].toleranceScale = 1;
    expect(compileScenario(s, 1).objectives[1].params.centerTolM).toBe(0.5);
  });

  it("gives a silent rung a real waypoint delta", () => {
    const s = clone();
    for (const l of s.levels) delete l.toleranceScale;
    // The P0's pull-past gate is r = 5 since doc 87 B3/B10 turned it from a
    // 14 m drive-by window into the at-rest gate its instructions describe.
    const r = (lv: ScenarioLevel) => compileScenario(s, lv).objectives[0].params.radiusM;
    expect(r(1)).toBe(7.5); // 5 × 1.5
    expect(r(2)).toBe(6.25); // 5 × 1.25
    expect(r(3)).toBe(5);
    expect(r(4)).toBe(5);
  });

  it("a maneuver tolerance still scales BOTH ways — that is real difficulty", () => {
    const s = clone();
    s.levels[3].toleranceScale = 0.6;
    expect(compileScenario(s, 4).objectives[1].params.centerTolM).toBe(0.3);
    // …while the waypoint on the same rung refuses to shrink.
    expect(compileScenario(s, 4).objectives[0].params.radiusM).toBe(5);
  });
});

describe("DEFAULT_LEVEL_TRAFFIC_SCALE", () => {
  it("no baseline and no family baseline stays zero — cars are never conjured", () => {
    for (const spec of SCENARIO_TEMPLATES) {
      if (spec.traffic !== undefined) continue;
      // doc 87 FR-27: the families whose whole subject is other road users now
      // carry a measured street (SCENARIO_FAMILY_TRAFFIC_BASELINE); everything
      // else — parking, полигон, the cockpit drills — is still a quiet map.
      if (SCENARIO_FAMILY_TRAFFIC_BASELINE[spec.family] !== undefined) continue;
      for (const rung of spec.levels) {
        const t = compileScenario(spec, rung.level).traffic!;
        expect(t.vehicleCount, `${spec.id}@L${rung.level}`).toBe(rung.traffic?.vehicleCount ?? 0);
        expect(t.pedestrianCount, `${spec.id}@L${rung.level}`).toBe(
          rung.traffic?.pedestrianCount ?? 0,
        );
      }
    }
  });

  /**
   * FR-27, the founder's items 8/15/17/18 („by the time I reach the crossroad
   * it already has passed"). The street itself is the fix, so it is pinned
   * here: a yielding lesson that authors nothing must still be set on a road
   * with traffic on it, and the rung must change how much.
   */
  it("the yielding families are set on a street, and the ladder scales it", () => {
    const laddered = { 1: 0.5, 2: 0.75, 3: 1, 4: 1, 5: 1.5 } as const;
    let checked = 0;
    for (const spec of SCENARIO_TEMPLATES) {
      const base = SCENARIO_FAMILY_TRAFFIC_BASELINE[spec.family];
      if (base === undefined || spec.traffic !== undefined) continue;
      for (const rung of spec.levels) {
        if (rung.traffic?.vehicleCount !== undefined) continue;
        const t = compileScenario(spec, rung.level).traffic!;
        expect(t.vehicleCount, `${spec.id}@L${rung.level}`).toBe(
          Math.round(base * laddered[rung.level]),
        );
        // Never pedestrians by implication — a junction drill must not arm a
        // crossing duty its copy never names.
        expect(t.pedestrianCount, `${spec.id}@L${rung.level}`).toBe(0);
        checked++;
      }
    }
    // Guard against the check silently emptying out if a family is renamed.
    expect(checked).toBeGreaterThan(50);
  });

  it("the roundabout family is deliberately NOT given traffic (measured gridlock)", () => {
    // On rb-mini-v1 two ambient cars already spend 68–75% of their time
    // stopped at 5–7 km/h: the ring jams instead of circulating. An empty
    // roundabout is a defect; a jammed one is a worse defect. See the doc on
    // SCENARIO_FAMILY_TRAFFIC_BASELINE.
    expect(SCENARIO_FAMILY_TRAFFIC_BASELINE.roundabout).toBeUndefined();
    for (const spec of SCENARIO_TEMPLATES) {
      if (spec.family !== "roundabout" || spec.traffic !== undefined) continue;
      for (const rung of spec.levels) {
        if (rung.traffic?.vehicleCount !== undefined) continue;
        expect(compileScenario(spec, rung.level).traffic!.vehicleCount, spec.id).toBe(0);
      }
    }
  });

  it("scales a template's authored baseline across the rungs", () => {
    expect(DEFAULT_LEVEL_TRAFFIC_SCALE).toEqual({ 1: 0.5, 2: 0.75, 3: 1, 4: 1, 5: 1.5 });
    const s = clone();
    s.traffic = { vehicleCount: 4, pedestrianCount: 6, anchorRadiusM: 250 };
    // The P0 ships its own L5 now (doc 87 B2), so REPLACE it with a silent
    // rung — this test is about what the ladder derives when nothing is said.
    s.levels = [...s.levels.filter((l) => l.level !== 5), { level: 5 }];
    const v = (lv: ScenarioLevel) => compileScenario(s, lv).traffic!;
    expect(v(1)).toEqual({ vehicleCount: 2, pedestrianCount: 3, anchorRadiusM: 250 });
    expect(v(2)).toEqual({ vehicleCount: 3, pedestrianCount: 5, anchorRadiusM: 250 });
    expect(v(3)).toEqual({ vehicleCount: 4, pedestrianCount: 6, anchorRadiusM: 250 });
    expect(v(5)).toEqual({ vehicleCount: 6, pedestrianCount: 9, anchorRadiusM: 250 });
  });

  it("a rung's explicit traffic is the author's final word", () => {
    const s = clone();
    s.traffic = { vehicleCount: 4 };
    s.levels[0].traffic = { vehicleCount: 0 };
    expect(compileScenario(s, 1).traffic!.vehicleCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// D7 — the rubric can finally vary by rung
// ---------------------------------------------------------------------------

describe("resolveScenarioRubric (doc 86 D7)", () => {
  it("merges the rung's rubric PER KEY over the template's", () => {
    const s = clone();
    s.rubric = { parTimeSec: 100, placement: { objectiveId: s.success[1].id } };
    s.levels[3].rubric = {
      economy: { objectiveId: s.success[1].id, attemptsFor3Stars: 1, attemptsFor2Stars: 2 },
      parTimeSec: 80,
    };
    const l4 = resolveScenarioRubric(s, 4)!;
    expect(l4.placement).toEqual({ objectiveId: s.success[1].id }); // inherited
    expect(l4.economy).toEqual({
      objectiveId: s.success[1].id,
      attemptsFor3Stars: 1,
      attemptsFor2Stars: 2,
    }); // added by the rung
    expect(l4.parTimeSec).toBe(80); // the rung's own par, ladder not applied
    // …and the rung below is untouched by any of it.
    expect(resolveScenarioRubric(s, 3)!.economy).toBeUndefined();
  });

  it("applies the par-time ladder only where the rung is silent", () => {
    expect(DEFAULT_LEVEL_PAR_TIME_SCALE).toEqual({ 1: 1.35, 2: 1.2, 3: 1, 4: 1, 5: 1.15 });
    const s = clone();
    s.rubric = { parTimeSec: 100 };
    expect(resolveScenarioRubric(s, 1)!.parTimeSec).toBe(135);
    expect(resolveScenarioRubric(s, 2)!.parTimeSec).toBe(120);
    expect(resolveScenarioRubric(s, 3)!.parTimeSec).toBe(100);
    expect(resolveScenarioRubric(s, 4)!.parTimeSec).toBe(100);
  });

  it("the 128 parTimeSec-only rubrics now differ between rungs", () => {
    // Before the seam, scoreRubric read one immutable `spec.rubric` for every
    // rung of every scenario, so ZERO scenarios could vary — by construction,
    // not by omission. Today 150 of 150 do; the only rubric allowed to read
    // the same on every rung is one with nothing laddered to vary.
    let varying = 0;
    const stillFlat: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      if (!spec.rubric && !spec.levels.some((l) => l.rubric)) continue;
      const seen = new Set(
        spec.levels.map((l) => JSON.stringify(resolveScenarioRubric(spec, l.level))),
      );
      if (seen.size > 1) varying += 1;
      else if (resolveScenarioRubric(spec, spec.levels[0].level)?.parTimeSec !== undefined) {
        stillFlat.push(spec.id);
      }
    }
    expect(stillFlat, stillFlat.join(", ")).toEqual([]);
    expect(varying).toBeGreaterThanOrEqual(150);
  });

  it("returns undefined only when neither the template nor the rung has one", () => {
    const s = clone();
    delete s.rubric;
    expect(resolveScenarioRubric(s, 1)).toBeUndefined();
    s.levels[0].rubric = { parTimeSec: 42 };
    expect(resolveScenarioRubric(s, 1)).toEqual({ parTimeSec: 42 });
  });

  it("refuses a level the template does not author, exactly like compileScenario", () => {
    // The P0 authors L1..L5 since doc 87 B2, so the unauthored rung has to be
    // made rather than borrowed.
    const noL5 = clone();
    noL5.levels = noL5.levels.filter((l) => l.level !== 5);
    expect(() => resolveScenarioRubric(noL5, 5)).toThrow(ScenarioCompileError);
  });

  it("a rubric pointing at a missing objective is a loud compile error, not a silent 0", () => {
    const s = clone();
    s.levels[2].rubric = { placement: { objectiveId: "sc-does-not-exist" } };
    expect(() => compileScenario(s, 3)).toThrow(ScenarioCompileError);
    expect(() => compileScenario(s, 3)).toThrow(/sc-does-not-exist/);
    // The other rungs of the same template are unaffected.
    expect(() => compileScenario(s, 1)).not.toThrow();
  });

  it("never hands back the template's own objects (specs are shared data)", () => {
    const s = clone();
    s.rubric = { observation: { moments: [{ id: "m1", titleBg: "Огледай наляво" }] } };
    const r = resolveScenarioRubric(s, 1)!;
    expect(r.observation).toEqual(s.rubric.observation);
    expect(r.observation).not.toBe(s.rubric.observation);
    expect(r.observation!.moments[0]).not.toBe(s.rubric.observation!.moments[0]);
  });
});

// ---------------------------------------------------------------------------
// The rule-engine half of D7
// ---------------------------------------------------------------------------

describe("LevelSpec.ruleConfig", () => {
  it("absent on both = no key on the lesson (bit-identical)", () => {
    for (const spec of SCENARIO_TEMPLATES) {
      if (spec.ruleConfig || spec.levels.some((l) => l.ruleConfig)) continue;
      for (const rung of spec.levels) {
        expect(compileScenario(spec, rung.level).ruleConfig, spec.id).toBeUndefined();
      }
    }
  });

  it("merges the rung's config PER KEY over the template's", () => {
    const s = clone();
    s.ruleConfig = { junctionScanObservationEnabled: true, speedingGraceMaxKmh: 5 };
    s.levels[3].ruleConfig = { speedingGraceMaxKmh: 0 };
    expect(compileScenario(s, 1).ruleConfig).toEqual({
      junctionScanObservationEnabled: true,
      speedingGraceMaxKmh: 5,
    });
    expect(compileScenario(s, 4).ruleConfig).toEqual({
      junctionScanObservationEnabled: true,
      speedingGraceMaxKmh: 0,
    });
  });

  it("hands the lesson a COPY, never the template's own object", () => {
    const s = clone();
    s.ruleConfig = { junctionScanObservationEnabled: true };
    expect(compileScenario(s, 1).ruleConfig).not.toBe(s.ruleConfig);
  });
});

// ---------------------------------------------------------------------------
// Purity — the seam must not have made the compiler stateful
// ---------------------------------------------------------------------------

describe("compileScenario stays pure", () => {
  it("same spec + level → identical output, and the spec is never mutated", () => {
    for (const spec of SCENARIO_TEMPLATES) {
      const before = JSON.stringify(spec);
      for (const rung of spec.levels) {
        expect(compileScenario(spec, rung.level)).toEqual(compileScenario(spec, rung.level));
      }
      expect(JSON.stringify(spec), `${spec.id} was mutated by compileScenario`).toBe(before);
    }
  });
});
