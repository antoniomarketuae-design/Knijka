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
  /** Derivation caveats (Bulgarian, terse); "" = fully unambiguous. */
  notes: string;
}

export const CLIP_PLAN: readonly ClipPlanEntry[] = [
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
    "notes": "Управляващ елемент: няма — дъждовни условия; Светлинна грешка (R4) — фаровете отвън + лентата на таблото"
  },
  {
    "id": "sc-ed-d2-city-run__m0",
    "templateId": "sc-ed-d2-city-run",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-ed-d2-city-run/mistake-red-light.trace.json",
    "faultTimeSec": 29.78,
    "requiredActors": [
      {
        "kind": "pedestrian",
        "label": "Пешеходец, който стъпва на пътеката"
      }
    ],
    "governingControl": {
      "kind": "signal",
      "label": "Светофар на кръстовището",
      "approxPos": {
        "x": 495.63,
        "y": -147.67
      }
    },
    "view": "exterior",
    "notes": ""
  },
  {
    "id": "sc-follow-distance__m0",
    "templateId": "sc-follow-distance",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-follow-distance/mistake-tailgate.trace.json",
    "faultTimeSec": 5.38,
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
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал)"
  },
  {
    "id": "sc-junction-stop__m0",
    "templateId": "sc-junction-stop",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-junction-stop/mistake-rolling-stop.trace.json",
    "faultTimeSec": 16.82,
    "requiredActors": [],
    "governingControl": {
      "kind": "sign",
      "label": "Знак Б2 „Спри!“",
      "approxPos": {
        "x": 0,
        "y": 0
      }
    },
    "view": "exterior",
    "notes": ""
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
        "label": "Автомобил отпред в лентата (води)"
      }
    ],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior",
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
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал)"
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
        "x": 0,
        "y": 90
      }
    },
    "view": "exterior",
    "notes": ""
  },
  {
    "id": "sc-ov-oneway__m0",
    "templateId": "sc-ov-oneway",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-ov-oneway/mistake-wrong-way.trace.json",
    "faultTimeSec": 26.43,
    "requiredActors": [],
    "governingControl": {
      "kind": "sign",
      "label": "Знак В1 „Забранено е влизането“ (еднопосочна улица)",
      "approxPos": {
        "x": 0,
        "y": 200
      }
    },
    "view": "exterior",
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
    "notes": ""
  },
  {
    "id": "sc-park-perp-rev__m0",
    "templateId": "sc-park-perp-rev",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-park-perp-rev/mistake-wide-approach.trace.json",
    "faultTimeSec": 45.25,
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
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал)"
  },
  {
    "id": "sc-pk-ban-stop__m0",
    "templateId": "sc-pk-ban-stop",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-pk-ban-stop/mistake-stop-in-zone.trace.json",
    "faultTimeSec": 21.65,
    "requiredActors": [],
    "governingControl": {
      "kind": "sign",
      "label": "Знак В27 (забранени престой и паркиране)",
      "approxPos": {
        "x": 0,
        "y": 70
      }
    },
    "view": "exterior",
    "notes": ""
  },
  {
    "id": "sc-roundabout-entry__m0",
    "templateId": "sc-roundabout-entry",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-roundabout-entry/mistake-barge-entry.trace.json",
    "faultTimeSec": 11.58,
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
        "x": 0,
        "y": -18
      }
    },
    "view": "exterior",
    "notes": "Б1 е изведен от архетипа кръгово (входът, най-близък до грешката)"
  },
  {
    "id": "sc-roundabout-entry__m1",
    "templateId": "sc-roundabout-entry",
    "mistakeIndex": 1,
    "tracePath": "content/traces/sc-roundabout-entry/mistake-exit-no-signal.trace.json",
    "faultTimeSec": 37.55,
    "requiredActors": [
      {
        "kind": "vehicle",
        "label": "Автомобил в кръговото (с предимство)"
      }
    ],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior",
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
        "x": 0,
        "y": 150
      }
    },
    "view": "exterior",
    "notes": ""
  },
  {
    "id": "sc-speed-creep__m0",
    "templateId": "sc-speed-creep",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-speed-creep/mistake-flow-along.trace.json",
    "faultTimeSec": 8.93,
    "requiredActors": [],
    "governingControl": {
      "kind": "sign",
      "label": "Знак В26 (30 км/ч)",
      "approxPos": {
        "x": 4.06,
        "y": 400
      }
    },
    "view": "exterior",
    "notes": ""
  },
  {
    "id": "sc-speed-rain__m0",
    "templateId": "sc-speed-rain",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-speed-rain/mistake-dry-speed.trace.json",
    "faultTimeSec": 8.35,
    "requiredActors": [],
    "governingControl": {
      "kind": "none",
      "label": "Няма"
    },
    "view": "exterior",
    "notes": "Управляващ елемент: няма — нощни условия"
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
    "notes": "Управляващ елемент: няма — правило за поведение (без знак/сигнал); Кабинна грешка (R4) — коланът/ръчната/загасването се виждат само отвътре"
  },
  {
    "id": "sc-vu-emergency__m0",
    "templateId": "sc-vu-emergency",
    "mistakeIndex": 0,
    "tracePath": "content/traces/sc-vu-emergency/mistake-block.trace.json",
    "faultTimeSec": 18.82,
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
    "notes": ""
  }
];

/** Plan lookup for the RIG / gallery; null for an unknown clip id. */
export function clipPlanForId(id: string): ClipPlanEntry | null {
  for (const entry of CLIP_PLAN) if (entry.id === id) return entry;
  return null;
}
