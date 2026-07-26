/**
 * What the student sees of the pack allowance.
 *
 * Two properties, and the first is a product requirement rather than a detail:
 * a running counter must NOT be on screen for the 95% of students who will
 * never approach 300. A visible per-question balance is a taxi meter, and doc
 * 64 THEO-4 exists to stop a student deciding not to ask.
 */

import { describe, expect, it } from "vitest";
import { TUTOR_PACK_QUESTION_ALLOWANCE } from "@/modules/payments";
import {
  TUTOR_ALLOWANCE_NOTICE_FRACTION,
  tutorAllowanceNoticeBg,
  tutorAllowanceSpentReplyBg,
} from "./allowance";

const LIMIT = TUTOR_PACK_QUESTION_ALLOWANCE;
/** The last 20% — 60 questions of 300. */
const THRESHOLD = Math.ceil(LIMIT * TUTOR_ALLOWANCE_NOTICE_FRACTION);

function notice(remaining: number, limit = LIMIT): string | null {
  return tutorAllowanceNoticeBg({ applies: true, remaining, limit });
}

describe("tutorAllowanceNoticeBg", () => {
  it("says nothing at all for the whole first 80% of the pack", () => {
    expect(notice(LIMIT)).toBeNull();
    expect(notice(THRESHOLD + 1)).toBeNull();
  });

  it("appears exactly at the last fifth, and stays", () => {
    expect(notice(THRESHOLD)).toContain(`${THRESHOLD}`);
    expect(notice(47)).toContain("Остават ти 47 от 300 въпроса");
    expect(notice(1)).not.toBeNull();
  });

  it("names questions, never money or credits", () => {
    // Doc 81 §5.4: the unit is „въпрос". A price on screen is the thing this
    // design exists to avoid.
    const text = notice(12) ?? "";
    expect(text).toContain("въпроса");
    expect(text).not.toMatch(/€|лв|евро|кредит/i);
  });

  it("says what does NOT come out of the allowance", () => {
    // „остават ти 12" with no context reads as „the product is running out".
    // Practice and exams are unmetered and the counter has to say so.
    expect(notice(12)).toContain("Упражненията");
  });

  it("is silent at zero — the reply is doing the talking there", () => {
    expect(notice(0)).toBeNull();
  });

  it("is silent for an account with no pack", () => {
    expect(
      tutorAllowanceNoticeBg({
        applies: false,
        remaining: Number.POSITIVE_INFINITY,
        limit: LIMIT,
      }),
    ).toBeNull();
  });

  it("tracks the founder editing the allowance, rather than a hard-coded 60", () => {
    // 20% of a 100-question pack is 20, not 60.
    expect(notice(20, 100)).toContain("20 от 100");
    expect(notice(21, 100)).toBeNull();
  });
});

describe("tutorAllowanceSpentReplyBg", () => {
  it("is an explanation in the Учител's voice, not an error", () => {
    const reply = tutorAllowanceSpentReplyBg();
    expect(reply).toContain(`${LIMIT}`);
    // Requirement-zero (doc 64 THEO-4): say what still works, by name.
    expect(reply).toContain("упражненията");
    expect(reply).toContain("пробните изпити");
    expect(reply).not.toMatch(/грешка|error|нямаш достъп/i);
  });

  it("promises no top-up — that product does not exist yet (doc 81 §5.5)", () => {
    expect(tutorAllowanceSpentReplyBg()).not.toMatch(/купи|плат|кредит|€/i);
  });

  it("quotes the allowance the account actually has", () => {
    // An upgraded account holds two active packs and was given 600. Telling
    // them „това бяха 300-те" would be a small, avoidable lie.
    expect(tutorAllowanceSpentReplyBg(600)).toContain("600");
  });
});
