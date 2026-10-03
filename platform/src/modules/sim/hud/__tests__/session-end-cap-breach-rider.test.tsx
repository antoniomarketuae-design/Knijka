/**
 * THE «ПОХВАЛИ» CARD OVER A CAP BREACH THAT WAS TAUGHT AND NEVER CHARGED —
 * founder ruling 2026-09-25 (register item 17: «a debrief must NEVER praise a
 * drive that broke the cap»), round 2, verifier F3.
 *
 * Round 1 closed only the debrief's no-commendation sentence. A CLEAN_DRIVING
 * earned lawfully on the approach, followed by a task-cap breach whose charge
 * the first-fault grace withheld, still printed «Чисто и спокойно каране»
 * unscoped — in the prose AND, since this screen asks the same two functions,
 * on the card. Round 2 hands the taught чл. 20, ал. 2 rows to both
 * (`commendationRiderFlags`' fourth argument). This file renders THIS screen,
 * because the claim is about what the card DOES, and a card that stopped
 * passing the argument would go on certifying the drive in the badge a
 * finger's width above the prose that qualifies it
 * (`session-end-commendation-rider.test.tsx` holds the same line for ADR-009's
 * hits).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VIOLATIONS, makeCommendation } from "../../rules";
import { buildDebrief } from "../../lessons/debrief";
import { applyTick, buildLessonResult, createLessonSession, finishSession } from "../../lessons/engine";
import { compileScenario } from "../../lessons/scenario/compile";
import { scenarioById } from "../../lessons/scenario/templates";
import type { CoachedMistake, LessonResult } from "../../lessons/types";
import { makeTick } from "../../lessons/__tests__/fixtures";
import { SessionEndScreen } from "../SessionEndScreen";

const SPEC = scenarioById("sc-ac-truck-spray");
if (SPEC === undefined) throw new Error("sc-ac-truck-spray is gone");
const LESSON = compileScenario(SPEC, 1);

const TASK_BREACH: CoachedMistake = {
  code: "TASK_SPEED_CAP_EXCEEDED",
  titleBg: VIOLATIONS.TASK_SPEED_CAP_EXCEEDED.titleBg,
  t: 24.8,
};

function result(coached: CoachedMistake[], blownCap = false): LessonResult {
  let s = createLessonSession(LESSON);
  s = applyTick(s, makeTick({ t: 1 })).state;
  s = {
    ...s,
    events: [...s.events, makeCommendation("CLEAN_DRIVING", 15.2)],
    coachedMistakes: [...(s.coachedMistakes ?? []), ...coached],
    // Round 3 (R4): the session's record of a latched, graded cap.
    ...(blownCap ? { taskCapBreaches: [{ objectiveId: "sc-acts-gap", t: 22 }] } : {}),
  };
  return buildLessonResult(finishSession(s, 34.2));
}

function cleanRow(r: LessonResult): { mark: string; riderBg: string | null } {
  const debriefText = buildDebrief(LESSON, r, { coachedMistakes: r.coachedMistakes }).text;
  const markup = renderToStaticMarkup(
    <SessionEndScreen
      lessonTitleBg="Водна пелена зад камиона"
      result={r}
      debriefText={debriefText}
      concepts={[]}
      xpEarned={null}
      onRetry={() => undefined}
      onExit={() => undefined}
      nextLessonTitleBg={null}
      onNextLesson={null}
    />,
  );
  const start = markup.indexOf('<section aria-label="Похвали"');
  if (start === -1) throw new Error("no «Похвали» card in the markup");
  const card = markup.slice(start, markup.indexOf("</section>", start));
  const li = card.split("<li").slice(1).find((x) => x.includes("Чисто и спокойно каране"));
  if (li === undefined) throw new Error("no CLEAN_DRIVING row on the card");
  const mark = /<span aria-hidden="true" class="[^"]*">([^<]*)<\/span>/.exec(li)?.[1] ?? "";
  const riderBg =
    /<p class="pl-7 text-xs font-semibold leading-relaxed text-warning">([^<]*)<\/p>/.exec(li)?.[1] ?? null;
  return { mark, riderBg };
}

describe("the «Похвали» card never certifies a drive that broke the cap", () => {
  it("a taught, uncharged task-cap breach: the CLEAN_DRIVING row carries the rider that names it", () => {
    const row = cleanRow(result([TASK_BREACH]));
    expect(row.riderBg).not.toBeNull();
    expect(row.riderBg).toContain("мина над тавана на задачата");
  });

  it("…and the same when the ledger named the cap's act by the conditions code (the breach record carries it)", () => {
    const row = cleanRow(
      result(
        [{ code: "SPEED_TOO_FAST_FOR_CONDITIONS", titleBg: VIOLATIONS.SPEED_TOO_FAST_FOR_CONDITIONS.titleBg, t: 25 }],
        true,
      ),
    );
    expect(row.riderBg).toContain("мина над тавана на задачата");
  });

  it("R4 — a breach AT the mark too short to bill (no row of any code, only the breach record): the row is scoped, with no pointer to a section that does not print", () => {
    const row = cleanRow(result([], true));
    expect(row.riderBg).toContain("мина над тавана на задачата");
    expect(row.riderBg).not.toContain("Учебни моменти");
  });

  // ROUND 3 (C2) left this row unqualified pending the founder; ROUND 4 —
  // ANSWERED 2026-09-25, «Yes, same as speeding»: a taught weather or bend
  // overspeed rules out unscoped CLEAN_DRIVING praise, on the card as in the
  // «Разбор» (one derivation, `commendationRiderFlags`).
  it("ROUND 4 — a taught conditions breach on a drive that never blew a cap: the row is scoped and names the weather", () => {
    const row = cleanRow(
      result([{ code: "SPEED_TOO_FAST_FOR_CONDITIONS", titleBg: VIOLATIONS.SPEED_TOO_FAST_FOR_CONDITIONS.titleBg, t: 25 }]),
    );
    expect(row.riderBg).toContain("но само на отделни отсечки");
    expect(row.riderBg).toContain("по-бързо, отколкото позволяват условията");
    expect(row.riderBg).toContain("Учебни моменти");
  });
  it("ROUND 4 — …and a taught bend breach, naming the bend", () => {
    const row = cleanRow(
      result([{ code: "SPEED_TOO_FAST_FOR_CURVE", titleBg: VIOLATIONS.SPEED_TOO_FAST_FOR_CURVE.titleBg, t: 25 }]),
    );
    expect(row.riderBg).toContain("по-бързо от табелата");
  });

  it("CONTROL — with no speed breach taught, the row stands unqualified", () => {
    expect(cleanRow(result([])).riderBg).toBeNull();
  });
});
