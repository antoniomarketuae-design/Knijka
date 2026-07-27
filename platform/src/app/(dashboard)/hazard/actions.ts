"use server";

/**
 * The two server actions behind hazard-perception training — and the ONLY two,
 * for all three doors.
 *
 * WHY ONE PAIR OF ACTIONS AND NOT ONE PAIR PER DOOR. Because the door is an
 * argument, the gate is applied by the same code for every surface, and adding
 * the simulator or theory entry point later is a call site, not a new endpoint
 * with its own forgotten checks. The failure mode this avoids is specific and
 * common: a second surface ships with a copy of the action that lost the
 * entitlement line, and the paid section is free through the other URL.
 *
 * WHY THE GATE IS HERE AND NOT IN THE PAGE. A server action IS a public POST
 * endpoint. Gating page.tsx stops a student from SEEING the section; only this
 * file stops them from RUNNING it. Same rule as startExamAction and the
 * simulator's actions (@/modules/payments quota.ts spells it out).
 *
 * WHAT NEVER CROSSES THIS BOUNDARY OUTWARDS: a scoring window, a fault
 * timestamp, or a hazard description, before the reaction has been submitted.
 * The start action returns HazardItemCards, which have no field to leak.
 *
 * WHAT IS NEVER TRUSTED INWARDS: anything at all. Every value below is
 * re-validated even though the client is ours, because the client is the one
 * part of this system an attacker owns outright. Note in particular that the
 * client cannot send a score — there is no field for one, and the shapes below
 * are the whole of what this endpoint will read.
 */

// Side effect: registers the item engine on the port hazard-play owns. Without
// it every call below is correct and inert — hasHazardEngine() is false and the
// section renders „подготвя се". Same shape as `import "@/lib/content/loader"`
// at the top of the exam and theory surfaces.
import "@/lib/serverBootstrap";
import { requireUser } from "@/modules/auth";
import { recordHazardOutcomes } from "@/modules/hazard";
import {
  HazardPlayError,
  getHazardRunSummary,
  hasHazardEngine,
  startHazardRun,
  submitHazardReaction,
} from "@/modules/hazard-play";
import {
  isHazardDoor,
  type HazardActionErrorCode,
  type HazardDoor,
  type HazardReactionInput,
  type HazardRunSummary,
  type StartHazardRunResult,
  type SubmitHazardReactionResult,
} from "@/components/hazard/types";
import { canOpenHazardDoor } from "./access";

/** Run ids are UUIDs today; the pattern stays permissive but bounded. */
const RUN_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ITEM_ID_RE = /^[A-Za-z0-9_:.-]{1,128}$/;

/**
 * Hard ceiling on the press array a single request may carry.
 *
 * The delivery layer caps what it KEEPS (MAX_PRESSES_PER_ITEM); this caps what
 * it will even parse, so a request cannot make the server walk a million-entry
 * array before the cap applies. Larger than the keep-cap on purpose: a genuine
 * spam pattern must still arrive intact enough for the engine to recognise it
 * and void the item, rather than being trimmed into looking reasonable.
 */
const MAX_PRESSES_ON_THE_WIRE = 200;

/**
 * Start a run at one of the three doors.
 *
 * Returns a typed failure rather than throwing: every code here has a sentence
 * in HAZARD_ERROR_COPY_BG, and a student who hits one gets told what happened
 * and keeps a working button. A redirect would be wrong — the simulator and
 * theory doors are interstitials inside another activity, and bouncing a
 * student out of a lesson because a clip bank is still being produced would
 * lose the lesson too.
 */
export async function startHazardRunAction(
  door: HazardDoor,
): Promise<StartHazardRunResult> {
  const user = await requireUser();

  if (!isHazardDoor(door)) return fail("FAILED");

  if (!(await canOpenHazardDoor(user, door))) return fail("NO_ENTITLEMENT");

  // Asked BEFORE dealing so the „подготвя се" state is reachable without an
  // exception in the log for every visit. The engine seam is registration-based
  // (hazard-play engine.ts): before the item bank is wired there is deliberately
  // no fallback that could invent a scoring window.
  if (!hasHazardEngine()) return fail("NO_ITEMS");

  try {
    const started = await startHazardRun(user.id, door);
    return {
      ok: true,
      runId: started.runId,
      item: started.item,
      progress: started.progress,
    };
  } catch (err) {
    return fail(errorCodeOf(err));
  }
}

/**
 * Judge one reaction and hand back the reveal.
 *
 * This is the only place a hazard score comes into existence, and it does so on
 * the server, from timestamps, against a window the browser was never given.
 */
export async function submitHazardReactionAction(
  input: HazardReactionInput,
): Promise<SubmitHazardReactionResult> {
  const user = await requireUser();

  const parsed = parseReactionInput(input);
  if (parsed === null) return fail("FAILED");

  try {
    const result = await submitHazardReaction(user.id, parsed);

    // The learner-model fold, and the only place it can happen: `judge()` is
    // given an item and some timestamps and deliberately never learns WHO is
    // watching, so the module cannot do this for itself. Once per run rather
    // than per clip — a concept counted twice for one sitting would move the
    // review schedule twice — and only after the run row is saved, because the
    // run is the evidence and mastery is derived from it.
    if (result.summary !== null) {
      await foldIntoLearnerModel(user.id, result.summary);
    }

    return {
      ok: true,
      feedback: result.feedback,
      next: result.next,
      progress: result.progress,
      summary: result.summary,
    };
  } catch (err) {
    return fail(errorCodeOf(err));
  }
}

/**
 * Re-open a finished run's summary (a reload, or a shared device).
 *
 * Ownership is enforced inside the module: an unknown run and someone else's
 * run both come back as null, so this cannot be used to enumerate other
 * students' runs.
 */
export async function getHazardRunSummaryAction(
  runId: string,
): Promise<HazardRunSummary | null> {
  const user = await requireUser();
  if (typeof runId !== "string" || !RUN_ID_RE.test(runId)) return null;
  return getHazardRunSummary(user.id, runId);
}

// ---------------------------------------------------------------------------
// helpers — a "use server" module may only EXPORT async functions, so these
// stay private to the file
// ---------------------------------------------------------------------------

/**
 * Best-effort, with its own try/catch on top of the module's.
 *
 * recordHazardOutcomes already swallows a failed Progress write, but it reaches
 * for the item bank first (to map items onto concepts) and THAT read is lazy and
 * can throw. It happens inside the same try as the grading, so without this
 * guard a bank that failed to load would turn a finished run into „нещо се
 * обърка" and the student would lose the reveal they just earned.
 */
async function foldIntoLearnerModel(
  userId: string,
  summary: HazardRunSummary,
): Promise<void> {
  try {
    await recordHazardOutcomes(userId, summary.items);
  } catch (err) {
    console.warn("hazard: learner-model fold failed (the run is still graded)", err);
  }
}

function fail(code: HazardActionErrorCode): { ok: false; code: HazardActionErrorCode; messageBg: string } {
  // The message the UI shows is chosen client-side from the code (copy.ts), so
  // that the copy lives with the rest of the Bulgarian strings. The field is
  // still populated here because a caller that ignores the map must not render
  // an empty panel.
  return { ok: false, code, messageBg: SERVER_FALLBACK_BG[code] };
}

const SERVER_FALLBACK_BG: Record<HazardActionErrorCode, string> = {
  NO_ENTITLEMENT: "Тази част е в платения пакет.",
  NO_ITEMS: "Още подготвяме клиповете.",
  RUN_NOT_FOUND: "Тази тренировка вече не е активна.",
  OUT_OF_ORDER: "Този клип вече е оценен.",
  IMPLAUSIBLE: "Времената не съвпадат с клипа.",
  FAILED: "Нещо се обърка. Опитай пак.",
};

/** HazardPlayError → the closed set of codes the UI can speak about. */
function errorCodeOf(err: unknown): HazardActionErrorCode {
  if (!(err instanceof HazardPlayError)) {
    // Genuinely unexpected: log it (the student gets "нещо се обърка") so a
    // broken engine shows up in the server output instead of as a silent zero.
    console.error("hazard: unexpected failure", err);
    return "FAILED";
  }
  switch (err.code) {
    case "NO_ITEMS":
    case "ENGINE_UNAVAILABLE":
      return "NO_ITEMS";
    case "RUN_NOT_FOUND":
      return "RUN_NOT_FOUND";
    case "OUT_OF_ORDER":
      return "OUT_OF_ORDER";
    case "IMPLAUSIBLE":
      return "IMPLAUSIBLE";
    default:
      return "FAILED";
  }
}

/** Never trust the wire shape — the exam's parseSubmitInput, for reactions. */
function parseReactionInput(value: unknown): HazardReactionInput | null {
  if (typeof value !== "object" || value === null) return null;
  const o = value as Record<string, unknown>;

  if (typeof o.runId !== "string" || !RUN_ID_RE.test(o.runId)) return null;
  if (typeof o.itemId !== "string" || !ITEM_ID_RE.test(o.itemId)) return null;
  if (
    typeof o.watchedToSec !== "number" ||
    !Number.isFinite(o.watchedToSec) ||
    o.watchedToSec < 0
  ) {
    return null;
  }
  if (!Array.isArray(o.pressesMediaSec) || o.pressesMediaSec.length > MAX_PRESSES_ON_THE_WIRE) {
    return null;
  }

  const presses: number[] = [];
  for (const raw of o.pressesMediaSec) {
    // A non-finite or negative entry is dropped rather than failing the whole
    // request: one malformed number should not cost a student a clip they
    // actually watched, and the module clamps and sorts what survives anyway.
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) continue;
    presses.push(raw);
  }

  return {
    runId: o.runId,
    itemId: o.itemId,
    pressesMediaSec: presses,
    watchedToSec: o.watchedToSec,
  };
}
