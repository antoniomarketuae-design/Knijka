/**
 * TITLE-HONESTY GUARDS for the reachZone gates that claim a STOP.
 *
 * THE CLASS. An objective title is a certificate: the banner says «Спри
 * напълно на стоп-линията» and the student who sees ЗАДАЧА ✓ believes a
 * simulator watched him do exactly that. `stepReachZone` is handed
 * (params, prev, tick) and nothing else, so the only things it can ever
 * witness are A PLACE and A SPEED — `maxSpeedKmh` (with the FR-24
 * `acceptBeforeMarkM` cut deciding where credit ends) and the geometry. Any
 * word in a title that promises more than that is a certificate nobody signed.
 *
 * WHAT THIS FILE WOULD HAVE CAUGHT. Two shipped rows said «спри» and did not
 * ask for one:
 *
 *   · `sc-ed-d2-priority-run/sc-edpr-b2` — «Спри напълно на знак Б2 и огледай»
 *     on a bare radius-12 disc with NO cap, authored 50 m past the paint it
 *     named. The committed rolling-stop demo rolls that line at 11.9 km/h and
 *     the objective ticked; `s-w4-bot-completion.test.ts` asserted the tick in
 *     its own words and called it honest.
 *   · `sc-signal-redyellow/sc-sry-approach` — «Спри на стоп-линията на червено»
 *     at maxSpeedKmh 40, which the L1 ladder widened to 45 and painted across
 *     the lane as «не по-бързо от 45 км/ч» under the word СПРИ.
 *
 * The guards below are rules, not restatements of the new numbers: the first
 * is a catalog invariant, the second replays the committed drives, the third
 * checks each remaining claim against a constant owned by the OTHER side of
 * the system (the rule engine's own crossing threshold) so the two halves
 * cannot drift apart silently.
 *
 * ── SWEEP 161 · THE SAME RULE, READ OVER THE WHOLE CATALOGUE (2026-08-18) ────
 *
 * The ACTOR rule at the bottom of this file was written as a catalog rule and
 * then run over FOUR templates (`TOUCHED`), because that was the pass that
 * authored it. Fifty-one BROKEN findings were routed to `objectives.ts` off
 * `.audit-frames/sweep161`, and the single widest class among them is this
 * rule's, on templates the narrow scope never looked at. Measured over all 167
 * shipped specs, EIGHT reachZone rows certify that another road user was let
 * through or waited for — a fact no field of SimTick carries into
 * `stepReachZone`, which is handed (params, prev, tick) and no ObjectiveContext
 * at all. Six of the eight are named in the sweep by their own frame:
 *
 *   sc-lndc-wait       «Изчакай колата в съседната лента…» ✓ 2:12 with NO car
 *                      in that lane in any captured frame (mobile-right)
 *   sc-hzes-finish     «Изчакай детето…» in a protocol that also convicts a
 *                      collision, on a section with no child in it (pc-right)
 *   sc-jxgb-yield      «Пропусни колата с предимство…» — 0 of 3 objectives on
 *                      pc, 2 of 3 on mobile, same scripted drive
 *   sc-pzl-exit · sc-mfp-walk-yield · sc-jay-clear — the same shape, unaudited
 *
 * A SECOND class the sweep found, with only three rows in the whole catalogue:
 * a title that certifies THE CAR'S OWN LAMPS. See LAMP_CLAIM below — including
 * why the repair is NOT a lamp gate in `stepReachZone`.
 *
 * Neither list is a permission. Each row is a named debt with an owner, and
 * deleting an entry without moving its template turns this file red.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG } from "../../rules";
import { recordScEdD2PriorityRunDrive } from "../../traces/scEdD2PriorityRun";
import { applyTick, buildLessonResult, createLessonSession } from "../engine";
import { REACH_ZONE_HALT_CAP_KMH } from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { ScenarioSpec } from "../scenario/types";

interface ZoneRow {
  specId: string;
  objectiveId: string;
  titleBg: string;
  maxSpeedKmh?: number;
  acceptBeforeMarkM?: number;
  radiusM: number;
}

function reachZones(specs: readonly ScenarioSpec[]): ZoneRow[] {
  const out: ZoneRow[] = [];
  for (const spec of specs) {
    for (const o of spec.success) {
      const p = o.params as {
        kind: string;
        radiusM?: number;
        maxSpeedKmh?: number;
        acceptBeforeMarkM?: number;
      };
      if (p.kind !== "reachZone") continue;
      out.push({
        specId: spec.id,
        objectiveId: o.id,
        titleBg: o.titleBg,
        maxSpeedKmh: p.maxSpeedKmh,
        acceptBeforeMarkM: p.acceptBeforeMarkM,
        radiusM: p.radiusM ?? 0,
      });
    }
  }
  return out;
}

/**
 * The IMPERATIVE «спри», as a whole word. JS `\b` is ASCII-only, so the
 * boundaries are spelled out in Unicode classes — and they matter: «спринт»
 * (sc-sig-green-wave, sc-crossing-rain-sprint) contains the four letters and
 * is not a stop, while «готовност за спиране», «без излишно спиране» and
 * «преди спирането» talk ABOUT stopping without demanding one.
 */
const HALT_CLAIM = /(?:^|[^\p{L}])[Сс]при(?![\p{L}])/u;

/**
 * Rows that claim «спри» without a halt cap and are OWNED BY ANOTHER LANE of
 * the same title-honesty pass. Each entry is a debt with a name, not a
 * permission: when its owner lands the fix the entry simply stops matching and
 * can be deleted. Never add one for a row you could have fixed.
 */
const HALT_CLAIM_KNOWN_OPEN: ReadonlyArray<{ specId: string; objectiveId: string; why: string }> = [
  {
    specId: "sc-animal-hazard",
    objectiveId: "reach-end",
    why: "«Спри за животното и продължи в лентата си до края» — the stop happens at y ≈ 150 and the only gate is the finish at y = 325, so no cap can be placed on it; the agreed remedy retitles the row (templates-reels.ts) and leaves the stop to COLLISION, which that template already cites.",
  },
];

describe("a reachZone that says «спри» asks for a stop", () => {
  const zones = reachZones(SCENARIO_TEMPLATES);
  const claims = zones.filter((z) => HALT_CLAIM.test(z.titleBg));

  it("the guard has teeth (the catalog really is full of stop gates)", () => {
    // A regex that silently stopped matching would make every assertion below
    // vacuously green — the failure mode this census exists to prevent.
    expect(claims.length).toBeGreaterThan(50);
    // …and it does not sweep in the drills that merely TALK about stopping.
    const talkers = zones.filter(
      (z) => /спиран|спринт/iu.test(z.titleBg) && !HALT_CLAIM.test(z.titleBg),
    );
    expect(talkers.length).toBeGreaterThan(5);
  });

  it("every «спри» gate carries a cap in the halt band — no exceptions but the named ones", () => {
    const open = new Set(HALT_CLAIM_KNOWN_OPEN.map((k) => `${k.specId}/${k.objectiveId}`));
    const offenders = claims
      .filter((z) => !open.has(`${z.specId}/${z.objectiveId}`))
      .filter((z) => z.maxSpeedKmh === undefined || z.maxSpeedKmh > REACH_ZONE_HALT_CAP_KMH)
      .map(
        (z) =>
          `${z.specId}/${z.objectiveId} — "${z.titleBg}" completes at ${
            z.maxSpeedKmh === undefined ? "ANY speed" : `${z.maxSpeedKmh} km/h`
          }`,
      );
    expect(offenders, `${offenders.length} gate(s) promise a stop they do not require`).toEqual([]);
  });

  it("a halt cap is never widened by the ladder — «спри» reads the same on every rung", () => {
    // params.ts holds this; asserted here because it is HALF of what makes the
    // caps above honest (the other half is that they exist at all).
    for (const spec of SCENARIO_TEMPLATES) {
      const authored = new Map(
        spec.success
          .filter((o) => (o.params as { kind: string }).kind === "reachZone")
          .map((o) => [o.id, (o.params as { maxSpeedKmh?: number }).maxSpeedKmh]),
      );
      for (const rung of spec.levels) {
        for (const o of compileScenario(spec, rung.level).objectives) {
          if (o.kind !== "reachZone") continue;
          const a = authored.get(o.id);
          if (a === undefined || a > REACH_ZONE_HALT_CAP_KMH) continue;
          expect(
            (o.params as { maxSpeedKmh?: number }).maxSpeedKmh,
            `${spec.id}@L${rung.level}/${o.id}`,
          ).toBe(a);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// The row the audit found certified in a test of its own
// ---------------------------------------------------------------------------

function loadDistrict(id: string): unknown {
  return JSON.parse(
    readFileSync(join(process.cwd(), "..", "content", "world", `${id}.json`), "utf8"),
  ) as unknown;
}

function b2DoneOn(name: "mistake-rolling-stop" | "mistake-partial-scan"): boolean {
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-ed-d2-priority-run")!;
  let session = createLessonSession(compileScenario(spec, 3));
  recordScEdD2PriorityRunDrive(loadDistrict("d2-v1"), name, {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  return buildLessonResult(session).objectives.find((o) => o.id === "sc-edpr-b2")!.done;
}

describe("«Спри напълно на стоп-линията на знак Б2» tells the two drives apart", () => {
  // Behaviour, not values: whoever loosens the cap, widens the disc or moves
  // the mark back off the paint makes the rolling stop pass again, and this
  // says so. Both drives are committed recordings of the SAME approach — the
  // only difference between them is whether the wheels ever stopped.
  it("the 11.9 km/h roll over the paint does NOT earn it", () => {
    expect(b2DoneOn("mistake-rolling-stop")).toBe(false);
  });

  it("…and the textbook full stop, 4.6 m short of the line, does", () => {
    expect(b2DoneOn("mistake-partial-scan")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The remaining claims of the four templates this pass touched
// ---------------------------------------------------------------------------

/** The templates whose gates this title-honesty pass owns. */
const TOUCHED = new Set([
  "sc-ed-d2-priority-run",
  "sc-vp-telltale-red",
  "sc-signal-redyellow",
  "sc-sig-flash-amber-ped",
]);

/**
 * Claims about ANOTHER road user — a yield, a gap, a clear crossing. No field
 * of SimTick carries another actor's priority or the outcome of a yield, and
 * `stepReachZone` receives no ObjectiveContext, so no value of any param can
 * make one of these true. They belong to the rule engine's trackers
 * (FAILED_TO_YIELD, PEDESTRIAN_NOT_YIELDED), which every one of these
 * templates already cites in its own mistakes[].
 *
 * THE VOCABULARY IS THE VERB, NOT THE NOUN, and that distinction is the whole
 * precision of this rule. A title may NAME an actor as scenery — «Приближи
 * камиона и пътеката с готовност за спиране» promises a speed, and the speed is
 * exactly what the cap measures. What it may not do is certify that the actor
 * was LET THROUGH or WAITED OUT. Three shipped rows sit deliberately outside
 * this matcher for that reason and are not debts:
 *   · sc-rxg-wait   «Изчакай зад стоп-линията пред бариерата» — the wait is at a
 *                   PLACE, and the barrier's own state rides on the tick
 *                   (`railBarred`), so this one is witnessable in principle;
 *   · sc-ft-follow  «Следвай камиона спокойно» — `leadGapM` is on the tick too;
 *   · sc-bsh-approach / sc-acw-pass — the graded half is the authored cap.
 */
const ACTOR_CLAIM =
  /пропусни|след насрещния|когато е свободна|изчакай\s+(?:колата|детето|линейката|пешеходеца|пешеходците|велосипедиста|камиона)|остани зад\s+(?:детето|колата|камиона|велосипедиста)|чак след\s+(?:първия|насрещния|колата)/iu;

/**
 * Rows that certify another road user and are OWNED BY THE TEMPLATE LANE. Same
 * contract as HALT_CLAIM_KNOWN_OPEN: a debt with a name, never a permission.
 * The remedy is the one commit cdb2f71 established for the junctions3/rail rows
 * — the title says what the disc measures, and the duty keeps its grader in the
 * rule engine — so not one of these needs a param changed.
 */
const ACTOR_CLAIM_KNOWN_OPEN: ReadonlyArray<{ specId: string; objectiveId: string; why: string }> =
  [
    {
      specId: "sc-ln-decisive-change",
      objectiveId: "sc-lndc-wait",
      why: "sweep161 mobile-right/08-debrief: «✓ Изчакай колата в съседната лента, вместо да се хвърлиш пред нея 2:12» with no car in that lane in any captured frame. templates-lanes*.ts — the disc measures a place in the right lane at 50 км/ч.",
    },
    {
      specId: "sc-hz-emergency-stop",
      objectiveId: "sc-hzes-finish",
      why: "sweep161 pc-right/08-debrief: «Изчакай детето…» ticked in the same protocol that convicts a collision, on a section the audit found no child in. templates-hazards2.ts; the stimulus is the staged encounter's, not the disc's.",
    },
    {
      specId: "sc-jx-giveway-b1",
      objectiveId: "sc-jxgb-yield",
      why: "sweep161: PC ticks 0 of 3 and mobile 2 of 3 on the same scripted drive. «Пропусни колата с предимство» is a radius-18.5 halt gate — it grades where and how slowly, never whether anyone was let through (FAILED_TO_YIELD does). templates-junctions*.ts.",
    },
    {
      specId: "sc-pe-zone-living",
      objectiveId: "sc-pzl-exit",
      why: "«Пълзи до устието на изхода и пропусни улицата» — the crawl half is the cap, the yield half is PEDESTRIAN_NOT_YIELDED / FAILED_TO_YIELD. templates-pe*.ts.",
    },
    {
      specId: "sc-merge-from-property",
      objectiveId: "sc-mfp-walk-yield",
      why: "«Спри пред тротоара и пропусни пешеходеца» — the stop half is the halt cap, the yield half is the crossing tracker's. templates-merging*.ts.",
    },
    {
      specId: "sc-pe-jaywalker",
      objectiveId: "sc-jay-clear",
      why: "«Премини пътеката след кръстовището, когато е свободна» — the same «когато е свободна» wording this rule already retired from sc-sfap-clear, on a template the four-spec scope never read. templates-pe*.ts.",
    },
    {
      specId: "sc-vu-child-cyclist",
      objectiveId: "sc-vucc-hold-back",
      why: "«Остани зад детето, докато лъкатуши» — a following-distance duty over a wobbling actor; the disc can only say the car got somewhere. templates-vru2.ts.",
    },
    {
      specId: "sc-vu-cyclist-group",
      objectiveId: "sc-vug-back",
      why: "«Прибери се в лентата чак след първия велосипедист» — the runtime vulnerable-pass tracker owns this (VULNERABLE_PASS_*). templates-vru*.ts.",
    },
  ];

/**
 * Claims about THE CAR'S OWN LAMPS. Unlike the actor class this one is not
 * structurally unwitnessable — `SimTick` carries `headlights`, `fogLightsOn`,
 * `isNight`, `rain`, `fog` and `stepReachZone` is handed the whole tick — but
 * `ReachZoneParams` has no field with which a template can DEMAND a lamp, so
 * every one of these rows is graded on place and speed alone.
 *
 * AND THE CAUSE IS UPSTREAM OF THE OBJECTIVE, which is why the repair is not a
 * lamp gate in `stepReachZone`. On `sc-ac-night-lights/pc-right` the sweep
 * recorded «✓ Мини контролната зона осветен 1:56», ИЗДЪРЖАН, 0 наказателни
 * точки, with the СВЕТЛИНИ telltale dim and no beam pool on the road in any of
 * t011/t063/t116/t183 — and the string «Движение нощем без светлини» appears
 * ZERO times in that run's log. The rule engine owns HEADLIGHTS_OFF_AT_NIGHT
 * (основна) and did not fire it either, so the lamp/night channel is not
 * reaching EITHER grader. A gate in this evaluator would read the same blind
 * channel and change nothing.
 */
const LAMP_CLAIM = /осветен(?!ия|ата|ото)|къси светлини|дълги светлини|с фарове/iu;

const LAMP_CLAIM_KNOWN_OPEN: ReadonlyArray<{ specId: string; objectiveId: string; why: string }> = [
  {
    specId: "sc-ac-night-lights",
    objectiveId: "sc-acn-lit",
    why: "«Мини контролната зона осветен» on a cap of 55 alone. Cause: the night/lamp channel (runtime → SimTick.isNight/headlights) — HEADLIGHTS_OFF_AT_NIGHT was silent on the same drive.",
  },
  {
    specId: "sc-ac-rain-lights",
    objectiveId: "sc-acr-lit",
    why: "«Мини контролната зона осветен и съобразен» on a cap of 47; both СВЕТЛИНИ and ЧИСТАЧКИ dim for the whole run and HEADLIGHTS_OFF_IN_RAIN silent. Same channel.",
  },
  {
    specId: "sc-ac-highbeam-lead",
    objectiveId: "sc-ahl-follow",
    why: "«Следвай предната кола с къси светлини» on a cap of 50; sweep161 mobile-wrong earned it at 1:11 on a run with 18 collisions and 180 penalty points. Beam discipline has no grader at all — there is no long-beam telltale in any captured frame.",
  },
];

describe("the touched templates claim only what their gates measure", () => {
  const zones = reachZones(SCENARIO_TEMPLATES.filter((s) => TOUCHED.has(s.id)));

  it("no gate certifies another road user's behaviour", () => {
    // Two rows the audit did not name were found by this rule inside the same
    // four templates and fixed with it: `sc-edpr-leftturn` («…след насрещния»)
    // and `sc-sfap-clear` («…когато е свободна»). Both keep their duty — the
    // left-turn tracker's FAILED_TO_YIELD and the crossing tracker's
    // PEDESTRIAN_NOT_YIELDED — and neither changed a single param.
    const offenders = zones
      .filter((z) => ACTOR_CLAIM.test(z.titleBg))
      .map((z) => `${z.specId}/${z.objectiveId} — "${z.titleBg}"`);
    expect(offenders).toEqual([]);
  });

  it("no gate claims a precision its own disc cannot resolve («плътно»)", () => {
    // «Плътно вдясно» is flush against the kerb. The tightest of these discs is
    // radius 3 (4.5 at L1) around a mark 1.71 m off the lane centre — it proves
    // the SIDE and cannot tell a kerbside rest from a mid-lane one, which is
    // the very pair sc-vp-telltale-red exists to teach apart. (Two sibling rows
    // outside this pass — sc-vp-police-stop/sc-vpps-stop and
    // sc-vp-telltale/sc-vptt-stop — still carry the word on identical geometry.)
    const offenders = zones
      .filter((z) => /плътно/iu.test(z.titleBg))
      .map((z) => `${z.specId}/${z.objectiveId} — "${z.titleBg}" on radius ${z.radiusM}`);
    expect(offenders).toEqual([]);
  });

  it("a stop-line title cuts its credit at the paint (FR-24)", () => {
    const named = zones.filter((z) => /стоп-лини/iu.test(z.titleBg));
    expect(named.length).toBeGreaterThan(0);
    for (const z of named) {
      expect(z.acceptBeforeMarkM, `${z.specId}/${z.objectiveId} names the line`).not.toBeUndefined();
      expect(z.maxSpeedKmh, `${z.specId}/${z.objectiveId} halt cap`).toBeLessThanOrEqual(
        REACH_ZONE_HALT_CAP_KMH,
      );
    }
  });

  it("«намалена скорост» never certifies a speed the same drill bills as too fast", () => {
    // The cross-check that keeps the two halves of the product honest with each
    // other: sc-sig-flash-amber-ped grades PEDESTRIAN_CROSSING_TOO_FAST, whose
    // threshold is the rule engine's own crossingApproachMaxKmh. An approach
    // gate that says «намалена» above that number teaches the offence the same
    // lesson is about to bill — and the compiled cap is printed in the world on
    // the gate bar, so it is an instruction, not a private number.
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-sig-flash-amber-ped")!;
    expect(spec.mistakes?.some((m) => m.codeRefs?.includes("PEDESTRIAN_CROSSING_TOO_FAST"))).toBe(
      true,
    );
    const approach = spec.success.find((o) => o.id === "sc-sfap-approach")!;
    expect(/намалена скорост/iu.test(approach.titleBg)).toBe(true);
    expect((approach.params as { maxSpeedKmh: number }).maxSpeedKmh).toBeLessThanOrEqual(
      DEFAULT_RULE_CONFIG.crossingApproachMaxKmh,
    );
  });
});

// ---------------------------------------------------------------------------
// SWEEP 161 — the same two rules, read over the WHOLE catalogue
// ---------------------------------------------------------------------------

describe("no reachZone in the catalog certifies what its evaluator cannot see", () => {
  const zones = reachZones(SCENARIO_TEMPLATES);

  it("the actor rule has teeth — it catches a claim and spares an actor named as scenery", () => {
    // The failure mode this exists to prevent is a matcher that quietly stops
    // matching, which would make the census below vacuously green. Both halves
    // are asserted, because a matcher that catches EVERYTHING is just as
    // useless: it would turn every row that mentions a lorry into a debt.
    expect(ACTOR_CLAIM.test("Изчакай колата в съседната лента, вместо да се хвърлиш пред нея")).toBe(
      true,
    );
    expect(ACTOR_CLAIM.test("Спри пред тротоара и пропусни пешеходеца")).toBe(true);
    expect(ACTOR_CLAIM.test("Прибери се в лентата чак след първия велосипедист")).toBe(true);
    expect(ACTOR_CLAIM.test("Приближи камиона и пътеката с готовност за спиране")).toBe(false);
    expect(ACTOR_CLAIM.test("Изчакай зад стоп-линията пред бариерата")).toBe(false);
    expect(ACTOR_CLAIM.test("Следвай камиона спокойно")).toBe(false);
  });

  it("every actor claim in the catalog is a NAMED debt — none may appear unlisted", () => {
    const open = new Set(ACTOR_CLAIM_KNOWN_OPEN.map((k) => `${k.specId}/${k.objectiveId}`));
    const offenders = zones
      .filter((z) => ACTOR_CLAIM.test(z.titleBg))
      .filter((z) => !open.has(`${z.specId}/${z.objectiveId}`))
      .map((z) => `${z.specId}/${z.objectiveId} — "${z.titleBg}"`);
    expect(
      offenders,
      `${offenders.length} gate(s) certify another road user with a disc and a speed`,
    ).toEqual([]);
  });

  it("…and every listed debt is still real — a fixed row must lose its entry", () => {
    // The other direction, and the one that stops this list from becoming a
    // graveyard: an entry whose template has since been retitled no longer
    // matches, and leaving it here would hide the next row that does.
    const claiming = new Set(
      zones.filter((z) => ACTOR_CLAIM.test(z.titleBg)).map((z) => `${z.specId}/${z.objectiveId}`),
    );
    const stale = ACTOR_CLAIM_KNOWN_OPEN.filter(
      (k) => !claiming.has(`${k.specId}/${k.objectiveId}`),
    ).map((k) => `${k.specId}/${k.objectiveId} is fixed or gone — delete its entry`);
    expect(stale).toEqual([]);
  });

  it("the lamp rule has teeth — the car's lamps, not an unlit PLACE", () => {
    expect(LAMP_CLAIM.test("Мини контролната зона осветен")).toBe(true);
    expect(LAMP_CLAIM.test("Следвай предната кола с къси светлини")).toBe(true);
    // «неосветения участък» / «осветената зона» describe the WORLD, and the
    // world is exactly what a disc can be drawn around. Three shipped rows use
    // the word that way and are not debts.
    expect(LAMP_CLAIM.test("Мини неосветения участък със съобразена за видимостта скорост")).toBe(
      false,
    );
    expect(LAMP_CLAIM.test("Спри на позицията, в рамките на осветеното")).toBe(false);
    expect(LAMP_CLAIM.test("Приближи неосветената пътека със скорост за видимостта")).toBe(false);
  });

  it("every lamp claim in the catalog is a NAMED debt, and every named debt still real", () => {
    const open = new Set(LAMP_CLAIM_KNOWN_OPEN.map((k) => `${k.specId}/${k.objectiveId}`));
    const claiming = zones.filter((z) => LAMP_CLAIM.test(z.titleBg));
    const offenders = claiming
      .filter((z) => !open.has(`${z.specId}/${z.objectiveId}`))
      .map((z) => `${z.specId}/${z.objectiveId} — "${z.titleBg}"`);
    expect(offenders, "a gate promises a lamp state nothing asks for").toEqual([]);
    const seen = new Set(claiming.map((z) => `${z.specId}/${z.objectiveId}`));
    expect(
      LAMP_CLAIM_KNOWN_OPEN.filter((k) => !seen.has(`${k.specId}/${k.objectiveId}`)).map(
        (k) => `${k.specId}/${k.objectiveId} is fixed or gone — delete its entry`,
      ),
    ).toEqual([]);
  });

  it("no reachZone param can demand a lamp today — the debts above have nowhere to go yet", () => {
    // The load-bearing half of the routing. If `ReachZoneParams` ever grows a
    // lamp demand, this assertion is the one that goes red and sends someone
    // back to LAMP_CLAIM_KNOWN_OPEN to spend it.
    const lampish = zones.filter((z) => LAMP_CLAIM.test(z.titleBg));
    expect(lampish.length).toBeGreaterThan(0);
    for (const z of lampish) {
      const authored = SCENARIO_TEMPLATES.find((s) => s.id === z.specId)!.success.find(
        (o) => o.id === z.objectiveId,
      )!;
      expect(Object.keys(authored.params).sort()).toEqual(
        Object.keys(authored.params)
          .filter((k) => !/light|lamp|beam|headlight|fog/i.test(k))
          .sort(),
      );
    }
  });
});
