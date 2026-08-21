// -----------------------------------------------------------------------------
// frames-overlay.test.mjs — A FRAME THAT PHOTOGRAPHS SOMETHING THAT IS NOT THE
// PRODUCT IS NOT A FRAME OF THE PRODUCT.
//
//   node --test tools/mobile/lib/__tests__/frames-overlay.test.mjs
//   (or `node scripts/tools-tests.mjs` from platform/, which discovers it)
//
// THE DEFECT. Wave C re-drove 145 lessons, and a verifier measured Next's
// dev-tools badge — a red pill reading «1 Issue» — sitting in the BOTTOM-LEFT
// CORNER of every mobile frame in the sweep. Measured on the live rig
// 2026-08-21 (WebKit, iphone16-landscape, 852×393 CSS px), read as the badge's
// own bounding box out of the `<nextjs-portal>` shadow root:
//
//   [data-next-badge-root]  x=20 y=337 119×36    «1 Issue»
//
// It had already manufactured a verdict — a finding refuted on a reading of a
// corner the frame does not show, and the refutation later overturned by
// re-measuring at the unoccluded right edge.
//
// WHAT THESE TESTS PIN, and each is a direction the fix could fail in:
//
//   A SURVIVING OVERLAY MUST FAIL THE FRAME. The PNG is whole — signature,
//   IEND, a megabyte of real pixels — so every check this module had before
//   today passes it. It is still not evidence.
//
//   THE POST-SHUTTER CENSUS OUTRANKS THE PRE-STRIP ONE. Stripping the overlay
//   and believing your own removal is exactly the "unasserted removal" shape
//   this audit keeps binning fixes for. If the portal comes back while the
//   compositor is handing over the frame, the strip's own answer is a lie and
//   only the second question catches it.
//
//   A CLEAN FRAME MUST STILL PASS, SILENTLY, IN ONE ATTEMPT. A guard that
//   answers "contaminated" to everything destroys the evidence the harness
//   exists to gather, and would be caught by nobody, because a lost frame is a
//   thing this sweep has learned to expect.
//
//   AN UNANSWERABLE PAGE IS NOT A CLEAN PAGE. Every instrument bug found in
//   this programme failed in the REASSURING direction. A swallowed exception
//   in the checker would be the next one, so `evaluate` throwing counts as
//   not-clean — while a test stub that has no `evaluate` at all is recorded as
//   UNASKED, which is a different word on purpose.
// -----------------------------------------------------------------------------
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";

import {
  DEV_OVERLAY_HOSTS,
  DEV_OVERLAY_MARKS,
  assertNoDevOverlay,
  captureFrame,
} from "../frames.mjs";

// ── fixtures ───────────────────────────────────────────────────────────────
// A REAL PNG, generated rather than committed (626 MB of frames have been
// committed by accident three times in this repo). Same construction as
// frames.test.mjs: this file must exercise a whole, decodable frame, because
// the entire point is that the overlay check fires on a PNG that is otherwise
// perfect.
const crcTable = (() => {
  const t = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, body) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length, 0);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc(Buffer.concat([Buffer.from(type, "latin1"), body])), 0);
  return Buffer.concat([len, Buffer.from(type, "latin1"), body, tail]);
};
function wholePng(w = 4, h = 4) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.concat(
    Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x40)])),
  );
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** The badge as the live rig actually measured it, so the test fails with the
 *  sentence a human would have to act on rather than a boolean. */
const THE_PILL = [{ sel: "[data-next-badge-root]", x: 20, y: 337, w: 119, h: 36, text: "1 Issue" }];

/**
 * A page that writes a whole PNG and answers the overlay census however the
 * script says. `script` is consumed one answer per call, so a test can say
 * "clean when stripped, contaminated when asked again" — which is the race the
 * bracket exists for and cannot be expressed with a single fixed answer.
 */
function fakePage(path, script) {
  const answers = [...script];
  const asked = [];
  return {
    asked,
    async screenshot({ path: p }) {
      writeFileSync(p ?? path, wholePng());
    },
    async evaluate(_fn, arg) {
      asked.push(arg.remove);
      const next = answers.shift() ?? { removed: [], visible: [], vw: 852, vh: 393 };
      if (next instanceof Error) throw next;
      return { removed: [], vw: 852, vh: 393, ...next };
    },
  };
}

const clean = { visible: [] };
const contaminated = { visible: THE_PILL };

function scratch() {
  return mkdtempSync(join(tmpdir(), "knijka-overlay-"));
}

// ── the census itself ──────────────────────────────────────────────────────

test("THE CENSUS LOOKS FOR THE HANDLES THE RIG ACTUALLY MEASURED", () => {
  // Not decoration: these four strings are the ones the live probe returned on
  // 2026-08-21, and a fix that quietly stopped looking for them would leave the
  // pill in the corpus while every test stayed green.
  for (const mark of ["[data-next-badge-root]", "[data-issues]", "#next-logo", "[data-nextjs-dev-tools-button]"]) {
    assert.ok(DEV_OVERLAY_MARKS.includes(mark), `${mark} must be in the census`);
  }
  assert.ok(DEV_OVERLAY_HOSTS.includes("nextjs-portal"), "the Next 16 host element must be stripped");
});

test("A VISIBLE BADGE IS REPORTED, WITH ITS SIZE AND ITS CORNER", async () => {
  const r = await assertNoDevOverlay(fakePage(null, [contaminated]));
  assert.equal(r.checked, true);
  assert.equal(r.ok, false);
  assert.match(r.why, /dev-tools overlay is IN THIS FRAME/);
  assert.match(r.why, /119×36 at 20,337/);
  assert.match(r.why, /1 Issue/);
});

test("A CLEAN PAGE IS ALLOWED TO SAY SO", async () => {
  const r = await assertNoDevOverlay(fakePage(null, [clean]));
  assert.deepEqual({ checked: r.checked, ok: r.ok, why: r.why }, { checked: true, ok: true, why: null });
});

test("AN `evaluate` THAT THROWS IS NOT-CLEAN, NEVER CLEAN", async () => {
  // The reassuring direction, closed. A checker that swallows its own failure
  // and returns ok is indistinguishable from a checker that works.
  const r = await assertNoDevOverlay(fakePage(null, [new Error("Execution context was destroyed")]));
  assert.equal(r.checked, false);
  assert.equal(r.ok, false, "a check that could not run must not report a clean frame");
  assert.match(r.why, /could not run/);
});

test("A PAGE WITH NO `evaluate` IS UNASKED, AND SAYS THAT WORD", async () => {
  const r = await assertNoDevOverlay({ async screenshot() {} });
  assert.equal(r.checked, false);
  assert.equal(r.ok, true, "a stub with no DOM is not a contaminated page");
  assert.match(r.why, /cannot be asked/);
});

// ── what captureFrame does with the answer ─────────────────────────────────

test("A WHOLE PNG WITH THE PILL IN IT IS A LOST FRAME, NOT A CAPTURED ONE", async () => {
  const dir = scratch();
  const path = join(dir, "03-ready.png");
  const said = [];
  try {
    // Contaminated both times it is asked, on both attempts.
    const page = fakePage(path, [contaminated, contaminated, contaminated, contaminated]);
    const r = await captureFrame(page, path, { log: (m) => said.push(m) });

    assert.equal(r.ok, false, "the frame decodes perfectly and is still not evidence");
    assert.ok(r.bytes > 0, "and the loss is NOT a zero-byte write — that is the whole novelty");
    assert.match(r.why, /dev-tools overlay is IN THIS FRAME/);
    assert.equal(existsSync(path), false, "absent evidence must LOOK absent — the stub is deleted");
    assert.equal(said.length, 2, "both attempts are audible");
    assert.match(said[0], /was NOT captured/);
    assert.match(said[0], /1 Issue/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("THE POST-SHUTTER CENSUS OUTRANKS THE STRIP'S OWN OPINION", async () => {
  // THE RACE THE BRACKET EXISTS FOR. The strip runs, the page says "clean" —
  // and React re-inserts the portal while the compositor is handing over the
  // frame. Believing the first answer is exactly the unasserted removal this
  // guard was written to stop being.
  const dir = scratch();
  const path = join(dir, "04-t013s.png");
  const said = [];
  try {
    const page = fakePage(path, [clean, contaminated, clean, contaminated]);
    const r = await captureFrame(page, path, { log: (m) => said.push(m) });

    assert.equal(r.ok, false, "the strip said clean; the frame was not");
    assert.match(r.why, /1 Issue/);
    assert.deepEqual(page.asked, [true, false, true, false], "strip, then ASK — twice, once per attempt");
    assert.equal(existsSync(path), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("A STRIP THAT WORKS RECOVERS THE FRAME ON THE RETRY", async () => {
  const dir = scratch();
  const path = join(dir, "07-end.png");
  const said = [];
  try {
    // Attempt 1 is contaminated; attempt 2 is clean. A transient overlay must
    // cost one retry, not the lane.
    const page = fakePage(path, [clean, contaminated, clean, clean]);
    const r = await captureFrame(page, path, { log: (m) => said.push(m) });

    assert.equal(r.ok, true);
    assert.equal(r.attempts, 2);
    assert.equal(existsSync(path), true, "the recovered frame is KEPT");
    assert.equal(said.length, 1, "and only the failed attempt was loud");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("A CLEAN CAPTURE IS SILENT, SINGLE-ATTEMPT, AND STILL STRIPS FIRST", async () => {
  const dir = scratch();
  const path = join(dir, "01-arrival.png");
  const said = [];
  try {
    const page = fakePage(path, [clean, clean]);
    const r = await captureFrame(page, path, { log: (m) => said.push(m) });

    assert.equal(r.ok, true);
    assert.equal(r.attempts, 1);
    assert.equal(said.length, 0, "a working camera says nothing");
    assert.equal(r.overlay.checked, true);
    assert.deepEqual(page.asked, [true, false], "it removed, then it asked — it did not merely ask");
    assert.equal(existsSync(path), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("THE GUARD CAN BE SWITCHED OFF, AND THEN IT CLAIMS NOTHING", async () => {
  // `overlayGuard: false` exists for the callers that photograph something
  // other than the product (a crop rig, a fixture). It must not come back
  // saying the frame was checked and clean — that would be the reassuring lie
  // wearing the fix's own clothes.
  const dir = scratch();
  const path = join(dir, "08-debrief.png");
  try {
    const page = fakePage(path, [contaminated]);
    const r = await captureFrame(page, path, { overlayGuard: false, log: () => {} });

    assert.equal(r.ok, true);
    assert.equal(r.overlay.checked, false, "an unchecked frame must never report itself checked");
    assert.deepEqual(page.asked, [], "the page was not asked at all");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
