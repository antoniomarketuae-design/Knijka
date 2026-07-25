import { describe, expect, it } from "vitest";
import type { Question, QuestionOption } from "@/lib/content/types";
import {
  OPTION_ORDER_WINDOW_MS,
  optionOrderIsFixed,
  orderOptionsForPractice,
  practiceOptionSeed,
} from "./optionOrder";

/** A question whose options are exactly the given texts; the FIRST is correct
 *  — the bank's own bad habit (45.6% correct-at-(a)), which is what the
 *  shuffle exists to break. */
function q(id: string, texts: string[]): Question {
  const options: QuestionOption[] = texts.map((textBg, i) => ({
    id: `${id}-${i}`,
    textBg,
    correct: i === 0,
  }));
  return {
    id,
    conceptIds: ["c-road"],
    type: "single",
    points: 1,
    textBg: `Въпрос ${id}`,
    options,
    explanationBg: "",
    lawRefs: [],
    media: null,
    status: "approved",
  };
}

const ids = (options: readonly QuestionOption[]) => options.map((o) => o.id);

describe("orderOptionsForPractice", () => {
  it("is a permutation: every option kept exactly once, stored array untouched", () => {
    const question = q("q-four", ["Първи", "Втори", "Трети", "Четвърти"]);
    const stored = ids(question.options);

    const ordered = orderOptionsForPractice(question, 7);

    expect([...ids(ordered)].sort()).toEqual([...stored].sort());
    // The repo hands out process-lifetime objects — reordering in place would
    // permanently scramble the content bank for every other user.
    expect(ids(question.options)).toEqual(stored);
  });

  it("is deterministic per (seed, question) — a re-render cannot move an option", () => {
    const question = q("q-four", ["А", "Б", "В", "Г"]);

    expect(ids(orderOptionsForPractice(question, 42))).toEqual(
      ids(orderOptionsForPractice(question, 42)),
    );
  });

  it("keys off the question id, so one question's order is independent of the rest", () => {
    // A shared RNG stream would make this pair's orders depend on how many
    // questions the session dealt before them; keyed seeds must not.
    const first = q("q-alpha", ["А", "Б", "В", "Г"]);
    const second = q("q-beta", ["А", "Б", "В", "Г"]);

    const alone = ids(orderOptionsForPractice(second, 3));
    orderOptionsForPractice(first, 3);

    expect(ids(orderOptionsForPractice(second, 3))).toEqual(alone);
  });

  it("gives different sessions different orders", () => {
    const question = q("q-four", ["А", "Б", "В", "Г"]);

    const seen = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      seen.add(ids(orderOptionsForPractice(question, seed)).join("|"));
    }

    expect(seen.size).toBeGreaterThan(1);
  });

  it("spreads the correct option across every position (the defect it exists to fix)", () => {
    // H-1/H-2: stored order puts the correct answer at (a) 45.6% of the time,
    // and `correct` is the only input to mastery — so "always pick the first"
    // must stop paying. 400 deterministic sessions, 4 options: chance is 25%.
    const question = q("q-four", ["Верен", "Грешен 1", "Грешен 2", "Грешен 3"]);
    const RUNS = 400;
    const hits = [0, 0, 0, 0];

    for (let seed = 0; seed < RUNS; seed++) {
      const ordered = orderOptionsForPractice(question, seed);
      hits[ordered.findIndex((o) => o.correct)]++;
    }

    for (const count of hits) {
      expect(count / RUNS).toBeGreaterThan(0.15);
      expect(count / RUNS).toBeLessThan(0.4);
    }
  });

  describe("the exception: options whose ORDER carries meaning", () => {
    it("keeps the stored order when an option points at the others", () => {
      const cases = [
        ["Само знакът", "Само маркировката", "Всички изброени по-горе"],
        ["Спираш", "Подаваш сигнал", "Нито едно от посочените действия"],
        ["Само а)", "Само б)", "Отговори а) и б)"],
        ["Даваш газ", "Спираш", "Първият отговор, но само в града"],
      ];

      for (const texts of cases) {
        const question = q("q-ref", texts);
        expect(optionOrderIsFixed(question)).toBe(true);
        // Same reference back: callers use that to tell "unchanged" apart.
        expect(orderOptionsForPractice(question, 1)).toBe(question.options);
      }
    });

    it("keeps the stored order of a monotone ladder", () => {
      const ladders = [
        ["До 0,0 промила", "До 0,5 промила", "До 0,8 промила", "До 1,2 промила"],
        ["150 км/ч.", "140 км/ч.", "130 км/ч.", "120 км/ч."], // descending
        ["Знак 1", "Знак 2", "Знак 3", "Знак 4"], // index into the question art
      ];

      for (const texts of ladders) {
        expect(optionOrderIsFixed(q("q-ladder", texts))).toBe(true);
      }
    });

    it("does NOT fire on ordinary options that merely look positional", () => {
      const ordinary = [
        // "отговорност" must not read as "отговор" — ~20 options say
        // „Гражданска отговорност“ and every one of them must still shuffle.
        ["Всички водачи носят гражданска отговорност", "Само собственикът", "Никой", "Само превозвачът"],
        // an ordinal about the WORLD, not about the option list
        ["Първият, който стигне до входа", "Трамваят", "Този отдясно", "Никой"],
        // numbers that are not a ladder
        ["50 км/ч", "20 км/ч", "90 км/ч", "30 км/ч"],
        // two options, one of them numeric — too short to be a sequence
        ["10 метра", "20 метра"],
      ];

      for (const texts of ordinary) {
        const question = q("q-plain", texts);
        expect(optionOrderIsFixed(question)).toBe(false);
        expect(orderOptionsForPractice(question, 0)).not.toBe(question.options);
      }
    });
  });
});

describe("practiceOptionSeed", () => {
  const AT = new Date("2026-07-24T09:00:00.000Z");

  it("is stable for one user inside the session window — a refresh re-renders the same order", () => {
    const later = new Date(AT.getTime() + OPTION_ORDER_WINDOW_MS - 1000);

    expect(practiceOptionSeed("u1", later)).toBe(practiceOptionSeed("u1", AT));
  });

  it("changes for the next sitting", () => {
    const nextWindow = new Date(AT.getTime() + OPTION_ORDER_WINDOW_MS);

    expect(practiceOptionSeed("u1", nextWindow)).not.toBe(
      practiceOptionSeed("u1", AT),
    );
  });

  it("differs per user, so an order cannot be traded across a classroom", () => {
    expect(practiceOptionSeed("u2", AT)).not.toBe(practiceOptionSeed("u1", AT));
  });
});
