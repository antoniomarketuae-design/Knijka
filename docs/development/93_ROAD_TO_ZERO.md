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
