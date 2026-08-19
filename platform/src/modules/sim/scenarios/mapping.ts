/**
 * Maps a rule-engine catalog code (rules/catalog.ts) to the scenario event it
 * belongs to, so the coach can pick the mini-lesson by scenario rather than by
 * individual detector. Codes with no scenario event (pre-drive procedure, raw
 * vehicle-control slips) return null and are taught by their own code.
 *
 * TWO QUESTIONS, TWO TABLES — and they were one table until 2026-08-19.
 * "Which lesson teaches this?" is the table below: it is MANY-TO-ONE on
 * purpose, because one lesson really does teach several faults. "Is this the
 * same mistake as the last one?" is `CODE_TO_REPEAT_FAMILY` further down, and
 * answering it out of the first table charged a student a repeat for a mistake
 * he had made once — see that block for the measurement.
 */

const CODE_TO_SCENARIO: Record<string, string> = {
  SPEEDING_OVER_LIMIT: "ev-speed-limit",
  SPEEDING_DANGEROUS: "ev-speed-limit",
  RED_LIGHT_CROSSED: "ev-junction-signalized",
  STOP_SIGN_NO_FULL_STOP: "ev-stop-sign",
  TURN_WITHOUT_INDICATOR: "ev-signaling-discipline",
  // M-17: the observation duty belongs to the manoeuvre, not to the signal;
  // the arrow offence is a lane-choice fault, which is what the reel teaches.
  TURN_WITHOUT_OBSERVATION: "ev-lane-change",
  WRONG_LANE_FOR_DIRECTION: "ev-lane-discipline",
  LANE_CHANGE_WITHOUT_INDICATOR: "ev-lane-change",
  LANE_CHANGE_WITHOUT_MIRROR_CHECK: "ev-lane-change",
  SEATBELT_OFF_WHILE_MOVING: "ev-seatbelt",
  HEADLIGHTS_OFF_AT_NIGHT: "ev-lights-usage",
  HEADLIGHTS_OFF_IN_RAIN: "ev-adverse-weather",
  FOG_LIGHTS_OFF_IN_FOG: "ev-lights-usage",
  SPEED_TOO_FAST_FOR_CONDITIONS: "ev-speed-for-conditions",
  FOLLOWING_TOO_CLOSE: "ev-following-distance",
  WRONG_WAY: "ev-sign-prohibitory",
  NOT_KEEPING_RIGHT: "ev-lane-discipline",
  FAILED_TO_YIELD: "ev-junction-priority-sign",
  EMERGENCY_NOT_YIELDED: "ev-emergency-vehicle",
  PEDESTRIAN_CROSSING_TOO_FAST: "ev-ped-crossing-marked",
  PEDESTRIAN_NOT_YIELDED: "ev-ped-crossing-marked",
  COLLISION: "ev-collision",
  POOR_LANE_KEEPING: "ev-lane-discipline",
  // B1a Wave-2 detector pack (doc 72 capability 1)
  STANDSTILL_GAP_TOO_CLOSE: "ev-following-distance",
  HIGH_BEAM_NOT_DIPPED: "ev-lights-usage",
  OVERTAKING_AT_CROSSING: "ev-ped-crossing-marked",
  // B1a Wave-3 detector pack (doc 72 capability 1)
  JUNCTION_SCAN_INCOMPLETE: "ev-stop-sign",
  FOLLOWING_TOO_CLOSE_FOR_RAIN: "ev-following-distance",
  CLOSING_ON_LEAD_TOO_FAST: "ev-following-distance",
  // ZONE-BAN data layer (ADR-006 stage 2a)
  ILLEGAL_STOP_IN_BAN_ZONE: "ev-illegal-stop-zone",
  OVERTAKING_IN_BAN_ZONE: "ev-overtake",
  // LINE TYPES + BUS LANES (ADR-006 stage 2b)
  CROSSED_SOLID_LINE: "ev-markings-response",
  DRIVING_IN_BUS_LANE: "ev-lane-discipline",
  // RAIL PACK slice 1 (ADR-006 stage 3a)
  RAIL_CROSSING_VIOLATION: "ev-railway-crossing",
  // CURVE-ENVELOPE slice (doc 72 SP-05) — the library event explicitly lists
  // curve geometry among its detections („в завой карай осезаемо по-бавно").
  SPEED_TOO_FAST_FOR_CURVE: "ev-speed-for-conditions",
  // MOTORWAY-SEGMENT slice (doc 72 SP-10) — ev-speed-limit explicitly covers
  // „don't crawl below a posted minimum"; the emergency-lane ban is the lane-
  // legality discipline (which lane may be travelled — ev-lane-discipline).
  DRIVING_TOO_SLOW_FOR_MOTORWAY: "ev-speed-limit",
  EMERGENCY_LANE_DRIVING: "ev-lane-discipline",
};

/** Scenario event id for a catalog code, or null when it maps to no scenario. */
export function scenarioForCode(code: string): string | null {
  return CODE_TO_SCENARIO[code] ?? null;
}

// ---------------------------------------------------------------------------
// The repeat family — «повторна грешка» is decided on THIS, not on the scenario
// ---------------------------------------------------------------------------

/**
 * WHY THIS TABLE EXISTS. `coach.ts encounterKey` used to count encounters on
 * the scenario id above, and the table above is many-to-one: 25 of the 37
 * mapped codes share an event with at least one other code, across 8 events.
 * So the SECOND of two DIFFERENT faults taught by the same lesson landed on
 * the first one's counter and was billed «ПОВТОРНА ГРЕШКА ×1.5».
 *
 * MEASURED 2026-08-18 on `sc-zebra-approach` driven wrong at 59 км/ч — the
 * lesson the whole audit uses as ground truth
 * (`.audit-frames/sweep161/sc-zebra-approach/pc-wrong/`): «Твърде бързо
 * приближаване към пешеходна пътека» (опасна, 10) then «Непропускане на
 * пешеходец» (опасна, 10) — two different faults, both mapped to
 * `ev-ped-crossing-marked` — printed «Тренировъчен резултат: 25 наказателни
 * т.» against an official 20, the extra 5 being a ×1.5 on a mistake made once.
 *
 * BLAST RADIUS, measured twice rather than argued. Of the 348 drives in
 * `.audit-frames/sweep161` that reached a debrief, 23 carry two or more
 * DISTINCT faults under one lesson and are repriced: 14 × the zebra pair,
 * 7 × индикатор+огледало on one lane change, 5 × lane-discipline mixes,
 * 2 × „не спрях на Б2" + „не огледах". Of the 298 RECORDED drives in
 * `content/traces` replayed through the coach, 3 change — all in the same
 * direction, −7 official points in total, and every one a case where the
 * student had not repeated himself: `sc-ln-turn-lane-arrows` late-two-lanes
 * (9 → 6 official, 13.5 → 6 training) and left-from-through (1 → 0), and
 * `sc-rb-lane-choice` exit-across-outer (23 → 20, the опасна rows untouched).
 * NOT ONE drive gained an escalation, and none lost one it had earned: in the
 * only drive that loses escalations, each fault's second occurrence is its
 * FIRST graded pass, which the ladder prices at ×1.0 by design (policy.ts).
 *
 * WHAT POOLS HERE, AND THE TEST THAT DECIDES IT. A row belongs in this table
 * only when two codes are THE SAME PHYSICAL ERROR MEASURED AGAINST A DIFFERENT
 * BAR — same primary duty in ЗДвП, one threshold apart — so that a student
 * told „ти го направи пак" would agree. Everything else keys on its own code
 * (the `?? code` fallback), which is the answer for 32 of the 37 mapped codes
 * and for every unmapped one.
 *
 * Judged against that test, and NOT pooled for exactly these reasons:
 *  - PEDESTRIAN_CROSSING_TOO_FAST vs PEDESTRIAN_NOT_YIELDED — same чл. 119,
 *    ал. 1, but approaching too fast and failing to give way are different
 *    errors: you can approach slowly and still not yield. Both fire on the one
 *    reference drive, which is how the bug was found.
 *  - LANE_CHANGE_WITHOUT_INDICATOR (чл. 28) vs LANE_CHANGE_WITHOUT_MIRROR_CHECK
 *    (чл. 25) — the signal and the look are two duties, and one unannounced
 *    lane change bills both.
 *  - STOP_SIGN_NO_FULL_STOP (чл. 50, ал. 1) vs JUNCTION_SCAN_INCOMPLETE
 *    (чл. 47/48) — not stopping and stopping without looking.
 *  - HEADLIGHTS_OFF_AT_NIGHT vs FOG_LIGHTS_OFF_IN_FOG (чл. 70, ал. 1 / чл. 74)
 *    — different lamps, and a foggy night with everything off bills both.
 *  - the five ev-lane-discipline codes — five citations (чл. 6 т. 1 /
 *    чл. 15 ал. 1 / чл. 15 ал. 6 / чл. 58 т. 4) for five different faults.
 *  - SPEED_TOO_FAST_FOR_CONDITIONS vs SPEED_TOO_FAST_FOR_CURVE — one чл. 20,
 *    ал. 2 duty but two independent triggers (weather vs an authored curve
 *    advisory), and a rainy bend can arm both at once.
 *  - STANDSTILL_GAP_TOO_CLOSE — Наредба № 38 приложение № 5, a standstill
 *    positioning rule, and `rules/engine.ts` says in as many words that a
 *    moving queue „is the FOLLOWING_TOO_CLOSE family's business", not its.
 *  - DRIVING_TOO_SLOW_FOR_MOTORWAY — the opposite error to speeding.
 *
 * THE LIMIT OF THIS KEY, stated so nobody reads more into a pooled row than is
 * there: the coach is time-blind (`CoachInput` carries no `t`), so a family
 * cannot tell „twice" from „once, ramping through both bars". A single
 * continuous overspeed that crosses the second-degree band and then the опасна
 * band still bills two rows and the second still reads as a repeat. That is a
 * different defect from this one — it needs a same-episode window, which needs
 * a timestamp the production caller does not pass — and it is unchanged by
 * this table in either direction.
 */
const CODE_TO_REPEAT_FAMILY: Record<string, string> = {
  // Превишена скорост: the SAME act — above the posted limit — billed at two
  // bars. `speedingBands` puts them on disjoint sides of limit + 10 км/ч
  // (rules/engine.ts), so the second is the driver going faster, not a second
  // kind of mistake. Pooled since the coach existed; kept pooled deliberately,
  // because a student taught at 55 who then reaches 70 HAS repeated himself
  // and unpooling would be a false acquittal.
  SPEEDING_OVER_LIMIT: "fault-speed-over-limit",
  SPEEDING_DANGEROUS: "fault-speed-over-limit",
  // Дистанция до предната кола: one duty (чл. 23, ал. 1 — keep a distance you
  // can stop in) measured against three bars, and `rules/engine.ts` says so
  // itself — the rain code fires only in the band the dry one leaves alone
  // („the direct analogue of SPEED_TOO_FAST_FOR_CONDITIONS"), and the closing
  // code is „the missing half", armed only below the speed floor that mutes
  // the base detector. No pair of them can bill the same frame.
  FOLLOWING_TOO_CLOSE: "fault-lead-gap",
  FOLLOWING_TOO_CLOSE_FOR_RAIN: "fault-lead-gap",
  CLOSING_ON_LEAD_TOO_FAST: "fault-lead-gap",
};

/**
 * The repeat-ladder family for a catalog code — its own code unless the
 * catalogue grades the same error at more than one bar (see above).
 *
 * Deliberately NOT null-returning: every code has a family, because every code
 * can be repeated. The scenario mapping may be absent; the identity of the
 * mistake never is.
 */
export function repeatFamilyForCode(code: string): string {
  return CODE_TO_REPEAT_FAMILY[code] ?? code;
}
