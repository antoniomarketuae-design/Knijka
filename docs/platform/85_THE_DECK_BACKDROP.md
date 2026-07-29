# 85 — The deck: the backdrop behind the authenticated app

> Doc 83 gave the product an instrument-cluster palette. Doc 84 gave its panels a
> bezel, a graticule and readouts. This doc is the layer *behind* those panels —
> the room they are mounted in.

---

## 1. The complaint

Founder review, verbatim:

> „here in the background of this page, I want futuristic 3d background like we did
> in the landing page, currently this dark background is purely old and not futuristic"

…and, of the authenticated app as a whole, earlier:

> „we made it dark but nothing much changes … We need 3d futuristric design inside aswell"

He was looking at `/dashboard`.

---

## 2. What was actually there — and a bug that made it worse

Doc 83 §6 introduced `.haze` and called it *the load-bearing depth primitive*: three
static gradients (a low glow at the horizon, a cool overhead wash, a vignette). The
`(dashboard)` layout mounted it as `fixed inset-0 -z-10`.

**It was never visible on a single authenticated page.**

A negative-`z-index` child paints in step 3 of its stacking context; a non-positioned
block's own background paints in step 4. The wrapper carried `bg-background` and formed
**no** stacking context, so the nearest one was the root — which put the wrapper's
opaque fill *on top of* the layer that was supposed to be behind everything. Captured at
1440×900 and 390×844, the plane was flat `#05070c` edge to edge.

So the honest description of the "before" is not "three gradients that were not enough".
It is: **there was no backdrop at all.** `isolation: isolate` on the wrapper is the fix,
and it is one class.

---

## 3. What replaced it, and why it belongs to *this* product

The landing page shows a car on a Bulgarian road at dusk, under Vitosha, from astern.
Logging in should not teleport a student into a different product. So the authenticated
plane holds **the same road, the same dusk and the same crest — from the driver's seat**,
with a heading tape etched across the horizon. The panels then sit on the glass in front
of it, which is exactly the claim the product makes: an instrument cluster reading a real
road.

It is *literally* the same road, not a resemblance:

| | landing hero | the deck |
|---|---|---|
| geometry | `@/lib/visual/roadPlate` | the same module |
| camera | chase, eye 1.6 m | driver, eye **1.15 m** |
| Vitosha | `PLATE_RIDGE_POINTS` | the same points, through `reprojectPlatePoint` |
| lane cadence | 3 m paint / 9 m gap | the same constants |

`reprojectPlatePoint` converts a point between two pinholes exactly (a point is fully
described by the azimuth/elevation it subtends, which is camera-independent). So the
mountain outside the windscreen is *provably* the mountain behind the car on the landing
page — `deckScene.test.ts` pins it, including that the summit stays at 7.18°.

**Why it is not a generic dark dashboard.** Every dark SaaS product has a gradient blob.
None of them has a vanishing point, a real massif at its true angular height, a lane
cadence in metres, and a boresight on dead ahead. And the boresight is not decoration:
„look far, where you are going" is the first thing an instructor says, and the vanishing
point is that instruction, drawn.

---

## 4. The constraint that shaped every colour

Several review rounds bought specific measured ratios on these exact surfaces — mastery
ink 7.25 : 1, the answer controls 3.51–3.66 : 1 across 99–100 % of their outline, plus
everything `clusterScope.test.ts` pins. Those are all *ink against a fill*, and a
backdrop that lifts the plane under a glyph spends them.

So the deck holds itself to a rule that is absolute and cheap to check:

> **Nothing the deck paints may be brighter than the layer it replaces.**
> `.haze`'s brightest pixel is `--haze-warm` over `--background` = `#0c1724`,
> relative luminance **0.008183**. That is the ceiling.

It is a *proof*, not a sample. sRGB alpha compositing and gradient interpolation are
per-channel linear blends, the sRGB transfer is monotonic, and relative luminance is a
positive-weighted sum — so a blend can never be brighter than its brightest ingredient.
Check the ingredients and you have checked every pixel. `deckScene.test.ts` checks all
twelve, computes the ceiling *from globals.css* rather than transcribing it, and guards
the other half of the argument: no `mix-blend-mode`, no `filter`, nothing additive.

Consequences that fell out of the ceiling and improved the design:

- **The graticule is cut *dark* into the lit horizon, not drawn bright over it.** An
  accent-blue tick at even 3 % alpha is 108 % of the ceiling. Etching is how a real
  instrument face works anyway — the metal is removed and you see the absence of the
  backlight.
- **Lane paint is 0.035 alpha.** 0.04 is 105 % of the ceiling.
- **The one lit element is the boresight**, at exactly `#0c1724`. The brightest thing a
  student sees on this plane went from a 400 px glow to about 60 px of hairline.
- **The cabin vignette only ever darkens** (every stop is black at some alpha), so it is
  exempt from the argument entirely and can only improve contrast.

---

## 5. The ladder

The hero's capability door already existed and its comment is the product's policy:
*"A wrong 'yes' costs a teenager megabytes of their data plan."* The deck reuses it
rather than cloning it — the signals and the decline vocabulary moved to
`@/lib/visual/deviceSignals`, shared by both surfaces, while each keeps its own policy
because the questions differ.

| rung | what it adds | who gets it | measured cost |
|---|---|---|---|
| `still` | the drawn plate: sky, Vitosha, road, graticule, boresight | **everyone** — SSR, every phone, reduced-motion, save-data, 2g/3g, narrow windows | 9,466 B of inline SVG (**1,615 B gzipped**), 0 requests, 0 JS; **+0.00 ms** median frame, +0.10 ms p95 |
| `depth` | one compositor-only CSS animation: a warm light crossing the horizon, 240 s per traverse | desktop-class only, and never on `/simulator` | 0 extra bytes; **+0.00 ms** median frame, **+0.00 ms** p95 |

Frame costs are best-of-3 interleaved runs of a 5 s scripted scroll, sampled with
`requestAnimationFrame`, at 1440 × 900 / 1× CPU **and 390 × 844 / 4× CPU** (the Mali-G57
class doc 82 §2.2 names as binding). On *both* profiles all three conditions — plane
removed, `still`, `depth` — land on the same **16.70 ms median**, i.e. a locked 60 fps,
with p95 deltas inside ±0.10 ms (measurement noise: one of them is negative). A `fixed`
layer that never repaints on scroll really does cost nothing, and neither does one
composited quad moving 0.4 % of the screen width per second.
Script: `tools/clips/headless/deck-cost.mjs`.

**There is no WebGL rung, on purpose.** Three reasons, and they should be re-read before
anyone adds one:

1. `/simulator` is inside the `(dashboard)` group, so a canvas in that layout is mounted
   *under the simulator* — a second live GL context on the one route whose frame budget
   is the product.
2. A still layer does not need a 3D engine. The brief for a backdrop is that it must not
   move much; a frozen WebGL render is a picture with ~600 KB of runtime attached. The
   drawn plate *is* the picture, at zero requests and zero JavaScript.
3. A hero is one page. This is the shell around the whole app, paid for on every
   navigation.

**240 s per traverse** is ~0.4 % of the screen width per second: you cannot watch it
move, and you can tell it moved if you look away and back. That is the whole brief for
motion behind text — a hero is watched, a deck is inhabited, and anything faster reads as
a screensaver rather than as atmosphere. `document.hidden` pauses it;
`prefers-reduced-motion` kills it in CSS as a backstop even if the JS door said yes.

---

## 6. Files

```
platform/src/lib/visual/roadPlate.ts       the road + the pinhole camera, shared
platform/src/lib/visual/deviceSignals.ts   the signals + decline vocabulary, shared
platform/src/components/deck/deckScene.ts        the deck's camera, palette, graticule
platform/src/components/deck/DeckPlate.tsx       the drawn SVG (Server Component)
platform/src/components/deck/DeckMotion.tsx      the only JS: the `depth` rung
platform/src/components/deck/DeckBackdrop.tsx    the four layers, composed
platform/src/app/globals.css                     .deck / .deck-cabin / .deck-drift
```

`.haze` is **kept**, unchanged. It is still the right primitive for a *bounded* panel —
the auth card, `/pricing`'s showroom band, the hazard stage. What it could not be is a
world.

---

## 7. The dial, and what each notch costs

The deck is subtle **by construction**, because the ceiling is the ceiling. If the founder
wants it louder, that is a legitimate call, but it is a trade against measured text
contrast and it should be made with the numbers in front of it. Ink over the plane's
brightest pixel, as a function of raising the ceiling:

| ceiling | `--foreground` | `--muted` | `--accent` | `--control-edge` |
|---|---|---|---|---|
| **×1 (today)** | 15.48 | **6.78** | 7.21 | **3.41** |
| ×1.5 | 14.47 | 6.33 | 6.74 | 3.18 |
| ×2 | 13.57 | 5.94 | 6.32 | **2.99 ✗** |
| ×3 | 12.08 | 5.29 | 5.63 | 2.66 ✗ |

`--control-edge` is the binding constraint, not the body text: it is the *only* thing that
identifies a ghost button or a text input, WCAG 1.4.11 wants ≥ 3 : 1 for exactly that, and
it crosses the line at about **×1.9**. So there is a little under a doubling of headroom,
and past that the change stops being cosmetic.

---

## 8. Verification

```
platform/src/components/deck/deckScene.test.ts       the ceiling + the shared geometry
platform/src/components/deck/deckCapability.test.ts  the door, every refusal pinned
tools/clips/headless/deck-shots.mjs      frames (--bare isolates the plane,
                                         --boost N exposure-boosts it for inspection,
                                         --nodeck reproduces the before)
tools/clips/headless/deck-contrast.mjs   per-pixel diff: which pixels the deck reaches
                                         at all, and the brightest one among them
tools/clips/headless/deck-cost.mjs       bytes, frame times, paint timings per rung
```

`deck-contrast.mjs` exists because the token tests cannot see a backdrop: they compute
their ratios from `globals.css` and would keep passing if this layer painted a sunrise
behind the theory reader. It hides every panel, screenshots the plane on its own, and
reports its brightest pixel; then it reads the computed `background-color` of every
surface that carries a pinned ratio and checks the alpha is 1.

**It earned its keep on the first run.** The ceiling argument was correct and the drawing
still broke it: the road ramp finished on `DECK_SKY_HORIZON`, and the lane paint —
white-ish, legal only as a composite — was drawn on top of that horizon-bright base.
663 pixels at `#0f1721`, L 0.008242 against a ceiling of 0.008183. Small, real, and
invisible to every test that reasons about tokens instead of pixels. The fix was drawing
ORDER, not opacity, and both halves of it are now pinned in `deckScene.test.ts`.

Final measurement, 1440 × 900 and 390 × 844, `/theory` and `/theory/practice`:

```
brightest pixel the deck paints anywhere = #0c1724 (L 0.008183)
ceiling                                  = #0c1724 (L 0.008183)   HOLDS
```

The brightest pixel *is* the boresight, which is painted in the ceiling colour on
purpose. Everything else on the desktop plane tops out at `#0f161f` (L 0.007743, 95 % of
the ceiling); the plane's mean is L 0.0026, a third of it.
