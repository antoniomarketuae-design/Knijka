/**
 * The scenario coach — applies teach-first-then-grade over the rule engine's
 * violation stream, without touching the pure reducer.
 *
 * Safety floor: dangerous (опасна) or session-terminating mistakes ALWAYS grade
 * from the first encounter — we never "teach away" running a red light or a
 * collision. Everything else (основна/второстепенна) teaches on the first
 * encounter and grades on repeats (escalating, per policy.ts).
 *
 * A12 warn-once floor: второстепенна (1-point) codes get ONE warning toast
 * (teach) before grading begins REGARDLESS of scenario mapping — unmapped
 * codes via the explicit policy-level default, mapped codes even if their
 * scenario were ever marked "always-grade" (a 1-point slip is never a safety
 * floor). See `policyForViolation` in policy.ts. основна/опасна unchanged.
 *
 * What a "repeat" IS lives in `encounterKey` below — the same mistake made
 * again, which is neither "a second event carrying the same code" nor "a
 * second event under the same mini-lesson". Those are three different
 * questions and this module answers all three separately.
 *
 * Pure + deterministic: the caller owns the per-session encounter counts.
 */

/**
 * THIS FILE EMITS NO TEXT, AND EIGHT AUDIT FINDINGS SAY OTHERWISE — 2026-08-23.
 *
 * The note is here because the corpus points a fixer HERE, so this is where the
 * next one lands. `coachStep` returns {mode, scored, showLesson,
 * penaltyMultiplier} and nothing else; measured on the comment-stripped source,
 * the file holds ZERO Cyrillic characters and its only string literals are
 * module specifiers, mode names and counter-key prefixes. It cannot be the
 * source of a caption, so no repair to it can move any of these eight:
 *
 *   sc-merge-lane-end:16d2fa64      sc-ed-poligon-chain:746682ab
 *   sc-zebra-approach:8dda834f      sc-lane-change:d59518f2
 *   sc-follow-cutin:12458158        sc-hazard-obstacle:c6bc5131
 *   sc-hz-accident-scene:9e19b858   sc-hz-breakdown-pulloff:b56c2554
 *
 * All eight quotes are `annotation.textBg` steps in the demonstration traces
 * (`modules/sim/traces/sc*.ts`), rendered by the `data-hud="deck-caption"` box
 * in `components/sim/lesson-ui/TraceTimeline.tsx`. Verified by opening all
 * eight named frames: in every one the sentence sits directly above the panel
 * headed «ДЕМОНСТРАЦИЯ — СЛЕДВАЙ СЯНКАТА», on the DEMO's clock (0:23/2:44,
 * 0:22/0:32, 0:02/0:34, 0:02/0:27, 0:28/0:40, 0:23/0:30, 0:20/0:28, 0:26/0:26)
 * — not the student's. The lesson mounts that deck as the ratified L1 aid
 * (`DEFAULT_LEVEL_AIDS[1].shadowCar`, compile.ts), so removing it is not the
 * cure. This is the SAME misrouting TraceTimeline.tsx already records at its
 * `captionDeadAirPx` block for `sc-follow-distance/pc-right/04-t180s.png`,
 * which was filed against `AdvisorCard.tsx` and belonged to this box too.
 *
 * The owners are TraceTimeline.tsx (caption at rest), LessonScene.tsx +
 * traces/types.ts (`createTraceClock` starts `playing: true`, so the demo has
 * already run 23 s by the arrival frame) and ShadowCar.tsx (the playhead loops
 * or parks, desynchronised from the student either way). Censused over the 503
 * shipped trace JSONs (1,870 captions): 490 put their LAST caption exactly at
 * the trace end and 495 within the 4 s linger window, and 42 captions are in
 * the first-person completed voice — 16 of those a trace's final caption — so
 * a parked playhead freezes «Спряхме плътно вдясно…» over a live drive.
 * Anyone adding the VISIBLE speaker chip that would fix the attribution must
 * put it outside the fixed 138 px caption box: `deckCaptionVoice.test.tsx`
 * asserts the label is `sr-only` precisely because the tallest caption in the
 * bank is six lines and a label row inside would clamp it. That assertion is
 * argued; replace it deliberately or work around it, never delete it to pass.
 */

import { actCopy } from "../rules";
import type { ViolationCode } from "../rules";
import { getScenarioEvent } from "./events";
import { repeatFamilyForCode, scenarioForCode } from "./mapping";
import { policyForViolation, recordEncounter, resolveEncounter } from "./policy";
import type { EncounterMode, ViolationSeverity } from "./policy";

type Severity = ViolationSeverity;

export interface CoachInput {
  code: string;
  severityClass: Severity;
  terminateSession?: boolean;
  /**
   * The event's machine-readable act discriminator (`ViolationEvent.detail`,
   * rules/types.ts), passed straight through from the rule engine. Read ONLY
   * by `encounterKey` below, and only where the CATALOGUE declares it an act —
   * see that function for why the field is never trusted on its own. Absent
   * (every caller that does not stamp one) → the key is what it always was.
   */
  detail?: string;
}

/**
 * A13 exam mode: teach-first is OFF for the whole session. EVERY violation —
 * every severity, mapped or not, first encounter or repeat — grades at
 * catalog points (mode "grade", ×1.0, no lesson card). The A12 warn-once
 * floor and the repeat-escalation ladder are TRAINING devices; an exam
 * scores exactly what the official protocol scores, nothing softer and
 * nothing harder. Encounter counts still accumulate (session bookkeeping).
 *
 * THEO-3 `learnOnly` — the exam mode's mirror image: the WHOLE session rides
 * the existing "learn-only" suppression channel (resolveEncounter's most
 * lenient policy — mode "learn", never scored, ×0). This is the
 * mistake-experience sandbox where the student performs the wrong action ON
 * PURPOSE: even the опасна/terminating safety floor is deliberately bypassed
 * — the dangerous act IS the assignment, and the consequence is presented by
 * the mode's overlay, never by the score. Mutually exclusive with examMode
 * by construction (the compiler never authors both); examMode wins if both
 * ever arrive (grading integrity outranks the sandbox).
 */
export interface CoachOptions {
  examMode?: boolean;
  learnOnly?: boolean;
}

export interface CoachDecision {
  code: string;
  /** Scenario event this maps to (null → keyed by its own code). */
  scenarioId: string | null;
  mode: EncounterMode;
  /** Whether it counts toward the session score (false for a taught moment). */
  scored: boolean;
  /** Whether to surface the contextual mini-lesson this encounter. */
  showLesson: boolean;
  /**
   * Repeat-penalty escalation (policy.ts): 0 for teach/learn; for grade mode
   * ×1.0 on the first graded pass, ×1.5 then ×2.0 (capped) on repeats. A9
   * applies it to the training-layer effective points (lessons/escalation.ts);
   * the official base points stay catalog-fixed.
   */
  penaltyMultiplier: number;
}

/**
 * WHAT COUNTS AS A REPEAT — the encounter key, and the whole escalation ladder
 * hangs off it (`prior` → policy.ts `gradeMultiplier`).
 *
 * A repeat is THE SAME MISTAKE MADE AGAIN, and the identity of a mistake has
 * two parts: the FAMILY (mapping.ts `repeatFamilyForCode` — the code itself,
 * unless the catalogue grades one error at two bars, as it does for the two
 * speeding codes and the three lead-gap codes) and, where the catalogue
 * declares them, the ACT. The catalogue splits two codes into distinct acts
 * carried on `detail`: COLLISION by the body struck (vehicle / pedestrian /
 * cyclist / staticObject) and RAIL_CROSSING_VIOLATION by the act (no-stop /
 * entered-barred / stopped-on-track). Each act has its own authored title and
 * explanation precisely because it is a different mistake, not a second helping
 * of the first.
 *
 * WHAT THIS KEY IS NOT: the scenario id. That is the answer to a different
 * question — which mini-lesson teaches this — and it is many-to-one, so using
 * it here made every fault a repeat of any other fault the same lesson covers.
 *
 * MEASURED 2026-08-18, `sc-zebra-approach` driven wrong at 59 км/ч, the
 * reference lesson of the whole audit: «Твърде бързо приближаване към
 * пешеходна пътека» (опасна, 10 т.) and then «Непропускане на пешеходец»
 * (опасна, 10 т.) — two different faults, both mapped to
 * `ev-ped-crossing-marked`. The second landed on the first's counter and the
 * debrief read «ПОВТОРНА ГРЕШКА ×1.5» and «Тренировъчен резултат: 25
 * наказателни т.» against an official 20. The student was told he had repeated
 * a mistake he made once. Censused over `.audit-frames/sweep161`: 23 of the
 * 348 drives that reached a debrief carry two or more DISTINCT faults under
 * one scenario id and are repriced by this key. Replayed over the 298 recorded
 * drives in `content/traces`, 3 change — all of them the same way, and none of
 * them losing an escalation it had earned (mapping.ts records the numbers).
 *
 * MEASURED 2026-08-18, `sc-hz-accident-scene`, the same crime in the collision
 * path and the reason the act half of the key exists: a wrecked car struck at
 * t=13.13 and a bystander at t=13.43 — one crash, one act of driving, two
 * victims, both keyed under `ev-collision`, the pedestrian priced ×1.5.
 * `lessons/engine.ts buildLessonResult` later stopped that ONE number reaching
 * the screen, by folding only the rows the closed ledger actually charged — but
 * that is the LEDGER's filter, not this ladder's, and it only reaches faults
 * that follow a closure. `RAIL_CROSSING_VIOLATION` is опасна and deliberately
 * NOT terminating (catalog.ts), so nothing closes its ledger: entering a barred
 * crossing and then coming to rest on the tracks bills both rows. The false
 * «повторна» is decided HERE, so it is corrected here.
 *
 * THE OTHER DIRECTION IS WHY THIS ASKS THE CATALOGUE AND NOT THE FIELD.
 * `detail` is not always an act: SPEEDING_OVER_LIMIT stamps the measured speed
 * on it (rules/engine.ts `speedDetail`) and a priority fault stamps the
 * situation. Keying on the field itself would give every speeding its own
 * counter, the ladder would never fire, and a driver who sped five times would
 * be taught five times and graded never — a false acquittal in place of a false
 * conviction. `actCopy` is non-null for exactly the details the catalogue
 * declares acts, and it is the same predicate the debrief already groups its
 * rows by (rules/index.ts), so the two surfaces cannot drift apart.
 *
 * THE RETURN VALUE IS A COUNTER KEY AND NOTHING ELSE. It used to double as the
 * scenario-event id handed to `resolveEncounter`, which looks a `policyDefault`
 * up by it — so an act-carrying key like `ev-collision#vehicle` resolved to no
 * event and silently dropped that scenario's policy (`ev-collision` is
 * `learn-only` in event-library.json). Nothing reached it, because both
 * act-carrying codes are опасна and `policyForViolation` always overrode them
 * — but an основна act-carrying code would have flipped a learn-only scenario
 * into a grading one with no diff to show for it. `coachStep` now resolves the
 * policy itself and hands `resolveEncounter` a real event id; this key is no
 * longer looked up anywhere.
 */
function encounterKey(v: CoachInput): string {
  const base = repeatFamilyForCode(v.code);
  // The cast is safe by construction: a code outside the per-act tables misses
  // the lookup and returns null, which is the pooled (no-act) answer anyway.
  const isAct = actCopy(v.code as ViolationCode, v.detail) !== null;
  return isAct ? `${base}#${v.detail}` : base;
}

/** Decide one violation and return the updated encounter counts. */
export function coachStep(
  encounters: Readonly<Record<string, number>>,
  v: CoachInput,
  opts?: CoachOptions,
): { decision: CoachDecision; encounters: Record<string, number> } {
  // THREE KEYS, ON PURPOSE, and the third one is the whole lesson of this file.
  //
  //   scenarioId  „which mini-lesson teaches this" — rides out on the decision.
  //   teachKey    „have I already taught you about this SITUATION" — counted per
  //               TOPIC, so a drive gets ONE free lesson per topic, not one per
  //               code. Drives `mode`.
  //   repeatKey   „have you made THIS MISTAKE before" — counted per code (plus
  //               act, where the catalogue declares acts). Drives the ×1.5/×2
  //               ladder, and nothing else.
  //
  // These were ONE value until 2026-08-19, and collapsing them is wrong in both
  // directions — the project shipped each in turn. Keyed by TOPIC, two DIFFERENT
  // faults counted as repeats of each other (the reference lesson billed 25
  // against an official 20 and told the student he repeated a mistake he made
  // once). Keyed by CODE, every distinct fault drew its own free lesson and
  // `sc-ln-turn-lane-arrows` with a late two-lane swerve — unsignalled AND
  // unobserved — went from FAILED to PASSED. Separating them is what satisfies
  // both, and a false certificate is the graver of the two to leave standing.
  //
  // `graded:` counts GRADINGS rather than occurrences, so the ladder needs no
  // offset: a mistake that was taught the first time never incremented it.
  const scenarioId = scenarioForCode(v.code);
  const repeatKey = encounterKey(v);
  const teachKey = `teach:${scenarioId ?? repeatKey}`;
  const seenKey = `seen:${repeatKey}`;
  const gradedKey = `graded:${repeatKey}`;
  const prior = encounters[teachKey] ?? 0;
  const seen = encounters[seenKey] ?? 0;
  const priorGraded = encounters[gradedKey] ?? 0;
  // …and the three increments go through `policy.recordEncounter`, which is the
  // module that OWNS the shape of this record („the caller owns the per-driver
  // encounter counts" — policy.ts's header). It was written for exactly this
  // and had no caller: this file spelled the spread out by hand in three
  // places, which is three chances for one of them to drift from „+1 on this
  // key" into something else, silently, with every existing suite green.
  const nextEncounters = recordEncounter(recordEncounter(encounters, teachKey), seenKey);

  // A13 exam mode — unconditional always-grade at official base points. Even
  // learn-only-mapped codes grade: if the rule engine emitted a violation, an
  // examiner would log it. No multiplier (repeat escalation is training-only)
  // and no mini-lesson mid-exam (the debrief teaches AFTER the verdict).
  if (opts?.examMode === true) {
    return {
      decision: {
        code: v.code,
        scenarioId,
        mode: "grade",
        scored: true,
        showLesson: false,
        penaltyMultiplier: 1,
      },
      encounters: nextEncounters,
    };
  }

  // Severity ladder (policy.ts): опасна/terminating always grade; второстепенна
  // warns once before grading regardless of mapping; основна follows the map.
  // THEO-3 learnOnly: the sandbox overrides the ladder with the existing
  // learn-only policy for every code — the same suppression channel
  // learn-only-mapped scenarios always used, applied session-wide.
  const mappedPolicy = scenarioId ? getScenarioEvent(scenarioId)?.policyDefault : undefined;
  // THE POLICY IS DECIDED HERE, NOT INSIDE `resolveEncounter`. That function
  // falls back to `getScenarioEvent(eventId)?.policyDefault` when handed no
  // override, and the id it used to be handed was the ENCOUNTER KEY — which no
  // longer resembles an event id at all, and already did not whenever an act
  // suffix was appended. Folding `mappedPolicy` in explicitly makes the
  // fallback dead weight rather than a trap: byte-identical answers today
  // (`policyForViolation` returns undefined exactly where the mapping was
  // meant to decide), and the scenario's own default can no longer be lost by
  // the shape of a counter key. The event id is still passed truthfully, for
  // the `eventId` that comes back on the outcome.
  const override =
    opts?.learnOnly === true
      ? "learn-only"
      : (policyForViolation(v.severityClass, v.terminateSession === true, mappedPolicy) ??
        mappedPolicy);
  const outcome = resolveEncounter(scenarioId ?? v.code, prior, override, {
    occurrences: seen,
    gradings: priorGraded,
  });
  return {
    decision: {
      code: v.code,
      scenarioId,
      mode: outcome.mode,
      scored: outcome.mode === "grade",
      showLesson: outcome.showLesson,
      penaltyMultiplier: outcome.penaltyMultiplier,
    },
    // The ladder counts GRADINGS, so this increments only when one happened.
    encounters:
      outcome.mode === "grade" ? recordEncounter(nextEncounters, gradedKey) : nextEncounters,
  };
}

/*
 * `coachSession(violations)` — a fold of `coachStep` over an ordered stream —
 * used to be exported here and from `scenarios/index.ts`. Removed 2026-08-26:
 * it had no non-test caller and could not acquire one.
 *
 * THE PRODUCTION FOLD IS `lessons/engine.ts:713` AND IT CANNOT CALL THIS ONE.
 * That loop threads `encounters` through `coachStep` exactly as this did, but
 * it does real work between the steps — it builds the explanation string, it
 * pushes a HUD event, it decides whether the moment may pause the drive, it
 * bills the score. A fold that returns only the decisions has nowhere to put
 * any of that, so „make the engine call it" was never on the table.
 *
 * What it actually was is a convenience for `coach.test.ts`, which drives it
 * seventeen times. That is a fine thing to want and the wrong place to keep it:
 * a helper only the suite uses, exported through the module's public barrel,
 * reads to every later grep exactly like a shipped API. It now lives in the
 * test that wanted it, where its scope tells the truth.
 */
