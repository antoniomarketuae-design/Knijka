/**
 * B58 — THE WORLD MAY NOT INSTRUCT THE FAULT IT IS ABOUT TO BILL.
 *
 * The founder's finding, on «Превишаване над +10 км/ч» (catalog 34): the
 * in-world gate bar across the lane read **«Карай дотук — не по-бързо от
 * 57 км/ч» on a street posted 50**, in the one drill whose entire subject is
 * that 51–60 км/ч in a 50 zone is a scored fault. His sentence for the class:
 * „a student who obeys the number the world shows him commits the mistake the
 * world is grading."
 *
 * The 57 was GENERATED, not authored: `scenario/params.ts` widenSpeedCap adds
 * SPEED_CAP_GRACE_KMH_PER_TOLERANCE × (tolerance − 1) km/h to every capped
 * waypoint on the aided rungs, and 52 + 5 = 57. The census taken when this row
 * was worked said it was a class, not an instance — **126** compiled reachZone
 * gates carried a cap above their district's posted limit, and **94 of them
 * were the ladder's doing**, including the motorway (authored 140 = posted 140,
 * L1 bar 145).
 *
 * THE INVARIANT THIS FILE PINS: the difficulty ladder may never lift a gate's
 * speed cap above the street's posted limit. It may still widen up TO the
 * limit, and it never tightens below what the template authored (the WIDEN-ONLY
 * rule in params.ts) — so a template that deliberately authored slack above its
 * own limit keeps exactly the graded cap it always had. What it may not do is
 * add more on top and print the result on the glass.
 *
 * The other half of the fix — the printed LABEL clamped to the sign even where
 * the AUTHORED cap sits above it — lives in `components/sim/RouteGuidance.tsx`
 * (`postedLimitAt` / `capLineBg`) and is pinned by its own test.
 */

import { describe, expect, it } from "vitest";
import { SCENARIO_TEMPLATES } from "../templates";
import { compileScenario } from "../compile";
import { serializeObjectiveParams } from "../params";
import type { ScenarioLevel } from "../types";
import { advisorPromptForObjective } from "../../advisor";

interface Row {
  scenario: string;
  level: number;
  objective: string;
  authored: number;
  compiled: number;
  posted: number;
}

function survey(): Row[] {
  const rows: Row[] = [];
  for (const spec of SCENARIO_TEMPLATES) {
    const postedRaw = spec.map.params["maxspeedKmh"];
    if (typeof postedRaw !== "number" || !Number.isFinite(postedRaw)) continue;
    for (const rung of spec.levels) {
      const level = rung.level as ScenarioLevel;
      const lesson = compileScenario(spec, level);
      for (const o of lesson.objectives) {
        if (o.kind !== "reachZone") continue;
        const compiled = (o.params as { maxSpeedKmh?: number }).maxSpeedKmh;
        if (compiled === undefined) continue;
        const src = spec.success.find((s) => s.id === o.id)?.params as
          | { maxSpeedKmh?: number }
          | undefined;
        const authored = src?.maxSpeedKmh;
        if (authored === undefined) continue;
        rows.push({
          scenario: spec.id,
          level,
          objective: o.id,
          authored,
          compiled,
          posted: postedRaw,
        });
      }
    }
  }
  return rows;
}

describe("B58 — a gate's speed cap never exceeds the posted limit by the ladder's doing", () => {
  const rows = survey();

  it("surveys a meaningful slice of the catalog (guards against a vacuous pass)", () => {
    expect(rows.length).toBeGreaterThan(100);
  });

  it("no compiled cap anywhere exceeds max(authored, posted)", () => {
    const bad = rows.filter((r) => r.compiled > Math.max(r.authored, r.posted));
    expect(
      bad.map(
        (r) =>
          `${r.scenario} L${r.level} ${r.objective}: authored ${r.authored}, posted ${r.posted}, compiled ${r.compiled}`,
      ),
    ).toEqual([]);
  });

  it("the founder's own gate: sc-speed-dangerous L1 compiles 52, not 57, on a street posted 50", () => {
    const l1 = rows.filter((r) => r.scenario === "sc-speed-dangerous" && r.level === 1);
    expect(l1.length).toBe(2); // sc-dng-hold + sc-dng-finish
    for (const r of l1) {
      expect(r.posted).toBe(50);
      expect(r.authored).toBe(52);
      expect(r.compiled).toBe(52);
    }
  });

  it("the motorway gate stops reading 145 on a road posted 140", () => {
    const l1 = rows.filter((r) => r.scenario === "sc-mw-discipline" && r.level === 1);
    expect(l1.length).toBeGreaterThan(0);
    for (const r of l1) expect(r.compiled).toBeLessThanOrEqual(r.posted);
  });

  it("the ladder STILL widens where the widened cap stays under the sign", () => {
    // Non-vacuity: the fix must not have turned the grace off wholesale. A
    // capped gate authored well below its limit still gains the full L1 grace.
    const widened = rows.filter((r) => r.level === 1 && r.compiled > r.authored);
    expect(widened.length).toBeGreaterThan(0);
    for (const r of widened) expect(r.compiled).toBeLessThanOrEqual(r.posted);
  });

  it("a caller with no map in hand (validate.ts's round-trip) behaves exactly as before", () => {
    const p = { kind: "reachZone", x: 0, y: 0, radiusM: 6, maxSpeedKmh: 52 } as const;
    expect(serializeObjectiveParams(p, 1.5).params.maxSpeedKmh).toBe(57);
    expect(serializeObjectiveParams(p, 1.5, 5, 50).params.maxSpeedKmh).toBe(52);
    // WIDEN-ONLY holds: an authored cap ABOVE its own posted limit is never
    // tightened by this clamp — that would be re-authoring, not de-inflating.
    expect(serializeObjectiveParams(p, 1.0, 5, 50).params.maxSpeedKmh).toBe(52);
    expect(serializeObjectiveParams({ ...p, maxSpeedKmh: 30 }, 1.5, 5, 50).params.maxSpeedKmh).toBe(35);
    // A halt demand is untouched at every rung, with or without a limit.
    expect(serializeObjectiveParams({ ...p, maxSpeedKmh: 5 }, 1.5, 5, 50).params.maxSpeedKmh).toBe(5);
  });
});

/**
 * THE THIRD CHANNEL. Photographing the fixed gate bar («не по-бързо от 50 км/ч»
 * on a street posted 50) put the ADVISOR card in the same frame, and it still
 * read the raw compiled cap: «Задръж под 50, докато потокът те подминава —
 * дръж под 52 км/ч». One sentence contradicting itself, in the instructor's
 * voice, in the drill that grades going over 50. The gate keeps grading 52 (the
 * authored number, untouched); the card is clamped to the sign.
 *
 * ── WHAT THE CONTRACT BECAME (rewritten 2026-08-18) ──────────────────────────
 *
 * B58 shipped a CLAMP: the card printed `params.maxSpeedKmh` unless a posted
 * limit was lower, in which case it printed the sign. sweep161 then found the
 * same crime one level out — where no sign is declared the clamp never bites,
 * and there the ladder's grace went straight onto the glass as an instruction —
 * and replaced the clamp with a SOURCE TEST, `spokenCapKmh` in `advisor.ts`. A
 * card may now speak a number only when it comes from one of exactly three
 * places: the halt band (cap ≤ 8, which `widenSpeedCap` never touches), the
 * AUTHOR'S own title, or a posted limit that BINDS — one strictly below the
 * gate. With none of the three the sentence is the authored title and nothing
 * else, because the only remaining candidate is the grader's tolerance, and
 * forgiveness at the gate was never a sentence to say to a student.
 *
 * That contract is strictly STRONGER than the one B58 pinned: `spokenCapKmh`
 * ends in `Math.min(visible, capKmh)` where `visible` already includes the
 * posted limit whenever it is below the gate, so no number it returns can
 * exceed a declared sign. B58's invariant is therefore unchanged, and it is not
 * weakened by a single line below:
 *
 *     A CARD MAY NEVER PRINT A SPEED NUMBER THE SIGN FORBIDS.
 *
 * ── WHAT HAD TO CHANGE IS THE INSTRUMENT ────────────────────────────────────
 *
 * B58's survey did `Number(/дръж под (\d+) км\/ч$/.exec(text)?.[1])` and asked
 * `!(printed <= posted)`. Against the new contract 224 of the 502 cards print no
 * number at all: the match is `undefined`, `Number(undefined)` is NaN, every
 * comparison with NaN is false, and the survey booked all 224 silent cards as
 * offenders — «printed NaN > posted 50», 224 times.
 *
 * It failed LOUD, which is luck rather than design. The same blindness one step
 * over — a survey that skips what it cannot parse — is the bug this project
 * keeps shipping and it fails QUIET: change the suffix wording and the probe
 * matches nothing, inspects nothing, and reports zero defects. So the reading
 * here is three-way and TOTAL, with no third state left implicit:
 *
 *   SILENT   the text is byte-identical to the objective's authored `titleBg`.
 *            That is a positive fact about the card, not the absence of a match.
 *   NUMBER   the remainder after that title parses as the canonical suffix.
 *   UNPARSED anything else — and it fails the suite rather than being skipped.
 *
 * „No number" and „the regex found no number" are the same observation to a
 * broken probe and opposite facts. Only the first is legal.
 *
 * MEASURED HERE, over every compiled rung of the 167 templates (385 lessons
 * declare a posted limit; the rest have no sign to be judged against):
 *
 *   502 reachZone cards carry a cap  ·  278 print a number (50 distinct titles)
 *   224 print none (46 titles)       ·  0 unparsed  ·  0 fractional km/h
 *   108 sit on a sign that BINDS (posted < gate) and all 108 speak it
 *   151 are halt demands (cap ≤ 8); the lowest posted limit in the catalog is
 *       30, so the halt band cannot out-run a sign here
 *
 * (advisor.ts's own census reads 953 / 494 — that is every template including
 * the ones that declare no limit, which this file has no sign to judge.)
 */

/** What one advisor card was found to say about speed. */
type CardReading =
  | { kind: "silent" }
  | { kind: "number"; printed: number }
  | { kind: "unparsed"; tail: string };

/**
 * The canonical suffix `advisorPromptForObjective` appends, anchored at both
 * ends. Anchoring matters: `sim-probe-traps` in this repo is a list of probes
 * that matched the wrong substring and reported comfort — one anchored on
 * /id:/ matched nested objective ids. Here the title is stripped by LENGTH
 * (never by regex, since authored copy contains regex metacharacters) and the
 * remainder must be the whole suffix or the card is UNPARSED.
 */
const SPOKEN_CAP_SUFFIX = /^ — дръж под (\d+(?:[.,]\d+)?) км\/ч$/;

function readCard(titleBg: string, textBg: string): CardReading {
  if (textBg === titleBg) return { kind: "silent" };
  if (!textBg.startsWith(titleBg)) return { kind: "unparsed", tail: textBg };
  const tail = textBg.slice(titleBg.length);
  const m = SPOKEN_CAP_SUFFIX.exec(tail);
  if (m === null) return { kind: "unparsed", tail };
  const printed = Number(m[1].replace(",", "."));
  if (!Number.isFinite(printed)) return { kind: "unparsed", tail };
  return { kind: "number", printed };
}

interface CardRow {
  lesson: string;
  objective: string;
  /** The street's declared limit — rows without one are not surveyed. */
  posted: number;
  /** The GRADED cap the gate enforces (author + the rung's grace). */
  cap: number;
  titleBg: string;
  textBg: string;
  reading: CardReading;
}

/** Every advisor card the compiled catalog can put on the glass beside a sign. */
function surveyAdvisorCards(): CardRow[] {
  const rows: CardRow[] = [];
  for (const spec of SCENARIO_TEMPLATES) {
    for (const rung of spec.levels) {
      const lesson = compileScenario(spec, rung.level as ScenarioLevel);
      const posted = lesson.postedLimitKmh;
      if (posted === undefined) continue;
      for (const o of lesson.objectives) {
        if (o.kind !== "reachZone") continue;
        const cap = (o.params as { maxSpeedKmh?: number }).maxSpeedKmh;
        // Halt demands are surveyed too (B58 pinned only the >8 band). The
        // invariant is about what is PRINTED, and a halt band prints a number.
        if (cap === undefined) continue;
        const textBg = advisorPromptForObjective(
          o.titleBg,
          { kind: "reachZone", x: 0, y: 0, radiusM: 1, maxSpeedKmh: cap },
          undefined,
          posted,
        ).textBg;
        rows.push({
          lesson: lesson.id,
          objective: o.id,
          posted,
          cap,
          titleBg: o.titleBg,
          textBg,
          reading: readCard(o.titleBg, textBg),
        });
      }
    }
  }
  return rows;
}

/**
 * THE JUDGEMENT, factored out so the catalog census and the adversarial case
 * below run through the SAME code. A survey that cannot be shown to convict is
 * not a survey; feeding a hand-built offender to a private copy of the rule
 * would prove nothing about the one the catalog is measured with.
 */
function overPostedOffenders(rows: readonly CardRow[]): string[] {
  const out: string[] = [];
  for (const r of rows) {
    if (r.reading.kind !== "number") continue;
    if (r.reading.printed > r.posted) {
      out.push(
        `${r.lesson} ${r.objective}: card says ${r.reading.printed} on a street posted ${r.posted} — «${r.textBg}»`,
      );
    }
  }
  return out;
}

/** A card the survey could not read at all — never silently skipped. */
function unreadableCards(rows: readonly CardRow[]): string[] {
  const out: string[] = [];
  for (const r of rows) {
    if (r.reading.kind !== "unparsed") continue;
    out.push(`${r.lesson} ${r.objective}: could not parse «${r.textBg}» against title «${r.titleBg}»`);
  }
  return out;
}

describe("B58 — the advisor card never says a number the sign forbids", () => {
  const cards = surveyAdvisorCards();

  it("the founder's own card: «Задръж под 50 …» no longer ends in „дръж под 52 км/ч“", () => {
    const lesson = compileScenario(
      SCENARIO_TEMPLATES.find((s) => s.id === "sc-speed-dangerous")!,
      1,
    );
    expect(lesson.postedLimitKmh).toBe(50);
    const first = lesson.objectives[0]!;
    expect((first.params as { maxSpeedKmh?: number }).maxSpeedKmh).toBe(52); // graded, unchanged
    const p = advisorPromptForObjective(
      first.titleBg,
      { kind: "reachZone", x: 0, y: 0, radiusM: 9, maxSpeedKmh: 52 },
      undefined,
      lesson.postedLimitKmh,
    );
    expect(p.textBg).toBe("Задръж под 50, докато потокът те подминава — дръж под 50 км/ч");
    expect(p.textBg).not.toContain("52");
  });

  it("the survey PARSED what it judged — 283 cards with a number, 224 without, 0 it could not read", () => {
    // THE GUARD AGAINST THE INSTRUMENT, and the reason the counts are spelt out
    // rather than left as `> 0`. If the suffix wording drifts, every card lands
    // in UNPARSED and this test names it; if the source test in advisor.ts is
    // ever loosened into silence-for-everything, the with-number population
    // collapses and this test names that instead. Either way the invariant
    // below stops being able to pass by inspecting nothing.
    // RE-BASELINED 502 → 507 on 2026-08-28 (wave 8, finding
    // sc-pk-move-off:d7d45a4c). `sc-pk-move-off/sc-pmo-moved` gained an authored
    // `maxSpeedKmh: 50`, and this survey admits any compiled reachZone with a cap
    // on a lesson that posts a limit, so its five rungs enter here too. With that
    // one objective withheld the survey measures exactly the committed 502.
    //
    // THE LIMB THAT MATTERS ON THIS FILE DID NOT MOVE, and it was measured before
    // the total was touched rather than inferred from a green run afterwards:
    // UNPARSED IS STILL 0, including across the five new rows. A card the survey
    // cannot read is a card whose number nobody is checking, so that limb moving
    // at all would have made this a regression and not a re-baseline.
    //
    // THE +5 LANDS ENTIRELY IN „SILENT", 219 → 224, and WITH-NUMBER DOES NOT MOVE
    // AT ALL (283). That is the correct bucket and not an evasion: this survey
    // calls `advisorPromptForObjective` with FOUR arguments on purpose — it
    // withholds the authored cap — and «Потегли и се нареди в дясната лента»
    // names no number of its own, so with nothing to read the card falls silent
    // here. It is the same shape the 2026-08-24 sc-sp-curve note below describes,
    // running in the opposite direction. A silent card prints no figure and so
    // cannot say a number the sign forbids: `overPostedOffenders` is still empty.
    // (The FIVE-argument card the product actually shows does speak — «дръж под
    // 50 км/ч» — and that is pinned next door in advisor-authored-cap and
    // advisor-sweep161, which is why the two censuses must be read together.)
    //
    // The test's NAME is corrected in the same breath: it still claimed „278 with
    // a number" after the 2026-08-24 re-measure had moved that half to 283, and a
    // census whose title contradicts its own assertion is the exact rot this file
    // was written to stop. Old name, for the ledger: „the survey PARSED what it
    // judged — 278 cards with a number, 224 without, 0 it could not read".
    expect(cards.length).toBe(507);
    expect(unreadableCards(cards)).toEqual([]);
    const withNumber = cards.filter((c) => c.reading.kind === "number");
    const silent = cards.filter((c) => c.reading.kind === "silent");
    // RE-MEASURED 2026-08-24 (w10-4, finding sc-sp-curve:289575d7): 278 → 283
    // with-number, 224 → 219 silent. The five are the five rungs of
    // sc-sp-curve/sc-spcv-curve. Its title used to defer to a number by name
    // («…с препоръчителната скорост») and this survey withholds the authored
    // cap on purpose, so with nothing to read the card fell silent here; the
    // title now names the табела's own 50 and source 2 reads it. Nothing moved
    // between the two populations except that one objective, and the total is
    // unchanged, which is what makes this a restatement and not a relaxation.
    expect(withNumber.length).toBe(283);
    expect(silent.length).toBe(224);
    // Both populations must stay non-trivial for the file to mean anything: a
    // catalog of only-silent cards proves nothing about numbers, and one with
    // no silent cards would mean the source test stopped biting.
    expect(withNumber.length).toBeGreaterThan(cards.length / 4);
    expect(silent.length).toBeGreaterThan(cards.length / 4);
  });

  it("no compiled lesson's advisor card prints a number above its own posted limit", () => {
    expect(overPostedOffenders(cards)).toEqual([]);
  });

  it("where the sign BINDS, the card still SPEAKS it — silence is not an answer to B58", () => {
    // THE OTHER DIRECTION OF THE SAME CRIME. An invariant phrased as a
    // prohibition („never print a number above the sign") is satisfied
    // perfectly by a card that says nothing at all, and a card that goes quiet
    // on the one street whose sign is stricter than its gate is the founder's
    // complaint inverted: he is told nothing, precisely where he is about to be
    // billed. So the 108 binding cards are pinned from the other side.
    const binding = cards.filter((c) => c.posted < c.cap);
    expect(binding.length).toBe(108);
    const mute = binding.filter((c) => c.reading.kind !== "number");
    expect(mute.map((c) => `${c.lesson} ${c.objective}: «${c.textBg}»`)).toEqual([]);
    for (const c of binding) {
      if (c.reading.kind !== "number") continue;
      expect(c.reading.printed).toBeLessThanOrEqual(c.posted);
    }
  });

  it("the survey CONVICTS an over-posted card, and never reads a mangled one as silence", () => {
    // A test that cannot fail is not a test. These four synthetic cards run
    // through `readCard`/`overPostedOffenders` — the same two functions the 502
    // real cards are measured with — and pin each verdict the census depends on.
    const at = (textBg: string, posted = 50): CardRow => {
      const titleBg = "Задръж под 50, докато потокът те подминава";
      return {
        lesson: "synthetic",
        objective: "syn-1",
        posted,
        cap: 52,
        titleBg,
        textBg,
        reading: readCard(titleBg, textBg),
      };
    };
    const title = "Задръж под 50, докато потокът те подминава";

    // 1. The founder's original defect, hand-built: it must convict.
    const over = at(`${title} — дръж под 57 км/ч`);
    expect(over.reading).toEqual({ kind: "number", printed: 57 });
    expect(overPostedOffenders([over])).toHaveLength(1);

    // 2. Correct behaviour is credited, and „equal to the sign" is correct.
    const atSign = at(`${title} — дръж под 50 км/ч`);
    expect(atSign.reading).toEqual({ kind: "number", printed: 50 });
    expect(overPostedOffenders([atSign])).toEqual([]);

    // 3. A card that prints no number is SILENT, not an offender — and it is
    //    recognised by matching the authored title exactly, not by a failed regex.
    const bare = at(title);
    expect(bare.reading).toEqual({ kind: "silent" });
    expect(overPostedOffenders([bare])).toEqual([]);

    // 4. THE ONE THAT MATTERS. A card whose suffix drifted must NOT read as
    //    silence — that is the reassuring-direction failure, a survey that
    //    inspects nothing and reports nothing. It reads as UNPARSED and the
    //    parse-rate test above turns red.
    for (const mangled of [
      `${title} — дръж под км/ч`, // the number vanished
      `${title} — keep under 57 kmh`, // the wording drifted
      `${title} — дръж под 57 км/ч.`, // a trailing byte the anchor rejects
      `Друг текст — дръж под 57 км/ч`, // not even this objective's title
    ]) {
      const row = at(mangled);
      expect(row.reading.kind).toBe("unparsed");
      expect(unreadableCards([row])).toHaveLength(1);
      expect(overPostedOffenders([row])).toEqual([]); // unparsed is never judged…
    }
    // …which is exactly why the parse-rate test is not optional.
  });

  it("no posted limit in hand — the sign clamp adds nothing and takes nothing away", () => {
    // WHAT THIS TEST USED TO SAY, and why it could not stand. B58's version
    // asserted the card was „byte-identical" without a limit — meaning it still
    // printed the raw `maxSpeedKmh`, 52, on a title that never mentions a
    // number. sweep161 deliberately ended that: with no sign and no authored
    // figure the 52 is the grader's tolerance and nothing else. The claim B58
    // actually owns survives intact — the sign clamp only ever LOWERS, so
    // removing the sign can never raise what is printed.
    const params = { kind: "reachZone", x: 0, y: 0, radiusM: 9, maxSpeedKmh: 52 } as const;

    // No sign, no authored figure ⇒ no number is invented; the authored
    // sentence is all that is said.
    expect(advisorPromptForObjective("Стигни зоната", params).textBg).toBe("Стигни зоната");

    // The AUTHOR'S own ceiling is not the sign clamp's doing: it is printed
    // with a map in hand and without one, and identically. (Two different
    // outcomes from the same 52 — no blanket behaviour satisfies both this and
    // the line above, which is what makes the pair worth pinning.)
    expect(advisorPromptForObjective("Мини зоната под 40 км/ч", params).textBg).toBe(
      "Мини зоната под 40 км/ч — дръж под 40 км/ч",
    );
    expect(advisorPromptForObjective("Мини зоната под 40 км/ч", params, undefined, 90).textBg).toBe(
      "Мини зоната под 40 км/ч — дръж под 40 км/ч",
    );

    // A limit ABOVE the gate says nothing about this zone and must not loosen
    // the author's number (sc-sp-curve: street 90, A1 plate 50, gate 52).
    expect(advisorPromptForObjective("Стигни зоната", params, undefined, 90).textBg).toBe(
      "Стигни зоната",
    );

    // …and a HALT demand is never turned into a limit by the clamp.
    expect(
      advisorPromptForObjective("Спри тук", { ...params, maxSpeedKmh: 5 }, undefined, 50).textBg,
    ).toBe("Спри тук — дръж под 5 км/ч");
  });
});
