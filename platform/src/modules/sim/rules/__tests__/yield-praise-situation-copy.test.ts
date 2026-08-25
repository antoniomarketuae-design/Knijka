/**
 * ONE PRAISE ROW, NINE ACTS, ONE TITLE — round 10, 2026-08-24, and rewritten
 * 2026-08-25 after the adversarial pass took the first draft apart.
 *
 * What was photographed: `w10-1/frames/sc-hz-accident-scene/mobile-right/
 * 08-debrief-p7.png` — «Похвали ✓ Правилно отстъпено предимство 0:33» on a
 * lesson that is a straight urban street past a crash scene. No junction, no
 * crossing, no priority sign; `hz-accident-v1.json` holds zero intersections.
 *
 * ⚠ WHAT THE FRAME SHOWS IS THE TITLE. The first draft of this file said the
 * card „then explained itself with «безопасността на КРЪСТОВИЩЕ»", as though
 * that too had been read off the picture. It had not — it was read out of
 * `catalog.ts`, and the captured debrief DOM holds the string zero times,
 * because A COMMENDATION'S `explanationBg` HAS NO RENDERER ANYWHERE (the census
 * is in catalog.ts's header: `toHudEvents` drops it, and every one of the five
 * surfaces that shows a praise shows the title alone). So this file measures the
 * TITLE and the CONCEPT, the two columns a student can actually reach, and it
 * PINS the unread junction sentence as an open row rather than pretending the
 * table closed it.
 *
 * What he had actually done: `SC_HZ_ACCIDENT_SCENE.staged` ends with
 * `SC_HZ_ACCIDENT_EMERGENCY`, whose runner resolves `{ situation: "emergency",
 * yielded: true }` — he made way for a special-regime vehicle, ЗДвП чл. 104,
 * ал. 1, a duty that owes nothing to junctions.
 *
 * THE ASYMMETRY: `engine.ts`'s `prioritySituation` case picks one of FIVE codes
 * on the violated branch by `e.situation`, and pushed ONE pooled commendation on
 * the yielded branch for all nine situations that reach it. Five of the nine
 * happen at a junction; three do not, and one of those three — the cyclist pass
 * — was being told «Правилно отстъпено предимство» for an act in which nobody
 * yielded anything. THEO-4 forbids announcing a decision without explaining it;
 * naming the wrong act is that failure one step earlier.
 *
 * THIS FILE LOCKS BOTH DIRECTIONS AND THE GENERAL FORM. The behaviour is driven
 * through the real reducer; the junction rows are asserted byte-identical (or
 * the distinctness checks would be vacuous); the `situation` stamp the wire
 * depends on is pinned on both sides; and the last describe walks the WHOLE
 * `modules/sim` source for every `yielded: true`, so the NEXT situation added
 * has to be classified here instead of quietly inheriting a junction claim. A
 * rule with one enforced instance is a convention.
 *
 * The client/server half of the same repair is gated where it happens:
 * `lessons/__tests__/wire.test.ts`, „a retitled praise survives the round-trip".
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { COMMENDATIONS, YIELD_PRAISE_SITUATION_COPY } from "../catalog";
import type { CommendationEvent, RuleEvent } from "../types";
import { drive, tick } from "./fixtures";

/** The pooled row's own claim — read, never restated, so a re-worded catalogue
 *  fails here rather than silently emptying the probe below. */
const POOLED = COMMENDATIONS.YIELDED_TO_PRIORITY;

/** „This sentence claims the act happened at a junction." */
const JUNCTION_CLAIM = /кръстовищ/i;

/**
 * The five situations whose yield really IS a junction yield, so the pooled row
 * is the right sentence and their drives may not change by a byte. Listed
 * rather than inferred: a new junction situation has to be considered here on
 * the day it ships, which is the whole point of the source sweep at the bottom.
 */
const JUNCTION_SITUATIONS = [
  "left-turn-oncoming",
  "right-hand-rule",
  "roundabout",
  "give-way",
  "cyclist-right-hook",
] as const;

/** The three that do not need a junction to happen. */
const OPEN_ROAD_SITUATIONS = ["emergency", "vulnerable-pass", "narrow-meeting"] as const;

function praises(events: RuleEvent[]): CommendationEvent[] {
  return events.filter(
    (e): e is CommendationEvent => e.kind === "commendation" && e.code === "YIELDED_TO_PRIORITY",
  );
}

/** One resolved yield of `situation`, driven through the real reducer. */
function yieldOf(situation: string): CommendationEvent[] {
  return praises(
    drive([
      tick(0, {
        speedKmh: 20,
        events: [{ kind: "prioritySituation", situation, violated: false, yielded: true }],
      }),
      tick(1, { speedKmh: 20 }),
    ]).events,
  );
}

describe("the yield commendation names the act it is praising", () => {
  it("POSITIVE CONTROL: all eight situations really do earn one praise each", () => {
    // Without this every distinctness assertion below would pass over eight
    // empty arrays — the shape of false pass this whole sweep exists to refuse.
    for (const s of [...JUNCTION_SITUATIONS, ...OPEN_ROAD_SITUATIONS]) {
      const p = yieldOf(s);
      expect(p, s).toHaveLength(1);
    }
  });

  it("OPEN ROW, PINNED: the unread pooled explanation still names a junction", () => {
    // NOT a teeth test any more, and the difference matters. Nothing in the
    // product renders a commendation's explanation, so this sentence reaches no
    // student and rewriting it here would have been prose with no reader. It is
    // pinned so the row cannot be recorded as closed while it still reads this
    // way — and so that the day a WHY surface for praise exists, this line fails
    // and sends whoever built it back to `YIELD_PRAISE_SITUATION_COPY`.
    expect(POOLED.explanationBg).toMatch(JUNCTION_CLAIM);
  });

  it("no open-road yield is TITLED as a junction yield any more", () => {
    // The sc-hz-accident-scene defect at the surface a student can see: an
    // ambulance on a straight street, and a cyclist pass in which nobody
    // yielded anything, both filed under «Правилно отстъпено предимство».
    for (const s of OPEN_ROAD_SITUATIONS) {
      const card = yieldOf(s)[0];
      expect(card.titleBg, s).not.toBe(POOLED.titleBg);
    }
  });

  it("the ambulance card names the act and credits the duty's own concept", () => {
    const card = yieldOf("emergency")[0];
    expect(card.titleBg).toMatch(/специален режим/i);
    // `conceptId` is the half the LEARNER MODEL reads (simulator/actions.ts →
    // learning feed), and it only gets there through the server's rebuild — see
    // the wire round-trip gate named in this file's header.
    expect(card.conceptId).toBe("c-emergency-priority");
  });

  it("THE MEASUREMENT: three open-road acts, three titles — was 1 string, now 3", () => {
    const cards = OPEN_ROAD_SITUATIONS.map((s) => yieldOf(s)[0]);
    expect(new Set(cards.map((c) => c.titleBg)).size).toBe(3);
  });

  it("the situation is stamped on the event only when it changed the copy", () => {
    // This field is not decoration: `lessons/wire.ts` serializes it as `detail`
    // and the server rebuilds the title from it. Absent on a pooled row is the
    // load-bearing half — it is what keeps every junction yield byte-identical
    // on the wire, and an unknown situation from ever inventing one.
    expect(yieldOf("emergency")[0].situation).toBe("emergency");
    expect(yieldOf("vulnerable-pass")[0].situation).toBe("vulnerable-pass");
    for (const s of JUNCTION_SITUATIONS) {
      expect(yieldOf(s)[0].situation, s).toBeUndefined();
    }
    expect(yieldOf("something-nobody-has-written-yet")[0].situation).toBeUndefined();
  });

  it("every junction yield is byte-identical to what shipped", () => {
    for (const s of JUNCTION_SITUATIONS) {
      const card = yieldOf(s)[0];
      expect(card.titleBg, s).toBe(POOLED.titleBg);
      expect(card.explanationBg, s).toBe(POOLED.explanationBg);
      expect(card.conceptId, s).toBe(POOLED.conceptId);
    }
  });

  it("an unknown situation falls back to the pooled row rather than to nothing", () => {
    // A situation this table has never heard of must degrade to shipped
    // behaviour, never to an empty card — the same asymmetry the collision
    // per-act copy is held to.
    const card = yieldOf("something-nobody-has-written-yet")[0];
    expect(card.titleBg).toBe(POOLED.titleBg);
    expect(card.explanationBg).toBe(POOLED.explanationBg);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   AND THE GENERAL FORM: every situation that CAN be praised is classified.

   The behaviour above is eight hand-written situations. The defect was that a
   ninth kind of act inherited a sentence written for a junction, and nothing
   said so — so the list is read off the two files that actually emit
   `yielded: true` instead of being maintained by hand here.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * THE WHOLE MODULE, not a list of two files. The first draft named
 * `runtime/worldRuntime.ts` and `orchestrator/runners.ts` by path, which is the
 * same shape as the defect: a THIRD emitter would have passed unnoticed, and
 * „no situation can inherit an unchecked claim" would have been true only of
 * the two files somebody remembered. Measured on this tree: 485 files, 341 ms,
 * and it finds exactly the eight situations the two known emitters produce — so
 * the widening costs a third of a second and removes the blind spot.
 *
 * `rules/catalog.ts` IS EXCLUDED, and not for speed: its header quotes the
 * runner's `{ situation: "emergency", yielded: true }` in prose, so leaving it
 * in would let the table certify its own rows by writing a comment about them.
 * A census may not read the thing it is auditing.
 */
const SWEEP_ROOT = join(__dirname, "..", "..");
const SWEEP_SELF = join(SWEEP_ROOT, "rules", "catalog.ts");

function emitterSources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    // Test sources are excluded for the same reason catalog.ts is: a fixture
    // may legitimately name a situation nothing ships.
    if (name === "__tests__" || name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) emitterSources(p, out);
    else if ((name.endsWith(".ts") || name.endsWith(".tsx")) && p !== SWEEP_SELF) out.push(p);
  }
  return out;
}

/**
 * Every `situation: "…"` that appears within a short window before a
 * `yielded: true` in the emitter source.
 *
 * A source scan and not a type: `prioritySituation.situation` is a plain
 * `string` on the contract (rules/types.ts), so there is no union for a
 * compiler to check this against — which is exactly how nine acts came to share
 * one sentence.
 */
function praisedSituations(): Set<string> {
  const found = new Set<string>();
  for (const file of emitterSources(SWEEP_ROOT)) {
    const src = readFileSync(file, "utf8");
    const yieldRe = /yielded:\s*true/gu;
    let m: RegExpExecArray | null;
    while ((m = yieldRe.exec(src)) !== null) {
      const window = src.slice(Math.max(0, m.index - 400), m.index);
      const sits = window.match(/situation:\s*"([^"]+)"/gu);
      if (sits === null || sits.length === 0) continue;
      const last = sits[sits.length - 1]!;
      const name = /situation:\s*"([^"]+)"/u.exec(last)?.[1];
      if (name !== undefined) found.add(name);
    }
  }
  return found;
}

describe("no praised situation can inherit a claim nobody checked", () => {
  it("the scan finds the emitters at all (the empty-corpus lesson)", () => {
    expect(praisedSituations().size).toBeGreaterThanOrEqual(8);
  });

  it("every situation the runtime can praise is either a junction or has its own copy", () => {
    const unclassified = [...praisedSituations()].filter(
      (s) =>
        !(JUNCTION_SITUATIONS as readonly string[]).includes(s) &&
        YIELD_PRAISE_SITUATION_COPY[s] === undefined,
    );
    expect(
      unclassified,
      `situation(s) ${unclassified.join(", ")} would be praised with the pooled junction ` +
        `sentence «${POOLED.explanationBg}». Add a row to YIELD_PRAISE_SITUATION_COPY ` +
        `(catalog.ts), or add the situation to JUNCTION_SITUATIONS if it really is one.`,
    ).toEqual([]);
  });

  it("…and no row in the table is dead — every keyed situation is really emitted", () => {
    // The other direction, and the one this programme has paid for repeatedly:
    // copy written for a situation nothing produces is a repair no student can
    // reach.
    const emitted = praisedSituations();
    const orphans = Object.keys(YIELD_PRAISE_SITUATION_COPY).filter((s) => !emitted.has(s));
    expect(orphans, `no emitter produces yielded:true for ${orphans.join(", ")}`).toEqual([]);
  });
});
