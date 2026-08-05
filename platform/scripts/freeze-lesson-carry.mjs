#!/usr/bin/env node
/**
 * The classroom's carry — src/modules/lesson/clearanceCarry.ts.
 *
 * WHAT THE CARRY IS. concepts.json has no `status` field, so a concept summary
 * cannot be gated the way narration.ts gates authored text. What the classroom
 * speaks is therefore pinned by the HASH of the exact sentence, and a sentence
 * that changes stops being spoken until a PERSON clears the new one.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS SCRIPT WAS REWRITTEN. Its previous version had a bulk „repin" mode:
 * one command, every stale pin rolled forward, each new pin computed by this
 * script from content/concepts.json. It was run at 23:26 against a file edited
 * at 22:06 and it moved eleven pins. Hashing `git show HEAD:content/concepts
 * .json` against the result afterwards: eleven of eleven matched the NEW text,
 * zero matched the old. The gate had been regenerated from the file it exists
 * to check, and no reader of the table could tell.
 *
 * It printed every sentence it was about to authorise, with „READ THIS BEFORE
 * YOU COMMIT IT". Printing is not evidence. Nothing in the artifact it wrote
 * recorded whether anybody's eyes had been on the screen.
 *
 * THE RULE NOW: THIS SCRIPT CANNOT MINT A PIN.
 *
 * It will compute a fingerprint and show it to you. It will not write one it
 * computed. `--clear` requires the fingerprint to be TRANSCRIBED back on the
 * command line, together with a name, and it moves exactly ONE row. There is no
 * mode that touches two rows, and there is no mode that writes without `--by`.
 *
 * That is not tamper-proof and this file will not pretend it is — a determined
 * script can run `--show`, scrape the fingerprint and type a human's name. What
 * it removes is the ACCIDENT: the one-command path somebody takes while tidying
 * a red test, without ever deciding to vouch for anything. What is left is a
 * false attestation, under a name, in a diff.
 *
 *   node scripts/freeze-lesson-carry.mjs                  # --check (default)
 *   node scripts/freeze-lesson-carry.mjs --show <id>      # read the sentence
 *   node scripts/freeze-lesson-carry.mjs --clear <id> --pin <fp> --by "<name>"
 *   node scripts/freeze-lesson-carry.mjs --propose        # freeze-rule report
 *
 * ONLY `--clear` WRITES. `--check`, `--show` and `--propose` are read-only, and
 * `clearance.test.ts` proves it by running each of them against a scratch copy
 * and asserting the file comes back byte-identical.
 *
 * THE FREEZE TABLE IS NEVER WRITTEN AT ALL. `CARRIED_CONCEPT_SUMMARIES`
 * describes one immutable git blob (`CARRY_FROZEN_BLOB`); a row may be deleted
 * from it by hand when its concept is deleted, and nothing else. `--clear`
 * writes only `CLEARED_SINCE_FREEZE`.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const CONTENT = path.join(REPO, "content");
const CARRY_FILE = path.resolve(HERE, "..", "src", "modules", "lesson", "clearanceCarry.ts");

// Mirrors lib/content/sanitize.ts — the loader strips these before any student
// sees the string, so the pin must cover the sanitised text, not the raw JSON.
// clearance.test.ts reads through the real repo, so a drift here fails there.
const STAFF_ANNOTATION_RE =
  /\[\s*(?:REVIEW|TODO|FIXME|TBD|XXX|HACK|NOTE|CHECK|VERIFY|QA)\s*(?::[^\]]*)?\]/g;

function sanitize(text) {
  if (!text.includes("[")) return text;
  STAFF_ANNOTATION_RE.lastIndex = 0;
  if (!STAFF_ANNOTATION_RE.test(text)) return text;
  return text.replace(STAFF_ANNOTATION_RE, "").replace(/[ \t]{2,}/g, " ").trim();
}

const fingerprint = (text) =>
  createHash("sha256").update(Buffer.from(sanitize(text), "utf8")).digest("hex").slice(0, 16);

// ---------------------------------------------------------------------------
// Reading what exists
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
function flag(name) {
  const i = argv.indexOf(name);
  return i < 0 ? undefined : (argv[i + 1] ?? "");
}
function countFlag(name) {
  return argv.filter((a) => a === name).length;
}

const concepts = JSON.parse(readFileSync(path.join(CONTENT, "concepts.json"), "utf8"));
const byId = new Map(concepts.map((c) => [c.id, c]));

const source = readFileSync(CARRY_FILE, "utf8");

const frozenBlob = /CARRY_FROZEN_BLOB = "([0-9a-f]{40})"/.exec(source)?.[1];
const ceiling = Number(/CARRY_CEILING = (\d+)/.exec(source)?.[1] ?? "0");

/** The freeze table: id → pin. Never written by this script. */
const frozen = new Map();
for (const [, id, hash] of source.matchAll(/^ {2}"(c-[a-z0-9-]+)": "([0-9a-f]{16})",/gm)) {
  frozen.set(id, hash);
}
if (frozen.size === 0) {
  console.error("could not parse CARRIED_CONCEPT_SUMMARIES — refusing to touch this file");
  process.exit(1);
}

/** The signature table: id → { pin, by, at }. */
const CLEARED_BLOCK_RE =
  /(CLEARED_SINCE_FREEZE: Readonly<Record<string, CarrySignature>> = \{)([\s\S]*?)(\} as const;)/;
const clearedBlock = CLEARED_BLOCK_RE.exec(source);
if (clearedBlock === null) {
  console.error("could not find CLEARED_SINCE_FREEZE — clearanceCarry.ts shape changed");
  process.exit(1);
}
const signed = new Map();
for (const [, id, pin, by, at] of clearedBlock[2].matchAll(
  /"(c-[a-z0-9-]+)":\s*\{\s*pin:\s*"([0-9a-f]{16})",\s*by:\s*"([^"]*)",\s*at:\s*"([\d-]+)"\s*\}/g,
)) {
  signed.set(id, { pin, by, at });
}

const machineSigners = new Set(
  [...(/MACHINE_SIGNERS: readonly string\[\] = \[([\s\S]*?)\]/.exec(source)?.[1] ?? "").matchAll(
    /"([^"]+)"/g,
  )].map((m) => m[1].toLowerCase()),
);

/** Live fingerprint, or undefined when the concept is gone. */
function liveFingerprint(id) {
  const concept = byId.get(id);
  return concept === undefined ? undefined : fingerprint(concept.summaryBg);
}

/** Which authority currently covers this id: "freeze", "signed", or null. */
function coveredBy(id) {
  const live = liveFingerprint(id);
  if (live === undefined) return null;
  if (signed.get(id)?.pin === live) return "signed";
  if (frozen.get(id) === live) return "freeze";
  return null;
}

// ---------------------------------------------------------------------------
// --check (default) — read-only
// ---------------------------------------------------------------------------

function report() {
  const stale = [];
  const orphaned = [];
  for (const id of new Set([...frozen.keys(), ...signed.keys()])) {
    if (!byId.has(id)) {
      orphaned.push(id);
      continue;
    }
    if (coveredBy(id) === null) stale.push(id);
  }
  return { stale, orphaned };
}

function verifyAgainstBlob() {
  if (frozenBlob === undefined) return { ok: false, note: "no CARRY_FROZEN_BLOB in the file" };
  let text;
  try {
    text = execFileSync("git", ["cat-file", "blob", frozenBlob], {
      cwd: REPO,
      maxBuffer: 64 * 1024 * 1024,
    }).toString("utf8");
  } catch {
    return { ok: false, note: `blob ${frozenBlob} is not in this clone` };
  }
  const frozenById = new Map(JSON.parse(text).map((c) => [c.id, c]));
  const wrong = [];
  for (const [id, pin] of frozen) {
    const row = frozenById.get(id);
    if (row === undefined) {
      wrong.push(`${id}: not present in the frozen blob`);
      continue;
    }
    if (fingerprint(row.summaryBg) !== pin) {
      wrong.push(`${id}: pinned ${pin}, blob says ${fingerprint(row.summaryBg)}`);
    }
  }
  return { ok: wrong.length === 0, wrong, note: null };
}

if (argv.length === 0 || argv.includes("--check")) {
  const { stale, orphaned } = report();
  const blob = verifyAgainstBlob();

  console.log(`freeze table  ${frozen.size} pins (ceiling ${ceiling}), blob ${frozenBlob}`);
  if (blob.note !== null) {
    console.log(`  ! could not verify against the blob: ${blob.note}`);
  } else if (blob.ok) {
    console.log(`  ✓ all ${frozen.size} pins match the frozen blob`);
  } else {
    console.error(
      `\n  ✗ ${blob.wrong.length} pin(s) DO NOT match the frozen blob. The freeze table has\n` +
        `    been regenerated from something else — that is the exact failure this\n` +
        `    file exists to make visible.\n      ${blob.wrong.join("\n      ")}`,
    );
  }
  console.log(`signatures    ${signed.size} row(s) cleared since the freeze`);
  for (const [id, sig] of signed) console.log(`  ${id}  by ${sig.by} on ${sig.at}`);

  if (orphaned.length > 0) {
    console.log(`\norphaned (concept deleted from content) — remove these rows by hand:`);
    for (const id of orphaned) console.log(`  ${id}`);
  }

  if (stale.length > 0) {
    console.log(
      `\n${stale.length} summary/summaries are WITHHELD — edited since whatever last covered them.\n` +
        `This is the gate working, not a failure. Each comes back when a person reads it:`,
    );
    for (const id of stale) {
      console.log(`  ${id}   node scripts/freeze-lesson-carry.mjs --show ${id}`);
    }
  } else {
    console.log(`\nnothing withheld: every carried summary is covered.`);
  }

  // Exit 1 ONLY for the thing that is actually wrong. A stale pin is the
  // correct resting state of this system; the previous version exited 1 on it,
  // which is what taught everyone to run the bulk re-pin to get back to green.
  process.exit(blob.note === null && !blob.ok ? 1 : 0);
}

// ---------------------------------------------------------------------------
// --show <id> — read-only
// ---------------------------------------------------------------------------

const showId = flag("--show");
if (showId !== undefined) {
  const concept = byId.get(showId);
  if (concept === undefined) {
    console.error(`no such concept in content/concepts.json: ${showId}`);
    process.exit(1);
  }
  const live = fingerprint(concept.summaryBg);
  const covered = coveredBy(showId);
  console.log(`\n${concept.id}  „${concept.titleBg}"`);
  // A reader clearing a first-aid or priority summary needs to be able to go
  // and check the article it claims, so print the refs readably rather than as
  // `[object Object]`. ADR-002: we cite, we never recall.
  const refs = (concept.lawRefs ?? [])
    .map((r) => (typeof r === "string" ? r : `${r.act} ${r.ref}`))
    .join(" · ");
  console.log(`  topic ${concept.topicId} · ${refs || "no lawRefs"}`);
  console.log(`  freeze pin  ${frozen.get(showId) ?? "— (never frozen)"}`);
  console.log(`  signature   ${signed.get(showId)?.pin ?? "— (never cleared)"}`);
  console.log(`  live text   ${live}`);
  console.log(`  status      ${covered === null ? "WITHHELD" : `spoken under ${covered}`}`);
  console.log(`\n  THIS IS WHAT A 17-YEAR-OLD WOULD HEAR:\n`);
  console.log(`  „${sanitize(concept.summaryBg)}"\n`);
  if (covered !== null) {
    console.log(`  Already covered. Nothing to do.\n`);
    process.exit(0);
  }
  console.log(`  If — and only if — you have just read that sentence and you are willing to`);
  console.log(`  put your name on it being taught as written:\n`);
  console.log(
    `    node scripts/freeze-lesson-carry.mjs --clear ${showId} --pin ${live} --by "<your name>"\n`,
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// --propose — read-only. Re-applies the freeze rule and reports; writes nothing.
// ---------------------------------------------------------------------------

if (argv.includes("--propose")) {
  const questionsDir = path.join(CONTENT, "questions");
  const questions = readdirSync(questionsDir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => JSON.parse(readFileSync(path.join(questionsDir, f), "utf8")));
  const approvedByConcept = new Map();
  for (const q of questions) {
    if (q.status !== "approved") continue;
    for (const cid of q.conceptIds ?? []) {
      approvedByConcept.set(cid, (approvedByConcept.get(cid) ?? 0) + 1);
    }
  }

  const eligible = [];
  for (const concept of concepts) {
    if ((approvedByConcept.get(concept.id) ?? 0) === 0) continue;
    if (coveredBy(concept.id) !== null) continue;
    eligible.push(concept.id);
  }

  console.log(
    `THE FREEZE RULE, re-applied: a summary is eligible where at least one bank\n` +
      `question that tests its concept is 'approved'.\n`,
  );
  console.log(`${eligible.length} concept(s) are eligible and not currently covered:\n`);
  for (const id of eligible) {
    console.log(`  ${id}  (${approvedByConcept.get(id)} approved question(s))`);
    console.log(`     node scripts/freeze-lesson-carry.mjs --show ${id}`);
  }
  console.log(
    `\nELIGIBLE IS NOT CLEARED. This wrote nothing. Being newly eligible means the\n` +
      `evidence base moved; it says nothing about whether anyone has read the\n` +
      `sentence. Read each one, then --clear it.`,
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// --clear <id> --pin <fp> --by "<name>" — the ONLY write path. One row.
// ---------------------------------------------------------------------------

const clearId = flag("--clear");
if (clearId === undefined) {
  console.error(
    `unknown arguments: ${argv.join(" ")}\n\n` +
      `  node scripts/freeze-lesson-carry.mjs                  # --check (default)\n` +
      `  node scripts/freeze-lesson-carry.mjs --show <id>\n` +
      `  node scripts/freeze-lesson-carry.mjs --clear <id> --pin <fp> --by "<name>"\n` +
      `  node scripts/freeze-lesson-carry.mjs --propose\n`,
  );
  process.exit(1);
}

function refuse(why) {
  console.error(`refusing to write: ${why}`);
  process.exit(1);
}

// ONE ROW. Not a stylistic limit — batch is the failure mode this rewrite
// exists to remove, so it is refused at the argument level.
if (countFlag("--clear") > 1) refuse("--clear may be given exactly once. One row per reading.");
if (clearId === "") refuse("--clear needs a concept id");

const concept = byId.get(clearId);
if (concept === undefined) refuse(`no such concept in content/concepts.json: ${clearId}`);

// Never invents a carry. A concept the freeze never covered comes in through
// --propose → a human reading it → --clear, and this check is what keeps
// --clear from being a back door into that decision.
if (!frozen.has(clearId) && !signed.has(clearId)) {
  refuse(
    `${clearId} has never been carried. Run --propose to see whether the freeze rule\n` +
      `  now covers it; clearing an uncarried concept here would make this script the\n` +
      `  place that decides what the classroom carries, which is the thing it must not be.`,
  );
}

const by = flag("--by");
if (by === undefined || by.trim().length === 0) {
  refuse(`--by "<your name>" is required. A pin with nobody behind it is not a clearance.`);
}
if (machineSigners.has(by.trim().toLowerCase())) {
  refuse(
    `--by "${by}" is not a person. This row records who read the sentence; if the\n` +
      `  honest answer is "a script did", then the answer is that it is not cleared.`,
  );
}

const claimed = flag("--pin");
const live = fingerprint(concept.summaryBg);
if (claimed === undefined || claimed.trim().length === 0) {
  console.error(`refusing to write: --pin is required.\n`);
  console.error(`  This script will not compute the pin it writes. Read the sentence first:\n`);
  console.error(`    node scripts/freeze-lesson-carry.mjs --show ${clearId}\n`);
  process.exit(1);
}
if (claimed.trim() !== live) {
  console.error(`refusing to write: --pin ${claimed} does not match this summary.\n`);
  console.error(`  The sentence in content/concepts.json fingerprints to ${live}.`);
  console.error(`  Either you are clearing a sentence that has changed since you read it,`);
  console.error(`  or you transcribed it wrong. Re-read it:\n`);
  console.error(`    node scripts/freeze-lesson-carry.mjs --show ${clearId}\n`);
  process.exit(1);
}

if (coveredBy(clearId) !== null) {
  console.log(`${clearId} is already covered (${coveredBy(clearId)}). Nothing written.`);
  process.exit(0);
}

const at = new Date().toISOString().slice(0, 10);
signed.set(clearId, { pin: live, by: by.trim(), at });

const rows = [...signed.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(
    ([id, sig]) =>
      `  // „${sanitize(byId.get(id)?.summaryBg ?? "").slice(0, 96)}…"\n` +
      `  "${id}": { pin: "${sig.pin}", by: "${sig.by}", at: "${sig.at}" },`,
  )
  .join("\n");

const rewritten = source.replace(CLEARED_BLOCK_RE, (_m, head, _body, tail) => `${head}\n${rows}\n${tail}`);
if (rewritten === source) refuse("could not splice CLEARED_SINCE_FREEZE — file shape changed");

writeFileSync(CARRY_FILE, rewritten, "utf8");
console.log(`\ncleared ${clearId} — by ${by.trim()} on ${at}, pin ${live}`);
console.log(`  „${sanitize(concept.summaryBg)}"`);
console.log(`\nwrote 1 row to ${path.relative(process.cwd(), CARRY_FILE)}`);
