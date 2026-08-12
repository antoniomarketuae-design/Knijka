#!/usr/bin/env node
// =============================================================================
// normalize-next-env.mjs — point `next-env.d.ts` back at the REAL build dir.
//
// THE DEFECT (measured 2026-08-11). `next dev` writes two files at boot, not
// one. Everybody knows about the first — it appends `<distDir>/types/**` globs
// to `tsconfig.json`, AGENTS.md documents it, and `tsconfigHygiene.test.ts`
// guards it. The second is `next-env.d.ts`, written by Next's
// `writeAppTypeDeclarations` with the SAME `distDir`, and it is the one that
// actually breaks the gate:
//
//     /// <reference types="next" />
//     import "./.next-rev/dev/types/routes.d.ts";
//
// Three things make that line worse than the tsconfig globs:
//
//   1. `exclude` CANNOT stop it. `exclude` filters what `include` FINDS; it
//      does not stop a module pulled in by an `import` or a `///<reference>`.
//      Measured in an isolated project: with `exclude: [".next-*"]` present, an
//      explicit `.next-stale/dev/types` INCLUDE glob type-checks clean (tsc
//      exit 0) — so the globs everyone hunts are already inert. This import is
//      not, and `next-env.d.ts` is itself listed in `include`.
//   2. `next-env.d.ts` is GITIGNORED (platform/.gitignore). So the damage is
//      invisible to `git diff platform/tsconfig.json` — the exact check three
//      lanes ran before concluding their tree was clean and the red was real.
//   3. A scratch dir built before a route existed carries a stale `routes.d.ts`
//      / `validator.ts`, so a perfectly clean tree fails with parse or TS2344
//      errors naming a directory the reader has never heard of.
//
// Caught in the act: with `platform/tsconfig.json` byte-identical to HEAD,
// `npx tsc --noEmit` emitted TS1434/TS1128 out of `.next-rev/dev/types/
// routes.d.ts` — another lane's dist dir, reached entirely through this file.
//
// So the gate stops trusting whatever the last dev server left behind and
// normalises the pointer to `.next` before type-checking. Idempotent, silent
// when there is nothing to do, and it never invents the line — if Next has not
// written one, there is nothing here to rewrite.
// =============================================================================
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(HERE, "..", "next-env.d.ts");

/** `.next-<lane>/...` in an import or a triple-slash reference → `.next/...`. */
export function normalizeNextEnv(source) {
  return source.replace(/(["'])\.\/\.next-[A-Za-z0-9._-]+\//g, "$1./.next/");
}

function main() {
  let source;
  try {
    source = readFileSync(FILE, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return 0; // no dev server has run here yet
    throw err;
  }
  const next = normalizeNextEnv(source);
  if (next === source) return 0;
  writeFileSync(FILE, next, "utf8");
  console.log(
    "[normalize-next-env] next-env.d.ts pointed at a per-agent scratch build " +
      "dir; repointed at .next so the type-check is not poisoned by another " +
      "lane's stale route types.",
  );
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exit(main());
}
