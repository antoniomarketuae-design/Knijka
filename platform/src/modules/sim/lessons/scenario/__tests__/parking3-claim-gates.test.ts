/**
 * PARKING-DEPTH CLAIM GATES — sweep 161, 2026-08-18.
 *
 * The parking chapter of „a green tick for a skill it never measured"
 * (cdb2f71, whose `stop-claim-gates.test.ts` is this file's mold). Ten drills
 * were driven on two platforms; the debriefs, not the source, are what found
 * these. Every rule below is computed from what `stepReachZone` can actually
 * read plus the COMMITTED district — never from a number typed in twice.
 *
 * WHY THE COUNTER-PROOFS ARE HERE. A title rule that only reads today's copy
 * passes the day it is written and every day after, whatever the copy says.
 * So each rule is paired with the exact string that shipped on 2026-08-17 and
 * an assertion that the rule REFUSES it. If a future edit reverts the wave,
 * the rules go red on their own; the counter-proofs guarantee they were never
 * vacuous to begin with.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { REACH_ZONE_GRACE_M, REACH_ZONE_HALT_CAP_KMH } from "../../objectives";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES_PARKING3 } from "../templates-parking3";
import type { ScenarioSpec } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

const byId = (id: string): ScenarioSpec => {
  const s = SCENARIO_TEMPLATES_PARKING3.find((p) => p.id === id);
  if (!s) throw new Error(`no parking3 template ${id}`);
  return s;
};

interface BayMeta {
  id: string;
  x: number;
  y: number;
  headingDeg: number;
  widthM: number;
  lengthM: number;
  occupied: boolean;
}

function district(id: string): {
  meta: { scenario: { bays: BayMeta[] } };
  spawnPoints: Array<{ id: string; x: number; y: number }>;
  roads: { edges: Array<{ id: string; geometry: Array<[number, number]> }> };
  zones?: Array<{ id: string; kind: string; edgeId: string; fromM: number; toM: number }>;
} {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as never;
}

/** The first (setup) objective of a drill, as the student's HUD row sees it. */
function setup(spec: ScenarioSpec): {
  titleBg: string;
  x: number;
  y: number;
  radiusM: number;
  maxSpeedKmh?: number;
} {
  const o = spec.success[0]!;
  const p = o.params as { kind: string; x: number; y: number; radiusM: number; maxSpeedKmh?: number };
  if (p.kind !== "reachZone") throw new Error(`${spec.id} first objective is ${p.kind}`);
  return { titleBg: o.titleBg, x: p.x, y: p.y, radiusM: p.radiusM, maxSpeedKmh: p.maxSpeedKmh };
}

/**
 * The half-extents, in world x/y, of a rect of `lengthM` along `headingDeg`
 * and `widthM` across it. The bay rows in this family sit at 0°, 90°, 135°
 * and 270°, so an axis-aligned bound is the honest one to compare against a
 * disc that is itself axis-free.
 */
function extents(b: { headingDeg: number; widthM: number; lengthM: number }): {
  ex: number;
  ey: number;
} {
  const h = (b.headingDeg * Math.PI) / 180;
  const s = Math.abs(Math.sin(h));
  const c = Math.abs(Math.cos(h));
  return {
    ex: (b.lengthM * s + b.widthM * c) / 2,
    ey: (b.lengthM * c + b.widthM * s) / 2,
  };
}

// ---------------------------------------------------------------------------
// §1 — nothing in a task title may claim what the disc cannot read
// ---------------------------------------------------------------------------

/**
 * A control state. `SimTick` carries `headlights`, but `ObjectiveParams` has
 * no variant that reads it (ReachZone / PassSignal / DriveDistance / the four
 * Maneuver shapes), so no authored value can ever tick „включи светлините".
 * The duty is the rule engine's — HEADLIGHTS_OFF_AT_NIGHT, основна.
 */
const LAMP_CLAIM = /включи\s+(късите\s+)?(светлини|фарове)/iu;

/**
 * A legal act inside a district zone. `stepReachZone` gets no zone membership,
 * so „подмини забраната" is certified by arriving at a coordinate — while
 * ILLEGAL_STOP_IN_BAN_ZONE bills the opposite behaviour from the same drive.
 */
const BAN_CLAIM = /подмини\s+забраната|без\s+да\s+спираш\s+в\s+нея/iu;

/** A judgement taken behind the driver's eyes. A disc cannot see it. */
const JUDGEMENT_CLAIM = /премери|прецени|го\s+измери/iu;

/** Heading. `ReachZoneParams` has x, y, radiusM and an optional cap. Nothing else. */
const HEADING_CLAIM = /успоредно\s+на\s+алеята/iu;

describe("§1 — the task titles claim only what their own gate reads", () => {
  const rows = SCENARIO_TEMPLATES_PARKING3.map((spec) => ({ spec, s: setup(spec) }));

  it("has all ten drills to sweep (a rule over nothing certifies nothing)", () => {
    expect(rows).toHaveLength(10);
    for (const { spec, s } of rows) {
      expect(s.maxSpeedKmh, `${spec.id} setup cap`).toBeLessThanOrEqual(REACH_ZONE_HALT_CAP_KMH);
    }
  });

  it("no setup title certifies a lamp, a ban, a judgement or a heading", () => {
    const offenders: string[] = [];
    for (const { spec, s } of rows) {
      for (const [name, re] of [
        ["lamp", LAMP_CLAIM],
        ["ban", BAN_CLAIM],
        ["judgement", JUDGEMENT_CLAIM],
        ["heading", HEADING_CLAIM],
      ] as const) {
        if (re.test(s.titleBg)) offenders.push(`${spec.id}: ${name} — «${s.titleBg}»`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("sc-park-night's objectiveBg does not sell the lamps as one of the two tasks", () => {
    // The literal sweep-161 finding: «първо включи късите светлини и спри в
    // изходната позиция» made the lamps the first half of Задача 1, which no
    // ObjectiveParams variant can ever tick.
    const spec = byId("sc-park-night");
    const firstTask = spec.objectiveBg.split(";")[0]!;
    expect(LAMP_CLAIM.test(firstTask), `«${firstTask}»`).toBe(false);
    // …and the two-task promise the whole family is asserted on survives.
    expect(spec.objectiveBg).toMatch(/Две задачи/);
  });

  it("COUNTER-PROOF: every string that shipped on 2026-08-17 is refused by these rules", () => {
    const SHIPPED: ReadonlyArray<readonly [rule: string, textBg: string]> = [
      ["judgement", "Задача 1: спри срещу мястото и премери дължината му"],
      ["judgement", "Задача 1: спри срещу късото място и го премери"],
      ["heading", "Задача 1: подмини мястото и спри успоредно на алеята"],
      ["ban", "Задача 1: подмини забраната и спри до първото разрешено място"],
      [
        "lamp",
        "Две задачи, в този ред: първо включи късите светлини и спри в изходната позиция до предната кола",
      ],
    ];
    const RULES: Record<string, RegExp> = {
      lamp: LAMP_CLAIM,
      ban: BAN_CLAIM,
      judgement: JUDGEMENT_CLAIM,
      heading: HEADING_CLAIM,
    };
    for (const [rule, textBg] of SHIPPED) {
      expect(RULES[rule]!.test(textBg), `${rule} rule does not catch «${textBg}»`).toBe(true);
      // …and none of the five is what the file holds today, in any field.
      const haystack = SCENARIO_TEMPLATES_PARKING3.flatMap((s) => [
        s.objectiveBg,
        ...s.success.map((o) => o.titleBg),
      ]);
      expect(haystack.some((h) => h.includes(textBg)), `still shipping «${textBg}»`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// §2 — the opposite direction: the duties are not lost, only relocated
// ---------------------------------------------------------------------------

describe("§2 — removing the certificate did not remove the duty", () => {
  it("the lamps are still demanded before the wheels turn, at every night rung", () => {
    const spec = byId("sc-park-night");
    for (const rung of spec.levels) {
      const lesson = compileScenario(spec, rung.level);
      const env = lesson.environment;
      expect(env?.timeOfDay, `L${rung.level} is meant to be dark`).toBe("night");
      const briefing = lesson.briefingBg ?? [];
      expect(
        briefing.some((s) => /светлин|фаров/i.test(s.textBg)),
        `L${rung.level} compiles a dark drive and never names the lamps (doc 86 L10)`,
      ).toBe(true);
    }
    // …and the fault the engine bills for the omission is still taught here.
    expect(spec.mistakes.some((m) => m.codeRefs?.includes("HEADLIGHTS_OFF_AT_NIGHT"))).toBe(true);
  });

  it("the чл. 98 ban is still staged, still taught and still convicted", () => {
    const spec = byId("sc-park-zebra");
    const raw = district(spec.map.districtId);
    const ban = (raw.zones ?? []).filter((z) => z.kind === "noStopping");
    expect(ban.length, "lot-zebra-v1 no longer stages the ban this drill is about").toBe(1);
    expect(spec.mistakes.some((m) => m.codeRefs?.includes("ILLEGAL_STOP_IN_BAN_ZONE"))).toBe(true);
    // The act is still ASKED for, on the row the compact card always paints.
    const briefing = compileScenario(spec, 3).briefingBg ?? [];
    expect(briefing.some((s) => /забранената зона|без да спираш/iu.test(s.textBg))).toBe(true);
    expect(spec.teach.lawRef).toBe("ЗДвП чл. 98");
  });

  it("the two judgement drills still teach the measurement they stopped certifying", () => {
    for (const [id, needle] of [
      ["sc-park-gap-long", /премери|мери от броня до броня/iu],
      ["sc-park-judge", /премери|дължина кола плюс метър/iu],
    ] as const) {
      const spec = byId(id);
      const copy = spec.instructionsBg.map((s) => s.textBg).join(" ");
      expect(needle.test(copy), `${id}: the measurement fell out of the briefing too`).toBe(true);
      expect(spec.objectiveBg).toMatch(/Две задачи/);
    }
  });

  it("no params moved: every setup gate is still the pose its shadow stops at", () => {
    // The wave's own contract — sentences changed, grading did not. These are
    // the traces/scParkDepth stop poses, by value, so a silent re-aim of a
    // gate „while fixing the wording" cannot pass.
    const POSES: ReadonlyArray<readonly [string, number, number, number, number]> = [
      ["sc-park-gap-short", 3.7, 5.67, 5, 6],
      ["sc-park-gap-long", 3.5, -8.37, 5, 6],
      ["sc-park-van", 0.9, 6.3, 5, 6],
      ["sc-park-45-rev", 0.9, 6.0, 5, 6],
      ["sc-park-left", -0.9, 6.3, 5, 6],
      ["sc-park-zebra", 4.0, 18.0, 5, 6],
      ["sc-park-wall", 0.9, 11.7, 5, 6],
      ["sc-park-night", 4.0, 19.3, 5, 6],
      ["sc-park-double", 0.9, 6.3, 5, 6],
      ["sc-park-judge", 4.0, -4.0, 4, 6],
    ];
    for (const [id, x, y, r, cap] of POSES) {
      const s = setup(byId(id));
      expect([s.x, s.y, s.radiusM, s.maxSpeedKmh], id).toEqual([x, y, r, cap]);
    }
  });
});

// ---------------------------------------------------------------------------
// §3 — the act the shadow performs and the copy has to state
// ---------------------------------------------------------------------------

/**
 * WHY THIS RULE EXISTS. `gen_parking_lot.mjs` seats a bay row INSIDE the drawn
 * carriageway (`bayCenterX = halfRoadM − CURB_MARGIN_M − extentX`, where
 * halfRoadM is one drawn lane, 8.125 m). For a `parallel` row that is how kerb
 * parking works and it leaves the curb lane drivable; for a 90°/135° row the
 * 5 m of bay depth eats the lane whole, so the occupied neighbours stand ACROSS
 * the lane the car spawns in. Sweep 161's correct drives ended on „Настъпи
 * сблъсък" on exactly those districts.
 *
 * The world half is not this file's to fix. The TEACHING half is: the recorded
 * shadow leaves the curb lane at y = −18, before the row, and until this wave
 * two drills never told the student to. The rule is therefore computed, not
 * listed — a drill whose curb lane its own occupied bays block must name the
 * aisle position in its briefing.
 */
const AISLE_POSITION_ACT = /средата на алеята|по средата на алеята/iu;

/** Half-width of the student's car, m (traces PARKED_CAR_HALF_WIDTH_M's twin). */
const EGO_HALF_WIDTH_M = 0.9;

describe("§3 — a drill whose curb lane is blocked says so, in the briefing", () => {
  /** Free width of the spawn lane, m: how much room is left beside the row. */
  function curbLaneClearance(spec: ScenarioSpec): number {
    const raw = district(spec.map.districtId);
    const spawn = raw.spawnPoints.find((p) => p.id === spec.start.spawnPointId)!;
    const egoRight = spawn.x + EGO_HALF_WIDTH_M;
    let nearest = Infinity;
    for (const b of raw.meta.scenario.bays) {
      if (!b.occupied) continue;
      // Only the row on the driver's own side can block him.
      if (Math.sign(b.x) !== Math.sign(spawn.x)) continue;
      nearest = Math.min(nearest, b.x - extents(b).ex);
    }
    return nearest - egoRight;
  }

  it("the blocked districts are the perpendicular/echelon ones — measured, not assumed", () => {
    const blocked = SCENARIO_TEMPLATES_PARKING3.filter((s) => curbLaneClearance(s) < 0).map(
      (s) => s.id,
    );
    expect(blocked.sort()).toEqual(
      ["sc-park-45-rev", "sc-park-double", "sc-park-van", "sc-park-wall"].sort(),
    );
    // …and the parallel rows really do leave a corridor, thin as it is.
    expect(curbLaneClearance(byId("sc-park-gap-short"))).toBeGreaterThan(0);
  });

  it("every blocked drill names the aisle position in its own copy", () => {
    const silent: string[] = [];
    for (const spec of SCENARIO_TEMPLATES_PARKING3) {
      if (curbLaneClearance(spec) >= 0) continue;
      const copy = spec.instructionsBg.map((s) => s.textBg).join(" ");
      if (!AISLE_POSITION_ACT.test(copy)) silent.push(spec.id);
    }
    expect(
      silent,
      `${silent.join(", ")} put the student in a lane their own parked row stands in, and never say to leave it`,
    ).toEqual([]);
  });

  it("COUNTER-PROOF: the copy that shipped leaves two of the four silent", () => {
    // sc-park-van's step 2 was a STATE with no moment; sc-park-45-rev had no
    // lateral step at all. Both districts are blocked, so both were silent.
    const SHIPPED_VAN_STEP2 = "Дръж около метър и половина странично от реда.";
    const SHIPPED_45REV = [
      "Подмини мястото и спри успоредно на алеята — под 6 км/ч, в покой.",
      "Погледни накъде гледат линиите: устата се отваря НАЗАД спрямо теб.",
      "Знай: такъв ред се взима само на заден ход и се напуска с лице напред.",
      "Включи на задна — огледала, после през рамо.",
      "Завърти надясно, но само до 45°, не докрай.",
      "Изправи волана, щом колата легне по линиите, и влез право до дъното.",
      "Спри в очертанията — предницата гледа към алеята и на тръгване виждаш кой идва.",
      "Включи късите светлини ПРЕДИ маневрата, ако е тъмно или вали.",
    ].join(" ");
    expect(AISLE_POSITION_ACT.test(SHIPPED_VAN_STEP2)).toBe(false);
    expect(AISLE_POSITION_ACT.test(SHIPPED_45REV)).toBe(false);
    // The two that were already right stay the reference wording.
    for (const id of ["sc-park-wall", "sc-park-double"]) {
      const copy = byId(id).instructionsBg.map((s) => s.textBg).join(" ");
      expect(AISLE_POSITION_ACT.test(copy), `${id} lost its aisle step`).toBe(true);
    }
    // …and the exact shipped step 2 is gone from sc-park-van.
    expect(
      byId("sc-park-van").instructionsBg.some((s) => s.textBg === SHIPPED_VAN_STEP2),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §4 — the measurement that made §1's „подмини" claims false, kept live
// ---------------------------------------------------------------------------

describe("§4 — a halt gate's backward grace reaches behind the space it names", () => {
  /**
   * THE ARITHMETIC, RE-RUN EVERY BUILD rather than quoted. `stepReachZone`
   * credits `graceArmed && halted && isHaltDemand`, and the capsule's rear
   * edge is `radiusM + REACH_ZONE_GRACE_M` behind the mark. This is why
   * «подмини мястото» could not stay in a title: the drills whose setup pose
   * is NORTH of their target bay credit a halt that never reached it.
   *
   * It is pinned, not fixed: clipping the capsule needs a parameter
   * `objectives.ts` does not have (see the file header). If somebody adds one,
   * this test is where the numbers to check it against already live.
   */
  it("on every north-of-the-bay setup gate the capsule clears the bay — at no rung", () => {
    const reaching: string[] = [];
    for (const spec of SCENARIO_TEMPLATES_PARKING3) {
      const terminal = spec.success[spec.success.length - 1]!.params as {
        bay?: { x: number; y: number; headingDeg: number; widthM: number; lengthM: number };
      };
      if (!terminal.bay) continue;
      const bayNorthEdge = terminal.bay.y + extents(terminal.bay).ey;
      for (const rung of spec.levels) {
        const gate = compileScenario(spec, rung.level).objectives[0]!.params as {
          x: number;
          y: number;
          radiusM: number;
          maxSpeedKmh?: number;
        };
        if (gate.y <= bayNorthEdge) continue; // gate is not past the bay; nothing claimed
        const rearEdge = gate.y - (gate.radiusM + REACH_ZONE_GRACE_M);
        if (rearEdge < bayNorthEdge) {
          reaching.push(
            `${spec.id}@L${rung.level}: capsule rear edge y=${rearEdge.toFixed(2)} vs bay north edge y=${bayNorthEdge.toFixed(2)}`,
          );
        }
      }
    }
    // EVERY ONE of them reaches back past its own bay. The assertion records
    // the fact instead of pretending it is closed — and it goes red the day
    // the capsule learns to stop, which is the day the titles may say
    // „подмини" again.
    expect(reaching.length, reaching.join("\n")).toBeGreaterThan(0);
    expect(
      reaching.every((r) => /@L[1-5]:/.test(r)),
      "the reach is rung-dependent; it is not",
    ).toBe(true);
  });
});
