/**
 * ADR-009 T3 — CLIENT AND SERVER MUST AGREE, OR THE STORED VERDICT DISAGREES
 * WITH THE SCREEN THAT PRODUCED IT (founder Ruling A, 2026-09-17; spec
 * `docs/simulation/92_ADR009_LESSON_MISTAKE_SPEC.md` §3.5, §8.1 T3, §12 R5).
 *
 * WHY PARITY IS THE WHOLE POINT OF THE MODULE. `LessonPlayShell.tsx` renders
 * `saveResult.debriefText` whenever the save succeeds and falls back to the
 * client's own text only when it fails. So a second implementation of the
 * ruling on the server would not be a second opinion — it would be THE opinion,
 * and the card the student read on the glass would be the one that was wrong.
 * `escalation.ts`'s header carries the drive where exactly that shipped: a
 * «Тренировъчен резултат: 25 наказателни т.» beside an official 10, because two
 * files each owned a copy of one filter. ADR-009 has ONE fold,
 * `foldLessonMistakes`, and this file is the assertion that both sides call it.
 *
 * WHAT IT DRIVES. Real recordings through the production chain, then the wire
 * built EXACTLY as `LessonPlayShell.tsx:5214-5236` builds it — the same
 * `serializeRuleEvents(state.events, state.penaltyEscalations, …)` and the same
 * `serializeCoachedMistakes(r.coachedMistakes)` — and then `gradeFinishWire`,
 * which is what the server action runs. Nothing is hand-shaped.
 *
 * THE TRUST BOUNDARY IS PINNED, NOT ASSUMED (§12 R5, critic gap 10). The server
 * never re-runs the rules: it re-titles what the client reports. A client that
 * omits a target mistake from either list reproduces the pre-ADR-009 pass, and
 * §3's M4a/M4b say so in assertions rather than in a paragraph, because a
 * documented trust boundary nobody exercised is how one stops being true.
 *
 * SCOPE. The census behind this lane drove all 2,434 committed tape × rung
 * combinations and measured ZERO client/server disagreements on `passed` or on
 * the hits. This file is the regression net for that measurement, on the rows
 * where the act copy makes the two sides able to differ at all.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { recordScJunctionScanDrive } from "../../traces/scJunctionScan";
import { recordScPkBusstopBanDrive } from "../../traces/scPkBusstopBan";
import { recordScVuPassDrive } from "../../traces/scVuPass";
import { applyTick, buildLessonResult, createLessonSession } from "../engine";
import { compileScenario } from "../scenario/compile";
import { scenarioById } from "../scenario/templates";
import type { ScenarioLevel } from "../scenario/types";
import type { SimTick } from "../../rules";
import type { LessonResult, LessonSessionState } from "../types";
import {
  gradeFinishWire,
  serializeCoachedMistakes,
  serializeRuleEvents,
  type FinishLessonWire,
} from "../wire";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const district = (id: string): unknown =>
  JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));

type Play = (onTick: (t: SimTick) => void) => void;

interface Tape {
  readonly id: string;
  readonly lessonId: string;
  readonly districtId: string;
  readonly play: Play;
  /** The act the student's card named, where the catalogue declares one. */
  readonly actTitleBg?: string;
}

const TAPES: Tape[] = [
  {
    // The Б1/Б2 act — the reason doc 92 ADDENDUM 1 item 1 exists. Lane R's
    // verifier measured it over the 1,006 L1/L3 drives: the code is RAISED on 8
    // of them, coached on all 8 and charged on 0 (across every authored rung:
    // 16 raised, 4 charged, every charge at L4). So before lane C the server
    // pooled its title on every practice drive that raised it, and the fold read
    // the pooled string. («1,006 of 1,006» counted the run, not the code.)
    id: "sc-junction-scan/mistake-no-scan",
    lessonId: "sc-junction-scan",
    districtId: "tj-scan-v1",
    actTitleBg: "Непълно оглеждане при знак Б2",
    play: (onTick) =>
      void recordScJunctionScanDrive(district("tj-scan-v1"), "mistake-no-scan", { onTick }),
  },
  {
    // A ban-zone BASIS act: one code, several catalogued acts, and the wrong one
    // would name a different offence on the student's own stored record.
    id: "sc-pk-busstop-ban/mistake-stop-on-pocket",
    lessonId: "sc-pk-busstop-ban",
    districtId: "pk-busstop-v1",
    play: (onTick) =>
      void recordScPkBusstopBanDrive(district("pk-busstop-v1"), "mistake-stop-on-pocket", {
        onTick,
      }),
  },
  {
    // A target with no act at all — the majority case, and the control that
    // says the act path is not the only one that agrees.
    id: "sc-vu-pass-clearance/mistake-squeeze",
    lessonId: "sc-vu-pass-clearance",
    districtId: "vu-pass-v1",
    play: (onTick) => void recordScVuPassDrive(district("vu-pass-v1"), "mistake-squeeze", { onTick }),
  },
];

const SHADOWS: Tape[] = [
  {
    id: "sc-junction-scan/shadow-correct",
    lessonId: "sc-junction-scan",
    districtId: "tj-scan-v1",
    play: (onTick) =>
      void recordScJunctionScanDrive(district("tj-scan-v1"), "shadow-correct", { onTick }),
  },
  {
    id: "sc-vu-pass-clearance/shadow-correct",
    lessonId: "sc-vu-pass-clearance",
    districtId: "vu-pass-v1",
    play: (onTick) =>
      void recordScVuPassDrive(district("vu-pass-v1"), "shadow-correct", { onTick }),
  },
];

function client(tape: Tape, level: ScenarioLevel): {
  result: LessonResult;
  state: LessonSessionState;
  lessonId: string;
} {
  const spec = scenarioById(tape.lessonId);
  expect(spec, `${tape.lessonId} must still be in the catalogue`).toBeDefined();
  const lesson = compileScenario(spec!, level);
  let session: LessonSessionState = createLessonSession(lesson);
  tape.play((tick) => {
    session = applyTick(session, tick).state;
  });
  return { result: buildLessonResult(session), state: session, lessonId: lesson.id };
}

/** The payload `LessonPlayShell.tsx` sends, field for field. */
function shellWire(
  c: ReturnType<typeof client>,
  over: Partial<FinishLessonWire> = {},
): Record<string, unknown> {
  const { result: r, state } = c;
  return {
    lessonId: c.lessonId,
    startedAtMs: 1_000,
    finishedAtMs: 1_000 + Math.round((r.durationSec || 1) * 1000),
    aborted: r.aborted,
    ruleEvents: serializeRuleEvents(
      state.events,
      state.penaltyEscalations,
      state.eventPositions ?? [],
    ),
    objectives: r.objectives.map((o) => ({
      id: o.id,
      done: o.done,
      completedAtSec: o.completedAtSec,
      ...(o.detail !== undefined ? { detail: o.detail } : {}),
    })),
    ...(r.coachedMistakes !== undefined && r.coachedMistakes.length > 0
      ? { coachedMistakes: serializeCoachedMistakes(r.coachedMistakes) }
      : {}),
    ...over,
  };
}

function server(payload: Record<string, unknown>): LessonResult {
  const graded = gradeFinishWire(payload);
  expect(graded.status, JSON.stringify(graded)).toBe("ok");
  if (graded.status !== "ok") throw new Error("unreachable");
  return graded.result;
}

// ---------------------------------------------------------------------------
// §1 — THE VERDICT AGREES, ON BOTH RUNGS, ON EVERY FIELD THAT REACHES A SCREEN
// ---------------------------------------------------------------------------

describe("§1 the server folds the same verdict the client did", () => {
  for (const tape of TAPES) {
    for (const level of [1, 3] as ScenarioLevel[]) {
      it(`${tape.id} @L${level}: passed, score and lessonMistakes deep-equal`, () => {
        const c = client(tape, level);
        const s = server(shellWire(c));
        expect(s.passed).toBe(c.result.passed);
        expect(s.passed).toBe(false); // …and both said the lesson was not taken
        expect(s.score).toBe(c.result.score);
        // The hits, whole: code, time, charged flag, act and TITLE. The title is
        // the one that could differ, and the one the reason block prints.
        expect(s.lessonMistakes).toEqual(c.result.lessonMistakes);
        expect((s.lessonMistakes ?? []).length).toBeGreaterThan(0);
      });
    }
  }

  it("the act title survives the round trip — the client's card and the stored row name ONE act", () => {
    const tape = TAPES[0];
    const c = client(tape, 3);
    const s = server(shellWire(c));
    expect(c.result.lessonMistakes![0].titleBg).toBe(tape.actTitleBg);
    expect(s.lessonMistakes![0].titleBg).toBe(tape.actTitleBg);
    // …and it is NOT the pooled row, or the assertion above would pass on a
    // build that had never carried the act at all.
    expect(tape.actTitleBg).not.toBe("Непълно оглеждане на кръстовището");
    // The server took the act from the WIRE, not from a title the client wrote:
    // the payload carries no `titleBg` anywhere.
    const wire = shellWire(c) as { coachedMistakes?: Record<string, unknown>[] };
    for (const row of wire.coachedMistakes ?? []) expect(row).not.toHaveProperty("titleBg");
    expect(wire.coachedMistakes).toContainEqual(
      expect.objectContaining({ code: "JUNCTION_SCAN_INCOMPLETE", detail: "stop" }),
    );
  });

  /**
   * THE HALF THE HIT ROW HIDES, AND THE MUTATION THAT FOUND IT. Reverting
   * `gradeFinishWire`'s re-title to `VIOLATIONS[code].titleBg` left every case
   * above GREEN, because `foldLessonMistakes` resolves the hit's own title from
   * `(code, detail)` on whichever side it runs — so the hit was right while the
   * STORED COACHED ROW beside it pooled. That row is what the debrief's «Учебни
   * моменти» block prints, so the same drive would have named two acts on one
   * screen: the exact defect doc 92 §3.3b exists to stop.
   *
   * Pinned here rather than left to `act-copy-control.test.ts` (which caught it)
   * because this file is the one that claims PARITY, and a parity claim that
   * compares only the field both sides recompute is not a parity claim.
   */
  it("the SERVER's coached row titles the act too — not only the hit", () => {
    const tape = TAPES[0];
    const c = client(tape, 3);
    const s = server(shellWire(c));
    const clientRow = (c.result.coachedMistakes ?? []).find(
      (m) => m.code === "JUNCTION_SCAN_INCOMPLETE",
    );
    const serverRow = (s.coachedMistakes ?? []).find(
      (m) => m.code === "JUNCTION_SCAN_INCOMPLETE",
    );
    expect(clientRow, "the drive must still coach the scan fault").toBeDefined();
    expect(serverRow, "the server must still carry the coached row").toBeDefined();
    expect(serverRow!.titleBg).toBe(clientRow!.titleBg);
    expect(serverRow!.titleBg).toBe(tape.actTitleBg);
    expect(serverRow!.titleBg).not.toBe("Непълно оглеждане на кръстовището");
    // Every coached row, not just this one: a drive whose two channels name two
    // acts is the defect whatever the code.
    expect((s.coachedMistakes ?? []).map((m) => [m.code, m.titleBg])).toEqual(
      (c.result.coachedMistakes ?? []).map((m) => [m.code, m.titleBg]),
    );
  });

  it("a ban-zone BASIS act names the same offence on both sides", () => {
    const c = client(TAPES[1], 3);
    const s = server(shellWire(c));
    expect(s.lessonMistakes).toEqual(c.result.lessonMistakes);
    expect(c.result.lessonMistakes![0].code).toBe("ILLEGAL_STOP_IN_BAN_ZONE");
  });
});

// ---------------------------------------------------------------------------
// §2 — THE HIT-FREE DRIVE IS BYTE-IDENTICAL (the half that must not move)
// ---------------------------------------------------------------------------

describe("§2 a correct drive reaches the server exactly as it always did", () => {
  for (const tape of SHADOWS) {
    it(`${tape.id} @L3: passed on both sides, no field, coached rows pooled`, () => {
      const c = client(tape, 3);
      const s = server(shellWire(c));
      expect(c.result.passed).toBe(true);
      expect(s.passed).toBe(true);
      expect(s.lessonMistakes).toBeUndefined();
      expect(c.result.lessonMistakes).toBeUndefined();
      // The coached channel, where one exists, still re-titles from the
      // catalogue on the server — that is what keeps hit-free debriefs
      // byte-identical (doc 92 §3.5, T7).
      expect((s.coachedMistakes ?? []).map((m) => m.titleBg)).toEqual(
        (c.result.coachedMistakes ?? []).map((m) => m.titleBg),
      );
    });
  }
});

// ---------------------------------------------------------------------------
// §3 — THE TRUST BOUNDARY, EXERCISED (M4a, M4b, and the validator's bounds)
// ---------------------------------------------------------------------------

describe("§3 what a tampered payload can and cannot do", () => {
  it("M4a — omit the coached row and the server reproduces the pre-ADR-009 pass", () => {
    // THE DOCUMENTED LIMIT OF THE RULING, stated as a measurement. The server
    // does not re-run the rules; it grades what the client reports, exactly as
    // it already does for `reconcileObjectiveOutcomes`'s claimed `done` flags.
    // This is not a hole this lane can close — closing it means re-simulating
    // the drive server-side — and it is the reason §12 R5 exists.
    const c = client(TAPES[2], 3);
    const stripped = shellWire(c);
    delete stripped.coachedMistakes;
    const s = server(stripped);
    expect(s.lessonMistakes).toBeUndefined();
    expect(s.passed).toBe(true);
    // …and the client, which cannot be lied to about its own drive, said false.
    expect(c.result.passed).toBe(false);
  });

  it("M4b — omitting a CHARGED repeat lowers the sheet too, as it always could", () => {
    // The other list, and the other direction: a client that hides a charged
    // event buys itself points as well as a pass. Same trust level, same
    // pre-existing exposure — ADR-009 adds no new one.
    const c = client(TAPES[1], 3);
    const s = server(shellWire(c, { ruleEvents: [], coachedMistakes: [] }));
    expect(s.score).toBe(0);
    expect(s.lessonMistakes).toBeUndefined();
  });

  it("an over-long or non-string act is dropped silently and the title pools", () => {
    // `MAX_DETAIL_LEN` is 64 — the bound `parseRuleEvents` applies to a CHARGED
    // event's detail. One field, one rule. Dropping rather than rejecting is
    // deliberate: this is display metadata, and rejecting costs a real session
    // its save over a cosmetic field.
    const c = client(TAPES[0], 3);
    const long = shellWire(c, {
      coachedMistakes: [
        { code: "JUNCTION_SCAN_INCOMPLETE", t: 4, detail: "x".repeat(65) },
      ] as never,
    });
    const s = server(long);
    expect(s.coachedMistakes![0].titleBg).toBe("Непълно оглеждане на кръстовището");
    expect(s.coachedMistakes![0]).not.toHaveProperty("detail");
    // …and the fold still fires: the hit is real, only its title pools.
    expect((s.lessonMistakes ?? []).map((h) => h.code)).toEqual(["JUNCTION_SCAN_INCOMPLETE"]);

    const junk = server(
      shellWire(c, {
        coachedMistakes: [{ code: "JUNCTION_SCAN_INCOMPLETE", t: 4, detail: 7 }] as never,
      }),
    );
    expect(junk.coachedMistakes![0].titleBg).toBe("Непълно оглеждане на кръстовището");
  });

  it("an unrecognised act pools rather than blanking the row", () => {
    // A forged `detail` selects a catalogued row or it selects nothing. It can
    // never author a sentence, cite an article or move a point — which is the
    // entire ADR-002 argument for letting the field cross at all.
    const c = client(TAPES[0], 3);
    const s = server(
      shellWire(c, {
        coachedMistakes: [{ code: "JUNCTION_SCAN_INCOMPLETE", t: 4, detail: "Б7" }] as never,
      }),
    );
    expect(s.coachedMistakes![0].titleBg).toBe("Непълно оглеждане на кръстовището");
    expect(s.lessonMistakes![0].titleBg).toBe("Непълно оглеждане на кръстовището");
  });
});
