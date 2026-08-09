/**
 * The reveal — and the reason this surface is worth building at all.
 *
 * A hazard-perception product that returns „3/5" has taught nothing. What
 * changes a novice's scanning is being shown WHERE the hazard was, WHY it was
 * already developing before it was obvious, and WHAT a competent driver does
 * about it. That is requirement-zero for every teaching surface in this product
 * (doc 64 THEO-4: no bare correct/wrong verdicts anywhere, ever), and it
 * applies to a zero exactly as much as to a five — a missed clip is the one the
 * student most needs explained.
 *
 * ADR-002 — RETRIEVAL, NOT RECALL. Every string that leaves this file was
 * written by a human and is copied verbatim:
 *   hazardBg / developingBg   authored per item in content/hazard/items.json
 *   correctiveBg / lawRefs    read from the 58-entry rule catalog
 *                             (@/modules/sim/rules VIOLATIONS) at reveal time
 *   the verdict line          the small authored map at the bottom of this file
 * Nothing here composes law text, and no LLM is in this path. If the corrective
 * for a rule is wrong, it is wrong in one place and a human fixes it there.
 */

import type {
  HazardItemFeedback,
  HazardLawRef,
  HazardVerdict,
} from "@/components/hazard/types";
import {
  VIOLATIONS,
  parseRuleLawRef,
  type SeverityClass,
  type ViolationCode,
} from "@/modules/sim/rules";
import type { HazardItem, HazardItemScore } from "./types";

// ---------------------------------------------------------------------------
// Citation
// ---------------------------------------------------------------------------

/** The rule behind a hazard, exactly as the catalog stores it. */
export interface HazardRuleCitation {
  code: ViolationCode;
  titleBg: string;
  explanationBg: string;
  correctiveBg: string;
  /** The catalog's own citation string, e.g. "ЗДвП чл. 119". */
  lawRef: string;
  severityClass: SeverityClass;
  /** content/concepts.json id, when the catalog links one. */
  conceptId?: string;
}

export function hazardRuleCitation(item: HazardItem): HazardRuleCitation {
  const spec = VIOLATIONS[item.violationCode];
  return {
    code: item.violationCode,
    titleBg: spec.titleBg,
    explanationBg: spec.explanationBg,
    correctiveBg: spec.correctiveBg,
    lawRef: spec.lawRef,
    severityClass: spec.severityClass,
    conceptId: spec.conceptId,
  };
}

/**
 * Split "ЗДвП чл. 119" into the {act, ref} pair the citation chip renders.
 *
 * NO LONGER A TWIN (2026-08-09). This used to be a hand-copy of
 * `modules/tutor/retrieval.ts parseCatalogLawRef`, and its own header said „if
 * a third consumer appears, promote it to the sim/rules barrel that owns the
 * strings". Both copies split at the first reference token (чл./ал./т./§/№),
 * which is a rule about the REF and broke on the ACT: „Наредба № РД-02-21-1…"
 * split inside the act's own designation, and a subject-level citation with no
 * number at all („ППЗДвП надлъжна пътна маркировка", the shape every ППЗДвП
 * entry now has) yielded nothing. The split now happens on the ACT NAME, in
 * `@/modules/sim/rules parseRuleLawRef` — one implementation, imported by both.
 *
 * Still fails closed: an unrecognised act yields null and the reveal simply
 * carries no chip. Manufacturing a citation is what ADR-002 forbids.
 */
export function parseHazardLawRef(raw: string): HazardLawRef | null {
  return parseRuleLawRef(raw);
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

/**
 * Mechanical outcome + band → the six-value verdict the student reads.
 *
 * The band split is the honest one: bands 0–1 (5 and 4 points) are a driver who
 * saw it develop, bands 2–3 are a driver who saw it, and band 4 (1 point) is a
 * reaction that in a real car would have been a hard brake. „Твърде рано" is
 * NOT a near-miss of „отлично" — pressing at everything is a different mistake,
 * and the copy has to say so or the student learns to spam.
 */
export function hazardVerdictFor(score: HazardItemScore): HazardVerdict {
  switch (score.outcome) {
    case "spam":
      return "void";
    case "early":
      return "early";
    case "missed":
      return "missed";
    case "scored":
      if (score.band === null) return "missed"; // unreachable; keeps the types honest
      if (score.band <= 1) return "excellent";
      if (score.band <= 3) return "good";
      return "late";
  }
}

/**
 * One authored line per verdict, „ти" register, said the way an instructor says
 * it in the car. Kept here rather than in the client so a copy change is a
 * server change and never a stale bundle.
 */
const VERDICT_LINE_BG: Record<HazardVerdict, string> = {
  excellent:
    "Точно това е реакцията, която търсим — усети опасността, докато още се задаваше, и ти остана време да действаш спокойно.",
  good: "Видя я и реагира навреме. Следващия път се опитай да я хванеш още при първия признак — така реакцията ти става плавна, а не рязка.",
  late: "Реагира в последния възможен момент. В реална кола това щеше да е рязко спиране — опасността се виждаше по-рано.",
  early:
    "Натисна, преди да има какво да се види. Това не е предпазливост, а гадаене: ако натискаш при всичко, окото ти спира да търси конкретното нещо.",
  missed:
    "Не я забеляза. Няма страшно — точно за това е упражнението: гледай къде беше опасността и какво я издаваше.",
  void: "Тази ситуация не се брои — натисканията бяха твърде много и в шаблон. Реши я честно: едно натискане, в момента, в който наистина видиш нещо.",
};

/** The instructor's line for this outcome. Never generated, never a bare score. */
export function hazardVerdictLineBg(verdict: HazardVerdict): string {
  return VERDICT_LINE_BG[verdict];
}

// ---------------------------------------------------------------------------
// The reveal payload
// ---------------------------------------------------------------------------

/**
 * Build everything the student is shown after one clip.
 *
 * `itemId` is left off because the caller already knows it — this is exactly
 * the shape @/modules/hazard-play expects back from `judge()`.
 *
 * NOTE WHAT BECOMES VISIBLE HERE AND NOWHERE EARLIER: the window boundaries and
 * the fault timestamp. They are the answer. The card that was served while the
 * clip played has no field for them (@/components/hazard/types splits the two
 * halves for exactly this reason), so they cannot be read out of the page
 * source, a devtools breakpoint or the RSC payload before the press is in.
 */
export function buildHazardFeedback(
  item: HazardItem,
  score: HazardItemScore,
): Omit<HazardItemFeedback, "itemId"> {
  const citation = hazardRuleCitation(item);
  const lawRef = parseHazardLawRef(citation.lawRef);
  return {
    verdict: hazardVerdictFor(score),
    points: score.points,
    maxPoints: score.maxPoints,
    reactionAtSec: score.scoredAtSec,
    windowStartSec: item.window.openSec,
    windowEndSec: item.window.closeSec,
    hazardAtSec: item.hazardAtSec,
    hazardBg: item.hazardBg,
    developingBg: item.developingBg,
    correctiveBg: citation.correctiveBg,
    lawRefs: lawRef === null ? [] : [lawRef],
  };
}
