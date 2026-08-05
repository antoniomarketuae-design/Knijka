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
  sourceEvidenceFor,
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
// TIMEOUT, and why it is not a hang. This suite shells out to git and reads
// the whole question bank off disk. On a cold FS cache on the 7200rpm E: drive
// the FIRST test alone measured 23s of import + read, so the default 5s turned
// a correct suite red — and a guard that goes red on a cold box gets deleted as
// flaky, which is how the hole this module exists to close gets reopened.
describe("loadDiffBaseline", { timeout: 120_000 }, () => {
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

/**
 * The non-statutory half. These assertions are the reason `sourceRefs` is a
 * usable citation shape rather than a second way to write an unresolvable one:
 * the reviewer must SEE the sentence, and must see it only when it really came
 * from the source the row names.
 */
describe("sourceEvidenceFor — the citations that are not law", () => {
  it("puts the verbatim source sentence on screen for the row that cites it", () => {
    const [ev] = sourceEvidenceFor([
      {
        sourceId: "src-nsi-ptp-2023",
        ref: "Методологични бележки",
        claimId: "stat-road-death-30-days",
      },
    ]);
    expect(ev.found).toBe(true);
    expect(ev.quoteBg).toContain("Загинал при ПТП");
    expect(ev.figureBg).toBe("30 дни");
    expect(ev.figureQuoteBg).toContain("30 дни");
    expect(ev.sourceUrl).toMatch(/^https:\/\//);
    expect(ev.authorityBg).toBe("official-methodology");
  });

  it("shows the recorded conflicts, because a source register can disagree with itself", () => {
    const [ev] = sourceEvidenceFor([
      {
        sourceId: "src-nsi-ptp-2023",
        ref: "Методологични бележки",
        claimId: "stat-road-death-30-days",
      },
    ]);
    expect(ev.conflictsBg.length).toBeGreaterThan(0);
    expect(ev.conflictsBg.join(" ")).toContain("30 дни");
  });

  it("reports a MISS with a plain-Bulgarian reason instead of guessing", () => {
    const [ev] = sourceEvidenceFor([{ sourceId: "src-nope", ref: "никъде" }]);
    expect(ev.found).toBe(false);
    expect(ev.quoteBg).toBeNull();
    expect(ev.missReasonBg).toContain("регистър");
  });

  /**
   * The check that makes the whole evidence layer worth reading: a quote we put
   * in an explanation is tested against the SOURCE text too, not only against
   * the statute — otherwise every grounded first-aid row would show a false
   * alarm and the check would be ignored.
   */
  it("checkQuotedClaims resolves a span quoted from a non-statutory source", () => {
    const src = sourceEvidenceFor([
      {
        sourceId: "src-nsi-ptp-2023",
        ref: "Методологични бележки",
        claimId: "stat-road-death-30-days",
      },
    ]);
    const claims = checkQuotedClaims(
      "НСИ брои за загинал „всеки човек, който в резултат на произшествието е убит на място“ и това е важно.",
      [],
      src,
    );
    expect(claims).toHaveLength(1);
    expect(claims[0].foundInRef).not.toBeNull();
  });
});

/**
 * The statute, in the statute's own words — against the real content file.
 *
 * q-ptp-013 shipped ЗДвП чл. 124, т. 1 inside quotation marks as „да вземеш …
 * да окажеш … за него“: the verbs rewritten into the second person so the
 * sentence would read to a student, while „за него“ stayed in the third. The
 * result was a sentence that exists in no text — a hybrid of the statute and
 * an editor — and it was written INSIDE the wave whose whole purpose was
 * ending decorative and unearned citation. Paraphrase belongs outside the
 * marks; what is inside them has to be retrievable.
 *
 * So the rule gets a standing test rather than a memo. For the first-aid rows
 * that rest on Bulgarian statute, EVERY Cyrillic span in quotation marks must
 * be found, verbatim, in an article the row itself cites. (Latin spans are the
 * ERC/RCUK 2025 quotes; those are checked against `content/medical` by
 * `verify-claims.mjs`, and here they simply have no statute to match.)
 *
 * Timed out generously for the same reason `loadDiffBaseline` is: this reads
 * the question bank off the 7200rpm E: drive and loads the law corpus, which
 * costs seconds on a cold FS cache and nothing at all on a warm one.
 */
describe("first-aid rows quote Bulgarian statute verbatim", { timeout: 120_000 }, () => {
  const contentDir = [
    path.join(process.cwd(), "content"),
    path.resolve(process.cwd(), "..", "content"),
  ].find((dir) => fs.existsSync(path.join(dir, "topics.json")));

  interface Row {
    id: string;
    explanationBg: string;
    lawRefs: { act: string; ref: string }[];
  }

  function firstAidRows(): Row[] {
    expect(contentDir, "content dir not found").toBeTruthy();
    return JSON.parse(
      fs.readFileSync(
        path.join(contentDir as string, "questions", "ptp-i-parva-pomosht.json"),
        "utf8",
      ),
    ) as Row[];
  }

  /** The rows whose explanation quotes ЗДвП rather than only naming it. */
  const QUOTES_STATUTE = ["q-ptp-013", "q-ptp-017"];

  it.each(QUOTES_STATUTE)("%s quotes only what the cited article actually says", (id) => {
    const row = firstAidRows().find((r) => r.id === id);
    expect(row, `${id} missing from ptp-i-parva-pomosht.json`).toBeTruthy();
    const claims = checkQuotedClaims(
      (row as Row).explanationBg,
      lawEvidenceFor((row as Row).lawRefs),
    );
    const cyrillic = claims.filter((c) => /[А-Яа-я]/.test(c.quote));
    // A row in this list must actually be quoting the statute; an empty list
    // would make the assertion below pass by saying nothing.
    expect(cyrillic.length, `${id} quotes no statute at all`).toBeGreaterThan(0);
    expect(
      cyrillic.filter((c) => c.foundInRef === null).map((c) => c.quote),
      `${id}: quoted as statute but in none of its cited articles`,
    ).toEqual([]);
  });

  /**
   * The exact defect, pinned. Second-person verbs are how a statute gets
   * "helpfully" rewritten inside quotation marks, and чл. 124 is the article
   * every non-participant row leans on.
   */
  it("never rewrites чл. 124, т. 1 into the second person", () => {
    const raw = firstAidRows()
      .map((r) => r.explanationBg)
      .join("\n");
    expect(raw).not.toContain("да вземеш мерки");
    expect(raw).not.toContain("да окажеш помощ");
  });
});
