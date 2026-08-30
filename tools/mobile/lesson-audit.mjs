/**
 * THE ONE DRIVE HARNESS THE WHOLE AUDIT ARMY USES.
 *
 * 161 scenarios x 2 platforms x 2 directions = ~644 drives. If 26 chunk agents
 * each invent their own way to enter a lesson, read a briefing and decide what
 * "credited" means, the ledger is 26 incompatible opinions. So there is one
 * script and they all call it.
 *
 * EVERY LESSON THIS FILE ENCODES WAS PAID FOR WITH A SPOILED RUN:
 *
 *  · CREDIT IS READ OFF THE DEBRIEF, NEVER THE TASK CHIP. The chip goes
 *    "2/2 -> null" when the session ends whether or not anything was ticked, so
 *    a run that credited nothing looks identical to a perfect one.
 *  · SPEED COMES FROM [aria-label^="Скорост "] AND NOTHING ELSE. Matching
 *    /км\/ч/ reads the speed-LIMIT sign and prints a plausible constant — it
 *    reported 50 км/ч for a stationary car for half a session.
 *  · THE PROBE ASSERTS 0 AT REST BEFORE IT IS BELIEVED. A speed probe that
 *    cannot read zero is not measuring the car.
 *  · NEVER LEAVE THE «ПРОЧЕТИ» SHEET OPEN. The read sheet pauses the sim by
 *    design; a driver that opens it and fails to close it photographs a frozen
 *    world and reports 0 км/ч for ninety seconds.
 *  · THE TEACH CARD IS A QUEUE, NOT A CARD. It carries a «+N» badge and was
 *    EIGHT deep on one zebra drive; a single tap looks like it failed.
 *  · NEVER /dev/drive-rig, NEVER localhost. Both 404 in production and three
 *    earlier sweeps "verified" a page no student can open.
 *  · THE BUILD IS RECORDED WITH THE RUN. A proof phase once graded a build whose
 *    fixes had never been deployed. THIS BULLET WAS PROSE ONLY UNTIL 2026-08-19
 *    — nothing in this file did it, while line 189 defaulted KNIJKA_BASE to a
 *    hardcoded staging tunnel, so an unset variable silently drove SOMEBODY
 *    ELSE'S BUILD and returned EXIT_JUDGEABLE. Measured that day: the literal
 *    URL still answers 200 and reports `"commit":"unknown"`. There is now a
 *    refusal in front of the browser (`lib/target.mjs`, exits 5 and 6).
 *  · A FRAME IS A FILE THAT DECODES, NOT A FILE THAT EXISTS. `.catch(() => {})`
 *    around a screenshot lost 333 frames and 54 whole lanes while every log
 *    stayed green — see the 2026-08-18 section below.
 *
 * ── 2026-08-16 · THE LAST FAILURE, AND WHY IT SURVIVED FOUR SELECTORS ───────
 *
 * The run reached the end of the drive and then photographed the FIRST-RUN
 * TOUCH HINT («Ляв палец — волан…») and called it the debrief. Four attempts
 * guessed a selector for it. The fifth READ THE COMPONENTS, and the reason no
 * selector could have worked is that THERE IS NO SINGLE SURFACE TO CLICK: the
 * result screen sits behind a LADDER of four surfaces with four different
 * owners, and which rungs are present depends on the device class, on a
 * persisted preference and on whether the session saved.
 *
 *   rung  owner                       what it is                     how it clears
 *   ────  ──────────────────────────  ────────────────────────────   ─────────────
 *   1     LessonScene.tsx             first-run touch hint,          a plain
 *                                     `[data-hud="touch-hint"]`,     <button>
 *                                     NOT `[data-sim-overlay]`       «Разбрах»
 *                                                                    INSIDE it
 *   2     SimOverlay.tsx (compact)    the end LINE,                  its ack chip
 *                                     `[data-sim-overlay="end"]`,    «Резултат»
 *                                     blocking                       (NOT «Разбрах»)
 *   3     LessonPlayShell (roomy)     the end BAR,                   «Виж разбора»
 *                                     `[data-hud="end-bar"]`
 *   4     CalibrationGate.tsx (I1)    «Позна ли се?» — renders       «Пропусни», or
 *                                     INSTEAD OF the debrief while   «Виж пълния
 *                                     it holds the result            резултат»
 *
 * WHY THE FLAT LOOP BROKE AT k=0 HAVING DONE NOTHING. It was
 *   page.locator('button:has-text("Разбрах"), …, [data-hud-close]').first()
 * and then `if (!isVisible()) break`. `.first()` is first in DOM ORDER across
 * the whole union, so a `[data-hud-close]` that is present-but-not-painted wins
 * the race, `isVisible()` says false, and the loop exits at once — reporting
 * nothing, because "found a control and it was invisible" was coded as "there
 * is nothing to do". A `.first()` over a union of unrelated surfaces is not a
 * selector, it is a lottery. Every rung is now addressed BY ITS OWNER'S OWN
 * HANDLE and the ladder logs which rung it took, every time.
 *
 * AND «Резултат» IS NOT «Разбрах». The compact end line's ack chip is labelled
 * «Резултат» (SimOverlay `ackLabelBg`), so a drain that only ever presses
 * «Разбрах» walks past the one control that opens the result screen — and on a
 * phone `shouldShowDebrief()` returns FALSE until that chip is pressed, so the
 * debrief does not exist in the DOM to be found.
 *
 * ── AND THE VERDICT TEST WAS CASE-SENSITIVE TEXT ────────────────────────────
 * /ИЗДЪРЖАН|НЕИЗДЪРЖАН|★|Сесията завърши/ never matched the end bar, which
 * renders «Издържан» in title case with no text-transform. The same class of
 * fault as /точк/ matching «изпитни т.» inside a teach card: a TEXT test
 * standing in for a STRUCTURE test. The end state is now decided by DOM
 * handles that only the session-end surfaces carry —
 * `[data-hud="end-screen"]`, `#sim-result-title`, `section[aria-label="Грешки"]`
 * — and the verdict is lifted out of the verdict card itself.
 *
 * ── 2026-08-18 · THE SWEEP LOST 333 FRAMES AND EVERY LOG STAYED GREEN ───────
 *
 * The 161-scenario sweep ran. Then the audit that read it filed 24 lessons
 * COULD_NOT_TEST, and the reason was not the product: it was this file.
 *
 *   MEASURED over all 166 folders of .audit-frames/sweep161, size + first and
 *   last 8 bytes of every PNG:
 *     16,605 frames written · 16,266 decode
 *        333 are 0 BYTES
 *          6 are TRUNCATED (valid signature, no IEND) at exactly 512 KiB ×5, 1 MiB ×1
 *         54 of 653 lanes hold NOT ONE usable frame; 26 are empty folders
 *
 * `shot()` was `page.screenshot({ path }).catch(() => {})`. Playwright writes
 * with `fs.promises.writeFile`, which CREATES the file before it writes the
 * bytes, so a failed write leaves a stub — and the empty catch threw the reason
 * away. sc-rx-queue-clear/mobile-right is the pair, still on disk: a run.log
 * carrying a confident
 *     [01-arrival] 0 км/ч  card=hint/peek
 * with a full nine-line control-strip readout, beside a 01-arrival.png of ZERO
 * BYTES. The log says the lesson was reached. The evidence is blank. Nothing
 * anywhere reconciled the two.
 *
 * THE CAUSE UNDER THE CAUSE was a full disk — sc-rx-unguarded/pc-wrong/run.log
 * ends on `Error: ENOSPC: no space left on device, write`, thrown out of
 * `note()` itself, an unhandled 'error' event that killed the process
 * mid-drive. The sweep then carried on for hours writing empty files, because
 * nothing was watching and nothing could stop.
 *
 * FOUR THINGS CHANGED, and they are four because fixing only the loud one
 * leaves the sweep just as blind:
 *   1. `shot()` READS THE FILE BACK (lib/frames.mjs). Signature + IEND, not
 *      `size > 0` — a size test credits all six truncated files, and half a
 *      megabyte of PNG that no reader will open is worth exactly zero bytes.
 *      One retry, then the stub is DELETED so absent evidence looks absent.
 *   2. THE LEDGER. Every lost frame is named, counted, printed in the MACHINE
 *      SUMMARY and written to `_audit-status.json`, so a judge never has to
 *      infer coverage by counting files in a folder — which is precisely how
 *      "10 zero-byte PNGs" got scored as a tested leg.
 *   3. THE BREAKER. A full disk, or three losses in a row, stops the CAMERA
 *      (not the run — the text is often the only surviving evidence, as it was
 *      for sc-sig-controller-live) and says so on its own line.
 *   4. `note()` AND THE STATUS FILE SURVIVE THE DISK. Logging can no longer
 *      kill the harness, and a lane that dies before it drives is now
 *      distinguishable from one that was never dispatched.
 *
 * ── AND THEN THE SAME SWEEP WAS RE-READ, AND THREE HOLES WERE STILL OPEN ───
 *
 * Re-measured over the 54 lanes the findings name: 206 zero-byte frames, 5
 * truncated, 18 lanes with not one usable picture — and NOT ONE of the 54
 * carrying an `_audit-status.json`, because the four fixes above landed after
 * the sweep. Reading what they would have written on those lanes found three
 * places where they would still have answered wrongly:
 *
 *   5. THE STATUS FILE LIED ABOUT LANES THAT DIED. `framesWritten` was copied
 *      into it by hand at two call sites, so every lane that never reached
 *      `complete` published "0 written, 0 lost" beside a folder of real
 *      frames — sc-sig-controller-live/mobile-right holds 5 whole PNGs and
 *      stops mid-drive. It is read off the ledger at every save now.
 *   6. A CRASH LEFT NO NOTE. sc-park-gap-short/pc-wrong's RUN.log ends on a
 *      frame line and `Node.js v24.18.0`, with `grep -c Error` == 0: the
 *      runtime's own obituary did not survive. The harness writes its own —
 *      `phase: "crashed"`, the phase it died in, the reason, the stack, and
 *      the transcript beside the frames — before the process is allowed to go.
 *   7. THE ENGINES LOADED BEFORE THE GUARD DID. A static import of
 *      `lib/pw.mjs` is evaluated before this file's first line, so a box that
 *      cannot resolve playwright died leaving nothing at all — the state the
 *      sweep could not tell apart from "never dispatched". `open()` loads them.
 *
 * The exit codes are named for the same reason (EXIT_* below): "the harness
 * died" and "some frames are missing" were both `1`, and no re-drive lane can
 * separate those out of one integer.
 *
 * ── 2026-08-28 · THE FOOTER CERTIFIED 47 PHOTOGRAPHS OF THE PAYWALL ─────────
 *
 * The line at the bottom of this file said, for three and a half minutes of
 * `.audit-frames/w14/frames/sc-sp-curve__pc-right/`:
 *
 *     EVIDENCE: complete — this lane can be judged (exit 0)
 *
 * Measured in that folder: 47 PNGs, all 257,753 bytes, all the SAME PICTURE —
 * «Шофьорският симулатор те чака · Виж пакета — 21,99 € еднократно». 113 speed
 * samples, every one −1. No gear letter ever read. `camera: null`,
 * `verdictSurface: "absent"`, `reachedVerdictCard: false`, `everSteered: false`
 * with the note «the drive has not started». `sc-fo-motorway-gap__pc-wrong` in
 * w13 is the same folder. Both had signed in — «reused a live session» — and
 * the session cache validates IDENTITY, not ENTITLEMENT, so the harness sat on
 * the upsell page and photographed it.
 *
 * WHAT IT COST. `wave-c-merge.mjs` refuses to certify a non-zero exit
 * (lines 250, 281), so this one boolean was the ONLY thing standing between a
 * dead lane and a judge — and it was
 *
 *     const exit = frames.lost || stdoutBroken ? EXIT_EVIDENCE_INCOMPLETE : EXIT_JUDGEABLE;
 *
 * which asks whether the FRAMES and the LOG survived and never whether the
 * DRIVE HAPPENED, while the definition four lines above it read «the drive
 * happened and every frame it claims exists». The code contradicted its own
 * comment, and it did so in the reassuring direction: judges were handed
 * folders whose own log told them to adjudicate a paywall. Every finding filed
 * off one of those lanes is a finding about a page no student ever drives.
 *
 * THE HARD PART IS NOT DETECTING IT — it is not sweeping up two shapes that
 * look similar and are not:
 *
 *   · A DRIVE THAT RAN ITS WHOLE BUDGET AND NEVER REACHED A VERDICT CARD is a
 *     REAL PRODUCT OUTCOME — the lesson never ends. sc-ln-decisive-change and
 *     sc-ov-crest-curve did 43 and 42 км/ч, tracked the line, stayed in D, and
 *     mounted no result screen. Those must stay judgeable and they do: their
 *     cockpit answered.
 *   · A LESSON THIS HARNESS CANNOT PHYSICALLY DRIVE. **RESOLVED 2026-08-29 —
 *     the three keys were added; see "PUT A MANUAL CAR IN GEAR" below. The
 *     paragraph that follows is kept because exit 8 still EXISTS and still means
 *     what it says; what changed is that sc-vp-stall is no longer an example of
 *     it. A lane that reports 8 today is reporting that the engage FAILED.**
 *     sc-vp-stall starts in N
 *     with a manual box and this file's entire key vocabulary is
 *     W/S/A/D/B/Escape — no clutch, no selector key («[ ]  скорости: към P /
 *     към D» is in the product's own legend and not in this harness). Its top
 *     speed of 0 км/ч is HONEST, and «re-drive this lane» would be the same
 *     lie pointing the other way, because a re-drive reproduces it exactly.
 *     That lane gets its own code (8) whose whole content is DO NOT RE-DRIVE.
 *
 * So the drive is now classified from the ledger's own instruments —
 * `classifyDrive` in tools/audit/verdict-surface.mjs, the same function the
 * judge side runs, so this file's exit code and the judge's verdict cannot
 * drift. It condemns only on POSITIVE evidence: two or more cockpit
 * instruments present and every one of them silent. A ledger that never looked
 * is never called dead.
 *
 * NOTHING HERE IS TUNED TO A LESSON. Every handle above is written by
 * LessonScene / SimOverlay / LessonPlayShell / SessionEndScreen for all 161
 * scenarios; there is not one scenario id, objective id or Bulgarian lesson
 * string anywhere in this file.
 *
 * Usage:
 *   node tools/mobile/lesson-audit.mjs <outDir> <scenarioId> <mobile|pc> <right|wrong>
 *
 * EXIT CODE IS ABOUT EVIDENCE, NOT ABOUT THE LESSON. 0 = this run can be
 * judged. Non-zero = it cannot:
 *   0 judgeable · 1 frames/log lost · 2 never dispatched (bad usage)
 *   3 sign-in refused · 4 the harness crashed (`why` is in the status file)
 *   5 no KNIJKA_BASE — never dispatched, no directory, like 2
 *   6 the target cannot be identified (down, unstamped, or a different build)
 *   7 THE DRIVE NEVER STARTED — no cockpit instrument ever answered; these
 *     frames are not of a driving lesson.                        RE-DRIVE.
 *   8 THIS HARNESS CANNOT PERFORM THIS LESSON — the cockpit was live and the
 *     car was never in a driving gear.   DO NOT RE-DRIVE; fix the harness.
 * RE-DRIVING IS NOT THE ANSWER TO ALL OF THEM, and 8 is why that sentence no
 * longer says it is: on 8 a re-drive reproduces the same non-drive forever.
 * A lesson that fails its own drive still exits 0: that is a finding, not a
 * broken run, and conflating the two is how a re-drive lane wastes a day.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ── THE ENGINES ARE LOADED IN open(), NOT HERE ─────────────────────────────
// A static `import … from "./lib/pw.mjs"` is evaluated before the FIRST LINE of
// this file's body — before `mkdirSync(OUT)`, before `_audit-status.json`,
// before the crash guard below exists. So on a box where playwright cannot be
// resolved, or where `E:\ms-playwright` has no browsers, this harness died
// leaving a lane byte-for-byte identical to one that was never dispatched, and
// that is precisely the confusion sc-crossing-bus-shadow and
// sc-crossing-child-ball were filed under ("the harness created the output tree
// and then died before it opened a browser" vs sc-crossing-let-pass, which was
// never dispatched at all). pw.mjs is ~500 MB of playwright behind a top-level
// await; deferring it by four lines costs nothing measurable and moves every
// way it can fail INSIDE the guard, where it is recorded.
import { newDeviceContext } from "./lib/insets.mjs";
import { DEVICES } from "./lib/devices.mjs";
import { signIn } from "./lib/auth.mjs";
import { captureFrame, createFrameLedger } from "./lib/frames.mjs";
// The steering control law and its record. Pure — no browser — so every clause
// of it is exercised by __tests__/guidance.test.mjs without a sim; the page
// side of it lives in `guideTick` below.
import { decodePng } from "./lib/png.mjs";
import { aimFrom, degPerPxAtCentre, scanBand, steerCommand, summariseTracking, TUNE } from "./lib/guidance.mjs";
// Cheap by design — node:child_process and node:crypto, no browser — so unlike
// pw.mjs it can be imported up here where `resolveBase()` needs it, which is
// before the output directory exists.
import { attestTarget, describeTarget, resolveBase, treeIdentity } from "./lib/target.mjs";
// DID THE DRIVE HAPPEN — the same ladder the judge side runs, imported rather
// than re-implemented. Pure (node:fs + node:path, no top-level work), so it is
// as safe up here as target.mjs; the reason it lives in tools/audit is that
// tools/audit/verdict-surface.mjs is where "one ladder, two consumers, no
// drift" is already the stated contract, and this harness's exit code and
// `classifyLeg`'s verdict about the same folder MUST be the same sentence.
import { classifyDrive, DRIVE_CLASSES } from "../audit/verdict-surface.mjs";

/** The tree whose build this run must be measuring. Derived from this file's
 *  own location, never from cwd: the sweep invokes lanes from platform/, from
 *  the repo root and from a scratch directory, and a cwd-relative answer would
 *  make the build stamp depend on who called. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const [OUT, SCENARIO, PLATFORM = "mobile", MODE = "right"] = process.argv.slice(2);

// ── WHAT EACH EXIT CODE MEANS, IN ONE PLACE ────────────────────────────────
//
// Named because the sweep already lost a distinction it needed: a run that
// CRASHED and a run whose evidence is merely incomplete both left `1` behind,
// and a re-drive lane cannot tell "this lane needs the harness fixed" from
// "this lane needs photographing again" out of one integer. Every one of these
// is about EVIDENCE, never about whether the student passed — see the note at
// the bottom of the file.
const EXIT_JUDGEABLE = 0; //  the drive happened and every frame it claims exists
const EXIT_EVIDENCE_INCOMPLETE = 1; //  it drove, but frames and/or the log were lost
const EXIT_USAGE = 2; //  nothing was dispatched; no output directory was even made
const EXIT_SIGNIN_REFUSED = 3; //  the lane never reached the lesson
const EXIT_CRASHED = 4; //  the harness itself died — see `phase`/`why` in the status file
const EXIT_TARGET_UNSET = 5; //  KNIJKA_BASE was not set — nothing was dispatched, as with 2
const EXIT_TARGET_UNVERIFIED = 6; //  a target was named and it cannot say which build it is
// ── AND THE TWO THAT ANSWER "DID THE DRIVE HAPPEN?" ────────────────────────
//
// The NUMBERS are not written here. They come from `DRIVE_CLASSES`, which the
// judge side reads too, because the last time a fact about a lane lived in two
// files with two spellings the two spellings disagreed for a whole wave. This
// block still NAMES them, which is what "in one place" was ever for.
const EXIT_DRIVE_NEVER_STARTED = DRIVE_CLASSES["never-started"].exit; // 7 · no cockpit answered — RE-DRIVE
const EXIT_LESSON_NOT_PERFORMABLE = DRIVE_CLASSES["not-performable"].exit; // 8 · never in gear — DO NOT re-drive

// A missing argument used to produce frames at `undefined/01-arrival.png` and a
// run that looked like every other. Refuse before the browser costs anything —
// and before `mkdirSync`, so a mis-dispatched lane leaves NO directory at all
// and can never be mistaken for one that ran.
if (!OUT || !SCENARIO) {
  console.error(
    "[lesson-audit] usage: node tools/mobile/lesson-audit.mjs <outDir> <scenarioId> [mobile|pc] [right|wrong]",
  );
  process.exit(EXIT_USAGE);
}

// ── AND A MISSING TARGET IS A MISSING ARGUMENT, NOT A DEFAULT ──────────────
//
// This line used to be
//     export const BASE = process.env.KNIJKA_BASE ?? "https://<a tunnel>.trycloudflare.com";
// and that `??` is the single worst line this harness has ever contained. An
// unset variable did not error: it silently pointed 644 drives at STAGING, over
// a quick-tunnel hostname baked into source, and returned EXIT_JUDGEABLE with
// real frames and a real verdict for a build nobody had asked about. MEASURED
// 2026-08-19, that literal URL still answers — 200 in 961 ms — reporting
// `"commit":"unknown"`, so it is a live trap rather than a dead one.
//
// It refuses HERE, in the same place and for the same reason as a missing
// argument: before `mkdirSync`, so a lane dispatched without a target leaves NO
// directory and cannot be mistaken for one that ran. lib/target.mjs carries the
// measurement and the two ways to set it.
let BASE_RESOLVED;
try {
  BASE_RESOLVED = resolveBase();
} catch (error) {
  console.error(`[lesson-audit] ${error.message}`);
  process.exit(EXIT_TARGET_UNSET);
}
export const BASE = BASE_RESOLVED;

mkdirSync(OUT, { recursive: true });

const log = [];
/**
 * …AND LOGGING CANNOT BE ALLOWED TO KILL THE RUN.
 *
 * sc-rx-unguarded/pc-wrong died here, mid-drive, at this exact function:
 *   Error: ENOSPC: no space left on device, write
 *     at console.log … at note (lesson-audit.mjs:97:44)
 * When stdout is a redirected file (`> run.log`, which is how every lane in the
 * sweep is invoked) Node backs it with a SyncWriteStream, and a write error
 * there is an unhandled 'error' event — i.e. process death, with the drive
 * abandoned and no summary. The harness has to be able to outlive its own log:
 * the in-memory `log` array keeps the transcript, `stdoutBroken` records that
 * the file on disk is short, the status file says so where a reader will find
 * it, and the end of the run tries once to save the transcript beside the
 * frames as `_audit-transcript.log`. All three are best-effort by construction
 * — they share the disk that just failed — but a run that keeps driving with a
 * broken log still beats one that dies at t060s with no summary at all.
 */
let stdoutBroken = null;
process.stdout.on("error", (error) => { stdoutBroken ??= String(error?.code ?? error?.message ?? error); });
// AND THE SAME GUARD ON THE OTHER STREAM, because the cause was never "stdout"
// — it was "an unhandled 'error' event on a write stream ends the process", and
// only one of the two streams had been immunised. Every lane is invoked
// `> run.log 2>&1`, so fd 2 is backed by the same SyncWriteStream on the same
// disk that filled; playwright writes its own warnings there, and one of those
// hitting ENOSPC would kill the drive exactly the way `note()` did. The field
// keeps the name `stdoutBroken` because it is already the key readers look for
// in `_audit-status.json` and in the MACHINE SUMMARY; the stream is named in
// the value instead.
process.stderr.on("error", (error) => { stdoutBroken ??= `${String(error?.code ?? error?.message ?? error)} (stderr)`; });
const note = (s) => {
  log.push(s);
  try {
    console.log(s);
  } catch (error) {
    stdoutBroken ??= String(error?.code ?? error?.message ?? error);
  }
};
/** Every failure this harness can have prints a line that starts like this. A
 *  run that cannot answer its own question must never look like a quiet pass. */
const loud = (s) => note(`  !! ${s}`);

// ── THE PER-LANE STATUS FILE ───────────────────────────────────────────────
//
// THE FINDING IT CLOSES, in the audit's own words: *"the capture wrote empty
// files rather than failing, so a re-drive lane that only checks for file
// existence would score this leg as tested."* Counting files in a folder is not
// a measure of coverage, and four separate lessons were mis-scored by it.
//
// It also separates three states that a bare directory listing renders
// identical, and which the sweep confused: sc-crossing-bus-shadow's four EMPTY
// FOLDERS ("the harness created the output tree and then died before it opened
// a browser") read the same as sc-crossing-let-pass, which was NEVER DISPATCHED
// at all. Now:
//   no _audit-status.json          -> this lane was never dispatched
//   phase !== "complete"           -> the harness started and died; `phase` says where
//   complete + framesLost > 0      -> it ran, and this much of the evidence is missing
// Written FIRST, before sign-in, and rewritten at every phase change, because a
// status file that only appears on success answers nothing about the failures.
const STATUS = `${OUT}/_audit-status.json`;
const status = {
  scenario: SCENARIO, platform: PLATFORM, mode: MODE,
  startedAt: new Date().toISOString(),
  phase: "starting",
  framesWritten: 0, framesLost: 0, lostFrames: [],
  cameraStopped: null, stdoutBroken: null, ended: null, verdict: null, exit: null,
};

// ── THE LEDGER IS MIRRORED HERE, NOT COPIED IN BY HAND ─────────────────────
//
// It WAS copied by hand, at two call sites out of ten, and the hole that left
// is the same false pass this file exists to end: `framesWritten` was only ever
// filled in on a lost frame and at `phase: "complete"`, so EVERY lane that died
// mid-drive published `framesWritten: 0, framesLost: 0, lostFrames: []` —
// beside a folder holding good frames. sc-sig-controller-live/mobile-right is
// that lane exactly: measured on disk it holds 5 whole PNGs, 20 empty ones and
// 4 truncated at 512 KiB/1 MiB, and it never reaches `complete` (its run.log
// has no MACHINE SUMMARY). A status file that answered "0 written, 0 lost"
// there would be a confident lie about all 29, and a reader who caught it would
// go straight back to counting files in the folder — the original crime.
//
// So the ledger is read at EVERY save instead. `frames` starts as a standing
// zero and is re-pointed at the real ledger's state object once the camera is
// built below (the camera needs `loud`, which needs `note`, which needs this
// block); `patch` still wins, so a caller can override, but nobody has to
// remember to.
let frames = { written: 0, lost: 0, names: [], cameraStopped: null };
// AND WHAT EACH SURVIVING FRAME WEIGHED. sc-sig-controller-live and
// sc-signal-controller lost four frames each to a truncation that happened
// AFTER the drive — every file in both folders carries one identical mtime, so
// the corruption was in the copy into `.audit-frames`, not in the capture. This
// harness cannot police a copy step it does not own, but it is the only witness
// to what it actually wrote, so it says: 02-briefing.png was 1,203,441 bytes.
// A copy that hands a reader 524,288 is then provably corrupt rather than
// arguably unlucky. One `statSync` per frame, against a screenshot measured at
// 200 ms (mobile) and 11,999 ms (pc).
const framesOnDisk = [];
const saveStatus = (patch = {}) => {
  Object.assign(
    status,
    {
      framesWritten: frames.written,
      framesLost: frames.lost,
      lostFrames: frames.names,
      cameraStopped: frames.cameraStopped,
      frames: framesOnDisk,
    },
    patch,
    { stdoutBroken, updatedAt: new Date().toISOString() },
  );
  // The status file is the LAST thing that may fail silently — but it lives on
  // the same disk that was full, so it cannot be allowed to throw either.
  try { writeFileSync(STATUS, `${JSON.stringify(status, null, 2)}\n`); } catch { /* the disk is gone; the log tail is all there is */ }
};
saveStatus();

// ── THE DEATH THAT LEFT NO NOTE ────────────────────────────────────────────
//
// `.audit-frames/sweep161/sc-park-gap-short/pc-wrong/RUN.log` is the artifact
// this block is written against. Measured: 57 PNGs, of which 54 are 0 bytes and
// one is truncated at 524,288; the log's last two lines are
//     [04-t130s] 49 км/ч  card=-/-
//     Node.js v24.18.0
// and `grep -c Error` over the whole file returns ZERO. Node's fatal report
// goes to stderr and did not survive whatever killed the process, so the only
// thing on disk saying the run died at all is the version banner at the end of
// somebody else's message. The audit read it and wrote "the node process then
// died outright at t130s with no error text in RUN.log … nothing in the log
// says why."
//
// A harness cannot rely on the runtime's own obituary. It writes its own, into
// a few hundred bytes of JSON it controls, before the process is allowed to go:
//
//   phase: "crashed"   — not "driving", which a reader would take for a lane
//                        still in flight, and not "complete", ever
//   diedDuring         — the phase it was in, so "died before it opened a
//                        browser" and "died at t130s of the drive" are two
//                        different rows and not one shrug
//   why                — the message AND the top frames of the stack
//   _audit-transcript.log — because `process.exit()` truncates a piped stdout,
//                        and on this harness stdout IS the evidence
//
// A LATE FAILURE AFTER A GOOD RUN IS NOT A CRASH. Playwright can reject a
// dangling promise while the process is winding down; overwriting a `complete`
// status with `crashed` there would throw away a verdict that was correctly
// captured and send a re-drive after a lane that is fine. A false failure and a
// false pass are the same crime, so the guard checks and stands down.
let dying = false;
const die = (kind, error) => {
  const why = String(error?.stack ?? error?.message ?? error)
    .split("\n")
    .map((l) => l.trim())
    // Playwright's "run npx playwright install" advice arrives as a six-line
    // box; a reason that is four fifths ║ is not a reason. Borders out, words
    // and stack frames in.
    .filter((l) => l && !/^[╔╗╚╝║═│┌┐└┘─\s]*$/.test(l))
    .slice(0, 5)
    .join(" ⏎ ");
  if (status.phase === "complete") {
    note(`  (a late ${kind} AFTER the run had finished, ignored: ${why})`);
    return;
  }
  if (dying) return; // a second failure while handling the first must not loop
  dying = true;
  const diedDuring = status.phase;
  loud(`THE HARNESS DIED (${kind}) DURING «${diedDuring}» — ${why}`);
  loud(`this lane produced no verdict of its own; RE-DRIVE it. Nothing below is a finding about the lesson.`);
  saveStatus({ phase: "crashed", diedDuring, kind, why, exit: EXIT_CRASHED });
  try { writeFileSync(`${OUT}/_audit-transcript.log`, `${log.join("\n")}\n`); } catch { /* the disk really is gone */ }
  process.exit(EXIT_CRASHED);
};
process.on("uncaughtException", (error) => die("uncaughtException", error));
process.on("unhandledRejection", (error) => die("unhandledRejection", error));

async function open() {
  // Deferred on purpose — see the note on the imports. Node caches the module,
  // so the two branches below share one load.
  const { webkit, chromium } = await import("./lib/pw.mjs");
  if (PLATFORM === "pc") {
    // ── THE PC LEG RUNS ON THE REAL GPU, AND IT HAD TO ─────────────────────
    //
    // Headless Chromium defaults to ANGLE-over-SwiftShader here — software
    // rasterisation. Measured on this box that made one control-law tick cost
    // 3.3 SECONDS (46 ms on the mobile leg), so the identical `right` drive
    // produced ИЗДЪРЖАН/0 точки, НЕИЗДЪРЖАН/20 точки AND a collision across
    // three runs. That is not a slow rig, it is an UNMEASURABLE one — and a
    // 322-drive PC sweep on it would have been 322 rows of noise in the shape
    // of data.
    //
    // `--use-angle=d3d11` binds ANGLE to Direct3D11 and the real adapter,
    // verified by reading UNMASKED_RENDERER_WEBGL:
    //   before  ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)) …
    //   after   ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB … Direct3D11 …
    // `--use-gl=desktop` was tried too and fell straight back to SwiftShader,
    // so this specific flag is the one that matters.
    const b = await chromium.launch({
      headless: true,
      args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
    });
    // ── deviceScaleFactor 1, AND THE HONEST VERSION OF WHY ─────────────────
    //
    // It was 2 (a 2880 × 1800 backing store under headless Chromium's SOFTWARE
    // WebGL) and I changed it on the hypothesis that the pixels were what made
    // a `pc` control-law tick cost 18 s. THE MEASUREMENT REFUTED THAT: at DPR 1
    // the tick was still 17.8 s median, and the real culprit turned out to be
    // `page.screenshot()` at 12 s a frame (see lastShotCostMs). The hypothesis
    // was wrong and this comment says so rather than quietly taking credit.
    //
    // DPR 1 stays for the reason that survives the refutation: this leg exists
    // to exercise the ROOMY UI and the grading, not pixel density —
    // `tools/mobile/dpr-cost.mjs` is the probe that owns DPR — and a quarter of
    // the pixels is a quarter of the software rasteriser's bill on a box that
    // is chronically short of both. Override with KNIJKA_PC_DPR when a row
    // really is about pixels.
    const dpr = Number(process.env.KNIJKA_PC_DPR || 1);
    // The notch rule in insets.test.mjs exists so a probe never measures a phone
    // without its cutout. This leg is not a phone — it is the 1440×900 DESKTOP
    // that exercises the ROOMY UI — and handing safe-area insets to it would be
    // the same error pointing the other way. The `mobile` leg below IS a phone
    // and does go through newDeviceContext, so the rule still binds where it
    // means anything.
    // insets-exempt: the pc leg is a 1440×900 desktop, which has no safe areas.
    const b2 = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr });
    return { browser: b, context: b2 };
  }
  const b = await webkit.launch({ headless: true });
  const { context } = await newDeviceContext(b, DEVICES["iphone16-landscape"], { motion: "allow" });
  return { browser: b, context };
}

// ── WHAT AM I MEASURING? ASKED BEFORE A BROWSER COSTS ANYTHING ─────────────
//
// THE HEADER OF THIS FILE HAS CLAIMED «THE BUILD IS RECORDED WITH THE RUN»
// SINCE IT WAS WRITTEN, and until 2026-08-19 no code did it. That is the same
// shape as every other defect in here — a property asserted in prose by the
// person who most wanted it to be true — and it is the shape the refuter that
// opened this lane went looking for.
//
// The probe is cheap (one GET) and it runs BEFORE `open()`, which loads ~500 MB
// of playwright: a whole sweep pointed at the wrong host now dies in a second
// per lane instead of after a browser, a sign-in and a drive. It doubles as the
// warm-up — the first GET compiles `proxy` and the route, which was MEASURED at
// 258.8 s on a cold `next dev` here, and paying that outside the drive is
// strictly better than paying it inside one.
//
// IT REFUSES ON FOUR STATES AND CREDITS ONE. Unreachable, unstamped
// (`commit: "unknown"` — what the live tunnel answers today), mismatched, and
// "there is nothing to check it against" all exit EXIT_TARGET_UNVERIFIED. Only
// a server that NAMES a build equal to the one under test is driven.
//
// Unlike the missing-argument refusals above, this one DOES leave a directory
// and a status file. It has to: "this lane refused because the target could not
// name its build" is a fact a re-drive queue must be able to read off the disk,
// and an empty folder means «never dispatched» in this sweep's vocabulary.
saveStatus({ phase: "identifying-target" });
const tree = treeIdentity(REPO_ROOT);
const target = await attestTarget({ base: BASE, tree, note });
note(`TARGET: ${describeTarget(target)}`);
if (target.dirty) {
  // Not a refusal. A fix lane's entire job is to drive an uncommitted fix, and
  // refusing a dirty tree would be a false failure aimed at exactly the work
  // this harness exists to verify. It is SAID OUT LOUD instead, because "HEAD
  // c72bcc2" alone would be a half-truth about what these pixels photographed.
  note(
    `  the tree is NOT clean — ${target.dirtyCount} path(s) differ from HEAD, so these frames photographed ` +
      `HEAD ${String(target.head).slice(0, 12)} PLUS worktree ${target.worktree}: ${target.dirtyPaths.join(", ")}`,
  );
}
if (!target.attested) {
  loud(`THIS RUN CANNOT SAY WHAT IT WOULD BE PHOTOGRAPHING (${target.kind}) — ${target.why}`);
  loud(`nothing was driven. Any finding attributed to this lane would be about an unknown build.`);
  saveStatus({ phase: "target-unverified", target, why: target.why, exit: EXIT_TARGET_UNVERIFIED });
  try { writeFileSync(`${OUT}/_audit-transcript.log`, `${log.join("\n")}\n`); } catch { /* the disk is gone */ }
  process.exit(EXIT_TARGET_UNVERIFIED);
}
saveStatus({ phase: "target-attested", target });

const { browser, context } = await open();
const page = await context.newPage();

// ── WHERE THE HARNESS'S OWN TIME GOES ──────────────────────────────────────
// Not decoration. A `pc` drive was measured at 18 s per control-law tick while
// every constituent call timed 1-100 ms in isolation, and no amount of reading
// the loop found it — the breakdown did. It stays because the next sweep will
// run on a box under a different load and "the lesson credits nothing" and "the
// harness got four ticks" are the same log line unless this is printed.
const cost = {};
const timed = async (label, fn) => {
  const s = Date.now();
  try {
    return await fn();
  } finally {
    (cost[label] ??= []).push(Date.now() - s);
  }
};
const costLine = () =>
  Object.entries(cost)
    .map(([k, v]) => {
      const s = [...v].sort((a, b) => a - b);
      return `${k} ×${v.length} med ${s[Math.floor(s.length / 2)]}ms max ${s[s.length - 1]}ms`;
    })
    .join(" · ");

// ── THE CAMERA, AND THE PROOF THAT IT FIRED ────────────────────────────────
//
// This was `page.screenshot({ path }).catch(() => {})` and it cost the sweep
// 333 frames and 54 lanes (see the 2026-08-18 note in the banner). Three
// properties replace the empty catch, and each answers a specific casualty:
//
//   IT READS THE FILE BACK — lib/frames.mjs checks the PNG signature and the
//   IEND marker, because `size > 0` credits all six of the truncated frames and
//   a half-written PNG is worth exactly as much as an empty one.
//
//   IT NAMES WHAT IT LOST — into the log AND into the ledger below, so nobody
//   ever has to infer coverage by counting files again.
//
//   IT STOPS. Three losses in a row, or one ENOSPC, and the camera is switched
//   off. NOT the run: sc-sig-controller-live's verdict survived only in its
//   run.log after 24 of its 29 frames died, so the TEXT is often the last
//   evidence standing and must keep being written. What stops is the pretence
//   that frames are being taken — and, on the pc leg where a frame costs 12 s,
//   that also stops the harness spending a fifth of the drive photographing
//   nothing.
//
// The POLICY (verify, retry once, delete the stub, count, stop) lives in
// lib/frames.mjs so it can be tested without a browser — frames.test.mjs is
// where each clause of the paragraph above is pinned to the casualty that
// bought it. This is the adapter: it supplies the timing hook and mirrors the
// ledger into the status file after every loss.
const ledger = createFrameLedger({
  loud,
  capture: (target, path, opts) => timed("screenshot", () => captureFrame(target, path, opts)),
});
// Re-point the standing zero declared above at the real ledger. From here every
// `saveStatus()` — including the one the crash guard writes — publishes what
// the camera has actually got, rather than what somebody remembered to copy.
frames = ledger.state;

const shot = async (n) => {
  const ok = await ledger.shoot(page, `${OUT}/${n}.png`, n);
  if (ok) {
    // The weight of the frame AS THIS PROCESS LEFT IT — the only number that
    // can later convict a truncated copy. `captureFrame` has already stat'd it
    // to prove the IEND, but the ledger returns a boolean, so read it again
    // rather than reach into another module's shape.
    let bytes = null;
    try { bytes = statSync(`${OUT}/${n}.png`).size; } catch { /* it decoded a moment ago; if it is gone now the ledger is the wrong place to shout */ }
    framesOnDisk.push({ name: n, bytes });
  }
  // EVERY frame, not only the lost ones. A lane that dies at t130s has to leave
  // a true count behind it, and the count is only true if it was written down
  // before the death. One ~2-8 KB rewrite against a 200 ms (mobile) to 12 s
  // (pc) screenshot.
  saveStatus();
  return ok;
};

// ── the reading surface ────────────────────────────────────────────────────
const read = () =>
  page.evaluate(() => {
    const norm = (s) => (s || "").trim().replace(/\s+/g, " ");
    const sp = document.querySelector('[aria-label^="Скорост "]');
    const card = document.querySelector("[data-sim-overlay]");
    // ── ONE LAYOUT FLUSH, NOT N — AND THAT IS NOT A MICRO-OPTIMISATION ──────
    //
    // This scan used to call `innerText` AND `getBoundingClientRect` on every
    // matched element, interleaved. `innerText` forces a style+layout flush,
    // the HUD mutates on every animation frame, so each of the ~600 matches on
    // the `pc` page (nav rail, the 20-row keyboard-shortcut list, the
    // demonstration deck, the toolbar) paid for its own reflow against a live
    // WebGL canvas.
    //
    // MEASURED, because it did not look like a performance problem — it looked
    // like a broken lesson. On sc-zebra-approach/pc a control-law tick cost a
    // median of 17.7 s and a worst of 30.7 s, so the drive got SIX ticks in a
    // 210 s budget, never braked once, and produced «Непропускане на пешеходец»
    // with 0 full stops: a harness artefact that would have been filed as "PC
    // does not credit the zebra". (A standalone probe put `evaluate` itself at
    // 3 ms, which is what ruled out the browser and the pixel count.)
    //
    // `textContent` reads no layout at all, and the rect already answers "is it
    // on the glass". The scan is also scoped to the play shell: the nav rail is
    // not the HUD and never was.
    //
    // ── AND WHAT IT DROPS IS NOW SAID OUT LOUD — 2026-08-21 ──────────────────
    //
    // THE CLAIM THAT SENT ME HERE, and it does not survive the measurement.
    // A verifier reported that this `>4px` test blinds the census — that
    // `[data-hud="objective-banner"]` is „0 × 0 while painting a legible task
    // title", so the banner is missing from every log line this harness has
    // ever written. MEASURED on the live rig 2026-08-21 (WebKit,
    // iphone16-landscape, sc-junction-scan@L1, dev server 4611160afb1e), six
    // samples across one drive, each one comparing THREE tests — the rect, an
    // ancestor-chain walk for display/visibility/opacity, and the browser's own
    // `Element.checkVisibility()`:
    //
    //   div[data-hud="objective-banner"]  0×0  rect=drop  chain=drop  checkVis=false
    //   div[data-hud="notify-column"]     0×0  rect=drop  chain=drop  checkVis=false
    //   [role=status] «Съветник»          0×0  rect=drop  chain=drop  checkVis=false
    //   span[data-hud="speed-block"]      0×0  rect=drop  chain=drop  checkVis=false
    //   div[data-hud="status-dashboard"] 325×24 all three KEEP
    //
    // All three agree, on every element, in every sample. And the frames say
    // the same thing: `census2-4.png` has no task banner on the glass at all —
    // the notify column is showing a fault card, and the «D 15 км/ч» a reader
    // sees is the 3D CLUSTER inside the WebGL canvas, not this DOM readout
    // (`PlayAreaStyles`: `html[data-sim-camera="cockpit"] [data-hud="speed-
    // block"]` folds the DOM copy away precisely because the cabin already
    // shows it). So the filter is not hiding a painted banner. The banner is
    // NOT PAINTED, on the phone, in the cockpit camera, for most of a drive.
    //
    // WHICH IS THE MORE INTERESTING ANSWER, and the one this file was not
    // giving: „the objective banner is in the DOM and is not on the glass" is a
    // statement about the PRODUCT that no drive has ever recorded, and it was
    // indistinguishable from „the harness did not look". A `continue` is a
    // silence, and every instrument bug in this programme has hidden in one. So
    // the drop is COUNTED and NAMED from here on: `strings` is what a reader of
    // the frame can see, `unpainted` is what the DOM holds and the picture does
    // not, and the two are printed on separate lines.
    //
    // The test itself moves off the bare rect and onto the ancestor chain,
    // which is the reason rather than a proxy for it: a `display: contents`
    // wrapper and a baseline-aligned inline box both report a degenerate rect
    // while painting, and the census must not start lying the day one appears.
    const root = document.querySelector("[data-sim-shell]") ?? document.body;
    const painted = (el) => {
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
        if (cs.contentVisibility === "hidden") return false;
      }
      // …and it must occupy the glass somewhere. `getClientRects()` is the
      // second question, not a repeat of the first: an inline box that reports
      // an empty BORDER box still returns its line boxes here.
      const r = el.getBoundingClientRect();
      if (r.width >= 1 && r.height >= 1) return true;
      for (const q of el.getClientRects()) if (q.width >= 1 && q.height >= 1) return true;
      return false;
    };
    const seen = new Set(), strings = [], unpainted = [];
    // ── A HANDLE IS NOT AN INSTANCE, AND THE COUNTS ARE NOT DECORATION ──────
    //
    // MEASURED on the live rig 2026-08-21 (WebKit, iphone16-landscape,
    // sc-junction-scan@L1), same drive as the note above, second adversarial
    // pass. The phone renders TWO `[data-hud="notify-column"]` elements:
    //
    //   div[notify-column] display:none  0×0        ← holds the objective
    //                                                 banner and the advisor
    //   div[notify-column] display:flex  180×95.8   ← «ИНСТРУКЦИИ …», ON SCREEN
    //
    // The line below said «✗ NOT ON THE GLASS — notify-column: …» while a
    // second element carrying that exact handle was painted and in `strings`
    // one line above it. A handle-level sentence about an instance-level fact,
    // which is a false general claim in the direction that invents a product
    // defect — the mirror of the drop it was written to end.
    //
    // AND THE SILENCE WAS ONLY MOVED, NOT ENDED. The same sample: 28 elements
    // failed `painted`, 8 carried a `data-hud` and were named, and TWENTY had
    // no handle and were dropped exactly as before — among them the ADVISOR
    // CARD, `[role=status][aria-label="Съветник — следващо действие"]`, which
    // is one of the two surfaces REVERSE_DEMAND_SEL reads. So the totals now
    // travel with the list: a reader who is told "8" and not "28" is being
    // told the census saw eight things, and it saw twenty-eight.
    let unpaintedTotal = 0, unpaintedUnnamed = 0, unpaintedOverCap = 0;
    for (const el of root.querySelectorAll(
      "[data-hud],[role=alertdialog],[role=dialog],[role=status],h1,h2,h3,li,button,p",
    )) {
      const t = norm(el.textContent);
      if (!t || t.length < 2 || seen.has(t)) continue;
      if (!painted(el)) {
        unpaintedTotal += 1;
        // Only NAMED surfaces are worth a line — an unpainted `<p>` inside an
        // unpainted card would print the same fact three times, and a reader
        // who is told everything is told nothing. The ones dropped for want of
        // a handle are COUNTED, because "not worth a line" and "not seen" were
        // the same silence until this counter existed.
        const hud = el.getAttribute("data-hud");
        if (!hud) { unpaintedUnnamed += 1; continue; }
        if (unpainted.length >= 8) { unpaintedOverCap += 1; continue; }
        // The twin check is scoped to handles that are safe to interpolate —
        // a `data-hud` value is authored, never user text, but a selector built
        // from a string is a selector that can throw, and this runs at 2 Hz.
        let twins = [el];
        if (/^[A-Za-z0-9_-]+$/.test(hud)) twins = [...root.querySelectorAll(`[data-hud="${hud}"]`)];
        const litTwin = twins.some((q) => q !== el && painted(q));
        unpainted.push(
          `${hud}${twins.length > 1 ? ` (${twins.length} elements carry this handle; ${litTwin ? "ANOTHER ONE IS PAINTED — this is about THIS copy, not the surface" : "none of them is painted"})` : ""}: ${t.slice(0, 80)}`,
        );
        continue;
      }
      seen.add(t);
      strings.push(t.slice(0, 200));
      if (strings.length >= 26) break;
    }
    return {
      kmh: sp ? Number((sp.getAttribute("aria-label").match(/Скорост (\d+)/) || [0, -1])[1]) : -1,
      // THE SELECTOR, ON EVERY NAMED FRAME. The dial cannot see direction —
      // `displaySpeedKmh` is `Math.round(Math.abs(v))`, so a car reversing at
      // 6 км/ч and a car creeping forward at 6 км/ч print the same number. The
      // letter is the only thing on the glass that tells them apart, and for
      // 376 drives no beat recorded it.
      gear: [...(document.querySelector("[data-sim-shell]") ?? document.body)
        .querySelectorAll('[aria-label^="Скоростен лост: "]')]
        // NO VISIBILITY TEST AT ALL, and the reason is the opposite of the one
        // that was written here first. This element is NOT „painted while
        // reporting 0 × 0": measured 2026-08-21 it is 0 × 0 AND not painted AND
        // not laid out, on every sample of a phone drive, because
        // `PlayAreaStyles` folds `[data-hud="speed-block"]` away whenever the
        // cockpit camera is live — the cabin's own 3D cluster is showing the
        // letter instead, inside the canvas, where no selector can reach it.
        // The ATTRIBUTE is still minted from `snap.gearLabel`, i.e. from
        // `driveline.selector`, so it remains the driveline's truth; a
        // visibility test here would answer „this car has no gear" about a car
        // whose gear is legible in the photograph. Read the label, never the box.
        .map((el) => el.getAttribute("aria-label").replace(/^Скоростен лост:\s*/, "").trim())
        .filter((v, i, a) => v && a.indexOf(v) === i),
      overlay: card?.getAttribute("data-sim-overlay") ?? "-",
      state: card?.getAttribute("data-sim-overlay-state") ?? "-",
      // THE SESSION ENDED IS A STRUCTURE, NOT A WORD. Three surfaces are minted
      // by the shell only once `ended && result !== null`: the compact end LINE,
      // the roomy end BAR and the debrief itself. Any one of them is proof; a
      // body-text match for «Резултат» is not — that substring lives inside
      // «преди резултата», «Пропусни и покажи резултата» and any teach copy that
      // happens to use the word, and a false `ended` ends the drive early and
      // then photographs a car that is still driving.
      end:
        document.querySelector('[data-hud="end-screen"]') !== null ||
        document.querySelector('[data-hud="end-bar"]') !== null ||
        document.querySelector('[data-sim-overlay="end"]') !== null,
      strings,
      unpainted,
      unpaintedTotal,
      unpaintedUnnamed,
      unpaintedOverCap,
      // The ONE innerText of the pass, and the play shell rather than the whole
      // document — the debrief lives inside the shell, the nav rail never did.
      body: norm(root.innerText).slice(0, 3000),
      // ── IS THERE A LESSON HERE AT ALL ────────────────────────────────────
      // One querySelector in an evaluate that already runs, and it is the
      // cheapest of the four cockpit instruments: `[data-sim-shell]` is minted
      // by LessonPlayShell and by nothing else, so its ABSENCE says the
      // harness is not on a lesson page — which is exactly what 47 photographs
      // of the paywall were, while the footer called them judgeable. Note the
      // `root` above falls back to `document.body`, which is why this cannot
      // be inferred from anything else in this object.
      shell: document.querySelector("[data-sim-shell]") !== null,
    };
  }).catch(() => ({ kmh: -1, gear: [], overlay: "?", state: "?", end: false, strings: [], unpainted: [], unpaintedTotal: 0, unpaintedUnnamed: 0, unpaintedOverCap: 0, body: "", shell: false }));

/* ── THE COCKPIT CENSUS: DID ANY INSTRUMENT EVER ANSWER? ────────────────────
 *
 * Every field here already existed somewhere and none of them could answer the
 * question, which is the whole shape of this defect. `topSpeed` starts at 0 and
 * only ever climbs, so a dial reading −1 («not in the DOM») and a dial reading
 * 0 («the car is stopped») both leave it at 0 — a paywall and a stationary car
 * were the same number. `guidance.samples` is only pushed in the `roll` phase,
 * so on every MODE=«wrong» lane it is empty and says nothing either way.
 * `steering.channel` reads the dial ONCE, at one instant.
 *
 * This is the whole-drive witness the three of them add up to and none of them
 * is: counted on every named beat AND on every drive tick, in both modes, on
 * every lesson, from 01-arrival onward. It costs two comparisons and an array
 * membership test per read, and it is what `classifyDrive` reads first.
 *
 * `speedReadable` is `kmh >= 0`, NOT `> 0`: a car standing still at a red light
 * reads 0 off a LIVE dial, and treating that as "no instrument" is the same
 * conflation one level down. `movingReads` is the `>= 1` question and is asked
 * separately, because "the dial answered" and "the car moved" are two facts and
 * this programme has already paid for merging them once.
 */
const cockpit = {
  reads: 0,
  speedReadable: 0,
  movingReads: 0,
  topKmh: -1,
  gearReads: 0,
  gears: [],
  shellReads: 0,
};
const cockpitSee = (s) => {
  cockpit.reads += 1;
  if (typeof s?.kmh === "number" && s.kmh >= 0) {
    cockpit.speedReadable += 1;
    if (s.kmh > cockpit.topKmh) cockpit.topKmh = s.kmh;
    if (s.kmh >= 1) cockpit.movingReads += 1;
  }
  const gears = Array.isArray(s?.gear) ? s.gear : [];
  if (gears.length) cockpit.gearReads += 1;
  for (const g of gears) if (g && !cockpit.gears.includes(g)) cockpit.gears.push(g);
  // `probe()` does not read the shell handle (it is not free at 2 Hz), so this
  // is `=== true` rather than truthy: an undefined must not be counted as a
  // sighting and must not be counted as an absence either — `shellReads` is a
  // count of SIGHTINGS, and `classifyDrive` only ever tests it against zero
  // when the beats have run, which they always have by `complete`.
  if (s?.shell === true) cockpit.shellReads += 1;
};

const beat = async (label, { withShot = true } = {}) => {
  const s = await timed("read", read);
  // THE CENSUS IS TAKEN HERE, ON EVERY NAMED FRAME, BEFORE ANYTHING ELSE READS
  // `s`. Every beat from 01-arrival to 08-debrief passes through this function
  // in both modes, which is precisely the coverage the three older speed
  // records each lacked. See the block above `cockpit`.
  cockpitSee(s);
  note(`  [${label}] ${s.kmh} км/ч  gear=${s.gear.length ? s.gear.join("/") : "?"}  card=${s.overlay}/${s.state}${s.end ? "  END-SURFACE" : ""}`);
  s.strings.forEach((t) => note(`      · ${t}`));
  // A DIFFERENT MARK FOR A DIFFERENT FACT. `·` is „a reader of this frame can
  // see this"; `✗` is „the DOM holds this and the photograph does not". They
  // were one silence until 2026-08-21 and they are opposite diagnoses: the
  // second is a finding about the product's own layout, and every drive so far
  // reported it as nothing at all.
  (s.unpainted ?? []).forEach((t) => note(`      ✗ NOT ON THE GLASS — ${t}`));
  // …AND HOW MANY WERE NOT WORTH A LINE. Measured 28 unpainted against the 8
  // printed on one sc-junction-scan beat, so the list on its own understates
  // the census by 20 — among them the ADVISOR CARD, which carries no
  // `data-hud` and is one of the two surfaces the reverse gate reads. A
  // truncated list that does not say it is truncated is the same silence one
  // level down, and this programme has been burned by that shape before.
  const notNamed = (s.unpaintedUnnamed ?? 0) + (s.unpaintedOverCap ?? 0);
  if (notNamed > 0)
    note(
      `      ✗ …and ${notNamed} more held-but-not-painted element(s) were NOT named ` +
        `(${s.unpaintedUnnamed ?? 0} carry no data-hud, ${s.unpaintedOverCap ?? 0} past the 8-line cap) — ` +
        `${s.unpaintedTotal ?? 0} unpainted in total this beat.`,
    );
  if (withShot) await shot(label);
  return s;
};

/**
 * IS A FRAME AFFORDABLE RIGHT NOW?
 *
 * `page.screenshot()` waits for the compositor to hand over a fresh frame. On
 * the `mobile` leg that is ~200 ms and free. On the `pc` leg, with headless
 * Chromium software-rasterising a moving 3D scene, it was MEASURED AT
 * 11 999 ms median / 14 071 ms worst — 12 of the 18 seconds a control-law tick
 * was costing. The car therefore got four driving ticks in a 91 s drive, never
 * came to rest once, and the run's own guard printed «the car would not come to
 * rest in 11s of brake» twice. A drive that cannot brake is not a `right` drive,
 * so the evidence-gathering was destroying the evidence.
 *
 * The named frames (arrival, briefing, ready, first stop, first lawful wait,
 * end, debrief) are always taken — those are the artifact. What backs off is the
 * PERIODIC frame, and only on a machine where it is expensive; the textual beat
 * keeps its full 5 s resolution either way, so the log never loses detail.
 */
const lastShotCostMs = () => {
  const v = cost.screenshot ?? [];
  return v.length ? v[v.length - 1] : 0;
};

// ── THE END-STATE CENSUS ───────────────────────────────────────────────────
//
// This is what replaces guessing a selector a fifth time. It reports which of
// the four rungs is actually on the glass AND dumps every visible control with
// its text, its aria-label, its owning `data-hud` surface and its box — so when
// this harness fails on scenario #137 in eight weeks the failure carries its own
// diagnosis instead of a screenshot somebody has to squint at.
const census = () =>
  page
    .evaluate(() => {
      const shown = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        const cs = getComputedStyle(el);
        return cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
      };
      const box = (el) => {
        const r = el.getBoundingClientRect();
        return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
      };
      const controls = [];
      for (const el of document.querySelectorAll('button, [role="menuitem"], a[href]')) {
        if (!shown(el)) continue;
        const hud = el.closest("[data-hud]");
        const ov = el.closest("[data-sim-overlay]");
        controls.push({
          // textContent, not innerText — see the note on `read()`. The census
          // runs on a frozen or ended screen, but there is no reason to pay for
          // a reflow per control here either.
          text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 52),
          aria: el.getAttribute("aria-label"),
          close: el.hasAttribute("data-hud-close"),
          hud: hud?.getAttribute("data-hud") ?? null,
          ov: ov ? `${ov.getAttribute("data-sim-overlay")}/${ov.getAttribute("data-sim-overlay-state")}` : null,
          box: box(el),
        });
      }
      const overlays = [];
      for (const el of document.querySelectorAll("[data-sim-overlay]")) {
        if (!shown(el)) continue;
        overlays.push({
          kind: el.getAttribute("data-sim-overlay"),
          state: el.getAttribute("data-sim-overlay-state"),
        });
      }
      return {
        controls: controls.slice(0, 40),
        overlays,
        huds: [
          ...new Set(
            [...document.querySelectorAll("[data-hud]")]
              .filter(shown)
              .map((e) => e.getAttribute("data-hud")),
          ),
        ],
        endScreen: shown(document.querySelector('[data-hud="end-screen"]')),
        endBar: shown(document.querySelector('[data-hud="end-bar"]')),
        // The verdict card and the calibration gate are MUTUALLY EXCLUSIVE by
        // construction (SessionEndScreen returns only the gate while it holds),
        // which is exactly why "the debrief is open" is not the same question as
        // "the debrief is READABLE".
        verdictCard: shown(document.querySelector("#sim-result-title")),
        calibration: shown(document.querySelector("#sim-calibration-title")),
        touchHint: shown(document.querySelector('[data-hud="touch-hint"]')),
        playMenu: shown(document.querySelector('[data-hud="play-menu"]')),
        // The roomy pause modals carry no `data-sim-overlay`, so they need
        // their own line here or the census reports "no overlays" while the
        // world is frozen behind a full-screen dialog — see PAUSE_SEL.
        pause: (() => {
          const el = [...document.querySelectorAll('[data-sim-overlay="teach"], [role="dialog"][aria-modal="true"]')].find(shown);
          return el
            ? el.getAttribute("aria-labelledby") ?? el.getAttribute("aria-label") ?? el.getAttribute("data-sim-overlay") ?? "dialog"
            : null;
        })(),
      };
    })
    .catch((e) => ({
      controls: [], overlays: [], huds: [], endScreen: false, endBar: false,
      verdictCard: false, calibration: false, touchHint: false, playMenu: false,
      pause: null, error: String(e?.message || e),
    }));

const dumpCensus = (c, why) => {
  note(`  ── CONTROL CENSUS (${why}) ──`);
  if (c.error) loud(`the census itself threw: ${c.error}`);
  note(`     hud surfaces: ${c.huds.join(", ") || "(none)"}`);
  note(`     overlays: ${c.overlays.map((o) => `${o.kind}/${o.state}`).join(", ") || "(none)"}`);
  note(
    `     end-screen=${c.endScreen} end-bar=${c.endBar} verdict-card=${c.verdictCard} ` +
      `calibration-gate=${c.calibration} touch-hint=${c.touchHint} pause-layer=${c.pause ?? "none"}`,
  );
  if (!c.controls.length) loud("NOT ONE VISIBLE CONTROL ON THE PAGE — that is itself the finding.");
  for (const b of c.controls) {
    note(
      `     · "${b.text}"${b.aria ? ` [aria:${b.aria}]` : ""}${b.close ? " [data-hud-close]" : ""}` +
        ` hud=${b.hud ?? "-"} overlay=${b.ov ?? "-"} box=[${b.box.join(",")}]`,
    );
  }
};

/** Click a locator and say so, falling back to a DOM click when the real one is
 *  refused (a covered control is still a control — `useTapActivation` keeps the
 *  onClick path alive beside the pointer path and de-dupes, so this is safe). */
async function press(locator) {
  if (!(await locator.count().catch(() => 0))) return false;
  const first = locator.first();
  if (!(await first.isVisible().catch(() => false))) return false;
  let ok = true;
  await first.click({ timeout: 5000 }).catch(async () => {
    ok = await first.evaluate((el) => { el.click(); return true; }).catch(() => false);
  });
  return ok;
}

/** The lesson menu toggle carries `aria-expanded` — the one handle that is the
 *  same on every scenario and both device classes. */
const menuToggle = () => page.locator('[data-hud="play-menu"] button[aria-expanded]').first();
async function openMenu() {
  const t = menuToggle();
  if (!(await t.count().catch(() => 0))) return false;
  if ((await t.getAttribute("aria-expanded").catch(() => null)) === "true") return true;
  const ok = await press(t);
  await page.waitForTimeout(900);
  return ok;
}
async function closeMenu() {
  const t = menuToggle();
  if ((await t.getAttribute("aria-expanded").catch(() => null)) === "true") {
    await press(t);
    await page.waitForTimeout(600);
  }
}

// ── go ─────────────────────────────────────────────────────────────────────

// THE RENDERER IS ASSERTED, NOT ASSUMED. A PC leg that silently falls back to
// SwiftShader does not fail — it produces verdicts, and they are noise. That
// already happened once: the same drive returned ИЗДЪРЖАН/0, НЕИЗДЪРЖАН/20 and a
// collision on three consecutive runs, and only a tick-cost measurement gave it
// away. If a driver update or a different machine drops this back to software,
// the run must SAY so on its own first line.
if (PLATFORM === "pc") {
  const renderer = await page
    .evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      const d = gl?.getExtension("WEBGL_debug_renderer_info");
      return d ? String(gl.getParameter(d.UNMASKED_RENDERER_WEBGL)) : "unknown";
    })
    .catch(() => "unknown");
  const software = /swiftshader|software|llvmpipe/i.test(renderer);
  note(`  GPU: ${renderer.slice(0, 90)}`);
  if (software) {
    note(
      `  !! SOFTWARE RENDERER — a control tick costs ~3.3 s here and drive verdicts from this run are NOT reproducible. Treat every result below as unmeasured.`,
    );
  }
}

// A REFUSED SIGN-IN IS RECORDED, NOT JUST THROWN. sc-rb-exit-signal/mobile-wrong
// is the shape: nine 0-byte PNGs and an EMPTY log.txt beside a
// log-signin-refused-1.txt, so "a later reader counting files would conclude
// this lane was audited". `signIn` throwing kills the process before anything
// says which lane died or why, and the same refusal hit sc-pk-rail-ban/pc-wrong,
// sc-crossing-dart/pc-right and sc-rx-guarded/pc-right in the same sweep. The
// status file has to carry it, because that is the artifact a re-drive reads.
saveStatus({ phase: "signing-in" });
try {
  await signIn(page, { email: "founder@knijka.ai", password: "Knijka2026!" }, BASE);
} catch (error) {
  const why = String(error?.message ?? error).split("\n")[0];
  loud(`SIGN-IN WAS REFUSED — this lane never reached the lesson: ${why}`);
  saveStatus({ phase: "signin-refused", why, exit: EXIT_SIGNIN_REFUSED });
  await browser.close().catch(() => {});
  // A REFUSAL IS NOT A CRASH, and the crash guard must never relabel it. This
  // lane's failure has a name, a reason and its own exit code; burying that
  // under "the harness died" would send a re-drive after the harness instead of
  // after the login rate-limiter that actually did it.
  process.exit(EXIT_SIGNIN_REFUSED);
}
saveStatus({ phase: "loading-lesson" });
await page.goto(`${BASE}/simulator?scenario=${SCENARIO}&level=1`, {
  waitUntil: "domcontentloaded",
  timeout: 300_000,
});
await page.waitForTimeout(25_000);

note(`=== ${SCENARIO} · ${PLATFORM} · ${MODE} ===`);
saveStatus({ phase: "arrived" });
await beat("01-arrival");

// THE FULL BRIEFING — open the sheet, read it, and CLOSE IT AGAIN. The close is
// asserted, not hoped for: an open sheet pauses the sim.
const readMore = page.locator('button:has-text("ПРОЧЕТИ"), button:has-text("Прочети"), button:has-text("СПИСЪК")').first();
let briefing = "";
if (await readMore.count().catch(() => 0)) {
  await readMore.click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(2500);
  briefing = (await read()).body;
  await beat("02-briefing");
  // CLOSE IT, AND TRY EVERY CONTROL THE SHEET ACTUALLY HAS.
  //
  // The first version tried `[data-hud-close]` and then Escape, and NEVER the
  // «Разбрах» button that the open sheet actually carries. So the sheet stayed
  // `hint/open`, the read sheet pauses the sim by design, and the positive
  // control pushed the throttle against a frozen world and read 0 км/ч — which
  // I nearly reported as "the car will not move".
  //
  // The state is asserted after every attempt, not assumed: `hint/open` at
  // `03-ready` is the tell, and it is now impossible to miss because the loop
  // shouts if it cannot close it.
  let closed = false;
  for (let i = 0; i < 6 && !closed; i++) {
    const stillOpen = await page.evaluate(
      () => document.querySelector('[data-sim-overlay-state="open"]') !== null,
    ).catch(() => false);
    if (!stillOpen) { closed = true; break; }
    // SCOPED TO THE OPEN SHEET. Unscoped `[data-hud-close]`.first() and
    // `button:has-text("Разбрах")`.last() range over the PEEK card as well as
    // the sheet, so the click landed on a control behind the dialog and the
    // sheet never closed — six attempts, still `hint/open`. The frame shows both
    // controls large and unmissable (a ✕ top-right and a full-width «Разбрах»),
    // so the sheet was never the problem: the selector was.
    const sheet = page.locator('[data-sim-overlay-state="open"]');
    const ack = sheet.locator('button:has-text("Разбрах")').first();
    const x = sheet.locator("[data-hud-close], button[aria-label*='Скрий'], button[aria-label*='Затвори']").first();
    if (await ack.count().catch(() => 0)) await ack.click({ timeout: 4000 }).catch(() => {});
    else if (await x.count().catch(() => 0)) await x.click({ timeout: 4000 }).catch(() => {});
    else await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(1200);
  }
  if (!closed) loud(`THE «ПРОЧЕТИ» SHEET WOULD NOT CLOSE — the sim is paused and every frame after this is a frozen world.`);
}
for (const l of ["РАЗБРАХ", "Разбрах"]) {
  const b = page.locator(`button:has-text("${l}")`).first();
  if (await b.count().catch(() => 0)) { await b.click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1200); }
}
await beat("03-ready");

// ── FASTEN THE SEATBELT ────────────────────────────────────────────────────
//
// MEASURED 2026-08-27: 194 of 204 drives in the w12 sweep were charged
// «Движение без предпазен колан −3». That is not a product defect. It is the
// founder's ruling working as designed — LessonScene.tsx records it against
// commit 265629d: every one of the 150 scenarios spawns ready-to-drive with
// EXACTLY ONE item left outstanding, the belt, «because the belt is the one
// pre-drive step whose omission the rule engine goes on grading for the whole
// session».
//
// So the harness was driving like a student who never buckles up, and the
// product was correctly failing it. The cost was not the 3 points: it put a
// 3-point floor under EVERY score in the sweep, which makes every «does a good
// drive get credited» finding unanswerable and inflates the wrong-vs-right
// comparison the whole audit rests on.
//
// KeyB is the binding — scene/cabin.ts:489 maps seatbelt to KeyB. There is no DOM
// hook for the belt state, so this cannot self-verify in-drive; it is verified
// the way the ledger verifies everything — by whether the fault stops being
// charged in the debrief. If «предпазен колан» keeps appearing after this,
// the press is not landing and the next reader should say so loudly rather
// than assume it worked.
await page.keyboard.press("KeyB").catch(() => {});
await page.waitForTimeout(400);

// ── THE PEDALS ─────────────────────────────────────────────────────────────
//
// Held as STATE, not as bare key events, for one reason that has already put a
// car on the wrong side of a lesson: a brake press at a STANDSTILL is the
// auto-reverse gesture (engine/reverseAssist.ts — „press the brake at a
// standstill in D and the car shifts itself to R", and since the 2026-08-11
// founder ruling that same armed press becomes the reverse THROTTLE). LAW 1
// exempts a pedal held from a roll THROUGH the stop, which is what a real
// learner does and what this harness must do. Knowing whether the pedal is
// already down is the whole of the difference, so the harness tracks it.
let holdW = false, holdS = false;
const throttle = async (on) => {
  if (on === holdW) return;
  await page.keyboard[on ? "down" : "up"]("KeyW").catch(() => {});
  holdW = on;
};
let refusedReversePress = 0;
/**
 * EVERY S KEYDOWN THIS HARNESS MAKES, TIMED AND SPEED-STAMPED — 2026-08-21,
 * round 3. WITHOUT THIS LIST THE UNARMED-R WATCHDOG CANNOT BE HONEST.
 *
 * `reverseAssist.ts` arms R on a brake press made at a standstill after a
 * genuine lift. This harness presses the brake at every stop, and it CANNOT SEE
 * WHEN ITS PRESS LANDED: `brake()` is gated on the speed the last probe read,
 * the CDP round trip to the page was measured at ~2.0 s median on this box, and
 * a car reading 2 км/ч when the gate opened can be at rest by the time the
 * keydown reaches `input.ts`. So „the harness did not intend a standstill
 * press" and „no standstill press happened" are DIFFERENT STATEMENTS, and only
 * the first one is knowable from in here.
 *
 * The watchdog below therefore does not get to say who caused an unexplained R.
 * It gets this list, and it says what it can and cannot tell from it.
 */
const sPresses = [];
/**
 * HOW OLD A PRESS MAY BE AND STILL BE A CANDIDATE FOR AN R — 2026-08-21,
 * adversarial re-verification of the attribution.
 *
 * The hedge above is a LATENCY argument and a latency argument has a reach.
 * `reverseAssist` emits its toggle at most REVERSE_ASSIST_HOLD_S (0.35 s) after
 * the press lands, and the CDP round trip was measured at ~2.0 s median — so a
 * press that could have armed THIS R is a press from the last couple of
 * seconds. The first draft of the watchdog recited the latency sentence over a
 * press of ANY age, including one made 170 s earlier at 45 км/ч, which the
 * round trip does not reach: it asserted a mechanism nobody measured, which is
 * the same fault this round exists to repair, one level down.
 *
 * 8 s, not 2.5, because the reach that matters is the reach of the SAMPLING:
 * ticks are seconds apart and `now` is the tick that saw R, not the instant it
 * appeared. Generous on purpose — being late to stop hedging is safe, being
 * early is an accusation.
 */
const S_PRESS_NEAR_MS = 8000;
/**
 * …AND THE RULE THAT A BRAKE PRESS AT A STANDSTILL IS A GEAR CHANGE LIVES
 * HERE, NOT AT THE CALL SITES.
 *
 * engine/reverseAssist.ts: pressing the brake at a standstill in D, after the
 * pedal has been genuinely lifted, ARMS the auto-reverse and (since the
 * 2026-08-11 founder ruling) that same armed press becomes the reverse
 * THROTTLE. A pedal held from a roll through the stop is exempt by LAW 1.
 *
 * Two call sites had this right and one did not: the pause branch released
 * BOTH pedals when a teach card froze the world, so a card that arrived while
 * the car was stopped left the brake lifted at a standstill, and the next stop
 * phase pressed it again — the exact gesture that selects R. The symptom was a
 * car that reported «would not come to rest in 11s of brake (9 км/ч)» over and
 * over: it was not failing to brake, it was driving backwards.
 *
 * A rule enforced at three call sites is a rule that will be broken at the
 * fourth, so the helper refuses the press and counts the refusals.
 */
const brake = async (on, kmh = null) => {
  if (on === holdS) return;
  if (on && kmh !== null && kmh >= 0 && kmh <= 1) {
    refusedReversePress += 1;
    return;
  }
  if (on) sPresses.push({ at: Date.now(), kmhAtIssue: kmh, via: "brake" });
  await page.keyboard[on ? "down" : "up"]("KeyS").catch(() => {});
  holdS = on;
};

/* ===========================================================================
 * THE STEERING CHANNEL — 2026-08-21. THE HARNESS HAD NEVER TURNED A WHEEL.
 * ===========================================================================
 *
 * A KEYBOARD CENSUS OF THIS FILE RETURNED THREE KEYS: KeyW, KeyS, Escape. The
 * product takes steering from KeyA/ArrowLeft and KeyD/ArrowRight
 * (`engine/input.ts`: `const left = on("KeyA") || on("ArrowLeft")`), and there
 * is no auto-steer, lane-assist or route-following anywhere under
 * `platform/src/modules/sim` — the «Пълна помощ» aid rungs change coaching and
 * pausing, never control. So every drive this audit has ever taken — all 376 of
 * Wave C and every drive behind the original 1,712 findings — was a car that
 * could accelerate and brake AND COULD NOT TURN.
 *
 * That is the mechanism behind «the ego left the carriageway at ~t030s and
 * stood still for 175 s», behind «the correct drive drove into the parked car»,
 * and behind a large share of the 92 of 145 lessons recorded as having no
 * drivable success path.
 *
 * ── WHAT THIS BLOCK IS, AND WHAT IT DELIBERATELY IS NOT ────────────────────
 *
 * It is the CAPABILITY and its accounting. It is not a driving line. The
 * scripted traces still do not steer, on purpose: how a correct drive should
 * steer is a DESIGN question owned by `devrig/driveScript.ts` and the scenario
 * templates, and a drive that steers BADLY is worse than one that cannot steer,
 * because it manufactures confident wrong findings instead of honest silence.
 * `steering.note` below says so on every lane so nobody reads „0 commands" as
 * „steering was not needed".
 *
 * ── THE DISCIPLINE, AND EVERY RULE IN IT WAS MEASURED ──────────────────────
 *
 * The pedal helpers exist because a stray standstill brake press silently put a
 * car into R and then reported a failed brake. Three ways a steering channel
 * can tell the same kind of lie, and one guard each:
 *
 *  1. BOTH DIRECTIONS AT ONCE IS NOT STEERING, IT IS STRAIGHT AHEAD.
 *     `input.ts` computes `out.steer = (left ? 1 : 0) - (right ? 1 : 0)`, so a
 *     harness holding KeyA and KeyD together sends ZERO steer while believing
 *     it is turning — the exact shape of the reverse bug, in the other control.
 *     The channel therefore holds ONE direction at a time, by construction: the
 *     opposite key is released before the new one goes down, and an attempt to
 *     hold both is refused and counted.
 *
 *  2. A STEER AT A STANDSTILL MOVES THE CAMERA AND NOT THE CAR, AND IT MOVES IT
 *     A LOT. MEASURED on the live rig 2026-08-21 (WebKit, iphone16-landscape,
 *     sc-junction-scan@L1, dev server 4611160afb1e), car at 0 км/ч, the world
 *     band photographed before / while held / after release:
 *
 *       control (no key)   HELD    0 px  0.0°   NET 0 px   ncc 0.968
 *       KeyA held          HELD +156 px +5.4°   NET 0 px   ncc 0.990
 *       KeyD held          HELD -151 px -5.2°   NET 0 px   ncc 0.996
 *
 *     Letting go puts the world back EXACTLY where it started, and holding the
 *     key three times as long moves it exactly as far. That is not a car
 *     turning — it is `CameraRig.tsx`'s `steerNorm * COCKPIT_LOOK_INTO_TURN`, a
 *     head yaw that saturates and returns. The measured ±5.4°/−5.2° is the
 *     product's own constant read off the pixels: `COCKPIT_LOOK_INTO_TURN` is
 *     0.09 rad = 5.16°.
 *
 *     A harness that asserted „the world moved, so the steering works" would
 *     have gone green on a car that never changed heading by one degree, which
 *     is why the assertion below measures A→C and never A→B. Standstill steers
 *     are counted separately and named in the log.
 *
 *  3. A HELD STEER KEY SURVIVES A PAUSE DRAIN. The drain releases both PEDALS
 *     and resynchronises `holdW`/`holdS` because a key sent while a modal owns
 *     focus never reaches the sim. A steer key left down there would keep the
 *     wheel over for the rest of the drive with nothing tracking it, so it is
 *     released and resynchronised in the same breath as the pedals.
 */
const STEER_KEYS = { left: "KeyA", right: "KeyD" };
/**
 * Below this the car does not answer the wheel — see measurement 2. The dial
 * rounds `Math.abs(v)`, so a displayed 1 can be 1.4 км/ч; 2 is the first
 * reading that cannot also be a standstill.
 */
const STEER_MIN_KMH = 2;
/** Everything the run learned about steering, published on EVERY lane. */
const steering = {
  keys: STEER_KEYS,
  /** the channel EXISTS in this build of the harness. Before 2026-08-21 there
   *  was no such field and no such channel, and the two were indistinguishable
   *  from the outside — which is how 376 drives were adjudicated. */
  wired: true,
  commands: 0,
  heldMs: { left: 0, right: 0 },
  everSteered: false,
  refusedBothAtOnce: 0,
  atStandstill: 0,
  releasedByPauseDrain: 0,
  /**
   * DOES THE DRIVE PATH STEER? Stated as data, not only as prose, so a consumer
   * can filter on it instead of parsing a sentence.
   *
   * IT WAS A HARD `false` UNTIL 2026-08-21 AND THAT IS NOW A LIE THE FILE WOULD
   * BE TELLING ABOUT ITSELF. The drive path closes a control loop on the
   * product's guidance ribbon (`guideTick`), so the traces DO steer — but only
   * where the loop can see and afford its signal, which is why this is written
   * from what happened rather than declared. `guidance.state` says which, and
   * `guidance.tracking.verdict` says how well; a lane that reads
   * `tracesSteer: false` here drove in a straight line and one of those two
   * fields names the reason.
   */
  tracesSteer: null,
  probe: null,
  /**
   * THE ONE FIELD AN ORDINARY DRIVE LANE CANNOT BE QUIET ABOUT — round 3.
   *
   * `probe` above is filled only by `KNIJKA_STEER_PROOF=1`, which runs INSTEAD
   * of the drive. So the channel was proven in a mode no wave runs and left
   * unproven in the mode every wave uses: on a normal lane a channel that had
   * been broken said NOTHING, which is the exact conflation — silence reading
   * as „not needed" — that hid the missing wheel for 376 drives.
   *
   * `state` is one of three and is never absent:
   *   "live"      the wheel was turned on THIS drive and the product answered
   *   "dead"      the wheel was turned on THIS drive and NOTHING answered
   *   "untested"  the wheel was never turned on this drive — and that is NOT
   *               „steering was not needed"; `why` says what stopped it
   */
  channel: {
    state: "untested",
    why: "the check has not run yet",
    legs: [],
    attempts: 0,
    costMs: 0,
    /** Liveness's OWN books — never mixed into the trace's, see `steer()`. */
    commands: 0,
    heldMs: { left: 0, right: 0 },
  },
  note: null,
};
let steerHeld = null;
let steerSince = null;
/** Which set of books the CURRENT hold belongs to — "trace" or "liveness". */
let steerHeldBy = null;
/**
 * Hold ONE steering direction, or `null` for straight ahead.
 *
 * `kmh` is optional and is only used to classify the command — this helper
 * never refuses on speed, because a steer at rest is INERT rather than harmful
 * (unlike a standstill brake press, which selects R). Refusing it would also
 * make a future parking trace unable to pre-position the wheel. It is counted
 * and named instead: `steering.atStandstill`.
 */
const steer = async (dir, kmh = null, by = "trace") => {
  if (dir !== null && dir !== "left" && dir !== "right") {
    steering.refusedBothAtOnce += 1;
    return false;
  }
  if (dir === steerHeld) return true;
  const now = Date.now();
  if (steerHeld !== null) {
    // ONE DIRECTION AT A TIME, ALWAYS — the release happens before the press,
    // so there is no instant in which both keys are down and the car is being
    // told to go straight while the harness believes it is turning.
    await page.keyboard.up(STEER_KEYS[steerHeld]).catch(() => {});
    // …AND THE TIME IS BANKED TO WHOEVER PRESSED, NOT TO WHOEVER RELEASED.
    // `steerHeldBy` is carried from the press for exactly this: the liveness
    // check releases through `steer(null)`, and billing that release to the
    // trace is how `heldMs.left: 1129` appears on a drive whose traces never
    // touched the wheel.
    if (steerSince !== null) (steerHeldBy === "trace" ? steering.heldMs : steering.channel.heldMs)[steerHeld] += now - steerSince;
    steerHeld = null;
    steerSince = null;
    steerHeldBy = null;
  }
  if (dir !== null) {
    await page.keyboard.down(STEER_KEYS[dir]).catch(() => {});
    steerHeld = dir;
    steerSince = Date.now();
    steerHeldBy = by;
    /* ── WHO TURNED THE WHEEL IS NOT THE SAME QUESTION AS WHETHER IT TURNED ──
     *
     * TWO SETS OF BOOKS, AND THE SECOND SET EXISTS BECAUSE THE FIRST DRAFT KEPT
     * ONE. `everSteered` is read downstream as „this DRIVE steered", and the
     * loud line about uncredited objectives keys off it. The liveness check
     * turns the wheel on every lane, at a standstill, with no pedal down — the
     * car does not move a millimetre — so crediting it to the trace's counters
     * would silently retire the very warning that says a drive could not turn.
     * MEASURED on the first run that worked: the lane printed „0 trace
     * commands" beside `commands: 2` and 1,129 ms at the wheel, which is a
     * status file arguing with itself. Liveness keeps its own counters, under
     * `steering.channel`, where every number means what it measures.
     */
    if (by === "trace") {
      steering.commands += 1;
      steering.everSteered = true;
      if (kmh !== null && kmh >= 0 && kmh < STEER_MIN_KMH) steering.atStandstill += 1;
    } else {
      steering.channel.commands += 1;
    }
  }
  return true;
};
/** Let go of whatever is held and bank the time. Used by the pause drain and at
 *  the end of the drive — a key still down when the process exits is a key the
 *  next reader cannot account for. */
const steerRelease = async (why = null) => {
  if (steerHeld === null) return;
  if (why) steering.releasedByPauseDrain += 1;
  await steer(null);
};

/* ===========================================================================
 * THE STEERING POSITIVE CONTROL — `KNIJKA_STEER_PROOF=1`
 * ===========================================================================
 *
 * „I sent KeyA" IS NOT EVIDENCE. It is the same sentence as „I sent the brake
 * key", which this harness has already believed while a car drove backwards.
 * The claim a steering channel has to earn is that THE CAR CHANGED HEADING, and
 * the only instrument that can answer it on a real lesson page is the world
 * itself: there is no heading in the DOM (the live HUD publishes speed, gear,
 * limit, lamps and telltales and nothing about where the car is pointing), the
 * minimap is only rendered on the debrief, and `window.__driveRig` — which does
 * publish `headingDeg` — is /dev/drive-rig only and 404s in production, which
 * this harness is forbidden to touch for exactly that reason.
 *
 * So the world is photographed and the photographs are measured.
 *
 * ── HOW, AND WHY IT IS THREE FRAMES AND NOT TWO ────────────────────────────
 *
 * ── WHAT IT MEASURED, THE DAY IT LANDED ────────────────────────────────────
 *
 * sc-junction-scan@L1, WebKit, iphone16-landscape, dev server 4611160afb1e.
 * Every number is a device pixel of the world band and the angle beside it is
 * that pixel count at ≈0.0347°/px:
 *
 * THREE CONSECUTIVE RUNS, and the spread across them is the reproducibility:
 *
 *   AT REST — the wheel moves the CAMERA and puts it back
 *     rest-ctl    (no key)   HELD       0 px    0.0°   NET 0 px  ncc 0.965–0.971
 *     rest-left   KeyA       HELD +156…+158 px +5.4°   NET 0 px  ncc 0.991–0.993
 *     rest-right  KeyD       HELD -151…-152 px -5.3°   NET 0 px  ncc 0.994–0.996
 *   — and ±5.3° is `COCKPIT_LOOK_INTO_TURN` read off the pixels: the constant
 *     is 0.09 rad = 5.16°. The measurement chain agrees with the product's own
 *     number to a quarter of a degree, which is the best evidence there is that
 *     this probe is measuring what it says it is.
 *
 *   NUDGED — stopped, one 700 ms pull of throttle, stopped again
 *     nudge-ctl  (no key)   NET   +9, +9, +15 px      +0.3…+0.5°
 *     nudge-left  KeyA      NET +340, +308, +412 px  +11.8, +10.7, +14.3°   (ncc ≈0.81 against an unslid ≈0.27)
 *     nudge-right KeyD      NET -291, -377, -380 px  -10.1, -13.1, -13.2°   (ncc ≈0.82 against an unslid ≈0.53)
 *
 * Signed the way physics requires — KeyA turns the car left, so the world moves
 * RIGHT — thirty times the control, and it stays rotated after the key is
 * released, which the camera does not.
 *
 * AND IT WAS WATCHED TO FAIL. With `STEER_KEYS` mutated to `KeyJ`/`KeyL`, two
 * keys the product ignores, the same six legs read +7, +9, +15 px — the
 * control's own noise — and exactly the two claims about KeyA/KeyD went red
 * while the two control checks stayed green. An assertion nobody has seen fail
 * is a decoration; this one has.
 *
 * ── WHAT IT WOULD TAKE TO MAKE THE TRACES STEER ────────────────────────────
 *
 * Not this file's call, and the numbers above are the input to whoever makes
 * it. What a trace would steer AGAINST is the open question: the live HUD
 * publishes no heading, no lateral offset and no distance-to-target, so a
 * closed loop has nothing on the glass to close around. The three candidates,
 * in the order a designer should try them:
 *   1. `[data-hud="follow-hint"]` and the guidance ribbon the scene already
 *      draws — the product's own „follow the blue line" is a driving line, and
 *      a controller that tracked it would be steering the way the lesson
 *      teaches rather than the way an audit invented.
 *   2. The objective geometry the scenario already carries (`reachZone` x/y),
 *      which is authored, exact, and needs no pixels — but is not published to
 *      the page, so it would need a HUD handle or a data attribute to reach.
 *   3. This probe's own correlation as a yaw sensor at ~0.5 Hz. It works, it is
 *      measured, and it costs two screenshots a tick — far too slow for a
 *      control law and fine for an assertion, which is why it is only used for
 *      one here.
 * Whatever it steers against, the acceptance test is the one thing this file
 * can assert already: a correct drive must still finish with the debrief it
 * finished with before, or the steering has changed what the audit measures.
 *
 * A band of the scene above the road is grabbed as a PNG, decoded BY THE PAGE
 * (`createImageBitmap` + a 2D canvas — the WebGL canvas is not readable, it
 * carries no `preserveDrawingBuffer`), reduced to grey, mean-subtracted, and
 * cross-correlated against another band over horizontal shifts. The shift with
 * the best normalised correlation is how far the world moved sideways, i.e. how
 * far the view rotated.
 *
 * Each leg takes THREE frames:
 *      A   before the key
 *      B   with the key still HELD
 *      C   after the key is released and the camera has settled
 *
 * and the answer is A→C, never A→B, because of measurement 2 in the block
 * above: `CameraRig.tsx` yaws the head by `steerNorm * COCKPIT_LOOK_INTO_TURN`
 * while the wheel is over, and that offset SATURATES AND RETURNS. At a
 * standstill A→B reads ±166 px and A→C reads 0 px at ncc 0.999 — so an
 * assertion written on A→B would have gone green on a car that never turned.
 * That is the reassuring-direction trap this whole programme is about, and it
 * was live in the first draft of this probe.
 *
 * ── AND A FLAT CORRELATION IS NOT A ZERO ───────────────────────────────────
 *
 * A scene that has changed too much to recognise produces a peak barely above
 * its neighbours, and `argmax` still returns a number. Every leg therefore
 * carries the peak AND the best score at least `PEAK_GUARD_PX` away from it; a
 * leg whose peak does not clear its runner-up by `PEAK_MARGIN` is VOID, and a
 * void leg is reported as void rather than folded into an average as a 0.
 */
const STEER_PROOF = process.env.KNIJKA_STEER_PROOF === "1";
/**
 * HOW LONG TO HOLD, AND WHY IT IS NOT LONGER — measured, twice.
 *
 * The first draft held 1500 ms and EVERY moving leg came back void:
 *   move-left1   HELD  296px  NET  300px  ncc 0.1131   ← the scene is unrecognisable
 *   move-right1  HELD -300px  NET -152px  ncc 0.38
 * At 3 км/ч a 1.5 s hold turns the car ~15° on top of the camera's ~15°, and
 * ~30° of a 71°-wide band is nearly half the picture replaced by scenery that
 * was off-frame when the first photograph was taken. There is nothing left to
 * correlate. A longer hold is a WEAKER measurement, which is the opposite of
 * the intuition, and the void legs are the only reason that was visible.
 *
 * 900 ms turns ~9° ≈ 87 px of this band — comfortably over PROOF_MIN_PX and
 * about an eighth of the width, so the overwhelming majority of the scene is
 * still in both frames.
 */
const PROOF_HOLD_MS = 900;
/** …and let the look-into-turn offset come all the way home before frame C.
 *  Shorter than the hold's first draft for the same reason: every millisecond
 *  here is forward translation that the correlation has to survive. */
const PROOF_SETTLE_MS = 1000;
/**
 * Bounded by the template width below, not by taste: the search may not slide
 * the template off the edge of the frame it is being matched into.
 *
 * AND THE UNIT IS A DEVICE PIXEL, WHICH COST A DRAFT TO NOTICE. Playwright
 * screenshots at the context's `deviceScaleFactor` — 3 on `iphone16-landscape`
 * — so a band clipped at 682 CSS px arrives as a 2046-px PNG and every shift
 * this probe reports is three times the CSS number. At ±230 EVERY turn leg came
 * back «the best match is at the search limit» while the two controls agreed to
 * the pixel (+8 px, twice), which is what a search window three times too small
 * looks like. The angle conversion had the same bug and it is the reason an
 * earlier draft „measured" a 14.7° look-into-turn against a constant that caps
 * it at 5.2°.
 */
const PROOF_MAX_SHIFT_PX = 600;
/**
 * BOTH PHOTOGRAPHS ARE TAKEN WITH THE CAR STOPPED — 2026-08-21, third draft.
 *
 * The second draft photographed a MOVING car and every leg came back void:
 *   move-ctl1  NET  118px ncc 0.5021/0.4981   move-left1 NET -164px ncc 0.6377/0.6226
 *   move-ctl2  NET  -16px ncc 0.9240/0.9077   move-left2 NET  100px ncc 0.6761/0.6597
 * — the two LEFT legs disagreed on the SIGN, and a control leg that pressed
 * nothing reported 118 px. That is not a noisy measurement, it is no
 * measurement: three seconds of bracket at 3 км/ч is metres of forward
 * translation plus whatever the ambient traffic did, and a rotation of 9° is a
 * small term inside all of that.
 *
 * A turn is CHEAP IN METRES and that is what makes this tractable. The
 * kinematic radius is L/tan δ ≈ 2.5 m / tan 35° ≈ 3.6 m, so 15° of heading
 * costs under a metre of road. Stop the car, nudge it forward with the wheel
 * over, stop it again, let go, and the two photographs differ by a rotation and
 * about a metre — instead of by a rotation and four metres of a moving world.
 *
 * The control leg does the identical nudge with no key, so the metre of
 * translation is in BOTH arms of the comparison and only the heading is not.
 */
const PROOF_NUDGE_MS = 700;
/** ONE, AND THE COUNT CAME DOWN TWICE ON MEASUREMENTS.
 *
 *  Three nudges put two of six legs past the ±230 px search limit. Two got the
 *  legs inside the window but left them at 100–230 px, and at that magnitude
 *  the correlation itself gave way — a quarter of the band replaced by scenery
 *  that was off-frame in the first photograph, and peaks of ncc 0.07, 0.10,
 *  0.35 that mean nothing at all. A BIGGER TURN IS A WORSE MEASUREMENT, which
 *  is exactly backwards from the intuition that keeps reaching for a longer
 *  hold. One nudge turns ~6–9°, which is 60–90 px of this band: five to nine
 *  times the noise floor and under a seventh of the picture. */
const PROOF_NUDGES = 1;
const PEAK_GUARD_PX = 25;
const PEAK_MARGIN = 0.05;
/** How far the world must move for a leg to count as a turn, and how far it may
 *  move on a leg that pressed nothing. Both are read off the measurement in the
 *  block above: the straight controls landed on 0 px and the smallest accepted
 *  turn on 85 px, so 40 px sits between them with a factor of two on each side. */
const PROOF_MIN_PX = 40;
const PROOF_NOISE_PX = 40;

/** The scene band, and the horizontal angle a pixel of it subtends. */
async function proofBand() {
  const g = await page
    .evaluate(() => {
      const shell = document.querySelector("[data-sim-shell]") ?? document.body;
      let best = null;
      for (const c of shell.querySelectorAll("canvas")) {
        const r = c.getBoundingClientRect();
        if (!best || r.width * r.height > best.w * best.h) {
          best = { x: r.x, y: r.y, w: r.width, h: r.height };
        }
      }
      // THE SCALE, TAKEN FROM THE PAGE AND NOT ASSUMED. Every shift this probe
      // reports is in the PNG's pixels, and the PNG is `deviceScaleFactor`
      // times the CSS box (3 on iphone16-landscape). Without this the angles
      // come out three times too large — an earlier draft „measured" a 14.7°
      // camera yaw against a product constant that caps it at 5.2°, and the
      // arithmetic, not the sim, was the liar.
      return best ? { ...best, dpr: window.devicePixelRatio || 1 } : null;
    })
    .catch(() => null);
  if (!g || g.w < 40 || g.h < 40) return null;
  return {
    clip: {
      x: Math.round(g.x + g.w * 0.1),
      y: Math.round(g.y + g.h * 0.3),
      width: Math.round(g.w * 0.8),
      height: Math.round(g.h * 0.18),
    },
    canvas: g,
    dpr: g.dpr,
    // A pinhole at the centre of the cockpit's ~75.4° horizontal FOV
    // (`vehicle/tuning.ts`: COCKPIT_HFOV_RAD ≈ 75.4°, held constant across
    // window shapes), per DEVICE pixel. Quoted as „about": the projection is
    // not a linear ruler and this understates angles away from the centre.
    degPerPx: ((2 * Math.tan((75.4 * Math.PI) / 360)) / (g.w * g.dpr)) * (180 / Math.PI),
  };
}
const proofGrab = async (band) => (await page.screenshot({ clip: band.clip })).toString("base64");

/** Cross-correlate two PNG bands, in the page, and say how sure it is. */
const proofShift = (a, c) =>
  page
    .evaluate(
      async ({ a, c, maxShift, guard }) => {
        const toGray = async (b64) => {
          const bin = atob(b64);
          const u8 = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          const bmp = await createImageBitmap(new Blob([u8], { type: "image/png" }));
          // NOT OffscreenCanvas — this browser is WebKit and does not have it;
          // the first draft of this probe died on that line.
          const cv = document.createElement("canvas");
          cv.width = bmp.width;
          cv.height = bmp.height;
          const ctx = cv.getContext("2d");
          ctx.drawImage(bmp, 0, 0);
          const { data, width, height } = ctx.getImageData(0, 0, bmp.width, bmp.height);
          const g = new Float32Array(width * height);
          for (let i = 0, p = 0; i < data.length; i += 4, p++) {
            g[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          }
          return { g, width, height };
        };
        const A = await toGray(a);
        const C = await toGray(c);
        if (A.width !== C.width || A.height !== C.height) return { error: "the two bands are different sizes" };
        const { width: W, height: H } = A;
        let identical = true;
        for (let i = 0; i < A.g.length; i++) if (A.g[i] !== C.g[i]) { identical = false; break; }
        /* ── A TEMPLATE, NOT AN OVERLAP — and this is the whole difference
         * between a working measurement and six void legs.
         *
         * Comparing the two bands over their shared region shrinks that region
         * by exactly the amount being measured, so the bigger the turn the less
         * evidence there is for it, and past ~20 % of the width the correlation
         * simply collapses (measured: ncc 0.11 on a leg that really did turn).
         * Matching the CENTRAL HALF of the first frame into the whole of the
         * second keeps the compared area constant at every shift — the score at
         * ±170 px is computed over the same pixels as the score at 0. */
        const tx0 = Math.floor(W * 0.32);
        const tx1 = Math.ceil(W * 0.68);
        const room = Math.min(tx0, W - tx1) - 1;
        const span = Math.max(1, Math.min(maxShift, room));
        // Proper zero-mean NCC: the mean of each window, not one mean for the
        // whole frame. A global mean makes the score drift with the shift, and
        // a score that drifts has a peak that is an artefact of the drift.
        let mA = 0, nA = 0;
        for (let y = 0; y < H; y += 2) {
          const row = y * W;
          for (let x = tx0; x < tx1; x += 2) { mA += A.g[row + x]; nA++; }
        }
        mA /= Math.max(1, nA);
        const score = (s) => {
          let mC = 0, n = 0;
          for (let y = 0; y < H; y += 2) {
            const row = y * W;
            for (let x = tx0; x < tx1; x += 2) { mC += C.g[row + x + s]; n++; }
          }
          mC /= Math.max(1, n);
          let num = 0, da = 0, dc = 0;
          for (let y = 0; y < H; y += 2) {
            const row = y * W;
            for (let x = tx0; x < tx1; x += 2) {
              const va = A.g[row + x] - mA, vc = C.g[row + x + s] - mC;
              num += va * vc; da += va * va; dc += vc * vc;
            }
          }
          return da > 0 && dc > 0 ? num / Math.sqrt(da * dc) : -2;
        };
        const all = [];
        let best = { shift: 0, ncc: -2 };
        let atZero = -2;
        for (let s = -span; s <= span; s++) {
          const ncc = score(s);
          all.push([s, ncc]);
          if (s === 0) atZero = ncc;
          if (ncc > best.ncc) best = { shift: s, ncc };
        }
        // A peak sitting ON the search boundary is not a peak, it is the edge of
        // the window: the true shift may be anywhere beyond it.
        if (Math.abs(best.shift) >= span) {
          return {
            shift: best.shift,
            ncc: Number(best.ncc.toFixed(4)),
            runnerUp: Number(best.ncc.toFixed(4)),
            atZero: Number(atZero.toFixed(4)),
            span,
            identical,
            error: `the best match is at the ±${span}px search limit — the turn is larger than this band can measure`,
          };
        }
        let runnerUp = -2;
        for (const [s, ncc] of all) {
          if (Math.abs(s - best.shift) >= guard && ncc > runnerUp) runnerUp = ncc;
        }
        return {
          shift: best.shift,
          ncc: Number(best.ncc.toFixed(4)),
          runnerUp: Number(runnerUp.toFixed(4)),
          // THE NUMBER THE VERDICT ACTUALLY RESTS ON — see the note on `sharp`
          // below. „Does the second photograph match the first BETTER when slid
          // than when not slid at all" is the question; this is the „not slid
          // at all" half of it.
          atZero: Number(atZero.toFixed(4)),
          span,
          identical,
        };
      },
      { a, c, maxShift: PROOF_MAX_SHIFT_PX, guard: PEAK_GUARD_PX },
    )
    .catch((e) => ({ error: String(e?.message ?? e).split("\n")[0] }));

/**
 * PUT THE CAR BACK ON THE SPAWN MARK — 2026-08-21, fourth draft, and this is
 * the change that turned the measurement from anecdote into evidence.
 *
 * WHAT THE THIRD DRAFT MEASURED. Six legs run one after another from wherever
 * the last one finished:
 *   nudge-ctl1  NET -215px  (a leg that PRESSED NOTHING, reporting 22° of turn)
 *   nudge-ctl2  NET  -70px  ncc 0.5702 against an unslid 0.2557
 *   nudge-right1        VOID: the best correlation is only 0.4275
 * By leg four the car had nudged itself six metres into a junction, collected
 * three teach cards and a fault, and the „scene" the correlation was comparing
 * had nothing to do with the one it started from. A control that reports a
 * bigger turn than the turn legs is not a noisy experiment, it is a broken one.
 *
 * The lesson always spawns at the same pose. So every leg gets its own spawn:
 * reload, walk the ladder, and take frame A from the mark. The control leg and
 * the two turn legs then differ in exactly one thing — the key — which is what
 * a control is for.
 *
 * IT COSTS ~35 s A LEG, and it is only spent in the opt-in proof mode, which
 * runs on one lane and drives no lesson.
 */
async function proofRespawn() {
  await steer(null);
  await throttle(false);
  await page.goto(`${BASE}/simulator?scenario=${SCENARIO}&level=1`, {
    waitUntil: "domcontentloaded",
    timeout: 300_000,
  }).catch(() => {});
  await page.waitForTimeout(22_000);
  // The ladder, in its cheapest form: the proof does not need the briefing, it
  // needs a world that is running. Anything that says «Разбрах»/«Продължи» is
  // pressed, then the pause drain takes whatever is left.
  for (let i = 0; i < 10; i++) {
    const pressed = await page
      .evaluate(() => {
        for (const el of document.querySelectorAll("button")) {
          const t = (el.textContent || "").trim();
          if (/^(Разбрах|РАЗБРАХ|Продължи|Затвори|Започни|Карай)/i.test(t)) { el.click(); return t; }
        }
        return null;
      })
      .catch(() => null);
    if (!pressed) break;
    await page.waitForTimeout(900);
  }
  await drainPause();
  await page.waitForTimeout(1200);
}

/** Coast to a standstill. NEVER the brake: a brake press at rest is the gesture
 *  that selects R (see brake()), and a probe that put the car in R would then
 *  measure a car reversing into its own evidence. */
async function proofRest() {
  await throttle(false);
  for (let i = 0; i < 22; i++) {
    await drainPause();
    const v = await speedNow();
    if (v <= 0) return v;
    await page.waitForTimeout(500);
  }
  return await speedNow();
}

/** One leg: rest, A, nudge with the wheel over, B, let go, rest, C.
 *  `dir` null = the control, which does the identical nudge and presses no key. */
async function proofLeg(band, name, dir, { nudge = true, respawn = false } = {}) {
  if (respawn) await proofRespawn();
  // A TEACH CARD FREEZES THE WORLD, AND A FROZEN WORLD IS NOT A STRAIGHT LINE.
  // Measured on the first run of this probe: every leg came back
  // `ncc 1 vs 0.7728`, i.e. two byte-identical bands, and the sharpness test
  // was HAPPY with it — a peak of 1.0 clears its runner-up by 0.23. So a paused
  // sim reported „0 px, and the measurement is sound", which is the exact
  // reassuring-direction failure this probe was written to catch, inside the
  // probe. Two answers: drain the pause before the bracket, and treat an
  // identical pair as VOID rather than as a zero.
  await drainPause();
  await proofRest();
  const v0 = await speedNow();
  const A = await proofGrab(band);
  // NUDGE, WITH THE WHEEL OVER. The throttle is pulsed rather than held so the
  // car covers about a metre; the wheel is over for the whole of it and comes
  // off before the coast-down, so the car does not keep turning while it stops.
  await steer(dir, v0);
  // ── HOW LONG THE WHEEL WAS ACTUALLY OVER, MEASURED — 2026-08-21, verifier ──
  //
  // The constants above (PROOF_HOLD_MS 900, PROOF_NUDGE_MS 700 + 200) are what
  // this leg INTENDS to hold for. They are not what it holds for: frame B is
  // grabbed with the key still down, and `proofGrab` is a real screenshot —
  // this file's own header measures one at 200 ms on mobile and 11,999 ms on
  // pc. MEASURED over two full proof runs, `steering.heldMs` came back 3,974 /
  // 3,547 ms and 4,056 / 4,414 ms against a nominal 2,700 ms per direction, so
  // every leg spends 30–60 % longer at the wheel than the comment claims, and
  // the overrun is whatever the box was doing at the time. That is why the same
  // probe measured a left turn at 225 px, at 470 px and past the ±600 px search
  // limit on three legs of the same scenario. Recorded per leg so the next
  // reader can see the dependence instead of assuming the constant.
  const wheelDownAt = Date.now();
  if (nudge) {
    for (let i = 0; i < PROOF_NUDGES; i++) {
      await throttle(true);
      await page.waitForTimeout(PROOF_NUDGE_MS);
      await throttle(false);
      await page.waitForTimeout(200);
    }
  } else {
    // THE CAMERA LEG. The wheel goes over and the car is never asked to move,
    // so anything the world does here is `COCKPIT_LOOK_INTO_TURN` and nothing
    // else. It is run FIRST, and its numbers are what stop the moving legs
    // below from being read as „the world moved, therefore the car turned".
    await page.waitForTimeout(PROOF_HOLD_MS);
  }
  const B = await proofGrab(band); // wheel still over: this frame carries the camera offset
  await steer(null);
  const wheelOverMs = dir === null ? 0 : Date.now() - wheelDownAt;
  await throttle(false);
  if (nudge) await proofRest();
  await page.waitForTimeout(PROOF_SETTLE_MS);
  const C = await proofGrab(band);
  const v1 = await speedNow();
  const held = await proofShift(A, B);
  const net = await proofShift(A, C);
  // THREE WAYS A LEG CAN FAIL TO BE A MEASUREMENT, and none of them is a zero:
  // the read threw, the two bands are byte-identical (nothing rendered — a
  // paused sim), or the correlation peak is too flat to name a shift.
  /* ── WHAT MAKES A SHIFT A MEASUREMENT — third calibration, 2026-08-21 ─────
   *
   * The obvious test — „the peak must clear its runner-up" — was tried and it
   * rejects almost everything, INCLUDING legs that plainly turned:
   *   nudge-left2  229px  ncc 0.9277 vs runner-up 0.9273   → void
   *   nudge-right2 192px  ncc 0.9467 vs runner-up 0.9465   → void
   * Half this band is sky and tarmac, so sliding a recognised match by another
   * 25 px barely changes the score. The correlation surface is SMOOTH near its
   * peak, and smoothness is not ambiguity.
   *
   * The question that is actually being asked is not „where exactly is the
   * peak" — it is „did the world move AT ALL". So the comparison is against
   * SHIFT ZERO: a leg claims a turn only when the second photograph matches the
   * first better SLID than UNSLID, by a clear margin. A leg whose peak sits
   * within the noise band of zero needs no such justification, because it is
   * not claiming anything.
   *
   * It also fixes the straight legs for free. A pure forward translation
   * expands the scene about the vanishing point instead of sliding it, so
   * `score(0)` is already the best score there is — and such a leg now reads
   * „no turn" instead of „unmeasurable".
   */
  const voidWhy = (r) =>
    r.error
      ? r.error
      : r.identical
        ? "the two frames are byte-identical — the world did not render, so this leg measures a PAUSED SIM and not a heading"
        : r.ncc < 0.5
          ? `the best correlation is only ${r.ncc} — the scene changed too much to recognise`
          : Math.abs(r.shift) <= PROOF_NOISE_PX
            ? null
            : r.ncc - r.atZero < PEAK_MARGIN
              ? `sliding by ${r.shift}px (ncc ${r.ncc}) is no better than not sliding at all (ncc ${r.atZero}) — this is not a rotation`
              : null;
  const why = voidWhy(net);
  const leg = {
    name,
    dir,
    kmhBefore: v0,
    kmhAfter: v1,
    /** ACTUAL key-down time, not the constant this leg asked for — see above. */
    wheelOverMs,
    wheelOverNominalMs: dir === null ? 0 : nudge ? PROOF_NUDGES * (PROOF_NUDGE_MS + 200) : PROOF_HOLD_MS,
    held,
    net,
    netIsSharp: why === null,
    voidBecause: why,
    netDeg: net.error ? null : Number((net.shift * band.degPerPx).toFixed(1)),
    heldDeg: held.error ? null : Number((held.shift * band.degPerPx).toFixed(1)),
  };
  note(
    `      ${name.padEnd(11)} ${String(dir ?? "straight").padEnd(8)} ${String(v0).padStart(3)}->${String(v1).padStart(3)} км/ч · ` +
      `HELD ${held.error ? held.error : `${String(held.shift).padStart(4)}px ≈${String(leg.heldDeg).padStart(6)}°`} · ` +
      `NET ${net.error ? net.error : `${String(net.shift).padStart(4)}px ≈${String(leg.netDeg).padStart(6)}° (ncc ${net.ncc}, unslid ${net.atZero})`}` +
      `${why === null ? "" : `  ← VOID: ${why}`}`,
  );
  return leg;
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[(s.length - 1) >> 1];
};

/**
 * Run it, assert it, write it down. Returns the block that goes in
 * `_audit-steering.json` and in `steering.probe`.
 */
async function steerProof() {
  const band = await proofBand();
  if (band === null) {
    loud("the steering proof cannot run: there is no scene canvas to photograph.");
    return { ran: false, why: "no scene canvas" };
  }
  note(
    `  STEERING PROOF: band ${band.clip.width}×${band.clip.height} CSS px at ${band.clip.x},${band.clip.y} · dpr ${band.dpr} · ` +
      `every px below is a DEVICE px ≈ ${band.degPerPx.toFixed(4)}° at the centre`,
  );

  // ── PART 1: THE CAMERA, NAMED BEFORE IT CAN BE MISTAKEN FOR THE CAR ──────
  await throttle(false);
  for (let i = 0; i < 25; i++) {
    await drainPause();
    if ((await speedNow()) <= 0) break;
    await page.waitForTimeout(700);
  }
  note(`    at rest, WHEEL ONLY (the car is never asked to move — anything here is the CAMERA):`);
  const rest = [];
  for (const [n, d] of [["rest-ctl", null], ["rest-left", "left"], ["rest-right", "right"]]) {
    rest.push(await proofLeg(band, n, d, { nudge: false }));
  }

  // ── PART 2: THE HEADING ─────────────────────────────────────────────────
  note(`    and with a nudge — RESPAWNED, stopped, ${PROOF_NUDGES}×${PROOF_NUDGE_MS}ms of throttle, stopped again; only the key differs:`);
  const move = [];
  for (const [n, d] of [
    ["nudge-ctl1", null],
    ["nudge-left1", "left"],
    ["nudge-right1", "right"],
    ["nudge-ctl2", null],
    ["nudge-left2", "left"],
    ["nudge-right2", "right"],
  ]) {
    move.push(await proofLeg(band, n, d, { respawn: true }));
  }
  await steerRelease();
  await throttle(false);

  const sharpNet = (legs, dir) =>
    legs.filter((l) => l.dir === dir && l.netIsSharp).map((l) => l.net.shift);
  const restLeft = sharpNet(rest, "left");
  const restRight = sharpNet(rest, "right");
  const mLeft = median(sharpNet(move, "left"));
  const mRight = median(sharpNet(move, "right"));
  const mCtl = median(sharpNet(move, null));

  const checks = [];
  const check = (name, ok, said) => { checks.push({ name, ok, said }); return ok; };
  // 1. THE CAMERA CHECK. At rest the wheel must move the world and put it back.
  //    If this one ever FAILS the way round it cannot fail today — i.e. if a
  //    standstill steer starts producing a lasting rotation — then either the
  //    car pivots on the spot or this probe is measuring something else, and
  //    the moving numbers below stop meaning what they say.
  // ── …AND IT MAY NOT PASS ON HAVING SEEN NOTHING — 2026-08-21, verifier ────
  //
  // `[].every(...)` is `true`, and so was this check on a run where the wheel
  // did nothing at a standstill at all. MEASURED, run B of two: rest-ctl HELD
  // 0 px, rest-left HELD +14 px, rest-right HELD −5 px — no look-into-turn
  // anywhere, i.e. the standstill legs observed NOTHING — and this check
  // printed PASS on three NET zeros. An inert page, a swallowed keystroke and a
  // sim that ignores input while a card is up all produce exactly that reading,
  // and all three would be certified by it. (Run A, fifteen minutes earlier on
  // the same build, read rest-right HELD −150 px ≈ −5.2°, which IS the product's
  // COCKPIT_LOOK_INTO_TURN — so the offset is real and this probe sees it only
  // sometimes.) The check now carries its own positive control: at least one
  // standstill leg must have MOVED THE WORLD while the key was down before the
  // fact that it came back can mean anything. With no such leg it is UNMEASURED,
  // and unmeasured is not a pass.
  const restHeldPeak = Math.max(
    0,
    ...rest.filter((l) => l.dir !== null && !l.held?.error).map((l) => Math.abs(l.held.shift)),
  );
  const restSaw = restHeldPeak >= PROOF_MIN_PX && restLeft.length + restRight.length > 0;
  check(
    "a standstill steer leaves the heading where it found it",
    restSaw && [...restLeft, ...restRight].every((px) => Math.abs(px) <= PROOF_NOISE_PX),
    restSaw
      ? `rest NET: left ${restLeft.join(",") || "(void)"} px · right ${restRight.join(",") || "(void)"} px ` +
        `(and the wheel DID move the world while held — peak ${restHeldPeak} px)`
      : `UNMEASURED — no standstill leg moved the world while the key was down (peak HELD ${restHeldPeak} px < ${PROOF_MIN_PX} px), ` +
        `so «it came back» is a statement about a wheel nothing answered. rest NET: left ${restLeft.join(",") || "(void)"} px · ` +
        `right ${restRight.join(",") || "(void)"} px`,
  );
  // 2. THE CONTROL. A leg that pressed nothing must not report a turn — and a
  //    control leg with NO sharp peak passes, which is not a loophole: a pure
  //    forward translation has no unique horizontal shift (the scene expands
  //    about the vanishing point instead of sliding), so a FLAT correlation is
  //    the expected signature of driving straight. The asymmetry runs the safe
  //    way — a flat TURN leg is void and proves nothing, a sharp STRAIGHT leg
  //    fails this check.
  check(
    "a leg that presses nothing does not turn",
    mCtl === null || Math.abs(mCtl) <= PROOF_NOISE_PX,
    `straight NET median ${mCtl === null ? "(flat correlation — the signature of no rotation)" : `${mCtl} px`}`,
  );
  // 3. THE CLAIM ITSELF — signed, and in the direction physics requires: KeyA
  //    turns the car LEFT, so the world must move RIGHT (a POSITIVE shift), and
  //    KeyD the other way. A channel wired to the wrong key would still move
  //    the world; only the SIGN catches that.
  check(
    "KeyA turns the car LEFT (the world moves right)",
    mLeft !== null && mLeft >= PROOF_MIN_PX,
    `left NET median ${mLeft === null ? "(no sharp measurement)" : `${mLeft} px ≈ ${(mLeft * band.degPerPx).toFixed(1)}°`}`,
  );
  check(
    "KeyD turns the car RIGHT (the world moves left)",
    mRight !== null && mRight <= -PROOF_MIN_PX,
    `right NET median ${mRight === null ? "(no sharp measurement)" : `${mRight} px ≈ ${(mRight * band.degPerPx).toFixed(1)}°`}`,
  );

  const passed = checks.every((c) => c.ok);
  for (const c of checks) note(`    ${c.ok ? "PASS" : "FAIL"}  ${c.name} — ${c.said}`);
  if (!passed) {
    loud(
      `THE STEERING CHANNEL DID NOT PROVE ITSELF. ${checks.filter((c) => !c.ok).map((c) => c.name).join("; ")}. ` +
        `Until this passes, nothing this harness does with KeyA/KeyD may be described as a turn.`,
    );
  } else {
    note(`  STEERING PROVEN: the world rotates one way on KeyA and the other on KeyD, and stays rotated after the key is released.`);
  }
  return {
    ran: true,
    passed,
    checks,
    thresholds: { PROOF_MIN_PX, PROOF_NOISE_PX, PEAK_MARGIN, PEAK_GUARD_PX, STEER_MIN_KMH },
    band: { ...band.clip, degPerPx: band.degPerPx },
    rest,
    move,
    medians: { left: mLeft, right: mRight, straight: mCtl },
  };
}

/* ===========================================================================
 * THE CHANNEL LIVENESS CHECK — 2026-08-21, ROUND 3
 * ===========================================================================
 *
 * THE DEFECT THIS CLOSES, AND IT IS THE PROGRAMME'S OWN SHAPE ONE LEVEL UP.
 * Round 2 built the steering channel and proved it with `KNIJKA_STEER_PROOF=1`
 * — a mode that runs INSTEAD of the drive. So the capability was proven in a
 * mode no wave runs, and on an ordinary drive lane A BROKEN CHANNEL SAID
 * NOTHING AT ALL. That is precisely the conflation that hid the missing wheel
 * for 376 drives and 1,712 findings: a capability that fails quietly is
 * indistinguishable from a capability that was never needed.
 *
 * ── WHAT IT MEASURES, AND WHAT IT IS FORBIDDEN TO CLAIM ────────────────────
 *
 * IT MEASURES THE CAMERA. IT DOES NOT MEASURE A TURN. Read that twice, because
 * round 2's own header calls the A→B camera measurement „the reassuring-
 * direction trap this whole programme is about" — and it is, FOR A HEADING
 * CLAIM. This check makes no heading claim. It asks the one question a drive
 * lane can afford to ask 376 times:
 *
 *      DID THE KEYSTROKE REACH THE PRODUCT AT ALL?
 *
 * `CameraRig.tsx` yaws the head by `steerNorm * COCKPIT_LOOK_INTO_TURN`, where
 * `steerNorm` is `VehicleSim.steer / STEER_MAX_ANGLE` — the DRIVELINE'S OWN
 * WHEEL ANGLE, not the raw key. So a world that leans has carried the keystroke
 * all the way through `input.ts` → `difficulty.ts` smoothing → `VehicleSim`'s
 * steer integrator → the camera. A world that does not lean means the key went
 * nowhere. Neither answer says anything about whether the CAR would have
 * turned; only `steerProof()` may say that, and it costs ~35 s a leg.
 *
 * ── WHY IT IS FREE OF SIDE EFFECTS, WHICH IS THE WHOLE REASON IT CAN RUN ───
 *
 * It runs at the SPAWN MARK, before the drive loop, with the car at 0 км/ч and
 * NO PEDAL DOWN. Round 2 measured this exact gesture: at rest, KeyA held moves
 * the world +156 px and releasing it puts the world back EXACTLY where it was —
 * NET 0 px at ncc 0.999. The car does not move. The trace that follows is the
 * same trace it would have been, which is the constraint that rules out the
 * other repair anyone would reach for: making the drive steer is a DESIGN
 * question, and a drive that steers badly manufactures confident wrong findings
 * where one that cannot steer leaves honest silence.
 *
 * ── AND IT IS CHEAP, BECAUSE IT HAS TO BE ──────────────────────────────────
 *
 * Two clipped grabs and one correlation per direction, once per lane, against a
 * DRIVE_BUDGET_MS of 210 s. The measured cost is published per lane in
 * `steering.channel.costMs` rather than asserted here — a constant in a comment
 * is the kind of claim this programme keeps catching.
 *
 * ── THE FOUR HONEST WAYS IT CAN DECLINE TO ANSWER ──────────────────────────
 *
 * All four report "untested", never "dead", because a check that cannot run is
 * not evidence that the channel is broken — that would be this programme's
 * favourite bug pointed the other way:
 *   · no scene canvas to photograph;
 *   · the camera is not the cockpit (`html[data-sim-camera]`) — the look-into-
 *     turn yaw lives in the cockpit branch of `CameraRig` and nowhere else, so
 *     a chase camera would read „dead" on a perfectly live channel;
 *   · the car is not at a true standstill, or a pedal is down — the gesture
 *     would perturb the drive it is supposed to leave alone;
 *   · the two bands come back byte-identical, i.e. the world did not render at
 *     all (a paused sim), which round 2 measured reading as a confident zero.
 */
/** Long enough for `VehicleSim`'s steer integrator to reach the stop — round 2
 *  measured the full ±5.16° at this hold, at rest, on this rig. */
const LIVE_HOLD_MS = 900;
/** …and long enough afterwards for the yaw to come home before the next leg,
 *  so the second direction starts from centre and not from the first one's
 *  offset. `COCKPIT_ROT_DAMPING` settles well inside this. */
const LIVE_SETTLE_MS = 700;
/**
 * THE FLOOR, AND IT IS AN ANGLE — BECAUSE A PIXEL IS NOT A FIXED QUANTITY.
 *
 * WHAT ROUND 3 MEASURED, AND IT IS RIGHT AS FAR AS IT GOES. At rest, three
 * runs: control (no key) HELD 0 px every time; KeyA HELD +156…+158 px; KeyD
 * HELD −151…−152 px. So the live signal is ~155 px and the dead signal is 0 px,
 * with nothing whatsoever in between, and 40 px — round 2's own
 * `PROOF_NOISE_PX` — sat a factor of ~3.9 under the smallest live reading.
 *
 * EVERY ONE OF THOSE RUNS WAS `mobile`. All eleven lanes round 3 measured were
 * iphone16-landscape and ten of them were the same scenario. The constant then
 * went into an instrument that runs on 376 lanes, 196 of which are the pc leg.
 *
 * MEASURED ON THAT OTHER HALF, 2026-08-21, sc-junction-scan/pc/right against
 * the same server, unmutated: the SAME gesture and the same product constant,
 * and the world moved **+70 px / −69 px**. Nothing about the channel differs —
 * both legs read 5.3°. The RULER differs: the pc leg is 1440×900 at
 * deviceScaleFactor 1 with a 933 px band, the phone is 682 CSS px at dpr 3.
 *
 * So one number meant two thresholds. 40 px is 1.39° on the phone and 3.04° on
 * the desktop — 59 % of the product's entire ±5.16° `COCKPIT_LOOK_INTO_TURN`.
 * On 196 lanes the check was demanding that the world lean nearly all the way
 * over before it would call the channel live, and anything that shaved the
 * reading — a narrower canvas, a peak one bucket off — would have been
 * convicted with the loud refusal that voids every position, lane and turning
 * finding on the lane. A FALSE REFUSAL IS AS DAMAGING AS A FALSE CERTIFICATE,
 * and this one would have been indistinguishable from the defect it hunts.
 *
 * The angle is the thing being measured and it does not move with the viewport,
 * so the floor is stated in degrees. 1.4° is the mobile floor's own value to two
 * figures — the phone behaves exactly as it did — and it is 27 % of the full
 * lean, which is the factor of ~3.7 the original reasoning asked for, now on
 * both platforms instead of one. — adversarial verification, 2026-08-21
 */
const LIVE_MIN_DEG = 1.4;
/** The lean a LIVE channel produces, from the product's own constant
 *  (`vehicle/tuning.ts` COCKPIT_LOOK_INTO_TURN = 0.09 rad). Verdicts quote the
 *  pixel equivalent FOR THE BAND THEY ARE JUDGING, because "a live channel
 *  measured ~155 px on this same gesture" is simply false on a pc lane, where
 *  live was measured at 70. */
const LIVE_FULL_DEG = (0.09 * 180) / Math.PI;
const expectedLivePx = (band) => Math.round(LIVE_FULL_DEG / band.degPerPx);

/**
 * Hold one direction at the spawn mark and photograph what the world does.
 * Returns a leg; `moved` is the only judgement it makes.
 */
async function livenessLeg(band, dir) {
  const A = await proofGrab(band);
  await steer(dir, 0, "liveness");
  const down = Date.now();
  await page.waitForTimeout(LIVE_HOLD_MS);
  // FRAME B IS TAKEN WITH THE KEY STILL DOWN, ON PURPOSE AND AGAINST ROUND 2'S
  // RULE, because this is the opposite question. Round 2 forbids A→B for a
  // HEADING claim precisely because the offset it captures is the camera's; a
  // liveness check wants exactly that offset and nothing else.
  const B = await proofGrab(band);
  const heldMs = Date.now() - down;
  await steer(null, null, "liveness");
  const shift = await proofShift(A, B);
  const px = shift.error ? null : shift.shift;
  return {
    dir,
    heldMs,
    px,
    deg: px === null ? null : Number((px * band.degPerPx).toFixed(1)),
    ncc: shift.ncc ?? null,
    atZero: shift.atZero ?? null,
    identical: shift.identical ?? null,
    error: shift.error ?? null,
    // The sign is checked as well as the magnitude: KeyA leans the head LEFT so
    // the band slides RIGHT (a positive shift). A channel cross-wired to the
    // wrong key would move the world and fail here, which is the one thing a
    // bare magnitude test cannot catch.
    // The floor is applied to the ANGLE (see LIVE_MIN_DEG) and the sign to the
    // pixels, which is the split that keeps this honest on both platforms.
    moved:
      px !== null &&
      !shift.identical &&
      Math.abs(px * band.degPerPx) >= LIVE_MIN_DEG &&
      (dir === "left" ? px > 0 : px < 0),
  };
}

/**
 * The check, its three states, and its refusal. Called once, at the spawn mark.
 * Returns nothing — everything it learns goes into `steering.channel`, which is
 * published on every lane whatever happens here.
 */
async function steerLiveness() {
  const ch = steering.channel;
  ch.attempts += 1;
  const startedAt = Date.now();
  const settle = (state, why) => {
    ch.state = state;
    ch.why = why;
    ch.costMs = Date.now() - startedAt;
  };

  const cam = await page
    .evaluate(() => ({
      camera: document.documentElement.getAttribute("data-sim-camera"),
      kmh: (() => {
        const sp = document.querySelector('[aria-label^="Скорост "]');
        return sp ? Number((sp.getAttribute("aria-label").match(/Скорост (\d+)/) || [0, -1])[1]) : -1;
      })(),
    }))
    .catch(() => null);
  if (cam === null) return settle("untested", "the page could not be read at all");
  ch.camera = cam.camera;
  ch.kmhAtCheck = cam.kmh;
  if (cam.camera !== "cockpit") {
    return settle(
      "untested",
      `the camera is «${cam.camera ?? "(unset)"}», not «cockpit» — the look-into-turn yaw this check reads lives only in ` +
        `CameraRig's cockpit branch, so a lean of 0 px here would mean nothing about the channel`,
    );
  }
  if (cam.kmh !== 0 || holdW || holdS) {
    return settle(
      "untested",
      `the car is not parked and idle (${cam.kmh} км/ч, throttle ${holdW ? "DOWN" : "up"}, brake ${holdS ? "DOWN" : "up"}) — ` +
        `turning the wheel here would move the car and change the drive this lane is supposed to measure`,
    );
  }
  const band = await proofBand();
  if (band === null) return settle("untested", "there is no scene canvas to photograph");
  ch.band = { ...band.clip, degPerPx: Number(band.degPerPx.toFixed(5)) };

  // A GRAB THAT THROWS MUST NOT KILL THE DRIVE. `proofGrab` is a raw
  // `page.screenshot` with no catch, and this harness lost 333 frames and 54
  // whole lanes to screenshots that failed — which is exactly why `shot()`
  // reads its files back. In the opt-in proof mode a throw here ended a lane
  // that was only ever about the instrument. On the ordinary drive path it
  // reaches the crash guard at the top of this file and ends a LESSON lane
  // before it has driven a metre. An instrument check may report that it could
  // not run; it may not take the drive with it.
  try {
    ch.legs.push(await livenessLeg(band, "left"));
    await page.waitForTimeout(LIVE_SETTLE_MS);
    ch.legs.push(await livenessLeg(band, "right"));
  } catch (error) {
    return settle(
      "untested",
      `the check itself failed after ${ch.legs.length} of 2 legs: ${String(error?.message ?? error).split("\n")[0]}`,
    );
  }

  for (const l of ch.legs) {
    note(
      `      wheel ${String(l.dir).padEnd(5)} held ${String(l.heldMs).padStart(4)} ms · world ` +
        `${l.error ? l.error : `${String(l.px).padStart(4)} px ≈${String(l.deg).padStart(6)}° (ncc ${l.ncc}, unslid ${l.atZero})`}` +
        `${l.identical ? "  ← the two frames are byte-identical" : ""}`,
    );
  }

  // A FROZEN WORLD IS NOT A DEAD CHANNEL. Round 2 measured a paused sim reading
  // ncc 1.0 and PASSING a sharpness test: two byte-identical bands are a
  // confident zero, and a confident zero here would convict a live channel.
  if (ch.legs.some((l) => l.identical)) {
    return settle("untested", "the two photographs are byte-identical — the world did not render, so this measures a PAUSED SIM and not a channel");
  }
  // …AND NEITHER IS ONE LEG THAT COULD NOT BE CORRELATED. This was `every`, so
  // a SINGLE failed leg fell straight through to the only verdict left below,
  // which is "dead" — an accusation that voids every position, lane and turning
  // finding on the lane, reached on half the evidence. Worse, one of the errors
  // it can fall through on is "the best match is at the ±600px search limit",
  // which means the world moved MORE than the window could measure: the loudest
  // possible sign of a LIVE channel, scored as a leg that did not move.
  const failed = ch.legs.filter((l) => l.error !== null);
  if (failed.length) {
    return settle(
      "untested",
      `${failed.length === ch.legs.length ? "neither band" : `the ${failed[0].dir} band`} could be correlated ` +
        `(${failed.map((l) => `${l.dir}: ${l.error}`).join("; ")}) — a leg that measured nothing is not a leg that measured zero`,
    );
  }
  if (ch.legs.every((l) => l.moved)) {
    return settle(
      "live",
      `the wheel went over and the world answered — ${ch.legs.map((l) => `${l.dir} ${l.px} px ≈${l.deg}°`).join(", ")}, ` +
        `against a floor of ${LIVE_MIN_DEG}° (${Math.round(LIVE_MIN_DEG / band.degPerPx)} px in this lane's band; a full lean is ` +
        `${LIVE_FULL_DEG.toFixed(1)}° ≈ ${expectedLivePx(band)} px here)`,
    );
  }
  return settle(
    "dead",
    `${ch.legs.filter((l) => !l.moved).map((l) => `${l.dir} (${STEER_KEYS[l.dir]}) moved the world ${l.px} px ≈${l.deg}°`).join("; ")} ` +
      `— the floor is ${LIVE_MIN_DEG}° (${Math.round(LIVE_MIN_DEG / band.degPerPx)} px in this lane's band) and a live channel ` +
      `leans the full ${LIVE_FULL_DEG.toFixed(1)}° ≈ ${expectedLivePx(band)} px here`,
  );
}

/* ===========================================================================
 * THE REVERSE GESTURE — 2026-08-21
 * ===========================================================================
 *
 * WHAT THE GUARD ABOVE COST, STATED FOR THE FIRST TIME. The refusal is right
 * and it stays. But the gesture it refuses — stop, lift, press — is the ONLY
 * route into R this harness has (engine/reverseAssist.ts; there is no `[`/`]`,
 * no touch gear sheet, no cockpit lever here), so refusing it everywhere made
 * the instrument STRUCTURALLY INCAPABLE of driving the reverse half of a
 * manoeuvre. Nobody wrote that down, and the consequence was measured only
 * after 376 drives had been adjudicated:
 *
 *   sc-park-45-rev, whose task 2 is literally «влез на заден ход по линиите»,
 *   reads D in the cluster at EVERY sampled frame on BOTH platforms, through
 *   05-stopped and 07-end. Every verdict ever recorded on a reversing lesson
 *   describes the approach and nothing else — 19 lessons, 118 findings, 46 of
 *   them critical, all of them about a manoeuvre that never happened.
 *
 * So the refusal keeps the STOP phase honest and this block gives the drive a
 * DELIBERATE way to ask for reverse, which is exactly what the engine file's
 * own 2026-08-19 note asks for: „stop, lift for > REVERSE_ASSIST_LIFT_S,
 * press — issued only where the lesson asks for R".
 *
 * FOUR PROPERTIES, AND EACH ONE ANSWERS A WAY THIS COULD LIE:
 *
 *  1. IT IS ISSUED ONLY WHERE THE PRODUCT ASKS FOR R, and "asks" is read off
 *     the product's own two mechanisms rather than off a scenario id — see
 *     REVERSE_DEMAND_* below. A harness that shifted to R on every lesson
 *     would be inventing a manoeuvre the exam never asked for, and would
 *     convict correct lessons of a fault the driver caused.
 *  2. IT ASSERTS THE TRANSITION BY READING THE CLUSTER before one metre is
 *     driven. „I sent the keys" is not „the car is in R" — that confusion is
 *     the whole of this task. The letter comes from StatusDashboard's own
 *     `aria-label={`Скоростен лост: ${snap.gearLabel}`}`, the driveline truth.
 *  3. IT DISARMS. The pedals SWAP in R (rule b): S accelerates backwards and W
 *     brakes. A drive that ended still in R would hand the following stop
 *     phase a control law whose every pedal means the opposite thing, and the
 *     brake-at-rest guard above would then be guarding the wrong pedal.
 *  4. IT SHOUTS AND IT RECORDS. `_audit-status.json` carries `reverse`, and a
 *     lesson that demanded R and never got it is the loudest line in the run —
 *     because a reversing lesson that silently never reversed is precisely the
 *     failure that produced this block.
 *
 * AND THE SPEED READOUT CANNOT SEE DIRECTION. `displaySpeedKmh` is
 * `Math.max(0, Math.round(Math.abs(v)))` (hud/dashboardStatus.ts) — the dial
 * shows a reversing car a positive number. The gear letter is the ONLY
 * direction evidence on the glass, which is why this block reads it and why
 * every reverse frame it takes is named for what the cluster said.
 */

/** The product's own two ways of saying „this task needs R", and nothing else.
 *
 *  · `deriveGearDemand` (lessons/objectives.ts) turns a reachZone banner title
 *    into a REVERSE demand with exactly this matcher — «НА заден ход» is the
 *    act. Its companion exclusion is below, and it is not decoration:
 *    «Заеми изходната позиция ЗА заден ход по права» (sc-edpc-setup) is a gate
 *    the car noses into FACING FORWARD, and demanding R there would refuse a
 *    correct drive, which is the failure the founder ranks worst.
 *  · `advisorPromptForObjective` (lessons/advisor.ts) prints this exact stem
 *    for a `parkInBay` whose entry is not "forward".
 *
 *  Two product mechanisms, zero lesson strings — the same rule LAWFUL_WAIT_RE
 *  is written under. */
const REVERSE_DEMAND_RE = /(?<![\p{L}])на заден ход(?![\p{L}])|Премести лоста на R/u;
const REVERSE_DEMAND_PURPOSE_RE = /за заден ход/u;
/**
 * …AND A SEPARATE, LOOSER TEST FOR STAYING IN IT. Entering R is a decision the
 * harness must never invent, so it is gated on the product's own demand above.
 * Coming OUT of R in the middle of a manoeuvre needs no such licence — it needs
 * only the absence of a reason to stay — and the strict matcher is too narrow
 * for that job by the product's own authoring.
 *
 * MEASURED on sc-ed-reverse-line/mobile-right, which is why this exists. Its
 * three gates are, in order:
 *   1 «Потегли с оглед и заеми изходната позиция»          forward
 *   2 «Дръж права линия по средата НА ЗАДЕН ХОД»           strict match → R
 *   3 «Спри след 25 метра ЗАДЕН ХОД до бордюра»            NO «на» → no match
 * Gate 3 is the end of the same 25 m reverse, and with only the strict test the
 * drive shifted back to D between gates 2 and 3 and then drove FORWARD for the
 * remaining 190 s of its budget — leaving the run one objective short of a
 * completed lesson and the reverse half of gate 3 untested all over again.
 *
 * Two thresholds, therefore, and the asymmetry is deliberate: a false ENTRY
 * invents a manoeuvre, a false EXIT abandons one. `REVERSE_MS` still bounds it,
 * the cluster is still re-read every tick, and the disarm still runs. */
const REVERSE_STAY_RE = /заден ход|назад/u;
/** …read off the two surfaces that carry the CURRENT task and nothing else.
 *  Scope is the whole point: sc-park-45-rev's task 1 («спри в изходната
 *  позиция край косия ред») and task 2 («влез на заден ход по линиите») are
 *  both in the debrief's objective list and both in the briefing sheet, so a
 *  match against the shell's innerText would select R during the APPROACH —
 *  and a car that reverses away from task 1 fails task 1. `ObjectiveBanner`
 *  publishes only the live objective; `AdvisorCard` only the next action. */
const REVERSE_DEMAND_SEL =
  '[data-hud="objective-banner"], [role="status"][aria-label="Съветник — следващо действие"]';

/**
 * THE SAME QUESTION, ASKED ON ITS OWN — because something ELEVEN HUNDRED LINES
 * ABOVE `probe()` has to know the answer, and `probe()` does not exist yet.
 *
 * WHY THERE IS A SECOND COPY OF THIS TEST AT ALL. `probe()` folds the demand
 * into the drive loop's one big `evaluate` on purpose: a second round trip
 * costs ~2.0 s on the `pc` leg and the loop asks this question twice a second.
 * That argument is about the LOOP. This helper is called EXACTLY ONCE per run,
 * before the positive control, so it buys the answer for one round trip on the
 * whole drive — and the loop's copy is left untouched rather than refactored,
 * because a shared helper would have to be hoisted above `probe()` and would
 * put a network hop back inside the hot path to save a duplicated regex.
 *
 * IT IS THE SAME PREDICATE, DELIBERATELY: same two named surfaces
 * (REVERSE_DEMAND_SEL), same purpose-before-act ordering that keeps «заеми
 * изходната позиция ЗА заден ход» — a gate the car noses into FACING FORWARD —
 * from being read as a demand for R. If the two ever drift, the drive loop
 * would arm reverse on a lesson this helper let the harness press forward on,
 * which is precisely the contradiction it exists to prevent; the shared
 * sources (`REVERSE_DEMAND_RE.source`, `REVERSE_DEMAND_PURPOSE_RE.source`) are
 * what make drift impossible without editing the regex both copies read.
 *
 * Returns the MATCHED SENTENCE, not a boolean, for the same reason
 * `lawfulWait` does: the line that refuses to press forward has to be able to
 * quote the task that refused it.
 */
const reverseDemand = () =>
  page
    .evaluate(
      ({ revSel, revSrc, revPurposeSrc }) => {
        let t = "";
        for (const el of document.querySelectorAll(revSel)) {
          t += `${(el.innerText || "").replace(/\s+/g, " ").trim()}\n`;
        }
        if (!t.trim()) return null;
        const act = new RegExp(revSrc, "u");
        const purpose = new RegExp(revPurposeSrc, "u");
        if (purpose.test(t) && !act.test(t)) return null;
        const m = t.match(act);
        return m ? m[0] : null;
      },
      {
        revSel: REVERSE_DEMAND_SEL,
        revSrc: REVERSE_DEMAND_RE.source,
        revPurposeSrc: REVERSE_DEMAND_PURPOSE_RE.source,
      },
    )
    // A banner that is not on the glass yet is NOT "this lesson drives
    // forward" — but it is also not a demand for R, and the caller's fallback
    // for `null` is the forward press it has always made. Said here rather
    // than left to the reader of a bare `.catch(() => null)`.
    .catch(() => null);

/** THE CLUSTER'S OWN LETTER — P · R · N · D · M2. Empty when no instrument is
 *  on the glass at all, which is a different answer from "D" and is reported
 *  as one. Every painted owner is read, not just the first: StatusDashboard
 *  renders one of two layouts and the touch gear sheet renders a third cell,
 *  and if they ever disagree the harness must say so rather than pick.
 *
 *  The handle is StatusDashboard's own `aria-label={`Скоростен лост:
 *  ${snap.gearLabel}`}`, and `gearLabel` is `driveline.selector` verbatim
 *  (vehicle/driveline.ts) — the DRIVELINE's truth, not a HUD's opinion of it.
 *
 *  ── AND THERE IS NO RECT TEST, BECAUSE THE FIRST VERSION HAD ONE ──────────
 *
 *  It filtered `r.width < 4 || r.height < 4`, copied from `read()`'s HUD scan,
 *  and it reported «(no cluster)» for a whole 210 s drive. MEASURED on the
 *  live rig (WebKit, iphone16-landscape, sc-ed-reverse-line@L1) by dumping the
 *  element and its box together:
 *
 *    <span aria-label="Скоростен лост: D" …>D</span>        rect 0 × 0
 *    <span aria-label="Скорост 0 километра в час" …>0</span> rect 0 × 0
 *    parent [data-hud="status-dashboard"]                    rect 217 × 24
 *
 *  The letter is PAINTED and legible in the frame; it is the inline children of
 *  the baseline-aligned dash row that report an empty box. The harness's own
 *  speed probe has always been right about this by accident — it reads the
 *  ATTRIBUTE and never measures anything — and a rect test would have made this
 *  helper answer "the instrument cannot see the gear" about an instrument that
 *  was on screen the whole time. That is the reassuring direction, so it is
 *  gone: everything matching is read, and a DISAGREEMENT between two owners is
 *  reported (`gearLine`) rather than silently resolved by picking one. */
const GEAR_SEL = '[aria-label^="Скоростен лост: "]';
const gear = () =>
  page
    .evaluate((sel) => {
      const shell = document.querySelector("[data-sim-shell]") ?? document.body;
      const seen = [];
      for (const el of shell.querySelectorAll(sel)) {
        const v = el.getAttribute("aria-label").replace(/^Скоростен лост:\s*/, "").trim();
        if (v && !seen.includes(v)) seen.push(v);
      }
      return seen;
    }, GEAR_SEL)
    .catch(() => []);

/** One string for the log, and it never hides a disagreement. */
const gearLine = (g) => (g.length === 0 ? "(no cluster)" : g.join("/"));

/** THE SPEED AND NOTHING ELSE. `read()` is an innerText scan measured at 2.0 s
 *  on the `pc` leg, and the arming sequence has to re-check "is the car still
 *  stopped?" three times per attempt — paying six seconds for three numbers
 *  would make the lift itself the reason the car crept. One attribute read. */
const speedNow = () =>
  page
    .evaluate(() => {
      const sp = document.querySelector('[aria-label^="Скорост "]');
      return sp ? Number((sp.getAttribute("aria-label").match(/Скорост (\d+)/) || [0, -1])[1]) : -1;
    })
    .catch(() => -1);

/**
 * IS THE SESSION OVER? — the third answer `speedNow()` can give.
 *
 * `-1` means the speed readout is NOT IN THE DOM, and after a session ends
 * that is the ordinary case: the HUD unmounts with the scene. The first
 * version of the disarm read `-1` as a speed and printed
 *
 *     !! the car would not come to rest in R (-1 км/ч on the reverse brake)
 *
 * on a drive that had just finished its reverse, completed every objective and
 * passed the lesson ИЗДЪРЖАН / 3 stars. A false failure and a false pass are
 * the same crime, and that one was pointed at the instrument's own new code.
 * So "gone" is answered separately, from the same three end surfaces the drive
 * loop already trusts.
 */
const endSurfaceUp = () =>
  page
    .evaluate(
      () =>
        document.querySelector('[data-hud="end-screen"]') !== null ||
        document.querySelector('[data-hud="end-bar"]') !== null ||
        document.querySelector('[data-sim-overlay="end"]') !== null,
    )
    .catch(() => false);

/**
 * THE PRESS brake() MAY NOT MAKE, kept in its own helper so the refusal above
 * is never weakened to reach it. Same key, same belief flags — the ONLY
 * difference is that this one is issued on purpose, at a standstill, by code
 * that has already decided it wants the other direction.
 *
 * The literal key codes stay literal: `reverseAssist-audit-harness.test.ts` §1
 * censuses this file's keyboard calls by regex to prove the harness has no
 * hand-worked gear route, and a helper that actuated `page.keyboard[…](code)`
 * from a variable would make that census silently stop seeing the keys.
 */
let standstillPresses = 0;
const sChannel = async (on) => {
  if (on === holdS) return;
  /* Same list as `brake()`'s, and for the same reason: this one IS a deliberate
   * standstill press, so an unexplained R that follows it has an explanation
   * sitting right here and the watchdog must be able to find it.
   *
   * AND IT CARRIES NO SPEED FIELD, WHICH THE CENSUS CAUGHT AND WAS RIGHT TO.
   * §5 greps this whole helper — body AND comments — for any mention of speed
   * at all, because that is the guard that stops the deliberate press from
   * quietly growing the refusal it exists to bypass. The first draft of this
   * line carried a null speed field it never used and turned that guard off for
   * nothing; the second draft explained itself and tripped the same wire from
   * inside a comment. A press issued here is a standstill press by
   * construction, so the reader is told exactly that and no number is kept. */
  if (on) sPresses.push({ at: Date.now(), via: "sChannel" });
  await page.keyboard[on ? "down" : "up"]("KeyS").catch(() => {});
  holdS = on;
  if (on) standstillPresses += 1;
};
/** In R the two channels swap MEANING, never identity: `throttle()` is still
 *  the W key, `sChannel()` is still the S key. What moves is which of them is
 *  the accelerator — so in R, `throttle()` IS the brake. Named at the call
 *  sites rather than aliased, so the code cannot drift from the car. */

/** LAW 1's timings, taken from the machine and then doubled, because every
 *  number here is a wall-clock wait on a box whose CDP round trip was measured
 *  at 2.0 s median. REVERSE_ASSIST_LIFT_S is 0.25 and REVERSE_ASSIST_HOLD_S is
 *  0.35 (engine/reverseAssist.ts); the keyboard ramp itself takes 0.2 s to
 *  fall (input.ts BRAKE_RELEASE_S), so a lift shorter than ~0.5 s would be
 *  measuring the ramp rather than the foot. */
const REVERSE_LIFT_MS = 900;
const REVERSE_HOLD_MS = 1100;
/** Three, because the first press can be eaten by a teach card that arrived
 *  between the probe and the press — the same way the drive loop loses keys
 *  (`lostKeys`) — and a single attempt would file a live product as broken. */
const REVERSE_ARM_ATTEMPTS = 3;
/**
 * …AND A FAILED BURST OF THREE IS NOT A VERDICT ON THE DRIVE — 2026-08-21.
 *
 * THE BUG THIS NUMBER EXISTS TO KILL. `reverse.failure` was written once and
 * the arm gate required `reverse.failure === null`, so ONE bad burst latched
 * the harness into „this car is in D" for the rest of the session. On
 * sc-park-bay-exit-rev/mobile/right that latch was thrown by three attempts
 * that had ALREADY SUCCEEDED — the car was in R and rolling backwards, the dial
 * showed the |v| of it, and the code read the number as a forward creep — and
 * the following ~190 s were graded under a forward control law with the pedals
 * meaning the opposite of what the code believed. The frame taken to prove the
 * refusal, `05r-reverse-REFUSED.png`, has R lit on the glass.
 *
 * So a burst now ends a BURST and nothing else. The gate re-opens whenever the
 * product still wants R and the car is standing still, up to this many presses
 * in total, and every failure is kept in `reverse.failures[]` rather than
 * overwriting one field. Only a HARD BLOCK — two instruments disagreeing about
 * the selector, or the session ending under the arm — stops it for good, and
 * those set `reverse.blocked`, which is a different field with a different
 * meaning and is stated as such in the status file.
 *
 * NINE, because the budget has to be bounded by something a reader can defend
 * and the cost is measurable: one attempt is REVERSE_LIFT_MS + REVERSE_HOLD_MS
 * of wall clock plus two cluster reads, i.e. ~2.0 s on `mobile` against a
 * DRIVE_BUDGET_MS of 210 s. Three bursts is ~18 s, under 9 % of the drive, and
 * a lesson that has refused nine deliberate presses is telling the truth.
 */
const REVERSE_ARM_BUDGET = 9;
/**
 * HOW FAST AND HOW LONG THE REVERSE LEG MAY RUN.
 *
 * 6 км/ч is the halt cap the parking drills themselves are written against
 * (`reachZone … maxSpeedKmh: 6` on every setup gate in templates-parking3), so
 * a car creeping back at or under it is doing what the lesson asked. It is
 * also low enough that the actuation latency measured for CRUISE_KMH — up to
 * ~4 s between deciding to lift and the key coming up — cannot turn a bay-
 * depth manoeuvre into a collision the harness caused.
 *
 * 40 s, because the act is metres and not minutes: a 5 m bay at 6 км/ч
 * (1.7 m/s) is ~3 s of travel, and 40 s survives a `pc` leg whose ticks cost
 * 3.5 s apiece while still ending the leg long before the drive budget. The
 * leg normally ends on the PRODUCT withdrawing the demand, which is the only
 * end condition that means anything; the budget is the backstop that keeps a
 * lesson which never withdraws it from eating the whole drive in R.
 */
const REVERSE_CRUISE_KMH = 6;
const REVERSE_MS = 40_000;

/** Everything the run learned about reverse, published in `_audit-status.json`
 *  whether or not the lesson ever asked. `demanded: false` is a real answer and
 *  a reader must be able to tell it from "the harness never looked". */
const reverse = {
  demanded: false,
  demandedBy: null,
  /** total deliberate presses spent across every burst — the budget's meter. */
  attempted: 0,
  /** how many bursts of REVERSE_ARM_ATTEMPTS have been spent. */
  bursts: 0,
  armed: false,
  armedAtSec: null,
  gearSeen: [],
  reverseTicks: 0,
  disarmed: null,
  disarmNote: null,
  /** EVERY reason a burst ended, in order. Not one latched field: a run that
   *  failed twice and then succeeded has to be able to say so. */
  failures: [],
  /** THE ONLY LATCH LEFT, and it is for the two things a retry cannot mend:
   *  two instruments disagreeing about the selector, and the session ending. */
  blocked: null,
  /** The last thing the cluster said when a burst ran out — kept separate from
   *  `blocked` because it is an OBSERVATION and not a decision. */
  lastCluster: null,
  /** Session seconds at which R appeared without this drive arming it. `null`
   *  is „it never did", and that is a different answer from „nobody looked" —
   *  before 2026-08-21 no drive recorded the selector on any tick at all. */
  unarmedRAt: null,
  /** WHO PUT IT THERE — and the honest answer is usually that nobody here can
   *  say. One of "harness-disarm-failed" | "undetermined" | "no-harness-gesture",
   *  or `null` while `unarmedRAt` is `null`. The first draft of this watchdog
   *  had no such field because it had already decided: it printed „the engine's
   *  own reverse assist has taken the gate" about a drive that presses the brake
   *  at every stop. See the block at the watchdog for why that is unknowable. */
  unarmedRWho: null,
  /** What the attribution was read OFF, so a reader can disagree with it. */
  unarmedREvidence: null,
};
/** The one-line reason a reader wants, without pretending there was only one. */
const reverseWhy = () =>
  reverse.blocked ?? (reverse.failures.length ? reverse.failures[reverse.failures.length - 1] : null);

/**
 * STOP · LIFT · PRESS · READ THE CLUSTER. Returns true only when the letter on
 * the glass says R — never when the keys merely went out.
 */
async function armReverse(kmhNow) {
  if (kmhNow !== 0) return false; // caller's job; stated here so it cannot be assumed
  reverse.bursts += 1;
  /* ── ASK BEFORE PRESSING — 2026-08-21 ──────────────────────────────────────
   *
   * The cheapest of the three fixes this burst needed, and the one that makes
   * the other two nearly unreachable: if the cluster ALREADY reads R, there is
   * nothing to arm, and a press issued anyway is the gesture that walks the
   * gate back up to D. The previous version opened with a lift-and-press and
   * only looked afterwards, which is how a car that was already in R came to be
   * reported as one that never reached it. One attribute read, ~50 ms. */
  {
    const g0 = await gear();
    reverse.gearSeen.push(...g0.filter((x) => !reverse.gearSeen.includes(x)));
    if (g0.length === 1 && g0[0] === "R") {
      reverse.armed = true;
      reverse.lastCluster = gearLine(g0);
      note(`      REVERSE was ALREADY ARMED before this burst spent a press — the cluster reads «R».`);
      return true;
    }
  }
  for (let attempt = 1; attempt <= REVERSE_ARM_ATTEMPTS; attempt++) {
    reverse.attempted += 1;
    // Both pedals up. A held throttle vetoes the toggle outright
    // (ReverseAssist.update: `throttlePedal > REVERSE_ASSIST_PEDAL_ON`), and a
    // brake that was never lifted can never be armed.
    await throttle(false);
    await sChannel(false);
    await page.waitForTimeout(REVERSE_LIFT_MS);
    // …and the lift only counts AT A STANDSTILL, so re-read rather than trust
    // the sample the caller took a round trip ago.
    const still = await speedNow();
    if (still < 0) {
      // The readout is gone, not zero. Almost always the session ending
      // underneath the arm; either way there is no car to shift — and unlike a
      // burst that merely ran out, retrying this one cannot help, so it is the
      // HARD BLOCK and it says so.
      reverse.blocked = (await endSurfaceUp())
        ? "the session ended before R could be armed"
        : "the speed readout vanished before R could be armed";
      reverse.failures.push(reverse.blocked);
      note(`      (reverse arm ${attempt}/${REVERSE_ARM_ATTEMPTS}: ${reverse.blocked})`);
      return false;
    }
    /* ── A «CREEP» AND A REVERSING CAR ARE THE SAME NUMBER ─────────────────
     *
     * ADDED 2026-08-21 BY THE ADVERSARIAL RE-VERIFICATION, AND IT IS THE SAME
     * BLINDNESS THIS BLOCK'S OWN HEADER NAMES: `displaySpeedKmh` is
     * `Math.abs(v)`, so «the car crept to 3 км/ч during the lift» is EQUALLY
     * a car that the previous press already put into R and that is now rolling
     * BACKWARDS. Skipping the attempt on that reading throws away the arm that
     * had just succeeded.
     *
     * MEASURED, sc-park-bay-exit-rev/mobile/right, before this branch existed:
     *   (reverse arm 1/3: the cluster still reads «D»)
     *   (reverse arm 2/3: the car crept to 3 км/ч during the lift …)
     *   (reverse arm 3/3: the car crept to 1 км/ч during the lift …)
     *   !! THIS LESSON ASKED FOR REVERSE … AND THE CAR NEVER LEFT «R»
     * — and then `[04-t015s] 0 км/ч gear=R`, and `05r-reverse-REFUSED.png`,
     * the frame taken to PROVE the car never reached R, shows R lit on the
     * glass. The refusal was false, `reverse.failure` latched, and the drive
     * spent the next 190 s grading a car it believed was in D.
     *
     * So the dial does not get to end an attempt on its own: the CLUSTER is
     * asked, exactly as every other decision in this block is. */
    let g;
    if (still !== 0) {
      g = await gear();
      reverse.gearSeen.push(...g.filter((x) => !reverse.gearSeen.includes(x)));
      if (g.length !== 1 || g[0] !== "R") {
        note(`      (reverse arm ${attempt}/${REVERSE_ARM_ATTEMPTS}: the car crept to ${still} км/ч during the lift and the cluster reads «${gearLine(g)}» — the press would not arm; re-stopping)`);
        continue;
      }
      note(`      (the ${still} км/ч during the lift is the car ALREADY ROLLING BACKWARDS — the dial shows |v| and the cluster reads «R»)`);
    } else {
      await sChannel(true);
      await page.waitForTimeout(REVERSE_HOLD_MS);
      g = await gear();
      reverse.gearSeen.push(...g.filter((x) => !reverse.gearSeen.includes(x)));
    }
    if (g.length > 1) {
      loud(`two instruments disagree about the selector (${gearLine(g)}) — the harness will believe NEITHER.`);
      reverse.blocked = `cluster disagreement (${gearLine(g)})`;
      reverse.failures.push(reverse.blocked);
      reverse.lastCluster = gearLine(g);
      return false;
    }
    if (g[0] === "R") {
      reverse.armed = true;
      reverse.lastCluster = gearLine(g);
      note(`      REVERSE ARMED on press ${reverse.attempted} (burst ${reverse.bursts}, attempt ${attempt}/${REVERSE_ARM_ATTEMPTS}): the cluster reads «R».`);
      return true;
    }
    reverse.lastCluster = gearLine(g);
    note(`      (reverse arm ${attempt}/${REVERSE_ARM_ATTEMPTS} of burst ${reverse.bursts}: the cluster still reads «${gearLine(g)}»)`);
    // Leave the pedal DOWN between attempts and the next lift is what arms the
    // next press — that is the gesture. Release it here so the loop's own
    // `sChannel(false)` is a real edge rather than a no-op.
    await sChannel(false);
  }
  /* THE BURST IS OVER — AND THAT IS NOT THE SAME SENTENCE AS «THE CAR IS IN D».
   *
   * Read the cluster ONE more time before saying anything. The last press of
   * the burst is followed by REVERSE_HOLD_MS and a read, but the toggle is a
   * state machine on the sim's own clock and the read can land in front of it;
   * on the box this was measured on a CDP round trip is ~2 s and a tick is
   * ~4 ms, so „the answer arrived late" is the ordinary case, not the exotic
   * one. A late R is a SUCCESS, and the version that could not see one filed a
   * reversing car as a refusal and then graded 190 s under the wrong law. */
  const late = await gear();
  reverse.gearSeen.push(...late.filter((x) => !reverse.gearSeen.includes(x)));
  reverse.lastCluster = gearLine(late);
  if (late.length === 1 && late[0] === "R") {
    reverse.armed = true;
    note(`      REVERSE ARMED LATE: the burst's presses all read «${gearLine(late)}» too early — the cluster reads «R» now.`);
    return true;
  }
  reverse.failures.push(`burst ${reverse.bursts} spent ${REVERSE_ARM_ATTEMPTS} presses and the cluster reads «${gearLine(late)}»`);
  return false;
}

/**
 * BACK TO D — and the mirror image of the arm, because in R the functional
 * brake is the W channel (rule b). It is not optional: leaving the session in
 * R hands the stop phase a control law in which `brake()` is the accelerator.
 */
async function disarmReverse() {
  // Stop first, on the pedal that brakes IN R.
  await sChannel(false);
  await throttle(true);
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(600);
    const v = await speedNow();
    if (v === 0 || v < 0) break;
  }
  const rest = await speedNow();
  if (rest < 0) {
    // THREE STATES, NOT TWO — see endSurfaceUp(). There is no car left to take
    // out of R, and on the happy path that is because the manoeuvre finished
    // the lesson. `disarmed: null` says "never reached", which is the truth,
    // and it is NOT a failure line when the session is simply over.
    const over = await endSurfaceUp();
    reverse.disarmed = null;
    reverse.disarmNote = over
      ? "not needed — the session ended while the car was still in R"
      : "the speed readout vanished before the disarm could run";
    await throttle(false);
    if (over) note(`      (no disarm: ${reverse.disarmNote})`);
    else loud(`the disarm could not run: ${reverse.disarmNote}. Any braking claim below is about an unknown pedal mapping.`);
    return over;
  }
  if (rest !== 0) {
    loud(`the car would not come to rest in R (${rest} км/ч on the reverse brake) — the disarm cannot even begin.`);
    reverse.disarmed = false;
    reverse.failures.push(`no rest in R (${rest} км/ч)`);
    await throttle(false);
    return false;
  }
  for (let attempt = 1; attempt <= REVERSE_ARM_ATTEMPTS; attempt++) {
    await throttle(false); // lift the functional brake…
    await page.waitForTimeout(REVERSE_LIFT_MS);
    await throttle(true); // …and press it again: R → N → D
    await page.waitForTimeout(REVERSE_HOLD_MS);
    // AND LET GO AT ONCE. The flip is labelled "assist", so LAW 2 does NOT
    // disown the held channel — in D that same W key is the accelerator again,
    // and a hand still on it drives the car forward out of the bay it just
    // parked in.
    await throttle(false);
    const g = await gear();
    reverse.gearSeen.push(...g.filter((x) => !reverse.gearSeen.includes(x)));
    reverse.lastCluster = gearLine(g);
    /* ── THE DISARM MUST BE AS HARD TO CONVINCE AS THE ARM — 2026-08-21,
     *    ADDED BY THE ADVERSARIAL RE-VERIFICATION OF THE UN-LATCH.
     *
     * This read `if (g[0] === "D")`, with no length test, while EVERY arm-side
     * decision in this file carries one: `g0.length === 1 && g0[0] === "R"`,
     * `late.length === 1 && late[0] === "R"`, `gNow.length === 1 && gNow[0] ===
     * "R"`, and an explicit `g.length > 1` refusal in the middle of the burst
     * that says the harness „will believe NEITHER". So a cluster reading
     * «D/R» — two painted instruments disagreeing about the selector, the one
     * shape armReverse treats as a HARD BLOCK — took the FIRST letter and
     * declared `disarmed: true`.
     *
     * That is the asymmetry in the reassuring direction: the arm refuses an
     * ambiguous cluster and the disarm accepts it, so the one field the stop
     * phase depends on („are the pedals the right way round again?") was the
     * one field allowed to be decided on evidence the rest of the file rejects.
     * `disarmed: true` is what tells a judge the braking claims below are
     * admissible.
     *
     * MEASURED, as the predicate rather than as a drive, because a disagreeing
     * cluster cannot be induced from the outside: on ["D"] both the old and the
     * new test say disarmed; on ["D","R"] the old says disarmed and the new
     * does not; on [] both decline. See the note at `armReverse`'s own
     * `g.length > 1` branch for why that third shape is a different answer. */
    if (g.length > 1) {
      loud(`two instruments disagree about the selector (${gearLine(g)}) during the disarm — the harness will believe NEITHER.`);
      reverse.blocked = `cluster disagreement during disarm (${gearLine(g)})`;
      reverse.failures.push(reverse.blocked);
      reverse.disarmed = false;
      await throttle(false);
      return false;
    }
    if (g.length === 1 && g[0] === "D") {
      reverse.disarmed = true;
      note(`      REVERSE DISARMED on attempt ${attempt}: the cluster reads «D» again.`);
      return true;
    }
    note(`      (disarm ${attempt}/${REVERSE_ARM_ATTEMPTS}: the cluster reads «${gearLine(g)}»)`);
  }
  reverse.disarmed = false;
  loud(
    `the drive could not get out of R — the cluster still reads «${gearLine(await gear())}». Every pedal in the stop ` +
      `phase below therefore means the OPPOSITE of what the control law believes, and no braking claim from this run is admissible.`,
  );
  return false;
}

/* ── PRESS THE PRODUCT'S OWN PLAY BUTTON — 2026-08-28 ───────────────────────
 *
 * WHAT WAS MISSING. `content/traces/<id>/shadow-correct.trace.json` exists for
 * all 167 lessons and the product already replays it: `ShadowCar` drives a
 * translucent ghost along it and `TraceTimeline` gives that replay a scrub bar
 * and a transport row, behind the lesson shell's «🎬 Демонстрация ▸» toggle,
 * granted on every scenario rung this harness drives (`DEFAULT_LEVEL_AIDS[1]
 * .shadowCar`, and the harness has always opened lessons at `&level=1`). Until
 * this block THIS FILE CONTAINED ZERO MENTIONS OF «Демонстрация» AND NEVER
 * PRESSED ▶. Three hundred and seventy-six drives went past a deck sitting on
 * the glass with the authored correct drive parked inside it.
 *
 * AND IT IS PARKED, WHICH IS WHY NOBODY TRIPPED OVER IT BY ACCIDENT.
 * `demoDeckLifetime.demoDeckAtRest()` — landed 2026-08-24 against
 * `sc-ed-poligon-chain:746682ab` — sets `playing = false, tSec = 0` at mount,
 * deliberately: «the deck opens parked at 0:00 and the student presses ▶».
 * Before that ruling the replay auto-played and the corpus caught it narrating
 * over a driving car. So a harness that never presses ▶ photographs a
 * demonstration that has not started, on every lesson, for ever.
 *
 * ── WHY THIS AND NOT A STEERING SYSTEM ────────────────────────────────────
 *
 * The 13 rows this reaches are all one shape: the guidance loop's only signal
 * is a ghost RIBBON read off a 1166×210 crop of the windscreen, and ribbon
 * visibility is a stable per-lesson property (`sc-merge-from-property` never
 * above 42% across 11 lanes and 8 commits) rather than a flake, so on those
 * lessons no number of re-drives yields a judgeable leg. The obvious answer —
 * replay the trace's own inputs — was PROBED FIRST AND FAILS: `steerRad` is
 * ~0 for the whole tape on every lesson checked (0 non-zero samples of 737 on
 * `sc-fo-motorway-gap`, 2 of 909 on `sc-junction-scan`, 9 of 3281 on
 * `sc-ed-poligon-chain`) while the recorded HEADING swings up to 344°. The
 * tape records the turn and not the input that caused it, so an input replay
 * would drive straight through every corner AND would look like it worked on
 * the one straight lesson anybody would test first. Stage 2 above therefore
 * takes throttle and brake from that tape and nothing else, and steering stays
 * unsolved.
 *
 * The product, however, does not need the input: it replays the trace
 * KINEMATICALLY. So this beat does not build a driver. It presses play.
 *
 * ── WHAT A PHOTOGRAPHED DEMONSTRATION IS EVIDENCE OF, AND WHAT IT IS NOT ───
 *
 * A demo frame shows WHAT THE PRODUCT ITSELF ASSERTS A CORRECT DRIVE LOOKS
 * LIKE on this lesson — the line, the speed, the stops, the annotations — for
 * a lesson whose correct drive no harness leg has ever completed. That is a
 * reference a judge can hold a `04-*` frame against, and it is the first time
 * this corpus has had one.
 *
 * IT IS NOT A `-right` LEG AND IT IS EMPHATICALLY NOT A `-wrong` ONE. Nothing
 * about an imperfect human drive can be read off it. That distinction has to
 * survive a reader who never opens a picture, so it is carried THREE ways: the
 * frames are named `03d-demo-*` and never `04-*`; `demo.evidence` in
 * `_audit-status.json` says it in a sentence; and every note this block writes
 * opens with the word DEMONSTRATION.
 *
 * ── AND THE ANSWER TO „does the product credit its own demonstration" ──────
 *
 * MEASURED HERE, ON EVERY LANE THAT RUNS THIS BEAT, AND IT IS NO — with a
 * mechanism that means the spec's hoped-for reading of that NO is wrong, so it
 * must not be filed as the spec framed it. `ShadowCar` is a translucent clone
 * of the hero model driven by `sampleAt` lerp with NO physics body, no
 * `sampleRef` and no write into the grading path (`ShadowCar.tsx:354` takes
 * `trace`, `clockRef`, three booleans and a district — and nothing else). The
 * car `rules/engine.ts` grades is the physics car, and it stays on the spawn
 * mark for the whole replay. This beat proves that per drive rather than by
 * argument: `window.__camProbe` is read before ▶ and after the replay ends,
 * and `demo.ego.movedM` is the answer.
 *
 * So «the product cannot credit its own demonstration» is TRUE and is NOT a
 * first-class defect: the product never claimed the demonstration was a drive,
 * and a ghost that credited objectives would be the defect. What this beat
 * settles is narrower and real — that the uncredited objectives on these 13
 * rows CANNOT be explained by „there is no drivable success path here", because
 * the product ships a recording of that path and this drive photographs it.
 *
 * ── WHAT IT MEASURED, WHICH IS THE ONLY REASON TO KEEP IT ─────────────────
 *
 * Same box, same server, commit 405e2056 + this worktree. `before` is the same
 * lane driven on the tree without this block.
 *
 *   sc-junction-scan / pc / right — heading swings 0..90°, objective 3 is the
 *   right turn and it has never been credited
 *     before  26 frames, no `03d-demo-*`, no `demo` key in _audit-status.json.
 *             The deck sat on the glass reading «0:00 / 0:45» for the whole
 *             drive and no drive in this programme had ever pressed it.
 *     after   deck present, painted, open · playhead 0 -> 45 s of 45 s in 46 s,
 *             44 of 45 polls advancing, played to the end and wrapped ·
 *             03d-demo-open (0:00) / 03d-demo-play (0:21) / 03d-demo-end (0:38)
 *             · graded car moved 0.00 m · «Задача 1/3» before and after ·
 *             restored: playhead 0, transport «Пусни», deck as found.
 *             The drive that followed was normal: positive control 44 км/ч,
 *             steering LIVE, objectives 1 and 2 credited at 1:26 and 2:06 and
 *             objective 3 — the turn — dashed, exactly as before.
 *
 *   sc-park-left / pc / right — heading 0..338°, `sc-park-left:fcce489f`, and
 *   the reverse-park objective is uncredited on every leg ever driven
 *     after   playhead 0 -> 41 s of 42 s in 42 s · frames as above, the 0:19
 *             one carrying the product's own coaching line for the manoeuvre
 *             («Преди да пресечеш алеята: ляво огледало, после поглед в двете
 *             посоки — минаваш през чужд път.») · graded car moved 0.00 m ·
 *             «Задача 1/2» before and after · restored OK.
 *             The drive that followed credited «Задача 1: спри в изходната
 *             позиция…» at 1:45 and left «паркирай на заден ход в лявото
 *             гнездо» dashed.
 *
 *   sc-junction-scan / mobile / right — the deck is in the DOM, off the glass,
 *             blocked by `touch-hint`; one `03d-demo-blocked` frame and a named
 *             refusal. See the `!r0.painted` branch for what that measures.
 *
 * ── AND THE LIMIT OF THESE FRAMES, WHICH IS NOT SMALL ─────────────────────
 *
 * THE CAMERA IS THE PARKED CAR'S. The demonstration is a ghost driving away
 * from a cockpit that never moves, so it is photographed only while it is
 * inside that cockpit's field of view — and MEASURED AGAINST THE TRACES
 * THEMSELVES that window is about the first hundred metres, ending at the
 * first turn:
 *
 *   sc-junction-scan   ghost in the windscreen at 0:21 =  76 m out, heading 0°
 *                      gone by            0:38 = 106 m out, heading  90°
 *   sc-park-left       0:21 =  90 m (heading 338°) · 0:38 = 106 m (73°)
 *   sc-vu-cyclist-hook 0:21 = 102 m (heading  90°) · 0:38 = 116 m (180°)
 *   sc-ed-d2-city-run  0:21 = 223 m · 0:60 = 573 m · 0:90 = 858 m
 *
 * SO THE FRAMES ANSWER ABOUT THE FIRST STRETCH OF A ROUTE AND NOT ABOUT A
 * PLACE 600 m DOWN IT, and a row filed against one of those places — e.g.
 * `sc-ed-d2-city-run:a0bdad4b`, a pedestrian plaza the harness reaches at
 * t≈87 s, i.e. past 800 m of route — is NOT settled by these pictures. Say
 * that rather than let a reader assume otherwise.
 *
 * What every frame does carry for the whole replay is the transport (the
 * second it is standing on), the caption bank, the annotation ticks and the
 * objective banner. Nothing here follows the ghost: the product has a top-down
 * camera on every rung and cycling to it would photograph the WHOLE authored
 * route, but `data-sim-camera` is read by PlayAreaStyles and by this file's own
 * band geometry, so a camera this beat failed to restore would re-base every
 * steering measurement the harness takes. That is the next lane's call, and it
 * now has the metres above to make it with. Named, not attempted.
 *
 * ── IT MUST LEAVE THE SCENE EXACTLY AS IT FOUND IT ────────────────────────
 *
 * Every verdict in a 1,462-row ledger was taken with the clock at 0:00, paused,
 * and the ghost on the trace's first sample — because nobody had ever pressed
 * ▶. A beat that left the playhead anywhere else would put a ghost car and a
 * blue ribbon somewhere new in the windscreen band the guidance loop reads, and
 * would silently re-base every steering measurement this harness takes. So the
 * beat rewinds to 0, pauses, restores the deck's open state, blurs the button
 * it clicked, and ASSERTS all of it; a restore that cannot be verified is said
 * out loud and the drive that follows is marked as not comparable.
 *
 * It also runs AFTER `steerLiveness` on purpose. That block's own header calls
 * its moment „the last instant of the drive at which the car is untouched", and
 * it is still true: nothing above this line has moved, and this beat presses no
 * pedal. It runs BEFORE the positive control because the positive control is
 * what ends the demonstration's life — `demoDeckStandsDown` latches at 5 км/ч,
 * one-way, and closes the deck and stops the clock. Five seconds of throttle
 * and there is nothing left to press.
 *
 * ── AND WHY THE BODY IS DECLARED HERE AND CALLED THREE HUNDRED LINES DOWN ──
 *
 * Not taste. `reverseAssist-audit-harness.test.ts` §6 pins the ORDER of two
 * statements as source text —
 *   /await timed\("steer", steerLiveness\);[\s\S]{0,600}?POSITIVE CONTROL/
 * — because a first draft of the liveness check ran AFTER the positive control,
 * measured „15 км/ч, throttle DOWN" and correctly refused to run at all. Eleven
 * kilobytes of declarations between those two statements breaks that regex
 * while breaking nothing it protects, so the declarations live up here and the
 * call site stays three lines long. Anything moved back down there turns a
 * green suite red in a file this lane does not own.
 */
/** The cap on how long the replay may run, sized against the corpus rather
 *  than guessed: the 167 shipped traces run 16.2 s to 164.0 s (median 41.6,
 *  p90 60.3), so this covers the longest one — `sc-ed-poligon-chain` — with
 *  room for the poll. Cutting the longest demonstration short would make its
 *  frames a sample of how fast the box was, which is the exact failure stage 2
 *  of this wave exists to end. */
const DEMO_MAX_MS = 200_000;
/** How often the playhead is read. The deck's own mirror polls the clock at
 *  its `POLL_MS`, so reading faster buys nothing but layout flushes. */
const DEMO_POLL_MS = 1000;
/** ▶ is down and the playhead has not moved for this long: the replay is
 *  stuck. Named rather than waited out, because „the demonstration is broken"
 *  and „the demonstration is slow" are different findings. */
const DEMO_STALL_MS = 8000;
/** The mid-replay frame is the only optional one. A `pc` screenshot was
 *  measured at 11,999 ms median against 200 ms on `mobile` (see
 *  `lastShotCostMs`), and a third frame that costs twelve seconds on every one
 *  of 167 lanes buys one picture of the middle of a route. Two frames — the
 *  parked deck and the finished replay — are the artifact; this one is a
 *  luxury and is taken only where frames are cheap. */
const DEMO_MID_SHOT_MAX_COST_MS = 3000;

const DEMO_DECK_SEL = '[data-hud="demo-deck"]';

/** Everything this beat did, published so a judge never has to infer it from a
 *  frame — including on the lanes where it did nothing. */
const demo = {
  used: false,
  why: "not attempted",
  evidence:
    "A demonstration frame is the product's own authored CORRECT drive, replayed by its own transport. It is NOT a " +
    "`right` leg, NOT a `wrong` leg, and says nothing about an imperfect human drive. The graded car does not move " +
    "during it — see ego.movedM.",
  deck: null,
  blockedBy: [],
  replay: null,
  objectives: null,
  ego: null,
  restored: null,
};

/** One read of the deck, its transport, the objective banner and the graded
 *  car's pose. Everything this beat decides on comes from here. */
const demoRead = () =>
  page
    .evaluate(() => {
      const norm = (s) => (s || "").trim().replace(/\s+/g, " ");
      const deck = document.querySelector('[data-hud="demo-deck"]');
      // The same ancestor-chain test `read()` uses, and for the same reason: a
      // bare rect calls a `display: contents` wrapper invisible, and the four
      // PlayAreaStyles rules that take this deck off the glass all do it with
      // `display: none` on an ANCESTOR-side selector.
      const shown = (el) => {
        for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
          const cs = getComputedStyle(n);
          if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
        }
        const r = el.getBoundingClientRect();
        return r.width >= 1 && r.height >= 1;
      };
      const slider = deck ? deck.querySelector('[role="slider"]') : null;
      const play = deck ? deck.querySelector('button[aria-label="Пусни"], button[aria-label="Пауза"]') : null;
      const toggle = deck ? deck.querySelector("button[aria-expanded]") : null;
      const html = document.documentElement;
      const p = window.__camProbe;
      return {
        present: deck !== null,
        painted: deck !== null && shown(deck),
        open: deck ? deck.getAttribute("data-deck-open") : null,
        // THE FOUR RULES THAT HIDE THIS DECK, READ AS THE STATE EACH ONE KEYS
        // ON — not guessed from the fact that it is hidden. PlayAreaStyles:
        // `[data-sim-compact="on"]:has([data-hud="touch-hint"])`,
        // `html[data-sim-car-sheet="open"]`,
        // `html[data-sim-overlay-read="open"] [data-sim-compact="on"]`,
        // `[data-sim-compact="on"]:has([data-hud="play-menu"] [role="menu"])`.
        blockers: {
          compact: document.querySelector("[data-sim-compact]")?.getAttribute("data-sim-compact") ?? null,
          touchHint: document.querySelector('[data-hud="touch-hint"]') !== null,
          carSheet: html.getAttribute("data-sim-car-sheet"),
          readOverlay: html.getAttribute("data-sim-overlay-read"),
          playMenu: document.querySelector('[data-hud="play-menu"] [role="menu"]') !== null,
        },
        tSec: slider ? Number(slider.getAttribute("aria-valuenow")) : null,
        durationSec: slider ? Number(slider.getAttribute("aria-valuemax")) : null,
        tText: slider ? slider.getAttribute("aria-valuetext") : null,
        sliderPainted: slider !== null && shown(slider),
        playLabel: play ? play.getAttribute("aria-label") : null,
        playPainted: play !== null && shown(play),
        toggleText: toggle ? norm(toggle.textContent) || toggle.getAttribute("aria-label") : null,
        expanded: toggle ? toggle.getAttribute("aria-expanded") : null,
        // EVERY COPY, AND NO VISIBILITY TEST AT ALL — the same ruling the gear
        // read in `read()` carries. On a phone in the cockpit camera this
        // banner is 0×0 and unpainted for most of a drive, and „the objective
        // did not credit" and „the banner was not on the glass" are two facts.
        objectives: [...document.querySelectorAll('[data-hud="objective-banner"]')].map((el) => norm(el.textContent)),
        // The graded car. Dev-only, read as a WITNESS and never as an input —
        // the same standing rule the pace tape's index is built under.
        ego: p ? { x: Number(p.chassisX), z: Number(p.chassisZ), kmh: Number(p.speedKmh) } : null,
      };
    })
    .catch(() => null);

/** «Задача 3/5» → 3, so „did anything credit" is a number and not a diff of
 *  two Bulgarian sentences. */
const demoTaskIndex = (lines) => {
  for (const l of lines ?? []) {
    const m = /Задача\s+(\d+)\s*\/\s*(\d+)/.exec(l);
    if (m) return { index: Number(m[1]), total: Number(m[2]) };
  }
  return null;
};

async function runDemo() {
  /* ONE LANE PER PLATFORM, AND THE OTHER ONE SAYS SO. The demonstration is a
   * recording: it is byte-identical on the `right` and `wrong` legs of a
   * platform, and it plays before either leg has driven a metre, so running it
   * on both would photograph the same replay twice and add ~42 s (the corpus
   * median) to a lane for nothing. It is NOT skipped per platform — the deck's
   * default open state, its layout and the rules that hide it all differ
   * between `mobile` and `pc`, and that difference is itself one of the things
   * this beat measures. */
  if (MODE !== "right") {
    demo.why =
      "MODE=wrong — the demonstration is a recording and is identical on both legs of a platform; this lesson's `right` lane photographs it";
    return;
  }
  const r0 = await demoRead();
  if (r0 === null) {
    demo.why = "the page would not answer the demonstration probe";
    loud(`THE DEMONSTRATION PROBE GOT NO ANSWER — no deck evidence from this lane.`);
    return;
  }
  demo.deck = {
    present: r0.present,
    painted: r0.painted,
    open: r0.open,
    toggle: r0.toggleText,
    durationSec: r0.durationSec,
    atArrivalSec: r0.tSec,
    playLabel: r0.playLabel,
  };
  if (!r0.present) {
    /* A LESSON WITH NO DECK IS A FINDING, NOT A SKIP. Every scenario rung this
     * harness opens is `&level=1`, and `DEFAULT_LEVEL_AIDS[1].shadowCar` is
     * `true`, so the deck is promised here — unless this lesson's LevelSpec
     * overrides the aid, or its trace failed to load, and either is worth a
     * line. */
    demo.why = "no «🎬 Демонстрация» deck is in this lesson's DOM at all";
    loud(
      `NO DEMONSTRATION DECK ON THIS LESSON. The harness opened it at &level=1, where DEFAULT_LEVEL_AIDS[1].shadowCar ` +
        `is true and the shell should mount «🎬 Демонстрация» — either this rung overrides the aid or its shadow trace ` +
        `did not load. Nothing about the authored correct drive can be photographed on this lane.`,
    );
    return;
  }
  if (!r0.painted) {
    /* THE PRODUCT'S OWN ARBITRATION IS OBEYED AND REPORTED, NOT FOUGHT. Four
     * PlayAreaStyles rules take this deck off the glass, and each is a
     * deliberate ruling with a measurement behind it (the phone's first-run
     * hint is „one sentence, once, and the only thing on that screen a student
     * can act on"). Clearing the blocker to reach the deck would photograph a
     * state no student can produce AND would change the frames of the drive
     * that follows — the hint occludes ~70% of the glass on a phone and the
     * corpus has rows filed against exactly that. So: name the blocker, take
     * one picture of the state, and drive.
     *
     * WHAT THIS MEASURES ON THE PHONE IS WORTH THE SKIP. `touch-hint` hides
     * the deck while it is mounted, and `touchHintLifetime` only unmounts it
     * once the car is genuinely moving — at `movingSpeedKmh` = 5. The deck's
     * own `demoDeckStandsDown` latches at the SAME 5 км/ч and closes the deck
     * and stops the clock. So on a phone the demonstration is unreachable for
     * the whole of the only window in which it is useful, and becomes reachable
     * one instant after the product has decided the student no longer needs it.
     * The student can still reopen it deliberately — the stand-down poll fires
     * once — so this is not „unwatchable"; it is „never watchable BEFORE the
     * drive", which for a demonstration is the interesting half. */
    demo.blockedBy = Object.entries(r0.blockers)
      .filter(([k, v]) => (k === "compact" ? false : v === true || v === "open"))
      .map(([k]) => k);
    demo.why = `the deck is in the DOM and off the glass (blocked by: ${demo.blockedBy.join(", ") || "an unlisted rule"})`;
    loud(
      `THE DEMONSTRATION DECK IS OFF THE GLASS AT «03-ready» — ${demo.why}. This is the product's own arbitration and ` +
        `this beat does not fight it: clearing the blocker would photograph a state no student can reach and would ` +
        `change the occlusion of every frame of the drive below. ON A PHONE THIS IS THE FINDING: the first-run hint ` +
        `hides the deck until the car moves at 5 км/ч, and `+
        `demoDeckStandsDown latches at the same 5 км/ч — so the demonstration is off the glass for the whole window ` +
        `before the drive, and stands itself down the moment it comes back.`,
    );
    await shot("03d-demo-blocked");
    return;
  }

  // ── OPEN IT, IF THE STUDENT WOULD HAVE HAD TO ────────────────────────────
  // Roomy screens mount this deck open (`DemoDeck`'s `useState` initialiser);
  // a phone mounts it collapsed to its pill. Whichever it was is restored at
  // the end — see the header.
  const openedByUs = r0.open !== "true";
  if (openedByUs) {
    const ok = await press(page.locator(`${DEMO_DECK_SEL} button[aria-expanded]`));
    await page.waitForTimeout(1200);
    if (!ok) {
      demo.why = "the «🎬 Демонстрация» toggle would not answer a press";
      loud(`THE «🎬 Демонстрация» TOGGLE WOULD NOT OPEN — no replay from this lane.`);
      return;
    }
  }

  const r1 = await demoRead();
  if (r1 === null || r1.playLabel === null) {
    demo.why = "the deck is open and carries no transport (no ▶/⏸ button)";
    loud(`THE DEMONSTRATION DECK CARRIES NO PLAY BUTTON — ${demo.why}.`);
    return;
  }
  demo.deck.open = r1.open;
  demo.deck.durationSec = r1.durationSec;
  demo.deck.playLabel = r1.playLabel;
  const startedPlaying = r1.playLabel === "Пауза";
  if (startedPlaying) {
    /* A CONTRADICTION OF A SHIPPED RULING, SO IT IS SHOUTED RATHER THAN
     * ACCOMMODATED. `demoDeckAtRest()` is supposed to have parked this clock
     * at mount; a deck already playing when the harness arrives is the exact
     * defect that ruling closed (`sc-ed-poligon-chain:746682ab`,
     * `sc-merge-lane-end:16d2fa64`) coming back. */
    loud(
      `THE DEMONSTRATION WAS ALREADY PLAYING when the harness arrived (playhead ${r1.tText ?? "?"}). ` +
        `demoDeckLifetime.demoDeckAtRest() parks this clock at 0:00 paused at mount, on purpose — a replay running ` +
        `before the student has driven anything is sc-ed-poligon-chain:746682ab reopening.`,
    );
  }
  const objBefore = r1.objectives;
  const egoBefore = r1.ego;
  await shot("03d-demo-open");

  // ── ▶ ────────────────────────────────────────────────────────────────────
  if (!startedPlaying) {
    const ok = await press(page.locator(`${DEMO_DECK_SEL} button[aria-label="Пусни"]`));
    if (!ok) {
      demo.why = "the ▶ «Пусни» button would not answer a press";
      loud(`THE ▶ «Пусни» BUTTON WOULD NOT ANSWER A PRESS — ${demo.why}.`);
      return;
    }
  }
  demo.used = true;
  demo.why = "the product's own transport replayed its authored correct drive";

  const t0Demo = Date.now();
  let last = r1.tSec ?? 0;
  let lastMoveAt = t0Demo;
  let topT = last;
  let wrapped = false;
  let stalled = false;
  let midShot = false;
  /* ── THE END FRAME IS TAKEN BEFORE THE WRAP, NOT AFTER IT ─────────────────
   * MEASURED on the first drive this beat ever took (sc-junction-scan/pc/right,
   * 2026-08-28): `03d-demo-end.png` showed «0:00 / 0:45» — the transport back
   * at the start, the ghost back on the spawn mark, and the FIRST annotation
   * on the glass again. The replay does not stop at the end, it LOOPS
   * (`ShadowCar.tsx:571`), so a frame taken after the loop's exit condition is
   * a frame of the beginning wearing the name of the end. The picture was
   * wrong in the reassuring direction — it looked like a finished replay.
   * So the frame is taken from INSIDE the loop, at 85% of the authored
   * duration, and the exact second it was taken at is published in
   * `demo.replay.endFrameAtSec` so no reader has to trust the name. */
  let endShotAt = null;
  let samples = 0;
  let advancing = 0;
  let capped = false;
  let rLast = r1;
  for (;;) {
    if (Date.now() - t0Demo >= DEMO_MAX_MS) { capped = true; break; }
    await page.waitForTimeout(DEMO_POLL_MS);
    const r = await demoRead();
    if (r === null) continue;
    rLast = r;
    samples += 1;
    const t = r.tSec ?? last;
    if (t > last + 0.05) { advancing += 1; lastMoveAt = Date.now(); }
    // THE REPLAY LOOPS, IT DOES NOT STOP. `ShadowCar.tsx:571` — `if
    // (clock.tSec > end) clock.tSec = loop ? loop.startSec : 0` — so the
    // playhead WRAPS and `playing` stays true for ever. „It finished" is
    // therefore a wrap after the playhead had got most of the way along, and
    // not a `playing === false` this transport will never produce.
    if (t < last - 0.5 && last >= (r.durationSec ?? 1) * 0.5) { wrapped = true; topT = Math.max(topT, last); break; }
    if (t > topT) topT = t;
    last = t;
    if (!midShot && r.durationSec && t >= r.durationSec * 0.45) {
      midShot = true;
      if (lastShotCostMs() <= DEMO_MID_SHOT_MAX_COST_MS) await shot("03d-demo-play");
    }
    if (endShotAt === null && r.durationSec && t >= r.durationSec * 0.85) {
      endShotAt = Number(t.toFixed(1));
      await shot("03d-demo-end");
    }
    if (Date.now() - lastMoveAt >= DEMO_STALL_MS) { stalled = true; break; }
  }
  const ranMs = Date.now() - t0Demo;

  // ── ⏸, REWIND, AND PROVE BOTH ────────────────────────────────────────────
  // A replay that stalled or ran out of budget never reached 85%, so its end
  // frame is taken here and is a picture of WHERE IT STOPPED. The name is the
  // same either way and the second it holds is published either way.
  if (endShotAt === null) {
    endShotAt = Number(topT.toFixed(1));
    await shot("03d-demo-end");
  }
  const objAfter = rLast.objectives;
  const egoAfter = rLast.ego;
  await press(page.locator(`${DEMO_DECK_SEL} button[aria-label="Пауза"]`));
  await page.waitForTimeout(600);
  // Back to 0:00 by the transport the student has — a pointer at the left edge
  // of the scrub bar, which is what `seekFromPointer` reads. `⏮` walks
  // ANNOTATIONS and would stop at the first one rather than at zero.
  const bar = page.locator(`${DEMO_DECK_SEL} [role="slider"]`).first();
  if (await bar.count().catch(() => 0)) {
    const box = await bar.boundingBox().catch(() => null);
    if (box) await bar.click({ position: { x: 1, y: Math.max(1, Math.round(box.height / 2)) }, timeout: 5000 }).catch(() => {});
  }
  await page.waitForTimeout(600);
  if (openedByUs) {
    await press(page.locator(`${DEMO_DECK_SEL} button[aria-expanded]`));
    await page.waitForTimeout(800);
  }
  // The transport buttons carry no `tabIndex={-1}` (the deck's own toggle
  // does, explicitly, „so this button must not take focus off the canvas"), so
  // a click leaves one of them focused. Give the canvas its focus back before
  // a single pedal key is sent.
  await page.evaluate(() => document.activeElement?.blur?.()).catch(() => {});
  const rEnd = await demoRead();
  demo.restored = {
    tSec: rEnd?.tSec ?? null,
    playLabel: rEnd?.playLabel ?? null,
    open: rEnd?.open ?? null,
    wantedOpen: openedByUs ? "false" : r0.open,
    ok:
      rEnd !== null &&
      (rEnd.tSec ?? 99) <= 1 &&
      rEnd.playLabel === "Пусни" &&
      rEnd.open === (openedByUs ? "false" : r0.open),
  };
  demo.replay = {
    durationSec: rLast.durationSec ?? null,
    reachedSec: Number(topT.toFixed(1)),
    ranMs,
    samples,
    advancingSamples: advancing,
    completed: wrapped,
    stalled,
    capped,
    startedAlreadyPlaying: startedPlaying,
    openedByHarness: openedByUs,
    midFrame: midShot,
    /** The second of the authored drive that `03d-demo-end.png` actually
     *  holds — see the note where it is taken. */
    endFrameAtSec: endShotAt,
  };
  const before = demoTaskIndex(objBefore);
  const after = demoTaskIndex(objAfter);
  demo.objectives = {
    before: objBefore,
    after: objAfter,
    indexBefore: before,
    indexAfter: after,
    credited: before !== null && after !== null ? after.index > before.index : null,
  };
  demo.ego = {
    source: "window.__camProbe (CameraRig.tsx, DEV BUILDS ONLY) — read as a witness, never as an input",
    before: egoBefore,
    after: egoAfter,
    movedM:
      egoBefore && egoAfter
        ? Number(Math.hypot(egoAfter.x - egoBefore.x, egoAfter.z - egoBefore.z).toFixed(2))
        : null,
  };

  const fin = wrapped
    ? "played to the end and wrapped"
    : stalled
      ? `STALLED — the playhead did not move for ${DEMO_STALL_MS / 1000}s`
      : capped
        ? `hit this beat's ${DEMO_MAX_MS / 1000}s cap`
        : "stopped for a reason this beat did not name";
  note(
    `  DEMONSTRATION: pressed ▶ on the product's own «🎬 Демонстрация» deck — ${fin}. Playhead reached ` +
      `${demo.replay.reachedSec}s of ${demo.replay.durationSec ?? "?"}s in ${Math.round(ranMs / 1000)}s ` +
      `(${advancing} of ${samples} samples advancing). Frames: 03d-demo-open (0:00, parked), ` +
      `${midShot ? "03d-demo-play (mid-route), " : ""}03d-demo-end — and that last one holds ${endShotAt ?? "?"}s of the ` +
      `authored drive, NOT necessarily its final second: this replay LOOPS rather than stopping, so the frame is taken ` +
      `at 85% and never after the wrap.`,
  );
  note(
    `        WHAT THOSE FRAMES ARE: the product's OWN authored correct drive, replayed by its own transport. NOT a ` +
      `\`right\` leg, NOT a \`wrong\` leg, and no evidence whatever about an imperfect human drive. They are the ` +
      `reference a 04-* frame can be held against on a lesson whose correct drive no leg has ever finished.`,
  );
  note(
    `        AND WHAT THEY DO NOT CARRY: the camera is the PARKED car's cockpit, so the ghost is in shot only while it ` +
      `is in that car's field of view — measured against the traces, about the first 100 m of route, ending at the ` +
      `first turn (sc-junction-scan: in shot at 0:21 = 76 m out, gone by 0:38 = 106 m out and already 90° round). ` +
      `So these frames answer about the START of the route and NOT about a place several hundred metres down it. ` +
      `The transport second, the caption bank, the annotation ticks and the objective banner ARE in every one of them.`,
  );
  note(
    `        AND THE GRADED CAR DID NOT MOVE: ${demo.ego.movedM === null ? "the pose probe did not answer (a production build has none)" : `${demo.ego.movedM} m`}` +
      ` — the objective banner read «${(objBefore[0] ?? "(none)").slice(0, 60)}» before and ` +
      `«${(objAfter[0] ?? "(none)").slice(0, 60)}» after` +
      `${demo.objectives.credited === null ? "" : demo.objectives.credited ? ", so an objective CREDITED during the replay" : ", so NOTHING credited"}. ` +
      `That is the mechanism and not a defect: ShadowCar drives a translucent clone kinematically, with no physics ` +
      `body and no write into the grading path, so the car rules/engine.ts grades stayed on the spawn mark. WHAT IT ` +
      `SETTLES is narrower and real — the uncredited objectives on this lesson cannot be explained by «there is no ` +
      `drivable success path here», because the product ships a recording of that path and these frames are it.`,
  );
  if (stalled || capped) {
    loud(
      `THE DEMONSTRATION DID NOT FINISH (${fin}) — 03d-demo-end is a picture of the MIDDLE of the authored drive, ` +
        `not of its end, and the part of the route after ${demo.replay.reachedSec}s is unphotographed on this lane.`,
    );
  }
  if (!demo.restored.ok) {
    loud(
      `THE SCENE WAS NOT RESTORED AFTER THE DEMONSTRATION (playhead ${demo.restored.tSec ?? "?"}s, transport reads ` +
        `«${demo.restored.playLabel ?? "?"}», deck open=${demo.restored.open ?? "?"} against ${demo.restored.wantedOpen}). ` +
        `Every verdict in this corpus was taken with the ghost parked on the trace's first sample; a ghost car and a ` +
        `blue ribbon standing somewhere else sit INSIDE the windscreen band the guidance loop reads, so the steering ` +
        `numbers from the drive below are NOT comparable with any other drive.`,
    );
  }
}
/* ── AN ORDINARY LANE MAY NOT BE QUIET ABOUT A DEAD WHEEL — round 3 ─────────
 *
 * HERE — before the positive control, and NOT inside the drive loop — because
 * this is the LAST INSTANT OF THE DRIVE AT WHICH THE CAR IS UNTOUCHED. The
 * ladder is finished, the world is running, and no pedal has been pressed: the
 * car is on the spawn mark at 0 км/ч. Turn the wheel here and, by round 2's own
 * measurement, the world leans ~155 px and comes back to NET 0 px on release —
 * the car does not move, and the drive that follows is the drive that would
 * have happened anyway.
 *
 * Five seconds later the positive control has the throttle down and, in `right`
 * mode, never lifts it again before the loop. That is what the first draft of
 * this block measured, and it correctly refused: „the car is not parked and
 * idle (15 км/ч, throttle DOWN)". A check that runs after this point either
 * lies or stays silent, and this programme has no use for either.
 */
await timed("steer", steerLiveness);
saveStatus({ steering });

// …AND NOW ▶, IN THE SAME WINDOW AND FOR THE SAME REASON: the demonstration
// can only be watched from a standstill. See PRESS THE PRODUCT'S OWN PLAY
// BUTTON above — its whole body is declared there so that this call and the
// liveness call above it stay adjacent.
await timed("demo", runDemo);
saveStatus({ demo });

/* ── POSITIVE CONTROL — the car must leave zero, or nothing after this is
 *    evidence. TWO THINGS ABOUT IT ARE NOT DECORATION. BOTH WERE MEASURED AS
 *    DEFECTS FIRST AND WRITTEN AS RULES SECOND.
 *
 * ── 1. IT DOES NOT PRESS FORWARD ON A LESSON WHOSE ONLY EXIT IS BACKWARDS ──
 *
 * THE ARM GATE IN THE DRIVE LOOP ALREADY KNOWS THIS. Its own comment says it
 * in as many words — «the car is parked nose-in and the demand is up from the
 * first frame, so a check that only runs after a completed roll would drive
 * the car FORWARD out of a bay whose only exit is backwards before it ever
 * looked» — and that is why the gate was moved to fire in any phase, on the
 * first tick. The rule was applied to the loop and NOT to the five seconds of
 * full forward throttle that run before the loop opens.
 *
 * MEASURED, sc-park-bay-exit-rev, whose task 1 is «излез от мястото на заден
 * ход, с пешеходна скорост» — leave the space IN REVERSE, at walking pace. The
 * car is nose-in a perpendicular bay; forward is a wall. On every leg of that
 * lesson in every sweep this corpus holds, and directly in the frame the
 * harness takes to prove the world is frozen:
 *
 *   POSITIVE CONTROL: 0 км/ч after 5 s of throttle
 *   !! CAR DID NOT MOVE — every frame after this is a frozen world, not a drive.
 *   [03b-frozen] 0 км/ч gear=D card=teach/peek
 *       · Учебен момент +1 Удар в неподвижно препятствие
 *
 * The lesson is already failed — one dangerous error, 10 наказателни точки,
 * «прекратява се изпитът» — at `03b-frozen`, BEFORE the drive loop opens,
 * BEFORE reverse is armed, BEFORE one metre of the manoeuvre is driven. The
 * debrief then counts exactly ONE dangerous error, and it is this one. That is
 * the whole of «this lesson has never once been observed working»: the
 * instrument crashes the car into the obstacle and then photographs the
 * wreck as a product defect. A finding filed off those frames describes the
 * harness, and this programme ranks convicting a correct lesson worst of all.
 *
 * So the demand is READ FIRST, off the product's own two surfaces, and when
 * the task asks for R the forward press is not made at all. The measurement is
 * DEFERRED rather than faked: the drive loop's arm gate reaches R at t≈1 s on
 * this very lesson, and the `cockpit` census — which counts every read on
 * every beat and every tick, in both modes — is the whole-drive witness that
 * answers „was there ever a moving car?" without anyone having to ram a wall
 * to find out. `classifyDrive` reads that census first.
 *
 * ── 2. IT LETS GO THE MOMENT IT HAS ITS ANSWER ─────────────────────────────
 *
 * The old press was `throttle(true)` … `waitForTimeout(5000)` … read, AND NO
 * RELEASE. `throttle()` is a latch — it early-returns when the key is already
 * where it is asked to be — and the next call on a MODE=«right» lane is the
 * loop's own `if (MODE !== "right") await throttle(true)`, which does nothing.
 * So the drive loop opened with the pedal still on the floor from the control,
 * and `topSpeed`'s FIRST sample was the burst rather than the drive.
 *
 * MEASURED on w18, 37 legs: `top` came back EXACTLY EQUAL to the positive
 * control on eight of them (48/48, 43/43, 41/41, 45/45, 40/40, 39/39, 42/42,
 * 43/43) — every one a `right` lane, every one a number the drive never
 * earned. It is not a cosmetic figure: a verifier closed a «this drive crawls»
 * row by quoting «reaches 43 км/ч», and on that same sc-vu-emergency leg no
 * photographed beat ever exceeded 31 км/ч while `top` printed 43. An
 * instrument that reports its own calibration burst as the subject's
 * achievement can refute any finding about speed, in the reassuring direction,
 * for ever.
 *
 * SO THE PRESS ENDS WHEN IT HAS PROVED WHAT IT EXISTS TO PROVE, and the
 * threshold is the PRODUCT'S OWN, not a number invented here.
 * `TOUCH_HINT_MOVING_KMH` and `DEMO_DECK_MOVING_KMH` are both 5 and both
 * tested as `Math.abs(speedKmh) > 5`: crossing that line is what hides the
 * first-run touch hint and stands the demonstration deck down. Every frame in
 * this corpus was taken with those two surfaces in the state a car that had
 * crossed 5 км/ч puts them in, so a control that stopped SHORT of it would
 * change the occlusion of the whole sweep. The dial rounds
 * (`displaySpeedKmh` is `Math.round(Math.abs(v))`), so a displayed 6 is at
 * least 5.5 and is therefore over the latch with the rounding taken against
 * us — which is why the release reads 6 and not 5.
 *
 * The 5 s stays as the CEILING, unchanged: a car that has not moved by then
 * has answered the question the other way. */
const POSITIVE_CONTROL_MS = 5000;
const POSITIVE_CONTROL_POLL_MS = 250;
/** Displayed км/ч at or above which the car is PAST the product's own 5 км/ч
 *  moving latch even after the dial's rounding — see the note above. */
const POSITIVE_CONTROL_MOVING_KMH = 6;

const exitIsBackwards = await reverseDemand();
/** What the positive control did, published whole. `deferred` is a real answer
 *  and a reader must be able to tell it from „the control was never run". */
const positiveControl = { direction: null, kmh: null, heldMs: null, demandedBy: exitIsBackwards, why: null };
let moved = 0;
/** Whether `moved` is a MEASUREMENT. On a deferred lane it is not, and the
 *  steering overrule below may not read it as one — `0 <= 0` is true and would
 *  silently convert „we did not ask" into „the world is frozen". */
let movedKnown = false;

if (exitIsBackwards !== null) {
  positiveControl.direction = "deferred";
  positiveControl.why =
    `the live task asks the car to leave IN REVERSE («${exitIsBackwards}»), so the forward press this control has always ` +
    `made would be driving into whatever the bay noses onto — that press is the collision, not the measurement`;
  note(
    `  POSITIVE CONTROL: DEFERRED — ${positiveControl.why}. The drive loop's arm gate takes R from the first tick, and the ` +
      `cockpit census (every beat and every tick, both modes) is what answers „was there ever a moving car?" on this lane.`,
  );
} else {
  positiveControl.direction = "forward";
  const pressedAt = Date.now();
  await throttle(true);
  while (Date.now() - pressedAt < POSITIVE_CONTROL_MS) {
    await page.waitForTimeout(POSITIVE_CONTROL_POLL_MS);
    moved = (await read()).kmh;
    if (moved >= POSITIVE_CONTROL_MOVING_KMH) break;
  }
  // THE RELEASE IS THE REPAIR. Everything above it only decides how long the
  // press lasts; this line is what stops the burst bleeding into the drive.
  await throttle(false);
  positiveControl.heldMs = Date.now() - pressedAt;
  positiveControl.kmh = moved;
  movedKnown = true;
  note(
    `  POSITIVE CONTROL: ${moved} км/ч after ${(positiveControl.heldMs / 1000).toFixed(1)} s of throttle` +
      `${moved >= POSITIVE_CONTROL_MOVING_KMH ? ` (released on the product's own ${POSITIVE_CONTROL_MOVING_KMH} км/ч moving latch — the pedal is UP entering the drive)` : ` (the full ${POSITIVE_CONTROL_MS / 1000} s ceiling; pedal released)`}`,
  );
  if (moved <= 0) {
    loud(`CAR DID NOT MOVE — every frame after this is a frozen world, not a drive.`);
    await beat("03b-frozen");
  }
}
saveStatus({ positiveControl });
/* ── AND THE POSITIVE CONTROL GETS TO OVERRULE THE STEERING VERDICT ─────────
 *
 * A SIM THAT IS NOT RUNNING LOOKS EXACTLY LIKE A CHANNEL THAT IS NOT WIRED, and
 * of the two the second is the accusation. `livenessLeg` already voids a pair of
 * byte-identical bands, but a world with moving traffic and a frozen EGO is not
 * byte-identical — it renders, it just does not drive — and that world would
 * have read "dead" and blamed the wheel for it.
 *
 * The positive control is the discriminator and it runs five seconds later, so
 * the verdict is revisited rather than asserted early. This can only ever move a
 * lane from an accusation to „I do not know", which is the only direction a
 * correction is allowed to run in here.
 *
 * ── AND A DEFERRED CONTROL RUNS IT THE SAME WAY, FOR A DIFFERENT REASON ────
 *
 * On a lane whose task asks for R the forward press is not made, so `moved` is
 * an INITIALISER and not a reading. The old test was `moved <= 0`, and `0 <= 0`
 * is true — a deferred control would have read as „the car did not move" and
 * this branch would have fired on the strength of a number nobody measured.
 * That is the same conflation the cockpit census exists to kill one level down.
 *
 * So `movedKnown` gates the measured path, and the deferred path gets its own
 * branch reaching the SAME state by the honest route: the discriminator did not
 * run, therefore the two explanations cannot be told apart, therefore the
 * channel is unjudged. Identical destination, different sentence — and the
 * sentence is what a reader quotes.
 */
if (movedKnown && moved <= 0 && steering.channel.state === "dead") {
  steering.channel.overruledBy = "positive-control";
  steering.channel.state = "untested";
  steering.channel.why =
    `the wheel moved the world less than ${LIVE_MIN_DEG}°, but the car ALSO did not leave 0 км/ч under ${POSITIVE_CONTROL_MS / 1000} s of throttle — ` +
    `so this measures a sim that is not running, and the channel is unjudged rather than dead`;
} else if (!movedKnown && steering.channel.state === "dead") {
  steering.channel.overruledBy = "positive-control-deferred";
  steering.channel.state = "untested";
  steering.channel.why =
    `the wheel moved the world less than ${LIVE_MIN_DEG}°, and the discriminator that tells „a dead channel" from „a sim that ` +
    `is not running" DID NOT RUN on this lane — its forward press is withheld where the task asks the car to leave in reverse ` +
    `(«${positiveControl.demandedBy}»). Two explanations, no measurement between them, so the channel is unjudged rather than dead`;
}
{
  const ch = steering.channel;
  if (ch.state === "live") {
    note(`  STEER CHANNEL: LIVE — ${ch.why} · ${ch.costMs} ms`);
  } else if (ch.state === "dead") {
    /* ── THE REGISTER IS DELIBERATE ────────────────────────────────────────
     * This is written in the same voice as «THE SOURCE TREE MOVED DURING THIS
     * DRIVE», and for the same reason: both are statements that the drive which
     * follows cannot support a whole CLASS of finding. A tree that moved cannot
     * certify a closure; a wheel that is dead cannot support one word about
     * position, lane, turning or manoeuvre. Anything less than a refusal here
     * and the lane is back to the silence that cost 376 drives.
     */
    loud(
      `THE STEERING CHANNEL IS DEAD ON THIS DRIVE — the wheel was turned at the spawn mark and the world did not answer. ` +
        `${ch.why}. This car can accelerate and brake and cannot turn, so NO finding this lane produces about position, lane ` +
        `keeping, turning, manoeuvring or „no drivable success path" is admissible: they describe the instrument. The frames ` +
        `are real; what they are evidence OF is the harness. Re-drive on a harness whose channel reads LIVE.`,
    );
    await shot("03s-steer-DEAD");
  } else {
    // AND „UNTESTED" IS LOUD TOO, JUST NOT AS LOUD. It is the state in which
    // the old conflation is still live on this lane — nobody knows whether the
    // wheel works — and a reader who is not told that will read the drive as if
    // somebody did.
    loud(
      `THE STEERING CHANNEL WAS NOT TESTED ON THIS DRIVE: ${ch.why}. This lane cannot tell „the wheel works" from „the wheel ` +
        `is dead", so treat every position/lane/turning claim below as resting on an unverified instrument.`,
    );
  }
}
saveStatus({ steering });

// ── THE DRIVE ──────────────────────────────────────────────────────────────
//
// `wrong` is one act: hold the throttle and never touch the brake.
//
// `right` USED TO BE ONE ACT TOO — "brake at loop iteration 4, wait 7 s,
// resume" — and that is a hard-coded clock, not driving. Measured on
// sc-zebra-approach at 3.5 s per iteration, iteration 4 lands at t≈19 s and THE
// WHOLE SCENARIO IS OVER AT t≈16 s: the car went 15 → 45 → 59 км/ч flat out,
// took the crossing at 59 and was convicted of «Непропускане на пешеходец».
// The right drive and the wrong drive were THE SAME DRIVE, and a 644-drive
// sweep would have published the wrong column twice. A fixed iteration cannot
// be the right moment on 161 scenarios of different lengths — nothing about
// that number was scenario-independent except the number.
//
// So `right` is a CAUTIOUS DRIVER expressed as a control law, and every clause
// of it is written against the product rather than against a lesson:
//
//  1. CLOSED-LOOP SPEED at 2 Hz, holding CRUISE_KMH. That is under every
//     «дръж под N км/ч» cap the advisor is allowed to print (advisor.ts
//     `shownCapKmh` clamps to the posted limit) and under the 30 км/ч bar
//     `crossingApproachMaxKmh` grades an approach by (rules/types.ts). It names
//     no scenario.
//  2. STOP AND LOOK ON A CADENCE — roll, then a FULL standstill, then roll —
//     so the car cannot arrive anywhere it has not first been at rest near. A
//     learner who creeps and stops is the safe direction; a lesson that
//     punishes it is a finding, and it will print as one.
//  3. HONOUR EVERY LAWFUL WAIT THE PRODUCT DECLARES. While the car is still,
//     the engine may declare the standstill to BE the manoeuvre
//     (finish.ts `stepYieldWait` → advisor.ts `YIELD_VOICE_COPY`). That
//     declaration is a CLOSED union of five reasons — roundabout, Б1, Б2, red
//     light, pedestrian — shared by all 161 scenarios, not any lesson's copy,
//     and it is the only thing that can tell a driver "keep waiting" without
//     eyes on the 3D scene. It is what makes the right drive right: the zebra's
//     pedestrian is on the carriageway for ~11.6 s and no constant pause can be
//     both long enough there and honest anywhere else.
/* ═══════════════════════════════════════════════════════════════════════════
 * THE STEERED DRIVE — the loop, its refusals, and the record it leaves
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * THE ROUND BEFORE THIS ONE PROVED THE WHEEL WORKS AND STILL DID NOT TURN IT.
 * Every scripted trace pressed throttle and brake only, so all 376 Wave C
 * drives — and every drive behind the original 1,712 findings — were a car
 * travelling in a straight line. This is the loop that steers, and everything
 * below it exists to stop it doing more damage than the silence it replaces.
 *
 * ── THE DANGER, WHICH IS LARGER THAN THE ONE IT REMOVES ────────────────────
 *
 * A DRIVE THAT STEERS BADLY IS WORSE THAN A DRIVE THAT CANNOT STEER. A car
 * that cannot turn fails visibly and its failures are attributable to the
 * instrument. A car that turns badly fails like a bad student — it wanders,
 * clips kerbs, misses gates — and a judge reading the frames has no way to
 * tell that from a product defect. So the deliverable here is not "the car
 * steers". It is "the car steers AND every drive carries an honest measure of
 * how well it tracked, so a finding can be qualified by it".
 *
 * That measure is `guidance.tracking` in `_audit-status.json`, and the three
 * properties it has to keep are:
 *
 *   IT CANNOT BE QUIET. Every moving sample is recorded, including the ones
 *   where nothing was seen. `seenFrac` is the fraction of the moving drive the
 *   loop was actually closed on, and a drive under `MIN_SEEN_FRAC` is stamped
 *   `verdict: "blind"` — which says in words that it was an unsteered drive.
 *
 *   IT CANNOT BE ZERO BY ACCIDENT. `aimFrom` returns `seen: false`, never a 0
 *   error, when the ribbon is not there. A no-signal sample that averaged in
 *   as 0 would make a blind drive read as a perfect one, and that is precisely
 *   the reassuring-direction failure this whole programme is about.
 *
 *   IT CARRIES ITS OWN OBJECTION. `caveat` states, on every drive, that the
 *   ribbon is a ROAD CENTRELINE and not a lane — so no lane-position finding
 *   may be drawn from a drive steered by it. See lib/guidance.mjs for the
 *   product's own words on that.
 *
 * ── WHY THE PIXELS, WHEN A CHEAPER SIGNAL EXISTS AND WAS MEASURED ──────────
 *
 * `window.__camProbe` publishes the chassis pose at frame rate for ~10 ms a
 * read — thirty times cheaper than a screenshot. It is NOT used to steer, and
 * the reason is a rule this round is bound by: it exists only in dev builds
 * (`process.env.NODE_ENV !== "production"` in CameraRig.tsx), so a loop closed
 * around it would be driving by something no student's build publishes, and
 * could pass a lesson whose VISIBLE guidance is broken — hiding exactly the
 * defect a student would hit. It is read as an independent WITNESS instead
 * (`guidance.witness`), where being dev-only costs nothing, because a
 * measurement of where the car went does not have to be a measurement a
 * student could make.
 */
const guidance = {
  /** what the loop closes around, named so a consumer never has to infer it */
  signal: "RouteGuidance ghost ribbon (--accent-2 #17e1c4), read off the windscreen",
  /** the loop RAN on this lane. Absent before 2026-08-21 and indistinguishable
   *  from a lane whose loop had silently died. */
  wired: true,
  /** "steering" · "blind" · "unaffordable" · "no-band" · "not-run" */
  state: "not-run",
  why: "the drive has not started",
  band: null,
  degPerPx: null,
  scans: 0,
  scanCostMs: [],
  /** every moving sample, seen or not — see "IT CANNOT BE QUIET" above */
  samples: [],
  commands: 0,
  commandMs: 0,
  tooSmall: 0,
  errors: 0,
  /** samples on which the wheel was LEFT DOWN across a scan (a confirmed turn) */
  sustainHolds: 0,
  /** …and the ones that hit SUSTAIN_MAX, i.e. were stopped by the guard */
  sustainCapped: 0,
  /** …and every time a sustained hold was let go. Published because a hold
   *  that is never released is a car turning with nothing watching. */
  sustainReleases: 0,
  /** …of which were forced by the drive leaving the roll phase with the wheel
   *  still down. Non-zero means the loop was holding a turn at the moment the
   *  roll budget expired; see `guideLeaveRoll`. Zero on a lane that never
   *  sustained is not evidence of anything. */
  phaseExitReleases: 0,
  /** sightings too thin to command a manoeuvre on — see CONFIDENT_BAND_PX */
  thinSightings: 0,
  tracking: null,
  witness: null,
  caveat: null,
};
let guideBandGeom = null;
let guidePrevErrDeg = null;
let guideSustainRun = 0;
let guideSustainDir = 0;
let guideHeldBySustain = false;
const guideWitness = [];
/**
 * WHAT A SCAN IS ALLOWED TO COST, AND THE REFUSAL WHEN IT COSTS MORE.
 *
 * A screenshot was measured at ~360-790 ms on the mobile leg and 11,999 ms on
 * the `pc` leg. At twelve seconds a frame a control law would correct the car
 * once every twelve seconds, which is not a control law — it is a straight
 * line with occasional flinches, and it would look exactly like a steered
 * drive in the status file. So the cost is MEASURED on this lane, over the
 * first few scans, and if the median is past this the loop stops, says
 * `state: "unaffordable"`, and the drive continues UNSTEERED AND LABELLED.
 */
const GUIDE_SCAN_BUDGET_MS = 1500;
const GUIDE_COST_SAMPLE = 3;

/** The band of the windscreen the ribbon is looked for in, and the ruler. */
async function guideBand() {
  const g = await page
    .evaluate(() => {
      const shell = document.querySelector("[data-sim-shell]") ?? document.body;
      let best = null;
      for (const c of shell.querySelectorAll("canvas")) {
        const r = c.getBoundingClientRect();
        if (!best || r.width * r.height > best.w * best.h) best = { x: r.x, y: r.y, w: r.width, h: r.height };
      }
      return best ? { ...best, dpr: window.devicePixelRatio || 1 } : null;
    })
    .catch(() => null);
  if (!g || g.w < 80 || g.h < 80) return null;
  return {
    // 40 % → 72 % of the canvas: below the horizon, above the bonnet and the
    // dash. MEASURED by looking at the frames it produces, not reasoned about
    // — `band-rest.png` from the survey shows the ribbon running the full
    // width of this slice with the dashboard only intruding at the corner.
    clip: {
      x: Math.round(g.x),
      y: Math.round(g.y + g.h * 0.40),
      width: Math.round(g.w),
      height: Math.round(g.h * 0.32),
    },
    canvas: g,
    dpr: g.dpr,
    degPerPx: degPerPxAtCentre(g.w * g.dpr),
  };
}

/**
 * The HUD rectangles this scan must ignore, in the band's own pixel space.
 *
 * NOT COSMETIC. The survey measured a 2,483-pixel blob at a fixed x that did
 * not move while the car did 59 км/ч — page furniture being read as world. A
 * controller steering toward a screen-fixed object drives in a circle, and its
 * tracking record would call the circle competent.
 */
const guideMasks = (band) =>
  page
    .evaluate(
      ({ bx, by, bw, bh, dpr }) => {
        /* ── MASK WHAT PAINTS, NOT WHAT IS NAMED — MEASURED THE HARD WAY ────
         *
         * The first version masked the box of every `[data-hud]` element, and
         * the first steered drive of sc-ov-lane-keeping came back
         * `ribbon seen on 0/51 moving samples (0%)` on a lesson the survey had
         * photographed with 10,431–12,637 ribbon pixels on the glass.
         *
         * THE CAUSE, off the census in the same run: `data-hud="touch-controls"`
         * is `absolute inset-0` and measures 852 × 393 — the ENTIRE VIEWPORT.
         * It is a transparent, `pointer-events-none` container for two thumb
         * pads and it paints nothing at all. Masking its box masked the world.
         *
         * The refusal held, which is the only reason this is a footnote and
         * not a wave of false findings: the lane said BLIND, said the drive was
         * a straight line, and refused to publish an error number. A version
         * that had averaged its blindness in as 0° would have certified this as
         * the best-tracked drive in the sweep.
         *
         * So the predicate is STYLE-DERIVED, and it is `lib/probe.mjs`'s —
         * the same "any pixel a UI element paints on is not free" rule the
         * screen budget uses, including the translucent cases. An element masks
         * its box only if it paints on it (background, backdrop-filter,
         * box-shadow, border, outline), or is replaced content, or carries its
         * own glyphs. A transparent wrapper masks nothing, at any size. */
        const alpha = (c) => {
          const m = /^rgba?\(([^)]+)\)/.exec(c || "");
          if (!m) return 0;
          const p = m[1].split(",").map((s) => Number.parseFloat(s));
          return p.length < 4 ? 1 : p[3];
        };
        const REPLACED = new Set(["IMG", "SVG", "CANVAS", "VIDEO", "INPUT", "SELECT", "TEXTAREA", "PROGRESS", "METER"]);
        const paints = (el, cs) => {
          if (REPLACED.has(el.tagName)) return true;
          if (alpha(cs.backgroundColor) > 0) return true;
          if (cs.backgroundImage && cs.backgroundImage !== "none") return true;
          if (cs.backdropFilter && cs.backdropFilter !== "none") return true;
          if (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== "none") return true;
          if (cs.boxShadow && cs.boxShadow !== "none") return true;
          for (const side of ["Top", "Right", "Bottom", "Left"]) {
            const w = Number.parseFloat(cs[`border${side}Width`]);
            const st = cs[`border${side}Style`];
            if (w > 0 && st !== "none" && st !== "hidden" && alpha(cs[`border${side}Color`]) > 0) return true;
          }
          // Its OWN glyphs, not a descendant's — otherwise every wrapper up to
          // <body> would claim the text inside it.
          for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return true;
          return false;
        };
        const out = [];
        const roots = document.querySelectorAll(
          '[data-hud],[data-sim-overlay],[role="dialog"],[role="alertdialog"],[role="status"],[role="slider"]',
        );
        const seen = new Set();
        for (const root of roots) {
          for (const el of [root, ...root.querySelectorAll("*")]) {
            if (seen.has(el)) continue;
            seen.add(el);
            const r = el.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) continue;
            const cs = getComputedStyle(el);
            if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
            if (!paints(el, cs)) continue;
            const x = (r.x - bx) * dpr;
            const y = (r.y - by) * dpr;
            const w = r.width * dpr;
            const h = r.height * dpr;
            if (x + w <= 0 || y + h <= 0 || x >= bw || y >= bh) continue;
            out.push({ x, y, w, h });
          }
        }
        return out;
      },
      { bx: band.clip.x, by: band.clip.y, bw: band.clip.width * band.dpr, bh: band.clip.height * band.dpr, dpr: band.dpr },
    )
    .catch(() => []);

/** The dev-only pose probe, read as a witness and never as a control input. */
const guideWitnessRead = () =>
  page
    .evaluate(() => {
      const p = window.__camProbe;
      return p ? { x: p.chassisX, z: p.chassisZ, kmh: p.speedKmh } : null;
    })
    .catch(() => null);

/**
 * ONE TICK OF THE CONTROL LOOP.
 *
 * Records first, commands second, and records the not-commanding too. The
 * order matters: an early `return` that skipped the sample is how a loop goes
 * quiet, and a quiet loop is indistinguishable from one that was not needed.
 */
async function guideTick(kmh, tElapsedMs, dtMs) {
  const tSec = Math.round(tElapsedMs / 1000);
  /* ── AND THE POSE GOES ON THE SAMPLE, NOT ONLY INTO A SCALAR — 2026-08-22 ──
   *
   * THE TRACKING RECORD WAS NOT INDEPENDENT OF THE CONTROLLER, AND THAT IS THE
   * ONE PROPERTY IT HAD TO HAVE. `errDeg` is computed from the SAME scan that
   * drove the wheel, so any error in the pixel test — the objective pillar,
   * the ground pool, the kerbside sign post and the turn chevron are all
   * `--accent-2` too — moves the car AND the number that grades it in the same
   * direction. A drive steering at a sign post reports a small error and is
   * certified «tracked».
   *
   * The cure is already on disk and was thrown away every tick. Every scenario
   * ships `content/traces/<id>/shadow-correct.trace.json` — 20 Hz `x,y,
   * headingDeg` of a drive whose own validation rule is «must replay with ZERO
   * violations» — in the same frame as `__camProbe` (district y = −world z).
   * `guideWitness` sampled exactly that pose every tick and published only
   * pathM/netM/straightness, so the per-tick positions never left the process
   * and NO LATER READER COULD COMPUTE A CROSS-TRACK ERROR IN METRES from the
   * artifacts. Carrying `wx/wz` on the sample costs two numbers a tick and
   * makes every drive ever taken checkable, offline, against the product's own
   * recorded correct line — by somebody who does not trust this loop. */
  let witnessNow = null;
  const push = (s) =>
    guidance.samples.push({
      tSec,
      kmh,
      dtMs,
      wx: witnessNow ? Number(witnessNow.x.toFixed(2)) : null,
      wz: witnessNow ? Number(witnessNow.z.toFixed(2)) : null,
      ...s,
    });
  /* ── THE WITNESS IS READ FIRST, AND ON EVERY TICK, WHATEVER THE LOOP DOES ──
   *
   * It used to be read only on a tick that completed a scan, and the
   * consequence was measured on the run that watched the cost refusal fire:
   * a drive that travelled about 90 m published `witness path 3 m net 3 m`,
   * because the loop stopped scanning after three samples and the witness
   * stopped with it. A field that looks like a measurement of the drive and is
   * actually a measurement of two ticks is worse than no field — and it read
   * in the reassuring direction for anyone checking whether the car had moved.
   *
   * It is also exactly backwards. The witness costs ~10 ms and is INDEPENDENT
   * of the control loop, so it is most valuable on the drives where the loop
   * failed: „this drive did not steer" and „here is where it went anyway" are
   * the two halves a judge needs together. */
  {
    const w = await guideWitnessRead();
    if (w) { witnessNow = w; guideWitness.push({ tSec, ...w }); }
  }
  if (guidance.state === "unaffordable" || guidance.state === "no-band") {
    push({ seen: false, errDeg: null, nearDeg: null, dir: null, holdMs: 0, why: guidance.state });
    return;
  }
  if (!(kmh >= TUNE.MIN_KMH)) {
    // Not a moving sample — `summariseTracking` filters these out of every
    // rate it computes, but it is still written down, because "the car was
    // stopped" and "the loop skipped a tick" must not look the same.
    if (guideHeldBySustain) { await steer(null, kmh); guideHeldBySustain = false; guidance.sustainReleases += 1; }
    guideSustainRun = 0;
    guideSustainDir = 0;
    push({ seen: false, errDeg: null, nearDeg: null, dir: null, holdMs: 0, why: `below ${TUNE.MIN_KMH} км/ч` });
    return;
  }
  if (guideBandGeom === null) {
    guideBandGeom = await guideBand();
    if (guideBandGeom === null) {
      guidance.state = "no-band";
      guidance.why = "no canvas big enough to read a road band from — this drive cannot be steered and did not steer";
      loud(guidance.why.toUpperCase());
      push({ seen: false, errDeg: null, nearDeg: null, dir: null, holdMs: 0, why: "no-band" });
      return;
    }
    guidance.band = guideBandGeom.clip;
    guidance.degPerPx = Number(guideBandGeom.degPerPx.toFixed(5));
  }

  const t0scan = Date.now();
  let aim;
  try {
    const masks = await guideMasks(guideBandGeom);
    const png = await page.screenshot({ clip: guideBandGeom.clip });
    aim = aimFrom(scanBand(decodePng(png), masks));
  } catch (error) {
    guidance.errors += 1;
    if (guideHeldBySustain) { await steer(null, kmh).catch(() => {}); guideHeldBySustain = false; guidance.sustainReleases += 1; }
    guideSustainRun = 0;
    guideSustainDir = 0;
    push({ seen: false, errDeg: null, nearDeg: null, dir: null, holdMs: 0, why: `scan failed: ${String(error?.message ?? error).slice(0, 80)}` });
    return;
  }
  const scanMs = Date.now() - t0scan;
  guidance.scans += 1;
  guidance.scanCostMs.push(scanMs);

  // ── THE COST REFUSAL, MEASURED RATHER THAN ASSUMED ──────────────────────
  if (guidance.scanCostMs.length === GUIDE_COST_SAMPLE) {
    const med = [...guidance.scanCostMs].sort((a, b) => a - b)[GUIDE_COST_SAMPLE >> 1];
    if (med > GUIDE_SCAN_BUDGET_MS) {
      guidance.state = "unaffordable";
      guidance.why =
        `reading the ribbon costs ${med} ms a sample on this leg (budget ${GUIDE_SCAN_BUDGET_MS} ms), so a control loop ` +
        "here would correct the car about once every " + (med / 1000).toFixed(1) + " s. THIS DRIVE DID NOT STEER — it is a " +
        "straight-line drive and must be read as one.";
      loud(`THE STEERING LOOP CANNOT AFFORD TO RUN ON THIS LEG — ${guidance.why}`);
      await steerRelease();
      guideHeldBySustain = false;
      // …AND THE SAMPLE THAT TRIGGERED THE REFUSAL IS STILL WRITTEN DOWN. The
      // first draft `return`ed above this line, so the one tick that decided
      // the whole drive would not steer was the one tick missing from the
      // record. Every other refusal in this loop records itself; a refusal that
      // does not is the same silence in a smaller place.
      push({ seen: aim.seen, errDeg: null, nearDeg: null, ribbonPx: aim.total, dir: null, holdMs: 0, sustain: false, scanMs, why: "unaffordable" });
      return;
    }
  }

  const errDeg = aim.seen ? aim.aimPx * guideBandGeom.degPerPx : null;
  const nearDeg = aim.seen && aim.nearPx !== null ? aim.nearPx * guideBandGeom.degPerPx : null;

  /* ── THE CALLER'S BOOK OF CONSECUTIVE AGREEMENT ────────────────────────────
   * `steerCommand` is pure and cannot see history, so the run of same-sign
   * large-error samples is counted here and handed to it. It is reset by
   * ANYTHING that breaks the evidence: a small error, a sign change, a sample
   * with no sighting at all. That reset is what makes „repeated" mean
   * something — a run that survived a blind sample would be a run built partly
   * out of not looking. */
  if (errDeg !== null && Math.abs(errDeg) >= TUNE.SUSTAIN_DEG && Math.sign(errDeg) === guideSustainDir) {
    guideSustainRun += 1;
  } else if (errDeg !== null && Math.abs(errDeg) >= TUNE.SUSTAIN_DEG) {
    guideSustainRun = 1;
    guideSustainDir = Math.sign(errDeg);
  } else {
    guideSustainRun = 0;
    guideSustainDir = 0;
  }

  const cmd = steerCommand({ errDeg, prevErrDeg: guidePrevErrDeg, kmh, sustainRun: guideSustainRun, confident: aim.confident === true });
  if (aim.seen && !aim.confident) guidance.thinSightings += 1;
  if (cmd.tooSmall) guidance.tooSmall += 1;

  if (cmd.sustain) {
    // THE WHEEL STAYS DOWN THROUGH THE NEXT SCAN. Only reachable after
    // SUSTAIN_CONFIRM consecutive same-sign samples over SUSTAIN_DEG — see the
    // measurement on sc-junction-left in lib/guidance.mjs. `steer` is
    // idempotent on a direction already held, so this does not re-press.
    await steer(cmd.dir, kmh);
    guidance.sustainHolds += 1;
    guideHeldBySustain = true;
    if (guideSustainRun >= TUNE.SUSTAIN_CONFIRM + TUNE.SUSTAIN_MAX - 1) guidance.sustainCapped += 1;
    if (guidance.state === "not-run" || guidance.state === "blind") {
      guidance.state = "steering";
      guidance.why = "the loop saw the ribbon and is holding a sustained turn";
    }
  } else if (cmd.dir !== null) {
    // PULSE, THEN CENTRE. Outside a confirmed turn the wheel is never left
    // over between samples: the rate limiter would keep winding it toward full
    // lock across ticks, and one missed sample would leave the car turning
    // with nothing watching.
    // …AND THIS RELEASE IS BANKED LIKE EVERY OTHER — 2026-08-22, verifier.
    // It was the ONE path that let a sustained hold go without incrementing
    // `sustainReleases`, so a drive that ended every turn by pulsing out of it
    // published `sustainHolds: 6, sustainReleases: 0` — a reader checking the
    // two for balance would conclude six holds had leaked when none had. The
    // field's own note says it counts „every time a sustained hold was let go";
    // it has to be true on every branch or it is not a count of anything.
    if (guideHeldBySustain) { await steer(null, kmh); guideHeldBySustain = false; guidance.sustainReleases += 1; }
    await steer(cmd.dir, kmh);
    await page.waitForTimeout(cmd.holdMs);
    await steer(null, kmh);
    guidance.commands += 1;
    guidance.commandMs += cmd.holdMs;
    if (guidance.state === "not-run" || guidance.state === "blind") {
      guidance.state = "steering";
      guidance.why = "the loop saw the ribbon and is commanding the wheel";
    }
  } else if (guideHeldBySustain) {
    // THE RELEASE, AND IT IS UNCONDITIONAL. Every path that is not a sustain
    // ends with the wheel centred — including a sample that saw nothing. A
    // held key surviving a blind sample is a car turning with nothing watching,
    // which is the failure mode this whole round exists to make impossible.
    await steer(null, kmh);
    guideHeldBySustain = false;
    guidance.sustainReleases += 1;
  }
  if (guidance.state === "not-run" && aim.seen) {
    guidance.state = "steering";
    guidance.why = "the loop saw the ribbon; no correction was needed yet";
  } else if (guidance.state === "not-run") {
    // ── A LOOP THAT RAN AND SAW NOTHING IS NOT A LOOP THAT NEVER RAN ───────
    // It said `state: "not-run", why: "the drive has not started"` for a
    // whole 51-sample drive, and the loud line at the end quoted that sentence
    // verbatim beside 231.8 m of measured travel — a status file describing a
    // drive that had happened as one that had not begun. The state moves to
    // `blind` on the FIRST scan that comes back empty; a later sighting
    // promotes it to `steering`, so the field always names the last thing
    // that actually happened.
    guidance.state = "blind";
    guidance.why =
      `the loop ran and the guidance ribbon was not in the band (${aim.why}). Nothing is being steered toward, and ` +
      "this drive is a straight line until that changes.";
  }
  guidePrevErrDeg = errDeg;
  push({
    seen: aim.seen,
    errDeg: errDeg === null ? null : Number(errDeg.toFixed(2)),
    nearDeg: nearDeg === null ? null : Number(nearDeg.toFixed(2)),
    ribbonPx: aim.total,
    confident: aim.confident === true,
    source: aim.source,
    dir: cmd.dir,
    holdMs: cmd.holdMs,
    sustain: cmd.sustain === true,
    scanMs,
    why: aim.seen ? cmd.why : aim.why,
  });
}

/**
 * LET GO OF THE WHEEL WHEN THE ROLL PHASE ENDS — 2026-08-22, verifier.
 *
 * THE DEFECT, READ OUT OF THE TICK LOOP AND TRUE AT THE BYTES THIS WAS WRITTEN
 * AGAINST. `guideTick` is the ONLY caller of `steer()` on the drive path, and
 * it runs ONLY under `if (phase === "roll")`. The sustained-turn branch is the
 * one path that deliberately leaves a key DOWN across a scan — and eight lines
 * after it returns, the same tick can transition to `phase = "stop"`. Nothing
 * in the stop branch, the reverse branch or the reverse-arm gate touches the
 * wheel, so a confirmed turn that lands on the last roll tick holds full lock
 * through the whole stop phase (STOP_MS = 3 s plus the deceleration, minimum
 * `MIN_PHASE_TICKS` ticks) with no scan watching and no sample recorded.
 *
 * That is precisely the state `guideTick`'s own comment says is impossible —
 * „a car turning with nothing watching" — and it is worse in the reverse case,
 * where the wheel would still be wound over as the car backs up.
 *
 * It is bounded by the sustain gate (two consecutive same-sign samples over
 * SUSTAIN_DEG), so it needs a junction to fire — which is exactly the lane
 * where a wrong extra half-second of lock decides the verdict.
 *
 * The release is banked and COUNTED, so „the loop let go because the phase
 * ended" is a visible event and not an inference: `sustainReleases` rises and
 * `phaseExitReleases` says how many of them were this.
 */
async function guideLeaveRoll() {
  if (!guideHeldBySustain) return;
  await steer(null).catch(() => {});
  guideHeldBySustain = false;
  guideSustainRun = 0;
  guideSustainDir = 0;
  guidance.sustainReleases += 1;
  guidance.phaseExitReleases += 1;
}

const TICK_MS = 500;          // the control law's rate
const FRAME_MS = 5000;        // the textual beat's cadence
const EXPENSIVE_SHOT_MS = 20_000; // floor for the frame cadence when frames are dear
/** …and the cadence scales with what a frame actually costs. At 12 s a frame,
 *  a 20 s spacing still spends 60 % of the drive photographing it: the first
 *  backoff took the tick from 18 s to 8 s and that was not enough — the car
 *  reached 43 км/ч between samples and was convicted for it. Eight times the
 *  cost is a frame budget of ~12 %, which is the most a drive can pay and still
 *  be a drive. */
const SHOT_COST_MULTIPLE = 8;
/**
 * THE SPEED CAP IS THE BRAKE, AND THE THROTTLE IS HELD — after trying it the
 * other way and measuring the result.
 *
 * With 6 s ticks the held throttle took the car 17 → 43 км/ч between two
 * samples, so I made it a 400 ms PULSE: bounded acceleration per tick, in
 * principle independent of the box. It made things worse, and the breakdown
 * says why — `pedals ×21 med 4054ms`. A pulse is two `page.keyboard` calls,
 * each of which is a CDP round trip that queues behind the scene's own
 * main-thread work at ~2 s apiece on this box. So 400 ms of throttle cost 4 s
 * of wall clock, the roll phase spent its whole budget on two pulses, and the
 * car crawled at 0-1 км/ч for 215 s and finished no objective at all.
 *
 * The cheap actuation is the one that changes state RARELY: hold the throttle
 * (one call), let the brake cap the top (one call), and keep a coast band
 * between so neither fires while the car is at speed. What made the 43 км/ч
 * overshoot survivable was not the pulse, it was getting `read()` out of every
 * tick — the tick fell from 6 s to ~2 s and the overshoot fell with it.
 */
const BRAKE_CAP_OVER_KMH = 2;
/** The fewest control-law ticks a phase may last, whatever the clock says. On a
 *  loaded box a tick is seconds, and a phase that lasts one tick is a stop that
 *  never reaches rest — the clock alone is not enough to describe an act. */
const MIN_PHASE_TICKS = 2;
const DRIVE_BUDGET_MS = 210_000;
/**
 * …AND THE BUDGET IS WALL CLOCK, SO IT HAS TO FOLLOW THE TICK.
 *
 * A drive is a fixed amount of ROAD; the seconds it takes are the box's.
 * On the pc leg a tick costs 3.5 s instead of 0.7 s, so the same creep-and-
 * stop drive that finishes in ~70 s on mobile needs ~300 s there — and the
 * measured run proves the drive was correct, not stuck: objective 1 ticked,
 * zero faults, and the pedestrian yield was declared at t=204 s, four seconds
 * after the 210 s budget would have cut it off. Cutting a good drive one
 * objective short and filing it as «Премини пътеката — not done» is exactly
 * the false negative this whole harness exists to stop.
 *
 * So a slow box buys more seconds, never a different drive. The extension is
 * announced, and the tick report beside it says why it was needed.
 */
const SLOW_TICK_MS = 2000;
const SLOW_DRIVE_BUDGET_MS = 420_000;
/**
 * THE CRUISE TARGET IS SET BY THE ACTUATION LATENCY, NOT BY TASTE.
 *
 * Every pedal change is a `page.keyboard` call, i.e. a CDP round trip that
 * queues behind the scene's own main-thread work — MEASURED at 2.0 s median,
 * 4.2 s worst on the pc leg. So between deciding to lift and the key actually
 * coming up, a car under full throttle keeps accelerating for ~2-4 s, and this
 * car does ~5 km/h per second (0 -> 45 in 9 s, measured on the wrong-mode
 * run). Peak speed is therefore roughly (CRUISE - 3) + 20, whatever the
 * target says.
 *
 * The number that matters is 30: `crossingApproachMaxKmh` (rules/types.ts) is
 * the bar above which approaching an occupied crossing is a 10-point опасна
 * fault. A target of 20 put the peak at 43 km/h and earned exactly that fault
 * on a run whose whole point was to drive correctly. 12 puts it near 29 — and
 * the coast band plus the early brake keep it there.
 */
const CRUISE_KMH = 12;
const ROLL_MS = 4000;        // the safety cap on a roll; the real bound is metres
/**
 * HOW FAR THE CAR MAY CREEP BETWEEN TWO STOPS — AND IT IS METRES, NOT SECONDS,
 * BECAUSE SECONDS ARE THE BOX AND METRES ARE THE ROAD.
 *
 * A 4 s roll is ~22 m on a quiet box and ~40 m on a loaded one, and 25 m is the
 * radius inside which the runtime will even consider a car to be waiting for a
 * pedestrian (finish.ts, and templates-flow's own ETA note: a car under the
 * 10 km/h floor meets the crosser at 25 m). So a time-bounded roll can carry
 * the car straight through the one zone where stopping IS the manoeuvre —
 * measured, twice, as a «Непропускане на пешеходец» on a right-mode run whose
 * speed never once exceeded the cap. The cap was never the problem; the
 * distance between two looks was.
 *
 * Integrating the speed samples costs nothing and states the intent directly:
 * never travel further than this without coming to rest and looking. CRUISE
 * drops to 14 km/h for the same reason — at 3.9 m/s even a 3.7 s tick is 14 m,
 * so the bound is enforceable one tick at a time on the slowest leg.
 */
const ROLL_DISTANCE_M = 15;
const STOP_MS = 3000;
const LAWFUL_WAIT_MAX_MS = 45_000; // finish.ts YIELD_WAIT_MAX_S is 180 — well inside

/* ── THE `wrong` LEG COMES TO REST — 2026-08-28 ─────────────────────────────
 *
 * WHAT WAS MISSING IS BIGGER THAN A MISSING BRANCH. `phase` starts at "flat"
 * on every MODE=«wrong» lane and there is no `flat` case — but no case could
 * have helped, because THE WHOLE PHASE BRANCH IS NESTED INSIDE
 * `if (MODE === "right")`: the gate opened for the „does this task want R?"
 * question closes 296 lines later, past the end of the reverse branch. A
 * `flat` case appended to that chain would have been DEAD CODE. So a wrong leg
 * ran no control law at all — one `throttle(true)` before the loop,
 * re-asserted after a pause drain, and nothing else for the whole budget.
 * Measured on this tree, sc-pk-ban-stop/pc/wrong, before this change:
 *
 *     DRIVE: wrong · top 59 км/ч · 0 full stops
 *     TICKS: 51 (0 of them driving)
 *
 * Fifty-one ticks, zero of them acting. It never steered, never braked, and
 * NEVER CAME TO REST.
 *
 * WHY „never came to rest" COSTS MORE THAN THE LEGS IT SPOILS. Every «stopping
 * where forbidden» offence is defined by WHERE THE CAR COMES TO REST.
 * `rules/engine.ts`'s ban-zone reducer bills ILLEGAL_STOP_IN_BAN_ZONE only
 * while `speed <= fullStopMaxSpeedKmh` (1 км/ч, rules/types.ts) inside an
 * authored В27 span, SUSTAINED for `banZoneStopRestSec` (4 s), and it resets
 * the episode the moment the car moves faster than `movingSpeedKmh` (5). A car
 * that never stops can commit that offence on NO lesson in the corpus — which
 * is why every ban-zone lesson in this audit convicts its wrong leg of
 * «Настъпи сблъсък» plus «Превишена скорост» and never of чл. 98, and why the
 * sc-pk-ban-stop wrong leg TICKS ITS FIRST OBJECTIVE — «Премини през зоната
 * В27, без да спираш ✓ 0:29». The leg that exists to break the rule keeps it.
 *
 * WHAT THIS IS NOT. It does NOT make `wrong` follow the route. The leg still
 * holds the throttle flat out with no cruise cap and never touches the wheel,
 * because a flat-out straight line is what earns its convictions and is what
 * every verdict ever taken from a wrong leg MEANS. The only thing added is
 * that it can stop.
 *
 * WHY PERIODIC, AND NOT „a stop in the marked zone". This harness has no world
 * position — it reads a windscreen and a cluster — so a stop aimed at a zone
 * would need per-lesson coordinates, i.e. an instrument that decides in
 * advance which conviction it wants. That is manufacturing a fault. A car that
 * stops carelessly wherever it happens to be IS the offence („само за
 * минутка"), and the ENGINE keeps every acquittal it already has: a lead
 * within `banZoneStopQueueGapM`, a person within `banZoneVruAheadM`, a stop
 * line within 25 m, an armed crossing, reverse gear. The instrument supplies
 * the behaviour; the product decides whether that place was forbidden.
 *
 * AND NOT „one stop at the end of the route" either: this leg ends in a
 * collision at t≈27 s on the lesson above, so a terminal rest is a rest that
 * usually never happens.
 */
/**
 * HOW FAR THE `wrong` LEG RUNS FLAT OUT BETWEEN TWO CARELESS RESTS — METRES,
 * NOT SECONDS, and for a sharper version of ROLL_DISTANCE_M's reason: this leg
 * runs four times faster, so a 10 s cadence is 40 m on a slow box and 140 m on
 * a fast one, and a 140 m gap steps over most authored spans without touching
 * one.
 *
 * THE NUMBER IS MEASURED AGAINST THE SPANS IT HAS TO LAND IN. The 16 authored
 * `noStopping` spans in `content/world/*.json` run 7.5 m to 216 m with a
 * MEDIAN of 50 m; the two this change is aimed at are 120 m (`pk-ban-v1`,
 * y 70..190) and a contiguous 60 m (`pk-busstop-v1`, y 150..210). A rest lands
 * roughly a stopping distance PAST the decision — the leg reaches ~40 км/ч
 * over 45 m, the pedal takes the measured ~2 s CDP round trip to land, and the
 * car needs a few seconds more to shed it — so 45 m of cadence puts a rest
 * about every 85 m of road: one or two inside a 120 m span, about one inside a
 * 60 m one.
 *
 * SHORTER WOULD CONVICT MORE OFTEN AND COST THE LEG ITS TOP SPEED, which is
 * where most wrong-leg convictions actually come from («Превишена скорост» ×8
 * on sc-ov-oneway; 58.9 км/ч in a 50 zone on the drive quoted above). 45 m of
 * run-up still peaks this car over an urban limit.
 */
const FLAT_REST_EVERY_M = 45;
/** …and a CLOCK backstop, because a dial that is not in the DOM reads −1 and
 *  the metre integral then stands still for ever — the exact conflation the
 *  `cockpit` census exists for. Same shape as ROLL_MS backing ROLL_DISTANCE_M. */
const FLAT_REST_MAX_MS = 20_000;
/** How long the car stands there: TWICE the engine's `banZoneStopRestSec`
 *  (4 s), so one slow tick cannot cut a rest short of the bar it exists to
 *  clear. */
const FLAT_REST_HOLD_MS = 8000;
/** …and when it will not come to rest at all, SAY SO and roll on. The `stop`
 *  phase gives a 12 км/ч cruise STOP_MS + 8 s = 11 s; this leg arrives at four
 *  times that speed with the same actuation latency, so it gets more room
 *  before it declares the brake unanswered. */
const FLAT_REST_GIVEUP_MS = 15_000;

/* ── THE PACE TAPE — A DRIVE OF REPRODUCIBLE LENGTH — 2026-08-28 ────────────
 *
 * MEASURED ON THIS TREE BEFORE ANYTHING WAS BUILT. `sc-ed-d2-city-run`,
 * `pc/right`, three drives at 405e2056 minutes apart, nothing changed between
 * them and nothing else running on the box:
 *
 *     run 1  184 s · 16 full stops · witness path 201.6 m · 37 frames · 20 т.
 *     run 2  265 s · 25 full stops · witness path 352.1 m · 52 frames · 20 т.
 *     run 3  180 s · 15 full stops · witness path 207.3 m · 36 frames · 30 т.
 *
 * Same code, same server, same lesson: 1.5x the wall clock and 1.75x the road.
 * A ledger row reading «the objective was not credited» rests on WHICH of those
 * drives it happened to get, and that is why 154 findings sit at UNJUDGED.
 *
 * The authored correct drive of that lesson — `content/traces/<id>/shadow-
 * correct.trace.json`, the recording the product's own «🎬 Демонстрация» deck
 * plays at «0:00 / 1:50» — covers 971 m in 110.8 s, tops 45 км/ч, and comes to
 * rest TWICE (at 331 m and at 870 m). This harness covered a fifth to a third
 * of that road, in twice the time, stopping fifteen to twenty-five times, and
 * its dial reads 13 -> 3 -> 0 -> 13 -> 3 -> 0 for the whole drive.
 *
 * ── IT IS NOT A SPEED SETTING AND IT IS NOT STEERING. IT IS THE ROLL BOUND ──
 *
 *     if ((rollM >= ROLL_DISTANCE_M || now - phaseAt >= ROLL_MS) && …)
 *
 * `ROLL_MS` is 4000 and its own comment calls it "the safety cap on a roll; the
 * real bound is metres". MEASURED, IT IS THE ONLY BOUND THAT EVER FIRES. A car
 * leaving a standstill under CRUISE_KMH = 12 spends its first seconds
 * accelerating and needs about 6 s to make 15 m, so the 4 s cap always arrives
 * first, at about 12 m — run 1 above made 201.6 m over 16 rests, i.e. 12.6 m a
 * cycle, against a 15 m bound. The distance bound is dead code. What is left is
 * four seconds of whatever the box managed, which is the BOX'S number and not
 * the road's, and that is the mechanism under the spread.
 *
 * ── WHAT THIS ADDS, AND WHY IT CANNOT MAKE A DRIVE SLOWER ──────────────────
 *
 * The shipped shadow trace is a per-lesson SPEED-BY-DISTANCE profile of a drive
 * the product itself calls correct. Folded to one reading per metre it answers
 * the question the roll phase has always had to guess — how fast may this car
 * be HERE — so the target becomes
 *
 *     target = max(CRUISE_KMH, the SLOWEST the authored drive was
 *                              over the road just ahead)
 *
 * and the `max` is the entire safety argument. The tape may raise the target
 * and can never lower it. Every stretch where the authored drive is slow — a
 * crossing, a car park, a junction approach — is therefore driven exactly as it
 * is driven today, at 12 км/ч behind a 15 m look cadence, and every measurement
 * ROLL_DISTANCE_M was bought with still holds there. Only the stretches the
 * product itself drives fast go faster.
 *
 * It is also the per-lesson governor `sc-park-gap-long:6e1d02ce` asks for, from
 * the other side: that row is 40 км/ч in a 20 zone convicting the instrument's
 * own throttle, and this lesson's tape never exceeds 18 км/ч, so the target
 * there is capped by the authored drive rather than by a global constant.
 *
 * ── AND THE LOOK CADENCE FOLLOWS THE SPEED, IN SECONDS ─────────────────────
 *
 * ROLL_DISTANCE_M = 15 exists because 25 m is the radius inside which the
 * runtime will even consider a car to be waiting for a pedestrian, so the car
 * must come to rest more often than that. At 12 км/ч, 15 m is 4.5 s of driving,
 * and it is the SECONDS that carry the argument: a look every 4.5 s catches a
 * crossing the car is closing on at 12 км/ч. Above CRUISE_KMH the cadence
 * therefore holds 4.5 s of CRUISING, plus the room the car needs to get up to
 * speed — because charging the acceleration against the look budget is exactly
 * what pins this car at 13 км/ч: at a 45 км/ч target the car needs 56 m to
 * arrive, and a 56 m roll would end at the moment it did.
 *
 * ── WHAT IT MEASURED, AND IT IS THE ONLY REASON TO KEEP IT ────────────────
 *
 * Same box, same server, same commit, three drives each. `witness path` is the
 * dev-only pose probe and is independent of everything above.
 *
 *   sc-fo-motorway-gap / pc / right
 *     before (11 stored drives, this box and five earlier commits)
 *       264–280 s, ALL cut off by the budget · 26–27 full stops ·
 *       317.9–364.5 m · driving top 15–19 км/ч · objective 1 credited at
 *       4:07 when at all, objective 2 NEVER credited in the corpus
 *     after
 *       110 / 116 / 120 s, all three ENDED NATURALLY · 1–3 stops ·
 *       693.8 / 721.4 / 735.4 m · top 110–112 км/ч ·
 *       objective 1 at 0:57 / 0:58 / 0:59, objective 2 at 1:35 / 1:37 ·
 *       one run ИЗДЪРЖАН, 0 наказателни точки, three stars
 *
 *   sc-ed-d2-city-run / pc / right
 *     before  184 / 265 / 180 s · 16 / 25 / 15 stops · 37 / 52 / 36 frames ·
 *             201.6 / 352.1 / 207.3 m  (1.75x)
 *     after    93 /  94 /  93 s ·  1 /  1 /  1 stop  · 19 / 19 / 19 frames ·
 *             201.3 / 210.2 / 200.5 m  (1.05x)
 *
 * THE SECOND TABLE IS THE POINT, not the first. That lesson still ends in a
 * crash and still credits only objective 1 — the change did not repair it —
 * but it now does the SAME thing three times, so one drive of it is a sample
 * of a distribution instead of a draw from one. A graded beat that lands at
 * 0:57, 0:58 and 0:59 on three consecutive runs is what this stage was for.
 *
 * THE RESIDUAL RISK IS WRITTEN DOWN RATHER THAN HIDDEN, and the drive report
 * repeats it on every lane that uses a tape: where the tape is fast the car now
 * covers >100 m between two rests, so the blanket cadence is no longer what
 * catches a crossing — the TAPE is, because the authored drive slows where it
 * must and the target follows it down. That is a better signal and a weaker
 * guarantee, and a «Непропускане на пешеходец» on a pace drive has to be read
 * against `pace.targets` before it is filed against the product.
 *
 * ── THE INDEX IS AN ODOMETER, AND IT IS APPROXIMATE ────────────────────────
 *
 * The tape is indexed in metres and the metres come from integrating the
 * SPEEDOMETER — `[aria-label^="Скорост "]`, the dial a student reads — and NOT
 * from `window.__camProbe`. The pose probe is right there and it is exact, and
 * the rule this file already keeps is that nothing a student's build does not
 * publish may enter the control law, or a drive could pass a lesson whose
 * visible instruments are broken. So the probe stays a WITNESS: this stage
 * publishes what it witnesses ABOUT the index (`pace.alignment`) and never
 * steers by it.
 *
 * The known error is named because it is not small. The liveness checks that
 * run BEFORE the control law — «POSITIVE CONTROL: 44 км/ч after 5 s of
 * throttle» plus two ~1 s steering legs — move the car perhaps 50 m down the
 * road, and the odometer starts at zero regardless. The index therefore LAGS
 * the car: the target is the tape's reading for ground already covered, which
 * is conservative on the way up and LATE TO SLOW DOWN. `PACE_ALIGN_SLACK_M`
 * below buys the lookahead enough room to cover it, and `pace.alignment`
 * measures the real offset on every drive so the next stage can decide with a
 * number instead of an argument.
 */
/** Km/h this car gains per second under full throttle — the figure CRUISE_KMH's
 *  own note measured ("0 -> 45 in 9 s"). */
const PACE_ACCEL_KMH_PER_S = 5;
const PACE_ACCEL_MPS2 = PACE_ACCEL_KMH_PER_S / 3.6;
/** The look cadence IN SECONDS, taken from the shipped constants rather than
 *  invented: 15 m at 12 км/ч is 4.5 s. */
const LOOK_EVERY_S = ROLL_DISTANCE_M / (CRUISE_KMH / 3.6);
/** How far ahead the target reads, in seconds of travel — the room to lift and
 *  shed speed before the authored drive slows. */
const PACE_LOOKAHEAD_S = 4;
/** …and a floor under it, so a crawling car still reads past its own bonnet. */
const PACE_LOOKAHEAD_MIN_M = 10;
/** …and the slack for the index lag described above. Capped as a FRACTION of
 *  the route as well, or a 106 m parking lesson would read its whole route as
 *  «slow ahead» and never leave 12 км/ч for a reason that has nothing to do
 *  with the lesson. */
const PACE_ALIGN_SLACK_M = 60;
const PACE_ALIGN_SLACK_FRAC = 0.15;
/** The floor and ceiling on what the throttle gives up to actuation latency. */
const PACE_LIFT_MIN_KMH = 3;
const PACE_LIFT_MAX_KMH = 20;
/** At or under this the tape is standing still. */
const PACE_REST_KMH = 1;

const PACE_TAPE_PATH = resolve(REPO_ROOT, "content", "traces", SCENARIO, "shadow-correct.trace.json");

/** Everything this stage did, published so a judge never has to infer it from a
 *  speed trace. */
const pace = {
  used: false,
  why: "not attempted",
  tape: null,
  odoM: 0,
  rolls: 0,
  capHits: 0,
  /** every CHANGE of target, with the metre it happened at */
  targets: [],
  alignment: null,
};
/** Metres since the control law started, integrated from the dial. */
let paceOdoM = 0;

const loadPaceTape = () => {
  // A `wrong` leg is not a correct drive and must not be given one: its
  // convictions are earned flat out and in a straight line, and every verdict
  // ever taken from a wrong leg means that.
  if (MODE !== "right") {
    pace.why = "MODE=wrong — the tape is a correct drive and only a `right` leg may be driven to it";
    return null;
  }
  if (!existsSync(PACE_TAPE_PATH)) {
    pace.why = `no shadow trace on disk at ${PACE_TAPE_PATH}`;
    return null;
  }
  let doc;
  try {
    doc = JSON.parse(readFileSync(PACE_TAPE_PATH, "utf8"));
  } catch (error) {
    pace.why = `the shadow trace would not parse (${String(error?.message ?? error)})`;
    return null;
  }
  const s = Array.isArray(doc?.samples) ? doc.samples : [];
  if (s.length < 2) {
    pace.why = `the shadow trace holds ${s.length} sample(s)`;
    return null;
  }
  const bins = [];
  let d = 0;
  let top = 0;
  let stops = 0;
  let inStop = false;
  let moved = false;
  for (let i = 1; i < s.length; i += 1) {
    const a = s[i - 1];
    const b = s[i];
    const v = Number(b.speedKmh);
    if (![a.x, a.y, b.x, b.y, v].every((n) => Number.isFinite(n))) continue;
    d += Math.hypot(b.x - a.x, b.y - a.y);
    const k = Math.max(0, Math.floor(d));
    // ONE READING PER WHOLE METRE, AND IT IS THE SLOWEST SAMPLE IN IT — the
    // safe direction, because a bin read too fast asks this car to be faster
    // than the drive the product calls correct.
    // BIN ZERO IS THE EXCEPTION AND TAKES THE FASTEST. A recording opens with
    // the car at rest, and a standing START is not a stop to be reproduced; a
    // `min` there would ask the harness to brake to a halt before it had moved.
    bins[k] = bins[k] === undefined ? v : k === 0 ? Math.max(bins[k], v) : Math.min(bins[k], v);
    if (v > top) top = v;
    if (v > PACE_REST_KMH) moved = true;
    const at = v <= PACE_REST_KMH;
    if (at && !inStop && moved) {
      stops += 1;
      inStop = true;
    }
    if (!at) inStop = false;
  }
  const total = Math.floor(d);
  if (!(total >= 1)) {
    pace.why = `the shadow trace covers ${d.toFixed(1)} m`;
    return null;
  }
  // A metre nothing sampled inherits the last one that was. At 130 км/ч a 50 ms
  // sample is 1.8 m from the next, so about half the bins on a motorway are
  // empty — and an empty bin read as zero is a phantom stop.
  let last = bins[0] === undefined ? CRUISE_KMH : bins[0];
  for (let k = 0; k <= total; k += 1) {
    if (bins[k] === undefined) bins[k] = last;
    else last = bins[k];
  }
  return {
    path: PACE_TAPE_PATH.slice(REPO_ROOT.length + 1).replace(/\\/g, "/"),
    samples: s.length,
    durationSec: Number(doc?.meta?.durationSec) || null,
    totalM: Number(d.toFixed(1)),
    topKmh: Number(top.toFixed(1)),
    stops,
    bins,
    first: { x: Number(s[0].x), y: Number(s[0].y) },
  };
};
const paceTape = loadPaceTape();
if (paceTape !== null) {
  pace.used = true;
  pace.why = "driving to the authored shadow's speed-by-distance profile";
  // The per-metre readings themselves stay out of the status file — a 1 km
  // route is a thousand numbers a reader will never check, and the file they
  // came from is named right here.
  pace.tape = {
    path: paceTape.path,
    samples: paceTape.samples,
    durationSec: paceTape.durationSec,
    totalM: paceTape.totalM,
    topKmh: paceTape.topKmh,
    stops: paceTape.stops,
  };
}

/** The slowest the authored drive was over the road just ahead — and NEVER
 *  below CRUISE_KMH, which is the whole safety argument above. */
const paceTarget = (odoM, kmh) => {
  if (paceTape === null) return CRUISE_KMH;
  // PAST THE END OF THE AUTHORED ROUTE THE TAPE HAS NOTHING TO SAY, and the
  // honest answer there is the fixed creep this harness has always driven.
  if (odoM > paceTape.totalM) return CRUISE_KMH;
  const slack = Math.min(PACE_ALIGN_SLACK_M, PACE_ALIGN_SLACK_FRAC * paceTape.totalM);
  const aheadM = Math.max(PACE_LOOKAHEAD_MIN_M, (Math.max(0, kmh) / 3.6) * PACE_LOOKAHEAD_S) + slack;
  const lastBin = paceTape.bins.length - 1;
  const from = Math.min(lastBin, Math.max(0, Math.floor(odoM)));
  const to = Math.min(lastBin, Math.floor(odoM + aheadM));
  let v = Infinity;
  for (let k = from; k <= to; k += 1) if (paceTape.bins[k] < v) v = paceTape.bins[k];
  return Number.isFinite(v) ? Math.max(CRUISE_KMH, v) : CRUISE_KMH;
};

/** What the throttle gives up to the actuation latency. The car keeps
 *  accelerating for about a tick plus a CDP round trip after the decision to
 *  lift, at PACE_ACCEL_KMH_PER_S a second — so at the 110 ms ticks measured on
 *  this box this sits on its floor, 3, the same number `CRUISE_KMH - 3` has
 *  always used, and unlike that constant it GROWS with a slower box instead of
 *  standing still while the overshoot does not. Never more than 40% of the
 *  target, or a slow box would null a 12 км/ч aim entirely. */
const paceLift = (target) => {
  const want = (((medianTick() || TICK_MS) * 2) / 1000) * PACE_ACCEL_KMH_PER_S;
  const ceiling = Math.max(PACE_LIFT_MIN_KMH, Math.min(PACE_LIFT_MAX_KMH, target * 0.4));
  return Math.max(PACE_LIFT_MIN_KMH, Math.min(ceiling, want));
};

/** The metres a roll may cover before the car comes to rest and looks. At or
 *  below CRUISE_KMH it is ROLL_DISTANCE_M, unchanged and deliberately so. */
const paceLookM = (target) =>
  target <= CRUISE_KMH
    ? ROLL_DISTANCE_M
    : (target / 3.6) ** 2 / (2 * PACE_ACCEL_MPS2) + (target / 3.6) * LOOK_EVERY_S;

/** …and the clock cap behind it, sized at three times the seconds that roll
 *  SHOULD take — get to speed, then hold it for the look interval. With a tape
 *  this is a safety cap and never the bound, which is the correction this whole
 *  stage is: ROLL_MS, measured, was always the bound. */
const paceRollCapMs = (target) =>
  paceTape === null ? ROLL_MS : Math.max(ROLL_MS, 3000 * (target / 3.6 / PACE_ACCEL_MPS2 + LOOK_EVERY_S));

/** The stems of every sentence the product says when standing still is correct.
 *  Two from `yieldWaitAdvisorPrompt` (four of the five reasons open «Чакаш
 *  правилно», Б2 opens with its own), two from the yield VOICE's named and
 *  settled cards. Closed union, five reasons, zero lessons. */
const LAWFUL_WAIT_RE =
  /Чакаш правилно|пълното спиране е задължително|Защо чакаш|Чакането Е маневрата/;

// EVERY SURFACE THAT FREEZES THE WORLD, ON BOTH DEVICE CLASSES.
//
// THE DEFECT THIS SELECTOR EXISTS FOR, caught by this harness's own loud line
// and then by looking at the frame it named. The drain used to be
// `overlay === "teach"`, i.e. `[data-sim-overlay="teach"]` — which is the
// COMPACT teach card. On a roomy screen the very same teach moment is a
// different component: `TeachMomentOverlay` renders
// `[role="dialog"][aria-modal="true"][aria-labelledby="teach-moment-title"]`
// with a «Разбрах — продължи» button and NO `data-sim-overlay` attribute at all.
// So on `pc` the seatbelt card came up at t≈13 s, the drain looked for a handle
// that does not exist there, and the sim stayed paused for the remaining 152
// seconds of the budget. The speedometer froze at the 17 км/ч it had when the
// card arrived — a plausible constant, the exact failure mode the speed probe
// rule was written for — and the run reported «the car would not come to rest
// in 11s of brake» six times before ending on a forced abort with 0 objectives.
// That is what the loud lines are for; a quiet harness would have filed it as
// "PC credits nothing".
//
// The other two roomy pauses are the same shape and are covered by the same
// selector: `MicroQuizOverlay` (`micro-quiz-title`) and
// `MistakeConsequenceOverlay` (`mistake-consequence-title`). The end screen is
// NOT a dialog — it is a plain div under `[data-hud="end-screen"]` — so this
// can never eat the result screen.
const PAUSE_SEL = '[data-sim-overlay="teach"], [role="dialog"][aria-modal="true"]';
/**
 * …AND THE CLICKING FORM OF IT IS `:visible`-SCOPED, WHICH IS THE SAME LESSON
 * A THIRD TIME. The first version of this drain located `PAUSE_SEL` and took
 * `.first()`. It DETECTED the roomy teach card correctly (the census does its
 * own visibility test) and then could not press a single control on it:
 *
 *   !! a blocking pause layer (teach-moment-title) has no control this harness
 *      can press — the world is frozen from here.
 *
 * `.first()` is first in DOM ORDER, and the authenticated PC shell carries a
 * `[role="dialog"][aria-modal="true"]` that is present but not painted earlier
 * in the document than the scene. So `layer` was the wrong dialog, its
 * «Разбрах» count was 0, its button list was empty, and the drain gave up on a
 * card whose button was 400 px wide on screen. Exactly the failure the ladder
 * was rewritten for, in a second place. A union selector must be filtered to
 * what is ON THE GLASS before `.first()` means anything.
 */
const PAUSE_VISIBLE =
  '[data-sim-overlay="teach"]:visible, [role="dialog"][aria-modal="true"]:visible';

const probe = () =>
  page
    .evaluate(
      ({ waitSrc, pauseSel, revSrc, revPurposeSrc, revStaySrc, revSel, gearSel }) => {
        const sp = document.querySelector('[aria-label^="Скорост "]');
        const paused = [...document.querySelectorAll(pauseSel)].find((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 1 && r.height > 1;
        });
        // `innerText` forces a layout flush, and this runs at 2 Hz for the
        // whole drive. Scoped to the play shell, not `document.body`: on `pc`
        // the body also holds the nav rail, the keyboard-shortcut list and the
        // demonstration deck, none of which can ever carry a yield line.
        const shell = document.querySelector("[data-sim-shell]") ?? document.body;
        return {
          kmh: sp ? Number((sp.getAttribute("aria-label").match(/Скорост (\d+)/) || [0, -1])[1]) : -1,
          overlay: document.querySelector("[data-sim-overlay]")?.getAttribute("data-sim-overlay") ?? "-",
          pause: paused
            ? paused.getAttribute("aria-labelledby") ??
              paused.getAttribute("aria-label") ??
              paused.getAttribute("data-sim-overlay") ??
              "dialog"
            : null,
          end:
            document.querySelector('[data-hud="end-screen"]') !== null ||
            document.querySelector('[data-hud="end-bar"]') !== null ||
            document.querySelector('[data-sim-overlay="end"]') !== null,
          // The MATCHED SENTENCE, not just a boolean: when a hold runs long
          // the log has to be able to say WHICH of the product's wait lines is
          // still on the glass, because a live advisor prompt («Чакаш
          // правилно…») and a lingering notice about a wait that already
          // happened («Чакането Е маневрата») mean opposite things.
          lawfulWait: (shell.innerText.match(new RegExp(waitSrc)) ?? [null])[0],
          // ── DOES THE PRODUCT WANT R RIGHT NOW ────────────────────────────
          // Folded into THIS evaluate rather than given its own, and that is
          // not tidiness: a second round trip costs 2.0 s on the `pc` leg (the
          // measured `evaluate` median there), which at 2 Hz is a third of
          // every tick spent asking a question whose answer changes once a
          // lesson. Two named surfaces, no innerText of the shell — see
          // REVERSE_DEMAND_SEL for why the scope is the whole point.
          reverseWant: (() => {
            // NO RECT TEST — see the note on GEAR_SEL. Measured on the live
            // rig, `[data-hud="objective-banner"]` reports a 0 × 0 box while
            // holding «Задача 1/3 Потегли с оглед и заеми изходната позиция»
            // and painting it legibly, so a `>4px` filter read every task
            // title as absent and no lesson ever asked for reverse.
            // `innerText` is itself the render test: it returns "" for a
            // surface that is not being laid out.
            let t = "";
            for (const el of document.querySelectorAll(revSel)) {
              t += `${(el.innerText || "").replace(/\s+/g, " ").trim()}\n`;
            }
            if (!t.trim()) return null;
            const act = new RegExp(revSrc, "u");
            const purpose = new RegExp(revPurposeSrc, "u");
            // Purpose before act, exactly as `deriveGearDemand` orders them:
            // «позиция ЗА заден ход» is a gate reached FACING FORWARD.
            if (purpose.test(t) && !act.test(t)) return null;
            const m = t.match(act);
            return m ? m[0] : null;
          })(),
          /** The looser "is this still a reversing task?" test — see
           *  REVERSE_STAY_RE. Only ever read while the drive is ALREADY in R. */
          reverseStay: (() => {
            let t = "";
            for (const el of document.querySelectorAll(revSel)) {
              t += `${(el.innerText || "").replace(/\s+/g, " ").trim()}\n`;
            }
            if (!t.trim()) return null;
            if (new RegExp(revPurposeSrc, "u").test(t) && !new RegExp(revSrc, "u").test(t)) return null;
            const m = t.match(new RegExp(revStaySrc, "u"));
            return m ? m[0] : null;
          })(),
          // The selector letter, on the same trip. The drive loop needs it
          // every tick once it is in R — a phase that cannot see the gear is
          // the phase that produced this whole task.
          gear: (() => {
            const seen = [];
            for (const el of shell.querySelectorAll(gearSel)) {
              const v = el.getAttribute("aria-label").replace(/^Скоростен лост:\s*/, "").trim();
              if (v && !seen.includes(v)) seen.push(v);
            }
            return seen;
          })(),
        };
      },
      {
        waitSrc: LAWFUL_WAIT_RE.source,
        pauseSel: PAUSE_SEL,
        revSrc: REVERSE_DEMAND_RE.source,
        revPurposeSrc: REVERSE_DEMAND_PURPOSE_RE.source,
        revStaySrc: REVERSE_STAY_RE.source,
        revSel: REVERSE_DEMAND_SEL,
        gearSel: GEAR_SEL,
      },
    )
    .catch(() => ({ kmh: -1, overlay: "?", pause: null, end: false, lawfulWait: null, reverseWant: null, reverseStay: null, gear: [] }));

/**
 * DRAIN THE QUEUE, DO NOT TAP ONCE.
 *
 * The teach card carries a «+N» badge: it is a QUEUE, and dismissing one card
 * promotes the next into the same slot. A single «Разбрах» therefore looks like
 * it failed — the layer is still up a second later — and the sim stays paused,
 * because a teach card freezes the world by design.
 *
 * That single tap is why every drive in engine pass 2 reported 0 км/ч and
 * `ended:false` with an empty debrief: the seatbelt moment fires ~8 s in, the
 * queue was never drained, and everything after was a photograph of a frozen
 * world. The buttons were never the problem — `textContent` is «Разбрах» and
 * Playwright matches case-insensitively; `text-transform: uppercase` only
 * changes what the eye sees.
 *
 * Returns how many layers it cleared, and shouts if it cleared none while one
 * was still standing — a harness that cannot get past a pause must never let
 * the frozen frames that follow look like a drive.
 */
async function drainPause() {
  let drained = 0;
  for (let k = 0; k < 12; k++) {
    const up = await page
      .evaluate((sel) => {
        const el = [...document.querySelectorAll(sel)].find((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 1 && r.height > 1;
        });
        return el
          ? el.getAttribute("aria-labelledby") ??
              el.getAttribute("aria-label") ??
              el.getAttribute("data-sim-overlay") ??
              "dialog"
          : null;
      }, PAUSE_SEL)
      .catch(() => null);
    if (up === null) break;
    const layer = page.locator(PAUSE_VISIBLE).first();
    let via = null;
    // «Разбрах» is a prefix of «Разбрах — продължи», so one entry covers both
    // the compact chip and the roomy button.
    for (const label of ["Разбрах", "Продължи", "Затвори"]) {
      if (await press(layer.locator(`button:has-text("${label}")`))) { via = `«${label}»`; break; }
    }
    if (via === null) {
      // A pause this harness does not have a word for — a micro-quiz waiting on
      // an answer, say. Press its last enabled control and SAY SO, because
      // "the audit answered a quiz for you" is a thing a reader must be able to
      // see in the log rather than infer from a score.
      const any = layer.locator("button:not([disabled])").last();
      const text = await any.innerText().catch(() => "");
      if (await press(any)) via = `its last enabled control «${text.trim().slice(0, 40)}»`;
    }
    if (via === null) {
      loud(`a blocking pause layer (${up}) has no control this harness can press — the world is frozen from here.`);
      dumpCensus(await census(), `a pause layer «${up}» could not be cleared`);
      break;
    }
    note(`      (cleared a pause layer «${up}» via ${via})`);
    await page.waitForTimeout(900);
    drained++;
  }
  return drained;
}

// ── PUT A MANUAL CAR IN GEAR ────────────────────────────────────────────────
//
// THE KEY VOCABULARY GREW BY THREE ON 2026-08-29, AND THE LEDGER ASKED FOR IT.
//
// The file header above still describes the old state — «this file's entire key
// vocabulary is W/S/A/D/B/Escape … that lane gets its own code (8) whose whole
// content is DO NOT RE-DRIVE». That was honest and it cost five findings, four
// of them critical, which no sweep could ever reach: sc-vp-stall is the
// catalogue's only `openingTier: "advanced"` lesson
// (lessons/scenario/templates-cockpit.ts:486) and `transmissionModeFor`
// (vehicle/driveline.ts:254) makes exactly that tier manual. It spawns in N.
// Three sweeps photographed a car at 0 км/ч and correctly refused to judge them.
//
// THE KEYS ARE THE PRODUCT'S OWN, not a guess — scene/cabin.ts:565-567 binds
// gearUp "BracketRight", gearDown "BracketLeft", clutch "KeyZ" — and the
// SEQUENCE is the one the product paints on its own glass when it detects this
// exact situation: engine/stuckStart.ts, «Задръж съединителя и включи първа
// предавка (Z + ])». Its header records the measurement that Z + ] «walk the
// gate normally».
//
// IT VERIFIES RATHER THAN ASSUMES, and that is the whole difference from the
// seatbelt press at :1252, which is blind because the belt has no DOM hook. The
// selector HAS one — `gear()` reads StatusDashboard's aria-label, which is
// `driveline.selector` verbatim — so this either watches the letter leave N or
// it says out loud that it could not. A blind press here would produce a drive
// that reports success while the car sits in neutral, which is the reassuring
// direction every instrument bug in this audit has failed in.
const MANUAL_CLUTCH_KEY = "KeyZ";
const MANUAL_GEAR_UP = "BracketRight";
const GEAR_ENGAGE_ATTEMPTS = 3;

async function engageManualGear() {
  const before = await gear();
  // ONLY N. D/M/R are already driving positions and a `]` there would upshift a
  // moving car mid-lesson — a fault this harness would then file against the
  // product, which is how an instrument invents a defect. "(no cluster)" is not
  // N either: it means nobody could read the selector, and pressing gear keys
  // at an instrument you cannot see is guessing.
  if (!before.length || !before.every((g) => g === "N")) return null;
  for (let attempt = 1; attempt <= GEAR_ENGAGE_ATTEMPTS; attempt++) {
    await page.keyboard.down(MANUAL_CLUTCH_KEY).catch(() => {});
    await page.waitForTimeout(250);
    await page.keyboard.press(MANUAL_GEAR_UP).catch(() => {});
    await page.waitForTimeout(350);
    const g = await gear();
    if (g.length && g.every((x) => x !== "N")) {
      // THE CLUTCH STAYS DOWN UNTIL THE THROTTLE IS ON. That order is not
      // stylistic: dropping the clutch with no gas is precisely how a real car
      // stalls, and «Загасване при потегляне» — stalling on pull-away — is the
      // one fault this lesson exists to grade. A harness that stalls the car on
      // its own way in would be filing its own mistake against the product.
      await throttle(true);
      await page.waitForTimeout(250);
      await page.keyboard.up(MANUAL_CLUTCH_KEY).catch(() => {});
      note(`      (manual box: N → «${gearLine(g)}» on attempt ${attempt}; clutch held through the throttle, per stuckStart.ts's own hint)`);
      return gearLine(g);
    }
    await page.keyboard.up(MANUAL_CLUTCH_KEY).catch(() => {});
    await page.waitForTimeout(300);
  }
  const stuck = gearLine(await gear());
  loud(
    `this car is manual and sat in N through ${GEAR_ENGAGE_ATTEMPTS} clutch+gear attempts — the cluster still reads «${stuck}». ` +
      `The keys pressed were ${MANUAL_CLUTCH_KEY} held + ${MANUAL_GEAR_UP}, which scene/cabin.ts:565-567 binds to clutch and gearUp. ` +
      `Do not read 0 км/ч below as a product finding until someone has checked those bindings still hold.`,
  );
  return null;
}
/** What the selector read after the engage attempt — `null` when the car was
 *  never in N, i.e. an automatic, which is 160 of the 161 lessons. */
const manualGear = await engageManualGear();

let ended = false;
let topSpeed = 0;
/**
 * WHAT THE CAR WAS ALREADY DOING WHEN THE LOOP OPENED — the first tick's dial,
 * kept apart from `topSpeed` because merging the two is exactly how `top`
 * became unusable as evidence.
 *
 * `topSpeed` is «the fastest reading this drive ever took», and a reader
 * reasonably hears «the fastest this car was driven». Those are the same
 * sentence ONLY IF the drive starts from rest. The positive control above now
 * releases its pedal, so this figure should read ~0 on every lane — and that
 * is the point: it is the WITNESS that the release happened, published on
 * every run rather than argued for once in a comment. If it ever comes back
 * large again, the drive report says so on the same line as `top`, and no
 * verifier can quote the one without meeting the other.
 *
 * −1 is „the first tick found no dial at all", which is a third answer and is
 * printed as one.
 */
let enteredLoopKmh = null;
let teachDrained = 0;
let waitsHonoured = 0;
let waitSeconds = 0;
let stopsMade = 0;
const t0 = Date.now();
let phase = MODE === "right" ? "roll" : "flat";
let phaseAt = t0;
let waitStartedAt = null;
let lastFrame = 0;
let lastShot = 0;
let shotBackoffSaid = false;
let phaseTicks = 0;
let rollM = 0;
/** Metres the `wrong` leg has run flat out since its last rest. */
let flatM = 0;
/** When that rest was BOOKED — which is not when the phase began, because the
 *  car spends the first seconds of the phase still braking. */
let flatRestAt = 0;
let prevKmh = -1;
let lostKeys = 0;
let lastTickAt = Date.now();
/* ── THE ODOMETER GETS ITS OWN CLOCK, AND MEASURING WHY IS THE FINDING ──────
 *
 * `lastTickAt` is assigned at the very END of the loop body, AFTER the phase
 * work and after the periodic frame — so the interval from `now` to the end of
 * the tick, which is where the pedals, the guidance scan and a screenshot that
 * costs seconds all live, IS CHARGED TO NO INTERVAL AT ALL. Every integral
 * built on `now - lastTickAt` therefore under-counts by however long a tick's
 * work takes.
 *
 * MEASURED, three pace drives, dial integral against the dev-only pose probe's
 * own path over the same samples: 0.702, 0.632, 0.674. The speedometer is not
 * the problem — dial ÷ probe speed is 0.935 over 150 moving samples, and the
 * shipped traces are internally exact (position path ÷ speed integral = 1.000
 * on all three lessons checked). It is the missing seconds: A THIRD OF THE
 * ROAD IS NOT BILLED.
 *
 * `rollM` IS BUILT ON THE SAME EXPRESSION AND IS LEFT ALONE, deliberately.
 * ROLL_DISTANCE_M = 15 was tuned against the biased integral, so «fixing» it
 * here would silently shorten every roll on every lane by a third — including
 * the no-tape lanes this stage promises not to touch — and no measurement in
 * this stage covers that. It is REPORTED, not repaired here: the 15 m roll has
 * always been about 22 m of road.
 */
let paceLastAt = Date.now();
let restLogged = false;
let drivingTicks = 0;
const tickMs = [];
let shotStopped = false, shotWaited = false;

/* ── THE STEERING PROOF RUNS INSTEAD OF THE DRIVE, NEVER BESIDE IT ──────────
 *
 * OPT-IN, AND IT EXITS. Turning the wheel in the middle of a scripted trace
 * would put the car somewhere the trace never planned for, and a lane that
 * steers badly manufactures confident wrong findings — which is worse than one
 * that cannot steer at all, because the second at least leaves an honest
 * silence. So `KNIJKA_STEER_PROOF=1` is a MODE: it proves the channel and ends
 * the lane. Its frames and its `_audit-steering.json` certify the INSTRUMENT
 * and say nothing about the lesson, and the status file says `phase:
 * "steer-proof"` so nothing downstream can mistake it for a drive.
 */
if (STEER_PROOF) {
  saveStatus({ phase: "steer-proof" });
  steering.probe = await timed("steer", steerProof);
  // …AND THE LIVENESS FIELD SAYS WHY IT IS EMPTY, rather than keeping its
  // initial „the check has not run yet". This lane never reached the drive
  // path, so the drive-path check is not merely unrun — it is inapplicable, and
  // the two are the kind of near-silence this file keeps finding bugs inside.
  // …AND IT MAY ONLY SAY THAT IF IT IS TRUE. The drive-path check runs BEFORE
  // this branch, on this path too, and round 3's own artifact proves it:
  // `.audit-frames/r3/proof-check/_audit-status.json` carries two measured legs
  // (+154 px and −152 px, `moved: true`) sitting directly under a `why` that
  // reads "the drive-path liveness check never applied". That is a status file
  // contradicting itself in the field a reader would quote, and the same
  // overwrite would have erased a DEAD verdict exactly as happily. So a measured
  // state stands and the sentence says what supersedes it; only a check that
  // genuinely did not run gets to say it did not run.
  //   — adversarial verification, 2026-08-21
  if (steering.channel.legs.length === 0) {
    steering.channel.state = "untested";
    steering.channel.why =
      "this lane ran the opt-in steering PROOF instead of a drive and the drive-path check did not run — read " +
      "`steering.probe`, which is a stronger measurement and is what this mode exists to produce";
  } else {
    steering.channel.why +=
      " — and this lane then ran the opt-in steering PROOF instead of a drive, so `steering.probe` supersedes the reading " +
      "above: it is a stronger measurement and is what this mode exists to produce";
  }
  steering.note =
    "this lane ran the STEERING PROOF and did not drive the lesson — no finding about the lesson may be drawn from it.";
  try {
    writeFileSync(`${OUT}/_audit-steering.json`, `${JSON.stringify({ scenario: SCENARIO, platform: PLATFORM, mode: MODE, steering }, null, 2)}\n`);
  } catch (error) {
    loud(`_audit-steering.json could not be written (${String(error?.message ?? error)}).`);
  }
  await shot("09-steer-proof");
  saveStatus({ phase: "complete", steering, exit: steering.probe?.passed ? EXIT_JUDGEABLE : EXIT_EVIDENCE_INCOMPLETE });
  note(`MACHINE SUMMARY: steer-proof ${steering.probe?.passed ? "PASSED" : "FAILED"} · see ${OUT}/_audit-steering.json`);
  await browser.close().catch(() => {});
  process.exit(steering.probe?.passed ? EXIT_JUDGEABLE : EXIT_EVIDENCE_INCOMPLETE);
}

if (MODE !== "right") await throttle(true);

// `reverse` from the first driving tick, not only at the end: a lane that dies
// mid-manoeuvre must still be able to say whether it had reached R.
// `cockpit` from the first driving tick as well, and for the same reason
// `reverse` is: a lane that dies mid-drive must still be able to say whether
// there was ever a car. A `crashed` status that carries the census can be told
// apart from one that never reached a lesson page; one that does not, cannot.
saveStatus({ phase: "driving", reverse, steering, guidance, cockpit });
let budgetMs = DRIVE_BUDGET_MS;
let budgetSaid = false;
const medianTick = () => {
  if (tickMs.length < 6) return 0;
  const v = [...tickMs].sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
};
while (!ended && Date.now() - t0 < budgetMs) {
  if (budgetMs === DRIVE_BUDGET_MS && medianTick() > SLOW_TICK_MS) {
    budgetMs = SLOW_DRIVE_BUDGET_MS;
    if (!budgetSaid) {
      budgetSaid = true;
      note(
        `  (a control-law tick costs ${medianTick()} ms here — the drive budget goes ` +
          `${DRIVE_BUDGET_MS / 1000}s -> ${SLOW_DRIVE_BUDGET_MS / 1000}s so the same road still gets driven)`,
      );
    }
  }
  const tickStart = Date.now();
  const p = await timed("probe", probe);
  // …AND ON EVERY DRIVE TICK. `topSpeed` on the next line is the record this
  // one exists to correct: it starts at 0 and only climbs, so a dial that is
  // NOT IN THE DOM (−1) and a car standing still (0) both leave it reading
  // «top 0 км/ч» — the exact line the paywall lanes printed. The census keeps
  // the two apart and covers the `flat` phase, where the control loop that
  // records the other speed history is never invoked at all.
  cockpitSee(p);
  // …and BEFORE `topSpeed` takes it, because the first tick's reading is the
  // one number in the drive the drive did not earn — see `enteredLoopKmh`.
  if (enteredLoopKmh === null) enteredLoopKmh = p.kmh;
  if (p.kmh > topSpeed) topSpeed = p.kmh;
  if (p.end) { ended = true; break; }

  if (p.pause !== null) {
    // A pause layer freezes the world. Let go of the throttle first — a
    // throttle held against a frozen world is what produced ninety seconds of
    // 0 км/ч in an earlier wave. The BRAKE stays where it is for the duration
    // of the drain: the world is frozen so a held brake costs nothing, and
    // lifting it at a standstill is what makes the next press select reverse
    // (see the note on brake()).
    await throttle(false);
    const drained = await drainPause();
    teachDrained += drained;
    // The frozen seconds are not driving seconds: the phase clock does not run
    // while the sim is paused, or a long teach queue would silently consume the
    // roll the car was in the middle of.
    phaseAt = Date.now();
    // …and neither does it make the previous tick's dt real. `rollM`
    // integrates speed over the gap between two samples; a 30 s teach pause
    // in that gap would bill the roll for 30 s of travel the car never made
    // (it was frozen), and end the roll phase on the next tick for no reason.
    lastTickAt = Date.now();
    // …and the odometer's own clock with it, for the same reason and by the
    // same argument: a frozen world moves no car, and the pace tape is indexed
    // by road, not by wall clock.
    paceLastAt = Date.now();
    // ── THE BELIEF ABOUT THE PEDALS DOES NOT SURVIVE A PAUSE ─────────────
    // `holdW`/`holdS` are what the harness THINKS the keyboard is doing, and
    // a key sent while a modal owns the focus can simply never reach the
    // sim's input handler. The symptom is unmistakable once it is printed:
    //   «the car would not come to rest in 11s (37 км/ч, brake down,
    //    throttle up) — rolling on.»
    // A car cannot accelerate to 37 км/ч on the brake. It was not on the
    // brake: the keydown had gone to a teach card. So after every drain the
    // belief is re-synchronised with real key events, and the control law
    // re-applies the pedals from a known state on the next tick.
    await page.keyboard.up("KeyW").catch(() => {});
    await page.keyboard.up("KeyS").catch(() => {});
    holdW = false;
    holdS = false;
    // …AND THE WHEEL, for the same reason and by the same argument. A steer key
    // held across a drain is a key nothing is tracking: the modal ate the
    // keyup, the sim keeps the wheel over, and the rest of the drive is a car
    // turning with no record of why. Today this is always a no-op because the
    // traces do not steer — it is here so that the day one does, the pedals and
    // the wheel do not come out of a pause under different rules.
    await steerRelease("pause drain");
    await page.keyboard.up(STEER_KEYS.left).catch(() => {});
    await page.keyboard.up(STEER_KEYS.right).catch(() => {});
    if (drained === 0) {
      // A LAYER THAT VANISHES BETWEEN THE PROBE AND THE DRAIN IS NOT A FAILURE,
      // AND THE FIRST VERSION OF THIS LINE TREATED IT AS ONE — SILENTLY. It was
      // a bare `break`, so a card that cleared itself in the 200 ms between the
      // two reads ended the whole drive with no line at all, and the run then
      // printed "the drive spent its whole 210s budget" (it had not) with an
      // aborted session and zero objectives. A harness is allowed to give up;
      // it is never allowed to give up quietly, and it must never claim an
      // elapsed time it did not spend.
      const stillUp = await page
        .evaluate((sel) => document.querySelectorAll(sel).length > 0, PAUSE_VISIBLE)
        .catch(() => false);
      if (stillUp) {
        loud(`a pause layer («${p.pause}») is still on the glass and nothing cleared it — abandoning the drive.`);
        await shot("04-frozen");
        break;
      }
      note(`      (a pause layer «${p.pause}» cleared itself before the drain reached it)`);
    }
    if (MODE !== "right") await throttle(true);
    tickMs.push(Date.now() - tickStart);
    continue;
  }

  const now = Date.now();
  /* ── THE ODOMETER, WHICH IS THE ONLY INDEX THE PACE TAPE IS READ BY ───────
   *
   * Integrated from the DIAL, on every tick and in every phase, because the
   * index has to be a reading a student's build publishes (see THE PACE TAPE
   * on why `window.__camProbe` may not be it). It is charged FORWARD in
   * reverse too: the tape is never consulted in R, so the only consequence is
   * that `pace.odoM` over-reads on a lane that reverses, and the drive report
   * says so rather than leaving a reader to discover it.
   *
   * ON `paceLastAt` AND NOT ON `lastTickAt` — see the note where it is
   * declared. The tick's own work is seconds of real road and `lastTickAt` does
   * not cover them. */
  paceOdoM += (Math.max(0, p.kmh) / 3.6) * ((now - paceLastAt) / 1000);
  paceLastAt = now;
  // THE CLUSTER IS RECORDED ON EVERY TICK, ON EVERY LESSON, IN BOTH MODES.
  // It costs nothing (`probe` already reads it) and it is the answer to the
  // question 376 drives could not answer: „what gear was this car in?" The
  // sweep that produced this task had no record of the selector at all, so a
  // reversing lesson that never reversed and one that reversed perfectly left
  // identical evidence.
  for (const g of p.gear) if (!reverse.gearSeen.includes(g)) reverse.gearSeen.push(g);
  /* ── R WITHOUT ANYBODY ASKING FOR IT — 2026-08-21 ──────────────────────────
   *
   * FOUND BY THE NEW LOGGING, WHICH IS THE POINT OF THE NEW LOGGING. On a
   * measured run of sc-park-bay-exit-rev the drive armed R, reversed, disarmed
   * back to D at t021s — and `[04-t079s] 0 км/ч gear=R` fifty-eight seconds
   * later, with no arm in between. The engine's own reverse assist had taken
   * the gate on a pedal gesture the stop phase made, and from there the drive
   * was grading a car in R under a control law that believes W is the
   * accelerator and S is the brake, when in R they are the other way round.
   * That is the historical defect the `brake()` refusal exists to prevent,
   * arriving through a door the refusal does not cover.
   *
   * The harness cannot un-take that gate safely from inside the roll phase — a
   * press at the wrong moment is what caused it — so it does the one thing that
   * is always right: it SAYS SO, once, loudly, and records it. Silence here is
   * what let 376 drives report a reversing car's speed as a forward creep.
   *
   * ── AND THE PARAGRAPH ABOVE NAMES A CULPRIT IT CANNOT SEE — round 3 ───────
   *
   * „The engine's own reverse assist had taken the gate on a pedal gesture the
   * stop phase made" is TWO claims welded together, and only one of them is
   * observed. Observed: the cluster reads R and this drive did not deliberately
   * arm it. NOT observed: whose gesture opened the gate. `reverseAssist.ts`
   * arms R on a brake press at a standstill after a lift — and THIS HARNESS IS
   * THE THING PRESSING THE BRAKE. It presses on every stop, it gates that press
   * on the speed the LAST probe read, and the CDP round trip to the page was
   * measured at ~2.0 s median on this box: a car reading 2 км/ч when `brake()`
   * let the press through can be at rest by the time the keydown reaches
   * `input.ts`. The refusal in `brake()` bounds the harness's INTENT. It cannot
   * bound the harness's EFFECT, and nothing in this process can observe the
   * speed at which a keystroke landed.
   *
   * So the sentence blamed the PRODUCT for something the HARNESS is at least as
   * likely to have done — and a finding that names the wrong culprit is worse
   * than no finding, because it sends a repair round at innocent code. This
   * audit has already spent rounds that way.
   *
   * The alarm is unchanged: the downstream corruption is identical whoever
   * caused it, and every pedal after this point means the opposite of what the
   * control law believes. What changed is that the watchdog now reports what it
   * SAW — this drive's own S presses, timed and speed-stamped, and whether a
   * disarm failed — and, when those cannot settle it, SAYS IT CANNOT TELL
   * instead of picking. Three attributions, and the middle one is the honest
   * majority case:
   *
   *   "harness-disarm-failed"  this drive armed R and the disarm reported
   *                            failure. Certain, and it is the harness.
   *   "undetermined"           this drive pressed the S key before R appeared.
   *                            The engine's assist may have taken the gate on
   *                            its own, or on that press. Both fit the record.
   *   "no-harness-gesture"     this drive had issued no S keydown at all. The
   *                            harness has no candidate gesture to offer — which
   *                            is still not a diagnosis of the engine, because
   *                            this instrument cannot see inside it.
   */
  /* `=== null`, NOT `!`. `unarmedRAt` is a SECOND COUNT — `Math.round((now -
   * t0) / 1000)` — and on the first sampled tick that value is `0`, which is
   * falsy. Written as `!reverse.unarmedRAt` the watchdog re-fires on every
   * subsequent tick for the whole drive, and each firing takes a screenshot
   * (measured at ~1.0 s median on this box) and rewrites the status file. The
   * one case where the engine grabs the gate FASTEST is the one the guard
   * failed to latch on. — adversarial re-verification, 2026-08-21 */
  if (phase !== "reverse" && p.gear.includes("R") && reverse.unarmedRAt === null) {
    reverse.unarmedRAt = Math.round((now - t0) / 1000);
    /* …AND IT MUST NOT BLAME THE ENGINE FOR THE HARNESS'S OWN R.
     *
     * `disarmReverse()`'s return value is discarded at the reverse-phase exit
     * below: the phase goes back to "roll" whether or not the car actually left
     * R. When the disarm has just FAILED, the next tick lands here — and the
     * line said „THIS DRIVE DID NOT PUT IT THERE … the engine's own reverse
     * assist has taken the gate", which is exactly backwards. This drive put it
     * there and could not take it out. The corruption downstream is identical,
     * so the alarm stays; the ATTRIBUTION is now read off `reverse.disarmed`
     * instead of assumed. — adversarial re-verification, 2026-08-21 */
    const disarmFailed = reverse.disarmed === false;
    /* THE EVIDENCE, GATHERED BEFORE THE SENTENCE IS WRITTEN. `sPresses` is
     * every S keydown this process made, with the speed the gate saw when it
     * let the press through — which is NOT the speed the press landed at, and
     * that gap is the whole reason this attribution has to stay open. */
    const last = sPresses.length ? sPresses[sPresses.length - 1] : null;
    reverse.unarmedRWho = disarmFailed ? "harness-disarm-failed" : last === null ? "no-harness-gesture" : "undetermined";
    reverse.unarmedREvidence = {
      phase,
      sPresses: sPresses.length,
      lastSPressAtSec: last === null ? null : Math.round((last.at - t0) / 1000),
      lastSPressSecondsBefore: last === null ? null : Number(((now - last.at) / 1000).toFixed(1)),
      lastSPressKmhAtIssue: last?.kmhAtIssue ?? null,
      lastSPressVia: last?.via ?? null,
      lastSPressNear: last === null ? null : now - last.at <= S_PRESS_NEAR_MS,
      refusedStandstillPresses: refusedReversePress,
      deliberatePresses: standstillPresses,
      disarmed: reverse.disarmed,
      /* THE LETTER'S PROVENANCE, BECAUSE `includes("R")` HIDES A DISAGREEMENT.
       * Three owners mint «Скоростен лост: X» (StatusDashboard ×2, the touch
       * gear sheet), and a cluster reading «D/R» is the ONE shape armReverse
       * and disarmReverse both refuse outright — „the harness will believe
       * NEITHER". This watchdog does not get to be the one site that believes
       * it silently, so the reading travels with the attribution. */
      cluster: gearLine(p.gear),
      clusterAmbiguous: p.gear.length > 1,
    };
    const ev = reverse.unarmedREvidence;
    /* WHAT THE GATE SAW WHEN IT LET THAT PRESS THROUGH — AND `null` IS TWO
     * DIFFERENT FACTS, WHICH THE FIRST DRAFT PRINTED AS ONE.
     *
     * `sChannel` keeps no speed because a press there IS a standstill press by
     * construction. `brake()` keeps the probe's reading. But `brake(true)` with
     * NO reading — a call site that forgot the argument, which is exactly the
     * fourth-call-site case that helper's own comment says it exists to survive
     * — also stores `null`, and the refusal could not judge it at all. Reading
     * the null as „a deliberate standstill press" turns a harness DEFECT into a
     * harness INTENTION in the one sentence a reader would quote. `via` is the
     * discriminator and it was already in the record. */
    const gateSaw =
      ev.lastSPressVia === "sChannel"
        ? "a deliberate standstill press (the reverse gesture — that helper keeps no speed and needs none)"
        : ev.lastSPressKmhAtIssue === null
          ? "NO READING AT ALL — that call site passed none, so the standstill refusal never judged it"
          : `${ev.lastSPressKmhAtIssue} км/ч`;
    /* AND WHETHER THE DRIVE ARMED R OF ITS OWN ACCORD IS READ, NOT ASSERTED.
     * „This drive did not deliberately arm it" was printed unconditionally —
     * including on the 19 reversing lanes, where `deliberatePresses` in the
     * very block above says 8 and `lastSPressVia` says `sChannel`. The sentence
     * contradicted its own evidence, in the direction that makes the instrument
     * look innocent. */
    const ownGesture =
      standstillPresses > 0
        ? `THIS DRIVE DID ARM R DELIBERATELY ON THIS LANE (${standstillPresses} press(es) of the reverse gesture` +
          `${reverse.disarmed === true ? ", and the disarm then read «D» off the cluster" : ""}), and`
        : "This drive made no deliberate arming press of its own, but";
    /* The latency argument, only where the latency reaches. See S_PRESS_NEAR_MS. */
    const fit = ev.lastSPressNear
      ? `reverseAssist arms R on exactly that gesture at a standstill, and the speed a press was GATED on is not the speed it ` +
        `LANDED at (~2.0 s of CDP latency on this box), so „the engine took the gate on its own" and „the engine took the gate ` +
        `on this harness's press" both fit the record.`
      : `That press is ${ev.lastSPressSecondsBefore}s old and the ~2.0 s CDP round trip does not reach it, so the latency ` +
        `argument this watchdog would otherwise make DOES NOT APPLY here. That still convicts nobody: this harness samples ` +
        `the selector seconds apart and cannot see inside reverseAssist, so what happened between two ticks is simply unrecorded.`;
    const ambiguity = ev.clusterAmbiguous
      ? ` AND THE CLUSTER ITSELF IS AMBIGUOUS («${ev.cluster}»): two owners of «Скоростен лост» disagree, which is the one ` +
        `shape armReverse and disarmReverse both refuse to believe — so the R above is one instrument's word and not the ` +
        `driveline's, and even „the car is in R" is unsettled here.`
      : "";
    const corruption =
      `Every pedal from here means the OPPOSITE of what the control law believes — the throttle brakes and the brake ` +
      `accelerates — so no braking or stopping claim after this point is admissible.${ambiguity}`;
    loud(
      disarmFailed
        ? `THE CLUSTER STILL READS «R» AT t=${reverse.unarmedRAt}s AND IT WAS THIS DRIVE THAT PUT IT THERE — the disarm ` +
            `reported failure and the phase went back to «${phase}» anyway. ${corruption}`
        : last === null
          ? `THE CLUSTER READS «R» AT t=${reverse.unarmedRAt}s (phase «${phase}») AND THIS HARNESS HAS NO GESTURE TO OFFER FOR IT — ` +
            `it has issued no S keydown at all on this drive. That is not a diagnosis of the engine: this instrument cannot see ` +
            `inside reverseAssist and does not name a cause. ${corruption}`
          : `THE CLUSTER READS «R» AT t=${reverse.unarmedRAt}s (phase «${phase}») AND THIS HARNESS CANNOT TELL WHO PUT IT THERE. ` +
            `${ownGesture} it pressed S ${ev.sPresses}× — the last ${ev.lastSPressSecondsBefore}s ago ` +
            `at t=${ev.lastSPressAtSec}s, via ${ev.lastSPressVia}, gated on ${gateSaw}. ` +
            `${fit} Filing this against the product would be naming a culprit nobody ` +
            `observed. ${corruption}`,
    );
    // The frame carries the diagnosis, not a guess about it — the same rule
    // that renamed `05r-reverse-REFUSED` after it was found with R lit on it.
    // Three attributions, three names: an "unarmed-R" frame that turned out to
    // be the harness's own press is the mislabelled evidence this round exists
    // to stop.
    await shot(
      disarmFailed ? "05r-stuck-in-R" : last === null ? "05r-R-no-harness-gesture" : "05r-R-attribution-UNDETERMINED",
    );
    saveStatus({ reverse });
  }
  if (MODE === "right") {
    // ── DOES THIS TASK WANT R? ────────────────────────────────────────────
    //
    // ASKED BEFORE THE PHASE BRANCH, not inside the stop phase, and the first
    // draft had it inside — which is wrong for exactly the lessons this exists
    // for. `sc-park-bay-exit-rev`'s TASK ONE is «излез от мястото на заден
    // ход»: the car is parked nose-in and the demand is up from the first
    // frame, so a check that only runs after a completed roll would drive the
    // car FORWARD out of a bay whose only exit is backwards before it ever
    // looked. The condition that matters is the car being stopped, and that
    // can be true in any phase.
    //
    // `p.kmh === 0`, not `<= 1`: the machine's standstill test is |v| < 0.6
    // (REVERSE_ASSIST_STANDSTILL_KMH) and the dial ROUNDS (`displaySpeedKmh`),
    // so a displayed 1 can be 1.4 км/ч, where no press can arm. Reporting „R
    // refused" about a car the engine can see moving would be a false finding
    // about the product, which is the failure this programme ranks worst.
    //
    // A LAWFUL WAIT OUTRANKS IT. While the product declares that standing
    // still IS the manoeuvre, shifting to R would be inventing a fault.
    if (
      phase !== "reverse" &&
      p.kmh >= 0 &&
      p.kmh <= 1 &&
      p.lawfulWait === null &&
      p.reverseWant !== null &&
      !reverse.armed &&
      // ── THE GATE DOES NOT LATCH — 2026-08-21 ──────────────────────────────
      // It used to read `reverse.failure === null`, and `reverse.failure` was
      // written by the FIRST burst that ran out of presses. So one burst — on
      // sc-park-bay-exit-rev, a burst that had actually succeeded and been
      // misread — closed this gate for the whole session and the drive graded
      // ~190 s of a car in R as a car in D. Only a HARD block closes it now
      // (`reverse.blocked`: the instruments disagree, or there is no session
      // left), and the retries are bounded by a press budget rather than by a
      // one-way flag, so a later successful arm is still believed.
      reverse.blocked === null &&
      reverse.attempted < REVERSE_ARM_BUDGET
    ) {
      if (!reverse.demanded) {
        reverse.demanded = true;
        reverse.demandedBy = p.reverseWant;
        note(`      THE TASK ASKS FOR REVERSE («${p.reverseWant}») — the cluster reads «${gearLine(p.gear)}». Arming R.`);
      }
      if (p.kmh !== 0) {
        note(`      (holding for a true standstill before arming R — the dial reads ${p.kmh} км/ч, which rounds from as much as 1.4)`);
        await throttle(false);
      } else if (await timed("reverse", () => armReverse(p.kmh))) {
        reverse.armedAtSec = Math.round((now - t0) / 1000);
        // THE PROOF FRAME. Named for what the cluster said, taken BEFORE one
        // metre is driven, so a reader can answer "did this drive ever enter
        // reverse?" from a picture instead of from a claim.
        await shot("05r-reverse-R");
        // …AND BEFORE R, TOO. A wheel still wound over from a confirmed turn
        // would reverse the car along a curve nothing is watching.
        await guideLeaveRoll();
        phase = "reverse";
        phaseAt = Date.now();
        phaseTicks = 0;
        restLogged = false;
        saveStatus({ reverse });
        tickMs.push(Date.now() - tickStart);
        lastTickAt = Date.now();
        continue;
      } else {
        /* ── THE FRAME IS NAMED FOR WHAT THE GLASS SAYS — 2026-08-21 ─────────
         *
         * `05r-reverse-REFUSED.png` was taken to PROVE the car never reached R.
         * The verifier opened the one from sc-park-bay-exit-rev/mobile/right
         * and R IS LIT ON IT. A frame whose filename contradicts its own pixels
         * is worse than no frame: it is a judge's shortcut pointing the wrong
         * way, and the whole point of photographing the cluster was that the
         * picture would outrank the claim.
         *
         * So the cluster is read ONE more time, immediately before the shutter,
         * and it decides the name:
         *   · «R» on the glass  -> this was never a refusal. The frame is
         *     `05r-reverse-R-late`, the drive enters the reverse phase, and the
         *     harness says so instead of arguing with the photograph.
         *   · anything else     -> `05r-reverse-REFUSED-<letter>`, so the file
         *     name carries the evidence rather than a verdict about it, and a
         *     reader can tell «REFUSED-D» from «REFUSED-(no cluster)» without
         *     opening either.
         * (`armReverse` now catches the late R itself; this is the second net,
         * because the arm and the shutter are two round trips apart and the
         * failure being guarded is exactly a state that arrives between them.) */
        const gNow = await gear();
        reverse.gearSeen.push(...gNow.filter((x) => !reverse.gearSeen.includes(x)));
        const g = gearLine(gNow);
        if (gNow.length === 1 && gNow[0] === "R") {
          reverse.armed = true;
          reverse.armedAtSec = Math.round((now - t0) / 1000);
          note(
            `      THE BURST REPORTED NO «R» AND THE CLUSTER READS «R» — the toggle landed between the last press and ` +
              `the shutter. Believed, photographed as 05r-reverse-R-late, and the drive reverses.`,
          );
          await shot("05r-reverse-R-late");
          await guideLeaveRoll();
          phase = "reverse";
          phaseAt = Date.now();
          phaseTicks = 0;
          restLogged = false;
          saveStatus({ reverse });
          tickMs.push(Date.now() - tickStart);
          lastTickAt = Date.now();
          continue;
        }
        // Not a verdict on the session — a verdict on THIS burst. The gate
        // above will spend another one if the product still wants R.
        const spent = `${reverse.attempted}/${REVERSE_ARM_BUDGET} deliberate press(es) over ${reverse.bursts} burst(s)`;
        note(
          `      (reverse burst ${reverse.bursts} ended with the cluster reading «${g}» after ${spent}` +
            `${reverse.attempted < REVERSE_ARM_BUDGET ? " — the gate stays OPEN and will try again at the next standstill)" : " — the press budget is spent)"}`,
        );
        if (reverse.attempted >= REVERSE_ARM_BUDGET || reverse.blocked !== null) {
          loud(
            `THIS LESSON ASKED FOR REVERSE («${reverse.demandedBy}») AND THE CLUSTER NEVER READ «R» — ${reverseWhy() ?? `it reads «${g}»`}. ` +
              `Everything below describes the APPROACH ONLY; no finding about the reversing half of this manoeuvre may be ` +
              `drawn from this run, in either direction.`,
          );
          // The letter goes in the FILE NAME. `(no cluster)` is a legal answer
          // and a different one from `D`; both are stripped to something a file
          // system will take without losing which of the two it was.
          await shot(`05r-reverse-REFUSED-${g.replace(/[^\p{L}\p{N}]+/gu, "-")}`);
          dumpCensus(await census(), `reverse was demanded and could not be armed (cluster «${g}»)`);
        }
        saveStatus({ reverse });
      }
    }
    // ACT FIRST, DECIDE AFTERWARDS — AND THAT ORDER IS THE WHOLE FIX.
    //
    // The first version asked `now - phaseAt >= ROLL_MS` BEFORE driving, and
    // fell through into the stop branch in the same iteration. That is correct
    // only while a tick is short. Measured on the `pc` leg, where main-thread
    // contention pushed a tick to 19-38 s: every roll tick was already past the
    // 4 s roll window on arrival, so it transitioned to "stop" WITHOUT EVER
    // TOUCHING THE THROTTLE, and the next tick was past the 3 s stop window and
    // went back to "roll" — again without driving. Duty cycle 0 %. The car sat
    // at 0 км/ч from t=72 s to the end of the budget and the run reported
    // "3 full stops, 0 lawful waits, no objectives" — a stall that reads
    // exactly like a lesson that credits nothing.
    //
    // Driving before the transition guarantees at least ONE acting tick per
    // phase whatever the tick costs, so a loaded box makes the drive SLOW and
    // never makes it FAKE.
    if (phase === "roll") {
      // A COAST BAND, NOT A THRESHOLD. `brake(kmh > CRUISE)` and
      // `throttle(kmh < CRUISE - 3)` share an edge, so a car sitting on the
      // target toggled a pedal every tick — and every pedal change is a CDP
      // round trip that queues behind the scene's own main-thread work
      // (measured at 2.1 s median on the `pc` leg). Between CRUISE-3 and
      // CRUISE+6 the car now simply rolls, which is also what a driver holding
      // a speed actually does with their foot.
      /* ── HOW FAST, HERE — FROM THE AUTHORED DRIVE, NEVER BELOW THE CREEP ──
       * See THE PACE TAPE. On a lane with no tape `paceTarget` returns
       * CRUISE_KMH, `paceLookM` returns ROLL_DISTANCE_M and `paceRollCapMs`
       * returns ROLL_MS, so every line below is the drive this harness has
       * always taken — which is what makes this safe to land on a corpus of
       * 1,462 findings taken with the old one.
       *
       * ONE THING IS NOT IDENTICAL, AND IT IS SAID RATHER THAN ROUNDED AWAY.
       * `CRUISE_KMH - 3` becomes `CRUISE_KMH - paceLift(12)`, and `paceLift`
       * is 3 at the 110 ms ticks measured on this box but 4.8 on a box slow
       * enough to make the throttle overshoot by that much. So on a SLOW box a
       * no-tape lane now aims about 1.8 км/ч lower than it used to. That is
       * the direction the overshoot argument points and it is under a km/h of
       * cruise; it is not zero. */
      const target = paceTarget(paceOdoM, p.kmh);
      const lift = paceLift(target);
      if (pace.targets.length === 0 || pace.targets[pace.targets.length - 1].kmh !== Math.round(target)) {
        pace.targets.push({
          tSec: Math.round((now - t0) / 1000),
          odoM: Math.round(paceOdoM),
          kmh: Math.round(target),
        });
      }
      await timed("pedals", async () => {
        await brake(p.kmh > target + BRAKE_CAP_OVER_KMH, p.kmh);
        await throttle(p.kmh >= 0 && p.kmh < target - lift);
      });
      // ── AND THE WHEEL, ON THE SAME TICK AS THE PEDALS ────────────────────
      // Only in the roll phase, and only forward: the stop phase is braking to
      // a halt and the reverse phase runs a different control law entirely.
      // `guideTick` is a no-op that RECORDS ITSELF whenever it cannot see, so
      // a lane that stops steering never stops saying so.
      await timed("guide", () => guideTick(p.kmh, now - t0, now - lastTickAt));
      drivingTicks++;
      phaseTicks++;
      rollM += (Math.max(0, p.kmh) / 3.6) * ((now - lastTickAt) / 1000);
      /* ── THE BOUND IS METRES; THE CLOCK IS THE SAFETY CAP ────────────────
       * Which is what ROLL_DISTANCE_M's own comment always claimed and what,
       * measured, was never true: at CRUISE_KMH a car leaving a standstill
       * needs ~6 s to make 15 m, so `ROLL_MS` (4 s) always arrived first, at
       * about 12 m. The roll was time-bounded, and a time-bounded roll is as
       * long as the box is fast. When the cap fires now it SAYS SO, because a
       * roll bounded by the clock is a roll whose length is not the road's. */
      const lookM = paceLookM(target);
      const capMs = paceRollCapMs(target);
      const cappedOut = now - phaseAt >= capMs;
      if ((rollM >= lookM || cappedOut) && phaseTicks >= 1) {
        if (cappedOut && rollM < lookM) {
          pace.capHits += 1;
          loud(
            `a roll ran its ${Math.round(capMs / 1000)}s safety cap having covered ${rollM.toFixed(1)} m of the ` +
              `${lookM.toFixed(0)} m it was aimed at (target ${Math.round(target)} км/ч, dial ${p.kmh} км/ч) — THAT roll ` +
              `was bounded by the clock, so its length is this box's and not this road's.`,
          );
        }
        pace.rolls += 1;
        // THE WHEEL COMES BACK TO CENTRE BEFORE THE PHASE DOES — see
        // `guideLeaveRoll`. Nothing past this line ever scans again, so a
        // sustained turn left down here turns the car for the whole stop.
        await guideLeaveRoll();
        phase = "stop";
        phaseAt = now;
        phaseTicks = 0;
        rollM = 0;
        waitStartedAt = null;
        restLogged = false;
      }
    } else if (phase === "stop") {
      phaseTicks++;
      await throttle(false);
      // Press the brake only while the car is STILL MOVING, then hold it. A
      // fresh press at a standstill is the auto-reverse gesture; a pedal held
      // from the roll through the stop is exempt by LAW 1 and is what a learner
      // actually does at a give-way line.
      // A CONTRADICTION IS A FINDING, NOT A GLITCH. If the harness believes
      // the brake is down and the car is ACCELERATING, one of the two is
      // wrong and it is not the car. Re-assert the pedal and say so.
      if (holdS && p.kmh > 1 && prevKmh >= 0 && p.kmh > prevKmh + 2) {
        loud(`the brake is held and the car went ${prevKmh} -> ${p.kmh} км/ч — the sim never got the key; re-asserting it.`);
        await page.keyboard.up("KeyS").catch(() => {});
        holdS = false;
        lostKeys += 1;
      }
      await brake(true, p.kmh);
      const atRest = p.kmh >= 0 && p.kmh <= 1;
      if (atRest && !restLogged) {
        restLogged = true;
        stopsMade++;
        if (!shotStopped) { shotStopped = true; await shot("05-stopped"); }
      }

      if (atRest && p.lawfulWait !== null) {
        if (waitStartedAt === null) {
          waitStartedAt = now;
          waitsHonoured++;
          note(`      LAWFUL WAIT declared at t=${Math.round((now - t0) / 1000)}s («${p.lawfulWait}») — the sim says standing still IS the manoeuvre; holding.`);
          if (!shotWaited) { shotWaited = true; await shot("06-waited"); }
        } else if (now - waitStartedAt > LAWFUL_WAIT_MAX_MS) {
          loud(`the lawful-wait line («${p.lawfulWait}») never went away in ${LAWFUL_WAIT_MAX_MS / 1000}s — moving off, and this run's verdict is suspect.`);
          waitSeconds += Math.round((now - waitStartedAt) / 1000);
          waitStartedAt = null;
          phase = "roll";
          phaseAt = now;
          phaseTicks = 0;
        }
      } else if (waitStartedAt !== null) {
        const held = Math.round((now - waitStartedAt) / 1000);
        waitSeconds += held;
        note(`      the lawful wait was withdrawn after ${held}s — moving off.`);
        waitStartedAt = null;
        phase = "roll";
        phaseAt = now;
        phaseTicks = 0;
      } else if (atRest && now - phaseAt >= STOP_MS && phaseTicks >= MIN_PHASE_TICKS) {
        phase = "roll";
        phaseAt = now;
        phaseTicks = 0;
      } else if (!atRest && now - phaseAt >= STOP_MS + 8000) {
        loud(`the car would not come to rest in ${Math.round((STOP_MS + 8000) / 1000)}s (${p.kmh} км/ч, brake ${holdS ? "down" : "UP"}, throttle ${holdW ? "DOWN" : "up"}) — rolling on.`);
        phase = "roll";
        phaseAt = now;
        phaseTicks = 0;
      }
    } else if (phase === "reverse") {
      // ── THE REVERSE HALF OF THE MANOEUVRE ────────────────────────────────
      //
      // EVERY PEDAL MEANS THE OTHER THING HERE (rule b, engine/reverseAssist):
      // S is the reverse ACCELERATOR and W is the BRAKE. So the phase reads
      // like the roll phase with the two channels exchanged — and it re-reads
      // the CLUSTER every tick rather than remembering that it shifted, because
      // „I sent the keys once" is the belief this whole task exists to kill.
      phaseTicks++;
      reverse.reverseTicks++;
      for (const g of p.gear) if (!reverse.gearSeen.includes(g)) reverse.gearSeen.push(g);
      if (p.gear.length && !p.gear.includes("R")) {
        // The pause drain lifts BOTH pedals at whatever speed the car is at
        // (see the drain block above), and in R the lifted pedal is the
        // functional BRAKE — so a teach card at a standstill leaves exactly
        // the gesture that walks the gate back up to D. Losing R silently
        // would put a forward-driving car under a reverse control law.
        loud(`THE SELECTOR LEFT R MID-MANOEUVRE — the cluster now reads «${gearLine(p.gear)}». The reverse leg ends here and what follows is not reversing.`);
        reverse.failures.push(`lost R mid-manoeuvre (${gearLine(p.gear)})`);
        // …AND `armed` GOES BACK TO FALSE, so the gate above can put the car
        // back in R if the task still wants it. Leaving it true would let the
        // rest of a reversing lesson run forward under a flag that says it is
        // reversing — the same conflation the whole block is about, arriving
        // from the other side.
        reverse.armed = false;
        await sChannel(false);
        await throttle(false);
        phase = "roll";
        phaseAt = now;
        phaseTicks = 0;
        saveStatus({ reverse });
      } else if (p.reverseStay === null || now - phaseAt >= REVERSE_MS) {
        note(
          `      the reverse leg ends after ${Math.round((now - phaseAt) / 1000)}s — ` +
            (p.reverseStay === null
              ? "the task no longer mentions reversing at all."
              : `its ${REVERSE_MS / 1000}s budget is spent.`),
        );
        await shot("05r-reverse-end");
        await timed("reverse", disarmReverse);
        saveStatus({ reverse });
        phase = "roll";
        phaseAt = Date.now();
        phaseTicks = 0;
        restLogged = false;
        lastTickAt = Date.now();
      } else {
        // The cap is pressed ONLY while the car is genuinely moving, for the
        // exact reason brake() refuses a standstill press in D: at rest in R,
        // a fresh press of the functional brake is the gesture that selects D.
        await timed("pedals", async () => {
          if (p.kmh > REVERSE_CRUISE_KMH + BRAKE_CAP_OVER_KMH && p.kmh > 1) {
            await throttle(true); // the functional BRAKE in R
            await sChannel(false);
          } else {
            await throttle(false);
            await sChannel(true); // the functional THROTTLE in R
          }
        });
        drivingTicks++;
      }
    }
  }

  /* ── THE `wrong` LEG'S CONTROL LAW — OUTSIDE THE `right` GATE ON PURPOSE ───
   *
   * The phase branch above closes INSIDE `if (MODE === "right")` (see the note
   * on FLAT_REST_EVERY_M), so a `flat` case appended to that chain would never
   * have run: the value would have been right and nothing would have read it,
   * which is the exact failure this programme keeps paying for. The wrong
   * leg's law therefore stands on its own, here, where a wrong leg reaches it.
   *
   * THE GATE ABOVE IS LEFT WHERE IT IS, and that is a judgement, not an
   * oversight. Moving its brace would re-indent 167 lines of reverse machinery
   * in a file two more stages of this wave still have to edit, for no
   * behaviour a `wrong` leg can observe — `roll`, `stop` and `reverse` are
   * only ever entered from `right`-mode transitions, so the misplaced brace is
   * latent rather than live. It is REPORTED, not repaired here.
   */
  if (MODE !== "right") {
    if (phase === "flat") {
      // FLAT OUT AND STRAIGHT — unchanged in what it means. No cruise cap, no
      // coast band, no wheel: `guideTick` is deliberately not called, because a
      // wrong leg that follows the route would invalidate every verdict ever
      // taken from a wrong leg.
      await timed("pedals", () => throttle(true));
      drivingTicks++;
      phaseTicks++;
      flatM += (Math.max(0, p.kmh) / 3.6) * ((now - lastTickAt) / 1000);
      if ((flatM >= FLAT_REST_EVERY_M || now - phaseAt >= FLAT_REST_MAX_MS) && phaseTicks >= 1) {
        phase = "flat-rest";
        phaseAt = now;
        phaseTicks = 0;
        flatM = 0;
        flatRestAt = 0;
        restLogged = false;
      }
    } else if (phase === "flat-rest") {
      phaseTicks++;
      await throttle(false);
      // THE SAME STANDSTILL DISCIPLINE THE `stop` PHASE RUNS UNDER, and for the
      // same reason: press the brake only while the car still MOVES, then hold
      // it through the rest. A fresh press at a standstill is the auto-reverse
      // gesture (`brake()` refuses it and counts the refusal). The release at
      // the far end is a genuine lift at a standstill — safe, because the next
      // press cannot happen until the car is moving again.
      if (holdS && p.kmh > 1 && prevKmh >= 0 && p.kmh > prevKmh + 2) {
        loud(`the brake is held and the car went ${prevKmh} -> ${p.kmh} км/ч — the sim never got the key; re-asserting it.`);
        await page.keyboard.up("KeyS").catch(() => {});
        holdS = false;
        lostKeys += 1;
      }
      await brake(true, p.kmh);
      const atRest = p.kmh >= 0 && p.kmh <= 1;
      if (atRest && !restLogged) {
        restLogged = true;
        flatRestAt = now;
        stopsMade++;
        note(
          `      the wrong leg came to REST at t=${Math.round((now - t0) / 1000)}s (stop ${stopsMade}) and holds it for ` +
            `${FLAT_REST_HOLD_MS / 1000}s — twice the engine's 4 s ban-zone sustain. Where it stopped is the product's ` +
            `question, not this harness's.` +
            (p.lawfulWait === null ? "" : ` A LAWFUL WAIT is declared here («${p.lawfulWait}») and this leg does not honour it — it is the reckless leg, and driving off is its own act, not an instrument fault.`),
        );
        if (!shotStopped) { shotStopped = true; await shot("05-stopped"); }
      }
      if (restLogged && now - flatRestAt >= FLAT_REST_HOLD_MS) {
        await brake(false);
        phase = "flat";
        phaseAt = now;
        phaseTicks = 0;
        flatM = 0;
      } else if (!restLogged && now - phaseAt >= FLAT_REST_GIVEUP_MS) {
        // NOT a silent fall-through. „It would not stop" and „it was never
        // asked to" are different runs, and only one of them says something
        // about the product.
        loud(
          `the wrong leg would not come to rest in ${FLAT_REST_GIVEUP_MS / 1000}s (${p.kmh} км/ч, brake ` +
            `${holdS ? "down" : "UP"}, throttle ${holdW ? "DOWN" : "up"}) — rolling on, and no „stopping where forbidden" ` +
            `finding may be drawn from this stretch.`,
        );
        await brake(false);
        phase = "flat";
        phaseAt = now;
        phaseTicks = 0;
        flatM = 0;
      }
    }
  }

  // …and the TEXTUAL beat backs off on the same evidence. `read()` costs 2.0 s
  // on the `pc` leg (one innerText plus a rect scan, queued behind the scene's
  // own main-thread work), and at a 5 s cadence that is a third of every tick
  // spent describing a car instead of driving it. The log loses resolution; the
  // drive does not.
  const readDear = (cost.read ?? []).at(-1) > 1000;
  if (now - lastFrame >= (readDear ? EXPENSIVE_SHOT_MS : FRAME_MS)) {
    lastFrame = now;
    // A frame every FRAME_MS while frames are cheap; every EXPENSIVE_SHOT_MS
    // when one costs seconds — see lastShotCostMs().
    const dear = lastShotCostMs() > 2000;
    const spacing = dear
      ? Math.max(EXPENSIVE_SHOT_MS, lastShotCostMs() * SHOT_COST_MULTIPLE)
      : FRAME_MS;
    if (dear && !shotBackoffSaid) {
      shotBackoffSaid = true;
      note(
        `  (a frame costs ${lastShotCostMs()} ms on this box — periodic frames back off to one every ` +
          `${Math.round(spacing / 1000)}s so the control law keeps running; the named frames are unaffected)`,
      );
    }
    const withShot = now - lastShot >= spacing;
    if (withShot) lastShot = now;
    // Integer seconds, zero-padded. A bare `i * 3.5` produces «04-t92.5s»,
    // which sorts between «04-t089s» and «04-t096s» as a STRING — a judge
    // reading the folder in name order would see the drive out of sequence and
    // narrate a car that jumps backwards. The frames are the evidence; their
    // order is part of it.
    const s = await beat(`04-t${String(Math.round((now - t0) / 1000)).padStart(3, "0")}s`, { withShot });
    if (s.kmh > topSpeed) topSpeed = s.kmh;
    if (s.end) { ended = true; break; }
  }
  prevKmh = p.kmh;
  tickMs.push(Date.now() - tickStart);
  lastTickAt = Date.now();
  await timed("idle", () => page.waitForTimeout(TICK_MS));
}
await throttle(false);
await brake(false);
const driveSec = Math.round((Date.now() - t0) / 1000);
if (!ended) {
  loud(
    `the drive stopped after ${driveSec}s without the session ending` +
      `${driveSec >= budgetMs / 1000 - 5 ? ` (its whole ${budgetMs / 1000}s budget)` : ` — it gave up early, see the line above`}.`,
  );
}
note(
  `  DRIVE: ${MODE} · top ${topSpeed} км/ч · ${stopsMade} full stop${stopsMade === 1 ? "" : "s"} · ` +
    `${waitsHonoured} lawful wait${waitsHonoured === 1 ? "" : "s"} honoured (${waitSeconds}s) · ` +
    `${teachDrained} pause layer${teachDrained === 1 ? "" : "s"} drained` +
    (refusedReversePress ? ` · refused ${refusedReversePress} standstill brake press${refusedReversePress === 1 ? "" : "es"} (would have selected R)` : "") +
    (lostKeys ? ` · re-asserted the brake ${lostKeys}× after the sim lost the key` : ""),
);
/* ── WHAT `top` INHERITED, ON THE SAME BREATH AS `top` ──────────────────────
 *
 * A verifier closed a «this drive crawls» row by quoting «reaches 43 км/ч»
 * from the line above, on a leg whose photographed beats never passed 31 —
 * because the pedal was still down from the positive control when the loop
 * took its first sample. The press now releases, so this line should read a
 * car at or near rest on every lane; it is printed unconditionally anyway,
 * because the value of a witness is that it also speaks on the day the thing
 * it witnesses stops being true.
 *
 * The threshold for shouting is HALF of `top`: below that the first tick is
 * ordinary drive data and needs no warning; at or above it, `top` is mostly
 * inheritance and a reader about to quote it must be stopped. */
if (enteredLoopKmh !== null) {
  const inherited = enteredLoopKmh >= 0 && topSpeed > 0 && enteredLoopKmh * 2 >= topSpeed;
  const line =
    `  ENTERED THE LOOP AT: ${enteredLoopKmh} км/ч — the first tick's dial, which is speed this drive did NOT earn ` +
    `(the positive control's press, and its decay). «top ${topSpeed} км/ч» above must be read against it.`;
  if (inherited) {
    loud(
      `${line.trim()} AT OR OVER HALF OF «top», SO «top» IS MOSTLY INHERITANCE: it is not evidence about how fast this ` +
        `lesson was driven, and no finding about speed — in either direction — may be opened or closed on it.`,
    );
  } else {
    note(line);
  }
}
// ── AND WHOSE BEHAVIOUR THOSE STOPS WERE ───────────────────────────────────
//
// The `wrong` leg's rests are the INSTRUMENT'S OWN ACT, and until 2026-08-28
// this leg made none — so every fault a rest can earn is new to this corpus
// and a reader comparing an old run.log to a new one will meet it for the
// first time. Two in particular: «Рязко спиране без причина» (the full brake
// from cruising speed with nothing ahead — a real causeless harsh stop, and
// the engine is right to bill it) and «Спиране в забранена зона» (the point of
// the exercise). Both are the product judging THIS HARNESS'S stop. Neither is
// evidence that the lesson's authored script commits the fault, and neither is
// a regression in the product — it is a leg that finally does something the
// product has always been able to see.
if (MODE !== "right" && stopsMade > 0) {
  note(
    `  WRONG-LEG RESTS: ${stopsMade} careless full stop${stopsMade === 1 ? "" : "s"}, each held ${FLAT_REST_HOLD_MS / 1000}s ` +
      `(FLAT_REST_EVERY_M = ${FLAT_REST_EVERY_M} m). Any «Рязко спиране без причина» or «Спиране в забранена зона» below is ` +
      `the product judging THOSE stops — the instrument's behaviour, not the lesson script's. AND IT CUTS THE OTHER WAY: a ` +
      `careless rest can land on a „спри на разрешеното място" mark and CREDIT it, so a wrong leg that PASSES may have ` +
      `stopped by luck rather than by driving well — measured on sc-pk-ban-stop/mobile/wrong, 2026-08-28.`,
  );
}
/* ── AND WHAT PACED THIS DRIVE, ON EVERY `right` LANE ──────────────────────
 *
 * PRINTED WHETHER OR NOT A TAPE WAS FOUND, and that is the point, exactly as
 * it is for REVERSE below: „this lesson has no shadow trace" and „this drive
 * was paced by one" were the same silence before, and the silence read as the
 * second one. A lane with no tape is a lane whose LENGTH is the box's, and a
 * reader comparing two of those is not comparing two samples of one thing.
 */
if (MODE === "right") {
  pace.odoM = Number(paceOdoM.toFixed(1));
  if (paceTape !== null && guideWitness.length > 0) {
    // MEASURED, NOT USED. `__camProbe` is dev-only and may never enter the
    // control law (see THE PACE TAPE), but it can say how far from the trace's
    // own starting point this drive's odometer zero actually sat — the lag the
    // pre-drive liveness checks leave behind. `y = −z` (LessonScene.tsx:597).
    const w = guideWitness[0];
    pace.alignment = {
      source: "window.__camProbe at the first control tick, against the trace's first sample",
      offsetM: Number(Math.hypot(w.x - paceTape.first.x, -w.z - paceTape.first.y).toFixed(1)),
      note:
        "the odometer starts at 0 there, so this is how far down the road the car already was when the control law " +
        "took over. It is EVIDENCE: it did not steer, aim or index anything on this drive.",
    };
  }
  if (paceTape === null) {
    loud(
      `NO PACE TAPE ON THIS LANE (${pace.why}) — the drive fell back to the fixed ${CRUISE_KMH} км/ч creep behind the ` +
        `${ROLL_DISTANCE_M} m / ${ROLL_MS / 1000}s roll bound, and measured on this tree that bound is the CLOCK: two runs ` +
        `of it are two different amounts of road and are not two samples of the same drive.`,
    );
  } else {
    const kk = pace.targets.map((r) => r.kmh);
    const span = kk.length ? `${Math.min(...kk)}–${Math.max(...kk)} км/ч` : "never set (the roll phase was never entered)";
    note(
      `  PACE: ${paceTape.path} — ${paceTape.totalM} m of authored route in ${paceTape.durationSec ?? "?"} s, top ` +
        `${paceTape.topKmh} км/ч, ${paceTape.stops} authored rest(s). This drive's odometer read ${pace.odoM} m ` +
        `(${Math.round((pace.odoM / paceTape.totalM) * 100)}% of that route) over ${pace.rolls} roll(s), target ${span}` +
        (pace.capHits
          ? ` · ${pace.capHits} roll(s) ended on the CLOCK and not on the metres — those are the box's length, not the road's`
          : " · every roll ended on its METRES, not on the clock"),
    );
    note(
      `        THE LOOK CADENCE IS NO LONGER BLANKET, and a reader must know it. At or below ${CRUISE_KMH} км/ч it is ` +
        `${ROLL_DISTANCE_M} m exactly as it has always been; above it the car holds ${LOOK_EVERY_S.toFixed(1)}s of cruising ` +
        `between two rests, which on a fast stretch is over a hundred metres. What catches a crossing there is the TAPE ` +
        `slowing down and not the cadence — so «Непропускане на пешеходец» on this lane has to be read against ` +
        `pace.targets in _audit-status.json before it is filed against the product.`,
    );
    /* ── THE TWO FAULTS A FAST LANE EARNS THAT A CRAWLING ONE COULD NOT ─────
     *
     * Both are the product judging THIS INSTRUMENT, both are new to the corpus
     * on 2026-08-28, and both must be said out loud rather than left for a
     * reader to meet as a regression. Measured on sc-fo-motorway-gap/pc/right,
     * the first drive this harness has ever taken above 17 км/ч on a motorway
     * (top 118 км/ч, 1041 m against 364 m, objective one credited at 1:00
     * instead of 4:07, and «Твърде бавно движение по автомагистрала» — the
     * self-conviction the old crawl earned — gone):
     *
     *  1. «Рязко спиране без причина». The look cadence ends a roll in a FULL
     *     REST, and from cruising speed that is an emergency-grade stop. The
     *     engine's own numbers say exactly when: `harshBrakeMinSpeedKmh` 35,
     *     `harshBrakeDecelMps2` 7, `harshBrakeSustainSec` 0.4 (rules/types.ts).
     *     IT CANNOT BE PULSED AWAY — a sustain window of 0.4 s is shorter than
     *     one 500 ms control tick, so the shortest brake this harness can
     *     press already outlasts it — and it cannot be coasted away either:
     *     measured on that drive, off-throttle deceleration is about
     *     0.2 m/s², i.e. two and a half minutes from 118 км/ч to 35. So a rest
     *     taken above 35 км/ч earns this fault, and the fault is the
     *     instrument's act.
     *  2. «Движение по аварийната лента», and any other lane-position fault.
     *     NOT NEW — the crawling baseline earned that one too, and saying it
     *     was new would be this file inventing a regression. What is new is how
     *     SOON: a drive whose guidance loop is BLIND travels in a straight
     *     line, and a straight line at 118 км/ч leaves the carriageway in a
     *     fifth of the time it takes at 13. THE PACE TAPE MAKES THE STEERING
     *     DEFICIT MORE VISIBLE, NOT LESS, and on a lesson that TURNS that is
     *     the whole story: measured on sc-ed-d2-city-run/pc/right, three paced
     *     drives and three crawling ones all ended the same way — «Удар в
     *     неподвижно препятствие», a crash, at a different place every time —
     *     so the drive's LENGTH there is set by where an unsteered car hits
     *     something and not by anything in this file. Read the TRACKING line
     *     above before filing any lane-position fault; on a lane it calls
     *     BLIND they say nothing about the product.
     */
    note(
      `        AND TWO FAULTS THIS LANE CAN NOW EARN THAT A CRAWL COULD NOT, both the instrument's own act: «Рязко ` +
        `спиране без причина» (a rest taken above the engine's 35 км/ч harsh-brake onset — unavoidable, the 0.4 s ` +
        `sustain window is shorter than one control tick) and «Движение по аварийната лента» or any lane-position ` +
        `fault (a BLIND loop drives straight, and straight at speed leaves the road far sooner). Neither is evidence ` +
        `about this lesson.`,
    );
    if (pace.alignment !== null) {
      note(
        `        INDEX ALIGNMENT: the car was ${pace.alignment.offsetM} m from the trace's first sample when this ` +
          `odometer started at 0 — the ground the pre-drive liveness checks covered. Measured by the dev-only pose ` +
          `probe and NOT used to drive; the target this lane applied is the tape's reading for ground already passed.`,
      );
    }
    // …AND THE ONE OUTCOME THAT IS A FINDING ABOUT THE PRODUCT RATHER THAN
    // ABOUT THIS INSTRUMENT: the car covered the whole authored route and the
    // lesson did not end. That is not „the harness could not get there".
    if (!ended && pace.odoM >= paceTape.totalM) {
      loud(
        `THIS DRIVE COVERED THE WHOLE AUTHORED ROUTE (${pace.odoM} m of ${paceTape.totalM} m) AND THE SESSION DID NOT ` +
          `END. The distance excuse does not apply to this lane: read the objectives below as evidence about a car that ` +
          `went the distance the product's own correct drive goes.`,
      );
    }
  }
}
// …AND `pace` IS PUBLISHED ON EVERY LANE, INCLUDING THE ONES IT DID NOTHING
// ON. A `wrong` lane's status file used to carry no `pace` key at all, which is
// the same silence this block's own opening complains about one level down: an
// absent field and a field reading `used: false, why: "MODE=wrong…"` are
// different statements, and only the second one can be read.
saveStatus({ pace });
// ── WHAT HAPPENED TO REVERSE, ON EVERY LANE ────────────────────────────────
//
// PRINTED WHETHER OR NOT THE LESSON ASKED, and that is the point: „this lesson
// never wanted R" and „this lesson wanted R and never got it" were the SAME
// silence for 376 drives, and the silence read as the first one. It is one
// line either way, and a reader never has to infer which.
{
  reverse.deliberatePresses = standstillPresses;
  const g = gearLine(reverse.gearSeen);
  if (!reverse.demanded) {
    note(`  REVERSE: not demanded by this lesson at any sampled tick · cluster only ever read ${g}`);
  } else if (reverse.armed) {
    note(
      `  REVERSE: DEMANDED («${reverse.demandedBy}») and ARMED at t=${reverse.armedAtSec}s after ` +
        `${reverse.attempted}/${REVERSE_ARM_BUDGET} deliberate press(es) over ${reverse.bursts} burst(s) · ` +
        `${reverse.reverseTicks} tick(s) driven in R · ` +
        `disarmed: ${reverse.disarmed === null ? (reverse.disarmNote ?? "not reached") : reverse.disarmed} · ` +
        `cluster read ${g}`,
    );
    // EVERY burst that failed BEFORE the one that worked, listed. A run that
    // succeeded on the third burst and a run that succeeded on the first are
    // different runs, and the old single `failure` field could only say
    // „something went wrong at some point", which reads as neither.
    for (const f of reverse.failures) note(`      · on the way there: ${f}`);
  } else {
    note(
      `  REVERSE: DEMANDED («${reverse.demandedBy}») and NEVER ARMED · ` +
        `${reverse.attempted}/${REVERSE_ARM_BUDGET} press(es) over ${reverse.bursts} burst(s) · ` +
        `${reverse.blocked ? `BLOCKED: ${reverse.blocked}` : (reverseWhy() ?? "no reason recorded")} · cluster read ${g}`,
    );
    for (const f of reverse.failures) note(`      · ${f}`);
  }
  // AND WHAT THE WATCHDOG CONCLUDED, IN THE SUMMARY AND NOT ONLY IN A LOUD LINE
  // 200 LINES ABOVE IT. A reader who scrolls to the MACHINE SUMMARY must not
  // have to go looking for the one sentence that says every pedal after t=Ns
  // meant the opposite thing — nor for the fact that nobody knows who caused it.
  if (reverse.unarmedRAt !== null) {
    const ev = reverse.unarmedREvidence ?? {};
    note(
      // THE CLUSTER IS QUOTED, NOT SUMMARISED AS «R». `includes("R")` fires on
      // «D/R» too, and this line is the one a judge reads; printing a bare «R»
      // over a disagreeing cluster is the same silence in miniature.
      `  UNARMED R: the cluster read «${ev.cluster ?? "R"}»${ev.clusterAmbiguous ? " (TWO OWNERS DISAGREE)" : ""} at ` +
        `t=${reverse.unarmedRAt}s in phase «${ev.phase}» · attribution ${reverse.unarmedRWho} · ` +
        `this drive had made ${ev.sPresses ?? 0} S press(es)` +
        (ev.deliberatePresses ? ` of which ${ev.deliberatePresses} were its OWN deliberate arming gesture` : "") +
        (ev.lastSPressAtSec === null || ev.lastSPressAtSec === undefined
          ? ""
          : ` (last at t=${ev.lastSPressAtSec}s, ${ev.lastSPressSecondsBefore}s before${ev.lastSPressNear === false ? " — OUTSIDE the ~2 s latency window, so it is not a candidate for this R" : ""}, via ${ev.lastSPressVia}, gated on ${ev.lastSPressVia === "sChannel" ? "a deliberate standstill press" : ev.lastSPressKmhAtIssue === null ? "NO READING AT ALL" : `${ev.lastSPressKmhAtIssue} км/ч`})`) +
        ` · refused ${ev.refusedStandstillPresses ?? 0} standstill press(es) · disarmed: ${ev.disarmed}` +
        (reverse.unarmedRWho === "undetermined"
          ? " — «undetermined» is the answer, not a gap in one: the harness presses the brake at every stop and cannot observe the speed its press landed at."
          : ""),
    );
  }
}
if (reverse.demanded && !reverse.armed) {
  loud(
    `THIS RUN NEVER REVERSED ON A LESSON THAT ASKED FOR REVERSE. Read the "reverse" block in _audit-status.json before judging ` +
      `anything below: the manoeuvre was not performed, so it was neither passed nor failed.`,
  );
}
// THE HARNESS'S OWN COST, STATED. A tick is one pass of the control law; when
// the box is loaded it stretches, and a stretched tick is how the duty cycle
// silently collapsed on `pc`. Reported so a sweep that starts producing
// no-credit rows can be checked against the machine before the product.
{
  const sorted = [...tickMs].sort((a, b) => a - b);
  const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const max = sorted.length ? sorted[sorted.length - 1] : 0;
  note(`  TICKS: ${tickMs.length} (${drivingTicks} of them driving) · median ${med} ms · worst ${max} ms`);
  note(`  TICK COST: ${costLine()}`);
  if (med > 2500) {
    loud(`the control law ran at ${med} ms per tick — this box is too loaded to drive a lesson properly; treat this row as unmeasured.`);
  }
}
await page.waitForTimeout(2500);
saveStatus({ phase: "reaching-debrief", ended });
await beat("07-end");

// ── THE DEBRIEF — AND IT IS FORCED, NOT HOPED FOR ──────────────────────────
//
// THE DEFECT THIS BLOCK EXISTS TO CLOSE. Engine pass 2 produced four saved
// artifacts and every one ended:
//     DEBRIEF {"objectives":[],"mistakes":null,"good":null,"rubric":null}  ended:false
// The session never ended in ANY run, so every "credited"/"refused" verdict in
// that wave — including a whole 0%/50%/75% roundabout table — came from
// transient HUD toasts and the banner bar, which is the one source the brief
// forbade. A sweep of 644 drives with this hole is 644 folders that cannot
// answer the only question that matters: was correct driving credited?
//
// The task chip is not a substitute: it goes «2/2 -> null» when the session ends
// whether or not anything was ticked, so a run that credited NOTHING is
// indistinguishable from a perfect one.
let endedNaturally = ended;
let forcedBy = null;

// THE LADDER. One rung per surface, each addressed by ITS OWNER'S handle, each
// logged. Bounded, and it says which rung it took every single time — "this
// lesson needed nine taps to reach its own result" is a finding about the
// lesson, not harness noise.
const RUNGS = 26;
let rungsUsed = 0;
let reached = false;
const trail = [];

for (let step = 1; step <= RUNGS; step++) {
  const c = await census();
  if (c.verdictCard) {
    reached = true;
    rungsUsed = step - 1;
    note(`  ladder: the verdict card (#sim-result-title) is up after ${trail.length} action(s)`);
    break;
  }
  let did = null;

  // RUNG 4 — the I1 calibration gate «Позна ли се?». It renders INSTEAD OF the
  // debrief, so it must be cleared before anything below it exists. Scoped to
  // the gate's own <section> because «Пропусни» also prefixes «Пропусни
  // разбора» — the control that CLOSES the very screen we are trying to read.
  if (!did && c.calibration) {
    const gate = page.locator("section:has(#sim-calibration-title)");
    if (await press(gate.locator('button:has-text("Виж пълния резултат")')))
      did = "calibration reveal → «Виж пълния резултат»";
    else if (await press(gate.locator('button:has-text("Пропусни")')))
      did = "calibration gate → «Пропусни»";
    else loud("the «Позна ли се?» gate is up and NEITHER of its two exits could be pressed.");
  }

  // RUNG 2 — the compact end LINE. Its ack chip is «Резултат», not «Разбрах»,
  // and on a phone `shouldShowDebrief()` is false until it is pressed, so the
  // debrief does not exist in the DOM before this click.
  if (!did && c.overlays.some((o) => o.kind === "end")) {
    const ov = page.locator('[data-sim-overlay="end"]');
    if (await press(ov.locator('button:has-text("Резултат")')))
      did = "end line → «Резултат»";
    else if (await press(ov.locator("button").last()))
      did = "end line → its last control (the «Резултат» chip was not matchable)";
    else loud("the end LINE is on the glass and none of its controls could be pressed.");
  }

  // RUNG 3 — the roomy end BAR.
  if (!did && c.endBar) {
    if (await press(page.locator('[data-hud="end-bar"] button:has-text("Виж разбора")')))
      did = "end bar → «Виж разбора»";
    else loud("the end BAR is on the glass but «Виж разбора» could not be pressed.");
  }

  // RUNG 1 — the first-run touch hint. Its container is `pointer-events-none`
  // and only the button inside it is `auto`, which is why every page-wide
  // selector missed it. There is exactly one button in there.
  if (!did && c.touchHint) {
    if (await press(page.locator('[data-hud="touch-hint"] button')))
      did = "touch hint → its own «Разбрах»";
    else loud('[data-hud="touch-hint"] is visible but its button could not be pressed.');
  }

  // A pause layer that arrived after the drive loop stopped — a teach card, a
  // micro-quiz, the THEO-3 consequence card. Same drain as the drive loop, and
  // it is deliberately BELOW the end rungs: the end line outranks a teach card
  // in the product's own queue, so if both are up the result is the way out.
  if (!did && c.pause !== null) {
    const n = await drainPause();
    if (n) did = `drained ${n} pause layer${n === 1 ? "" : "s"} («${c.pause}»)`;
  }

  // Anything else still holding the layer — a hint peek, a praise line. Same
  // drain grammar as the drive loop, scoped to the overlay so it cannot range
  // over the debrief.
  if (!did && c.overlays.length) {
    const ov = page.locator("[data-sim-overlay]").first();
    if (await press(ov.locator('button:has-text("Разбрах")')))
      did = `overlay «${c.overlays[0].kind}» → «Разбрах»`;
    else if (await press(ov.locator("[data-hud-close]")))
      did = `overlay «${c.overlays[0].kind}» → its ✕`;
    else if (await press(page.locator('[data-sim-overlay-card="button"]')))
      did = `overlay «${c.overlays[0].kind}» → the card is the dismiss button`;
  }

  // THE SESSION NEVER ENDED. Force it — the lesson menu carries «Завърши
  // сесията» when the lesson has no objectives and «Прекрати урока» when it
  // does, and the roomy toolbar carries both directly. A forced end is a WEAKER
  // result than a natural one and is recorded as such, because "the session had
  // to be forced" is itself a finding about the lesson.
  if (!did && !c.endScreen && !c.endBar && !c.overlays.some((o) => o.kind === "end")) {
    if (forcedBy === null) {
      note(`  the session did not end on its own — forcing it`);
      await openMenu();
      await page.waitForTimeout(600);
      await shot("07b-menu");
      for (const l of ["Завърши сесията", "Прекрати урока", "Прекрати изпита", "Приключи"]) {
        if (await press(page.locator(`button:has-text("${l}"), [role=menuitem]:has-text("${l}")`))) {
          forcedBy = l;
          did = `forced the end through «${l}»`;
          break;
        }
      }
      if (forcedBy === null) {
        await closeMenu();
        loud("no control on this screen ends the session — not «Завърши сесията», not «Прекрати урока».");
      }
      await page.waitForTimeout(4000);
    }
  }

  // Last resort: the micro-menu recall. THEO-4 guarantees «Виж разбора» is one
  // tap away from anywhere for the whole ended session, so if the end line was
  // dismissed this is still a way in.
  if (!did && (c.endScreen || c.endBar || c.overlays.some((o) => o.kind === "end") || forcedBy !== null)) {
    if (await openMenu()) {
      await page.waitForTimeout(500);
      if (await press(page.locator('[data-hud="play-menu"] button:has-text("Виж разбора"), [data-hud="play-menu"] [role=menuitem]:has-text("Виж разбора")')))
        did = "menu recall → «Виж разбора»";
      else await closeMenu();
    }
  }

  if (!did) {
    rungsUsed = step - 1;
    loud(`THE LADDER IS STUCK at step ${step}: nothing on this screen leads to the result.`);
    dumpCensus(c, `stuck at ladder step ${step}`);
    break;
  }
  trail.push(did);
  note(`  ladder ${trail.length}: ${did}`);
  await page.waitForTimeout(2200);
  rungsUsed = step;
}

if (!reached) {
  // The census is dumped on the failure path unconditionally — this is the
  // artifact that stopped the fifth guess at a selector from being necessary.
  dumpCensus(await census(), "the ladder never reached the verdict card");
}

const debrief = await beat("08-debrief");

// ── WHAT THE DEBRIEF ACTUALLY SAYS ─────────────────────────────────────────
//
// A VERDICT, NOT A WORD THAT LOOKS LIKE ONE. The first version accepted /точк/
// and matched «изпитни т.» inside a TEACH card, so it printed
// "DEBRIEF REACHED: yes" while photographing the seatbelt lesson. The second
// version tested /ИЗДЪРЖАН|НЕИЗДЪРЖАН/ against text that renders «Издържан» —
// a case-sensitive test that could not match the surface it was written for.
//
// So it is read out of the STRUCTURE SessionEndScreen writes: the verdict pill
// inside `section[aria-labelledby="sim-result-title"]`, the objective rows with
// their ✓/– glyph, `section[aria-label="Грешки"]`, `…="Похвали"`,
// `…="Оценка на маневрата"` and `…="Разбор"`. Those are the same six handles on
// every one of the 161 scenarios.
const facts = await page
  .evaluate(() => {
    const t = (el) => (el?.innerText || "").trim().replace(/\s+/g, " ");
    const rows = (label) =>
      [...document.querySelectorAll(`section[aria-label="${label}"] li`)].map((li) => t(li));
    const verdictSection = document.querySelector('section[aria-labelledby="sim-result-title"]');
    let verdict = null;
    if (verdictSection) {
      for (const p of verdictSection.querySelectorAll("p, span")) {
        const s = t(p);
        // ── THREE STATES, NOT TWO — 2026-08-21 ────────────────────────────
        //
        // `SessionVerdict` (hud/SessionEndScreen.tsx) has been three-way since
        // the day «Неиздържан» stopped being printed over a clean изпитен
        // лист: `passed` · `failed` · `unfinished`, and
        // SESSION_VERDICT_LABEL_BG spells the third one «Незавършен». This
        // matcher knew two of them, so every unfinished drive was recorded as
        // `verdict: null` and printed «VERDICT: (none)».
        //
        // MEASURED OVER WAVE C: 0 of 376 drives lacked a debrief frame and 112
        // of them ended «Незавършен» — with a penalty-class table, a star
        // rating and `unfinishedVerdictNoteBg`'s own sentence under the badge.
        // So «(none)» was not a missing verdict. It was the harness failing to
        // read a word that was on the glass, in the direction that makes a
        // product look untested rather than tested-and-unfinished.
        //
        // «(none)» KEEPS ITS MEANING: no verdict SURFACE at all. The two must
        // stay distinguishable, because one of them is a finding about this
        // instrument and the other is a finding about the lesson.
        //
        // Exact match, as before: «Неиздържан» contains «издържан», so a
        // substring test cannot answer the right question.
        if (/^(издържан|неиздържан|незавършен)$/i.test(s)) { verdict = s.toUpperCase(); break; }
      }
    }
    const scoreText = t(verdictSection);
    const scoreMatch = scoreText.match(/(-?\d+)\s+наказателн/);
    const objectives = [
      ...document.querySelectorAll('section[aria-label="Задачи от маршрута"] li'),
    ].map((li) => {
      const glyph = t(li.querySelector("span"));
      return { done: glyph === "✓", titleBg: t(li).replace(/^[✓–-]\s*/, "").slice(0, 120) };
    });
    const stars = document.querySelector('[aria-label$="от 3 звезди"]');
    return {
      verdict,
      score: scoreMatch ? Number(scoreMatch[1]) : null,
      stars: stars ? stars.getAttribute("aria-label") : null,
      objectives,
      mistakes: rows("Грешки"),
      commendations: rows("Похвали"),
      nearMisses: rows("Разминавания на косъм"),
      debriefText: t(document.querySelector('section[aria-label="Разбор"]')).slice(0, 900),
      // Which of the two silences this is. `null` + no section = there was no
      // verdict surface at all; `null` + a section = the surface mounted and
      // carries no pill, which is a finding about the PRODUCT. They were one
      // «(none)» until 2026-08-21 and they are opposite diagnoses.
      verdictSurface: verdictSection === null ? "absent" : verdict === null ? "no-pill" : "pill",
    };
  })
  .catch((e) => ({ error: String(e?.message || e) }));

/* ===========================================================================
 * THE DEBRIEF IS A PAGE, AND 08-debrief.png WAS A WINDOW ONTO IT — 2026-08-21
 * ===========================================================================
 *
 * MEASURED ACROSS WAVE C: 08-debrief.png is a VIEWPORT shot and it stops at the
 * error-class table. «Задачи от маршрута», «Грешки», «Похвали» and «Разбор от
 * инструктора» are below the fold, and no DOM text was persisted anywhere — so
 * a large share of that wave's 77 UNJUDGED findings sit on sections that were
 * never photographed and never written down. Nothing about them was judgeable
 * in EITHER direction.
 *
 * AND THE FOLD MOVES WITH THE CONTENT, which is worse than a fixed crop. A
 * short instructor paragraph lets the frame reach «Оценка на маневрата ★★★»; a
 * long one stops it three rows earlier. What got captured therefore varies per
 * drive, and no reader can tell from the picture which case they are holding.
 *
 * THREE RECOVERIES, because they fail differently and a reader needs at least
 * one to survive:
 *   1. `_audit-debrief.json` — the facts, UNTRUNCATED, straight out of the six
 *      handles SessionEndScreen writes. Text cannot be cropped, weighs a few
 *      KB, and answers "was objective X credited" as a boolean rather than as
 *      an inference from pixels. This is the one that must never be missing.
 *   2. THE FOLD, STATED. For every named section: its box, and WHICH frame
 *      contains it. A reader who wants the picture is told which file to open
 *      instead of guessing, and a section that no frame contains says so.
 *   3. THE FRAMES THEMSELVES — the surface is scrolled and photographed page
 *      by page (`08-debrief-p1..pN`). `08-debrief.png` is left exactly as it
 *      was so every existing reader and every Wave C comparison still works.
 *
 * WHY NOT `fullPage: true` ALONE. The result screen is not always the document
 * scroller — on the phone shell it lives inside a fixed, `overflow-y: auto`
 * play shell, and a full-page screenshot of a document that does not scroll is
 * byte-for-byte the viewport shot that started this. So the scroller is FOUND
 * (walk up from the result section to the first ancestor that actually
 * overflows) and reported by name, and `fullPage` is used only when the answer
 * is the document itself.
 */
const DEBRIEF_SECTIONS = [
  'section[aria-labelledby="sim-result-title"]',
  'section[aria-label="Оценка на маневрата"]',
  // A15's mistake MAP — «Къде се случи». SessionEndScreen renders eight
  // sections and this list was written with seven; the missing one is the
  // panel that answers WHERE, which is the whole point of a wrong-lane drive.
  // MEASURED on sc-junction-scan/mobile/wrong: it occupies the entirety of
  // 08-debrief-p4.png and appeared in neither the fold report nor the dump, so
  // the one sidecar field a reader was told to trust did not mention it.
  'section[aria-label="Карта на грешките"]',
  'section[aria-label="Задачи от маршрута"]',
  'section[aria-label="Грешки"]',
  'section[aria-label="Похвали"]',
  'section[aria-label="Разминавания на косъм"]',
  'section[aria-label="Разбор"]',
];
/** THE PAGE CAP IS NO LONGER A NUMBER SOMEBODY CHOSE — 2026-08-21.
 *
 *  WHAT IT WAS: `DEBRIEF_MAX_PAGES = 6`, carrying two reasons, BOTH FALSE, and
 *  both measured false the day they were checked.
 *
 *  Reason one was cost — "frames are 200 ms on `mobile` and were measured at
 *  11,999 ms on `pc`; six pages is ~72 s in the worst case". Re-measured from
 *  the harness's own TICK COST line over two full drives of sc-junction-scan:
 *      mobile  screenshot ×41  med 915 ms  max 1,540 ms
 *      pc      screenshot ×41  med 337 ms  max   898 ms
 *  The two legs are the other way round and the pc figure is ~35× smaller. Six
 *  pages costs ~8 s on mobile and ~4 s on pc, not 72. The number was defended
 *  by a budget that did not exist.
 *
 *  Reason two was coverage — "covers every debrief measured so far". The same
 *  two drives:
 *      mobile  28,207 px of content in a  393 px window →  87 uniform pages
 *      pc      35,877 px of content in a  655 px window →  63 uniform pages
 *  Six uniform frames photograph 7 % and 11 % of those surfaces, and «Разбор»
 *  — the instructor debrief, requirement-zero per doc 64 THEO-4 — sits at
 *  25,688 px and 33,358 px, i.e. NO FRAME OF IT EXISTED on either leg. The
 *  wrong-lane drive is the case where the debrief matters most and it was the
 *  case the cap failed hardest.
 *
 *  WHAT IT IS NOW: the grid is not uniform. A uniform grid over a 28,000 px
 *  card is the wrong instrument — 87 frames of mostly-fault-rows to reach one
 *  paragraph — so the frames are ANCHORED ON THE PRODUCT'S OWN SECTIONS: one
 *  scroll position per present section in DEBRIEF_SECTIONS, plus the top of the
 *  card, deduplicated when two land within an overlap of each other. The cap is
 *  therefore DERIVED — it is `DEBRIEF_SECTIONS.length + 1`, i.e. it comes from
 *  how many named surfaces SessionEndScreen renders — and it cannot silently
 *  fail to cover a section again, because a section IS a frame.
 *
 *  AND THE COST IS STILL BOUNDED, which is the constraint nobody had written
 *  down: E: is a 7200 rpm HDD, a debrief frame measured 50–240 KB, and ENOSPC
 *  has already killed one sweep mid-drive (see the 2026-08-18 section above).
 *  Nine anchored frames is ≤ 2.2 MB and ≤ 14 s per lane against the six
 *  uniform ones' ≤ 1.4 MB and ≤ 9 s — a third more disk to go from „«Разбор»
 *  has no frame on either leg" to „every section that fits the window has one".
 *  87 frames × 644 lanes never was the alternative. */
const DEBRIEF_MAX_PAGES = DEBRIEF_SECTIONS.length + 1;
/** Rows must not fall down a seam between two frames.
 *
 *  WHAT THIS NUMBER ACTUALLY GUARANTEES, stated because it is smaller than it
 *  looks: with `step = pageH − overlap`, a section lands whole inside SOME
 *  frame only if its height ≤ overlap. At 80 px that is one row. Every section
 *  taller than 80 px is at the mercy of where its top happens to fall, which is
 *  why `fold[]` has to compute containment over the whole interval instead of
 *  assuming it. */
const DEBRIEF_OVERLAP_PX = 80;

/** Measure the surface: who scrolls, how tall, and where each section sits. */
const debriefGeometry = () =>
  page
    .evaluate((sels) => {
      const t = (el) => (el?.innerText || "").trim().replace(/\s+/g, " ");
      const anchor =
        document.querySelector('[data-hud="end-screen"]') ??
        document.querySelector('section[aria-labelledby="sim-result-title"]');
      if (!anchor) return { anchor: null };
      const scrolls = (el) => {
        if (!el) return false;
        const s = getComputedStyle(el);
        return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 8;
      };
      let scroller = null;
      for (let el = anchor; el && el !== document.body; el = el.parentElement) {
        if (scrolls(el)) { scroller = el; break; }
      }
      const docScrolls =
        document.documentElement.scrollHeight > document.documentElement.clientHeight + 8;
      const describe = (el) =>
        el
          ? {
              tag: el.tagName.toLowerCase(),
              hud: el.getAttribute?.("data-hud") ?? null,
              cls: (el.className || "").toString().slice(0, 80),
              scrollHeight: el.scrollHeight,
              clientHeight: el.clientHeight,
            }
          : null;
      const target = scroller ?? (docScrolls ? document.documentElement : null);
      // Section boxes in the SCROLLER's own content coordinates, so „which
      // page holds this row" is arithmetic rather than a second measurement.
      const originTop = target
        ? target === document.documentElement
          ? 0
          : target.getBoundingClientRect().top - target.scrollTop
        : anchor.getBoundingClientRect().top;
      const sections = sels.map((sel) => {
        const el = document.querySelector(sel);
        if (!el) return { sel, present: false };
        const r = el.getBoundingClientRect();
        const top = target === document.documentElement ? r.top + window.scrollY : r.top - originTop;
        return {
          sel,
          present: true,
          top: Math.round(top),
          height: Math.round(r.height),
          chars: t(el).length,
        };
      });
      return {
        anchor: describe(anchor),
        scroller: scroller ? describe(scroller) : docScrolls ? "document" : null,
        viewportH: window.innerHeight,
        contentH: target ? target.scrollHeight : anchor.getBoundingClientRect().height,
        pageH: target ? target.clientHeight : window.innerHeight,
        sections,
      };
    }, DEBRIEF_SECTIONS)
    .catch((e) => ({ anchor: null, error: String(e?.message || e) }));

/** The whole debrief, untruncated, out of the same six handles. */
const debriefDump = () =>
  page
    .evaluate((sels) => {
      const t = (el) => (el?.innerText || "").trim().replace(/\s+/g, " ");
      const list = (sel) => [...document.querySelectorAll(`${sel} li`)].map((li) => t(li));
      const out = {};
      for (const sel of sels) {
        const el = document.querySelector(sel);
        out[sel] = el === null ? null : { text: t(el), items: list(sel) };
      }
      const objectives = [
        ...document.querySelectorAll('section[aria-label="Задачи от маршрута"] li'),
      ].map((li) => {
        const glyph = t(li.querySelector("span"));
        // The glyph is the credit. Recorded RAW beside the boolean so a reader
        // who distrusts the mapping can check it without a re-drive.
        return { glyph, done: glyph === "✓", titleBg: t(li).replace(/^[✓–-]\s*/, "") };
      });
      const stars = document.querySelector('[aria-label$="от 3 звезди"]');
      return {
        objectives,
        stars: stars ? stars.getAttribute("aria-label") : null,
        sections: out,
      };
    }, DEBRIEF_SECTIONS)
    .catch((e) => ({ error: String(e?.message || e) }));

/** Scroll the debrief and photograph it page by page. Returns the frames it
 *  actually got — never the frames it meant to get. */
async function captureDebriefPages(geo) {
  const shots = [];
  if (!geo || geo.anchor === null) return shots;
  const pageH = Math.max(1, geo.pageH || geo.viewportH);
  const maxTop = Math.max(0, geo.contentH - pageH);
  /* ── THE GRID IS THE SECTION LIST, NOT AN ARITHMETIC SERIES ────────────────
   *
   * One stop at the TOP of the card — that is the frame every existing reader
   * and every Wave C comparison expects `08-debrief-p1` to be — and then one
   * stop per PRESENT section, aimed a hair above its first row so a heading is
   * never sliced off by rounding. Two sections that land within an overlap of
   * each other share a frame rather than spending two, because at that distance
   * the second frame would be a near-duplicate of the first.
   *
   * A uniform grid over the measured 28,207 px card needed 87 frames to reach
   * «Разбор» and took six. This takes at most one per section and reaches it on
   * the first pass. */
  const stops = [{ top: 0, anchoredOn: "the top of the result card" }];
  for (const s of geo.sections ?? []) {
    if (!s.present) continue;
    const want = Math.max(0, Math.min(maxTop, s.top - 8));
    const near = stops.find((q) => Math.abs(q.top - want) <= DEBRIEF_OVERLAP_PX);
    if (near) { near.anchoredOn += ` + ${s.sel}`; continue; }
    stops.push({ top: want, anchoredOn: s.sel });
  }
  stops.sort((a, b) => a.top - b.top);
  const pages = Math.min(stops.length, DEBRIEF_MAX_PAGES);
  if (stops.length > DEBRIEF_MAX_PAGES) {
    // Only reachable if DEBRIEF_SECTIONS grows past its own derived cap, which
    // is arithmetically impossible today — kept because a constant derived from
    // a list is only as safe as the next edit to the list.
    loud(
      `the debrief needs ${stops.length} anchored frames and the cap is ${DEBRIEF_MAX_PAGES} — ` +
        `the sections past frame ${DEBRIEF_MAX_PAGES} exist ONLY in _audit-debrief.json.`,
    );
  }
  for (let i = 0; i < pages; i++) {
    const y = stops[i].top;
    await page
      .evaluate(
        ({ top, isDoc }) => {
          if (isDoc) { window.scrollTo(0, top); return; }
          const anchor =
            document.querySelector('[data-hud="end-screen"]') ??
            document.querySelector('section[aria-labelledby="sim-result-title"]');
          for (let el = anchor; el && el !== document.body; el = el.parentElement) {
            const s = getComputedStyle(el);
            if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 8) {
              el.scrollTop = top;
              return;
            }
          }
        },
        { top: y, isDoc: geo.scroller === "document" || geo.scroller === null },
      )
      .catch(() => {});
    await page.waitForTimeout(350);
    // ── READ THE SCROLL BACK, DO NOT ASSUME IT — 2026-08-21, adversarial pass
    //
    // Every number in `fold[]` is derived from this position, so recording the
    // REQUESTED offset makes the sidecar a statement about what the harness
    // asked for, not about what the frame shows — and those separate the
    // moment anything (a `scroll-behavior: smooth` on the scrim, a re-render
    // that resets `scrollTop`, a shorter surface than `geo` measured) gets
    // between the two. Silently, and in the reassuring direction: the sidecar
    // would keep naming distinct pages while every frame photographed the top.
    const achieved = await page
      .evaluate(() => {
        const anchor =
          document.querySelector('[data-hud="end-screen"]') ??
          document.querySelector('section[aria-labelledby="sim-result-title"]');
        for (let el = anchor; el && el !== document.body; el = el.parentElement) {
          const s = getComputedStyle(el);
          if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 8) {
            return Math.round(el.scrollTop);
          }
        }
        return Math.round(window.scrollY);
      })
      .catch(() => null);
    const at = achieved === null ? y : achieved;
    if (achieved !== null && Math.abs(achieved - y) > 4) {
      loud(
        `08-debrief-p${i + 1} was asked for scrollTop ${y} and the surface is at ${achieved} — the frame is ` +
          `photographed and reported AT ${achieved}. Two frames landing on the same offset means the page ` +
          `grid is not advancing and those sections exist only in _audit-debrief.json.`,
      );
    }
    const name = `08-debrief-p${i + 1}`;
    if (await shot(name)) {
      shots.push({
        name,
        scrollTop: at,
        coversTo: at + pageH,
        requestedScrollTop: y,
        scrollVerified: achieved !== null,
        // WHY THIS FRAME EXISTS. A uniform grid's frames answered "page 4 of
        // 87"; these answer "this is the one aimed at «Разбор»", which is the
        // question a reader of the fold report is actually asking.
        anchoredOn: stops[i].anchoredOn,
      });
    }
  }
  // Put it back where a reader expects to find it.
  await page
    .evaluate(() => {
      window.scrollTo(0, 0);
      const anchor =
        document.querySelector('[data-hud="end-screen"]') ??
        document.querySelector('section[aria-labelledby="sim-result-title"]');
      for (let el = anchor; el && el !== document.body; el = el.parentElement) {
        const s = getComputedStyle(el);
        if (/(auto|scroll)/.test(s.overflowY)) { el.scrollTop = 0; return; }
      }
    })
    .catch(() => {});
  return shots;
}

const geo = await timed("debrief", debriefGeometry);
const debriefPages = await captureDebriefPages(geo);
const dump = await timed("debrief", debriefDump);
/** Which frame holds each section — the answer 08-debrief.png could not give.
 *
 * ── A SECTION IS AN INTERVAL, NOT A POINT — 2026-08-21, adversarial pass ────
 *
 * This map matched on `s.top` ALONE, so it answered "which frame contains the
 * section's FIRST PIXEL ROW" while the field was named `inFrame` and the log
 * line beside it said which file to open. On a long debrief those are not the
 * same answer, and the difference runs the reassuring way — the reader is told
 * a frame holds a section, opens it, and sees a heading with the body cut off.
 *
 * MEASURED on sc-junction-scan/mobile/wrong (43 mistakes, 27,093 px of content
 * in a 393 px window), against the pixels of the frames it named:
 *   «Задачи от маршрута» @1286 ×142  → named p4 (939–1332). p4 shows the
 *                                      HEADING and not one objective row;
 *                                      p5 (1252–1645) holds the section whole
 *                                      and was not named.
 *   «Грешки»             @1444 ×23114 → named p5 (1252–1645), i.e. 201 px of
 *                                      23,114 — 0.9 % of the section.
 *   verdict card         @115  ×521   → `aboveTheOriginalFold: true`, while
 *                                      08-debrief.png (0–393) cuts it at the
 *                                      «Урокът беше прекъснат…» line.
 *
 * So: containment is computed over the whole interval [top, top+height).
 * `inFrame` now names only a frame that holds the section IN FULL, `inFrames`
 * lists every frame that shows any part of it, and a section taller than the
 * window says so rather than looking like a frame nobody took. Both fold
 * booleans are kept and separated, because "starts on the first screen" and
 * "fits on the first screen" are different claims and only one of them is what
 * a reader of 08-debrief.png actually gets. */
const originalFoldH = geo.pageH || geo.viewportH || 0;
/** How much of [a, b) the frames actually show, as a UNION — 2026-08-21,
 *  second adversarial pass.
 *
 *  «NO single frame holds it — spread across p5 + p6» reads as "those two hold
 *  it between them", and MEASURED on sc-junction-scan/mobile/wrong it did not:
 *  «Грешки» is 21,442 px and those two frames hold 385 px of it — 1.8 %.
 *  «Разбор от инструктора», the requirement-zero section, is 2,301 px and its
 *  one named frame holds 385 px — 16.7 %, and the product's own «↓ РАЗБОРЪТ
 *  ПРОДЪЛЖАВА» ribbon is visible at the bottom of that very frame.
 *
 *  Naming frames is not the same claim as covering a section, and the first
 *  was standing in for the second — in the reassuring direction, which is the
 *  one this programme keeps binning fixes for. So the number is computed and
 *  printed: a phrase can overstate, `385 px of 2301 (16.7 %)` cannot. */
const coveredPx = (a, b, frames) => {
  const iv = [];
  for (const f of frames) {
    const lo = Math.max(a, f.scrollTop);
    const hi = Math.min(b, f.coversTo);
    if (hi > lo) iv.push([lo, hi]);
  }
  iv.sort((x, y) => x[0] - y[0]);
  let total = 0;
  let end = -Infinity;
  for (const [lo, hi] of iv) {
    const from = Math.max(lo, end);
    if (hi > from) { total += hi - from; end = hi; }
  }
  return total;
};
const foldReport = (geo.sections ?? []).map((s) => {
  if (!s.present) return { ...s, inFrame: null, inFrames: [], wholeInAFrame: false };
  const bottom = s.top + s.height;
  // −4/+4 is the same rounding slack the scroll positions carry; it forgives a
  // sub-pixel box, never a cut row.
  const overlaps = debriefPages.filter((f) => bottom > f.scrollTop && s.top < f.coversTo);
  const whole = debriefPages.find((f) => s.top >= f.scrollTop - 4 && bottom <= f.coversTo + 4);
  const covered = coveredPx(s.top, bottom, debriefPages);
  return {
    ...s,
    bottom,
    tallerThanTheWindow: s.height > originalFoldH,
    startsAboveTheOriginalFold: s.top < originalFoldH,
    aboveTheOriginalFold: bottom <= originalFoldH,
    inFrame: whole ? `${whole.name}.png` : null,
    inFrames: overlaps.map((f) => `${f.name}.png`),
    wholeInAFrame: whole !== undefined,
    // The two numbers a reader needs before believing the file names above.
    photographedPx: covered,
    photographedPct: s.height > 0 ? Math.round((1000 * covered) / s.height) / 10 : null,
  };
});
/** …AND THE SAME QUESTION ABOUT THE WHOLE SURFACE, WHICH NOTHING ASKED.
 *
 *  The anchored grid replaced a uniform one that "covered 7 %". Measured on the
 *  same drive the anchored grid covers 2,078 of 25,421 px — 8.2 % — and the
 *  last frame ends 2,134 px above the bottom of the card, so the CTA row
 *  («Опитай пак», «Следващ урок», «Изход»), which is not a `<section>` and is
 *  therefore in no anchor, is in no frame either and was in no report. The
 *  scheme is still the right one — it is the only one that reached «Разбор» at
 *  all — but its coverage is a measurement, so it is now stated. */
const surfaceCoveredPx = coveredPx(0, geo.contentH ?? 0, debriefPages);
const lastFrameEnd = debriefPages.reduce((m, f) => Math.max(m, f.coversTo), 0);
const trailingUnphotographedPx = Math.max(0, (geo.contentH ?? 0) - lastFrameEnd);
try {
  writeFileSync(
    `${OUT}/_audit-debrief.json`,
    `${JSON.stringify(
      {
        scenario: SCENARIO,
        platform: PLATFORM,
        mode: MODE,
        reachedVerdictCard: reached,
        verdict: facts.verdict ?? null,
        verdictSurface: facts.verdictSurface ?? null,
        score: facts.score ?? null,
        geometry: {
          scroller: geo.scroller,
          viewportH: geo.viewportH ?? null,
          contentH: geo.contentH ?? null,
          pageH: geo.pageH ?? null,
          // What the frames actually hold, so a machine reader is not left to
          // infer coverage from a filename list — the inference this instrument
          // has twice got wrong in the flattering direction.
          surfaceCoveredPx,
          surfaceCoveredPct:
            geo.contentH ? Math.round((1000 * surfaceCoveredPx) / geo.contentH) / 10 : null,
          trailingUnphotographedPx,
        },
        frames: debriefPages,
        fold: foldReport,
        debrief: dump,
      },
      null,
      2,
    )}\n`,
  );
} catch (error) {
  loud(`_audit-debrief.json could not be written (${String(error?.message ?? error)}) — the frames are all that is left of the debrief.`);
}
note(
  `  DEBRIEF SURFACE: ${geo.anchor === null ? "NO result screen in the DOM" : `${geo.contentH}px of content in a ${geo.pageH}px window`}` +
    ` · scroller ${typeof geo.scroller === "string" ? geo.scroller : geo.scroller ? `${geo.scroller.tag}${geo.scroller.hud ? `[${geo.scroller.hud}]` : ""}` : "none (it fits)"}` +
    ` · ${debriefPages.length} page frame(s): ${debriefPages.map((f) => f.name).join(", ") || "-"}` +
    (geo.anchor === null
      ? ""
      : ` · THE FRAMES HOLD ${surfaceCoveredPx}px OF ${geo.contentH}px (${
          geo.contentH ? (Math.round((1000 * surfaceCoveredPx) / geo.contentH) / 10).toFixed(1) : "?"
        }%)` +
        (trailingUnphotographedPx > 0
          ? `; the last frame ends ${trailingUnphotographedPx}px above the bottom of the card, and whatever is down there (the CTA row is not a <section>, so it is in no anchor) is in NO frame and in no line below`
          : "")),
);
for (const s of foldReport) {
  if (!s.present) { note(`     – ${s.sel} — NOT PRESENT`); continue; }
  // The claim a reader acts on is "open THIS file", so it is stated first and
  // it is only made when a frame holds the whole section. When none does, the
  // frames that show ANY of it are named — and the MEASURED share they hold is
  // printed beside them, because "spread across p5 + p6" reads as "those two
  // have it between them" and on the drive that bought this line it was 1.8 %.
  const where = s.inFrame
    ? `whole in ${s.inFrame}`
    : s.inFrames.length
      ? `NO frame holds it whole — ${s.photographedPx}px of ${s.height}px (${s.photographedPct}%) is in ${s.inFrames.join(" + ")}, the rest exists ONLY in _audit-debrief.json${
          s.tallerThanTheWindow ? ` (it cannot fit one ${originalFoldH}px window)` : ""
        }`
      : "NO page frame holds any of it — it exists only in _audit-debrief.json";
  note(
    `     · ${s.sel} @${s.top}–${s.bottom}px ×${s.height}px (${s.chars} chars) — ` +
      `${s.aboveTheOriginalFold ? "inside" : s.startsAboveTheOriginalFold ? "CUT BY" : "BELOW"} 08-debrief.png · ${where}`,
  );
}

/**
 * WHY THERE IS NO VERDICT — AND THE THIRD ANSWER IS "THE INSTRUMENT DID NOT
 * ASK", NOT "THE PRODUCT HAS NO PILL" — 2026-08-21 (verifier).
 *
 * `facts` is the result of ONE `evaluate` that has a `.catch` returning
 * `{ error }` — no `verdict`, no `verdictSurface`, no anything. Every reader of
 * `facts.verdictSurface` therefore has THREE inputs, not two: "absent",
 * "no-pill", and `undefined` for a read that never happened.
 *
 * Written as a two-way test, `undefined` falls into the else — so a harness
 * whose own debrief reader threw would print «the result screen mounted but
 * carries NO verdict pill», i.e. file an instrument failure as a PRODUCT
 * defect, in the direction that makes the instrument look like it worked. That
 * is the exact failure mode this programme exists to catch, and it must not be
 * introduced by the fix for the previous one.
 */
const verdictWhyNone =
  facts.verdictSurface === "absent"
    ? "no verdict surface in the DOM"
    : facts.verdictSurface === "no-pill"
      ? "the surface mounted and carries NO pill"
      : `the debrief reader never answered — ${facts.error ?? "no verdictSurface was recorded"}`;
const hasVerdict = reached && facts.verdict !== null;
note(`  DEBRIEF REACHED: ${hasVerdict ? "yes" : "NO — this run cannot answer whether credit was given"}`);
if (!hasVerdict) {
  loud(
    !reached
      ? "the ladder never reached the result screen — every 'credited' claim from this run is worthless."
      : facts.verdictSurface == null
        ? `the debrief reader never answered (${facts.error ?? "no verdictSurface was recorded"}) — this run says ` +
          "NOTHING about whether a pill was on the glass, in either direction, and nothing here is a finding about the lesson."
        : "the result screen mounted but carries NO verdict pill — read the census above before believing any number here.",
  );
}
note(`  ended naturally: ${endedNaturally}${endedNaturally ? "" : `  (forced via «${forcedBy ?? "nothing"}» — itself a finding)`}`);

note(`\n--- MACHINE SUMMARY (${SCENARIO}/${PLATFORM}/${MODE}) ---`);
// THE BUILD STAMP OUTRANKS EVEN THE FRAME LEDGER, so it goes above it. How
// many pixels exist is the second question; WHAT THEY ARE OF is the first, and
// the sweep this replaces could not answer it at all — an unset KNIJKA_BASE
// pointed every lane at staging and the summary read exactly like a lane that
// had photographed this tree.
note(`target: ${describeTarget(target)}`);
// AND THE TREE IS RE-READ AT THE END, because seven lanes edit this repo
// concurrently and `next dev` hot-reloads underneath a drive. A run whose
// source moved between the first frame and the last is not attributable to
// either state, and a re-drive lane crediting a closure off one would be
// issuing a certificate for a build that never existed as a whole.
//
// IT IS RECORDED, NOT MADE FATAL, and the line between those is deliberate:
// the exit code is about whether the EVIDENCE is complete (see the block at the
// bottom), and these frames are real and whole. What changed is what they can
// be attributed to, which is a judgement for the reader, so the reader is
// handed both digests rather than a verdict.
const treeAfter = treeIdentity(REPO_ROOT);
const treeMoved = treeAfter.head !== target.head || treeAfter.worktree !== target.worktree;
if (treeMoved) {
  loud(
    `THE SOURCE TREE MOVED DURING THIS DRIVE — started at HEAD ${String(target.head).slice(0, 12)}/` +
      `${target.worktree ?? "clean"}, ended at HEAD ${String(treeAfter.head).slice(0, 12)}/` +
      `${treeAfter.worktree ?? "clean"}. The frames are whole, but they span two states of the code and ` +
      `must NOT be used to certify a closure. Re-drive on a still tree for that.`,
  );
}
// THE FRAME LEDGER GOES IN THE SUMMARY, not only in the loud lines above, and
// it goes in FIRST among the drive's own numbers. Every judgement below this
// point was made from pixels, so a reader has to know how many of those pixels
// exist before reading a word of it — the sweep it replaces produced folders
// whose 08-debrief.png was 0 bytes and whose summary read exactly like a lesson
// that had been photographed.
note(
  `frames: ${frames.written} captured · ${frames.lost} LOST` +
    (frames.cameraStopped ? ` · camera stopped (${frames.cameraStopped})` : "") +
    (frames.lost ? ` — ${frames.names.join(" | ")}` : ""),
);
if (frames.lost) {
  loud(
    `${frames.lost} frame${frames.lost === 1 ? "" : "s"} named above ${frames.lost === 1 ? "does" : "do"} not exist on disk. ` +
      `Any part of this lane's verdict that needs one of them is UNANSWERED, not answered in the negative.`,
  );
}
if (stdoutBroken) {
  loud(`the run log itself could not be written in full (${stdoutBroken}) — what follows may be missing from the file on disk.`);
}
note(`ended: ${ended} · endedNaturally: ${endedNaturally} · forcedBy: ${forcedBy ?? "-"}`);
note(`ladder: ${trail.length} action(s) over ${rungsUsed} step(s)${trail.length ? ` — ${trail.join(" | ")}` : ""}`);
// `entered` rides in the SUMMARY and not only in the drive report, because the
// summary is the block a verifier reads when it will not read a 1,000-line log
// — and «top» is the field it quotes. The two travel together or the quote goes
// back to being unfalsifiable.
note(`drive: top ${topSpeed} км/ч (entered the loop at ${enteredLoopKmh ?? "?"} км/ч) · ${stopsMade} full stops · ${waitsHonoured} lawful waits (${waitSeconds}s) · ${teachDrained} pause layers · final ${debrief.kmh} км/ч${manualGear ? ` · gearbox MANUAL, engaged N → ${manualGear} by the harness` : ""}`);
note(`positive control: ${positiveControl.direction}${positiveControl.direction === "forward" ? ` · ${positiveControl.kmh} км/ч after ${(positiveControl.heldMs / 1000).toFixed(1)} s` : ` · ${positiveControl.why}`}`);
note(`briefing chars: ${briefing.length}`);
if (facts.error) loud(`the debrief reader threw: ${facts.error}`);
// «(none)» NOW MEANS WHAT IT SAYS. Since the matcher learned «НЕЗАВЪРШЕН» the
// only way to reach this branch is a result surface with no pill on it, no
// surface at all, or a reader that threw — so the reason is printed beside the
// word rather than left for a reader to assume. See `verdictWhyNone`: the third
// case is the one a two-way test silently reports as the second.
note(
  `VERDICT: ${facts.verdict ?? `(none — ${verdictWhyNone})`}` +
    ` · SCORE: ${facts.score ?? "(none)"} наказателни точки · ${facts.stars ?? "no rubric stars"}`,
);
note(`OBJECTIVES (${facts.objectives?.length ?? 0}):`);
for (const o of facts.objectives ?? []) note(`   ${o.done ? "✓" : "–"} ${o.titleBg}`);
if (!(facts.objectives ?? []).length) note("   (the debrief listed no objectives at all)");
/* ── WHAT THIS DRIVE DID WITH THE WHEEL, ON EVERY LANE ──────────────────────
 *
 * PRINTED WHETHER OR NOT IT TURNED, and that is the entire point. For 376
 * drives „this lesson never needed steering" and „this lesson needed it and the
 * harness structurally could not" were the same thing: nothing. Nothing reads
 * as the first one. It is one line either way now, and it is placed HERE —
 * between the objectives and the mistakes — because those two lists are exactly
 * what a reader is about to draw the wrong conclusion from.
 */
/* ── AND HOW WELL IT TRACKED, WHICH IS THE HALF THAT QUALIFIES EVERYTHING ───
 *
 * A judge reading a failed objective below has to be able to answer ONE
 * question without rerunning this drive: did the product refuse a competent
 * drive, or did the harness drive badly? Everything in this block is that
 * answer, and the caveat is part of it — a tracking number without the
 * centreline objection beside it would licence exactly the lane-position
 * findings this signal cannot support.
 */
{
  guidance.tracking = summariseTracking(guidance.samples);
  if (guideWitness.length >= 2) {
    // The dev-only pose probe, folded to two numbers: how far the car actually
    // travelled, and how far it ended from where it started. They differ
    // whenever the car turned, and they are equal for a straight line — which
    // makes this an independent check on the loop's own story, published by
    // something the loop does not control.
    let pathM = 0;
    for (let i = 1; i < guideWitness.length; i++) {
      pathM += Math.hypot(guideWitness[i].x - guideWitness[i - 1].x, guideWitness[i].z - guideWitness[i - 1].z);
    }
    const a = guideWitness[0];
    const b = guideWitness[guideWitness.length - 1];
    const netM = Math.hypot(b.x - a.x, b.z - a.z);
    guidance.witness = {
      source: "window.__camProbe (CameraRig.tsx, DEV BUILDS ONLY — absent from a production build)",
      samples: guideWitness.length,
      pathM: Number(pathM.toFixed(1)),
      netM: Number(netM.toFixed(1)),
      // 1.00 is a straight line. Below ~0.98 the car demonstrably turned.
      straightness: pathM > 0.5 ? Number((netM / pathM).toFixed(3)) : null,
      from: { x: Number(a.x.toFixed(2)), z: Number(a.z.toFixed(2)) },
      to: { x: Number(b.x.toFixed(2)), z: Number(b.z.toFixed(2)) },
      /* ── THE POSES THEMSELVES, AND WHY THREE NUMBERS WERE NOT ENOUGH ──────
       *
       * 2026-08-22, verifier. `pathM`/`netM`/`straightness` answer „did the
       * car turn at all". They cannot answer the question this record exists
       * for — WAS THE CAR ON THE LINE — and folding the poses away made that
       * question permanently unanswerable from a finished lane.
       *
       * THE MEASUREMENT THAT IS MISSING, AND IT IS AVAILABLE FOR FREE. Every
       * scenario ships `content/traces/<id>/shadow-correct.trace.json`, served
       * at `/traces/<id>/…`, and its samples carry `x, y` in the SAME frame as
       * this probe (`y = −chassisZ`, LessonScene.tsx:597). So the honest
       * metric — cross-track distance IN METRES from the product's own
       * recorded correct drive — is a join between that file and these rows,
       * and it needs no rerun. `tracking.medianAbsDeg` is not that number: it
       * is the CONTROL LAW'S OWN ERROR SIGNAL, a bearing to a look-ahead point
       * on a CENTRELINE, which is non-zero on a curve for a perfectly-placed
       * car and small for a car sitting metres off the line on a straight.
       *
       * MEASURED, on the very lane this round claims to have fixed: on
       * `sc-ov-lane-keeping` frame `04-t001s.png` — the spawn, where the rig
       * reports `laneOffsetM 0.0025` — the ribbon this loop steers at reads
       * −7.91°, while the shadow car's own line reads +0.51°. The loop's zero
       * is ~8° left of the product's demonstration of correct. Nothing in the
       * old three numbers could have shown that.
       *
       * Decimated to keep a long lane's status file small; `everyNth` says by
       * how much, so nobody mistakes the row count for the sample count. */
      poses: (() => {
        const step = Math.max(1, Math.ceil(guideWitness.length / 240));
        const rows = [];
        for (let i = 0; i < guideWitness.length; i += step) {
          const w = guideWitness[i];
          rows.push({ tSec: w.tSec, x: Number(w.x.toFixed(2)), z: Number(w.z.toFixed(2)), kmh: w.kmh });
        }
        return rows;
      })(),
      posesEveryNth: Math.max(1, Math.ceil(guideWitness.length / 240)),
      frame: "x, z are __camProbe chassis world coordinates; the shipped shadow trace uses y = −z (LessonScene.tsx:597)",
    };
  }
  guidance.caveat =
    "THE SIGNAL IS A ROAD CENTRELINE, NOT A LANE. guidanceRoute.ts emits centreline geometry and only eases the ribbon " +
    "into the goal's lane on the FINAL leg, so a drive that tracks it perfectly is driving down the middle of the " +
    "carriageway. NO LANE-POSITION FINDING — «drifted into the oncoming lane», «clipped the kerb», «failed to keep " +
    "right» — MAY BE DRAWN FROM THIS DRIVE. What it can support is direction: whether the car followed the road the " +
    "lesson routes it down instead of travelling straight off the carriageway.";
  const tr = guidance.tracking;
  note(
    `  TRACKING: ${tr.verdict.toUpperCase()} · ribbon seen on ${tr.seenSamples}/${tr.movingSamples} moving samples ` +
      `(${(tr.seenFrac * 100).toFixed(0)}%)` +
      (tr.medianAbsDeg === null
        ? " · no error samples"
        : ` · |err| median ${tr.medianAbsDeg}° p90 ${tr.p90AbsDeg}° worst ${tr.worstAbsDeg}° · signed median ${tr.medianSignedDeg}°` +
          ` · off-line ${Math.round(tr.timeOffLineMs / 1000)}s of ${Math.round(tr.movingMs / 1000)}s`) +
      ` · ${tr.commands} correction(s) / ${tr.commandMs} ms at the wheel · loop ${guidance.state.toUpperCase()}` +
      (guidance.witness ? ` · witness path ${guidance.witness.pathM} m net ${guidance.witness.netM} m (straightness ${guidance.witness.straightness})` : ""),
  );
  note(`            ${tr.verdictWhy}`);
  // THE VERDICT WORDS THAT INVALIDATE THE DRIVE SAY SO AT FULL VOLUME. „blind"
  // and „unaffordable" both mean the car went in a straight line; a reader who
  // skims must not be able to miss that, because a straight-line drive dressed
  // as a steered one is the worst outcome this round can produce.
  if (tr.verdict === "not-invoked" || tr.verdict === "speed-unreadable") {
    // THE TWO VERDICTS THAT CARRY NO MEASUREMENT AT ALL WERE THE TWO THAT
    // RAISED NO ALARM — 2026-08-22, verifier. Both were folded into a quiet
    // „never-moved" before this, and neither reached `loud()`; a MODE=«wrong»
    // lane (the loop is never invoked there) and a lane whose speed probe had
    // died both printed a calm line and nothing else. An empty record must
    // shout louder than a bad one, not less.
    loud(`THIS DRIVE WAS NOT STEERED AND NOT MEASURED — ${tr.verdictWhy} Every objective below is evidence about an UNSTEERED car.`);
  } else if (tr.verdict === "blind" || guidance.state === "unaffordable" || guidance.state === "no-band") {
    loud(
      `THIS DRIVE WAS NOT STEERED — ${guidance.state === "steering" ? tr.verdictWhy : guidance.why} ` +
        "Every objective below, and every frame, is evidence about a car travelling in a straight line.",
    );
  } else if (tr.verdict === "wandered" || tr.verdict === "intermittent") {
    loud(
      `THIS DRIVE STEERED BADLY (${tr.verdict}) — ${tr.verdictWhy} A missed objective or a departure from the road on ` +
        "this lane may be the harness's driving and not the product's. Qualify anything filed from it.",
    );
  }
  note(`            CAVEAT: ${guidance.caveat}`);
}
{
  const uncredited = (facts.objectives ?? []).filter((o) => !o.done);
  steering.uncreditedObjectives = uncredited.length;
  steering.uncreditedTitles = uncredited.map((o) => o.titleBg);
  // WRITTEN FROM WHAT HAPPENED, NEVER DECLARED — see the field's own note.
  steering.tracesSteer = steering.everSteered;
  const chState = steering.channel.state;
  steering.note =
    (steering.everSteered
      ? `this drive issued ${steering.commands} steering command(s) (${steering.heldMs.left} ms left, ${steering.heldMs.right} ms right) ` +
        `under the guidance loop, and the tracking verdict on this drive is «${guidance.tracking?.verdict ?? "unsummarised"}». ` +
        "READ `guidance.caveat` BEFORE FILING: the signal is a road CENTRELINE, so this drive supports findings about " +
        "direction and none about lane position."
      : // THE KEYS ARE INTERPOLATED, NOT SPELLED OUT, and that is not tidiness.
        // The mutated proof run published `keys: {left: "KeyJ", right: "KeyL"}`
        // beside a sentence reading „the channel exists (KeyA/KeyD)" — a status
        // file contradicting itself in the reassuring direction, in the one
        // field a reader would quote.
        // …AND THE OLD SENTENCE HERE WAS RETIRED ON 2026-08-21 BY BEING
        // ANSWERED. It read „how a correct drive should steer is a design
        // question owned by devrig/driveScript.ts and the scenario templates",
        // which was true while nothing on the drive path could turn. There is
        // a control law now, so reaching this branch is no longer a DESIGN
        // silence — it is a MEASURED FAILURE of that loop on this lane, and it
        // must name which one instead of shrugging at a design question.
        `the drive path did not steer on this lane: the guidance loop reports ${guidance.state.toUpperCase()} — ` +
        `${guidance.why} The channel itself exists (${STEER_KEYS.left}/${STEER_KEYS.right}) and was tested separately. ` +
        // ONE LITERAL, NOT TWO. §6 greps this sentence out of the source, and
        // the first draft split it across a `+` — so the assertion went red
        // while the published sentence was word-for-word correct. A guard that
        // breaks on reflow is a guard that gets deleted the next time it does.
        "`everSteered: false` is therefore NOT a claim that steering was unnecessary.") +
    // THE HALF THAT WAS MISSING, AND ITS ABSENCE WAS THE FINDING. Until round 3
    // this sentence ended above, and „the traces do not steer" was the only
    // thing a lane said about the wheel — so a lane whose channel had been
    // BROKEN said exactly the same words as a lane whose channel was perfect.
    ` CHANNEL: ${chState.toUpperCase()} — ${steering.channel.why}.`;
  note(
    // „the scripted traces do not steer" WAS A CATEGORICAL CLAIM AND IT IS NO
    // LONGER TRUE OF THE HARNESS — 2026-08-22, verifier. It printed on every
    // lane that issued no command, including lanes where the loop RAN and
    // simply could not see, so the one line a reader greps for still said the
    // instrument was incapable when it was merely blind here. The MACHINE
    // SUMMARY must state what happened ON THIS DRIVE and name the loop state
    // that explains it; `guidance.state`/`tracking.verdict` carry the detail.
    `  STEERING: ${steering.everSteered ? `${steering.commands} command(s) · ${steering.heldMs.left} ms left / ${steering.heldMs.right} ms right` : `0 trace commands — THIS DRIVE DID NOT STEER (guidance loop ${guidance.state.toUpperCase()})`}` +
      ` · channel ${steering.wired ? `WIRED (${STEER_KEYS.left}/${STEER_KEYS.right})` : "ABSENT"}` +
      ` · liveness ${chState.toUpperCase()}` +
      (steering.channel.legs.length
        ? ` (${steering.channel.legs.map((l) => `${l.dir} ${l.error ? "err" : `${l.px}px`}`).join(", ")}, ${steering.channel.costMs} ms)`
        : "") +
      (steering.refusedBothAtOnce ? ` · refused ${steering.refusedBothAtOnce} both-at-once command(s)` : "") +
      (steering.atStandstill ? ` · ${steering.atStandstill} issued below ${STEER_MIN_KMH} км/ч, where the wheel moves the CAMERA and not the car` : "") +
      (steering.releasedByPauseDrain ? ` · released ${steering.releasedByPauseDrain}× by a pause drain` : ""),
  );
  // THE CONFLATION, KILLED WHERE IT ACTUALLY BITES. An uncredited objective on
  // a drive that could not turn is not evidence about the lesson in either
  // direction, and Wave C recorded 92 of 145 lessons as having „no drivable
  // success path" on exactly this evidence.
  if (!steering.everSteered && uncredited.length) {
    loud(
      // "a drive that never turned the wheel" was true while nothing on the
      // lane could turn it. Since the liveness check the wheel IS turned on
      // every lane, and this sentence sat one clause away from the verdict
      // saying so. Same repair as "0 trace commands": name WHOSE silence it is.
      `${uncredited.length} objective(s) went UNCREDITED on a drive whose scripted traces never turned the wheel. This ` +
        `instrument cannot tell ` +
        `„the lesson has no drivable success path" from „this drive could not reach it": ${uncredited
          .map((o) => `«${o.titleBg}»`)
          .slice(0, 4)
          .join(", ")}${uncredited.length > 4 ? ` …and ${uncredited.length - 4} more` : ""}. ` +
        `Read the "steering" block in _audit-status.json before filing anything against these. ` +
        // AND THE CHANNEL STATE TRAVELS WITH THE WARNING, because the two are
        // different sentences: „the traces chose not to steer" leaves the
        // lesson unjudged, and „the wheel is dead" also invalidates every
        // position and lane claim the drive made on the way there.
        (chState === "dead"
          ? "AND THE CHANNEL ITSELF READ DEAD ON THIS LANE — the wheel could not have been turned even if a trace had asked."
          : chState === "live"
            ? "The channel itself read LIVE at the spawn mark, so this is the traces' silence and not a broken instrument."
            : `The channel was never tested on this lane (${steering.channel.why}), so it is not even known which.`),
    );
  }
}
note(`MISTAKES (${facts.mistakes?.length ?? 0}):`);
for (const m of facts.mistakes ?? []) note(`   ✗ ${m.slice(0, 240)}`);
if (!(facts.mistakes ?? []).length) note("   (none convicted)");
note(`COMMENDATIONS (${facts.commendations?.length ?? 0}):`);
for (const c of facts.commendations ?? []) note(`   ★ ${c.slice(0, 200)}`);
if (!(facts.commendations ?? []).length) note("   (none credited)");
if ((facts.nearMisses ?? []).length) {
  note(`NEAR MISSES (${facts.nearMisses.length}):`);
  for (const n of facts.nearMisses) note(`   ! ${n.slice(0, 200)}`);
}
note(`INSTRUCTOR DEBRIEF >>> ${facts.debriefText || "(empty)"}`);
note(`DEBRIEF TEXT >>> ${debrief.body.slice(0, 1800)}`);

// ── THE EXIT CODE IS ABOUT EVIDENCE, NOT ABOUT THE LESSON ──────────────────
//
// Every lane in the sweep exited 0, including the ones that wrote nothing but
// empty files, so whatever dispatched them recorded 644 successes. The only
// question this code answers is: CAN THIS RUN BE JUDGED?
//
// It deliberately does NOT go non-zero on a failed drive, an unreached verdict
// card or a forced session end. Those are FINDINGS — they are the product's
// answer, captured correctly, and a re-drive would faithfully reproduce them.
// Making them exit non-zero would send a re-drive lane after 137 healthy runs
// and bury the 54 that actually lost their evidence. A false failure and a
// false pass are the same crime.
//
// ── AND THE PROCESS EXIT CODE IS NOT AUTHORITATIVE ONCE A BROWSER HAS RUN ──
//
// `_audit-status.json`.exit IS. Found 2026-08-19 while adding the target check,
// by reading the sweep's own ledger:
//
//     .audit-frames/sweep161/progress.txt  ->  28 exit=0 · 4 exit=127 · 2 exit=1
//
// 127 is not one of the codes above and never has been. One of the four,
// sc-ov-narrow/mobile-wrong, still holds a COMPLETE log.txt — full MACHINE
// SUMMARY, verdict «10 ИЗПИТНИ Т. Неиздържан», the collision convicted, the
// objectives listed. The lane FINISHED and was judgeable; the process then
// aborted on the way out. Reproduced on this box, node v24.18.0 / Windows:
//
//     const r = await fetch(url); await r.text(); process.exit(6);
//     Assertion failed: !(handle->flags & UV_HANDLE_CLOSING),
//       file src\win\async.c, line 94        -> EXIT=127
//
// i.e. a native abort during handle teardown, after a SUCCESSFUL global fetch
// (auth.mjs warms /login from node before every sign-in). A failed fetch does
// not trigger it, which is exactly why every existing test of these exit codes
// passed: they all use a host that does not resolve.
//
// THE DANGER IS THE USUAL ONE, POINTING THE OTHER WAY. A dispatcher reading
// exit codes sees an undocumented non-zero and either re-drives four healthy
// lanes or, worse, discards them — and one of the four carried a real finding:
// a collision, НЕИЗДЪРЖАН, ten penalty points. Throwing that away because the
// runtime tripped over its own sockets is a false failure of the kind that
// leaves a defect in the product.
//
// It is NOT fixed here, because nothing in this file causes it and the two
// remedies that work — `process.exitCode` with no `exit()`, or not using global
// fetch — belong to the sign-in path (lib/auth.mjs `warmFromNode`) and to the
// dispatcher. `lib/target.mjs` takes the second of them for its OWN refusals,
// which is why exits 5 and 6 are safe. What this file can do is say so, and
// keep writing the truth into the status file, which no abort can rewrite:
// READ `exit` OUT OF `_audit-status.json`, and treat a process code that
// disagrees with it as evidence about node, not about the lesson.
// ── …AND "CAN THIS RUN BE JUDGED?" HAS A PRIOR QUESTION — 2026-08-28 ───────
//
// For 356 recorded lanes this line was, in full,
//
//     const exit = frames.lost || stdoutBroken ? EXIT_EVIDENCE_INCOMPLETE : EXIT_JUDGEABLE;
//
// which asks whether the FRAMES and the LOG survived and NEVER whether the
// DRIVE HAPPENED — while EXIT_JUDGEABLE is defined at the top of this file as
// «the drive happened and every frame it claims exists». It answered the second
// half of its own definition and skipped the first. Two of those 356 lanes are
// 47 identical photographs of the paywall, and both printed «EVIDENCE: complete
// — this lane can be judged». See the 2026-08-28 block in the file header.
//
// The classification is DERIVED FROM THE LEDGER THIS RUN IS ABOUT TO WRITE, so
// the footer, the exit code and `_audit-status.json` are three renderings of
// one object and cannot disagree. It is the same function `classifyLeg` runs
// over the folder afterwards.
const drive = classifyDrive({ ...status, cockpit, steering, guidance, reverse, reachedVerdictCard: reached, verdictSurface: facts.verdictSurface ?? null });
// ORDER, AND WHY IT IS THIS ONE. A lane where the drive never started is the
// most fundamental failure and re-driving is the answer, so 7 outranks
// everything. 8 comes NEXT — above the frame ledger — because it is the only
// code that means DO NOT RE-DRIVE, and letting a lost frame demote it to «1 ·
// re-drive this lane» would reinstate the exact lie in the other direction that
// 8 exists to prevent: a re-drive cannot put a car in gear that this harness has
// no key for, whether or not a screenshot also failed. Nothing is hidden by the
// ordering — every condition that held is printed in the footer below.
const exit =
  drive.class === "never-started"
    ? EXIT_DRIVE_NEVER_STARTED
    : drive.class === "not-performable"
      ? EXIT_LESSON_NOT_PERFORMABLE
      : frames.lost || stdoutBroken
        ? EXIT_EVIDENCE_INCOMPLETE
        : EXIT_JUDGEABLE;
if (drive.class !== "drove") loud(`${drive.headline.toUpperCase()} — ${drive.why}`);
if (stdoutBroken) {
  // The one recovery attempt for a transcript that never reached run.log. It
  // shares the disk that just failed, so it is allowed to fail too — but
  // sc-rx-unguarded/pc-wrong lost its entire drive this way and one try is
  // free.
  try { writeFileSync(`${OUT}/_audit-transcript.log`, `${log.join("\n")}\n`); } catch { /* the disk really is gone */ }
}
saveStatus({
  // The four frame fields used to be repeated here. They are not, any more:
  // `saveStatus` reads the ledger itself, so `complete` and every phase before
  // it now report the same numbers from the same place.
  phase: "complete",
  ended,
  endedNaturally,
  forcedBy,
  verdict: facts.verdict ?? null,
  // Three verdicts and two silences, told apart at source. A consumer that
  // sees `verdict: null` can now ask WHY without opening a picture.
  verdictSurface: facts.verdictSurface ?? null,
  score: facts.score ?? null,
  reachedVerdictCard: reached,
  // WHAT HAPPENED TO REVERSE — see the block beside `armReverse`. Always
  // present, `demanded:false` included, because "this lesson never asked" and
  // "this lesson asked and never got it" must never be the same silence again.
  reverse,
  // …AND WHAT IT DID WITH THE WHEEL. Always present, `everSteered: false`
  // included, because „this lesson never needed to steer" and „this lesson
  // needed to and the instrument could not" were the same silence for 376
  // drives, and that conflation is what hid a structural limitation for the
  // whole audit. `note` carries the sentence a consumer must not paraphrase.
  steering,
  // …AND HOW WELL IT TRACKED THE LINE IT WAS FOLLOWING. `tracking.verdict` is
  // the one field a judge must read before believing anything else in this
  // file about where the car went: "blind" and "unaffordable" mean the car
  // travelled in a straight line and this is an unsteered drive; "wandered"
  // means the harness drove badly and its failures are not the product's.
  // `caveat` states what the signal cannot support — read it before filing.
  guidance,
  // …and where the rest of the debrief went. `sidecar` is the claim a reader
  // checks first: if it is false, the sections below the fold are gone.
  debrief: {
    sidecar: existsSync(`${OUT}/_audit-debrief.json`),
    pageFrames: debriefPages.map((f) => f.name),
    contentH: geo.contentH ?? null,
    pageH: geo.pageH ?? null,
    // Three buckets, because "not wholly inside 08-debrief.png" collapses two
    // different things a reader has to act on differently: a section that
    // starts on the first screen and is CUT (the reader thinks they have it),
    // and one that starts past it (the reader knows they do not).
    sectionsBelowTheFold: foldReport
      .filter((s) => s.present && !s.startsAboveTheOriginalFold)
      .map((s) => s.sel),
    sectionsCutByTheFold: foldReport
      .filter((s) => s.present && s.startsAboveTheOriginalFold && !s.aboveTheOriginalFold)
      .map((s) => s.sel),
    // The load-bearing one: sections no page frame photographed in full. If it
    // is non-empty, those sections are TEXT ONLY, in `_audit-debrief.json`.
    sectionsNoFrameHoldsWhole: foldReport.filter((s) => s.present && !s.wholeInAFrame).map((s) => s.sel),
  },
  // Both ends of the build stamp, so the folder answers "what did these pixels
  // photograph?" without anybody re-deriving it. `target` was written at
  // `target-attested` and is carried forward by `status`; this adds the second
  // reading and the comparison.
  targetAtEnd: { head: treeAfter.head, worktree: treeAfter.worktree, dirtyCount: treeAfter.dirtyCount },
  treeMovedDuringRun: treeMoved,
  // WHETHER THERE WAS EVER A CAR, and the raw census it was decided from. Both,
  // not just the verdict: `drive.class` is this file's opinion and `cockpit` is
  // the measurement, and a reader who disagrees with the opinion must be able
  // to re-derive it without re-driving. That is exactly what could NOT be done
  // for the 356 lanes already on disk.
  cockpit,
  drive,
  // …AND WHAT THE DRIVE'S HEADLINE SPEED INHERITED. `topSpeed` is quoted by
  // verifiers to open and close speed findings, and until the positive control
  // learned to release its pedal the first tick of a `right` lane sampled the
  // calibration burst — so `top` and „how fast this lesson was driven" were two
  // facts wearing one number. This is the second fact, published beside it, on
  // every run and not only on the runs where it goes wrong.
  speed: { topKmh: topSpeed, enteredLoopKmh },
  exit,
});
/* ── THE FOOTER, AND THE THREE CASES A READER MUST TELL APART WITHOUT A PICTURE
 *
 * It used to be a two-way ternary — "complete, judgeable" or "INCOMPLETE,
 * re-drive" — and both of its answers were wrong for a dead lane: it said the
 * first one. Four states now, and the imperative at the end of each is
 * different, because that imperative is the only part of this line anybody
 * acts on:
 *
 *   exit 0  complete — judge it
 *   exit 1  INCOMPLETE — re-drive (the drive happened; some evidence was lost)
 *   exit 7  THE DRIVE NEVER STARTED — re-drive (there was no car to photograph)
 *   exit 8  CANNOT BE PERFORMED — DO NOT re-drive; the harness has to change
 *
 * `drive.headline` is not spelled out here: it comes from DRIVE_CLASSES, so
 * this sentence and the `_audit-status.json` field and the judge-side tag are
 * one string with one owner. A frame loss on a 7 or an 8 is appended rather
 * than allowed to overwrite the diagnosis, so nothing the old line reported is
 * lost from this one. */
const evidenceLost = [frames.lost ? `${frames.lost} frame(s) LOST` : null, stdoutBroken ? "the run log is short" : null]
  .filter(Boolean)
  .join(" · ");
note(
  `EVIDENCE: ${
    exit === EXIT_JUDGEABLE
      ? "complete — this lane can be judged"
      : exit === EXIT_EVIDENCE_INCOMPLETE
        ? `INCOMPLETE (${evidenceLost}) · RE-DRIVE THIS LANE`
        : `${drive.headline.toUpperCase()} · ${
            drive.redrive
              ? "RE-DRIVE THIS LANE"
              : "DO NOT RE-DRIVE — a re-drive reproduces this exactly; the harness is what has to change"
          }${evidenceLost ? ` · and separately ${evidenceLost}` : ""}`
  } ` + `(exit ${exit}; the lesson's own verdict is above and is not what this code is about)`,
);
await browser.close();
// `process.exitCode`, NOT `process.exit()`. A forced exit can drop whatever is
// still buffered in stdout, and on this harness stdout IS the evidence — it was
// the only surviving record of sc-sig-controller-live's verdict. The browser is
// already closed, so nothing holds the loop open and the process ends on its
// own with this code, having written every line first.
process.exitCode = exit;
