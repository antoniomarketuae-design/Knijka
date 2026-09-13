# Per-row evidence gathered 2026-09-14, for the next judging pass

Not verdicts. Every line here is evidence a judge still has to rule on and an
adversarial pass still has to try to overturn — **a measurement is not a closure
any more than a repair is.** The point of the file is that these rows can now be
settled from artefacts already on disk plus a named commit, instead of coming
back UNJUDGED for a ninth time.

Tools: `tools/audit/leg-evidence.mjs`, `tools/audit/stale-claims.mjs`,
`tools/audit/severity-from-debrief.mjs`, `tools/audit/route-fidelity-open.mjs`.

---

## A. Rows whose filed arithmetic w43 contradicts

`stale-claims.mjs` checks the 6 open rows that carry a machine-checkable number.
Five are contradicted. **A hit is not a refutation** — the substance usually
survives the arithmetic — but a repair lane must not be spent on a sentence that
is merely out of date.

| row | filed | w43 |
|---|---|---|
| `sc-follow-tailgater:63c0c28c` **CRIT** | «0 наказателни точки, 0 опасни, 0 основни, 0 второстепенни» | both wrong legs book **2 второстепенни** |
| `sc-ov-solid-line:3436a5e7` **CRIT** | «0 наказателни точки on both platforms» | **6 т.** and **3 т.** |
| `sc-ac-truck-spray:990e5f64` **CRIT** | «Общо 0» | **1** |
| `sc-ac-truck-spray:8ed4d8b3` | the same | the same |
| `sc-vp-readiness:54c815da` | «0 dangerous, 0 basic and 0 secondary» | Основни **3 · 1 · 2** on three of four legs |

`sc-ov-solid-line` is the instructive one: it now scores 6 т. and is *still*
asking why `CROSSED_SOLID_LINE`, the one fault code the lesson is built around,
never fires. Its wrong leg sat **0 m from the CORRECT line** — which is exactly
why: the wrong leg cannot steer, so it never crosses anything. That is the
wrong-leg instrument gap, not a product defect, and the row should be
re-addressed rather than repaired.

## B. `sc-vp-readiness:b3c922d5` — eight UNJUDGED verdicts, answerable now

Claim: «every error class reads 0 in all four lanes», i.e. `summary.ts` is dead.

Across **123 of w43's 125 legs**: Опасни non-zero on **86**, Основни on **39**,
Второстепенни on **10**. All three classes render, count and price.

On this lesson's own four lanes Основни reads `0 0 · 3 9 · 1 3 · 2 6` — three of
four, with differing counts, so the class is counting real faults.

The two remaining zeros have named mechanisms rather than being defects:

- **Второстепенни** — the only второстепенна this lesson could produce is
  `HANDBRAKE_LEFT_ON`'s standstill arm, and `handbrakeMoveOffEnabled` ships
  `false` and is armed **only** on `sc-vp-handbrake`
  (`templates-cockpit2.ts:202`), for the reason that template states.
- **Опасни** — no dangerous fault is authored in a cockpit-readiness drill and
  none was committed.

## C. `sc-vu-pass-clearance:9116af05` — the whole of group D, misclassified

Filed as «no tool exists to measure it — nothing can hear sound». Wrong twice
over:

1. `scene/simAudio.ts` is a **full procedural WebAudio stack** — engine, tyre,
   wind, brake, ambient, NPC hum, rain, wipers, siren, indicator, collision
   thump, seatbelt click. «No audio evidence of any kind» is a statement about
   the harness filed as one about the product.
2. The instrument was never impossible. Every sound a browser makes is built out
   of WebAudio nodes first, and nodes are countable. The harness now wraps
   `AudioContext` in an `addInitScript` and reports contexts, source nodes,
   `start()` calls and kinds into `_audit-debrief.json`.

Ceiling, stated: it can prove audio **absent** and prove it **constructed and
started**. It cannot prove audio **audible** — a started node at zero gain is
silent and this counts nodes, not amplitude.

## D. `app-login:e2577ced` — group F, three named repairing commits

Filed «measured in WebKit at HEAD b224c7e». `b224c7e` is itself titled *"the
login form does not fit a landscape phone"*, touches **only**
`tools/mobile/lib/auth.mjs`, and says in its own message that the product half
«is NOT absorbed by the harness change … filed as its own row». So the row was
correct when filed and was not fixed by that commit.

Since then the login page and form have gained `short:` treatment three times —
`10930c9` (wave 27), `daad829` (wave 29), `3d22fe2`. `short:` is
`@media (max-height: 520px)`, defined at `globals.css:89`, which is exactly this
row's condition.

**Still needs**: a render at 852×393 in WebKit confirming `#password` and the
submit button sit above the fold. Not done here, to avoid competing with a
running repair wave for the disk.

## E. The roundabout trio — a named instrument gap, not a product defect

`sc-rb-busy-gap:5ee56710`, `sc-rb-ped-exit:5f1217f9`,
`sc-rb-lane-choice:ffdffd55` (all critical) were held on w42's «the drive never
entered the roundabout». **That is obsolete**: at w43 `sc-rb-busy-gap/pc-right`
ticks «Спри на линията за пропускане преди входа 1:40» and «Подмини първия
изход 2:28».

What the measurement now says instead: these cars cover **28–48 %** of their
route and stop. `sc-rb-busy-gap/mobile-right` is the clean case — TRACKED 21/23,
worst 4.54 m off its authored line, 75.4 m of path at straightness 0.999, and
**twelve seconds of moving time**. It drove the straight approach, stopped at
the give-way line, and the lesson ended around it.

The lesson is «Пролука в натоварено кръгово» — a gap in a **busy** roundabout.
This harness has no gap-acceptance behaviour: it either waits at the line
forever (mobile-right) or enters regardless and is charged «Влизане без
пропускане» (pc-right). Same family as the missing seatbelt and the unsteered
wrong leg. **No repair wave can reach these three.**

## F. `sc-merge-motorway-exit:2b903830` **CRIT** — the evidence is void

Claim: «the right drive is never credited — the task counter never leaves 0».
Its best leg's **median** distance from the authored route is **101 m** (worst
176 m). The car was never on the road to be credited. That is a different
finding from the one the row makes about the product, and the row cannot be
judged from this sweep either way.

## G. `sc-ed-d2-city-run:a0bdad4b` — confirmed dead

Five waves deadlocked because every pass accepted the row's own vocabulary —
"the blue guidance line" — and hunted a ribbon that is **teal**. The product's
own legend reads «синя — пътят на колата-сянка / зелена — маршрутът до целта»:
blue is the shadow car's path, not the route. `isRibbonPixel`'s `g >= b` clause
excludes blue deliberately and the reason is written there.

Its two residual symptoms already have owners and must not be smuggled back in:
the "three of four tasks never fire" half is sibling `sc-ed-d2-city-run:04f6f4d8`
(still open), and the "car wandered off the carriageway" half is the harness
steering gap.

---

## The one number that frames all of it

Only **18 of 80** `right` legs in w43 completed every objective; **22**
completed none. Of those 22, **15 left the route**. That is what the recovery
build (`f704c8d`) targets, and it is why the next sweep is the one that matters.
