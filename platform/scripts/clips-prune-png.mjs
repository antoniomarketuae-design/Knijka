#!/usr/bin/env node
// Prune the keyframe PNG masters in public/clips (doc 82 §8).
//
// WHY IT IS A SCRIPT AND NOT A DELETE. §8 says "237 MB of PNG keyframes that
// no runtime code references — delete before expanding the clip library", and
// the runtime half is exactly right: `public/clips/manifest.json` names only
// the 4 MB WebP set. But two facts make an unattended `rm` the wrong move:
//
//  1. `platform/.gitignore:19` excludes `/public/clips/*`. These files are NOT
//     in git. A deletion is not revertible — and re-creating them is the
//     ~4.3 h unattended GPU batch in doc 82 §6.2 P7, on a machine that has to
//     have the GPU.
//  2. `tools/assets/publicBudget.mjs` already classifies them `ship: "dev"`
//     and states, in as many words, that "`ship: dev` does NOT mean delete".
//     `prune-public.mjs` strips them from the deploy, so they cost the VPS,
//     the CDN and the student nothing. The 237 MB is founder disk, and the
//     founder's box is the one documented as chronically squeezed.
//
// So: measure and verify by default, delete only when told to, and never
// delete a PNG whose WebP does not exist — that WebP is the only thing the
// product ships, and these PNGs are what it was made from
// (tools/clips/headless/keyframes-to-webp.mjs).
//
//   node scripts/clips-prune-png.mjs           # report only
//   node scripts/clips-prune-png.mjs --apply   # delete the verified-safe set

import { readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLIPS_DIR = path.resolve(HERE, "../public/clips");
const MANIFEST = path.join(CLIPS_DIR, "manifest.json");

const apply = process.argv.includes("--apply");

let entries;
try {
  entries = readdirSync(CLIPS_DIR);
} catch {
  console.log("clips-prune-png: no public/clips directory — nothing to do.");
  process.exit(0);
}

/** Every URL the manifest points at, as bare filenames. */
const referenced = new Set();
try {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  for (const clip of manifest.clips ?? []) {
    for (const url of [clip.src, ...(clip.keyframes ?? [])]) {
      if (typeof url === "string") referenced.add(path.basename(url));
    }
  }
} catch (err) {
  console.error(`clips-prune-png: cannot read ${MANIFEST} — refusing to touch anything.`);
  console.error(String(err));
  process.exit(1);
}

const pngs = entries.filter((f) => f.endsWith(".png"));
const webps = new Set(entries.filter((f) => f.endsWith(".webp")));

const safe = [];
const keep = [];
for (const png of pngs) {
  const webp = `${png.slice(0, -4)}.webp`;
  if (referenced.has(png)) {
    // Would mean the manifest still points at a PNG — an unconverted clip.
    keep.push([png, "referenced by manifest.json"]);
  } else if (!webps.has(webp) || !referenced.has(webp)) {
    // The master of a still that was never converted, or converted and then
    // dropped from the manifest. Either way it is the only copy.
    keep.push([png, `no shipped ${webp}`]);
  } else {
    safe.push(png);
  }
}

const bytes = (files) =>
  files.reduce((n, f) => {
    try {
      return n + statSync(path.join(CLIPS_DIR, f)).size;
    } catch {
      return n;
    }
  }, 0);

const mb = (n) => (n / 1_000_000).toFixed(1);

console.log(`clips-prune-png: ${pngs.length} PNG masters, ${mb(bytes(pngs))} MB total`);
console.log(`  safe to prune : ${safe.length} files, ${mb(bytes(safe))} MB`);
console.log(`  must keep     : ${keep.length} files, ${mb(bytes(keep.map((k) => k[0])))} MB`);
for (const [file, why] of keep.slice(0, 10)) console.log(`      ${file} — ${why}`);
if (keep.length > 10) console.log(`      … and ${keep.length - 10} more`);

if (!apply) {
  console.log("");
  console.log("Dry run. These files are gitignored, so a delete cannot be undone and");
  console.log("regenerating them is the ~4.3 h GPU batch in doc 82 §6.2 P7.");
  console.log("Re-run with --apply once you have looked at the list above.");
  process.exit(0);
}

let removed = 0;
let removedBytes = 0;
for (const file of safe) {
  const full = path.join(CLIPS_DIR, file);
  try {
    removedBytes += statSync(full).size;
    unlinkSync(full);
    removed += 1;
  } catch (err) {
    console.error(`  failed to remove ${file}: ${String(err)}`);
  }
}
console.log(`clips-prune-png: removed ${removed} files, ${mb(removedBytes)} MB`);
