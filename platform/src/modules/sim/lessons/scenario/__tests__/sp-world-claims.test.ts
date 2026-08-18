/**
 * SWEEP 161 — THE SPEED FAMILY'S WORLD CLAIMS, PROVED IN BOTH DIRECTIONS.
 *
 * The 2026-08-16/17 device sweep drove all 161 lessons at L1 on a phone and a
 * desktop and photographed what the student was actually looking at. Two of its
 * findings against templates-sp.ts are the same crime: A BRIEFING NAMED A THING
 * THAT IS NOT OUT THE WINDSCREEN.
 *
 *   · sc-speed-transition, instruction 2, „знак за зона 30 (училище/жилищна)"
 *     — frame sweep161/sc-speed-transition/pc-right/04-t076s.png. sp-trans-v1
 *     carries 7 buildings and not one has `kind: "school"`, and it stages no
 *     children. The founder had already written this complaint about the OTHER
 *     30-street (doc 87 B61: „no actual school when the question states there
 *     should be School, weak map engineering") and it was answered THERE, on
 *     sp-zone30-v1, by authoring a school and six yard children — while this
 *     lesson went on making the same promise on a map that got neither.
 *   · sc-mw-discipline, instruction 1, „платното е разделено с мантинела" —
 *     frame sweep161/sc-mw-discipline/mobile-right/04-t208s.png and every other
 *     frame of all four legs: a bare grey median with grass either side.
 *
 * WHY A KEYWORD BAN WOULD HAVE BEEN WORTHLESS, AND WHAT THIS DOES INSTEAD.
 * „Never write училище" is a rule about spelling; the defect is about the MAP.
 * Every claim below is a QUESTION PUT TO THE DISTRICT THE LESSON LOADS, so the
 * same sentence is legal on one map and refused on another — §3 proves exactly
 * that with the struck sentence itself, accepted on sp-zone30-v1 and refused on
 * sp-trans-v1. A predicate that answered `false` everywhere would fail §2 and a
 * predicate that answered `true` everywhere would fail §3.
 *
 * WHICH TEXT IS A CLAIM. Only what the student is shown as a description of THIS
 * drive: titleBg, objectiveBg, tagsBg, instructionsBg and the objective row
 * titles. `teach.*` is deliberately excluded — „при всяка зона 30 — пред
 * училища, детски градини…" is a statement about the RULE, true on every map,
 * and gating it would force the doctrine to shrink to whatever the current
 * micro-map happens to own. `mistakes[].whatWentWrongBg` is excluded too: it
 * narrates a committed recording, and the recording is its own evidence.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SCENARIO_TEMPLATES_SP,
  SC_MW_DISCIPLINE,
  SC_SPEED_DANGEROUS,
  SC_SPEED_TRANSITION,
  SC_SPEED_ZONE,
  SC_SP_HARSH_BRAKE,
} from "../templates-sp";
import type { ScenarioSpec } from "../types";

const REPO_ROOT = path.join(process.cwd(), "..");

/** The slice of a district document these claims interrogate. Loose on purpose:
 *  a claim must be answerable from the COMMITTED JSON, not from a parser that
 *  might normalise the very field the question is about. */
interface DistrictJson {
  meta?: { scenario?: { params?: Record<string, unknown> } };
  roads?: { edges?: { id: string; class?: string; maxspeed?: number }[] };
  buildings?: { id: string; kind?: string }[];
  zones?: { id: string; kind?: string }[];
}

function loadDistrict(id: string): DistrictJson {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as DistrictJson;
}

const DISTRICTS = new Map<string, DistrictJson>(
  [...new Set(SCENARIO_TEMPLATES_SP.map((s) => s.map.districtId))].map((id) => [
    id,
    loadDistrict(id),
  ]),
);

// ---------------------------------------------------------------------------
// The claims
// ---------------------------------------------------------------------------

interface WorldClaim {
  /** What the sentence promises, in the word a briefing would use. */
  noun: string;
  /** How that promise is spelled in student-facing Bulgarian. */
  re: RegExp;
  /** Does the district the lesson loads actually carry it? */
  carriedBy: (d: DistrictJson, spec: ScenarioSpec) => boolean;
  /** What would have to be authored for the promise to become true. */
  how: string;
}

/** Every staged kind that puts ANOTHER CAR in the student's mirrors or ahead of
 *  him (contracts.ts StagedEventSpec). Listed rather than inferred so a new
 *  actor kind has to be considered here on the day it ships. */
const VEHICLE_ACTOR_KINDS = new Set<string>([
  "brakingLeadCar",
  "cutInLeadCar",
  "rearTailgater",
  "oncomingStream",
  "oncomingLeftTurn",
  "priorityFromRight",
  "narrowMeeting",
  "emergencyApproach",
  "roundaboutEntry",
  "amberDilemma",
  "policeStop",
]);

const WORLD_CLAIMS: readonly WorldClaim[] = [
  {
    noun: "училище",
    re: /училищ/iu,
    // world/builders/schools.ts derives the УЧИЛИЩЕ name board, the yard
    // railing and the А19 „Деца" posts from `kind: "school"` and from nothing
    // else — no other field puts a school on any map in this catalogue.
    carriedBy: (d) => (d.buildings ?? []).some((b) => b.kind === "school"),
    how: 'building with kind "school" (world/builders/schools.ts)',
  },
  {
    noun: "автобусна спирка",
    re: /автобусна спирка/iu,
    // The B64 precedent, the other direction: sc-sp-harsh-brake's copy was
    // allowed to stop saying „представи си" precisely BECAUSE sp-creep-v1's
    // `sp-b-stop-canopy` became `kind: "busStop"` and props.ts started building
    // the shelter. That is the shape every claim here has to have.
    carriedBy: (d) => (d.buildings ?? []).some((b) => b.kind === "busStop"),
    how: 'building with kind "busStop" (world/builders/props.ts)',
  },
  {
    noun: "мантинела",
    // A median crash barrier. The district schema has no span for one:
    // `DistrictZone.barrier` (world/types.ts) is the railCrossing BOOM
    // timetable, and `DistrictZoneKind` has no guard-rail member at all. The
    // only railing props.ts builds is the pavement parapet (RAILING_*), which
    // stands at the back of a KERB, prefers the LEFT verge and `continue`s
    // outright when the verge is bare — and a motorway median IS a bare verge.
    // So the question below is honest rather than rhetorical: it asks the
    // district for a barrier span, every district answers no, and the day a
    // `crashBarrier` kind is authored this predicate starts crediting it with
    // no edit here.
    re: /мантинел/iu,
    carriedBy: (d) => (d.zones ?? []).some((z) => z.kind === "crashBarrier"),
    how: 'zone with kind "crashBarrier" — no such kind exists yet (world/types.ts DistrictZoneKind)',
  },
  {
    noun: "жилищна улица",
    re: /жилищн/iu,
    carriedBy: (d) =>
      (d.roads?.edges ?? []).some((e) => e.class === "residential" || e.class === "living_street"),
    how: 'edge of class "residential" or "living_street"',
  },
  {
    noun: "деца на тротоара",
    // A child the student is told to WATCH has to be a figure the scene puts
    // there. Staged, not ambient: the ambient pedestrian system anchors every
    // walker on a crossing, and these streets deliberately have none — which is
    // exactly why sp-zone30-v1's six children are `staged` (see the SCHOOLYARD
    // note in templates-sp.ts).
    re: /деца|дете/iu,
    carriedBy: (_d, spec) =>
      (spec.staged ?? []).some(
        (e) => e.kind === "pedestrianDartOut" && (e as { variant?: string }).variant === "child",
      ),
    how: 'staged pedestrianDartOut with variant "child"',
  },
  {
    noun: "друга кола около теб",
    // PRESENCE, not doctrine: „лявата лента е само за изпреварване" is a rule
    // and stays legal on an empty road; „колата пред теб се отдалечава" says
    // there is a car out there, and a car out there is a staged actor.
    re: /потокът около теб|колата пред теб|в огледалото|потокът те подминава|те изпреварва|те притиска/iu,
    carriedBy: (_d, spec) => (spec.staged ?? []).some((e) => VEHICLE_ACTOR_KINDS.has(e.kind)),
    how: `staged vehicle actor (${[...VEHICLE_ACTOR_KINDS].join(" / ")})`,
  },
];

/** Everything the student reads as a description of THIS drive. */
function shownToTheStudent(spec: ScenarioSpec): { where: string; text: string }[] {
  return [
    { where: "titleBg", text: spec.titleBg },
    { where: "objectiveBg", text: spec.objectiveBg },
    ...spec.tagsBg.map((t, i) => ({ where: `tagsBg[${i}]`, text: t })),
    ...spec.instructionsBg.map((s) => ({ where: `instruction ${s.n}`, text: s.textBg })),
    ...spec.success.map((o) => ({ where: `success ${o.id}`, text: o.titleBg })),
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

// ---------------------------------------------------------------------------
// §1 — nothing the SP family says about the world may be missing from it
// ---------------------------------------------------------------------------

describe("§1 every SP briefing claim is carried by the district the lesson loads", () => {
  for (const spec of SCENARIO_TEMPLATES_SP) {
    it(`${spec.id} on ${spec.map.districtId}`, () => {
      expect(unbackedClaims(spec, DISTRICTS.get(spec.map.districtId)!)).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// §2 — the OPPOSITE direction: the backed claims are still MADE
//
// Striking a sentence is the cheap way to pass §1, and it would leave the
// student with a school he is never told to look at. Every claim this family
// legitimately owns is asserted present here, against the same predicate.
// ---------------------------------------------------------------------------

describe("§2 the claims this family HAS earned are still said, and still backed", () => {
  const said = (spec: ScenarioSpec, re: RegExp) =>
    shownToTheStudent(spec).some((s) => re.test(s.text));

  it("sc-speed-zone still points at the school, and sp-zone30-v1 still has one", () => {
    expect(said(SC_SPEED_ZONE, /училищ/iu)).toBe(true);
    expect(DISTRICTS.get("sp-zone30-v1")!.buildings!.some((b) => b.kind === "school")).toBe(true);
  });

  it("sc-speed-zone still points at the children, and still stages six of them", () => {
    expect(said(SC_SPEED_ZONE, /деца|дете/iu)).toBe(true);
    const kids = (SC_SPEED_ZONE.staged ?? []).filter(
      (e) => e.kind === "pedestrianDartOut" && (e as { variant?: string }).variant === "child",
    );
    expect(kids).toHaveLength(6);
  });

  it("sc-sp-harsh-brake still names the bus stop, and sp-creep-v1 still builds one", () => {
    expect(said(SC_SP_HARSH_BRAKE, /автобусна спирка/iu)).toBe(true);
    expect(DISTRICTS.get("sp-creep-v1")!.buildings!.some((b) => b.kind === "busStop")).toBe(true);
  });

  it("sc-speed-dangerous still describes the flow around the car, and still stages it", () => {
    expect(said(SC_SPEED_DANGEROUS, /колата пред теб/iu)).toBe(true);
    expect(said(SC_SPEED_DANGEROUS, /в огледалото/iu)).toBe(true);
    expect(SC_SPEED_DANGEROUS.staged ?? []).toHaveLength(2);
  });

  it("sc-speed-transition still names the зона-30 sign it really drives through", () => {
    // The school went; the lesson's actual subject must not go with it.
    expect(said(SC_SPEED_TRANSITION, /зона 30/iu)).toBe(true);
    const edges = DISTRICTS.get("sp-trans-v1")!.roads!.edges!;
    expect(edges.map((e) => e.maxspeed).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([30, 50]);
  });

  it("sc-mw-discipline still tells the student the carriageways are divided", () => {
    // The мантинела went; the median it stands in did not — mw-v1 authors 6 m
    // of it and puts the two carriageways 30.37 m apart.
    expect(said(SC_MW_DISCIPLINE, /отделни платна|раздел/iu)).toBe(true);
    expect(DISTRICTS.get("mw-v1")!.meta!.scenario!.params!.medianM).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// §3 — THE MUTATION, KEPT IN THE SUITE
//
// The two struck sentences, verbatim. Each is pushed back through the SAME
// checker §1 uses and shown to be refused on the map that shipped it — and the
// school sentence is shown ACCEPTED on sp-zone30-v1, which is what proves the
// refusal is a fact about the map rather than a fact about the word.
// ---------------------------------------------------------------------------

describe("§3 the struck sentences are refused by this gate, and only where they were false", () => {
  const STRUCK_SCHOOL =
    "Напред следва знак за зона 30 (училище/жилищна). Забележи го отрано — намаляването започва преди знака, не след него.";
  const STRUCK_BARRIER =
    "Потегли по магистралата — ограничението е 140 км/ч, платното е разделено с мантинела.";

  /** The shipped spec with ONE instruction put back the way sweep161 found it. */
  const withInstruction = (spec: ScenarioSpec, n: number, textBg: string): ScenarioSpec => ({
    ...spec,
    instructionsBg: spec.instructionsBg.map((s) => (s.n === n ? { ...s, textBg } : s)),
  });

  it("„(училище/жилищна)" + " on sp-trans-v1 → refused (7 buildings, no school)", () => {
    const rolledBack = withInstruction(SC_SPEED_TRANSITION, 2, STRUCK_SCHOOL);
    const misses = unbackedClaims(rolledBack, DISTRICTS.get("sp-trans-v1")!);
    expect(misses).toHaveLength(1);
    expect(misses[0]).toContain('carries no building with kind "school"');
    // …and the SHIPPED sentence in the same slot is clean.
    expect(unbackedClaims(SC_SPEED_TRANSITION, DISTRICTS.get("sp-trans-v1")!)).toEqual([]);
  });

  it("the SAME sentence on sp-zone30-v1 → accepted (the school is authored there)", () => {
    // Same words, different map, opposite verdict: the gate is reading the
    // world, not the vocabulary. A predicate hard-wired to `false` dies here.
    const onTheSchoolStreet = withInstruction(SC_SPEED_ZONE, 1, STRUCK_SCHOOL);
    expect(unbackedClaims(onTheSchoolStreet, DISTRICTS.get("sp-zone30-v1")!)).toEqual([]);
  });

  it("„разделено с мантинела" + " on mw-v1 → refused (no barrier feature exists)", () => {
    const rolledBack = withInstruction(SC_MW_DISCIPLINE, 1, STRUCK_BARRIER);
    const misses = unbackedClaims(rolledBack, DISTRICTS.get("mw-v1")!);
    expect(misses).toHaveLength(1);
    expect(misses[0]).toContain("crashBarrier");
    expect(unbackedClaims(SC_MW_DISCIPLINE, DISTRICTS.get("mw-v1")!)).toEqual([]);
  });

  it("and it stays refused on every district in the family — nothing builds one", () => {
    // The claim that would have been the cheap fix („move the lesson to a map
    // that has a barrier") has nowhere to go, and this says so out loud.
    for (const [id, d] of DISTRICTS) {
      expect((d.zones ?? []).some((z) => z.kind === "crashBarrier"), id).toBe(false);
    }
  });
});
