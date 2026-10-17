/**
 * THREE MISTAKE DEMOS, ON THE STREET EACH RUNG COMPILES TO: THE DRIVE IS THE STORY ITS CAPTIONS TELL
 * (sc-sig-controller-postures:5ee4301e round 3, integrator decision D4).
 *
 * Once ambient cars obey the lamp of their own approach and DRIVE the junction box instead of hopping it
 * (traffic/vehicles.ts `laneEndSignal`, traffic/graph.ts `laneConnector`), six demo × rung cells of the catalogue
 * gained a COLLISION they did not have at base (2e9268f). A demo told as a near miss that now crashes is a false
 * story; a demo whose crash IS the hazard its lesson names is not. Each of the three is read here through the live
 * chain (`liveChainReplay`, the lesson's own compiled traffic) on every rung.
 *
 * 1. sc-junction-left · mistake-cut-gap — WAS FALSE, RE-AUTHORED. It says «Колата с предимство трябваше да намали
 *    заради теб» and its card «…тя трябваше да намали заради теб»: a forced slow-down, no impact. At L1/L2 the tape
 *    drove into ambient car 1, which had come out of the east arm with priority, turned for the stem and stopped for
 *    it at (5.1, −5.1): FAILED_TO_YIELD + COLLISION, 20 points. The tape now sets off 5 s late and approaches at
 *    20 km/h (traces/scJunctions3.ts, re-recorded through the project recorder): on every rung it is exactly its own
 *    mistake — FAILED_TO_YIELD, the full stop praised, and it touches nobody.
 *
 * 2. sc-signal-flashing · mistake-barge — TRUE AS IT STANDS. «Грешката: мигащото жълто се приема за зелено — минаваме
 *    без да намалим.» / «Колата отдясно трябваше да мине първа — мигащото жълто изисква пропускане, не спринт.» No
 *    sentence promises a miss. Where the tape is hit (L3 and L5 already at base; now L1 and L2 as well) it is by the
 *    car its captions are about — the lesson's own staged car from the right, never an ambient one. The impact is
 *    the hazard the lesson teaches.
 *
 * 3. sc-signal-redyellow · mistake-jump — TRUE AS IT STANDS, WITH A CAVEAT ABOUT THIS INSTRUMENT. «Печели се под
 *    секунда, а се влиза в кръстовище, което другите още не са освободили. Тръгва се на чисто зелено.» At L1/L2 the
 *    tape now meets an ambient car that is still inside the box and still moving — literally a junction the others
 *    have not yet cleared. CAVEAT: this replay runs the lesson's signal plan from t = 0, not the phase the demo was
 *    recorded against (clips/capture/captureSignalDials.ts carries a dial for this lesson), which is why it reads
 *    RED_LIGHT_CROSSED where the card says RED_YELLOW_CROSSED — at base and here alike. The pin is on what the
 *    contact is, not on which lamp code the instrument prints.
 *
 * None of the three lessons has a clip in public/clips/manifest.json, so no clip caption is involved.
 *
 * ROUND 5 adds the two demos that DO have a clip (verifier R4-F4) — see the last two blocks.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseScenarioTrace } from "../../../traces/parse";
import type { ScenarioTrace } from "../../../traces/types";
import { STAGED_STATE_ID_BASE } from "../../../traffic/staged";
import { nodeOpenRadiusM } from "../../../world/builders/network";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES } from "../templates";
import type { ScenarioLevel } from "../types";
import { liveChainReplay } from "./liveChainReplay";
import { loadDistrict } from "./witnessLiveRung";

const REPO = path.resolve(process.cwd(), "..");
const LEVELS = [1, 2, 3, 4, 5] as ScenarioLevel[];
const tape = (id: string, name: string): ScenarioTrace =>
  parseScenarioTrace(JSON.parse(readFileSync(path.join(REPO, "content", "traces", id, `${name}.trace.json`), "utf-8")))!;
const specOf = (id: string) => SCENARIO_TEMPLATES.find((s) => s.id === id)!;

interface Told {
  codes: string[];
  praise: string[];
  ambientContacts: number;
  /** The ambient car nearest the student (within 6 m) on the first grid point that carries a vehicle contact: metres
   *  from the junction node, m/s. */
  ambientAtContact: { fromNodeM: number; mps: number } | null;
  /** A staged vehicle was within 6 m of the student on a grid point that carried a vehicle contact. */
  stagedAtContact: boolean;
}
function drive(id: string, name: string, level: ScenarioLevel): Told {
  const spec = specOf(id);
  const raw = loadDistrict(spec.map.districtId);
  let stagedAtContact = false;
  let ambientAtContact: Told["ambientAtContact"] = null;
  const out = liveChainReplay({
    lesson: compileScenario(spec, level),
    districtRaw: raw,
    trace: tape(id, name),
    afterApply: ({ tick, traffic }) => {
      if (!tick.events.some((e) => e.kind === "collision" && e.withWhat === "vehicle")) return;
      let nearestM = Infinity;
      for (const v of traffic.vehicles) {
        const d = Math.hypot(v.x - tick.position.x, v.y - tick.position.y);
        if (v.id >= STAGED_STATE_ID_BASE) {
          if (d < 6) stagedAtContact = true;
        } else if (!ambientAtContact || d < nearestM) {
          if (d < 6 && d < nearestM) {
            nearestM = d;
            ambientAtContact = { fromNodeM: Math.hypot(v.x, v.y), mps: v.speedMps };
          }
        }
      }
    },
  });
  return {
    codes: out.violationCodes,
    praise: out.commendationCodes,
    ambientContacts: out.ambientContacts.length,
    ambientAtContact,
    stagedAtContact,
  };
}

describe("sc-junction-left · mistake-cut-gap: told as «had to slow because of you» — and that is all that happens", () => {
  for (const level of LEVELS) {
    it(`L${level}: exactly FAILED_TO_YIELD, the full stop praised, nobody touched`, () => {
      const d = drive("sc-junction-left", "mistake-cut-gap", level);
      expect(d.codes).toEqual(["FAILED_TO_YIELD"]);
      expect(d.praise).toContain("FULL_STOP_AT_STOP_SIGN");
      expect(d.ambientContacts).toBe(0);
      expect(d.stagedAtContact).toBe(false);
    });
  }
  it("the card's own codeRefs is that one code", () => {
    const m = specOf("sc-junction-left").mistakes!.find((x) => x.traceRef.path.endsWith("mistake-cut-gap.trace.json"))!;
    expect(m.codeRefs).toEqual(["FAILED_TO_YIELD"]);
    expect(m.whatWentWrongBg).toContain("тя трябваше да намали заради теб");
  });
});

describe("sc-signal-flashing · mistake-barge: where it is hit, it is by the car from the right its captions are about", () => {
  /** As measured on this tree (base: L3 and L5 already carried the impact). */
  const HIT_ON: readonly number[] = [1, 2, 3, 5];
  for (const level of LEVELS) {
    it(`L${level}: FAILED_TO_YIELD${HIT_ON.includes(level) ? " and the impact with the lesson's own staged car" : ", no impact"} — never an ambient car`, () => {
      const d = drive("sc-signal-flashing", "mistake-barge", level);
      expect(d.codes).toContain("FAILED_TO_YIELD");
      expect(d.ambientContacts).toBe(0);
      if (HIT_ON.includes(level)) {
        expect(d.codes).toEqual(["FAILED_TO_YIELD", "COLLISION"]);
        expect(d.stagedAtContact).toBe(true);
      } else {
        expect(d.codes).toEqual(["FAILED_TO_YIELD"]);
      }
    });
  }
});

describe("sc-signal-redyellow · mistake-jump: «a junction the others have not yet cleared» — the car it meets is inside the box and moving", () => {
  const spec = specOf("sc-signal-redyellow");
  const raw = loadDistrict(spec.map.districtId) as { roads: { edges: Array<{ from: string; to: string }> } };
  const boxR = nodeOpenRadiusM(raw.roads.edges.filter((e) => e.from === "sx-n-c" || e.to === "sx-n-c") as never, 4);
  /** As measured on this tree (base: no impact on any rung). */
  const MEETS_ON: readonly number[] = [1, 2];
  for (const level of LEVELS) {
    it(`L${level}: ${MEETS_ON.includes(level) ? "meets one ambient car, inside the box and moving" : "meets nobody"}`, () => {
      const d = drive("sc-signal-redyellow", "mistake-jump", level);
      expect(d.codes.includes("COLLISION")).toBe(MEETS_ON.includes(level));
      if (!MEETS_ON.includes(level)) {
        expect(d.ambientContacts).toBe(0);
        return;
      }
      expect(d.ambientContacts).toBe(1);
      expect(d.stagedAtContact).toBe(false);
      expect(d.ambientAtContact).not.toBeNull();
      expect(d.ambientAtContact!.fromNodeM).toBeLessThan(boxR);
      expect(d.ambientAtContact!.mps).toBeGreaterThan(0.3);
    });
  }
});

/*
 * ROUND 5 (integrator decision D5, verifier R4-F4): the two mistake demos with a COMMITTED CLIP whose round-4 run
 * ended in a contact with an ambient car. Both are now read on every rung; on every rung neither touches an ambient car
 * except at L5's first grid point, where the rung's own ambient fleet is seeded on top of the student (t = 0, every
 * demo of the lesson, the correct one included — identical at base 2e9268f, not this lane's).
 */
describe("sc-turn-left-oncoming · mistake-cut-gap (clip sc-turn-left-oncoming__m0): «he physically cannot avoid stopping because of you» — and no ambient car is in it", () => {
  // Round 4: on L1 and L2 an ambient left-turner that had entered on its red stood 6.1 / 6.4 s in the box, on the
  // lesson's own left turn, for the staged car the tape cuts up, and the tape drove into it (L2: FAILED_TO_YIELD +
  // COLLISION). Inside the box a staged car is now decided at the turner's waiting point only (vehicles.ts D4), so the
  // turner waits there, clear of both the oncoming lane and the student's turn.
  const SHEET: Record<number, string[]> = {
    1: ["FAILED_TO_YIELD", "COLLISION"],
    2: ["FAILED_TO_YIELD"],
    3: ["FAILED_TO_YIELD"],
    4: ["FAILED_TO_YIELD"],
    5: ["COLLISION", "FAILED_TO_YIELD"],
  };
  for (const level of LEVELS) {
    it(`L${level}: ${SHEET[level].join(" + ")}${level === 1 ? " — the impact with the oncoming staged car its captions are about (as at base)" : ""}`, () => {
      const d = drive("sc-turn-left-oncoming", "mistake-cut-gap", level);
      expect(d.codes).toEqual(SHEET[level]);
      if (level === 1) {
        expect(d.ambientContacts).toBe(0);
        expect(d.stagedAtContact).toBe(true);
      } else if (level === 5) {
        // The L5 seed's own overlap on the first grid point, nothing later.
        expect(d.ambientContacts).toBe(1);
      } else {
        expect(d.ambientContacts).toBe(0);
      }
    });
  }
  it("the card's own codeRefs is FAILED_TO_YIELD and it tells a forced stop", () => {
    const m = specOf("sc-turn-left-oncoming").mistakes!.find((x) => x.traceRef.path.endsWith("mistake-cut-gap.trace.json"))!;
    expect(m.codeRefs).toEqual(["FAILED_TO_YIELD"]);
    expect(m.whatWentWrongBg).toContain("няма как да не спира заради теб");
  });
});

describe("sc-jx-giveway-b1 · mistake-barge-priority (clip sc-jx-giveway-b1__m0): «the car on the main road had to stop because of you» — RE-AUTHORED, nobody touched", () => {
  // Round 4: on L3 the tape rolled across the main road at 22 km/h 4 s behind the staged priority car and drove into
  // the side of ambient car 2, which held the junction's slot by right and was clamped to rest by him (FAILED_TO_YIELD
  // + COLLISION: a crash the captions do not tell). The tape now presses on across the main road at 30 km/h once over
  // its line (traces/scJxGivewayB1.ts, re-recorded through the project recorder); the approach and the line crossing
  // — the yield failure itself — are as before.
  for (const level of LEVELS) {
    it(`L${level}: ${level === 5 ? "COLLISION + FAILED_TO_YIELD — the L5 seed's overlap at t = 0 (as at base)" : "exactly FAILED_TO_YIELD, no contact"}`, () => {
      const d = drive("sc-jx-giveway-b1", "mistake-barge-priority", level);
      if (level === 5) {
        expect(d.codes).toEqual(["COLLISION", "FAILED_TO_YIELD"]);
        expect(d.ambientContacts).toBe(1);
      } else {
        expect(d.codes).toEqual(["FAILED_TO_YIELD"]);
        expect(d.ambientContacts).toBe(0);
        expect(d.stagedAtContact).toBe(false);
      }
    });
  }
  it("the card's own codeRefs is FAILED_TO_YIELD", () => {
    const m = specOf("sc-jx-giveway-b1").mistakes!.find((x) => x.traceRef.path.endsWith("mistake-barge-priority.trace.json"))!;
    expect(m.codeRefs).toEqual(["FAILED_TO_YIELD"]);
  });
});
