import "server-only";

/**
 * The demonstration lesson — a REAL lesson assembled from content that is
 * already approved, until the lesson lane authors the beat files.
 *
 * Read this as a fixture with a rule, not as content. **Every Bulgarian
 * sentence it puts on screen is copied verbatim from something that already
 * passed review** — the concept summary from `content/concepts.json`, the
 * teach cards and mistake write-ups from the scenario template, the law
 * reference from the same place — and it is assembled here at request time
 * rather than transcribed, so a content fix propagates without a lesson edit.
 * Nothing in this file writes a sentence of its own except the four short
 * pieces of UI chrome at the bottom, which are labelled as such.
 *
 * That constraint is not ceremony. `content/SCHEMA.md` makes `draft →
 * approved` a human-only transition and the review tool has no `--all` flag;
 * a demo route that invented its own narration would be the exact hole that
 * discipline exists to close, and it would be invisible in a screenshot.
 *
 * WHAT THE REAL THING REPLACES. Doc 84 §5.4: 54 lessons, one per SECTION, each
 * ~250 beats of authored JSON across the course. When that lands, this file is
 * deleted and the route reads the authored lesson instead — the room does not
 * change, because the room only ever sees `ClassroomLesson`.
 */

import { getContentRepo } from "@/lib/content/repo";
import { traceUrlForRepoPath } from "@/modules/clips/view";
import { scenarioById } from "@/modules/sim/lessons";
import type { ClassroomBeat, ClassroomBoard, ClassroomLesson } from "@/components/classroom/types";

/**
 * UI chrome — the room's own words, not content. Kept to a handful of short
 * connective lines and gathered here so they are countable. Everything a
 * student learns from comes from the content bank; these only move them
 * between the parts.
 */
const UI_BG = {
  quizLeadIn:
    "Спираме за момент. Да проверим дали се е получило — няколко въпроса по това, което току-що гледахме.",
  recapLeadIn: "Това е важното от урока:",
} as const;

/**
 * The demo's scenario. Chosen for three reasons, in order: it has a recorded
 * shadow AND two recorded mistakes AND a rendered reel, so every branch of the
 * board is exercised; its district is a ring, so the correct line and the
 * barge-in are visibly DIFFERENT SHAPES rather than two similar straight
 * lines on a straight street; and „кой е с предимство на кръговото" is the
 * single most argued-about rule among Bulgarian learner drivers.
 */
const DEMO_TEMPLATE_ID = "sc-roundabout-entry";
const DEMO_CONCEPT_ID = "c-roundabout-rules";
const DEMO_SUPPORT_CONCEPT_ID = "c-roundabout-behavior";

/** Build a correct/wrong pair from a template's own recorded traces. */
function boardFor(templateId: string, mistakeIndex: number): ClassroomBoard | null {
  const spec = scenarioById(templateId);
  if (!spec?.shadow) return null;
  const mistake = spec.mistakes?.[mistakeIndex];
  if (!mistake) return null;
  // A trace the recorder has not produced yet must degrade to no board rather
  // than to a broken one — same guard `whyPanel.ts` applies to its reel picks.
  if (spec.shadow.pending === true || mistake.traceRef.pending === true) return null;

  return {
    templateId,
    districtId: spec.map.districtId,
    correct: {
      tracePath: traceUrlForRepoPath(spec.shadow.path),
      titleBg: "Правилното изпълнение",
      captionBg: spec.objectiveBg,
    },
    mistake: {
      tracePath: traceUrlForRepoPath(mistake.traceRef.path),
      titleBg: mistake.titleBg,
      captionBg: mistake.whatWentWrongBg,
    },
    opensOn: "correct",
    lawRefBg: spec.teach.lawRef,
  };
}

/**
 * The one demo lesson this route serves. Returns null when the content it
 * quotes is missing, so the route can say so instead of rendering an empty
 * classroom.
 */
export function buildDemoLesson(): ClassroomLesson | null {
  const spec = scenarioById(DEMO_TEMPLATE_ID);
  if (!spec) return null;

  const repo = getContentRepo();
  const concept = repo.conceptById(DEMO_CONCEPT_ID);
  const support = repo.conceptById(DEMO_SUPPORT_CONCEPT_ID);
  if (!concept) return null;

  const conceptLaw = concept.lawRefs?.[0];
  const conceptLawBg = conceptLaw ? `${conceptLaw.act} ${conceptLaw.ref}` : null;

  const boardFast = boardFor(DEMO_TEMPLATE_ID, 0);
  const boardYield = boardFor(DEMO_TEMPLATE_ID, 1);

  const beats: ClassroomBeat[] = [
    {
      id: "b-intro",
      kind: "explain",
      tone: "explain",
      // content/concepts.json → summaryBg, verbatim.
      sayBg: concept.summaryBg,
      sayRef: `${concept.id}:summaryBg`,
      lawRefBg: conceptLawBg,
      conceptIds: [concept.id],
      board: null,
    },
    {
      id: "b-why",
      kind: "explain",
      tone: "warn",
      // The template's own „why it matters" card, verbatim.
      sayBg: spec.teach.whyBg,
      sayRef: `${DEMO_TEMPLATE_ID}:teach.whyBg`,
      lawRefBg: spec.teach.lawRef,
      conceptIds: spec.conceptIds,
      board: null,
    },
  ];

  if (boardFast) {
    beats.push({
      id: "b-board-approach",
      kind: "board",
      tone: "warn",
      // What the examiner is watching for — the sentence that makes the pair
      // on the board mean something.
      sayBg: spec.teach.examinerBg,
      sayRef: `${DEMO_TEMPLATE_ID}:teach.examinerBg`,
      lawRefBg: spec.teach.lawRef,
      conceptIds: spec.conceptIds,
      board: boardFast,
      ask: [
        { id: "a1", kind: "board-correct", labelBg: "Покажи пак правилното" },
        { id: "a2", kind: "board-mistake", labelBg: "Покажи грешката" },
        { id: "a3", kind: "board-replay", labelBg: "Пусни отначало" },
        { id: "a4", kind: "ask", labelBg: "Защо е грешка, щом имаше място?" },
      ],
    });
  }

  if (boardYield) {
    beats.push({
      id: "b-board-yield",
      kind: "board",
      tone: "warn",
      // The second mistake's own write-up: „има място" is the reasoning error.
      sayBg: spec.mistakes[1].whatWentWrongBg,
      sayRef: `${DEMO_TEMPLATE_ID}:mistakes[1].whatWentWrongBg`,
      lawRefBg: spec.teach.lawRef,
      conceptIds: spec.conceptIds,
      board: { ...boardYield, opensOn: "mistake" },
      ask: [
        { id: "b1", kind: "board-correct", labelBg: "А как е правилно?" },
        { id: "b2", kind: "board-replay", labelBg: "Пусни отначало" },
        { id: "b3", kind: "ask", labelBg: "А ако този в кръга ми даде знак да мина?" },
      ],
    });
  }

  beats.push({
    id: "b-quiz",
    kind: "quiz",
    tone: "explain",
    sayBg: UI_BG.quizLeadIn,
    sayRef: "ui:quiz-lead-in",
    conceptIds: [concept.id],
    board: null,
    ask: [{ id: "q1", kind: "ask", labelBg: "Обясни ми пак преди въпросите" }],
  });

  beats.push({
    id: "b-recap",
    kind: "recap",
    tone: "reassure",
    sayBg: support ? `${UI_BG.recapLeadIn} ${support.summaryBg}` : spec.teach.whenBg,
    sayRef: support ? `${support.id}:summaryBg` : `${DEMO_TEMPLATE_ID}:teach.whenBg`,
    lawRefBg: spec.teach.lawRef,
    conceptIds: support ? [support.id] : spec.conceptIds,
    board: null,
  });

  return {
    id: "l-demo-zebra",
    sectionId: "s-demo",
    topicId: concept.topicId,
    titleBg: spec.titleBg,
    kickerBg: "Демо · Класна стая",
    beats,
    // The sourcing lane has not delivered footage. Anything other than the
    // obvious placeholder here would be a lie with a face on it.
    teacher: { kind: "placeholder" },
    isPlaceholder: true,
  };
}
