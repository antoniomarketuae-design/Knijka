/**
 * FR-33 — THE MACHINE GATE OVER THE QUESTION BANK.
 *
 * The founder's words: „it also has to go in the Theory — can't review manually
 * 1050+ Theory Questions". He is right, and the number is 1,089. A human cannot
 * re-read them on every change, so anything a machine can decide, a machine must
 * decide — and it must decide it by WALKING `contentRepo.questions()`, the same
 * bank the student is served, not a copy.
 *
 * The simulator half of this idea already exists (`world/referents.ts` walks
 * every scenario asking whether the world carries what the copy promises).
 * Nothing did the same for theory. This file is that half.
 *
 * WHAT A MACHINE CAN DECIDE HERE — and it is exactly one thing, said three ways:
 * DOES THE QUESTION CARRY WHAT ITS OWN WORDS PROMISE?
 *
 *   M1  A question whose text points AT something — „показаният знак", „на
 *       изображението", „колата с ореола" — must actually carry that media.
 *       A question that says „what does the sign shown mean?" with nothing
 *       shown is unanswerable, and it is unanswerable in a way that reads to a
 *       17-year-old as his own failure.
 *   M2  „Кой от ПОКАЗАНИТЕ знаци…" is a plural pointer at the OPTIONS. Every
 *       option must carry a sign face — three faces and one bare line of text
 *       is not a sign-identification question, it is a giveaway.
 *   M3  „Ти си колата с ореола" promises a highlighted ego car on the still.
 *       The scene must contain a pose with `variant: "ego"` or the halo the
 *       sentence refers to does not exist.
 *   M4  A sign CODE named in the copy („знак В24", „табела Т15") must exist in
 *       the sign catalogue. A question that teaches a student the name of a
 *       sign the product cannot draw, cannot explain and cannot put in an
 *       option is teaching him a dead reference.
 *
 * WHAT IT DELIBERATELY DOES NOT DECIDE. Whether the answer is legally correct,
 * whether `lawRefs` cites the right article, whether the explanation teaches.
 * Those need a human and this file does not pretend otherwise — CLAUDE.md's
 * content rule and ADR-002 both stand. A green run here means „no question lies
 * about what it shows", nothing more and nothing less.
 *
 * ANTI-VACUITY. A gate that cannot fail is worse than no gate: the wave that
 * produced this file also produced a lane that „closed" 18 scenarios by writing
 * Bulgarian into a field nothing renders, and the gate declared it fixed
 * because the gate read the same unrendered field. So every predicate below is
 * also run against deliberately broken questions built in this file, and the
 * sweep asserts it actually matched real questions rather than passing on an
 * empty set.
 */

import { describe, expect, it } from "vitest";
import { contentRepo } from "./loader";
import { getContentRepo } from "./repo";
import type { Question, QuestionOption, SceneStillMedia, SignMediaRef } from "./types";

// ---------------------------------------------------------------------------
// The pointers. Bulgarian, and NOT hand-waved: each one is a DEICTIC reference
// — a word that only means something if a picture is in front of you.
//
// ⚠ `\b` IS ASCII-ONLY IN JAVASCRIPT and silently never matches after a
// Cyrillic letter. The first draft of this file used it, found 2 deictic
// questions out of 1,089, and would have shipped as a green vacuous gate. The
// negative lookahead below is the fix, and `it("the word-boundary trick that
// broke the first draft stays fixed")` keeps it fixed.
// ---------------------------------------------------------------------------

const CYR_LETTER = "а-яА-Яъьѝ";

export interface Pointer {
  id: string;
  re: RegExp;
  /** What the question is pointing at. */
  needs: "any-media" | "option-faces" | "ego-pose";
}

const POINTERS: readonly Pointer[] = [
  // „показаният/показания знак" — singular: the picture is the question's own.
  { id: "показания-знак", re: new RegExp(`показани(я|ят)(?![${CYR_LETTER}])`, "u"), needs: "any-media" },
  // „Кой от ПОКАЗАНИТЕ знаци" — plural: the pictures are the OPTIONS.
  { id: "показаните-знаци", re: new RegExp(`показаните(?![${CYR_LETTER}])`, "u"), needs: "option-faces" },
  { id: "изобразения", re: new RegExp(`изобразени(я|ят|те)(?![${CYR_LETTER}])`, "u"), needs: "any-media" },
  {
    id: "на-изображението",
    re: /на (изображението|картинката|фигурата|схемата|снимката|рисунката)/u,
    needs: "any-media",
  },
  { id: "по-долу", re: /по-долу/u, needs: "any-media" },
  // The house convention for „which car is you" on a top-down still.
  { id: "колата-с-ореола", re: /с ореола/u, needs: "ego-pose" },
];

function optionFaces(q: Question): QuestionOption[] {
  return q.options.filter((o) => o.media !== undefined && o.media !== null);
}

function hasAnyMedia(q: Question): boolean {
  return q.media !== null || optionFaces(q).length > 0;
}

function egoPoses(q: Question): number {
  const m = q.media as SceneStillMedia | null;
  if (!m || m.kind !== "sceneStill") return 0;
  return m.poses.filter((p) => p.variant === "ego").length;
}

export interface Broken {
  questionId: string;
  pointer: string;
  why: string;
}

/** THE PREDICATE. Exported shape so the negative cases below run the same code. */
export function brokenPromises(q: Question): Broken[] {
  const out: Broken[] = [];
  const text = q.textBg;
  for (const p of POINTERS) {
    if (!p.re.test(text)) continue;
    switch (p.needs) {
      case "any-media":
        if (!hasAnyMedia(q)) {
          out.push({
            questionId: q.id,
            pointer: p.id,
            why: "text points at a picture; the question carries no media at all",
          });
        }
        break;
      case "option-faces": {
        const faces = optionFaces(q).length;
        if (faces !== q.options.length) {
          out.push({
            questionId: q.id,
            pointer: p.id,
            why: `plural pointer at the options, but only ${faces} of ${q.options.length} options carry a face`,
          });
        }
        break;
      }
      case "ego-pose":
        if (egoPoses(q) !== 1) {
          out.push({
            questionId: q.id,
            pointer: p.id,
            why: `text says "the car with the halo" but the still has ${egoPoses(q)} ego poses`,
          });
        }
        break;
    }
  }
  return out;
}

/** Every pointer this question fires, for the coverage assertions. */
function pointersOf(q: Question): string[] {
  return POINTERS.filter((p) => p.re.test(q.textBg)).map((p) => p.id);
}

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

const QUESTIONS = contentRepo.questions();
const POINTING = QUESTIONS.filter((q) => pointersOf(q).length > 0);

describe("FR-33 — the sweep walks the real bank and is not vacuous", () => {
  it("reads the questions through the ContentRepo the app is served from", () => {
    expect(getContentRepo()).toBe(contentRepo);
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(1089);
  });

  it("actually matched deictic questions — an empty match set would pass M1–M3 vacuously", () => {
    // Measured 2026-08-02: 46 of 1,089 questions point at a picture. If this
    // collapses toward zero the pointers have stopped matching (the Cyrillic
    // `\b` bug) and the gate below is green because it tested nothing.
    expect(POINTING.length).toBeGreaterThanOrEqual(40);
    const fired = new Set(POINTING.flatMap(pointersOf));
    // Every pointer that is supposed to describe the house style must find at
    // least one real question written in it.
    expect([...fired].sort()).toEqual(
      expect.arrayContaining(["показания-знак", "показаните-знаци", "колата-с-ореола"]),
    );
  });

  it("the word-boundary trick that broke the first draft stays fixed", () => {
    // Regression pin, not decoration: /показаните\b/ matches NOTHING in
    // Bulgarian because JS `\b` only knows ASCII word characters. Any future
    // pointer added with `\b` will make this fail.
    const sample = "Кой от показаните знаци забранява изпреварването?";
    expect(/показаните\b/u.test(sample)).toBe(false); // the bug, pinned
    expect(POINTERS.find((p) => p.id === "показаните-знаци")!.re.test(sample)).toBe(true);
    for (const p of POINTERS) {
      expect(p.re.source, `${p.id} must not use ASCII \\b`).not.toContain("\\b");
    }
  });
});

describe("FR-33 — no question promises a picture it does not carry", () => {
  it("M1/M2/M3 — every deictic question carries what it points at", () => {
    const broken = QUESTIONS.flatMap(brokenPromises).map(
      (b) => `${b.questionId} [${b.pointer}] — ${b.why}`,
    );
    expect(broken).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// M4 — sign codes the copy names vs the catalogue that has to draw them
// ---------------------------------------------------------------------------

/**
 * A sign code as the copy writes it: group letter glued to the number, no
 * space. The space matters — „В 7:00 ч." is a TIME, and allowing a space made
 * the first version of this scan report it as a citation of sign „В7". Suffix
 * letters (Г15а / Г15б) are real and resolve to the base entry.
 */
const SIGN_CODE_RE = /(?<![А-Яа-я0-9])([АБВГДЕЖТ])(\d{1,2})(?![0-9:])/gu;

function citedCodes(q: Question): string[] {
  const text = [q.textBg, q.explanationBg, ...q.options.map((o) => o.textBg)].join(" ");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  SIGN_CODE_RE.lastIndex = 0;
  while ((m = SIGN_CODE_RE.exec(text)) !== null) out.push(`${m[1]}${m[2]}`);
  return out;
}

/**
 * „Г15а" → „Г15". The 2023 ordinance splits some signs into an а/б pair (start
 * and end of the same regime) and the catalogue carries BOTH faces, because a
 * bare „Г15" is not a sign anybody can post. The regex above deliberately drops
 * the suffix letter, so resolution has to put it back: a cited base code counts
 * as covered when the catalogue holds that exact code OR the code plus exactly
 * one Cyrillic suffix letter.
 *
 * „Exactly one letter" is not pedantry — a prefix match would let „Г1" resolve
 * against „Г15а" and quietly re-open the hole this scan exists to close.
 */
function baseCode(code: string): string {
  const m = /^([А-Я]\d{1,2})[а-я]$/u.exec(code);
  return m ? m[1]! : code;
}

describe("FR-33 — M4: the copy never teaches a sign the catalogue does not have", () => {
  const catalogue = new Set(contentRepo.signs().map((s) => s.code));
  const resolvable = new Set([...catalogue, ...[...catalogue].map(baseCode)]);
  const missing = new Map<string, Set<string>>();
  let mentions = 0;
  for (const question of QUESTIONS) {
    for (const code of citedCodes(question)) {
      mentions += 1;
      if (resolvable.has(code)) continue;
      const ids = missing.get(code) ?? new Set<string>();
      ids.add(question.id);
      missing.set(code, ids);
    }
  }

  it("the scan is real — it resolves the codes that DO exist", () => {
    // 311 citations across the bank, 58 distinct codes resolving. If the
    // resolved count collapses, the regex has stopped matching and the pin
    // below would shrink for the wrong reason.
    expect(mentions).toBeGreaterThanOrEqual(300);
    const resolved = new Set(
      QUESTIONS.flatMap(citedCodes).filter((c) => resolvable.has(c)),
    );
    expect(resolved.size).toBeGreaterThanOrEqual(55);
  });

  /**
   * THE DEBT IS CLOSED — and this test is what keeps it closed.
   *
   * It used to pin twelve codes that the copy named and the catalogue could not
   * draw: А28, В25, Г15, Д1, Д13, Д14, Ж19, Т1, Т2, Т10, Т13, Т15, across
   * eleven questions, with the whole Ж and Т groups absent. Eleven questions
   * taught a 17-year-old the name of a sign the product could never show him.
   *
   * All twelve are now in `content/signs/signs.json` (thirteen entries — Г15
   * ships as its real а/б pair), every one `status: "draft"` until the founder
   * has reviewed the face, the name and the citation. `lawRefs` were RETRIEVED
   * from the citations the question bank already carries, never free-recalled
   * (ADR-002); where the bank pins no article, the entry carries only the code
   * and `content/signs/README.md` says so by name.
   *
   * The list is empty and must stay empty. If a new question names a sign the
   * catalogue does not have, this fails and names it.
   */
  it("no question teaches a sign code the catalogue cannot draw", () => {
    const dead = [...missing.entries()]
      .map(([code, ids]) => `${code} — ${[...ids].sort().join(", ")}`)
      .sort();
    expect(dead).toEqual([]);
  });

  it("the Ж and Т groups exist, and the а/б pairs resolve as one code", () => {
    const groups = new Set([...catalogue].map((c) => c[0]));
    // The two groups the catalogue never had. Ж19 „Препоръчителна скорост" is
    // the sign two questions contrast against В26 and Г17; Т1/Т2/Т10/Т13/Т15
    // are the plates that modify the sign above them.
    expect(groups.has("Ж")).toBe(true);
    expect(groups.has("Т")).toBe(true);
    // The suffix rule is a real rule, not a wildcard: „Г15" resolves because
    // the pair exists, „Г1" resolves on its own entry, „Г99" resolves on
    // nothing. If the middle case ever starts passing, the rule has rotted
    // into a prefix match.
    expect(resolvable.has("Г15")).toBe(true);
    expect(catalogue.has("Г15")).toBe(false);
    expect(catalogue.has("Г15а") && catalogue.has("Г15б")).toBe(true);
    expect(resolvable.has("Г99")).toBe(false);
    expect(baseCode("Г15а")).toBe("Г15");
    expect(baseCode("Г15")).toBe("Г15");
    // …and the catalogue is big enough to be worth gating at all.
    expect(catalogue.size).toBeGreaterThanOrEqual(77);
  });
});

// ---------------------------------------------------------------------------
// NEGATIVE CASES — the gate is proven able to fail, on the same code path
// ---------------------------------------------------------------------------

function q(over: Partial<Question>): Question {
  return {
    id: "q-fixture-001",
    conceptIds: ["c-x"],
    type: "single",
    points: 1,
    textBg: "Какво означава това?",
    options: [
      { id: "a", textBg: "А", correct: true },
      { id: "b", textBg: "Б", correct: false },
    ],
    explanationBg: "Защото.",
    lawRefs: [],
    media: null,
    status: "approved",
    ...over,
  } as Question;
}

const SIGN: SignMediaRef = { kind: "sign", signRef: "Б2" };

describe("FR-33 — the gate can fail (proven, not assumed)", () => {
  it("catches a singular pointer with no media", () => {
    const bad = q({ textBg: "Какво означава показаният пътен знак?" });
    expect(brokenPromises(bad).map((b) => b.pointer)).toEqual(["показания-знак"]);
    // …and stops complaining the moment the media is there.
    expect(brokenPromises(q({ ...bad, media: SIGN }))).toEqual([]);
  });

  it("catches the plural pointer when only SOME options carry faces", () => {
    const half = q({
      textBg: "Кой от показаните знаци забранява изпреварването?",
      options: [
        { id: "a", textBg: "А", correct: true, media: SIGN },
        { id: "b", textBg: "Б", correct: false },
      ],
    });
    expect(brokenPromises(half)[0]!.why).toContain("only 1 of 2");
    const all = q({
      textBg: "Кой от показаните знаци забранява изпреварването?",
      options: [
        { id: "a", textBg: "А", correct: true, media: SIGN },
        { id: "b", textBg: "Б", correct: false, media: SIGN },
      ],
    });
    expect(brokenPromises(all)).toEqual([]);
  });

  it("catches the halo pointer on a still that draws no ego car", () => {
    const still = (ego: boolean): SceneStillMedia => ({
      kind: "sceneStill",
      districtId: "district-v1",
      focus: { x: 0, y: 0, zoomM: 40 },
      poses: [{ kind: "car", x: 0, y: 0, headingDeg: 0, ...(ego ? { variant: "ego" as const } : {}) }],
    });
    const bad = q({ textBg: "Ти си колата с ореола. Кой минава пръв?", media: still(false) });
    expect(brokenPromises(bad)[0]!.why).toContain("0 ego poses");
    expect(brokenPromises(q({ ...bad, media: still(true) }))).toEqual([]);
  });

  it("stays quiet on a question that merely DESCRIBES a sign in words", () => {
    // The distinction the whole file rests on. „обозначена жилищна зона" is a
    // description of the world, not a pointer at a picture — a naive keyword
    // scan flagged 26 of these as broken and every one was a false positive.
    for (const textBg of [
      "Влизаш в обозначена жилищна зона. Кои правила важат вътре в зоната?",
      "Виждаш предупредителен знак „Деца“ близо до училище. Кои действия са правилни?",
      "Дрегерът при проверката отчита алкохол, но не си съгласен с показанието.",
    ]) {
      expect(brokenPromises(q({ textBg })), textBg).toEqual([]);
    }
  });
});
