/**
 * gen_clip_plan.mjs — the produced-media requirements card (doc 66):
 * regenerates platform/src/modules/clips/clipPlan.generated.ts — per pilot
 * clip the ENGINE-computed first-violation time (R3) + the machine-derived
 * card (R1 actors / R2 governing control / R4 view).
 *
 * The whyPanelMap mold (generator + committed output + freshness test), but
 * the derivation must replay committed traces through the TS production
 * grading stack (sim/traces recorders), which plain node cannot import — so
 * generation runs through vitest (the RECORD_TRACES=1 precedent): this
 * wrapper spawns the freshness test with GEN_CLIP_PLAN=1. Rerun after any
 * template/trace/district change:
 *
 *   node tools/clips/gen_clip_plan.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLATFORM = path.resolve(HERE, "..", "..", "platform");

const result = spawnSync("npx", ["vitest", "run", "src/modules/clips/clipPlan.test.ts"], {
  cwd: PLATFORM,
  env: { ...process.env, GEN_CLIP_PLAN: "1" },
  stdio: "inherit",
  // npx is a .cmd shim on Windows — spawn through the shell there.
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
