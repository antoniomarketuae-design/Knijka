/**
 * Session-end forward actions (sessionEndCtas.ts) — the row the end screen
 * renders after a green scenario rung.
 *
 * What must not regress is the WEIGHT contract: exactly one accent, „Повтори"
 * demoted only when something actually leads forward, and a withheld target
 * (star-locked rung — doc 76 §8) simply absent rather than rendered dead.
 */

import { describe, expect, it, vi } from "vitest";
import { retryCtaClass, scenarioCtaRow } from "../sessionEndCtas";

const level = { labelBg: "Паркиране на заден ход · Ниво 2", onStart: () => {} };
const template = { labelBg: "Пешеходна пътека · Ниво 1", onStart: () => {} };

describe("scenarioCtaRow", () => {
  it("renders both targets — rung first and accented, next card neutral", () => {
    const row = scenarioCtaRow({ level, template });
    expect(row.map((c) => c.id)).toEqual(["level", "template"]);
    expect(row.map((c) => c.className)).toEqual(["btn-accent", "btn-ghost"]);
    // Each button says what KIND of step it is AND names where it lands —
    // the founder's complaint was that one button hid two destinations.
    expect(row[0].leadBg).toBe("Следващо ниво");
    expect(row[0].labelBg).toBe(level.labelBg);
    expect(row[1].leadBg).toBe("Следващ сценарий");
    expect(row[1].labelBg).toBe(template.labelBg);
  });

  it("promotes the lone survivor to the accent when the rung is withheld", () => {
    // Star-locked (or top-of-ladder): only the next card — and it must not
    // read as optional next to „Повтори".
    const row = scenarioCtaRow({ level: null, template });
    expect(row).toHaveLength(1);
    expect(row[0]).toMatchObject({ id: "template", className: "btn-accent" });
  });

  it("promotes a lone rung too (last card in the catalog, ladder unfinished)", () => {
    const row = scenarioCtaRow({ level, template: null });
    expect(row).toHaveLength(1);
    expect(row[0]).toMatchObject({ id: "level", className: "btn-accent" });
  });

  it("renders no forward action when neither target exists", () => {
    expect(scenarioCtaRow({ level: null, template: null })).toEqual([]);
    expect(scenarioCtaRow({})).toEqual([]);
  });

  it("never emits two accents", () => {
    for (const targets of [{ level, template }, { level }, { template }, {}]) {
      const accents = scenarioCtaRow(targets).filter((c) => c.className === "btn-accent");
      expect(accents.length).toBeLessThanOrEqual(1);
    }
  });

  it("wires each button to its own target's handler", () => {
    const onLevel = vi.fn();
    const onTemplate = vi.fn();
    const row = scenarioCtaRow({
      level: { labelBg: "A", onStart: onLevel },
      template: { labelBg: "B", onStart: onTemplate },
    });
    row[1].onStart();
    expect(onTemplate).toHaveBeenCalledOnce();
    expect(onLevel).not.toHaveBeenCalled();
  });
});

describe("retryCtaClass", () => {
  it("keeps Повтори primary only when nothing leads forward", () => {
    expect(retryCtaClass(scenarioCtaRow({}))).toBe("btn-accent");
  });

  it("demotes Повтори as soon as any forward action shows", () => {
    expect(retryCtaClass(scenarioCtaRow({ template }))).toBe("btn-ghost");
    expect(retryCtaClass(scenarioCtaRow({ level, template }))).toBe("btn-ghost");
  });
});
