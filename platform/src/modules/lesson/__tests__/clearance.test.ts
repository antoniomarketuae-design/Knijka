/**
 * THE GATE, verified against the real corpus rather than against itself.
 *
 * The defect this file exists to prevent was not a missing `if`. It was that
 * one door in `resolveSay` had a status check and the door beside it did not,
 * and nothing in the tree could tell you which was which. So the test that
 * matters is not „does `conceptClearance` return false" — that is the predicate
 * grading its own homework. It is:
 *
 *   WALK ALL 54 LESSONS AND ALL 510 BEATS THROUGH THE REAL RESOLVER, COLLECT
 *   EVERY SENTENCE THE CLASSROOM EMITS, AND ASSERT THAT NONE OF THEM IS THE
 *   TEXT OF A ROW THAT HAS NOT CLEARED.
 *
 * The forbidden set is built from `content/` — concepts whose summary is not
 * pinned, questions that are not `approved`, signs that are not `approved` —
 * so the assertion never consults the gate it is testing. If somebody deletes
 * the gate, this fails with the actual Bulgarian sentence a 17-year-old would
 * have heard, printed in the failure message.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";
import type { Concept } from "@/lib/content/types";
import {
  CLAIM_FREE_CLASSES,
  GATED_CLASSES,
  SAY_CLASS,
  conceptClearance,
  recentWithheldSources,
  resetWithheldSources,
  summaryFingerprint,
  type SayClass,
} from "../clearance";
import { CARRIED_CONCEPT_SUMMARIES, CARRY_CEILING } from "../clearanceCarry";
import { allLessons, resetLessonCache } from "../compose";
import { beatMaterials } from "../interrupt";
import { courseClearance, lessonClearance, resolveBeat, resolveOutline } from "../resolve";
import type { Beat, SayRef } from "../types";

const FIRST_AID = "l-accidents-first-aid";

/** A sibling file of the module under test, for the source-level assertions. */
function moduleFile(name: string): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..", name);
}

/** Every `SayRef` kind, listed. The type below fails to compile if one is missed. */
const ALL_SAY_SOURCES = [
  "concept",
  "question",
  "sign",
  "mistake",
  "teach",
  "rule",
  "topic",
  "frame",
] as const;
type MissingFromList = Exclude<SayRef["src"], (typeof ALL_SAY_SOURCES)[number]>;
type ExtraInList = Exclude<(typeof ALL_SAY_SOURCES)[number], SayRef["src"]>;
/** Compile-time half: adding a `SayRef` kind makes this line stop type-checking. */
const SOURCE_LIST_IS_EXHAUSTIVE: [MissingFromList, ExtraInList] extends [never, never]
  ? true
  : never = true;

beforeAll(() => {
  resetLessonCache();
});

beforeEach(() => {
  resetWithheldSources();
});

/** Every sentence the classroom emits, across the whole course. */
function everyUtterance(): Array<{ lessonId: string; beatId: string; textBg: string }> {
  const out: Array<{ lessonId: string; beatId: string; textBg: string }> = [];
  for (const lesson of allLessons()) {
    for (const beat of lesson.beats) {
      const resolved = resolveBeat(lesson.id, beat.id);
      if (resolved === null) continue;
      for (const utterance of resolved.utterances) {
        out.push({ lessonId: lesson.id, beatId: beat.id, textBg: utterance.textBg });
      }
    }
  }
  return out;
}

describe("the invariant — no beat emits text from an ungated source", () => {
  it("speaks no summary, explanation or sign meaning that has not cleared", () => {
    const repo = getContentRepo();

    // Built from CONTENT, never from the gate. A concept is forbidden when its
    // exact current sentence is not the one the carry froze; a question or a
    // sign when its own `status` is not `approved` — the same check
    // narration.ts:87 applies to authored text.
    const forbidden = new Map<string, string>();
    for (const concept of repo.concepts()) {
      const pinned = Object.hasOwn(CARRIED_CONCEPT_SUMMARIES, concept.id)
        ? CARRIED_CONCEPT_SUMMARIES[concept.id]
        : undefined;
      if (pinned === summaryFingerprint(concept.summaryBg)) continue;
      forbidden.set(concept.summaryBg, `concept ${concept.id}`);
    }
    for (const question of repo.questions()) {
      if (question.status === "approved") continue;
      forbidden.set(question.explanationBg, `question ${question.id} (${question.status})`);
    }
    for (const sign of repo.signs()) {
      if (sign.status === "approved") continue;
      forbidden.set(sign.meaningBg, `sign ${sign.code} (${sign.status})`);
    }
    expect(forbidden.size).toBeGreaterThan(0); // the corpus must still have teeth

    const leaks = everyUtterance()
      .filter((u) => forbidden.has(u.textBg))
      .map((u) => `${u.lessonId}/${u.beatId} spoke ${forbidden.get(u.textBg)}: „${u.textBg}"`);

    expect(leaks, `ungated material reached the classroom:\n${leaks.join("\n")}`).toEqual([]);
  });

  it("classifies every say source — a new kind cannot be added without a decision", () => {
    expect(SOURCE_LIST_IS_EXHAUSTIVE).toBe(true);
    expect(Object.keys(SAY_CLASS).sort()).toEqual([...ALL_SAY_SOURCES].sort());
    for (const src of ALL_SAY_SOURCES) {
      expect(SAY_CLASS[src], `${src} has no clearance class`).toBeTruthy();
    }
    // Every kind a composed beat actually uses must be classified. This is the
    // half the type system cannot do: compose.ts is free to start emitting a
    // source kind that was only theoretical when the table was written.
    const used = new Set<SayRef["src"]>();
    for (const lesson of allLessons()) {
      for (const beat of lesson.beats) for (const ref of beat.say) used.add(ref.src);
    }
    for (const src of used) {
      expect(Object.hasOwn(SAY_CLASS, src), `beats speak "${src}" and it is unclassified`).toBe(
        true,
      );
    }
  });

  /**
   * THE TABLE IS NOT SELF-ENFORCING, so this reads the resolver's source.
   *
   * `SAY_CLASS` says what a source kind's clearance IS; nothing in the type
   * system makes `resolveSay` consult it. That is precisely the gap the
   * original defect lived in — `concept` and `question` sat in one switch, one
   * of them checked and one not, and no reader could tell. So: every branch
   * whose class is gated must go through `gated(`, and every branch whose class
   * is not must NOT — which means reclassifying a source forces its code to
   * change in the same commit.
   */
  it("makes every gated branch of resolveSay actually call the gate", () => {
    const source = readFileSync(moduleFile("resolve.ts"), "utf8");
    const body = source.slice(source.indexOf("switch (ref.src)"));
    for (const src of ALL_SAY_SOURCES) {
      const start = body.indexOf(`case "${src}":`);
      expect(start, `resolveSay has no branch for "${src}"`).toBeGreaterThan(-1);
      const rest = body.slice(start + 1);
      const next = rest.indexOf(`case "`);
      const branch = next < 0 ? rest : rest.slice(0, next);
      const callsGate = branch.includes("gated(");
      expect(
        callsGate,
        SAY_CLASS[src] === "signed" || SAY_CLASS[src] === "carried"
          ? `"${src}" is classified ${SAY_CLASS[src]} but its branch releases text without gated()`
          : `"${src}" is classified ${SAY_CLASS[src]} yet calls gated() — reclassify it or drop the call`,
      ).toBe(GATED_CLASSES.has(SAY_CLASS[src]));
    }
  });

  it("makes the interruption door consult the same gate", () => {
    const source = readFileSync(moduleFile("interrupt.ts"), "utf8");
    // beatMaterials feeds the model's Tier-1 grounding AND, with no API key,
    // is served to the student verbatim by bestMaterialFor. All three corpora
    // it reads must pass the same check the spoken line does.
    for (const check of ["conceptClearance", "questionClearance", "signClearance"]) {
      expect(source, `interrupt.ts stopped calling ${check}`).toContain(`${check}(`);
    }
  });

  it("holds the ungated classes to the frames.ts contract: no rule, no number, no article", () => {
    const repo = getContentRepo();
    const claimFree: SayClass[] = [...CLAIM_FREE_CLASSES];
    expect(claimFree.sort()).toEqual(["agenda", "frame"]);

    // `topic` is spoken without a status check because a topic description is a
    // table of contents. The moment one states a rule, that justification is
    // gone — so it is checked, not assumed.
    for (const topic of repo.topics()) {
      expect(topic.descriptionBg, `${topic.id} names an article`).not.toMatch(/чл\.|ал\./);
      expect(topic.descriptionBg, `${topic.id} states a figure`).not.toMatch(/\d/);
    }
  });
});

describe("the first-aid lesson — what the classroom says today", () => {
  it("no longer speaks the superseded recovery-position instruction", () => {
    const beat = resolveBeat(FIRST_AID, "b4-explain");
    expect(beat).not.toBeNull();
    const said = beat?.utterances.map((u) => u.textBg).join("\n") ?? "";
    // ERC 2025 (content/medical/tools/erc2025_layperson.txt:768): „In cases of
    // not normal breathing or trauma, do NOT move the person into the recovery
    // position." q-ptp-022 grades the opposite of what this beat used to say.
    expect(said).not.toContain("стабилно странично положение");
    expect(said).not.toContain("каска се сваля");
    expect(beat?.utterances.every((u) => u.frame)).toBe(true);
    expect(said).toContain("проверява от преподавател");
  });

  it("does not speak the superseded call order or the wrong CPR threshold", () => {
    const b1 = resolveBeat(FIRST_AID, "b1-explain");
    const b2 = resolveBeat(FIRST_AID, "b2-explain");
    // RCUK Adult BLS 2025 (content/medical/tools/rcuk_bls.txt:130): „Call 999
    // for any unresponsive person. Rescuers no longer need to confirm abnormal
    // breathing before calling." The old summary taught огледай → звънни.
    expect(b1?.utterances.map((u) => u.textBg).join("\n")).not.toContain("разтърсване на раменете");
    // RCUK First Aid 2025 (content/medical/tools/rcuk_fa.txt:141) stops CPR
    // also when the person responds or „the rescuer becomes exhausted".
    expect(b2?.utterances.map((u) => u.textBg).join("\n")).not.toContain("Не спирай до идването");
  });

  it("records every withholding, with a reason, and names no user", () => {
    for (const beat of allLessons().find((l) => l.id === FIRST_AID)?.beats ?? []) {
      resolveBeat(FIRST_AID, beat.id);
    }
    const records = recentWithheldSources().filter((r) => r.lessonId === FIRST_AID);
    expect(records.map((r) => r.id).sort()).toEqual([
      "c-bleeding-control",
      "c-cpr-basics",
      "c-first-aid-priorities",
      "c-victim-handling",
    ]);
    for (const record of records) {
      expect(record.reason).toBe("concept-not-carried");
      expect(record.src).toBe("concept");
      expect(Object.keys(record)).not.toContain("userId");
    }
  });

  it("offers no chip whose only answer would be withheld material", () => {
    const beat = resolveBeat(FIRST_AID, "b4-explain");
    const intents = (beat?.chips ?? [])
      .filter((c) => c.kind === "ask")
      .map((c) => (c.kind === "ask" ? c.intent : ""));
    expect(intents).not.toContain("why");
    expect(intents).not.toContain("law");
  });

  it("reports itself as teaching nothing, so the silence is a number and not a vibe", () => {
    const census = lessonClearance(FIRST_AID);
    expect(census).toEqual({
      lessonId: FIRST_AID,
      titleBg: "Първа помощ",
      teachingBeats: 4,
      speaking: 0,
      withheld: 4,
      // The second half of the finding, unchanged by this wave: all 29 rows are
      // needs-review, isLessonEligible requires `approved`, so the lesson asks
      // nothing. A student who hears a withheld beat is not quizzed on it
      // either — which is now consistent rather than dangerous.
      quizDealt: 0,
      // …and now the number is ACTED ON rather than merely available. Nothing
      // outside this module read the census; the lesson was in the hub behind
      // an ordinary link.
      offer: "in-preparation",
    });
  });

  it("still walks: the outline keeps a pause point for every beat", () => {
    const outline = resolveOutline(FIRST_AID);
    expect(outline?.beats.length).toBe(6);
    for (const beat of outline?.beats ?? []) {
      expect(beat.sayCount, `${beat.id} would be silently skipped`).toBeGreaterThan(0);
    }
  });
});

describe("the interruption door — the same gate", () => {
  function syntheticBeat(partial: Partial<Beat>): Beat {
    return {
      id: "b-test",
      kind: "explain",
      tone: "explain",
      say: [],
      conceptIds: [],
      questionIds: [],
      ruleCodes: [],
      signIds: [],
      board: null,
      questionCount: 0,
      ...partial,
    };
  }

  it("injects no withheld concept, unapproved question or unapproved sign as grounding", () => {
    const repo = getContentRepo();
    const unapprovedQuestion = repo.questions().find((q) => q.status !== "approved");
    const unapprovedSign = repo.signs().find((s) => s.status !== "approved");
    expect(unapprovedQuestion).toBeDefined();
    expect(unapprovedSign).toBeDefined();

    const materials = beatMaterials(
      syntheticBeat({
        conceptIds: ["c-victim-handling"],
        questionIds: [unapprovedQuestion?.id ?? ""],
        signIds: [unapprovedSign?.code ?? ""],
      }),
    );
    expect(materials).toEqual([]);
  });

  it("still injects cleared material — the gate is not a mute button", () => {
    const repo = getContentRepo();
    const carried = repo
      .concepts()
      .find((c: Concept) => CARRIED_CONCEPT_SUMMARIES[c.id] === summaryFingerprint(c.summaryBg));
    const approved = repo.questions().find((q) => q.status === "approved");
    const materials = beatMaterials(
      syntheticBeat({ conceptIds: [carried?.id ?? ""], questionIds: [approved?.id ?? ""] }),
    );
    expect(materials.map((m) => m.kind)).toEqual(["concept", "question"]);
  });
});

describe("the carry — a ledger that may only shrink", () => {
  it("stays at or under the frozen ceiling", () => {
    const size = Object.keys(CARRIED_CONCEPT_SUMMARIES).length;
    expect(
      size,
      "the carry grew. A summary is added to it by a HUMAN reading it, never to quiet a test.",
    ).toBeLessThanOrEqual(CARRY_CEILING);
  });

  /**
   * THIS ASSERTION USED TO BE `expect(stale).toEqual([])`, AND THAT IS WHY THE
   * ELEVEN PINS MOVED.
   *
   * A stale pin is the CORRECT resting state of this gate: a content wave
   * edited a summary, the sentence we froze is no longer the sentence in the
   * file, and the classroom has gone quiet on it until a person reads the new
   * one. The old assertion called that state a test failure — so every content
   * edit turned the suite red, and `freeze-lesson-carry.mjs`'s bulk re-pin was
   * the obvious way back to green. It was run once and moved eleven pins to
   * text nobody had read. The check created the pressure that defeated it.
   *
   * What is asserted now is the property that actually matters, and it holds
   * no matter how many rows are stale: A STALE PIN DOES NOT SPEAK. Orphans are
   * still an error, because a pin naming a concept that no longer exists is
   * dead weight nobody will ever clear.
   */
  it("withholds every summary that no longer matches what covered it", () => {
    const repo = getContentRepo();
    const stale: string[] = [];
    const orphaned: string[] = [];
    for (const [conceptId, pin] of Object.entries(CARRIED_CONCEPT_SUMMARIES)) {
      const concept = repo.conceptById(conceptId);
      if (concept === undefined) {
        orphaned.push(conceptId);
        continue;
      }
      if (summaryFingerprint(concept.summaryBg) !== pin) stale.push(conceptId);
    }
    expect(orphaned, `carried concepts that no longer exist: ${orphaned.join(", ")}`).toEqual([]);

    // The corpus must still exercise this path. If nothing is ever stale the
    // assertion below proves nothing, and the day one appears is the day it
    // has to work.
    const spoken = new Set(everyUtterance().map((u) => u.textBg));
    for (const conceptId of stale) {
      const concept = repo.conceptById(conceptId);
      expect(
        conceptClearance(concept as Concept).cleared,
        `${conceptId} was edited after its pin and still cleared`,
      ).toBe(false);
      expect(
        spoken.has((concept as Concept).summaryBg),
        `${conceptId} was edited after its pin and the classroom spoke it anyway`,
      ).toBe(false);
    }
  });

  it("does not carry the four first-aid summaries the 2025 regrounding contradicts", () => {
    for (const id of [
      "c-first-aid-priorities",
      "c-cpr-basics",
      "c-bleeding-control",
      "c-victim-handling",
    ]) {
      expect(Object.hasOwn(CARRIED_CONCEPT_SUMMARIES, id), `${id} must not be carried`).toBe(false);
    }
  });
});

describe("the census — the blast radius, counted", () => {
  /**
   * NOT a hard-coded list of lesson ids. `content/concepts.json` is under
   * active edit by a parallel content wave and every edit un-pins a summary by
   * design, so a fixed list would go red on somebody else's correct work and
   * teach the next person that this file cries wolf. What is asserted instead
   * is the LINKAGE: every lesson the census names must have a beat whose
   * concept genuinely failed clearance, and the first-aid lesson — whose four
   * summaries are permanently uncarried — is always in it.
   */
  it("names only lessons that really lost a source, and always names first aid", () => {
    const repo = getContentRepo();
    const census = courseClearance();
    expect(census.map((c) => c.lessonId)).toContain(FIRST_AID);

    for (const entry of census) {
      expect(entry.withheld).toBeGreaterThan(0);
      const lesson = allLessons().find((l) => l.id === entry.lessonId);
      const uncleared = (lesson?.beats ?? []).some((beat) =>
        beat.say.some((ref) => {
          if (ref.src !== "concept") return false;
          const concept = repo.conceptById(ref.conceptId);
          if (concept === undefined) return false;
          const pinned = Object.hasOwn(CARRIED_CONCEPT_SUMMARIES, concept.id)
            ? CARRIED_CONCEPT_SUMMARIES[concept.id]
            : undefined;
          return pinned !== summaryFingerprint(concept.summaryBg);
        }),
      );
      expect(uncleared, `${entry.lessonId} was quieted with no uncleared source`).toBe(true);
    }
  });

  it("does not quiet a lesson whose sources all cleared", () => {
    const quieted = new Set(courseClearance().map((c) => c.lessonId));
    const untouched = allLessons().filter((l) => !quieted.has(l.id));
    expect(untouched.length).toBeGreaterThan(0);
    for (const lesson of untouched) {
      expect(lessonClearance(lesson.id)?.withheld, `${lesson.id} lost a beat`).toBe(0);
    }
  });
});
