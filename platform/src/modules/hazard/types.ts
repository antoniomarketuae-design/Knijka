/**
 * hazard module types + the constants that define the format.
 *
 * WHAT THIS IS. Hazard perception: the student watches a short clip of a real
 * (simulated) drive and reacts the MOMENT a hazard begins to develop — before
 * it is obvious. It is the single intervention in driver education with the
 * strongest evidence base for actually reducing novice crashes, and it is
 * deliberately NOT part of the Bulgarian ДАИ exam. We build it anyway: it is
 * the safety differentiator („не само вадим книжка — правим те да не се
 * блъснеш"), and it is what makes the ДАИ outcome capture in modules/outcomes
 * eventually able to say something true about transfer.
 *
 * THREE DOORS, ONE ENGINE (founder decision). The same items and the same
 * scoring serve the simulator interstitial (free), the standalone paid section
 * and the theory lesson type. `HazardSurface` is the ONLY thing that differs,
 * and it changes set SIZE and ENTITLEMENT — never the logic. Anything that
 * would fork the grading belongs in the routing layer instead.
 *
 * TIME BASES — the one thing to get right in this file. Three exist:
 *   TRACE time   seconds from the start of the recorded ScenarioTrace. This is
 *                what the engine-computed fault timestamp is in, and what the
 *                content JSON authors in (so an item is diffable against the
 *                trace and against clips/clipPlan.generated.ts).
 *   CLIP time    seconds from the first frame of the rendered .webm. The rig
 *                trims [fault−8, fault+4] (clips/capture/trim.ts), so clip
 *                time = trace time − item.clipStartSec.
 *   The student's clicks are always CLIP time — it is the only clock the
 *                browser has.
 * Every field below says which base it is in. The loader derives the clip-time
 * window once (`HazardItem.window`), and scoring only ever sees clip time.
 */

import type { HazardSpamReason } from "./scoring";

// ---------------------------------------------------------------------------
// Format constants
// ---------------------------------------------------------------------------

/** Maximum points for one clip — the DVSA scale, five bands (see scoring.ts). */
export const HAZARD_MAX_POINTS_PER_ITEM = 5;

/**
 * The DVSA car-driver standard, 44 out of 75 (58.6%). Kept as the SOURCE
 * fraction rather than a rounded percent so the number stays attributable.
 *
 * We report it as a benchmark, never as a pass/fail: this is a teaching
 * surface, and „не си издържал" on a skill the ДАИ exam does not even test
 * would be the exact padding-bolted-onto-exam-prep feeling we are avoiding.
 * Sources: gov.uk/theory-test/hazard-perception-test and .../pass-mark-and-result.
 */
export const HAZARD_BENCHMARK_NUMERATOR = 44;
export const HAZARD_BENCHMARK_DENOMINATOR = 75;
export const HAZARD_BENCHMARK_RATIO =
  HAZARD_BENCHMARK_NUMERATOR / HAZARD_BENCHMARK_DENOMINATOR;

/**
 * The three doors (founder decision — see the module header).
 *
 *  "sim"     — inside the simulator section, FREE. Every student meets it, so
 *              the data accrues and the safety claim becomes measurable.
 *  "section" — its own section, part of the paid pack. A differentiator has to
 *              be visible to be sold.
 *  "theory"  — a lesson type inside theory. Lowest friction: students hit it
 *              while they are already studying.
 */
export const HAZARD_SURFACES = ["sim", "section", "theory"] as const;
export type HazardSurface = (typeof HAZARD_SURFACES)[number];

/**
 * Clips per set, per door. Routing config — NOT a behavioural fork: every
 * surface runs the identical build → play → grade → teach path, it just runs a
 * different number of clips. The simulator and theory doors are interstitials
 * inside another activity, so they stay short; the paid section is the place
 * a student sits down to do a real session.
 */
export const HAZARD_SET_SIZE: Record<HazardSurface, number> = {
  sim: 3,
  theory: 3,
  section: 8,
};

/**
 * Does this door require an active pack? The hazard module only ANSWERS the
 * question — it never enforces it, exactly like startExam() does not call
 * requireEntitlementForExam(). The choke point is the server action, because a
 * server action is a public POST endpoint and a gate inside a pure builder is
 * decoration (payments/quota.ts header).
 */
export function hazardSurfaceRequiresPack(surface: HazardSurface): boolean {
  return surface === "section";
}

export function isHazardSurface(v: unknown): v is HazardSurface {
  return typeof v === "string" && (HAZARD_SURFACES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// The item model (authored in content/hazard/items.json)
// ---------------------------------------------------------------------------

/** Review status — the house rule: nothing ships until a human has looked. */
export type HazardItemStatus = "draft" | "needs-review" | "approved";

/**
 * Which recorded drive this item is cut from. Deliberately identified by
 * (templateId, mistakeIndex) + tracePath rather than by a clip filename: that
 * pair is the STABLE contract shared by clipPilot, clipPlan and the manifest,
 * while `/clips/<id>.webm` is a build artefact that the render batch rewrites.
 * Surfaces resolve the playable file through the existing manifest reader
 * (@/modules/clips/view clipForTracePath) and degrade to the 2D replay when it
 * is missing — the hazard engine never touches public/clips itself.
 */
export interface HazardClipRef {
  /** ScenarioSpec id, e.g. "sc-zebra-approach". */
  templateId: string;
  /** Index into ScenarioSpec.mistakes. */
  mistakeIndex: number;
  /** content/traces/… exactly as ScenarioSpec.mistakes[i].traceRef.path. */
  tracePath: string;
}

/** The clip-time scoring window, derived by the loader — never authored. */
export interface HazardWindow {
  /** CLIP time the hazard first becomes perceivable. Scoring opens here. */
  openSec: number;
  /** CLIP time playback stops AND scoring closes (the cut point). */
  closeSec: number;
}

/**
 * One hazard item — an authored, reviewable cut of one recorded mistake drive.
 *
 * The three timestamps are the whole design:
 *
 *   windowOpenSec  the first moment a competent driver could SEE the hazard
 *                  developing. Authored and human-verified; nothing computes it.
 *   cutSec         where the clip stops. It must land BEFORE the hazard is
 *                  unmissable — otherwise every student clicks at the obvious
 *                  moment and we have measured reaction time, not perception.
 *   faultSec       the engine-computed moment the fault lands, copied from
 *                  clips/clipPlan.generated.ts. It is the ground truth we did
 *                  not have to author, it is what `cutSec` is anchored to, and
 *                  it is FROZEN into the item: regenerating the plan must never
 *                  silently re-grade attempts that were already scored against
 *                  the old number. Drift is caught by items.test.ts, loudly.
 *
 * All three are TRACE time. `window` is the same window in CLIP time and is
 * what scoring uses.
 */
export interface HazardItem {
  /** "hz-" prefix, stable, globally unique. */
  id: string;
  status: HazardItemStatus;
  clip: HazardClipRef;
  /** TRACE time of the rendered clip's first frame (clip time zero). */
  clipStartSec: number;
  /** TRACE time — hazard first perceivable. */
  windowOpenSec: number;
  /** TRACE time — playback + scoring stop here. Strictly before faultSec. */
  cutSec: number;
  /** TRACE time — the engine-computed fault. Frozen copy of CLIP_PLAN. */
  faultSec: number;
  /** What the hazard IS, in Bulgarian — shown only AFTER grading. */
  hazardBg: string;
  /** Where to look / what the tell was. The teaching half of the feedback. */
  cueBg: string;
  /**
   * The rule-catalog code (sim/rules VIOLATIONS) this hazard maps to. The
   * citation, the explanation, the corrective and the concept link are all
   * RETRIEVED from that entry at read time — ADR-002, one law source, never a
   * second copy of the law drifting in a content file.
   */
  violationCode: string;
  /**
   * REVIEW-ONLY echo of VIOLATIONS[violationCode].lawRef, so a reviewer reading
   * the JSON diff can see which law an item invokes without cross-referencing a
   * TS file. Never read at runtime; items.test.ts fails on any drift.
   */
  lawRefEcho: string;
  /** 1–3, same scale as concepts.json — used to spread a set. */
  difficulty: 1 | 2 | 3;
  /** Authoring/review note (Bulgarian, terse). "" when there is nothing to say. */
  notesBg: string;

  // -- derived by the loader, not authored ----------------------------------
  /** The scoring window in CLIP time (windowOpenSec/cutSec − clipStartSec). */
  window: HazardWindow;
  /** CLIP time of the fault — past the cut, drawn on the review timeline. */
  faultAtSec: number;
  /** Manifest/pilot clip id, "<templateId>__m<mistakeIndex>". */
  clipId: string;
}

// ---------------------------------------------------------------------------
// What the browser is allowed to see BEFORE grading
// ---------------------------------------------------------------------------

/**
 * The safe projection of an item — the hazard-perception twin of ExamQuestion
 * dropping `correct` flags.
 *
 * What is NOT here is the whole security model: no window, no fault time, no
 * hazard description, no violation code. If any of them reached the page the
 * answer would be in the page source and every score after that would be
 * fiction. `no-leak.test.ts` serialises this type and asserts the secrets are
 * absent, so the guarantee survives someone adding a field in a hurry.
 */
export interface HazardClipView {
  itemId: string;
  /** "<templateId>__m<i>" — the surface resolves the .webm via the manifest. */
  clipId: string;
  tracePath: string;
  /** Stop playback here, CLIP seconds. The cut point. */
  playableSec: number;
  /** Identical for every item on purpose — a per-item prompt would hint. */
  promptBg: string;
}

/** The prompt. One string, every clip, every door — see HazardClipView. */
export const HAZARD_PROMPT_BG =
  "Натисни в момента, в който забележиш, че се задава опасност — не когато вече е станала.";

export interface StartHazardSetResult {
  attemptId: string;
  surface: HazardSurface;
  seed: number;
  clips: HazardClipView[];
}

/** Re-render of a set that is still running (the resume path). */
export interface InProgressHazardSet {
  attemptId: string;
  surface: HazardSurface;
  seed: number;
  startedAt: Date;
  clips: HazardClipView[];
}

// ---------------------------------------------------------------------------
// What the browser sends back
// ---------------------------------------------------------------------------

/**
 * One clip's worth of student input. CLIP seconds, in the order they happened.
 *
 * Note what is absent: a score. The client reports OBSERVATIONS (when the
 * finger went down) and nothing else — same rule as the exam, where the client
 * reports chosen option ids and the server decides what they are worth.
 */
export interface HazardResponse {
  itemId: string;
  clickSecs: number[];
}

// ---------------------------------------------------------------------------
// Grading output
// ---------------------------------------------------------------------------

export type HazardVerdict =
  /** Clicked inside the window — `points` says how early. */
  | "scored"
  /** Never clicked inside the window (silence, or only too-early clicks). */
  | "missed"
  /** Anti-cheat: covering the clip with clicks. Zero, and we say why. */
  | "spam";

/** Pure scoring result for one clip. No content, no prose — see feedback.ts. */
export interface HazardItemScore {
  itemId: string;
  points: number;
  /** 0 = earliest band (5 pts) … 4 = last band (1 pt). null when not scored. */
  band: number | null;
  verdict: HazardVerdict;
  /** CLIP time of the click that earned the points (null when none did). */
  scoredAtSec: number | null;
  /** Clicks before the window opened — guessing, not perceiving. */
  earlyClicks: number;
  /** Clicks after the cut (client drift / a tail on the file). Never score. */
  lateClicks: number;
  /** Which anti-cheat rule fired; null unless verdict === "spam". */
  spamReason: HazardSpamReason | null;
}

/** The whole set. `maxPoints` is items × 5. */
export interface HazardSetScore {
  points: number;
  maxPoints: number;
  /** points / maxPoints, 0..1 (0 when the set is empty). */
  ratio: number;
  /** ratio >= 44/75 — the DVSA standard, reported, never enforced. */
  meetsBenchmark: boolean;
  perItem: HazardItemScore[];
}

// ---------------------------------------------------------------------------
// Feedback — the point of the whole surface
// ---------------------------------------------------------------------------

/**
 * The rule behind a hazard, RETRIEVED from sim/rules VIOLATIONS. Every string
 * here was authored by a human in the catalog; nothing on this type is ever
 * generated, rephrased or free-recalled (ADR-002).
 */
export interface HazardRuleCitation {
  code: string;
  titleBg: string;
  explanationBg: string;
  correctiveBg: string;
  /** e.g. "ЗДвП чл. 119" — the catalog's own citation, verbatim. */
  lawRef: string;
  severityClass: string;
  /** content/concepts.json id, when the catalog links one. */
  conceptId?: string;
}

/** One graded clip, with everything the student needs to LEARN from it. */
export interface HazardItemReview {
  itemId: string;
  clipId: string;
  tracePath: string;
  score: HazardItemScore;
  /** Now safe to reveal: the window, in CLIP seconds. */
  window: HazardWindow;
  /** The six band edges, CLIP seconds — the review timeline draws these. */
  bandEdges: number[];
  /** CLIP time the fault landed (after the cut — the student never saw it). */
  faultAtSec: number;
  /** The student's clicks as graded (debounced + sorted), CLIP seconds. */
  clickSecs: number[];
  hazardBg: string;
  cueBg: string;
  rule: HazardRuleCitation;
  /** One authored line of teaching for THIS outcome. Never generated. */
  verdictBg: string;
}

/** A completed set, rebuilt server-side (device-independent, like the exam). */
export interface HazardReview {
  attemptId: string;
  surface: HazardSurface;
  startedAt: Date;
  finishedAt: Date;
  points: number;
  maxPoints: number;
  ratio: number;
  meetsBenchmark: boolean;
  items: HazardItemReview[];
}

export interface SubmitHazardSetResult extends HazardSetScore {
  attemptId: string;
  surface: HazardSurface;
  items: HazardItemReview[];
}

export interface HazardHistoryEntry {
  attemptId: string;
  surface: HazardSurface;
  startedAt: Date;
  finishedAt: Date | null;
  status: "in-progress" | "completed";
  points: number | null;
  maxPoints: number;
  meetsBenchmark: boolean | null;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type HazardErrorCode =
  /** Fewer servable (approved) items than the set needs. */
  | "POOL_TOO_SMALL"
  /** Unknown attempt id OR an attempt owned by another user (same answer). */
  | "ATTEMPT_NOT_FOUND"
  | "ALREADY_SUBMITTED"
  /** Stored attempt payload unreadable, or an item vanished from content. */
  | "INVALID_ATTEMPT_STATE";

export class HazardError extends Error {
  constructor(
    readonly code: HazardErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HazardError";
  }
}
