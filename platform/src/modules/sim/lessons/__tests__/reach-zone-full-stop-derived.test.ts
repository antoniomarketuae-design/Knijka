/**
 * «НАПЪЛНО» IS A CLAIM ABOUT THE WHEELS, NOT A CLAIM ABOUT THE SPEEDOMETER —
 * the census gate for `deriveFullStopDemand` (w28, 2026-09-04).
 *
 * ── THE SHARED CAUSE THIS CLOSES ───────────────────────────────────────────
 *
 * `requireFullStop` shipped on 2026-09-03 AUTHORED-ONLY, on one gate. The
 * measurement that forced this file is that the catalogue contains SEVEN
 * banners promising the law's stop and only ONE of them asked for one; the
 * other six asked for a NUMBER. A number cannot state the dwell
 * (`fullStopMinDurationSec`) or the recency (`stopRecencySec`) that «напълно»
 * means, so on those six a car was credited for BEING slow where the banner
 * said it STOPPED — and «slow» includes «stationary because the drive ended
 * here», which is how a car that never touched the brake collected
 * «✓ Спри напълно вдясно при червената лампа».
 *
 * A demand that has to be remembered per-gate is a demand that gets forgotten
 * on gate eight. This file is the thing that notices.
 *
 * ── WHY A SEPARATE FILE FROM `reach-zone-full-stop.test.ts` ────────────────
 *
 * That file owns the AUTHORED key — the whitelist check, the parse, the
 * evaluator's two directions and the live `applyTick` drive. This one owns the
 * DERIVATION: the census, its teeth, and the proof that no committed correct
 * drive lost a tick to it. Its §1 „no other gate acquires it by accident" reads
 * the TEMPLATE params and so is untouched by a parse-time derivation — it still
 * passes and still means what it says (nothing else AUTHORS the key). Its
 * comment claiming there is no matcher is now stale and is corrected here
 * rather than there, because that file was open in another lane at the time.
 *
 * ── THE MUTATION THAT MUST TURN THESE RED ──────────────────────────────────
 *
 * Delete the `deriveFullStopDemand` arm in `parseObjectiveParams`, or widen the
 * matcher to the bare verb «спри», and §1/§2 fail. Narrow it to nothing and §1
 * fails on its teeth row rather than going vacuously green.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { LessonObjective } from "../../contracts";
import { applyTick, buildLessonResult, createLessonSession } from "../engine";
import { deriveFullStopDemand, parseObjectiveParams, type WitnessedReachZoneParams } from "../objectives";
import { compileScenario } from "../scenario/compile";
import type { ScenarioLevel } from "../scenario/types";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import { recordScVpTelltaleRedDrive } from "../../traces/scVpTelltaleRed";
import { recordScHzBrakeDontSwerveDrive } from "../../traces/scHzBrakeDontSwerve";
import { recordScHzEmergencyStopDrive } from "../../traces/scHzEmergencyStop";
import { recordScRxUnguardedDrive } from "../../traces/scRxUnguarded";
import { recordScEdD2PriorityRunDrive } from "../../traces/scEdD2PriorityRun";
import { recordScCrossingWhiteCaneDrive } from "../../traces/scCrossingWhiteCane";
import { recordScMergeFromPropertyDrive } from "../../traces/scMergeFromProperty";

const REPO_ROOT = path.resolve(process.cwd(), "..");

/**
 * A TEMPLATE OBJECTIVE IS NOT A LESSON OBJECTIVE, AND `parseObjectiveParams`
 * READS THE FIELD THE TEMPLATE DOES NOT HAVE — the repair of the census's own
 * harness (2026-09-08).
 *
 * `ScenarioObjectiveSpec` (scenario/types.ts:202) is `{ id, titleBg, params }`:
 * the kind lives on `params.kind`, because a template authors its params as a
 * typed union. `LessonObjective` (contracts.ts:669) carries its own top-level
 * `kind`, and `parseObjectiveParams` switches on THAT. Handing it a raw
 * template row matches no arm, falls off the end of the switch and returns
 * `undefined` — which is exactly what the census below did on its FIRST row:
 *
 *   TypeError: Cannot read properties of undefined (reading 'requireFullStop')
 *     at reach-zone-full-stop-derived.test.ts:118
 *
 * So the two-way closure had never counted a single objective; it threw before
 * it compared anything, and both of its lists were vacuous. `tsc` said the same
 * thing statically (TS2345: 'ScenarioObjectiveSpec' is not assignable to
 * 'LessonObjective'), which is how the shape error is pinned in two places.
 *
 * Lifted from `reach-zone-full-stop.test.ts`'s own `shipped()` helper, which
 * has always built the objective this way. The `kind` is pinned to the value
 * the caller has already filtered on and is never widened — a row whose
 * `params.kind` is not `reachZone` is skipped before it reaches this function,
 * so no objective is parsed under a kind it does not have.
 */
function asLessonObjective(o: { id: string; titleBg: string; params: unknown }): LessonObjective {
  return {
    id: o.id,
    titleBg: o.titleBg,
    kind: "reachZone",
    params: o.params as Record<string, unknown>,
  };
}

/**
 * THE CENSUS, by hand, over every `titleBg:` in `scenario/templates-*.ts`
 * (2026-09-04). Every reachZone banner containing «напълно» or «пълна
 * спирачка» — all seven of them, which is the entire population, which is why
 * the matcher is the word itself and carries no exception list.
 */
const CENSUS: ReadonlyArray<{ specId: string; objectiveId: string; capKmh: number }> = [
  { specId: "sc-rx-unguarded", objectiveId: "sc-rxu-stop", capKmh: 1 },
  { specId: "sc-merge-from-property", objectiveId: "sc-mfp-stop-line", capKmh: 3 },
  { specId: "sc-ed-d2-priority-run", objectiveId: "sc-edpr-b2", capKmh: 3 },
  { specId: "sc-vp-telltale-red", objectiveId: "sc-vptr-red-stop", capKmh: 4 },
  { specId: "sc-crossing-white-cane", objectiveId: "sc-wcn-halt", capKmh: 6 },
  { specId: "sc-hz-emergency-stop", objectiveId: "sc-hzes-stop", capKmh: 6 },
  { specId: "sc-hz-brake-dont-swerve", objectiveId: "sc-hzbds-stop", capKmh: 6 },
];

// ---------------------------------------------------------------------------
// 1 · THE MATCHER — teeth in both directions
// ---------------------------------------------------------------------------

describe("the matcher reads the adverb, not the verb", () => {
  it("claims the standstill when the banner says so", () => {
    for (const t of [
      "Спри напълно на стоп-линията преди релсите",
      "Спри напълно на Б2 на изхода",
      "Спри НАПЪЛНО преди зебрата — не настъпвай, той се ориентира по слуха",
      "Спри преди детето — с пълна спирачка, в лентата",
      "Спри напълно вдясно при червената лампа",
    ]) {
      expect(deriveFullStopDemand(t), t).toBe(true);
    }
  });

  it("leaves «спри» alone — the sixty-three gates the authored-only note was right about", () => {
    // These are shipped banners. Each promises a PLACE (and its own halt cap
    // grades the speed there); none promises the ЗДвП чл. 50 standstill, and a
    // matcher on the verb would have put one on every one of them.
    for (const t of [
      "Спри пред тротоара и пропусни пешеходеца",
      "Спри в джоба между кръга и пътеката",
      "Спри точно на маркираната позиция",
      "Спри плътно вдясно при полицая",
      "Спри зад колоната на разумно разстояние",
      "Спри на разрешеното място след зоната",
      "Задача 1: спри в изходната позиция за обръщането",
      "Приближи камиона и пътеката с готовност за спиране",
    ]) {
      expect(deriveFullStopDemand(t), t).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 2 · THE CENSUS — the population is exactly seven, in both directions
// ---------------------------------------------------------------------------

describe("the census is closed over the whole catalogue", () => {
  it("every reachZone that carries the demand is a census member, and vice versa", () => {
    const derived: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (const o of spec.success) {
        if ((o.params as { kind: string }).kind !== "reachZone") continue;
        const p = parseObjectiveParams(asLessonObjective(o)) as WitnessedReachZoneParams;
        if (p.requireFullStop === true) derived.push(`${spec.id}/${o.id}`);
      }
    }
    expect(derived.sort()).toEqual(CENSUS.map((c) => `${c.specId}/${c.objectiveId}`).sort());
  });

  it("the guard has teeth — the catalogue really is mostly NOT this", () => {
    // A matcher that silently stopped matching would make §2 vacuously green
    // by emptying both sides at once. This is the row that notices.
    let reachZones = 0;
    for (const spec of SCENARIO_TEMPLATES) {
      for (const o of spec.success) {
        if ((o.params as { kind: string }).kind === "reachZone") reachZones += 1;
      }
    }
    expect(reachZones).toBeGreaterThan(300);
    expect(CENSUS.length).toBe(7);
  });

  it("every member is a HALT gate — the demand never lands on a flow cap", () => {
    // «напълно» and „не по-бързо от 40" cannot both be true of one banner. If a
    // future gate pairs the word with a flow cap this fails, and it should:
    // the right fix is the title or the cap, not a quiet exception here.
    for (const c of CENSUS) {
      const spec = SCENARIO_TEMPLATES.find((s) => s.id === c.specId)!;
      const o = spec.success.find((x) => x.id === c.objectiveId)!;
      expect((o.params as { maxSpeedKmh?: number }).maxSpeedKmh, `${c.specId}/${c.objectiveId}`).toBe(
        c.capKmh,
      );
      expect(c.capKmh).toBeLessThanOrEqual(8);
    }
  });
});

// ---------------------------------------------------------------------------
// 3 · IT REACHES THE SESSION — a derived term can be dead exactly like an
//     authored one, and this is the check that says it is not
// ---------------------------------------------------------------------------

describe("the demand survives the ladder onto the lesson the student plays", () => {
  it("is present on every rung of every census member, after compileScenario", () => {
    // `serializeObjectiveParams` is a WHITELIST and silently drops what it does
    // not name. This derivation runs INSIDE `parseObjectiveParams`, downstream
    // of that serializer and off `titleBg` — so what has to be proved is that
    // the ladder does not rewrite the banner out from under it on some rung.
    for (const c of CENSUS) {
      const spec = SCENARIO_TEMPLATES.find((s) => s.id === c.specId)!;
      for (const level of [1, 2, 3, 4, 5] as const) {
        const gate = compileScenario(spec, level).objectives.find((o) => o.id === c.objectiveId)!;
        expect(
          (parseObjectiveParams(gate) as WitnessedReachZoneParams).requireFullStop,
          `${c.specId}/${c.objectiveId}@L${level}`,
        ).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 4 · A FALSE REFUSAL IS AS BAD AS A FALSE CERTIFICATE — the committed
//     recordings, replayed through the engine the shell itself drives
// ---------------------------------------------------------------------------

type Rec = (d: unknown, n: string, e: { onTick: (t: unknown) => void }) => unknown;

const DRIVES: ReadonlyArray<{ specId: string; rec: Rec; shadow: string; mistakes: string[] }> = [
  { specId: "sc-rx-unguarded", rec: recordScRxUnguardedDrive as Rec, shadow: "shadow-correct", mistakes: ["mistake-roll-through", "mistake-stop-on-track"] },
  { specId: "sc-merge-from-property", rec: recordScMergeFromPropertyDrive as Rec, shadow: "shadow-correct", mistakes: ["mistake-signal-and-go", "mistake-walk-through"] },
  { specId: "sc-ed-d2-priority-run", rec: recordScEdD2PriorityRunDrive as Rec, shadow: "shadow-correct", mistakes: ["mistake-rolling-stop", "mistake-partial-scan"] },
  { specId: "sc-vp-telltale-red", rec: recordScVpTelltaleRedDrive as Rec, shadow: "shadow-correct", mistakes: ["mistake-drive-on", "mistake-panic-lane"] },
  { specId: "sc-crossing-white-cane", rec: recordScCrossingWhiteCaneDrive as Rec, shadow: "shadow-correct", mistakes: ["mistake-not-yielded", "mistake-too-fast"] },
  { specId: "sc-hz-emergency-stop", rec: recordScHzEmergencyStopDrive as Rec, shadow: "shadow-correct", mistakes: ["mistake-late-reaction", "mistake-swerve"] },
  { specId: "sc-hz-brake-dont-swerve", rec: recordScHzBrakeDontSwerveDrive as Rec, shadow: "shadow-correct", mistakes: ["mistake-late-brake", "mistake-blind-swerve"] },
];

function district(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}

/** Replay a committed recording through `applyTick` and report the gate. */
function gateDone(
  specId: string,
  rec: Rec,
  name: string,
  level: ScenarioLevel,
  gateId: string,
): boolean {
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === specId)!;
  let session = createLessonSession(compileScenario(spec, level));
  rec(district((spec as unknown as { map: { districtId: string } }).map.districtId), name, {
    onTick: (t) => {
      session = applyTick(session, t as never).state;
    },
  });
  return buildLessonResult(session).objectives.find((o) => o.id === gateId)?.done === true;
}

describe("no correct drive lost a tick to this demand", () => {
  // THE CONSTRAINT THE FOUNDER RANKS FIRST. Every census member's committed
  // `shadow-correct` is the drive the drill was authored around: it performs
  // the act the banner names. If one of these goes red the matcher is wrong,
  // not the recording.
  for (const { specId, rec, shadow } of DRIVES) {
    const gateId = CENSUS.find((c) => c.specId === specId)!.objectiveId;
    for (const level of [1, 3, 5] as const) {
      it(`${specId} ${shadow} @L${level} still earns «${gateId}»`, () => {
        expect(gateDone(specId, rec, shadow, level, gateId)).toBe(true);
      });
    }
  }
});

describe("and the demonstrations keep the verdicts they shipped with", () => {
  // The other half of „nothing moved": a demand that turned a passing mistake
  // demo into a failing one would be reported as a repair and would in fact be
  // a second defect. Measured before and after the matcher landed — every row
  // below is the value the drive had with `requireFullStop` on one gate only.
  const EXPECTED: Record<string, boolean> = {
    "sc-rx-unguarded/mistake-roll-through": false,
    // NOT a false certificate, and deliberately left alone: this drive stops
    // correctly AT the line (granting the gate at t = 18.78, the same second
    // the shadow does) and only later stalls on the track. The gate's claim is
    // honest; the stall is the rule engine's to bill, and it does.
    "sc-rx-unguarded/mistake-stop-on-track": true,
    "sc-merge-from-property/mistake-signal-and-go": true,
    "sc-merge-from-property/mistake-walk-through": false,
    "sc-ed-d2-priority-run/mistake-rolling-stop": false,
    "sc-ed-d2-priority-run/mistake-partial-scan": true,
    "sc-vp-telltale-red/mistake-drive-on": false,
    "sc-vp-telltale-red/mistake-panic-lane": false,
    "sc-crossing-white-cane/mistake-not-yielded": false,
    "sc-hz-emergency-stop/mistake-late-reaction": false,
    "sc-hz-emergency-stop/mistake-swerve": false,
    "sc-hz-brake-dont-swerve/mistake-late-brake": false,
    "sc-hz-brake-dont-swerve/mistake-blind-swerve": false,
  };

  for (const { specId, rec, mistakes } of DRIVES) {
    const gateId = CENSUS.find((c) => c.specId === specId)!.objectiveId;
    for (const name of mistakes) {
      const key = `${specId}/${name}`;
      if (!(key in EXPECTED)) continue;
      it(`${key} @L3 keeps «${gateId}» = ${EXPECTED[key]}`, () => {
        expect(gateDone(specId, rec, name, 3, gateId)).toBe(EXPECTED[key]);
      });
    }
  }
});
