/**
 * ADR-009 lane R (T15) — THE OVERRIDE CHANNEL DOES NOT CROSS THE WIRE, so no
 * student-facing sentence may ride it.
 *
 * THE DEFECT. Three `makeViolation` calls in `rules/engine.ts` put per-act copy
 * on the event through the `titleBg`/`explanationBg` OVERRIDE channel and
 * passed no `detail` (line numbers AT HEAD 0137fde — before this commit; the
 * calls have moved in the tree you are reading, which is the point):
 *
 *   :5857  JUNCTION_SCAN_COPY.giveWay   «Непълно оглеждане при знак Б1»
 *   :5882  JUNCTION_SCAN_COPY.stop      «…при знак Б2»
 *   :3940  SNOW_LIGHTS_COPY             «Движение в снеговалеж без светлини»
 *
 * `serializeRuleEvents` (lessons/wire.ts) carries `kind`, `code`, `t`,
 * `detail`, `penaltyMultiplier` and `x/y` — and nothing else. So the server's
 * `rebuildRuleEvents` rebuilt the POOLED row for all three: «Непълно оглеждане
 * на кръстовището» and «Движение в дъжд без светлини». The client card and the
 * server's stored record named two different acts for one event, which is the
 * w12 WRONG_WAY defect exactly (six «еднопосочна улица» cards on a motorway
 * merge) one code over.
 *
 * THE EXCUSE THAT LET IT STAND, and why this file scans the source rather than
 * only asserting two titles. `rules/engine.ts`'s WRONG_WAY docblock claimed
 * «JUNCTION_SCAN_COPY gets away with the override because its events are billed
 * inside a pre-drive/junction path that is retitled again on rebuild». No such
 * path exists: `rebuildRuleEvents`'s only retitler is `preDriveStepTitle`,
 * which answers for PREDRIVE_WRONG_ORDER and PREDRIVE_STEP_SKIPPED alone, and
 * only for a `detail` that is a `PreDriveStepId` — «give-way» is not one. A
 * wrong REASON written next to correct code is how the next author adds a
 * fourth such call, so the reason is now a gate.
 *
 * WHAT ADR-009 CHANGED. The copy moved verbatim into `catalog.ts`'s detail-keyed
 * `PER_ACT_COPY` (JUNCTION_SCAN_CONTROL_COPY, SNOW_LIGHTS_ACT_COPY) and the
 * three calls pass `{ detail }`. Nothing about the grade moved: same codes,
 * same severities, same points, same `lawRef`, same arming conditions.
 *
 * FOUR THINGS THIS FILE HOLDS:
 *   1. PARITY ON THE CHARGED PATH — `makeViolation` and `rebuildRuleEvents`
 *      resolve the SAME title for each detail, round-tripped through the real
 *      `serializeRuleEvents`. THIS IS THE CHARGED PATH ONLY. It is NOT a claim
 *      that a lesson's two halves agree today: see 2.
 *   2. THE COACHED PATH IS STILL BROKEN, AND IS PINNED SO (§ „LANE C GAP").
 *      Lane R's verifier drove every committed tape at L1 and L3 — 1,006 drives
 *      — and JUNCTION_SCAN_INCOMPLETE is COACHED on all of them and charged on
 *      none. A coached row crosses as `WireCoachedMistake = { code, t }` and
 *      the server re-titles it from `VIOLATIONS[code].titleBg`, so the two
 *      halves of one debrief STILL name two different acts for all of today's
 *      traffic. That is lane C's work, and it is FOUR edits rather than the two
 *      the first version of this block named (spec 92 ADDENDUM 1 item 1):
 *      `recordCoached` fills `detail`, `serializeCoachedMistakes` carries it,
 *      `parseCoachedMistakes` KEEPS it — capped, the way `parseRuleEvents`
 *      already caps a charged detail at `wire.ts:297` — and `gradeFinishWire`
 *      re-titles through `actCopy(code, detail)`, never by accepting a
 *      client-authored title. The tests below assert TODAY'S WRONG BEHAVIOUR on
 *      purpose and say which lines to flip.
 *      WHICH EDIT REDS WHICH — measured by this file's verifier rather than
 *      assumed: FLIP 1 on the serialiser, FLIP 4 on `recordCoached`, FLIP 5 on
 *      the parser, FLIP 6 on the parser and the re-title together. FLIPs 2 and
 *      3 sit behind FLIP 1 inside one `it` and therefore cannot red on their
 *      own — the verifier landed the re-title alone and all 36 cases stayed
 *      green, which is exactly why FLIP 5 and FLIP 6 exist.
 *   3. THE ENGINE BILLS THE RIGHT ACT — «give-way» at a Б1 line, «stop» at a Б2
 *      line, «snow» in a snowfall, driven through the real reducer. (The Б1/Б2
 *      CARD is also held by `junction-scan-control-copy.test.ts`, which asserts
 *      the two titles and not the `detail` they now travel on; that file is not
 *      lane R's to edit — see the report.)
 *   4. NO FOURTH CALL — a source scan that fails on any `makeViolation` passing
 *      `titleBg`/`explanationBg` without a `detail`, and fails on any call shape
 *      it CANNOT READ rather than skipping it. This repo has shipped three
 *      green-and-blind source scanners; the mutation cases at the bottom drive
 *      this one against synthetic sources that contain each escape by
 *      construction, including the seven this scan's own verifier reproduced.
 *
 * THE SCAN'S THREE REPAIRED HOLES (verifier pass, 2026-09-18) — each one is a
 * mutation case below:
 *   • IT READ THE ARGUMENT AS TEXT. `/\bdetail\s*:/` over the whole argument
 *     said „has a detail" for a `detail:` written inside authored Bulgarian
 *     copy, for a `detail` nested in a sub-object, for `detail: undefined`, and
 *     for one branch of a ternary whose other branch shipped bare copy. The
 *     argument is now PARSED: top-level keys only, `undefined`/`void 0` is not
 *     a detail, and each branch of a ternary is classified on its own with the
 *     worst one winning.
 *   • THE ALLOWLIST NAMED A SHAPE, NOT A SITE. Keyed on (file, argument text),
 *     it covered a SECOND call added to the same file with the same argument.
 *     Entries now pin the whole collapsed call AND its exact count, and a
 *     `detail-and-copy` call — copy that rides the channel legitimately because
 *     the server recomputes the identical string from `detail` — must be listed
 *     too. Exactly the two pre-drive machine sites are.
 *   • IT SCANNED THE WRONG ROOT. `makeViolation` is re-exported from
 *     `rules/index.ts` and called outside `modules/sim` (today:
 *     `app/dev/popup-rig/popup-rig-client.tsx`). The root is `platform/src`.
 *   Also closed: an aliased or namespaced import (`makeViolation as mv`,
 *   `cat.makeViolation(...)`), a spread argument list, and `.call/.apply/.bind`.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

import {
  HEADLIGHTS_CONDITION_SNOW,
  JUNCTION_SCAN_CONTROL_COPY,
  JUNCTION_SCAN_CONTROL_GIVE_WAY,
  JUNCTION_SCAN_CONTROL_STOP,
  makeViolation,
  PER_ACT_COPY,
  SNOW_LIGHTS_ACT_COPY,
  VIOLATIONS,
  violationPeekBg,
} from "../catalog";
import {
  gradeFinishWire,
  rebuildRuleEvents,
  serializeCoachedMistakes,
  serializeRuleEvents,
} from "../../lessons/wire";
import { applyPreDriveAction, createPreDriveMachine } from "../../procedures/machine";
import { cruise, drive } from "./fixtures";
import { createRuleEngine, reduceTick } from "../engine";
import type { CoachedMistake } from "../../lessons/types";
import type { RuleEngineState, SimTick, ViolationEvent } from "../index";

// ---------------------------------------------------------------------------
// 1. Client / server parity — ON THE CHARGED PATH
// ---------------------------------------------------------------------------

/** The server's half of the CHARGED trip, through the REAL serialiser. */
function roundTrip(event: ViolationEvent): ViolationEvent {
  const wire = serializeRuleEvents([event]);
  const rebuilt = rebuildRuleEvents(wire);
  expect(rebuilt, "the wire must rebuild — an unknown code returns null").not.toBeNull();
  expect(rebuilt).toHaveLength(1);
  const server = rebuilt![0];
  expect(server.kind).toBe("violation");
  return server as ViolationEvent;
}

describe("act copy resolves identically on both sides of the CHARGED wire", () => {
  it("Б1 gives the Б1 title on both sides of a charged event", () => {
    const client = makeViolation("JUNCTION_SCAN_INCOMPLETE", 12, {
      detail: JUNCTION_SCAN_CONTROL_GIVE_WAY,
    });
    expect(client.titleBg).toBe("Непълно оглеждане при знак Б1");
    expect(client.detail).toBe("give-way");
    // THE ASSERTION THE DEFECT WOULD HAVE FAILED: before this lane the client
    // carried the Б1 title and the server rebuilt «…на кръстовището».
    expect(roundTrip(client)).toEqual(client);
  });

  it("Б2 gives the Б2 title on both sides of a charged event", () => {
    const client = makeViolation("JUNCTION_SCAN_INCOMPLETE", 12, {
      detail: JUNCTION_SCAN_CONTROL_STOP,
    });
    expect(client.titleBg).toBe("Непълно оглеждане при знак Б2");
    expect(client.detail).toBe("stop");
    expect(roundTrip(client)).toEqual(client);
  });

  it("the snow condition gives the snow title on both sides, never «в дъжд»", () => {
    const client = makeViolation("HEADLIGHTS_OFF_IN_RAIN", 7, {
      detail: HEADLIGHTS_CONDITION_SNOW,
    });
    expect(client.titleBg).toBe("Движение в снеговалеж без светлини");
    expect(client.titleBg).not.toContain("дъжд");
    expect(client.detail).toBe("snow");
    expect(roundTrip(client)).toEqual(client);
  });

  /**
   * THE OTHER DIRECTION, which is what keeps hit-free debriefs byte-identical
   * (§3.5, T3): a drive that carries no `detail` must still get the pooled row
   * on both sides. The RAIN arm of HEADLIGHTS_OFF_IN_RAIN is exactly that case
   * and is the majority of this code's real CHARGED traffic.
   */
  it("no detail still pools, identically on both sides", () => {
    for (const code of ["JUNCTION_SCAN_INCOMPLETE", "HEADLIGHTS_OFF_IN_RAIN"] as const) {
      const client = makeViolation(code, 3);
      expect(client.titleBg).toBe(VIOLATIONS[code].titleBg);
      expect(client.detail).toBeUndefined();
      expect(roundTrip(client)).toEqual(client);
    }
  });

  it("an unrecognised detail pools rather than falling silent — on both sides", () => {
    const client = makeViolation("JUNCTION_SCAN_INCOMPLETE", 4, { detail: "Б7" });
    expect(client.titleBg).toBe(VIOLATIONS.JUNCTION_SCAN_INCOMPLETE.titleBg);
    expect(roundTrip(client)).toEqual(client);
  });

  /**
   * The literal shape §8.1 T15 names — a hand-built wire row, i.e. the payload
   * a client of a different build could send. Kept beside the round trip
   * because they answer different questions: the round trip proves the two
   * halves of one CHARGED event agree, this proves the server needs nothing
   * from the client but `(code, t, detail)`.
   */
  it("a hand-built wire row alone carries enough to title the card", () => {
    const rebuilt = rebuildRuleEvents([
      { kind: "violation", code: "JUNCTION_SCAN_INCOMPLETE", t: 9, detail: "give-way" },
    ]);
    expect(rebuilt![0].titleBg).toBe("Непълно оглеждане при знак Б1");
  });

  /**
   * THE LEGITIMATE OVERRIDE, PROVED RATHER THAN ASSERTED. `procedures/machine.ts`
   * is the one producer that still passes `titleBg` — and it is legal only
   * because `lessons/wire.ts preDriveStepTitle` recomputes the SAME string from
   * `(code, detail)`. The allowlist in §4 names those two sites; this case is
   * why they are allowed, driven through the real pre-drive machine so that a
   * drift in EITHER formula reds it.
   */
  it("the pre-drive machine's own title survives the wire unchanged", () => {
    // "adjust-mirrors" before "adjust-seat" is the documented wrong order.
    const first = applyPreDriveAction(
      createPreDriveMachine({ isNight: false, mode: "assess" }),
      "adjust-mirrors",
      1,
    );
    const wrongOrder = first.events.find(
      (e): e is ViolationEvent => e.kind === "violation" && e.code === "PREDRIVE_WRONG_ORDER",
    );
    expect(wrongOrder, "the assess-mode machine must still bill a wrong order").toBeDefined();
    expect(wrongOrder!.detail).toBe("adjust-mirrors");
    expect(wrongOrder!.titleBg).toMatch(/^Нарушен ред: /);
    // The override is NOT pooled away and NOT drifted: same string, both sides.
    expect(roundTrip(wrongOrder!).titleBg).toBe(wrongOrder!.titleBg);
    expect(roundTrip(wrongOrder!)).toEqual(wrongOrder!);
  });
});

// ---------------------------------------------------------------------------
// 1b. LANE C GAP — the COACHED path, which is 100% of today's traffic
// ---------------------------------------------------------------------------

/**
 * WHY THIS TEST ASSERTS THE WRONG ANSWER ON PURPOSE.
 *
 * A permanently-red test is not a tripwire in this repo — it is a thing the
 * next gate run has to explain away, and the standing order is to keep the
 * gates readable. So the gap is pinned the other way round: every assertion
 * below states what the product does TODAY, each one marked FLIP. When lane C
 * carries `detail` on the coached wire row, this file goes red at the exact
 * lines that describe the defect, and the reader flips them into the assertions
 * §1 already makes for the charged path.
 *
 * DO NOT READ §1 AS „CLIENT AND SERVER AGREE". It proves the charged path only.
 * On the coached path — the ONLY one 1,006 measured drives of this code reach —
 * the student's card says «Непълно оглеждане при знак Б1» and the server's
 * stored record says «Непълно оглеждане на кръстовището», which is the very
 * thing §3.3b of the spec exists to stop, and ADR-009's fold reads that title.
 */
describe("LANE C GAP: the coached path still pools the title (spec 92, ADDENDUM 1 item 1)", () => {
  const basePayload = {
    lessonId: "l0-free-drive",
    startedAtMs: 1_000,
    finishedAtMs: 61_000,
    aborted: false,
    ruleEvents: [],
    objectives: [],
  };

  it("the coached wire row drops `detail`, so the server can only pool — FLIP WHEN LANE C LANDS", () => {
    const client = crossLine("giveWay").find((e) => e.code === "JUNCTION_SCAN_INCOMPLETE");
    expect(client, "the reducer must still produce the Б1 scan fault").toBeDefined();
    // What the STUDENT SAW: the act's own card, act title and act detail.
    expect(client!.titleBg).toBe("Непълно оглеждане при знак Б1");
    expect(client!.detail).toBe("give-way");

    // The client's coached record, shaped exactly as `lessons/engine.ts`
    // `recordCoached` shapes it — except that `recordCoached` does not copy
    // `detail` at all yet, which is half of what lane C owes. Passing it here
    // makes the DROP the wire performs the thing under test.
    const coached: CoachedMistake = {
      code: client!.code,
      titleBg: client!.titleBg,
      t: client!.t,
      detail: client!.detail,
    };
    const wire = serializeCoachedMistakes([coached]);
    // FLIP 1: today the wire row is code+t only. Lane C adds `detail: "give-way"`.
    expect(wire).toEqual([{ code: "JUNCTION_SCAN_INCOMPLETE", t: client!.t }]);

    const graded = gradeFinishWire({ ...basePayload, coachedMistakes: wire });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    // FLIP 2: today the server re-titles from the POOLED catalogue row, because
    // code+t is all it was given. Lane C re-titles through `actCopy(code, detail)`.
    expect(graded.result.coachedMistakes).toEqual([
      { code: "JUNCTION_SCAN_INCOMPLETE", titleBg: "Непълно оглеждане на кръстовището", t: client!.t },
    ]);
    // FLIP 3 (delete this one): the two halves of one debrief name two acts.
    expect(graded.result.coachedMistakes![0]!.titleBg).not.toBe(client!.titleBg);
  });

  /**
   * THE PIN THAT CAN FAIL ON ITS OWN, and the reason it had to be written.
   *
   * FLIPs 2 and 3 above sit behind FLIP 1 in a single `it`, so while FLIP 1 is
   * red they never execute — and this file's verifier measured what that hides:
   * he taught `gradeFinishWire` to re-title through `actCopy(code, detail)`, the
   * exact repair FLIP 2 claims to detect, and all 36 cases stayed GREEN. The
   * cause is a THIRD edit nobody had named: `parseCoachedMistakes`
   * (`lessons/wire.ts:536-548`) rebuilds every row as `{ code, t }` at the
   * validation boundary, so the detail is gone before any re-title can read it.
   * A pin that stays green under the very change it advertises is the
   * green-and-blind class this repo has repaired three times.
   *
   * So this case hands the server the payload LANE C'S CLIENT WILL SEND — a
   * coached row that ALREADY carries `detail` — and pins each half of the loss
   * at the boundary it happens at, behind nothing:
   *   FLIP 5 — the VALIDATOR drops it. Reds the moment `parseCoachedMistakes`
   *            carries a `detail` (capped at `MAX_DETAIL_LEN`, as
   *            `parseRuleEvents` does at `wire.ts:297`), whatever the
   *            serialiser and `recordCoached` do.
   *   FLIP 6 — the RE-TITLE pools it. Reds once the parser keeps the detail AND
   *            `gradeFinishWire` resolves the title through `actCopy`.
   *
   * THEY ARE TWO `it`s ON PURPOSE, which is the whole lesson of FLIP 2/3: an
   * assertion parked behind a failing one in the same case is not a tripwire,
   * it is a thing that never executes. FLIP 6 is what the STUDENT sees, so it
   * must be able to red on its own.
   */
  const coachedWireRow = { code: "JUNCTION_SCAN_INCOMPLETE", t: 17, detail: "give-way" };

  it("FLIP 5 — the validator drops `detail` from a coached row that carries it", () => {
    const graded = gradeFinishWire({ ...basePayload, coachedMistakes: [coachedWireRow] });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    // The parsed row is code+t: the client's act did not survive validation, so
    // nothing downstream of it can be blamed for pooling the title.
    expect(graded.wire.coachedMistakes).toEqual([{ code: "JUNCTION_SCAN_INCOMPLETE", t: 17 }]);
  });

  it("FLIP 6 — …so the stored record names the POOLED act, not the student's", () => {
    const graded = gradeFinishWire({ ...basePayload, coachedMistakes: [coachedWireRow] });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.result.coachedMistakes).toEqual([
      { code: "JUNCTION_SCAN_INCOMPLETE", titleBg: "Непълно оглеждане на кръстовището", t: 17 },
    ]);
    // …and the act's own sentence really is a different one, sitting in the
    // catalogue on the SERVER's own side of the import the whole time — or the
    // assertion above would also pass on a server that had already been fixed.
    expect(JUNCTION_SCAN_CONTROL_COPY["give-way"]!.titleBg).not.toBe(
      VIOLATIONS.JUNCTION_SCAN_INCOMPLETE.titleBg,
    );
  });

  /**
   * THE OTHER HALF LANE C OWES, pinned at its own address. The wire can only
   * drop what it is given, and today the client never even fills it:
   * `lessons/engine.ts recordCoached` builds `{ code, titleBg, t }` and stops.
   * Read from source because this lane owns neither file and cannot drive the
   * lesson engine from here; it FAILS rather than skips when the anchor moves,
   * which is the rule three green-and-blind scanners in this repo were repaired
   * by.
   */
  it("…and `recordCoached` never fills `detail` — FLIP WHEN LANE C LANDS", () => {
    const engineSrc = readFileSync(join(SIM_ROOT, "lessons", "engine.ts"), "utf8");
    const body = /const recordCoached = \([\s\S]*?\n {2}\};/.exec(engineSrc);
    expect(
      body,
      "recordCoached moved or was renamed — re-anchor this case before believing it",
    ).not.toBeNull();
    // FLIP 4: lane C pushes `detail` here too, and this assertion inverts.
    expect(body![0]).not.toContain("detail");
    expect(body![0]).toContain("coachedNew.push(");
    // …and the SHAPE, not merely the absence of a word. `coachedNew.push({
    // ...e })` fills `detail` without ever spelling it, and the two assertions
    // above wave it through — the verifier planted exactly that and the suite
    // stayed green. Pinning the field list means any widening of the row, by
    // spread or by name, has to come past this line.
    expect(body![0].replace(/\s+/g, " ")).toContain(
      "coachedNew.push({ code: e.code, titleBg: e.titleBg, t: e.t });",
    );
  });

  it("the act copy the server cannot reach is nevertheless there, keyed on the detail it is not sent", () => {
    // The repair lane C needs is a WIRE change, not a copy change: the sentence
    // already exists on the server's own side of the import. Nothing here needs
    // a client-authored `titleBg` — `wire.ts`'s docblock refuses one (ADR-002)
    // and is right.
    expect(JUNCTION_SCAN_CONTROL_COPY["give-way"]!.titleBg).toBe(
      "Непълно оглеждане при знак Б1",
    );
    expect(VIOLATIONS.JUNCTION_SCAN_INCOMPLETE.titleBg).toBe(
      "Непълно оглеждане на кръстовището",
    );
  });
});

describe("the catalogue keeps owning everything but the two sentences", () => {
  it("severity, points and the чл. 47/48/50 citation are unchanged per control", () => {
    const spec = VIOLATIONS.JUNCTION_SCAN_INCOMPLETE;
    for (const detail of [JUNCTION_SCAN_CONTROL_GIVE_WAY, JUNCTION_SCAN_CONTROL_STOP]) {
      const e = makeViolation("JUNCTION_SCAN_INCOMPLETE", 1, { detail });
      expect(e.severityClass).toBe(spec.severityClass);
      expect(e.points).toBe(spec.points);
      // No row authors a `lawRef`: both controls break the same articles, and
      // inventing a narrower citation here would be free-recall (ADR-002).
      expect(e.lawRef).toBe(spec.lawRef);
      expect(e.conceptId).toBe(spec.conceptId);
    }
  });

  it("the snow act keeps the чл. 70, ал. 1 row it reuses", () => {
    const spec = VIOLATIONS.HEADLIGHTS_OFF_IN_RAIN;
    const e = makeViolation("HEADLIGHTS_OFF_IN_RAIN", 1, { detail: HEADLIGHTS_CONDITION_SNOW });
    expect(e.severityClass).toBe(spec.severityClass);
    expect(e.points).toBe(spec.points);
    expect(e.lawRef).toBe(spec.lawRef);
  });

  /**
   * `peekBg` IS DELIBERATELY NOT AUTHORED PER ACT here, and that is a decision
   * with a gate rather than an omission. Both pooled summaries are already
   * neutral — „«Гледах, но не видях»." names no sign and „За да те видят, не
   * ти." names no weather — so `violationPeekBg` inherits them and no new
   * student-facing sentence enters the product. If a later lane authors one, it
   * must clear `violation-title-fits-peek.test.ts`'s window budget under the
   * LONGER act title, which is what this assertion points at.
   */
  it("the phone peek inherits the pooled, act-neutral summary", () => {
    for (const [code, detail] of [
      ["JUNCTION_SCAN_INCOMPLETE", JUNCTION_SCAN_CONTROL_GIVE_WAY],
      ["JUNCTION_SCAN_INCOMPLETE", JUNCTION_SCAN_CONTROL_STOP],
      ["HEADLIGHTS_OFF_IN_RAIN", HEADLIGHTS_CONDITION_SNOW],
    ] as const) {
      expect(violationPeekBg(code, detail)).toBe(VIOLATIONS[code].peekBg);
      expect(violationPeekBg(code, detail)).not.toBeNull();
    }
    expect(violationPeekBg("JUNCTION_SCAN_INCOMPLETE", "give-way")).not.toMatch(/Б1|Б2/);
  });

  it("both tables are REGISTERED in PER_ACT_COPY — the registry is what both sides read", () => {
    expect(PER_ACT_COPY.JUNCTION_SCAN_INCOMPLETE).toBe(JUNCTION_SCAN_CONTROL_COPY);
    expect(PER_ACT_COPY.HEADLIGHTS_OFF_IN_RAIN).toBe(SNOW_LIGHTS_ACT_COPY);
    expect(Object.keys(JUNCTION_SCAN_CONTROL_COPY).sort()).toEqual(["give-way", "stop"]);
    expect(Object.keys(SNOW_LIGHTS_ACT_COPY)).toEqual(["snow"]);
  });

  /**
   * THE MOVE WAS VERBATIM, and this is the assertion that says so in the only
   * way a test can: the Б1 sentence must still refuse the myth its lesson
   * exists to kill (Б1 demands yielding, not stopping — ЗДвП чл. 50), and the
   * Б2 sentence must still name the stop line. `catalog.ts`'s own row stays
   * control-neutral, which `junction-scan-control-copy.test.ts` holds.
   */
  it("each sentence still names its own sign and only its own", () => {
    const giveWay = JUNCTION_SCAN_CONTROL_COPY["give-way"]!;
    const stop = JUNCTION_SCAN_CONTROL_COPY["stop"]!;
    expect(giveWay.titleBg).toContain("Б1");
    expect(giveWay.titleBg).not.toContain("Б2");
    expect(giveWay.explanationBg).toContain("Б1");
    expect(giveWay.explanationBg).not.toContain("Б2");
    expect(giveWay.explanationBg).toContain("Б1 не иска да спреш винаги");
    expect(stop.titleBg).toContain("Б2");
    expect(stop.titleBg).not.toContain("Б1");
    expect(stop.explanationBg).toContain("стоп-линията");
    expect(stop.explanationBg).not.toContain("Б1");
  });
});

// ---------------------------------------------------------------------------
// 2. The engine bills the act the student actually committed
// ---------------------------------------------------------------------------

/**
 * The JU-23 drill, the same shape `junction-scan-control-copy.test.ts` drives:
 * the detector is default-OFF, so the lesson's own opt-in arms it, and no
 * glance falls in the lookback, so the scan fault is owed at either sign.
 */
function crossLine(control: "giveWay" | "stopSign"): ViolationEvent[] {
  let s: RuleEngineState = createRuleEngine({ junctionScanObservationEnabled: true });
  for (const t of [0, 1]) s = reduceTick(s, junctionTick(t)).state;
  const r = reduceTick(s, junctionTick(2, { events: [{ kind: "stopLineCrossed", control }] }));
  return r.events.filter((e): e is ViolationEvent => e.kind === "violation");
}

function junctionTick(t: number, over: Partial<SimTick> = {}): SimTick {
  return {
    t,
    speedKmh: 12,
    maxSpeedKmh: 50,
    position: { x: 0, y: 0 },
    headingDeg: 0,
    laneOffsetM: 0,
    laneId: 0,
    gear: 1,
    seatbeltOn: true,
    handbrakeOn: false,
    headlights: "off",
    isNight: false,
    indicator: "off",
    events: [],
    ...over,
  } as SimTick;
}

describe("the reducer stamps the act, so the server can rebuild the card", () => {
  it("a Б1 give-way line bills detail «give-way»", () => {
    const scan = crossLine("giveWay").find((e) => e.code === "JUNCTION_SCAN_INCOMPLETE");
    expect(scan, "the give-way branch must still grade the missing scan").toBeDefined();
    expect(scan!.detail).toBe(JUNCTION_SCAN_CONTROL_GIVE_WAY);
    expect(scan!.titleBg).toBe("Непълно оглеждане при знак Б1");
    // …and the server agrees IF THE EVENT IS CHARGED, from the event the
    // reducer really produced. Coached, it does not — see the LANE C GAP above.
    expect(roundTrip(scan!)).toEqual(scan!);
  });

  it("a Б2 stop line bills detail «stop», beside the full-stop fault", () => {
    const v = crossLine("stopSign");
    const scan = v.find((e) => e.code === "JUNCTION_SCAN_INCOMPLETE");
    expect(scan).toBeDefined();
    expect(scan!.detail).toBe(JUNCTION_SCAN_CONTROL_STOP);
    expect(scan!.titleBg).toBe("Непълно оглеждане при знак Б2");
    expect(v.map((e) => e.code)).toContain("STOP_SIGN_NO_FULL_STOP");
    expect(roundTrip(scan!)).toEqual(scan!);
  });

  it("an unlit snowfall drive bills detail «snow»", () => {
    // O28's own drill (`conditions.test.ts`): 22 км/ч is under the snow
    // envelope, so the only fault owed is the lamp one, and the sustain window
    // is `rainLightsSustainSec` = 3 s.
    const events = drive(cruise(0, 4, { speedKmh: 22, maxSpeedKmh: 50, snow: true, headlights: "off" })).events;
    const card = events.find(
      (e): e is ViolationEvent => e.kind === "violation" && e.code === "HEADLIGHTS_OFF_IN_RAIN",
    );
    expect(card, "the snow arm must still convict an unlit winter drive").toBeDefined();
    expect(card!.detail).toBe(HEADLIGHTS_CONDITION_SNOW);
    expect(card!.titleBg).toContain("снеговалеж");
    expect(card!.titleBg).not.toContain("дъжд");
    expect(roundTrip(card!)).toEqual(card!);
  });

  /**
   * THE RAIN ARM MUST NOT HAVE ACQUIRED A DETAIL. It shares the code, and if it
   * started stamping one, `coach.ts encounterKey` would split the rain and snow
   * ladders and the debrief would grow a group that no lesson bills. Measured
   * over the committed corpus: no drive carries both arms (they are mutually
   * exclusive by `lowBeamDuty`), but the assertion is cheap and the claim is
   * load-bearing for R12.
   */
  it("the RAIN arm still carries no detail, so its card and its ladder are untouched", () => {
    const events = drive(
      cruise(0, 6, { speedKmh: 22, maxSpeedKmh: 50, rain: true, headlights: "off" } as Partial<SimTick>),
    ).events;
    const card = events.find(
      (e): e is ViolationEvent => e.kind === "violation" && e.code === "HEADLIGHTS_OFF_IN_RAIN",
    );
    expect(card, "the rain arm must still convict").toBeDefined();
    expect(card!.detail).toBeUndefined();
    expect(card!.titleBg).toBe(VIOLATIONS.HEADLIGHTS_OFF_IN_RAIN.titleBg);
  });
});

// ---------------------------------------------------------------------------
// 3. The source scan: no fourth override-without-detail call
// ---------------------------------------------------------------------------

const SIM_ROOT = join(__dirname, "..", "..");
/** THE SCAN ROOT IS `platform/src`, NOT `modules/sim`: `rules/index.ts`
 *  re-exports `makeViolation`, so a violation can be built anywhere in the app
 *  (today `app/dev/popup-rig/popup-rig-client.tsx` does). Scoping this to the
 *  rules module is the hole the verifier walked through. ~960 non-test files,
 *  read once and memoised — about 0.8 s. */
const SRC_ROOT = join(__dirname, "..", "..", "..", "..");

export type CallShape =
  /** No third argument at all (or a literal `undefined`) — the pooled row. */
  | "pooled"
  /** An object literal naming `detail` and no copy keys. */
  | "detail-only"
  /** An object literal naming `detail` AND copy keys — legal ONLY where the
   *  server recomputes the same string from `detail` (procedures/machine.ts),
   *  which is why every such call must be named in `ALLOWED_CALLS`. */
  | "detail-and-copy"
  /** Copy keys with no resolvable detail — THE DEFECT. Includes
   *  `detail: undefined`, a `detail` nested one level down, a `detail:` written
   *  inside authored copy, and a ternary branch that ships bare copy. */
  | "copy-without-detail"
  /** Anything this scan cannot read: an identifier, a spread, a computed key,
   *  a broken call. Never a skip — always a failure unless named. */
  | "unresolved";

export interface Call {
  file: string;
  line: number;
  shape: CallShape;
  /** The third argument's source text, collapsed — for the failure message. */
  arg: string;
  /** The whole call, collapsed — what the allowlist pins a SITE by. */
  call: string;
}

/**
 * Walk from the bracket at `open` to its matching closer; -1 if it never
 * closes or closes with the wrong bracket. Strings and template literals are
 * skipped so a brace inside authored Bulgarian copy cannot move the match.
 */
const CLOSERS: Record<string, string> = { "(": ")", "[": "]", "{": "}" };

function matchBracket(src: string, open: number): number {
  const want = CLOSERS[src[open]!];
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i]!;
    if (quote !== null) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      quote = c;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth === 0) return c === want ? i : -1;
    }
  }
  return -1;
}

/**
 * Split at TOP-LEVEL occurrences of one separator.
 *
 * Written by hand rather than with a regex because the shapes that matter span
 * lines and nest: `makeViolation("X", t, { titleBg: `…${f(a, b)}…`, detail: id
 * })` has three commas inside its third argument. Strings and template literals
 * are skipped so a comma or a brace inside authored copy cannot move the split.
 */
function splitTop(text: string, sep2: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quote !== null) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      quote = c;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === sep2 && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/** The call's arguments, or `null` when the parens never close — which is an
 *  UNRESOLVED call and therefore a failure, never a skip. */
function splitArgs(src: string, open: number): string[] | null {
  const close = matchBracket(src, open);
  if (close < 0) return null;
  const inner = src.slice(open + 1, close);
  return inner.trim() === "" ? [] : splitTop(inner, ",");
}

/**
 * Where a `/` may open a REGEX LITERAL rather than divide: after an operator,
 * an opening bracket, a comma, a colon, a semicolon or `=>`, and after the
 * keywords that take an expression. Deliberately NARROW — `}`, `)`, `>` and
 * `<` are left out because in a `.tsx` file they are overwhelmingly JSX
 * (`<Foo {...p} />`, `</div>`), and a `/` misread as opening a literal there
 * would swallow the rest of the line, which is the defect being repaired.
 */
const REGEX_MAY_FOLLOW = new Set(["(", ",", "=", ":", "[", "&", "|", "?", ";"]);
const REGEX_MAY_FOLLOW_KEYWORD = new Set([
  "return",
  "typeof",
  "case",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "do",
  "else",
  "yield",
  "await",
  "instanceof",
]);

/** Is the `/` about to be read an expression start, given what came before it? */
function regexMayStart(out: string): boolean {
  let i = out.length - 1;
  while (i >= 0 && /\s/.test(out[i]!)) i--;
  if (i < 0) return true; // start of file
  const c = out[i]!;
  if (REGEX_MAY_FOLLOW.has(c)) return true;
  if (c === ">") return out[i - 1] === "="; // `=>` opens an expression; JSX does not
  // `!` IS BOTH, and TypeScript is why. Prefix it negates and a literal may
  // follow (`!/re/.test(s)`); postfix it asserts non-null and what follows is
  // division (`sum[k]! / hits[k]!` — `world/builders/roundabout.ts:809`, found
  // by this very report on the real tree). Which one it is, is the same
  // question one character to the left.
  if (c === "!") return regexMayStart(out.slice(0, i));
  if (!/[A-Za-z0-9_$]/.test(c)) return false;
  let j = i;
  while (j >= 0 && /[A-Za-z0-9_$]/.test(out[j]!)) j--;
  return REGEX_MAY_FOLLOW_KEYWORD.has(out.slice(j + 1, i + 1));
}

/** Index of the `/` that closes the literal opened at `open`; -1 if the line
 *  ends first (a regex literal cannot span lines). `[/]` is a class, not a
 *  terminator. */
function regexEnd(src: string, open: number): number {
  let inClass = false;
  for (let i = open + 1; i < src.length; i++) {
    const c = src[i]!;
    if (c === "\n") return -1;
    if (c === "\\") {
      i++;
      continue;
    }
    if (inClass) {
      if (c === "]") inClass = false;
      continue;
    }
    if (c === "[") inClass = true;
    else if (c === "/") return i;
  }
  return -1;
}

/**
 * Strip comments so a `makeViolation(` written INSIDE a docblock is not read as
 * a call. `hud/telltaleWarnings.ts` contains exactly that, once
 * (`telltaleWarnings.ts:43`). Lengths are preserved (comments become spaces) so
 * reported line numbers stay true.
 *
 * IT IS REGEX-LITERAL-AWARE, AND THAT IS NOT A NICETY. `/https:\/\//` ends in
 * the two characters `//`, so the previous version read a regex as a line
 * comment and DELETED THE REST OF THAT LINE — silently. The verifier planted
 * `const u = /https:\/\//.test("x"); const z = makeViolation("X", 1, { titleBg:
 * "ZZ-PLANT-4" });` and the suite stayed 36/36 green, while the same plant on
 * its own line went red. Silently skipping what it cannot read is the one thing
 * this file's own rule forbids.
 *
 * WHAT IT STILL CANNOT DO, said plainly rather than left for the next verifier:
 * a `/` in one of the positions `regexMayStart` leaves out (after `}`, `)` or a
 * JSX `>`) is read as division, so a regex literal CONTAINING `//` written
 * there would still be mis-read. No such literal exists under `platform/src`
 * today. Where the guess does say „regex" and the literal does not close on its
 * own line, nothing is deleted and the file is REPORTED as unreadable — the
 * caller turns that into an `unresolved` call, which fails the suite.
 */
function blankComments(src: string): {
  src: string;
  unreadable: { line: number; why: string }[];
} {
  const unreadable: { line: number; why: string }[] = [];
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const c = src[i]!;
    if (quote !== null) {
      out += c;
      if (c === "\\" && i + 1 < src.length) {
        out += src[i + 1];
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      quote = c;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") {
        out += " ";
        i++;
      }
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const close = src.indexOf("*/", i);
      const end = close < 0 ? src.length : close + 2;
      for (; i < end; i++) out += src[i] === "\n" ? "\n" : " ";
      continue;
    }
    if (c === "/" && regexMayStart(out)) {
      const end = regexEnd(src, i);
      if (end < 0) {
        unreadable.push({
          line: src.slice(0, i).split("\n").length,
          why: "a regex literal that never closes on its line",
        });
        out += c;
        i++;
        continue;
      }
      out += src.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    out += c;
    i++;
  }
  return { src: out, unreadable };
}

/** One `key: value` pair of an object literal, at the TOP level only. */
const ENTRY_RE = /^(?:"([A-Za-z0-9_$]+)"|'([A-Za-z0-9_$]+)'|([A-Za-z0-9_$]+))\s*(?::([\s\S]*))?$/;

/**
 * Parse an object literal into its TOP-LEVEL keys, or `null` when anything in
 * it is not readable (a spread, a computed key, an unbalanced brace, trailing
 * text such as `as const`). Reading the keys rather than regexing the text is
 * what closes three of the verifier's five bypasses at once: `detail:` inside a
 * string is not a key, `{ meta: { detail } }` is not a top-level key, and the
 * VALUE of `detail` becomes visible, so `detail: undefined` can be refused.
 */
function parseObjectLiteral(text: string): { keys: { name: string; value: string }[] } | null {
  const s = text.trim();
  if (!s.startsWith("{")) return null;
  const close = matchBracket(s, 0);
  if (close < 0 || s.slice(close + 1).trim() !== "") return null;
  const keys: { name: string; value: string }[] = [];
  for (const raw of splitTop(s.slice(1, close), ",")) {
    const entry = raw.trim();
    if (entry === "") continue;
    const m = ENTRY_RE.exec(entry);
    if (m === null) return null;
    const name = (m[1] ?? m[2] ?? m[3])!;
    // Shorthand (`{ detail }`) is its own value: a bound name, not a literal.
    keys.push({ name, value: m[4] === undefined ? name : m[4].trim() });
  }
  return { keys };
}

/** `cond ? A : B` → `[A, B]`, or null when there is no top-level ternary.
 *  `??`, `?.` and `?:` are not ternaries and must not be mistaken for one. */
function splitTernary(text: string): [string, string] | null {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quote !== null) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      quote = c;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "?" && depth === 0) {
      const next = text[i + 1];
      if (next === "?" || next === "." || next === ":") {
        i++;
        continue;
      }
      let nested = 0;
      for (let j = i + 1; j < text.length; j++) {
        const d = text[j]!;
        if (quote !== null) {
          if (d === "\\") {
            j++;
            continue;
          }
          if (d === quote) quote = null;
          continue;
        }
        if (d === "'" || d === '"' || d === "`") {
          quote = d;
          continue;
        }
        if (d === "(" || d === "[" || d === "{") depth++;
        else if (d === ")" || d === "]" || d === "}") depth--;
        else if (depth === 0 && d === "?" && text[j + 1] !== "?" && text[j + 1] !== ".") nested++;
        else if (depth === 0 && d === ":") {
          if (nested === 0) return [text.slice(i + 1, j), text.slice(j + 1)];
          nested--;
        }
      }
      return null;
    }
  }
  return null;
}

/** Worst shape wins when one call can ship more than one argument. */
const SHAPE_RANK: Record<CallShape, number> = {
  "copy-without-detail": 4,
  unresolved: 3,
  "detail-and-copy": 2,
  "detail-only": 1,
  pooled: 0,
};

const NO_VALUE_RE = /^(?:undefined|void\s+0)$/;

/** Classify one third-argument expression. */
export function classifyOverrideArg(text: string): CallShape {
  const arg = text.trim();
  if (arg === "" || NO_VALUE_RE.test(arg)) return "pooled";
  const obj = parseObjectLiteral(arg);
  if (obj !== null) {
    const hasCopy = obj.keys.some((k) => k.name === "titleBg" || k.name === "explanationBg");
    const detail = obj.keys.find((k) => k.name === "detail");
    // `{ detail: undefined, titleBg: "…" }` is THE WORST BYPASS: at runtime
    // `makeViolation` stamps no `detail` and the copy ships anyway — the exact
    // defect, in the shape `wire.ts` itself builds. It is not a detail.
    const hasDetail = detail !== undefined && !NO_VALUE_RE.test(detail.value);
    return hasCopy
      ? hasDetail
        ? "detail-and-copy"
        : "copy-without-detail"
      : hasDetail
        ? "detail-only"
        : "pooled";
  }
  const branches = splitTernary(arg);
  if (branches !== null) {
    const a = classifyOverrideArg(branches[0]);
    const b = classifyOverrideArg(branches[1]);
    return SHAPE_RANK[a] >= SHAPE_RANK[b] ? a : b;
  }
  return "unresolved";
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Every local name bound to `makeViolation` in this file — `import { x as mv }`,
 * `const mv = makeViolation`, `const { makeViolation: mv } = …`. An aliased
 * import was invisible to the previous `/\bmakeViolation\s*\(/`. A member call
 * (`cat.makeViolation(...)`) needs no alias: `\b` matches after the dot.
 *
 * TO A FIXED POINT, because one pass resolves exactly one hop and an alias can
 * be aliased: the verifier planted `const a = makeViolation; const b = a;
 * b("X", 1, { titleBg: "ZZ-PLANT-2" });` and the scan saw nothing at all. Each
 * round re-runs the two ASSIGNMENT forms over every name found so far and stops
 * when the set stops growing — bounded by the identifiers in the file, and two
 * rounds on every file under `platform/src` today.
 */
function localNames(src: string): string[] {
  const names = new Set<string>(["makeViolation"]);
  for (const m of src.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from/g)) {
    for (const spec of m[1]!.split(",")) {
      const a = /^\s*makeViolation\s+as\s+([A-Za-z0-9_$]+)\s*$/.exec(spec);
      if (a !== null) names.add(a[1]!);
    }
  }
  for (let grew = true; grew; ) {
    grew = false;
    const known = [...names].map(escapeRe).join("|");
    const assigned = new RegExp(
      `\\b(?:const|let|var)\\s+([A-Za-z0-9_$]+)\\s*=\\s*(?:${known})\\s*[;,\\n]`,
      "g",
    );
    for (const m of src.matchAll(assigned)) {
      if (names.has(m[1]!)) continue;
      names.add(m[1]!);
      grew = true;
    }
    const destructured = new RegExp(`\\b(?:${known})\\s*:\\s*([A-Za-z0-9_$]+)`);
    for (const m of src.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
      const a = destructured.exec(m[1]!);
      if (a === null || names.has(a[1]!)) continue;
      names.add(a[1]!);
      grew = true;
    }
  }
  return [...names];
}

const collapse = (s: string): string => s.replace(/\s+/g, " ").trim();

/** Classify every `makeViolation(...)` CALL in one source text. */
export function classifyMakeViolationCalls(source: string, file: string): Call[] {
  const blanked = blankComments(source);
  const src = blanked.src;
  const out: Call[] = [];
  // A FILE IT CANNOT TOKENISE IS REPORTED, NOT SKIPPED. Each unreadable
  // construct becomes an `unresolved` row that no ALLOWED_CALLS entry claims,
  // so the suite reds and names the file and the line — the same rule this
  // scan applies to a call shape it cannot read.
  for (const u of blanked.unreadable) {
    out.push({
      file,
      line: u.line,
      shape: "unresolved",
      arg: `<cannot tokenise: ${u.why}>`,
      call: `<cannot tokenise: ${u.why}>`,
    });
  }
  const names = localNames(src);
  const alternation = names.map(escapeRe).join("|");
  const re = new RegExp(`\\b(${alternation})\\s*\\(`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    // The declaration itself is not a call.
    if (/\bfunction\s*$/.test(src.slice(Math.max(0, m.index - 12), m.index))) continue;
    const open = m.index + m[0].length - 1;
    const line = src.slice(0, m.index).split("\n").length;
    const args = splitArgs(src, open);
    if (args === null) {
      out.push({
        file,
        line,
        shape: "unresolved",
        arg: "<parens never close>",
        call: `${m[1]}(<parens never close>`,
      });
      continue;
    }
    const call = collapse(`${m[1]}(${args.join(",")})`).slice(0, 240);
    // A spread ANYWHERE in the argument list hides which argument is third.
    if (args.some((a) => a.trim().startsWith("..."))) {
      out.push({ file, line, shape: "unresolved", arg: "<spread argument list>", call });
      continue;
    }
    const third = args[2] ?? "";
    out.push({
      file,
      line,
      shape: classifyOverrideArg(third),
      arg: collapse(third).slice(0, 120),
      call,
    });
  }
  // `.call`/`.apply`/`.bind` move the arguments out of the call site entirely.
  const indirect = new RegExp(`\\b(${alternation})\\s*\\.\\s*(call|apply|bind)\\s*\\(`, "g");
  while ((m = indirect.exec(src)) !== null) {
    out.push({
      file,
      line: src.slice(0, m.index).split("\n").length,
      shape: "unresolved",
      arg: `<${m[1]}.${m[2]}(…)>`,
      call: `${m[1]}.${m[2]}(…)`,
    });
  }
  return out;
}

/** Every non-test source file under `platform/src`. */
function sourceFiles(dir = SRC_ROOT, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "__tests__") sourceFiles(p, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const relPath = (file: string): string => relative(SRC_ROOT, file).split(sep).join("/");

let scanned: Call[] | null = null;
function scanSrc(): Call[] {
  if (scanned !== null) return scanned;
  const out: Call[] = [];
  for (const file of sourceFiles()) {
    out.push(...classifyMakeViolationCalls(readFileSync(file, "utf8"), relPath(file)));
  }
  scanned = out;
  return out;
}

/**
 * THE CALLS THAT MAY RIDE THE CHANNEL, NAMED ONE SITE AT A TIME.
 *
 * Two shapes need naming, and both are named by their WHOLE COLLAPSED CALL and
 * by an exact COUNT — not by a file and an argument, which is how a second
 * `makeViolation(..., overrides)` added to `wire.ts` walked past the previous
 * allowlist with the suite still green.
 *
 * `unresolved` — `rebuildRuleEvents` builds a local `overrides` object and hands
 * it over, so the keys are not visible at the call site. It is safe BY
 * CONSTRUCTION and it is the rebuild side of this very contract:
 * `overrides.titleBg` is assigned only inside `if (stepTitle !== null)`, and
 * `preDriveStepTitle` returns non-null only when `detail` is a `PreDriveStepId`
 * — it cannot carry copy without the `detail` that reproduces it.
 *
 * `detail-and-copy` — the two pre-drive machine sites, and only those. They are
 * legal because `preDriveStepTitle` (lessons/wire.ts) recomputes the identical
 * string from `(code, detail)`; §1's «the pre-drive machine's own title survives
 * the wire unchanged» drives that through the real machine rather than trusting
 * this prose. `machine.ts`'s third pre-drive call (PREDRIVE_SEATBELT_SKIPPED)
 * passes `detail` alone and needs no entry.
 *
 * ADDING AN ENTRY IS A DECISION, NOT A FORMALITY: it says the server rebuilds
 * this exact sentence from `(code, t, detail)`, and the next reader will believe
 * it.
 */
interface AllowedCall {
  file: string;
  shape: "unresolved" | "detail-and-copy";
  /** The whole call, whitespace-collapsed, exactly as the scan reports it. */
  call: string;
  /** How many times this exact call may appear in that file. */
  count: number;
  why: string;
}

const ALLOWED_CALLS: readonly AllowedCall[] = [
  {
    file: "modules/sim/lessons/wire.ts",
    shape: "unresolved",
    call: "makeViolation(code, e.t, overrides)",
    count: 1,
    why: "rebuildRuleEvents: `overrides.titleBg` is set only when preDriveStepTitle resolved a PreDriveStepId detail",
  },
  {
    file: "modules/sim/procedures/machine.ts",
    shape: "detail-and-copy",
    call:
      'makeViolation("PREDRIVE_WRONG_ORDER", t, { titleBg: `Нарушен ред: ${spec.titleBg.toLowerCase()}`, detail: stepId, })',
    count: 1,
    why: "preDriveStepTitle (wire.ts) rebuilds this exact string from (PREDRIVE_WRONG_ORDER, detail)",
  },
  {
    file: "modules/sim/procedures/machine.ts",
    shape: "detail-and-copy",
    call:
      'makeViolation("PREDRIVE_STEP_SKIPPED", t, { titleBg: `Пропусната стъпка: ${spec.titleBg.toLowerCase()}`, detail: id, })',
    count: 1,
    why: "preDriveStepTitle (wire.ts) rebuilds this exact string from (PREDRIVE_STEP_SKIPPED, detail)",
  },
];

const describeCall = (c: Call): string => `${c.file}:${c.line}  [${c.shape}]  ${c.call}`;

describe("no makeViolation call smuggles copy past the wire", () => {
  it("is checking something — the scan finds the calls that exist", () => {
    // A scan that found nothing would pass every case below, which is the
    // reassuring direction and therefore the one to make loud.
    const calls = scanSrc();
    expect(calls.length).toBeGreaterThanOrEqual(70);
    expect(calls.filter((c) => c.shape === "pooled").length).toBeGreaterThanOrEqual(40);
    expect(calls.filter((c) => c.shape === "detail-only").length).toBeGreaterThanOrEqual(15);
    // The three repaired sites, found by the CONSTANT they pass rather than by
    // a line number or an exact formatting of the object literal — the first
    // would rot on the next edit above them and the second on the next
    // `prettier` run, and neither is what this case is about.
    const engine = calls.filter((c) => c.file === "modules/sim/rules/engine.ts");
    for (const key of [
      "JUNCTION_SCAN_CONTROL_GIVE_WAY",
      "JUNCTION_SCAN_CONTROL_STOP",
      "HEADLIGHTS_CONDITION_SNOW",
    ]) {
      const site = engine.filter((c) => c.arg.includes(key));
      expect(site, `the reducer must bill ${key} exactly once`).toHaveLength(1);
      expect(site[0]!.shape).toBe("detail-only");
    }
  });

  /**
   * THE SCOPE, ASSERTED STRUCTURALLY. `rules/index.ts` re-exports
   * `makeViolation`, so «scan modules/sim» is narrower than the product's call
   * surface — §8.1 T15's own wording was. If the re-export ever goes, this case
   * is the one that says the narrower root became defensible again.
   */
  it("the scan root is platform/src, because makeViolation leaves the module", () => {
    expect(readFileSync(join(SIM_ROOT, "rules", "index.ts"), "utf8")).toMatch(
      /^\s*makeViolation,\s*$/m,
    );
    const files = sourceFiles().map(relPath);
    expect(files.some((f) => f.startsWith("app/")), "app/ must be scanned").toBe(true);
    expect(files.some((f) => f.startsWith("components/")), "components/ must be scanned").toBe(true);
    expect(files.some((f) => f.startsWith("modules/sim/rules/"))).toBe(true);
  });

  it("no call passes titleBg or explanationBg without a detail", () => {
    const bad = scanSrc()
      .filter((c) => c.shape === "copy-without-detail")
      .map(describeCall);
    expect(bad).toEqual([]);
  });

  it("every call that cannot be read, or that rides the channel legally, is named — and only those", () => {
    const needsNaming = scanSrc().filter(
      (c) => c.shape === "unresolved" || c.shape === "detail-and-copy",
    );
    const unexplained = needsNaming
      .filter(
        (c) => !ALLOWED_CALLS.some((a) => a.file === c.file && a.shape === c.shape && a.call === c.call),
      )
      .map(describeCall);
    expect(
      unexplained,
      "an unreadable call, or copy riding the override channel, that no ALLOWED_CALLS entry claims",
    ).toEqual([]);
    // …and each entry must match EXACTLY as many calls as it claims: a stale
    // entry protects a call that no longer exists, and an undercounted one
    // protects a second copy of it (the hole the verifier walked through by
    // adding a second `makeViolation(code, e.t, overrides)` to wire.ts).
    for (const a of ALLOWED_CALLS) {
      const hits = needsNaming.filter(
        (c) => c.file === a.file && c.shape === a.shape && c.call === a.call,
      );
      expect(
        hits.length,
        `ALLOWED_CALLS claims ${a.count} × ${a.shape} in ${a.file}: ${a.call} — found ${hits.length}. ` +
          `Re-verify the site (${a.why}) and re-pin, or delete the entry.`,
      ).toBe(a.count);
    }
  });

  it("the two copy tables that used to ride the override channel are gone from the reducer", () => {
    const engine = readFileSync(join(SIM_ROOT, "rules", "engine.ts"), "utf8");
    // Named in prose (the history is kept on purpose) but never declared.
    expect(engine).not.toMatch(/^const (JUNCTION_SCAN|SNOW_LIGHTS)_COPY\b/m);
  });
});

/**
 * ── MUTATION CASES ────────────────────────────────────────────────────────────
 *
 * Three green-and-blind source scanners have shipped in this repo, each
 * repaired by teaching it the one shape that had just escaped. So the scanner
 * is driven against SYNTHETIC sources containing each escape by construction,
 * and the assertions are on the CLASSIFICATION, not on the real tree — a scan
 * that silently returned `[]` for these would fail here rather than reassure.
 *
 * Every shape the verifier reproduced on the first version of this scan has a
 * case here, marked BYPASS.
 */
describe("the scanner is not blind (mutation cases)", () => {
  const shapes = (src: string): CallShape[] =>
    classifyMakeViolationCalls(src, "synthetic.ts").map((c) => c.shape);

  it("catches the defect this lane removed — copy with no detail", () => {
    expect(
      shapes(`const e = makeViolation("X", t, { titleBg: "А", explanationBg: "Б" });`),
    ).toEqual(["copy-without-detail"]);
    // …including the multi-line, nested-template form the real calls had.
    expect(
      shapes(
        "const e = makeViolation(\"X\", t, {\n  titleBg: `Ред: ${f(a, b).toLowerCase()}`,\n  explanationBg: 'x, y',\n});",
      ),
    ).toEqual(["copy-without-detail"]);
  });

  it("BYPASS 1 — a ternary cannot hide a branch that ships bare copy", () => {
    expect(shapes(`makeViolation("X", t, cond ? { titleBg: "А" } : { detail: "d" });`)).toEqual([
      "copy-without-detail",
    ]);
    expect(shapes(`makeViolation("X", t, cond ? { detail: "d" } : { explanationBg: "Б" });`)).toEqual(
      ["copy-without-detail"],
    );
    // A nested ternary is still read branch by branch…
    expect(
      shapes(`makeViolation("X", t, a ? { detail: "d" } : b ? { titleBg: "А" } : {});`),
    ).toEqual(["copy-without-detail"]);
    // …and a ternary of legal branches stays legal, which is the live shape at
    // `lessons/lessonMistake.ts` (`hit.detail !== undefined ? { detail } : {}`).
    expect(shapes(`makeViolation("X", t, ok ? { detail: d } : {});`)).toEqual(["detail-only"]);
    // `??`, `?.` and an optional parameter are not ternaries.
    expect(shapes(`makeViolation("X", t, o?.over ?? { detail: "d" });`)).toEqual(["unresolved"]);
  });

  it("BYPASS 2 — a `detail:` written inside authored copy is not a detail", () => {
    expect(shapes(`makeViolation("X", t, { titleBg: "виж detail: тук" });`)).toEqual([
      "copy-without-detail",
    ]);
    expect(shapes("makeViolation(\"X\", t, { explanationBg: `detail: ${x}` });")).toEqual([
      "copy-without-detail",
    ]);
    // …and the mirror, which is what keeps the allowlist honest rather than
    // merely loud: a `titleBg:` written inside authored copy — or nested one
    // level down — is not a copy KEY, so a legal detail-only call is not
    // dragged into ALLOWED_CALLS by its own prose.
    expect(shapes(`makeViolation("X", t, { detail: "виж titleBg: горе" });`)).toEqual([
      "detail-only",
    ]);
    expect(shapes(`makeViolation("X", t, { detail: "d", meta: { titleBg: "А" } });`)).toEqual([
      "detail-only",
    ]);
  });

  it("BYPASS 3 — a detail nested one level down is not a top-level detail", () => {
    expect(shapes(`makeViolation("X", t, { titleBg: "А", meta: { detail: "d" } });`)).toEqual([
      "copy-without-detail",
    ]);
  });

  it("BYPASS 4 — `detail: undefined` is the defect wearing the fix's clothes", () => {
    // At runtime `makeViolation` stamps no detail and the copy ships: the exact
    // shape `wire.ts` builds, and the worst of the five the verifier found.
    expect(shapes(`makeViolation("X", t, { detail: undefined, titleBg: "А" });`)).toEqual([
      "copy-without-detail",
    ]);
    expect(shapes(`makeViolation("X", t, { detail: void 0, explanationBg: "Б" });`)).toEqual([
      "copy-without-detail",
    ]);
    // A detail whose value cannot be read statically is NOT waved through: it
    // classifies as detail-and-copy, which ALLOWED_CALLS must then claim by name.
    expect(shapes(`makeViolation("X", t, { detail: maybe, titleBg: "А" });`)).toEqual([
      "detail-and-copy",
    ]);
  });

  it("BYPASS 5 — an aliased, destructured or namespaced import is still scanned", () => {
    expect(
      shapes(`import { makeViolation as mv } from "../rules/catalog";\nmv("X", t, { titleBg: "А" });`),
    ).toEqual(["copy-without-detail"]);
    expect(
      shapes(`const { makeViolation: build } = cat;\nbuild("X", t, { titleBg: "А" });`),
    ).toEqual(["copy-without-detail"]);
    expect(shapes(`const mv = makeViolation;\nmv("X", t, { titleBg: "А" });`)).toEqual([
      "copy-without-detail",
    ]);
    expect(
      shapes(`import * as cat from "../rules/catalog";\ncat.makeViolation("X", t, { titleBg: "А" });`),
    ).toEqual(["copy-without-detail"]);
    // AN ALIAS OF AN ALIAS. One resolution pass saw nothing here: the verifier
    // planted this outside `modules/sim` and the suite stayed green, which is
    // why `localNames` now iterates to a fixed point.
    expect(
      shapes(`const a = makeViolation;\nconst b = a;\nb("X", t, { titleBg: "А" });`),
    ).toEqual(["copy-without-detail"]);
    expect(
      shapes(`import { makeViolation as mv } from "x";\nconst { mv: build } = o;\nbuild("X", t, { titleBg: "А" });`),
    ).toEqual(["copy-without-detail"]);
  });

  it("BYPASS 7 — a regex literal ending in `\\//` does not eat the line after it", () => {
    // The verifier's P6, and the nastiest of the lot because it deleted code
    // SILENTLY: `/https:\/\//` ends in the two characters `//`, so the comment
    // stripper blanked the rest of the line and the call beside it vanished.
    expect(
      shapes(`const u = /https:\\/\\//.test("x"); makeViolation("X", t, { titleBg: "А" });`),
    ).toEqual(["copy-without-detail"]);
    // The same literal as an argument, and one in a character class.
    expect(
      shapes(`const p = s.replace(/\\/\\//g, "/"); makeViolation("X", t, { explanationBg: "Б" });`),
    ).toEqual(["copy-without-detail"]);
    expect(shapes(`const q = /[/]\\//.exec(s); makeViolation("X", t, { titleBg: "А" });`)).toEqual([
      "copy-without-detail",
    ]);
    // …and DIVISION is still division, or the repair would blank real code as a
    // literal: a `/` after an identifier, a number or a `)` divides, and the
    // line comment after it is still a comment.
    expect(shapes(`const r = total / 2; // makeViolation("X", t, COPY)`)).toEqual([]);
    expect(
      shapes(`const r = (a + b) / 2 / 3; makeViolation("X", t, { detail: "d" });`),
    ).toEqual(["detail-only"]);
    // A JSX self-closing tag is not a regex either — `}` and `>` are the two
    // positions this scan deliberately reads as division for that reason.
    expect(
      shapes(`const n = <Foo bar={x} />;\nmakeViolation("X", t, { titleBg: "А" });`),
    ).toEqual(["copy-without-detail"]);
    // BOTH `!`s, which TypeScript makes ambiguous: a POSTFIX non-null assertion
    // divides (this shape is live at `world/builders/roundabout.ts:809` and the
    // unreadable report above is what found it), a PREFIX negation does not.
    expect(shapes(`out[k] = sum[k]! / hits[k]!; makeViolation("X", t, { titleBg: "А" });`)).toEqual([
      "copy-without-detail",
    ]);
    expect(
      shapes(`if (!/https:\\/\\//.test(u)) { makeViolation("X", t, { explanationBg: "Б" }); }`),
    ).toEqual(["copy-without-detail"]);
  });

  it("REPORTS a file it cannot tokenise rather than skipping it", () => {
    // A `/` where an expression may begin, with no closing `/` before the line
    // ends: the scan does not know what it is reading, so it says so — and the
    // call beside it is still classified, because a report is not a bail-out.
    const calls = classifyMakeViolationCalls(
      `const r = /never-closed\nmakeViolation("X", t, { detail: "d" });`,
      "synthetic.ts",
    );
    expect(calls.map((c) => c.shape)).toEqual(["unresolved", "detail-only"]);
    expect(calls[0]!.arg).toContain("cannot tokenise");
    expect(calls[0]!.line).toBe(1);
  });

  it("BYPASS 6 — an argument list it does not control is unresolved, never pooled", () => {
    expect(shapes(`makeViolation(...args);`)).toEqual(["unresolved"]);
    expect(shapes(`makeViolation("X", ...rest);`)).toEqual(["unresolved"]);
    expect(shapes(`makeViolation.apply(null, args);`)).toEqual(["unresolved"]);
    expect(shapes(`makeViolation.call(null, "X", t, over);`)).toEqual(["unresolved"]);
  });

  it("REFUSES a named copy table instead of skipping it — the exact pre-repair shape", () => {
    expect(shapes(`makeViolation("JUNCTION_SCAN_INCOMPLETE", t, JUNCTION_SCAN_COPY.giveWay);`)).toEqual([
      "unresolved",
    ]);
    expect(shapes(`makeViolation("HEADLIGHTS_OFF_IN_RAIN", t, SNOW_LIGHTS_COPY);`)).toEqual([
      "unresolved",
    ]);
    // A spread hides keys just as well as an identifier does, and a computed
    // key hides the key's very name.
    expect(shapes(`makeViolation("X", t, { ...COPY, detail: "d" });`)).toEqual(["unresolved"]);
    expect(shapes(`makeViolation("X", t, { [k]: "А", titleBg: "Б" });`)).toEqual(["unresolved"]);
    // Trailing text means the literal is not the whole argument.
    expect(shapes(`makeViolation("X", t, { detail: "d" } as Over);`)).toEqual(["unresolved"]);
  });

  it("refuses a call it cannot finish reading", () => {
    expect(shapes(`makeViolation("X", t, { titleBg: "А"`)).toEqual(["unresolved"]);
    expect(shapes(`makeViolation("X", t, /* never closed`)).toEqual(["unresolved"]);
  });

  it("accepts the legal shapes, and only those", () => {
    expect(shapes(`makeViolation("X", t);`)).toEqual(["pooled"]);
    expect(shapes(`makeViolation("X", t, undefined);`)).toEqual(["pooled"]);
    expect(shapes(`makeViolation("X", t, {});`)).toEqual(["pooled"]);
    expect(shapes(`makeViolation("X", t, { detail: "give-way" });`)).toEqual(["detail-only"]);
    expect(shapes(`makeViolation("X", t, { detail });`)).toEqual(["detail-only"]);
    expect(shapes(`makeViolation("X", t, { titleBg: "А", detail: id });`)).toEqual([
      "detail-and-copy",
    ]);
  });

  it("does not read a call written inside a comment, and does not miss the one beside it", () => {
    // `hud/telltaleWarnings.ts` documents the old call once in a docblock
    // (`telltaleWarnings.ts:43` — counted, after the header claimed twice). A
    // scanner that read it would have to allowlist a file it need not touch.
    expect(shapes(`/** → makeViolation("X", t, SNOW_LIGHTS_COPY) */`)).toEqual([]);
    expect(shapes(`// makeViolation("X", t, COPY)\nmakeViolation("X", t, { detail: "d" });`)).toEqual(
      ["detail-only"],
    );
    // …and a comma or a brace inside authored Bulgarian copy must not split the
    // argument list: this is one call with copy and a detail, not two.
    expect(
      shapes(`makeViolation("X", t, { titleBg: "Спри, огледай {ляво}", detail: "d" });`),
    ).toEqual(["detail-and-copy"]);
  });

  it("does not mistake the declaration for a call", () => {
    expect(
      shapes(
        `export function makeViolation(code: C, t: number, overrides?: Partial<Pick<V, "titleBg">>): V {}`,
      ),
    ).toEqual([]);
  });
});
