/**
 * THE BADGE, AS RENDERED — not as stored.
 *
 * ── The defect ──────────────────────────────────────────────────────────────
 * `sc-pe-parked-row-scan / mistake-fast-row` shows a student holding ~50 km/h
 * past a row of parked cars, a child stepping out between two of them, and the
 * car HITTING HER — a real rectangle strike since the geometry wave, 0.113 m
 * inside her, not a scripted beat. The card the student reads was badged
 *
 *     «второстепенна грешка · −1 изпитна т.»,  no termination line,
 *     law chip «ЗДвП чл. 21, ал. 1», mark «т. 10, б. „б“»
 *
 * because `MistakeConsequenceOverlay` took `demo.codeRefs[0]` — and this demo
 * lists SPEEDING_OVER_LIMIT first, since that is the fault its lesson opens
 * with. Its own stored prose, three lines below the badge, said „Трето, ударът
 * прекратява изпита." Under Наредба № 38 the sheet is priced by the CLASS of
 * the fault (приложение № 5, т. 10) and a ПТП ends the exam under чл. 48, ал. 3;
 * „first-listed" is an editorial fact, not a legal one. THEO-4: a badge that
 * misprices what the student has just watched is worse than no badge.
 *
 * ── And the live path was wrong differently ─────────────────────────────────
 * Driven (the recorded fast-row drive through the real sandbox session), the
 * three detectors fire PEDESTRIAN_CROSSING_TOO_FAST @7.5333 s,
 * SPEEDING_OVER_LIMIT @7.5667 s, COLLISION @8.15 s, and the engine's one-shot
 * `mistakeMoment` latches the FIRST — so the badge read «опасна · −10» but with
 * чл. 119 in the law chip and STILL no чл. 48, ал. 3 rider, decided by a 33 ms
 * race between two detectors. Both paths are covered below.
 *
 * ── Why this file renders instead of reading source ─────────────────────────
 * The defect was invisible in the JSON and visible on the card. `environment`
 * is node and there is no DOM, so this uses `renderToStaticMarkup` — enough to
 * assert the STRING that reaches the student, which is the whole claim.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MistakeConsequenceOverlay } from "./MistakeConsequenceOverlay";
import type { MistakeDemo, TeachMoment } from "@/modules/sim/lessons";
import { SCENARIO_TEMPLATES } from "@/modules/sim/lessons/scenario/templates";
import { VIOLATIONS, gravestViolation } from "@/modules/sim/rules";
import type { ViolationCode } from "@/modules/sim/rules";

/** Visible text of the card, tags stripped. */
function cardText(demo: MistakeDemo, moment: TeachMoment | null): string {
  const html = renderToStaticMarkup(
    <MistakeConsequenceOverlay
      demo={demo}
      districtId="pe-child-v1"
      moment={moment}
      onRetryCorrect={null}
      onDismiss={() => {}}
    />,
  );
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

function demoOf(templateId: string, index: number): MistakeDemo {
  const t = SCENARIO_TEMPLATES.find((s) => s.id === templateId);
  expect(t, `${templateId} not registered`).toBeDefined();
  const m = t!.mistakes[index];
  expect(m, `${templateId} has no mistake #${index}`).toBeDefined();
  return m;
}

/** A live moment exactly as engine.ts builds one for `code`. */
function momentFor(code: ViolationCode): TeachMoment {
  const spec = VIOLATIONS[code];
  return {
    code,
    scenarioId: null,
    titleBg: spec.titleBg,
    explanationBg: spec.explanationBg,
    lawRef: spec.lawRef,
    severity: spec.severityClass,
    points: spec.points,
    t: 7.53,
  };
}

const FAST_ROW = () => demoOf("sc-pe-parked-row-scan", 0);

describe("the card that ends with a child under the bumper", () => {
  it("leads with the strike — the founder's ruling of 2026-08-10", () => {
    // THE ORDER FLIPPED, AND THE FLIP IS THE POINT. Until the exact-contact
    // geometry landed, the 1.5 m isotropic circle measured from the car's
    // CENTRE while its nose sat 2.02 m further forward, so the engine never saw
    // the child and this card was authored around a speeding fault. The founder
    // ruled the demo must LEAD with the strike, with the speed as its cause.
    // Pinned so the ruling cannot be quietly undone.
    expect(FAST_ROW().codeRefs).toEqual([
      "COLLISION",
      "PEDESTRIAN_CROSSING_TOO_FAST",
      "SPEEDING_OVER_LIMIT",
    ]);
    expect(VIOLATIONS.SPEEDING_OVER_LIMIT.severityClass).toBe("vtorostepenna");
  });

  it("badges «опасна · −10» in EITHER order — the derivation, not the typing", () => {
    // This is what rules/gravest.ts is for, and the reason the pin above is
    // safe to change: the badge must not depend on which code someone typed
    // first. Before the derivation existed this card read «второстепенна · −1»
    // — minus one point — while a child lay under the bumper, purely because
    // SPEEDING_OVER_LIMIT happened to head the list.
    const ruled = FAST_ROW();
    const reversed = { ...ruled, codeRefs: [...ruled.codeRefs].reverse() };
    for (const demo of [ruled, reversed]) {
      const text = cardText(demo, null);
      expect(text).toContain("опасна грешка · −10 изпитни т.");
      expect(text).not.toContain("второстепенна грешка · −1");
    }
  });

  it("demonstration path: badges «опасна · −10», not «второстепенна · −1»", () => {
    const text = cardText(FAST_ROW(), null);
    expect(text).toContain("опасна грешка · −10 изпитни т.");
    expect(text).not.toContain("второстепенна грешка · −1");
  });

  it("demonstration path: prints the чл. 48, ал. 3 rider its own prose promises", () => {
    const text = cardText(FAST_ROW(), null);
    expect(text).toContain("Наредба № 38, чл. 48, ал. 3");
    expect(text).toContain("при допускане на ПТП");
  });

  it("demonstration path: the rule chip and the mark chip name the same fault", () => {
    const text = cardText(FAST_ROW(), null);
    expect(text).toContain(`правило: ${VIOLATIONS.COLLISION.lawRef}`);
    expect(text).toContain("т. 10, б. „в“"); // опасна clause, not б. „б“
    expect(text).not.toContain(`правило: ${VIOLATIONS.SPEEDING_OVER_LIMIT.lawRef}`);
  });

  it("live path: the 33 ms detector race no longer decides the badge", () => {
    // The code the engine actually latches on this drive. Its own charge is
    // опасна/10 — but it does not end the exam, and the card must say the
    // collision's sentence because the collision is on the card.
    const text = cardText(FAST_ROW(), momentFor("PEDESTRIAN_CROSSING_TOO_FAST"));
    expect(text).toContain("Какво направи"); // the live header, not the demo one
    expect(text).toContain("опасна грешка · −10 изпитни т.");
    expect(text).toContain("Наредба № 38, чл. 48, ал. 3");
    expect(text).toContain(`правило: ${VIOLATIONS.COLLISION.lawRef}`);
  });

  it("live path: even the mildest latched code cannot under-price the card", () => {
    const text = cardText(FAST_ROW(), momentFor("SPEEDING_OVER_LIMIT"));
    expect(text).toContain("опасна грешка · −10 изпитни т.");
    expect(text).toContain("Наредба № 38, чл. 48, ал. 3");
  });
});

describe("the card that was already corrected BY REORDERING reads the same", () => {
  // `sc-hz-brake-dont-swerve/mistake-blind-swerve` was mended by moving
  // COLLISION to index 0. The derivation makes that move a no-op — which is the
  // point: the next author to prepend a code must not be able to re-price it.
  const demo = () => demoOf("sc-hz-brake-dont-swerve", 0);

  it("still «опасна · −10» with the чл. 48, ал. 3 rider", () => {
    const text = cardText(demo(), null);
    expect(text).toContain("опасна грешка · −10 изпитни т.");
    expect(text).toContain("Наредба № 38, чл. 48, ал. 3");
  });

  it("and would read identically with its codes back in the old order", () => {
    const reordered: MistakeDemo = { ...demo(), codeRefs: [...demo().codeRefs].reverse() };
    expect(cardText(reordered, null)).toBe(cardText(demo(), null));
  });
});

describe("no demo card can be under-badged by its authoring order", () => {
  const demos = SCENARIO_TEMPLATES.flatMap((t) =>
    t.mistakes.map((m, i) => ({ id: `${t.id}#${i}`, m })),
  );

  it("covers every registered mistake demo", () => {
    expect(demos.length).toBeGreaterThan(300);
  });

  it("the gravest cited fault is what prices each card, whatever the order", () => {
    for (const { id, m } of demos) {
      const forward = gravestViolation(m.codeRefs);
      const backward = gravestViolation([...m.codeRefs].reverse());
      expect(forward, id).not.toBeNull();
      expect(backward!.spec.severityClass, id).toBe(forward!.spec.severityClass);
      expect(backward!.spec.points, id).toBe(forward!.spec.points);
      expect(backward!.spec.terminateSession === true, id).toBe(
        forward!.spec.terminateSession === true,
      );
      // …and nothing it cites is graver than the winner.
      for (const c of m.codeRefs) {
        expect(VIOLATIONS[c as ViolationCode].points, `${id} / ${c}`).toBeLessThanOrEqual(
          forward!.spec.points,
        );
      }
    }
  });

  it("every card that shows a ПТП prints the чл. 48, ал. 3 rider", () => {
    // The rider is the sentence the fast-row card was missing. It is a per-code
    // fact, so this is a census, not a class rule.
    for (const { id, m } of demos) {
      if (!m.codeRefs.includes("COLLISION")) continue;
      expect(gravestViolation(m.codeRefs)!.spec.terminateSession, id).toBe(true);
    }
  });
});
