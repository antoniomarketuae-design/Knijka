#!/usr/bin/env node
// Headless vehicle-feel harness runner — the CI gate from the spike's
// FEEL-NOTES ("any tuning PR must show the scenario table; regression in
// curb flip or lane change blocks merge").
//
// Two suites, one canonical command:
//   - harness.test.ts          — the BASELINE 6 (spike invariants). These are
//     law: any tuning change must keep them green with the same envelope.
//   - parking-envelope.test.ts — the S0 low-speed additions (doc 76 §0/§12):
//     creep hold, full-lock reverse arc radius, 0-crossing smoothness,
//     standstill brake honesty, crawl stop, beginner full lock.
//
// Both run the SAME VehicleSim class the browser binds to; vitest compiles
// the TS, rapier wasm runs natively in Node:
//
//   node scripts/sim-harness.mjs
//
// (equivalent to: npx vitest run src/modules/sim/vehicle/harness.test.ts
//                 src/modules/sim/vehicle/parking-envelope.test.ts)

import { spawnSync } from "node:child_process";

const result = spawnSync(
  "npx",
  [
    "vitest",
    "run",
    "src/modules/sim/vehicle/harness.test.ts",
    "src/modules/sim/vehicle/parking-envelope.test.ts",
    "--reporter=verbose",
  ],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

if (result.error) {
  console.error("[sim-harness] failed to launch vitest:", result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
