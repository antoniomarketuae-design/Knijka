/**
 * scenario-world-referent — the machine form of one sentence.
 *
 * Doc 86 §10. Every finding in that document's §2 is an instance of the same
 * defect: *a scenario graded something its world did not contain.* This module
 * turns that sentence into a predicate.
 *
 * For every scenario × every authored rung it takes
 *   - the COMPILED lesson (`compileScenario` — the real thing the scene mounts),
 *   - the BUILT world (`buildWorldGeometry` + `createWorldRuntime` — signs,
 *     lights, marking classes, derived stop lines, zones — the built artefacts,
 *     never the JSON),
 *   - the scenario's DECLARED FAULT SURFACE (⋃ `mistakes[].codeRefs` ∪ every
 *     default-ON detector not disarmed by the compiled `ruleConfig`),
 * and asserts a REQUIRED-REFERENT predicate per fault code: if the code can
 * fire on this rung, the world must contain the thing the code is about.
 *
 * 46 codes carry a referent. The other 14 are listed in `NO_WORLD_REFERENT`,
 * so the exemption is a reviewed decision rather than an oversight. 46 + 14 =
 * 60 = every code in `rules/catalog.ts`; the module asserts that arithmetic on
 * itself, so a new code cannot ship unchecked and unexempted.
 *
 * (This paragraph read „45 … 13 … 58" until 2026-08-30 and had been wrong since
 * CLOSING_ON_LEAD_TOO_FAST landed on 2026-08-05: the gate test's own pin was
 * already 46/13/59 and is what the tree actually enforces. Corrected in the
 * same pass that adds the fourteenth exemption, because a prose count that
 * drifts from the asserted one teaches the next reader to trust neither.)
 *
 * PURE + node-safe: no three.js, no DOM, no network. The gate test drives it.
 *
 * WAVE 0 IS REPORT-ONLY. Nothing here throws; the caller decides. What it
 * produces is a machine-checked BASELINE — a census the other fourteen lanes
 * watch their own counts fall in.
 */

import fs from "node:fs";
import path from "node:path";

import {
  headingOfDir,
  isContact,
  obbDiscSeparationM,
  PEDESTRIAN_BODY_RADIUS_M,
  playerObb,
} from "../collision";
import { PERCEPTUAL_ROAD_SCALE } from "../contracts";
import type { LessonSpec, StagedEventSpec } from "../contracts";
import { createEvalState, parseObjectiveParams, stepObjective } from "../lessons/objectives";
import { routeFinishZone } from "../lessons/finish";
import type { ObjectiveParams } from "../lessons/types";
import { compileScenario } from "../lessons/scenario/compile";
import { SCENARIO_TEMPLATES } from "../lessons/scenario/templates";
import type { ScenarioSpec } from "../lessons/scenario/types";
import { DEFAULT_RULE_CONFIG, VIOLATIONS, COMMENDATIONS } from "../rules";
import type { CommendationCode, RuleEngineConfig, SimTick, ViolationCode } from "../rules";
import { createWorldRuntime } from "../runtime";
import { DistrictIndex, LANE_WIDTH_M as RUNTIME_LANE_WIDTH_M } from "../runtime/spatial";
import { Locator } from "../runtime/locator";
import type { StopLine } from "../runtime/stoplines";
import { guidanceGoalFor, stopLinesForGuidance } from "../scene/guidanceRoute";
import { buildWorldGeometry } from "./builders/buildWorldGeometry";
import {
  DASH_GAP_M,
  DASH_LENGTH_M,
  gradesCrossingDuty,
  LANE_WIDTH_M,
  MARKED_CLASSES,
  SCENARIO_SIGN_SCALE,
} from "./builders/constants";
import { offsetPolyline, polylineLength, trimPolyline, type Vec2 } from "./builders/math2d";
import { analyzeNetwork } from "./builders/network";
import {
  assertDistrict,
  signKindSpeedKmh,
  speedLimitSignKind,
  type District,
  type SignKind,
  type WorldGeometry,
} from "./types";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export type FaultCode = ViolationCode | CommendationCode;

/**
 * The 14 codes with NO world referent — doc 86 §10. Thirteen of them are a fact
 * about the CAR or the DRIVER's procedure, not about the street: the world
 * cannot be wrong about a seatbelt. Listed explicitly so the exemption is
 * reviewed.
 *
 * `OFF_CARRIAGEWAY` IS THE FOURTEENTH AND IT IS EXEMPT FOR A DIFFERENT REASON,
 * written out because appending it under the sentence above would have made
 * that sentence false. It is emphatically about the street — but it is a
 * SURFACE QUERY, not a body. Every other checked code names a thing the world
 * must CONTAIN (a Б2, a light, an authored В24 span, a staged cyclist) and the
 * predicate asks „is it there?"; this code's referent is the carriageway
 * itself, which every district that has a single drawn edge already has. A
 * required-referent rule for it could only ever assert „this world has a road",
 * which is true of all 105 shipped districts by construction and would
 * therefore be a check that can never fail — the dead-predicate class, in the
 * one file whose whole job is to stop codes grading what their world lacks.
 * The honest answer is the exemption plus this paragraph.
 *
 * WHAT ACTUALLY GUARDS IT INSTEAD, since „exempt here" must not read as
 * „unguarded": `runtime/__tests__/off-carriageway-consult.test.ts` proves the
 * acquitting half directly on the geometry — 248 spawn points, 117 authored
 * parking-bay centres and 57,000 poses across every travel lane AND kerbside
 * parking band of all 105 districts, worst `outsideKerbM` 0.000 m. That is a
 * stronger statement than a referent rule could make: not „the world contains
 * the thing", but „nowhere a lawful car can stand reads as off it".
 */
export const NO_WORLD_REFERENT: ReadonlySet<FaultCode> = new Set<FaultCode>([
  "OFF_CARRIAGEWAY",
  "SEATBELT_OFF_WHILE_MOVING",
  "HANDBRAKE_LEFT_ON",
  "ENGINE_STALLED",
  "PREDRIVE_PERFECT",
  "PREDRIVE_SEATBELT_SKIPPED",
  "PREDRIVE_STEP_SKIPPED",
  "PREDRIVE_WRONG_ORDER",
  "MOVE_OFF_WITHOUT_OBSERVATION",
  "LANE_CHANGE_WITHOUT_INDICATOR",
  "LANE_CHANGE_WITHOUT_MIRROR_CHECK",
  "TURN_WITHOUT_INDICATOR",
  "SAFE_LANE_CHANGE",
  "CLEAN_DRIVING",
]);

/**
 * Detectors a `RuleEngineConfig` flag can disarm. A code whose flag is false
 * on the compiled rung is NOT in that rung's fault surface, so it is never
 * asked for a referent — the drill that never grades it cannot lie about it.
 * (`WRONG_LANE_FOR_DIRECTION` is deliberately absent: engine.ts:1672-1685 arms
 * it on `tick.laneArrow` data, not on `turnObservationEnabled` — it is one of
 * the two codes that already reads the world, the precedent §10 generalises.)
 */
const CONFIG_GATED: ReadonlyArray<readonly [FaultCode, keyof RuleEngineConfig]> = [
  ["MOVE_OFF_WITHOUT_OBSERVATION", "moveOffObservationEnabled"],
  ["JUNCTION_SCAN_INCOMPLETE", "junctionScanObservationEnabled"],
  ["TURN_WITHOUT_OBSERVATION", "turnObservationEnabled"],
  ["FOLLOWING_TOO_CLOSE_FOR_RAIN", "followRainAwareEnabled"],
  ["CLOSING_ON_LEAD_TOO_FAST", "leadClosingEnabled"],
  ["ILLEGAL_STOP_IN_BAN_ZONE", "banZoneStopEnabled"],
  ["DRIVING_TOO_SLOW_FOR_MOTORWAY", "motorwayMinSpeedEnabled"],
];

/**
 * Pre-drive codes only exist while `LessonSpec.preDrive` is true. Every
 * compiled scenario sets it false (compile.ts:261), so they are structurally
 * off — but the rule is written down rather than assumed.
 */
const PREDRIVE_ONLY: ReadonlySet<FaultCode> = new Set<FaultCode>([
  "PREDRIVE_PERFECT",
  "PREDRIVE_SEATBELT_SKIPPED",
  "PREDRIVE_STEP_SKIPPED",
  "PREDRIVE_WRONG_ORDER",
]);

/** Every code the catalog can emit — the 58 the gate must account for. */
export function allFaultCodes(): FaultCode[] {
  return [
    ...(Object.keys(VIOLATIONS) as ViolationCode[]),
    ...(Object.keys(COMMENDATIONS) as CommendationCode[]),
  ];
}

// ---------------------------------------------------------------------------
// Ledger defect ids — the classes the census reports on
// ---------------------------------------------------------------------------

export type LedgerDefectId =
  | "T1"
  | "T2"
  | "T3"
  | "T3b"
  | "T4"
  | "T4raw"
  | "T6"
  | "T8"
  | "T8raw"
  | "T13"
  | "T14"
  | "L2"
  | "L3"
  | "L10"
  | "L12"
  | "B1"
  | "B3"
  | "B4"
  | "B4raw"
  | "S1"
  | "S2"
  | "S3"
  | "S4"
  | "S5";

/**
 * The counts doc 86 publishes. The gate reproduces these on the tree the
 * ledger was written against, and may only ever RATCHET DOWN from them: a
 * lane that repairs a class lowers its number, and no lane may raise one.
 *
 * `unit` says what is being counted — the ledger mixes scenarios and
 * objectives and the difference is not cosmetic (T3 is 9 OBJECTIVES across 8
 * scenarios).
 */
export interface LedgerRow {
  id: LedgerDefectId;
  unit: "scenarios" | "objectives" | "districts" | "edges" | "rungs";
  /**
   * A hard number ONLY where this gate measures the SAME predicate doc 86
   * measured, so equality is proof rather than coincidence. Everywhere else
   * this is null and `ledgerNote` carries the document's figure with the
   * reason the two differ — a gate that quietly bent its predicate to hit a
   * published number would be worth nothing.
   */
  ledger: number | null;
  ledgerNote?: string;
  what: string;
  /** True for the four §10 says are counted to ±0. */
  precise: boolean;
}

export const LEDGER_BASELINE: readonly LedgerRow[] = [
  {
    id: "T1",
    unit: "scenarios",
    ledger: 90,
    precise: true,
    what: "district runs no lane-line pass at all (no MARKED_CLASSES edge) — the осева fault is a lie",
  },
  {
    id: "T2",
    unit: "scenarios",
    ledger: 31,
    precise: true,
    what: "compiled spawn pose is already outside laneKeepMaxOffsetM — in violation before the first frame",
  },
  {
    id: "T3",
    unit: "objectives",
    ledger: 9,
    ledgerNote:
      "STILL 9, AND THAT IS NOT A FAILURE. This row reproduces doc 86's literal criterion — the " +
      "AUTHORED coordinate — and it is the gate's proof that it agrees with the document. Lane 2 " +
      "did not re-author nine templates; it made the class unauthorable, resolving every " +
      "passSignal against the runtime's own stop lines at guidanceRoute.ts:312. What the student " +
      "SEES is T3b, and T3b is 0. Expect this row to sit at 9 forever.",
    precise: true,
    what: "passSignal marker AUTHORED at the junction node (0,0) — doc 86 §2 T3's literal criterion (see T3b for what ships)",
  },
  {
    id: "T3b",
    unit: "objectives",
    ledger: null,
    ledgerNote:
      "doc 86 lists 9 by name but its set is not the (0,0) set: it names sc-sig-green-wave twice " +
      "(sc-sgw-tl3 is authored at (0,528), the THIRD junction's node — same defect, different number) " +
      "and drops sc-ln-turn-lane-arrows/sc-lnta-signal, which is at (0,0). By the predicate that " +
      "actually matters — the marker is on the far side of the graded cut — the count is 10, not 9.",
    precise: false,
    what: "passSignal marker sits PAST the stop line the same lesson grades (the S1 predicate)",
  },
  {
    id: "T4",
    unit: "scenarios",
    ledger: 83,
    ledgerNote:
      "WAVE 1: the predicate is now the sentence the rule always stated — every route limit has a " +
      "face in the kit, and no built plate standing on a route edge contradicts it. At wave 0 the " +
      "kit had ONE numeral (В26-50), so that sentence collapsed into `maxspeed !== 50` and the " +
      "collapsed form is what produced 83. Lane 3 built the other twelve faces, so the collapsed " +
      "form now counts correctly-signed 20 and 90 roads as defects; T4raw keeps it visible.",
    precise: true,
    what: "a route limit the built world cannot state, or a built plate that contradicts the road it stands on",
  },
  {
    id: "T4raw",
    unit: "scenarios",
    ledger: null,
    ledgerNote:
      "the wave-0 predicate, kept so nothing is deleted: `some route edge.maxspeed !== 50`. It is " +
      "no longer a defect — it is a count of roads that are not 50 — and it can only grow as the " +
      "catalog does. Retained as the audit trail behind doc 86's published 83.",
    precise: false,
    what: "wave-0 proxy: the district posts a limit that is not 50 (NOT a defect since Lane 3)",
  },
  {
    id: "T6",
    unit: "scenarios",
    ledger: null,
    ledgerNote: "doc 86 publishes 58 parked bodies in 7 districts — Lane 4 owns the sightline battery",
    precise: false,
    what: "parked bodies inside a junction mouth (NOT measured here)",
  },
  {
    id: "T8",
    unit: "objectives",
    ledger: null,
    ledgerNote:
      "doc 86 publishes 177 capped objectives across 127 scenarios and calls the cap INVISIBLE. " +
      "Wave 0 counted the caps; wave 1 counts the caps the marker still does not state, which is " +
      "the actual defect. T8raw keeps the wave-0 total.",
    precise: false,
    what: "a speed-capped reachZone whose guidance marker never publishes the cap",
  },
  {
    id: "T8raw",
    unit: "objectives",
    ledger: null,
    ledgerNote: "the wave-0 proxy: every capped reachZone, shown or not. Grows with the catalog.",
    precise: false,
    what: "wave-0 proxy: speed-capped reachZones in the catalog (a feature once the marker states it)",
  },
  {
    id: "T13",
    unit: "scenarios",
    ledger: null,
    ledgerNote:
      "doc 86 publishes 4 — a Bulgarian-copy-vs-built-sign cross-check this lane does not attempt " +
      "(it needs a sign-name lexicon, which is Lane 3's kit work)",
    precise: false,
    what: "teach copy names a sign the built world does not carry (NOT measured here)",
  },
  {
    id: "T14",
    unit: "scenarios",
    ledger: null,
    ledgerNote:
      "doc 86 publishes 4 scenarios; this gate counts SCENARIOS whose district has a curve/water/ice " +
      "zone whose А1/А15 post stands under 40 m before the span start",
    precise: false,
    what: "warning post stands at the hazard's first metre instead of in advance of it",
  },
  {
    id: "L2",
    unit: "scenarios",
    ledger: null,
    ledgerNote:
      "doc 86 publishes 12 scenarios; this gate counts every scenario whose ROUTE passes a node " +
      "with an under-scaled head, which is the wider and more honest surface",
    precise: false,
    what: "signal head renders at 1x on a 2.5x world (no SCENARIO_SIGN_SCALE)",
  },
  {
    id: "L3",
    unit: "scenarios",
    ledger: null,
    ledgerNote:
      "doc 86 publishes 1 (sc-pe-jaywalker). The gap is structural, not per-district: neither " +
      "SignKind nor TrafficLightPlacement has a pedestrian variant and props.ts:221 synthesises " +
      "heads from ROAD NODES only — so EVERY signalized crossing in the catalog is an unlit one.",
    precise: false,
    what: "a signalized crossing on a map where no pedestrian signal head can exist (none is buildable)",
  },
  {
    id: "L10",
    unit: "scenarios",
    ledger: null,
    ledgerNote:
      "doc 86 publishes 34; this gate counts a rung on ANY level (the condition is usually authored " +
      "on the L5 rung) whose copy never mentions светлини/фарове",
    precise: false,
    what: "night/rain/fog condition graded with no lights instruction in the copy",
  },
  {
    id: "L12",
    unit: "scenarios",
    ledger: null,
    ledgerNote: "doc 86 publishes 57; this gate requires NO rung to stage anything (stagedAdd counts)",
    precise: false,
    what: "stages nothing at all, yet the surface carries conflict codes",
  },
  {
    id: "B1",
    unit: "scenarios",
    ledger: null,
    ledgerNote:
      "doc 86 publishes 10 and counts ONE cause — a terminal completeManeuver that is not parkInBay. " +
      "routeFinishZone also returns null for a single-objective route and for a route the half-distance " +
      "clamp shrinks under FINISH_MIN_RADIUS_M; those strand the student identically. The real number " +
      "is higher — see the B1 cause breakdown in the report.",
    precise: false,
    what: "no automatic finish at all (routeFinishZone is null)",
  },
  {
    id: "B3",
    unit: "scenarios",
    ledger: null,
    ledgerNote:
      "doc 86 publishes 50 (final OBJECTIVE radius below the lane pitch); this gate measures the " +
      "FINISH ZONE radius after finish.ts's half-distance clamp, which is what actually strands the car",
    precise: false,
    what: "finish-zone radius below the lane pitch — the rescue inherits lane exclusivity",
  },
  {
    id: "B4",
    unit: "scenarios",
    ledger: null,
    ledgerNote:
      "doc 86 publishes 127. The defect was never per-template: one stateless `stepReachZone` " +
      "broke every capped zone at once. Wave 1 probes the evaluator (see reachZoneEvaluatorProbe) " +
      "and reports the capped scenarios only while the probe fails, so the row reaches 0 the " +
      "moment the latch lands and rises to the full count again the moment it is removed.",
    precise: false,
    what: "capped reachZones with no memory of a cap already honoured — unrecoverable once blown",
  },
  {
    id: "B4raw",
    unit: "scenarios",
    ledger: null,
    ledgerNote: "the wave-0 proxy: every scenario carrying a capped reachZone. Grows with the catalog.",
    precise: false,
    what: "wave-0 proxy: scenarios carrying at least one capped reachZone",
  },
  { id: "S1", unit: "objectives", ledger: null, precise: false, what: "S1 GUIDANCE TRUTH" },
  { id: "S2", unit: "scenarios", ledger: null, precise: false, what: "S2 SPAWN LEGALITY" },
  { id: "S3", unit: "scenarios", ledger: null, precise: false, what: "S3 TERMINABILITY (static half)" },
  { id: "S4", unit: "scenarios", ledger: null, precise: false, what: "S4 RUNG DISTINCTNESS" },
  { id: "S5", unit: "scenarios", ledger: null, precise: false, what: "S5 SURVIVABLE COMPLIANCE" },
];

// ---------------------------------------------------------------------------
// District loading + world facts
// ---------------------------------------------------------------------------

const WORLD_DIR_CANDIDATES = [
  path.join(process.cwd(), "content", "world"),
  path.resolve(process.cwd(), "..", "content", "world"),
];

export function worldDir(): string {
  for (const dir of WORLD_DIR_CANDIDATES) if (fs.existsSync(dir)) return dir;
  throw new Error(`content/world not found in: ${WORLD_DIR_CANDIDATES.join(", ")}`);
}

const districtCache = new Map<string, District>();
export function loadDistrict(id: string): District {
  const hit = districtCache.get(id);
  if (hit) return hit;
  const file = path.join(worldDir(), `${id}.json`);
  const d = assertDistrict(JSON.parse(fs.readFileSync(file, "utf8")) as unknown);
  districtCache.set(id, d);
  return d;
}

/** District-space point. Placements are world-space: (x, _, z) with z = -y. */
interface P2 {
  x: number;
  y: number;
}
const dp = (pos: readonly [number, number, number]): P2 => ({ x: pos[0], y: -pos[2] });
const dist2 = (a: P2, b: P2): number => Math.hypot(a.x - b.x, a.y - b.y);

export interface SignFact {
  kind: SignKind;
  at: P2;
  scale: number;
  /** The numeral the FACE states, for a В26/В33 plate. Null for every other
   *  kind. Read back from the built kind, never from the authored intent — a
   *  plate that lies is a plate whose kind disagrees with the road. */
  speedKmh: number | null;
}

export interface WorldFacts {
  districtId: string;
  district: District;
  index: DistrictIndex;
  geometry: WorldGeometry;
  stopLines: readonly StopLine[];
  signs: readonly SignFact[];
  /** Lamp heads by the district node they address. */
  lightsByNode: ReadonlyMap<string, Array<{ at: P2; scale: number }>>;
  /** Edge ids whose class puts them in the lane-line pass at all. */
  markedClassEdges: ReadonlySet<string>;
  /** Edge ids that actually receive lane-boundary paint (dashes or an authored solid). */
  paintedLaneEdges: ReadonlySet<string>;
  maxspeedByEdge: ReadonlyMap<string, number>;
  /**
   * Edges that actually receive a PAINTED М10 arrow.
   *
   * Was `hasLaneArrows: boolean` — `meta.scenario.laneArrows !== undefined`,
   * district-wide and route-blind, so a map with arrows on one street
   * certified WRONG_LANE_FOR_DIRECTION on a route that never touches it, and
   * a malformed `laneArrows` block (which makes `paintLaneArrows` a silent
   * no-op) certified a route with no arrow anywhere. Second-degree relative of
   * the `instructionsBg` defect, found in the same audit: the premise was
   * satisfiable by authored intent the painter had already thrown away.
   * Now derived with markings.ts's own validity rules, per edge.
   */
  laneArrowEdges: ReadonlySet<string>;
}

const worldCache = new Map<string, WorldFacts>();

/** Replicates markings.ts's lane-line loop gate exactly (constants imported,
 *  so a Lane-1 change to MARKED_CLASSES moves this number automatically). */
function dashedLaneEdges(district: District): Set<string> {
  const net = analyzeNetwork(district);
  const painted = new Set<string>();
  for (const eb of net.edges) {
    if (!eb.line) continue;
    if (!MARKED_CLASSES.has(eb.edge.class)) continue;
    const line = trimPolyline(eb.line as Vec2[], 0.8, 0.8, 2.5);
    if (!line) continue;
    const lanes = Math.max(1, eb.edge.lanes);
    const travelHalf = eb.halfWidth - eb.parkingM;
    for (let k = 1; k < lanes; k += 1) {
      const off = -travelHalf + k * LANE_WIDTH_M;
      if (Math.abs(off) > travelHalf - 0.4) continue;
      // paintDashedLine emits its first quad only past gap/2 + dashLen.
      if (polylineLength(offsetPolyline(line, off)) > DASH_GAP_M / 2 + DASH_LENGTH_M) {
        painted.add(eb.edge.id);
      }
    }
  }
  // Authored solids paint a lane boundary on ANY class (markings.ts
  // paintZoneSolids runs before the MARKED_CLASSES gate is ever consulted).
  for (const z of district.zones ?? []) {
    if (
      z.kind === "solidCenterLine" ||
      z.kind === "noOvertaking" ||
      z.kind === "busLane" ||
      z.kind === "emergencyLane"
    ) {
      painted.add(z.edgeId);
    }
  }
  return painted;
}

/**
 * Replicates `markings.ts readLaneArrows` + `paintLaneArrows`'s edge loop: the
 * edges an М10 glyph is actually painted on. Anything the painter treats as
 * malformed (no edgeIds, a non-numeric or inverted span, no lane with a known
 * arrow vocab) paints NOTHING, so it yields nothing here either — the whole
 * point is that this reads what gets built, not what got typed.
 */
const LANE_ARROW_VOCAB = new Set(["through", "left", "right", "nearExits", "farExits"]);
function paintedLaneArrowEdges(district: District): Set<string> {
  const out = new Set<string>();
  const sc = district.meta.scenario as { laneArrows?: Record<string, unknown> } | undefined;
  const la = sc?.laneArrows;
  if (!la || typeof la !== "object") return out;
  const edgeIds = Array.isArray(la.edgeIds)
    ? (la.edgeIds as unknown[]).filter((e): e is string => typeof e === "string")
    : typeof la.edgeId === "string"
      ? [la.edgeId]
      : [];
  if (edgeIds.length === 0) return out;
  const { fromM, toM } = la;
  if (typeof fromM !== "number" || typeof toM !== "number" || !(fromM < toM)) return out;
  const lanes = Array.isArray(la.lanes)
    ? (la.lanes as Array<Record<string, unknown> | null>).filter(
        (l) =>
          typeof l?.arrow === "string" &&
          LANE_ARROW_VOCAB.has(l.arrow) &&
          typeof l?.centerM === "number" &&
          Number.isFinite(l.centerM),
      )
    : [];
  if (lanes.length === 0) return out;
  const known = new Set(district.roads.edges.map((e) => e.id));
  for (const id of edgeIds) if (known.has(id)) out.add(id);
  return out;
}

export function worldFactsFor(districtId: string): WorldFacts {
  const hit = worldCache.get(districtId);
  if (hit) return hit;

  const district = loadDistrict(districtId);
  const index = new DistrictIndex(district as never);
  const geometry = buildWorldGeometry(district);
  const runtime = createWorldRuntime(district);

  const signs: SignFact[] = geometry.signs.map((s) => ({
    kind: s.kind,
    at: dp(s.position),
    scale: s.scale ?? 1,
    speedKmh: signKindSpeedKmh(s.kind),
  }));
  const lightsByNode = new Map<string, Array<{ at: P2; scale: number }>>();
  for (const l of geometry.trafficLights) {
    const list = lightsByNode.get(l.nodeId) ?? [];
    list.push({ at: dp(l.position), scale: l.scale ?? 1 });
    lightsByNode.set(l.nodeId, list);
  }

  const markedClassEdges = new Set<string>();
  const maxspeedByEdge = new Map<string, number>();
  for (const e of district.roads.edges) {
    if (MARKED_CLASSES.has(e.class)) markedClassEdges.add(e.id);
    maxspeedByEdge.set(e.id, e.maxspeed);
  }

  const facts: WorldFacts = {
    districtId,
    district,
    index,
    geometry,
    stopLines: runtime.debugStopLines(),
    signs,
    lightsByNode,
    markedClassEdges,
    paintedLaneEdges: dashedLaneEdges(district),
    maxspeedByEdge,
    laneArrowEdges: paintedLaneArrowEdges(district),
  };
  worldCache.set(districtId, facts);
  return facts;
}

// ---------------------------------------------------------------------------
// Scenario facts — the compiled rung, its surface, its route corridor
// ---------------------------------------------------------------------------

/**
 * Corridor half-width used to decide which district edges "the objective chain
 * touches". Honest limitation: the gate does NOT path-find. It snaps the spawn
 * and every objective anchor to the nearest edge and samples the straight
 * segments between consecutive anchors, so a route that doglegs off the
 * straight line between two waypoints can be under-covered. Under-coverage
 * only ever makes the gate MORE permissive, never falsely accusing.
 */
export const ROUTE_SNAP_M = 30;
const ROUTE_SAMPLE_M = 8;

export interface ScenarioFacts {
  spec: ScenarioSpec;
  level: number;
  lesson: LessonSpec;
  world: WorldFacts;
  spawn: { x: number; y: number; headingDeg: number };
  spawnLaneOffsetM: number;
  objectives: ObjectiveParams[];
  /** Anchor point of each objective (null for driveDistance / smoothStop). */
  anchors: Array<P2 | null>;
  routeEdgeIds: ReadonlySet<string>;
  routeNodeIds: ReadonlySet<string>;
  /** Stop lines on the route's own edges. */
  routeStopLines: readonly StopLine[];
  staged: readonly StagedEventSpec[];
  surface: ReadonlySet<FaultCode>;
  night: boolean;
  rain: boolean;
  fog: boolean;
  snow: boolean;
  /**
   * Does a step of the briefing THE STUDENT IS SHOWN mention the lamps?
   *
   * Reads `lesson.briefingBg` — the COMPILED field LessonPlayShell renders —
   * and never `spec.instructionsBg`, which the compiler used to drop on the
   * floor. That substitution is the whole point of the 2026-08-02 wave: for
   * three months this predicate read a field with no consumer outside its own
   * type, its validator and this gate, so "the copy says светлини" and "the
   * student was told" were different sentences and only the gate could not
   * tell them apart. See EVIDENCE_CHANNELS.briefing.
   */
  lightsInstructed: boolean;
}

function anchorOf(p: ObjectiveParams, lesson: LessonSpec): P2 | null {
  switch (p.kind) {
    case "reachZone":
    case "passSignal":
      return { x: p.x, y: p.y };
    case "driveDistance":
      return null;
    case "completeManeuver":
      switch (p.maneuver) {
        case "parkInBay":
          return { x: p.bay.x, y: p.bay.y };
        case "roundabout":
          return { x: p.x, y: p.y };
        case "threePointTurn":
          return { x: p.corridor.x, y: p.corridor.y };
        default:
          return lesson.parkingBay ? { x: lesson.parkingBay.x, y: lesson.parkingBay.y } : null;
      }
  }
}

const LIGHTS_COPY = /светлин|фаров/i;

export function scenarioFactsFor(spec: ScenarioSpec, level: number): ScenarioFacts {
  const lesson = compileScenario(spec, level as 1 | 2 | 3 | 4 | 5);
  const world = worldFactsFor(spec.map.districtId);

  // Spawn, resolved exactly as LessonScene.spawnPose does (LessonScene.tsx:305).
  let sx: number;
  let sy: number;
  let sh: number;
  if (lesson.spawn.pointId) {
    const p = world.district.spawnPoints.find((s) => s.id === lesson.spawn.pointId);
    sx = p?.x ?? lesson.spawn.position?.x ?? 0;
    sy = p?.y ?? lesson.spawn.position?.y ?? 0;
    sh = p?.heading ?? lesson.spawn.headingDeg ?? 0;
  } else {
    sx = lesson.spawn.position?.x ?? 0;
    sy = lesson.spawn.position?.y ?? 0;
    sh = lesson.spawn.headingDeg ?? 0;
  }
  const spawnFix = new Locator(world.index).track(sx, sy, sh);

  const objectives = lesson.objectives.map((o) => parseObjectiveParams(o));
  const anchors = objectives.map((p) => anchorOf(p, lesson));

  // Route corridor.
  const waypoints: P2[] = [{ x: sx, y: sy }];
  for (const a of anchors) if (a) waypoints.push(a);
  const routeEdgeIds = new Set<string>();
  const scratch = {
    edgeIdx: -1,
    distM: Infinity,
    sM: 0,
    latSignedM: 0,
    tanX: 0,
    tanY: 1,
    outsideM: Infinity,
  };
  const snap = (p: P2): void => {
    if (world.index.nearestEdge(p.x, p.y, ROUTE_SNAP_M, scratch)) {
      routeEdgeIds.add(world.index.edgeRt(scratch.edgeIdx).edge.id);
    }
  };
  for (let i = 0; i < waypoints.length; i += 1) {
    snap(waypoints[i]!);
    const next = waypoints[i + 1];
    if (!next) continue;
    const a = waypoints[i]!;
    const steps = Math.min(400, Math.ceil(Math.hypot(next.x - a.x, next.y - a.y) / ROUTE_SAMPLE_M));
    for (let k = 1; k < steps; k += 1) {
      snap({ x: a.x + ((next.x - a.x) * k) / steps, y: a.y + ((next.y - a.y) * k) / steps });
    }
  }

  const routeNodeIds = new Set<string>();
  for (const id of routeEdgeIds) {
    const rt = world.index.edgeRtById(id);
    if (!rt) continue;
    routeNodeIds.add(rt.edge.from);
    routeNodeIds.add(rt.edge.to);
  }
  const routeStopLines = world.stopLines.filter((l) =>
    routeEdgeIds.has(world.index.edgeRt(l.edgeIdx).edge.id),
  );

  const env = lesson.environment ?? {};
  const night = env.timeOfDay === "night";
  const rain = env.rain === true;
  const fog = env.fog === true;
  const snow = env.snow === true;

  // Declared fault surface.
  const cfg: RuleEngineConfig = { ...DEFAULT_RULE_CONFIG, ...(lesson.ruleConfig ?? {}) };
  const surface = new Set<FaultCode>();
  for (const code of allFaultCodes()) {
    if (PREDRIVE_ONLY.has(code) && lesson.preDrive !== true) continue;
    const gate = CONFIG_GATED.find(([c]) => c === code);
    if (gate && cfg[gate[1]] !== true) continue;
    surface.add(code);
  }
  for (const m of spec.mistakes) for (const c of m.codeRefs) surface.add(c as FaultCode);

  return {
    spec,
    level,
    lesson,
    world,
    spawn: { x: sx, y: sy, headingDeg: sh },
    spawnLaneOffsetM: spawnFix.laneOffsetM,
    objectives,
    anchors,
    routeEdgeIds,
    routeNodeIds,
    routeStopLines,
    staged: lesson.stagedEvents ?? [],
    surface,
    night,
    rain,
    fog,
    snow,
    // THE COMPILED briefing, not the template's own array — if compileScenario
    // ever stops carrying it, this goes false and the gate re-opens the 214
    // rung-codes instead of quietly certifying them.
    lightsInstructed: (lesson.briefingBg ?? []).some((s) => LIGHTS_COPY.test(s.textBg)),
  };
}

// ---------------------------------------------------------------------------
// Part A — the required-referent table (45 codes)
// ---------------------------------------------------------------------------

/**
 * Two very different ways a referent can be missing, and the difference is the
 * whole north star.
 *
 * `falsehood` — the detector fires on GEOMETRY OR TELEMETRY ALONE, so the
 * absent referent produces a conviction the world does not justify. A
 * 17-year-old is told he touched a line that was never painted. This is the
 * band doc 86 §1 puts at the top: it actively produces worse drivers.
 *
 * `inert` — the detector is armed by the very thing that is missing (no
 * crossing ⇒ no crossing event ⇒ PEDESTRIAN_NOT_YIELDED can never fire), so
 * nobody is falsely convicted. Still a defect: the lesson declares a fault
 * surface its world cannot produce, which is what T9, T15 and L12 are. But it
 * is a broken lesson, not a lie told to a student, and mixing the two would
 * bury 200 real falsehoods under 24 000 inert ones.
 */
export type ReferentBand = "falsehood" | "inert";

export interface ReferentVerdict {
  ok: boolean;
  /** What the world actually has — printed on both outcomes. */
  worldHas: string;
  band?: ReferentBand;
}

// ---------------------------------------------------------------------------
// EVIDENCE CHANNELS — the invariant that makes 2026-08-02 impossible to repeat
// ---------------------------------------------------------------------------
//
// WHAT HAPPENED. `conditionLightsRule` accepted a `светлини` match inside
// `ScenarioSpec.instructionsBg` as proof that a night drill had told the
// student to switch the lights on. `compileScenario` DROPPED that field, no
// component read it, and its only non-test consumers were the type, the
// validator and THIS MODULE. So a lane could clear HEADLIGHTS_OFF_IN_RAIN on
// twelve scenarios and HEADLIGHTS_OFF_AT_NIGHT on six by writing Bulgarian
// into a void: the fault still fired at the student, the student was still
// never told, and the gate could no longer see it. That is strictly worse than
// the defect it "fixed" — before, the gate honestly flagged an unjustified
// conviction; after, it certified itself.
//
// THE GENERAL FORM. A referent's premise must be satisfiable ONLY by something
// a student can perceive. Any referent whose premise can be satisfied by data
// that never reaches a rendered surface is the same bug wearing a different
// fault code.
//
// THE MACHINE FORM. Every rule declares the channels it reads. Every channel
// names the .tsx that puts it in front of a human and a token that must appear
// in that file. `__tests__/referent-evidence-reachable.test.ts` walks the
// table: a referent pointed at a dead field fails immediately, naming the
// field and saying why. Adding the channel is not a way around the test —
// the channel itself has to prove it renders.

/** One perceivable thing a referent is allowed to treat as proof. */
export type EvidenceId =
  | "lanePaint"
  | "zoneSeamPaint"
  | "laneArrows"
  | "signFaces"
  | "signalHeads"
  | "stopLinePaint"
  | "crossingPaint"
  | "roadNetwork"
  | "stagedActors"
  | "environment"
  | "briefing"
  | "lightsTelltale";

export interface EvidenceChannel {
  /** The datum, named the way the referent reads it. */
  reads: string;
  /** What the seventeen-year-old actually perceives. */
  studentSees: string;
  /**
   * The component(s) that put it on a screen, repo-relative from `src/`.
   * `.tsx` ONLY, and the reason is the whole defect: a `.ts` module can be
   * read by nothing but a test and still look like plumbing.
   */
  renderedBy: readonly string[];
  /** Tokens that must each appear in at least one `renderedBy` file. */
  symbols: readonly string[];
}

export const EVIDENCE_CHANNELS: Readonly<Record<EvidenceId, EvidenceChannel>> = {
  lanePaint: {
    reads: "WorldFacts.paintedLaneEdges (markings.ts dashed + authored-solid pass)",
    studentSees: "white lane paint on the carriageway ahead of the bonnet",
    renderedBy: ["modules/sim/world/components/StaticWorld.tsx"],
    symbols: ["markings"],
  },
  zoneSeamPaint: {
    reads: "District.zones spans (solidCenterLine / noOvertaking / busLane / emergencyLane)",
    studentSees: "the continuous seam paintZoneSolids lays along the span",
    renderedBy: ["modules/sim/world/components/StaticWorld.tsx"],
    symbols: ["markings"],
  },
  laneArrows: {
    reads: "District.meta.scenario.laneArrows",
    studentSees: "М10 direction arrows painted in the lane",
    renderedBy: ["modules/sim/world/components/StaticWorld.tsx"],
    symbols: ["roadDecals"],
  },
  signFaces: {
    reads: "WorldGeometry.signs (the BUILT post, its kind and its scale)",
    studentSees: "a sign on a pole, its face readable from the driving seat",
    renderedBy: ["modules/sim/world/components/WorldProps.tsx"],
    symbols: ["signs"],
  },
  signalHeads: {
    reads: "WorldGeometry.trafficLights by node",
    studentSees: "the светофар heads over the junction, lamps lit by phase",
    renderedBy: ["modules/sim/world/components/WorldProps.tsx"],
    symbols: ["trafficLights"],
  },
  stopLinePaint: {
    reads: "runtime stop lines on the route's own edges",
    studentSees: "the transverse white bar across the approach",
    renderedBy: ["modules/sim/world/components/StaticWorld.tsx"],
    symbols: ["markings"],
  },
  crossingPaint: {
    reads: "District.crossings that pass gradesCrossingDuty",
    studentSees: "zebra stripes across the carriageway",
    renderedBy: ["modules/sim/world/components/StaticWorld.tsx"],
    symbols: ["markings"],
  },
  roadNetwork: {
    reads: "District.roads edges/intersections (class, oneway, degree, geometry)",
    studentSees: "the road itself — where it goes, how wide, where it forks",
    renderedBy: ["modules/sim/world/components/StaticWorld.tsx"],
    symbols: ["roadSurface"],
  },
  stagedActors: {
    reads: "LessonSpec.stagedEvents (compiled)",
    studentSees: "the car, cyclist, pedestrian or officer the director drives",
    renderedBy: ["components/sim/LessonScene.tsx", "modules/sim/traffic/TrafficLayer.tsx"],
    symbols: ["stagedEvents", "staged"],
  },
  environment: {
    reads: "LessonSpec.environment (compiled: timeOfDay / rain / fog / snow)",
    studentSees: "night sky, rain, fog or snow out of the windscreen",
    renderedBy: ["components/sim/LessonScene.tsx", "modules/sim/environment/SimEnvironment.tsx"],
    symbols: ["lesson.environment", "rain"],
  },
  briefing: {
    reads: "LessonSpec.briefingBg (compiled from ScenarioSpec.instructionsBg)",
    studentSees:
      "the „Инструкции“ card in the objective stack, and the same numbered list " +
      "one tap behind the overlay line on a phone",
    renderedBy: ["components/sim/lesson-ui/LessonPlayShell.tsx"],
    symbols: ["briefingBg"],
  },
  lightsTelltale: {
    reads: "DashboardStatus.headlightsRequired / fogLightsRequired (from LessonSpec.environment)",
    studentSees:
      "„Светлините не са включени“ on the screen rail with the key that fixes it, " +
      "plus the lit/unlit lamp on the instrument bar",
    // THIS ROW WAS PASSING ON A GREP THAT PROVED NOTHING, 2026-08-19.
    //
    // `headlightsRequired` was matched in `LessonScene.tsx` — where it appeared
    // exactly once, as a WRITE (`dash.headlightsRequired = isNight || rain`),
    // never as anything rendered. `TelltaleEdgePings.tsx` and
    // `StatusDashboard.tsx` did not mention it at all. So the reachability check
    // was satisfied by an assignment statement in a file that never showed the
    // student anything, on four codes at once.
    //
    // Moving the publication into `writeDashboardStatus` turned this red, which
    // is the gate WORKING rather than breaking — and the repair is not to put
    // the identifier back into a component to quiet the grep. It is to name the
    // chain that actually carries the duty to the screen:
    //   dashboardStatus.writeDashboardStatus publishes the four conditions →
    //   telltaleWarnings.armedTelltaleWarnings derives the row and its code →
    //   TelltaleEdgePings renders it on the rail, StatusDashboard shows the lamp.
    // `headlightsRequired` is deliberately NOT in `symbols` any more: it is the
    // legacy single bit that could not see snow, and a referent must not be
    // provable by the very field the defect was made of.
    // …and the FIRST repair attempt named `writeDashboardStatus`, which this
    // test rejected in exactly the right words: "a referent that accepts
    // writeDashboardStatus as proof is certifying itself … repoint the referent
    // at something the student can actually perceive." A publisher is not
    // perception. What the student perceives is the SENTENCE on the rail, so
    // that sentence is the evidence — it cannot be satisfied by an assignment,
    // and it goes red the moment the row stops being authored.
    // ONLY .tsx MAY APPEAR HERE, and the test says why in its own refusal: "a
    // rendering surface is a component. A .ts module can be read by nothing but
    // a test and still look like plumbing — that is exactly how
    // ScenarioSpec.instructionsBg passed for three months." So the derivation's
    // own file cannot stand as evidence however correct it is, and the two
    // components below are the whole of what a student can perceive.
    renderedBy: ["modules/sim/hud/TelltaleEdgePings.tsx", "modules/sim/hud/StatusDashboard.tsx"],
    // TWO SYMBOLS, NOT THREE, AND THAT IS A STRENGTHENING. The third used to be
    // `headlightsRequired`, matched in `LessonScene.tsx` on a single ASSIGNMENT
    // that rendered nothing — a referent proving itself with a write statement.
    // What remains is what the student actually meets: the warning rows
    // `TelltaleEdgePings` renders from `armedTelltaleWarnings`, and the lamp
    // `StatusDashboard` shows. Both go red if either surface stops rendering,
    // and neither can be satisfied by plumbing.
    symbols: ["armedTelltaleWarnings", "headlights"],
  },
};

export interface ReferentRule {
  /** `requires :` line of the failure block. */
  requires: string;
  /** `fix in :` line — where the repair belongs. */
  fixIn: string;
  ledgerId?: LedgerDefectId;
  /**
   * EVERY channel this rule's `check` treats as proof. Required, non-empty,
   * and enforced: `referent-evidence-reachable.test.ts` refuses a rule that
   * declares nothing, and refuses a channel that does not render.
   */
  evidence: readonly EvidenceId[];
  check(f: ScenarioFacts): ReferentVerdict;
}

const ok = (worldHas: string): ReferentVerdict => ({ ok: true, worldHas });
/** A missing referent that leaves the detector unreachable. */
const inert = (worldHas: string): ReferentVerdict => ({ ok: false, worldHas, band: "inert" });
/** A missing referent the detector fires WITHOUT — the student is convicted anyway. */
const lie = (worldHas: string): ReferentVerdict => ({ ok: false, worldHas, band: "falsehood" });

/** Zones of a kind that touch any route edge. */
function routeZones(f: ScenarioFacts, kinds: readonly string[]) {
  return (f.world.district.zones ?? []).filter(
    (z) => kinds.includes(z.kind) && f.routeEdgeIds.has(z.edgeId),
  );
}

function stagedKinds(f: ScenarioFacts): Set<string> {
  return new Set(f.staged.map((s) => s.kind));
}

/**
 * T1 — lane paint. WAVE 1 SHARPENING (2026-07-30, and the reason is the whole
 * point of the gate).
 *
 * At wave 0 the three lane-keeping detectors read GEOMETRY alone: they measured
 * the car's offset from a centreline that existed only in the spatial index and
 * convicted whether or not a single quad of paint had been laid. "No paint on
 * this edge" was therefore a FALSEHOOD — the student was billed осева on a road
 * with no осева.
 *
 * Lane 1 closed that at the source. `locator.ts:213` publishes `centreLinePainted`
 * / `laneLinesPainted` per fix, `worldRuntime.ts:1457` forwards them onto the
 * tick in the disarming direction only, and `rules/engine.ts:913-926,956,1127`
 * now requires them before CENTER_LINE_TOUCHED / NOT_KEEPING_RIGHT /
 * POOR_LANE_KEEPING may fire. That makes these three the THIRD precedent — the
 * same shape as CROSSED_SOLID_LINE and WRONG_LANE_FOR_DIRECTION above.
 *
 * So the predicate has to move with the engine, or the gate keeps convicting a
 * defect the product no longer has. An unpainted edge is no longer a lie; it is
 * either irrelevant (the route has painted edges too, and the code fires only
 * there — truthfully) or INERT (nothing on the route is painted, so a declared
 * surface can never arm). The counter-proof that the disarm is real lives in
 * runtime/__tests__/lane-paint-referent.test.ts.
 */
function laneLineRule(codeLabel: string): ReferentRule {
  return {
    requires:
      "lane paint on the route, or — since Lane 1 — a runtime that DISARMS the detector where there is none",
    fixIn:
      "world/builders/constants.ts MARKED_CLASSES + markings.ts (paint) · runtime/locator.ts:213 + rules/engine.ts:913 (the disarm)",
    ledgerId: "T1",
    evidence: ["lanePaint"],
    check(f) {
      const bare = [...f.routeEdgeIds].filter((id) => !f.world.paintedLaneEdges.has(id));
      if (bare.length === 0) {
        return ok(`lane paint on all ${f.routeEdgeIds.size} route edge(s)`);
      }
      if (bare.length === f.routeEdgeIds.size) {
        return inert(
          `NO route edge carries lane paint (${bare.slice(0, 4).join(", ")}${
            bare.length > 4 ? ", …" : ""
          }) — the locator disarms ${codeLabel} everywhere on this route, so it can never fire`,
        );
      }
      return ok(
        `lane paint on ${f.routeEdgeIds.size - bare.length}/${f.routeEdgeIds.size} route edge(s); ` +
          `the locator disarms ${codeLabel} on the other ${bare.length} (${bare
            .slice(0, 3)
            .join(", ")}${bare.length > 3 ? ", …" : ""})`,
      );
    },
  };
}

function signalHeadRule(): ReferentRule {
  return {
    requires: `>=2 trafficLights at a node on the route, each rendered at scale >= ${SCENARIO_SIGN_SCALE}`,
    fixIn: "world/builders/props.ts:229-259 (Lane 3 — spread ...lessonSized into both pushes)",
    ledgerId: "L2",
    evidence: ["signalHeads", "roadNetwork"],
    check(f) {
      let best: { node: string; n: number; scale: number } | null = null;
      for (const nodeId of f.routeNodeIds) {
        const heads = f.world.lightsByNode.get(nodeId);
        if (!heads || heads.length === 0) continue;
        const minScale = Math.min(...heads.map((h) => h.scale));
        if (!best || heads.length > best.n) best = { node: nodeId, n: heads.length, scale: minScale };
      }
      if (!best) return inert("trafficLights on the route = 0");
      if (best.n < 2) return inert(`trafficLights at ${best.node} = ${best.n} (need >=2)`);
      if (best.scale < SCENARIO_SIGN_SCALE) {
        return lie(
          `trafficLights at ${best.node} = ${best.n} @ scale ${best.scale} (< SCENARIO_SIGN_SCALE ${SCENARIO_SIGN_SCALE})`,
        );
      }
      return ok(`trafficLights at ${best.node} = ${best.n} @ scale ${best.scale}`);
    },
  };
}

function crossingRule(): ReferentRule {
  return {
    requires: ">=1 GRADEABLE district.crossing inside the route corridor",
    fixIn: "the template's map choice, or tools/maps (Lane 10)",
    evidence: ["crossingPaint"],
    check(f) {
      // Asks the SAME predicate the CrossingZoneTracker arms on (doc 87
      // A13/A16). A crossing the painter draws nothing at, on a street that is
      // not a жилищна зона, is not a пешеходна пътека — the runtime no longer
      // builds a zone for it, so it is not a referent for these codes either.
      // Counting it would make the gate certify a duty the product cannot arm.
      const byId = new Map(f.world.district.roads.edges.map((e) => [e.id, e]));
      const on = f.world.district.crossings.filter(
        (c) =>
          c.edgeId !== null &&
          f.routeEdgeIds.has(c.edgeId) &&
          gradesCrossingDuty(c, byId.get(c.edgeId)),
      );
      return on.length > 0
        ? ok(`gradeable crossings on the route = ${on.length}`)
        : inert(
            `gradeable crossings on the route = 0 (district has ${f.world.district.crossings.length}, ` +
              `of which paint/зона-backed: ${
                f.world.district.crossings.filter((c) =>
                  gradesCrossingDuty(c, c.edgeId ? byId.get(c.edgeId) : null),
                ).length
              })`,
          );
    },
  };
}

function stagedActorRule(
  kinds: readonly string[],
  label: string,
): ReferentRule {
  return {
    requires: `>=1 compiled staged actor of kind ${kinds.join(" | ")} (${label})`,
    fixIn: "the template's staged[] (Lanes 9/10/11) or orchestrator/runners.ts (Lane 7)",
    ledgerId: "L12",
    evidence: ["stagedActors"],
    check(f) {
      const have = stagedKinds(f);
      const hit = kinds.filter((k) => have.has(k));
      if (hit.length > 0) return ok(`staged: ${[...have].join(", ")}`);
      return inert(
        have.size === 0
          ? "staged actors = 0 (SCENARIO_DEFAULT_TRAFFIC applies: vehicleCount 0, pedestrianCount 0)"
          : `staged: ${[...have].join(", ")} — none of ${kinds.join("|")}`,
      );
    },
  };
}

/** A speed plate is attributed to the carriageway it stands beside. 12 m is a
 *  wide two-lane half-width plus the verge — wide enough to catch the plate,
 *  tight enough that a junction post is not blamed on the crossing arm. */
const PLATE_ON_EDGE_M = 12;

export interface PlateTruth {
  /** Route edges whose posted limit the KIT has no face for at all. */
  unstatable: Array<{ edgeId: string; kmh: number }>;
  /** A built plate standing on a route edge whose FACE contradicts that edge. */
  contradictions: Array<{ edgeId: string; edgeKmh: number; faceKmh: number }>;
  /** Speed plates built anywhere in this district. */
  plates: number;
}

/**
 * T4, WAVE 1 — the `requires` sentence, finally implemented as written.
 *
 * At wave 0 the kit shipped exactly one numeral face (В26-50), so "does the
 * world state this edge's limit truthfully?" collapsed into "is this edge 50?"
 * and the predicate was written that way. Lane 3 built the other twelve faces
 * (types.ts SPEED_LIMIT_FACES_KMH) and re-derived every plate from its road, so
 * the collapsed form now counts roads that are correctly signed at 20 or 90 as
 * defects. The sentence in `requires` never changed; the implementation has
 * caught up with it, and it reads the numeral off the BUILT face — never the
 * authored `speedKmh` intent — so a plate that lies is a plate whose kind
 * disagrees with the road it stands on.
 */
function plateTruth(f: ScenarioFacts): PlateTruth {
  const out: PlateTruth = { unstatable: [], contradictions: [], plates: 0 };
  const routeLimits = new Map<string, number>();
  for (const id of f.routeEdgeIds) {
    const v = f.world.maxspeedByEdge.get(id);
    if (v !== undefined) routeLimits.set(id, v);
  }
  for (const [edgeId, kmh] of routeLimits) {
    if (speedLimitSignKind(kmh) === null) out.unstatable.push({ edgeId, kmh });
  }
  const hit = {
    edgeIdx: -1,
    distM: Infinity,
    sM: 0,
    latSignedM: 0,
    tanX: 0,
    tanY: 1,
    outsideM: Infinity,
  };
  // Two numeral faces are NOT limit claims and are named here rather than
  // quietly skipped:
  //  · В33 „край на забраната" states the limit that ENDS here, so disagreeing
  //    with the road is its whole job. `signKindSpeedKmh` gives it no numeral,
  //    so the `null` guard below drops it before it can be asked to agree.
  //  · the curve-advisory plate (zoneSigns.ts:254) states a curveAdvisory
  //    zone's `advisoryKmh` — the number `tick.curveAdvisoryKmh` grades
  //    SPEED_TOO_FAST_FOR_CURVE against. It has a referent; it is simply not
  //    the edge limit. Recognised by its numeral matching an authored advisory
  //    on the SAME edge, so a genuine В26 that happens to sit near a curve is
  //    still asked to tell the truth.
  const advisoryKmhByEdge = new Map<string, Set<number>>();
  for (const z of f.world.district.zones ?? []) {
    if (z.kind !== "curveAdvisory") continue;
    const kmh = (z as { advisoryKmh?: number }).advisoryKmh;
    if (kmh === undefined) continue;
    const set = advisoryKmhByEdge.get(z.edgeId) ?? new Set<number>();
    set.add(kmh);
    advisoryKmhByEdge.set(z.edgeId, set);
  }
  for (const s of f.world.signs) {
    if (s.speedKmh === null) continue;
    out.plates += 1;
    if (!f.world.index.nearestEdge(s.at.x, s.at.y, PLATE_ON_EDGE_M, hit)) continue;
    const edge = f.world.index.edges[hit.edgeIdx]?.edge;
    if (!edge || !routeLimits.has(edge.id)) continue;
    const edgeKmh = routeLimits.get(edge.id)!;
    if (s.speedKmh === edgeKmh) continue;
    if (advisoryKmhByEdge.get(edge.id)?.has(s.speedKmh)) continue;
    out.contradictions.push({ edgeId: edge.id, edgeKmh, faceKmh: s.speedKmh });
  }
  return out;
}

function speedPlateRule(): ReferentRule {
  return {
    requires:
      "a built speed plate whose FACE NUMBER equals edge.maxspeed on every route edge it stands on, and a kit face for every limit the route posts",
    fixIn: "tools/blender/signs*.py + world/builders/props.ts (Lane 3)",
    ledgerId: "T4",
    evidence: ["signFaces", "roadNetwork"],
    check(f) {
      const t = plateTruth(f);
      if (t.unstatable.length > 0) {
        const shown = t.unstatable
          .slice(0, 3)
          .map((u) => `${u.edgeId}=${u.kmh}`)
          .join(", ");
        return lie(
          `route posts ${shown}${t.unstatable.length > 3 ? ", …" : ""} and the kit has NO face that states it (${t.plates} speed plates built)`,
        );
      }
      if (t.contradictions.length > 0) {
        const c = t.contradictions[0]!;
        return lie(
          `a built plate on ${c.edgeId} states ${c.faceKmh} while the road posts ${c.edgeKmh} — the student is convicted against a number the world contradicts (${t.contradictions.length} such plate(s))`,
        );
      }
      return ok(
        `every route limit has a truthful face; ${t.plates} speed plate(s) built, 0 contradict the road`,
      );
    },
  };
}

/**
 * L10 — the lamp duty, and the referent that used to certify itself.
 *
 * The predicate is unchanged in shape and completely changed in meaning: the
 * `светлини` match now has to land in `lesson.briefingBg`, the compiled field
 * `LessonPlayShell` renders, instead of `spec.instructionsBg`, the field
 * `compileScenario` dropped. Same regex, same sixteen templates' copy, same
 * sentence in `requires` — the difference is that a student can now read it.
 *
 * Two channels, and both are load-bearing:
 *  · `briefing` — the drill SAYS „включи фаровете" before the wheels turn.
 *  · `lightsTelltale` — and while driving, `environment` drives
 *    `DashboardStatus.headlightsRequired`, so „Светлините не са включени" +
 *    the key L stands on the rail before the fault is ever billed. A duty
 *    stated once at the start and never again is how you fail a
 *    seventeen-year-old for forgetting, which is not what an instructor does.
 */
function conditionLightsRule(
  cond: (f: ScenarioFacts) => boolean,
  condName: string,
): ReferentRule {
  return {
    requires: `the compiled environment sets ${condName} AND >=1 RENDERED briefing step (LessonSpec.briefingBg) matches /светлин|фаров/`,
    fixIn:
      "the template's instructionsBg (Lanes 10/11) + scenario/compile.ts briefingBg (the delivery) + scene/cabin.ts (Lane 8)",
    ledgerId: "L10",
    evidence: ["environment", "briefing", "lightsTelltale"],
    check(f) {
      if (!cond(f)) return inert(`environment does not set ${condName} — the duty cannot arise`);
      if (!f.lightsInstructed) {
        return lie(
          `${condName} is set but no step of the briefing the student is SHOWN mentions светлини/фарове — an основна fault for a duty nothing states`,
        );
      }
      return ok(`${condName} set and the rendered briefing instructs the lights`);
    },
  };
}

export const REFERENT_RULES: Readonly<Partial<Record<FaultCode, ReferentRule>>> = {
  // -- lane paint (T1) -------------------------------------------------------
  CENTER_LINE_TOUCHED: laneLineRule("CENTER_LINE_TOUCHED"),
  POOR_LANE_KEEPING: laneLineRule("POOR_LANE_KEEPING"),
  NOT_KEEPING_RIGHT: laneLineRule("NOT_KEEPING_RIGHT"),

  // -- the two precedents that already read the world ------------------------
  CROSSED_SOLID_LINE: {
    requires: "a solidCenterLine / noOvertaking zone spanning the route",
    fixIn: "content/world/<district>.json zones (already gated — the precedent)",
    evidence: ["zoneSeamPaint"],
    check(f) {
      const z = routeZones(f, ["solidCenterLine", "noOvertaking"]);
      return z.length > 0
        ? ok(`authored solid spans on the route = ${z.length}`)
        : inert("no solidCenterLine/noOvertaking span on any route edge");
    },
  },
  WRONG_LANE_FOR_DIRECTION: {
    requires: "a PAINTED М10 arrow on one of the route's own edges",
    fixIn: "content/world/<district>.json meta.scenario.laneArrows (already gated — the precedent)",
    evidence: ["laneArrows"],
    check(f) {
      const onRoute = [...f.world.laneArrowEdges].filter((id) => f.routeEdgeIds.has(id));
      if (onRoute.length > 0) return ok(`М10 arrows painted on ${onRoute.length} route edge(s)`);
      return inert(
        f.world.laneArrowEdges.size === 0
          ? "no М10 arrow is painted anywhere on this district — none exists to disobey"
          : `М10 arrows exist on ${f.world.laneArrowEdges.size} edge(s), none of them on this route`,
      );
    },
  },

  // -- stop sign + stop line -------------------------------------------------
  STOP_LINE_OVERSHOOT: stopLineRule(),
  STOP_SIGN_NO_FULL_STOP: stopLineRule(),
  FULL_STOP_AT_STOP_SIGN: stopLineRule(),

  // -- signal heads (L2) -----------------------------------------------------
  RED_LIGHT_CROSSED: signalHeadRule(),
  RED_YELLOW_CROSSED: signalHeadRule(),
  YELLOW_LIGHT_NOT_STOPPED: signalHeadRule(),
  HESITATION_AT_GREEN: signalHeadRule(),

  // -- the регулировчик ------------------------------------------------------
  CONTROLLER_SIGNAL_VIOLATED: {
    requires: "a staged trafficController actor within 25 m of a graded stop line",
    fixIn: "templates-signals*.ts officer pose (Lane 9)",
    evidence: ["stagedActors", "stopLinePaint"],
    check(f) {
      const officers = f.staged.filter((s) => s.kind === "trafficController");
      if (officers.length === 0) return inert("no staged trafficController actor");
      if (f.routeStopLines.length === 0) return inert("staged officer, but no graded stop line on the route");
      let best = Infinity;
      for (const o of officers) {
        const spec = o as unknown as { officer?: { x: number; y: number } };
        const at = spec.officer;
        if (!at) continue;
        for (const l of f.routeStopLines) {
          const [lx, ly] = f.world.index.pointAt(l.edgeIdx, l.sM);
          best = Math.min(best, dist2(at, { x: lx, y: ly }));
        }
      }
      if (!Number.isFinite(best)) return ok("staged officer (pose not published on the spec)");
      return best <= 25
        ? ok(`officer ${best.toFixed(1)} m from the graded line`)
        : lie(`officer ${best.toFixed(1)} m from the graded line (> 25 m — unreadable at that range)`);
    },
  },

  // -- pedestrians -----------------------------------------------------------
  PEDESTRIAN_NOT_YIELDED: crossingRule(),
  PEDESTRIAN_YIELDED: crossingRule(),
  PEDESTRIAN_CROSSING_TOO_FAST: crossingRule(),
  OVERTAKING_AT_CROSSING: crossingRule(),

  // -- speed (T4) ------------------------------------------------------------
  SPEEDING_OVER_LIMIT: speedPlateRule(),
  SPEEDING_DANGEROUS: speedPlateRule(),

  SPEED_TOO_FAST_FOR_CURVE: {
    requires: "a curve (А1) sign posted >= 40 m BEFORE the curveAdvisory zone's fromM",
    fixIn: "world/builders/zoneSigns.ts:129 (Lane 3 — give it the railCrossing advance offset)",
    evidence: ["signFaces", "roadNetwork"],
    ledgerId: "T14",
    check(f) {
      const zones = routeZones(f, ["curveAdvisory"]);
      if (zones.length === 0) return inert("no curveAdvisory zone on the route");
      const posts = f.world.signs.filter((s) => s.kind === "curve");
      if (posts.length === 0) return lie(`curveAdvisory zone present, curve posts = 0`);
      let bestLead = -Infinity;
      for (const z of zones) {
        const rt = f.world.index.edgeRtById(z.edgeId);
        if (!rt) continue;
        const [zx, zy] = f.world.index.pointAt(rt.idx, z.fromM);
        for (const p of posts) {
          // Lead = how far BEFORE the span start the post stands, along the edge.
          const hit = f.world.index.projectOnEdge(rt.idx, p.at.x, p.at.y, {
            edgeIdx: -1,
            distM: Infinity,
            sM: 0,
            latSignedM: 0,
            tanX: 0,
            tanY: 1,
            outsideM: Infinity,
          });
          if (hit.distM > 20) continue;
          bestLead = Math.max(bestLead, z.fromM - hit.sM);
        }
        void zx;
        void zy;
      }
      if (!Number.isFinite(bestLead)) return lie("curve post is not on the zone's own edge");
      return bestLead >= 40
        ? ok(`curve post ${bestLead.toFixed(1)} m before the arc`)
        : lie(`curve post stands ${bestLead.toFixed(1)} m before the arc (needs >= 40 m of advance)`);
    },
  },

  SPEED_TOO_FAST_FOR_CONDITIONS: {
    requires: "the compiled environment sets a non-dry condition",
    fixIn: "the template's conditions (Lanes 10/11)",
    evidence: ["environment"],
    check(f) {
      const on = [f.rain && "rain", f.fog && "fog", f.snow && "snow", f.night && "night"].filter(
        Boolean,
      );
      return on.length > 0
        ? ok(`environment: ${on.join("+")}`)
        : inert("environment is dry and daylight — no condition envelope exists to exceed");
    },
  },

  // -- authored ban zones ----------------------------------------------------
  OVERTAKING_IN_BAN_ZONE: banZoneRule("noOvertaking", "noOvertaking"),
  ILLEGAL_STOP_IN_BAN_ZONE: banZoneRule("noStopping", "noStopping"),

  DRIVING_IN_BUS_LANE: {
    requires: "a busLane zone on the route AND its painted seam",
    fixIn: "content/world/<district>.json zones + markings.ts paintZoneSolids",
    evidence: ["zoneSeamPaint"],
    check(f) {
      const z = routeZones(f, ["busLane"]);
      return z.length > 0
        ? ok(`busLane spans on the route = ${z.length} (seam painted by paintZoneSolids)`)
        : inert("no busLane zone on any route edge");
    },
  },
  EMERGENCY_LANE_DRIVING: {
    requires: "an emergencyLane zone on the route",
    fixIn: "content/world/<district>.json zones",
    evidence: ["zoneSeamPaint"],
    check(f) {
      const z = routeZones(f, ["emergencyLane"]);
      return z.length > 0
        ? ok(`emergencyLane spans on the route = ${z.length}`)
        : inert("no emergencyLane zone on any route edge");
    },
  },
  RAIL_CROSSING_VIOLATION: {
    requires: "a railCrossing zone on the route AND its А39/А40 post >= 50 m ahead of the band",
    fixIn: "world/builders/zoneSigns.ts:121-123 (Lane 3)",
    evidence: ["signFaces", "zoneSeamPaint"],
    check(f) {
      const z = routeZones(f, ["railCrossing"]);
      if (z.length === 0) return inert("no railCrossing zone on any route edge");
      const posts = f.world.signs.filter(
        (s) => s.kind === "railGuarded" || s.kind === "railUnguarded",
      );
      return posts.length > 0
        ? ok(`railCrossing spans = ${z.length}, warning posts = ${posts.length}`)
        : lie(`railCrossing spans = ${z.length} but no А39/А40 warning post is built`);
    },
  },
  DRIVING_TOO_SLOW_FOR_MOTORWAY: {
    requires: "every route edge is class motorway",
    fixIn: "the template's map choice",
    evidence: ["roadNetwork"],
    check(f) {
      const notMw = [...f.routeEdgeIds].filter((id) => {
        const rt = f.world.index.edgeRtById(id);
        return !rt || ((rt.edge.class as string) !== "motorway" && rt.edge.motorway !== true);
      });
      return notMw.length === 0 && f.routeEdgeIds.size > 0
        ? ok(`all ${f.routeEdgeIds.size} route edges are motorway`)
        : inert(`${notMw.length}/${f.routeEdgeIds.size} route edges are NOT motorway`);
    },
  },
  WRONG_WAY: {
    requires: ">=1 oneway edge on the route AND a В1 (noEntry) face at its illegal mouth",
    fixIn: "world/builders/props.ts:329-372 (Lane 3)",
    evidence: ["signFaces", "roadNetwork"],
    check(f) {
      const oneways = [...f.routeEdgeIds].filter((id) => f.world.index.edgeRtById(id)?.edge.oneway);
      if (oneways.length === 0) return inert("no oneway edge on the route — there is no wrong way to take");
      const b1 = f.world.signs.filter((s) => s.kind === "noEntry");
      return b1.length > 0
        ? ok(`oneway route edges = ${oneways.length}, В1 faces = ${b1.length}`)
        : lie(`oneway route edges = ${oneways.length} but В1 faces built = 0`);
    },
  },

  // -- staged conflicts (the reachability half is deferred; see §"deferred") --
  FAILED_TO_YIELD: stagedActorRule(
    ["priorityFromRight", "oncomingLeftTurn", "roundaboutEntry", "narrowMeeting", "oncomingStream"],
    "a vehicle with priority",
  ),
  YIELDED_TO_PRIORITY: stagedActorRule(
    ["priorityFromRight", "oncomingLeftTurn", "roundaboutEntry", "narrowMeeting", "oncomingStream"],
    "a vehicle with priority",
  ),
  EMERGENCY_NOT_YIELDED: stagedActorRule(["emergencyApproach"], "a special-regime vehicle"),
  VULNERABLE_PASS_TOO_CLOSE: stagedActorRule(["cyclistRightHook"], "a cyclist to pass"),
  COLLISION: stagedActorRule(
    [
      "pedestrianDartOut",
      "priorityFromRight",
      "brakingLeadCar",
      "cyclistRightHook",
      "roundaboutEntry",
      "oncomingLeftTurn",
      "narrowMeeting",
      "emergencyApproach",
      "cutInLeadCar",
      "rearTailgater",
      "oncomingStream",
      "trainPass",
      "amberDilemma",
      "policeStop",
      "trafficController",
      "telltaleStimulus",
    ],
    "anything to collide with",
  ),
  FOLLOWING_TOO_CLOSE: stagedActorRule(
    ["brakingLeadCar", "cutInLeadCar"],
    "a lead vehicle to follow",
  ),
  FOLLOWING_TOO_CLOSE_FOR_RAIN: stagedActorRule(
    ["brakingLeadCar", "cutInLeadCar"],
    "a lead vehicle to follow",
  ),
  CLOSING_ON_LEAD_TOO_FAST: stagedActorRule(
    ["brakingLeadCar", "cutInLeadCar"],
    "a lead vehicle to close on",
  ),
  STANDSTILL_GAP_TOO_CLOSE: stagedActorRule(
    ["brakingLeadCar", "cutInLeadCar"],
    "a stopped lead vehicle",
  ),
  OVERTAKE_INSUFFICIENT_GAP: stagedActorRule(
    ["oncomingStream", "oncomingLeftTurn", "brakingLeadCar", "cutInLeadCar", "narrowMeeting"],
    "an oncoming and a vehicle to pass",
  ),
  OVERTAKE_RETURN_TOO_EARLY: stagedActorRule(
    ["brakingLeadCar", "cutInLeadCar", "oncomingStream"],
    "a vehicle to cut back in front of",
  ),

  // -- observation -----------------------------------------------------------
  JUNCTION_SCAN_INCOMPLETE: junctionNodeRule(),
  TURN_WITHOUT_OBSERVATION: junctionNodeRule(),

  // -- lights (L10) ----------------------------------------------------------
  HEADLIGHTS_OFF_AT_NIGHT: conditionLightsRule((f) => f.night, "night"),
  HEADLIGHTS_OFF_IN_RAIN: conditionLightsRule((f) => f.rain, "rain"),
  FOG_LIGHTS_OFF_IN_FOG: conditionLightsRule((f) => f.fog, "fog"),
  HIGH_BEAM_NOT_DIPPED: {
    requires: "night AND a lead vehicle to dip for AND a lights instruction in the copy",
    fixIn: "the template's staged[] + compile.ts briefingBg (the delivery)",
    evidence: ["environment", "stagedActors", "briefing", "lightsTelltale"],
    ledgerId: "L10",
    check(f) {
      if (!f.night) return inert("environment is not night — long beam has no duty to dip");
      const have = stagedKinds(f);
      const lead = have.has("brakingLeadCar") || have.has("cutInLeadCar") || have.has("oncomingStream");
      if (!lead) return inert("night, but no staged lead/oncoming to dip for");
      return f.lightsInstructed
        ? ok("night + a lead + a lights instruction")
        : lie("night + a lead, but no instruction step mentions светлини/фарове");
    },
  },

  // -- absence assertion -----------------------------------------------------
  HARSH_BRAKING_NO_CAUSE: {
    requires:
      "ABSENCE: no staged actor and no hazard zone within braking range of the graded point (a cause makes the code unreachable, not a lie)",
    fixIn: "the template's staged[] / the drill's premise",
    evidence: ["stagedActors", "zoneSeamPaint"],
    check(f) {
      const have = stagedKinds(f);
      const hazardZones = routeZones(f, [
        "railCrossing",
        "waterPatch",
        "icePatch",
        "curveAdvisory",
      ]);
      if (have.size === 0 && hazardZones.length === 0) {
        return ok("no staged cause and no hazard zone — a causeless brake is genuinely causeless");
      }
      return inert(
        `a braking CAUSE exists (staged: ${[...have].join(", ") || "none"}; hazard zones: ${hazardZones.length}) — the detector is structurally unreachable here`,
      );
    },
  },
};

function stopLineRule(): ReferentRule {
  return {
    requires:
      ">=1 built signs.stop AND >=1 derived stop line on an approach the route drives",
    fixIn: "world/builders/props.ts (the Б2 face) + runtime/stoplines.ts (the derived line)",
    evidence: ["signFaces", "stopLinePaint"],
    check(f) {
      const stops = f.world.signs.filter((s) => s.kind === "stop");
      const lines = f.routeStopLines.filter((l) => l.control === "stopSign");
      if (stops.length > 0 && lines.length > 0) {
        const l0 = lines[0]!;
        const [lx, ly] = f.world.index.pointAt(l0.edgeIdx, l0.sM);
        return ok(
          `signs.stop=${stops.length} @ (${stops[0]!.at.x.toFixed(2)}, ${stops[0]!.at.y.toFixed(2)}) scale ${stops[0]!.scale}  |  stopLines=${lines.length} @ (${lx.toFixed(2)}, ${ly.toFixed(2)})`,
        );
      }
      // A GRADED line with no visible octagon above it is the falsehood: the
      // runtime bills the full stop the student was never shown. No line at
      // all leaves the detector unreachable instead.
      const verdict = lines.length > 0 && stops.length === 0 ? lie : inert;
      return verdict(
        `signs.stop=${stops.length}  |  stopSign lines on the route=${lines.length} (of ${f.routeStopLines.length} graded lines)`,
      );
    },
  };
}

function banZoneRule(zoneKind: string, label: string): ReferentRule {
  const SIGN_FOR: Record<string, SignKind> = {
    noOvertaking: "noOvertaking",
    noStopping: "noStopping",
  };
  return {
    requires: `a ${label} zone on the route AND its sign posted at the span start`,
    fixIn: "world/builders/zoneSigns.ts (Lane 3) + the district's zones",
    evidence: ["signFaces", "zoneSeamPaint"],
    check(f) {
      const zones = routeZones(f, [zoneKind]);
      if (zones.length === 0) return inert(`no ${label} zone on any route edge`);
      const posts = f.world.signs.filter((s) => s.kind === SIGN_FOR[zoneKind]);
      return posts.length > 0
        ? ok(`${label} spans = ${zones.length}, posts = ${posts.length}`)
        : lie(`${label} spans = ${zones.length} but 0 posts are built — the ban is invisible`);
    },
  };
}

function junctionNodeRule(): ReferentRule {
  return {
    requires: "a degree >= 3 node on the route",
    fixIn: "the template's map choice",
    evidence: ["roadNetwork"],
    check(f) {
      const junctions = f.world.district.intersections.filter(
        (i) => i.degree >= 3 && f.routeNodeIds.has(i.id),
      );
      return junctions.length > 0
        ? ok(`degree>=3 nodes on the route = ${junctions.length}`)
        : inert("no degree>=3 node on the route — there is no junction to scan");
    },
  };
}

// ---------------------------------------------------------------------------
// Part B — the five structural assertions
// ---------------------------------------------------------------------------

/**
 * S1 GUIDANCE TRUTH. The point `guidanceGoalFor` returns must lie on the
 * APPROACH side of every graded stop line near it, and the rendered ring must
 * be the objective's own radius.
 *
 * `RouteGuidance.tsx:64-65` draws a fixed ring (PILLAR_RADIUS 1.0, ground ring
 * ~1.85 m) for every objective, and `guidanceRoute.ts:100-136` drops
 * `radiusM`/`maxSpeedKmh` on the floor — so the second half of S1 fails for
 * every marker in the catalog by construction. Reported separately from the
 * stop-line half so the two do not drown each other.
 */
export const GUIDANCE_RING_RADIUS_M = 1.85;
/** How near a stop line has to be to the marker for S1 to care about it. */
export const S1_LINE_NEAR_M = 60;

export interface S1Finding {
  objectiveIndex: number;
  objectiveId: string;
  kind: string;
  marker: P2;
  line: P2;
  pastByM: number;
  lineId: string;
}

export function checkS1(f: ScenarioFacts): S1Finding[] {
  const out: S1Finding[] = [];
  // WAVE 1: the gate must grade the marker THE SCENE MOUNTS. `guidanceGoalFor`
  // takes an optional GuidanceContext, and a `passSignal` resolves against the
  // runtime's own stop lines only when it is given one (guidanceRoute.ts:312).
  // Wave 0 called it with no context, so it read back the authored junction
  // node — the very coordinate Lane 2 stopped shipping. Passing the real
  // context is not a loosening: it is the difference between measuring the
  // template and measuring the product.
  const ctx = {
    stopLines: stopLinesForGuidance(f.world.district),
    from: { x: f.spawn.x, y: f.spawn.y },
  };
  for (let i = 0; i < f.lesson.objectives.length; i += 1) {
    const goal = guidanceGoalFor(f.lesson, i, ctx);
    if (!goal || goal.kind !== "point" || !goal.marker) continue;
    const marker: P2 = { x: goal.x, y: goal.y };
    // ONE finding per objective — the worst line it overshoots. A marker mid-
    // box is past three or four arms of the same junction; counting the pairs
    // would inflate the census by the junction's degree.
    let worst: S1Finding | null = null;
    for (const line of f.world.stopLines) {
      const [lx, ly] = f.world.index.pointAt(line.edgeIdx, line.sM);
      if (dist2(marker, { x: lx, y: ly }) > S1_LINE_NEAR_M) continue;
      const hit = f.world.index.projectOnEdge(line.edgeIdx, marker.x, marker.y, {
        edgeIdx: -1,
        distM: Infinity,
        sM: 0,
        latSignedM: 0,
        tanX: 0,
        tanY: 1,
        outsideM: Infinity,
      });
      // Off this edge entirely — the line does not govern the marker.
      if (hit.distM > RUNTIME_LANE_WIDTH_M * 2) continue;
      // dirSign +1 crosses the line travelling with the geometry: the approach
      // side is the LOWER arclength. -1 mirrors it. 0.5 m of paint tolerance.
      const past = line.dirSign === 1 ? hit.sM - line.sM : line.sM - hit.sM;
      if (past > 0.5 && (worst === null || past > worst.pastByM)) {
        worst = {
          objectiveIndex: i,
          objectiveId: f.lesson.objectives[i]!.id,
          kind: f.objectives[i]!.kind,
          marker,
          line: { x: lx, y: ly },
          pastByM: past,
          lineId: line.id,
        };
      }
    }
    if (worst) out.push(worst);
  }
  return out;
}

/**
 * T8 — the invisible contract. A capped `reachZone` is a promise the student
 * cannot read unless the MARKER states it. Wave 0 counted every capped zone,
 * which is a count of a feature, not of a defect; the defect is a cap the
 * guidance goal never publishes, and `RouteGuidance.tsx:192-195` renders
 * «не по-бързо от N км/ч» from exactly this field.
 */
export function checkT8(f: ScenarioFacts): { capped: number; invisible: string[] } {
  const ctx = {
    stopLines: stopLinesForGuidance(f.world.district),
    from: { x: f.spawn.x, y: f.spawn.y },
  };
  let capped = 0;
  const invisible: string[] = [];
  for (let i = 0; i < f.objectives.length; i += 1) {
    const o = f.objectives[i]!;
    if (o.kind !== "reachZone" || o.maxSpeedKmh === undefined) continue;
    capped += 1;
    const goal = guidanceGoalFor(f.lesson, i, ctx);
    if (!goal || goal.kind !== "point" || goal.maxSpeedKmh === undefined) {
      invisible.push(f.lesson.objectives[i]?.id ?? `#${i + 1}`);
    }
  }
  return { capped, invisible };
}

/**
 * B4 — "carries a speed-capped reachZone with no memory: unrecoverable once
 * blown". Like T8 this is a property of the EVALUATOR, not of each template:
 * one stateless `stepReachZone` broke all 137 at once, and one latch repairs
 * all of them at once. So the gate probes the evaluator itself with the two
 * drives doc 86 §3 describes, and the census reports the capped scenarios only
 * while the probe fails.
 *
 *   memory  — brake to the cap on the APPROACH, then coast a shade above it
 *             across the mark. The pre-B4 evaluator demanded `inZone &&
 *             slowEnough` on one frame and failed this drive; the founder's
 *             „спрях точно на кръга и нищо не стана" is its transcript.
 *   voice   — sit ON the mark still over the cap. The evaluator must LATCH
 *             that state so the engine can say so once (THEO-4: never a bare
 *             verdict, and never silence either).
 */
export function reachZoneEvaluatorProbe(): { memory: boolean; voice: boolean } {
  const params = parseObjectiveParams({
    id: "gate-probe",
    titleBg: "проба",
    kind: "reachZone",
    params: { x: 0, y: 0, radiusM: 5, maxSpeedKmh: 20 },
  });
  const tick = (x: number, y: number, speedKmh: number, t: number): SimTick => ({
    t,
    speedKmh,
    maxSpeedKmh: 50,
    position: { x, y },
    headingDeg: 0,
    laneOffsetM: 0,
    laneId: 0,
    indicator: "off",
    headlights: "low",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: 1,
    isNight: false,
    events: [],
  });
  const drive = (ticks: readonly SimTick[]) => {
    let st = createEvalState(params);
    let done = false;
    for (const tk of ticks) {
      const r = stepObjective(params, st, tk);
      st = r.evalState;
      if (r.done) done = true;
    }
    return { done, st };
  };
  // Cap honoured 9 m out on the approach; over it by 4 km/h across the mark.
  //
  // WAS 26 (+6), sweep 161 (2026-08-18). „A shade above" now has a number:
  // objectives.ts REACH_ZONE_CAP_SLACK_KMH, which is the rule engine's own
  // `speedingGraceMaxKmh` (5) — a cap honoured on the approach and then thrown
  // away by MORE than that before arriving is no longer honoured, because five
  // shipped drills were crediting «приближи с готовност за спиране» to
  // mistake-demo drives arriving 11–19 км/ч over their cap (see that constant
  // for the table and the frame). +6 sat one km/h the wrong side of the new
  // boundary, so this fixture — and nothing else in the census — had to move.
  // It probes the same thing it always did: the latch survives the visit
  // rather than demanding cap-and-place on one frame, which is the B4 repair.
  const memory = drive([
    tick(0, -20, 30, 0),
    tick(0, -9, 18, 1),
    tick(0, 0, 24, 2),
  ]).done;
  // On the mark, still too fast — the state that used to produce nothing.
  const blown = drive([tick(0, -20, 30, 0), tick(0, 0, 26, 1)]).st;
  const voice = blown.type === "reachZone" && blown.overCapNoted;
  return { memory, voice };
}

/** S2 SPAWN LEGALITY — a student may not begin a lesson already in violation. */
export function checkS2(f: ScenarioFacts): { ok: boolean; offsetM: number; maxM: number } {
  const maxM = DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM;
  return { ok: Math.abs(f.spawnLaneOffsetM) <= maxM, offsetM: f.spawnLaneOffsetM, maxM };
}

/**
 * S3 TERMINABILITY — static half only. `routeFinishZone(objectives)` must be
 * non-null and must admit a car in any lane (radius >= one lane pitch).
 *
 * The synthetic-drive half ("for every k, a drive that skips objective k still
 * reaches it") is the completability battery Lane 6 owns; it needs a headless
 * vehicle loop this lane does not own and must not fake. See DEFERRED below.
 */
export function checkS3(f: ScenarioFacts): { ok: boolean; detail: string } {
  const zone = routeFinishZone(f.objectives);
  if (!zone) {
    const last = f.objectives[f.objectives.length - 1];
    return {
      ok: false,
      detail: `routeFinishZone = null (terminal objective is ${last ? describeObjective(last) : "absent"}) — driving to the end of the route ends nothing`,
    };
  }
  if (zone.radiusM < LANE_WIDTH_M) {
    return {
      ok: false,
      detail: `finish radius ${zone.radiusM.toFixed(2)} m < the ${LANE_WIDTH_M} m lane pitch — the rescue inherits the objective's lane exclusivity`,
    };
  }
  return { ok: true, detail: `finish zone r=${zone.radiusM.toFixed(2)} m` };
}

/** S4 RUNG DISTINCTNESS — any two rungs must differ in a compiled field other
 *  than id, titleBg and aids. Report-only until Lane 12 lands the seam. */
export function checkS4(spec: ScenarioSpec): { ok: boolean; detail: string } {
  const seen = new Map<string, number>();
  for (const rung of spec.levels) {
    const lesson = compileScenario(spec, rung.level);
    const fingerprint = JSON.stringify({
      ...lesson,
      id: undefined,
      titleBg: undefined,
      aids: undefined,
    });
    const prev = seen.get(fingerprint);
    if (prev !== undefined) {
      return { ok: false, detail: `L${prev} and L${rung.level} compile to the same lesson` };
    }
    seen.set(fingerprint, rung.level);
  }
  return { ok: true, detail: `${spec.levels.length} rungs, all distinct` };
}

/**
 * S5 SURVIVABLE COMPLIANCE — obeying the lesson may never produce a collision.
 *
 * Implemented for `pedestrianDartOut`, the only staged kind whose spec
 * publishes everything the closed form needs (release distance, walker pace,
 * dart direction and the road-occupancy window). Constant-speed sweep at the
 * governing objective cap: the closest approach must leave real air between
 * the car's BODY and the walker's.
 * Honest caveat, the same one doc 86 T11 states: a student who brakes on the
 * cue avoids contact — what the sweep proves is which way the gradient runs.
 *
 * THIS LINT MUST MEASURE WHAT THE RUNNER MEASURES (2026-08-10). It used to
 * carry its own `PEDESTRIAN_CONTACT_M = 1.5` and compare it against
 * `Math.hypot(carCentre, walker)` — a copy of the isotropic circle
 * `PedestrianDartOutRunner` has now dropped for exact box-vs-disc geometry. The
 * copy was not merely redundant, it was wrong in the dangerous direction: the
 * car's own nose reaches 2.02 m ahead of the centre this sweep tracked, so a
 * walker 1.6 m in front of it was already INSIDE the bumper while the lint
 * called the lesson survivable. It now runs `../collision` — the same bodies,
 * the same predicate — so a lesson this gate passes is a lesson the runner
 * will not convict on the obedient drive.
 */

export interface S5Finding {
  eventId: string;
  capKmh: number;
  /** Signed separation at closest approach, m: metres of air between the two
   *  bodies, or penetration depth as a negative. */
  closestM: number;
}

export function checkS5(f: ScenarioFacts): S5Finding[] {
  const out: S5Finding[] = [];
  const caps = f.objectives
    .map((o) => (o.kind === "reachZone" ? o.maxSpeedKmh : undefined))
    .filter((v): v is number => v !== undefined);
  if (caps.length === 0) return out;
  const capKmh = Math.max(...caps);
  const v = capKmh / 3.6;
  for (const ev of f.staged) {
    if (ev.kind !== "pedestrianDartOut") continue;
    const trigger = ev.triggerDistM;
    // Player closes on the crossing at v; the walker leaves the kerb at t=0.
    // Sample the whole approach at 20 Hz and take the closest approach of the
    // car's BODY to the walker's.
    // The car travels toward the crossing along the road axis (perpendicular to
    // the walker's `dir`), so that axis is also its heading — which is what
    // makes the box a box: 2.02 m of car reaches ahead of the pose this sweep
    // steps, and 0.85 m to each side.
    const axisX = -ev.dir.y;
    const axisY = ev.dir.x;
    const headingDeg = headingOfDir(axisX, axisY);
    let closest = Infinity;
    for (let t = 0; t <= 12; t += 0.05) {
      const along = trigger - v * t;
      if (along < -20) break;
      // Work in the crossing's own frame: the walker's offset from the crossing
      // centre is (pace*t) along `dir` from `start`.
      const walk = Math.min(ev.speedMps * t, ev.travelM);
      const px = ev.start.x + ev.dir.x * walk;
      const py = ev.start.y + ev.dir.y * walk;
      // Car position: `along` metres short of the crossing, on the road axis.
      const carX = ev.crossing.x - axisX * along;
      const carY = ev.crossing.y - axisY * along;
      closest = Math.min(
        closest,
        obbDiscSeparationM(
          playerObb(carX, carY, headingDeg),
          px,
          py,
          PEDESTRIAN_BODY_RADIUS_M,
        ),
      );
    }
    if (isContact(closest)) {
      out.push({ eventId: ev.id, capKmh, closestM: closest });
    }
  }
  return out;
}

function describeObjective(p: ObjectiveParams): string {
  if (p.kind === "completeManeuver") return `completeManeuver/${p.maneuver}`;
  return p.kind;
}

/**
 * DEFERRED — parts of §10 this wave does NOT implement, printed by the gate so
 * the omission is visible rather than assumed. Each names the lane that owns
 * the seam it needs.
 */
export const DEFERRED: ReadonlyArray<{ what: string; needs: string }> = [
  {
    what: "Part A reachability sub-assertion (drive the objective chain's max permitted speed AND half of it; the player must meet every staged actor before it clears)",
    needs: "the headless encounter battery — Lane 7 owns orchestrator/runners.ts + traffic/staged.ts",
  },
  {
    what: "S3 synthetic-drive half (for every k, a drive that deliberately blows objective k still terminates)",
    needs: "the completability battery — Lane 6 owns lessons/finish.ts + engine.ts",
  },
  {
    what: "T6 parked-body sightline (no body inside a junction mouth; every yield ray clears by >= 2 m)",
    needs: "scenery-sightline.test.ts — Lane 4 owns traffic/TrafficLayer.tsx",
  },
  {
    what: "S1 ring-radius half (the rendered ring must equal the objective radius)",
    needs: "Lane 2 must first carry radiusM into GuidanceGoal; guidanceRoute.ts:100-136 drops it today",
  },
];

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

export interface CodeViolation {
  scenarioId: string;
  level: number;
  code: FaultCode;
  band: ReferentBand;
  declaredBy: "mistakes[].codeRefs" | "default-ON detector";
  requires: string;
  worldHas: string;
  fixIn: string;
  ledgerId?: LedgerDefectId;
  routeSummary: string;
}

export interface GateResult {
  scenarios: number;
  rungs: number;
  codesChecked: number;
  codesExempt: number;
  violations: CodeViolation[];
  /** scenario id → the S1 findings of its first rung. */
  s1: Map<string, S1Finding[]>;
  s2Fail: string[];
  s3Fail: Map<string, string>;
  s4Fail: Map<string, string>;
  s5Fail: Map<string, S5Finding[]>;
  census: Map<LedgerDefectId, number>;
  /** Districts referenced by a scenario that run no lane-line pass. */
  t1Districts: number;
  /** ALL district files that run no lane-line pass — doc 86's "62 of 90". */
  t1DistrictsAllFiles: number;
  /** Total district files on disk — doc 86's "of 90". */
  districtFiles: number;
  /** Distinct districts behind the T2 count (the ledger publishes 15). */
  t2Districts: number;
  /** Why each B1 scenario has no finish anchor — doc 86 counts one cause of three. */
  b1Cause: Map<string, string>;
  /** The one-shot B4 evaluator probe behind the B4 census row. */
  reachZoneProbe: { memory: boolean; voice: boolean };
}

export function runWorldReferentGate(): GateResult {
  const violations: CodeViolation[] = [];
  const s1 = new Map<string, S1Finding[]>();
  const s2Fail: string[] = [];
  const s3Fail = new Map<string, string>();
  const s4Fail = new Map<string, string>();
  const s5Fail = new Map<string, S5Finding[]>();

  const t1 = new Set<string>();
  const t1d = new Set<string>();
  const t2 = new Set<string>();
  const t2d = new Set<string>();
  const t4 = new Set<string>();
  const t4raw = new Set<string>();
  const t14 = new Set<string>();
  let t3 = 0;
  let t3b = 0;
  let t8 = 0;
  let t8raw = 0;
  const b1 = new Set<string>();
  const b1Cause = new Map<string, string>();
  const b3 = new Set<string>();
  const b4 = new Set<string>();
  const b4raw = new Set<string>();
  // The B4 defect lives in ONE evaluator, so it is probed once, not 137 times.
  const reachZoneProbe = reachZoneEvaluatorProbe();
  const l10 = new Set<string>();
  const l12 = new Set<string>();
  const l2 = new Set<string>();
  const l3 = new Set<string>();

  let rungs = 0;

  for (const spec of SCENARIO_TEMPLATES) {
    let first: ScenarioFacts | null = null;
    const rungFacts: ScenarioFacts[] = [];
    for (const rung of spec.levels) {
      rungs += 1;
      const f = scenarioFactsFor(spec, rung.level);
      rungFacts.push(f);
      if (!first) first = f;

      for (const code of f.surface) {
        if (NO_WORLD_REFERENT.has(code)) continue;
        const rule = REFERENT_RULES[code];
        if (!rule) continue;
        const verdict = rule.check(f);
        if (verdict.ok) continue;
        violations.push({
          scenarioId: spec.id,
          level: rung.level,
          code,
          band: verdict.band ?? "inert",
          declaredBy: spec.mistakes.some((m) => m.codeRefs.includes(code))
            ? "mistakes[].codeRefs"
            : "default-ON detector",
          requires: rule.requires,
          worldHas: verdict.worldHas,
          fixIn: rule.fixIn,
          ledgerId: rule.ledgerId,
          routeSummary: `${f.routeEdgeIds.size} edge(s) on ${spec.map.districtId}`,
        });
      }
    }

    if (!first) continue;

    // -- the ledger census, counted ONCE per scenario ------------------------
    const w = first.world;

    // T1 — the lane-line pass never runs on this district (doc 86 §2 T1:
    // markings.ts:723 `if (!MARKED_CLASSES.has(eb.edge.class)) continue`).
    if (w.markedClassEdges.size === 0) {
      t1.add(spec.id);
      t1d.add(spec.map.districtId);
    }

    // T2 — the compiled spawn pose is already outside the lane-keep envelope.
    const s2 = checkS2(first);
    if (!s2.ok) {
      t2.add(spec.id);
      t2d.add(spec.map.districtId);
      s2Fail.push(`${spec.id} @L${first.level}: laneOffsetM ${s2.offsetM.toFixed(4)} > ${s2.maxM}`);
    }

    // T3 — doc 86's LITERAL criterion: the marker is authored at the junction
    // node coordinate (0, 0). Reproduced exactly so the document's own figure
    // is machine-checked; T3b below is the predicate that actually matters.
    for (const o of spec.success) {
      if (o.params.kind === "passSignal" && o.params.x === 0 && o.params.y === 0) t3 += 1;
    }
    // T3b / S1 — every marker that sits past the line the same lesson grades.
    const findings = checkS1(first);
    if (findings.length > 0) s1.set(spec.id, findings);
    t3b += findings.filter((x) => x.kind === "passSignal").length;

    // T4 — a route limit the built world cannot state, or a plate that lies
    // about the road it stands on. T4raw keeps the wave-0 proxy visible.
    const plates = plateTruth(first);
    if (plates.unstatable.length > 0 || plates.contradictions.length > 0) t4.add(spec.id);
    if ([...w.maxspeedByEdge.values()].some((v) => v !== 50)) t4raw.add(spec.id);

    // T8 / B4 — the invisible contract, and the evaluator that forgot it.
    const t8f = checkT8(first);
    t8 += t8f.invisible.length;
    t8raw += t8f.capped;
    if (t8f.capped > 0) {
      b4raw.add(spec.id);
      if (!reachZoneProbe.memory || !reachZoneProbe.voice) b4.add(spec.id);
    }

    // B1 / B3 — terminability.
    const s3 = checkS3(first);
    if (!s3.ok) {
      s3Fail.set(spec.id, s3.detail);
      if (s3.detail.startsWith("routeFinishZone = null")) {
        b1.add(spec.id);
        b1Cause.set(spec.id, finishNullCause(first.objectives));
      } else b3.add(spec.id);
    }

    // L10 — a graded lights duty the copy never states, on ANY rung: the
    // condition is usually authored on the L5 rung, not the entry one.
    if (rungFacts.some((r) => (r.night || r.rain || r.fog) && !r.lightsInstructed)) l10.add(spec.id);

    // L12 — the empty world (nothing staged on any rung).
    if (rungFacts.every((r) => r.staged.length === 0)) l12.add(spec.id);

    // L2 — a signal head below scenario scale on a route that grades lights.
    for (const nodeId of first.routeNodeIds) {
      const heads = w.lightsByNode.get(nodeId);
      if (heads && heads.some((h) => h.scale < SCENARIO_SIGN_SCALE)) l2.add(spec.id);
    }

    // T14 — a warning post that stands AT the hazard instead of before it.
    if (warningPostTooLate(first)) t14.add(spec.id);

    // L3 — a signalized crossing on a map where no pedestrian signal head can
    // exist. This is not a per-district accident: `TrafficLightPlacement` is
    // synthesised from ROAD NODES only (props.ts:221) and neither SignKind nor
    // the placement type has a pedestrian variant, so a `signalized: true`
    // crossing gets no lamp for cars OR pedestrians while the SignalController
    // still clusters it for phase purposes. Every signalized crossing in the
    // catalog is therefore an unlit one.
    if (w.district.crossings.some((c) => c.signalized)) l3.add(spec.id);

    const s4 = checkS4(spec);
    if (!s4.ok) s4Fail.set(spec.id, s4.detail);

    const s5 = checkS5(first);
    if (s5.length > 0) s5Fail.set(spec.id, s5);
  }

  const census = new Map<LedgerDefectId, number>([
    ["T1", t1.size],
    ["T2", t2.size],
    ["T3", t3],
    ["T3b", t3b],
    ["T4", t4.size],
    ["T4raw", t4raw.size],
    ["T6", 0],
    ["T8", t8],
    ["T8raw", t8raw],
    ["T13", 0],
    ["T14", t14.size],
    ["L2", l2.size],
    ["L3", l3.size],
    ["L10", l10.size],
    ["L12", l12.size],
    ["B1", b1.size],
    ["B3", b3.size],
    ["B4", b4.size],
    ["B4raw", b4raw.size],
    ["S1", [...s1.values()].reduce((n, v) => n + v.length, 0)],
    ["S2", s2Fail.length],
    ["S3", s3Fail.size],
    ["S4", s4Fail.size],
    ["S5", s5Fail.size],
  ]);

  // Doc 86's T1 headline counts DISTRICT FILES ("62 of 90"), not just the 87
  // a scenario points at, so the gate reproduces both.
  const files = fs
    .readdirSync(worldDir())
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
  let t1AllFiles = 0;
  for (const id of files) {
    if (!loadDistrict(id).roads.edges.some((e) => MARKED_CLASSES.has(e.class))) t1AllFiles += 1;
  }

  const checked = Object.keys(REFERENT_RULES).length;
  return {
    scenarios: SCENARIO_TEMPLATES.length,
    rungs,
    codesChecked: checked,
    codesExempt: NO_WORLD_REFERENT.size,
    violations,
    s1,
    s2Fail,
    s3Fail,
    s4Fail,
    s5Fail,
    census,
    t1Districts: t1d.size,
    t1DistrictsAllFiles: t1AllFiles,
    districtFiles: files.length,
    t2Districts: t2d.size,
    b1Cause,
    reachZoneProbe,
  };
}

/**
 * WHY `routeFinishZone` returned null. Doc 86 B1 counts only the first cause
 * ("terminal `completeManeuver` ≠ `parkInBay`", 10 scenarios); the other two
 * strand the student in exactly the same way and the ledger misses them.
 */
function finishNullCause(objectives: readonly ObjectiveParams[]): string {
  if (objectives.length < 2) return "single-objective route";
  const last = objectives[objectives.length - 1]!;
  if (last.kind === "completeManeuver" && last.maneuver !== "parkInBay") {
    return `terminal completeManeuver/${last.maneuver}`;
  }
  if (last.kind === "driveDistance") return "terminal driveDistance";
  if (last.kind === "completeManeuver") return `terminal completeManeuver/${last.maneuver}`;
  return "clamp collapsed the zone below FINISH_MIN_RADIUS_M";
}

/**
 * T14 — `zoneSigns.ts:129` posts `waterPatch` / `icePatch` / `curveAdvisory`
 * warnings at `zone.fromM` (the span START) while `railCrossing` correctly
 * uses RAIL_WARNING_AHEAD_M. A post standing at the hazard's first metre is
 * not a warning.
 */
const T14_ADVANCE_M = 40;
function warningPostTooLate(f: ScenarioFacts): boolean {
  const zones = (f.world.district.zones ?? []).filter(
    (z) => z.kind === "curveAdvisory" || z.kind === "waterPatch" || z.kind === "icePatch",
  );
  if (zones.length === 0) return false;
  const posts = f.world.signs.filter((s) => s.kind === "curve" || s.kind === "slippery");
  if (posts.length === 0) return false;
  for (const z of zones) {
    const rt = f.world.index.edgeRtById(z.edgeId);
    if (!rt) continue;
    let bestLead = -Infinity;
    for (const p of posts) {
      const hit = f.world.index.projectOnEdge(rt.idx, p.at.x, p.at.y, {
        edgeIdx: -1,
        distM: Infinity,
        sM: 0,
        latSignedM: 0,
        tanX: 0,
        tanY: 1,
        outsideM: Infinity,
      });
      if (hit.distM > 20) continue;
      bestLead = Math.max(bestLead, z.fromM - hit.sM);
    }
    if (Number.isFinite(bestLead) && bestLead < T14_ADVANCE_M) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// The report (doc 86 §10 "What it prints on failure")
// ---------------------------------------------------------------------------

export function formatBlock(v: CodeViolation, s1: readonly S1Finding[]): string {
  const lines = [
    `FAIL  ${v.scenarioId} @ L${v.level}${" ".repeat(Math.max(1, 26 - v.scenarioId.length))}CODE  ${v.code}`,
    `  declared by : ${v.declaredBy}`,
    `  requires    : ${v.requires}`,
    `  world has   : ${v.worldHas}`,
    `  route uses  : ${v.routeSummary}`,
  ];
  for (const s of s1) {
    lines.push(
      "  S1 GUIDANCE TRUTH violated:",
      `    objective ${s.objectiveIndex + 1} "${s.objectiveId}" marker = (${s.marker.x.toFixed(2)}, ${s.marker.y.toFixed(2)})`,
      `    graded stop line          = (${s.line.x.toFixed(2)}, ${s.line.y.toFixed(2)})`,
      `    marker is ${s.pastByM.toFixed(2)} m PAST the line, on the far side of the graded cut`,
    );
  }
  lines.push(`  fix in      : ${v.fixIn}`);
  return lines.join("\n");
}

export interface CensusLine {
  id: LedgerDefectId;
  unit: string;
  measured: number;
  ledger: number | null;
  ledgerNote?: string;
  precise: boolean;
  what: string;
  status: "MATCHES LEDGER" | "below ledger" | "ABOVE LEDGER" | "own measurement";
}

export function censusLines(result: GateResult): CensusLine[] {
  return LEDGER_BASELINE.map((row) => {
    const measured = result.census.get(row.id) ?? 0;
    let status: CensusLine["status"];
    if (row.ledger === null) status = "own measurement";
    else if (measured === row.ledger) status = "MATCHES LEDGER";
    else if (measured < row.ledger) status = "below ledger";
    else status = "ABOVE LEDGER";
    return {
      id: row.id,
      unit: row.unit,
      measured,
      ledger: row.ledger,
      ledgerNote: row.ledgerNote,
      precise: row.precise,
      what: row.what,
      status,
    };
  });
}

export const PERCEPTUAL_SCALE_NOTE = `lane pitch ${LANE_WIDTH_M} m (${PERCEPTUAL_ROAD_SCALE}x perceptual road scale)`;
