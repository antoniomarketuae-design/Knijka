// -----------------------------------------------------------------------------
// wave-c-summary.test.mjs — THE LEDGER MUST CARRY WHETHER THE DRIVE'S OWN
// PEDALS ARRIVED.
//
//   node --test tools/mobile/__tests__/wave-c-summary.test.mjs
//   (or `node scripts/tools-tests.mjs` from platform/, which discovers it)
//
// `sc-speed-creep:84ba5dbf` is a critical whose whole force was that a guard
// signal existed only in stdout and was thrown away, so five criticals in the
// brake-drop family could be neither closed nor refuted. Half of it was
// repaired when `wave-c.mjs` started keeping the transcript: the guard line is
// now on disk, at ~84 KB a drive. The half that stayed open is the row's own
// prescribed fix, quoted from the finding: „add lostKeys and
// refusedReversePress to parseSummary so the signal lands in the ledger row".
// It had not landed. `parseSummary` lifted nine fields off the summary line and
// neither counter, so `wave-c-results.jsonl` — the file every dispatcher and
// every judge actually reads — could not show that a drive lost the brake
// twice.
//
// WHY IT WENT FIFTEEN ROUNDS UNNOTICED, which is the part worth keeping: the
// reader lived inside `wave-c.mjs`, and that file drives 376 lessons at import.
// No test could call it without starting a wave. The reader is now
// `lib/summary.mjs` and this file drives it.
//
// WHAT EACH BLOCK DEFENDS, because a green battery proves nothing on its own:
//
//  §1 THE NUMBERS. Verbatim `DRIVE:` lines lifted out of real run.logs — the
//     plural branch, the singular branch, both clauses, one clause, neither —
//     so the two regexes are judged on the emitter's actual output and not on
//     a sentence written here to match them.
//
//  §2 ABSENCE IS NOT ZERO UNLESS SOMETHING DROVE. The emitter appends each
//     clause only when its counter is non-zero, so absence is the common case
//     and must read 0 — but a transcript with no `DRIVE:` line at all measured
//     neither, and „0 lost keys" for a drive that never reported is the
//     reassuring direction this harness exists to refuse.
//
//  §3 THE EMITTER AND THE READER ARE ONE PAIR. Both halves are in this repo and
//     nothing made them agree: the wording lives in `lesson-audit.mjs`, the
//     regex in `lib/summary.mjs`, and a reworded clause would turn every future
//     drive's counter into a silent 0 — the exact false-acquittal shape
//     `laneArrows.ts` records for the arrow tables. So the literals the reader
//     keys on are asserted to still be in the emitter.
//
//  §4 THE WIRE. A field parsed and not written is a field nobody sees.
//     `wave-c.mjs` must take the reader from the library (not re-inline a
//     nine-field copy) and must spread the whole object into the row.
//
//  §5 THE CORPUS, when it is on this disk. `.audit-frames/` is gitignored, so
//     this block SKIPS LOUDLY rather than passing silently — the `mobileBudget`
//     precedent. When present it re-scans every transcript raw and requires the
//     reader to agree drive for drive, which is what catches an emitter reword
//     that §3's literals happen to survive.
// -----------------------------------------------------------------------------
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DRIVE_SUMMARY_RE, INPUT_ATTESTATION, INPUT_GUARDS, TOUCH_PROBE, parseSummary } from "../lib/summary.mjs";
import { readbackVerdict, touchProbeLine } from "../lib/touch-probe.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLS_MOBILE = path.resolve(HERE, "..");
const REPO = path.resolve(TOOLS_MOBILE, "..", "..");

/* ── the transcripts, verbatim ───────────────────────────────────────────────
   Each is the `DRIVE:` line of a real drive, copied out of the run.log named
   beside it. Two leading spaces included, because that is how `note()` indents
   and a reader that only works on a trimmed line is a reader that works on
   nothing this harness produces. */

// .audit-frames/proof2/frames/sc-ac-crosswind__mobile-right/run.log:1155
const BOTH_CLAUSES =
  "  DRIVE: right · top 25 км/ч · 24 full stops · 0 lawful waits honoured (0s) · " +
  "1 pause layer drained · refused 8 standstill brake presses (would have selected R) · " +
  "re-asserted the brake 2× after the sim lost the key";

// .audit-frames/proof2/frames/sc-ac-bridge-ice__mobile-right/run.log:1139 — the
// SINGULAR branch of the emitter's own plural («press» with no «es»).
const SINGULAR_REFUSAL =
  "  DRIVE: right · top 28 км/ч · 23 full stops · 0 lawful waits honoured (0s) · " +
  "1 pause layer drained · refused 1 standstill brake press (would have selected R) · " +
  "re-asserted the brake 2× after the sim lost the key";

// .audit-frames/proof2/frames/sc-ac-crosswind__pc-right/run.log:1150 — the pc
// leg of the SAME lesson, and the shape that made the family measurable: 57
// refusals and not one lost key.
const REFUSALS_ONLY =
  "  DRIVE: right · top 17 км/ч · 27 full stops · 0 lawful waits honoured (0s) · " +
  "2 pause layers drained · refused 57 standstill brake presses (would have selected R)";

// .audit-frames/proof2/frames/sc-speed-creep__mobile-right/run.log:1107 — the
// row's own lesson.
const LOST_KEYS_ONLY =
  "  DRIVE: right · top 28 км/ч · 24 full stops · 0 lawful waits honoured (0s) · " +
  "1 pause layer drained · re-asserted the brake 2× after the sim lost the key";

// .audit-frames/proof2/frames/sc-ac-aquaplane__pc-right/run.log — a clean drive:
// the emitter appends NEITHER clause, which is the common case.
const NEITHER =
  "  DRIVE: right · top 24 км/ч · 27 full stops · 0 lawful waits honoured (0s) · " +
  "1 pause layer drained";

describe("§1 the two input guards are read off the drive summary", () => {
  it("lifts both counters when the emitter printed both", () => {
    const s = parseSummary(BOTH_CLAUSES);
    assert.equal(s.refusedReversePress, 8);
    assert.equal(s.lostKeys, 2);
  });

  it("reads the SINGULAR «brake press» as well as the plural", () => {
    // MUTATION that proves it: drop `(?:es)?` from INPUT_GUARDS
    // .refusedReversePress and this case reads 0 instead of 1 — a drive that
    // refused a press reported as a drive that refused none.
    assert.equal(parseSummary(SINGULAR_REFUSAL).refusedReversePress, 1);
    assert.equal(parseSummary(SINGULAR_REFUSAL).lostKeys, 2);
  });

  it("one clause present does not invent the other", () => {
    const pc = parseSummary(REFUSALS_ONLY);
    assert.equal(pc.refusedReversePress, 57);
    assert.equal(pc.lostKeys, 0);

    const phone = parseSummary(LOST_KEYS_ONLY);
    assert.equal(phone.lostKeys, 2);
    assert.equal(phone.refusedReversePress, 0);
  });

  it("counts are NUMBERS — a ledger row that sorts «10» before «2» is a ledger nobody can rank", () => {
    const s = parseSummary(BOTH_CLAUSES);
    assert.equal(typeof s.refusedReversePress, "number");
    assert.equal(typeof s.lostKeys, "number");
  });

  it("still lifts everything it lifted before — the nine fields are not traded for the two", () => {
    const s = parseSummary(
      "serving 769bfd439d3f\nVERDICT: НЕИЗДЪРЖАН · x\nSCORE: 10 наказателни\n" +
        "2 от 3 звезди\nframes: 41 captured · 0 LOST\nendedNaturally: true\n" +
        "forcedBy: budget\n" +
        BOTH_CLAUSES,
    );
    assert.equal(s.verdict, "НЕИЗДЪРЖАН");
    assert.equal(s.score, "10");
    assert.equal(s.stars, "2");
    assert.equal(s.frames, "41");
    assert.equal(s.lost, "0");
    assert.equal(s.endedNaturally, true);
    assert.equal(s.forcedBy, "budget");
    assert.equal(s.treeMoved, false);
    assert.equal(s.attested, "769bfd439d3f");
  });
});

describe("§2 absence is zero only once something drove", () => {
  it("a drive that printed its summary and neither clause measured zero of each", () => {
    const s = parseSummary(NEITHER);
    assert.equal(s.refusedReversePress, 0);
    assert.equal(s.lostKeys, 0);
  });

  it("a transcript with NO drive summary measured neither — null, never 0", () => {
    // The shape that made this worth a branch: a drive that dies before its
    // summary (a crash, a refused sign-in, a tree that moved) has taken no
    // reading at all. Reporting 0 there is the difference between „this phone
    // kept its brake" and „nobody looked", and the whole family was mis-read
    // for fifteen rounds on exactly that kind of silence.
    //
    // MUTATION that proves it: make `guard()` return 0 instead of `drove ? 0 :
    // null` and this case goes red while every case in §1 stays green.
    const dead = parseSummary("[wave-c] target http://localhost:3460\nError: net::ERR_ABORTED\n");
    assert.equal(dead.lostKeys, null);
    assert.equal(dead.refusedReversePress, null);
    assert.equal(DRIVE_SUMMARY_RE.test(dead.verdict ?? ""), false);
  });

  it("the DRIVE line is what decides, and it is recognised with its indent", () => {
    assert.equal(DRIVE_SUMMARY_RE.test(NEITHER), true);
    assert.equal(DRIVE_SUMMARY_RE.test("DRIVE: right · top 24 км/ч"), true);
    // …and it is not satisfied by prose ABOUT a drive.
    assert.equal(DRIVE_SUMMARY_RE.test("the DRIVE: was not summarised"), false);
  });
});

describe("§3 the emitter and the reader are one pair", () => {
  const EMITTER = readFileSync(path.join(TOOLS_MOBILE, "lesson-audit.mjs"), "utf8");

  it("lesson-audit.mjs still prints the two clauses these regexes key on", () => {
    // Read off the emitter at `note()` (the MACHINE SUMMARY block). If either
    // clause is reworded, every future drive's counter silently becomes 0 —
    // and 0 is the answer nobody questions. That is why this reads the source
    // and not the output: the output of a reworded emitter parses fine.
    assert.ok(
      EMITTER.includes(" standstill brake press"),
      "lesson-audit.mjs no longer prints « standstill brake press» — re-point INPUT_GUARDS.refusedReversePress at whatever it prints now, do not delete the field",
    );
    assert.ok(
      EMITTER.includes("(would have selected R)"),
      "lesson-audit.mjs no longer prints «(would have selected R)»",
    );
    assert.ok(
      EMITTER.includes("re-asserted the brake "),
      "lesson-audit.mjs no longer prints «re-asserted the brake » — re-point INPUT_GUARDS.lostKeys",
    );
    assert.ok(
      EMITTER.includes(" after the sim lost the key"),
      "lesson-audit.mjs no longer prints « after the sim lost the key»",
    );
  });

  it("…and it still keeps the counters that feed them", () => {
    // The names the finding prescribed, at their declarations. A counter that
    // is deleted upstream cannot be read downstream, and this says so where a
    // regex would just start returning 0.
    assert.ok(EMITTER.includes("let refusedReversePress = 0;"));
    assert.ok(EMITTER.includes("let lostKeys = 0;"));
  });
});

describe("§4 the wire — a field parsed and not written is a field nobody sees", () => {
  const WAVE_C = readFileSync(path.join(TOOLS_MOBILE, "wave-c.mjs"), "utf8");

  it("wave-c.mjs takes the reader from the library rather than re-inlining it", () => {
    assert.ok(WAVE_C.includes('import { parseSummary } from "./lib/summary.mjs";'));
    // …and does not carry a second copy of the parser, which is how the two
    // counters would go missing again on one side only.
    assert.equal(WAVE_C.includes("function parseSummary("), false);
  });

  it("the whole summary object is spread into the ledger row", () => {
    // `...s` is the wire. Every field `parseSummary` returns reaches
    // wave-c-results.jsonl through it, so the ledger contract IS the reader's
    // key set — asserted here rather than left to a reader's memory.
    assert.ok(WAVE_C.includes("...s,"));
    const keys = Object.keys(parseSummary(BOTH_CLAUSES));
    assert.ok(keys.includes("lostKeys"));
    assert.ok(keys.includes("refusedReversePress"));
  });
});

describe("§5 the corpus, when this disk carries it", () => {
  // `.audit-frames/` is gitignored: it is 619 transcripts on the founder's
  // machine and nothing at all in CI. So this block reports which of the two it
  // is instead of passing quietly either way.
  const ROOTS = ["proof2", "w10-1", "w10-2", "w10-3", "w10-4"]
    .map((w) => path.join(REPO, ".audit-frames", w, "frames"))
    .filter((dir) => existsSync(dir));

  const logs = ROOTS.flatMap((root) =>
    readdirSync(root)
      .map((d) => path.join(root, d, "run.log"))
      .filter((f) => existsSync(f)),
  );

  it("says out loud whether the corpus is here", () => {
    // Not an assertion about the code — an assertion that the next reader knows
    // which of the two runs he just watched.
    assert.ok(
      logs.length === 0 || logs.length > 100,
      `expected either no corpus or a whole one, found ${logs.length} transcript(s)`,
    );
  });

  it("agrees with a raw scan of every transcript on disk", (t) => {
    if (logs.length === 0) {
      t.skip(".audit-frames/ not on this disk — §1–§4 still ran on committed fixtures");
      return;
    }
    let withLost = 0;
    let withRefusal = 0;
    for (const file of logs) {
      const text = readFileSync(file, "utf8");
      const s = parseSummary(text);
      const rawLost = INPUT_GUARDS.lostKeys.exec(text);
      const rawRefused = INPUT_GUARDS.refusedReversePress.exec(text);
      assert.equal(s.lostKeys, rawLost ? Number(rawLost[1]) : 0, file);
      assert.equal(s.refusedReversePress, rawRefused ? Number(rawRefused[1]) : 0, file);
      if (rawLost) withLost++;
      if (rawRefused) withRefusal++;
    }
    // Measured 2026-08-25 over proof2 + w10-1..4: 619 transcripts, 113 lost a
    // key, 272 refused a standstill press. A floor, not an equality — the corpus
    // grows — and it is what keeps this sweep from passing vacuously on a
    // directory of empty logs.
    assert.ok(withLost > 50, `only ${withLost} of ${logs.length} transcripts carry a lost-key line`);
    assert.ok(
      withRefusal > 100,
      `only ${withRefusal} of ${logs.length} transcripts carry a refusal line`,
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * §6 — WHICH CHANNEL DROVE THE CAR (`sc-speed-creep:dff70553`)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The row, quoted: „the brake-drop family is mis-named — the harness never
 * dispatches a touch, so it cannot exercise TouchControls.tsx, the suspect
 * file all five rows name." It is the naming half of the same family §1–§5
 * repaired the counting half of: the 83-of-122 lost-brake rate that gave the
 * family its force was measured on drives that sent KeyW and KeyS, so the
 * defect it points at cannot live in a thumb pad.
 *
 * §6a THE READER lifts the channel off the emitter's line.
 * §6b ABSENCE IS NULL. A drive that never printed the line stated no channel;
 *     answering „keyboard" there would invent an attestation, which is the
 *     same reassuring direction §2 refuses for the two counters.
 * §6c THE EMITTER AND THE READER ARE ONE PAIR — §3's argument, new clause.
 * §6d THE ATTESTATION MAY NOT OUTLIVE ITS TRUTH. `touchEvents: 0` is a claim
 *     about the harness's own source, so the source is censused: the day this
 *     file gains a touch channel the claim stops being true, and this goes RED
 *     rather than letting a drive that DID touch report that it did not.
 *     Adding the capability is welcome; shipping it under this line is not. */

// Synthesised from the emitter's own template, not lifted from a transcript —
// the line is newer than every run.log on this disk. §6c and §6d are what keep
// that honest: they read the emitter's source, so a drift in either direction
// goes red here rather than in a wave six hours long.
const WITH_INPUT =
  "  INPUT: keyboard · 214 pedal/steer key events · 0 touch events dispatched · touch overlay mounted";

describe("§6 the drive states which channel drove it", () => {
  it("lifts the channel, both counts and the overlay state", () => {
    const s = parseSummary(WITH_INPUT);
    assert.equal(s.inputChannel, "keyboard");
    assert.equal(s.driveKeyEvents, 214);
    assert.equal(s.touchEvents, 0);
    assert.equal(s.touchOverlay, "mounted");
  });

  it("reads the other two overlay states the emitter can print", () => {
    assert.equal(
      parseSummary("  INPUT: keyboard · 3 pedal/steer key events · 0 touch events dispatched · touch overlay absent")
        .touchOverlay,
      "absent",
    );
    assert.equal(
      parseSummary("  INPUT: keyboard · 3 pedal/steer key events · 0 touch events dispatched · touch overlay unreadable")
        .touchOverlay,
      "unreadable",
    );
  });

  it("counts are NUMBERS, so a ledger can filter on touchEvents === 0", () => {
    const s = parseSummary(WITH_INPUT);
    assert.equal(typeof s.driveKeyEvents, "number");
    assert.equal(typeof s.touchEvents, "number");
  });

  it("a drive that printed no INPUT line stated NO channel — null, never «keyboard» and never 0", () => {
    // MUTATION that proves it: give `num()`/`grab()` a 0/"keyboard" default and
    // this goes green while every case above stays green — which is how a
    // crashed lane would come to certify that it drove with a keyboard.
    const dead = parseSummary(NEITHER);
    assert.equal(dead.inputChannel, null);
    assert.equal(dead.driveKeyEvents, null);
    assert.equal(dead.touchEvents, null);
    assert.equal(dead.touchOverlay, null);
  });

  it("…and the DRIVE line alone does not conjure one", () => {
    // The two are separate emissions. A transcript carrying one and not the
    // other must report exactly that, or a reader cannot tell an old drive
    // (pre-attestation) from a new one that lost its channel.
    const s = parseSummary(BOTH_CLAUSES);
    assert.equal(s.lostKeys, 2);
    assert.equal(s.inputChannel, null);
  });

  describe("§6c/§6d the emitter, read out of the harness source", () => {
    const EMITTER = readFileSync(path.join(TOOLS_MOBILE, "lesson-audit.mjs"), "utf8");

    it("lesson-audit.mjs still prints the clauses these regexes key on", () => {
      assert.ok(EMITTER.includes("INPUT: ${inputChannel.channel}"), "the INPUT line is gone");
      assert.ok(EMITTER.includes(" pedal/steer key events"), "re-point INPUT_ATTESTATION.driveKeyEvents");
      assert.ok(EMITTER.includes(" touch events dispatched"), "re-point INPUT_ATTESTATION.touchEvents");
      assert.ok(EMITTER.includes("touch overlay "), "re-point INPUT_ATTESTATION.touchOverlay");
      // …and the sentence a dispatcher acts on, which is the whole repair.
      assert.ok(
        EMITTER.includes("no finding about how the CAR"),
        "the mobile lane no longer says that no finding may name TouchControls.tsx",
      );
      assert.ok(EMITTER.includes("const inputChannel = {"), "the attestation record is gone");
    });

    it("…and the claim it makes about itself is TRUE: no touch DRIVES the car", () => {
      // THIS CENSUS CHANGED WHEN THE CAPABILITY LANDED, and the old wording is
      // kept here because the swap is the point. It used to read „this harness
      // actuates no touch" and forbade `dispatchTouchEvent` / `touchscreen` /
      // `tap()` outright, so that `touchEvents: 0` could not outlive its truth.
      // `lesson-audit.mjs` now actuates the drivetrain pad after the drive
      // (`lib/touch-probe.mjs`), which is `sc-speed-creep:dff70553`'s own
      // closure condition — seven verdicts asked for exactly it — so the
      // forbidden list would now be forbidding the repair.
      //
      // WHAT REPLACES IT IS THE CLAIM THAT IS STILL MADE: `channel: "keyboard"`
      // says a KEY moved the car, and that has to stay checkable. The pedals
      // and the wheel are asserted to still be `page.keyboard`, and the touch
      // dispatch is asserted to live in the probe module and NOT in the drive
      // loop — because the day a thumb drives the car, `channel` is the field
      // that must change, and a census that only counted dispatches would have
      // let it stay „keyboard" while a touch pushed the pedal.
      assert.ok(EMITTER.includes('page.keyboard[on ? "down" : "up"]("KeyW")'), "the throttle is no longer a key");
      assert.ok(EMITTER.includes('page.keyboard[on ? "down" : "up"]("KeyS")'), "the brake is no longer a key");
      assert.ok(EMITTER.includes('channel: "keyboard"'), "the drive channel is no longer attested as the keyboard");
      const driveLoop = EMITTER.slice(0, EMITTER.indexOf("const touchProbe = await probeTouchPads"));
      assert.ok(driveLoop.length > 0, "the probe call is gone from lesson-audit.mjs");
      for (const [re, what] of [
        [/dispatchTouchEvent/, "CDP Input.dispatchTouchEvent"],
        [/\.\s*touchscreen\s*\./, "page.touchscreen.*"],
        [/\.\s*tap\s*\(/, "locator.tap()"],
      ]) {
        assert.equal(
          re.test(driveLoop),
          false,
          `a touch is actuated via ${what} BEFORE the drive ends, but the INPUT line still attests «keyboard». ` +
            "A touch that moves the car changes the channel; re-attest it and update this census.",
        );
      }
    });

    it("the probe's count is the one the INPUT line prints — not a second, hopeful number", () => {
      // The dead-predicate shape, in the attestation: a probe that dispatches
      // four events while `inputChannel.touchEvents` stays a literal 0 would
      // print „0 touch events dispatched" over a lane that had touched the pad.
      assert.ok(
        EMITTER.includes("inputChannel.touchEvents = touchProbe.events"),
        "the INPUT line's touch count no longer comes from the probe that dispatched them",
      );
      assert.ok(EMITTER.includes("note(touchProbeLine(touchProbe))"), "the TOUCH PROBE line is no longer printed");
    });

    it("§6f the probe dispatches a TOUCH pointer and counts every one it sends", () => {
      const PROBE = readFileSync(path.join(TOOLS_MOBILE, "lib", "touch-probe.mjs"), "utf8");
      assert.ok(PROBE.includes('pointerType: "touch"'), "the probe no longer claims to be a finger");
      assert.ok(PROBE.includes("new PointerEvent("), "the probe no longer dispatches a pointer event");
      // Every dispatch raises the counter, because they share one function.
      const sends = [...PROBE.matchAll(/^\s*send\("(pointer\w+)"/gm)].map((m) => m[1]);
      for (const edge of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
        assert.ok(sends.includes(edge), `the probe never sends ${edge} — the pad's release edges need all four`);
      }
      assert.ok(PROBE.includes("events += 1;"), "the probe dispatches without counting");
      // Dead centre is the safety argument; a probe that pressed off-centre
      // would command the car AFTER the drive and before the verdict is read.
      assert.ok(
        PROBE.includes("box.left + box.width / 2") && PROBE.includes("box.top + box.height / 2"),
        "the probe no longer presses the pad's dead centre, so it can now command the car",
      );
    });

    it("the counter is incremented where the keys are actually sent", () => {
      // A count that is declared and never raised reports 0 for a drive that
      // sent 200 keys — the dead-predicate shape, in the attestation itself.
      const raises = [...EMITTER.matchAll(/inputChannel\.driveKeyEvents \+= \d+;/g)];
      assert.ok(
        raises.length >= 6,
        `only ${raises.length} site(s) raise driveKeyEvents — the pedal, steer, drain and re-assert paths all send keys`,
      );
    });
  });

  describe("§6e the wire", () => {
    const WAVE_C = readFileSync(path.join(TOOLS_MOBILE, "wave-c.mjs"), "utf8");

    it("the channel reaches the ledger row and the console line", () => {
      // `...s` (asserted in §4) carries the fields; this pins that the row's
      // documented contract and the scroll a dispatcher reads both name them.
      const keys = Object.keys(parseSummary(WITH_INPUT));
      for (const k of ["inputChannel", "driveKeyEvents", "touchEvents", "touchOverlay"]) {
        assert.ok(keys.includes(k), `parseSummary no longer returns ${k}`);
      }
      assert.ok(WAVE_C.includes("s.touchEvents"), "the console line no longer prints the touch count");
      assert.ok(WAVE_C.includes("touchEvents"), "wave-c.mjs no longer documents the column");
    });

    it("…and so does the pad verdict, which is what routes a touch finding", () => {
      // The whole point of the row: a dispatcher must be able to see, without
      // opening an 84 KB log, whether the surface a finding names was reached.
      const keys = Object.keys(parseSummary(WITH_PROBE));
      for (const k of ["touchProbe", "touchProbeEvents", "touchProbeHold", "touchProbeRelease"]) {
        assert.ok(keys.includes(k), `parseSummary no longer returns ${k}`);
      }
      assert.ok(WAVE_C.includes("s.touchProbe"), "the console line no longer prints whether the pad was reached");
      assert.ok(WAVE_C.includes("unreached"), "the scroll no longer names the state that forbids a touch address");
    });
  });

  it("the reader's regexes are exported so a judge can re-scan a transcript raw", () => {
    // §5's precedent: the corpus scan re-runs the regexes itself rather than
    // trusting the parser it is checking.
    assert.equal(INPUT_ATTESTATION.touchEvents.exec(WITH_INPUT)[1], "0");
    assert.equal(INPUT_ATTESTATION.channel.exec(WITH_INPUT)[1], "keyboard");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * §7 — THE PAD WAS ACTUALLY PRESSED (`sc-speed-creep:dff70553`, the other half)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * §6 made the lane STATE that it sent no touch. That is what w24 and w25 both
 * credited and both refused to close on, in the same words: „the harness gap
 * itself (0 touch events) is exactly as the row describes it". So the pad is
 * now pressed, and this block defends the two things a press is worth nothing
 * without — that the result reaches the ledger, and that „it answered" is a
 * MEASUREMENT and not a default.
 *
 * The judge (`readbackVerdict`) is separated from the browser on purpose: the
 * in-page half needs WebKit and a running sim, and everything that DECIDES
 * what the readback meant runs here, on the same fixtures a reader can check
 * by eye. */

/** The emitter's own template, both branches. */
const WITH_PROBE =
  "  INPUT: keyboard · 214 pedal/steer key events · 4 touch events dispatched · touch overlay mounted\n" +
  "  TOUCH PROBE: actuated · 4 touch events dispatched · hold survived · release clean — pressed dead centre";
const PROBE_DROPPED =
  "  TOUCH PROBE: actuated · 4 touch events dispatched · hold did NOT survive · release NOT observed — let go";
const PROBE_UNREACHED =
  "  TOUCH PROBE: NOT actuated · 0 touch events dispatched · hold did NOT survive · release NOT observed — no overlay";

describe("§7 what the drivetrain pad did when it was pressed", () => {
  it("lifts all four fields off the emitter's line", () => {
    const s = parseSummary(WITH_PROBE);
    assert.equal(s.touchProbe, "actuated");
    assert.equal(s.touchProbeEvents, 4);
    assert.equal(s.touchProbeHold, "survived");
    assert.equal(s.touchProbeRelease, "clean");
  });

  it("…and the drop and the unreached branches, which are the two that matter", () => {
    const dropped = parseSummary(PROBE_DROPPED);
    assert.equal(dropped.touchProbe, "actuated");
    assert.equal(dropped.touchProbeHold, "did NOT survive");
    const unreached = parseSummary(PROBE_UNREACHED);
    assert.equal(unreached.touchProbe, "NOT actuated");
    assert.equal(unreached.touchProbeEvents, 0);
  });

  it("a transcript with no TOUCH PROBE line measured NOTHING — null, never «NOT actuated»", () => {
    // The §2/§6b argument again: a lane that died before the probe ran did not
    // establish that the pad is unreachable, and reporting that it did would
    // send the next dispatcher to re-address five rows off a crash.
    const s = parseSummary(BOTH_CLAUSES);
    assert.equal(s.touchProbe, null);
    assert.equal(s.touchProbeEvents, null);
    assert.equal(s.touchProbeHold, null);
    assert.equal(s.touchProbeRelease, null);
  });

  it("THE TWO «touch events dispatched» CLAUSES DO NOT READ EACH OTHER", () => {
    // The regression this file exists to prevent, in its newest shape: two
    // lines now carry that wording, and an unanchored regex would return
    // whichever the emitter printed first. A drive with 0 touch on the INPUT
    // line and 4 on the probe line must report exactly that pair.
    const mixed =
      "  INPUT: keyboard · 12 pedal/steer key events · 0 touch events dispatched · touch overlay absent\n" +
      "  TOUCH PROBE: NOT actuated · 4 touch events dispatched · hold did NOT survive · release NOT observed — x";
    const s = parseSummary(mixed);
    assert.equal(s.touchEvents, 0);
    assert.equal(s.touchProbeEvents, 4);
  });

  describe("§7b the judge, with no browser in it", () => {
    const seatedKnob = { transition: "none", transform: "translateY(0.0px)", valueNow: "0" };
    const restKnob = { transition: "", transform: "", valueNow: "0" };
    const releasedKnob = { transition: "transform 140ms ease-out, border-color 140ms linear", transform: "translateY(0px)" };

    it("reads a clean press as actuated, held and released", () => {
      const v = readbackVerdict({
        ok: true,
        events: 4,
        atRest: restKnob,
        onPress: seatedKnob,
        afterHold: seatedKnob,
        onRelease: releasedKnob,
      });
      assert.deepEqual([v.actuated, v.held, v.released, v.events], [true, true, true, 4]);
    });

    it("a pad that let go mid-hold is ACTUATED and NOT held — the brake-drop shape itself", () => {
      const v = readbackVerdict({
        ok: true,
        events: 4,
        atRest: restKnob,
        onPress: seatedKnob,
        afterHold: restKnob,
        onRelease: releasedKnob,
      });
      assert.equal(v.actuated, true);
      assert.equal(v.held, false);
      assert.match(v.why, /brake-drop shape/);
    });

    it("a pad that never seated its knob is NOT actuated, whatever was dispatched", () => {
      // The reassuring direction, refused: four events left the harness and
      // the component did not answer, which is not the same as a live pad.
      const v = readbackVerdict({
        ok: true,
        events: 4,
        atRest: restKnob,
        onPress: restKnob,
        afterHold: restKnob,
        onRelease: restKnob,
      });
      assert.equal(v.actuated, false);
      assert.equal(v.held, false);
    });

    it("a refusal keeps its sentence, and never becomes a verdict about the product", () => {
      const v = readbackVerdict({ ok: false, why: "the touch overlay is not on the page", events: 0 });
      assert.equal(v.actuated, false);
      assert.equal(v.why, "the touch overlay is not on the page");
      assert.equal(readbackVerdict(null).actuated, false);
      assert.equal(readbackVerdict(undefined).events, 0);
    });
  });

  it("§7c the emitter and the reader are ONE PAIR — the line is built, then parsed", () => {
    // §3's argument for the newest clause: nothing but this makes
    // `touchProbeLine` and `TOUCH_PROBE` agree, and a reworded clause would
    // turn every future lane's pad column into a silent null.
    for (const raw of [
      { ok: true, events: 4, onPress: { transition: "none", transform: "translateY(0.0px)" }, afterHold: { transition: "none", transform: "translateY(0.0px)" }, onRelease: { transition: "transform 140ms ease-out" } },
      { ok: true, events: 4, onPress: { transition: "", transform: "" }, afterHold: { transition: "", transform: "" }, onRelease: { transition: "" } },
      { ok: false, why: "the touch overlay is not on the page", events: 0 },
    ]) {
      const v = readbackVerdict(raw);
      const s = parseSummary(touchProbeLine(v));
      assert.equal(s.touchProbe, v.actuated ? "actuated" : "NOT actuated");
      assert.equal(s.touchProbeEvents, v.events);
      assert.equal(s.touchProbeHold, v.held ? "survived" : "did NOT survive");
      assert.equal(s.touchProbeRelease, v.released ? "clean" : "NOT observed");
    }
    assert.equal(TOUCH_PROBE.actuated.exec(WITH_PROBE)[1], "actuated");
  });
});
