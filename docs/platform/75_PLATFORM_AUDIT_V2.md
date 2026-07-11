# 75 · Platform Audit V2 (post-Alpha)

**Date:** 2026-07-12 · **Branch:** `scenario-engine` · **Auditor:** A4 (platform revision agent)
**Scope:** the non-sim product — landing, auth, onboarding, dashboard, theory, practice, exams, tutor, simulator *shell*, pricing, review tool, legal, navigation. READ-ONLY audit; no fixes applied.
**Method:** full code review of every `platform/src/app/**` route + its component tree, live checks against `localhost:3000` (fresh account `audit-a4@example.com`), SSR status sweep of all 19 URLs, entitlement/quota flow tracing, content-bank cross-checks.

Severity legend: **[CRIT]** breaks a core promise or leaves users stranded · **[HIGH]** visibly wrong/stale or damages trust · **[MED]** quality gap, worth fixing before launch · **[LOW]** polish.

---

## 0. Honest scores per area

| Area | /10 | One-line verdict |
|---|---|---|
| Visual consistency (tokens, HUD language) | 9 | Exemplary. One color-rule violation (SectionCard danger-red). |
| Copy quality (BG, tone for 17–18yo) | 8 | Warm, honest, correct — but 7 surfaces still say the simulator doesn't exist. |
| Information hierarchy | 8 | Dashboard and theory hubs are strong; first-run dashboard is noisy. |
| Empty/loading/error states | 6 | Great empty states; loading skeletons on only 3 of 8 authed routes; **zero error.tsx**. |
| Mobile layout | 8 | Responsive classes disciplined throughout; drawer nav solid. |
| A11y | 8 | Skip link, focus management, aria-live, progressbar semantics — rare quality. Contrast OK. |
| Navigation / IA | 6 | Two nav items are inert "Скоро"; a real link 404s to /leaderboard; **no logout anywhere**. |
| Integration honesty (sim ↔ platform) | 5 | Readiness/weak-spots/XP genuinely wired — but the *copy* everywhere still denies the sim exists, and the paywall matrix contradicts the product. |
| Onboarding coherence | 5 | Collects exam date + daily goal, promises a countdown, then **never uses either**. |
| Monetization surfaces | 6 | Honest table + FAQ; but both paywall redirects render **no banner** (unknown `status` values). |
| Auth & account lifecycle | 4 | Register/login fine; **no logout, no password reset, no settings, no self-service deletion**. |
| Legal/GDPR surfaces | 7 | Genuinely good drafts + draft banner; entity placeholders visible; consent text links nothing. |

**Overall: 6.5/10** — the screens that exist are top-decile craft; the product *around* the screens (account lifecycle, stale sim story, dead promises) is what drags it down.

---

## 1. Per-route findings

### 1.1 `/` — Landing (`platform/src/app/page.tsx`)
- **[HIGH] Stale sim feature card.** `buildFeatures()` line ~37: „Кокпит шофиране в браузъра … **в разработка, идва след теорията**" + `soon: true` → „Скоро" badge. The simulator is shipped with 7 lessons + exam mode. The landing page undersells the single most differentiating feature.
- **[MED] Session-blind header.** Logged-in visitors still see Вход/Регистрация. No „Към таблото" swap.
- **[LOW]** Honest live counts from the content repo (`над 1000 въпроса`) — verified true (1016). Good pattern.
- **[LOW]** Telemetry row `45 · 97 · 40` vs rules card elsewhere `45 · 97 · 87 · 40:00` — the landing omits the pass mark, the one number students obsess over.
- A11y/visuals: hero gauge has proper `ariaLabel`, decorative layers `aria-hidden` + `pointer-events-none`. Excellent.

### 1.2 `/login`, `/register` (`(auth)/…`)
- **[CRIT] No password reset path exists anywhere.** No „Забравена парола?" link, no route, no module support. A 17-year-old who forgets their password loses their progress permanently (support email is a placeholder — see 1.10).
- **[HIGH] Consent checkbox links nothing.** `register-form.tsx` ~line 213: the GDPR consent sentence names no documents and links neither `/privacy` nor `/terms` (both exist and are good). Minors consenting without a readable policy link is a compliance gap, and the code itself says `final wording pending legal review`.
- **[MED] Hardcoded birth-year ceiling.** `CURRENT_MAX_YEAR = 2012` (line 14) — a constant that silently raises the minimum age every January. Should be computed (`new Date().getFullYear() - MIN_AGE`).
- **[LOW]** Login/registration errors are well-handled (409/400 field mapping, generic credential error that doesn't leak account existence). `noValidate` + custom validation is consistent.
- **[LOW]** After register → `signIn` failure falls back to `/login` without a message explaining "account created, please log in".

### 1.3 `/onboarding` (`onboarding/page.tsx` + `components/onboarding/*`)
- **[CRIT] Collected data is never used.** `readExamDate()` / `readDailyGoalMin()` (storage.ts) have **zero consumers** outside the onboarding itself. Step 1 explicitly promises: „ще ти показваме колко дни остават" — the dashboard shows no countdown, no daily-goal ring, nothing. This is a broken promise at minute one of the relationship.
- **[HIGH] Stale sim tour copy.** `OnboardingFlow.tsx` TOUR_ITEMS: „Кокпит шофиране в браузъра — **идва скоро след теорията**."
- **[MED]** Final CTA „Започни първия урок" routes to `/dashboard`, not to a lesson (`/theory` or smart practice). CTA copy ≠ destination.
- **[LOW]** Back button exists, skip is honest, progress dots have SR text. Good flow mechanics.

### 1.4 `/dashboard` (`(dashboard)/dashboard/page.tsx` + `components/dashboard/*`)
- **[HIGH] Broken link to `/leaderboard`.** `AchievementsRow.tsx` line ~36: „Виж всички" → `/leaderboard`, which has **no page** (`availability.ts` marks it „soon"; the custom 404 catches it, but it's still a dead end reachable in two clicks from the hub).
- **[HIGH] Module card stale copy.** `ModuleGrid.tsx` line 36: „Кокпит шофиране в браузъра — **в разработка**." + „в разработка" badge via `availability.ts` (`/simulator: "dev"`). The sim is live; the badge tells paying-intent users it isn't.
- **[MED] Weak deep links.** `TopicMasteryGrid.tsx` „Препоръчано за упражнение" chips → `/theory` (generic), though `weakestConcepts[].topicId` is right there; `ContinueLessonCard` „Продължи" → `/theory` (data.ts `getContinueLesson()` hardcodes `href: "/theory"`); `DailyMissionCard` „Към мисията" → `/theory` even when the mission is „от най-слабата ти тема". Three cards promise targeting and deliver the hub. (Contrast: `SimWeakSpotsCard` does it right — `/theory/practice?topic=<slug>`.)
- **[MED] First-run noise.** A brand-new user sees 16 „—" topic bars + a mission referencing „най-слабата ти тема" they don't have yet. Consider a compact first-run variant.
- **[LOW]** Integration honesty is REAL here: readiness genuinely blends sim evidence (learning/readiness.ts A14 blend), sim weak spots and sim XP are wired. The copy „и карането ти в симулатора" is true. This is the best-integrated surface — the *cards around it* are what's stale.
- **[LOW]** Sidebar shows no user identity (name/email) anywhere in the shell.

### 1.5 `/theory` + `/theory/practice`
- **[MED] Color-rule violation.** `SectionCard.tsx` line 9: started-but-low mastery paints `var(--danger)`, directly contradicting the documented rule (and sibling implementations in `TopicSectionGroup.tsx`, `TopicMasteryGrid.tsx`: „started-but-low is neutral accent, **never danger-red**"). A beginner opening their first topic sees red bars.
- **[MED] Quota invisible until it bites.** Free users get 20 practice questions/day (`quota.ts`), but no surface shows „X от 20 за днес". Hitting the cap mid-session triggers `redirect("/pricing?status=quota")` from inside the submit action — the student loses their session and lands on pricing **with no banner** (see 1.9).
- **[LOW]** Practice runner is excellent: server-side grading, no leaked answers, keyboard shortcuts with SR-safe live region, per-concept mastery deltas, weakest-concept CTA with correct deep link. Empty state is thoughtful with the gating explanation.
- **[LOW]** `PracticeSession` re-registers its keydown listener every render (deliberate, documented; harmless at this scale).

### 1.6 `/exams` + `/exams/[attemptId]`
- **[HIGH] Silent paywall bounce.** `actions.ts` line 58: over-limit users are redirected to `/pricing?status=exam-limit` — `parsePricingStatus` doesn't recognize `exam-limit`, so **no message renders**. In production the second „Започни пробен изпит" click lands the user on the pricing page with zero explanation. (Dev bypasses the cap, so this was never seen locally.)
- **[MED] No loading.tsx.** The hub reads exam history from the DB; navigation blocks with no skeleton (dashboard/theory both have one).
- **[LOW]** In-progress attempts abandoned on another device stay „Незавършен" forever; `CannotRestoreView` copy handles the resume case honestly. Acceptable v1.
- **[LOW]** Media placeholder in `ExamRunner` („изображение … скоро ще бъде наличен") is currently unreachable — all 1016 bank questions have `media: null`. Fine as defensive UI; becomes a real problem the day media questions enter the bank before assets do.
- Runner quality is outstanding: seed-cookie restore, localStorage mirror, server-clock elapsed, checkpoint aria-announcements, flag-for-review, unanswered-count confirm dialog, auto-submit at 0:00. The single best screen in the product.

### 1.7 `/simulator` (shell only — sim internals are another agent's scope)
- **[LOW]** Select screen is clean, server-computed progression, dynamic-imported 3D (verified `SceneSlot.tsx` uses `next/dynamic`, select screen stays 3D-free). Session history (A15) with honest degradation for legacy rows.
- **[MED] Copy risk at the gate:** for a fresh user only „Свободно каране" is open and Lesson 1 says „Издържи предишния урок, за да се отключи" — the previous „lesson" is free-ride with „БЕЗ ЗАДАЧИ", so „издържи" reads confusing. (Flag for the sim-UX owner; unlock copy should say what actually unlocks L1.)
- **[MED]** No loading.tsx (DB reads: sessions + history).

### 1.8 `/tutor`
- **[MED] Nav says live, page says soon.** Sidebar/ModuleGrid badge the tutor as fully live, but without `ANTHROPIC_API_KEY` the page renders „AI Учителят се активира скоро". If launch ships with the key set this is moot — but `availability.ts` cannot represent „enabled-but-unconfigured", so a misconfigured deploy silently advertises a dead feature.
- **[LOW]** Chat UI: law-citation chips, daily-limit state with friendly „До утре! 👋", focus return after answer, live region. No streaming (acceptable v1); no „clear conversation" control (GDPR nicety, thread is stored server-side).
- **[MED]** No loading.tsx (thread fetch blocks).

### 1.9 `/pricing`
- **[CRIT] Both paywall entry statuses render nothing.** `StatusBanner.tsx` `parsePricingStatus` accepts only `success|cancelled|unavailable|error`. The two ways a free user is *pushed* here — `?status=quota` (practice cap) and `?status=exam-limit` (exam cap) — are unknown values → `null` → no banner. The single highest-intent monetization moment in the product says nothing about why the user is there.
- **[HIGH] Paywall matrix contradicts the product.** ComparisonTable: „Оценка на готовността за изпит — Безплатно: ✗" but the dashboard shows the readiness ring to every account with no entitlement check; „Шофьорски симулатор (при пускането му) — premium only" but `/simulator` has **no entitlement gate** and the sim is launched. Either gate the features or fix the table — right now it's dishonest in the customer's favor *and* stale.
- **[HIGH] Stale sim copy ×3.** `packs.ts`: „Шофьорски симулатор — достъп **при пускането му**" (feature line ~73 + checkout description ~68); `FaqSection.tsx` item 5: „от момента на пускането му"; `ComparisonTable.tsx` row 5 label.
- **[LOW]** Inline fulfillment + webhook idempotency is well done; „Скоро" state when Stripe is unconfigured is honest.
- **[MED]** No loading.tsx (entitlement fetch).

### 1.10 Legal group (`/terms`, `/privacy`, `/cookies`, `/contact`)
- **[HIGH] Placeholders in production-visible copy:** `[ИМЕ НА ЮРИДИЧЕСКО ЛИЦЕ]`, `[ЕИК]`, `[АДРЕС]`, `[ИМЕЙЛ ЗА КОНТАКТ]`, `[ДАТА]` render on every legal page — including the Contact page's only support channel. The draft banner mitigates but a user needing help today has literally no address. **Launch blocker checklist item.**
- **[LOW]** Content quality is exceptional for drafts: KZLD card, processor tables, minor-specific section, plain-language register. Keep.
- **[LOW]** Landing/legal footers say © 2026 (correct this year; make dynamic at build).

### 1.11 `/review` (founder tool)
- **[LOW]** Correctly 404s in production, `robots: noindex`, auth-gated. No issues.

### 1.12 Navigation & 404
- **[CRIT] No logout.** `signOut` is exported from `src/auth.ts` and **used nowhere**. Neither sidebar, drawer, nor any page offers „Изход". Target users are teenagers on shared/family/school computers.
- **[HIGH] Two of eight nav items are inert** („Класация", „Настройки" — „Скоро"). One dead nav item is a teaser; two starts reading as an unfinished product. Settings, at minimum, has real jobs waiting: logout, theme toggle (tokens support `data-theme` but nothing sets it), daily goal/exam date editing, account deletion request.
- **[MED]** `requireUser()` redirects to `/login` with **no callbackUrl** — deep links to `/theory`, `/exams` etc. lose the destination after login (proxy matcher only covers `/dashboard/:path*`).
- **[LOW]** Custom 404 is on-brand with a way back. Good.
- **[CRIT-adjacent] No `error.tsx` / `global-error.tsx` anywhere.** Any thrown server/render error shows Next's default English stack screen to a Bulgarian teenager. One file fixes the whole group.

---

## 2. Cross-cutting themes

1. **The platform still tells the story of March, not July.** The sim shipped (cockpit view, mirror budget, lesson ladder, exam mode) but 7 distinct surfaces say „в разработка / скоро / при пускането му": availability.ts, ModuleGrid, landing features, onboarding tour, ComparisonTable, packs.ts (×2), FaqSection. One PR kills all of them.
2. **Account lifecycle is the missing quadrant.** register → use → *(nothing)*. No logout, no password reset, no settings, no deletion, no profile display. Everything else is B+ or better; this is an F and it's what auditors, parents, and the КЗЛД look at first.
3. **Promises vs. plumbing.** The plumbing is honest (readiness genuinely blends sim, XP flows from all three activity types, weak spots link correctly) — the *promises* are not (onboarding countdown never shown, paywall matrix gates nothing, mission/continue cards don't deep-link). The gap is always in the last mile of wiring, never in the engine.
4. **Freemium is enforced but mute.** Quotas exist and work (20/day, 1 exam), but the UI never shows remaining quota, and both cap-hit redirects render no explanation. Monetization currently *feels* like a bug.
5. **Design-system discipline is genuinely high** — tokens, HUD voice, motion-reduce, focus management are consistent enough that the one deviation (SectionCard red) stands out as provably wrong by the codebase's own comments.
6. **Streaming/loading coverage is half-done:** loading.tsx on dashboard/theory/practice, absent on exams/simulator/tutor/pricing/attempt. Missing error boundaries compound it.

---

## 3. THE TOP-20 FIX LIST (exact specs for the fix army)

Each item: **file → change → expected result.** Ordered by (impact × cheapness).

1. **Add logout.** `platform/src/components/dashboard/DashboardShell.tsx`: add an „Изход" button at the sidebar bottom (below the „Обучение" card) and in the mobile drawer; client `signOut({ callbackUrl: "/" })` from `next-auth/react`. → Every authed screen can sign out.
2. **Flip the simulator to live.** `platform/src/components/dashboard/availability.ts`: `"/simulator": "dev"` → `"live"`. → „в разработка" badge disappears from sidebar + ModuleGrid simultaneously (single source of truth works as designed).
3. **ModuleGrid sim copy.** `platform/src/components/dashboard/ModuleGrid.tsx` line 36: `"Кокпит шофиране в браузъра — в разработка."` → `"Кокпит шофиране по улиците на Студентски град — с инструктор в реално време."` → Hub card sells the shipped feature.
4. **Landing sim feature.** `platform/src/app/page.tsx` `buildFeatures()`: remove `soon: true`; text → `"Кокпит шофиране в браузъра по реалната улична мрежа на Студентски град — уроци, изпитен режим и оценяване по официалната система."` → No „Скоро" badge on the landing.
5. **Onboarding tour sim item.** `platform/src/components/onboarding/OnboardingFlow.tsx` TOUR_ITEMS: `"Кокпит шофиране в браузъра — идва скоро след теорията."` → `"Кокпит шофиране в браузъра — уроци по реални улици с инструктор."`
6. **Pricing status coverage.** `platform/src/components/payments/StatusBanner.tsx`: extend `PricingStatus` with `"quota" | "exam-limit"`; add messages — quota: `"Дневната безплатна порция от 20 въпроса свърши. Утре има нова — или продължи без лимит с пакет."`; exam-limit: `"Безплатният пробен изпит е използван. Пакетите дават неограничени изпити в официалния формат."`; styles: both `border-accent/50 text-accent` (invitation, not error). → Paywall landings explain themselves.
7. **packs.ts sim lines.** `platform/src/modules/payments/packs.ts` line ~73: `"Шофьорски симулатор — достъп при пускането му"` → `"Шофьорски симулатор — пълен достъп"`; line ~68 checkout description: `"… + шофьорски симулатор при пускането му."` → `"… + шофьорски симулатор."`
8. **ComparisonTable sim row.** `platform/src/components/payments/ComparisonTable.tsx` row 5: label `"Шофьорски симулатор (при пускането му)"` → `"Шофьорски симулатор"`.
9. **FAQ sim answer.** `platform/src/components/payments/FaqSection.tsx` item 5: `"… включва достъп до шофьорския симулатор от момента на пускането му, без доплащане …"` → `"… включва пълен достъп до шофьорския симулатор, без доплащане, докато пакетът ти е активен."`
10. **Kill the /leaderboard dead end.** `platform/src/components/dashboard/AchievementsRow.tsx` line ~36: remove the „Виж всички" `<Link href="/leaderboard">` (or point to nothing until the page exists). → No 2-click 404 from the hub.
11. **SectionCard red → accent.** `platform/src/components/theory/SectionCard.tsx` line 9: `if (mastery > 0) return "var(--danger)"` → `"var(--accent)"`. → Beginners' section bars match the documented neutral-encouragement rule everywhere.
12. **Add error boundary.** New file `platform/src/app/(dashboard)/error.tsx` (client component): on-brand card („Нещо се обърка", „Опитай отново" via `reset()`, link „Към таблото"), mirroring not-found.tsx's cockpit style. Optionally also `platform/src/app/error.tsx` for public pages. → Server errors never show the raw English screen.
13. **Deep-link the weakest-concept chips.** `platform/src/components/dashboard/data.ts` `getReadiness()`: resolve each weakest concept's topic slug via the content repo (same pattern as `getSimWeakSpots`) and emit `href: /theory/practice?topic=<slug>`; consume it in `TopicMasteryGrid.tsx` (replace hardcoded `/theory`). → „Препоръчано за упражнение" actually starts targeted practice.
14. **Deep-link Continue.** `platform/src/components/dashboard/data.ts` `getContinueLesson()` line ~190: `href: "/theory"` → `` href: `/theory/practice?topic=${slug}` `` (weakest started topic's slug via repo lookup). → The hero CTA drops the student into the right session, one click instead of three.
15. **Surface the exam-date countdown.** `platform/src/app/(dashboard)/dashboard/page.tsx` + a small client component (reads `readExamDate()` from `@/components/onboarding/storage`): render „🗓 X дни до изпита" pill in the dashboard header when a date exists and is future. → The onboarding promise („ще ти показваме колко дни остават") becomes true. *(v1 client-side is fine; server column is the documented post-launch path.)*
16. **Practice quota counter.** `platform/src/app/(dashboard)/theory/practice/page.tsx`: call `checkPracticeQuota(user.id)`; when `!unlimited`, pass `remainingToday`/`limit` into `PracticeSession` and render „Днес: X от 20 безплатни въпроса" over the progress bar; when `remainingToday === 0` render an inline paywall card instead of the session (avoids the mid-session hard redirect). → Free tier is visible before it bites.
17. **Register consent links.** `platform/src/app/(auth)/register/register-form.tsx` consent `<span>`: link „Условията за ползване" → `/terms` and „Политиката за поверителност" → `/privacy` inside the sentence (target="_blank"). → Consent references readable documents.
18. **Dynamic birth-year bound.** Same file, line 14: `const CURRENT_MAX_YEAR = 2012;` → `const CURRENT_MAX_YEAR = new Date().getFullYear() - 14;` (or the intended minimum age). → No annual drift.
19. **Preserve deep-link on login.** `platform/src/proxy.ts` `config.matcher`: add `"/theory/:path*", "/exams/:path*", "/simulator/:path*", "/tutor/:path*", "/pricing/:path*"` — the proxy already builds `callbackUrl` correctly. → Logging in returns you where you were headed.
20. **Loading skeletons for the four DB routes.** New files: `(dashboard)/exams/loading.tsx`, `(dashboard)/simulator/loading.tsx`, `(dashboard)/tutor/loading.tsx`, `(dashboard)/pricing/loading.tsx` — copy the dashboard skeleton pattern (pulse cards matching each layout). → No frozen navigation on cold DB reads.

---

## 4. Ranked backlog (larger improvements)

| # | Item | Why | Effort |
|---|---|---|---|
| B1 | **/settings page v1**: profile (name/email display), logout, theme toggle (`data-theme` — tokens already support it), exam date + daily goal editing (migrate localStorage keys per storage.ts plan), „изтрий акаунта ми" request button (mailto or server action). Flip `availability.ts` to live. | Kills an inert nav item; GDPR self-service; homes items 1/15/18 properly | M (1–2d) |
| B2 | **Password reset flow** (request → token e-mail → new password). Needs a mail provider decision first. | Only unrecoverable failure mode in the product | M–L (2–3d) |
| B3 | **Free-tier honesty pass**: either gate readiness ring + simulator behind entitlements per the ComparisonTable, or amend the table (readiness → free; sim → „5 безплатни минути" teaser or honest ✗ with gate). Decision doc → ADR. | Paywall matrix must match reality before first paid user | S (decision) + M (gating) |
| B4 | **/leaderboard v1** or removal from nav. If kept: weekly XP leaderboard from gamification store, opt-in pseudonyms (minors!). | Second inert nav item; achievements row needs a home | M |
| B5 | **First-run dashboard variant**: hide the 16-bar grid + mission until ≥1 answer exists; show a single „Направи първите 5 въпроса" card. | First impression currently reads „empty product" | S–M |
| B6 | **Exam-history detail retention**: persist graded per-question payloads server-side so review works cross-device (StoredReview currently device-local). | „Прегледай грешките от миналата седмица" is a core study loop | M |
| B7 | **Tutor availability plumbed into nav**: export `isTutorEnabled()` state into the shell (server layout) so the badge matches the page. | Removes the live-but-dead inconsistency class | S |
| B8 | **Landing session awareness**: `getSessionUser()` in the landing header → „Към таблото" button for authed visitors. | Standard courtesy; costs one lookup | S |
| B9 | **Onboarding → server**: `examDate`/`dailyGoalMin` columns on User + migration-on-login from the versioned localStorage keys (documented plan in storage.ts). | Device-independent countdown; unlocks B5 personalization | M |
| B10 | **Daily-goal loop**: goal ring on dashboard (minutes practiced today vs goal), fed by trackActivity timestamps. | The second unused onboarding answer becomes a retention loop | M |
| B11 | Public-asset cleanup: delete `next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg` from `platform/public`. | Boilerplate cruft in a shipped bundle | XS |
| B12 | Unlock copy on simulator L1 („Издържи предишния урок") vs L0 free-ride („БЕЗ ЗАДАЧИ") — reconcile with sim owner. | Confusing gate for every new driver | S (copy) |

---

## 5. What is genuinely excellent (do not regress)

- **ExamRunner**: seed-cookie deterministic restore, server-clock elapsed, localStorage mirroring, checkpoint SR announcements, flag-for-review, honest confirm dialog. Ship-quality.
- **PracticeSession**: server-side grading with zero answer leakage, keyboard UX, mastery deltas, law-ref chips.
- **availability.ts pattern** — one flip fixes nav + hub simultaneously (used in Fix #2).
- **Legal drafts**: plain-language, minor-aware, KZLD/КЗП complete, draft-banner honesty.
- **A11y discipline**: skip link, `focus-visible` token, drawer focus trap + Escape + return-focus, `aria-live` regions, progressbar semantics, `motion-reduce` on every animation.
- **Sim→theory loop**: readiness blend (A14), weak-spot cards with correct topic-scoped deep links, sim XP via recordActivity — the integration *engine* is honest; only its marketing copy lies.

*Verification notes: all 19 routes SSR-checked (200/307/404 as designed); authed flows exercised with a fresh account; the „stuck skeleton" seen on hard loads of /theory in the embedded preview browser was verified to be a preview-tool artifact (full HTML + `$RC` swap script present in the response; client-side nav renders correctly).*
