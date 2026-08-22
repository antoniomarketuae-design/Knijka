/**
 * CAN THE STUDENT ACTUALLY MEET THE ACTOR? — the VRU family, sweep161 read a
 * second time (2026-08-18).
 *
 * The battery next door (`vru-title-truth-and-encounter.test.ts`) asks whether
 * the GRADE is honest once the encounter happens. This one asks the question
 * underneath it: does the encounter happen at all, for a student driving at a
 * pace this repository did not author? Every defect below survived every
 * existing gate for one reason — the §5/§9 gates replay the AUTHORED demo, and
 * an authored demo arrives exactly when its author meant it to.
 *
 * Each drive here is integrated frame by frame through the production stack
 * (runtime → traffic → sample → director → rules, the LessonScene order, via
 * the orchestrator battery's own `stepFrame`) at the LIVE hero car's ramp —
 * 1.95 m/s², read off the deployed build's own speed probe (17 км/ч at t = 1 s,
 * 52 км/ч at t = 6 s). The recorder cannot express this: it ramps every
 * scripted ghost at a fixed SCRIPT_ACCEL = 2.2 m/s².
 *
 * ── HOW TO READ THE TWO KINDS OF TEST IN THIS FILE ─────────────────────────
 *
 * `describe("… — must stay true")` are ordinary guards. They are green today
 * and they pin the direction a repair must not cost anything: the student who
 * does the right thing at the right pace must keep meeting the actor and
 * keeping his credit. If a retune turns one of these red, the retune traded one
 * broken drive for another.
 *
 * `describe("… — TRIPWIRE: red is the goal")` are CHARACTERISATION pins. They
 * assert the DEFECT, measured, so that (a) the arithmetic in templates-vru.ts
 * cannot drift away from the data it claims, and (b) the day the coordinated
 * repair lands the test goes red and names its own replacement. Each one
 * carries the exact assertion to swap in. They are not a licence to leave the
 * defect: the repairs are specified at the matching sites in templates-vru.ts,
 * and every one of them needs a file this lane does not own — a runner
 * (orchestrator/runners.ts) or the demo choreography those runners are recorded
 * against (traces/scVu*.ts + content/traces/**).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "../../../runtime";
import { createTrafficSystem } from "../../../traffic/system";
import type { TrafficDistrict } from "../../../traffic/types";
import { createRuleEngine } from "../../../rules";
import { createScenarioDirector } from "../../../orchestrator/director";
import { DT, stepFrame, type Stack } from "../../../orchestrator/__tests__/helpers";
import type { CyclistRightHookSpec, StagedEventSpec } from "../../../contracts";
import { recordScriptedDrive } from "../../../traces/recorder";
import {
  scVuPassMistakeFastCloseScript,
  scVuPassMistakeSqueezeScript,
  scVuPassShadowScript,
} from "../../../traces/scVuPass";
import {
  SC_VU_CYCLIST_HOOK,
  SC_VU_EMERGENCY,
  SC_VU_EMERGENCY_JUNCTION,
  SC_VU_PASS_CLEARANCE,
} from "../templates-vru";

const REPO_ROOT = join(process.cwd(), "..");
const loadDistrict = (id: string): TrafficDistrict =>
  JSON.parse(readFileSync(join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));

/** The live car's launch ramp (NOT the recorder's 2.2 — see the header). */
const HERO_ACCEL_MPS2 = 1.95;
/** The sweep's careful bot: it never got above 15–27 км/ч on any VRU leg. */
const CRAWL_MPS = 2.8;
/** The tier governor's ceiling on these maps, measured: 59 км/ч. */
const FLAT_OUT_MPS = 16.4;

/** ln-v1 / vu-pass-v1 / tj-rhr-v1 wired exactly as `makeStack` wires
 *  district-v1: same query hookups, ambient traffic zeroed so the staged actor
 *  is the only other road user. */
function makeStackFor(districtId: string, events: StagedEventSpec[]): Stack {
  const raw = loadDistrict(districtId);
  const runtime = createWorldRuntime(raw);
  const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
  runtime.setPedestrianQuery((id) => traffic.pedestrianOnCrossing(id));
  runtime.setJunctionConflictQuery((x, y, r, b) => traffic.conflictNear(x, y, r, b));
  runtime.setOncomingQuery((px, py, h, r) => traffic.oncomingNear(px, py, h, r));
  runtime.setRightConflictQuery((jx, jy, px, py, h, r) =>
    traffic.conflictFromRight(jx, jy, px, py, h, r),
  );
  runtime.setCirculatingQuery((cx, cy, px, py, h, r) =>
    traffic.circulatingConflict(cx, cy, px, py, h, r),
  );
  runtime.setCyclistQuery((px, py, h, r) => traffic.cyclistNear(px, py, h, r));
  runtime.setOvertakenQuery((px, py, h, r) => traffic.overtakenNear(px, py, h, r));
  return {
    runtime,
    traffic,
    director: createScenarioDirector(events, traffic, { seed: 7, signals: runtime }),
    rules: createRuleEngine(),
    ruleEvents: [],
    ticks: [],
    outcomes: [],
    t: 0,
  };
}

interface Leg {
  /** Rule codes seen, deduplicated. */
  violations: string[];
  commendations: string[];
  /** Actor pose the frame the player's own axis crossed `crossAt`. */
  actorAtCrossing: { x: number; y: number } | null;
  /** Closest the player and the actor ever came, m. */
  minGapM: number;
  /**
   * Closest they came WHILE THE ACTOR WAS AHEAD on the player's own axis, m.
   * Only meaningful when the actor advances along that same axis (the two
   * cyclist streets); Infinity on the crossing-EV legs, where "ahead" is not a
   * one-axis question. This is the number sc-vu-pass-clearance:953fbed1 is
   * about: on the shipped build the rider's closest approach was always from
   * ASTERN, so `minGapM` was small while this stayed above 90 m.
   */
  minGapAheadM: number;
  /** Player axis value when the actor's axis passed `crossAt`. */
  playerWhenActorCrossed: number | null;
}

/**
 * Drive one straight axis at a fixed target speed and report what the stack
 * said. `axis` is the coordinate that advances; the other is held (these three
 * maps are straight, which is exactly why they were chosen for these lessons).
 */
function driveStraight(opts: {
  districtId: string;
  staged: StagedEventSpec[];
  actorId: string;
  axis: "x" | "y";
  fixed: number;
  from: number;
  headingDeg: number;
  targetMps: number;
  seconds: number;
  /** The node coordinate whose crossing the test is about. */
  crossAt: number;
  /** Which coordinate of the ACTOR moves toward `crossAt` (may differ). */
  actorAxis?: "x" | "y";
  /**
   * The sweep's bot does not hold a speed — it drives and stops, 22–27 full
   * stops in three minutes. `go`/`stop` seconds reproduce that duty cycle,
   * which is the pace both open criticals on sc-vu-pass-clearance were
   * photographed at. Omitted = hold `targetMps` throughout.
   */
  duty?: { goSec: number; stopSec: number };
  /** Stop the leg early once the player's axis reaches this (the finish gate). */
  stopAt?: number;
}): Leg {
  const stack = makeStackFor(opts.districtId, opts.staged);
  const actorAxis = opts.actorAxis ?? opts.axis;
  let p = opts.from;
  let v = 0;
  let playerCrossed = false;
  let actorCrossed = false;
  const leg: Leg = {
    violations: [],
    commendations: [],
    actorAtCrossing: null,
    minGapM: Infinity,
    minGapAheadM: Infinity,
    playerWhenActorCrossed: null,
  };
  for (let i = 0; i < Math.round(opts.seconds / DT); i++) {
    const t = i * DT;
    const moving =
      opts.duty === undefined ||
      t % (opts.duty.goSec + opts.duty.stopSec) < opts.duty.goSec;
    const want = moving ? opts.targetMps : 0;
    v = want > v ? Math.min(want, v + HERO_ACCEL_MPS2 * DT) : Math.max(want, v - 4 * DT);
    const before = p;
    p += v * DT;
    const x = opts.axis === "x" ? p : opts.fixed;
    const y = opts.axis === "y" ? p : opts.fixed;
    stepFrame(
      stack,
      { x, y, headingDeg: opts.headingDeg, speedKmh: v * 3.6, brakePedal: v < 0.1 ? 1 : 0 },
      { indicator: "off", mirrorGlance: null },
    );
    const a = stack.traffic.staged(opts.actorId);
    if (a) {
      const gap = Math.hypot(a.x - x, a.y - y);
      leg.minGapM = Math.min(leg.minGapM, gap);
      if (actorAxis === opts.axis && (actorAxis === "x" ? a.x : a.y) >= p) {
        leg.minGapAheadM = Math.min(leg.minGapAheadM, gap);
      }
      const ap = actorAxis === "x" ? a.x : a.y;
      // The player's crossing of the node — sampled once, on the frame it happens.
      if (!playerCrossed && before < opts.crossAt && p >= opts.crossAt) {
        playerCrossed = true;
        leg.actorAtCrossing = { x: a.x, y: a.y };
      }
      // The actor's crossing — the EV comes DOWN the east arm, so its axis
      // value falls through the node rather than rising through it.
      if (!actorCrossed && Math.abs(ap) < 4 && leg.playerWhenActorCrossed === null) {
        actorCrossed = true;
        leg.playerWhenActorCrossed = p;
      }
    }
    if (opts.stopAt !== undefined && p >= opts.stopAt) break;
  }
  leg.violations = [
    ...new Set(stack.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code)),
  ];
  leg.commendations = [
    ...new Set(stack.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code)),
  ];
  return leg;
}

const junctionLeg = (targetMps: number): Leg =>
  driveStraight({
    districtId: "tj-rhr-v1",
    staged: [...(SC_VU_EMERGENCY_JUNCTION.staged ?? [])] as StagedEventSpec[],
    actorId: "sc-vuej-ev",
    axis: "y",
    fixed: 4.0625,
    from: -105, // tj-spawn-south
    headingDeg: 0,
    targetMps,
    seconds: 45,
    crossAt: 0, // tj-n-c
    actorAxis: "x", // the EV runs the east arm: x 95 → −150
  });

// ---------------------------------------------------------------------------
// 1. sc-vu-emergency-junction — the careful student MUST keep his crossing
// ---------------------------------------------------------------------------

describe("sc-vu-emergency-junction: the ambulance in front of the careful student — must stay true", () => {
  it("a student at the pace his own objective authorises watches it cross while he is still short of the mouth", () => {
    // sc-vuej-approach caps the approach at 25 км/ч and instruction 4 says
    // «Спри преди кръстовището». This is that drive, held at 10 км/ч — and the
    // whole point of pinning it is that the repair specified at VU_EV_CROSSING
    // (hold −45, or armDistM 110) must NOT buy the barge a conviction by making
    // the ambulance cross before the yielding student gets there. Both rungs of
    // that ladder were measured against this leg and neither moved it: the EV
    // reaches the node at t ≈ 30.4 s with the student ~23 m short.
    const leg = junctionLeg(CRAWL_MPS);
    expect(leg.playerWhenActorCrossed).not.toBeNull();
    // Still short of the junction area (lineDistM 18) when it goes through.
    expect(leg.playerWhenActorCrossed!).toBeLessThan(-18);
    // …and near enough to be an event rather than a rumour.
    expect(leg.playerWhenActorCrossed!).toBeGreaterThan(-45);
    // He is charged with nothing: he never entered anybody's path.
    expect(leg.violations).not.toContain("FAILED_TO_YIELD");
  });
});

describe("sc-vu-emergency-junction: the barge — TRIPWIRE: red is the goal", () => {
  it("a flat-out approach crosses the box with the ambulance still 60+ m away, and is charged nothing", () => {
    // BOTH mistake demos of this template are about entering in front of the
    // ambulance and BOTH cite FAILED_TO_YIELD; a live student who does it is
    // charged with speeding and nothing else (staging pc-wrong: 12 ×
    // «Превишена скорост», no чл. 91). Arithmetic and the measured hold/arm
    // ladder are at VU_EV_CROSSING.
    //
    // WHEN THE COORDINATED REPAIR LANDS (retime traces/scVuEmergencyJunction.ts,
    // re-record, then move the number), this whole `it` is replaced by:
    //     expect(leg.actorAtCrossing!.x).toBeLessThan(45);
    //     expect(leg.violations).toContain("FAILED_TO_YIELD");
    //     expect(leg.violations).not.toContain("COLLISION");
    const leg = junctionLeg(FLAT_OUT_MPS);
    expect(leg.actorAtCrossing).not.toBeNull();
    expect(leg.actorAtCrossing!.x).toBeGreaterThan(60);
    expect(leg.violations).not.toContain("FAILED_TO_YIELD");
  });

  it("and it is short by construction: the EV's own transit exceeds the whole approach window", () => {
    // The same defect stated as the arithmetic the site comment claims, so the
    // two cannot drift apart. armDistM − lineDistM is the approach the sync
    // gets; leadSec is how much later than the player the EV is allowed to be.
    const spec = SC_VU_EMERGENCY_JUNCTION.staged![0] as {
      armDistM: number;
      lineDistM: number;
      leadSec: number;
      actor: { hold: { offsetM: number }; cruiseSpeedMps: number };
    };
    const approachM = spec.armDistM - spec.lineDistM; // 52 m
    const windowSec = approachM / FLAT_OUT_MPS + Math.abs(spec.leadSec); // 6.67 s
    const minTransitSec = Math.abs(spec.actor.hold.offsetM) / spec.actor.cruiseSpeedMps; // 9.5 s
    // RED IS THE GOAL: flip to `toBeLessThanOrEqual` with the repair.
    expect(minTransitSec).toBeGreaterThan(windowSec);
  });
});

// ---------------------------------------------------------------------------
// 2. sc-vu-pass-clearance — the rider who leaves before the student arrives
// ---------------------------------------------------------------------------

const passLeg = (
  targetMps: number,
  seconds: number,
  duty?: { goSec: number; stopSec: number },
): Leg =>
  driveStraight({
    districtId: "vu-pass-v1",
    staged: [...(SC_VU_PASS_CLEARANCE.staged ?? [])] as StagedEventSpec[],
    actorId: "sc-vup-cyclist",
    axis: "y",
    fixed: 4.06, // the northbound lane centre — the do-nothing line
    from: 15, // vup-spawn-start
    headingDeg: 0,
    targetMps,
    seconds,
    crossAt: 360,
    ...(duty ? { duty } : {}),
    // sc-vup-finish is (4.06, 300) r9, so the lesson is over at y = 291 and
    // nothing after it is evidence about what the student saw.
    stopAt: 291,
  });

describe("sc-vu-pass-clearance: the clearance lesson at a real city pace — must stay true", () => {
  it("a driver who never leaves the lane centre IS convicted of the squeeze", () => {
    // The direction the rider's release must never cost: whatever hold he is
    // eventually given (see DEFECT 8 at VU_PASS_CYCLIST), a driver who reaches
    // him without moving over must still be charged for it.
    const leg = passLeg(FLAT_OUT_MPS, 40);
    expect(leg.violations).toContain("VULNERABLE_PASS_TOO_CLOSE");
    expect(leg.commendations).not.toContain("YIELDED_TO_PRIORITY");
    // He was genuinely alongside — not convicted from across the street.
    expect(leg.minGapM).toBeLessThan(4);
  });
});

/**
 * THE TWO `it`s BELOW WERE THE TRIPWIRES FOR DEFECT 8 AND THEY WENT RED ON
 * 2026-08-22, which is what they were for. Each is replaced by the assertion it
 * named, plus the one it could not have named because the second critical
 * (953fbed1) was filed after it was written.
 */
describe("sc-vu-pass-clearance: the hold that actually holds", () => {
  it("releaseDistM is SHORTER than the whole approach, so the rider waits to be closed on", () => {
    const spec = SC_VU_PASS_CLEARANCE.staged![0] as {
      releaseDistM: number;
      junction: { x: number; y: number };
      actor: { hold: { offsetM: number } };
    };
    // vup-spawn-start (4.06, 15) → vup-n-end (0, 360).
    const spawnToJunctionM = Math.hypot(4.06 - spec.junction.x, 15 - spec.junction.y);
    expect(spawnToJunctionM).toBeCloseTo(345.02, 1);
    // The defect was `releaseDistM 360 > 345.02` — a trigger already satisfied
    // on frame one, i.e. a field that described a hold this street never had.
    expect(spec.releaseDistM).toBeLessThan(spawnToJunctionM);
    // …and the release must still fire BEHIND the rider, or the "hold" would
    // only end after the student had already gone past a standing bicycle.
    const holdY = spec.junction.y + spec.actor.hold.offsetM; // 140
    const releaseY = spec.junction.y - spec.releaseDistM; // 125
    expect(releaseY).toBeLessThan(holdY);
    // Worst case of the runner's ±5 m jitter still leaves him ahead.
    expect(releaseY + 5).toBeLessThan(holdY);
  });

  it("a student below the rider's own speed now MEETS him, and always with the rider ahead", () => {
    // This is the pace the sweep actually drove — 22–27 full stops in three
    // minutes — and the pace both open criticals were photographed at. On the
    // shipped numbers this leg came back with minGapM > 90 and nothing graded
    // in either direction: the lesson was neither passed nor failed, it was
    // ABSENT. Now the rider is standing at the kerb when the student arrives.
    const leg = passLeg(4.5, 180, { goSec: 4, stopSec: 4 });
    expect(leg.minGapM).toBeLessThan(20);
    // 953fbed1: the closest approach must happen with him IN FRONT. On the
    // shipped numbers `minGapM` was 61.5 m and `minGapAheadM` 92.1 m — every
    // close approach was from ASTERN, after FR-B5-RETURN rewound him behind a
    // student he then overtook.
    expect(leg.minGapAheadM).toBe(leg.minGapM);
  });

  it("and at the slowest pace the sweep ever drove, he is never once astern before the finish", () => {
    // 11 км/ч with a 5-on/3-off duty cycle — slower than the rider's own
    // 3.0 m/s, so the student cannot overtake him and must not be pretended to
    // have. What he must NOT get is the rider arriving from behind him.
    const leg = passLeg(CRAWL_MPS + 0.25, 200, { goSec: 5, stopSec: 3 });
    expect(leg.minGapM).toBeLessThan(20);
    expect(leg.minGapAheadM).toBe(leg.minGapM);
    // He never overtakes at that pace, so nothing about the pass is claimed —
    // and nothing is falsely convicted either (the tracker's own speed floor).
    expect(leg.violations).not.toContain("VULNERABLE_PASS_TOO_CLOSE");
  });
});

/**
 * THE WINDOW THE REPAIR LIVES IN, MADE EXECUTABLE.
 *
 * DEFECT 8's old note concluded „the fix needs traces/scVuPass.ts retimed"
 * from a SINGLE sampled rung (`releaseDistM 295`, which really does break the
 * late-dive demo). The band was never scanned. It is scanned here, every run:
 * the three committed scripts are replayed against the rider at each release
 * distance the runner's ±5 m jitter can actually produce, and each must still
 * grade EXACTLY the codeRefs its template row claims.
 *
 * This is the assertion that stops the repair rotting. A later hand nudging
 * `releaseDistM` a few metres — 250 is measurably outside the window even
 * though 245 and 255 are inside it — turns a mistake demo into a demo that
 * convicts nothing, and the §5/§9 gate would only catch it at the shipped
 * value, not at the jittered ones the student actually meets.
 */
describe("sc-vu-pass-clearance: the three committed demos survive the WHOLE jitter band", () => {
  const passDistrict = loadDistrict("vu-pass-v1");
  const DEMOS = [
    { name: "shadow-correct", script: scVuPassShadowScript, expect: [] as string[] },
    {
      name: "mistake-squeeze",
      script: scVuPassMistakeSqueezeScript,
      expect: [...SC_VU_PASS_CLEARANCE.mistakes[0].codeRefs],
    },
    {
      name: "mistake-fast-close",
      script: scVuPassMistakeFastCloseScript,
      expect: [...SC_VU_PASS_CLEARANCE.mistakes[1].codeRefs],
    },
  ] as const;

  const shipped = SC_VU_PASS_CLEARANCE.staged![0] as CyclistRightHookSpec;
  /** The runner draws `releaseDistM + (rng()*2−1)*5`, and the draw changes with
   *  the retry count — so every metre of this band is a live configuration. */
  const band = [
    shipped.releaseDistM - 5,
    shipped.releaseDistM - 2.5,
    shipped.releaseDistM,
    shipped.releaseDistM + 2.5,
    shipped.releaseDistM + 5,
  ];

  for (const rung of band) {
    for (const demo of DEMOS) {
      it(`${demo.name} still grades exactly its codeRefs at releaseDistM ${rung}`, () => {
        const staged = [
          { ...shipped, releaseDistM: rung },
        ] as unknown as StagedEventSpec[];
        const drive = recordScriptedDrive(structuredClone(passDistrict), demo.script(), {
          scenarioId: "sc-vu-pass-clearance",
          kind: demo.name === "shadow-correct" ? "shadow" : "mistake",
          seed: 7,
          stagedEvents: staged,
        });
        const codes = [
          ...new Set(drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code)),
        ].sort();
        expect(codes).toEqual([...demo.expect].sort());
      });
    }
  }

  it("the shadow keeps its commendation across the band", () => {
    for (const rung of band) {
      const staged = [{ ...shipped, releaseDistM: rung }] as unknown as StagedEventSpec[];
      const drive = recordScriptedDrive(structuredClone(passDistrict), scVuPassShadowScript(), {
        scenarioId: "sc-vu-pass-clearance",
        kind: "shadow",
        seed: 7,
        stagedEvents: staged,
      });
      const codes = drive.ruleEvents
        .filter((e) => e.kind === "commendation")
        .map((e) => e.code);
      expect(codes, `rung ${rung}`).toContain("YIELDED_TO_PRIORITY");
    }
  });
});

// ---------------------------------------------------------------------------
// 3. sc-vu-cyclist-hook — the commendation paid to the car that never turned
// ---------------------------------------------------------------------------

describe("sc-vu-cyclist-hook: the чл. 25 commendation — TRIPWIRE: red is the goal", () => {
  it("a car that blasts STRAIGHT through at 59 км/ч, never turning, is commended for yielding to the cyclist", () => {
    // Staging, both flat-out legs: 59 км/ч, ZERO full stops, TWO
    // «Пътнотранспортно произшествие», НЕИЗДЪРЖАН — and «★ ✓ Правилно
    // отстъпено предимство» at 0:37 (pc) and 0:44 (mobile). Both careful legs,
    // 23 and 24 full stops: no commendation at all. Here is the same drive.
    //
    // WHEN THE RUNNER REPAIR LANDS (CyclistRightHookRunner must require the
    // right turn and a clear rider before it pays "yielded" — see the note at
    // VU_CYCLIST), this becomes:
    //     expect(leg.commendations).not.toContain("YIELDED_TO_PRIORITY");
    const leg = driveStraight({
      districtId: "vu-cyclist-v1",
      staged: [...(SC_VU_CYCLIST_HOOK.staged ?? [])] as StagedEventSpec[],
      actorId: "sc-vu-cyclist",
      axis: "x",
      fixed: -4.06, // the eastbound lane — the driver's own
      from: -115, // vu-spawn-west
      headingDeg: 90,
      targetMps: FLAT_OUT_MPS,
      seconds: 30,
      crossAt: 0, // vu-n-c
    });
    expect(leg.commendations).toContain("YIELDED_TO_PRIORITY");
    // …paid to a car that was never anywhere but its own lane at full speed.
    expect(leg.violations).toContain("SPEEDING_OVER_LIMIT");
  });
});

// ---------------------------------------------------------------------------
// 4. sc-vu-emergency — the commendation paid to the car that never got going
// ---------------------------------------------------------------------------

const emergencyLeg = (targetMps: number): Leg =>
  driveStraight({
    districtId: "ln-v1",
    staged: [...(SC_VU_EMERGENCY.staged ?? [])] as StagedEventSpec[],
    actorId: "sc-vue-approach",
    axis: "y",
    fixed: 12.19, // ln-spawn-start, the RIGHT lane — where every student starts
    from: 15,
    headingDeg: 0,
    targetMps,
    seconds: 30,
    crossAt: 400,
  });

describe("sc-vu-emergency: the чл. 91 commendation — must stay true", () => {
  it("the flat-out right-lane drive is convicted, not commended", () => {
    // The half `accelMps2: 1.5` fixed, re-measured here so a later hand cannot
    // undo it while chasing the crawl below.
    const leg = emergencyLeg(FLAT_OUT_MPS);
    expect(leg.violations).toContain("EMERGENCY_NOT_YIELDED");
    expect(leg.commendations).not.toContain("YIELDED_TO_PRIORITY");
  });
});

describe("sc-vu-emergency: the slow car that did nothing — TRIPWIRE: red is the goal", () => {
  it("a car held at 10 км/ч, never braking, never shifting, is commended for making way", () => {
    // «✓ Правилно отстъпено предимство» at 0:06 (pc) / 0:14 (mobile) on both
    // careful legs of the sweep. `slowedKeepingRight` asks an absolute
    // question and a car that was never fast answers yes forever — see
    // DEFECT 7 at EM_APPROACH for why lowering yieldSlowKmh is the wrong cure.
    //
    // WHEN THE RUNNER REPAIR LANDS (latch the slow half on a measured DROP
    // after the arm), this becomes:
    //     expect(leg.commendations).not.toContain("YIELDED_TO_PRIORITY");
    //     expect(leg.violations).toContain("EMERGENCY_NOT_YIELDED");
    const leg = emergencyLeg(CRAWL_MPS);
    expect(leg.commendations).toContain("YIELDED_TO_PRIORITY");
    expect(leg.violations).not.toContain("EMERGENCY_NOT_YIELDED");
  });
});

// ---------------------------------------------------------------------------
// 5. sc-vu-pass-clearance — what the DEFECT 8 repair did NOT buy
//
// Added 2026-08-22 by the adversarial verifier of that repair. Two properties
// the repair's own note claims more broadly than it holds, measured through the
// same production stack and the same finish-gate scoping the repair's tests
// use. Both are GREEN today because both defects are live; each names the
// assertion that replaces it. Neither reopens the two closed criticals — the
// rider IS met in front on every pace probed, which is what those two were
// about — and both are here so the residue cannot be re-discovered from
// scratch by the next hand.
// ---------------------------------------------------------------------------

describe("sc-vu-pass-clearance: the astern approach the repair narrowed but did not end — TRIPWIRE: red is the goal", () => {
  // The repair's own behaviour tests use stop-go 4/4 @16 and 5/3 @11, and on
  // BOTH of those the drive is over before FR-B5-RETURN rewinds the rider. Two
  // rungs further down the same duty cycle — still inside the sweep's „22–27
  // full stops in three minutes", still stopping at the finish gate — the
  // rewind fires with lesson left to run and the rider's CLOSEST approach is
  // again from behind, which is 953fbed1's own sentence.
  //
  // WHEN traffic/staged.ts GROWS ITS PER-SPEC OPT-OUT (a `retire`/`noReturn`
  // flag on StagedVehicleSpec, so a one-shot VRU is not recycled), each of
  // these becomes:
  //     expect(leg.minGapAheadM).toBe(leg.minGapM);
  for (const [name, duty] of [
    ["3/8", { goSec: 3, stopSec: 8 }],
    ["2/6", { goSec: 2, stopSec: 6 }],
  ] as const) {
    it(`at stop-go ${name} @16 км/ч the closest the rider ever comes is still from ASTERN`, () => {
      const leg = passLeg(4.5, 400, duty);
      // He IS met in front first — the repair's whole point, and the half of
      // this that must never regress.
      expect(leg.minGapAheadM).toBeLessThan(20);
      // …but the rewind then brings him back closer than he ever was ahead.
      expect(leg.minGapM).toBeLessThan(leg.minGapAheadM);
    });
  }
});

describe("sc-vu-pass-clearance: the rider stands still while the copy says he rides — TRIPWIRE: red is the goal", () => {
  // objectiveBg: „Покрай десния бордюр СЕ ДВИЖИ велосипедист"; instruction 2:
  // „покрай десния бордюр КАРА велосипедист". The hold is 125 m up an open
  // street in the windscreen, so the careful student watches a motionless
  // bicycle for most of his approach. The shipped-before-2026-08-22 numbers had
  // no standstill at all (and no encounter either — that was DEFECT 8).
  //
  // WHEN THE COPY OR THE RIG IS MADE HONEST (a briefing that says he is waiting
  // at the kerb, or a hold that idles the rig instead of freezing it), this
  // becomes a positive assertion about whichever of the two landed.
  const heldSecondsAt = (targetMps: number, duty?: { goSec: number; stopSec: number }): number => {
    // The release is a function of the DRIVER's y only (releaseDistM from
    // vup-n-end), so the standstill is exactly how long the driver takes to
    // reach y = 360 − releaseDistM from the spawn at y = 15, at this pace.
    const spec = SC_VU_PASS_CLEARANCE.staged![0] as {
      releaseDistM: number;
      junction: { y: number };
    };
    const releaseY = spec.junction.y - spec.releaseDistM;
    let v = 0;
    let p = 15;
    for (let i = 0; ; i++) {
      const t = i * DT;
      if (p >= releaseY) return t;
      if (t > 600) return t; // never released at this pace
      const moving = duty === undefined || t % (duty.goSec + duty.stopSec) < duty.goSec;
      const want = moving ? targetMps : 0;
      v = want > v ? Math.min(want, v + HERO_ACCEL_MPS2 * DT) : Math.max(want, v - 4 * DT);
      p += v * DT;
    }
  };

  it("the careful student watches a frozen bicycle for over a minute", () => {
    // The pace the sweep photographed sc-vu-pass-clearance at.
    expect(heldSecondsAt(4.5, { goSec: 4, stopSec: 6 })).toBeGreaterThan(60);
    expect(heldSecondsAt(4.5, { goSec: 3, stopSec: 8 })).toBeGreaterThan(100);
  });

  it("…and a student at a normal city speed barely sees it, which is why it survived the repair's own grid", () => {
    expect(heldSecondsAt(FLAT_OUT_MPS)).toBeLessThan(12);
    expect(heldSecondsAt(8.3)).toBeLessThan(20);
  });
});
