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

---

## H. Group B is downstream of group C, and that unifies the whole picture

Group B is 14 rows, 11 critical, held on «the reverse manoeuvre does not
arrive». **It arrives.** All 16 w43 legs that demanded reverse armed it, reached
R, and spent real ticks there — 5 to 96 each, with **zero recorded failures**.

What does not happen is completion. `reachedEnd` is **false on every one of the
16**. And on three of them the car finishes with more distance left to run than
its authored path is long:

| leg | authored reverse leg | distance still to run |
|---|---|---|
| `sc-park-judge/pc-right` | 8.27 m | **20.93 m** |
| `sc-park-wall/pc-right` | 8.65 m | **13.99 m** |
| `sc-park-gap-short/mobile-right` | 7.02 m | **8.73 m** |

That is not «stopped short». Reading the controller's own per-tick record for
`sc-park-judge/pc-right`: **off-path median 20.47 m**, heading error **median
166.8°** — the car is twenty metres from the authored path and pointing almost
exactly the opposite way along it, from the first tick to the last. Its sign
audit reads `agrees` («wheel right over 4.03 m moved the bearing −8.4°, the way
§2 of reverse-plan.mjs says it should»), so the wheel is not inverted.

**The car is trying to drive a reverse path that starts twenty metres away from
where it is.** Its objective «Задача 1: спри срещу свободното място» is dashed:
the forward approach never reached the manoeuvre's starting position, R was
engaged anyway, and a parking controller was asked to park from the wrong place.

### Why this matters more than either group separately

Only **18 of 80** `right` legs completed every objective. A parking or reversing
manoeuvre begins at the END of a forward route, so a drive that does not
complete its route cannot begin its manoeuvre — and then fails it for reasons
that have nothing to do with the product. Group B's 11 criticals and group C's
11 criticals are **the same blocker seen from two ends**.

That is why route fidelity (`a783bf6`), the off-road witness (`9b2a55e`) and
recovery (`f704c8d`) are the right spend: they attack the forward drive, which
is upstream of both. It also means **no repair wave can close group B**, and the
next sweep's first question is not «did reverse work» but «did the car get to
where reverse begins».

`sc-pk-driveway/pc-right` is the near miss worth watching: off-path median
4.9 m, and it finished **0.97 m** from the mark against a 0.45 m tolerance.

---

## I. CORRECTION to section E — it is not gap acceptance, it is the scan period

Section E concluded the roundabout trio is blocked by missing gap-acceptance
behaviour: «it either waits at the line forever or enters regardless». **The
first half is wrong and I withdraw it.**

`sc-rb-busy-gap/mobile-right` does not wait at the line. Its own pace line reads
«This drive's odometer read **106.3 m (67 % of that route)** over 2 roll(s) …
every roll ended on its METRES, not on the clock», its objective 1 «Спри на
линията за пропускане преди входа» ticks at **0:54**, and its tracking reads
**straightness 0.999** over 75.4 m of witness path. Objective 2 «Подмини първия
изход, без да излизаш от кръга» is dashed.

So: the car stops at the give-way line correctly, then **drives straight on
through the roundabout and off the far side**, where the product ends the lesson
(«end line → «Резултат»» in the ladder). It never enters the circle at all on
this leg. `pc-right` is the leg that entered, and it is the one that left the
route and hit a building.

### The actual cause, and it was measurable from the start

- `TUNE.DEAD_DEG` is **3.0°** and this drive's `|err|` median is **2.75°** — so
  the majority of sightings command nothing at all.
- The real scan period is **p50 757 ms**. At the 12–24 км/ч this drive ran, that
  is **2.5–5 m between steering decisions**. A roundabout entry needs one every
  metre or so.
- The loop did see the turn — `|err|` p90 18.92°, worst 43.71° — but issued only
  **5 corrections / 315 ms at the wheel** across the whole drive. The large
  demands arrived, and arrived too late to be driven.

`TUNE.LOOKAHEAD_M` is 15 m against roundabout radii around 12 m; pure pursuit
with a lookahead longer than the path radius cuts the corner by construction.

**This is tractable and does not need a product change**, which the gap-
acceptance framing did. It is the same cost problem that shows up everywhere in
this loop: the scan is the expensive operation and everything is paced by it.
The recovery build already skips the scan when the car is off-road; the
roundabout wants the opposite — a cheaper or more frequent scan where the
geometry is tight.

**Nothing here is built.** It is recorded so the next attempt starts from the
measurement rather than from the wrong cause, which is what section E would have
sent it to.

### …and the mechanism inside that, from the tick-cost breakdown

`sc-rb-busy-gap/mobile-right`, its own line:

```
TICK COST: screenshot ×17 med 1068ms · idle ×50 med 508ms · probe ×52 med 9ms
           · guide ×50 med 5ms max 2620ms · pedals ×42 med 0ms
```

Of a ~54 s drive, ~25 s is the deliberate `TICK_MS = 500` pacing and ~18 s is
screenshots. Twelve seconds is driving. The idle is the control law's 2 Hz rate
and is not waste — but combined with scan cost it gives a **real period of
757 ms p50**, which at 24 км/ч is **5 m between steering decisions**, or about
24° of arc on a 12 m roundabout.

Then the sustain law cannot fire in time. `SUSTAIN_DEG` is 15° and
`SUSTAIN_CONFIRM` is 2, so a held turn needs **two consecutive samples** at
≥15° — ten metres into the corner at this period. The drive's five corrections
total **315 ms**, about 63 ms each: all short pulses, never a sustained turn.
The loop saw the corner (|err| worst 43.71°) and was structurally unable to
commit to it before the corner was gone.

**Deliberately not changed before w45.** The next sweep is the one that has to
convert, and re-tuning a control law blind — with no way to test it until that
same sweep — risks making it worse than w43 for every lesson in order to help
three. The candidate, for after: let a sustain confirm on the FIRST large error
when the product's own turn chevron is on screen, since the chevron is advance
warning and waiting for the error to persist is what arrives late.

---

## J. The gate found a live defect the audit had not — and it is the founder's own sentence

Running the four-part gate over w44's tree turned up two vitest failures, both
pre-existing and neither caused by the wave (its world-builder edits are 100 %
comment). One of them is a real product defect on a lesson that has an open row.

`lane-paint-referent.test.ts` asserts an invariant worth quoting, because of why
it exists:

> the set of edges the runtime reports an осева on equals the set the BUILT
> marking mesh actually carries one on … The founder hit it on his first lesson:
> «it say we step on some line that doesnt exist at all».

On `pe-zone-v1` it failed:

```
- expected  [ pz-e-approach, pz-e-cross, pz-e-out ]          ← what the MESH paints
+ received  [ pz-e-approach, pz-e-cross, pz-e-out, pz-e-zone ] ← what the RUNTIME grades
```

**The painter was right and the grader was wrong.** ЧЛ. 62 Т. 1: in a «зона за
живеене» the carriageway is not defined as one, so it carries no division at
all. `markings.ts` has known this since the home-zone pass — its whole lane-
boundary loop runs under `k < lanes && !calmedZoneKeepsWholeWidth(eb.edge)`, and
its comment names `pz-e-zone` by id.

`paintsCentreLine` in `constants.ts` did not have that clause. Its own docblock
says it is *"the painter's own arithmetic … so `runtime/spatial.ts` publishes the
same answer the painter acts on — the single decision doc 86 T1 says was never
shared"*. It had drifted from the painter in exactly the way that paragraph
exists to prevent.

**The consequence for a student:** on the home-zone lesson the three codes that
grade the axis — `CENTER_LINE_TOUCHED`, `POOR_LANE_KEEPING`, `NOT_KEEPING_RIGHT`
— had a referent with no paint under it. A seventeen-year-old could be convicted
of touching a centre line on the one road in the catalogue that is legally
undivided.

**The fix:** `calmedZoneKeepsWholeWidth` moves to `constants.ts` — the file both
the builder and the runtime already import — and gates both `paintsCentreLine`
and `paintsLaneLines`. `markings.ts` re-exports the name so its existing test and
importers bind to one definition rather than two that can disagree. 130/130 on
`lane-paint-referent` + `home-zone-has-no-lane-division`.

**It bears on `sc-pe-zone-living:37bbb618`** (major, open), whose judge cropped
three beats inside the zone and reported *"multiple dashed lane lines"*. That is
a claim about the MESH, which the painter already gates; this repair is the
GRADER half. The row still needs a drive to settle which half its frames
photographed — but the half nobody had looked at is now closed.

The second failure, `seedFounderGuards`, is not a defect: it spawns the real
script and measured 20.6 s alone against 30.2 s inside the full gate at
`--maxWorkers=2`. It failed on patience, not on its assertion, and its budget is
raised to 120 s with the measurement recorded beside it.

### …and the frame for `sc-pe-zone-living:37bbb618`, opened rather than argued

`.audit-frames/w43/frames/sc-pe-zone-living__pc-right/04-t041s.png`, inside the
zone, at HEAD `177c4ba` — i.e. AFTER the painter's home-zone gate landed in
`9aec4c5` (2026-09-13):

- **the carriageway carries no lane division at all** — a bare surface; the only
  line on it is the teal guidance ribbon. The row's «multiple dashed lane lines»
  is not on this frame.
- the flanking buildings are four- and five-storey blocks with balconies, not
  the «office-scale towers» the row describes.
- «ЗАДАЧА 1/5 Влез в жилищната зона с 20», and the engine is demonstrably awake
  on it: «ОПАСНА ГРЕШКА −10 изпитни т. · Превишаване с повече от 10 км/ч ·
  Отчетена скорост 40,6 км/ч при разрешени 20 км/ч».

So the row's principal claim — «the world is not a home zone» — does not survive
its own lesson's newest frame. What it may still hold on is the APPROACH
(«lane arrows, a painted give-way triangle, kerbside parking bays»), which is a
tertiary edge and is *supposed* to carry markings — the width step from 24.25 m
to 16.25 m at the zone boundary is the thing the lesson teaches.

This is a closure candidate for the judging pass, and it now arrives with three
things it has never had together: the frame, the painter's commit, and the
grader fix that was still missing until today.


---

## K. w45 — the first sweep on today's instruments (added post-sweep, 2026-09-14)

Numbers taken at 93 of 125 drives, every exit 0, zero tree moves, zero harness
deaths; the merged totals are in `.audit-frames/w45/`.

### The audio witness answers row D1, and the answer has two halves

| leg | drives | built ZERO WebAudio | built and started nodes |
|---|---|---|---|
| mobile (right + wrong) | 49 | **49** | 0 |
| pc (right + wrong) | 40 | 0 | **40** (~21 sources each) |

A hard platform split, not noise. `simAudio.ts:353 unlock()` reads
`window.AudioContext` **only** and `return`s silently when it is absent — no
`webkitAudioContext` fallback, no telemetry. The harness's mobile leg is
Playwright WebKit, where the unprefixed symbol may be missing, so the 49/49 is
most likely the harness's browser rather than a real iPhone (iOS ≥ 14.5 exposes
it unprefixed). **The product's silent return is still a defect**: any device
without the symbol gets no engine, tyre, wind or indicator sound and nothing on
the glass says so. Judge on the split; do not rule "students hear nothing" from
it, and do not rule "audio works" either — rule on what `unlock()` does when the
constructor is missing.

### Recovery: «back on a carriageway» is not «back on the route»

Recovery fired on 18 drives. The product's off-road banner cleared on 11 of them
— and on **all 18** the car was still **13–296 m** from its own authored line
afterwards (`droveIt: false` on every one). The product's test is "an edge
centreline within reach"; the route is a specific line. A `REJOIN` / `BACK ON A
CARRIAGEWAY` line therefore says nothing about whether the leg can witness a
task, an offence or a credit along its route — **`ROUTE FIDELITY` decides that,
and it still refuses those legs.**

Three of those lanes also carry my state-machine bug (episode counts 88/90/37
with refusals 87/87/36 — re-entry every tick after the ceiling). Nothing was
steered wrongly; the counts are meaningless on those three lanes and the log
repeats one sentence. Fixed after the sweep; treat `recovery.episodes` on w45
as unreliable where it exceeds 3.

### Route fidelity is flat

23 of 53 `right` legs drove ≥ 50 % of their route within 8 m (43 %), against
33 of 79 (42 %) in w43. Recovery did not move it. The steering tune finding in
section I (deadband 3° vs median error 2.75°; 757 ms real period; sustain needs
two consecutive samples) stands as the next lever, deliberately untouched here.

### The two witnesses agree

The product said off-road on 28 drives; the geometry disagreed on **1**. Both
instruments can be trusted where they agree, which is nearly everywhere.

### One lane with no verdict

`sc-mw-emergency-lane__pc-wrong` — the wrong leg burned its full 210 s budget on
a motorway lesson without the session ending; the harness disclosed it as
«forced via „nothing" — itself a finding». Known class, not new.
