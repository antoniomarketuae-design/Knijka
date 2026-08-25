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

import { DRIVE_SUMMARY_RE, INPUT_GUARDS, parseSummary } from "../lib/summary.mjs";

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
