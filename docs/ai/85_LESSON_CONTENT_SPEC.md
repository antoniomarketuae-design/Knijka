# 85 — The lecture: lesson content spec and authoring contract

**Status:** content spec · **Date:** 2026-07-28 · **Owner:** founder
**Supersedes:** the final row of the table in `docs/ai/84_AI_TEACHER_CLASSROOM.md` §5.5 („A full written lecture (rejected) … **Do not.**"). **Inherits** everything else in doc 84, including §5.4's lesson unit, which this document re-derives independently and confirms.

**Hard constraints assumed throughout:** **ADR-002** (the AI never free-recalls Bulgarian law — retrieval and citation only) · **doc 64 THEO-4** (the teacher explains every decision; no bare correct/wrong verdicts, ever) · `content/SCHEMA.md` (everything starts `status: "draft"`) · ADR-001, ADR-003, ADR-004.

---

## 0. Why this exists

Doc 84 §5.5 measured a written lecture at ~324,000 characters, called it "a content project the size of the question bank", and ruled it out. **The founder has overruled that, and the overrule is correct on the merits.** That row was a *cost estimate* — a defensible one — presented in the grammar of a *rule*. Whether the lecture is worth its cost is a founder call, not a design-doc call. The estimate stands and is now a budget line rather than a veto.

This document sets the spine the writers follow. It defines what a lesson is, how the 152 concepts divide into lessons, the schema, and — the part that actually matters — **how a writer proves every legal sentence they write**.

**One thing to hold onto while reading.** This is taught to a seventeen-year-old who then gets in a car. A fluent, confident, subtly-wrong sentence about Bulgarian traffic law is the worst artefact this product can produce, and it is worse than an obvious gap, because a gap gets fixed and a confident error gets memorised. Everything below is arranged around that asymmetry.

---

## 1. The material, counted

Counted from the repo this session, not carried from any document.

| Asset | Count | Volume |
|---|---:|---|
| Topics (`content/topics.json`) | **16** | — |
| Sections (`content/sections.json`) | **54** | 3.4 per topic |
| Concepts (`content/concepts.json`) | **152** | 2.8 per section |
| — their `summaryBg` | 152 | **30,149 chars**, avg 198, range 144–314 |
| Questions (`content/questions/*.json`, 16 files) | **1,089** | — |
| — their `explanationBg` | 1,089 | **326,036 chars**, **1,089 of 1,089 carry `lawRefs`** |
| Scenario templates (`content/traces/`) | **155** | each has exactly one `shadow-correct.trace.json` |
| Sign catalogue (`content/signs/signs.json`) | **64** | all `status: "draft"` |
| Rule catalogue (`platform/src/modules/sim/rules/catalog.ts`) | 63 entries | `titleBg` / `explanationBg` / `correctiveBg` / `lawRef` |

Concepts per topic ranges from **7** (`t-eco-defensive`) to **12** (`t-signs`). Concepts per section: **21 sections have 2, 22 have 3, 11 have 4**. Nothing has 1 or 5+.

**The single most important number here is `1,089 of 1,089`.** Every question in the bank carries its legal basis. That is what makes writing a grounded lecture possible at all: the writer is not researching Bulgarian law, they are *quoting a corpus that was already researched and reviewed*. If that number were 700, this project would be unsafe and the answer would go back to "do not".

---

## 2. What a lesson is

> **A lesson is one section, delivered as a spoken lecture built from BEATS.**

A **beat** is one thing the teacher does: opens, explains a concept, points at the board, checks understanding, or closes. A beat is the unit of interruption (the student can raise their hand between beats), the unit of resume (leave mid-lesson, come back to the beat), and the unit of review (a reviewer approves or rejects a beat, not a whole lesson).

Five beat kinds. There will not be a sixth without an ADR.

| `kind` | What the teacher is doing | Typical count per lesson |
|---|---|---:|
| `open` | Names the three things coming and why in this order | exactly 1 |
| `concept` | Explains one concept: the rule, why it exists, what it looks like | 1 per concept (2–4) |
| `board` | Points at a correct/wrong pair or a single recorded run | 1–3 |
| `check` | Asks one question from the bank, then reads its explanation | 2–4 |
| `recap` | Three sentences that survive the week | exactly 1 |

**Rules that keep this from drifting:**

1. A lesson covers **exactly** its section's concepts — no more, no fewer. The section layer already partitions the concept graph (`SCHEMA.md` §sections rule 2), so this guarantees every concept is lectured exactly once, course-wide, with no orphans and no duplicates. Do not "just mention" a concept from another section; link forward with a chip instead.
2. **`check` beats never author new questions.** They point at an existing `approved` question by id. The question's own `explanationBg` is what the teacher reads after the answer — already written, already law-cited, already THEO-4 compliant. Writing new quiz text here would create an unreviewed law claim in the worst possible place.
3. Every beat carries **at least one `grounds` entry**. Yes, including `open` and `recap`.
4. `concept` beats may have no visual. That is normal and shipping a bad visual is worse than shipping none.

### 2.1 Why the section, and not the topic

A topic lesson would run 15–25 minutes. **[judgement]** For a seventeen-year-old on a phone, the failure mode of a 25-minute lesson is not "they watch less" — it is *they never press play*. Fifty-four lessons also give the theory hub a **path** ("урок 16 от 54") where today it has sixteen gauges.

More to the point: **sections already follow the material rather than a template.** They were cut by concept affinity, not by dividing evenly, which is why `t-signs` yields 5 lessons and `t-eco-defensive` yields 2 — proportional to how much is actually there. Re-cutting them for the lecture would break `getSectionOverview()`, `SectionCard.tsx`, the partition invariant, and existing per-section progress, in exchange for nothing.

**Do not split or merge sections to fit a length target.** Absorb the variation in the character budget instead (§4).

---

## 3. The schema

`content/lessons/<lessonId>.json` — one lesson per file.

```jsonc
{
  "id": "l-priority-basics",          // "l-" + the section slug, minus "s-"
  "sectionId": "s-priority-basics",   // must resolve in sections.json
  "topicId": "t-priority",            // must equal the section's topicId
  "order": 16,                        // course position 1..54: topics by order, sections in file order
  "titleBg": "Основи на предимството",
  "conceptIds": ["c-priority-concept", "c-right-hand-rule", "c-priority-road"],
  "estMinutes": 5.4,                  // total narrationBg chars / 1000, one decimal
  "status": "draft",                  // draft | needs-review | approved — ALWAYS "draft" when written
  "beats": [ /* … */ ]
}
```

A beat:

```jsonc
{
  "id": "b-right-hand-rule",          // "b-", unique within the lesson
  "kind": "concept",                  // open | concept | board | check | recap
  "conceptId": "c-right-hand-rule",   // required on concept/board/check; omit on open/recap
  "narrationBg": "…",                 // the spoken text. \n\n = a breath, not a paragraph break
  "grounded": true,                   // false = a claim the bank could not support (§6)
  "grounds": [ /* ≥1, see below */ ],
  "visual":  { /* optional */ },
  "quiz":    { "questionId": "q-predimstvo-040" },   // check beats only
  "chipsBg": ["…"],                   // optional, 2–4 things a student may want to interrupt with
  "notesBg": "…"                      // optional, for the reviewer — never spoken
}
```

**`grounds`** — the reason this document exists:

```jsonc
{
  "src":   "q-predimstvo-003",        // question id | concept id | sign code | trace path | catalog code
  "ref":   "ЗДвП чл. 48",             // the legal citation, copied from the source's own lawRefs
  "forBg": "на равнозначно кръстовище пропускаш идващото отдясно; редът на пристигане не се брои"
}
```

`forBg` names **which claim in this beat** the source covers, so a reviewer checks a mapping instead of re-deriving the law. A beat making four legal claims carries four `grounds` entries. Do not cite a question you did not read.

**`visual`** — three kinds, all rendering from data the repo already owns:

```jsonc
{ "kind": "pair",  "templateId": "sc-junction-rhr", "wrong": "mistake-no-look", "captionBg": "…" }
{ "kind": "trace", "templateId": "sc-junction-rhr", "file": "shadow-correct",
  "fromSec": 13.17, "toSec": 20.0, "captionBg": "…" }
{ "kind": "sign",  "signRef": "Б3", "captionBg": "…" }
```

`pair` is the founder's board — `shadow-correct` beside a named mistake trace; it is the default and every one of the 155 templates supports it. `templateId` must be a directory under `content/traces/`, and the named files must exist. `signRef` must equal a `code` in `signs/signs.json`.

**Deliberately absent:** per-beat audio, per-beat timing, difficulty, tags, prerequisites, i18n keys, teacher emotion/pose. Every one of those was considered and cut. Writers will produce ~250 beats; a field that can be filled in badly *will* be, and each one is a place for an unreviewed claim to hide.

---

## 4. The lesson map: 54 lessons

Course order = topics by `order`, sections in `sections.json` file order. Character projections use the per-size bands in §4.1.

| # | Тема | Уроци | Концепции | Прогноза знаци |
|---:|---|---:|---:|---:|
| 1 | Основни понятия и задължения | 3 | 10 | 14,600–17,600 |
| 2 | Автомобилът и подготовката за път | 4 | 11 | 17,600–21,200 |
| 3 | Пътни знаци | 5 | 12 | 20,600–25,000 |
| 4 | Светофари, маркировка и регулировчик | 3 | 10 | 14,600–17,600 |
| 5 | Предимство | 3 | 9 | 13,800–16,800 |
| 6 | Кръстовища, кръгови движения и жп прелези | 4 | 11 | 17,600–21,200 |
| 7 | Скорост и дистанция | 3 | 10 | 14,600–17,600 |
| 8 | Маневри, ленти и изпреварване | 4 | 10 | 16,800–20,400 |
| 9 | Пешеходци и уязвими участници | 4 | 11 | 17,600–21,200 |
| 10 | Магистрали и извънградски пътища | 3 | 8 | 13,000–15,600 |
| 11 | Спиране, престой и паркиране | 3 | 8 | 13,000–15,600 |
| 12 | Нощно шофиране и усложнени условия | 3 | 8 | 13,000–15,800 |
| 13 | Алкохол, умора и годност за шофиране | 3 | 8 | 13,000–15,600 |
| 14 | Документи, нарушения и санкции | 4 | 10 | 16,800–20,400 |
| 15 | ПТП и първа помощ | 3 | 9 | 13,800–16,600 |
| 16 | Икономично и защитно шофиране | 2 | 7 | 10,000–12,000 |
| | **Общо** | **54** | **152** | **240,400–290,200** |

**Midpoint: ~265,300 characters ≈ 4.4 hours of spoken Bulgarian, averaging 4,913 chars (4.9 min) per lesson.**

That is the real budget, and it is ~18% below doc 84's 324,000 estimate — because `check` beats reuse the question bank verbatim instead of restating it, which is also why they are safer.

### 4.1 The character budget

`estMinutes` counts **narration only**. Board dwell and quiz thinking add 60–150 s on top, so a 5-minute lesson is a 6–7 minute session. Budget the speech, not the session.

| Concepts in section | Sections | Narration budget | Per concept, after ~800 chars of frame |
|---:|---:|---:|---:|
| 2 | 21 | 3,800–4,600 | ~1,700 |
| 3 | 22 | 4,600–5,600 | ~1,450 |
| 4 | 11 | 5,400–6,400 | ~1,200 |

A four-concept section gets brisker per-concept treatment. That is intended, not a compromise: those sections were grouped because their concepts are close, so they need less re-establishing between them.

**Two board-poor topics.** `t-fitness` and `t-admin` have almost no scenario coverage, correctly — a blood-alcohol limit is a number and a consequence, not a manoeuvre. Their `board` beats use `sign` visuals and the rule catalogue's consequence lines. **Do not commission reels for them.**

---

## 5. The grounding method

This is the procedure. Follow it sentence by sentence, not lesson by lesson.

**Step 1 — classify the sentence.** Is it a *legal assertion*? A rule, a duty, a number, a limit, a sanction, a sign's meaning, a hierarchy, an exception. If yes, it needs a source that **literally contains the claim**. Craft and framing sentences ("Дясната страна не се помни, тя се вижда") do not, but the beat as a whole still carries `grounds` for its legal content.

**Step 2 — find the source.** Search the reviewed corpus. From the repo root:

```bash
# by legal article — the usual entry point
node -e "const fs=require('fs');for(const f of fs.readdirSync('content/questions'))\
JSON.parse(fs.readFileSync('content/questions/'+f,'utf8')).forEach(q=>{\
if(/чл\. 48/.test(JSON.stringify(q.lawRefs))) console.log(q.id,'|',q.explanationBg)})"

# by concept — everything the bank says about one concept
node -e "const fs=require('fs');for(const f of fs.readdirSync('content/questions'))\
JSON.parse(fs.readFileSync('content/questions/'+f,'utf8')).forEach(q=>{\
if(q.conceptIds.includes('c-right-hand-rule')) console.log(q.id,q.status,'|',q.explanationBg)})"
```

Search order, and it matters: **question `explanationBg` (best — reviewed prose plus a citation) → concept `summaryBg` → sign `meaningBg` → rule catalogue `explanationBg`/`correctiveBg` → trace annotations** (best for *what it looks like*, never for what the law says).

**Step 3 — prefer `approved`.** Questions carry `status`. Ground on `approved` where possible; a `needs-review` source is usable but the beat's `notesBg` must say so, because the beat inherits its source's uncertainty.

**Step 4 — write `grounds`.** Copy the `ref` from the source's own `lawRefs` — **do not retype an article number from memory**, and do not "improve" a citation. If two sources disagree, ground on the one that agrees with the majority of the bank and note the conflict.

**Step 5 — the honesty check.** Reread the beat and ask of every sentence: *could a reviewer find this in the sources I listed?* Anything that only lives in your own head goes to §6.

### 5.1 Things that are never grounded well enough

- **Numbers you remember.** Speed limits, BAC limits, fine amounts, point tallies, deadlines. If the exact number is not in the bank, it does not go in the narration.
- **"Usually", "по принцип", "в повечето случаи".** Vagueness is how an ungrounded claim survives review. Say it precisely with a citation, or mark it `grounded: false`.
- **Anything about enforcement practice** — what police actually do, what examiners actually accept. Not in the bank, not in the lecture.

---

## 6. When nothing supports it

**Write the beat anyway. Mark it. Do not soften it into vagueness.**

```jsonc
{
  "id": "b-what-makes-roads-equal",
  "kind": "concept",
  "conceptId": "c-right-hand-rule",
  "narrationBg": "…",
  "grounded": false,
  "grounds": [ { "src": "q-predimstvo-048", "ref": "ЗДвП чл. 48",
                 "forBg": "покрива само операционния признак: няма знаци и няма светофар" } ],
  "notesBg": "GAP: банката никъде не дава ПОЛОЖИТЕЛНО определение на „равнозначни пътища“ — само по липса на сигнализация. Нужен е ref от § 6 ДР ЗДвП, потвърден от юрист, преди този бийт да стане approved."
}
```

Three rules:

1. **`grounded: false` blocks `approved`.** A lesson with an ungrounded beat cannot leave `needs-review`. This is the whole safety property; do not route around it by deleting the beat.
2. **`notesBg` must say what a reviewer has to go find** — the specific missing citation, not "проверѝ това".
3. **No separate gap register.** The register is the files. `rg '"grounded": false' content/lessons/` is the backlog, and it cannot drift out of date the way a hand-kept list would.

A softened sentence — "обикновено се приема, че…" — is *worse* than a marked gap, because it reads as knowledge, passes casual review, and teaches a seventeen-year-old something nobody ever checked.

---

## 7. Voice

Bulgarian, written to be **spoken** — this becomes TTS.

- **Short sentences.** A sentence needing a comma to survive needs to be two sentences.
- **Second person.** "Пропускаш", not "водачът пропуска".
- **Warm and direct, never condescending.** They are adults learning something hard.
- **No filler.** No "както вече казахме", no "нека сега разгледаме", no greetings.
- **`\n\n` is a breath**, a place the TTS pauses and the student may interrupt. Not a paragraph.
- **Explain every decision (THEO-4).** Never the bare rule. Always: the rule → why it exists → what goes wrong without it → what it looks like on the road. If a beat states a rule and stops, it is not finished.
- **Name the wrong belief.** The bank's explanations are full of "забележи какво НЕ е" — that framing works and should carry into the lecture.
- ~1,000 chars ≈ 1 minute.

---

## 8. The exemplar

**`content/lessons/l-priority-basics.json`** — section `s-priority-basics`, course position 16, three concepts, **10 beats, 5,352 chars, 5.4 min, 3 quizzes, 0 ungrounded beats.** Every referenced id was machine-verified to resolve.

**Copy it.** Writers imitate an example far more faithfully than they follow a spec, so where this document and the exemplar disagree, follow the exemplar and report the discrepancy. Note in particular:

- `b-what-is-priority` has **no visual** — a concept beat does not need one.
- `b-right-hand-rule` carries **six** `grounds` entries for one beat. That is the expected density for a concept beat, not thoroughness above and beyond.
- Its `chipsBg` includes "Ами ако сме четирима едновременно…", and `notesBg` explicitly says *do not answer it here* — it belongs to `c-equal-junction` in another section, where `q-krastovishta-029` grounds it. **This is how a writer handles a question the student will certainly ask that is not theirs to answer.**
- Every `check` beat's narration sets up the question and stops. It never states the answer; the bank's `explanationBg` does that.

### 8.1 Validating a lesson

There is no validator script yet (writing one is application code and out of scope here). Until `validate:content` learns lessons, run this:

```bash
node -e "const fs=require('fs');const L=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));\
const S=JSON.parse(fs.readFileSync('content/sections.json','utf8')).find(s=>s.id===L.sectionId);\
let Q=[];for(const f of fs.readdirSync('content/questions'))Q=Q.concat(JSON.parse(fs.readFileSync('content/questions/'+f,'utf8')));\
const e=[];if(!S)e.push('bad sectionId');else if([...S.conceptIds].sort().join()!==[...L.conceptIds].sort().join())e.push('conceptIds != section');\
let c=0;L.beats.forEach(b=>{c+=(b.narrationBg||'').length;if(!(b.grounds||[]).length)e.push(b.id+': no grounds');\
if(b.quiz&&!Q.find(q=>q.id===b.quiz.questionId))e.push(b.id+': bad quiz id');\
if(b.visual&&b.visual.templateId&&!fs.existsSync('content/traces/'+b.visual.templateId))e.push(b.id+': bad templateId');});\
console.log(c+' chars, '+(c/1000).toFixed(1)+' min');console.log(e.length?e:'clean')" content/lessons/l-priority-basics.json
```

It checks structure and reference integrity. **It cannot check grounding** — that is a human reading `forBg` against the cited source, and there is no substitute.

---

## 9. Open items found while writing this

These were discovered by grounding the exemplar and are reported rather than fixed, because each is a reviewer's call.

1. **`concepts.json` law refs appear swapped for two priority concepts.** `c-right-hand-rule` cites `ЗДвП чл. 50` and `c-priority-road` cites `ЗДвП чл. 48`. The reviewed question corpus consistently uses the opposite: **чл. 48 = the right-hand rule / equal junctions** (36 questions; 27 explanations pair чл. 48 with "дясно"/"равнозначни") and **чл. 50, ал. 1 = priority road** (55 questions; 22 pair чл. 50 with the priority road). `c-equal-junction` cites `"чл. 48?"`, matching the corpus and confirming the direction. **The exemplar is grounded on the question corpus, not on the concept refs.** A reviewer should correct `concepts.json`; nothing here edits it.
2. **No positive definition of „равнозначни пътища" anywhere in the bank.** It is only ever defined negatively — no signs, no working traffic light (`q-predimstvo-048`, `q-predimstvo-028`). Students will ask "how do I *know* it is equal?" and the honest answer today is operational, not legal. Needs a `§ 6 ДР ЗДвП` citation confirmed by a lawyer before any beat asserts it.
3. **All 64 signs are `status: "draft"`**, including Б1–Б4, which the exemplar names. Sign-grounded beats inherit that and cannot be `approved` before the sign catalogue is.
4. **84 questions repo-wide are `needs-review`** (1,005 of 1,089 approved). `q-predimstvo-046` is one, and it sits in this exemplar's concept area. The exemplar avoids grounding on it. Writers must check `status` before citing.
5. **No `estMinutes` has been validated against real TTS.** The 1,000 chars/minute figure is inherited from doc 81 and has never been measured on Bulgarian output. One audition would either confirm the whole 4.4-hour projection or move it by 20%.

---

## 10. Definition of done, per lesson

1. Beat count and character budget inside the §4.1 band for the section's size.
2. Every concept in the section has its own `concept` beat; none from outside.
3. Every `check` points at an `approved` question covering that beat's concept.
4. Every beat has ≥1 `grounds` with a real `forBg`.
5. Every legal sentence traces to a source that literally contains it.
6. Anything that does not is `grounded: false` with an actionable `notesBg`.
7. Visual ids resolve; trace files exist; sign codes exist.
8. `status: "draft"`. Nothing is reviewed by virtue of existing.
