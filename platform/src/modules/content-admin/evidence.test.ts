/**
 * The review screen's evidence layer.
 *
 * The one thing this must never do is invent law. `lawEvidenceFor` retrieves or
 * it reports a miss (ADR-002); `checkQuotedClaims` compares our words against
 * retrieved words and does no interpretation at all. The tests below hold that
 * line, and check the matcher against the two things that actually break it:
 * the soft hyphens and non-breaking spaces the .docx leaves behind, and quotes
 * that are ours rather than the statute's.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkQuotedClaims,
  lawEvidenceFor,
  loadDiffBaseline,
  quotedSpans,
  repoRootFor,
} from "./evidence";
import type { LawRefEvidence } from "./types";

function evidence(over: Partial<LawRefEvidence> = {}): LawRefEvidence {
  return {
    act: "ЗДвП",
    ref: "чл. 98",
    unverified: false,
    found: true,
    citationBg: "ЗДвП, чл. 98",
    contextBg: null,
    textBg: "Чл. 98. (2) Освен в посочените в ал. 1 случаи паркирането е забранено: … 3. на спирките на превозните средства;",
    truncated: false,
    missReasonBg: null,
    sourceUrl: null,
    sourceVersionBg: null,
    ...over,
  };
}

describe("quotedSpans", () => {
  it("picks up Bulgarian „…“ quotes", () => {
    expect(quotedSpans("Законът казва „паркирането е забранено“ и толкова.")).toEqual([
      "паркирането е забранено",
    ]);
  });

  it("ignores spans too short to be a legal claim", () => {
    expect(quotedSpans("Знакът „Б2“ значи спри.")).toEqual([]);
  });

  it("deduplicates a span quoted twice", () => {
    const text = "„престой и паркиране“ … пак „престой и паркиране“";
    expect(quotedSpans(text)).toEqual(["престой и паркиране"]);
  });
});

describe("checkQuotedClaims", () => {
  it("confirms a quote that appears verbatim in a cited article", () => {
    const claims = checkQuotedClaims(
      "Спирките са в ал. 2: „паркирането е забранено“ — престоят не.",
      [evidence()],
    );
    expect(claims).toEqual([{ quote: "паркирането е забранено", foundInRef: "чл. 98" }]);
  });

  it("reports a quote that appears in NO cited article", () => {
    // This is the shape of the fabricated 50-metre level-crossing rule
    // (docs/education/90 §4.3): plausible, memorable, in no statute we cite.
    const claims = checkQuotedClaims(
      "Забранено е спирането „на по-малко от 50 метра от двете страни“ на прелеза.",
      [evidence()],
    );
    expect(claims).toEqual([
      { quote: "на по-малко от 50 метра от двете страни", foundInRef: null },
    ]);
  });

  it("does not trip over soft hyphens and non-breaking spaces from the .docx", () => {
    const claims = checkQuotedClaims("Текстът казва „паркирането е забранено“.", [
      evidence({ textBg: "Чл. 98. (2) … пар­кирането е забранено: …" }),
    ]);
    expect(claims[0].foundInRef).toBe("чл. 98");
  });

  it("cannot confirm anything against an article we failed to retrieve", () => {
    const claims = checkQuotedClaims("Законът казва „паркирането е забранено“.", [
      evidence({ found: false, textBg: null, missReasonBg: "няма такъв член" }),
    ]);
    expect(claims[0].foundInRef).toBeNull();
  });
});

describe("lawEvidenceFor", () => {
  it("retrieves the verbatim article text for a ref the corpus holds", () => {
    const [zdvp] = lawEvidenceFor([{ act: "ЗДвП", ref: "чл. 5" }]);
    expect(zdvp.found).toBe(true);
    expect(zdvp.textBg).toContain("Чл. 5");
    expect(zdvp.citationBg).toContain("ЗДвП");
  });

  it("reports a miss as a miss instead of filling the gap", () => {
    const [missing] = lawEvidenceFor([{ act: "Наредба, която нямаме", ref: "чл. 1" }]);
    expect(missing.found).toBe(false);
    expect(missing.textBg).toBeNull();
    expect(missing.missReasonBg).not.toBeNull();
  });

  it("surfaces the SCHEMA.md \"?\" marker — the author was not sure", () => {
    const [unsure] = lawEvidenceFor([{ act: "ЗДвП", ref: "чл. 5?" }]);
    expect(unsure.unverified).toBe(true);
  });

  it("prints an article ONCE when several refs land on it", () => {
    // q-osnovni-008 cites чл. 5 ал. 1 т. 1 and чл. 5 ал. 3 т. 1; without this
    // the reviewer scrolls the same 1,800-character article twice per card.
    const evidence = lawEvidenceFor([
      { act: "ЗДвП", ref: "чл. 5, ал. 1, т. 1" },
      { act: "ЗДвП", ref: "чл. 5, ал. 3, т. 1" },
    ]);
    expect(evidence).toHaveLength(1);
    expect(evidence[0].ref).toBe("чл. 5, ал. 1, т. 1 · чл. 5, ал. 3, т. 1");
  });

  it("keeps two different articles apart", () => {
    expect(
      lawEvidenceFor([
        { act: "ЗДвП", ref: "чл. 5" },
        { act: "ЗДвП", ref: "чл. 6" },
      ]),
    ).toHaveLength(2);
  });
});

/**
 * The baseline reader, against the real repository.
 *
 * This reads MANY blobs out of one `git cat-file --batch` process by walking
 * byte offsets, and a one-byte slip there does not throw — it hands back a
 * baseline where a whole topic's rows are absent, every one of them then reads
 * as "new", and the risk ranking floods the top of the founder's queue with
 * rows nothing actually changed. So the parser is checked against content the
 * test can verify independently.
 */
describe("loadDiffBaseline", () => {
  const contentDir = [
    path.join(process.cwd(), "content"),
    path.resolve(process.cwd(), "..", "content"),
  ].find((dir) => fs.existsSync(path.join(dir, "topics.json")));

  it("reads every requested topic in one batch, correctly framed", () => {
    expect(contentDir, "content dir not found").toBeTruthy();
    const slugs = fs
      .readdirSync(path.join(contentDir as string, "questions"))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""));
    expect(slugs.length).toBeGreaterThan(4);

    const baseline = loadDiffBaseline(repoRootFor(contentDir as string), slugs);
    if (!baseline.available) return; // not a git checkout — nothing to assert

    // Every topic must be represented. A dropped frame shows up here as a
    // topic whose ids are all missing, which is exactly the silent failure.
    for (const slug of slugs) {
      const onDisk: { id?: unknown }[] = JSON.parse(
        fs.readFileSync(path.join(contentDir as string, "questions", `${slug}.json`), "utf8"),
      );
      const known = onDisk.filter(
        (row) => typeof row.id === "string" && baseline.rows.has(row.id as string),
      );
      expect(known.length, `no baseline rows survived for ${slug}`).toBeGreaterThan(0);
    }

    // And the frames must not be shifted: a row's baseline copy has to carry
    // that row's own id, not the neighbouring blob's.
    for (const [id, row] of baseline.rows) {
      expect((row as { id?: string }).id).toBe(id);
    }
  });

  it("treats a path that does not exist at the baseline as simply absent", () => {
    expect(contentDir, "content dir not found").toBeTruthy();
    const baseline = loadDiffBaseline(repoRootFor(contentDir as string), [
      "osnovni-ponyatia",
      "no-such-topic-at-this-ref",
    ]);
    if (!baseline.available) return;
    // The real topic still came through — a `missing` frame in the middle of
    // the batch must not desynchronise the ones after it.
    expect(baseline.rows.size).toBeGreaterThan(0);
  });
});
