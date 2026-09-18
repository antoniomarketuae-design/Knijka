/**
 * WHICH CODES A `ruleConfig` KEY ARMS — the one table that says it (ADR-009,
 * founder Ruling A, 2026-09-17; doc `docs/simulation/92_ADR009_LESSON_MISTAKE_SPEC.md` §3.3).
 *
 * A scenario template that writes `needlessStopEnabled: true` is not tuning a
 * tolerance. It is turning a detector ON so that the student's own attempt
 * grades the fault the lesson teaches — `compile.ts` says exactly that where it
 * carries the key onto the compiled lesson («carry the detector opt-in to the
 * LIVE session so the student's own attempt grades the taught fault»). That is
 * the second of ADR-009's two target sources (doc 92 §2.1 source A): it is the
 * only evidence for five codes that appear on no mistake demo at all —
 * `sc-follow-standstill` CLOSING_ON_LEAD_TOO_FAST, `sc-follow-tailgater` and
 * `sc-jx-priority-confidence` STOPPED_WITHOUT_CAUSE, `sc-ed-poligon-chain`
 * MOVE_OFF_WITHOUT_OBSERVATION, `sc-fo-motorway-gap`
 * FOLLOWING_TOO_CLOSE_FOR_RAIN (doc 92 §2.3 R4).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE CLASSIFICATION IS KEYED ON THE VALUE, NEVER ON THE NAME.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * The derived design keyed "does this key arm a detector?" on the suffix
 * `…Enabled`, and judge J3 rejected it (doc 92 §1 fix 8). The refutation is in
 * this repository's own data and not hypothetical: `townCrawlEnabled` is named
 * exactly like the seven arming keys, and its `DEFAULT_RULE_CONFIG` value is
 * `true`. `sc-ac-ice` authors `townCrawlEnabled: false` — it DISARMS a detector
 * that ships on. A naming rule would have read that lesson as arming one, and
 * ADR-009 would have hung a "the lesson is not taken" verdict on a detector the
 * template had just switched off.
 *
 * So the rule is a value: a key ARMS iff `DEFAULT_RULE_CONFIG[key] === false`
 * and the compiled value is `true`. The two tables below are the classification
 * of every key any of the 167 templates actually authors; the test that owns
 * them (T8b, `lessons/scenario/__tests__/lesson-mistake-targets.test.ts`) checks
 * the tables against `DEFAULT_RULE_CONFIG` BY VALUE and fails on an authored key
 * that is in neither — so a new key cannot ship unclassified, and cannot be
 * classified by how it is spelled.
 *
 * WHAT THIS TABLE IS NOT. It does not claim to be the list of every `ruleConfig`
 * key the rules engine gates a detector on; it is the list of keys whose default
 * is `false`, i.e. the keys a template can turn ON. A tolerance key (`followMinSpeedKmh`,
 * `harshBrakeDecelMps2`, `hesitationClearGapM`, `conditionSpeedNightFactor`) can
 * make an already-armed detector fire sooner or later, and doc 92 §2.3 R7 rules
 * that a tuned or disarmed detector is never an ADR-009 target. That is why they
 * are listed separately rather than left out: "not here" would be indistinguishable
 * from "nobody has looked at it yet".
 */

import { DEFAULT_RULE_CONFIG, type RuleEngineConfig, type ViolationCode } from "./types";

/**
 * A `ruleConfig` key whose `DEFAULT_RULE_CONFIG` value is `false` → the codes it
 * puts in play when a template compiles it to `true`.
 *
 * Every row's key must have a `false` default (checked by value in T8b) and
 * every code must be a catalogue row (also T8b — the type says `ViolationCode`,
 * but a type is not a runtime check and this repository has shipped guards that
 * could not fail).
 *
 * EACH ROW WAS READ OFF THE GATE, not inherited (doc 92 §3.3 shipped this table
 * with «the detector gate lines in rules/engine.ts … were not re-verified»).
 * Line numbers are `rules/engine.ts` at a51a1ef, and the two rows where a
 * NEIGHBOURING code sits close enough to be mistaken for part of the gate are
 * called out, because that is the mistake this list could plausibly contain:
 *
 *   handbrakeMoveOffEnabled        :3454 → HANDBRAKE_LEFT_ON
 *   moveOffObservationEnabled      :3032 → MOVE_OFF_WITHOUT_OBSERVATION
 *                                          (ENGINE_STALLED at :3052 is OUTSIDE
 *                                          the gate — a stall is billed whether
 *                                          or not the drill watches the glances)
 *   leadClosingEnabled             :3957 → CLOSING_ON_LEAD_TOO_FAST (:3968)
 *   followRainAwareEnabled         :3984 → FOLLOWING_TOO_CLOSE_FOR_RAIN (:3993)
 *   needlessStopEnabled            :4480 → STOPPED_WITHOUT_CAUSE
 *   junctionScanObservationEnabled :5811 → JUNCTION_SCAN_INCOMPLETE, through
 *                                          `scanIncomplete()`, on the Б1 and Б2
 *                                          branches alike
 *   turnObservationEnabled         :5875 → TURN_WITHOUT_OBSERVATION
 *                                          (WRONG_LANE_FOR_DIRECTION at :5894 is
 *                                          OUTSIDE — the M10 arrow check is
 *                                          gated on nothing)
 */
export const DETECTOR_OPT_IN_CODES: Readonly<
  Partial<Record<keyof RuleEngineConfig, readonly ViolationCode[]>>
> = {
  handbrakeMoveOffEnabled: ["HANDBRAKE_LEFT_ON"],
  moveOffObservationEnabled: ["MOVE_OFF_WITHOUT_OBSERVATION"],
  leadClosingEnabled: ["CLOSING_ON_LEAD_TOO_FAST"],
  followRainAwareEnabled: ["FOLLOWING_TOO_CLOSE_FOR_RAIN"],
  needlessStopEnabled: ["STOPPED_WITHOUT_CAUSE"],
  junctionScanObservationEnabled: ["JUNCTION_SCAN_INCOMPLETE"],
  turnObservationEnabled: ["TURN_WITHOUT_OBSERVATION"],
};

/**
 * Keys a template authors that TUNE or DISARM rather than arm — their defaults
 * are not `false`, so no code enters ADR-009's target set through them (doc 92
 * §2.3 R7: `sc-ac-ice` `townCrawlEnabled: false`, `sc-hz-emergency-stop` and
 * `sc-hz-brake-dont-swerve` `harshBrakeDecelMps2: 25`, `sc-jx-blocked-exit`
 * `hesitationClearGapM: 63`, `sc-ac-night-overdrive` `conditionSpeedNightFactor:
 * 0.65`, `sc-follow-truck` `followMinSpeedKmh: 10`).
 *
 * This set exists so that "unclassified" is a state T8b can detect. Without it,
 * a key missing from `DETECTOR_OPT_IN_CODES` would read as "correctly not an
 * arming key" and a genuinely new arming key would ship silent.
 */
export const NON_ARMING_RULE_CONFIG_KEYS: ReadonlySet<keyof RuleEngineConfig> = new Set([
  "followMinSpeedKmh",
  "townCrawlEnabled",
  "conditionSpeedNightFactor",
  "harshBrakeDecelMps2",
  "hesitationClearGapM",
]);

/**
 * THE classification predicate — the only place "this key arms a detector" is
 * decided, and it reads `DEFAULT_RULE_CONFIG`, never the key's spelling.
 *
 * `compiled === true` alone is not enough: `townCrawlEnabled: true` is the
 * default, so a template writing it changes nothing and arms nothing.
 */
export function armsDetector(key: keyof RuleEngineConfig, compiled: unknown): boolean {
  return DEFAULT_RULE_CONFIG[key] === false && compiled === true;
}
