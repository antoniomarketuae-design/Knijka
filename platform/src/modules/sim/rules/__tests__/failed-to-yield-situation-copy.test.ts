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

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  FAILED_TO_YIELD_SITUATION_COPY,
  FAILED_TO_YIELD_SITUATION_LEFT_TURN_FORCED,
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

// ───────────── the forced-braking card: a left turn OR a turn-round ─────────────
//
// sc-turn-left-oncoming:1613ef2c, lane slowturn2, integrator rulings ST-CARD
// (2026-11-09) and ST-CARD-2 (2026-11-10). The R13''' bill (a `prioritySituation`
// «left-turn-oncoming» that names `forcedById`) is emitted at the 55° point of an
// ADDED-path turn, where a junction U-turn is still classed as a left turn
// (runtime/turns.ts R2 (a)); on sc-mv-uturn-ban it bills 180° turn-rounds
// (creep258@5 L1–L5 car 1002, creep264@5 L5 car 1005 — round-1 verifier F1). So
// its card may not say «наляво» of what he did, and must cite the article for
// each turn, retrieved from content/law (ADR-002).

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const ZDVP = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "law", "acts", "zdvp.json"), "utf-8")) as {
  units: { ref: string; textBg: string }[];
};
/** ал. n of чл. art, retrieved: from «(n) » to the next «(n+1) » or the unit's end. */
function alinea(art: number, n: number): string {
  const unit = ZDVP.units.find((u) => u.ref === `чл. ${art}`)!.textBg;
  const from = unit.indexOf(`(${n}) `) + `(${n}) `.length;
  const next = unit.indexOf(`(${n + 1}) `, from);
  return unit.slice(from, next < 0 ? undefined : next).trim();
}
/** The first sentence of чл. 37, ал. 1 (its second governs tram drivers among themselves). */
const ART_37_1 = alinea(37, 1).split(/(?<=\.) /)[0];
const ART_38_2 = alinea(38, 2);
const FORCED = FAILED_TO_YIELD_SITUATION_COPY[FAILED_TO_YIELD_SITUATION_LEFT_TURN_FORCED];

function convictForced(): ViolationEvent[] {
  return yields(
    drive([
      tick(0, {
        speedKmh: 6,
        events: [
          { kind: "prioritySituation", situation: "left-turn-oncoming", violated: true, addedPath: true, forcedById: 1001 },
        ],
      }),
      tick(1, { speedKmh: 6 }),
    ]).events,
  );
}

describe("ST-CARD-2 — the forced-braking card is true of a left turn and of a turn-round", () => {
  it("the retrieval itself is the two duties to the ONCOMING traffic (a broken lookup cannot pass)", () => {
    expect(ART_37_1).toMatch(/^При завиване наляво за навлизане в друг път .* насрещно движещите се пътни превозни средства\.$/);
    expect(ART_38_2).toMatch(/^При завиване в обратна посока .* насрещно движещите се пътни превозни средства\.$/);
  });

  it("an R13''' bill (forcedById present) prints this act, and only it", () => {
    const [card] = convictForced();
    expect(card.detail).toBe(FAILED_TO_YIELD_SITUATION_LEFT_TURN_FORCED);
    expect(card.titleBg).toBe(FORCED.titleBg);
    expect(card.explanationBg).toBe(FORCED.explanationBg);
    expect(card.lawRef).toBe("ЗДвП чл. 37, ал. 1; чл. 38, ал. 2");
    expect(card.explanationBg).not.toMatch(RIGHT_HAND_RULE);
    // the charge is the code's own: class, points
    expect(card.severityClass).toBe("opasna");
    expect(card.points).toBe(10);
  });

  it("BOTH articles are quoted VERBATIM from content/law/acts/zdvp.json, each marked with the turn it governs", () => {
    expect(FORCED.explanationBg).toContain(`При ляв завой важи ЗДвП чл. 37, ал. 1: „${ART_37_1}“`);
    expect(FORCED.explanationBg).toContain(`При обратен завой важи ЗДвП чл. 38, ал. 2: „${ART_38_2}“`);
  });

  it("outside the quoted law it never says he turned «наляво» — the bill cannot know which turn it was", () => {
    const own = FORCED.explanationBg.replace(/„[^“]*“/g, "");
    expect(own).not.toMatch(/наляво|отляво/i);
    expect(own.startsWith("Зави пред насрещно превозно средство, което продължаваше направо или завиваше надясно")).toBe(true);
    // WHY he was billed (THEO-4): the other car had to slow because his turn entered its path
    expect(own).toMatch(/трябваше да намали, защото завоят ти навлезе в пътя му/);
    // no gap figure: an R13''' bill exists where the measured gap did NOT convict
    expect(FORCED.explanationBg).not.toMatch(/секунд|под 2/);
    for (const s of [FORCED.titleBg, FORCED.peekBg]) expect(s).not.toMatch(/ляв|наляво|обратн/i);
  });

  it("the corrective names a left turn AND a turn-round", () => {
    expect(FORCED.correctiveBg).toMatch(/^При ляв или обратен завой пропусни насрещните/);
  });

  it("the server rebuilds the same card from the wire key", () => {
    const [client] = convictForced();
    const wire = serializeRuleEvents([client], []);
    expect(wire[0].detail).toBe(FAILED_TO_YIELD_SITUATION_LEFT_TURN_FORCED);
    const rebuilt = rebuildRuleEvents(wire)!.find((e) => e.kind === "violation") as ViolationEvent;
    expect(rebuilt.explanationBg).toBe(client.explanationBg);
    expect(rebuilt.lawRef).toBe(client.lawRef);
  });
});
