/**
 * SWEEP 161 — the adverse-conditions family says only what the world holds and
 * what the gate measures.
 *
 * Eleven BROKEN findings landed on `templates-conditions.ts`, three of them
 * critical, and they reduce to three rules. All three are asserted here over
 * the whole family rather than on the nine individual lessons, because every
 * one of the eleven was an instance of a rule nobody had written down.
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
 *     declares no bridge and whose stalled car is a recorder rect with no
 *     scenery-prop entry.
 *
 *   RULE 3 — THE SAME QUESTION, PUT TO THE DISTRICT. Rule 2 is a list of nouns
 *     NO map in the family can carry, so it is a ban: it cannot tell „this map
 *     has one" from „no map has one", and it got a claim wrong in each
 *     direction. It cleared `sc-ac-aquaplane`'s „на извънградския път" (the
 *     document says extra-urban; the built world is a lit street) and it
 *     forbade `sc-ac-ice` the А15 that its own map POSTS. Rule 3 asks
 *     `buildWorldGeometry` — see the block above its section.
 *
 * EVERY ASSERTION BELOW IS PAIRED WITH THE STRING THAT SHIPPED, so none of them
 * can be vacuous: a rule is proved to have teeth by feeding it the exact copy
 * or the exact number the audit photographed and watching it be caught.
 *
 * WHAT THIS GATE CANNOT SEE, WRITTEN DOWN RATHER THAN IMPLIED — and it is the
 * half the frames were actually shot of. Every rule here sweeps the
 * `ScenarioSpec`: objective, numbered steps, gate titles, mistake debriefs.
 * The DEMO CAPTION is not in the spec. It is a `kind: "annotation"` step in
 * `sim/traces/scAc<Lesson>.ts`, baked into the committed
 * `content/traces/<lesson>/<name>.trace.json`, and it
 * renders as the big line over the windscreen under «ДЕМОНСТРАЦИЯ — СЛЕДВАЙ
 * СЯНКАТА» — which is where sweep161 photographed most of these findings. The
 * briefings were cleaned; those captions were not, and they still carry the
 * struck claims:
 *
 *   traces/scAcCrosswind.ts:68,71,94,106,123 — „Напред е открит участък —
 *     МОСТЪТ, където страничният вятър духа силно отдясно" and four more
 *     „открития участък" lines, on fo-follow-v1. Live on
 *     `.audit-frames/proof/frames/sc-ac-crosswind__pc-right/04-t011s.png`
 *     (2026-08-22), over six-storey blocks and parked cars on both verges.
 *   traces/scAcIce.ts:104,132,143 — „знак А15 … ПРЕДИ МОСТА. Мостът замръзва
 *     пръв", „мостът е заледен"; and :113 „Напред е закъсал автомобил", live on
 *     `.audit-frames/proof/frames/sc-ac-ice__pc-right/01-arrival.png`.
 *   traces/scAcAquaplane.ts:111 — „Пороен дъжд на ИЗВЪНГРАДСКИ ПЪТ", the same
 *     locale claim RULE 3 just struck from the briefing.
 *   traces/scAcFog.ts:58 — „Фаровете за мъгла светят ниско под пелената",
 *     narrated while both cockpit telltales are dark
 *     (`.audit-frames/sweep161/sc-ac-fog/pc-right/04-t101s.png`).
 *
 * Extending `driverCopy` over the trace annotations is the right shape and is
 * NOT done here on purpose: those four files belong to another lane, the fix is
 * a re-record (RECORD_TRACES=1) and not a string edit, and a gate that lands
 * red is a gate the next lane deletes. Whoever owns that re-record should add
 * the annotations to `driverCopy` in the same change — all three rules above
 * then apply to them for free.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SCENARIO_TEMPLATES_CONDITIONS } from "../templates-conditions";
import { REACH_ZONE_HALT_CAP_KMH } from "../../objectives";
import { assertDistrict, buildWorldGeometry } from "../../../world";
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
// The WORLD the family is actually staged on — built, not read
// ---------------------------------------------------------------------------

/**
 * THE PRODUCTION BUILDER IS THE WITNESS, not the district document. That
 * distinction is the whole reason RULE 3 exists and is not a spelling ban: the
 * first sweep161 wave struck the А15 out of `sc-ac-ice` on the written premise
 * that «„А15" lives only as `zones[0].signRef`, a data label nothing places or
 * renders». `buildWorldGeometry` disagrees — `zoneSigns.ts` maps
 * `icePatch`/`waterPatch` → `slippery` and posts the plate
 * `HAZARD_WARNING_AHEAD_M` before the span — and the sibling lane had already
 * measured the same thing for `ac-bridge-v1`
 * (`lane-world-claims.test.ts` §5 keeps `sc-ac-bridge-ice` pointing at its
 * А15). A rule written from a reading of the JSON deleted a cue the student
 * can see out of the windscreen; a rule written from the builder cannot.
 */
const REPO_ROOT = path.join(process.cwd(), "..");

const rawDistrict = (id: string): unknown =>
  JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as unknown;

interface WorldCensus {
  /** Signs that actually get POSTED, folded by kind. */
  signs: Readonly<Record<string, number>>;
  /** Lamp columns `props.ts` plants along the edge — the furniture that makes a
   *  road read as a lit street from the cockpit. */
  streetlights: number;
  /** Wire-carrying columns; they arrive with the lamps on a scenario map. */
  utilityPoles: number;
}

const DISTRICT_IDS = [...new Set(SCENARIO_TEMPLATES_CONDITIONS.map((s) => s.map.districtId))].sort();

const CENSUS = new Map<string, WorldCensus>(
  DISTRICT_IDS.map((id) => {
    const geometry = buildWorldGeometry(assertDistrict(rawDistrict(id)));
    const signs: Record<string, number> = {};
    for (const s of geometry.signs) signs[s.kind] = (signs[s.kind] ?? 0) + 1;
    return [
      id,
      {
        signs,
        streetlights: geometry.streetlights.length,
        utilityPoles: geometry.utilityPoles.length,
      },
    ];
  }),
);

const censusOf = (districtId: string): WorldCensus => {
  const c = CENSUS.get(districtId);
  if (!c) throw new Error(`no census for ${districtId}`);
  return c;
};

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
 *  - ac-ice-v1 (sc-ac-ice) declares no bridge geometry.
 * The bridge arm of AC-08 keeps its own lesson (sc-ac-bridge-ice on
 * ac-bridge-v1, templates-conditions2.ts), which is not swept here.
 *
 * THE А15 IS NOT IN THIS LIST AND MUST NOT BE PUT BACK IN IT. The first wave
 * banned it here on a false premise (see the CENSUS block above); the plate is
 * built on two of this family's five districts, so the honest question is „does
 * THIS map post one", which is RULE 3's job, not a spelling ban's.
 */
const ABSENT_IN_WORLD: ReadonlyArray<readonly [label: string, re: RegExp]> = [
  // The leading boundary is load-bearing, not tidiness: a bare /мост/ also
  // matches „ви-ДИМОСТ-та" and „ви-ДИМОСТ", which this family says constantly.
  // It flagged five innocent rain/fog lines on the first run.
  ["a bridge", /(?<![\p{L}])мост/iu],
  ["an exposed span", /открит[\p{L}]*\s+участ[ъь]к/iu],
  // A DIP IN THE CARRIAGEWAY — added by the verifier pass over the RULE 3
  // wave, and it belongs in the BAN and not in RULE 3 because no district can
  // answer for it: the corpus has no third coordinate to answer WITH.
  // `roads.edges[].geometry` is a list of `[x, y]` pairs, the carriageway mesh
  // is laid at the flat constant `ROAD_Y`, and `terrain.ts`'s `heightAt`
  // returns a hard 0 within TERRAIN_FLAT_NEAR_ROAD_M of any edge — so a lesson
  // that says „в ниското" is pointing at ground that cannot exist on ANY map,
  // which is precisely the shape RULE 2 is for. It survived the wave that
  // rewrote its own sentence because that wave was reading the clause for its
  // LOCALE („извънградски път") and a dip is not a locale.
  //
  // The word is banned only as a SUBSTANTIVE („в ниското" — the low ground).
  // The adjective is this family's most common word and must pass untouched:
  // „по-ниска скорост", „ниските участъци" in teach, „светят ниско". Hence the
  // lookarounds, and hence the innocents pinned in the mute-button test below.
  ["a dip in the carriageway", /(?<![\p{L}])ниското(?![\p{L}])/iu],
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
      // The aquaplane's posted limit. Two `limit90` posts ARE built, the first
      // 30 m past the spawn and legible in its own arrival frame. The line that
      // stood here until this wave said „знакът ИЗВЪН ГРАДА е 90" — which
      // ABSENT_IN_WORLD also spares, and which RULE 3 below is what catches.
      "Помни: знакът тук разрешава 90, но дъждът сваля разумната скорост.",
      "Дръж лентата до края — поривите не спират, докато не свърши отсечката.",
      "Мини отсечката със съобразена за вятъра скорост",
      // The two innocents the first draft of the bridge pattern flagged.
      "Дръж късите включени, докато вали и видимостта е намалена.",
      "Гледай докъдето стига видимостта, не за маркировката в последния момент.",
      // …and the three the dip pattern must spare. „ниско" as an ADJECTIVE is
      // this family's ordinary vocabulary — a ban that ate these would be a
      // ban on teaching slow, which is the one thing every drill here says.
      "Прочети знака А15 напред — след него платното е покрито със стояща вода.",
      "Фаровете за мъгла светят ниско, под пелената.",
      "Карай с по-ниска скорост, отколкото знакът разрешава.",
    ]) {
      expect(ABSENT_IN_WORLD.some(([, re]) => re.test(line)), line).toBe(false);
    }
  });

  it("the dip rule has teeth — the line that shipped is caught, and it is gone", () => {
    // VERIFIER PASS over the RULE 3 wave. sc-ac-aquaplane step 3 was rewritten
    // by that wave to read its posted А15, and „в ниското" — a dip in the
    // carriageway — rode through the rewrite untouched, in the same clause,
    // student-facing in the ИНСТРУКЦИИ panel of
    // `.audit-frames/proof/frames/sc-ac-aquaplane__pc-right/01-arrival.png`,
    // over a road that runs dead level to the horizon in that same frame.
    //
    // It is a BAN and not a RULE 3 claim because the corpus cannot answer the
    // question either way: districts carry `[x, y]` geometry, the carriageway
    // is laid at the flat constant ROAD_Y, and terrain.ts flattens the ground
    // to 0 near every edge. No map has low ground; none can grow any.
    const SHIPPED = "Прочети знака А15 напред — след него в ниското платното е покрито със стояща вода.";
    expect(ABSENT_IN_WORLD.some(([, re]) => re.test(SHIPPED))).toBe(true);
    const all = SCENARIO_TEMPLATES_CONDITIONS.flatMap((s) => [s.titleBg, ...driverCopy(s)]);
    expect(all).not.toContain(SHIPPED);
    // …and the cue it was carrying was NOT taken away with the dip: the plate
    // is still read, and WHY water collects low is still taught, in `teach`
    // where it is knowledge about Bulgarian roads rather than about this map.
    const aqua = SCENARIO_TEMPLATES_CONDITIONS.find((s) => s.id === "sc-ac-aquaplane")!;
    expect(aqua.instructionsBg.some((s) => /А15/u.test(s.textBg))).toBe(true);
    expect(aqua.instructionsBg.some((s) => /стояща вода/iu.test(s.textBg))).toBe(true);
    expect(aqua.teach.whenBg).toMatch(/ниските участъци/iu);
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

// ---------------------------------------------------------------------------
// RULE 3 — a claim about the world is a QUESTION PUT TO THE BUILT DISTRICT
// ---------------------------------------------------------------------------

/**
 * RULE 2 is a list of nouns no district in this family can carry, so it is a
 * ban and can only ever be right by luck. RULE 3 is the shape the sibling lane
 * settled on (`lane-world-claims.test.ts`): the same sentence is legal on one
 * map and refused on another, because the predicate asks `buildWorldGeometry`
 * — the production pass — what this lesson's own district actually puts in
 * front of the student.
 *
 * IT EXISTS BECAUSE THE BAN GOT ONE WRONG IN EACH DIRECTION.
 *
 *  · TOO LOOSE — `sc-ac-aquaplane` (sweep161, major, frame
 *    `.audit-frames/sweep161/sc-ac-aquaplane/pc-right/01-arrival.png`, re-shot
 *    unchanged in `.audit-frames/proof/frames/sc-ac-aquaplane__pc-right/`):
 *    „Мини участъка със стояща вода НА ИЗВЪНГРАДСКИЯ ПЪТ" and „знакът ИЗВЪН
 *    ГРАДА е 90", over a windscreen holding a lit six-storey block, a row of
 *    lamp columns, wires and a kerbside line of parked cars. The district
 *    document AGREES with the copy — `class: "unclassified"`, `maxspeed: 90`,
 *    one authored building — and the document is not what the student sees:
 *    `props.ts` dresses every scenario micro-map through `SCENARIO_LIT_CLASSES`,
 *    and on ac-aqua-v1 that is 16 lamp columns and 15 wire poles over 520 m, a
 *    lamp every ~32 m. Reading the JSON would have cleared this line; building
 *    the world convicts it.
 *
 *  · TOO TIGHT — the А15. See the CENSUS block near the top of this file: the
 *    plate is POSTED on ac-ice-v1 (y = 150, 60 m before the icePatch at 210)
 *    and on ac-aqua-v1 (y = 180, before the waterPatch at 240), and the flat
 *    /А15/ ban meant `sc-ac-ice` was forbidden to teach the one warning sign
 *    standing on its own road — a fix that took something away. The line is
 *    restored, and the rule now refuses it only where no plate is posted.
 */

interface WorldClaim {
  /** What the sentence promises, in the word a briefing would use. */
  noun: string;
  /** How that promise is spelled in student-facing Bulgarian. */
  re: RegExp;
  /** Does the world this lesson LOADS actually carry it? */
  carriedBy: (districtId: string) => boolean;
  /** What would have to change for the promise to become true. */
  how: string;
}

const LOCALE_CLAIM = "извън населено място (локацията на урока)";
const A15_CLAIM = "знак А15 „Хлъзгав път“";

const WORLD_CLAIMS: readonly WorldClaim[] = [
  {
    noun: LOCALE_CLAIM,
    // „извън града" / „извънградски път" tell the student WHERE HE IS. Nothing
    // in the cockpit can corroborate that except the absence of town: a road
    // with lamp columns and wires down both verges reads as built-up whatever
    // its `maxspeed` tag says. So the claim is carried only by an UNLIT road —
    // and the day a genuinely rural district is generated (props.ts plants no
    // column on it) this starts crediting it with no edit here.
    re: /извън\s+града|извънградск/iu,
    carriedBy: (id) => censusOf(id).streetlights === 0,
    how: "a district whose built world has no streetlight columns (props.ts SCENARIO_LIT_CLASSES)",
  },
  {
    noun: A15_CLAIM,
    // Asked of the POSTED plate, never of `zones[].signRef`: the label in the
    // document is not the post on the verge — `zoneSigns.ts` is what turns one
    // into the other, and only for the zone kinds it maps.
    re: /А15/u,
    carriedBy: (id) => (censusOf(id).signs["slippery"] ?? 0) > 0,
    how: 'a zone whose kind zoneSigns.ts maps to "slippery" (icePatch / waterPatch)',
  },
];

describe("sweep161 · a conditions claim is answered by the district it is staged on", () => {
  it("surveys the whole family's districts (a census over nothing proves nothing)", () => {
    expect(DISTRICT_IDS.length).toBeGreaterThanOrEqual(5);
    for (const id of DISTRICT_IDS) expect(censusOf(id)).toBeDefined();
  });

  it("no driver-facing line makes a claim its own district cannot answer for", () => {
    const claims: string[] = [];
    for (const spec of SCENARIO_TEMPLATES_CONDITIONS) {
      for (const line of driverCopy(spec)) {
        for (const claim of WORLD_CLAIMS) {
          if (claim.re.test(line) && !claim.carriedBy(spec.map.districtId)) {
            claims.push(
              `${spec.id} on ${spec.map.districtId} claims ${claim.noun}: «${line.slice(0, 64)}…» — needs ${claim.how}`,
            );
          }
        }
      }
    }
    expect(claims).toEqual([]);
  });

  // -- teeth ---------------------------------------------------------------
  //
  // Each claim is fed BOTH answers, so neutering a predicate to a constant
  // fails here even though the sweep above would go on passing.

  it("the locale rule has teeth — the aquaplane lines that shipped are caught", () => {
    const SHIPPED = [
      "Мини участъка със стояща вода на извънградския път: намали под 58 км/ч ПРЕДИ водата, прекоси я с равна газ и прав волан и спри плавно на позицията зад авариралия автомобил — над ~65 км/ч гумите изплуват и нито спирачката, нито воланът работят.",
      "Помни: знакът извън града е 90, но дъждът сваля разумната скорост.",
    ];
    const locale = WORLD_CLAIMS.find((c) => c.noun === LOCALE_CLAIM)!;
    for (const line of SHIPPED) expect(locale.re.test(line), line).toBe(true);
    // …on the map they shipped on, which is lit, so the claim is refused…
    expect(locale.carriedBy("ac-aqua-v1")).toBe(false);
    // …and neither line is still in the file.
    const all = SCENARIO_TEMPLATES_CONDITIONS.flatMap((s) => driverCopy(s));
    for (const line of SHIPPED) expect(all).not.toContain(line);
    // The replacement says only what the posted plate says, and passes.
    const kept = "Помни: знакът тук разрешава 90, но дъждът сваля разумната скорост.";
    expect(locale.re.test(kept)).toBe(false);
    expect(all).toContain(kept);
  });

  it("…and the lit-street measurement it rests on is the built world, not the tag", () => {
    // The numbers that convict ac-aqua-v1. If props.ts ever stops dressing a
    // scenario micro-map, THIS goes red first and tells the next lane the
    // locale rule's premise has moved — instead of a sweep passing silently.
    const aqua = censusOf("ac-aqua-v1");
    expect(aqua.streetlights).toBe(16);
    expect(aqua.utilityPoles).toBe(15);
    // …and its own document says the opposite, which is exactly why the
    // document may not be the witness.
    const doc = rawDistrict("ac-aqua-v1") as {
      roads: { edges: { class: string; maxspeed: number }[] };
    };
    expect(doc.roads.edges[0]!.class).toBe("unclassified");
    expect(doc.roads.edges[0]!.maxspeed).toBe(90);
    // Every district this family runs on is lit, so no lesson here may claim to
    // be outside the built-up area today and the sweep above is not vacuous.
    for (const id of DISTRICT_IDS) expect(censusOf(id).streetlights).toBeGreaterThan(0);
  });

  it("the А15 rule has teeth — posted on two maps, refused on the other three", () => {
    const a15 = WORLD_CLAIMS.find((c) => c.noun === A15_CLAIM)!;
    expect(a15.re.test("Прочети знака А15 напред: платното изглежда сухо.")).toBe(true);
    // The two districts that post one (zoneSigns.ts icePatch/waterPatch →
    // "slippery", HAZARD_WARNING_AHEAD_M ahead of the span).
    expect(a15.carriedBy("ac-ice-v1")).toBe(true);
    expect(a15.carriedBy("ac-aqua-v1")).toBe(true);
    // …and the three that do not, so the same sentence is refused there.
    for (const id of ["ac-rain-v1", "ac-night-v1", "fo-follow-v1"]) {
      expect(censusOf(id).signs["slippery"] ?? 0, id).toBe(0);
      expect(a15.carriedBy(id), id).toBe(false);
    }
  });

  it("the drills that CAN read an А15 do read it — the cue is not deleted again", () => {
    // The first wave struck „Прочети знака А15 „Опасност от хлъзгане" преди
    // моста" out of sc-ac-ice for its BRIDGE and took the plate with it. Both
    // maps that post one now name it in the briefing the student reads while he
    // still has room to slow down.
    for (const id of ["sc-ac-ice", "sc-ac-aquaplane"]) {
      const spec = SCENARIO_TEMPLATES_CONDITIONS.find((s) => s.id === id)!;
      expect((censusOf(spec.map.districtId).signs["slippery"] ?? 0) > 0, id).toBe(true);
      const steps = spec.instructionsBg.map((s) => s.textBg);
      expect(steps.some((t) => /А15/u.test(t)), id).toBe(true);
    }
  });
});
