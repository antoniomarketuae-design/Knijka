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

// ── AND A FRAME MUST CONTAIN THE PRODUCT AND NOTHING ELSE ──────────────────
//
// THE RUN THAT BOUGHT THIS HALF. Wave C re-drove 145 lessons and a verifier
// measured Next's dev-tools badge — a red pill reading «1 Issue» — sitting in
// the BOTTOM-LEFT CORNER of every mobile frame it took. Measured on the live
// harness rig 2026-08-21 (WebKit, iphone16-landscape, 852×393 CSS px), read out
// of the `<nextjs-portal>` shadow root as the badge's own bounding box:
//
//   [data-next-badge-root]  x=20 y=337 119×36     the corner, 14 % of the width
//   #next-logo              x=22 y=339  32×32
//   [data-issues]           x=56 y=339  81×32     text: «1 Issue»
//
// It is not part of the product, and it had already MANUFACTURED A VERDICT: a
// finding was REFUTED on a reading of a corner the frame does not actually
// show, and that refutation was itself overturned when someone re-measured at
// the unoccluded right edge. Both directions are live — the pill can invent a
// defect (a panel that looks clipped because a pill covers its corner) and it
// can bury one (a genuinely clipped corner hidden behind the pill).
//
// WHY THE CONFIG FLAG IS NOT THE FIX, MEASURED RATHER THAN ASSUMED.
// `platform/next.config.ts` now sets `devIndicators: false`, and the Next 16
// docs are explicit that this is not the whole story — «Next.js will still
// surface any compile or runtime errors that were encountered». Re-measured on
// the same rig with the flag ON:
//
//   #next-logo                    GONE
//   [data-nextjs-dev-tools-button] GONE
//   [data-next-badge-root]        x=20 y=337 101×36   STILL THERE
//   [data-issues]                 x=20 y=339  99×32   STILL «1 Issue»
//
// The pixels agree: the frame swaps the Next logo for a „disabled" octagon and
// keeps the pill. The compiled overlay says why — in
// node_modules/next/dist/compiled/next-devtools/index.js the logo is gated
// `!m.disableDevIndicator && …` while the pill is gated
// `(E || m.disableDevIndicator) && …`, i.e. disabling the indicator is on the
// PERMISSIVE side of that `||`. A fix that stopped at the config file would
// have read correctly and changed nothing that matters.
//
// SO THE GUARANTEE IS TAKEN AT THE CAMERA, WHICH IS THE ONLY PLACE IT CANNOT BE
// OUTRUN. Removing the overlay „after load" races every later re-render; doing
// it in the same breath as the shutter does not. `captureFrame` therefore
// strips the overlay, ASKS THE PAGE WHETHER IT IS GONE, takes the frame, and
// ASKS AGAIN — the second question is not ceremony, it is the only one that
// covers React re-inserting the portal between the removal and the shutter.
//
// A SURVIVING OVERLAY FAILS THE FRAME, exactly like a truncated PNG. This
// module's whole doctrine is that a file which is not evidence must not be
// counted as evidence, and a photograph of the product plus something that is
// not the product is not a photograph of the product. It gets a named reason,
// the stub is deleted, the ledger counts it lost and stops the camera after
// three in a row — all machinery that already exists, doing what it already
// does. If a future Next renames these handles, lane one dies loudly at frame
// three instead of 161 lanes quietly photographing a pill.

/** The light-DOM elements Next hangs its dev UI on. `nextjs-portal` is the
 *  Next 16 host (its contents live in a shadow root); the rest are older shapes
 *  kept because an upgrade must not silently re-open this hole. */
export const DEV_OVERLAY_HOSTS = [
  "nextjs-portal",
  "[data-nextjs-toast]",
  "[data-nextjs-dialog-overlay]",
  "#__next-build-watcher",
];

/** The handles the badge itself carries, looked for in the light DOM AND in
 *  every open shadow root. These are what the measurement above read, so this
 *  list is the census — not a guess at what the host element is called. */
export const DEV_OVERLAY_MARKS = [
  "[data-next-badge-root]",
  "[data-next-badge]",
  "[data-issues]",
  "[data-issues-open]",
  "#next-logo",
  "[data-nextjs-dev-tools-button]",
  "[data-nextjs-toast]",
  "[data-nextjs-dialog]",
];

/** The id of the stylesheet the guard installs. Second mechanism, not a
 *  substitute: removal answers „it is not in the DOM", this answers „and if
 *  something puts it back between now and the shutter, it is not painted". */
const HIDE_STYLE_ID = "__knijka-no-dev-overlay";

/**
 * The page-side agent, written as a function so Playwright can serialise it.
 * Runs in the page; returns what it removed and what it can still SEE.
 *
 * „Can still see" is the test, not „is still in the document", because the
 * question this whole module answers is what ended up in the photograph. An
 * element parked at `display:none` is not in the photograph; one with a rect
 * that overlaps the viewport is, whatever the DOM thinks of it.
 */
function devOverlayAgent({ hosts, marks, styleId, remove }) {
  // READ THE WARNING BEFORE SILENCING IT. `<nextjs-portal>` is not only the
  // ambient badge's host — it is also where `next dev` mounts the RUNTIME ERROR
  // DIALOG. Removing the host by selector alone makes those two cases produce
  // the identical record (`removed: ["nextjs-portal"]`), so a full-screen „the
  // product crashed" overlay would be deleted from the evidence with the same
  // silence as a 1-issue pill. That is the reassuring-direction failure this
  // whole programme keeps binning fixes for, so the subtree is SUMMARISED first
  // and the summary travels out with the result.
  const summarise = (host) => {
    const roots = [host];
    for (let i = 0; i < roots.length; i += 1) {
      if (roots[i].shadowRoot) roots.push(roots[i].shadowRoot);
      const scope = roots[i].querySelectorAll ? roots[i].querySelectorAll("*") : [];
      for (const el of scope) if (el.shadowRoot) roots.push(el.shadowRoot);
    }
    let issues = null;
    let dialog = null;
    for (const root of roots) {
      if (!root.querySelector) continue;
      if (issues === null) {
        const i = root.querySelector("[data-issues]");
        if (i) issues = (i.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
      }
      if (dialog === null) {
        const d = root.querySelector("[data-nextjs-dialog], [data-nextjs-dialog-overlay], [data-nextjs-error-overlay]");
        if (d) dialog = (d.textContent || "").trim().replace(/\s+/g, " ").slice(0, 200);
      }
    }
    return { issues, dialog };
  };

  const removed = [];
  const suppressed = [];
  if (remove) {
    const style = document.getElementById(styleId) || document.createElement("style");
    style.id = styleId;
    style.textContent = `${hosts.join(",")}{display:none!important}`;
    if (!style.isConnected) (document.head || document.documentElement).appendChild(style);
    for (const sel of hosts) {
      for (const el of document.querySelectorAll(sel)) {
        removed.push(sel);
        suppressed.push({ sel, ...summarise(el) });
        el.remove();
      }
    }
  }

  // Every root that can paint: the document, plus any open shadow root beneath
  // it. The badge lives in one, so a census that only walks the light DOM would
  // report a clean page while the pill is on screen — the exact reassuring-
  // direction failure this guard exists to end.
  const roots = [document];
  for (let i = 0; i < roots.length; i += 1) {
    const scope = roots[i].querySelectorAll ? roots[i].querySelectorAll("*") : [];
    for (const el of scope) if (el.shadowRoot) roots.push(el.shadowRoot);
  }

  const visible = [];
  for (const root of roots) {
    for (const sel of marks) {
      for (const el of root.querySelectorAll(sel)) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        if (r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) continue;
        visible.push({
          sel,
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
          text: (el.textContent || "").trim().slice(0, 40),
        });
      }
    }
  }
  return { removed, suppressed, visible, vw: innerWidth, vh: innerHeight };
}

/** One line a human can act on: what was seen, where, and how big. */
function describeOverlay(visible) {
  return visible
    .map((v) => `${v.sel} ${v.w}×${v.h} at ${v.x},${v.y}${v.text ? ` «${v.text}»` : ""}`)
    .join("; ");
}

/**
 * The subset of what was stripped that a HUMAN needs to be told about.
 *
 * The ambient badge is noise — it is on every phone frame of every drive, and
 * announcing it 52 times per lane would train everyone to skim past the line.
 * A RUNTIME ERROR DIALOG is not noise: it means `next dev` was painting „the
 * product crashed" over the screen, and the guard has just deleted that from
 * the photograph. Only the second gets a voice.
 */
export function describeSuppressedError(suppressed = []) {
  const loud = suppressed.filter((s) => s && s.dialog);
  if (!loud.length) return null;
  return (
    `A NEXT RUNTIME-ERROR OVERLAY WAS STRIPPED FROM THIS FRAME — the frame below is the product ` +
    `WITHOUT the crash dialog that „next dev" was painting over it: ` +
    loud.map((s) => `${s.sel} «${s.dialog}»`).join("; ")
  );
}

/**
 * Strip Next's dev-tools overlay and report whether it is gone.
 *
 * `remove: false` makes it a pure census — that is the post-shutter question,
 * where removing anything would be measuring our own hand.
 *
 * Returns `{ checked, ok, removed, visible, why }`.
 *
 * THE `checked: false` CASE IS NOT A PASS. `page` here is documented as
 * „anything with screenshot({ path })" and frames.test.mjs passes stubs that
 * have no `evaluate`; those genuinely cannot be asked, so they are recorded as
 * UNASKED rather than clean. But a real page whose `evaluate` THROWS is a
 * different animal — we wanted an answer and could not get one — and that
 * counts as not-clean, because every instrument bug in this audit has failed in
 * the reassuring direction and a swallowed exception is how the next one would.
 */
export async function assertNoDevOverlay(page, { remove = true } = {}) {
  if (typeof page?.evaluate !== "function") {
    return { checked: false, ok: true, removed: [], suppressed: [], visible: [], why: "the page cannot be asked (no evaluate)" };
  }
  let seen;
  try {
    seen = await page.evaluate(devOverlayAgent, {
      hosts: DEV_OVERLAY_HOSTS,
      marks: DEV_OVERLAY_MARKS,
      styleId: HIDE_STYLE_ID,
      remove,
    });
  } catch (error) {
    const why = String(error?.message ?? error).split("\n")[0];
    return { checked: false, ok: false, removed: [], suppressed: [], visible: [], why: `the overlay check could not run: ${why}` };
  }
  const ok = seen.visible.length === 0;
  return {
    checked: true,
    ok,
    removed: seen.removed,
    // `?? []` because `page` is documented as a duck type and frames.test.mjs's
    // stubs answer with older shapes; an absent summary must read as "nothing
    // to report", never as `undefined` a caller then dereferences.
    suppressed: seen.suppressed ?? [],
    visible: seen.visible,
    why: ok ? null : `Next's dev-tools overlay is IN THIS FRAME — ${describeOverlay(seen.visible)}`,
  };
}

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
export async function captureFrame(page, path, { attempts = 2, log = () => {}, overlayGuard = true } = {}) {
  let last = { ok: false, bytes: 0, why: "the capture never ran" };
  let diskFull = false;
  let overlay = { checked: false, ok: true, removed: [], suppressed: [], visible: [], why: "the guard was switched off" };
  // What was actually SPENT, not the cap — an ENOSPC that breaks after one go
  // must not report two, or the cost breakdown lies about where the time went.
  let spent = 0;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    spent = attempt;
    let thrown = null;
    // BRACKETED AROUND THE SHUTTER, and both halves are load-bearing. The strip
    // clears what is there now; the census after the screenshot is what catches
    // React putting the portal back in the milliseconds while the compositor
    // was handing over a frame. Only the second answer describes the file that
    // is now on disk, so it is the one that decides.
    if (overlayGuard) overlay = await assertNoDevOverlay(page, { remove: true });
    // AND SAY SO IF WHAT WAS STRIPPED WAS A CRASH. The frame is still kept —
    // demoting it would lose the only picture of a screen that had just gone
    // wrong — but nobody may read that frame believing the product was healthy
    // when it was taken. The ambient badge stays silent on purpose; see
    // describeSuppressedError.
    const crash = describeSuppressedError(overlay.suppressed);
    if (crash) log(`frame ${path.split(/[\\/]/).pop()}: ${crash}`);
    try {
      await page.screenshot({ path });
    } catch (error) {
      thrown = error;
      diskFull = diskFull || isDiskFull(error);
    }
    if (overlayGuard && overlay.checked) {
      const after = await assertNoDevOverlay(page, { remove: false });
      if (!after.ok) overlay = { ...after, removed: overlay.removed, suppressed: overlay.suppressed };
    }
    last = inspectFrame(path);
    // A WHOLE PNG OF THE WRONG THING IS STILL THE WRONG THING. The frame
    // decoded, so `inspectFrame` is happy — and it is not evidence, because a
    // judge cropping its bottom-left corner would be reading Next's dev tools
    // and attributing them to the product. Demoted to a loss here so it takes
    // the path every other non-frame takes: named, deleted, counted, and after
    // three in a row the camera stops.
    if (last.ok && !overlay.ok) last = { ok: false, bytes: last.bytes, why: overlay.why };
    if (last.ok) return { ...last, attempts: attempt, diskFull: false, overlay };

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
  return { ...last, attempts: spent, diskFull, overlay };
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
