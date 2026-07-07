# MVP Scope — The 240-Hour Sprint

> Status: v1.0 draft — 2026-07-07. Supersedes the H0/H1 sequencing proposal in doc 56 §3.2 per founder decision: **both tracks in parallel, ~240 hours of joint work, launch with revenue capability.** Tech choices pending research (doc 06) — hour estimates assume a web-first stack and will be revised once the engine ADR lands.

## The Deal (honest scoping contract)

The full vision prompt is a multi-year product. The prompt itself defines Phase 1 correctly: **"a fully working prototype with expandable architecture — prove the concept while allowing future scaling."** That is what 240 hours buys, at three commitment levels:

- **CORE** — committed. If we're behind, everything else is cut before Core is.
- **STRETCH** — built if Core lands early; first candidates for post-launch weeks.
- **POST-SPRINT** — explicitly not in the sprint; roadmapped in doc 03.

Budget: **Track A (Platform & Theory) ~90h · Track B (Simulator) ~110h · Integration/deploy/launch ~40h.**

---

## Track A — Platform & AI Theory Academy (~90h)

### CORE
| Feature | Notes | ~h |
|---|---|---|
| Auth + accounts | Email + Google login; GDPR-aware (16+ consent flow) | 6 |
| Gaming-style dashboard | Hub: progress, XP/level, streak, continue-lesson, modules | 10 |
| Theory curriculum engine | Structured Bulgarian curriculum: signs, rules, priority, situations — content model per education/61 (versioned, law-cited) | 16 |
| Knowledge graph v1 | Concept nodes + dependencies + per-user mastery tracking (drives adaptivity and readiness) | 8 |
| Practice engine | Adaptive question sessions: weak-concept targeting, spaced repetition, mistake review | 12 |
| Mock exam mode | Official format: **45 questions / 97 points / ≥87 to pass / 40 min**, 1-2-3 point weights, select-all-correct (doc 32) | 8 |
| AI Tutor (text) | "Why is this wrong?" / "Show me the law" — retrieval-grounded on our content bank, cites provisions (ADR-002) | 12 |
| Readiness score v1 | Mastery-weighted estimate + what-to-practice-next | 4 |
| Gamification v1 | XP, levels, streaks, achievements, daily goal | 8 |
| Payments | Freemium → **one-time packs, no auto-renew**: core €9.99–14.99 / with sim €19.99–24.99 (pricing per doc 41) | 6 |

### STRETCH
Leaderboards · AI tutor voice input (Bulgarian STT) · avatar picker (simple, not Sims-scale) · parent progress email · referral codes.

## Track B — Driving Simulator Prototype (~110h)

### CORE
| Feature | Notes | ~h |
|---|---|---|
| 3D scene + vehicle | One fictional compact car (manual + automatic variants), cockpit view (wheel, dashboard, indicators, speedo, gear; mirror **glance-views** — true reflective mirrors post-sprint, per doc 06) + third-person toggle | 22 |
| Driving physics | Believable arcade-realistic (engine choice per doc 06); keyboard + gamepad; wheel support = post-sprint | 14 |
| Sofia-like district | OSM-derived road topology (real intersections/roundabout geometry), simple buildings, BG signs/markings/traffic lights | 20 |
| Pre-drive procedure | Interactive sequence (seat → mirrors → belt → dashboard → engine → brake → gear → handbrake → observe → signal) — fully scored | 8 |
| Rule engine v1 | Real-time detection: speed, signals, stops, red lights, priority, mirror checks (view-based), seatbelt — instant feedback, per ADR-002 | 14 |
| 8 core lessons | Vehicle start & moving off · stopping · turns · lane change · priority junctions · roundabout · pedestrian crossing · parking (perpendicular + parallel) — objectives, scoring, mistake list | 16 |
| Micro-quizzes in-sim | Approach a sign → contextual question (from Track A question bank — first integration point) | 4 |
| AI lesson debrief | Post-lesson LLM summary: what improved, repeated mistakes, next recommendation — feeds the same knowledge graph | 6 |
| Scripted traffic v1 | A few path-following vehicles + crossing pedestrians at lesson-relevant spots (not full traffic AI) | 6 |

### STRETCH
Day/night + rain (visual + braking-distance effect) · event-log replay ("dashcam" v1) · police-stop text-dialogue scenario · vehicle entry animation · 2nd vehicle (automatic EV).

## Integration, Launch & Buffer (~40h)

Deployment + monitoring (8) · cross-device/browser testing (8) · Bulgarian content review pass (8) · landing page + onboarding + app packaging as PWA (8) · contingency (8). **App strategy:** PWA at launch (installable, one codebase); native wrappers (Capacitor) post-sprint.

## POST-SPRINT (explicitly out, per vision → roadmap doc 03)

Voice conversations everywhere · AI instructor personalities · AI scenario generator · AI examiner / procedural exams · driving twin v2 (cross-modal) · full AI traffic with personalities · weather system depth · Sims-level character creation · career progression · vehicle maintenance & failures · multiplayer · marketplace · VR & hardware rigs · digital twin cities · multi-country packs · instructor portal · parent dashboard · emergency-services scenarios · anti-cheat depth.

## Sprint Success Criteria

1. A 17-year-old in Sofia can sign up, learn theory adaptively, take a realistic mock exam, and ask the AI tutor why an answer is wrong — on their phone.
2. The same account drives 8 scored lessons in a cockpit-view Bulgarian district in their browser and gets an AI debrief that updates their readiness score.
3. Premium subscription can be purchased on day one.
4. Every module sits behind a clean API boundary so post-sprint features extend rather than rewrite (architecture doc 05).

## Known Risks to This Plan

- Track B hour estimates are the least certain (R1); the tech-eval research directly de-risks the top items.
- Bulgarian question-bank content is the critical-path *content* item — it must be original (copyright, R5/R6) and reviewed; content authoring runs parallel to code from day 1.
- 240h assumes aggressive AI-assisted development and subagent parallelization; the founder has shipped at this velocity before.
