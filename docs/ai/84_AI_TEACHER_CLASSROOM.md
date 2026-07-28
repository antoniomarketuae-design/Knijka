# 84 — „Учителят в класната стая": the AI Teacher as a fourth pillar

**Status:** design document · **Date:** 2026-07-28 · **Owner:** founder
**Complements** `docs/ai/81_AI_TUTOR_STRATEGY.md` (the tutor as a chat surface, its economics and its voice decision). **Supersedes nothing.** Where this document and doc 81 disagree, it is flagged inline and doc 81 wins on anything it measured.

**Hard constraints assumed throughout:** ADR-001 (fictional vehicles) · **ADR-002** (rule engine judges; LLM for dialogue only; **never** free-recall of Bulgarian law — retrieval + citation only) · ADR-003 (no certificates) · **ADR-004** (users are minors: minimal PII, no biometrics, no audio capture) · ADR-005 (Three.js + R3F + Rapier, browser-first) · **doc 64 THEO-4 requirement-zero** (no bare correct/wrong verdicts, ever).

**Evidence policy**, matching doc 81:
- **[code]** — I read the file this session. Path given.
- **[measured]** — I counted it from the repo this session.
- **[doc 81]** — carried over from doc 81's own verification; not re-verified here.
- **[judgement]** — my opinion, argued rather than measured.

---

## 0. The verdict in one page

The founder's description is: *a student in a classroom · a teacher explaining · a board behind them showing correct and wrong ways · the student can interrupt and ask · mini-quizzes to check understanding · across the whole course.*

**Five of those six things can be built almost entirely out of assets that already exist in this repo.** The classroom, the board, the interruption, the quizzes and the whole-course coverage are plumbing over content that is already authored, already law-cited and already reviewed. That is the good news, and it is bigger than it sounds: **[measured]** the "correct way vs wrong way" board content the founder describes exists as **465 recorded traces** across 155 scenario templates — every single template has a `shadow-correct.trace.json` alongside its mistake traces — and the module that computes the divergence between them is already written and tested.

**The sixth thing — the human body — is the one I am going to argue against**, and not on the grounds doc 81 used. Doc 81 rejected the photoreal head on bytes, cost and vendor risk. Those arguments all still hold, but there is a sharper one that only appears once you commit to *interruptibility*:

> **A pre-recorded human cannot be interrupted.** A recording has exactly one behaviour when the student raises their hand: it stops. It cannot look up, it cannot hold the thought, it cannot say „да, кажи" and it cannot resume in a way that acknowledges anything happened. The founder is asking for two properties — *photoreal presence* and *responsiveness* — and pre-recorded video is precisely the technology that gives you the first by surrendering the second. The moment you make the teacher interruptible you have made them a **state machine**, and a state machine wants to be drawn, not filmed.

So the recommendation is: **build the classroom, build the board, build the interruption, build the quizzes — and make the teacher a presence rather than a picture.** Phase 1 does not have a face *or* a voice, and it is still a real product (§7). Phase 2 gives it a voice, gated on an audition that has still never been run. Phase 3 gives it a drawn body, gated on the voice being good.

**Three things I am telling you plainly because they are the ones that will bite:**

1. **The lecture does not exist.** **[measured]** The entire conceptual prose of the 16-topic course is `content/concepts.json` → `summaryBg`, **30,149 characters across 152 concepts, averaging 198 characters each**. At doc 81's own conversion (~1,000 chars/minute of Bulgarian speech) that is **about 30 minutes of narration for the whole course** — roughly 1.9 minutes per topic. There is no lecture script anywhere in this repo. What exists is an *answer* corpus (326,036 chars of per-question `explanationBg`), which is a different thing. §5.4 shows how to build a real lesson out of the answer corpus rather than writing a lecture, because writing the lecture is a content project the size of the question bank.
2. **The founder's „ask the teacher his own opinions" is a direct ADR-002 conflict** and I am not going to soften it. §2.4 says exactly which opinions the teacher may hold and where they are already written down.
3. **„The student can interrupt and ask" cannot mean speaking.** ADR-004 forbids capturing a minor's voice. Every interruption is typed or tapped. §5.1 turns that constraint into the best part of the design.

---

## 1. What this stands on

Everything in this section is in the repo today. Nothing here is a proposal.

### 1.1 The board already has its content — and both halves of it

| Asset | Count | Weight | Path |
|---|---:|---:|---|
| Recorded scenario traces | **465** | 63.7 MB | `content/traces/<templateId>/*.trace.json` |
| — of which `shadow-correct` (the RIGHT way) | **155** | — | one per template, no exceptions |
| — of which `mistake-*` (the WRONG way) | **310** | — | 2 per template on average |
| Rendered mistake reels (`.webm`) | **42** | 107.2 MB | `platform/public/clips/` |
| Fault keyframe posters (WebP) | 210 | — | `platform/public/clips/*.webp` |

**[measured]** Average trace: **134 KB** (max 617 KB). Average rendered reel: **2.55 MB, 12.2 seconds**. Views: 31 exterior, 10 exterior+dashboard, 1 cockpit.

Read those two averages against each other, because the whole board design follows from it: **a correct/wrong pair delivered as traces is ~270 KB. The same pair delivered as video is ~5.1 MB — 19× more.** And **[code]** `tools/assets/publicBudget.mjs` caps the `clips-video` bucket at **140,000,000 bytes**, of which 107.2 MB is already spent — about **13 more reels of headroom, total**. Rendering the correct line for even the 42 templates that already have a reel would blow through it.

**[code]** `platform/src/modules/clips/replay/dualGhostCore.ts` already computes the second-by-second gap between an attempt trace and its `shadow-correct` shadow — distance and speed delta at 4 Hz — with two honesty rules baked in: it reports a *distance*, never a *correctness* („there is not ONE correct line"), and it refuses to compare against a missing shadow rather than silently comparing against nothing. **[code]** `platform/src/components/theory/MistakeReplay.tsx` renders a trace on a **2D canvas** — no WebGL context, no R3F — and `MistakeMedia.tsx` already picks video-when-available and falls back to that canvas, with `preload="none"` behind an IntersectionObserver, a `prefers-reduced-motion` guard and a MediaRecorder duration-probe workaround.

**Consequence for the design:** the board's default renderer is the **2D canvas trace replay**, not video. Video is the upgrade for the 42 templates that have one. That inverts the current priority (video first, canvas as fallback) and it is the only way „correct way vs wrong way, for the whole course" fits on Bulgarian mobile data at all.

### 1.2 The board knows which visual belongs to which question

**[code]** `platform/src/modules/clips/whyPanel.ts` + `whyPanelMap.generated.ts`. **[measured]** **585 of 1,089 questions** carry a scenario event id, and every one of the 16 topics has coverage:

```
krastovishta 58 · manevri 62 · predimstvo 56 · signali-i-markirovka 52
magistrali 49 · spirane-i-parkirane 47 · nosht 45 · uyazvimi 44
signs 39 · speed 39 · eco 35 · vehicle 21 · osnovni 15 · ptp 15
alkohol 5 · dokumenti 3
```

**[code]** `EVENT_TO_SCENARIO` (whyPanel.ts:106-186) is a hand-wired, comment-justified table mapping each `ev-*` event to the exact template *and mistake index* that best demonstrates it, with a documented `pending`-trace guard that degrades to text-only rather than pointing at a replay that does not exist. This is the single most valuable thing the lesson player inherits: **the "which clip goes with this idea" problem is already solved, deterministically, and pinned by tests.**

The two weak topics are visible above — `alkohol-i-godnost` (5) and `dokumenti-i-sanktsii` (3). Those are the two topics whose lessons will be board-poor, and §5.4 says what they get instead.

### 1.3 The teacher's words already exist, in three corpora

| Corpus | Items | Bulgarian chars | Role in a lesson |
|---|---:|---:|---|
| `content/concepts.json` → `summaryBg` | 152 | **30,149** | the narration spine |
| `content/questions/*.json` → `explanationBg` | 1,089 | 326,036 | what the teacher says *after* the quiz |
| `content/questions/*.json` → `textBg` + options | 1,089 | 387,469 | the quiz itself |
| `modules/sim/rules/catalog.ts` (58 entries) | 58 | 20,959 | „what the examiner counts this as" |
| `content/signs/signs.json` | 64 | — | sign faces on the board |
| `content/hazard/items.json` | 8 | — | hazard-perception interludes |

**[measured]** 1,005 of 1,089 questions are `status: "approved"`; 84 are `needs-review`. **[code]** `content/SCHEMA.md` and `tools/theory/review_batch.mjs` make `draft → approved` **human-only, with no `--all` flag** — the approval tool refuses flagged ids without `--force` and aborts the whole batch on any refusal.

**[code]** `modules/sim/rules/catalog.ts` — 58 entries (52 violations + 6 commendations), each with `titleBg`, `explanationBg`, `correctiveBg`, `lawRef`, severity class, official points, and a `conceptId` linking it back into the knowledge graph. Its header states the contract this whole document depends on: *„this map is the grounding input for the post-Alpha LLM debrief (ADR-002 — the LLM may rephrase, never invent)."*

### 1.4 The learner model and the grading path are already the right shape

**[code]** `modules/learning/index.ts` exports `getTopicOverview`, `getSectionOverview`, `getReadiness`, `getSimWeakSpots`, `buildPracticeSession`, `submitAnswer`, `orderOptionsForPractice`, `issuePracticeTicket`. **[code]** `readiness.ts` blends theory mastery with 14 days of sim evidence at weight 0.25, weighted by concept difficulty, with a recency decay to a 0.5 floor at 30 days.

**[code]** `submitAnswer(userId, questionId, chosen, context, now, options)` where `AnswerContext = "practice" | "micro"` (submit.ts:37). The mini-quiz is a **third context**, and that is the entire type change it needs.

**[code]** `modules/sim/lessons/quiz-trigger.ts` is the template for the mini-quiz mechanic: pure, deterministic, zero randomness, a `{minGapSec, maxPerSession}` rate limit, and an explicit `conceptForEvent` map. **[code]** `modules/tutor/speakGate.ts` (358 lines, tested, **not yet wired to anything**) is its twin for speech: 40 s cooldown, 5 lines/session, 20 s queue-then-**drop**, `isSafeToInterrupt`, and a hard mute on `examMode`.

### 1.5 The tutor is already a safe, budgeted, single-path Q&A service

Doc 81's v0 defects have largely been fixed since it was written. **[code]** `modules/tutor/service.ts` now runs, in order: input guard → burst limit → **Sofia-day** per-user cap (30/day) → **per-pack allowance** → global money kill-switch → `retrieveGroundingForTurn` → grounded prompt with theory weak concepts **and** `getSimWeakSpots` → model call → cost booking → citation whitelist → persist. **[code]** `retrieval.ts:330` `retrieveGroundingForTurn` fixes the „А защо?" refusal (D2). **[code]** `allowance.ts` implements doc 81 §5.3's 300-questions-per-pack allowance with the notice suppressed above 20% remaining.

**This is the single most important reuse in the document.** Every interruption in every lesson goes through `askTutor()`. There is no second model client, no second budget, no second citation whitelist. §2 is about what to add to that path, not about replacing it.

**[code]** `platform/.env` still has `ANTHROPIC_API_KEY=""`. Doc 81 item 0.1 — *set the key and ask 20 real Bulgarian questions* — appears still to be outstanding, and everything in §2 remains unobserved until it is done.

---

## 2. ADR-002: making an interruptible teacher safe

This is the constraint that shapes the feature, so it comes before the presentation question, not after.

### 2.1 The threat model an interruptible lesson creates

A free-chat tutor gets a cold question with no context, and the honest failure mode is a refusal. **A lesson creates a worse failure mode: a warm question with strong context.** The student has just watched a reel about right-of-way at an unmarked junction, and asks „а ако другият е трамвай?". The model now has six retrieved materials about junctions, a plausible-sounding topic, a conversational momentum, and a student who will believe it. That is the exact situation in which a model invents an article number: not when it knows nothing, but when it *nearly* knows.

**The lesson therefore gets a stricter grounding contract than free chat, not a looser one.**

### 2.2 The retrieval path: beat-scoped, then topic-scoped, then refuse

Every lesson is a sequence of **beats** (§5.2). A beat is authored data, and it names its own materials — it is not a search result. So an interruption during beat *B* retrieves in three tiers:

```
Tier 1  B.conceptIds          → concepts.json summaryBg + lawRefs        (exact, authored)
        B.questionIds         → the questions' explanationBg + lawRefs   (exact, authored)
        B.ruleCodes           → catalog.ts explanationBg/correctiveBg/lawRef
        B.signIds             → signs.json meaningBg + lawRefs
   ↳ these are INJECTED, not retrieved. No scoring, no ranking, no threshold.

Tier 2  retrieveGrounding(repo, question) restricted to the lesson's TOPIC
   ↳ the existing keyword scorer (retrieval.ts), filtered to concepts/questions
     whose topicId matches. Fills the remaining material slots.

Tier 3  nothing matched above the PREFIX_MATCH floor
   ↳ REFUSE. Do not widen to the whole bank.
```

Tier 1 is the important one and it is a **strengthening** of the existing design, for the same reason doc 81 §4.2 gave for `TutorContext`: when the materials are already known and exact, grounding is stronger *and* the prompt is smaller *and* the call is cheaper. A lesson beat is the best-specified context this product will ever have — better than the why-panel's, because a beat names a concept, a rule code and a set of questions all at once.

Tier 2 deliberately does **not** widen past the topic. If the student is in the pedestrians lesson and asks about motorway lane discipline, the honest answer is „different lesson", not a confident paragraph assembled from the far side of the bank. Narrow retrieval produces more refusals and fewer inventions, and in a product for minors that is the correct trade.

**Implementation note.** This is `TutorContext` from doc 81 §4.2 with a `kind: "lesson"` arm, and `askTutor()` takes it as an optional second argument. It is not a new service.

### 2.3 What happens when the bank cannot answer — and why the refusal is a feature

**[code]** `prompt.ts:17` already defines the exact refusal: `„Нямам материал за това — питай ме за правилата от учебната програма."` and rule 2 of the system prompt forces it verbatim.

**That string is wrong for a classroom, and THEO-4 is why.** THEO-4 forbids bare verdicts; a bare refusal is the same failure wearing different clothes. In a lesson the teacher knows exactly where the student is standing, so the refusal must be *constructive*. Three parts, in this order:

1. **Name the boundary honestly.** „Това не е в материала за този урок."
2. **Say what IS covered nearby** — from Tier 1/Tier 2 metadata, deterministically, not from the model. „Тук говорим за предимството на равнозначно кръстовище."
3. **Offer the nearest real destination** — a lesson that does cover it (from `topics.json` + the concept graph), or the practice deck for the concept. A link the student can press, never a suggestion to „потърси другаде".

Parts 1 and 3 are **template strings assembled by our code from ids**, not model output. Only part 2's phrasing is the model's, and it is constrained to naming materials already in the prompt. This keeps the refusal path entirely free of free-recall.

**And log it.** Every Tier-3 refusal writes `{lessonId, beatId, questionText, ts}`. That log is a **content-gap backlog generator** — it is the only mechanism in this product that tells the founder what 17-year-olds actually want to know and the bank does not cover. **[judgement]** After six weeks of real lessons this log is worth more than any of the analytics in `docs/ai/26`. It is ~2 hours to build and it should be in phase 1.

Privacy: the log stores the question text and the beat id. Under ADR-004 it must be written **without a user id** — a content-gap counter, not a per-student record. There is no product reason to know *who* asked.

### 2.4 The founder's „ask the teacher his own opinions" — the plain answer

> *„…ask questions about the topics, about his view, his own opinions, or to ask opinions of the teacher…"*

**On Bulgarian law, the teacher has no opinions and must be built so that it cannot form one.** „Според мен този член значи…" is exactly the ADR-002 failure, and it is worse than a hallucinated citation because it *sounds* like honest hedging. The system prompt already forbids it (`prompt.ts:91`, rule 1); the lesson must not create a surface that invites it.

**But the founder is pointing at something real, and it is already written down.** There are three places where this product legitimately holds a *stance*, all authored, all reviewed, none of them law:

| Kind of opinion | Where it already lives | Example |
|---|---|---|
| **What you should have done** | `catalog.ts` → `correctiveBg`, 52 entries | „Свали газта още при знака… в зона 50 дръж 45–48 км/ч, така имаш резерв за неточността на окото." |
| **Why the rule bites in practice** | `explanationBg` across bank + catalog | „Предимството се дава, не се взима — ако другият не спира, твоето право не те пази от удара." |
| **What is risky beyond what is illegal** | the hazard bank, the commendations | hazard perception is deliberately *not* on the ДАИ exam |

So: **the teacher may have opinions about driving, and may not have opinions about the law.** That line is enforceable because it is the difference between „материал, което цитираме" and „материал, което перифразираме", and both are in the prompt already.

One concrete rule for the prompt: when a student asks „а ти какво мислиш", the teacher answers from `correctiveBg` if a rule code is in scope, and otherwise says that its job is to show what the law and the road require — and then asks what the *student* thinks. **[judgement]** That is also better pedagogy: doc 81 §6 v1.5 already wants a self-evaluation screen for the same reason, and GDE/DVSA client-centred learning says the same thing. Turning „what do you think?" back on the student is not a dodge, it is the technique.

### 2.5 THEO-4 in a classroom: the four places a verdict can appear

| Surface | Bare verdict risk | What must appear instead |
|---|---|---|
| Mini-quiz result | „Грешно" | the existing **why-panel** — stored `explanationBg` + `lawRefs` + the reel. **[code]** already built (`WhyPanel.tsx`), already the compliant surface. |
| Board correct-vs-wrong | „това е грешно" with a red X | the mistake's stored `whatWentWrongBg` + the divergence readout from `dualGhostCore` — *where* the gap opened, not that it existed |
| Interruption answer | a one-word „да"/„не" | the model is already capped at 2–4 sentences and required to cite; keep it |
| Refusal | „Нямам материал" | §2.3's three-part constructive refusal |

Every one of these is either already compliant or is made compliant by reusing something already compliant. **The lesson introduces no new verdict surface.** That should be stated in the PR, because it is the cheapest THEO-4 argument this product will ever get to make.

---

## 3. The teacher's presentation

### 3.1 The honest comparison

Weighed on the five things that actually matter here. „Interruptible" means: can the teacher stop mid-thought, acknowledge, answer, and resume — *without the seam being the most noticeable thing in the lesson*.

| Option | One-time cost | Per-lesson bytes | Uncanny risk | **Interruptible?** | Copy edit costs |
|---|---|---:|---|---|---|
| **A. Pre-rendered video of a real presenter** | filming, studio, a person who will leave | 8–15 MB/lesson at 720p | none (it is real) | **No.** It stops. Resume is a hard cut. | re-shoot |
| **B. AI presenter video (Synthesia-class)** | ~$30/hr of video | 8–15 MB/lesson | **high** | **No.** Same as A. | re-render + redeploy |
| **C. 3D avatar in R3F** | modelling + rigging + animation, weeks | ~2–5 MB model, once | **high** on a mid-range Android | Yes | free |
| **D. 2D drawn character rig (SVG / Rive)** | one character, €200–500 commissioned | **~100–300 KB, cached forever** | **none if it is honestly drawn** | Yes — it is a state machine | free |
| **E. Voice + board, no character** | none | **0** | none | Yes | free |

**A and B fail on the founder's own requirement.** He asked for interruption in the same breath as pre-recording, and those two do not coexist in video. A recording that stops has no state between „speaking" and „stopped"; the classroom illusion the whole feature depends on breaks at the exact moment it is asked to do its most impressive trick. This is not a bytes objection or a cost objection — it is a *the feature does not work* objection, and it is the reason I would reject A/B even if bandwidth were free.

**B additionally inherits every doc 81 §7.6 objection**: a video library rots on every ЗДвП amendment, and **[measured]** your copy will change many times before launch — the bank still has 84 `needs-review` questions and `content/review/` is empty.

**C fails on the target hardware.** **[doc 81]** Chrome caps at 8 concurrent WebGL contexts on Android and Firefox mobile at 2, and **[code]** `modules/sim/environment/quality.ts` already steps the simulator *down* when the fps median falls below 48 at `maxDpr 1.0`. A 3D head cannot share a page with the simulator, and a lesson page that mounts R3F just to animate a face is spending the phone's entire GPU budget on the least evidence-backed part of the experience. **[doc 81]** Mayer's image principle is d = 0.22 against voice at d = 0.74.

**D is the right answer eventually, and E is the right answer first.**

### 3.2 Recommendation: E now, D later, and never A/B/C

**Ship E.** The teacher is: a name, a consistent voice (phase 2), a speech area at the bottom of the screen that holds the current line as text, and a state — `speaking` / `waiting` / `listening` / `thinking` / `quizzing`. The board is the screen. That state machine is the actual teacher; the drawing is a costume you can put on it later without changing a line of lesson data.

**[judgement]** Design the beat schema so the character is additive from day one: every beat already carries a `tone` field (`explain` / `warn` / `praise` / `ask`) because the **text** needs it — it drives the speech-area styling and, in phase 2, the TTS prosody. When a drawn character arrives, `tone` is what it animates against. Nothing in the lesson data changes.

**Then D, and only after the voice audition passes (§4).** Commission one character, drawn in a way that is unmistakably a drawing. **[doc 81]** The one avatar-first ed-tech product at scale is criticised specifically for its avatar; the $100M-ARR outcome in AI tutoring is voice-first with the avatar optional. Pure DOM/SVG so it can legally sit on the simulator page, which a 3D head cannot.

### 3.3 Where I am disagreeing with the founder, stated plainly

He asked for a human body. I am proposing a screen, a voice and eventually a drawing.

The argument is not that the body is too expensive. It is that **the body competes with the board for the thing the student has least of, which is attention** — and the board is where the driving is. **[doc 81]** Signaling/cueing (an arrow landing on the cyclist at the moment the voice names it) is g = 0.38; a picture of the speaker is d = 0.22. The classroom metaphor the founder is reaching for is right, but in a real classroom the students are looking at the board, and the teacher's body is peripheral — it carries presence, timing and attention, not information. **A voice plus a board reproduces exactly that division of labour.** A photoreal body in the middle of a 390 px-wide phone screen inverts it.

If after phase 3 the drawn character is loved and the founder still wants a body, that is the moment to revisit it — with revenue, an illustrator and an animator, per doc 81 §2.4's 5,000-paying-user threshold.

---

## 4. Voice

### 4.1 The pipeline exists and has never made a sound

**[code]** `tools/theory/synthesize_bg.mjs` (722 lines, tested). It is a build-time renderer: it walks the question bank, keys every utterance by a content hash over `{text, provider, voice, format, pipeline}`, renders incrementally, dedupes identical strings, writes a deterministic manifest, prunes orphans and accounts cost. **It refuses to spend money unless told twice** — credentials in the environment **and** `--allow-spend` on the command line — and otherwise writes `.dry` files that exercise every path except the vendor call.

Its own header states the ADR-002 argument better than I could: pre-synthesising approved content means *„no model is in the loop at playback, so no model CAN free-recall Bulgarian law into a 17-year-old's ears."* And the ADR-004 line: TTS is output-only, **no voice cloning** (a cloned voice is a voiceprint is a biometric), **no speech-to-text at launch**.

Defaults: `bg-BG-KalinaNeural`, Azure `westeurope`, `$15.00/1M chars`, free tier 500,000 chars/month, `TEXT_PIPELINE_VERSION = 0` (whitespace collapse only — the real Bulgarian number/acronym normaliser is deliberately not half-built).

### 4.2 What the lesson needs added to it

One change, small: **`collectUtterances` walks `content/questions/` only** (`synthesize_bg.mjs:136-202`). A lesson's narration spine is `concepts.json` → `summaryBg`, which it does not touch.

Adding a concept corpus is ~1 hour: another reader, another `kind: "concept"`, ids of the form `c-priority-concept:summary`. The hashing, manifest, dedupe, prune and cost accounting all work unchanged — that is what the design was for.

**[measured]** Cost of the addition: 30,149 chars → **$0.45** at Azure's rate. The whole thing rounds to nothing; it sits inside the free tier with the question corpus.

### 4.3 BLOCKING DECISION: no Bulgarian voice has ever been auditioned

Doc 81 §3.4 item 2.0 called this a gate. **It is still open**, and the lesson raises the bar it has to clear.

An explanation is 15 seconds. **A lesson is five minutes of continuous listening.** Flaws that a listener forgives in a snippet — a flat cadence, a wrong stress on „предимство", an English-sounding „50 км/ч" — compound over five minutes into a reason to close the tab. So the audition question changes:

> Doc 81 asked: *„Would you listen to this for 20 minutes?"*
> The lesson version is: **„Play a full 4-minute section lesson. Did they finish it? Did they take their headphones off?"**

**The audition, revised for lessons — 4 hours, under $2, and it blocks all of phase 2:**

1. Take **one real section** (recommend `s-basics-safety` — колани/деца/телефон: concrete, no article-number density, and it is section 3 of topic 1 so it is what a real first lesson would be).
2. Render its narration spine — 3 concept summaries plus the `explanationBg` of 3 of its questions, ~1,400 chars — with `synthesize_bg.mjs --match --limit`.
3. Do it on **both** Azure bg-BG voices. **[doc 81]** There are exactly two — `bg-BG-KalinaNeural` (F) and `bg-BG-BorislavNeural` (M), both Standard type, no HD variant, no speaking styles, no roles. **The founder has not chosen between them, and „the teacher" is a character choice, not a config value.** Add Google Chirp 3 HD bg-BG and ElevenLabs v3 as the comparison, per doc 81's ladder.
4. Play each **complete** to five 17-year-olds. Measure completion, not opinion.

**Two further open decisions the founder has not made**, both cheap to decide and both blocking phase 2 authoring:

- **One voice or two?** A classroom with one voice is a lecture. **[judgement]** Consider Borislav as the teacher and Kalina for the board's *„а ето какво стана"* callouts — or the reverse. It costs nothing at build time (the hash is keyed on voice, so the two corpora simply render separately) and it is the cheapest available cue that the board and the teacher are different things.
- **Does the teacher read the question text aloud during a mini-quiz?** **[judgement]** No — a read-aloud question is a reading-comprehension test the ДАИ exam does not have, and the exam is silent. The teacher speaks *before* the quiz and *after* it, never during. This should be written into doc 33 as a rule, not decided per-lesson.

### 4.4 The contingency, restated for lessons

Doc 81's ladder holds. The one thing I want to change is the framing of rung 3:

> **If every voice is bad, the lesson still ships — and phase 1 is designed so that this costs nothing.**

Phase 1 has no voice at all (§7). The teacher's lines are text in the speech area. That is not a degraded mode: teenagers watch things on mute, it works on a train, it works with no data, and it is fully accessible. **[doc 81]** it still delivers the g = 0.38 signaling effect via the board and loses only the d = 0.74 voice effect. If the audition fails, phase 2 becomes „better typography and pacing" instead of „TTS", and phases 3–4 are unaffected.

**This is the main reason phase 1 is voiceless.** Not because voice is unimportant — because building the classroom on top of an unauditioned voice would make the audition's outcome existential, and it does not have to be.

---

## 5. The lesson: interruption, quizzes, and how it maps onto the course

### 5.1 The interruption model

**ADR-004 rules out speaking.** Interruption is typed or tapped, always. **[judgement]** That constraint produces a *better* design than a microphone would, for three reasons — cost, grounding and latency — and here is how.

**Every beat carries 2–4 authored question chips.** Not generic ones — chips written for *that beat*:

```
beat: c-crosswalk-yield · board: sc-zebra-approach__m0
  [ Защо не стигна навреме? ]      → hits Tier 1, one exact material
  [ А ако пешеходецът е спрял? ]   → hits Tier 1 + topic Tier 2
  [ Покажи го пак по-бавно ]       → ZERO LLM: board control, not a question
  [ Питай нещо друго… ]            → free text, ≤500 chars (TUTOR_MAX_INPUT_LENGTH)
```

What this buys:

- **Grounding.** A chip is a known string. Its retrieval result can be computed at build time and pinned by a test, exactly the way `whyPanel.test.ts` pins the reel picks. **A chip answer can be verified before it is ever shown to a student** — that is a guarantee free text can never give.
- **Cost.** §6 shows chips are the difference between a bounded and an unbounded bill, and the board-control chips cost $0.
- **Latency.** **[doc 81]** ~1.0–1.5 s end-to-end for a short reply from a Bulgarian client. In a lesson that is fine (the student stopped the teacher; a beat of silence is *correct*), but a chip whose answer is precomputed is instant, and instant is what makes it feel like a person rather than a form.
- **It teaches the student what can be asked.** A 17-year-old facing an empty box asks nothing. A 17-year-old facing „Защо не стигна навреме?" presses it.

**The mechanics.** The player is a state machine and interruption is a transition, not a special case:

```
speaking(beat n) --[hand-raise]--> waiting        (audio pauses at the sentence
                                                   boundary; board freezes and
                                                   DIMS; nothing is discarded)
waiting --[chip | free text]--> thinking --> answering(with citation chips)
answering --[resume]--> speaking(beat n, from where it paused)
answering --[ask again]--> waiting     (bounded — §6)
```

Two rules that are not obvious and both matter:

1. **Pause at the sentence boundary, not instantly.** **[judgement]** Audio is rendered per-utterance already; a beat's narration is 1–4 utterances. Stopping between utterances is a natural breath. Cutting mid-word is what makes software feel like software. Worst case the student waits ~4 seconds — which is exactly what a real teacher finishing a sentence does.
2. **The board dims but does not clear.** The student interrupted *about something*. Clearing it destroys the referent and forces them to describe what they were looking at.

**Resume, not restart.** The beat resumes from its pause point. It does **not** replay from the start, and the teacher does **not** say „както казвах" — **[judgement]** a synthetic acknowledgement that the same voice says every single time is the fastest way to make a warm feature feel canned.

**What the teacher does NOT do:** it does not proactively interrupt the student, ever. `speakGate.ts`'s whole thesis is that an instructor who talks constantly gets switched off. In a lesson the student is already listening — the gate's *inverse* applies: the teacher speaks when the lesson says so and is otherwise silent.

### 5.2 The lesson as data: beats

A lesson is authored JSON. It is not generated, and no model is in the playback path.

```jsonc
{
  "id": "l-basics-safety",              // one lesson per SECTION (§5.4)
  "sectionId": "s-basics-safety",
  "topicId": "t-basics",
  "beats": [
    {
      "id": "b1",
      "kind": "explain",                 // explain | board | quiz | recap
      "tone": "explain",                 // drives styling now, prosody + a face later
      "conceptIds": ["c-seatbelts"],
      "sayRef": "c-seatbelts:summary",   // an id into the TTS manifest — NEVER prose
      "board": null
    },
    {
      "id": "b2",
      "kind": "board",
      "tone": "warn",
      "board": {
        "mode": "compare",               // compare | mistake | still | sign
        "templateId": "sc-vp-readiness",
        "mistakeIndex": 0,               // vs its shadow-correct trace
        "cues": [ { "tSec": 4.2, "kind": "highlight", "target": "seatbelt" } ]
      },
      "sayRef": "sc-vp-readiness:m0:whatWentWrong",
      "ask": ["Защо е грешка, ако тръгвам бавно?", "Покажи го пак по-бавно"]
    },
    {
      "id": "b3",
      "kind": "quiz",
      "conceptIds": ["c-seatbelts"],
      "questionCount": 2                 // questions PICKED at runtime — §5.3
    }
  ]
}
```

**The load-bearing rule: `sayRef` is an id, never a string.** Beats reference the TTS manifest and the content bank by id; they never carry Bulgarian prose of their own. That makes it structurally impossible for a lesson file to contain an unreviewed sentence, and it means a content fix in `concepts.json` propagates to every lesson that cites it with no lesson edit. It is the same discipline `whyPanel.ts` already follows („STORED explanation text — displayed verbatim").

**Consequence to accept openly:** a lesson assembled purely from `sayRef`s reads like a well-written reference, not like a person talking. §7 phase 4 is where connective narration is authored, and §5.5 sizes it.

### 5.3 The mini-quiz

The founder: *„mini quizes can be popped up like a teacher asking the students if they have understood/remembered correctly."*

**This is the cheapest and most valuable part of the whole feature, and it needs no new content and no LLM.**

- **Selection.** `buildPracticeSession` already picks questions for a concept against the learner model; scope it to the beat's `conceptIds`. Option order via the existing `orderOptionsForPractice` (audit H-1a).
- **Grading.** `submitAnswer(..., context: "lesson", ...)` — **[code]** `AnswerContext` is `"practice" | "micro"` today; add `"lesson"`. Grading is server-side and deterministic; the client never sends a score. The answer flows into the same mastery/readiness model as everything else, so **a lesson is not a sideshow — it moves the same needle practice does.**
- **The verdict.** The existing why-panel, unchanged. THEO-4 satisfied by reuse.
- **Cost.** **$0.** No tokens, no TTS (the teacher is silent during a quiz — §4.3).

**Two rules for the mechanic**, both taken from `quiz-trigger.ts`'s reasoning:

1. **No randomness.** Same student, same lesson, same beat ⇒ same selection. `quiz-trigger.ts` makes this point explicitly and it matters more here: a student who retakes a lesson to fix one thing must be able to.
2. **The quiz never blocks.** A wrong answer shows the why-panel and the lesson continues. **[judgement]** Gating progression on a correct answer turns a lesson into an exam, and the product already has an exam — a 45-question, 97-point, 40-minute one that is law.

**What happens on a wrong answer, as an opinion:** the teacher should not re-explain. It should send the student to the board — **[measured]** 585 questions have a wired reel, so for more than half the bank there is a *visual* answer available at the exact moment the student is wrong about it. That is the product's differentiator firing at its highest-value moment, and it costs nothing but wiring.

### 5.4 Mapping onto the course: **54 lessons, not 16**

**[measured]** The content is already structured three levels deep:

| Level | Count | Per parent |
|---|---:|---|
| Topics (`topics.json`) | **16** | — |
| Sections (`sections.json`) | **54** | 3.4 per topic |
| Concepts (`concepts.json`) | **152** | 2.8 per section |
| Questions | 1,089 | ~7 per concept |

**[code]** `getSectionOverview(userId)` already exists and the theory hub already renders per-section progress (`app/(dashboard)/theory/page.tsx`, `SectionCard.tsx`, `TopicSheet.tsx`).

**The lesson unit is the SECTION.** A topic lesson would be 20–25 minutes; a section lesson is 4–7. **[judgement]** For a 17-year-old on a phone, 25 minutes is not a lesson, it is a commitment — and the failure mode is not „they watch less", it is „they never start". Fifty-four lessons also give the theory hub something it does not have today: a **path**. Right now the hub shows sixteen gauges and a practice button; with lessons it shows „урок 3 от 54" and the next thing to press.

A section lesson's shape, from real numbers:

```
2.8 concepts × ~198 chars narration       ≈  560 chars  ≈ 35 s spoken
1–2 board beats × 12 s reel + dwell       ≈  60–90 s
2–3 quiz questions + why-panel reading    ≈  90–150 s
recap beat                                ≈  20 s
                                          ─────────────
                                          ≈ 3.5–5 min per lesson
                                            × 54 ≈ 3.5–4.5 hours of course
```

**The two board-poor topics.** **[measured]** `alkohol-i-godnost` (5 mapped questions) and `dokumenti-i-sanktsii` (3) have almost no reel coverage — correctly, since neither is really a *road* situation. Their lessons lean on sign faces, the `catalog.ts` severity/points lines („на изпита това е опасна грешка и означава директно неиздържан изпит"), and the hazard bank. **Do not commission reels for them.** A blood-alcohol limit is a number and a consequence, not a manoeuvre; the board should show the consequence table, not a car.

### 5.5 What still has to be written by a human

This is the real cost of the feature and it deserves a straight number.

| Artifact | Chars | Exists? | Note |
|---|---:|---|---|
| Narration spine (concept summaries) | 30,149 | ✅ approved | reused verbatim |
| Post-quiz explanation | 326,036 | ✅ 1,005/1,089 approved | reused verbatim |
| Board captions (`whatWentWrongBg`) | — | ✅ | reused verbatim |
| **Beat JSON for 54 lessons** | — | ❌ | ~250 beats. Structure, not prose — mostly ids. **~16 h** |
| **Question chips: 2–4 per interruptable beat** | ~12,000 | ❌ | ~150 beats × ~80 chars. Bulgarian authoring. **~14 h** |
| **Connective narration (phase 4)** | ~22,000 | ❌ | 54 × ~400 chars: an opening, bridges, a close. **~20 h** |
| A full written lecture (rejected) | ~324,000 | ❌ | comparable to the entire question bank. **Do not.** |

**[judgement]** The last row is the trap and it is worth naming loudly. „A teacher explains the theory" reads like it needs a script, and a script for 54 lessons is a content project on the scale of the 1,089-question bank — which took the whole `verify_drafts` → `review_batch` pipeline and still has 84 items in `needs-review`. It cannot be LLM-generated and shipped: `content/SCHEMA.md` says every item starts as `draft`, and `review_batch.mjs` has no `--all` flag on purpose. **Build the lesson so it is good without the script, and add the script later where lessons prove they are watched.**

---

## 6. Cost per student, with the arithmetic

This is a **one-time €12.99 purchase with 4 months of access** (**[doc 81]** `packs.ts`: `PACK_ACCESS_MONTHS = 4`, `priceEurCents: 1299`, €12.55 net of Stripe EEA fees). Every recurring cent comes straight out of margin.

### 6.1 TTS: $0.00 marginal, and about $5 once

Pre-synthesis at build time (`synthesize_bg.mjs`) makes per-student TTS cost **exactly zero**. One-time, at Azure's $15/1M:

| Corpus | Chars | One-time |
|---|---:|---:|
| Concept summaries (the narration spine) | 30,149 | **$0.45** |
| Question explanations | 326,036 | $4.89 |
| Sim rule catalog | 20,959 | $0.31 |
| Connective narration (phase 4) | ~22,000 | $0.33 |
| **Everything a lesson could ever say** | ~399,000 | **~$5.98** |

Under the 500,000 chars/month free tier in a single month. **Cost is not a decision input for voice. Quality is (§4.3).**

### 6.2 Bandwidth: the number that actually matters

These are teenagers on Bulgarian mobile data.

| Per lesson (~4 min) | Bytes |
|---|---:|
| Narration audio, ~55 s at 24 kbps Opus | **~165 KB** |
| Board as **traces** (2 pairs: correct + mistake) | **~540 KB** |
| Board as **video** where a reel exists (2 reels) | ~5,100 KB |
| Quiz questions + why-panel text | ~15 KB |

**Trace-first is a ~7× bandwidth reduction per lesson**, and it is the difference between a **~0.7 MB** lesson and a **~5.3 MB** one. Across all 54 lessons: **~38 MB** trace-first versus ~285 MB video-first — and the video-first number is not even purchasable, since **[measured]** only 42 reels exist and there is headroom for ~13 more under the 140 MB `clips-video` ceiling.

**Policy, and it should be a lint test:**
- The board default is the **2D canvas trace replay** (`MistakeReplay.tsx`).
- A rendered reel is used **only** where the manifest already has one **and** the connection is not `saveData` / `2g` (`navigator.connection`).
- **Never prefetch the next lesson's media.** `MistakeMedia.tsx`'s `preload="none"` + IntersectionObserver discipline applies per beat.
- Audio is fetched per beat, not per lesson.

### 6.3 LLM: only interruptions, and only some of those

Doc 81's measured shape for a full free-chat turn is ~2,800 in / ~200 out. **A lesson interruption is much smaller**, because Tier-1 grounding replaces retrieval (§2.2): the beat's own materials are 1 concept summary (~200 chars) + 2–3 explanations (~900 chars) + the ~1,235-char fixed instructions + the question ≈ **2,400 chars ≈ 1,100 tokens in**, and a 2–3 sentence reply ≈ **115 tokens out**. Lesson Q&A also replays **no conversation history** beyond the current beat's exchange — a beat is a bounded topic, and doc 81's 12-message replay is what makes the free-chat prompt grow.

| Per interruption | Sonnet 5 ($3/$15) | Haiku 4.5 ($1/$5) |
|---|---:|---:|
| 1,100 in / 115 out | **$0.0050** | **$0.0017** |

Against doc 81's measured free-chat steady state of $0.0114 — **the lesson path is 2.3× cheaper per turn than the chat path**, purely because the context is exact.

**[judgement]** Use **Haiku 4.5** for lesson interruptions. Doc 81 §5.6 rightly says do not downgrade for cost before seeing Sonnet's Bulgarian — but that argument is about free chat, where the model must synthesise across six ranked materials. A lesson interruption paraphrases 1–3 *exact* materials into 2–3 sentences with whitelisted citations; it is close to the ideal small-model task. **Evaluate both on the same 30 real chip questions before deciding** — and note **[doc 81]** Haiku 4.5's minimum cacheable prefix is 4,096 tokens, so an 1,100-token prompt will not hit prompt cache. Do not budget a cache discount.

### 6.4 The cap, and why it must exist

**An unbounded chat with a teenager is an unbounded bill**, and the founder's phrasing („can interrupt… ask questions… ask opinions") describes precisely an unbounded chat.

Four ceilings already exist and all four apply, because every interruption goes through `askTutor()`: burst 8/60 s, 30 messages/day (Sofia day), **300 questions per pack**, and the global $5/day kill-switch. So the tail is *already* bounded:

| Scenario | Interruptions | Haiku | Sonnet |
|---|---:|---:|---:|
| Median student — 54 lessons, ~3 interruptions each | 162 | **$0.28** | $0.81 |
| Heavy student — 8 per lesson | 432 | $0.73 | $2.16 |
| **Hard ceiling — the 300-question pack allowance** | 300 | **$0.51** | $1.50 |
| Against net revenue | — | €12.55 | €12.55 |

**Worst-case gross margin: 96% on Haiku, 88% on Sonnet.** Cost is not the reason to constrain this feature — but it is the reason the allowance must not be quietly bypassed for lessons.

**The one real decision: do lesson interruptions draw from the same 300?**

**[judgement]** **Yes — one pool, one number, and raise it to 400.** Two pools is a support surface („why did my lesson questions not come out of my lesson allowance"), and doc 81 §5.4 already argues at length against making the student count anything. But the lesson is a genuine new consumer of the pool: a student who does all 54 lessons at 3 interruptions each has spent 162 of 300 before opening the chat. 400 costs $0.68 of Haiku worst-case and removes the risk that the tutor runs dry at lesson 40 — the worst possible moment.

**Three additions that keep the cap from ever being felt:**

1. **Board-control chips are free.** „Покажи го пак по-бавно" is a player command. Never an LLM call, never a debit.
2. **Precomputed chip answers.** A chip's retrieval is deterministic. **[judgement]** For the ~150 highest-traffic chips, generate the answer once at build time, review it like any other content, and serve it as **static approved content** — $0 per student, instant, and ADR-002-clean by construction (the same argument `synthesize_bg.mjs` makes about audio). This is the single biggest cost lever in the document and it also makes the teacher *faster*. Only free-text questions and unreviewed chips hit the model.
3. **Cap interruptions per beat, not per lesson** — 3 per beat, then the teacher says it will come back to it and offers the practice deck. **[judgement]** A per-beat cap is pedagogically honest (a student stuck on beat 2 for ten questions needs a different lesson, not more answers) where a per-lesson cap is just a wall.

With (1) and (2), **[judgement]** the realistic median cost of the entire 54-lesson course lands **well under $0.15 per student**.

---

## 7. Phased build plan

Effort figures are **[judgement]**. Phase 1 is designed to be shippable and worth shipping on its own, with no voice, no face, and no dependency on any decision that has not been made.

### Phase 1 — „Класната стая" · ~52 h · **ships alone**

The classroom, silent. Text teacher, live board, real quizzes, real interruption.

| # | Item | h |
|---|---|---:|
| 1.1 | **Lesson data model + player state machine** (`modules/lesson/`): beat schema, `sayRef`-is-an-id rule, `speaking/waiting/answering/quizzing` states, pure and node-testable like `quiz-trigger.ts` | 10 |
| 1.2 | **Board component**: 2D canvas trace replay as default, `compare` mode driving `dualGhostCore` divergence, existing reel when the manifest has one, `prefers-reduced-motion` + `preload="none"` discipline copied from `MistakeMedia.tsx` | 12 |
| 1.3 | **Beat JSON for all 54 sections** — ids only, no prose | 16 |
| 1.4 | **Mini-quiz**: `AnswerContext += "lesson"`, scope `buildPracticeSession` to beat concepts, reuse `WhyPanel` verbatim | 5 |
| 1.5 | **Interruption**: `TutorContext.kind = "lesson"` with Tier-1/2/3 retrieval, per-beat cap, constructive refusal, **content-gap log (no user id)** | 7 |
| 1.6 | Lesson entry from the theory hub — „урок 3 от 54" on the existing section cards | 2 |
| — | *Prerequisite, from doc 81 item 0.1:* **set `ANTHROPIC_API_KEY` and ask 20 real Bulgarian questions.** Until this is done, 1.5 is unobserved. | 1 |

**Why it ships alone.** It is the founder's classroom minus the voice and the body: a sequenced lesson, a board showing the correct line against the wrong one, a teacher that checks understanding with real exam questions graded by the real grader, and a hand-raise that gets a law-cited answer. **[judgement]** It is also the version that works on a train, on mute, and on a 2 GB data plan — which is a larger fraction of the target audience than anyone wants to admit.

### Phase 2 — „Учителят проговаря" · ~26 h **+ a 4 h blocking gate**

| # | Item | h |
|---|---|---:|
| **2.0** | **THE VOICE AUDITION (§4.3)** — one full section, both bg-BG voices + 2 rivals, five 17-year-olds, measure completion | **4 · GATE** |
| 2.1 | Concept corpus in `synthesize_bg.mjs`; render; `tutor-audio` bucket in `publicBudget.mjs` | 4 |
| 2.2 | Bulgarian number/acronym normaliser + bg-BG PLS lexicon (`TEXT_PIPELINE_VERSION` 0→1), **and listen to the output end to end** | 12 |
| 2.3 | Per-beat audio player: sentence-boundary pause, gesture unlock and mute persistence reused from `sim/scene/simAudio.ts`, always-on captions | 6 |
| 2.4 | Precomputed chip answers for the top ~150 chips, through `review_batch.mjs` like any other content (§6.4) | 4 |

### Phase 3 — „Учителят има лице" · ~24 h · gated on 2.0 passing

2D drawn character, DOM/SVG or Rive, animating against the `tone` field that phase 1 already emits. Idle / speaking / listening / thinking. Viseme lip-sync only if the audition picked Azure (**[doc 81]** bg-BG gets 22 viseme IDs and nothing richer). Budget €200–500 for a commissioned character. **[judgement]** If the voice is mediocre, no face rescues it — and if the voice is excellent, you may find you never build this.

### Phase 4 — „Истински урок" · ~20 h · gated on completion data

Connective narration: 54 × ~400 chars of opening, bridge and close, through the normal draft → verify → founder-review pipeline. **Do this only for the topics students actually finish.** If lesson completion is under ~40%, the problem is not the script.

### The three-line version

1. **Build the classroom before the teacher.** The board, the quiz and the hand-raise are 90% existing assets; the face and the voice are the two parts that are neither cheap nor decided.
2. **The board is traces, not video.** 465 correct-and-wrong traces already exist at 134 KB each; there is headroom for 13 more videos, total.
3. **Run the voice audition before writing a line of phase 2** — and note that a five-minute lesson is a much higher bar than a fifteen-second explanation.

---

## 8. What NOT to build

Recorded as decisions so they do not resurface.

**On constraints**

1. **Voice input for interruptions.** ADR-004. Capturing a minor's audio is a different processing category from playing audio back. Chips and text (§5.1) — which are also cheaper, better-grounded and faster.
2. **A live conversational avatar.** Doc 81 §7.1, unchanged: a vendor LLM free-recalling Bulgarian law plus a minor's microphone streamed to a non-EU processor.
3. **A teacher with opinions about the law** (§2.4). Opinions about *driving* only, and only where already authored.
4. **Widening lesson retrieval to the whole bank on a Tier-2 miss** (§2.2). The refusal is the feature.
5. **Logging the content-gap questions against a user id** (§2.3). Count the gap, not the child.

**On economics and bytes**

6. **Pre-rendered video of any teacher, human or synthetic.** It is not interruptible (§3.1), the bytes do not fit, and every copy edit is a re-render and a redeploy.
7. **Rendering `shadow-correct` reels to video.** 155 of them at ~2.55 MB against ~32.8 MB of remaining budget. They already exist as 134 KB traces and there is already a renderer.
8. **Prefetching a lesson's media on lesson open.** Per beat, per the existing `MistakeMedia` discipline.
9. **A second budget path for lesson Q&A.** Everything through `askTutor()`, or the kill-switch stops protecting a real card.

**On engineering judgement**

10. **A 3D avatar on any page a student might reach from the simulator.** Doc 81 §7.9; **[code]** `quality.ts` already steps the sim down below 48 fps.
11. **Generating lesson narration with an LLM at runtime, or at build time without review.** `content/SCHEMA.md` starts everything at `draft`; `review_batch.mjs` has no `--all` flag on purpose.
12. **Prose inside beat JSON.** `sayRef` ids only (§5.2), or unreviewed Bulgarian will end up in a lesson file where no verification tool looks for it.
13. **Randomised quiz selection.** `quiz-trigger.ts`'s determinism argument applies with more force here.

**On pedagogy**

14. **Gating lesson progression on a correct answer.** The product has an exam already, and it is defined by law.
15. **Reading the quiz question aloud** (§4.3). The ДАИ exam is silent.
16. **Re-explaining after a wrong answer.** Send them to the board — for 585 questions there is a visual answer wired and waiting.
17. **A synthetic „както казвах" on resume.** The same voice saying the same line every time is what makes warm software feel canned.
18. **Twenty-five-minute topic lectures.** 54 section lessons, 4–7 minutes (§5.4).
19. **Any teacher presence during a mock exam or `lesson.examMode`.** Already correct in `advisor.ts`; protect it with a test that covers the lesson player too.

---

## Appendix A — Open uncertainties

| # | Uncertainty | How to close it | Cost |
|---|---|---|---|
| U1 | **No bg-BG voice has been heard, and no choice made between Kalina and Borislav.** Blocks all of phase 2. | §4.3 audition | 4 h, <$2 |
| U2 | **Sonnet 5's and Haiku 4.5's Bulgarian have never been observed.** `ANTHROPIC_API_KEY` is still empty. Blocks any quality claim about interruptions. | doc 81 item 0.1, then 30 chip questions on both models | 2 h, ~$0.40 |
| U3 | **Nobody knows whether a Bulgarian 17-year-old will finish a 4-minute lesson.** Phases 3–4 are both gated on this and it cannot be answered by reasoning. | Ship phase 1; measure completion per lesson | phase 1 |
| U4 | **The 2D canvas replay has never been driven in `compare` mode.** `dualGhostCore` is tested as math; the shadow trace has never been rendered beside a mistake on a phone. | Build 1.2 against `sc-junction-rhr` (has 2 mistakes + a shadow) and LOOK at it on a 390×844 viewport | 2 h |
| U5 | **~1,000 chars/minute for spoken Bulgarian** underpins every duration in §5.4 and §6. Carried from doc 81, not re-measured. | Read one rendered utterance with a stopwatch after 2.1 | 5 min |
| U6 | **84 questions are still `needs-review` and `content/review/` is empty.** A lesson whose quiz deals an unreviewed question is a THEO-4 risk the lesson player does not control. | Confirm `buildPracticeSession` deals approved-only, or scope it in 1.4 | 30 min |

## Appendix B — File index for implementers

| Concern | Path |
|---|---|
| Correct-vs-wrong traces (465) | `content/traces/<templateId>/{shadow-correct,mistake-*}.trace.json` |
| Divergence math (correct line vs attempt) | `platform/src/modules/clips/replay/dualGhostCore.ts` |
| 2D canvas trace replay — the board's default renderer | `platform/src/components/theory/MistakeReplay.tsx` |
| Video-or-canvas picker + lazy-load discipline to copy | `platform/src/components/theory/MistakeMedia.tsx` |
| Question → reel wiring (585 rows) | `platform/src/modules/clips/whyPanel.ts`, `whyPanelMap.generated.ts` |
| Rendered reel manifest (42 clips) | `platform/public/clips/manifest.json` |
| Asset budget — `clips-video` ceiling, add `tutor-audio` here | `tools/assets/publicBudget.mjs` |
| Narration spine (152 concepts, 30,149 chars) | `content/concepts.json` |
| Lesson unit — the 54 sections | `content/sections.json` |
| The 16 topics | `content/topics.json` |
| Question bank (1,089; 1,005 approved) | `content/questions/*.json` |
| Content contract — draft/needs-review/approved | `content/SCHEMA.md` |
| Human-only approval tool (no `--all`) | `tools/theory/review_batch.mjs`, `verify_drafts.mjs` |
| Build-time bg-BG TTS (never run for real) | `tools/theory/synthesize_bg.mjs` |
| The one budgeted model path | `platform/src/modules/tutor/service.ts` |
| Grounding prompt + citation whitelist | `platform/src/modules/tutor/prompt.ts` |
| Tiered retrieval to extend | `platform/src/modules/tutor/retrieval.ts` |
| Per-pack allowance (300 → 400) | `platform/src/modules/tutor/allowance.ts`, `modules/payments/quota.ts` |
| Speaking policy (written, unwired) | `platform/src/modules/tutor/speakGate.ts` |
| Mini-quiz template to copy | `platform/src/modules/sim/lessons/quiz-trigger.ts` |
| Grading path — add `AnswerContext "lesson"` | `platform/src/modules/learning/submit.ts:37` |
| THEO-4-compliant verdict surface, reuse verbatim | `platform/src/components/theory/WhyPanel.tsx` |
| Section progress the hub already renders | `platform/src/app/(dashboard)/theory/page.tsx` |
| Rule catalogue (58 entries, the authored „opinions") | `platform/src/modules/sim/rules/catalog.ts` |
| Audio unlock + mute persistence to reuse | `platform/src/modules/sim/scene/simAudio.ts` |
| Utterance/voice spec belongs here (still a placeholder) | `docs/education/33_LEARNING_ASSESSMENT_AND_SCORING.md` |
