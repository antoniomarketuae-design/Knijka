/**
 * THEO-1: question media and option sign-face media must survive the exam
 * builder's safe-view materialization — and the safe views must still never
 * leak `correct` flags.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { setContentRepo } from "../../../lib/content/repo";
import type { QuestionMedia } from "../../../lib/content/types";
import { buildExam } from "..";
import { makeFixtureRepo, richBank } from "./fixtures";

const SCENE_MEDIA: QuestionMedia = {
  kind: "sceneStill",
  districtId: "tj-stop-v1",
  focus: { x: 0, y: 0, zoomM: 60 },
  poses: [{ kind: "car", x: 0, y: -10, headingDeg: 0, variant: "ego" }],
};

describe("buildExam — media pass-through (THEO-1)", () => {
  const bank = richBank();
  // Every eligible question gets media so any 45-question draw covers both
  // kinds: sign media + a sign-face option on 2-pointers, sceneStill on 3s.
  for (const q of bank.questions) {
    if (q.points === 3) {
      q.media = SCENE_MEDIA;
    } else {
      q.media = { kind: "sign", signRef: "Б2" };
      q.options[0].media = { kind: "sign", signRef: "Б1" };
    }
  }
  const bankById = new Map(bank.questions.map((q) => [q.id, q]));

  beforeEach(() => {
    setContentRepo(makeFixtureRepo(bank));
  });

  it("carries question media and option media into the safe views", () => {
    const exam = buildExam(7);
    for (const q of exam.questions) {
      const bankQ = bankById.get(q.id);
      expect(bankQ).toBeDefined();
      expect(q.media).toEqual(bankQ!.media);
      for (const option of q.options) {
        const bankOption = bankQ!.options.find((o) => o.id === option.id);
        expect(bankOption).toBeDefined();
        expect(option.media).toEqual(bankOption!.media);
      }
    }
  });

  it("still never leaks correct flags, explanations or law refs", () => {
    const exam = buildExam(11);
    for (const q of exam.questions) {
      expect(q).not.toHaveProperty("explanationBg");
      expect(q).not.toHaveProperty("lawRefs");
      for (const option of q.options) {
        expect(option).not.toHaveProperty("correct");
      }
    }
  });
});
