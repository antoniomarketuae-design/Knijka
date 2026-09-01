/**
 * SWEEP 161 — THE NEVER-EDITED TEMPLATE FILES' WORLD CLAIMS, IN BOTH DIRECTIONS.
 *
 * Eight scenario-template files were handed to a lane and never opened; the
 * 2026-08-16/17 device sweep had photographed thirteen findings against them and
 * eleven are the same crime the SP family was cleaned of in
 * `sp-world-claims.test.ts`: A BRIEFING NAMED A THING THAT IS NOT OUT THE
 * WINDSCREEN — or a GRADED GATE was TITLED against one.
 *
 * This file is that gate, in the same mold and for the same reason: every claim
 * below is a QUESTION PUT TO THE DISTRICT THE LESSON LOADS (and, where the
 * question is about furniture, to `buildWorldGeometry` itself), so the same
 * sentence is legal on one map and refused on another. §3 proves exactly that.
 *
 * WHAT WAS STRUCK, AND WHAT IT WAS MEASURED AGAINST — the sign census below is
 * `buildWorldGeometry(assertDistrict(<district>.json)).signs`, folded by kind,
 * taken 2026-08-19 and re-taken by §0 on every run so no number here can go
 * stale silently:
 *
 *   ac-bridge-v1  { limit50: 2, slippery: 1 }     — one zone, `icePatch`
 *     sc-ac-bridge-ice spent five of ten instructions and TWO OF THREE GRADED
 *     GATE TITLES on a bridge: „сградите свършват и пътят тръгва над дерето",
 *     „знака А15 на устоя", «Вдигни крака от газта ПРЕДИ близкия устой»,
 *     «Стигни отсрещния устой…». `DistrictZoneKind` has no deck/abutment member
 *     and no builder draws one, so no map could have made them true. The А15
 *     the copy now reads off IS built, 60 m ahead of the ice.
 *
 *   mv-uturn-v1   { stop: 1, priorityRoad: 2, limit50: 5, limit30: 2 }
 *     sc-mv-uturn-ban told the student to read „знак В23" and carried it as a
 *     tagsBg chip. The district really does author `meta.scenario.uturnBanSign`
 *     — and `grep -rn uturnBanSign src/` finds no reader outside tests: the one
 *     sign-placing builder (zoneSigns.ts) reads `district.zones`, whose single
 *     member here is `solidCenterLine`, a marking-only kind. The М1 line IS
 *     drawn, and the ban is now taught off the line.
 *
 *   jx-equal-v1   { limit40: 8 }
 *     sc-jx-equal-left opened „няма никакви знаци и никакъв светофар" beside
 *     eight speed-limit posts. Narrowed to the true and sharper claim: no
 *     PRIORITY sign, no signal.
 *
 *   mw-exit-v1    { limit140: 3, noEntry: 3, curve: 1 }
 *     sc-merge-motorway-exit promised „500 – 300 – 100 м" boards (no distance
 *     SignKind exists at all) and „знакът А1 с табела „60"" (the А1 is posted;
 *     its В26 plate is withheld — this ramp is one of the three curves
 *     zoneSigns.ts leaves А1-only for want of `CURVE_PLATE_MIN_ROOM_M`).
 *
 *   mw-v1         { limit140: 2, noEntry: 2 }
 *     sc-ac-wind-truck-pass threw the car „към мантинелата" four times on the
 *     map whose мантинела was already struck out of sc-mw-discipline.
 *
 *   ov-oncoming-v1 { limit90: 2 }, edge class `tertiary`
 *     sc-ac-night-overdrive opened „по този път няма нито една лампа" on the
 *     one road class props.ts builds streetlights FOR.
 *
 * AND TWO FINDINGS THIS GATE REFUTES RATHER THAN CLOSES — §5. A false refusal
 * is the founder's own complaint, so a briefing is not rewritten because a
 * frame looked empty:
 *
 *   rb-mini-v1    { giveWay: 4, roundabout: 4, limit40: 4, passRight: 4 }
 *     „No such sign, no give-way line" — there are FOUR Б1 posts, four Г12
 *     plates, and markings.ts paints the М7 line + М18 triangles on the same
 *     approaches. sc-roundabout-entry's instructions 1 and 3 are correct and
 *     are asserted here so a later lane cannot strike them.
 *
 *   pk-rail-v1    { limit50: 3, noStopping: 2, railGuarded: 1, railCross: 1,
 *                   barrier: 1 }
 *     „rail crossing not rendered" — the А34, the St Andrew's cross, the boom
 *     and (railTrack.ts) the track deck are all built from the `railCrossing`
 *     zone. sc-pk-rail-ban's «Прелезът е охраняем (А34) и бариерата е вдигната»
 *     is true on both halves: the boom's timetable is down 480–540 s and the
 *     drill window is 180 s, so it is up for the whole lesson.
 *
 * WHICH TEXT IS A CLAIM — the sp-world-claims rule, with ONE widening that this
 * lane's findings forced. `titleBg`, `objectiveBg`, `tagsBg`, `instructionsBg`
 * and the objective row titles are claims, and `teach.*` is not (it states the
 * RULE, true on every map: „мост, надлез, сянка заледява пръв" must not shrink
 * to whatever micro-map is loaded). The widening is `mistakes[].titleBg` and
 * `whatWentWrongBg`: sp-world-claims excluded them because „the recording is its
 * own evidence", and that holds for the DRIVING — but not for scenery the prose
 * adds around it. sc-ac-bridge-ice's demo cards had the car finding „парапета"
 * on a street that has none, and the student reads those cards over a replay of
 * the same empty road. So they are gated, and §2 keeps them saying something.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ARTERIAL_CLASSES } from "../../../world/builders/constants";
import { buildWorldGeometry } from "../../../world/builders/buildWorldGeometry";
import { assertDistrict } from "../../../world";
import { recordScAcNightOverdriveDrive } from "../../../traces/scAcNightOverdrive";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { parseObjectiveParams } from "../../objectives";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES_CONDITIONS2 } from "../templates-conditions2";
import { SCENARIO_TEMPLATES_FLOW } from "../templates-flow";
import { SCENARIO_TEMPLATES_JUNCTIONS2 } from "../templates-junctions2";
import { SCENARIO_TEMPLATES_JUNCTIONS3 } from "../templates-junctions3";
import { SCENARIO_TEMPLATES_MERGING2 } from "../templates-merging2";
import { SCENARIO_TEMPLATES_PARKING2 } from "../templates-parking2";
import { SCENARIO_TEMPLATES_PK } from "../templates-pk";
import { SCENARIO_TEMPLATES_SPEED2 } from "../templates-speed2";
import type { ScenarioLevel, ScenarioSpec } from "../types";

const REPO_ROOT = path.join(process.cwd(), "..");

/** The eight files this lane owns, in the order they were routed. */
const LANE_TEMPLATES: readonly ScenarioSpec[] = [
  ...SCENARIO_TEMPLATES_PARKING2,
  ...SCENARIO_TEMPLATES_CONDITIONS2,
  ...SCENARIO_TEMPLATES_FLOW,
  ...SCENARIO_TEMPLATES_JUNCTIONS3,
  ...SCENARIO_TEMPLATES_SPEED2,
  ...SCENARIO_TEMPLATES_MERGING2,
  ...SCENARIO_TEMPLATES_PK,
  ...SCENARIO_TEMPLATES_JUNCTIONS2,
];

/** The slice of a district document these claims interrogate. Loose on purpose
 *  (the sp-world-claims rule): a claim must be answerable from the COMMITTED
 *  JSON, not from a parser that might normalise the very field in question. */
interface DistrictJson {
  meta?: { scenario?: { params?: Record<string, unknown> } & Record<string, unknown> };
  roads?: { edges?: { id: string; class?: string; maxspeed?: number }[] };
  buildings?: { id: string; kind?: string }[];
  zones?: { id: string; kind?: string }[];
  roundabouts?: { id: string }[];
}

const rawDistrict = (id: string): unknown =>
  JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8")) as unknown;

const DISTRICT_IDS = [...new Set(LANE_TEMPLATES.map((s) => s.map.districtId))].sort();
const DISTRICTS = new Map<string, DistrictJson>(
  DISTRICT_IDS.map((id) => [id, rawDistrict(id) as DistrictJson]),
);

/**
 * The signs that ACTUALLY GET BUILT for a district, folded by kind — the whole
 * production pass (`buildWorldGeometry`), not a re-derivation of it. This is
 * what makes „the map has a В23 in its metadata" and „a В23 stands on the road"
 * two different questions, which is the exact gap sc-mv-uturn-ban fell into.
 */
const SIGN_CENSUS = new Map<string, Readonly<Record<string, number>>>(
  DISTRICT_IDS.map((id) => {
    const by: Record<string, number> = {};
    for (const s of buildWorldGeometry(assertDistrict(rawDistrict(id))).signs) {
      by[s.kind] = (by[s.kind] ?? 0) + 1;
    }
    return [id, by];
  }),
);
const signsOf = (districtId: string, kind: string): number =>
  SIGN_CENSUS.get(districtId)?.[kind] ?? 0;

// ---------------------------------------------------------------------------
// The claims
// ---------------------------------------------------------------------------

interface WorldClaim {
  /** What the sentence promises, in the word a briefing would use. */
  noun: string;
  /** How that promise is spelled in student-facing Bulgarian. */
  re: RegExp;
  /** Does the world the lesson loads actually carry it? */
  carriedBy: (d: DistrictJson, spec: ScenarioSpec) => boolean;
  /** What would have to be authored for the promise to become true. */
  how: string;
}

const WORLD_CLAIMS: readonly WorldClaim[] = [
  {
    noun: "мост / устой / дере (пътно съоръжение)",
    // DEICTIC ONLY, and that distinction is the whole design. „мост, надлез,
    // сянка заледява пръв" is the LAW and is legal on every map; „ето мост",
    // „отсрещния устой", „над дерето", „по моста", „върху съоръжението" point
    // at geometry in front of the student. `DistrictZoneKind` (world/types.ts)
    // has no deck member, so the predicate answers `false` on every district in
    // the catalogue today — honestly rather than rhetorically: the day a
    // `bridgeDeck` kind is authored it starts crediting it with no edit here.
    // (The мантинела claim in sp-world-claims.test.ts has exactly this shape.)
    re: /устой|устоя|над дерето|това е мост|съоръжението|по моста|на моста|мостът е/iu,
    carriedBy: (d) => (d.zones ?? []).some((z) => z.kind === "bridgeDeck"),
    how: 'zone with kind "bridgeDeck" — no such kind exists yet (world/types.ts DistrictZoneKind)',
  },
  {
    noun: "мантинела",
    // Struck from sc-mw-discipline first; it had survived on the same map in
    // sc-ac-wind-truck-pass. `DistrictZone.barrier` is the railCrossing boom
    // timetable, and props.ts's only railing is a kerb-backed pavement parapet
    // that `continue`s on a bare verge — which a motorway median is.
    re: /мантинел/iu,
    carriedBy: (d) => (d.zones ?? []).some((z) => z.kind === "crashBarrier"),
    how: 'zone with kind "crashBarrier" — no such kind exists yet (world/types.ts DistrictZoneKind)',
  },
  {
    noun: "знак В23 „забранен обратен завой“",
    re: /В23/u,
    // There is no `uTurnBan` SignKind and nothing reads
    // `meta.scenario.uturnBanSign`. Asked of the CENSUS, so authoring the
    // reader is what lifts the refusal — not editing this line.
    carriedBy: (_d, spec) => signsOf(spec.map.districtId, "uTurnBan") > 0,
    how: 'a built sign of kind "uTurnBan" (world/builders/zoneSigns.ts reads district.zones only; meta.scenario.uturnBanSign has no reader)',
  },
  {
    noun: "указателни табели с метрите до изхода",
    re: /500\s*[–-]\s*300\s*[–-]\s*100|указателните табели броят метрите/iu,
    carriedBy: (_d, spec) => signsOf(spec.map.districtId, "distanceBoard") > 0,
    how: 'a built sign of kind "distanceBoard" — no such SignKind exists yet (world/types.ts)',
  },
  {
    noun: "табела „60“ под знака А1",
    // The А1 post itself is built for a `curveAdvisory` zone; its В26 advisory
    // PLATE is withheld when the span starts inside CURVE_PLATE_MIN_ROOM_M of
    // its edge, which is mw-exit-v1's ramp. So the sign may be named and the
    // number may not be hung on it.
    re: /А1 с табела|табела\s*„60/iu,
    carriedBy: (_d, spec) => signsOf(spec.map.districtId, "curveAdvisoryPlate") > 0,
    how: 'a built sign of kind "curveAdvisoryPlate" (zoneSigns.ts withholds it when the curve span starts within CURVE_PLATE_MIN_ROOM_M)',
  },
  {
    noun: "улица без нито една лампа",
    // The claim is the ABSENCE, so the predicate is inverted on purpose: the
    // sentence is legal only where props.ts builds no streetlight, i.e. no edge
    // in an ARTERIAL class. ov-oncoming-v1's single edge is `tertiary`.
    re: /няма нито една лампа|няма никакво улично осветление/iu,
    carriedBy: (d) => !(d.roads?.edges ?? []).some((e) => ARTERIAL_CLASSES.has(e.class ?? "")),
    how: "no edge in ARTERIAL_CLASSES (world/builders/constants.ts — props.ts builds streetlights from exactly that set)",
  },
  {
    noun: "липса на всякакви знаци",
    // „няма никакви знаци" is a claim about the census and nothing else.
    re: /няма никакви знаци/iu,
    carriedBy: (_d, spec) =>
      Object.values(SIGN_CENSUS.get(spec.map.districtId) ?? {}).reduce((a, b) => a + b, 0) === 0,
    how: "a district whose built sign census is empty",
  },
  {
    noun: "знак „Пропусни движението“ (Б1)",
    // Backed on rb-mini-v1 — kept as a claim so that if a future map change
    // removes the posts, the sentence that reads them fails here first.
    re: /„Пропусни движението“|Пропусни движението“/u,
    carriedBy: (_d, spec) => signsOf(spec.map.districtId, "giveWay") > 0,
    how: 'a built sign of kind "giveWay" (world/builders/props.ts, junctionPriorityControls)',
  },
  {
    noun: "жп прелез",
    re: /прелез|коловоз|релси/iu,
    carriedBy: (d) => (d.zones ?? []).some((z) => z.kind === "railCrossing"),
    how: 'zone with kind "railCrossing" (world/builders/railTrack.ts + zoneSigns.ts)',
  },
  {
    noun: "кръгово движение",
    re: /кръгово|в кръга/iu,
    carriedBy: (d) => (d.roundabouts ?? []).length > 0,
    how: "a registered roundabout in the district document",
  },
];

/** Everything the student reads as a description of THIS drive. See the header
 *  for why `teach.*` is out and why the mistake cards are in. */
function shownToTheStudent(spec: ScenarioSpec): { where: string; text: string }[] {
  return [
    { where: "titleBg", text: spec.titleBg },
    { where: "objectiveBg", text: spec.objectiveBg },
    ...spec.tagsBg.map((t, i) => ({ where: `tagsBg[${i}]`, text: t })),
    ...spec.instructionsBg.map((s) => ({ where: `instruction ${s.n}`, text: s.textBg })),
    ...spec.success.map((o) => ({ where: `success ${o.id}`, text: o.titleBg })),
    ...(spec.mistakes ?? []).flatMap((m, i) => [
      { where: `mistake[${i}].titleBg`, text: m.titleBg },
      { where: `mistake[${i}].whatWentWrongBg`, text: m.whatWentWrongBg },
    ]),
  ];
}

/** The whole gate in one function, so §1 and §3 cannot drift apart. */
function unbackedClaims(spec: ScenarioSpec, district: DistrictJson): string[] {
  const out: string[] = [];
  for (const claim of WORLD_CLAIMS) {
    if (claim.carriedBy(district, spec)) continue;
    for (const { where, text } of shownToTheStudent(spec)) {
      if (claim.re.test(text)) {
        out.push(
          `${spec.id} ${where} promises „${claim.noun}" — ${spec.map.districtId} carries no ${claim.how}: ${text}`,
        );
      }
    }
  }
  return out;
}

const specById = (id: string): ScenarioSpec => {
  const s = LANE_TEMPLATES.find((x) => x.id === id);
  if (s === undefined) throw new Error(`no template ${id} in this lane`);
  return s;
};

// ---------------------------------------------------------------------------
// §0 — the census this file's header quotes, re-taken on every run
//
// Every number in the header is a measurement, and a measurement nobody re-takes
// is a memory. If a builder or a map moves, this fails before the prose lies.
// ---------------------------------------------------------------------------

describe("§0 the sign census the fixes were measured against", () => {
  const EXPECTED: Readonly<Record<string, Readonly<Record<string, number>>>> = {
    "ac-bridge-v1": { limit50: 2, slippery: 1 },
    "mv-uturn-v1": { stop: 1, priorityRoad: 2, limit50: 5, limit30: 2 },
    "jx-equal-v1": { limit40: 8 },
    "mw-exit-v1": { limit140: 3, noEntry: 3, curve: 1 },
    "mw-v1": { limit140: 2, noEntry: 2 },
    "ov-oncoming-v1": { limit90: 2 },
    // passRight (Г9) joined the census in repair wave 17, and it is a REPAIR,
    // not drift. The central island carried nothing a driver may read: Б1 and
    // Г12 stand out at the mouth, so from the give-way line the obstacle they
    // are talking about was a bare lawn — photographed at
    // .audit-frames/sweep161/sc-rb-ped-exit/mobile-right/04-t001s.png. A
    // Bulgarian central island carries Г9 «Преминаване отдясно на знака»
    // facing each entry; four mouths, four plates. Retrieved from
    // content/signs/signs.json (Наредба № РД-02-21-1/23.11.2023, знак Г9),
    // never recalled — ADR-002.
    "rb-mini-v1": { giveWay: 4, roundabout: 4, limit40: 4, passRight: 4 },
    "pk-rail-v1": { limit50: 3, noStopping: 2, railGuarded: 1, railCross: 1, barrier: 1 },
  };
  for (const [id, want] of Object.entries(EXPECTED)) {
    it(`${id}`, () => {
      expect(SIGN_CENSUS.get(id)).toEqual(want);
    });
  }
});

// ---------------------------------------------------------------------------
// §1 — nothing these eight files say about the world may be missing from it
// ---------------------------------------------------------------------------

describe("§1 every briefing claim is carried by the world the lesson loads", () => {
  for (const spec of LANE_TEMPLATES) {
    it(`${spec.id} on ${spec.map.districtId}`, () => {
      expect(unbackedClaims(spec, DISTRICTS.get(spec.map.districtId)!)).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// §2 — the OPPOSITE direction: the backed claims are still MADE
//
// Striking a sentence is the cheap way to pass §1 and it would leave a student
// with an А15 nobody told him to read. Every claim these lessons legitimately
// own is asserted PRESENT here, against the same predicates.
// ---------------------------------------------------------------------------

describe("§2 the claims these lessons HAVE earned are still said, and still backed", () => {
  const said = (spec: ScenarioSpec, re: RegExp) =>
    shownToTheStudent(spec).some((s) => re.test(s.text));

  it("sc-ac-bridge-ice still points at the А15 — the one cue ac-bridge-v1 gives", () => {
    const spec = specById("sc-ac-bridge-ice");
    expect(said(spec, /А15/u)).toBe(true);
    expect(signsOf("ac-bridge-v1", "slippery")).toBe(1);
    // …and the ice it warns about is still physically real, not a render tag.
    expect(
      (DISTRICTS.get("ac-bridge-v1")!.zones ?? []).some((z) => z.kind === "icePatch"),
    ).toBe(true);
  });

  it("sc-ac-bridge-ice still teaches WHY bridges freeze — in teach, where it is doctrine", () => {
    // The rule survived the strike. If a later lane deletes it to quiet §1,
    // this fails: the gate must never be satisfiable by teaching less.
    const spec = specById("sc-ac-bridge-ice");
    expect(/мост/iu.test(spec.teach.whyBg)).toBe(true);
    expect(said(spec, /мост, надлез, сянка/iu)).toBe(true);
  });

  it("sc-mv-uturn-ban still teaches the ban off the М1 line, which IS drawn", () => {
    const spec = specById("sc-mv-uturn-ban");
    expect(said(spec, /плътна(та)? осева|непрекъсната осева/iu)).toBe(true);
    expect(
      (DISTRICTS.get("mv-uturn-v1")!.zones ?? []).some((z) => z.kind === "solidCenterLine"),
    ).toBe(true);
  });

  it("sc-jx-equal-left still says what makes the junction равнозначно", () => {
    const spec = specById("sc-jx-equal-left");
    expect(said(spec, /знак за предимство/iu)).toBe(true);
    expect(said(spec, /светофар/iu)).toBe(true);
    // …and the census still shows exactly zero of each.
    expect(signsOf("jx-equal-v1", "giveWay")).toBe(0);
    expect(signsOf("jx-equal-v1", "stop")).toBe(0);
    expect(signsOf("jx-equal-v1", "priorityRoad")).toBe(0);
  });

  it("sc-merge-motorway-exit still names the decel lane, which mw-exit-v1 authors", () => {
    const spec = specById("sc-merge-motorway-exit");
    expect(said(spec, /лентата за намаляване се отваря/iu)).toBe(true);
    expect(DISTRICTS.get("mw-exit-v1")!.meta!.scenario!.decelLaneFromY).toBe(520);
  });

  it("sc-ac-night-overdrive still orders the lamps чл. 70 grades", () => {
    expect(said(specById("sc-ac-night-overdrive"), /включи късите светлини/iu)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §3 — THE MUTATION, KEPT IN THE SUITE
//
// Each struck sentence, verbatim, pushed back through the SAME checker §1 uses
// and shown to be refused on the map that shipped it. A predicate hard-wired to
// `false` would pass §1 and §3 and die in §2; a predicate hard-wired to `true`
// dies here. The bridge sentence is additionally shown ACCEPTED the moment the
// district grows the feature, which is what proves the refusal is a fact about
// the MAP and not about the word.
// ---------------------------------------------------------------------------

describe("§3 the struck sentences are refused by this gate, and only where they were false", () => {
  const withInstruction = (spec: ScenarioSpec, n: number, textBg: string): ScenarioSpec => ({
    ...spec,
    instructionsBg: spec.instructionsBg.map((s) => (s.n === n ? { ...s, textBg } : s)),
  });
  const withSuccessTitle = (spec: ScenarioSpec, id: string, titleBg: string): ScenarioSpec => ({
    ...spec,
    success: spec.success.map((o) => (o.id === id ? { ...o, titleBg } : o)),
  });

  const STRUCK_BRIDGE =
    "Погледни напред: сградите свършват и пътят тръгва над дерето — това е мост.";
  const STRUCK_ABUTMENT_GATE = "Вдигни крака от газта ПРЕДИ близкия устой";
  const STRUCK_V23 =
    "Тръгни по булеварда в дясната лента. Още от 40-ия метър осевата линия е ПЛЪТНА и е поставен знак В23 „Забранено е завиването в обратна посока“.";
  const STRUCK_NO_SIGNS =
    "Тръгни по южната улица към кръстовището. Огледай се: няма никакви знаци и никакъв светофар — четирите улици са равнозначни.";
  const STRUCK_BOARDS =
    "Указателните табели броят метрите до изхода (500 – 300 – 100 м). Дръж темпото на потока по дясната лента за движение — тук още НЕ се намалява.";
  const STRUCK_LAMPS = "Включи късите светлини — нощ е и по този път няма нито една лампа.";
  const STRUCK_BARRIER = "Изненадан от порива — към мантинелата";

  it("„над дерето — това е мост“ on ac-bridge-v1 → refused (one icePatch, no deck)", () => {
    const rolledBack = withInstruction(specById("sc-ac-bridge-ice"), 3, STRUCK_BRIDGE);
    const misses = unbackedClaims(rolledBack, DISTRICTS.get("ac-bridge-v1")!);
    expect(misses).toHaveLength(1);
    expect(misses[0]).toContain("bridgeDeck");
    expect(unbackedClaims(specById("sc-ac-bridge-ice"), DISTRICTS.get("ac-bridge-v1")!)).toEqual([]);
  });

  it("the GRADED TITLE «…ПРЕДИ близкия устой» is refused too — a gate is a claim", () => {
    // The half a keyword ban would have missed entirely: the sentence lived in
    // `success[].titleBg`, i.e. on the task chip the student stares at while
    // the tick refuses to arrive.
    const rolledBack = withSuccessTitle(
      specById("sc-ac-bridge-ice"),
      "sc-acbi-before",
      STRUCK_ABUTMENT_GATE,
    );
    const misses = unbackedClaims(rolledBack, DISTRICTS.get("ac-bridge-v1")!);
    expect(misses).toHaveLength(1);
    expect(misses[0]).toContain("success sc-acbi-before");
  });

  it("the SAME bridge sentence on a district that grows a deck → accepted", () => {
    // Same words, a district with the feature, opposite verdict. This is the
    // row that makes the предикат a question about the world.
    const asIfBuilt: DistrictJson = {
      ...DISTRICTS.get("ac-bridge-v1")!,
      zones: [...(DISTRICTS.get("ac-bridge-v1")!.zones ?? []), { id: "x", kind: "bridgeDeck" }],
    };
    const rolledBack = withInstruction(specById("sc-ac-bridge-ice"), 3, STRUCK_BRIDGE);
    expect(unbackedClaims(rolledBack, asIfBuilt)).toEqual([]);
  });

  it("„знак В23“ on mv-uturn-v1 → refused (the map declares it; nothing builds it)", () => {
    const rolledBack = withInstruction(specById("sc-mv-uturn-ban"), 1, STRUCK_V23);
    const misses = unbackedClaims(rolledBack, DISTRICTS.get("mv-uturn-v1")!);
    expect(misses).toHaveLength(1);
    expect(misses[0]).toContain("uTurnBan");
    // The metadata really is there — which is the point: a declared sign and a
    // built sign are different facts, and only the second one a student can read.
    expect(
      (DISTRICTS.get("mv-uturn-v1")!.meta!.scenario!.uturnBanSign as { signRef: string }).signRef,
    ).toBe("В23");
    expect(signsOf("mv-uturn-v1", "uTurnBan")).toBe(0);
  });

  it("„няма никакви знаци“ on jx-equal-v1 → refused (eight limit40 posts)", () => {
    const rolledBack = withInstruction(specById("sc-jx-equal-left"), 1, STRUCK_NO_SIGNS);
    const misses = unbackedClaims(rolledBack, DISTRICTS.get("jx-equal-v1")!);
    expect(misses).toHaveLength(1);
    expect(misses[0]).toContain("empty");
  });

  it("„500 – 300 – 100 м“ on mw-exit-v1 → refused (no distance board exists)", () => {
    const rolledBack = withInstruction(specById("sc-merge-motorway-exit"), 3, STRUCK_BOARDS);
    const misses = unbackedClaims(rolledBack, DISTRICTS.get("mw-exit-v1")!);
    expect(misses).toHaveLength(1);
    expect(misses[0]).toContain("distanceBoard");
  });

  it("„няма нито една лампа“ on ov-oncoming-v1 → refused; on ac-bridge-v1 → accepted", () => {
    // The inverted predicate proved in BOTH directions on real maps, which is
    // the only way to know it is reading the road class and not the words:
    // ov-oncoming-v1's edge is `tertiary` (arterial ⇒ lamps), ac-bridge-v1's is
    // `residential` (⇒ none), so the identical sentence flips verdict.
    const night = specById("sc-ac-night-overdrive");
    const rolledBack = withInstruction(night, 1, STRUCK_LAMPS);
    expect(unbackedClaims(rolledBack, DISTRICTS.get("ov-oncoming-v1")!)).toHaveLength(1);
    expect(unbackedClaims(rolledBack, DISTRICTS.get("ac-bridge-v1")!)).toEqual([]);
    expect(unbackedClaims(night, DISTRICTS.get("ov-oncoming-v1")!)).toEqual([]);
  });

  it("„към мантинелата“ on mw-v1 → refused, in the MISTAKE card as well", () => {
    // The widening this file makes over sp-world-claims, exercised: the struck
    // string is a `mistakes[].titleBg`, which that gate does not read.
    const spec = specById("sc-ac-wind-truck-pass");
    const rolledBack: ScenarioSpec = {
      ...spec,
      mistakes: (spec.mistakes ?? []).map((m, i) => (i === 0 ? { ...m, titleBg: STRUCK_BARRIER } : m)),
    };
    const misses = unbackedClaims(rolledBack, DISTRICTS.get("mw-v1")!);
    expect(misses).toHaveLength(1);
    expect(misses[0]).toContain("mistake[0].titleBg");
    expect(misses[0]).toContain("crashBarrier");
  });
});

// ---------------------------------------------------------------------------
// §4 — A CONDITION A BRIEFING STATES MUST HOLD ON EVERY RUNG IT SHIPS TO
//
// The other half of the same crime, and the one no district can answer.
// `instructionsBg` is ONE text compiled to all five rungs — `LevelSpec`
// (types.ts) has no instruction override — while `conditions` is a per-rung
// key. sc-sp-wet-limit-plate ALTERNATES its ladder on purpose (L1–L2 dry,
// L3–L5 rain + wetGrip) and its instructions used to assert „Днес обаче вали и
// настилката е мокра", then order 38 км/ч, to a Ниво-1 student looking at a dry
// street. Both directions were wrong: obey the text and drive 38 where 50 is
// lawful; read the road and contradict your own briefing.
//
// The rule is therefore: a briefing may state a condition only if the condition
// is true at EVERY rung. A conditional („Мокро ли е…", „Вали ли…") is true on
// both halves of an alternating ladder and is what the fixed copy uses.
// ---------------------------------------------------------------------------

describe("§4 no briefing asserts weather the rung it ships to does not have", () => {
  /**
   * THE DETECTOR, AND THE TWO WAYS ITS FIRST DRAFT LIED — both in the
   * reassuring direction for the lane and the accusing direction for the copy,
   * which is why they are written down instead of quietly patched:
   *
   *  1. SUBSTRINGS. `/вали/` fires inside «С-ВАЛИ скоростта преди знака»
   *     (sc-sp-limit-end instruction 2) — the same shape as the verdict regex
   *     that once matched «точк» inside «изпитни т.». JavaScript's `\b` is
   *     defined on `[A-Za-z0-9_]`, so it is worthless against Cyrillic; the
   *     boundaries below are explicit `\p{L}` lookarounds under the `u` flag.
   *  2. CONDITIONALS. «Ако вали, включи…» and «Щом настилката е мокра…» are
   *     QUESTIONS PUT TO THE STUDENT, true on a dry rung and on a wet one —
   *     they are the fix, not the defect. So the unit of judgement is the
   *     SENTENCE: a sentence carrying ако / щом / когато / ли is conditional
   *     and is skipped whole.
   *
   * Both were caught by running the gate over all eight files before believing
   * it: four templates were accused, all four wrongly, and the one true
   * positive is the line the sweep photographed.
   */
  const LETTER_BOUNDED = (w: string) => `(?<![\\p{L}])${w}(?![\\p{L}])`;
  const ASSERTS_WET = new RegExp(
    `${LETTER_BOUNDED("вали")}|настилката е мокра|пътят е мокър|мокър е пътят`,
    "iu",
  );
  const ASSERTS_NIGHT = new RegExp(`${LETTER_BOUNDED("нощ")}\\s+е(?![\\p{L}])`, "iu");
  const IS_CONDITIONAL = new RegExp(
    [
      LETTER_BOUNDED("ако"),
      LETTER_BOUNDED("щом"),
      LETTER_BOUNDED("когато"),
      LETTER_BOUNDED("ли"),
    ].join("|"),
    "iu",
  );
  /** Sentences of one instruction that ASSERT rather than ask. */
  const assertingSentences = (textBg: string, re: RegExp): string[] =>
    textBg
      .split(/(?<=[.!?])\s+/u)
      .filter((s) => !IS_CONDITIONAL.test(s) && re.test(s));

  const rungWeather = (spec: ScenarioSpec, level: number): string =>
    (spec.levels.find((l) => l.level === level)?.conditions?.weather ??
      spec.conditions?.weather ??
      "dry") as string;
  const rungNight = (spec: ScenarioSpec, level: number): boolean =>
    spec.levels.find((l) => l.level === level)?.conditions?.night ??
    spec.conditions?.night ??
    false;

  for (const spec of LANE_TEMPLATES) {
    it(`${spec.id}`, () => {
      const wet = spec.instructionsBg.filter((i) => assertingSentences(i.textBg, ASSERTS_WET).length > 0);
      const night = spec.instructionsBg.filter((i) => assertingSentences(i.textBg, ASSERTS_NIGHT).length > 0);
      for (const rung of spec.levels) {
        if (wet.length > 0) {
          expect(
            ["rain", "snow"].includes(rungWeather(spec, rung.level)),
            `${spec.id} L${rung.level} is «${rungWeather(spec, rung.level)}» but instruction ${wet[0].n} asserts rain: ${wet[0].textBg}`,
          ).toBe(true);
        }
        if (night.length > 0) {
          expect(
            rungNight(spec, rung.level),
            `${spec.id} L${rung.level} is daylight but instruction ${night[0].n} asserts night: ${night[0].textBg}`,
          ).toBe(true);
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // …AND THE SAME QUESTION PUT TO THE DEMONSTRATION CAPTION
  // ---------------------------------------------------------------------------
  //
  // THE RULE ABOVE WAS OBEYED AND THE ROW STAYED OPEN. `sc-sp-wet-limit-plate`'s
  // instructions were re-authored weather-neutral by the wave that wrote this
  // section, and the 2026-08-24 sweep still photographed the assertion — it had
  // moved into the demonstration caption, which is baked into
  // `content/traces/<lesson>/*.trace.json` and painted across the windscreen
  // under «ДЕМОНСТРАЦИЯ — СЛЕДВАЙ СЯНКАТА». w10-3 pc-right/04-t038s.png carries
  // «важи: вали. Таванът ни е 40 км/ч» on the SAME screenshot as instruction 2
  // saying 50 is lawful today, over a dry street.
  //
  // A caption is compiled to every rung exactly the way an instruction is, so
  // it takes exactly the same rule and the same detector — including the
  // conditional escape, which is the shape the repaired copy uses. Read from the
  // COMMITTED FILE because that is what the browser plays; a script edited
  // without a re-record would otherwise pass on copy nobody sees.
  //
  // READ ONCE, EAGERLY, IN THE DESCRIBE BODY — and that is not tidiness, it is
  // the difference between a green gate and a red one.
  //
  // MEASURED TWICE. Written as a plain re-read this reader took 243 file reads
  // over 26 templates in one run of the three `it`s below — 81 distinct traces,
  // opened and `JSON.parse`d three times each, because every `it` (and both
  // filters inside the offenders loop) starts from the spec again. A LAZY
  // per-path memo removes the ×3 and nothing else, and that was not enough: the
  // first `it` still pays the whole COLD pass, and on 2026-08-25, on this
  // 7200 rpm HDD with five other lanes on the same spindle, the lazily-memoised
  // version still died — `Test timed out in 5000ms` at the sweep below, 10.7 s
  // elapsed. The corpus is ~81 files × ~100 KB ≈ 8 MB of JSON; that is a
  // seek-bound read, not a parse.
  //
  // So the read moves OUT of the `it` entirely. A describe callback runs at
  // COLLECTION, which `testTimeout` does not govern — the same place this file
  // already builds `DISTRICTS` and `SIGN_CENSUS` — so the cost is paid once,
  // outside the 5 s budget, and every `it` below is a pure lookup. The
  // integrator's full-gate run is exactly the contended condition that made the
  // lazy version fail, which is why this may not be left as a memo.
  //
  // Traces are static under a suite, so one pass is the whole truth.
  const tracePathsOf = (spec: ScenarioSpec): readonly string[] => [
    ...(spec.shadow ? [spec.shadow.path] : []),
    ...(spec.mistakes ?? []).flatMap((m) => (m.traceRef ? [m.traceRef.path] : [])),
  ];
  const readCaptions = (rel: string): readonly string[] => {
    const raw = JSON.parse(readFileSync(path.join(REPO_ROOT, rel), "utf-8")) as {
      events?: Array<{ kind?: string; textBg?: string }>;
    };
    return (raw.events ?? [])
      .filter((e) => e.kind === "annotation" && typeof e.textBg === "string")
      .map((e) => e.textBg as string);
  };
  const CAPTIONS = new Map<string, readonly string[]>(
    [...new Set(LANE_TEMPLATES.flatMap((s) => tracePathsOf(s)))].map((rel) => [
      rel,
      readCaptions(rel),
    ]),
  );
  // The fallback is unreachable for every caller below (all of them pass a
  // LANE_TEMPLATES member) and is kept so a spec added to a future `it` reads
  // rather than silently reporting no captions — an empty reader is the one
  // failure this section's first `it` exists to catch.
  const captionsOf = (spec: ScenarioSpec): string[] =>
    tracePathsOf(spec).flatMap((rel) => [...(CAPTIONS.get(rel) ?? readCaptions(rel))]);

  it("the caption sweep reaches real captions — an empty reader would pass everything", () => {
    const all = LANE_TEMPLATES.flatMap(captionsOf);
    expect(all.length).toBeGreaterThan(50);
    expect(captionsOf(specById("sc-sp-wet-limit-plate")).length).toBeGreaterThan(5);
  });

  it("no demonstration caption asserts weather the rung it plays on does not have", () => {
    const offenders: string[] = [];
    for (const spec of LANE_TEMPLATES) {
      const wet = captionsOf(spec).filter((c) => assertingSentences(c, ASSERTS_WET).length > 0);
      const night = captionsOf(spec).filter((c) => assertingSentences(c, ASSERTS_NIGHT).length > 0);
      for (const rung of spec.levels) {
        if (wet.length > 0 && !["rain", "snow"].includes(rungWeather(spec, rung.level))) {
          offenders.push(`${spec.id} L${rung.level} is «${rungWeather(spec, rung.level)}»: «${wet[0].slice(0, 70)}…»`);
        }
        if (night.length > 0 && !rungNight(spec, rung.level)) {
          offenders.push(`${spec.id} L${rung.level} is daylight: «${night[0].slice(0, 70)}…»`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("THE CAPTION MUTATION — the struck narration fails on its own L1", () => {
    // Verbatim off `content/traces/sc-sp-wet-limit-plate/shadow-correct
    // .trace.json` at 151bd19, and off w10-3 run.log line 271.
    const SHIPPED =
      "Основно ограничение 50, но табелата „при мокра настилка — 40“ важи: вали. Таванът ни е 40 км/ч.";
    expect(assertingSentences(SHIPPED, ASSERTS_WET).length).toBeGreaterThan(0);
    // …and the replacement states the plate's rule in both directions and
    // points at nothing — true on both halves of the alternating ladder, the
    // same escape the instruction copy uses.
    const FIXED =
      "Табелата „при мокра настилка — 40“ важи само при мокра настилка: тогава таванът е 40 км/ч. Суха ли е — тя мълчи и важи основното 50. Първо гледай настилката, после текста.";
    expect(assertingSentences(FIXED, ASSERTS_WET)).toEqual([]);
    expect(captionsOf(specById("sc-sp-wet-limit-plate"))).toContain(FIXED);
    expect(captionsOf(specById("sc-sp-wet-limit-plate"))).not.toContain(SHIPPED);
  });

  /**
   * ── THE FORM `ASSERTS_WET` CANNOT SEE, AND THE ROUND IT COST ──────────────
   *
   * The version of the case above that shipped between these two asserted
   * «Мокра ли е настилката — КАКТО В ТОЗИ ЗАПИС — …» and called it „conditional
   * in both directions … says nothing about today". It was overturned by its
   * own quote: «както в този запис» is neither conditional nor about nothing.
   * And nothing in this file could have caught it, for two compounding reasons
   * worth writing down rather than re-discovering:
   *
   *  1. `IS_CONDITIONAL` exempts a whole SENTENCE if any clause of it is a
   *     question, and bare «ли» is one of its tokens — so a sentence that opens
   *     «Мокра ли е настилката» carries anything it likes after the dash.
   *  2. `ASSERTS_WET` looks for «вали» / «настилката е мокра» / «пътят е мокър».
   *     «както в този запис» contains none of them. Widening (1) would not have
   *     helped: the clause has no wet token in it at all. The claim is DEICTIC —
   *     it points at the picture — and a token matcher cannot see a pointer.
   *
   * SO THE POINTER ITSELF IS WHAT IS FORBIDDEN, and it is forbidden absolutely
   * rather than conditionally: a demonstration caption may not describe the
   * recording it belongs to. `TraceTimeline` replays the ghost inside the LIVE
   * scene, whose weather is `lesson.environment` (environment/weather.ts §3b),
   * so „as in this recording" is a claim about a picture the caption does not
   * control and cannot be right about at more than one rung of an alternating
   * ladder. Teach the rule; let the student read the road.
   *
   * BOTH DIRECTIONS PINNED, because a matcher that quietly stopped matching is
   * the instrument bug this programme has shipped four times.
   */
  const POINTS_AT_THE_RECORDING = /(?<![\p{L}])(?:в|на) (?:този|тази|това) (?:запис|записа|демонстрация|демонстрацията|кадър|кадъра|видео|видеото)(?![\p{L}])/iu;

  it("THE DEICTIC RULE — no caption describes the recording it plays inside", () => {
    // Teeth first: the struck clause and two shapes of it must fire…
    expect(POINTS_AT_THE_RECORDING.test("Мокра ли е настилката — както в този запис — табелата важи."))
      .toBe(true);
    expect(POINTS_AT_THE_RECORDING.test("В този запис вали и настилката е мокра.")).toBe(true);
    expect(POINTS_AT_THE_RECORDING.test("Както в тази демонстрация, таванът е 40.")).toBe(true);
    // …and the copy the lane legitimately ships must not. These are verbatim
    // captions from this same trace and its siblings.
    for (const innocent of [
      "Табелата „при мокра настилка — 40“ важи само при мокра настилка: тогава таванът е 40 км/ч. Суха ли е — тя мълчи и важи основното 50. Първо гледай настилката, после текста.",
      "Подминаваме табелата вече на 38 — таванът се чете от настилката, не се чака някой да го каже.",
      "На мокър път спирачният път е около 1,4 пъти по-дълъг — 40 връща и разстоянието, и времето за реакция.",
      "Премини решително едва когато лостът се вдигне ДОКРАЙ — бърз оглед наляво и надясно, без спиране върху релсите.",
    ]) {
      expect(POINTS_AT_THE_RECORDING.test(innocent), innocent).toBe(false);
    }
  });

  it("…and no shipped caption in this lane's corpus breaks it", () => {
    const offenders: string[] = [];
    for (const spec of LANE_TEMPLATES) {
      for (const c of captionsOf(spec)) {
        if (POINTS_AT_THE_RECORDING.test(c)) offenders.push(`${spec.id}: «${c.slice(0, 90)}…»`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("THE MUTATION — the struck wet-plate line fails on its own L1", () => {
    // The exact sentence sweep161 photographed against a dry street. Put it
    // back and this section goes red, which is what makes the section above a
    // measurement instead of a formality.
    const spec = specById("sc-sp-wet-limit-plate");
    const rolledBack: ScenarioSpec = {
      ...spec,
      instructionsBg: spec.instructionsBg.map((i) =>
        i.n === 3
          ? {
              ...i,
              textBg:
                "Днес обаче вали и настилката е мокра — затова табелата вече важи: твоят таван става 40 км/ч.",
            }
          : i,
      ),
    };
    expect(assertingSentences(rolledBack.instructionsBg[2].textBg, ASSERTS_WET)).toHaveLength(1);
    expect(rungWeather(rolledBack, 1)).toBe("dry");
    // …and the SHIPPED line in the same slot is a question, not an assertion.
    expect(assertingSentences(spec.instructionsBg[2].textBg, ASSERTS_WET)).toEqual([]);
    // THE DETECTOR'S OWN SELF-CHECK, against the four sentences its first draft
    // accused wrongly. If a later widening starts matching any of these again,
    // this dies here rather than in a lane's report.
    for (const innocent of [
      "Свали скоростта преди знака и влез в зоната вече около 37–38 км/ч.",
      "Включи късите светлини, ако вали (чл. 70) — минаваш през водния му облак.",
      "Щом настилката е мокра, включи и късите светлини (чл. 70).",
      "Ако вали, включи късите светлини — мократа настилка удължава спирачния път.",
    ]) {
      expect(assertingSentences(innocent, ASSERTS_WET), innocent).toEqual([]);
    }
    // The ladder really does alternate — if a later lane makes L1 wet to quiet
    // this, the contrast the template exists for is gone and §2 of its own
    // header no longer holds. Pinned so that change is deliberate.
    expect(rungWeather(spec, 1)).toBe("dry");
    expect(rungWeather(spec, 3)).toBe("rain");
  });

  it("…and a template that really IS wet at every rung is untouched by the rule", () => {
    // sc-ac-truck-spray ships `conditions: { weather: "rain" }` at template
    // level, so it may assert the rain outright — the predicate is about the
    // rung, not about the vocabulary.
    const spray = specById("sc-ac-truck-spray");
    expect(spray.levels.every((l) => rungWeather(spray, l.level) === "rain")).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // …AND THE THIRD SURFACE, WHICH IS WHY THIS ROW KEPT COMING BACK
  // ---------------------------------------------------------------------------
  //
  // `sc-sp-wet-limit-plate:65c7eaac` has now been repaired three times on three
  // different pieces of glass. The INSTRUCTION steps were made weather-neutral
  // by an earlier wave; the DEMONSTRATION CAPTIONS by the block above; and the
  // finding was STILL live on a surface neither rule could see — the success
  // gate's own `titleBg`, which is the HUD task chip during the drive and the ✓
  // line in the debrief. On the L1 dry rung the sweep books
  // «✓ Стигни края на отсечката, задържал мокрия таван 0:49» over 59 drive
  // frames of dry asphalt, clear sky and parked wipers (w10-3,
  // pc-wrong/08-debrief-p4.png).
  //
  // The title was repaired in the same patch as the steps and NOTHING GATED IT.
  // That is the pattern, not the incident: each wave fixes the surface it is
  // looking at and the claim walks to the next one. So the rule takes the
  // surface.
  //
  // WHY THE DETECTOR IS ONE PHRASE, said plainly rather than left to look
  // timid. A chip has no room for «настилката е мокра»; the shape a TITLE uses
  // is «мокрия таван» — a claim about which ceiling is in force right now. The
  // wider `мокр\p{L}*\s+настилк` I tried first ACCUSED THE PLATE'S OWN NAME —
  // `sc-sp-wet-limit-plate`'s other gate is «Подмини табелата „при мокра
  // настилка“», where the words are the sign's, in quotes, and true on a dry
  // day. That false positive is pinned below so a later widening has to face
  // it.
  const ASSERTS_WET_CEILING = new RegExp("мокр\\p{L}*\\s+таван", "iu");
  const successTitles = (spec: ScenarioSpec): string[] =>
    (spec.success ?? []).map((g) => g.titleBg);

  it("the title sweep reaches real gate titles — an empty reader would pass everything", () => {
    const all = LANE_TEMPLATES.flatMap(successTitles);
    expect(all.length).toBeGreaterThan(20);
    // The subject of the row must be in the sweep and must be speaking.
    expect(successTitles(specById("sc-sp-wet-limit-plate")).length).toBeGreaterThan(1);
  });

  it("no success-gate title asserts weather the rung it ships to does not have", () => {
    const offenders: string[] = [];
    for (const spec of LANE_TEMPLATES) {
      const wet = successTitles(spec).filter(
        (t) =>
          !IS_CONDITIONAL.test(t) && (ASSERTS_WET_CEILING.test(t) || ASSERTS_WET.test(t)),
      );
      if (wet.length === 0) continue;
      for (const rung of spec.levels) {
        if (!["rain", "snow"].includes(rungWeather(spec, rung.level))) {
          offenders.push(
            `${spec.id} L${rung.level} is «${rungWeather(spec, rung.level)}» but a gate title asserts wet: «${wet[0]}»`,
          );
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("THE TITLE MUTATION — the ✓ line booked over dry asphalt is caught, the plate's name is not", () => {
    // Verbatim `templates-speed2.ts` at 151bd19.
    const SHIPPED = "Стигни края на отсечката, задържал мокрия таван";
    expect(ASSERTS_WET_CEILING.test(SHIPPED)).toBe(true);
    expect(LANE_TEMPLATES.flatMap(successTitles)).not.toContain(SHIPPED);
    // …and the replacement says the same thing without asserting today's sky:
    // the ceiling is read off the SURFACE, which is the whole drill.
    expect(successTitles(specById("sc-sp-wet-limit-plate"))).toContain(
      "Стигни края на отсечката, задържал тавана от настилката",
    );
    // The self-check that keeps this narrow rule from being widened blindly:
    // the plate's own name quotes the sign and is true on a dry day.
    expect(ASSERTS_WET_CEILING.test("Подмини табелата „при мокра настилка“")).toBe(false);
    expect(ASSERTS_WET.test("Подмини табелата „при мокра настилка“")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §6 — A GATE MAY NOT CREDIT THE SPEED ITS OWN LESSON CALLS THE MISTAKE
//
// Doc 87 B58, the founder's words: „a student who obeys the number the world
// shows him commits the mistake the world is grading." The compiled cap is not
// private — `RouteGuidance` prints it on the gate bar across the lane — and the
// L1/L2 ladder ADDS to it (params.ts `widenSpeedCap`, bounded only by the
// posted limit).
//
// MEASURED across this lane's capped gates, by rung, before the fix:
//   sc-ac-night-overdrive  sc-acno-adapted   63 · 60.5 · 58 · 58 · 58
//   sc-ac-bridge-ice       sc-acbi-before    35 · 32.5 · 30 · 30 · 30
//   sc-ac-truck-spray      sc-acts-gap       85 · 82.5 · 80 · 80 · 80
//   sc-zebra-approach      sc-za-approach    45 · 42.5 · 40 · 40 · 40
//
// Only the first is a CONTRADICTION rather than a margin, and it is pinned
// here because the lesson names its own threshold out loud: instruction 5 is
// «над ~60 изпреварваш фаровете» and the rule engine bills
// SPEED_TOO_FAST_FOR_CONDITIONS above the night envelope 0.65 × 90 = 58.5. The
// L1 bar read 63 — over both. The other three are a briefing aiming lower than
// a ceiling, which is a different (and legitimate) thing; the zebra row is a
// ladder question routed to params.ts, not an authoring error here.
// ---------------------------------------------------------------------------

describe("§6 sc-ac-night-overdrive's gate stays inside the speed its own copy teaches", () => {
  const NIGHT_ENVELOPE_KMH = 58.5; // 0.65 × the posted 90 — the detector's band
  const TAUGHT_CEILING_KMH = 60; // instruction 5: «над ~60 изпреварваш фаровете»

  const capAt = (level: ScenarioLevel): number => {
    const obj = compileScenario(specById("sc-ac-night-overdrive"), level).objectives.find(
      (o) => o.id === "sc-acno-adapted",
    );
    const p = parseObjectiveParams(obj!) as { maxSpeedKmh?: number };
    return p.maxSpeedKmh!;
  };

  it("the copy still names the threshold this section is measured against", () => {
    // If the sentence goes, the number below is arbitrary — so it is asserted
    // rather than remembered.
    expect(
      specById("sc-ac-night-overdrive").instructionsBg.some((i) => /над ~60/u.test(i.textBg)),
    ).toBe(true);
  });

  for (const level of [1, 2, 3, 4, 5] as ScenarioLevel[]) {
    it(`L${level} bar is under the taught ~60 and under the ${NIGHT_ENVELOPE_KMH} envelope`, () => {
      expect(capAt(level)).toBeLessThan(TAUGHT_CEILING_KMH);
      expect(capAt(level)).toBeLessThan(NIGHT_ENVELOPE_KMH);
    });
  }

  it("THE MUTATION — the shipped 58 put back fails L1, which is how it shipped", () => {
    // The authored cap restored to what sweep161 drove against. L1's ladder
    // takes it to 63 and both bounds break, so this section is a measurement.
    const rolledBack: ScenarioSpec = {
      ...specById("sc-ac-night-overdrive"),
      success: specById("sc-ac-night-overdrive").success.map((o) =>
        o.id === "sc-acno-adapted"
          ? { ...o, params: { ...(o.params as object), maxSpeedKmh: 58 } as typeof o.params }
          : o,
      ),
    };
    const obj = compileScenario(rolledBack, 1).objectives.find((o) => o.id === "sc-acno-adapted");
    const was = (parseObjectiveParams(obj!) as { maxSpeedKmh?: number }).maxSpeedKmh!;
    expect(was).toBe(63);
    expect(was).toBeGreaterThan(TAUGHT_CEILING_KMH);
    expect(was).toBeGreaterThan(NIGHT_ENVELOPE_KMH);
  });

  it("…and the tightening did NOT break the lesson's own model line", () => {
    // The half that makes this a fix rather than a false refusal. The committed
    // correct drive is replayed through the FULL production pipeline at every
    // rung and must still complete every objective and pass. A gate a perfect
    // drive cannot satisfy is the founder's roundabout complaint.
    for (const rung of specById("sc-ac-night-overdrive").levels) {
      let session = createLessonSession(
        compileScenario(specById("sc-ac-night-overdrive"), rung.level),
      );
      recordScAcNightOverdriveDrive(rawDistrict("ov-oncoming-v1"), "shadow-correct", {
        onTick: (t) => {
          session = applyTick(session, t).state;
        },
      });
      const result = buildLessonResult(session);
      expect(result.completedAll, `L${rung.level} completedAll`).toBe(true);
      expect(result.passed, `L${rung.level} passed`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// §5 — THE TWO FINDINGS THIS LANE REFUTED
//
// „No such sign, no give-way line and not one circulating vehicle" and „rail
// crossing not rendered" were filed from frames. The census says otherwise, and
// a briefing must not be rewritten to match a misread frame — that is the
// founder's own complaint (failed for a roundabout exit he signalled correctly)
// wearing different clothes. These rows exist so the next lane inherits the
// measurement rather than the finding.
// ---------------------------------------------------------------------------

describe("§5 the sweep findings that were wrong, pinned so nobody re-fixes them", () => {
  it("rb-mini-v1 posts four Б1 «Пропусни движението» and four Г12", () => {
    expect(signsOf("rb-mini-v1", "giveWay")).toBe(4);
    expect(signsOf("rb-mini-v1", "roundabout")).toBe(4);
  });

  it("…and sc-roundabout-entry stages the circulating car it tells him to yield to", () => {
    const spec = specById("sc-roundabout-entry");
    expect((spec.staged ?? []).map((e) => e.kind)).toContain("roundaboutEntry");
    expect(
      shownToTheStudent(spec).some((s) => /вече е в кръга|движещите се в кръга/iu.test(s.text)),
    ).toBe(true);
  });

  it("pk-rail-v1 builds the А34, the cross, the boom — and the track deck", () => {
    expect(signsOf("pk-rail-v1", "railGuarded")).toBe(1);
    expect(signsOf("pk-rail-v1", "railCross")).toBe(1);
    expect(signsOf("pk-rail-v1", "barrier")).toBe(1);
    // railTrack.ts's additive contract: „a district without a railCrossing zone
    // yields ZERO quads". Asserted in BOTH directions on real maps, so a stub
    // that always returned geometry would fail on the rail-free one.
    const deckVerts = (id: string): number =>
      buildWorldGeometry(assertDistrict(rawDistrict(id))).railTracks.deck.positions.length;
    expect(deckVerts("pk-rail-v1")).toBeGreaterThan(0);
    expect(deckVerts("ac-bridge-v1")).toBe(0);
  });

  it("…and «бариерата е вдигната» is true for the whole drill window", () => {
    // The boom's timetable is down 480→540 s; the drill window is 180 s. The
    // briefing's claim is therefore true at every second a student can be here.
    const rail = DISTRICTS.get("pk-rail-v1")!.meta!.scenario!.railCrossing as {
      barrier: { downFromSec: number };
      drillWindowSec: number;
    };
    expect(rail.drillWindowSec).toBeLessThan(rail.barrier.downFromSec);
  });
});
