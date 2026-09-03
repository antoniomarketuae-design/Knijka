/**
 * ONE CODE, TWO KINDS OF JUNCTION, AND THE CARD PRINTED THE WRONG RULE AT A
 * ROUNDABOUT — sc-roundabout-entry, 2026-09-03.
 *
 * THE DEFECT WAS ALREADY RECORDED BY THE WAVE THAT FIXED ITS OTHER HALF.
 * `runtime/worldRuntime.ts`, at the guard that keeps the right-hand-rule
 * tracker off a ring mouth: „The card even printed the wrong law back at him:
 * «На кръстовище без светофар пропускаш идващите отдясно.»" That is this row's
 * pooled `explanationBg`, and until this commit it was what a ROUNDABOUT
 * conviction printed too. The detector was corrected; the card was routed.
 *
 * PHOTOGRAPHED AT HEAD — `.audit-frames/w23/frames/sc-roundabout-entry__
 * mobile-right/04-t041s.png`: «⚠ −10 ИЗПИТНИ Т. · Непропускане на предимство ·
 * Не пропусна превозно средство, което имаше предимство. На…», with «ЗАЩО ↓6»
 * under it. The two lines the phone can finish are true of any junction and the
 * first thing under the fold is the rule for the wrong kind of one. The same
 * lesson's instruction step 2 reads «Гледай наляво — движещите се в кръга имат
 * предимство», so the product taught LEFT in the briefing and said RIGHT on the
 * card that cost ten points.
 *
 * BOTH DIRECTIONS ARE PINNED, because each alone passes on a broken build: a
 * table that answered every situation with the ring copy would tell a driver at
 * an ordinary crossroads to look left, which is the same defect mirrored.
 */

import { describe, expect, it } from "vitest";

import {
  FAILED_TO_YIELD_SITUATION_COPY,
  FAILED_TO_YIELD_SITUATION_ROUNDABOUT,
  VIOLATIONS,
  actCopy,
  makeViolation,
} from "../catalog";
import { rebuildRuleEvents, serializeRuleEvents } from "../../lessons/wire";
import type { RuleEvent, ViolationEvent } from "../types";
import { drive, tick } from "./fixtures";

const ROW = VIOLATIONS.FAILED_TO_YIELD;
const RING = FAILED_TO_YIELD_SITUATION_ROUNDABOUT;

/** „Yield to the vehicle on your RIGHT" — чл. 48, the equal-junction rule. */
const RIGHT_HAND_RULE = /идващите отдясно|огледай дясно/i;
/** The ring's own answer: the priority traffic arrives from the LEFT. */
const RING_RULE = /отляво|наляво/i;

function yields(events: RuleEvent[]): ViolationEvent[] {
  return events.filter(
    (e): e is ViolationEvent => e.kind === "violation" && e.code === "FAILED_TO_YIELD",
  );
}

/** One adjudicated priority conflict with `situation`, through the reducer. */
function convict(situation: string): ViolationEvent[] {
  return yields(
    drive([
      tick(0, {
        speedKmh: 25,
        events: [{ kind: "prioritySituation", situation, violated: true }],
      }),
      tick(1, { speedKmh: 20 }),
    ]).events,
  );
}

describe("FAILED_TO_YIELD explains the junction the student was actually at", () => {
  it("POSITIVE CONTROL: both situations really convict, and carry their discriminator", () => {
    // Without this every assertion below would pass over two empty arrays.
    for (const situation of [RING, "give-way"]) {
      const v = convict(situation);
      expect(v, situation).toHaveLength(1);
      expect(v[0].detail, situation).toBe(situation);
    }
  });

  it("THE MEASUREMENT: the ring card no longer ASSERTS the right-hand rule", () => {
    const card = convict(RING)[0];
    // The pooled claim, verbatim — this is the sentence `worldRuntime.ts`
    // quotes as „the wrong law printed back at him", and it fails on the old
    // catalogue because that is exactly what the ring conviction carried.
    expect(card.explanationBg).not.toContain(
      "На кръстовище без светофар пропускаш идващите отдясно",
    );
    expect(card.explanationBg).toMatch(RING_RULE);
    expect(card.explanationBg).toMatch(/кръг/i);
    // AND THE EXPECTATION IS „NOT ASSERTED", NOT „NOT MENTIONED", deliberately.
    // The student has been taught the right-hand rule at every other junction
    // in this product; a card that silently withheld it would leave him to
    // discover on the road that his one rule has exceptions. So the phrase MAY
    // appear — and only inside the clause that disapplies it.
    const mentions = card.explanationBg.match(/идващите отдясно/g) ?? [];
    expect(mentions).toHaveLength(1);
    // A bounded window and not `[^.]*`: the disapplying clause names «чл. 48»,
    // whose own full stop would end a sentence-shaped match. 120 characters is
    // „in the same breath", which is the requirement.
    expect(card.explanationBg).toMatch(/идващите отдясно[\s\S]{0,120}не се прилага/);
  });

  it("…and it says WHY, not just which way to look (THEO-4)", () => {
    const card = convict(RING)[0];
    // The duty is built from the sign plus чл. 50, ал. 1 — the derivation the
    // lesson's own `teach.whyBg` gives. A card that only said «гледай наляво»
    // would be a bare instruction wearing an explanation.
    expect(card.explanationBg).toMatch(/Б1/);
    expect(card.explanationBg).toMatch(/чл\. 50, ал\. 1/);
    // …and it names the rule it is displacing, because that is the one the
    // student has already been taught for every other junction.
    expect(card.explanationBg).toMatch(/чл\. 48/);
  });

  it("the citation NARROWS to the article this act breaks, and drops чл. 48", () => {
    const card = convict(RING)[0];
    expect(ROW.lawRef).toBe("ЗДвП чл. 47; чл. 48; чл. 50, ал. 1");
    expect(card.lawRef).toBe("ЗДвП чл. 50, ал. 1");
  });

  it("the ring title fits the phone's peek — no longer than the pooled one", () => {
    // `hud/SimOverlay.tsx`: the peek's text window is floored at 44 px, a title
    // line box is 13.75 and the body's first line needs 15.125, so a third
    // title line deletes the explanation. This lane is also answering
    // «the fault card's body text is cut», so the act may not buy its
    // correctness with a line of body.
    const card = convict(RING)[0];
    expect(card.titleBg.length).toBeLessThanOrEqual(ROW.titleBg.length);
  });

  it("EVERY OTHER JUNCTION IS UNTOUCHED — the pooled row still answers them", () => {
    for (const situation of ["give-way", "rightHandRule", "left-turn-oncoming"]) {
      const card = convict(situation)[0];
      expect(card.titleBg, situation).toBe(ROW.titleBg);
      expect(card.explanationBg, situation).toBe(ROW.explanationBg);
      expect(card.lawRef, situation).toBe(ROW.lawRef);
      expect(card.explanationBg, situation).toMatch(RIGHT_HAND_RULE);
    }
    // An absent discriminator is the pooled row too, not silence.
    expect(makeViolation("FAILED_TO_YIELD", 0).explanationBg).toBe(ROW.explanationBg);
    expect(actCopy("FAILED_TO_YIELD", undefined)).toBeNull();
    expect(actCopy("FAILED_TO_YIELD", "give-way")).toBeNull();
  });

  it("the pooled CORRECTIVE walks the ring too — it is read BY CODE, with no event", () => {
    // SessionEndScreen / debrief / attemptReel look this up by code with no
    // event in hand, which is a constraint on what it may say and not a licence
    // to give one situation's answer (the COLLISION row's own correction).
    expect(ROW.correctiveBg).toMatch(RIGHT_HAND_RULE);
    expect(ROW.correctiveBg).toMatch(/кръгов/i);
    expect(ROW.correctiveBg).toMatch(/НАЛЯВО/);
  });

  it("nothing about the CHARGE moves — class, points, price", () => {
    const ring = convict(RING)[0];
    const plain = convict("give-way")[0];
    expect(ring.severityClass).toBe(plain.severityClass);
    expect(ring.points).toBe(plain.points);
    expect(ring.severityClass).toBe("opasna");
    expect(ring.points).toBe(10);
  });

  it("THE SERVER REBUILDS THE SAME CARD — «Грешки» and «Разбор» cannot disagree", () => {
    // The failure this guards is the one `wire.ts` records at its own
    // `situation` channel: the end screen prints the client's events and the
    // «Разбор» prints the server's rebuild of the same log, a few centimetres
    // apart. `detail` is what makes them one card.
    const client = convict(RING)[0];
    const wire = serializeRuleEvents([client], []);
    expect(wire[0].detail).toBe(RING);
    const server = rebuildRuleEvents(wire);
    expect(server).not.toBeNull();
    const rebuilt = server!.find((e) => e.kind === "violation") as ViolationEvent;
    expect(rebuilt.titleBg).toBe(client.titleBg);
    expect(rebuilt.explanationBg).toBe(client.explanationBg);
    expect(rebuilt.lawRef).toBe(client.lawRef);
  });

  it("the table is retrieved law, not free recall (ADR-002)", () => {
    // Every claim in the ring row is either a quoted ЗДвП article that lives in
    // `content/law/acts/zdvp.json` or the sign fact, which is attributed to the
    // наредба and carries NO article number — the frozen rule for an act this
    // repo cannot show (`SC_ROUNDABOUT_ENTRY.teach.lawRef` does the same).
    const row = FAILED_TO_YIELD_SITUATION_COPY[RING];
    expect(row.explanationBg).toMatch(/Наредба № РД-02-21-1\/23\.11\.2023/);
    expect(row.explanationBg).not.toMatch(/Наредба № РД-02-21-1[^)]*чл\./);
    expect(row.lawRef).toMatch(/^ЗДвП /);
  });
});
