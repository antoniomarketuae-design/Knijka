# Content Data Contract (v1)

> All learning content lives here as versioned JSON. This contract is the interface between content-generation agents, the platform code, and the AI tutor's grounding layer. Bulgarian (`Bg`) is the primary language. Every generated item starts as `"status": "draft"` — nothing ships without review (docs/education/61).

## Files

```
content/
  topics.json              # curriculum topics (ordered)
  concepts.json            # knowledge-graph nodes
  sections.json            # presentation grouping of concepts (finer than topics)
  questions/<topic-slug>.json
  signs/signs.json         # road sign catalog
  audits/<topic-slug>.audit.json
```

## topics.json
```json
[{
  "id": "t-priority",            // stable id, "t-" prefix
  "order": 4,
  "slug": "priority",            // kebab-case, used for question filenames
  "titleBg": "Предимство",
  "titleEn": "Right of way",
  "descriptionBg": "…"
}]
```

## concepts.json
```json
[{
  "id": "c-uncontrolled-junction",   // "c-" prefix
  "topicId": "t-priority",
  "titleBg": "Предимство на нерегулирано кръстовище",
  "titleEn": "Priority at uncontrolled junctions",
  "summaryBg": "1–3 sentences, plain student language",
  "dependsOn": ["c-junction-types"],  // concept ids that must be understood first
  "lawRefs": [{ "act": "ЗДвП", "ref": "чл. 47" }],
  "difficulty": 2                     // 1–3
}]
```

## sections.json
```json
[{
  "id": "s-warning-signs",         // "s-" prefix, kebab-case
  "topicId": "t-signs",            // parent topic
  "titleBg": "Предупредителни знаци",
  "conceptIds": ["c-sign-groups", "c-warning-signs"]  // >= 1, all within topicId
}]
```
A **section** is a named, finer-grained study chunk *inside* one topic — a
PRESENTATION/navigation layer only (docs/architecture/05). The learning engine
(mastery, SM-2, prerequisite gating, readiness) keys on **concepts**, and the
mock exam samples on **topicId** + point weights — sections touch neither.
Section mastery is simply the aggregate of its concepts. Rules:

1. Every `conceptId` must resolve and must belong to the section's `topicId`.
2. **Sections partition the concept graph: every concept appears in exactly one
   section — no orphans, no duplicates** (validated at load and in
   `validate:content`).
3. Ids globally unique; file order defines display order (within a topic).

## questions/<topic-slug>.json
```json
[{
  "id": "q-priority-001",
  "conceptIds": ["c-uncontrolled-junction"],
  "type": "single",                  // "single" | "multi" (multi = select ALL correct)
  "points": 2,                       // 1 | 2 | 3 — mirror official weighting (doc 32)
  "textBg": "…question text…",
  "options": [
    { "id": "a", "textBg": "…", "correct": false },
    { "id": "b", "textBg": "…", "correct": true }
  ],
  "explanationBg": "One-breath explanation WHY (teen-readable), cites the rule",
  "lawRefs": [{ "act": "ЗДвП", "ref": "чл. 47" }],
  "media": null,                     // future: { "type": "image|video", "ref": "…" }
  "status": "draft"                  // draft | needs-review | approved
}]
```

## signs/signs.json
```json
[{
  "id": "sign-b2",
  "code": "Б2",                      // official code
  "group": "Б",                      // А Б В Г Д Е (+ markings later)
  "nameBg": "Спри! Пропусни движещите се по пътя с предимство!",
  "meaningBg": "…driver-facing meaning…",
  "svgFile": "signs/svg/b2.svg",
  "lawRefs": [{ "act": "Наредба РД-02-21-1/2023", "ref": "…" }],
  "status": "draft"
}]
```

## Hard rules for generators

1. **ORIGINAL questions only.** Never copy or closely paraphrase official listovki items (copyright risk R5). Same concepts, fresh wording and scenarios.
2. **Every question and concept cites its legal basis** (`lawRefs`). If unsure of the exact article → `"status": "needs-review"` and an honest ref guess with `"?"` suffix.
3. Valid UTF-8 JSON, no trailing commas, ids unique across the whole repo, every `conceptIds`/`dependsOn`/`topicId` must resolve.
4. Bulgarian text natural and modern (17-year-old reader), not bureaucratic prose.
5. Distribution guidance per topic file: ~60% single / 40% multi; points mix ≈ 40% ×1, 40% ×2, 20% ×3.
