import { describe, expect, it } from "vitest";
import { objectiveDetailText } from "../SessionEndScreen";

/**
 * THE SENTENCE THE STUDENT DID NOT EARN.
 *
 * The objective row's detail line is prose, and prose makes a CLAIM ABOUT THE
 * STUDENT'S DRIVING. For a met red it said, unconditionally:
 *
 *     „Изчака червения сигнал и потегли на зелено"
 *
 * A red is met in two lawful ways, and only one of them contains a wait
 * (lessons/types.ts · RedMetVia). The other is ЗДвП чл. 7 — a регулировчик
 * waving you through a forbidding lamp — where the student stops for nothing
 * and crosses a red line still rolling. `sc-sig-controller-live` is built on
 * exactly that branch and NOTHING ELSE COMPLETES IT, so every successful run
 * of that template printed a sentence about a wait that never happened. The
 * first version of this bug at least had a −10 fault printed beside it to
 * contradict it; this one is a clean pass, so nothing on the screen argues
 * back.
 *
 * These tests pin the two accounts apart. They assert on the WORDS, because
 * the words are the defect — a shape assertion (`redMetHere: true`) is exactly
 * what passed all the way through the bug.
 */
describe("objectiveDetailText · passSignal met-red account", () => {
  const detail = (
    redMetHere: boolean,
    redMetVia: "waitedOutGreen" | "controllerProceed" | null,
  ) => ({ kind: "passSignal" as const, redsMetInRun: redMetHere ? 1 : 0, redMetHere, redMetVia });

  it("says the wait ONLY for the signature that waited", () => {
    const text = objectiveDetailText(detail(true, "waitedOutGreen"));
    expect(text).toBe("Изчака червения сигнал и потегли на зелено");
  });

  it("REGRESSION: the регулировчик pass never claims a wait", () => {
    const text = objectiveDetailText(detail(true, "controllerProceed"));
    expect(text).not.toBeNull();
    // The exact defect: this branch printing the waiting sentence.
    expect(text).not.toContain("Изчака");
    expect(text).not.toContain("зелено, ");
    expect(text).toContain("без да чака зелено");
  });

  it("…and it pays THEO-4 — the чл. 7 reasoning, not a bare tick", () => {
    const text = objectiveDetailText(detail(true, "controllerProceed")) ?? "";
    // What he did.
    expect(text).toContain("регулировчика");
    // Why it was right, with the article cited — never free-recalled prose
    // (ADR-002): the reasoning is what turns a ✓ into instruction.
    expect(text).toContain("чл. 7");
    // …and why it is not the offence it looks like.
    expect(text).toContain("а не преминаване на червен сигнал");
  });

  it("no red met here → no line at all (unchanged)", () => {
    expect(objectiveDetailText(detail(false, null))).toBeNull();
  });

  it("a replayed pre-redMetVia payload claims neither act", () => {
    // wire.ts decodes the older shape with redMetVia: null. The line has to be
    // true of BOTH signatures then — the failure mode being repaired here is
    // precisely picking one and asserting it.
    const text = objectiveDetailText(detail(true, null)) ?? "";
    expect(text).not.toContain("Изчака");
    expect(text).not.toContain("регулировчик");
    expect(text).toContain("премина правилно");
  });
});
