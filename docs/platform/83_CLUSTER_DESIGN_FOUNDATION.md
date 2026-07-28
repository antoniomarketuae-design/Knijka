# 83 · Cluster Design Foundation — the dark instrument-cluster token & primitive layer

**Status:** Implemented (foundation only — no page is restyled by this change)
**Date:** 2026-07-26
**Owner:** Technical co-founder
**Builds on:** [64 UI Visual Direction](64_UI_VISUAL_DIRECTION.md) (HUD direction, accepted 2026-07-08)
**Scope of this doc:** `platform/src/app/globals.css`, `platform/src/components/ui/**`, `platform/src/app/dev/cluster/`

---

## 1. The finding that changed the plan

The brief described the public page as "a light white/pale-blue SaaS template… zero
depth". The diagnosis of what the visitor SEES is correct. The diagnosis of why was
not, and it matters, because the cheap fix and the right fix look identical from the
screenshot.

**A dark theme already existed, and it was already the default.** Doc 64 shipped it in
July: `:root` sets `--background: #070b14` and the whole HUD token system. What also
shipped was this:

```css
@media (prefers-color-scheme: light) { :root { --background: #eef3fb; … } }
```

There is no theme toggle anywhere in `src/` — `data-theme` is written by nothing. So
the public site's identity has been decided entirely by the visitor's operating
system. On a light-mode laptop, the cockpit becomes the pale SaaS template. Nobody
designed that page; an OS setting did.

That reframes the task. The problem was never "we have no dark theme" — it was **"the
brand is negotiable"**. A marketing surface cannot be. Everything below follows from
fixing that specific thing.

---

## 2. Decision: a pinned scope, not a global re-theme

The app has 79 `.card` usages, 445 `text-muted` and 171 `border-border` across the
authenticated surfaces. Re-theming globally to get a good marketing page is how you
break a dashboard you weren't looking at.

> **Correction, 2026-07-28.** This paragraph originally read "538 `card` usages". That
> figure was a word-boundary sweep (`grep -roE '\bcard\b' src`), which in this repo
> counts scenario templates, trace fixtures, prop names, `HazardCard` and prose as well
> as class tokens — it returns 542 at this doc's own commit. Counted as **class tokens
> inside `className` values** (the method is written out in
> [84 §2](84_INTERIOR_CLASS_LAYER.md)) it is **79**, in 38 `.tsx` files and 0 `.ts`. The
> other two figures survive that method: `border-border` comes out at exactly 171, and
> `text-muted` at 445 rather than 407. Doc 84 §1 and the `THE INTERIOR` comment in
> `globals.css` carried the same bad number and are corrected too.
>
> **The argument is unaffected.** It never depended on the magnitude: one call site you
> would have to hand-edit is one too many if the point is that names are the interface.

**The mechanism: `[data-surface="cluster"]` re-binds the same semantic token NAMES to
a different set of values.**

```html
<div data-surface="cluster"> … marketing … </div>
```

Custom properties inherit, and a nearer ancestor beats `:root` *regardless of which
media query set the `:root` value*. So inside the scope every existing utility —
`bg-surface`, `border-border`, `.card`, `.btn-accent`, `.hud-label` — renders in
cluster colours with no markup change, and outside it nothing moves at all.

Token names are the interface; the scope swaps the implementation. That is the whole
trick, and it is why this task could redesign the dark identity without touching a
single one of those call sites.

One companion rule handles what scopes cannot reach:

```css
:root:has([data-surface="cluster"]) { color-scheme: dark; }
```

Scrollbars and the overscroll canvas live on the root element. Without this, a
light-mode OS paints a white gutter beside a black hero.

*Verified live with the OS in light mode:* `:root` still resolves `--background` to
`#eef3fb` (app untouched, `color-scheme: light` on `/`), while the scope resolves it
to `#05070c` and `.card` inside the scope paints `rgb(10,14,22)`.

**Trade-off accepted.** Content portalled to `document.body` (modals, toasts) escapes
the scope and will render in the app theme. Marketing has no such surface today; when
one appears, the portal target gets the attribute too.

---

## 3. Designing the dark, rather than inverting the light

The existing `:root` dark theme is a good *navy* theme — surfaces at `#0f1826` /
`#16233b` read as blue cards on a blue ground. That is what you get from inverting a
light theme: the instinct carries over that elevation means a lighter fill and a drop
shadow.

A night instrument cluster does the opposite, and this is the single idea the whole
ramp is built on:

> **Separation comes from a lit top edge and a hairline. Fill steps stay tiny.**

On a near-black ground a drop shadow is invisible, so it cannot be the elevation cue.
What actually reads is the bezel catching light along the top edge. Once that is
carrying the work, the fill deltas can be 2–4% instead of 15%, which is why a real
cluster looks precise where a "dark mode" looks grey.

| Token | Cluster | App dark (unchanged) | Why |
|---|---|---|---|
| `--background` | `#05070c` | `#070b14` | Cockpit black, cool cast |
| `--surface` | `#0a0e16` | `#0f1826` | Panel — a *small* step up |
| `--surface-2` | `#111724` | `#16233b` | Raised / track |
| `--border` | `#1a2130` | `#1e2c46` | Quiet, decorative |
| `--control-edge` | `#5b6d84` | `#5a6b88` (new) | The one edge that must be seen |
| `--foreground` | `#e8eef8` | `#e7eef9` | 16.6:1 on surface |
| `--muted` | `#8fa0b8` | `#94a6c4` | 7.3:1 on surface |
| `--accent` | `#48a9ff` | `#3fa1ff` | Emission, not fill |

**Ground is `#05070c` and not `#000` on purpose.** An occlusion shadow needs somewhere
darker than the panel to go. Pure black leaves none, and every panel then floats on a
void with no contact shadow — the flat look people mean by "black background".

**The accent is nudged brighter than the app's `#3fa1ff`.** Brand equity is kept (doc
64 §4 promotes this blue to *the* projection colour), but the same blue on a deeper
ground reads as a flat fill rather than as light coming off a surface. Emission is a
relationship between the light and its ground, not a hex code.

**Light is used as emission, never as fill.** `--lit-edge` is `rgba(255,255,255,.07)`
— an *edge*, one pixel, inset. There is no white-10%-overlay anywhere in this system.

### Contrast — measured, not assumed

Every pair was computed against the actual painted grounds before the values were
committed (script: WCAG 2.x relative-luminance formula):

| Ink | on `--background` | on `--surface` | on `--surface-2` |
|---|---|---|---|
| `--foreground` | 17.3 | 16.6 | 15.4 |
| `--muted` | 7.6 | 7.3 | 6.7 |
| `--accent` | 8.1 | 7.7 | 7.2 |
| `--accent-2` | 12.1 | 11.6 | 10.8 |
| `--danger` (worst case) | 7.2 | 6.9 | 6.4 |

AA everywhere; AAA on all body text. `--accent-foreground` on `--accent` (the primary
button label) is 8.1:1.

### The one a11y fix that reaches outside the scope

`.btn-ghost` outlined itself with `--border`, which measures **1.55:1** against the
light background and **1.90:1** against the dark one. WCAG 1.4.11 asks for ≥3:1 on the
visual boundary that *identifies a control* — by that standard the ghost button was a
control the standard says isn't there.

A new `--control-edge` token is defined in **all three** themes (light `#6f86a4`, app
dark `#5a6b88`, cluster `#5b6d84`) and `.btn-ghost` now rests on it. Measured live on
`/` in light mode: **3.35:1**, up from 1.55:1. Hover now *lights* the edge
(`color-mix` toward the accent) instead of merely darkening it — the same gesture the
cluster uses everywhere for "this surface is active", and it works in both themes.

This is the only change in this task that is visible outside the marketing scope. It
is a strict accessibility improvement and it changes no layout.

---

## 4. Motion primitives — the inversion that makes them safe

Every motion in this layer is defined **inside**
`@media (prefers-reduced-motion: no-preference)`. The resting state — the one that
exists when that query does not match — is always the final, visible, correct state.

The usual shape is the opposite: animate by default, then remember a
`motion-reduce:` escape hatch at every call site. That fails open. One forgotten
override and a reduced-motion user gets the motion anyway — or worse, gets content
stranded at `opacity: 0`. Here, forgetting produces *no motion*, never broken content.
**No consumer can get it wrong**, which was the brief's requirement.

Only `transform` and `opacity` are animated anywhere (doc 64 §7): the two properties
that never trigger layout or paint, which is what keeps INP under 200ms on the
mid-range Android our students actually own.

| Primitive | What it is | Notes |
|---|---|---|
| `.enter` / `.enter-power` | Entrance choreography for content present at first paint | `--enter-i` × `--stagger` places each sibling in one sequence |
| `<Reveal>` + `[data-reveal]` | Scroll-linked reveal | §5 |
| `.lift` | Hover physics | Also gated on `(hover: hover) and (pointer: fine)` |
| `.pulse-soft` | Ambient "this is live" | 3.2s, opacity only, one per view |

**Timing scalars are shared** (`--dur-fast/base/slow/cinematic`, `--stagger: 70ms`,
`--ease-out` = expo-out `cubic-bezier(.16,1,.3,1)`). One clock is what makes separate
elements read as a single choreography rather than N unrelated animations; expo-out's
long settle is what reads *expensive*, where a same-distance ease-in-out reads like a
template. Verified live: `.enter` siblings resolve to 0 / 70 / 140 / 210ms and a
`Reveal` group to 0 / 70 / 140ms — the same step.

**`.lift` is split deliberately.** The transform half is behind reduced-motion *and*
`hover: hover` — on touch, `:hover` latches after a tap and the card stays lifted
until you touch something else, which is most of our audience. The colour/edge half is
unconditional, because a reduced-motion user still needs to see what is under the
cursor. Hover feedback is information; the travel is decoration.

---

## 5. `<Reveal>` — the failure mode is the design

`platform/src/components/ui/Reveal.tsx`. Two bugs are designed out rather than
mitigated:

**1. A blank page is not an acceptable failure.** A reveal that hides in CSS and
un-hides in JS turns every hydration error, blocked bundle and unsupported browser
into invisible content. So the hidden state is *only ever written by the client*: the
server renders no `data-reveal` attribute at all and the CSS keys entirely off that
attribute. No JS ⇒ the content is simply there.

**2. Hiding something the user is already looking at is a blink.** The layout effect
measures first — anything in the viewport at mount goes straight to `shown` and is
never hidden. Only off-screen blocks, which nobody is looking at, get the hidden
state. *Verified:* reloading with the page scrolled down yields four `shown` /
`opacity: 1` nodes and zero hidden ones.

**The transition lives on the destination state, not on the element.** This was a real
defect caught in the browser, not in review: with `transition` declared on
`[data-reveal]`, the idle→hidden step at mount *animated*, so every block visibly
faded OUT before it could fade in. CSS reads the transition from the after-change
style, so declaring it only on `[data-reveal="shown"]` makes hiding instant and
revealing animated — the only combination correct in both directions.

The observer `unobserve()`s after firing (doc 64's cheap-wow rule): a page of live
observers keeps costing on every scroll frame for an animation that can happen once.

> **Use `.enter` above the fold and `<Reveal>` below it.** `.enter` is pure CSS and
> costs no JS; `Reveal` exists for content that arrives later.

---

## 6. Depth primitives

| Class | Use |
|---|---|
| `.panel` | Opaque instrument surface. The default — costs nothing, use freely |
| `.panel-glass` | Glass. **Budget: 1–2 per screen** (doc 64 §7) |
| `.panel-inset` | Recessed well — gauge tracks, readouts |
| `.edge-lit` | The lit edge alone, for elements bringing their own background |
| `.rule` | Hairline that fades at both ends |
| `.haze` | Atmospheric ground layer |
| `.hud-grid-fade` | The instrument grid, masked to dissolve |

**Glass is 2026, not 2021:** 14px blur with a slight saturation lift, one hairline, a
lit edge. No 40px frosted slab, no white 10% fill, never animated, and a
`@supports not (backdrop-filter)` fallback to an opaque surface so it can never become
an unreadable transparent hole.

**`.haze` is the load-bearing one.** A dark scene needs a horizon; without one the eye
has no depth cue and "dark theme" collapses to grey text on black. It composes three
static gradients — a low wide glow at the horizon (the road ahead), a cool off-centre
overhead wash (cabin light), and a vignette. Static means no repaint on scroll.

**`.hud-grid-fade` exists next to the kept `.hud-grid` (8 uses)** because a grid that
stops at a hard boundary announces the `div` it lives in. This one dissolves.

`.panel-inset` moves the lit edge to the *bottom*, which is the whole trick: light
still comes from above, so a dent catches it on the far lip.

---

## 7. Components

`platform/src/components/ui/` — no barrel, matching how `components/hud/Gauge` is
imported today (and it keeps `Reveal`'s client chunk out of consumers that only want
`Panel`).

- **`Panel.tsx`** — server component, zero JS. `tone` makes the expensive choice
  (glass) something you ask for by name rather than inherit. `as` is a closed tag
  union so it cannot smuggle in interactive elements — a card with hover physics that
  is secretly a button needs real button semantics.
- **`Readout.tsx`** — server component. The cluster's typographic signature and the
  piece most easily got wrong by hand: the look is not big numbers, it is the *ratio*
  — a dim, tracked-out, uppercase mono caption above a bright tabular figure. Contrast
  lives in the number. `tabular-nums` is functional, not decorative: a ticking value
  reflows its own width on proportional figures, and real instruments don't shimmer.
- **`Reveal.tsx`** — the only client component in the layer (§5).

---

## 8. Weight

The landing route's own asset graph, measured from the prerendered HTML before and
after (Turbopack builds no longer print a route table; script in §10):

| | Before | After | Δ |
|---|---|---|---|
| JS (raw / gzip) | 630.6 KB / 190.2 KB | 630.6 KB / 190.2 KB | **0** |
| CSS (raw / gzip) | 91.4 KB / 14.0 KB | 96.1 KB / 15.1 KB | +4.7 KB / **+1.1 KB** |
| Assets requested | 13 | 13 | 0 |

**Zero JavaScript added to the landing route**, byte for byte — the layer ships CSS
plus two server components and one client component that no page imports yet. The
+1.1 KB gzipped CSS is the entire token ramp, seven depth primitives and four motion
primitives, and it includes the utilities Tailwind scanned out of the `/dev/cluster`
showcase (which never ships — the route 404s in production, but its class names are
still in the stylesheet). The real marketing cost is lower than the number above.

The sim bundle constraint (doc 80: ~9.8MB + 5.4MB JS) is untouched, and keeping it
that way is the live-3D hero task's problem, not this layer's.

---

## 9. What this task did NOT do

- No page is restyled. The landing page still renders its static SVG gauge.
- The live-3D hero, the poster/video fallback and the mobile degradation path are the
  next task's work; this layer only guarantees they will inherit a real dark identity.
- No theme toggle was added. The app still follows the OS outside the cluster scope.

## 10. Reproducing the measurements

- **Contrast:** WCAG relative-luminance over the committed hex values; every pair in §3.
- **Weight:** sum every `.js`/`.css` referenced by `.next/server/app/index.html` after
  `npx next build`, raw and gzipped.
- **Look before ship (doc 66 R0):** `/dev/cluster` renders the whole ramp and every
  primitive on one page and 404s in production. It exists to be *looked at* — the
  elevation ladder, glass over haze and stagger timing are judgements a screenshot
  settles and a diff does not.
