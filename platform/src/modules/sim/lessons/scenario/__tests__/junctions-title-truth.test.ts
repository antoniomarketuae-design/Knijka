/**
 * TITLE-TRUTH WAVE — the JUNCTIONS group (templates-junctions.ts,
 * templates-junctions2.ts).
 *
 * `lane9-junctions-signals-truth.test.ts` already carries D3, „an objective
 * title may not promise what its gate cannot see", for `passSignal` and lamp
 * states. This file is the same law for the other half of the family: a
 * `reachZone` title may not certify another road-user's PRIORITY.
 *
 * WHY IT CANNOT: `stepReachZone(params, prev, tick)` (objectives.ts) is handed
 * one SimTick, and a SimTick carries no other actor's priority and no yield
 * outcome (rules/types.ts) — and, unlike `stepPassSignal`, no ObjectiveContext
 * either, so the staged runner's own verdict is out of reach as well. A disc
 * on the exit arm therefore ticks off the barge-through and the patient wait on
 * exactly the same frame. That is measured below, not argued: `a plain exit
 * gate completes for a drive that never yielded`.
 *
 * AMENDED 2026-08-28 (wave 8 integration) — THE „CANNOT" ABOVE IS NOW HALF
 * FALSE, and the amendment is deliberately narrow. On 2026-08-27
 * `deriveYieldDemand` (objectives.ts) landed for `sc-signal-flashing`: a
 * reachZone banner whose words are «пропусни / пропуснеш / пропуснете» now
 * fills in `requireYieldClean`, and `stepReachZone`'s witness chain — which
 * DOES take an `ObjectiveContext` today (`yieldCleanHonoured`, objectives.ts)
 * — reads the run's billed FAILED_TO_YIELD ledger from the moment the objective
 * went active. So the tick can now witness one half of a yield: the REFUSAL.
 * It still cannot witness the other half — „he really did wait" — which is why
 * the exemption below is not „any yield title" but the two conditions that make
 * the refusal REDEEMABLE on that particular drill.
 *
 * THE STANDARD DID NOT MOVE, ONLY THE INSTRUMENT. This file already accepted
 * „the observable half of giving way" as sufficient when it exempted
 * `sc-jxgb-yield` for its crawl cap — a cap that likewise proves you were slow,
 * never that you waited. `requireYieldClean` is a STRICTLY stronger observable
 * for the same sentence: it reads the very ledger the yield is billed on. And
 * every certificate that arms NOTHING is still convicted — «…по пътя с
 * ПРЕДИМСТВО» and the past participle «ПРОПУСНАЛ» both fail
 * `deriveYieldDemand`'s own matcher, so the six rows the title-truth wave
 * rewrote stay rewritten and cannot come back through this door.
 *
 * THE INDEPENDENT REASON THIS FILE HAD TO MOVE, not the lane's argument: the
 * SCOPE note below already points at `templates-signals.ts sc-sflash-cross`,
 * and that row ships «Премини правó напред, след като пропуснеш идващия
 * отдясно» on a BARE disc `{4.06, 45, r9}` at HEAD, untouched by this wave,
 * with `reach-zone-yield-clean.test.ts` asserting that exact string derives
 * "traffic". Widen `GROUP` to the LANE9 roster as instructed and the
 * unamended guard would convict the catalogue's own sanctioned pattern. A
 * census that outlaws the shape the codebase ships is not holding a line; it is
 * out of date.
 *
 * THESE ASSERTIONS FAIL ON THE TITLES SHIPPED BEFORE THIS WAVE:
 *   sc-jrhr-cross   «Премини кръстовището наляво, СЛЕД КАТО ПРОПУСНЕШ идващия отдясно»
 *   sc-ltap-turn    «Завърши левия завой на юг, ПРОПУСНАЛ насрещните»
 *   sc-jblind-cross «Премини наляво, СЛЕД КАТО ПРОПУСНЕШ идващия отдясно»
 *   sc-jstop-exit · sc-jscan-exit · sc-jgap-exit · sc-jleft-exit
 *                   «Завий на… и продължи ПО ПЪТЯ С ПРЕДИМСТВО»
 * The duties themselves are untouched and still graded — by the right-hand-rule
 * tracker, the left-turn tracker and the stop-line give-way check
 * (FAILED_TO_YIELD on every mistake demo in both files), by the Б2 passSignal
 * rows, and by the config-gated JUNCTION_SCAN_INCOMPLETE detector. What died is
 * the certificate, not the duty; params are byte-identical, so no drive that
 * passed yesterday fails today.
 *
 * SCOPE, stated so its silence is deliberate:
 *   · The two files this group owns. The same-shape rows in sibling lanes of
 *     this wave — templates-junctions3.ts `sc-jxeq-cross`, templates-signals.ts
 *     `sc-sdead-cross` / `sc-sflash-cross` — are NOT walked yet: widen `GROUP`
 *     to the LANE9 roster the moment those land and this guard covers the whole
 *     family unchanged.
 *   · The YIELD class only. `sc-jxgb-roll` («Премини първия Б1 след оглед, без
 *     излишно спиране») still claims a SCAN and the absence of a stop on a
 *     plain disc; it was not in this group's adjudicated set, so it is reported
 *     to the lead rather than silently rewritten here.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyTick, createLessonSession } from "../../engine";
import {
  REACH_ZONE_HALT_CAP_KMH,
  deriveYieldDemand,
  parseObjectiveParams,
} from "../../objectives";
import type { WitnessedReachZoneParams } from "../../objectives";
import { makeTick } from "../../__tests__/fixtures";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES_JUNCTIONS } from "../templates-junctions";
import { SCENARIO_TEMPLATES_JUNCTIONS2 } from "../templates-junctions2";
import type { ScenarioSpec } from "../types";

const GROUP: readonly ScenarioSpec[] = [
  ...SCENARIO_TEMPLATES_JUNCTIONS,
  ...SCENARIO_TEMPLATES_JUNCTIONS2,
];

/**
 * Words that put ANOTHER road-user's priority in the sentence: пропусни /
 * пропуснеш / пропуснал, предимство / предимството. Substring matches on
 * purpose — Cyrillic has no `\b` in a JS regex without the `u` dance, and the
 * stems are unambiguous.
 */
const YIELD_CLAIM = /пропусн|предимств/i;

/**
 * A full-stop imperative — «Спри …», «пълно спиране». Deliberately NOT matched
 * by «без излишно спиране» (sc-jxgb-roll), which claims the opposite.
 */
const claimsHalt = (titleBg: string): boolean => {
  const t = titleBg.toLowerCase();
  return /(^|[\s„(])спри[\s,.]/.test(t) || t.includes("пълно спиране");
};

/**
 * The fault codes each demand consults, mirrored from `YIELD_DEMAND_CODES`
 * (objectives.ts) — module-private there, so the mirror is PINNED by the
 * `sc-jscan-exit` block below rather than trusted to stay in step.
 */
const YIELD_DEMAND_CODES: Record<string, readonly string[]> = {
  traffic: ["FAILED_TO_YIELD", "EMERGENCY_NOT_YIELDED"],
  pedestrian: ["PEDESTRIAN_NOT_YIELDED"],
};

/**
 * MAY THIS BANNER KEEP ITS YIELD CLAUSE? Only when the claim is REDEEMABLE, and
 * that takes both halves — either one alone is a certificate again:
 *
 *  1. THE SENTENCE ARMS A DEMAND THE EVALUATOR READS. `deriveYieldDemand` here
 *     is the production matcher itself, not a copy of it — the same call
 *     `parseObjectiveParams` makes to fill in `requireYieldClean`. If it ever
 *     stops firing, this exemption evaporates on the same run and the title is
 *     convicted again. That is the point of calling it rather than listing ids.
 *  2. THE DRILL STAGES THE CONFLICT IT NAMES. A demand on a lesson that stages
 *     nothing can never be refused: `yieldCleanHonoured` returns `true` on an
 *     empty fault ledger, so the banner would certify a wait against an empty
 *     street — a predicate no drive can read, which is the failure this corpus
 *     has measured more often than any other. So the scenario must stage at
 *     least one encounter AND its own mistake demos must bill a code the demand
 *     consults. Both facts are visible in the spec, so this gate needs no drive.
 *
 * What it deliberately does NOT check is that the student really waited. That
 * remains unwitnessable, and the sentence it lets through must therefore be one
 * the REFUSAL alone makes honest.
 */
const yieldClaimIsRedeemable = (spec: ScenarioSpec, titleBg: string): boolean => {
  const demand = deriveYieldDemand(titleBg);
  if (demand === undefined) return false;
  if ((spec.staged ?? []).length === 0) return false;
  const codes = YIELD_DEMAND_CODES[demand] ?? [];
  return spec.mistakes.some((m) => m.codeRefs.some((c) => codes.includes(c)));
};

// ---------------------------------------------------------------------------
// The law
// ---------------------------------------------------------------------------

describe("a reachZone title may not certify a yield its tick cannot see", () => {
  for (const scenario of GROUP) {
    for (const objective of scenario.success) {
      const p = objective.params;
      if (p.kind !== "reachZone") continue;
      // A zone that carries a constraint makes a different promise: it says
      // something the evaluator really reads (a cap, a stop-line cut). Those
      // are audited by the interlock below instead of exempted quietly.
      if (p.maxSpeedKmh !== undefined || p.acceptBeforeMarkM !== undefined) continue;
      // A banner that ARMS a demand on a drill staging the conflict it names is
      // audited by the `sc-jscan-exit` block below instead of exempted quietly
      // — see `yieldClaimIsRedeemable` for the two halves and why one is not
      // enough. Today this spares exactly one row in GROUP.
      if (yieldClaimIsRedeemable(scenario, objective.titleBg)) continue;
      it(`${scenario.id} / ${objective.id}`, () => {
        expect(
          YIELD_CLAIM.test(objective.titleBg),
          `${objective.id}: „${objective.titleBg}" certifies another road-user's priority, ` +
            `but its gate is a plain disc at (${p.x}, ${p.y}) r${p.radiusM}: reaching it proves ` +
            `the manoeuvre and the compass arm, nothing else. Name those instead and leave the ` +
            `yield to the tracker that measures it.`,
        ).toBe(false);
      });
    }
  }
});

describe("the yield-titled zone that earns it with a demand, not a cap", () => {
  /**
   * `sc-jscan-exit` — wave 8, rows `sc-junction-scan:e6834882` / `:28e782ab`.
   * The junction-triplet lane gave this gate «Завърши десния завой на изток,
   * след като пропуснеш колата отляво», which is the exact sentence shape the
   * title-truth wave stripped from six siblings. It stands HERE and nowhere
   * else because the instrument changed underneath it — and this block is what
   * proves that rather than asserting it. Strip any one of these four facts and
   * the guard above convicts the title on the next run.
   *
   * Verified at integration, in this order, against the tree and not the brief:
   *   1. the COMPILED objective really carries the demand — the real parse
   *      path, not `deriveYieldDemand` called a second time;
   *   2. the drill stages `sc-jscan-conflict`, a `priorityFromRight` car
   *      running the priority road west → east: the car on the player's LEFT,
   *      merging into the very lane his right turn enters, held by
   *      `witnessArm.nearLineM 6` so a slow approach cannot delete it;
   *   3. both mistake demos bill FAILED_TO_YIELD — the code the demand
   *      consults — so the refusal is REACHABLE on this map rather than a
   *      predicate nothing can trip;
   *   4. the exemption is the DEMAND, not the id.
   *
   * WHAT IS STILL NOT WITNESSED, so nobody reads this as more than it is: the
   * WAIT itself. The tick refuses a drive that took the car's priority; it
   * cannot confirm one that gave it. That is why point 2 is load-bearing — on a
   * drill with no staged car this same sentence would be exactly the crime the
   * first describe convicts.
   */
  const spec = GROUP.find((s) => s.id === "sc-junction-scan")!;

  it("the compiled gate carries requireYieldClean: traffic", () => {
    const lesson = compileScenario(spec, 3);
    const o = lesson.objectives.find((x) => x.id === "sc-jscan-exit")!;
    const p = parseObjectiveParams(o);
    expect(p.kind).toBe("reachZone");
    const w = p as WitnessedReachZoneParams;
    expect(w.requireYieldClean).toBe("traffic");
    // Still a BARE disc: the demand rides the sentence, so a drive that yields
    // keeps a bit-identical `done` and no committed trace moves.
    expect(w.maxSpeedKmh).toBeUndefined();
    expect(w.acceptBeforeMarkM).toBeUndefined();
  });

  it("the conflict the sentence names is staged, and the demos bill its code", () => {
    expect((spec.staged ?? []).map((e) => e.id)).toContain("sc-jscan-conflict");
    // Pins the mirrored table above against the demos that must trip it.
    expect(YIELD_DEMAND_CODES.traffic).toContain("FAILED_TO_YIELD");
    const billing = spec.mistakes.filter((m) => m.codeRefs.includes("FAILED_TO_YIELD"));
    expect(billing.map((m) => m.titleBg).length).toBeGreaterThan(0);
  });

  it("the exemption is the demand, not the id", () => {
    expect(
      yieldClaimIsRedeemable(spec, "Завърши десния завой на изток, след като пропуснеш колата отляво"),
    ).toBe(true);
    // The two shapes the title-truth wave removed stay removed: a bare priority
    // NOUN and a past participle both arm nothing, so both stay convicted.
    expect(yieldClaimIsRedeemable(spec, "Завий на изток и продължи по пътя с предимство")).toBe(
      false,
    );
    expect(yieldClaimIsRedeemable(spec, "Завърши левия завой на юг, пропуснал насрещните")).toBe(
      false,
    );
    // A posture is not a fate — «с готовност да пропуснеш» arms nothing either.
    expect(yieldClaimIsRedeemable(spec, "Приближи с готовност да пропуснеш отдясно")).toBe(false);
    // And the same sentence on a drill that stages nothing is a certificate
    // against an empty street: refused, which is what makes point 2 real.
    expect(
      yieldClaimIsRedeemable(
        { ...spec, staged: [] },
        "Завърши десния завой на изток, след като пропуснеш колата отляво",
      ),
    ).toBe(false);
  });
});

describe("the cap-exempt yield zone keeps the gate that stands in for the wait", () => {
  /**
   * `sc-jxgb-yield` («Пропусни колата с предимство на второто кръстовище») is
   * the exception that earns it WITH PARAMS — as of 2026-08-28 it is no longer
   * the only yield title in GROUP (see `sc-jscan-exit` below, which earns it
   * with a DEMAND instead), and this block's name was corrected to say so
   * rather than keep a count that had quietly stopped being true. It earns it: a ≤ 6 km/h crawl demand inside a
   * band cut off at the Б1 paint is the observable half of giving way — you
   * cannot be at rest before the line and barge through it on the same drive.
   * The exemption is the CAP, not the id: strip either param and the guard
   * above convicts the title on the next run.
   */
  it("sc-jxgb-yield", () => {
    const scenario = GROUP.find((s) => s.id === "sc-jx-giveway-b1")!;
    const objective = scenario.success.find((o) => o.id === "sc-jxgb-yield")!;
    expect(YIELD_CLAIM.test(objective.titleBg)).toBe(true);
    expect(objective.params.kind).toBe("reachZone");
    if (objective.params.kind !== "reachZone") return;
    expect(objective.params.maxSpeedKmh).toBeLessThanOrEqual(REACH_ZONE_HALT_CAP_KMH);
    expect(objective.params.acceptBeforeMarkM).toBeDefined();
  });
});

describe("a reachZone that says «спри» carries a halt demand", () => {
  /**
   * The companion law (the stop convention): a full-stop claim IS expressible —
   * `maxSpeedKmh ≤ REACH_ZONE_HALT_CAP_KMH` makes the zone a halt demand, which
   * unlocks the approach capsule and is never widened by the L1/L2 ladder
   * (`scenario/params.ts widenSpeedCap`). So where the sentence says „stop", the
   * gate must too. No row in this group claims a halt today; the matcher is
   * pinned so the rule is not vacuous while it waits.
   */
  it("the matcher reads «спри» as a demand and «без излишно спиране» as its opposite", () => {
    expect(claimsHalt("Спри напълно на стоп-линията на знак Б2")).toBe(true);
    expect(claimsHalt("Премини първия Б1 след оглед, без излишно спиране")).toBe(false);
  });

  for (const scenario of GROUP) {
    for (const objective of scenario.success) {
      if (objective.params.kind !== "reachZone") continue;
      if (!claimsHalt(objective.titleBg)) continue;
      it(`${scenario.id} / ${objective.id}`, () => {
        if (objective.params.kind !== "reachZone") return;
        const cap = objective.params.maxSpeedKmh;
        expect(
          cap !== undefined && cap <= REACH_ZONE_HALT_CAP_KMH,
          `${objective.id}: „${objective.titleBg}" demands a full stop but its zone has ` +
            `${cap === undefined ? "no speed cap at all" : `a cap of ${cap} km/h`} — a roll ` +
            `through it collects the tick.`,
        ).toBe(true);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Why remedy B and not A: the measurement behind the whole rewrite
// ---------------------------------------------------------------------------

/** district/spawn-id → pose, read from the committed world file (the same
 *  resolution LessonScene.spawnPose performs at runtime). */
const spawnPose = (districtId: string, pointId: string): { x: number; y: number } => {
  const f = path.join(process.cwd(), "..", "content", "world", `${districtId}.json`);
  const d = JSON.parse(fs.readFileSync(f, "utf8")) as {
    spawnPoints?: Array<{ id: string; x: number; y: number }>;
  };
  const sp = (d.spawnPoints ?? []).find((s) => s.id === pointId);
  if (!sp) throw new Error(`${districtId} has no spawn ${pointId}`);
  return { x: sp.x, y: sp.y };
};

describe("a plain exit gate completes for a drive that never yielded", () => {
  /**
   * The reason the yield clause could not simply be MADE true. sc-junction-rhr
   * is driven straight through its uncontrolled T at a steady pace: no wait, no
   * gap, no staged outcome ever applied — the barge the lesson exists to
   * punish. Every objective still goes green. The rule engine is what convicts
   * that drive (FAILED_TO_YIELD, mistake-barge); the disc cannot tell it from
   * the correct one, so its title must not claim to.
   */
  it("sc-junction-rhr @L3", () => {
    const spec = GROUP.find((s) => s.id === "sc-junction-rhr")!;
    const lesson = compileScenario(spec, 3);
    const spawn = spawnPose(spec.map.districtId, spec.start.spawnPointId!);

    let s = createLessonSession(lesson);
    // Frame zero at the real spawn: latches `everOutside` so nothing is
    // conceded for standing still (doc 87 B3/B10/B11).
    s = applyTick(s, makeTick({ t: 0, position: spawn, speedKmh: 0 })).state;

    lesson.objectives.forEach((o, i) => {
      const p = parseObjectiveParams(o);
      expect(p.kind, `${o.id} is expected to be a reachZone in this drill`).toBe("reachZone");
      if (p.kind !== "reachZone") return;
      // Obey the cap where there is one; otherwise roll through the box.
      const speedKmh = p.maxSpeedKmh !== undefined ? Math.max(0, p.maxSpeedKmh - 5) : 25;
      s = applyTick(s, makeTick({ t: (i + 1) * 4, position: { x: p.x, y: p.y }, speedKmh })).state;
    });

    expect(s.objectives.map((o) => [o.spec.id, o.status])).toEqual(
      lesson.objectives.map((o) => [o.id, "done"]),
    );
    expect(s.phase).toBe("completed");
  });
});
