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
 *    approxPos is then SNAPPED to the actual RENDERED sign post
 *    (buildWorldGeometry — the world's own builder, never a parallel
 *    reconstruction): pilot v2 aimed the camera at zone-centerline points
 *    while the posts stand at the right kerb, and claimed signs (В1, the
 *    В26-30 transition) that no world pass places — those now carry a
 *    CONTENT note instead of poisoning R0.
 *  - view (R4): cabin-state codeRefs → cockpit / exterior+dashboard; SPEED
 *    codeRefs (over-limit / too-fast-for-conditions) → exterior+dashboard —
 *    a speeding fault is unreadable without the speed readout (pilot v2
 *    cause 5).
 *  - camera (R1): "rearAware" when a staged actor approaches from BEHIND
 *    (emergencyApproach/rearTailgater) — the chase camera can never show it.
 *  - laneHighlight: positional lane faults (NOT_KEEPING_RIGHT) emit the
 *    REQUIRED lane's center so the rig can tint it green for ~2 s at the
 *    fault (visual explanation, not decoration — doc 66 spirit).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scenarioById } from "@/modules/sim/lessons";
import { replayPilotMistake, serializeScenarioTrace } from "@/modules/sim/traces";
import { assertDistrict, buildWorldGeometry } from "@/modules/sim/world";
import { clipPilotList } from "./clipPilot";
import type {
  ClipGoverningControl,
  ClipLaneHighlight,
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

// ---------------------------------------------------------------------------
// Rendered sign posts — the world's OWN builder output (doc 66 R5: no
// parallel reconstruction). District space: three (x, ·, z) → (x, −z).
// ---------------------------------------------------------------------------

interface SignPost {
  kind: string;
  x: number;
  y: number;
}

const signPostCache = new Map<string, SignPost[]>();

function renderedSignPosts(districtId: string, raw: DistrictDoc): SignPost[] {
  let posts = signPostCache.get(districtId);
  if (!posts) {
    const geometry = buildWorldGeometry(assertDistrict(raw), { parkingBays: [] });
    posts = geometry.signs.map((s) => ({
      kind: s.kind,
      x: round2(s.position[0]),
      y: round2(-s.position[2]),
    }));
    signPostCache.set(districtId, posts);
  }
  return posts;
}

/** How far from the coarse (data-derived) position the matching rendered post
 *  may stand — a kerb offset plus map slack, never a different station. */
const POST_SNAP_RADIUS_M = 60;

/**
 * Snap a control's approxPos to the nearest RENDERED post of the expected
 * kind(s). Found → the camera orients at the actual pole the viewer sees.
 * Missing → CONTENT note (the card claims a control the world cannot show —
 * report, never fake; doc 66 R0).
 */
function snapControlToPost(
  control: ClipGoverningControl,
  expectedKinds: readonly string[],
  posts: readonly SignPost[],
  notes: string[],
): ClipGoverningControl {
  const anchor = control.approxPos;
  if (anchor === undefined) return control;
  let best: SignPost | null = null;
  let bestD = POST_SNAP_RADIUS_M;
  for (const post of posts) {
    if (!expectedKinds.includes(post.kind)) continue;
    const d = Math.hypot(post.x - anchor.x, post.y - anchor.y);
    if (d < bestD) {
      bestD = d;
      best = post;
    }
  }
  if (best) {
    control.approxPos = { x: best.x, y: best.y };
  } else {
    notes.push(
      `СЪДЪРЖАНИЕ: „${control.label}“ няма рендиран стълб (${expectedKinds.join("/")}) ` +
        `до очакваната позиция — камерата няма какво да покаже`,
    );
  }
  return control;
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

/** Zone kind → the RENDERED post kinds that can stand for it (zoneSigns.ts).
 *  Empty = marking-only (paint, not a pole) — nothing to snap to. */
const ZONE_POST_KINDS: Readonly<Record<string, readonly string[]>> = {
  noOvertaking: ["noOvertaking"],
  noStopping: ["noStopping"],
  railCrossing: ["railCross", "railUnguarded", "railGuarded"],
  solidCenterLine: [],
  busLane: [],
};

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
  startPos: { x: number; y: number },
  posts: readonly SignPost[],
  notes: string[],
): ClipGoverningControl {
  const scenario = district.meta?.scenario ?? {};

  // 1. Zone-governed codes (В24/В27/М1/бус/жп) — the zone's own signRef,
  //    snapped to the zone's rendered post (kerb side, zoneSigns.ts) so the
  //    camera orients at the pole the viewer sees, not the centerline.
  for (const [code, zoneKind] of ZONE_CODE_KINDS) {
    if (!codes.has(code)) continue;
    const zone = (district.zones ?? []).find((z) => z.kind === zoneKind);
    if (zone) {
      const control = controlForZone(zone, district);
      const postKinds = ZONE_POST_KINDS[zoneKind] ?? [];
      return postKinds.length > 0
        ? snapControlToPost(control, postKinds, posts, notes)
        : control;
    }
    notes.push(`Кодът ${code} очаква зона „${zoneKind}“, но картата няма такава`);
  }

  // 2. Stop sign — the junction meta authored by the map generator.
  if ([...codes].some((c) => c.startsWith("STOP_SIGN"))) {
    const control: ClipGoverningControl = { kind: "sign", label: "Знак Б2 „Спри!“" };
    const nodeId = typeof scenario.junctionNodeId === "string" ? scenario.junctionNodeId : null;
    const node = (district.roads?.nodes ?? []).find((n) => n.id === nodeId);
    if (node) control.approxPos = { x: round2(node.x), y: round2(node.y) };
    else notes.push("Стоп-кръстовището няма junctionNodeId в картата — позицията липсва");
    return snapControlToPost(control, ["stop"], posts, notes);
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

  // 4. Priority yield at a roundabout mouth (Б1 at the barged entry) —
  //    snapped to the entry's rendered Б1 post (props.ts roundabout pass).
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
    return snapControlToPost(control, ["giveWay"], posts, notes);
  }

  // 5. Posted-limit speeding — the sign of the limit IN FORCE at the fault.
  //    Pilot-v2 cause 3 lesson (sc-speed-creep): the card pointed at the
  //    zone-transition В26 (y=400) while the ENGINE graded the fault at
  //    y≈100 — still under the APPROACH limit, whose В26 stands at the
  //    segment entry. The card must cite the limit the fault broke.
  if (codes.has("SPEEDING_OVER_LIMIT")) {
    const transitionY = asNumber(scenario.transitionY);
    const params = (scenario.params ?? {}) as Record<string, unknown>;
    const zoneKmh = asNumber(params.zoneKmh);
    const approachKmh = asNumber(params.approachKmh) ?? asNumber(params.maxspeedKmh);
    if (transitionY !== null && zoneKmh !== null && faultPos.y >= transitionY) {
      const laneX = asNumber(scenario.laneCenterRightM) ?? 0;
      const control: ClipGoverningControl = {
        kind: "sign",
        label: `Знак В26 (${zoneKmh} км/ч)`,
        approxPos: { x: round2(laneX), y: round2(transitionY) },
      };
      // The world ships only the В26-50 face — a zone post must MATCH it.
      return snapControlToPost(
        control,
        zoneKmh === 50 ? ["limit50"] : [`limit${zoneKmh}`],
        posts,
        notes,
      );
    }
    if (approachKmh !== null) {
      if (transitionY !== null) {
        notes.push(
          `Грешката е ПРЕДИ прехода на ограничението (y≈${Math.round(faultPos.y)} < ` +
            `${Math.round(transitionY)}) — важи В26 (${approachKmh}) от входа на отсечката`,
        );
      }
      const control: ClipGoverningControl = {
        kind: "sign",
        label: `Знак В26 (${approachKmh} км/ч)`,
        approxPos: { x: round2(startPos.x), y: round2(startPos.y) },
      };
      return snapControlToPost(
        control,
        approachKmh === 50 ? ["limit50"] : [`limit${approachKmh}`],
        posts,
        notes,
      );
    }
    notes.push("Превишена скорост без изводимо ограничение от картата — знакът не е изведен");
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

  // 7. Wrong way into a one-way street — the no-entry gate. The world does
  //    not yet PLACE a В1 post (no SignKind, no placement pass — the GLB
  //    sign_no_entry.glb exists unwired): the snap fails loudly into a
  //    CONTENT note so R0 knows the clip cannot show its governing sign.
  if (codes.has("WRONG_WAY") && scenario.oneway === true) {
    const control: ClipGoverningControl = {
      kind: "sign",
      label: "Знак В1 „Забранено е влизането“ (еднопосочна улица)",
    };
    const junction = scenario.junction as { x?: unknown; y?: unknown } | undefined;
    const jx = asNumber(junction?.x);
    const jy = asNumber(junction?.y);
    if (jx !== null && jy !== null) control.approxPos = { x: round2(jx), y: round2(jy) };
    return snapControlToPost(control, ["noEntry"], posts, notes);
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
/** Speed faults are unreadable without the speed readout (pilot v2 cause 5):
 *  over-limit, too-fast-for-conditions and too-slow all get the strip. */
const SPEED_CODE = /^(SPEEDING_|SPEED_TOO_FAST|DRIVING_TOO_SLOW)/;

function deriveView(codes: ReadonlySet<string>, notes: string[]): ClipView {
  if ([...codes].some((c) => COCKPIT_CODE.test(c))) {
    notes.push("Кабинна грешка (R4) — коланът/ръчната/загасването се виждат само отвътре");
    return "cockpit";
  }
  if ([...codes].some((c) => DASHBOARD_CODE.test(c))) {
    notes.push("Светлинна грешка (R4) — фаровете отвън + лентата на таблото");
    return "exterior+dashboard";
  }
  if ([...codes].some((c) => SPEED_CODE.test(c))) {
    notes.push("Скоростна грешка (R4/5) — километражът на лентата на таблото я показва");
    return "exterior+dashboard";
  }
  return "exterior";
}

// ---------------------------------------------------------------------------
// Camera profile (R1 — rear approaches) + the positional lane highlight
// ---------------------------------------------------------------------------

/** Staged kinds whose key actor closes from BEHIND the ghost — the chase
 *  camera can never show them (pilot v2: the sc-vu-emergency ambulance
 *  entered frame only after it had already passed). */
const REAR_APPROACH_KINDS: ReadonlySet<string> = new Set([
  "emergencyApproach",
  "rearTailgater",
]);

function deriveCamera(staged: readonly StagedLike[], notes: string[]): "chase" | "rearAware" {
  if (staged.some((s) => REAR_APPROACH_KINDS.has(s.kind))) {
    notes.push(
      "Ключовият участник идва ОТЗАД — страничен три-четвърти кадър (rearAware), " +
        "който държи и призрака, и приближаващия отзад в рамката",
    );
    return "rearAware";
  }
  return "chase";
}

/** Clearance kept between the tinted band and the lane lines, m. */
const LANE_HIGHLIGHT_EDGE_M = 1.6;

/** Positional lane faults (NOT_KEEPING_RIGHT): the REQUIRED lane's band so
 *  the rig can tint it green for ~2 s at the fault. Derived from the map's
 *  own lane meta — never guessed. */
function deriveLaneHighlight(
  codes: ReadonlySet<string>,
  district: DistrictDoc,
  faultPos: { x: number; y: number },
  notes: string[],
): ClipLaneHighlight | undefined {
  if (!codes.has("NOT_KEEPING_RIGHT")) return undefined;
  const scenario = district.meta?.scenario ?? {};
  const cruiseX = asNumber(scenario.laneCruiseX);
  const leftX = asNumber(scenario.laneLeftX);
  if (cruiseX === null || leftX === null) {
    notes.push(
      "NOT_KEEPING_RIGHT без изводими ленти (laneCruiseX/laneLeftX) — лентата не се осветява",
    );
    return undefined;
  }
  notes.push("Позиционна грешка — ДЯСНАТА (изискваната) лента светва зелено ~2 с при грешката");
  return {
    xM: round2(cruiseX),
    yM: round2(faultPos.y),
    widthM: round2(Math.abs(cruiseX - leftX) - LANE_HIGHLIGHT_EDGE_M),
  };
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

    // Route start — anchors the in-force-limit derivation (case 5).
    const first = drive.trace.samples[0];
    const startPos = first ? { x: first.x, y: first.y } : { x: 0, y: 0 };

    // --- R1/R2/R4 cards ------------------------------------------------------
    const notes: string[] = [];
    const staged = (spec.staged ?? []) as StagedLike[];
    const requiredActors = deriveActors(staged, district, notes);
    const posts = renderedSignPosts(spec.map.districtId, district);
    const governingControl = deriveControl(
      codes,
      district,
      spec.map.archetype,
      spec.conditions,
      faultPos,
      startPos,
      posts,
      notes,
    );
    const view = deriveView(codes, notes);
    const camera = deriveCamera(staged, notes);
    const laneHighlight = deriveLaneHighlight(codes, district, faultPos, notes);

    entries.push({
      id: pilot.id,
      templateId: pilot.templateId,
      mistakeIndex: pilot.mistakeIndex,
      tracePath: pilot.tracePath,
      faultTimeSec,
      requiredActors,
      governingControl,
      view,
      camera,
      ...(laneHighlight ? { laneHighlight } : {}),
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
  camera: ClipCameraProfile;
  laneHighlight?: ClipLaneHighlight;
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
