# The mobile harness

A repeatable way to measure this product on the phone it is actually used on,
instead of shrinking a desktop window and hoping.

```bash
node tools/mobile/cli.mjs                # full sweep, WebKit, all routes
node tools/mobile/cli.mjs --list         # routes + devices + their budgets
node tools/mobile/cli.mjs -r simulator-drive -d iphone16-landscape
node tools/mobile/cli.mjs --engine chromium     # SECOND opinion only
node tools/mobile/cli.mjs --cleanup-user        # delete the throwaway account
```

Exit code 0 when every route met its budget, 1 otherwise — so it is usable as a
gate step on its own. The same verdict is available to vitest through
`budget.test.mjs`.

---

## The two rules this harness exists to enforce

**1. WebKit, not Chromium.** Every mobile check this project ever ran used
Chromium with an iPhone user-agent. That is not an iPhone. Safe areas, toolbar
behaviour, scroll containment, viewport units and touch hit-testing are exactly
where the two engines disagree, which is why fixes passed on the dev box and
died on the founder's screen. `webkit` is the default and the only engine the
budget gate will accept; `--engine chromium` is available as a second opinion
and `expectMobileBudget()` refuses to render a verdict from one.

The harness found its own example on day one: `page.fill()` on the login form's
React-controlled `type="email"` input sets the DOM value but never reaches React
state **in WebKit**, so the form submits empty. In Chromium the same call works.
`lib/auth.mjs` types with real key events because of it.

**2. Strict measurement.** A previous run reported "87% road" by counting
translucent controls as road, on the argument that the wheel and pedals "are the
car, not page furniture". Its own strict figure was 70.3%. The founder looked at
his screen and said half of it was information.

> **Any pixel a UI element paints on is NOT free. Translucent included.**

---

## What "covered" counts — exactly

`lib/probe.mjs` runs in the page and rasterises two masks at 1 CSS pixel.

* **content mask** — the union of the route's declared content surfaces
  (`lib/routes.mjs`), clipped to the viewport. On a reading screen that is
  `#main-content`; on the driving screen it is the `<canvas>`, because there the
  content is the road; on the practice runner it is the **question card**, not
  the column around it.

  That last one is the rule, not an exception: **a budget you can satisfy by
  growing a `<div>` is not a budget.** `#main-content` is a wrapper, and the app
  shell now lets a page stretch it to the bottom of the screen — so measuring it
  on the runner would have turned "half the screen is empty" into a 92% pass
  without one pixel changing for a student. Whenever `#main-content` stops being
  the thing the student is looking at, the route names the thing.
* **chrome mask** — the union of every *painting* element that is not the
  content, not one of its layout ancestors, and not behind it.

Then:

```
free content = content AND NOT chrome
contentFraction = |free content| / viewport      <- the headline number
chromeFraction  = |chrome|      / viewport
unclaimed       = the rest (bare app backdrop outside the content surface)
```

The three are disjoint and sum to 1. Chrome that overlaps the content is charged
to chrome only — that is what makes a translucent panel cost road.

**An element "paints" if** its computed style says so: a background colour with
any alpha above 0, a background image, a visible border, a box-shadow, a
`backdrop-filter`, an outline, or being a replaced element (`img`, `svg`,
`canvas`, `video`, form controls). Text paints too, and only over its real glyph
line boxes — measured with a `Range`, so a wide flex row holding one short word
is charged for the word, not the row.

**Deliberately not counted:**

| Not counted | Why |
| --- | --- |
| `display:none`, `visibility:hidden`, effective `opacity:0`, zero-area, fully clipped | they paint nothing |
| ancestors of the content surface | `<body>` paints the app background across the whole screen; charging that would score every page at 0% and tell you nothing |
| negative z-index subtrees | CSS *defines* them as painting behind the content. The dashboard's `.haze` horizon (`fixed inset-0 -z-10`) is one; before this rule it was charged with 99.11% of the screen |
| `.sr-only` (`clip: rect(0,0,0,0)` / `clip-path: inset(50%)`) | a 1×1 box with a sentence-wide text run that puts no pixel on screen |
| interactive elements that paint nothing at all | the founder asked for controls that are "absolutely invisible and small". They cost no road — and they are reported separately as `invisibleInteractive` so the trade is visible rather than laundered |

**Known conservative approximations**, all in the direction that *over*-reports
chrome, which is the safe direction for a budget: rounded corners and
box-shadow spill are charged to the border box; shadow DOM is not traversed
(this app has none — if that changes, this under-reports and must be extended).

Beyond the headline number the probe reports `topContributors` (which elements
took the pixels) and a 12-band row profile, which is what turns "48% is
controls" into "the bottom 188px is a solid band".

---

## The other four checks

**Fold** — for each route's `mustFit` selectors, is every matched element fully
inside the viewport with zero scrolling, and does the document itself scroll.
Reports the overflow in pixels and how far a containing scroller would have to
move. This is the founder's "I have to scroll down to see all the answers … it
all have to be on the screen without scrolling".

Prefix a selector with `first:` to check only the first match —
`first:#main-content [data-topic-card]` asks "is the first topic card reachable
without scrolling", which is the useful question on a long list; without the
prefix the same selector asks whether *all sixteen* fit, which is true only of an
empty page. Everything without the prefix is all-or-nothing on purpose: on the
practice runner every answer must be on screen.

### The three ways a fold check can be a lie, and what stops each

**It matches nothing.** A `mustFit` selector that matches zero elements fails the
route unconditionally, even where `foldMustPass` is off. The harness caught
itself doing this twice: `label:has(input[type="radio"])` matched nothing on
multi-answer questions (they render checkboxes), and — for four months —
`first:#main-content article` matched nothing on `/theory`, because the topic hub
renders `<li><button>` and has never contained an `<article>`. Every mobile
report in that window vouched for a screen it had not looked at.
`tools/mobile/selectors.test.mjs` is the cheap second net: it runs in the
ordinary vitest gate, with no browser and no server, and fails in the same commit
that removes the markup handle a route depends on.

**It is switched off because the page legitimately scrolls.** `foldMustPass`
demands BOTH that the named elements fit and that the document does not scroll —
which is the wrong demand on a sixteen-topic hub, so that route had the whole
check off, and that is why the dead selector above went unnoticed.
`foldItemsMustFit: true` is the half that always applies: the page may be longer
than the phone, the *first topic card* may not start below it. On an iPhone 16 in
landscape it was starting 199px below the fold — the founder's "only 20% visible
to choose the topic", except it was 0%.

**It measures against the wrong line.** The fold is the top of a pinned action
bar, not the viewport edge: an answer painted under an opaque sticky strip is
neither readable nor tappable. `src/components/mobileFold.test.ts` states this
and the fold-rig measurements honour it.

**Touch targets** — every visible, enabled interactive element in the viewport
whose hit area is under 44×44 CSS px. Two things are *not* violations, because
neither is a box a thumb can miss:

* a control wrapped by its own `<label>` inherits the label's hit box (the tick
  box in a practice option is a real 16×16 `<input>` inside a `min-h-11` row, and
  clicking anywhere in that row activates it — that is the browser's behaviour,
  not a convention). The test is `label.control === el`, so a small button that
  merely *sits* inside a label keeps failing;
* the absolutely-positioned `::before`/`::after` enlargement trick, which is a
  real hit box with real pointer events.

**Safe areas** — elements within 8px of an unsafe edge. Note carefully:
Playwright's WebKit is the *desktop* port, so `env(safe-area-inset-*)` resolves
to 0 no matter what viewport is set. Reporting that as "no safe-area problem"
would be a lie, so each device profile carries the **real** device insets
(iPhone 16: 59/34 portrait, 59 sides + 21 bottom landscape) and the probe treats
those as the unsafe bands, while still reporting what `env()` actually returned
and whether the app's stylesheets reference `safe-area-inset` at all.

---

## The tenth instrument defect: the clipping test could only ever return zero

Six sweeps reported **"0 clipped text"** on a screen that, opened and looked at,
shows letters sliced through the middle of the glyphs. The instrument was the
bug, and the bug was one line — `wave6-cards.mjs:383`:

```js
clipsOwnText: el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0
```

That asks *"does this box overflow **itself**"*. It is structurally incapable of
seeing any of the three ways text is actually lost:

| what really happens | why `scrollWidth > clientWidth` returns 0 |
| --- | --- |
| a **parent** clips the text | the `<p>` fits its own content exactly; the offender is two levels up and is never consulted |
| the **viewport** clips the text | a panel at `top:-18px` has a `<p>` whose rect starts at `y = -6`; every box in the chain is internally consistent, and the screen is not in the chain |
| **ellipsis / line-clamp** | truncation is a property of the *block*, and the block is exactly as wide as it is allowed to be |

Run side by side with the instrument below on the deployed build, six profiles,
four states: the old test's **only** hit was `«Към съдържанието»` — the `sr-only`
skip link, which is *supposed* to be clipped. Zero true positives, one false
positive per profile.

### `wave11-seeing-eye.mjs` — the replacement

It does not ask a box about itself. For **every text node in the document** it
answers the question a student's eye asks — *which of these characters can I
actually read?* — character by character, with a `Range`, against the
intersection of every clipping ancestor's padding box **and** the viewport box.
Five detectors, because each of the founder's frames fails a different one:

- **A — ancestor clip.** Every text rect against the padding box of every
  ancestor whose `overflow-x/y` is `hidden|clip|auto|scroll`, innermost offender
  named. Scrollable ancestors are reported apart from `hidden` ones: content you
  can scroll to is *hidden now*, content under `hidden` is *gone*.
- **B — viewport clip.** Every text rect against `{0,0,innerWidth,innerHeight}`.
- **C — glyph slice.** Per **line box**, the visible fraction and the surviving
  line height. `2.6 of 14px` is not "mostly fine" — it is a row of decapitated
  letters, and it is what the founder photographed.
- **D — truncation.** `text-overflow:ellipsis` / `-webkit-line-clamp` read off
  the **clamping ancestor**, never the text element, plus the full string.
- **E — overprint.** Pairwise intersection of text rects from unrelated
  elements — after each rect is clipped to its own visible window, because
  comparing raw line boxes invents collisions between ink that is not painted.

Two things it deliberately does **not** claim:

- `sr-only` (`width:1px;height:1px;overflow:hidden`) is excluded and counted
  separately. An instrument that cannot tell the visually-hidden idiom from a
  defect buries the defect under boilerplate.
- Anything painted **inside the WebGL canvas** — the cockpit's analogue dial and
  its 40/80/120/160 — is a texture, not a node. No DOM instrument can see it,
  ever. `wave11-zoom.mjs` captures those regions at device scale so a human can,
  and prints which DOM text lands inside each region so the two can be argued
  against each other.

`wave11-rotate-card.mjs` / `wave11-rotate-race.mjs` exist for the same reason in
the other direction: `[data-hud="touch-hint"]` is `display:none` whenever an
overlay is up (`PlayAreaStyles` §ROW C1), and in a lesson the overlay queue is
never empty — so a probe that waits six seconds for the scene to settle measures
a card that is not on the screen and reports it as fine. The race probe polls
from first paint and says so out loud when the card never renders at all.

---

## The ninth instrument defect: the whole harness ran at inset 0

Carrying the real numbers in `devices.mjs` was only half the job, and the half
that was missing is the one that decides layout. The **app** still laid out at
`env(safe-area-inset-*) = 0`, because that is what the engine returns — so
"is this control inside the notch band" was asked of a document that had never
heard of a notch, and every fold, screen-share and „20 of 20" number this
project has produced describes a phone with no cutout and no home indicator.

On the founder's iPhone 16 that is **34 px of height in portrait** and **118 px
of width plus 21 px of height in landscape** that no measurement ever charged.
Parity was won by roughly the margin the insets eat: with them present, both
runners scored **0 of 20 in both orientations** — and not by 34 px of scroll,
but because the question text was clamped to its 62 px floor on most items.

`lib/insets.mjs` closes it. `env()` cannot be given a value from outside the
engine, so instead **every place the authored CSS asks for
`env(safe-area-inset-X)` is rewritten, in the page, to the profile's real
number for X, before the document's first layout** — CSSOM declarations (all
of them, including nested / `@media` / `@layer` / `adoptedStyleSheets`) and the
`style=""` attributes React writes on the shell, re-applied whenever React puts
them back.

```bash
node tools/mobile/cli.mjs                          # real insets — the default
node tools/mobile/fold-sweep.mjs --insets none     # the OLD, notch-less run
node tools/mobile/fold-sweep.mjs --rotation left   # cutout on ONE side only
```

Three properties make it a measurement rather than a hope:

* **`newDeviceContext()` is the only door.** `insets.test.mjs` fails on any
  `.newContext(` under `tools/mobile` that is not preceded by an
  `// insets-exempt: <reason>` comment. The defect was never a wrong number; it
  was that opening a context was a one-liner that said nothing about the notch,
  so six probes independently did the same wrong thing. It caught a seventh
  (`engprog-look.mjs` hand-rolling 393×852) the first time it ran.
* **It must be able to fail.** `assertInsetsApplied()` refuses a page where the
  agent rewrote zero declarations, or where `<body>`'s padding did not end up at
  the asked-for inset — because "rewrote nothing" and "this phone has no notch"
  are the same reading, and one of them is the defect.
* **Both numbers are always printed.** The engine's own `env()` is still 0 and
  every report says so next to the emulated values. This substitutes values; it
  does not invent geometry, and a hard-coded pixel that happens to equal an
  inset is untouched.

**Landscape rotation is a real question with a stated answer.** Held sideways
the cutout is on one physical side and which one depends on which way you
turned the phone. iOS publishes both `left` and `right` as the inset (so a page
lays out centred), which is also the harder case — 118 px gone instead of 59 —
so `symmetric` is the default and the run prints which it used. `--rotation
left|right` measures the single-sided version.

**Screenshots** — one PNG per route × device, under `tools/mobile/.out/`, which
is gitignored (capture directories have been committed by accident twice in this
repo). Failures are captured too, named `FAILED__*`.

---

## The stability probe

`cli.mjs` answers "how much of the screen is left". `stability-probe.mjs`
answers a different question — **does any of it move, and does any of it sit
where the phone will not let you touch it.**

```bash
node tools/mobile/stability-probe.mjs --base-url http://localhost:3520
node tools/mobile/stability-probe.mjs -r theory -d iphone16-landscape
```

Same engine rule, same auth, same device profiles, six surfaces
(`/dashboard` is added — it is pure app shell, so a shell regression shows
there first), four profiles: **both orientations of both phone sizes**. Each
surface is measured three times — resting, with an overlay open, and after it
closes — and again with the viewport 90px shorter, which is the honest stand-in
for iOS's collapsing toolbar (Playwright cannot hide a real one).

| column | the founder's words | what it counts |
| --- | --- | --- |
| `edge!` / `+ovl!` | "controls not respecting safe areas", "controls touching screen edges" | elements inside the real device inset, resting and with the popup open |
| `margins L/R` | "uneven margins" | narrowest gap to the left edge vs to the right |
| `unreach` | — | controls outside the viewport with **nothing that can scroll** (resting / popup open) |
| `ovlp` / `occl` | "overlapping components" | interactive pairs whose hit areas intersect; and `elementFromPoint` at a control's own centre returning something else |
| `open` / `close` | "elements moving when popups appear" | max positional shift of everything outside the overlay |
| `bar` / `clip` | "the left and right sides are not stabalized" | shift after the toolbar takes 90px and gives it back; pinned controls cut off |
| `app ms` | "elements shifting position" | **app** ms for the layout to stop moving after each state change — timestamped inside the page |
| `instr%` | — | the probe's own share of the sample it took. Not inside `app ms`; past 25% the row prints `INSTRUMENT-BOUND` |

Two accounting rules it took a wrong answer to learn, both documented at their
call site:

* **A finding is classified from the authored CSS, not from the computed
  pixel.** Playwright's WebKit is the desktop port, so `env(safe-area-inset-*)`
  is 0 and an element that handles the home indicator *correctly* measures as
  22px inside it. Each finding is therefore labelled `envSelf` / `envBody` /
  `escapesBody`, and only "a `fixed` surface with no inset of its own" is
  BLOCKING. Getting the CSSOM walk wrong (`if (rule.cssRules) { recurse;
  continue; }` skips every style rule now that nesting gave them all an empty
  `cssRules`) reported the entire landscape column of the app as unprotected.
* **Position is the verdict; size is reported beside it.** A menu that grows
  because it just opened has not moved, and nothing moved with it.

* **Report what you measure.** `unreachable` was computed on every surface and
  every device from the day it was written and left out of the returned object,
  so the one defect it exists to catch was calculated and thrown away — and that
  defect was live: the nav drawer's „Изход" sat 173px below a panel that could
  not scroll. It had to be found by looking at a capture.

* **Wait for rest; never sleep at a state change.** The probe used to sleep 700ms
  after resizing the viewport. The portrait driving shell publishes its height
  from `visualViewport` through React state, and on this box it needs ~900ms to
  re-render — so the same code, app and device reported `bar = 0` on one run and
  `90` on the next, a 90px displacement of the cluster and speedometer that
  existed only in the instrument's timing. Every phase now polls a whole-page
  geometry fingerprint until two consecutive reads agree, and **reports how long
  that took** (`settle`), because raising the sleep would have hidden the one
  number worth having. `tools/mobile/toolbar-trace.mjs` is the diagnostic that
  established the mechanism.

* **Never let the instrument inside the number.** That polling loop then lived in
  Node, so every `page.evaluate` round trip — each one scheduled onto a main
  thread the 3D shell is already using — was charged to the app as settling
  time. Re-derived from the last recorded sweep: the `base` phase of
  simulator-drive / iphone16-portrait reported **32,144 ms of which 31,881 ms
  (99.2%) was the probe**, on a page that by construction was doing nothing,
  while the layout had been still since 1,477 ms. One crossing in that sample
  took ~30.5 s. On a quiet box the same arithmetic passes anything by 10 ms —
  including a black canvas. The loop now runs **inside the page**
  (`lib/settle.mjs`), timestamps itself with `performance.now()`, and crosses
  the bridge exactly once; the crossing is outside the metric by construction
  and its cost is printed beside it, never subtracted from it silently.
  `settle.test.mjs` drives that loop against a fake document and a page whose
  round trip is deliberately slow, so the property is pinned rather than
  asserted in a comment.

* **`base` is not a settling time.** Nothing changes state before it: the route
  has loaded, the popups are dismissed, the world has rendered and a 1.2–6 s
  sleep has elapsed. It is the FLOOR of this instrument on this box — worth
  having, and the right thing to compare the other phases against — but it was
  scored against the 1,200 ms budget like any other phase, and in the sweep
  above it was the **worst** one. A budget decided by the phase in which the app
  is idle is not a budget. It is now labelled `base(idle)` everywhere it is
  printed.

* **A readiness gate at the top of a row is half a gate.** Two overlay toggles
  and two viewport resizes happen between it and the capture, and each rebuilds
  the WebGL drawing buffer. The canvas is therefore asked again at every
  checkpoint and once more in the frame the screenshot comes from; a row that
  ends on a blank canvas is REFUSED and its capture is named `ENDED-BLANK__…`.
  Measured 2026-08-05 on simulator-drive / iphone16-portrait: the gate opened on
  a real street (287 colours, dark 0.083) and the same canvas measured 44
  colours by the end of the row. Every geometry number in between described a
  screen no student sees.

---

## Motion is a run parameter, and the report says which one

`reducedMotion: "reduce"` used to be hard-coded into `contextOptions` for
**every** device profile, with nothing printing it. That is a defensible default
for a layout sweep — an entry transition caught mid-flight makes two captures of
the same screen differ — but it means any animation claim ever made through this
harness compared a reduced-motion frame against a reduced-motion frame. It could
not have failed.

`contextOptions(device, { motion })` now **requires** the mode, and every report
prints it in its first three lines:

```bash
node tools/mobile/stability-probe.mjs -r simulator-drive --motion reduce   # default
node tools/mobile/stability-probe.mjs -r simulator-drive --motion allow    # what a student sees
```

| mode | Playwright | what it means for a claim |
| --- | --- | --- |
| `reduce` | `reduce` | geometry is deterministic; **no animation claim can be made from the run** |
| `allow` | `no-preference` | the app animates as it does on a phone; expect frames in flight to differ |

---

## The steered drive, and the tracking record that qualifies it

Until 2026-08-21 `lesson-audit.mjs` pressed throttle and brake and nothing else.
Every drive it had ever taken — 376 in Wave C, and every drive behind the
original 1,712 findings — was **a car travelling in a straight line**. That is
the mechanism under «the ego left the carriageway and stood still for 175 s» and
under a large share of the 92 of 145 lessons recorded as having no drivable
success path.

The drive path now closes a control loop on the product's own guidance ribbon.
**The deliverable is not "the car steers".** A car that steers *badly* fails like
a bad student — it wanders, clips kerbs, misses gates — and a judge reading the
frames cannot tell that from a product defect. So every drive publishes a
tracking record, and no finding may be read without it.

### Where to look

`_audit-status.json` → `guidance`:

| field | what it settles |
| --- | --- |
| `state` | `steering` · `blind` · `unaffordable` · `no-band` · `not-run` |
| `tracking.verdict` | `tracked` · `intermittent` · `wandered` · `blind` · `never-moved` |
| `tracking.seenFrac` | fraction of the moving drive the loop was actually **closed** on |
| `tracking.medianAbsDeg` / `p90` / `worst` | how far off the line it ran |
| `tracking.medianSignedDeg` | "always 8° left" vs "±8° either way" — different defects |
| `caveat` | **what the signal cannot support.** Read before filing anything |
| `witness` | `__camProbe` path/net metres — an independent check, dev builds only |

**`blind` and `unaffordable` both mean the car went in a straight line.** A lane
with either is an unsteered drive and must be read as one; the log says so at
full volume as well.

### The objection that travels with every number

The ribbon is a road **centreline**, not a lane — `guidanceRoute.ts` emits
centreline geometry and only eases into the goal's lane on the final leg. A
drive that tracks it perfectly is driving down the middle of the carriageway, so
**no lane-position finding** («drifted into the oncoming lane», «clipped the
kerb», «failed to keep right») may be drawn from a steered drive. What these
drives *can* support is direction: whether the car followed the road the lesson
routes it down instead of going straight off the carriageway.

### What it does and does not manage

Measured on the dev server at `4611160afb1e`, iphone16-landscape/WebKit:

| lesson | before (unsteered) | after |
| --- | --- | --- |
| `sc-ov-lane-keeping` | НЕЗАВЪРШЕН, forced, 1/3 ★ | **ИЗДЪРЖАН, natural, 3/3 ★**, ribbon seen 100 %, median 5.4° |
| `sc-zebra-approach` | ИЗДЪРЖАН | **still ИЗДЪРЖАН**, 3/3 ★, median 0.7° |
| `sc-junction-left` | НЕИЗДЪРЖАН | **still НЕИЗДЪРЖАН** — the turn is not reliably taken |

A junction is the honest limit. When the route turns sharply the ribbon leaves
the forward view — measured at 549 ribbon pixels against 9,043–88,803 on an
ordinary sample — and a forward-camera controller loses its signal exactly where
it needs it most. `CONFIDENT_BAND_PX` stops the loop committing a manoeuvre on a
fragment, and the record reports the drive `blind` rather than pretending.

### Cost, and the leg where it refuses

A scan is one clipped screenshot plus a `node:zlib` decode. Measured, on both
legs, rather than predicted:

| leg | scan (median) | drive |
| --- | --- | --- |
| mobile / WebKit | **415 ms** | inside the existing 500 ms tick |
| pc / Chromium | **150 ms** | `sc-zebra-approach` ИЗДЪРЖАН, median error 4.08° |

**The `pc` prediction in the first draft of this section was wrong, and it is
left here as the correction rather than quietly edited out.** It said the loop
would refuse on `pc` because "a screenshot costs 12 s" — a number this README
already carried. That figure is for a FULL-PAGE frame; the guidance band is a
32 %-height clip and costs 266 ms. The pc leg steers, and steers slightly better
than the phone. Predicting an instrument's cost from a neighbouring measurement
is the same error this harness keeps finding in itself.

The refusal is real even though no leg has needed it yet: the loop times its own
first three scans and, if the median is past `GUIDE_SCAN_BUDGET_MS`, **stops and
publishes `state: "unaffordable"`** rather than degrading quietly into
straight-line driving. Straight-line-in-disguise is the worst outcome available
here — it looks like a steered drive and is not. It has been watched to fire by
dropping the budget to 10 ms on a live lane (see the report for the log line).

`lib/png.mjs` decodes with `node:zlib` and not `sharp` on purpose — `sharp`
lives in `platform/node_modules`, i.e. inside the application under test, and a
harness that imports from the product's dependency tree is one `npm prune` away
from a sweep that silently stops steering.

---

## Negative controls — the sweep must be able to fail

A column that has only ever printed `0` is indistinguishable from a column that
cannot fire. Two of these were found the same day they were first printed:
`unreach` reported `0/0` on all 24 rows because its reachability walk trusted the
**document's** scrollbar, and every dashboard surface has one — so a control
pinned inside a `position: fixed` layer was always called reachable. It also only
looked at elements intersecting the viewport, which discards the severe cases by
construction.

So each finding class has a fixture that reproduces the defect it is meant to
catch, and `--inject-css` applies it to the live app without editing source:

```bash
# `unreach` — the drawer as it shipped, with no scroller. Expect 3 findings, exit 1.
node tools/mobile/stability-probe.mjs --base-url http://localhost:3520 \
  -r dashboard -d iphone16-landscape \
  --inject-css tools/mobile/regressions/drawer-without-scroll.css

# `edge!` — the driving controls with their env() offsets replaced by bare px.
#           Expect 6 BLOCKING findings, exit 1.
node tools/mobile/stability-probe.mjs --base-url http://localhost:3520 \
  -r simulator-drive -d iphone16-landscape \
  --inject-css tools/mobile/regressions/controls-without-insets.css
```

The second one matters more than it looks. **Every** control on the landscape
driving screen sits physically inside the iPhone's 59px notch band — the turn
signals at x=2, the mirror glances at x=46, the lesson menu at x=8 — and every
one is cleared as `ok:handled`. That verdict cannot be a pixel measurement:
desktop WebKit resolves `env(safe-area-inset-*)` to 0, so a control that handles
the notch correctly renders at exactly the same x as one that ignores it. It is
read from the authored CSS instead, which is only trustworthy for as long as
removing that authoring still turns the column red.

If either fixture exits 0, the instrument has gone blind — not the app healthy.

## Devices

| id | size | dpr | safe area |
| --- | --- | --- | --- |
| `iphone16-portrait` | 393×852 | 3 | t59 b34 |
| `iphone16-landscape` | 852×393 | 3 | l59 r59 b21 |
| `small-portrait` | 360×780 | 3 | — |
| `small-landscape` | 780×360 | 3 | — |

The small phone is not optional in a sweep. The failure mode this harness exists
to end is "it looked right on the one device we checked".

---

## Authentication

Almost every route is behind `src/proxy.ts`, and `/simulator` is behind the
entitlement gate on top of that. A sweep that is not signed in measures the
login page N times and hands back a table that looks exactly like data — that
has already happened here. So:

* `lib/user.mjs` creates a throwaway `mobile-harness@test.local` account **in
  the local dev database only** (`assertLocalDatabase` refuses anything that is
  not localhost — never type a password on staging), with `role=admin` so the
  simulator's entitlement gate opens without fabricating a payment.
* `lib/auth.mjs` signs in through the real form and then **asserts the landed
  path**. A redirect to `/login`, or to a paywall, fails the route loudly
  instead of being measured.
* `--cleanup-user` deletes the account and its dependent rows.

The local dev database is PGlite (`npx prisma dev`) with **10 connection slots
for the whole box**, shared by every parallel lane's dev server, and `.env` asks
for `connection_limit=10` — so two lanes can starve everyone. New connections
are then answered with `read ECONNRESET`, which looks like a dead database and
is not one. Three consequences, all implemented:

* the harness retries connections (20 tries, backoff capped at 3 s) and holds a
  slot for milliseconds;
* the dev server it starts is rewritten to `connection_limit=2` — PGlite runs
  queries serially anyway, so a big pool buys nothing and costs everyone;
* **`KNIJKA_MOBILE_EMAIL` + `KNIJKA_MOBILE_PASSWORD` skip the database
  entirely.** Set them and no connection is opened at all. Use this in CI, and
  on a box where the slots are gone.

If *every* retry resets and the daemon's log shows no traffic, it is genuinely
wedged: restart it with `npx prisma dev` from `platform/`. Note that this
invalidates every other lane's Prisma pool, so it is a last resort.

---

## The server

`lib/server.mjs` starts (or reuses) `next dev` on **:3460** with
`KNIJKA_DIST_DIR=.next-harness` — never :3000, which belongs to other lanes, and
never a build directory another agent's Turbopack cache can poison. `E:` is a
mechanical disk: delete `.next-harness` when you are done (it reached **935 MB**
once).

Point it somewhere else with `--base-url` (or `KNIJKA_MOBILE_BASE_URL`), which
is how CI measures a `next start` build.

### Two things that WILL bite you when you start this server

**1. `next dev` edits `platform/tsconfig.json` behind your back.** Starting it
with a custom `KNIJKA_DIST_DIR` appends that directory to `include`:

```json
".next-harness/types/**/*.ts",
".next-harness/dev/types/**/*.ts"
```

A stale route validator inside a scratch dist dir then injects phantom errors
into an otherwise clean `tsc --noEmit`, which is why
`src/lib/tsconfigHygiene.test.ts` exists and why it goes red the moment you run
this harness. It is not your code. **`git checkout -- platform/tsconfig.json`
before you gate**, and never "fix" the test by allowing the glob.

**2. Turbopack can latch this dist dir at HTTP 500 for every route.** The
signature is a panic on `globals.css`:

```
Failed to write app endpoint /(auth)/login/page
  - [project]/src/app/globals.css [app-client] (css)
  - Execution of PostCssTransformedAsset::process failed
  - timeout while receiving message from process / deadline has elapsed
```

Restarting the process does **not** clear it — the poisoned entry is on disk.
`rm -rf platform/.next-harness` does. Symptom to recognise: `/login` answers 500
in under a second while another lane's server on another port answers 200, and
the sweep dies in `signIn` before it measures anything.

**Warming is not optional.** A cold `next dev` took 60s to render `/theory` on
this box; WebKit gives up on the navigation before that, the fetch inside
`public/sw.js` throws, and the service worker answers with `/offline.html`. The
harness's own first run screenshotted „Телефонът ти е офлайн" and would have
published its geometry as the theory hub. `sweep()` now compiles every route
with a plain authenticated `fetch()` first, and `gotoAuthenticated` refuses to
measure the offline page.

---

## Using it from vitest

```js
import { expectMobileBudget } from "../tools/mobile/lib/vitest.mjs";

await expectMobileBudget();          // asserts the latest report
await expectMobileBudget({ baseUrl: "http://localhost:3460" }); // measures live
```

The thrown error *is* the report table, so a failing build shows the numbers.

`budget.test.mjs` wires this up. It enforces when the report was produced by the
same run (CI), and skips loudly otherwise, so a stale local `.out/latest.json`
from another lane cannot redden an unrelated build. Force it with
`KNIJKA_MOBILE_BUDGET=enforce`.

The harness's own arithmetic and refusals are unit-tested in the same file and
run everywhere, every time.

---

## Windows note

Route and device arguments are **ids, never paths**. Git Bash rewrites any
argument that starts with `/`, so `--route /theory` silently becomes a
navigation to `http://localhost:3460C:/Program Files/Git/theory`.
