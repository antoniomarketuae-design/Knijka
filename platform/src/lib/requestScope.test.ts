import { describe, expect, it } from "vitest";
import {
  invalidateRequestScoped,
  requestScoped,
  withRequestScope,
} from "./requestScope";

/**
 * The memo the dashboard's query budget rests on. Every property asserted here
 * is one the callers depend on — see lib/dashboard/queryBudget.test.ts for the
 * number it buys.
 */
describe("requestScoped", () => {
  it("issues one read per request no matter how many callers ask", async () => {
    let reads = 0;
    const read = requestScoped("progress", async (userId: string) => {
      reads += 1;
      return `rows for ${userId}`;
    });

    const results = await withRequestScope(() =>
      Promise.all([read("u-1"), read("u-1"), read("u-1")]),
    );

    expect(reads).toBe(1);
    expect(results).toEqual([
      "rows for u-1",
      "rows for u-1",
      "rows for u-1",
    ]);
  });

  it("shares the IN-FLIGHT read, not just a finished one", async () => {
    // The dashboard's callers all start inside one Promise.all, so the second
    // caller arrives while the first query is still open. A memo that only
    // cached resolved values would miss every single one of them.
    let reads = 0;
    let release: (() => void) | null = null;
    const read = requestScoped("slow", async () => {
      reads += 1;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return "done";
    });

    await withRequestScope(async () => {
      const a = read();
      const b = read();
      expect(reads).toBe(1);
      release?.();
      expect(await Promise.all([a, b])).toEqual(["done", "done"]);
    });
  });

  it("keys on the arguments, so two students never share a row", async () => {
    const seen: string[] = [];
    const read = requestScoped("progress", async (userId: string) => {
      seen.push(userId);
      return userId;
    });

    await withRequestScope(async () => {
      expect(await read("u-1")).toBe("u-1");
      expect(await read("u-2")).toBe("u-2");
      expect(await read("u-1")).toBe("u-1");
    });

    expect(seen).toEqual(["u-1", "u-2"]);
  });

  it("namespaces by name, so two reads keyed by the same userId do not collide", async () => {
    const progress = requestScoped("progress", async (u: string) => `progress:${u}`);
    const state = requestScoped("state", async (u: string) => `state:${u}`);

    await withRequestScope(async () => {
      expect(await progress("u-1")).toBe("progress:u-1");
      expect(await state("u-1")).toBe("state:u-1");
    });
  });

  it("never shares across requests", async () => {
    let reads = 0;
    const read = requestScoped("progress", async () => {
      reads += 1;
      return reads;
    });

    expect(await withRequestScope(() => read())).toBe(1);
    expect(await withRequestScope(() => read())).toBe(2);
  });

  it("does not dedupe at all outside a request", async () => {
    // The safe degradation, and the reason unit tests with injected fakes are
    // unaffected: a CLI script or a background job sees every call it makes.
    let reads = 0;
    const read = requestScoped("progress", async () => {
      reads += 1;
      return reads;
    });

    await read();
    await read();
    expect(reads).toBe(2);
  });

  it("lets a write evict what it just changed", async () => {
    // recordActivity reads the state row, awards XP and writes it back. Without
    // eviction a later read in the same request would serve the pre-award row.
    const rows = new Map<string, number>([["u-1", 100]]);
    let reads = 0;
    const read = requestScoped("state", async (userId: string) => {
      reads += 1;
      return rows.get(userId) ?? 0;
    });

    await withRequestScope(async () => {
      expect(await read("u-1")).toBe(100);
      rows.set("u-1", 140);
      expect(await read("u-1")).toBe(100); // still memoised — as designed
      invalidateRequestScoped("state", "u-1");
      expect(await read("u-1")).toBe(140);
    });

    expect(reads).toBe(2);
  });
});
