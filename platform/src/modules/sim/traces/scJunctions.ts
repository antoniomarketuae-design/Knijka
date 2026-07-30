/**
 * scJunctions — the S2-B authored drives (doc 76 §5/§9) for the four
 * JUNCTION/SIGNALS templates, on the committed generated districts:
 *
 *   sc-junction-rhr       tj-rhr-v1   shadow + barge + no-look
 *   sc-junction-stop      tj-stop-v1  shadow + rolling-stop + past-line
 *   sc-signal-response    sx-v1       shadow + amber-gamble + red-creep
 *   sc-turn-left-oncoming sx-v1       shadow + cut-gap + no-indicator
 *
 * The scripts are the SOURCE of the committed traces under
 * content/traces/<template>/ — the per-map trace-gate tests replay exactly
 * these through the production stack (runtime + traffic + scenario director
 * + rules) and assert the §5 shadow gate (ZERO violations) and the §9 stage-5
 * code asserts (each mistake grades EXACTLY its authored codeRefs).
 *
 * Geometry pinned to the generated districts (batteries prove the numbers):
 *   - drawn lane centers at ±4.0625 m off the road centerline;
 *   - primary/secondary stop lines 27.725 m from the junction node
 *     (tj-stop stem: y = −27.725; sx arms: |x| or |y| = 27.725);
 *   - the tj-rhr core (right-hand-rule conviction zone) is 18 m around the
 *     node; the shadow YIELDS at y = −19.5 — outside the core, inside the
 *     40 m junction area where the tracker latches the yield.
 *
 * Signal determinism: sx recordings that must ARRIVE ON RED pin the cluster
 * offset through the recorder's signalOffsets option (the doc 72 N2 dial):
 * offset 23 puts the ns approach on red for t ∈ [0, 26), redYellow at 26,
 * green from 27 (SIGNAL_TIMING cycle 50, natural sx offset is 1 = green at
 * t=0). The left-turn recordings pin the EW approach green from t ≈ 6.5
 * (offset 18.5). The amber-gamble demo pins NOTHING — the amberDilemma
 * runner (template staged event, minTriggerSpeedKmh 21) owns the flip; the
 * slower shadow/red-creep approaches never arm it.
 *
 * Rule-engine envelope notes (why the numbers are what they are):
 *   - Yield waits at lights keep the car ≥ 3.3 m before the line — outside
 *     the STOP_LINE_OVERSHOOT watch window (1.2 + 2 m); the red-creep demo
 *     deliberately rests at 0.78 m (inside the convict band) having arrived
 *     on red, so the lawful-presence latch never arms.
 *   - Waits at a GREEN light are done with the maneuver indicator ON, or at
 *     a 2 km/h creep — both block HESITATION_AT_GREEN by its own gates.
 *   - Turn arcs run at ≥ 12 km/h so the mid-corner lane-offset excursion
 *     stays under the 3 s POOR_LANE_KEEPING sustain.
 */

import type { StagedEventSpec } from "../contracts";
import {
  SC_JUNCTION_RHR,
  SC_SIGNAL_RESPONSE,
  SC_TURN_LEFT_ONCOMING,
} from "../lessons/scenario/templates-junctions";
import {
  recordScriptedDrive,
  type DriveScript,
  type DriveStep,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

/** Drawn lane-center offset on every S2-B map, m. */
const LANE = 4.0625;

/** ns-red-at-start pin for sx-v1: red [0,26), redYellow 26, green 27..46. */
export const SX_PIN_NS_RED_AT_START = { "sx-n-c": 23 } as const;
/** ew-green-from-6.5s pin for sx-v1 (left-turn window: green [6.5, 26.5)). */
export const SX_PIN_EW_GREEN_WINDOW = { "sx-n-c": 18.5 } as const;

/** Arc polyline: center (cx, cy), radius r, param a0→a1 deg (8 segments). */
function arcPts(cx: number, cy: number, r: number, a0: number, a1: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let k = 1; k <= 8; k++) {
    const a = ((a0 + ((a1 - a0) * k) / 8) * Math.PI) / 180;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// sc-junction-rhr — tj-rhr-v1 (spawn (4.06, −105) heading north up the stem)
// ---------------------------------------------------------------------------

export const SC_JUNCTION_RHR_ID = "sc-junction-rhr";

/**
 * Stem approach: spawn → cruise toward the junction, IN THE RIGHT LANE the
 * whole way. It used to open `[0, −105] [0, −103] [LANE, −92]` — a 13 m merge
 * out of the осева — because the district's spawn pose WAS the осева (doc 87
 * T2). The pose is now the lane centre in content/world/tj-*.json, so the
 * demonstrated-correct drive no longer begins by leaving a line no driver
 * should have been on. Same geometry from y = −92 onward.
 */
const TJ_APPROACH: Array<[number, number]> = [
  [LANE, -105],
  [LANE, -34],
];

/** Left turn stem → west arm: R = 18 quarter arc, center (−13.94, −13.94). */
const TJ_LEFT_TURN: Array<[number, number]> = [
  [LANE, -13.94],
  ...arcPts(-13.94, -13.94, 18.0025, 0, 90),
];

function scJunctionRhrShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Равнозначно кръстовище напред: никакви знаци — важи правилото на дясното." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: TJ_APPROACH, targetKmh: 22 },
      { kind: "annotation", textBg: "Намали, пусни ляв мигач и се огледай: първо наляво, после НАДЯСНО." },
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      {
        // Ease to the yield point OUTSIDE the 18 m conviction core.
        kind: "drive",
        points: [
          [LANE, -34],
          [LANE, -19.5],
        ],
        targetKmh: 10,
      },
      { kind: "annotation", textBg: "Кола отдясно — тя има предимство. Спираме и я пропускаме изцяло." },
      { kind: "pause", sec: 8.0, brake: true },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Пътят е чист — завиваме наляво уверено." },
      {
        kind: "drive",
        points: [
          [LANE, -19.5],
          ...TJ_LEFT_TURN,
          [-30, LANE],
          [-55, LANE],
        ],
        targetKmh: 16,
      },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: пропусна идващия отдясно и премина безопасно." },
    ],
  };
}

function scJunctionRhrMistakeBargeScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: кръстовището изглежда празно и скоростта изобщо не пада." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: TJ_APPROACH, targetKmh: 22 },
      { kind: "indicator", setting: "left" },
      {
        // Constant-speed barge straight through the core while the car from
        // the right is inbound — the RHR tracker convicts (FAILED_TO_YIELD).
        kind: "drive",
        points: [
          [LANE, -34],
          [LANE, -13.94],
          ...arcPts(-13.94, -13.94, 18.0025, 0, 90),
          [-30, LANE],
          [-52, LANE],
        ],
        targetKmh: 20,
      },
      { kind: "pause", sec: 1.8, brake: true },
      {
        kind: "annotation",
        textBg: "Колата отдясно трябваше да мине първа — навлизането пред нея е отнето предимство.",
      },
    ],
  };
}

function scJunctionRhrMistakeNoLookScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Гледай какво става, когато главата не се завърти надясно." },
      { kind: "drive", points: TJ_APPROACH, targetKmh: 20 },
      { kind: "indicator", setting: "left" },
      { kind: "annotation", textBg: "Никакво оглеждане — колата се вмъква направо в кръстовището." },
      {
        // INTO THE MIDDLE OF THE BOX, AND ON THE PRIORITY CAR'S CLOCK (founder
        // R0: „the car actually must enter the junction to the middle of it so
        // it creates disturbance for the traffic car which almost collides with
        // it; currently the shadow car is just stopping and the traffic car
        // passes normally with enormous distance between them").
        //
        // The priority car runs the east→west lane at y = +4.06 and is released
        // when the ego reaches y = −40 (PRIORITY_COMMIT_PLAYER_M), crossing our
        // lane ~7.5 s later. The old demo halted at y = −15 and let it go by
        // with ~19 m of air; even rolling to y = +1.5 at 15 km/h arrived a full
        // 2.7 s late — the car had cleared the box before the ego got there.
        // 24 km/h over the same 36 m lands the ego's body ACROSS that lane just
        // as the car closes: playerGuard (lateral < 3 m of the ego's centre)
        // forces it into an 8 m/s² emergency stop, and it still arrives inside
        // the runner's own 3 m contact test at t ≈ 20.4 while the ego is
        // rolling to its halt. So the COLLISION this demo has always DECLARED
        // is now a real meeting of two bodies — the authored beat is gone, the
        // code comes from the encounter itself, and the priority car is visibly
        // standing on its brakes when it lands.
        //
        // The RHR tracker does NOT double-bill: the ego is braking hard (>=
        // 2.5 m/s², stopAtEnd) from before the conflict enters the 26 m
        // conviction radius, which is exactly the C1/D1 braking-response
        // immunity — so the drive still grades EXACTLY [COLLISION], the
        // template's codeRefs, unchanged.
        kind: "drive",
        points: [
          [LANE, -34],
          [LANE, 2],
        ],
        targetKmh: 24,
        stopAtEnd: true,
      },
      // Short on purpose: the two bodies end 2.3 m apart, which the lead-gap
      // query publishes as a 0 m standstill gap — under standstillMinGapM
      // (1.5 m). Holding that pose past standstillGapSustainSec (1.5 s) piles
      // STANDSTILL_GAP_TOO_CLOSE on top of the collision and breaks the
      // exact-code gate, so the aftermath is 1.2 s here; the clip window
      // (fault + 4 s, clamped to the trace) carries the rest.
      { kind: "pause", sec: 1.2, brake: true },
      {
        kind: "annotation",
        textBg: "Колата отдясно закова спирачки на метри от вратата. Наляво, НАДЯСНО — и чак тогава напред.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// sc-junction-stop — tj-stop-v1 (Б2 line at y = −27.725 on the stem)
// ---------------------------------------------------------------------------

export const SC_JUNCTION_STOP_ID = "sc-junction-stop";

/** Right turn stem → east arm: R = 20 quarter arc, center (24.06, −24.06). */
const TJ_RIGHT_TURN: Array<[number, number]> = [
  [LANE, -24.06],
  ...arcPts(24.0625, -24.0625, 20, 180, 90),
];

function scJunctionStopShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Напред е път с предимство и знак Б2 „Спри!“ — тук се спира винаги." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE, -105], [LANE, -45]], targetKmh: 25 },
      { kind: "annotation", textBg: "Десен мигач и плавно към стоп-линията." },
      { kind: "indicator", setting: "right" },
      {
        kind: "drive",
        points: [
          [LANE, -45],
          [LANE, -29.2],
        ],
        targetKmh: 12,
      },
      { kind: "annotation", textBg: "Пълно спиране ПРЕДИ линията: колелата неподвижни, броим до три." },
      { kind: "pause", sec: 2.5, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "glance", mirror: "left" },
      { kind: "annotation", textBg: "Наляво, надясно и пак наляво — чисто е. Потегляме." },
      {
        kind: "drive",
        points: [
          [LANE, -29.2],
          ...TJ_RIGHT_TURN,
          [58, -LANE],
        ],
        targetKmh: 15,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Точно така се взима знак Стоп: пълно спиране, оглеждане, уверено потегляне." },
    ],
  };
}

function scJunctionStopMistakeRollingScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката „почти спрях“: скоростта пада, но колелата не спират." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE, -105], [LANE, -45]], targetKmh: 25 },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[LANE, -45], [LANE, -34]], targetKmh: 14 },
      {
        // The rolling stop: ~5 km/h across the Б2 line, never at rest.
        kind: "drive",
        points: [
          [LANE, -34],
          [LANE, -24.06],
        ],
        targetKmh: 5,
        stopAtEnd: false,
      },
      {
        kind: "drive",
        points: [
          ...arcPts(24.0625, -24.0625, 20, 180, 90),
          [55, -LANE],
        ],
        targetKmh: 14,
      },
      { kind: "pause", sec: 1.8, brake: true },
      {
        kind: "annotation",
        textBg: "Линията мина под колата в движение. На Б2 се спира ДОКРАЙ — всеки път, без изключение.",
      },
    ],
  };
}

function scJunctionStopMistakePastLineScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката „спрях след линията“: спирачката идва твърде късно." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE, -105], [LANE, -45]], targetKmh: 25 },
      {
        // Late braking: the smooth stop lands 3.2 m PAST the line — the
        // crossing itself happens at ~16 km/h, so the Б2 offence is already
        // committed before the car ever rests.
        kind: "drive",
        points: [
          [LANE, -45],
          [LANE, -24.5],
        ],
        targetKmh: 22,
      },
      { kind: "pause", sec: 2.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Колата спря, но ЧАК след линията — с нос в кръстовището. Пресече ли линията без пълно спиране, нарушението вече е факт.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// sc-signal-response — sx-v1 (line at y = −27.725; ns pinned red at start
// for the shadow/red-creep; the amber demo rides the natural offset and the
// template's amberDilemma runner)
// ---------------------------------------------------------------------------

export const SC_SIGNAL_RESPONSE_ID = "sc-signal-response";

function scSignalShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Светофарът напред свети червено — решението за спиране се взима отрано." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE, -105], [LANE, -78]], targetKmh: 30 },
      { kind: "annotation", textBg: "Плавно спиране: без резки движения, целим 1–2 метра преди линията." },
      {
        // 17 km/h from 78 m out: comfortably under the amberDilemma arm
        // threshold (21 km/h at ≤ 60 m) — the shadow never triggers the
        // JU-06 runner; the authored red-arrival pin governs the lights.
        kind: "drive",
        points: [
          [LANE, -78],
          [LANE, -31.5],
        ],
        targetKmh: 17,
      },
      // Red until t=26, green at t=27 (pinned offset 23) — the pause holds
      // through redYellow and releases just into green (tuned to arrival).
      { kind: "pause", sec: 11.6, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Зелено: бърз поглед наляво и надясно и потегляме без бавене." },
      {
        // Through the box at ≤ 19 km/h: the amberDilemma runner arms on ANY
        // ≥ 21 km/h approach inside 60 m — including this post-crossing leg
        // while still south of the node — and would re-pin the lights.
        kind: "drive",
        points: [
          [LANE, -31.5],
          [LANE, -2],
        ],
        targetKmh: 19,
      },
      {
        kind: "drive",
        points: [
          [LANE, -2],
          [LANE, 20],
          [LANE, 48],
        ],
        targetKmh: 28,
      },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Изчака червеното преди линията и премина на зелено — точно това гледа изпитващият." },
    ],
  };
}

function scSignalMistakeAmberScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката „жълтото е още зелено“: газта остава натисната." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE, -105], [LANE, -86]], targetKmh: 28 },
      {
        // Constant 22 km/h through the arm: the template's amberDilemma
        // runner arms at 60 m (≥ 21 km/h) and pins the green→yellow flip
        // 2.6 s of travel before the line — crossing lands ON yellow with a
        // comfortable stop available (stoppable: true → the graded gamble).
        kind: "drive",
        points: [
          [LANE, -86],
          [LANE, 48],
        ],
        targetKmh: 22,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Имаше място за спокойно спиране, а линията беше пресечена на жълто. Жълтото забранява навлизането — освен когато спирането вече е опасно.",
      },
    ],
  };
}

function scSignalMistakeRedCreepScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката „пропълзяване“: спирачката идва късно и колата спира върху линията." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE, -105], [LANE, -78]], targetKmh: 30 },
      {
        // Late, lazy braking on the red: rest lands 0.78 m short of the
        // line — the nose (≈ 2.15 m overhang) hangs over it, on the
        // pedestrians' space. Arrived on red ⇒ no lawful-presence latch ⇒
        // STOP_LINE_OVERSHOOT convicts after 0.7 s at rest. 17 km/h keeps
        // the amberDilemma runner unarmed (< 21 km/h inside 60 m).
        kind: "drive",
        points: [
          [LANE, -78],
          [LANE, -28.5],
        ],
        targetKmh: 17,
      },
      { kind: "pause", sec: 3.5, brake: true },
      {
        kind: "annotation",
        textBg: "Предницата стои НАД стоп-линията, на мястото на пешеходците. Целта е 1–2 метра ПРЕДИ линията.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// sc-turn-left-oncoming — sx-v1 (spawn (105, 4.06) heading west; EW green
// pinned over the encounter window; two staged oncoming cars from the west)
// ---------------------------------------------------------------------------

export const SC_TURN_LEFT_ONCOMING_ID = "sc-turn-left-oncoming";

const SX_EAST_APPROACH: Array<[number, number]> = [
  [105, LANE],
  [52, LANE],
];

/**
 * Left turn east arm → south arm: R = 15 quarter arc, center
 * (10.94, −10.94). The radius is a DETECTOR constraint, not styling: the
 * turn detector needs 55° of heading change inside a 3 s window, so the
 * quarter must complete in under ~4.9 s — R15 at the corner's curve-capped
 * ~6 m/s does (a wider R22 at the same speed never registers the turn).
 */
const SX_LEFT_TURN: Array<[number, number]> = [
  [10.9375, LANE],
  ...arcPts(10.9375, -10.9375, 15, 90, 180),
];

function scLtapShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Ляв завой през насрещно движение: мигач отрано и интервалът се брои в секунди." },
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: SX_EAST_APPROACH, targetKmh: 25 },
      { kind: "annotation", textBg: "Насрещна кола на около секунда и половина — това е чакане, не спринт." },
      {
        kind: "drive",
        points: [
          [52, LANE],
          [31.2, LANE],
        ],
        targetKmh: 14,
      },
      // Yield: the tight oncoming (sc-ltap-tight) commits and passes; the
      // follow car (sc-ltap-follow) is still ~6 s out when we go.
      { kind: "pause", sec: 7.5, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Близкият премина, следващият е далеч — завиваме решително." },
      {
        kind: "drive",
        points: [
          [31.2, LANE],
          ...SX_LEFT_TURN,
          [-LANE, -30],
          [-LANE, -56],
        ],
        targetKmh: 20,
      },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Изчака тесния интервал и прие плътния — така се завива наляво." },
    ],
  };
}

function scLtapMistakeCutScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката „ще успея“: завой пред насрещен на секунда и половина." },
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[105, LANE], [40, LANE]], targetKmh: 26 },
      {
        // The cut: constant speed through the mouth and across the oncoming's
        // lane while it is ~1.4 s from the junction — the N1 tracker convicts
        // (FAILED_TO_YIELD, left-turn-oncoming).
        kind: "drive",
        points: [
          [40, LANE],
          ...SX_LEFT_TURN,
          [-LANE, -30],
          [-LANE, -52],
        ],
        targetKmh: 24,
      },
      { kind: "pause", sec: 1.8, brake: true },
      {
        kind: "annotation",
        textBg:
          "Насрещният трябваше да спира заради нас. Левият завой отнема 2–3 секунди от неговата лента — под 4 секунди интервал се чака.",
      },
    ],
  };
}

function scLtapMistakeNoIndicatorScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Изчакването е правилно — но никой не знае, че ще завиваме: мигач няма." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: SX_EAST_APPROACH, targetKmh: 25 },
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[52, LANE], [37, LANE]], targetKmh: 12 },
      {
        // Creep instead of a full rest: 2 km/h toward the mouth (a stationary
        // wait at a GREEN light with no indicator would be „закъснели
        // действия" — the creep is the honest way to hold without declaring).
        kind: "drive",
        points: [
          [37, LANE],
          [31.2, LANE],
        ],
        targetKmh: 2,
        stopAtEnd: false,
      },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      {
        // The turn itself — properly yielded, but UNSIGNALED.
        kind: "drive",
        points: [
          [31.2, LANE],
          ...SX_LEFT_TURN,
          [-LANE, -30],
          [-LANE, -52],
        ],
        targetKmh: 20,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Завоят започна без ляв мигач — насрещните и колоната отзад нямаше как да го предвидят.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry — one deterministic function)
// ---------------------------------------------------------------------------

export type ScJunctionTemplateId =
  | typeof SC_JUNCTION_RHR_ID
  | typeof SC_JUNCTION_STOP_ID
  | typeof SC_SIGNAL_RESPONSE_ID
  | typeof SC_TURN_LEFT_ONCOMING_ID;

export type ScJunctionTraceName =
  | "shadow-correct"
  | "mistake-barge"
  | "mistake-no-look"
  | "mistake-rolling-stop"
  | "mistake-past-line"
  | "mistake-amber-gamble"
  | "mistake-red-creep"
  | "mistake-cut-gap"
  | "mistake-no-indicator";

interface JunctionRecordingSpec {
  kind: "shadow" | "mistake";
  script: () => DriveScript;
  signalOffsets?: Readonly<Record<string, number>>;
}

interface JunctionTemplateRecordings {
  districtId: string;
  stagedEvents: StagedEventSpec[];
  drives: Partial<Record<ScJunctionTraceName, JunctionRecordingSpec>>;
}

export const SC_JUNCTION_RECORDINGS: Record<ScJunctionTemplateId, JunctionTemplateRecordings> = {
  [SC_JUNCTION_RHR_ID]: {
    districtId: "tj-rhr-v1",
    stagedEvents: [...(SC_JUNCTION_RHR.staged ?? [])],
    drives: {
      "shadow-correct": { kind: "shadow", script: scJunctionRhrShadowScript },
      "mistake-barge": { kind: "mistake", script: scJunctionRhrMistakeBargeScript },
      "mistake-no-look": { kind: "mistake", script: scJunctionRhrMistakeNoLookScript },
    },
  },
  [SC_JUNCTION_STOP_ID]: {
    districtId: "tj-stop-v1",
    stagedEvents: [],
    drives: {
      "shadow-correct": { kind: "shadow", script: scJunctionStopShadowScript },
      "mistake-rolling-stop": { kind: "mistake", script: scJunctionStopMistakeRollingScript },
      "mistake-past-line": { kind: "mistake", script: scJunctionStopMistakePastLineScript },
    },
  },
  [SC_SIGNAL_RESPONSE_ID]: {
    districtId: "sx-v1",
    stagedEvents: [...(SC_SIGNAL_RESPONSE.staged ?? [])],
    drives: {
      "shadow-correct": {
        kind: "shadow",
        script: scSignalShadowScript,
        signalOffsets: SX_PIN_NS_RED_AT_START,
      },
      "mistake-amber-gamble": { kind: "mistake", script: scSignalMistakeAmberScript },
      "mistake-red-creep": {
        kind: "mistake",
        script: scSignalMistakeRedCreepScript,
        signalOffsets: SX_PIN_NS_RED_AT_START,
      },
    },
  },
  [SC_TURN_LEFT_ONCOMING_ID]: {
    districtId: "sx-v1",
    stagedEvents: [...(SC_TURN_LEFT_ONCOMING.staged ?? [])],
    drives: {
      "shadow-correct": {
        kind: "shadow",
        script: scLtapShadowScript,
        signalOffsets: SX_PIN_EW_GREEN_WINDOW,
      },
      "mistake-cut-gap": {
        kind: "mistake",
        script: scLtapMistakeCutScript,
        signalOffsets: SX_PIN_EW_GREEN_WINDOW,
      },
      "mistake-no-indicator": {
        kind: "mistake",
        script: scLtapMistakeNoIndicatorScript,
        signalOffsets: SX_PIN_EW_GREEN_WINDOW,
      },
    },
  },
};

/** Trace names of one template, in committed order (shadow first). */
export function scJunctionTraceNames(templateId: ScJunctionTemplateId): ScJunctionTraceName[] {
  return Object.keys(SC_JUNCTION_RECORDINGS[templateId].drives) as ScJunctionTraceName[];
}

/**
 * Record one S2-B drive against ITS loaded district document — staged
 * events from the template (the same set compiled lessons run), signal
 * offsets per the recording's authored pin. Deterministic: same district →
 * same trace (seed 7, the house recording seed).
 */
export function recordScJunctionDrive(
  districtRaw: unknown,
  templateId: ScJunctionTemplateId,
  name: ScJunctionTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const template = SC_JUNCTION_RECORDINGS[templateId];
  const rec = template.drives[name];
  if (!rec) throw new Error(`recordScJunctionDrive: ${templateId} has no drive "${name}"`);
  return recordScriptedDrive(districtRaw, rec.script(), {
    scenarioId: templateId,
    kind: rec.kind,
    seed: 7,
    stagedEvents: template.stagedEvents,
    collisionMinKmh: 0,
    ...(rec.signalOffsets ? { signalOffsets: rec.signalOffsets } : {}),
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}

// Type-only reference so the DriveStep union import stays load-bearing for
// consumers reading this file as the authoring example.
export type { DriveStep as ScJunctionDriveStep };
