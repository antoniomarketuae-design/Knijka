# DATA PRIVACY AND AI ETHICS

> Status: ✅ v1 drafted (2026-07-08) — describes the privacy architecture as built and the legal-page drafts at `platform/src/app/(legal)/`.
> **⚠ Everything user-facing carries the banner „Работна версия — подлежи на преглед от юрист преди официалния старт.“ — nothing here is legal advice, and launch is gated on review by a Bulgarian lawyer.**

Related: ADR-004 (no biometrics) in [architecture/07](../architecture/07_ARCHITECTURE_DECISION_RECORDS.md) · security posture in [architecture/08](../architecture/08_SECURITY_ARCHITECTURE.md) · exam format in [education/32](../education/32_EXAMINATION_SYSTEM.md).

## 1. Privacy posture (one paragraph)

B2C product whose core users are 14–18-year-old Bulgarians, so the design target is *provable minimalism*: no ЕГН, no address, no phone, no photos, no biometrics (ADR-004), no ads, no analytics/tracking cookies, no data sales, EU-resident database. The only personal data in the system is what the service literally cannot run without, plus payment records the law forces us to keep.

## 2. Data map (what exists, where, why)

| Data | Store | Purpose | Legal basis (GDPR art. 6(1)) |
|---|---|---|---|
| Email, name, birth year, password (bcrypt hash), consent timestamp (`User`) | Neon Postgres (Frankfurt, EU) | Login, addressing the student, age gate, proof of consent | (b) contract; (a) consent at registration |
| Learning progress: per-concept mastery, question attempts, exam attempts, gamification (`Progress`, `QuestionAttempt`, `ExamAttempt`, `GamificationState`) | Neon | Adaptive practice + honest readiness stats | (b) contract |
| Tutor threads: messages, token/cost counters (`TutorThread`) | Neon | Conversation continuity, daily limit (30 msgs), quality/cost control | (b) contract |
| Entitlements: pack id, purchase date, expiry, Stripe reference (`Entitlement`) | Neon | Grant paid access; accounting trail | (b) contract; (c) legal obligation |
| Card/payment data | **Stripe only** — never touches our servers | Payment processing | Stripe acts as processor (and independent controller for its own fraud prevention) |
| IP addresses, request logs | Vercel (EU region planned) | Security, debugging | (f) legitimate interest |
| Preferences (exam date, daily goal, onboarding flag, sim audio/quality, exam answer/review caches) | **localStorage only** — never sent to server | UX convenience, refresh safety | n/a (device-local) |

**Cookies (complete inventory, both strictly necessary, both httpOnly):**
- `authjs.session-token` / `__Secure-authjs.session-token` — NextAuth JWT session, ≤30 days.
- `knizhka_exam_seed_<attemptId>` — exam rebuild seed, ~2h self-expiring.

**localStorage keys (complete):** `knizhka.v1.examDate`, `knizhka.v1.dailyGoalMin`, `knizhka.v1.onboardingCompletedAt`, `knizhka.exam.answers.<attemptId>`, `knizhka.exam.review.<attemptId>`, `knijka.sim.volume`, `knijka.sim.muted`, `aidrive.sim.quality.v1`.

## 3. Processors

| Processor | Role | Location / transfer mechanism | DPA status |
|---|---|---|---|
| Vercel Inc. | App hosting | EU region planned; US entity → SCC + EU-US DPF | **TODO: execute DPA** (Vercel offers standard DPA) |
| Neon Inc. | Postgres | Frankfurt (EU) — data at rest stays in EU | **TODO: execute DPA** |
| Stripe | Payments | Stripe Payments Europe Ltd (IE) for EU merchants; SCC/DPF for US legs | **TODO: accept Stripe DPA** |
| Anthropic PBC | LLM inference for the AI tutor | US → SCC and/or DPF | **TODO: execute Anthropic commercial DPA; verify current DPF certification status** |

What is sent to Anthropic per tutor question (verified against `platform/src/modules/tutor/service.ts`): the question text, up to the last 12 thread messages, retrieved content-bank excerpts, and up to 3 weakest-concept titles. **No name, email, or birth year is ever sent.** Anthropic commercial terms: API data not used for model training by default — re-verify wording at DPA signing.

## 4. Minors handling

- **Bulgarian threshold: 14 years** — чл. 25в ЗЗЛД (Bulgaria's transposition choice under GDPR art. 8(1), which allows 13–16). Processing a child's data based on consent for information-society services is lawful from age 14; under 14 requires consent from the parent exercising parental rights or the guardian. Sources: КЗЛД guidance „Правата на децата и младите хора при работа в дигитални платформи“ (cpdp.bg); analysis of the 2019 ЗЗЛД amendments (trudipravo.bg, „Промените в ЗЗЛД, свързани с прилагането на Регламент (ЕС) 2016/679“).
- **Enforcement in product:** the register form caps birth year at 2012 (`CURRENT_MAX_YEAR` in `register-form.tsx`), i.e. nobody under 14 in 2026 can register — so we never rely on parental-consent flows at all. ⚠ This constant must be bumped yearly (or computed from the current date) — see open items.
- Privacy policy §5 states the 14+ rule, tells under-18s to show the page to parents, and invites parents to exercise rights on the child's behalf. Terms §6 requires parental approval for purchases by minors (contract capacity under Bulgarian civil law — lawyer to confirm framing).

## 5. AI ethics / transparency commitments (as published)

- Tutor is grounded in our content bank and must cite law refs (ADR-002 — no free recall of Bulgarian law).
- Published in privacy policy §7: what the tutor is, exactly what is transmitted to Anthropic, storage/deletion, **no automated decisions with legal or similarly significant effect (GDPR art. 22)** — readiness scores are explicitly labeled a learning aid, and honesty about model fallibility ("trust the cited law, not the chat").
- Users are told not to paste personal data into the chat.
- Honest-readiness principle is contractual language in terms §8: we promise honest stats, we do not promise exam success.

## 6. Why no cookie banner today (justification)

Both cookies are strictly necessary for a service the user explicitly requested (session auth; exam-refresh integrity) — the ePrivacy consent requirement (Directive 2002/58/EC art. 5(3), transposed in Bulgarian electronic-communications law) exempts strictly necessary storage. localStorage keys are device-local preferences never transmitted to us. There is zero analytics/advertising/tracking storage. The cookies page states this plainly and commits: any future non-essential cookie ⇒ consent banner + page update *before* anything is written. Lawyer to confirm the reading.

## 7. Legal pages shipped (drafts)

`platform/src/app/(legal)/` — shared layout renders the „Работна версия“ banner on every page; ~65ch prose column; card/table design language; TOC anchors on long pages. Routes: `/terms`, `/privacy`, `/cookies`, `/contact`. Placeholders used everywhere: `[ИМЕ НА ЮРИДИЧЕСКО ЛИЦЕ]`, `[ЕИК]`, `[АДРЕС]`, `[ИМЕЙЛ ЗА КОНТАКТ]`, `[ДАТА]` (single source: `legal-ui.tsx`).

Key drafted positions a lawyer must bless:

1. **Withdrawal right:** immediate digital access + express waiver per чл. 57, т. 13 ЗЗП; if the waiver consent is not given, access activates after the 14-day period. Statutory conformity remedies (ЗПЦСЦУПС) explicitly preserved.
2. **No certificates** (ADR-003) and "does not replace a licensed автошкола" stated as a dedicated terms section.
3. **Liability cap:** indirect damages excluded; total liability capped at amounts paid in the last 12 months; consumer-law carve-outs preserved.
4. **Premium-sim fairness clause:** pro-rata refund if a "при пускането ѝ" feature doesn't ship within the buyer's 4-month window (drafted as good faith — founder/lawyer to confirm).
5. **Unilateral changes:** 14-day advance notice for material terms changes; notice-before-effect for material privacy changes.
6. Governing law BG, Bulgarian courts, КЗП + ADR bodies referenced. The EU ODR platform is deliberately **not** referenced (discontinued July 2025).
7. Informal „ти“ register throughout (matches product voice; readable by a 17-year-old) — a lawyer may prefer „Вие“; stylistic, reviewable choice.

## 8. Open items (blocking or pre-launch)

| # | Item | Owner |
|---|---|---|
| 1 | Fill all five placeholders once the entity exists ([ИМЕ НА ЮРИДИЧЕСКО ЛИЦЕ], [ЕИК], [АДРЕС], [ИМЕЙЛ ЗА КОНТАКТ], [ДАТА]) | Founder |
| 2 | Full legal review by a Bulgarian lawyer; then remove `DraftBanner` from `(legal)/layout.tsx` | Founder + lawyer |
| 3 | Execute DPAs: Vercel, Neon, Stripe, Anthropic; verify each one's current DPF certification | Founder |
| 4 | **Checkout integration TODO:** the withdrawal-waiver checkbox („искам незабавен достъп и потвърждавам, че губя правото на отказ“) must be added to the Stripe Checkout flow (custom consent field) and its acceptance stored per purchase | Dev (payments module) |
| 5 | Records of processing activities (GDPR art. 30 ROPA) — small controller, but AI + minors make it prudent; derive directly from §2–§3 tables | Founder |
| 6 | Register-form consent text says „AI Driving Academy“ — align to Книжка.AI + entity name, and link /privacy + /terms from the register form | Dev |
| 7 | `CURRENT_MAX_YEAR = 2012` hardcoded in `register-form.tsx` — compute from current year (currentYear − 14) so the 14+ gate doesn't rot in January 2027 | Dev |
| 8 | Retention automation: inactive-account deletion not implemented — decide horizon (e.g. 3 years) + notify-then-delete job; the published policy promises notice before introducing it | Founder + dev |
| 9 | Confirm VAT/tax registration posture so "цените включват всички данъци" stays true | Founder + accountant |
| 10 | EU AI Act check before launch: tutor is a limited-risk chatbot → transparency duty (users know they talk to AI — already explicit in product + policy); confirm no high-risk classification applies to readiness scoring | Lawyer |

## 9. What deliberately does NOT exist (assert on every review)

No ЕГН · no address/phone · no biometrics (ADR-004) · no analytics or tracking cookies · no ad tech · no data selling/sharing beyond the four processors · no automated decisions with legal effect · no model training on user data by us; Anthropic API default is no-training (re-verify at DPA).
