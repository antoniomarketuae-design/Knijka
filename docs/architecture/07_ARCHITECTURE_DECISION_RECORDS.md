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

- **Date / Status:** 2026-09-17 · **Accepted** (founder Ruling A, given in chat; follow-up questions F1 and F2 answered the same day) — **implemented: landed 2026-09-18 in `793335e`** (lane B in `6344092`). The rest of this paragraph is kept as written on 2026-09-17. This ADR is written before its code, as CLAUDE.md requires: no product code implements it yet, and the lanes that will are listed under *Implementation*. Every figure below carries one of three labels. **MEASURED** means measured on the product as it stands, in the worktree at HEAD `98bf8ae`. **DERIVED** means computed by a scratch script that applies the rule proposed here to the real `compileScenario` output and catalogue — the derivation the product will do, done by hand; no product code computes any of it. **PROTOTYPE-MEASURED** means measured once on a patched scratch copy of `platform/src`; none of those figures is a property of shipped code until lane I reproduces it in the repo.
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

## ADR-011: A roundabout entry is judged by what happened at the mouth (Founder ruling, 2026-10-05)

**Status.** Accepted. Founder ruling 2026-10-05 «Bill forced braking»; built over five adversarially verified rounds
(lane `rbgap`, rounds 3–5), landed with the commit that carries this entry.

**Context.** «Влизане без пропускане» (FAILED_TO_YIELD, опасна) at a roundabout was decided by PREDICTION: a car within
26 m, an arrival gap, an approach-speed mode. Verifiers convicted careful drivers who forced nobody to slow and acquitted
drivers who made a circulating car brake. The founder ruled that the offence is what actually happened: a circulating car
with priority had to brake or swerve because of the entry, or there was contact.

**Decision.**
- **The priority set.** At the frame the student's nose first comes onto the ring carriageway, every circulating car that has
  not yet passed his entry point (his MOUTH) belongs to that entry. While he still occupies the mouth the set stays OPEN:
  a car that comes into the approaching half-lap joins it. Once he has left the mouth it takes no new member. A car «has
  passed» the mouth when its REAR END is beyond it; the student «has left» it when his centre is beyond it by more than half
  his length along his own circle. Geometry of each frame — no distance, gap or speed filter.
- **The conviction.** FAILED_TO_YIELD fires when a member of the set loses at least 0.3 m/s BECAUSE OF THE STUDENT before it
  has cleared the mouth (read from the car's own traffic model; 0.3 m/s is the staged brake-lamp margin; the measured noise
  floor is 0), moving or standing — or when he touches a member before it has cleared. A car he let pass is never a member.
- **The praise.** YIELDED_TO_PRIORITY and the instructor's «Интервалът беше добър» need that no member lost ANY speed to him
  and none was touched.
- **Two measurement-only fields on SimTick** — `roundaboutEntryOpen` and `roundaboutEntryPaidFor`. They are additive, read
  only by the instructor's voice through `lessons/engine.ts`, and a source census test pins that nothing graded reads them
  (the same pattern as `edgeAlignment`, 2026-09-20).

**Consequences.** A walking-pace creep (≈2 км/ч and under) that holds the mouth until the next car round has to brake is
billed — by the letter of the ruling (integrator-ratified, owed to the founder as a read). Crawling or stopping on the ring
AFTER the car has cleared the mouth is billed by nothing here. The barge demos were re-staged and re-recorded so their
offence is real; clip `sc-roundabout-entry__m0` must be re-captured. Owed to the founder as reads: the 0.3 m/s size, and the
voice line said shortly before a later cost.

## ADR-012: A crosswind steers the front wheels — the «yaw pull» (Founder ruling, 2026-10-05 «Ship the pull»)

**Status.** Accepted. Founder rulings 2026-10-04 «Stronger wind» and 2026-10-05 «Ship the pull»; lane `crosswind`, rounds 1–3, each
adversarially verified; landed with the commit that carries this entry.

**Context.** The crosswind lessons teach «лека, ПОСТОЯННА корекция», but the side force enters the vehicle at the centre of mass and the raycast
tyre cancels sideways velocity every step, so holding the lane asked for 0.054 % of steering at the shipped 1,200 N — no correction a student can
see or feel. Measured: 0.54 % at 12 kN (1 g), 0.63 % at 14 kN, the car lost at 16 kN. The founder's «stronger wind» could not be built by force.

**Decision.** A second wind channel steers the front wheels: `pull = F_lateral · min(K, L / (m·(v² + v_s²)))`, K = 1.46e-5 rad/N
(`CROSSWIND_STEER_PULL_RAD_PER_N`, «a teaching exaggeration» of a real compact's compliance), v_s = 6.8 m/s. The driver's wheel is untouched;
the steered pair gets steer + pull. Holding the lane needs 3.5 % of the wheel at the taught 34 км/ч and 3.1 % at the 40 км/ч ceiling; the hands-off
displacement rises strictly with speed from 8 to 110 км/ч and the hands-off path acceleration never exceeds the wind's own F/m. Keyboard driving
is included (the founder declined «analog only»).

**Supporting decisions.** One shared wind mapping for LessonScene, VehicleRig and the test harness; the cockpit lean read through
`cockpitLeanFromSim` on the road wheels, so a lane-holder still feels the wind; the recorder writes the held correction into the correct demos'
wheel channel (`heldWheel`); the second-swing cue reads the student's hand.

**Consequences.** Hands-off is now OFF_CARRIAGEWAY on every rung of both wind lessons; the audit harness's right legs must hold a correction.
Owed: the founder's own drive on keyboard and phone; the truck-pass lesson's staging (row `sc-ac-wind-truck-pass:ff1d4290`).

## ADR-013: The U-turn act is decided from the car's heading and the road

**Status.** Accepted. Lane `uturn`, rounds 1–6, each adversarially verified; landed with the commit that carries this entry.

**Decision.** In the armed lesson (`solidCrossUTurnEnabled`) a billed crossing of a SOLID centre line is named «Обратен завой през непрекъсната
осева линия» if and only if a turn-round — one continuous yaw excursion that takes the nose from within 45° of one road direction to within 45° of
the other, judged from the heading against the road alone — completed at or after that crossing on the same excursion, and the axis is solid
where the turn-round BEGAN. A turn-round made over the dashes never names or renames anything. The tracker follows the road, not the edge,
and the car's travel direction is read from its heading. One act, one bill, until the swing ends; a car then across the solid axis from the half
of its new direction is a new crossing. The crossing reason never says «насрещната половина» for a half that runs the car's own way.

**A new member on SimTick.edgeAlignment.** `axisClearM` — how far the car's body is from the road axis (≥ 0 = wholly on one bank, < 0 =
astride). Published on every two-way edge frame, read only under `solidCrossUTurnEnabled`; it decides «изцяло» versus «Застъпи…» on the bill.
This extends the 2026-09-20 ruling that published the signed direction signal.

## ADR-014: The world and the grade run on one fixed 1/60 s grid, counted off the physics engine's steps

**Status.** Accepted by the integrator, 2026-10-09. Lane `rbcad`, rounds 1–8 (row `sc-roundabout-entry:7b747c15`). Rounds 1–7 were each adversarially
verified and refuted; round 8 was SIGNED OFF WITH CONDITIONS. Landed with the commit that carries this entry. Not a founder ruling: no rule, no threshold
and no sentence's wording changes. It decides WHEN the existing rules are evaluated, and from which pose. Before landing it was driven once through the drive rig, headless, on PC and on the phone lens (Consequences); never on a real phone or a 120/144 Hz display.

**Context.** One drive got two grades depending on the frame cadence. At `2127d8f` a line stop held 45 s passed at 0 points on 60 Hz, 30 Hz and a steady
0.5 s, and was convicted of a COLLISION (10 pts) on a phone's frame lengths. Everything that decides a lesson ran once per render frame, and paired whatever
the frame end was with whatever the world was then. Seven rounds each fixed one layer and were refuted on the next. The lesson: any graded link on the render
clock, any second clock beside the engine's, any graded or shown number measured from a pose the grid did not choose, and any one-place buffer between a
frame and the grid is a platform split.

**Decision.**
- **One grid, one clock.** Grid point k is session time k·FIXED_DT (1/60 s, the vehicle physics step), with k an integer, never a running float sum. Point 0
  is the origin and is never graded; point k ≥ 1 is the state after rapier's k-th step. Every frame, the first one included, brings exactly the points whose
  steps rapier took in it: `GradeGrid.stepPhysics` counts them off the step record that VehicleRig's after-step callback writes
  (`recordPhysicsStep(recorder, body, sim)` in `traffic/playerTrack.ts`). Nothing is derived from the session time. The session clock shares the origin;
  it positions what is drawn and stamps what is booked per frame.
- **The graded chain runs once per grid point** (`scene/gradeGrid.ts`), in its old order: signals, traffic (staged and ambient), the near-miss count,
  physics contacts (in the replay harness, its stand-in for rapier's; live, rapier's contacts are frame-timed, below), lead gap, the person-in-path
  distance, `runtime.sample`, the scenario director (runners, staged triggers, the contact sentinel), then the lesson engine. Every interval is
  (k − kPrev)·FIXED_DT. The car's position, heading and speed at point k are the recorded state after step k, written by the grid itself, and the grid
  measures the lead gap, the person-in-path distance and the near-miss count from that state. The scene's hook supplies only the cabin's discrete channels
  and the pedals.
- **Looks are a FIFO, heard one per grid point.** The cabin latches a mirror or shoulder look on the press (`GlanceSampleQueue`, four deep). Each frame the
  sample builder takes one look, and the grid then takes every look the cabin still holds through the `moreLooks` hook. The grid hears them one per point,
  oldest first, and writes each point's look itself, so its queue is the only way a look reaches a tick. THE RULE: a look is heard at the first grid point
  graded at or after the frame that sampled it, plus one point for every look still ahead of it. The queue holds 8 looks. A look that finds it full is
  dropped and counted (`droppedLooks`). A look still waiting when the session ends is not graded; `pendingLooks` counts it.
- **The attempt trace is fed on the grid.** `feedAttemptPoint` (`scene/attemptFeed.ts`) runs once per graded point, after that point's tick. It writes the
  point's time, the student's state there and the look that point heard, so the rubric's observation moments are scored from the graded looks.
- **A respawn drops only what was pending.** `resetCar` (key R, «Рестарт») also empties the cabin's latched looks and calls `GradeGrid.reset()`, which
  drops the waiting looks and every open near-miss window. The session clock, the grid index, the grade's step memory and the near-miss total run on.
  «Повтори» remounts the scene (`<SceneSlot key={sceneEpoch}`, LessonPlayShell), so a new attempt gets a new grid.
- **Stated as frame-timed.** The cabin's discrete channels and the pedals (every point in a frame sees the frame's value), the performed pre-drive steps,
  the moment a look is SAMPLED, and rapier's physical contacts, reported once per frame (contact with staged actors is the sentinel's, on the grid). A
  checklist step, a manual finish and an abort are stamped at the click. The trace's `driveline` events, «втори замах» annotation, steering angle and pedal
  flags are the frame's; no score reads them. What the student sees while driving stays on the frame.

**Alternatives rejected.** (1) Interpolate each trigger's crossing in a frame: a solver per trigger kind, and the detectors are not triggers. (2) Sub-step
only the staged world (rounds 1–2): refuted twice. (3) Fixed-step world, frame-end grade (round 3): the student-to-world phase became a platform signal.
(4) Frame-end grade against an interpolated world: timers and crossings still see one sample per frame. (5) Cap the frame length: a grading defect becomes
an availability defect. (6) Grid index from session time plus an offset onto rapier's steps (round 4): it repeats or skips a car state. (7) Start the world
one step in: after a long first frame it lags the car all drive. (8) A scene hook for the person-in-path distance, pinned by text (round 5): a text pin does
not stop it reading the frame's pose. (9) Clock origin from a remainder threshold: no threshold tells an uncounted step from float noise. (10) The
after-step read in VehicleRig's closure, pinned by text (rounds 5–6): rigs that read the frame's sample passed every test. (11) Near-miss count on the
render frame: it is shown to the student. (12) A float-sum time label to copy base: it copies base's rounding defect. (13) One held look (rounds 4–7): the
second of two frames between points erased the first one's look. (14) A grid queue with the cabin drained one look per frame: inside long frames a second
look came up to 58 points (0.97 s) LATER than at 60 Hz. (15) Stamp each look with its press time: the other controls a frame samples act from its first
step, and the wall-clock mapping cannot be verified without a browser. (16) The attempt trace on the render frame: its observation moments are shown.

**Boundaries.** `scene/gradeGrid.ts` owns the order of the graded chain, the car's pose at a grid point, every measurement from that pose
(`scene/nearMissMeter.ts` is its near-miss count), the queue of looks and which point hears each. `traffic/playerTrack.ts` owns the step record and the one
function that writes it; VehicleRig calls it after every step and does nothing else there. `scene/cabin.ts` owns the latch: only the sample builder
(`scene/vehicleSample.ts`) and the `moreLooks` hook drain it, and `forgetPendingGlances` empties it on a respawn. `scene/attemptFeed.ts` is the one feed of
the trace's samples, looks and indicator edges. LessonScene owns the grid's lifetime and resets it in `resetCar`; it never calls `runtime.sample` or
`stepFrame`, and its grid call reads no pose, heading or speed of the frame. NpcColliders owns rapier's collider pool only. The replay harness
(`liveChainReplay`) runs the same `GradeGrid`, the cabin's queue class, the `moreLooks` path and `feedAttemptPoint`.

**Consequences.**
- **Reproduced by the verifier,** each cadence against its own 60 Hz run: 0 sheet splits and 0 shown differences on 1,531 staged cells × 10 cadences
  (ambient on) and × 7 (ambient off), 903 cells without staged traffic × 6, and all 2,434 cells with every look moved 7 ms off the grid × 9; one sheet per
  cell for two looks pressed together or on consecutive frames (437 cells × 9 each). Through the product glance path every look was heard once, in order,
  never later than at 60 Hz, on every cadence the verifier drove. On the real fiber and rapier libraries headless (28 scenarios: 60–165 Hz, VRR, a phone's
  cadence, 0.5 s frames, stalls, respawns, 240 Hz) no press was lost, repeated or reordered; the two exceptions are by design (at 240 Hz with up to 11 keys
  inside two steps one look was dropped and counted; looks pending at a respawn were not heard after it). On its 45 roundabout tapes × L1–L5 × 17 cadences:
  0 sheet splits; the 45 s line stop is «yielded», 0 points, on all 17. Of its 87 mutants 86 die on assertion text; the survivor is condition C-RESETPREVK, which the landing commit's respawn pin kills (below).
- **D1 — the broader `moreLooks` design is accepted.** A frame hands the grid every look the cabin holds; inside frames longer than a step a look is never
  heard later than at 60 Hz (reproduced). The cost: on a display slower than 60 Hz two looks in one frame are heard one step apart, where base heard them a
  frame apart. The bound holds as stated: at 240 Hz, with up to 11 keys inside two steps, one look was dropped and counted.
- **D2 — the 60 Hz differences from base are accepted.** At 60 Hz the sheet is base's on all 2,434 cells. What is shown differs on round 7's eight cells
  (four sc-fo-brakelight-chain mistake-late-brake rungs show one more coached row; four sc-crossing-child-ball mistake-collision rungs stamp their near miss
  one step earlier) and on 20 cells whose rubric time line prints a whole second different (stars and points equal). Base re-run with an exact clock
  (t = frame/60, one line changed) matched the tree on every measure over all 2,434 cells, so every one of these is base's float-sum clock (R-BASE60).
- **D3 — the knife edge.** One sheet per tape is shown for the committed demos and the census tapes, and no wider. WHEN a look is sampled stays the frame's
  decision, so a look pressed within one step (fast display) or one frame (frames longer than a step) of a rule's decision edge can still get a different
  sheet on a different display, pass/fail included, as on base. The verifier's scans: 565 of 1,573 shifted-look rows split on at least one cadence (555 only
  on a phone's cadence, 0.5 s or 0.25/0.4 s); in 1 ms steps across three fast-display edges, 130 of 410 rows split on 144, 90, 165, 100 or 75 Hz, VRR or
  60 Hz ±1 ms (never at 120 or 240 Hz). Base splits on the same tapes.
- **D4 — observation moments, as a class.** A moment scored from a look heard close to an edge of the window it is scored in (the windows sit around the
  reverse phase, read from the trace's gear) may differ by display, wherever a look can be heard earlier than at 60 Hz: one point on a display faster than
  60 Hz or a jittery 60 Hz, up to a frame inside long frames. The verifier saw it beyond the census pin's five cells, with shifted or paired presses, at 144,
  90 and 75 Hz, VRR and 60 Hz ±1 ms. Stars were equal everywhere. The census pin's named cells are examples, not the boundary.
- **D5 — the look-timing bound is measured from the press.** Inside a clamped 0.5 s frame a look can be heard up to 29 grid points before the press; on a
  fast display, one point before. Against its own 60 Hz point it can come a whole frame early (30 points measured on a phone's cadence with presses 7 ms
  off the grid; the sheet did not change). It is never heard later than at 60 Hz. The census pin states the bound from the press with the span of the
  frame that TOOK the look (`heardTooEarly` in `grade-grid-cadence.census.test.ts`), and a teeth test goes red if a press made after a long frame ended
  is handed to that frame (the integration skeptic's mutant P2, reproduced red by the integrator).
- **No budget is claimed as held.** Round 8 adds one queue read and the attempt feed's call per grid point; the builder timed the feed alone at 79–106 ns
  per point on a shared machine and did not re-run the whole-chain bench.
- **Pins added at landing.** C-RESETPREVK: `live-grade-call.execution.test.ts` §5 drives a respawn through the scene's own `stepPhysics` and
  `resetCar` on 60 Hz, 120 Hz, 0.5 s and a phone's cadence and checks that the first point after key R gets dt = 1/60 and that the signals and the
  staged world match the same drive with no respawn; the mutant fails on «Expected … 0.016666666666666666, Received 1.5166666666666666». It runs
  `resetCar` with a stub director, so the director's own re-staging is not exercised by this pin. C-PINBOUND: the per-frame bound above.
- **Live check before landing** (drive rig, the real LessonPlayShell, patch applied but uncommitted; no verdict posted): a careful sc-roundabout-entry
  drive at L3 gave the same sheet on PC (headless Chromium; frames 16.7 ms mean, 23.6 ms max) and on the phone lens (headless WebKit, 852×393; frames
  of 269–792 ms): 0 points, «ИЗДЪРЖАН», both tasks, the yield commended, no fault. A look pair was pressed on consecutive animation frames on both
  lenses; the rig publishes no glance field, so how many looks the grade heard was not observed live.
- **D6 — owed, not shown.** The live wiring was never driven on a real phone or on a 120/144 Hz display. That grid points equal physics steps, and which
  point heard each look, are not observed live: no step counter or glance field is published. A quiet-machine cost A/B and a phone frame-time reading
  are owed. The replay harness keeps the lever and the stalk ideal at every grid point, where the product samples them once per frame, so its
  long-frame moment differences are partly its own. `STAGED_POSE_FULL=1` was run by neither the builder nor the verifier.
- **Full design note:** [doc 94](../simulation/94_ADR014_FIXED_STEP_NOTE.md), the builder's note with nine passages corrected against the verifier.

**Amendment 2026-10-11 — rapier's physical contacts are recorded per physics step and heard at their own grid point.** Lane `hzcontact`, round 1, row `sc-hz-brake-dont-swerve:a7d0dd29`; SIGNED OFF WITH CONDITIONS; landed with the commit that carries this paragraph (doc 88). Not a founder ruling. It closes no row.

- **What it corrects.** Two passages of this ADR are superseded from this date:
  - in the Decision's graded-chain bullet, the words «live, rapier's contacts are frame-timed, below»;
  - in «Stated as frame-timed», the item «rapier's physical contacts, reported once per frame».

  Doc 94's item (c) is superseded with them, except its last sentence on staged actors, and so is the first clause of its «NOT claimed» (3). ADR-017's «the rest of ADR-014's frame-timed list is unchanged» now reads without this one item; the items ADR-017 names there all stay.
- **Why.** A frame-timed contact was not only mis-timed; it could be lost.
  - @react-three/rapier 2.2.0 takes all of a frame's steps and then drains its collision events once (checked by the verifier in the dist).
  - It calls the chassis handler for a started pair only for manifolds rapier still holds at that drain (same check).
  - Inside a long frame, a car that had already rebounded off the block was never reported. One still reported was read at the drain's speed and booked at the frame's first grid point, up to 29 steps before the step it began at. These are the builder's base measurements; the verifier re-ran the builder's test on base (24 red) but not these readings.
- **What is true now.**
  - **Recorded per step.** After every rapier step, `recordPhysicsStep` also records the contacts the chassis BEGAN at that step (`PlayerStepTrackRecorder.watchContacts`). It reads `VehicleSim.forEachChassisContact`, a pure read. A pair is in contact when a manifold holds a solver contact; the builder states this is rapier's own STARTED criterion. A `StepContact` carries the step, the struck body's `userData` and the relative speed after that step. One is logged per manifold the pair holds.
  - **Heard on the grid.** `GradeGrid.stepPhysics` hands each contact of step k to `hooks.stepContact` at grid point k, with the student at that point. In the chain's order this is after the replay's stand-in (`hooks.contacts`) and before `runtime.sample`.
  - **Judged by the same code, named from the grid.** VehicleRig's `hearChassisContact` judges it with the unchanged threshold. LessonScene's `handleCollision` names the struck body from that point's student, not from the frame's sample. The chassis carries no `onCollisionEnter`.
- **Boundaries.**
  - `traffic/playerTrack.ts` owns the contact record together with the step record. VehicleRig's after-step callback is still the one call. `VehicleSim` owns the read.
  - VehicleRig owns the ear. LessonScene owns the ref, forwards the grid's hook to the ear, and still names and pushes the graded collision.
  - The contact log holds 64 entries and is pruned to the step ring. A contact pushed out is counted (`droppedContacts`); nothing in the product reads the counter.
- **Reproduced by the verifier,** in process, for walls, props and the district's own colliders only:
  - 44 cells × 12 cadences, with frames of up to 30 steps, plus a 0.37 s hitch at 15 positions around the impact on the 42 cells with an impact step: 0 differences from 60 Hz in judged contacts, COLLISION bills, the sheet and the impact step. 40 of the 44 cells bill a graded contact at 60 Hz; three are below the 10 km/h tolerance and one judges no contact;
  - base against tree: 0 differences at 60 Hz and at 120 Hz.
- **Pins added at landing** (each mutant re-run red on assertion text by the integration verifier or, for the last, by the integrator).
  - The ear's layout effect, cut out of `VehicleRig.tsx` with its dependency argument and run under R3F's reconciler: a deps array of `[]`, `[onCollision]`, `[collisionMinKmh]` or `[contactListenerRef]` fails.
  - A 60 Hz audit of all 80 census cells against rapier's own STARTED events, one per held manifold: counting only manifolds in solver contact fails on 9 cells.
  - LessonScene's `handleCollision`, cut out of the scene and run on the lesson's live runtime: a scene that stops pushing static-object collisions fails 6 tests.
  - The JSX link `onCollision={handleCollision}` on LessonScene's one `<VehicleRig>`, read from the AST: `onCollision={undefined}` fails.
  - Limit: the first and third execute a statement cut out of the product source, not the mounted component. Only the owed device re-drive holds the mounted chain.
- **What still IS frame-timed after this landing.**
  - **The rest of this ADR's list, unchanged:**
    - the cabin's discrete channels and the pedals;
    - the performed pre-drive steps;
    - the moment a look is SAMPLED;
    - a checklist step, a manual finish and an abort, stamped at the click;
    - the trace's `driveline` events, «втори замах» annotation, steering angle and pedal flags;
    - what the student sees while driving.
  - **The items ADR-017 D-3 names beside them:** the driveline stall timer on the unclamped render delta (the review's A13, still owed as its own amendment), the `cabin.update` clocks, reverseAssist and the lee.
  - **The other body of a contact with an NPC shell, ambient or staged.** NpcColliders still moves rapier's kinematic shells once per render frame, for whichever agents are nearest (doc 94 «NOT claimed» (3), second clause, unchanged). Read from source, not measured:
    - The step at which rapier's world begins such a contact is now recorded. But inside a long frame the shell stands at its last frame's pose, so whether and when the chassis meets it can still differ by display.
    - Rapier derives the shell's velocity from that once-per-frame move, so the other body's share of the judged impact speed is the frame's too.
    - Which agents hold a shell at all is re-chosen on NpcColliders' own clock (every 0.5 s, advanced by at most 0.1 s per render frame) from the frame's drawn sample.

    No census measures any of this: the builder's harness does not model NpcColliders' shells, and the verifier's cells mount none.
  - **What the student hears and sees of a contact.** The thump and the haptic pattern (the ear) and the impact cut (LessonScene) are presentation. They are called in the grid loop at the contact's point, but every point of a frame runs in that frame's one callback, so they play with the frame that carries the step.
- **Unchanged, and on the grid as before.** Contact with STAGED actors is also decided by the director's sentinel. The replay harness has no rapier and keeps its stand-in at grid points.
- **Two things this amendment does not settle.** Neither is a frame-timing matter:
  - **The impact speed is read after the contact step's solve,** on base and tree alike. That is a latent defect that needs its own lane or a ruling (doc 88).
  - **Vehicle and pedestrian naming at 60 Hz.** A contact is now named from the pose one step later than on base. This is not measured.
- **No rule or threshold changes.** No point value or shown sentence changes either. `gradedContactMinKmh`, the `>=` comparison, `COLLISION_MIN_KMH` (10) and the thump formula are verbatim. At 60 Hz the impact speed is the number base read; the verifier reproduced that for static obstacles only.
- **D6 stands.** Nothing here was driven in a browser. The live re-drive on PC and the phone lens is owed (doc 88).

**Amendment 2026-10-13 — the bodies the car can touch are posed on the grid, a multi-step frame is graded between its steps, and a staged body has one kind.** Lane `npcstep`, rounds 1–6, row `sc-roundabout-entry:08a0b701`. Round 2's interleaving was RATIFIED WITH CONDITIONS by the integrator (2026-10-13, N2); round 3 answers the round-2 verifier's V2-1, V2-4, V2-5 and V2-12; round 4 answers the round-3 verifier's V3-1…V3-5 (integrator N8–N10, 2026-10-15); round 5 answers the round-4 verifier's V4-1…V4-6 (integrator N11–N13, 2026-10-15); round 6 answers the round-5 verifier's V5-1…V5-3 and V5-6 (integrator N14–N17, 2026-10-16). The round-6 verifier signed it off with conditions (no product-behaviour defect on the drives it ran — its 520-cell census, the 2,434-cell replay catalogue and a 500-drive product-input fuzz; every named-class mutant dies on assertion text; two NEW classes outside N14 survived the targeted set, V1 the 87-file wide set too — both pinned at integration, 2026-10-16, see «What the structure did not follow»). Under N17 the stop rule is bounded: it refutes on a product-behaviour defect the product's own inputs can produce with the code as shipped, on a surviving mutant of the named classes, or on a builder claim that does not reproduce; a NEW class of deliberate sabotage outside the named classes is a condition. Not a founder ruling: no rule, threshold, copy table or shown sentence changes. Evidence is in process only; it closes no row until the device re-drive below.

- **What it corrects.** In the 2026-10-11 amendment's «What still IS frame-timed», the item «The other body of a contact with an NPC shell, ambient or staged» is superseded whole. So is ADR-017 D-3's item «NpcColliders». In «Stated as frame-timed», «every point in a frame sees the frame's value» now reads: «a frame's LAST point sees the frame's sample; an earlier point of a multi-step frame sees the cabin as it stands when its step has been taken».
- **Why (measured on 8cb0707, in process).** NpcColliders moved its kinematic shells once per render frame. In a frame of n steps a shell leapt the frame's distance in the first step and stood still for n−1; rapier derived its velocity from that one move.
  - Builder's census (56 committed demos that end in a road-user contact, 200 cells × {30 Hz, 13 fps, 0.37 s, w69 phone} against each cell's own 60 Hz drive): 543 of 800 rows differed, in 136 cells. Largest first-contact shift 41 steps (sc-follow-rain-gap gap-melts L1, 1710 → 1669). One touch was judged at 1.82 km/h on one cadence and 86.06 km/h on another. 36 rows in 21 cells added a static-object bill.
  - A standing shell agreed on every cadence (51 struck cells), which places the cause in the move, not in the contact record.
  - The row's own lesson (sc-roundabout-entry L1, go at a named step 2320): COLLISION at step 3095 with one bill at 60 Hz, 3089 at 30 Hz, 3078 at 13 fps with three bills and a 40.9 km/h shell impact.
- **What is true now.**
  - **The shells are posed by the grid.** `GradeGrid` calls `hooks.shells(k, student, respawned)` LAST at every graded point, after `onPoint` and the near-miss handler. scene/npcShells.ts `NpcShellPool` gives every bound shell its agent's pose at k as the next kinematic pose, so physics step k+1 moves it there at the agent's own one-step velocity. A shell that changes agent is teleported. NpcColliders mounts the 12 bodies and fills the scene's ref; it has no frame hook.
  - **Who holds a shell is chosen on the grid,** from the grid's student: at the pool's first point, at every k ≡ 0 (mod 30) (30 = the old 0.5 s ÷ FIXED_DT), and after a respawn at TWO points — the point the respawn is handed to (every shell teleported) and the point after it (whose student is the car on its spawn). Shell count (8 + 4), radii (130 / 70 m) and the per-agent fit are unchanged.
  - **A multi-step frame is graded between its steps.** VehicleRig's before-step callback first calls `stepLoopGradeRef`. RuntimeDriver fills that ref in a layout effect with no dependency list, so it is always the committed render's, installed in the same layout phase as R3F's frame callback; it is emptied on unmount. When the step just taken is ungraded and the driver is not paused, it refreshes the cabin's channels (`updateCabinChannels`, when the scene has a sim and a cabin) and grades that point with `frameEndSec` and the frame's look null. Then the rig reads step k+1's input. The frame's last point is graded at the frame's end, with the session clock and the frame's look, as before. A paused driver grades nothing; steps a stepper took anyway are graded in order by the first call after the pause, before any further step.
  - **The grid's clock is read-only to everyone but the grid (round 4), and its grading machinery cannot be replaced (round 6).** `GradeGrid.clock` is a frozen `GradeGridClock` view — `stepSec`, `last`, `timeOf`, `indexAt` — over a private `SessionGridClock`; the clock is advanced only inside `stepPhysics` / `stepFrame`, each of which grades every point it hands out. Through the view, `gradeGrid.clock.advanceSteps(…)` is a compile error (no advance in the type) and, run anyway, a TypeError (none on the object). That guarantee is the source census plus execution, NOT the type (round-4 verifier V4-2): TypeScript accepts bracket access to a private member, so `gradeGrid["gridClock"].advanceSteps(…)` COMPILES (verifier mutant R1c: tsc stays at the 22-error baseline); that spelling is caught by the source census (no module but scene/gradeGrid.ts names `gridClock` or calls `advanceSteps`), by the executed frame drives (R1c: 73 tests failed on assertion text on the round-5 fast set; 39 on the round-4 verifier's), and since round 6 by the cut's refusal (a computed member read of, and a method call through, the grid: N14 b). ROUND 6 (integrator N14 d; the round-5 verifier's P7 — `gradeGrid.stepPhysics = () => 0` inside the frame callback compiled, advanced nothing and graded nothing from then on): `GradeGrid.prototype` is FROZEN, so its five methods (`stepFrame`, `stepPhysics`, `run`, `hear`, `reset`) are non-writable and non-configurable — an assignment on an instance throws a TypeError in strict code (every module) and replaces nothing; an instance is NOT EXTENSIBLE, so no own property can be defined over a method; its `clock` and `gridClock` fields are non-writable and non-configurable. Its mutable state (`dropped`, `prevK`, `respawned`, the scratch objects) stays writable, reached only through its private members. Pinned by scene/__tests__/grade-grid-clock-readonly.test.ts: `@ts-expect-error` on every mutating member of the clock view, the frozen view's exact keys, the source census (§3); and (§4) the five methods on a frozen prototype, an assignment of each through a cast throwing a TypeError and replacing nothing (the computed spelling and the class's prototype too), `Object.defineProperty` over a method throwing, the two clock fields non-writable, and a census that no product module assigns a grid method, `clock` or `gridClock` (by name or computed) or defines one. Measured cost: none — the grid's per-point cost with a stub world (60,000 points × 7 repetitions, median), the round-5 grid and the sealed grid run ALTERNATELY three times each on a shared machine: round 5 447 / 489 / 525 ns, sealed 446 / 470 / 472 ns — no measurable difference (three earlier SEQUENTIAL runs of each — round 5 338 / 341 / 382 ns, sealed 414 / 418 / 444 ns — were not reproduced when alternated; the round-6 verifier, running the round-5 and the sealed grid INTERLEAVED in one process, 60,000 points × 9 alternated repetitions, three runs: round 5 876 / 641 / 527 ns, sealed 899 / 619 / 519 ns median — no measurable difference). Through round 3 `clock` was the clock itself; through round 5 the methods were writable.
  - **One step per frame runs the sequence that shipped** — per ONE-STEP FRAME, not per display. A real PC also draws two-step frames (rig-w3d kept/_report.txt: [3500..3501], [3503..3504]). In such a frame the first point is now graded in the loop: the shells are posed from it before the second step, and its cabin read is the refreshed one. The census covers two-step frames: desktop jitter, the 60/60/60/0.25 s/144 mix and 120/144 Hz.
- **What changes character at a point graded inside the loop** (multi-step frames only):
  - **The trace's steering angle and pedal flags, and the director's `brakePedal`,** are no longer the frame's end values. They are `simRef.steerRad` as step k left it, and GatedSimInput's raw pedals from the refresh's `read()` — the input as it stands when step k has been taken. For a human that is the frame-start value (ADR-017 D-1; keys move only between frames). For the dev rig it is decision k, which is what a 60 Hz frame-end read gives.
  - **The cabin clocks** (`cabin.update`, the stall timer, on the render delta) reach only the frame's LAST point; before, every point of the frame saw them.
  - **`onTick`, the contact ear and staged outcomes** fire inside rapier's before-step callback for those points.
  - **One extra `GatedSimInput.read()`** per in-loop point (wall-time ramp, dt ≈ 0; reads are documented as frequency-independent). tools/mobile/__tests__/path-follow.test.mjs's frame-order model (`frameOrderRead`, :894–942) pins VehicleRig's two reads — `useBeforePhysicsStep(() => {` then `const raw = inputRef.current?.read() ?? IDLE_INPUT;` then the render-rate `const input = inputRef.current?.read() ?? null;` (:919–923) — and the mount and assist order (:924–937); it does not describe that VehicleRig's before-step now calls the scene's step-loop grade FIRST, whose `updateCabinChannels(…, inputRef.current?.read() ?? null)` reads the input once more before VehicleRig's own read, on every step but a frame's first. Measured at integration (2026-10-16): the file is GREEN on the integrated tree (`node --test`, 97 tests: 93 pass, 0 fail, 4 todo; green again in the merge verifier's tools run) and the model was not changed. Why it stays green is the integrator's reading of the code, with which the merge verifier's reading of input.ts agrees; no run isolated the extra read. Its pins are ordered anchors that are all still present in order (the new read lives in LessonScene's step-loop grade, not in VehicleRig), and by that reading nothing the model measures moves: input.ts integrates every read over the wall time since the previous read (`stepPedal`, a ramp saturating at 0 and 1, so two reads compose into one), the added read falls between two reads that were already consecutive — VehicleRig's reads of two successive substeps, one substep's cost apart, far below the per-read clamp `MAX_RAMP_DT_S` (0.5 s) — so the per-read clamp never splits differently; `ReversePedalMapper` detects a flip at whichever read first sees the new flag and releases on value (idempotent, as its header states); and the ReverseAssist is still handed the frame's LAST read, VehicleRig's render-rate read, which is unchanged. The model is therefore incomplete in its description (it still says one read per substep) but not wrong in what it asserts. (Line numbers and counts updated 2026-10-16, curvdepth + cdtools landing.) cdtools adds 21 lines to path-follow.test.mjs above the model. `frameOrderRead` is now at :915–963, VehicleRig's two reads at :940–944, and the mount and assist order at :945–958. The anchors themselves are unchanged. The «97 tests: 93 pass, 0 fail, 4 todo» above is the npcstep integration tree's count. On `9390622` + the curvdepth landing set + cdtools, the file is 106 tests: 102 pass, 0 fail, 4 todo (the cdtools verifier). With the landing's CD-2.2b added it is 107 tests: 103 pass, 0 fail, 4 todo (`scratch/cdt-land/PROGRESS.md`). The count on the combined tree (npcstep + cardstay + this landing) is still to be measured. Neither lane owes substantive ADR text: neither lane report carries adrParagraphCorrected. Apart from this bullet's reference to path-follow.test.mjs's frame-order model, doc 07 has no sentence on demo curvature, the parking drills, pathrefs, or the pc-path planner and follower. The instrument decisions are registered in doc 93 entry CD-1.
- **The frame cannot end before its graded call, nor a point be skipped, through any statement of the named classes — by structure (rounds 5–6) — and every `if`/loop branch and every cabin control is executed (rounds 3–6).**
  - **No early exit (integrator N11, round 5).** The harnesses' cut (lessons/scenario/__tests__/sceneGradeCut.ts) REFUSES, from the syntax tree, every `return` and every `throw` in RuntimeDriver's frame callback before its `gradeTakenSteps(…)` call — at any depth, in any branch (including a `switch` case and a `try … finally`, round-5 verifier P5/P6), inside labelled blocks — except exactly one top-level `if (paused) return;` (matched by its exact syntax; a second copy, a braced or widened copy is refused). The same for the step-loop grade: its call must be an unconditional statement of the function the layout effect installs, and before it the only exit is exactly `if (paused || taken === null || taken.stepCount <= gradeGrid.clock.last) return;`. Since round 6 the same for `gradeTakenSteps` itself: its `gradeGrid.stepPhysics(…)` must be the expression of a top-level `return` of its body, with no `return` or `throw` before it. Also refused: a binding named `gradeTakenSteps` before the call (a shadow). Nested functions defined in the callback (the pre-drive `emit`, the assist's `step`): a `return` there leaves only that function and cannot end the frame, so it is not refused; a `throw` there is refused wherever it is, invoked or not. The call itself must be an unconditional top-level statement of the callback (since round 3), so a labelled block that wraps it and `break`s out is refused too.
  - **What the cut guards is not written: the names and objects the exits and the graded call read (integrator N14 a–e, round 6; the round-5 verifier's V5-1 / V5-2), and since integration the refs the grading reads (N14 f).** It is not everything the graded call reads: the session clock `tRef`, which the frame callback writes every frame, and a value read off a ref are not guarded (below). Through round 5 the allowed exits were matched by their TEXT and nothing refused a write to their inputs: `paused = paused || (delta > 0.02 && hazards)` above the pause guard (P1) and `const taken = (hazards) ? null : stepTrackRef.current;` in the step loop (P3) passed the targeted set and the 87-file wide set, and `gradeGrid.stepPhysics = () => 0` as an expression (P7) passed the targeted set, 278 of 278 (the hazards are one key press, J). The cut now also REFUSES, in RuntimeDriver's frame callback WHOLE (a write after the call reaches the next frame's step loop through the same binding), the step-loop grade and `gradeTakenSteps`, at any depth, nested functions included:
    - (a) any WRITE to a GUARDED name — `=`, every compound assignment, `++`/`--`, a destructuring target (object or array pattern, defaults and spreads), a `for … of / in` target — and any BINDING of one (var / let / const, a parameter, a binding element, a function or class name, a catch variable: a shadow) but the two pinned declarations below and `gradeTakenSteps`' own parameters (which are guarded inside it too). The guarded names are DERIVED from the syntax of the two allowed exits and the two pinned declarations — today `paused`, `taken`, `gradeGrid`, `steps`, `stepTrackRef`, `NO_PHYSICS_STEPS` — plus `gradeTakenSteps` and `stepLoopGradeRef`; a widened guard widens the set. For the props (`paused`, `gradeGrid`, `stepTrackRef`, `stepLoopGradeRef`) and `gradeTakenSteps` the same holds in RuntimeDriver WHOLE: bound only by its parameter list (and `const gradeTakenSteps = …`), never written — a render-body `paused = …` before the layout effect is refused;
    - (b) any write to, `delete` of, COMPUTED read of, or METHOD CALL through a member of a guarded object (`gradeGrid`, `stepTrackRef`, `stepLoopGradeRef`, `steps`, `taken`) but the graded call — `gradeGrid.stepPhysics = …`, `gradeGrid["stepPhysics"] = …`, `stepTrackRef.current = null`, `taken.stepCount = …`, `stepLoopGradeRef.current = null`, `gradeGrid["gridClock"].advanceSteps(…)` (R1c), `gradeGrid.clock.advanceSteps(…)` (R1b); RuntimeDriver-wide no member of the grid or the step record is written, and the step-loop ref's member only by the layout effect that fills and empties it;
    - (c) the two inputs by their EXACT syntax: the step-loop grade's FIRST statement is `const taken = stepTrackRef.current;` and the frame's `steps` is `const steps = stepTrackRef.current ?? NO_PHYSICS_STEPS;` (P2, a ternary in `const steps`, died through round 5 on six test pins only);
    - (e, own) an ESCAPE of a guarded object — read other than as the object of a member read, an argument of the graded call or an operand of a comparison: into a binding (`const g = gradeGrid`), an assignment, another call's argument (`Object.assign(gradeGrid, …)`), a literal, a spread, a `return`, or `||` / `&&` / `??` — an alias through which (a)/(b) could be written unseen;
    - (d) is the grid's own: its methods cannot be replaced at run time (above);
    - (f, integration 2026-10-16; the round-6 verifier's V6-2) THE REFS THE GRADING READS: every `X` that `gradeTakenSteps` (its hooks included) or the step-loop grade reads as `X.current` and does not declare — DERIVED from their syntax by the cut (`gradedRefsOf`; a hook that starts reading another ref widens the set), less the guarded objects; today `attemptFeedRef`, `attemptRecorderRef`, `cabinRef`, `contactListenerRef`, `hazardActiveRef`, `inputRef`, `npcShellsRef`, `sampleRef`, `simRef`, `telltaleCautionLitRef`, `telltaleLitRef` (a superset of the verifier's six). In the frame callback (whole) and the step-loop grade each is a guarded NAME (no write, no shadow), no member of it is written, deleted or read computed (at any depth through the ref: `sampleRef.current.mirrorGlance = null` is refused), and it never escapes into an alias (`const s = npcShellsRef`, `Object.defineProperty(npcShellsRef, …)`); in RuntimeDriver elsewhere no member of one is written (the graded function's own hooks keep writing their lamp and hazard refs — it is pinned as a tree by live-grid-wiring §3). A METHOD called on a ref's value (`inputRef.current?.read()`, `cabinRef.current?.consumeGlanceSample()`) is the scene's ordinary business and is not refused.
    The round-5 verifier's P1, P2, P3, P7 and the round-4 verifier's R1c, and a variant of each of the builder's own — P1 by destructuring (`({ paused } = …)`, `[paused] = …`), by a `const paused` shadow, by a hoisted `var paused`, by RuntimeDriver's render; P3 as `let taken` then nulled, as the frame nulling `stepTrackRef.current`, as the step loop rewinding `taken.stepCount`; P7 computed, through an alias, through `Object.assign`, and the step-loop ref emptied from the frame; `gradeTakenSteps` swapping its `steps` or returning before its `stepPhysics` — each dies on the refusal's text (scene-frame-grade.execution §5b). Every harness that executes the scene's frame (scene-frame-grade.execution, live-grade-call.execution, rapierContactDrive's users) goes through this cut, so a refused text fails every one of them, at collection or at its first call of the cut, on the refusal's text.
  - **What the structure did not follow, and the two pins that close it at integration (2026-10-16; N17 conditions V6-1 and V6-2).** The round-6 verifier found two NEW classes that survived the targeted set (12 files, 319 tests). NS1b, executed under its product-input fuzz, restores this row's own defect on multi-step frames; V1 does by the verifier's reading, not executed (its effect is that of scene-frame-grade.execution §3's case «a step loop that grades nothing»):
    - (i) THE CALLER of the step-loop grade — VehicleRig's before-step `stepLoopGradeRef?.current?.();` wrapped in a condition (`if (!(hazards && rawBrake > 0.3)) …`, its mutant V1; it also passed the 87-file wide set): the cut did not read VehicleRig, live-grid-wiring §3 only counts ONE rig statement naming the ref, and step-loop-grade §3 executes the rig callback with no cabin. PINNED: `rigStepLoopCallRefusals` (sceneGradeCut.ts, `RIG_STEP_LOOP_CALL`) requires exactly one `useBeforePhysicsStep` in VehicleRig, handed a function literal with a block body whose FIRST statement is, by its exact syntax, the unconditional expression statement `stepLoopGradeRef?.current?.();`, and refuses any other mention of `stepLoopGradeRef` in the rig but the prop's declaration and the component's destructured parameter; `sceneGradeCut()` refuses the scene's cut when the rig does not hold to it, so every harness that executes the scene's frame fails, at collection or at its first call of the cut, on the refusal's text. V1 re-run on the integrated tree (fast set): 27 failed and two files refused at collection, every failure «the rig does not run the scene's step-loop grade first and unconditionally before every physics step (V6-1): VehicleRig line 669: the before-step callback's first statement is not `stepLoopGradeRef?.current?.();`, unconditional (V6-1) — `if (!((cabinRef…`». Variants refused by text (scene-frame-grade.execution §5c): the call behind `hazards || …`, moved below the `sim` guard (the round-2 verifier's M5), removed (R2), and kept first while the rig empties the ref later in the callback;
    - (ii) THE GRADED CALL'S OTHER INPUTS — `npcShellsRef` (the shells hook `gradeTakenSteps` hands the grid) emptied around the frame's call on long frames with hazards and a brake, as an expression (mutant NS1b; under product-input fuzzing with the refusal on, 173 of 200 drives took steps with the shells posed from an earlier point; its `if` spelling NS1 died only on §6c's branch census). PINNED by N14 (f) above. NS1b re-run on the integrated tree (fast set): 27 failed and two files refused at collection, every failure «the scene can write what its exits or its graded call read (N14): frame callback line 5550: writes a member of `npcShellsRef`, a ref the grading reads (N14f) — `npcShellsRef.current = null`; …line 5552…». Refused by text too (§5c): NS1, `Object.defineProperty(npcShellsRef, …)`, an alias, a computed write, the step loop emptying `contactListenerRef`, the frame deleting `cabinRef.current`, and RuntimeDriver's render emptying the shells hook; the builder's own O2 (`sampleRef.current.mirrorGlance = null` on long frames, §3) is now refused by structure as well as caught by execution.
    - STILL NOT FOLLOWED BY STRUCTURE (stated, each caught only where an executed drive sees it): a value READ off a guarded object or ref and then written (`const rec = stepTrackRef.current; rec.record(…)` — the builder's Q4, killed by execution; and a write through the frame's own `const sample = sampleRef.current` — the builder's Q1 as it wrote it, `sampleRef.current.mirrorGlance = null`, is now refused by (f)); a write made inside a procedure the callback calls; a write to an object the cut does not guard that changes what is graded later (the session clock `tRef` — Q2 — which the frame itself writes); a write to a ref the grading reads made OUTSIDE RuntimeDriver: ReadyScene, which declares `npcShellsRef` and `contactListenerRef` and hands them down as props, or NpcColliders, which fills the shells ref (N14 f guards RuntimeDriver only; at integration a verifier mutant that nulls `npcShellsRef.current` from a ReadyScene effect behind a flag the product never sets passed the targeted set, 335/335 — an N17 condition, not product-reachable); what LessonScene's JSX hands the rig's `stepLoopGradeRef` prop (the rig is pinned, the hand-over is not: live-grid-wiring §3 reads it as text); and an exception (next bullet).
  - **Execution (integrator N12, round 5; N16, round 6).** scene-frame-grade.execution §6 drives every product-reachable branch on frames of 1, 3, 7 and 30 steps and a mixed run, with a REAL CabinControls (a real DrivelineState) and the scene's own procedures (the real ReverseAssist, both real watches, the pre-drive tracker, `observeControlSignal`, `readyToMoveOff`, `writeDashboardStatus`): the pre-drive block with `driveLocked` on (reachable in the product because `physicsPaused` is `paused || menuPaused` only, so points are graded while the drive is locked); the reverse assist commanding both shifts; the reverse-stuck watch firing; the stuck-start watch firing; driveline rejections, a tier switch and the attempt recorder; a paused frame between live ones. ROUND 6 (N16) adds THE PRODUCT'S INPUTS: on a ready, live cabin and on a cold, LOCKED one, every one of the 19 keys the cabin binds (CABIN_KEYS: both indicators, the lamps, the belt, the four mirrors, the night preview, the mute key; DRIVELINE_KEYS: ignition, parking brake, the selector both ways, the clutch, the hazards, the wipers, the fog lights, the horn) pressed and released THROUGH THE CABIN'S OWN KEY HANDLERS, held keys held across frames, and its public controls (`cycleIndicator`, `glance`, `indicateLeft` twice, `forgetPendingGlances`), toggled DURING frames of 1, 3, 7 and 30 steps and a mixed run — the hazard lights on from 0.4 s to 4.4 s, the cabin's clocks stepped once per frame on the render delta, the frame's look taken from the cabin as VehicleRig's sample builder takes it (`consumeGlanceSample`). In every run every point is graded once and in order (each frame's last by the frame, the rest by the step loop), every frame end is the session clock, and every look the cabin hands out is HEARD, once, in order. The controls trace (every control after every action) is identical on every cadence; the NUMBER of looks a held mirror yields is not (a hold is refreshed by `cabin.update` on the render delta: on the controls drive the cabin hands out left, right, rear, shoulder, rear — 5 looks at 1, 3 and 7 steps per frame, 6 on the mixed run, 7 at 30 steps per frame, a held mirror refreshed once more on a long frame; every one heard) — frame-timed by design («the moment a look is sampled», below). §6c is a BRANCH CENSUS: the cut compiles the region with a counter at the head of every branch (34: every `then`/`else` and loop body before the call, nested functions included) and all 34 are entered on 3-step AND on 30-step frames. §6b runs the round-4 verifier's F1–F6 with the refusal off; §6d runs the round-5 verifier's P1, P3 and P7 with the refusal off on the N16 drive: P1 — from the first long frame with the hazards on the frame never reaches its graded call and, the step loop closing over the same binding, grading stops at both sites; P3 — a step is taken with its predecessor ungraded and the shells stale (this row's own defect); P7 — the sealed grid refuses the assignment, the frame throws a TypeError and its point is graded by the next frame's step loop; at one step per frame P1 and P3 are inert.
  - **History.** Round 2's verifier's G5b (the frame's last point lost behind a condition) passed the targeted set (183 of 183) and the wide set (595 of 596, the one failure a tools/ ENOENT) through round 2; dead since round 3 on the cut's refusal. Round 3's verifier's R1b (a clock skip above the round-3 region) and R1 (an early `return` there) passed; dead since round 4 on executed assertions (R1b also on tsc and the clock census; since round 6 also on the cut's N14 b refusal). Round 4's verifier's F1–F5 (an early `return` inside a branch the harnesses compiled but never executed) passed: F1 the 87-file wide set, F2–F5 the targeted set; since round 5 each dies on the refusal's text (and, refusal off, on §6b's executed drives). Round 5's verifier's P1 (the pause guard's input reassigned), P3 (the step-loop guard's input re-declared) and P7 (the grid's grading method replaced) — no `return`, no `throw` — passed the targeted set, P1 and P3 the 87-file wide set too; since round 6 each dies on the refusal's text, on §6d's executed drive, and (P7) on the grid's seal; as product mutants P1, P3 and P7 die on the refusal (on the lane's set two harness files at collection and 4–5 tests at their first call of the cut; 29 failed for R1c, which now dies there too), and P4 on the N16 drive and §7 (13 failed). Round 6's verifier's V1 (the rig's call behind a condition) and NS1b (the shells hook emptied around the frame's call) passed the targeted set; since integration each dies on its refusal's text, two files at collection and 27 tests at their first call of the cut (above).
  - **The exception limit (integrator N15; stated in the test and checked against the code).** ANY exception raised while the frame callback runs before its graded call — INLINE in its own expressions (the round-5 verifier's P4: `void (delta > 0.02 && hazards && (null as unknown as { x: number }).x);`, no `throw` and no call — no syntax names it) or INSIDE a procedure it calls — is not refused. It abandons the rest of that frame: @react-three/fiber 9.6.1's `loop` (dist/events-b389eeca.esm.js:16041–16100) requests the next animation frame FIRST and then `update` calls every `useFrame` subscriber in a plain `for` with no try/catch, so the graded call, every later subscriber and `gl.render` are lost, and the rAF callback is left as an uncaught error (the browser console; Next's overlay in development; the product registers no window `error` / `unhandledrejection` listener, pinned). The next frame's step loop grades the lost point once and in order, with no frame end and no look; that frame's look is lost. A silent loss of the frame end for the user, visible only in the console. Executed in scene-frame-grade.execution §7 twice: a dashboard writer that throws on one frame; and P4 itself on the N16 drive with the hazard lights on — more than ten of the 3-step frames throw `Cannot read properties of null`; every point is still graded once and in order, each lost frame's last point by the next frame's step loop with no frame end — inert at one step per frame. The R3F loop's shape is pinned, so an upgrade re-opens the claim (`EXCEPTION_LIMIT`).
- **A paused frame, executed (round 4; the round-3 verifier's V3-3).** With a cabin and pedals that would make every branch run: the blocked-attempt latch is consumed but not surfaced and the status dashboard is written (cabin keys still work during a pause); nothing else runs — no point is graded (not even one a stepper took anyway; it is graded, in order, by the first live step's turn), the session clock does not move, reverseAssist and both stuck watches are neither stepped nor reset, the driveline-event and glance queues wait for the first live frame, and the frame's look is not handed to the grid (VehicleRig's own frame is not paused, so a look made during a pause is overwritten by the next frame's and never heard — the world is not moving). The round-3 verifier's R3 (the early-out removed) dies on these executed assertions.
- **ONE KIND for a staged body, on every reader that names it or grades by it (rounds 2–5).**
  - The kind is the director's contact cast's, and the cast's kind is the profile's (orchestrator/contact.ts `contactKindOfProfile`: cyclist and childCyclist are cyclists). The child of sc-vu-child-cyclist is cast «cyclist» (it was «vehicle»).
  - The rapier shell of a cast member carries the cast's kind (the pool is handed `directorContactCast`). `createScenarioDirector` hands the traffic system the same kinds (`setStagedContactKind`), so `TrafficSystem.vehicleCollisionKind` answers the cast's kind for a cast vehicle. Its readers: the rear-proximity badge (`rearBodyBehind`), the near-miss stat (`emitVehicle`), the pool's fallback — and, since round 4, the three GRADED queries: `cyclistNear` (the lateral-clearance duty's feed), `overtakenNear` (the overtake-return duty, cyclists excluded), `sameDirVehiclesNear` (the lane-entry tracker). Through round 3 those three read the A11 curb-offset marker (`cyclistStateIds`) directly, so both riders of sc-vu-bikelane-turn were cyclists on every naming surface and vehicles to the three graded queries.
  - The A11 marker now answers only for a state no cast names (ambient agents; staged actors whose runner casts nothing: rail, tailgater, police). No query reads it directly. (Round-4 verifier: over 808 rungs, 104 staged vehicle states are in no cast and none of them carries the marker.)
  - **The counter-flow rider's opt-out is an authored field (round 4).** sc-vu-bikelane-turn's counter-flow rider (`sc-vbl-rider-cf`) is graded only by its own CyclistRightHook runner, never by the vulnerable-pass tracker; through round 3 that was carried by the NEGATIVE SIGN of its curb offset (−12.32, which kept it out of the marker). It is now `gradedOnlyByOwnRunner: true` on the actor (contracts.ts `StagedActorPathSpec`, where cast-member fields are documented; content/SCHEMA.md documents no cast fields — templates are code), forwarded by the CyclistRightHook runner to `StagedVehicleSpec.gradedOnlyByOwnRunner`; none of the three graded queries returns a state staged with it. The with-flow rider (`sc-vbl-rider-wf`) has no opt-out and is now a cyclist to `cyclistNear` (and no longer a vehicle to the other two). Its authored offset `VBL_WF_Y − VBL_THROUGH_Y` = −2.6 (its comment said +2.6) puts it at y ≈ −1.46, not the intended south curb line −6.66: a CONTENT question carried for the integrator to file, not changed here (it moves a rider); the comments now say what is authored.
  - **How the three queries ask (round 5, V4-3).** Each asks ONE Set per state, through a predicate made once: `gradedCyclistIds` (cyclist by `vehicleCollisionKind` and not opted out) for `cyclistNear`; `notGradedVehicleIds` (cyclist, or opted out) for the other two — the shape of the marker predicate they replaced. Both Sets are refilled EAGERLY at the end of a vehicle `stage` and of `setStagedContactKind`, the only two things that change either answer (an ambient state is never in the marker, a cast or the opt-out; nothing removes a staged state, as in base). Round 4 asked a method, a cache check and two Sets per state.
  - Pinned over the catalogue (784 cast members, 808 rungs): cast kind == shell tag == rig kind == `vehicleCollisionKind`; the badge, run with the student just ahead of the member, names it by the cast's kind (582 members judged, 16 with another body nearer); the near-miss stat, run on a pass alongside it, reports the cast's kind; the three graded queries, run with the student 6 m behind the member facing its way, return it exactly as its cast kind says (45 riders to `cyclistNear`, 548 vehicles to the other two; 0 mismatches) and never the opted-out member; `gradedOnlyByOwnRunner` is authored on exactly sc-vu-bikelane-turn L1–L5 `sc-vbl-rider-cf`, a cyclistRightHook event's cast member; stripped from a copy of the template, the counter-flow rider IS returned by `cyclistNear` (the field is what keeps it out); a plain staged car staged with the field is returned by none of the three (traffic/cyclist-near.test.ts); `stagedActorId` is the inverse of `staged`.
- **What changes at 60 Hz, base against tree.**
  - The rebind PHASE: every 30th grid point from the grid's student, instead of a float sum that crossed 0.5 s from the frame's drawn sample. It changed no judged contact, bill or sheet in the 496 + 200 census cells, but it can move which agents hold a shell when more than 8 vehicles / 4 walkers are in range, or one enters range within a rebind interval of a contact.
  - Rider rows (every committed demo of the five rider lessons × every rung × {brake, carry-on}, 160 cells: 152 identical). All 8 that change are sc-vu-bikelane-turn mistake-cut-path:
    - L1 and L5 carry-on lose the duplicate COLLISION «vehicle» at 19.300 s — the ear's anonymous second row of the touch already billed «cyclist» at 19.283 s. Score 20 and the fail are unchanged: the ledger had closed at the first pedestrian contact (16.983 s).
    - The rear badge says «Велосипедист отзад» where it said «Кола отзад»: L1, L2, L3, L5 brake; L2, L3, L5 carry-on.
    - The near-miss record names the rider «cyclist» where it said «vehicle»: L2, L3, L5 carry-on (live) and L1, L2, L3, L5 (replay catalogue, `nearMisses[1].kind`). The debrief's near-miss sentence names the CLOSEST near miss, which in every one of these cells is the pedestrian at 0.0 m, so the shown sentence does not change.
    - No committed demo touches the child; no child sheet moves.
  - The round-2 verifier's 24 bikelane variant cells (not committed demos): 22 badge relabels, 8 near-miss relabels, and 9 sheets: 7 lose the exact duplicate; L1/look0.3 carry-on relabels an ear-only touch «vehicle» → «cyclist» (INTENDED by N1: the sentinel is silent there and the touch is the rider); L1/look0.5 carry-on also loses a SEPARATE «vehicle» row at 30.483 s. That touch (step 1829, 0.93 km/h) comes 0.28 s after the sentinel's last report of the same rider, which it reported on every point from 1606 to 1812 (the car pressed on the rider for 3.5 s). Under the cyclist separation rule it is the continuation of that contact; under the vehicle rule it billed only because the lead-gap channel saw daylight. Score and verdict are unchanged in all 9.
  - Rounds 4–6 (the graded-query source; the single-Set form; the grid's seal): none measured. Round 4 against round 3: 0 of 2,434 replay digests, the 24 bikelane variant cells and the 160 rider cells identical (and the round-4 verifier's 520-cell census rows, sorted, byte-identical); round 5 against round 4 — the replay catalogue's 2,434 digests and its collision rows byte-identical, the 24 bikelane variant cells × 5 cadences byte-identical (sha256 25b51f6a…), the 160-cell rider census byte-identical, and the round-5 verifier's full 520-cell census, sorted, byte-identical to the round-4 tree's rows on every part; round 6 against round 5 (the only product change is the grid's seal) — the replay catalogue's 2,434 digests and its collision rows byte-identical (sha256 e90030b2… / 25c1192e…), the round-2 verifier's 24 bikelane variant cells × 5 cadences byte-identical (25b51f6a…), the 160-cell rider census byte-identical (7a22f201…), and the round-5 verifier's full census — its probe v3, run by the builder on the round-6 tree — sorted-row-identical to the verifier's own round-5 rows on every part (carry 051dfd7e, brake 5ae2d29f, the row's own lesson f2cf0f55, release e3677a51, bikelane variants f0bcf971; 3,464 rows). So the 60 Hz change list above is the whole list for rounds 1–6. The with-flow rider is now fed to the vulnerable-pass tracker and dropped from the overtake-return and lane-entry queries; on what was measured no drive reaches those trackers' gates with it in a way that moves a sheet — a drive that does (a pass alongside it) would now be graded as passing a cyclist, which is what it is.
- **Which path bills, by actor kind.** A staged vehicle, rider or walker in a runner's contact cast has two reporters on one wire: the director's sentinel (boxes overlap at grid point k) and the rig's ear (rapier began a contact at step k, named from the same cast). Both now carry one kind and one name, so the rule engine's merge holds: one episode, one bill, at the first report. Measured: across all 3,464 rows of the verifier's census on every cadence, no two road-user COLLISION rows within 0.2 s. Ambient vehicles and walkers have the ear only. The two are not the same predicate: the ear speaks alone where the boxes do not overlap (the 08a0b701 H1810 class), the sentinel alone where no shell is bound or below the lesson's threshold. Whether an ear-only touch with no box overlap should bill is the founder question the rig judge named; this amendment makes the answer the same on every display, not right.
- **Boundaries.** scene/npcShells.ts owns bindings and poses; gradeGrid owns WHEN (`hooks.shells`, after `onPoint`), is the only owner of its clock's advance (by the source census and execution) and of its grading methods (frozen prototype, non-extensible instance — round 6); NpcColliders mounts the bodies and fills the ref; RuntimeDriver owns the one `stepPhysics` call (`gradeTakenSteps`) and the step-loop function, and, but for the cut's stated exceptions (the layout effect's fill of the step-loop ref, the graded function's own hooks), writes none of the names, objects or refs the cut guards (N14 a–f); the session clock it advances every frame (`tRef`) and a value it reads off a ref are not guarded (N17); VehicleRig calls it first in its before-step, by the exact unconditional statement `stepLoopGradeRef?.current?.();` and names the ref nowhere else (pinned at integration, V6-1); within RuntimeDriver the frame callback and the step-loop grade write none of the refs the grading reads (N14 f, V6-2), and a write to one from ReadyScene or NpcColliders is not followed (N17). The director registers its cast's kinds with the traffic system; the traffic system owns `vehicleCollisionKind`, the opt-out set and the two graded-kind Sets, and every query of a staged body's kind goes through them.
- **Measured in process (rounds 1–6).**
  - Builder census, 200 cells × 4 cadences: 0 of 800 rows differ (judged contacts, both reporters, bills, sheet, car pose after every step, close step). 167 cells strike a road user (128 vehicle, 39 pedestrian; 115 moving).
  - Verifier census (its drivers, cadences and keys; 0 differences from 60 Hz in every round, 1 to 6): re-run on the round-3 tree (520 cells, 2,944 non-60 Hz rows, 0 differences; its 60 Hz rows equal round 2's on every key), by the round-4 verifier on the round-4 tree (520 cells, 0 differences, every row, sorted, byte-identical to round 3's) and by the round-5 verifier on the round-5 tree (520 cells, 2,944 non-60 Hz rows, 0 differences; every part's rows, 60 Hz included, sorted, byte-identical to the round-4 tree's: carry 200 × 8 with 161 struck, brake 200 × 4 with 167 struck, release 56 × 4, the row's own lesson 40 × 5, bikelane variants 24 × 5). Round 6 (the builder, the verifier's probe v3 on the round-6 tree): every part's rows, 60 Hz included, sorted-identical to the round-5 verifier's round-5 rows (3,464 rows, 2,944 of them non-60 Hz: 0 differences from 60 Hz, as before); the round-6 verifier re-ran it on the round-6 tree: the same five sorted hashes (carry 051dfd7e, brake 5ae2d29f, the row's own lesson f2cf0f55, release e3677a51, bikelane variants f0bcf971), 0 rows differing from 60 Hz. Product-input FUZZ (round-6 verifier): the scene's own frame callback and step-loop grade, cut WITH the refusal, on a real GradeGrid and a real CabinControls — 500 seeded drives, 60,198 frames of 0–30 steps with deltas not tied to the step count (3 % of them 0.5–3.5 s), 3,013 paused frames, 400,231 steps, cold/ready × locked/live, random presses and holds of all 19 keys through the cabin's own handlers, its public controls, pedals, blocked presses, a disowned pedal and tier switches: every point graded once and in order, every stepping frame reaching its call once, every frame end the previous one plus the clamped delta, the shells posed from every point before the next step, every look handed out in a live frame heard in the order handed out — 0 violations.
  - A 0.37 s hitch at 15 positions around the contact; respawn at point 607 on 4 cadences (shell speed stays 7.2 m/s; 3,444 m/s with the respawn ignored).
  - Replay catalogue, 2,434 cells at 60 Hz: base against the round-3 tree, 4 digest differences, all sc-vu-bikelane-turn mistake-cut-path (L1, L2, L3, L5), and in each only `nearMisses[1].kind` «vehicle» → «cyclist» (the rider); the debrief text is unchanged there (its closest near miss is the pedestrian). Round 2's tree had 0 differences: these four are the near-miss half of the one-kind change. Round 4 against round 3: 0 of 2,434; round 5 against round 4: 0 of 2,434 (builder and round-5 verifier); round 6 against round 5: 0 of 2,434, the catalogue and collision files byte-identical (against base the same 4 cells).
  - Cost per grid point. The shell pool: 0.16–0.56 µs with no agent in range (no body writes); about 1 µs with all 12 shells bound and moved (shared machine; the round-2 verifier measured 0.24–0.44 and 1.1–3.8 µs beside another lane, the round-3 verifier 0.22–0.30 and 0.82–1.00 µs, round 4 144 ns / 675 ns, the round-4 verifier 218–234 / 711–794 ns). The grid clock's `last` through the read view 19–26 ns against 7–11 ns on the clock itself, read once per physics step by the step loop. THE THREE GRADED QUERIES (V4-3): round 4's form (a method, a cache check, two Sets per state) was MEASURED by the round-4 verifier at +0.15–0.25 µs per graded point (+20–30 %) over base on the six busiest built rungs (tree median 0.91–1.10 µs, base 0.74–0.84 µs) — not «equal within noise», as round 4 had written. Round 5 removed the second lookup (one Set per predicate, the base predicate's shape). Builder (the round-4 verifier's probe, the six rungs plus the bikelane rung, shared machine, trees alternated): base 0.70–0.74 µs, round 4 0.97–1.01 µs, round 5 0.82–0.90 µs; control — the lane's tree with the base's marker predicate restored measured 0.85 µs against base 0.73 µs, so the residual ≈ +0.1 µs is not the predicate. Round-5 verifier (same probe, trees alternated twice): round-5 tree median 0.65 / 0.89 µs, base 0.67 / 0.69 µs — within noise to about +0.2 µs. THE GRID'S SEAL (round 6): the grid's per-point cost with a stub world (60,000 points × 7 repetitions, median), the round-5 grid and the sealed grid run ALTERNATELY three times each on a shared machine: round 5 447 / 489 / 525 ns, sealed 446 / 470 / 472 ns — no measurable difference (three earlier SEQUENTIAL runs of each — round 5 338 / 341 / 382 ns, sealed 414 / 418 / 444 ns — were not reproduced when alternated; the round-6 verifier, running the round-5 and the sealed grid INTERLEAVED in one process, 60,000 points × 9 alternated repetitions, three runs: round 5 876 / 641 / 527 ns, sealed 899 / 619 / 519 ns median — no measurable difference). A slow display now pays per step what it paid per frame.
  - Mutants. Builder, round 6: 113 — the round-5 set of 86 re-run on the round-6 tests, and 27 new — each applied alone and restored with sha256 verified (115 restores: P4, Q2 and Q3 ran a second time on the final tests; 0 mismatches); ALL KILLED, every one with a failure other than the two tools/ ENOENTs. New: the round-5 verifier's P1, P2, P3, P5, P6, P7 and the builder's variants P1d (destructuring), P1s (a `const paused` shadow), P1r (RuntimeDriver's render writing the prop), P3l (`let taken`), P3m (the frame nulling `stepTrackRef.current`), P3r (the step loop rewinding `taken.stepCount`), P7c (computed), P7a (an alias), P7o (`Object.assign`), P7r (the step-loop ref emptied), H1 / H2 (`gradeTakenSteps` swapping its `steps` / returning early) — each on the N11 or N14 refusal's text; P4 (the inline exception) on the executed N16 drive and §7 (13 failed); D1–D4 (the frozen prototype, the non-extensible instance, the two non-writable clock fields, each removed) on grade-grid-clock-readonly §4; the builder's own placements outside the named classes — Q1 (the frame's look dropped while the hazards are on: a write to the frame's sample, which the round-6 cut did not guard; since integration its spelling, `sampleRef.current.mirrorGlance = null`, is refused by N14 f), Q2 (the frame end rewound: `tRef.current -= delta`), Q3 (the in-loop cabin refresh skipped while an indicator is on), Q4 (an ALIAS of the step record read off its ref — `const rec = stepTrackRef.current; rec.record(…)` — recording a fake step) — on EXECUTED drives only (N16, step-loop-grade §2; Q1 first died only on a source pin and the branch census until the N16 rig was given VehicleRig's frame order — the cabin's clocks after the steps, then the frame's look — after which it dies on the N16 drive). Of the 113, 31 die on a refusal alone (structure), the rest on executed assertions (some on both). Round-5 verifier (fast set, 12 files, 278 tests): F1–F6, R1, SL1, P5, P6 on the N11 refusal; R1b (80), R1c (73), R3 (14) on executed assertions; P2 on 6 text pins; SURVIVED then: P1, P3, P7, P4 — since round 6 P1, P3, P7 (and P2) die on the N14 refusal and P4 on executed drives, P4 remaining by design the exception limit (not refused). Round-6 verifier (fast set, 12 files, 319 tests; each restored and sha-verified): P1 (27 failed), P2 (28), P3 (27), P5, P6, R1, F1–F6 (27 each), P7 (28), R1b (28), R1c (29), SL1 (28), G5b (28) on the refusals' text; P4 (13), R3 (19), G1 (4), G2 (31) on executed assertions; own A1 (`paused ||=`), A2 (a direct `eval` writing `paused`: the free-name refusal), P2v (`Object.defineProperty(stepTrackRef, …)`), P3v (`Reflect.set(stepTrackRef, …)`), P5v (a `return` in `do … while`), P7v (`Object.defineProperty(gradeGrid, "stepPhysics", …)` in the scene's render: the seal's source census) and B3 (the fill installs a wrapper: the executed reconciler unmount test and the fill's 3-statement pin) killed; SURVIVED (new classes, conditions): V1 (fast and 87-file wide set) and NS1b (fast set) — «What the structure did not follow». Integration (2026-10-16, the integrated tree, fast set 12 files, 335 tests clean): V1 and NS1b, the verifier's texts verbatim, each applied alone and restored with sha256 verified (VehicleRig.tsx c188759a…, LessonScene.tsx 9ab18086…): each 27 failed and two files refused at collection, on the V6-1 and the N14 (f) refusal's text respectively. The merge verifier re-ran both on the same set with the same counts and texts, and the lane verifier's P4 there (13 failed, on executed drives); its own X1 (a ReadyScene write, above) passed, 335/335.
- **Limits.**
  - Nothing was driven in a browser. The mounted chain (React's commit order, NpcColliders' layout effect, the rig's dispatch from inside a physics callback) is held by reconciler-executed cuts, not by a device. A device re-drive of the 08a0b701 kept cells (L4 H1810, L1 H1711, L1 H1707) on PC and the phone lens is OWED. The tools/ gate's answer on the extra read is above («One extra `GatedSimInput.read()`»).
  - The census drives a pursuit follower, not human pedals, and mounts no cabin; the branch and controls drives of §6 mount a real cabin (every key it binds, through its own key handler) but no chassis.
  - What the structure does not follow (a value read off a guarded object or ref and then written; a write inside a called procedure; a write to an unguarded object such as the session clock; a write to a ref the grading reads made outside RuntimeDriver, in ReadyScene or NpcColliders; what LessonScene hands the rig's `stepLoopGradeRef` prop) is caught only where an executed drive sees it — a condition under N17. The round-6 verifier's V1 and NS1b are closed by the integration pins (above). An exception raised before the graded call — inline or in a called procedure — is not refused, uncaught, and visible only in the console.
  - Rig evidence captured before this amendment is comparable step for step on PC ONE-STEP frames only; not on the phone lens and not on PC two-step frames.
- **Landing (integration, 2026-10-16, on 9390622).** The round-6 hand-off rebased on 9390622 (`npcstep-result-r6-on-9390622.patch`, sha256 56d4ed13…; it differs from the lane's cumulative `npcstep-result-r6.patch` e38d7702… only in lessons/scenario/__tests__/rapierContactDrive.ts, the union with 65be020's `onStep`) applied with no 3-way merge and no conflict. Pins added at landing, tests only: V6-1 and V6-2 above (sceneGradeCut.ts; scene-frame-grade.execution §5c, and §3's O2 now asserts the N14 f refusal), each mutant re-run red on the refusal's text. The landing is that patch, those two test files and this ADR text. The integrated tree was proven as the gate patch sha256 ec00797b… (34 files), which carries an earlier wording of this ADR text; this wording was corrected after the merge verifier's check and differs from it in docs only. The merge verifier found every product file equal to the lane's, byte for byte. On the integrated tree every test directory the integrator ran was green, tsc stayed at its 21-error environment baseline, and the tools/ gate's 8 failures are the standing deck-captions freeze and 7 that come from the worktree's environment; count-agreement is still to be run on the main tree before the merge (doc 88). CARRIED, not settled by this landing:
  - the rig re-drive of the 08a0b701 kept cells (L4 H1810, L1 H1711, L1 H1707) on PC and on the phone lens is owed; row `sc-roundabout-entry:08a0b701` stays OPEN until it is driven — this landing closes no row (the Product Map count is unchanged, 21 open);
  - rig evidence captured before this change is comparable step for step on PC ONE-STEP frames only;
  - the with-flow rider's authored `extraRightOffsetM` −2.6 (its comment intended +2.6; it rides at y ≈ −1.46, not the south curb line −6.66) is carried to triage «vru2offset» — a content question, unchanged here.
- **Still frame-timed after this amendment.** The cabin's channels and pedals for a frame's last point and for every point at ≤ 1 step per frame; the cabin clocks and the stall timer on the render delta (now seen by the frame's last point only; A13 still owed) — and so how many looks a HELD mirror yields (round 6, measured: on the controls drive the cabin hands out left, right, rear, shoulder, rear — 5 looks at 1, 3 and 7 steps per frame, 6 on the mixed run, 7 at 30 steps per frame, a held mirror refreshed once more on a long frame; every one heard); the moment a look is sampled (and a look made during a pause is not heard); the pre-drive steps, a manual finish and an abort; reverseAssist and the two stuck watches; the lee; the thump, haptics and impact cut; everything drawn.

**Amendment 2026-10-18 — a contact's impact speed is the closing speed the contact step's solve receives, not what the solve leaves.** Lane `impactspeed`, round 1, row `l0-free-drive:ee9d9374`; SIGNED OFF WITH CONDITIONS; landed with the commit that carries this paragraph (doc 88). Not a founder ruling. It closes no row: the evidence is in process only, and the device re-drive below is owed.

- **What it corrects.** Three passages of the 2026-10-11 amendment:
  - in «What is true now», «Recorded per step», the words «and the relative speed after that step» now read «and the impact speed defined in the 2026-10-18 amendment»;
  - under «Two things this amendment does not settle», the item «The impact speed is read after the contact step's solve, on base and tree alike. That is a latent defect that needs its own lane or a ruling (doc 88).» is closed by this amendment;
  - in «No rule or threshold changes», the sentence «At 60 Hz the impact speed is the number base read; the verifier reproduced that for static obstacles only.» is superseded. The rest of that bullet stands.

  The 2026-10-11 item «so the other body's share of the judged impact speed is the frame's too» was already superseded by the 2026-10-13 amendment.
- **Why.**
  - Base read the chassis `linvel()` after `world.step`, at the contact step. That is the velocity the solve left behind: the stop and the bounce.
  - A head-on façade crash at 50.1 km/h read 5.50, and the hz block at 41.8 / 51.4 / 70.0 km/h read 4.86 / 6.01 / 8.51.
  - So at the 10 km/h street tolerance (the curriculum, the полигон, lex-exam-1 and the exam bank) none of these crashes was graded or billed, and none ended an exam. The thump, the haptic, the shake and the impact cut played at rebound strength everywhere.
- **Decision.**
  - The impact speed of a contact begun at step k is |v_chassis − v_other| × 3.6 km/h.
  - v_chassis is the chassis velocity as `update()` hands it to step k's solve. It is `VehicleSim.solveStartVel`, written at the end of every `update()` as a pure read: after `updateVehicle` (the wheel impulses), before `world.step`. `reset()` zeroes it. The forces `update()` accumulates (aero drag, crosswind) integrate inside `world.step` itself; the verifier judged that negligible.
  - v_other is the struck body's velocity over the step: zero for a fixed body, and for a kinematic shell its agent's one-step velocity (Amendment 2026-10-13). The chassis is the product's only dynamic body, so the solve does not change v_other.
  - The magnitude is kept, not the share along the contact normal.
  - A collider with no body reads |v_chassis along the car's forward axis|. The product has no such collider.
  - **The stated tolerance is 0.541 km/h** between the reading and the car's speed in the step record after step k−1 (the approach). It is derived from one step of the full service brake: BRAKE_FORCE_N / CHASSIS_MASS / 60 × 3.6 = 11000 / 1220 / 60 × 3.6. It is the tolerance the new test holds façade, block and touch readings to, not a bound on every input; a held parking brake is 13,000 N. Against an independent pre-solve read, the hz STARTED audit holds the reading exactly.
  - **Unchanged; they now receive this number:** `hearChassisContact`, `gradedContactMinKmh`, the `>=` comparison, `COLLISION_MIN_KMH` (10), every `collisionMinKmh`, the district-surface tolerance, and the thump, haptic, shake and cut curves. No rule, point value, copy table or shown sentence changes.
- **Alternatives rejected.**
  1. The speed projected on the contact normal. It reads sideswipes below what base read, which de-convicts scrapes, and the trimesh's first-step normal is edge-noisy.
  2. The car's own forward speed at step k−1. It ignores the other body, so a moving road user striking a standing car reads 0.
  3. Keeping base's number. That was the 2026-10-11 amendment's choice, made so as not to move 60 Hz sheets, but it measures the rebound.
- **Boundaries.**
  - VehicleSim owns the snapshot and the read (`forEachChassisContact`).
  - Nothing between `update()` and `world.step` writes the chassis velocity. Outside tests, every impulse and force write (the aero and crosswind forces, the roll torque, the road-roughness and anti-roll impulses, `updateVehicle`) is made inside `update()` before the snapshot, and `reset()` is the only other writer. This was checked by the verifier's grep at `1f1536d` and by the integration reader on `e58f388` + the patches.
  - `traffic/playerTrack.ts` still owns the contact record. `StepContact.impactKmh` is documented as this speed.
- **Reproduced by the verifier**, in process at 60 Hz:
  - **Through rapier → VehicleSim → the step record → GradeGrid → VehicleRig's ear → LessonScene's own `handleCollision`:**
    - a head-on façade crash at 49.986 km/h reads 50.003 on l0-free-drive, lex-exam-1 and EX-A-D1-0000 (base 5.54). It is graded, billed COLLISION and ends the session;
    - l0-free-drive at 18.68 / 18.78 km/h reads 18.70 / 18.80 (base 1.87 / 2.13);
    - oblique ±15° at 40 km/h reads 40.01 / 40.03.
  - **Moving shells, in raw rapier + VehicleSim** (a kinematic shell on a flat world), reading the closing speed: a standing car rear-ended at 30 → 30.00; head-on 40 against 20 → 61.78; a car at 9.7 km/h and a 30 km/h crossing shell → 31.53.
  - **A same-direction closing speed, in a census cell the verifier re-drove:** sc-sig-green-wave/shadow-correct, 49.86 into a 33.4 km/h car → 16.53 (base 1.89).
  - **Census, recomputed from the builder's files, with four street cells re-driven:**
    - every tape × every rung (2,434 cells): 0 bill or sheet changes;
    - at the street tolerance (503 tapes): 18 COLLISION bills gained and none lost. Each is a physical crash at 11–62 km/h closing speed (the builder).
- **Consequences.**
  - **A standing student struck by a moving body now reads that body's speed.** At the street tolerance, a strike at 10 km/h or more bills COLLISION (опасна), with no attribution of fault.
    - On `1f1536d` the verifier read a post-integration clamp in `traffic/vehicles.ts` that keeps ambient traffic from closing on him, and its spawn census of 21 lessons found no contact.
    - Since `e58f388` that clamp is gated by `!studentBows`. At a signalised junction box, a car across his bows, or committed past his waiting point, is refused only a step that would overlap the two bodies. That case is unmeasured.
    - Scenario rungs bill any contact, as before.
    - See doc 88, condition F4.
  - **What the student hears and sees of a crash plays at crash strength.** At 50 km/h: thump 1.0, haptic [160, 40, 64], shake 0.04 rad, and the chase cut in both modes. These are the builder's numbers, in process; the new test, which the verifier ran green, asserts them. The mutants that feed the old number to the cut, the haptic or the thump are each killed on assertion text.
- **Pins.**
  - `impact-speed-before-solve.test.ts`: 14 tests, 13 red on base on assertion text.
  - The hz STARTED audit's exact, independent pre-solve read. It alone kills a snapshot taken before the wheel impulses, because that mutant sits inside the tolerance.
  - The v_other half (F3): `vehicle/impact-closing-speed.test.ts` (pinned at integration), three moving-shell cases read through `recordPhysicsStep` → `PlayerStepTrackRecorder.contactsAtStep`, each held to the closing speed within 0.541 + 0.1 km/h; dropping the struck body's velocity turns all three red.
  - Unpinned, and unreachable in the product: the body-less branch and the reset zeroing (verifier V4, V10).
- **D6 stands.** Nothing here was driven in a browser. The device re-drive on PC and the phone lens of a 50 km/h façade crash on l0-free-drive and lex-exam-1 is owed (doc 88).

## ADR-015: A pass is judged by what the overtaken vehicle really had to do

**Status.** Accepted by the integrator under the founder's delegation of 2026-10-08 (doc 88, «Founder delegation», item 2: restage the truck-pass
lesson). Its bills come from the integrator's decisions D1–D2 of 2026-10-08, made under that delegation, which extend to this lesson the founder
ruling 2026-09-30 «bill the forced braking» (made for the lane-drop lessons) and the 0.3 m/s account of the 2026-10-05 roundabout ruling. It is not
itself a founder ruling. Lane `truckpass`, rounds 1–3, each adversarially verified; round 3 SIGNED OFF WITH CONDITIONS (row
`sc-ac-wind-truck-pass:ff1d4290`). It is a new ADR, not an addendum to ADR-012. It discharges the ADR-012 addendum owed since round 1: ADR-012 lists
this lesson's staging as owed, and the lee here multiplies ADR-012's one force without changing its pull law. It runs on ADR-014's grid: it was
merged onto gate 1 (ADR-014) and checked there (doc 88). Landed with the commit that carries this entry.

**Context.** The restage puts the truck on a scheduled cruise at 40 км/ч, under the 50 км/ч floor for the overtaking lane. That makes the pass real,
and with it the return in front of the truck, the act that step 8 teaches. The truck's guard brakes at `HOLD_DECEL_MPS2` 8 m/s² for anything inside
its reach: `GUARD_AHEAD_M` 16 m ahead of its centre and `GUARD_LATERAL_M` 3.0 m either side of its line, which is 10.23 m between bumpers. The
lane-drop measure of what an entry demands is 0 by construction when the student is the faster car. The bill must therefore read what the truck did,
from its own traffic-model account (`StagedActorView.playerShedMps`).

**Decision.**
- **The watch** (`CutInLeadCarRunner.stepOvertakeWatch`, `orchestrator/runners.ts`) opens on the first grid point at which any part of the car is
  over the truck's lane and the car is no longer wholly behind it: the car's centre within 4.06 + 0.85 = 4.91 m of the truck's line. It closes «clear»
  only when the return is FINISHED. Five conditions must hold together, without a break, for `settleNeedSec`:
  - (1) the car's centre is within 3.0 m of the truck's line (`establishedHalfWidthM` = `GUARD_LATERAL_M`, inside `laneKeepMaxOffsetM` 3.25);
  - (2) its heading is within 15° of the truck's (`establishedHeadingDeg` = `TURN_REARM_DEG`);
  - (3) there are at least 10.25 m between bumpers (`clearBumperGapM`, just outside the guard's 10.23 m reach);
  - (4) its speed along the road is not below the truck's;
  - (5) the truck's account is not growing.
- **The settle time** is how long the truck takes to drive its guard's whole reach: 16.0 m / 11.11 m/s = 1.44 s. «clear», «overtaken», task 2 and
  the lane-change praise are decided only when the watch closes. Leaving the lane closes the watch with «lift» or «clear» and no credit.
- **HARD** is the product's own harsh-brake rule as a pure step, `stepHarshBrakeTrack` in `rules/harshBrakeEpisode.ts`. `BRAKING_LINE_MPS2` and
  `HARSH_BRAKE_TIE_TOLERANCE` moved there, and the engine imports them. The rule:
  - deceleration is read as a 0.04 s windowed derivative;
  - frames at 7 m/s² or more must add up to 0.4 s or more;
  - the window's mean must be over 7 (exclusive);
  - the window re-anchors when its mean is not harsh, and resets when braking falls under 2 m/s².
- **What HARD reads.** The step is fed the TRUCK's speed, against its speed when the watch opened. The 35 км/ч onset floor is not applied: it exists
  to forgive a student's own low-speed stab, not to judge another vehicle. A hard brake is attributed to the student only when the speed shed in that
  harsh window is also on the truck's account of speed shed because of him.
- **What HARD bills.** It answers «braked» and bills LANE_ENTRY_FORCED_BRAKING (опасна, billed at once). The engine re-checks the published window
  with `isHarshBrakeWindow`. The attempt is spent until the car drops wholly behind the truck.
- **LIFT** means the account grows by 0.3 m/s or more (`OVERTAKE_BRAKED_SHED_MPS`, the brake-lamp size ADR-011 uses) and the brake ends without
  being hard. «lift» is published once per watch. The engine withholds the praise (`withholdLaneChangePraise`) and bills OVERTAKE_RETURN_TOO_EARLY (doc
  72 OV-09, основна, чл. 42, ал. 1, т. 2) with detail overtake-return. A lift is never billed as forced braking. Task 2 is credited if the return
  then finishes.
- **The lee.** `createRigWindShelter` in `vehicle/windShelter.ts` holds the shelter in the rig:
  - it follows the prop on every render;
  - it is stepped into the sim before `sim.update`;
  - if the prop goes away after a lee was set, it gives the open wind back once;
  - the test harness uses the same object.
  The shelter multiplies the one ADR-012 force, with a residual of 0.30 and a wake of 13 m (inside the 14.0 m FOLLOWING_TOO_CLOSE line). It exists
  only where a lesson authors `physics.crosswind` and stages an actor with `windShelter: true`. Today that is this lesson alone.
- **New vocabulary.** All of it is opt-in:
  - the SimTickEvent `laneEntryAnswer` (watching / clear / lift / braked, with heldSec and qualifiedSec);
  - `StagedActorView.playerShedMps` and `stateId`;
  - `CutInLeadCarSpec.overtake`, `ReachZoneParams.stagedPass` and the outcome details drewLevel / overtaken.
- **On ADR-014's grid.** The watch and the harsh-brake step read the truck and the car at the fixed 1/60 s grid point, never a frame-end pose. The one
  exception is not graded. The lee, stepped before each physics step, reads the truck's newest grid state, so inside a long frame it can be up to one
  frame stale. It is a physics input only, and nothing graded reads it.

**Alternatives rejected.**
- **Round 1:** credit task 2 when the gap reached 10 m. Refuted: a return 3.0–6.5 m ahead made the truck brake at about 8 m/s². The gap reached 10 m
  only because the truck braked. The return was praised on its entry frame and credited about a second later, with 0 т. and 3/3 at every rung.
- **Round 2:** answer «clear» when the gap was ≥ 10.25 m and the account was not growing on that frame. Refuted: a car returning slower than the truck
  got «clear» on the very frame the watch opened, and the truck braked 0.6–1.6 s later (slow51b36g18: 35.7 км/ч, 10.94 m, truck 40 → 28.6 км/ч;
  passed 3/3). Its «hard» had no hold time, so it also billed a harmless step: a car pulling away 9.13 m ahead at 49.7 км/ч cost 10 т. and the
  lesson for a truck that lost 1.44 км/ч.
- **A bare >= at the 0.4 s tie.** 24 frames of 1/60 s summed to 0.39999999999999997 on one tape and 0.4000000000000001 on the next.

**Consequences.**
- **TP-1.** An exact 0.4 s hold counts as held, with the 1e-9 relative tie tolerance. A float summation artefact never decides a verdict.
  - The cut still sits on the 24th frame of the guard's 8 m/s² brake. On the verifier's tapes, 0.12 км/ч of truck speed separated «10 т., failed»
    (slow51b36g18@L1) from «0 т., passed» (G80g13b30@L1).
  - The engine's own HARSH_BRAKING_NO_CAUSE reducer keeps a bare >= at that tie. It judges the student's own braking, so aligning it is owed
    elsewhere, not done here.
- **Confirmed as built (TP-2..4):**
  - a lift is coached the first time on practice rungs, costs 3 т. at L4, and is not the lesson's own mistake (Ruling A does not reach it);
  - a lift followed by a hard brake in one unfinished return bills both. This holds by construction; no measured tape does it;
  - a car that comes back slower than the truck and stays slower never finishes the return, so task 2 stays open.
- **TP-5 (C3-02).** Nothing is read after the watch closes. A clean return followed by a brake-check that makes the truck brake harshly stays
  credited and praised. Billing a brake check that put the follower at risk is owed to the tailbrake lane.
- **TP-6 (C3-03).** The kinematic laneEntered basis (`laneEntryForcedBrakingEnabled`) also bills a slower car that swerves in at the truck's nose
  before the truck reacts. Accepted: on every L1–L3/L5 run the verifier drove, a COLLISION followed within 1.9 s, and at L4 the session ends at the
  bill.
- **TP-7.** The reviewer-facing N38 rationale for LANE_ENTRY_FORCED_BRAKING no longer limits the second basis to the faster car.
- **The merge onto ADR-014's grid** left two items owed elsewhere (doc 88):
  - the live shell folds a grid point's staged outcomes before that point's tick, while the replay folds them after it (owed to the truck-pass lane);
  - on the clip-truck demo the near-miss meter reports the truck it has just hit as a near miss (owed to the near-miss owner).
- **Not driven in a browser.** Every number is in-process: VehicleSim under rapier, the live rung chain, and the real traffic system and director
  with a kinematic car. The rig's lee wiring is held by a source pin and an executed test of `createRigWindShelter`, not by a browser frame. The gust
  chip's state machine is unexecuted. The row stays open until a drive through the rig on both lenses and a re-capture of the clips.

## ADR-016: The follower's braking is what bills a brake check below the 35 км/ч floor

**Status.** Accepted by the integrator. Implemented 2026-10-09 in 59be0de and recorded 2026-10-10. Lane `tailbrake` ran two rounds, each adversarially verified. Round 1 was REFUTED. Round 2 was SIGNED OFF WITH CONDITIONS: row `sc-follow-tailgater:63c0c28c`, critical, row clauses C1 and C2a; patch `tailbrake-result-r2.patch`, sha256 3cb8db66…, 10 files, cumulative against c38086a.
- **Where it comes from.** It applies the integrator decision recorded in rig-w2 and told to the founder on 2026-10-08. That decision takes the principle of two founder rulings and applies it to a staged close follower. The rulings are «bill the forced braking» of 2026-09-30 (made for the lane-drop lessons) and its roundabout companion of 2026-10-05. The principle: a conviction about another car rests on what that car actually had to do. This ADR is not itself a founder ruling.
- **What it changes.** No speed threshold is added or moved, and no shown sentence changes. The one new authored value is FTG_LEAD's floor (below), and it equals the lead's existing cap. This is a contract change in the ADR-015 family: one new SimTickEvent and the engine reading it. It runs on ADR-014's grid.
- **Why it is late.** The round-1 builder proposed it as ADR-016, and it has been owed since the landing. This entry discharges that.

**Context.**
- **The floor.** HARSH_BRAKING_NO_CAUSE bills only from `harshBrakeMinSpeedKmh`, 35 км/ч («low-speed stabs are clumsy, not dangerous»). The onset speed is read on the harsh window's anchor frame, one frame after the pedal. The round-1 builder puts that at about 0.6 км/ч below the speed at the pedal on a 9.5 m/s² stop.
- **Where the floor is wrong.**
  - The rig-w2 judge photographed a full-pedal brake check with the лепка of `sc-follow-tailgater` 8.5–8.9 m behind, made from 32.3–34.9 км/ч. It escaped entirely: no card, «ИЗДЪРЖАН» ★★★, «Чисто и спокойно каране».
  - The same pedal from 38.4 км/ч failed the lesson.
  - The lesson's own task 1 says «дръж под 36», so the student who obeys it is the one the floor hides.
- **What the car behind did.** The round-1 builder measured this at c38086a through the live rung chain, on a tape of the rig's mode-T drive with brake checks from 32.3 and 34.9 км/ч (40 cells):
  - On the 23 cells where the лепка was still glued behind him, it braked at a mean 9.77–10.04 m/s² over 0.4 s and shed 3.9–4.0 m/s.
  - On the other 17, its pass had already begun.
  - Nothing was billed on any of the 40.
- **Why the engine could not see it.** `RearTailgaterRunner` published nothing, so the engine had no way to know that the car behind had been forced to brake.

**Decision.**
- **The report: `followerBraked`** (`rules/types.ts`, a new SimTickEvent). It is a report, not a verdict. Its fields:
  - `vehicleId`;
  - from the harsh window the follower's own speed went through: `decelMps2` (its mean), `heldSec` and `qualifiedSec`;
  - `shedMps`;
  - `speedMps`, the follower's speed at the start of that window (its speed now plus `shedMps`);
  - `gapM`, bumper to bumper on the frame of the report.
- **Who publishes it.** Only `RearTailgaterRunner.stepFollowerAccount` (`orchestrator/runners.ts`), and only while the car is GLUED. Glued means all three of these hold:
  - it is latched in the лепка pose;
  - it is under its `matchPlayer` law, either before the pass is commanded or in a passShiftM-0 pass kept as a station. That law's only input is the student's pace and the gap to him, so every m/s it sheds there is shed because of him;
  - the student is ahead of it in its lane (`playerAheadInActorLane`). A view without a lane width answers false, so nothing is read.
- **How the account runs.**
  - Any frame on which one of the three conditions fails restarts the account.
  - A car that is un-glued and later glued again starts from the speed it has at that moment.
  - The runner reports once per braking episode.
  - It reports nothing without a published state id.
- **What decides «had to brake hard».** The product's own harsh-brake rule decides it: the same line the student's own brake is judged at, not a new line.
  - The runner puts the follower's speed loss, measured from its speed on the first glued frame, through ADR-015's pure step `stepHarshBrakeTrack`. It runs on `OVERTAKE_HARSH_LINE` (runners.ts), which uses the engine's defaults: a deceleration over 7 m/s², held 0.4 s, mean exclusive, read as a 0.04 s windowed derivative.
  - The engine re-checks every report against the lesson's own config with the one predicate `isHarshBrakeWindow`, exactly as it does for `laneEntryAnswer`.
- **The floor-lift** (`rules/engine.ts`, «THE FLOOR LIFTS FOR A FOLLOWER IT PUT AT RISK»):
  - **Recorded as floored.** Some student episodes are causeless and emergency-grade by every other gate, and the floor alone acquits them. Such an episode is recorded as floored (`flooredSince`, `flooredAt`). Nothing is billed at that point, and without a report nothing ever is.
  - **When it bills.** It bills HARSH_BRAKING_NO_CAUSE once per pedal application (`flooredBilled`). The report must fall on or after the episode's window start and no later than `flooredAt + followerAnswerSec`.
  - **If the pedal is still down at the bill,** the episode is marked emitted. The praise gates then read it as billed, exactly as for a bill from over the floor.
  - **Resets.** A new pedal application resets the floored record. A cause that appears mid-brake clears it.
  - **Untouched:** the cause ledger, the mean and accrual gates, and the 35 км/ч floor.
- **The answer window is derived, not tuned.** `followerAnswerSec` = the follower's `speedMps` / `harshBrakeDecelMps2`, its own hard stop. This is the derivation the forced-braking bill already uses for `laneEntryAnswer`. For the лепка at 9.0–9.7 m/s it is 1.29–1.39 s.
- **The staging fix** (`templates-following.ts`, FTG_LEAD: `minMatchSpeedMps: 11.5`):
  - It uses the product's existing floor mechanism (sc-ov-crest-curve:b26aaa0b), set equal to the lead's own authored cap.
  - The lead therefore holds the constant 11.5 m/s cruise that three places already claimed: the template doc, instruction 4 and the sc-ftg-ease note.
  - Only `sc-follow-tailgater` uses FTG_LEAD.
- **Shown text.** None is added or changed. The bill uses the catalogue copy «Рязко спиране без причина» («…Внезапното силно спиране изненадва движещите се зад теб…»). It held on the bills the verifiers examined:
  - the round-1 verifier found nothing ahead within reach, and the car behind braking hard, on the drives it billed;
  - in round 2, every bill under 35 км/ч has a follower report behind it.
- **What stays unbilled:**
  - every brake from at or over the floor, which is unchanged;
  - every lesson without a car glued behind the student, which keeps the floor exactly;
  - a brake that has a cause, as the cause ledger decides;
  - gentle ease-offs at 1–5 m/s² (0 of 125 billed, 0 reports);
  - the lane-condition C1 class below.
- **Lane condition C1 (the verifier's C1, the round-1 F2): a brake check while the лепка's pass is already under way. INTEGRATOR DECISION: it stays unbilled.** The principle bills only when the follower was actually put at risk, and risk is measured by the product's own harsh line. The decision covers the whole class the verifier reported, which is wider than «pulling out, not braking»:
  - On the verifier's tapes it has 33 escape cells, with the pass commanded 0.03–0.41 s after the pedal.
  - In some of them the лепка, still in lane 7.2–8.0 m behind, brakes at about 9.3–10 m/s² for up to 0.38 s before it pulls out. Its in-lane loss is 3.78 m/s at L3 h25 y125 (56% of its 6.76 m/s), 3.75 m/s at L4 h32 y155 and 3.69 m/s at L2 h20 y170.
  - Its qualified time peaks at 0.383 s, under the 0.4 s sustain, so by the product's own line it was not forced.
  - The judge's two L1 tasks-first rig drives (32.3 and 34.8 км/ч) are in this class. At the pedal the лепка was already pulling out and accelerating.
  - **Pinned:** the 6-cell F2 row in `follow-tailgater-brake-check-under-floor.test.ts`. It holds the round-1 verifier's six cells, where the лепка sheds about 1 m/s and never brakes hard.
  - **Not pinned:** the wider round-2 cells above. They are decided but have no pin.
  - **Narrowed 2026-10-13 (see the update at the end of this entry).** Lane `tailbrake3` replayed these cells on `2e9268f`. The «Pinned» line above reads the six F2 cells as a лепка that «sheds about 1 m/s and never brakes hard». Measured by that lane's round-1 builder, five of the six were at the harsh line for 0.117–0.217 s, braking at about 10 m/s², and had shed 1.06–2.16 m/s when the timed pass began 0.13–0.25 s after the pedal: a hard brake cut short of the 0.4 s sustain by the pass timer. The same builder's table has two of the three wider cells (L3 h25 y125 and L4 h32 y155): the pass 0.40–0.41 s after the pedal, 0.383 s at the line, as this entry already records. Under decision E2 the pass now waits, and the five F2 cells and all three wider cells are billed on the round-5 tree (the verifier's named-cell replay). Of those nine cells only L4 30 y150 stays unbilled; so does the rig's tasks-first drive TASF348, whose pass was commanded before the pedal. The decision itself stands for a лепка whose pass was commanded before it was ever at the harsh line, or after its brake had been released for the sustain.
- **Lane condition C4 (the verifier's N4): the w71 three-stop leg. INTEGRATOR DECISION: the moved pin is ACCEPTED.** `follow-tailgater-brake-check-rates.test.ts` now reads `["coached","none","charged"]` at all 7 rates.
  - **Stop 3.** It is a full-pedal stop from 58 км/ч after the lead has left the 400 m road, with nothing ahead.
  - **Why stop 3 was acquitted on the 2026-10-04 tree.** It was acquitted with the lead 129–140 m ahead and closing at 4.6 m/s. The lead was there only because, tied to the student by matchPlayer, it had waited for him through his 8 s rest. A lead tied to the student is the mechanism round 1 was refuted on.
  - **Now.** The lead holds its own pace, so the global rule applies above the floor and HARSH_BRAKING_NO_CAUSE is charged. The builder reports STOPPED_WITHOUT_CAUSE charged as well. Under R1 the verifier's run of the row turns red with a lead at 135.5 m.
  - **Stop 2** (the lead at 209–213 m, still closing at 4.61 m/s) stays acquitted by the round-4 far-closing ruling.
  - The 2026-10-04 landing's line «stops 2–3 … acquitted like base» no longer holds for stop 3.

**Alternatives rejected.**
- **Moving or removing the 35 км/ч floor.** The principle reads what the follower did and adds no speed number. The floor stays for every lesson without a close follower.
- **Round 1 on the old staging.** Refuted.
  - On the verifier's tapes, 150 of 204 glued low-speed cells were billed and 54 escaped, at 20, 22 and 25 км/ч on every rung.
  - In every escape `causeSeen` was true. FTG_LEAD (matchPlayer, `followGapM` 150) mirrored the slow student (leadV 9.0 → 1.9 m/s), and the far-lead ledger stamped a cause the student had created himself.
  - At L4 those drives showed the unscoped «Чисто и спокойно каране».
  - Four of the verifier's seven mutants survived.
- **A lower lead floor of 9 m/s** (mutant R2). The lead still slowed from 11.5 to 9, and 39 of the 50 new lesson cells stayed acquitted.
- **A `scheduledCruise` for the lead.** It would put the speed in a second number beside `maxMatchSpeedMps`, which is the single value `following-claim-gates` checks the pace cap against.
- **A separate «still inside the window now» conjunct** (`t <= flooredAt + followerAnswerSec`, mutant MD). Every field the condition reads is written only on a frame where it is set to that frame's t, or is nulled, so the conjunct is provably equivalent. It was removed rather than pinned, and the verifier agrees with the proof.
- **Reading the follower after its pass is commanded.** At c38086a its pass guard was measured not to brake for a student who keeps to his own lane, so there is nothing of his to read.

**Boundaries.**
- `RearTailgaterRunner` measures and publishes, and nothing else publishes `followerBraked`.
- In the engine, `case "followerBraked"` only re-checks and records. The bill belongs to the harsh-brake detector.
- `rules/harshBrakeEpisode.ts` (ADR-015) owns the step and the predicate. The runner imports the step (`stepHarshBrakeTrack`), and the engine imports the predicate (`isHarshBrakeWindow`).
- The `contracts.ts` change (the `RearTailgaterSpec` doc) is comments only.

**Consequences.**
- **Reproduced by the round-2 verifier** (round 1 reversed, round 2 applied, its own probes). Under 35 км/ч, billed out of glued cells:
  - low sweep: 200/204;
  - dense, every hold from 20 to 35 км/ч, braking at y35–330, L1–L5: 379/395;
  - densetf: 190/197;
  - sweep: 94/100;
  - partial brakes: 48/52;
  - taskfirst: 65/66.

  Further results on the same tapes:
  - 0 escapes carry `causeSeen`, and FTG_LEAD holds 11.5 m/s through the pedal.
  - In every sweep, every drive with a follower report is billed, and every bill under the floor has a report behind it.
  - On each rung the bill takes the form of the over-the-floor brake check: a coached lesson mistake at L1/L2/L3/L5, charged at L4, never passed.
  - **Qualified 2026-10-13.** «Never passed» was the reading the round-2 verifier of lane `tailbrake` took from its own sweeps. It does not hold as a general statement: on the `tailbrake3` verifier's tapes 41 of 2,989 billed L4 drives are «издържан» when both tasks are done (a charged основна is 3 наказателни точки — the builder's reading of the sheet). Whether the original sweeps contained such a drive was not re-measured.
  - Across all 5,295 probe drives, no billed drive showed the unscoped «Чисто и спокойно каране». At L4 at early y, billed drives can show the scoped form («— но само на отделни отсечки…»). Over-the-floor L4 bills show the same form.
- **Census (the verifier).** Every template × committed demo × L1–L5, base c38086a against the tree, compared on violation code@t and a sha1 of the debrief: 2,515 cells, 81 of them the same ScenarioCompileError on both trees. Of the other 2,434, none differ.
- **Where reports appear (the builder's census).** 14 cells carry `followerBraked` reports.
  - In the sc-follow-tailgater brake-check demo (L1–L5) the bill was already made from 45.9 км/ч, and its time is unchanged.
  - In sc-merge-lane-end (no-indicator at L1–L5; push-out at L1–L3 and L5), reports appear but nothing is billed: the student's brake there is not a floored causeless episode.
- **Mutants.**
  - The builder: 23/23 killed on assertion text.
  - The verifier: 12 run. The round-1 survivors MA, MC and MF now die.
  - Two survive: X5 (the reference speed ratchets to the highest seen) and X7 (the report lags the pedal by 0.3 s). The verifier calls both near-equivalent, and neither reaches its stop rule. Both are owed.
- **The integrator's integrated-set gate.** The set: truck-pass round 3 + fix 1 + fix 2, meetcars, islandcoach, crashcam and tailbrake staged, run one directory at a time. 0 failed in every set:

  | set | files | tests |
  |---|---|---|
  | `lessons/__tests__` | 124 | 2,336 |
  | `lessons/scenario/__tests__` | 176 | 4,200 |
  | `components/sim/lesson-ui/__tests__` | 43 | 717 |
  | `orchestrator/__tests__` | 37 | 458 |
  | `rules/__tests__` | 97 | 1,765 |
  | `traffic/__tests__` | 37 | 441 |
  | `scene/` | 45 | 740 |

  - tsc is at the 21-error Prisma baseline.
  - The merge verifier reproduced `rules/__tests__` (97/1,765) itself. Its re-run of the other directories did not finish.
  - The lane verifier's own catalogue-wide run also did not finish.
- **ADR-015 TP-5 is NOT discharged by this ADR.**
  - Only `RearTailgaterRunner` publishes the report.
  - The truck-pass truck is staged by `CutInLeadCarRunner`, whose watch reads nothing after it closes.
  - So a brake check in front of the truck after a clean return stays unbilled. It stays owed.
- **Old frames.** Because of the mirroring, the w71/w69 recordings had the lead at 131–140 m at stops 2–3. On this tree the front lead is in a different place, so evidence that rests on those frames needs a new frame.
- **Not driven in a browser.** Every number above is in-process. `sc-follow-tailgater:63c0c28c` stays OPEN until a rig re-drive photographs two things:
  - the brake check under 35 км/ч, on the lens and level the row was filed on;
  - the phone lens for row clauses C2b (the guilty acceleration) and C4 (59 in a posted 50). w74 found a PC/phone split on both, and rig-w2 settled only the PC half.

  Expected on that re-drive:
  - An L3-like geometry, where the лепка brakes hard still in its lane, is billed. The judge's trail for pc-L3-brake-tasksfirst gives 9.0 → 1.65 m/s; the round-1 builder gives 9.0 → 3.2 m/s for the L3 rig drives.
  - The L1 tasks-first geometry stays unbilled under lane condition C1.
- **Owed.**
  - Pins for X5 and X7, or a recorded near-equivalence argument for each.
  - A pin for the wider F2 cells (L3 h25 y125, L4 h32 y155, L2 h20 y170).
  - A reading of the `n38.ts` HARSH_BRAKING_NO_CAUSE rationale against forced-follower bills. That rationale says a brake that creates a предпоставка would be COLLISION or CLOSING_ON_LEAD_TOO_FAST.
- **Open, for the founder or the integrator.** Should a causeless slam under 35 км/ч, with a car pulling out 8 m behind, withhold «Чисто и спокойно каране» even though it is not billed? The question includes the F2 cells, where the follower sheds over half its speed for up to 0.38 s.
  - As decided today, such a drive with no other fault keeps the unscoped praise.
  - The verifier saw this on L4 h32 y155 and L2 h20 y170. The builder saw it on L4 h28 y140, L4 h30 y150 and taskfirst L5 h34.9 y180.

**Five questions.**
1. **Learning outcomes.** A brake check is taught as the mistake it is, at the speed the lesson itself asks for.
2. **Safer drivers.** Yes. Braking hard at a car on your bumper is the act the lesson exists to prevent.
3. **Retention.** Neutral. No new card or sentence is added.
4. **Measurable progress.** In process, a drive that made the car behind brake hard by the product's own line no longer passes and no longer gets the unscoped «Чисто и спокойно каране».
5. **Business value.** It repairs a critical «a dangerous act is praised» defect, in process, without adding a speed threshold. The row stays open until the rig re-drive.

**Update 2026-10-10 (rig-w3b at 59be0de).** The rig re-drive left clause C2a OPEN: a 24.5 km/h full-pedal stab with the лепка glued 4.8 m behind (peak 9.22 m/s²; no follower report) still escapes as ИЗДЪРЖАН ★★★ (evidence `D:/knijka-lanes/scratch/rig-w3b/sc-follow-tailgater/attempts/pc-L3-TTF25-2026-10-10T0159/`). By the product's own line the follower had NOT braked hard: it was at the harsh line for 0.25 s, under the 0.4 s sustain, because its scheduled pass — a pure timer — came due 0.267 s after the pedal and took it out of a brake it had not finished. The follower's account was not the gap; it reads the лепка on every glued grid point. (Corrected 2026-10-13. As first written this sentence read: «The follower DID brake hard, so under this ADR’s own principle the case should bill; the gap is that `followerBraked` is published only from the follower’s report, which a swerve-out never sends.» See the update of 2026-10-13 below.) Owed at the time: repair lane «tailbrake3», keeping the F2 decision that a follower already pulling out stays unbilled. The direction first written here — publish from the follower's measured deceleration — was not what the lane found to be needed and was not built; see the update of 2026-10-13 below. The 35 km/h floor itself is not moved — that would be a founder decision.

**Update 2026-10-13 (lane `tailbrake3`, five rounds on `2e9268f`; integrator decision E2 of 2026-10-11; round 5 SIGNED OFF WITH CONDITIONS; patch `tailbrake3-result-r5.patch`, sha256 a2e66931…, applied 3-way on `8cb0707`; landed with the commit that carries this paragraph) — the лепка's pass does not begin while its own hard brake is not over and has not been reported.**
- **What C1/F2 said.** A brake check while the лепка's pass is already under way stays unbilled, because the principle bills only a follower actually put at risk, by the product's own harsh line. Six cells were pinned as that class.
- **What was measured** (`2e9268f`; the rig's own per-grid poses replayed through the live rung chain; the builder's measurement, reproduced by the verifier in round 2).
  - The follower account was never the gap: it reads the лепка on every glued grid point.
  - The pass was a pure timer (`tSec − latchedAt >= pressureSec`). On TTF25 it came due 0.267 s after the pedal, while the лепка was braking at 9.2 m/s². The cruise law then accelerated it at 3.5 m/s² toward a car stopping 4.8 m ahead (the bumper gap closing 4.80 → 4.45 m as it pulled out).
  - Five of the six pinned F2 cells were the same: the лепка at about 10 m/s² when its pass began 0.13–0.25 s after the pedal.
- **Correction to the 2026-10-10 update.** Its sentence «The follower DID brake hard» was wrong by the product's line. On TTF25 the лепка held the harsh line for 0.25 s, under the 0.4 s sustain, because the pass timer cut its brake short. The cause filed there («published only from the follower's report, which a swerve-out never sends») was also wrong: the car did not swerve out of a reported brake; its scheduled pass took it out of an unfinished one. The sentence is corrected in place above.
- **Decision E2.** That is a STAGING defect: no driver begins an overtake by accelerating at a car that is braking hard just ahead. So a due pass waits, the follower's hard brake is then reported by the product's own step, and the existing floor-lift bills. Round 1 changed no product line (its patch held a witness test and its fixture): its builder showed the filed cause was wrong and stopped for this decision. The rule then took four builds. Each of the first three got the START of the wait right and ended it on a bookkeeping state of the harsh step, not on the fact the wait stands for: the лепка's hard brake is not over yet. All counts below are the verifier's own tapes: kinematic students on the 1/60 s grid, the pedal walked across the timer, each drive also run in the world where the timer never comes due (`pressureSec` 90).
  - **Round 2 — held only on grid points whose reading is AT the harsh line.** REFUTED: 762 of 5,838 sub-floor brake checks escaped through an UNEVEN emergency stop (9.3 m/s² dipping to 5.0–6.5 for 0.05–0.10 s; 8 ± 1.5 m/s² at 5 Hz; a one- or two-grid-point release). The first reading under 7 m/s² released the pass with the car still braking.
  - **Round 3 — held through the step's OPEN window (`followTrack.lastQualAt !== null && !fired`).** REFUTED: 383 of 9,000 further tapes escaped. The product's step RE-ANCHORS its window once it has been open for the sustain with a mean not over the line, while the brake continues. Where the re-anchor fell on a reading under 7 m/s², the pass was commanded with the лепка still braking at 5.5–7.0 m/s².
  - **Round 4 — held until the step's RE-ARM, the first reading under the braking line («the released pedal»).** REFUTED: 980 of 6,444 new tapes escaped (tap–release–slam 700 of 1,548; one emergency stop with a dip 234 of 1,296; seeded random stops with releases 46 of 3,600). A further run of tap–release–slam at L1 and L4, outside those totals, escaped on 306 of 516 and 238 of 516. A release of three grid points (0.05 s) in the middle of an emergency stop, or an ease to 1.9 m/s² for four, gives the лепка one or two readings under 2 m/s²; the pass began on that dip or on the timer's next grid point. All 980 were «ИЗДЪРЖАН» with the unscoped praise; the no-timer world reports each 0.57–1.10 s after the pedal and bills it.
  - **Round 5 — the rule as built.** A due pass is held from the лепка's FIRST reading at the harsh line, tracked on every glued grid point, until one of three things:
    1. the product's step REPORTS its hard brake (`followerBraked` is out; the pass begins on that grid point);
    2. the brake is OVER: its reading has stayed under `BRAKING_LINE_MPS2` (2 m/s²) for the product's own sustain, `harshBrakeSustainSec` (0.4 s) — on the 1/60 s grid the 25th reading of an unbroken run under the line; any reading back at the braking line starts the count again;
    3. the car is no longer his close follower (the account starts a fresh track).

    It goes through any reading under the harsh line, any re-anchor and any release shorter than the sustain.
- **How it is built** (`RearTailgaterRunner`, `orchestrator/runners.ts`; read by the verifier at sha256 510c7316…).
  - Two fields of the runner's own, written in `stepFollowerAccount` from what the product's step did on the same grid point. The bit `ownBrakeReachedTheLine`: set when `followTrack.lastQualAt === tSec` in an episode the step has not reported; cleared when `followTrack.fired`, when the brake is over, and wherever the account starts afresh. The clock `ownReleasedSinceSec`: the first reading of the current run with `followTrack.anchorT === null` (the step leaves it null only on a reading under the braking line); nulled by any braking reading.
  - «For the sustain» is `tSec − ownReleasedSinceSec >= OVERTAKE_HARSH_LINE.harshBrakeSustainSec × (1 − HARSH_BRAKE_TIE_TOLERANCE)`: the engine's own constant read through the runner's existing line, and the product's own tie rule. There is no second 0.4. A test moves the default sustain to 0.3 s and 0.5 s before the runner loads and the hold moves with it; the mutant that writes 0.4 dies on it.
  - `ownHardBrakeHoldsThePass()` returns the bit; its negation is ANDed into the pass timer.
  - No number is added or moved: not the 35 км/ч floor, `harshBrakeDecelMps2`, `harshBrakeSustainSec`, the braking line or the follower margins. `rules/engine.ts` is byte-identical to base. No shown sentence changes. The bill is the existing floor-lift.
- **The hold has no bound in seconds, and that is the rule (integrator decisions 2026-10-12 and 2026-10-13).** After its own hard brake the лепка does not pull out while the car ahead is still slowing; it pulls out once that brake has been over for the sustain. A student who stabs the brake once and then keeps tapping it is not passed for as long as he does. That is intended: a tailgater does not pull out past a car that keeps braking. The builder's pin «NO CLOCK OF ITS OWN» stays. The reading is the лепка's own: once the лепка itself stands, its reading is 0, so a standstill is waited out by the sustain and no longer. The student's own standstill does not by itself end the hold.
  - **What bounds it.** The pass is commanded exactly 25 grid points (0.417 s) after the лепка's last reading at the braking line. Verifier: of 12,940 held passes on 15,060 new drives, 5,061 began on the report and 7,879 on that 25th reading; none otherwise. There is no other limit. A car that only slows can be waited behind for 4.5 s per m/s of its speed plus the sustain (the builder's scripted row: 38 s from 8.5 m/s). A car that keeps coming back to the brake inside every sustain and picks its speed up in between is waited behind for as long as it does that.
  - **Measured by the verifier** on kinematic tapes through the live rung chain.
    - 3.23 / 4.57 / 6.07 s behind a 0.1 s touch of the line and then 2.1 m/s² to a standstill from 24.5 / 34.6 / 45.9 км/ч. The pass is commanded with both cars at rest. Nothing is billed in the tree, the no-timer world or base, and all 1,890 sheets equal base's; the unshown outcome detail reads «yielded» instead of «clear» on 298.
    - 5.78 s behind a 0.1 s on / 0.43 s off pump from 34.6 км/ч.
    - After one 0.2 s full-pedal stab, brake taps (5 m/s² for 0.1 s every 0.35 s, the throttle in between, the speed kept): held 5, 10 and 20 s as long as the taps lasted; light coasting taps (2.5 m/s² for 0.05 s every 0.38 s) held it 15–23 s. On 10 of the 24 drives of these two forms the pass HAD NOT BEGUN WHEN THE LESSON ENDED. On all 24 the sheet (debrief and result) equals base's — «ИЗДЪРЖАН» with the unscoped praise in the tree, in the no-timer world and on base — and nothing is reported in any world. Only the staged event's outcome is missing instead of «yielded».
    - The lesson cannot deadlock on it: both objectives are reach-zones and do not need the pass.
  - **What the student sees meanwhile.** The лепка keeps its place on his bumper, under the same matchPlayer law as before the timer, with its left blinker on (the L6 lamp comes on 3 s before the pass is DUE and goes off 0.4 s after the pass has glided out). No caption or instruction names a time for the pass. Instruction 7 («…я остави да те изпревари — после продължи до края») stays true only in the sense that the pass comes once his braking has been over for 0.4 s.
- **F2 as it now stands.** Unbilled = the pass was commanded before the лепка was ever at the harsh line (the pass began before, or within the follower's reaction to, the pedal), or it was commanded after the лепка's brake had been released for the sustain.
  - **Before the pedal:** the rig's tasks-first drive TASF348 (commanded 0.083 s before the pedal in the verifier's replay, 0.08 s in the builder's; the лепка never brakes). On the verifier's 5,838 round-2 tapes: 834 such drives, 0 billed.
  - **Within the follower's reaction:** L4 30 y150 (the pass 0.013 s after the pedal, the лепка's reading 2.4 m/s²). The width is the pedal's own rise: up to 0.05 s on the rig's full pedal; 0.10–0.117 s on a 0.1 s ramp; 0.317 s on a 0.4 s ramp; 0.583 s on a 0.75 s ramp (the mouse pedal's `BRAKE_RISE_SEC`) — 210 of 300 such drives «ИЗДЪРЖАН» with the unscoped praise while the no-timer world bills all 300. On the verifier's 9,000 uneven stops 3,579 drives are this class (pedal up to 0.517 s before the command), all passed with the praise. Not narrowed, by decision.
  - **After a release for the sustain:** a student who taps (0.15–0.25 s of full pedal), lets go and slams is held through and billed when he is off the pedal for 26 grid points (0.433 s) or less — 1,512 of 1,512. He is passed, unbilled and praised, from 27 grid points (0.45 s) on: 840 of 1,080 such cells at L1/L3/L4 and 20–34.6 км/ч. The pass is commanded before he re-applies (636, up to 0.067 s before), on that grid point (168) or within two grid points after it (36, the лепка by then braking again at up to 5.9 m/s² but not yet at the harsh line). The лепка then accelerates at 3.5 m/s² behind a car braking at 9.3 m/s² (closest bumper gap 3.11 m, no contact). Across the verifier's 15,060 new drives 1,363 are this class, every one «ИЗДЪРЖАН» with the unscoped praise while the no-timer world bills it. (The builder's own search: 495 of 6,996 cells.) Written down as it stands, by decision; not changed.
  - **Corrected 2026-10-13 (rig-w3e, on the device).** «1,512 of 1,512» is a count on kinematic tapes, which hold the deceleration down to a standstill. The product car does not: a pumped brake check from 24.5 км/ч (0.2 s full pedal, 0.1 s off, full pedal to rest; the лепка glued 4.79 m behind) was NOT billed on PC or on the phone lens. The pass was held (commanded 1.19 s after it was due), but the лепка's two runs at the harsh line were 0.200 s and 0.283 s — each under the 0.4 s sustain — because the car's own full-pedal deceleration falls under 7 m/s² below about 9 км/ч. So under the floor a brake check made in two bursts is unbilled by the product's own definition of a hard brake. Whether two bursts should count as one is a question about that definition and is with the founder (doc 88, «rig-w3e»); the unscoped praise on such a drive is a false sentence and is in triage.
  - **The cells of the main entry.** Of its six pinned F2 cells, five are now billed (L1 28 y130, L3 28 y140, L4 28 y140, L5 25 y120, L5 30 y140); L4 30 y150 stays unbilled. Its three wider cells (L3 h25 y125, L4 h32 y155, L2 h20 y170) are now billed.
- **Never more than the no-timer world.** Until its pass is commanded the лепка is under the matchPlayer law, the law it is under when the timer never comes due. On every verifier tape set with a no-timer run — 40,680 drives: the 15,060 new ones, the 6,444 of round 4, the 9,000 of round 3, the 5,838 of round 2 and 4,338 others — 0 drives are billed that the no-timer world does not bill, every report is the no-timer world's report on its grid point, no brake from under the floor is billed without a report (18 pump drives are billed by his own ledger after the throttle took him back over 35 км/ч, as in the no-timer world), 0 drives are without a pass, and 0 bills are lost against round 4. Contacts: 0, except two drives of the swerve set in which the student steers into the passing car — the same two on round 4 and on base (base has eleven). The 24 brake-tap drives above and the 864 constructed fresh-track drives below are not among the 40,680.
- **Acceptance, measured in process on the round-5 tree by the verifier.**
  - Round 4's tapes: the 980 escapes are 0 (tap–release–slam billed 524 → 1,224 of 1,296; the dip 990 → 1,224 of 1,296; random stops with releases 373 → 419 of 587; at L1/L4 404 → 948 of 948). Every drive of the first three sets equals the alternative the round-4 verifier had measured, in every field. The 312 that stay unbilled had the лепка never at the line before its pass.
  - The 9,000 round-3 tapes stay at 0 (billed 4,603 of 8,182) and the 5,838 round-2 tapes stay at 0 (billed 3,762 of 5,082; the 1,320 others = 726 with the pass at or before the pedal + 594 never at the line). Every sheet equals round 4's; 840 of the 14,838 differ in the лепка's trajectory only.
  - New tapes aimed at this rule (releases of 20–31 grid points and eases to 1.9 / 2.0 / 2.1 m/s² between a tap and a slam; pumps with releases of 18–28 grid points; brake taps with the throttle in between; a second hard brake after a completed report; 200 seeded random stops with releases of 8–30 grid points and throttle; L1/L3/L4, 20–34.6 км/ч; 15,060 drives and as many in the no-timer world): 0 passes commanded while the лепка, at the harsh line since its brake was last over, was unreported and not yet under the braking line for 25 readings. A second hard brake after a completed report is held for again (174 passes commanded on the second report).
  - The tap–release–slam set re-run at 20 Hz and at a mixed frame cadence: 1,548 of 1,548 drives identical to 60 Hz.
  - All 26 rig drives and the 11 named cells are as in round 4: TTF25's attempt reports at 29.2833 s and is coached at 29.300 s, not passed, no praise; the TASF348 sidecar and L4 30 y150 stay unbilled.
- **At L4.** A billed sub-floor brake check is a charged основна, 3 наказателни точки (the builder's reading of the sheet), and the lesson CAN STILL BE «ИЗДЪРЖАН» when both tasks are done: 41 of the verifier's 2,989 billed L4 drives. No billed drive at any rung carries the praise.
- **Known gap outside this lane, not fixed here: the engine tie** (the round-3 verifier's C2, the round-5 verifier's C3; triage candidate «sustaintie»). On some drives the лепка's `followerBraked` is published and nothing is billed, because `rules/engine.ts` judges the student's OWN sustain ledger with a bare `>=` where the follower's account uses the tie tolerance. On the round-5 tree: 182 of the 9,000 (as on round 4), 77 of the 3,600 random stops with releases, and 321 of the 15,060 new drives; the no-timer world has more in each (350, 97, 395). The hold is not its cause, but the two meet. The hold ends at a report whether or not the engine bills it, so where the tie drops the bill of a first report, the no-timer world can still bill the same uneven stop on a later report and the tree cannot: 14 of the verifier's 3,600 random stops at L1/L4 (one shape), «ИЗДЪРЖАН» with the unscoped praise. With the tie tolerance put on the student's ledger (a measurement, not built) all 14 are billed on the first report and no reported drive of that set stays unbilled.
- **The third end, measured.** The account's lane test reads the lane the traffic system publishes for the лепка, 8.125 m, so «no longer ahead of it in its lane» begins 4.96 m to the side of its line. A student placed 4.94 m to the side who crosses that edge for 1–6 grid points in the middle of an emergency stop does end the hold with the car still braking at 9.3 m/s² (228 of 864 constructed drives; 99 of them unbilled though the no-timer world bills). The drives are constructed; no other tape set reaches it.
- **Scope.** Twelve templates borrow the runner. Census, base against tree, every template × committed demo × L1–L5 through the live rung chain: 2,434 cells (plus 81 identical compile errors), the verifier's census file byte-identical to base's — sheet, shown text, events, outcomes and every staged actor's trajectory (2,014 trajectories hashed). Tailgater family with outcomes applied: 174 cells in 12 templates, byte-identical (243 trajectories).
- **Pins.**
  - `orchestrator/__tests__/tailgater-pass-hold.test.ts`: the rule and each of the three things that end a hold; round 4's escapes by name; the tie (24 readings under the line held, 25 over); a firm brake between two releases restarting the count; a second hard brake after a completed report; the hold over the 35 км/ч floor; the three long-hold rows; the property row; the re-anchor rows; the station runner; rounds 2–4's shapes on the lesson's own car.
  - `orchestrator/__tests__/tailgater-pass-hold-sustain.test.ts`: the sustain is the product's constant, not a second literal.
  - `lessons/scenario/__tests__/follow-tailgater-uneven-brake-check.test.ts`: uneven brake checks against the no-timer world at lesson level, with the escapes of rounds 3 and 4 by name.
  - `follow-tailgater-brake-check-under-floor.test.ts` and `follow-tailgater-rig-w3b-ttf25.test.ts`: the F2 and wider cells and the three rig drives.
  - Red first: 63 of the 136 tests fail on base and 25 on the round-4 tree, all on assertion text.
  - Mutants (the verifier's own forms, one at a time): 54 run, 47 killed on assertion text, among them every mutant named in rounds 2–5 (release after one reading 22; after half the sustain 14; the clock not reset by a braking reading 22; the sustain as a second literal 2; hold only under 35 км/ч 1; no hold after a first report 1). Seven survived. Four are equivalent by argument (the bit, and the clock, not reset in `stage()`; the clock not reset on a fresh track; the bit set on `lastQualAt !== null`).
  - Three behaviours were NOT pinned at the verifier's sign-off: «over» counted only once the timer is due (8 of 756 tap–release–slam drives then gain a bill); «over» also needing his pedal off (the pass up to 1.12 s later on 962 of 1,260 gentle stops, sheets unchanged); and the hold ending the moment HE is at rest (no bill lost on 3,192 drives, 238 trajectories differ). Pinned at integration, in `tailgater-pass-hold.test.ts` («THREE THINGS THE HOLD DOES NOT READ, PINNED AT THE LANDING»): «"OVER" IS COUNTED ON EVERY GLUED GRID POINT, DUE OR NOT», «"OVER" DOES NOT ASK WHERE HIS PEDAL IS» and «THE HOLD DOES NOT END BECAUSE HE HAS STOPPED». Each mutant is red on its own row alone, 1 of 57, on assertion text, and was re-killed by the landing's merge verifier. They are pinned on the scripted port; no lesson-level sheet separates them.
- **Still open.**
  - Nothing was driven in a browser. Every number above is in-process. `sc-follow-tailgater:63c0c28c` stays OPEN until a rig re-drive of the rig-w3b TTF25 cell and of a pass-before-pedal control, on PC and on the phone lens, has been judged; whether its frames close the row is for that wave's judge and verifier.
  - Whether the product's pedals (keyboard, touch axis, gamepad, mouse) produce a 0.05 s release, the 0.45 s tap-and-slam or the brake-tap pattern was not measured.
  - The praise question of the main entry is unchanged for the unbilled forms (triage candidate «flooredpraise»).
  - From the main entry's «Owed»: the pins for X5 and X7 are still owed. The pin for the wider F2 cells is settled differently than written there: those cells are now billed, and pinned as billed.

## ADR-017: The drive rig is referenced to the physics step

**Status.** Accepted by the integrator on 2026-10-10. This is a technical decision, not a founder ruling: no rule, threshold or wording changes.
- **Lane.** `rigstep`, round 1, SIGNED OFF WITH CONDITIONS by its adversarial verifier. The conditions C1–C4 are carried below as limits L1–L4.
- **Patch.** `rigstep-result-r1.patch` (sha256 b84cd022…, 8 files, +1674/−62), built on 59be0de.
- **Landing.** It lands with the commit that carries this entry. The lane's regression (below) ran on 59be0de + rigstep alone. The run on the integrated set (with ltapnote r2, uturnedge r2 and praiselamp r1 staged) was cut by a PC restart, and it must pass before that commit.
- **Origin.** It comes from the read-only design review `adr016-design-review.json`: the attack's corrected ADR, sections D-1 to D-4 and D-6 (D-5, the review's A13, is carried as owed), and findings A4–A8, A10 and A15. The review numbered it ADR-016. It became 017 because ADR-016 went to the tailbrake `followerBraked` contract.
- **What it decides.** When the drive rig's command reaches a physics step, and where a rig script starts. It also confirms the frame-start rule for human input.
- **This is an INSTRUMENT change.** No session outside the rig changes behaviour. The step handle is dev-only, and a production bundle is checked for its absence. It repairs no product behaviour and CLOSES NO ROW.
- **Evidence.** The proof is in-process only. The rig has not been driven in a browser since the change.

**Context.**
- **What W81 settled.** W81 (integrator note 2026-10-10) judged `sc-rb-busy-gap:7bbdd45e` and `sc-roundabout-entry:08a0b701` in process on ADR-014's grid. On every cadence, one input gives one sheet.
- **How the rows were posted.** Both rows were posted PARTIAL and held open on (i) frame-timed pedals and (ii) a founder question.
  - 08a0b701: its verifier refuted the closure.
  - 7bbdd45e: its verifier did not refute the closure. The row is PARTIAL by integrator decision, on the same standard.
- **The live PC/phone difference on sc-rb-busy-gap's S drive was the go.**
  - On the phone lens the rig's go landed about 3 steps (0.05 s) later.
  - That moved the circulating follower's rear across ADR-011's clearing edge (+0.040 m against −0.186 m), and the sheet from 20 to 10 points.
  - Moving the PC go 4 steps later gives the phone's sheet. Moving the phone go 1 step earlier gives the PC's.
- **F5: the rig decided per grid point but applied per frame.**
  - `DriveRig.onTick` ran `stepDriveScript` inside the grade loop, after rapier had already taken the frame's n steps.
  - Its `pad.set` overwrote itself across the frame's points. Only the last point's decision reached the NEXT frame's steps: 1 to n steps after the state it read, against exactly 1 at 60 Hz.
  - Frames of 269–792 ms aliased its 0.22 s ON / 0.12 s OFF standstill pulse.
  - Its recorded pedal columns held the previous point's decision, not the input that was applied.
  - Its script started at `handle.last.tSec`, wherever a `page.evaluate` landed, so the start was wall-timed (A7).
- **The pad needs no production seam (A5).** The synthetic pad is a live JS object. `SimInput.mergeGamepad` polls `navigator.getGamepads()` on every `read()`, including every physics step's. A VehicleRig input-provider seam would have bypassed GatedSimInput (A4).

**Decision.**
- **D-1. Human input keeps the frame-start rule.** No channel maps event timestamps onto grid points. That covers the keyboard, touch, the mouse pedals, cabin keys and buttons, and looks. Real Gamepads expose no change time.
  - **Reason.** For a human, the right reference is the picture.
    - A press made between frames acts from the next frame's first step. That back-dates it by up to one frame (U(0, frame)).
    - The picture the driver reacted to was itself up to a frame stale on that display, so on average the two offset each other.
    - Mapping wall-clock timestamps onto the grid would remove the back-dating but keep the staleness. That would add up to a frame's delay to every reaction-timed rule (BRAKE_ONSET, the narrow-meeting stand-down, `respondingOnBrake`), and it would do so on exactly the slow devices.
  - **Stated as lost.** A press and release inside one gap between frames (F2) never reaches a read.
  - **Consequence for W81's (i).** For a human, frame-timed pedals remain ADR-014's stated limit. This ADR does not change them.
- **D-2. The drive rig is step-keyed** (dev only, no production seam).
  - **The lazy pad.** The `getGamepads` shim first calls `DriveRig.syncToStep()`.
    - When the step track's `stepCount` is newer than the last count evaluated, the rig runs `stepDriveScript` ONCE per new count c, oldest first. Each run uses `stateAtStep(c)` at t = the grid clock's `timeOf(c)`, and caches the command. Repeated reads at the same count return the cache.
    - So step k+1's before-step applies the decision taken on the state after step k. Neither read order nor the render-rate reads can move it.
    - At one step per frame this is exactly the old behaviour. That equality is the regression anchor.
    - A catch-up never reaches past the step track's 64-step ring. A count whose state is gone is counted as `blindSteps`.
  - **The whole product path.** The command travels SimInput's merge → GatedSimInput (reverse remap, raw capture, pre-drive gate, blocked-throttle latch) → `applyDifficulty` → VehicleSim. Nothing replaces SimInput. `GatedSimInput` is exported from LessonScene for the census alone, with no behaviour change.
  - **`onTick` only records.** A sample's pedal columns at point k are the command the pad handed step k, that is, the last read at count k−1. `DRIVE_RIG_VERSION` moves from 2 to 3 because the columns changed meaning. `onTick` keeps three frame-timed jobs:
    - starting a «drive» script at the phase flip;
    - freezing the command where the lesson ends;
    - re-keying held keys at the grid point whose decision changed the script step.
  - **The start is referenced to a step.** `run(steps, { startAt })` returns what it armed.
    - **A named step N.** The session-time origin is `timeOf(N)`. The first decision is taken on the state after step N and applied from step N+1. A start that has passed is refused with a RangeError; it is never moved.
    - **«drive».** The first grid point of the lesson's driving phase.
    - **«next».** The old `run()`: the step count at the call. It stays the default for existing callers (`glance-graded.mjs`, `wave3-drive.mjs`, and the rig-wave capture scripts that call `run(steps)`). It is NOT step-referenced.
    - **`?script=`** arms at `publish()`, which by design comes before the scene's first physics step (unobserved live, L4). It re-arms after a StrictMode dispose/publish.
    - **`?start=drive|N`** chooses the start. The default is step 1 (named) for a lesson with no pre-drive procedure, and «drive» otherwise.
    - **`tools/clips/headless/drive-rig.mjs`** arms in ONE `page.evaluate` with `--start-at auto|<seconds>|step:N|now`, and fails the run if a start is refused. It drives Chromium only, at a 1280×720 viewport.
  - **The dev-only read handle.**
    - LessonScene publishes `window.__rigStepSource`, a READ view: `steps` {stepCount, stateAtStep} and `clock` {timeOf, indexAt, stepSec}. It offers no `record` and no clock to advance.
    - It is published from a `useLayoutEffect` whose first statement is `if (process.env.NODE_ENV === "production") return;`, so that it exists before the Canvas takes its first step. LessonScene imports the devrig types only.
    - The pad never throws into a physics step. Errors are swallowed and counted (`readErrors`), and drive-rig.mjs treats any of them as a soft failure.
- **D-3. What the per-step decision does NOT make invariant** (stated, not fixed).
  - **Script KEY edges stay frame-timed.**
    - This covers indicators, looks, gear, holds and the PRE_KEYS taps.
    - They are dispatched from `onTick` at the grid point whose decision changed the script step, which is the same point on every cadence.
    - They land after that frame's steps have run: up to 27 steps late at 2 fps, as the verifier measured.
    - The grade reads the cabin through the frame's sample and the look FIFO (ADR-014).
  - **The invariance covers pedals and steer only, and only for scripts whose held keys do not touch physics** (verifier condition C2).
    - Looks (KeyQ/E/F) were measured to leave the pedals identical.
    - A script step whose `keys` include W/S/A/D or the arrows, a gear key or the parking brake changes the closed loop's state, or the reverse remap, at a frame-timed moment. Every later pedal decision of the rig can then differ by cadence.
  - **Scripts must not put a discrete edge within one phone frame of a rule edge.** Otherwise any split such an edge produces is classified as frame-timed.
  - **A «drive» start on a pre-drive lesson is learned from the grade.** Decisions for steps that a long frame had already taken are counted as `lateDecisions` and never applied. A named start has no late decisions.
  - **`run()` with no start, and `--start-at now`, are wall-timed starts.**
  - **The headless `keyboard.press("KeyX")`** is a fullscreen control, not an input (A8), and is left alone.
  - **The rest of ADR-014's frame-timed list is unchanged.** That includes:
    - the driveline stall timer on the unclamped render delta (the review's A13 and D-5, owed as a separate ADR-014 amendment);
    - the `cabin.update` clocks;
    - reverseAssist;
    - NpcColliders;
    - the lee.
- **D-4. Deferred: per-step human pedal integration.** It is not built here, and `engine/input.ts` is unchanged. It would be built as one piece (the review's D-A + D-B + D-C, with A1, A3, A9, A10 and A11 folded in), and only when D-6 fires.
- **D-6. The trigger to revisit D-1 and D-4.** A published step counter must exist first. Revisit when BOTH of these hold:
  - (a) on the target device class (a budget Android and an iPhone, with Low Power Mode on and off), the median is 3 or more steps per frame, or the p95 is 6 or more;
  - (b) a human-driven cross-device split is shown on a real device.

  Keyboard driving measured below 30 fps reopens D-4 on its own.

**Limits (the verifier's conditions).**
- **L1 (C1). After the lesson's end point, the rig's commands are frame-timed.** The completing frame's later steps read live decisions before `onTick` sets the freeze.
  - The verifier measured this with a reachZone completing at grid point 414.
  - The post-end sequence is identical on 60, 30 and 144 Hz, on vsync drift and on desktop jitter.
  - On the w69 phone deltas (both orders) and at 2, 1.3 and 3 fps, step 416 applies 0.154686 throttle against 60 Hz's frozen 0.154649.
  - Nothing is graded after the end, and the product's own pause on `ended` is a frame-timed React commit anyway.
  - The car's final pose, and so an end-of-drive photograph, can still differ by lens.
- **L2 (C2).** The invariance holds for pedals and steer only, in scripts whose held keys do not touch physics (D-3).
- **L3 (C3). Some starts depend on when the call lands.**
  - **`--start-at auto`** names ceil((step+60)/60)·60, so calls at steps 0–120 name 60, 120 or 180. It is call-dependent. A cross-lens comparison must use one named start: `--start-at <seconds>`, `step:N`, or `run(steps, { startAt: N })`.
  - **A named start before the pre-drive gate opens** has its rig pedals zeroed until a frame-timed React commit, while the script integrates against a car that is standing still. A comparison drive must confirm phase=driving at the named step.
  - **Pre-drive lessons.** The default `?start=` for a pre-drive lesson is «drive», which counts `lateDecisions`.
  - **Minor:** an empty `?start=` parses as step 0, not as an error.
- **L4 (C4). The live wiring is unobserved, and the CLI default moved.**
  - No browser has shown that the layout effect publishes before the first rapier step, or that every physics step reads the pad.
  - drive-rig.mjs's default moved from start-now to `auto`. That delays a script by 1–2 s of world time against runs made before this ADR, so the traffic phase differs from earlier evidence.

**Alternatives rejected.**
1. **A VehicleRig StepInputProvider.** It is a production seam that bypasses GatedSimInput (A4).
2. **Mapping timestamps onto the grid for the rig.** The pad is polled and has no change time.
3. **Deciding in `onTick` and re-applying per step.** The grade runs after the steps it would need to drive.
4. **Running the grade inside rapier's after-step.** That is a rewrite of ADR-014.
5. **Re-evaluating on every read.** A decision would then depend on how many times a frame read the pad, because the controller's integral decays on a 0 s step. Mutant 1 shows it.
6. **Dispatching script key edges from inside a physics step's read.** That puts DOM events inside rapier's step callback. The grade still reads the cabin per frame, so the edge would move without becoming per-step.
7. **Keeping the wall-timed start.** It leaves an offset of up to a frame that per-step decisions cannot remove.
8. **A wall-time rig pulse.** It reproduces the aliasing.
9. **A GPU WebKit lens.** It narrows the problem without removing it.
10. **Timestamped human input.** The W81 integrator note suggested this as a candidate repair for (i); nothing measured it. Rejected by D-1.

**Boundaries.**
- `devrig/rig.ts` owns the step-keyed pad, the start policy, and the per-count decision and applied records.
- LessonScene owns the read view's publication, dev-gated in a layout effect, and nothing else of the rig.
- `traffic/playerTrack.ts`, `SessionGridClock`, `engine/input.ts` and GatedSimInput's behaviour are unchanged. The rig reads the step track and the clock only through the view.
- `tools/clips/headless/drive-rig.mjs` owns its harness's start policy.
- ADR-014's boundaries stand.

**Consequences.**
- **On every cadence modelled in process,** rig pedals and steer get the same command at the same physics step, up to the lesson's end point (L1), in scripts whose held keys do not touch physics (L2). The cadences are 7 in the builder's census and 10 in the verifier's. Discrete rig edges do not get this.
- **A one-step-per-frame drive is bit-identical to the rig before ADR-017.** In process, the 144 Hz, desktop-jitter and w69 phone-delta cadences now match it too; before, they differed by up to a frame. Whether the live WebKit phone lens does is G3.
- **Rig evidence from before `DRIVE_RIG_VERSION` 3 cannot be compared step for step** with evidence made after it (L4: the start policy moved too).
- **The lens still says nothing about a human's experience of a slow display.**
- **Proven in process by the builder** (`rig-step-keyed.census.test.ts`, 18 tests).
  - The components are the real code: the pad, `stepDriveScript`, GatedSimInput, `applyDifficulty`, VehicleSim on headless rapier, `recordPhysicsStep` and `SessionGridClock`.
  - The frame loop is a model that follows rapier's stepper line for line (clamp 0.5 s, an accumulator, 1/60 s steps), then render reads, then one `onTick` per new point through the real `applyTick`. The drive runs 780 steps.
  - On 7 cadences, the applied throttle, brake and steer and the car's states are bit-identical at every step, and so is the script log. The cadences:
    - 60, 30 and 144 Hz;
    - desktop jitter with a 983 ms hitch;
    - the w69 phone deltas in two phases, one opening with the 7.505 s stall;
    - 2 fps.
  - An oracle that recomputes each decision once from the recorded state after step k matches what step k+1 applied.
  - 0, 1, 3 or 7 render reads per frame give one sequence.
  - A named step 120 gives one drive from each arming point tested: 3 frame boundaries × 3 places in a frame, on each cadence.
  - Its anchor is a transcription of the old `advance()`. The old rig does not match itself across cadences.
- **Reproduced by the verifier's own census.** It ran the REAL rig.ts from 59be0de as the anchor, not a transcription.
  - It covered 10 cadences, both the normal and the beginner tier, and 1,500 steps on a 10-step closed-loop script. Gated and raw pedals, steer and the car's states are bit-identical, and the oracle is exact. `lateDecisions`, `readErrors` and `blindSteps` are 0.
  - 160 start-call-jitter drives with a named start of 137 are identical. They arm at 4 frame boundaries × 4 places in a frame.
  - At one step per frame the new rig matches the base rig bit for bit (applied commands, states, sample columns, key-edge events), through a lesson end as well.
  - The pre-drive gate zeroes every rig pedal while it is locked, and the remap swaps them.
  - Pause, a 6 s hidden tab, a 7.5 s stall and a blur apply nothing twice.
- **Mutation.**
  - The builder: 5 of 5 sabotages red on assertion text. Among the messages: «step 182 applied … but the decision from the state after step 181 is …» and «the production bundle must not carry the step handle».
  - The verifier: 10 of 10 killed, each restore sha-verified.
- **Production absence** (`rig-production-absence.test.ts`, 7 tests).
  - The handle's name appears only in LessonScene.tsx and rig.ts.
  - DriveRig is value-imported only by the drive-rig client, whose route calls `notFound()` in production, and by the devrig barrel. Production code already value-imports that barrel (LessonPlayShell and RouteGuidance, for publishRoadProbe*). So the pad's absence from production rests on the bundle check.
  - A minified rolldown production bundle of the student's simulator route carries neither the handle nor the pad. A development bundle carries the handle, as the positive control.
  - This approximates Next's SWC build; it is NOT a `next build`.
- **Regression, on 59be0de + rigstep in the verifier's lane** (vitest, one worker): all green, and tsc is at the 21-error Prisma baseline.
  - 196 devrig + app/dev tests;
  - 990 engine + scene tests;
  - 1,551 components/sim tests;
  - 608 tests in 20 other files that import the input, the rig or LessonScene.

  The integrated-set run is owed (Status).
- **Owed.**
  - **The integrated-set directory gate** with rigstep staged.
  - **G3: re-drive both rows on the PC and phone lenses with ONE named start.** The rows are `sc-rb-busy-gap:7bbdd45e` S and `sc-roundabout-entry:08a0b701`, driven through `/dev/drive-rig`.
    - drive-rig.mjs drives Chromium only. The phone lens (WebKit 852×393, DPR 3) needs its capture script to arm `window.__driveRig.run(steps, { startAt: N })` in one evaluate, with the same N as the PC drive.
    - Choose N late enough that neither lens's arming call has passed it.
    - Expected: the same go step and the same sheet, with phase=driving at the named step. `status()` should show `lateDecisions` 0, `readErrors` 0 and `sourceResets` 0.
  - **The live wiring** (L4).
  - **G4 / ADR-014 D6:** a real-phone frame-time reading and a published step counter.
  - **The review's A13:** the stall timer on the unclamped render delta.
  - **The callers that still use the «next» start:** `glance-graded.mjs`, `wave3-drive.mjs` and the rig-wave capture scripts.

**Five questions.**
1. **Learning outcomes.** Indirect. The audit stops reporting rig artefacts as product defects.
2. **Safer drivers.** Neutral.
3. **Retention.** D-1 protects learners on slow phones from a harsher reaction clock. D-2 is dev only.
4. **Measurable progress.** For pedals and steer, one rig script now gives one applied command sequence on every cadence tested in process, up to the lesson's end. Whether that gives one sheet live is G3.
5. **Business value.** It stops a class of false phone-lens splits from consuming audit waves. It adds no production behaviour: a dev-gated no-op effect, an erased type import and an export.

**Update 2026-10-13 — the grade of a multi-step frame runs between its steps (ADR-014, Amendment 2026-10-13); what that makes of alternatives 3, 4 and 6, D-2, D-3, L1 and Consequences.** Lane `npcstep` rounds 2–6; ratified with conditions by the integrator (N2). No rig code changed (rig.ts: comments only; `DRIVE_RIG_VERSION` stays 3).

- **Also corrected.** D-2's «`onTick` keeps three frame-timed jobs» (starting a «drive» script at the phase flip, freezing the command where the lesson ends, re-keying held keys): in process each now runs at the grid point that decides it, with exactly k steps taken, before step k+1's input is read (lateDecisions, L1 and D-3 below). Alternative 3's reason, «The grade runs after the steps it would need to drive», now holds for a frame's last point only; the step-keyed lazy pad (D-2) stays the mechanism. Consequences' «Discrete rig edges do not get this» now reads: discrete rig edges are dispatched at the same grid point on every cadence (D-3 below); whether a script whose keys touch physics is then cadence-invariant is not measured (L2).
- **Alternative 4, as it now stands.** «Running the grade inside rapier's after-step» stays rejected as a rewrite of ADR-014. What was adopted is narrower: every point of a frame but its last is graded at the START of the next step's before-step (VehicleRig's callback calls the scene's step-loop grade before it reads that step's input), and the frame's last point at the frame's end. A frame of one step is graded exactly as before. It is adopted because without it the road users' shells cannot be posed on the grid.
- **Alternative 6, as it now stands — it happens by construction.** For a point graded inside the loop, `DriveRig.onTick` runs inside rapier's before-step callback, so its DOM key edges are dispatched from there. The rejection's reason no longer holds: the grade now reads the cabin per graded point (refreshed in the loop), so an edge dispatched at point k is read by the step after it on every cadence.
- **D-3, rewritten («Script KEY edges stay frame-timed» is withdrawn).** A script's key edges — indicators, looks, gear, holds, PRE_KEYS — are dispatched at the grid point whose decision changed the script step, with exactly k steps taken, before step k+1's input is read, on every cadence. Through 8cb0707 they landed after the frame's steps (on the census's 2 fps contrast an edge's step count exceeds its grid point; the census asserts that, not a count). Still frame-timed: the cabin clocks on the render delta, the moment a look is SAMPLED, reverseAssist, the lee. Not measured: whether a script whose keys touch physics (W/S/A/D, arrows, gear, parking brake) is now cadence-invariant; the invariance claim stays for pedals and steer (L2).
- **lateDecisions and blindSteps.** A «drive» start has 0 late decisions on every cadence (29 on a 0.5 s first frame under the old order). `blindSteps` is unchanged.
- **L1, rewritten.** After the lesson's end point the command is the frozen one from the very next step on every cadence: `onTick` sets the freeze at the end point, inside the loop, before step k+1 reads the pad. The 0.154686 / 0.154649 difference no longer occurs in process. The car's final pose is no longer frame-timed by the rig; the product's own pause on `ended` is still a frame-timed React commit.
- **The rig's clock is the grid's read view.** `window.__rigStepSource.clock` is built from `GradeGrid.clock`, since round 4 a frozen read-only view (`stepSec`, `last`, `timeOf`, `indexAt`); the rig's view exposes its `timeOf`, `indexAt` and `stepSec`. The rig never could advance the grid's clock. Through `clock` an advance is a compile error and a TypeError; that guarantee is the source census plus execution, NOT the type — bracket access to the private field (`gradeGrid["gridClock"]`) compiles, and is caught by the source census, the executed frame drives and (round 6) the cut's refusal. Since round 6 the grid's grading methods cannot be replaced either (a frozen prototype and a non-extensible instance; the round-5 verifier's P7).
- **The regression anchor holds.** A named start at one step per frame is byte-identical to before: applied commands, car states, sample columns, key edges and the step count each was dispatched at, script log, lateDecisions, readErrors — at 60 and 144 Hz (rig-step-keyed.census «2026-10-13»; the old assertions are kept under `grade: "frameEnd"` as the contrast).
- **Comparability.** Rig evidence captured before this update is comparable step for step on PC one-step frames only — not on the phone lens and not on PC two-step frames. Whether the pre-ADR-017 rig would now match its own 60 Hz drive on the phone deltas was not measured and is not claimed.
- **The rig's call of the step-loop grade is pinned (integration, 2026-10-16; ADR-014's V6-1).** The round-6 verifier's V1, the call put behind a condition, had passed the targeted set and the 87-file wide set. The before-step callback's FIRST statement is, by its exact syntax, the unconditional `stepLoopGradeRef?.current?.();`, and the rig names the ref nowhere else but the prop's declaration and its destructured parameter; `sceneGradeCut()` refuses the scene's cut otherwise, so a rig change that skips, conditions or moves the scene's turn fails every harness that executes the scene's frame, at collection or at its first call of the cut, on the refusal's text.
- **Owed.** The re-drive of the 08a0b701 kept cells (L4 H1810, L1 H1711, L1 H1707) on PC and the phone lens. A browser drive of the rig on both lenses (L4 stands): that the layout effect fills the step-loop ref before the first step, that every physics step reads the pad, and that DOM key events dispatched from a physics callback behave as in process.

## ADR-018: Ambient vehicles obey their own approach's signal and the officer, and share the junction box with the student by one protocol

**Status.** Accepted by the integrator on 2026-10-17.
- **Where its parts come from.**
  - The protocol is made of the integrator's decisions, all inside the founder's delegation of 2026-10-08. None of them is a founder ruling:
    - round-3 D6, the patience bound (2026-10-11);
    - P1–P3 (2026-10-12);
    - D1–D5 (2026-10-13);
    - E1–E17 (2026-10-14 to 2026-10-16).
  - One class, founder question 7, is decided by the integrator under the founder's explicit delegation of 2026-10-16 (below).
- **Lane.** `posturescross`, nine rounds on `2e9268f`. Rows `sc-sig-controller-postures:5ee4301e` (critical) and `:4f446777` (major).
  - Rounds 1, 3 and 4 were refuted.
  - Rounds 2 and 5 returned BLOCKED, round 5 with a measured frontier.
  - Rounds 6 and 7 returned BLOCKED on one decision each and were then refuted as decided.
  - Round 8 was refuted on the decision itself.
  - Round 9 was SIGNED OFF WITH CONDITIONS (doc 88).
- **Patch.** `posturescross-result-r9.patch`: sha256 06b26a97…, 44 files, +7,491/−173. It lands applied 3-way onto `1f1536d`, with the integrator's test-only pins, as `gate-pc.patch` (sha256 ee2b7eeb…a25c, 46 files; doc 88).
- **What it changes and what it does not.**
  - It changes what ambient traffic and pavement walkers do.
  - It adds no graded rule and moves no protected threshold.
  - Four recorded demo tapes are re-authored, and two caption lines of sc-junction-blind's correct demo changed in round 3: one added (none → `487183ee1d75`) and one replaced (`1b95c586e00c` «Пътят е чист — завиваме наляво уверено.» → `9cadbad8e2cd` «Отдясно вече не идва никой — завиваме наляво уверено.»). The founder is told both (doc 88).
  - It runs on ADR-014's grid.
- **Evidence.** The proof is in-process only. Neither row is closed until a rig re-drive on PC and on the phone lens shows it.

**Context.**
- **The wrong lamp.** An ambient car asked the runtime for the node's own axis group on every approach, which on a single-node cluster is the arterial's. So the cross street drove on the student's green, against its own red, into his path. Nothing ambient read the officer.
  - Measured at base by the round-1 verifier: 53 / 134 / 257 ambient crossings against their own signal or the officer on its three instruments.
  - On the round-3 verifier's officer grid: 18 lawful cells of 1,378 at base end in a COLLISION.
- **The walkers.** Pavement walkers' beats started at the junction node and crossed the other street's carriageway: 80 of 155 live traffic configurations at base.
- **Why the box needed one protocol.** Once ambient cars obeyed the right lamp, every round found that how an ambient turner shares the box with the student decides whether a careful student is struck or an ambient car freezes. The builder and the verifiers measured a frontier:
  - releasing the oncoming turner for a student who signals left strikes him if he then drives straight;
  - holding it for as long as he stands stalls the oncoming stream for a student who is waiting for that stream (below).

**Decision.**
- **Each car obeys its own approach.**
  - `SignalController.ambientPhase(signalNodeId, approachBearingDeg, fromNodeId)` (`runtime/signals.ts`), exposed as `DistrictWorldRuntime.ambientSignalPhase`, answers for the car's own approach:
    - **Where a controller is posted,** his permission for its axis governs, never the lamp (ЗДвП чл. 7): «proceed» is green and «halt» is red. Through his raised-arm window, `CONTROLLER_ATTENTION_LEAD_SEC` (11 s, `contracts.ts`, the same constant the officer figure raises his arm on), it is yellow for both axes: stop if you still can, clear the junction if you cannot (the officer's signals, ППЗДвП; the article number is not in content/law and is not cited). This holds with live or dark lamps, since a posted officer keeps the cluster «controlled».
    - **Otherwise** it is the live cycle of the approach's own axis group.
    - **On a link inside one signal complex** it is null.
    - **At a dark or flashing cluster** it is unchanged, the node's own group. The right-hand rule for ambient cars there is owed (Consequences).
  - The grade grid, the trace recorder and the clip feed hand this read and the student's indicator to the traffic at every grid point. Nothing graded calls it. TrafficLayer only renders: its per-frame update, which no mount used, is removed (ADR-014).
- **Connectors.** An ambient vehicle drives a built connector through the box (`traffic/graph.ts` `laneConnector`). It no longer hops the lane seam at the node.
- **P1: all yielding is decided at the line.** An ambient vehicle enters only if its whole path through the box will be clear for the time it needs.
- **P3: the student is predicted at his earliest arrival,** launching from where he stands while his signal or the officer permits him, plus the taught margin `AMBIENT_LEFT_TURN_GAP_SEC` 4 s. A guard-stopped staged car is not taken as standing for good.
- **Patience (round-3 D6, kept under P3).** A car that has held its way open for a student at rest for `AMBIENT_YIELD_PATIENCE_SEC` = 5 s (the rule engine's `hesitationSustainSec`) drops only the taught margin. It goes only if it can clear before the earliest he could reach its path.
- **WAITING and COMING (D1 / E1).**
  - The student is WAITING when he travels against this car's approach, his left indicator is on, and his car is either at rest or still able to stop short of his own line at the fleet's comfortable deceleration, 2.2 m/s². Otherwise he is COMING.
  - For a waiting student the oncoming stream is released, where his own left turn runs clear of the turner's (`opposingLeftsClear`). Where the two opposing left turns cross, he is still waited for.
  - A coming student is predicted along the straight path his car is on, until his car itself shows the turn.
- **The last safe point W (D3).**
  - A released turner keeps deciding after its line, up to W: the last point on its connector where it can still stop with no part of its body in a lane his straight path uses.
  - If he becomes coming before it reaches W, it holds there and goes again by the same test. Past W it clears and does not brake for him. A vehicle never stops in a lane another stream drives through.
  - Where a connector has no W, the vehicle decides at its line only. By the builder that is 11 of 352 signalised movements, none on sx-v1.
- **In the box (E13).**
  - A student who is WAITING by E1 is read as at his line, wherever he stands, and the turner goes.
  - A student at rest who is NOT waiting (indicator off or right, or changed away from left while he stands) is protected by his room for as long as he stands. `studentLeavesRoom` reads whether the turner can clear his straight corridor before he could reach it from where he stands, from his present speed, at `cfg.accelMps2` = 1.8 m/s² (the fleet's «Gentle acceleration», `traffic/types.ts`), capped at the node limit. A blocked run leaves no room.
  - A moving student is read by the line's own branch.
  - A staged car standing inside the junction's drawn radius that has not yet stood for the patience bound is read by its room from rest at the same acceleration. Once it has stood for the bound, it is a standing body.
- **The bounds** (census, `junction-box-clears.census`):
  - every rest inside a junction's carriageway counts against `BOX_REST_BOUND_SEC` = yellow + all-red + red-yellow = 5 s, unchanged, unless one of these excuses it;
  - a waiting-point hold is excused only while the body the product holds it FOR (`waitingPointHoldFor`, E6) is coming. It must end within the launch (0.3 / 1.8 = 0.167 s, a test tolerance) plus one grid step, 0.1834 s in all, after that body is the product's restart distance `STUDENT_PATH_SEP_M` 5.8 m (`stagedPathSepM` for a staged car) clear of its path, or has turned off it or stopped (E5). The measured tail is 0.183 s;
  - a hold or queue bounded by the student's own standing is excused while he stands (E10);
  - a vehicle queued behind an excused hold is excused for as long as that hold is (E15). As built (builder deviation 6c), each follower must move within `QUEUE_RESTART_SEC` 0.900 s of its own leader: the fleet IDM's restart lag of 0.867 s plus two grid steps. A car standing at its own line may have its leader across the junction in its corridor.
- **The indicator at dark and flashing junctions (E14).** It keeps its E1 meaning there.
- **Pavement walkers.** A pavement walker's beat stops where the world draws the pavement at a junction: the junction-trimmed centre line pulled in by `sidewalkEndInsetM`. It is checked clear of every carriageway. A way-split joint or a dead end keeps its old end.
- **FOUNDER QUESTION 7 AND ITS ANSWER.**
  - **The question,** put to the founder on 2026-10-16: «a student signals left, stops in the junction, then drives straight into the car his signal let turn — hit through no fault of his own, or by his own misleading signal?»
  - **He answered:** «do it how you think its right».
  - **The integrator's ruling under that delegation** (2026-10-16, memory `founder-ruling-2026-10-16-q7-own-false-signal`): «a student who signals LEFT, stands in the junction, then drives straight into the turner his signal released is struck by his own misleading signal — posturescross lands as built». The class is the student's own false signal, not a defect. Nothing bills the indicator; no sheet row is added for it.
  - **Superseded comments.** The doc comment of `studentLeavesRoom` (`traffic/vehicles.ts`, «founder question 7, open») and the boxstop test's comment in `junction-box-clears.census.test.ts` («founder question 7 (open)») predate the answer and were not edited at the landing. This ruling supersedes both; a comment-only edit citing it is owed (doc 88).
  - **The class as measured** (round-9 verifier):
    - a student who stops in the box signalling LEFT and then drives straight: 137 of 1,344 boxstop cells;
    - a student who cancels his left signal after the turner it released has committed at W: 186 struck on the 11 cancel grids (1,232 lawful cells). «Committed» is the verifier's proxy: past W or within its 5.5 m/s² hard-braking distance. Every one of these is also a hit with the indicator kept left.
    - Base, measured on the y −4 grids (boxstop LEFT 0 of 112; cancel 0 of 224), gives 0: at base no ambient car reads the indicator.
  - **What stays protected:** the same acts with the indicator off or right, or cancelled before the turner commits. They measure 0.
  - **If he later rules the other way,** a new round is owed: hold the turner for as long as he stands (round 8's E9), and solve the stall that brings back.

**Corrections to the decision texts and an earlier report, found by the lane.**
- **E9's premise is false.** The round-8 decision text placed the turner's waiting point «clear of every lane, D3». W is clear of every lane the student's straight path uses, but it can lie in the turner's own approach lane (round-8 verifier, R8-F1). Holding the turner at W therefore stalls the oncoming straight stream behind it: heads over the bound in 77 of 120 deep-wait cells, and the staged follow car passing 0 of 25 at 11–24 m (5 of 5 at 10 m).
- **E14's premise is false.** E14 said «the sc-signal-dead L5 / L1 cells it was built for bill FAILED_TO_YIELD». They do not:
  - sc-signal-dead L5 go60 h2 is an unbilled COLLISION, clean at base;
  - L1 go50 h1 is an unbilled COLLISION, where base bills FAILED_TO_YIELD.
  - In both, the open-loop tape drives into a staged car from his right standing in his lane at a dark junction.
  - E14 stands on its other reason. Without it, the mutual wait at dark and flashing junctions is 53.7–90 s. With it, the opposite arm's longest rest is 31–42 s.
- **The reach arithmetic (R7-C3; the round-7 builder's numbers, corrected as E11 ordered).**
  - The body's lowest point in his corridor is y = 3.34.
  - His reach times from y −4 / −7 / −10 / −14 / −20 are 2.28 / 2.86 / 3.34 / 3.90 / 4.63 s at 2 m/s², and 1.63 / 2.05 / 2.40 / 2.79 / 3.30 s at 3.9 m/s². The round-7 builder's 1.73 / 2.45 / 3.00 / 3.60 / 4.36 s were wrong.
  - From its W at (−1.69, 15.19) the turner needs 15.10 m, 4.10 s at 1.8 m/s², to get its body out of his corridor (round-7 verifier).
  - The conclusion stands: every reach is under 4.10 s except y −20 at 2 m/s².

**Alternatives rejected.** Each was measured by a verifier, or by the builder where marked.
- **A release on the patience clock alone (round 3).** On the officer grid a careful lawful student was struck in 33 cells other than base's 18 of 1,378. The verifier attributed 7 of them, at the line at go 37 s, to that release. Patience is kept only under P3 (above).
- **Releasing on the left indicator while he moves (round 4).** 116 of 790 lawful cells struck.
- **Tying waiting to a place (D1b).** On the y −4 / 2 m/s² boxstop grid 11 of 112 were struck, and heads stood in 42 of 80 boxwait cells (3–9 m).
- **The in-box reach at the brisk launch (XF).** 0 of 112 struck on that grid, but 80 of 80 boxwait W holds froze, for up to 68 s.
- **K1 / K3b.** Struck 69 and 42 of 1,344 (the builder, round 7).
- **Holding at the line (K2).** Heads stood in 56 of 80 cells, and the follow car passed 0 of 20 (the builder, round 7).
- **Holding at W for as long as he stands (K2b / E9, round 8).** The stall above.
- **Dropping the indicator's meaning at dark and flashing junctions** (round 8's deviation). It brought back the 53.7–90 s mutual wait.

**Consequences.**
- **JB-1, the class question 7 decides.** It is counted and unbilled. A rig judge must not refute or still a clause on it.
- **JB-2, owed: the right-hand rule for ambient cars** at dark and flashing junctions, where they still read the node's own phantom cycle. In it:
  - 12 sc-sig-flash-amber-ped cells, where the tape rear-ends an ambient car and is billed PEDESTRIAN_CROSSING_TOO_FAST;
  - the two sc-signal-dead staged-car cells above.
- **JB-3, the grading gap.** A contact with a priority car from his right standing in his lane at an uncontrolled junction bills COLLISION but not FAILED_TO_YIELD. It is the rule engine's to fix.
- **JB-4, pinned at integration.** E15's follower relation now has negative rows too (`junction-box-clears.census.test.ts`, test-only: the relation moved unchanged into `followLeaderOf()` and `standingNearJunction()`). VR9_FOLLOW_ACROSS_ANY dies «expected 2 to be null» and VR9_FOLLOW_REACH_WIDE dies «expected [ 1, 2, 3 ] to deeply equal []»; the merge verifier reproduced both (doc 88, «PINNED AT INTEGRATION»).
- **JB-5, census-only survivors.** D3_INTO_LANE, D3_NO_CLEAR, O3, O4, O6 and E6_STALE_REASON survive their census-only kill sets; each `_U` variant is killed. D4_STAGED_UNBOUNDED is near-equivalent.
- **JB-6, known rests.** The census's STUCK column holds 79 cells:
  - 75 staged roundabout circulators (scripted, identical at base);
  - 4 sc-ed-d2-priority-run cells (ambient car 5, 18.7 s, the pinned short-link slot chain; base has the same class).
- **JB-7.** Seven clips with ambient traffic must be re-captured.
- **JB-8.** Neither row is closed until the rig re-drives them on PC and the phone lens.
- **JB-9, npcstep's NPC-contact pins (landed in `1f1536d` with its ADR-014 amendment) are re-derived on this traffic.** 30 census cells lost their road-user contact, each an ambient car of a class this ADR removes: 18 entered against their own approach's red, 12 jumped to the node or stood ungated in the box. The census's own enumeration now gives 174 cells (30 out, and 4 contacts that the repaired traffic now produces joined: two of the student barging a flashing junction into a staged priority car, two of the student jumping the red-yellow into an ambient car crossing on its own green), and the «struck» floor is 150 → 125; the other floors are unchanged. The ear-only ambient-pedestrian cell lost its pavement walker to the walker repair and moved to an ambient walker on sc-pk-crossing-ban L5's zebra. Tests only; measured and checked in doc 88.

**Five questions.**
1. **Learning outcomes.** The cross traffic now acts out what the officer drills and the lamp lessons teach: it stops for its own red and for the officer's halt.
2. **Safer drivers.** A student who obeys his signal or the officer is no longer struck by a car that obeyed the wrong lamp: 0 of 1,590 lawful cells on the 2,756-cell officer grid. At base, the round-3 verifier's 1,378-cell grid had 18 lawful collisions. A left signal he gives is believed, as in real traffic.
3. **Retention.** The left-turn lesson's encounter still arrives for a student who waits at or inside the junction (the follow car passes 20 of 20 at 12–24 m).
4. **Measurable progress.** Ambient crossings against their own signal are 0 on all three instruments, and box rests are bounded and censused per hold reason.
5. **Business value.** It removes a critical class in which the product's world contradicted its own lesson. No graded rule changes; the sheets of 49 census rows change because the traffic does, and two demo captions changed (round 3).
