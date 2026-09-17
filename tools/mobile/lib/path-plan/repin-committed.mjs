#!/usr/bin/env node
// -----------------------------------------------------------------------------
// repin-committed.mjs — RE-PIN `policy.mjs COMMITTED` TO THE PATHREFS ON DISK.
//
//   node tools/mobile/lib/path-plan/repin-committed.mjs          (print what differs)
//   node tools/mobile/lib/path-plan/repin-committed.mjs --write  (rewrite policy.mjs)
//
// COMMITTED is the corpus pin: the corridor and arm band of every committed
// witness, held byte-for-byte by `__tests__/path-plan.test.mjs` and read LIVE by
// `path-evidence.mjs` (corridorFor / bandFor / stopTargetOf) — the evidence layer
// measures a drive against these, not against the pathref the drive followed, so
// that a drive and its own plan cannot quietly agree with each other.
//
// Which is why it must be re-pinned DELIBERATELY and VISIBLY whenever the corpus
// is re-planned, and never by hand: a hand-edited row is a pin that agrees with
// nothing. Every row here is derived from the pathrefs by exactly the arithmetic
// path-plan.test.mjs re-derives it with, and a lesson with no pathref on disk is
// a REFUSAL, never a row carried over from the old table.
// -----------------------------------------------------------------------------
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PATH_LESSONS } from "./policy.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..", "..");
const REFS = resolve(REPO, "tools", "mobile", "path-refs");
const POLICY = resolve(HERE, "policy.mjs");
/** path-plan.test.mjs's own allowance, re-derived here so the two cannot drift. */
const CORRIDOR_ALLOWANCE_M = 0.35;
const r3 = (v) => Math.round(v * 1000) / 1000;
const arr = (a) => `[${a.join(",")}]`;

const built = new Map();
for (const lesson of PATH_LESSONS) {
  const f = resolve(REFS, `${lesson}.pathref.json`);
  if (!existsSync(f)) throw new Error(`repin-committed: ${lesson} has no pathref on disk — refusing to pin a lesson I cannot read`);
  const ref = JSON.parse(readFileSync(f, "utf8"));
  const segs = [];
  for (const sg of ref.segments) {
    if (!sg.witnesses?.length) throw new Error(`repin-committed: ${lesson} seg ${sg.k} has no witness — refusing to pin it`);
    const corridorM = sg.gear === -1
      ? Math.max(...sg.witnesses.map((w) => w.corridorM))
      : r3(Math.min(1.5, (sg.witnesses[0].worstDevIncludingAcquisitionM ?? sg.witnesses[0].worstDevM) + CORRIDOR_ALLOWANCE_M));
    if (!Number.isFinite(corridorM)) throw new Error(`repin-committed: ${lesson} seg ${sg.k} corridor came back ${corridorM}`);
    if (sg.gear === -1) {
      const band = sg.designedNegative ? sg.spawnBand : sg.armBand;
      if (!band) throw new Error(`repin-committed: ${lesson} seg ${sg.k} carries no band — refusing to pin a guess`);
      segs.push(`    ${sg.k}: { corridorM: ${corridorM}, band: { alongM: ${arr(band.alongM)}, latM: ${arr(band.latM)}, yawDeg: ${arr(band.yawDeg)} } },`);
    } else segs.push(`    ${sg.k}: { corridorM: ${corridorM} },`);
  }
  built.set(lesson, `  ${JSON.stringify(lesson)}: {\n${segs.join("\n")}\n  },`);
}
const table = `export const COMMITTED = Object.freeze({\n${[...built.values()].join("\n")}\n});`;

const src = readFileSync(POLICY, "utf8");
const start = src.indexOf("export const COMMITTED = Object.freeze({");
if (start < 0) throw new Error("repin-committed: policy.mjs has no COMMITTED table");
const end = src.indexOf("\n});", start);
if (end < 0) throw new Error("repin-committed: the COMMITTED table is not terminated by a line of `});`");
const old = src.slice(start, end + 4);
if (old === table) {
  console.log("COMMITTED already matches the pathrefs on disk — nothing to re-pin");
  process.exit(0);
}

// A PER-LESSON DIFF, so a reader sees WHICH corpus moved rather than a line
// number. A positional line diff is unreadable the moment a lesson gains or
// loses a segment, which is exactly when a re-pin matters most.
const blocks = (text) => {
  const map = new Map();
  let key = null;
  const lines = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^ {2}"([^"]+)": \{$/);
    if (m) {
      if (key) map.set(key, lines.join("\n"));
      key = m[1];
      lines.length = 0;
    }
    if (key) lines.push(line);
  }
  if (key) map.set(key, lines.join("\n"));
  return map;
};
const A = blocks(old);
const B = blocks(table);
let n = 0;
for (const key of new Set([...A.keys(), ...B.keys()])) {
  if (A.get(key) === B.get(key)) continue;
  n += 1;
  console.log(`=== ${key}`);
  console.log((A.get(key) ?? "  (absent from policy.mjs)").split("\n").map((l) => `- ${l}`).join("\n"));
  console.log((B.get(key) ?? "  (absent from the pathrefs)").split("\n").map((l) => `+ ${l}`).join("\n"));
}
if (!process.argv.includes("--write")) {
  console.log(`\n${n} lesson(s) differ — re-run with --write to re-pin`);
  process.exit(1);
}
writeFileSync(POLICY, src.slice(0, start) + table + src.slice(end + 4));
console.log(`\nre-pinned COMMITTED from ${PATH_LESSONS.length} pathrefs (${n} lesson(s) moved)`);
