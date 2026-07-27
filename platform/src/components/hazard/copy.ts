/**
 * Bulgarian copy for the hazard surfaces — one file, no JSX, no imports from a
 * module, so it can be unit-tested in the node environment the suite runs in
 * (vitest.config.ts has no DOM) and so a copy change never touches a component.
 *
 * THE TONE IS A PRODUCT DECISION, not a style preference. Doc 64 THEO-4: no
 * bare correct/wrong verdicts anywhere, ever — every outcome has to explain
 * itself like an instructor sitting in the passenger seat. Hazard perception
 * pushes that further than the theory bank does, because here the student can
 * be WRONG IN TWO OPPOSITE DIRECTIONS and the two are not near-misses of each
 * other:
 *
 *   pressing too early  = tapping at everything, i.e. not scanning at all;
 *   pressing too late   = scanning, but seeing the event instead of the cue.
 *
 * Copy that flattened both into „грешка" would teach the early-tapper to tap
 * MORE, which is exactly the failure mode the UK test voids for. So every
 * verdict below says what the student actually did, in „ти", in the register a
 * 17-year-old talks in — encouraging where that is honest, blunt where it is
 * not. Nothing here congratulates a miss.
 *
 * ADR-002: none of this is law. Law text and citations arrive from the item
 * engine, retrieved from the rule catalog, and are rendered verbatim.
 */

import type { HazardActionErrorCode, HazardDoor, HazardVerdict } from "./types";

// ---------------------------------------------------------------------------
// Verdicts
// ---------------------------------------------------------------------------

/** How a verdict is painted. Maps to the semantic tokens, never to a hex. */
export type HazardVerdictTone = "success" | "accent" | "warning" | "danger" | "muted";

export interface HazardVerdictCopy {
  /** The headline. Short — it lands next to the points readout. */
  labelBg: string;
  /** One line saying what the student DID. The teaching half. */
  bodyBg: string;
  tone: HazardVerdictTone;
}

export const HAZARD_VERDICT_COPY: Record<HazardVerdict, HazardVerdictCopy> = {
  excellent: {
    labelBg: "Видя я как се задава",
    bodyBg:
      "Реагира още докато опасността се оформяше — точно това търсим. На истински път това са метрите, които решават всичко.",
    tone: "success",
  },
  good: {
    labelBg: "Реагира навреме",
    bodyBg:
      "Хвана я вътре в прозореца, но малко след най-ранния момент. Търси признака, не самото събитие.",
    tone: "accent",
  },
  late: {
    labelBg: "Късно",
    bodyBg:
      "Реагира чак когато опасността вече беше очевидна. В реална кола това е рязко спиране — а зад теб може да има някой.",
    tone: "warning",
  },
  early: {
    labelBg: "Твърде рано",
    bodyBg:
      "Натисна, преди да има какво да се види. Това не е наблюдение, а налучкване — и на пътя то те учи да не вярваш на собствените си реакции.",
    tone: "danger",
  },
  missed: {
    labelBg: "Пропусна я",
    bodyBg:
      "Не реагира, докато още имаше време. Виж под клипа къде беше признакът — следващия път ще го хванеш.",
    tone: "danger",
  },
  void: {
    labelBg: "Не се брои",
    bodyBg:
      "Натискаше твърде често. Клип, покрит с натискания, не показва нищо — гледай и натискай веднъж, когато наистина видиш нещо.",
    tone: "muted",
  },
};

// ---------------------------------------------------------------------------
// Failures the student may actually hit
// ---------------------------------------------------------------------------

/**
 * Every failure the server can report, in words. A closed map over the closed
 * union means a new error code is a TYPE ERROR here rather than a blank panel
 * in front of a student.
 *
 * None of them show a code or a stack: the student can do nothing with either,
 * and „нещо се обърка" plus a working button is a better product than a correct
 * error message and a dead end.
 */
export const HAZARD_ERROR_COPY_BG: Record<HazardActionErrorCode, string> = {
  NO_ENTITLEMENT:
    "Тази част е в платения пакет. Виж какво включва и се върни — тренировката те чака.",
  NO_ITEMS:
    "Още подготвяме клиповете за тази тренировка. Върни се скоро — междувременно карай в симулатора.",
  RUN_NOT_FOUND:
    "Тази тренировка вече е приключила или е отпреди твърде дълго. Започни нова.",
  OUT_OF_ORDER:
    "Този клип вече е оценен. Презареди страницата и продължи със следващия.",
  IMPLAUSIBLE:
    "Нещо не се връзва с времето на клипа — може връзката да е прекъснала. Пусни клипа отново.",
  FAILED: "Нещо се обърка. Опитай пак след малко.",
};

// ---------------------------------------------------------------------------
// Doors
// ---------------------------------------------------------------------------

/** Where „назад" points when a run finishes, per door. Routing, not logic. */
export const HAZARD_DOOR_RETURN_HREF: Record<HazardDoor, string> = {
  section: "/hazard",
  simulator: "/simulator",
  theory: "/theory",
};

export const HAZARD_DOOR_RETURN_LABEL_BG: Record<HazardDoor, string> = {
  section: "Към опасностите",
  simulator: "Към симулатора",
  theory: "Обратно към урока",
};

// ---------------------------------------------------------------------------
// Numbers → Bulgarian
// ---------------------------------------------------------------------------

/**
 * Lead time in words: how much warning the student gave themselves.
 *
 * This, not the score, is the number that means something on a road — 1.4 s at
 * 50 km/h is about 19 metres of road you still own. It is rendered with one
 * decimal because the third digit is measurement noise (frame quantisation and
 * touch latency both live around 20–30 ms) and printing noise as precision is
 * how a teaching number turns into a leaderboard number.
 */
export function formatLeadSecBg(leadSec: number | null): string {
  if (leadSec === null) return "—";
  const rounded = Math.round(leadSec * 10) / 10;
  if (rounded <= 0) return `${rounded.toFixed(1)} с`;
  return `${rounded.toFixed(1)} с преди`;
}

/** „3 / 8" — the run position readout. Kept here so the wording is one place. */
export function formatRunPositionBg(index: number, total: number): string {
  return `${index} / ${total}`;
}

/**
 * Bulgarian plural for the clip count. Bulgarian takes the count form after
 * 2–4 and „клипа" after any digit ending in 2–4 except the teens — the same
 * rule the exam copy already hand-rolls, kept local rather than pulling in a
 * formatter for one word.
 */
export function clipsPluralBg(count: number): string {
  return count === 1 ? "клип" : "клипа";
}

/**
 * The score line: „14 / 25 т." Points are always shown WITH the maximum, never
 * as a bare number or a percentage — a percentage invites comparison to the
 * ДАИ pass mark, and hazard perception is deliberately not a pass/fail surface
 * (it is not on the ДАИ exam at all).
 */
export function formatPointsBg(points: number, maxPoints: number): string {
  return `${points} / ${maxPoints} т.`;
}
