# 94 — ADR-014 design note: the world and the grade on one fixed 1/60 s step

**What this is.** The full design note written by the builder of lane `rbcad` (round 8) for the row `sc-roundabout-entry:7b747c15`. The decision
itself is **ADR-014** in [the ADR file](../architecture/07_ARCHITECTURE_DECISION_RECORDS.md); read that first. This note keeps the detail the ADR
condenses: every round's finding, the mechanism of each link in the graded chain, and the measurements.

**How it was corrected before archiving (2026-10-09).** The round-8 verifier signed the lane off with four conditions (C-RESETPREVK, C-PINBOUND,
C-KNIFEEDGE, C-MOMENTS). Nine passages that claimed more than was reproduced were corrected by the integrator's ADR draft and checked by a second,
adversarial reader against the code and the verifier's report. The corrections narrow three claims: one sheet per tape holds for the committed demos
and census tapes, not for any look near a rule's edge; observation moments differ by display as a class, not on a closed list; and the look-timing
bound is measured from the press. They also name what is still owed. Everything else is the builder's text as written.

---
## The builder's note, as proposed: The world and the grade run on one fixed step, counted off the physics engine

**Status.** Proposed by lane `rbcad` (row sc-roundabout-entry:7b747c15, rounds 1-8; rounds 1-7 each adversarially
verified and refuted; round 8 signed off with conditions by its verifier on 2026-10-09 - C-RESETPREVK, C-PINBOUND, C-KNIFEEDGE and C-MOMENTS, each recorded in ADR-014 and in doc 88's landing section; the C-RESETPREVK respawn pin and the C-PINBOUND census bound were added in the landing commit). Not a founder ruling: it changes no rule, no threshold and no
shown sentence. It changes WHEN the existing rules are evaluated, and from which pose. It has not been driven in a real
browser.

**Context.** One careful drive got two sheets (PC one collision; phone FAILED_TO_YIELD plus a collision). Measured at
2127d8f through the production chain: a line stop held 45 s passes at 0 points on 60 Hz, 30 Hz and a steady 0.5 s and is
convicted of a COLLISION (10 pts) on a phone's frame lengths. The cause was that everything deciding a lesson ran once
per render frame: the staged cars were released, re-timed and locked by a director that looked once per frame and were
integrated in 0.1 s sub-steps; the rule engine, the runtime trackers, the sustain timers and the contact sentinel paired
whatever the frame end was with whatever the world was then. Seven builds each fixed one layer and were refuted on the
next:
- Round 1 sub-stepped staged actors inside long frames; the path-end overshoot, the ambient fleet and re-entry stayed on
  the frame.
- Round 2 aligned the sub-steps to session time; frames shorter than the step (120/144 Hz, +-1 ms jitter) still made a
  frame-dependent grid, up to 7.5 steps = 2.47 m.
- Round 3 built a true fixed-step world but left the grade on the frame: the rule engine read the student at the frame
  end T against a world at floor(T/H)*H, and that sawtooth lost or invented FOLLOWING_TOO_CLOSE, YIELDED_TO_PRIORITY and
  OVERTAKING_AT_CROSSING on 28-33 of 1,531 cells at 120 Hz, 144 Hz, 59.94 Hz and 60 Hz +- 0.2 us.
- Round 4 put the grade on the grid but started the grid one point in whatever the first live frame's length, and mapped
  the grid onto rapier's steps through an offset derived from the session time. After a 0.5 s first frame the car and
  the session clock were 0.5 s in and the world and the signal clock 0.0167 s in for the rest of the drive (21 of 1,531
  sheets split against the same 60 Hz display without the hitch; base: 2), and the offset's correction graded one car
  state twice and read the car one step stale from then on. The replay harness skipped the first frame's delta, so no
  committed pin could see either.
- Round 5 gave the grid one origin and one clock (rapier's own steps) and was refuted on a wiring seam: the
  person-in-path distance (`tick.vruAheadM`, graded input - it acquits a stop made for a human being) was measured by a
  hook the scene handed to the grid, from whatever pose the hook chose. A scene measuring it from its frame-end sample
  passed every test; the graded tick stream then differed between cadences on 164 of 344 cells with a staged person.
  The replay harness never published that channel, so no census could see it.
- Round 6 moved that measurement into the grid and was refuted on the seam before it: the car's state at every grid
  point comes from one place, the record VehicleRig makes after each physics step, and its only pin was the text of one
  line of that closure. A rig that filled the recorded position from the frame's sample, or took the recorded speed
  from it through a local of the pinned name, passed every test with the line untouched; nothing executed the callback.
  On the real libraries headless 3,699 of 3,899 graded points then repeat the previous car state on 0.25/0.4 s frames.
  The same round's audit also missed one channel the student is shown: the near-miss stat, stepped once per render
  frame by NpcColliders from the frame's drawn chassis.
- Round 7 made that record a function a test executes and put the near-miss stat on the grid, and was refuted in code
  that dated from round 4: the grid kept ONE held mirror look, and the next frame's look overwrote it. Whenever the
  first of two consecutive frames took no physics step - every other frame at 120 Hz - the first look was never graded.
  Base graded every frame's look. On the real fiber and rapier libraries headless the first look of a two-key press was
  heard 14 of 14 times at 60 Hz, 25 of 48 at 120 Hz and 19 of 48 at 144 Hz; on the verifier's tapes 26 of 481 cells got
  two sheets between 60 Hz and 120/144 Hz and 15 flipped pass/fail (the correct demo of sc-jx-giveway-b1 billed
  JUNCTION_SCAN_INCOMPLETE on a 120 Hz display). No census could see it, because the replay harness wrote a tape's
  looks straight into each grid point and never ran that path; and it dropped the first of two looks pressed at one
  instant (128 such pairs on 89 committed tapes) on every cadence, where the product at 60 Hz hears both. The same
  audit missed a shown score: the rubric's observation moments, scored after the drive from an attempt trace the scene
  fed once per render frame.
Any link of the graded chain left on the render clock, any second clock beside the physics engine's, any graded or
shown number measured outside the grid from a pose the grid did not choose, any read that sits in a closure beside
the frame's sample and is pinned only by its spelling, and any ONE-PLACE buffer between a frame and the grid (a frame
is not a grid point: several frames can pass between two points, and several points inside one frame), is a platform
split or an unguarded way back to one.

**Decision.**
- **One grid, one origin.** A session is cut into grid points k*FIXED_DT (1/60 s, the vehicle physics step), k an
  integer and never a running float sum. Grid point 0 is the origin: session time 0, before any physics step; it is
  never graded. Grid point k >= 1 is the state after the k-th step. THE RULE: every frame, the first included, brings
  exactly the grid points whose physics steps the engine took in it.
- **One clock: the physics engine's.** In the live lesson the grid is counted off rapier's own steps
  (`GradeGrid.stepPhysics`): the car is recorded after every step (`PlayerStepTrackRecorder`, numbered 1, 2, 3 ... for
  the life of the scene, never re-pinned, never reset) and a frame brings one grid point per step recorded since the
  last frame. Nothing is derived from the session time. rapier's stepper is `accumulator += clamp(delta, 0, 0.5)` from
  0, one step per whole 1/60 s (read out of the installed bundle and pinned), so a 0.5 s first frame is 30 steps and 30
  grid points.
- **The after-step record is a function of the rapier body and the vehicle sim, and of nothing else.**
  `recordPhysicsStep(recorder, body, sim)` (traffic/playerTrack.ts) reads the body's translation and rotation and the
  sim's speed and writes one step in district space (x = world x, y = -world z, heading 0 = north clockwise - the frame
  sample's own mapping). It lives in a module that imports types only, so there is no frame sample in its scope.
  VehicleRig's `useAfterPhysicsStep` callback is that one call on three refs -
  `() => recordPhysicsStep(stepTrackRef?.current, bodyRef.current, simRef.current)` - an expression body with no locals.
  It is the only writer of the step record in the product. What the function and the callback DO is pinned by
  execution, not spelling: the function is
  run against a body and a sim and compared with what `updateVehicleSample` makes of a drawn group placed on that body;
  and the rig's callback is cut out of VehicleRig.tsx as a syntax tree and run under a copy of rapier's stepper,
  registered under whichever hook the source registers it under, against a body and a sim that differ from the frame's
  sample on more than nine steps in ten (five cadences). What the three names in that call are bound to cannot be
  executed without React and is pinned structurally: the import of the function (no alias, no local of that name, the
  barrel's export identical to the module's), the one `<RigidBody ref={bodyRef}>`, and the two writes of `simRef`.
- **The session clock shares that origin.** It is the sum of the frames' clamped deltas (the numbers rapier's
  accumulator is fed, on the same frames: one `paused` prop stops both), and it stands at 0 until the first counted
  step. Until then `PhysicsSessionClock` runs a copy of the engine's accumulator on those deltas, so on the frame the
  first counted step arrives it knows how many steps the engine took that nothing counted (rapier registers a step
  listener in a passive effect). If that number is not zero the clock is set to (counted steps)/60 s plus the
  accumulator; if it is zero - the ordinary case - the clock is the bare sum. Either way the frame end lies the
  accumulator's remainder, less than one step, past the newest grid point. Nothing in the per-point graded chain reads
  this clock: it positions what is drawn and it stamps what is booked per frame (the time a performed pre-drive step is
  booked at, and two kinds of narration in the attempt trace that no score reads: its `driveline` events and the
  «втори замах» annotation).
- **The whole graded chain runs once per grid point** (`scene/gradeGrid.ts`), in the order it always ran per frame:
  signals, traffic (staged and ambient), the near-miss stat, physics contacts, lead gap, the person-in-path distance,
  `runtime.sample` (the authoritative tick), the scenario director (runners, staged triggers, contact sentinel), the
  lesson engine (rule engine, sustain timers, tasks, verdict). Every interval any link integrates is
  (k - kPrev)*FIXED_DT, never the frame's length.
- **The car is read at the grid point, and everything measured from the car is measured by the grid.** Position,
  heading and speed at grid point k are the recorded state after step k, written by `GradeGrid` itself, and every
  reader inside the chain is handed that state: the traffic agents, the lead-gap query, the person-in-path distance,
  the near-miss stat, `runtime.sample` and the scenario director. The lead gap, the person-in-path distance and the
  near-miss stat are measured by `GradeGrid` from that state and the world's state at k, for both of its callers (the
  live lesson and the replay harness). The scene's call hands the grid the step record, the frame-end clock (used only
  for what is drawn), the frame's mirror glance, the world objects, the weather, and four hooks: one copies nine cabin
  channels (eight discrete ones and the throttle pedal) and returns the brake pedal; one hands over the looks the cabin
  still holds (it is the cabin's own `consumeGlanceSample`, called through); one receives each graded point, hands its
  tick to the lesson and then feeds that point into the student's attempt trace; the fourth is not a function of the
  scene at all - it is the shell's near-miss handler, handed on by name. Nothing in that call reads the frame's pose,
  heading or speed. That is pinned on the call's syntax tree (every read of the frame's sample is one of ten named
  cabin channels; the names the call closes over are listed outright, and what it reads off the three of them that
  know where the car is or what the driver is doing is listed too - the cabin's next look, the wheel's angle, the two
  pedals; the tick is handed on unwritten; the near-miss hook is a bare identifier) and by cutting the call - together
  with the scene's own statement that makes its step source - out of LessonScene and executing both against a real grid
  and world with a frame sample that is the car's pose on no grid point.
- **Every look is heard: a queue, one look per grid point.** (Round 8.) A mirror or shoulder look is latched by the
  cabin when the key or button goes down (its own queue, four deep; `GlanceSampleQueue` in scene/cabin.ts). Each frame
  the sample builder takes one look out of it (`VehicleSample.mirrorGlance`, the call's third argument) and the grid
  then takes every look the cabin still holds through the `moreLooks` hook. Inside the grid the looks wait in a FIFO
  and are heard ONE PER GRID POINT, the oldest first; the grid writes the point's look itself, after the scene's hook,
  so the queue is the only way a look reaches a tick. The tick can carry one look (`VehicleSample.mirrorGlance` is one
  value; the runtime makes one `mirrorGlance` event of it), which is why two looks cannot share a point - and at 60 Hz
  two looks on consecutive frames have always been heard at consecutive ticks. The rule, in one sentence: A LOOK IS
  HEARD AT THE FIRST GRID POINT GRADED AT OR AFTER THE FRAME THAT SAMPLED IT, PLUS ONE POINT FOR EVERY LOOK STILL AHEAD
  OF IT. That point is the first step of the world after the picture the driver was looking at when he pressed, and it
  is the step from which every other control sampled by that frame acts.
  *How long a look can wait.* In grid points, the same on every display: a burst of four keys inside one frame (the
  cabin's queue holds four) is heard over four consecutive points, the last 3 steps = 50 ms after the first. The grid's
  queue drains sixty looks a second; to back it up a driver would have to press more than that. It is bounded all the
  same (8 looks: a look waits at most 7 steps = 117 ms behind the point its frame reached), and a look that finds it
  full is dropped and counted (`droppedLooks`), as the cabin's own queue drops a fifth. In the census no look is
  dropped (4,772 presses on 2,304 cells, on every cadence).
  *What is not heard, stated.* (1) A look whose turn has not come when the session ends - a second look pressed inside
  the last step before the tick that ends it - is not graded; at 60 Hz it never was (its tick came after the end).
  `pendingLooks` counts it, and the replay reports it as unheard. (2) A look sampled on a frame the lesson is paused
  on (a teach card, the menu) is not graded, as on base: the sample builder takes it and the graded block does not run.
  (3) A fifth look latched before any frame has run finds the cabin's queue full, as on base.
  *Why every look, and not one per frame.* The cabin drained at one look per frame because, on base, a frame was a
  tick. With the tick on the grid that would count a second look's wait in frames: 17 ms on a PC, half a second inside
  a phone's 0.5 s frame, 1.5 s for the last of four - a look made in time and heard after the manoeuvre it was made
  for. Where no frame is longer than a step - a steady display of 60 Hz or faster, with no jitter or hitch that makes a frame longer than a step - the two rules give the same
  points (such a frame brings at most one grid point; shown in a model of the live entry on seven such cadences); they
  differ only where a frame is longer than a step, and there the look is never heard later than it would be at 60 Hz.
- **The student's attempt trace is fed on the grid.** (Round 8.) A scenario lesson records the student's own drive, and
  the rubric's observation moments - «наблюдение n/m», a shown score - are computed from that trace when the session
  is finalized: from the gear of its samples (when reversing began and ended) and the time and side of its looks. The
  scene fed it once per render frame, from the frame's drawn chassis, clock and glance. It is fed now by one function
  (`feedAttemptPoint`, scene/attemptFeed.ts) that the scene's `onPoint` calls once per graded grid point, after the
  point's tick has been delivered (so the tick that ends a session closes the trace before its own point is pushed, as
  before): one sample stamped k*FIXED_DT with the car after step k and the gear and indicator the grader read at that
  point; a look event at the point that heard the look; indicator edges between points. The recorder's own 20 Hz
  decimation then keeps the same grid points on every display. The steering angle and the two pedal flags in a sample
  are the frame's (drawn in the replay of the attempt, read by no score). The replay harness runs the same function
  into the same recorder and maps and scores the trace as the shell does.
- **A respawn drops what was pending; a new attempt is a new grid.** (Round 8.) Key R and the touch sheet's «Рестарт»
  call the scene's `resetCar`: it puts the car back, re-stages the cast, and now also forgets the looks the cabin has
  latched and resets the grid - the looks still waiting for a grid point, and every near-miss window still open (a car
  lifted out of a squeeze has not passed anyone). The session clock, the grid index and the session's running
  near-miss aggregate run on through a respawn: the lesson session is not over. The grid belongs to LessonScene, one
  per mounted scene; the shell's «Повтори» remounts the scene (its key is the attempt's epoch), so a new attempt
  starts with a new grid, a new step record and a new cabin.
- **The near-miss stat is the grid's.** A near miss («мина на косъм») scores nothing, but its count and closest pass
  are shown to the student (the result screen's row, the debrief's sentence). It was stepped once per render frame by
  NpcColliders, from the frame's drawn chassis, with a private clock capped at 0.1 s per frame. `GradeGrid` steps it
  now (`scene/nearMissMeter.ts`), once per grid point, after the world moved to that point, from the student at the
  point, and hands each resolved encounter to the shell after that point's tick. The detector (`stepNearMiss`), its
  thresholds and its body envelopes are unchanged; an encounter's time stamp is now the grid point's session time.
  NpcColliders keeps the rapier collider pool and nothing else.
- **What still reaches the session on the frame's timing, not from grid point k.** Five things write the shell's
  session during a drive: the tick, a staged outcome and a near miss (all three delivered per grid point), a pre-drive
  step, and a manual finish or abort. On the frame's timing: (a) the cabin's discrete channels (indicator, headlights, belt,
  handbrake, gear, stall, fog lamps, engine) and the pedals: the frame's values, seen by every grid point in the frame
  (and so the gear and the indicator in the attempt trace's samples are the frame's too); and the performed pre-drive
  steps, which are cabin transitions read per frame and booked at the frame-end clock.
  (b) WHEN a mirror or shoulder look is heard. Every look is heard, once, in order, one per grid point - that part is
  the grid's. Which point is the frame's: the first grid point graded at or after the frame that sampled the look (plus
  one per look ahead of it). On an exact 60 Hz cadence that is the first grid point at or after the press. On a faster
  display, or a 60 Hz one whose frame times jitter, it is that point or the one before it (a frame that brought a grid
  point and then sampled a press made after it: measured on 84 of 483 two-look cells at 144 Hz and 134 at 90 Hz with
  the presses 5 ms off the grid, never at 120 Hz; and on 69 of 2,434 cells at 60 Hz +- 1 ms with the tapes' own
  presses). Inside a frame longer than a step it is the frame's first point: up to 29 points before the press on a
  0.5 s frame, measured from the press (against the look's own 60 Hz point it can be a whole frame, 30 points, early: the round-8 verifier measured 30 on a phone's cadence with presses 7 ms off the grid), never later than at 60 Hz. The rubric's observation moments are scored from those looks and from the
  frame's gear, so on such a display they are the device's too - and so is the sheet, pass/fail included, for a look pressed within one step (a display faster than 60 Hz, or a jittery 60 Hz) or one frame (a frame longer than a step) of a rule's decision edge, as on base (round-8 verifier, C-KNIFEEDGE: 565 of 1,573 shifted-look rows split on at least one cadence, 555 of them only on a phone's cadence, 0.5 s or 0.25/0.4 s; in 1 ms steps across three fast-display edges 130 of 410 rows split on 144, 90, 165, 100 or 75 Hz, VRR or 60 Hz +- 1 ms, never at 120 or 240 Hz).
  (c) rapier's physical contacts (with any car,
  person or piece of world geometry it holds a collider for): rapier reports them once per frame after all of that
  frame's steps; whether one is graded is decided there from the two bodies' velocities, which body it was is named
  from the frame's drawn chassis pose (a stale pose can cost the name, never invent a contact), and the event is heard
  at the frame's first grid point. Contact with STAGED actors is decided on the grid as well, by the director's
  sentinel. (d) A pre-drive step confirmed on the checklist, a manual finish and an abort are stamped at the click with
  the later of the last tick's time and the wall clock since the shell mounted. (e) In the attempt trace: the
  `driveline` events and the «втори замах» annotation are stamped by the scene with the frame-end clock, and a
  sample's steering angle and pedal flags are the frame's. No score reads them.
- **Nothing is graded off the grid.** A frame in which the engine took no step (every other frame at 120 Hz) grades
  nothing; the looks it carried wait in the grid's queue and are heard at the grid points that follow, one per point,
  in order, each once. A long frame (a phone's 0.5 s = 30 points) is graded at every point inside it.
- **What the student sees while driving stays on the frame.** Actor poses are drawn interpolated between their last
  two grid states by the session clock's remainder, at most one step behind, the way rapier draws the student's car. The
  speedometer, HUD gap readouts, audio proximity and the coaching hints that grade nothing read the frame.
- **Staged-actor carry.** A staged car that reaches its path end, retires or re-enters inside a step carries the unused
  part of the step into the next segment (`staged.ts`), so its position is exact at grid points.
- **The frame-hook order is part of the contract.** The grade must run after rapier's stepper in the same frame. It
  does because RuntimeDriver is mounted inside `<Physics>` (the stepper is its first child) and neither carries a
  `useFrame` priority; both facts are source-pinned. With the order reversed nothing is repeated or skipped, but every
  step is graded one frame late.
- **The replay harness runs the product's clock, the product's grid and the product's way in for a look.**
  `liveChainReplay` adds every frame's clamped delta, the first included, and (having no rapier) grades the grid points
  the session time has passed, through the same `GradeGrid` - so it publishes the person-in-path distance and the
  near-miss stat exactly as the live lesson does, and folds each near miss into the session as the shell's handler does
  (at the last tick's position, dropped once the session has ended). The points are the same sequence rapier's steps
  give; which frame a point falls in can differ from rapier by one frame when a frame end lands within float noise of a
  grid point, which changes nothing graded. Since round 8 a tape's looks are presses: a press is latched in the cabin's
  own queue class by the frame whose end has reached it, the frame takes one as its glance, the grid takes the rest
  through `moreLooks`, the hook the scene passes - and the outcome says what became of every press (heard at
  which point, dropped, or left unheard). The attempt trace is fed by the scene's own function and scored as the shell
  scores it. WHAT THE HARNESS KEEPS IDEAL: the tape's car, gear and indicator are read at every grid point, where a live
  long frame gives every point in it the frame's one reading of the lever and the stalk. So on a long-frame cadence the
  replay can hear a look BEFORE a gear change the tape made earlier in the same frame - an order the product, which
  samples both by the frame, cannot produce (it is what the five cells named below show).

**Alternatives considered.**
1. Interpolate each trigger's crossing inside the frame. Rejected: every trigger kind needs its own crossing solver,
   the student's state inside a long frame is only a chord, and the rule engine's detectors are not triggers at all.
2. Sub-step only the staged world and leave the grade per frame (rounds 1-2). Refuted twice.
3. Fixed-step world, frame-end grade (round 3). Refuted: the phase between the student and the world is itself a
   platform-dependent signal; it made 60 Hz-class displays worse than base.
4. Grade at the frame end with the world interpolated to T. Rejected: sustain timers and stop / zone crossings would
   still see one sample per frame, and an interpolated world state is not a state any actor was in.
5. Cap the frame length or refuse to grade below some frame rate. Rejected: the row was filed from a phone whose frames
   ran 0.23-2.3 s; it would turn a grading defect into an availability defect.
6. Derive the live grid index from the session time and map it onto rapier's steps through an offset (round 4).
   Refuted: floor(T/H) and rapier's step count are two accumulators fed the same deltas, and they cross a step on
   different frames whenever a frame end lands within float noise of a grid point (in the model: 144 Hz, and 16.7 ms
   frames on 0.1 ms timestamps); any repair of the offset repeats or skips a car state.
7. Start the world one step in on the first frame, as base did for staged actors. Rejected: after a long first frame
   the world is that frame behind the car for the whole drive (9.18 m on one staged car after 0.5 s, on base too).
8. Keep the person-in-path measurement as a hook the scene hands in, and pin the hook's text (round 5). Refuted: a text
   pin holds the spelling it was written for; only what the grid measures itself is measured from the grid's pose.
9. Decide the session clock's origin from its remainder (round 5: drop whole steps when the remainder is at least one
   step plus an epsilon; the round-5 verifier's suggestion: an epsilon-biased floor). Rejected: a remainder of exactly
   one step is either one uncounted step or an accumulator a float hair under one step, and no threshold tells them
   apart - the first rule leaves the clock a whole step ahead in one case (50 of 709 model sessions), the second a
   whole step behind in the other (a first frame of 2/60 s less one ulp). Counting the engine's steps has neither.
10. Keep the after-step read in VehicleRig's closure and pin its text (rounds 5-6). Refuted: the closure sits beside
    `sampleRef`, and two rigs that read it passed 158 tests with the pinned line untouched. A function that is handed
    only the body and the sim has nothing else to read, and a callback that is one expression has no local to fill.
11. Leave the near-miss stat on the render frame and list it as frame-timed. Rejected: it is shown to the student, the
    detector is a pure function of a pose and the agents' states, and stepping it where the grade is stepped changes
    nothing about what a near miss is - at 60 Hz it finds the same encounters as a per-frame pass over the same pose.
12. Label grid point k with a running float sum of 1/60 s instead of k*FIXED_DT, so that a 60 Hz run reproduces base's
    clock bit for bit. Considered in round 7 for the one coached row that differs from base (below); not built. A sum
    made per grid point would be as cadence-independent as the product, but it reads 90 steps of 1/60 s as
    1.4999999999999147 s, so a 1.5 s dwell would complete one step late - which is the defect in base's number, not a
    property worth keeping - and base's value is what a harness fed exactly 1/60 s produces; a display's deltas are
    never that.
13. Keep one held look and deliver it at the next grid point (rounds 4-7). Refuted: a frame is not a grid point, and
    the second of two frames between points erased the first one's look (the first look of a two-key press lost on
    1,001 of 2,000 presses at 120 Hz, 1,168 at 144 Hz, 1,499 at 240 Hz in the verifier's model of the live entry).
14. A queue in the grid, the cabin still drained at one look per frame (the minimal repair, built and measured first in
    round 8). Rejected for what it does on a slow display, not for what it does on a fast one: every look is heard and
    nothing differs at 60 Hz or above, but inside frames longer than a step a look's wait is counted in frames - on the
    two-look census the second look was heard up to 58 grid points (0.97 s) LATER than at 60 Hz on a phone's cadence
    and a steady 0.5 s, and the last of a four-key burst 90 steps later. A late look is the harmful direction (it can
    bill a manoeuvre for an observation that was made). Handing over every look per frame removes the lateness and
    changes nothing at 60 Hz or above.
15. Stamp each look with the time of its press and hear it at the grid point of that time. Rejected: every other
    control a frame samples - the pedals, the lever, the stalk - acts from the frame's first step, so a look stamped
    0.3 s into a frame would be heard after a move-off whose pedal was pressed before it; it needs a wall-clock to
    session-time mapping through clamped and paused frames that nothing here can verify without a browser; and the
    driver pressed while looking at the previous frame's picture, which is the state the frame's first point follows.
16. Leave the attempt trace on the render frame and list the observation moments as frame-timed. Rejected: the feed is
    a pure function of the grid point's student state, and moving it changes nothing about what an observation moment
    is - at 60 Hz the scored moments are base's on all 2,434 cells. What remains frame-timed after the move is the
    look's own sampling, listed in (b) above.

**Consequences - what is identical, and under which clock.**
- **Round 8, with the looks going the product's way (the product's clock, first frame included).** For one
  session-time input tape with the student open loop, every committed demo x rung - 2,434 cells, with and
  without staged traffic, ambient on; 2,304 of them carry looks, 4,772 presses in all - against its own
  60 Hz run:
  (1) *On 120 Hz, 144 Hz and 90 Hz* every measure is identical on every cell: the sheet (codes, points, verdict, tasks,
  praise), what is shown beyond it (teach cards, coached rows, the lesson's mistake, near misses, the debrief text), the
  graded tick stream with its looks, the grid point every look was heard at, the staged and ambient poses, the signal
  state, the attempt trace sample for sample and event for event, the observation moments and the rubric.
  (2) *On a phone's recorded cadence, a steady 0.5 s, and a 0.5 s first frame then 60 Hz:* the sheet, everything shown,
  the tick stream without its look events, the poses, the signal state and the attempt trace's samples are identical on
  every cell; every look is heard, once, in order, none dropped. The grid point a look is heard at differs on
  1,055 / 1,049 / 31 cells (phone / 0.5 s / first frame): earlier by up to 29 points, never later.
  On one cell a long frame reaches and hears a press the 60 Hz run ends before (sc-maneuver-3point shadow-correct L1;
  nothing shown differs). The scored observation moments differ on five cells, on the phone's cadence and at 0.5 s:
  sc-park-gap-short mistake-forward-hit L1-L5 lose the moment `obs-during-reverse`. The tape presses three looks at
  one instant (30.333 s, grid point 1820), one point before its lever reads R. At 60 Hz they are heard at points
  1820-1822, and the third falls on the attempt trace's first sample in reverse (point 1822). Inside a 0.5 s frame all
  three are heard at the frame's first points (1801-1803), up to 0.35 s before the reverse phase - which the replay
  keeps at the tape's own grid point.
  (3) *Staged traffic with the ambient fleet off* (1,531 cells; 120 Hz, the phone, 0.5 s): at 120 Hz identical on every measure; on the phone's cadence and at 0.5 s the sheet, everything shown, the scored moments, the tick stream without its looks, the poses and the trace samples are identical on every cell, and a look is heard early on 720 / 714 cells (up to 29 points, never late).
  (4) *The remaining cadences of the earlier rounds* (59.94 Hz, 60 Hz +- 0.2 us, 60 Hz +- 1 ms, a PC jitter mix with a 0.98 s hitch, 1/60-1/20 s, the phone at its other phase, 0.25/0.4 s, 0.37 s, a 2 s stall), all 2,434 cells: on all nine the sheet, everything shown, the tick stream without its looks, the poses, the signal state and the trace samples are identical on every cell, every look is heard and none is heard late. 59.94 Hz and +- 0.2 us are identical on every measure. A look is heard early on 69 cells at +- 1 ms (one point), 698 at 1/60-1/20 s (up to 2 points), 879 on the PC mix (up to 29), 1,069 / 1,003 / 1,039 on the phone, 0.25/0.4 s and 0.37 s (up to 29 / 23 / 22) and 10 across the stall (up to 11). The scored moments differ on the same five cells and no other, on the five of these cadences with frames longer than a step that reach them (the PC mix, 1/60-1/20 s, the phone, 0.25/0.4 s, 0.37 s).
  (5) *Two looks pressed together and on consecutive frames.* Every committed demo that has two different looks less
  than 2 s apart (483 cells), those two pressed four ways - together on the grid; together 5 ms off the grid; on the
  grid and one 120 Hz frame apart; 5 ms off the grid and one 144 Hz frame apart - on 120 Hz, 144 Hz, 90 Hz, the phone's
  cadence and 0.5 s: ONE SHEET PER CELL on every cadence in all four (483 of 483 on each of the five cadences, in each of the four patterns), every look heard (2,051
  presses per pattern; none dropped, none unheard), everything shown identical. With the presses on the grid, 120, 144
  and 90 Hz are identical on every measure. With them 5 ms off the grid a look is heard one point early on 84 cells at
  144 Hz and 134 at 90 Hz (never at 120 Hz), and on the long-frame cadences up to 29 points early, never late. Scored
  moments differ on: with the presses on the grid (both patterns), sc-park-gap-short mistake-forward-hit L1-L5 on the phone's cadence and at 0.5 s (the five cells of (2)); with the presses 5 ms off the grid (both patterns), those five and sc-park-narrow mistake-wide-swing L1-L5 on 90 Hz, the phone's cadence and 0.5 s. On that tape the two looks are pressed 5 ms after grid point 1775, one point before the tape's lever reads R, and the attempt trace's first sample in reverse is point 1777: at 60 Hz the looks are heard at 1776 and 1777 and the second is credited as `obs-during-reverse`; a 90 Hz frame that brought point 1775 and then sampled the press hears them at 1775 and 1776, and neither is inside the reverse phase (the replay's ideal lever again: in the product that frame samples the lever too).
  The paragraph below is rounds 5-7's measurement, made with the harness's old look law (the tape's looks written into
  each grid point), kept for its cadences:
- **Identical under the replay harness's clock (the product's clock, first frame included).** For one session-time
  input tape with the student open loop, the graded tick stream (time, pose, speed, lead gap, the person-in-path
  distance, the signal state read, events), the staged poses, the ambient poses, the sheet, AND what the student is
  shown beyond the sheet (teach-moment codes, coached rows, the lesson's own mistake, every near miss with its time,
  kind, clearance and speed, and the whole debrief text) are the same as at 60 Hz on every cadence measured in round 7:
  1,531 of 1,531 committed demo x rung cells with staged traffic, ambient on and off, and 903 of 903 cells without
  staged traffic, on 4 cadences beside 60 Hz (a phone's recorded cadence; a steady 0.5 s; 120 Hz; a 0.5 s first frame
  then 60 Hz). A near miss occurs on 203 of the 1,531 cells with ambient on (244 near misses), 168 with ambient off
  (198) and 31 of the 903 (38). Round 6 measured the same cells on 6 cadences and round 5 on 20 (four first-frame
  lengths, a 7 s first frame, 144 / 90 / 59.94 Hz, 60 Hz +- 0.2 us and +- 1 ms, 1/60-1/20 s, 0.37 s, 0.25/0.4 s, a 2 s
  stall, a PC jitter mix, a second phone phase) on the graded measures only - not on the near misses or the debrief,
  which the harness could not then produce.
- **Identical in a model of the live wiring, not in a browser.** With rapier's accumulator copied from the installed
  bundle and the real recorder, session clock and grid classes, over 26 cadences x 120 s: every physics step is graded
  exactly once, in order, in the frame it was taken in, the car read at that step (0 repeated, 0 skipped, 0 backward
  states), the signal and traffic clocks at k/60 s at grid point k, and the session clock less (graded steps)/60 s
  equal to the engine's accumulator to 1 ns on every frame. On the round-5 verifier's 709 sessions (34 cadences with the
  listener on time, 675 with it one to three frames late) the same holds: the clock is never a whole step ahead or
  behind.
- **In the scene's and the rig's own code, executed.** The `gradeGrid.stepPhysics(...)` expression and the statement
  that makes its step source, cut out of LessonScene and run against a real grid, a real lesson world and a step record
  of a committed drive, on 6 cadences: every tick the lesson is handed is the car after its own physics step, the
  person-in-path distance and lead gap on it are measured from that car, and the near misses the shell's handler hears
  are the ones an independent detector finds from that car - although the frame's sample the call closes over is a
  different pose on every point. VehicleRig's after-step callback, cut out of VehicleRig.tsx and run under a copy of
  rapier's stepper on 5 cadences: every step is recorded once, as the body after that step and the sim's speed,
  whatever the frame's sample holds.
- **At 60 Hz with a one-step first frame, against base under the same clock - round 8.** Base's harness is given, as
  in round 7, the product's clock on frame 0, the person-in-path distance base's own LessonScene published and a model
  of base's NpcColliders near-miss pass; and now also BASE'S PRODUCT WAY IN FOR A LOOK (the cabin's queue as base's
  cabin.ts has it, one look per frame into `runtime.sample`) and base's per-frame attempt-trace feed, scored as the
  shell scores it. Against that, on all 2,434 cells (ambient on): sheets 0 changes; the looks heard: identical
  on every cell; the scored observation moments: identical on every cell; shown beyond the sheet: the eight cells of
  round 7 below and no other. One more shown line differs, which rounds 4-7 could not see because their harness did
  not score the rubric: on 20 cells the rubric's «Ориентировъчно време» line prints a whole second different from
  base (sc-signal-redyellow mistake-jump L3, L5; sc-crossing-slow-crosser mistake-too-fast L1, L3; sc-crossing-child-ball mistake-too-fast L3, L5; sc-sig-flash-amber-ped shadow-correct L4; sc-pe-zone-living mistake-city-speed L3; sc-merge-accel-lane mistake-stop-at-end L1-L5; sc-sp-eco-coast mistake-late-brake L1; sc-crossing-rain-sprint shadow-correct L4; sc-crossing-white-cane mistake-too-fast L1; sc-ln-turn-lane-arrows mistake-late-two-lanes L1, L2, L3, L5 - e.g. «51 с» against base's «50 с»). Stars and points are the same on all 20. On 16 of them the two runs grade the same number of points and the drive's duration differs in the 13th digit - the grid's k/60 (24.5 s) against base's float sum (24.49999999999989 s) - so a whole-second rounding inside that line falls the other way. On 4 (sc-signal-redyellow mistake-jump L3 and L5, sc-pe-zone-living mistake-city-speed L3, sc-sp-eco-coast mistake-late-brake L1) the session ends one grid point earlier on the grid than on base (1,626 against 1,627 points on the first), the point-count class disclosed since round 4. This is not something round 8 changed in what is graded - a tick has carried k/60 as its time since round 4 - but round 8 is the first round whose harness scores the rubric, so it is the first that could show it. The round-8 verifier re-ran base with an exact clock (t = frame/60, one line changed). Base then matched the tree on every measure over all 2,434 cells, so all 28 shown differences at 60 Hz (these 20 and round 7's eight) come from base's float-sum clock. On every cadence measured in round 8 the tree prints the same line as at 60 Hz.
  Against base's COMMITTED harness law for looks (the last look since the previous frame wins) - the cells that change
  because that harness dropped a look the product heard: it heard one look fewer on 434 cells (89 tapes); no sheet
  changes on any of them; the scored observation moments change on five (sc-park-gap-short mistake-forward-hit L1-L5:
  three looks at one instant, of which the old law kept the last - the tree and base's product path both credit
  `obs-before-reverse` and `obs-during-reverse`, the old law only the first).
  The rest of this bullet is round 7's text:
  Sheets: 0 changes on all 1,531 cells with staged traffic
  (ambient on and off) and all 903 without. What the student is shown beyond the sheet: 0 changes on the 903; on the
  1,531, eight cells, the same eight with ambient on and off:
  (i) sc-fo-brakelight-chain mistake-late-brake L1, L2, L3 and L5 show one more coached row, «Твърде малка дистанция
  при спиране в колона» (STANDSTILL_GAP_TOO_CLOSE; a teach card at L2, L3 and L5), with its two debrief lines. Codes,
  points, verdict, tasks and praise are unchanged. On each of the four rungs the car stands within the rule's 1.5 m of
  the lead (touching it at first, 0.58-0.72 m at the end) for 90 steps, from grid point 1527 to point 1617, which is
  the tape's last graded point; the rule is a 1.5 s dwell. On the grid that is 25.45 s to 26.95 s, 1.5 s, and the row
  is shown on that point; on base's float-summed clock it is 25.449999999999836 s to 26.94999999999975 s,
  1.4999999999999147 s, so base would show it one frame later - and the tape has ended. With the tape held one frame
  longer (91 intervals) base shows the same row and the two agree in everything shown (measured: all five rungs, hold
  0.02 s and 0.05 s).
  (ii) sc-crossing-child-ball mistake-collision L1, L2, L3 and L5: the one near miss (the child, clearance 0) is
  stamped one step earlier (11.767 s against 11.783 s at L1); count, clearance, speed and debrief are the same. This is
  the event-stamp class disclosed since round 3: the child is released on the grid point its release time falls on.
  Differences against base at 60 Hz that are not shown (re-counted in round 7, unchanged from round 6): the
  graded-point count in 268 cells (ambient on; 270 off; 288 without staged traffic), staged-pose digests in 601 (607
  off), ambient-pose digests in 97 (15 without staged traffic), and event stamps by up to 33 ms in 162 cells (163 off;
  up to 16.7 ms in 40 cells without staged traffic), with no event code gained or lost. The tick stream itself was not
  compared tick for tick against base: its full-precision hash differs on nearly every cell, as it must when the time
  label is k/60 as a product on the grid and a float sum on base.
- **The near-miss stat against base's PRODUCT at 60 Hz.** Base's product measured from the DRAWN chassis, which rapier
  draws up to one step behind the body, against traffic that had already taken the frame's step. With base's pass given
  the pose one frame behind (the far end of that range), on the 204 cells with a near miss in either run: 56 identical;
  66 differ only in the time stamp (one step later on base); 81 differ in clearance or peak speed - of the 244 paired
  encounters 218 agree within 1 cm, 16 within 1-3 cm, 10 within 3-6 cm (the largest 6.0 cm: 0.426 m on the grid, 0.366 m
  on base, sc-vu-emergency-junction mistake-race L3) - and five of those cells round to a different tenth in the
  debrief's sentence; on one cell the count differs, and with it the debrief (sc-turn-left-oncoming mistake-cut-gap L1:
  none on the grid, one at 0.065 m with the lagged pose - at 18.333 s the oncoming car has just reached 0.52 m/s, the
  stat's 0.5 m/s floor for a moving road user, and the bodies are 3 cm past «alongside» on the grid and 8 cm inside it
  with the car 0.11 m further back). The 0.72 m near miss the round-6 verifier quoted (the same demo at L3) is 0.723 m on the grid
  and 0.713 m with the lagged pose. Without staged traffic: 31 cells, same counts, every clearance within 0.6 cm.
  The grid's figure is the one measured from the car and the traffic at the same instant.
- **A replay-harness sheet that changed in round 6, at every rung.** sc-hz-accident-scene mistake-gawk-stop: against a
  harness that does not publish the person-in-path distance (base's committed one, and this lane's through round 5),
  L4 was billed ILLEGAL_STOP_IN_BAN_ZONE (3 pts) and is acquitted (0 pts; failed on its tasks either way), and L1, L2,
  L3 and L5 lose the teach card, the coached row and the lesson's own mistake of that code - their debrief changes from
  «не е взет: допусна „Спиране в забранена зона“ — точно грешката, която този урок учи» to «не е завършен — останаха
  неизпълнени задачите …». The cause is one: a bystander stands in the car's path at 1,223 / 1,168 / 1,182 / 1,140 /
  1,174 of the demo's graded points (L1-L5), the rule engine acquits a stop made for a person in the path, and base's
  product publishes that distance and acquits all five rungs too. Against the harness's clock before round 5 one more
  cell differs, as round 5 disclosed: sc-junction-left mistake-cut-gap L5 loses a COLLISION (20 -> 10 pts, failed
  either way); base under the product's clock gives this tree's sheet.
- **NOT claimed.** (1) A device that samples the driver's input once per long frame drives a different car: the car's
  trajectory, and so possibly the sheet, differs because the drive differed. The claim is: same car states at the grid
  points and the same looks heard at the same points, same sheet and same things shown. The looks are NOT always heard
  at the same points (item (b) of the frame-timed list): one point early at most on a display faster than 60 Hz, up to
  a frame early where a frame is longer than a step. For those the claim is what the census measured: the same sheet
  on every committed demo on every cadence measured, for the committed demos' own looks, the census's shifted presses and its paired presses; and the same things shown for the own and shifted looks - NOT for any look: a look pressed within one step or one frame of a rule's decision edge can get a different sheet, pass/fail included, on a different display, as on base (item (b)). The scored observation moments were the same on all
  but the five cells named (ten, with the two-look tapes pressed off the grid) in the builder's census; that list is not closed. The round-8 verifier found other cells differing with other press timings (sc-park-night mistake-no-lights at 60 Hz +- 1 ms, 75 Hz and VRR; sc-park-narrow mistake-wide-swing at 144, 90 and 75 Hz and VRR). With the lever frame-sampled as in the product, the five gap-short cells agree with 60 Hz and park-narrow differs instead. The claim is a class: observation moments scored from a look heard close to the edge of the phase they are scored against may differ by display, wherever a look can be heard earlier than at 60 Hz. Stars were the same on every cell measured. (2) The cabin's discrete channels and the pedals are read once per frame, so
  inside a long frame every grid point sees the frame's value; the auto-reverse assist, which shifts the gate from the
  frame's speed and pedals, is on that side too. (3) rapier's physical contacts are frame-timed as described above, and
  rapier's kinematic colliders for other cars still move once per frame (NpcColliders' collider pool, unchanged), so
  physical contact with an ambient car inside a long frame is against its last frame's pose. The replay harness has no
  rapier and stands in for it at grid points, so no census measures this. (4) Nothing here was measured in a browser:
  the length of a real device's first live frame, whether React registers rapier's step listener before the first
  animation frame, and the frame-hook order at run time are read from source, modelled, and (by the round-5 and round-6
  verifiers) run on the installed libraries headless with a stub renderer - not observed on a device. (5) The rig's
  callback is executed as an expression under a copy of rapier's stepper, not inside React: that
  `useAfterPhysicsStep` runs it after every step is rapier's contract, read from the installed bundle.
- **Cost (bench machine - an i7-6700 - not a phone; as run, not best-of).** NO BUDGET IS CLAIMED AS HELD.
  *Round 8 added to the per-point chain* one queue read (a shift or a null) and the attempt feed's call, and did not
  re-run the whole-chain bench. The feed alone, on a shared machine: 79-106 ns per grid point (9 runs of 2,000,000
  points into the real recorder; base's per-frame push in the same loop: 42-84 ns per call). At 60 Hz the product
  makes the same number of calls as before (one per frame became one per point); on 0.5 s frames it makes 30 per frame
  instead of one, about 3 us of bench CPU per frame. Rounds 6 and 7 follow as they were written.
  *Round 6's figures* (an otherwise idle machine; the tree BEFORE the near-miss meter joined the chain; six lessons, the
  two heaviest included, 50 runs each on the tree and 25 on base; the replay harness's whole chain - world, tick, lesson
  engine - with the harness building the world left out), against the two figures round 5 had stated: (a) *41.7 us per
  grid point* (1 % of session time at the 4x CPU throttle doc 91 uses as its phone stand-in). The mean over the runs
  was 26-44 us per point at 60 Hz (base at 60 Hz, per frame: 24.5-42.5 us). It was over on sc-ed-d2-priority-run L5
  (43.4-43.9 us, by 1.7-2.2; base 42.5, by 0.8) and sc-mw-emergency-lane L1 (42.1-43.6, by 0.4-1.9; base 40.3) and
  within on the other four (26-37 us); the slowest single run was over on five of the six (41.8-56.0 us). The tree
  measured 0.5-3.3 us per point above base at 60 Hz, and a point cost no more on a long frame than at 60 Hz. (b) *2 ms
  for any frame.* Not held. A phone-length frame of about 30 points cost 0.63-1.25 ms on average; the worst such frame
  of a run averaged 1.4-2.5 ms over the runs and in the worst of the 50 runs reached 3.3 / 7.3 ms (priority-run),
  2.5 / 8.0 ms (city-run), 2.4 / 2.5 ms (mw-emergency-lane), 2.9 / 2.4 ms (junction-rhr), 2.2 / 1.7 ms
  (follow-distance) and 2.1 / 2.1 ms (roundabout-entry): every lesson measured was over in some run. What pushed a
  frame over was a pause of about 0.6-1.2 ms landing in some point once or more per run; base has it too (its slowest
  single 60 Hz frame of a run averaged 0.68-1.06 ms and reached 1.8 ms; 5.1 ms on a long frame).
  *Round 7 added one pass per grid point - the near-miss meter - and measured it three ways.* (i) Alone, over each
  lesson's real agent arrays: 0.24-0.77 us per grid point (mean of 7 runs of 200,000 steps; 0.77 us with 12 vehicles
  and 15 pedestrians, 0.24 us with 1 and 4). (ii) In situ, paired: the same replay run alternately with the meter as
  built and with its step replaced by a no-op, 20 pairs per cell in one process, so both arms see the machine's load of
  the moment: +0.5 to +3.2 us per graded point (the heaviest lesson: +1.8 at 60 Hz, +3.2 on 0.5 s frames; the lightest
  +0.5 to +0.9; standard errors 0.2-0.9 us). (iii) The whole chain again - but this round the machine was shared with
  other work, and base itself read 52.6-54.6 us per point on the heaviest lesson at 60 Hz where it had read 42.5 in
  round 6. This round's whole-chain figures are therefore NOT comparable with round 6's and are not offered in their
  place. Side by side under that load (three pairs of 25 runs, base and tree running at the same time), tree against
  base at 60 Hz, mean per point: 58.1-60.6 against 52.6-54.6 us on sc-ed-d2-priority-run L5 (+5.5 to +6.0), 49.1-49.9
  against 43.0-45.0 on city-run (+4.9 to +6.2), 47.3-48.6 against 42.3-43.2 on junction-rhr (+4.1 to +6.3), 53.6-55.5
  against 53.0-53.5 on mw-emergency-lane (+0.6 to +2.0), 31.3-34.7 against 29.1-31.1 on follow-distance (+0.8 to
  +3.6), 33.0-46.4 against 35.2-48.9 on roundabout-entry (-1.5 to -2.5). How much of the wider gap on three of those
  lessons is the meter and how much is the load, this round's data cannot say: a whole-chain A/B on a quiet machine,
  with the meter in the chain, is owed. In the live product at 60 Hz the pass is not new - NpcColliders ran it once per
  frame and no longer does; the replay harness never ran it, so the bench gains it where the product only moves it.
  What the design costs that base did not, on a phone running 0.5 s frames: the meter runs 30 times in a frame instead
  of once (about 25-95 us of bench CPU per frame on the heaviest lesson, from (i) and (ii)), on top of round 6's
  figure - 60 graded points a second instead of 2 frames, about 2.5 ms of bench CPU per second of driving against
  base's 0.19 ms on the heaviest lesson, roughly 1 % of the phone's time at 4x against 0.1 %. No test pins any of
  this, and nothing was measured on a phone.
- `traces/recorder.ts` and the clip capture feed still call `traffic.update(1/60)` directly with no session time; at
  exactly 1/60 that legacy path gives the same sheets, so no committed trace was re-recorded. That chain has never
  published the person-in-path distance or a near miss and still does not.
- The traffic system's and the director's multi-point paths (several grid points inside one update) are not reached by
  the live lesson, which hands them one point at a time; they remain for a caller that passes a long dt and are pinned
  by clock- and director-level tests.
- Boundaries: `scene/gradeGrid.ts` owns the order of the graded chain, the car's pose at a grid point and every
  measurement taken from that pose (`scene/nearMissMeter.ts` is its near-miss stat); `traffic/playerTrack.ts` owns the
  step record and the one function that writes it; `VehicleRig` calls that function after every physics step and does
  nothing else there; `LessonScene` hands the grid the world and the cabin, may not call `runtime.sample` or
  `stepFrame`, and may not read the frame's pose, heading or speed anywhere in that call; `NpcColliders` owns rapier's
  collider pool only (tree pins and the executed rig callback in `scene/__tests__/live-grid-wiring.test.ts`, the
  executed scene call in `lessons/scenario/__tests__/live-grade-call.execution.test.ts`, the publisher's address in
  `orchestrator/__tests__/vru-ahead-publisher.test.ts`). Round 8: `scene/gradeGrid.ts` also owns the queue of looks
  and which grid point hears each; `scene/cabin.ts` owns the latch (`GlanceSampleQueue`) and is drained by the sample
  builder (`scene/vehicleSample.ts`) and by the grid's `moreLooks` hook and by nothing else, and is emptied by `forgetPendingGlances` on a respawn; `scene/attemptFeed.ts` is the one feed of the
  attempt trace's samples, looks and indicator edges, called per graded point by the scene and by the replay harness;
  `LessonScene` owns the grid's lifetime and resets it in `resetCar`.
- Owed: a drive of the live wiring in a real browser on a phone and on a 120/144 Hz display, with the first live
  frame's length and the step count of that frame logged - and, since round 8, a two-key look pressed on a 120/144 Hz
  display and inside a phone's long frame, with the ticks that heard each look logged. Also owed after the round-8 sign-off: that grid points equal physics steps has not been observed live (no step counter is published); a quiet-machine whole-chain cost A/B and a phone frame-time reading; and the replay harness still keeps the lever and the stalk ideal per grid point, while the product samples them per frame.
