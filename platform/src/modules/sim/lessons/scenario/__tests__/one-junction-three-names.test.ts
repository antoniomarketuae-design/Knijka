/**
 * =============================================================================
 * ONE JUNCTION UNDER THREE NAMES — and one junction the briefing never
 * mentioned had a light on it.
 *
 * Four findings from the 161-lesson sweep were routed to `lessons/specs.ts` and
 * belong to none of it: every one of them is a scenario TEMPLATE. Three are the
 * same defect seen three times, and the fourth is its mirror image.
 *
 *   sc-turn-left-oncoming:017da1c4   critical
 *     frame .audit-frames/sweep161/sc-turn-left-oncoming/pc-right/04-t043s.png
 *     quote «Чакаш правилно на червено. Тръгваш на зелено — след като видиш,
 *            че кръстовището е свободно.»
 *     A red lamp burning at the mouth, a coach card congratulating the student
 *     for waiting on it — and, in the same screenshot, five briefing steps that
 *     describe an UNSIGNALISED left turn whose only decision is a gap counted
 *     in seconds. The map (`sx-v1`, meta.scenario.expectedControl
 *     "trafficLight") was right, the coach was right; the briefing was the one
 *     surface nobody had told there is a light.
 *
 *   sc-junction-stop:dab712b8 · sc-junction-scan:282e3c33 ·
 *   sc-junction-gap:73564f66   major, all three quoting the SAME sentence off
 *     three different frames: «Завий надясно и излез от кръстовището на изток».
 *     Three separately-named drills whose task chips read identically.
 *
 * WHY THE CHIPS AND NOT THE ROUTE. `sc-junction-stop` and `sc-junction-scan`
 * share tj-stop-v1, the same spawn and the same three gate COORDINATES; those
 * cannot move (the sc-tj-traces battery replays committed drives through them,
 * and `signal-stop-line-window.test.ts` pins this very approach zone's far edge
 * at 25.46 m from the paint). The chips are the only surface left that can tell
 * a student which drill he is in — and the findings measure exactly that:
 * „near-identical objective wording", „word-for-word identical".
 *
 * WHAT THIS FILE ASSERTS, and why each half is here:
 *
 *   §1  the three repaired drills share NO objective title with any other
 *       shipped template — a LAW over the rows this lane owns, not a list;
 *   §2  the duplicate-chip class as a whole may shrink but never grow;
 *   §3  a banner that names N км/ч sits on a gate that really caps at N, and
 *       the three repaired chips deliberately name none (see the note there —
 *       a figure in a briefing is a source the ADVISOR lane censuses);
 *   §4  a drill sited on a map whose committed world file declares
 *       expectedControl "trafficLight" must SAY there is a light;
 *   §5  the matchers have teeth: each is run against the exact string this
 *       lane replaced and against a neighbour it must not convict;
 *   §6  a `passSignal` chip may not certify an interval it cannot witness —
 *       added 2026-08-25 with the last Б2 pair (see the block there);
 *   §7  the three Б2 drills stand on three different STREETS, not three
 *       different sentences — the clause §1/§2 structurally cannot answer
 *       (`sc-junction-scan:28e782ab`; the block there says why the manoeuvre
 *       axis was exhausted and the world had to move instead).
 *
 * SCOPE, stated so the silences are deliberate. `sc-junction-gap` and
 * `sc-junction-left` BOTH live in templates-junctions2.ts (SC_JUNCTION_GAP at
 * its head, SC_JUNCTION_LEFT ~309 lines below) — this paragraph used to file
 * the second one in templates-junctions3.ts and the correction is worth
 * recording rather than quietly fixing, because that mistake is precisely what
 * let the pair sit on §2's ratchet as „another lane's file" for a wave. That
 * file carries an OPEN critical of its own (`sc-junction-blind:dea35510`),
 * which is still not this lane's; the two chips the pair shared were closed on
 * 2026-08-25 in the file itself and the row is named in §2. The same
 * other-lane logic still applies to `sc-rx-tram-left` (templates-rail.ts, two
 * open criticals), the one remaining drill that stands on a signalized map and
 * never says so — §4 names it as the routed row it is.
 * =============================================================================
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SCENARIO_TEMPLATES } from "../templates";
import type { ScenarioSpec } from "../types";

const ALL: readonly ScenarioSpec[] = SCENARIO_TEMPLATES;

/** The three rows this lane repaired in templates-junctions.ts. */
const REPAIRED = ["sc-junction-stop", "sc-junction-scan", "sc-turn-left-oncoming"] as const;

const specOf = (id: string): ScenarioSpec => {
  const s = ALL.find((x) => x.id === id);
  if (!s) throw new Error(`no shipped template ${id}`);
  return s;
};

// ---------------------------------------------------------------------------
// §1 — the repaired drills no longer speak in each other's words
// ---------------------------------------------------------------------------

describe("§1 a repaired drill's task chips are its own", () => {
  it("the corpus is real (a sweep over nothing passes every law below)", () => {
    expect(ALL.length).toBeGreaterThanOrEqual(160);
    for (const id of REPAIRED) expect(specOf(id).success.length).toBeGreaterThanOrEqual(2);
  });

  for (const id of REPAIRED) {
    it(`${id}: no objective title of it appears on any other template`, () => {
      const spec = specOf(id);
      const clashes: string[] = [];
      for (const objective of spec.success) {
        for (const other of ALL) {
          if (other.id === spec.id) continue;
          if (other.success.some((o) => o.titleBg === objective.titleBg)) {
            clashes.push(`${objective.id} «${objective.titleBg}» — also on ${other.id}`);
          }
        }
      }
      expect(
        clashes,
        `${id} hands the student chips another drill also hands him:\n${clashes.join("\n")}`,
      ).toEqual([]);
    });
  }

  it("the three Б2 drills the findings name are pairwise distinct, chip for chip", () => {
    // The finding's own claim, pinned at row level: sc-junction-gap is NOT
    // edited by this lane, so this passes because the two rows that WERE edited
    // moved off its words — never because the census went quiet.
    const trio = ["sc-junction-stop", "sc-junction-scan", "sc-junction-gap"].map(specOf);
    for (let i = 0; i < trio.length; i++) {
      for (let j = i + 1; j < trio.length; j++) {
        const a = new Set(trio[i].success.map((o) => o.titleBg));
        const shared = trio[j].success.map((o) => o.titleBg).filter((t) => a.has(t));
        expect(
          shared,
          `${trio[i].id} and ${trio[j].id} still share ${shared.length} chip(s)`,
        ).toEqual([]);
      }
    }
    // …and each still names its OWN subject somewhere in its chips, so the
    // three were separated by saying more, not by saying less.
    const chips = (id: string) => specOf(id).success.map((o) => o.titleBg).join(" ").toLowerCase();
    expect(chips("sc-junction-stop")).toContain("спиране");
    expect(chips("sc-junction-scan")).toContain("оглед");
    expect(chips("sc-junction-gap")).toContain("интервал");
  });
});

// ---------------------------------------------------------------------------
// §2 — the class may shrink, never grow
// ---------------------------------------------------------------------------

/** Every pair of shipped templates that hands the student two or more of the
 *  same task chips — the shape a student reads as „I have driven this before". */
function duplicateChipPairs(): string[] {
  const out: string[] = [];
  for (let i = 0; i < ALL.length; i++) {
    for (let j = i + 1; j < ALL.length; j++) {
      const a = new Set(ALL[i].success.map((o) => o.titleBg));
      const shared = ALL[j].success.map((o) => o.titleBg).filter((t) => a.has(t));
      if (shared.length >= 2) out.push(`${ALL[i].id} ~ ${ALL[j].id}`);
    }
  }
  return out.sort();
}

/**
 * The census as it stands AFTER this lane's repair, each row with the files it
 * lives in. Every one of them is another lane's to fix; the point of pinning
 * them is that the class is on the record and cannot quietly grow.
 *
 * Three rows LEFT this list with the repair, and they are named in §1:
 *   sc-junction-stop ~ sc-junction-scan · ~ sc-junction-gap · scan ~ gap
 *
 * A FOURTH LEFT IT ON 2026-08-25 (w10-2, sc-junction-gap:73564f66): the
 * `sc-junction-gap ~ sc-junction-left` row above was the „another lane's to
 * fix" one, and that lane came. `templates-junctions2.ts` gave the gap drill
 * its own two chips — it is the drill about COUNTING THE INTERVAL, and
 * sc-junction-left is the one about turning across the priority road. The row
 * is DELETED rather than left standing at zero, on this list's own discipline:
 * a stale entry cannot quietly stop being true, and a deleted one makes the
 * pair's return a failure instead of a shrug.
 */
const KNOWN_DUPLICATE_PAIRS: readonly string[] = [
  "sc-crossing-let-pass ~ sc-crossing-dart", //            templates-pe.ts
  "sc-crossing-let-pass ~ sc-crossing-slow-crosser", //    templates-pe.ts
  "sc-crossing-slow-crosser ~ sc-crossing-dart", //        templates-pe.ts
  "sc-junction-rhr ~ sc-vu-emergency-junction", // junctions.ts ~ vru.ts
  "sc-rx-guarded ~ sc-rx-barrier-drop", //                 templates-rail.ts
  "sc-vp-stall ~ sc-vp-handbrake", //                      templates-cockpit.ts
  "sc-zebra-approach ~ sc-crossing-dart", //               templates-pe.ts
  "sc-zebra-approach ~ sc-crossing-let-pass", //           templates-pe.ts
  "sc-zebra-approach ~ sc-crossing-slow-crosser", //       templates-pe.ts
];

describe("§2 the duplicate-chip class is a ratchet", () => {
  it("no pair of drills shares two chips that did not already", () => {
    const now = duplicateChipPairs();
    const fresh = now.filter((p) => !KNOWN_DUPLICATE_PAIRS.includes(p));
    expect(
      fresh,
      `new duplicate task lists:\n${fresh.join("\n")}\n` +
        `Two drills that read the same are one drill with two names — give the ` +
        `new one its own words, or add the row here WITH the reason.`,
    ).toEqual([]);
    // Subset, not equality: another lane fixing its own row must not turn this
    // file red. Growth is the defect; shrinkage is the programme working.
    expect(now.length).toBeLessThanOrEqual(KNOWN_DUPLICATE_PAIRS.length);
  });

  it("the three rows this lane closed are really gone", () => {
    const now = duplicateChipPairs();
    for (const pair of [
      "sc-junction-stop ~ sc-junction-scan",
      "sc-junction-stop ~ sc-junction-gap",
      "sc-junction-scan ~ sc-junction-gap",
      // 2026-08-25 — the last Б2 pair, closed in templates-junctions2.ts. Named
      // here rather than only removed from the list above, so restoring either
      // chip fails with the pair's name instead of with a count.
      "sc-junction-gap ~ sc-junction-left",
    ]) {
      expect(now, `${pair} is back`).not.toContain(pair);
    }
  });
});

// ---------------------------------------------------------------------------
// §3 — a banner that names a speed names the gate's own cap
// ---------------------------------------------------------------------------

/**
 * A NUMBER IN A BANNER IS A CLAIM LIKE ANY OTHER — the title-truth law applied
 * to a quantity instead of a duty. Ten shipped chips print a km/h figure, and
 * each is only worth reading if the gate underneath is the thing that enforces
 * it.
 *
 * BOTH DIRECTIONS ARE WRONG, which is why the band has two edges:
 *   · cap BELOW the printed number ⇒ a student who drives exactly what the chip
 *     says is refused by the chip's own gate — a false refusal;
 *   · cap far ABOVE it ⇒ the chip prints a demand the gate never makes, and a
 *     drive 20 km/h over the printed figure still ticks green.
 *
 * THE CEILING IS MEASURED, NOT CHOSEN. Every shipped banner of this shape sits
 * at or just above its printed figure: 6/6, 30/30, 45/45, 75/75, 110/110,
 * 50/52, 30/33, 40/43. The widest is 33 on a printed 30 — a tolerance of
 * exactly 10 %. So the band is [N, N × 1.1] with a hair of float slack, and it
 * is the corpus's own habit rather than a number invented here.
 *
 * WHY THE THREE REPAIRED CHIPS CARRY NO FIGURE, recorded because the first
 * draft of this repair did. Their gates DO cap (30 / 30 / 40 km/h) and printing
 * that would have been true — but a km/h figure in a briefing is one of the four
 * sources `lessons/__tests__/advisor-authored-cap.test.ts` counts to decide what
 * the advisor may speak, and its census moved by fifteen the moment they were
 * added. That census is the advisor lane's instrument, and this lane does not
 * edit another lane's instrument to make its own change fit. So the last
 * assertion below is the interlock in the other direction: it pins that these
 * three chips stay figure-free, so a later author who wants the number is told,
 * in the failure message, to re-measure that census in the same change.
 */
const KMH_IN_TITLE = /(\d+)\s*км\/ч/;
const CAP_TOLERANCE = 1.1;

/**
 * ⚠ EXTENDED 2026-08-24 (w10-4, finding sc-mw-min-speed:2545554a) — A CEILING
 * AND A TARGET ARE NOT THE SAME CLAIM, AND THE LAW ABOVE ONLY EVER JUDGED ONE.
 *
 * Every one of the ten banners the block above measured writes its figure as a
 * CEILING — „…под N км/ч" — so „the gate's own cap, ±10 %" was the whole of the
 * rule and nothing tested the premise. `sc-mw-min-speed` is the lesson where the
 * premise fails: its subject is NOT CRAWLING on a motorway
 * («общ задължителен минимум няма, но кола, която пълзи с 40 в поток от 130, е
 * подвижно препятствие»), its gate is the posted 140, and the number the
 * student needs is the RHYTHM the briefing teaches — «около 110 км/ч». On
 * `.audit-frames/w10-1/frames/sc-mw-min-speed__pc-right/01-arrival.png` the only
 * figure on the glass was «дръж под 140 км/ч»: a maximum, on the drill about
 * minimums.
 *
 * THE LAW'S OWN TWO EDGES DECIDE THIS, they were just never asked about a
 * target:
 *   · the FALSE-REFUSAL edge applies unchanged and is kept — a printed figure
 *     above the gate would refuse the student who drove exactly what he read.
 *   · the „a demand the gate never makes" edge is precisely what the Bulgarian
 *     construction answers. «под N» IS a demand and stays inside the ±10 % band.
 *     «около N» is not one, and reading it as one is the misread that produced
 *     the mutation this repair was proved against: with `advisor.ts titleCapKmh`
 *     still taking every figure as a ceiling, the card printed «дръж под 110
 *     км/ч» on a motorway — the lesson coaching the fault it exists to teach
 *     against.
 *
 * SO A TARGET IS HELD TO A DIFFERENT TEST — STRICTER ON ONE AXIS AND, SAY IT
 * PLAINLY, LOOSER ON THE OTHER. An adversarial read of the first draft of this
 * block (verifier, lane r10) caught the summary claiming the ±10 % band was
 * „kept verbatim". IT IS NOT KEPT FOR TARGETS, and it cannot be: the band asks
 * `cap > said * 1.1`, and 140 > 121 — the gate stands 27,3 % above the printed
 * 110 (the rhythm sits 21,4 % below the gate, the same gap read from the other
 * end). So the ceiling band would fail the one banner this extension exists to
 * allow. `badSpeedBanner` returns on the target branch BEFORE the band is ever
 * evaluated. What a target must satisfy is:
 *   · at or under the gate — the false-refusal edge, kept for BOTH kinds;
 *   · the SAME figure must appear in the lesson's own authored briefing. No
 *     ceiling is asked that, and it is what stops „target" becoming the loophole
 *     through which an invented number reaches a chip: 110 is on the glass
 *     because briefing step 2 says «установи се около 110 км/ч в ДЯСНАТА лента»,
 *     and if that sentence ever loses the number the banner fails with it;
 *   · and the target must be one the corpus census below already names. The
 *     distance from the gate is unbounded by construction — a taught rhythm is
 *     not the gate's own figure and no arithmetic relates them — so what is
 *     bounded instead is the SET. A third target cannot appear silently; it
 *     turns the census red and has to be argued in the change that adds it.
 *     That is the whole of the guard: reviewed, not measured.
 *
 * THE CEILING CENSUS IS UNCHANGED — 6/6, 30/30, 45/45, 75/75, 110/110, 50/52,
 * 30/33, 40/43, plus sc-spcv-curve's 50/55 (9,1 %, inside the band) added in the
 * same wave. Two banners are targets and both are sc-mw-min-speed's.
 */
const CEILING_FIGURE =
  /(?:под|до|не повече от|максимум|препоръчителните|препоръчителна|препоръчителни)\s+(\d+)\s*км\/ч/u;
/**
 * …AND A TARGET MAY BE A BAND, WHICH THIS DID NOT READ (2026-08-25,
 * `sc-mw-min-speed:f3c26187`). The two motorway drills run on the same rendered
 * road and taught two different rhythms — 110 here against the sibling's
 * 120–130 — and the sibling's form is the one the staged flow actually drives
 * (`sp-mw-flow-visible` §1: cruiseSpeedMps 33 → 36, i.e. 119 → 130 км/ч). So the
 * chip now prints the band.
 *
 * WITHOUT THE OPTIONAL LOW END BELOW, «около 120–130 км/ч» matched neither
 * `TARGET_FIGURE` nor `CEILING_FIGURE`, and `speedBanners` fell through to the
 * bare `KMH_IN_TITLE` — which reads 130 and, having no construction to go on,
 * classifies it as a CEILING. Both rows would have left the target census
 * silently (measured: the named set below went to `[]`) and been judged by the
 * ±10 % ceiling band instead. A guard that stops seeing the two rows it was
 * written to bound is the „green by absence" this repo keeps finding.
 *
 * THE TOP OF THE BAND IS THE FIGURE, deliberately: `badSpeedBanner`'s first
 * clause is `cap < said` — the false-refusal edge, kept for both kinds — so
 * taking the top is the direction that CONVICTS a band whose upper end climbs
 * past its own gate, and taking the low end would hide exactly that.
 */
const TARGET_FIGURE = /(?:около|поне|не под|минимум)\s+(?:\d+\s*[–-]\s*)?(\d+)\s*км\/ч/u;

interface SpeedBanner {
  scenarioId: string;
  objectiveId: string;
  titleBg: string;
  said: number;
  cap: number | undefined;
  kind: string;
  /** „ceiling" — a demand; „target" — the taught figure. See the block above. */
  claim: "ceiling" | "target";
  /** Every «N км/ч» the lesson's own authored briefing states. */
  briefingFigures: number[];
}

function speedBanners(): SpeedBanner[] {
  const out: SpeedBanner[] = [];
  for (const spec of ALL) {
    const briefingFigures = [
      ...spec.instructionsBg
        .map((s) => s.textBg)
        .join(" | ")
        .matchAll(/(\d+)\s*км\/ч/gu),
    ].map((m) => Number(m[1]));
    for (const objective of spec.success) {
      const m = KMH_IN_TITLE.exec(objective.titleBg);
      if (!m) continue;
      const p = objective.params as { kind: string; maxSpeedKmh?: number };
      const target = TARGET_FIGURE.exec(objective.titleBg);
      const ceiling = CEILING_FIGURE.exec(objective.titleBg);
      out.push({
        scenarioId: spec.id,
        objectiveId: objective.id,
        titleBg: objective.titleBg,
        said: Number((target ?? ceiling ?? m)[1]),
        cap: p.maxSpeedKmh,
        kind: p.kind,
        // A bare figure with no construction around it is judged as a ceiling,
        // which is the conservative reading: it keeps the ±10 % band on
        // anything an author writes without saying what kind of number it is.
        claim: target !== null && ceiling === null ? "target" : "ceiling",
        briefingFigures,
      });
    }
  }
  return out;
}

const badSpeedBanner = (b: SpeedBanner): boolean => {
  if (b.cap === undefined || b.cap < b.said) return true;
  if (b.claim === "target") return !b.briefingFigures.includes(b.said);
  return b.cap > b.said * CAP_TOLERANCE + 0.001;
};

describe("§3 a banner that prints a speed is standing on the gate that enforces it", () => {
  it("the corpus is populated (a law over an empty set proves nothing)", () => {
    const banners = speedBanners();
    expect(banners.length).toBeGreaterThanOrEqual(10);
    // Named so the sweep is demonstrably reading real rows, not an empty scan.
    const ids = banners.map((b) => `${b.scenarioId}/${b.objectiveId}`);
    expect(ids).toContain("sc-ov-narrow/sc-ovn-wait");
    expect(ids).toContain("sc-speed-zone/sc-zn-under-limit");
  });

  it("every printed figure is the gate's own cap, within the corpus's 10 % tolerance", () => {
    const liars = speedBanners()
      .filter(badSpeedBanner)
      .map(
        (b) =>
          `${b.scenarioId}/${b.objectiveId} (${b.kind}) prints ${b.said} км/ч, gate caps at ` +
          `${b.cap ?? "nothing at all"} — «${b.titleBg}»`,
      );
    expect(liars, liars.join("\n")).toEqual([]);
  });

  it("the target branch is a NAMED set of two, not an open door", () => {
    // WHY THIS EXISTS (2026-08-24, verifier r10). The clause above stops
    // judging a target the moment it reads `claim === "target"`, so the ±10 %
    // band never runs on one and a target may sit arbitrarily far below its
    // gate. That is deliberate — see the block above — but „deliberate" is not
    // „bounded". This is the bound: the corpus is allowed exactly these two
    // targets, both on the one drill whose subject is a minimum. Anything else
    // that reaches the loose branch is listed here by name in the failure and
    // has to be argued, with a re-measurement, in the change that authors it.
    const targets = speedBanners()
      .filter((b) => b.claim === "target")
      .map((b) => `${b.scenarioId}/${b.objectiveId} says ${b.said} км/ч under a gate of ${b.cap}`);
    // 2026-08-25: the two rows are the same two; the FIGURE moved, from 110 to
    // the top of the «около 120–130 км/ч» band the sibling drill and the staged
    // flow both name (sc-mw-min-speed:f3c26187). The set is still two.
    expect(targets, targets.join("\n")).toEqual([
      "sc-mw-min-speed/sc-mwms-join says 130 км/ч under a gate of 140",
      "sc-mw-min-speed/sc-mwms-hold says 130 км/ч under a gate of 140",
    ]);
  });

  it("…and a band still has to be IN the briefing, both ends of it", () => {
    // The target branch's real guard is „the same figure appears in the
    // lesson's own authored briefing", and a band widens the surface that has
    // to agree. Both ends are checked here, on the compiled chips rather than
    // on the constant, so an author who moves the briefing and leaves the chip
    // (or the reverse — the exact half-fix the previous round HELD this repair
    // over) fails on whichever half stayed behind.
    const spec = ALL.find((s) => s.id === "sc-mw-min-speed");
    expect(spec, "sc-mw-min-speed left the registry").toBeDefined();
    const briefing = spec!.instructionsBg.map((s) => s.textBg).join(" | ");
    for (const objective of spec!.success) {
      const band = /около\s+(\d+)\s*[–-]\s*(\d+)\s*км\/ч/u.exec(objective.titleBg);
      if (!band) continue;
      expect(briefing, `${objective.id}: the band's low end is not in the briefing`).toContain(
        `${band[1]}–${band[2]} км/ч`,
      );
    }
    // …and the sweep is not vacuous: this drill really does print a band.
    expect(spec!.success.some((o) => /около\s+\d+\s*[–-]\s*\d+\s*км\/ч/u.test(o.titleBg))).toBe(
      true,
    );
  });

  it("sc-spcv-curve sits ON the ±10 % edge, and the margin is 0,001 км/ч", () => {
    /*
     * RAISED BY THE VERIFIER (r10 §10), AND ITS ARITHMETIC CORRECTED HERE — the
     * fragility is real, the stated mechanism was not, and both belong on the
     * record because the wrong one would send the next reader after the wrong
     * line.
     *
     * THE CLAIM: „`50 * 1.1` is 55.00000000000001, so without the `+ 0.001`
     * this row would be RED today." MEASURED: `50 * 1.1` is
     * 55.000000000000007105 — the product rounds UP, i.e. in the PASSING
     * direction, so `55 > 50 * 1.1` is already false and deleting the epsilon
     * changes nothing. I ran that mutation: 19/19 still green. The epsilon is
     * insurance against the rounding going the other way, not the thing
     * carrying this row.
     *
     * WHAT IS TRUE, AND IS WHY THIS TEST EXISTS: sc-spcv-curve prints 50 under a
     * gate of 55, which is 10,000 % — not „inside the band" but exactly ON it.
     * Total margin 0,001 км/ч, all of it the epsilon. MEASURED at CAP_TOLERANCE
     * 1.09, three rows convict, not one — this curve plus the two 30/33 pairs
     * (`sc-speed-creep/sc-crp-zone`, `sc-speed-zone/sc-zn-under-limit`) that
     * predate this wave and sit on the same edge. So the band is already
     * saturated: it has no headroom to give and this wave took none. A tightening
     * would read as three unrelated copy bugs; the assertion below makes it read
     * as what it is.
     */
    const curve = speedBanners().find((b) => b.objectiveId === "sc-spcv-curve");
    expect(curve, "sc-spcv-curve no longer prints a figure — re-derive this row").toBeDefined();
    expect([curve!.said, curve!.cap]).toEqual([50, 55]);
    expect(badSpeedBanner(curve!), "sc-spcv-curve fell out of the ±10 % band").toBe(false);

    const marginKmh = curve!.said * CAP_TOLERANCE + 0.001 - curve!.cap!;
    expect(
      marginKmh > 0 && marginKmh < 0.01,
      `sc-spcv-curve's headroom under the band is now ${marginKmh.toFixed(6)} км/ч, not ~0,001. ` +
        `CAP_TOLERANCE moved (${CAP_TOLERANCE}) or the curve's 50/55 pair did. Either is allowed — ` +
        `restate this margin and the ceiling census in the block above, in the SAME change.`,
    ).toBe(true);
  });

  it("the three repaired chips print no figure — the advisor census depends on it", () => {
    // THE OTHER DIRECTION, and the reason it is asserted rather than assumed.
    // These three gates really do cap (30 / 30 / 40 km/h) and printing the
    // figure would satisfy the law above — but a km/h figure in a briefing is a
    // source the advisor coaches from, counted by the advisor lane's own
    // census. Adding one here without re-measuring that census turns a green
    // suite red somewhere else.
    for (const [scenarioId, objectiveId] of [
      ["sc-junction-stop", "sc-jstop-approach"],
      ["sc-junction-scan", "sc-jscan-approach"],
      ["sc-turn-left-oncoming", "sc-ltap-approach"],
    ] as const) {
      const objective = specOf(scenarioId).success.find((o) => o.id === objectiveId)!;
      expect(
        KMH_IN_TITLE.test(objective.titleBg),
        `${scenarioId}/${objectiveId} now prints a km/h figure: «${objective.titleBg}». ` +
          `That is allowed — but it is a fourth source for the advisor, so re-measure ` +
          `lessons/__tests__/advisor-authored-cap.test.ts's census in the SAME change ` +
          `(it moved by 15 when this lane tried it) and restate the numbers there.`,
      ).toBe(false);
      // …and the gates they stand on are still the caps, untouched by the copy
      // repair: a rewrite that quietly moved a gate would pass every string
      // assertion in this file.
      const p = objective.params as { kind: string; maxSpeedKmh?: number };
      expect(p.kind, `${objectiveId} kind`).toBe("reachZone");
      expect(p.maxSpeedKmh, `${objectiveId} cap`).toBe(scenarioId === "sc-turn-left-oncoming" ? 40 : 30);
    }
  });
});

// ---------------------------------------------------------------------------
// §4 — a drill on a signalized map has to say there is a light
// ---------------------------------------------------------------------------

/**
 * THE CRITICAL FINDING AS A CLASS. The world file is the authority, not the
 * template: `content/world/<district>.json` → `meta.scenario.expectedControl`
 * is the map generator's own declaration of what controls its graded junction,
 * and nine shipped maps declare "trafficLight" (sx-v1, sxc/sxd/sxf/sxh/sxr-v1,
 * ln-arrows-v1, pe-jay-v1, sig-wave-v1). Nineteen templates stand on them.
 *
 * A big district is deliberately OUT of scope: `d2-v1` has nine signalized
 * intersections and no `expectedControl`, because on a city map the graded act
 * need not happen at a light at all. This gate asks only about maps built
 * around ONE signalized junction, where the student cannot miss it.
 */
const SIGNAL_WORD = /светофар|зелено|червено|жълто/i;

function expectedControlOf(districtId: string): string | undefined {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${districtId}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${districtId}.json`),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const d = JSON.parse(fs.readFileSync(file, "utf8")) as {
      meta?: { scenario?: { expectedControl?: string } };
    };
    return d.meta?.scenario?.expectedControl;
  }
  throw new Error(`district ${districtId}.json not found`);
}

/**
 * THE BRIEFING IS THE NUMBERED STEPS, AND ONLY THEM — VERIFIER'S REPAIR.
 *
 * This read `[objectiveBg, ...steps]`, and joining the two made the gate blind
 * to the very defect it was written for. Measured, not argued: revert
 * `instructionsBg` to the exact five steps photographed on
 * `04-t043s.png` — the unsignalised briefing the critical finding was filed
 * against — while leaving the new lamp sentence in `objectiveBg`, and every
 * assertion in this file stayed GREEN. A future author could delete the light
 * from all seven steps and the ИНСТРУКЦИИ panel on that frame would go back to
 * silence with the build still passing.
 *
 * They are two different surfaces, so they must not be poured into one string:
 *   · `instructionsBg` IS `LessonSpec.briefingBg` verbatim (compile.ts) — the
 *     numbered ИНСТРУКЦИИ panel standing open in the frame, with all of its
 *     steps on screen. This is where the finding's words point: „All FIVE
 *     BRIEFING STEPS describe an unsignalised left turn."
 *   · `objectiveBg` becomes `descriptionBg` — the lesson-select card and the
 *     mistake-mode task line. A different screen, read at a different moment.
 *
 * Nothing is given up by narrowing: the objective sentence is asserted on its
 * own in the THEO-4 test below. And it costs no other lane a red — of the
 * sixteen drills standing on a signalized map, fifteen already name the lamp
 * inside their steps, and the sixteenth is the routed row named below.
 */
const briefingOf = (spec: ScenarioSpec): string => spec.instructionsBg.map((s) => s.textBg).join(" ");

/**
 * The one drill still standing on a signalized map without naming the lamp.
 * `sc-rx-tram-left` is authored in templates-rail.ts, which carries two OPEN
 * critical findings of its own (`sc-rx-unguarded:e8358e75`,
 * `sc-rx-guarded:e0c40055`) — another lane's file, so it is REPORTED rather
 * than rewritten here. Subset, not equality: when that lane fixes it, this
 * file stays green.
 */
const SIGNAL_BRIEFING_ROUTED: readonly string[] = ["sc-rx-tram-left"];

describe("§4 a drill sited at a light says so before the student meets it", () => {
  const sited = ALL.filter((s) => expectedControlOf(s.map.districtId) === "trafficLight");

  it("there are drills to walk at all", () => {
    expect(sited.length).toBeGreaterThanOrEqual(15);
    expect(sited.map((s) => s.id)).toContain("sc-turn-left-oncoming");
  });

  it("no briefing on a signalized map is silent about the lamp", () => {
    const silent = sited.filter((s) => !SIGNAL_WORD.test(briefingOf(s))).map((s) => s.id);
    const fresh = silent.filter((id) => !SIGNAL_BRIEFING_ROUTED.includes(id));
    expect(
      fresh,
      `${fresh.join(", ")} stand(s) at a traffic light and the briefing never mentions one. ` +
        `A student who is told only «пропусни насрещните» and then meets a red has been given ` +
        `two ways to be wrong: creep out hunting a gap on the red, or read the green as his turn.`,
    ).toEqual([]);
    expect(silent.length).toBeLessThanOrEqual(SIGNAL_BRIEFING_ROUTED.length);
  });

  it("the repaired briefing also explains that green is not priority", () => {
    // THEO-4 / doc 64: naming the lamp is half the duty. The reason the lamp
    // matters HERE is that both EW directions run on the same phase, so the
    // oncoming car has green at the same instant the student does — ЗДвП чл. 37
    // survives the green light. A briefing that only said „wait for green"
    // would have replaced one silence with another.
    const spec = specOf("sc-turn-left-oncoming");
    const steps = briefingOf(spec).toLowerCase();
    // IN THE NUMBERED STEPS — the panel open in the frame (see `briefingOf`).
    expect(steps).toContain("светофар");
    expect(steps).toContain("зелено");
    expect(steps).toContain("предимство");
    // …and the interval skill the drill actually grades is still taught. This
    // is clause 4 of the same duty: the repair added the lamp, it did not buy
    // the lamp by dropping the 4-second norm the gates and the FAILED_TO_YIELD
    // demo are built on.
    expect(steps).toContain("секунди");
    expect(steps).toMatch(/4 секунди/);
    // …and the OTHER surface, `descriptionBg`: the lesson card a student reads
    // before he ever presses play. Asserted separately precisely so neither
    // sentence can stand in for the other.
    const objective = spec.objectiveBg.toLowerCase();
    expect(SIGNAL_WORD.test(objective)).toBe(true);
    expect(objective).toContain("предимство");
  });
});

// ---------------------------------------------------------------------------
// §5 — the matchers have teeth
// ---------------------------------------------------------------------------

describe("§5 every matcher above convicts what this lane replaced", () => {
  /** The five briefing steps of sc-turn-left-oncoming exactly as they shipped
   *  on the frame the critical finding was filed from. */
  const SHIPPED_BRIEFING_BEFORE = [
    "Завий наляво през кръстовището, като пропуснеш насрещно движещите се: изчакай плътния интервал (4 и повече секунди) и завий решително, без да режеш пътя на никого.",
    "Тръгни на запад по пресечната улица — на кръстовището ще завиваш наляво, на юг.",
    "Пусни ляв мигач отрано и намали — завоят наляво се готви, не се импровизира.",
    "Насрещните имат предимство. Прецени интервала в СЕКУНДИ: кола на по-малко от 4 секунди означава чакане, не спринт.",
    "Изчакай близкия насрещен автомобил да премине изцяло — спокойно, пред устието, без да навлизаш.",
    "В плътния интервал завий решително наляво и продължи на юг.",
  ].join(" ");

  it("§4's matcher would have convicted the briefing on the frame", () => {
    expect(SIGNAL_WORD.test(SHIPPED_BRIEFING_BEFORE)).toBe(false);
    // …and it recognises the sentence that replaced it.
    expect(SIGNAL_WORD.test("Гледай светофара: на червено спри пред стоп-линията и изчакай зеленото.")).toBe(true);
  });

  it("§4's matcher is not so wide that a Б2 drill trips it", () => {
    // The whole point of the gate is that it fires on maps with a lamp. A
    // matcher that also fired on «знак Б2 „Спри!“» would prove nothing.
    expect(SIGNAL_WORD.test(briefingOf(specOf("sc-junction-stop")))).toBe(false);
  });

  it("§3's rule convicts a fabricated banner in both directions", () => {
    const row = (said: number, cap: number | undefined): SpeedBanner => ({
      scenarioId: "x",
      objectiveId: "y",
      titleBg: `под ${said} км/ч`,
      said,
      cap,
      kind: "reachZone",
      // SpeedBanner gained these two when the briefing-figures rule landed. A
      // fabricated row must still be a WHOLE SpeedBanner, or the compiler stops
      // describing what badSpeedBanner is handed — and vitest does not typecheck,
      // so this file passed 6/6 while tsc was red.
      claim: "ceiling",
      briefingFigures: [],
    });
    expect(badSpeedBanner(row(30, 30))).toBe(false); // exact — the shipped shape
    expect(badSpeedBanner(row(30, 33))).toBe(false); // the corpus's widest
    expect(badSpeedBanner(row(30, 34))).toBe(true); //  past the measured band
    expect(badSpeedBanner(row(30, 25))).toBe(true); //  a false refusal
    expect(badSpeedBanner(row(30, undefined))).toBe(true); // no cap at all
  });

  it("§1's clash detector really reads the shipped strings", () => {
    // If `success[].titleBg` ever stopped being where a chip's words live, §1
    // and §2 would sweep an empty set and pass forever.
    const chips = ALL.flatMap((s) => s.success.map((o) => o.titleBg));
    expect(chips.length).toBeGreaterThanOrEqual(300);
    expect(chips).toContain("Приближи знака Б2 бавно — тук се спира докрай, не почти");
    // The string all three findings quoted still exists — on ONE drill now.
    const stillQuoting = ALL.filter((s) =>
      s.success.some((o) => o.titleBg === "Завий надясно и излез от кръстовището на изток"),
    ).map((s) => s.id);
    expect(stillQuoting).toEqual(["sc-junction-gap"]);
  });
});

// ---------------------------------------------------------------------------
// §6 — a passSignal chip may not certify the interval it cannot witness
//      (added 2026-08-25 with the last Б2 pair — sc-junction-gap:73564f66)
// ---------------------------------------------------------------------------

/**
 * WHY THIS IS A LAW AND NOT TWO EDITS. Both Б2 drills on `tj-emerge-v1` shipped
 * the chip «Премини стоп-линията след пълно спиране И ПРОПУСНАТ ИНТЕРВАЛ» over
 * a `passSignal` / `control: "stopSign"` gate. `stepPassSignal` (objectives.ts)
 * witnesses two things — the full stop at the line and the crossing — and
 * `SimTick` carries no other actor's priority and no yield outcome, so the
 * second half of that sentence is a certificate no evaluator on the drive can
 * sign. The gap misjudgment is graded where it is really measured: the give-way
 * check at the line, FAILED_TO_YIELD, which is what both drills' mistake demos
 * bill.
 *
 * The 2026-08-25 wave rewrote the gap drill's chip and the verifier found the
 * identical claim still standing on its twin, 309 lines down the SAME file.
 * Two rows edited by hand is how a class comes back; a rule over every
 * `passSignal` title in the catalogue is how it stops being authorable.
 *
 * WHAT THIS DELIBERATELY DOES NOT CONVICT, said out loud so the silence is not
 * mistaken for an oversight: `sc-junction-scan`'s «…след пълно спиране и
 * оглеждане». Scanning is not in the same position as the interval — the rule
 * engine grades it under its own code (JUNCTION_SCAN_INCOMPLETE, with per-
 * control copy in rules/engine.ts), so whether that chip is a false certificate
 * or a chip whose channel is merely not wired into `stepPassSignal` is a
 * MEASUREMENT nobody has taken. Convicting it here on the strength of an
 * analogy would trade one defect for another. It is named as an open row.
 */
const INTERVAL_CERTIFICATE =
  /(?:пропуснат|пропуснал|изчакан|осигурен)\s+(?:безопасен\s+)?интервал/iu;

const passSignalChips = (): Array<{ scenarioId: string; objectiveId: string; titleBg: string }> =>
  ALL.flatMap((s) =>
    s.success
      .filter((o) => (o.params as { kind?: string }).kind === "passSignal")
      .map((o) => ({ scenarioId: s.id, objectiveId: o.id, titleBg: o.titleBg })),
  );

describe("§6 a passSignal chip claims only what its gate can witness", () => {
  it("the sweep sees every passSignal chip in the catalogue", () => {
    // Non-vacuity first, on this file's own §5 discipline: a sweep that found
    // nothing would satisfy the prohibition below forever.
    const chips = passSignalChips();
    expect(chips.length).toBeGreaterThanOrEqual(11);
    expect(chips.map((c) => c.objectiveId)).toContain("sc-jgap-line");
    expect(chips.map((c) => c.objectiveId)).toContain("sc-jleft-line");
  });

  it("not one of them certifies a passed interval", () => {
    const claiming = passSignalChips()
      .filter((c) => INTERVAL_CERTIFICATE.test(c.titleBg))
      .map((c) => `${c.scenarioId} ${c.objectiveId}: ${c.titleBg}`);
    expect(
      claiming,
      `a passSignal gate witnesses the stop and the crossing, nothing about the ` +
        `gap the student took — grade that at the give-way check and let the chip ` +
        `point at the drill instead of certifying it.`,
    ).toEqual([]);
  });

  it("and the matcher has teeth in both directions", () => {
    // The exact string this wave replaced, on both twins …
    expect(
      INTERVAL_CERTIFICATE.test("Премини стоп-линията след пълно спиране и пропуснат интервал"),
    ).toBe(true);
    // … and the two that replaced it, one of which still says «интервал»
    // because POINTING at the drill is not CERTIFYING it.
    expect(
      INTERVAL_CERTIFICATE.test(
        "Премини стоп-линията след пълно спиране — оттук нататък решава интервалът",
      ),
    ).toBe(false);
    expect(
      INTERVAL_CERTIFICATE.test(
        "Премини стоп-линията след пълно спиране — левият завой започва оттук",
      ),
    ).toBe(false);
    // The neighbour it must not convict, per the block above.
    expect(INTERVAL_CERTIFICATE.test("Премини стоп-линията след пълно спиране и оглеждане")).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// §7 — three names, three streets
// ---------------------------------------------------------------------------

/**
 * THE CLAUSE THE CHIPS COULD NOT ANSWER — `sc-junction-scan:28e782ab` (major),
 * re-verified 2026-08-26 with openReason=still-present: „Every one of the three
 * still opens on «знака Б2» and grades a stop-line crossing at the same
 * junction; ONLY THE WORDING of the objectives was separated, not the world or
 * the manoeuvre."
 *
 * §1 and §2 above answered the wording and can never answer this: a chip is not
 * a street. The MANOEUVRE axis is exhausted and it is worth writing down so the
 * next lane does not spend a wave rediscovering it — a T-junction stem has
 * exactly TWO exits, and both are taken. Right/east is `sc-junction-stop` and
 * `sc-junction-gap`; left across the priority road is `sc-junction-left`
 * (templates-junctions2.ts, its own subject). Turning the scan drill left would
 * have traded one duplicate for another.
 *
 * So the WORLD answers it. `sc-junction-gap` already stood on tj-emerge-v1;
 * `sc-junction-scan` now stands on tj-scan-v1 (130 m / 110 m arms, spawn
 * y = −95, its own streetwall frontage — the pass keys its jitter on the edge
 * id every tj map shares, so different ARMS are what buy a different street).
 * That leaves tj-stop-v1 to the drill it was built for.
 *
 * WHAT THIS DOES NOT ASSERT, deliberately: that the three STOP LINES differ.
 * The Б2 line is DERIVED from the priority road's half-width — 27.725 m from
 * the node on all three — and it may not move without invalidating each drill's
 * gates and its committed traces. `tj-junctions2-districts.test.ts` pins that
 * it did not. A stop line at another distance would not be a different lesson;
 * a different street is.
 */
describe("§7 the three Б2 junction drills do not share a junction", () => {
  const B2_TRIO = ["sc-junction-stop", "sc-junction-scan", "sc-junction-gap"] as const;

  it("each names a district of its own, and each district is committed", () => {
    const seen = new Map<string, string>();
    for (const id of B2_TRIO) {
      const districtId = specOf(id).map.districtId;
      const twin = seen.get(districtId);
      expect(twin, `${id} drives ${twin}'s street (${districtId})`).toBeUndefined();
      seen.set(districtId, id);
      // …and it is a real map, not a name: the same Б2 control the drill grades.
      expect(expectedControlOf(districtId), districtId).toBe("stopSignOnMinor");
    }
    expect(seen.size).toBe(B2_TRIO.length);
  });

  it("and the spawn they start from is not the same pose either", () => {
    // The finding says „the same approach" as well as „the same junction", and
    // the two drills that shared tj-stop-v1 also shared `tj-spawn-south` on it —
    // the same 105 m of stem. Every tj map names its spawns identically, so the
    // id proves nothing; the POSE does, and it moves with the stem length.
    const poses = B2_TRIO.map((id) => {
      const spec = specOf(id);
      const p = spawnOf(spec.map.districtId, spec.start.spawnPointId!);
      return `${id} ${p.x},${p.y}`;
    });
    const coords = poses.map((p) => p.split(" ")[1]!);
    expect(new Set(coords).size, `two drills open at the same pose:\n${poses.join("\n")}`).toBe(
      B2_TRIO.length,
    );
  });
});

/** The authored spawn pose of one district, read off the committed file. */
function spawnOf(districtId: string, spawnPointId: string): { x: number; y: number } {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${districtId}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${districtId}.json`),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const d = JSON.parse(fs.readFileSync(file, "utf8")) as {
      spawnPoints?: Array<{ id: string; x: number; y: number }>;
    };
    const s = (d.spawnPoints ?? []).find((p) => p.id === spawnPointId);
    if (!s) throw new Error(`${districtId} has no spawn ${spawnPointId}`);
    return { x: s.x, y: s.y };
  }
  throw new Error(`district ${districtId}.json not found`);
}
