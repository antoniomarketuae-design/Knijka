#!/usr/bin/env node
// Headless vehicle-feel harness runner — the CI gate from the spike's
// FEEL-NOTES ("any tuning PR must show the scenario table; regression in
// curb flip or lane change blocks merge").
//
// The scenarios live in src/modules/sim/vehicle/harness.test.ts and run the
// SAME VehicleSim class the browser binds to; vitest compiles the TS, rapier
// wasm runs natively in Node. This wrapper exists so CI and humans can call
// one canonical command:
//
//   node scripts/sim-harness.mjs
//
// (equivalent to: npx vitest run src/modules/sim/vehicle/harness.test.ts)

import { spawnSync } from "node:child_process";

const result = spawnSync(
  "npx",
  ["vitest", "run", "src/modules/sim/vehicle/harness.test.ts", "--reporter=verbose"],
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
