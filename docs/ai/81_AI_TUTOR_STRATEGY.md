# 81 — AI Tutor Strategy („Учителят")

**Status:** decision document · **Date:** 2026-07-25 · **Owner:** founder
**Supersedes nothing.** Complements `docs/ai/21_AI_INSTRUCTOR_SYSTEM.md` and `docs/ai/25_AI_DIALOGUE_AND_VOICE_SYSTEM.md` (both aspirational); this document is grounded in the code as it exists on branch `scenario-engine` at commit `165a58b`.

**Hard constraints assumed throughout:** ADR-001 (fictional vehicles) · ADR-002 (rule engine judges; LLM for dialogue/debriefs only; **never** free-recall of Bulgarian law — retrieval + citation only) · ADR-003 (no certificates) · ADR-004 (users are minors: minimal PII, no biometrics, explicit consent for any audio capture) · ADR-005 (Three.js + R3F + Rapier, browser-first) · doc 64 THEO-4 requirement-zero (no bare correct/wrong verdicts, ever).

**Evidence policy.** Every claim below is tagged:
- **[code]** — I read the file. Path and line given. Verified in this session.
- **[measured]** — I counted it from the repo in this session (script output).
- **[vendor]** — I fetched the vendor's own page/API in this session. URL given.
- **[second-hand]** — from a research pass I did not independently re-verify. Treat as directional; verify before betting money on it.

---

## 1. What the tutor is today

### 1.1 The honest state: it is built, and it has never been run

The belief that „the AI tutor hasn't been worked on" is **false**. Two commits built a complete product:

| Commit | Date | Scope |
|---|---|---|
| `2385961` | 2026-07-07 | „AI Учител — retrieval-grounded chat (ADR-002), citation whitelist from injected lawRefs, 30 msg/day budget guard, per-call cost tracking, graceful no-key state (44 tests)" |
| `165a58b` | 2026-07-25 | 80-audit remediation — added the global spend kill-switch, the trial gate, the paywall |

**[code]** `platform/src/modules/tutor/` contains 15 files: `service.ts`, `retrieval.ts`, `prompt.ts`, `model.ts`, `cost.ts`, `budget.ts`, `store.ts`, `fixtures.ts`, `index.ts` plus 6 test files. **[measured]** 76 tests total: budget 10, cost 6, prompt 12, retrieval 23, service 16, store 3, plus 6 in `src/app/(dashboard)/tutor/trial.test.ts`.

What is shipped:

- **[code]** `askTutor()` (`service.ts:86-211`) runs: burst limit → per-user daily cap → global money kill-switch → retrieval over our own corpora → grounded system prompt → model call → cost booking → citation whitelist.
- **[code]** The system prompt (`prompt.ts:68-85`) hard-forbids law from memory: rule 1 is „Отговаряш САМО въз основа на МАТЕРИАЛИТЕ… Никога не цитираш закон по памет"; rule 2 forces an exact refusal string when materials don't cover the question.
- **[code]** `extractCitations()` (`prompt.ts:102-119`) accepts only bracketed markers that normalise to a `lawRef` actually injected into this prompt. Everything else is dropped.
- **[code]** Three stacked limits, all evaluated before any spend: burst 8 req/60s (`modules/security/policy.ts:37`), 30 messages/day/user (`service.ts:35`), global $5/day money ceiling (`budget.ts:39`, Europe/Sofia day boundary, fails **open** on ledger read error).
- **[code]** A 5-message lifetime free trial (`modules/payments/quota.ts:64`) with a dedicated paywall screen.
- **[code]** A 229-line chat UI (`components/tutor/TutorChat.tsx`) with starter questions, typing indicator, aria-live, motion-reduce, error and limited states.

**What it has never had is an API key.** **[code]** `platform/.env` line 3 is `ANTHROPIC_API_KEY=""` — value length 2, i.e. empty. `isTutorEnabled()` therefore returns false and the page renders the „AI Учителят се активира скоро" card instead of the chat. The 80-audit says the same of staging.

> **Consequence:** every quality claim about this module — Bulgarian tone, refusal behaviour, latency, how a 17-year-old reacts to it — is currently **unverified**. Not one token has ever been generated.

### 1.2 What it retrieves from

**[code]** `retrieval.ts` is a pure keyword scorer — no embeddings, no index. Cyrillic-normalised token overlap, 3× title weight, 0.7 prefix match to absorb Bulgarian inflection. It ranks over four authored corpora and injects the top 6 content items + top 2 rule specs.

**[measured]** Corpus sizes:

| Corpus | Items | Bulgarian chars |
|---|---:|---:|
| `content/questions/*.json` — `explanationBg` | 1,089 | 326,036 |
| `content/questions/*.json` — `textBg` | 1,089 | 109,903 |
| `content/questions/*.json` — option `textBg` | — | 277,566 |
| `content/concepts.json` | 152 | — |
| `content/signs/signs.json` | 64 | — |
| `modules/sim/rules/catalog.ts` — `titleBg`/`explanationBg`/`correctiveBg` | 58 entries (52 violations + 6 commendations), 168 strings | 20,959 |
| **Total spoken-corpus surface** | | **713,505** |

For a ~1,300-item single-language corpus a linear scan is the right engineering. Do not replace it (see §7).

### 1.3 What it costs to run

**[code]** `cost.ts:16-20` books `claude-sonnet-5` at $3.00/$15.00 per 1M tokens (correct list price; the introductory $2/$10 rate expires 2026-08-31 and is deliberately not booked, so the ledger is conservative). **[vendor]** Confirmed against the current model table: Sonnet 5 $3/$15, Haiku 4.5 $1/$5.

**Real per-message cost.** Assumption: Bulgarian Cyrillic ≈ 2.2 chars/token on the Sonnet 5 tokenizer. The system prompt is ~1,235 chars of fixed instructions + 6 retrieved materials + 2 rule specs + a weak-concepts block ≈ **4,100 chars ≈ 1,860 tokens**, rebuilt on **every** call. Add up to 12 replayed history messages (`service.ts:39`) and a 2–4-sentence reply.

| | input tok | output tok | Sonnet 5 | Haiku 4.5 |
|---|---:|---:|---:|---:|
| First question (cold) | ~1,900 | ~140 | **$0.0078** | $0.0026 |
| Steady state (full history) | ~2,800 | ~200 | **$0.0114** | $0.0038 |
| Worst case (max materials + 500-char question + 1024-token reply) | ~5,050 | 1,024 | **$0.0305** | $0.0101 |

**The `budget.ts` sizing comment is wrong.** **[code]** `budget.ts:33-36` claims „$5/day ≈ 600 grounded answers at the measured average (~100 in / ~350 out tokens)". 100 input tokens is impossible — the system prompt alone is ~1,860. That figure is the **test fixture** value (`fixtures.ts:198-201` sets `inputTokens: 100, outputTokens: 50`). The true number is **~438 answers/day platform-wide** at $0.0114.

**Per-student economics.** A median exam-prep student asking 60–100 tutor questions over a 4-month pack costs **$0.68–$1.14** on Sonnet 5, or **$0.23–$0.38** on Haiku 4.5. Cost is not the reason to hold this feature back.

### 1.4 The five real defects

Ranked by user-visible damage:

**D1 — The ADR-002 citation whitelist is discarded by the UI. (CRITICAL)**
**[code]** `TutorChat.tsx:24` defines `const MARKER_SPLIT_RE = /(\[[^\][]+\])/g` and lines 26-44 style **every** bracketed substring as an accent-coloured law-citation chip. The server-validated `citations` array is transported over the wire (`components/tutor/types.ts:16` — „Law citations validated against the retrieved materials") and **read by nothing**: grep for `citations` across `src/components` returns only that type declaration. A hallucinated `[ЗДвП чл. 999]` renders pixel-identically to a verified one. The strongest structural guarantee in the repo is enforced in the module and thrown away in the component. **~2h to fix.**

**D2 — Follow-up questions lose their grounding entirely. (CRITICAL)**
**[code]** `service.ts:148` retrieves over the **current question only**; history is replayed separately as messages (`:163-165`) and contributes nothing to retrieval. `retrieval.ts:46-54` puts both „а" and „защо" in `STOPWORDS_BG`, and `:128` returns `[]` when the query tokenizes to nothing. So „А защо?" — the second message of a normal Bulgarian conversation — produces zero materials, the prompt says „(няма намерени материали по този въпрос)", and rule 2 forces the refusal „Нямам материал за това". **Deterministic, not hypothetical. ~4h to fix** (retrieve over previous+current question, bounded so a genuinely new topic doesn't drag stale materials along).

**D3 — The tutor exists on exactly one page.**
**[code]** Its only cross-surface entry point is a bare `<Link href="/tutor">` at `components/theory/WhyPanel.tsx:106`, which appears **only** in the fallback branch (when a question's stored explanation is missing) and carries no context. Grep for `@/modules/tutor` across `src` returns 12 files, all inside the tutor module, its page, and its tests. The tutor cannot see the question you just got wrong, the exam you just failed, or the roundabout you just botched, because nothing ever passes it that context. **This is the whole „everywhere" gap, in one line.**

**D4 — The learner model is half-wired.**
**[code]** `service.ts:154` calls `getReadiness(userId)` for the 3 weakest **theory** concepts. `getSimWeakSpots(userId)` exists and is exported from `modules/learning/index.ts`, and is consumed only by the dashboard. The theory tutor has no idea the student failed `FAILED_TO_YIELD` three times in the simulator last week. **~1h.**

**D5 — Two hygiene defects.**
**[code]** `service.ts:66-70` computes the per-user daily reset with `d.setHours(0,0,0,0)` — **server-local** midnight — while `budget.ts:69-76` correctly uses a Europe/Sofia day key and `payments/quota.ts:37-38` documents exactly why. On a UTC VPS the student's 30-message day rolls over at 02:00 or 03:00 Bulgarian time. Separately, `retrieval.ts:14` and `:195` say „46 authored violation specs"; **[measured]** the real count is 52 violations + 6 commendations. **~1h for both.**

### 1.5 The one unbuilt thing that was already designed

**[code]** `modules/sim/lessons/debrief.ts:13-24` contains a 12-line block headed `============ AI DEBRIEF SEAM ============`. It specifies exactly how an LLM layer may augment the deterministic post-drive debrief: *„the LLM may rephrase but must keep every lawRef citation intact and may NOT introduce legal claims that are not present in the events (ADR-002: retrieval + citation only, no free recall of Bulgarian law)"*, with the concrete call site marked `// AI debrief hook`. The grounding draft already exists. This is the highest-leverage unbuilt tutor feature in the repo.

---

## 2. The product vision, judged

The founder's vision: **an avatar with synced lips that points at examples and explains mistakes, present everywhere on the platform.**

That is three separate ideas welded together. They have wildly different value-per-hour. My job is to unweld them.

### 2.1 The scoreboard

| Component of the vision | Verdict | Why |
|---|---|---|
| **„Explains mistakes"** | ✅ **Build. Already 70% built.** | This is requirement-zero (doc 64 THEO-4). The content is written and law-cited. The gap is delivery timing, not content. |
| **„Present everywhere"** | ✅ **Build. Pure plumbing.** | Needs no new AI capability — retrieval, grounding, citation and budget machinery already handle it. ~8h of deep links. |
| **„Points at examples"** | ✅ **Build — but decouple it from the face.** | The evidence-backed half of the request, and it needs no avatar at all. |
| **A Bulgarian voice** | ✅ **Build — after a 3-hour audition.** | The single highest-effect variable in this whole document, and the single biggest unmitigated risk. |
| **Lip-sync** | 🟡 **Achievable, but only in 2D, and only later.** | Azure gives bg-BG viseme IDs free on the same call. But it buys engagement, not learning. |
| **A photoreal talking head** | ❌ **Trap. Do not build.** | Wrong economics, wrong bytes, wrong evidence, wrong failure mode. |
| **A live conversational avatar** | ❌ **Violates ADR-002 and ADR-004. Rule it out in writing.** | A vendor LLM answering law questions ungrounded + a minor's microphone streamed to a non-EU processor. |

### 2.2 Why the face is the wrong place to spend

**The learning evidence points the other way.** **[second-hand]** Mayer's multimedia-learning principles (Cambridge Handbook of Multimedia Learning, „Principles Based on Social Cues"):

| Principle | Median effect | What it means here |
|---|---:|---|
| **Image** (adding the speaker's picture to the screen) | **d = 0.22** | Small-to-negligible. This is the avatar. |
| **Voice** (human-sounding rather than machine) | **d = 0.74** | 3.4× the face. |
| **Personalization** (conversational register) | **d = 0.79** | Free — it's writing. |
| **Embodiment** (gesture/eye contact, *given* an agent exists) | d = 0.36 | Only pays after you already have a good agent. |
| **Signaling/cueing** (attention guidance) | **g = 0.38** | This is „points at examples", and it needs no face. |

Source: `https://www.cambridge.org/core/books/abs/cambridge-handbook-of-multimedia-learning/principles-based-on-social-cues-in-multimedia-learning-personalization-voice-image-and-embodiment-principles/3841340D8AD820C26DBCD39AE664BCEC`. I did not re-verify these numbers myself — but the *direction* (voice ≫ image) is consistent across every source consulted, and the north-star test is competence, not watch time.

**The bytes don't fit.** **[vendor]** Azure batch avatar renders 1920×1080 @ 25 fps at 2,000,000 bps by default — ~10 MB per 40-second segment, ~450 MB for the 52 mistake types. **[code]** `tools/assets/publicBudget.mjs:49-52` sets the `clips-video` bucket ceiling at **140,000,000 bytes**, and **[second-hand]** `node tools/assets/check-asset-budget.mjs --json` reports the current production `public/` payload at ~189.7 MB total with 108.1 MB already in `clips-video`. A photoreal head would more than **triple** the deployed bytes on a product whose users are on mid-range Android over Bulgarian mobile data. The audio-only equivalent is ~5 MB.

**The per-minute economics are absurd against this price point.** **[vendor]** Azure Retail Prices API, `westeurope`, `Foundry Tools / Azure Speech`:

| Meter | Unit | Price |
|---|---|---:|
| S1 Neural Text To Speech Characters | 1M chars | **$15.00** |
| TTS Standard Avatar Realtime Speech | 1 min | $0.50 |
| TTS HD Standard Avatar Realtime Speech | 1 min | $0.70 |
| TTS Standard Avatar Batch Speech | 1 min | **$1.00** |
| TTS HD Standard Avatar Batch Speech | 1 min | $1.35 |
| TTS Custom Avatar Batch Speech | 1 min | $2.00 |
| TTS Custom Avatar Training Unit | 1 hour | $15.00 |

Read that ratio again: **the face costs $1.00/min; the words cost about $0.009/min.** A live avatar at $0.50/min means one student watching 20 minutes a month costs $10 — against a €12.99 one-time pack and a platform-wide LLM ceiling of $5/**day**.

**The vendor landscape is not stable enough for a solo founder.** **[second-hand]** Ready Player Me — the avatar source in essentially every TalkingHead.js tutorial — shut its developer platform down on 2026-01-31 after Netflix acquired it in December 2025. Any guide that begins „create your RPM avatar" is dead code. Avatar-head vendors get acquired and switched off; you cannot absorb that.

**And a mediocre photoreal face is worse than no face.** **[second-hand]** The one avatar-first ed-tech product at scale (Praktika) is praised in aggregate but criticised specifically for the avatar — uncanny facial expressions, imperfect lip-sync, and no way to turn it off. Meanwhile the $100M-ARR outcome in AI tutoring (Speak) is **voice-first with the avatar optional**. The market's own A/B test has run.

### 2.3 What the founder is right about

Two things, and they matter:

1. **„Points at examples" is the evidence-backed half.** Signaling is g = 0.38 — higher than the image principle, and it costs ~12h with no vendor. **[code]** The machinery is nearly there: `components/theory/MistakeMedia.tsx` already plays clips with poster, `preload="none"` behind an IntersectionObserver, a MediaRecorder duration-probe workaround, `prefers-reduced-motion` guards and a canvas fallback; `components/sim/lesson-ui/GlanceEdgePings.tsx` already does pure-observer → phase-state → screen-edge pulse in the live sim. An arrow that lands on the cyclist at the exact second the voice says „велосипедистът" is a real teaching act.
2. **„Present everywhere" is the actual product gap** — and it is the cheapest thing on this list.

### 2.4 The version of the vision that survives contact with a Bulgarian teenager on a €150 phone

> A warm Bulgarian voice that explains the mistake · a simple friendly character that is clearly **drawn** rather than failing to be real · and a highlight that lands on the hazard at the exact moment the voice names it.

Revisit the 3D/photoreal head at 5,000 paying users, when you can pay an illustrator and an animator to make it good. **[second-hand]** Note also that a second WebGL context is technically hostile on your target hardware: Chrome caps at 8 concurrent contexts on Android and Firefox mobile at 2, and **[code]** `modules/sim/environment/quality.ts` already steps the sim *down* when the fps median falls below 48 at `maxDpr 1.0`. A DOM/2D character can legally sit on the simulator page; a 3D head cannot.

---

## 3. The Bulgarian voice problem

This is the make-or-break constraint, and I am not going to pretend I closed it. **I could not listen to any of these voices.** Everything below is documentation and pricing; the quality question requires a native ear and 3 hours.

### 3.1 The provider decision: Azure AI Speech, `bg-BG-KalinaNeural`

**Not because it has the most natural Bulgarian voice — it probably doesn't. Because it is the only provider that has all three of the things this product needs.**

| | Native bg-BG voice | Viseme/timing output for bg-BG | Pronunciation control for bg-BG |
|---|---|---|---|
| **Azure AI Speech (standard Neural)** | ✅ 2 voices | ✅ **Viseme ID** (verified) | ✅ IPA `<phoneme>` + bg-BG lexicon `<alias>` |
| Azure Dragon HD Omni | ✅ (bg-bg present) | ❌ no `<mstts:viseme>` | ❌ no `<phoneme>`, alias-only lexicon |
| Google Chirp 3 HD | ✅ 30 voices | ❌ no timing marks documented | ❌ docs state custom pronunciations unavailable for bg-BG |
| ElevenLabs | ✅ (Multilingual v2/Flash/v3) | ⚠️ char timestamps only, no visemes | ❌ English-biased phoneme tags |
| Amazon Polly | ❌ **no Bulgarian at all** | — | — |
| Piper (self-hosted) | ✅ 1 voice (`bg_BG-dimitar-medium`) | ❌ (recoverable via Rhubarb) | ❌ text preprocessing only |
| Web Speech API | ⚠️ platform-dependent | ❌ | ❌ |

**[vendor] Verified myself, this session:**
- The Azure viseme language-support table has exactly one Bulgarian row: `` | `bg-BG` | Bulgarian (Bulgaria) | Viseme ID| ``. Bulgarian gets **22 viseme IDs with 100-ns-tick audio offsets** — and **not** the 55-channel ARKit blend shapes (de/en/es/fr/it/pt/zh-CN only) and **not** SVG (en-US only). Source: `https://raw.githubusercontent.com/MicrosoftDocs/azure-ai-docs/main/articles/ai-services/speech-service/includes/language-support/viseme.md`
- Azure has exactly **two** bg-BG voices: `bg-BG-KalinaNeural` (F) and `bg-BG-BorislavNeural` (M). Both Standard type. **No HD variant, no multilingual variant, no speaking styles, no roles, no voice conversion.** Source: `https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts`
- Price in `westeurope`: **$15.00 per 1M characters** (`S1 Neural Text To Speech Characters`). Source: Azure Retail Prices API.

**The decisive argument is pronunciation, not prosody.** Your corpus is made of numbers and acronyms: „до 0,5 промила", „50 км/ч", „ЗДвП чл. 174", „ППЗДвП", „КАТ", „ДАИ", „ПТП". **[second-hand]** ElevenLabs' own help documentation concedes its multilingual models carry „a strong English phonetic bias", producing English pronunciation of numbers, acronyms and foreign words even in non-English contexts. That is precisely the failure that makes a 17-year-old close the tab. Azure is the only vendor that lets you *force* the right pronunciation via a `bg-BG`-scoped lexicon with `<alias>` expansions.

**One real Azure limitation to plan around:** `<say-as interpret-as="cardinal">` and friends are supported only for a documented list of ~20 languages, and **Bulgarian is not on it**. You must normalise numbers to Bulgarian words in your own pipeline („нула цяло и пет промила"). Budget ~12h for the normaliser + lexicon. That is the work that decides whether the voice sounds credible.

### 3.2 Real cost

| Scope | Chars | Azure @ $15/1M | ElevenLabs Flash @ $50/1M | ElevenLabs v2 @ $100/1M |
|---|---:|---:|---:|---:|
| Sim rule catalog (58 entries, the in-drive voice) | 20,959 | **$0.31** | $1.05 | $2.10 |
| All 1,089 question explanations | 326,036 | **$4.89** | $16.30 | $32.60 |
| Entire spoken corpus (explanations + question text + options) | 713,505 | **$10.70** | $35.68 | $71.35 |

Azure's free tier is 0.5M characters/month, so the whole thing can be synthesised for **$0.00** spread across two months. **Cost is not a decision input here. Quality is.**

**Storage and bandwidth are a non-issue.** 713,505 chars ≈ 714 minutes ≈ 11.9 hours of speech. At 32 kbps Opus that is ~171 MB; at 24 kbps ~128 MB — sitting on R2/CDN, not in `public/`. The **in-drive** voice track alone (58 catalog entries ≈ 21 minutes) is ~5 MB at 32 kbps, which fits comfortably in a new `tutor-audio` budget bucket. Viseme timelines add ~10 KB of JSON per segment.

### 3.3 The architectural decision that makes all of this cheap and ADR-002-clean

**Pre-synthesise the entire authored corpus at build time. Never call a TTS API for authored content at runtime.**

Three consequences, all good:

1. **Marginal cost per student for the explanation track = $0.00.** Break-even on the one-time $10.70 is 7–8 students.
2. **It is ADR-002 grounding *by construction*.** The bytes are a fixed rendering of reviewed, `lawRefs`-cited, `status: "approved"` content from `content/questions/`. No model is in the loop at playback time, so no model can free-recall Bulgarian law into a student's ears. This is a **stronger** guarantee than the chat path's prompt discipline, not a weaker one. State this in the PR.
3. **It is ADR-004-clean and stays clean if you hold one line.** TTS is output-only: no PII leaves your servers (you send your own authored Bulgarian text), no audio is captured, no biometric data exists. At runtime the student's phone fetches a static file and Azure never sees a request tied to a minor. **Hold the line at: no voice cloning** (a cloned voice is a voiceprint = biometric = ADR-004 violation) **and no speech-to-text at launch** (capturing a 17-year-old's voice needs consent machinery you have not built).

### 3.4 What happens if the quality is not good enough

**This is the risk (R14 in `docs/57_RISK_REGISTER`), and it is unmitigated until you listen.**

**The audition — 3 hours, <$1, do it before writing any pipeline code:**
Take three real `explanationBg` strings containing article numbers, „промила" and „км/ч". Synthesise each on (a) Azure `bg-BG-KalinaNeural`, (b) Google Chirp 3 HD bg-BG, (c) ElevenLabs v3. Play all nine to five 17-year-olds. Ask one question: „Would you listen to this for 20 minutes?"

**Contingency ladder, in order:**

1. **Kalina is fine → ship it.** Most likely outcome. Two voices and no styles means tone must come from the *writing*, which you control anyway.
2. **Kalina is flat but acceptable, another vendor is warmer → switch vendor, keep the architecture.** Put the TTS vendor behind a one-function interface, mirroring the existing `TutorModel` seam at `modules/tutor/model.ts:72-75` (`setTutorModel` for test injection). If Google or ElevenLabs wins, neither emits visemes — recover mouth timings by running **Rhubarb Lip Sync** (free, offline, language-independent phonetic recogniser, 9 Preston-Blair mouth shapes) over the WAV in the same build step. This is why the viseme decision does not lock you to Azure.
3. **Every voice is bad → ship captions-first and no voice.** Bulgarian text with timed signaling overlays still delivers the g = 0.38 cueing effect and requirement-zero. A mispronounced instructor is worse than a silent one. **This is an acceptable outcome, not a failure** — it costs you the d = 0.74 voice principle, but it does not block launch.
4. **Never ship the browser Web Speech API as the primary path.** **[second-hand]** On Android Chrome the voice list is unfiltered and Chrome silently falls back to an **English** voice when the bg-BG pack is not installed. A Bulgarian driving lesson read in an American accent is worse than silence. Acceptable only behind an explicit voice-availability probe, as a last-resort fallback.

---

## 4. Architecture for an omnipresent tutor

### 4.1 The organising principle: one budgeted service, two speeds

**Fast speed — inside the driving loop.** Deterministic, authored, zero-LLM, zero-network. The words already exist in `catalog.ts` and the audio is pre-rendered at build time. This is not a compromise; it is what ADR-002 already mandates, and it is the only design where the instructor is never late.

**Slow speed — at every pause point.** After an answer, after a drive, in free chat. The LLM, grounded exactly as `retrieval.ts` already grounds it.

**[second-hand]** Why the split is non-negotiable: budget ~1.0–1.5 s end-to-end for a short Haiku reply from a Bulgarian client (RTT + TTFT + server action + TTS). At 50 km/h the car travels 14–21 m in that window. The line lands after the junction. The rule engine already authors the correct line and delivers it in the same frame.

```
                    ┌──────────────────────────────────────────┐
                    │  askTutor()  — the ONE budgeted path     │
   theory why-panel │  burst → daily cap → global money cap    │
   exam review      │  → retrieval → grounded prompt → model   │
   sim debrief      │  → cost booking → citation whitelist     │
   free chat        └──────────────────────────────────────────┘
        ▲                                  ▲
        │ TutorContext (discriminated union)│ getReadiness + getSimWeakSpots
        │                                   │
   ─────┴───────────────────────────────────┴─────
   SLOW LANE (pause points only)
   ═══════════════════════════════════════════════
   FAST LANE (driving loop) — no LLM, no network
   speakGate.ts → hudBg line + pre-rendered .opus + timed cue track
```

### 4.2 What context each surface needs

Add `TutorContext` as a discriminated union and let `askTutor()` take it as an optional second argument. **When present it replaces retrieval for that turn** — the materials are already known and exact, so grounding is stronger *and* the prompt is smaller and cheaper.

| Surface | Context payload | Grounding source | Model |
|---|---|---|---|
| **Theory why-panel** | `questionId`, `textBg`, picked `optionIds`, `correctOptionIds`, per-option `whyWrongBg`, stored `explanationBg` + `lawRefs`, `conceptId`, mastery delta | the question itself — retrieval skipped | Haiku 4.5 |
| **Post-exam review** | the mistake list + concept ids + the exam's own weights | the questions themselves | Haiku 4.5 |
| **Sim debrief** | `LessonResult` events + `buildDebrief()` deterministic text as the grounding draft | rule catalog (already law-cited) | Sonnet 5 |
| **Sim in-drive** | — | **no LLM** — authored `hudBg` from `catalog.ts` | none |
| **Free chat** | none | `retrieveGrounding()` as today | Sonnet 5 |

Cross-surface memory: call `getSimWeakSpots(userId)` alongside `getReadiness(userId)` at `service.ts:154` and render both blocks in `buildTutorSystemPrompt`. Tag each persisted `TutorMessage` with `surface` — the messages column is Json, so no migration. **This one change is what makes it ONE tutor rather than three.**

### 4.3 When it speaks

**Copy the existing gate, don't invent one.** **[code]** `modules/sim/lessons/quiz-trigger.ts:37-42` already implements the correct shape: `occasional { minGapSec: 45, maxPerSession: 2 }` / `frequent { minGapSec: 25, maxPerSession: 4 }`, deliberately deterministic with no randomness, evaluated as a pure function over the tick stream.

Build `modules/sim/lessons/speakGate.ts` as its twin — pure, deterministic, node-testable.

**Hard mutes (inherit, don't re-derive):**
- `lesson.examMode === true`. **[code]** `modules/sim/lessons/advisor.ts:168` already returns null unconditionally on exams. **[second-hand]** Наредба № 38 чл. 47, ал. 4 forbids the commission from intervening during the exam except to prevent an accident. A mock exam that coaches teaches the student to expect a voice that will not be there.
- `phase !== "driving"`; any overlay open; within 8 s of any HUD toast.
- While an `опасна`/terminating event is live. **[code]** `components/sim/lesson-ui/TeachMomentOverlay.tsx:16-19` already encodes the founder-ratified rule that dangerous mistakes get a non-blocking toast, never a modal, precisely so nothing lands during evasive action.
- Add `isSafeToInterrupt(tick, recentEvents)`: `speedKmh ≤ 5` **OR** (≥3 s since any `turnStarted`/`stopLineCrossed`/`crossingZoneEntered` **AND** `leadGapM > 15`). **[code]** `quiz-trigger.ts:97-112` currently maps `stopLineCrossed` and `turnStarted` straight to a quiz — i.e. it can pause the sim mid-steering-input. Gate it; cap the wait at ~20 s then drop rather than fire late. Keep the `crossingZoneEntered` freeze — freezing 25–30 m before a hazard and asking „what happens next" is textbook hazard-perception training.

**Triggers, highest priority first:**
1. A **repeat** graded mistake where the escalation multiplier > 1 — the toast already gave the *why* the first time; the voice adds „това е третият път".
2. A **commendation for a code the student previously failed** — the „you fixed it" moment. Nothing in the product currently celebrates this, and it is the single most motivating line an instructor says.
3. Objective complete.
4. A stationary window (speed < 3 km/h at a red, or pre-drive) — the only place a longer line is safe.

Cooldown 40 s, max 5 lines/session, queue-and-**drop** (never flush a stale queue). Ride on the existing `ADVISOR_STORAGE_KEY` toggle so one switch silences the whole coaching layer.

### 4.4 What it says, and how long

**[measured]** The current mid-drive copy is unreadable at the moment it fires. `catalog.ts` `explanationBg` has a **median of 29 words** (max 57). **[code]** `modules/sim/hud/HudToasts.tsx` gives teaching toasts 8,000 ms and stacks up to 4. 29 words at an undistracted ~200 wpm is ~9 s of reading — *before* any driving load. Four stacked toasts is ~116 words on a windscreen.

**Fix: add a required `hudBg` field (≤ 6 words) to `ViolationSpec`.** The type already enforces completeness, so the compiler forces all 52 codes to get one. The HUD renders **only** `hudBg`; `explanationBg` + `correctiveBg` + `lawRef` move to the pause and the debrief.

**The line must name the HAZARD, never the control action, and never the law.** **[second-hand]** Koo et al. (IJIDeM 2015) found „how" messages („the car is braking") produced poor driving performance, while „why" messages („obstacle ahead") were preferred and gave lower anxiety, better situational awareness and better performance.

| Code | ✅ `hudBg` | ❌ never |
|---|---|---|
| `PEDESTRIAN_NOT_YIELDED` | „Пешеходка на пътеката." | „Спирай!" |
| `FOLLOWING_TOO_CLOSE` | „Много близо си." | „ЗДвП чл. 23" |
| `LANE_CHANGE_WITHOUT_MIRROR_CHECK` | „Без огледало." | „Погледни в огледалото и после завий" |
| `SPEEDING_DANGEROUS` | „50 е тук." | „Намали скоростта веднага!" |
| `SEATBELT_OFF_WHILE_MOVING` | „Колана." | — |

Cap: **one** line on screen at a time (not four), and no live line for the same code twice in 30 s.

Add a lint test asserting `hudBg` ≤ 6 words and containing no imperative verb from a small blocklist. Budget ~9h, mostly Bulgarian authoring.

**Praise rule.** **[second-hand]** Kluger & DeNisi's meta-analysis (607 effect sizes) found over a third of feedback interventions *decreased* performance, concentrated where attention shifted to the self; Mueller & Dweck showed ability-praise produced less persistence after failure. The 6 commendation strings are close to that line — `CLEAN_DRIVING` says „Продължавай така" (empty) and `PEDESTRIAN_YIELDED` says „Това спасява животи" (moralising). **Rewrite both.** A commendation names the **act** and the **mechanism**: „Намали 30 м преди пътеката — затова спря спокойно." Never the person („умен си"), never the moral.

### 4.5 How it points at things

Three mechanisms, in increasing cost:

**Theory (trivial).** Option ids are already stable and `correctOptionIds` already drives styling in `PracticeSession.tsx`. Let the tutor reply carry an optional `{highlightOptionId}` marker, validated against the question **exactly the way `extractCitations` validates law refs**. An invented option id must never highlight anything.

**Clip overlays (12h, highest learning-per-hour in this document).** Add a cue track to the same timing JSON as the audio, and drive timed highlight/arrow/dim overlays on the existing mistake clip. Rides on `MistakeMedia.tsx` and the fault-marker code in `modules/clips/capture/`. Must respect `prefers-reduced-motion` like the rest of the codebase. Author the cue timestamps **in the same pass as the voice script**, not as a second project.

**In-sim world markers (later).** ⚠️ **[code] The `SceneStillMark` machinery (target/danger/proceed/yield) is a BUILD-TIME PNG generator, not a live overlay.** `lib/content/types.ts:92-96` defines the marks as authored content data; `app/dev/scene-still/SceneStillScene.tsx` lives under `app/dev/` and its output is baked to `public/scene-stills/<id>.png`. **The tutor cannot drive it at runtime.** The honest path is to reuse the two things that *do* run live: `components/sim/lesson-ui/GlanceEdgePings.tsx` (pure observer → phase state → screen-edge pulse) for a tutor-emitted marker, and `components/sim/RouteGuidance.tsx`'s objective light-pillar for a „look here" beacon. New R3F code in a perf-sensitive frame loop — respect the existing zero-allocation-per-frame contract.

### 4.6 How it stays ADR-002-compliant

Five rules, four of which are already enforced somewhere in the repo:

1. **One model client, one budgeted path.** Every new surface calls through `askTutor()`-equivalent guards. A second Anthropic client silently bypasses the global kill-switch and the ceiling stops protecting a real credit card.
2. **Retrieval or explicit context — never free recall.** `prompt.ts` rule 1 stays verbatim. The refusal string is a **feature**: an honest „Нямам материал за това" is better than a confident invention.
3. **Citations are whitelisted at the module AND rendered from the whitelist.** Fix D1. Add a test asserting an invented marker does **not** render as a chip. Persisted threads store raw reply text, so the fix must cover `initialMessages`, not just new replies.
4. **The debrief LLM may rephrase, never assert.** Reuse `extractCitations()` as a hard accept/reject validator: every `lawRef` in the output must appear in the input events, else ship the deterministic template. The template fallback already exists and is the documented behaviour.
5. **Pre-synthesised audio is grounding by construction** (§3.3). It is the strongest ADR-002 surface in the product.

---

## 5. Credits: don't build them

The founder asked for a designed credit system. **My recommendation is to reject the premise and build an allowance instead** — and I want to be explicit about why, because this is the section where I am most directly disagreeing.

### 5.1 The diagnosis is wrong. This is a capping problem, not a metering problem.

**[code]** `modules/payments/quota.ts:243-256` returns `unlimited: true` the moment `hasCore` is true. **[code]** `packs.ts:31,60` sets `PACK_ACCESS_MONTHS = 4` and `priceEurCents: 1299`. A pack is ~122 calendar days; the only remaining brake is 30 messages/day.

| | Messages | Sonnet 5 COGS | Haiku 4.5 COGS | Revenue |
|---|---:|---:|---:|---:|
| Median student (4 months) | 60–100 | $0.68–$1.14 | $0.23–$0.38 | €12.55 net¹ |
| **Maximum determined user** | **3,660** | **$41.72** | $13.90 | €12.55 net |
| Worst-case-per-call user | 3,660 | $111 | $37 | €12.55 net |

¹ €12.99 gross − Stripe EEA 1.5% + €0.25.

**The tail is 3.3× revenue, and the only hard backstop is *global* — so one abuser exhausts the day for every paying student.** That is the actual bug. A currency does not fix it; a number does.

### 5.2 The second real bug: the $5/day ceiling will brown out on legitimate traffic

$5 ÷ $0.0114 = **438 answers/day site-wide**. Five hundred active students at a modest 3 questions/day = 1,500 messages = $17/day. The ceiling trips mid-morning and every student sees `TUTOR_BUDGET_REPLY_BG` for the rest of the day, on your best traffic day.

**And the free tier is farmable.** **[code]** `prisma/schema.prisma` has no `emailVerified` column and `modules/auth/` verifies nothing. 1,000 scripted signups × 5 free messages ≈ $57 — and, worse, a full-day tutor outage for everyone who paid.

### 5.3 Recommendation: a per-pack **allowance**, not a currency

**Design.** Extend `quota.ts` with `checkTutorPackAllowance(userId, now)`: count `role: "user"` messages in the persisted `TutorThread` since the active `Entitlement.purchasedAt`, cap at **300 tutor questions per 4-month pack** (≈2.5/day). Keep the 30/day and the global ceiling on top.

**No new Prisma model.** This counts rows exactly the way `checkTutorQuota` already counts `usedLifetime`.

**Unit economics of the cap:**

| | Sonnet 5 | Haiku 4.5 |
|---|---:|---:|
| Worst-case COGS per pack (300 msgs) | $3.42 | $1.14 |
| Net revenue | €12.55 | €12.55 |
| **Worst-case gross margin** | **73%** | **91%** |
| Median-student margin (~80 msgs) | 93% | 98% |

**UX.** Show the counter **only below ~20% remaining**, in the Учител's own voice, naming what still works — the same shape as `TUTOR_BUDGET_REPLY_BG`. 95% of students never see a number. „Остават ти 47 от 300 въпроса към Учителя" reads as generous; a credit balance reads as a taxi meter.

**Ship it in the same PR as raising `TUTOR_DAILY_BUDGET_USD` to ~40** (≈3,500 answers/day). Never separately — the raised ceiling is only safe *because* the per-user cap now exists.

### 5.4 Why not credits

| Argument | Assessment |
|---|---|
| „Credits blend LLM + TTS costs" | **The premise doesn't hold.** There is no TTS in the codebase today, so 100% of tutor COGS is tokens. And after pre-synthesis (§3.3), TTS marginal cost is **$0.00** for authored content, and ~$0.005–0.009 for a 300-char dynamic reply — *the same order of magnitude as the LLM call*. „One tutor answer" stays the honest unit even after voice ships. |
| „Credits let me price precisely" | At a defensible 5× markup a credit is €0.055, so a 100-question pack is **€5.50 — 42% of the entire €12.99 product** for something currently bundled. It cannibalises your own pricing. |
| „Token-based credits are fairest" | **Worst option for trust.** Input varies 2.7× per message ($0.011 → $0.031) because of retrieval-block size and history replay — neither of which the student controls or can predict. Identical-looking questions would cost different amounts for reasons that are purely your implementation detail. |
| „Everyone does credits" | Prosumer *tools* do (ElevenLabs, Midjourney). **Education does not.** **[second-hand]** Khanmigo is $4/month for *unlimited* AI tutoring covering up to 10 children; Duolingo's 2025 shift to depleting „energy" produced documented churn to Babbel and LingQ. |
| Pedagogy | **Decisive.** A visible per-question price is exactly what doc 64 THEO-4 forbids. A student who does not ask because it costs is the failure requirement-zero exists to prevent. |

**Effort:** allowance ≈ 11h. Full credit currency ≈ 36–45h, plus a support surface a solo founder cannot staff („my credits disappeared").

### 5.5 The one place a ledger earns its keep — later, conditionally

If, after **6 weeks of real usage data**, more than ~3% of students hit 300, add a **€4.99 „+200 въпроса" top-up** as a third `packs.ts` entry.

Implementation rules, non-negotiable:
- Append-only `TutorCreditLedger { id, userId, delta Int, reason, refId String?, createdAt }` with `@@unique([userId, refId])` for webhook idempotency. **Never a mutable `credits: Int` column** — a retry or concurrent request against a mutable counter is a lost-update bug that eats a student's balance with no audit trail.
- Balance = `SUM(delta)`. Always rendered as *questions*, never as currency.
- **Check before the call (cheap read); debit AFTER a successful model call, inside the same `db.$transaction` as `saveExchange`.** **[code]** `askTutor` can return `limited: true` from three guards without ever calling Anthropic; a pre-debit charges for all three.
- The concurrent over-spend window is bounded to ≤8 uncharged messages (~$0.09) by the existing 8/min burst limiter. That is cheaper than any reservation protocol — don't build one.

**Economics:** €4.99 gross → €4.42 net; 200 × $0.0114 = $2.28 COGS → **52% margin on Sonnet 5, 84% on Haiku 4.5**.

### 5.6 Model choice

Do **not** downgrade to Haiku 4.5 for cost *before you have ever seen Sonnet 5's Bulgarian output*. That is optimising an unmeasured cost against an unobserved quality, in a small language, to save a few dollars a month.

But **do evaluate it in v0**, because it is a 3× cut for one line in `cost.ts:16-20` and the task is close to ideal for a small model: the tutor never free-recalls law, it paraphrases six injected materials in 2–4 Bulgarian sentences, and its citations are whitelisted. If Haiku holds up on 50 real Bulgarian questions, the 4-month tail drops from $41.72 to $13.90 and much of the commercial pressure evaporates.

**Recommended split:** Haiku 4.5 for short grounded inline replies (why-panel, exam review); Sonnet 5 for the debrief and free-form chat. Note: Haiku 4.5's minimum cacheable prefix is 4,096 tokens, so a short grounded prompt will **not** hit prompt cache — do not budget a cache discount on the inline surface.

**Do not add prompt caching to the chat path either.** The per-question materials block sits *inside* the system prompt (`prompt.ts:81-87`), so the prefix differs on every single call and nothing after it can ever cache. Moving the materials into the user turn would make ~3,400 tokens cacheable at 0.1× — worth ~6h *after* the cap ships, not before.

---

## 6. Staged roadmap

### v0 — „Make what exists actually work" · **18 h** · build this FIRST

| # | Item | h | Unlocks |
|---|---|---:|---|
| 0.1 | **Set `ANTHROPIC_API_KEY` on staging and ask 20 real Bulgarian questions** (incl. deliberate follow-ups, an off-syllabus question, and one whose answer lives in the sim rule catalog) | 1 | Converts every unverified claim in §1 into a verified one. ~$0.20 of spend. The ceilings already protect the card. **Highest-value hour available.** |
| 0.2 | Close the citation-chip leak (D1) — render chips from the validated `citations` array; cover `initialMessages`; add a test that an invented marker does NOT render as a chip | 2 | ADR-002 restored end-to-end. This is your differentiator; today it fails at the last inch. |
| 0.3 | Make follow-up turns keep their grounding (D2) — retrieve over previous+current when the current scores below the prefix-match floor; test „А защо?" as turn 2 | 4 | Turns a one-shot Q&A box into a conversation. |
| 0.4 | Hygiene (D5) — Europe/Sofia day key in `service.ts`; fix „46"→52; fix the fixture-derived token comment in `budget.ts` | 1 | Removes a user-visible 3 a.m. surprise and stops two comments from misleading future work. |
| 0.5 | **Per-pack allowance (300 questions) + raise `TUTOR_DAILY_BUDGET_USD` to 40 — same PR** | 8 | Removes the $41–$111 tail AND the brownout. Neither is safe alone. |
| 0.6 | Gate the 5 free lifetime messages behind email verification | 2 | Closes the only abuse vector the stack genuinely does not contain. |
| — | *(free, in parallel)* Evaluate Haiku 4.5 on 50 real Bulgarian questions | — | Possible 3× cost cut before any pricing decision. |

**v0 delivers most of the value in this document.** After it, the tutor is a real, safe, sellable product.

### v1 — „The tutor is everywhere" · **34 h**

| # | Item | h | Unlocks |
|---|---|---:|---|
| 1.1 | `TutorContext` discriminated union + `getSimWeakSpots` into the prompt (D4) | 7 | ONE tutor instead of three. The sim and theory halves share a memory of the student. |
| 1.2 | Contextual entry points — „Питай Учителя за този въпрос" from the why-panel (replacing the dead link at `WhyPanel.tsx:106`), the post-exam review, and the sim debrief | 8 | **This IS „the tutor helps everywhere."** Zero new AI capability. ⚠️ A query param is untrusted prompt input — route it through the existing `TUTOR_MAX_INPUT_LENGTH` validation. |
| 1.3 | `hudBg` field on all 52 violation specs + two-tier utterance split + rewrite `CLEAN_DRIVING` / `PEDESTRIAN_YIELDED` | 9 | Makes ~half of all mid-drive teaching *visible* for the first time. |
| 1.4 | `isSafeToInterrupt()` gate on quiz + teach-moment pauses | 5 | Stops the product violating its own „never interrupt a manoeuvre" principle. |
| 1.5 | Self-evaluation screen before the debrief score („Кое беше най-рисковото нещо, което направи?") | 5 | GDE self-evaluation + DVSA client-centred learning in one screen, zero LLM cost. Converts the debrief from *being told* to *being checked*. |

### v2 — „It speaks and it points" · **39 h** (+3 h gate)

| # | Item | h | Unlocks |
|---|---|---:|---|
| **2.0** | **VOICE AUDITION — 3 real scripts × 3 vendors × 5 teenagers** | **3** | **GATE. Everything below depends on the answer. <$1.** |
| 2.1 | Build-time bg-BG TTS pipeline: `tools/theory/synthesize_bg.mjs` walks the corpus, keys output by content hash (incremental), emits `.opus` + `visemes.json` + a manifest; new `tutor-audio` budget bucket (12 MB ceiling); vendor behind a one-function seam mirroring `TutorModel` | 12 | $0.31 for the whole in-drive voice track. Reuses the `MistakeMedia.tsx` manifest/poster/reduced-motion discipline verbatim. |
| 2.2 | Bulgarian text normaliser + `bg-BG` PLS lexicon (ЗДвП / ППЗДвП / КАТ / ДАИ / ПТП / ‰ / км/ч / чл. / ал. / т.) **and listen to 50 synthesised explanations end to end** | 12 | The load-bearing hours. Skipping the listen-through is how you ship a tutor that says „Zed-De-ve-Pe chlen forty-seven". R0 discipline, applied to audio. |
| 2.3 | Player + mixer integration — reuse the gesture-unlock and mute persistence already proven in `modules/sim/scene/simAudio.ts`; duck engine/tyre layers under the voice; always-on Bulgarian captions | 5 | The autoplay problem that trips every talking-avatar integration is already solved here. |
| 2.4 | Timed signaling overlays (cue track → highlight/arrow/dim on the existing mistake clip) | 10 | g = 0.38. Highest learning-per-hour item in this document. Author cue timestamps in the same pass as 2.2. |

### v3 — conditional, in priority order

| Item | h | Condition |
|---|---:|---|
| LLM debrief at the `// AI debrief hook` seam (Sonnet 5, `extractCitations` as validator, template as fallback, ~140-word cap) | 12 | After v2. ~$0.014/debrief. **The one feature that makes „virtual driving instructor" literally true by fusing the two product halves.** |
| Per-distractor `whyWrongBg` — **top 250 questions only** (750 distractors) | 22 | After measuring whether the why-panel is actually read. Full-bank coverage (3,267 distractors ≈ 55 h) is **not** worth it before launch. |
| 2D character + viseme lip-sync (collapse 22 Azure IDs → ~10 mouth shapes; Rive or SVG sprite; pure DOM/2D so it can legally sit on the sim page) | 22 | Only after the voice is proven good. If the voice is mediocre, no face rescues it — and if it's great, you may find you never need one. Budget ~20 of those hours for **art**, or commission one character for €200–500. |
| €4.99 „+200 въпроса" top-up ledger | 9 | Only if >3% of students hit the 300 cap after 6 weeks. |
| „Кажи какво виждаш" tap-based commentary drive | 26 | Post-launch. Best-evidenced driver-training technique available — and it inverts the guidance-hypothesis problem (the student generates, the tutor confirms). **Taps, never voice input** (ADR-004). |

**Totals:** v0 = 18 h · v0+v1 = 52 h · v0+v1+v2 = 94 h.

### The three-line version

1. **Set the API key and use it for an hour.** Everything you believe about this module is currently a guess.
2. **Fix the citation chip, the follow-up refusal, and the unbounded pack** — 14 hours that turn a demo into a product.
3. **Audition the Bulgarian voice before writing one line of voice code.** It is the highest-effect variable and the biggest unmitigated risk.

---

## 7. What NOT to build

Each of these should be recorded as a decision so it does not resurface in three months.

### Rule out on constraints (write an ADR)

1. **Live conversational avatars** (Azure Voice Live avatar, HeyGen Video Agent, D-ID Agents). Two hard violations in one product: **ADR-002** — a vendor-hosted LLM answers in the loop, free-recalling Bulgarian traffic law with no retrieval grounding and no `lawRefs` citation; **ADR-004** — continuous microphone capture of a minor streamed to a non-EU processor, requiring granular consent machinery you would have to build and defend. Rule out *before* price.
2. **Voice input / speech-to-text of any kind at launch.** Capturing a 17-year-old's audio is a different processing category from playing synthesised audio back to them. TTS output-only keeps this feature entirely outside GDPR's hard zone. If ever revisited: push-to-talk, transient, never persisted, behind an explicit consent screen — and note the commentary-drive mechanic works just as well with **taps**, which are also easier to score.
3. **Voice cloning.** A cloned voice is a voiceprint = biometric = ADR-004 violation. No exceptions.

### Rule out on economics and bytes

4. **Pre-rendered photoreal talking-head video.** Cost was never the objection ($30 for the whole library). ~10 MB per 40-second segment × 52 = ~450 MB against a total production payload of ~189.7 MB and a `clips-video` ceiling of **140,000,000 bytes** already 108.1 MB full **[code]**. Every copy edit becomes a re-render and a multi-megabyte redeploy — and your why-panel copy will change dozens of times before launch.
5. **Live server-rendered talking heads** ($0.50–$3.00 per student-minute against a €12.99 one-time price and a $5/day platform ceiling).
6. **Synthesia-style AI presenter videos for the 19 theory topics.** You already have the strictly better asset — the real-3D mistake clips *show* the junction instead of showing someone talking about it. And a video library rots on every ЗДвП amendment in a way a solo founder cannot maintain.

### Rule out on engineering judgement

7. **Embeddings / a vector store for retrieval.** 1,305 items scan instantly. Anthropic ships no embeddings endpoint, so this adds a second vendor and a second Bulgarian-quality unknown, plus a re-embed pipeline on every content edit. **[measured]** The actual failure mode is stopword/zero-token follow-ups — a 4-hour fix (0.3), for free.
8. **An LLM call inside the driving frame loop.** ~1.0–1.5 s end-to-end = 14–21 m of road at 50 km/h. A slower, less reliable, more expensive version of what the rule engine already delivers in the same frame is not an upgrade.
9. **A second WebGL context (3D avatar) on the simulator page.** Chrome caps at 8 contexts on Android, Firefox mobile at 2, and the auto-quality probe already steps down below 48 fps at `maxDpr 1.0`. If a 3D head is ever built, gate it to theory/debrief pages and to `med`/`high` quality only.
10. **Azure Dragon HD Omni for Bulgarian**, even though it is more natural. It supports neither `<mstts:viseme>` nor `<phoneme>`, and its lexicon is alias-only — you would surrender **both** of the reasons to be on Azure.
11. **Streaming the chat UI.** Replies are capped at 1,024 tokens and average ~140; non-streaming is well inside the timeout envelope and the typing indicator already covers the wait.
12. **Prompt caching on the chat path, as currently structured.** The materials block sits inside the system prompt, so the prefix differs every call. You would pay the 1.25× write premium for zero reads.
13. **`say-as interpret-as` for Bulgarian numbers.** Not supported for bg-BG. Normalise in your own pipeline.
14. **Blend-shape / ARKit-style lip-sync.** Azure emits blend shapes for de/en/es/fr/it/pt/zh only **[vendor]**. Bulgarian gets 22 viseme IDs and nothing else. Anything richer means hand-rolling a Bulgarian grapheme-to-phoneme engine — a research project, not a sprint task.

### Rule out on pedagogy

15. **The 29-word explanation in a driving-time toast.** Split the string; do not lengthen the timer.
16. **Telling the driver what to DO mid-drive.** Name the hazard; let the student choose the input. That is also what builds the error-detection capacity the guidance hypothesis says augmented feedback destroys.
17. **Reciting law mid-drive.** Unreadable, unmemorable, and it reads as blame. Law belongs to the pause, the why-panel and the debrief.
18. **Moralising about death, responsibility, or „младите шофьори".** A 17-year-old discounts it instantly and it shifts attention from task to self — the exact mechanism identified as harmful. State the physics instead, cited from the content bank.
19. **Any tutor presence during any exam** — neither the 45-question mock nor `lesson.examMode === true`. Already correct in code; protect it with a test.
20. **A chatty default.** Ship the SpeakGate conservative (40 s cooldown, max 5 lines) with a visible off switch. An instructor who talks constantly is the fastest way to make students turn the feature off and never turn it back on.

### Rule out on process

21. **Rebuilding the tutor.** ~2,760 lines, 76 tests, a chat UI, a paywall and a trial gate already shipped. The problem is that it has never been *run*.
22. **Downgrading to Haiku for cost before ever observing Sonnet 5's Bulgarian output.** Evaluate it in v0; decide on evidence.
23. **Paying for ElevenLabs Bulgarian before testing Azure Kalina on your own ЗДвП terminology.** Vendor language lists are not quality guarantees for small languages.
24. **Commissioning or modelling a character before the voice audition is done.**
25. **Treating `docs/education/30` and `docs/education/33` as sources of truth.** Both are 3-line placeholders („Status: placeholder — awaiting project prompt"). Doc 33 is the correct home for the utterance spec in §4.4 — write it there, or the tutor's voice will drift as the bank grows past 1,089 questions and there will be no reviewable standard to check new copy against.

---

## Appendix A — Open uncertainties (be honest about these)

| # | Uncertainty | How to close it | Cost |
|---|---|---|---|
| U1 | **Sonnet 5's Bulgarian tutor output has never been seen.** Tone, register, refusal behaviour, latency — all unverified. | Item 0.1 | 1 h, $0.20 |
| U2 | **No bg-BG voice has been heard.** Every vendor claims natural Bulgarian; none publishes evidence. On a small language, documentation is not a substitute for a native ear. | Item 2.0 | 3 h, <$1 |
| U3 | **The 2.2 chars/token assumption for Bulgarian Cyrillic** drives every cost figure in §1.3 and §5. | `client.messages.count_tokens` on 20 real prompts (free) | 1 h, $0 |
| U4 | **The ~189.7 MB production payload figure** is second-hand. The 140 MB `clips-video` ceiling is verified in code. | `node tools/assets/check-asset-budget.mjs --json` | 2 min |
| U5 | **The Mayer/Koo/Kluger effect sizes** are second-hand from a research pass. The direction is consistent across sources; the exact magnitudes are not re-verified. | Optional — the decision does not hinge on the second decimal | — |
| U6 | **The competitive claim that „nobody has shipped an AI driving tutor"** in `docs/business/41:23` is reportedly false as of 2026 (Germany's Fahren Lernen KI-Lernhilfe; Romania's AIPermis.ro and Drivero shipped Feb 2024). **[second-hand]** — but if true it invalidates any „world first" positioning. Bulgaria-first is still uncontested: the incumbent Avtoizpit app has not shipped a build since 2017. | Spend 30 min on the three vendor sites before writing any pitch deck | 0.5 h |

## Appendix B — File index for implementers

| Concern | Path |
|---|---|
| Tutor service, guards, ordering | `platform/src/modules/tutor/service.ts` |
| Grounding prompt + citation whitelist | `platform/src/modules/tutor/prompt.ts` |
| Keyword retrieval + stopwords | `platform/src/modules/tutor/retrieval.ts` |
| Money kill-switch + Sofia day key | `platform/src/modules/tutor/budget.ts` |
| Pricing constants + cost booking | `platform/src/modules/tutor/cost.ts` |
| Model seam (swap point for tests/vendors) | `platform/src/modules/tutor/model.ts` |
| Chat UI (citation-chip bug at line 24) | `platform/src/components/tutor/TutorChat.tsx` |
| Validated citations, currently unread | `platform/src/components/tutor/types.ts` |
| Quotas, free trial, pack gating | `platform/src/modules/payments/quota.ts` |
| Pack pricing + 4-month window | `platform/src/modules/payments/packs.ts` |
| Sim rule catalog (52 violations + 6 commendations) | `platform/src/modules/sim/rules/catalog.ts` |
| **AI debrief seam** | `platform/src/modules/sim/lessons/debrief.ts:13-24` |
| Intervention-gate template to copy | `platform/src/modules/sim/lessons/quiz-trigger.ts` |
| Advisor (exam mute, authored-copy-only) | `platform/src/modules/sim/lessons/advisor.ts` |
| HUD toast TTLs and stacking | `platform/src/modules/sim/hud/HudToasts.tsx` |
| Live in-sim pointing patterns | `platform/src/components/sim/lesson-ui/GlanceEdgePings.tsx`, `platform/src/components/sim/RouteGuidance.tsx` |
| Clip player discipline to reuse | `platform/src/components/theory/MistakeMedia.tsx` |
| Procedural WebAudio mixer + gesture unlock | `platform/src/modules/sim/scene/simAudio.ts` |
| Asset budget buckets (add `tutor-audio` here) | `tools/assets/publicBudget.mjs` |
| Dead tutor link to replace | `platform/src/components/theory/WhyPanel.tsx:106` |
