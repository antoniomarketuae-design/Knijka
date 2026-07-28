/**
 * THE LESSON CATALOGUE — 54 lessons, one per SECTION, built from the content
 * that is already authored, reviewed and law-cited.
 *
 * WHY THIS IS COMPOSED AND NOT HAND-WRITTEN. „A teacher explains the theory"
 * reads like it needs a script, and a script for the whole course is a content
 * project the size of the 1,089-question bank (~324,000 chars of Bulgarian
 * that cannot be LLM-generated and shipped, because content/SCHEMA.md starts
 * everything at `draft` and review_batch.mjs has no `--all` flag, on purpose).
 * That project is not the way to a classroom the founder can sit in this week.
 *
 * What IS available is the material a teacher would be reading FROM:
 *
 *   152 concept summaries        the narration spine        (30,149 chars)
 *   1,089 question explanations  how a teacher answers      (326,036 chars)
 *   465 recorded traces          the board, both halves     — every one of the
 *                                155 templates has a shadow-correct beside its
 *                                mistakes, which is the founder's „correct ways
 *                                and wrong ways" already recorded
 *   58 rule-catalog entries      what the examiner counts it as, what you
 *                                should have done, and the article
 *
 * So this file writes STRUCTURE, not prose: which material, in which order,
 * against which board, checked by which questions. Every string a student
 * hears is looked up by id at render time (resolve.ts) from a corpus that has
 * already been through the review pipeline. The composition is deterministic —
 * same content ⇒ same 54 lessons ⇒ the same lesson on a retake.
 *
 * THE SECTION IS THE LESSON UNIT, not the topic. A topic lesson is 20–25
 * minutes; a section lesson is 4–7. For a 17-year-old on a phone, 25 minutes
 * is not a lesson, it is a commitment, and the failure mode is not „they watch
 * less" — it is „they never start". 54 also gives the theory hub the one thing
 * it does not have today: a path, and a next thing to press.
 *
 * SERVER/BUILD ONLY. This reaches the content repo, the scenario catalogue and
 * the rule catalogue. The client half of this module is `./client`.
 */

import { getContentRepo } from "@/lib/content/repo";
import type { Question } from "@/lib/content/types";
import { resolveWhyPanel } from "@/modules/clips";
import { SCENARIO_TEMPLATES, scenarioById } from "@/modules/sim/lessons";
import { VIOLATIONS } from "@/modules/sim/rules";
import { isLessonEligible } from "./quiz";
import { QUIZ_QUESTIONS_PER_BEAT } from "./types";
import type { Beat, BoardSpec, Lesson, SayRef } from "./types";

/** Tier-1 grounding stays small: a beat injects at most this many questions. */
const MAX_TIER1_QUESTIONS = 3;

/**
 * concept id → the rule-catalog codes that grade it.
 *
 * The catalogue's `conceptId` field is the existing bridge from a simulator
 * fault back into the knowledge graph (30 of the 52 violations carry one).
 * Read backwards it answers the question a lesson needs: „while I am teaching
 * c-seatbelts, which graded fault is this, what does it cost, and what was the
 * right action?" — which is the entire content of the teacher's authored
 * opinions (doc 84 §2.4).
 */
function rulesByConcept(): ReadonlyMap<string, string[]> {
  const byConcept = new Map<string, string[]>();
  for (const [code, spec] of Object.entries(VIOLATIONS)) {
    const conceptId = spec.conceptId;
    if (conceptId === undefined) continue;
    const list = byConcept.get(conceptId);
    if (list) list.push(code);
    else byConcept.set(conceptId, [code]);
  }
  // Catalog order within a concept — deterministic, and it puts the more
  // severe codes first because that is how the catalogue itself is ordered.
  return byConcept;
}

/**
 * The board pick for a concept: the recorded mistake demo whose fault this
 * concept's questions are about, plus its template's shadow-correct.
 *
 * It goes through `resolveWhyPanel`, which means it inherits — for free — the
 * whole wired chain the why-panel already owns: the question → ev-* map (585
 * of 1,089 questions), the hand-justified EVENT_TO_SCENARIO table, and the
 * pending-trace guard that degrades to text rather than pointing at a replay
 * that does not exist. That resolver is pinned by whyPanel.test.ts, so a board
 * pick here can never drift from the reel the why-panel would show for the
 * same question.
 */
function boardForConcept(
  questions: readonly Question[],
  used: Set<string>,
): { board: BoardSpec; templateId: string; mistakeIndex: number } | null {
  for (const question of questions) {
    const sim = resolveWhyPanel(question.id)?.sim;
    if (sim === undefined) continue;
    if (used.has(sim.templateId)) continue;
    const spec = scenarioById(sim.templateId);
    if (spec === undefined) continue;
    const mistakeIndex = spec.mistakes.findIndex(
      (m) => m.traceRef.path === sim.mistake.tracePath,
    );
    if (mistakeIndex < 0) continue;
    // „Correct vs wrong" needs BOTH halves. A template whose shadow has not
    // been recorded yet shows the mistake alone rather than an empty half —
    // the same honesty rule dualGhostCore applies (never compare against
    // nothing). In practice all 155 have one.
    const mode: BoardSpec["mode"] =
      spec.shadow.pending === true ? "mistake" : "compare";
    used.add(sim.templateId);
    return {
      board: { mode, templateId: sim.templateId, mistakeIndex },
      templateId: sim.templateId,
      mistakeIndex,
    };
  }
  return null;
}

/** Sign codes referenced by a concept's questions (media or option faces). */
function signIdsFor(questions: readonly Question[]): string[] {
  const codes = new Set<string>();
  for (const question of questions) {
    if (question.media !== null && "kind" in question.media && question.media.kind === "sign") {
      codes.add(question.media.signRef);
    }
    for (const option of question.options) {
      if (option.media !== undefined) codes.add(option.media.signRef);
    }
  }
  return [...codes].slice(0, 4);
}

function beat(partial: Partial<Beat> & Pick<Beat, "id" | "kind" | "tone" | "say">): Beat {
  return {
    conceptIds: [],
    questionIds: [],
    ruleCodes: [],
    signIds: [],
    board: null,
    questionCount: 0,
    ...partial,
  };
}

/**
 * Build every lesson, in course order.
 *
 * Shape of one lesson, from the real numbers (2.8 concepts per section):
 *
 *   open                                    ~15 s
 *   per concept: explain → [board] → quiz   ~60–90 s each
 *   recap                                   ~15 s
 *                                           ≈ 3.5–5 min
 */
export function buildLessons(): Lesson[] {
  const repo = getContentRepo();
  const sections = repo.sections?.() ?? [];
  const topics = [...repo.topics()].sort((a, b) => a.order - b.order);
  const byConcept = rulesByConcept();

  const lessons: Lesson[] = [];
  let order = 0;

  for (const topic of topics) {
    const topicSections = repo.sectionsByTopic?.(topic.id) ??
      sections.filter((s) => s.topicId === topic.id);

    topicSections.forEach((section, sectionIndex) => {
      order += 1;
      const beats: Beat[] = [];
      const usedTemplates = new Set<string>();
      const allConceptIds: string[] = [];

      // ---- OPEN ----------------------------------------------------------
      // The first section of a topic also reads the topic's own authored
      // description — the only place in the corpus that says what a whole
      // topic is FOR, and it is exactly what a teacher opens with.
      const openSay: SayRef[] = [
        { src: "frame", lineId: "lesson-open", slot: { kind: "section", id: section.id } },
      ];
      if (sectionIndex === 0) openSay.push({ src: "topic", topicId: topic.id });
      beats.push(
        beat({
          id: "b-open",
          kind: "open",
          tone: "explain",
          say: openSay,
          conceptIds: [...section.conceptIds],
        }),
      );

      // ---- ONE BLOCK PER CONCEPT ------------------------------------------
      section.conceptIds.forEach((conceptId, i) => {
        const concept = repo.conceptById(conceptId);
        if (concept === undefined) return;
        allConceptIds.push(conceptId);

        const questions = repo.questionsByConcept(conceptId);
        const eligible = questions.filter(isLessonEligible);
        const tier1 = eligible.slice(0, MAX_TIER1_QUESTIONS).map((q) => q.id);
        const ruleCodes = byConcept.get(conceptId) ?? [];
        const signIds = signIdsFor(eligible);

        // EXPLAIN — the concept's stored summary. The narration spine.
        beats.push(
          beat({
            id: `b${i + 1}-explain`,
            kind: "explain",
            tone: "explain",
            say: [{ src: "concept", conceptId }],
            conceptIds: [conceptId],
            questionIds: tier1,
            ruleCodes,
            signIds,
          }),
        );

        // BOARD — „ето как се обърква, а ето как се прави".
        const picked = boardForConcept(eligible, usedTemplates);
        if (picked !== null) {
          const spec = scenarioById(picked.templateId);
          const mistake = spec?.mistakes[picked.mistakeIndex];
          const boardSay: SayRef[] = [
            {
              src: "frame",
              lineId: picked.board.mode === "compare" ? "board-lead-in" : "quiz-lead-in",
            },
            {
              src: "mistake",
              templateId: picked.templateId,
              mistakeIndex: picked.mistakeIndex,
            },
            { src: "teach", templateId: picked.templateId, field: "why" },
          ];
          // Fix the lead-in for the mistake-only case: it is still a board,
          // just without the right-hand half.
          if (picked.board.mode !== "compare") boardSay[0] = { src: "frame", lineId: "board-lead-in" };
          beats.push(
            beat({
              id: `b${i + 1}-board`,
              kind: "board",
              tone: "warn",
              say: boardSay,
              conceptIds: [conceptId],
              questionIds: tier1,
              // The mistake's own graded codes are the sharpest rule scope a
              // beat can have: they are what the engine convicts on in exactly
              // the situation on the board.
              ruleCodes: [
                ...new Set([...(mistake?.codeRefs ?? []), ...ruleCodes]),
              ].filter((code) => Object.hasOwn(VIOLATIONS, code)),
              board: picked.board,
            }),
          );
        } else if (ruleCodes.length > 0) {
          // NO REEL — and that is correct for the board-poor topics
          // (алкохол, документи): a blood-alcohol limit is a number and a
          // consequence, not a manoeuvre. They get the catalogue instead:
          // what the fault is, and what the right action was. Both authored.
          beats.push(
            beat({
              id: `b${i + 1}-rule`,
              kind: "explain",
              tone: "warn",
              say: [
                { src: "rule", code: ruleCodes[0], field: "explanation" },
                { src: "rule", code: ruleCodes[0], field: "corrective" },
              ],
              conceptIds: [conceptId],
              questionIds: tier1,
              ruleCodes,
              signIds,
            }),
          );
        }

        // QUIZ — „разбрахте ли". Real bank questions, real grader.
        if (eligible.length > 0) {
          const count = Math.min(
            section.conceptIds.length <= 2 ? QUIZ_QUESTIONS_PER_BEAT : 1,
            eligible.length,
          );
          beats.push(
            beat({
              id: `b${i + 1}-quiz`,
              kind: "quiz",
              tone: "ask",
              say: [{ src: "frame", lineId: "quiz-lead-in" }],
              conceptIds: [conceptId],
              questionIds: tier1,
              ruleCodes,
              questionCount: count,
            }),
          );
        }
      });

      // ---- RECAP -----------------------------------------------------------
      beats.push(
        beat({
          id: "b-recap",
          kind: "recap",
          tone: "praise",
          say: [
            { src: "frame", lineId: "recap", slot: { kind: "section", id: section.id } },
          ],
          conceptIds: allConceptIds,
        }),
      );

      lessons.push({
        id: lessonIdForSection(section.id),
        sectionId: section.id,
        topicId: topic.id,
        order,
        titleBg: section.titleBg,
        topicTitleBg: topic.titleBg,
        beats,
      });
    });
  }

  return lessons;
}

/** "s-basics-safety" → "l-basics-safety". */
export function lessonIdForSection(sectionId: string): string {
  return sectionId.startsWith("s-") ? `l-${sectionId.slice(2)}` : `l-${sectionId}`;
}

// ---------------------------------------------------------------------------
// Process-lifetime cache
// ---------------------------------------------------------------------------

let cache: Lesson[] | null = null;

/** Every lesson, in course order. Built once per process. */
export function allLessons(): Lesson[] {
  cache ??= buildLessons();
  return cache;
}

export function lessonById(id: string): Lesson | undefined {
  return allLessons().find((l) => l.id === id);
}

export function lessonForSection(sectionId: string): Lesson | undefined {
  return lessonById(lessonIdForSection(sectionId));
}

/** Test seam — the content repo can be swapped between suites. */
export function resetLessonCache(): void {
  cache = null;
}

/** Guard against a template drifting out of the catalogue under a lesson. */
export function knownTemplateIds(): ReadonlySet<string> {
  return new Set(SCENARIO_TEMPLATES.map((s) => s.id));
}
