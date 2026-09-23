/**
 * DOES THIS DRILL'S TASK RELY ON THE DOOR MIRRORS? — founder ruling
 * 2026-09-22, «Live when the task uses it» (row sc-vu-pass-clearance:d770323a).
 *
 * The answer decides one render cost and nothing else: on MEDIUM and HIGH
 * quality a lesson that answers yes keeps its door glass live for the whole drive
 * (`scene/vitok/mirrorAttention.doorMirrorsFollowTask`); every other lesson
 * keeps the attention-gated doors it had. Grading never reads it — the graded
 * mirror check is the glance press, not the picture.
 *
 * ── WHICH SIGNAL, AND WHY NOT THE PROSE ────────────────────────────────────
 *
 * The obvious signal — „the briefing says огледало" — is the wrong one, and it
 * was measured before it was rejected. 64 of 167 templates mention a mirror in
 * their objective or numbered steps, and a good share of those mirrors are not
 * the student's door glass at all: «предният те чете само по фаровете ти в
 * огледалото си» (sc-follow-distance) and «дългите заслепяват водача отпред
 * през огледалата му» (sc-ac-highbeam-lead) are OTHER drivers' mirrors;
 * «Погледни в огледалото за задно виждане» (sc-mw-min-speed) is the interior
 * mirror, which is live on every tier already. A regex cannot tell those apart
 * and would buy a door-mirror pass budget for lessons that never ask for it.
 * (The AUDIT in __tests__/door-mirror-task.test.ts does read the prose, and it
 * is allowed to be wrong in a way this file is not: it fails a test rather than
 * spending a GPU budget, and every pattern it uses is held against its own
 * positive and negative sentences there.)
 *
 * So the predicate reads only what the content ALREADY DECLARES in structured
 * form, plus one explicit authored flag for the briefing-only cases:
 *
 *   1. `doorMirrorsInTask: true` on the template — the explicit declaration,
 *      authored where the demand lives only in the briefing (the audited row:
 *      sc-vu-pass-clearance, whose step 3 is «Огледало, мигач наляво…» and
 *      whose examiner line grades «огледало и мигач преди отместването»).
 *      ROUND 2 (2026-09-23): the audited row was one member of a CLASS — 25
 *      templates demand the door-mirror check only in prose (a lane change, an
 *      overtake, pulling in to the right, moving off from the kerb, a named
 *      лявото/дясното огледало). Each now carries the flag with its demanding
 *      sentence quoted beside it, and the catalogue test holds the class both
 *      ways: every lesson whose briefing demands the check is flagged by some
 *      channel, and every explicit flag stands on such a sentence.
 *   2. a mistake demo coded LANE_CHANGE_WITHOUT_MIRROR_CHECK — the drill
 *      DEMONSTRATES the missed mirror check, so the mirror is its subject.
 *   3. a rubric OBSERVATION MOMENT that names a DOOR mirror — an authored,
 *      graded glance the student is scored on (`observation.ts` maps glance
 *      events onto these moments). Read off the moment's own title
 *      (`momentNamesDoorMirror`): a moment that names only a shoulder, the
 *      blind spot or a look through the windscreen does not count, and neither
 *      does one that names the INTERIOR mirror («Огледало назад, преди да
 *      отпуснеш газта» — sc-merge-bus-pullout — is a look BEHIND before
 *      slowing, and the interior glass is live on every tier already).
 *
 * RUNG-INVARIANT BY CONSTRUCTION: channel 3 reads the template's rubric and
 * every rung's, so every rung of a drill gets the same answer. A flag that
 * differed between rungs would show up as a „rung difference" in the level
 * seam (doc 86 S4) without making any rung harder.
 */

import type { ScenarioSpec } from "./types";

/** The rule code whose demonstration makes the mirror the drill's subject. */
export const MIRROR_CHECK_CODE = "LANE_CHANGE_WITHOUT_MIRROR_CHECK";

/** A mirror noun (огледало / огледала / огледалото…). Shoulder and blind-spot
 *  moments are deliberately NOT matched by it: the glass does not show them
 *  (observation.ts `momentRequiresShoulder`). */
const MIRROR_NOUN_RE = /огледал/iu;
/** The INTERIOR mirror, by the names the catalogue gives it: «огледалото за
 *  задно/обратно виждане», «вътрешното огледало», and «огледало назад» (a look
 *  straight behind, not beside). */
const INTERIOR_MIRROR_RE = /за\s+(?:задно|обратно)\s+виждане|вътрешн\S*\s+огледал|огледал\S*\s+назад/iu;
/** A door mirror NAMED: «ляво/дясното огледало», or the plural «огледала(та)» —
 *  the set, which is the doors plus the interior. */
const DOOR_MIRROR_NAMED_RE = /(?:ляв|дясн)\S*\s+огледал|огледала/iu;
/** A sideways manoeuvre the mirror look is for — the look that only a DOOR
 *  mirror can answer (moving off, a lane change, pulling out or back in, the
 *  shoulder/blind-spot pairing). */
const LATERAL_CUE_RE = /рамо|мъртв|престро|излиз|изнас|прибир|дъга|тръгн|потегл|мигач/iu;

/**
 * Does this observation-moment title name the student's DOOR mirror? A mirror
 * noun, not the interior mirror, and either a door mirror by name or a sideways
 * manoeuvre it is looked into for.
 */
export function momentNamesDoorMirror(titleBg: string): boolean {
  if (!MIRROR_NOUN_RE.test(titleBg)) return false;
  if (INTERIOR_MIRROR_RE.test(titleBg)) return false;
  return DOOR_MIRROR_NAMED_RE.test(titleBg) || LATERAL_CUE_RE.test(titleBg);
}

export type DoorMirrorTaskSource = "declared" | "mistakeCode" | "observationMoment";

/**
 * Which structured channel says the task relies on the door mirrors, or null.
 * Returned as a reason rather than a bare boolean so a test can hold each
 * channel on its own and the catalogue audit can say WHY a lesson pays.
 */
export function doorMirrorTaskSource(spec: ScenarioSpec): DoorMirrorTaskSource | null {
  if (spec.doorMirrorsInTask === true) return "declared";
  if (spec.mistakes.some((m) => m.codeRefs.includes(MIRROR_CHECK_CODE))) return "mistakeCode";
  const rubrics = [spec.rubric, ...spec.levels.map((l) => l.rubric)];
  for (const rubric of rubrics) {
    const moments = rubric?.observation?.moments ?? [];
    if (moments.some((m) => momentNamesDoorMirror(m.titleBg))) return "observationMoment";
  }
  return null;
}

/** The boolean compileScenario writes onto `LessonSpec.doorMirrorsInTask`. */
export function scenarioUsesDoorMirrors(spec: ScenarioSpec): boolean {
  return doorMirrorTaskSource(spec) !== null;
}
