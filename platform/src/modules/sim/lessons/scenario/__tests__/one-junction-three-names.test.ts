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
 *       lane replaced and against a neighbour it must not convict.
 *
 * SCOPE, stated so the silences are deliberate. `sc-junction-gap` lives in
 * templates-junctions2.ts and `sc-junction-left` in templates-junctions3.ts —
 * both files carry OPEN critical findings of their own (`sc-junction-blind:
 * dea35510`, and junctions3's row), so they belong to other lanes and are not
 * edited here. They still share two chips with each other; §2's ratchet keeps
 * that pair visible without this lane rewriting another lane's file. The same
 * goes for `sc-rx-tram-left` (templates-rail.ts, two open criticals), the one
 * remaining drill that stands on a signalized map and never says so — §4 names
 * it as the routed row it is.
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
 */
const KNOWN_DUPLICATE_PAIRS: readonly string[] = [
  "sc-crossing-let-pass ~ sc-crossing-dart", //            templates-pe.ts
  "sc-crossing-let-pass ~ sc-crossing-slow-crosser", //    templates-pe.ts
  "sc-crossing-slow-crosser ~ sc-crossing-dart", //        templates-pe.ts
  "sc-junction-gap ~ sc-junction-left", //   junctions2.ts ~ junctions3.ts
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

interface SpeedBanner {
  scenarioId: string;
  objectiveId: string;
  titleBg: string;
  said: number;
  cap: number | undefined;
  kind: string;
}

function speedBanners(): SpeedBanner[] {
  const out: SpeedBanner[] = [];
  for (const spec of ALL) {
    for (const objective of spec.success) {
      const m = KMH_IN_TITLE.exec(objective.titleBg);
      if (!m) continue;
      const p = objective.params as { kind: string; maxSpeedKmh?: number };
      out.push({
        scenarioId: spec.id,
        objectiveId: objective.id,
        titleBg: objective.titleBg,
        said: Number(m[1]),
        cap: p.maxSpeedKmh,
        kind: p.kind,
      });
    }
  }
  return out;
}

const badSpeedBanner = (b: SpeedBanner): boolean =>
  b.cap === undefined || b.cap < b.said || b.cap > b.said * CAP_TOLERANCE + 0.001;

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
