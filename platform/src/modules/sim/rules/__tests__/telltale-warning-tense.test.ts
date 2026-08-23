/**
 * THE ROWS THAT ARE ALSO READ BEFORE THE FAULT EXISTS — sweep 161's
 * `sc-rx-tram-left` finding, locked from both directions.
 *
 * WHAT WAS PHOTOGRAPHED. `sc-rx-tram-left/mobile-right/run.log`:
 *
 *     [01-arrival]  0 км/ч  card=hint/peek     · P0км/ч50
 *     [02-briefing] 0 км/ч  card=warning/peek
 *        +1 Коланът не е поставен · Движеше се без поставен колан. …
 *
 * The car was in P and had never moved. `hud/telltaleWarnings.ts` carries a
 * CODE and no prose on purpose — „the prose has exactly one home
 * (rules/catalog.ts, ADR-002)" — and `LessonPlayShell.tsx` prints
 * `spec.explanationBg` + `spec.correctiveBg` on the armed-warning card. So the
 * catalogue row was answering two questions with one string, and the string was
 * written as a verdict on something already done.
 *
 * THE INVARIANT THIS FILE PINS, stated in catalog.ts as TELLTALE_TENSE_NOTE: a
 * row may assert that the car MOVED only if the telltale that prints it cannot
 * arm at a standstill.
 *
 * ===========================================================================
 * 2026-08-23 — THE DERIVATION WAS BLIND TO HALF THE MODULE, AND A FIFTH ROW
 * HAD WALKED IN BEHIND IT
 * ===========================================================================
 * This file used to say the at-risk codes „are DERIVED here… so a fifth
 * telltale, or a changed arming condition, walks into this test without anyone
 * editing it." Both halves of that promise were false, and they failed in the
 * reassuring direction — the suite stayed green while the product regressed:
 *
 *  1. THE DERIVATION DROVE ONE BRANCH. `codesArmedAtStandstill` built its
 *     status with `createDashboardStatus()`, which leaves `conditions`
 *     undefined — so `armedTelltaleWarnings` took the LEGACY single-bit path
 *     (`s.headlightsRequired`), which can only ever emit
 *     HEADLIGHTS_OFF_AT_NIGHT. The live product does not take that path any
 *     more: `hud/dashboardStatus.ts writeDashboardStatus` publishes
 *     `dash.conditions` through a REQUIRED parameter, and the function defaults
 *     its second argument to that field. MEASURED, parked car, engine on,
 *     0 км/ч, lights off:
 *         snow  → lights = HEADLIGHTS_OFF_IN_RAIN
 *         rain  → lights = HEADLIGHTS_OFF_IN_RAIN
 *         night → lights = HEADLIGHTS_OFF_AT_NIGHT
 *         conditions absent (legacy) → HEADLIGHTS_OFF_AT_NIGHT only
 *     The derivation now runs over BOTH branches and all sixteen weather
 *     combinations, and the positive control below asserts the fifth code is in
 *     the set — revert the derivation to the legacy status and that control
 *     goes red instead of the whole file going quiet.
 *
 *  2. THE PROBE COULD NOT SEE THE PHOTOGRAPHED SENTENCE. `MOVEMENT_CLAIM_RE`
 *     listed its verbs capitalised and carried no `i` flag, so it matched
 *     „Движеше се…" at the head of a string and missed „…, а караше…" in the
 *     middle of one. The offending row said exactly the latter. Fixed, with the
 *     literal string as a negative control at the bottom of this file.
 *
 *  3. AND A CODE THAT TWO WEATHERS ROUTE TO MAY NOT NAME ONE OF THEM AS FACT.
 *     `headlightDutyCode` maps the rain arm AND the snowfall arm onto
 *     HEADLIGHTS_OFF_IN_RAIN (чл. 70, ал. 1 is one duty), and the telltale card
 *     has no per-event channel, so it never sees `engine.ts`'s SNOW_LIGHTS_COPY
 *     override. The old row opened „Валеше…" and was therefore printed, as
 *     fact, during a snowfall. The last describe below derives which weather
 *     flags each code was armed under and refuses any claim that is false in
 *     one of them.
 *
 * THE MEASUREMENT: the parked-armed set was 3 codes and 3 of them opened with a
 * movement verb before the first fix (belt „Движеше се…", lights „Движеше
 * се…", fog „Караше…"); it is 4 codes and 0 movement verbs after this one.
 * Restore any of those four strings in catalog.ts and the first measurement
 * below goes red naming it.
 */

import { describe, expect, it } from "vitest";

import { createDashboardStatus, type DashboardStatus } from "../../hud/dashboardStatus";
import { armedTelltaleWarnings, type TelltaleConditions } from "../../hud/telltaleWarnings";
import { VIOLATIONS } from "../catalog";
import type { ViolationCode } from "../types";

/**
 * Bulgarian past-tense (аорист/имперфект, 2 sg) assertions that the car was
 * ALREADY under way. Deliberately narrow: only verbs that claim motion, so a
 * row may still say «Коланът не е поставен» or explain a risk in any tense.
 *
 * `\b` IS NOT USABLE HERE and the mistake is worth recording, because it fails
 * SILENTLY in the reassuring direction: JavaScript's `\b` is defined against
 * ASCII word characters, so „Движеше" at the start of a string has no boundary
 * before Д and the pattern matched nothing at all — a probe that reports a
 * clean catalogue whatever it is fed. The Unicode letter class is the working
 * form, and the negative controls in the last test exist to catch a relapse.
 *
 * THE `i` FLAG IS THE SAME LESSON A SECOND TIME (2026-08-23). Without it the
 * alternation only matched a verb at the head of a sentence, where Bulgarian
 * capitalises it — and „Валеше, а караше без къси светлини" puts the movement
 * claim in the middle, lowercase. The probe read that row as clean.
 */
const MOVEMENT_CLAIM_RE =
  /(?:^|[^\p{L}])(Движеше се|Караше|Потегли|Пресече|Навлезе|Подмина|Премина|Влезе|Отклони се)(?!\p{L})/iu;

/**
 * „It is raining", stated as fact about the drive in front of the student —
 * the claim the lights row may not make, because the same row is printed during
 * a snowfall. A LIST of conditions („дъжд, снеговалеж или мъгла") is not this:
 * naming the weathers a duty covers asserts nothing about today's, which is
 * what the negative controls at the bottom pin.
 */
const RAIN_AS_FACT_RE = /(?:^|[^\p{L}])(валеше|вали)(?!\p{L})(?!\s+сняг)/iu;

/** The cabin as it sits on the briefing screen: engine running, still in P. */
function parkedWithEngineOn(over: Partial<DashboardStatus> = {}): DashboardStatus {
  return { ...createDashboardStatus(), engineOn: true, speedKmh: 0, ...over };
}

/**
 * Every weather the compiler can hand a lesson. `compile.ts` makes rain / snow
 * / fog exclusive and night orthogonal, but this enumerates all sixteen anyway:
 * the point is to drive the MODULE's precedence, not to restate the compiler's
 * invariant here where a change to it would go unnoticed.
 */
const WEATHER_COMBOS: TelltaleConditions[] = [false, true].flatMap((isNight) =>
  [false, true].flatMap((rain) =>
    [false, true].flatMap((snow) => [false, true].map((fog) => ({ isNight, rain, snow, fog }))),
  ),
);

/**
 * The parked cabin under one weather, with the two LEGACY bits written exactly
 * the way `writeDashboardStatus` writes them (`isNight || rain`, `fog`) — so
 * the fallback branch is exercised honestly rather than with flags no scene
 * would publish. `conditions: null` is the pre-O35 caller: no conditions at
 * all, both bits forced on, which is the status this file used to drive alone.
 */
function parkedIn(conditions: TelltaleConditions | null): DashboardStatus {
  const base: Partial<DashboardStatus> = {
    seatbeltOn: false,
    headlights: "off",
    fogLightsOn: false,
    parkingBrakeOn: true,
  };
  if (conditions === null) {
    return parkedWithEngineOn({ ...base, headlightsRequired: true, fogLightsRequired: true });
  }
  return parkedWithEngineOn({
    ...base,
    conditions,
    headlightsRequired: conditions.isNight || conditions.rain,
    fogLightsRequired: conditions.fog,
  });
}

interface ArmedAt {
  code: ViolationCode;
  /** The weather it was armed under; null = the legacy, conditions-less call. */
  conditions: TelltaleConditions | null;
}

/** Every (code, weather) pair the module arms while the car has not moved. */
function armedAtStandstill(): ArmedAt[] {
  const out: ArmedAt[] = [];
  for (const conditions of [null, ...WEATHER_COMBOS]) {
    for (const w of armedTelltaleWarnings(parkedIn(conditions))) {
      if (w.code !== null) out.push({ code: w.code, conditions });
    }
  }
  return out;
}

/** Codes whose warning card can be printed while the car has not moved. */
function codesArmedAtStandstill(): ViolationCode[] {
  const out: ViolationCode[] = [];
  for (const a of armedAtStandstill()) if (!out.includes(a.code)) out.push(a.code);
  return out;
}

/** The same, restricted to the legacy (conditions-less) call. */
function codesArmedLegacyOnly(): ViolationCode[] {
  const out: ViolationCode[] = [];
  for (const w of armedTelltaleWarnings(parkedIn(null))) {
    if (w.code !== null && !out.includes(w.code)) out.push(w.code);
  }
  return out;
}

describe("a telltale that can fire on a parked car may not print a verdict", () => {
  it("POSITIVE CONTROL: the parked cabin really does arm warnings, and they carry codes", () => {
    // Without this, every assertion below would pass over an empty list — the
    // shape of false pass this sweep exists to refuse.
    const armed = codesArmedAtStandstill();
    expect(armed.length).toBeGreaterThan(0);
    expect(armed).toContain("SEATBELT_OFF_WHILE_MOVING");
    expect(armed).toContain("HEADLIGHTS_OFF_AT_NIGHT");
    expect(armed).toContain("FOG_LIGHTS_OFF_IN_FOG");
  });

  it("THE FIFTH ROW: the rain/snow lights code arms parked too, and only via `conditions`", () => {
    // This is the assertion that fails the day someone narrows the derivation
    // back to `createDashboardStatus()`. The code is unreachable on the legacy
    // branch by construction (it emits HEADLIGHTS_OFF_AT_NIGHT unconditionally),
    // so a test that drives only that branch reports a three-row catalogue and
    // never sees the row the product actually prints.
    expect(codesArmedLegacyOnly()).not.toContain("HEADLIGHTS_OFF_IN_RAIN");
    expect(codesArmedAtStandstill()).toContain("HEADLIGHTS_OFF_IN_RAIN");
    // …and it is the SNOWFALL arm too, which is why the row may not say „дъжд"
    // as fact (last describe): чл. 70, ал. 1 is one duty and `headlightDutyCode`
    // routes both weathers to this one code.
    const snowCodes = armedTelltaleWarnings(
      parkedIn({ isNight: false, rain: false, snow: true, fog: false }),
    ).map((w) => w.code);
    expect(snowCodes).toContain("HEADLIGHTS_OFF_IN_RAIN");
  });

  it("THE MEASUREMENT: parked-armed rows claiming movement — was 3, now 0", () => {
    const offenders = codesArmedAtStandstill().filter((code) =>
      MOVEMENT_CLAIM_RE.test(VIOLATIONS[code].explanationBg),
    );
    expect(
      offenders,
      offenders.length === 0
        ? ""
        : `${offenders.join(", ")} print a past-tense movement claim on a card that ` +
          `fires while the car is still in P (sc-rx-tram-left/mobile-right/run.log).`,
    ).toEqual([]);
  });

  it("the corrective on those rows is safe in both readings too", () => {
    // Same card prints correctiveBg directly under the explanation.
    for (const code of codesArmedAtStandstill()) {
      expect(VIOLATIONS[code].correctiveBg, code).not.toMatch(MOVEMENT_CLAIM_RE);
    }
  });

  it("THE OTHER DIRECTION: the rows still teach the fault they are about", () => {
    // A row emptied of its claim would satisfy the test above and teach nothing.
    // THEO-4: never a bare verdict, and never a bare non-verdict either.
    expect(VIOLATIONS.SEATBELT_OFF_WHILE_MOVING.explanationBg).toMatch(/колан/i);
    expect(VIOLATIONS.HEADLIGHTS_OFF_AT_NIGHT.explanationBg).toMatch(/светлин/i);
    expect(VIOLATIONS.HEADLIGHTS_OFF_IN_RAIN.explanationBg).toMatch(/светлин/i);
    expect(VIOLATIONS.HEADLIGHTS_OFF_IN_RAIN.explanationBg).toMatch(/видимост/i);
    expect(VIOLATIONS.FOG_LIGHTS_OFF_IN_FOG.explanationBg).toMatch(/мъгла/i);
    for (const code of codesArmedAtStandstill()) {
      expect(VIOLATIONS[code].explanationBg.length, code).toBeGreaterThan(80);
      expect(VIOLATIONS[code].titleBg.length, code).toBeGreaterThan(0);
    }
  });
});

describe("a row two weathers route to may not name one of them as fact", () => {
  it("THE MEASUREMENT: rows asserting a weather that is false where they print — was 1, now 0", () => {
    // Derived, not listed: group the armed pairs by code and ask whether the
    // code was ever armed with rain === false. If it was, the row is printed in
    // dry weather and may not state that it is raining.
    const offenders = new Set<ViolationCode>();
    for (const { code, conditions } of armedAtStandstill()) {
      if (conditions === null || conditions.rain) continue;
      if (RAIN_AS_FACT_RE.test(VIOLATIONS[code].explanationBg)) offenders.add(code);
    }
    expect(
      [...offenders],
      `${[...offenders].join(", ")} state „вали" on a card the module also arms when ` +
        `rain === false (snowfall — engine.ts lowBeamDuty routes both arms to one code, ` +
        `and the telltale card never sees SNOW_LIGHTS_COPY).`,
    ).toEqual([]);
  });

  it("THE CONTROL: the code really is armed under a dry weather, so the check has bite", () => {
    // Without this the test above would pass over an empty loop the moment the
    // snow arm stopped arming — the same silent-clean failure as the derivation.
    const dryArms = armedAtStandstill().filter(
      (a) => a.code === "HEADLIGHTS_OFF_IN_RAIN" && a.conditions !== null && !a.conditions.rain,
    );
    expect(dryArms.length).toBeGreaterThan(0);
  });

  it("naming the weathers a duty covers is not claiming today's", () => {
    // The detector must not be satisfiable by deleting „дъжд" from the row: the
    // repaired string still names rain, snowfall and fog as the conditions the
    // duty binds under, and that is teaching, not a false statement of fact.
    expect(VIOLATIONS.HEADLIGHTS_OFF_IN_RAIN.explanationBg).toMatch(/дъжд/);
    expect(RAIN_AS_FACT_RE.test(VIOLATIONS.HEADLIGHTS_OFF_IN_RAIN.explanationBg)).toBe(false);
  });
});

describe("the check may not become one every row passes", () => {
  it("THE CONTROL: the handbrake telltale needs movement, and its row still says so", () => {
    // It cannot appear on a stopped car…
    const parked = armedTelltaleWarnings(
      parkedWithEngineOn({ parkingBrakeOn: true, seatbeltOn: true }),
    );
    expect(parked.map((w) => w.id)).not.toContain("handbrake");
    // …and it does appear once the car is rolling with the lever up.
    const rolling = armedTelltaleWarnings(
      parkedWithEngineOn({ speedKmh: 20, parkingBrakeOn: true, seatbeltOn: true }),
    );
    expect(rolling.map((w) => w.id)).toContain("handbrake");
    // So its verdict is TRUE wherever it is printed, and must survive.
    expect(codesArmedAtStandstill()).not.toContain("HANDBRAKE_LEFT_ON");
    expect(VIOLATIONS.HANDBRAKE_LEFT_ON.explanationBg).toMatch(MOVEMENT_CLAIM_RE);
  });

  it("the probe can still see a movement claim — it is not a regex that matches nothing", () => {
    // Negative control on the detector itself (the eighth-instrument rule): a
    // pattern that has stopped matching would report a clean catalogue.
    expect(MOVEMENT_CLAIM_RE.test("Движеше се без поставен колан.")).toBe(true);
    expect(MOVEMENT_CLAIM_RE.test("Караше в гъста мъгла без фарове.")).toBe(true);
    // THE SENTENCE THE OLD PROBE READ AS CLEAN — lowercase, mid-string.
    expect(MOVEMENT_CLAIM_RE.test("Валеше, а караше без къси светлини.")).toBe(true);
    expect(MOVEMENT_CLAIM_RE.test("Коланът трябва да е закопчан.")).toBe(false);
    // And it is still finding claims elsewhere in the catalogue — the rule is
    // about the telltale rows, not about the file.
    const claiming = Object.values(VIOLATIONS).filter((v) =>
      MOVEMENT_CLAIM_RE.test(v.explanationBg),
    );
    expect(claiming.length).toBeGreaterThan(5);
  });

  it("the weather probe is not a regex that matches nothing either", () => {
    expect(RAIN_AS_FACT_RE.test("Валеше, а караше без къси светлини.")).toBe(true);
    expect(RAIN_AS_FACT_RE.test("Вали, а светлините не са включени.")).toBe(true);
    // „вали сняг" is the snow claim, not the rain one — and a bare mention of
    // дъжд in a list of conditions is neither.
    expect(RAIN_AS_FACT_RE.test("Валеше сняг, а караше без къси светлини.")).toBe(false);
    expect(RAIN_AS_FACT_RE.test("При намалена видимост — дъжд, сняг или мъгла.")).toBe(false);
  });
});
