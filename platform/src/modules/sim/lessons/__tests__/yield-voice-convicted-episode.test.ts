/**
 * A CONVICTED WAIT IS NOT PRAISED — `sc-roundabout-entry:8be266cf` (critical,
 * filed from the w49 re-drive at 98bf8ae).
 *
 * THE FRAMES: `.audit-frames/w49/frames/sc-roundabout-entry__pc-right/`
 *   04-t059s  0 км/ч. The advisor card «Чакаш правилно — в кръга имат
 *             предимство» sits directly over «ОПАСНА ГРЕШКА −10 изпитни т. ·
 *             Влизане без пропускане», booked «преди 2 с».
 *   04-t064s  5 км/ч. НАУЧИ «Интервалът беше добър · Изчака 33 с и влезе — и
 *             при влизането не беше отчетено нарушение на предимството».
 *
 * ROUND 2 — THE HYPOTHESIS, VERIFIED ON THE REAL ENGINE BEFORE ANY CODE
 * CHANGED. `applyTick` through wait 30 s → pull off → FAILED_TO_YIELD → stop
 * inside YIELD_VOICE_EPISODE_GAP_S → pull off again printed, at the shipped
 * advisor.ts:
 *
 *   31.7 violation Влизане без пропускане
 *   voice {"reason":"roundaboutEntry",…,"spoken":2,"pending":null}
 *   card@35.1: Чакаш правилно — в кръга имат предимство. …
 *   39.2 lesson Интервалът беше добър
 *
 * — the mute dropped the verdict pending on the conviction frame and remembered
 * nothing; the stop resumed the same episode clean; the second departure earned
 * the verdict. The conviction memory closed that ORDER.
 *
 * ROUND 3 — THE OTHER ORDER, which the round-2 verifier reproduced on the fixed
 * engine and this lane reproduced again before writing a line: the same drive,
 * off at 3 км/ч, the barge billed N seconds after the wheels turn.
 *
 *   N = 0, 2, 4   the conviction, no praise
 *   N = 4.1       32.2 «Интервалът беше добър» · 32.3 «Влизане без пропускане»
 *   N = 6         32.2 praise · 34.2 fault
 *   N = 10        32.2 praise · 38.2 fault
 *
 * The verdict clock ran from the wheels turning; the entry adjudicator's does
 * not (advisor.ts YIELD_VOICE_RING_ENTRY_ARC_DEG has the derivation). The
 * verdict now waits for the ENTRY — the car 45° round the island it stood at —
 * which needs one fact the voice was never handed: where the car is.
 *
 * ⚠ THE BLOCKS MARKED [E1] DRIVE THE REAL `applyTick` AND NEED `engine.ts` TO
 * HAND `stepYieldVoice` ITS SITE (`site: yieldVoiceSiteAt(objectives,
 * tick.position)`, reported with this lane — engine.ts is not its file). Until
 * that line lands they are RED, and that is the point: without it every change
 * to the verdict gate is a predicate nothing live reads, and a green file would
 * say otherwise. The blocks marked [fold] exercise `stepYieldVoice` itself and
 * are green either way.
 */

import { describe, expect, it } from "vitest";
import {
  YIELD_VOICE_EPISODE_GAP_S,
  YIELD_VOICE_MUTE_CODES,
  YIELD_VOICE_NAME_S,
  YIELD_VOICE_RING_ENTRY_ARC_DEG,
  YIELD_VOICE_SAME_SITE_M,
  YIELD_VOICE_SETTLE_S,
  YIELD_VOICE_VERDICT_S,
  advisorPromptForSession,
  createYieldVoice,
  muteCodeConvictsDuty,
  muteCodeGradesThisDuty,
  stepYieldVoice,
  yieldEpisodeConvicted,
  yieldVoiceSiteAt,
  yieldWaitAdvisorPrompt,
  type YieldVoiceSite,
} from "../advisor";
import { applyTick, createLessonSession } from "../engine";
import { YIELD_ROUNDABOUT_APPROACH_M, createYieldWait } from "../finish";
import { compileScenario } from "../scenario/compile";
import { SC_ROUNDABOUT_ENTRY } from "../scenario/templates-flow";
import type { HudEvent } from "../../contracts";
import type { SimTickEvent, ViolationCode } from "../../rules";
import type { LessonSessionState, YieldReason, YieldVoiceState, YieldWaitState } from "../types";
import { makeTick } from "./fixtures";

/** The photographed drill, as a student's L1 compiles. */
const LESSON = compileScenario(SC_ROUNDABOUT_ENTRY, 1);
/** rb-mini-v1's approach lane and the painted give-way bars (yield-voice.test.ts). */
const LANE_X = 4.06;
const PAINT_Y = -35.725;
/**
 * The lane the drive circulates on: 18.5 m about the island (0, 0) — inside
 * the ring objective's 24 m entry circle, and the radius the committed
 * `sc-rb-busy-gap` shadow tape rides (d 18.1–18.4 m on the ring).
 */
const RING_LANE_R = 18.5;
const ENTER_RADIUS_M = 24;

/** What the runtime's roundabout adjudicator emits for a barged entry. */
const BARGE: SimTickEvent = { kind: "prioritySituation", situation: "roundabout", violated: true };

type Said = { t: number; kind: string; titleBg: string };

/** stepRoundabout's azimuth convention (and `yieldVoiceSiteAt`'s). */
const azimuthDeg = (x: number, y: number): number => (Math.atan2(x, -y) * 180) / Math.PI;

class Drive {
  s: LessonSessionState = createLessonSession(LESSON);
  t = 0;
  x = LANE_X;
  y = PAINT_Y;
  said: Said[] = [];
  /** Absolute session time the barge is billed on (the first frame at or after it). */
  billAt: number | null = null;
  billed = false;
  /** Every frame's pose, for „where was the car when the verdict spoke". */
  poses: Array<{ t: number; x: number; y: number }> = [];

  constructor() {
    // Frame 1 describes the vehicle at its spawn (the engine's pose guard).
    this.frame(-93, 0);
    this.t = 0.1;
    this.frame(-50, 18);
    this.x = LANE_X;
    this.y = PAINT_Y;
  }

  frame(y: number, speedKmh: number, events: SimTickEvent[] = [], x = LANE_X): void {
    const bill = this.billAt !== null && !this.billed && this.t >= this.billAt - 1e-9;
    if (bill) this.billed = true;
    const r = applyTick(
      this.s,
      makeTick({ t: this.t, position: { x, y }, speedKmh, events: bill ? [...events, BARGE] : events }),
    );
    this.s = r.state;
    this.poses.push({ t: this.t, x, y });
    for (const e of r.hudEvents as HudEvent[]) {
      if (e.kind === "lesson" || e.kind === "violation") this.said.push({ t: this.t, kind: e.kind, titleBg: e.titleBg });
    }
  }

  private tick(): void {
    this.t = +(this.t + 0.1).toFixed(1);
  }

  /** Stand where the car is for `sec`. */
  stand(sec: number): this {
    for (let i = 0; i < Math.round(sec * 10); i++) {
      this.tick();
      this.frame(this.y, 0, [], this.x);
    }
    return this;
  }

  /**
   * Stand for `sec`, reporting `events` once on the first frame at or after
   * SESSION time `atT` — how the [B2] block bills a code the roundabout
   * adjudicator never emits (a `collision`) during an otherwise lawful wait.
   */
  standWith(sec: number, atT: number, events: SimTickEvent[]): this {
    let fired = false;
    for (let i = 0; i < Math.round(sec * 10); i++) {
      this.tick();
      const fire = !fired && this.t >= atT - 1e-9;
      if (fire) fired = true;
      this.frame(this.y, 0, fire ? events : [], this.x);
    }
    return this;
  }

  /** Roll straight up the approach lane at `kmh`, billing a barge on frame `bargeAt` (0-based) if given. */
  roll(sec: number, kmh: number, bargeAt?: number): this {
    for (let i = 0; i < Math.round(sec * 10); i++) {
      this.tick();
      this.y += (kmh / 3.6) * 0.1;
      this.frame(this.y, kmh, i === bargeAt ? [BARGE] : [], this.x);
    }
    return this;
  }

  /**
   * Drive on at `kmh`: up the approach lane to the circulating lane, then round
   * the island (azimuth increasing, the way the ring runs) until `untilAzDeg`.
   */
  intoTheRing(kmh: number, untilAzDeg: number): this {
    const step = (kmh / 3.6) * 0.1;
    const joinY = -Math.sqrt(RING_LANE_R * RING_LANE_R - LANE_X * LANE_X);
    for (let guard = 0; guard < 2000; guard++) {
      this.tick();
      if (this.y < joinY && this.x === LANE_X) {
        this.y = Math.min(joinY, this.y + step);
      } else {
        const az = azimuthDeg(this.x, this.y) + (step / RING_LANE_R) * (180 / Math.PI);
        this.x = RING_LANE_R * Math.sin((az * Math.PI) / 180);
        this.y = -RING_LANE_R * Math.cos((az * Math.PI) / 180);
      }
      this.frame(this.y, kmh, [], this.x);
      if (this.x !== LANE_X && azimuthDeg(this.x, this.y) >= untilAzDeg) break;
    }
    return this;
  }

  lessonsAfter(t: number): Said[] {
    return this.said.filter((x) => x.kind === "lesson" && x.t > t);
  }

  verdicts(): Said[] {
    return this.said.filter((x) => x.kind === "lesson" && x.titleBg === "Интервалът беше добър");
  }

  faults(): Said[] {
    return this.said.filter((x) => x.kind === "violation" && x.titleBg === "Влизане без пропускане");
  }

  poseAt(t: number): { x: number; y: number } {
    return this.poses.find((p) => Math.abs(p.t - t) < 1e-6)!;
  }
}

const HOLD_AZ_DEG = azimuthDeg(LANE_X, PAINT_Y);

/**
 * Is this pose the entry the verdict describes — inside the entry circle and
 * 45° round the island from where the car stood (`stood`: its pose on the
 * frame the wheels turned, which is the pose the voice records)?
 */
function enteredAt(p: { x: number; y: number }, stood: { x: number; y: number }): boolean {
  return (
    Math.hypot(p.x, p.y) <= ENTER_RADIUS_M &&
    azimuthDeg(p.x, p.y) - azimuthDeg(stood.x, stood.y) >= YIELD_VOICE_RING_ENTRY_ARC_DEG
  );
}

// ---------------------------------------------------------------------------
// ROUND 3 — the verdict waits for the entry it describes
// ---------------------------------------------------------------------------

describe("[E1] the wiring — engine.ts hands the voice where the car is", () => {
  it("a conviction is remembered WITH the site it was billed at", () => {
    // Without the engine line this is `undefined`, and every block below that
    // depends on a site is testing a gate no live frame can reach.
    const d = new Drive().stand(3).roll(2, 3, 15);
    const c = d.s.yieldVoice?.recentConvictions?.[0];
    expect(c, "the barge must be remembered at all").toBeDefined();
    expect(c!.x, "engine.ts must pass `site: yieldVoiceSiteAt(objectives, tick.position)`").toBeCloseTo(LANE_X, 6);
    expect(c!.y).toBeCloseTo(d.poseAt(c!.atSec).y, 6);
  });
});

describe("[E1] the reproduced race — off at 3 км/ч, billed N seconds after the wheels turn", () => {
  /** 28 s at the line; off at 3 км/ч for 3 s; on at 10 км/ч into the ring and 120° round it. */
  function raceDrive(billAfterSec: number | null): { d: Drive; wentAt: number } {
    const d = new Drive().stand(28);
    const wentAt = +(d.t + 0.1).toFixed(1);
    if (billAfterSec !== null) d.billAt = wentAt + billAfterSec;
    d.roll(3, 3);
    d.intoTheRing(10, 120);
    return { d, wentAt };
  }

  for (const n of [0, 2, 4, 4.1, 6, 10]) {
    it(`N = ${n}: the fault is booked and «Интервалът беше добър» is never spoken — in either order`, () => {
      const { d, wentAt } = raceDrive(n);
      const faults = d.faults();
      expect(faults, "the premise: the barge is graded").toHaveLength(1);
      expect(faults[0].t).toBeGreaterThanOrEqual(wentAt + n - 1e-6);
      expect(d.verdicts().map((v) => `${v.t} ${v.titleBg}`)).toEqual([]);
    });
  }

  it("NEGATIVE CONTROL: the same drive without the barge IS told its gap was good — once, and only after the entry", () => {
    // Without this, every row above passes on a voice that has simply gone
    // quiet — which would be a THEO-4 loss on every clean roundabout wait.
    const { d, wentAt } = raceDrive(null);
    expect(d.faults()).toEqual([]);
    const verdicts = d.verdicts();
    expect(verdicts).toHaveLength(1);
    const at = verdicts[0].t;
    expect(at - wentAt).toBeGreaterThanOrEqual(YIELD_VOICE_VERDICT_S);
    const stood = d.poseAt(wentAt);
    expect(enteredAt(d.poseAt(at), stood), "the verdict speaks on the ring, 45° round from the paint").toBe(true);
    // …and not a frame later than it could: the frame before it was not yet the entry.
    expect(enteredAt(d.poseAt(+(at - 0.1).toFixed(1)), stood)).toBe(false);
  });

  it("the verifier's own drive — a constant 3 км/ч creep that never reaches the ring — says «влезе» of nothing", () => {
    for (const n of [null, 0, 2, 4, 4.1, 6, 10]) {
      const d = new Drive().stand(28);
      const wentAt = +(d.t + 0.1).toFixed(1);
      if (n !== null) d.billAt = wentAt + n;
      d.roll(12, 3);
      expect(d.verdicts(), `N = ${n}`).toEqual([]);
      if (n !== null) expect(d.faults(), `N = ${n}`).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// ROUND 2 — the frame's drive, with the entry now driven rather than assumed
// ---------------------------------------------------------------------------

/** The 04-t059s / 04-t064s drive: ~30 s at the line (28 here, under the long card), off, barge, stop, off again. */
function theFrameDrive(barge: boolean): { d: Drive; convictedAt: number; card: string | undefined; wentAgainAt: number } {
  const d = new Drive().stand(28);
  expect(advisorPromptForSession(d.s)?.textBg, "the premise: a clean wait is praised").toBe(
    yieldWaitAdvisorPrompt("roundaboutEntry").textBg,
  );
  // Off at a crawl — 3 км/ч is the frame's own 04-t053s — and billed 1.5 s in.
  d.roll(2, 3, barge ? 15 : undefined);
  const convictedAt = d.t - 0.4;
  // Stopped again two seconds after the bill, well inside the episode gap.
  d.stand(3);
  expect(d.s.yieldWait?.holding, "the stop must be a lawful hold again, as 04-t059s is").toBe(true);
  const card = advisorPromptForSession(d.s)?.textBg;
  // …and off again, cleanly, onto the ring and far enough round it for any
  // verdict to land.
  const wentAgainAt = +(d.t + 0.1).toFixed(1);
  d.intoTheRing(10, 120);
  return { d, convictedAt, card, wentAgainAt };
}

describe("[E1] the frame's drive, through applyTick", () => {
  it("the fault really is booked — this is not a drive the grader acquitted", () => {
    const { d } = theFrameDrive(true);
    expect(d.said.some((x) => x.kind === "violation" && x.titleBg === "Влизане без пропускане")).toBe(true);
  });

  it("04-t059s: the card over the conviction no longer approves of the wait", () => {
    const { card } = theFrameDrive(true);
    expect(card).toBeDefined();
    expect(card).not.toMatch(/правилно/u);
    // …and it is still the duty and the act, not silence and not the waypoint.
    expect(card).toBe(yieldWaitAdvisorPrompt("roundaboutEntry", undefined, true).textBg);
    expect(card).toContain("в кръга имат предимство".replace(/^в/u, "В"));
    expect(card).toContain("Гледай НАЛЯВО");
  });

  it("04-t064s: no «Интервалът беше добър» — nor any other praise — for that episode", () => {
    const { d, convictedAt } = theFrameDrive(true);
    const after = d.lessonsAfter(convictedAt);
    expect(after.map((x) => x.titleBg)).toEqual([]);
  });

  it("the voice's memory is what the card read — one memory, two surfaces", () => {
    const d = new Drive().stand(28).roll(2, 3, 15).stand(3);
    const voice: YieldVoiceState | undefined = d.s.yieldVoice;
    expect(voice?.convicted).toBe(true);
    expect(yieldEpisodeConvicted(d.s, "roundaboutEntry")).toBe(true);
    // A different duty is not this episode.
    expect(yieldEpisodeConvicted(d.s, "pedestrian")).toBe(false);
  });

  it("NEGATIVE CONTROL: the same drive without the bill is praised and earns its verdict — on the ring", () => {
    // Without this every assertion above could be passing on a drive where the
    // stop never resumed the episode or the second departure never qualified.
    const { d, convictedAt, card, wentAgainAt } = theFrameDrive(false);
    expect(d.said.some((x) => x.kind === "violation")).toBe(false);
    expect(card).toBe(yieldWaitAdvisorPrompt("roundaboutEntry").textBg);
    const verdicts = d.lessonsAfter(convictedAt).filter((x) => x.titleBg === "Интервалът беше добър");
    expect(verdicts).toHaveLength(1);
    expect(enteredAt(d.poseAt(verdicts[0].t), d.poseAt(wentAgainAt))).toBe(true);
  });
});

describe("[E1] a barge billed on the way IN convicts the wait it brakes into", () => {
  it("no «Защо чакаш… Спрял си правилно», and no approving card", () => {
    const d = new Drive();
    d.y = PAINT_Y - 6;
    // Rolls up to the line without ever standing, and is billed on the way.
    d.roll(1, 20, 5);
    const billedAt = d.t;
    d.y = PAINT_Y;
    d.stand(12);
    expect(d.s.yieldWait?.holding).toBe(true);
    expect(d.lessonsAfter(billedAt - 1)).toEqual([]);
    expect(advisorPromptForSession(d.s)?.textBg).not.toMatch(/правилно/u);
  });
});

// ---------------------------------------------------------------------------
// [fold] `stepYieldVoice` on its own — the edges the drives above do not reach
// ---------------------------------------------------------------------------

const held = (reason: YieldReason, sinceSec: number): YieldWaitState => ({
  holding: true,
  sinceSec,
  reason,
  pedestrianCrossingIds: [],
});

/** The compiled lesson's own objectives — the ring at (0, 0), entry circle 24 m. */
const OBJECTIVES = createLessonSession(LESSON).objectives;
const siteAt = (x: number, y: number): YieldVoiceSite => yieldVoiceSiteAt(OBJECTIVES, { x, y });
/** A pose on the circulating lane, `azDeg` round the island. */
const onTheRing = (azDeg: number): YieldVoiceSite =>
  siteAt(RING_LANE_R * Math.sin((azDeg * Math.PI) / 180), -RING_LANE_R * Math.cos((azDeg * Math.PI) / 180));

describe("[fold] yieldVoiceSiteAt — where, off the route's own objectives", () => {
  it("names the ring objective's island, its entry circle, and the stepRoundabout azimuth", () => {
    const at = siteAt(LANE_X, PAINT_Y);
    expect(at).toMatchObject({ x: LANE_X, y: PAINT_Y });
    expect(at.ring).not.toBeNull();
    expect(at.ring!).toMatchObject({ x: 0, y: 0, enterRadiusM: ENTER_RADIUS_M });
    expect(at.ring!.dM).toBeCloseTo(Math.hypot(LANE_X, PAINT_Y), 9);
    expect(at.ring!.azDeg).toBeCloseTo(HOLD_AZ_DEG, 9);
  });

  it("a route that drives no ring has none — and a missing ring is never an entry", () => {
    const none = yieldVoiceSiteAt([], { x: 1, y: 2 });
    expect(none).toEqual({ x: 1, y: 2, ring: null });
  });
});

/** A clean 20 s roundabout wait, told about, released at t = 20 by pulling off. */
function releasedWait(site: YieldVoiceSite | undefined): YieldVoiceState {
  let v: YieldVoiceState = createYieldVoice();
  const at = site;
  v = stepYieldVoice(v, { t: 1, speedKmh: 0, wait: held("roundaboutEntry", 0), violations: [], site: at }).state;
  v = stepYieldVoice(v, { t: 19.9, speedKmh: 0, wait: held("roundaboutEntry", 0), violations: [], site: at }).state;
  return stepYieldVoice(v, { t: 20, speedKmh: 3, wait: createYieldWait(), violations: [], site: at }).state;
}

describe("[fold] the verdict gate", () => {
  it("NO SITE: the time window alone, exactly as before — callers that cannot say are unchanged", () => {
    let v = releasedWait(undefined);
    expect(v.pending?.ring).toBeUndefined();
    const early = stepYieldVoice(v, { t: 20 + YIELD_VOICE_VERDICT_S - 0.1, speedKmh: 3, wait: createYieldWait(), violations: [] });
    expect(early.notices).toEqual([]);
    v = early.state;
    const due = stepYieldVoice(v, { t: 20 + YIELD_VOICE_VERDICT_S, speedKmh: 3, wait: createYieldWait(), violations: [] });
    expect(due.notices.map((n) => n.titleBg)).toEqual(["Интервалът беше добър"]);
  });

  it("WITH A SITE: not at four seconds, not in the mouth, not short of the arc — on the ring, 45° round", () => {
    let v = releasedWait(siteAt(LANE_X, PAINT_Y));
    expect(v.pending?.ring).toEqual({ x: 0, y: 0, azDeg: HOLD_AZ_DEG });
    const go = (t: number, site: YieldVoiceSite) => {
      const r = stepYieldVoice(v, { t, speedKmh: 8, wait: createYieldWait(), violations: [], site });
      v = r.state;
      return r.notices.map((n) => n.titleBg);
    };
    // Four seconds after the wheels turned, still on the approach: the old verdict frame.
    expect(go(24, siteAt(LANE_X, PAINT_Y + 4))).toEqual([]);
    // In the mouth — inside the entry circle, a few degrees round: `entered`, not an entry.
    expect(go(26, siteAt(LANE_X, -20))).toEqual([]);
    // On the lane, one degree short.
    expect(go(28, onTheRing(HOLD_AZ_DEG + YIELD_VOICE_RING_ENTRY_ARC_DEG - 1))).toEqual([]);
    expect(v.pending).not.toBeNull();
    // Far enough round: now it may say «влезе».
    expect(go(29, onTheRing(HOLD_AZ_DEG + YIELD_VOICE_RING_ENTRY_ARC_DEG + 0.5))).toEqual(["Интервалът беше добър"]);
    expect(v.pending).toBeNull();
  });

  it("the entry happening BEFORE four seconds still waits out the adjudication floor", () => {
    let v = releasedWait(siteAt(LANE_X, PAINT_Y));
    const r = stepYieldVoice(v, { t: 22, speedKmh: 20, wait: createYieldWait(), violations: [], site: onTheRing(80) });
    expect(r.notices).toEqual([]);
    v = r.state;
    const due = stepYieldVoice(v, { t: 24, speedKmh: 20, wait: createYieldWait(), violations: [], site: onTheRing(90) });
    expect(due.notices.map((n) => n.titleBg)).toEqual(["Интервалът беше добър"]);
  });

  it("a barge on the ring's approach, at ANY delay, drops the verdict before it could speak", () => {
    for (const n of [0, 2, 4, 4.1, 6, 10]) {
      let v = releasedWait(siteAt(LANE_X, PAINT_Y));
      const notices: string[] = [];
      // N = 0 is the first frame after the release frame `releasedWait` folded.
      const billT = Math.max(20.1, +(20 + n).toFixed(1));
      for (let t = 20.1; t <= billT + 1e-9; t = +(t + 0.1).toFixed(1)) {
        // A 3 км/ч creep toward the mouth — never 45° round anything.
        const y = PAINT_Y + (3 / 3.6) * (t - 20);
        const r = stepYieldVoice(v, {
          t,
          speedKmh: 3,
          wait: createYieldWait(),
          violations: Math.abs(t - billT) < 0.05 ? ["FAILED_TO_YIELD"] : [],
          site: siteAt(LANE_X, y),
        });
        notices.push(...r.notices.map((x) => x.titleBg));
        v = r.state;
      }
      expect(notices, `N = ${n}`).toEqual([]);
      expect(v.pending, `N = ${n}`).toBeNull();
    }
  });

  it("a departure that leaves the ring's approach is dropped unjudged — nobody is told he entered", () => {
    let v = releasedWait(siteAt(LANE_X, PAINT_Y));
    // Backed off down the arm past the approach the hold is defined over.
    const away = -(ENTER_RADIUS_M + YIELD_ROUNDABOUT_APPROACH_M + 1);
    const r = stepYieldVoice(v, { t: 25, speedKmh: 6, wait: createYieldWait(), violations: [], site: siteAt(LANE_X, away) });
    expect(r.notices).toEqual([]);
    expect(r.state.pending).toBeNull();
    v = r.state;
    // …so a later lap of the ring cannot resurrect it.
    const later = stepYieldVoice(v, { t: 40, speedKmh: 12, wait: createYieldWait(), violations: [], site: onTheRing(120) });
    expect(later.notices).toEqual([]);
  });

  it("only a ring wait records where it stood — every other duty keeps the time window", () => {
    let v: YieldVoiceState = createYieldVoice();
    const site = siteAt(LANE_X, PAINT_Y);
    v = stepYieldVoice(v, { t: 1, speedKmh: 0, wait: held("giveWayLine", 0), violations: [], site }).state;
    v = stepYieldVoice(v, { t: 3, speedKmh: 0, wait: held("giveWayLine", 0), violations: [], site }).state;
    v = stepYieldVoice(v, { t: 5, speedKmh: 4, wait: createYieldWait(), violations: [], site }).state;
    expect(v.pending).not.toBeNull();
    expect(v.pending!.ring).toBeUndefined();
    const due = stepYieldVoice(v, { t: 5 + YIELD_VOICE_VERDICT_S, speedKmh: 12, wait: createYieldWait(), violations: [], site });
    expect(due.notices).toHaveLength(1);
  });
});

describe("[fold] the conviction's lifetime", () => {
  it("the NEXT junction is explained from the top again", () => {
    // The memory may not become a gag on the rest of the drive.
    let v: YieldVoiceState = createYieldVoice();
    v = stepYieldVoice(v, { t: 1, speedKmh: 0, wait: held("giveWayLine", 0), violations: [] }).state;
    v = stepYieldVoice(v, { t: 3, speedKmh: 8, wait: createYieldWait(), violations: [] }).state;
    v = stepYieldVoice(v, { t: 4, speedKmh: 12, wait: createYieldWait(), violations: ["FAILED_TO_YIELD"] }).state;
    expect(v.convicted).toBe(true);
    const later = 4 + YIELD_VOICE_EPISODE_GAP_S + 5;
    for (let t = 5; t < later; t++) {
      v = stepYieldVoice(v, { t, speedKmh: 30, wait: createYieldWait(), violations: [] }).state;
    }
    expect(v.convicted).toBeUndefined();
    const first = stepYieldVoice(v, { t: later, speedKmh: 0, wait: held("giveWayLine", later), violations: [] });
    const named = stepYieldVoice(first.state, {
      t: later + YIELD_VOICE_NAME_S + 0.1,
      speedKmh: 0,
      wait: held("giveWayLine", later),
      violations: [],
    });
    expect(named.notices.map((n) => n.titleBg)).toEqual(["Защо чакаш: знак Б1 „Пропусни движението“"]);
  });

  it("a conviction on the way in speaks only for the duty it grades", () => {
    // A rolled Б2, then a correct stop for a pedestrian a few metres on: the
    // pedestrian's explanation is a DIFFERENT duty and is still owed.
    const nameAfter = (code: "STOP_SIGN_NO_FULL_STOP", reason: YieldReason) => {
      let v: YieldVoiceState = createYieldVoice();
      v = stepYieldVoice(v, { t: 1, speedKmh: 9, wait: createYieldWait(), violations: [code] }).state;
      v = stepYieldVoice(v, { t: 4, speedKmh: 0, wait: held(reason, 4), violations: [] }).state;
      return stepYieldVoice(v, { t: 4 + YIELD_VOICE_NAME_S + 0.1, speedKmh: 0, wait: held(reason, 4), violations: [] });
    };
    expect(nameAfter("STOP_SIGN_NO_FULL_STOP", "pedestrian").notices.map((n) => n.titleBg)).toEqual([
      "Защо чакаш: пешеходец на пътеката",
    ]);
    const atTheLine = nameAfter("STOP_SIGN_NO_FULL_STOP", "stopSign");
    expect(atTheLine.notices).toEqual([]);
    expect(atTheLine.state.convicted).toBe(true);
  });

  it("…and, where the caller says where, only for the SITE it was billed at (the round-2 verifier's THEO-4 note)", () => {
    // A FAILED_TO_YIELD at one Б1 junction, then a correct stop at a DIFFERENT
    // Б1 line eight seconds later: duty alone cannot tell the two lines apart.
    const nameAfter = (billedAt: { x: number; y: number } | undefined, stopAt: { x: number; y: number } | undefined) => {
      const site = (p: { x: number; y: number } | undefined) => (p === undefined ? undefined : { ...p, ring: null });
      let v: YieldVoiceState = createYieldVoice();
      v = stepYieldVoice(v, { t: 1, speedKmh: 14, wait: createYieldWait(), violations: ["FAILED_TO_YIELD"], site: site(billedAt) }).state;
      v = stepYieldVoice(v, { t: 9, speedKmh: 0, wait: held("giveWayLine", 9), violations: [], site: site(stopAt) }).state;
      return stepYieldVoice(v, { t: 9 + YIELD_VOICE_NAME_S + 0.1, speedKmh: 0, wait: held("giveWayLine", 9), violations: [], site: site(stopAt) });
    };
    const B1_TITLE = "Защо чакаш: знак Б1 „Пропусни движението“";
    // The other junction, well past one approach away: its duty is explained.
    const other = nameAfter({ x: 0, y: 0 }, { x: 0, y: YIELD_VOICE_SAME_SITE_M + 30 });
    expect(other.notices.map((n) => n.titleBg)).toEqual([B1_TITLE]);
    expect(other.state.convicted).toBeUndefined();
    // The same junction — braked into a stop a car length from the bill: silent.
    const same = nameAfter({ x: 0, y: 0 }, { x: 0, y: 4 });
    expect(same.notices).toEqual([]);
    expect(same.state.convicted).toBe(true);
    // No site on either side: the round-2 rule, which errs toward silence.
    expect(nameAfter(undefined, undefined).notices).toEqual([]);
    expect(nameAfter({ x: 0, y: 0 }, undefined).notices).toEqual([]);
  });

  it("a drive that is never convicted folds a state with exactly the five original fields", () => {
    let v: YieldVoiceState = createYieldVoice();
    v = stepYieldVoice(v, { t: 2, speedKmh: 0, wait: held("pedestrian", 0), violations: [] }).state;
    v = stepYieldVoice(v, { t: 4, speedKmh: 6, wait: createYieldWait(), violations: [] }).state;
    expect(Object.keys(v).sort()).toEqual(["endedAtSec", "pending", "reason", "sinceSec", "spoken"]);
  });

  it("the mute codes are the eight they were — nothing was widened or weakened to get here", () => {
    expect([...YIELD_VOICE_MUTE_CODES].sort()).toEqual(
      [
        "COLLISION",
        "CONTROLLER_SIGNAL_VIOLATED",
        "EMERGENCY_NOT_YIELDED",
        "FAILED_TO_YIELD",
        "PEDESTRIAN_CROSSING_TOO_FAST",
        "PEDESTRIAN_NOT_YIELDED",
        "RED_LIGHT_CROSSED",
        "STOP_SIGN_NO_FULL_STOP",
      ].sort(),
    );
  });
});

describe("[fold] the convicted card, for every duty", () => {
  const REASONS: YieldReason[] = [
    "roundaboutEntry",
    "giveWayLine",
    "stopSign",
    "redLight",
    "pedestrian",
    "railVehicle",
    "oncomingVehicle",
  ];

  it("approves of nothing, and still names the duty the opening card names", () => {
    for (const reason of REASONS) {
      const open = yieldWaitAdvisorPrompt(reason).textBg;
      const convicted = yieldWaitAdvisorPrompt(reason, undefined, true).textBg;
      expect(convicted, reason).not.toMatch(/правилно/u);
      // The act survives: every opening card's LAST sentence is the instruction,
      // and the convicted card keeps it verbatim.
      const lastSentence = open.split(/(?<=\.)\s+/u).at(-1)!;
      expect(convicted.endsWith(lastSentence), `${reason}: «${lastSentence}»`).toBe(true);
      // Never longer than the card it replaces — the phone column folds.
      expect(convicted.length, reason).toBeLessThanOrEqual(open.length + 12);
    }
  });

  it("the long card is not silenced by a conviction — it approves of nothing either", () => {
    const long = yieldWaitAdvisorPrompt("roundaboutEntry", 45, true).textBg;
    expect(long).toBe(yieldWaitAdvisorPrompt("roundaboutEntry", 45).textBg);
    expect(long).not.toMatch(/правилно/u);
  });
});

// ---------------------------------------------------------------------------
// [B2] WHICH CODES CONVICT AN EPISODE — the regression round 3 shipped
// ---------------------------------------------------------------------------

/**
 * THE FINDING, from the integration verifier and reproduced here before a line
 * changed. Round 3's in-episode conviction read `gradedMute` — ANY of the eight
 * `YIELD_VOICE_MUTE_CODES` — with no duty filter at all, while its cross-episode
 * sibling had one. Two of those eight (`COLLISION`, `EMERGENCY_NOT_YIELDED`)
 * grade no junction duty. Measured through the real `stepYieldVoice` on a lawful
 * red-light wait with a COLLISION graded at t = 0.5 s:
 *
 *   98bf8ae  ["Защо чакаш: червен сигнал", "Чакането Е маневрата"]
 *   round 3  []
 *
 * — and the card went from «Чакаш правилно на червено…» to «На червено се спира
 * ПРЕД линията…», which of the seven duties is the ONLY convicted card that ADDS
 * words: a stop-line recital recited to the student who DID stop, on a wait the
 * grader never faulted. That inverts requirement zero (doc 64 THEO-4): the
 * conviction was suppressing an EXPLANATION, and what it exists to remove is
 * PRAISE. It is also a regression against a COMMITTED baseline — 98bf8ae has no
 * conviction machinery at all — so it was worse than the frame it came from.
 *
 * THE RULE THIS BLOCK PINS: inside an episode, only a code that grades THE DUTY
 * BEING WAITED FOR convicts it (`muteCodeGradesThisDuty`). Every other mute code
 * still drops a pending verdict on its own frame — that is silence, the
 * direction rule 4 allows — but it does not silence the wait's explanation and
 * does not re-aim its card.
 */

/** A lawful standstill wait of `reason`, with `code` graded once at t = 0.5. */
function lawfulWaitWith(
  reason: YieldReason,
  code: ViolationCode | null,
): { said: Array<{ t: number; titleBg: string; explanationBg: string }>; state: YieldVoiceState } {
  let v: YieldVoiceState = createYieldVoice();
  const said: Array<{ t: number; titleBg: string; explanationBg: string }> = [];
  for (let t = 0.1; t <= YIELD_VOICE_SETTLE_S + 1 + 1e-9; t = +(t + 0.1).toFixed(1)) {
    const r = stepYieldVoice(v, {
      t,
      speedKmh: 0,
      wait: held(reason, 0),
      violations: code !== null && Math.abs(t - 0.5) < 0.05 ? [code] : [],
    });
    v = r.state;
    for (const n of r.notices) said.push({ t, titleBg: n.titleBg, explanationBg: n.explanationBg });
  }
  return { said, state: v };
}

/** `yieldEpisodeConvicted`'s own reader, which looks at `s.yieldVoice` and nothing else. */
const asSession = (v: YieldVoiceState): LessonSessionState => ({ yieldVoice: v }) as unknown as LessonSessionState;

/**
 * THE AUTHORED TRUTH, spelled out rather than computed from `MUTE_CODE_DUTIES`:
 * a table derived from the predicate under test would pass however the predicate
 * were mutated. Read off the rule catalogue — what each code actually grades.
 */
const CONVICTS_IN_EPISODE: Partial<Record<ViolationCode, readonly YieldReason[]>> = {
  FAILED_TO_YIELD: ["giveWayLine", "stopSign", "roundaboutEntry", "railVehicle", "oncomingVehicle"],
  PEDESTRIAN_NOT_YIELDED: ["pedestrian"],
  PEDESTRIAN_CROSSING_TOO_FAST: ["pedestrian"],
  RED_LIGHT_CROSSED: ["redLight"],
  CONTROLLER_SIGNAL_VIOLATED: ["redLight"],
  STOP_SIGN_NO_FULL_STOP: ["stopSign"],
  // COLLISION and EMERGENCY_NOT_YIELDED grade no junction duty: nothing.
};

const ALL_DUTIES: readonly YieldReason[] = [
  "roundaboutEntry",
  "giveWayLine",
  "stopSign",
  "redLight",
  "pedestrian",
  "railVehicle",
  "oncomingVehicle",
];

describe("[B2] the verifier's finding — a code that grades no duty does not silence the wait", () => {
  it("the red-light wait keeps BOTH its lines, word for word, and its card", () => {
    const clean = lawfulWaitWith("redLight", null);
    const crashed = lawfulWaitWith("redLight", "COLLISION");
    // The premise: a clean red-light wait is explained twice.
    expect(clean.said.map((s) => s.titleBg)).toEqual([
      "Защо чакаш: червен сигнал",
      "Чакането Е маневрата",
    ]);
    // …and the COLLISION changes not one character of it.
    expect(crashed.said).toEqual(clean.said);
    expect(crashed.state.convicted).toBeUndefined();
    expect(yieldEpisodeConvicted(asSession(crashed.state), "redLight")).toBe(false);
    // THE CARD, through the same two calls `advisorPromptForSession` makes.
    const shown = yieldWaitAdvisorPrompt(
      "redLight",
      undefined,
      yieldEpisodeConvicted(asSession(crashed.state), "redLight"),
    ).textBg;
    expect(shown).toBe(yieldWaitAdvisorPrompt("redLight").textBg);
    expect(shown).toContain("Чакаш правилно на червено");
    // …and the recital this is keeping off his screen is real, not a straw man:
    // redLight's convicted twin is the one card of the seven that ADDS words.
    expect(yieldWaitAdvisorPrompt("redLight", undefined, true).textBg).toContain("ПРЕД линията");
    expect(shown).not.toContain("ПРЕД линията");
  });

  it("the pedestrian wait with an unyielded emergency vehicle keeps its explanation too", () => {
    const clean = lawfulWaitWith("pedestrian", null);
    const siren = lawfulWaitWith("pedestrian", "EMERGENCY_NOT_YIELDED");
    expect(clean.said[0].titleBg).toBe("Защо чакаш: пешеходец на пътеката");
    expect(siren.said).toEqual(clean.said);
    expect(siren.state.convicted).toBeUndefined();
    expect(
      yieldWaitAdvisorPrompt("pedestrian", undefined, yieldEpisodeConvicted(asSession(siren.state), "pedestrian")).textBg,
    ).toContain("Чакаш правилно");
  });

  it("the ring barge STILL convicts — that is the row this all came from", () => {
    const barged = lawfulWaitWith("roundaboutEntry", "FAILED_TO_YIELD");
    expect(barged.said).toEqual([]);
    expect(barged.state.convicted).toBe(true);
    expect(yieldEpisodeConvicted(asSession(barged.state), "roundaboutEntry")).toBe(true);
    expect(yieldWaitAdvisorPrompt("roundaboutEntry", undefined, true).textBg).not.toMatch(/правилно/u);
  });

  it("every mute code against every duty: silent exactly where the catalogue says it grades that duty", () => {
    const observed: string[] = [];
    const authored: string[] = [];
    for (const code of YIELD_VOICE_MUTE_CODES) {
      for (const duty of ALL_DUTIES) {
        const r = lawfulWaitWith(duty, code);
        const silent = r.said.length === 0;
        // Silence and conviction are one fact, and both surfaces read it.
        expect(r.state.convicted === true, `${code} @ ${duty}`).toBe(silent);
        if (silent) observed.push(`${code} @ ${duty}`);
        else expect(r.said, `${code} @ ${duty}`).toEqual(lawfulWaitWith(duty, null).said);
        if ((CONVICTS_IN_EPISODE[code] ?? []).includes(duty)) authored.push(`${code} @ ${duty}`);
      }
    }
    expect(observed.sort()).toEqual(authored.sort());
    // The two absences are the whole finding — name them so a table that quietly
    // grew them cannot pass.
    expect(observed.filter((s) => s.startsWith("COLLISION") || s.startsWith("EMERGENCY_NOT_YIELDED"))).toEqual([]);
    expect(observed).toHaveLength(10);
  });

  it("the mute codes are still the eight, and the pending verdict is still dropped by all eight", () => {
    // Nothing was removed from YIELD_VOICE_MUTE_CODES to get here: the codes
    // that no longer CONVICT still MUTE, which is the safe half of the rule.
    for (const code of YIELD_VOICE_MUTE_CODES) {
      let v: YieldVoiceState = createYieldVoice();
      v = stepYieldVoice(v, { t: 1, speedKmh: 0, wait: held("redLight", 0), violations: [] }).state;
      // Past YIELD_VOICE_NAME_S, so the wait is one the student was TOLD about —
      // the only kind that is ever owed a verdict (section 3).
      v = stepYieldVoice(v, { t: 3, speedKmh: 0, wait: held("redLight", 0), violations: [] }).state;
      v = stepYieldVoice(v, { t: 12, speedKmh: 6, wait: createYieldWait(), violations: [] }).state;
      expect(v.pending, code).not.toBeNull();
      const onTheCode = stepYieldVoice(v, { t: 12.5, speedKmh: 9, wait: createYieldWait(), violations: [code] });
      expect(onTheCode.state.pending, code).toBeNull();
      // …and it does not arrive late either.
      let after = onTheCode.state;
      for (let t = 13; t < 20; t++) {
        const step = stepYieldVoice(after, { t, speedKmh: 9, wait: createYieldWait(), violations: [] });
        expect(step.notices, code).toEqual([]);
        after = step.state;
      }
    }
  });

  it("BOTH readers ask the same question, for every code and every duty", () => {
    // They differed for one evening and the asymmetry WAS the defect: the same
    // silenced explanation reappeared one frame the other side of a wait's
    // start, where the cross-gap reader still read „absent convicts every
    // duty". See MUTE_CODE_DUTIES in advisor.ts. A future reader who restores
    // the hedge in either reader turns this red.
    for (const duty of ALL_DUTIES) {
      for (const code of YIELD_VOICE_MUTE_CODES) {
        const grades = (CONVICTS_IN_EPISODE[code] ?? []).includes(duty);
        expect(muteCodeGradesThisDuty(code, duty), `in-episode ${code} @ ${duty}`).toBe(grades);
        expect(muteCodeConvictsDuty(code, duty), `cross-gap ${code} @ ${duty}`).toBe(grades);
      }
    }
  });

  it("a crash BEFORE a new wait leaves that wait explained — the cross-gap half of the same rule", () => {
    // THE HARM THIS CLOSES, measured by an adversarial verifier end to end
    // through applyTick on the roundabout drill: a car that clipped another at
    // t = 2.0 s and then stopped CORRECTLY at the ring ~1 s later lost «Защо
    // чакаш: в кръга имат предимство» AND «Чакането Е маневрата», where HEAD
    // said both. Reachable for a full YIELD_VOICE_EPISODE_GAP_S = 12 s, and it
    // is the same student the in-episode filter was written for.
    let v: YieldVoiceState = createYieldVoice();
    v = stepYieldVoice(v, { t: 1, speedKmh: 20, wait: createYieldWait(), violations: ["COLLISION"] }).state;
    v = stepYieldVoice(v, { t: 4, speedKmh: 0, wait: held("redLight", 4), violations: [] }).state;
    const named = stepYieldVoice(v, {
      t: 4 + YIELD_VOICE_NAME_S + 0.1,
      speedKmh: 0,
      wait: held("redLight", 4),
      violations: [],
    });
    expect(named.notices.length, "the explanation of a duty nobody faulted").toBe(1);
    expect(named.notices[0]?.titleBg).toContain("Защо чакаш");
    // `convicted` is written only when it becomes true, so „not convicted" is
    // the field being absent — assert the meaning, not the representation.
    expect(named.state.convicted ?? false).toBe(false);
  });

  it("…but a code that DOES grade the duty still convicts across the gap", () => {
    // The other direction, so the fix above cannot be read as „crashes are
    // forgiven": a red light crossed and then a wait at that same signal has no
    // clean wait to resume, which is 04-t059s by another route.
    let v: YieldVoiceState = createYieldVoice();
    v = stepYieldVoice(v, {
      t: 1,
      speedKmh: 20,
      wait: createYieldWait(),
      violations: ["RED_LIGHT_CROSSED"],
    }).state;
    v = stepYieldVoice(v, { t: 4, speedKmh: 0, wait: held("redLight", 4), violations: [] }).state;
    const named = stepYieldVoice(v, {
      t: 4 + YIELD_VOICE_NAME_S + 0.1,
      speedKmh: 0,
      wait: held("redLight", 4),
      violations: [],
    });
    expect(named.notices).toEqual([]);
    expect(named.state.convicted).toBe(true);
  });
});

describe("[B2] through applyTick — a crash during a lawful ring wait, on the real engine", () => {
  it("the fault is booked AND the wait is still explained, twice", () => {
    // `collision` is a code the roundabout adjudicator never emits, so this is
    // the verifier's shape on the drill the frames come from: a graded mute code
    // that has nothing to do with the duty being waited for.
    const d = new Drive().standWith(14, 3, [{ kind: "collision", withWhat: "vehicle" }]);
    expect(d.said.filter((x) => x.kind === "violation").map((x) => x.titleBg)).toEqual([
      "Удар в друго превозно средство",
    ]);
    expect(d.said.filter((x) => x.kind === "lesson").map((x) => x.titleBg)).toEqual([
      "Защо чакаш: в кръга имат предимство",
      "Чакането Е маневрата — кръгът командва",
    ]);
    expect(d.s.yieldVoice?.convicted).toBeUndefined();
    // The crash IS remembered, for the cross-episode reader — with its site,
    // which is the [E1] engine line doing its job on a second code.
    expect(d.s.yieldVoice?.recentConvictions).toEqual([
      { atSec: 3, code: "COLLISION", x: LANE_X, y: PAINT_Y },
    ]);
  });

  it("NEGATIVE CONTROL: the BARGE on the same clock takes the lecture over from that frame on", () => {
    // Same drive, same frame, the duty's own code: the naming line had already
    // been said at 1.4 s (the episode began at 0.2), and what the conviction
    // does is stop the narration THERE — no «Чакането Е маневрата» at 10.2.
    const d = new Drive().standWith(14, 3, [BARGE]);
    expect(d.said.filter((x) => x.kind === "violation").map((x) => x.titleBg)).toEqual(["Влизане без пропускане"]);
    expect(d.said.filter((x) => x.kind === "lesson").map((x) => `${x.t} ${x.titleBg}`)).toEqual([
      "1.4 Защо чакаш: в кръга имат предимство",
    ]);
    expect(d.s.yieldVoice?.convicted).toBe(true);
  });

  it("NEGATIVE CONTROL: the BARGE billed BEFORE the naming line silences the episode outright", () => {
    const d = new Drive().standWith(14, 1, [BARGE]);
    expect(d.said.filter((x) => x.kind === "violation").map((x) => x.titleBg)).toEqual(["Влизане без пропускане"]);
    expect(d.said.filter((x) => x.kind === "lesson")).toEqual([]);
    expect(d.s.yieldVoice?.convicted).toBe(true);
    expect(advisorPromptForSession(d.s)?.textBg).not.toMatch(/правилно/u);
  });
});
