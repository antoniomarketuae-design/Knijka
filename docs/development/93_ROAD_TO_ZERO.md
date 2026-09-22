# The road to zero — 101 open rows

Written 2026-09-13. This is the working plan, kept in the repo so it survives a
compaction. It is updated as rows close, not rewritten.

## The rule that governs everything here

A row closes when four things happen in order: the product is repaired, a robot
re-drives the lesson and photographs the moment, a judge reads the photograph and
rules, and an adversarial pass tries and fails to overturn the ruling. **A repair
is not a closure.** Roughly two thirds of proposed closures are refused, and that
refusal rate is the only reason the ledger can be trusted — it has caught a defect
reported as "already fixed" while the broken code was still live.

## Where the 101 are, and what each group needs

| | rows | crit | blocker | who can move it |
|---|---|---|---|---|
| **A** | 46 | 8 | genuinely broken, cause known | repair waves — ordinary work |
| **B** | 14 | 11 | the reverse manoeuvre does not arrive | harness |
| **C** | 21 | 11 | the drive wanders / cannot commit the offence | harness |
| **D** | 1 | 0 | no instrument exists (audio) | build an instrument |
| **E** | 1 | 0 | pedagogy ruling | the founder |
| **F** | 1 | 0 | `app-login` has no `/simulator` route | separate instrument |
| **G** | 17 | 9 | unclassified | read individually |

## The order of attack

1. **Re-drive against the repaired harness.** Four harness fixes landed on
   2026-09-13 and none has been exercised by a sweep: the desktop confidence
   ruler, the handbrake release (touch and desktop), guidance-route recovery, and
   the reverse sign-conviction bar. The last one alone should un-void eight
   reverse legs that were thrown away on a noisy sample. This tests all four at
   once and is the cheapest thing that can move B and C.
2. **Repair group A in waves of six disjoint lanes**, each row carrying the
   judge's own account of what reproduced. Expect 2–6 survivors per wave; the rest
   come back STILL and go into the next wave.
3. **Group C needs a road-referenced measurement.** The first attempt measured
   displacement from the car's own prior chord while every detector in the product
   measures from the road (`laneOffsetM` is "offset FROM LANE CENTER"). Any next
   attempt must use the product's own frame, and must bound the SHAPE — the
   reverted build could spin the car three times and report success.
4. **Group G individually.** Seventeen rows, nine critical, no shared cause.
5. **D, E, F last.** One needs an audio instrument, one needs a founder ruling,
   one needs a way to drive a login form.

## What is already known and must not be re-derived

- The `-wrong` legs never steer, and that is **doctrine written in four places** —
  "a wrong leg that follows the route would invalidate every verdict ever taken
  from a wrong leg". The governing rule: *the instrument supplies the behaviour;
  the product decides whether that place was forbidden.* An instrument that knows
  in advance which conviction it wants is manufacturing the fault.
- The working template for giving a leg a capability is the over-cap one: present
  the antecedent **once**, on the record, bounded by a distance ceiling **and** a
  clock ceiling, then the leg is exactly the leg it always was — and refuse loudly
  on failure, because *"we tried" is not evidence*.
- `findingId = sha1(what + frame)`, so `suspectFile` is not in the hash and an
  address can be corrected without orphaning a verdict.
- The reverse "shortfall" figures measure the straight line to the last waypoint,
  not arc remaining, and 6 of 8 were crashes. The 0.45 m is the harness's own
  arrival ball; the product grades 0.75 m / 15° against the bay.

## Standing discipline

- Never write the tree while a sweep or a verification pass is measuring it — a
  mid-run edit makes every in-flight drive certify nothing.
- Parse fields; never grep prose for a count. Three wrong numbers came from that
  in one day.
- Check any row against the open list **before** spending on it. A 53-agent
  workflow was once spent on 37 rows that were not open.
- Push after every commit. Thirteen commits once sat on one HDD.

## 2026-09-14 — the 101 re-partitioned by whether the car was on the road

The table above groups the rows by what a reader THOUGHT was blocking them.
This one groups them by a measurement, and it changes the plan.

`routeDeviation` (commit a783bf6) folds every drive's recorded chassis pose
against `content/traces/<lesson>/shadow-correct.trace.json` — the line the
lesson itself authored under «must replay with ZERO violations». It needed no
new instrument: `guidance.samples[].wx/wz` and the authored trace have both
been on disk for weeks, in the same frame, and were discarded at the reporting
layer. The planned `__roadProbe` product change is therefore **cancelled**.

> **2026-09-22 — `__roadProbe` RE-OPENED, under founder RULING-2**
> (`docs/simulation/93_INSTRUMENT_GAPS.md`; W59 steering spec §2.3, increment 1).
> The cancellation above stands for what it was about — *measurement after the
> fact* — and does not reach the new case, on two grounds: **(a)** a
> *controller* needs the road signal **live**, at control rate, and an artefact
> folded after the drive cannot steer anything; **(b)** the artefact this
> cancellation rested on is the **authored trace**, which is a referent for
> "did the car follow the demonstration", not for "where was the car on the
> road" — the product's own `Locator` fix is the road. It is superseded on
> those grounds, not because anyone changed their mind. What landed: a
> dev-only (`NODE_ENV !== "production"`, gated like `__camProbe`) ring buffer
> of copied tick fields on `/simulator` (`modules/sim/devrig/roadProbe.ts`,
> three objects `road` / `route` / `step`), and `SimTick.sM` / `distM` as
> additive, ungraded fields beside `laneOffsetM`, proved inert by execution in
> `runtime/__tests__/road-position-not-graded.test.ts`. No controller.

Over w43's 79 `right` legs: **39 (49 %) put the car more than 8 m from its own
lesson's correct line**, only 11 (14 %) never left 3 m, and the worst reached
185.7 m. Every one of those legs reported `TRACKING` and none reported this.

Crossing that against the 101 (`node .audit-frames/retro-route.mjs`):

| | rows | crit | what it means |
|---|---|---|---|
| **has at least one ON-ROUTE leg** | **65** | **32** | judgeable NOW, from frames already on disk — no re-drive |
| every leg left the route | 34 | 7 | no route-behaviour verdict can rest on these; they need a better DRIVE, not a repair |
| driven, no moving pose samples | 1 | 0 | the drive died before it moved |
| not driven in this sweep | 1 | 0 | |

### What this corrects

- **The roundabout rows are not what w42 said.** `sc-rb-busy-gap:5ee56710`,
  `sc-rb-ped-exit:5f1217f9` and `sc-rb-lane-choice:ffdffd55` were all held on
  «the drive never entered the roundabout». In w43 the car DID enter — the
  pc-right leg ticks «Спри на линията за пропускане преди входа 1:40» and
  «Подмини първия изход, без да излизаш от кръга 2:28» — and 3 of 4 legs stayed
  on route. The guidance-route recovery fix (33d562e) moved this and nobody
  re-judged. **A cause is as stale as its report**, again.
- **`sc-merge-motorway-exit:2b903830`** (critical) says «the right drive is
  never credited». Its best leg sits at a MEDIAN of 101 m off the route. The car
  was never on the road to be credited; the row's evidence is void, not the
  product's behaviour.
- **Group C was never one class.** Of its 21 rows, the roundabout and merge rows
  are drive-quality; `sc-ov-solid-line:3436a5e7` is the wrong-leg-cannot-steer
  gap (its wrong leg sat 0 m from the CORRECT line, which is exactly why
  `CROSSED_SOLID_LINE` never fired); and several are ordinary product rows that
  were mis-filed here.

### The order of attack, revised

1. **Judge the 65 on-route rows against evidence already on disk.** No sweep, no
   re-drive. This is the cheapest closure path available and it has never been
   run, because until now nobody could tell which legs were worth reading.
2. Repair waves on the confirmed-STILL rows (w44 is 39 rows over 30 files).
3. The 34 off-route rows need the drive fixed before anything else is spent on
   them. The measured cause is not blindness: `guidance.mjs` §1 records that
   ribbon zeros are 33.9 % on legs whose car left the carriageway and 6.1 % on
   those that did not — **the blindness is 5.5× downstream of the departure**,
   not upstream.
4. The product publishes `«Колата е извън пътя — върни се на платното»` in the
   objective banner (`LessonPlayShell.tsx objectiveTitleUnderHold`) and the
   harness has never read it. Reading it gives the drive an off-carriageway
   signal in the product's own words, and a recovery to perform.

### Still true and still unspent

The seatbelt gate landed (a2fa487) and `sc-vp-readiness:54c815da` — whose judge
wrote «this harness has no seatbelt control to leave undone» — now has a wrong
leg that drives unbelted. The three error-class counts are now fields, not
pixels, in every debrief sidecar.

### CORRECTION, same day: 65 was wrong, the figure is 54

The partition above was computed on LATERAL distance alone, and lateral
distance is the reassuring half. Six w43 legs sit within 8 m of their authored
line having covered **4-47 % of it** — four of them roundabouts
(sc-rb-busy-gap, sc-rb-lane-choice, sc-rb-ped-exit, sc-roundabout-entry) that
enter the circle and stop about halfway, which is exactly why «Стигни по кръга
до втория изход» never ticks.

This programme has been caught by this shape before: «1 cm of lateral spread
over 289 m» was once offered as proof a car held its lane, and proved only that
it drove STRAIGHT. `routeDeviation` now reports `coveredFrac` and `reachedFrac`
beside the distances, and `droveIt` requires both halves.

| | rows | crit |
|---|---|---|
| has a leg that stayed on its route AND drove it | **54** | **26** |
| no leg did both | 45 | 13 |
| driven, no moving pose samples | 1 | 0 |
| not driven in this sweep | 1 | 0 |

The roundabout finding survives the correction and is sharpened by it: those
cars now demonstrably ENTER the roundabout (contradicting w42) and demonstrably
stop between 28 % and 48 % of the way round. That is a measurement a next drive
can be aimed at.
