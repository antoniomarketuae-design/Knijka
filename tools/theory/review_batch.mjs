/**
 * review_batch.mjs — THEO-5 founder review tool (doc 64 / doc 65 queue).
 *
 * The ONLY way content graduates: the founder reads a batch, then passes an
 * EXPLICIT id list here. No auto-approval exists — there is deliberately no
 * `--all` flag. needs-review items are refused outright (they belong to the
 * existing dev-only /review admin UI, platform/src/app/(dashboard)/review).
 *
 * Commands:
 *   list    [--topic <slug>] [--clean|--flagged]         id overview
 *   show    <qid...> | --topic <slug> [--clean|--flagged] [--out <file>]
 *           full question text (options + key + explanation + flags);
 *           --out writes UTF-8 markdown (Windows console encoding is unkind)
 *   approve <qid...> [--from-file <path>] [--force] [--dry-run]
 *           flip draft → approved for exactly the ids given. Re-runs every
 *           mechanical check live (verify_drafts.mjs is the single source of
 *           truth); refuses FLAGGED ids without --force; all-or-nothing: any
 *           refused id aborts the whole batch before a single byte is written.
 *
 * Write safety: surgical text replacement of the one `"status": "draft"`
 * inside the target question's block (file formatting fully preserved, minimal
 * git diff), then a parse-back verification proving the file changed in
 * EXACTLY the intended statuses and nothing else, then atomic tmp+rename
 * (with the Windows EPERM retry, mirroring modules/content-admin/io.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  REPO_ROOT,
  loadContent,
  normWs,
  runVerification,
} from "./verify_drafts.mjs";

// ---------------------------------------------------------------------------
// Pure text surgery (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Return the [start, end) span of the question block owning `qid` inside a
 * questions-file text. A block runs from its `"id": "<qid>"` key to the next
 * question-id key (`"id": "q-…"`) or EOF. Option ids are single letters and
 * quotes inside JSON strings are escaped, so the pattern cannot false-match.
 */
export function questionSpan(fileText, qid) {
  const marker = `"id": ${JSON.stringify(qid)}`;
  const start = fileText.indexOf(marker);
  if (start === -1) return null;
  if (fileText.indexOf(marker, start + marker.length) !== -1) {
    throw new Error(`id "${qid}" appears more than once in the file`);
  }
  const next = fileText.slice(start + marker.length).search(/"id":\s*"q-/);
  const end = next === -1 ? fileText.length : start + marker.length + next;
  return { start, end };
}

/**
 * Flip `"status": "<from>"` → `"status": "<to>"` inside qid's block only.
 * Throws when the block or the expected status key is missing/ambiguous.
 */
export function flipStatusInText(fileText, qid, from = "draft", to = "approved") {
  const span = questionSpan(fileText, qid);
  if (!span) throw new Error(`id "${qid}" not found in file`);
  const block = fileText.slice(span.start, span.end);
  const key = `"status": ${JSON.stringify(from)}`;
  const first = block.indexOf(key);
  if (first === -1) throw new Error(`"${qid}": no "status": "${from}" in its block`);
  if (block.indexOf(key, first + key.length) !== -1) {
    throw new Error(`"${qid}": "status": "${from}" is ambiguous in its block`);
  }
  const newBlock = block.slice(0, first) + `"status": ${JSON.stringify(to)}` + block.slice(first + key.length);
  return fileText.slice(0, span.start) + newBlock + fileText.slice(span.end);
}

/**
 * Parse-back verification: `after` must parse to exactly `before` with ONLY
 * the given ids' status flipped to `to`. Returns null when OK, else the error.
 */
export function verifyFlip(beforeText, afterText, ids, to = "approved") {
  let before, after;
  try {
    before = JSON.parse(beforeText);
    after = JSON.parse(afterText);
  } catch (err) {
    return `result is not valid JSON: ${err.message}`;
  }
  if (!Array.isArray(before) || !Array.isArray(after) || before.length !== after.length) {
    return "question count changed";
  }
  const idSet = new Set(ids);
  for (let i = 0; i < before.length; i++) {
    const expected = idSet.has(before[i].id) ? { ...before[i], status: to } : before[i];
    if (JSON.stringify(expected) !== JSON.stringify(after[i])) {
      return `question ${before[i].id ?? `[${i}]`} changed beyond the intended status flip`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Atomic write (Windows-safe, mirrors content-admin/io.ts)
// ---------------------------------------------------------------------------

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function renameWithRetry(from, to, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      if (i === attempts - 1) throw err;
      sleepSync(40);
    }
  }
}

function writeFileAtomic(target, text) {
  const tmp = path.join(path.dirname(target), `.${path.basename(target)}.tmp-${process.pid}-${Date.now()}`);
  fs.writeFileSync(tmp, text, "utf8");
  try {
    renameWithRetry(tmp, target);
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch { /* best effort */ }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Shared lookup
// ---------------------------------------------------------------------------

function indexQuestions(content) {
  const byId = new Map(); // qid -> { question, slug }
  for (const [slug, questions] of content.questionsByTopic) {
    for (const q of questions) byId.set(q.id, { question: q, slug });
  }
  return byId;
}

function parseArgs(argv) {
  const flags = new Set();
  const values = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--topic" || a === "--out" || a === "--from-file" || a === "--root") {
      values[a.slice(2)] = argv[++i];
    } else if (a.startsWith("--")) {
      flags.add(a.slice(2));
    } else {
      positional.push(a);
    }
  }
  return { flags, values, positional };
}

function formatIssues(issuesById, qid) {
  const issues = issuesById.get(qid) ?? [];
  return issues.map((i) => `${i.code}: ${i.detail}`);
}

/** flagged-issue lookup from a verification result */
function issueMap(verification) {
  const map = new Map();
  for (const topic of verification.topics) {
    for (const q of topic.flagged) map.set(q.id, q.issues);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function selectByTopic(content, verification, slug, flags) {
  const topic = verification.topics.find((t) => t.slug === slug);
  if (!topic) {
    console.error(`unknown topic slug "${slug}". Known: ${verification.topics.map((t) => t.slug).join(", ")}`);
    process.exit(1);
  }
  if (flags.has("clean")) return topic.clean.map((q) => q.id);
  if (flags.has("flagged")) return topic.flagged.map((q) => q.id);
  return [...topic.clean, ...topic.flagged].map((q) => q.id);
}

function cmdList(content, verification, args) {
  const topics = args.values.topic
    ? verification.topics.filter((t) => t.slug === args.values.topic)
    : verification.topics;
  for (const topic of topics) {
    console.log(`${topic.slug} — ${topic.clean.length} clean / ${topic.flagged.length} flagged / ${topic.needsReview} needs-review (UI)`);
    if (!args.flags.has("flagged")) for (const q of topic.clean) console.log(`  CLEAN   ${q.id}`);
    if (!args.flags.has("clean")) {
      for (const q of topic.flagged) {
        console.log(`  FLAGGED ${q.id}  [${q.issues.map((i) => i.code).join(", ")}]`);
      }
    }
  }
}

function renderQuestion(entry, issues) {
  const q = entry.question;
  const out = [];
  out.push(`### \`${q.id}\` — ${q.points}т ${q.type} (${entry.slug}) — status: ${q.status}`);
  out.push("");
  out.push(normWs(q.textBg));
  out.push("");
  for (const o of q.options) {
    out.push(`- ${o.correct ? "**[X]**" : "[ ]"} ${o.id}) ${normWs(o.textBg)}`);
  }
  out.push("");
  out.push(`Обяснение: ${normWs(q.explanationBg)}`);
  out.push(`lawRefs: ${q.lawRefs.map((r) => `${r.act} ${r.ref}`).join("; ")}`);
  out.push(`concepts: ${q.conceptIds.join(", ")}`);
  if (issues.length > 0) {
    out.push("");
    out.push("FLAGS:");
    for (const i of issues) out.push(`- ${i}`);
  }
  out.push("");
  return out.join("\n");
}

function cmdShow(content, verification, args) {
  const byId = indexQuestions(content);
  const issuesById = issueMap(verification);
  const ids = args.values.topic
    ? selectByTopic(content, verification, args.values.topic, args.flags)
    : args.positional;
  if (ids.length === 0) {
    console.error("show: pass question ids or --topic <slug> [--clean|--flagged]");
    process.exit(1);
  }
  const chunks = [];
  for (const qid of ids) {
    const entry = byId.get(qid);
    if (!entry) {
      console.error(`unknown question id "${qid}"`);
      process.exit(1);
    }
    chunks.push(renderQuestion(entry, formatIssues(issuesById, qid)));
  }
  const text = chunks.join("\n---\n\n");
  if (args.values.out) {
    fs.writeFileSync(args.values.out, `${text}\n`, "utf8");
    console.log(`wrote ${ids.length} questions to ${args.values.out}`);
  } else {
    console.log(text);
  }
}

function readIdsFile(file) {
  return fs
    .readFileSync(file, "utf8")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("#"));
}

function cmdApprove(content, verification, args) {
  const byId = indexQuestions(content);
  const issuesById = issueMap(verification);
  const ids = [...new Set([...args.positional, ...(args.values["from-file"] ? readIdsFile(args.values["from-file"]) : [])])];
  if (ids.length === 0) {
    console.error("approve: pass explicit question ids (arguments or --from-file <path>). There is no --all, by design.");
    process.exit(1);
  }

  // Gate phase — all-or-nothing: collect every refusal before touching disk.
  const refusals = [];
  for (const qid of ids) {
    const entry = byId.get(qid);
    if (!entry) {
      refusals.push(`${qid}: unknown id`);
      continue;
    }
    const status = entry.question.status;
    if (status === "approved") refusals.push(`${qid}: already approved`);
    else if (status === "needs-review") {
      refusals.push(`${qid}: status needs-review — that pass belongs to the /review admin UI, not this script`);
    } else if (status !== "draft") refusals.push(`${qid}: unexpected status "${status}"`);
    else if (verification.flaggedIds.has(qid) && !args.flags.has("force")) {
      refusals.push(`${qid}: FLAGGED — rerun with --force only after reading:\n    ${formatIssues(issuesById, qid).join("\n    ")}`);
    }
  }
  if (refusals.length > 0) {
    console.error(`REFUSED — nothing was written. ${refusals.length} problem(s):`);
    for (const r of refusals) console.error(`  - ${r}`);
    process.exit(1);
  }

  // Group per file, flip in text, parse-back verify, atomic write.
  const bySlug = new Map();
  for (const qid of ids) {
    const { slug } = byId.get(qid);
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(qid);
  }

  for (const [slug, slugIds] of bySlug) {
    const file = path.join(content.contentDir, "questions", `${slug}.json`);
    const before = fs.readFileSync(file, "utf8");
    let after = before;
    for (const qid of slugIds) after = flipStatusInText(after, qid, "draft", "approved");
    const problem = verifyFlip(before, after, slugIds, "approved");
    if (problem) {
      console.error(`ABORT on ${slug}.json — parse-back verification failed: ${problem}`);
      console.error("No further files were written.");
      process.exit(1);
    }
    if (args.flags.has("dry-run")) {
      console.log(`[dry-run] ${slug}.json: would approve ${slugIds.length} → ${slugIds.join(", ")}`);
    } else {
      writeFileAtomic(file, after);
      console.log(`${slug}.json: approved ${slugIds.length} → ${slugIds.join(", ")}`);
    }
  }

  if (!args.flags.has("dry-run")) {
    console.log("\nNext: cd platform && npm run validate:content");
    console.log("Then: node tools/theory/verify_drafts.mjs --report   (refresh doc 65)");
  }
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (!["list", "show", "approve"].includes(command)) {
    console.log("usage:");
    console.log("  node tools/theory/review_batch.mjs list    [--topic <slug>] [--clean|--flagged]");
    console.log("  node tools/theory/review_batch.mjs show    <qid...> | --topic <slug> [--clean|--flagged] [--out <file>]");
    console.log("  node tools/theory/review_batch.mjs approve <qid...> [--from-file <path>] [--force] [--dry-run]");
    process.exit(command ? 1 : 0);
  }

  // --root <dir>: alternate repo root (testing against a copy; default: this repo)
  const root = args.values.root ? path.resolve(args.values.root) : REPO_ROOT;
  const content = loadContent(root);
  const verification = runVerification(root);
  if (command === "list") cmdList(content, verification, args);
  else if (command === "show") cmdShow(content, verification, args);
  else cmdApprove(content, verification, args);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
