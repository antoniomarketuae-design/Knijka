# Examination System (Bulgaria, Category B)

> Status: v1.0 — 2026-07-07, from official Наредба № 38 text and ИААА 2024 annual report. Our mock exams and sim examiner MUST mirror this exactly. Verification caveats flagged.

## Theory Exam — Official Format (Наредба № 38, чл. 38–39)

| Parameter | Value |
|---|---|
| Questions | **45** |
| Max points | **97** (questions weighted **1, 2 or 3 points**) |
| Pass | **≥ 87 points** (~89.7% — very high bar; this is why adaptive prep matters) |
| Time | **40 minutes** |
| Types | Text, static-image, and **interactive video-clip questions** (animated hazard situations, since ~2023); multiple-correct-answer questions exist (select all correct) **[verify against current методика]** |
| Administration | Electronic only (tablets) at ИААА exam rooms; unique individual test; automatic scoring; 5 random photos during exam; facial recognition (чл. 53а); groups ≤ 24 |
| Validity / attempts | Theory result valid 1 year; since 12.12.2024: **4 attempts within 6 months** of completing theory training, then training repeats |

**Product requirements derived:** mock exam = exactly 45 questions / 97 points / 87 pass / 40:00 timer with 1-2-3 weights and select-all-correct support; video-question module planned post-sprint (animated hazard clips — we can eventually generate these in the sim engine, an integration no listovki site can match).

## Official Question Bank — the critical content dependency

- Questions approved by order of the ИААА Executive Director (чл. 38, ал. 1) — state-produced. Public portal: [public-eis.rta.government.bg/exam-questions](https://public-eis.rta.government.bg/exam-questions/) (returned 403 to automated access — check manually); video questions at [rta.government.bg](https://rta.government.bg/services/driver-questions/). New масив draft went through consultation Nov–Dec 2024; new Методика approved 10.12.2024.
- **Copyright status genuinely unclear:** ЗАПСП excludes normative acts, but the bank is approved by administrative order. Commercial sites (avtoizpit.com, shofior.com…) have reproduced it for years without apparent enforcement, but **get a written ИААА position before we ship it commercially** (risk R5). Mitigation path if needed: original questions mapped to the same knowledge-graph nodes.

## Practical Exam (for the future AI Examiner — doc must be mirrored in sim exam mode)

- **≥ 25 minutes** on-road in populated area (no площадка for B). Vehicle carries ИААА-supplied video + GPS route-guidance device; examiner logs errors in real time; recordings kept 3 months; results appealable within 14 days.
- **Official error taxonomy & scoring (this becomes our sim scoring rubric):**
  - **Основни грешки** (knowledge/skill errors): **3 points** each
  - **Второстепенни** (imprecise execution): **1 point**
  - **Опасни грешки**: **10 points** — red light/regulator violation, wrong-way entry, missed stop at Б2, examiner intervention, creating accident precondition, speeding >10 km/h over limit
  - **Pass: ≤ 9 penalty points total, of which ≤ 6 from основни**
  - Terminated on repeated examiner intervention or collision
- Pre-drive: examiner quizzes candidate on vehicle safety checks → validates our scored pre-drive procedure feature directly.
- After a fail: minimum **4 additional practical hours** before re-sitting.

## Market Statistics (ИААА Annual Report 2024 — [PDF](https://rta.government.bg/upload/13870/godishen-doklad-2024.pdf))

- Theory sittings 2024: **110,467** — pass rate **67.1%** (per sitting)
- Practical sittings 2024: **122,856** — pass rate **71.3%**
- **First-time licenses 2024: 59,609** (2023: 56,930; both exam volumes growing YoY)
- ~⅓ of theory sittings fail → tens of thousands of paid retakes/year = our "pass first time" value proposition, quantified
- Category-B-only split and first-attempt rates not published **[UNVERIFIED]**
- Course cost (2025–26): **€800–1,000 typical, Sofia up to ~€1,200**; lesson ~40 лв/h — our entire product costs less than 1–2 driving lessons
