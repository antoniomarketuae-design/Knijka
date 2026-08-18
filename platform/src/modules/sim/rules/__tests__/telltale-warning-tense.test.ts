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
 * WHY IT IS NOT A STYLE RULE APPLIED TO A REMEMBERED LIST. The at-risk codes
 * are DERIVED here, by driving `armedTelltaleWarnings` with a stationary,
 * engine-on cabin and reading back what it arms — so a fifth telltale, or a
 * changed arming condition, walks into this test without anyone editing it.
 * And the fourth telltale is the CONTROL: HANDBRAKE_LEFT_ON needs `moving`, so
 * it never appears in the parked set, its «Потегли с вдигната ръчна спирачка»
 * is correct, and a check that scrubbed the past tense out of all four would be
 * the same defect pointed the other way. That row is asserted to KEEP its past
 * tense, which is what stops this file from being satisfiable by loosening
 * every string until nothing asserts anything.
 *
 * THE MEASUREMENT: the parked set was 3 codes and 3 of them opened with a
 * movement verb before the fix (belt „Движеше се…", lights „Движеше се…", fog
 * „Караше…"); it is 3 codes and 0 movement verbs after it. Restore any one of
 * those three strings in catalog.ts and the first test below goes red naming it.
 */

import { describe, expect, it } from "vitest";

import { createDashboardStatus, type DashboardStatus } from "../../hud/dashboardStatus";
import { armedTelltaleWarnings } from "../../hud/telltaleWarnings";
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
 */
const MOVEMENT_CLAIM_RE =
  /(?:^|[^\p{L}])(Движеше се|Караше|Потегли|Пресече|Навлезе|Подмина|Премина|Влезе|Отклони се)(?!\p{L})/u;

/** The cabin as it sits on the briefing screen: engine running, still in P. */
function parkedWithEngineOn(over: Partial<DashboardStatus> = {}): DashboardStatus {
  return { ...createDashboardStatus(), engineOn: true, speedKmh: 0, ...over };
}

/** Codes whose warning card can be printed while the car has not moved. */
function codesArmedAtStandstill(): ViolationCode[] {
  const s = parkedWithEngineOn({
    seatbeltOn: false,
    headlightsRequired: true,
    headlights: "off",
    fogLightsRequired: true,
    fogLightsOn: false,
    parkingBrakeOn: true,
  });
  const out: ViolationCode[] = [];
  for (const w of armedTelltaleWarnings(s)) {
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

  it("THE MEASUREMENT: 3 of the parked-armed rows claimed movement, now 0", () => {
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
    expect(VIOLATIONS.FOG_LIGHTS_OFF_IN_FOG.explanationBg).toMatch(/мъгла/i);
    for (const code of codesArmedAtStandstill()) {
      expect(VIOLATIONS[code].explanationBg.length, code).toBeGreaterThan(80);
      expect(VIOLATIONS[code].titleBg.length, code).toBeGreaterThan(0);
    }
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
    expect(MOVEMENT_CLAIM_RE.test("Коланът трябва да е закопчан.")).toBe(false);
    // And it is still finding claims elsewhere in the catalogue — the rule is
    // about four telltale rows, not about the file.
    const claiming = Object.values(VIOLATIONS).filter((v) =>
      MOVEMENT_CLAIM_RE.test(v.explanationBg),
    );
    expect(claiming.length).toBeGreaterThan(5);
  });
});
