# 64 · UI Visual Direction — "Cockpit" Design System

**Status:** Accepted & implemented (founder approved HUD-led, 2026-07-08)
**Date:** 2026-07-08
**Owner:** Technical co-founder
**Supersedes:** the current placeholder dark-navy theme (kept as the base to *evolve*, not replace)
**Live showcase:** three directions running with real effects → `https://claude.ai/code/artifact/b7e51da1-2764-4978-a36e-9dfbd86d848c`

## Implementation log (2026-07-08)

HUD-led direction approved and built across the platform in one pass (foundation by hand, four parallel agents on disjoint surfaces). Shipped:
- **Foundation** — `globals.css` HUD token system (dark + light + `data-theme`), all legacy token names preserved; `--accent-2` holo-cyan, `--hair`, `--font-display` added. Fonts swapped Geist → **Exo 2 / IBM Plex Sans / JetBrains Mono** (all Cyrillic) via `next/font/google` in `layout.tsx`. HUD utility classes (`.hud-panel`, `.hud-grid`, `.hud-label`, `.grain`, `.hud-sweep`, `.aurora-drift`).
- **Signature** — `src/components/hud/Gauge.tsx` (270° holographic speedometer, needle sweep + count-up, reduced-motion safe).
- **Surfaces** — landing (cockpit hero), dashboard shell + home (instrument cluster, Gauge readiness), theory (Calm Reading / aurora register), exams (score-as-Gauge) + `Celebration.tsx` (neon taillight-streak reward, portal), auth pages.
- **Verified** — `tsc` clean · production build clean (25 routes) · 605 tests pass · live checks: both themes flip, 4 glass panels, Gauge + 61 mono readouts on dashboard, aurora + 16 mastery bars on theory, no console errors, no horizontal overflow.
- **Not yet installed** (deferred, CSS/SVG-only was sufficient): Motion, GSAP, Lenis, Paper Shaders. Add only if a future surface needs them.

---

## 1. Why this doc exists

The founder asked to take the website UI "from Basic to Future" — a 2026 award-flavoured, futuristic look (animated gradients, aurora, glassmorphism, massive type, neon, cursor reactivity, cinematic scroll). Four parallel research agents investigated: (1) the effects catalog + licensing, (2) the production tech stack for Next 16, (3) three named visual-identity directions with Cyrillic-verified type, and (4) a teardown of award-winning 2025–26 sites with a usability/performance reality check.

This doc synthesises all four into a single **decision + design system + build plan**, so we implement from a blueprint (per our standing rule: no UI rewrite before the direction is documented and chosen).

---

## 2. The one hard constraint that shapes everything

**Award sites and our product optimise for opposite things.**

Awwwards weights usability at ~30%; creativity/design dominate. Sites like Lore, OceanX 2025, and Igloo Inc (SOTY 2025, a fully-WebGL UI) are engineered for a **4-second jury impression on a one-time desktop visit**. Our user is a 17–18-year-old on a **mid-range Android** who returns **daily** to do today's quiz and leave. A single Spline/WebGL hero ships 0.8–2 MB of JS before first paint and collapses Core Web Vitals; scroll-jacking disorients task-focused users (NN/G) and breaks quiz scroll-snap; animating layout properties tanks CLS/INP (INP is now the most-failed CWV, ~43% of sites).

**The rule we adopt: steal the _signals_ (dark + glow + big type + tactile feedback), not the _machinery_ (WebGL heroes, scroll-jacking, heavy motion).** Reference blend, in one line: **"Duolingo's reward loop inside Linear's shell."**

This gives us **two design budgets**:

| Surface | Visit pattern | Budget |
|---|---|---|
| **Marketing / landing** | one-time, exploratory, often desktop | *One* restrained "wow" allowed (lazy, reduced-motion-gated) |
| **App shell** (dashboard, theory, quiz, sim HUD) | returning, task-focused, mobile | Speed · feedback · orientation. **No** scroll-jacking, **no** WebGL, **no** layout-animating motion |

---

## 3. The three directions (full detail in the showcase)

All three **evolve** our current `#0a101e` navy + `#111b2e` graphite + `#3fa1ff` electric-blue and keep the blue as brand equity. Every font is OFL/free, self-hostable, **Cyrillic-verified** (hard requirement — the product is Bulgarian; the agent rejected Space Grotesk, Gabarito, and Clash Display for failing it).

### D1 — Neon Night Highway (Неонова магистрала)
Windshield-on-a-wet-night-highway; brake-light trails, neon signage. Most viscerally "driving," high teen/gaming appeal. Accent: taillight magenta `#FF3D7F`. Type: **Unbounded** + Inter. **Risk:** neon + bloom fatigues over long study sessions and glow is the priciest effect on mid-range GPUs → cage it to accents/achievements.

### D2 — Aurora Drift (Балканска зора)
Aurora over a dark Balkan horizon; the road as a ribbon of light. Calmest, most glass-forward, lowest eye-fatigue. Accents: teal `#4ADEDE` + indigo `#7C5CFF`. Type: **Manrope** + Onest. Aurora is pure animated CSS gradients — GPU-cheap, no WebGL. **Risk:** aurora is ubiquitous in 2026 → must commit to the road-ribbon metaphor to stay ownable; least literally "driving."

### D3 — Holographic HUD (Augmented Dashboard) — **recommended**
The product as a car's heads-up display / instrument cluster: speedometers, telemetry, gauges. Accent: holo-cyan `#17E1C4` beside the kept blue. Type: **Exo 2** (display) + **JetBrains Mono** (telemetry/numerals) + IBM Plex Sans / Onest (body). Buildable entirely in CSS conic-gradients + SVG — **zero WebGL, mid-range safe. Risk:** dense telemetry can feel busy/"gamer-masculine" and is cognitively heavy for long reading → needs a deliberately calm reading mode.

---

## 4. Decision (ADR-style)

**Problem.** Pick one futuristic identity that (a) wins the "wow" the founder wants, (b) survives daily use on mid-range Android, (c) evolves — not discards — our existing navy/blue system, and (d) works in Bulgarian Cyrillic.

**Options considered.** D1 Neon · D2 Aurora · D3 HUD · a fourth "do a WebGL award hero" option (rejected outright by the performance reality check for a daily app).

**Chosen: a single system in three registers, led by D3.**
- **HUD is the architecture.** One idea — a cockpit — explains *both* halves of the product: the theory dashboard reads as an instrument cluster; the 3D simulator is a literal HUD. It's the only direction that's *ownable* in the driving-ed category (no competitor looks like a cockpit → award-jury catnip), and it's the only one that's zero-WebGL by construction.
- **Aurora is the reading mode.** Theory/lesson reading surfaces borrow D2's low-fatigue drifting gradient + generous whitespace, so long-form study breathes inside the instrument frame.
- **Neon is the reward flourish.** D1's taillight-streak energy fires only on achievement moments (level-up, exam-passed, streak milestone) — dopamine without daily fatigue.

**Why.** Concept coherence wins awards and aids comprehension; it promotes our `#3fa1ff` from "an accent" to *the HUD projection / interactive colour* with real semantic meaning (100% equity kept, a concept gained); gauges/telemetry/count-ups map 1:1 to the streak-and-XP retention loop a daily teen product needs; and CSS/SVG-only sidesteps 2026's biggest documented performance trap.

**Trade-offs / what we give up.** HUD density is the wrong texture for reading — mitigated by the Aurora reading mode. It can skew "gamer-masculine" — mitigated by calm surfaces, restrained motion, and inclusive copy. Aurora-everywhere is generic — mitigated by committing hard to the road/instrument metaphor.

**Risks & mitigations.**
- *Reading fatigue* → the Calm Reading surface (Aurora register) is a first-class requirement, not a nice-to-have.
- *Mid-range jank* → hard guardrails in §7; no WebGL in the app shell; never animate `backdrop-filter`/blur.
- *Motion sickness / a11y* → `prefers-reduced-motion` honoured from day one (WCAG 2.3.3), dark+light both shipped, keyboard + contrast baked in.
- *Cyrillic letterforms* → request `locl` "BGR" forms where available (Onest, Manrope, IBM Plex handle Bulgarian well) and set `lang="bg"`.

**Migration (evolution, not rip-and-replace).**

| Today | Becomes | Change |
|---|---|---|
| Ground `#0a101e` | `#070B14` | Deepen for OLED |
| Cards `#111b2e` | `#0F1826` + cyan hairlines | Evolve |
| Accent `#3fa1ff` | HUD Blue — the semantic interactive/projection colour | **Promote (keep)** |
| — | + Holo Cyan `#17E1C4`, Amber `#FFC24B`, warning/success | New semantic layer |
| (current body font) | + Exo 2 display + JetBrains Mono numerals | Additive |

Same bones, new instrument-cluster voice.

---

## 5. Design tokens (HUD system)

```
/* Dark (primary) */
--ground:  #070B14;   /* cockpit black, OLED-deep */
--surface: #0F1826;   /* panel graphite */
--hair:    rgba(63,161,255,.16);   /* cyan/blue hairline borders */
--brand:   #3FA1FF;   /* HUD Blue — interactive / projection (KEPT) */
--accent:  #17E1C4;   /* Holo Cyan — telemetry (~9:1, UI-text-safe) */
--warn:    #FFC24B;   /* caution amber */    --danger: #FF5B49;  /* warning light */
--ok:      #38E08A;   /* success */
--text:    #E7EEF9;   /* ~15:1 */            --muted:  #94A6C4;  /* ~6.5:1 */

/* Light ("daylight HUD") */
--ground:#EEF3FB; --surface:#FFFFFF; --brand:#1B6BD6; --accent:#0C9E8B;  /* both AA on white */
```
Neon lives on glows/borders, **never as body text** — protects WCAG. Text over any gradient sits on a solid chip to guarantee ≥4.5:1.

**Type.** Display **Exo 2** (squared-geometric, HUD-native) · Numerals/telemetry **JetBrains Mono** (timers, %, scores) · Body **IBM Plex Sans** or **Onest**. Scale ≈ 1.25: 12/14/**16**/20/25/31/39; hero `clamp(2.5rem, 8vw, 7rem)`. Self-host via `next/font/local` variable fonts (keeps CSP tight) — **Cyrillic subset required**.

**Signature component — Holographic Speedometer XP Ring.** A tachometer-style SVG gauge (conic-gradient fill + sweeping needle + mono digital centre readout) for lesson progress / XP / exam-readiness %, that "redlines" as you approach exam-ready. Reusable at every scale: dashboard, quiz results, sim.

**Motion language.** HUD boot-up sweep (once per session/landing) + gauge needle-sweep & count-up numerals (only on value change, 300–500ms ease). No perpetual scanlines over reading text; animate only `transform`/`opacity`.

---

## 6. Tech stack

**Safe tier — ships on every page, fast on budget Androids:**
- **Motion** (`motion/react`, MIT) — UI micro-interactions.
- **GSAP + ScrollTrigger** (now 100% free; GreenSock "Standard/No-Charge" licence, not MIT — has a non-compete clause, acceptable for us) — cinematic landing scroll only.
- **Lenis** (`lenis`, MIT) — smooth scroll, **gated behind `prefers-reduced-motion`**; watch the documented Lenis × CSS scroll-snap conflict on mobile (don't smooth the quiz).
- **@paper-design/shaders-react** (Apache-2.0, **no three.js**) — WebGL aurora/mesh-gradient/liquid as one-line React components, tiny bundle. Our aurora/mesh backgrounds. *(For the HUD lead we may not even need this — CSS conic-gradients cover most of it.)*
- **Cheap-wow toolkit:** inline SVG `feTurbulence` grain over gradients (kills banding), CSS multi-radial glow, `IntersectionObserver` scroll-reveal (with `unobserve()` after fire).

**Max-wow tier — landing hero only, hard-gated:** R3F v9 / Spline, loaded via `dynamic(ssr:false)` inside a client wrapper, gated by IntersectionObserver + device check + reduced-motion. Not in the app shell.

**Next 16 note:** `dynamic(..., { ssr:false })` only inside client components; the app already runs Next 16 / React 19 conventions (see `platform/AGENTS.md`).

---

## 7. Performance & accessibility guardrails (non-negotiable)

- Animate **only `transform` and `opacity`**. Never animate layout props or `backdrop-filter`.
- Glassmorphism: **≤1–2 layers per screen**, blur ≤15px, never animated. (Heavy glass = 15–30% FPS drop on real devices.)
- Static grain/gradients — **no repaint on scroll**.
- **Never** stack animated glass over a live shader on mobile (the #1 jank trap).
- No scroll-jacking anywhere; Lenis is landing-only and reduced-motion-gated.
- Ship from day one: `prefers-reduced-motion` fallbacks, **dark + light toggle**, high contrast, keyboard support (web), captions.
- Budget & monitor: **LCP**, **INP < 200ms**, **CLS**. In-app motion serves feedback/orientation, never spectacle (≈200–500ms).

---

## 8. Implementation plan (hours, phased)

**Phase A — Token & type foundation (~3–4h).** Add HUD tokens to the Tailwind/theme layer as CSS variables; wire dark+light; self-host Exo 2 + JetBrains Mono + body face via `next/font/local` with Cyrillic + `locl` BGR; swap ground/cards/hairlines. *No visual "effects" yet — just the new bones.* Ship-safe, reversible.

**Phase B — Signature component (~3h).** Build the Speedometer XP Ring (SVG + conic-gradient + count-up), reduced-motion-aware. Drop it into the dashboard (exam-readiness %) and quiz-results.

**Phase C — Landing "wow" (~4–5h).** Rebuild the landing hero: massive Exo 2 headline, HUD grid + boot-sweep, one static mesh-gradient-over-grain background, glass CTA cards, IntersectionObserver reveals. One restrained flourish, reduced-motion-gated.

**Phase D — App-shell polish (~3h).** HUD-frame the dashboard (bento of instrument panels, monospace stats), apply the Calm Reading (Aurora) surface to theory/lesson reading, add micro-interactions (150–250ms) on answers.

**Phase E — Reward moments (~2h).** Neon taillight-streak celebration on level-up / exam-passed / streak milestone (transform/opacity only), optional sound + haptic.

Total ≈ 15–17h, each phase independently shippable. Phase A is prerequisite; B–E can parallelise.

---

## 9. Open items for the founder

1. **Pick the lead direction** in the showcase — my recommendation is **D3 HUD (as the architecture), with Aurora reading mode + Neon rewards.** If you'd rather lead with Aurora (calmer) or Neon (louder), the token system swaps cleanly.
2. Confirm **dark + light** both ship (recommended; Gen Z expects the toggle).
3. Fonts are set unless you object: **Exo 2 + JetBrains Mono + IBM Plex Sans/Onest** (all Cyrillic-verified).

---

## 10. Sources

Research agents (this session): effects catalog + licensing; Next-16 tech stack; visual-identity directions (Cyrillic diligence); award-site teardown. Primary sources cited inline in those reports include Awwwards evaluation criteria, NN/G (scroll-jacking, animation duration), web.dev (Core Web Vitals, motion), W3C WCAG 2.3.3, Smashing (Gen Z), and teardowns of Linear, Vercel/Geist, Duolingo, Lore, OceanX 2025, and Igloo Inc.
