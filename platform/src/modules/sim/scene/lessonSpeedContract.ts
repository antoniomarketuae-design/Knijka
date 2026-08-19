/**
 * THE LESSON'S OWN SPEED CONTRACT (doc 86 B7 / L17, lane 8).
 *
 * A district publishes the speeds its ROADS permit (`edge.maxspeed`, read by
 * `LessonScene.maxLegalSpeedOf`). A few districts additionally publish a speed
 * the LESSON REQUIRES — a number the student must actually be able to hold or
 * the drill cannot be completed at all. Today there is exactly one such
 * declaration in the tree and it was the cause of a scenario that could not be
 * won on any rung:
 *
 *   `content/world/sig-wave-v1.json` → `meta.scenario.wave.speedKmh = 50`
 *   (with `blockTravelSec` 19.01, i.e. the lamp offsets are solved FOR 50).
 *   `governorCapKmh("beginner", 50)` was 40 km/h, whose sustainable top speed
 *   is 39.1 km/h — a block then takes 23.8 s, the phase slips ~4.8 s per
 *   block, and the second and third greens are structurally unreachable.
 *   Nothing refused the tier and nothing told the student why (doc 86 B7).
 *
 * The rule this file encodes: **a tier may be slower than the road; it may
 * never be slower than the lesson.** The resolved number floors the governor
 * cap (`vehicle/difficulty.ts` governorCapKmh → REQUIRED_SPEED_HEADROOM_KMH).
 *
 * READ-ONLY over district data — this file never edits, only interprets, and
 * it is deliberately tolerant: an absent/garbage declaration returns undefined
 * and every governor path falls back to the domain rule, byte-identically.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * SWEEP 161 ADDED THE OTHER HALF OF THE SAME SENTENCE (22 rows, all one
 * defect; frames `sweep161/<scenario>/mobile-right/05-stopped.png`).
 *
 * The rule above is one-directional, and the audit found the direction it
 * left open. **A tier may be slower than the lesson's road; the LESSON may
 * never be faster than it.** A declaration is data, and nothing here compared
 * it with the roads of the very district that carries it — so a district
 * declaring 140 on a map posted 50 would have floored the governor at
 * `140 + REQUIRED_SPEED_HEADROOM_KMH` = 146 and the HUD would have printed
 * **«РЕЖИМ Начинаещ ≤146» six pixels from a 50 disc**. That is B58's ruling
 * (`lessons/scenario/__tests__/b58-gate-never-over-posted.test.ts`, „the world
 * may not instruct the fault it is about to bill") arriving at the one surface
 * B58 never covered: B58 bounded the number the GATE prints, this bounds the
 * number the GOVERNOR is set to. Both are numbers a student reads and obeys.
 *
 * Bounding is a no-op on every district shipped today — `sig-wave-v1` declares
 * 50 against a 50 domain — and the sweep in `__tests__/lesson-speed-contract.
 * test.ts` proves that over all 105 files rather than asserting it. The bound
 * is never silent: `lessonSpeedConflict` reports the two numbers that fought.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * AND THE 22 ROWS THEMSELVES: THREE NUMBERS, NO PRECEDENCE.
 *
 * Every one of the 22 carries the same sentence, and the frame is the argument
 * (`sc-crossing-child-ball/mobile-right/05-stopped.png`, iPhone-16 landscape):
 * three speed numbers stand on the glass at once and not one of them says
 * anything about the other two —
 *
 *   · a red В26 disc reading **40** — the LAW, and the thing that is billed;
 *   · beside it **«РЕЖИМ Нормален ≤50 · знакът важи»** — the governor, a
 *     property of the CAR that can neither convict nor acquit;
 *   · and a bar across the lane reading **«Карай дотук — не по-бързо от
 *     37 км/ч»** — the objective's own demand at that point.
 *
 * The student is graded against the STRICTEST of the two real ones (37 here)
 * and never against the governor, and nothing on the screen tells him that.
 * `sc-speed-dangerous/mobile-right/04-t043s.png` is the same reading at its
 * worst: disc 50, mark «Нормален ≤60», in the one drill whose whole subject is
 * that 51–60 in a 50 zone is a scored fault.
 *
 * `readSpeedContract` below is the single answer to „which number binds?" —
 * one resolution, so the three surfaces cannot each invent their own. It is
 * pure and has no render site inside this module: the three surfaces that must
 * adopt it are `hud/StatusDashboard.tsx` (`GovernorCapMark`),
 * `components/sim/RouteGuidance.tsx` (`capLineBg`) and `components/sim/
 * LessonScene.tsx` (which threads both numbers), **none of which this lane
 * owns** — see the lane report. Until they do, the glass is unchanged and the
 * 22 rows stand.
 */

import type { District } from "@/modules/sim/world";

/** Sanity band for a declared required speed (km/h). Anything outside it is
 *  data corruption, not a contract — ignore it rather than governing to it. */
const MIN_DECLARED_KMH = 5;
const MAX_DECLARED_KMH = 200;

function finiteInBand(v: unknown): number | undefined {
  return typeof v === "number" &&
    Number.isFinite(v) &&
    v >= MIN_DECLARED_KMH &&
    v <= MAX_DECLARED_KMH
    ? v
    : undefined;
}

function finitePositive(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
}

/**
 * The highest speed the LAW permits anywhere on this district (km/h), or
 * undefined when no edge publishes one.
 *
 * DELIBERATELY the same computation as `LessonScene.maxLegalSpeedOf` (that
 * file, ~line 454) — the lesson's „speed domain", the number the tier governor
 * is already scaled by. It is duplicated rather than imported because the
 * original is a module-private function in a 2 000-line client component this
 * lane does not own; the consolidation (move it HERE, where „what the roads
 * permit" belongs, and have LessonScene import it) is routed, not done. The
 * sweep test pins both against the shipped tree so a drift shows up as a
 * failing district rather than as a governor that quietly disagrees with the
 * disc.
 *
 * `maxspeed` is typed required on `DistrictEdge`, but these documents are
 * loaded from JSON at an integration seam, so the guard is on the value.
 */
export function districtMaxLegalKmh(district: District): number | undefined {
  let max = 0;
  for (const e of district.roads?.edges ?? []) {
    const v = (e as { maxspeed?: unknown }).maxspeed;
    if (typeof v === "number" && Number.isFinite(v) && v > max) max = v;
  }
  return max > 0 ? max : undefined;
}

/** Where a district's declared required speed was read from. */
export type LessonSpeedSource = "wave" | "requiredSpeedKmh";

/** A declaration this file had to bound, and the two numbers that fought. */
export interface LessonSpeedConflict {
  /** What the district asked for (km/h), in band but above its own roads. */
  declaredKmh: number;
  /** The fastest its own roads legally allow anywhere (km/h). */
  maxLegalKmh: number;
  source: LessonSpeedSource;
}

/** The in-band declaration exactly as written, before the road bound — the
 *  shared half of `lessonRequiredSpeedKmh` and `lessonSpeedConflict`. */
function declaredSpeed(
  district: District,
): { kmh: number; source: LessonSpeedSource } | undefined {
  const scenario = district.meta?.scenario as
    | { wave?: { speedKmh?: unknown }; requiredSpeedKmh?: unknown }
    | undefined;
  if (!scenario || typeof scenario !== "object") return undefined;
  const wave = finiteInBand(scenario.wave?.speedKmh);
  if (wave !== undefined) return { kmh: wave, source: "wave" };
  const generic = finiteInBand(scenario.requiredSpeedKmh);
  return generic === undefined ? undefined : { kmh: generic, source: "requiredSpeedKmh" };
}

/**
 * The speed (km/h) this district's own scenario metadata says the student must
 * be able to drive, or undefined when it declares none.
 *
 * Sources, in precedence order:
 *  1. `meta.scenario.wave.speedKmh` — a green-wave map's solved-for speed.
 *  2. `meta.scenario.requiredSpeedKmh` — the generic seam, so a future
 *     generator can declare one without another code change here.
 *
 * BOUNDED BY THE DISTRICT'S OWN ROADS (sweep 161 — see the header). The result
 * never exceeds `districtMaxLegalKmh`, so this file can raise a tier governor
 * toward the law but never above it. A district with no published limit
 * anywhere is left exactly as declared — there is no law to be bounded by, and
 * inventing one here would refuse a lesson for a fact nobody stated.
 */
export function lessonRequiredSpeedKmh(district: District): number | undefined {
  const declared = declaredSpeed(district);
  if (declared === undefined) return undefined;
  const maxLegal = districtMaxLegalKmh(district);
  return maxLegal === undefined ? declared.kmh : Math.min(declared.kmh, maxLegal);
}

/**
 * The contradiction `lessonRequiredSpeedKmh` had to resolve, or null.
 *
 * Non-null means a district asked the governor for a speed its own streets
 * forbid — a lesson that cannot be driven both correctly and legally. Neither
 * the governor nor any label can settle that, so it is reported rather than
 * absorbed: the bound keeps the glass lawful, this keeps the bound visible.
 */
export function lessonSpeedConflict(district: District): LessonSpeedConflict | null {
  const declared = declaredSpeed(district);
  if (declared === undefined) return null;
  const maxLegal = districtMaxLegalKmh(district);
  if (maxLegal === undefined || declared.kmh <= maxLegal) return null;
  return { declaredKmh: declared.kmh, maxLegalKmh: maxLegal, source: declared.source };
}

// ───────────────────────────────────────────────────────────────────────────
// WHICH OF THE THREE NUMBERS ON THE GLASS IS THE ONE BEING GRADED
// ───────────────────────────────────────────────────────────────────────────

/** The owner of a binding speed number. There is no `"mode"` member and that
 *  is the whole point: a governor cap is a ceiling on the THROTTLE, so it can
 *  neither be exceeded nor be obeyed, and a surface that let it bind would
 *  either convict a student of a limit no sign published or absolve one who
 *  broke a limit the governor happened to sit above. */
export type SpeedAuthority = "law" | "task";

export interface SpeedContractReading {
  /** The number the student is actually judged by (km/h) — the stricter of the
   *  posted limit and this objective's own demand — or undefined when neither
   *  is known and nothing on the glass is graded. Raw, not rounded: grading
   *  reads this, the sentence below rounds for display. */
  bindingKmh: number | undefined;
  /** Who owns `bindingKmh`. `"law"` when the two tie — the sign is the reason
   *  a student is billed, and a tie must not be attributed to the drill. */
  binding: SpeedAuthority | undefined;
  /** The governor sits ABOVE the sign — the founder's 60-against-50, and the
   *  only reading of the mark that is dangerous. Mirrors `GovernorCapMark`'s
   *  own `overLimit` (rounded compare) so the mark and this cannot disagree. */
  modeAboveLaw: boolean;
  /** The governor sits BELOW the number the student must reach — doc 86 B7,
   *  the drill that cannot be completed on this tier. */
  modeBlocksBinding: boolean;
  /** One sentence naming every number that is on the glass together with whose
   *  ceiling it is, in Bulgarian. Empty when nothing is graded and there is
   *  nothing to misread — this bar carries no permanent furniture. */
  lineBg: string;
}

/**
 * Resolve the three ceilings a student can see into one reading.
 *
 * `postedKmh`  — the В26 disc: the law at the car, from the district edges.
 * `taskCapKmh` — this objective's own demand (`reachZone.maxSpeedKmh`, the
 *                number `RouteGuidance.capLineBg` prints on the lane bar).
 * `modeCapKmh` — the difficulty governor (`governorCapKmh`), or null/undefined
 *                on „Напреднал" and on headless mounts that never wrote one.
 *
 * The two rules the 22 rows are asking for, and both are proved in both
 * directions by the sweep test:
 *
 *  1. THE STRICTER OF LAW AND TASK BINDS. A gate demanding 37 on a street
 *     posted 40 means obeying the disc still fails the gate, and the sentence
 *     has to say so or the drill grades a number it never explained.
 *  2. A TASK CAP ABOVE THE LAW IS NEVER THE BINDING NUMBER AND IS NEVER
 *     PRINTED. This is B58 verbatim: 32 gates in the catalog are authored
 *     above their own street's limit as grading slack, and slack is not a
 *     teaching instruction. The sign wins and the slack stays unsaid.
 */
export function readSpeedContract(input: {
  postedKmh?: number;
  taskCapKmh?: number;
  modeCapKmh?: number | null;
}): SpeedContractReading {
  const law = finitePositive(input.postedKmh);
  const task = finitePositive(input.taskCapKmh);
  const mode = finitePositive(input.modeCapKmh ?? undefined);

  // Rule 1 + 2 in one expression. A tie is attributed to the law (see the
  // `binding` docstring) and the governor is absent from it by construction.
  let bindingKmh: number | undefined;
  let binding: SpeedAuthority | undefined;
  if (law !== undefined && task !== undefined) {
    bindingKmh = Math.min(law, task);
    binding = task < law ? "task" : "law";
  } else if (law !== undefined) {
    bindingKmh = law;
    binding = "law";
  } else if (task !== undefined) {
    bindingKmh = task;
    binding = "task";
  }

  const modeAboveLaw =
    mode !== undefined && law !== undefined && Math.round(mode) > Math.round(law);
  const modeBlocksBinding =
    mode !== undefined && bindingKmh !== undefined && Math.round(mode) < Math.round(bindingKmh);

  const parts: string[] = [];
  if (law !== undefined) parts.push(`Знакът е ${Math.round(law)} — това е законът.`);
  if (binding === "task" && bindingKmh !== undefined) {
    parts.push(
      law === undefined
        ? `Задачата иска ≤${Math.round(bindingKmh)} км/ч.`
        : `Задачата иска ≤${Math.round(bindingKmh)}: по-строгото важи.`,
    );
  }
  // The governor clause renders only where it can be MISREAD — above the sign
  // (it looks like a permission) or below the number the drill needs (it looks
  // like a broken engine, which is doc 86 B7 and founder item L17/5). At or
  // under the sign with the drill reachable there is nothing to disclaim, and
  // `GovernorCapMark` already omits its own clause on exactly that test.
  if (mode !== undefined && modeBlocksBinding && bindingKmh !== undefined) {
    parts.push(
      `РЕЖИМ ≤${Math.round(mode)} не стига за ${Math.round(bindingKmh)} — смени режима.`,
    );
  } else if (mode !== undefined && modeAboveLaw) {
    parts.push(`РЕЖИМ ≤${Math.round(mode)} е таван на колата, не разрешение.`);
  }

  return { bindingKmh, binding, modeAboveLaw, modeBlocksBinding, lineBg: parts.join(" ") };
}
