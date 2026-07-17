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
