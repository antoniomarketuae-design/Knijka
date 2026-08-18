// -----------------------------------------------------------------------------
// frames.mjs — A CAPTURED FRAME IS A FILE THAT DECODES, NOT A FILE THAT EXISTS.
//
// THE RUN THAT BOUGHT THIS FILE. `lesson-audit.mjs` used to take its frames with
//
//     page.screenshot({ path }).catch(() => {})
//
// and Playwright's own implementation (playwright-core 1.61.1,
// lib/coreBundle.js: `await this._platform.fs().promises.writeFile(options.path,
// result.binary)`) opens the file with 'w' BEFORE it writes the bytes. So a
// write that fails has already created the file — at zero bytes if it failed on
// the first chunk, at a chunk boundary if it failed part-way — and the empty
// catch threw the reason away. The harness then logged
//
//     [01-arrival] 0 км/ч  card=hint/peek
//
// as though the frame were on disk. `.audit-frames/sweep161/sc-rx-queue-clear/
// mobile-right/` is that pair: a run.log with a confident arrival beat, and a
// 01-arrival.png of 0 bytes beside it.
//
// MEASURED OVER THE WHOLE SWEEP (2026-08-18, all 166 scenario folders under
// .audit-frames/sweep161, size + first 8 bytes + last 8 bytes of every PNG):
//
//     16,605 PNGs written        16,266 decode
//        333 are 0 bytes         2.0 % of the corpus
//          6 are TRUNCATED       valid PNG signature, NO IEND — and every one
//                                of them lands on an exact power of two:
//                                5 × 524,288 B (512 KiB), 1 × 1,048,576 B (1 MiB)
//          0 have a bad signature
//         54 of 653 lanes hold not one usable frame; 26 of those are empty folders
//
// THE 6 TRUNCATED FILES ARE WHY THIS MODULE CHECKS STRUCTURE AND NOT SIZE. A
// `size > 0` test passes all six. `.audit-frames/sweep161/sc-sig-controller-live/
// mobile-right/02-briefing.png` is 524,288 bytes of real PNG and no image reader
// will open it — the audit's own reader answers «dimensions exceed the limit and
// image processing failed», which is a decoder failing on a stream that stops
// mid-IDAT. Half a megabyte of correct pixels that no one can see is the same
// evidentiary value as zero bytes, and a check that credits it is the false pass
// this repo bins fixes for.
//
// AND THE STUB IS DELETED, NOT LEFT. The audit's own finding on
// sc-pk-double-park says it plainly: *"the capture wrote empty files rather than
// failing, so a re-drive lane that only checks for file existence would score
// this leg as tested."* Absent evidence has to LOOK absent. Nothing is lost by
// deleting: the caller records the frame's name and the reason in its ledger and
// in `_audit-status.json`, which is a form the eye cannot mistake for a picture.
//
// COST. One open and two 8-byte reads per frame. Against a screenshot measured
// at 200 ms on the mobile leg and 12,000 ms on the pc leg, that is not a number
// worth optimising.
// -----------------------------------------------------------------------------
import { openSync, readSync, closeSync, statSync, unlinkSync } from "node:fs";

/** The 8 bytes every PNG starts with (PNG spec §5.2). */
export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** The last 8 bytes of every complete PNG: the IEND chunk type and its fixed CRC. */
export const PNG_IEND = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
/** Signature + an empty IEND chunk. Nothing shorter can be a whole PNG. */
const MIN_PNG_BYTES = PNG_SIGNATURE.length + 12;

/**
 * Is the file at `path` a complete PNG?
 *
 * Returns `{ ok, bytes, why }`. `why` is null on success and a sentence on
 * failure, because the caller prints it into a log a human reads eight weeks
 * later — "07-end.png is 0 bytes" is a finding, "capture failed" is not.
 *
 * This is deliberately NOT a decode. Decoding 16,605 frames costs minutes and
 * pulls in a dependency; the signature says "this is a PNG" and the IEND says
 * "the writer got to the end", which together are exactly the two failures the
 * sweep actually produced.
 */
export function inspectFrame(path) {
  let bytes = 0;
  try {
    const s = statSync(path);
    // A directory stats as 0 bytes on Windows, and "the file is 0 bytes" would
    // then be a true-sounding lie about a path that can never hold a frame.
    if (s.isDirectory()) return { ok: false, bytes: 0, why: "a DIRECTORY sits where the frame should be" };
    bytes = s.size;
  } catch {
    return { ok: false, bytes: 0, why: "no file was written at all" };
  }
  if (bytes === 0) return { ok: false, bytes, why: "the file is 0 bytes" };
  if (bytes < MIN_PNG_BYTES)
    return { ok: false, bytes, why: `only ${bytes} bytes — shorter than a signature plus an IEND chunk` };

  const head = Buffer.alloc(PNG_SIGNATURE.length);
  const tail = Buffer.alloc(PNG_IEND.length);
  let fd;
  try {
    fd = openSync(path, "r");
    readSync(fd, head, 0, head.length, 0);
    readSync(fd, tail, 0, tail.length, bytes - tail.length);
  } catch (error) {
    return { ok: false, bytes, why: `the file could not be read back: ${error?.message ?? error}` };
  } finally {
    if (fd !== undefined) try { closeSync(fd); } catch { /* already gone */ }
  }

  if (!head.equals(PNG_SIGNATURE))
    return { ok: false, bytes, why: `${bytes} bytes that do not start with the PNG signature` };
  if (!tail.equals(PNG_IEND))
    return {
      ok: false,
      bytes,
      // The power-of-two note is not decoration: it is how a reader tells a
      // partial WRITE (disk full, chunk boundary) from a partial CAPTURE.
      why:
        `${bytes} bytes ending without the PNG IEND marker — a truncated write` +
        ((bytes & (bytes - 1)) === 0 ? ` (and ${bytes} is an exact power of two)` : ""),
    };
  return { ok: true, bytes, why: null };
}

/** Did this error come from a full disk? The one failure that will not fix
 *  itself on a retry, so the caller has to be able to stop instead of spending
 *  the rest of the sweep writing empty files — which is what happened. */
export const isDiskFull = (error) =>
  error?.code === "ENOSPC" || /ENOSPC|no space left/i.test(String(error?.message ?? error));

/**
 * Take a screenshot AND PROVE IT LANDED.
 *
 * `page` is anything with `screenshot({ path })` — Playwright's Page, or a stub
 * in frames.test.mjs. `log` receives one line per failed attempt; it is not
 * optional in spirit, because the whole point is that a lost frame is audible.
 *
 * Returns `{ ok, bytes, why, attempts, diskFull }`.
 *
 * ONE RETRY, NOT NONE AND NOT TEN. sc-rx-unguarded/mobile-right shows the shape
 * this recovers: 04-t013s.png is 0 bytes and 04-t018s.png beside it is a whole
 * 1.2 MB frame — the same page, seconds apart. A transient write is worth a
 * second go. But a retry loop on a full disk is a way to spend an hour proving
 * the disk is still full, so ENOSPC returns immediately and says so.
 */
export async function captureFrame(page, path, { attempts = 2, log = () => {} } = {}) {
  let last = { ok: false, bytes: 0, why: "the capture never ran" };
  let diskFull = false;
  // What was actually SPENT, not the cap — an ENOSPC that breaks after one go
  // must not report two, or the cost breakdown lies about where the time went.
  let spent = 0;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    spent = attempt;
    let thrown = null;
    try {
      await page.screenshot({ path });
    } catch (error) {
      thrown = error;
      diskFull = diskFull || isDiskFull(error);
    }
    last = inspectFrame(path);
    if (last.ok) return { ...last, attempts: attempt, diskFull: false };

    // The thrown reason outranks the file's shape when there is one: "ENOSPC"
    // tells the sweep to stop, "the file is 0 bytes" only tells it something
    // went wrong.
    const why = thrown ? `${String(thrown.message ?? thrown).split("\n")[0]} (${last.why})` : last.why;
    last = { ...last, why };
    // Remove the stub BEFORE the retry as well as after the last attempt: a
    // second screenshot that also fails to write leaves the first attempt's
    // corpse behind otherwise, and `writeFile` would truncate it to 0 anyway.
    try { unlinkSync(path); } catch { /* nothing was written, which is the point */ }
    log(`frame ${path.split(/[\\/]/).pop()} was NOT captured (attempt ${attempt}/${attempts}): ${why}`);
    if (diskFull) break;
  }
  return { ...last, attempts: spent, diskFull };
}

/** After this many consecutive losses the camera is not working, it is just
 *  making files. Three, because the two lanes disagree about single losses and
 *  agree about runs of them: sc-rx-unguarded/mobile-right recovers (04-t013s.png
 *  is 0 bytes, 04-t018s.png beside it is a whole 1.2 MB frame) while
 *  sc-sig-controller-live/mobile-right never does — from 04-t023s to the end of
 *  the drive NOT ONE of its remaining 21 frames is whole. */
export const MAX_CONSECUTIVE_FRAME_LOSSES = 3;

/**
 * THE LEDGER — WHAT THE RUN ACTUALLY GOT, AS A NUMBER IT REPORTS ITSELF.
 *
 * The audit's finding on sc-pk-double-park is the reason this is a counter and
 * not a folder listing: *"the capture wrote 10 zero-byte PNG files … so a
 * re-drive lane that only checks for file existence would score this leg as
 * tested."* Coverage inferred from a directory is coverage guessed. The harness
 * knows exactly which frames it lost, so it is the harness that must say.
 *
 * AND THE CAMERA CAN BE SWITCHED OFF WITHOUT ENDING THE RUN. That asymmetry is
 * deliberate and it is the lesson from sc-sig-controller-live, whose verdict
 * survived ONLY in its run.log after 24 of its 29 frames died (20 empty, 4
 * truncated — counted on disk, the finding's "12 and 4" undercounts it): the
 * TEXT is often the last evidence standing. So a dead camera stops the pretence
 * of taking
 * pictures — and on the pc leg, where a frame was measured at 12 s, stops the
 * drive spending a fifth of its budget photographing nothing — while the drive
 * and the log carry on.
 *
 * `capture` is injectable so the caller can time it and so this policy can be
 * tested without a browser.
 */
export function createFrameLedger({
  capture = captureFrame,
  loud = () => {},
  maxConsecutiveLosses = MAX_CONSECUTIVE_FRAME_LOSSES,
} = {}) {
  const state = { written: 0, lost: 0, names: [], consecutive: 0, cameraStopped: null };
  return {
    state,
    /** Take `name`'s frame at `path`. Returns whether a real frame now exists. */
    async shoot(page, path, name) {
      if (state.cameraStopped) {
        // Still counted, still named. A frame nobody tried to take is just as
        // missing as one that failed, and the ledger must not flatter itself.
        state.lost += 1;
        state.names.push(`${name} (not attempted — ${state.cameraStopped})`);
        return false;
      }
      const r = await capture(page, path, { log: loud });
      if (r.ok) {
        state.written += 1;
        state.consecutive = 0;
        return true;
      }
      state.lost += 1;
      state.consecutive += 1;
      state.names.push(`${name} (${r.why})`);
      if (r.diskFull) {
        state.cameraStopped = "the disk is full (ENOSPC)";
        loud(
          `THE DISK IS FULL — no frame after this one exists. The drive continues so the LOG survives, ` +
            `but every "not attempted" below is a lost frame and this lane needs a re-drive.`,
        );
      } else if (state.consecutive >= maxConsecutiveLosses) {
        state.cameraStopped = `${state.consecutive} captures in a row failed`;
        loud(
          `${state.consecutive} FRAMES IN A ROW WERE LOST — switching the camera off rather than filling ` +
            `this folder with files that are not evidence. The log continues; this lane needs a re-drive.`,
        );
      }
      return false;
    },
  };
}
