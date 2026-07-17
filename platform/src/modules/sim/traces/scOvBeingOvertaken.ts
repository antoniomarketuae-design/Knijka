/**
 * sc-ov-being-overtaken — the authored drives (doc 76 §5/§9): ONE correct
 * shadow + TWO mistake demos for „Изпреварват те — не ускорявай" (doc 72 OV-10
 * „Ускоряване докато те изпреварват" × OV-12 „Возене по линията") on the
 * committed ov-oncoming-v1 district (900 m extra-urban 1+1, dashed осева, limit
 * 90), by DAY, with the template's OWN staged actors (single truth, imported
 * from the template):
 *  - the OVERTAKER (rearTailgater sc-ovbo-overtaker): closes to ~12 m of
 *    centers behind the player, sits for ~5 s, then cruises 25 m/s (90 km/h)
 *    one lane LEFT — onto the oncoming bank — and passes;
 *  - the oncoming stream (oncomingStream sc-ovbo-stream): TWO cars at 12 m/s
 *    southbound, released on the player's first movement — both authored to
 *    meet the player EARLY so the oncoming lane is empty when the pass runs.
 *
 * THE ONE HINGE. The overtaker passes at the posted 90 km/h. Nothing else in
 * these three drives changes: the SAME spec produces "he passes cleanly" and
 * "he is trapped alongside" purely from the player's throttle, because 25 m/s
 * cannot get ahead of 27.6 m/s. The shadow's success and the mistake's disaster
 * are the same kinematics read twice — no scripted fake underneath the card.
 *
 * The trace gate replays exactly these through the production stack:
 *  - shadow: holds 70, eases to 65 on the pass and hugs the right of its own
 *    lane → ZERO violations + CLEAN_DRIVING, and the overtaker resolves
 *    "yielded" (the runner's learn-only measurement of the taught response —
 *    easeKmh 4 against the 5 km/h lift). On this 1+1 the bank flip renumbers no
 *    lane (laneId is 0 across the whole road), so NO lane-change code can exist;
 *  - „Ускоряване, докато те изпреварват": answers the pass with throttle and
 *    holds 99.5 km/h — inside the (99, 100] minor band on a 90 limit (grace
 *    ratio 0.1 ⇒ 99.0; dangerousSpeedOverKmh 10 ⇒ 100.0), so it grades
 *    SPEEDING_OVER_LIMIT and never SPEEDING_DANGEROUS — then takes the authored
 *    consequence: the overtaker, unable to complete and out of oncoming lane,
 *    dives back into the lane the player occupies → COLLISION. EXACTLY the two;
 *  - „Ляво дърпане срещу изпреварващия": speed legal the whole way, but rides
 *    x ≈ 0.3 (laneOffsetM ≈ 3.76 > the 3.25 m laneKeepMaxOffsetM, indicator off,
 *    own bank) for ~7 s → EXACTLY CENTER_LINE_TOUCHED (3.5 s sustain). The
 *    generic POOR_LANE_KEEPING is SUPPRESSED by design here — centerLineCond
 *    arms and the engine's "one act, one code" ruling stands the generic clock
 *    down; see the template header for why that is OV-12's correct code.
 *
 * Geometry pinned to content/world/ov-oncoming-v1.json: road on x = 0, own lane
 * center x = +4.0625, oncoming bank x = −4.0625; spawn ovg-spawn-start
 * (4.06, 15) heading north; 900 m, limit 90. laneOffsetM is measured from the
 * NEAREST lane center (+ = left), so it peaks at 4.06 on the осева itself and
 * shrinks again past it — the center-line band is x ∈ (0, 0.81) on the own side.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_OV_BEING_OVERTAKEN } from "../lessons/scenario/templates-lanes2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_OV_BEING_OVERTAKEN_ID = "sc-ov-being-overtaken";

/** Own (northbound) lane center; the right-of-lane hold; the осева ride line. */
const X_OWN = 4.06;
const X_RIGHT = 5.6; // laneOffsetM ≈ −1.54 — clearly right, far inside the 3.25 band
const X_LINE = 0.3; // laneOffsetM ≈ 3.76 — riding the осева, still on the own bank

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — hold your speed, hold your right
// ---------------------------------------------------------------------------

export function scOvBeingOvertakenShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Извънградски път, ограничение 90. Караме спокойно 70 в своята лента." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_OWN, 15], [X_OWN, 120]], targetKmh: 70, stopAtEnd: false },
      { kind: "annotation", textBg: "Насрещните минават — по една лента в посока, платното отляво е чуждо." },
      { kind: "drive", points: [[X_OWN, 120], [X_OWN, 250]], targetKmh: 70, stopAtEnd: false },
      { kind: "glance", mirror: "rear" },
      { kind: "annotation", textBg: "В огледалото: колата зад нас се долепи и излиза наляво — започва да ни изпреварва." },
      // The taught response, both halves at once: lift ~5 km/h off (easeKmh 4 ⇒
      // the runner latches "yielded") and move to the right of the own lane.
      { kind: "drive", points: [[X_OWN, 250], [X_RIGHT, 290], [X_RIGHT, 400]], targetKmh: 65, stopAtEnd: false },
      { kind: "annotation", textBg: "Не ускоряваме и се държим вдясно — така съкращаваме времето му в насрещното." },
      { kind: "drive", points: [[X_RIGHT, 400], [X_RIGHT, 470]], targetKmh: 65, stopAtEnd: false },
      { kind: "annotation", textBg: "Подмина ни и се отдалечава — чак сега се връщаме в средата на лентата." },
      { kind: "drive", points: [[X_RIGHT, 470], [X_OWN, 500], [X_OWN, 530]], targetKmh: 65, stopAtEnd: false },
      { kind: "drive", points: [[X_OWN, 530], [X_OWN, 560]], targetKmh: 60 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Чисто: без ускоряване, вдясно в лентата, изпреварването свърши бързо и безопасно." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Ускоряване, докато те изпреварват"
// (SPEEDING_OVER_LIMIT + COLLISION)
// ---------------------------------------------------------------------------

export function scOvBeingOvertakenMistakeAcceleratingScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „никой няма да ме изпреварва“ — и водачът натиска газта." },
      { kind: "glance", mirror: "rear" },
      // Identical opening to the shadow: the divergence is the throttle alone.
      { kind: "drive", points: [[X_OWN, 15], [X_OWN, 120]], targetKmh: 70, stopAtEnd: false },
      { kind: "drive", points: [[X_OWN, 120], [X_OWN, 250]], targetKmh: 70, stopAtEnd: false },
      { kind: "glance", mirror: "rear" },
      { kind: "annotation", textBg: "Колата отляво вече е до нас — и точно сега водачът ускорява." },
      // 99.5 km/h: inside the (99, 100] minor band on the 90 limit — the script
      // servo clamps to target, so the hold is exact and never reaches the
      // dangerous tier. Held well past the 2 s minor sustain.
      { kind: "drive", points: [[X_OWN, 250], [X_OWN, 400]], targetKmh: 99.5, stopAtEnd: false },
      { kind: "annotation", textBg: "Над 90 сме — той вече не може нито да ни подмине, нито да се върне зад нас: стои в насрещното платно заради нашата газ." },
      { kind: "drive", points: [[X_OWN, 400], [X_OWN, 520]], targetKmh: 99.5, stopAtEnd: false },
      { kind: "annotation", textBg: "Колкото по-дълго ускоряваме, толкова по-дълго той е изложен насреща — единственият му изход е да се хвърли обратно върху нас." },
      // The authored consequence: the overtaker, trapped in the oncoming lane by
      // the player's own throttle, dives back into the lane the player occupies.
      // (The rearTailgater runner emits ZERO events by contract — a staged
      // rear-end cannot arise from it, so the consequence is authored, the
      // scVuBlindspotMoto precedent.)
      { kind: "collision", withWhat: "vehicle" },
      { kind: "pause", sec: 2.5, brake: true },
      { kind: "annotation", textBg: "Изпреварваният няма право да увеличава скоростта си (чл. 42, ал. 2) — ускоряването е това, което го вкара в капана." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Ляво дърпане срещу изпреварващия" (CENTER_LINE_TOUCHED)
// ---------------------------------------------------------------------------

export function scOvBeingOvertakenMistakeDriftingLeftScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: скоростта е наред, но воланът тръгва след погледа — наляво, към изпреварващия." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_OWN, 15], [X_OWN, 120]], targetKmh: 70, stopAtEnd: false },
      { kind: "drive", points: [[X_OWN, 120], [X_OWN, 250]], targetKmh: 70, stopAtEnd: false },
      { kind: "glance", mirror: "rear" },
      { kind: "annotation", textBg: "Колата отляво излиза да ни изпревари — и водачът се „обръща“ към нея." },
      // Drift onto the осева and RIDE it: laneOffsetM ≈ 3.76 > 3.25, indicator
      // off, own bank ⇒ centerLineCond arms. ~140 m at 65 km/h ≈ 7.7 s, twice
      // the 3.5 s sustain. Speed stays legal — the line is the only channel.
      { kind: "drive", points: [[X_OWN, 250], [X_LINE, 300], [X_LINE, 440]], targetKmh: 65, stopAtEnd: false },
      { kind: "annotation", textBg: "Возим се по осевата точно там, където минава той — няма накъде да се дръпне, освен още по-навътре." },
      { kind: "drive", points: [[X_LINE, 440], [X_OWN, 490], [X_OWN, 530]], targetKmh: 65, stopAtEnd: false },
      { kind: "drive", points: [[X_OWN, 530], [X_OWN, 560]], targetKmh: 60 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Дръж се ВДЯСНО в своята лента (чл. 15) — коридорът на изпреварващия трябва да остане максимално широк." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScOvBeingOvertakenTraceName =
  | "shadow-correct"
  | "mistake-accelerating"
  | "mistake-drifting-left";

const SCRIPTS: Record<
  ScOvBeingOvertakenTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scOvBeingOvertakenShadowScript },
  "mistake-accelerating": { kind: "mistake", script: scOvBeingOvertakenMistakeAcceleratingScript },
  "mistake-drifting-left": { kind: "mistake", script: scOvBeingOvertakenMistakeDriftingLeftScript },
};

/**
 * Record one of the three drives against a loaded ov-oncoming-v1 document — by
 * DAY, the TEMPLATE's staged overtaker + oncoming stream armed (single truth),
 * ambient traffic zero (the harness law). Deterministic: same district → same
 * trace.
 */
export function recordScOvBeingOvertakenDrive(
  districtRaw: unknown,
  name: ScOvBeingOvertakenTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_OV_BEING_OVERTAKEN_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_OV_BEING_OVERTAKEN.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
