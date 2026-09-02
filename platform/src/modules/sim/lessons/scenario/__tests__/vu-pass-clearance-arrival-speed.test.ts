/**
 * THE OVERTAKE THAT TICKED ITSELF OFF AT 59 КМ/Ч — sc-vu-pass-clearance,
 * critical `260b13fd`, frame `.audit-frames/sweep161/sc-vu-pass-clearance/
 * pc-wrong/08-debrief.png` with its own `04-t017s.png` beside it.
 *
 * WHAT THE FRAMES SHOW. `04-t017s.png` carries the В26 disc reading 50, the
 * cluster reading **59 км/ч**, «РЕЖИМ Нормален ≤60 · знакът важи» — and the
 * objective banner already advanced to «ЗАДАЧА 2/2 · Продължи до края на
 * отсечката», i.e. the lesson had accepted the overtake. `08-debrief.png` is
 * that drive's card: «0 наказателни точки · ИЗДЪРЖАН · ★★★ · +100 XP».
 *
 * WHY IT HAPPENED. Both success rows are bare `reachZone` discs on the
 * northbound lane centre (y = 210, y = 300) and the engine runs them
 * SEQUENTIALLY, so the whole task chain of a lesson whose subject is
 * «изпревари велосипедист … с безопасна скорост» was satisfied by ARRIVING
 * somewhere. `stepReachZone` was handed a speed on every one of those frames
 * and had no contract to read it against.
 *
 * WHAT THE LAW SAYS, retrieved rather than recalled (ADR-002) —
 * `content/law/acts/zdvp.json`, ЗДвП чл. 42, ал. 2:
 *   т. 1 «да осигури достатъчно странично разстояние» — already graded, by the
 *        runtime vulnerable-pass tracker (VULNERABLE_PASS_TOO_CLOSE);
 *   т. 3 «да се убеди, че като се движи с БЕЗОПАСНА СКОРОСТ, може да извърши
 *        изпреварването за кратко време» — the half nothing in this lesson
 *        could refuse.
 * The template's own copy asks for the same thing twice («установи се на
 * спокойна градска скорост», «Подмини го спокойно, без да ускоряваш рязко до
 * него»), and its `teach.examinerBg` names it outright: «осезаема широка дъга
 * с НАМАЛЕНА СКОРОСТ».
 *
 * THE REPAIR is one authored number — `maxSpeedKmh: 46` on the return gate,
 * the disc that certifies the overtake was completed and the car settled back.
 * The lesson's own committed demonstration of the CORRECT drive tops out at
 * 44.88 км/ч over its whole length (`content/traces/sc-vu-pass-clearance/
 * shadow-correct.trace.json`), so the taught line clears the gate by 1.1 км/ч
 * at the tightest rung and by 3.1 at the aided ones — and the tier governor's
 * 58–59 км/ч cannot clear it at any rung.
 *
 * WHY 46 AND NOT 50 (the sign): a cap at the posted limit only restates В26,
 * which `rules/engine.ts` already bills as SPEEDING_OVER_LIMIT. The demand
 * this lesson is missing is the one BELOW the sign — the reduction чл. 42
 * ал. 2 т. 3 asks for while the overtake is being carried out.
 *
 * WHY 46 AND NOT 45 (the demo's own figure): 45 leaves the committed shadow
 * 0.12 км/ч of margin, i.e. the lesson's own demonstration would be one
 * rounding away from failing its own gate.
 *
 * THE REFUSAL IS NOT SILENT (THEO-4): `lessons/engine.ts objectiveNotice`
 * fires the moment the latch is missed, with «Задачата иска да си тук с не
 * повече от N км/ч, а стигна дотук с M км/ч … Ако я подминеш с тази скорост,
 * задачата остава неизпълнена», and `RouteGuidance.capLineBg` paints the same
 * number in the lane on the approach. Both are asserted below, because a gate
 * that refuses without saying why is the defect pointing the other way.
 *
 * MUTATION CHECK RUN BEFORE THIS WAS COMMITTED: deleting `maxSpeedKmh` from
 * the return gate (the shipped state) reds §1 and §3; raising it to 50 reds §1.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { recordScriptedDrive, type DriveScript } from "../../../traces/recorder";
import { recordScVuPassDrive } from "../../../traces/scVuPass";
import type { HudEvent, StagedEventSpec } from "../../../contracts";
import type { SimTick } from "../../../rules";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import type { LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { SC_VU_PASS_CLEARANCE } from "../templates-vru";
import type { ScenarioLevel } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

const DISTRICT_ID = "vu-pass-v1";
/** vu-pass-v1 northbound lane centre — the line a do-nothing driver holds. */
const VUP_LANE_X = 4.06;
const SPAWN_Y = 15;
/** The tier governor's ceiling in «РЕЖИМ Нормален», off the sweep's cluster. */
const FLAT_OUT_KMH = 59;
const RETURN_GATE_ID = "sc-vup-pass";
const FINISH_GATE_ID = "sc-vup-finish";
/** The number the template authors on the return gate, and the one spoken. */
const AUTHORED_CAP_KMH = 46;

function loadDistrict(): unknown {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${DISTRICT_ID}.json`), "utf-8"),
  ) as unknown;
}

/** The audited `wrong` leg, as a script: hold the throttle, never steer, never
 *  brake (`tools/mobile/lesson-audit.mjs` — „`wrong` is one act"). */
const flatOutScript: DriveScript = {
  steps: [
    {
      kind: "drive",
      points: [
        [VUP_LANE_X, SPAWN_Y],
        [VUP_LANE_X, 320],
      ],
      targetKmh: FLAT_OUT_KMH,
      stopAtEnd: false,
    },
  ],
};

interface Leg {
  session: LessonSessionState;
  done: (objectiveId: string) => boolean;
  completedAll: boolean;
  hudEvents: HudEvent[];
  topKmh: number;
}

/** Drive one leg through the FULL production pipeline at one rung:
 *  compileScenario → createLessonSession → applyTick every recorded frame. */
function drive(level: ScenarioLevel, leg: "flat-out" | "shadow"): Leg {
  const lesson = compileScenario(SC_VU_PASS_CLEARANCE, level);
  let session = createLessonSession(lesson);
  const hudEvents: HudEvent[] = [];
  let topKmh = 0;
  const onTick = (tick: SimTick) => {
    topKmh = Math.max(topKmh, Math.abs(tick.speedKmh));
    const step = applyTick(session, tick);
    session = step.state;
    hudEvents.push(...step.hudEvents);
  };
  const district = loadDistrict();
  if (leg === "shadow") {
    recordScVuPassDrive(district, "shadow-correct", { onTick });
  } else {
    recordScriptedDrive(district, flatOutScript, {
      scenarioId: SC_VU_PASS_CLEARANCE.id,
      kind: "mistake",
      seed: 7,
      stagedEvents: [...(SC_VU_PASS_CLEARANCE.staged ?? [])] as StagedEventSpec[],
      onTick,
    });
  }
  const result = buildLessonResult(session);
  return {
    session,
    done: (id) => result.objectives.find((o) => o.id === id)?.done === true,
    completedAll: result.completedAll,
    hudEvents,
    topKmh,
  };
}

const gate = (level: ScenarioLevel, objectiveId: string) =>
  compileScenario(SC_VU_PASS_CLEARANCE, level).objectives.find((o) => o.id === objectiveId)!;

const capOf = (level: ScenarioLevel, objectiveId: string): number | undefined =>
  (gate(level, objectiveId).params as { maxSpeedKmh?: number }).maxSpeedKmh;

// ---------------------------------------------------------------------------
// §1 — the flat-out leg cannot collect the overtake
// ---------------------------------------------------------------------------

describe("sc-vu-pass-clearance: 59 км/ч does not complete the overtake", () => {
  // L1 is the rung the sweep photographed («Ниво 1 — Пълна помощ»), and it is
  // also the LOOSEST rung, so refusing there refuses everywhere.
  const leg = drive(1, "flat-out");

  it("holds the governor's 59 км/ч — the drive the frames caught", () => {
    expect(leg.topKmh).toBeGreaterThan(55);
  });

  it("never ticks the return gate, so the banner never reaches ЗАДАЧА 2/2", () => {
    // The engine grades objectives SEQUENTIALLY (`currentObjectiveIndex`), so
    // an unmet first gate is also the reason the second one is never offered —
    // which is the frame's «ЗАДАЧА 2/2 · Продължи до края на отсечката» at
    // t = 17 s, on a car that had just gone past a cyclist at 59.
    expect(leg.done(RETURN_GATE_ID)).toBe(false);
    expect(leg.done(FINISH_GATE_ID)).toBe(false);
    // The session still ENDS — the route run-out lets a car that drove off the
    // end of the street out rather than stranding it (finish.ts B3). What it
    // may not do any more is end with the task chain certified.
    expect(leg.completedAll).toBe(false);
  });

  it("and says WHY, with both numbers, instead of going quiet (THEO-4)", () => {
    const cards = leg.hudEvents.filter((e) => e.kind === "lesson");
    const cap = cards.find((e) => JSON.stringify(e).includes("не повече от"));
    expect(cap, "the objective-notice card never fired").toBeDefined();
    const text = JSON.stringify(cap);
    // The AUTHORED number, not the rung's compiled ceiling: `spokenCapKmh`
    // closes on `Math.min(visible, compiled)`, so the card can only ever be
    // stricter than the grader — at L1 the gate accepts 48 and the student is
    // told 46, which is the figure `RouteGuidance.capLineBg` also paints.
    expect(text).toContain(String(AUTHORED_CAP_KMH));
    expect(text).toContain(String(FLAT_OUT_KMH));
    expect(text).toContain("задачата остава неизпълнена");
  });
});

// ---------------------------------------------------------------------------
// §2 — and the taught line still passes, at every authored rung
// ---------------------------------------------------------------------------

describe("sc-vu-pass-clearance: the authored correct drive still completes it", () => {
  for (const level of [1, 3] as const) {
    it(`L${level}: the committed shadow ticks both gates and finishes clean`, () => {
      const leg = drive(level, "shadow");
      expect(leg.done(RETURN_GATE_ID), `L${level} return gate`).toBe(true);
      expect(leg.done(FINISH_GATE_ID), `L${level} finish gate`).toBe(true);
      expect(leg.session.phase).toBe("completed");
      expect(leg.session.events.filter((e) => e.kind === "violation")).toEqual([]);
    });
  }

  it("the demonstration clears its own gate by a real margin, not a rounding", () => {
    // 44.88 км/ч is the shadow's global top speed; the gate is 46 at the
    // tightest rung. If a re-record ever pushes the demo up to the gate this
    // goes red BEFORE the bot-completion battery does, and says why.
    const shadow = drive(3, "shadow");
    const cap = capOf(3, RETURN_GATE_ID)!;
    expect(shadow.topKmh).toBeLessThan(cap - 1);
  });
});

// ---------------------------------------------------------------------------
// §3 — the number itself: a demand under the sign, whole at every rung
// ---------------------------------------------------------------------------

describe("sc-vu-pass-clearance: the arrival cap is a demand and not a decoration", () => {
  const POSTED_KMH = SC_VU_PASS_CLEARANCE.map.params["maxspeedKmh"] as number;

  it("the street is posted 50 and the gate asks for less, on every rung", () => {
    expect(POSTED_KMH).toBe(50);
    for (const rung of SC_VU_PASS_CLEARANCE.levels) {
      const cap = capOf(rung.level, RETURN_GATE_ID);
      expect(cap, `L${rung.level} lost its cap`).toBeDefined();
      // Under the sign — a cap at or above it can refuse nobody who is driving
      // lawfully, and this lesson's subject is the reduction чл. 42 ал. 2 т. 3
      // asks for ON TOP of the sign.
      expect(cap!, `L${rung.level}`).toBeLessThan(POSTED_KMH);
      // Whole km/h, because `RouteGuidance.capLineBg` rounds what it paints and
      // the painted number has to BE the graded number (B58).
      expect(Number.isInteger(cap!), `L${rung.level} cap ${cap}`).toBe(true);
    }
  });

  it("the aided rungs are looser than the graded one, never tighter", () => {
    const aided = capOf(1, RETURN_GATE_ID)!;
    const graded = capOf(5, RETURN_GATE_ID)!;
    // The ladder leaves the graded rung on the authored figure, which is also
    // the figure the card and the lane line say at EVERY rung (spokenCapKmh).
    expect(graded).toBe(AUTHORED_CAP_KMH);
    expect(aided).toBeGreaterThanOrEqual(graded);
    // …and still short of the governor's ceiling, which is what makes the
    // refusal in §1 hold at the rung with the most help.
    expect(aided).toBeLessThan(FLAT_OUT_KMH);
  });

  it("the finish gate stays uncapped — one demand, at the place it is about", () => {
    // Deliberate: the overtake is completed at the return gate, and billing the
    // last 90 m of straight street a second time would only add a row. Speed
    // there is the rule engine's to grade (SPEEDING_OVER_LIMIT), and it does.
    expect(capOf(3, FINISH_GATE_ID)).toBeUndefined();
  });
});
