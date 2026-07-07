# Product Vision

> Status: **Living document** — v1.0, 2026-07-07. This is the organized source of truth for the founder's vision. It is a strategic vision, not a technical specification. See [56_VISION_ANALYSIS_AND_CRITIQUE.md](56_VISION_ANALYSIS_AND_CRITIQUE.md) for the critical analysis and [04_MVP_SCOPE.md](04_MVP_SCOPE.md) for what we actually build first.

## Mission

Build the world's most advanced AI-powered driving education ecosystem — starting with Bulgaria — that produces measurably safer, more competent, and more confident real-world drivers.

We are building a **company**, not an application: a digital driving academy that combines realistic simulation, adaptive AI tutoring, structured education, and immersive engagement.

## North Star

> **"Will this help produce safer, more competent, and more confident real-world drivers?"**

Every design decision must answer yes. The ultimate success metric is measurable improvement in real-world driving competence, examination success, and road safety — not software complexity or simulator realism. (Expanded in [01_NORTH_STAR_PRINCIPLES.md](01_NORTH_STAR_PRINCIPLES.md).)

## The Product in One Sentence

A next-generation digital driving academy where a student creates an identity, learns theory through an adaptive AI tutor, practices in a realistic simulated Bulgarian city with an AI instructor beside them, and graduates with a data-backed prediction of real-exam readiness.

## Inspiration Set (inspiration, not specification)

Gran Turismo · GTA V driving mechanics · Euro Truck Simulator · MS Flight Simulator realism · The Sims customization · Duolingo progression · AI personal tutor · Interactive driving academy.

These name the *feeling* we aim for. They do not commit us to AAA production values — see the fidelity analysis in doc 56.

## Product Pillars

1. **Driving Simulator** — cockpit-first educational realism: correct procedures (seat → mirrors → belt → start → observe → signal → move), interactive vehicle interiors, realistic Bulgarian city environment, AI traffic with personalities, weather/night conditions, dashcam replay with AI annotation.
2. **AI Education Brain** — the differentiator. Specialized AI subsystems (Instructor, Examiner, Learning Planner, Scenario Generator, Dialogue Engine, Driving Twin, Analytics, Recommendations, Memory, Traffic Controller, Behavioral NPCs, Law Expert), a Driving Knowledge Graph, layered persistent memory (short/medium/long-term/permanent), adaptive difficulty, exam-readiness prediction, voice conversation everywhere.
3. **Learning Engine** — complete Bulgarian theory curriculum: road signs, traffic law, flashcards, practice tests, official-style examinations, mistake review, adaptive difficulty, micro-learning quizzes injected contextually during driving.
4. **Engagement Layer** — avatar creation (Sims-like), XP/levels/coins/achievements/streaks, daily missions, unlockables (vehicles, cities, lessons), seasonal events, leaderboards, career progression (Student → Licensed Driver → Taxi/Truck/Bus/Emergency → Instructor → School Owner), reward economy.
5. **Platform & Ecosystem** — instructor management portal, parent dashboard, driving-school B2B tooling, AI lesson/scenario builder from natural language, marketplace (lessons, cities, exams, mods), multiplayer academy, multi-country rule packs, VR & hardware (wheels, pedals, motion, eye tracking), mobile companion, cloud saves, cross-platform.

## Signature Experiences (from the vision)

- **Real driving procedure scoring** — every pre-drive and in-drive action evaluated.
- **Interactive AI Instructor** — observes, corrects immediately, explains why, answers spoken questions, tracks weaknesses, with selectable personalities (Calm, Strict Examiner, Friendly Mentor, Police Officer, Racing Driver, Defensive Expert, Military).
- **AI Driving Twin** — a persistent, evolving model of each student's habits, mistakes, reaction times, confidence, risk tolerance, and learning speed that personalizes everything.
- **Infinite Scenario Generator** — AI-generated unique situations (child runs out, cyclist from behind parked cars, sudden weather, mechanical failures, police stops with voice dialogue).
- **AI Examiner** — procedurally generated exams (route, weather, traffic, hazards) reproducing the official Bulgarian examination as accurately as legally possible.
- **Lesson debrief & readiness prediction** — "Based on your last 150 sessions, your estimated first-attempt pass probability is 93%…"
- **Digital twin roads** — long-term: reconstruct real Bulgarian streets (photogrammetry, Gaussian splatting, NeRF, LiDAR, OSM fusion).

## Market Strategy

- **Beachhead:** Bulgaria (Sofia first) — full localization of signs, markings, priorities, exam routes, examiner behavior, police procedure, documentation, school workflows.
- **Expansion:** multi-country rule packs (UK, DE, FR, IT, ES, US, JP, AU, CA…), left/right-hand traffic.
- **Customers over time:** learners (B2C) → driving schools (B2B) → governments, fleet operators, insurers, universities, emergency services, corporate training.

## Horizon Map

| Horizon | Theme | Contents (summary) |
|---|---|---|
| **H0 — Validate** | Prove demand & learning value | Bulgarian theory engine + AI tutor + knowledge graph + exam prep; first paying users & school pilots |
| **H1 — Prototype sim** | Prove the simulator concept | Cockpit-first 3D trainer, one Sofia-like district, core procedures & hazard lessons, rule-based real-time feedback + AI debrief |
| **H2 — The Academy** | Full product | Full city, AI traffic personalities, voice instructor & examiner, driving twin, instructor portal, gamification depth, VR/hardware |
| **H3 — The Ecosystem** | Platform & scale | Digital twin cities, marketplace, multiplayer, multi-country, government/insurance/fleet, career progression to professional licenses |

Feature-to-horizon allocation is argued in doc 56 and maintained in [03_PRODUCT_ROADMAP.md](03_PRODUCT_ROADMAP.md).

## Core Design Philosophy

1. Educational realism over graphical realism — graphics support learning, never replace it.
2. Prioritize driver decision-making, hazard perception, defensive driving, situational awareness, correct habits.
3. Modular, service-oriented architecture; every subsystem independently replaceable, clear APIs, business logic independent of presentation.
4. Technologies chosen for 10+ year viability (licensing, community, lock-in, cost, global scale).
5. Every feature justified by the five questions: learning outcomes · safer drivers · retention · measurable progress · business value.
6. This blueprint is living — improve the specification itself before implementing when better ideas, research, or market evidence appear.
