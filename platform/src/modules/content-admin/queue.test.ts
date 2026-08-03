/**
 * The review queue, end to end against the REAL /content bank.
 *
 * Everything else in this module is unit-tested in memory. This file exists for
 * the parts that only fail in the real world: the content directory probe, the
 * law retrieval, the shell-out to git for "what changed", and the census the
 * founder is about to make a launch decision on. A review screen that throws on
 * open, or quietly reports the wrong number of unsigned rows, is worse than no
 * review screen — it is the same class of defect as the flag it replaces.
 */
import { describe, expect, it } from "vitest";
import { listFlaggedQuestions } from "./io";

describe("listFlaggedQuestions — against the real bank", () => {
  it("opens without throwing and reports a whole-bank census", async () => {
    const result = await listFlaggedQuestions();
    expect(result.census.total).toBeGreaterThan(1000);
    // The census counts the WHOLE bank, not just the page.
    expect(
      result.census.draft +
        result.census.machineChecked +
        result.census.needsReview +
        result.census.approved,
    ).toBe(result.census.total);
  });

  it("says out loud that nothing is human-approved until somebody signs", async () => {
    const { census } = await listFlaggedQuestions();
    // Not a threshold — a statement. `approved` rows exist in quantity and
    // exactly zero of them carry a signature, which is the finding
    // (docs/education/90 §1). When the founder starts clearing rows this
    // becomes humanApproved > 0 and unsignedApproved falls by the same amount.
    expect(census.approved).toBeGreaterThan(0);
    expect(census.humanApproved + census.unsignedApproved).toBe(census.approved);
  });

  it("never lets the unsigned count exceed the frozen ceiling", async () => {
    // The same ratchet validate:content enforces. If this goes red, something
    // minted `approved` rows without a human — which is the whole defect.
    const { census } = await listFlaggedQuestions();
    expect(census.unsignedApproved).toBeLessThanOrEqual(census.unsignedApprovedBaseline);
  });

  it("pages instead of shipping a thousand rows to the browser", async () => {
    const first = await listFlaggedQuestions({ queue: "unsigned", page: 1 });
    expect(first.flagged.length).toBeLessThanOrEqual(first.pageSize);
    expect(first.total).toBe(first.census.unsignedApproved);
    if (first.pageCount > 1) {
      const second = await listFlaggedQuestions({ queue: "unsigned", page: 2 });
      expect(second.flagged.map((q) => q.id)).not.toEqual(first.flagged.map((q) => q.id));
    }
    // Out-of-range paging clamps rather than returning an empty screen.
    const beyond = await listFlaggedQuestions({ queue: "unsigned", page: 9999 });
    expect(beyond.page).toBe(beyond.pageCount);
  });

  it("puts only unsigned `approved` rows in the unsigned queue", async () => {
    const { flagged } = await listFlaggedQuestions({ queue: "unsigned" });
    expect(flagged.length).toBeGreaterThan(0);
    for (const q of flagged) {
      expect(q.status).toBe("approved");
      expect(q.approval.kind).toBe("unsigned-claim");
    }
  });

  it("carries the evidence a reviewer needs onto every card", async () => {
    const { flagged } = await listFlaggedQuestions({ queue: "unsigned", pageSize: 5 });
    for (const q of flagged) {
      // Every row cites something (the audit measured the citation surface at
      // 100%), and every citation gets a retrieval verdict — found with the
      // verbatim text, or an honest miss. Never a blank. The count can be
      // LOWER than lawRefs because refs resolving to the same article share a
      // card instead of printing чл. 5 twice.
      expect(q.lawEvidence.length).toBeGreaterThan(0);
      expect(q.lawEvidence.length).toBeLessThanOrEqual(q.lawRefs.length);
      for (const law of q.lawEvidence) {
        if (law.found) expect(law.textBg).toBeTruthy();
        else expect(law.missReasonBg).toBeTruthy();
      }
      expect(q.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(["changed", "unchanged", "new", "unavailable"]).toContain(q.diff.kind);
    }
  });

  it("retrieves real statute text for at least some of the page", async () => {
    // A corpus that resolved nothing would leave the reviewer with the same
    // "trust me" screen we are replacing, and every card would look fine.
    const { flagged } = await listFlaggedQuestions({ queue: "unsigned", pageSize: 20 });
    const resolved = flagged.flatMap((q) => q.lawEvidence).filter((l) => l.found);
    expect(resolved.length).toBeGreaterThan(0);
    expect(resolved[0].textBg).toBeTruthy();
  });
});

describe("the queue is ordered by what a wrong decision costs a student", () => {
  const RANK = ["key-flip", "answer-text", "stem", "explanation", "citation", "untouched"];

  it("ranks the WHOLE backlog, not just the page that is on screen", async () => {
    const result = await listFlaggedQuestions({ queue: "needs-review" });
    const tallied = RANK.reduce((sum, band) => sum + result.risk[band as never], 0);
    // The tally must describe the backlog. If it only counted the page slice
    // the header would promise "6 moved keys" while ranking 20 rows, and a key
    // flip on page 12 would still never surface.
    expect(tallied).toBe(result.total);
  });

  it("puts every moved answer key on the first page", async () => {
    const result = await listFlaggedQuestions({ queue: "needs-review" });
    const flips = result.risk["key-flip"];
    if (flips === 0) return; // the wave's flips have all been signed off
    expect(flips).toBeLessThanOrEqual(result.pageSize);
    const firstPage = result.flagged.slice(0, flips);
    expect(firstPage.every((q) => q.diff.risk === "key-flip")).toBe(true);
  });

  it("never sorts a lower-risk row above a higher-risk one", async () => {
    const { flagged } = await listFlaggedQuestions({ queue: "needs-review", pageSize: 60 });
    const ranks = flagged.map((q) => RANK.indexOf(q.diff.risk));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("states the moved key as letters, both sides", async () => {
    const { flagged } = await listFlaggedQuestions({ queue: "needs-review", pageSize: 60 });
    for (const q of flagged) {
      if (q.diff.keyChange === null) {
        // Only a key-flip row may claim the band — except a brand-new row,
        // which has no baseline to have moved away from.
        if (q.diff.risk === "key-flip") expect(q.diff.kind).toBe("new");
        continue;
      }
      expect(q.diff.risk).toBe("key-flip");
      expect(q.diff.keyChange.before).not.toBe(q.diff.keyChange.after);
      // The "after" must be the key actually stored on the row — the banner is
      // read as fact, so it may never disagree with the options below it.
      const live = q.options
        .filter((o) => o.correct)
        .map((o) => o.id)
        .sort()
        .join(",");
      expect(q.diff.keyChange.after).toBe(live);
    }
  });

  it("does not print the auditor's note a second time inside the diff", async () => {
    // The note is rendered in its own box. It used to ride along in the
    // explanation diff as well, because the diff compared the RAW stored text
    // including the [REVIEW: …] prefix — 600-1,000 characters of duplicate on
    // every card in the queue.
    const { flagged } = await listFlaggedQuestions({ queue: "needs-review", pageSize: 40 });
    const withNote = flagged.filter((q) => q.reviewNote !== null);
    expect(withNote.length).toBeGreaterThan(0);
    for (const q of withNote) {
      const explanation = q.diff.changes.find((c) => c.field === "explanationBg");
      if (!explanation) continue;
      expect(explanation.after).not.toContain("[REVIEW:");
      expect(explanation.before ?? "").not.toContain("[REVIEW:");
    }
  });
});
