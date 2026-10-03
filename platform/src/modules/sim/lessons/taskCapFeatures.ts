/**
 * THE FEATURE EACH TASK CAP NAMES, AND WHERE IT ENDS — founder ruling
 * 2026-09-25 «Only the named stretch» (round 4 of register item 17).
 *
 * «A breached task cap binds ONLY through the feature the task names — the
 * bend, the spray curtain, the zone — and stops where that feature ends. After
 * it, only the posted limit grades.»
 *
 * The objective carries its mark and its cap; it does not carry the feature its
 * TITLE names, and that is the one fact the ruling needs. This table restates
 * it, BY VALUE, for every capped objective whose task names a feature that
 * extends beyond its own mark, with the authored source it was read from — the
 * same pattern the templates use for world facts (`CURVE_MID`, `DECK_TO_M`),
 * because a lesson may not import the world. `task-cap-features.test.ts` pins
 * every row against the committed content (district zones, edges, roundabouts,
 * staged set pieces and actors, template-wide conditions), so a moved span or
 * actor fails the build instead of silently re-binding a cap.
 *
 * WHAT IS NOT IN THE TABLE NAMES ITS OWN ZONE. A task that says «Мини
 * контролната зона…», «Приближи…» or «Дръж своята лента под 45 км/ч» names
 * nothing past the disc it is judged in, and several templates say so in as
 * many words (`sc-ov-night-gap`: the title «says only the two things the
 * evaluator reads»; `sc-ov-being-overtaken`: the overtaker's script «is a
 * CLOCK, not a place»). Its cap binds across that zone — from the blow to the
 * disc's edge — and not beyond (`finish.ts taskCapStretch`'s default). The
 * same holds for a task whose feature ends at a MOMENT rather than a place
 * («Изчакай моториста…», «Изчакай колата в съседната лента…»): there is no
 * authored geometry to end it at, so the choice is the zone, which errs lenient
 * — the direction a repair may move — and never binds a metre the task did not
 * name.
 *
 * THE KINDS, and how each ends (`finish.ts TaskCapFeatureEnd`):
 *  · a SPAN the task names — the bend (a curveAdvisory zone), a slippery
 *    section (icePatch / waterPatch), the В24 zone, the accident scene's В27
 *    span, the roadworks, the narrow section, a posted-limit zone («зона 30»,
 *    «в зоната», «жилищната / училищната зона»): a GATE at its authored end,
 *    square to the road there;
 *  · the RING the task says to stay in: an AREA, the ring's outer edge;
 *  · something that TRAVELS WITH THE CAR past the next goal — the spray
 *    curtain behind its paced truck, a lead the task says to follow, a
 *    condition authored over the whole section, or a task that names its next
 *    goal outright: the NEXT GOAL, i.e. round 3's region is the tighter bound
 *    and stays the whole answer.
 *
 * ROUND 5 (round-4 verifier F2): the FEATURE governs. Round 4 kept round 3's
 * region as an outer bound, which cut a span short wherever it runs past the
 * next goal (the accident scene, the ice). A gate is now led to by the region
 * up to the gate itself and an area is its own stretch (`finish.ts
 * taskCapStretch`); only a `goal` row ends at the next goal.
 *
 * ARRIVAL CAPS (founder ruling 2026-09-26 «Bill the arrival»): passing a
 * capped objective's mark over its cap is billed as one event at the blow
 * (`lessons/engine.ts stepTaskCapLatch`). Round 5 did that only for the
 * objectives this table does NOT name; ROUND 6 (the integrator's reading of
 * ruling 4, binding: «every capped objective has a mark») does it for every
 * one. A row here is the statement that the task asks for MORE than the
 * arrival — to hold the cap through the feature — so the sustained code also
 * grades an over-cap stretch along it, as the same act as the arrival (one
 * first bill, at most one charge; `rules/engine.ts` `taskArrival`).
 *
 * THE 97 ZONE-DEFAULT TITLES WERE RE-READ IN ROUND 5 (verifier F4). One named a
 * longer feature and is now a row — `sc-prs-row` «Влез покрай редицата с
 * намалена скорост», the parked row, which the template's instructions run
 * «по ЦЯЛАТА дължина на редицата» to «В края на редицата, на самата пешеходна
 * пътека» (pe-x-1, (0, 78)). The others ask to arrive («Приближи…», «Стигни…»,
 * «Мини контролната зона…»), name a moment («Изчакай моториста…», «Задръж под
 * 50, докато потокът те подминава»), or name a stretch at a cap no lower than
 * the sign posted along it, where the task code never grades (`graded` is
 * «shown < posted»): «Измини подхода…» on sc-speed-transition / sc-sp-curve,
 * «Мини подхода под 50» on sc-speed-creep, «…през плътната линия»,
 * «…през участъка», «Мини участъка с разрешената скорост» (twice), «…през
 * средата на участъка», «Мини средата на отсечката…», «Карай спокойно по
 * булеварда» — all ten listed, with the 86 others, in the round-5 report.
 */
import type { TaskCapFeatureEnd } from "./finish";

/** Where a row's end was read from — resolved and asserted by `task-cap-features.test.ts`. */
export type TaskCapFeatureAuthored =
  /** A district zone span (`zones[id]`); the feature ends at its `toM`. */
  | { zone: { district: string; id: string } }
  /** A district edge (a posted-limit zone, the works); the feature ends at its last point. */
  | { edge: { district: string; id: string } }
  /** A staged set piece's authored section; the feature ends at its `sectionEnd`. */
  | { staged: { actor: string } }
  /** A district roundabout; the ring ends at its radius plus half a lane per ring lane. */
  | { roundabout: { district: string; id: string } }
  /** A staged actor that paces ahead of the car; it (and what it throws) runs past the next goal. */
  | { actor: { id: string } }
  /** A condition authored over the whole drive. */
  | { condition: "crosswind" | "night" }
  /** The task names its next goal outright. */
  | { nextGoal: true }
  /** A district crossing the feature ends at (round 5 — the parked row ends at its crossing); a gate at the crossing, square to its road. */
  | { crossing: { district: string; id: string } };

export interface TaskCapFeature {
  /** What the task names. */
  named:
    | "bend"
    | "ice"
    | "water"
    | "noOvertaking"
    | "scene"
    | "works"
    | "narrowSection"
    | "speedZone"
    | "ring"
    | "curtain"
    | "lead"
    | "section"
    | "nextGoal"
    /** Round 5: a row of parked cars the task says to pass along. */
    | "parkedRow";
  /** Where it ends, as the latch steps it. */
  end: TaskCapFeatureEnd;
  /** The authored geometry this row restates. */
  authored: TaskCapFeatureAuthored;
  /** One line: the title's words and the source. */
  source: string;
}

/** Half the product's lane pitch: LANE_WIDTH_M 3.25 × the 2.5 road scale, halved (see finish.ts). */
const HALF_LANE_M = 8.125 / 2;
const NORTH = { ux: 0, uy: 1 } as const;
const EAST = { ux: 1, uy: 0 } as const;
const GOAL = { kind: "goal" } as const;

export const TASK_CAP_FEATURES: Readonly<Record<string, TaskCapFeature>> = {
  // ── THE BEND ──────────────────────────────────────────────────────────────
  "sc-spcv-curve": {
    named: "bend",
    end: { kind: "gate", x: 170, y: 390, ...EAST },
    authored: { zone: { district: "sp-curve-v1", id: "spc-z-curve" } },
    source: "«Мини средата на завоя…» — sp-curve-v1 curveAdvisory spc-z-curve ends at toM 487.02 (170, 390); the exit straight runs east",
  },
  "sc-ovcc-patience": {
    named: "bend",
    end: { kind: "gate", x: 135, y: 375, ...EAST },
    authored: { zone: { district: "ov-crest-v1", id: "ovc-z-curve" } },
    source: "«…през целия закрит завой» — ov-crest-v1 curveAdvisory ovc-z-curve ends at toM 452.04 (135, 375)",
  },
  // ── A SLIPPERY SECTION ───────────────────────────────────────────────────
  "sc-acbi-before": {
    named: "ice",
    end: { kind: "gate", x: 0, y: 340, ...NORTH },
    authored: { zone: { district: "ac-bridge-v1", id: "ac-bridge-z-deck-ice" } },
    source: "«…ПРЕДИ хлъзгавата отсечка» — ac-bridge-v1 icePatch ac-bridge-z-deck-ice [250, 340]",
  },
  "sc-acbi-deck": {
    named: "ice",
    end: { kind: "gate", x: 0, y: 340, ...NORTH },
    authored: { zone: { district: "ac-bridge-v1", id: "ac-bridge-z-deck-ice" } },
    source: "«Стигни края на хлъзгавото…» — the same icePatch, ending at 340",
  },
  "sc-aci-before": {
    named: "ice",
    end: { kind: "gate", x: 0, y: 300, ...NORTH },
    authored: { zone: { district: "ac-ice-v1", id: "ac-ice-z-ice" } },
    source: "«Намали до пълзене ПРЕДИ леда» — ac-ice-v1 icePatch ac-ice-z-ice [210, 300]",
  },
  "sc-acq-before": {
    named: "water",
    end: { kind: "gate", x: 0, y: 280, ...NORTH },
    authored: { zone: { district: "ac-aqua-v1", id: "ac-aqua-z-water" } },
    source: "«Приближи водата…» — ac-aqua-v1 waterPatch ac-aqua-z-water [240, 280]",
  },
  // ── A BANNED OR MARKED SPAN ───────────────────────────────────────────────
  "sc-ovb-patience": {
    named: "noOvertaking",
    end: { kind: "gate", x: 0, y: 210, ...NORTH },
    authored: { zone: { district: "ov-ban-v1", id: "ovb-z-noovertaking" } },
    source: "«Следвай търпеливо през зоната В24» — ov-ban-v1 noOvertaking ovb-z-noovertaking [90, 210]",
  },
  "sc-hzac-slow": {
    named: "scene",
    end: { kind: "gate", x: 0, y: 195, ...NORTH },
    authored: { zone: { district: "hz-accident-v1", id: "hza-z-nostopping" } },
    source: "«Влез в зоната на произшествието…» — the scene's В27 span hza-z-nostopping [120, 195] («престоят е забранен през зоната на сцената»)",
  },
  "sc-hzac-wide": {
    named: "scene",
    end: { kind: "gate", x: 0, y: 195, ...NORTH },
    authored: { zone: { district: "hz-accident-v1", id: "hza-z-nostopping" } },
    source: "«Мини широко и бавно покрай хората и ламарините» — the same scene span, ending at 195",
  },
  "sc-mrs-works-pace": {
    named: "works",
    end: { kind: "gate", x: 0, y: 276, ...NORTH },
    authored: { edge: { district: "hz-roadworks-v1", id: "hzr-e-works" } },
    source: "«Мини през участъка по временната лента…» — hz-roadworks-v1 works edge hzr-e-works (30) ends at hzr-n-works-end (0, 276)",
  },
  "sc-lnom-round": {
    named: "narrowSection",
    end: { kind: "gate", x: 0, y: 174, ...NORTH },
    authored: { staged: { actor: "sc-lnom-meeting" } },
    source: "«Заобиколи препятствието…» — the staged narrowMeeting sc-lnom-meeting's section ends at (0, 174)",
  },
  // ── A POSTED-LIMIT ZONE THE TASK NAMES ────────────────────────────────────
  "sc-sple-hold-to-junction": {
    named: "speedZone",
    end: { kind: "gate", x: 0, y: 340, ...NORTH },
    authored: { edge: { district: "sp-signs-v1", id: "sp-sg-e-limit1" } },
    source: "«Стигни кръстовището, още в зоната и под 40» — sp-signs-v1 edge sp-sg-e-limit1 (40) ends at the junction (0, 340)",
  },
  "sc-sple-hold-to-sign": {
    named: "speedZone",
    end: { kind: "gate", x: 0, y: 700, ...NORTH },
    authored: { edge: { district: "sp-signs-v1", id: "sp-sg-e-limit2" } },
    source: "«Стигни знака за край, още в зоната и под 40» — sp-signs-v1 edge sp-sg-e-limit2 (40) ends at the end sign (0, 700)",
  },
  "sc-crp-zone": {
    named: "speedZone",
    end: { kind: "gate", x: 0, y: 680, ...NORTH },
    authored: { edge: { district: "sp-creep2-v1", id: "sp-tr-e-zone" } },
    source: "«Мини зоната 30 под 30 км/ч» — sp-creep2-v1 edge sp-tr-e-zone (30) ends at (0, 680)",
  },
  "sc-crp-finish": {
    named: "speedZone",
    end: { kind: "gate", x: 0, y: 680, ...NORTH },
    authored: { edge: { district: "sp-creep2-v1", id: "sp-tr-e-zone" } },
    source: "«Стигни края на зоната, още под 30» — the same zone edge, ending at (0, 680)",
  },
  "sc-trn-in-zone": {
    named: "speedZone",
    end: { kind: "gate", x: 0, y: 360, ...NORTH },
    authored: { edge: { district: "sp-trans-v1", id: "sp-tr-e-zone" } },
    source: "«Влез в зона 30 вече под ограничението» — sp-trans-v1 edge sp-tr-e-zone (30) ends at (0, 360)",
  },
  "sc-pesp-zone": {
    named: "speedZone",
    end: { kind: "gate", x: 0, y: 310, ...NORTH },
    authored: { edge: { district: "pe-school-v1", id: "pes-e-zone" } },
    source: "«Влез в училищната зона със скорост на зоната» — pe-school-v1 edge pes-e-zone (30, school) ends at (0, 310)",
  },
  "sc-pzl-zone": {
    named: "speedZone",
    end: { kind: "gate", x: 0, y: 285, ...NORTH },
    authored: { edge: { district: "pe-zone-v1", id: "pz-e-zone" } },
    source: "«Влез в жилищната зона с 20» — pe-zone-v1 edge pz-e-zone (20, residential) ends at its exit (0, 285)",
  },
  // ── A ROW OF PARKED CARS (round 5, verifier F4) ──────────────────────────
  "sc-prs-row": {
    named: "parkedRow",
    end: { kind: "gate", x: 0, y: 78, ...NORTH },
    authored: { crossing: { district: "pe-child-v1", id: "pe-x-1" } },
    source:
      "«Влез покрай редицата с намалена скорост» — the parked row (pe-child-v1 parkedSide right) runs «по ЦЯЛАТА дължина на редицата» to «В края на редицата, на самата пешеходна пътека» (instructions n:3–4): the crossing pe-x-1 (0, 78) on pe-e-street, heading north",
  },
  // ── THE RING ──────────────────────────────────────────────────────────────
  "sc-rb2-past-north": {
    named: "ring",
    end: { kind: "area", x: 0, y: 0, radiusM: 26 + 2 * HALF_LANE_M },
    authored: { roundabout: { district: "rb-2lane-v1", id: "rb2-rb-1" } },
    source: "«Подмини първите два изхода по вътрешната лента» — rb-2lane-v1 ring radius 26, 2 lanes",
  },
  "sc-rbx-past-spokes": {
    named: "ring",
    end: { kind: "area", x: 0, y: 0, radiusM: 18 + HALF_LANE_M },
    authored: { roundabout: { district: "rb-mini-v1", id: "rbm-rb-1" } },
    source: "«Подмини първите два изхода и остани в кръга» — rb-mini-v1 ring radius 18, 1 lane",
  },
  "sc-rbc-past-east": {
    named: "ring",
    end: { kind: "area", x: 0, y: 0, radiusM: 18 + HALF_LANE_M },
    authored: { roundabout: { district: "rb-mini-v1", id: "rbm-rb-1" } },
    source: "«Подмини източния изход, без да излизаш от кръга» — rb-mini-v1 ring radius 18, 1 lane",
  },
  "sc-rbg-past-east": {
    named: "ring",
    end: { kind: "area", x: 0, y: 0, radiusM: 18 + HALF_LANE_M },
    authored: { roundabout: { district: "rb-mini-v1", id: "rbm-rb-1" } },
    source: "«Подмини първия изход (изток), без да излизаш от кръга» — rb-mini-v1 ring radius 18, 1 lane",
  },
  "sc-rbp-past-east": {
    named: "ring",
    end: { kind: "area", x: 0, y: 0, radiusM: 18 + HALF_LANE_M },
    authored: { roundabout: { district: "rb-ped-v1", id: "rbp-rb-1" } },
    source: "«Подмини първия изход и остани в кръга» — rb-ped-v1 ring radius 18, 1 lane",
  },
  // ── SOMETHING THAT TRAVELS WITH THE CAR PAST THE NEXT GOAL ───────────────
  "sc-acts-gap": {
    named: "curtain",
    end: GOAL,
    authored: { actor: { id: "sc-acts-truck" } },
    source: "«Мини пелената…» — the spray truck sc-acts-truck paces 64 m ahead to mw-n-nb-end (0, 2600), past the finish at 860",
  },
  "sc-fd-follow": {
    named: "lead",
    end: GOAL,
    authored: { actor: { id: "sc-fd-lead" } },
    source: "«Следвай предната кола спокойно» — the lead sc-fd-lead runs to fo-n-end (0, 360), past the finish",
  },
  "sc-fr-follow": {
    named: "lead",
    end: GOAL,
    authored: { actor: { id: "sc-fr-lead" } },
    source: "«Следвай спокойно в дъжда» — the lead sc-fr-lead runs to fo-n-end (0, 360), past the finish",
  },
  "sc-ft-follow": {
    named: "lead",
    end: GOAL,
    authored: { actor: { id: "sc-ft-lead" } },
    source: "«Следвай камиона спокойно» — the truck sc-ft-lead runs to fo-n-end (0, 360), past the finish",
  },
  "sc-ahl-follow": {
    named: "lead",
    end: GOAL,
    authored: { actor: { id: "sc-ah-lead" } },
    source: "«Следвай предната кола с къси светлини» — the lead sc-ah-lead runs to fo-n-end (0, 360), past the finish",
  },
  "sc-fbc-read": {
    named: "lead",
    end: GOAL,
    authored: { actor: { id: "sc-fbc-head" } },
    source: "«Следвай колоната спокойно» — the column's head sc-fbc-head runs to fo-n-end (0, 420), past the stop behind it",
  },
  "sc-mgb-behind-bus": {
    named: "lead",
    end: GOAL,
    authored: { actor: { id: "sc-mgb-bus" } },
    source: "«Нареди се зад автобуса и го следвай в неговото темпо» — the bus sc-mgb-bus runs to mgb-n-end (0, 400), past the finish",
  },
  "sc-ovg-wait": {
    named: "lead",
    end: GOAL,
    authored: { actor: { id: "sc-ovg-lead" } },
    source: "«Изчакай зад бавната кола, докато насрещните минат» — the slow car sc-ovg-lead runs to ovg-n-end (0, 900); the wait ends where the task's next goal (the pull-out) begins",
  },
  "sc-vucc-hold-back": {
    named: "lead",
    end: GOAL,
    authored: { actor: { id: "sc-vucc-child" } },
    source: "«Остани зад детето, докато лъкатуши» — the child cyclist sc-vucc-child runs to vuc-n-end (0, 300), past the wide pass",
  },
  "sc-fc-rebuild": {
    named: "lead",
    end: GOAL,
    authored: { actor: { id: "sc-fc-cutter" } },
    source: "«Продължи спокойно след вклиняването» — the cutter sc-fc-cutter, now ahead, runs to ln-n-end (0, 400), past the finish",
  },
  "sc-acx-open": {
    named: "section",
    end: GOAL,
    authored: { condition: "crosswind" },
    source: "«Мини отсечката със съобразена за вятъра скорост» — physics.crosswind blows over the whole route; the section ends at «Стигни края на отсечката»",
  },
  "sc-acno-adapted": {
    named: "section",
    end: GOAL,
    authored: { condition: "night" },
    source: "«Мини неосветения участък…» — the night is template-wide; the unlit section ends at the stop behind the obstacle",
  },
  "sc-mvu-pass-ban": {
    named: "nextGoal",
    end: GOAL,
    authored: { nextGoal: true },
    source: "«Подмини забраненото място и стигни до разрешения отвор» — the task names its next goal, the turning box",
  },
  "sc-sgw-steady": {
    named: "nextGoal",
    end: GOAL,
    authored: { nextGoal: true },
    source: "«Дръж 50 между светофарите» — between the lights, i.e. to the third light, its next goal",
  },
};

/** The feature a capped objective names, or undefined — its own zone (the default). */
export function taskCapFeatureFor(objectiveId: string): TaskCapFeature | undefined {
  return Object.prototype.hasOwnProperty.call(TASK_CAP_FEATURES, objectiveId)
    ? TASK_CAP_FEATURES[objectiveId]
    : undefined;
}
