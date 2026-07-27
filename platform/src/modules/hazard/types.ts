/**
 * hazard module — the item model, the score shape and the constants that
 * define the format.
 *
 * WHAT THIS IS. Hazard perception: the student watches a short clip of a
 * (simulated) drive and reacts the MOMENT a hazard begins to develop — before
 * it is obvious. It is the intervention in driver education with the strongest
 * evidence base for actually reducing novice crashes, and it is deliberately
 * NOT part of the Bulgarian ДАИ exam. We build it anyway: it is the safety
 * differentiator („не само вадим книжка — правим те да не се блъснеш"), and it
 * is what will eventually let the ДАИ outcome capture in @/modules/outcomes say
 * something true about transfer.
 *
 * THREE DOORS, ONE ENGINE (founder decision). The simulator interstitial
 * (free), the standalone paid section and the theory lesson type run the SAME
 * items through the SAME scoring. Placement changes who is let in and how many
 * clips a run has — both of which live in the delivery layer
 * (@/modules/hazard-play HAZARD_RUN_LENGTH) — and changes nothing here. This
 * module never sees a door: `deal()` accepts one and deliberately ignores it,
 * which is the cheapest possible proof that surfacing is routing and not a
 * fork.
 *
 * ---------------------------------------------------------------------------
 * TIME BASES — the one thing to get right in this file. Two exist:
 *
 *   TRACE time  seconds from the start of the recorded ScenarioTrace. The
 *               engine-computed fault timestamp (@/modules/clips CLIP_PLAN
 *               `faultTimeSec`) is in this base, and items freeze it for
 *               provenance.
 *   CLIP time   seconds from the first frame of the rendered .webm. The capture
 *               rig trims [fault−8, fault+4] (clips/capture/trim.ts), so
 *               clip time = trace time − clipStartSec.
 *
 * EVERYTHING THE ENGINE SCORES IS IN CLIP TIME, because clip time is the only
 * clock the browser has: `video.currentTime` starts at zero on the file it was
 * handed. The trace-time fields exist so an item is diffable against the trace
 * and so the freshness test can prove the two agree — no runtime path reads
 * them. Every field below says which base it is in.
 * ---------------------------------------------------------------------------
 */

import type { ViolationCode } from "@/modules/sim/rules";

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
 * would be exactly the padding-bolted-onto-exam-prep feeling we are avoiding.
 * Sources: gov.uk/theory-test/hazard-perception-test and .../pass-mark-and-result.
 */
export const HAZARD_BENCHMARK_NUMERATOR = 44;
export const HAZARD_BENCHMARK_DENOMINATOR = 75;
export const HAZARD_BENCHMARK_RATIO =
  HAZARD_BENCHMARK_NUMERATOR / HAZARD_BENCHMARK_DENOMINATOR;

/**
 * The one line the student reads above every clip, on every door.
 *
 * Identical for every item on purpose: a per-item prompt is a hint, and a hint
 * turns a perception measurement into a reading-comprehension one.
 */
export const HAZARD_PROMPT_BG =
  "Натисни в момента, в който забележиш, че се задава опасност — не когато вече е станала.";

// ---------------------------------------------------------------------------
// Authoring rules for the window (validated by the bank loader)
// ---------------------------------------------------------------------------

/**
 * The authoring default: the window opens this many CLIP seconds before the
 * fault. Four seconds is the span in which a scanning driver can still act
 * without drama — at 50 km/h it is ~55 m, comfortably more than the ~27 m a
 * full stop takes. An item MAY author a different opening (a cue that is
 * visible far earlier, or one that genuinely cannot be seen until later); this
 * constant is what a reviewer compares that decision against.
 */
export const HAZARD_DEFAULT_WINDOW_LEAD_SEC = 4;

/**
 * The window must be at least this long. Five bands across anything shorter
 * would make the difference between „отлично" and „късно" smaller than the
 * jitter of a video element's timeupdate, i.e. noise sold as measurement.
 */
export const HAZARD_MIN_WINDOW_SEC = 1.5;

/**
 * Playable clip before the window opens. Without a run-up the student is
 * reacting to the first frame they see, which measures startle, not scanning —
 * and it also means a habitual "click immediately" strategy would score.
 */
export const HAZARD_MIN_LEAD_IN_SEC = 1;

// ---------------------------------------------------------------------------
// The item model (authored in content/hazard/items.json)
// ---------------------------------------------------------------------------

/** Review status — the house rule: nothing is served until a human has looked. */
export type HazardItemStatus = "draft" | "needs-review" | "approved";

/**
 * Only `approved` items are ever dealt to a student.
 *
 * Same gate the exam applies to questions (exam/builder isExamEligible), and
 * it matters more here than there: an item whose window was never watched is a
 * measurement nobody verified, and this surface exists precisely to produce a
 * measurement worth publishing.
 */
export const HAZARD_SERVABLE_STATUSES: readonly HazardItemStatus[] = ["approved"];

/**
 * Which recorded drive this item is cut from. Identified by
 * (templateId, mistakeIndex) + tracePath rather than by a clip filename,
 * because that pair is the STABLE contract shared by clipPilot, CLIP_PLAN and
 * the capture manifest, while the .webm is a build artefact the render batch
 * rewrites.
 */
export interface HazardClipRef {
  /** Manifest/pilot clip id — "<templateId>__m<mistakeIndex>". */
  id: string;
  /** ScenarioSpec id, e.g. "sc-zebra-approach". */
  templateId: string;
  /** Index into ScenarioSpec.mistakes. */
  mistakeIndex: number;
  /** content/traces/… exactly as ScenarioSpec.mistakes[i].traceRef.path. */
  tracePath: string;
}

/** The scoring window, CLIP seconds. Server-side only until an item is graded. */
export interface HazardWindow {
  /** The hazard first becomes perceivable. Scoring opens here. */
  openSec: number;
  /** Playback stops AND scoring closes: the cut point. */
  closeSec: number;
}

/**
 * One authored row of content/hazard/items.json.
 *
 * The four timestamps are the whole design:
 *
 *   clipStartSec   TRACE time of the clip's first frame. Provenance only —
 *                  it is what lets the freshness test recompute the trim and
 *                  prove the authored clip times still describe the file.
 *   faultSec       TRACE time of the ENGINE-computed fault, copied verbatim
 *                  from CLIP_PLAN. It is the ground truth we did not have to
 *                  author, and it is FROZEN here: regenerating the plan must
 *                  never silently re-grade attempts already scored against the
 *                  old number. Drift fails items.test.ts, loudly.
 *   windowOpenSec  CLIP time the hazard first becomes perceivable. THE one
 *                  genuinely human judgement in the file — a reviewer watches
 *                  the clip and confirms it (see notesBg).
 *   cutSec         CLIP time where playback stops and the window closes. Never
 *                  later than the fault: the clip must end before the hazard is
 *                  unmissable, or we are measuring reaction time to something
 *                  blatant rather than perception of something developing. The
 *                  consequence the rig recorded after the fault still exists in
 *                  the file — it belongs to the reveal, not to the test.
 */
export interface HazardItemSource {
  /** "hz-" prefix, stable, globally unique. */
  id: string;
  status: HazardItemStatus;
  clip: HazardClipRef;
  /** TRACE seconds — clip time zero. */
  clipStartSec: number;
  /** TRACE seconds — the engine-computed fault, frozen from CLIP_PLAN. */
  faultSec: number;
  /** CLIP seconds — scoring opens. */
  windowOpenSec: number;
  /** CLIP seconds — playback and scoring stop. */
  cutSec: number;
  /** 1–3, same scale as concepts.json — used to ramp a run. */
  difficulty: 1 | 2 | 3;
  /** Short title for the brief card. Must never name the hazard. */
  titleBg: string;
  /** The instructor's one-line set-up, read before play. Never names it either. */
  briefBg: string;
  /** What the hazard actually was. Revealed only after grading. */
  hazardBg: string;
  /** Why it was DEVELOPING before it was obvious — the cue chain, in order. */
  developingBg: string;
  /**
   * The rule-catalog code (@/modules/sim/rules VIOLATIONS) this hazard maps to.
   * The corrective, the citation and the concept link are all RETRIEVED from
   * that entry at read time — ADR-002, one law source, never a second copy of
   * the law drifting inside a content file.
   */
  violationCode: ViolationCode;
  /**
   * REVIEW-ONLY echo of VIOLATIONS[violationCode].lawRef, so a reviewer reading
   * the JSON diff sees which law an item invokes without opening a TS file.
   * Never read at runtime; the bank loader fails on any drift.
   */
  lawRefEcho: string;
  /** What a reviewer must confirm, terse Bulgarian. "" when there is nothing. */
  notesBg: string;
}

/**
 * An authored item plus what the loader derived from it. This is what every
 * runtime path holds; nothing recomputes the geometry per request.
 */
export interface HazardItem extends HazardItemSource {
  /** The scoring window in CLIP seconds — {windowOpenSec, cutSec}. */
  window: HazardWindow;
  /** CLIP time of the fault (faultSec − clipStartSec). At or after the cut. */
  hazardAtSec: number;
  /** How much of the file the player may show, CLIP seconds. Equals cutSec. */
  playableSec: number;
  /** Public video URL, by convention "/clips/<clip.id>.webm". */
  clipSrc: string;
  /** First keyframe still, "/clips/<clip.id>.k0.webp" — before the hazard. */
  posterSrc: string;
}

// ---------------------------------------------------------------------------
// Scoring output (see scoring.ts — the pure part)
// ---------------------------------------------------------------------------

/**
 * What happened on one clip, before it is dressed as student-facing copy.
 *
 * Kept separate from the six-value UI verdict in @/components/hazard/types on
 * purpose: this is the mechanical outcome (did a press land inside the window),
 * that one is the thing a 17-year-old reads. feedback.ts is the single mapping
 * between them, so the copy can be re-cut without touching the maths.
 */
export type HazardOutcome =
  /** A press landed inside the window — `band` says how early. */
  | "scored"
  /** Pressed only BEFORE the window opened: guessing, not perceiving. */
  | "early"
  /** Never pressed inside the window and never pressed early either. */
  | "missed"
  /** Anti-cheat: covering the clip with presses. Zero, and we say why. */
  | "spam";

/** Which anti-cheat rule fired. Surfaced to the student, never hidden. */
export type HazardSpamReason = "flood" | "rhythm";

/** Pure scoring result for one clip. No prose, no content — see feedback.ts. */
export interface HazardItemScore {
  itemId: string;
  points: number;
  maxPoints: number;
  /** 0 = earliest band (5 pts) … 4 = last band (1 pt). null when nothing scored. */
  band: number | null;
  outcome: HazardOutcome;
  /** CLIP time of the press that earned the points (null when none did). */
  scoredAtSec: number | null;
  /** Presses before the window opened. */
  earlyPresses: number;
  /** Presses after the cut (client drift / a tail on the file). Never score. */
  latePresses: number;
  /** Which anti-cheat rule fired; null unless outcome === "spam". */
  spamReason: HazardSpamReason | null;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type HazardErrorCode =
  /** content/hazard/items.json is missing, unreadable or invalid. */
  | "BANK_INVALID"
  /** judge() was asked about an item the bank does not have. */
  | "ITEM_NOT_FOUND";

export class HazardError extends Error {
  constructor(
    readonly code: HazardErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HazardError";
  }
}
