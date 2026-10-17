/**
 * sc-junction-blind — THE COMMITTED CORRECT DEMO PASSES WITH 0 POINTS ON EVERY RUNG A STUDENT PLAYS, AND ITS LAST
 * CAPTION IS TRUE WHEN IT IS SHOWN (sc-sig-controller-postures:5ee4301e round 3, integrator decision D3).
 *
 * WHAT WAS WRONG. The demo held 8 s at the yield point and pulled out. That hold was timed on a street whose ambient
 * cars hopped the junction instead of driving through it; once they drive the box (traffic/graph.ts
 * `laneConnector`) and a car about to turn round waits for the student, the densest rung brings a second car from
 * the student's RIGHT into the mouth exactly as the 8 s hold releases. Measured through the live chain at L5
 * (`liveChainReplay`, the lesson's own compiled traffic): ambient car 1, out of the east arm and turning left, had
 * to brake from 22 km/h to 0 at (4.5, −0.1) for the tape — FAILED_TO_YIELD, 10 points, НЕИЗДЪРЖАН, on the drive the
 * lesson plays as «follow the shadow». The traffic was lawful; the demo was not careful: at a blind junction the
 * careful drive does not go on the first gap it is shown.
 *
 * THE DEMO NOW SETS OFF 5 s LATE AND HOLDS IN TWO LOOKS, 4 s + 9.85 s (traces/scJunctions2.ts
 * `scJunctionBlindShadowScript`, re-recorded through the project recorder — sc-ju2-traces.test.ts pins the committed
 * bytes to the script). The two numbers are measured, not argued: start delays 0–9 s × holds 7–16 s through this
 * chain on every rung AND through the 20-seed ratchet of jblind-model-line-in-compiled-traffic.test.ts; 5 s + 13.85 s
 * is the middle of the one region of that grid clean in both (holds 13.8–13.95 s at delays 4.75–5.25 s; at 14.0 s one
 * seed of the densest rung convicts again — the seed sweep is a lottery by its own account).
 *
 * PINNED HERE, on the committed tape, at L1–L5:
 *   · 0 points, no violation, passed, and the lesson's praise for the yield (YIELDED_TO_PRIORITY);
 *   · at the instant the tape pulls out — where it says «Отдясно вече не идва никой — завиваме наляво уверено.» —
 *     no vehicle, ambient or staged, is east of the student's lane heading for the junction, and for the whole hold
 *     it stood still (no creeping forward in the hold);
 *   · it never comes closer than 4 m (box to box) to an ambient car (measured: 6.4 m at L1/L2, 4.6 m at L3/L4,
 *     6.3 m at L5; the old tape at L5 pulled out in front of a car that had to stop for it);
 *   · the two mistake tapes are graded as they were: the barge is still FAILED_TO_YIELD on every rung, the blind
 *     roll-out still fails.
 *
 * WHAT THIS DOES NOT CLAIM. An open-loop tape cannot react: jblind-model-line-in-compiled-traffic.test.ts keeps its
 * 20-seed ratchet for the seeds a student never plays. This file is the street he does play.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseScenarioTrace } from "../../../traces/parse";
import type { ScenarioTrace } from "../../../traces/types";
import { compileScenario } from "../compile";
import { SC_JUNCTION_BLIND } from "../templates-junctions2";
import type { ScenarioLevel } from "../types";
import { liveChainReplay } from "./liveChainReplay";

const REPO = path.resolve(process.cwd(), "..");
const RAW: unknown = JSON.parse(readFileSync(path.join(REPO, "content", "world", "tj-occluded-v1.json"), "utf-8"));
const tape = (name: string): ScenarioTrace =>
  parseScenarioTrace(JSON.parse(readFileSync(path.join(REPO, "content", "traces", "sc-junction-blind", `${name}.trace.json`), "utf-8")))!;
const LEVELS = [1, 2, 3, 4, 5] as ScenarioLevel[];
/** The student's lane centre on the stem, m east of the junction node. */
const LANE = 4.0625;
/** The yield point the demo holds at (scJunctions2.ts). */
const YIELD_Y = -19.5;

/** When the tape leaves the yield point, and how long it had stood there. */
function hold(trace: ScenarioTrace): { goSec: number; stoodSec: number } {
  const ss = trace.samples;
  let go = -1;
  for (let i = 1; i < ss.length; i++) {
    if (ss[i - 1].speedKmh < 0.2 && ss[i].speedKmh >= 0.2 && Math.abs(ss[i - 1].y - YIELD_Y) < 0.5) go = i;
  }
  let from = go - 1;
  while (from > 0 && ss[from - 1].speedKmh < 0.2 && Math.abs(ss[from - 1].y - YIELD_Y) < 0.5) from--;
  return { goSec: ss[go - 1].tSec, stoodSec: ss[go - 1].tSec - ss[from].tSec };
}

describe("sc-junction-blind: the committed correct demo on the street the student plays", () => {
  const shadow = tape("shadow-correct");
  const { goSec, stoodSec } = hold(shadow);

  it("the tape stands at the yield point for the whole hold (4 s + 9.85 s) and says its captions in the order it drives them", () => {
    expect(stoodSec).toBeGreaterThan(13.8);
    expect(stoodSec).toBeLessThan(14.0);
    const said = shadow.events.filter((e) => e.kind === "annotation") as Array<{ tSec: number; textBg: string }>;
    const stop = said.findIndex((e) => e.textBg.startsWith("Кола отдясно се показа"));
    const again = said.findIndex((e) => e.textBg.startsWith("Първата кола мина, но не тръгваме веднага"));
    const clear = said.findIndex((e) => e.textBg === "Отдясно вече не идва никой — завиваме наляво уверено.");
    expect(stop).toBeGreaterThan(0);
    expect(again).toBe(stop + 1);
    expect(clear).toBe(again + 1);
    // The second look is said 4 s into the hold, the «nobody is coming» line as it ends.
    expect(said[again].tSec - said[stop].tSec).toBeCloseTo(4, 1);
    expect(said[clear].tSec).toBeCloseTo(goSec, 1);
    expect(said.some((e) => e.textBg.includes("Пътят е чист"))).toBe(false);
  });

  for (const level of LEVELS) {
    it(`L${level}: 0 points, praised for the yield, nobody coming from the right when it says so, never within 4 m of an ambient car`, () => {
      const fromRight: string[] = [];
      const out = liveChainReplay({
        lesson: compileScenario(SC_JUNCTION_BLIND, level),
        districtRaw: RAW,
        trace: shadow,
        afterApply: ({ t, traffic }) => {
          // The grid points of the half second around the pull-out, where the caption is on the glass.
          if (Math.abs(t - goSec) > 0.25) return;
          for (const v of traffic.vehicles) {
            // East of his lane, within 60 m of the node, heading for it (within 60° of due west).
            if (v.x > LANE && Math.hypot(v.x, v.y) < 60 && v.dirX < -0.5) {
              fromRight.push(`t=${t.toFixed(2)} vehicle ${v.id} at (${v.x.toFixed(1)}, ${v.y.toFixed(1)}) ${(v.speedMps * 3.6).toFixed(0)} km/h`);
            }
          }
        },
      });
      expect(out.violationCodes).toEqual([]);
      expect(out.result.score).toBe(0);
      expect(out.result.passed).toBe(true);
      expect(out.commendationCodes).toContain("YIELDED_TO_PRIORITY");
      expect(out.ambientContacts).toEqual([]);
      expect(fromRight).toEqual([]);
      expect(out.minAmbientSeparationM).toBeGreaterThan(4);
    });
  }

  it("the two mistake tapes are graded as they were on every rung: the barge FAILED_TO_YIELD, the blind roll-out failed", () => {
    const barge = tape("mistake-barge");
    const noLook = tape("mistake-no-look");
    for (const level of LEVELS) {
      const lesson = compileScenario(SC_JUNCTION_BLIND, level);
      const b = liveChainReplay({ lesson, districtRaw: RAW, trace: barge });
      expect(b.violationCodes, `L${level} barge`).toEqual(["FAILED_TO_YIELD"]);
      expect(b.result.passed, `L${level} barge`).toBe(false);
      const n = liveChainReplay({ lesson, districtRaw: RAW, trace: noLook });
      expect(n.result.passed, `L${level} no-look`).toBe(false);
      expect(n.commendationCodes, `L${level} no-look`).toEqual([]);
    }
  });
});
