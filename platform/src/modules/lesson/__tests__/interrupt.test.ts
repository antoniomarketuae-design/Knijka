/**
 * Interruption — the founder's core ask, against the REAL content bank and the
 * REAL rule catalogue.
 *
 * The thing this battery is defending is the claim in interrupt.ts's header:
 * that MOST interruptions are answered by authored material, instantly, for
 * nothing, with a citation, and WITHOUT A MODEL IN THE LOOP. If that stops
 * being true the classroom becomes a chat window with a progress bar — it
 * costs money per press, it stops working when the key is missing, and every
 * answer becomes a thing that has to be trusted rather than a thing that was
 * reviewed.
 *
 * `ANTHROPIC_API_KEY` is empty in this repo, so these tests exercise exactly
 * the path a student hits today.
 */
import { beforeEach, describe, expect, it } from "vitest";
import "@/lib/content/loader";
import { allLessons, resetLessonCache } from "../compose";
import { CHIP_LABEL_BG, frameLine } from "../frames";
import {
  answerInterruption,
  authoredAnswer,
  beatCitations,
  beatMaterials,
  bestMaterialFor,
  constructiveRefusal,
  recentContentGaps,
  resetContentGaps,
} from "../interrupt";
import { resolveBeat } from "../resolve";
import { MAX_MODEL_ASKS_PER_BEAT } from "../types";
import type { AskChip, Beat, Lesson } from "../types";

resetLessonCache();
const LESSONS = allLessons();

/** A beat that cites a rule code — where the teacher has an authored stance. */
function beatWithRule(): { lesson: Lesson; beat: Beat; chips: AskChip[] } {
  for (const lesson of LESSONS) {
    for (const beat of lesson.beats) {
      if (beat.ruleCodes.length > 0 && beat.conceptIds.length > 0) {
        return { lesson, beat, chips: resolveBeat(lesson.id, beat.id)!.chips };
      }
    }
  }
  throw new Error("no rule-bearing beat in the catalogue");
}

/** A board beat — the one with replay chips on it. */
function beatWithBoard(): { lesson: Lesson; beat: Beat; chips: AskChip[] } {
  for (const lesson of LESSONS) {
    for (const beat of lesson.beats) {
      if (beat.board !== null) {
        return { lesson, beat, chips: resolveBeat(lesson.id, beat.id)!.chips };
      }
    }
  }
  throw new Error("no board beat in the catalogue");
}

beforeEach(() => {
  resetContentGaps();
});

describe("Tier 1 — the beat's own materials, injected", () => {
  it("injects concepts, questions, rules and signs by id, unranked", () => {
    const { beat } = beatWithRule();
    const materials = beatMaterials(beat);
    expect(materials.length).toBeGreaterThan(0);
    // Nothing scored them; an author named them.
    expect(materials.every((m) => m.score === 0)).toBe(true);
    expect(materials.some((m) => m.kind === "concept")).toBe(true);
    expect(materials.some((m) => m.kind === "rule")).toBe(true);
  });

  it("carries citations, deduplicated", () => {
    const { beat } = beatWithRule();
    const refs = beatCitations(beatMaterials(beat));
    expect(refs.length).toBeGreaterThan(0);
    const keys = refs.map((r) => `${r.act}|${r.ref}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("the answers that cost nothing", () => {
  it("answers a board chip with a player command, not speech", async () => {
    const { lesson, beat, chips } = beatWithBoard();
    const replay = chips.find((c) => c.kind === "board" && c.command === "replay");
    expect(replay).toBeDefined();
    const answer = await answerInterruption({
      userId: "u1",
      lessonId: lesson.id,
      beatId: beat.id,
      questionBg: CHIP_LABEL_BG.replay,
      chipId: replay!.id,
      modelAsksUsedInBeat: 0,
      chips,
    });
    expect(answer.source).toBe("board");
    expect(answer.boardCommand).toBe("replay");
    expect(answer.debited).toBe(false);
  });

  it("answers the what-should-I-have-done chip from the rule's corrective", async () => {
    const { lesson, beat, chips } = beatWithRule();
    const how = chips.find((c) => c.kind === "ask" && c.intent === "how")!;
    const answer = await answerInterruption({
      userId: "u1",
      lessonId: lesson.id,
      beatId: beat.id,
      questionBg: CHIP_LABEL_BG.how,
      chipId: how.id,
      modelAsksUsedInBeat: 0,
      chips,
    });
    expect(answer.source).toBe("authored");
    expect(answer.debited).toBe(false);
    expect(answer.bodyBg.length).toBeGreaterThan(0);
    expect(answer.citations.length).toBeGreaterThan(0);
  });

  it("answers the exam-consequence chip with the catalogue's own wording", async () => {
    const { lesson, beat, chips } = beatWithRule();
    const exam = chips.find((c) => c.kind === "ask" && c.intent === "exam")!;
    const answer = await answerInterruption({
      userId: "u1",
      lessonId: lesson.id,
      beatId: beat.id,
      questionBg: CHIP_LABEL_BG.exam,
      chipId: exam.id,
      modelAsksUsedInBeat: 0,
      chips,
    });
    expect(answer.source).toBe("authored");
    // The classification line the tutor also uses — one wording everywhere.
    expect(answer.bodyBg).toContain("Класификация на изпита");
    expect(answer.bodyBg).toContain("наказателни точки");
  });

  it("never invents a citation — the law chip lists refs the beat already carries", async () => {
    const { lesson, beat, chips } = beatWithRule();
    const law = chips.find((c) => c.kind === "ask" && c.intent === "law");
    if (law === undefined) return;
    const answer = await answerInterruption({
      userId: "u1",
      lessonId: lesson.id,
      beatId: beat.id,
      questionBg: CHIP_LABEL_BG.law,
      chipId: law.id,
      modelAsksUsedInBeat: 0,
      chips,
    });
    const known = new Set(
      beatCitations(beatMaterials(beat)).map((r) => `${r.act}|${r.ref}`),
    );
    expect(answer.citations.length).toBeGreaterThan(0);
    for (const ref of answer.citations) {
      expect(known.has(`${ref.act}|${ref.ref}`)).toBe(true);
    }
  });
});

describe("the teacher's opinions", () => {
  it("holds a view about DRIVING, framed as one, and hands the question back", async () => {
    // The founder asked for this by name. The stance is the rule catalogue's
    // authored `correctiveBg` — reviewed, concrete, procedural — inside a frame
    // that makes it audible as an opinion, and it ends by asking the student.
    const { lesson, beat, chips } = beatWithRule();
    const opinion = chips.find((c) => c.kind === "ask" && c.intent === "opinion")!;
    const answer = await answerInterruption({
      userId: "u1",
      lessonId: lesson.id,
      beatId: beat.id,
      questionBg: CHIP_LABEL_BG.opinion,
      chipId: opinion.id,
      modelAsksUsedInBeat: 0,
      chips,
    });
    expect(answer.source).toBe("authored");
    expect(answer.bodyBg.startsWith(frameLine("opinion-frame"))).toBe(true);
    expect(answer.turnBackBg).toBe(frameLine("opinion-turnback"));
    expect(answer.debited).toBe(false);
  });

  it("offers no opinion where there is no authored stance", () => {
    // No corrective in scope ⇒ null, and the caller falls through. The
    // alternative — improvising a view about Bulgarian law — is the exact
    // ADR-002 failure, and it is worse than a hallucinated citation because it
    // sounds like honest hedging.
    const bare: Beat = {
      id: "b-bare",
      kind: "explain",
      tone: "explain",
      say: [],
      conceptIds: [],
      questionIds: [],
      ruleCodes: [],
      signIds: [],
      board: null,
      questionCount: 0,
    };
    expect(authoredAnswer(bare, "opinion")).toBeNull();
    expect(authoredAnswer(bare, "how")).toBeNull();
    expect(authoredAnswer(bare, "exam")).toBeNull();
  });
});

describe("the refusal is constructive, never bare", () => {
  it("names the boundary, says what IS covered here, and offers a destination", () => {
    const { lesson, beat } = beatWithRule();
    const refusal = constructiveRefusal(lesson, beat, false);
    expect(refusal.bodyBg).toContain(frameLine("refuse-boundary"));
    expect(refusal.bodyBg).toContain(frameLine("refuse-offer"));
    expect(refusal.offer?.href).toContain(lesson.sectionId);
    // A bare verdict is what THEO-4 forbids; so is a bare refusal.
    expect(refusal.bodyBg.length).toBeGreaterThan(
      frameLine("refuse-boundary").length,
    );
  });

  it("refuses constructively once the beat's budgeted cap is spent", async () => {
    const { lesson, beat, chips } = beatWithRule();
    const answer = await answerInterruption({
      userId: "u1",
      lessonId: lesson.id,
      beatId: beat.id,
      questionBg: "Съвсем различен въпрос за нещо друго изцяло",
      chipId: null,
      modelAsksUsedInBeat: MAX_MODEL_ASKS_PER_BEAT,
      chips,
    });
    expect(answer.source).toBe("capped");
    expect(answer.offer).toBeDefined();
  });
});

describe("free text with no model available", () => {
  it("answers from a Tier-1 material when the question overlaps it", async () => {
    const { lesson, beat, chips } = beatWithRule();
    const materials = beatMaterials(beat);
    // Ask using the material's own words — the honest best case.
    const probe = materials[0].bodyBg.split(/\s+/).slice(0, 8).join(" ");
    const answer = await answerInterruption({
      userId: "u1",
      lessonId: lesson.id,
      beatId: beat.id,
      questionBg: probe,
      chipId: null,
      modelAsksUsedInBeat: 0,
      chips,
    });
    expect(answer.source).toBe("authored");
    expect(answer.debited).toBe(false);
  });

  it("refuses — and logs a content gap — when nothing in scope covers it", async () => {
    const { lesson, beat, chips } = beatWithRule();
    const answer = await answerInterruption({
      userId: "u1",
      lessonId: lesson.id,
      beatId: beat.id,
      questionBg: "zzzz qqqq wwww vvvv",
      chipId: null,
      modelAsksUsedInBeat: 0,
      chips,
    });
    expect(answer.source).toBe("refusal");
    const gaps = recentContentGaps();
    expect(gaps).toHaveLength(1);
    expect(gaps[0].beatId).toBe(beat.id);
    // ADR-004: the gap is the artifact, not the child. There is no user id on
    // this record and there must never be one.
    expect(Object.keys(gaps[0]).sort()).toEqual(
      ["beatId", "lessonId", "questionBg", "ts"],
    );
  });

  it("will not stretch one shared word into an answer", () => {
    const materials = beatMaterials(beatWithRule().beat);
    expect(bestMaterialFor("път", materials)).toBeNull();
  });
});

describe("input guarding", () => {
  it("rejects an empty or oversized question", async () => {
    const { lesson, beat, chips } = beatWithRule();
    const base = {
      userId: "u1",
      lessonId: lesson.id,
      beatId: beat.id,
      chipId: null,
      modelAsksUsedInBeat: 0,
      chips,
    };
    await expect(answerInterruption({ ...base, questionBg: "   " })).rejects.toThrow();
    await expect(
      answerInterruption({ ...base, questionBg: "я".repeat(501) }),
    ).rejects.toThrow();
  });

  it("rejects an unknown lesson or beat", async () => {
    await expect(
      answerInterruption({
        userId: "u1",
        lessonId: "l-nope",
        beatId: "b-nope",
        questionBg: "Здрасти",
        modelAsksUsedInBeat: 0,
        chips: [],
      }),
    ).rejects.toThrow();
  });
});
