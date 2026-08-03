/**
 * A LOOK at „Моите покупки", not just a typecheck — the R0 rule: something
 * nobody rendered is not done, and this is a screen about someone's money.
 *
 * The three states are the three conversations this panel exists to make
 * possible, and each has a code path that can silently produce nothing.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PurchaseRow } from "@/modules/payments";
import { PurchasesPanelView } from "./purchases-panel";

const SESSION = "cs_test_9aBcDeF";

const paid: PurchaseRow = {
  reference: SESSION,
  pack: "core",
  packNameBg: "Основен пакет",
  at: new Date("2026-09-14T10:00:00.000Z"),
  granted: true,
  expiresAt: new Date("2027-01-14T10:00:00.000Z"),
  amountCents: 1299,
  currency: "eur",
  status: "paid",
  provider: "stripe",
  livemode: true,
};

const render = (rows: PurchaseRow[]) =>
  renderToStaticMarkup(<PurchasesPanelView rows={rows} />);

describe("Моите покупки — the panel a student reads about her own money", () => {
  it("names itself and says something even with nothing to show", () => {
    const html = render([]);
    expect(html).toContain("Моите покупки");
    expect(html).toContain("Още нямаш покупки");
    // A student who believes she paid needs a next step from THIS screen.
    expect(html).toContain("пиши ни");
    expect(html).toContain("/pricing");
  });

  it("puts pack, date, amount and reference of a real purchase on screen", () => {
    const html = render([paid]);
    expect(html).toContain("Основен пакет");
    expect(html).toContain("12,99 €");
    // Bulgarian long-form date, Europe/Sofia.
    expect(html).toContain("септември");
    expect(html).toContain("2026");
    // THE reference: the same string in her mail to us and in his Stripe search.
    expect(html).toContain(SESSION);
    expect(html).toContain("Достъп до");
  });

  it("does NOT hide a receipt with no access behind it — it explains it", () => {
    const orphan: PurchaseRow = {
      ...paid,
      reference: "cs_orphan_1",
      granted: false,
      expiresAt: null,
    };
    const html = render([orphan]);

    // The row that must never be silently dropped: showing her an empty panel
    // would read as "you never paid".
    expect(html).toContain("cs_orphan_1");
    expect(html).toContain("Плащането е получено, но достъпът не е активиран");
    expect(html).toContain("12,99 €");
  });

  it("shows a promo grant without inventing an amount", () => {
    const promo: PurchaseRow = {
      ...paid,
      reference: "ent-1",
      amountCents: null,
      currency: null,
      status: null,
      provider: "promo",
      livemode: null,
    };
    const html = render([promo]);
    expect(html).toContain("ent-1");
    expect(html).not.toContain("€");
  });

  it("labels a TEST-MODE payment as one, on the student's own screen", () => {
    const html = render([{ ...paid, livemode: false }]);
    expect(html).toContain("тестов");
  });

  it("renders one row per purchase, newest first as given", () => {
    const html = render([
      { ...paid, reference: "cs_new" },
      { ...paid, reference: "cs_old" },
    ]);
    expect(html.indexOf("cs_new")).toBeLessThan(html.indexOf("cs_old"));
    expect(html.match(/<li /g) ?? []).toHaveLength(2);
  });
});
