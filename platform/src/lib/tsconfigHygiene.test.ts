import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * tsconfig.json must not accumulate per-agent build-directory globs.
 *
 * WHY THIS EXISTS. Parallel agents each run their own `next dev` with
 * `KNIJKA_DIST_DIR=.next-<lane>` so they do not fight over one build dir. Next
 * generates a route-types `validator.ts` inside each of those, and agents kept
 * adding a matching `include` glob so their own `tsc --noEmit` would see it.
 *
 * By 2026-07-30 there were **38 such globs naming 19 build dirs**, twelve of
 * which still held a 619-line `validator.ts` on disk. That is a landmine, and it
 * fired: a dir generated BEFORE `/dev/fold-rig` existed still listed the old
 * route set, so a clean tree typechecked as
 *
 *   .next-practice-exam/dev/types/validator.ts(385,52): error TS2344:
 *     Type '"/dev/fold-rig"' does not satisfy the constraint 'AppRoutes'
 *
 * Fifteen background shells hit exactly that. The danger is not the noise — it
 * is that a phantom type error makes an agent "fix" a defect that does not
 * exist, or fails a gate on a tree that is actually green. Verification you
 * cannot trust is worse than no verification, because it is acted upon.
 *
 * A scratch dir may exist; it must never be TYPE-CHECKED. `.next` alone is the
 * real build and the only one that belongs here.
 */
describe("tsconfig hygiene", () => {
  const tsconfigPath = path.resolve(__dirname, "../../tsconfig.json");
  const include: string[] = JSON.parse(readFileSync(tsconfigPath, "utf8")).include;

  it("includes only the real .next build dir, never a per-agent scratch dir", () => {
    // `.next/...` is fine; `.next-anything/...` is a scratch dir.
    const scratch = include.filter((glob) => /^\.next-/.test(glob));
    expect(
      scratch,
      "Remove these. A scratch build dir may exist on disk but must never be " +
        "type-checked: a stale route validator inside one injects phantom " +
        "errors into every `tsc --noEmit`, on a tree that is actually clean.",
    ).toEqual([]);
  });

  it("still checks the real build's generated route types", () => {
    expect(include).toContain(".next/types/**/*.ts");
    expect(include).toContain(".next/dev/types/**/*.ts");
  });

  it("stays small enough that a human notices it growing", () => {
    // Six entries today. A jump means someone started appending again.
    expect(include.length).toBeLessThanOrEqual(8);
  });
});
