/**
 * THE РЕГУЛИРОВЧИК GATES — doc 88 O21, and the two rows the same verification
 * turned up beside them.
 *
 * FOUR BANNERS IN THE WHOLE CATALOGUE NAME THE OFFICER (censused over all 395
 * shipped objectives, 357 of them reachZone, 2026-08-19). Two of them promised
 * that the student had READ him and two that he had RELEASED the crossing, and
 * before this file only ONE of the four was graded by anything.
 *
 * ── THE READ CLAIM: closed by DROPPING it, because it cannot be witnessed ────
 * «Приближи бавно и прочети регулировчика, НЕ ЛАМПАТА» (sc-sctl-read) and
 * «Приближи бавно и прочети ПОЗАТА на регулировчика» (sc-sctp-read) sat over
 * plain discs with speed caps of 20 and 30. There is no gaze channel anywhere
 * in the cockpit contract: `SimTick` carries the car's own state, and the only
 * look it knows is `mirrorGlance` — a mirror, not a man. So the cap graded
 * «бавно» and NOTHING graded «прочети».
 *
 * MEASURED through the full production pipeline on each template's own recorded
 * drives: both gates completed on EVERY drive, including the ones shipped to
 * demonstrate the misreading —
 *
 *   sc-sctl-read   shadow ✓11.02 s · mistake-wait-for-green ✓11.02 s ·
 *                  mistake-refuse-then-creep ✓11.02 s
 *   sc-sctp-read   shadow ✓11.18 s · mistake-barge-chest ✓10.40 s ·
 *                  mistake-start-on-raised-arm ✓10.40 s
 *
 * — identical to the hundredth of a second, because the drives are identical up
 * to the mark. `mistake-wait-for-green` IS the drive that reads the lamp instead
 * of the officer; it collected «✓ …прочети регулировчика, НЕ ЛАМПАТА».
 *
 * The claim is not deleted from the lesson, it is MOVED to the gate that
 * enforces it, which is the remedy `stop-claim-gates.test.ts` prescribes for
 * this class. The banners now promise the place and the speed the disc can
 * witness; the teaching stays in the briefings (instruction 3 of the live drill,
 * 2–5 of the postures drill), unchanged.
 *
 * ── THE PERMISSION CLAIM: closed by GAINING the observation ─────────────────
 * `stopLineCrossed.controller` is on the tick and is documented in rules/types.ts
 * as „the EFFECTIVE signal … overrides `lightState` ENTIRELY (ЗДвП чл. 7)".
 * `sc-sig-controller-live` already read it (its crossing is a passSignal with
 * `requireRedMet`, which completes only on a forbidding lamp crossed on the
 * officer's „proceed"). The other two did not:
 *
 *   gate                              drive                   crossing carried   before   after
 *   sc-sctp-cross                     shadow-correct          red / proceed      ✓46.80s  ✓46.80s
 *   «…когато позата разреши»          mistake-barge-chest     green / HALT       ✓25.68s  ✗
 *                                     mistake-start-raised-arm yellow / HALT     ✓34.20s  ✗
 *   sc-sctrl-cross                    shadow-correct          red / proceed      ✓46.80s  ✓46.80s
 *   «…след разрешение от              mistake-run             green / HALT       ✓25.68s  ✗
 *    регулировчика»                   mistake-creep           green / HALT       ✓35.83s  ✗
 *
 * Every „before" row with a HALT is a drive that bills CONTROLLER_SIGNAL_VIOLATED
 * — the 10-point опасна that ends the exam — and printed, on the same screen, a
 * written certificate that the officer had waved it through. `completedAll` was
 * TRUE on all four of them.
 *
 * `sc-sctrl-cross` lives in `templates-signals.ts`, a file this lane does not
 * own, and is closed WITHOUT TOUCHING IT: `objectives.ts` resolves the demand
 * from the banner (`deriveControllerDemand`), exactly as it already resolves the
 * lamp demand — which is also the only route available, since an authored
 * `requireControllerProceed` key does not compile from a template
 * (`ReachZoneParams` lives in `lessons/types.ts`).
 *
 * BOTH DIRECTIONS, ALWAYS. The shadow of every one of these drills still
 * completes and still passes, at every authored rung; the approach gate that
 * merely NAMES the officer as a landmark («Приближи кръстовището с
 * регулировчика с готовност за спиране») is deliberately untouched, because
 * demanding a permitted crossing of an approach mark would refuse every correct
 * drive — the failure the founder ranks worst.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SimTick } from "../../../rules";
import { recordScSigControllerLiveDrive } from "../../../traces/scSigControllerLive";
import { recordScSigControllerPosturesDrive } from "../../../traces/scSigControllerPostures";
import { recordScSignalControllerDrive } from "../../../traces/scSignalController";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import {
  createEvalState,
  deriveControllerDemand,
  parseObjectiveParams,
  stepObjective,
} from "../../objectives";
import type { ObjectiveEvalState, ObjectiveParams } from "../../types";
import { makeTick } from "../../__tests__/fixtures";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES } from "../templates";
import type { ScenarioLevel, ScenarioSpec } from "../types";

/** Northbound right-lane centre of sx-v1 — the lane every drive here uses. */
const SX_LANE = 4.0625;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const loadDistrict = (id: string): unknown =>
  JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8")) as unknown;

const specById = (id: string): ScenarioSpec => {
  const s = SCENARIO_TEMPLATES.find((x) => x.id === id);
  if (s === undefined) throw new Error(`no template ${id}`);
  return s;
};

function withTitle(specId: string, objectiveId: string, titleBg: string): ScenarioSpec {
  const spec = specById(specId);
  return {
    ...spec,
    success: spec.success.map((o) => (o.id === objectiveId ? { ...o, titleBg } : o)),
  };
}

/** One recorded drive through the whole lesson pipeline, at L3. */
function driveOutcome(
  spec: ScenarioSpec,
  districtId: string,
  record: (district: unknown, onTick: (t: SimTick) => void) => void,
): {
  done: (id: string) => boolean;
  completedAll: boolean;
  passed: boolean;
  crossings: string[];
} {
  let session = createLessonSession(compileScenario(spec, 3));
  const crossings: string[] = [];
  record(loadDistrict(districtId), (tick) => {
    for (const e of tick.events) {
      if (e.kind === "stopLineCrossed" && e.controller !== undefined) crossings.push(e.controller);
    }
    session = applyTick(session, tick).state;
  });
  const result = buildLessonResult(session);
  return {
    done: (id) => result.objectives.find((o) => o.id === id)?.done === true,
    completedAll: result.completedAll,
    passed: result.passed,
    crossings,
  };
}

const SX = "sx-v1";
type LiveDrive = "shadow-correct" | "mistake-wait-for-green" | "mistake-refuse-then-creep";
type PostureDrive = "shadow-correct" | "mistake-barge-chest" | "mistake-start-on-raised-arm";
type CtrlDrive = "shadow-correct" | "mistake-run" | "mistake-creep";

const live = (n: LiveDrive, spec = specById("sc-sig-controller-live")) =>
  driveOutcome(spec, SX, (d, onTick) => recordScSigControllerLiveDrive(d, n, { onTick }));
const postures = (n: PostureDrive, spec = specById("sc-sig-controller-postures")) =>
  driveOutcome(spec, SX, (d, onTick) => recordScSigControllerPosturesDrive(d, n, { onTick }));
const ctrl = (n: CtrlDrive, spec = specById("sc-signal-controller")) =>
  driveOutcome(spec, SX, (d, onTick) => recordScSignalControllerDrive(d, n, { onTick }));

// ---------------------------------------------------------------------------
// 1 · The matcher, both directions — the instrument before the measurement
// ---------------------------------------------------------------------------

describe("the banner claims the OFFICER released the crossing, or it claims nothing", () => {
  it("the three shipped permission banners are caught", () => {
    expect(deriveControllerDemand("Премини кръстовището, когато позата разреши посоката ти")).toBe(true);
    expect(deriveControllerDemand("Премини кръстовището след разрешение от регулировчика")).toBe(true);
    expect(
      deriveControllerDemand(
        "Премини стоп-линията по разрешение на регулировчика — въпреки червената лампа",
      ),
    ).toBe(true);
  });

  it("the officer as a LANDMARK is not a permission claim", () => {
    // The row that decides whether this matcher is safe. `sc-sctrl-approach` is
    // an APPROACH mark 42 m short of the line; it names the officer because he
    // is what the student is driving toward, and its promise is the driver's own
    // readiness. A demand for a permitted crossing there can never be satisfied
    // by anybody — it would refuse every correct drive, which is the founder's
    // own complaint pointing at us.
    expect(
      deriveControllerDemand("Приближи кръстовището с регулировчика с готовност за спиране"),
    ).toBe(false);
  });

  it("the road's permission is not a person's — the 23 shipped «разреш*» banners", () => {
    // Measured across the catalogue: 23 titles carry a permission verb and name
    // nobody. Every one of them must stay clear of this matcher, and the four
    // shapes below are the real strings, one per family.
    for (const t of [
      "Мини участъка с разрешената скорост",
      "Спри на разрешеното място след зоната",
      "Паркирай на разрешеното място след двата знака",
      "Премини наляво, след като пропуснеш идващия отдясно",
      "Приближи завоя с готовност да пропуснеш",
      "Спри за слизане на пътник под В28 — там престоят е разрешен",
    ]) {
      expect(deriveControllerDemand(t), `«${t}»`).toBe(false);
    }
  });

  it("the catalogue agrees: exactly the officer's three, and nothing else", () => {
    const claiming = SCENARIO_TEMPLATES.flatMap((s) =>
      s.success.filter((o) => deriveControllerDemand(o.titleBg)).map((o) => `${s.id}/${o.id}`),
    );
    expect(claiming.sort()).toEqual([
      "sc-sig-controller-live/sc-sctl-cross",
      "sc-sig-controller-postures/sc-sctp-cross",
      "sc-signal-controller/sc-sctrl-cross",
    ]);
  });
});

describe("no reachZone in the catalogue certifies where the student was LOOKING", () => {
  // The class this lane closed by dropping the claim. Kept as a census so it
  // cannot come back in a copy edit: the two rows that carried it are the only
  // two that ever did, and both are now banners about a place and a speed.
  const READ_CLAIM = /прочети\s+(?:позата\s+на\s+)?регулировчика/iu;

  it("surveys real gates (a sweep over nothing proves nothing)", () => {
    const zones = SCENARIO_TEMPLATES.flatMap((s) =>
      s.success.filter((o) => o.params.kind === "reachZone"),
    );
    expect(zones.length).toBeGreaterThan(300);
  });

  it("no gate claims a read", () => {
    const offenders = SCENARIO_TEMPLATES.flatMap((s) =>
      s.success
        .filter((o) => o.params.kind === "reachZone" && READ_CLAIM.test(o.titleBg))
        .map((o) => `${s.id}/${o.id} — «${o.titleBg}»`),
    );
    expect(offenders).toEqual([]);
  });

  it("the rule has teeth — it catches the two banners that shipped", () => {
    expect(READ_CLAIM.test("Приближи бавно и прочети регулировчика, не лампата")).toBe(true);
    expect(READ_CLAIM.test("Приближи бавно и прочети позата на регулировчика")).toBe(true);
    expect(READ_CLAIM.test("Приближи бавно до стоп-линията")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2 · The demand actually reaches the parser, at every authored rung
// ---------------------------------------------------------------------------

describe("the permission demand is resolved by the production parser", () => {
  const demanded = (specId: string, objectiveId: string, level: ScenarioLevel): boolean => {
    const obj = compileScenario(specById(specId), level).objectives.find((o) => o.id === objectiveId);
    if (obj === undefined) throw new Error(`no objective ${objectiveId} at L${level}`);
    return (
      (parseObjectiveParams(obj) as { requireControllerProceed?: boolean }).requireControllerProceed ===
      true
    );
  };

  it("both reachZone crossings carry it at every rung; the approach marks carry none", () => {
    for (const [specId, objectiveId] of [
      ["sc-sig-controller-postures", "sc-sctp-cross"],
      ["sc-signal-controller", "sc-sctrl-cross"],
    ] as const) {
      const rungs = specById(specId).levels;
      expect(rungs.length).toBeGreaterThanOrEqual(4);
      for (const r of rungs) expect(demanded(specId, objectiveId, r.level), `${objectiveId} L${r.level}`).toBe(true);
    }
    expect(demanded("sc-sig-controller-postures", "sc-sctp-read", 3)).toBe(false);
    expect(demanded("sc-signal-controller", "sc-sctrl-approach", 3)).toBe(false);
  });

  it("a derived demand is DROPPED, never thrown, when the zone also grades the mark", () => {
    // The single `capMet` latch cannot hold two independently-earned halves (see
    // `parseControllerDemand`), so a derived demand on a capped zone would build
    // a gate nobody can complete. It is dropped instead and this census is what
    // reports it — the same asymmetry `acceptBeforeMarkM` states: a bad authoring
    // falls back to shipped behaviour rather than bricking a lesson.
    const capped = withTitle(
      "sc-sig-controller-postures",
      "sc-sctp-read", // radius 8, cap 30 — an at-mark contract
      "Премини кръстовището, когато позата разреши посоката ти",
    );
    const obj = compileScenario(capped, 3).objectives.find((o) => o.id === "sc-sctp-read")!;
    const p = parseObjectiveParams(obj) as {
      requireControllerProceed?: boolean;
      maxSpeedKmh?: number;
    };
    expect(p.maxSpeedKmh).toBe(30);
    expect(p.requireControllerProceed).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3 · The drives — both directions, on the templates' own recordings
// ---------------------------------------------------------------------------

describe("sc-sig-controller-postures: the crossing is graded by the man, not the place", () => {
  it("the shadow reads the posture, waits it out and still completes and passes", () => {
    const r = postures("shadow-correct");
    expect(r.crossings).toEqual(["proceed"]);
    expect(r.done("sc-sctp-cross")).toBe(true);
    expect(r.completedAll).toBe(true);
    expect(r.passed).toBe(true);
  });

  for (const name of ["mistake-barge-chest", "mistake-start-on-raised-arm"] as const) {
    it(`«${name}» crosses on his HALT and no longer collects the certificate`, () => {
      const r = postures(name);
      expect(r.crossings).toEqual(["halt"]);
      expect(r.done("sc-sctp-cross")).toBe(false);
      expect(r.completedAll).toBe(false);
      expect(r.passed).toBe(false);
    });

    it(`…and it DID, on the shipped banner — «${name}» re-measured`, () => {
      // THE MUTATION. One string: the banner that shipped, minus the permission
      // claim, so `deriveControllerDemand` finds nothing and the gate is the
      // bare disc it was. The same drive is certified again — «✓ Премини
      // кръстовището, когато позата разреши посоката ти» beside a −10 опасна.
      const before = postures(
        name,
        withTitle("sc-sig-controller-postures", "sc-sctp-cross", "Излез от кръстовището на север"),
      );
      expect(before.done("sc-sctp-cross")).toBe(true);
      expect(before.completedAll).toBe(true);
      expect(before.passed).toBe(false); // the опасна was always billed; only the tick lied
    });
  }

  it("the approach gate still completes on every drive — it promises only the approach", () => {
    // The other direction for the retitled row: dropping the read claim must not
    // have made the gate stricter. All three drives approach slowly and all
    // three are credited, exactly as before.
    for (const name of [
      "shadow-correct",
      "mistake-barge-chest",
      "mistake-start-on-raised-arm",
    ] as const) {
      expect(postures(name).done("sc-sctp-read"), name).toBe(true);
    }
  });
});

describe("the demand cannot trap anyone — the half checked before the half that refuses", () => {
  /** Step one objective through a tick stream; returns the frame it completed. */
  function firstDone(params: ObjectiveParams, ticks: SimTick[]): number | null {
    let evalState: ObjectiveEvalState = createEvalState(params);
    for (const tick of ticks) {
      const r = stepObjective(params, evalState, tick, {
        stagedOutcomes: [],
        redsMetInRun: 0,
      });
      evalState = r.evalState;
      if (r.done) return tick.t;
    }
    return null;
  }

  const crossing = (controller: "halt" | "proceed"): SimTick["events"][number] => ({
    kind: "stopLineCrossed",
    control: "trafficLight",
    lightState: "red",
    controller,
  });

  const gate = (): ObjectiveParams => {
    const obj = compileScenario(specById("sc-sig-controller-postures"), 3).objectives.find(
      (o) => o.id === "sc-sctp-cross",
    )!;
    return parseObjectiveParams(obj);
  };

  it("a student who barges and comes round earns it on the second, permitted crossing", () => {
    // The authored timetable makes this a real route, not a theoretical one:
    // `flipAtSec` carries a SINGLE flip and it opens this approach, so after it
    // the permission stands. A gate that could not be re-earned would strand a
    // student inside a lesson he has already been billed 10 points for.
    const p = gate();
    const away = { x: SX_LANE, y: -60 };
    const mark = { x: SX_LANE, y: 45 };
    const ticks: SimTick[] = [
      makeTick({ t: 0, speedKmh: 20, position: away }),
      makeTick({ t: 1, speedKmh: 20, position: { x: SX_LANE, y: -20 }, events: [crossing("halt")] }),
      makeTick({ t: 2, speedKmh: 20, position: mark }),
      makeTick({ t: 3, speedKmh: 20, position: away }),
      makeTick({ t: 4, speedKmh: 20, position: { x: SX_LANE, y: -20 }, events: [crossing("proceed")] }),
      makeTick({ t: 5, speedKmh: 20, position: mark }),
    ];
    // t = 4, not t = 5: `reached` is a latch and was banked on the first pass,
    // so the permitted crossing closes the contract on the frame it happens.
    // The student is not sent round a third time to re-touch a mark he has
    // already been to — the only thing he was missing was the officer's answer.
    expect(firstDone(p, ticks)).toBe(4);
  });

  it("…and the halted crossing alone never completes it, however long he drives", () => {
    // The mutation of the row above: same stream, the recovery crossing removed.
    const p = gate();
    const ticks: SimTick[] = [
      makeTick({ t: 0, speedKmh: 20, position: { x: SX_LANE, y: -60 } }),
      makeTick({
        t: 1,
        speedKmh: 20,
        position: { x: SX_LANE, y: -20 },
        events: [crossing("halt")],
      }),
      ...[2, 3, 4, 5].map((t) => makeTick({ t, speedKmh: 20, position: { x: SX_LANE, y: 45 } })),
    ];
    expect(firstDone(p, ticks)).toBeNull();
  });

  it("a permitted crossing on the way in completes it at the mark", () => {
    const p = gate();
    const ticks: SimTick[] = [
      makeTick({ t: 0, speedKmh: 20, position: { x: SX_LANE, y: -60 } }),
      makeTick({
        t: 1,
        speedKmh: 20,
        position: { x: SX_LANE, y: -20 },
        events: [crossing("proceed")],
      }),
      makeTick({ t: 2, speedKmh: 20, position: { x: SX_LANE, y: 45 } }),
    ];
    expect(firstDone(p, ticks)).toBe(2);
  });
});

describe("sc-signal-controller: the same row, in a file this lane does not own", () => {
  it("the shadow completes and passes", () => {
    const r = ctrl("shadow-correct");
    expect(r.crossings).toEqual(["proceed"]);
    expect(r.done("sc-sctrl-cross")).toBe(true);
    expect(r.completedAll).toBe(true);
    expect(r.passed).toBe(true);
  });

  for (const name of ["mistake-run", "mistake-creep"] as const) {
    it(`«${name}» crosses on his HALT and is refused — and was certified before`, () => {
      const r = ctrl(name);
      expect(r.crossings).toEqual(["halt"]);
      expect(r.done("sc-sctrl-cross")).toBe(false);
      const before = ctrl(
        name,
        withTitle("sc-signal-controller", "sc-sctrl-cross", "Излез от кръстовището на север"),
      );
      expect(before.done("sc-sctrl-cross")).toBe(true);
      expect(before.completedAll).toBe(true);
    });
  }
});

describe("sc-sig-controller-live: already honest, and it stays that way", () => {
  it("the shadow completes all three; both mistakes fail the crossing gate", () => {
    const shadow = live("shadow-correct");
    expect(shadow.crossings).toEqual(["proceed"]);
    expect(shadow.completedAll).toBe(true);
    expect(shadow.passed).toBe(true);
    for (const name of ["mistake-wait-for-green", "mistake-refuse-then-creep"] as const) {
      const r = live(name);
      expect(r.crossings, name).toEqual(["halt"]);
      expect(r.done("sc-sctl-cross"), name).toBe(false);
      expect(r.passed, name).toBe(false);
    }
  });

  it("its retitled approach gate still completes on every drive", () => {
    for (const name of [
      "shadow-correct",
      "mistake-wait-for-green",
      "mistake-refuse-then-creep",
    ] as const) {
      expect(live(name).done("sc-sctl-read"), name).toBe(true);
    }
  });

  it("its crossing gate is a passSignal with requireRedMet — the demand it keeps", () => {
    // Deliberately NOT converted to the new demand. `requireRedMet` is the
    // stronger claim here and it is the one this banner makes: a FORBIDDING lamp
    // crossed on the officer's permission, which is the whole чл. 7 thesis and
    // the only way this drill completes.
    const obj = compileScenario(specById("sc-sig-controller-live"), 3).objectives.find(
      (o) => o.id === "sc-sctl-cross",
    )!;
    const p = parseObjectiveParams(obj) as { kind: string; requireRedMet?: boolean };
    expect(p.kind).toBe("passSignal");
    expect(p.requireRedMet).toBe(true);
  });
});
