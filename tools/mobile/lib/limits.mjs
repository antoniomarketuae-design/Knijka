// -----------------------------------------------------------------------------
// limits.mjs — HOW LONG A DRIVE IS ALLOWED TO TAKE, MEASURED RATHER THAN GUESSED.
//
// On 2026-08-25 three driver shards sat at 83/204 for ELEVEN HOURS. The dev
// server was healthy the whole time — right commit, db.ok, uptime 53,676 s.
// Their Playwright browsers had died and `spawnSync` was called with no
// `timeout`, so the drivers blocked on a handle that would never answer. A dead
// browser and a slow drive are indistinguishable from outside; only a bound
// tells them apart.
//
// THE NUMBER IS MEASURED. Across 2,527 real drives in this corpus:
//     p50 222 s · p90 291 s · p99 311 s · MAX 510 s
// A drive legitimately runs to eight and a half minutes.
//
// AND THE FIRST BOUND I PICKED WAS WRONG, WHICH IS WHY THIS FILE EXISTS.
// The supervisor's first threshold was 480 s — BELOW the longest real drive. It
// killed healthy work and produced a crashed row that looked like a defect. A
// watchdog set tighter than the thing it watches is not a safety net, it is a
// second source of failures. DRIVE_TIMEOUT_MS is ~1.8x the longest drive ever
// recorded, so it can only ever fire on something genuinely stuck.
//
// If you lower these, raise LONGEST_OBSERVED_DRIVE_MS first with the corpus
// query that justifies it. __tests__/wave-c-limits.test.mjs refuses the change
// otherwise.
// -----------------------------------------------------------------------------

/** The longest single drive ever recorded, over 2,527 rows (2026-08-26). */
export const LONGEST_OBSERVED_DRIVE_MS = 510_000;

/** Kill one drive after this. ~1.8x the longest real drive. */
export const DRIVE_TIMEOUT_MS = 900_000;

/**
 * How long a SWEEP may go without appending a row before a supervisor calls it
 * hung. Must exceed DRIVE_TIMEOUT_MS: rows are appended per drive, so a single
 * legitimate long drive is silence for its whole duration.
 */
export const SWEEP_STALL_MS = 1_200_000;
