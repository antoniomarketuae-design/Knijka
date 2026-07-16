/**
 * B1b — THE EXAM BANK, authored data layer (doc 72 §16 — the combinatorial
 * contract). PURE DATA + tiny builders; no imports beyond ../contracts, so
 * specs.ts may import the painted-bay list without a module cycle.
 *
 * The bank's honesty contract (doc 72 §16, verbatim): two exams are DISTINCT
 * iff they differ in (a) route shell, (b) global conditions, (c) the
 * archetype assigned to a graded slot, or (d) a discrete parameter TIER of an
 * assigned archetype. Seed jitter does NOT count. Everything here encodes
 * exactly those four axes:
 *
 *  - ROUTE SHELLS (9): authored node-chains over district-v1.json, each
 *    machine-verified drivable (oneways honored) and официален-protocol
 *    compliant (≥3 regulated junctions, ≥5 right + ≥5 left turns, обратен
 *    завой, parking element) by lessons/__tests__/exam-bank.test.ts — the
 *    verification lives in tests exactly like exam-spec.test.ts does for
 *    lex-exam-1.
 *  - CONDITIONS (6): day/dusk/night × dry/rain (LessonSpec.environment).
 *  - SLOTS: each shell exposes 4–6 encounter slots pinned to verified
 *    geometry; a slot's options are (archetype, TIER) pairs from the
 *    stageable pool (the six shipped staged kinds) + "none".
 *  - TIERS: authored parameter classes (dart speed classes, leadSec classes,
 *    amber flipEta classes…) — pedagogically distinct encounters per doc 72
 *    (PE-08 slow crosser vs PE-02 dart; JU-02 vs JU-04 tight gap; JU-06
 *    dilemma vs committed), NOT random jitter.
 *
 * Site geometry provenance: every junction/crossing/path below is copied
 * from content/world/district-v1.json (same discipline as specs.ts); sites
 * marked [shipped] reuse the exact numbers of lessons/specs.ts or the
 * orchestrator integration suites; new sites derive with the same formulas
 * (dart curb offset = lanes·8.125/2 + 0.4 + 1.2 — validated against L4's
 * authored numbers; amber lineDistM = the runtime's derived stop-line
 * setback, re-checked by the property tests against debugStopLines()).
 */

import type {
  AmberDilemmaSpec,
  BrakingLeadCarSpec,
  CyclistRightHookSpec,
  LessonObjective,
  LessonSpec,
  ParkingBaySpec,
  PedestrianDartOutSpec,
  PriorityFromRightSpec,
  RoundaboutEntrySpec,
  StagedEventSpec,
} from "../contracts";

// ---------------------------------------------------------------------------
// Conditions axis
// ---------------------------------------------------------------------------

export interface ExamCondition {
  /** Id segment, human-shareable (D=ден, V=вечер/здрач, N=нощ; 1=сухо 2=дъжд). */
  code: string;
  labelBg: string;
  timeOfDay: "day" | "dusk" | "night";
  rain: boolean;
  /** Draw weight (real exams are mostly daytime; night/rain are the tails). */
  weight: number;
}

export const EXAM_CONDITIONS: readonly ExamCondition[] = [
  { code: "D1", labelBg: "ден, сухо", timeOfDay: "day", rain: false, weight: 4 },
  { code: "D2", labelBg: "ден, дъжд", timeOfDay: "day", rain: true, weight: 2 },
  { code: "V1", labelBg: "здрач, сухо", timeOfDay: "dusk", rain: false, weight: 1.5 },
  { code: "V2", labelBg: "здрач, дъжд", timeOfDay: "dusk", rain: true, weight: 1 },
  { code: "N1", labelBg: "нощ, сухо", timeOfDay: "night", rain: false, weight: 2 },
  { code: "N2", labelBg: "нощ, дъжд", timeOfDay: "night", rain: true, weight: 1 },
];

// ---------------------------------------------------------------------------
// Slot model
// ---------------------------------------------------------------------------

export interface ExamSlotOption {
  /** Tier key — part of the variant's distinctness key ("none" = empty slot). */
  key: string;
  /** Counts against the опасна-exposure budget (termination-class failure). */
  terminal: boolean;
  /** Taxonomy W weight driving the random draw (0 for "none" — see draw). */
  weight: number;
  /** Build the staged spec (null for "none"). `id` is the per-variant id. */
  build: ((id: string) => StagedEventSpec) | null;
}

export interface ExamSlot {
  /** Stable slot id — becomes the staged-event id inside the variant. */
  id: string;
  /** Encounter-site id (reporting + distinctness key). */
  siteId: string;
  /**
   * The route must traverse this consecutive node pair (the player approach
   * the site geometry was authored for) — asserted by the property tests.
   */
  approach?: readonly [string, string];
  options: readonly ExamSlotOption[];
}

export interface ExamRouteShell {
  /** Id segment ("A".."I"). */
  code: string;
  nameBg: string;
  descriptionBg: string;
  spawn: LessonSpec["spawn"];
  /**
   * The full drivable node chain, spawn edge → parking street. VERIFICATION
   * DATA (not shipped to the runtime): the property tests walk it against
   * district-v1.json for connectivity, turn counts, regulated junctions,
   * обратен завой and slot approaches.
   */
  routeNodes: readonly string[];
  /** "l7" = the L7/exam painted bay (single truth in specs.ts). */
  bayRef: "l7" | ParkingBaySpec;
  /** Examiner instruction for the final park objective. */
  parkTitleBg: string;
  /** Ordered examiner instructions (park objective appended by the generator). */
  objectives: readonly LessonObjective[];
  slots: readonly ExamSlot[];
}

// ---------------------------------------------------------------------------
// Bays (bay-2 „Ташев" — painted via specs.lessonParkingBaysFor)
// ---------------------------------------------------------------------------

/**
 * Curbside parallel bay on „Проф. Арх. Петър А. Ташев" (edge e988318457.0,
 * 70.9 m, lanes=2 → scaled half-width 8.125 m): mid-edge, 6.4 m right of the
 * centerline for a southwest-bound driver (same derivation as L7's bay), 32 m
 * clear of both junction mouths.
 */
export const TASHEV_BAY: ParkingBaySpec = {
  x: -404.93,
  y: -339.13,
  headingDeg: 247.5,
  widthM: 3.0,
  lengthM: 6.6,
};

/** New bays the exam bank adds to the city's painted set (L7's is already
 *  painted by the curriculum). */
export const EXAM_BANK_PARKING_BAYS: readonly ParkingBaySpec[] = [TASHEV_BAY];

// ---------------------------------------------------------------------------
// Tier tables (doc 72 archetype parameter classes — variety, not jitter)
// ---------------------------------------------------------------------------

/** PE-08 бавен пешеходец / PE-01 спокоен / PE-02 спринт. */
const DART_TIERS = [
  { key: "slow", speedMps: 0.9, triggerDistM: 30, weight: 3 },
  { key: "calm", speedMps: 1.7, triggerDistM: 32, weight: 4 },
  { key: "sprint", speedMps: 2.9, triggerDistM: 34, weight: 5 },
] as const;

/** JU-02 comfortable / JU-04 tight / JU-04-late gap at a guarded line. */
const PRIORITY_LINE_TIERS = [
  { key: "comfort", leadSec: 1.8, weight: 4 },
  { key: "tight", leadSec: 1.1, weight: 5 },
  { key: "late", leadSec: 0.7, weight: 4 },
] as const;

/** JU-01 right-hand-rule arrival classes (negative = still approaching while
 *  the player's core visit runs — the RHR adjudication window, see the
 *  orchestrator integration suite at n348207502). */
const PRIORITY_RHR_TIERS = [
  { key: "early", leadSec: -0.4, weight: 4 },
  { key: "mid", leadSec: -0.8, weight: 5 },
  { key: "late", leadSec: -1.2, weight: 4 },
] as const;

/** JU-06 amber classes: committed (proceed correct) / dilemma / comfortable
 *  stop existed (carrying on lands on red).
 *  C1 revision: dilemma was flipEtaSec 3.0 — EQUAL to the controller's 3 s
 *  yellow, so a driver who correctly committed at constant speed reached the
 *  line exactly at the red edge (RED_LIGHT_CROSSED on an innocent commit,
 *  every A1-dilemma variant; the runner's ±0.15 s jitter decided the coin).
 *  2.55 keeps the true dilemma (a comfortable stop still does not exist —
 *  the adjudicator needs ≈44 m at 45 km/h, this flips at ≈32 m) while a
 *  committed entry clears on yellow with margin even at the jitter's edge. */
const AMBER_TIERS = [
  { key: "committed", flipEtaSec: 1.6, terminal: false, weight: 3 },
  { key: "dilemma", flipEtaSec: 2.55, terminal: true, weight: 4 },
  { key: "stoppable", flipEtaSec: 4.5, terminal: true, weight: 4 },
] as const;

/** FO-02 lead-car slam classes. */
const LEAD_TIERS = [
  { key: "firm", slamDecelMps2: 5.5, followGapM: 26, weight: 4 },
  { key: "slam", slamDecelMps2: 7.5, followGapM: 22, weight: 5 },
] as const;

/** VU-01 curb cyclist / VU-06-proxy fast rider. */
const CYCLIST_TIERS = [
  { key: "slow", cruiseSpeedMps: 4.6, weight: 5 },
  { key: "fast", cruiseSpeedMps: 6.2, weight: 3 },
] as const;

/** RB-01 circulating-gap classes. */
const ROUNDABOUT_TIERS = [
  { key: "comfort", conflictLeadM: 18, weight: 4 },
  { key: "tight", conflictLeadM: 12, weight: 5 },
] as const;

// ---------------------------------------------------------------------------
// Site builders — pinned geometry, tier applied on top
// ---------------------------------------------------------------------------

const NONE: ExamSlotOption = { key: "none", terminal: false, weight: 2.5, build: null };

function dartSlot(
  slotId: string,
  siteId: string,
  approach: readonly [string, string],
  site: Omit<PedestrianDartOutSpec, "id" | "kind" | "libraryEventId" | "speedMps" | "triggerDistM" | "minTriggerSpeedKmh">,
): ExamSlot {
  return {
    id: slotId,
    siteId,
    approach,
    options: [
      NONE,
      ...DART_TIERS.map((t) => ({
        key: t.key,
        terminal: true,
        weight: t.weight,
        build: (id: string): StagedEventSpec => ({
          id,
          kind: "pedestrianDartOut",
          libraryEventId: "ev-ped-crossing-marked",
          ...site,
          speedMps: t.speedMps,
          triggerDistM: t.triggerDistM,
          minTriggerSpeedKmh: 20,
        }),
      })),
    ],
  };
}

function priorityLineSlot(
  slotId: string,
  siteId: string,
  approach: readonly [string, string],
  site: Omit<PriorityFromRightSpec, "id" | "kind" | "libraryEventId" | "leadSec">,
): ExamSlot {
  return {
    id: slotId,
    siteId,
    approach,
    options: [
      NONE,
      ...PRIORITY_LINE_TIERS.map((t) => ({
        key: t.key,
        terminal: true,
        weight: t.weight,
        build: (id: string): StagedEventSpec => ({
          id,
          kind: "priorityFromRight",
          libraryEventId: "ev-junction-priority-sign",
          ...site,
          leadSec: t.leadSec,
        }),
      })),
    ],
  };
}

function priorityRhrSlot(
  slotId: string,
  siteId: string,
  approach: readonly [string, string],
  site: Omit<PriorityFromRightSpec, "id" | "kind" | "libraryEventId" | "leadSec" | "junctionControl">,
): ExamSlot {
  return {
    id: slotId,
    siteId,
    approach,
    options: [
      NONE,
      ...PRIORITY_RHR_TIERS.map((t) => ({
        key: t.key,
        terminal: true,
        weight: t.weight,
        build: (id: string): StagedEventSpec => ({
          id,
          kind: "priorityFromRight",
          libraryEventId: "ev-junction-uncontrolled",
          junctionControl: "uncontrolled",
          ...site,
          leadSec: t.leadSec,
        }),
      })),
    ],
  };
}

function amberSlot(
  slotId: string,
  siteId: string,
  approach: readonly [string, string],
  site: Omit<AmberDilemmaSpec, "id" | "kind" | "libraryEventId" | "flipEtaSec">,
): ExamSlot {
  return {
    id: slotId,
    siteId,
    approach,
    options: [
      NONE,
      ...AMBER_TIERS.map((t) => ({
        key: t.key,
        terminal: t.terminal,
        weight: t.weight,
        build: (id: string): StagedEventSpec => ({
          id,
          kind: "amberDilemma",
          libraryEventId: "ev-junction-signalized",
          ...site,
          flipEtaSec: t.flipEtaSec,
        }),
      })),
    ],
  };
}

function leadCarSlot(
  slotId: string,
  siteId: string,
  site: Omit<BrakingLeadCarSpec, "id" | "kind" | "libraryEventId" | "slamDecelMps2" | "followGapM">,
): ExamSlot {
  return {
    id: slotId,
    siteId,
    options: [
      NONE,
      ...LEAD_TIERS.map((t) => ({
        key: t.key,
        terminal: true,
        weight: t.weight,
        build: (id: string): StagedEventSpec => ({
          id,
          kind: "brakingLeadCar",
          libraryEventId: "ev-emergency-braking",
          ...site,
          slamDecelMps2: t.slamDecelMps2,
          followGapM: t.followGapM,
        }),
      })),
    ],
  };
}

function cyclistSlot(
  slotId: string,
  siteId: string,
  approach: readonly [string, string],
  site: Omit<CyclistRightHookSpec, "id" | "kind" | "libraryEventId">,
): ExamSlot {
  return {
    id: slotId,
    siteId,
    approach,
    options: [
      NONE,
      ...CYCLIST_TIERS.map((t) => ({
        key: t.key,
        terminal: true,
        weight: t.weight,
        build: (id: string): StagedEventSpec => ({
          id,
          kind: "cyclistRightHook",
          libraryEventId: "ev-cyclist",
          ...site,
          actor: { ...site.actor, cruiseSpeedMps: t.cruiseSpeedMps },
        }),
      })),
    ],
  };
}

function roundaboutSlot(
  slotId: string,
  siteId: string,
  approach: readonly [string, string],
  site: Omit<RoundaboutEntrySpec, "id" | "kind" | "libraryEventId" | "conflictLeadM">,
): ExamSlot {
  return {
    id: slotId,
    siteId,
    approach,
    options: [
      NONE,
      ...ROUNDABOUT_TIERS.map((t) => ({
        key: t.key,
        terminal: true,
        weight: t.weight,
        build: (id: string): StagedEventSpec => ({
          id,
          kind: "roundaboutEntry",
          libraryEventId: "ev-roundabout",
          ...site,
          conflictLeadM: t.conflictLeadM,
        }),
      })),
    ],
  };
}

// ---------------------------------------------------------------------------
// Shared site geometry (pinned to district-v1.json)
// ---------------------------------------------------------------------------

/** rb-1 ring loop (counter-clockwise), shared by both entry sites [shipped]. */
const RING_LOOP = [
  "n707684255",
  "n707684256",
  "n279646956",
  "n279646958",
  "n1038574156",
  "n1038574251",
  "n707684255",
];

/** R1 — SE-mouth circulating conflict (the L3/lex-exam-1 site) [shipped]. */
const R1_SITE = {
  center: { x: -38.03, y: -342.96 },
  ringRadiusM: 19.83,
  actor: {
    pathNodes: RING_LOOP,
    hold: { nodeIndex: 0, offsetM: 0 },
    cruiseSpeedMps: 6.5,
    loop: true,
    colorIndex: 0,
  },
  entry: { x: -20.1, y: -351.4 },
  entryNodeIndex: 2,
  armDistM: 110,
  minSyncSpeedMps: 3,
  maxSyncSpeedMps: 9,
};

/** R2 — NW-mouth circulating conflict (approach from „Баку" via n279646652;
 *  dormant hold on the far (east) arc). */
const R2_SITE = {
  center: { x: -38.03, y: -342.96 },
  ringRadiusM: 19.83,
  actor: {
    pathNodes: RING_LOOP,
    hold: { nodeIndex: 3, offsetM: 0 },
    cruiseSpeedMps: 6.5,
    loop: true,
    colorIndex: 0,
  },
  entry: { x: -56.99, y: -349.94 },
  entryNodeIndex: 0,
  armDistM: 110,
  minSyncSpeedMps: 3,
  maxSyncSpeedMps: 9,
};

/** P1 — priority car from the right at the Б2-guarded n5063751788 [shipped:
 *  the L2/lex-exam-1 builder geometry verbatim]. */
const P1_SITE = {
  junction: { nodeId: "n5063751788", x: 434.54, y: 67.2 },
  actor: {
    pathNodes: [
      "n1113186267",
      "n5063751788",
      "n9601848047",
      "n6294463135",
      "n1805512602",
      "n330851787",
    ],
    hold: { nodeIndex: 1, offsetM: -75 },
    cruiseSpeedMps: 8.5,
    colorIndex: 2,
  },
  junctionNodeIndex: 1,
  armDistM: 95,
  lineDistM: 8,
  clearSpeedMps: 12.5,
};

/** P2 — right-hand-rule at the uncontrolled 4-way n348207502, player
 *  northbound [shipped: the orchestrator integration-suite geometry].
 *  C1 revision: the original path ended at n332113263 — ON the host routes
 *  (B and G both drive n348207502 → n332113263 on their return legs), and a
 *  finished staged vehicle PARKS at its path end (traffic/staged.ts), so the
 *  variant dead-ended behind a mid-lane roadblock (both C1 bots stuck at
 *  (318.9, −269.0), 11 m behind the node). The car now exits NORTH through
 *  the Б2 corridor and parks west of n331942490 at n2349242518 — B1's
 *  shipped, lane-graph-proven off-route terminus (off B and G entirely; the
 *  approach arm, hold and junction crossing are unchanged, so the RHR
 *  encounter geometry is identical). */
const P2_SITE = {
  junction: { nodeId: "n348207502", x: 389.21, y: -271.99 },
  actor: {
    pathNodes: [
      "n179974491",
      "n348207502",
      "n8585786884",
      "n415950074",
      "n331942486",
      "n331942490",
      "n2349242518",
    ],
    hold: { nodeIndex: 1, offsetM: -60 },
    cruiseSpeedMps: 8.5,
    colorIndex: 2,
  },
  junctionNodeIndex: 1,
  armDistM: 90,
  lineDistM: 16,
  clearSpeedMps: 12.5,
};

/** P3e — right-hand-rule at the uncontrolled 4-way n316786266 („Боян
 *  Каменов" × „Брадистилов"), player EASTBOUND on Каменов; the car arrives
 *  from the SE Брадистилов arm (the player's right). */
const P3E_SITE = {
  junction: { nodeId: "n316786266", x: -146.49, y: -49.42 },
  actor: {
    pathNodes: ["n316786265", "n8585789858", "n8585789857", "n316786266", "n10579367462"],
    hold: { nodeIndex: 3, offsetM: -45 },
    cruiseSpeedMps: 8.5,
    colorIndex: 2,
  },
  junctionNodeIndex: 3,
  armDistM: 90,
  lineDistM: 16,
  clearSpeedMps: 12.5,
};

/** P3w — same junction, player SOUTHWEST-BOUND on the Каменов service leg;
 *  the car arrives from the NW Брадистилов arm (the player's right). */
const P3W_SITE = {
  junction: { nodeId: "n316786266", x: -146.49, y: -49.42 },
  actor: {
    pathNodes: ["n10579367462", "n316786266", "n10581457590", "n639932179"],
    hold: { nodeIndex: 1, offsetM: -50 },
    cruiseSpeedMps: 8.5,
    colorIndex: 2,
  },
  junctionNodeIndex: 1,
  armDistM: 90,
  lineDistM: 16,
  clearSpeedMps: 12.5,
};

/** V1 — cyclist right-hook at the T n415949424 [shipped: L3 verbatim, minus
 *  the tiered cruise speed]. */
const V1_SITE = {
  junction: { nodeId: "n415949424", x: 229.08, y: -401.6 },
  actor: {
    pathNodes: ["n179974484", "n415949424", "n10829521919"],
    hold: { nodeIndex: 1, offsetM: -38 },
    cruiseSpeedMps: 4.6, // overridden per tier
    extraRightOffsetM: 2.6,
    colorIndex: 1,
  },
  junctionNodeIndex: 1,
  releaseDistM: 70,
  dangerRadiusM: 9,
  conflictWindowM: 20,
};

/** C1 — dart-out at the marked crossing n11364730203, westbound [shipped:
 *  lex-exam-1 verbatim]. */
const C1_SITE = {
  crossingId: "n11364730203",
  crossing: { x: 105.28, y: -391.54 },
  start: { x: 106.56, y: -381.9 },
  dir: { x: -0.1314, y: -0.9913 },
  travelM: 23.5,
  roadFromM: 1.2,
  roadToM: 18.25,
};

/** C2 — dart-out at n12324499587 on „Крум Кюлявков", southwest-bound
 *  [shipped: L4 verbatim]. */
const C2_SITE = {
  crossingId: "n12324499587",
  crossing: { x: -531.98, y: 123.75 },
  start: { x: -536.71, y: 132.25 },
  dir: { x: 0.4866, y: -0.8736 },
  travelM: 23.5,
  roadFromM: 1.2,
  roadToM: 18.25,
};

/** C4 — dart-out at n676643323 on „Боровски" (e170139947.0, 2 lanes),
 *  southbound; L4 curb-offset derivation. */
const C4_SITE = {
  crossingId: "n676643323",
  crossing: { x: 239.96, y: -281.26 },
  start: { x: 230.28, y: -280.34 },
  dir: { x: 0.9955, y: -0.0949 },
  travelM: 23.5,
  roadFromM: 1.2,
  roadToM: 18.25,
};

/** C9w — dart-out at n11364730204 (e1164416745.0, 2 lanes), westbound;
 *  L4 curb-offset derivation. */
const C9W_SITE = {
  crossingId: "n11364730204",
  crossing: { x: 88.08, y: -389.72 },
  start: { x: 88.98, y: -380.04 },
  dir: { x: -0.0928, y: -0.9957 },
  travelM: 23.5,
  roadFromM: 1.2,
  roadToM: 18.25,
};

/** C10e — dart-out at n9696002171 on „Баку" (e519568055.1, 2 lanes),
 *  eastbound; L4 curb-offset derivation. */
const C10E_SITE = {
  crossingId: "n9696002171",
  crossing: { x: -101.15, y: -317.31 },
  start: { x: -102.22, y: -326.98 },
  dir: { x: 0.1101, y: 0.9939 },
  travelM: 23.5,
  roadFromM: 1.2,
  roadToM: 18.25,
};

/** B1 — braking lead car on spawn-4's opening straight [shipped: lex-exam-1
 *  verbatim minus the tiered decel/gap]. */
const B1_SITE = {
  actor: {
    pathNodes: ["n415950074", "n331942486", "n331942490", "n2349242518"],
    hold: { nodeIndex: 0, offsetM: 115 },
    cruiseSpeedMps: 10,
    colorIndex: 3,
  },
  maxMatchSpeedMps: 13.9,
  slamAt: { x: 386.3, y: -28.0 },
  slamRadiusM: 7,
  minSlamSpeedKmh: 25,
  proximityFallbackM: 30,
  triggersHazard: false,
  resumeAfterSec: 4,
};

/** B3 — braking lead car on spawn-3's northbound straight (e31297253.0;
 *  spawn sits at s≈103, hold 25 m ahead, slam ~60 m later, then the car
 *  turns EAST at n348207502 and parks down the south „Станоев" arm.
 *  C1 revision: the authored west exit claimed to be "off both host routes"
 *  but shell B's return leg drives n348207502 → n332113263 — the parked car
 *  was a mid-lane roadblock at arc ≈1606 (C1 bot stuck against it, stacked
 *  with P2's). n2644522840 (452, −333) via the two-way e724866098.0 south
 *  arm is on no shell's routeNodes. */
const B3_SITE = {
  actor: {
    pathNodes: ["n1812874946", "n9959660040", "n348207502", "n179974491", "n2644522840"],
    hold: { nodeIndex: 0, offsetM: 128 },
    cruiseSpeedMps: 10,
    colorIndex: 3,
  },
  maxMatchSpeedMps: 13.9,
  slamAt: { x: 397.0, y: -389.1 },
  slamRadiusM: 7,
  minSlamSpeedKmh: 25,
  proximityFallbackM: 30,
  triggersHazard: false,
  resumeAfterSec: 4,
};

/** B4 — braking lead car on „Боян Каменов" eastbound (waits just past the
 *  Габровски junction the player turns in from; slam mid-straight, then the
 *  car turns right at the 4-way and parks down the SE „Брадистилов" arm.
 *  C1 revision: the authored terminal n8585789857 is ON host shell D's route
 *  (D drives n316786266 → n8585789857 right behind the car) — a finished
 *  staged vehicle parks at its path end, so every D variant with B4 staged
 *  dead-ended behind it. n10579367462 is the P3-actors' own off-route arm. */
const B4_SITE = {
  actor: {
    pathNodes: [
      "n10579363851",
      "n269951355",
      "n639932179",
      "n10581457590",
      "n316786266",
      "n10579367462",
    ],
    hold: { nodeIndex: 0, offsetM: 2 },
    cruiseSpeedMps: 10,
    colorIndex: 3,
  },
  // C1: mid-route corridor — the lead waits until the player is near
  // (armDistM), else it drove off at session start and graded a phantom
  // passedWithoutStopping against a player minutes behind.
  armDistM: 60,
  maxMatchSpeedMps: 13.9,
  slamAt: { x: -325.2, y: -53.1 },
  slamRadiusM: 7,
  minSlamSpeedKmh: 25,
  proximityFallbackM: 30,
  triggersHazard: false,
  resumeAfterSec: 4,
};

/** B5 — braking lead car on „Иван Багрянов" southwest-bound (shell E's
 *  opening straight; the car carries on past n331942491 while the player
 *  turns left). */
const B5_SITE = {
  actor: {
    pathNodes: [
      "n10579352599",
      "n11148411009",
      "n10579366024",
      "n10579332160",
      "n331942491",
      "n9167427475",
    ],
    hold: { nodeIndex: 1, offsetM: 1 },
    cruiseSpeedMps: 9,
    colorIndex: 3,
  },
  maxMatchSpeedMps: 13.9,
  slamAt: { x: 124.1, y: 225.2 },
  slamRadiusM: 7,
  minSlamSpeedKmh: 25,
  proximityFallbackM: 30,
  triggersHazard: false,
  resumeAfterSec: 4,
};

/** B6 — braking lead car on бул. „Д-р Г. М. Димитров" southwest-bound
 *  (e1134525978.1, 204 m straight; the car exits north through the NW
 *  cluster while the player continues to „Габровски"). */
const B6_SITE = {
  actor: {
    pathNodes: ["n331953595", "n10201904164", "n12155370041", "n704602147"],
    hold: { nodeIndex: 0, offsetM: 25 },
    cruiseSpeedMps: 11,
    colorIndex: 3,
  },
  // C1: mid-route corridor — see B4's armDistM note.
  armDistM: 60,
  maxMatchSpeedMps: 13.9,
  slamAt: { x: -306.3, y: 109.0 },
  slamRadiusM: 7,
  minSlamSpeedKmh: 25,
  proximityFallbackM: 30,
  triggersHazard: false,
  resumeAfterSec: 4,
};

/** A1 — amber dilemma at n1805512602, northbound on the boulevard
 *  (lineDistM = the runtime's derived setback on e672169336.0).
 *  C1 revision: armDistM was 70 — only ~38 m arm-to-line, so the "stoppable"
 *  flip (4.5 s ETA) always clamped to "flip now" at ≈3.0 s ETA — exactly the
 *  yellow duration. A comfortable stop never existed and a committed driver
 *  reached the line ≈0.05 s into red — every dry A1-stoppable variant failed
 *  a 10-point red through no fault (rain variants survived only because the
 *  slower approach tipped the stop/commit decision 0.1 m the other way).
 *  110 m arms ≈78 m before the line: the 4.5 s flip fires at ~56 m — a real
 *  comfortable stop — while dilemma/committed keep their entry character. */
const A1_SITE = {
  signalNodeId: "n1805512602",
  junction: { x: 430.13, y: 235.3 },
  armDistM: 110,
  minTriggerSpeedKmh: 15,
  lineDistM: 31.8,
};

/** A3 — amber dilemma at n179974491, westbound on „Трайко Станоев" (the
 *  B1a integration-suite site; lineDistM = line sM on e519275131.0). */
const A3_SITE = {
  signalNodeId: "n179974491",
  junction: { x: 448.94, y: -250.42 },
  armDistM: 120,
  minTriggerSpeedKmh: 15,
  lineDistM: 44.0,
};

/** A3e — amber dilemma at n179974491, EASTBOUND on „Брадистилов"
 *  (e661825048.3 is only 63.5 m — the arm window is short, so the two
 *  stop-class tiers converge toward the dilemma; still distinct pins). */
const A3E_SITE = {
  signalNodeId: "n179974491",
  junction: { x: 448.94, y: -250.42 },
  armDistM: 55,
  minTriggerSpeedKmh: 12,
  lineDistM: 29.2,
};

/** A6 — amber dilemma at the NW-cluster node n12155370041, southwest-bound
 *  on „Димитров" (lineDistM = derived setback on e1115502706.0). */
const A6_SITE = {
  signalNodeId: "n12155370041",
  junction: { x: -478.91, y: 17.39 },
  armDistM: 85,
  minTriggerSpeedKmh: 15,
  lineDistM: 27.7,
};

// ---------------------------------------------------------------------------
// Objective helpers
// ---------------------------------------------------------------------------

function zone(id: string, titleBg: string, x: number, y: number, radiusM: number): LessonObjective {
  return { id, titleBg, kind: "reachZone", params: { x, y, radiusM } };
}

function light(id: string, titleBg: string, nodeId: string, x: number, y: number): LessonObjective {
  return {
    id,
    titleBg,
    kind: "passSignal",
    params: { nodeId, x, y, radiusM: 30, control: "trafficLight" },
  };
}

/** rb-1 approach + traversal pair — every shell that touches the ring. */
function roundaboutObjectives(prefix: string, titleBg: string): LessonObjective[] {
  return [
    zone(`${prefix}-rb-approach`, "Продължи направо до кръговото кръстовище", -38.03, -342.96, 60),
    {
      id: `${prefix}-rb`,
      titleBg,
      kind: "completeManeuver",
      params: { maneuver: "roundabout", x: -38.03, y: -342.96, enterRadiusM: 26, exitRadiusM: 45 },
    },
  ];
}

const B2_OBJECTIVE = (id: string): LessonObjective => ({
  id,
  titleBg: "Потегли направо. На знака „Спри!“ спри напълно",
  kind: "passSignal",
  params: { nodeId: "n331942490", x: 383.17, y: 65.76, radiusM: 30, control: "stopSign" },
});

// ---------------------------------------------------------------------------
// THE NINE SHELLS
// ---------------------------------------------------------------------------

export const EXAM_SHELLS: readonly ExamRouteShell[] = [
  // -------------------------------------------------------------- Shell A —
  // the lex-exam-1 shape: spawn-4 north, boulevard, „Семов" block U-turn,
  // west over „Боровски", roundabout turnaround, park in the L7 bay.
  {
    code: "A",
    nameBg: "Северният булевард",
    descriptionBg:
      "Знак „Спри!“, булевардът на север, обръщане при „Марко Семов“, западният пръстен и кръговото като обратен завой.",
    spawn: { pointId: "spawn-4" },
    routeNodes: [
      "n415950074", "n331942486", "n331942490", "n7010135318", "n9601848038", "n639792337",
      "n5063751788", "n9601848047", "n6294463135", "n1805512602", "n5997970086", "n1805512645",
      "n6294440266", "n6294440267", "n5613965861", "n6294440269", "n5063751788", "n1113186267",
      "n179974491", "n348207502", "n332113263", "n415950003", "n179974484", "n415949424",
      "n6805916117", "n685714833", "n685714834", "n279646951", "n279646953", "n279646956",
      "n279646958", "n1038574156", "n1038574251", "n707684255", "n707684256", "n279646953",
      "n279646951", "n685714834", "n685714833", "n6805916117", "n415949424", "n179974484",
      "n415950003", "n332113263", "n348207502", "n179974491", "n417233856",
    ],
    bayRef: "l7",
    parkTitleBg: "Паркирай на заден ход в очертаното място вдясно и спри напълно",
    objectives: [
      B2_OBJECTIVE("xA-stop-b2"),
      light("xA-signal-1", "След стопа завий надясно, после наляво по булеварда — премини светофара", "n1805512602", 430.13, 235.3),
      light("xA-signal-2", "Продължи направо през следващия светофар", "n5997970086", 421.91, 275.44),
      zone("xA-turnaround", "Веднага след светофара завий наляво по „Проф. Марко Семов“ и се върни по булеварда на юг", 427.0, 159.0, 18),
      zone("xA-turn-bradistilov", "В края на булеварда завий надясно по „Проф. Георги Брадистилов“", 389.21, -271.99, 20),
      zone("xA-turn-borovski", "На кръстовището завий наляво по „Проф. Борис Боровски“", 234.5, -336.5, 16),
      zone("xA-turn-west", "На Т-образното кръстовище завий надясно, на запад", 168.43, -396.7, 16),
      ...roundaboutObjectives("xA", "На кръговото се върни в обратна посока — излез на изток с десен мигач"),
      zone("xA-return-borovski", "Върни се на изток и на Т-образното кръстовище завий наляво, на север", 234.5, -336.5, 16),
      zone("xA-return-bradistilov", "Завий надясно по „Проф. Георги Брадистилов“ и карай направо, на изток", 389.21, -271.99, 20),
      zone("xA-street-stanoev", "Премини направо през светофара и продължи по „Трайко Станоев“", 620.96, -215.89, 20),
    ],
    slots: [
      leadCarSlot("xA-corridor", "B1-spawn4-straight", B1_SITE),
      priorityLineSlot("xA-priority", "P1-b2-junction", ["n639792337", "n5063751788"], P1_SITE),
      amberSlot("xA-amber", "A1-blvd-north", ["n6294463135", "n1805512602"], A1_SITE),
      cyclistSlot("xA-cyclist", "V1-borovski-t", ["n179974484", "n415949424"], V1_SITE),
      dartSlot("xA-dart", "C1-baku-west", ["n6805916117", "n685714833"], C1_SITE),
      roundaboutSlot("xA-roundabout", "R1-rb-se", ["n279646953", "n279646956"], R1_SITE),
    ],
  },
  // -------------------------------------------------------------- Shell B —
  // southern start: spawn-3's long corridor through the uncontrolled 4-way,
  // then the A spine with the „Боровски" dart instead of the „Баку" one.
  {
    code: "B",
    nameBg: "Южният коридор",
    descriptionBg:
      "Дълъг северен коридор през нерегулирано кръстовище, знак „Спри!“, булевардът, обръщане при „Семов“ и кръговото.",
    spawn: { pointId: "spawn-3" },
    routeNodes: [
      "n1812874946", "n9959660040", "n348207502", "n8585786884", "n415950074", "n331942486",
      "n331942490", "n7010135318", "n9601848038", "n639792337", "n5063751788", "n9601848047",
      "n6294463135", "n1805512602", "n5997970086", "n1805512645", "n6294440266", "n6294440267",
      "n5613965861", "n6294440269", "n5063751788", "n1113186267", "n179974491", "n348207502",
      "n332113263", "n415950003", "n179974484", "n415949424", "n6805916117", "n685714833",
      "n685714834", "n279646951", "n279646953", "n279646956", "n279646958", "n1038574156",
      "n1038574251", "n707684255", "n707684256", "n279646953", "n279646951", "n685714834",
      "n685714833", "n6805916117", "n415949424", "n179974484", "n415950003", "n332113263",
      "n348207502", "n179974491", "n417233856",
    ],
    bayRef: "l7",
    parkTitleBg: "Паркирай на заден ход в очертаното място вдясно и спри напълно",
    objectives: [
      zone("xB-corridor", "Потегли направо на север, през кръстовището без знаци", 389.21, -271.99, 18),
      B2_OBJECTIVE("xB-stop-b2"),
      light("xB-signal-1", "След стопа завий надясно, после наляво по булеварда — премини светофара", "n1805512602", 430.13, 235.3),
      light("xB-signal-2", "Продължи направо през следващия светофар", "n5997970086", 421.91, 275.44),
      zone("xB-turnaround", "Веднага след светофара завий наляво по „Проф. Марко Семов“ и се върни по булеварда на юг", 427.0, 159.0, 18),
      zone("xB-turn-bradistilov", "В края на булеварда завий надясно по „Проф. Георги Брадистилов“", 389.21, -271.99, 20),
      zone("xB-turn-borovski", "На кръстовището завий наляво по „Проф. Борис Боровски“", 234.5, -336.5, 16),
      zone("xB-turn-west", "На Т-образното кръстовище завий надясно, на запад", 168.43, -396.7, 16),
      ...roundaboutObjectives("xB", "На кръговото се върни в обратна посока — излез на изток с десен мигач"),
      zone("xB-return-borovski", "Върни се на изток и на Т-образното кръстовище завий наляво, на север", 234.5, -336.5, 16),
      zone("xB-return-bradistilov", "Завий надясно по „Проф. Георги Брадистилов“ и карай направо, на изток", 389.21, -271.99, 20),
      zone("xB-street-stanoev", "Премини направо през светофара и продължи по „Трайко Станоев“", 620.96, -215.89, 20),
    ],
    slots: [
      leadCarSlot("xB-corridor", "B3-spawn3-straight", B3_SITE),
      priorityRhrSlot("xB-rhr", "P2-bradistilov-4way", ["n9959660040", "n348207502"], P2_SITE),
      amberSlot("xB-amber", "A1-blvd-north", ["n6294463135", "n1805512602"], A1_SITE),
      dartSlot("xB-dart", "C4-borovski", ["n179974484", "n415949424"], C4_SITE),
      cyclistSlot("xB-cyclist", "V1-borovski-t", ["n179974484", "n415949424"], V1_SITE),
      roundaboutSlot("xB-roundabout", "R1-rb-se", ["n279646953", "n279646956"], R1_SITE),
    ],
  },
  // -------------------------------------------------------------- Shell C —
  // spawn-1 westbound through the amber light, south over „Боровски",
  // roundabout U-turn, then the „Росарио"/center-grid loop back east.
  {
    code: "C",
    nameBg: "Западният пръстен",
    descriptionBg:
      "Светофарът на „Трайко Станоев“, южният пръстен с кръговото като обратен завой и центърът по „Росарио“ и „Брадистилов“.",
    // C1 revision: spawn-1 (620.96, -215.89, heading 71.2°) faces EAST — the
    // opposite of this route's westbound opening leg (bearing 251.2°), so the
    // variant was undrivable as authored (the builders' suite checked spawn
    // POSITION only, never heading). Explicit westbound pose at the scaled
    // right-lane center of e519275131.0 at spawn-1's chainage — the shell E
    // convention.
    spawn: { position: { x: 619.65, y: -212.05 }, headingDeg: 251.2 },
    routeNodes: [
      "n417233856", "n179974491", "n348207502", "n332113263", "n415950003", "n179974484",
      "n415949424", "n6805916117", "n685714833", "n685714834", "n279646951", "n279646953",
      "n279646956", "n279646958", "n1038574156", "n1038574251", "n707684255", "n707684256",
      "n279646953", "n279646951", "n10829513380", "n10829520276", "n10829467286", "n415949340",
      "n10829484650", "n10829520018", "n1734307187", "n415949137", "n6297569733", "n348707759",
      "n415950249", "n6293978467", "n316786262", "n316786261", "n316786260", "n8342452192",
      "n179974484", "n415950003", "n332113263", "n348207502", "n179974491", "n417233856",
    ],
    bayRef: "l7",
    parkTitleBg: "Паркирай на заден ход в очертаното място вдясно и спри напълно",
    objectives: [
      light("xC-signal-1", "Потегли на запад и премини светофара", "n179974491", 448.94, -250.42),
      zone("xC-bradistilov", "Продължи направо по „Проф. Георги Брадистилов“", 307.78, -271.49, 18),
      zone("xC-turn-borovski", "На кръстовището завий наляво по „Проф. Борис Боровски“", 234.5, -336.5, 16),
      zone("xC-turn-west", "На Т-образното кръстовище завий надясно, на запад", 168.43, -396.7, 16),
      ...roundaboutObjectives("xC", "На кръговото се върни в обратна посока — излез на изток с десен мигач"),
      zone("xC-rosario", "След кръговото завий наляво на север по „Росарио“", 26.42, -209.76, 16),
      zone("xC-west-jog", "Горе завий наляво на запад, после надясно на север", -81.37, -190.91, 16),
      zone("xC-center-east", "Завий надясно и продължи на изток по „Брадистилов“", 122.64, -147.86, 16),
      zone("xC-center-south", "Следвай „Брадистилов“ надясно, на юг", 245.03, -211.56, 16),
      zone("xC-return", "На кръстовището завий наляво и карай на изток", 389.21, -271.99, 20),
      light("xC-signal-2", "Премини направо през светофара към „Трайко Станоев“", "n179974491", 448.94, -250.42),
    ],
    slots: [
      amberSlot("xC-amber", "A3-stanoev-west", ["n417233856", "n179974491"], A3_SITE),
      dartSlot("xC-dart-1", "C4-borovski", ["n179974484", "n415949424"], C4_SITE),
      cyclistSlot("xC-cyclist", "V1-borovski-t", ["n179974484", "n415949424"], V1_SITE),
      dartSlot("xC-dart-2", "C1-baku-west", ["n6805916117", "n685714833"], C1_SITE),
      roundaboutSlot("xC-roundabout", "R1-rb-se", ["n279646953", "n279646956"], R1_SITE),
    ],
  },
  // -------------------------------------------------------------- Shell D —
  // the grand tour: spawn-5 west, NW signal cluster, „Каменов" east through
  // the uncontrolled 4-way, the 30-zone service climb to the Б2 street, the
  // boulevard + „Семов" U-turn, the western ring and the „Ташев" bay.
  {
    code: "D",
    nameBg: "Голямата обиколка",
    descriptionBg:
      "От „Крум Кюлявков“ през светофарите на „Габровски“, изток по „Боян Каменов“, булевардът с обръщане при „Семов“ и финал на „Ташев“.",
    spawn: { pointId: "spawn-5" },
    routeNodes: [
      "n316459565", "n316456672", "n797136522", "n12155370035", "n148570715", "n12155370039",
      "n12155370032", "n5065993424", "n269951357", "n10579363851", "n269951355", "n639932179",
      "n10581457590", "n316786266", "n8585789857", "n8585789858", "n316786265", "n415949137",
      "n6297569733", "n348707759", "n415950249", "n6293978467", "n316786262", "n316786261",
      "n316786260", "n2349247015", "n8586037352", "n2349242518", "n331942490", "n7010135318",
      "n9601848038", "n639792337", "n5063751788", "n9601848047", "n6294463135", "n1805512602",
      "n5997970086", "n1805512645", "n6294440266", "n6294440267", "n5613965861", "n6294440269",
      "n5063751788", "n1113186267", "n179974491", "n348207502", "n332113263", "n415950003",
      "n179974484", "n415949424", "n6805916117", "n685714833", "n685714834", "n279646951",
      "n279646953", "n279646956", "n279646958", "n1038574156", "n1038574251", "n279646652",
      "n415949138", "n707737275", "n10911122202", "n10829705443", "n148575255", "n148575257",
      "n4403415572", "n9135347504",
    ],
    bayRef: TASHEV_BAY,
    parkTitleBg: "Паркирай на заден ход в очертаното място вдясно и спри напълно",
    objectives: [
      zone("xD-kyulyavkov", "Карай на югозапад по „Крум Кюлявков“ и завий наляво по „Никола Габровски“", -539.52, 119.56, 18),
      light("xD-cluster", "Премини светофарите и продължи по „Габровски“ на юг", "n12155370035", -500.49, 48.54),
      zone("xD-kamenov", "На кръстовището завий наляво, на изток по „Проф. Боян Каменов“", -437.26, -79.03, 16),
      zone("xD-4way", "Продължи през кръстовището и надясно по „Брадистилов“", -146.49, -49.42, 16),
      zone("xD-center", "Следвай „Брадистилов“ на изток", 122.64, -147.86, 16),
      zone("xD-service-north", "След десния завой продължи наляво на север по обслужващата улица", 317.12, -60.92, 16),
      zone("xD-b2-straight", "На кръстовището със знак „Спри!“ продължи направо, на изток", 383.17, 65.76, 18),
      light("xD-signal-1", "Завий наляво по булеварда и премини светофара", "n1805512602", 430.13, 235.3),
      light("xD-signal-2", "Продължи направо през следващия светофар", "n5997970086", 421.91, 275.44),
      zone("xD-turnaround", "Веднага след светофара завий наляво по „Проф. Марко Семов“ и се върни по булеварда на юг", 427.0, 159.0, 18),
      zone("xD-turn-bradistilov", "В края на булеварда завий надясно по „Проф. Георги Брадистилов“", 389.21, -271.99, 20),
      zone("xD-turn-borovski", "На кръстовището завий наляво по „Проф. Борис Боровски“", 234.5, -336.5, 16),
      zone("xD-turn-west", "На Т-образното кръстовище завий надясно, на запад", 168.43, -396.7, 16),
      ...roundaboutObjectives("xD", "През кръговото продължи на северозапад — излез с десен мигач"),
      zone("xD-baku-west", "Продължи на запад по „Баку“", -164.71, -310.27, 18),
      zone("xD-tashev", "Завий наляво на юг, после надясно по „Проф. Арх. Петър А. Ташев“", -334.95, -321.44, 16),
    ],
    slots: [
      dartSlot("xD-dart", "C2-kyulyavkov", ["n316459565", "n316456672"], C2_SITE),
      leadCarSlot("xD-corridor", "B4-kamenov-straight", B4_SITE),
      priorityRhrSlot("xD-rhr", "P3e-kamenov-4way", ["n10581457590", "n316786266"], P3E_SITE),
      priorityLineSlot("xD-priority", "P1-b2-junction", ["n639792337", "n5063751788"], P1_SITE),
      amberSlot("xD-amber", "A1-blvd-north", ["n6294463135", "n1805512602"], A1_SITE),
      roundaboutSlot("xD-roundabout", "R1-rb-se", ["n279646953", "n279646956"], R1_SITE),
    ],
  },
  // -------------------------------------------------------------- Shell E —
  // center diagonal: „Багрянов" opening corridor, the 30-zone „Каменов"
  // service leg through the uncontrolled 4-way, east over the grid, the
  // southern ring with the roundabout U-turn, boulevard north + „Семов".
  {
    code: "E",
    nameBg: "Диагоналът",
    descriptionBg:
      "По „Иван Багрянов“ и тихата зона на „Боян Каменов“, южният пръстен с кръговото, после булевардът на север с обръщане при „Семов“.",
    spawn: { position: { x: 237.83, y: 289.13 }, headingDeg: 242.3 },
    routeNodes: [
      "n10579352599", "n11148411009", "n10579366024", "n10579332160", "n331942491",
      "n683400165", "n10837317976", "n10837317975", "n316786266", "n8585789857",
      "n8585789858", "n316786265", "n415949137", "n6297569733", "n348707759", "n415950249",
      "n6293978467", "n11364730197", "n685714841", "n685714833", "n685714834", "n279646951",
      "n279646953", "n279646956", "n279646958", "n1038574156", "n1038574251", "n707684255",
      "n707684256", "n279646953", "n279646951", "n685714834", "n685714833", "n6805916117",
      "n415949424", "n179974484", "n415950003", "n332113263", "n348207502", "n179974491",
      "n1113186267", "n5063751788", "n9601848047", "n6294463135", "n1805512602", "n5997970086",
      "n1805512645", "n6294440266", "n6294440267", "n5613965861", "n6294440269", "n5063751788",
      "n1113186267", "n179974491", "n417233856",
    ],
    bayRef: "l7",
    parkTitleBg: "Паркирай на заден ход в очертаното място вдясно и спри напълно",
    objectives: [
      zone("xE-bagryanov", "Карай на югозапад по „Иван Багрянов“ и завий наляво по „Попйорданов“", 82.35, 203.31, 16),
      zone("xE-kamenov", "Долу завий надясно, на запад по „Проф. Боян Каменов“ — тиха зона 30", 135.87, 99.99, 16),
      zone("xE-4way", "На кръстовището завий наляво по „Брадистилов“", -146.49, -49.42, 16),
      zone("xE-center", "Продължи на изток по „Брадистилов“", 122.64, -147.86, 16),
      zone("xE-service-south", "Завий надясно на юг по обслужващата улица", 112.76, -268.47, 16),
      zone("xE-turn-west", "В края завий надясно, на запад", 100.31, -390.86, 16),
      ...roundaboutObjectives("xE", "На кръговото се върни в обратна посока — излез на изток с десен мигач"),
      zone("xE-borovski", "След Т-образното завий наляво, на север по „Боровски“", 234.5, -336.5, 16),
      zone("xE-bradistilov", "Завий надясно по „Брадистилов“, на изток", 389.21, -271.99, 20),
      light("xE-signal-1", "На светофара завий наляво, на север по булеварда", "n179974491", 448.94, -250.42),
      light("xE-signal-2", "Премини светофара", "n1805512602", 430.13, 235.3),
      light("xE-signal-3", "Продължи направо през следващия светофар", "n5997970086", 421.91, 275.44),
      zone("xE-turnaround", "Веднага след светофара завий наляво по „Проф. Марко Семов“ и се върни по булеварда на юг", 427.0, 159.0, 18),
      zone("xE-stanoev", "На светофара завий наляво, на изток по „Трайко Станоев“", 620.96, -215.89, 20),
    ],
    slots: [
      leadCarSlot("xE-corridor", "B5-bagryanov-straight", B5_SITE),
      priorityRhrSlot("xE-rhr", "P3w-kamenov-4way", ["n10837317975", "n316786266"], P3W_SITE),
      dartSlot("xE-dart", "C9w-baku-mid", ["n685714833", "n685714834"], C9W_SITE),
      roundaboutSlot("xE-roundabout", "R1-rb-se", ["n279646953", "n279646956"], R1_SITE),
      amberSlot("xE-amber", "A3e-bradistilov-east", ["n348207502", "n179974491"], A3E_SITE),
    ],
  },
  // -------------------------------------------------------------- Shell F —
  // northwest descent: „Чилов"/„Трендафилов" mesh, „Димитров" boulevard,
  // NW signal cluster, „Габровски" south, „Баку" east, full-ring roundabout
  // U-turn and back west to the „Ташев" bay.
  {
    code: "F",
    nameBg: "Северозападът",
    descriptionBg:
      "Жилищната мрежа на „Чилов“ и „Трендафилов“, булевард „Димитров“, светофарите на „Габровски“ и кръговото като обратен завой.",
    spawn: { pointId: "spawn-6" },
    routeNodes: [
      "n316457339", "n316457332", "n10584378815", "n316457330", "n316457328", "n316457204",
      "n366683204", "n316457177", "n331953596", "n316456679", "n316459565", "n2341970006",
      "n10576801890", "n11148400269", "n8297002516", "n2341970004", "n331953595", "n10201904164",
      "n12155370041", "n148570715", "n12155370039", "n12155370032", "n5065993424", "n269951357",
      "n797136564", "n4403415655", "n8585800169", "n1038574095", "n4403415635", "n148575255",
      "n10829705443", "n10911122202", "n707737275", "n415949138", "n279646652", "n707684255",
      "n707684256", "n279646956", "n279646958", "n1038574156", "n1038574251", "n279646652",
      "n415949138", "n707737275", "n10911122202", "n10829705443", "n148575255", "n148575257",
      "n4403415572", "n9135347504",
    ],
    bayRef: TASHEV_BAY,
    parkTitleBg: "Паркирай на заден ход в очертаното място вдясно и спри напълно",
    objectives: [
      zone("xF-trendafilov", "Следвай улицата и завий по „Владимир Трендафилов“", -231.37, 344.7, 16),
      zone("xF-kyulyavkov", "Продължи по „Крум Кюлявков“ на югозапад", -196.9, 287.12, 16),
      zone("xF-south", "На „Крум Кюлявков“ завий наляво, на юг", -387.3, 201.32, 16),
      zone("xF-dimitrov", "Излез на булевард „Д-р Г. М. Димитров“ надясно, на югозапад", -217.86, 155.61, 16),
      light("xF-cluster", "Премини светофарите и продължи по „Габровски“ на юг", "n12155370041", -478.91, 17.39),
      zone("xF-gabrovski", "Продължи на юг по „Никола Габровски“", -398.52, -162.17, 16),
      zone("xF-baku", "Завий наляво, на изток по „Баку“", -339.73, -295.17, 16),
      ...roundaboutObjectives("xF", "На кръговото се върни в обратна посока — излез на запад с десен мигач"),
      zone("xF-baku-west", "Върни се на запад по „Баку“", -164.71, -310.27, 18),
      zone("xF-tashev", "Завий наляво на юг, после надясно по „Проф. Арх. Петър А. Ташев“", -334.95, -321.44, 16),
    ],
    slots: [
      leadCarSlot("xF-corridor", "B6-dimitrov-straight", B6_SITE),
      amberSlot("xF-amber", "A6-nw-cluster", ["n10201904164", "n12155370041"], A6_SITE),
      // NOTE: no right-hand-rule slot on F — the only uncontrolled junction
      // with a right arm on this route is fed by a SERVICE road, and service
      // edges are off the traffic lane graph (traffic/types.ts
      // excludedRoadClasses) — an actor there can never stage. The „Баку"
      // dart keeps the slot count at four.
      dartSlot("xF-dart", "C10e-baku-crossing", ["n707737275", "n415949138"], C10E_SITE),
      roundaboutSlot("xF-roundabout", "R2-rb-nw", ["n279646652", "n707684255"], R2_SITE),
    ],
  },
  // -------------------------------------------------------------- Shell G —
  // eastern eight: spawn-3 through the 4-way east, boulevard north with the
  // „Семов" U-turn, „Брадистилов" west across the center, the 30-zone
  // service drop to „Баку", roundabout through-move and the „Ташев" bay.
  {
    code: "G",
    nameBg: "Източната осмица",
    descriptionBg:
      "Нерегулираното кръстовище, булевардът на север с обръщане при „Семов“, целият „Брадистилов“ на запад и тихата зона към „Баку“.",
    spawn: { pointId: "spawn-3" },
    routeNodes: [
      "n1812874946", "n9959660040", "n348207502", "n179974491", "n1113186267", "n5063751788",
      "n9601848047", "n6294463135", "n1805512602", "n5997970086", "n1805512645", "n6294440266",
      "n6294440267", "n5613965861", "n6294440269", "n5063751788", "n1113186267", "n179974491",
      "n348207502", "n332113263", "n415950003", "n179974484", "n8342452192", "n316786260",
      "n316786261", "n316786262", "n6293978467", "n11364730197", "n685714841", "n685714833",
      "n685714834", "n279646951", "n279646953", "n279646956", "n279646958", "n1038574156",
      "n1038574251", "n279646652", "n415949138", "n707737275", "n10911122202", "n10829705443",
      "n148575255", "n148575257", "n4403415572", "n9135347504",
    ],
    bayRef: TASHEV_BAY,
    parkTitleBg: "Паркирай на заден ход в очертаното място вдясно и спри напълно",
    objectives: [
      zone("xG-4way", "Потегли на север и на кръстовището завий надясно", 389.21, -271.99, 18),
      light("xG-signal-blvd", "На светофара завий наляво, на север по булеварда", "n179974491", 448.94, -250.42),
      light("xG-signal-1", "Премини светофара", "n1805512602", 430.13, 235.3),
      light("xG-signal-2", "Продължи направо през следващия светофар", "n5997970086", 421.91, 275.44),
      zone("xG-turnaround", "Веднага след светофара завий наляво по „Проф. Марко Семов“ и се върни по булеварда на юг", 427.0, 159.0, 18),
      zone("xG-turn-bradistilov", "В края на булеварда завий надясно по „Проф. Георги Брадистилов“", 389.21, -271.99, 20),
      zone("xG-center-north", "Следвай „Брадистилов“ надясно на север, после наляво на запад", 245.03, -211.56, 16),
      zone("xG-center-west", "Продължи на запад по „Брадистилов“", 122.64, -147.86, 16),
      zone("xG-service-south", "Завий наляво на юг по обслужващата улица", 112.76, -268.47, 16),
      zone("xG-turn-west", "Долу завий надясно, на запад", 48.24, -385.6, 16),
      ...roundaboutObjectives("xG", "През кръговото продължи на северозапад — излез с десен мигач"),
      zone("xG-baku-west", "Продължи на запад по „Баку“", -164.71, -310.27, 18),
      zone("xG-tashev", "Завий наляво на юг, после надясно по „Проф. Арх. Петър А. Ташев“", -334.95, -321.44, 16),
    ],
    slots: [
      priorityRhrSlot("xG-rhr", "P2-bradistilov-4way", ["n9959660040", "n348207502"], P2_SITE),
      amberSlot("xG-amber", "A1-blvd-north", ["n6294463135", "n1805512602"], A1_SITE),
      // NOTE: no dart on the „Брадистилов" west leg — the marked crossing
      // there sits 10 m from the 4-way the shell already crosses northbound,
      // and the dart runner arms on ANY close approach (it would fire on the
      // wrong pass). The runner-visible constraint is honored, not fought.
      dartSlot("xG-dart", "C9w-baku-mid", ["n685714833", "n685714834"], C9W_SITE),
      roundaboutSlot("xG-roundabout", "R1-rb-se", ["n279646953", "n279646956"], R1_SITE),
    ],
  },
  // -------------------------------------------------------------- Shell H —
  // the central figure-eight: shell A's northern loop (spawn-4, Б2 stop, P1,
  // boulevard + „Семов" U-turn) joined at the 4-way to a southern loop over
  // the center grid (G's westbound „Брадистилов" traverse, the service drop
  // to „Баку") with the roundabout as a second reversal, returning east over
  // „Боровски" to the L7 bay. ROUTE-SHELL slice (doc 72 §16 constraint 1 +
  // ADR-006 closing note): every hop AND every consecutive turn-triple below
  // already appears in shells A/E/G — new exam SHAPE over machine-proven
  // geometry, so the C1 bot inherits leg-local behavior wholesale.
  {
    code: "H",
    nameBg: "Централната осмица",
    descriptionBg:
      "Знак „Спри!“, булевардът на север с обръщане при „Семов“, „Брадистилов“ на запад през центъра, тихата обслужваща улица към „Баку“ и кръговото като втори обратен завой.",
    spawn: { pointId: "spawn-4" },
    routeNodes: [
      // A: spawn-4 corridor, Б2 stop, right to P1, boulevard north, „Семов"
      // U-turn, boulevard south through the n179974491 light to the 4-way.
      "n415950074", "n331942486", "n331942490", "n7010135318", "n9601848038", "n639792337",
      "n5063751788", "n9601848047", "n6294463135", "n1805512602", "n5997970086", "n1805512645",
      "n6294440266", "n6294440267", "n5613965861", "n6294440269", "n5063751788", "n1113186267",
      "n179974491", "n348207502", "n332113263", "n415950003", "n179974484",
      // G: the center grid westbound („Брадистилов" north → west legs).
      "n8342452192", "n316786260", "n316786261", "n316786262", "n6293978467",
      // G/E: service street south to „Баку".
      "n11364730197", "n685714841", "n685714833",
      // E: „Баку" west, roundabout U-turn, return east over „Боровски".
      "n685714834", "n279646951", "n279646953", "n279646956", "n279646958", "n1038574156",
      "n1038574251", "n707684255", "n707684256", "n279646953", "n279646951", "n685714834",
      "n685714833", "n6805916117", "n415949424", "n179974484", "n415950003", "n332113263",
      "n348207502", "n179974491", "n417233856",
    ],
    bayRef: "l7",
    parkTitleBg: "Паркирай на заден ход в очертаното място вдясно и спри напълно",
    objectives: [
      B2_OBJECTIVE("xH-stop-b2"),
      light("xH-signal-1", "След стопа завий надясно, после наляво по булеварда — премини светофара", "n1805512602", 430.13, 235.3),
      light("xH-signal-2", "Продължи направо през следващия светофар", "n5997970086", 421.91, 275.44),
      zone("xH-turnaround", "Веднага след светофара завий наляво по „Проф. Марко Семов“ и се върни по булеварда на юг", 427.0, 159.0, 18),
      zone("xH-turn-bradistilov", "В края на булеварда завий надясно по „Проф. Георги Брадистилов“", 389.21, -271.99, 20),
      zone("xH-center-north", "Следвай „Брадистилов“ надясно на север, после наляво на запад", 245.03, -211.56, 16),
      zone("xH-center-west", "Продължи на запад по „Брадистилов“", 122.64, -147.86, 16),
      zone("xH-service-south", "Завий наляво на юг по обслужващата улица", 112.76, -268.47, 16),
      zone("xH-turn-west", "Долу завий надясно, на запад", 48.24, -385.6, 16),
      ...roundaboutObjectives("xH", "На кръговото се върни в обратна посока — излез на изток с десен мигач"),
      zone("xH-borovski", "След Т-образното завий наляво, на север по „Боровски“", 234.5, -336.5, 16),
      zone("xH-street-stanoev", "Премини направо през светофара и продължи по „Трайко Станоев“", 620.96, -215.89, 20),
    ],
    slots: [
      leadCarSlot("xH-corridor", "B1-spawn4-straight", B1_SITE),
      priorityLineSlot("xH-priority", "P1-b2-junction", ["n639792337", "n5063751788"], P1_SITE),
      amberSlot("xH-amber", "A1-blvd-north", ["n6294463135", "n1805512602"], A1_SITE),
      // NOTE: no V1 cyclist — H passes the „Боровски" T in the n415949424 →
      // n179974484 direction only (the hook geometry is authored for the
      // opposite approach); no C1 dart — H enters „Баку" AT n685714833, past
      // the C1 crossing's authored westbound approach arm.
      dartSlot("xH-dart", "C9w-baku-mid", ["n685714833", "n685714834"], C9W_SITE),
      roundaboutSlot("xH-roundabout", "R1-rb-se", ["n279646953", "n279646956"], R1_SITE),
    ],
  },
  // -------------------------------------------------------------- Shell I —
  // the western diagonal: F's residential descent (spawn-6 mesh, „Димитров"
  // boulevard with the B6 corridor, the A6 signal cluster), then east over
  // the full „Боян Каменов"/„Брадистилов" diagonal through the uncontrolled
  // 4-way (P3e), the service drop to „Баку" and the roundabout through-move
  // to the „Ташев" bay. Same proven-geometry discipline as shell H: every
  // hop and turn-triple already lives in shells F/D/E/G.
  {
    code: "I",
    nameBg: "Западният диагонал",
    descriptionBg:
      "Жилищната мрежа на „Чилов“, булевард „Димитров“ и светофарите на „Габровски“, целият диагонал на „Боян Каменов“ и „Брадистилов“ на изток, тихата зона към „Баку“ и кръговото към „Ташев“.",
    spawn: { pointId: "spawn-6" },
    routeNodes: [
      // F: „Чилов"/„Трендафилов" mesh, „Кюлявков", „Димитров" boulevard (B6),
      // NW signal cluster (A6), down to the „Габровски"/„Каменов" corner.
      "n316457339", "n316457332", "n10584378815", "n316457330", "n316457328", "n316457204",
      "n366683204", "n316457177", "n331953596", "n316456679", "n316459565", "n2341970006",
      "n10576801890", "n11148400269", "n8297002516", "n2341970004", "n331953595", "n10201904164",
      "n12155370041", "n148570715", "n12155370039", "n12155370032", "n5065993424", "n269951357",
      // D: „Боян Каменов" east through the uncontrolled 4-way (P3e).
      "n10579363851", "n269951355", "n639932179", "n10581457590", "n316786266",
      // D: the center diagonal east.
      "n8585789857", "n8585789858", "n316786265", "n415949137", "n6297569733", "n348707759",
      "n415950249", "n6293978467",
      // E: service street south + „Баку" west.
      "n11364730197", "n685714841", "n685714833", "n685714834",
      // G: roundabout through-move northwest, „Баку" west, „Ташев" tail.
      "n279646951", "n279646953", "n279646956", "n279646958", "n1038574156", "n1038574251",
      "n279646652", "n415949138", "n707737275", "n10911122202", "n10829705443", "n148575255",
      "n148575257", "n4403415572", "n9135347504",
    ],
    bayRef: TASHEV_BAY,
    parkTitleBg: "Паркирай на заден ход в очертаното място вдясно и спри напълно",
    objectives: [
      zone("xI-trendafilov", "Следвай улицата и завий по „Владимир Трендафилов“", -231.37, 344.7, 16),
      zone("xI-kyulyavkov", "Продължи по „Крум Кюлявков“ на югозапад", -196.9, 287.12, 16),
      zone("xI-south", "На „Крум Кюлявков“ завий наляво, на юг", -387.3, 201.32, 16),
      zone("xI-dimitrov", "Излез на булевард „Д-р Г. М. Димитров“ надясно, на югозапад", -217.86, 155.61, 16),
      light("xI-cluster", "Премини светофарите и продължи по „Габровски“ на юг", "n12155370041", -478.91, 17.39),
      zone("xI-kamenov", "На кръстовището завий наляво, на изток по „Проф. Боян Каменов“", -437.26, -79.03, 16),
      zone("xI-4way", "Продължи през кръстовището и надясно по „Брадистилов“", -146.49, -49.42, 16),
      zone("xI-center", "Следвай „Брадистилов“ на изток", 122.64, -147.86, 16),
      zone("xI-service-south", "Завий надясно на юг по обслужващата улица", 112.76, -268.47, 16),
      zone("xI-turn-west", "В края завий надясно, на запад", 100.31, -390.86, 16),
      ...roundaboutObjectives("xI", "През кръговото продължи на северозапад — излез с десен мигач"),
      zone("xI-baku-west", "Продължи на запад по „Баку“", -164.71, -310.27, 18),
      zone("xI-tashev", "Завий наляво на юг, после надясно по „Проф. Арх. Петър А. Ташев“", -334.95, -321.44, 16),
    ],
    slots: [
      leadCarSlot("xI-corridor", "B6-dimitrov-straight", B6_SITE),
      amberSlot("xI-amber", "A6-nw-cluster", ["n10201904164", "n12155370041"], A6_SITE),
      priorityRhrSlot("xI-rhr", "P3e-kamenov-4way", ["n10581457590", "n316786266"], P3E_SITE),
      // NOTE: no C2 dart — I reaches „Кюлявков" through the mesh, never on
      // the n316459565 → n316456672 approach the site was authored for; no
      // C10e dart — the tail drives that „Баку" stretch WESTBOUND while the
      // site's dart is staged for the eastbound approach.
      dartSlot("xI-dart", "C9w-baku-mid", ["n685714833", "n685714834"], C9W_SITE),
      roundaboutSlot("xI-roundabout", "R1-rb-se", ["n279646953", "n279646956"], R1_SITE),
    ],
  },
];

/** Concept links every generated exam reports (mirrors lex-exam-1). */
export const EXAM_BANK_CONCEPT_IDS: readonly string[] = [
  "c-pre-drive-check",
  "c-priority-concept",
  "c-give-way-stop-behavior",
  "c-light-junction",
  "c-roundabout-rules",
  "c-crosswalk-yield",
  "c-braking-distance",
  "c-speed-adaptation",
  "c-reversing",
  "c-maneuver-principles",
];
