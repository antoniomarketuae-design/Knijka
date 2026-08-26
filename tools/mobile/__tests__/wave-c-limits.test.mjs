// -----------------------------------------------------------------------------
// wave-c-limits.test.mjs — A WATCHDOG MUST NOT BE TIGHTER THAN WHAT IT WATCHES.
//
//   node --test tools/mobile/__tests__/wave-c-limits.test.mjs
//
// This guards a mistake that was actually made, twice over, on 2026-08-26:
// first `spawnSync` had no timeout at all and a dead browser cost eleven hours;
// then the supervisor written to cure that was given a 480 s threshold — BELOW
// the 510 s longest real drive — so it killed healthy drives and manufactured a
// crashed row that read as a product defect.
//
// The relationship, not the numbers, is what matters:
//     LONGEST_OBSERVED_DRIVE  <  DRIVE_TIMEOUT  <  SWEEP_STALL
// -----------------------------------------------------------------------------

import { strict as assert } from "node:assert";
import test from "node:test";

import { DRIVE_TIMEOUT_MS, LONGEST_OBSERVED_DRIVE_MS, SWEEP_STALL_MS } from "../lib/limits.mjs";

test("the per-drive bound is comfortably above the longest drive ever measured", () => {
  assert.ok(
    DRIVE_TIMEOUT_MS > LONGEST_OBSERVED_DRIVE_MS,
    "a timeout below a real drive duration kills healthy work",
  );
  assert.ok(
    DRIVE_TIMEOUT_MS >= LONGEST_OBSERVED_DRIVE_MS * 1.5,
    "leave real headroom — box load stretches drives, and a 480 s bound already did this damage once",
  );
});

test("a sweep may be silent for longer than one drive can take", () => {
  // Rows are appended per drive, so one legitimate long drive IS silence for
  // its whole duration. A stall threshold at or below the drive timeout will
  // fire on a drive that is still working.
  assert.ok(
    SWEEP_STALL_MS > DRIVE_TIMEOUT_MS,
    "the supervisor would fire on a drive the tool is still legitimately running",
  );
});

test("the bounds are finite and positive", () => {
  for (const [name, v] of Object.entries({ LONGEST_OBSERVED_DRIVE_MS, DRIVE_TIMEOUT_MS, SWEEP_STALL_MS })) {
    assert.ok(Number.isFinite(v) && v > 0, `${name} must be a positive finite number of ms`);
  }
});
