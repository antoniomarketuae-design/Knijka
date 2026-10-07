/**
 * WITNESS — sc-mv-uturn-ban:e98407b1, clause 4, THE RIGHT SIDE: «the lesson's
 * own rule is never the ground of the verdict on either the right or the wrong
 * side».
 *
 * The w81 capture (2026-10-06, at 2127d8f, /dev/drive-rig with the real
 * LessonPlayShell) settled the WRONG side: the turn across the solid axis is
 * named «Обратен завой през непрекъсната осева линия», with В23 and чл. 38 in
 * its corrective. Its verifier measured the RIGHT side still open: on the
 * lawful turn-round at the gap (axis crossed at y 275.01, outside the ban span
 * y 40-220; completed; ИЗДЪРЖАН, 0 т., ★★★) the debrief grounded the pass on
 * «0 наказателни точки», the stars, the economy line «Обратен завой в едно
 * движение — чиста маневра» and two generic commendations. Nothing said that
 * the student passed the ban and turned where the axis is broken.
 *
 * THE REPAIR this file pins, every drive through the live rung chain
 * (`witnessLiveRung`: the compiled rung → createLessonSession → applyTick →
 * buildLessonResult → buildDebrief), L1 to L5:
 *
 *   a lesson-specific commendation, UTURN_PAST_SOLID_AXIS, titled
 *   «Подмина забраната, обърна на прекъснатата осева», is minted on the frame
 *   the drive completes with every task done, and ONLY when
 *     G1  the rule engine's own tracker confirmed a turn-round (ADR-013 — the
 *         SAME tracker and the same confirmation that names the illegal one)
 *         that BEGAN where the axis is broken, after the car had been on the
 *         solid span of that road;
 *     G2  no turn-round of the drive began where the axis is solid, or where
 *         the road could not place it;
 *     G3  nothing in the drive was billed, coached or folded as a crossing or
 *         a touch of the axis (CROSSED_SOLID_LINE, CENTER_LINE_TOUCHED), a
 *         failure to let the oncoming pass (FAILED_TO_YIELD) or a contact
 *         (COLLISION) — praise needs the act to have happened LAWFULLY;
 *     G4  the drive completes on this frame with every task done (the
 *         lesson's own turn objective included) and no exam termination.
 *
 * THE TRUTH IS ALSO MEASURED INDEPENDENTLY OF THE PRODUCT: `uturnActOracle.ts`
 * recomputes every turn-round, its begin station and whether the axis there is
 * solid, from the raw pose alone; the lawful drive is pinned against it.
 *
 * THE VERDICT AND EVERY SCORE ARE UNCHANGED: on the lawful drive the sheet,
 * the coached channel, `passed`, `score` and every other commendation are
 * pinned to what base produced.
 *
 * KILL-CHECKS (each reddens this file on an assertion; restored, sha-verified;
 * the hand-off report has the transcripts):
 *   · M1  G1/G2's «began outside the span» dropped (a turn-round placed where
 *         the axis is solid counts as one at the gap) → §D1 red;
 *   · M2  G3 dropped (a solid crossing / touch no longer withholds it) → §E red;
 *   · M3  G1 and G4 dropped (minted on a completing frame with no completed
 *         turn-round: the drive the product ends past the gap) → §F2 red.
 */

import { describe, expect, it } from "vitest";
import type { DriveScript } from "../../../traces/recorder";
import {
  scMvUturnBanMistakeCrossSolidScript,
  scMvUturnBanMistakeIntoStreamScript,
  scMvUturnBanShadowScript,
} from "../../../traces/scMvUturnBan";
import { SC_MV_UTURN_BAN } from "../templates-parking2";
import { oracle, SPAN } from "./uturnActOracle";
import { driveLiveRung, type LiveRungOutcome } from "./witnessLiveRung";

/** Literals, so a product that never mints it is red on an assertion. */
const PRAISE_CODE = "UTURN_PAST_SOLID_AXIS";
const PRAISE_TITLE = "Подмина забраната, обърна на прекъснатата осева";
const ALL_RUNGS = [1, 2, 3, 4, 5] as const;
type Rung = (typeof ALL_RUNGS)[number];

type Steps = DriveScript["steps"];
type Pt = [number, number];
const LANE_OUT = 12.19;
const LANE_IN = 4.06;
const rad = (d: number) => (d * Math.PI) / 180;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** An arc of radius r from pose (x0, y0, heading h0 — degrees LEFT of north), turning `turnDeg` (+ = left). */
function arc(x0: number, y0: number, h0: number, r: number, turnDeg: number, stepDeg = 3): { pts: Pt[]; x: number; y: number } {
  const left = turnDeg >= 0;
  const cx = x0 + r * (left ? -Math.cos(rad(h0)) : Math.cos(rad(h0)));
  const cy = y0 + r * (left ? -Math.sin(rad(h0)) : Math.sin(rad(h0)));
  const pts: Pt[] = [];
  const n = Math.max(1, Math.ceil(Math.abs(turnDeg) / stepDeg));
  let x = x0;
  let y = y0;
  for (let i = 0; i <= n; i++) {
    const h = h0 + (turnDeg * i) / n;
    x = cx - r * (left ? -Math.cos(rad(h)) : Math.cos(rad(h)));
    y = cy - r * (left ? -Math.sin(rad(h)) : Math.sin(rad(h)));
    pts.push([r3(x), r3(y)]);
  }
  return { pts, x, y };
}

/** The lesson's own correct drive from the outer lane at y 195 on: into the inner lane, the gap, the wait, the lawful arc. */
function lawfulTailFrom195(): Steps {
  const shadow = scMvUturnBanShadowScript().steps;
  const at = shadow.findIndex(
    (s) => s.kind === "drive" && s.points[0][0] === LANE_OUT && s.points[0][1] === 195,
  );
  if (at < 2) throw new Error("the shadow script no longer joins the inner lane from (12.19, 195)");
  return shadow.slice(at - 2); // glance left, indicator left, the lane change, … the arc, settle, pause
}

/** The lesson's own correct drive up to the gap and the wait — and no turn. */
function lawfulHeadWithoutTheTurn(): Steps {
  const shadow = scMvUturnBanShadowScript().steps;
  const pause = shadow.findIndex((s) => s.kind === "pause" && s.sec === 14.5);
  if (pause < 0) throw new Error("the shadow script no longer waits 14.5 s at the gap");
  return [...shadow.slice(0, pause + 1), { kind: "pause", sec: 20, brake: true }];
}

/** F2 — the lesson's route into the inner lane, then straight on past the gap and away north: the drive ENDS (the
 *  product closes it 48 s in, the turn task undone) — a completing frame with no turn-round on it. */
function pastTheGapWithoutTurning(): DriveScript {
  const shadow = scMvUturnBanShadowScript().steps;
  const toGap = shadow.findIndex((s) => s.kind === "drive" && s.targetKmh === 22);
  if (toGap < 0) throw new Error("the shadow script no longer rolls up to the gap at 22 km/h");
  return {
    steps: [
      ...shadow.slice(0, toGap),
      { kind: "drive", points: [[LANE_IN, 235], [LANE_IN, 300], [LANE_OUT, 330], [LANE_OUT, 560]], targetKmh: 40 },
      { kind: "pause", sec: 15, brake: true },
    ],
  };
}

/**
 * D1 — TWO TURN-ROUNDS INSIDE THE BAN SPAN, NEITHER BILLED, THEN THE LAWFUL ONE.
 * From the kerb at y 120 a turn-round wholly on the own half (r 6.2 — the
 * centre never reaches the axis, so R5-2 bills nothing: the recorded class),
 * then a second one back north on the same half, then the lesson's own route
 * to the gap and its lawful arc. The drive completes every task with no axis
 * bill at all — so only the «began outside the span» gate can withhold the
 * praise, and it must: two of the three turn-rounds were made inside the ban.
 */
function twoTurnRoundsInTheSpanThenLawful(): DriveScript {
  const a = arc(14.5, 120, 0, 6.2, 180);
  const b = arc(a.x, a.y, 180, 6.2, 180);
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE_OUT, 15], [LANE_OUT, 80], [14.5, 100], [14.5, 120]], targetKmh: 40 },
      { kind: "pause", sec: 0.8, brake: true },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [...a.pts, ...b.pts.slice(1)], targetKmh: 9, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[r3(b.x), r3(b.y)], [LANE_OUT, 140], [LANE_OUT, 195]], targetKmh: 40, stopAtEnd: false },
      ...lawfulTailFrom195(),
    ],
  };
}

/** D2 — one arc from the outer lane inside the span, the centre over the solid axis (the U-turn itself), then on south. */
function oneArcInsideTheSpan(): DriveScript {
  const a = arc(LANE_OUT, 130, 0, 8.125, 180);
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE_OUT, 15], [LANE_OUT, 130]], targetKmh: 40 },
      { kind: "pause", sec: 0.8, brake: true },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: a.pts, targetKmh: 9, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[r3(a.x), r3(a.y)], [r3(a.x), 100]], targetKmh: 25 },
      { kind: "pause", sec: 1.5, brake: true },
    ],
  };
}

/** E1 — the centre 0.4 m over the SOLID axis for 13 m inside the span, back into lane, then the lawful turn at the gap. */
function crossedTheSolidAxisThenLawful(): DriveScript {
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE_OUT, 15], [LANE_OUT, 60]], targetKmh: 40, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[LANE_OUT, 60], [8, 75], [LANE_IN, 90]], targetKmh: 30, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      {
        kind: "drive",
        points: [[LANE_IN, 90], [1.5, 105], [-0.4, 115], [-0.4, 128], [1.5, 138], [LANE_IN, 150], [LANE_IN, 235], [LANE_IN, 264]],
        targetKmh: 30,
      },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      ...lawfulTailFrom195().slice(lawfulTailFrom195().findIndex((s) => s.kind === "pause")),
    ],
  };
}

/** E2 — ridden ON the solid axis (centre 0.6 m from it, the body astride the paint, the indicator long off) for ~45 m, never across; then the lawful turn. */
function rodeTheSolidAxisThenLawful(): DriveScript {
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE_OUT, 15], [LANE_OUT, 40]], targetKmh: 40, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[LANE_OUT, 40], [8, 52], [LANE_IN, 64]], targetKmh: 30, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[LANE_IN, 64], [LANE_IN, 110], [0.6, 125], [0.6, 170], [LANE_IN, 185], [LANE_IN, 235], [LANE_IN, 264]], targetKmh: 25 },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      ...lawfulTailFrom195().slice(lawfulTailFrom195().findIndex((s) => s.kind === "pause")),
    ],
  };
}

/** G — the lawful arc at the gap, then on south without stopping in the turn box, into the span and over the solid axis. */
function lawfulArcThenOverTheSolidAxis(): DriveScript {
  const shadow = scMvUturnBanShadowScript().steps;
  const arcIdx = shadow.findIndex((s) => s.kind === "drive" && s.targetKmh === 8);
  return {
    steps: [
      ...shadow.slice(0, arcIdx + 1),
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[-LANE_OUT, 264], [-LANE_OUT, 230], [-LANE_IN, 215], [1.5, 190], [1.5, 160], [-LANE_IN, 140], [-LANE_IN, 120]], targetKmh: 25 },
      { kind: "pause", sec: 1.5, brake: true },
    ],
  };
}

const cache = new Map<string, LiveRungOutcome>();
function drive(name: string, script: () => DriveScript, level: Rung): LiveRungOutcome {
  const key = `${name}@L${level}`;
  let o = cache.get(key);
  if (o === undefined) {
    o = driveLiveRung(SC_MV_UTURN_BAN, level, script());
    cache.set(key, o);
  }
  return o;
}
const praises = (o: LiveRungOutcome) =>
  o.session.events.filter((e) => e.kind === "commendation" && (e.code as string) === PRAISE_CODE);
const otherCommendations = (o: LiveRungOutcome) =>
  o.session.events.filter((e) => e.kind === "commendation" && (e.code as string) !== PRAISE_CODE).map((e) => e.code);
const nowhereIn = (o: LiveRungOutcome) => {
  expect(praises(o)).toEqual([]);
  expect(o.result.summary.commendations.map((c) => c.titleBg)).not.toContain(PRAISE_TITLE);
  expect(o.debrief).not.toContain(PRAISE_TITLE);
};

describe("§A the lawful turn-round at the gap (the committed shadow-correct drive) — praised for the rule it obeyed", () => {
  for (const level of ALL_RUNGS) {
    it(`L${level}: one UTURN_PAST_SOLID_AXIS, titled «${PRAISE_TITLE}», on the sheet and in the debrief; verdict and scores as base`, () => {
      const o = drive("shadow", scMvUturnBanShadowScript, level);
      // The truth, from the raw pose (no product state): ONE turn-round, begun
      // where the axis is broken, PAST the ban span; no crossing of the solid axis.
      const truth = oracle(o.ticks);
      expect(truth.turnRounds).toHaveLength(1);
      expect(truth.turnRounds[0].beginSolid).toBe(false);
      expect(truth.turnRounds[0].beginY).toBeGreaterThan(SPAN.toY);
      expect(truth.crossings.filter((c) => c.solid)).toEqual([]);
      // The praise.
      const p = praises(o);
      expect(p).toHaveLength(1);
      expect(p[0].titleBg).toBe(PRAISE_TITLE);
      expect(p[0].t).toBe(o.session.endedAtSec);
      expect(o.result.summary.commendations.filter((c) => c.titleBg === PRAISE_TITLE)).toHaveLength(1);
      expect(o.debrief).toContain(`• ${PRAISE_TITLE}`);
      expect(o.debrief.indexOf(`• ${PRAISE_TITLE}`)).toBeGreaterThan(o.debrief.indexOf("Какво се получи добре:"));
      // The verdict and every score are base's (measured on base 2127d8f).
      expect(o.session.phase).toBe("completed");
      expect(o.result.passed).toBe(true);
      expect(o.result.score).toBe(0);
      expect(o.scored).toEqual([]);
      expect(o.coached).toEqual([]);
      expect(otherCommendations(o)).toEqual(["SAFE_LANE_CHANGE", "CLEAN_DRIVING", "YIELDED_TO_PRIORITY"]);
    });
  }
});

describe("§B/§C the two committed mistake demos — never praised", () => {
  for (const level of ALL_RUNGS) {
    it(`L${level}: mistake-cross-solid (the U-turn inside the span) → no praise`, () => {
      const o = drive("cross", scMvUturnBanMistakeCrossSolidScript, level);
      expect([...o.scored, ...o.coached]).toContain("CROSSED_SOLID_LINE");
      nowhereIn(o);
    });
    it(`L${level}: mistake-into-stream (the right place, in front of the stream) → no praise`, () => {
      const o = drive("stream", scMvUturnBanMistakeIntoStreamScript, level);
      expect([...o.scored, ...o.coached]).toContain("FAILED_TO_YIELD");
      nowhereIn(o);
    });
  }
});

describe("§D a turn-round made INSIDE the ban span — never praised", () => {
  for (const level of ALL_RUNGS) {
    it(`L${level}: D1 two unbilled turn-rounds on the own half inside the span, then the lawful one → the drive completes, no axis bill, still no praise`, () => {
      const o = drive("d1", twoTurnRoundsInTheSpanThenLawful, level);
      const truth = oracle(o.ticks);
      // The premise, from the pose: three turn-rounds, two begun on the solid
      // span, the last at the gap; the centre never crossed the solid axis.
      expect(truth.turnRounds.map((r) => r.beginSolid)).toEqual([true, true, false]);
      expect(truth.crossings.filter((c) => c.solid)).toEqual([]);
      // …and the product agrees that nothing about the axis was billed, and
      // that every task is done — so only «began outside the span» can withhold it.
      for (const code of ["CROSSED_SOLID_LINE", "CENTER_LINE_TOUCHED", "FAILED_TO_YIELD", "COLLISION"]) {
        expect([...o.scored, ...o.coached]).not.toContain(code);
      }
      expect(o.session.phase).toBe("completed");
      expect(o.done).toEqual({ "sc-mvu-pass-ban": true, "sc-mvu-turn": true });
      nowhereIn(o);
    });
    it(`L${level}: D2 one arc from the outer lane at y 130, over the solid axis → no praise`, () => {
      const o = drive("d2", oneArcInsideTheSpan, level);
      const truth = oracle(o.ticks);
      expect(truth.turnRounds[0].beginSolid).toBe(true);
      nowhereIn(o);
    });
  }
});

describe("§E a lawful turn at the gap on a drive that crossed or rode the solid axis earlier — never praised", () => {
  for (const level of ALL_RUNGS) {
    it(`L${level}: E1 centre 0.4 m over the solid axis inside the span (billed or coached), then the lawful turn → no praise`, () => {
      const o = drive("e1", crossedTheSolidAxisThenLawful, level);
      const truth = oracle(o.ticks);
      expect(truth.crossings.some((c) => c.solid)).toBe(true);
      expect(truth.turnRounds).toHaveLength(1);
      expect(truth.turnRounds[0].beginSolid).toBe(false);
      expect([...o.scored, ...o.coached]).toContain("CROSSED_SOLID_LINE");
      expect(o.done["sc-mvu-turn"]).toBe(true);
      nowhereIn(o);
    });
    it(`L${level}: E2 ridden on the solid axis, never across (CENTER_LINE_TOUCHED), then the lawful turn → no praise`, () => {
      const o = drive("e2", rodeTheSolidAxisThenLawful, level);
      expect([...o.scored, ...o.coached]).toContain("CENTER_LINE_TOUCHED");
      expect(o.done["sc-mvu-turn"]).toBe(true);
      nowhereIn(o);
    });
  }
});

describe("§F/§G no completed turn-round — never praised", () => {
  for (const level of ALL_RUNGS) {
    it(`L${level}: F drives the lesson's route to the gap, waits, never turns → no praise`, () => {
      const o = drive("f", () => ({ steps: lawfulHeadWithoutTheTurn() }), level);
      expect(oracle(o.ticks).turnRounds).toEqual([]);
      expect(o.done).toEqual({ "sc-mvu-pass-ban": true, "sc-mvu-turn": false });
      nowhereIn(o);
    });
    it(`L${level}: F2 drives past the gap and away, never turns — the drive ENDS with the turn undone → no praise on its completing frame`, () => {
      const o = drive("f2", pastTheGapWithoutTurning, level);
      expect(oracle(o.ticks).turnRounds).toEqual([]);
      expect(o.session.phase).toBe("completed");
      expect(o.done).toEqual({ "sc-mvu-pass-ban": true, "sc-mvu-turn": false });
      for (const code of ["CROSSED_SOLID_LINE", "CENTER_LINE_TOUCHED", "FAILED_TO_YIELD", "COLLISION"]) {
        expect([...o.scored, ...o.coached]).not.toContain(code);
      }
      nowhereIn(o);
    });
    it(`L${level}: G the lawful arc, then on south without stopping into the span and over the solid axis → no praise`, () => {
      const o = drive("g", lawfulArcThenOverTheSolidAxis, level);
      expect(oracle(o.ticks).crossings.some((c) => c.solid)).toBe(true);
      nowhereIn(o);
    });
  }
});
