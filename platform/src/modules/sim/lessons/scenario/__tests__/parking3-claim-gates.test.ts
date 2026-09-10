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
import type { VehicleSample } from "../../../contracts";
import { PLAYER_HALF_LENGTH_M } from "../../../collision/bodies";
import { createRuleEngine, reduceTick, type RuleEvent, type ViolationEvent } from "../../../rules";
import { createWorldRuntime } from "../../../runtime";
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

// ---------------------------------------------------------------------------
// §5 — the briefing names two unlawful free slots; the grading must reach them
// ---------------------------------------------------------------------------

/**
 * THE TEACH/GRADE CONTRADICTION THIS GATE EXISTS TO KEEP CLOSED (2026-09-10).
 *
 * sc-park-zebra briefing step 3 tells the student «две свободни места не стават
 * — едното е ВЪРХУ ПЪТЕКАТА, другото в петте метра преди нея». Both halves are
 * true of the committed world:
 *
 *   · lotzb-bay-3, centre y = −5.25, rect y ∈ [−8.00, −2.50] — wholly inside
 *     the чл. 98 span, the «пет метра преди» limb;
 *   · lotzb-bay-4, centre y = 3.75, rect y ∈ [1.00, 6.50] — its first 2.00 m
 *     lie on the zebra's paint (y ∈ [−3, +3]: ZEBRA_LENGTH_M = 6.0, laid
 *     symmetrically about the node by markings.ts). A car centred in it stands
 *     at y ∈ [1.73, 5.77], with 1.27 m of body ON the пешеходна пътека.
 *
 * THE GRADING DID NOT REACH THE SECOND ONE. The ban span was trimmed to end at
 * the paint's far edge — correctly: чл. 98, ал. 1, т. 5 is «на пешеходни или
 * велосипедни пътеки и на разстояние, по-малко от 5 метра ПРЕДИ тях» (retrieved
 * from content/law/acts/zdvp.json, unit ref "чл. 98"), and no clause of ал. 1
 * reaches ground past a пътека — while span membership stayed a POINT test on
 * the lane fix. bay-4's centre sits at sM 33.75 against a span ending at 33, so
 * the student who parked NEATLY in the slot the briefing calls unlawful was
 * billed nothing at all. The drill taught one rule and graded another, which is
 * the defect class this whole file exists to remove.
 *
 * WHAT FIXED IT, and what this gate refuses to let be swapped for it: the
 * runtime now measures the VEHICLE against a no-stopping span instead of a
 * point inside it (runtime/worldRuntime.ts, the `bodyHalfAlongEdge` block). The
 * banned GROUND is untouched, and that is the point — widening the span would
 * need an article for «пет метра СЛЕД пътеката», and there is none. Assertion 3
 * is the counter-proof: bay-4's centre must stay OUTSIDE the span. It goes red
 * if someone reverts the body test (via assertion 4) AND if someone "fixes"
 * this by stretching the span over the bay instead (via assertion 3 itself).
 */
describe("§5 — sc-park-zebra grades the slot its briefing calls unlawful", () => {
  const ZEBRA_HALF_M = 3.0; // ZEBRA_LENGTH_M / 2 — markings.ts paints ±3.0
  const AISLE_SOUTH_Y = -30; // lotzb-e-aisle runs y −30 → +40, so sM = y + 30
  const APPROACH_X = 4.0625; // the aisle lane the spawn sits on
  const BAY_X = 6.28;

  const zebraDistrict = () => district("lot-zebra-v1");
  const bay = (id: string): BayMeta => {
    const b = zebraDistrict().meta.scenario.bays.find((z) => z.id === id);
    if (!b) throw new Error(`no bay ${id}`);
    return b;
  };
  const banSpan = () => {
    const z = (zebraDistrict().zones ?? []).find((s) => s.kind === "noStopping");
    if (!z) throw new Error("lot-zebra-v1 lost its noStopping span");
    return z;
  };

  const zebraSample = (x: number, y: number, speedKmh: number): VehicleSample => ({
    position: { x, y },
    headingDeg: 0,
    speedKmh,
    indicator: "off",
    headlights: "off",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: 1,
    mirrorGlance: null,
  });

  /** Approach up the aisle, swing into the bay row, rest centred at `restY` —
   *  through the REAL runtime and the REAL reducer, not a hand-built tick. The
   *  approach rides at 15 km/h so the aisle's own 20 km/h limit cannot add a
   *  speeding code and muddy the read. */
  function restDriveZebra(restY: number, restSec = 12): RuleEvent[] {
    const raw = JSON.parse(
      readFileSync(path.join(REPO_ROOT, "content", "world", "lot-zebra-v1.json"), "utf-8"),
    ) as unknown;
    const rt = createWorldRuntime(raw);
    let rules = createRuleEngine();
    const out: RuleEvent[] = [];
    const dt = 0.1;
    let t = 0;
    const step = (x: number, y: number, speedKmh: number) => {
      t += dt;
      rt.update(dt);
      const r = reduceTick(rules, rt.sample(zebraSample(x, y, speedKmh), t, false));
      rules = r.state;
      out.push(...r.events);
    };
    const swingFrom = restY - 6;
    for (let y = -100; y < swingFrom; y += (15 / 3.6) * dt) step(APPROACH_X, y, 15);
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      step(APPROACH_X + (BAY_X - APPROACH_X) * f, swingFrom + (restY - swingFrom) * f, 5);
    }
    for (let i = 0; i < restSec / dt; i++) step(BAY_X, restY, 0);
    return out;
  }

  const violations = (evs: RuleEvent[]): ViolationEvent[] =>
    evs.filter((e): e is ViolationEvent => e.kind === "violation");

  it("1 — briefing step 3 still names a free slot that is ON the crossing", () => {
    const step3 = byId("sc-park-zebra").instructionsBg.find((i) => i.n === 3)!;
    expect(step3.textBg).toMatch(/върху\s+пътеката/iu);
    expect(step3.textBg).toMatch(/в\s+петте\s+метра\s+преди/iu);
  });

  it("2 — and the world really does put a FREE bay on the paint", () => {
    const b4 = bay("lotzb-bay-4");
    expect(b4.occupied, "a taken bay tempts nobody").toBe(false);
    // The bay's own rectangle reaches onto the zebra…
    expect(b4.y - b4.lengthM / 2).toBeLessThan(ZEBRA_HALF_M);
    // …and so does the BODY of a car centred in it, which is the act т. 5 bans.
    expect(b4.y - PLAYER_HALF_LENGTH_M).toBeLessThan(ZEBRA_HALF_M);
    // The other slot the briefing counts: wholly inside the „5 m before" limb.
    const b3 = bay("lotzb-bay-3");
    expect(b3.occupied).toBe(false);
    expect(b3.y + b3.lengthM / 2).toBeLessThanOrEqual(ZEBRA_HALF_M);
  });

  it("3 — COUNTER-PROOF: bay-4's centre is OUTSIDE the span, so a point test acquits it", () => {
    const z = banSpan();
    // The span must still end AT the paint — this is the invented „five metres
    // after the crossing", removed on 2026-09-10, staying removed.
    expect(z.toM).toBeCloseTo(ZEBRA_HALF_M - AISLE_SOUTH_Y, 6);
    // …and the bay centre must still sit past it. If this goes red, the span has
    // been stretched over the bay and assertion 4 has become vacuous.
    expect(bay("lotzb-bay-4").y - AISLE_SOUTH_Y).toBeGreaterThan(z.toM);
  });

  it("4 — yet a car resting centred in bay-4 IS billed, and cited to the crossing", () => {
    const ban = violations(restDriveZebra(bay("lotzb-bay-4").y)).find(
      (e) => e.code === "ILLEGAL_STOP_IN_BAN_ZONE",
    );
    expect(ban, "the slot the briefing calls unlawful must grade as unlawful").toBeDefined();
    // THEO-4: the card cites the article that actually applies, not the pooled
    // „a plate governs this" row — чл. 98, ал. 1, т. 5, via the span's basis.
    expect(ban!.detail).toBe("law-crossing");
  });

  it("5 — and the TARGET bay is still clean, so the reach did not become an over-reach", () => {
    // lotzb-bay-5 (y = 11.75) is the drill's answer: body y ∈ [9.73, 13.77],
    // rear 6.73 m past the paint. Convicting it would make the drill unwinnable.
    const codes = violations(restDriveZebra(bay("lotzb-bay-5").y)).map((e) => e.code);
    expect(codes).not.toContain("ILLEGAL_STOP_IN_BAN_ZONE");
  });

  it("6 — bay-3 is acquitted BY DESIGN, and the drill still teaches it another way", () => {
    // The honest half of the briefing's „two slots". A rest SHORT of a zebra is
    // structurally excused by the reducer (`s.crossing === null` is a hard
    // precondition of `illegalBanRest`) because a car stopped before a crossing
    // can always be yielding to someone on it — convicting that would be the
    // false positive the ban detector is armored against. So this slot is not
    // graded, and the drill demonstrates it through its CONSEQUENCE instead.
    const codes = violations(restDriveZebra(bay("lotzb-bay-3").y)).map((e) => e.code);
    expect(codes).not.toContain("ILLEGAL_STOP_IN_BAN_ZONE");
    // …and that other way must still exist, or half of step 3 teaches nothing.
    const hidden = byId("sc-park-zebra").mistakes!.find((m) =>
      m.traceRef.path.includes("mistake-hidden-pedestrian"),
    );
    expect(hidden, "the 5-m-before limb is demonstrated by this demo alone").toBeDefined();
    expect(hidden!.codeRefs).toContain("COLLISION");
  });

  /**
   * §4's defect, re-armed against the BODY instead of the ground — because
   * measuring the car is what moved the line the setup gate has to clear.
   *
   * The gate credits „Задача 1" anywhere in a capsule that reaches
   * `radiusM + REACH_ZONE_GRACE_M` BEHIND its mark. The span was trimmed so
   * that capsule could not certify a pose the engine bills (the note on
   * sc-pzb-setup), and the arithmetic that said so compared the capsule
   * against the GROUND: rear edge +5.50 at L1 against a span ending at +3.00,
   * 2.5 m of daylight. That comparison is no longer the right one. The runtime
   * measures the vehicle, so the last pose that gets billed is not the last
   * pose ON the ban but the last pose whose REAR BUMPER is — 2.02 m further
   * north — and the L1 daylight is really 0.48 m.
   *
   * It holds. But it holds by less than half a metre, on a number nobody was
   * watching, and four independent things eat it: REACH_ZONE_GRACE_M, the L1
   * radius ramp, PLAYER_HALF_LENGTH_M, and the bay row's own pitch. So the
   * margin is computed here every build rather than believed.
   */
  it("7 — the setup gate still cannot certify a pose the engine bills, measured on the CAR", () => {
    const z = banSpan();
    // The last centre pose whose body still reaches the paint.
    const lastBilledY = z.toM + AISLE_SOUTH_Y + PLAYER_HALF_LENGTH_M;

    // THE FORMULA IS CHECKED AGAINST THE ENGINE, not asserted about it: drive
    // a pose 5 cm each side of it and require the verdict to flip exactly here.
    // If `bodyHalfAlongEdge` is reverted, the „inside" drive goes clean and
    // this fails before the margin below can be read as reassurance.
    const billedInside = violations(restDriveZebra(lastBilledY - 0.05)).some(
      (e) => e.code === "ILLEGAL_STOP_IN_BAN_ZONE",
    );
    const billedOutside = violations(restDriveZebra(lastBilledY + 0.05)).some(
      (e) => e.code === "ILLEGAL_STOP_IN_BAN_ZONE",
    );
    expect(billedInside, "a rear bumper on the paint must still be billed").toBe(true);
    expect(billedOutside, "a car wholly past the paint must not be").toBe(false);

    // …and no rung's capsule may reach back into that.
    const spec = byId("sc-park-zebra");
    const tight: string[] = [];
    for (const rung of spec.levels) {
      const gate = compileScenario(spec, rung.level).objectives[0]!.params as {
        y: number;
        radiusM: number;
      };
      const rearEdge = gate.y - (gate.radiusM + REACH_ZONE_GRACE_M);
      tight.push(`L${rung.level}: rear edge y=${rearEdge.toFixed(2)}, clear by ${(rearEdge - lastBilledY).toFixed(2)} m`);
      expect(
        rearEdge,
        `L${rung.level} credits «подмини забраната» at a pose the rule engine bills:\n${tight.join("\n")}`,
      ).toBeGreaterThan(lastBilledY);
    }
  });
});
