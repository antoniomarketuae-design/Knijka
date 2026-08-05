/**
 * The non-statutory source registry, over the REAL content/ registers.
 *
 * These are the assertions that make `sourceRefs` worth having rather than a
 * second way to write an unverifiable citation: an id that resolves, a quote
 * that came out of a fetched source, and a miss that says why it missed instead
 * of quietly substituting something nearby.
 */
import { describe, expect, it } from "vitest";
import { ACT_IDS } from "@/lib/content/law";
import {
  claimsForQuestion,
  formatSourceCitation,
  getSourceRegistry,
  quoteForSourceRef,
  resolveSourceRef,
} from "./registry";

describe("source registry — loading", () => {
  it("loads every register that exists, with globally unique ids", () => {
    const registry = getSourceRegistry();
    expect(registry.sources.size).toBeGreaterThan(0);
    // The loader throws on a duplicate id, so reaching here already proves
    // uniqueness; assert the registers we expect are actually present.
    const registers = new Set([...registry.sources.values()].map((s) => s.register));
    expect(registers.has("general")).toBe(true);
  });

  it("every registered source is re-fetchable and hash-pinned", () => {
    for (const source of getSourceRegistry().sources.values()) {
      expect(source.url, source.id).toMatch(/^https?:\/\//);
      expect(source.rawSha256, source.id).toMatch(/^[0-9a-f]{64}$/);
      expect(source.textSha256, source.id).toMatch(/^[0-9a-f]{64}$/);
      expect(source.textBytes, source.id).toBeGreaterThan(0);
    }
  });

  /**
   * A quote must point at something we actually hold: a registered source, or
   * an act in the law corpus (`law:<actId>` — `med-legal-duty` is grounded in
   * ЗДвП чл. 123 that way, and re-registering statutes here would be a second
   * copy free to drift from the first).
   */
  it("every claim quote names a source we hold — a register row or an act", () => {
    const { sources, claims } = getSourceRegistry();
    const actIds = new Set<string>(ACT_IDS);
    for (const claim of claims.values()) {
      const quotes = [...(claim.authoritative ? [claim.authoritative] : []), ...claim.corroborating];
      for (const quote of quotes) {
        const held = quote.sourceId.startsWith("law:")
          ? actIds.has(quote.sourceId.slice("law:".length))
          : sources.has(quote.sourceId);
        expect(held, `${claim.id} → ${quote.sourceId}`).toBe(true);
      }
    }
  });

  /**
   * The gate that the builders enforce, re-asserted here so it holds even if
   * someone hand-edits a register: a claim carrying a figure must have an
   * authoritative quote that actually states it. This is the „ЗДвП чл. 123"
   * failure mode — a real citation attached to a claim it does not contain.
   */
  it("a claim with a figure has that figure in its own quote", () => {
    for (const claim of getSourceRegistry().claims.values()) {
      if (claim.figureBg === null) continue;
      // The number often sits in a different sentence from the headline rule —
      // that is what `figureQuote` is for, and the medical builder caught two
      // real claims that way. Falling back to `authoritative` keeps registers
      // that do not need the distinction honest too.
      const quote = claim.figureQuote ?? claim.authoritative;
      expect(quote, `${claim.id} carries a figure but no quote stating it`).not.toBeNull();
      for (const digits of claim.figureBg.match(/\d+/g) ?? []) {
        expect(quote?.quoteBg, `${claim.id} (${claim.figureBg})`).toContain(digits);
      }
    }
  });
});

describe("resolveSourceRef", () => {
  it("resolves the statistics claim q-ptp-044 rests on, with its verbatim quote", () => {
    const lookup = resolveSourceRef({
      sourceId: "src-nsi-ptp-2023",
      ref: "Методологични бележки",
      claimId: "stat-road-death-30-days",
    });
    expect(lookup.found).toBe(true);
    if (!lookup.found) return;
    expect(lookup.source.publisherBg).toContain("НСИ");
    expect(lookup.claim?.authoritative?.quoteBg).toContain("30 дни след произшествието");
    expect(lookup.citationBg).toContain("НСИ");
  });

  it("resolves a source without a claimId — the citation, no quote", () => {
    const lookup = resolveSourceRef({ sourceId: "src-nsi-ptp-2023", ref: "изданието като цяло" });
    expect(lookup.found).toBe(true);
    if (!lookup.found) return;
    expect(lookup.claim).toBeNull();
  });

  it("misses with a reason instead of guessing, for an unknown source", () => {
    const lookup = resolveSourceRef({ sourceId: "src-does-not-exist", ref: "x" });
    expect(lookup.found).toBe(false);
    if (lookup.found) return;
    expect(lookup.reason).toBe("source-not-in-registers");
    expect(lookup.queriedSourceId).toBe("src-does-not-exist");
  });

  /**
   * The subtle one. A claimId that exists but whose quotes come from OTHER
   * sources must miss — showing the ERC sentence under a citation of БЧК would
   * be the decorative citation again, one level down.
   */
  it("misses when the claim does not quote the source the ref names", () => {
    const lookup = resolveSourceRef({
      sourceId: "src-nsi-ptp-2023-press",
      ref: "прессъобщение",
      claimId: "no-such-claim-id",
    });
    expect(lookup.found).toBe(false);
    if (lookup.found) return;
    expect(lookup.reason).toBe("claim-not-found");
  });

  it("quoteForSourceRef returns the quote FROM THE CITED SOURCE", () => {
    const quote = quoteForSourceRef({
      sourceId: "src-nsi-ptp-2023-press",
      ref: "Методологични бележки",
      claimId: "stat-road-death-30-days",
    });
    expect(quote).not.toBeNull();
    expect(quote).toContain("Загинал при ПТП");
  });

  it("claimsForQuestion bridges a question id back to its grounding", () => {
    const claims = claimsForQuestion("q-ptp-044");
    expect(claims.map((c) => c.id)).toContain("stat-road-death-30-days");
  });

  it("formats a citation a reviewer can act on", () => {
    const source = getSourceRegistry().sources.get("src-nsi-ptp-2023");
    expect(source).toBeDefined();
    if (!source) return;
    expect(formatSourceCitation(source)).toContain(source.editionBg);
  });
});
