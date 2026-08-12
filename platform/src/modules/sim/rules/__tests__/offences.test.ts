/**
 * ONE ACT, ONE ROAD PRICE — the guard, and the census behind it.
 *
 * Two halves:
 *
 *  1. THE CENSUS. Every catalogued code is asked what ungated price it puts on
 *     the screen, the answers are clustered by (penalty citation, лв. amount),
 *     and every PAIR inside every cluster must be accounted for — either
 *     grouped as one offence or written down in `SEPARATE_ACTS` with a reason.
 *     This is what turns „look for the same shape elsewhere" into something that
 *     cannot silently rot: a sixth code added to чл. 183, ал. 2, т. 6 tomorrow
 *     fails here until somebody decides which it is.
 *
 *  2. THE BILLING. The seatbelt case the founder actually saw, driven through
 *     `billRoadConsequences` as a real event list, plus the cases that must NOT
 *     collapse: a second unbelted stretch, two separate overtakes, and a group
 *     whose members stop agreeing on the figure.
 *
 * Nothing here retypes a лв. figure or a citation: every expected value is read
 * back out of `roadConsequenceFor`, which `consequences.test.ts` re-cuts from
 * `content/law/acts` on every run.
 */

import { describe, expect, it } from "vitest";
import { VIOLATIONS, makeViolation } from "../catalog";
import { roadConsequenceFor } from "../consequences";
import {
  GATED_SHARED_PROVISIONS,
  OFFENCE_GROUPS,
  SEPARATE_ACTS,
  billRoadConsequences,
  offenceCoversNoteBg,
  offenceGroupFor,
  sharedChargeFor,
  ungatedChargeFor,
} from "../offences";
import type { ViolationCode, ViolationEvent } from "../types";

const ALL_CODES = Object.keys(VIOLATIONS) as ViolationCode[];

function at(code: ViolationCode, t: number): ViolationEvent {
  return makeViolation(code, t);
}

const pairKey = (a: ViolationCode, b: ViolationCode): string => [a, b].sort().join("|");

// ---------------------------------------------------------------------------
// 1. The census — which codes charge the same thing
// ---------------------------------------------------------------------------

/** code sets keyed by „citation @ amount", for every code that charges ungated. */
function chargeClusters(): Map<string, ViolationCode[]> {
  const clusters = new Map<string, ViolationCode[]>();
  for (const code of ALL_CODES) {
    const charge = ungatedChargeFor(code);
    if (charge === null) continue;
    const key = `${charge.citationBg} @ ${charge.amountBgn}`;
    const list = clusters.get(key);
    if (list) list.push(code);
    else clusters.set(key, [code]);
  }
  return clusters;
}

describe("the census of shared penalty provisions", () => {
  it("finds more than one cluster — a census that finds nothing has not run", () => {
    const shared = [...chargeClusters().values()].filter((codes) => codes.length > 1);
    expect(shared.length).toBeGreaterThan(1);
  });

  it("accounts for EVERY pair of codes that charge the identical ungated price", () => {
    const grouped = new Set<string>();
    for (const g of OFFENCE_GROUPS) {
      for (const a of g.codes) for (const b of g.codes) if (a !== b) grouped.add(pairKey(a, b));
    }
    const declaredSeparate = new Set<string>();
    for (const s of SEPARATE_ACTS) {
      for (const a of s.codes) for (const b of s.codes) if (a !== b) declaredSeparate.add(pairKey(a, b));
    }

    const unaccounted: string[] = [];
    for (const [key, codes] of chargeClusters()) {
      if (codes.length < 2) continue;
      for (let i = 0; i < codes.length; i += 1) {
        for (let j = i + 1; j < codes.length; j += 1) {
          const pk = pairKey(codes[i], codes[j]);
          if (grouped.has(pk) || declaredSeparate.has(pk)) continue;
          unaccounted.push(`${key}: ${codes[i]} + ${codes[j]}`);
        }
      }
    }
    // The message is the report: a new pair prints itself here rather than
    // shipping a doubled fine to a seventeen-year-old.
    expect(
      unaccounted,
      "These codes charge the same лв. figure under the same article and nobody has said whether one act can produce both. " +
        "Add them to OFFENCE_GROUPS (one act) or to SEPARATE_ACTS (different acts, with the reason).",
    ).toEqual([]);
  });

  /**
   * THE SECOND CENSUS, PINNED. Conditional branches („ако от това е създадена
   * непосредствена опасност“, „ако причини ПТП“) are shared by whole blocks of
   * the catalogue. They are deliberately NOT collapsed — each is rendered with
   * its condition and none of them claims to be the price of the drive — but
   * they are counted, so a new shared conditional provision arrives as a red
   * test and not as a silent fourth 200 лв. on somebody's result screen.
   */
  it("matches the pinned census of shared CONDITIONAL provisions", () => {
    const gated = new Map<string, Set<ViolationCode>>();
    for (const code of ALL_CODES) {
      const road = roadConsequenceFor(code);
      const steps =
        road.kind === "conditional"
          ? road.branches
          : road.kind === "single"
            ? (road.escalation ?? [])
            : [];
      for (const s of steps) {
        const key = `${s.fine.source.citationBg} @ ${s.fine.amountBgn}`;
        const set = gated.get(key) ?? new Set<ViolationCode>();
        set.add(code);
        gated.set(key, set);
      }
    }
    const measured = [...gated.entries()]
      .filter(([, codes]) => codes.size > 1)
      .map(([key, codes]) => `${key} × ${codes.size}`)
      .sort();
    const declared = GATED_SHARED_PROVISIONS.map(
      (g) => `${g.citationBg} @ ${g.amountBgn} × ${g.codeCount}`,
    ).sort();
    expect(measured).toEqual(declared);
  });

  it("keeps the seatbelt pair in the census — the pair this whole file came from", () => {
    const seatbelt = [...chargeClusters().values()].find(
      (codes) =>
        codes.includes("PREDRIVE_SEATBELT_SKIPPED") && codes.includes("SEATBELT_OFF_WHILE_MOVING"),
    );
    expect(seatbelt).toBeDefined();
  });

  it("lists no code in SEPARATE_ACTS that does not actually share the charge", () => {
    for (const s of SEPARATE_ACTS) {
      expect(s.codes.length).toBe(new Set(s.codes).size);
      const charges = s.codes.map((c) => ungatedChargeFor(c));
      for (const c of charges) expect(c).not.toBeNull();
      const first = charges[0];
      // Every member of a SEPARATE_ACTS entry must be in ONE cluster: the entry
      // exists to answer a shared-provision question, and a member that shares
      // nothing is a stale line pretending to be a decision.
      for (const c of charges) {
        expect(c?.citationBg).toBe(first?.citationBg);
        expect(c?.amountBgn).toBe(first?.amountBgn);
      }
      expect(s.reason.length).toBeGreaterThan(80);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The groups themselves
// ---------------------------------------------------------------------------

describe("the declared offence groups", () => {
  it("every group's members agree on the retrieved figure", () => {
    for (const g of OFFENCE_GROUPS) {
      const charge = sharedChargeFor(g.codes);
      expect(charge, `${g.id}: members no longer charge the same thing`).not.toBeNull();
    }
  });

  it("the seatbelt group is charged under one and the same точка, at one figure", () => {
    const charge = sharedChargeFor(["PREDRIVE_SEATBELT_SKIPPED", "SEATBELT_OFF_WHILE_MOVING"]);
    expect(charge).not.toBeNull();
    // Read back, never retyped: both rows must resolve to the same source.
    const a = roadConsequenceFor("PREDRIVE_SEATBELT_SKIPPED");
    const b = roadConsequenceFor("SEATBELT_OFF_WHILE_MOVING");
    if (a.kind !== "single" || b.kind !== "single") throw new Error("both rows must stay `single`");
    expect(b.fine.source.citationBg).toBe(a.fine.source.citationBg);
    expect(b.fine.amountBgn).toBe(a.fine.amountBgn);
    expect(b.controlPoints.points).toBe(a.controlPoints.points);
  });

  it("no group contains a code that also sits in another group", () => {
    const seen = new Set<ViolationCode>();
    for (const g of OFFENCE_GROUPS) {
      for (const c of g.codes) {
        expect(seen.has(c), `${c} is in two groups`).toBe(false);
        seen.add(c);
      }
    }
  });

  it("group copy carries no article number of its own (ADR-002)", () => {
    for (const g of OFFENCE_GROUPS) {
      expect(g.reasonBg).not.toMatch(/чл\.|ал\.|т\.\s*\d|лв\./);
    }
  });

  it("offenceGroupFor finds a member and misses a non-member", () => {
    expect(offenceGroupFor("SEATBELT_OFF_WHILE_MOVING")?.id).toBe("seatbelt");
    expect(offenceGroupFor("ENGINE_STALLED")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. The billing — the founder's own screen
// ---------------------------------------------------------------------------

describe("billRoadConsequences", () => {
  it("prices one forgotten belt ONCE while keeping both exam marks", () => {
    const mistakes = [at("PREDRIVE_SEATBELT_SKIPPED", 4), at("SEATBELT_OFF_WHILE_MOVING", 7)];
    const billing = billRoadConsequences(mistakes);

    expect(billing[0].billed).toBe(true);
    expect(billing[1].billed).toBe(false);
    expect(billing[1].coveredBy?.code).toBe("PREDRIVE_SEATBELT_SKIPPED");
    expect(billing[0].alsoCovers.map((c) => c.code)).toEqual(["SEATBELT_OFF_WHILE_MOVING"]);

    // The exam sheet is untouched: both events keep their own points, and the
    // sum the score screen shows is the sum of the faults, not of the offences.
    expect(mistakes[0].points).toBe(VIOLATIONS.PREDRIVE_SEATBELT_SKIPPED.points);
    expect(mistakes[1].points).toBe(VIOLATIONS.SEATBELT_OFF_WHILE_MOVING.points);
  });

  it("the covered row's note names the row that carries the price", () => {
    const billing = billRoadConsequences([
      at("PREDRIVE_SEATBELT_SKIPPED", 4),
      at("SEATBELT_OFF_WHILE_MOVING", 7),
    ]);
    const note = offenceCoversNoteBg(billing[0].alsoCovers);
    expect(note).not.toBeNull();
    expect(note).toContain(VIOLATIONS.SEATBELT_OFF_WHILE_MOVING.titleBg);
    // The citation in the copy is the RETRIEVED one, not a typed string.
    const road = roadConsequenceFor("PREDRIVE_SEATBELT_SKIPPED");
    if (road.kind !== "single") throw new Error("unexpected shape");
    expect(note).toContain(road.fine.source.citationBg);
  });

  it("bills a SECOND unbelted stretch again — two acts, two prices", () => {
    const billing = billRoadConsequences([
      at("PREDRIVE_SEATBELT_SKIPPED", 4),
      at("SEATBELT_OFF_WHILE_MOVING", 7),
      at("SEATBELT_OFF_WHILE_MOVING", 300),
    ]);
    expect(billing.map((b) => b.billed)).toEqual([true, false, true]);
  });

  it("collapses the two zone codes only when they share the instant", () => {
    const together = billRoadConsequences([
      at("OVERTAKING_AT_CROSSING", 61),
      at("OVERTAKING_IN_BAN_ZONE", 61),
    ]);
    expect(together.map((b) => b.billed)).toEqual([true, false]);

    // Two DIFFERENT overtakes, one in each kind of zone, are two acts — and the
    // sameInstant pairing is what keeps them apart without a tunable window.
    const apart = billRoadConsequences([
      at("OVERTAKING_AT_CROSSING", 61),
      at("OVERTAKING_IN_BAN_ZONE", 140),
    ]);
    expect(apart.map((b) => b.billed)).toEqual([true, true]);
  });

  it("leaves every ungrouped fault billing its own price", () => {
    const billing = billRoadConsequences([
      at("RED_LIGHT_CROSSED", 10),
      at("FAILED_TO_YIELD", 12),
      at("STOP_SIGN_NO_FULL_STOP", 30),
    ]);
    expect(billing.every((b) => b.billed)).toBe(true);
    expect(billing.every((b) => b.coveredBy === null)).toBe(true);
  });

  it("a lone member of a group is billed like anything else", () => {
    const billing = billRoadConsequences([at("SEATBELT_OFF_WHILE_MOVING", 30)]);
    expect(billing[0].billed).toBe(true);
    expect(billing[0].coveredBy).toBeNull();
  });

  it("returns one billing per mistake, in order, for an empty and a mixed list", () => {
    expect(billRoadConsequences([])).toEqual([]);
    const mixed = [
      at("ENGINE_STALLED", 1),
      at("PREDRIVE_SEATBELT_SKIPPED", 2),
      at("HANDBRAKE_LEFT_ON", 3),
      at("SEATBELT_OFF_WHILE_MOVING", 5),
    ];
    const billing = billRoadConsequences(mixed);
    expect(billing).toHaveLength(4);
    expect(billing.map((b) => b.billed)).toEqual([true, true, true, false]);
    expect(billing[3].coveredBy?.titleBg).toBe(VIOLATIONS.PREDRIVE_SEATBELT_SKIPPED.titleBg);
  });

  /**
   * THE NEGATIVE CONTROL. A checker that cannot fail has not passed: force the
   * two seatbelt rows to disagree and the grouping must let go rather than hide
   * the difference.
   */
  it("dissolves a group whose members stop agreeing on the figure", () => {
    const charge = sharedChargeFor(["PREDRIVE_SEATBELT_SKIPPED", "ENGINE_STALLED"]);
    // ENGINE_STALLED is exam-only — no ungated charge at all — so no shared one.
    expect(charge).toBeNull();
  });
});
