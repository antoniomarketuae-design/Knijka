/**
 * THE REVIEW GALLERY MUST SHOW THE ONE QUESTION SHAPE THAT IS NOTHING BUT ART.
 *
 * `loadQuestions()` used to open with `if (!question.media) continue;`. Every
 * „Кой от показаните знаци…“ item carries its artwork on `options[].media` and
 * leaves `question.media` null (content/SCHEMA.md, „the comparison shape"), so
 * that one line dropped all 18 of them — the founder's own review surface never
 * listed the questions whose entire content is four pictures.
 *
 * The invariant, stated so it survives new questions being added: if a question
 * has sign artwork on its options, the gallery shows it. No count is hardcoded.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveContentDir } from "@/lib/content/loader";
import { loadGalleryIndex } from "../galleryData";

interface RawQuestion {
  id?: unknown;
  options?: { correct?: unknown; media?: { kind?: unknown; signRef?: unknown } | null }[];
}

/** Ids in the bank whose options carry sign faces — the source of truth. */
function comparisonIdsInBank(): string[] {
  const dir = path.join(resolveContentDir(), "questions");
  const ids: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const arr = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as RawQuestion[];
    for (const q of arr) {
      const hasOptionArt = (q.options ?? []).some((o) => o?.media?.kind === "sign");
      if (hasOptionArt && typeof q.id === "string") ids.push(q.id);
    }
  }
  return ids.sort();
}

describe("review gallery — sign-comparison rows", () => {
  const index = loadGalleryIndex();

  it("lists every question that carries sign artwork on its options", () => {
    const shown = index.questions
      .filter((q) => q.mediaKind === "signSet")
      .map((q) => q.id)
      .sort();
    const missing = comparisonIdsInBank().filter((id) => !shown.includes(id));
    expect(
      missing,
      "these questions are pure artwork and the gallery is not showing them — " +
        "loadQuestions() must read options[].media, not just question.media",
    ).toEqual([]);
  });

  it("gives each comparison row one sign code per option, in option order", () => {
    for (const row of index.questions.filter((q) => q.mediaKind === "signSet")) {
      expect(row.signRefs, row.id).not.toBeNull();
      expect(row.signRefs!.length, `${row.id} option count`).toBeGreaterThanOrEqual(2);
      expect(row.signRef, `${row.id} has no single sign`).toBeNull();
    }
  });

  it("names the correct sign by CODE so the founder can check the key at a glance", () => {
    // The bare label „Знак 2" is useless in review — it says nothing about
    // which face is supposed to be right.
    for (const row of index.questions.filter((q) => q.mediaKind === "signSet")) {
      expect(row.correctBg.length, `${row.id} has no marked answer`).toBeGreaterThan(0);
      for (const code of row.correctBg) {
        expect(row.signRefs, `${row.id}: correct "${code}" is not one of the shown signs`)
          .toContain(code);
      }
    }
  });
});
