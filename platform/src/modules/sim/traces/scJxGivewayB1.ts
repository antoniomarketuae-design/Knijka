/**
 * scJxGivewayB1 — the authored drives (doc 76 §5/§9) for „Б1 не значи спри
 * винаги" (sc-jx-giveway-b1 / JU-02), the give-way CAPABILITY's shipped lesson
 * and the 150th template, on the committed generated district jxg-giveway-v1
 * (tools/maps/gen_jx_giveway.mjs).
 *
 * ONE correct shadow + TWO mistake demos. The give-way drill enables the
 * config-gated JUNCTION_SCAN_INCOMPLETE detector via the recorder's ruleConfig
 * (the per-lesson opt-in), exactly as sc-junction-scan does — so the LIVE
 * session grades a missing scan at a Б1 line too.
 *
 * The trace gate (sc-jx-giveway-b1-traces) replays exactly these through the
 * production stack:
 *   - shadow: ROLL through the CLEAR mouth 1 at a yield pace with a full
 *     ляво-дясно scan (NO full stop — the crux, Б1 ≠ „спри винаги"), then WAIT
 *     at the CONFLICTED mouth 2 for the staged priority car and cross clear →
 *     ZERO violations, YIELDED_TO_PRIORITY earned at mouth 2;
 *   - „Навлизане пред колата по главния": scan at mouth 2 but barge in front of
 *     the priority car → EXACTLY FAILED_TO_YIELD (detail "give-way");
 *   - „Излизане без пълен оглед": roll through mouth 1 WITHOUT a left/right scan
 *     → EXACTLY JUNCTION_SCAN_INCOMPLETE (never a full-stop demand — Б1 asks for
 *     none), the drive ending before mouth 2 so nothing else grades.
 *
 * Geometry pinned to content/world/jxg-giveway-v1.json (the district battery
 * proves the numbers): drawn lane center x = +4.0625 (northbound), mouth-1 Б1
 * line at y = −27.725 (jxg-n-j1 at y = 0), mouth-2 Б1 line at y = +122.275
 * (jxg-n-j2 at y = 150); spawn jxg-spawn-south at (4.06, −115) heading north.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_JX_GIVEWAY_B1 } from "../lessons/scenario/templates-junctions";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_JX_GIVEWAY_B1_ID = "sc-jx-giveway-b1";
export const SC_JX_GIVEWAY_B1_DISTRICT_ID = "jxg-giveway-v1";

/** Drawn right-lane center of jxg-giveway-v1 (northbound). */
const LANE = 4.0625;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — roll mouth 1 clear, wait at mouth 2
// ---------------------------------------------------------------------------

export function scJxGivewayB1ShadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Знак Б1 „Пропусни движението“ не значи „Спри!“. Намаляваш, оглеждаш се — и минаваш, ако е чисто.",
      },
      { kind: "glance", mirror: "rear" },
      // Approach mouth 1, easing onto the lane center.
      { kind: "drive", points: [[LANE, -115], [LANE, -42]], targetKmh: 22 },
      {
        kind: "annotation",
        textBg: "Първо кръстовище: по главния няма никого. Оглеждам се наляво-надясно и минавам ПЛАВНО, без да спирам.",
      },
      // A ROLLING ляво-дясно scan: each glance is separated by a short drive so
      // BOTH reach the rule engine (the recorder carries one pendingGlance per
      // frame), and the car never stops — the whole point of Б1.
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[LANE, -42], [LANE, -36]], targetKmh: 13 },
      { kind: "glance", mirror: "right" },
      // Cross the mouth-1 Б1 line at y = −27.725 while STILL ROLLING (stopAtEnd
      // false — the next timed step is a same-direction drive).
      { kind: "drive", points: [[LANE, -36], [LANE, -6]], targetKmh: 13 },
      { kind: "annotation", textBg: "Минах без спиране — точно това иска Б1, когато пътят е чист." },
      // Cruise north up the mid arm toward mouth 2.
      { kind: "drive", points: [[LANE, -6], [LANE, 40], [LANE, 95]], targetKmh: 22 },
      {
        kind: "annotation",
        textBg: "Второ кръстовище: отдясно по булеварда идва кола с предимство. Тук спирам и я пропускам.",
      },
      // Fresh ляво-дясно scan on the approach, easing to a yield crawl BEFORE
      // the mouth-2 line (y = 122.275): stops at the yield pose (a pause next).
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[LANE, 95], [LANE, 108]], targetKmh: 10 },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[LANE, 108], [LANE, 118]], targetKmh: 6 },
      { kind: "annotation", textBg: "Пълно спиране преди линията — тук е задължително, защото иначе бих я засякъл." },
      { kind: "pause", sec: 9, brake: true },
      { kind: "annotation", textBg: "Колата по главния премина. Пътят е чист — потеглям с нов оглед." },
      // Fresh scan after the wait (the approach glances are now stale), then
      // roll across the mouth-2 line and on through the junction to the exit.
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[LANE, 118], [LANE, 120]], targetKmh: 6 },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[LANE, 120], [LANE, 150], [LANE, 185]], targetKmh: 16 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Б1: пропусни, не спирай напразно — но когато има кола с предимство, пропусни я наистина.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake 1 — „Навлизане пред колата по главния" (FAILED_TO_YIELD)
// ---------------------------------------------------------------------------

export function scJxGivewayB1MistakeBargeScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: на второто кръстовище водачът се оглежда, ВИЖДА колата с предимство — и въпреки това влиза пред нея.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE, -115], [LANE, -42]], targetKmh: 24 },
      // Mouth 1 clean: a proper rolling scan (so the ONLY graded fault is at
      // mouth 2 — the demo isolates the yield failure).
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[LANE, -42], [LANE, -36]], targetKmh: 15 },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[LANE, -36], [LANE, -6]], targetKmh: 15 },
      { kind: "drive", points: [[LANE, -6], [LANE, 40], [LANE, 74]], targetKmh: 24 },
      { kind: "annotation", textBg: "Оглежда се — но не отстъпва. „Ще успея“ пред кола на секунди е отнето предимство." },
      // Approach mouth 2 at a steady yield-ish pace so the priority car syncs
      // right into its node, with a FRESH ляво-дясно scan close to the line
      // (so the ONLY graded fault is the yield failure)…
      { kind: "drive", points: [[LANE, 74], [LANE, 103]], targetKmh: 14 },
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[LANE, 103], [LANE, 113]], targetKmh: 14 },
      { kind: "glance", mirror: "right" },
      // …then ROLL across the Б1 line WITHOUT stopping, straight in front of the
      // priority car (still within the mouth's conflict radius) — the „ще се
      // промъкна" that forces it to brake: FAILED_TO_YIELD (detail give-way).
      {
        kind: "drive",
        points: [[LANE, 113], [LANE, 124], [LANE, 150], [LANE, 180]],
        targetKmh: 14,
        stopAtEnd: false,
      },
      { kind: "pause", sec: 2, brake: true },
      {
        kind: "annotation",
        textBg: "Колата по главния трябваше да спре заради теб. Б1 значи ПРОПУСНИ — не „мини, ако смяташ, че ще успееш“.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake 2 — „Излизане без пълен оглед в двете посоки" (JUNCTION_SCAN_INCOMPLETE)
// ---------------------------------------------------------------------------

export function scJxGivewayB1MistakeNoScanScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: влиза през първия Б1, без да се огледа наляво-надясно. Не спираш винаги — но ОГЛЕЖДАШ винаги.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE, -115], [LANE, -42]], targetKmh: 22 },
      { kind: "annotation", textBg: "Минава през кръстовището, без нито един поглед към пътя с предимство." },
      // Roll through the mouth-1 Б1 line (y = −27.725) with NO left/right glance
      // → JUNCTION_SCAN_INCOMPLETE. No full stop, so no full-stop demand fires.
      { kind: "drive", points: [[LANE, -42], [LANE, -6]], targetKmh: 13 },
      // Drive on a little and stop WELL short of mouth 2 (its line is at
      // y = 122.275): the priority runner never arms (armDistM 70), so nothing
      // else can grade — the demo is exactly one missing scan.
      { kind: "drive", points: [[LANE, -6], [LANE, 30], [LANE, 55]], targetKmh: 20 },
      { kind: "pause", sec: 2, brake: true },
      {
        kind: "annotation",
        textBg: "Един поглед не стига — а тук нямаше нито един. При Б1 се оглеждаш наляво и надясно, преди да навлезеш.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScJxGivewayB1TraceName = "shadow-correct" | "mistake-barge-priority" | "mistake-no-scan";

interface JxGivewayRecordingSpec {
  kind: "shadow" | "mistake";
  script: () => DriveScript;
}

const STAGED: StagedEventSpec[] = [...(SC_JX_GIVEWAY_B1.staged ?? [])] as StagedEventSpec[];

export const SC_JX_GIVEWAY_B1_RECORDINGS: Record<ScJxGivewayB1TraceName, JxGivewayRecordingSpec> = {
  "shadow-correct": { kind: "shadow", script: scJxGivewayB1ShadowScript },
  "mistake-barge-priority": { kind: "mistake", script: scJxGivewayB1MistakeBargeScript },
  "mistake-no-scan": { kind: "mistake", script: scJxGivewayB1MistakeNoScanScript },
};

/** Trace names in committed order (shadow first). */
export function scJxGivewayB1TraceNames(): ScJxGivewayB1TraceName[] {
  return Object.keys(SC_JX_GIVEWAY_B1_RECORDINGS) as ScJxGivewayB1TraceName[];
}

/**
 * Record one drive against ITS loaded district document — the give-way drill
 * ENABLED via ruleConfig (the config-gated JUNCTION_SCAN_INCOMPLETE opt-in),
 * ambient traffic zero, staged events from the template. Deterministic: same
 * district → same trace (seed 7, the house recording seed; rule config does not
 * affect the serialized trace bytes).
 */
export function recordScJxGivewayB1Drive(
  districtRaw: unknown,
  name: ScJxGivewayB1TraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const rec = SC_JX_GIVEWAY_B1_RECORDINGS[name];
  if (!rec) throw new Error(`recordScJxGivewayB1Drive: no drive "${name}"`);
  return recordScriptedDrive(districtRaw, rec.script(), {
    scenarioId: SC_JX_GIVEWAY_B1_ID,
    kind: rec.kind,
    seed: 7,
    stagedEvents: STAGED,
    ruleConfig: { junctionScanObservationEnabled: true },
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
