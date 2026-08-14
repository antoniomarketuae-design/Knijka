/**
 * TITLE-HONESTY GUARDS for the reachZone gates that claim a STOP.
 *
 * THE CLASS. An objective title is a certificate: the banner says «Спри
 * напълно на стоп-линията» and the student who sees ЗАДАЧА ✓ believes a
 * simulator watched him do exactly that. `stepReachZone` is handed
 * (params, prev, tick) and nothing else, so the only things it can ever
 * witness are A PLACE and A SPEED — `maxSpeedKmh` (with the FR-24
 * `acceptBeforeMarkM` cut deciding where credit ends) and the geometry. Any
 * word in a title that promises more than that is a certificate nobody signed.
 *
 * WHAT THIS FILE WOULD HAVE CAUGHT. Two shipped rows said «спри» and did not
 * ask for one:
 *
 *   · `sc-ed-d2-priority-run/sc-edpr-b2` — «Спри напълно на знак Б2 и огледай»
 *     on a bare radius-12 disc with NO cap, authored 50 m past the paint it
 *     named. The committed rolling-stop demo rolls that line at 11.9 km/h and
 *     the objective ticked; `s-w4-bot-completion.test.ts` asserted the tick in
 *     its own words and called it honest.
 *   · `sc-signal-redyellow/sc-sry-approach` — «Спри на стоп-линията на червено»
 *     at maxSpeedKmh 40, which the L1 ladder widened to 45 and painted across
 *     the lane as «не по-бързо от 45 км/ч» under the word СПРИ.
 *
 * The guards below are rules, not restatements of the new numbers: the first
 * is a catalog invariant, the second replays the committed drives, the third
 * checks each remaining claim against a constant owned by the OTHER side of
 * the system (the rule engine's own crossing threshold) so the two halves
 * cannot drift apart silently.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG } from "../../rules";
import { recordScEdD2PriorityRunDrive } from "../../traces/scEdD2PriorityRun";
import { applyTick, buildLessonResult, createLessonSession } from "../engine";
import { REACH_ZONE_HALT_CAP_KMH } from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { ScenarioSpec } from "../scenario/types";

interface ZoneRow {
  specId: string;
  objectiveId: string;
  titleBg: string;
  maxSpeedKmh?: number;
  acceptBeforeMarkM?: number;
  radiusM: number;
}

function reachZones(specs: readonly ScenarioSpec[]): ZoneRow[] {
  const out: ZoneRow[] = [];
  for (const spec of specs) {
    for (const o of spec.success) {
      const p = o.params as {
        kind: string;
        radiusM?: number;
        maxSpeedKmh?: number;
        acceptBeforeMarkM?: number;
      };
      if (p.kind !== "reachZone") continue;
      out.push({
        specId: spec.id,
        objectiveId: o.id,
        titleBg: o.titleBg,
        maxSpeedKmh: p.maxSpeedKmh,
        acceptBeforeMarkM: p.acceptBeforeMarkM,
        radiusM: p.radiusM ?? 0,
      });
    }
  }
  return out;
}

/**
 * The IMPERATIVE «спри», as a whole word. JS `\b` is ASCII-only, so the
 * boundaries are spelled out in Unicode classes — and they matter: «спринт»
 * (sc-sig-green-wave, sc-crossing-rain-sprint) contains the four letters and
 * is not a stop, while «готовност за спиране», «без излишно спиране» and
 * «преди спирането» talk ABOUT stopping without demanding one.
 */
const HALT_CLAIM = /(?:^|[^\p{L}])[Сс]при(?![\p{L}])/u;

/**
 * Rows that claim «спри» without a halt cap and are OWNED BY ANOTHER LANE of
 * the same title-honesty pass. Each entry is a debt with a name, not a
 * permission: when its owner lands the fix the entry simply stops matching and
 * can be deleted. Never add one for a row you could have fixed.
 */
const HALT_CLAIM_KNOWN_OPEN: ReadonlyArray<{ specId: string; objectiveId: string; why: string }> = [
  {
    specId: "sc-animal-hazard",
    objectiveId: "reach-end",
    why: "«Спри за животното и продължи в лентата си до края» — the stop happens at y ≈ 150 and the only gate is the finish at y = 325, so no cap can be placed on it; the agreed remedy retitles the row (templates-reels.ts) and leaves the stop to COLLISION, which that template already cites.",
  },
];

describe("a reachZone that says «спри» asks for a stop", () => {
  const zones = reachZones(SCENARIO_TEMPLATES);
  const claims = zones.filter((z) => HALT_CLAIM.test(z.titleBg));

  it("the guard has teeth (the catalog really is full of stop gates)", () => {
    // A regex that silently stopped matching would make every assertion below
    // vacuously green — the failure mode this census exists to prevent.
    expect(claims.length).toBeGreaterThan(50);
    // …and it does not sweep in the drills that merely TALK about stopping.
    const talkers = zones.filter(
      (z) => /спиран|спринт/iu.test(z.titleBg) && !HALT_CLAIM.test(z.titleBg),
    );
    expect(talkers.length).toBeGreaterThan(5);
  });

  it("every «спри» gate carries a cap in the halt band — no exceptions but the named ones", () => {
    const open = new Set(HALT_CLAIM_KNOWN_OPEN.map((k) => `${k.specId}/${k.objectiveId}`));
    const offenders = claims
      .filter((z) => !open.has(`${z.specId}/${z.objectiveId}`))
      .filter((z) => z.maxSpeedKmh === undefined || z.maxSpeedKmh > REACH_ZONE_HALT_CAP_KMH)
      .map(
        (z) =>
          `${z.specId}/${z.objectiveId} — "${z.titleBg}" completes at ${
            z.maxSpeedKmh === undefined ? "ANY speed" : `${z.maxSpeedKmh} km/h`
          }`,
      );
    expect(offenders, `${offenders.length} gate(s) promise a stop they do not require`).toEqual([]);
  });

  it("a halt cap is never widened by the ladder — «спри» reads the same on every rung", () => {
    // params.ts holds this; asserted here because it is HALF of what makes the
    // caps above honest (the other half is that they exist at all).
    for (const spec of SCENARIO_TEMPLATES) {
      const authored = new Map(
        spec.success
          .filter((o) => (o.params as { kind: string }).kind === "reachZone")
          .map((o) => [o.id, (o.params as { maxSpeedKmh?: number }).maxSpeedKmh]),
      );
      for (const rung of spec.levels) {
        for (const o of compileScenario(spec, rung.level).objectives) {
          if (o.kind !== "reachZone") continue;
          const a = authored.get(o.id);
          if (a === undefined || a > REACH_ZONE_HALT_CAP_KMH) continue;
          expect(
            (o.params as { maxSpeedKmh?: number }).maxSpeedKmh,
            `${spec.id}@L${rung.level}/${o.id}`,
          ).toBe(a);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// The row the audit found certified in a test of its own
// ---------------------------------------------------------------------------

function loadDistrict(id: string): unknown {
  return JSON.parse(
    readFileSync(join(process.cwd(), "..", "content", "world", `${id}.json`), "utf8"),
  ) as unknown;
}

function b2DoneOn(name: "mistake-rolling-stop" | "mistake-partial-scan"): boolean {
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-ed-d2-priority-run")!;
  let session = createLessonSession(compileScenario(spec, 3));
  recordScEdD2PriorityRunDrive(loadDistrict("d2-v1"), name, {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  return buildLessonResult(session).objectives.find((o) => o.id === "sc-edpr-b2")!.done;
}

describe("«Спри напълно на стоп-линията на знак Б2» tells the two drives apart", () => {
  // Behaviour, not values: whoever loosens the cap, widens the disc or moves
  // the mark back off the paint makes the rolling stop pass again, and this
  // says so. Both drives are committed recordings of the SAME approach — the
  // only difference between them is whether the wheels ever stopped.
  it("the 11.9 km/h roll over the paint does NOT earn it", () => {
    expect(b2DoneOn("mistake-rolling-stop")).toBe(false);
  });

  it("…and the textbook full stop, 4.6 m short of the line, does", () => {
    expect(b2DoneOn("mistake-partial-scan")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The remaining claims of the four templates this pass touched
// ---------------------------------------------------------------------------

/** The templates whose gates this title-honesty pass owns. */
const TOUCHED = new Set([
  "sc-ed-d2-priority-run",
  "sc-vp-telltale-red",
  "sc-signal-redyellow",
  "sc-sig-flash-amber-ped",
]);

/**
 * Claims about ANOTHER road user — a yield, a gap, a clear crossing. No field
 * of SimTick carries another actor's priority or the outcome of a yield, and
 * `stepReachZone` receives no ObjectiveContext, so no value of any param can
 * make one of these true. They belong to the rule engine's trackers
 * (FAILED_TO_YIELD, PEDESTRIAN_NOT_YIELDED), which every one of these
 * templates already cites in its own mistakes[].
 */
const ACTOR_CLAIM = /пропусни|след насрещния|когато е свободна|изчакай колата/iu;

describe("the touched templates claim only what their gates measure", () => {
  const zones = reachZones(SCENARIO_TEMPLATES.filter((s) => TOUCHED.has(s.id)));

  it("no gate certifies another road user's behaviour", () => {
    // Two rows the audit did not name were found by this rule inside the same
    // four templates and fixed with it: `sc-edpr-leftturn` («…след насрещния»)
    // and `sc-sfap-clear` («…когато е свободна»). Both keep their duty — the
    // left-turn tracker's FAILED_TO_YIELD and the crossing tracker's
    // PEDESTRIAN_NOT_YIELDED — and neither changed a single param.
    const offenders = zones
      .filter((z) => ACTOR_CLAIM.test(z.titleBg))
      .map((z) => `${z.specId}/${z.objectiveId} — "${z.titleBg}"`);
    expect(offenders).toEqual([]);
  });

  it("no gate claims a precision its own disc cannot resolve («плътно»)", () => {
    // «Плътно вдясно» is flush against the kerb. The tightest of these discs is
    // radius 3 (4.5 at L1) around a mark 1.71 m off the lane centre — it proves
    // the SIDE and cannot tell a kerbside rest from a mid-lane one, which is
    // the very pair sc-vp-telltale-red exists to teach apart. (Two sibling rows
    // outside this pass — sc-vp-police-stop/sc-vpps-stop and
    // sc-vp-telltale/sc-vptt-stop — still carry the word on identical geometry.)
    const offenders = zones
      .filter((z) => /плътно/iu.test(z.titleBg))
      .map((z) => `${z.specId}/${z.objectiveId} — "${z.titleBg}" on radius ${z.radiusM}`);
    expect(offenders).toEqual([]);
  });

  it("a stop-line title cuts its credit at the paint (FR-24)", () => {
    const named = zones.filter((z) => /стоп-лини/iu.test(z.titleBg));
    expect(named.length).toBeGreaterThan(0);
    for (const z of named) {
      expect(z.acceptBeforeMarkM, `${z.specId}/${z.objectiveId} names the line`).not.toBeUndefined();
      expect(z.maxSpeedKmh, `${z.specId}/${z.objectiveId} halt cap`).toBeLessThanOrEqual(
        REACH_ZONE_HALT_CAP_KMH,
      );
    }
  });

  it("«намалена скорост» never certifies a speed the same drill bills as too fast", () => {
    // The cross-check that keeps the two halves of the product honest with each
    // other: sc-sig-flash-amber-ped grades PEDESTRIAN_CROSSING_TOO_FAST, whose
    // threshold is the rule engine's own crossingApproachMaxKmh. An approach
    // gate that says «намалена» above that number teaches the offence the same
    // lesson is about to bill — and the compiled cap is printed in the world on
    // the gate bar, so it is an instruction, not a private number.
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-sig-flash-amber-ped")!;
    expect(spec.mistakes?.some((m) => m.codeRefs?.includes("PEDESTRIAN_CROSSING_TOO_FAST"))).toBe(
      true,
    );
    const approach = spec.success.find((o) => o.id === "sc-sfap-approach")!;
    expect(/намалена скорост/iu.test(approach.titleBg)).toBe(true);
    expect((approach.params as { maxSpeedKmh: number }).maxSpeedKmh).toBeLessThanOrEqual(
      DEFAULT_RULE_CONFIG.crossingApproachMaxKmh,
    );
  });
});
