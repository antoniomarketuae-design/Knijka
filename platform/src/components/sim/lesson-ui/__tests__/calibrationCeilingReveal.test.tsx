import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CALIBRATION_BEYOND_SCALE_TITLE_BG,
  MAX_PREDICTED_POINTS,
} from "@/modules/learning/calibration";
import { CalibrationGate } from "../CalibrationGate";

/**
 * =============================================================================
 * THE QUESTION THAT COULD NOT HOLD ITS OWN ANSWER — sc-junction-rhr:c6d88f3f.
 * =============================================================================
 *
 * THE FRAME. `.audit-frames/sweep161/sc-junction-rhr/pc-right/07-end.png`: the
 * gate asks «Цяло число от 0 до 30. Опасна грешка = 10 изпитни т., …», and the
 * sibling drive in the same sweep chunk
 * (`sweep161/sc-junction-stop/pc-wrong/drive.log:1200`) ends «VERDICT:
 * НЕИЗДЪРЖАН · SCORE: 394 наказателни точки». Same unit, same scorer — the 30
 * is a cap on the FIELD and nothing on the screen said so.
 *
 * WHAT THAT DID. Past the cap the biggest number the student is allowed to type
 * is still below the truth, so `predicted − actual` stopped being a reading of
 * self-knowledge: every such student scored a large negative error, classified
 * `overconfident`, and was told «Оцени се по-високо, отколкото беше» — the
 * product bounding the answer and then convicting him of the bound. The rule and
 * its reasoning are at `calibration.ts:isBeyondPredictableScale`; the pure
 * behaviour is pinned in `modules/learning/calibration.test.ts`.
 *
 * WHY THIS FILE IS TWO INSTRUMENTS AND NOT ONE. The ASKING screen is renderable
 * — it is the branch the frame photographs — so its half is a real render
 * assertion. The REVEAL branch is behind `submit()`, which needs a DOM this
 * repo has no library for (no @testing-library, no jsdom in the deps), so its
 * half is source-pinned the way `briefingOverflow.test.tsx` pins the shell's
 * flex contract: the alternative is a rule that lives only in a component,
 * which `overlayQueue.ts` records a verifier deleting with 56/56 still green.
 */

const GATE = readFileSync(resolve(__dirname, "../CalibrationGate.tsx"), "utf8");

const questionMarkup = (): string =>
  renderToStaticMarkup(
    <CalibrationGate
      lessonTitleBg="Предимство отдясно · Ниво 1 — Пълна помощ"
      onSubmit={async () => null}
      onResolved={() => undefined}
    />,
  );

describe("the asking screen names its ceiling as a ceiling on the FIELD", () => {
  it("still states the range and the tariff it always did", () => {
    const html = questionMarkup();
    expect(html).toContain(`Цяло число от 0 до ${MAX_PREDICTED_POINTS}`);
    expect(html).toContain("Опасна грешка");
  });

  it("says the exam can go past it, so the cap cannot read as a broken scale", () => {
    const html = questionMarkup();
    // The clause the frame was missing. Asserted on the RENDER rather than on a
    // constant, because the previous defect on this same card was a paragraph
    // whose controls did not mount — a copy string can be right while the
    // screen is wrong (`calibrationPendingCard.test.tsx`).
    expect(html).toContain("Таванът е на полето, не на изпита");
    expect(html).toContain(`повече от ${MAX_PREDICTED_POINTS}`);
  });

  it("leaks nothing about THIS drive — the cap is a property of the input", () => {
    // The whole gate exists so the student cannot read the score first, so the
    // new sentence has to be checkable as score-free. It names only the
    // constant the field is built from.
    const html = questionMarkup();
    expect(html).not.toContain("НЕИЗДЪРЖАН");
    expect(html).not.toContain("Изпитът каза");
  });
});

describe("the reveal withholds the verdict instead of convicting the ceiling", () => {
  it("derives the case from the pure predicate, not from a second local rule", () => {
    // `isBeyondPredictableScale` is the one definition both the gate, the
    // server action and the trend page ask. A hand-written `> 30` here would be
    // a second answer to one question — the shape `isUsableLineOrdinal` was
    // extracted to kill on the briefing wire.
    expect(GATE).toContain("isBeyondPredictableScale(reveal.actualPoints)");
    expect(GATE).not.toMatch(/actualPoints\s*>\s*\d/);
  });

  it("does not paint the overconfidence red on a drive nobody could predict", () => {
    // The tone is the fastest thing a seventeen-year-old reads on this card.
    // Pinned as a BRANCH: an unconditional `VERDICT_TONE[reveal.verdict]` is
    // exactly the pre-fix line, and it is the mutation that must fail here.
    expect(GATE).toContain(
      'const tone = beyondScale ? "var(--muted)" : VERDICT_TONE[reveal.verdict];',
    );
  });

  it("stops calling the number a judgement when it is the form's ceiling", () => {
    expect(GATE).toContain("Разлика до тавана на въпроса");
    expect(GATE).toContain("Разлика в преценката");
    // Both, and behind the same flag — dropping either one is a screen that
    // either convicts again or loses the honest label.
    expect(GATE).toMatch(/beyondScale\s*\?\s*"Разлика до тавана на въпроса: "/);
  });

  it("the withheld headline is the module's, never composed on this surface", () => {
    // ADR-002 / THEO-4: the gate paints `reveal.titleBg`, which the server
    // fills from `calibrationRevealCopy`. If this component ever grew its own
    // copy of the sentence, the two screens could disagree about one record.
    expect(GATE).not.toContain(CALIBRATION_BEYOND_SCALE_TITLE_BG);
    expect(GATE).toContain("{reveal.titleBg}");
  });
});
