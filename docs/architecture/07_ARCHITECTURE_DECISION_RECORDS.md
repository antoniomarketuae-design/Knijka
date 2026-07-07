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
