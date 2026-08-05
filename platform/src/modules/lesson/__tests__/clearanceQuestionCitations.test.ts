/**
 * THE QUESTION BANK'S CITATION GATE, proved over the real repo.
 *
 * `clearanceCitations.test.ts` proved this for concepts.json and stopped there.
 * The question bank never got the treatment, and everyone assumed `status`
 * covered it — the same assumption that left `resolve.ts`, `retrieval.ts` and
 * concept citations open in turn. `status` says a person approved the ROW. It
 * says nothing about the article number printed beside it, and a question's
 * `lawRefs` reach a screen on five surfaces that never touch this module.
 *
 * It showed: of the 608 distinct citation strings across the 1,089 rows, 269
 * named an article no resolver in this repo can find — 110 of them on rows a
 * student is served today. ППЗДвП carried 106 and Наредба № РД-02-21-1 88.
 *
 * The five claims below are the whole contract, and only the fourth is one a
 * hash can make — a pin proves „unchanged", never „true".
 */
import { describe, expect, it } from "vitest";
import "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";
import { normaliseUnitRef, resolveLawRef } from "@/lib/content/law/corpus";
import type { LawRef, Question } from "@/lib/content/types";
import { citationFingerprint, citationLine, questionClearance } from "../clearance";
import { CARRIED_QUESTION_CITATIONS } from "../clearanceQuestionCitations";

/**
 * Acts physically in content/law/acts but not yet registered in sources.json,
 * so `ACT_IDS` cannot load them. Listed rather than blessed, so that wiring the
 * act in removes the exception instead of hiding it.
 */
const PENDING_CORPUS = new Set(["Наредба № 24"]);

const namesAnArticle = (ref: LawRef): boolean => normaliseUnitRef(ref.ref) !== null;

const everyLawRef = (): { question: Question; ref: LawRef }[] =>
  getContentRepo()
    .questions()
    .flatMap((question) => question.lawRefs.map((ref) => ({ question, ref })));

describe("citations a student sees beside a question", () => {
  it("either resolve in the corpus we hold, or name NO article number", () => {
    // The founder's standing ruling, executable: an act we cannot open may be
    // NAMED, the article number may not be GUESSED. „ППЗДвП чл. 46, ал. 2" is a
    // claim nobody on this platform can check; „ППЗДвП сигнализиране на
    // предимството на кръстовища" is the same pointer with the guess removed.
    const guesses = everyLawRef()
      .filter(({ ref }) => !resolveLawRef(ref).found)
      .filter(({ ref }) => !PENDING_CORPUS.has(ref.act.trim()))
      .filter(({ ref }) => namesAnArticle(ref))
      .map(({ question, ref }) => `${question.id} [${question.status}]: „${citationLine(ref)}"`);
    expect(guesses, `article numbers we cannot check:\n${guesses.join("\n")}`).toEqual([]);
  });

  it("name an ал./т./б. the article really has — the resolver never checks", () => {
    // `resolveLawRef` truncates „чл. 21, ал. 3" to „чл. 21", so a fabricated
    // alinea resolves GREEN. The verbatim text is the only witness: an
    // article's alineas are its bare „(N)" markers.
    //
    // NB: JS \b is ASCII-only and never fires next to Cyrillic. Written with
    // \b this check silently passes on every row, which is exactly how it read
    // the first time it ran.
    const problems: string[] = [];
    for (const { question, ref } of everyLawRef()) {
      const found = resolveLawRef(ref);
      if (!found.found) continue;
      const flat = found.unit.textBg.replace(/­/g, "").replace(/\s+/g, " ").trim();
      const al = /ал\.\s*(\d+)/.exec(ref.ref);
      if (al === null) continue;
      const have = new Set([...flat.matchAll(/\((\d{1,2})\)/g)].map((m) => Number(m[1])));
      // An article with no "(1)" at all is single-alinea prose; „ал. 1" holds.
      if (have.size === 0) have.add(1);
      if (!have.has(Number(al[1]))) {
        problems.push(
          `${question.id}: „${citationLine(ref)}" — article has ал. ${[...have].sort((a, b) => a - b).join(",")}`,
        );
      }
    }
    expect(problems, `sub-references that are not in the act:\n${problems.join("\n")}`).toEqual([]);
  });

  it("the pin covers every question, and the bank still agrees with it", () => {
    const questions = getContentRepo().questions();
    expect(Object.keys(CARRIED_QUESTION_CITATIONS).sort()).toEqual(
      questions.map((q) => q.id).sort(),
    );
    const stale = questions
      .filter((q) => CARRIED_QUESTION_CITATIONS[q.id] !== citationFingerprint(q.lawRefs))
      .map((q) => `${q.id} — run scripts/freeze-question-citations.mjs`);
    expect(stale, `citation pins are stale:\n${stale.join("\n")}`).toEqual([]);
  });

  it("an edited citation withholds an APPROVED question, with its own reason", () => {
    const question = getContentRepo()
      .questions()
      .find((q) => q.status === "approved");
    expect(question).toBeDefined();
    if (question === undefined) return;
    expect(questionClearance(question).cleared).toBe(true);

    // Not a rename and not a typo: the row is untouched and the article number
    // moved. That is the exact edit `status` could not see.
    const tampered: Question = {
      ...question,
      lawRefs: [{ act: question.lawRefs[0].act, ref: "чл. 999" }],
    };
    const verdict = questionClearance(tampered);
    expect(verdict.cleared).toBe(false);
    expect(verdict.cleared === false && verdict.reason).toBe("question-citation-stale");

    // A row the freeze never saw is withheld too — fails closed, like concepts.
    const unknown = questionClearance({ ...question, id: "q-never-frozen" });
    expect(unknown.cleared === false && unknown.reason).toBe("question-citations-not-carried");
  });

  it("still reports not-approved first for a draft row", () => {
    // The remedy differs: a draft needs a reviewer, a moved citation needs
    // somebody to open the act. Reporting the citation reason for a draft would
    // send that person to the wrong file.
    const draft = getContentRepo()
      .questions()
      .find((q) => q.status !== "approved");
    expect(draft).toBeDefined();
    if (draft === undefined) return;
    const verdict = questionClearance(draft);
    expect(verdict.cleared).toBe(false);
    expect(verdict.cleared === false && verdict.reason).toBe("question-not-approved");
  });
});
