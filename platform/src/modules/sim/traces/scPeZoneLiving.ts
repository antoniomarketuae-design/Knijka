/**
 * sc-pe-zone-living — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Жилищна зона — гостите са пешеходците" (PE-15 +
 * PE-02) on the committed pe-zone-v1 district, recorded with the template's OWN
 * staged actor (the west-curb walker — single truth, imported from the
 * template; the east walker is an L5-only stagedAdd and is NOT recorded).
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + PEDESTRIAN_YIELDED — shed the 50 BEFORE the
 *     Д15 entry, held walking-pace-plus through the whole zone, stopped for the
 *     people on the road, waited them off it, crawled the exit mouth and only
 *     then joined the ordinary street;
 *   - „Квартална улица с 50" grades EXACTLY SPEEDING_DANGEROUS (holds ~50 in
 *     the 20 zone — 20 km/h over the 30 dangerous band — through the map's
 *     SPEED-ONLY WINDOW, then sheds and yields correctly for the walker);
 *   - „Клаксон и провиране между пешеходците" grades EXACTLY
 *     PEDESTRIAN_NOT_YIELDED (a LAWFUL 18 km/h through the occupied road: no
 *     speeding, no too-fast, no contact — the walker is still on the western
 *     half, the sc-pe-school-patrol precedent).
 *
 * Geometry pinned to content/world/pe-zone-v1.json: the street on x = 0 (right
 * lane 4.06), the Д15 entry at y = 120 (50 → 20), the unmarked crossing pz-x-1
 * at y = 215, the halt at y = 209, the Д16 exit mouth at y = 285, street end
 * y = 365.
 *
 * THE SPEED-ONLY WINDOW (why „с 50" can assert exactly one code): the crossing
 * zone arms ~35 m out (y = 180) and the walker is released at trigger 30 m
 * (y = 185) — so between the zone entry (120) and y = 180 there is NO crossing
 * event and NO pedestrian seen. The dangerous-speed episode (1 s sustain ⇒
 * ~14 m at 50 km/h) completes, and the 4.6 m/s² shed back to zone pace (~16 m)
 * finishes, well inside that 60 m window. pe-zone-districts.test asserts the
 * window as a structural invariant of the map.
 *
 * WHY „с 50" NEVER ALSO GRADES SPEEDING_OVER_LIMIT (the tuning that makes the
 * assert exact): the minor band is (22, 30] km/h sustained 2 s. It is crossed
 * TWICE and both crossings are too short to sustain — on the way up the limit
 * is still 50 (the approach segment: 50 is lawful there, no band exists), and
 * on the way down the 4.6 m/s² shed spends only ~0.5 s between 30 and 22 before
 * `speed <= 20` resets the episode outright.
 *
 * Walker timing (speedMps 1.9 from the west curb at x = −9.72, released at
 * y ≈ 185): on the carriageway ~0.85 s later, reaches the player's lane
 * (x ≈ 4.06) ~7.3 s after release, off the road at ~9.4 s, walk finished at
 * ~12.3 s. That pace is what puts her IN FRONT OF THE CAR at both decisive
 * moments (founder R0 — see ZONE_WALKER_WEST in templates-pe2): the shadow
 * comes to rest with her 6 m ahead and only 3.4 m off its own lane (she then
 * walks straight across its bonnet), and the push-through's closest approach is
 * 2.3 m instead of the old 7.4 m of empty asphalt.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_PE_ZONE_LIVING } from "../lessons/scenario/templates-pe2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_PE_ZONE_LIVING_ID = "sc-pe-zone-living";

/** Northbound right-lane center of pe-zone-v1's street. */
const X_LANE = 4.06;
/** The Д15 living-zone entry (pz-n-entry): 50 → 20. */
const Y_ENTRY = 120;
/** The staged walkers' unmarked crossing (pz-x-1). */
const Y_CROSSING = 215;
/** The compliant halt — 6 m short of the people (single truth with the spec). */
const Y_HALT = Y_CROSSING - 6;
/** The Д16 exit mouth (pz-n-exit) — the uncontrolled T onto the ordinary street. */
const Y_EXIT = 285;
/** Where the crawl to the mouth begins (17 m out — see the shadow's comment). */
const Y_CRAWL = Y_EXIT - 17;
/** The finish checkpoint (sc-pzl-out at y = 330, radius 12). */
const Y_FINISH = 332;
/** Zone speed a competent driver holds: 18 — under 20 with eye-error room. */
const ZONE_KMH = 18;
/** Approach speed on the ordinary 50 street (under the 55 grace). */
const APPROACH_KMH = 46;
/** The crawl at the exit mouth — the sc-pzl-exit gate wants <= 10. */
const MOUTH_KMH = 8;
/** Long enough to wait the walker off the carriageway (~9.4 s from release, and
 *  the halt lands ~5.5 s into her walk) — with a beat to spare, and never so
 *  long that the car sits at rest on an empty road (the founder's „stopped for
 *  nothing" read). The gate wants >= 8 s of rest inside y 203..215. */
const WAIT_SEC = 9;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scPeZoneLivingShadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Обикновена улица. Отпред е входът на жилищна зона — скоростта се сваля ПРЕДИ знака, не след него.",
      },
      { kind: "glance", mirror: "rear" },
      // The ordinary 50 street, lawfully.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 55], [X_LANE, 95]], targetKmh: APPROACH_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Знак Д15: жилищна зона. Таванът става 20 км/ч — пешеходно темпо." },
      // Shed the city speed BEFORE the entry at y = 120 — the whole lesson of
      // the зона regime (and the sc-pzl-zone gate at y = 150, <= 20).
      { kind: "drive", points: [[X_LANE, 95], [X_LANE, 118]], targetKmh: ZONE_KMH, stopAtEnd: false },
      {
        kind: "annotation",
        textBg: "Вътре няма тротоар и няма пътеки: цялото платно е на хората. Ти си гостът тук.",
      },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_LANE, 118], [X_LANE, 175]], targetKmh: ZONE_KMH, stopAtEnd: false },
      {
        kind: "annotation",
        textBg: "Хора излизат на платното пред теб. Те не нарушават нищо — тук предимството е тяхно.",
      },
      // Stop 6 m short of the people — where чл. 61–62 puts you, and where the
      // graded halt objective sits (single truth with the spec).
      { kind: "drive", points: [[X_LANE, 175], [X_LANE, Y_HALT]], targetKmh: ZONE_KMH },
      { kind: "pause", sec: WAIT_SEC, brake: true },
      {
        kind: "annotation",
        textBg: "Без клаксон и без провиране: изчакваш ги да минат. Няма къде да се приберат — тротоар няма.",
      },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Платното е чисто — продължи със същите 20 до края на зоната." },
      // Shed to the crawl at Y_CRAWL, not at the mouth itself: at 4.6 m/s² the
      // 18 → 8 shed eats ~3.5 m, so starting it 17 m out is what puts the car
      // at crawl speed THROUGHOUT the sc-pzl-exit gate (y 272..282), instead of
      // arriving at the mouth still braking.
      { kind: "drive", points: [[X_LANE, Y_HALT], [X_LANE, 250], [X_LANE, Y_CRAWL]], targetKmh: ZONE_KMH, stopAtEnd: false },
      {
        kind: "annotation",
        textBg: "Знак Д16 — краят на зоната. Излизането е включване в движението: нямаш никакво предимство.",
      },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      // Crawl the mouth, then join the ordinary street.
      { kind: "drive", points: [[X_LANE, Y_CRAWL], [X_LANE, Y_EXIT + 6]], targetKmh: MOUTH_KMH, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, Y_EXIT + 6], [X_LANE, 320], [X_LANE, Y_FINISH]], targetKmh: 44 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Точно така: 20 през цялата зона, спиране за хората, пълзящ и оглеждащ се изход.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Квартална улица с 50" (SPEEDING_DANGEROUS)
// ---------------------------------------------------------------------------

export function scPeZoneLivingMistakeCitySpeedScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: „това е просто квартална уличка“ — водачът влиза в зоната, без изобщо да намали.",
      },
      { kind: "glance", mirror: "rear" },
      // Lawful on the 50 approach (grace 55) — nothing grades before the entry.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 55], [X_LANE, 118]], targetKmh: 50, stopAtEnd: false },
      { kind: "annotation", textBg: "Знакът казва 20. Колата минава с 50 — двойно над тавана, тоест опасна грешка." },
      // ~50 km/h held from the entry (120) to y = 160: the limit is 20 here, so
      // the 30 dangerous band is breached instantly and the 1 s sustain lands at
      // ~y = 134 — deep inside the SPEED-ONLY WINDOW (120..180), with no walker
      // on the road yet and no crossing event to contaminate the episode.
      { kind: "drive", points: [[X_LANE, 118], [X_LANE, 160]], targetKmh: 50, stopAtEnd: false },
      {
        kind: "annotation",
        textBg: "От 50 км/ч спирачният път е ~27 м. Дете иззад паркирана кола излиза на два.",
      },
      // Shed to zone pace INSIDE the window (~16 m at 4.6 m/s²), so the walker
      // is met lawfully: this demo isolates the SPEED, not the yield.
      { kind: "drive", points: [[X_LANE, 160], [X_LANE, 178]], targetKmh: ZONE_KMH, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 178], [X_LANE, Y_HALT]], targetKmh: ZONE_KMH },
      { kind: "pause", sec: WAIT_SEC, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[X_LANE, Y_HALT], [X_LANE, 250], [X_LANE, Y_CRAWL]], targetKmh: ZONE_KMH, stopAtEnd: false },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_LANE, Y_CRAWL], [X_LANE, Y_EXIT + 6]], targetKmh: MOUTH_KMH, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, Y_EXIT + 6], [X_LANE, 320], [X_LANE, Y_FINISH]], targetKmh: 44 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Намали и пропусна хората — този път. Но безопасността в жилищната зона се решава на входа ѝ, не пред пешеходеца.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Клаксон и провиране" (PEDESTRIAN_NOT_YIELDED)
// ---------------------------------------------------------------------------

export function scPeZoneLivingMistakePushThroughScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: „те ще се дръпнат“ — скоростта е законна, но колата не спира за хората на платното.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 55], [X_LANE, 95]], targetKmh: APPROACH_KMH, stopAtEnd: false },
      // The ONLY fault this demo shows is the refusal to yield: the zone speed
      // itself is lawful the whole way (18 in a 20), so nothing else can grade.
      { kind: "drive", points: [[X_LANE, 95], [X_LANE, 118]], targetKmh: ZONE_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Хората са на платното — а колата само подава клаксон и продължава…" },
      {
        // Straight past the people at a lawful 18: the walker is on the WESTERN
        // half (~7 m away) — pure „непропускане", no contact, no too-fast.
        kind: "drive",
        points: [[X_LANE, 118], [X_LANE, 175], [X_LANE, 250], [X_LANE, Y_CRAWL]],
        targetKmh: ZONE_KMH,
        stopAtEnd: false,
      },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_LANE, Y_CRAWL], [X_LANE, Y_EXIT + 6]], targetKmh: MOUTH_KMH, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, Y_EXIT + 6], [X_LANE, 320], [X_LANE, Y_FINISH]], targetKmh: 44 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "В жилищната зона платното е на пешеходеца (чл. 61–62). Клаксонът не му отнема предимството — това е непропускане на пешеходец.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScPeZoneLivingTraceName =
  | "shadow-correct"
  | "mistake-city-speed"
  | "mistake-push-through";

const SCRIPTS: Record<
  ScPeZoneLivingTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scPeZoneLivingShadowScript },
  "mistake-city-speed": { kind: "mistake", script: scPeZoneLivingMistakeCitySpeedScript },
  "mistake-push-through": { kind: "mistake", script: scPeZoneLivingMistakePushThroughScript },
};

/**
 * Record one of the three drives against a loaded pe-zone-v1 document — the
 * TEMPLATE's staged west walker armed (single truth; the east walker is an
 * L5-only rung addition and never enters a recording), ambient traffic zero.
 * Deterministic: same district → same trace.
 */
export function recordScPeZoneLivingDrive(
  districtRaw: unknown,
  name: ScPeZoneLivingTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_PE_ZONE_LIVING_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_PE_ZONE_LIVING.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
