# Content Data Contract (v1)

> All learning content lives here as versioned JSON. This contract is the interface between content-generation agents, the platform code, and the AI tutor's grounding layer. Bulgarian (`Bg`) is the primary language. **A generator may never write `"status": "approved"` — that word means a person read the row, and it is only true when `review/approvals.json` carries their signature.** See [status — what the word means](#status--what-the-word-means).

## Files

```
content/
  topics.json              # curriculum topics (ordered)
  concepts.json            # knowledge-graph nodes
  sections.json            # presentation grouping of concepts (finer than topics)
  questions/<topic-slug>.json
  signs/signs.json         # road sign catalog
  audits/<topic-slug>.audit.json
  review/approvals.json    # the human-signature ledger — who approved what, over which text
  law/                     # the law source layer — see law/README.md
    sources.json           #   source register (URL + sha256 + coverage per document)
    acts/<act-id>.json     #   article-addressable statute text, verbatim
    penalties.json         #   penalties expressed as THREE separate systems
```

## status — what the word means

`status` had three values and one job it could not do: tell a machine's opinion
apart from a person's. The law-vs-bank audit measured the cost —
**1,005 of 1,089 questions were marked `approved`, including 22 of the 24 with a
wrong answer key and all nine that are literally unanswerable**
(docs/education/90 §1). Not one had been read by a human. The flag was recording
that a generator ran.

So the vocabulary now names the two things separately.

| status | who may write it | what it asserts | reaches a student |
| --- | --- | --- | --- |
| `draft` | author / generator | being written; incomplete on purpose | no |
| `machine-checked` | **generator** | generated, and it passes every automated check in `validate:content` — **nobody has read it** | no |
| `needs-review` | auditor, fix wave, reviewer | a person or an audit named a specific problem, or a `lawRef` carries the `"?"` marker | no |
| `approved` | **only the review tool, on a human's click** | a named person read *this exact text* and stands behind it | **yes — and only with a signature** |

**`machine-checked` is the honest ceiling for anything automated.** A generator
that has done everything right writes `machine-checked`, never `approved`. There
is no path from `machine-checked` to `approved` that does not pass through a
human at `/review`.

### The signature — `review/approvals.json`

A status string sits inside the row it is describing, so nothing about it can be
checked. Authority therefore lives outside the row:

```json
{
  "version": 1,
  "readmeBg": "…",
  "unsignedApprovedBaseline": 846,     // the frozen ceiling — see the ratchet below
  "baselineFrozenAt": "2026-08-03",
  "entries": [{
    "questionId": "q-priority-001",
    "verdict": "approved",             // approved | rejected
    "by": "Антонио",                   // from the SERVER session — never the request body
    "at": "2026-08-03T09:14:22.101Z",
    "contentHash": "sha256:…",         // the row as it stood when it was signed
    "noteBg": null
  }]
}
```

A question is **human-approved** when, and only when, all of these hold:

1. `status` is `approved`,
2. `entries` holds an `approved` entry for its id, naming a person and a time, and
3. that entry's `contentHash` still equals the row's current hash.

`contentHash` is `sha256` over the graded content — stem, every option (id, text,
`correct`, sign face), explanation, `lawRefs`, `media`, `type`, `points` — in the
canonical field order defined by `tools/theory/question_hash.mjs` and its
TypeScript mirror `platform/src/modules/content-admin/hash.ts`. It deliberately
excludes `status` (or approving would invalidate its own signature) and
`conceptIds` (curriculum wiring, not something a reviewer reads the row to check).

**This is the property the old flag was missing: edit an approved row and the
signature stops matching.** The row silently un-approves and `validate:content`
fails, naming the question, the signer and the date. A right answer with a wrong
explanation is still wrong (THEO-4), so an explanation-only fix must go back
through review too — the hash makes that automatic instead of a matter of
someone's discipline.

### The ratchet, and why the legacy rows were not simply relabelled

837 rows still say `approved` with nobody's name on them. They are the product;
deleting the word would take the whole mock-exam bank offline in one commit.
Instead the count is **frozen** in `unsignedApprovedBaseline` and
`validate:content` refuses to let it grow. It can only fall, and only by a human
clearing rows at `/review`. Every run prints both numbers:

```
human-approved (signed, hash matches): 0 of 1089 — the only tier a student may be dealt as authoritative
"approved" with NO human signature:  837 (frozen ceiling 837; stale signatures 0)
```

The gate lives in `platform/scripts/validate-content.mjs` and is proven by
`tools/theory/approval_gate.test.mjs`, which runs the real validator against
fixture banks: a ledger that is missing, anonymous, undated, hash-less,
duplicated, stale, or one row over the ceiling all exit 1.

Two rules the gate enforces on top of the ratchet:

- a signature for a question that does not exist → error;
- a row at `approved` that a human **rejected** → error.

`signs/signs.json` carries the same vocabulary. No sign is `approved` today, so
there is nothing to ratchet there yet; when the first one is, it comes through
the same ledger.

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
  "status": "machine-checked"        // draft | machine-checked | needs-review | approved
}]                                   // generators stop at machine-checked — see "status"
```

### `sourceRefs` — citing something that is not a statute

**Optional, additive.** Every row written before this field existed validates
unchanged, and a re-serialisation never introduces the key.

```json
{
  "lawRefs":    [{ "act": "ЗДвП", "ref": "§ 6, т. 30 ДР" }],
  "sourceRefs": [{
    "sourceId": "src-nsi-ptp-2023",                       // must resolve in a register
    "ref": "Методологични бележки — „загинал при ПТП“",   // the source's OWN terms
    "claimId": "stat-road-death-30-days"                  // optional: the checked quote
  }]
}
```

**Why it exists.** `lawRefs` used to be `min 1` on every question, so a row was
*compelled* to name an act even where no act governs the answer. Twenty-nine
first-aid questions duly cited **ЗДвП чл. 123** — the duty to stop and assist —
under claims about compression depth and tourniquets. That was not carelessness;
it was the only thing the schema would accept (docs/education/90 §12 item 8,
§14 item N).

**The rule now.** `lawRefs.length + sourceRefs.length >= 1`. Cite something —
but only cite a statute when a statute is what settles it. `lawRefs` on its own
still covers ~all rows and nothing about them changed.

**Registers.** `sourceId` must exist in one of:

| Register | File | Holds |
| --- | --- | --- |
| medical | `medical/sources.json` | clinical guidelines (ERC 2025, RCUK 2025, БЧК) |
| general | `sources/sources.json` | other non-statutory sources (statistical methodology today) |

Ids are globally unique across registers, so a row names only the id. An
unresolvable `sourceId` **fails the load and `validate:content`**, exactly like
an unknown `signRef` — a citation nobody can open is the defect, not the fix.
`claimId` points at a claim in the same register's `claims.json`, whose quote
was *cut from the fetched source text by a builder that throws when the locator
stops matching*; that is what the review console shows and what
`tools/verify.mjs` re-checks.

**Lockstep** (all five must agree — CLAUDE.md):
`platform/src/lib/content/types.ts` · `schemas.ts` · `loader.ts` ·
`platform/scripts/validate-content.mjs` · this file · and the review console's
resolver `platform/src/lib/content/sources` +
`platform/src/modules/content-admin/evidence.ts`. `sourceRefs` is also inside
the signed content hash (`tools/theory/question_hash.mjs` and its TS mirror) —
the key is emitted **only when the row has one**, so existing hashes are
untouched while a swapped citation still breaks a signature.

**Not editable at `/review`.** The console renders `sourceRefs` and their
quotes but will not let anyone retype them: a non-statutory citation means
something only because a machine can re-verify it.

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

#### „Кой от показаните знаци…" — the comparison shape. Do NOT invent a second one.

**A multi-sign question has no `question.media`, and that is correct, not a
bug.** Option media above IS the ordered set: one sign per option, in option
order, `options[i].media.signRef`. There is no `signSet` / `signGrid` /
`multiSign` question-media kind and there must never be one — a second
representation of the same thing is how two renderers drift apart.

```jsonc
{
  "textBg": "Кой от показаните знаци предупреждава за единичен опасен завой НАЛЯВО?",
  "options": [
    { "id": "a", "textBg": "Знак 1", "correct": false, "media": { "kind": "sign", "signRef": "А1" } },
    { "id": "b", "textBg": "Знак 2", "correct": true,  "media": { "kind": "sign", "signRef": "А2" } },
    { "id": "c", "textBg": "Знак 3", "correct": false, "media": { "kind": "sign", "signRef": "А4" } },
    { "id": "d", "textBg": "Знак 4", "correct": false, "media": { "kind": "sign", "signRef": "А3" } }
  ],
  "media": null   // ← REQUIRED. There is no single picture to show above the text.
}
```

`textBg` stays `"Знак 1"`…`"Знак 4"` deliberately. It is the accessible name and
the option's spoken label, and on an identification question **it must never
name the sign** — `"Знак 2"` is the whole point; `"Спри! Пропусни…"` would leak
the answer to a screen-reader user and to anyone reading the option list.

Rendered by `hasSignOptions()` → a **2x2 picture grid, 96 CSS px per face**, in
`components/theory/PracticeSession.tsx`, `components/exam/ExamRunner.tsx` and
`components/sim/lesson-ui/MicroQuizOverlay.tsx` — all three through the single
`<SignFace>` in `components/theory/QuestionMedia.tsx`. Every one of the bank's
18 comparison items has exactly four options, which is why the grid is 2x2 and
not three-across: four signs in three columns is three tiles and an orphan, and
it destroys the pairing the question is testing (А1/А2 single curves *against*
А3/А4 double curves).

> **Auditing this shape:** a checker that reads `question.media` alone will
> report every one of these as „no media, nothing is shown". That exact false
> positive put nine answerable questions in the fails-an-exam tier of
> docs/education/90 §4.1, and it is the same mistake as the `isCorrect` /
> `correct` one that audit already caught in itself. **Read
> `options[].media` too.**

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
  "status": "draft"                  // same four values, same signature rule
}]
```

## hazard/items.json

Hazard-perception items. **Not part of the theory content graph** — it is not
read by `lib/content/loader` and has no topic/concept keys of its own; it is
loaded and validated by `@/modules/hazard` (`bank.ts`), which is why it is a
versioned object rather than a bare array.

```json
{
  "version": 1,
  "items": [{
    "id": "hz-zebra-hot-approach",        // "hz-" prefix, kebab-case
    "status": "needs-review",             // only "approved" is ever dealt
    "clip": {
      "id": "sc-zebra-approach__m0",      // "<templateId>__m<mistakeIndex>"
      "templateId": "sc-zebra-approach",
      "mistakeIndex": 0,
      "tracePath": "content/traces/sc-zebra-approach/mistake-too-fast.trace.json"
    },
    "clipStartSec": 0,                    // TRACE s — the rig's trim origin
    "faultSec": 7.07,                     // TRACE s — frozen from CLIP_PLAN
    "windowOpenSec": 3.07,                // CLIP s — scoring opens
    "cutSec": 7.07,                       // CLIP s — playback + scoring stop
    "difficulty": 1,
    "titleBg": "…", "briefBg": "…",       // read BEFORE play — never name the hazard
    "hazardBg": "…", "developingBg": "…", // the reveal, after grading only
    "violationCode": "PEDESTRIAN_CROSSING_TOO_FAST",  // sim rule catalog
    "lawRefEcho": "ЗДвП чл. 119",         // review-only echo; must match the catalog
    "notesBg": "R0: what a reviewer must confirm"
  }]
}
```

Rules, all enforced at load (`buildHazardBank`) and gated by
`modules/hazard/__tests__/items.test.ts`:

1. **Two time bases.** `clipStartSec`/`faultSec` are TRACE seconds;
   `windowOpenSec`/`cutSec` are CLIP seconds (`trace − clipStartSec`). The
   student's presses are always CLIP seconds — that is the only clock a browser
   has.
2. `windowOpenSec ≥ 1` (a real run-up), `cutSec − windowOpenSec ≥ 1.5`, and
   `cutSec ≤ faultSec − clipStartSec`. **The clip must stop at or before the
   fault** — a clip that runs on measures reaction time, not perception.
3. `faultSec` is COPIED from `platform/src/modules/clips/clipPlan.generated.ts`
   and frozen; regenerating the plan must never silently re-grade past attempts.
   Drift fails the test — re-author the item, do not edit the expectation.
4. The corrective and the citation are **retrieved** from the rule catalog at
   read time (ADR-002). `lawRefEcho` is a review convenience and must match it.
5. `status` stays `needs-review` until a human has WATCHED the cut and confirmed
   `windowOpenSec` is where the cue actually becomes visible.

## law/ — the source layer (ADR-002)

Full contract in [law/README.md](law/README.md). Read through
`platform/src/lib/content/law` — never by importing the JSON.

`law/acts/<act-id>.json` stores each ingested act as **addressable units**; a
unit's `textBg` is the VERBATIM statute text, amendment notes included.

```json
{
  "actId": "zdvp",
  "abbrBg": "ЗДвП",
  "titleBg": "ЗАКОН за движението по пътищата",
  "promulgationBg": "Обн., ДВ, бр. 20 от 5.03.1999 г., …",
  "consolidatedThroughBg": "ДВ, бр. 55 от 16.06.2026 г.",
  "sourceId": "src-zdvp-mtc-16062026",   // must be a full-text row in sources.json
  "units": [{
    "ref": "чл. 183",                    // canonical lowercase; also "чл. 167а1", "§ 6", "приложение № 5"
    "number": 183, "suffixBg": null,
    "contextBg": "Глава седма · АДМИНИСТРАТИВНОНАКАЗАТЕЛНА ОТГОВОРНОСТ",
    "textBg": "Чл. 183. …"
  }]
}
```

`law/penalties.json` is the reason the corpus exists: **one number was doing the
work of three systems.** A penalty keeps them apart, and every figure carries a
required citation whose `quoteBg` is re-verified against the act text at load.

```json
{
  "id": "pen-b2-no-stop-danger",
  "conduct":       { "statementBg": "Водачът не спазва предписанието на пътните знаци или правилата за предимство и от това е създадена непосредствена опасност за движението.",
                     "anchorsBg": [["пътен знак", "пътните знаци"],
                                   ["не спазва предписанието", "неспиране", "не спре"]] },
  "fine":          { "system": "fine",          "status": "grounded", "amountBgn": 200,
                     "instrument": "акт",       // фиш | акт
                     "instrumentSource": { "actId": "zdvp", "ref": "чл. 189", "quoteBg": "…" },
                     "source": { "actId": "zdvp", "ref": "чл. 179", "paragraphRef": "ал. 1",
                                 "pointRef": "т. 5",
                                 "quoteBg": "Наказва се с глоба в размер 200 лв.:",
                                 "contextQuoteBg": "който не спазва предписанието…" },
                     "noteBg": null },
  "controlPoints": { "system": "controlPoints", "status": "grounded", "points": 10,
                     "source": { "actId": "naredba-iz-2539", "ref": "чл. 6", … }, "noteBg": null },
  "examPoints":    { "system": "examPoints",    "status": "grounded", "points": 10,
                     "errorClassBg": "опасна",
                     "source": { "actId": "naredba-38", "ref": "приложение № 5", … }, "noteBg": null },
  "lawRefs": [{ "act": "ЗДвП", "ref": "чл. 179" }],
  "status": "needs-review"
}
```

`quoteBg` must occur verbatim in the cited unit **and**, for a `grounded`
numeric figure, must contain the number itself — a 100 лв. fine cited with a
quote that never says "100 лв." is refused at load. The offence text rides along
as `contextQuoteBg` (a second excerpt from the same unit, verified the same way)
because Bulgarian penalty articles put the amount in the alinea opening and the
behaviour in a numbered point below it.

`conduct` is required, and it is the only field in the row that a citation
cannot write for itself. A grounded figure must also carry
`source.offencePhraseBg` — the act's own words for the conduct — and the loader
checks that phrase against `conduct.anchorsBg` (AND of groups, OR inside a
group), not merely against the citation's own quotes. Without it a citation can
be verbatim, state its figure, name an offence and price the WRONG one:
measured, giving the 21–30 km/h speeding row the traffic-light case from Наредба
№ 38 produced no complaint at all. The anchors are themselves checked against
the act the row's `lawRefs` name, so the declaration cannot be moved to fit a
wrong citation. See `content/law/README.md` rules 1d and 1e.

`status` per figure — and this is the founder's ruling in code:

| status | value | meaning |
| --- | --- | --- |
| `grounded` | required | the number is written in the cited text |
| `not-listed` | must be `0` | the offence is absent from an exhaustive list; the citation IS the list |
| `unknown` | must be `null` | we do not have it — show the rule and the article, **no number** |

`examPoints` may be `null` when the behaviour is not an exam error at all
(drink-driving is not a marking-sheet item). A **фиш** and an **акт** differ in
two systems at once: контролни точки are taken only `въз основа на влязло в сила
наказателно постановление`.

## Hard rules for generators

0. **Never type a legal figure or article number from memory (ADR-002).** Look
   it up through `lib/content/law`; if the retrieval misses, the figure does not
   ship — write the rule and the article with no number.
0b. **Never write `"status": "approved"`.** That word is a person's, and a
   generator writing it is how 1,005 rows came to assert a review nobody did.
   The ceiling for anything automated is `"machine-checked"`; a flagged item is
   `"needs-review"`. Approval happens at `/review` and lands in
   `review/approvals.json`.
1. **ORIGINAL questions only.** Never copy or closely paraphrase official listovki items (copyright risk R5). Same concepts, fresh wording and scenarios.
2. **Every question and concept cites its basis.** For a rule that a statute
   settles, that is `lawRefs`; if unsure of the exact article → `"status":
   "needs-review"` and an honest ref guess with `"?"` suffix. **When no statute
   governs the answer — a clinical figure, a statistical threshold — do NOT
   reach for the nearest plausible article. Use `sourceRefs` (above) and cite
   what actually settles it.** Citing ЗДвП чл. 123 for a compression depth is
   how 29 questions came to point students at an article that cannot answer
   them.
3. Valid UTF-8 JSON, no trailing commas, ids unique across the whole repo, every `conceptIds`/`dependsOn`/`topicId` must resolve.
4. Bulgarian text natural and modern (17-year-old reader), not bureaucratic prose.
5. Distribution guidance per topic file: ~60% single / 40% multi; points mix ≈ 40% ×1, 40% ×2, 20% ×3.
