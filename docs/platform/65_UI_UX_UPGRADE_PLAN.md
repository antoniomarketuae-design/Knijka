# Книжка.AI — UI/UX Upgrade Plan
### One coherent design direction + a ranked, sequenced execution plan

---

## 1. Design direction — "Cockpit, not chrome"

The app already has a real identity: a dark **cockpit-black HUD** with an **aurora** projection band and holo-cyan telemetry. The audit's core finding is not that this identity is wrong — it's that **it's applied unevenly and rests on hand-tuned per-file values instead of a system.** The premium feel leaks out exactly where it matters most: the register funnel (light native controls on black), the tutor (stock chat template), and the exam result (the emotional peak gets the generic screen). The move is to **codify and enforce the HUD language**, not reinvent it.

### Palette — semantic, not decorative
Today `--danger` (red) is doing three unrelated jobs — beginner low-mastery, "weak concept" info, and wrong-answer error — so red has lost its meaning, and blue simultaneously means "neutral/interactive," "XP," and (on a *failed* exam gauge) "good." Fix the semantics first:

| Token | Reserved meaning — one job only |
|---|---|
| `--accent` (HUD blue) | Interactive / primary action / **XP everywhere** |
| `--accent-2` (holo cyan) | Telemetry & readouts — gauges, **law-citation chips**, active-nav bar |
| `--gold` | **Achievements/medals only** — never XP |
| `--success` (green) | Genuine pass / on-track |
| `--warn` (amber) | Review-due / "напредваш" |
| `--danger` (red) | **Answer-level errors only** — never a beginner's starting state |
| `--info` (violet / `--accent-2`) | Forward-looking info — "Слабо място", "Ново" |

Two hard rules fall out: **(1)** a brand-new learner's gauge and topic bars must render in a neutral/accent "just started" tone, *never* danger-red — the warning-light metaphor should encourage, not punish, at onboarding. **(2)** The exam-result Gauge color must be driven by the *verdict* (pass→success, fail→danger), so the biggest instrument on screen stops contradicting the "Изпитът не е издържан" text beside it.

### Typography — commit to the display face
Pairing: **Exo 2 (`font-display`)** for all headings and the wordmark + **IBM Plex Sans** for body + **mono** for telemetry labels. The distinctive squared HUD headline voice is *loaded and paid for but absent from the nav, the tutor, onboarding, and pricing.* Enforce a single hub-header recipe everywhere: `hud-label` eyebrow → `font-display text-3xl font-black sm:text-4xl` h1 → optional aurora band.

**Type scale floor:** stop shrinking `.hud-label` below its 0.7rem baseline. The landing page's `!text-[0.6rem]` (~9.6px) uppercase letter-spaced Cyrillic is below a legible floor for teens on phones, and three ad-hoc arbitrary sizes fragment the scale. One named `.hud-label-xs` (0.68rem, reduced tracking) token; nothing smaller carries meaning. Verify `--muted` on `--surface-2` hits 4.5:1 in both themes.

### Spacing & the HUD primitives
The gradient progress bar is copy-pasted 4×; `masteryColor()` lives in 3 files flagged "keep in sync"; started-bar floors are 2% vs 3%; due-badges are 10px vs 11px. **The theory/HUD surface feels hand-tuned-per-file because it is.** Ship shared primitives (below) and the spacing becomes system-driven for free.

### Motion — restrained instrument feedback, always `motion-reduce`-safe
Buttons get real press physics (`active:translate-y-px`, glow off on press). Pending states get a small inline SVG spinner in the HUD voice — not a dimmed frozen button. Celebration fires on the **fresh** exam pass. Every animation guarded by `prefers-reduced-motion`.

### What keeps it from reading "generic AI"
Concrete, honest instruments (a gauge that maps to the *real* 87/97 exam threshold), law-citation chips as the visual hero of every tutor answer, and one consistent cockpit frame from landing → auth → onboarding → dashboard → tutor. The failure mode to avoid is a flat card template with an emoji robot; the win is that every surface feels like the same instrument cluster.

---

## 2. Foundational moves — systemic upgrades that lift everything at once

**F1 · Adopt an accessible primitive layer (Radix / shadcn), styled into the HUD skin.**
Five separate findings are the *same* bug: `aria-modal` dialogs that don't trap focus or make the background inert — the mobile drawer, the exam submit confirm, and any future menu/tooltip/toast. A keyboard/SR user can operate the timer and all 45 question buttons *behind* an "open" modal, on the app's one irreversible action. Radix Dialog/DropdownMenu/Tooltip/Popover/Toast give focus-trap + inert + Escape + focus-restore for free. **This also directly prevents the recurring bug class** the founder already hit — a decorative overlay swallowing a primary button's clicks — because these primitives own pointer/focus semantics correctly. *Justification: one dependency retires ~6 accessibility findings and a whole future bug class.*

**F2 · Consolidate design tokens + shared component primitives.**
Extract: `<ProgressBar value max size aria>` (retires 4 copies), one `masteryColor()` + threshold module (retires 3 copies + the drift it caused), one `<ReadoutTile>`/stat-tile, one `<HubHeader>`, one `<Badge>`. *Justification: the audit's "feels fiddly, not premium" verdict is literally per-file drift; primitives make consistency the default.*

**F3 · A single `:focus-visible` standard.**
Remove the global `border-radius: 4px` override — it snaps every rounded-xl control's corners to 4px on keyboard focus and traces a tighter ring than the component, reading as a render glitch for keyboard users. Rely on `outline` + `outline-offset`; modern browsers already follow the element's own radius. *One-line change, app-wide polish.*

**F4 · `color-scheme` declaration.**
Add `color-scheme: dark` to the dark token blocks (`:root`, `[data-theme="dark"]`) and `light` to light. Today native `<input type=date/number/checkbox>`, autofill, and scrollbars paint OS-light on cockpit-black — **in the highest-intent part of the funnel (register + onboarding)** the date calendar glyph is near-invisible and the whole thing reads as broken. *One property, fixes the funnel's premium illusion.*

**F5 · A State Kit — loading / empty / error / pending, all in HUD grammar.**
Add `app/global-error.tsx` + `app/(dashboard)/error.tsx` (client, `reset()`) rendering a `hud-panel` "Нещо се обърка" with retry + "Към таблото" — today *any* server-component throw drops a teen onto Next's default screen with no route back. Add a styled `app/not-found.tsx`. Standardize a `useFormStatus`/`aria-busy` pending button (spinner + label) reused by auth, exam-start, and practice. Rewrite `theory/loading.tsx` to match the real single-column list (it currently mirrors an old 3-col grid and *causes* the content shift it exists to prevent). *Justification: a whole class of states is currently unhandled or off-brand.*

**F6 · A form-accessibility contract (auth funnel first).**
Every input: `aria-invalid`, `aria-describedby`→error `id`; errors in a live region; submit `aria-busy`; focus moves to first invalid field on failure; **errors clear on change/blur** (today stale red persists under a corrected field). *This is the core signup/login funnel — the a11y and the stale-state bugs share one fix.*

**F7 · One source of truth for module/route availability.**
A single `availability` map drives sidebar `NAV_ITEMS` *and* `ModuleGrid` *and* whether a link renders live. Kills the "Simulator looks locked in one place, shipped in another" contradiction and the 404 links in one move.

---

## 3. Ranked issue list (deduped across surfaces)

### 🔴 Critical
| # | Component | Problem | Fix |
|---|---|---|---|
| C1 | `DashboardShell` nav → `/leaderboard`, `/settings` | Both routes have **no `page.tsx`** → every authenticated screen can drop the user onto a raw English Next 404 with no chrome, no way back. | Build the pages, **or** set the existing unused `soon` flag + render as non-navigating; ship a HUD-styled `not-found.tsx`. (F5, F7) |

### 🟠 High
| # | Component | Problem | Fix |
|---|---|---|---|
| H1 | Modals: drawer + exam submit dialog | `aria-modal` but **no focus trap, background not inert**; exam confirm never restores focus to trigger — on the one irreversible action. | Radix Dialog primitive. (F1) |
| H2 | `globals.css :focus-visible` | `border-radius:4px` snaps every rounded control's corners on keyboard focus. | Remove the radius override. (F3) |
| H3 | Native controls (register/onboarding) | No `color-scheme` → light date/number/checkbox/scrollbars on black; date glyph invisible. | `color-scheme` tokens. (F4) |
| H4 | Auth forms | No `aria-invalid`/`aria-describedby`/live region; `aria-busy` missing; focus not moved to error. | Form a11y contract. (F6) |
| H5 | `Gauge` / `TopicMasteryGrid` first-run | Day-one dashboard turns **danger-red** (0/100 gauge + wall of red bars) — punishes beginners. | Neutral "just started" tone; reserve red for at-risk practiced topics. |
| H6 | `PracticeSession` weak-concept badge | "Слабо място" uses the **same danger-red as a wrong answer**, shown *before* answering. | Recolor to `--accent-2`/violet info tone. |
| H7 | Exam result screens | **Reward is backwards**: fresh submit gets the generic card + *no celebration*; a later revisit gets the premium Gauge + Celebration. | Unify on `ScoreReadout`; fire Celebration on fresh pass; delete `ScoreSummaryCard`. (**L effort**) |
| H8 | Exam media questions | Graded questions render only a "coming soon" placeholder yet still carry 1–3 pts → unanswerable-by-luck, breaks the "1:1 официален формат" promise. | Exclude unresolved-media items from `buildExam()` or don't score them. |
| H9 | `ModuleGrid` / sidebar Simulator | "Скоро" card is a live `<Link>` — `aria-disabled` doesn't block navigation; sidebar shows it fully live. | Render `soon` items as non-navigating; single availability source. (F7) |
| H10 | `TutorChat` layout | Container has no bounded height → message list never scrolls, composer drifts below fold, autoscroll is a no-op; new answer can appear off-screen. | Bound height (`h-[calc(100dvh-12rem)] max-h-[80vh]`) so the list owns scroll. |
| H11 | `TutorChat` send() error | Optimistic `setInput("")` before await; on failure the typed (≤500-char) question is lost, orphan bubble left, no retry. | Restore input or add "Опитай пак"; flag orphan; clear error on keystroke. |
| H12 | Tutor page + `TutorChat` | Flagship AI surface speaks **none** of the HUD language — bare header, `.card`, 🤖 emoji. | `AuroraHeader` + `hud-label` eyebrow + `hud-panel` + `IconBot`. |
| H13 | `TopicSectionGroup` progressbar | Missing `aria-valuetext` → not-started topic announced as real "0 percent" (siblings say "все още не е започната"). Primary hub component. | Add `aria-valuetext`. |
| H14 | `btn-accent`/`btn-ghost` | No `:active`, no `disabled`, no loading — every app CTA inherits the gap; disabled primary still glows on hover. | Add active/disabled/loading to the primitives. |
| H15 | App-wide | **No error boundary anywhere** — any server throw → off-brand Next error, no retry. | `error.tsx` + `global-error.tsx`. (F5) |

### 🟡 Medium
| # | Component | Problem | Fix |
|---|---|---|---|
| M1 | Readiness gauge vs caption | Two denominators inches apart: "score/100" vs pass "≥87/97". | Make gauge an explicit % / "шанс за успех", or map onto 0–97 with a marked 87 line. |
| M2 | `XpBar` vs `DailyMissionCard` | XP shown blue in one place, gold in another (gold collides with achievements). | One XP color (`--accent`); gold = achievements only. |
| M3 | Session-summary Gauge | Three conflicting readouts stacked: gauge bands at 0.75/0.5, number/headline at 0.8/0.5. | Unify thresholds or pass explicit color. |
| M4 | Session-summary band copy | Exam-readiness labels ("Почти готов") applied to a single 10-q session → over-claims readiness (north-star concern). | Session-scoped wording; keep readiness band for the cumulative dashboard gauge only. |
| M5 | Practice quota | Mid-session hard `redirect('/pricing')` yanks the user out mid-question, no warning. | Return typed quota result → in-flow soft-gate card; warn near the cap. |
| M6 | `TopicSectionGroup` titles | `truncate` clips long Bulgarian topic names mid-phrase on mobile (sibling uses `line-clamp-2`). | Switch to `line-clamp-2`. |
| M7 | `theory/page` first-run | New account = 16 collapsed near-identical grey rows, no entry point. | Auto-open first not-started topic; add "Разгъни всички"; emphasize the next topic. |
| M8 | Exam-result Gauge color | `tone={passed?'cyan':'brand'}` — a **failed** exam fills the gauge positive blue next to red "не е издържан". | Drive color from verdict (pass→success, fail→danger). |
| M9 | `exams/page` start CTA | Server-action submit, no pending state → double-submit fires `startExamAction` twice. | `useFormStatus` pending button. (F5) |
| M10 | Exam countdown | Clock `aria-hidden` → SR can't query remaining time; low-time cue is color-only. | Accessible minute-granularity label + persistent non-color low-time tag in header. |
| M11 | Onboarding vs auth | Onboarding switches from `hud-panel`+`font-display` to `.card`+default headings mid-funnel. | `hud-panel` container + `font-display` step h1s. |
| M12 | Landing hero | 45/97/40/87 repeated 2–3× within ~600px. | Each number once; drop the redundant 3-col strip. |
| M13 | `TutorChat` composer | Single-line input for invited "опиши ситуация" scenarios; no counter before silent 500-char cutoff. | Auto-growing `<textarea>` (Enter send / Shift+Enter newline) + counter past ~440. |
| M14 | `TutorChat` live region | `aria-live` on whole list → user's own echo + every re-render announced. | Move live region to newest assistant reply only; `role="log"` on list. |
| M15 | Assistant bubbles | `text-sm` legal text at ~700px measure — poor reading comfort where it matters most. | Cap ~60–68ch, bump to `text-[15px]`. |
| M16 | Tutor citation vs sender label | Citation chip (the differentiator) and "Учителят" label both blue → signal doesn't stand out. | Citation → `--accent-2`; label only on first bubble of a group. |
| M17 | Hub headers (pricing/exams) | Inconsistent: pricing h1 smaller + not `font-display`, no eyebrow. | Apply the one `<HubHeader>` recipe to all four hubs. (F2) |
| M18 | `register-form` validation | Errors only clear on next submit → stale red under a corrected field; 409 email error lingers. | Clear on change/blur. (F6) |
| M19 | Landing `.hud-label` overrides | `!text-[0.6rem]` sub-10px uppercase Cyrillic. | One `.hud-label-xs` token, ≥0.68rem, less tracking. |
| M20 | `TopicCard` (dead code) | Imported nowhere yet holds nicer affordances (glow bar, "Тренирай →" CTA) than the shipped component. | Delete, or fold its affordances into `TopicSectionGroup`; extract shared `masteryColor`. (F2) |

### 🟢 Low
| # | Component | Problem | Fix |
|---|---|---|---|
| L1 | `XpBar` | Level rendered 3× (badge + caption + progressbar aria). | Drop "Ниво" prefix from caption; consider badge `aria-hidden`. |
| L2 | `AchievementsRow` | Overflow row: no scroll affordance, not keyboard-reachable; "Виж всички" → `/leaderboard` (wrong surface). | Edge fade + focusable; fix/relabel the link. |
| L3 | Progress bars ×4 | Copy-pasted, will drift. | `<ProgressBar>` primitive. (F2) |
| L4 | Theory family constants | 2% vs 3% floor, 10px vs 11px badges. | Shared constants/badge. (F2) |
| L5 | Practice >9 options | Badge shows "10/11" but real key is "a/b", never surfaced. | Cap ≤9 options or render the real accelerator. |
| L6 | Practice grading | Weak pending feedback — no `aria-busy`, no dim, no spinner. | `aria-busy` + dim + button spinner. (F5) |
| L7 | Exam nav focus | Focus moved to `tabIndex=-1 outline-none` section → sighted keyboard user sees nothing. | Brief visible affordance or focus the legend/first option. |
| L8 | `.hud-label` contrast | ~11px muted mono near/below 4.5:1. | Verify contrast; use `--foreground-dimmed` for label text. |
| L9 | Auth pending | Text-only "Моля, изчакай…", still glows on hover. | Spinner + neutralize disabled hover. (F5, H14) |
| L10 | Password fields | No reveal toggle; login has no "Забравена парола?". | Add reveal toggle + recovery link (stub ok). |
| L11 | Landing CTA copy | Same `/register` labeled 4 ways. | One benefit-led label; header stays "Регистрация". |
| L12 | Hero h1 `<br/>` | Hard breaks → orphan lines at mid widths. | `text-balance` or `hidden lg:inline` break. |
| L13 | Onboarding goal buttons | `aria-pressed`/selected style is dead — click select-and-advances instantly. | Drop the pressed styling (radio-like) or add a confirm beat. |
| L14 | Tutor duplicated copy | Value prop stated twice within one viewport. | Empty state purely functional (prompt + chips). |
| L15 | Tutor disabled opacity | `opacity-60` input vs `opacity-50` button; fallback uses `opacity-80` not `text-muted`. | Standardize. |
| L16 | Tutor autofocus | Gated on `messages.length>0` → empty state never focuses (desktop). | Desktop-only autofocus on mount. |
| L17 | `.visually-hidden` vs `sr-only` | Two parallel SR-only mechanisms. | Standardize on Tailwind `sr-only`. |
| L18 | Theme tokens | Full light/dark palettes ship but nothing sets `data-theme`. | Wire a toggle (localStorage + no-flash script) or drop the overrides. |
| L19 | Nav active state | Label `--accent` + indicator bar `--accent-2` — two blues for one signal. | One accent for the active treatment; keep the 3px bar as non-color cue. |
| L20 | Drawer logo / chrome material | Drawer logo has no close handler (feels dead); sidebar opaque vs topbar glass. | Close on logo tap; one chrome material. |
| L21 | `DashboardShell` | No account/avatar/logout/XP-streak in persistent chrome; mobile loses category context. | Sidebar-footer account block + mobile drawer footer. |
| L22 | `StreakBadge` | Nudge lives only in native `title` — invisible on touch/keyboard. | Surface streak state visibly. |

---

## 4. Sequenced plan

### Quick wins — do now (all S, ship as one "polish + honesty" PR)
High leverage per line changed:
- **F3** remove `:focus-visible` radius override — **S**
- **F4** add `color-scheme` tokens — **S**
- **H2/H5/H6** swap danger-red for neutral/info tones (beginner gauge, weak-concept badge) — **S**
- **H13** add `aria-valuetext` to `TopicSectionGroup` — **S**
- **M8** verdict-driven exam Gauge color — **S**
- **H9/M-nav** single availability source; render `soon` items non-navigating; fixes the 404-link exposure short of building pages — **S**
- **M2/L1** unify XP color + de-dupe level number — **S**
- **M6** `truncate`→`line-clamp-2` — **S**
- **M12/M19/L11/L12** landing: de-dupe stats, kill sub-10px overrides, one CTA label, `text-balance` — **S**
- **H14** add `:active`/`disabled` to button primitives — **S**

### Medium bets — next (M, 1–2 focused PRs each)
- **F1** Radix Dialog → retire H1 + both modal-trap findings *(do before anything else that adds a menu/toast)* — **M**
- **F5** State Kit: `error.tsx`, `global-error.tsx`, `not-found.tsx`, pending-button primitive, rewrite `theory/loading.tsx` — **M**
- **F6** form a11y contract + stale-error clearing (auth funnel) — **M**
- **F2** shared primitives: `<ProgressBar>`, `masteryColor` module, `<HubHeader>`, `<ReadoutTile>`, `<Badge>` — **M** (unlocks M17, L3, L4, M20)
- **H10/H11/H12** tutor overhaul: bounded scroll + error-safe send + HUD skinning + textarea + citation color — **M**
- **H8/M-media** exam media: exclude unresolved-media items from scored assembly — **M** (needs a product call, but the current state can silently cost a pass)
- **M5** practice quota soft-gate instead of hard redirect — **M**
- **M7** theory first-run: auto-open + "Разгъни всички" — **M**
- **C1** build `/settings` + `/leaderboard`, or keep them gated from the quick-win — **M**

### Bigger bet — schedule deliberately
- **H7** Unify the exam result on `ScoreReadout` (Gauge + threshold rail + Celebration on fresh pass); delete `ScoreSummaryCard`/collapse `ExamResultView` to `ScoreReadout + ReviewList` — **L.** Highest emotional payoff in the app; depends on F2's shared `<ReadoutTile>`. Do it after the primitives land so it's a consolidation, not a fourth copy.
- **L18/L21** theme toggle + persistent account/XP chrome — **M**, once the primitives and account surface exist.

**Rationale for the ordering:** the quick-win PR buys the biggest "premium/considered" jump for the least code and removes the dishonest states (fake-disabled links, beginner red, unanswerable exam items). F1 lands before any new overlay work so the founder's overlay-swallows-clicks bug class can't recur. F2/F5/F6 are the multipliers — once primitives exist, roughly a third of the Medium/Low list collapses into "use the primitive." The exam-result unification is saved for last because it's the one L, and it's cheapest and safest *after* the shared tiles exist.