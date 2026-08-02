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
  const parsed = JSON.parse(readFileSync(tsconfigPath, "utf8"));
  const include: string[] = parsed.include;
  const exclude: string[] = parsed.exclude ?? [];

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

  it("EXCLUDES every scratch dir — removing the glob was only half the fix", () => {
    // THE HOLE THIS TEST HAD, and it fired on 2026-08-02. Deleting the two
    // `.next-unpanel/**` globs from `include` did NOT stop tsc reading that dir:
    // `include` also carries a bare `**/*.ts`, which sweeps the whole project
    // root, and `exclude` listed only `node_modules`. So a clean tree still
    // failed with 66 phantom parse errors out of
    // `.next-unpanel/dev/types/routes.d.ts` — the exact disease this file was
    // written to end, surviving the exact fix this file demanded.
    //
    // A scratch dir may exist; it must never be type-checked. The `include`
    // assertion above stops someone ADDING one on purpose; this one stops the
    // project glob picking one up by accident.
    expect(
      exclude,
      "tsconfig `exclude` must carry `.next-*`, or `include`'s `**/*.ts` " +
        "type-checks every per-agent scratch build dir on the box.",
    ).toContain(".next-*");
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
