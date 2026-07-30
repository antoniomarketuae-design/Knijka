<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Two ways your verification will lie to you

Both of these have already sent someone chasing a defect that did not exist. When a check fails,
rule these out **before** you believe it.

## 1. `Failed to start forks worker` is memory pressure, not a test failure

```
Error: [vitest-pool]: Failed to start forks worker for test files …
```

This box has 16 GB and several agents share it. Under pressure vitest cannot fork a worker and
reports it like a failure. **Nothing is wrong with the code.** A run that reported "55 tests failing"
this way was green on a retry.

Re-run with `npx vitest run --maxWorkers=4` (or 2 when the box is busy). `--poolOptions` and
`--minWorkers` are not valid in this version — do not reach for them. If you are about to report red
tests, check the output for this line first.

## 2. A stale scratch build dir injects phantom `tsc` errors

If you run your own dev server, use `KNIJKA_DIST_DIR=.next-<yourlane>` so you do not fight other
agents for `.next`. **Do NOT add a matching glob to `tsconfig.json`.**

Next writes a route `validator.ts` into every dist dir. A dir built before a route existed still
lists the old route set, so once it is type-checked a perfectly clean tree fails with things like:

```
.next-practice-exam/dev/types/validator.ts(385,52): error TS2344:
  Type '"/dev/fold-rig"' does not satisfy the constraint 'AppRoutes'
```

Thirty-eight such globs naming nineteen dirs accumulated this way, and fifteen background shells hit
the phantom. `src/lib/tsconfigHygiene.test.ts` now fails if one comes back. The scratch dir itself is
fine and gitignored — it just must never be type-checked. **Delete it when you finish**; they run
0.2–1.1 GB each and idle ones once took the box to 1.6 GB of free disk.
