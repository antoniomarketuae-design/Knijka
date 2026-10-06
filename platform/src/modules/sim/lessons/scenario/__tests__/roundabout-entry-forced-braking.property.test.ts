/**
 * THE ACCEPTANCE PROPERTY of the founder ruling 2026-10-05, «BILL FORCED BRAKING»
 * (sc-rb-busy-gap:a6f83f6b · :8f50287b, and the four rounds it took):
 *
 *   „Bill it only when a circulating car actually has to brake or swerve
 *    because of the entry, or there is contact. This mirrors your lane-drop
 *    ruling and how examiners judge taking priority. Patient or careful entries
 *    are never billed. The lesson own "barge" demo gets re-staged so it really
 *    cuts someone off. Approach readiness stays the lesson task («дръж под 6»),
 *    not a penalty."
 *
 * Yielding at a roundabout is about ONE place — the mouth he enters by — and
 * about the cars that had not yet passed it when he entered. So FAILED_TO_YIELD
 * on a roundabout entry has to be exactly «a car that was circulating and had
 * not passed his mouth when he entered was forced to brake because of him
 * before it cleared that mouth, or was touched before it did» — in BOTH
 * directions, on every drive, not on the drives somebody thought of:
 *
 *   (→) every drive the product BILLS has such an event on record
 *       (so the card «Влезе в кръга пред кола, която вече се движеше в него»
 *       is true of every billed drive), and
 *   (←) every drive with such an event on record is BILLED.
 *
 * WHO KEEPS THE RECORD. Not the product. `roundaboutEntryOracle.ts` replays the
 * drive a second time in a world whose traffic is never told where the student
 * is, and charges him the speed a car loses that its twin in that world does
 * not lose on the same frame — read off PUBLISHED speeds. Who had priority and
 * when a car has cleared the mouth it works out from published poses, as a run
 * and an odometer. The product reads each car's own internal account through
 * its own geometry; the oracle sees neither. (Round 3's oracle shared the
 * product's 35° window and so could not see a driver who stops in the lane.)
 *
 * THE SWEEP, per lesson and rung, through the live chain (`liveChainReplay` —
 * the stack LessonScene builds, at the live seed, with the rung's own cast):
 *
 *   single stop   rest on the give-way line, wait 4–50 s, enter at 3–25 км/ч
 *   two stops     stop short at y = −33 (0 or 3 s), creep 5 or 9 км/ч to the
 *                 line, stop again, wait 4–48 s, enter at 5 / 9 / 17 км/ч
 *   roll          never stop at the line: hold 0–39 s back at y = −50 (the
 *                 phase), then one steady speed 5–25 км/ч through the mouth
 *   stop on ring  wait, enter, come to REST in the ring lane 10 or 12 m along
 *                 the entry chord, hold 1 / 2 / 5 s, drive on (R3-V1)
 *   behind        wait a short while and enter fast right behind the cars that
 *                 have just gone by — and into the back of them (R3-V2)
 *
 * …and the three families of round 5 (the verifier's R4-V2 — the priority set
 * stays open for as long as he occupies his mouth):
 *
 *   poke          stop with the NOSE 0.05–0.55 m over the ring's edge, stand
 *                 there 5–60 s, then pull out at 5–25 км/ч — in front of the
 *                 car that had gone by and has come round, at every gap
 *   rock          nose on, back off to the line, on again (two entries)
 *   long hold     enter and stand 15 or 25 s in or just beyond the mouth
 *
 * …so the entries land everywhere in the platoon's 39 s cycle: behind the last
 * car, in the short gap, ahead of the returning lead, at a creep, at a roll, at
 * a barge, at rest in the lane, and from rest on the ring's edge. The three
 * lessons are the ones whose authored mistake is entering without yielding
 * (sc-roundabout-entry, sc-rb-exit-signal, sc-rb-busy-gap).
 *
 * THE BOUNDARY BAND. A drive within 0.1 m/s of the 0.3 m/s line, or decided by
 * a car within 0.5 m of the mouth (at the entry frame, or when it braked or was
 * touched), or by HIS OWN rear end within 0.5 m of leaving the mouth when a car
 * joined the set or just failed to, is counted separately — the summary names
 * how many there are and how they fell. On the five families of rounds 3 and 4
 * the two-way property is asserted on EVERY drive, band included (it holds
 * there). On the three families of round 5 it is asserted on every drive
 * OUTSIDE the band, and a disagreement inside it must be a touch within 0.5 m
 * of the car's tail clearing the mouth — the product reads where the car
 * stands, the oracle how far it has run, and on a staged car that wobbles a
 * decimetre in its lane the two differ by centimetres (measured by the round-4
 * verifier: 3 such drives in 336, all nose-rocking at L5, 1–12 cm).
 *
 * THE DEFAULT RUN is a thinned grid — every rung of every lesson, about five
 * minutes with the named cases and the pairs below. Set RB_ENTRY_SWEEP=full for
 * the whole grid (about 750 drives a rung, 10,000 in all, an hour and a
 * quarter), RB_ENTRY_SWEEP_OUT=<file> to have every row written out, and
 * RB_ENTRY_SWEEP_SHARD=i/n to run every n-th rung from the i-th (so the full
 * grid can be run in pieces and resumed).
 *
 * WHAT IT REFUSES. A rung with ambient cars: the oracle cannot attribute an
 * ambient car's braking (its twin diverges for good after their first meeting),
 * so such a rung is not swept — and the test says so by name rather than
 * passing quietly (roundabout-family rungs compile to no ambient traffic; the
 * census in the same directory pins that).
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { DriveScript } from "../../../traces/recorder";
import { compileScenario } from "../compile";
import { SC_ROUNDABOUT_ENTRY } from "../templates-flow";
import { SC_RB_BUSY_GAP, SC_RB_EXIT_SIGNAL } from "../templates-roundabout";
import type { ScenarioLevel, ScenarioSpec } from "../types";
import { lineStop, nosePoke, noseRock, roll, singleStop, slowOnRing, stopOnRing, twoStop } from "./roundaboutEntryDrives";
import {
  driveWithOracle,
  ORACLE_ANY_SHED_MPS,
  ORACLE_FORCED_SHED_MPS,
  type OracleDrive,
} from "./roundaboutEntryOracle";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const RAW: unknown = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "rb-mini-v1.json"), "utf-8"),
);
const FULL = process.env.RB_ENTRY_SWEEP === "full";
const OUT = process.env.RB_ENTRY_SWEEP_OUT;
/** "i/n": run every n-th rung of the sweep, from the i-th (0-based). */
const SHARD = (process.env.RB_ENTRY_SWEEP_SHARD ?? "").split("/").map(Number);
const inShard = (rung: number): boolean => SHARD.length !== 2 || rung % SHARD[1] === SHARD[0];

const SPECS: readonly ScenarioSpec[] = [SC_ROUNDABOUT_ENTRY, SC_RB_EXIT_SIGNAL, SC_RB_BUSY_GAP];
const LEVELS: readonly ScenarioLevel[] = [1, 2, 3, 4, 5];

type Family = "stop" | "two-stop" | "roll" | "ring" | "behind" | "poke" | "rock" | "long-hold";
/** The families of rounds 3 and 4 — the 7,862-drive grid; the rest are round 5's. */
const R4_FAMILIES: ReadonlySet<Family> = new Set<Family>(["stop", "two-stop", "roll", "ring", "behind"]);
const FAMILIES: readonly Family[] = ["stop", "two-stop", "roll", "ring", "behind", "poke", "rock", "long-hold"];
interface Variant {
  family: Family;
  name: string;
  script: DriveScript;
  /** `ring` only: the entry this stop belongs to, and how long he stood in the lane. */
  chain?: string;
  holdSec?: number;
}

const range = (from: number, to: number, step: number): number[] => {
  const out: number[] = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
};

function variants(spec: ScenarioSpec, level: ScenarioLevel): Variant[] {
  const out: Variant[] = [];
  // sc-rb-busy-gap's platoon is a metronome with a 39 s lap; the other two
  // lessons sync their one car to his approach, so their interesting waits are
  // the first seconds at the line.
  const metronome = spec.id === SC_RB_BUSY_GAP.id;
  // The default grid is thinner on L2–L4, whose casts are L1's.
  const thin = !FULL && level !== 1 && level !== 5;

  // ── the round-3 grid ──
  const waits = FULL ? range(4, 50, 2) : thin ? [6, 34, 44] : [4, 12, 20, 30, 36, 44];
  const speeds = FULL ? [3, 5, 7, 9, 12, 17, 25] : thin ? [5, 17] : [3, 9, 25];
  for (const w of waits) for (const e of speeds) out.push({ family: "stop", name: `stop wait=${w} enter=${e}`, script: singleStop(w, e) });

  const pre = FULL ? [0, 3] : [3];
  const creeps = FULL ? [5, 9] : [5];
  const waits2 = FULL ? range(4, 48, 4) : thin ? [36] : [16, 36];
  const speeds2 = FULL ? [5, 9, 17] : thin ? [9] : [5, 17];
  for (const p of pre) for (const c of creeps) for (const w of waits2) for (const e of speeds2) {
    out.push({ family: "two-stop", name: `two-stop pre=${p} creep=${c} wait=${w} enter=${e}`, script: twoStop(p, c, w, e) });
  }

  const phases = FULL ? range(0, 39, 3) : thin ? [27] : [0, 12, 27, 33];
  const rolls = FULL ? [5, 7, 9, 12, 15, 20, 25] : thin ? [8, 15] : [5, 9, 20];
  for (const d of phases) for (const k of rolls) out.push({ family: "roll", name: `roll phase=${d} at=${k}`, script: roll(d, k) });

  // ── R3-V1: enter ahead of the car and come to rest in the ring lane ──
  const ringWaits = metronome
    ? FULL ? range(30, 41, 1) : thin ? [36, 38] : [34, 36, 38, 40]
    : FULL ? range(0, 12, 1) : thin ? [0, 6] : [0, 2, 6];
  const ringSpeeds = metronome ? (FULL ? [8, 12, 17] : thin ? [17] : [12, 17]) : FULL ? [12, 17] : [17];
  const ringAlong = metronome && FULL ? [10, 12] : [10];
  const ringHolds = metronome ? (FULL ? [1, 2, 5] : thin ? [2] : [1, 5]) : thin ? [4] : [2, 4];
  for (const w of ringWaits) for (const k of ringSpeeds) for (const d of ringAlong) for (const h of ringHolds) {
    out.push({
      family: "ring",
      name: `ring wait=${w} enter=${k} along=${d} hold=${h}`,
      script: stopOnRing(w, k, d, h),
      chain: `wait=${w} enter=${k} along=${d}`,
      holdSec: h,
    });
  }

  // ── R3-V2: enter fast right behind the cars that have just gone by ──
  const behindWaits = metronome
    ? FULL ? range(4, 12, 0.5) : thin ? [8] : [5.5, 8, 9, 10]
    : FULL ? range(3, 9, 0.5) : thin ? [5, 8] : [3, 5, 6.5, 8];
  const behindSpeeds = metronome ? (FULL ? [14, 17, 22, 28] : [17, 28]) : FULL ? [17, 22] : [17];
  for (const w of behindWaits) for (const k of behindSpeeds) {
    out.push({ family: "behind", name: `behind wait=${w} enter=${k}`, script: lineStop(w, k) });
  }

  // ── ROUND 5 (R4-V2) ──
  // THE NOSE-POKE: stop with the nose just over the ring's edge (5.5 / 5.8 /
  // 6.2 m along the chord rest it 0.08 / 0.28 / 0.54 m onto the carriageway),
  // stand, pull out. On the metronome the holds step through the 39 s lap; on
  // the synced lessons the one car comes round about 33 s after it went by.
  const pokeWaits = metronome ? (FULL ? [10, 18, 26] : [18]) : FULL ? [0, 4] : [2];
  const pokeAlong = FULL ? (metronome ? [5.5, 5.8, 6.2] : [5.6, 6.2]) : thin ? [5.6] : [5.6, 6.2];
  const pokeHolds = metronome
    ? FULL ? [5, 8, 11, 14, 17, 20, 23, 26, 32, 45, 60] : thin ? [20] : [12, 19, 20, 45]
    : FULL ? [5, 15, 25, 30, 33, 36, 39, 45, 60] : thin ? [36] : [15, 36, 45];
  const pokeSpeeds = FULL ? [5, 17] : thin ? [17] : [5, 17];
  for (const w of pokeWaits) for (const a of pokeAlong) for (const h of pokeHolds) for (const k of pokeSpeeds) {
    out.push({ family: "poke", name: `poke wait=${w} along=${a} hold=${h} then=${k}`, script: nosePoke(w, 6, a, h, k) });
  }
  if (FULL && metronome) {
    // …and the pull-out speed on its own, where the returning lead is closest.
    for (const a of [5.5, 6.2]) for (const h of [17, 18, 19, 20, 21, 22]) for (const k of [9, 12, 25]) {
      out.push({ family: "poke", name: `poke wait=18 along=${a} hold=${h} then=${k}`, script: nosePoke(18, 6, a, h, k) });
    }
  }

  // NOSE-ROCKING: nose on, back off to the line, on again (the round-4
  // verifier's own grid on the metronome), and the slow rock that rests long.
  const rockWaits = metronome ? (FULL ? range(28, 41, 1) : thin ? [36] : [30, 36, 40]) : FULL ? range(0, 10, 2) : thin ? [2] : [0, 6];
  const rockAlong = FULL ? [5.5, 6.5, 8] : [6.5];
  const rockHolds: Array<[number, number]> = FULL ? [[1, 1], [3, 4]] : [[1, 1]];
  for (const w of rockWaits) for (const a of rockAlong) for (const [h, h2] of rockHolds) {
    out.push({ family: "rock", name: `rock wait=${w} along=${a} hold=${h} back=${h2}`, script: noseRock(w, 8, a, h, h2) });
  }
  const slowRock: Array<[number, number, number, number]> = metronome
    ? FULL
      ? [10, 18, 26].flatMap((w) => [5.6, 6.4].flatMap((a) => [[w, a, 20, 3], [w, a, 3, 20], [w, a, 12, 12]] as Array<[number, number, number, number]>))
      : thin ? [] : [[18, 6.4, 20, 3], [18, 5.6, 3, 20]]
    : FULL ? [[2, 6.4, 36, 3], [2, 5.6, 3, 36]] : [];
  for (const [w, a, h, h2] of slowRock) {
    out.push({ family: "rock", name: `rock wait=${w} along=${a} hold=${h} back=${h2} slow`, script: noseRock(w, 6, a, h, h2) });
  }

  // LONG HOLDS: enter and stand 15 or 25 s — 8 and 10 m along the chord he is
  // still in his mouth, 14 m along it his rear end has left it.
  const holdWaits = metronome ? (FULL ? range(4, 44, 4) : thin ? [20] : [8, 20, 32]) : FULL ? [0, 4, 8] : thin ? [0] : [0, 8];
  const holdAlong = FULL ? [8, 10, 14] : [10];
  const holdSecs = FULL ? [15, 25] : thin ? [25] : [15, 25];
  for (const w of holdWaits) for (const a of holdAlong) for (const h of holdSecs) {
    out.push({
      family: "long-hold",
      name: `long-hold wait=${w} along=${a} hold=${h}`,
      script: stopOnRing(w, 12, a, h),
      chain: `long wait=${w} along=${a}`,
      holdSec: h,
    });
  }
  return out;
}

interface Row {
  lesson: string;
  level: ScenarioLevel;
  family: Family;
  variant: string;
  chain: string | null;
  holdSec: number | null;
  billed: boolean;
  billedT: number | null;
  event: boolean;
  forcedT: number | null;
  forcedBy: string | null;
  forcedWhileStanding: boolean;
  /** How far the forcing car's rear end still was from the mouth when it reached the threshold, m. */
  forcedRunM: number | null;
  contactT: number | null;
  contactWith: string | null;
  /** A touch with a circulating car that was NOT a car with priority over the entry (a collision, not this fault). */
  otherContactT: number | null;
  otherContactWith: string | null;
  enteredT: number | null;
  /** Entry events in the drive (nose onto the ring from outside). */
  entries: number;
  prioritySet: string[];
  /** Cars that joined the set AFTER an entry frame — he still sat in his mouth and they came short of it (round 5). */
  lateJoiners: string[];
  /** The car that grounds the event joined that way. */
  byLateJoiner: boolean;
  /** When he left the mouth of his first entry (the set closed), and how; how far his nose rested onto the ring; how long he stood with the set open. */
  setClosedT: number | null;
  setClosedHow: string | null;
  restNoseInM: number | null;
  restOpenSec: number;
  /** Most a car of the priority set lost to him before clearing the mouth; and most any car lost that does not count. */
  maxPShed: number;
  maxNotCounted: number;
  commended: boolean;
  /** When the instructor's voice said «Интервалът беше добър», or null. */
  voicePraisedT: number | null;
  /** When somebody on the ring first PAID for the entry — a car of the set eased at all, any other car's loss reached 0.3 m/s, or a touch — or null. */
  paidT: number | null;
  collision: boolean;
  band: boolean;
  bandWhy: string[];
  ambient: number;
}

/** The first moment somebody on the ring paid for his entry, on the oracle's record (null: nobody did). */
function paidAt(d: OracleDrive): number | null {
  const o = d.oracle;
  const first = Math.min(o.firstPShedT ?? Infinity, o.notCountedForcedT ?? Infinity, o.contactT ?? Infinity, o.otherContactT ?? Infinity);
  return Number.isFinite(first) ? first : null;
}

function rowOf(spec: ScenarioSpec, level: ScenarioLevel, v: Variant, d: OracleDrive): Row {
  const o = d.oracle;
  return {
    lesson: spec.id,
    level,
    family: v.family,
    variant: v.name,
    chain: v.chain ?? null,
    holdSec: v.holdSec ?? null,
    billed: d.billedT !== null,
    billedT: d.billedT,
    event: o.event,
    forcedT: o.forcedT,
    forcedBy: o.forcedBy,
    forcedWhileStanding: o.forcedWhileStanding,
    forcedRunM: o.forcedBy ? (o.cars[o.forcedBy]?.runAtForcedM ?? null) : null,
    contactT: o.contactT,
    contactWith: o.contactWith,
    otherContactT: o.otherContactT,
    otherContactWith: o.otherContactWith,
    enteredT: o.enteredT,
    entries: o.entries,
    prioritySet: o.prioritySet,
    lateJoiners: o.lateJoiners,
    byLateJoiner: o.groundedByLateJoiner,
    setClosedT: o.setClosedT,
    setClosedHow: o.setClosedHow,
    restNoseInM: o.restNoseInM,
    restOpenSec: o.restOpenSec,
    maxPShed: o.maxPShedMps,
    maxNotCounted: o.maxNotCountedShedMps,
    commended: d.commended,
    voicePraisedT: d.voicePraisedT,
    paidT: paidAt(d),
    collision: d.out.violationCodes.includes("COLLISION"),
    band: o.band,
    bandWhy: o.bandWhy,
    ambient: o.ambientCars,
  };
}

const fmt = (r: Row): string =>
  `${r.lesson} L${r.level} ${r.variant}: billed=${r.billed}@${r.billedT?.toFixed(2)} event=${r.event} ` +
  `forced=${r.forcedT?.toFixed(2)} by=${r.forcedBy}${r.forcedWhileStanding ? " (he was standing)" : ""} ` +
  `run=${r.forcedRunM?.toFixed(2)} contact=${r.contactT?.toFixed(2)} with=${r.contactWith} ` +
  `otherContact=${r.otherContactT?.toFixed(2)} with=${r.otherContactWith} entered=${r.enteredT?.toFixed(2)} ` +
  `P=[${r.prioritySet.join(",")}] late=[${r.lateJoiners.join(",")}]${r.byLateJoiner ? " (grounded by a late joiner)" : ""} ` +
  `leftMouth=${r.setClosedT?.toFixed(2)}(${r.setClosedHow}) noseIn=${r.restNoseInM?.toFixed(2)} ` +
  `pShed=${r.maxPShed.toFixed(3)} notCounted=${r.maxNotCounted.toFixed(3)} ` +
  `commended=${r.commended} voice=${r.voicePraisedT?.toFixed(2)} paid=${r.paidT?.toFixed(2)} collision=${r.collision}${r.band ? ` BAND(${r.bandWhy.join("; ")})` : ""}`;

const ALL: Row[] = [];
const REFUSED: string[] = [];
/** Rungs a test of the sweep actually ran for (a `-t` filter runs fewer than all 15). */
let asked = 0;

describe("FAILED_TO_YIELD on a roundabout entry ⇔ a car that had not passed his mouth was forced to brake because of him before clearing it, or was touched", () => {
  let rung = 0;
  for (const spec of SPECS) {
    for (const level of LEVELS) {
      const sweep = inShard(rung++) ? it : it.skip;
      sweep(`${spec.id} L${level}: every billed drive has the event on record, and every drive with the event is billed`, () => {
        asked++;
        const lesson = compileScenario(spec, level);
        if ((lesson.traffic?.vehicleCount ?? 0) > 0) {
          // The oracle is blind on ambient cars (see the header) — say so.
          REFUSED.push(`${spec.id} L${level} (${lesson.traffic?.vehicleCount} ambient cars)`);
          return;
        }
        const rows = variants(spec, level).map((v) => rowOf(spec, level, v, driveWithOracle(lesson, RAW, v.script)));
        ALL.push(...rows);
        for (const r of rows) expect(r.ambient, fmt(r)).toBe(0);
        // (→) billed with no event on record: a conviction on something that did not happen.
        const billedNoEvent = rows.filter((r) => r.billed && !r.event);
        // (←) an event on record and no bill: a car was forced to brake and nobody answered for it.
        const eventNoBill = rows.filter((r) => r.event && !r.billed);
        // The families of rounds 3 and 4: on every drive, the boundary band included.
        expect(billedNoEvent.filter((r) => R4_FAMILIES.has(r.family)).map(fmt), "billed with no grounding event on record").toEqual([]);
        expect(
          eventNoBill.filter((r) => R4_FAMILIES.has(r.family)).map(fmt),
          "a car with priority was forced to brake (or touched) before clearing the mouth and the drive was not billed",
        ).toEqual([]);
        // Every family, round 5's included: on every drive outside the band…
        expect(billedNoEvent.filter((r) => !r.band).map(fmt), "billed with no grounding event on record (outside the boundary band)").toEqual([]);
        expect(
          eventNoBill.filter((r) => !r.band).map(fmt),
          "a car with priority was forced to brake (or touched) before clearing the mouth and the drive was not billed (outside the boundary band)",
        ).toEqual([]);
        // …and inside it a disagreement can only be a touch within half a metre
        // of the car's tail clearing the mouth (see the header).
        for (const r of [...billedNoEvent, ...eventNoBill]) {
          expect(R4_FAMILIES.has(r.family), fmt(r)).toBe(false);
          expect(r.bandWhy.some((w) => /was touched -?\d+\.\d+ m from clearing the mouth$/.test(w)), fmt(r)).toBe(true);
        }
        for (const r of rows.filter((x) => x.billed && x.event)) {
          // The bill is the event: it lands on the frame the first of them does,
          // and never before his nose is on the ring.
          const first = Math.min(r.forcedT ?? Infinity, r.contactT ?? Infinity);
          expect(Math.abs(r.billedT! - first), fmt(r)).toBeLessThan(1.5 / 60);
          expect(r.enteredT, fmt(r)).not.toBeNull();
          expect(r.billedT!, fmt(r)).toBeGreaterThanOrEqual(r.enteredT!);
          // R4-4 — THE CARD IS TRUE: the car that grounds the bill was
          // circulating and had not passed his mouth when he entered (it is in
          // the priority set), and had not cleared the mouth when it braked or
          // was touched.
          const by = r.forcedT !== null && r.forcedT <= (r.contactT ?? Infinity) ? r.forcedBy : r.contactWith;
          expect(by, fmt(r)).not.toBeNull();
          expect(r.prioritySet, fmt(r)).toContain(by);
          if (by === r.forcedBy && r.forcedRunM !== null) expect(r.forcedRunM, fmt(r)).toBeGreaterThanOrEqual(0);
          // Round 5 — a car can only have JOINED the set while he still sat in
          // his mouth: a bill grounded by a late joiner has a late joiner.
          if (r.byLateJoiner) expect(r.lateJoiners, fmt(r)).toContain(by);
        }
        // A NOSE RESTING ON THE EDGE COSTS NOTHING BY ITSELF: a drive in which
        // no car of the set lost any speed to him and none was touched is not
        // billed, however long he stood in his mouth.
        for (const r of rows.filter((x) => x.maxPShed <= ORACLE_ANY_SHED_MPS && x.contactT === null && !x.band)) {
          expect(r.billed, fmt(r)).toBe(false);
        }
        // Praise and blame never meet; nobody is praised over a car with
        // priority that lost ANY speed to him before clearing his mouth, over
        // any car that had to brake for him while his nose was on the ring, or
        // over a touch.
        for (const r of rows.filter((x) => x.commended)) {
          expect(r.billed, fmt(r)).toBe(false);
          expect(r.maxPShed, fmt(r)).toBeLessThanOrEqual(ORACLE_ANY_SHED_MPS);
          expect(r.maxNotCounted, fmt(r)).toBeLessThan(ORACLE_FORCED_SHED_MPS);
          expect(r.contactT, fmt(r)).toBeNull();
          expect(r.otherContactT, fmt(r)).toBeNull();
        }
        // THE INSTRUCTOR'S VOICE NEVER PRAISES AN ENTRY THAT IS THEN BILLED:
        // «Интервалът беше добър … при влизането не беше отчетено нарушение»
        // waits until no car is left that the entry could still be billed for
        // (SimTick.roundaboutEntryOpen) — a billed drive hears no praise at
        // all, before the bill or after it.
        for (const r of rows.filter((x) => x.billed)) expect(r.voicePraisedT, fmt(r)).toBeNull();
        // …NOR ONE SOMEBODY HAS PAID FOR (R4-3 — «not billed, not praised» is
        // true of the voice as of the commendation): its sentence is entering
        // «без движещият се в кръга да намалява заради теб», so it is not said
        // once a car with priority has eased off for him at all, another car
        // has had to brake for him on the ring, or he has touched one
        // (SimTick.roundaboutEntryPaidFor). What happens AFTER it was said — he
        // crawls on and the car he let by catches him up half a lap later — it
        // cannot know, and does not take back.
        for (const r of rows.filter((x) => x.voicePraisedT !== null)) {
          expect(r.maxPShed, fmt(r)).toBeLessThanOrEqual(ORACLE_ANY_SHED_MPS);
          if (r.paidT !== null) expect(r.voicePraisedT!, fmt(r)).toBeLessThan(r.paidT);
        }
        // MONOTONE IN CARE: for one and the same entry, standing in the lane a
        // shorter time is never billed where standing longer is not (the short
        // holds of «stop on ring», and the 15 s / 25 s of the long ones).
        const chains = new Map<string, Row[]>();
        for (const r of rows) if (r.chain !== null) chains.set(r.chain, [...(chains.get(r.chain) ?? []), r]);
        for (const [chain, members] of chains) {
          members.sort((a, b) => a.holdSec! - b.holdSec!);
          for (let i = 1; i < members.length; i++) {
            if (members[i - 1].billed) {
              expect(members[i].billed, `${spec.id} L${level} ${chain}: billed after ${members[i - 1].holdSec} s in the lane, not after ${members[i].holdSec} s`).toBe(true);
            }
          }
        }
        // The sweep is not all one colour: on every rung it holds both verdicts.
        expect(rows.some((r) => r.billed), "no billed drive in the sweep").toBe(true);
        expect(rows.some((r) => !r.billed && r.enteredT !== null), "no clean entry in the sweep").toBe(true);
        expect(rows.some((r) => r.commended), "no commended drive in the sweep").toBe(true);
      }, 3_600_000);
    }
  }

  it("the sweep covered every rung it was asked to — or names the ones it refused — and held both ways, the boundary band counted apart", () => {
    const counts = new Map<string, number>();
    for (const r of ALL) counts.set(`${r.lesson} L${r.level}`, (counts.get(`${r.lesson} L${r.level}`) ?? 0) + 1);
    const n = (p: (r: Row) => boolean): number => ALL.filter(p).length;
    const billed = n((r) => r.billed);
    const events = n((r) => r.event);
    const byFamily = FAMILIES.map((f) => `${f}:${n((r) => r.family === f)}/${n((r) => r.family === f && r.billed)}`).join(" ");
    const r5 = (r: Row): boolean => !R4_FAMILIES.has(r.family);
    const summary =
      `drives=${ALL.length} billed=${billed} withEvent=${events} ` +
      `billedNoEvent=${n((r) => r.billed && !r.event)} eventNoBill=${n((r) => r.event && !r.billed)} ` +
      `byContact=${n((r) => r.billed && r.contactT !== null && (r.forcedT === null || r.contactT <= r.forcedT))} ` +
      `forcedWhileStanding=${n((r) => r.billed && r.forcedWhileStanding)} ` +
      `rearEndOnly=${n((r) => !r.billed && r.otherContactT !== null)} ` +
      `clearedThenBraked=${n((r) => !r.billed && r.maxNotCounted >= ORACLE_FORCED_SHED_MPS)} ` +
      `subThreshold=${n((r) => !r.billed && r.maxPShed > ORACLE_ANY_SHED_MPS)} ` +
      `commended=${n((r) => r.commended)} voicePraised=${n((r) => r.voicePraisedT !== null)} ` +
      `voicePraisedAndBilled=${n((r) => r.voicePraisedT !== null && r.billed)} ` +
      `voicePraisedOverEasing=${n((r) => r.voicePraisedT !== null && r.maxPShed > ORACLE_ANY_SHED_MPS)} ` +
      `voicePraisedAfterPaid=${n((r) => r.voicePraisedT !== null && r.paidT !== null && r.paidT <= r.voicePraisedT)} ` +
      `voicePraisedThenPaidLater=${n((r) => r.voicePraisedT !== null && r.paidT !== null && r.paidT > r.voicePraisedT)} | ` +
      `BAND drives=${n((r) => r.band)} billed=${n((r) => r.band && r.billed)} withEvent=${n((r) => r.band && r.event)} ` +
      `billedNoEvent=${n((r) => r.band && r.billed && !r.event)} eventNoBill=${n((r) => r.band && r.event && !r.billed)} | ` +
      `OUTSIDE THE BAND drives=${n((r) => !r.band)} billed=${n((r) => !r.band && r.billed)} withEvent=${n((r) => !r.band && r.event)} ` +
      `billedNoEvent=${n((r) => !r.band && r.billed && !r.event)} eventNoBill=${n((r) => !r.band && r.event && !r.billed)} | ` +
      `ROUND-4 GRID drives=${n((r) => !r5(r))} billed=${n((r) => !r5(r) && r.billed)} withEvent=${n((r) => !r5(r) && r.event)} ` +
      `billedByLateJoiner=${n((r) => !r5(r) && r.billed && r.byLateJoiner)} | ` +
      `ROUND-5 FAMILIES drives=${n(r5)} billed=${n((r) => r5(r) && r.billed)} withEvent=${n((r) => r5(r) && r.event)} ` +
      `billedByLateJoiner=${n((r) => r5(r) && r.billed && r.byLateJoiner)} billedWhileStanding=${n((r) => r5(r) && r.billed && r.forcedWhileStanding)} ` +
      `withLateJoiners=${n((r) => r5(r) && r.lateJoiners.length > 0)} lateJoinersAndNobodyPaid=${n((r) => r5(r) && r.lateJoiners.length > 0 && !r.billed && r.maxPShed <= ORACLE_ANY_SHED_MPS)} ` +
      `restedInMouth10s=${n((r) => r.restOpenSec >= 10)} ofThoseBilled=${n((r) => r.restOpenSec >= 10 && r.billed)} ` +
      `restedALapOrMore=${n((r) => r.restOpenSec >= 39)} ofThoseBilled=${n((r) => r.restOpenSec >= 39 && r.billed)} ` +
      `subThresholdLate=${n((r) => r5(r) && !r.billed && r.maxPShed > ORACLE_ANY_SHED_MPS)} commendedR5=${n((r) => r5(r) && r.commended)} | ` +
      `families (drives/billed) ${byFamily} | refused=[${REFUSED.join("; ")}]`;
    if (OUT) writeFileSync(OUT, [`# ${summary}`, ...ALL.map((r) => JSON.stringify(r))].join("\n") + "\n");
    expect(ALL.length).toBeGreaterThan(0);
    // sc-roundabout-entry L5 authored four ambient cars until 0ec7aa2 (main)
    // took them out; a tree that still has them is told apart here.
    for (const refused of REFUSED) expect(refused).toMatch(/^sc-roundabout-entry L5 /);
    expect(asked).toBeGreaterThan(0);
    expect(counts.size + REFUSED.length).toBe(asked);
    // Both ways: outside the band on every family, and band included on the
    // round-4 grid (the per-rung tests above name every drive).
    expect(n((r) => !r.band && r.billed !== r.event)).toBe(0);
    expect(n((r) => !r5(r) && r.billed !== r.event)).toBe(0);
    // The voice is not simply silent: it still tells clean entries their gap was good.
    expect(n((r) => r.voicePraisedT !== null)).toBeGreaterThan(0);
    expect(n((r) => r.voicePraisedT !== null && r.billed)).toBe(0);
    expect(n((r) => r.voicePraisedT !== null && r.maxPShed > ORACLE_ANY_SHED_MPS)).toBe(0);
    expect(n((r) => r.voicePraisedT !== null && r.paidT !== null && r.paidT <= r.voicePraisedT)).toBe(0);
    // R4-3, on every drive: a car with priority eased off for him, under the
    // line — not billed, and not praised.
    for (const r of ALL.filter((x) => !x.billed && x.maxPShed > ORACLE_ANY_SHED_MPS)) expect(r.commended, fmt(r)).toBe(false);
  });
});

describe("the drives that refuted the first two repairs", () => {
  const busy = (level: ScenarioLevel) => compileScenario(SC_RB_BUSY_GAP, level);
  const run = (level: ScenarioLevel, script: DriveScript) => driveWithOracle(busy(level), RAW, script);
  const slowest = (d: OracleDrive): number => Math.min(...Object.values(d.oracle.cars).map((c) => c.minSpeedMps));

  for (const level of LEVELS) {
    it(`w76 (L${level}): stop short, creep 4.9 км/ч to the line, stop, wait 12 s and enter behind the platoon — never billed, nobody slowed`, () => {
      // Rounds 0 and 1 billed this at t = 16.6, a metre short of the line.
      if (level === 5) return; // L5's third car is still coming at 12 s — its own case, in the sweep
      const d = run(level, twoStop(2, 4.9, 12, 17));
      expect(d.billedT).toBeNull();
      expect(d.oracle.event).toBe(false);
      expect(d.oracle.maxPShedMps).toBe(0);
      expect(d.oracle.maxNotCountedShedMps).toBe(0);
      expect(d.out.result.score).toBe(0);
    });

    it(`R2-V1 (L${level}): stop on the line, wait 5.5 s, creep in at 5 км/ч BEHIND the last platoon car — not billed`, () => {
      // Round 2 billed this at the ring's edge, 2.1 s after the car had passed
      // in front of him, on a 0.9 s «entry memory» of a condition that was over.
      if (level === 5) return;
      const d = run(level, singleStop(5.5, 5));
      expect(d.billedT).toBeNull();
      expect(d.oracle.event).toBe(false);
      expect(d.oracle.prioritySet).toEqual([]); // every car had gone by
    });

    it(`R2-V2 (L${level}): wait 32 s and enter at 5 км/ч AHEAD of the returning lead, which has to brake — billed, and not praised`, () => {
      // Round 2 let this go with 0 т. and «Правилно отстъпено предимство» while
      // the lead braked from 2.90 to 1.28 m/s behind him.
      const d = run(level, singleStop(32, 5));
      expect(d.billedT).not.toBeNull();
      expect(d.oracle.forcedBy).toBe("sc-rbg-lead");
      expect(d.commended).toBe(false);
      if (level !== 4) expect(slowest(d)).toBeLessThan(2.0); // the exam rung ends on the bill
    });
  }

  it("R2-V3: a steady roll is judged by what it does to the ring, not by its speed — 9 км/ч that touches nobody is clean of this fault, 8 км/ч that makes the lead brake is billed", () => {
    // Round 2 judged a driver who had not dropped to 8 км/ч on «presence» and
    // one who had on «arrival»: the 9 км/ч roll below was an опасна with every
    // car 20 m away, the 8 км/ч one was praised while the lead braked.
    const harmless = run(1, roll(27, 9));
    expect(harmless.oracle.event).toBe(false);
    expect(harmless.billedT).toBeNull();
    const harmful = run(1, roll(33, 8));
    expect(harmful.oracle.forcedBy).toBe("sc-rbg-lead");
    expect(harmful.billedT).not.toBeNull();
    expect(harmful.commended).toBe(false);
  });
});

describe("the drives that refuted round 3 — a window of 35° swept, counted only while he was moving", () => {
  const busy = (level: ScenarioLevel) => compileScenario(SC_RB_BUSY_GAP, level);
  const run = (level: ScenarioLevel, script: DriveScript) => driveWithOracle(busy(level), RAW, script);
  const codes = (d: OracleDrive): string[] => d.out.violationCodes;

  describe("R3-V1 — he enters AHEAD of the returning lead and STOPS in the ring lane: billed, however he stands", () => {
    for (const level of LEVELS) {
      it(`L${level}: wait 38 s, enter at 17 км/ч with the lead 14 m short of his mouth, stop 12 m along the chord for 2 s — the lead brakes before the mouth and he answers for it`, () => {
        // Round 3: «codes [], score 0, passed true», the lead braked 2.90 → 0.65 m/s.
        const d = run(level, stopOnRing(38, 17, 12, 2));
        expect(codes(d)).toContain("FAILED_TO_YIELD");
        expect(d.oracle.forcedBy).toBe("sc-rbg-lead");
        expect(d.oracle.forcedWhileStanding).toBe(true);
        const lead = d.oracle.cars["sc-rbg-lead"]!;
        expect(lead.runAtEntryM!).toBeGreaterThan(12); // it had not passed: it was that far short
        expect(lead.runAtEntryM!).toBeLessThan(17);
        expect(lead.runAtForcedM!).toBeGreaterThan(5); // …and still metres short when it had lost 0.3 m/s
        expect(d.commended).toBe(false);
        if (level !== 4) expect(lead.minSpeedMps).toBeLessThan(1.0); // the exam rung ends on the bill
      });
    }

    const ACTS: Array<[wait: number, kmh: number, along: number, hold: number]> = [
      [38, 17, 12, 1],
      [38, 17, 12, 5],
      [37, 12, 10, 2],
      [36, 12, 10, 5],
      [34, 17, 12, 5], // 26 m ahead of the lead, and still in its lane when it arrives
      [36, 8, 10, 2],
    ];
    for (const [w, k, a, h] of ACTS) {
      it(`wait ${w} s, enter at ${k} км/ч, stop ${a} m along the chord for ${h} s: billed, forced while he stood, the lead short of the mouth`, () => {
        const d = run(1, stopOnRing(w, k, a, h));
        expect(codes(d)).toContain("FAILED_TO_YIELD");
        expect(d.oracle.event).toBe(true);
        expect(d.oracle.forcedBy).toBe("sc-rbg-lead");
        expect(d.oracle.forcedWhileStanding).toBe(true);
        expect(d.oracle.cars["sc-rbg-lead"]!.runAtForcedM!).toBeGreaterThan(2);
        expect(d.commended).toBe(false);
      });
    }

    it("the same stop made where it costs nobody anything — 29 m ahead of the lead, 1 s in the lane, gone before it arrives — is not billed", () => {
      const d = run(1, stopOnRing(33, 17, 12, 1));
      expect(d.billedT).toBeNull();
      expect(d.oracle.event).toBe(false);
      expect(d.oracle.maxPShedMps).toBe(0);
    });

    it("the other two lessons, whose one car is synced to his approach: touch-and-go at the line, in at 17 км/ч ahead of the car, stop 10 m in for 4 s — billed on both", () => {
      for (const [spec, id] of [
        [SC_ROUNDABOUT_ENTRY, "sc-rb-circulating"],
        [SC_RB_EXIT_SIGNAL, "sc-rbx-circulating"],
      ] as const) {
        const d = driveWithOracle(compileScenario(spec, 1), RAW, stopOnRing(0, 17, 10, 4));
        expect(codes(d), spec.id).toContain("FAILED_TO_YIELD");
        expect(d.oracle.forcedBy, spec.id).toBe(id);
        expect(d.oracle.forcedWhileStanding, spec.id).toBe(true);
        expect(d.oracle.cars[id]!.minSpeedMps, spec.id).toBeLessThan(1.0);
      }
    });
  });

  describe("R3-V2 — he lets the cars go by, enters BEHIND them and runs into the back of the last one: a collision, never «Влизане без пропускане»", () => {
    for (const level of [1, 2, 3, 4] as const) {
      it(`L${level}: wait 8 s, enter at 17 км/ч — both platoon cars had passed his mouth; COLLISION only`, () => {
        // Round 3: FAILED_TO_YIELD + COLLISION, 20 т., «Влезе в кръга пред кола…».
        const d = run(level, lineStop(8, 17));
        expect(codes(d)).toContain("COLLISION");
        expect(codes(d)).not.toContain("FAILED_TO_YIELD");
        expect(d.oracle.event).toBe(false);
        expect(d.oracle.prioritySet).toEqual([]);
        expect(d.oracle.otherContactWith).toBe("sc-rbg-follower");
        // The car he hit was past his mouth by its whole length and more when he entered.
        expect(d.oracle.cars["sc-rbg-follower"]!.runAtEntryM!).toBeLessThan(-2);
        expect(d.oracle.cars["sc-rbg-lead"]!.runAtEntryM!).toBeLessThan(-10);
        expect(d.out.result.score).toBe(10);
      });
    }

    it("the same act on the synced lessons (wait 6 s, enter at 17 км/ч, into the back of the car he let by): COLLISION only", () => {
      for (const [spec, id] of [
        [SC_ROUNDABOUT_ENTRY, "sc-rb-circulating"],
        [SC_RB_EXIT_SIGNAL, "sc-rbx-circulating"],
      ] as const) {
        const d = driveWithOracle(compileScenario(spec, 1), RAW, lineStop(6, 17));
        expect(codes(d), spec.id).toContain("COLLISION");
        expect(codes(d), spec.id).not.toContain("FAILED_TO_YIELD");
        expect(d.oracle.otherContactWith, spec.id).toBe(id);
        expect(d.oracle.cars[id]!.runAtEntryM!, spec.id).toBeLessThan(-2);
      }
    });

    it("L5 — three cars: entering behind the second and AHEAD of the third, which has to brake, is billed by the THIRD car and by no other", () => {
      const d = run(5, lineStop(8, 17));
      expect(codes(d)).toContain("FAILED_TO_YIELD");
      expect(d.oracle.prioritySet).toEqual(["sc-rbg-third"]);
      expect(d.oracle.forcedBy).toBe("sc-rbg-third");
      // The car he then ran into is the one he had let by — not the ground of the bill.
      expect(d.oracle.otherContactWith).toBe("sc-rbg-follower");
    });
  });

  describe("R3-V3 — a window measured in degrees cut both ways; the mouth does not", () => {
    it("THE QUICKER SLOW ENTRY: wait 30 s, in at 5 км/ч and on round at 9.5 — the lead, 32 m short of his mouth when he entered, brakes before it gets there: billed", () => {
      // Round 3: not billed, «0 т., passed» — the lead started braking at 37° swept.
      const d = run(1, lineStop(30, 5, 9.5));
      expect(d.billedT).not.toBeNull();
      expect(d.oracle.forcedBy).toBe("sc-rbg-lead");
      const lead = d.oracle.cars["sc-rbg-lead"]!;
      expect(lead.runAtEntryM!).toBeGreaterThan(28);
      expect(lead.runAtForcedM!).toBeGreaterThan(0.5); // outside the boundary band
      expect(d.commended).toBe(false);
    });

    it("THE WALKING-PACE CREEP, behind the platoon, that has LEFT HIS MOUTH before the cars he let by are half a lap round: wait 6 s, in at 3 км/ч — they catch his crawl and brake behind him half a minute later: not this fault", () => {
      // Round 3: billed 32–37 s after he entered, for a car that was 13–19 m PAST him then.
      const d = run(1, lineStop(6, 3));
      expect(d.billedT).toBeNull();
      expect(d.oracle.event).toBe(false);
      expect(d.oracle.prioritySet).toEqual([]);
      const lead = d.oracle.cars["sc-rbg-lead"]!;
      expect(lead.runAtEntryM!).toBeLessThan(-10);
      // His rear end was past the mouth with the lead still 18 m short of the
      // approaching half: the set had closed long before it could join.
      expect(d.oracle.setClosedHow).toBe("passed");
      expect(lead.marginAtCloseM!).toBeGreaterThan(10);
      // They did brake for him in the end — recorded, not graded here, and not praised.
      expect(d.oracle.maxNotCountedShedMps).toBeGreaterThan(1);
      expect(d.commended).toBe(false);
    });

    it("…ROUND 5 — THE SAME CREEP AT 1.5 км/ч IS STILL IN HIS MOUTH WHEN THE LEAD IS HALF A LAP ROUND (his rear end 2.3 m short of leaving it), and 18 s later the lead has to brake 6 m before its own tail is past that mouth: billed — a car forced to brake before the mouth he had not left when it was coming, not 35° of ring", () => {
      // Round 4: not billed (the lead had gone by on the entry frame). Round 3
      // billed it too, by its window. The verifier's R4-V2 counts 65 such
      // creeps in 328 (lead 2.90 → 0.32 m/s; 0 т., passed).
      const d = run(1, lineStop(6, 1.5));
      const lead = d.oracle.cars["sc-rbg-lead"]!;
      expect(lead.runAtEntryM!).toBeLessThan(-10); // it had gone by when his nose came on
      expect(lead.joinedLateT!).toBeGreaterThan(d.oracle.enteredT! + 3);
      expect(lead.hisRunAtJoinM!).toBeGreaterThan(1.5); // he was still 2.3 m from having left the mouth
      expect(d.oracle.setClosedT!).toBeGreaterThan(lead.joinedLateT! + 5); // …and took 8 s more to leave it
      expect(d.billedT).not.toBeNull();
      expect(d.oracle.forcedBy).toBe("sc-rbg-lead");
      expect(d.oracle.groundedByLateJoiner).toBe(true);
      expect(lead.runAtForcedM!).toBeGreaterThan(5); // outside the boundary band
      expect(d.commended).toBe(false);
      expect(d.voicePraisedT).toBeNull();
    });

    it("A CAR A THIRD OF A LAP AWAY THAT CLEARS THE MOUTH UNBRAKED: wait 26 s, in at 5 км/ч — the lead is 43 m short of his mouth, goes by it without lifting, and only then catches his crawl: not billed, not praised", () => {
      const d = run(1, lineStop(26, 5));
      const lead = d.oracle.cars["sc-rbg-lead"]!;
      expect(lead.inP).toBe(true);
      expect(lead.runAtEntryM!).toBeGreaterThan(40);
      expect(lead.clearedT).not.toBeNull();
      expect(lead.shedBeforeClearMps).toBe(0);
      expect(lead.shedNotCountedMps).toBeGreaterThan(1);
      expect(d.billedT).toBeNull();
      expect(d.oracle.event).toBe(false);
      expect(d.commended).toBe(false);
    });

    it("…and the same creep four seconds later, when the lead reaches the mouth with him still in its way and brakes a metre short of clearing it: billed", () => {
      const d = run(1, lineStop(30, 5));
      const lead = d.oracle.cars["sc-rbg-lead"]!;
      expect(lead.runAtEntryM!).toBeGreaterThan(28);
      expect(lead.runAtForcedM!).toBeGreaterThan(0.5);
      expect(d.billedT).not.toBeNull();
      expect(d.oracle.forcedBy).toBe("sc-rbg-lead");
    });
  });

  describe("THE MOUTH BOUNDARY, both sides, on the live chain", () => {
    it("WHO IS IN THE SET: the follower's tail 4 m short of his mouth when he enters (wait 5.5 s) — in the set, braked and touched, billed; 3 m past it (wait 8 s) — the car he let by, a collision only", () => {
      const ahead = run(1, lineStop(5.5, 17));
      expect(ahead.oracle.cars["sc-rbg-follower"]!.runAtEntryM!).toBeGreaterThan(3);
      expect(ahead.oracle.prioritySet).toEqual(["sc-rbg-follower"]);
      expect(codes(ahead)).toContain("FAILED_TO_YIELD");
      expect(ahead.oracle.forcedBy).toBe("sc-rbg-follower");
      const behind = run(1, lineStop(8, 17));
      expect(behind.oracle.cars["sc-rbg-follower"]!.runAtEntryM!).toBeLessThan(-2);
      expect(codes(behind)).not.toContain("FAILED_TO_YIELD");
      expect(codes(behind)).toContain("COLLISION");
    });

    it("WHEN A CAR HAS CLEARED: the lead brakes for his crawl 1 m before its tail is past the mouth (wait 30 s) — billed; it is past by the time it has to (wait 29 s) — not billed, though it then loses far more", () => {
      const before = run(1, lineStop(30, 5));
      expect(before.oracle.cars["sc-rbg-lead"]!.runAtForcedM!).toBeGreaterThan(0.5);
      expect(before.billedT).not.toBeNull();
      const after = run(1, lineStop(29, 5));
      const lead = after.oracle.cars["sc-rbg-lead"]!;
      expect(lead.inP).toBe(true);
      expect(lead.shedBeforeClearMps).toBe(0);
      expect(lead.shedNotCountedMps).toBeGreaterThan(before.oracle.cars["sc-rbg-lead"]!.shedBeforeClearMps);
      expect(after.billedT).toBeNull();
      expect(after.commended).toBe(false);
    });
  });

  describe("R4-3 — a sub-threshold easing is not billed and is not praised", () => {
    for (const level of [1, 5] as const) {
      it(`L${level}: wait 37.5 s, enter at 11 км/ч — the lead, 15 m short of his mouth, eases 0.2 m/s for him: 0 т., and no «Правилно отстъпено предимство»`, () => {
        // Round 3 praised this class (wait 38.5 s at 14 км/ч, lead 2.90 → 2.72).
        const d = run(level, lineStop(37.5, 11));
        expect(d.billedT).toBeNull();
        expect(d.oracle.event).toBe(false);
        expect(d.oracle.maxPShedMps).toBeGreaterThan(0.05);
        expect(d.oracle.maxPShedMps).toBeLessThan(ORACLE_FORCED_SHED_MPS - 0.05);
        expect(d.commended).toBe(false);
        expect(d.out.result.score).toBe(0);
      });

      it(`L${level}: half a second earlier nobody eases at all — commended; half a second later the lead loses 1 m/s — billed`, () => {
        const clean = run(level, lineStop(37, 11));
        expect(clean.oracle.maxPShedMps).toBe(0);
        expect(clean.billedT).toBeNull();
        expect(clean.commended).toBe(true);
        const forced = run(level, lineStop(38, 11));
        expect(forced.billedT).not.toBeNull();
        expect(forced.commended).toBe(false);
      });
    }
  });
});

describe("THE INSTRUCTOR'S VOICE — «Интервалът беше добър … при влизането не беше отчетено нарушение на предимството» is never said over an entry that is then billed", () => {
  // With the 35° window gone a car he came on ahead of can be made to brake for
  // him long after the 45° of ring the voice used to wait for. MEASURED on the
  // round-4 conviction with the voice still waiting for the arc alone: these
  // drives were told their gap was good and billed 0.03–0.78 s later.
  const busy = (level: ScenarioLevel) => compileScenario(SC_RB_BUSY_GAP, level);
  const PRAISED_THEN_BILLED: Array<[string, ScenarioSpec, ScenarioLevel, DriveScript]> = [
    ["busy-gap L1: wait 34 s, in at 7 км/ч ahead of the returning lead", SC_RB_BUSY_GAP, 1, lineStop(34, 7)],
    ["busy-gap L5: the same", SC_RB_BUSY_GAP, 5, lineStop(34, 7)],
    ["busy-gap L1: wait 32 s, in at 12 км/ч, slowing to 3 км/ч 12 m in", SC_RB_BUSY_GAP, 1, slowOnRing(32, 12, 12, 3)],
    ["busy-gap L1: wait 36 s, in at 12 км/ч, slowing to 1.5 км/ч 18 m in", SC_RB_BUSY_GAP, 1, slowOnRing(36, 12, 18, 1.5)],
    ["entry L1: wait 20 s, in at 3 км/ч", SC_ROUNDABOUT_ENTRY, 1, singleStop(20, 3)],
    ["exit-signal L1: wait 20 s, in at 3 км/ч", SC_RB_EXIT_SIGNAL, 1, singleStop(20, 3)],
    ["exit-signal L5: wait 8 s, in at 17 км/ч, slowing to 1.5 км/ч 12 m in", SC_RB_EXIT_SIGNAL, 5, slowOnRing(8, 17, 12, 1.5)],
  ];
  for (const [name, spec, level, script] of PRAISED_THEN_BILLED) {
    it(`${name}: billed — and the voice says nothing about the gap`, () => {
      const d = driveWithOracle(compileScenario(spec, level), RAW, script);
      expect(d.billedT).not.toBeNull();
      expect(d.oracle.event).toBe(true);
      expect(d.voicePraisedT).toBeNull();
    });
  }

  it("THE CONTROL — the voice has not simply gone quiet: the patient entry behind the platoon (nobody had priority over it) is told its gap was good, on the ring", () => {
    const d = driveWithOracle(busy(1), RAW, singleStop(12, 17));
    expect(d.oracle.prioritySet).toEqual([]);
    expect(d.billedT).toBeNull();
    expect(d.voicePraisedT).not.toBeNull();
    expect(d.voicePraisedT!).toBeGreaterThan(d.oracle.enteredT!);
  });

  it("…and an entry with a car still to come to his mouth is told only once that car has gone by it unbraked — later than the arc alone would have spoken, or not at all", () => {
    // Wait 36 s, in at 17 км/ч: the lead is 20 m short of his mouth, and never has to lift.
    const d = driveWithOracle(busy(1), RAW, singleStop(36, 17));
    const lead = d.oracle.cars["sc-rbg-lead"]!;
    expect(lead.inP).toBe(true);
    expect(lead.shedBeforeClearMps).toBe(0);
    expect(d.billedT).toBeNull();
    if (d.voicePraisedT !== null) {
      expect(lead.clearedT).not.toBeNull();
      expect(d.voicePraisedT).toBeGreaterThanOrEqual(lead.clearedT!);
    }
  });
});

describe("THE INSTRUCTOR'S VOICE AND R4-3 — «Интервалът беше добър … без движещият се в кръга да намалява заради теб» is not said over an entry somebody paid for, billed or not", () => {
  // MEASURED on the round-4 tree before the voice read the tracker's «paid
  // for»: 7,862 live-chain drives, 3,111 told their gap was good — 12 of them
  // after a car with priority had eased 0.02–0.20 m/s for them (not billed,
  // not commended, and praised aloud), and one after touching a circulating
  // car at walking pace with no collision billed. These are those drives.
  const EASED: Array<[string, ScenarioSpec, ScenarioLevel, DriveScript, string]> = [
    ["busy-gap L1: stop short 3 s, creep 5 км/ч to the line, wait 32 s, in at 17 км/ч — the returning lead eases 0.18 m/s", SC_RB_BUSY_GAP, 1, twoStop(3, 5, 32, 17), "sc-rbg-lead"],
    ["busy-gap L5: the same", SC_RB_BUSY_GAP, 5, twoStop(3, 5, 32, 17), "sc-rbg-lead"],
    ["entry L2: creep 5 км/ч to the line, wait 32 s, in at 9 км/ч — the car eases 0.10 m/s", SC_ROUNDABOUT_ENTRY, 2, twoStop(0, 5, 32, 9), "sc-rb-circulating"],
    ["exit-signal L2: stop short 3 s, creep 9 км/ч, wait 20 s, in at 5 км/ч — the car eases 0.20 m/s", SC_RB_EXIT_SIGNAL, 2, twoStop(3, 9, 20, 5), "sc-rbx-circulating"],
  ];
  for (const [name, spec, level, script, id] of EASED) {
    it(`${name}: not billed, not commended — and the voice says nothing about the gap`, () => {
      const d = driveWithOracle(compileScenario(spec, level), RAW, script);
      const car = d.oracle.cars[id]!;
      expect(car.inP).toBe(true);
      expect(car.shedBeforeClearMps).toBeGreaterThan(0.05);
      expect(car.shedBeforeClearMps).toBeLessThan(ORACLE_FORCED_SHED_MPS - 0.05);
      expect(d.billedT).toBeNull();
      expect(d.oracle.event).toBe(false);
      expect(d.commended).toBe(false);
      expect(d.voicePraisedT).toBeNull();
    });
  }

  it("exit-signal L2: wait 34 s, in at 3 км/ч — he nudges the car he had let by at walking pace (no collision billed, no entry fault): the voice does not call that gap good afterwards", () => {
    const d = driveWithOracle(compileScenario(SC_RB_EXIT_SIGNAL, 2), RAW, singleStop(34, 3));
    expect(d.oracle.otherContactT).not.toBeNull();
    expect(d.oracle.contactT).toBeNull();
    expect(d.billedT).toBeNull();
    expect(d.out.violationCodes).not.toContain("COLLISION");
    expect(d.commended).toBe(false);
    expect(d.voicePraisedT).toBeNull();
  });

  it("THE CONTROL — it has not gone quiet over entries that cost nobody anything: half a second earlier than the busy-gap easing nobody lifts, and the gap is called good", () => {
    const d = driveWithOracle(compileScenario(SC_RB_BUSY_GAP, 1), RAW, lineStop(37, 11));
    expect(d.oracle.maxPShedMps).toBe(0);
    expect(d.oracle.firstPShedT).toBeNull();
    expect(d.billedT).toBeNull();
    expect(d.commended).toBe(true);
    if (d.voicePraisedT !== null) {
      const paid = Math.min(d.oracle.notCountedForcedT ?? Infinity, d.oracle.otherContactT ?? Infinity);
      expect(d.voicePraisedT).toBeLessThan(paid);
    }
  });

  it("WHAT IT CANNOT KNOW IT DOES NOT TAKE BACK: a walking-pace creep in behind the platoon is told its gap was good on the ring — the cars he let by only catch his crawl half a minute later", () => {
    const d = driveWithOracle(compileScenario(SC_ROUNDABOUT_ENTRY, 1), RAW, singleStop(10, 3));
    expect(d.billedT).toBeNull();
    expect(d.voicePraisedT).not.toBeNull();
    expect(d.oracle.notCountedForcedT).not.toBeNull();
    expect(d.oracle.notCountedForcedT!).toBeGreaterThan(d.voicePraisedT!);
    expect(d.commended).toBe(false);
  });
});

describe("ROUND 5 — the drive that conditioned round 4 (verifier R4-V2): a nose resting on the ring's edge, and the pull-out in front of the car that has come round", () => {
  // Round 4 fixed the priority set on the frame his nose first came onto the
  // ring. So: stop on the line, wait 18 s, creep until the nose is 0.15 m over
  // the ring's edge — both platoon cars went by seconds ago, nobody is in the
  // set — stand there 20 s, and pull out at 17 км/ч with the returning lead
  // 3 m short of the mouth. It brakes 2.90 → 0.00 m/s. Round 4: «codes [],
  // 0 т., passed». On main that barge was billed.
  const busy = (level: ScenarioLevel) => compileScenario(SC_RB_BUSY_GAP, level);
  const run = (level: ScenarioLevel, script: DriveScript) => driveWithOracle(busy(level), RAW, script);
  const codes = (d: OracleDrive): string[] => d.out.violationCodes;

  for (const level of LEVELS) {
    it(`L${level}: wait 18 s, nose 0.15 m over the edge, stand 20 s, pull out at 17 км/ч in front of the returning lead — it brakes before its tail has cleared the mouth, and he answers for it`, () => {
      const d = run(level, nosePoke(18, 6, 5.6, 20, 17));
      const lead = d.oracle.cars["sc-rbg-lead"]!;
      // The pose: the nose a hand's width onto the carriageway, for 20 s.
      expect(d.oracle.restNoseInM!).toBeGreaterThan(0.1);
      expect(d.oracle.restNoseInM!).toBeLessThan(0.2);
      if (level !== 4) expect(d.oracle.restOpenSec).toBeGreaterThan(19.5);
      // The lead had gone by when his nose came on — 44 m past the mouth — and
      // joined the set when it came round to the approaching half, 3.5 s later.
      expect(lead.runAtEntryM!).toBeLessThan(-40);
      expect(lead.joinedLateT!).toBeGreaterThan(d.oracle.enteredT! + 2);
      expect(lead.joinedLateT!).toBeLessThan(d.oracle.enteredT! + 5);
      expect(lead.hisRunAtJoinM!).toBeGreaterThan(3); // he was 3.4 m from having left his mouth: nowhere near the line
      // …and was forced 5 m short of clearing the mouth, with him moving.
      expect(codes(d)).toContain("FAILED_TO_YIELD");
      expect(d.oracle.forcedBy).toBe("sc-rbg-lead");
      expect(d.oracle.groundedByLateJoiner).toBe(true);
      expect(d.oracle.forcedWhileStanding).toBe(false);
      expect(lead.runAtForcedM!).toBeGreaterThan(4);
      expect(Math.abs(d.billedT! - d.oracle.forcedT!)).toBeLessThan(1.5 / 60);
      expect(d.commended).toBe(false);
      expect(d.voicePraisedT).toBeNull();
      if (level !== 4) {
        expect(lead.minSpeedMps).toBe(0); // it was brought to a stop (the exam rung ends on the bill)
        expect(d.oracle.setClosedHow).toBe("passed");
        expect(d.oracle.setClosedT!).toBeGreaterThan(d.billedT!); // he was still in his mouth when it had to brake
      }
    });
  }

  it("THE FAMILY ROUND IT: the nose 0.05 m, 0.28 m and 0.41 m over the edge, the same 20 s, the same pull-out — billed each time, by the car that came round", () => {
    for (const [along, lo, hi] of [
      [5.45, 0.03, 0.07],
      [5.8, 0.25, 0.31],
      [6.0, 0.38, 0.44],
    ] as const) {
      const d = run(1, nosePoke(18, 6, along, 20, 17));
      expect(d.oracle.restNoseInM!, `along ${along}`).toBeGreaterThan(lo);
      expect(d.oracle.restNoseInM!, `along ${along}`).toBeLessThan(hi);
      expect(codes(d), `along ${along}`).toContain("FAILED_TO_YIELD");
      expect(d.oracle.groundedByLateJoiner, `along ${along}`).toBe(true);
      expect(d.oracle.forcedWhileStanding, `along ${along}`).toBe(false);
    }
  });

  it("…AT EVERY PULL-OUT SPEED: 5, 9, 12 and 25 км/ч after 19 s — the lead has to brake for each", () => {
    for (const kmh of [5, 9, 12, 25]) {
      const d = run(1, nosePoke(18, 6, 5.6, 19, kmh));
      expect(codes(d), `${kmh} км/ч`).toContain("FAILED_TO_YIELD");
      expect(d.oracle.forcedBy, `${kmh} км/ч`).toBe("sc-rbg-lead");
      expect(d.oracle.groundedByLateJoiner, `${kmh} км/ч`).toBe(true);
    }
  });

  it("CLEAN WHEN NOBODY IS AFFECTED: the same nose, pulling out after 8, 12, 16 or 18 s — the cars are a third of a lap away and never lift: 0 т., and the patient entry is still commended", () => {
    for (const hold of [8, 12, 16, 18]) {
      const d = run(1, nosePoke(18, 6, 5.6, hold, 17));
      expect(d.billedT, `hold ${hold}`).toBeNull();
      expect(d.oracle.event, `hold ${hold}`).toBe(false);
      expect(d.oracle.maxPShedMps, `hold ${hold}`).toBe(0);
      expect(d.out.result.score, `hold ${hold}`).toBe(0);
      expect(d.commended, `hold ${hold}`).toBe(true);
    }
  });

  for (const level of [1, 5] as const) {
    it(`L${level}: THE NOSE RESTS FOR A FULL LAP — 45 s on the edge, every car of the platoon goes by it again, nobody brakes: it costs nothing, and the entry after it is commended`, () => {
      const d = run(level, nosePoke(18, 6, 5.6, 45, 17));
      expect(d.oracle.restOpenSec).toBeGreaterThan(44);
      // Every car came into the set on its way round, and cleared the mouth untouched.
      const cast = level === 5 ? ["sc-rbg-lead", "sc-rbg-follower", "sc-rbg-third"] : ["sc-rbg-lead", "sc-rbg-follower"];
      expect([...d.oracle.lateJoiners].sort()).toEqual([...cast].sort());
      for (const id of cast) {
        expect(d.oracle.cars[id]!.clearedT, id).not.toBeNull();
        expect(d.oracle.cars[id]!.shedBeforeClearMps, id).toBe(0);
      }
      expect(d.billedT).toBeNull();
      expect(d.oracle.event).toBe(false);
      expect(codes(d)).toEqual([]);
      expect(d.out.result.score).toBe(0);
      expect(d.commended).toBe(true);
    });
  }

  it("A CAR THAT HAS TO BRAKE FOR THE RESTING NOSE: 0.54 m and 0.66 m over the edge the returning lead brakes for it while he just stands there — billed, at rest", () => {
    for (const along of [6.2, 6.4]) {
      const d = run(1, nosePoke(18, 6, along, 20, 17));
      expect(d.oracle.restNoseInM!, `along ${along}`).toBeGreaterThan(0.5);
      expect(codes(d), `along ${along}`).toContain("FAILED_TO_YIELD");
      expect(d.oracle.forcedBy, `along ${along}`).toBe("sc-rbg-lead");
      expect(d.oracle.groundedByLateJoiner, `along ${along}`).toBe(true);
      expect(d.oracle.forcedWhileStanding, `along ${along}`).toBe(true);
      expect(d.oracle.cars["sc-rbg-lead"]!.runAtForcedM!, `along ${along}`).toBeGreaterThan(0.5);
    }
  });

  describe("A LATE JOINER THAT EASES UNDER THE LINE takes the praise and the voice line away (R4-3, late joiners included)", () => {
    for (const level of [1, 5] as const) {
      it(`L${level}: pull out after 18.2 s — the returning lead eases 0.16 m/s for him before it clears his mouth: not billed, not commended, and the voice says nothing about the gap`, () => {
        const d = run(level, nosePoke(18, 6, 5.6, 18.2, 17));
        const lead = d.oracle.cars["sc-rbg-lead"]!;
        expect(lead.joinedLateT).not.toBeNull();
        expect(lead.shedBeforeClearMps).toBeGreaterThan(0.1);
        expect(lead.shedBeforeClearMps).toBeLessThan(ORACLE_FORCED_SHED_MPS - 0.1); // outside the threshold band
        expect(d.billedT).toBeNull();
        expect(d.oracle.event).toBe(false);
        expect(d.out.result.score).toBe(0);
        expect(d.commended).toBe(false);
        expect(d.voicePraisedT).toBeNull();
      });

      it(`L${level}: a tenth of a second earlier nobody eases — commended, and the gap is called good; two tenths later the lead loses 0.43 m/s — billed`, () => {
        const clean = run(level, nosePoke(18, 6, 5.6, 18.1, 17));
        expect(clean.oracle.maxPShedMps).toBe(0);
        expect(clean.billedT).toBeNull();
        expect(clean.commended).toBe(true);
        expect(clean.voicePraisedT).not.toBeNull();
        const forced = run(level, nosePoke(18, 6, 5.6, 18.4, 17));
        expect(forced.oracle.maxPShedMps).toBeGreaterThan(ORACLE_FORCED_SHED_MPS + 0.1);
        expect(forced.billedT).not.toBeNull();
        expect(forced.oracle.groundedByLateJoiner).toBe(true);
        expect(forced.commended).toBe(false);
        expect(forced.voicePraisedT).toBeNull();
      });
    }
  });

  it("THE OTHER TWO LESSONS, whose one car is synced to his approach: nose over the edge after it has gone by, stand 36 s while it drives the lap, pull out in front of it — billed on both; pull out after 33 s, well ahead of it — clean on both", () => {
    for (const [spec, id] of [
      [SC_ROUNDABOUT_ENTRY, "sc-rb-circulating"],
      [SC_RB_EXIT_SIGNAL, "sc-rbx-circulating"],
    ] as const) {
      const lesson = compileScenario(spec, 1);
      const barge = driveWithOracle(lesson, RAW, nosePoke(2, 6, 5.6, 36, 17));
      // The car was just going by his nose when it came on, cleared the mouth
      // untouched, and came back into the set half a lap later.
      expect(barge.oracle.cars[id]!.joinedLateT!, spec.id).toBeGreaterThan(barge.oracle.enteredT! + 10);
      expect(codes(barge), spec.id).toContain("FAILED_TO_YIELD");
      expect(barge.oracle.forcedBy, spec.id).toBe(id);
      expect(barge.oracle.groundedByLateJoiner, spec.id).toBe(true);
      const clean = driveWithOracle(lesson, RAW, nosePoke(2, 6, 5.6, 33, 17));
      expect(clean.billedT, spec.id).toBeNull();
      expect(clean.oracle.event, spec.id).toBe(false);
      expect(clean.oracle.maxPShedMps, spec.id).toBe(0);
    }
  });

  it("NOSE-ROCKING: 0.66 m over the edge for 20 s, the returning lead brakes for the nose — billed at rest, before he backs off; the same rock with the nose 0.15 m over, which nobody brakes for, is two clean entries", () => {
    const paid = run(1, noseRock(18, 6, 6.4, 20, 3));
    expect(paid.oracle.entries).toBe(2);
    expect(codes(paid)).toContain("FAILED_TO_YIELD");
    expect(paid.oracle.groundedByLateJoiner).toBe(true);
    expect(paid.oracle.forcedWhileStanding).toBe(true);
    expect(paid.billedT!).toBeLessThan(paid.oracle.setClosedT!);
    const clean = run(1, noseRock(18, 6, 5.6, 3, 20));
    expect(clean.oracle.entries).toBe(2);
    expect(clean.oracle.setClosedHow).toBe("backedOff");
    expect(clean.billedT).toBeNull();
    expect(clean.oracle.event).toBe(false);
    expect(clean.out.result.score).toBe(0);
  });

  it("ONCE HE HAS LEFT HIS MOUTH THE SET TAKES NO NEW MEMBER — BOTH SIDES, on the live chain: the creep in behind the platoon at 2.5 км/ч has left the mouth 10 m of the lead's run before it is half a lap round (not this fault, whatever it does later); at 1.5 км/ч he is still in it (billed when it has to brake before the mouth)", () => {
    const left = run(1, lineStop(6, 2.5));
    expect(left.oracle.setClosedHow).toBe("passed");
    expect(left.oracle.lateJoiners).toEqual([]);
    expect(left.oracle.prioritySet).toEqual([]);
    expect(left.oracle.cars["sc-rbg-lead"]!.marginAtCloseM!).toBeGreaterThan(5); // outside the boundary band
    expect(left.billedT).toBeNull();
    expect(left.oracle.maxNotCountedShedMps).toBeGreaterThan(1); // the lead did brake behind his crawl in the end
    expect(left.commended).toBe(false);
    const still = run(1, lineStop(6, 1.5));
    expect(still.oracle.lateJoiners).toContain("sc-rbg-lead");
    expect(still.oracle.cars["sc-rbg-lead"]!.hisRunAtJoinM!).toBeGreaterThan(1.5);
    expect(still.billedT).not.toBeNull();
  });
});

describe("the verdict is a fact about the drive, not about the frame rate", () => {
  // A car's account is a running total of speed, so it does not care how the
  // frames fall. The same drives at a steady 60 Hz, at 30 Hz and on a phone
  // cadence with a 7 s stall in it (rapier's ceiling turns that into 0.5 s of
  // lesson clock, and the traffic system sub-steps it) get the same verdict,
  // from an oracle stepped on the same clock.
  const CADENCES: Array<[string, readonly number[] | undefined]> = [
    ["60 Hz", undefined],
    ["30 Hz", [1 / 30]],
    ["phone", [1 / 60, 1 / 24, 1 / 60, 1 / 45, 1 / 20, 1 / 60, 1 / 60, 7, 1 / 30, 1 / 60]],
  ];
  const lesson = compileScenario(SC_RB_BUSY_GAP, 1);
  const CASES: Array<[string, DriveScript, boolean]> = [
    ["the patient entry behind the platoon (wait 12 s)", singleStop(12, 17), false],
    ["the two-stop creep (w76)", twoStop(2, 4.9, 12, 17), false],
    ["a slow entry ahead of the returning lead (R2-V2)", singleStop(32, 5), true],
    ["a long wait that affects nobody (36 s)", singleStop(36, 17), false],
    ["a late entry in front of the lead (40 s)", singleStop(40, 17), true],
    ["entering ahead of the lead and stopping 2 s in its lane (R3-V1)", stopOnRing(38, 17, 12, 2), true],
    ["letting the platoon by and running into the back of its last car (R3-V2)", lineStop(8, 17), false],
    ["the nose-poke barge: 20 s on the ring's edge, then out in front of the returning lead (R4-V2)", nosePoke(18, 6, 5.6, 20, 17), true],
    ["the nose resting 12 s on the edge and pulling out with nobody near", nosePoke(18, 6, 5.6, 12, 17), false],
  ];
  for (const [name, script, billed] of CASES) {
    it(`${name}: ${billed ? "billed" : "not billed"} at every cadence, and the oracle agrees at each`, () => {
      for (const [cadence, frameDeltas] of CADENCES) {
        const d = driveWithOracle(lesson, RAW, script, frameDeltas ? { frameDeltas } : {});
        expect(d.billedT !== null, `${cadence}: ${d.out.violationCodes.join(",")}`).toBe(billed);
        expect(d.oracle.event, cadence).toBe(billed);
      }
    });
  }
});

describe("THE APPROACH IS NOT AN INPUT — the same entry is the same verdict, however carefully he came to the line", () => {
  /**
   * sc-rb-busy-gap's platoon is a metronome from the moment he passes 60 m from
   * the ring (its sync is pinned out), so two drives that LEAVE THE LINE at the
   * same instant, on the same chord at the same speed, are the same entry
   * against the same cars — whatever happened before. The more careful approach
   * (stop short, creep, stop again) takes longer to reach the line, so it is
   * given that much less wait there.
   */
  const lineAt = (script: DriveScript, lesson = compileScenario(SC_RB_BUSY_GAP, 1)): number => {
    // When does the wait at the line begin? The last standstill sample run before the entry.
    const d = driveWithOracle(lesson, RAW, script);
    return d.oracle.enteredT ?? NaN;
  };

  for (const level of LEVELS) {
    it(`sc-rb-busy-gap L${level}: every single-stop entry and its two-stop twin get the same verdict from the same record`, () => {
      const lesson = compileScenario(SC_RB_BUSY_GAP, level);
      // How much later the two-stop approach puts his nose on the ring for the
      // same wait — measured, not assumed.
      const lagSec = lineAt(twoStop(2, 5, 20, 9), lesson) - lineAt(singleStop(20, 9), lesson);
      expect(lagSec).toBeGreaterThan(3);
      const waits = FULL ? range(8, 50, 1) : level === 1 || level === 5 ? [8, 12, 20, 30, 33, 38, 44] : [12, 33];
      const speeds = FULL ? [5, 9, 17] : [5, 17];
      let pairs = 0;
      const flips: string[] = [];
      for (const w of waits) for (const e of speeds) {
        const a = driveWithOracle(lesson, RAW, singleStop(w, e));
        const b = driveWithOracle(lesson, RAW, twoStop(2, 5, w - lagSec, e));
        // Same entry: his nose is on the ring at the same instant.
        expect(Math.abs(a.oracle.enteredT! - b.oracle.enteredT!), `wait=${w} enter=${e}`).toBeLessThan(1.5 / 60);
        pairs++;
        if ((a.billedT !== null) !== (b.billedT !== null)) {
          flips.push(`wait=${w} enter=${e}: single-stop billed=${a.billedT !== null}, two-stop billed=${b.billedT !== null}`);
        }
        expect(b.oracle.maxPShedMps, `wait=${w} enter=${e}`).toBeCloseTo(a.oracle.maxPShedMps, 6);
      }
      expect(pairs).toBeGreaterThanOrEqual(4);
      expect(flips).toEqual([]);
    }, 3_600_000);
  }
});
