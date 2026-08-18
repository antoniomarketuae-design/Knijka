/**
 * =============================================================================
 * SWEEP 161 — THE COCKPIT FAMILY'S BRIEFINGS, MEASURED AGAINST THE COCKPIT.
 *
 * The 2026-08-16/17 device sweep drove all 161 lessons at L1 on a phone and a
 * desktop and photographed the windscreen. Three of its rows against
 * templates-cockpit.ts are one crime told three ways: A NUMBERED BRIEFING
 * DESCRIBED A CAR THAT WAS NOT THERE.
 *
 *   · sc-pk-move-off, instruction 1, „Колата е спряла на банкета"
 *     — frame sweep161/sc-pk-move-off/mobile-right/01-arrival.png. The car is
 *     between the two guide ribbons on the lane centre line. vp-ready-v1 owns
 *     two spawn points and both sit on `meta.scenario.laneCenterRightM`
 *     (x = 4.06) — there is no verge pose anywhere on that map.
 *   · sc-pk-move-off — the red «КОЛАН» badge is lit on that same arrival frame
 *     and the briefing never says the word. `SEATBELT_OFF_WHILE_MOVING` is an
 *     UNGATED основна (rules/engine.ts, 1 s sustain), so the student who obeyed
 *     all five steps was billed 3 points for the one act nobody asked him for.
 *   · sc-vp-stall, instructions 1–4, „съединител докрай … точката на зацепване"
 *     — frame sweep161/sc-vp-stall/pc-right/04-t012s.png: cluster „D", key card
 *     offering gears as „към P / към D", cabin strip with no «СЪЕД» cell. Four
 *     unperformable commands, on the tier every student arrives on.
 *
 * ── WHY THESE THREE ARE ASKED AS QUESTIONS, NOT AS SPELLINGS ────────────────
 *
 * „Never write банкет" is a rule about a word. Each §below is instead a
 * QUESTION PUT TO THE THING THE STUDENT LOOKS AT — the committed district for
 * §1, the shipped `transmissionModeFor` for §2, the archetype the template
 * claims for §3 — so the same sentence is legal on one lesson and refused on
 * another. §4 proves exactly that for all three: it re-runs every predicate
 * over the SHIPPED-BEFORE text and demands a complaint, and over a spec the
 * claim is true of and demands silence. A predicate that answered „unbacked"
 * everywhere would fail §4a; one that answered „fine" everywhere would fail the
 * §1–§3 bodies. Both directions, or the gate guards nothing.
 *
 * ── WHICH TEXT IS INTERROGATED ──────────────────────────────────────────────
 *
 * §1 reads what the student is shown as a description of THIS drive (titleBg,
 * objectiveBg, tagsBg, instructionsBg, success titles) PLUS
 * `mistakes[].whatWentWrongBg` — and that last one is a deliberate departure
 * from sp-world-claims.test.ts, which excludes mistake copy because „it
 * narrates a committed recording, and the recording is its own evidence". Here
 * the claim IS the car's pose at t = 0, which is the first frame of that very
 * recording: all three sc-pk-move-off traces open at x = 4.06 (the lane
 * centre), so for THIS claim the recording is the accused and not the witness.
 *
 * §2 reads `instructionsBg` alone. Instructions are imperatives aimed at this
 * drive („натисни", „включи", „отпускай") and a command for an absent control
 * is unperformable; `objectiveBg` and `teach.*` describe the SKILL, which is a
 * manual-gearbox skill in a country whose category-B exam is driven on one, and
 * gating them would force the doctrine to shrink to the current cockpit.
 * =============================================================================
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTY_PRESETS,
  transmissionModeFor,
} from "../../../vehicle";
import {
  SCENARIO_TEMPLATES_COCKPIT,
  SC_PK_MOVE_OFF,
  SC_VP_STALL,
} from "../templates-cockpit";
import type { ScenarioSpec } from "../types";

const REPO_ROOT = path.join(process.cwd(), "..");

/** The slice of a district document these questions interrogate. Loose on
 *  purpose (the sp-world-claims precedent): a claim must be answerable from the
 *  COMMITTED JSON, not from a parser that might normalise the field in
 *  question. */
interface DistrictJson {
  meta?: {
    scenario?: { laneCenterRightM?: number; laneCenterLeftM?: number };
  };
  spawnPoints?: { id: string; x: number; y: number }[];
}

function loadDistrict(id: string): DistrictJson {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as DistrictJson;
}

const DISTRICTS = new Map<string, DistrictJson>(
  [...new Set(SCENARIO_TEMPLATES_COCKPIT.map((s) => s.map.districtId))].map((id) => [
    id,
    loadDistrict(id),
  ]),
);

function districtOf(spec: ScenarioSpec): DistrictJson {
  const d = DISTRICTS.get(spec.map.districtId);
  if (!d) throw new Error(`no committed district for ${spec.map.districtId}`);
  return d;
}

// ---------------------------------------------------------------------------
// §1 — WHERE THE CAR IS STANDING WHEN THE BRIEFING OPENS
// ---------------------------------------------------------------------------

/**
 * Half the hero car's width, near enough (the chassis is ~1.8 m and the drawn
 * lane on both cockpit districts is 8.125 m). A start pose nearer than this to
 * a lane centre the district itself declares IS in that lane — no amount of
 * kerb vocabulary moves it — and a pose farther than this from EVERY declared
 * centre is off the running lane and may be described as such. It is not a
 * tolerance on the copy; it is where the car is.
 */
const OFF_LANE_MIN_M = 1.5;

/**
 * „THE CAR IS STANDING OFF THE CARRIAGEWAY", in the two shapes a briefing
 * writes it: the car AT REST against a verge/kerb, or a move-off FROM one.
 *
 * IT IS NOT A BAN ON THE WORD, and the first draft of this gate proved why it
 * must not be. A bare /банкет|бордюр|тротоар/ convicted sc-vp-police-stop twice
 * over — „Полицай НА ТРОТОАРА ти подава сигнал" — where the pavement is where
 * the OFFICER is standing, which is exactly where an officer with a стоп-палка
 * belongs. A gate that reads a noun instead of a claim invents defects, and an
 * invented defect costs the same as a missed one. The subject has to be the
 * car. „Спри плътно вдясно ДО БОРДЮРА" is likewise untouched: that is an
 * imperative about where the drive ENDS, not a description of where it began.
 *
 * `\b` and `\w` are deliberately absent — both are ASCII-only in JS even under
 * /u, so every Cyrillic word boundary they promise is imaginary (this cost one
 * red run: /точк\w* на зацепване/ matched nothing at all).
 */
const AT_THE_KERB_RE =
  /(?:потегл|тръгва)[^.!?]*?(?:^|\s)от\s+(?:банкета|бордюра)|(?:колата\s+е\s+спряла|стоиш)[^.!?]*?(?:^|\s)(?:на|до)\s+(?:банкета|бордюра)/iu;

/** The pose `compileScenario` will hand the session: a district spawn point by
 *  id, or the template's own authored pose (types.ts: exactly one of the two). */
function startX(spec: ScenarioSpec, district: DistrictJson): number {
  if (spec.start.position) return spec.start.position.x;
  const point = (district.spawnPoints ?? []).find((p) => p.id === spec.start.spawnPointId);
  if (!point) throw new Error(`${spec.id}: spawn ${spec.start.spawnPointId} not in the district`);
  return point.x;
}

/** Distance from the nearest lane centre the district declares. */
function metresOffTheRunningLane(spec: ScenarioSpec, district: DistrictJson): number {
  const centres = [
    district.meta?.scenario?.laneCenterRightM,
    district.meta?.scenario?.laneCenterLeftM,
  ].filter((c): c is number => Number.isFinite(c));
  if (centres.length === 0) {
    throw new Error(`${spec.map.districtId} declares no lane centre — the question is unanswerable`);
  }
  const x = startX(spec, district);
  return Math.min(...centres.map((c) => Math.abs(x - c)));
}

/** Everything the student reads as a description of THIS drive, plus the
 *  mistake narration — see the header for why that last one is in. */
function shownAsThisDrive(spec: ScenarioSpec): { where: string; text: string }[] {
  return [
    { where: "titleBg", text: spec.titleBg },
    { where: "objectiveBg", text: spec.objectiveBg },
    ...spec.tagsBg.map((t, i) => ({ where: `tagsBg[${i}]`, text: t })),
    ...spec.instructionsBg.map((s) => ({ where: `instruction ${s.n}`, text: s.textBg })),
    ...spec.success.map((o) => ({ where: `success ${o.id}`, text: o.titleBg })),
    ...(spec.mistakes ?? []).map((m, i) => ({
      where: `mistakes[${i}].whatWentWrongBg`,
      text: m.whatWentWrongBg,
    })),
  ];
}

function kerbClaimsWithoutAKerbPose(spec: ScenarioSpec, district: DistrictJson): string[] {
  if (metresOffTheRunningLane(spec, district) > OFF_LANE_MIN_M) return [];
  return shownAsThisDrive(spec)
    .filter(({ text }) => AT_THE_KERB_RE.test(text))
    .map(
      ({ where, text }) =>
        `${spec.id} ${where} parks the car off the carriageway, but its start pose is ` +
        `${metresOffTheRunningLane(spec, district).toFixed(2)} m from a declared lane ` +
        `centre of ${spec.map.districtId}: ${text}`,
    );
}

describe("§1 no cockpit briefing parks the car somewhere the district does not", () => {
  for (const spec of SCENARIO_TEMPLATES_COCKPIT) {
    it(`${spec.id} on ${spec.map.districtId}`, () => {
      expect(kerbClaimsWithoutAKerbPose(spec, districtOf(spec))).toEqual([]);
    });
  }

  it("sc-pk-move-off is measured at the lane centre itself, not merely near it", () => {
    // The number the sweep row turns on: `vp-spawn-approach` IS
    // `laneCenterRightM`. Pinned so that moving the spawn — the OTHER way to
    // close that row, in files this template does not own — makes this line
    // fail and forces the copy question to be re-asked rather than inherited.
    expect(metresOffTheRunningLane(SC_PK_MOVE_OFF, districtOf(SC_PK_MOVE_OFF))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §2 — CONTROLS THE CAR ONLY HAS ON ONE TIER
// ---------------------------------------------------------------------------

/** The clutch and the manual gate, in the words a Bulgarian briefing uses.
 *  „зацепване" (the bite point) is a manual-only noun and stands alone — see
 *  the AT_THE_KERB_RE note for why it is not spelt „точк\w* на зацепване". */
const MANUAL_ONLY_RE = /съединител|първа предавка|зацепван|скоростен лост/iu;

/** The tier's own shipped label — read, never restated, so renaming the tier
 *  breaks this gate instead of silently orphaning every briefing that names it. */
const MANUAL_TIER_LABEL_BG = DIFFICULTY_PRESETS.advanced.labelBg;

function manualCommandsWithoutTheTier(spec: ScenarioSpec): string[] {
  const steps = spec.instructionsBg;
  if (steps.some((s) => s.textBg.includes(MANUAL_TIER_LABEL_BG))) return [];
  return steps
    .filter((s) => MANUAL_ONLY_RE.test(s.textBg))
    .map(
      (s) =>
        `${spec.id} instruction ${s.n} commands a manual-only control while the briefing ` +
        `never names „${MANUAL_TIER_LABEL_BG}", the one tier on which the car has one: ${s.textBg}`,
    );
}

describe("§2 a briefing that commands the clutch names the tier that has one", () => {
  it("the premise, read off the shipped driveline rather than asserted here", () => {
    // Two facts make the rule necessary, and both live in vehicle/. If either
    // ever flips — a manual default, or a second manual tier — this line goes
    // red first and the rule below gets re-argued instead of outliving it.
    expect(transmissionModeFor(DEFAULT_DIFFICULTY)).toBe("automatic");
    expect(transmissionModeFor("advanced")).toBe("manual");
  });

  for (const spec of SCENARIO_TEMPLATES_COCKPIT) {
    it(`${spec.id}`, () => {
      expect(manualCommandsWithoutTheTier(spec)).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// §3 — THE PULL-AWAY PROCEDURE MAY NOT SKIP ITS OWN FIRST STEP
// ---------------------------------------------------------------------------

/**
 * The doc-72 archetypes whose GRADED MOMENT IS THE PULL-AWAY — listed rather
 * than inferred so a new one has to be considered here on the day it ships:
 *
 *   VP-02 belt · VP-05 handbrake   the readiness pair (sc-vp-readiness)
 *   VP-04 stall at move-off        (sc-vp-stall)
 *   PK-05 move-off observation     (sc-pk-move-off)
 *
 * VP-11 (police signal) and VP-06 (telltale) are deliberately NOT here and
 * their briefings stay as they are: their graded moment is a reaction taken
 * mid-drive, the car is already rolling by the time the lesson starts, and the
 * belt is left outstanding there on purpose — the founder's „the seatbelt is
 * the only item left" ruling (265629d, quoted in LessonScene.tsx), which exists
 * precisely so the habit is tested rather than prompted.
 *
 * The difference is that these three ENUMERATE the pull-away as numbered steps.
 * A numbered procedure that omits its own first step teaches the procedure
 * wrong — and sc-vp-readiness has always named the belt in instruction 1 while
 * grading it, which is the proof that naming it does not delete the test.
 */
const MOVE_OFF_ARCHETYPES = new Set(["VP-02", "VP-04", "VP-05", "PK-05"]);

const BELT_RE = /колан/iu;

function moveOffDrillsSilentOnTheBelt(spec: ScenarioSpec): string[] {
  if (!spec.archetypeIds.some((a) => MOVE_OFF_ARCHETYPES.has(a))) return [];
  if (spec.instructionsBg.some((s) => BELT_RE.test(s.textBg))) return [];
  return [
    `${spec.id} enumerates the pull-away (${spec.archetypeIds.join("/")}) but no step names ` +
      `the belt — and the car is handed over unbelted (scene/cabin.ts seatbeltOn = false on ` +
      `every spawn), with SEATBELT_OFF_WHILE_MOVING ungated`,
  ];
}

describe("§3 every pull-away drill names the belt it is handed over without", () => {
  for (const spec of SCENARIO_TEMPLATES_COCKPIT) {
    it(`${spec.id}`, () => {
      expect(moveOffDrillsSilentOnTheBelt(spec)).toEqual([]);
    });
  }

  it("…and the two mid-drive drills are left alone on purpose", () => {
    // The opposite direction of §3's own scope: if the archetype set below ever
    // grows to swallow VP-11/VP-06 the founder's ruling gets overturned by
    // accident, so the exemption is asserted rather than assumed.
    const exempt = SCENARIO_TEMPLATES_COCKPIT.filter(
      (s) => !s.archetypeIds.some((a) => MOVE_OFF_ARCHETYPES.has(a)),
    );
    expect(exempt.map((s) => s.id)).toEqual(["sc-vp-police-stop", "sc-vp-telltale"]);
    for (const spec of exempt) expect(moveOffDrillsSilentOnTheBelt(spec)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §4 — THE OTHER DIRECTION: each predicate re-run over the text that shipped
//
// Everything above is green on an empty file too. These are the lines that
// prove the three predicates fire — each one is the SHIPPED-BEFORE sentence,
// copied out of the sweep row it came from, and each is followed by the case
// the same predicate must accept.
// ---------------------------------------------------------------------------

describe("§4 the predicates refuse what sweep 161 photographed", () => {
  it("§1a — „Колата е спряла на банкета“ is refused on this map…", () => {
    const asShipped: ScenarioSpec = {
      ...SC_PK_MOVE_OFF,
      instructionsBg: [
        {
          n: 1,
          textBg: "Колата е спряла на банкета. Потеглянето от място е маневра — започва с оглеждане.",
        },
        ...SC_PK_MOVE_OFF.instructionsBg.slice(1),
      ],
    };
    const complaints = kerbClaimsWithoutAKerbPose(asShipped, districtOf(asShipped));
    expect(complaints).toHaveLength(1);
    expect(complaints[0]).toContain("instruction 1");
    expect(complaints[0]).toContain("0.00 m from a declared lane centre");
  });

  it("…and ACCEPTED the moment the car is actually stood at the kerb", () => {
    // 7.1 m: one metre off the kerb of the 8.125 m right lane whose centre is
    // 4.06 — i.e. the pose a kerbside spawn point would have to carry. The same
    // struck sentence, the same map, a different car position.
    const atTheKerb: ScenarioSpec = {
      ...SC_PK_MOVE_OFF,
      start: { position: { x: 7.1, y: 15 }, headingDeg: 0, vehicleStart: "ready" },
      instructionsBg: [
        {
          n: 1,
          textBg: "Колата е спряла на банкета. Потеглянето от място е маневра — започва с оглеждане.",
        },
        ...SC_PK_MOVE_OFF.instructionsBg.slice(1),
      ],
    };
    expect(metresOffTheRunningLane(atTheKerb, districtOf(atTheKerb))).toBeCloseTo(3.04, 2);
    expect(kerbClaimsWithoutAKerbPose(atTheKerb, districtOf(atTheKerb))).toEqual([]);
  });

  it("§1c — a kerb somebody ELSE is standing on is not a claim about the car", () => {
    // The first draft of AT_THE_KERB_RE convicted these two lines. They are the
    // regression guard on that mistake, quoted from the shipped template: the
    // officer stands on the pavement, which is where an officer stands.
    const officerOnThePavement = [
      "Полицай на тротоара ти подава сигнал за спиране.",
      "Напред вдясно на тротоара стои полицай с вдигната ръка — сигналът за спиране е за теб.",
      "Планирай спирането отрано: плавно намаляване и спиране плътно вдясно до бордюра.",
    ];
    for (const text of officerOnThePavement) expect(AT_THE_KERB_RE.test(text)).toBe(false);
    // …while the car's own rest pose still reads as one, on the very same nouns.
    expect(AT_THE_KERB_RE.test("Стоиш до бордюра на „Незабравка“.")).toBe(true);
  });

  it("§2a — the four shipped clutch commands are refused without the tier…", () => {
    const asShipped: ScenarioSpec = {
      ...SC_VP_STALL,
      instructionsBg: [
        { n: 1, textBg: "Преди потегляне: съединител докрай, включи първа предавка и дай лек газ." },
        {
          n: 2,
          textBg:
            "Отпускай съединителя ПЛАВНО до точката на зацепване — усещаш как колата „поляга“ напред.",
        },
        {
          n: 3,
          textBg:
            "Задръж крака в точката на зацепване, докато колата тръгне, и чак тогава отпусни докрай.",
        },
        {
          n: 4,
          textBg:
            "Ако двигателят все пак загасне: спокойно — съединител докрай, запали отново и повтори процедурата.",
        },
        { n: 5, textBg: "Продължи плавно по отсечката, без нито едно загасване, до края." },
      ],
    };
    expect(manualCommandsWithoutTheTier(asShipped)).toHaveLength(4);
  });

  it("…and the SAME four are accepted once step 1 names the tier", () => {
    const withTier: ScenarioSpec = {
      ...SC_VP_STALL,
      instructionsBg: [
        { n: 0, textBg: `Урокът иска ниво „${MANUAL_TIER_LABEL_BG}“.` },
        { n: 1, textBg: "Преди потегляне: съединител докрай, включи първа предавка и дай лек газ." },
        {
          n: 2,
          textBg:
            "Отпускай съединителя ПЛАВНО до точката на зацепване — усещаш как колата „поляга“ напред.",
        },
      ],
    };
    expect(manualCommandsWithoutTheTier(withTier)).toEqual([]);
  });

  it("§3a — a pull-away drill with the belt struck out is refused…", () => {
    const beltless: ScenarioSpec = {
      ...SC_PK_MOVE_OFF,
      instructionsBg: SC_PK_MOVE_OFF.instructionsBg.filter((s) => !BELT_RE.test(s.textBg)),
    };
    expect(beltless.instructionsBg.length).toBe(SC_PK_MOVE_OFF.instructionsBg.length - 1);
    expect(moveOffDrillsSilentOnTheBelt(beltless)).toHaveLength(1);
  });

  it("…and the same beltless briefing is fine on a mid-drive archetype", () => {
    const asReaction: ScenarioSpec = { ...SC_PK_MOVE_OFF, archetypeIds: ["VP-06"] };
    expect(moveOffDrillsSilentOnTheBelt(asReaction)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §5 — the phone still gets to read all of it
// ---------------------------------------------------------------------------

/**
 * 95 characters is briefing-card-budget.test.ts's MEASURED band — the point past
 * which a compact-card step stops being visible on an iPhone 16 in either
 * orientation. That gate does not list templates-cockpit.ts among the five files
 * it owns, so this file was never held to it, and the measurement below is the
 * first time it has been taken here:
 *
 *   sc-vp-readiness      92   sc-vp-police-stop   113   ← over the band
 *   sc-pk-move-off       89   sc-vp-telltale      115   ← over the band
 *   sc-vp-stall          83
 *
 * §1–§3 were closed by WRITING TEXT, and text under the fold is text the student
 * never reads — which is the very defect this sweep went looking for. So the
 * three drills this wave rewrote are held to the band outright. The two it did
 * not touch are NOT excused: their real numbers are pinned here so they cannot
 * grow, and the fix — folding four long steps in sc-vp-police-stop and
 * sc-vp-telltale — is stated as owed, not quietly absorbed into a looser limit.
 */
const STEP_MAX_CHARS = 95;

/** Measured 2026-08-18 on the shipped text; a ceiling, never a target. */
const OVER_BAND_TODAY: Record<string, number> = {
  "sc-vp-police-stop": 113,
  "sc-vp-telltale": 115,
};

function longestStep(spec: ScenarioSpec): number {
  return Math.max(...spec.instructionsBg.map((s) => s.textBg.length));
}

describe("§5 the rewritten steps stay inside the compact card's band", () => {
  for (const spec of SCENARIO_TEMPLATES_COCKPIT.filter((s) => !(s.id in OVER_BAND_TODAY))) {
    it(`${spec.id}`, () => {
      const over = spec.instructionsBg
        .filter((s) => s.textBg.length > STEP_MAX_CHARS)
        .map((s) => `step ${s.n}: ${s.textBg.length} chars`);
      expect(over).toEqual([]);
    });
  }

  for (const [id, measured] of Object.entries(OVER_BAND_TODAY)) {
    it(`${id} is over the band at ${measured} chars and may not get worse`, () => {
      const spec = SCENARIO_TEMPLATES_COCKPIT.find((s) => s.id === id)!;
      expect(longestStep(spec)).toBeLessThanOrEqual(measured);
      // …and the debt is real, not a rounding error: assert it still EXCEEDS
      // the band, so that shortening these steps forces this row to be deleted
      // rather than left standing as a permanent licence.
      expect(longestStep(spec)).toBeGreaterThan(STEP_MAX_CHARS);
    });
  }
});
