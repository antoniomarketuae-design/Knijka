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
| `settle` | "elements shifting position" | ms for the layout to stop moving after each state change |

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
