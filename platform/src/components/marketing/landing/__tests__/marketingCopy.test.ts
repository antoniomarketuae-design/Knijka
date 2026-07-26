import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the one class of Bulgarian copy defect that review cannot catch:
 * a Latin letter hiding inside a Cyrillic word.
 *
 * `a e o p c x y A E O P C X Y` are pixel-identical to `а е о р с х у А Е О Р
 * С Х У` in every font this app ships. „свалямe“ (Latin final e) shipped in
 * this very folder and survived a full-page screenshot review, because there
 * is nothing to see. What it breaks is invisible too: in-page search misses
 * the word, a screen reader switches voice mid-word, and copy-paste into any
 * Bulgarian tool produces a token that matches nothing.
 *
 * The rule is adjacency, which is what makes it precise rather than noisy:
 * a Latin letter DIRECTLY touching a Cyrillic one is always a typo, while the
 * legitimate mixes on these pages („Книжка.AI“, „AI учител“, „GDPR (…“,
 * „STOP“) are always separated by punctuation or a space.
 */

const MARKETING_SOURCES = [
  "src/app/(marketing)/page.tsx",
  "src/app/(marketing)/layout.tsx",
  "src/app/(marketing)/za-avtoshkoli/page.tsx",
  "src/components/marketing/landing/featuredMistakes.ts",
  "src/components/marketing/landing/MistakeReel.tsx",
];

/** A Latin letter immediately touching a Cyrillic one, in either order. */
const MIXED_SCRIPT_WORD = /[A-Za-z][Ѐ-ӿ]|[Ѐ-ӿ][A-Za-z]/g;

describe("Bulgarian marketing copy uses Cyrillic throughout", () => {
  it.each(MARKETING_SOURCES)("has no Latin letters inside Cyrillic words: %s", (relative) => {
    const source = readFileSync(join(process.cwd(), relative), "utf8");
    const offenders = source
      .split(/\r?\n/)
      .flatMap((line, index) =>
        [...line.matchAll(MIXED_SCRIPT_WORD)].map(
          (match) => `${relative}:${index + 1} → …${line.slice(Math.max(0, match.index - 20), match.index + 20).trim()}…`,
        ),
      );

    expect(offenders).toEqual([]);
  });
});
