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
 *    fixes had never been deployed.
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
 * NOTHING HERE IS TUNED TO A LESSON. Every handle above is written by
 * LessonScene / SimOverlay / LessonPlayShell / SessionEndScreen for all 161
 * scenarios; there is not one scenario id, objective id or Bulgarian lesson
 * string anywhere in this file.
 *
 * Usage:
 *   node tools/mobile/lesson-audit.mjs <outDir> <scenarioId> <mobile|pc> <right|wrong>
 *
 * EXIT CODE IS ABOUT EVIDENCE, NOT ABOUT THE LESSON. 0 = this run can be
 * judged. Non-zero = it cannot, and re-driving it is the only honest response:
 *   0 judgeable · 1 frames/log lost · 2 never dispatched (bad usage)
 *   3 sign-in refused · 4 the harness crashed (`why` is in the status file)
 * A lesson that fails its own drive still exits 0: that is a finding, not a
 * broken run, and conflating the two is how a re-drive lane wastes a day.
 */
import { mkdirSync, statSync, writeFileSync } from "node:fs";

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

const [OUT, SCENARIO, PLATFORM = "mobile", MODE = "right"] = process.argv.slice(2);
export const BASE =
  process.env.KNIJKA_BASE ?? "https://icon-undertaken-earliest-zope.trycloudflare.com";

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
    const root = document.querySelector("[data-sim-shell]") ?? document.body;
    const seen = new Set(), strings = [];
    for (const el of root.querySelectorAll(
      "[data-hud],[role=alertdialog],[role=dialog],[role=status],h1,h2,h3,li,button,p",
    )) {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const t = norm(el.textContent);
      if (!t || t.length < 2 || seen.has(t)) continue;
      seen.add(t);
      strings.push(t.slice(0, 200));
      if (strings.length >= 26) break;
    }
    return {
      kmh: sp ? Number((sp.getAttribute("aria-label").match(/Скорост (\d+)/) || [0, -1])[1]) : -1,
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
      // The ONE innerText of the pass, and the play shell rather than the whole
      // document — the debrief lives inside the shell, the nav rail never did.
      body: norm(root.innerText).slice(0, 3000),
    };
  }).catch(() => ({ kmh: -1, overlay: "?", state: "?", end: false, strings: [], body: "" }));

const beat = async (label, { withShot = true } = {}) => {
  const s = await timed("read", read);
  note(`  [${label}] ${s.kmh} км/ч  card=${s.overlay}/${s.state}${s.end ? "  END-SURFACE" : ""}`);
  s.strings.forEach((t) => note(`      · ${t}`));
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
  await page.keyboard[on ? "down" : "up"]("KeyS").catch(() => {});
  holdS = on;
};

// POSITIVE CONTROL — the car must leave zero, or nothing after this is evidence.
await throttle(true);
await page.waitForTimeout(5000);
const moved = (await read()).kmh;
note(`  POSITIVE CONTROL: ${moved} км/ч after 5 s of throttle`);
if (moved <= 0) {
  loud(`CAR DID NOT MOVE — every frame after this is a frozen world, not a drive.`);
  await beat("03b-frozen");
}

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
      ({ waitSrc, pauseSel }) => {
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
        };
      },
      { waitSrc: LAWFUL_WAIT_RE.source, pauseSel: PAUSE_SEL },
    )
    .catch(() => ({ kmh: -1, overlay: "?", pause: null, end: false, lawfulWait: null }));

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

let ended = false;
let topSpeed = 0;
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
let prevKmh = -1;
let lostKeys = 0;
let lastTickAt = Date.now();
let restLogged = false;
let drivingTicks = 0;
const tickMs = [];
let shotStopped = false, shotWaited = false;

if (MODE !== "right") await throttle(true);

saveStatus({ phase: "driving" });
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
  if (MODE === "right") {
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
      await timed("pedals", async () => {
        await brake(p.kmh > CRUISE_KMH + BRAKE_CAP_OVER_KMH, p.kmh);
        await throttle(p.kmh >= 0 && p.kmh < CRUISE_KMH - 3);
      });
      drivingTicks++;
      phaseTicks++;
      rollM += (Math.max(0, p.kmh) / 3.6) * ((now - lastTickAt) / 1000);
      if ((rollM >= ROLL_DISTANCE_M || now - phaseAt >= ROLL_MS) && phaseTicks >= 1) {
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
        // «Неиздържан» contains «издържан», so the exact-match form is the only
        // one that cannot answer the wrong question.
        if (/^(не)?издържан$/i.test(s)) { verdict = s.toUpperCase(); break; }
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
    };
  })
  .catch((e) => ({ error: String(e?.message || e) }));

const hasVerdict = reached && facts.verdict !== null;
note(`  DEBRIEF REACHED: ${hasVerdict ? "yes" : "NO — this run cannot answer whether credit was given"}`);
if (!hasVerdict) {
  loud(
    reached
      ? "the result screen mounted but carries NO verdict pill — read the census above before believing any number here."
      : "the ladder never reached the result screen — every 'credited' claim from this run is worthless.",
  );
}
note(`  ended naturally: ${endedNaturally}${endedNaturally ? "" : `  (forced via «${forcedBy ?? "nothing"}» — itself a finding)`}`);

note(`\n--- MACHINE SUMMARY (${SCENARIO}/${PLATFORM}/${MODE}) ---`);
// THE FRAME LEDGER GOES IN THE SUMMARY, not only in the loud lines above, and
// it goes in FIRST. Every judgement below this point was made from pixels, so a
// reader has to know how many of those pixels exist before reading a word of it
// — the sweep it replaces produced folders whose 08-debrief.png was 0 bytes and
// whose summary read exactly like a lesson that had been photographed.
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
note(`drive: top ${topSpeed} км/ч · ${stopsMade} full stops · ${waitsHonoured} lawful waits (${waitSeconds}s) · ${teachDrained} pause layers · final ${debrief.kmh} км/ч`);
note(`briefing chars: ${briefing.length}`);
if (facts.error) loud(`the debrief reader threw: ${facts.error}`);
note(`VERDICT: ${facts.verdict ?? "(none)"} · SCORE: ${facts.score ?? "(none)"} наказателни точки · ${facts.stars ?? "no rubric stars"}`);
note(`OBJECTIVES (${facts.objectives?.length ?? 0}):`);
for (const o of facts.objectives ?? []) note(`   ${o.done ? "✓" : "–"} ${o.titleBg}`);
if (!(facts.objectives ?? []).length) note("   (the debrief listed no objectives at all)");
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
const exit = frames.lost || stdoutBroken ? EXIT_EVIDENCE_INCOMPLETE : EXIT_JUDGEABLE;
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
  score: facts.score ?? null,
  reachedVerdictCard: reached,
  exit,
});
note(
  `EVIDENCE: ${exit === 0 ? "complete — this lane can be judged" : "INCOMPLETE — re-drive this lane"} ` +
    `(exit ${exit}; the lesson's own verdict is above and is not what this code is about)`,
);
await browser.close();
// `process.exitCode`, NOT `process.exit()`. A forced exit can drop whatever is
// still buffered in stdout, and on this harness stdout IS the evidence — it was
// the only surviving record of sc-sig-controller-live's verdict. The browser is
// already closed, so nothing holds the loop open and the process ends on its
// own with this code, having written every line first.
process.exitCode = exit;
