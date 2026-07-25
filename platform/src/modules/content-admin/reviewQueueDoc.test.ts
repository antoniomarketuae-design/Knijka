/**
 * docs/development/65 freshness gate (audit L-1).
 *
 * Doc 65 is a GENERATED report of the review backlog, and the audit found it
 * stale by 73 drafts and 33 flagged items — roughly 90 minutes of founder work
 * unaccounted for. A stale generated file is worse than a missing one: it reads
 * as authoritative, and the review plan is built from its numbers.
 *
 * The generator (`node tools/theory/verify_drafts.mjs --report`) is not run
 * here — it re-implements the mechanical checks and takes seconds. Instead this
 * counts question statuses straight out of `content/questions/*.json` and
 * asserts the doc's Totals table still agrees. That is precisely the drift the
 * audit measured, and it fails loudly the moment an approval batch lands
 * without a regenerate.
 *
 * CLEAN/FLAGGED are deliberately NOT checked: reproducing them would mean
 * duplicating every mechanical check, and a second implementation of a check is
 * a second thing that can be wrong. The status counts are the load-bearing
 * numbers — everything else in the doc is derived from them.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const QUESTIONS_DIR = path.join(REPO_ROOT, "content", "questions");
const DOC = path.join(REPO_ROOT, "docs", "development", "65_DRAFT_REVIEW_QUEUE.md");

const REGENERATE = "node tools/theory/verify_drafts.mjs --report";

/** Live status counts, straight from the bank. */
function bankStatusCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of readdirSync(QUESTIONS_DIR)) {
    if (!file.endsWith(".json")) continue;
    const rows: unknown = JSON.parse(readFileSync(path.join(QUESTIONS_DIR, file), "utf8"));
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const status = (row as { status?: unknown }).status;
      if (typeof status !== "string") continue;
      counts[status] = (counts[status] ?? 0) + 1;
    }
  }
  return counts;
}

/**
 * The count on a `| <label…> | <n> |` row of the doc's Totals table. The label
 * is matched by prefix because the generator decorates it („draft (this queue)")
 * and that decoration is allowed to change without breaking the gate.
 */
function docTotal(doc: string, labelPrefix: string): number | null {
  for (const line of doc.split("\n")) {
    const m = /^\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|$/.exec(line.trim());
    if (m === null) continue;
    if (!m[1].startsWith(labelPrefix)) continue;
    return Number(m[2]);
  }
  return null;
}

describe("docs/development/65 — the generated review queue (L-1)", () => {
  const doc = readFileSync(DOC, "utf8");
  const bank = bankStatusCounts();

  it("still declares itself generated, with the rebuild command", () => {
    // If someone hand-edits the doc this banner is the only thing telling the
    // next reader their edit will be overwritten.
    expect(doc).toContain("**GENERATED FILE**");
    expect(doc).toContain(REGENERATE);
  });

  it.each([
    ["draft", "draft"],
    ["needs-review", "needs-review"],
    ["approved", "approved"],
  ])("reports the live %s count", (status, labelPrefix) => {
    const live = bank[status] ?? 0;
    const reported = docTotal(doc, labelPrefix);

    expect(reported, `doc 65 has no "${labelPrefix}" row in its Totals table`).not.toBeNull();
    expect(
      reported,
      `doc 65 is stale: it says ${reported} ${status}, the bank has ${live}. Run \`${REGENERATE}\`.`,
    ).toBe(live);
  });

  it("titles itself with the current backlog, not the day it was started", () => {
    // The generator used to hard-code "the 726-draft graduation pass", which
    // stayed in the title long after the queue drained.
    const drafts = bank.draft ?? 0;
    expect(doc.split("\n")[0]).toContain(`${drafts} drafts`);
  });
});
