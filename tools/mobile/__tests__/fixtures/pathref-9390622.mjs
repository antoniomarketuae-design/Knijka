// THE FROZEN HEAD PAIRS (2026-10-16, cdtools lane, integrator decision CD-3).
//
// The curvdepth re-author (platform/src/modules/sim/traces/scParkDepth.ts) re-authored the nine
// parking drills so no demo turns tighter than the car can, and build-pathrefs re-planned seven of
// them. Several claims in the path-* tests were MEASURED on the witnesses of 9390622 and lost their
// subject on the re-planned corpus: the micro square-ups are gone (SQ), no reverse arc saturates
// (T13.4/4b), the arm bands moved (T9.m), the final reverses no longer owe the terminal law any
// rotation (T9.h), the R→D switches now carry authored rests (T9.e), and the body screen's point
// over-read and refinement figures were taken on the old rows (path-body-screen §6).
//
// RE-DERIVE, NEVER RELAX: such a claim is not re-baselined onto the new corpus. It is pinned HERE,
// on the exact pathref + trace pairs it was measured on, loaded through the same
// `loadPathRef(lesson, root)` the follower uses (so a pair whose trace digest disagrees with its
// pathref still refuses `reference-stale`), and driven by today's follower and today's product.
//
// FROZEN means: byte-identical to `git show 9390622:<path>`, every file sha256-pinned in
// MANIFEST.json, and the manifest itself pinned by HEAD_FIXTURE_SHA below — `verifyHeadFixture()`
// throws on any drift, and every test that reads the fixture calls it first.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const HEAD_FIXTURE_ROOT = resolve(HERE, "pathref-9390622");
/** sha256 over the manifest's sorted «path sha256» lines (one per file, joined by \n). */
export const HEAD_FIXTURE_SHA = "687b110d8044ede74535f8c4f69b17e526417e0c8a90c46cda538983272a4253";
export const HEAD_FIXTURE_LESSONS = Object.freeze(["sc-park-45-rev", "sc-park-gap-short", "sc-park-judge", "sc-park-left", "sc-park-van", "sc-park-wall", "sc-park-zebra"]);

let verified = null;
/** Throws unless every fixture file hashes to its manifest entry and the manifest hashes to HEAD_FIXTURE_SHA. */
export function verifyHeadFixture() {
  if (verified) return verified;
  const m = JSON.parse(readFileSync(resolve(HEAD_FIXTURE_ROOT, "MANIFEST.json"), "utf8"));
  if (m.schema !== "knijka.pathref-fixture/1" || m.frozenFrom !== "9390622") throw new Error(`the HEAD fixture manifest is not a knijka.pathref-fixture/1 frozen from 9390622 (${m.schema} / ${m.frozenFrom})`);
  const entries = Object.entries(m.files).sort(([a], [b]) => (a < b ? -1 : 1));
  const agg = createHash("sha256").update(entries.map(([p, v]) => `${p} ${v.sha256}`).join("\n")).digest("hex");
  if (agg !== HEAD_FIXTURE_SHA) throw new Error(`the HEAD fixture manifest drifted: aggregate ${agg} ≠ pinned ${HEAD_FIXTURE_SHA} — a frozen fixture is never edited`);
  for (const [p, v] of entries) {
    const got = createHash("sha256").update(readFileSync(resolve(HEAD_FIXTURE_ROOT, p))).digest("hex");
    if (got !== v.sha256) throw new Error(`the HEAD fixture file ${p} drifted: ${got} ≠ ${v.sha256} — a frozen fixture is never edited`);
  }
  const lessons = [...new Set(entries.map(([p]) => /path-refs\/(.+)\.pathref\.json$/.exec(p)?.[1]).filter(Boolean))].sort();
  if (JSON.stringify(lessons) !== JSON.stringify([...HEAD_FIXTURE_LESSONS].sort())) throw new Error(`the HEAD fixture holds ${lessons.join(", ")}, not ${HEAD_FIXTURE_LESSONS.join(", ")}`);
  verified = { files: entries.length, lessons };
  return verified;
}
