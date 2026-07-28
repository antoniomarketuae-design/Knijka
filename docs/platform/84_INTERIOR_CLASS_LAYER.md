# 84 · The Interior Class Layer — teaching the authenticated app the cluster's shapes

**Status:** Implemented. **Two halves, and the distinction is the whole technique:**
the *baseline* lift was **inherited — no markup was edited to receive it** (redefining
`.card`, `.hud-panel`, `.btn-accent`, `.btn-ghost` inside the scope moved every existing
call site at once); the *opt-in marks* (`.panel-head`, `.graticule`, `.metric`, `.track`,
`.framed`, `.card-live`, `.console`, `.nav-live`) were **adopted deliberately, in 19
markup files in the same commit** (§12 lists them). Anyone who reads only the first half
will believe the commit touched no `.tsx`; it touched nineteen.
**Date:** 2026-07-28
**Owner:** Technical co-founder
**Builds on:** [83 Cluster Design Foundation](83_CLUSTER_DESIGN_FOUNDATION.md) (tokens + depth/motion primitives, 2026-07-26) · [64 UI Visual Direction](64_UI_VISUAL_DIRECTION.md) (HUD direction, accepted 2026-07-08)
**Scope of this doc:** the `THE INTERIOR` block in `platform/src/app/globals.css`, the `.haze` layer on `platform/src/app/(dashboard)/layout.tsx`, and the `Интериор · класове` section of `platform/src/app/dev/cluster/page.tsx`

---

## 1. The finding that changed the plan

Founder review, verbatim:

> „The whole inside of the platform, we made it dark but nothing much changes. We
> need 3d futuristric design inside aswell, have to see where the text we are using
> the buttons we have, the flow we use inside the platform and all the inside of
> the platform."

He is right, and the reason is specific enough to name.

Doc 83 did two separable things. It rebound the token **values** inside
`[data-surface="cluster"]`, and it built a depth/motion primitive layer to spend
them on — `.panel`, `.panel-inset`, `.edge-lit`, `.haze`, `--depth-1..3`, `.enter`,
`<Reveal>`. When a later change put `data-surface="cluster"` on the `(dashboard)`
layout, the first half reached behind the login and the app went black overnight.

**The second half essentially never got there** — and the precise version of that
sentence matters, because the first draft of this doc overstated it in two places and a
reader would have acted on the overstatement. Measured at `9ea8f81^`:

- **`Panel` — true.** Its four importers were `(auth)/layout.tsx`,
  `(marketing)/page.tsx`, `(marketing)/za-avtoshkoli/page.tsx` and `/dev/cluster`.
  Nothing behind the login mounted it.
- **`.panel-inset` — false as originally written.** Three components behind the login
  did write it: `components/hazard/HazardClipStage.tsx:340`, `HazardHistory.tsx:48` and
  `HazardReveal.tsx:203`, all rendering under `(dashboard)/hazard`. So the recessed
  primitive had exactly one authenticated consumer — the hazard-perception route — and
  none of the dashboard, theory, exam or sim surfaces.
- **`.haze` — false in both directions as originally written.** It was on five elements:
  `(auth)/layout.tsx:39`, `(dashboard)/hazard/page.tsx:79`,
  `(dashboard)/hazard/paywall.tsx:31`, `(dashboard)/pricing/page.tsx:98` and
  `/dev/cluster`. Three of those are **behind the login**, and it was **not on
  `(marketing)/layout.tsx` at all** — and still is not.

  What was actually missing is a level, not a surface: all five were `absolute inset-0`
  inside one route's own wrapper (`/dev/cluster` aside), so each lit *that page*.
  `hazard/paywall.tsx` is the gated branch of `hazard/page.tsx`, so the three
  authenticated uses cover **two** of the twenty-one `(dashboard)` routes — hazard and
  pricing. Nineteen had no floor. What §8 adds is the **shell** copy — one
  `fixed inset-0 -z-10` on the group layout, behind every authenticated route at once.

The authenticated surfaces are built out of five classes: `.card` (**79** call sites —
§2 states how that is counted), `.hud-panel` (16), `.btn-accent` (64), `.btn-ghost` (86)
and `.field` (1). None of the first four had been taught anything the depth layer knew.

So the app was a dark palette painted onto admin-panel geometry. That is precisely
"dark but nothing much changes": **only the colour moved.** The depth system was
sitting one level away, unused, in the same stylesheet.

---

## 2. Decision: rebind the class implementations, not the token values

The obvious fix is to go and rewrite call sites — add `panel-inset` here, wrap that
in a `<Panel>`, put a `<Readout>` around the number.

### First, the number, because the first draft of this doc got it wrong

An earlier version of this section said "266 `.card` usages" and repeated it five times.
**It is 79.** The honest figure and the method that produces it:

> **Method.** Walk every `.ts`/`.tsx` under `platform/src`. At each `className=`, take
> the attribute value — a quoted string, or the balanced `{…}` expression. Inside it,
> take every string literal, delete `${…}` interpolations, split on whitespace, and
> count tokens **exactly equal** to `card`. No script is committed — the paragraph
> above is the whole specification, and any implementation of it reproduces the number.
> A second, independent pass that scans *every* string literal in the file (not only
> `className` values) and keeps the ones that look like class lists returns the same 79,
> so no `card` token is hiding in an extracted `const cls = "card …"`.

| Token | This method, at `HEAD` | Doc 83 §2 claims |
|---|---|---|
| `card` | **79**, in 38 `.tsx`, 0 in `.ts` | 538 |
| `border-border` | 171 | 171 |
| `text-muted` | 445 | 407 |

The two calibration rows are the point: on tokens that can only ever *be* class names the
method lands on doc 83's own figures (`border-border` exactly, `text-muted` within 9%).
On `card` it disagrees by a factor of seven, and the reason is that `card` is also an
ordinary English word and an ordinary identifier. A bare word-boundary sweep —
`grep -roE '\bcard\b' src --include=*.tsx --include=*.ts` — returns **542** at doc 83's
own commit (`f2a76ae`), which is where 538 came from; restricted to `.tsx` it returns
**258** at `9ea8f81^`, which is where 266 came from. Both were counting scenario
templates, trace fixtures, prop names, `HazardCard`, comments and prose.

**Corrected in three places** by this pass: this doc, [doc 83 §2](83_CLUSTER_DESIGN_FOUNDATION.md)
(which is where 538 originated), and the `THE CLUSTER SCOPE` / `THE INTERIOR` comments in
`platform/src/app/globals.css`. **One place still carries it and was deliberately left
alone:** the JSDoc header of `platform/src/app/(dashboard)/layout.tsx` repeats "the 538
`card` / 407 `text-muted` / 171 `border-border` call sites". That file belongs to a
concurrently-running lane, so the fix is recorded here rather than applied — it is a
comment-only edit whenever the lane is clear.

Two more consequences of measuring rather than assuming: the `.card` count at
`9ea8f81^` was **76**, so this commit added three; and the four classes this layer
actually rebinds total **245 occurrences across 74 files** (`card` 79 + `btn-ghost` 86 +
`btn-accent` 64 + `hud-panel` 16). 245 is the number the argument below rests on.

### The argument, restated at the real number

245 call sites across 74 files is not a multi-week rewrite — it is a few focused days.
So the honest case for rebinding is **not** "the manual edit is impossible". It is that
the manual edit's failure mode is a half-converted app: some screens in the new language,
some in the old, and no way to tell which without opening each one — and that a rebinding
has no such state, costs nothing at the call sites, and cannot be forgotten on the screen
nobody opened this week.

**This layer is doc 83's trick pulled one level up.** Doc 83 §2 worked because *token
names are the interface and the scope swaps the implementation*. The same sentence is
true of class names:

```css
[data-surface="cluster"] .card {
  border-top-color:    color-mix(in srgb, #ffffff 13%, var(--border));
  border-bottom-color: color-mix(in srgb, #000000 55%, var(--border));
  box-shadow: var(--bezel);
}
```

`.card` is already written on 79 elements. Redefining what `.card` *means* inside
the scope moves all 79 at once — and the same three-line move on `.hud-panel`,
`.btn-accent` and `.btn-ghost` carries the other 166 — with zero markup edits, and,
because the selector carries the scope, moving nothing outside it. Same lever, higher
altitude.

Two consequences follow and are worth stating plainly:

- **Adoption is not a migration.** The moment the attribute is on the layout, every
  screen in the group is in the new language, including screens written months ago
  and screens nobody has opened this week. There is no half-converted state.
- **New classes are additive, not required.** `.panel-head`, `.graticule`, `.metric`,
  `.track`, `.framed`, `.card-live` are opt-in marks a page *can* reach for. The
  baseline lift arrives whether or not anyone does — but note that "additive" is not
  "unused": 19 markup files reached for them in this very commit (§12). The claim this
  section makes is that **no file had to be edited to receive the baseline**, not that
  no file was edited.

`.field` is the one of the five that is untouched here: it already rests on
`--control-edge` and already carries the recessed treatment (globals.css, TEXT INPUT).
The layer teaches the other four.

---

## 3. Why the vocabulary is a car panel

Every class in this layer is named after a part of an instrument panel — bezel,
graticule, readout, track, console, key. That is not decoration on the naming; it is
what makes the layer decidable by someone who is not the author.

"Futuristic 3D" as a brief has no failure condition: any two people asked to apply it
produce different screens and neither can be shown wrong. **"This is the inside of a
car" has one.** Ask of a proposed shape: would a moulded panel under an overhead
cabin light do that? A rim catches light on its top lip and goes dark on the bottom —
yes. A card that glows uniformly on all four edges — no, nothing physical does that.
The metaphor is the review criterion.

It is also the *right* metaphor rather than a borrowed one, because the other half of
this product is a driving simulator. A student moves from the theory hub into a
cockpit and back several times a session. If the theory side speaks generic sci-fi and
the sim side speaks dashboard, the two halves read as two products. The interior is
where they are made to agree.

Four borrowings, and what each one earns:

| Borrowed part | What it becomes | What it buys |
|---|---|---|
| **Bezel** — a moulded rim | Lit top lip · occluded bottom lip · contact shadow | The only elevation cue that survives on a near-black ground (doc 83 §3: a drop shadow there is invisible, an edge is not) |
| **Graticule** — the machined tick strip on a gauge face | `.graticule` | The cheapest possible mark that says "instrument", one repeating gradient, no element |
| **Readout** — a tabular figure under a tracked-out caption | `.metric` (and `<Readout>`) | A number reads as a measurement instead of as a heading |
| **Needle settle** — a needle overshooting nothing and arriving | `--ease-out` (expo-out) as the shared curve | Movement that arrives rather than movement that eases; doc 83 §4 |

**The costume-jewellery failure this is guarding against** is the reason to spell it
out. Instrument-panel styling done badly is chrome bevels and neon on top of a page
that is still a page. Done properly it is one consistent light source and a set of
parts that behave like parts. Every shape below states which of those two it is doing.

---

## 4. The surfaces

### The bezel on `.card`

`.card` was `rounded-xl border border-border bg-surface` — a rectangle with a 1px
border at uniform opacity on all four sides. On a near-black ground that is the
flattest thing you can draw: it describes an **outline**, not an object. Stack a
dashboard grid of them and you have the generic admin panel the founder was looking at.

(The first draft wrote "stack 266 of them down a page". That was the bad count from §2,
and it was also the wrong *kind* of argument: flatness is a per-screen property, and one
uniform outline on near-black already reads as an outline. The count was never doing any
work here.)

A real moulded rim is not one colour. Light arrives from above, so the top lip is the
brightest thing on the part, and the bottom lip is the darkest — *darker than the
panel it sits on*. That last clause is why doc 83 §3 chose `#05070c` over `#000` for
`--background`: an occlusion shadow needs somewhere darker to go, and pure black
leaves none.

Three declarations. No extra element, no pseudo-element, no blur:

- top border mixed 13% toward white,
- bottom border mixed 55% toward black,
- `--bezel`: an inset lit edge, an inset dark edge, and a tight contact shadow
  (`0 10px 20px -16px`) — a large negative spread, so it is a *contact* shadow under
  the card rather than a soft halo around it.

### `--bezel` is a token, not an inline shadow

```css
--bezel:     inset 0 1px 0 0 var(--lit-edge),  inset 0 -1px 0 0 rgba(0,0,0,.55),
             0 10px 20px -16px rgba(0,0,0,.95);
--bezel-lit: … + 0 0 22px -8px var(--glow);
```

This exists because `box-shadow` has no cascade of its own: a Tailwind
`hover:shadow-glow-sm` at a call site overwrites the property **wholesale** and would
delete the bezel on hover — flattening the card in the one state where it must look
*more* solid, not less. Publishing the bezel as a value lets a call site compose with
it instead of replacing it, which is what `.card-live` does.

### `.card-live`

The hover/active response for a card that is a real destination — a topic, a lesson, a
module tile: the same glow, composed *on top of* the bezel via `--bezel-lit`, plus the
top lip mixing 45% toward the accent. The transition is on `box-shadow` and
`border-color` only, and is switched off under `prefers-reduced-motion: reduce`.

Two call sites use it today — `(dashboard)/exams/page.tsx:176` and
`components/dashboard/ModuleGrid.tsx:116`. It is deliberately not on `.card` itself:
**79 cards are not 79 destinations**, and a surface that lights up when the cursor
crosses it while being unclickable is a lie about affordance. (That argument survives the
count correction intact — it was never about magnitude, only about the ratio, and the
ratio it predicted is what the code shows: 2 of 79 today, 5 of 79 once the open item
below is closed.)

#### KNOWN OPEN ITEM — three `.card`s inside the scope still flatten on hover

The first draft claimed `.card-live` "replaces the `hover:shadow-glow-sm` utility at the
call sites that had it". **It does not, and the gap is a live bug rather than a wording
slip.** Measured:

At `9ea8f81^`, six `.card` elements carried `hover:shadow-glow-sm`. Two were converted to
`.card-live` (above). One — `components/theory/TopicCard.tsx` — was deleted by the
theory-hub lane in the same commit. **Three were not touched and still carry the raw
utility today:**

| Still raw | Renders from |
|---|---|
| `components/sim/lesson-ui/ScenarioCatalog.tsx:132` | `(dashboard)/simulator` |
| `components/sim/lesson-ui/ExamModeCard.tsx:39` | `(dashboard)/simulator` |
| `components/sim/lesson-ui/LessonCard.tsx:32` | `(dashboard)/simulator`, via `LessonSelectScreen` |

All three are inside `[data-surface="cluster"]`, so all three **do** get the bezel at
rest — and all three lose it on hover. Tailwind's utilities sit in `@layer utilities`,
which outranks the `@layer components` block this layer lives in (globals.css says so at
its own `@layer` comment), so `hover:shadow-glow-sm` overwrites `box-shadow` wholesale
and the card flattens in exactly the state §4 says it must look *more* solid. The fix is
one token swap per site — drop the utility, add `card-live` — and it is **deliberately
not done here**: `components/sim/lesson-ui/` is owned by a concurrently-running lane and
editing it would collide.

Three further `shadow-glow-sm` hover sites remain and are **not** bugs, because none of
them is a `.card` and so none has a bezel to flatten:
`components/onboarding/OnboardingFlow.tsx:214` and `components/theory/SectionCard.tsx:28`
(hand-rolled `rounded-xl border` rows), and `components/dashboard/ModuleGrid.tsx:77`,
which is a `group-hover:` on the accent icon chip *inside* a card that is already
`.card-live`.

### The `.hud-panel` rim

`.hud-panel` is the hero surface — the dashboard hub, the exam rules card. It already
had a blur and a soft glow but **no rim**, so it read as a slightly lighter blob
rather than as a piece of glass held in a frame. It gets the same bezel logic one step
brighter (top lip 17% toward white, `--lit-edge-strong` inside).

**The existing 10px blur is kept, not raised.** Glass is capped at 1–2 layers per
screen (doc 64 §7) and this is already one of them; making it *more* glassy is the
change that costs a frame on a phone and buys nothing the rim does better.

---

## 5. The panel head

The single most template-looking thing in the before/after screenshots: every section
opened with a bold sentence and then just… content. That is a document. An instrument
names its channel on a labelled band.

`.panel-head` is title left, telemetry caption right (`.hud-label`), a hairline across
the panel, and — the part that matters — a short **lit tick** where the label starts,
2.75rem of accent with a 6px glow sitting on the rule.

Without the tick, the rule is a horizontal border and reads as one. With it, the rule
is a **scale**, and the tick says the scale starts here. One pseudo-element, one
gradient-free background, no DOM.

`.panel-head-bleed` cancels the panel's own horizontal padding (via `--panel-pad`,
which the call site sets) so the rule touches both walls. This is deliberate and it is
the whole difference between two readings of the same line: **a rule inset by the
padding announces the padding; a rule that runs wall to wall announces the panel.**

Seventeen markup sites have adopted it, ten of them full-bleed (counted by the §2
method).

---

## 6. The instrument marks

| Class | What it is | Why it exists as a class |
|---|---|---|
| `.framed` | Two L-shaped corner brackets, diagonally opposite | `components/ui/Panel.tsx` can already draw four, but only for consumers that mount a `<Panel>`. This is the same signal for the call sites that will never be rewritten |
| `.graticule` | The tick strip printed on a gauge face | One `repeating-linear-gradient` — no elements, no image, no request. `aria-hidden` at every call site |
| `.metric` | Mono, `tabular-nums`, 700, tight leading | The numeral voice, for markup that will never become a `<Readout>` |
| `.track` | A channel cut *into* the panel | Progress bars were a lighter rectangle: a raised element used to mean a recessed one |

**Two corners, not four.** One pseudo-element each, no extra DOM — and the *diagonal*
is what reads as a frame. Four corners read as decoration applied to each corner;
two opposite corners imply the rectangle between them.

**The graticule fades from the first tick, not from halfway.** A strip at constant
opacity reads as a dashed border, which is the one thing it must not look like. It is
the same argument that put `.hud-grid-fade` next to `.hud-grid` in doc 83 §6: a
pattern that stops at a hard boundary announces the `div` it lives in.

**`.metric` is functional, not decorative.** Proportional figures change width as a
value ticks, and the resulting shimmer is the one thing a real instrument never does.
`.hud-label` picked up `tabular-nums` in the same change, so a caption like
„45 · 97 · 40" does not shimmer either. This is the argument `components/ui/Readout.tsx`
already makes; the class is that argument for markup that has no component.

**`.track` inverts the lit edge to the bottom lip** — `.panel-inset`'s trick from
doc 83 §6. Light still comes from above, so a dent catches it on the *far* wall. Fill
is mixed 72% toward `--background`, i.e. darker than the panel, plus a 3px inset
occlusion. That is a groove; a lighter rectangle is a ridge, and progress has never
been a ridge.

---

## 7. The keys

„the buttons we have" was named in the founder report, so the buttons get their own
physics.

### `.btn-accent` — the crown light

The primary button was a flat blue pill: one fill, one radius, and a glow that only
appeared on hover. Nothing about it suggested a physical control.

A moulded key catches the cabin light on its **crown** — the top of the dome — and
holds a dark line where it meets the panel. So: a `linear-gradient` that lightens the
top 58% and nothing else, an inset white top edge at 38%, an inset dark bottom edge,
and a tight accent-coloured drop.

The gradient **only lightens, and only the top half.** That is a deliberate constraint
on where a contrast risk can come from — see §9.

Hover raises the crown highlight (38% → 50%) and swaps the drop for the full
`--shadow-glow`. This wins over the base `.btn-accent`'s Tailwind `hover:shadow-glow`
on specificity, which is how the glow ends up *composed* with the crown light rather
than replacing it.

**Press puts the crown light out.** `:active` sets `background-image: none` and
replaces the shadow stack with a single inset dark shadow. That is the whole physics
of a key going down: the highlight is the first thing to go, before any travel. (The
1px travel itself is pre-existing and already behind `prefers-reduced-motion`, so the
press still reads correctly with motion off — the light going out is not motion.)

`:disabled` drops the gradient and the shadow entirely, so an inert key is flat. A
disabled control that still catches the light is a control that still looks pressable.

### `.btn-ghost` — a recessed key

The secondary key goes the other way: it is **recessed**, because it is the one you
have to look for. Fill sits between `--background` and `--surface` (55/45), an inset
lit edge on the top lip, and a very tight drop.

The fill choice is a constraint, not a taste call. Doc 83 §3 put `.btn-ghost` on
`--control-edge` to satisfy WCAG 1.4.11 (≥3:1 on the boundary that identifies a
control), measured at 3.35:1. Darkening the fill toward `--background` can only
*raise* the edge's contrast against its own interior; lightening it toward
`--surface-2` would have eaten into a ratio that was verified live. The recess was
picked in the direction that cannot break the measurement.

`:active` inverts to an inset shadow — the key bottoming out in its well.

---

## 8. The chassis

### `.console`

The sidebar and the mobile topbar are the frame the whole app sits in, and they were a
flat column with a 1px right border. A console is a **slab**: it catches light on the
edge that faces the cabin and drops a short shadow onto the deck beside it.

`.console` is the slab material — a vertical gradient from a slightly raised top
(`--surface-2` mixed 55%) settling into `--surface` by 30%. `.console-right` and
`.console-bottom` pick which edge is lit and which way the shadow falls. Splitting the
material from the edge is what lets one class serve a left sidebar and a top bar
without either of them owning a direction it does not have.

### `.nav-live`

The active navigation item was `bg-accent/10` — a tinted rectangle that stops at a
hard edge. A lit channel on an instrument has a **floor that glows and walls that do
not**, so the fill is a left-anchored gradient dying out by 78%, with a lit edge on
the top lip. The light is entering the channel from the left, where the rail is; it is
not a highlighter pen laid over a row.

### The `.haze` deck floor

One line on `platform/src/app/(dashboard)/layout.tsx`:

```tsx
<div aria-hidden className="haze pointer-events-none fixed inset-0 -z-10" />
```

Doc 83 §6 named `.haze` the load-bearing primitive — *"a dark scene needs a horizon;
without one the eye has no depth cue and dark theme collapses to grey text on black"* —
and then **never put it on a shell at all**. (An earlier draft of this section said it
was "applied only on the marketing shell". That is wrong twice over: it has never been on
`(marketing)/layout.tsx`, and three of its five uses were already behind the login. §1
has the file list.)

What existed at `9ea8f81^` were five **per-route** hazes: the auth shell,
`(dashboard)/hazard/page.tsx`, `(dashboard)/hazard/paywall.tsx`,
`(dashboard)/pricing/page.tsx` — all four `absolute inset-0` inside one page's own
wrapper — and `/dev/cluster`, which is `fixed` but is a dev page.
So two of the twenty-one `(dashboard)` routes had a floor (hazard, pricing) and nineteen
did not, and the two that did lost it the moment the page scrolled past its own wrapper.
That patchiness is a large part of why the authenticated app read as "dark" rather than
as a cockpit: on most screens every panel was floating on undifferentiated black with
nothing behind it to be in front of.

The line above is the **shell** copy — `fixed`, `-z-10`, on the group layout — so the
floor is behind every authenticated route at once and does not repaint on scroll. The
five per-route hazes are left alone; they compose harmlessly.

It composes three **static** gradients (a low wide glow at the horizon, a cool
off-centre overhead wash, a vignette). `fixed` so scrolling never repaints it, `-z-10`
so it is behind every panel, `aria-hidden` because it is not content. Nothing here
animates and nothing here blurs, so it cannot cost a frame.

---

## 9. The phone frame budget — what it ruled out

**The binding constraint is a Mali-G57, not a desktop.** A reader who does not know
that will "improve" this layer straight into a framerate problem, because every
improvement they would reach for is the expensive one. So, explicitly:

| Ruled out | Why | What was used instead |
|---|---|---|
| More `backdrop-filter` | Every blurred layer is a full-surface readback per paint. The one that exists (`.hud-panel`, 10px) predates this layer and is one of doc 64's 1–2 permitted per screen | Rims and lit edges, which are free |
| Soft, wide shadows | A 60px-blur shadow is a large blurred surface recomputed on every paint | Nothing above 24px of blur; contact shadows with a large negative spread |
| A full-screen animated layer | Continuous compositing cost for ambience nobody looks at | `.haze` — three static gradients, `fixed`, never animated |
| Animating anything but `transform` / `opacity` | Layout and paint on the main thread; the INP budget is 200ms (doc 64 §7) | Two transitions in the whole layer, both compositor-only or shadow swaps |
| Extra DOM per ornament | An ornament element per card is one more node on every card — and the marks are per-*instance*, so the bill is paid by the longest list on the busiest screen, not by the 79 in the repo | `::before` / `::after`, gradients, and shadow tokens |
| WebGL for "3D" | A context costs a compile, a first-frame stall and a permanent GPU allocation | Real perspective where it is needed, drawn by the compositor |

One of those rows was argued badly in the first draft: it read "266 cards × an ornament
element is 266 more nodes", which was both the wrong count (§2) and the wrong unit. A
repo-wide class-token count says nothing about a frame; what costs a frame is the node
count of one rendered list. The rule stands unchanged — a pseudo-element is free where an
element is not — but it stands on layout cost per screen, not on a number in `src/`.

**Every effect in this layer is a static `box-shadow`, a static gradient, or a
transform/opacity transition.** That is the rule. If a future change needs a blur, it
is spending one of the screen's two glass budgets and should say so in the PR.

---

## 10. Contrast is untouched by construction

Doc 83's palette work was verified by computing ratios. This layer is verified a
different way, and the difference is the point: **it changes no fill that a glyph sits
on.**

Every ratio the guard tests pin — mastery ink at 7.25:1, the answer controls at
3.51–3.66:1 across 99–100% of their outline, the forced-colors path in
`.check-control` — is ink against a **fill**. The bezel is three 1px edges plus a
shadow drawn *outside* the box. `.panel-head` is a rule and a tick. `.graticule` is
`aria-hidden`. `.framed` is two corner brackets with `pointer-events: none`. None of
them repaints the ground under a character.

The declarations that *do* set a background in this layer are `.track` (a bar with no
text in it), `.btn-ghost` (darker, §7), `.console` (chrome behind labels that were
already measured on `--surface`) and `.nav-live` (a gradient under accent-coloured
text, mixed at 22% of an accent that is 7.7:1 on the surface).

**The one deliberate exception is `.btn-accent`,** and it was constrained so that it
can only move the ratio the right way: the ink is the near-black `--accent-foreground`,
the gradient only *lightens*, and only the top half. So the pinned 8.1:1 pair can only
improve where the gradient lands and is untouched where it does not.

### The case that closes it — and what kind of evidence this is

The answer controls on `/theory/practice` were the case to check: they are the most
contrast-sensitive thing behind the login and they sit inside cards this layer restyles.
They are **unchanged by construction** — not re-photographed. Being exact about which of
those two it is matters more than the reassurance does, so:

1. **Neither participant was touched by the commit.** `git diff --numstat 9ea8f81^
   9ea8f81` is empty for `components/ui/CheckControl.tsx` and for
   `app/(dashboard)/theory/practice/`. No markup, no props, no classes moved.
2. **The control paints its own box.** `CheckControl` renders
   `appearance-none border-2 border-control-edge bg-background` (CheckControl.tsx:95),
   so the measured pair is `--control-edge` against `--background` — a fill and an edge
   that this layer declares nothing about.
3. **The interior block declares no background on `.card`, nor on any answer-row
   ground.** `[data-surface="cluster"] .card` sets `border-top-color`,
   `border-bottom-color` and `box-shadow` and nothing else; the bezel's shadows are
   three 1px edges and a contact shadow drawn outside the box. The row's `--surface`
   fill is doc 83's and is untouched (§12).

Those three together mean the 3.51:1 pair *cannot* have moved, which is a stronger claim
than a screenshot comparison would license — a screenshot shows one viewport at one
zoom, and would leave a reader wondering about the states it did not capture. What was
**not** done is a fresh before/after pixel capture at this commit; the pinned numbers in
`checkControl.test.ts`'s header come from the earlier captures, and the tests below
re-derive the composite arithmetic against the current compiled stylesheet.

`clusterScope.test.ts`, `checkControl.test.ts` and `mastery.test.ts` — 159 tests,
including the sRGB composite arithmetic behind that 3.51 — pass (3 files / 159 passed,
re-run 2026-07-28).

---

## 11. Weight

The block, measured as source and as shipped bytes (lightningcss minify, level-9 gzip):

| | Source lines at `9ea8f81` | Source lines today | Minified | Gzipped |
|---|---|---|---|---|
| The class-rebinding layer (§4–§8) | 318 | 329 | 3,898 B | 1,147 B |
| The whole `THE INTERIOR` block | **496** | **507** | **6,277 B** | **1,773 B** |

The two source-line columns differ by 11 because this correction pass added eleven lines
of **comment** to the block (the count note in the banner, and the `.card-live` open item
from §4). **The shipped columns are byte-identical before and after**, because
lightningcss strips comments — re-measured after the edit and both rows reproduce exactly.
That is also why the shipped figure, not the source figure, is the one to quote.

**Zero JavaScript.** Nothing here is a component; the `.haze` line adds one
`aria-hidden` div to a server layout. The entire interior of the product changes
appearance for 1.8 KB over the wire, and that is the direct consequence of §2 — the
alternative, hand-editing the 245 call sites of the four rebound classes, would have cost
markup on every one of them and would still have missed the ones added next week.

**The 178-line difference between the two rows is the instrument deck** — `.gauge`,
`.deck`, `.gauge-tile`, `.deck-sheet`, the theory hub's topic chooser. Those rules
share the block because **this file has exactly one `@layer components` opening**, and
`checkControl.test.ts` asserts that by scanning the file as text (the forced-colors
block at the end is only correct while it is the thing *outside* the layer). A second
layer block would have quietly falsified that test's premise. They are a different
lane and are not documented here.

That sharing is also where two of §9's rules are spent, and it is worth knowing which:

- the layer's only `backdrop-filter` is `.deck-sheet::backdrop` (3px), on a modal
  backdrop that exists only while a `<dialog>` is open. The class-rebinding layer
  itself declares **none**;
- `.gauge-tile:focus-visible` and `.deck-sheet` reference `--depth-2` / `--depth-3`,
  doc 83's pre-existing elevation tokens, which carry 36px and 64px of blur. Those are
  a momentary focus ring and one modal sheet. **No shadow the class-rebinding layer
  declares exceeds 24px of blur** (`.hud-panel`'s `0 14px 24px -18px` is the widest;
  `--shadow-glow` is `0 0 24px 0`).

---

## 12. What this layer did NOT do

- **No component was rewritten to *receive the baseline*.** That is the entire mechanism
  (§2), and it is the only "no markup was edited" claim this doc is entitled to make.
  **Markup was very much edited to adopt the opt-in marks:** 19 files in commit
  `9ea8f81` gained one of the new class tokens —

  `(dashboard)/layout.tsx`, `(dashboard)/dashboard/page.tsx`, `(dashboard)/exams/page.tsx`,
  `(dashboard)/settings/page.tsx`, `(dashboard)/tutor/page.tsx`,
  `components/dashboard/DashboardShell.tsx`, `ModuleGrid.tsx`, `XpBar.tsx`,
  `TopicMasteryGrid.tsx`, `ContinueLessonCard.tsx`, `DailyMissionCard.tsx`,
  `AchievementsRow.tsx`, `StreakBadge.tsx`, `components/theory/TheoryFocus.tsx`,
  `TopicDeck.tsx`, `TopicGauge.tsx`, `TopicSheet.tsx`, plus the two dev preview pages
  `dev/cluster/page.tsx` and `dev/theory-deck/page.tsx`.

  (Reproduce: for each `.tsx` in `git diff --name-only 9ea8f81^ 9ea8f81 -- platform/src`,
  grep the added lines for the new class tokens. Note that the commit edits more `.tsx`
  than these — `LessonPlayShell.tsx` and `(dashboard)/theory/page.tsx` among them — but
  those are the sim-viewport and theory-hub-height lanes and adopt none of these classes.)

  Adoption counts today for this layer's own classes, by the §2 method: **17**
  `.panel-head` (10 of them also `.panel-head-bleed`), **18** `.metric`, **8**
  `.graticule`, **8** `.framed`, **5** `.track`, **4** `.console` (each paired with a
  direction — 2 `.console-right`, 2 `.console-bottom` — in `DashboardShell.tsx` ×3 and
  `/dev/cluster` ×1), **2** `.card-live`, **1** `.nav-live`. An earlier draft said
  "~8 `.track`"; it is **5** — `XpBar`, `ContinueLessonCard`, `DailyMissionCard`,
  `TopicMasteryGrid` and the `/dev/cluster` sample. Every one of those classes was at
  **0** call sites at `9ea8f81^`, which is the check that they are genuinely new names
  and not redefinitions (§12, second bullet). Doc 83's `.panel-inset`, which this layer
  does not define, went from 6 to 12.
- **Nothing outside `[data-surface="cluster"]` moved.** The scoped rules are scoped;
  the unscoped ones (`.panel-head`, `.graticule`, `.metric`, `.framed`, `.track`,
  `.console`) are new class names with no existing call sites outside the group.
- **No token value changed.** Doc 83's palette is the palette. This layer only spends it.
- **`.field` was not touched** — it already had the recessed treatment (§2).
- **It did not finish `.card-live`. OPEN ITEM.** Three `.card` elements inside the scope
  still carry the raw `hover:shadow-glow-sm` utility and therefore still lose their bezel
  on hover — `ScenarioCatalog.tsx:132`, `ExamModeCard.tsx:39`, `LessonCard.tsx:32`, all in
  `components/sim/lesson-ui/`, all rendered from `(dashboard)/simulator`. §4 has the
  mechanism and the one-token fix. Left undone deliberately: that directory is owned by a
  concurrently-running lane.
- **No theme toggle.** Still nothing writes `data-theme`; outside the dashboard group
  and the marketing scope, the OS still decides.

---

## 13. Reproducing the measurements

- **Weight:** extract the block from `globals.css` and run it through `lightningcss`
  with `minify: true`, then `zlib.gzipSync(…, { level: 9 })`. The two rows in §11 are
  the `THE INTERIOR` banner through the end of the deck rules, and the banner through
  the end of `.nav-live` — at the time of writing, globals.css lines 843–1349 and
  843–1171. Feed the slice to `transform()` **as-is**; do not re-wrap it in
  `@layer components { … }`, which adds 19 B minified and would put the rows 19 B out.
- **Class-token counts (§2, §12):** the method is spelled out in §2 — parse `className=`
  values, take the string literals inside, drop `${…}` interpolations, split on
  whitespace, count exact token matches. Do **not** use `grep -c card`: `card` is a
  common English word and identifier in this repo and a word-boundary sweep overcounts
  by ~7×. Calibrate any implementation against `border-border`, which must come out at
  171.
- **Blur audit:** grep the block for `backdrop-filter` and for `box-shadow`, and read
  the third length of every shadow; follow `var(--depth-*)` and `var(--shadow-glow*)`
  back to their definitions rather than trusting the literal values.
- **Contrast:** `npx vitest run src/app/clusterScope.test.ts
  src/components/ui/checkControl.test.ts src/components/ui/mastery.test.ts` — 3 files,
  159 tests. The pixel numbers behind `checkControl.test.ts` come from headless
  Chromium captures at 390 × 844 against the app's own compiled stylesheet, read as a
  360-ray crossing profile out of the box centre; the file's header carries the
  before/after table.
- **Look before ship (doc 66 R0):** `/dev/cluster` gained an `Интериор · класове`
  section that renders the head, the bezel, the framing corners, the graticule, the
  inset readouts, the tracks, all four button states, `.nav-live` and the console slab
  on one page, at the size they are actually used. It 404s in production. A bezel, a
  head rule and a tick strip are judgements a screenshot settles and a diff does not —
  the same reason doc 83 §10 built the page in the first place.
