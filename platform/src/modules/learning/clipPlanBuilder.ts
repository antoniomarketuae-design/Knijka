/**
 * Clip-plan builder (doc 66 — the produced-media requirements card). NODE
 * ONLY: reads committed district/trace files and replays recorder scripts;
 * imported exclusively by the freshness gate (clipPlan.test.ts) and the
 * generator wrapper (tools/clips/gen_clip_plan.mjs). Never import from app,
 * component or RIG code — those read clipPlan.generated.ts.
 *
 * Derivation laws, all machine-checked, nothing hand-written:
 *  - faultTimeSec (R3): the pilot mistake's committed trace is replayed
 *    HEADLESSLY through the production grading stack (sim/traces
 *    replayPilotMistake — the trace-gate recorders), the recording is
 *    byte-verified against the committed file, and the time of the FIRST
 *    violation the mistake CITES (codeRefs) is taken. No citation → throw.
 *  - requiredActors (R1): from the template's staged specs (kind + actor
 *    profile → Bulgarian label) plus occupied parking bays from the district.
 *  - governingControl (R2): from the district data — ban/marking zones
 *    (signRef), the stop-sign junction meta, signalized nodes nearest the
 *    fault, the speed-zone transition, marked crossings, the one-way gate.
 *    Ambiguous → conservative "none" WITH a note (a wrong card poisons R0).
 *  - view (R4): cabin-state codeRefs → cockpit / exterior+dashboard.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scenarioById } from "@/modules/sim/lessons";
import { replayPilotMistake, serializeScenarioTrace } from "@/modules/sim/traces";
import { clipPilotList } from "./clipPilot";
import type {
  ClipGoverningControl,
  ClipPlanEntry,
  ClipRequiredActor,
  ClipView,
} from "./clipPlan.generated";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");

// ---------------------------------------------------------------------------
// District document — the narrow slice the card derivation reads
// ---------------------------------------------------------------------------

interface DistrictNode {
  id: string;
  x: number;
  y: number;
}
interface DistrictEdge {
  id: string;
  geometry?: Array<[number, number]>;
}
interface DistrictZone {
  id: string;
  kind: string;
  edgeId: string;
  fromM: number;
  toM: number;
  signRef?: string;
}
interface DistrictCrossing {
  id: string;
  x: number;
  y: number;
  kind?: string;
}
interface DistrictIntersection {
  id: string;
  x: number;
  y: number;
  signalized?: boolean;
}
interface DistrictDoc {
  roads?: { nodes?: DistrictNode[]; edges?: DistrictEdge[] };
  intersections?: DistrictIntersection[];
  crossings?: DistrictCrossing[];
  zones?: DistrictZone[];
  meta?: { scenario?: Record<string, unknown> };
}

function loadDistrict(districtId: string): DistrictDoc {
  const file = path.join(REPO_ROOT, "content", "world", `${districtId}.json`);
  return JSON.parse(readFileSync(file, "utf-8")) as DistrictDoc;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Point along an edge polyline at arclength `atM` (clamped). */
function pointAlongEdge(edge: DistrictEdge, atM: number): { x: number; y: number } | null {
  const geo = edge.geometry ?? [];
  if (geo.length < 2) return null;
  let walked = 0;
  for (let i = 0; i + 1 < geo.length; i++) {
    const [x0, y0] = geo[i];
    const [x1, y1] = geo[i + 1];
    const seg = Math.hypot(x1 - x0, y1 - y0);
    if (walked + seg >= atM && seg > 0) {
      const t = Math.max(0, Math.min(1, (atM - walked) / seg));
      return { x: round2(x0 + (x1 - x0) * t), y: round2(y0 + (y1 - y0) * t) };
    }
    walked += seg;
  }
  const [lx, ly] = geo[geo.length - 1];
  return { x: round2(lx), y: round2(ly) };
}

function nearest<T extends { x: number; y: number }>(
  items: readonly T[],
  pos: { x: number; y: number },
): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const item of items) {
    const d = Math.hypot(item.x - pos.x, item.y - pos.y);
    if (d < bestD) {
      bestD = d;
      best = item;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// R1 — required actors from the staged specs (+ occupied bays)
// ---------------------------------------------------------------------------

/** ADR-001 profile → Bulgarian noun (fictional rigs, no brands). */
const PROFILE_BG: Readonly<Record<string, string>> = {
  car: "Автомобил",
  van: "Ван",
  truck: "Камион",
  emergency: "Автомобил със специален режим",
  tram: "Трамвай",
  cyclist: "Велосипедист",
  childCyclist: "Дете с велосипед",
};

interface StagedLike {
  kind: string;
  actor?: { profile?: string };
}

/** Staged spec → the actor the clip must show; null = not an actor (a
 *  signal/telltale stimulus). Conservative kind vocabulary — see the
 *  generated file's ClipRequiredActor doc. */
function actorForStaged(staged: StagedLike): ClipRequiredActor | null {
  const veh = PROFILE_BG[staged.actor?.profile ?? "car"] ?? "Автомобил";
  switch (staged.kind) {
    case "pedestrianDartOut":
      return { kind: "pedestrian", label: "Пешеходец, който стъпва на пътеката" };
    case "priorityFromRight":
      return { kind: "vehicle", label: `${veh} отдясно с предимство` };
    case "brakingLeadCar":
      return { kind: "vehicle", label: `${veh} отпред в лентата (води)` };
    case "cyclistRightHook":
      return { kind: "cyclist", label: "Велосипедист отдясно" };
    case "roundaboutEntry":
      return { kind: "vehicle", label: `${veh} в кръговото (с предимство)` };
    case "oncomingLeftTurn":
      return { kind: staged.actor?.profile === "tram" ? "tram" : "vehicle", label: `${veh} насреща` };
    case "narrowMeeting":
      return { kind: "vehicle", label: "Насрещен автомобил в стеснението" };
    case "emergencyApproach":
      return { kind: "emergency", label: "Автомобил със специален режим (сигнали) отзад" };
    case "policeStop":
      return { kind: "police", label: "Полицейски служител със стоп-палка" };
    case "trafficController":
      return { kind: "controller", label: "Регулировчик на кръстовището" };
    case "cutInLeadCar":
      return { kind: "vehicle", label: `${veh}, който се вклинява отпред` };
    case "rearTailgater":
      return { kind: "vehicle", label: `${veh} плътно отзад` };
    case "oncomingStream":
      return { kind: "vehicle", label: "Насрещен поток автомобили" };
    // Signal-phase / dashboard stimuli — no counterpart actor to frame.
    case "amberDilemma":
    case "telltaleStimulus":
      return null;
    default:
      return null;
  }
}

function deriveActors(
  staged: readonly StagedLike[],
  district: DistrictDoc,
  notes: string[],
): ClipRequiredActor[] {
  const actors: ClipRequiredActor[] = [];
  for (const spec of staged) {
    const actor = actorForStaged(spec);
    if (actor !== null) {
      actors.push(actor);
    } else if (spec.kind !== "amberDilemma" && spec.kind !== "telltaleStimulus") {
      notes.push(`Непознат staged вид „${spec.kind}“ — участникът не е изведен`);
    }
  }
  // Occupied bays = the parked cars a lot demo collides with / threads.
  const bays = district.meta?.scenario?.bays;
  if (Array.isArray(bays) && bays.some((b) => (b as { occupied?: boolean }).occupied === true)) {
    actors.push({ kind: "parkedVehicle", label: "Паркирани автомобили в съседните клетки" });
  }
  return actors;
}

// ---------------------------------------------------------------------------
// R2 — governing control from the district data
// ---------------------------------------------------------------------------

/** Violation code → the zone kind whose signRef governs it. */
const ZONE_CODE_KINDS: ReadonlyArray<readonly [string, string]> = [
  ["OVERTAKING_IN_BAN_ZONE", "noOvertaking"],
  ["ILLEGAL_STOP_IN_BAN_ZONE", "noStopping"],
  ["CROSSED_SOLID_LINE", "solidCenterLine"],
  ["DRIVING_IN_BUS_LANE", "busLane"],
  ["RAIL_CROSSING_VIOLATION", "railCrossing"],
];

const ZONE_KIND_BG: Readonly<Record<string, string>> = {
  noOvertaking: "забранено изпреварване",
  noStopping: "забранени престой и паркиране",
  solidCenterLine: "плътна осева линия",
  busLane: "бус лента",
  railCrossing: "жп прелез",
  emergencyLane: "аварийна лента",
};

function controlForZone(zone: DistrictZone, district: DistrictDoc): ClipGoverningControl {
  const signRef = zone.signRef ?? "";
  const descr = ZONE_KIND_BG[zone.kind] ?? zone.kind;
  const isMarking = signRef.startsWith("М");
  const control: ClipGoverningControl = {
    kind: isMarking ? "marking" : "sign",
    label: `${isMarking ? "Маркировка" : "Знак"} ${signRef} (${descr})`,
  };
  const edge = (district.roads?.edges ?? []).find((e) => e.id === zone.edgeId);
  const pos = edge ? pointAlongEdge(edge, zone.fromM) : null;
  if (pos !== null) control.approxPos = pos;
  return control;
}

function deriveControl(
  codes: ReadonlySet<string>,
  district: DistrictDoc,
  archetype: string,
  conditions: { weather?: string; night?: boolean } | undefined,
  faultPos: { x: number; y: number },
  notes: string[],
): ClipGoverningControl {
  const scenario = district.meta?.scenario ?? {};

  // 1. Zone-governed codes (В24/В27/М1/бус/жп) — the zone's own signRef.
  for (const [code, zoneKind] of ZONE_CODE_KINDS) {
    if (!codes.has(code)) continue;
    const zone = (district.zones ?? []).find((z) => z.kind === zoneKind);
    if (zone) return controlForZone(zone, district);
    notes.push(`Кодът ${code} очаква зона „${zoneKind}“, но картата няма такава`);
  }

  // 2. Stop sign — the junction meta authored by the map generator.
  if ([...codes].some((c) => c.startsWith("STOP_SIGN"))) {
    const control: ClipGoverningControl = { kind: "sign", label: "Знак Б2 „Спри!“" };
    const nodeId = typeof scenario.junctionNodeId === "string" ? scenario.junctionNodeId : null;
    const node = (district.roads?.nodes ?? []).find((n) => n.id === nodeId);
    if (node) control.approxPos = { x: round2(node.x), y: round2(node.y) };
    else notes.push("Стоп-кръстовището няма junctionNodeId в картата — позицията липсва");
    return control;
  }

  // 3. Signal-governed codes — the signalized node nearest the fault moment.
  if ([...codes].some((c) => /RED_LIGHT|AMBER_|SIGNAL_/.test(c))) {
    const signalized = (district.intersections ?? []).filter((i) => i.signalized === true);
    const node = nearest(signalized, faultPos);
    if (node) {
      return {
        kind: "signal",
        label: "Светофар на кръстовището",
        approxPos: { x: round2(node.x), y: round2(node.y) },
      };
    }
    notes.push("Сигнален код без светофарен възел в картата — елементът не е изведен");
  }

  // 4. Priority yield at a roundabout mouth (Б1 at the barged entry).
  if (codes.has("FAILED_TO_YIELD") && archetype === "roundabout") {
    const ringIds = Array.isArray(scenario.ringNodeIds)
      ? scenario.ringNodeIds.filter((v): v is string => typeof v === "string")
      : [];
    const ringNodes = (district.roads?.nodes ?? []).filter((n) => ringIds.includes(n.id));
    const node = nearest(ringNodes, faultPos);
    notes.push("Б1 е изведен от архетипа кръгово (входът, най-близък до грешката)");
    const control: ClipGoverningControl = {
      kind: "sign",
      label: "Знак Б1 „Пропусни движещите се по пътя с предимство“ на входа на кръговото",
    };
    if (node) control.approxPos = { x: round2(node.x), y: round2(node.y) };
    return control;
  }

  // 5. Posted-limit speeding — the limit-transition sign of the speed maps.
  if (codes.has("SPEEDING_OVER_LIMIT")) {
    const transitionY = asNumber(scenario.transitionY);
    const params = (scenario.params ?? {}) as Record<string, unknown>;
    const zoneKmh = asNumber(params.zoneKmh);
    if (transitionY !== null && zoneKmh !== null) {
      const laneX = asNumber(scenario.laneCenterRightM) ?? 0;
      return {
        kind: "sign",
        label: `Знак В26 (${zoneKmh} км/ч)`,
        approxPos: { x: round2(laneX), y: round2(transitionY) },
      };
    }
    notes.push("Превишена скорост без авториран преход на ограничението — знакът не е изведен");
  }

  // 6. Marked-crossing codes — the zebra nearest the fault.
  if ([...codes].some((c) => c.startsWith("PEDESTRIAN_"))) {
    const crossing = nearest(district.crossings ?? [], faultPos);
    if (crossing) {
      return {
        kind: "marking",
        label: "Пешеходна пътека тип „зебра“",
        approxPos: { x: round2(crossing.x), y: round2(crossing.y) },
      };
    }
    notes.push("Пешеходен код без пътека в картата — елементът не е изведен");
  }

  // 7. Wrong way into a one-way street — the no-entry gate.
  if (codes.has("WRONG_WAY") && scenario.oneway === true) {
    const control: ClipGoverningControl = {
      kind: "sign",
      label: "Знак В1 „Забранено е влизането“ (еднопосочна улица)",
    };
    const junction = scenario.junction as { x?: unknown; y?: unknown } | undefined;
    const jx = asNumber(junction?.x);
    const jy = asNumber(junction?.y);
    if (jx !== null && jy !== null) control.approxPos = { x: round2(jx), y: round2(jy) };
    return control;
  }

  // 8. Conservative default: no control — the fault follows from a conduct
  //    rule or the conditions. Say WHY in the note (the R0 checklist).
  const reason = conditions?.night
    ? "нощни условия"
    : conditions?.weather === "rain"
      ? "дъждовни условия"
      : conditions?.weather === "fog"
        ? "мъгла"
        : conditions?.weather === "snow"
          ? "снежни условия"
          : "правило за поведение (без знак/сигнал)";
  notes.push(`Управляващ елемент: няма — ${reason}`);
  return { kind: "none", label: "Няма" };
}

// ---------------------------------------------------------------------------
// R4 — view from the mistake's codeRefs
// ---------------------------------------------------------------------------

const COCKPIT_CODE = /^(SEATBELT_|HANDBRAKE_|ENGINE_STALLED|PREDRIVE_)/;
const DASHBOARD_CODE = /^(HEADLIGHTS_|FOG_LIGHTS_|HIGH_BEAM_|WIPERS_)/;

function deriveView(codes: ReadonlySet<string>, notes: string[]): ClipView {
  if ([...codes].some((c) => COCKPIT_CODE.test(c))) {
    notes.push("Кабинна грешка (R4) — коланът/ръчната/загасването се виждат само отвътре");
    return "cockpit";
  }
  if ([...codes].some((c) => DASHBOARD_CODE.test(c))) {
    notes.push("Светлинна грешка (R4) — фаровете отвън + лентата на таблото");
    return "exterior+dashboard";
  }
  return "exterior";
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

export function buildClipPlan(): ClipPlanEntry[] {
  const entries: ClipPlanEntry[] = [];
  for (const pilot of clipPilotList()) {
    const spec = scenarioById(pilot.templateId);
    if (!spec) throw new Error(`clipPlan: unknown template "${pilot.templateId}"`);
    const mistake = spec.mistakes[pilot.mistakeIndex];
    if (!mistake) throw new Error(`clipPlan: ${pilot.id} has no mistake ${pilot.mistakeIndex}`);

    // --- R3: replay the committed demo through the real grading stack ------
    const district = loadDistrict(spec.map.districtId);
    const traceName = path
      .basename(pilot.tracePath)
      .replace(/\.trace\.json$/, "");
    const drive = replayPilotMistake(pilot.templateId, district, traceName);
    const committed = readFileSync(path.join(REPO_ROOT, pilot.tracePath), "utf-8");
    if (serializeScenarioTrace(drive.trace) + "\n" !== committed) {
      throw new Error(
        `clipPlan: replay of ${pilot.id} does not match the committed trace ` +
          `${pilot.tracePath} — run the trace gate for ${pilot.templateId} first`,
      );
    }
    const codes = new Set<string>(mistake.codeRefs);
    let faultT: number | null = null;
    for (const event of drive.ruleEvents) {
      if (event.kind !== "violation" || !codes.has(event.code)) continue;
      if (faultT === null || event.t < faultT) faultT = event.t;
    }
    if (faultT === null) {
      throw new Error(
        `clipPlan: replay of ${pilot.id} produced NO violation among cited codes ` +
          `[${mistake.codeRefs.join(", ")}] — the demo does not show its own fault (R3/R6)`,
      );
    }
    const faultTimeSec = round2(faultT);

    // Player position at the fault — anchors nearest-node derivations.
    let faultPos = { x: 0, y: 0 };
    for (const sample of drive.trace.samples) {
      if (sample.tSec <= faultT + 1e-6) faultPos = { x: sample.x, y: sample.y };
      else break;
    }

    // --- R1/R2/R4 cards ------------------------------------------------------
    const notes: string[] = [];
    const requiredActors = deriveActors((spec.staged ?? []) as StagedLike[], district, notes);
    const governingControl = deriveControl(
      codes,
      district,
      spec.map.archetype,
      spec.conditions,
      faultPos,
      notes,
    );
    const view = deriveView(codes, notes);

    entries.push({
      id: pilot.id,
      templateId: pilot.templateId,
      mistakeIndex: pilot.mistakeIndex,
      tracePath: pilot.tracePath,
      faultTimeSec,
      requiredActors,
      governingControl,
      view,
      notes: notes.join("; "),
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// The emitter — clipPlan.generated.ts, byte-stable for the freshness gate
// ---------------------------------------------------------------------------

export function renderClipPlanModule(entries: readonly ClipPlanEntry[]): string {
  return `/**
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
  /** Manifest clip id — \`<templateId>__m<mistakeIndex>\` (clipPilot contract). */
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

export const CLIP_PLAN: readonly ClipPlanEntry[] = ${JSON.stringify(entries, null, 2)};

/** Plan lookup for the RIG / gallery; null for an unknown clip id. */
export function clipPlanForId(id: string): ClipPlanEntry | null {
  for (const entry of CLIP_PLAN) if (entry.id === id) return entry;
  return null;
}
`;
}
