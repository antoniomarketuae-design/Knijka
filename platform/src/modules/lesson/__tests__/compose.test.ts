/**
 * The lesson catalogue, against the REAL content bank, the REAL scenario
 * templates and the REAL rule catalogue.
 *
 * What this battery is actually protecting:
 *
 *  1. THE COURSE IS COVERED. 54 lessons, one per section, all 16 topics. The
 *     founder asked for „the whole course"; a regression that quietly drops a
 *     topic is invisible in any single lesson.
 *  2. NO UNREVIEWED BULGARIAN CAN REACH A STUDENT. Every `say` is an id, every
 *     id resolves into a reviewed corpus, and the only prose this module
 *     authors is frames.ts — which is asserted to contain no article, no
 *     number and no distance.
 *  3. THE BOARD HAS BOTH HALVES. „Correct ways and wrong ways" is the founder's
 *     phrase; a board beat that resolves only a mistake is half the feature.
 *  4. EVERY TRACE THE BOARD NAMES EXISTS ON DISK. A board pointing at a 404 is
 *     worse than no board.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";
import { allLessons, lessonForSection, resetLessonCache } from "../compose";
import { resolveBeat, resolveOutline } from "../resolve";
import type { Lesson } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(HERE, "../../../../public");

let lessons: Lesson[];

beforeAll(() => {
  resetLessonCache();
  lessons = allLessons();
});

describe("the catalogue covers the whole course", () => {
  it("builds exactly one lesson per section", () => {
    const sections = getContentRepo().sections?.() ?? [];
    expect(sections.length).toBeGreaterThan(0);
    expect(lessons).toHaveLength(sections.length);
    for (const section of sections) {
      expect(lessonForSection(section.id)).toBeDefined();
    }
  });

  it("covers all 16 topics", () => {
    const topics = getContentRepo().topics();
    const covered = new Set(lessons.map((l) => l.topicId));
    expect(covered.size).toBe(topics.length);
  });

  it("numbers lessons 1..N in course order, with no gaps", () => {
    expect(lessons.map((l) => l.order)).toEqual(
      lessons.map((_, i) => i + 1),
    );
  });

  it("gives every lesson an open, a recap and something in between", () => {
    for (const lesson of lessons) {
      expect(lesson.beats[0].kind).toBe("open");
      expect(lesson.beats[lesson.beats.length - 1].kind).toBe("recap");
      expect(lesson.beats.length).toBeGreaterThan(2);
    }
  });

  it("gives every lesson at least one quiz beat — the classroom always checks", () => {
    const withoutQuiz = lessons.filter(
      (l) => !l.beats.some((b) => b.kind === "quiz" && b.questionCount > 0),
    );
    expect(withoutQuiz.map((l) => l.id)).toEqual([]);
  });

  it("keeps beat ids unique inside a lesson", () => {
    for (const lesson of lessons) {
      const ids = lesson.beats.map((b) => b.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("a beat carries ids, never prose", () => {
  it("has no Bulgarian sentence anywhere in the beat data", () => {
    // The whole ADR-002 argument for the playback path in one assertion: if a
    // beat could hold a sentence, an unreviewed claim about Bulgarian law
    // could be typed into a lesson file where no verification tool looks for
    // it. `say` is a union of id-shaped records and nothing else.
    const CYRILLIC = /[Ѐ-ӿ]/;
    for (const lesson of lessons) {
      for (const beat of lesson.beats) {
        for (const ref of beat.say) {
          for (const value of Object.values(ref)) {
            if (typeof value === "string") {
              expect(
                CYRILLIC.test(value),
                `${lesson.id}/${beat.id} carries Cyrillic in a say ref: ${value}`,
              ).toBe(false);
            }
          }
        }
      }
    }
  });
});

describe("every reference resolves", () => {
  it("resolves every beat of every lesson to at least one utterance", () => {
    const empty: string[] = [];
    for (const lesson of lessons) {
      for (const beat of lesson.beats) {
        const resolved = resolveBeat(lesson.id, beat.id);
        expect(resolved, `${lesson.id}/${beat.id}`).not.toBeNull();
        if (resolved!.utterances.length === 0) empty.push(`${lesson.id}/${beat.id}`);
      }
    }
    expect(empty).toEqual([]);
  });

  it("resolves the outline of every lesson", () => {
    for (const lesson of lessons) {
      const outline = resolveOutline(lesson.id);
      expect(outline).not.toBeNull();
      expect(outline!.beats).toHaveLength(lesson.beats.length);
      expect(outline!.totalLessons).toBe(lessons.length);
    }
  });
});

describe("the board", () => {
  const boardBeats = () =>
    lessons.flatMap((l) =>
      l.beats.filter((b) => b.board !== null).map((b) => ({ lesson: l, beat: b })),
    );

  it("puts a board on a meaningful share of the course", () => {
    // 585 of 1,089 questions carry a wired scenario event, spread over all 16
    // topics, so most sections should get at least one. This is a floor, not a
    // target: two topics (алкохол, документи) are correctly board-poor.
    const withBoard = lessons.filter((l) => l.beats.some((b) => b.board !== null));
    expect(withBoard.length).toBeGreaterThanOrEqual(lessons.length / 2);
  });

  it("never shows the same scenario template twice inside one lesson", () => {
    for (const lesson of lessons) {
      const templates = lesson.beats
        .map((b) => (b.board !== null && b.board.mode !== "sign" ? b.board.templateId : null))
        .filter((id): id is string => id !== null);
      expect(new Set(templates).size, lesson.id).toBe(templates.length);
    }
  });

  it("resolves BOTH halves — the wrong way and the shadow-correct", () => {
    // The founder's „correct ways and mistake/wrong ways". Every one of the
    // 155 templates has a shadow-correct trace, so a `compare` board that
    // cannot produce a right-hand side means the chain broke, not that the
    // content is missing.
    let compared = 0;
    for (const { lesson, beat } of boardBeats()) {
      const resolved = resolveBeat(lesson.id, beat.id)!;
      expect(resolved.board, `${lesson.id}/${beat.id}`).not.toBeNull();
      expect(resolved.board!.wrong).toBeDefined();
      if (resolved.board!.mode === "compare") {
        expect(resolved.board!.right, `${lesson.id}/${beat.id}`).toBeDefined();
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(0);
  });

  it("names only traces that exist under public/", () => {
    const missing: string[] = [];
    for (const { lesson, beat } of boardBeats()) {
      const board = resolveBeat(lesson.id, beat.id)!.board!;
      for (const half of [board.wrong, board.right]) {
        if (half === undefined) continue;
        const file = path.join(PUBLIC_DIR, half.tracePath.replace(/^\//, ""));
        if (!existsSync(file)) missing.push(`${lesson.id}/${beat.id} → ${half.tracePath}`);
      }
      const district = path.join(PUBLIC_DIR, "world", `${board.wrong!.districtId}.json`);
      if (!existsSync(district)) missing.push(`${lesson.id}/${beat.id} → ${district}`);
    }
    expect(missing).toEqual([]);
  });
});

describe("the ask chips", () => {
  it("always offers a way in — every beat has at least the free-text chip", () => {
    for (const lesson of lessons) {
      for (const beat of lesson.beats) {
        const chips = resolveBeat(lesson.id, beat.id)!.chips;
        expect(chips.some((c) => c.kind === "free"), `${lesson.id}/${beat.id}`).toBe(true);
      }
    }
  });

  it("offers the opinion chip only where an authored stance exists", () => {
    // The founder asked for the teacher's opinion by name. It is offered
    // exactly where the rule catalogue has a `correctiveBg` to offer, and
    // nowhere else — the alternative is a model improvising a view about
    // Bulgarian law, which is the one thing ADR-002 exists to prevent.
    for (const lesson of lessons) {
      for (const beat of lesson.beats) {
        const chips = resolveBeat(lesson.id, beat.id)!.chips;
        const hasOpinion = chips.some(
          (c) => c.kind === "ask" && c.intent === "opinion",
        );
        expect(hasOpinion, `${lesson.id}/${beat.id}`).toBe(beat.ruleCodes.length > 0);
      }
    }
  });
});
