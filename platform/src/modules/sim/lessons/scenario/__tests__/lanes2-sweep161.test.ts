/**
 * SWEEP 161 — the LANES2 rows the frame audit convicted, and the two directions
 * each repair has to hold.
 *
 * The sweep drove every template on a phone and on a desktop, twice each, and
 * photographed the result. Six rows came back BROKEN against
 * templates-lanes2.ts. Two of them are repairable from a template and are what
 * this file defends; the other four are answered in
 * `lanes2-sweep161-refutation.test.ts`, which measures them instead of
 * accepting them — three turn out to be the audit program's own 12 km/h,
 * stop-scheduled, NEVER-STEERING drive, and one (the night lamps) is refuted
 * off the audit's own frame.
 *
 *   §1 sc-ov-crest-curve — «There is no crest». The map is a 135 m / 90° bend
 *      on flat ground (gen_ov_crest.mjs; the frames show a flat horizon at both
 *      ends of the route), and two student-facing sentences still narrated a
 *      slope. The split this guard pins is deliberate and narrow: copy that
 *      describes THIS ROAD may not claim terrain the map has no geometry for;
 *      copy that states чл. 43 may — the law covers the crest and the blind
 *      bend in one breath and a student must carry it to both.
 *
 *   §2 sc-ov-night-gap / sc-ovn-wait — the patience tick that went to the
 *      driver who did not wait. Both directions are measured on the templates'
 *      OWN committed recordings, replayed through the production evaluator:
 *        · FAILS ON THE OLD BEHAVIOUR — the mistake demo that pulls out into
 *          the ~2.3 s window and is convicted of OVERTAKE_INSUFFICIENT_GAP
 *          completes the SHIPPED-BEFORE gate at every rung;
 *        · AND THE OPPOSITE DIRECTION — the shadow, and the OTHER mistake demo
 *          (whose fault is the beam and which genuinely does wait), still
 *          complete the gate as authored today, at every rung. A repair that
 *          only refused would be the same crime facing the other way.
 *      §2c then holds the title to what the evaluator can read, so the sentence
 *      cannot quietly grow the claim back once the geometry is honest.
 *
 *   §3 sc-ov-being-overtaken / sc-ovbo-hold — the alongside clause. The gate is
 *      untouched on purpose (its 75 km/h ceiling is real work and is measured
 *      here in both directions); only the sentence that claimed a coincidence
 *      no field carries was struck.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEvalState, parseObjectiveParams, stepObjective } from "../../objectives";
import type { ObjectiveParams } from "../../types";
import { makeTick } from "../../__tests__/fixtures";
import type { ScenarioTrace } from "@/modules/sim/traces/types";
import { compileScenario } from "../compile";
import {
  SC_LN_BOULEVARD_DISCIPLINE,
  SC_OV_BEING_OVERTAKEN,
  SC_OV_CREST_CURVE,
  SC_OV_NIGHT_GAP,
} from "../templates-lanes2";
import type { ScenarioLevel, ScenarioSpec } from "../types";

/** Replay a committed recording through the SHIPPED evaluator exactly as a
 *  session would: fresh eval state, one tick per sample, monotonic latch. */
function replay(params: ObjectiveParams, trace: ScenarioTrace): boolean {
  let state = createEvalState(params);
  let done = false;
  for (const s of trace.samples) {
    const r = stepObjective(
      params,
      state,
      makeTick({
        t: s.tSec,
        speedKmh: s.speedKmh,
        position: { x: s.x, y: s.y },
        headingDeg: s.headingDeg,
        gear: s.gear,
        indicator: s.indicator,
      }),
    );
    state = r.evalState;
    done = done || r.done;
  }
  return done;
}

function readTrace(path: string): ScenarioTrace {
  return JSON.parse(readFileSync(join(process.cwd(), "..", path), "utf8")) as ScenarioTrace;
}

function demoTrace(spec: ScenarioSpec, basename: string): ScenarioTrace {
  const demo = spec.mistakes.find((m) => m.traceRef.path.endsWith(`${basename}.trace.json`));
  expect(demo, `${spec.id} lost its ${basename} demo`).toBeDefined();
  return readTrace(demo!.traceRef.path);
}

/** The authored params of one success row, at one rung, through the ladder. */
function compiledParams(
  spec: ScenarioSpec,
  level: ScenarioLevel,
  objectiveId: string,
): ObjectiveParams {
  const obj = compileScenario(spec, level).objectives.find((o) => o.id === objectiveId);
  expect(obj, `${spec.id}/${objectiveId} missing at L${level}`).toBeDefined();
  return parseObjectiveParams(obj!);
}

// ---------------------------------------------------------------------------
// §1 sc-ov-crest-curve — the road may only be described as the map built it
// ---------------------------------------------------------------------------

/**
 * The terrain words. `склон` is the one the two struck sentences used; `наклон`
 * and `нагорнищ` are the near neighbours an author reaching for the same image
 * would try next. `било` and `изкачван` are deliberately NOT here: they are how
 * чл. 43 names its other case, and §1b proves the law's own frame still uses
 * them — a net that banned them everywhere would have to be turned off.
 */
const TERRAIN_WORDS = ["склон", "наклон", "нагорнищ"];

const hits = (text: string): string[] =>
  TERRAIN_WORDS.filter((w) => text.toLowerCase().includes(w));

describe("§1 sc-ov-crest-curve describes the road the generator actually built", () => {
  it("FAILS ON THE OLD BEHAVIOUR: the two struck sentences are caught by this net", () => {
    // The receipts. Without them the net is worth only the words it happens to
    // know, and both of these shipped for four waves under a header that
    // already forbade them.
    for (const was of [
      "Отдалеч се появява знак В24 „Забранено е изпреварването“, а след него знак А1 с табела 40 — напред пътят завива надясно и се скрива зад склона.",
      "Само че „чисто“ там значи единствено „не виждам“: зад склона на завоя пътят продължава, а по него идва кола.",
    ]) {
      expect(hits(was), was).toContain("склон");
    }
  });

  it("no student-facing sentence about THIS road claims terrain the map has none of", () => {
    // instructionsBg is what the student reads while looking at the road, and
    // whatWentWrongBg is what he reads while watching the replay of it. Those
    // are the two channels that describe a place rather than a rule.
    const roadCopy = [
      ...SC_OV_CREST_CURVE.instructionsBg.map((s) => s.textBg),
      ...SC_OV_CREST_CURVE.mistakes.map((m) => m.whatWentWrongBg),
    ];
    const offenders = roadCopy.filter((t) => hits(t).length > 0);
    expect(
      offenders,
      "ov-crest-v1 is a bend on flat ground (map.params carries radiusM/sweepDeg " +
        "and no elevation at all) — a sentence that points at it may not name a slope",
    ).toEqual([]);
  });

  it("AND THE OPPOSITE DIRECTION: the LAW's frame still names the crest", () => {
    // The repair must not have quietly turned чл. 43 into a bend-only rule. A
    // student who only ever hears „завой" will not recognise the хребет he
    // meets on a real road, and the ban is one sentence covering both.
    const lawFrame = [
      SC_OV_CREST_CURVE.titleBg,
      SC_OV_CREST_CURVE.objectiveBg,
      SC_OV_CREST_CURVE.teach.whenBg,
      SC_OV_CREST_CURVE.teach.whyBg,
    ].join(" ");
    expect(lawFrame).toContain("било");
    expect(lawFrame).toContain("изкачване");
  });

  it("and the map it describes is still the flat-bend one that forced the split", () => {
    const params = SC_OV_CREST_CURVE.map.params as Record<string, unknown>;
    expect(SC_OV_CREST_CURVE.map.districtId).toBe("ov-crest-v1");
    expect(params["radiusM"]).toBe(135);
    expect(params["sweepDeg"]).toBe(90);
    // No elevation key exists on the recipe — the day one does, this line is
    // where the ban above gets reconsidered rather than silently outgrown.
    expect(Object.keys(params).some((k) => /elev|grade|slope|crest/i.test(k))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §2 sc-ov-night-gap / sc-ovn-wait — the patience gate, both directions
// ---------------------------------------------------------------------------

/** The row exactly as it shipped before this repair. */
const SC_OVN_WAIT_AS_SHIPPED = {
  kind: "reachZone",
  x: 4.06,
  y: 150,
  radiusM: 4,
  maxSpeedKmh: 45,
} as const;

describe("§2 the night-gap patience gate no longer credits the drive that jumped", () => {
  const impatient = demoTrace(SC_OV_NIGHT_GAP, "mistake-far-headlights");
  const beams = demoTrace(SC_OV_NIGHT_GAP, "mistake-high-beams");
  const shadow = readTrace(SC_OV_NIGHT_GAP.shadow!.path);
  const rungs = SC_OV_NIGHT_GAP.levels.map((r) => r.level);

  it("the drive it must refuse is the one the template itself convicts", () => {
    // Not a drive picked to make the test pass: it is the demo whose card cites
    // the опасна code, i.e. the exact opposite of patience.
    const demo = SC_OV_NIGHT_GAP.mistakes.find((m) =>
      m.traceRef.path.endsWith("mistake-far-headlights.trace.json"),
    )!;
    expect(demo.codeRefs).toContain("OVERTAKE_INSUFFICIENT_GAP");
  });

  it("FAILS ON THE OLD BEHAVIOUR: the AS-SHIPPED mark credited it at every rung", () => {
    // The authored disc, widened by the same ladder the shipped row rides, so
    // this is the real old behaviour and not a paper version of it.
    for (const level of rungs) {
      const ladder = compiledParams(SC_OV_NIGHT_GAP, level, "sc-ovn-wait");
      expect(ladder.kind).toBe("reachZone");
      if (ladder.kind !== "reachZone") return;
      const old = { ...SC_OVN_WAIT_AS_SHIPPED, radiusM: (ladder.radiusM / 2.7) * 4 };
      expect(replay(old, impatient), `L${level} old mark`).toBe(true);
    }
    // …and it is not a near miss the ladder happened to reach: the demo's
    // closest sweep to the OLD mark is 1.68 m, well inside even the tightest
    // rung's 2.7 m.
    expect(minSweptDistance(impatient, 4.06, 150)).toBeCloseTo(1.68, 1);
  });

  it("the shipped mark refuses it at every rung — with the margin it was sized for", () => {
    for (const level of rungs) {
      const params = compiledParams(SC_OV_NIGHT_GAP, level, "sc-ovn-wait");
      expect(replay(params, impatient), `L${level}`).toBe(false);
    }
    // 6.56 m is the excursion's deepest point and the number y = 124 was chosen
    // from; the widest compiled disc is 4.05, so the refusal has 2.5 m of room
    // and does not depend on a sample landing anywhere in particular.
    expect(minSweptDistance(impatient, 4.06, 124)).toBeCloseTo(6.56, 1);
    const widest = Math.max(
      ...rungs.map((l) => {
        const p = compiledParams(SC_OV_NIGHT_GAP, l, "sc-ovn-wait");
        return p.kind === "reachZone" ? p.radiusM : 0;
      }),
    );
    expect(widest).toBeLessThanOrEqual(4.05);
  });

  it("AND THE OPPOSITE DIRECTION: the shadow and the beam demo still complete it", () => {
    // The beam demo is the control that matters most. Its fault is чл. 74 and
    // nothing else — it follows the lead in its own lane the whole way and DOES
    // wait out the headlights — so a gate that refused it would be teaching
    // that patience costs you the tick.
    for (const level of rungs) {
      const params = compiledParams(SC_OV_NIGHT_GAP, level, "sc-ovn-wait");
      expect(replay(params, shadow), `L${level} shadow`).toBe(true);
      expect(replay(params, beams), `L${level} high-beams`).toBe(true);
    }
  });

  it("§2c the title claims only what stepReachZone reads", () => {
    const title = SC_OV_NIGHT_GAP.success.find((o) => o.id === "sc-ovn-wait")!.titleBg;
    // The struck clause, by name: the evaluator has no clock and no actor, and
    // the world does not render the lamps the clause pointed at.
    expect(title).not.toContain("фаров");
    expect(title).not.toContain("докато");
    // What is left must be backed. The speed cap is read on every rung…
    for (const level of rungs) {
      const p = compiledParams(SC_OV_NIGHT_GAP, level, "sc-ovn-wait");
      expect(p.kind === "reachZone" && p.maxSpeedKmh !== undefined, `L${level} cap`).toBe(true);
    }
    // …and the lane claim is true only while the widest compiled disc stays
    // inside the 8.125 m pitch's half — the objective-title-truth §5 contract,
    // asserted here because this row is the one that just started making it.
    expect(title).toContain("своята лента");
    for (const level of rungs) {
      const p = compiledParams(SC_OV_NIGHT_GAP, level, "sc-ovn-wait");
      if (p.kind !== "reachZone") continue;
      expect(p.radiusM, `L${level} lane claim`).toBeLessThanOrEqual(8.125 / 2);
    }
  });
});

// ---------------------------------------------------------------------------
// §3 sc-ov-being-overtaken / sc-ovbo-hold — the clause, not the gate
// ---------------------------------------------------------------------------

describe("§3 the being-overtaken ceiling keeps its work and loses its coincidence", () => {
  const rungs = SC_OV_BEING_OVERTAKEN.levels.map((r) => r.level);
  const hold = SC_OV_BEING_OVERTAKEN.success.find((o) => o.id === "sc-ovbo-hold")!;

  it("the ceiling is real work: the throttler is refused, the shadow is not", () => {
    // Both directions on the templates' own tapes. If this ever flips, the
    // retitle below stops being a correction and becomes an amnesty.
    const shadow = readTrace(SC_OV_BEING_OVERTAKEN.shadow!.path);
    const throttler = demoTrace(SC_OV_BEING_OVERTAKEN, "mistake-accelerating");
    for (const level of rungs) {
      const params = compiledParams(SC_OV_BEING_OVERTAKEN, level, "sc-ovbo-hold");
      expect(replay(params, shadow), `L${level} shadow`).toBe(true);
      expect(replay(params, throttler), `L${level} throttler`).toBe(false);
    }
  });

  it("FAILS ON THE OLD BEHAVIOUR: the alongside clause is gone from the title", () => {
    expect(hold.titleBg).not.toContain("докато те изпреварват");
  });

  it("AND THE OPPOSITE DIRECTION: the ceiling is still stated where the student reads it", () => {
    // Ledger D4's whole point — a speed contract the student cannot see is a
    // trap. Striking the clause must not have taken the number with it.
    const cap = (hold.params as { maxSpeedKmh?: number }).maxSpeedKmh!;
    expect(hold.titleBg).toContain(String(cap));
    expect(
      SC_OV_BEING_OVERTAKEN.instructionsBg.map((s) => s.textBg).join(" "),
    ).toContain(String(cap));
  });
});

// ---------------------------------------------------------------------------
// §4 the causes this file could NOT repair, pinned so the write-up cannot rot
// ---------------------------------------------------------------------------

describe("§4 the sweep's remaining causes are still exactly where the comments say", () => {
  it("no staged actor carries a PER-ACTOR lamp state — the fleet lights them globally", () => {
    // NOT „the lamps are missing": they are not (the refutation file measures
    // 4074/4200 px of TAIL_ON on the lead's rear bar in the audit's own night
    // frame). TrafficLayer lights the whole fleet off ONE `night` prop, so what
    // no template can author is a single actor whose lamps differ from the rest
    // — the car driving with its lights OFF, which is its own drill. If a
    // lighting field ever lands on StagedActorPathSpec this assertion is the
    // tripwire that sends someone back to the header comment.
    const staged = SC_OV_NIGHT_GAP.staged ?? [];
    expect(staged.length).toBeGreaterThan(0);
    for (const ev of staged) {
      const actor = (ev as { actor?: Record<string, unknown> }).actor ?? {};
      expect(Object.keys(actor).some((k) => /light|lamp|beam/i.test(k))).toBe(false);
    }
  });

  it("the paced leads are still ceiling-only — the treadmill has no floor to author", () => {
    // maxMatchSpeedMps caps the lead at the player's speed and nothing floors
    // it, which is why a crawling student gets a crawling „20 km/h" crawler and
    // a standing truck. A minimum-pace field is the fix and does not exist yet.
    // What it costs is the drill's STORY, not its gates: none of the six rows
    // this file and the refutation file defend reads a staged actor, and the
    // refutation file drives all of them home at 30 % of the shadow's speed.
    for (const [spec, id] of [
      [SC_LN_BOULEVARD_DISCIPLINE, "sc-lnbd-crawler"],
      [SC_OV_CREST_CURVE, "sc-ovcc-lead"],
    ] as const) {
      const lead = (spec.staged ?? []).find((s) => s.id === id) as
        | Record<string, unknown>
        | undefined;
      expect(lead, `${spec.id}/${id}`).toBeDefined();
      expect(lead!["maxMatchSpeedMps"]).toBeTypeOf("number");
      expect(lead!["paceMode"]).toBeUndefined(); // still the matchPlayer rubber band
      expect(
        Object.keys(lead!).some((k) => /minMatch|minPace|floor/i.test(k)),
        `${spec.id}/${id} gained a pace floor — re-read the sweep-161 note on it`,
      ).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Closest approach of a recording to a mark, SWEPT along each segment — the
 *  same reading `stepReachZone` takes, so the metres quoted above are the
 *  metres the evaluator sees and not a per-sample undercount. */
function minSweptDistance(trace: ScenarioTrace, x: number, y: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < trace.samples.length; i += 1) {
    const a = trace.samples[i - 1];
    const b = trace.samples[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = dx * dx + dy * dy;
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len));
    best = Math.min(best, Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)));
  }
  return best;
}
