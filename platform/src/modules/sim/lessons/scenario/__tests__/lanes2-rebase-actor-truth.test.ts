/**
 * REBASE 2026-08-22 — the LANES2 rows that were still OPEN after the steered
 * re-drive, measured against the runner and the map instead of against a frame.
 *
 * THE INSTRUMENT CHANGED UNDER THESE ROWS. Every earlier LANES2 defence
 * (`lanes2-sweep161.test.ts`, `lanes2-sweep161-refutation.test.ts`) was written
 * while `tools/mobile/lesson-audit.mjs` could only accelerate and brake, so
 * "the audit could not steer" was a live answer. It is not any more: the 92
 * worst lessons were re-driven with a steering wheel and these four came back
 * with their gates still dark. `sc-ln-boulevard-discipline` is the one that
 * flipped — `.audit-frames/rebase/frames/sc-ln-boulevard-discipline__pc-right`
 * is ИЗДЪРЖАН with all three route tasks ticked (0:34 / 1:22 / 2:01) — and it
 * is the reason the other three needed a cause that is NOT the harness.
 *
 *   §1 sc-ov-being-overtaken — the graded tick «Пусни го да се прибере…»
 *      certified a lane return the shipped runner cannot command. Held here
 *      against `RearTailgaterRunner` itself, driven frame by frame: ONE
 *      `laneShift`, to the oncoming bank, and no second one ever. The day the
 *      runner learns to come home, §1c goes red and the sentence may return.
 *
 *   §2 sc-ov-crest-curve — «There is no crest… the only geometry change is a
 *      gentle right bend with full sight lines». The flat terrain is admitted
 *      and always was (doc 76 reserves hill-ramp; the template header says so).
 *      What NOBODY had ever measured is the half the lesson actually grades:
 *      whether the bend is BLIND. It is — but only because of one 18 × 18 m,
 *      9 m block authored inside the arc, and nothing in the tree held it
 *      there. §2 computes the sight distance from the committed district in
 *      both directions: with the block the driver at the В24 sign sees 229 m of
 *      oncoming road and 141 m at the worst point; DELETE the block and the
 *      sight line runs clear to the end of the road (749 m from the sign, 619 m
 *      from the worst point — i.e. 900 minus the eye's own station, because
 *      nothing else on this district occludes anything). That is a legal
 *      overtake and no ban worth teaching.
 *
 *   §3 sc-ov-night-gap — «a lesson graded on judging distance by headlights».
 *      The lamps were refuted off the audit's own frame (see the template
 *      header's pixel counts, and §1 of the refutation file). The half nobody
 *      pinned is that the briefing's «далеч насреща светят фарове» has to be
 *      TRUE AT THE BRIEFING BEAT: the stream's head is staged from frame one
 *      («the stream stands queued in the oncoming lane before it is released»,
 *      OncomingStreamRunner), so the claim survives exactly while that hold
 *      sits far enough ahead to read as „далеч" and near enough to be drawn.
 *      LessonScene draws traffic to `maxDrawDistanceM={420}`; §3 pins the head
 *      inside it.
 *
 * WHAT IS NOT HERE, ON PURPOSE. Three causes these rows share are outside this
 * file and are reported rather than guessed at: the missing `minMatchSpeedMps`
 * floor on `matchPlayer` (runners.ts), the missing return `laneShift` on
 * `RearTailgaterRunner`, and the absence of any objective kind that binds to a
 * staged actor outside `emergencyStop`'s `stagedEventId` (lessons/types.ts).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RearTailgaterRunner } from "@/modules/sim/orchestrator/runners";
import type { DirectorInput, StagedTrafficPort } from "@/modules/sim/orchestrator/types";
import type {
  StagedActorSpec,
  StagedActorView,
  StagedCommand,
} from "@/modules/sim/traffic/types";
import type { OncomingStreamSpec, RearTailgaterSpec } from "@/modules/sim/contracts";
import type { SimTickEvent } from "@/modules/sim/rules";
import {
  SC_LN_BOULEVARD_DISCIPLINE,
  SC_OV_BEING_OVERTAKEN,
  SC_OV_CREST_CURVE,
  SC_OV_NIGHT_GAP,
} from "../templates-lanes2";
import type { ScenarioSpec } from "../types";

const REPO_ROOT = path.resolve(process.cwd(), "..");
const district = (id: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf8")) as Record<
    string,
    unknown
  >;

/** Every student-facing sentence a template shows, graded titles included. */
const gradedTitles = (s: ScenarioSpec): string[] => s.success.map((o) => o.titleBg);

// ---------------------------------------------------------------------------
// §1 sc-ov-being-overtaken — the overtaker never comes home, so no tick may
//    say it did.
// ---------------------------------------------------------------------------

/** A recording StagedTrafficPort: one actor, a pose we drive by hand, and a
 *  full log of every command the runner issues. Nothing is stubbed away that
 *  the claim depends on — the commands ARE the claim. */
class CommandLog implements StagedTrafficPort {
  readonly commands: Array<{ id: string; command: StagedCommand; tSec: number }> = [];
  tSec = 0;
  private view: StagedActorView;

  constructor(id: string, y: number) {
    this.view = {
      id,
      kind: "vehicle",
      x: 4.06,
      y,
      dirX: 0,
      dirY: 1,
      speedMps: 0,
      s: y,
      pathLengthM: 900,
      nodeS: [0, 900],
      finished: false,
      lateralOffsetM: 0,
    };
  }
  setPose(y: number, speedMps: number): void {
    this.view = { ...this.view, y, s: y, speedMps };
  }
  stage(_spec: StagedActorSpec): StagedActorView | null {
    return this.view;
  }
  stagedCommand(id: string, command: StagedCommand): void {
    this.commands.push({ id, command, tSec: this.tSec });
  }
  staged(_id: string): StagedActorView | null {
    return this.view;
  }
}

/**
 * Drive the SHIPPED runner through one whole encounter: the actor closes from
 * behind, glues on, presses, passes, and ends `passAheadM` clear. The player is
 * a constant 18 m/s (65 km/h — the shadow's own pace) on the own-lane centre;
 * the actor's pose is advanced with the runner's own commands honoured
 * (matchPlayer → station behind, cruise+laneShift → 25 m/s away), because the
 * question is only ever "what does it COMMAND".
 */
function runOvertakerToResolution(spec: RearTailgaterSpec): {
  commands: Array<{ id: string; command: StagedCommand; tSec: number }>;
  resolvedAtSec: number | null;
} {
  const runner = new RearTailgaterRunner(spec);
  const port = new CommandLog(spec.id, spec.actor.hold.offsetM);
  // Seeded jitter is ±2 m / ±0.5 s; a fixed 0.5 draw puts every band mid-range.
  runner.stage(port, () => 0.5, true);

  const dt = 1 / 60;
  const playerMps = 18;
  let playerY = 15;
  let actorY = spec.actor.hold.offsetM;
  let actorMps = 0;
  let passing = false;
  let resolvedAtSec: number | null = null;

  for (let step = 0; step < 60 * 120 && resolvedAtSec === null; step++) {
    const tSec = step * dt;
    playerY += playerMps * dt;
    // Honour the last LONGITUDINAL command the runner gave. `laneShift` and
    // `setIndicator` are lateral/signal channels and govern no speed — reading
    // one as a pace command is how the first draft of this fixture froze the
    // actor mid-encounter and "proved" a pass that never ran.
    const last = [...port.commands]
      .reverse()
      .find((c) => c.command.type === "matchPlayer" || c.command.type === "cruise");
    if (last?.command.type === "matchPlayer") {
      const target = playerY + last.command.gapM;
      actorY += Math.max(-2, Math.min(2, target - actorY)) * 0.25 + playerMps * dt;
      actorMps = playerMps;
    } else if (last?.command.type === "cruise") {
      actorMps = last.command.speedMps ?? spec.actor.cruiseSpeedMps;
      actorY += actorMps * dt;
      passing = true;
    }
    port.tSec = tSec;
    port.setPose(actorY, actorMps);
    const input: DirectorInput = {
      tSec,
      dtSec: dt,
      x: 4.06,
      y: playerY,
      speedKmh: playerMps * 3.6,
      headingDeg: 0,
      brakePedal: 0,
      tickEvents: [] as readonly SimTickEvent[],
    };
    const out = runner.step(port, input, []);
    if (out) resolvedAtSec = tSec;
  }
  expect(passing, "the encounter never reached its pass — the fixture is wrong").toBe(true);
  return { commands: port.commands, resolvedAtSec };
}

describe("§1 sc-ov-being-overtaken — the pass has no homecoming, and no tick claims one", () => {
  const overtaker = SC_OV_BEING_OVERTAKEN.staged?.find(
    (e): e is RearTailgaterSpec => e.kind === "rearTailgater",
  );

  it("the template still stages the overtaker this row is about", () => {
    expect(overtaker, "sc-ov-being-overtaken lost its rearTailgater").toBeDefined();
    expect(overtaker!.id).toBe("sc-ovbo-overtaker");
    // The pass leaves for the lane on the LEFT — the oncoming bank of a 1+1.
    expect(overtaker!.passShiftM).toBeLessThan(0);
  });

  it("§1a THE MEASUREMENT: the shipped runner issues ONE laneShift, and it is the pass", () => {
    const { commands, resolvedAtSec } = runOvertakerToResolution(overtaker!);
    const shifts = commands.filter((c) => c.command.type === "laneShift");
    expect(resolvedAtSec, "the encounter never resolved").not.toBeNull();
    expect(shifts).toHaveLength(1);
    expect(
      shifts[0]!.command.type === "laneShift" ? shifts[0]!.command.toOffsetM : NaN,
    ).toBeCloseTo(overtaker!.passShiftM, 6);
  });

  it("§1b …and it is STILL on the oncoming bank when the encounter resolves", () => {
    // The resolution test is `passCommanded && actorAheadM >= passAheadM`, which
    // fires while the lateral channel is still parked at passShiftM. So the
    // student's last sight of the overtaker is a car finishing an overtake by
    // staying out there — the exact opposite of what чл. 42 requires of it.
    const { commands, resolvedAtSec } = runOvertakerToResolution(overtaker!);
    const shift = commands.find((c) => c.command.type === "laneShift")!;
    const homeward = commands.filter(
      (c) =>
        c.command.type === "laneShift" &&
        Math.abs(c.command.toOffsetM) < Math.abs(overtaker!.passShiftM),
    );
    expect(shift.tSec).toBeLessThan(resolvedAtSec!);
    expect(homeward, "the runner grew a return — §1c may now be relaxed").toHaveLength(0);
  });

  it("§1c FAILS ON THE OLD BEHAVIOUR: no graded title promises the overtaker pulls back in", () => {
    // The struck sentence was «Пусни го да се прибере и продължи в своята
    // лента». This net catches it and anything shaped like it; it is the only
    // thing standing between the runner's silence and a tick that speaks for it.
    //
    // VERIFIER 2026-08-23 — THE FIRST DRAFT OF THIS NET HAD A HOLE THE WIDTH OF
    // A SYNONYM. It keyed on «прибере/прибира» only, so «Не ускорявай, докато
    // се ВЪРНЕ в своята лента» — the same unbacked claim about the same car, in
    // the commoner verb — passed it green. Only the exact-title pin below
    // caught that mutation, and the pin guards ONE row; the other graded title
    // could re-acquire the claim freely. Both verbs are now banned, in every
    // graded title.
    //
    // The discriminator is Bulgarian clitic order, not a word list, so this
    // stays narrow: a THIRD-PERSON claim about him puts «се» BEFORE the verb
    // («да се върне», «докато се прибере»), while a SECOND-PERSON instruction
    // to the student puts it AFTER («прибери се вдясно», «върни се в средата»).
    // Only the former is banned — the student's own return is a duty a title
    // may still name, and §1d holds that it is still taught.
    // NO `\b` / `\w` ANYWHERE IN THIS FILE'S CYRILLIC PATTERNS. JavaScript's
    // `\w` is [A-Za-z0-9_], so `\b` finds no boundary between a space and «с»
    // — `/\bсе\s+върне/` matches NOTHING and the guard reads green while
    // holding air. The first draft of this widened net shipped exactly that
    // and passed the very mutation it was written to stop.
    const claimsHisReturn =
      /(?:пусни|остави)\s+го|(?:^|[\s,.;:!?„“"«»—–-])се\s+(?:приб(?:ере|ира)|върне|връща)/i;
    for (const title of gradedTitles(SC_OV_BEING_OVERTAKEN)) {
      expect(claimsHisReturn.test(title), `graded title claims his return: «${title}»`).toBe(false);
    }
    expect(gradedTitles(SC_OV_BEING_OVERTAKEN)).toContain(
      "Не му пречи — продължи спокойно в своята лента",
    );
  });

  it("§1d AND THE OPPOSITE DIRECTION: the student's OWN return is still taught in words", () => {
    // A fix that only deleted would have cost the lesson its second half. The
    // duty that survives is the student's, and it stays where a sentence can
    // carry it honestly: instruction 6 and the ЗАЩО card.
    const instructions = SC_OV_BEING_OVERTAKEN.instructionsBg.map((i) => i.textBg).join(" ");
    expect(instructions).toMatch(/подмине/);
    expect(instructions).toMatch(/в средата на лентата/);
    expect(SC_OV_BEING_OVERTAKEN.teach.whyBg).toMatch(/насрещното платно/);
  });
});

// ---------------------------------------------------------------------------
// §2 sc-ov-crest-curve — the bend the lesson grades as blind, measured.
// ---------------------------------------------------------------------------

type Pt = [number, number];
type Ring = Pt[];

/** ov-crest-v1 centreline, from the template's own recipe (map.params) and the
 *  committed geometry: 240 m north, a 135 m / 90° right arc, then east. */
const CREST = { approachM: 240, radiusM: 135, cx: 135, cy: 240, laneM: 4.06, exitY: 375 } as const;

/** A point `sMeters` along a lane of ov-crest-v1. `side` +1 = the OWN
 *  (inner, right-hand) lane, −1 = the ONCOMING bank. */
function crestLanePoint(sMeters: number, side: 1 | -1): Pt {
  const r = CREST.radiusM - side * CREST.laneM;
  if (sMeters <= CREST.approachM) return [side * CREST.laneM, sMeters];
  const arcLen = (r * Math.PI) / 2;
  if (sMeters <= CREST.approachM + arcLen) {
    const ang = Math.PI - (sMeters - CREST.approachM) / r;
    return [CREST.cx + r * Math.cos(ang), CREST.cy + r * Math.sin(ang)];
  }
  return [CREST.cx + (sMeters - CREST.approachM - arcLen), CREST.exitY - side * CREST.laneM];
}

const sub = (u: Pt, v: Pt): Pt => [u[0] - v[0], u[1] - v[1]];
const crossZ = (u: Pt, v: Pt): number => u[0] * v[1] - u[1] * v[0];
function segmentsCross(p: Pt, q: Pt, a: Pt, b: Pt): boolean {
  const d1 = crossZ(sub(b, a), sub(p, a));
  const d2 = crossZ(sub(b, a), sub(q, a));
  const d3 = crossZ(sub(q, p), sub(a, p));
  const d4 = crossZ(sub(q, p), sub(b, p));
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
const blockedBy = (p: Pt, q: Pt, rings: readonly Ring[]): boolean =>
  rings.some((ring) => ring.some((a, i) => segmentsCross(p, q, a, ring[(i + 1) % ring.length]!)));

/**
 * How far along the ONCOMING bank a driver at `eyeS` can see, in metres of road
 * ahead of him, given `rings` as opaque volumes. Sampled every 2 m and cut at
 * the FIRST occlusion — a sight line, not a sight cone.
 */
function sightAheadM(eyeS: number, rings: readonly Ring[]): number {
  const eye = crestLanePoint(eyeS, 1);
  let visible = 0;
  for (let t = eyeS + 5; t <= 900; t += 2) {
    if (blockedBy(eye, crestLanePoint(t, -1), rings)) break;
    visible = t - eyeS;
  }
  return visible;
}

describe("§2 sc-ov-crest-curve — the arc really is blind, and one 9 m block is why", () => {
  const raw = district("ov-crest-v1");
  const buildings = raw.buildings as Array<{ id: string; height: number; footprint: Ring }>;
  const rings = buildings.map((b) => b.footprint);
  /** The sight-blocking volume the lesson's whole premise rests on. */
  const slope = buildings.find((b) => b.id === "ovc-b-slope");

  it("VERIFIER: the sight model still reproduces the committed centreline", () => {
    // Everything §2 measures is computed against `crestLanePoint`, which is a
    // HAND-WRITTEN model of this road, not the road. That is fine only while
    // the two agree: re-author the district with a 200 m radius and the model
    // would go on serenely reporting 141 m of sight on a bend that no longer
    // exists, and §2a/§2b would keep passing on a fiction. So the model is
    // pinned to the map's own published landmarks before it is trusted.
    const meta = (raw.meta as { scenario: Record<string, unknown> }).scenario;
    const params = meta.params as { approachM: number; radiusM: number; sweepDeg: number };
    expect(params.approachM).toBe(CREST.approachM);
    expect(params.radiusM).toBe(CREST.radiusM);
    expect(params.sweepDeg).toBe(90); // the model hard-codes a quarter turn
    expect(meta.laneCenterRightM).toBe(CREST.laneM);
    // The two independent points the map publishes, rebuilt from the model.
    const arcLen = ((CREST.radiusM - CREST.laneM) * Math.PI) / 2;
    const [midX, midY] = crestLanePoint(CREST.approachM + arcLen / 2, 1);
    const mid = meta.laneCurveMid as { x: number; y: number };
    expect(midX).toBeCloseTo(mid.x, 2);
    expect(midY).toBeCloseTo(mid.y, 2);
    expect(crestLanePoint(CREST.approachM + arcLen + 50, 1)[1]).toBeCloseTo(
      meta.exitLaneY as number,
      2,
    );
    expect(crestLanePoint(CREST.approachM + arcLen + 50, -1)[1]).toBeCloseTo(
      meta.exitOncomingLaneY as number,
      2,
    );
  });

  it("VERIFIER: ovc-b-slope is the ONLY thing hiding this bend", () => {
    // The corrected right-hand column of the template's table, asserted rather
    // than left in a comment: strip the block and the sight line does not merely
    // lengthen, it runs to the end of the road, because no other building on
    // this district occludes any of it. This is what makes the block load-
    // bearing in the strict sense — there is no second line of defence.
    const withoutSlope = buildings.filter((b) => b.id !== "ovc-b-slope").map((b) => b.footprint);
    for (const eyeS of [150, 240, 280]) {
      expect(sightAheadM(eyeS, withoutSlope)).toBeGreaterThan(900 - eyeS - 10);
    }
  });

  it("the district still authors the volume inside the arc", () => {
    expect(slope, "ov-crest-v1 lost ovc-b-slope — the bend has nothing to hide behind").toBeDefined();
    // Tall enough to hide a car, not a kerbstone: a driver's eye is ~1.1 m and
    // an oncoming roof ~1.5 m, so anything under ~3 m is see-over scenery.
    expect(slope!.height).toBeGreaterThanOrEqual(3);
    // …and it sits INSIDE the arc: every corner nearer the centre than the road.
    for (const [x, y] of slope!.footprint) {
      const r = Math.hypot(x - CREST.cx, y - CREST.cy);
      expect(r).toBeLessThan(CREST.radiusM - CREST.laneM);
    }
  });

  it("§2a the driver AT the В24 sign cannot see a legal overtaking window", () => {
    // The ban span opens at 150 m (meta.scenario.banZone.fromM), which is where
    // чл. 43's decision is taken. An overtake of a 57 km/h truck at the posted
    // 90 needs the far side of ~500 m; what this driver actually has is:
    const atSign = sightAheadM(150, rings);
    expect(atSign).toBeGreaterThan(0);
    expect(atSign).toBeLessThan(300);
  });

  it("§2b the worst point of the arc is blinder still", () => {
    let worst = Infinity;
    for (let s = 150; s <= 340; s += 10) worst = Math.min(worst, sightAheadM(s, rings));
    expect(worst).toBeLessThan(180);
  });

  it("§2c FAILS ON THE OLD BEHAVIOUR: without the block the bend is not blind at all", () => {
    // The mutation that matters. Take the one volume away — or shrink it, or
    // slide it off the chord — and the same road opens to more than half a
    // kilometre of visible oncoming lane, at which point the В24, the patience
    // gate and every «не виждаш края на маневрата си» sentence in the template
    // are teaching a caution the world does not justify.
    const withoutSlope = buildings.filter((b) => b.id !== "ovc-b-slope").map((b) => b.footprint);
    expect(sightAheadM(150, withoutSlope)).toBeGreaterThan(500);
    expect(sightAheadM(280, withoutSlope)).toBeGreaterThan(500);
  });

  it("§2d AND THE OPPOSITE DIRECTION: the copy that describes THIS road still names no slope", () => {
    // The §1 split of lanes2-sweep161.test.ts, re-asserted from the other side:
    // what hides the road here is the arc and the high ground inside it, and
    // the sentences that describe the drive say exactly that.
    const thisRoad = [
      ...SC_OV_CREST_CURVE.instructionsBg.map((i) => i.textBg),
      ...gradedTitles(SC_OV_CREST_CURVE),
    ].join(" ");
    expect(thisRoad).not.toMatch(/склон|нагорнище|изкачван/i);
    expect(thisRoad).toMatch(/завива надясно/);
  });

  it("§2e the ban and the advisory really do cover the arc the gate sits in", () => {
    const zones = raw.zones as Array<{ kind: string; fromM: number; toM: number }>;
    const ban = zones.find((z) => z.kind === "noOvertaking");
    const curve = zones.find((z) => z.kind === "curveAdvisory");
    expect(ban, "ov-crest-v1 lost its В24 span").toBeDefined();
    expect(curve, "ov-crest-v1 lost its А1 span").toBeDefined();
    // The patience gate sits at the arc midpoint; both spans must contain it.
    const midS = CREST.approachM + ((CREST.radiusM - CREST.laneM) * Math.PI) / 4;
    expect(ban!.fromM).toBeLessThan(midS);
    expect(ban!.toM).toBeGreaterThan(midS);
    expect(curve!.fromM).toBeLessThan(midS);
    expect(curve!.toM).toBeGreaterThan(midS);
  });
});

// ---------------------------------------------------------------------------
// §3 sc-ov-night-gap — the headlights the briefing promises are staged where a
//    student can actually see them.
// ---------------------------------------------------------------------------

/** LessonScene renders traffic to `maxDrawDistanceM={420}`; beyond it the fleet
 *  culls the agent and the cue does not exist however well it is authored. */
const FLEET_DRAW_DISTANCE_M = 420;
/** ov-oncoming-v1 spawn — `ovg-spawn-start`, pinned against the map below. */
const OVN_SPAWN_Y = 15;
/** ov-oncoming-v1 length; the oncoming path runs from y = LENGTH down to 0, so
 *  a hold `offsetM` along it lands at y = LENGTH − offsetM. */
const OVN_ROAD_M = 900;

describe("§3 sc-ov-night-gap — «далеч насреща светят фарове» is backed at the briefing beat", () => {
  const stream = SC_OV_NIGHT_GAP.staged?.find(
    (e): e is OncomingStreamSpec => e.kind === "oncomingStream",
  );

  it("the map still puts the student where the template thinks it does", () => {
    const raw = district("ov-oncoming-v1");
    const spawn = (raw.spawnPoints as Array<{ id: string; y: number }>).find(
      (p) => p.id === SC_OV_NIGHT_GAP.start.spawnPointId,
    );
    expect(spawn?.y).toBe(OVN_SPAWN_Y);
    expect((raw.meta as { scenario: { params: { lengthM: number } } }).scenario.params.lengthM).toBe(
      OVN_ROAD_M,
    );
  });

  it("§3a the stream's head is FAR — but inside the distance the fleet draws", () => {
    expect(stream, "sc-ov-night-gap lost its oncoming stream").toBeDefined();
    const headY = OVN_ROAD_M - stream!.actor.hold.offsetM;
    const aheadOfSpawn = headY - OVN_SPAWN_Y;
    // Far enough that «далеч» is not a lie the first instruction tells…
    expect(aheadOfSpawn).toBeGreaterThan(150);
    // …and near enough that the headlights are on the glass while the student
    // is still reading the briefing. Push the hold past this and the drill's
    // whole premise becomes a sentence about an empty road.
    expect(aheadOfSpawn).toBeLessThan(FLEET_DRAW_DISTANCE_M);
  });

  it("§3b the dark window behind it is a real window, not a gap in the authoring", () => {
    // The lesson is „first headlights, THEN nothing": car 1 rides gapsM[0]
    // behind the head, so the empty stretch the student is told to wait for is
    // that gap divided by the closing speed. Under ~20 s it is not a window, it
    // is a flicker; the taught refusal needs time to be a decision.
    expect(stream!.count).toBe(2);
    const gapM = stream!.gapsM[0]!;
    const closingMps = stream!.actor.cruiseSpeedMps + 10; // a ~36 km/h student
    expect(gapM / closingMps).toBeGreaterThan(20);
  });

  it("§3c FAILS ON THE OLD BEHAVIOUR: no graded title still promises the headlight ORDER", () => {
    // `stepReachZone` reads position and speed and nothing else, so no gate in
    // this template can know whether the first headlights have gone by. The
    // struck sentence was «Изчакай зад бавната кола, докато първите фарове
    // минат»; the wait itself is taught in instruction 4, where it is honest.
    // `фаров\w*\s+минат` was dead on arrival for the reason given in §1c —
    // `\w` is ASCII-only, so it could never span «-ете» and reach « минат».
    // The second alternative was carrying this test alone; both work now.
    const ordered = /фаров[а-я]*\s+минат|докато\s+.*фаров/i;
    for (const title of gradedTitles(SC_OV_NIGHT_GAP)) {
      expect(ordered.test(title), `graded title claims an order: «${title}»`).toBe(false);
    }
    expect(SC_OV_NIGHT_GAP.instructionsBg.map((i) => i.textBg).join(" ")).toMatch(
      /ги\s+изчакай\s+да\s+минат/i,
    );
  });

  it("§3d AND THE OPPOSITE DIRECTION: the night that lights the fleet is still authored", () => {
    // `conditions.night` → compileScenario's `environment.timeOfDay` →
    // LessonScene's `isNight` → `<TrafficLayer night>` is the whole chain that
    // turns the lead's tail lamps on. Break the first link and every lamp in
    // the scene goes out — including the ones this row was filed about.
    expect(SC_OV_NIGHT_GAP.conditions?.night).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §4 sc-ln-boulevard-discipline — the row the steered re-drive retired.
// ---------------------------------------------------------------------------

describe("§4 sc-ln-boulevard-discipline — the three gates a steered drive completes", () => {
  it("the drill still has exactly the out-and-back it is graded on", () => {
    // `.audit-frames/rebase/frames/sc-ln-boulevard-discipline__pc-right` ticks
    // all three (0:34 / 1:22 / 2:01) and ends ИЗДЪРЖАН, which is what retires
    // «the entire lesson never ticks in any of the four legs». What this holds
    // is the SHAPE that made it completable: curb lane → left lane → curb lane,
    // each gate inside its own lane and none of them reachable from the other.
    const titles = gradedTitles(SC_LN_BOULEVARD_DISCIPLINE);
    expect(titles).toHaveLength(3);
    const zones = SC_LN_BOULEVARD_DISCIPLINE.success.map((o) => o.params);
    for (const p of zones) expect(p.kind).toBe("reachZone");
    const xs = zones.map((p) => (p.kind === "reachZone" ? p.x : NaN));
    expect(xs[0]).toBe(xs[2]);
    // wb-boulevard-v1's own pitch, read off the two lane centres the template
    // pins (12.19 curb / 4.06 left) rather than assumed from the 8.125 m the
    // rural maps use — the two differ by 5 mm and a hard-coded constant here
    // would have been a false gate on the wrong map.
    const pitch = Math.abs(xs[1]! - xs[0]!);
    expect(pitch).toBeCloseTo(8.13, 2);
    // Radius under the half-pitch: no gate is satisfiable from the other lane.
    for (const p of zones) {
      if (p.kind === "reachZone") expect(p.radiusM).toBeLessThan(pitch / 2);
    }
  });
});
