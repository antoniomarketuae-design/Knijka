/**
 * ILLEGAL_STOP_IN_BAN_ZONE — THE CARD MUST CITE THE LAW THAT ACTUALLY BANS THE
 * STOP, AND THERE ARE TWO KINDS OF BAN.
 *
 * THE DEFECT, found independently by two audit passes. The pooled row tells
 * every convicted student «Спря в участък, в който престоят е забранен — под
 * знак В27…» and cites «ЗДвП чл. 6, т. 1» — the duty to obey A SIGN. That is
 * correct for the six districts that really post a В27 plate (d2-v1,
 * hz-accident-v1, pe-clear-v1, pe-slow-v1, pk-ban-v1, pk-ban2-v1). It is a
 * MISCITATION on the five whose ban is written in the statute itself, where no
 * plate is needed for the stop to be illegal:
 *
 *   pk-double-v1   «до престояващо или паркирано ППС от страната на движението»
 *   pk-banx-v1     a junction (×2) and a pedestrian crossing
 *   pk-rail-v1     the rails (×2)
 *   lot-zebra-v1   a crossing in a parking-lot aisle
 *
 * sc-pk-double-park is the sharpest: its own instruction says «забраната я
 * пишат самите коли … СЪС ИЛИ БЕЗ ЗНАК», and then the card that charges the
 * student three точки answers with the law for a sign. ADR-002 forbids exactly
 * this — a citation must be RETRIEVED and must be the rule the runtime really
 * establishes.
 *
 * BOTH DIRECTIONS ARE ASSERTED HERE, deliberately. A repair that made every
 * ban zone cite чл. 98 would swap one miscitation for its mirror image on the
 * six maps that DO carry a plate, so the pooled В27 row is pinned just as hard
 * as the new ones.
 *
 * THE CITATIONS BELOW ARE RETRIEVED, NOT RECALLED — `content/law/acts/
 * zdvp.json`, unit `ref: "чл. 98"`, and `content/signs/signs.json`, `code:
 * "В27"`. The clause texts are quoted in `catalog.ts` beside the rows.
 */

import { describe, expect, it } from "vitest";
import { NO_STOP_BASIS_COPY, VIOLATIONS, actCopy, violationPeekBg } from "../catalog";
import { DEFAULT_RULE_CONFIG } from "../types";
import type { NoStopBasis, RuleEvent, ViolationEvent } from "../types";
import { cruise, drive, tick } from "./fixtures";
import { resolveLawRef } from "@/lib/content/law";

function billsOf(events: RuleEvent[]): ViolationEvent[] {
  return events.filter(
    (e): e is ViolationEvent => e.kind === "violation" && e.code === "ILLEGAL_STOP_IN_BAN_ZONE",
  );
}

/** The rest the reducer bills: roll in, then sit still inside the span. */
function restInZone(over: Partial<{ noStopBasis: NoStopBasis }>): ViolationEvent[] {
  const { events } = drive([
    tick(0, { speedKmh: 25, noStopZone: true, ...over }),
    ...cruise(1, 7, { speedKmh: 0, noStopZone: true, ...over }),
  ]);
  return billsOf(events);
}

// ---------------------------------------------------------------------------
// 1. THE LAW BASIS — чл. 98, ал. 1, and the точка the span really breaks
// ---------------------------------------------------------------------------

describe("a law-implied ban zone cites чл. 98, not the sign duty", () => {
  it("pk-double-v1's second-line span cites ал. 1, т. 2 and never names В27", () => {
    const v = restInZone({ noStopBasis: "law-alongside" });
    expect(v).toHaveLength(1);
    expect(v[0]!.lawRef).toBe("ЗДвП чл. 98, ал. 1, т. 2");
    expect(v[0]!.explanationBg).not.toContain("В27");
    expect(v[0]!.titleBg).not.toContain("В27");
    // …and the charge itself is untouched: this repair moves words, not points.
    expect(v[0]!.severityClass).toBe("osnovna");
    expect(v[0]!.points).toBe(3);
    // THEO-4: a reason, not a verdict — the explanation says what the danger is.
    expect(v[0]!.explanationBg.length).toBeGreaterThan(120);
  });

  it("pk-banx-v1's junction spans cite ал. 1, т. 6", () => {
    const v = restInZone({ noStopBasis: "law-junction" });
    expect(v[0]!.lawRef).toBe("ЗДвП чл. 98, ал. 1, т. 6");
    expect(v[0]!.explanationBg).not.toContain("В27");
  });

  it("the crossing spans (pk-banx zebra, lot-zebra) cite ал. 1, т. 5", () => {
    const v = restInZone({ noStopBasis: "law-crossing" });
    expect(v[0]!.lawRef).toBe("ЗДвП чл. 98, ал. 1, т. 5");
    expect(v[0]!.explanationBg).not.toContain("В27");
  });

  it("pk-rail-v1's spans flanking the track band cite ал. 1, т. 4", () => {
    const v = restInZone({ noStopBasis: "law-rail" });
    expect(v[0]!.lawRef).toBe("ЗДвП чл. 98, ал. 1, т. 4");
    expect(v[0]!.explanationBg).not.toContain("В27");
  });

  it("the four law rows carry FOUR DIFFERENT точки — a pooled чл. 98 would be a verdict", () => {
    const refs = (["law-alongside", "law-junction", "law-crossing", "law-rail"] as const).map(
      (b) => NO_STOP_BASIS_COPY[b].lawRef,
    );
    expect(new Set(refs).size).toBe(4);
    for (const r of refs) expect(r).toMatch(/^ЗДвП чл\. 98, ал\. 1, т\. [2456]$/);
  });
});

// ---------------------------------------------------------------------------
// 2. THE SIGN BASIS — the six plate maps must be BYTE-IDENTICAL
// ---------------------------------------------------------------------------

describe("a genuinely posted В27 keeps the sign duty it always had", () => {
  it("a span with no declared basis prints the pooled В27 row unchanged", () => {
    const v = restInZone({});
    expect(v).toHaveLength(1);
    expect(v[0]!.lawRef).toBe(VIOLATIONS.ILLEGAL_STOP_IN_BAN_ZONE.lawRef);
    expect(v[0]!.lawRef).toContain("ЗДвП чл. 6, т. 1");
    expect(v[0]!.explanationBg).toContain("В27");
    expect(v[0]!.detail).toBeUndefined();
  });

  it("an explicit sign basis says the same thing as the pooled row", () => {
    const v = restInZone({ noStopBasis: "sign" });
    expect(v[0]!.lawRef).toContain("ЗДвП чл. 6, т. 1");
    expect(v[0]!.explanationBg).toContain("В27");
  });

  it("the В27 ordinance stays named by SUBJECT, with no article number invented", () => {
    // `content/signs/signs.json` gives В27 a precise pointer («прил. № 3, знак
    // В27»), but `content/law/acts/` does not hold that наредба — so an
    // appendix number on a GRADED citation is one nobody can check.
    // content/law/README.md: the rule and the act with no article number beats
    // a number nobody can verify, and `__tests__/law-citations.test.ts` enforces
    // it. This case pins the outcome so the next lane does not retry the swap.
    const ref = VIOLATIONS.ILLEGAL_STOP_IN_BAN_ZONE.lawRef;
    expect(ref).toContain("Наредба № РД-02-21-1/23.11.2023");
    expect(ref).not.toMatch(/прил\. № \d/);
    expect(NO_STOP_BASIS_COPY.sign.lawRef).toBe(ref);
  });

  it("an UNRECOGNISED basis falls back to the pooled row rather than to silence", () => {
    const v = restInZone({ noStopBasis: "law-nonsense" as NoStopBasis });
    expect(v[0]!.lawRef).toBe(VIOLATIONS.ILLEGAL_STOP_IN_BAN_ZONE.lawRef);
  });
});

// ---------------------------------------------------------------------------
// 3. THE REGRADE IS THE SAME BREACH — both bill sites or the sheet disagrees
// ---------------------------------------------------------------------------

describe("the re-grade cannot print a different law from the bill", () => {
  it("bill and re-grade of ONE held rest carry the same detail and lawRef", () => {
    const { events } = drive([
      tick(0, { speedKmh: 25, noStopZone: true, noStopBasis: "law-rail" }),
      ...cruise(1, 40, { speedKmh: 0, noStopZone: true, noStopBasis: "law-rail" }),
    ]);
    const v = billsOf(events);
    // The bill, then BAN_ZONE_REST_REGRADE on the longer sustain.
    expect(v.length).toBeGreaterThanOrEqual(2);
    expect(v.some((e) => e.regrade === true)).toBe(true);
    expect(new Set(v.map((e) => e.lawRef))).toEqual(new Set(["ЗДвП чл. 98, ал. 1, т. 4"]));
    expect(new Set(v.map((e) => e.detail))).toEqual(new Set(["law-rail"]));
  });
});

// ---------------------------------------------------------------------------
// 4. THE WIRE — `detail` is the only channel that survives the server rebuild
// ---------------------------------------------------------------------------

describe("the basis rides `detail`, so the server rebuilds the same sentence", () => {
  it("the event carries the discriminator, not just the resolved strings", () => {
    const v = restInZone({ noStopBasis: "law-crossing" });
    expect(v[0]!.detail).toBe("law-crossing");
    // `wire.ts` serialises `detail` and `rebuildRuleEvents` re-runs
    // `makeViolation`, so this is what «Разбор» resolves from server-side.
    expect(actCopy("ILLEGAL_STOP_IN_BAN_ZONE", v[0]!.detail)).not.toBeNull();
    expect(actCopy("ILLEGAL_STOP_IN_BAN_ZONE", v[0]!.detail)!.lawRef).toBe(v[0]!.lawRef);
  });

  it("every basis resolves a peek summary — the phone card keeps its WHY", () => {
    for (const b of Object.keys(NO_STOP_BASIS_COPY) as NoStopBasis[]) {
      expect(violationPeekBg("ILLEGAL_STOP_IN_BAN_ZONE", b)).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// 5. THE BY-CODE SURFACES, which have no detail channel at all
// ---------------------------------------------------------------------------

describe("the strings read BY CODE must be true of both bases", () => {
  it("the pooled corrective teaches the plate AND the places the law bans", () => {
    const c = VIOLATIONS.ILLEGAL_STOP_IN_BAN_ZONE.correctiveBg;
    // `historyMistakes.ts`, `DualGhostReplay.tsx` and `session-history.tsx`
    // read this by code with no event in hand, so it cannot be about В27 alone.
    expect(c).toContain("В27");
    expect(c).toMatch(/кръстовищ|пътек|релси|спряла/);
  });
});

// ---------------------------------------------------------------------------
// 6. THE SPIRKA — founder ruling 2026-09-22, «Convict under чл. 69»
//    (audit row sc-pk-busstop-ban:b103c282)
// ---------------------------------------------------------------------------

describe("a halt at a bus stop is convicted under ЗДвП чл. 69, and the words come from the bank", () => {
  /** The unit the row claims to quote, RETRIEVED — not a string held here. */
  const art69 = resolveLawRef({ act: "ЗДвП", ref: "чл. 69" });

  it("the bank holds чл. 69 (if this fails, the row has nothing to quote — do not invent it)", () => {
    expect(art69.found).toBe(true);
    if (!art69.found) return;
    expect(art69.unit.textBg).toContain("спирка");
  });

  /** The two further units the parking conviction rests on, RETRIEVED. */
  const art93 = resolveLawRef({ act: "ЗДвП", ref: "чл. 93" });
  const art98 = resolveLawRef({ act: "ЗДвП", ref: "чл. 98" });
  const BUS_STOP_REF = "ЗДвП чл. 69; чл. 93, ал. 2; чл. 98, ал. 2, т. 3";

  /** A rest of `restSec` whole seconds in a `law-bus-stop` span. */
  function restAtBusStop(restSec: number): ViolationEvent[] {
    const { events } = drive([
      tick(0, { speedKmh: 25, noStopZone: true, noStopBasis: "law-bus-stop" }),
      ...cruise(1, 1 + restSec, { speedKmh: 0, noStopZone: true, noStopBasis: "law-bus-stop" }),
    ]);
    return billsOf(events);
  }

  it("pk-busstop-v1's spans convict PARKING — чл. 69 / чл. 93, ал. 2 / чл. 98, ал. 2, т. 3; no В27, no ал. 1", () => {
    const v = restAtBusStop(DEFAULT_RULE_CONFIG.busStopDropOffMaxSec + 2);
    expect(v).toHaveLength(1);
    expect(v[0]!.lawRef).toBe(BUS_STOP_REF);
    expect(v[0]!.detail).toBe("law-bus-stop");
    expect(v[0]!.titleBg).toBe("Паркиране на автобусна спирка");
    for (const s of [v[0]!.titleBg, v[0]!.explanationBg, v[0]!.lawRef]) {
      expect(s).not.toContain("В27");
      // чл. 98 may appear only as its PARKING clause (ал. 2, т. 3), never as
      // the престой list (ал. 1) the drill used to misattribute.
      expect(s).not.toContain("чл. 98, ал. 1");
    }
    // The charge is the same act on the same scale: words move, points do not.
    expect(v[0]!.severityClass).toBe("osnovna");
    expect(v[0]!.points).toBe(3);
  });

  it("every «…» the row quotes is a VERBATIM substring of the retrieved unit it cites", () => {
    // ADR-002: the article's text may only come from content/law. If the bank's
    // text ever changes (or someone "tidies" a quote), this goes red.
    expect(art69.found && art93.found && art98.found).toBe(true);
    if (!art69.found || !art93.found || !art98.found) return;
    const text = NO_STOP_BASIS_COPY["law-bus-stop"].explanationBg;
    const quotes = [...text.matchAll(/„([^“]+)“/g)].map((m) => m[1]!);
    // чл. 69: the two conditions must be IN the quote, not paraphrased around it.
    const q69 = quotes.filter((q) => q.includes("слизане на пътници само ако"));
    expect(q69).toHaveLength(1);
    expect(q69[0]).toContain("само ако не пречат");
    expect(art69.unit.textBg).toContain(q69[0]);
    // чл. 93, ал. 1: the definition of престой the «parking» verdict leans on.
    const q93 = quotes.filter((q) => q.startsWith("за ограничено време"));
    expect(q93).toHaveLength(1);
    expect(art93.unit.textBg).toContain(q93[0]);
    // чл. 98, ал. 2: the ban on parking at the stops.
    const q98 = quotes.filter((q) => q.includes("паркирането"));
    expect(q98).toHaveLength(1);
    expect(art98.unit.textBg).toContain(q98[0]);
    expect(art98.unit.textBg).toContain(
      "3. на спирките на превозните средства от редовните линии за обществен превоз на пътници",
    );
    // …and nothing is quoted that is not accounted for above.
    expect(quotes.length).toBe(3 + quotes.filter((q) => q === "за минутка").length);
  });

  it("a brief drop-off at the spirka is NOT an offence — чл. 69 allows it (founder follow-up ruling)", () => {
    // «Teach чл. 69 as written»: other vehicles may stop at a bus stop to let
    // passengers alight. The 4 s sustain every other basis uses would convict
    // exactly that stop, so this basis waits `busStopDropOffMaxSec`.
    const allowance = DEFAULT_RULE_CONFIG.busStopDropOffMaxSec;
    expect(allowance).toBeGreaterThan(DEFAULT_RULE_CONFIG.banZoneStopRestSec);
    expect(restAtBusStop(allowance - 2)).toEqual([]);
    // …the same rest under any other basis IS billed — the allowance is the
    // spirka's alone.
    const { events } = drive([
      tick(0, { speedKmh: 25, noStopZone: true, noStopBasis: "law-rail" }),
      ...cruise(1, allowance - 1, { speedKmh: 0, noStopZone: true, noStopBasis: "law-rail" }),
    ]);
    expect(billsOf(events).length).toBeGreaterThanOrEqual(1);
  });

  it("…and a rest that outlasts the drop-off IS billed, once, then re-graded on the same law", () => {
    const allowance = DEFAULT_RULE_CONFIG.busStopDropOffMaxSec;
    // Just past the allowance: the first bill, no re-grade yet.
    const first = restAtBusStop(allowance + 2);
    expect(first).toHaveLength(1);
    expect(first[0]!.regrade).toBeUndefined();
    expect(first[0]!.t).toBeGreaterThanOrEqual(1 + allowance);
    // Held on: the re-grade rides the SAME allowance (+6 s), not the 4 s one.
    const held = restAtBusStop(allowance + 10);
    expect(held.map((e) => e.regrade === true)).toEqual([false, true]);
    expect(new Set(held.map((e) => e.lawRef))).toEqual(new Set([BUS_STOP_REF]));
  });

  it("the row never names the product's allowance as if the act wrote it", () => {
    const { explanationBg } = NO_STOP_BASIS_COPY["law-bus-stop"];
    const n = String(DEFAULT_RULE_CONFIG.busStopDropOffMaxSec);
    // (No `\b`: JS word boundaries are ASCII-only and never fire after «с».)
    expect(explanationBg).not.toMatch(new RegExp(`(^|[^0-9])${n}\\s*(с\\.|с |сек)`));
    expect(explanationBg).not.toMatch(/\d+\s*секунд/);
    // …and never tells the student he hindered a bus: nothing on the tick can see one.
    expect(explanationBg).not.toMatch(/попречи|пречеше|затрудни автобуса/);
  });

  it("the row never claims a blanket ban the article does not contain", () => {
    // чл. 69 is a permission with two conditions (only to let passengers
    // alight; only if the bus is not hindered). The drill used to say the stop
    // is banned «дори за секунда» and attribute it to чл. 98, ал. 1 — which
    // names no spirka. The card must not repeat either half.
    const { explanationBg, peekBg } = NO_STOP_BASIS_COPY["law-bus-stop"];
    expect(explanationBg).not.toMatch(/дори за секунда|дори краткия престой|изобщо не спираш/);
    expect(explanationBg.length).toBeGreaterThan(120); // THEO-4: a reason, not a verdict
    expect(violationPeekBg("ILLEGAL_STOP_IN_BAN_ZONE", "law-bus-stop")).toBe(peekBg);
    // THEO-4, the other half: the card says what the student MAY do there.
    expect(explanationBg).toMatch(/пусни пътника/);
  });

  it("the pooled corrective (read by code, no detail) now walks the bus-stop branch too", () => {
    const c = VIOLATIONS.ILLEGAL_STOP_IN_BAN_ZONE.correctiveBg;
    expect(c).toContain("автобусна спирка");
    expect(c).toContain("ЗДвП чл. 69");
  });

  it("the server rebuild resolves the same sentence from `detail` alone", () => {
    const copy = actCopy("ILLEGAL_STOP_IN_BAN_ZONE", "law-bus-stop");
    expect(copy).not.toBeNull();
    expect(copy!.lawRef).toBe("ЗДвП чл. 69; чл. 93, ал. 2; чл. 98, ал. 2, т. 3");
  });
});
