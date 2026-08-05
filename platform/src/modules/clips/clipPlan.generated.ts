/**
 * GENERATED FILE — do not edit. Regenerate with:
 *   node tools/clips/gen_clip_plan.mjs
 * (runs the clip-plan generator through vitest — GEN_CLIP_PLAN=1, the
 * RECORD_TRACES precedent; plain node cannot import the TS recorder stack.)
 *
 * The PLAN half of the produced-media contract (doc 66): per pilot clip the
 * ENGINE-computed first-violation time (R3 — replayed through the production
 * grading stack, never guessed from annotations) plus the machine-derived
 * requirement card (R1 required actors / R2 governing control / R4 view).
 * PLAN writes, the RIG consumes it verbatim, and /review/clips renders it as
 * the requirements card. Freshness is test-gated: clipPlan.test.ts recomputes
 * everything from the committed traces + templates + districts and fails on
 * any drift.
 */

/** One actor the mistake concerns (doc 66 R1). Kinds: "vehicle" |
 *  "pedestrian" | "cyclist" | "emergency" | "police" | "controller" |
 *  "parkedVehicle" | "tram". */
export interface ClipRequiredActor {
  kind: string;
  label: string;
}

/** The sign/signal/marking that explains WHY (doc 66 R2); "none" = the fault
 *  follows from a conduct rule or the conditions, no control to frame. */
export interface ClipGoverningControl {
  kind: "sign" | "signal" | "marking" | "none";
  label: string;
  /** District-space position, when derivable from the map data. */
  approxPos?: { x: number; y: number };
}

/** Camera requirement per doc 66 R4 (cabin faults show the cabin). */
export type ClipView = "exterior" | "cockpit" | "exterior+dashboard";

/** Exterior camera profile (doc 66 R1): "rearAware" when the mistake's key
 *  actor approaches from BEHIND the ghost (ambulance, tailgater) — a side
 *  three-quarter framing that keeps both the ghost and the rear approach in
 *  frame; "chase" everywhere else. Ignored for cockpit clips. */
export type ClipCameraProfile = "chase" | "rearAware";

/** Positional-fault readability: the REQUIRED lane's band, tinted green for
 *  ~2 s at the fault by the rig (district space; derived from the map's own
 *  lane meta). Emitted only where the fault is positional. */
export interface ClipLaneHighlight {
  /** Lane-center x, district m. */
  xM: number;
  /** Fault y — the band renders around it, district m. */
  yM: number;
  /** Band width, m (lane spacing minus an edge margin). */
  widthM: number;
}

export interface ClipPlanEntry {
  /** Manifest clip id — `<templateId>__m<mistakeIndex>` (clipPilot contract). */
  id: string;
  templateId: string;
  mistakeIndex: number;
  /** Repo-relative committed trace, EXACTLY the mistake's traceRef.path. */
  tracePath: string;
  /** ENGINE-computed time of the FIRST violation the mistake cites, s. */
  faultTimeSec: number;
  requiredActors: ClipRequiredActor[];
  governingControl: ClipGoverningControl;
  view: ClipView;
  camera: ClipCameraProfile;
  laneHighlight?: ClipLaneHighlight;
  /** Derivation caveats (Bulgarian, terse); "" = fully unambiguous. */
  notes: string;
}

export const CLIP_PLAN: readonly ClipPlanEntry[] = [
  {
    "id": "sc-ac-crosswind__m1",
    "templateId": "sc-ac-crosswind",
    "mistakeIndex": 1,
    "tracePath": "content/traces/sc-ac-crosswind/mistake-overcorrect.trace.json",
    "faultTimeSec": 20.57,
    "requiredActors": [],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior",
    "camera": "chase",
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал)"
  },
  {
    "id": "sc-ac-night-lights__m0",
    "templateId": "sc-ac-night-lights",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-ac-night-lights/mistake-never-on.trace.json",
    "faultTimeSec": 2.63,
    "requiredActors": [],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior+dashboard",
    "camera": "chase",
    "notes": "Управляващ елемент: няма — нощни условия; Светлинна грешка (R4) — фаровете отвън + лентата на таблото"
  },
  {
    "id": "sc-ac-rain-lights__m0",
    "templateId": "sc-ac-rain-lights",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-ac-rain-lights/mistake-never-on.trace.json",
    "faultTimeSec": 3.63,
    "requiredActors": [],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior+dashboard",
    "camera": "chase",
    "notes": "Управляващ елемент: няма — дъждовни условия; Светлинна грешка (R4) — фаровете отвън + лентата на таблото"
  },
  {
    "id": "sc-accident-own-conduct__m0",
    "templateId": "sc-accident-own-conduct",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-accident-own-conduct/mistake-hit-and-flee.trace.json",
    "faultTimeSec": 14.75,
    "requiredActors": [],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior",
    "camera": "chase",
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал)"
  },
  {
    "id": "sc-animal-hazard__m0",
    "templateId": "sc-animal-hazard",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-animal-hazard/mistake-swerve-oncoming.trace.json",
    "faultTimeSec": 13.98,
    "requiredActors": [
      {
        "kind": "vehicle",
        "label": "Насрещен поток автомобили"
      }
    ],
    "governingControl": {
      "kind": "marking",
      "label": "Маркировка М1 (плътна осева линия)",
      "approxPos": {
        "x": 0,
        "y": 90
      }
    },
    "view": "exterior",
    "camera": "chase",
    "notes": ""
  },
  {
    "id": "sc-driver-distraction__m0",
    "templateId": "sc-driver-distraction",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-driver-distraction/mistake-late-react.trace.json",
    "faultTimeSec": 12.07,
    "requiredActors": [
      {
        "kind": "pedestrian",
        "label": "Пешеходец, който стъпва на пътеката"
      }
    ],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior",
    "camera": "chase",
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал)"
  },
  {
    "id": "sc-follow-distance__m0",
    "templateId": "sc-follow-distance",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-follow-distance/mistake-tailgate.trace.json",
    "faultTimeSec": 4.53,
    "requiredActors": [
      {
        "kind": "vehicle",
        "label": "Автомобил отпред в лентата (води)"
      }
    ],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior",
    "camera": "chase",
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал)"
  },
  {
    "id": "sc-hz-brake-dont-swerve__m0",
    "templateId": "sc-hz-brake-dont-swerve",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-hz-brake-dont-swerve/mistake-blind-swerve.trace.json",
    "faultTimeSec": 14.62,
    "requiredActors": [
      {
        "kind": "vehicle",
        "label": "Автомобил, който се вклинява отпред"
      }
    ],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior",
    "camera": "chase",
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал)"
  },
  {
    "id": "sc-hz-breakdown-pulloff__m0",
    "templateId": "sc-hz-breakdown-pulloff",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-hz-breakdown-pulloff/mistake-shoulder-drive.trace.json",
    "faultTimeSec": 20.72,
    "requiredActors": [],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior+dashboard",
    "camera": "chase",
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал); Контролна лампа (R4) — червеният индикатор свети на лентата на таблото при грешката"
  },
  {
    "id": "sc-junction-rhr__m1",
    "templateId": "sc-junction-rhr",
    "mistakeIndex": 1,
    "tracePath": "content/traces/sc-junction-rhr/mistake-no-look.trace.json",
    "faultTimeSec": 20.23,
    "requiredActors": [
      {
        "kind": "vehicle",
        "label": "Автомобил отдясно с предимство"
      }
    ],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior",
    "camera": "chase",
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал)"
  },
  {
    "id": "sc-junction-stop__m0",
    "templateId": "sc-junction-stop",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-junction-stop/mistake-rolling-stop.trace.json",
    "faultTimeSec": 16.72,
    "requiredActors": [],
    "governingControl": {
      "kind": "sign",
      "label": "Знак Б2 „Спри!“",
      "approxPos": {
        "x": 8.93,
        "y": -28.52
      }
    },
    "view": "exterior",
    "camera": "chase",
    "notes": ""
  },
  {
    "id": "sc-jx-giveway-b1__m0",
    "templateId": "sc-jx-giveway-b1",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-jx-giveway-b1/mistake-barge-priority.trace.json",
    "faultTimeSec": 45.4,
    "requiredActors": [
      {
        "kind": "vehicle",
        "label": "Автомобил отдясно с предимство"
      }
    ],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior",
    "camera": "chase",
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал); Отзад има само сценичен натиск (лепка), а изискваният участник е ОТПРЕД — преследваща камера (chase), за да остане изискваният участник в кадър"
  },
  {
    "id": "sc-jx-giveway-b1__m1",
    "templateId": "sc-jx-giveway-b1",
    "mistakeIndex": 1,
    "tracePath": "content/traces/sc-jx-giveway-b1/mistake-no-scan.trace.json",
    "faultTimeSec": 17.12,
    "requiredActors": [
      {
        "kind": "vehicle",
        "label": "Автомобил отдясно с предимство"
      }
    ],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior",
    "camera": "chase",
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал); Отзад има само сценичен натиск (лепка), а изискваният участник е ОТПРЕД — преследваща камера (chase), за да остане изискваният участник в кадър"
  },
  {
    "id": "sc-jx-priority-confidence__m0",
    "templateId": "sc-jx-priority-confidence",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-jx-priority-confidence/mistake-phantom-brake.trace.json",
    "faultTimeSec": 8.07,
    "requiredActors": [
      {
        "kind": "vehicle",
        "label": "Автомобил отдясно с предимство"
      }
    ],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior",
    "camera": "chase",
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал); Отзад има само сценичен натиск (лепка), а изискваният участник е ОТПРЕД — преследваща камера (chase), за да остане изискваният участник в кадър"
  },
  {
    "id": "sc-lane-change__m0",
    "templateId": "sc-lane-change",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-lane-change/mistake-no-indicator.trace.json",
    "faultTimeSec": 17.67,
    "requiredActors": [
      {
        "kind": "vehicle",
        "label": "Автомобил ОТЗАД в съседната лента (мъртва зона)"
      }
    ],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior",
    "camera": "rearAware",
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал); Ключовият участник идва ОТЗАД — страничен три-четвърти кадър (rearAware), който държи и призрака, и приближаващия отзад в рамката"
  },
  {
    "id": "sc-lane-control-signal__m0",
    "templateId": "sc-lane-control-signal",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-lane-control-signal/mistake-closed-lane.trace.json",
    "faultTimeSec": 2.13,
    "requiredActors": [
      {
        "kind": "vehicle",
        "label": "Насрещен поток автомобили"
      }
    ],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior",
    "camera": "chase",
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал)"
  },
  {
    "id": "sc-ln-obstacle-meeting__m0",
    "templateId": "sc-ln-obstacle-meeting",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-ln-obstacle-meeting/mistake-pull-out.trace.json",
    "faultTimeSec": 16.43,
    "requiredActors": [
      {
        "kind": "vehicle",
        "label": "Насрещен поток автомобили"
      },
      {
        "kind": "vehicle",
        "label": "Насрещен автомобил в стеснението"
      }
    ],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior",
    "camera": "chase",
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал)"
  },
  {
    "id": "sc-merge-accel-lane__m0",
    "templateId": "sc-merge-accel-lane",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-merge-accel-lane/mistake-stop-at-end.trace.json",
    "faultTimeSec": 14.5,
    "requiredActors": [],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior",
    "camera": "rearAware",
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал); Ключовият участник идва ОТЗАД — страничен три-четвърти кадър (rearAware), който държи и призрака, и приближаващия отзад в рамката"
  },
  {
    "id": "sc-merge-bus-pullout__m0",
    "templateId": "sc-merge-bus-pullout",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-merge-bus-pullout/mistake-force-past.trace.json",
    "faultTimeSec": 16.32,
    "requiredActors": [
      {
        "kind": "vehicle",
        "label": "Камион, който се вклинява отпред"
      }
    ],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior",
    "camera": "chase",
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал)"
  },
  {
    "id": "sc-merge-from-property__m1",
    "templateId": "sc-merge-from-property",
    "mistakeIndex": 1,
    "tracePath": "content/traces/sc-merge-from-property/mistake-signal-and-go.trace.json",
    "faultTimeSec": 23.48,
    "requiredActors": [
      {
        "kind": "vehicle",
        "label": "Насрещен поток автомобили"
      }
    ],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior",
    "camera": "chase",
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал)"
  },
  {
    "id": "sc-mv-uturn-ban__m1",
    "templateId": "sc-mv-uturn-ban",
    "mistakeIndex": 1,
    "tracePath": "content/traces/sc-mv-uturn-ban/mistake-into-stream.trace.json",
    "faultTimeSec": 33.65,
    "requiredActors": [
      {
        "kind": "vehicle",
        "label": "Насрещен поток автомобили"
      }
    ],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior",
    "camera": "chase",
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал)"
  },
  {
    "id": "sc-mw-discipline__m0",
    "templateId": "sc-mw-discipline",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-mw-discipline/mistake-left-hog.trace.json",
    "faultTimeSec": 12.62,
    "requiredActors": [],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior",
    "camera": "chase",
    "laneHighlight": {
      "xM": 0,
      "yM": 190.33,
      "widthM": 6.52
    },
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал); Позиционна грешка — ДЯСНАТА (изискваната) лента светва зелено ~2 с при грешката"
  },
  {
    "id": "sc-ov-ban-overtake__m0",
    "templateId": "sc-ov-ban-overtake",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-ov-ban-overtake/mistake-overtake-in-zone.trace.json",
    "faultTimeSec": 26.47,
    "requiredActors": [
      {
        "kind": "vehicle",
        "label": "Автомобил отпред в лентата (води)"
      }
    ],
    "governingControl": {
      "kind": "sign",
      "label": "Знак В24 (забранено изпреварване)",
      "approxPos": {
        "x": 21.05,
        "y": 90
      }
    },
    "view": "exterior",
    "camera": "chase",
    "notes": ""
  },
  {
    "id": "sc-ov-solid-line__m0",
    "templateId": "sc-ov-solid-line",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-ov-solid-line/mistake-pullout.trace.json",
    "faultTimeSec": 18.28,
    "requiredActors": [],
    "governingControl": {
      "kind": "marking",
      "label": "Маркировка М1 (плътна осева линия)",
      "approxPos": {
        "x": 0,
        "y": 90
      }
    },
    "view": "exterior",
    "camera": "chase",
    "notes": ""
  },
  {
    "id": "sc-park-parallel__m0",
    "templateId": "sc-park-parallel",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-park-parallel/mistake-far-from-lead.trace.json",
    "faultTimeSec": 38.88,
    "requiredActors": [
      {
        "kind": "parkedVehicle",
        "label": "Паркирани автомобили в съседните клетки"
      }
    ],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior",
    "camera": "chase",
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал)"
  },
  {
    "id": "sc-pe-parked-row-scan__m0",
    "templateId": "sc-pe-parked-row-scan",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-pe-parked-row-scan/mistake-fast-row.trace.json",
    "faultTimeSec": 7.53,
    "requiredActors": [
      {
        "kind": "pedestrian",
        "label": "Пешеходец, който стъпва на пътеката"
      }
    ],
    "governingControl": {
      "kind": "marking",
      "label": "Пешеходна пътека тип „зебра“",
      "approxPos": {
        "x": 0,
        "y": 78
      }
    },
    "view": "exterior+dashboard",
    "camera": "chase",
    "notes": "Превишена скорост без изводимо ограничение от картата — знакът не е изведен; Скоростна грешка (R4/5) — километражът на лентата на таблото я показва"
  },
  {
    "id": "sc-pe-zone-living__m0",
    "templateId": "sc-pe-zone-living",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-pe-zone-living/mistake-city-speed.trace.json",
    "faultTimeSec": 12.22,
    "requiredActors": [],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior+dashboard",
    "camera": "chase",
    "notes": "Превишена скорост без изводимо ограничение от картата — знакът не е изведен; Управляващ елемент: няма — правило за поведение (без знак/сигнал); Скоростна грешка (R4/5) — километражът на лентата на таблото я показва"
  },
  {
    "id": "sc-pk-ban-stop__m0",
    "templateId": "sc-pk-ban-stop",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-pk-ban-stop/mistake-stop-in-zone.trace.json",
    "faultTimeSec": 21.93,
    "requiredActors": [],
    "governingControl": {
      "kind": "sign",
      "label": "Знак В27 (забранени престой и паркиране)",
      "approxPos": {
        "x": 8.93,
        "y": 70
      }
    },
    "view": "exterior",
    "camera": "chase",
    "notes": ""
  },
  {
    "id": "sc-roundabout-entry__m0",
    "templateId": "sc-roundabout-entry",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-roundabout-entry/mistake-barge-entry.trace.json",
    "faultTimeSec": 11.8,
    "requiredActors": [
      {
        "kind": "vehicle",
        "label": "Автомобил в кръговото (с предимство)"
      }
    ],
    "governingControl": {
      "kind": "sign",
      "label": "Знак Б1 „Пропусни движещите се по пътя с предимство“ на входа на кръговото",
      "approxPos": {
        "x": 8.93,
        "y": -36.52
      }
    },
    "view": "exterior",
    "camera": "chase",
    "notes": "Б1 е изведен от архетипа кръгово (входът, най-близък до грешката)"
  },
  {
    "id": "sc-rx-tram-left__m0",
    "templateId": "sc-rx-tram-left",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-rx-tram-left/mistake-cut-tram.trace.json",
    "faultTimeSec": 16.45,
    "requiredActors": [
      {
        "kind": "tram",
        "label": "Трамвай насреща"
      }
    ],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior",
    "camera": "chase",
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал)"
  },
  {
    "id": "sc-rx-unguarded__m0",
    "templateId": "sc-rx-unguarded",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-rx-unguarded/mistake-roll-through.trace.json",
    "faultTimeSec": 18.15,
    "requiredActors": [],
    "governingControl": {
      "kind": "sign",
      "label": "Знак А35 (жп прелез)",
      "approxPos": {
        "x": 8.93,
        "y": 145
      }
    },
    "view": "exterior",
    "camera": "chase",
    "notes": "Непознат staged вид „trainPass“ — участникът не е изведен"
  },
  {
    "id": "sc-sign-warning__m0",
    "templateId": "sc-sign-warning",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-sign-warning/mistake-hold-speed.trace.json",
    "faultTimeSec": 18.88,
    "requiredActors": [],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior+dashboard",
    "camera": "chase",
    "notes": "Управляващ елемент: няма — дъждовни условия; Скоростна грешка (R4/5) — километражът на лентата на таблото я показва"
  },
  {
    "id": "sc-signal-controller__m0",
    "templateId": "sc-signal-controller",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-signal-controller/mistake-run.trace.json",
    "faultTimeSec": 14.22,
    "requiredActors": [
      {
        "kind": "controller",
        "label": "Регулировчик на кръстовището"
      }
    ],
    "governingControl": {
      "kind": "signal",
      "label": "Светофар на кръстовището",
      "approxPos": {
        "x": 0,
        "y": 0
      }
    },
    "view": "exterior",
    "camera": "chase",
    "notes": ""
  },
  {
    "id": "sc-signal-response__m0",
    "templateId": "sc-signal-response",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-signal-response/mistake-amber-gamble.trace.json",
    "faultTimeSec": 13.67,
    "requiredActors": [],
    "governingControl": {
      "kind": "signal",
      "label": "Светофар на кръстовището",
      "approxPos": {
        "x": 0,
        "y": 0
      }
    },
    "view": "exterior",
    "camera": "chase",
    "notes": ""
  },
  {
    "id": "sc-speed-creep__m0",
    "templateId": "sc-speed-creep",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-speed-creep/mistake-zone-creep.trace.json",
    "faultTimeSec": 26.67,
    "requiredActors": [],
    "governingControl": {
      "kind": "sign",
      "label": "Знак В26 (30 км/ч)",
      "approxPos": {
        "x": 8.93,
        "y": 406
      }
    },
    "view": "exterior+dashboard",
    "camera": "chase",
    "notes": "Скоростна грешка (R4/5) — километражът на лентата на таблото я показва"
  },
  {
    "id": "sc-speed-rain__m0",
    "templateId": "sc-speed-rain",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-speed-rain/mistake-dry-speed.trace.json",
    "faultTimeSec": 8.57,
    "requiredActors": [],
    "governingControl": {
      "kind": "sign",
      "label": "Знак В26 (50 км/ч)",
      "approxPos": {
        "x": 12.93,
        "y": 45
      }
    },
    "view": "exterior+dashboard",
    "camera": "chase",
    "notes": "Скоростна грешка (R4/5) — километражът на лентата на таблото я показва"
  },
  {
    "id": "sc-turn-left-oncoming__m0",
    "templateId": "sc-turn-left-oncoming",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-turn-left-oncoming/mistake-cut-gap.trace.json",
    "faultTimeSec": 17.4,
    "requiredActors": [
      {
        "kind": "vehicle",
        "label": "Автомобил насреща"
      },
      {
        "kind": "vehicle",
        "label": "Автомобил насреща"
      }
    ],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior",
    "camera": "chase",
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал)"
  },
  {
    "id": "sc-vp-police-stop__m1",
    "templateId": "sc-vp-police-stop",
    "mistakeIndex": 1,
    "tracePath": "content/traces/sc-vp-police-stop/mistake-panic-stop.trace.json",
    "faultTimeSec": 16.78,
    "requiredActors": [
      {
        "kind": "police",
        "label": "Полицейски служител със стоп-палка"
      }
    ],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior",
    "camera": "chase",
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал)"
  },
  {
    "id": "sc-vp-readiness__m0",
    "templateId": "sc-vp-readiness",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-vp-readiness/mistake-no-belt.trace.json",
    "faultTimeSec": 1.63,
    "requiredActors": [],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "cockpit",
    "camera": "chase",
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал); Кабинна грешка (R4) — коланът/ръчната/загасването се виждат само отвътре"
  },
  {
    "id": "sc-vp-telltale-red__m0",
    "templateId": "sc-vp-telltale-red",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-vp-telltale-red/mistake-drive-on.trace.json",
    "faultTimeSec": 20.08,
    "requiredActors": [],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior+dashboard",
    "camera": "chase",
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал); Контролна лампа (R4) — червеният индикатор свети на лентата на таблото при грешката"
  },
  {
    "id": "sc-vu-bikelane-turn__m0",
    "templateId": "sc-vu-bikelane-turn",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-vu-bikelane-turn/mistake-only-behind.trace.json",
    "faultTimeSec": 17.15,
    "requiredActors": [
      {
        "kind": "cyclist",
        "label": "Велосипедист отдясно"
      },
      {
        "kind": "cyclist",
        "label": "Велосипедист отдясно"
      }
    ],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior",
    "camera": "chase",
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал)"
  },
  {
    "id": "sc-vu-bikelane-turn__m1",
    "templateId": "sc-vu-bikelane-turn",
    "mistakeIndex": 1,
    "tracePath": "content/traces/sc-vu-bikelane-turn/mistake-cut-path.trace.json",
    "faultTimeSec": 15.55,
    "requiredActors": [],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior",
    "camera": "chase",
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал)"
  },
  {
    "id": "sc-vu-cyclist-hook__m2",
    "templateId": "sc-vu-cyclist-hook",
    "mistakeIndex": 2,
    "tracePath": "content/traces/sc-vu-cyclist-hook/mistake-forced-brake.trace.json",
    "faultTimeSec": 12.88,
    "requiredActors": [
      {
        "kind": "cyclist",
        "label": "Велосипедист отдясно"
      }
    ],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior",
    "camera": "rearAware",
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал); Призракът ЗАВИВА ПРЕЗ ключовия участник — при грешката той остава зад и встрани от обектива (извън конуса на преследващата камера), затова страничен три-четвърти кадър (rearAware)"
  },
  {
    "id": "sc-vu-emergency__m0",
    "templateId": "sc-vu-emergency",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-vu-emergency/mistake-block.trace.json",
    "faultTimeSec": 13.6,
    "requiredActors": [
      {
        "kind": "emergency",
        "label": "Автомобил със специален режим (сигнали) отзад"
      }
    ],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior",
    "camera": "rearAware",
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал); Ключовият участник идва ОТЗАД — страничен три-четвърти кадър (rearAware), който държи и призрака, и приближаващия отзад в рамката"
  },
  {
    "id": "sc-vu-pass-clearance__m1",
    "templateId": "sc-vu-pass-clearance",
    "mistakeIndex": 1,
    "tracePath": "content/traces/sc-vu-pass-clearance/mistake-fast-close.trace.json",
    "faultTimeSec": 14.08,
    "requiredActors": [
      {
        "kind": "cyclist",
        "label": "Велосипедист отдясно"
      }
    ],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior",
    "camera": "chase",
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал)"
  },
  {
    "id": "sc-zebra-approach__m0",
    "templateId": "sc-zebra-approach",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-zebra-approach/mistake-too-fast.trace.json",
    "faultTimeSec": 7.07,
    "requiredActors": [
      {
        "kind": "pedestrian",
        "label": "Пешеходец, който стъпва на пътеката"
      }
    ],
    "governingControl": {
      "kind": "marking",
      "label": "Пешеходна пътека тип „зебра“",
      "approxPos": {
        "x": 0,
        "y": 90
      }
    },
    "view": "exterior",
    "camera": "chase",
    "notes": ""
  }
];

/** Plan lookup for the RIG / gallery; null for an unknown clip id. */
export function clipPlanForId(id: string): ClipPlanEntry | null {
  for (const entry of CLIP_PLAN) if (entry.id === id) return entry;
  return null;
}
