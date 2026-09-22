/**
 * `window.__roadProbe` — THE PROBE HANDS OVER THE TICK, AND NOTHING ELSE.
 *
 * W59 steering spec §2.3 / increment 1, founder RULING-2 (2026-09-22). The
 * probe exists so the audit harness can read the product's OWN road fields
 * live; every property below is one a probe has to have to be a referent
 * rather than a second opinion:
 *
 *   · the road record carries the tick's OWN values — asserted against the
 *     tick object field by field, never re-derived;
 *   · it is a COPY — mutating the tick (or the step) afterwards changes no
 *     stored record, because a record holding a reference would publish a
 *     later tick's values under an earlier `seq`;
 *   · ABSENCE PASSES THROUGH — `opposingBank` absent stays absent (it is three
 *     situations, spec §2.2), `edgeId: null` stays null;
 *   · `NODE_ENV=production` publishes nothing;
 *   · `probe.road` carries no field of `probe.step` beyond the join keys — so
 *     „the controller reads road and route, never step" is structural (§2.4);
 *   · the rings are BOUNDED at `ROAD_PROBE_RING`, oldest first out, with `seq`
 *     monotonic so a reader that fell behind sees the gap;
 *   · it never feeds back — recording from DEEP-FROZEN inputs does not throw;
 *   · and it is WIRED: the two product call sites are pinned, and a pin that
 *     cannot find its anchor fails rather than passing blind.
 *
 * The step is a REAL `LessonStepResult` from the real `applyTick`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ROAD_PROBE_RING,
  createRoadProbe,
  publishRoadProbeRoute,
  publishRoadProbeTick,
  recordRoadProbeRoute,
  recordRoadProbeTick,
  roadRecordOf,
  type RoadProbeHost,
  type RoadProbeRouteSource,
} from "..";
import { applyTick, createLessonSession, type LessonStepResult } from "../../lessons/engine";
import type { LessonSpec } from "../../contracts";
import type { SimTick } from "../../rules";

const lesson: LessonSpec = {
  id: "t-road-probe",
  order: 99,
  titleBg: "Тест",
  descriptionBg: "тест",
  conceptIds: [],
  spawn: { position: { x: 0, y: 0 }, headingDeg: 90 },
  preDrive: false,
  objectives: [
    { id: "o-dist", titleBg: "Измини 1 метър", kind: "driveDistance", params: { meters: 1 } },
    { id: "o-zone", titleBg: "Стигни зоната", kind: "reachZone", params: { x: 9999, y: 9999, radiusM: 5 } },
  ],
};

/** The §2.1 / §3.2 road fields — the ONLY members a road record may have. */
const ROAD_FIELDS = [
  "seq",
  "wallMs",
  "t",
  "position",
  "headingDeg",
  "speedKmh",
  "laneOffsetM",
  "laneId",
  "laneCount",
  "edgeId",
  "opposingBank",
  "oneway",
  "wrongWay",
  "sM",
  "distM",
  "centreLinePainted",
  "laneLinesPainted",
  "worldEdgeClearanceM",
  "gear",
].sort();

/** The same fields, minus the probe's own join keys: what must equal the tick. */
const FROM_TICK = ROAD_FIELDS.filter((k) => k !== "seq" && k !== "wallMs");

/** A tick with EVERY road field present, each at a distinctive value (so a
 *  record that swapped two fields or defaulted one cannot match by accident),
 *  plus grading-only fields the record must NOT copy. */
function fullTick(t: number): SimTick {
  return {
    t,
    speedKmh: 27.5,
    maxSpeedKmh: 50,
    position: { x: 10 + t, y: -3.25 },
    headingDeg: 181.5,
    // NEGATIVE on purpose: a record that took |laneOffsetM| survived a
    // positive fixture (mutation P8).
    laneOffsetM: -1.125,
    laneId: 1,
    laneCount: 2,
    edgeId: "e672186635.0",
    opposingBank: true,
    oneway: false,
    wrongWay: false,
    sM: 73.625,
    distM: 2.875,
    centreLinePainted: false,
    laneLinesPainted: false,
    worldEdgeClearanceM: 412.5,
    gear: 2,
    indicator: "left",
    headlights: "low",
    seatbeltOn: true,
    handbrakeOn: false,
    isNight: false,
    events: [],
  };
}

/** A tick with NO optional road field at all (a source with no district). */
function bareTick(t: number): SimTick {
  return {
    t,
    speedKmh: 10,
    maxSpeedKmh: 50,
    position: { x: t, y: 0 },
    headingDeg: 90,
    laneOffsetM: 0,
    laneId: 0,
    gear: 1,
    indicator: "off",
    headlights: "off",
    seatbeltOn: true,
    handbrakeOn: false,
    isNight: false,
    events: [],
  };
}

/** Real steps from the real lesson engine; the second completes o-dist, so
 *  its `hudEvents` is non-empty. */
function steps(ticks: readonly SimTick[]): LessonStepResult[] {
  let s = createLessonSession(lesson);
  return ticks.map((t) => {
    const r = applyTick(s, t);
    s = r.state;
    return r;
  });
}

function deepFreeze<T>(o: T): T {
  if (o !== null && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("probe.road — the tick's own values", () => {
  it("carries every road field, each equal to the TICK's own member", () => {
    const tick = fullTick(4);
    const rec = roadRecordOf(tick, 7, 1234.5);
    expect(Object.keys(rec).sort()).toEqual(ROAD_FIELDS);
    const t = tick as unknown as Record<string, unknown>;
    const r = rec as unknown as Record<string, unknown>;
    for (const k of FROM_TICK) expect({ [k]: r[k] }).toEqual({ [k]: t[k] });
    expect(rec.seq).toBe(7);
    expect(rec.wallMs).toBe(1234.5);
  });

  it("copies no grading-only field off the tick (maxSpeedKmh, indicator, events …)", () => {
    const rec = roadRecordOf(fullTick(4), 1, 0) as unknown as Record<string, unknown>;
    for (const k of ["maxSpeedKmh", "indicator", "headlights", "events", "edgeAlignment", "isNight"]) {
      expect(k in rec, k).toBe(false);
    }
  });

  it("ABSENCE PASSES THROUGH: no optional field is invented, and null stays null", () => {
    const rec = roadRecordOf(bareTick(1), 1, 0) as unknown as Record<string, unknown>;
    for (const k of [
      "laneCount",
      "edgeId",
      "opposingBank",
      "oneway",
      "wrongWay",
      "sM",
      "distM",
      "centreLinePainted",
      "laneLinesPainted",
      "worldEdgeClearanceM",
    ]) {
      expect(k in rec, k).toBe(false);
    }
    const offRoad = roadRecordOf({ ...bareTick(2), edgeId: null }, 2, 0);
    expect(offRoad.edgeId).toBeNull();
    expect("opposingBank" in offRoad).toBe(false);
  });

  it("a REAL ZERO is carried, not dropped: 0 and false are values, only undefined is absent", () => {
    // sM === 0 is the edge's first vertex (and where the locator clamps a car
    // behind it); worldEdgeClearanceM === 0 is a car AT the world's rim. A
    // truthiness gate (`if (tick.sM)`) would publish both as UNKNOWN —
    // mutations P5 and P21 did exactly that and survived a fixture of non-zero
    // values.
    const tick: SimTick = {
      ...fullTick(3),
      sM: 0,
      distM: 0,
      worldEdgeClearanceM: 0,
      laneCount: 0,
      opposingBank: false,
      oneway: false,
      wrongWay: false,
      centreLinePainted: false,
      laneLinesPainted: false,
    };
    const rec = roadRecordOf(tick, 1, 0) as unknown as Record<string, unknown>;
    expect(Object.keys(rec).sort()).toEqual(ROAD_FIELDS);
    expect({
      sM: rec.sM,
      distM: rec.distM,
      worldEdgeClearanceM: rec.worldEdgeClearanceM,
      laneCount: rec.laneCount,
      opposingBank: rec.opposingBank,
      oneway: rec.oneway,
      wrongWay: rec.wrongWay,
      centreLinePainted: rec.centreLinePainted,
      laneLinesPainted: rec.laneLinesPainted,
    }).toEqual({
      sM: 0,
      distM: 0,
      worldEdgeClearanceM: 0,
      laneCount: 0,
      opposingBank: false,
      oneway: false,
      wrongWay: false,
      centreLinePainted: false,
      laneLinesPainted: false,
    });
  });

  it("is a COPY: mutating the tick afterwards changes no stored record", () => {
    const probe = createRoadProbe();
    const tick = fullTick(1);
    const [step] = steps([tick]);
    recordRoadProbeTick(probe, tick, step, 0);
    const before = structuredClone(probe.road[0]);
    tick.position.x = -999;
    tick.laneOffsetM = -999;
    tick.sM = -999;
    tick.opposingBank = undefined;
    expect(probe.road[0]).toEqual(before);
  });
});

describe("probe.step — the grader's output, separate and copied", () => {
  it("probe.road shares ONLY the join keys with probe.step", () => {
    const probe = createRoadProbe();
    const ticks = [fullTick(0.1), { ...fullTick(0.2), position: { x: 20, y: -3.25 } }];
    const ss = steps(ticks);
    ticks.forEach((t, i) => recordRoadProbeTick(probe, t, ss[i], i));
    expect(probe.step[1].hudEvents.length).toBeGreaterThan(0); // the material is real
    const roadKeys = new Set(probe.road.flatMap((r) => Object.keys(r)));
    const stepKeys = new Set(probe.step.flatMap((r) => Object.keys(r)));
    expect([...roadKeys].filter((k) => stepKeys.has(k)).sort()).toEqual(["seq", "wallMs"]);
    expect(probe.road.map((r) => r.seq)).toEqual(probe.step.map((r) => r.seq));
  });

  it("is a COPY: mutating the step afterwards changes no stored record", () => {
    const probe = createRoadProbe();
    const ticks = [fullTick(0.1), { ...fullTick(0.2), position: { x: 20, y: -3.25 } }];
    const ss = steps(ticks);
    ticks.forEach((t, i) => recordRoadProbeTick(probe, t, ss[i], i));
    const before = structuredClone(probe.step[1]);
    (ss[1].hudEvents[0] as { kind: string }).kind = "tampered";
    ss[1].state.objectives[0].progress = 42;
    expect(probe.step[1]).toEqual(before);
  });

  /** Real steps off the real engine that CARRY `teachMoments` and a THEO-3
   *  `mistakeMoment`: the belt off at 27.5 км/ч for 3 s books
   *  SEATBELT_OFF_WHILE_MOVING, which a graded session teaches and a
   *  mistakeExperience session turns into its consequence moment. */
  function beltOffSteps(spec: LessonSpec): LessonStepResult[] {
    const ticks = Array.from({ length: 60 }, (_, i) => ({
      ...fullTick(0.05 * (i + 1)),
      position: { x: 10 + i * 0.4, y: -3.25 },
      seatbeltOn: false,
    }));
    let s = createLessonSession(spec);
    return ticks.map((t) => {
      const r = applyTick(s, t);
      s = r.state;
      return r;
    });
  }

  it("is a COPY for teachMoments too: tampering with the step's teach moment changes no stored record", () => {
    const ss = beltOffSteps(lesson);
    const k = ss.findIndex((r) => (r.teachMoments?.length ?? 0) > 0);
    expect(k, "the material must carry a real teach moment").toBeGreaterThanOrEqual(0);
    const probe = createRoadProbe();
    recordRoadProbeTick(probe, fullTick(1), ss[k], 0);
    const before = structuredClone(probe.step[0]);
    expect(before.teachMoments?.length).toBeGreaterThan(0);
    (ss[k].teachMoments![0] as { titleBg: string }).titleBg = "tampered";
    ss[k].teachMoments!.push(ss[k].teachMoments![0]);
    expect(probe.step[0]).toEqual(before);
  });

  it("is a COPY for mistakeMoment too: tampering with the step's consequence moment changes no stored record", () => {
    const ss = beltOffSteps({
      ...lesson,
      id: "t-road-probe-mistake",
      mistakeExperience: { mistakeIndex: 0, codes: ["SEATBELT_OFF_WHILE_MOVING"] },
    });
    const k = ss.findIndex((r) => r.mistakeMoment !== undefined);
    expect(k, "the material must carry a real mistakeMoment").toBeGreaterThanOrEqual(0);
    const probe = createRoadProbe();
    recordRoadProbeTick(probe, fullTick(1), ss[k], 0);
    const before = structuredClone(probe.step[0]);
    expect(before.mistakeMoment).toBeDefined();
    (ss[k].mistakeMoment as { titleBg: string }).titleBg = "tampered";
    (ss[k].mistakeMoment as { points: number }).points = -1;
    expect(probe.step[0]).toEqual(before);
  });
});

describe("the probe never feeds back", () => {
  it("records from DEEP-FROZEN tick and step without writing to either", () => {
    const probe = createRoadProbe();
    const tick = fullTick(1);
    const [step] = steps([tick]);
    deepFreeze(tick);
    deepFreeze(step);
    expect(() => recordRoadProbeTick(probe, tick, step, 0)).not.toThrow();
    expect(probe.road).toHaveLength(1);
  });
});

describe("the rings are bounded", () => {
  it(`keeps the newest ${ROAD_PROBE_RING} of each, oldest out first, seq monotonic`, () => {
    const probe = createRoadProbe();
    const tick = bareTick(1);
    const [step] = steps([tick]);
    const extra = 37;
    for (let i = 0; i < ROAD_PROBE_RING + extra; i++) recordRoadProbeTick(probe, tick, step, i);
    expect(probe.road).toHaveLength(ROAD_PROBE_RING);
    expect(probe.step).toHaveLength(ROAD_PROBE_RING);
    expect(probe.road[0].seq).toBe(extra + 1);
    expect(probe.road[ROAD_PROBE_RING - 1].seq).toBe(ROAD_PROBE_RING + extra);
    expect(probe.step[0].seq).toBe(extra + 1);
    expect(probe.seq).toBe(ROAD_PROBE_RING + extra);
  });
});

describe("probe.route — the product's own route, copied once per derivation", () => {
  function route(): RoadProbeRouteSource {
    return {
      pts: new Float32Array([0, 0, 0, 2.5, 0, 5]),
      arc: new Float32Array([0, 2.5, 5]),
      count: 3,
      totalLen: 5,
      goalS: 5,
      turns: [{ s: 2.5, x: 0, y: 2.5, side: "left", dirX: -1, dirY: 0 }],
    };
  }

  it("publishes the route's own values as plain arrays, and a later edit of the source changes nothing", () => {
    const probe = createRoadProbe();
    recordRoadProbeTick(probe, bareTick(1), steps([bareTick(1)])[0], 0);
    const src = route();
    recordRoadProbeRoute(probe, src, 9);
    expect(probe.route).toEqual({
      derivation: 1,
      afterSeq: 1,
      wallMs: 9,
      pts: [0, 0, 0, 2.5, 0, 5],
      arc: [0, 2.5, 5],
      count: 3,
      totalLen: 5,
      goalS: 5,
      turns: [{ s: 2.5, x: 0, y: 2.5, side: "left", dirX: -1, dirY: 0 }],
    });
    (src.pts as Float32Array)[0] = 99;
    (src.turns[0] as { s: number }).s = 99;
    expect(probe.route!.pts[0]).toBe(0);
    expect(probe.route!.turns[0].s).toBe(2.5);
  });

  it("a derivation that returned no route publishes null, and the counter still moves", () => {
    const probe = createRoadProbe();
    recordRoadProbeRoute(probe, route(), 0);
    recordRoadProbeRoute(probe, null, 1);
    expect(probe.route).toBeNull();
    recordRoadProbeRoute(probe, route(), 2);
    expect(probe.route!.derivation).toBe(3);
  });
});

describe("production publishes nothing", () => {
  it("NODE_ENV=production: neither tap creates the probe", () => {
    vi.stubEnv("NODE_ENV", "production");
    const host: RoadProbeHost = {};
    publishRoadProbeTick(host, fullTick(1), steps([fullTick(1)])[0]);
    publishRoadProbeRoute(host, null);
    expect(host.__roadProbe).toBeUndefined();
  });

  it("…and outside production both taps do publish (so the gate above is not vacuous)", () => {
    vi.stubEnv("NODE_ENV", "development");
    const host: RoadProbeHost = {};
    publishRoadProbeTick(host, fullTick(1), steps([fullTick(1)])[0]);
    expect(host.__roadProbe?.road).toHaveLength(1);
    publishRoadProbeRoute(host, null);
    expect(host.__roadProbe?.routeDerivations).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// wiring — a probe no product code writes is a dead predicate
// ---------------------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
const componentsSim = path.resolve(here, "../../../../components/sim");

function sourceOf(rel: string): string {
  return readFileSync(path.join(componentsSim, rel), "utf-8").replace(/\r\n/g, "\n");
}

/**
 * The source with every comment REMOVED — so a publish that has been commented
 * out cannot satisfy a pin by the text it left behind (mutation C2 did exactly
 * that against the first cut of this block). A left-to-right scanner that knows
 * the three string forms, so a `//` inside a string is not taken for a comment
 * and a quote inside a comment is not taken for a string. Regex literals are
 * not modelled; the pins below therefore also require code anchors that sit
 * far from the publish to SURVIVE stripping, so a scanner that went wrong eats
 * them and fails the pin instead of passing it blind.
 */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && n === "*") {
      const close = src.indexOf("*/", i + 2);
      i = close < 0 ? src.length : close + 2;
      out += " ";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === "\\" ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** The comment-free source of a product file, with the anchors it must still
 *  carry checked first — a pin that cannot read its file fails. */
function codeOf(rel: string, mustSurvive: readonly string[]): string {
  const code = stripComments(sourceOf(rel));
  for (const a of mustSurvive) {
    expect(code.includes(a), `anchor «${a}» not in the comment-stripped ${rel} — the pin cannot read it`).toBe(true);
  }
  return code;
}

function count(hay: string, needle: string): number {
  return hay.split(needle).length - 1;
}

describe("stripComments — the pins' reader is itself tested", () => {
  it("removes both comment forms, keeps strings that look like comments, keeps code", () => {
    const src = [
      'const a = "// not a comment"; // gone',
      "const b = '/* nor this */'; /* gone",
      "   still gone */ const c = `// ${a}`;",
      "// publishRoadProbeRoute(window as unknown as RoadProbeHost, route);",
      "/*",
      '  if (process.env.NODE_ENV !== "production") { publish(); }',
      "*/",
      "done();",
    ].join("\n");
    const code = stripComments(src);
    expect(code).toContain('const a = "// not a comment";');
    expect(code).toContain("const b = '/* nor this */';");
    expect(code).toContain("const c = `// ${a}`;");
    expect(code).toContain("done();");
    expect(code).not.toContain("gone");
    expect(code).not.toContain("publishRoadProbeRoute");
    expect(code).not.toContain("NODE_ENV");
  });
});

/** The gated publish as the statement IMMEDIATELY after its anchor — only
 *  whitespace between them, nothing inside the braces but the call, and no
 *  `else` hanging off the gate. */
const GATED_TICK =
  /onDevTelemetry\?\.\(tick, step\);\s*if \(process\.env\.NODE_ENV !== "production"\) \{\s*publishRoadProbeTick\(window as unknown as RoadProbeHost, tick, step\);\s*\}\s*(?!else\b)/;
const GATED_ROUTE =
  /const route = deriveGuidanceRoute\(graph, start, goal, \{ lookahead \}\);\s*routeRef\.current = route;\s*if \(process\.env\.NODE_ENV !== "production"\) \{\s*publishRoadProbeRoute\(window as unknown as RoadProbeHost, route\);\s*\}\s*(?!else\b)/;

describe("the probe is wired where the spec says", () => {
  it("LessonPlayShell publishes the tick as the statement IMMEDIATELY after onDevTelemetry, dev-gated", () => {
    const code = codeOf("lesson-ui/LessonPlayShell.tsx", [
      "export function LessonPlayShell(",
      "onDevTelemetry?.(tick, step);",
      'from "@/modules/sim/devrig";',
    ]);
    // Comment-free and adjacent: an inserted branch, a return, or a
    // commented-out publish all fail here.
    expect(code).toMatch(GATED_TICK);
    expect(count(code, "onDevTelemetry?.(tick, step);")).toBe(1);
    expect(count(code, "publishRoadProbeTick(")).toBe(1);
    // Nobody else in the file touches the probe object — no `delete`, no
    // reassignment, no second writer; any of those has to name it.
    expect(code).not.toContain("__roadProbe");
  });

  it("RouteGuidance publishes each derivation as the statement IMMEDIATELY after storing it, dev-gated", () => {
    const code = codeOf("RouteGuidance.tsx", [
      "export function RouteGuidance(",
      "const route = deriveGuidanceRoute(graph, start, goal, { lookahead });",
      "routeRef.current = route;",
      'from "@/modules/sim/devrig";',
    ]);
    // Derive → store → publish, adjacent, comment-free: a commented-out
    // publish (C2), a branch inserted before it such as `if (goal === goal)
    // {} else` (C3), or an `else` after it all fail this.
    expect(code).toMatch(GATED_ROUTE);
    expect(count(code, "routeRef.current = route;")).toBe(1);
    expect(count(code, "publishRoadProbeRoute(")).toBe(1);
    // …and nothing later in the file undoes it: `delete window.__roadProbe`
    // or any reassignment has to name the property (C4).
    expect(code).not.toContain("__roadProbe");
  });
});
