/**
 * The human-signature ledger — `content/review/approvals.json`.
 *
 * THE POINT. Until now the only record that a question had been reviewed was
 * the word `approved` sitting in the row itself, and a generator wrote it. The
 * law-vs-bank audit found 1,005 rows carrying it, including 22 of the 24 whose
 * answer key is wrong and all nine that are literally unanswerable
 * (docs/education/90 §1). The flag was asserting a review that never happened.
 *
 * So authority moved out of the row. A question is human-approved when, and
 * only when, this file carries an entry that
 *   1. names a person (the authenticated reviewer, never client input),
 *   2. is dated, and
 *   3. covers the row's CONTENT HASH — so editing the row after approval
 *      silently un-approves it, loudly, at the next `validate:content`.
 *
 * The row's own `status` keeps doing its old job: where the item is in the
 * authoring pipeline. It is no longer evidence of anything a human did.
 */
import fs from "node:fs";
import path from "node:path";
import type { Question } from "@/lib/content/types";
import { CONTENT_HASH_RE, hashQuestionContent } from "./hash";
import type { ApprovalEntry, ApprovalLedger, ApprovalState, ReviewVerdict } from "./types";

if (typeof window !== "undefined") {
  throw new Error(
    "modules/content-admin/approvals is server-only — import it from server code, never from a client component",
  );
}

export const LEDGER_RELATIVE_PATH = path.join("review", "approvals.json");

const READMEBG =
  "Подписите тук са единственото доказателство, че ЧОВЕК е чел въпроса. " +
  "„status: approved“ в самия ред е само етап от конвейера — генератор може да го напише. " +
  "Всеки запис покрива contentHash на реда в момента на подписа: промени ли се редът, подписът " +
  "спира да важи и въпросът пада обратно в неодобрените. Пише се само от /review, никога на ръка.";

export function ledgerPath(contentDir: string): string {
  return path.join(contentDir, LEDGER_RELATIVE_PATH);
}

/** An empty ledger — used when the file is missing (fresh clone, tests). */
export function emptyLedger(baseline = 0): ApprovalLedger {
  return {
    version: 1,
    readmeBg: READMEBG,
    unsignedApprovedBaseline: baseline,
    baselineFrozenAt: new Date().toISOString().slice(0, 10),
    entries: [],
  };
}

function isEntry(value: unknown): value is ApprovalEntry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.questionId === "string" &&
    e.questionId.length > 0 &&
    (e.verdict === "approved" || e.verdict === "rejected") &&
    typeof e.by === "string" &&
    e.by.length > 0 &&
    typeof e.at === "string" &&
    !Number.isNaN(Date.parse(e.at)) &&
    typeof e.contentHash === "string" &&
    CONTENT_HASH_RE.test(e.contentHash) &&
    (e.noteBg === null || typeof e.noteBg === "string")
  );
}

/**
 * Read the ledger. Malformed entries are DROPPED here rather than thrown on —
 * the review page must still open when the file is damaged, and
 * `validate:content` is the gate that refuses to let a damaged ledger ship.
 */
export function readLedger(contentDir: string): ApprovalLedger {
  const file = ledgerPath(contentDir);
  if (!fs.existsSync(file)) return emptyLedger();
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  } catch {
    return emptyLedger();
  }
  if (typeof parsed !== "object" || parsed === null) return emptyLedger();
  const raw = parsed as Record<string, unknown>;
  const entries = Array.isArray(raw.entries) ? raw.entries.filter(isEntry) : [];
  return {
    version: 1,
    readmeBg: typeof raw.readmeBg === "string" ? raw.readmeBg : READMEBG,
    unsignedApprovedBaseline:
      typeof raw.unsignedApprovedBaseline === "number" && Number.isInteger(raw.unsignedApprovedBaseline)
        ? raw.unsignedApprovedBaseline
        : 0,
    baselineFrozenAt:
      typeof raw.baselineFrozenAt === "string" ? raw.baselineFrozenAt : emptyLedger().baselineFrozenAt,
    entries,
  };
}

/** questionId -> its single current signature (the ledger is last-write-wins). */
export function indexLedger(ledger: ApprovalLedger): Map<string, ApprovalEntry> {
  const byId = new Map<string, ApprovalEntry>();
  for (const entry of ledger.entries) byId.set(entry.questionId, entry);
  return byId;
}

/**
 * How a question's authority stands. The ONLY function allowed to answer
 * "has a human approved this?" — every consumer goes through it so the answer
 * cannot be given differently in two places.
 */
export function approvalStateOf(
  q: Question,
  signature: ApprovalEntry | undefined,
): ApprovalState {
  if (signature === undefined) {
    return q.status === "approved" ? { kind: "unsigned-claim" } : { kind: "unsigned" };
  }
  if (signature.verdict === "rejected") return { kind: "human-rejected", entry: signature };
  if (signature.contentHash !== hashQuestionContent(q)) {
    return { kind: "signature-stale", entry: signature };
  }
  return { kind: "human-approved", entry: signature };
}

/** The honest rule, in one place: may this row be dealt to a student? */
export function isHumanApproved(q: Question, signature: ApprovalEntry | undefined): boolean {
  return approvalStateOf(q, signature).kind === "human-approved";
}

/**
 * Replace (or add) one signature. Last write wins per question: a row that is
 * edited and re-approved gets one current entry, not a growing pile. Order is
 * kept stable by questionId so the file diffs cleanly.
 */
export function withSignature(ledger: ApprovalLedger, entry: ApprovalEntry): ApprovalLedger {
  const entries = ledger.entries.filter((e) => e.questionId !== entry.questionId);
  entries.push(entry);
  entries.sort((a, b) => (a.questionId < b.questionId ? -1 : a.questionId > b.questionId ? 1 : 0));
  return { ...ledger, entries };
}

export function makeSignature(
  q: Question,
  verdict: ReviewVerdict,
  by: string,
  noteBg: string | null = null,
  now: Date = new Date(),
): ApprovalEntry {
  return {
    questionId: q.id,
    verdict,
    by,
    at: now.toISOString(),
    contentHash: hashQuestionContent(q),
    noteBg,
  };
}

/** Stable, diff-friendly serialisation (one entry per line block). */
export function serializeLedger(ledger: ApprovalLedger): string {
  return `${JSON.stringify(ledger, null, 2)}\n`;
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** rename can transiently EPERM on Windows (AV / indexer) — retry briefly. */
function renameWithRetry(from: string, to: string, attempts = 5): void {
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

/** Write the ledger atomically (temp + rename, same volume). */
export function writeLedgerAtomic(contentDir: string, ledger: ApprovalLedger): void {
  const target = ledgerPath(contentDir);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, serializeLedger(ledger), "utf8");
  try {
    renameWithRetry(tmp, target);
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* best effort */
    }
    throw err;
  }
}
