/**
 * SWEEP 161 — the adverse-conditions family says only what the world holds and
 * what the gate measures.
 *
 * Eleven BROKEN findings landed on `templates-conditions.ts`, three of them
 * critical, and they reduce to two rules. Both are asserted here over the whole
 * family rather than on the nine individual lessons, because every one of the
 * eleven was an instance of a rule nobody had written down.
 *
 *   RULE 1 — THE NUMBER. „The briefing does not match what is graded."
 *     Six lessons briefed a target and were graded against a ceiling the
 *     student was never told; one (sc-ac-night-lights) was graded 5 km/h ABOVE
 *     its own posted limit, so the coach's live nudge licensed 55 in a 50 zone;
 *     one (sc-ac-aquaplane) briefed a ceiling 2 km/h LOOSER than its gate, so a
 *     student who obeyed it at 59 was refused the objective at L3+.
 *
 *   RULE 2 — THE WORLD. „The world does not contain what the briefing
 *     promises." sc-ac-crosswind narrated a bridge, an exposed span and a lorry
 *     on fo-follow-v1 — a dense city street with no `zones` array at all; and
 *     sc-ac-ice, titled „Лед по моста", narrated a bridge, an А15 plate and a
 *     car stranded on it, on ac-ice-v1 — a straight street whose document
 *     declares no bridge, no `signs` key, and whose stalled car is a recorder
 *     rect with no scenery-prop entry.
 *
 * EVERY ASSERTION BELOW IS PAIRED WITH THE STRING THAT SHIPPED, so none of them
 * can be vacuous: a rule is proved to have teeth by feeding it the exact copy
 * or the exact number the audit photographed and watching it be caught.
 */

import { describe, expect, it } from "vitest";
import { SCENARIO_TEMPLATES_CONDITIONS } from "../templates-conditions";
import { REACH_ZONE_HALT_CAP_KMH } from "../../objectives";
import type { ScenarioSpec } from "../types";

// ---------------------------------------------------------------------------
// Shared readers
// ---------------------------------------------------------------------------

interface CappedGate {
  specId: string;
  objectiveId: string;
  titleBg: string;
  capKmh: number;
  postedKmh: number;
}

/** Every AUTHORED reachZone cap above the halt band, with its street's limit.
 *  Halt demands (≤ 8 km/h) are excluded on purpose: «спри» is not a speed a
 *  briefing quotes, and `params.ts` never widens one. */
function cappedGates(specs: readonly ScenarioSpec[]): CappedGate[] {
  const out: CappedGate[] = [];
  for (const spec of specs) {
    const posted = spec.map.params["maxspeedKmh"];
    if (typeof posted !== "number" || !Number.isFinite(posted)) continue;
    for (const o of spec.success) {
      if (o.params.kind !== "reachZone") continue;
      const cap = o.params.maxSpeedKmh;
      if (cap === undefined || cap <= REACH_ZONE_HALT_CAP_KMH) continue;
      out.push({
        specId: spec.id,
        objectiveId: o.id,
        titleBg: o.titleBg,
        capKmh: cap,
        postedKmh: posted,
      });
    }
  }
  return out;
}

/** What the driver is told BEFORE and DURING the attempt: the objective, the
 *  numbered steps, the objective titles the HUD and the gate bar carry. This is
 *  the surface the founder's finding is about — „the briefing does not match
 *  what is graded" — and it deliberately excludes the mistake debriefs.
 *
 *  That exclusion is not fastidiousness: it was found by mutation. With the
 *  debriefs included, deleting fog's ceiling from step 2 left the rule GREEN,
 *  because «В мъгла скоростта се смъква драстично — тук под 30 км/ч» sits in
 *  the mistake debrief — copy the student reads AFTER he has already been
 *  graded. A number that only appears in the post-mortem was never told to him.
 */
function briefingCopy(spec: ScenarioSpec): string[] {
  return [
    spec.objectiveBg,
    ...spec.instructionsBg.map((s) => s.textBg),
    ...spec.success.map((s) => s.titleBg),
  ];
}

/** …and everything the driver reads at any point in the drill, briefing plus
 *  debriefs. Used by the rules that must hold across the whole lesson. */
function driverCopy(spec: ScenarioSpec): string[] {
  return [
    ...briefingCopy(spec),
    ...(spec.mistakes ?? []).flatMap((m) => [m.titleBg, m.whatWentWrongBg]),
  ];
}

// ---------------------------------------------------------------------------
// RULE 1a — a gate may not license the speed the street forbids
// ---------------------------------------------------------------------------

/** The predicate, named so the teeth test can feed it the shipped row. */
const overPosted = (g: Pick<CappedGate, "capKmh" | "postedKmh">) => g.capKmh > g.postedKmh;

describe("sweep161 · no conditions gate licenses a speed its own street forbids", () => {
  const gates = cappedGates(SCENARIO_TEMPLATES_CONDITIONS);

  it("surveys real gates (a sweep over nothing proves nothing)", () => {
    expect(gates.length).toBeGreaterThanOrEqual(8);
    expect(new Set(gates.map((g) => g.specId)).size).toBeGreaterThanOrEqual(8);
  });

  it("no authored cap in the family sits above its posted limit", () => {
    const bad = gates
      .filter(overPosted)
      .map((g) => `${g.specId}/${g.objectiveId}: cap ${g.capKmh} over posted ${g.postedKmh}`);
    expect(bad).toEqual([]);
  });

  it("the rule has teeth — the row that shipped is caught, a lawful row is not", () => {
    // sc-ac-night-lights/sc-acn-lit as it stood in sweep161: 55 on ac-night-v1,
    // posted 50. `params.ts` widenSpeedCap bounds grace by max(authored,
    // posted), so this compiled 55 at EVERY rung and the live nudge in
    // `.audit-frames/sweep161/sc-ac-night-lights/pc-wrong/04-t012s.png` read
    // «не повече от 55 км/ч» while the sign beside it read 50.
    expect(overPosted({ capKmh: 55, postedKmh: 50 })).toBe(true);
    // …and the fixed row is not, nor is a gate authored below its limit.
    expect(overPosted({ capKmh: 50, postedKmh: 50 })).toBe(false);
    expect(overPosted({ capKmh: 42, postedKmh: 50 })).toBe(false);
  });

  it("sc-ac-night-lights specifically now grades the number its own briefing says", () => {
    const spec = SCENARIO_TEMPLATES_CONDITIONS.find((s) => s.id === "sc-ac-night-lights")!;
    const lit = spec.success.find((o) => o.id === "sc-acn-lit")!;
    if (lit.params.kind !== "reachZone") return expect.unreachable("sc-acn-lit is a reachZone");
    expect(lit.params.maxSpeedKmh).toBe(50);
    expect(spec.map.params["maxspeedKmh"]).toBe(50);
    expect(spec.instructionsBg.some((s) => s.textBg.includes("под 50 км/ч"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RULE 1b — the ceiling a gate grades is a number the briefing spoke
// ---------------------------------------------------------------------------

/**
 * The two shapes this family states a CEILING in. Both are deliberately narrow,
 * because the copy is full of numbers that are not ceilings and must not be
 * read as one: „виждаш 50 метра" and „спирачният ти път … е под 50" (metres),
 * „около 15% от сухото" and „около 40% от сухото" (grip), „около 1,4 пъти
 * по-дълъг" (a ratio), „над ~65 км/ч гумите изплуват" (a floor, not a ceiling)
 * and „знакът извън града е 90" (the sign). Only «под N км/ч» and «таван… N»
 * are promises about what the gate will accept.
 */
const CEILING_PATTERNS: readonly RegExp[] = [
  /под\s+(\d+)\s*км\/ч/gu,
  /таван[а-я]*[^.0-9]{0,25}?(\d+)/gu,
];

function ceilingNumbers(text: string): number[] {
  const out: number[] = [];
  for (const re of CEILING_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) out.push(Number(m[1]));
  }
  return out;
}

describe("sweep161 · a conditions briefing speaks the ceiling it is graded against", () => {
  it("the reader has teeth — it finds ceilings and refuses the numbers that are not", () => {
    // Both shipped shapes, and the shape this wave introduced.
    expect(ceilingNumbers("Потегли по правата улица и дръж спокойна скорост под 50 км/ч.")).toEqual([
      50,
    ]);
    expect(ceilingNumbers("Потегли бавно и се стабилизирай около 25 км/ч — таванът в мъглата е 30.")).toEqual([
      30,
    ]);
    // Not ceilings, and every one of these is live copy in the family.
    expect(ceilingNumbers("Сметни: виждаш 50 метра — значи спирачният ти път, с рефлекса вътре, е под 50.")).toEqual([]);
    expect(ceilingNumbers("Помни: върху леда сцеплението е около 15% от сухото.")).toEqual([]);
    expect(ceilingNumbers("Знай: над ~65 км/ч гумите „изплуват“ — воланът олеква и колата не слуша.")).toEqual([]);
    expect(ceilingNumbers("Помни: знакът извън града е 90, но дъждът сваля разумната скорост.")).toEqual([]);
  });

  it("every capped gate's ceiling is a number the driver was told BEFORE he is graded", () => {
    const silent: string[] = [];
    for (const spec of SCENARIO_TEMPLATES_CONDITIONS) {
      const spoken = new Set(briefingCopy(spec).flatMap(ceilingNumbers));
      for (const g of cappedGates([spec])) {
        if (!spoken.has(g.capKmh)) {
          silent.push(
            `${g.specId}/${g.objectiveId} grades ${g.capKmh} km/h; the copy names ${[...spoken].join(", ") || "no ceiling at all"}`,
          );
        }
      }
    }
    expect(silent).toEqual([]);
  });

  it("…and no ceiling the driver was told is looser than the gate that measures it", () => {
    // The other direction, and the one sc-ac-aquaplane failed: a briefing may
    // not promise more room than the gate will give, or obeying it fails the
    // task. A spoken ceiling must be one of the family's own authored caps, or
    // the posted limit (which several drills quote as the thing NOT to use).
    const loose: string[] = [];
    for (const spec of SCENARIO_TEMPLATES_CONDITIONS) {
      const allowed = new Set<number>(cappedGates([spec]).map((g) => g.capKmh));
      const posted = spec.map.params["maxspeedKmh"];
      if (typeof posted === "number") allowed.add(posted);
      for (const n of new Set(driverCopy(spec).flatMap(ceilingNumbers))) {
        if (!allowed.has(n)) {
          loose.push(`${spec.id} promises „под ${n}" but grades ${[...allowed].join("/")}`);
        }
      }
    }
    expect(loose).toEqual([]);
  });

  it("the looseness rule has teeth — the aquaplane step that shipped is caught", () => {
    // `.audit-frames/sweep161/sc-ac-aquaplane/pc-right/01-arrival.png`, step 5:
    // «Намали ПРЕДИ водата — под 60 км/ч, още на чистия асфалт», over a gate
    // authored at 58 with no ladder grace at L3/L4.
    const SHIPPED = "Намали ПРЕДИ водата — под 60 км/ч, още на чистия асфалт.";
    const aqua = SCENARIO_TEMPLATES_CONDITIONS.find((s) => s.id === "sc-ac-aquaplane")!;
    const allowed = new Set<number>(cappedGates([aqua]).map((g) => g.capKmh));
    allowed.add(aqua.map.params["maxspeedKmh"] as number);
    expect(ceilingNumbers(SHIPPED)).toEqual([60]);
    expect(allowed.has(60)).toBe(false); // …so the shipped step fails the rule…
    expect(allowed.has(58)).toBe(true); // …and the one that replaced it passes.
    expect(aqua.instructionsBg.some((s) => s.textBg === SHIPPED)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RULE 2 — the drill narrates the world it is staged on
// ---------------------------------------------------------------------------

/**
 * Locale claims this family made and its districts cannot keep. Verified
 * against `content/world/*.json` when the wave was worked:
 *  - fo-follow-v1 (sc-ac-crosswind) has NO `zones` array — there is no exposed
 *    span, and the frames show unbroken six-storey blocks on both sides;
 *  - ac-ice-v1 (sc-ac-ice) declares no bridge geometry and has no `signs` key
 *    at all; „А15" exists only as `zones[0].signRef`, a data label nothing
 *    places.
 * The bridge arm of AC-08 keeps its own lesson (sc-ac-bridge-ice on
 * ac-bridge-v1, templates-conditions2.ts), which is not swept here.
 */
const ABSENT_IN_WORLD: ReadonlyArray<readonly [label: string, re: RegExp]> = [
  // The leading boundary is load-bearing, not tidiness: a bare /мост/ also
  // matches „ви-ДИМОСТ-та" and „ви-ДИМОСТ", which this family says constantly.
  // It flagged five innocent rain/fog lines on the first run.
  ["a bridge", /(?<![\p{L}])мост/iu],
  ["an exposed span", /открит[\p{L}]*\s+участ[ъь]к/iu],
  ["an А15 plate", /А15/u],
];

describe("sweep161 · the conditions drills narrate the world they are staged on", () => {
  it("no driver-facing line in the family names a body its district does not hold", () => {
    const claims: string[] = [];
    for (const spec of SCENARIO_TEMPLATES_CONDITIONS) {
      for (const line of driverCopy(spec)) {
        for (const [label, re] of ABSENT_IN_WORLD) {
          if (re.test(line)) claims.push(`${spec.id} claims ${label}: «${line.slice(0, 70)}…»`);
        }
      }
    }
    expect(claims).toEqual([]);
  });

  it("a drill that stages no vehicle does not tell the driver to watch one pass", () => {
    // sc-ac-crosswind's step 8 sent the student looking for a lorry on a map
    // with `staged` empty and ambient traffic zero (seed 7).
    const claims: string[] = [];
    for (const spec of SCENARIO_TEMPLATES_CONDITIONS) {
      if ((spec.staged?.length ?? 0) > 0) continue;
      for (const line of spec.instructionsBg.map((s) => s.textBg)) {
        if (/камион/iu.test(line)) claims.push(`${spec.id}: «${line}»`);
      }
    }
    expect(claims).toEqual([]);
  });

  it("the world rule has teeth — every line the audit photographed is caught", () => {
    // The exact strings in `.audit-frames/sweep161/sc-ac-crosswind/pc-right/
    // 01-arrival.png` and `.../sc-ac-ice/pc-right/04-t098s.png`.
    const SHIPPED = [
      "Очаквай на моста силен страничен вятър отдясно.",
      "Намали ПРЕДИ открития участък — тук около 34 км/ч.",
      "Дръж лентата до края и очаквай нов порив край сграда, мост или камион.",
      "Мини открития участък със съобразена скорост",
      "Намали до около 25 км/ч ОЩЕ ПРЕДИ моста, на чистия асфалт.",
      "Прочети знака А15 „Опасност от хлъзгане“ преди моста — той не е украса.",
      "Знай: мостът няма топла земя отдолу и е заледен, макар улицата да е суха.",
      "Виж закъсалия автомобил на моста — подхлъзнал се е преди теб.",
      "Лед по моста",
    ];
    for (const line of SHIPPED) {
      expect(
        ABSENT_IN_WORLD.some(([, re]) => re.test(line)),
        `not caught: ${line}`,
      ).toBe(true);
    }
    // …and none of them is still in the file.
    const all = SCENARIO_TEMPLATES_CONDITIONS.flatMap((s) => [s.titleBg, ...driverCopy(s)]);
    for (const line of SHIPPED) expect(all).not.toContain(line);
  });

  it("the ice stop gate stops sending the driver to look at a body nothing draws", () => {
    // Separate from the locale rule because the cause is different and is NOT
    // this file's: the stalled car is a recorder rect (traces/scAcIce.ts,
    // y = 290) with no entry in `scene/scenarioSceneryProps.ts`, where the
    // sc-ac-wet-braking and sc-ac-snow vans each have one. Until it gets a
    // body, the LIVE student is pointed at the marked position, which the
    // guidance layer does draw — and that wording stays true if the prop lands.
    const ice = SCENARIO_TEMPLATES_CONDITIONS.find((s) => s.id === "sc-ac-ice")!;
    const mark = ice.success.find((o) => o.id === "sc-aci-mark")!;
    expect(mark.titleBg).toBe("Спри свръхплавно на маркираната позиция");
    expect(mark.titleBg).not.toMatch(/закъсал/iu);
    const briefing = ice.instructionsBg.map((s) => s.textBg).join(" ");
    expect(briefing).not.toMatch(/закъсал/iu);
    expect(briefing).toMatch(/маркираната позиция/iu);
    // The DEMO copy keeps the car: the recorder rect it collides with is real,
    // and that is what the red ghost is showing.
    expect((ice.mistakes ?? []).map((m) => m.whatWentWrongBg).join(" ")).toMatch(/закъсал|спрелия/iu);
  });

  it("the rule is not a mute button — a claim about a REAL body still passes", () => {
    // The detector must catch the invented bodies and spare the staged ones, or
    // it is just a ban on nouns. sc-ac-highbeam-lead's lead car is staged; the
    // wet/snow vans have `scenarioSceneryProps` bodies; the aquaplane's 90 sign
    // is visible in its own arrival frame.
    for (const line of [
      "Следвай предната кола на дистанция и с КЪСИ светлини — таванът тук е 45.",
      "Спри плавно на маркираната позиция зад спрелия отпред автомобил.",
      "Помни: знакът извън града е 90, но дъждът сваля разумната скорост.",
      "Дръж лентата до края — поривите не спират, докато не свърши отсечката.",
      "Мини отсечката със съобразена за вятъра скорост",
      // The two innocents the first draft of the bridge pattern flagged.
      "Дръж късите включени, докато вали и видимостта е намалена.",
      "Гледай докъдето стига видимостта, не за маркировката в последния момент.",
    ]) {
      expect(ABSENT_IN_WORLD.some(([, re]) => re.test(line)), line).toBe(false);
    }
  });

  it("the two rewritten drills still TEACH their hazard (not gutted, retargeted)", () => {
    const wind = SCENARIO_TEMPLATES_CONDITIONS.find((s) => s.id === "sc-ac-crosswind")!;
    const windCopy = driverCopy(wind).join(" ");
    expect(windCopy).toMatch(/вятър/iu);
    expect(windCopy).toMatch(/порив/iu);
    expect(windCopy).toMatch(/корекци/iu);
    // …and the real-world places a crosswind is met survive as KNOWLEDGE.
    expect(wind.teach.whenBg).toMatch(/мост/iu);

    const ice = SCENARIO_TEMPLATES_CONDITIONS.find((s) => s.id === "sc-ac-ice")!;
    const iceCopy = driverCopy(ice).join(" ");
    expect(iceCopy).toMatch(/лед/iu);
    expect(iceCopy).toMatch(/прав волан/iu);
    expect(ice.titleBg).toBe("Черен лед");
    expect(ice.teach.whenBg).toMatch(/мост/iu);
  });
});
