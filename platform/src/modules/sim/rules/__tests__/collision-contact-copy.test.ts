/**
 * ONE CODE, FOUR STRUCK BODIES, ONE STRING — sweep 161's two collision-copy
 * findings, locked from both directions.
 *
 * What was photographed:
 *   `sc-junction-gap/mobile-wrong/04-t100s.png` — the car at rest ON A FOOTWAY,
 *   nose into a building corner with a tree through the windscreen view at
 *   5 км/ч. The only thing on screen is «⚠ −10 изпитни т. · Пътнотранспортно
 *   произшествие · Настъпи сблъсък…», i.e. the student who drove onto a
 *   pavement is told that he hit something and nothing else.
 *   `sc-pk-ban-stop/pc-wrong/08-debrief.png` — „Опасни грешки (по 10 изпитни т.)
 *   2 · 20" with the SAME paragraph standing for both rows, so two different
 *   crashes read as one sentence said twice.
 *
 * `engine.ts` has stamped the discriminator all along: the contact episode is
 * per BODY KIND and every bill carries `detail` = `e.withWhat` ("vehicle" |
 * "pedestrian" | "cyclist" | "staticObject"). Since that episode landed, a
 * single drive can legitimately bill two rows — and `scoring.ts` closes the
 * ledger at the first terminating опасна, so the second row costs nothing and
 * exists ONLY to say something the first did not. It was saying the same thing.
 *
 * THE MEASUREMENT: the four drives below produced ONE explanation string
 * between them before the fix (set size 1) and produce four after it (set size
 * 4) — so every assertion here that counts distinct copy fails on the old
 * catalogue. The other directions are guarded too: an unknown body falls BACK
 * to the pooled row rather than to some looser text that fits everybody, the
 * pooled row stays true of all four (it is read BY CODE, with no event in
 * hand), the citation deliberately does NOT split, and nothing about the charge
 * — class, points, the termination flag — moves.
 */

import { describe, expect, it } from "vitest";

import { COLLISION_CONTACT_COPY, VIOLATIONS, makeViolation } from "../catalog";
import type { RuleEvent, ViolationEvent } from "../types";
import { drive, tick } from "./fixtures";

const ROW = VIOLATIONS.COLLISION;

type ContactWith = "vehicle" | "pedestrian" | "cyclist" | "staticObject";

/**
 * The string this row's corrective was until 2026-08-23, kept as the negative
 * control for the topic probe below. It is not decoration: a probe that has
 * stopped discriminating would report a corrective that answers all four cards
 * whatever it is fed, and this is the sentence photographed under the footway
 * crash — the one that must come out answering exactly ONE of them.
 */
const LEAD_CAR_ONLY_CORRECTIVE =
  "Карай така, че винаги да имаш къде да спреш: гледай далеч напред, дръж 2 секунди зад " +
  "предния и намалявай ПРЕДИ конфликтните точки (кръстовища, пътеки, паркирани коли).";

/**
 * „Does this text answer the card for body X?" — the vocabulary each body's own
 * answer cannot be written without. Deliberately about the ACTION, not about
 * the noun alone: a corrective that merely listed the four words would still
 * fail the negative control, which requires the lead-car string to hit exactly
 * one of them.
 */
const BODY_TOPIC: Record<ContactWith, RegExp> = {
  vehicle: /дистанц|2 секунди|две секунди/i,
  pedestrian: /пешеходец|пешеходц|човек/i,
  cyclist: /велосипед|колоездач/i,
  staticObject: /платно|бордюр|стълб|дърво|ограда/i,
};

function collisions(events: RuleEvent[]): ViolationEvent[] {
  return events.filter(
    (e): e is ViolationEvent => e.kind === "violation" && e.code === "COLLISION",
  );
}

/** One contact with `what`, driven through the real reducer. */
function hit(what: ContactWith): ViolationEvent[] {
  return collisions(
    drive([
      tick(0, { speedKmh: 25, events: [{ kind: "collision", withWhat: what }] }),
      tick(1, { speedKmh: 5 }),
    ]).events,
  );
}

const KINDS: ContactWith[] = ["vehicle", "pedestrian", "cyclist", "staticObject"];

describe("COLLISION names what the student actually struck", () => {
  it("POSITIVE CONTROL: all four contacts really do convict, one card each", () => {
    // Without this, every distinctness assertion below would pass over four
    // empty arrays — the shape of false pass this sweep exists to refuse.
    for (const what of KINDS) {
      const v = hit(what);
      expect(v, what).toHaveLength(1);
      expect(v[0].detail, what).toBe(what);
    }
  });

  it("THE MEASUREMENT: four bodies, four cards — was 1 distinct string, now 4", () => {
    const cards = KINDS.map((k) => hit(k)[0]);
    expect(new Set(cards.map((c) => c.explanationBg)).size).toBe(4);
    expect(new Set(cards.map((c) => c.titleBg)).size).toBe(4);
  });

  it("the footway crash is no longer told only that it „hit something“", () => {
    // The sc-junction-gap defect, literally: a building corner and a tree, and
    // a card that named neither. The static-object card must say the thing the
    // frame shows — the car left the carriageway and the obstacle never moved.
    const card = hit("staticObject")[0];
    expect(card.titleBg).toMatch(/неподвижн/i);
    expect(card.explanationBg).toMatch(/платно/i);
    // …and it may not be the lead-car story that the pooled corrective tells.
    expect(card.explanationBg).not.toMatch(/дистанц/i);
  });

  it("a person struck reads as a person struck, not as „произшествие“", () => {
    const card = hit("pedestrian")[0];
    expect(card.titleBg).toMatch(/пешеходец/i);
    expect(card.explanationBg).toMatch(/пешеходец|човек/i);
    expect(card.explanationBg).not.toMatch(/превозно средство/i);
  });

  it("two different bodies in one drive read as two different lessons", () => {
    // The sc-pk-ban-stop defect: „Опасни грешки 2 · 20" with one paragraph
    // standing for both rows. The engine bills per body kind; the copy must
    // follow it.
    const v = collisions(
      drive([
        tick(0, { speedKmh: 30, events: [{ kind: "collision", withWhat: "staticObject" }] }),
        tick(1, { speedKmh: 20, events: [{ kind: "collision", withWhat: "pedestrian" }] }),
      ]).events,
    );
    expect(v.map((e) => e.detail)).toEqual(["staticObject", "pedestrian"]);
    expect(v[0].explanationBg).not.toBe(v[1].explanationBg);
    expect(v[0].titleBg).not.toBe(v[1].titleBg);
  });
});

describe("the split may not become a looser card that fits every crash", () => {
  it("the CATALOGUE row stays true of all four bodies — it is read by CODE", () => {
    // clipPlanBuilder, tutor/retrieval and lesson/resolve look this up with no
    // event in hand, so it must assert no particular body.
    for (const word of [/превозно средство/i, /пешеходец/i, /велосипед/i, /стълб|дърво|сграда/i]) {
      expect(ROW.explanationBg).not.toMatch(word);
    }
    expect(ROW.explanationBg).toMatch(/сблъсък/i);
    // No body's card may simply BE the pooled row — that would be the split
    // silently doing nothing.
    for (const body of Object.values(COLLISION_CONTACT_COPY)) {
      expect(body.explanationBg).not.toBe(ROW.explanationBg);
      expect(body.titleBg).not.toBe(ROW.titleBg);
    }
  });

  it("THE CORRECTIVE MUST ANSWER ALL FOUR CARDS — was 1 of 4, now 4 of 4", () => {
    // `hud/SessionEndScreen.tsx correctiveFor(m.code)` looks this up BY CODE —
    // there is no per-event channel for it — and `FaultCard` prints it under
    // «✔ Правилното действие», directly beneath the per-body explanation the
    // split above supplies. So the student told (correctly) that he left the
    // carriageway and struck a building was then told to keep two seconds
    // behind the car in front. THEO-4: a WRONG answer to „какво трябваше да
    // направя" is worse than none.
    const answered = (s: string): ContactWith[] => KINDS.filter((k) => BODY_TOPIC[k].test(s));
    // NEGATIVE CONTROL on the probe itself: the photographed string answers the
    // lead-car card and only that one. If this ever reports four, the probe has
    // gone blind and the assertion under it means nothing.
    expect(answered(LEAD_CAR_ONLY_CORRECTIVE)).toEqual(["vehicle"]);
    expect(answered(ROW.correctiveBg).sort()).toEqual([...KINDS].sort());
    // …and the branch that was already right is still there — this fix adds
    // three answers, it does not trade one for another.
    expect(ROW.correctiveBg).toMatch(BODY_TOPIC.vehicle);
  });

  it("an UNRECOGNISED body falls back to the pooled row, never to silence", () => {
    const e = makeViolation("COLLISION", 3, { detail: "some-future-body" });
    expect(e.explanationBg).toBe(ROW.explanationBg);
    expect(e.titleBg).toBe(ROW.titleBg);
    // And a detail-less event (replays, `makeViolation("COLLISION", t)` in the
    // debrief fixtures) is unchanged.
    const bare = makeViolation("COLLISION", 3);
    expect(bare.explanationBg).toBe(ROW.explanationBg);
    expect(bare.titleBg).toBe(ROW.titleBg);
  });

  it("an explicit override still outranks the per-body copy", () => {
    const e = makeViolation("COLLISION", 3, {
      detail: "pedestrian",
      titleBg: "T",
      explanationBg: "E",
    });
    expect(e.titleBg).toBe("T");
    expect(e.explanationBg).toBe("E");
  });

  it("the CITATION deliberately does not split — every contact breaks one rule", () => {
    // Unlike the rail acts, which break three different articles, all four
    // bodies break the same speed/stopping duty. A per-body citation would be a
    // NEW claim, and `content/hazard/items.json` echoes this row's lawRef under
    // a bank check that fails the build when the two drift.
    for (const card of KINDS.map((k) => hit(k)[0])) {
      expect(card.lawRef).toBe(ROW.lawRef);
    }
    for (const body of Object.values(COLLISION_CONTACT_COPY)) {
      expect(body).not.toHaveProperty("lawRef");
    }
  });

  it("the split reaches copy only — never the charge or the ending", () => {
    for (const card of KINDS.map((k) => hit(k)[0])) {
      expect(card.severityClass).toBe(ROW.severityClass);
      expect(card.points).toBe(ROW.points);
      expect(card.terminateSession).toBe(true); // чл. 48, ал. 3 — still the only one
      expect(card.conceptId).toBe(ROW.conceptId);
    }
  });

  it("no other code is touched by the contact channel", () => {
    // `detail` is a shared field; only COLLISION may read it as a body kind.
    const e = makeViolation("FAILED_TO_YIELD", 1, { detail: "pedestrian" });
    expect(e.explanationBg).toBe(VIOLATIONS.FAILED_TO_YIELD.explanationBg);
    expect(e.titleBg).toBe(VIOLATIONS.FAILED_TO_YIELD.titleBg);
    // …and the rail split still works, unchanged by the registry it moved into.
    const rail = makeViolation("RAIL_CROSSING_VIOLATION", 1, { detail: "entered-barred" });
    expect(rail.lawRef).toBe("ЗДвП чл. 52");
    expect(rail.explanationBg).not.toBe(VIOLATIONS.RAIL_CROSSING_VIOLATION.explanationBg);
  });
});
