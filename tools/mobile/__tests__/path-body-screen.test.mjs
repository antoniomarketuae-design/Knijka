/**
 * path-body-screen.test.mjs — DOES THE PLANNED PATH GO THROUGH A PARKED CAR?
 *
 * Run: node --test tools/mobile/__tests__/path-body-screen.test.mjs
 *
 * `planner.mjs` has no body model — the string "obstacle" appears in it zero
 * times — and `build-pathrefs.mjs` `screenCorners` screens the DEVIATION
 * CORRIDOR, never the swept body. So a witness could be committed as
 * FEASIBLE-TRACK while crossing the neighbouring bay, and seven of the eleven
 * committed ones were. The canary drive proved it: it followed the sc-park-left
 * segment-1 witness to 0.014–0.088 m and hit the car that witness was aimed at.
 *
 * What is pinned here, in the order a reader needs it:
 *   §1  the screen still reproduces its independent calibration anchor;
 *   §2  it REFUSES rather than defaults when a GLB, a district or a bay cannot
 *       be read — silence must never be indistinguishable from clearance;
 *   §3  the witness that collided is rejected, by the builder's gate AND by the
 *       follower's, and every member of the reverse family is screened;
 *   §4  the emit decision: a refused witness is not written at all.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ANCHOR, BODY_FLOOR_M, BODY_WARN_M, FLEET_BODY_HALF, PARKED_WEIGHTS, Unreadable,
  anchorWitnessRows, assignCivilianModel, bodiesForLesson, clearanceFn, clearanceRecord, measureFleetFromGlb,
  assertBodiesWereLookedFor, clearanceAtPose, mountedBodies, obb, readBays, readOccupiedBays, runCalibration, screenPathrefSegments, verifiedFleetHalf,
  witnessBodyVerdict, worstMountedClearance,
  SWEEP_RESIDUAL_TOL_M, SWEEP_SPACING_M, densifyPoses, poseOfRow, sweptSeparation,
} from "../lib/path-plan/body-screen.mjs";
import { CLEAR_END_LADDER, CLEAR_STARTS, CLEAR_TARGET_M, effortOf, lockFor, planWitness, simulateTargets } from "../lib/path-plan/planner.mjs";
import { maxSteerAtKmh, tangents } from "../lib/path-plan/geom.mjs";
import { GENERATOR, emitDecision, pickStop } from "../lib/path-plan/build-pathrefs.mjs";
import { REVERSE_LOCK_AUTHORITY } from "../lib/path-plan/policy.mjs";
import { PATH_TUNE, createPathState, witnessBodyGate } from "../lib/path-follow.mjs";
import { BRAKE_SCAN_SPACING_M, DRIVE_CLEARANCE_FLOOR_M, bodyClearanceGuard, driveClearance, driveClearanceGate } from "../lib/drive-clearance.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");
const PATHREF_DIR = resolve(REPO, "tools", "mobile", "path-refs");
const refOf = (lesson) => JSON.parse(readFileSync(resolve(PATHREF_DIR, `${lesson}.pathref.json`), "utf8"));
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} vs ${b} (tol ${tol})`);

/**
 * THE WITNESS THAT COLLIDED, as a segment the gate can be pointed at.
 *
 * It used to be read out of `sc-park-left.pathref.json`. That file has since been
 * RE-PLANNED with body clearance in the objective, so the path that collided is
 * no longer in it — and a regression test that reads the artefact it is meant to
 * protect stops testing the moment the artefact is fixed. The rows are frozen in
 * `anchor-witness.json` instead, so «this exact path is refused» stays checkable
 * for as long as the screen exists.
 */
const collidedSegment = () => ({ k: 1, gear: -1, witnesses: [{ startAlongM: ANCHOR.startAlongM, rows: anchorWitnessRows() }] });

/** One scratch dir for every synthetic source in this file. */
const TMP = mkdtempSync(join(tmpdir(), "knijka-body-screen-"));
process.on("exit", () => { try { rmSync(TMP, { recursive: true, force: true }); } catch { /* the OS will */ } });
const scratch = (name) => {
  const d = join(TMP, name);
  mkdirSync(d, { recursive: true });
  return d;
};

/* ═══════════════ §1 THE ANCHOR — nothing below is worth reading without it ═══════════════ */

describe("§1 calibration", () => {
  it("the screen reproduces the seven independently measured sc-park-left clearances to 1 cm", () => {
    const cal = runCalibration();
    assert.equal(cal.rows.length, Object.keys(ANCHOR.expect).length);
    for (const r of cal.rows) near(r.got, r.want, 0.01, `${ANCHOR.lesson} seg ${ANCHOR.segment} witness ${ANCHOR.startAlongM} vs ${ANCHOR.body}, ${r.model}:`);
    assert.equal(cal.ok, true, "the screen did not reproduce the anchor — every number below is unpinned");
  });

  it("the anchor is the whole POINT: the fleet-profile box says 0.04 m of AIR where five of the six real models penetrate", () => {
    const cal = runCalibration();
    const byModel = Object.fromEntries(cal.rows.map((r) => [r.model, r.got]));
    assert.ok(byModel["(fleet-profile box)"] > 0, "the fleet box read clearance");
    const real = Object.entries(byModel).filter(([m]) => !m.startsWith("("));
    const through = real.filter(([, v]) => v < 0);
    assert.equal(through.length, 5, `expected five of the six real models to penetrate, got ${JSON.stringify(byModel)}`);
    assert.ok(byModel.dret_90 < 0, "dret_90 is the model lotlf-bay-4 actually mounts and it penetrates");
  });
});

/* ═══════════════ §2 A MATCHER MUST REPORT WHAT IT CANNOT READ ═══════════════ */

describe("§2 the screen refuses rather than defaulting", () => {
  it("an EMPTY GLB directory is a REFUSAL naming the models and the directory — never the pinned table used as a fallback", async () => {
    const empty = scratch("no-glbs");
    // the reporter reports…
    const report = await measureFleetFromGlb({ glbDirs: [empty] });
    assert.deepEqual(report.measured, {}, "nothing was measured");
    // …and the pipeline's resolver REFUSES, with the models and the place it looked.
    await assert.rejects(
      () => verifiedFleetHalf({ glbDirs: [empty] }),
      (err) => {
        assert.ok(err instanceof Unreadable, `threw ${err?.name}, not Unreadable`);
        assert.match(err.message, /UNREADABLE/);
        assert.match(err.message, /dret_90/, "the refusal must name a model it could not size");
        assert.ok(err.message.includes(empty), "the refusal must name where it looked");
        return true;
      },
    );
  });

  it("a MISSING GLB directory is a refusal too, and says the directory could not be read", async () => {
    const gone = join(TMP, "does-not-exist-at-all");
    await assert.rejects(
      () => verifiedFleetHalf({ glbDirs: [gone] }),
      (err) => {
        assert.ok(err instanceof Unreadable);
        assert.match(err.message, /unreadable:/, "an unreadable directory is reported as such, not as an empty one");
        return true;
      },
    );
  });

  it("a pinned extent that no longer matches the shipped GLB is a refusal, not a silent use of the pin", async () => {
    await assert.rejects(
      () => verifiedFleetHalf({ pinned: { dret_90: { across: 9.99, along: 9.99 } } }),
      (err) => {
        assert.ok(err instanceof Unreadable);
        assert.match(err.message, /MOVED/);
        assert.match(err.message, /dret_90 pinned 9\.9900/);
        return true;
      },
    );
  });

  it("the shipped GLBs DO reproduce the pinned table, so the refusals above are about readability and not about a stale pin", async () => {
    const measured = await verifiedFleetHalf();
    for (const [name, half] of Object.entries(FLEET_BODY_HALF)) {
      near(measured[name].across, half.across, 0.001, `${name} across`);
      near(measured[name].along, half.along, 0.001, `${name} along`);
    }
  });

  it("an OCCUPIED bay with no finite pose is a named refusal — not a body silently skipped", () => {
    const world = scratch("world-badbay");
    writeFileSync(join(world, "synthetic-v1.json"), JSON.stringify({
      meta: { scenario: { bays: [
        { id: "ok-1", x: 1, y: 2, headingDeg: 90, occupied: true },
        { id: "broken-2", x: 3, y: null, headingDeg: 90, occupied: true },
      ] } },
    }));
    assert.throws(
      () => readOccupiedBays("synthetic-v1", { worldDir: world }),
      (err) => {
        assert.ok(err instanceof Unreadable, `threw ${err?.name}`);
        assert.match(err.message, /broken-2/, "the refusal must name the bay");
        return true;
      },
    );
  });

  it("a district that cannot be read, and a `bays` that is not an array, are both refusals", () => {
    const world = scratch("world-odd");
    writeFileSync(join(world, "notarray-v1.json"), JSON.stringify({ meta: { scenario: { bays: { "0": {} } } } }));
    assert.throws(() => readOccupiedBays("nothing-here-v1", { worldDir: world }), Unreadable);
    assert.throws(() => readOccupiedBays("notarray-v1", { worldDir: world }), /not an array/);
    // …and a district that genuinely declares no bays is [], which is a fact, not a guess
    writeFileSync(join(world, "nobays-v1.json"), JSON.stringify({ meta: { scenario: {} } }));
    assert.deepEqual(readOccupiedBays("nobays-v1", { worldDir: world }), []);
  });


  /* H2 (2026-09-16). "I found nothing" and "I could not look" reached every caller as the
   * SAME empty array, and `driveClearanceGate` PASSES `no-bodies`. A lesson whose district
   * file had lost its `meta.scenario.bays` block, or whose held-scenery entry had been renamed
   * out from under the parser, would have been waved through as "nothing to hit". */
  it("H2 the bays block reports whether it is THERE, not just what is in it", () => {
    const world = scratch("world-h2");
    writeFileSync(join(world, "nobays-v1.json"), JSON.stringify({ meta: { scenario: {} } }));
    writeFileSync(join(world, "empty-v1.json"), JSON.stringify({ meta: { scenario: { bays: [] } } }));
    writeFileSync(join(world, "someone-v1.json"), JSON.stringify({ meta: { scenario: { bays: [{ id: "b1", x: 1, y: 2, headingDeg: 0, occupied: true }, { id: "b2", occupied: false }] } } }));
    const absent = readBays("nobays-v1", { worldDir: world });
    assert.deepEqual([absent.block, absent.declared, absent.occupied.length], ["absent", 0, 0]);
    const empty = readBays("empty-v1", { worldDir: world });
    assert.deepEqual([empty.block, empty.declared, empty.occupied.length], ["present", 0, 0], "a district that declares an EMPTY bays block looked and found none");
    const some = readBays("someone-v1", { worldDir: world });
    assert.deepEqual([some.block, some.declared, some.occupied.length], ["present", 2, 1]);
    // the old array contract is unchanged for every existing caller
    assert.deepEqual(readOccupiedBays("nobays-v1", { worldDir: world }), []);
    assert.equal(readOccupiedBays("someone-v1", { worldDir: world })[0].id, "b1");
  });

  it("H2 a lesson KNOWN to have bodies that produces none is a REFUSAL by name, never `no-bodies`", () => {
    const seen = { bays: { block: "present", declared: 5, occupied: 0 }, held: { entry: "absent", parsed: 0 } };
    // 1. any lot-* district: a parking lot with no body means its sources could not be read
    assert.throws(() => assertBodiesWereLookedFor("sc-park-left", "lot-left-v1", [], seen), (e) => e instanceof Unreadable && /is a parking lot and produced NO hittable body/.test(e.message));
    assert.throws(() => assertBodiesWereLookedFor("sc-park-left", "lot-left-v1", [], { bays: { block: "absent", declared: 0, occupied: 0 }, held: { entry: "present", parsed: 0 } }), /parking lot/);
    // 2. nowhere to look at all: no bays block AND no held-scenery entry
    assert.throws(() => assertBodiesWereLookedFor("sc-x", "pk-x-v1", [], { bays: { block: "absent", declared: 0, occupied: 0 }, held: { entry: "absent", parsed: 0 } }), /There was nowhere to look/);
    // 3. a district that DID declare bays and really has none occupied, outside a lot, is a fact
    assert.doesNotThrow(() => assertBodiesWereLookedFor("sc-x", "pk-x-v1", [], { bays: { block: "present", declared: 3, occupied: 0 }, held: { entry: "absent", parsed: 0 } }));
    // …and every real lot lesson passes, with its sources recorded on the body list
    for (const lesson of ["sc-park-left", "sc-park-wall", "sc-park-van", "sc-park-zebra", "sc-park-gap-short"]) {
      const m = mountedBodies(lesson);
      assert.ok(m.count >= 1, `${lesson}: ${m.count} bodies`);
      assert.equal(m.sources.bays.block, "present", `${lesson}: its bays block went absent`);
      assert.ok(m.sources.bays.occupied >= 1 || m.sources.held.parsed >= 1, `${lesson}: nothing was read from either source`);
    }
    // sc-pk-driveway is the honest "absent block" case: a driveway, whose bodies are held walls
    const drive = mountedBodies("sc-pk-driveway");
    assert.equal(drive.sources.bays.block, "absent");
    assert.equal(drive.sources.held.entry, "present");
    assert.ok(drive.count >= 1);
  });

  it("H2 the refusal TRAVELS: a body list that could not be read fails the drive gate instead of passing as `no-bodies`", () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ x: i * 0.1, z: 0, psi: 0 }));
    // an injected EMPTY body list is still `no-bodies` — that path is for a caller that has
    // already looked. What must never happen is reaching it because the lookup failed.
    const none = driveClearance("sc-park-left", rows, { mounted: { districtId: "x", bodies: [], sources: { bays: { block: "present", declared: 0, occupied: 0 }, held: { entry: "absent", parsed: 0 } } } });
    assert.equal(none.verdict, "no-bodies");
    assert.match(none.why, /bays block present, 0 declared \/ 0 occupied/, "the sources must travel with the verdict");
    // and the real lookup for a lot lesson cannot produce that verdict at all
    const real = driveClearance("sc-park-left", rows);
    assert.notEqual(real.verdict, "no-bodies");
    assert.equal(real.bodies >= 1, true);
  });
  it("a witness with NO body-screen result reads UNSCREENED, never clear", () => {
    const v = witnessBodyVerdict({ startAlongM: 0, rows: [[0, 0, 0, 0, 0, 0, 0, 0, 3]] });
    assert.equal(v.state, "unscreened");
    assert.match(v.why, /no body-screen result/);
    // the frozen collided witness carries no `bodyClearance` either: raw rows are
    // UNSCREENED, and that is what must be reported about them
    assert.equal(witnessBodyVerdict(collidedSegment().witnesses[0]).state, "unscreened");
  });
});

/* ═══════════════ §3 THE WITNESS THAT COLLIDED IS NOW REJECTED ═══════════════ */

describe("§3 the sc-park-left witness the canary drove is refused", () => {
  const LEFT = "sc-park-left";

  it("the builder's gate refuses it, and names the lesson, the body, the mounted model and the arc length", () => {
    const g = screenPathrefSegments(LEFT, [collidedSegment()]);
    const hit = g.problems.filter((p) => /witness -0\.5/.test(p));
    assert.equal(hit.length, 1, `expected the driven witness to be refused, got: ${JSON.stringify(g.problems, null, 2)}`);
    const why = hit[0];
    assert.match(why, /sc-park-left/, "names the lesson");
    assert.match(why, /lotlf-bay-4/, "names the body");
    assert.match(why, /mounted dret_90/, "names the model that bay actually mounts");
    assert.match(why, /at s = [\d.]+ m of [\d.]+ m/, "names the arc length");
    assert.match(why, new RegExp(`below the ${BODY_FLOOR_M} m floor`));
  });

  it("the clearance it is refused on is the anchor's own number, ±1 cm", () => {
    const seg1 = collidedSegment();
    screenPathrefSegments(LEFT, [seg1]);
    const w = seg1.witnesses[0];
    assert.equal(w.bodyClearance.verdict, "unsafe");
    near(w.bodyClearance.worstBodyClearanceM, ANCHOR.expect.dret_90, 0.01, "the refused clearance is the anchor's dret_90 figure");
    assert.equal(w.bodyClearance.mounted.body, ANCHOR.body);
    assert.equal(w.bodyClearance.mounted.model, "dret_90");
    // the fleet-profile box, which every other harness tool grades with, calls it AIR
    assert.ok(w.bodyClearance.worstFleetBoxM > 0, `the fleet box read ${w.bodyClearance.worstFleetBoxM} m — that is the defect, it must still be recorded`);
  });

  it("EVERY member of the reverse family is screened, because the follower picks one at runtime", () => {
    // the FAMILY invariant, not the defect: a caller cannot "use the good one", so
    // every member is measured and every member has to clear the floor
    const ref = refOf(LEFT);
    const g = screenPathrefSegments(LEFT, ref.segments);
    const seg1 = ref.segments.find((s) => s.k === 1 && s.gear === -1);
    assert.equal(seg1.witnesses.length, 3, "sc-park-left R1 has a three-member witness grid");
    for (const w of seg1.witnesses) {
      assert.ok(w.bodyClearance, `witness ${w.startAlongM} was not screened`);
      assert.equal(w.bodyClearance.familySize, 3);
      assert.notEqual(w.bodyClearance.verdict, "unsafe", `witness ${w.startAlongM} still drives through a body`);
      assert.notEqual(w.bodyClearance.verdict, "unmeasured", `witness ${w.startAlongM} is UNMEASURED, which is never a pass`);
    }
    assert.equal(g.problems.filter((p) => /seg 1 R/.test(p)).length, 0, "the re-planned family is clear");
  });

  it("the FOLLOWER refuses it too, before the car moves — the same floor, a named refusal code", () => {
    const seg1 = collidedSegment();
    screenPathrefSegments(LEFT, [seg1]);
    const w = seg1.witnesses[0];
    const gate = witnessBodyGate(seg1, w, PATH_TUNE);
    assert.equal(gate.refusal, "witness-body-unsafe");
    assert.match(gate.why, /lotlf-bay-4/);
    assert.match(gate.why, /dret_90/);
    assert.match(gate.why, /do not drive it/);
    assert.equal(gate.book.state, "unsafe");
    // and a screened, clear witness is allowed through with a book, not a refusal
    const clear = { startAlongM: 0, bodyClearance: { screen: "body-screen/1", verdict: "clear", worstBodyClearanceM: 0.55, warnM: BODY_WARN_M, mounted: { body: "b", model: "pino", atS: 1 } } };
    const ok = witnessBodyGate(seg1, clear, PATH_TUNE);
    assert.equal(ok.refusal, null);
    assert.equal(ok.book.state, "clear");
  });

  it("an UNSCREENED witness is REFUSED by default, and booked as unscreened rather than clear", () => {
    // This test used to assert the opposite — "today's committed pathrefs must still
    // drive" — because when it was written every committed pathref predated the
    // screen and refusing them all would have stopped the harness dead.
    // `PATH_TUNE.witnessBody.refuseUnscreened` has since been turned on, and the
    // pathrefs that matter now carry a clearance record, so the default is the safe
    // one: a witness NOTHING screened is not a pass. It still bites exactly one
    // lesson — sc-park-bay-exit-rev, whose plan the emit gate refuses to write, so
    // its committed file is the pre-screen one and the follower will not drive it.
    const seg = { k: 1, gear: -1 };
    const w = { startAlongM: 0 };
    assert.equal(PATH_TUNE.witnessBody.refuseUnscreened, true, "the default must refuse what nothing measured");
    assert.equal(witnessBodyGate(seg, w, PATH_TUNE).refusal, "witness-body-unsafe");
    assert.equal(witnessBodyGate(seg, w, PATH_TUNE).book.state, "unscreened", "…and it is booked as UNSCREENED, never silently as 'clear'");
    const lenient = { ...PATH_TUNE, witnessBody: { ...PATH_TUNE.witnessBody, refuseUnscreened: false } };
    assert.equal(witnessBodyGate(seg, w, lenient).refusal, null, "the flag is what decides it, and it can still be turned off");
    assert.equal(witnessBodyGate(seg, w, lenient).book.state, "unscreened", "…without the booking changing");
  });

  it("the whole committed corpus clears the floor — bar the ONE lesson a planner cannot fix", () => {
    // Six lessons were refused when the screen was written: sc-park-left −0.159 m,
    // van −0.092, gap-short −0.339, bay-exit-rev −0.200, zebra +0.030, wall +0.006.
    // Five were re-planned with clearance IN the objective and clear the floor.
    //
    // sc-park-bay-exit-rev DOES NOT, and it is not an oversight. Its authored R end
    // is infeasible for this car (Slice 0 §8) and Slice 0 re-planned it to a pose
    // inside a 1.0 m / 15° box; measured 2026-09-16, the best of five starts inside
    // that box is −0.0845 m, and raising the deviation corridor to 2.0 / 2.5 / 3.0 /
    // 4.0 m stops improving it at +0.0830 m — the END BOX binds, not the corridor, so
    // no plan reaches the floor. The gate therefore refuses to emit it and its
    // previous pathref stands; see policy.mjs REVERSE_POLICY["sc-park-bay-exit-rev"].
    // Widening that box changes what the lesson teaches and is not a planner's call.
    const refused = [];
    for (const lesson of ["sc-park-left", "sc-park-van", "sc-park-gap-short", "sc-park-bay-exit-rev", "sc-park-zebra", "sc-park-wall", "sc-park-judge", "sc-pk-driveway"]) {
      const g = screenPathrefSegments(lesson, refOf(lesson).segments);
      if (g.problems.length) refused.push(lesson);
    }
    assert.deepEqual(refused, ["sc-park-bay-exit-rev"], "the set of lessons whose committed plan drives through a body has moved");
  });

  it("a refusal is not the only output: a merely TIGHT witness caveats instead of blocking, and a pool-only penetration never blocks", () => {
    const g = screenPathrefSegments("sc-park-45-rev", refOf("sc-park-45-rev").segments);
    assert.equal(g.problems.length, 0, "45-rev's mounted models are all clear of its witnesses");
    assert.ok(g.caveats.length >= 1, "…but its seg-0 approach is inside the warn band and its pool-worst penetrates");
    assert.ok(g.caveats.some((c) => /kargo_v/.test(c) && /deterministic/.test(c)), `a pool-only penetration must be caveated and explained: ${JSON.stringify(g.caveats)}`);
  });

  it("the mounted model is a fact about the lesson, not a coin flip: the same bay gives the same model every time", () => {
    const a = bodiesForLesson("sc-park-left").bodies.map((b) => `${b.id}=${b.mountedModel}`);
    const b = bodiesForLesson("sc-park-van").bodies.map((x) => `${x.id}=${x.mountedModel}`);
    assert.deepEqual(a, ["lotlf-bay-1=dret_90", "lotlf-bay-2=vela_h3", "lotlf-bay-4=dret_90", "lotlf-bay-5=arden_x"]);
    assert.equal(b[1], "lotvn-bay-4=vela_h3");
    for (const seed of [0, 1, 2, 3, 7, 19]) assert.equal(assignCivilianModel(seed), assignCivilianModel(seed));
    for (const m of Object.keys(PARKED_WEIGHTS)) assert.ok(FLEET_BODY_HALF[m], `${m} is drawable but has no measured extents`);
  });

  it("a lesson with no body is 'no-bodies', which is a measurement — not an unscreened pass", () => {
    const rec = clearanceRecord([[0, 0, 0, 0, 0, 0, 0, 0, 3], [0.1, 0, 0.1, 0, 0.1, 0, 0, 0, 3]], []);
    assert.equal(rec.verdict, "no-bodies");
    assert.equal(rec.worstBodyClearanceM, null);
    assert.equal(witnessBodyVerdict({ bodyClearance: rec }).state, "clear");
    assert.match(witnessBodyVerdict({ bodyClearance: rec }).why, /no parked, occupant or held body/);
  });
});

/* ═══════════════ §4 A REFUSAL THAT STILL SHIPS THE FILE IS A REPORT, NOT A GATE ═══════════════ */

describe("§4 the emit decision", () => {
  it("emitBlocked stops the write; a bare `problems` entry does not", () => {
    assert.equal(emitDecision({ problems: [], emitBlocked: [] }).write, true);
    assert.equal(emitDecision({ problems: ["seg 0 D: no witness"], emitBlocked: [] }).write, true);
    const no = emitDecision({ problems: [], emitBlocked: ["body screen: sc-park-left seg 1 R witness -0.5: worst clearance -0.1595 m"] });
    assert.equal(no.write, false);
    assert.match(no.why, /-0\.1595/, "the reason must carry the measurement, not just a count");
  });

  it("an emitBlocked that cannot be read is a refusal, not a pass", () => {
    assert.equal(emitDecision({}).write, true, "an absent gate on an otherwise clean ref writes");
    assert.equal(emitDecision({ emitBlocked: "oops" }).write, false);
    assert.match(emitDecision({ emitBlocked: "oops" }).why, /cannot be read/);
  });

  it("a build with no verified fleet table blocks the emit instead of screening against a guess", () => {
    // `runBodyScreen` is reached through buildLesson, which costs minutes of planning; the
    // contract it implements is pinned here at the seam the CLI actually reads.
    const blocked = { problems: [], emitBlocked: ["body screen: sc-park-left was built without a verified fleet half-extent table"] };
    assert.equal(emitDecision(blocked).write, false);
  });
});

/* ═══════════════ §5 THE SCREEN AS A CONSTRAINT WHILE PLANNING ═══════════════
 *
 * §1–§4 measure a path that already exists. What follows pins the other half:
 * the same geometry inside the planner's objective, so a witness is CHOSEN to
 * clear rather than refused after the fact.
 *
 * The synthetic case is a 10 m straight reverse with one parked body beside the
 * line — small enough to run in seconds, and the whole mechanism in one place:
 * the authored line grazes the body (exactly the real defect's shape), so a
 * deviation-only plan drives into it and a clearance plan must steer around it
 * while staying inside the corridor and stopping in the box.
 */

/** A straight authored reverse from (0, 10) to (0, 0), trace frame. */
function straightRef(L = 10) {
  const n = Math.round(L / 0.05) + 1;
  const X = new Float64Array(n);
  const Y = new Float64Array(n);
  for (let k = 0; k < n; k++) { X[k] = 0; Y[k] = L - k * 0.05; }
  return { X, Y, n, ds: 0.05, L };
}

/** One body at trace (bx, 5) facing north, sized like a small civilian car. */
const oneBody = (bx) => [{ id: "synthetic-bay", kind: "bay", model: "synthetic", box: obb(bx, -5, 0, 1.0, 2.2) }];

function straightCtx(bx) {
  const ref = straightRef(10);
  return {
    ref, T: tangents(ref, 0.25), sigma: -1,
    start: { x: 0, y: 10, psi: 0 }, end: { x: 0, y: 0, psi: 0 },
    box: { posM: 0.5, yawDeg: 10 }, vAtArc: () => 3, dsSim: 0.05, cur0: 0, kappaScale: 0.95,
    clearanceAt: clearanceFn(oneBody(bx)),
  };
}

describe("§5 clearance is IN the objective, not checked after it", () => {
  // 1.95 m of offset against 0.85 + 1.00 of half width: the authored line passes
  // this body at +0.10 m — inside the 0.15 m floor, the same shape as the real
  // defect (sc-park-left's own authored line passes lotlf-bay-4 at −0.0030 m and
  // sc-park-wall the garage wall at +0.0940 m).
  const GRAZING = 1.95;

  it("a deviation-only plan drives into the body the authored line grazes; the clearance plan does not", () => {
    const ctx = straightCtx(GRAZING);
    const { clearanceAt, ...blind } = ctx;
    const devOnly = planWitness(blind, { quick: true });
    assert.ok(devOnly.best, "the deviation planner must find the straight witness");
    assert.equal(devOnly.clear, null, "with no body screen there is no clearance profile — the old behaviour is untouched");
    const onTheLine = clearanceAt(0, 5, 0);
    assert.ok(onTheLine < BODY_FLOOR_M, `the authored line clears ${onTheLine} m, so this case does not exercise the defect`);

    const seeing = planWitness(ctx, {});
    assert.ok(seeing.clear, "the clearance pass must produce a profile");
    assert.ok(seeing.clear.clear >= BODY_FLOOR_M, `clearance plan only reached ${seeing.clear.clear} m`);
    assert.ok(seeing.clear.maxDev <= 0.5 + 1e-9, `it bought clearance with ${seeing.clear.maxDev} m of deviation — outside the FEASIBLE-TRACK corridor`);
    assert.ok(seeing.best.maxDev < seeing.clear.maxDev, "the deviation plan should still be the tighter of the two — that is the trade");
  });

  it("the winner is a property of the START SET, not of the order the starts run in", () => {
    // The adversary's finding: changing ONLY the optimiser's start moved the
    // reported family minimum, so a single start reports a local optimum as if it
    // were the answer. Every start is run and scored by one objective; permuting
    // the list must not change what is emitted.
    const ctx = straightCtx(GRAZING);
    const orders = [
      [...CLEAR_STARTS],
      [...CLEAR_STARTS].reverse(),
      ["zero", "lock-", "dev-best", "lock+", "dev-tight"],
    ];
    // `zero` and `dev-tight` land on exactly the same optimum here, so this also
    // pins the TIE-BREAK: the recorded winner is the canonical order's, not the
    // caller's, or the name would move while the artefact did not.
    const got = orders.map((clearStarts) => {
      const p = planWitness(ctx, { clearStarts });
      return { start: p.clear.start, clear: p.clear.clear, n: p.clear.knots.length };
    });
    for (const g of got) {
      assert.equal(g.start, got[0].start, `a permuted start list picked ${g.start} instead of ${got[0].start}`);
      assert.equal(g.clear, got[0].clear, "…and a different clearance");
      assert.equal(g.n, got[0].n, "…and a different profile length");
    }
    assert.ok(CLEAR_STARTS.length >= 3, "a 'multi-start' with fewer than three starts is a single start with extra steps");
  });

  it("an unknown start name is a refusal, not a silently ignored option", () => {
    assert.throws(() => planWitness(straightCtx(GRAZING), { clearStarts: ["dev-best", "lucky"] }), /unknown clearance start "lucky"/);
  });

  it("END-POSE SLACK IS BOUGHT: a body that is no threat leaves the stop on the tightest rung", () => {
    // 3.0 m of offset clears by 1.15 m with no steering at all, so the tightest
    // rung already reaches CLEAR_TARGET_M and the plan has no reason to wander.
    const p = planWitness(straightCtx(3.0), {});
    assert.ok(p.clear, "a clearance profile is still produced when nothing is in the way");
    assert.ok(p.clear.clear >= CLEAR_TARGET_M, `the easy case only reached ${p.clear.clear} m`);
    assert.equal(p.clear.rung, CLEAR_END_LADDER[0], `it took rung ${p.clear.rung} when ${CLEAR_END_LADDER[0]} was available`);
    assert.ok(p.clear.norm <= CLEAR_END_LADDER[0] + 1e-9, `end-pose norm ${p.clear.norm} is outside the rung it claims`);
  });

  it("the effort penalty is a real term: it prices standing pre-steer and knot-to-knot thrash", () => {
    assert.equal(effortOf(null), 0);
    assert.equal(effortOf([0.3]), 0, "one knot has no variation");
    assert.equal(effortOf([0, 0, 0]), 0);
    near(effortOf([0, 0.2, 0]), 0.2, 1e-12, "mean |knot to knot|");
    // and the plan it produces does not pre-steer the standing wheel to the lock
    const p = planWitness(straightCtx(1.95), {});
    assert.ok(Math.abs(p.clear.knots[0]) <= 0.2, `it pre-steered ${p.clear.knots[0]} rad at standstill`);
  });

  it("the planner's clearance and the emit gate's clearance are the same measurement", () => {
    // ONE screen. `mountedBodies` sizes a pooled bay with the deterministic draw,
    // which is what `clearanceRecord` screens against, so the number the planner
    // maximised is the number the gate reads back.
    const m = mountedBodies("sc-park-left");
    assert.ok(m.count > 0);
    const byId = Object.fromEntries(bodiesForLesson("sc-park-left").bodies.map((b) => [b.id, b]));
    for (const b of m.bodies) assert.equal(b.model, byId[b.id].mountedModel ?? byId[b.id].kind, `${b.id} is sized for a model it does not mount`);
    // the frozen collided witness, measured both ways
    const rows = anchorWitnessRows();
    const viaPlanner = worstMountedClearance(rows, m).worst;
    const viaGate = clearanceRecord(rows, bodiesForLesson("sc-park-left").bodies).worstBodyClearanceM;
    near(viaPlanner, viaGate, 1e-4, "the planner's clearance and the gate's clearance");
    near(viaPlanner, ANCHOR.expect.dret_90, 0.01, "…and both are the anchor's independently measured number");
  });

  it("a pooled body whose mounted model has no measured extents is REFUSED, never sized with a default", () => {
    assert.throws(
      () => mountedBodies("sc-park-left", { half: { ...FLEET_BODY_HALF, dret_90: undefined } }),
      (err) => {
        assert.ok(err instanceof Unreadable, `threw ${err?.name}`);
        assert.match(err.message, /dret_90/, "the refusal must name the model");
        assert.match(err.message, /refusing to PLAN/, "…and say it refused to plan, not merely to report");
        return true;
      },
    );
    assert.throws(() => clearanceFn([{ id: "no-box" }]), /carries no OBB/);
    assert.throws(() => worstMountedClearance([], mountedBodies("sc-park-left")), /no rows to screen/);
  });

  it("every re-planned reverse witness says WHICH start won and what the field scored", () => {
    // The dead-predicate test: `clearancePlan` is written into the committed JSON
    // and read here, so «the multi-start ran» is checkable from the artefact alone
    // rather than being a claim in a build log nobody keeps.
    let seen = 0;
    // sc-park-bay-exit-rev is absent because the gate refuses to emit it at all: its
    // committed file is the pre-screen one, and a witness nobody re-planned has no
    // clearance plan to show. The test above is what pins that.
    for (const lesson of ["sc-park-left", "sc-park-van", "sc-park-gap-short", "sc-park-zebra", "sc-park-wall"]) {
      for (const seg of refOf(lesson).segments) {
        if (seg.gear !== -1) continue;
        for (const w of seg.witnesses) {
          assert.ok(w.clearancePlan?.objective, `${lesson} seg ${seg.k} witness ${w.startAlongM} was planned without the clearance objective: ${w.clearancePlan?.refused ?? "it carries no clearancePlan at all"}`);
          assert.ok(CLEAR_STARTS.includes(w.clearancePlan.start), `${lesson}: unknown winning start ${w.clearancePlan.start}`);
          assert.equal(w.clearancePlan.starts.length, CLEAR_STARTS.length, `${lesson} seg ${seg.k} witness ${w.startAlongM} ran ${w.clearancePlan.starts.length} starts`);
          const best = w.clearancePlan.starts.reduce((a, b) => (b.clearM !== null && b.f < a.f ? b : a));
          assert.equal(best.start, w.clearancePlan.start, `${lesson}: the recorded winner is not the best-scoring start`);
          seen += 1;
        }
      }
    }
    assert.ok(seen >= 6, `only ${seen} re-planned reverse witnesses carry a clearance plan`);
  });
});

/* ═══════════ §5b THE STOP AND THE WHEEL THE PLAN IS ALLOWED (2026-09-16) ═══════════
 *
 * Two mechanisms, each pinned where it is consumed so neither can be a dead value:
 *
 *  · THE REVERSE WHEEL. `policy.mjs REVERSE_LOCK_AUTHORITY` (the product's 0.892 of
 *    kinematic lock curvature in R) reaches `planner.mjs lockFor` through
 *    `build-pathrefs.mjs GENERATOR.reverseAuthority`; a witness integrated at κ 0.95
 *    may not ask for more curvature than the car delivers at full lock.
 *  · THE TIE. The running minimum clearance only falls, so every stop after the
 *    binding pose ties on it; the tie is broken toward room in the product box
 *    (`endRoom`), in the search and in the commit, instead of keeping the first —
 *    the stop on the gate's edge.
 */
describe("§5b the reverse wheel the car has, and the tie between equally clear stops", () => {
  it("lockFor caps a REVERSE plan at the car's measured authority, only when asked, and refuses an authority it cannot read", () => {
    const rev = straightCtx(3.0);
    near(lockFor(rev, 3), maxSteerAtKmh(3), 0, "no authority supplied: the product's lock, exactly as before");
    const capped = { ...rev, reverseAuthority: REVERSE_LOCK_AUTHORITY };
    const want = Math.atan((REVERSE_LOCK_AUTHORITY / 0.95) * Math.tan(maxSteerAtKmh(3)));
    near(lockFor(capped, 3), want, 1e-12, "tan δ = (authority / κ) · tan(lock)");
    assert.ok(lockFor(capped, 3) < maxSteerAtKmh(3) - 0.02, `the cap must bite: ${lockFor(capped, 3)} vs lock ${maxSteerAtKmh(3)}`);
    near(lockFor({ ...capped, sigma: 1 }, 3), maxSteerAtKmh(3), 0, "a FORWARD plan is never capped by the reverse authority");
    for (const bad of [0, -0.1, 1.2, Number.NaN, "0.892"]) {
      assert.throws(() => lockFor({ ...rev, reverseAuthority: bad }, 3), /refusing to plan a reverse witness/, `authority ${bad} must be refused by name`);
    }
    assert.equal(GENERATOR.reverseAuthority, REVERSE_LOCK_AUTHORITY, "the value the builder records is the value policy.mjs declares");
  });

  it("…and the integrator really never turns the wheel past it, however hard the targets ask", () => {
    const run = (ctx) => {
      const r = simulateTargets(ctx, 0, () => 1.0, 120, { keepPath: true });
      return Math.max(...r.path.map((p) => Math.abs(p[3])));
    };
    const rev = { ...straightCtx(3.0), clearanceAt: null };
    near(run(rev), maxSteerAtKmh(3), 1e-12, "uncapped: the wheel reaches the product's lock");
    const capped = { ...rev, reverseAuthority: REVERSE_LOCK_AUTHORITY };
    near(run(capped), lockFor(capped, 3), 1e-12, "capped: the wheel stops at lockFor, never past it");
  });

  it("the SEARCH breaks a tie on clearance toward room, and without endRoom keeps the first stop exactly as before", () => {
    // every pose clears by 1 m, so every in-box stop TIES; room prefers the stop nearest y = 0.03
    const base = { ...straightCtx(3.0), clearanceAt: () => 1.0, clearEndLadder: [1.0] };
    const first = simulateTargets(base, 0, () => 0, 220, {}).bestClear;
    const roomy = simulateTargets({ ...base, endRoom: (cx, cy) => Math.abs(cy - 0.03) }, 0, () => 0, 220, {}).bestClear;
    assert.ok(first && roomy, "both runs must find an in-box stop");
    near(first.pose[1], 0.5, 0.051, "no endRoom: the FIRST admissible stop, at the box edge");
    near(roomy.pose[1], 0.03, 0.026, "endRoom: the tied stop with the most room");
    assert.equal(roomy.clear, first.clear, "the tie-break never trades clearance");
    assert.throws(() => simulateTargets({ ...base, endRoom: () => Number.NaN }, 0, () => 0, 220, {}), /refusing to rank a stop whose park-box room could not be read/);
  });

  it("the COMMIT (pickStop) breaks the same tie at the row the car RESTS in, and a clearance lead still wins over room", () => {
    // a straight reverse in rows (probe frame z = −y): s, cx, cz, rx, rz, psi, delta, devM, vKmh
    const rows = [];
    for (let k = 0; k <= 100; k++) rows.push([k * 0.1, 0, -(10 - k * 0.1), 0, -(11.28 - k * 0.1), 0, 0, 0, 3]);
    const end = { x: 0, y: 0, psi: 0 };
    const box = { posM: 0.5, yawDeg: 10 };
    const opts = { clearanceAt: () => 1.0, endGate: () => true };
    const first = pickStop(rows, end, box, 1.0, opts);
    const roomy = pickStop(rows, end, box, 1.0, { ...opts, endRoom: (cx, cy) => Math.abs(cy - 0.4) });
    near(-rows[first.k][2], 0.5, 1e-9, "no endRoom: the first in-box row");
    // the room is read 0.3 m (REST_BACK_M) back: the stop at y 0.1 rests at y 0.4
    near(-rows[roomy.k][2], 0.1, 1e-9, "endRoom: the stop whose REST row has the most room");
    // a later row that is less clear is not bought with room
    const falling = { ...opts, clearanceAt: (x, y) => (y < 0.2 ? 0.9 : 1.0), endRoom: (cx, cy) => Math.abs(cy - 0.0) };
    const kept = pickStop(rows, end, box, 1.0, falling);
    assert.equal(kept.clearM, 1.0, "room never outvotes clearance");
    assert.throws(() => pickStop(rows, end, box, 1.0, { ...opts, endRoom: () => Number.POSITIVE_INFINITY }), /refusing to rank a stop nothing measured/);
  });
});

/* ═══════════════ §6 the sampling term, MEASURED (2026-09-16) ════════════════
 *
 * `BODY_FLOOR_M` carried 0.010 m for "this screen SAMPLES poses 0.1 m of arc
 * apart instead of sweeping the body". Nobody had measured it. These tests do,
 * and they pin the three things that follow: the point screen over-reads by up
 * to 3.2x that assumption; the swept screen agrees with itself to floating-point
 * noise; and the floor did NOT move to accommodate either fact.
 *
 * RE-PINNED 2026-09-16, deliberately. This held sc-park-gap-short at 0.0227 m as
 * the worst over-read in the corpus. The re-plan that moved every reverse stop to
 * where the car comes to REST rather than where it aims (policy.mjs REST_BACK_M)
 * carried sc-park-judge's +0.5 witness 0.3 m further into its bay, past a corner
 * the 0.1 m row spacing straddles, and 0.0318 m is now the worst. gap-short is
 * unchanged at 0.0227 m. The claim got STRONGER, the assumption it refutes did
 * not move, and the number is re-pinned rather than relaxed to a range.
 */
describe("§6 the swept screen", () => {
  it("the point screen OVER-READS a committed witness by up to 0.0318 m — 3.2x the term the floor assumed", () => {
    let worstOverRead = { m: 0 };
    for (const lesson of ["sc-park-gap-short", "sc-park-left", "sc-park-wall", "sc-park-zebra", "sc-park-van", "sc-park-judge"]) {
      const m = mountedBodies(lesson);
      if (!m.count) continue;
      for (const seg of refOf(lesson).segments) {
        for (const w of seg.witnesses) {
          if (!w.rows?.length) continue;
          const r = worstMountedClearance(w.rows, m);
          // the point screen can only OVER-read: the rows it looks at are a subset
          // of the ribbon the sweep looks at
          assert.ok(r.pointWorst >= r.worst - 1e-9, `${lesson} seg${seg.k} w${w.startAlongM}: point ${r.pointWorst} < swept ${r.worst}`);
          if (r.pointSamplingM > worstOverRead.m) worstOverRead = { m: r.pointSamplingM, lesson, seg: seg.k, w: w.startAlongM };
        }
      }
    }
    assert.ok(worstOverRead.m > 0.03, `the measured over-read is ${worstOverRead.m}; the assumption it replaces was 0.010`);
    assert.equal(worstOverRead.lesson, "sc-park-judge", JSON.stringify(worstOverRead));
    // and it is CORNER-TO-CORNER geometry, not a constant: the face-to-face
    // lessons really are at the assumed order of magnitude, which is why no single
    // number could have covered both
    const faceToFace = worstMountedClearance(refOf("sc-park-left").segments[1].witnesses[0].rows, mountedBodies("sc-park-left"));
    assert.ok(faceToFace.pointSamplingM < 0.001, `sc-park-left over-read ${faceToFace.pointSamplingM}`);
  });

  it("the screen MEASURES its own residual by re-measuring at a fifth of the spacing, and it is noise", () => {
    let worstResidual = 0;
    for (const lesson of ["sc-park-gap-short", "sc-park-left", "sc-park-wall", "sc-park-zebra", "sc-park-van", "sc-park-judge", "sc-park-45-rev", "sc-pk-driveway"]) {
      const m = mountedBodies(lesson);
      if (!m.count) continue;
      for (const seg of refOf(lesson).segments) {
        for (const w of seg.witnesses) {
          if (!w.rows?.length) continue;
          worstResidual = Math.max(worstResidual, worstMountedClearance(w.rows, m).residualM);
        }
      }
    }
    assert.ok(worstResidual < 1e-6, `the swept screen disagrees with itself by ${worstResidual} m`);
    assert.ok(worstResidual < SWEEP_RESIDUAL_TOL_M / 100, "the tolerance is nowhere near binding, which is what makes it a guard and not a fudge");
  });

  it("a screen that CANNOT agree with itself refuses instead of returning a number", () => {
    const boxes = mountedBodies("sc-park-left").bodies.map((b) => b.box);
    const rows = refOf("sc-park-left").segments[1].witnesses[0].rows;
    const poses = rows.map(poseOfRow);
    // a tolerance of zero makes any floating-point disagreement a refusal: the
    // guard is reachable, and it throws by NAME rather than returning a guess
    assert.throws(
      () => sweptSeparation(poses, boxes, { residualTolM: -1 }),
      (e) => e instanceof Unreadable && /disagrees with itself/.test(e.message),
    );
  });

  it("refinement converges: the same answer from every scan spacing, while the raw scan does not", () => {
    const boxes = mountedBodies("sc-park-gap-short").bodies.map((b) => b.box);
    const poses = refOf("sc-park-gap-short").segments[1].witnesses.find((w) => w.startAlongM === 1).rows.map(poseOfRow);
    const at = (sp) => sweptSeparation(poses, boxes, { spacingM: sp });
    const refined = [0.05, 0.01, 0.0025, 0.0005].map((sp) => at(sp).worst);
    for (const v of refined) near(v, refined[0], 1e-6, "refined values must agree across spacings");
    // the unrefined scan does NOT agree with itself at those spacings — which is
    // exactly why refinement, and not merely a finer grid, is what makes it exact
    const scans = [0.05, 0.01, 0.0025].map((sp) => at(sp).scanWorst);
    assert.ok(Math.max(...scans) - Math.min(...scans) > 1e-4, `the raw scans agreed to ${Math.max(...scans) - Math.min(...scans)}; this case no longer exercises the defect`);
  });

  it("the sweep refuses a pose it cannot read, and refuses to report clearance against nothing", () => {
    const boxes = mountedBodies("sc-park-left").bodies.map((b) => b.box);
    const good = [{ x: 0, z: 0, psiDeg: 0 }, { x: 0, z: 1, psiDeg: 0 }];
    assert.throws(() => sweptSeparation([{ x: 0, z: 0, psiDeg: NaN }, ...good], boxes), (e) => e instanceof Unreadable && /is not finite/.test(e.message));
    assert.throws(() => sweptSeparation(good, []), (e) => e instanceof Unreadable && /clearance against nothing/.test(e.message));
    assert.throws(() => sweptSeparation([], boxes), (e) => e instanceof Unreadable && /no poses/.test(e.message));
    assert.throws(() => poseOfRow([0, 1, NaN, 0, 0, 0]), (e) => e instanceof Unreadable && /could not be read/.test(e.message));
    // densifyPoses keeps the endpoints and never skips a pose
    const dense = densifyPoses(good, 0.1);
    assert.equal(dense.length, 11);
    near(dense[5].z, 0.5, 1e-9);
  });

  it("THE FLOOR DID NOT MOVE. A better instrument raises what a lesson must clear, never lowers it", () => {
    assert.equal(BODY_FLOOR_M, 0.15);
    assert.equal(BODY_WARN_M, 0.3);
    // and the floor's own derivation is now MORE conservative than its terms: the
    // sampling term it budgeted 0.010 m for is measured at floating-point noise,
    // and that slack is kept rather than handed to a lesson.
    const FOLLOW = 0.088;
    const UNSEEABLE = 0.05;
    assert.ok(BODY_FLOOR_M > FOLLOW + UNSEEABLE, "the floor must sit above its own measured terms");
  });
});

/* ═══════ §7 THE FOLLOWER'S LIVE GUARD — the same floor, the same bodies ═══════
 *
 * `drive-clearance.mjs bodyClearanceGuard` is what replaced `policy.mjs BAY_FLANKS` on
 * 2026-09-16: the proxy measured the centre's LATERAL OFFSET FROM THE BAY AXIS against a
 * hand-kept face minus a tuned margin, and had begun to refuse the planner's own
 * clearance-maximising witnesses before any contact. The rule now is one sentence — the
 * follower refuses when it predicts its own drive would fail canary gate G10 — and what makes
 * that sentence true is that the guard and the gate are the SAME measurement.
 */
describe("§7 the follower's live body guard", () => {
  it("the guard's number IS the gate's number: same chassis box, same bodies, same floor", () => {
    const g = bodyClearanceGuard("sc-park-left");
    assert.equal(g.floorM, DRIVE_CLEARANCE_FLOOR_M, "the follower may not hold a floor of its own");
    assert.equal(g.planFloorM, BODY_FLOOR_M);
    const m = mountedBodies("sc-park-left");
    assert.equal(g.count, m.count);
    // every body, at the same pose, reads the same separation through both entry points
    const w = refOf("sc-park-left").segments[1].witnesses[0];
    for (const row of [w.rows[0], w.rows[Math.floor(w.rows.length / 2)], w.rows[w.rows.length - 1]]) {
      const a = g.at(row[1], row[2], row[5]).m;
      const b = clearanceAtPose(m.bodies, row[1], row[2], row[5]).m;
      assert.equal(a, b, "the guard and the screen disagree about the same pose");
    }
  });

  it("the braking ribbon follows the ARC the car is on — a straight chord to the stop point is measurably wrong", () => {
    const g = bodyClearanceGuard("sc-park-wall");
    const m = mountedBodies("sc-park-wall");
    const w = refOf("sc-park-wall").segments[1].witnesses[0];
    const row = w.rows[Math.floor(w.rows.length * 0.6)];
    const from = { x: row[1], z: row[2], psiDeg: row[5] };
    // screenAtM lifts the Lipschitz pre-screen so both ribbons are actually scanned: with the
    // default floor a body this far away is provably unreachable and is skipped, which is the
    // optimisation, not the measurement.
    const straight = g.brakingRibbon(from, { kappaDegPerM: 0, gear: -1, distanceM: 0.4, screenAtM: 10 });
    const turning = g.brakingRibbon(from, { kappaDegPerM: -13.5, gear: -1, distanceM: 0.4, screenAtM: 10 });
    assert.notEqual(straight.m, turning.m, "curvature changed nothing — the ribbon is not being integrated");
    // the bound is the scan's own, and it grows with the swing, exactly as the drive gate's
    // `interpolationBoundM` does — an approximation pays for itself here too
    assert.ok(turning.boundM > straight.boundM, `${turning.boundM} vs ${straight.boundM}`);
    assert.ok(straight.boundM <= BRAKE_SCAN_SPACING_M / 2 + 1e-12);
    // a zero-distance ribbon is the pose itself
    const still = g.brakingRibbon(from, { kappaDegPerM: 0, gear: -1, distanceM: 0, screenAtM: 10 });
    assert.equal(still.m, g.at(from.x, from.z, from.psiDeg).m);
    // …and an endpoint it cannot read is a refusal, never a skipped screen
    assert.throws(() => g.brakingRibbon({ x: NaN, z: 0, psiDeg: 0 }, { distanceM: 1 }), Unreadable);
    assert.throws(() => g.brakingRibbon(from, { kappaDegPerM: NaN, distanceM: 1 }), Unreadable);
  });

  it("a lesson whose bodies cannot be READ refuses the drive by name — it is never driven unscreened", () => {
    assert.throws(() => bodyClearanceGuard("sc-not-a-lesson"), Unreadable);
    // the follower carries the refusal on the state and fires it at the first step
    const p = { schema: "knijka.pathref/1", lesson: "sc-not-a-lesson", segments: [{ k: 0, gear: 1, micro: false, lengthM: 1, extensionM: 0, stops: [], speed: { movingMedianKmh: [5] }, witnesses: [{ startAlongM: 0, startPose: { x: 0, z: 0, psi: 0 }, rows: [[0, 0, 0, 0, 0, 0, 0, 0, 5]] }] }] };
    const st = createPathState(p);
    assert.equal(st.bodyGuard.ok, false);
    assert.equal(st.bodyGuard.off, false, "an unreadable lesson must not read as 'the guard is off'");
    assert.match(st.bodyGuard.why, /no scenario template declares this id/);
    // …and the only way to drive without it is to SAY SO
    const off = createPathState(p, { ...PATH_TUNE, clearance: { refuse: false } });
    assert.equal(off.bodyGuard.off, true);
    assert.match(off.bodyGuard.why, /deliberately off/);
  });

  it("the guard is armed for EVERY segment — which is more than the proxy it replaced ever covered", () => {
    // `bay-lateral` was built in the reverse-follow transition and existed only for the five
    // lessons with a BAY_FLANKS row; a forward approach had no body guard at all.
    for (const lesson of ["sc-park-left", "sc-park-wall", "sc-park-van", "sc-park-zebra", "sc-park-gap-short", "sc-park-gap-long", "sc-park-judge", "sc-park-45-rev", "sc-pk-driveway", "sc-ed-poligon-chain"]) {
      const st = createPathState(refOf(lesson));
      assert.equal(st.bodyGuard.ok, true, `${lesson}: ${st.bodyGuard.why}`);
      assert.ok(st.bodyGuard.guard.count >= 1, `${lesson}: ${st.bodyGuard.guard.count} bodies`);
    }
  });
});
