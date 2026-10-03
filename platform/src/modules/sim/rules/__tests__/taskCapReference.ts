/**
 * THE TASK CEILING, ROUND 14 — THE REFERENCE LEDGER, TWO LEDGERS: the TWO-SIDED oracle of the generated census
 * (`task-cap-two-sided-census.test.ts`). Not a test file.
 *
 * FOUNDER RULING 2026-10-03, verbatim: «Cap adds, never removes. The task cap is an extra rule on top. Its bill stands
 * on its own; the bend/weather bills are charged exactly as they would be in a lesson with no cap. Blowing the cap can
 * only add, never lower the score, and order never matters.» It supersedes every reading of rounds 2–13 in which a
 * task-cap bill absorbs, or is absorbed by, a weather, bend or SPEEDING_* bill — the „kin ledger" this file restated
 * until round 13, with its owners, lapses, surfaced cards, hand-overs, joins and one-bill-per-M-16-act. So this file
 * now derives, for every programme, the expected rule events of every frame from TWO LEDGERS that never read each
 * other:
 *
 *  · THE NO-CAP LEDGER — the sign's bands (чл. 21; M-16), the weather envelope and the bend's advisory (чл. 20, ал. 2),
 *    the fog lamp duty and the excursion off the carriageway, each from its own definition, each bill pushed exactly
 *    as the same drive with no cap pushes it (a first bill SHOWN, a re-grade a REGRADE).
 *  · THE CAP LEDGER — the task's own ceiling, from cap events alone: the latch (a new blow), the arrival (founder ruling
 *    4, «Bill the arrival» — one event at the blow), the stamp (founder ruling 2, «only the named stretch»), the
 *    sign-bound arrival's wait and its three ends (round 12's stamp rule, round 8's held correction, the ending), the
 *    act of a mark and its stretch (one first bill, one re-grade), and round 7's marks blown inside one sign-bound act.
 *
 * Plus every CLEAN_DRIVING commendation (paid by the base rule; the cap can only withhold one: a blow resets the
 * streak, a sign-bound act holds it) and what the ENDING of a drive stopped on any frame would settle — each ledger its
 * own. The census compares it EXACTLY, event for event and frame for frame, with what the real reducer produces.
 *
 * INDEPENDENCE. It imports NO decision code of the reducer: `createRuleEngine` only for the CONFIG's numbers (data),
 * and the types. Every line below is restated from its source — the base detectors from their definitions, the cap
 * ledger from the ruling texts and the readings the integrator made binding — and written in its own shape (an act is
 * a SET of marks; the wait is the blow it will quote; the M-16 correction is this file's own clock). The lesson is a
 * pure function of this stream (`lessons/engine.ts capLedgerAdmits` drops ABSORBED; the coach teaches a topic's first
 * encounter — the cap's topic its own, `scenarios/mapping.ts teachTopicForCode` — and charges a repeat), so equal
 * streams are equal cards, rows and points; the lesson censuses check that claim through real lesson sessions.
 */
import { createRuleEngine, type RuleEngineConfig, type SimTick } from "..";

const TASK = "TASK_SPEED_CAP_EXCEEDED";
const COND = "SPEED_TOO_FAST_FOR_CONDITIONS";
const CURVE = "SPEED_TOO_FAST_FOR_CURVE";
const OVER = "SPEEDING_OVER_LIMIT";
const DANG = "SPEEDING_DANGEROUS";
const FOG = "FOG_LIGHTS_OFF_IN_FOG";
const OFF = "OFF_CARRIAGEWAY";
const PRAISE = "CLEAN_DRIVING";

/** The config NUMBERS (data): the catalogue's lines and the M-16 rule's seconds. A committed lesson may carry its own
 *  (`LessonSpec.ruleConfig`): the lesson census hands its session's config in. */
const DEFAULT_CONFIG: RuleEngineConfig = createRuleEngine().config;

/** What the lesson does with a bill: the student-visible class. */
export type Kind = "shown" | "absorbed" | "regrade" | "praise";
export interface Blow {
  arrivalKmh: number;
  shownKmh: number;
  postedKmh: number;
}
export interface Bill {
  t: number;
  code: string;
  kind: Kind;
  /** The blow a sign-bound arrival's card quotes. */
  blow?: Blow;
}
export const billKey = (b: Bill): string =>
  `${b.code}:${b.kind}${b.blow !== undefined ? `:blow=${b.blow.arrivalKmh}/${b.blow.shownKmh}/${b.blow.postedKmh}` : ""}@${b.t}`;

/** The ending of a drive stopped on this frame — each ledger's own settlement. */
export interface Ending {
  /** The sign's withheld re-grade (`settleUnpaidSpeedingTeach`: shown, the re-grade clock running, still in the band). */
  speeding: string | null;
  /** The cap's sign-bound arrival still waiting (`settlePendingTaskArrival`). */
  pending: string | null;
  /** The cap's withheld re-grade (`settleUnpaidTaskTeach`). */
  task: string | null;
  /** The weather's and the bend's withheld charge (`settleUnpaidAdaptationTeach`) — exactly as with no cap. */
  adaptation: string[];
}

// ---------------------------------------------------------------------------
// THE BASE DETECTORS, restated from their definitions
// ---------------------------------------------------------------------------

/** A one-bill episode: a first bill after `sustain` s over the line (held continuously, or ACCRUED for a speed band);
 *  a frame at or under the line re-arms it; a frame off the line but not at it only stops the clock. */
class Plain {
  since: number | null = null;
  emitted = false;
  banked = 0;
  lastOver: number | null = null;
  constructor(
    private readonly sustain: number,
    private readonly accrue = false,
  ) {}
  step(over: boolean, reset: boolean, t: number): boolean {
    if (reset) {
      this.since = null;
      this.emitted = false;
      this.banked = 0;
      this.lastOver = null;
      return false;
    }
    if (!over) {
      this.since = null;
      this.lastOver = null;
      if (!this.accrue) this.banked = 0;
      return false;
    }
    if (this.since === null) this.since = t;
    if (this.accrue) {
      this.banked += this.lastOver === null ? 0 : Math.max(0, Math.min(t - this.lastOver, 2));
      this.lastOver = t;
    }
    if (!this.emitted && (this.accrue ? this.banked : t - this.since) >= this.sustain) {
      this.emitted = true;
      return true;
    }
    return false;
  }
  /** GATE 1's reading of an episode: billed, and not yet corrected (still over, or a band's banked seconds kept). */
  get billedUncorrected(): boolean {
    return this.emitted && (this.since !== null || this.banked > 0);
  }
  get live(): boolean {
    return this.since !== null || this.emitted || this.banked > 0;
  }
}

/** THE M-16 CONTINUING OFFENCE: a correction ends the episode only once HELD `rearm` s; a band held on re-bills every
 *  `repeat` s. Returns "first" / "repeat" / null. */
class Continuing {
  since: number | null = null;
  emitted = false;
  banked = 0;
  lastOver: number | null = null;
  resetSince: number | null = null;
  lastBill: number | null = null;
  /** Bills in the current episode (a standing duty bills at most `maxBills`, its later ones re-grades). */
  count = 0;
  constructor(
    private readonly sustain: number,
    private readonly rearm: number,
    private readonly repeat: number,
    private readonly accrue: boolean,
    private readonly maxBills = 0,
  ) {}
  step(over: boolean, reset: boolean, t: number): "first" | "repeat" | null {
    if (reset) {
      this.since = null;
      this.banked = 0;
      this.lastOver = null;
      if (this.resetSince === null) this.resetSince = t;
      if (t - this.resetSince >= this.rearm) {
        this.emitted = false;
        this.lastBill = null;
        this.count = 0;
      }
      return null;
    }
    this.resetSince = null;
    if (!over) {
      this.since = null;
      this.lastOver = null;
      if (!this.accrue) this.banked = 0;
      return null;
    }
    if (this.since === null) this.since = t;
    if (this.accrue) {
      this.banked += this.lastOver === null ? 0 : Math.max(0, Math.min(t - this.lastOver, 2));
      this.lastOver = t;
    }
    if (!this.emitted) {
      if ((this.accrue ? this.banked : t - this.since) < this.sustain) return null;
      this.emitted = true;
      this.lastBill = t;
      this.count = 1;
      return "first";
    }
    if (this.repeat > 0 && this.lastBill !== null && t - this.lastBill >= this.repeat && (this.maxBills <= 0 || this.count < this.maxBills)) {
      this.lastBill = t;
      this.count++;
      return "repeat";
    }
    return null;
  }
  /** GATE 1's reading of an episode: billed, and not yet corrected (still over, or a band's banked seconds kept). */
  get billedUncorrected(): boolean {
    return this.emitted && (this.since !== null || this.banked > 0);
  }
  /** The correction has been held long enough to end the offence (M-16). */
  held(reset: boolean, t: number): boolean {
    return reset && this.resetSince !== null && t - this.resetSince >= this.rearm;
  }
  get live(): boolean {
    return this.since !== null || this.emitted || this.banked > 0;
  }
}

function envelope(x: SimTick, C: RuleEngineConfig): number | null {
  const f: number[] = [];
  if (x.snow === true) f.push(C.conditionSpeedSnowFactor);
  if (x.fog === true) f.push(C.conditionSpeedFogFactor);
  if (x.rain === true) f.push(C.conditionSpeedRainFactor);
  if (x.isNight === true) f.push(C.conditionSpeedNightFactor);
  if (f.length === 0) return null;
  const m = Math.min(...f);
  return m < 1 ? x.maxSpeedKmh * m : null;
}


// ---------------------------------------------------------------------------
// THE REFERENCE
// ---------------------------------------------------------------------------

export interface Coverage14 {
  programmes: number;
  frames: number;
  bills: number;
  // ── THE NO-CAP LEDGER ──
  speedingBills: number;
  condBills: number;
  condRegrades: number;
  bendBills: number;
  fogBills: number;
  offCarriagewayBills: number;
  // ── THE CAP LEDGER ──
  /** Acts named (a first bill put before the student); kept acts RESUMED by their latch (round 6). */
  capActs: number;
  restores: number;
  /** Arrivals billed at their blow (graded); sign-bound blows; later sign-bound blows that waited with an arrival (round 7). */
  gradedArrivals: number;
  signBoundBlows: number;
  marksJoined: number;
  /** A later sign-bound blow inside a sign-bound act that already had its bill — its latch the act's (round 10). */
  laterBlowsAfterBill: number;
  /** A graded blow while a sign-bound arrival waited — its bill the act's one bill (round 7). */
  gradedTakesWait: number;
  /** A waiting arrival billed on its latch's first stamp (round 12) / on the held correction (round 8) — of which on its own blow frame — / still waiting when the programme ended. */
  stampEndsWait: number;
  heldEndsWait: number;
  heldEndsWaitOnBlowFrame: number;
  openAtEnd: number;
  /** A later first bill of an act already named (the stretch: one act, one bill) — absorbed by the cap itself; of a latch a billed sign-bound act took on. */
  absorbedStretchBills: number;
  signLatchBills: number;
  /** The act's one re-grade; and a re-grade clock refused because the act had reached it, or because its latch's act was not open. */
  capRegrades: number;
  capRegradesRefused: number;
  // ── WHERE THE TWO LEDGERS MEET (what the ruling is about): a cap bill within 10 s of a weather/bend bill, of a speeding bill ──
  capNearKin: number;
  capNearSpeeding: number;
  // ── THE WIDENED DOMAIN (round 13) ──
  pairFrames: number;
  gradedBlowsGateAtOrAboveSign: number;
  signBoundBlowsGlassUnderGate: number;
  gradedBlowsGlassUnderGate: number;
  betweenTheLinesFrames: number;
  overGlassUnderGateFrames: number;
  reversingFrames: number;
  reversingOverTaskLineFrames: number;
  reversingOverEnvelopeFrames: number;
  nightFrames: number;
  snowFrames: number;
  fogLampFrames: number;
  offCarriagewayFrames: number;
  bendArmRefusedOffRoad: number;
  bendBillsOffRoad: number;
  reverseBlows: number;
  reverseBlowsSignBound: number;
  reverseBlowsWaited: number;
  // ── PRAISE AND ENDINGS ──
  praises: number;
  /** Moving bill-free frames on which ONLY the sign-bound act held the streak (round 8's hold). */
  actHeldPraiseFrames: number;
  speedingEndings: number;
  pendingEndings: number;
  taskEndings: number;
  adaptationEndings: number;
}
export const emptyCoverage14 = (): Coverage14 => ({
  programmes: 0,
  frames: 0,
  bills: 0,
  speedingBills: 0,
  condBills: 0,
  condRegrades: 0,
  bendBills: 0,
  fogBills: 0,
  offCarriagewayBills: 0,
  capActs: 0,
  restores: 0,
  gradedArrivals: 0,
  signBoundBlows: 0,
  marksJoined: 0,
  laterBlowsAfterBill: 0,
  gradedTakesWait: 0,
  stampEndsWait: 0,
  heldEndsWait: 0,
  heldEndsWaitOnBlowFrame: 0,
  openAtEnd: 0,
  absorbedStretchBills: 0,
  signLatchBills: 0,
  capRegrades: 0,
  capRegradesRefused: 0,
  capNearKin: 0,
  capNearSpeeding: 0,
  pairFrames: 0,
  gradedBlowsGateAtOrAboveSign: 0,
  signBoundBlowsGlassUnderGate: 0,
  gradedBlowsGlassUnderGate: 0,
  betweenTheLinesFrames: 0,
  overGlassUnderGateFrames: 0,
  reversingFrames: 0,
  reversingOverTaskLineFrames: 0,
  reversingOverEnvelopeFrames: 0,
  nightFrames: 0,
  snowFrames: 0,
  fogLampFrames: 0,
  offCarriagewayFrames: 0,
  bendArmRefusedOffRoad: 0,
  bendBillsOffRoad: 0,
  reverseBlows: 0,
  reverseBlowsSignBound: 0,
  reverseBlowsWaited: 0,
  praises: 0,
  actHeldPraiseFrames: 0,
  speedingEndings: 0,
  pendingEndings: 0,
  taskEndings: 0,
  adaptationEndings: 0,
});

export interface Expected {
  /** Every expected bill, frame by frame (index-aligned with the programme). */
  bills: Bill[][];
  /** What a drive ending on each frame would settle. */
  endings: Ending[];
}

/**
 * THE EXPECTED OUTCOME of one programme, frame by frame.
 */
export function expectedOutcome(frames: readonly SimTick[], cov?: Coverage14, C: RuleEngineConfig = DEFAULT_CONFIG): Expected {
  // ── THE NO-CAP LEDGER'S DETECTORS ──
  const spMinor = new Continuing(C.speedingMinorSustainSec, C.speedingRearmSec, C.speedingRepeatSec, true);
  const spDang = new Continuing(C.speedingDangerousSustainSec, C.speedingRearmSec, 0, false);
  // THE SPEEDING RE-GRADE (SPEED_REGRADE_SEC = 6 s past the band's sustain), reset only by the held correction.
  const spMinorRg = new Plain(C.speedingMinorSustainSec + 6, true);
  const wx = new Plain(C.conditionsSpeedSustainSec);
  const wxRg = new Plain(C.conditionsSpeedSustainSec + 6);
  const bend = new Plain(C.curveSpeedSustainSec);
  // THE FOG LAMP DUTY (AC-03, чл. 74): a standing duty, billed after `fogLightsSustainSec` and ONCE more ten driving
  // seconds later as its re-grade (STANDING_DUTY_REGRADE_SEC = 10, STANDING_DUTY_MAX_BILLS = 2 — module constants,
  // restated), never re-armed without a correction.
  const fogDuty = new Continuing(C.fogLightsSustainSec, 0, 10, false, 2);
  // THE EXCURSION OFF THE CARRIAGEWAY (чл. 15, ал. 1): billed once the runtime has said «past the kerb» (edge null) for
  // 2 s, and once more 6 s later as its re-grade (OFF_CARRIAGEWAY_SUSTAIN_SEC = 2, OFF_CARRIAGEWAY_REGRADE_SEC = 6 —
  // module constants, restated); corrected the instant the runtime names an edge again. A car standing on the
  // placeholder origin (0, 0, at most 0.5 km/h) is not an excursion — the pose has not been reported yet.
  const offRoad = new Plain(2);
  const offRoadRg = new Plain(2 + 6);
  // ── THE CAP LEDGER'S RECORDS ──
  // The task's own clocks: its sustained first bill (the conditions duty's sustain, accrued, re-armed only on a correction
  // to the glass figure held `speedingRearmSec` — M-16) and its post-teach re-grade (SPEED_REGRADE_SEC more, reset only
  // by that held correction).
  const task = new Continuing(C.conditionsSpeedSustainSec, C.speedingRearmSec, 0, true);
  const taskRg = new Plain(C.conditionsSpeedSustainSec + 6, true);
  /** The current latch (the blow the cap's stamps and arrivals name). */
  let latch: number | null = null;
  /** THE ACT: its ONE first bill out (it is named) or not, its ONE re-grade out or not. */
  let act = { named: false, charged: false };
  const idleAct = () => ({ named: false, charged: false });
  /** Round 6: the act the latch's arrival was billed into — kept (`kept`) when it ends while that latch is current. */
  let arrivalAct: { latch: number; kept: { named: boolean; charged: boolean } | null } | null = null;
  /** A sign-bound arrival whose bill waits: its latch, the blow it will quote, the later sign-bound blows waiting with it. */
  let waiting: { latch: number; blow: Blow; later: number[] } | null = null;
  /** The sign-bound act (from a sign-bound blow to the held correction), and whether it has its one bill. */
  let signAct: { billed: boolean } | null = null;
  /** The latches a billed sign-bound act took on (round 7/10): their stretch is that act carrying on. */
  let signLatches: number[] | null = null;
  /** This file's own M-16 clock: since when the car has been at or under the sign, unbroken (null while over it). */
  let atSignSince: number | null = null;
  /** PRAISE: the clean-driving streak (metres since the last violation) and the previous frame's clock. */
  let clean = 0;
  let prevT: number | null = null;
  /** Coverage only: when the last cap bill / weather or bend bill / speeding bill fell. */
  let lastCap = -Infinity;
  let lastKin = -Infinity;
  let lastSpeeding = -Infinity;

  const out: Bill[][] = [];
  const endings: Ending[] = [];
  if (cov !== undefined) {
    cov.programmes++;
    cov.frames += frames.length;
  }
  /** THE ENDING of a drive stopped on frame `x`, the ledgers as they stand: each ledger settles its own. */
  const endingOf = (x: SimTick): Ending => {
    const t = x.t;
    const speed = Math.abs(x.speedKmh);
    const S = x.maxSpeedKmh;
    const gradedAbove = S + Math.min(S * C.speedingGraceRatio, C.speedingGraceMaxKmh);
    const dangerousAbove = S + C.dangerousSpeedOverKmh;
    const cap = x.taskSpeedCap;
    const E = envelope(x, C);
    const adv = x.curveAdvisoryKmh;
    const ending: Ending = { speeding: null, pending: null, task: null, adaptation: [] };
    if (spMinor.emitted && !spMinorRg.emitted && spMinorRg.since !== null && speed > gradedAbove && speed <= dangerousAbove) {
      ending.speeding = billKey({ t, code: OVER, kind: "regrade" });
    }
    if (waiting !== null && !act.named) ending.pending = billKey({ t, code: TASK, kind: "shown", blow: waiting.blow });
    if (act.named && !act.charged && cap !== undefined && speed > cap.capKmh + cap.graceKmh && task.emitted && taskRg.since !== null && !taskRg.emitted) {
      ending.task = billKey({ t, code: TASK, kind: "regrade" });
    }
    if (wx.emitted && wxRg.since !== null && !wxRg.emitted && E !== null && speed > E) ending.adaptation.push(billKey({ t, code: COND, kind: "regrade" }));
    if (bend.emitted && bend.since !== null && adv !== undefined && speed > adv + C.curveSpeedGraceKmh) ending.adaptation.push(billKey({ t, code: CURVE, kind: "regrade" }));
    if (cov !== undefined) {
      if (ending.speeding !== null) cov.speedingEndings++;
      if (ending.pending !== null) cov.pendingEndings++;
      if (ending.task !== null) cov.taskEndings++;
      if (ending.adaptation.length > 0) cov.adaptationEndings++;
    }
    return ending;
  };
  /** The last frame the reducer accepted: a frame whose clock runs BACKWARDS is dropped whole (its defensive rule). */
  let lastAccepted: number | null = null;
  for (const x of frames) {
    if (lastAccepted !== null && x.t < lastAccepted) {
      out.push([]);
      endings.push(endingOf(x));
      continue;
    }
    lastAccepted = x.t;
    const t = x.t;
    const v = x.speedKmh;
    const speed = Math.abs(v);
    const bills: Bill[] = [];
    const bill = (b: Bill) => bills.push(b);
    const moving = v > C.movingSpeedKmh;

    // ════ THE NO-CAP LEDGER ═══════════════════════════════════════════════════════════════════════════════════════
    // ── чл. 21: THE SIGN (base definitions; M-16) ──
    const S = x.maxSpeedKmh;
    const gradedAbove = S + Math.min(S * C.speedingGraceRatio, C.speedingGraceMaxKmh);
    const dangerousAbove = S + C.dangerousSpeedOverKmh;
    const atSign = v <= S;
    const minor = spMinor.step(v > gradedAbove && v <= dangerousAbove, atSign, t);
    if (minor !== null) bill({ t, code: OVER, kind: "shown" }); // the first bill and each 20 s rung alike
    const speedingHeld = spMinor.held(atSign, t);
    if (spMinorRg.step(v > gradedAbove && v <= dangerousAbove, speedingHeld, t)) bill({ t, code: OVER, kind: "regrade" });
    if (spDang.step(v > dangerousAbove, atSign, t) !== null) bill({ t, code: DANG, kind: "shown" });
    // ── чл. 20, ал. 2: THE WEATHER AND THE BEND (base definitions — exactly as with no cap) ──
    const E = envelope(x, C);
    const wxOver = E !== null && moving && v > E;
    const wxReset = E === null || v <= E;
    if (wx.step(wxOver, wxReset, t)) bill({ t, code: COND, kind: "shown" });
    if (wxRg.step(wxOver, wxReset, t)) bill({ t, code: COND, kind: "regrade" });
    const adv = x.curveAdvisoryKmh;
    // THE ASPHALT GATES THE ARM, NOT THE FIRE: a fresh bend episode may not open past the kerb (edgeId === null).
    const bendOver = adv !== undefined && moving && x.gear >= 0 && v > adv + C.curveSpeedGraceKmh && (bend.since !== null || x.edgeId !== null);
    const bendFirst = bend.step(bendOver, adv === undefined || v <= adv, t);
    if (bendFirst) bill({ t, code: CURVE, kind: "shown" });

    // ════ THE CAP LEDGER — cap events alone ═══════════════════════════════════════════════════════════════════════
    const cap = x.taskSpeedCap;
    const arrival = x.taskCapArrival;
    const name = cap?.blownAtSec ?? arrival?.blownAtSec;
    // THE LATCH (round 3): a name not seen before is a new blow — the task's clocks start again.
    const fresh = name !== undefined && name !== latch;
    if (fresh) {
      if (latch !== null) {
        task.since = null;
        task.emitted = false;
        task.banked = 0;
        task.lastOver = null;
        task.resetSince = null;
        task.lastBill = null;
        task.count = 0;
        taskRg.since = null;
        taskRg.emitted = false;
        taskRg.banked = 0;
        taskRg.lastOver = null;
        act = idleAct();
      }
      latch = name;
      arrivalAct = null; // round 6: a new blow never resumes the old latch's act
    }
    const taskOver = cap !== undefined && moving && v > cap.capKmh + cap.graceKmh;
    // ROUND 6 — THE KEPT ACT RESUMES on the same latch over its task line (its first bill and its charge with it).
    if (arrivalAct !== null && arrivalAct.kept !== null && taskOver && cap !== undefined && cap.blownAtSec === arrivalAct.latch) {
      if (!act.named) act = { ...arrivalAct.kept };
      arrivalAct = { latch: arrivalAct.latch, kept: null };
      if (cov !== undefined) cov.restores++;
    }
    // THE ARRIVAL (founder ruling 4): one event, on its latch's first frame, over the line its mark was blown at.
    const blown = fresh && arrival !== undefined && arrival.blownAtSec === name && Math.abs(arrival.arrivalKmh) > arrival.capKmh + arrival.graceKmh;
    // A cap the glass showed at or above the sign on the blow frame: the overspeed it names is the sign's too.
    const signBound = blown && arrival !== undefined && arrival.shownKmh >= S;
    // THIS FILE'S OWN M-16 CLOCK (the sign held for `speedingRearmSec`): no speeding episode is read.
    atSignSince = atSign ? (atSignSince ?? t) : null;
    const signHeld = atSign && atSignSince !== null && t - atSignSince >= C.speedingRearmSec;
    if (cov !== undefined) {
      if ((cap !== undefined && cap.shownKmh !== cap.capKmh) || (arrival !== undefined && arrival.shownKmh !== arrival.capKmh)) cov.pairFrames++;
      if (cap !== undefined && moving && v > cap.shownKmh + cap.graceKmh && !taskOver) cov.betweenTheLinesFrames++;
      if (cap !== undefined && v > cap.shownKmh && v <= cap.capKmh) cov.overGlassUnderGateFrames++;
      if (v < 0) {
        cov.reversingFrames++;
        if (cap !== undefined && speed > cap.capKmh + cap.graceKmh) cov.reversingOverTaskLineFrames++;
        if (E !== null && speed > E) cov.reversingOverEnvelopeFrames++;
      }
      if (x.isNight === true) cov.nightFrames++;
      if (x.snow === true) cov.snowFrames++;
      if (x.fogLightsOn === true) cov.fogLampFrames++;
      if (x.edgeId === null) cov.offCarriagewayFrames++;
      if (adv !== undefined && moving && x.gear >= 0 && v > adv + C.curveSpeedGraceKmh && !bendOver) cov.bendArmRefusedOffRoad++;
      if (bendFirst && x.edgeId === null) cov.bendBillsOffRoad++;
      if (blown && arrival !== undefined && arrival.shownKmh < arrival.capKmh) {
        if (arrival.shownKmh >= S) cov.signBoundBlowsGlassUnderGate++;
        else {
          cov.gradedBlowsGlassUnderGate++;
          if (arrival.capKmh >= S) cov.gradedBlowsGateAtOrAboveSign++;
        }
      }
      if (blown && v < 0) {
        cov.reverseBlows++;
        if (signBound) cov.reverseBlowsSignBound++;
      }
    }
    // THE SIGN-BOUND ACT (round 7/8; cap events alone): a sign-bound blow waits with an arrival already waiting, adds
    // nothing to an act that has its bill (its latch is the act's, round 10), or opens the wait.
    if (signBound && arrival !== undefined && name !== undefined) {
      const blow: Blow = { arrivalKmh: Math.abs(arrival.arrivalKmh), shownKmh: arrival.shownKmh, postedKmh: S };
      const sa: { billed: boolean } = signAct ?? { billed: false };
      if (waiting !== null) {
        waiting = { latch: waiting.latch, blow: waiting.blow, later: [...waiting.later, name] };
        if (cov !== undefined) cov.marksJoined++;
      } else if (sa.billed) {
        signLatches = [...(signLatches ?? []), name];
        if (cov !== undefined) cov.laterBlowsAfterBill++;
      } else waiting = { latch: name, blow, later: [] };
      signAct = sa;
      if (cov !== undefined) cov.signBoundBlows++;
    }
    // THE WAIT ENDS on a stamp of one of its latches (round 12) or on the held correction (round 8) — this frame included.
    let handed: { latch: number; blow: Blow } | null = null;
    if (waiting !== null) {
      const latches = [waiting.latch, ...waiting.later];
      const opened = blown && signBound && waiting.latch === name;
      if (cap !== undefined && latches.includes(cap.blownAtSec)) {
        handed = { latch: cap.blownAtSec, blow: waiting.blow };
        waiting = null;
        if (cov !== undefined) cov.stampEndsWait++;
      } else if (signHeld) {
        handed = { latch: waiting.latch, blow: waiting.blow };
        waiting = null;
        if (cov !== undefined) {
          cov.heldEndsWait++;
          if (opened) cov.heldEndsWaitOnBlowFrame++;
        }
      } else if (cov !== undefined && opened && v < 0) cov.reverseBlowsWaited++;
    }
    if (signAct !== null && signHeld) signAct = null;
    const arrivalBill = (blown && !signBound) || handed !== null;
    const arrivalLatch: number | undefined = handed !== null ? handed.latch : name;
    if (cov !== undefined && blown && !signBound) {
      cov.gradedArrivals++;
      if (waiting !== null) cov.gradedTakesWait++;
    }
    // The task's own clocks (a stamp that goes missing is a reset like any other).
    const taskReset = cap === undefined || v <= cap.shownKmh;
    const taskFirst = task.step(taskOver, taskReset, t) === "first";
    const taskHeld = task.held(taskReset, t);
    const taskRegrade = taskRg.step(taskOver, taskHeld, t);
    // ONE FIRST BILL PER ACT: the first bill names the act and is shown; every later first bill is the act carrying on —
    // and so is the stretch of a latch a billed sign-bound act took on.
    const carries = !arrivalBill && signLatches !== null && latch !== null && signLatches.includes(latch);
    const wasNamed = act.named;
    if (!wasNamed && ((taskFirst && !carries) || arrivalBill)) {
      act = { ...act, named: true };
      if (cov !== undefined) cov.capActs++;
    }
    if (taskFirst || arrivalBill) {
      const b: Bill = { t, code: TASK, kind: carries || wasNamed ? "absorbed" : "shown", ...(handed !== null ? { blow: handed.blow } : {}) };
      bill(b);
      if (cov !== undefined && b.kind === "absorbed") {
        if (carries) cov.signLatchBills++;
        else cov.absorbedStretchBills++;
      }
      if (arrivalBill && arrivalLatch !== undefined) arrivalAct = { latch: arrivalLatch, kept: null };
      waiting = null;
      if (signAct !== null) signAct = { billed: true };
    }
    // ONE RE-GRADE PER ACT — through an open act, for a latch a billed sign-bound act took on.
    if (taskRegrade) {
      if ((!carries || act.named) && !act.charged) {
        bill({ t, code: TASK, kind: "regrade" });
        act = { ...act, charged: true };
        if (cov !== undefined) cov.capRegrades++;
      } else if (cov !== undefined) cov.capRegradesRefused++;
    }
    // THE ACT ENDS when the task's episode is no longer live; its arrival's latch still current, it is KEPT (round 6).
    if (!task.live) {
      if (arrivalAct !== null && arrivalAct.kept === null && act.named) arrivalAct = { latch: arrivalAct.latch, kept: { ...act } };
      act = idleAct();
    }
    // …and the latches a billed sign-bound act took on are free again once the WHOLE act has ended (round 10).
    if (signLatches !== null && signAct === null && !task.live) {
      if (arrivalAct !== null && signLatches.includes(arrivalAct.latch)) arrivalAct = null;
      signLatches = null;
    }

    // ════ THE NO-CAP LEDGER, continued: the lamp duty and the excursion (after the speed codes, as the reducer orders them) ═══
    const foggy = x.fog === true;
    if (fogDuty.step(foggy && x.fogLightsOn !== true && moving, !foggy || x.fogLightsOn === true, t) !== null) {
      bill({ t, code: FOG, kind: fogDuty.count > 1 ? "regrade" : "shown" });
      if (cov !== undefined) cov.fogBills++;
    }
    const placeholder = x.position.x === 0 && x.position.y === 0 && speed <= 0.5;
    const offNow = x.edgeId === null && !placeholder;
    const backOn = typeof x.edgeId === "string";
    if (offRoad.step(offNow, backOn, t)) {
      bill({ t, code: OFF, kind: "shown" });
      if (cov !== undefined) cov.offCarriagewayBills++;
    }
    if (offRoadRg.step(offNow, backOn, t)) {
      bill({ t, code: OFF, kind: "regrade" });
      if (cov !== undefined) cov.offCarriagewayBills++;
    }

    // ── PRAISE — CLEAN_DRIVING, the base rule (A12), and what the cap may WITHHOLD ──
    // Every CLEAN_DRIVING_DISTANCE of moving metres with no violation pays one commendation. A violation of ANY kind on
    // the frame (an absorbed cap bill included — it is an event) or a NEW task latch (round 3, R4: the blow is the
    // breach) resets the streak. GATE 1 — nothing is banked while a billed episode is uncorrected (emitted, and still
    // over or its band's seconds kept), the task's own included, or while a sign-bound act runs (round 8). GATE 2 — a
    // payout waits while a breach whose every instant is unlawful is live and has not yet run its sustain (the sign's
    // bands, the weather envelope, the task's line, the fog lamps; the bend is left out on purpose, as the engine
    // documents).
    const gate1 = [spMinor, spDang, wx, task, fogDuty, bend, offRoad].some((e) => e.billedUncorrected) || signAct !== null;
    const gate2 = [spMinor, spDang, wx, task, fogDuty].some((e) => e.since !== null);
    if (cov !== undefined && bills.length === 0 && !fresh && moving && signAct !== null && ![spMinor, spDang, wx, task, fogDuty, bend, offRoad].some((e) => e.billedUncorrected)) cov.actHeldPraiseFrames++;
    if (bills.length > 0 || fresh) clean = 0;
    else if (!gate1 && moving && prevT !== null) {
      clean += (v / 3.6) * Math.min(t - prevT, 2);
      if (clean >= C.cleanDrivingDistanceM && !gate2) {
        clean -= C.cleanDrivingDistanceM;
        bill({ t, code: PRAISE, kind: "praise" });
        if (cov !== undefined) cov.praises++;
      }
    }
    prevT = t;
    out.push(bills);
    if (cov !== undefined) {
      cov.bills += bills.length;
      for (const b of bills) {
        if (b.code === OVER || b.code === DANG) {
          cov.speedingBills++;
          lastSpeeding = t;
        }
        if (b.code === COND) {
          if (b.kind === "regrade") cov.condRegrades++;
          else cov.condBills++;
          lastKin = t;
        }
        if (b.code === CURVE) {
          cov.bendBills++;
          lastKin = t;
        }
      }
      if (bills.some((b) => b.code === TASK && b.kind !== "absorbed")) {
        if (t - lastKin <= 10) cov.capNearKin++;
        if (t - lastSpeeding <= 10) cov.capNearSpeeding++;
        lastCap = t;
      } else if (bills.some((b) => b.code === COND || b.code === CURVE) && t - lastCap <= 10) cov.capNearKin++;
      else if (bills.some((b) => b.code === OVER || b.code === DANG) && t - lastCap <= 10) cov.capNearSpeeding++;
    }

    endings.push(endingOf(x));
  }
  if (cov !== undefined && waiting !== null) cov.openAtEnd++;
  return { bills: out, endings };
}
