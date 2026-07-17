/**
 * Trace gate — „Излизане от бензиностанция през тротоара" (sc-merge-from-property
 * on mg-property-v1, ЗДвП чл. 25), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns BOTH of the drill's own
 *      duties as commendations — PEDESTRIAN_YIELDED (it stopped short of the
 *      тротоар and waited the walker fully off) and FULL_STOP_AT_STOP_SIGN (a
 *      real halt on the derived Б2). The staged runners independently agree:
 *      the walker resolves „yielded", the поток resolves „clear".
 *   2. MISTAKE DEMOS grade EXACTLY their authored codeRefs — once each, and on
 *      two DIFFERENT beats: the pavement demo grades PEDESTRIAN_NOT_YIELDED +
 *      COLLISION and never reaches the Б2 (so no stop-sign code can leak); the
 *      flow demo grades FAILED_TO_YIELD and NOTHING else — it clears the walker
 *      correctly, halts on the line, and indicates. Its only fault is priority.
 *   3. THE ORDERING LAW, on the recorded samples: the тротоар (x = 34) sits 6.3 m
 *      OUTSIDE the derived Б2 (x = 27.73), and the pavement demo rests at
 *      x = 31 — past the band, short of the line. That gap is what keeps the two
 *      cards from blurring, so it is asserted rather than assumed.
 *   4. THE TUNED WINDOW, on the staged runner's own clock: the поток is pure
 *      clockwork released by the player's roll-off, so „waited it out" vs „went
 *      anyway" is a TIME fact, not a hope. The shadow crosses the line ~5 s
 *      AFTER the column is past it; the flow demo crosses ~1.7 s BEFORE. Trim
 *      the shadow's wait and it silently becomes the mistake — this assert is
 *      what says so.
 *   5. THE APPROACH IS IDENTICAL ON ALL THREE. Same roll-off speed, same seeded
 *      walker trigger, same metre. The demos differ ONLY in what the driver
 *      decided, which is the whole pedagogy — a demo that also drove faster
 *      would confound the lesson with a speed fault.
 *   6. COMMITTED FILES under content/traces/sc-merge-from-property/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-merge-from-property-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_MERGE_FROM_PROPERTY } from "../../lessons/scenario/templates-merging";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScMergeFromPropertyDrive,
  type ScMergeFromPropertyTraceName,
} from "../scMergeFromProperty";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-merge-from-property";
const NAMES: ScMergeFromPropertyTraceName[] = [
  "shadow-correct",
  "mistake-walk-through",
  "mistake-signal-and-go",
];

/** mg-property-v1 truths (meta.scenario — pinned by mg-property-districts.test.ts). */
const X_WALK = 34; // the тротоар band
const X_LINE = 27.73; // the DERIVED Б2 line
const Y_EXIT = 4.06; // the outbound exit-lane center
const X_LANE = 4.06; // the boulevard's northbound lane center
const EXIT_KMH = 20; // the exit lane's own limit (graced band: 22)

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}
/** Session time of the drive's single Б2 crossing — the moment чл. 25 is
 *  adjudicated. Both the commendation and the violation are emitted by the same
 *  fireLine() call, so either one dates the crossing exactly. */
function lineCrossedAt(d: RecordedDrive): number {
  const e = d.ruleEvents.find(
    (e) => e.code === "FULL_STOP_AT_STOP_SIGN" || e.code === "STOP_SIGN_NO_FULL_STOP",
  );
  return e!.t;
}
/** Session time the потокът's last car is past the player — the runner's own
 *  „clear" resolution, an independent witness to the same clockwork. */
function streamClearedAt(d: RecordedDrive): number {
  return d.outcomes.find((o) => o.eventId === "sc-mfp-stream")!.tSec;
}

const district = loadDistrict("mg-property-v1");
const drives = new Map<ScMergeFromPropertyTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScMergeFromPropertyDrive(district, n)]),
);

describe("sc-merge-from-property — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("earns BOTH of the drill's duties: the pedestrian yielded AND the full stop", () => {
    // Not decoration — these two commendations ARE чл. 25's two halves, and
    // they are the only positive evidence this template can produce. (No
    // CLEAN_DRIVING: that needs cleanDrivingDistanceM = 250 m of violation-free
    // travel and this whole drill is ~165 m. A property exit is a short story;
    // the badge would need 240 m of empty run-out bolted onto the map to earn,
    // and the pedagogy ends at the merge.)
    const codes = commendationCodes(shadow);
    expect(codes).toContain("PEDESTRIAN_YIELDED");
    expect(codes).toContain("FULL_STOP_AT_STOP_SIGN");
  });

  it("the RUNNERS own channels agree: the walker „yielded“, the поток „clear“", () => {
    // Two independent witnesses to the same drive the reducer just acquitted.
    // The walker runner resolves „yielded" only when it SAW the car at/below
    // 12 km/h while she was on the carriageway — i.e. it watched the stop
    // happen, rather than inferring it from the absence of a code.
    const walker = shadow.outcomes.find((o) => o.eventId === "sc-mfp-walker")!;
    expect(walker.kind).toBe("pedestrianDartOut");
    expect(walker.success).toBe(true);
    expect(walker.detail).toBe("yielded");
    const stream = shadow.outcomes.find((o) => o.eventId === "sc-mfp-stream")!;
    expect(stream.kind).toBe("oncomingStream");
    expect(stream.detail).toBe("clear");
  });

  it("THE TUNED WINDOW: it crosses the Б2 only AFTER the whole column is past", () => {
    // The tuning the shadow lives or dies on, asserted rather than hoped for.
    // The поток is clockwork (released by the player's own roll-off), so this
    // margin is a fact about the script, not about luck: shave the 9 s wait and
    // the shadow starts grading FAILED_TO_YIELD — i.e. it silently becomes the
    // very mistake it is supposed to be the answer to.
    const margin = lineCrossedAt(shadow) - streamClearedAt(shadow);
    expect(margin).toBeGreaterThan(3);
  });

  it("it stops SHORT of the тротоар, and only then rests on the Б2 — in that order", () => {
    // „Спри пред тротоара, не върху него": the first rest is a real halt on the
    // property side of the band. A drive that rested ON the band would be
    // standing in the pedestrian's way while yielding to him.
    const rests = shadow.trace.samples.filter((s) => s.speedKmh < 1.5 && s.y < 6);
    const restXs = [...new Set(rests.map((s) => Math.round(s.x * 10) / 10))];
    expect(restXs.some((x) => x > X_WALK + 2)).toBe(true); // short of the band…
    expect(restXs.some((x) => x > X_LINE && x < X_WALK)).toBe(true); // …then on the line
    // …and it never rests ON the band itself.
    expect(restXs.some((x) => Math.abs(x - X_WALK) < 1.5)).toBe(false);
  });

  it("uses the taught observation and narrates the drive", () => {
    const kinds = shadow.trace.events.map((e) => e.kind);
    // The two rubric moments: along the pavement, and left down the boulevard.
    expect(kinds.filter((k) => k === "glance-left").length).toBeGreaterThanOrEqual(3);
    expect(kinds.filter((k) => k === "glance-right").length).toBeGreaterThanOrEqual(2);
    // The last look left happens BEFORE the car leaves the line — the decision
    // is made on evidence, not after the wheels move.
    const lineLeave = shadow.trace.samples.find((s) => s.x < X_LINE && s.y < 6)!.tSec;
    const lastLeft = Math.max(
      ...shadow.trace.events.filter((e) => e.kind === "glance-left").map((e) => e.tSec),
    );
    expect(lastLeft).toBeLessThan(lineLeave);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(6);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });

  it("it indicates the merge, and only the merge", () => {
    const inds = shadow.trace.samples.filter((s) => s.indicator !== "off");
    expect(inds.length).toBeGreaterThan(0);
    // Right, never left: this is a right turn out of a property.
    for (const s of inds) expect(s.indicator).toBe("right");
    // The signal goes on while the car is still on the exit — before the wheel,
    // not with it (чл. 25's „подаде сигнал" is a warning, not a commentary).
    expect(Math.min(...inds.map((s) => s.x))).toBeLessThan(X_LINE);
    expect(Math.max(...inds.map((s) => s.x))).toBeGreaterThan(X_LINE);
  });
});

describe("sc-merge-from-property — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Изнасяне през тротоара без спиране“: exactly PEDESTRIAN_NOT_YIELDED + COLLISION", () => {
    const drive = drives.get("mistake-walk-through")!;
    const codes = violationCodes(drive);
    expect([...new Set(codes)].sort()).toEqual([...SC_MERGE_FROM_PROPERTY.mistakes[0].codeRefs].sort());
    expect(codes.filter((c) => c === "COLLISION")).toHaveLength(1);
    expect(codes.filter((c) => c === "PEDESTRIAN_NOT_YIELDED")).toHaveLength(1);
    // The demo's whole discipline: it is NOT a speeding demo and NOT a braking
    // demo. It breaks no number — it refuses a duty it never looked for.
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("PEDESTRIAN_CROSSING_TOO_FAST");
    expect(codes).not.toContain("HARSH_BRAKING_NO_CAUSE");
    // The runner agrees it was a contact, not a near miss.
    expect(drive.outcomes.find((o) => o.eventId === "sc-mfp-walker")!.detail).toBe("collision");
  });

  it("the pavement demo dies BEFORE the Б2 — which is why it can never leak a stop-sign code", () => {
    // The ordering law, made checkable on the samples. It rests at x = 31: past
    // the band (so crossingPassed fires and the duty grades) and short of the
    // line (so fireLine never runs). Slide the crossing inside the line and
    // this demo starts billing STOP_SIGN_NO_FULL_STOP on top — two faults on
    // one card, teaching neither.
    const drive = drives.get("mistake-walk-through")!;
    const finalX = drive.trace.samples[drive.trace.samples.length - 1].x;
    expect(finalX).toBeGreaterThan(X_LINE);
    expect(finalX).toBeLessThan(X_WALK);
    expect(Math.min(...drive.trace.samples.map((s) => s.x))).toBeGreaterThan(X_LINE);
    expect(violationCodes(drive)).not.toContain("STOP_SIGN_NO_FULL_STOP");
    expect(violationCodes(drive)).not.toContain("FAILED_TO_YIELD");
  });

  it("„Вливане „с мигача“ пред потока“: exactly FAILED_TO_YIELD, once — and nothing else", () => {
    const drive = drives.get("mistake-signal-and-go")!;
    const codes = violationCodes(drive);
    expect([...new Set(codes)].sort()).toEqual([...SC_MERGE_FROM_PROPERTY.mistakes[1].codeRefs].sort());
    expect(codes.filter((c) => c === "FAILED_TO_YIELD")).toHaveLength(1);
    // The card's entire claim, in asserts: everything up to the line was RIGHT.
    // If any of these leaked, the demo would be „a bad driver" instead of „a
    // good driver with one wrong belief", and the lesson would evaporate.
    expect(codes).not.toContain("PEDESTRIAN_NOT_YIELDED");
    expect(codes).not.toContain("STOP_SIGN_NO_FULL_STOP");
    expect(codes).not.toContain("TURN_WITHOUT_INDICATOR");
    expect(codes).not.toContain("COLLISION");
    // …and the sheet PROVES it: the same drive is commended for the pedestrian
    // and for the full stop it genuinely made.
    const good = commendationCodes(drive);
    expect(good).toContain("PEDESTRIAN_YIELDED");
    expect(good).toContain("FULL_STOP_AT_STOP_SIGN");
  });

  it("the flow demo's TUNED WINDOW: it crosses while the column is still coming", () => {
    // The mirror of the shadow's margin, and the reason the code above fires at
    // all. Both drives make the same full stop at the same metre; the ONLY
    // difference is 7 seconds of patience. That is the template in one number.
    const drive = drives.get("mistake-signal-and-go")!;
    const margin = lineCrossedAt(drive) - streamClearedAt(drive);
    expect(margin).toBeLessThan(-1); // it went BEFORE the column was past
    // …and it went anyway despite looking: the glance is in the trace. The
    // fault is priority, not observation.
    expect(drive.trace.events.some((e) => e.kind === "glance-left")).toBe(true);
    // Nose-to-nose with the column and still no contact: the demo is a forced
    // give-way, not a crash. The crash is the other card.
    expect(violationCodes(drive)).not.toContain("COLLISION");
  });

  it("THE CONTROLLED COMPARISON: all three drives share one approach", () => {
    // The demos differ in DECISIONS, never in driving. Same seeded walker
    // trigger (identical approach speed), same lane, same sub-graced pace — so
    // no card can be dismissed as „well, he was going too fast anyway".
    const approaches = NAMES.map(
      (n) => drives.get(n)!.outcomes.find((o) => o.eventId === "sc-mfp-walker")!.approachSpeedKmh,
    );
    expect(new Set(approaches).size).toBe(1);
    for (const name of NAMES) {
      const drive = drives.get(name)!;
      // Every metre of every exit run is inside the exit's own graced band
      // (20 × 1.1 = 22), so SPEEDING can never colour any of these cards.
      const onExit = drive.trace.samples.filter((s) => s.y < 6 && s.x > 6);
      expect(Math.max(...onExit.map((s) => s.speedKmh)), name).toBeLessThanOrEqual(EXIT_KMH * 1.1);
    }
  });

  it("the map's own law holds on every drive: one lane, one direction, no leakage", () => {
    for (const name of NAMES) {
      const codes = violationCodes(drives.get(name)!);
      // A 1+1 boulevard and a 1+1 exit: the player is always in the only lane
      // his direction has, so none of the lane vocabulary can arm. If any of
      // these ever fired, the drill would be fining the student for driving
      // where the map put him.
      expect(codes, name).not.toContain("NOT_KEEPING_RIGHT");
      expect(codes, name).not.toContain("POOR_LANE_KEEPING");
      expect(codes, name).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR");
      expect(codes, name).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
      expect(codes, name).not.toContain("WRONG_WAY");
      expect(codes, name).not.toContain("SPEEDING_DANGEROUS");
      // The exit is a creep and the merge is gentle: no stab anywhere.
      expect(codes, name).not.toContain("HARSH_BRAKING_NO_CAUSE");
    }
  });

  it("nobody ever drives the wrong bank: the southbound half is never touched", () => {
    for (const name of NAMES) {
      for (const s of drives.get(name)!.trace.samples) {
        expect(s.x, `${name} y=${s.y}`).toBeGreaterThan(0);
      }
      // …and the two drives that reach the boulevard settle on ITS lane.
      const onRoad = drives.get(name)!.trace.samples.filter((s) => s.y > 30);
      for (const s of onRoad) expect(s.x, `${name} y=${s.y}`).toBeCloseTo(X_LANE, 2);
    }
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", SCENARIO_ID);
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", SCENARIO_ID);

  for (const name of NAMES) {
    it(`${SCENARIO_ID}/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
      const serialized = serializeScenarioTrace(drives.get(name)!.trace) + "\n";
      const contentFile = path.join(contentDir, `${name}.trace.json`);
      const publicFile = path.join(publicDir, `${name}.trace.json`);
      if (RECORD) {
        mkdirSync(contentDir, { recursive: true });
        mkdirSync(publicDir, { recursive: true });
        writeFileSync(contentFile, serialized);
        writeFileSync(publicFile, serialized);
      }
      expect(existsSync(contentFile), `${contentFile} missing — run the RECORD_TRACES tool`).toBe(true);
      expect(existsSync(publicFile), `${publicFile} missing — run the RECORD_TRACES tool`).toBe(true);
      expect(readFileSync(contentFile, "utf-8")).toBe(serialized);
      expect(readFileSync(publicFile, "utf-8")).toBe(readFileSync(contentFile, "utf-8"));
      const parsed = parseScenarioTrace(JSON.parse(readFileSync(contentFile, "utf-8")));
      expect(parsed).not.toBeNull();
      expect(parsed!.meta.scenarioId).toBe(SCENARIO_ID);
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    const again = recordScMergeFromPropertyDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_MERGE_FROM_PROPERTY.shadow, ...SC_MERGE_FROM_PROPERTY.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_MERGE_FROM_PROPERTY.shadow.path,
      ...SC_MERGE_FROM_PROPERTY.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });

  it("the template's pinned geometry matches the district it claims (the L7 copy law)", () => {
    const meta = (district as { meta: { scenario: Record<string, unknown> } }).meta.scenario;
    expect(SC_MERGE_FROM_PROPERTY.map.districtId).toBe("mg-property-v1");
    expect(SC_MERGE_FROM_PROPERTY.map.params).toEqual(meta.params);
    expect(meta.stopLineX).toBe(X_LINE);
    expect(meta.exitLaneCenterY).toBe(Y_EXIT);
    // The staged actors are written against the SAME numbers the map publishes.
    const walker = SC_MERGE_FROM_PROPERTY.staged!.find((s) => s.id === "sc-mfp-walker")!;
    expect((walker as { crossingId: string }).crossingId).toBe(meta.primaryCrossingId);
    expect((walker as { crossing: { x: number } }).crossing.x).toBe(X_WALK);
  });
});
