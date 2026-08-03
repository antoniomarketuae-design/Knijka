/**
 * A LOOK at the review screen, not just a typecheck (the R0 rule: something
 * nobody rendered is not done). This renders the real component with the real
 * bank behind it and asserts that the four things a reviewer needs are actually
 * on the page — the honest census, the row, what changed, and the verbatim
 * statute text. Every one of those has a code path that can silently produce
 * nothing, and a blank card still looks like a working review tool.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

const { listFlaggedQuestions } = await import("@/modules/content-admin");
const { ReviewClient } = await import("./ReviewClient");

describe("the review screen renders something a human can act on", () => {
  it("puts the honest number at the top, not the flag's number", async () => {
    const result = await listFlaggedQuestions({ queue: "unsigned", pageSize: 3 });
    const html = renderToStaticMarkup(<ReviewClient result={result} />);

    expect(html).toContain("Подписани от човек");
    expect(html).toContain(`от ${result.census.total}`);
    // The unsigned pile is named on screen in the words it deserves.
    expect(html).toContain("никой не го е подписвал");
  });

  it("renders each queued row with its options, key and explanation", async () => {
    const result = await listFlaggedQuestions({ queue: "unsigned", pageSize: 3 });
    const html = renderToStaticMarkup(<ReviewClient result={result} />);

    for (const q of result.flagged) {
      expect(html).toContain(q.id);
      expect(html).toContain("Обяснение");
    }
    expect(html).toContain("Одобри и подпиши");
    expect(html).toContain("Върни за преправяне");
  });

  it("shows the retrieved statute text, verbatim, on the card", async () => {
    const result = await listFlaggedQuestions({ queue: "unsigned", pageSize: 8 });
    const html = renderToStaticMarkup(<ReviewClient result={result} />);
    expect(html).toContain("Източникът, дословно");

    const resolved = result.flagged.flatMap((q) => q.lawEvidence).filter((l) => l.found);
    expect(resolved.length).toBeGreaterThan(0);
    // A distinctive run of real act text, so this cannot pass on a heading.
    // Picked free of characters React escapes, so the assertion tests the page
    // and not my knowledge of HTML entities.
    const sample = resolved
      .flatMap((l) => (l.textBg as string).split(/[^\p{L} ]+/u))
      .map((s) => s.trim())
      .find((s) => s.length >= 25);
    expect(sample, "no clean text run to sample").toBeTruthy();
    expect(html).toContain(sample as string);
  });

  it("shows a real before/after when the fix wave rewrote a row", async () => {
    const result = await listFlaggedQuestions({ queue: "needs-review", pageSize: 20 });
    const html = renderToStaticMarkup(<ReviewClient result={result} />);
    const changed = result.flagged.filter((q) => q.diff.kind === "changed");
    if (changed.length === 0) {
      // Nothing was edited since the baseline — the screen must still say so
      // rather than showing an empty box.
      expect(html).toMatch(/Без промяна спрямо|Нов въпрос|git сравнение/);
      return;
    }
    expect(html).toContain("Какво се промени спрямо");
    expect(html).toContain(changed[0].diff.changes[0].labelBg);
  });

  it("tells the reviewer the queue is clear instead of showing a blank page", async () => {
    const result = await listFlaggedQuestions({ queue: "unsigned", pageSize: 1 });
    const empty = { ...result, flagged: [], total: 0 };
    const html = renderToStaticMarkup(<ReviewClient result={empty} />);
    expect(html).toContain("Тази страница е изчистена");
  });

  it("states a moved answer key in letters, at the top of its card", async () => {
    // The six-field before/after blob rendered a key flip as a ✔ that had moved
    // one line inside a struck-through paragraph. If this assertion goes red
    // the flip is back to being invisible, whatever else the card says.
    const result = await listFlaggedQuestions({ queue: "needs-review" });
    const flipped = result.flagged.filter((q) => q.diff.keyChange !== null);
    if (flipped.length === 0) return; // all signed off — nothing left to shout

    const html = renderToStaticMarkup(<ReviewClient result={result} />);
    expect(html).toContain("Верният отговор е сменен спрямо");
    const change = flipped[0].diff.keyChange as { before: string; after: string };
    expect(html).toContain(change.before.split(",").join(" + "));
    expect(html).toContain(change.after.split(",").join(" + "));
  });

  it("leads with the risk bands, and puts the key flips first", async () => {
    const result = await listFlaggedQuestions({ queue: "needs-review" });
    const html = renderToStaticMarkup(<ReviewClient result={result} />);
    expect(html).toContain("подредена по риск за ученика");

    if (result.risk["key-flip"] === 0) return;
    // The band heading for moved keys must appear before any other band's — a
    // sorted list rendered into an unsorted page helps nobody.
    const first = html.indexOf("Сменен ключ");
    const others = ["Само обяснение", "Само цитати", "Без промяна от вълната"]
      .map((label) => html.indexOf(label))
      .filter((at) => at >= 0);
    expect(first).toBeGreaterThanOrEqual(0);
    for (const at of others) expect(first).toBeLessThan(at);
  });

  it("keeps the decision buttons reachable from a 3,000px card", async () => {
    // The statute is on the card (ADR-002), so cards run 2,000-3,500px and the
    // action bar was landing three screens below the question. It is sticky
    // now; if that class is dropped, the founder scrolls for every one of the
    // rows in the queue.
    const result = await listFlaggedQuestions({ queue: "needs-review", pageSize: 2 });
    const html = renderToStaticMarkup(<ReviewClient result={result} />);
    const bar = html.slice(html.indexOf("Одобри и подпиши") - 600, html.indexOf("Одобри и подпиши"));
    expect(bar).toContain("sticky");
  });
});
