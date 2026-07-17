/**
 * Bridge-ice trace gate — „Мостът замръзва пръв" (sc-ac-bridge-ice on the NEW
 * ac-bridge-v1; doc 72 AC-08, the ANTICIPATION arm), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays on the DAY-DRY cold morning with ZERO violations and
 *      earns CLEAN_DRIVING — ~45 approach, eased to ~24 on the DRY asphalt
 *      BEFORE the near abutment, dead-straight crawl across the whole deck,
 *      throttle only past the far abutment.
 *   2. MISTAKE DEMOS grade their exact codes — NO new rule code: road speed
 *      onto the deck wanders the curb side past the 3 s sustain → EXACTLY
 *      POOR_LANE_KEEPING (a near-miss of the parapet, never a contact); the
 *      brake pressed ON the ice slides into the parapet → EXACTLY COLLISION.
 *   3. THE TWO ABSENCES ARE THE ARCHITECTURE, so they are asserted, not
 *      assumed (see the template header): SPEED_TOO_FAST_FOR_CONDITIONS can
 *      never fire — a clear dry morning arms no conditions envelope, and the
 *      invisible ice under a blue sky is the point; HARSH_BRAKING_NO_CAUSE can
 *      never fire — −7 m/s² is unreachable at 0.15 grip, which is precisely
 *      what „спирачка върху леда" teaches.
 *   4. DUAL-CHANNEL HONESTY (the 4a law, bridge edition): the recorder is
 *      kinematic, so the ice truth is AUTHORED — asserted here: the on-deck
 *      ramp derives from ICE_DECEL = SCRIPT_DECEL × ICE_PATCH_GRIP_FACTOR (the
 *      same 0.15 scaling the live car obeys on the span), the held brake still
 *      carries ~43 km/h into the wall, and both slide shapes are pinned against
 *      the lane-detector band and the parapet faces.
 *   5. COMMITTED FILES under content/traces/sc-ac-bridge-ice/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ac-bridge-ice-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG } from "../../rules";
import { CHASSIS_HALF_EXTENTS, ICE_PATCH_GRIP_FACTOR } from "../../vehicle";
import { SC_AC_BRIDGE_ICE } from "../../lessons/scenario/templates-conditions2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { SCRIPT_DECEL, type RecordedDrive } from "../recorder";
import {
  bridgeParapetObstacles,
  ICE_DECEL,
  recordScAcBridgeIceDrive,
  type ScAcBridgeIceTraceName,
} from "../scAcBridgeIce";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ac-bridge-ice";
const NAMES: ScAcBridgeIceTraceName[] = [
  "shadow-correct",
  "mistake-road-speed",
  "mistake-brake-on-deck",
];

/** Drawn lane center of the 1+1 street (half of the 8.125 m lane). */
const LANE_CENTER_X = 8.125 / 2;
/** The icePatch deck span of ac-bridge-v1 (battery-pinned against the file). */
const DECK_FROM = 250;
const DECK_TO = 340;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}
/**
 * Longest continuous stretch (s) the trace spends past `predicate` on x WHILE
 * MOVING — the exact shape of the POOR_LANE_KEEPING episode (engine.ts gates
 * the off-centre condition on `moving`, so a car parked off-line never
 * accumulates). Asserting the detector's own metric is what keeps the
 * brake-on-deck demo's margin honest.
 */
function longestMovingSustainSec(d: RecordedDrive, predicate: (x: number) => boolean): number {
  let best = 0;
  let startT: number | null = null;
  for (const s of d.trace.samples) {
    if (predicate(s.x) && Math.abs(s.speedKmh) > 0.5) {
      startT ??= s.tSec;
      best = Math.max(best, s.tSec - startT);
    } else {
      startT = null;
    }
  }
  return best;
}

const district = loadDistrict("ac-bridge-v1");
const drives = new Map<ScAcBridgeIceTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScAcBridgeIceDrive(district, n)]),
);

describe("sc-ac-bridge-ice — geometry pins against the committed map", () => {
  it("lane, spawn, length and the icePatch deck span match ac-bridge-v1", () => {
    const raw = district as {
      meta: { scenario: { laneCenterRightM: number; params: Record<string, number> } };
      spawnPoints: Array<{ id: string; x: number; y: number }>;
      zones: Array<{
        kind: string;
        fromM: number;
        toM: number;
        patchGripFactor?: number;
        aquaplaneAboveKmh?: number;
      }>;
    };
    expect(raw.meta.scenario.laneCenterRightM).toBe(4.06);
    expect(raw.meta.scenario.params.lengthM).toBe(520);
    expect(raw.meta.scenario.params.maxspeedKmh).toBe(50);
    expect(SC_AC_BRIDGE_ICE.map.params).toEqual(raw.meta.scenario.params);
    expect(SC_AC_BRIDGE_ICE.map.districtId).toBe("ac-bridge-v1");
    const spawn = raw.spawnPoints.find((s) => s.id === SC_AC_BRIDGE_ICE.start.spawnPointId)!;
    expect(spawn).toBeTruthy();
    expect(spawn.x).toBe(4.06);
    expect(spawn.y).toBe(15);
    // The span the scripts are authored against — the tuning constant is the
    // single documented truth; ice carries NO float gate (any speed bites).
    expect(raw.zones).toHaveLength(1);
    const z = raw.zones[0];
    expect(z.kind).toBe("icePatch");
    expect(z.fromM).toBe(DECK_FROM);
    expect(z.toM).toBe(DECK_TO);
    expect(z.patchGripFactor).toBe(ICE_PATCH_GRIP_FACTOR);
    expect(z.aquaplaneAboveKmh).toBeUndefined();
  });

  it("the objective gates straddle the abutments — the contract IS the anticipation", () => {
    // Gate 1 must be met on DRY asphalt (before 250) and gate 2 at the far
    // abutment (before 340): together they force the crawl across the whole
    // deck. If a future edit slides either gate onto the ice, the template
    // silently becomes „brake on the bridge" — the thing it teaches against.
    const before = SC_AC_BRIDGE_ICE.success.find((o) => o.id === "sc-acbi-before")!;
    const deck = SC_AC_BRIDGE_ICE.success.find((o) => o.id === "sc-acbi-deck")!;
    const past = SC_AC_BRIDGE_ICE.success.find((o) => o.id === "sc-acbi-past")!;
    const p = (o: typeof before) => o.params as { y: number; radiusM: number; maxSpeedKmh?: number };
    expect(p(before).y + p(before).radiusM).toBeLessThan(DECK_FROM); // wholly on dry tarmac
    expect(p(before).maxSpeedKmh).toBe(30);
    expect(p(deck).y + p(deck).radiusM).toBeLessThanOrEqual(DECK_TO); // still ON the deck
    expect(p(deck).maxSpeedKmh).toBe(30);
    expect(p(past).y - p(past).radiusM).toBeGreaterThan(DECK_TO); // wholly past it
    expect(p(past).maxSpeedKmh).toBeUndefined(); // the dry street: speed is correct again
  });

  it("dual-channel honesty: the on-deck envelope derives from the live tuning constant", () => {
    expect(ICE_DECEL).toBe(SCRIPT_DECEL * ICE_PATCH_GRIP_FACTOR);
    // The shadow's crawl is established BEFORE the span (dry tarmac) — and it
    // never touches the brake on the deck at all, because it never needs to.
    const shadow = drives.get("shadow-correct")!;
    const preDeck = shadow.trace.samples.filter((s) => s.y >= 225 && s.y < DECK_FROM);
    expect(preDeck.length).toBeGreaterThan(0);
    expect(Math.max(...preDeck.map((s) => Math.abs(s.speedKmh)))).toBeLessThan(27);
    expect(shadow.trace.samples.filter((s) => s.y >= DECK_FROM && s.y <= DECK_TO && s.brakeOn)).toHaveLength(0);
    // The brake-on-deck slide: the pedal IS held for the whole span — it just
    // does ~nothing. Over ~45 m the 0.69 m/s² envelope sheds ~8 km/h, where a
    // dry brake from 50 would have stopped the car in ~24 m.
    const slide = drives.get("mistake-brake-on-deck")!;
    const onDeckBraking = slide.trace.samples.filter((s) => s.y >= 255 && s.y <= DECK_TO && s.brakeOn);
    expect(onDeckBraking.length).toBeGreaterThan(0);
    const moving = slide.trace.samples.filter((s) => s.y >= 255 && s.y <= 300 && Math.abs(s.speedKmh) > 0.5);
    const shed = moving[0].speedKmh - moving[moving.length - 1].speedKmh;
    expect(shed).toBeGreaterThan(4);
    expect(shed).toBeLessThan(12); // a feeble plea, not a stop
    // …and it still arrives at the wall at ~43 km/h.
    const atWall = slide.trace.samples.filter((s) => s.x >= 8.3 && Math.abs(s.speedKmh) > 0.5);
    expect(atWall.length).toBeGreaterThan(0);
    expect(atWall[0].speedKmh).toBeGreaterThan(35);
  });

  it("slide shapes are pinned against the lane-detector band and the parapet faces", () => {
    const band = DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM;
    expect(band).toBe(3.25);
    const curbSideX = LANE_CENTER_X + band; // 7.3125
    const centerSideX = LANE_CENTER_X - band; // 0.8125
    // The east parapet's inner face — the wall both demos are measured against.
    const east = bridgeParapetObstacles().find((o) => o.x > 0)!;
    const faceX = east.x - east.halfWidthM;
    expect(faceX).toBeCloseTo(9.7, 3);
    // It runs exactly the length of the deck: on a bridge the wall is not an
    // obstacle you meet, it is the geometry you are inside of.
    expect(east.y - east.halfLengthM).toBe(DECK_FROM);
    expect(east.y + east.halfLengthM).toBe(DECK_TO);

    // Shadow: dead straight, never near the band, never near the wall.
    const shadowXs = drives.get("shadow-correct")!.trace.samples.map((s) => s.x);
    expect(Math.min(...shadowXs)).toBeGreaterThan(3.9);
    expect(Math.max(...shadowXs)).toBeLessThanOrEqual(4.07);

    // Road-speed demo: wanders the curb side past the 3 s sustain…
    const wander = drives.get("mistake-road-speed")!;
    expect(Math.max(...wander.trace.samples.map((s) => s.x))).toBeGreaterThan(curbSideX);
    expect(longestMovingSustainSec(wander, (x) => x > curbSideX)).toBeGreaterThan(
      DEFAULT_RULE_CONFIG.laneKeepSustainSec,
    );
    // …and misses the parapet: hero edge (half-width 0.85) stays clear of 9.7.
    expect(Math.max(...wander.trace.samples.map((s) => s.x)) + CHASSIS_HALF_EXTENTS.x).toBeLessThan(faceX);
    // Both demos stay EAST of the lane center, so CENTER_LINE_TOUCHED is not
    // merely absent from the codes — it is geometrically unreachable here.
    for (const name of ["mistake-road-speed", "mistake-brake-on-deck"] as const) {
      expect(Math.min(...drives.get(name)!.trace.samples.map((s) => s.x))).toBeGreaterThan(centerSideX);
    }
    // Brake-on-deck demo: reaches the wall, and is off-line and MOVING for far
    // less than the 3 s sustain — the parapet arrives before the paperwork.
    const slide = drives.get("mistake-brake-on-deck")!;
    expect(Math.max(...slide.trace.samples.map((s) => s.x)) + CHASSIS_HALF_EXTENTS.x).toBeGreaterThan(faceX);
    expect(longestMovingSustainSec(slide, (x) => x > curbSideX)).toBeLessThan(
      DEFAULT_RULE_CONFIG.laneKeepSustainSec,
    );
  });
});

describe("sc-ac-bridge-ice — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays on the dry cold morning with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("lifts off BEFORE the deck, crawls across it, and accelerates only past the far abutment", () => {
    const kmhIn = (y0: number, y1: number) => {
      const inz = shadow.trace.samples.filter((s) => s.y >= y0 && s.y <= y1);
      expect(inz.length, `no samples in [${y0}, ${y1}]`).toBeGreaterThan(0);
      return Math.max(...inz.map((s) => Math.abs(s.speedKmh)));
    };
    // The approach is ordinary — nothing to see yet (and nothing to grade).
    expect(kmhIn(60, 150)).toBeGreaterThan(40);
    // Gate 1 (y = 235 ± 10, cap 30) is passed at ~24: the decision was taken on
    // DRY asphalt, which is the only surface where a decision still works.
    expect(kmhIn(225, 245)).toBeLessThan(30);
    // THE WHOLE DECK at the crawl — including the far abutment (gate 2,
    // y = 335 ± 8, cap 30). No acceleration anywhere on the ice.
    expect(kmhIn(DECK_FROM, DECK_TO)).toBeLessThan(30);
    expect(kmhIn(327, 343)).toBeLessThan(30);
    // …and only THEN the throttle, on the dry far side.
    expect(kmhIn(400, 460)).toBeGreaterThan(40);
    // It crosses the bridge — it does not stop on it (the sc-ac-ice contrast).
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(DECK_TO + 120);
    expect(Math.abs(last.speedKmh)).toBeLessThan(1);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(5);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-ac-bridge-ice — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Мостът с пътна скорост“: exactly POOR_LANE_KEEPING — a near-miss, never a contact", () => {
    const drive = drives.get("mistake-road-speed")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_AC_BRIDGE_ICE.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("COLLISION"); // squeezes past the parapet by ~0.95 m
    expect(codes).not.toContain("CENTER_LINE_TOUCHED"); // the slide goes curb-side
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT"); // 50 = the posted limit
  });

  it("„Спирачка ВЪРХУ леда“: exactly COLLISION — with the wall a bridge always has", () => {
    const drive = drives.get("mistake-brake-on-deck")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_AC_BRIDGE_ICE.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("POOR_LANE_KEEPING"); // off-line for ~1 s, not 3
  });

  it("THE TWO ABSENCES: neither speed code nor harsh braking can fire on this map", () => {
    // These are not oversights — they are the template's architecture, and if a
    // future edit makes either reachable the drill has quietly changed meaning.
    // (1) A clear dry morning arms NO conditions envelope: the engine composes
    // conditionFactor from rain/fog/snow/night ONLY, all absent here. The
    // invisible ice under a blue sky is the doc-72 surprise — a weather tag
    // would delete it. So the map's own defaults are what the drives run on.
    expect(SC_AC_BRIDGE_ICE.conditions).toEqual({ weather: "dry" });
    expect(SC_AC_BRIDGE_ICE.ruleConfig).toBeUndefined();
    expect(SC_AC_BRIDGE_ICE.physics).toBeUndefined(); // base grip 1; ONLY the span bites
    // (2) HARSH_BRAKING_NO_CAUSE needs ≤ −7 m/s². The authored on-ice envelope
    // is 0.69 — a TENTH of it. „Спирачка върху леда" is physically incapable of
    // being harsh, and that incapacity IS what the demo teaches.
    expect(ICE_DECEL).toBeLessThan(DEFAULT_RULE_CONFIG.harshBrakeDecelMps2 / 5);
    for (const name of NAMES) {
      const codes = violationCodes(drives.get(name)!);
      expect(codes, name).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
      expect(codes, name).not.toContain("HARSH_BRAKING_NO_CAUSE");
    }
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", SCENARIO_ID);
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", SCENARIO_ID);

  for (const name of NAMES) {
    it(`${SCENARIO_ID}/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
      const serialized = serializeScenarioTrace(drives.get(name)!.trace) + "\n";
      const contentFile = path.join(contentDir, `${name}.trace.json`);
      const publicFile = path.join(publicDir, `${name}.trace.json`);
      if (RECORD) {
        mkdirSync(contentDir, { recursive: true });
        mkdirSync(publicDir, { recursive: true });
        writeFileSync(contentFile, serialized);
        writeFileSync(publicFile, serialized);
      }
      expect(existsSync(contentFile), `${contentFile} missing — run the RECORD_TRACES tool`).toBe(true);
      expect(existsSync(publicFile), `${publicFile} missing — run the RECORD_TRACES tool`).toBe(true);
      expect(readFileSync(contentFile, "utf-8")).toBe(serialized);
      expect(readFileSync(publicFile, "utf-8")).toBe(readFileSync(contentFile, "utf-8"));
      const parsed = parseScenarioTrace(JSON.parse(readFileSync(contentFile, "utf-8")));
      expect(parsed).not.toBeNull();
      expect(parsed!.meta.scenarioId).toBe(SCENARIO_ID);
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    const again = recordScAcBridgeIceDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_AC_BRIDGE_ICE.shadow, ...SC_AC_BRIDGE_ICE.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_AC_BRIDGE_ICE.shadow.path, ...SC_AC_BRIDGE_ICE.mistakes.map((m) => m.traceRef.path)]).toEqual(
      expected,
    );
  });
});
