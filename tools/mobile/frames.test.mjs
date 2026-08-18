// -----------------------------------------------------------------------------
// frames.test.mjs — THE TESTS THAT WOULD HAVE STOPPED THE SWEEP LOSING 333 FRAMES.
//
//   node --test tools/mobile/frames.test.mjs
//   (or `node scripts/tools-tests.mjs` from platform/, which discovers it)
//
// THE DEFECT. `lesson-audit.mjs` took every frame with
// `page.screenshot({ path }).catch(() => {})`. Playwright writes the file with
// `fs.promises.writeFile`, which CREATES the file before it writes the bytes, so
// a failed write leaves a stub on disk — and the empty catch threw the reason
// away. The harness then printed a confident `[01-arrival] 0 км/ч card=hint/peek`
// beat beside a 0-byte PNG. Across `.audit-frames/sweep161`, measured file by
// file: 16,605 PNGs, 333 of them 0 bytes, 6 of them truncated with a valid
// signature and no IEND, and 54 of 653 lanes holding not one usable frame. The
// logs were green the whole time. Whole lessons — sc-park-judge, sc-rx-queue-
// clear, sc-crossing-bus-shadow — were filed COULD_NOT_TEST because of it.
//
// THE TWO DIRECTIONS, BOTH LOCKED HERE, because a fix in one direction only is
// how this project has binned fixes before:
//
//   LOST FRAMES MUST FAIL — a 0-byte write, a truncated write and a throw all
//   have to come back `ok: false`, delete their stub and say so out loud. Every
//   one of these tests passes trivially against the old `.catch(() => {})`
//   only if you delete the assertion; against the old code they FAIL, because
//   the old code returned undefined and left the corpse on disk.
//
//   GOOD FRAMES MUST PASS UNTOUCHED — a complete PNG comes back `ok: true`,
//   stays on disk byte for byte, costs exactly one attempt and prints NOTHING.
//   A guard that answers "did we lose a frame?" with "yes" is as useless as one
//   that always answers "no", and deleting a frame that was fine would destroy
//   the evidence this harness exists to gather.
//
// AND THE TRUNCATION CASE IS THE POINT OF THE WHOLE MODULE. `size > 0` credits
// all six real truncated files. The 524,288-byte fixture below is the shape of
// `.audit-frames/sweep161/sc-sig-controller-live/mobile-right/02-briefing.png`,
// which is half a megabyte of genuine PNG that no image reader will open.
// -----------------------------------------------------------------------------
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";

import {
  MAX_CONSECUTIVE_FRAME_LOSSES,
  PNG_IEND,
  PNG_SIGNATURE,
  captureFrame,
  createFrameLedger,
  inspectFrame,
  isDiskFull,
} from "./lib/frames.mjs";

// ── fixtures ───────────────────────────────────────────────────────────────
// A REAL PNG, built here rather than committed. Frames belong in a scratch
// directory (626 MB of them have been committed by accident three times), and a
// generated one is a few hundred bytes of code instead of a file.
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
/** A w×h RGB PNG — a whole one, IEND and all. */
function encodePng(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * (1 + width * 3) + 1 + x * 3;
      raw[i] = (x * 7) & 0xff;
      raw[i + 1] = (y * 11) & 0xff;
      raw[i + 2] = 0x80;
    }
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const GOOD_PNG = encodePng(24, 16);

/** The six real casualties: a genuine PNG head, cut at a power of two, no IEND. */
const TRUNCATED_512K = (() => {
  const big = encodePng(512, 512);
  const cut = Buffer.alloc(524_288);
  big.copy(cut, 0, 0, Math.min(big.length, cut.length));
  return cut;
})();

const scratch = mkdtempSync(join(tmpdir(), "knijka-frames-"));
const at = (name) => join(scratch, name);
process.on("exit", () => rmSync(scratch, { recursive: true, force: true }));

/** A stand-in for Playwright's Page: `write` decides what its screenshot leaves
 *  on disk, `throws` decides what it raises. Both, to model the real failure —
 *  Playwright creates the file and THEN fails to fill it. */
const fakePage = (steps) => {
  const queue = [...steps];
  const calls = [];
  return {
    calls,
    async screenshot({ path }) {
      const step = queue.length > 1 ? queue.shift() : queue[0];
      calls.push(path);
      if (step.write !== undefined) writeFileSync(path, step.write);
      if (step.throws) throw step.throws;
    },
  };
};

// ── inspectFrame: what counts as a captured frame ──────────────────────────

test("a whole PNG is a captured frame", () => {
  writeFileSync(at("good.png"), GOOD_PNG);
  const v = inspectFrame(at("good.png"));
  assert.equal(v.ok, true, v.why ?? "");
  assert.equal(v.bytes, GOOD_PNG.length);
  assert.equal(v.why, null, "a frame that is fine must carry no complaint");
});

test("A 0-BYTE FILE IS NOT A FRAME — the 333 the sweep wrote and logged as captured", () => {
  writeFileSync(at("empty.png"), Buffer.alloc(0));
  const v = inspectFrame(at("empty.png"));
  assert.equal(v.ok, false);
  assert.equal(v.bytes, 0);
  assert.match(v.why, /0 bytes/, "the reason has to be printable into a run log");
});

test("A TRUNCATED PNG IS NOT A FRAME — and `size > 0` would have credited all six", () => {
  writeFileSync(at("cut.png"), TRUNCATED_512K);
  const v = inspectFrame(at("cut.png"));
  assert.equal(statSync(at("cut.png")).size, 524_288, "the fixture is the real casualty's size");
  assert.ok(
    TRUNCATED_512K.subarray(0, 8).equals(PNG_SIGNATURE),
    "and it really is a PNG at the front — that is what makes it dangerous",
  );
  assert.ok(
    !TRUNCATED_512K.subarray(-8).equals(PNG_IEND),
    "with no IEND at the back — that is what makes it unreadable",
  );
  assert.equal(v.ok, false, "a size-only check passes this file; this one must not");
  assert.match(v.why, /IEND/, "and must name the structure it failed, not just say 'bad'");
  assert.match(v.why, /power of two/, "the tell that it was a partial WRITE, not a partial capture");
});

test("a file that was never written is not a frame", () => {
  const v = inspectFrame(at("never-existed.png"));
  assert.equal(v.ok, false);
  assert.match(v.why, /no file/);
});

test("a directory where the frame should be is not a frame", () => {
  // A directory stats as 0 bytes on Windows, so the size test alone would call
  // this "the file is 0 bytes" — true-sounding and wrong about what is there.
  mkdirSync(at("a-directory.png"), { recursive: true });
  const v = inspectFrame(at("a-directory.png"));
  assert.equal(v.ok, false);
  assert.match(v.why, /DIRECTORY/);
});

test("an HTML error page saved under a .png name is not a frame", () => {
  // Never seen in sweep161 (0 of 16,605 had a bad signature) but it is the
  // third way a capture can lie, and it costs one branch to refuse.
  writeFileSync(at("nonsense.png"), Buffer.from("<!doctype html><title>502</title>"));
  const v = inspectFrame(at("nonsense.png"));
  assert.equal(v.ok, false);
  assert.match(v.why, /PNG signature/);
});

// ── captureFrame: the behaviour that replaces `.catch(() => {})` ───────────

test("A GOOD CAPTURE IS SILENT, SINGLE-ATTEMPT AND LEFT ALONE", () => {
  // The opposite direction. A guard that always cries lost is as broken as one
  // that never does, and deleting a frame that was fine destroys the evidence.
  const said = [];
  const page = fakePage([{ write: GOOD_PNG }]);
  return captureFrame(page, at("keep.png"), { log: (s) => said.push(s) }).then((r) => {
    assert.equal(r.ok, true, r.why ?? "");
    assert.equal(r.attempts, 1, "a frame that landed must not cost a second screenshot");
    assert.equal(r.diskFull, false);
    assert.deepEqual(said, [], "and must print nothing at all");
    assert.ok(existsSync(at("keep.png")), "the frame is the artifact — it stays");
    assert.ok(readFileSync(at("keep.png")).equals(GOOD_PNG), "byte for byte");
  });
});

test("A 0-BYTE CAPTURE FAILS LOUDLY AND ITS STUB IS DELETED", async () => {
  // Against the old `page.screenshot({path}).catch(() => {})` this test fails
  // three times over: nothing was returned, nothing was said, and the 0-byte
  // file stayed on disk looking exactly like a captured frame.
  const said = [];
  const page = fakePage([{ write: Buffer.alloc(0) }]);
  const r = await captureFrame(page, at("lost.png"), { log: (s) => said.push(s) });
  assert.equal(r.ok, false);
  assert.equal(r.attempts, 2, "a transient write is worth one retry");
  assert.equal(page.calls.length, 2);
  assert.equal(said.length, 2, "and every failed attempt is audible");
  assert.match(said[0], /lost\.png was NOT captured/);
  assert.equal(
    existsSync(at("lost.png")),
    false,
    "absent evidence must LOOK absent — a re-drive lane that checks existence must not score this lane as tested",
  );
});

test("ENOSPC STOPS AT ONCE — a retry loop on a full disk just proves it is still full", async () => {
  // sc-rx-unguarded/pc-wrong/run.log ends on exactly this error, and the sweep
  // carried on for hours afterwards writing empty files.
  const said = [];
  const enospc = Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" });
  const page = fakePage([{ write: Buffer.alloc(0), throws: enospc }]);
  const r = await captureFrame(page, at("full.png"), { log: (s) => said.push(s) });
  assert.equal(r.ok, false);
  assert.equal(r.diskFull, true, "the caller has to be able to abandon the sweep on this");
  assert.equal(page.calls.length, 1, "and must not be asked to try again");
  assert.equal(r.attempts, 1, "the count reports what was SPENT, not the retry cap");
  assert.match(said[0], /ENOSPC/, "the thrown reason outranks the file's shape in the log line");
  assert.equal(existsSync(at("full.png")), false);
});

test("a capture that throws without writing anything is still a lost frame", async () => {
  const said = [];
  const page = fakePage([{ throws: new Error("Timeout 30000ms exceeded.") }]);
  const r = await captureFrame(page, at("timeout.png"), { log: (s) => said.push(s) });
  assert.equal(r.ok, false);
  assert.equal(r.diskFull, false, "a timeout is not a full disk and must not stop the sweep");
  assert.equal(r.attempts, 2);
  assert.match(said[0], /Timeout 30000ms exceeded/);
});

test("a TRANSIENT loss recovers on the retry, and the recovered frame is kept", async () => {
  // The shape on disk that proves this is worth doing:
  // sc-rx-unguarded/mobile-right/04-t013s.png is 0 bytes and 04-t018s.png
  // beside it is a whole 1.2 MB frame — same page, seconds apart.
  const said = [];
  const page = fakePage([{ write: TRUNCATED_512K }, { write: GOOD_PNG }]);
  const r = await captureFrame(page, at("recovered.png"), { log: (s) => said.push(s) });
  assert.equal(r.ok, true, r.why ?? "");
  assert.equal(r.attempts, 2);
  assert.equal(said.length, 1, "the failed attempt is still reported — a retry is not a secret");
  assert.ok(readFileSync(at("recovered.png")).equals(GOOD_PNG), "and the good bytes survive");
});

test("isDiskFull knows its one error and does not claim the others", () => {
  assert.equal(isDiskFull(Object.assign(new Error("write failed"), { code: "ENOSPC" })), true);
  assert.equal(isDiskFull(new Error("ENOSPC: no space left on device, write")), true);
  assert.equal(isDiskFull(new Error("Timeout 30000ms exceeded.")), false);
  assert.equal(isDiskFull(Object.assign(new Error("permission"), { code: "EACCES" })), false);
});

// ── the ledger: what the run says it got ───────────────────────────────────
//
// The counters are the part a judge reads instead of counting files in a
// folder, and the breaker is a stateful policy — the kind that comes back if
// nobody pins it down.

/** A ledger over a scripted sequence of capture results, no browser involved. */
const ledgerOver = (results) => {
  const said = [];
  const queue = [...results];
  const led = createFrameLedger({
    loud: (s) => said.push(s),
    capture: async () => (queue.length > 1 ? queue.shift() : queue[0]),
  });
  return { led, said, state: led.state };
};
const OK = { ok: true, bytes: 1234, why: null, attempts: 1, diskFull: false };
const LOST = { ok: false, bytes: 0, why: "the file is 0 bytes", attempts: 2, diskFull: false };
const FULL = { ok: false, bytes: 0, why: "ENOSPC: no space left on device, write", attempts: 1, diskFull: true };

test("THE LEDGER COUNTS AND NAMES WHAT WAS LOST — nobody should have to count files", async () => {
  // sc-pk-double-park's pc-wrong leg wrote 10 zero-byte PNGs and was scored as
  // a tested leg because ten files were there. This is the number that replaces
  // that inference.
  const { led, state } = ledgerOver([OK, LOST, OK]);
  assert.equal(await led.shoot(null, "/x/01-arrival.png", "01-arrival"), true);
  assert.equal(await led.shoot(null, "/x/07-end.png", "07-end"), false);
  assert.equal(await led.shoot(null, "/x/08-debrief.png", "08-debrief"), true);
  assert.equal(state.written, 2);
  assert.equal(state.lost, 1);
  assert.deepEqual(state.names, ["07-end (the file is 0 bytes)"], "named, so the gap is specific");
  assert.equal(state.cameraStopped, null, "one loss is not a broken camera");
  assert.equal(state.consecutive, 0, "and a good frame after it resets the run");
});

test("A LOSS BETWEEN GOOD FRAMES NEVER TRIPS THE BREAKER", async () => {
  // The opposite direction, and it matters: sc-rx-unguarded/mobile-right lost
  // eight scattered frames across a 186 s drive and still produced 05-stopped,
  // 07-end and a readable 08-debrief. A breaker that fired on isolated losses
  // would have thrown that lane's verdict away.
  const alternating = [OK, LOST, OK, LOST, OK, LOST, OK, LOST, OK];
  const { led, state, said } = ledgerOver(alternating);
  for (let i = 0; i < alternating.length; i += 1) await led.shoot(null, `/x/f${i}.png`, `f${i}`);
  assert.equal(state.written, 5);
  assert.equal(state.lost, 4);
  assert.equal(state.cameraStopped, null, "the camera works; it just missed some");
  assert.deepEqual(said, [], "and nothing shouted about a camera that is fine");
});

test("THREE LOSSES IN A ROW STOP THE CAMERA — but never the run", async () => {
  const { led, state, said } = ledgerOver([LOST]);
  for (let i = 0; i < MAX_CONSECUTIVE_FRAME_LOSSES; i += 1)
    assert.equal(await led.shoot(null, `/x/f${i}.png`, `f${i}`), false);
  assert.match(state.cameraStopped, /3 captures in a row/);
  assert.equal(said.length, 1, "it says so exactly once, not once per frame after");
  assert.match(said[0], /needs a re-drive/);

  // …and everything after is still COUNTED AND NAMED, not quietly skipped.
  const before = state.lost;
  assert.equal(await led.shoot(null, "/x/08-debrief.png", "08-debrief"), false);
  assert.equal(state.lost, before + 1, "a frame nobody tried for is still a missing frame");
  assert.match(state.names.at(-1), /08-debrief \(not attempted/);
  assert.equal(state.written, 0);
});

test("ENOSPC STOPS THE CAMERA ON THE FIRST FRAME, without waiting for three", async () => {
  const { led, state, said } = ledgerOver([FULL]);
  await led.shoot(null, "/x/01-arrival.png", "01-arrival");
  assert.equal(state.cameraStopped, "the disk is full (ENOSPC)");
  assert.equal(state.consecutive, 1, "one loss was enough — the disk will not un-fill");
  assert.match(said[0], /THE DISK IS FULL/);
  assert.match(said[0], /the LOG survives/, "the run must be told to keep writing text");
});

test("A CLEAN RUN LEAVES A CLEAN LEDGER — the check must be capable of saying nothing is wrong", async () => {
  const { led, state, said } = ledgerOver([OK]);
  for (const n of ["01-arrival", "02-briefing", "03-ready", "07-end", "08-debrief"])
    assert.equal(await led.shoot(null, `/x/${n}.png`, n), true);
  assert.equal(state.written, 5);
  assert.equal(state.lost, 0);
  assert.deepEqual(state.names, []);
  assert.equal(state.cameraStopped, null);
  assert.deepEqual(said, [], "a healthy run is silent — otherwise the loud lines mean nothing");
});
