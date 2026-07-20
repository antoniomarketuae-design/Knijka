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
  "media": null,                     // null or one of the media kinds below
  "status": "draft"                  // draft | needs-review | approved
}]
```

### Question media (THEO-1) — data-driven kinds only

No binary assets: every kind renders client-side from data this repo owns.
Validated by the loader AND `platform/scripts/validate-content.mjs` (lockstep).

**Sign face** — shows the project's own sign artwork (signs/svg via signs.json):
```json
"media": { "kind": "sign", "signRef": "В24" }
```
`signRef` must equal the `code` of a sign in `signs/signs.json` (load-time error
otherwise). Renders through the platform's sign artwork endpoint — never
copies of official drawings.

**Scene still** — a static top-down traffic scene over a committed district map
(`platform/public/world/<districtId>.json`, the sim's own world data):
```json
"media": {
  "kind": "sceneStill",
  "districtId": "tj-stop-v1",              // must exist in platform/public/world
  "focus": { "x": 0, "y": 0, "zoomM": 60 },// square window, zoomM meters wide, centered on (x, y)
  "poses": [                                // ≤ 12; x/y inside the focus window
    { "kind": "car", "x": -4, "y": -12, "headingDeg": 0, "variant": "ego" },
    { "kind": "ped", "x": 6, "y": 8, "headingDeg": 180 }
  ],
  "marks": [ { "kind": "danger", "x": 2, "y": 2 } ] // optional, ≤ 8, inside window
}
```
Pose kinds: `car | truck | bus | tram | bike | ped`; `variant: "ego"` marks the
learner's car. `headingDeg`: 0 = north, clockwise (sim trace convention).
`zoomM` ∈ [6, 500]. Mark kinds: `danger` (conflict point) | `target` (look here).

**Sign-face options** — for sign-identification questions the options themselves
may be signs; `textBg` stays REQUIRED (it is the accessible label):
```json
"options": [
  { "id": "a", "textBg": "Знак А", "correct": true,  "media": { "kind": "sign", "signRef": "Б2" } },
  { "id": "b", "textBg": "Знак Б", "correct": false, "media": { "kind": "sign", "signRef": "Б1" } }
]
```
Option media supports ONLY the sign kind. The legacy
`{ "type": "image|video", "ref": "…" }` question-media shape remains valid but
unused — prefer the data-driven kinds.

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
