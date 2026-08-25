/**
 * THE TIER NAME, ON ITS OWN, AND THAT IS THE WHOLE POINT OF THIS FILE.
 *
 * `DifficultyMode` is three strings. It used to live in `difficulty.ts`, which
 * needs `VehicleInput` from `VehicleSim` for the assist maths — so any module
 * that wanted the NAME of a tier imported the PHYSICS with it.
 *
 * MEASURED 2026-08-25, when a repair lane added `import type { DifficultyMode }
 * from "./vehicle/difficulty"` to `contracts.ts`. That one line put rapier into
 * the import closure of `sim/collision`:
 *
 *   collision/index.ts → collision/bodies.ts → traffic/types.ts → contracts.ts
 *     → vehicle/difficulty.ts → vehicle/VehicleSim.ts → @dimforge/rapier3d-compat
 *
 * and `collision/__tests__/index.test.ts` — the gate the six sweep-161 collision
 * criticals were routed out on — went red with «sim/collision must stay
 * renderer-free». It was right to. A collision module that drags a physics
 * engine behind it cannot be reasoned about, or tested, as pure geometry.
 *
 * `import type` does not save you: the boundary gate walks `from "…"`
 * specifiers, and it is correct to, because a type-only edge is still a
 * statement about which modules may know about each other (doc 05).
 *
 * So the name lives here, in a file that imports NOTHING and never will.
 * `difficulty.ts` re-exports it, so every existing importer is untouched.
 */
export type DifficultyMode = "beginner" | "normal" | "advanced";
