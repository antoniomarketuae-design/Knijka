/**
 * TITLE TRUTH — the reachZone gates of the LANES / LANES2 / LANES3 /
 * FOLLOWING2 / RAIL2 families (doc 86 D3: „objective titles promise acts the
 * gates do not measure").
 *
 * cdb2f71 fixed the give-way family and the stop family and left a census
 * behind: 29 reachZone titles across the catalogue promise SPACING, three of
 * them gated, twenty-five CAP-ONLY, one carrying nothing at all. SIX of those
 * rows live in these five files (sc-ovr-finish, sc-lndc-merged, sc-fbc-read,
 * sc-fbc-stop, sc-fmg-gap, sc-fmg-stop), and TWO more of the give-way class it
 * fixed survived here because its drift net reads SCENARIO_TEMPLATES_RAIL and
 * these templates live in RAIL2 (sc-rts-clear, sc-rxq-cross). All eight have
 * now been either made TRUE (where a readable field proves the claim) or made
 * HONEST (where none can).
 *
 * WHY „HONEST" AND NOT „GATED" FOR THE FOLLOWING ROWS. `stepReachZone(params,
 * prev, tick)` gets no ObjectiveContext and never consults a gap — not even
 * `SimTick.leadGapM`, which the tick does carry. §3 below proves that by
 * measurement rather than by reading the source. A `minLeadGapM`/
 * `minLeadGapSec` parameter was built for exactly this family and dropped after
 * two adversarial passes (cdb2f71's own message): a flat metre floor sat ABOVE
 * this product's taught two-second rule, and the latch is any-frame, so one
 * qualifying frame in 168 certified a whole tailgating pass. A false refusal
 * teaches as hard as a false certificate. Grading a following distance needs a
 * DURATION semantic, not a parameter, and gets its own change — so until then
 * the sanctioned answer is the retitle, and this file is what keeps it from
 * quietly growing back.
 *
 * FIVE GUARDS, in the order they would catch a regression:
 *
 *   §1 the vocabulary, WITH ITS RECEIPTS — every title this change removed is
 *      replayed through the marker set and shown to be caught. A drift net is
 *      worth exactly the words it knows; the previous one used /дистанц/ alone
 *      and walked straight past «на разумно разстояние».
 *   §2 the CLASS guard: no authored (and no compiled, at every rung) reachZone
 *      row of these families may use spacing / contact / duty vocabulary,
 *      because nothing the evaluator reads can back it — and a speed cap
 *      explicitly does NOT count, which is the whole of the 25 cap-only rows.
 *   §3 the proof that the gate is gap-blind: a tick carrying 0.2 m of bumper
 *      still completes it.
 *   §4 the proof on the templates' OWN counter-demos: each row's ❌ recording
 *      replayed through the production evaluator, the gate shown completing
 *      anyway (or, where the radius now excludes it, shown completing under the
 *      OLD radius and refused under the shipped one), the offence shown still
 *      cited, and only then the title asserted silent about the claim.
 *   §5 the LANE claim: a title that names the lane the car must be in is only
 *      true while the COMPILED disc stays inside half the 8.125 m lane pitch —
 *      the ladder widens the place, so this has to be asserted per rung, not on
 *      the authored number. Twenty-five rows of these families fail it today
 *      and are held in a shrink-only backlog so a twenty-sixth cannot appear.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ScenarioTrace } from "../../traces/types";
import { createEvalState, parseObjectiveParams, stepObjective } from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES_FOLLOWING2 } from "../scenario/templates-following2";
import { SCENARIO_TEMPLATES_LANES } from "../scenario/templates-lanes";
import { SCENARIO_TEMPLATES_LANES2 } from "../scenario/templates-lanes2";
import { SCENARIO_TEMPLATES_LANES3 } from "../scenario/templates-lanes3";
import { SCENARIO_TEMPLATES_RAIL2 } from "../scenario/templates-rail2";
import type { ScenarioSpec } from "../scenario/types";
import type { ObjectiveParams, ReachZoneParams } from "../types";
import { makeTick } from "./fixtures";

const FAMILY: readonly ScenarioSpec[] = [
  ...SCENARIO_TEMPLATES_LANES,
  ...SCENARIO_TEMPLATES_LANES2,
  ...SCENARIO_TEMPLATES_LANES3,
  ...SCENARIO_TEMPLATES_FOLLOWING2,
  ...SCENARIO_TEMPLATES_RAIL2,
];

// ---------------------------------------------------------------------------
// §1 THE VOCABULARY — and what backing, if any, can redeem each tier
// ---------------------------------------------------------------------------

/**
 * SPACING AND CONTACT. A distance between two bodies, in any of the words this
 * catalogue actually uses for one. NOTHING on a SimTick reaches
 * `stepReachZone` that can measure one (§3), so these words are banned outright
 * — and in particular a `maxSpeedKmh` does NOT redeem them. That distinction is
 * the entire census: twenty-five of the twenty-nine offending rows carried a
 * speed cap and were read as „constrained" by the previous guard, whose
 * `provable()` accepted any cap for any claim.
 *
 * Substrings, deliberately — JS `\b` is ASCII-only and misfires on Cyrillic.
 * Two near-collisions in these families are worth naming, because both would
 * have made this net useless in the reassuring direction:
 *   - «плътно» is the adverb („bumper to bumper"); «плътната линия» is the
 *     SOLID CENTRE LINE and is honest. The two share no substring in these
 *     forms, so the adverb is safe to match and the stem «плътн» is not.
 *   - «удари» (hit) is matched, and no honest success title in these families
 *     contains it — the collisions live in `mistakes[].titleBg`, which this
 *     guard does not scan.
 */
const SPACING_CLAIMS: ReadonlyArray<{ marker: string; claimBg: string }> = [
  { marker: "дистанц", claimBg: "дистанция до друга кола" },
  { marker: "разстоян", claimBg: "разстояние до друга кола" },
  { marker: "пролук", claimBg: "избрана пролука" },
  { marker: "интервал", claimBg: "интервал до друга кола" },
  { marker: "отстоян", claimBg: "отстояние до друга кола" },
  { marker: "залеп", claimBg: "залепване за предния" },
  { marker: "плътно", claimBg: "плътно каране зад предния" },
  { marker: "броня", claimBg: "разстояние до бронята отпред" },
  { marker: "удари", claimBg: "разминаване без удар" },
  { marker: "сблъс", claimBg: "разминаване без сблъсък" },
];

/**
 * DUTY toward another road user, and the state of the road ahead of him —
 * whether somebody was let through, whether the far side had cleared BEFORE he
 * rolled. A SimTick carries no other actor's priority, no crossing occupancy
 * and no history of either, so like the spacing tier these are banned outright.
 * («освобод» is the RAIL2 half of this: «едва след като пътят отвъд се е
 * освободил» is a claim about WHEN he entered, and the disc only ever proves
 * that the road was clear by the time he arrived.)
 */
const DUTY_CLAIMS: ReadonlyArray<{ marker: string; claimBg: string }> = [
  { marker: "пропусн", claimBg: "пропускане на друг участник" },
  { marker: "освобод", claimBg: "изчакване на освободен път отвъд" },
];

/**
 * HALT AND WAIT — the one tier a param really does prove, which is why it is
 * kept separate rather than banned. `maxSpeedKmh` is a demand the evaluator
 * reads on every rung, and at or below REACH_ZONE_HALT_CAP_KMH it is a halt
 * demand the L1/L2 ladder is forbidden to widen (scenario/params.ts
 * widenSpeedCap). «спирка» / «спрелия» / «спирачещия» do not contain «спри».
 */
const CAPPED_CLAIMS: ReadonlyArray<{ marker: string; claimBg: string }> = [
  { marker: "спри", claimBg: "пълно спиране" },
  { marker: "изчакай", claimBg: "изчакване на място" },
];

const find = (
  set: ReadonlyArray<{ marker: string; claimBg: string }>,
  titleBg: string,
): { marker: string; claimBg: string } | undefined =>
  set.find((c) => titleBg.toLowerCase().includes(c.marker));

/**
 * Does anything in these params reach the evaluator as a GAP demand? Nothing
 * does today. `minLeadGapM` / `minLeadGapSec` are read defensively through an
 * index so this guard accepts the following gate the day a duration semantic
 * lands — a new provable field must be ADDED here, never worked around.
 */
function provesAGap(params: ObjectiveParams): boolean {
  if (params.kind !== "reachZone") return false;
  const extra = params as unknown as Record<string, unknown>;
  return typeof extra["minLeadGapM"] === "number" || typeof extra["minLeadGapSec"] === "number";
}

/** Does anything in these params reach the evaluator as a SPEED demand? */
const provesASpeed = (params: ObjectiveParams): boolean =>
  params.kind === "reachZone" && params.maxSpeedKmh !== undefined;

/**
 * THE RECEIPTS. Every title this change struck, with the marker that must catch
 * it. Listing them is not decoration: the guard below is only as good as this
 * vocabulary, and the last net shipped with /дистанц/ alone and missed the row
 * («Спри зад колоната на разумно разстояние») that started the whole census.
 */
const HISTORICAL_OFFENDERS: ReadonlyArray<{ was: string; marker: string; whereBg: string }> = [
  { was: "Прибери се вдясно с дистанция и завърши", marker: "дистанц", whereBg: "sc-ovr-finish" },
  { was: "Влез решително в пролуката зад отминалата кола", marker: "пролук", whereBg: "sc-lndc-merged" },
  { was: "Следвай колоната на съобразена дистанция", marker: "дистанц", whereBg: "sc-fbc-read" },
  { was: "Спри зад колоната, без да я удариш", marker: "удари", whereBg: "sc-fbc-stop" },
  { was: "Дръж 2-секундната дистанция със скоростта на потока", marker: "дистанц", whereBg: "sc-fmg-gap" },
  { was: "Спри зад спирачещия, без да го удариш", marker: "удари", whereBg: "sc-fmg-stop" },
  { was: "Премини покрай спрелия трамвай, пропуснал слизащия пътник", marker: "пропусн", whereBg: "sc-rts-clear" },
  { was: "Премини прелеза едва след като пътят отвъд се е освободил", marker: "освобод", whereBg: "sc-rxq-cross" },
  // The sibling rows the same census names in files this lane does not own —
  // carried here so the vocabulary is proved against them too, and so the net
  // is ready the moment those rows land.
  { was: "Спри зад колоната на разумно разстояние", marker: "разстоян", whereBg: "sc-fs-stopped (templates-following.ts)" },
  { was: "Следвай на съобразена дистанция", marker: "дистанц", whereBg: "sc-fd-follow (templates-following.ts)" },
];

describe("§1 the drift net knows the words that were actually used", () => {
  it("catches every title this change removed, by name", () => {
    const missed: string[] = [];
    for (const row of HISTORICAL_OFFENDERS) {
      const hit = find(SPACING_CLAIMS, row.was) ?? find(DUTY_CLAIMS, row.was);
      if (hit?.marker !== row.marker) {
        missed.push(`«${row.was}» (${row.whereBg}) — expected /${row.marker}/, got ${hit?.marker ?? "NOTHING"}`);
      }
    }
    expect(missed).toEqual([]);
  });

  it("and does not fire on the honest words these families need", () => {
    // «плътната линия» is the solid centre line, not a following distance;
    // «спирка», «спрелия» and «спирачещия» are not «спри». A net that fired on
    // these would be turned off, which is the only way a net truly fails.
    for (const honest of [
      "Дръж своята лента през плътната линия",
      "Приближи спирката с намалена скорост и готовност за спиране",
      "Подмини спрелия трамвай и продължи до края на отсечката",
    ]) {
      expect(find(SPACING_CLAIMS, honest), honest).toBeUndefined();
      expect(find(DUTY_CLAIMS, honest), honest).toBeUndefined();
      expect(find(CAPPED_CLAIMS, honest), honest).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// §2 THE CLASS GUARD — authored, then compiled at every rung
// ---------------------------------------------------------------------------

function offendersIn(rows: ReadonlyArray<{ where: string; titleBg: string; params: ObjectiveParams }>): string[] {
  const out: string[] = [];
  for (const row of rows) {
    if (row.params.kind !== "reachZone") continue;
    const spacing = find(SPACING_CLAIMS, row.titleBg);
    if (spacing && !provesAGap(row.params)) {
      out.push(
        `${row.where} — «${row.titleBg}» promises ${spacing.claimBg}; ` +
          `params ${JSON.stringify(row.params)} carry no gap demand` +
          (provesASpeed(row.params) ? " (a speed cap is not one — that is the census defect)" : ""),
      );
    }
    const duty = find(DUTY_CLAIMS, row.titleBg);
    if (duty) {
      out.push(`${row.where} — «${row.titleBg}» promises ${duty.claimBg}; no field on a SimTick carries it`);
    }
    const capped = find(CAPPED_CLAIMS, row.titleBg);
    if (capped && !provesASpeed(row.params)) {
      out.push(`${row.where} — «${row.titleBg}» promises ${capped.claimBg}; params ${JSON.stringify(row.params)} do not`);
    }
  }
  return out;
}

describe("§2 a reachZone title may only claim what a param proves", () => {
  it("no authored success row certifies a spacing, a duty or a halt it does not measure", () => {
    expect(
      offendersIn(
        FAMILY.flatMap((spec) =>
          spec.success.map((o) => ({ where: `${spec.id}/${o.id}`, titleBg: o.titleBg, params: o.params })),
        ),
      ),
    ).toEqual([]);
  });

  it("and the constraint still reaches the evaluator on every authored rung", () => {
    // A constraint the ladder or the parser drops is a false certificate with
    // extra steps — and the ladder is not hypothetical here: it widens radii by
    // up to 50% and speed caps by a flat 5 km/h.
    const rows = FAMILY.flatMap((spec) =>
      spec.levels.flatMap((rung) =>
        compileScenario(spec, rung.level).objectives.map((obj) => ({
          where: `${spec.id} L${rung.level} ${obj.id}`,
          titleBg: obj.titleBg,
          params: parseObjectiveParams(obj),
        })),
      ),
    );
    expect(offendersIn(rows)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §3 THE GATE IS GAP-BLIND — measured, not read off the source
// ---------------------------------------------------------------------------

/** Roll five frames across the mark at the zone's own legal speed, carrying a
 *  bumper-touching lead gap on every one of them. */
function completesWithLeadGap(params: ReachZoneParams, leadGapM: number): boolean {
  let state = createEvalState(params);
  let done = false;
  for (let i = 0; i < 5; i += 1) {
    const r = stepObjective(
      params,
      state,
      makeTick({
        t: i * 0.05,
        speedKmh: (params.maxSpeedKmh ?? 30) - 1,
        position: { x: params.x, y: params.y - 2 + i * 0.5 },
        leadGapM,
      }),
    );
    state = r.evalState;
    done = done || r.done;
  }
  return done;
}

const GAP_BLIND_ROWS: ReadonlyArray<{ specId: string; objectiveId: string }> = [
  { specId: "sc-fo-brakelight-chain", objectiveId: "sc-fbc-read" },
  { specId: "sc-fo-brakelight-chain", objectiveId: "sc-fbc-stop" },
  { specId: "sc-fo-motorway-gap", objectiveId: "sc-fmg-gap" },
  { specId: "sc-fo-motorway-gap", objectiveId: "sc-fmg-stop" },
  { specId: "sc-ov-return-gap", objectiveId: "sc-ovr-finish" },
  { specId: "sc-ln-decisive-change", objectiveId: "sc-lndc-merged" },
];

describe("§3 the reason the following titles were retitled and not gated", () => {
  for (const row of GAP_BLIND_ROWS) {
    it(`${row.objectiveId}: 0.2 m of bumper still completes it — so no title of its may claim a distance`, () => {
      const spec = FAMILY.find((s) => s.id === row.specId)!;
      const params = spec.success.find((o) => o.id === row.objectiveId)!.params;
      expect(params.kind).toBe("reachZone");
      if (params.kind !== "reachZone") return;
      // Touching the car in front, and the gate does not notice.
      expect(completesWithLeadGap(params, 0.2)).toBe(true);
      // …exactly as it does on an empty road: the two are indistinguishable to
      // this evaluator, which is precisely why the claim had to go.
      expect(completesWithLeadGap(params, Number.POSITIVE_INFINITY)).toBe(true);
      // And therefore the shipped title says nothing about a distance.
      expect(
        find(SPACING_CLAIMS, spec.success.find((o) => o.id === row.objectiveId)!.titleBg),
        `${row.objectiveId} is back to promising a distance the tick above walks straight through`,
      ).toBeUndefined();
    });
  }
});

// ---------------------------------------------------------------------------
// §4 THE PROOF ON THE TEMPLATES' OWN COUNTER-DEMOS
// ---------------------------------------------------------------------------

function readTrace(path: string): ScenarioTrace {
  return JSON.parse(readFileSync(join(process.cwd(), "..", path), "utf8")) as ScenarioTrace;
}

/** Replay a recorded drive through the SHIPPED evaluator exactly as a session
 *  would: fresh eval state, one tick per sample, monotonic latches. */
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

function demoOf(spec: ScenarioSpec, basename: string) {
  const demo = spec.mistakes.find((m) => m.traceRef.path.endsWith(`${basename}.trace.json`));
  expect(demo, `${spec.id} lost its ${basename} demo`).toBeDefined();
  return demo!;
}

/**
 * The rows whose claim the gate cannot see AT ALL: the drive that failed the
 * claim still completes the gate, at every rung, and always did. Params are
 * untouched by this change, so `done` is bit-identical and the only thing that
 * moved is the sentence — which is the half these tests pin.
 */
const BLIND_ROWS: ReadonlyArray<{
  specId: string;
  objectiveId: string;
  demo: string;
  codeRef: string;
  wasBg: string;
}> = [
  {
    specId: "sc-fo-motorway-gap",
    objectiveId: "sc-fmg-stop",
    demo: "mistake-bumper-crash",
    codeRef: "COLLISION",
    wasBg: "Спри зад спирачещия, без да го удариш",
  },
  {
    specId: "sc-rx-tram-stop-doors",
    objectiveId: "sc-rts-clear",
    demo: "mistake-creep-through",
    codeRef: "PEDESTRIAN_NOT_YIELDED",
    wasBg: "Премини покрай спрелия трамвай, пропуснал слизащия пътник",
  },
  {
    specId: "sc-rx-queue-clear",
    objectiveId: "sc-rxq-cross",
    demo: "mistake-stop-on-rails",
    codeRef: "RAIL_CROSSING_VIOLATION",
    wasBg: "Премини прелеза едва след като пътят отвъд се е освободил",
  },
];

describe("§4 the gates cannot see the claim — in the templates' own recordings", () => {
  for (const row of BLIND_ROWS) {
    const spec = FAMILY.find((s) => s.id === row.specId)!;

    it(`${row.objectiveId}: the drive that FAILED the claim completes it anyway, at every rung`, () => {
      const trace = readTrace(demoOf(spec, row.demo).traceRef.path);
      // The template still bills that drive for the very duty the old title
      // certified — the retitle is a correction, not a quiet amnesty.
      expect(demoOf(spec, row.demo).codeRefs).toContain(row.codeRef);
      for (const rung of spec.levels) {
        const obj = compileScenario(spec, rung.level).objectives.find((o) => o.id === row.objectiveId)!;
        expect(replay(parseObjectiveParams(obj), trace), `L${rung.level}`).toBe(true);
      }
    });

    it(`${row.objectiveId}: therefore its title claims nothing of the sort`, () => {
      const titleBg = spec.success.find((o) => o.id === row.objectiveId)!.titleBg;
      const claim = find(SPACING_CLAIMS, titleBg) ?? find(DUTY_CLAIMS, titleBg);
      expect(
        claim,
        `«${titleBg}» is back to promising ${claim?.claimBg ?? ""} — the drive above ` +
          `completes this gate without doing it (was: «${row.wasBg}»)`,
      ).toBeUndefined();
    });
  }

  /**
   * The one row where the claim WAS expressible, so the remedy is a smaller
   * disc rather than a smaller sentence — and the test carries both sides of
   * the measurement, because a radius change that only ever passes proves
   * nothing about what it fixed.
   */
  it("sc-lndc-merged: the half-merge straddle used to complete it and now cannot, at any rung", () => {
    const spec = FAMILY.find((s) => s.id === "sc-ln-decisive-change")!;
    const straddle = readTrace(demoOf(spec, "mistake-half-merge").traceRef.path);
    const shadow = readTrace(spec.shadow!.path);

    // The straddle stands 3.44 m off the target-lane centre — |7.50 − 4.06| —
    // and the drill's own copy calls it «нито в едната, нито в другата».
    const nearest = Math.min(...straddle.samples.map((s) => Math.hypot(s.x - 4.06, s.y - 300)));
    expect(nearest).toBeCloseTo(3.44, 2);

    for (const rung of spec.levels) {
      const obj = compileScenario(spec, rung.level).objectives.find((o) => o.id === "sc-lndc-merged")!;
      const params = parseObjectiveParams(obj);
      expect(params.kind).toBe("reachZone");
      if (params.kind !== "reachZone") return;

      // FAILS ON THE OLD BEHAVIOUR, and the doubling is not arbitrary: the row
      // shipped at authored r4 against today's r2, and the ladder is
      // multiplicative, so ×2 of the compiled (3, 2.5, 2, 2, 2) is exactly the
      // compiled ladder it replaced — (6, 5, 4, 4, 4). That disc swallowed the
      // straddle at EVERY rung: measured 47 / 43 / 38 / 38 / 38 frames inside.
      const asShipped = { ...params, radiusM: params.radiusM * 2 };
      expect(replay(asShipped, straddle), `L${rung.level} old radius`).toBe(true);

      // …and the shipped disc refuses it while still admitting the shadow.
      expect(replay(params, straddle), `L${rung.level} straddle`).toBe(false);
      expect(replay(params, shadow), `L${rung.level} shadow`).toBe(true);
    }

    // And the words that could never be checked are gone with it: «пролука» is
    // a gap (§3) and «решително» is a manner no param reads.
    const titleBg = spec.success.find((o) => o.id === "sc-lndc-merged")!.titleBg;
    expect(find(SPACING_CLAIMS, titleBg)).toBeUndefined();
    expect(titleBg.toLowerCase()).not.toContain("решително");
  });
});

// ---------------------------------------------------------------------------
// §5 THE LANE CLAIM — true only while the COMPILED disc stays in the lane
// ---------------------------------------------------------------------------

/** The catalogue's lane pitch (every 1+1 and 2+2 district in these families).
 *  A disc centred on a lane centre leaves that lane at half of it. */
const LANE_HALF_PITCH_M = 8.125 / 2;

/**
 * „Be in THIS lane" in the forms these families use — including the stem
 * «центрир», because «Центрирай се и продължи» is the same promise as
 * «центрирано в лентата» said as an imperative, and matching only the adverb
 * would have quietly excused one row of the census (sc-lndc-finish, r8 → 13.00
 * at L1, a disc that spans both lanes and the verge).
 */
const LANE_WORDS = [
  "своята лента",
  "дясната лента",
  "лявата лента",
  "общата лента",
  "насрещната лента",
  "в лентата",
  "центрир",
];

/**
 * THE BACKLOG — all 26 lane-claiming rows of these families whose compiled disc
 * still reaches out of the lane it names, measured 2026-08-16 at the widest
 * rung. SHRINK-ONLY: the assertion below is an equality, so a row can leave
 * this list only by being fixed, and a twenty-seventh cannot appear without
 * turning the suite red.
 *
 * It is a backlog and not an exemption. Each entry is the same defect the two
 * rows missing from it carried until this change: «Прибери се вдясно в своята
 * лента» was creditable at L1 to a car 3.44 m INTO the oncoming lane, because
 * the authored r5 is the L3 radius and the ladder widens it to 7.50. The fix is
 * always the same shape — size the authored radius backwards from the widest
 * rung (r ≤ 2.7 keeps L1 at 4.05) and re-measure the shadow's frames — but it
 * is twenty-five radii on committed recordings and belongs to its own wave.
 */
const LANE_CLAIM_BACKLOG: readonly string[] = [
  "sc-ln-decisive-change/sc-lndc-finish",
  "sc-ln-boulevard-discipline/sc-lnbd-home",
  "sc-ln-boulevard-discipline/sc-lnbd-pass",
  "sc-ln-boulevard-discipline/sc-lnbd-right",
  "sc-ln-obstacle-meeting/sc-lnom-home",
  "sc-ln-obstacle-meeting/sc-lnom-wait",
  "sc-ln-turn-lane-arrows/sc-lnta-finish",
  "sc-ln-turn-lane-arrows/sc-lnta-lane",
  "sc-mw-emergency-lane/sc-mwe-pass",
  "sc-ov-ban-overtake/sc-ovb-finish",
  "sc-ov-being-overtaken/sc-ovbo-finish",
  "sc-ov-bus-lane/sc-ovbus-general",
  "sc-ov-crest-curve/sc-ovcc-finish",
  "sc-ov-crossing-overtake/sc-ovc-approach",
  "sc-ov-keep-right/sc-ovkr-finish",
  "sc-ov-keep-right/sc-ovkr-move-right",
  "sc-ov-lane-keeping/sc-ovln-east-apex",
  "sc-ov-lane-keeping/sc-ovln-finish",
  "sc-ov-lane-keeping/sc-ovln-west-apex",
  "sc-ov-night-gap/sc-ovn-finish",
  "sc-ov-oncoming-gap/sc-ovg-finish",
  "sc-ov-return-gap/sc-ovr-pass",
  "sc-ov-solid-line/sc-ovsl-finish",
  "sc-ov-solid-line/sc-ovsl-hold",
  "sc-ov-solid-return/sc-ovsr-finish",
  "sc-ov-solid-return/sc-ovsr-home",
];

describe("§5 a title that names a lane is only true while the compiled disc stays in it", () => {
  it("the two rows this change authored keep the claim on every rung", () => {
    // FAILS ON THE OLD BEHAVIOUR: sc-ovr-finish shipped r5 → L1 7.50 (edge
    // x = −3.44, 3.44 m into the oncoming lane) and sc-lndc-merged r4 → L1 6.00
    // (edge x = −1.94, back in the lane the student had just left).
    for (const [specId, objectiveId] of [
      ["sc-ov-return-gap", "sc-ovr-finish"],
      ["sc-ln-decisive-change", "sc-lndc-merged"],
    ] as const) {
      const spec = FAMILY.find((s) => s.id === specId)!;
      expect(
        LANE_WORDS.some((w) => spec.success.find((o) => o.id === objectiveId)!.titleBg.toLowerCase().includes(w)),
        `${objectiveId} stopped claiming a lane — this guard is then pinned to nothing`,
      ).toBe(true);
      for (const rung of spec.levels) {
        const obj = compileScenario(spec, rung.level).objectives.find((o) => o.id === objectiveId)!;
        const params = parseObjectiveParams(obj);
        if (params.kind !== "reachZone") continue;
        expect(params.radiusM, `${objectiveId} L${rung.level}`).toBeLessThanOrEqual(LANE_HALF_PITCH_M);
      }
    }
  });

  it("and the rows that do not are exactly the known backlog — it may shrink, never grow", () => {
    const offenders: string[] = [];
    for (const spec of FAMILY) {
      for (const o of spec.success) {
        if (o.params.kind !== "reachZone") continue;
        if (!LANE_WORDS.some((w) => o.titleBg.toLowerCase().includes(w))) continue;
        const widest = Math.max(
          ...spec.levels.map((rung) => {
            const p = parseObjectiveParams(
              compileScenario(spec, rung.level).objectives.find((x) => x.id === o.id)!,
            );
            return p.kind === "reachZone" ? p.radiusM : 0;
          }),
        );
        if (widest > LANE_HALF_PITCH_M) offenders.push(`${spec.id}/${o.id}`);
      }
    }
    expect(
      offenders.sort(),
      "a lane-claiming zone whose widest compiled disc leaves the lane. Fixed one? " +
        "delete its line from LANE_CLAIM_BACKLOG. Added one? size the authored radius " +
        "so radius × 1.5 stays inside 4.0625 m.",
    ).toEqual([...LANE_CLAIM_BACKLOG].sort());
  });
});
