# Architecture & Product Decision Records

> Living decision log. Format per decision: Problem · Options Considered · Chosen Solution · Trade-offs · Risks · Future Migration Strategy · Reason. Statuses: **Accepted** / Proposed / Superseded.

---

## ADR-001: Fictional-but-realistic vehicles (no licensed car brands)

- **Date / Status:** 2026-07-07 · **Accepted** (founder)
- **Problem:** The vision listed real brands (Audi, BMW, Tesla…). Using real brands, logos, and interiors requires per-manufacturer licensing deals (typically expensive, slow, and gated to established studios). Unlicensed use invites litigation.
- **Options considered:** (a) license real brands; (b) fictional-but-realistic vehicles named/designed by us; (c) generic unbranded vehicles.
- **Chosen:** (b) — vehicles are defined by *class and characteristics* (compact manual hatchback, automatic EV crossover, van, truck, motorcycle), each with distinct realistic interiors and our own model names.
- **Trade-offs:** Lose brand-recognition appeal; gain full creative control, zero licensing cost/risk, and freedom to design interiors for teaching (clear sightlines to mirrors/dashboard).
- **Risks:** Designs must not be near-copies of real models (trade-dress claims) — keep them recognizably generic per class.
- **Future migration:** Brand partnerships remain possible at H3 (manufacturers may *pay us* for placement once we have users — the Gran Turismo dynamic reversed).

## ADR-002: Hybrid AI feedback architecture (rule engine real-time, LLM for depth, pre-authored content)

- **Date / Status:** 2026-07-07 · **Accepted** (founder)
- **Problem:** Continuous LLM+STT+TTS commentary during driving sessions could cost more per hour than a Bulgarian student pays (risk R3), and adds latency where feedback must be instant.
- **Options considered:** (a) LLM-everything in real time; (b) fully scripted feedback; (c) hybrid: deterministic rule engine + LLM + pre-authored Q&A bank.
- **Chosen:** (c). Three layers: **(1) Rule engine** detects and scores driving events from simulation state (mirror checks, signals, speed, priority violations) — instant, consistent, zero marginal cost. **(2) Pre-authored content bank** — professionally written questions, answers, explanations, and feedback lines for every rule/sign/concept, mapped to the knowledge graph and legal citations; the AI selects and personalizes rather than inventing. **(3) LLM layer** for open dialogue, lesson debriefs, personalization, and learning-path planning — the high-value, low-frequency moments.
- **Trade-offs:** More upfront content authoring than "let the LLM handle it"; in exchange: predictable costs, no legal hallucinations, instant feedback, consistent pedagogy.
- **Risks:** Content bank coverage gaps → mitigated by logging unanswered questions and expanding the bank (pipeline in education/61).
- **Future migration:** As local/on-device models mature and cheapen, the LLM layer can expand toward more real-time dialogue without architectural change.

## ADR-003: No certificates — teach rules and skills, sell readiness

- **Date / Status:** 2026-07-07 · **Accepted** (founder)
- **Problem:** Issuing "certificates" implies legal standing the platform doesn't have, creating false expectations and liability.
- **Chosen:** The platform teaches rules, procedures, and driving fundamentals, and reports **progress and exam-readiness prediction**. No certificates of competence are issued. Achievements/badges remain as gamification (clearly non-official).
- **Trade-offs:** Weaker-sounding credential; in exchange, honest positioning and a falsifiable, marketable claim ("our ready-students pass at X%").
- **Future migration:** If simulator hours ever gain regulatory recognition in Bulgaria (hypothesis A5), official attestation can be revisited *with* the regulator — not before.

## ADR-004: Performance proxies instead of biometric/emotion sensing

- **Date / Status:** 2026-07-07 · **Proposed** (accepted in principle via analysis 56 §3.5; confirm after legal review)
- **Problem:** EU AI Act prohibits emotion-recognition in education contexts and treats exam-assessing AI as high-risk; the vision's stress/fatigue/emotion estimation of students sits in this zone; GDPR adds minor-data constraints.
- **Chosen (proposed):** Estimate cognitive load and confidence from *performance signals only* (hesitation time, error clustering, reaction times, control smoothness) — no cameras, no biometrics, no emotion classification of the student. Emotion simulation of *NPCs* (honking, gestures) is unaffected.
- **Next step:** Legal review scoped in legal/49 and legal/50 before H1 design freezes.

## ADR-005: Simulator technology stack — browser-first on Three.js + Rapier

- **Date / Status:** 2026-07-07 · **Accepted** (CTO decision per delegated authority; full evaluation in [06_TECH_STACK_EVALUATION.md](06_TECH_STACK_EVALUATION.md))
- **Problem:** Choose the engine/physics/pipeline for an educational driving sim buildable in ~110–120h by founder+AI, running on students' mid-range laptops, maintainable 10+ years.
- **Options considered:** Three.js+R3F, Babylon.js, PlayCanvas, Unity 6 Web, Godot 4 Web; desktop downloads (Unity/Godot); physics: Rapier, Jolt, Havok, cannon-es, ammo.js, custom.
- **Chosen:** **Browser delivery. Three.js (WebGPU + WebGL2 fallback) + react-three-fiber · Rapier WASM vehicle controller · hybrid OSM pipeline (OSMnx road graph → procedural meshes, hand-polished lesson intersections) · Kenney CC0 assets + one hero cockpit.**
- **Why:** MIT licensing; the largest AI-codegen corpus of any 3D stack (our velocity multiplier); native fit with the Next.js platform (one language, one repo); browser distribution preserves the "click a link, drive in 10 seconds" wedge for 17-year-olds — no SmartScreen/Gatekeeper/school-IT friction. slowroads.io and Madalin Stunt Cars prove the fidelity ceiling suffices.
- **Trade-offs:** Desktop Unity + NWH Vehicle Physics would reach prettier handling faster, but loses the distribution math; custom physics (slowroads-style) is a multi-year artisan path incompatible with collision-based lesson scoring.
- **Risks:** cockpit asset gap (~10–15h or ~$100); intersection generation is the schedule sink (cap: hand-fix ~8 lesson intersections); Rapier feel tuning (~8–10h); Kenney "toy" aesthetic (mitigate with lighting/postprocessing).
- **Future migration:** physics upgradable to Jolt WASM behind the same interface if Rapier feel disappoints. **Fallback trigger:** if by ~hour 40 the car doesn't feel credible or the city pipeline stalls → Unity 6 Web + NWH VP2 (~€55), accepting 30MB loads and iframe embedding.

## ADR-006: Scenario Studio beyond 50 templates — staged actor/physics/data-layer expansion

- **Date / Status:** 2026-07-16 · **Proposed** (CTO analysis; founder to accept/reorder the stages)
- **Problem:** The Scenario Studio ships 50 gated templates (doc 76; catalog integrity suite) and the tractable pool is exhausted: every remaining doc-72 archetype needs *new architecture*, not authoring. The founder target is ~150 hand-authored templates. The remainder clusters into four subsystems with very different cost/risk profiles.
- **Options considered:** (a) grind the remainder in one undifferentiated push; (b) stage the subsystems by unlocked-archetype-weight per effort (doc 72 §15 ranked list), each behind its own gate; (c) stop at 50 and rely on the exam bank for breadth (14,940 variants at the time; 18,396 after the H/I shells).
- **Chosen (proposed):** (b), in this order — each stage additive, each gated on the FULL suite (false-positive contract + exam-bank determinism), each followed by its author-batch:
  **(1) Large/authority actor pack** (~10 archetypes): bus (dwell/indicate/merge), box-truck profile, emergency vehicle + siren, police stop, traffic controller. New traffic actor *types* (meshes, profiles, routing) on the existing TrafficSystem/staged-kind seams; the controller and emergency yield are Наредба-38 termination items. Fictional liveries per ADR-001.
  **(2) Map data layer v2** (~12): stopping/overtaking bans, bus lanes, line types, lane-intent arrows as *district JSON data* consumed by existing detectors — one schema change, three families unlocked (SN/OV/PK). Blast radius is the world format: version the schema, keep v1 files valid.
  **(3) Rail & tram pack** (5): crossing assets (guarded/unguarded), tram actor + island stops, track adjudication. Self-contained; nothing else depends on it — Sofia realism demands it eventually.
  **(4) Phase-4 physics** (~5 + feel): friction/aquaplane/ice, crosswind, ABS/threshold braking. Already deferred by doc 65 Phase 4; highest engine risk (touches the vehicle feel every shipped template depends on) — LAST, behind a feel-regression harness.
- **Stage-4 seam (rung-level physics, 2026-07-17):** stage 4a's opt-in was authored template-WIDE (`ScenarioSpec.physics`), which made the natural L5 („дъжд + мокро сцепление") unauthorable: flipping the template flag dragged L1–L4 onto wet grip too and invalidated their dry-tuned committed ghosts (4a pins ghosts to the tuning constants). Five independent build agents hit the wall and all took the same lossy fallback — L5 rungs with render-only weather, the rain looking wet while the car stayed dry (sc-ov-crest-curve, sc-pe-night-unlit, sc-vu-cyclist-group, sc-ac-night-overdrive, sc-hz-emergency-stop, sc-hz-brake-dont-swerve). `LevelSpec.physics` closes it: the rung's flags spread over the template's PER KEY (the `conditions` precedent applied literally — a rung ADDS crosswind without clearing an inherited wetGrip, and clears one with an explicit `false`, the mergeAids falsy-drop hatch). This is an EXTENSION of 4a's opt-in, not a new decision, so it carries no ADR of its own: absent on both axes stays no-key/bit-identical (proven against the pre-change compiler across all 555 template×rung pairs), so one template can now teach the dry rung and the wet rung side by side without touching a single shipped ghost.
- **Trade-offs:** Slower than one push; in exchange, every stage lands independently green (the 50-template catalog and exam bank never regress), and the founder can stop/reorder between stages as market feedback arrives.
- **Risks:** actor-pack determinism (staged timing is the historical bug source — mitigated by the byte-identical trace gates); world-schema migration (mitigated by versioning); physics feel regressions (mitigated by the sim-harness bit-identity baselines + a manual founder drive gate per doc 71's precedent).
- **Future migration:** After stage 2, route-shell synthesis over the richer map data (doc 72 §16's "second district is worth more than any actor") multiplies the exam bank without further engine work.

## ADR-007: The second exam district (D2) — real Sofia topology, same pipeline contract

- **Date / Status:** 2026-07-17 · **Accepted in principle** (founder directive "continue with 2 and 3"; parameters delegated to the build)
- **Problem:** district-v1 (Студентски град, real OSM topology) is the only exam-capable map — the 18,396-variant bank's route-shell axis saturates on it (doc 72 §16 constraint 1: "a second district … is worth more than any actor"). The 30+ scenario micro-maps are ≤1 km strips and provably cannot host the ≥25-min/2–4.5-km exam format.
- **Options considered:** (a) parametric synthetic city (the gen_*.mjs discipline scaled up); (b) a second REAL Sofia district via the same OSM path that built district-v1.
- **Chosen:** (b) — the product's stated identity is "real Sofia street topology" (CLAUDE.md); a synthetic city would quietly break the brand promise on the highest-visibility surface. Candidate neighborhoods evaluated by network stats (regulated-junction density, roundabout presence, class variety, ~1.5×1 km bbox); the build picks the exam-richest and records the choice in the district meta (the district-v1 provenance pattern: bbox, projection, source, attribution).
- **Contract:** the same district-v1 JSON format (formatVersion untouched, zones optional); full district-battery validation (drivability, signal clusters, crossing zones, spawn/bay integrity); the map-agnostic proof suite (the полигон precedent) must pass unchanged; exam shells over D2 come as a SEPARATE follow-up slice under the doc 72 §16 distinctness + innocent-bot contracts.
- **Risks:** OSM data quality (unmapped controls → the derive-controls pass must stay conservative); scope creep (buildings/visual dressing is a SEPARATE pass — the district ships drivable-first, the doc 71 visual program follows); Overpass availability at build time (mitigated: the fetched raw snapshot is committed alongside, so the build is reproducible offline).
- **Future migration:** D3+ become data work under the same contract; route-synthesis over lane graphs (doc 72 §16) remains the long-term generator.

## ADR-008: Session revocation by epoch counter, not a session table

- **Date / Status:** 2026-08-03 · **Accepted** (audit fix; `modules/auth/reset.ts` had flagged this decision as owing an ADR)
- **Problem:** Sessions are stateless next-auth JWTs (`session: { strategy: "jwt" }`, 30-day idle, refreshed on every visit) with no `Session` table. Nothing in the product could therefore END a session. The consequence is not theoretical: the password-reset flow shipped with a header admitting it — "an attacker who is already signed in keeps that cookie until it expires". So the single most common security action a 17-year-old takes — „някой ми знае паролата, смених я" — bought them nothing at all against the person already logged in, for another month. There was also no „Изход от всички устройства", and no authenticated password change at all (/settings said the feature "is not ready yet" weeks after /forgot shipped).
- **Options considered:** (a) switch to database sessions (`PrismaAdapter` + a `Session` table): a DB read and write on every request, a table that grows with traffic, and a migration of the whole auth strategy; (b) a short JWT TTL plus refresh: shrinks the window without closing it, and signs students out mid-practice on a 40-minute exam; (c) a denylist of revoked token ids: needs a table anyway, keyed on something the token must then carry, and the table can only be pruned by guessing at expiry; (d) a monotonic **epoch counter on `User`**, stamped into the token at sign-in and compared on every request.
- **Chosen:** (d). `User.sessionEpoch Int @default(0)`. `src/auth.ts` writes it into the JWT in the `jwt` callback at sign-in and never again — a token that could refresh its own epoch could never be revoked. `modules/auth/session.ts` compares the token's epoch against the live row and returns `null` on a mismatch. Bumping the column (password reset, authenticated password change, „Изход от всички устройства") ends every session minted before that moment.
- **Why it costs nothing:** `getSessionUser()` ALREADY made a React-cached per-request DB read for `User.role` (so a forged token cannot claim admin). The epoch rides along in that same `SELECT`. Revocation therefore adds **zero queries** — which is the entire reason it is a counter on `User` and not a sessions table. `Int` rather than a timestamp: a monotonic counter has no clock skew and no equal-millisecond tie, so "token epoch ≠ user epoch ⇒ dead" is exact.
- **Trade-offs:** Revocation is all-or-nothing per account — there is no "sign out that one device". That is the honest scope of one integer, and it is what a worried student actually wants; per-device revocation needs (a) and can be adopted later without changing the token shape. An authenticated password change therefore also ends the CURRENT browser's session; the settings action signs it out and says so rather than pretending one device is special.
- **Risks:** (1) A deploy that started comparing epochs could have logged the entire userbase out at once — mitigated because tokens minted before the column existed carry no epoch and read as `0`, which is every account's default. (2) A DB failure could become a site-wide forced logout — mitigated by failing OPEN on a read error (login cannot work without the database anyway; converting a Postgres blip into a global sign-out would be a self-inflicted outage). Both are asserted in `modules/auth/__tests__/session.test.ts`.
- **Future migration:** If per-device revocation or an active-sessions screen is ever wanted, add the `Session` table under option (a); the epoch check stays valid alongside it and needs no token-format change.

## ADR-009: A practice lesson is not taken when its own mistake occurs (Founder Ruling A)

- **Date / Status:** 2026-09-17 · **Accepted** (founder Ruling A, given in chat; follow-up questions F1 and F2 answered the same day) — **implementation pending.** This ADR is written before its code, as CLAUDE.md requires: no product code implements it yet, and the lanes that will are listed under *Implementation*. Every figure below carries one of three labels. **MEASURED** means measured on the product as it stands, in the worktree at HEAD `98bf8ae`. **DERIVED** means computed by a scratch script that applies the rule proposed here to the real `compileScenario` output and catalogue — the derivation the product will do, done by hand; no product code computes any of it. **PROTOTYPE-MEASURED** means measured once on a patched scratch copy of `platform/src`; none of those figures is a property of shipped code until lane I reproduces it in the repo.
- **Planned names.** None of these exists at HEAD `98bf8ae` — a grep over `platform/src` returns 0 hits for each: `lessonMistakeTargets`, `incidentalCodeRefs`, `lessonMistakes`, `foldLessonMistakes`, `lessonMistake.ts`, `DETECTOR_OPT_IN_CODES`, `sheetRoutePassed`. Where this ADR writes them in the present tense it is describing the design, not the tree. `compileScenario`, `buildLessonResult`, `gradeFinishWire` and every `file:line` cited below do exist today. **Paths** are under `platform/src/`, and sim-module paths under `modules/sim/` — so `lessons/engine.ts` is `platform/src/modules/sim/lessons/engine.ts`, `gamification/xp.ts` is `platform/src/modules/gamification/xp.ts`.
- **Problem:** Scenario lessons grade by teach-first ([doc 65 §5](../simulation/65_SCENARIO_BASED_LEARNING_ENGINE.md), `scenarios/policy.ts`): the first occurrence of a coachable (non-опасна) code pauses, explains and costs 0 points, and `LessonResult.passed` is „official sheet passed ∧ route completed ∧ not aborted" (`lessons/engine.ts:3093`, `lessons/wire.ts:765`). A practice lesson that exists to teach one mistake is therefore **passed by a student who commits exactly that mistake once**, unless its template happens to carry one of a few hand-coded `require*Clean` gates.
  - MEASURED (in-process census of every mistake demo × authored rung, before any change): mistake demos passed **42 of 336 at L1, 37/336 at L2, 34/336 at L3 and 24/292 at L5 — 34, 32, 29 and 21 of them with ★★★.** At L1 and at L3 a code from the demo's own `codeRefs` — опасна codes included, so a wider set than the targets below — was charged or coached on 334 of 336 demos; the other 2 commit it after the lesson has already completed. Detection was not the problem; the verdict was.
  - The audit sweep shows it from the seat. `sc-vu-pass-clearance:260b13fd` (critical) photographed „0 наказателни точки … ИЗДЪРЖАН … ★★★" on a wrong leg that passed the cyclist at 59 км/ч. Five further open rows have a related shape: in each, the verdict records something other than the act the lesson teaches — `sc-follow-tailgater:63c0c28c` and `sc-signal-hesitation:440b1f7c` read „НЕИЗДЪРЖАН · 0 наказателни точки", failing only for an unfinished route; `sc-vp-telltale-red:c172d48b` and `sc-vp-police-stop:44cfeff6` convict the leg for the collision (10 т.), not the mis-triage or the ignored officer; `sc-pk-busstop-ban:105f805c` has no drive at all behind it (its only frame is a `run.log` reading „Грешен имейл или парола"), so the lesson's fail path is simply unproven. 260b13fd is the only one of the six that photographed a pass.
  - Nor was the „free" first time reliably free. A continuing breach is billed a second time 6 s or 10 s later, or at the finish; per `rules/engine.ts:1162-1166`, that second bill „exists ONLY to reach the charge the free lesson consumed". And teach is keyed on the *topic* (`scenarios/coach.ts:232`), so a lesson's mistake whose topic another code already taught is charged on sight, with no card.
- **Options considered (the ruling — the founder's):** **(A)** When the student commits the mistake the lesson exists to teach, the practice lesson is not passed, even the first time. No exam points are taken for that first occurrence, and the coach card still explains why (requirement-zero, [doc 64](../development/64_FUTURE_EXPANSION_ROADMAP.md) THEO-4). Incidental first-time mistakes keep teach-first, and exam mode is unchanged. **(B)** As A, but also charge points the first time — **rejected**. **(C)** Keep today's rule — **rejected**.
- **Approaches considered (which mistake a lesson "exists to teach" — delegated engineering):** (a) a per-template declaration: 167 hand-written literals that duplicate the demos and can drift from them; (b) withdrawing the objective tick when the mistake occurs: not idempotent across client and server; (c) concept overlap between the lesson and the code: DERIVED against the manual target judgement, it lost 59 targets; (d) `MistakeDemo.codeRefs` alone: would make the 4 side-effect codes on 3 demos into targets (DERIVED) and miss 5 lesson–code pairs — 4 distinct codes, STOPPED_WITHOUT_CAUSE appearing on two lessons — that only a detector opt-in arms; (e) **derivation at compile time from data every template already authors (chosen).**
- **Chosen (recommendation):**
  1. **Scope.** Scenario lessons only, and only their practice rungs: L1, L2, L3 and L5 (`rungExamMode` false), plus the graded retry after a THEO-3 sandbox. The `sc-ed-*` exam-*drill* templates are scenario lessons and stay in scope — four of them carry targets — even though exam-bank variants do not. Out of scope: L4 and any `examMode` rung; the THEO-3 sandbox itself, whose assignment *is* the mistake; curriculum lessons `l0`–`l8`; exam-bank variants; and the exam card. The attributions differ and are worth keeping apart: **Ruling A** holds exam mode and incidental mistakes unchanged; **founder answer F2 (decided)** puts curriculum lessons, exam-bank variants and the exam card out of scope; the sandbox exemption with its graded retry in scope is an **engineering** call from the design spec §4. None of these ever carries the field, so each keeps today's behaviour byte for byte — **apart from lane R's act-copy move (item 7), which is mode-independent and re-titles a Б1/Б2 scan fault server-side on every rung, L4, curriculum and exam-bank drives included.**
  2. **Targets.** `compileScenario` will write `LessonSpec.lessonMistakeTargets`, built as follows:
     - start from every mistake demo's `codeRefs` minus a new optional `incidentalCodeRefs`;
     - add the codes of any detector the rung arms (a `ruleConfig` key whose default is `false` and whose compiled value is `true`);
     - remove опасна and terminating codes, which are already graded on first sight (`scenarios/policy.ts:77`).

     `codeRefs` is already a validated contract — the codes „the demo trace MUST grade" (`lessons/scenario/types.ts:144-149`, `validate.ts:283-290`). The server recompiles the same list from the lesson id. DERIVED by a scratch script over the real `compileScenario` output and catalogue (the derivation code itself does not exist — see risk 7):
     - **105 of 167 templates carry targets; 62 are empty;**
     - **38 distinct codes;**
     - at most 4 codes per rung (cap 8);
     - 0 of 162 exam rungs **would** carry the field;
     - **3 content markers** (4 codes on 3 demos), each placed only where the template's own source says the code is a side effect.
  3. **First occurrence.** A lesson's mistake is always taught under its own code — a card and 0 points — even when another code has already taught its topic. Its continuing-breach re-bill is dropped. All 38 codes resolve to `teach-first-then-grade`, and none to `always-grade` or `learn-only`, so „always taught" holds for every target.
  4. **Repeats — founder answer F1, decided.** A genuine repeat — a new episode after the card — costs points **exactly as today**, on the ×1.5 / ×2.0 training ladder. PROTOTYPE-MEASURED: 43 practice drives on 11 demos contain one.
  5. **The verdict.** One pure fold, `foldLessonMistakes(lesson, events, coachedMistakes)`, will run on the client in `buildLessonResult` and on the server in `gradeFinishWire` — the only two places `passed` is computed. Any target code on either record sets `passed` to false and fills `LessonResult.lessonMistakes`.
  6. **What the student sees** (THEO-4: before, during and after the drive):
     - *Before the drive:* one briefing line naming the mistakes that cost the lesson — **subject to F3.** If it cannot fit the phone briefing without cutting authored steps, the line waits for the founder's answer; the teach card and the reason block carry the rule meanwhile.
     - *At the mistake:* a teach card saying the lesson will not count. The session's first such card is never downgraded to a toast by the pause rate limit.
     - *After the drive:*
       - a fourth **session-end** verdict, **„Не е взет"** — and it is the third of four in precedence, not an override: a passed drive still reads „Издържан", a **failed official sheet still reads „Неиздържан"**, an aborted run „Незавършен", and the reason block renders in every one of those. PROTOTYPE-MEASURED at L1: of 171 drives carrying a hit, 146 read „Не е взет" and 25 keep „Неиздържан" (141 / 120 / 21 at L5);
       - a reason block built only from catalogue text — title, explanation, corrective and `lawRef` (retrieval only, ADR-002);
       - stars capped at 1, because „взето" means ≥ 2★ (`lessons/scenario/progress.ts:188`, `:333`);
       - a debrief branch with a theory chip for the mistake's concept;
       - praise riders that stop calling the drive clean;
       - a history row that reads „Не е взет" and names the cause.
     - *Self-calibration* keeps measuring **exam** self-reading. It stores and reads the sheet-and-route verdict from before this ADR (`sheetRoutePassed`); the calibration gate explains the lesson status on a separate line.
  7. **Act copy.** The Б1/Б2 junction-scan titles and the snow-lights title move out of `makeViolation` calls that override the copy without a `detail`, into the detail-keyed per-act table. Client and server then title a hit identically. This is the one part of the change that is not gated on a target, so it applies on every rung.
- **Why:** „взето" must certify that the act the lesson teaches did not happen. That is the north-star test, applied to the verdict rather than to the detector. Deriving targets from the demos, instead of declaring them, keeps the rule tied to what each lesson already demonstrates. One fold on both sides keeps client and server from disagreeing about a pass.
- **Advantages:**
  - No per-lesson authoring beyond the 3 markers.
  - One applicability function and one fold.
  - One kill switch: delete the single `compile.ts` spread and every reader sees an absent field — today's behaviour, byte for byte, apart from the three changes that do not depend on targets: the act-copy move (item 7), the corrected `charged` pause-card sentence, and the `sheetRoutePassed` column. Each stands on its own.
  - Drives with no hit are unchanged. PROTOTYPE-MEASURED over 2,434 drives with 0 errors: **488/488 L4 drives and 808/808 correct-demo drives are identical** on `passed`, stars, points, fault codes and coached codes, and practice drives with no hit show 0 drift. (That comparison covers those fields, not the act-copy titles of item 7.)
  - Mistake demos still passing at L1/L2/L3/L5 fall **from 42/37/34/24 to 2/2/2/2** (PROTOTYPE-MEASURED). The remaining 2 are the content rows under risk 4.
- **Disadvantages and trade-offs:**
  - **Practice and exam now disagree about the same drive, by ruling.** `sc-vu-pass-clearance/mistake-squeeze` reads „Не е взет", 0 т., 1★ at L3 (PROTOTYPE-MEASURED), and ИЗДЪРЖАН, 3 т., 2★ at L4 (MEASURED, unchanged).
  - **Fewer sheet points in practice.** PROTOTYPE-MEASURED: **147 of 1,946 practice drives lose 231 points in total, and none gains.** 135 of those drives lose a re-bill and 12 lose a first-time charge now covered by own-code teach. The sheet verdict flips on 4 drives: `sc-ln-turn-lane-arrows/mistake-late-two-lanes` at L1/L2/L3/L5 goes from 9 т. „Неиздържан" to 6 т. „Не е взет". The lesson refusal replaces those points.
  - **A refusal costs what any unpassed verdict costs:** the 60 XP pass bonus (`modules/gamification/xp.ts:36`), the 50 XP first-pass bonus when it would have been the first pass (`:38`), and the „Следващо ниво" step (`lessons/scenario/nextStep.ts:147-165`).
  - **One teach pause per session skips the rate limit.** PROTOTYPE-MEASURED: 661 lesson-mistake cards on 654 drives with a hit; 7 drives show two.
  - **Stand-in detectors now cost a pass:** DERIVED, 32 code–lesson pairs in 28 lessons, where a catalogue code stands in for the demonstrated act (e.g. HARSH_BRAKING_NO_CAUSE for a panic stop).
  - **The live objective ribbon can still tick „ЗАДАЧА 2/2"** on a drive that ends „Не е взет". Only the end screen explains.
  - **Б1 and Б2 scan faults stop counting as repeats of each other** on the *training* ladder, because the copy move puts the act on `detail`. Official points are unaffected.
- **Technical risks:**
  1. **Stand-in false positives.** A detector's tolerance now costs a pass. The most exposed codes are DERIVED: HARSH_BRAKING_NO_CAUSE (13 lessons), POOR_LANE_KEEPING (11) and SPEEDING_OVER_LIMIT (11); `sc-follow-tailgater:f42dce4f` is a known instability. For a **demo-sourced** target the remedy is one `incidentalCodeRefs` line. A **detector-sourced** target has none: `incidentalCodeRefs` is by contract a subset of a demo's `codeRefs`, and the 5 detector-sourced targets (DERIVED — `sc-follow-standstill` CLOSING_ON_LEAD_TOO_FAST, `sc-follow-tailgater` and `sc-jx-priority-confidence` STOPPED_WITHOUT_CAUSE, `sc-ed-poligon-chain` MOVE_OFF_WITHOUT_OBSERVATION, `sc-fo-motorway-gap` FOLLOWING_TOO_CLOSE_FOR_RAIN) appear on no demo. Removing one means disarming the detector, which changes grading, or a per-lesson exclusion that nobody has designed — **lane B owes that design.** The full target table will be pinned as a fixture either way, so a new co-fault cannot silently become a target.
  2. **Trust.** The server never re-runs the rules: it re-titles what the client reports (`lessons/wire.ts:598`, `rebuildRuleEvents`). A modified client that leaves a target out of either list reproduces the old pass. This is the same trust level as the client-claimed objective flags. Mutation tests M4a and M4b will pin it; they do not close it.
  3. **Stale tabs across the deploy.** An old client can show ИЗДЪРЖАН while the server stores the lesson as not taken. The mismatch is transient.
  4. **Two mistake demos end before their taught hazard:** `sc-follow-standstill/mistake-creep-up` (done at 67.0 s, offence at 73.6 s) and `sc-park-perp-forward/mistake-blind-exit`. `applyTick` stops once the lesson is completed (`lessons/engine.ts:1405-1407`), so neither can be refused. They are the 2 demos still passing at each rung. Only the first is a risk of this derivation: `mistake-blind-exit` cites COLLISION alone, so its lesson has no targets in any case. Both are content rows, kept on an allowlist that may only shrink.
  5. **The audit sweep will move.** About 10 of 44 right legs that pass today (w45–w47) carry a target title on their debrief and would read „Не е взет" — text-matched on the debrief text, with per-row attribution unverified, and 5 of the 10 legs did not drive. The pill parsers and the judge brief (lanes H and G) must land before the next sweep is judged.
  6. **Concurrent edits (a precondition, not a permanent risk — true as of 2026-09-17 on branch `scenario-engine`).** A parallel workflow held uncommitted edits to `components/sim/LessonScene.tsx`, `components/sim/lesson-ui/LessonPlayShell.tsx`, `modules/sim/hud/HudToasts.tsx`, `modules/sim/lessons/advisor.ts`, `modules/sim/lessons/types.ts` and `tools/mobile/lesson-audit.mjs`, plus their tests. Every code lane waits for those edits to land, and lane G, whose files they touch, goes last. This row expires the moment they are committed; check `git status` rather than trusting it.
  7. **Not yet verified at all:**
     - whether the harness's wrong legs actually commit their target codes;
     - how every new string renders, and whether it fits a phone;
     - which existing tests break;
     - whether the prototype run is deterministic (it ran once);
     - the debrief, result screens, wire, persistence and calibration, none of which the prototype patched or exercised;
     - the derivation code itself — the prototype injected its targets rather than deriving them, which is why every target figure above is DERIVED and not MEASURED.
- **Scalability:**
  - A new template gets its targets from fields it must already author. The next template needs no ADR-009 work unless one of its demo codes is a side effect.
  - A new detector opt-in joins through one table (`DETECTOR_OPT_IN_CODES`). A test will fail on any unclassified `ruleConfig` key, and another on any target that stops resolving to `teach-first-then-grade` („Ruling A cannot hold for this code").
  - The rule is catalogue-titled data, not per-lesson code, so it carries over unchanged to new districts, families and locales.
  - Runtime cost is one pure fold per finish, on each side.
- **Five feature questions:**
  1. *Does it improve learning outcomes?* Yes. „взето" now certifies that the taught act did not happen, and every refusal is explained at the mistake and after the drive, and before it once F3 is settled (THEO-4).
  2. *Does it create safer drivers?* Yes. A scripted wrong drive that squeezes past a cyclist (`sc-vu-pass-clearance/mistake-squeeze`) stops earning a ★★★ practice pass (PROTOTYPE-MEASURED). Before (MEASURED): 34/32/29/21 mistake demos passed with ★★★ at L1/L2/L3/L5. After (PROTOTYPE-MEASURED): 2 at each rung. Whether the 59 км/ч audit leg in *Problem* also stops depends on its own inputs firing the detector, which is not verified (risk 7).
  3. *Does it improve retention?* **This is the risk.**
     - „Не е взет" and 1★ results become more common. PROTOTYPE-MEASURED: 146 of 336 mistake demos per rung read „Не е взет" at L1–L3 (120 of 292 at L5) — but of those 146, only **40 were passes before** (35 at L2, 32 at L3, 22 at L5; 129 lost passes in total across the four rungs). The rest had already failed or were unfinished and only change their pill. Stand-in detectors can also refuse a driver whose intent was right.
     - Mitigations:
       - rungs still unlock by attempt, not by grade (`lessons/scenario/progress.ts:304-313`; „отваря се независимо от оценката", `:207`);
       - „Продължи напред" stays (`hud/sessionEndCtas.ts:63`);
       - the 40 XP for finishing stays (`modules/gamification/xp.ts:34`);
       - the rule is stated before the drive once F3 is settled, and at the mistake and after it in every case;
       - one content line fixes a wrong **demo-sourced** target; a detector-sourced one needs risk 1's unbuilt mechanism.
     - **No real-student measurement exists.** Once this ships, monitor the not-taken rate per lesson.
  4. *Does it create measurable progress?* Yes. A practice pass becomes a stronger signal, the history row names the cause of a refusal, and calibration stays an exam-reading instrument.
  5. *Does it create business value?* It gives parents and schools a practice pass they can trust, traded against the retention risk in (3). Not quantified.
- **Consequences deliberately not taken (follow-ups).** Each is a learning-model or display decision that Ruling A does not imply:
  1. The learner model (`recordSimObservations`, `app/(dashboard)/simulator/actions.ts:417-437`) still reads only charged events and commendations, so a coached target is not negative evidence. This is the recommender half of [doc 87](../simulation/87_FOUNDER_ITEM_REGISTER.md) still-open row 6 (row 21 in the list it supersedes), and it stays open.
  2. The my-drive reel and „Карта на грешките" still mark charged events only.
  3. CLEAN_DRIVING XP is still booked off the event.
- **Migration:** Stored session rows are not regraded. Calibration reads `sheetRoutePassed` when present and `passed` otherwise; rows from before ADR-009 carry no such field, and their `passed` is that same verdict. Rollback is the compile spread — but it restores grading for **new drives only**: rows already stored as not taken keep `passed: false` and 1★, their withheld XP is not retro-granted, and `sheetRoutePassed` keeps being written and read.
- **Implementation (pending).** The lanes come from the design spec §7. Each claims its GitHub Issue first and runs the full [doc-61](../development/61_TWO_DEV_COLLABORATION.md) gate, with `vitest` on **one** worker — a worker count the design spec §7 adds, not doc 61, because two workers starve the source-scanning suites:
  - **0 — docs:** this ADR plus its amendments to doc 65 §5, doc 76 §2/§5/§6/§7/§8/§9, doc 64 THEO-3, doc 68 A12, doc 87 rows 6 and 21, and the Product Map. Lands first.
  - **R — rules act copy**, plus the FP battery and the exam-bank bot.
  - **A — contracts** and the pure `lessons/lessonMistake.ts`.
  - **B — `incidentalCodeRefs`**, the detector opt-in table, the derivation, a committed target fixture, and risk 1's detector-target exclusion mechanism.
  - **C — engine, coach and wire.**
  - **D — debrief.**
  - **E — result screen, stars and teach card.**
  - **F — persistence, history and calibration.**
  - **H — harness and judges** (early).
  - **P — phone-fit rig.**
  - **G — shell and mobile harness** (last, after the other workflow lands).
  - **I — integration and the acceptance census.** The census must reproduce every PROTOTYPE-MEASURED figure above exactly before any of them is quoted as shipped behaviour.
- **Evidence — and a deadline, because it is not in the repo.** The design spec and its measurements live in a **session scratchpad that is machine-local and deleted with the session**: `C:\Users\Ljh\AppData\Local\Temp\claude\E--AI-driver\f298781e-d6a0-4f00-bf01-d57edab47428\scratchpad\teachfirst\`.
  - `SPEC.md` — the design spec. It holds every Bulgarian string, the test plan (T0–T16, M1–M14), the acceptance census and the lane file-ownership table. **Lanes A–I are not buildable from this ADR alone.**
  - `targets-final.json` — the target table;
  - `census-baseline.json` + `census-L25.json` — the pre-change census, 2,434 drives;
  - `rev/analyse-rev.json` — the prototype comparison.

  **Owner and deadline: lane 0 or lane B must commit the design spec into `docs/simulation/` as its own numbered doc before the scratchpad is lost — before any other lane starts.** Lane B's target fixture and the census instrument from lanes H and I bring the measurements in; they do not bring in the design.
- **Founder questions:** F1 and F2 are **decided** (above). **F3 is the only open question, and it is conditional:** it is asked only if the pre-drive rule line cannot fit the phone briefing without cutting authored steps (commit `4209dad` already trimmed briefings for fit). If it is asked, the options are the rung card in the catalogue, the first teach card only, or a shortened briefing step, and the line does not ship until it is answered. Meanwhile the teach card and the reason block still carry the rule.
- **Future migration:**
  - detectors that measure the demonstrated act directly, replacing stand-ins — and behind them the detector backlog, DERIVED: **164 demos in 100 lessons cite only опасна codes**, 125 of them in the 62 lessons with no targets at all and 39 in 38 lessons that do have targets from another demo;
  - finish zones placed after the taught hazard, for the two content rows;
  - content review for the 7 lessons whose objective title names a code that no demo grades (DERIVED);
  - the three follow-ups above.

  Bringing curriculum lessons into scope would need its own ADR amendment, because F2 keeps them out.

## ADR-010: Par time gates the STARS, never the verdict (Founder ruling, 2026-09-21)

**Status:** accepted 2026-09-21. Supersedes the "full stars from cleanliness" contract for the
unmeasured case only.

**The question, as registered.** Decision 21 of `docs/development/92_FOUNDER_DECISIONS.md`: *"May a
drive that takes 3.2× the reference time still be ИЗДЪРЖАН with three stars?"* Options were: leave it
and let Наредба 38's own pass test govern (A); author a quality component that can move stars without
inventing an offence (B); or let par gate the stars but never the verdict (C).

**The ruling: C.** The verdict stays exactly what the regulation makes it — a lawful drive is
ИЗДЪРЖАН however slow it was, and no offence is invented that Наредба 38 does not contain. What a
far-over-par drive may not do is collect FULL MARKS for the manoeuvre.

**Why this needed an ADR and not a one-file edit.** `scenario/rubric.ts` folds stars from measured
components; when `measuredCount === 0` it returns 3★. That is not an oversight — the file says so:
*"«Full stars from cleanliness» is a stated contract… ~141 assertions across the bot-completion
suites encode it, 72 of them in tests NAMED «earns full stars from cleanliness»."* And
`parTimeSec`-only rubrics are the majority (128 of 162 shipped), so `measuredCount` is 0 on most
lessons. The consequence is recorded in the same file and in the audit corpus: **every ИЗДЪРЖАН lane
printed "3 от 3 звезди"**, including `sc-pk-move-off/pc-wrong` — the lane the harness drives WRONG on
purpose, with a speeding card on the glass at 59 км/ч in a 50 zone and three filled gold stars beside
it. Changing what the star scale means is a strategy change, and CLAUDE.md requires an ADR first.

**What changes.** Par time becomes a scoring component when it is the only thing authored, so a drive
far over the guideline cannot print 3★. It contributes to STARS only.

**What does not change, and these are the guardrails:**
- **The verdict never moves.** ИЗДЪРЖАН / НЕИЗДЪРЖАН / НЕ Е ВЗЕТ stay derived from the изпитен лист
  alone. Par time may not add a наказателна точка, a fault code, or a `lawRef`.
- **No invented offence.** Наредба 38 has no pace fault; this creates none.
- **Faster is still not better.** `PAR_TIME_NOT_A_TARGET_BG` stands: beating the guideline adds
  nothing. The term is one-sided — it can only withhold, never reward.
- **Unfinished and aborted drives keep their existing branches** (`PAR_TIME_ABORTED_BG`,
  `PAR_TIME_UNFINISHED_BG`): a drive that did not reach the end is not compared to a whole-lesson
  guideline, which is a defect this file already repaired once.
- **THEO-4.** A withheld star must be explained on the card in the lesson's own voice — a bare star
  count is exactly what requirement-zero forbids.

**Migration.** Stored sessions are not re-scored. The bot-completion suites that assert 3★ on drives
INSIDE par are unaffected by construction; those asserting 3★ on a far-over-par drive are asserting
the behaviour this ADR retires and must be re-derived against it, not relaxed.

**Rows it bears on:** `sc-vu-emergency:9e72c8bd` ("the crawling drive still collects ИЗДЪРЖАН"),
`sc-vu-emergency-junction:853790f7`, `sc-rb-busy-gap:8f50287b` — none of which retire until a sweep
photographs the new behaviour.
