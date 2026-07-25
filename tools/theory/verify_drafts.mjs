/**
 * verify_drafts.mjs — THEO-5 Stage 5 prep (doc 64): MECHANICAL verification of
 * every status:"draft" theory question, so the founder's human review of the
 * 726 drafts is fast. This tool NEVER changes content — it only reads and
 * reports. draft→approved stays human-only (review_batch.mjs, explicit ids).
 *
 * Checks (mechanical only — flag, never judge):
 *   structural            options/correct-count/points sanity (guard; the zod
 *                         validator upstream should already keep this at zero)
 *   concept-unresolved    conceptIds missing from concepts.json
 *   dead-law-ref          lawRef not anchored in the concepts+signs bank
 *                         (ADR-002: the bank is the retrieval ground truth)
 *   uncertain-law-ref     '?'-suffixed ref on a DRAFT (schema rule 2 says such
 *                         items belong in needs-review)
 *   option-dup-text       two options with identical normalized text
 *   correct-length-tell   correct option(s) dramatically longer than the
 *                         distractors (test-wise students pick the long one)
 *   trivial-explanation   explanationBg too short / repeats question or key
 *   duplicate             exact normalized-text duplicate of another question
 *   near-duplicate        token-Jaccard >= NEAR_DUP_THRESHOLD vs another item
 *
 * Whole-FILE checks (answer_bias.mjs, audit H-1/H-2) — a question can be
 * flawless on its own and still leak as part of a set:
 *   position-bias         correct answer clusters in one option slot
 *   length-tell           correct answer is the longest one too often
 * These run over EVERY question in the file, not only the drafts: the leak is
 * a property of what the student sees, and needs-review items are served in
 * practice too.
 *
 * Info tier (reported, NOT blocking): mild-length-tell.
 *
 * CLI:
 *   node tools/theory/verify_drafts.mjs            summary to stdout
 *   node tools/theory/verify_drafts.mjs --report   also (re)write
 *                                                  docs/development/65_DRAFT_REVIEW_QUEUE.md
 *   node tools/theory/verify_drafts.mjs --strict   exit 1 on any blocking
 *                                                  answer-bias finding
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ALPHA_BLOCK,
  ALPHA_WARN,
  MIN_N_FOR_GATE,
  POOLED_SCOPE,
  analyzeAnswerBias,
  describeFinding,
} from "./answer_bias.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..", "..");
const REPORT_PATH = path.join(REPO_ROOT, "docs", "development", "65_DRAFT_REVIEW_QUEUE.md");

// Per-question length tell. The audit (H-1) was right that these numbers were
// reverse-fitted to the bank they were measuring — "tuned so ~52 drafts flag"
// is a description, not a threshold, and it caught 13.9% of the exploitable
// singles. The authority for the length leak is now the per-FILE statistical
// gate in answer_bias.mjs, which needs no tuning at all. What survives here is
// a per-question REVIEW HINT: the strong tier stays where it was (a 2.2x, 40-
// char gap is indefensible on any single question and should block approval),
// while the info tier drops to the audit's suggested 1.35x / 15 chars so a
// reviewer's eye lands on the drift long before the file-level gate fires.
const STRONG_TELL_RATIO = 2.2;
const STRONG_TELL_DELTA = 40;
const MILD_TELL_RATIO = 1.35;
const MILD_TELL_DELTA = 15;
const NEAR_DUP_THRESHOLD = 0.72;
const MIN_EXPLANATION_CHARS = 40;

// Same shape as modules/content-admin/logic.ts REVIEW_PREFIX_RE.
export const REVIEW_PREFIX_RE = /^\s*\[REVIEW:([\s\S]*?)\]\s*/;
export const stripReviewPrefix = (text) => text.replace(REVIEW_PREFIX_RE, "");

// ---------------------------------------------------------------------------
// Text normalization + similarity
// ---------------------------------------------------------------------------

export const normWs = (s) => String(s).replace(/\s+/g, " ").trim();

/** Aggressive normalization for equality/similarity: case, punctuation, ws. */
export function normText(s) {
  return String(s)
    .toLowerCase()
    .replace(/[„“”"'«».,;:!?()\-–—/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenSet(s) {
  return new Set(normText(s).split(" ").filter((w) => w.length > 2));
}

export function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter += 1;
  return inter / (a.size + b.size - inter);
}

// ---------------------------------------------------------------------------
// Law-ref bank (concepts + signs = the ADR-002 retrieval ground truth)
// ---------------------------------------------------------------------------

export function buildLawBank(concepts, signs) {
  const set = new Set();
  for (const items of [concepts, signs]) {
    for (const item of items) {
      for (const r of item.lawRefs ?? []) set.add(`${normWs(r.act)}||${normWs(r.ref)}`);
    }
  }
  return { set, arr: [...set].map((k) => k.split("||")) };
}

export const isUncertainRef = (ref) => /\?\s*$/.test(String(ref));

/**
 * A question ref is anchored when the SAME act appears in the bank with the
 * same ref, or with a ref that extends/shortens it at a ", "/" " boundary
 * ("чл. 47" anchors to "чл. 47, ал. 1" and vice versa). '?' suffix stripped
 * before lookup — uncertainty is its own separate flag.
 */
export function isRefAnchored(bank, act, ref) {
  const a = normWs(act);
  const r = normWs(ref).replace(/\s*\?$/, "");
  if (bank.set.has(`${a}||${r}`)) return true;
  return bank.arr.some(
    ([ba, br]) =>
      ba === a &&
      (br === r ||
        br.startsWith(`${r},`) ||
        br.startsWith(`${r} `) ||
        r.startsWith(`${br},`) ||
        r.startsWith(`${br} `)),
  );
}

// ---------------------------------------------------------------------------
// Per-question mechanical checks
// ---------------------------------------------------------------------------

function meanLength(options) {
  return options.reduce((sum, o) => sum + o.textBg.length, 0) / options.length;
}

/**
 * All per-question checks. Returns { issues, info } — `issues` block script
 * approval (without --force), `info` entries never block.
 */
export function checkQuestion(question, ctx) {
  const issues = [];
  const info = [];
  const options = Array.isArray(question.options) ? question.options : [];

  // structural guard (validator upstream should keep these at zero)
  const correct = options.filter((o) => o.correct === true);
  if (options.length < 2) issues.push({ code: "structural", detail: "fewer than 2 options" });
  if (question.type === "single" && correct.length !== 1) {
    issues.push({ code: "structural", detail: `single with ${correct.length} correct options` });
  }
  if (question.type === "multi" && correct.length < 2) {
    issues.push({ code: "structural", detail: `multi with ${correct.length} correct options` });
  }
  if (![1, 2, 3].includes(question.points)) {
    issues.push({ code: "structural", detail: `points = ${question.points}` });
  }

  for (const cid of question.conceptIds ?? []) {
    if (!ctx.conceptIds.has(cid)) {
      issues.push({ code: "concept-unresolved", detail: `unknown concept "${cid}"` });
    }
  }

  for (const r of question.lawRefs ?? []) {
    if (!isRefAnchored(ctx.lawBank, r.act, r.ref)) {
      issues.push({ code: "dead-law-ref", detail: `${r.act} ${r.ref} — not in concepts/signs bank` });
    }
    if (isUncertainRef(r.ref) && question.status === "draft") {
      issues.push({
        code: "uncertain-law-ref",
        detail: `"${r.ref}" — '?' ref on a draft (schema rule 2: belongs in needs-review)`,
      });
    }
  }

  const seenOption = new Map();
  for (const o of options) {
    const key = normText(o.textBg);
    if (seenOption.has(key)) {
      issues.push({
        code: "option-dup-text",
        detail: `options "${seenOption.get(key)}" and "${o.id}" have identical text`,
      });
    } else {
      seenOption.set(key, o.id);
    }
  }

  const incorrect = options.filter((o) => o.correct !== true);
  if (correct.length > 0 && incorrect.length > 0) {
    const mc = meanLength(correct);
    const mi = meanLength(incorrect);
    if (mc > STRONG_TELL_RATIO * mi && mc - mi > STRONG_TELL_DELTA) {
      issues.push({
        code: "correct-length-tell",
        detail: `correct avg ${Math.round(mc)} chars vs distractor avg ${Math.round(mi)} — the long answer gives itself away`,
      });
    } else if (mc > MILD_TELL_RATIO * mi && mc - mi > MILD_TELL_DELTA) {
      info.push({ code: "mild-length-tell", detail: `correct ${Math.round(mc)} vs ${Math.round(mi)} chars` });
    }
  }

  const explanation = normText(stripReviewPrefix(question.explanationBg ?? ""));
  if (explanation.length < MIN_EXPLANATION_CHARS) {
    issues.push({ code: "trivial-explanation", detail: `explanationBg only ${explanation.length} chars` });
  } else if (explanation === normText(question.textBg)) {
    issues.push({ code: "trivial-explanation", detail: "explanationBg merely repeats the question" });
  } else if (correct.some((o) => normText(o.textBg) === explanation)) {
    issues.push({ code: "trivial-explanation", detail: "explanationBg merely repeats the correct option" });
  }

  return { issues, info };
}

/**
 * Whole-bank duplicate scan (ALL 1,016 questions, not only drafts — a draft
 * duplicating an approved/needs-review item must surface too).
 * Returns pairs sorted by similarity desc. Flag, never judge: the audits show
 * deliberate contrast pairs exist.
 */
export function findDuplicatePairs(questions, threshold = NEAR_DUP_THRESHOLD) {
  const norms = questions.map((q) => normText(q.textBg));
  const toks = questions.map((q) => tokenSet(q.textBg));
  const pairs = [];
  for (let i = 0; i < questions.length; i++) {
    for (let j = i + 1; j < questions.length; j++) {
      const exact = norms[i] !== "" && norms[i] === norms[j];
      const sim = exact ? 1 : jaccard(toks[i], toks[j]);
      if (exact || sim >= threshold) {
        pairs.push({
          aId: questions[i].id,
          bId: questions[j].id,
          aStatus: questions[i].status,
          bStatus: questions[j].status,
          similarity: Number(sim.toFixed(2)),
          exact,
        });
      }
    }
  }
  return pairs.sort((a, b) => b.similarity - a.similarity);
}

// ---------------------------------------------------------------------------
// Content loading + the full verification run
// ---------------------------------------------------------------------------

export function loadContent(repoRoot = REPO_ROOT) {
  const contentDir = path.join(repoRoot, "content");
  const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(contentDir, rel), "utf8"));
  const topics = readJson("topics.json").slice().sort((a, b) => a.order - b.order);
  const concepts = readJson("concepts.json");
  const signs = readJson(path.join("signs", "signs.json"));
  const questionsByTopic = new Map(); // slug -> Question[]
  for (const topic of topics) {
    const file = path.join(contentDir, "questions", `${topic.slug}.json`);
    questionsByTopic.set(topic.slug, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : []);
  }
  return { contentDir, topics, concepts, signs, questionsByTopic };
}

export function runVerification(repoRoot = REPO_ROOT) {
  const { topics, concepts, signs, questionsByTopic } = loadContent(repoRoot);
  const ctx = {
    lawBank: buildLawBank(concepts, signs),
    conceptIds: new Set(concepts.map((c) => c.id)),
  };

  const allQuestions = [...questionsByTopic.values()].flat();
  const duplicates = findDuplicatePairs(allQuestions);
  const dupPartners = new Map(); // qid -> [{partner, similarity, exact}]
  for (const p of duplicates) {
    for (const [self, partner] of [[p.aId, p.bId], [p.bId, p.aId]]) {
      if (!dupPartners.has(self)) dupPartners.set(self, []);
      dupPartners.get(self).push({ partner, similarity: p.similarity, exact: p.exact });
    }
  }

  const topicResults = [];
  const flaggedIds = new Set();
  const totals = { draft: 0, "needs-review": 0, approved: 0, clean: 0, flagged: 0 };

  for (const topic of topics) {
    const questions = questionsByTopic.get(topic.slug) ?? [];
    const clean = [];
    const flagged = [];
    const infos = [];
    let needsReview = 0;

    for (const q of questions) {
      if (q.status === "needs-review") needsReview += 1;
      totals[q.status] = (totals[q.status] ?? 0) + 1;
      if (q.status !== "draft") continue;

      const { issues, info } = checkQuestion(q, ctx);
      for (const d of dupPartners.get(q.id) ?? []) {
        issues.push({
          code: d.exact ? "duplicate" : "near-duplicate",
          detail: `${d.exact ? "exact text duplicate of" : `~${Math.round(d.similarity * 100)}% similar to`} ${d.partner}`,
        });
      }
      if (info.length > 0) infos.push({ id: q.id, info });
      if (issues.length > 0) {
        flagged.push({ id: q.id, points: q.points, type: q.type, textBg: q.textBg, issues });
        flaggedIds.add(q.id);
        totals.flagged += 1;
      } else {
        clean.push({ id: q.id, points: q.points, type: q.type, textBg: q.textBg });
        totals.clean += 1;
      }
    }

    topicResults.push({
      slug: topic.slug,
      titleBg: topic.titleBg,
      total: questions.length,
      needsReview,
      clean,
      flagged,
      infos,
    });
  }

  return {
    generatedAt: new Date().toISOString().slice(0, 10),
    totals,
    topics: topicResults,
    duplicates,
    flaggedIds,
    // Whole-file answer-leak sweep, keyed by topic slug (+ the pooled bank).
    // Not folded into the per-question issues on purpose: no single question
    // is at fault for a file that answers (a) 37 times out of 37.
    bias: analyzeAnswerBias(questionsByTopic),
  };
}

// ---------------------------------------------------------------------------
// Report (docs/development/65_DRAFT_REVIEW_QUEUE.md)
// ---------------------------------------------------------------------------

const CLEAN_SECONDS = 20; // read + tick
const FLAGGED_SECONDS = 120; // read + judge the flag + possibly edit

function minutes(n) {
  return Math.max(1, Math.round(n / 60));
}

function line(q) {
  return `- \`${q.id}\` · ${q.points}т ${q.type} — ${normWs(q.textBg)}`;
}

export function buildReport(result) {
  const t = result.totals;
  const grandMinutes = minutes(t.clean * CLEAN_SECONDS + t.flagged * FLAGGED_SECONDS);
  // Review efficiency: cleanest share first — fast approvals build momentum.
  const cleanShare = (t) => t.clean.length / (t.clean.length + t.flagged.length || 1);
  const ordered = [...result.topics].sort((a, b) => cleanShare(b) - cleanShare(a));

  const out = [];
  // The heading counts the queue as it stands, not as it stood the day the
  // pass started (audit L-1): a generated file whose own title is stale by 726
  // is worse than no file, because it reads as authoritative.
  out.push(`# 65 · Draft Review Queue — ${t.draft} drafts awaiting graduation (THEO-5)`);
  out.push("");
  out.push("> **GENERATED FILE** — rebuild with `node tools/theory/verify_drafts.mjs --report`");
  out.push("> after any content edit or approval batch. Manual edits will be overwritten.");
  out.push(`> Generated: ${result.generatedAt}. Mechanical checks only — no machine ever`);
  out.push("> judges content. **draft → approved is HUMAN-ONLY** (the founder).");
  out.push("");
  out.push("## 1. Totals");
  out.push("");
  out.push("| status | count |");
  out.push("|---|---|");
  out.push(`| draft (this queue) | ${t.draft} |`);
  out.push(`| — CLEAN (passed every mechanical check) | ${t.clean} |`);
  out.push(`| — FLAGGED (at least one precise issue) | ${t.flagged} |`);
  out.push(`| needs-review (separate pass — see §3) | ${t["needs-review"]} |`);
  out.push(`| approved | ${t.approved} |`);
  out.push("");
  out.push(`Estimated total review time: **~${grandMinutes} min** (${CLEAN_SECONDS}s per clean, ${FLAGGED_SECONDS}s per flagged), splittable per topic below.`);
  out.push("");
  out.push("## 2. How to review (the workflow)");
  out.push("");
  out.push("1. Pick a topic batch below (sorted cleanest-first — fast wins first).");
  out.push("2. Read the full questions of the batch (options + key + explanation):");
  out.push("   `node tools/theory/review_batch.mjs show --topic <slug> --clean --out batch.md`");
  out.push("   then open `batch.md` in the editor (avoids console-encoding pain).");
  out.push("3. Collect the ids you approve into a list (file or arguments).");
  out.push("4. Approve them explicitly:");
  out.push("   `node tools/theory/review_batch.mjs approve q-... q-...` or `--from-file ids.txt`");
  out.push("   The script re-runs every mechanical check live, refuses non-draft ids,");
  out.push("   and refuses FLAGGED ids unless `--force`. It never approves in bulk");
  out.push("   without explicit ids — no `--all` exists, by design.");
  out.push("5. FLAGGED items: fix the issue by editing the question JSON (or decide the");
  out.push("   flag is a false positive), then approve with `--force` if the flag stands");
  out.push("   but you accept it knowingly.");
  out.push("6. After a batch: `cd platform && npm run validate:content`, then regenerate");
  out.push("   this report.");
  out.push("");
  out.push("## 3. The ~290 flagged questions from PROGRESS §7 — cross-reference");
  out.push("");
  out.push(`The list EXISTS AS DATA: it is exactly the ${t["needs-review"]} questions with`);
  out.push('`status: "needs-review"`. 288 of them carry the machine-visible markers');
  out.push("('?'-suffixed lawRef or a `[REVIEW: …]` note); the adversarial audits'");
  out.push("`flaggedLegal` tallies (`content/audits/*.audit.json`) account for 152 —");
  out.push("the rest were born needs-review at generation time per schema rule 2");
  out.push("(honest '?' article guesses). They are NOT part of this draft queue and");
  out.push("review_batch.mjs REFUSES to touch them: they are reviewed in the existing");
  out.push("dev-only admin UI at `/review` (approve / edit / reject, validated atomic");
  out.push("writes). Per-topic needs-review counts:");
  out.push("");
  out.push("| topic | needs-review |");
  out.push("|---|---|");
  for (const topic of result.topics) {
    if (topic.needsReview > 0) out.push(`| ${topic.slug} | ${topic.needsReview} |`);
  }
  out.push("");
  out.push("## 4. Review batches per topic (cleanest share first)");
  out.push("");
  for (const topic of ordered) {
    const est = minutes(topic.clean.length * CLEAN_SECONDS + topic.flagged.length * FLAGGED_SECONDS);
    out.push(`### ${topic.titleBg} (\`${topic.slug}\`) — ${topic.clean.length} clean · ${topic.flagged.length} flagged · ~${est} min`);
    out.push("");
    out.push(`File: \`content/questions/${topic.slug}.json\``);
    out.push("");
    if (topic.clean.length > 0) {
      out.push(`**CLEAN (${topic.clean.length}) — fast approvals:**`);
      out.push("");
      for (const q of topic.clean) out.push(line(q));
      out.push("");
    }
    if (topic.flagged.length > 0) {
      out.push(`**FLAGGED (${topic.flagged.length}) — each with its precise issue:**`);
      out.push("");
      for (const q of topic.flagged) {
        out.push(line(q));
        for (const issue of q.issues) out.push(`  - **${issue.code}**: ${issue.detail}`);
      }
      out.push("");
    }
  }
  out.push("## 5. Answer-leak sweep (whole file, every status — H-1 / H-2)");
  out.push("");
  out.push("Two ways a bank betrays its own answers to a student who never opened");
  out.push("a law book: the correct option keeps landing in the same slot, or it is");
  out.push("visibly the longest one. Both have already been hand-fixed once and");
  out.push("regenerated by the next content wave — hence a mechanical gate that");
  out.push("`platform/scripts/validate-content.mjs` also runs in CI, so a future");
  out.push("generation run reddens the build instead of shipping the leak.");
  out.push("");
  out.push(`Thresholds: blocking at p < ${ALPHA_BLOCK}, warning at p < ${ALPHA_WARN},`);
  out.push(`no gate below ${MIN_N_FOR_GATE} questions (chi-square needs ~5 expected per slot).`);
  out.push("");
  const biasLines = [...result.bias.blocking, ...result.bias.warnings];
  if (biasLines.length === 0) {
    out.push("**Clean.** Every file (and the pooled bank) sits inside chance on both");
    out.push("statistics. Per-file numbers:");
  } else {
    out.push("| severity | file | finding |");
    out.push("|---|---|---|");
    for (const f of biasLines) {
      const scope = f.scope === POOLED_SCOPE ? "**whole bank**" : `\`${f.scope}\``;
      out.push(`| ${f.severity === "block" ? "**BLOCK**" : "warn"} | ${scope} | ${describeFinding(f)} |`);
    }
    out.push("");
    out.push("Per-file numbers:");
  }
  out.push("");
  out.push("| file | singles | correct at (a…) | longest-correct | expected |");
  out.push("|---|---|---|---|---|");
  for (const f of result.bias.findings) {
    if (f.code !== "length-tell") continue;
    const pos = result.bias.findings.find(
      (p) => p.scope === f.scope && p.kind === "single-correct",
    );
    const slots = pos ? pos.observed.join(" / ") : "—";
    const scope = f.scope === POOLED_SCOPE ? "**whole bank**" : `\`${f.scope}\``;
    out.push(
      `| ${scope} | ${f.n} | ${slots} | ${f.observed} (${f.sharePct.toFixed(1)}%) | ${f.expectedSharePct.toFixed(1)}% |`,
    );
  }
  out.push("");
  out.push("## 6. Duplicates and near-duplicates (whole bank — pairs, no judgment)");
  out.push("");
  if (result.duplicates.length === 0) {
    out.push("None found at the current threshold.");
  } else {
    out.push("The audits show deliberate contrast pairs exist — the founder decides which");
    out.push("pairs are redundant and which are pedagogy. Exact pairs almost certainly");
    out.push("need one member rejected/rewritten by hand.");
    out.push("");
    out.push("| question A | question B | similarity | note |");
    out.push("|---|---|---|---|");
    for (const p of result.duplicates) {
      out.push(
        `| \`${p.aId}\` (${p.aStatus}) | \`${p.bId}\` (${p.bStatus}) | ${p.exact ? "EXACT" : `${Math.round(p.similarity * 100)}%`} | ${p.exact ? "identical normalized text" : "near-duplicate wording"} |`,
      );
    }
  }
  out.push("");
  out.push("## 7. Appendix — mild length-tell (info only, never blocks)");
  out.push("");
  out.push("Correct option noticeably longer than distractors, below the flag threshold.");
  out.push("Worth a glance while reviewing, not worth blocking on:");
  out.push("");
  const milds = result.topics.flatMap((tp) => tp.infos.map((i) => `\`${i.id}\``));
  out.push(milds.length > 0 ? milds.join(", ") : "None.");
  out.push("");
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const result = runVerification();
  const t = result.totals;

  console.log(`draft questions: ${t.draft}  (clean ${t.clean} / flagged ${t.flagged})`);
  console.log(`needs-review (separate /review UI pass): ${t["needs-review"]}`);
  console.log(`approved: ${t.approved}`);
  console.log(`duplicate/near-duplicate pairs (whole bank): ${result.duplicates.length}`);

  const counts = new Map();
  for (const topic of result.topics) {
    for (const q of topic.flagged) {
      for (const issue of q.issues) counts.set(issue.code, (counts.get(issue.code) ?? 0) + 1);
    }
  }
  if (counts.size > 0) {
    console.log("\nflag counts:");
    for (const [code, n] of [...counts].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${code.padEnd(22)} ${n}`);
    }
  }

  const { blocking, warnings } = result.bias;
  console.log(
    `\nanswer-leak sweep (whole files): ${blocking.length} blocking / ${warnings.length} warning`,
  );
  for (const f of [...blocking, ...warnings]) {
    const scope = f.scope === POOLED_SCOPE ? "whole bank" : f.scope;
    console.log(`  ${f.severity === "block" ? "BLOCK" : "warn "} ${scope}: ${describeFinding(f)}`);
  }

  if (args.includes("--report")) {
    fs.writeFileSync(REPORT_PATH, buildReport(result), "utf8");
    console.log(`\nwrote ${path.relative(REPO_ROOT, REPORT_PATH)}`);
  } else {
    console.log("\n(run with --report to regenerate docs/development/65_DRAFT_REVIEW_QUEUE.md)");
  }

  // --strict makes this script usable as a gate of its own (a pre-commit hook,
  // or a content-generation script checking its own output before it writes).
  // The real CI gate is validate-content.mjs; this is the same verdict, local.
  if (args.includes("--strict") && blocking.length > 0) {
    console.error(`\nFAIL — ${blocking.length} blocking answer-leak finding(s).`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
