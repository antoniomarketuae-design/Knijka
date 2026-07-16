/**
 * Maps a rule-engine catalog code (rules/catalog.ts) to the scenario event it
 * belongs to, so the teach-first-then-grade coach can key encounters by
 * scenario rather than by individual detector. Codes with no scenario event
 * (pre-drive procedure, raw vehicle-control slips) return null and are coached
 * by their own code as the key.
 */

const CODE_TO_SCENARIO: Record<string, string> = {
  SPEEDING_OVER_LIMIT: "ev-speed-limit",
  SPEEDING_DANGEROUS: "ev-speed-limit",
  RED_LIGHT_CROSSED: "ev-junction-signalized",
  STOP_SIGN_NO_FULL_STOP: "ev-stop-sign",
  TURN_WITHOUT_INDICATOR: "ev-signaling-discipline",
  LANE_CHANGE_WITHOUT_INDICATOR: "ev-lane-change",
  LANE_CHANGE_WITHOUT_MIRROR_CHECK: "ev-lane-change",
  SEATBELT_OFF_WHILE_MOVING: "ev-seatbelt",
  HEADLIGHTS_OFF_AT_NIGHT: "ev-lights-usage",
  HEADLIGHTS_OFF_IN_RAIN: "ev-adverse-weather",
  SPEED_TOO_FAST_FOR_CONDITIONS: "ev-speed-for-conditions",
  FOLLOWING_TOO_CLOSE: "ev-following-distance",
  WRONG_WAY: "ev-sign-prohibitory",
  NOT_KEEPING_RIGHT: "ev-lane-discipline",
  FAILED_TO_YIELD: "ev-junction-priority-sign",
  PEDESTRIAN_CROSSING_TOO_FAST: "ev-ped-crossing-marked",
  PEDESTRIAN_NOT_YIELDED: "ev-ped-crossing-marked",
  COLLISION: "ev-collision",
  POOR_LANE_KEEPING: "ev-lane-discipline",
  // B1a Wave-2 detector pack (doc 72 capability 1)
  STANDSTILL_GAP_TOO_CLOSE: "ev-following-distance",
  HIGH_BEAM_NOT_DIPPED: "ev-lights-usage",
  OVERTAKING_AT_CROSSING: "ev-ped-crossing-marked",
};

/** Scenario event id for a catalog code, or null when it maps to no scenario. */
export function scenarioForCode(code: string): string | null {
  return CODE_TO_SCENARIO[code] ?? null;
}
