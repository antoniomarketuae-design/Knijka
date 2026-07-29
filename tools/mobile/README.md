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
  content is the road.
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

Prefix a selector with `first:` to check only the first match — `first:#main-content article`
asks "is the first topic card reachable without scrolling", which is the useful
question on a long list; without the prefix the same selector asks whether *all
sixteen* fit, which is true only of an empty page. Everything without the prefix
is all-or-nothing on purpose: on the practice runner every answer must be on
screen.

A `mustFit` selector that matches **nothing** fails the route unconditionally,
even where `foldMustPass` is off. A check that silently measures nothing is the
exact failure mode this harness exists to end — and it caught itself doing it:
`label:has(input[type="radio"])` matched no element on multi-answer questions
(they render checkboxes) and reported that as a non-answer.

**Touch targets** — every visible, enabled interactive element in the viewport
whose hit area is under 44×44 CSS px. Hit area honours the common
absolutely-positioned `::before`/`::after` enlargement trick.

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
mechanical disk: delete `.next-harness` when you are done.

Point it somewhere else with `--base-url` (or `KNIJKA_MOBILE_BASE_URL`), which
is how CI measures a `next start` build.

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
