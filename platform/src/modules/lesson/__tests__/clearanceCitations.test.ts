/**
 * THE CITATION GATE, proved over the real repo.
 *
 * `clearanceCarry.ts` pins what a student HEARS. This proves the other half of
 * the same utterance — what a student SEES beside it. `resolve.ts` returns
 * `concept.lawRefs`, `classroom/lessonToRoom.ts` folds the first one into
 * „`${first.act} ${first.ref}`" and `Transcript.tsx` prints it in the beat
 * header, and until `clearanceCitations.ts` existed no check of any kind ran on
 * that string. It showed: 45 of the 113 distinct citations reachable across the
 * 54 lessons carried a QUESTION MARK.
 *
 * The four claims below are the whole contract, and the first three are the
 * ones a hash alone cannot make — a pin proves „unchanged", never „true".
 */
import { describe, expect, it } from "vitest";
import "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";
import { resolveLawRef } from "@/lib/content/law/corpus";
import { normaliseUnitRef } from "@/lib/content/law/corpus";
import type { Concept, LawRef } from "@/lib/content/types";
import { allLessons } from "../compose";
import { citationFingerprint, citationLine, conceptClearance } from "../clearance";
import { CARRIED_CONCEPT_CITATIONS } from "../clearanceCitations";
import { resolveBeat } from "../resolve";

/**
 * Acts that are physically in content/law/acts but not yet registered in
 * sources.json, so `ACT_IDS` cannot load them. Their refs are numbered and the
 * numbers were read out of the file on disk; they are listed rather than
 * blessed so that wiring the act in removes the exception instead of hiding it.
 */
const PENDING_CORPUS = new Set(["Наредба № 24"]);

const namesAnArticle = (ref: LawRef): boolean => normaliseUnitRef(ref.ref) !== null;

function everyLawRef(): { concept: Concept; ref: LawRef }[] {
  return getContentRepo()
    .concepts()
    .flatMap((concept) => concept.lawRefs.map((ref) => ({ concept, ref })));
}

describe("citations a student can see", () => {
  it("contain no question mark — in ANY corpus, not just the one that was fixed", () => {
    // Scoped to all three student-facing banks on purpose. concepts.json was
    // where the 45 were, but the neighbouring door is the one that gets
    // forgotten: `learning/session.ts` deals `needs-review` questions to
    // practice BY DEFAULT (`includeUnreviewed = true`) and
    // `theory/practice/actions.ts` returns their `lawRefs` to the UI, so a
    // marked citation on a needs-review row reaches a screen exactly as fast
    // as one on a concept. Seven did.
    const repo = getContentRepo();
    const marked = [
      ...repo.concepts().flatMap((c) => c.lawRefs.map((ref) => [`concept ${c.id}`, ref] as const)),
      ...repo.questions().flatMap((q) => q.lawRefs.map((ref) => [`question ${q.id}`, ref] as const)),
      ...repo.signs().flatMap((s) => s.lawRefs.map((ref) => [`sign ${s.code}`, ref] as const)),
    ]
      .filter(([, ref]) => citationLine(ref).includes("?"))
      .map(([who, ref]) => `${who}: „${citationLine(ref)}"`);
    expect(marked, `unverified-marker citations reach the screen:\n${marked.join("\n")}`).toEqual(
      [],
    );
  });

  it("either resolve in the corpus we hold, or name NO article number", () => {
    // The founder's standing ruling, executable: an act we cannot open may be
    // named, but the article number may not be guessed. „ППЗДвП чл. 31" is a
    // claim we cannot check; „ППЗДвП светлинни сигнали за регулиране на
    // движението" is the same rule with the guess removed.
    const guesses = everyLawRef()
      .filter(({ ref }) => !resolveLawRef(ref).found)
      .filter(({ ref }) => !PENDING_CORPUS.has(ref.act.trim()))
      .filter(({ ref }) => namesAnArticle(ref))
      .map(({ concept, ref }) => `${concept.id}: „${citationLine(ref)}"`);
    expect(guesses, `article numbers we cannot check:\n${guesses.join("\n")}`).toEqual([]);
  });

  it("the pin covers every concept, and the corpus still agrees with it", () => {
    const concepts = getContentRepo().concepts();
    expect(Object.keys(CARRIED_CONCEPT_CITATIONS).sort()).toEqual(
      concepts.map((c) => c.id).sort(),
    );
    const stale = concepts
      .filter((c) => CARRIED_CONCEPT_CITATIONS[c.id] !== citationFingerprint(c.lawRefs))
      .map((c) => `${c.id} — run scripts/freeze-lesson-citations.mjs`);
    expect(stale, `citation pins are stale:\n${stale.join("\n")}`).toEqual([]);
  });

  it("an edited citation withholds the concept, with its own reason", () => {
    const concept = getContentRepo().concepts()[0];
    expect(conceptClearance(concept).cleared).toBe(true);

    // Not a rename and not a typo: the sentence is untouched and the article
    // number moved. That is the exact edit the old pin could not see.
    const tampered: Concept = {
      ...concept,
      lawRefs: [{ act: concept.lawRefs[0].act, ref: "чл. 999" }],
    };
    const verdict = conceptClearance(tampered);
    expect(verdict.cleared).toBe(false);
    expect(verdict.cleared === false && verdict.reason).toBe("concept-citation-stale");
  });

  it("no beat emits a citation whose concept has not cleared", () => {
    const forbidden = new Set(
      getContentRepo()
        .concepts()
        .filter((c) => !conceptClearance(c).cleared)
        .flatMap((c) => c.lawRefs.map(citationLine)),
    );
    const cleared = new Set(
      getContentRepo()
        .concepts()
        .filter((c) => conceptClearance(c).cleared)
        .flatMap((c) => c.lawRefs.map(citationLine)),
    );

    const leaks: string[] = [];
    for (const lesson of allLessons()) {
      for (const beat of lesson.beats) {
        const resolved = resolveBeat(lesson.id, beat.id);
        if (resolved === null) continue;
        for (const utterance of resolved.utterances) {
          for (const ref of utterance.lawRefs) {
            const line = citationLine(ref);
            // A string shared with a cleared concept is not a leak — it is the
            // same citation, reached through a row that did clear.
            if (forbidden.has(line) && !cleared.has(line)) {
              leaks.push(`${lesson.id}/${beat.id} showed „${line}"`);
            }
          }
        }
      }
    }
    expect(leaks, `withheld citations reached the room:\n${leaks.join("\n")}`).toEqual([]);
  });
});
