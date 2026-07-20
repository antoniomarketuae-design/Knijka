/**
 * Tests for the content loader: the real /content files must load, index and
 * cross-reference cleanly, and deliberately-broken in-memory fixtures must be
 * rejected by the exact same validation pipeline.
 */
import { describe, expect, it } from "vitest";
import { buildContentRepo, contentRepo } from "./loader";
import { makeSceneStillQuestion, makeSignMediaQuestion } from "./mediaFixtures";
import { getContentRepo } from "./repo";
import type { Question, SceneStillMedia } from "./types";

// --------------------------------------------------------------------------
// Real repo content (loaded from /content at module init)
// --------------------------------------------------------------------------

describe("loader on real /content", () => {
  it("registers itself as the global ContentRepo", () => {
    expect(getContentRepo()).toBe(contentRepo);
  });

  it("loads non-empty content", () => {
    expect(contentRepo.topics().length).toBeGreaterThan(0);
    expect(contentRepo.concepts().length).toBeGreaterThan(0);
    expect(contentRepo.questions().length).toBeGreaterThan(0);
    expect(contentRepo.signs().length).toBeGreaterThan(0);
  });

  it("returns topics sorted by order and resolvable by slug", () => {
    const topics = contentRepo.topics();
    for (let i = 1; i < topics.length; i++) {
      expect(topics[i].order).toBeGreaterThan(topics[i - 1].order);
    }
    for (const topic of topics) {
      expect(contentRepo.topicBySlug(topic.slug)).toBe(topic);
    }
  });

  it("has full referential integrity across concepts", () => {
    const topicIds = new Set(contentRepo.topics().map((t) => t.id));
    for (const concept of contentRepo.concepts()) {
      expect(topicIds.has(concept.topicId)).toBe(true);
      for (const dep of concept.dependsOn) {
        expect(contentRepo.conceptById(dep)).toBeDefined();
      }
      // prerequisites() resolves every dependsOn entry
      expect(contentRepo.prerequisites(concept.id).map((c) => c.id)).toEqual(concept.dependsOn);
    }
  });

  it("has full referential integrity across questions", () => {
    for (const question of contentRepo.questions()) {
      expect(contentRepo.questionById(question.id)).toBe(question);
      for (const conceptId of question.conceptIds) {
        expect(contentRepo.conceptById(conceptId)).toBeDefined();
      }
    }
  });

  it("partitions every question into exactly one topic", () => {
    const total = contentRepo
      .topics()
      .reduce((sum, topic) => sum + contentRepo.questionsByTopic(topic.slug).length, 0);
    expect(total).toBe(contentRepo.questions().length);
  });

  it("groups concepts by topic without losing any", () => {
    const total = contentRepo
      .topics()
      .reduce((sum, topic) => sum + contentRepo.conceptsByTopic(topic.id).length, 0);
    expect(total).toBe(contentRepo.concepts().length);
  });

  it("partitions EVERY concept into exactly one section, with unique section ids", () => {
    const sections = contentRepo.sections?.() ?? [];
    expect(sections.length).toBeGreaterThanOrEqual(50); // 50+ finer study chunks

    // Section ids are unique.
    const ids = sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);

    // Every concept lands in exactly one section — no orphan, no duplicate.
    const assignments = new Map<string, number>();
    for (const section of sections) {
      for (const conceptId of section.conceptIds) {
        assignments.set(conceptId, (assignments.get(conceptId) ?? 0) + 1);
      }
    }
    for (const concept of contentRepo.concepts()) {
      expect(assignments.get(concept.id)).toBe(1);
    }
    // No section references a concept that does not exist / total count matches.
    const totalAssigned = [...assignments.values()].reduce((a, b) => a + b, 0);
    expect(totalAssigned).toBe(contentRepo.concepts().length);
  });

  it("groups sections under their parent topic; every section concept is in that topic", () => {
    let total = 0;
    for (const topic of contentRepo.topics()) {
      const sections = contentRepo.sectionsByTopic?.(topic.id) ?? [];
      total += sections.length;
      for (const section of sections) {
        expect(section.topicId).toBe(topic.id);
        for (const conceptId of section.conceptIds) {
          expect(contentRepo.conceptById(conceptId)?.topicId).toBe(topic.id);
        }
      }
    }
    expect(total).toBe((contentRepo.sections?.() ?? []).length);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(contentRepo)).toBe(true);
    expect(Object.isFrozen(contentRepo.topics())).toBe(true);
    expect(Object.isFrozen(contentRepo.questions())).toBe(true);
    expect(Object.isFrozen(contentRepo.questions()[0])).toBe(true);
    expect(Object.isFrozen(contentRepo.signs())).toBe(true);
  });
});

// --------------------------------------------------------------------------
// Broken in-memory fixtures must fail validation
// --------------------------------------------------------------------------

/** Minimal valid content fixture; each test mutates one aspect to break it. */
function fixtureData() {
  return {
    topics: [
      {
        id: "t-basics",
        order: 1,
        slug: "osnovni",
        titleBg: "Основи",
        titleEn: "Basics",
        descriptionBg: "Тест",
      },
    ],
    concepts: [
      {
        id: "c-root",
        topicId: "t-basics",
        titleBg: "Корен",
        titleEn: "Root",
        summaryBg: "Тест",
        dependsOn: [] as string[],
        lawRefs: [{ act: "ЗДвП", ref: "чл. 5" }],
        difficulty: 1,
      },
      {
        id: "c-leaf",
        topicId: "t-basics",
        titleBg: "Лист",
        titleEn: "Leaf",
        summaryBg: "Тест",
        dependsOn: ["c-root"],
        lawRefs: [{ act: "ЗДвП", ref: "чл. 6" }],
        difficulty: 2,
      },
    ],
    questionsBySlug: {
      osnovni: [
        {
          id: "q-osnovni-001",
          conceptIds: ["c-root"],
          type: "single",
          points: 1,
          textBg: "Въпрос?",
          options: [
            { id: "a", textBg: "Да", correct: true },
            { id: "b", textBg: "Не", correct: false },
          ],
          explanationBg: "Защото.",
          lawRefs: [{ act: "ЗДвП", ref: "чл. 5" }],
          media: null,
          status: "draft",
        },
        {
          id: "q-osnovni-002",
          conceptIds: ["c-leaf"],
          type: "multi",
          points: 2,
          textBg: "Кои?",
          options: [
            { id: "a", textBg: "Първо", correct: true },
            { id: "b", textBg: "Второ", correct: true },
            { id: "c", textBg: "Трето", correct: false },
          ],
          explanationBg: "Защото.",
          lawRefs: [{ act: "ЗДвП", ref: "чл. 6" }],
          media: null,
          status: "approved",
        },
      ],
    },
    sections: [
      { id: "s-root", topicId: "t-basics", titleBg: "Корен", conceptIds: ["c-root"] },
      { id: "s-leaf", topicId: "t-basics", titleBg: "Лист", conceptIds: ["c-leaf"] },
    ],
    signs: [
      {
        id: "sign-b2",
        code: "Б2",
        group: "Б",
        nameBg: "Спри!",
        meaningBg: "Спираш винаги.",
        svgFile: "signs/svg/b2.svg",
        lawRefs: [{ act: "Наредба РД-02-21-1/2023", ref: "знак Б2" }],
        status: "draft",
      },
    ],
  };
}

function build(
  data: ReturnType<typeof fixtureData>,
  svgExists: (f: string) => boolean = () => true,
  districtExists: (d: string) => boolean = () => true,
) {
  return buildContentRepo({ ...data, svgExists, districtExists });
}

describe("buildContentRepo on fixtures", () => {
  it("accepts the valid fixture and serves it through the repo API", () => {
    const repo = build(fixtureData());
    expect(repo.topics().map((t) => t.id)).toEqual(["t-basics"]);
    expect(repo.questionsByTopic("osnovni")).toHaveLength(2);
    expect(repo.questionsByConcept("c-root").map((q) => q.id)).toEqual(["q-osnovni-001"]);
    expect(repo.prerequisites("c-leaf").map((c) => c.id)).toEqual(["c-root"]);
    expect(Object.isFrozen(repo)).toBe(true);
    expect(Object.isFrozen(repo.questions())).toBe(true);
  });

  it("serves sections through the repo API", () => {
    const repo = build(fixtureData());
    expect(repo.sections?.()?.map((s) => s.id)).toEqual(["s-root", "s-leaf"]);
    expect(repo.sectionById?.("s-leaf")?.conceptIds).toEqual(["c-leaf"]);
    expect(repo.sectionsByTopic?.("t-basics")?.map((s) => s.id)).toEqual(["s-root", "s-leaf"]);
    expect(Object.isFrozen(repo.sections?.())).toBe(true);
  });

  it("rejects a section referencing an unknown concept", () => {
    const data = fixtureData();
    data.sections[0].conceptIds = ["c-ghost"];
    expect(() => build(data)).toThrow(/section "s-root" references unknown concept "c-ghost"/);
  });

  it("rejects a concept assigned to no section (orphan)", () => {
    const data = fixtureData();
    data.sections.pop(); // drop s-leaf → c-leaf now uncovered
    expect(() => build(data)).toThrow(/concept "c-leaf" is not assigned to any section/);
  });

  it("rejects a concept assigned to more than one section", () => {
    const data = fixtureData();
    data.sections[1].conceptIds = ["c-root", "c-leaf"]; // c-root now in both
    expect(() => build(data)).toThrow(/concept "c-root" appears in multiple sections/);
  });

  it("rejects a section pointing at an unknown topic", () => {
    const data = fixtureData();
    data.sections[0].topicId = "t-ghost";
    expect(() => build(data)).toThrow(/section "s-root" references unknown topicId "t-ghost"/);
  });

  it('rejects a "single" question with 2 correct options', () => {
    const data = fixtureData();
    data.questionsBySlug.osnovni[0].options[1].correct = true;
    expect(() => build(data)).toThrow(/exactly 1 correct option, found 2/);
  });

  it('rejects a "multi" question with only 1 correct option', () => {
    const data = fixtureData();
    data.questionsBySlug.osnovni[1].options[1].correct = false;
    expect(() => build(data)).toThrow(/at least 2 correct options, found 1/);
  });

  it("rejects duplicate option ids within a question", () => {
    const data = fixtureData();
    data.questionsBySlug.osnovni[0].options[1].id = "a";
    expect(() => build(data)).toThrow(/option ids must be unique/);
  });

  it("rejects points outside {1,2,3}", () => {
    const data = fixtureData();
    data.questionsBySlug.osnovni[0].points = 4;
    expect(() => build(data)).toThrow(/questions\/osnovni\.json/);
  });

  it("rejects an unknown status", () => {
    const data = fixtureData();
    data.questionsBySlug.osnovni[0].status = "published";
    expect(() => build(data)).toThrow(/questions\/osnovni\.json/);
  });

  it("rejects unrecognized keys (strict schemas)", () => {
    const data = fixtureData();
    (data.topics[0] as Record<string, unknown>).extra = true;
    expect(() => build(data)).toThrow(/[Uu]nrecognized key/);
  });

  it("rejects a concept pointing at an unknown topic", () => {
    const data = fixtureData();
    data.concepts[0].topicId = "t-ghost";
    expect(() => build(data)).toThrow(/unknown topicId "t-ghost"/);
  });

  it("rejects a dependsOn reference to an unknown concept", () => {
    const data = fixtureData();
    data.concepts[1].dependsOn = ["c-ghost"];
    expect(() => build(data)).toThrow(/dependsOn unknown concept "c-ghost"/);
  });

  it("rejects a question referencing an unknown concept", () => {
    const data = fixtureData();
    data.questionsBySlug.osnovni[0].conceptIds = ["c-ghost"];
    expect(() => build(data)).toThrow(/references unknown concept "c-ghost"/);
  });

  it("rejects a dependency cycle", () => {
    const data = fixtureData();
    data.concepts[0].dependsOn = ["c-leaf"]; // c-root -> c-leaf -> c-root
    expect(() => build(data)).toThrow(/cycle detected/);
  });

  it("rejects globally duplicated ids", () => {
    const data = fixtureData();
    data.signs[0].id = "sign-dupe";
    data.signs.push({ ...fixtureData().signs[0], id: "sign-dupe" });
    expect(() => build(data)).toThrow(/duplicate id "sign-dupe"/);
  });

  it("rejects a question file whose slug matches no topic", () => {
    const data = fixtureData();
    (data.questionsBySlug as Record<string, unknown>)["prizrak"] = [];
    expect(() => build(data)).toThrow(/no topic with slug "prizrak"/);
  });

  it("rejects a sign whose svg asset is missing", () => {
    const data = fixtureData();
    expect(() => build(data, () => false)).toThrow(/svgFile "signs\/svg\/b2\.svg" does not exist/);
  });

  it("rejects a concept without lawRefs", () => {
    const data = fixtureData();
    data.concepts[0].lawRefs = [];
    expect(() => build(data)).toThrow(/concepts\.json/);
  });
});

// --------------------------------------------------------------------------
// THEO-1 media kinds: sign faces + scene stills
// --------------------------------------------------------------------------

/** Narrow a fixture's media to the sceneStill member (or fail loudly). */
function sceneOf(q: Question): SceneStillMedia {
  if (q.media === null || !("kind" in q.media) || q.media.kind !== "sceneStill") {
    throw new Error("fixture drifted");
  }
  return q.media;
}

/** Fixture bank + extra (possibly broken) media questions in osnovni. */
function buildWithMedia(
  extraQuestions: unknown[],
  districtExists: (d: string) => boolean = () => true,
) {
  const data = fixtureData();
  return buildContentRepo({
    ...data,
    questionsBySlug: { osnovni: [...data.questionsBySlug.osnovni, ...extraQuestions] },
    svgExists: () => true,
    districtExists,
  });
}

describe("buildContentRepo — question media (THEO-1)", () => {
  it("accepts sign and sceneStill media questions and serves them unchanged", () => {
    const repo = buildWithMedia([makeSignMediaQuestion(), makeSceneStillQuestion()]);
    const sign = repo.questionById("q-media-sign");
    expect(sign?.media).toEqual({ kind: "sign", signRef: "Б2" });
    expect(sign?.options[0].media).toEqual({ kind: "sign", signRef: "Б2" });
    expect(sign?.options[1].media).toBeUndefined();
    const scene = repo.questionById("q-media-scene");
    expect(scene?.media).toMatchObject({ kind: "sceneStill", districtId: "tj-stop-v1" });
  });

  it("rejects a question media signRef with no matching sign code", () => {
    const q = makeSignMediaQuestion();
    q.media = { kind: "sign", signRef: "Х99" };
    expect(() => buildWithMedia([q])).toThrow(/media references unknown signRef "Х99"/);
  });

  it("rejects an OPTION media signRef with no matching sign code", () => {
    const q = makeSignMediaQuestion();
    q.options[0].media = { kind: "sign", signRef: "Х99" };
    expect(() => buildWithMedia([q])).toThrow(
      /option "a" media references unknown signRef "Х99"/,
    );
  });

  it("rejects a sceneStill whose district map does not exist", () => {
    expect(() => buildWithMedia([makeSceneStillQuestion()], () => false)).toThrow(
      /unknown districtId "tj-stop-v1"/,
    );
  });

  it("treats every district as unknown when districtExists is not provided", () => {
    const data = fixtureData();
    expect(() =>
      buildContentRepo({
        ...data,
        questionsBySlug: {
          osnovni: [...data.questionsBySlug.osnovni, makeSceneStillQuestion()],
        },
        svgExists: () => true,
      }),
    ).toThrow(/unknown districtId/);
  });

  it("rejects a pose outside the focus window", () => {
    const q = makeSceneStillQuestion();
    sceneOf(q).poses[0] = { kind: "car", x: 31, y: 0, headingDeg: 0 }; // zoomM 60 → ±30
    expect(() => buildWithMedia([q])).toThrow(/outside the focus window/);
  });

  it("rejects a mark outside the focus window", () => {
    const q = makeSceneStillQuestion();
    sceneOf(q).marks = [{ kind: "danger", x: 0, y: -31 }];
    expect(() => buildWithMedia([q])).toThrow(/outside the focus window/);
  });

  it("rejects a zoomM outside the allowed range", () => {
    const q = makeSceneStillQuestion();
    sceneOf(q).focus.zoomM = 2;
    expect(() => buildWithMedia([q])).toThrow(/questions\/osnovni\.json/);
  });

  it("rejects a districtId that is not kebab-case (fetch-URL charset lock)", () => {
    const q = makeSceneStillQuestion();
    (sceneOf(q) as { districtId: string }).districtId = "../secrets";
    expect(() => buildWithMedia([q])).toThrow(/questions\/osnovni\.json/);
  });

  it("rejects an unknown media kind", () => {
    const q = makeSignMediaQuestion();
    (q as { media: unknown }).media = { kind: "hologram", ref: "x" };
    expect(() => buildWithMedia([q])).toThrow(/questions\/osnovni\.json/);
  });

  it("rejects non-sign option media", () => {
    const q = makeSignMediaQuestion();
    (q.options[1] as { media?: unknown }).media = {
      kind: "sceneStill",
      districtId: "tj-stop-v1",
      focus: { x: 0, y: 0, zoomM: 60 },
      poses: [],
    };
    expect(() => buildWithMedia([q])).toThrow(/questions\/osnovni\.json/);
  });

  it("still accepts the legacy image/video media shape", () => {
    const q = makeSignMediaQuestion("q-media-legacy");
    q.media = { type: "image", ref: "media/foo.png" };
    q.options[0].media = undefined;
    const repo = buildWithMedia([q]);
    expect(repo.questionById("q-media-legacy")?.media).toEqual({
      type: "image",
      ref: "media/foo.png",
    });
  });
});
